// Przegląd rynków (zakładka Rynki → Przegląd): notowania świata, termometr nastroju, statystyka historyczna,
// kalendarz wydarzeń i notatka rynkowa. Dane z darmowych, oficjalnych źródeł:
//  • FRED (Bank Rezerwy Federalnej w St. Louis): S&P 500, Nasdaq, rentowności obligacji USA, ropa Brent, EUR/USD,
//  • Tiingo (ten sam klucz co dla GEM): ETF-y śledzące rynki świata, złoto i bitcoin – z biblioteki instrumentów,
//  • GPW (archiwum notowań): WIG20, WIG, mWIG40, sWIG80 i indeks obligacji skarbowych TBSP,
//  • NBP: kursy złotego.
// Notatka powstaje z reguł (zawsze), a gdy ustawiono ANTHROPIC_API_KEY – dodatkowo pisze ją Claude (src/ai.js).
// To kontekst edukacyjny: nie zmienia mechanicznego sygnału GEM i nie jest rekomendacją inwestycyjną.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fredSeries } from './providers/fred.js';
import { tiingoDaily } from './providers/tiingo.js';
import { fetchWithRetry } from './lib/http.js';
import { readXls } from './xls.js';
import { addDays, addMonths, lastDayOfMonth, monthOf, toISO } from './lib/dates.js';
import { mergePairs } from './prices.js';
import { compactPairs, gpwUrl } from './instruments.js';

// ---------- Lista rynków ----------
// kind: index/etf/price – zmiana w %, yield – zmiana w punktach procentowych, fx – kurs walutowy (zmiana w %).
export const WORLD = [
  { key: 'SPX', name: 'S&P 500', short: 'S&P 500', group: 'Akcje USA', src: 'fred', id: 'SP500', kind: 'index' },
  { key: 'NDQ', name: 'Nasdaq Composite', short: 'Nasdaq', group: 'Akcje USA', src: 'fred', id: 'NASDAQCOM', kind: 'index' },
  { key: 'RUT', name: 'Małe spółki USA (Russell 2000, ETF IWM)', short: 'małe spółki USA', group: 'Akcje USA', src: 'proxy', id: 'IWM', kind: 'etf' },
  { key: 'ACWI', name: 'Akcje świata (MSCI ACWI, ETF VT)', short: 'akcje świata', group: 'Akcje świat', src: 'proxy', id: 'VT', kind: 'etf' },
  { key: 'EUR', name: 'Europa (MSCI Europe, ETF IEUR)', short: 'Europa', group: 'Akcje świat', src: 'proxy', id: 'IEUR', kind: 'etf' },
  { key: 'JPN', name: 'Japonia (MSCI Japan, ETF EWJ)', short: 'Japonia', group: 'Akcje świat', src: 'proxy', id: 'EWJ', kind: 'etf' },
  { key: 'EM', name: 'Rynki wschodzące (MSCI EM, ETF EEM)', short: 'rynki wschodzące', group: 'Akcje świat', src: 'proxy', id: 'EEM', kind: 'etf' },
  { key: 'WIG20', name: 'WIG20', short: 'WIG20', group: 'Polska', src: 'gpw', id: 'WIG20', kind: 'index' },
  { key: 'WIG', name: 'WIG (cały rynek)', short: 'WIG', group: 'Polska', src: 'gpw', id: 'WIG', kind: 'index' },
  { key: 'MWIG40', name: 'mWIG40 (średnie spółki)', short: 'mWIG40', group: 'Polska', src: 'gpw', id: 'MWIG40', kind: 'index' },
  { key: 'SWIG80', name: 'sWIG80 (małe spółki)', short: 'sWIG80', group: 'Polska', src: 'gpw', id: 'SWIG80', kind: 'index' },
  { key: 'TBSP', name: 'Obligacje skarbowe PL (indeks TBSP)', short: 'polskie obligacje', group: 'Polska', src: 'gpw', id: 'TBSP.INDEX', kind: 'index', bond: true },
  { key: 'US10', name: 'Rentowność obligacji USA 10 lat', short: 'rentowność 10-letnich obligacji USA', group: 'Stopy i obligacje', src: 'fred', id: 'DGS10', kind: 'yield' },
  { key: 'US2', name: 'Rentowność obligacji USA 2 lata', short: 'rentowność 2-letnich obligacji USA', group: 'Stopy i obligacje', src: 'fred', id: 'DGS2', kind: 'yield' },
  { key: 'TLT', name: 'Obligacje USA 20+ lat (ETF TLT)', short: 'długie obligacje USA', group: 'Stopy i obligacje', src: 'proxy', id: 'TLT', kind: 'etf', bond: true },
  { key: 'GOLD', name: 'Złoto (ETF GLD)', short: 'złoto', group: 'Surowce i krypto', src: 'proxy', id: 'GLD', kind: 'etf', commodity: true },
  { key: 'BRENT', name: 'Ropa Brent (USD za baryłkę)', short: 'ropa Brent', group: 'Surowce i krypto', src: 'fred', id: 'DCOILBRENTEU', kind: 'price', commodity: true },
  { key: 'BTC', name: 'Bitcoin (ETF IBIT)', short: 'bitcoin', group: 'Surowce i krypto', src: 'proxy', id: 'IBIT', kind: 'etf', commodity: true },
  { key: 'EURPLN', name: 'EUR/PLN', short: 'EUR/PLN', group: 'Waluty', src: 'nbp', id: 'EUR', kind: 'fx' },
  { key: 'USDPLN', name: 'USD/PLN', short: 'USD/PLN', group: 'Waluty', src: 'nbp', id: 'USD', kind: 'fx' },
  { key: 'EURUSD', name: 'EUR/USD', short: 'EUR/USD', group: 'Waluty', src: 'fred', id: 'DEXUSEU', kind: 'fx' },
];
const EQUITY_GROUPS = new Set(['Akcje USA', 'Akcje świat', 'Polska']);
const isEquity = (r) => EQUITY_GROUPS.has(r.group) && !r.bond;

