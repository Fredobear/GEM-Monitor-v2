// Dane do wyceny portfela w PLN: kursy NBP, indeksy cen instrumentów z XTB i wzorce do porównań.
// Historia narasta z każdym uruchomieniem (poprzedni plik jest łączony z nowymi danymi).
import { fetchWithRetry } from './lib/http.js';
import { valueOnOrBefore } from './lib/series.js';
import { addDays, toISO, monthOf } from './lib/dates.js';
import { alphaVantageDaily } from './providers/alphavantage.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NBP_CHUNK_DAYS = 90; // API NBP przyjmuje zakres do 93 dni
export const FX_CODES = ['USD', 'EUR', 'GBP'];

const toPairs = (series) => series.map((p) => [p.date, p.value]);
const toSeries = (pairs) => pairs.map(([date, value]) => ({ date, value }));
const round = (x, digits = 6) => Number(x.toPrecision(digits + 2));

// Łączy pary [data, wartość]; nowsze dane mają pierwszeństwo.
export function mergePairs(older = [], newer = []) {
  const map = new Map(older);
  for (const [d, v] of newer) map.set(d, v);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// Łączy dwie wersje tego samego indeksu o różnej skali (np. po korekcie o dywidendę u dostawcy):
// starszą część przeskalowuje tak, by w pierwszym wspólnym dniu zgadzała się z nową.
export function chainLink(older = [], newer = []) {
  if (!older.length) return newer;
  if (!newer.length) return older;
  const oldMap = new Map(older);
  const overlap = newer.find(([d]) => oldMap.has(d));
  if (!overlap) return mergePairs(older, newer);
  const factor = overlap[1] / oldMap.get(overlap[0]);
  const head = older.filter(([d]) => d < overlap[0]).map(([d, v]) => [d, round(v * factor)]);
  return [...head, ...newer];
}

export async function nbpRates(code, from, to) {
  const out = [];
  for (let start = from; start <= to; start = addDays(start, NBP_CHUNK_DAYS + 1)) {
    const end = addDays(start, NBP_CHUNK_DAYS) < to ? addDays(start, NBP_CHUNK_DAYS) : to;
    const res = await fetchWithRetry(`https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/${start}/${end}/?format=json`, { label: `NBP ${code}` });
    if (res.status === 404) continue; // brak notowań w zakresie (np. same święta)
    if (!res.ok) throw new Error(`NBP ${code}: HTTP ${res.status}`);
    const json = await res.json();
    for (const r of json.rates) out.push([r.effectiveDate, r.mid]);
  }
  return out;
}

async function loadFx(previous, startDate, today) {
  const fx = {};
  for (const code of FX_CODES) {
    const prev = previous?.fx?.[code] ?? [];
    const from = prev.length ? addDays(prev[prev.length - 1][0], -7) : startDate;
    fx[code] = mergePairs(prev, await nbpRates(code, from, today));
  }
  return fx;
}

// Cena w walucie instrumentu z ETF-u-proxy notowanego w USD: proxy × USD/PLN ÷ WALUTA/PLN.
function convertFromUsd(proxySeries, currency, fx) {
  if (currency === 'USD') return proxySeries.map((p) => [p.date, round(p.value)]);
  const usd = toSeries(fx.USD);
  const other = toSeries(fx[currency] ?? []);
  const out = [];
  for (const p of proxySeries) {
    const u = valueOnOrBefore(usd, p.date);
    const o = valueOnOrBefore(other, p.date);
    if (u && o) out.push([p.date, round((p.value * u.value) / o.value)]);
  }
  return out;
}

// Indeks wartości w PLN: kolejne dni z ceną proxy w USD i kursem USD/PLN.
function plnIndex(dailyReturnsAt, dates, fxUsd) {
  const usd = toSeries(fxUsd);
  const out = [];
  let level = 100;
  let prevFx = null;
  for (const d of dates) {
    const f = valueOnOrBefore(usd, d)?.value;
    if (!f) continue;
    const r = dailyReturnsAt(d);
    if (prevFx !== null && r !== null) level *= (1 + r) * (f / prevFx);
    prevFx = f;
    out.push([d, round(level)]);
  }
  return out;
}

function dailyReturnLookup(series) {
  const byDate = new Map();
  for (let i = 1; i < series.length; i++) byDate.set(series[i].date, series[i].value / series[i - 1].value - 1);
  return (d) => byDate.get(d) ?? null;
}

// Wzorce: S&P 500 w PLN oraz model GEM w PLN (pozycja z sygnału na dany miesiąc, bez kosztów).
function buildBenchmarks({ market, signals, fx }) {
  const us = market.series.US;
  if (!us?.length || !fx.USD?.length) return {};
  const dates = us.map((p) => p.date);
  const benchmarks = { sp500: plnIndex(dailyReturnLookup(us), dates, fx.USD) };
  if (signals?.history?.length) {
    const holding = new Map(signals.history.map((h) => [h.forMonth, h.asset]));
    holding.set(signals.official.forMonth, signals.official.decision.asset);
    const lookups = Object.fromEntries(Object.entries(market.series).map(([k, s]) => [k, dailyReturnLookup(s)]));
    const first = signals.history[0].forMonth;
    const gemDates = dates.filter((d) => monthOf(d) >= first);
    benchmarks.gem = plnIndex((d) => {
      const asset = holding.get(monthOf(d));
      return asset && lookups[asset] ? lookups[asset](d) : null;
    }, gemDates, fx.USD);
  }
  return benchmarks;
}

export async function buildPrices({ config, market, signals, previous, env = process.env, now = new Date() }) {
  const today = toISO(now);
  const startDate = config.portfolio.historyStart;
  const warnings = [];
  const fx = await loadFx(previous, startDate, today);

  const instruments = {};
  let avCalls = 0;
  for (const [ticker, inst] of Object.entries(config.portfolio.instruments)) {
    const prev = previous?.instruments?.[ticker];
    const proxy = market.series[inst.proxy];
    const fresh = proxy?.length ? convertFromUsd(proxy.filter((p) => p.date >= startDate), inst.currency, fx) : [];
    const entry = {
      name: inst.name,
      currency: inst.currency,
      basis: `indeks ${config.assets[inst.proxy]?.proxy ?? inst.proxy} przeliczony na ${inst.currency}`,
      series: chainLink(prev?.series, fresh),
      quotes: prev?.quotes ?? [],
    };
    if (inst.av && env.ALPHAVANTAGE_API_KEY) {
      try {
        if (avCalls++ > 0) await sleep(13000);
        entry.quotes = mergePairs(entry.quotes, toPairs(await alphaVantageDaily(inst.av, env.ALPHAVANTAGE_API_KEY)));
      } catch (err) {
        warnings.push(`Ceny ${ticker} z Alpha Vantage niedostępne (${err.message}) – wycena według indeksu.`);
      }
    }
    if (!entry.series.length) warnings.push(`Brak danych do wyceny ${ticker}.`);
    instruments[ticker] = entry;
  }

  return { updatedAt: now.toISOString(), fx, instruments, benchmarks: buildBenchmarks({ market, signals, fx }), warnings };
}
