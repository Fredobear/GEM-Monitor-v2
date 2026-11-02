// Panel ryzyka rynkowego z oficjalnych źródeł (FRED, NBP). Kontekst do sygnału – nie zmienia decyzji GEM.
import { fredSeries } from './providers/fred.js';
import { fetchWithRetry } from './lib/http.js';
import { valueOnOrBefore } from './lib/series.js';
import { addDays, shiftMonthsISO, toISO } from './lib/dates.js';

const level = (cond, ok, mid, warn, bad) => (cond <= 0 ? ok : cond === 1 ? mid : cond === 2 ? warn : bad);
const num = (x, digits) => x.toFixed(digits).replace('.', ',');
const signedPct = (x) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 1)}%`;

function pctChange(series, months) {
  const last = series[series.length - 1];
  const base = valueOnOrBefore(series, shiftMonthsISO(last.date, -months));
  return base ? last.value / base.value - 1 : null;
}

function percentile(values, x) {
  const below = values.filter((v) => v <= x).length;
  return below / values.length;
}

const INDICATORS = [
  {
    id: 'VIXCLS',
    name: 'VIX – „indeks strachu”',
    describe(series) {
      const v = series[series.length - 1].value;
      const tier = v < 15 ? 0 : v < 25 ? 1 : v < 35 ? 2 : 3;
      return { value: num(v, 1), tier, comment: level(tier, 'spokój na rynku', 'umiarkowana nerwowość', 'podwyższony strach', 'panika') };
    },
  },
  {
    id: 'BAMLH0A0HYM2',
    name: 'Spread obligacji śmieciowych (USA)',
    describe(series) {
      const v = series[series.length - 1].value;
      const tier = v < 3.5 ? 0 : v < 5 ? 1 : v < 7 ? 2 : 3;
      return { value: `${num(v, 2)} pp`, tier, comment: level(tier, 'niski stres kredytowy', 'umiarkowany stres', 'wysoki stres kredytowy', 'stres kryzysowy') };
    },
  },
  {
    id: 'T10Y3M',
    name: 'Krzywa rentowności USA (10L − 3M)',
    describe(series) {
      const v = series[series.length - 1].value;
      const tier = v >= 0.5 ? 0 : v >= 0 ? 1 : 2;
      return { value: `${num(v, 2)} pp`, tier, comment: level(tier, 'normalna', 'płaska', 'odwrócona – historycznie zapowiadała recesje') };
    },
  },
  {
    id: 'USEPUINDXD',
    name: 'Niepewność polityki gospodarczej USA (EPU)',
    describe(series) {
      const last30 = series.slice(-30).map((p) => p.value);
      const avg = last30.reduce((a, b) => a + b, 0) / last30.length;
      const window = [];
      for (let i = 29; i < series.length; i++) window.push(series.slice(i - 29, i + 1).reduce((a, p) => a + p.value, 0) / 30);
      const pct = percentile(window, avg);
      const tier = pct < 0.5 ? 0 : pct < 0.8 ? 1 : pct < 0.95 ? 2 : 3;
      return { value: num(avg, 0), tier, comment: `${level(tier, 'niska', 'podwyższona', 'wysoka', 'skrajnie wysoka')} (percentyl ${Math.round(pct * 100)} z 5 lat, średnia 30 dni)` };
    },
  },
  {
    id: 'DTWEXBGS',
    name: 'Dolar amerykański (indeks szeroki), zmiana 3M',
    describe(series) {
      const ch = pctChange(series, 3);
      const tier = Math.abs(ch) < 0.03 ? 0 : Math.abs(ch) < 0.06 ? 1 : 2;
      const dir = ch >= 0 ? 'dolar się umacnia (zwykle sprzyja USA względem reszty świata)' : 'dolar słabnie (zwykle sprzyja rynkom poza USA)';
      return { value: signedPct(ch), tier, comment: tier === 0 ? 'stabilny' : dir };
    },
  },
  {
    id: 'DCOILWTICO',
    name: 'Ropa WTI, zmiana 1M',
    describe(series) {
      const ch = pctChange(series, 1);
      const tier = Math.abs(ch) < 0.1 ? 0 : Math.abs(ch) < 0.2 ? 1 : 2;
      const comment = tier === 0 ? 'stabilnie' : ch > 0 ? 'gwałtowny wzrost (możliwy szok podażowy lub geopolityczny)' : 'gwałtowny spadek (słabszy popyt lub nadpodaż)';
      return { value: signedPct(ch), tier, comment };
    },
  },
];

async function nbpUsdPln() {
  // 255 notowań (limit API NBP) ≈ 12 miesięcy sesji.
  const res = await fetchWithRetry('https://api.nbp.pl/api/exchangerates/rates/a/usd/last/255/?format=json', { label: 'NBP USD/PLN' });
  if (!res.ok) throw new Error(`NBP USD/PLN: HTTP ${res.status}`);
  const json = await res.json();
  return json.rates.map((r) => ({ date: r.effectiveDate, value: r.mid }));
}

export async function loadMacro(now = new Date()) {
  const start = addDays(toISO(now), -6 * 366);
  const results = await Promise.allSettled(
    INDICATORS.map(async (ind) => {
      const series = await fredSeries(ind.id, start);
      return { id: ind.id, name: ind.name, date: series[series.length - 1].date, ...ind.describe(series) };
    }),
  );
  const indicators = [];
  const errors = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? indicators.push(r.value) : errors.push(`${INDICATORS[i].id}: ${r.reason.message}`)));

  let usdpln = null;
  try {
    const s = await nbpUsdPln();
    const last = s[s.length - 1];
    usdpln = { date: last.date, rate: last.value, change12m: last.value / s[0].value - 1 };
  } catch (err) {
    errors.push(err.message);
  }

  const stress = indicators.filter((i) => i.tier >= 2).length;
  const summary = stress === 0 ? 'Wskaźniki ryzyka w normie.' : stress === 1 ? 'Jeden wskaźnik ryzyka podwyższony – warto obserwować.' : `${stress} wskaźniki ryzyka podwyższone – rynek w trybie podwyższonej nerwowości.`;
  return { indicators, usdpln, stress, summary, errors };
}