// ---------- Wskaźniki dla jednej serii ----------
// Ostatnia para z datą ≤ iso, ale nie starsza niż maxGap dni od iso (inaczej null – brak danych z tego okresu).
function pairNear(pairs, iso, maxGap) {
  let lo = 0;
  let hi = pairs.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][0] <= iso) {
      found = pairs[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (!found) return null;
  return (Date.parse(iso) - Date.parse(found[0])) / 86400000 <= maxGap ? found : null;
}

const round = (x, d = 6) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Zmiany (1 sesja, tydzień, miesiąc, od początku roku, rok), szczyt 52 tygodni i trend dla serii [[data, wartość]]. */
export function seriesMetrics(pairs, kind = 'index') {
  if (!pairs?.length) return null;
  const n = pairs.length;
  const [date, last] = pairs[n - 1];
  const yieldLike = kind === 'yield';
  const change = (base) => (base ? (yieldLike ? last - base[1] : last / base[1] - 1) : null);
  const prevYearEnd = pairNear(pairs, `${Number(date.slice(0, 4)) - 1}-12-31`, 12);
  const year = pairs.filter(([d]) => d > addDays(date, -365));
  const high = Math.max(...year.map((p) => p[1]));
  const low = Math.min(...year.map((p) => p[1]));
  // Szczyt z 52 tygodni ma sens tylko przy dziennych notowaniach (nie z samych końców miesięcy).
  const dailyYear = year.length >= 150;
  let trend = null;
  let trendBasis = null;
  if (kind === 'index' || kind === 'etf' || kind === 'price') {
    const recent = pairs.filter(([d]) => d > addDays(date, -320));
    if (recent.length >= 200) {
      const sma = recent.slice(-200).reduce((s, p) => s + p[1], 0) / 200;
      trend = last >= sma ? 'up' : 'down';
      trendBasis = 'średnia 200 sesji';
    } else {
      // Za mało dziennych notowań (np. świeża historia indeksów GPW): średnia z 10 ostatnich końców miesięcy.
      const ends = new Map();
      for (const [d, v] of pairs) if (d.slice(0, 7) < date.slice(0, 7)) ends.set(d.slice(0, 7), v);
      const lastEnds = [...ends.values()].slice(-10);
      if (lastEnds.length >= 10) {
        trend = last >= lastEnds.reduce((s, v) => s + v, 0) / 10 ? 'up' : 'down';
        trendBasis = 'średnia 10 miesięcy';
      }
    }
  }
  return {
    date,
    last: round(last, 4),
    d1: round(n > 1 && (Date.parse(date) - Date.parse(pairs[n - 2][0])) / 86400000 <= 5 ? change(pairs[n - 2]) : null),
    w1: round(change(pairNear(pairs, addDays(date, -7), 6))),
    m1: round(change(pairNear(pairs, addDays(date, -30), 10))),
    ytd: round(prevYearEnd && prevYearEnd[0] < `${date.slice(0, 4)}-01-01` ? change(prevYearEnd) : null),
    y1: round(change(pairNear(pairs, addDays(date, -365), 20))),
    high52: dailyYear ? round(high, 4) : null,
    low52: dailyYear ? round(low, 4) : null,
    fromHigh: yieldLike || kind === 'fx' || !dailyYear ? null : round(last / high - 1),
    trend,
    trendBasis,
  };
}

// ---------- GPW: indeksy ----------
const isXls = (buf) => buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
const GPW_INDEX_TYPE = 1;

/** Arkusz z archiwum GPW (typ 1 – indeksy) → Map(NAZWA → { close, date }). */
export function parseGpwIndices(rows) {
  const head = (rows[0] ?? []).map((h) => String(h ?? '').toLowerCase());
  const cName = head.findIndex((h) => h === 'nazwa');
  const cClose = head.findIndex((h) => /zamkni/.test(h));
  const cDate = head.findIndex((h) => h === 'data');
  const out = new Map();
  if (cName < 0 || cClose < 0) return out;
  for (const r of rows.slice(1)) {
    const name = String(r[cName] ?? '').trim().toUpperCase();
    const close = Number(r[cClose]);
    if (name && close > 0) out.set(name, { close, date: String(r[cDate] ?? '').slice(0, 10) });
  }
  return out;
}

async function gpwIndexSession(date, fetchImpl) {
  const res = await fetchImpl(gpwUrl(GPW_INDEX_TYPE, date), { label: `GPW indeksy ${date}`, retries: 1 });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!isXls(buf)) return null; // dzień bez sesji albo notowania jeszcze nieopublikowane
  const map = parseGpwIndices(readXls(buf)[0]?.rows ?? []);
  return map.size ? map : null;
}

const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

/**
 * Historia indeksów GPW w stanie aplikacji: ostatnia sesja codziennie, a brakujące końce miesięcy (13 mies.)
 * i punkt sprzed tygodnia – jednorazowo, z limitem zapytań.
 */
export async function updateGpwIndices(history = {}, today, { fetchImpl = fetchWithRetry, maxCalls = 30, pauseMs = 250 } = {}) {
  const ids = WORLD.filter((w) => w.src === 'gpw').map((w) => w.id);
  const out = Object.fromEntries(ids.map((id) => [id, history[id] ?? []]));
  const warnings = [];
  let calls = 0;
  const absorb = (map) => {
    for (const id of ids) {
      const q = map.get(id);
      if (q?.date) out[id] = mergePairs(out[id], [[q.date, q.close]]);
    }
  };
  const tryDate = async (start, back = 6) => {
    for (let i = 0; i <= back && calls < maxCalls; i++) {
      const d = addDays(start, -i);
      if (isWeekend(d)) continue;
      if (pauseMs && calls) await new Promise((r) => setTimeout(r, pauseMs));
      calls++;
      const map = await gpwIndexSession(d, fetchImpl);
      if (map) {
        absorb(map);
        return d;
      }
    }
    return null;
  };
  const have = (from, to) => (out.WIG20 ?? []).some(([d]) => d >= from && d <= to);
  try {
    const latest = await tryDate(today);
    if (!latest) {
      // Archiwum niedostępne (albo zmieniło format) – nie próbujemy uzupełniać historii.
      warnings.push('GPW: brak notowań indeksów z ostatnich dni.');
      for (const id of ids) out[id] = compactPairs(out[id], { days: 400, months: 36 });
      return { history: out, calls, warnings };
    }
    if (!have(addDays(today, -12), addDays(today, -5))) await tryDate(addDays(today, -7), 4);
    for (let m = 1; m <= 13 && calls < maxCalls; m++) {
      const month = addMonths(monthOf(today), -m);
      if (!have(`${month}-01`, lastDayOfMonth(month)) || !have(addDays(lastDayOfMonth(month), -6), lastDayOfMonth(month))) await tryDate(lastDayOfMonth(month), 6);
    }
  } catch (err) {
    warnings.push(`GPW (indeksy): ${err.message}`);
  }
  for (const id of ids) out[id] = compactPairs(out[id], { days: 400, months: 36 });
  return { history: out, calls, warnings };
}

// ---------- Rynki świata ----------
const toPairs = (series) => series.map((p) => [p.date, p.value]);

/**
 * Tabela rynków świata. proxies – dzienne notowania ETF-ów z biblioteki (notowania.proxies),
 * fx – kursy NBP (prices.fx), gpw – historia indeksów GPW.
 */
export async function loadWorldMarkets({ now = new Date(), proxies = {}, fx = {}, gpw = {}, fred = fredSeries } = {}) {
  const today = toISO(now);
  const start = addDays(today, -420);
  const warnings = [];
  const fredDefs = WORLD.filter((w) => w.src === 'fred');
  const fredData = await Promise.allSettled(fredDefs.map((w) => fred(w.id, start)));
  const fredPairs = {};
  fredData.forEach((r, i) => (r.status === 'fulfilled' ? (fredPairs[fredDefs[i].id] = toPairs(r.value)) : warnings.push(`FRED ${fredDefs[i].id}: ${r.reason.message}`)));
  const rows = [];
  for (const w of WORLD) {
    const pairs = w.src === 'fred' ? fredPairs[w.id] : w.src === 'proxy' ? proxies[w.id] : w.src === 'nbp' ? fx[w.id] : gpw[w.id];
    const m = seriesMetrics((pairs ?? []).filter(([d]) => d <= today), w.kind);
    if (!m) continue;
    rows.push({ key: w.key, name: w.name, short: w.short, group: w.group, kind: w.kind, src: w.src, bond: Boolean(w.bond), ...m });
  }
  return { asOf: rows.reduce((d, r) => (r.date > d ? r.date : d), ''), rows, warnings };
}

// ---------- Termometr nastroju ----------
export const STANCES = {
  sprzyjajace: { label: 'sprzyjające', tone: 'pos', text: 'Warunki sprzyjają akcjom: trendy są wzrostowe, a stres na rynku niski.' },
  neutralne: { label: 'neutralne', tone: 'mid', text: 'Sygnały są mieszane: część wskaźników zachęca, część ostrzega.' },
  ostrozne: { label: 'ostrożne', tone: 'warn', text: 'Ryzyko krótkoterminowe jest podwyższone: rośnie zmienność albo słabną trendy.' },
  defensywne: { label: 'defensywne', tone: 'neg', text: 'Rynek jest w trybie stresu: trendy spadkowe i wysoka zmienność.' },
};

/** Ocena warunków rynkowych z kilku prostych wskaźników (każdy daje −2…+1 pkt). */
export function marketStance({ world, macro, signals, config }) {
  const factors = [];
  const add = (label, score, detail) => factors.push({ label, score, detail });
  const rows = world?.rows ?? [];
  const spx = rows.find((r) => r.key === 'SPX');
  const pct = (x) => `${x < 0 ? '−' : '+'}${Math.abs(x * 100).toFixed(1).replace('.', ',')}%`;
  if (spx?.trend) add('Trend S&P 500', spx.trend === 'up' ? 1 : -1, spx.trend === 'up' ? `powyżej ${spx.trendBasis}` : `poniżej ${spx.trendBasis}`);
  const eq = rows.filter((r) => isEquity(r) && r.trend);
  if (eq.length >= 4) {
    const up = eq.filter((r) => r.trend === 'up').length / eq.length;
    add('Szerokość rynku', up >= 0.7 ? 1 : up <= 0.3 ? -1 : 0, `${eq.filter((r) => r.trend === 'up').length} z ${eq.length} rynków akcji w trendzie wzrostowym`);
  }
  if (spx?.fromHigh !== null && spx?.fromHigh !== undefined) {
    const dd = -spx.fromHigh;
    add('Obsunięcie S&P 500', dd < 0.05 ? 1 : dd < 0.1 ? 0 : dd < 0.2 ? -1 : -2, `${pct(spx.fromHigh)} od szczytu z 52 tygodni`);
  }
  const ind = (id) => macro?.indicators?.find((i) => i.id === id);
  const vix = ind('VIXCLS');
  if (vix) add('Zmienność (VIX)', [1, 0, -1, -2][vix.tier] ?? 0, `${vix.value} – ${vix.comment}`);
  const hy = ind('BAMLH0A0HYM2');
  if (hy) add('Stres kredytowy', [0, 0, -1, -2][hy.tier] ?? 0, `${hy.value} – ${hy.comment}`);
  const epu = ind('USEPUINDXD');
  if (epu) add('Niepewność polityczna USA', epu.tier >= 2 ? -1 : 0, epu.comment);
  const curve = ind('T10Y3M');
  if (curve?.tier >= 2) add('Krzywa rentowności', -1, curve.comment);
  const asset = signals?.official?.decision?.asset;
  if (asset && config) {
    const equities = config.variants?.[config.strategy?.variant]?.equities ?? [];
    const inStocks = equities.includes(asset);
    add('Momentum (sygnał GEM)', inStocks ? 1 : -1, inStocks ? `akcje mają przewagę nad bonami (${config.assets[asset]?.name ?? asset})` : 'akcje słabsze od bonów – sygnał w bezpiecznej przystani');
  }
  const score = factors.reduce((s, f) => s + f.score, 0);
  const id = score >= 3 ? 'sprzyjajace' : score >= 0 ? 'neutralne' : score >= -3 ? 'ostrozne' : 'defensywne';
  return { id, ...STANCES[id], score, factors };
}

// ---------- Statystyka historyczna (S&P 500 od 1993) ----------
export const HORIZONS = [
  [5, 'tydzień'],
  [21, 'miesiąc'],
  [63, '3 miesiące'],
];
const VOL_BUCKETS = [
  [0.15, 'low'],
  [0.25, 'mid'],
  [Infinity, 'high'],
];
export const REGIME_TEXT = {
  up: 'trend wzrostowy (cena powyżej średniej z 200 sesji)',
  down: 'trend spadkowy (cena poniżej średniej z 200 sesji)',
  low: 'spokojny rynek (zmienność poniżej 15% rocznie)',
  mid: 'umiarkowana zmienność (15–25% rocznie)',
  high: 'wysoka zmienność (powyżej 25% rocznie)',
};

// Trend i zmienność dla każdego dnia (od 200. sesji): klucz „up|low”, „down|high” itd.
function regimes(values, window = 200, volWindow = 20) {
  const n = values.length;
  const keys = new Array(n).fill(null);
  const vols = new Array(n).fill(null);
  let sum = 0;
  let rs = 0;
  let rs2 = 0;
  const lr = [0];
  for (let i = 1; i < n; i++) lr.push(Math.log(values[i] / values[i - 1]));
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= 1) {
      rs += lr[i];
      rs2 += lr[i] * lr[i];
      if (i > volWindow) {
        rs -= lr[i - volWindow];
        rs2 -= lr[i - volWindow] * lr[i - volWindow];
      }
    }
    if (i >= window - 1 && i >= volWindow) {
      const mean = rs / volWindow;
      const vol = Math.sqrt(Math.max(0, rs2 / volWindow - mean * mean) * 252);
      vols[i] = vol;
      const trend = values[i] >= sum / window ? 'up' : 'down';
      keys[i] = `${trend}|${VOL_BUCKETS.find(([t]) => vol < t)[1]}`;
    }
  }
  return { keys, vols };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

/** Co działo się dalej w podobnych warunkach: dla każdego reżimu i horyzontu odsetek wzrostów, mediana i typowy zakres. */
export function baseRates(series) {
  const values = series.map((p) => p.value);
  const { keys } = regimes(values);
  const buckets = {};
  const push = (key, h, r) => {
    buckets[key] ??= {};
    (buckets[key][h] ??= []).push(r);
  };
  for (let i = 0; i < values.length; i++) {
    if (!keys[i]) continue;
    for (const [h] of HORIZONS) {
      if (i + h >= values.length) continue;
      const r = values[i + h] / values[i] - 1;
      push(keys[i], h, r);
      push('all', h, r);
    }
  }
  const table = {};
  for (const [key, byH] of Object.entries(buckets)) {
    table[key] = {};
    for (const [h, list] of Object.entries(byH)) {
      const s = [...list].sort((a, b) => a - b);
      table[key][h] = { n: s.length, up: round(s.filter((x) => x > 0).length / s.length, 4), median: round(quantile(s, 0.5), 5), p10: round(quantile(s, 0.1), 5), p90: round(quantile(s, 0.9), 5) };
    }
  }
  return { since: series[0]?.date ?? null, until: series.at(-1)?.date ?? null, table };
}

/** Reżim na ostatni dzień serii (trend, zmienność). */
export function currentRegime(series) {
  if (!series?.length || series.length < 220) return null;
  const values = series.map((p) => p.value);
  const { keys, vols } = regimes(values);
  const key = keys.at(-1);
  if (!key) return null;
  const [trend, vol] = key.split('|');
  return { key, trend, vol, volValue: round(vols.at(-1), 4), date: series.at(-1).date };
}

/** Statystyka liczona raz w miesiącu z pełnej historii SPY (Tiingo, od 1993). */
export async function marketStats({ cache, env = process.env, now = new Date(), tiingo = tiingoDaily }) {
  const month = monthOf(toISO(now));
  if (cache?.month === month && cache.table) return { ...cache, cached: true };
  if (!env.TIINGO_API_KEY) return cache ?? null;
  const series = await tiingo('SPY', '1993-01-01', env.TIINGO_API_KEY, { minPoints: 1000 });
  return { month, ...baseRates(series) };
}

// ---------- Kalendarz ----------
const firstWeekdayOf = (month, dow) => {
  for (let d = 1; d <= 7; d++) {
    const iso = `${month}-0${d}`;
    if (new Date(`${iso}T00:00:00Z`).getUTCDay() === dow) return iso;
  }
  return null;
};
const firstBusinessDay = (month) => {
  for (let d = 1; d <= 7; d++) {
    const iso = `${month}-0${d}`;
    if (!isWeekend(iso)) return iso;
  }
  return `${month}-01`;
};
const lastBusinessDay = (month) => {
  let iso = lastDayOfMonth(month);
  while (isWeekend(iso)) iso = addDays(iso, -1);
  return iso;
};

/** Wydarzenia z najbliższych `days` dni: decyzje banków centralnych (config/kalendarz.js), dane cykliczne i sygnał GEM. */
export function upcomingEvents(calendar, now = new Date(), { days = 35 } = {}) {
  const today = toISO(now);
  const end = addDays(today, days);
  const events = [];
  const push = (date, title, kind, note = '', approx = false) => {
    if (date && date >= today && date <= end && !events.some((e) => e.date === date && e.title === title)) events.push({ date, title, kind, note, approx });
  };
  for (const d of calendar?.fed ?? []) push(d, 'Decyzja Fed w sprawie stóp procentowych (USA)', 'bank', 'Ogłoszenie ok. 20:00 czasu polskiego, potem konferencja prezesa Fed.');
  for (const d of calendar?.ebc ?? []) push(d, 'Decyzja EBC w sprawie stóp procentowych (strefa euro)', 'bank', 'Ogłoszenie ok. 14:15, konferencja prezes EBC ok. 14:45.');
  for (const d of calendar?.rpp ?? []) push(d, 'Decyzja RPP w sprawie stóp procentowych (Polska)', 'bank', 'Komunikat po posiedzeniu; zwykle dzień później konferencja prezesa NBP.');
  for (const e of calendar?.inne ?? []) push(e.date, e.title, 'inne', e.note ?? '');
  for (let m = 0; m <= 1; m++) {
    const month = addMonths(monthOf(today), m);
    push(firstWeekdayOf(month, 5), 'Raport z rynku pracy w USA (zatrudnienie, bezrobocie)', 'dane', 'Zwykle pierwszy piątek miesiąca o 14:30 – termin orientacyjny.', true);
    push(lastBusinessDay(month), 'Szybki szacunek inflacji w Polsce (GUS)', 'dane', 'Zwykle ostatni dzień roboczy miesiąca o 10:00 – termin orientacyjny.', true);
    push(firstBusinessDay(addMonths(month, 1)), 'Nowy sygnał GEM (po zamknięciu miesiąca)', 'gem', 'Aplikacja sprawdzi sygnał i powiadomi, jeśli trzeba zmienić ETF.');
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const warning = (calendar?.fed ?? []).some((d) => d >= today) ? null : 'W config/kalendarz.js brakuje przyszłych terminów decyzji Fed – uzupełnij kalendarz (terminy publikują Fed, EBC i NBP).';
  return { events, warning };
}

// ---------- Notatka rynkowa z reguł ----------
const THEME_IMPACT = {
  'Konflikty i wojny': 'napięcia geopolityczne zwykle zwiększają awersję do ryzyka: zyskują złoto, dolar i obligacje skarbowe, a gdy konflikt dotyczy regionów wydobycia – ropa; tracą akcje, zwłaszcza Europy i rynków wschodzących',
  'Sankcje i cła': 'cła i sankcje uderzają w handel i marże firm; najbardziej wrażliwe są spółki eksportowe, rynki wschodzące i branże z długimi łańcuchami dostaw (technologie, motoryzacja)',
  'Banki centralne i stopy': 'decyzje o stopach zmieniają koszt pieniądza: obniżki zwykle wspierają akcje i obligacje, a podwyżki lub zapowiedzi dłużej wysokich stóp szkodzą wycenom; dla złotego ważna jest różnica stóp NBP i Fed/EBC',
  'Wybory i polityka': 'niepewność polityczna podnosi zmienność do czasu rozstrzygnięcia; potem rynki zwykle wracają do fundamentów: zysków firm i stóp procentowych',
  'Energia i surowce': 'droższa energia podbija inflację i koszty firm (szkodzi importerom, w tym Europie i Polsce), a wspiera spółki surowcowe',
  'Inflacja i recesja': 'wyższa inflacja oddala obniżki stóp, a słabsze dane o wzroście zwiększają ryzyko spadku zysków firm, choć mogą przyspieszyć obniżki stóp',
  'Nastroje na giełdach': 'gwałtowne wzrosty i wyprzedaże pokazują nastroje inwestorów; same w sobie rzadko zmieniają długoterminowy trend, ale podnoszą zmienność',
  'Spółki i wyniki': 'wyniki i prognozy dużych spółek (zwłaszcza technologicznych w USA) mocno wpływają na indeksy, bo te spółki mają w nich duży udział',
};

const signedPct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${x < 0 ? '−' : '+'}${Math.abs(x * 100).toFixed(d).replace('.', ',')}%`);
const signedPp = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(2).replace('.', ',')} pp`);
const num = (x, d = 2) => (x === null || x === undefined ? '–' : x.toFixed(d).replace('.', ','));
const dateShort = (iso) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}`;

/** Zdania z liczbami dla horyzontów statystyki w bieżącym reżimie. */
export function statsSentences(stats, regime) {
  const cell = stats?.table?.[regime?.key];
  if (!cell) return [];
  return HORIZONS.filter(([h]) => cell[h]).map(([h, label]) => {
    const c = cell[h];
    return `${label}: wzrost w ${Math.round(c.up * 100)}% przypadków, mediana ${signedPct(c.median)}, typowy zakres od ${signedPct(c.p10)} do ${signedPct(c.p90)}`;
  });
}

const STANCE_ADVICE = {
  sprzyjajace: 'Warunki sprzyjają akcjom. Regularne wpłaty – bez zmian; nie ma powodu, by czekać z inwestowaniem pieniędzy przeznaczonych na długi termin.',
  neutralne: 'Sygnały są mieszane. Regularne wpłaty – bez zmian; nagłe ruchy całym portfelem zwykle szkodzą bardziej, niż pomagają.',
  ostrozne: 'Ryzyko krótkoterminowe jest podwyższone. Regularne wpłaty mają sens także teraz (kupujesz taniej, jeśli spadki się pogłębią), ale większą jednorazową kwotę możesz rozłożyć na 2–4 części w kolejnych tygodniach.',
  defensywne: 'Rynek jest w stresie. Trzymaj się zasad: pieniądze potrzebne w ciągu 1–2 lat nie powinny być w akcjach, a decyzję o portfelu GEM podejmuje sygnał na koniec miesiąca (w takich warunkach często wskazuje obligacje lub bony).',
};

/**
 * Notatka rynkowa z reguł: krótkie podsumowanie, tematy z wiadomości z wyjaśnieniem wpływu, największe ruchy,
 * najbliższe dni (kalendarz + statystyka) i wnioski dla inwestora. Zwraca zwykły tekst (bez HTML).
 */
export function buildMarketNote({ world, stance, stats, regime, events, news, signals, explanation, config, now = new Date() }) {
  const r = Object.fromEntries((world?.rows ?? []).map((x) => [x.key, x]));
  const summary = [];
  const eq = ['SPX', 'EUR', 'EM', 'WIG20'].map((k) => r[k]).filter((x) => x && x.w1 !== null);
  if (eq.length) summary.push(`Akcje w ostatnim tygodniu: ${eq.map((x) => `${x.short} ${signedPct(x.w1)}`).join(', ')}${r.SPX?.ytd !== null && r.SPX?.ytd !== undefined ? ` (S&P 500 od początku roku ${signedPct(r.SPX.ytd)})` : ''}.`);
  const rates = [];
  if (r.US10) rates.push(`rentowność 10-letnich obligacji USA ${num(r.US10.last)}% (${signedPp(r.US10.w1)} w tydzień)`);
  if (r.GOLD?.w1 !== null && r.GOLD?.w1 !== undefined) rates.push(`złoto ${signedPct(r.GOLD.w1)}`);
  if (r.BRENT) rates.push(`ropa Brent ${num(r.BRENT.last, 1)} USD (${signedPct(r.BRENT.w1)})`);
  if (rates.length) summary.push(`${rates.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
  const pln = ['EURPLN', 'USDPLN'].map((k) => r[k]).filter(Boolean);
  if (pln.length) summary.push(`Złoty: ${pln.map((x) => `${x.short} ${num(x.last, 4)} (${signedPct(x.w1)} w tydzień)`).join(', ')}.`);

  const sections = [];
  // Tematy z wiadomości (ostatnie 72 h) z wyjaśnieniem, jak zwykle wpływają na rynki.
  const themes = Object.entries(news?.themeCounts ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (themes.length) {
    sections.push({
      title: 'Co się dzieje na świecie',
      items: themes.map(([t, n]) => {
        const head = (news.items ?? []).find((i) => i.themes?.includes(t));
        return `${t} (${n} ${n === 1 ? 'wiadomość' : n < 5 ? 'wiadomości' : 'wiadomości'}): ${THEME_IMPACT[t] ?? ''}.${head ? ` Przykład: „${head.title}” (${head.source}).` : ''}`;
      }),
    });
  }
  // Największe ruchy tygodnia.
  const movers = (world?.rows ?? []).filter((x) => x.kind !== 'yield' && x.kind !== 'fx' && Number.isFinite(x.w1)).sort((a, b) => b.w1 - a.w1);
  if (movers.length >= 4) {
    const best = movers.slice(0, 2);
    const worst = movers.slice(-2).reverse();
    sections.push({ title: 'Największe zmiany w tygodniu', items: [`Najmocniej: ${best.map((x) => `${x.short} ${signedPct(x.w1)}`).join(', ')}.`, `Najsłabiej: ${worst.map((x) => `${x.short} ${signedPct(x.w1)}`).join(', ')}.`] });
  }
  // Najbliższe dni: kalendarz (2 tygodnie, a gdy nic się nie dzieje – dwa najbliższe wydarzenia) i statystyka.
  const soon = (events ?? []).filter((e) => e.date <= addDays(toISO(now), 14));
  const next = [];
  for (const e of (soon.length ? soon : (events ?? []).slice(0, 2)).slice(0, 5)) next.push(`${dateShort(e.date)} – ${e.title}${e.approx ? ' (termin orientacyjny)' : ''}.`);
  const month = stats?.table?.[regime?.key]?.[21];
  if (month) next.push(`Statystyka: w podobnych warunkach jak dziś (${REGIME_TEXT[regime.trend].replace(/ \(.*\)/, '')}, ${REGIME_TEXT[regime.vol].replace(/ \(.*\)/, '')}) S&P 500 rósł w ciągu kolejnego miesiąca w ${Math.round(month.up * 100)}% przypadków od ${stats.since?.slice(0, 4)} r. (mediana ${signedPct(month.median)}). To historia, nie prognoza – szczegóły niżej.`);
  if (next.length) sections.push({ title: 'Najbliższe dni', items: next });
  // Wnioski.
  const advice = [];
  if (explanation?.target?.ticker) advice.push(`Strategia GEM – ${explanation.action?.text ?? `trzymaj ${explanation.target.ticker}`}. Kolejną decyzję podejmie sygnał po zamknięciu miesiąca – wiadomości nie zmieniają sygnału.`);
  if (stance) advice.push(STANCE_ADVICE[stance.id]);
  advice.push('Poduszka finansowa (3–6 miesięcy wydatków) powinna być na koncie oszczędnościowym, a nie w akcjach – wtedy spadki na giełdzie nie zmuszą Cię do sprzedaży w złym momencie.');
  sections.push({ title: 'Co z tym zrobić', items: advice });
  return {
    date: toISO(now),
    stance: stance ? { id: stance.id, label: stance.label, tone: stance.tone } : null,
    summary,
    sections,
    disclaimer: 'Notatka powstaje automatycznie z danych rynkowych i nagłówków wiadomości. To materiał edukacyjny, a nie rekomendacja inwestycyjna – nikt nie przewiduje rynku w krótkim terminie.',
  };
}

// ---------- Stan między uruchomieniami (state/rynki.json) ----------
export async function readMarketState(root) {
  try {
    return JSON.parse(await readFile(path.join(root, 'state', 'rynki.json'), 'utf8'));
  } catch {
    return {};
  }
}

export async function writeMarketState(root, data) {
  await mkdir(path.join(root, 'state'), { recursive: true });
  await writeFile(path.join(root, 'state', 'rynki.json'), `${JSON.stringify(data)}\n`);
}

/** Pełny przegląd rynku do panelu i notatki. Błędy pojedynczych źródeł trafiają do warnings. */
export async function buildMarketOverview({ root, now = new Date(), env = process.env, macro, news, signals, explanation, config, calendar, notowania, prices, market, fetchImpl = fetchWithRetry, fred = fredSeries, tiingo = tiingoDaily }) {
  const today = toISO(now);
  const saved = await readMarketState(root);
  const warnings = [];
  let gpw = saved.gpw ?? {};
  if (saved.gpwFetched !== today) {
    const g = await updateGpwIndices(gpw, today, { fetchImpl });
    gpw = g.history;
    warnings.push(...g.warnings);
  }
  const world = await loadWorldMarkets({ now, proxies: notowania?.proxies ?? {}, fx: prices?.fx ?? {}, gpw, fred });
  warnings.push(...world.warnings);
  let stats = saved.stats ?? null;
  try {
    stats = await marketStats({ cache: stats, env, now, tiingo });
  } catch (err) {
    warnings.push(`Statystyka S&P 500: ${err.message}`);
  }
  const regime = currentRegime(market?.series?.US ?? []);
  const stance = marketStance({ world, macro, signals, config });
  const cal = upcomingEvents(calendar, now);
  if (cal.warning) warnings.push(cal.warning);
  const note = buildMarketNote({ world, stance, stats, regime, events: cal.events, news, signals, explanation, config, now });
  await writeMarketState(root, { gpw, gpwFetched: today, stats: stats ? { month: stats.month, since: stats.since, until: stats.until, table: stats.table } : null });
  const regimeStats = stats?.table?.[regime?.key] ?? null;
  return { asOf: world.asOf, world: world.rows, stance, regime, stats: regimeStats ? { since: stats.since, until: stats.until, current: regimeStats, all: stats.table.all } : null, events: cal.events, note, warnings };
}
