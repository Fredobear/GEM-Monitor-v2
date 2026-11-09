// Kryptowaluty: ceny w złotych z CoinGecko (publiczne API; z darmowym kluczem Demo w COINGECKO_API_KEY – stabilniej).
// Publikujemy zawsze tę samą listę: N największych kryptowalut według kapitalizacji (+ ewentualnie dodatkowe
// z konfiguracji), więc z repozytorium ani z pliku danych nie da się odczytać, co ktoś ma.
// Historia cen: codziennie z ostatnich tygodni i ostatni dzień każdego miesiąca. Darmowe API podaje historię tylko
// z ostatnich 365 dni – uzupełniamy ją po kilka monet przy każdej aktualizacji (najpierw największe), dalej rośnie sama.
import { fetchWithRetry } from './lib/http.js';
import { toISO } from './lib/dates.js';
import { keepDates } from './funds.js';
import { readDataScript, writeDataScript } from './lib/datafile.js';

const API = 'https://api.coingecko.com/api/v3';
const KEEP = { days: 35, months: 36 };
const EMPTY = { coins: [], dates: [], values: {}, backfilled: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 8 cyfr znaczących: ceny bitcoina i drobnych tokenów (np. 0,000023 zł) bez szumu liczb zmiennoprzecinkowych.
const sig = (x) => Number(Number(x).toPrecision(8));
const frac = (pct) => (Number.isFinite(Number(pct)) && pct !== null ? Math.round(Number(pct) * 100) / 10000 : null);

/** Odpowiedź /coins/markets → [{ id, symbol, name, rank, price, ch: { d1, d7, d30, y1 } }] albo null. */
export function parseMarkets(json) {
  if (!Array.isArray(json)) return null;
  return json
    .filter((c) => c?.id && Number(c.current_price) > 0)
    .map((c) => {
      const ch = {};
      const set = (k, v) => {
        const x = frac(v);
        if (x !== null) ch[k] = x;
      };
      set('d1', c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h);
      set('d7', c.price_change_percentage_7d_in_currency);
      set('d30', c.price_change_percentage_30d_in_currency);
      set('y1', c.price_change_percentage_1y_in_currency);
      return { id: String(c.id), symbol: String(c.symbol ?? '').toUpperCase(), name: String(c.name ?? c.id).trim(), rank: Number(c.market_cap_rank) || null, price: sig(c.current_price), ch };
    });
}

/** Odpowiedź /coins/{id}/market_chart (interval=daily) → [[data UTC, cena], …] (ostatnia cena z każdego dnia). */
export function parseChart(json) {
  const byDay = new Map();
  for (const p of json?.prices ?? []) {
    const t = Number(p?.[0]);
    const v = Number(p?.[1]);
    if (!Number.isFinite(t) || !(v > 0)) continue;
    byDay.set(new Date(t).toISOString().slice(0, 10), sig(v));
  }
  return [...byDay].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/**
 * Aktualizacja kursów. previous – poprzedni stan (docs/data/krypto.js).
 * top – ile największych kryptowalut; extra – identyfikatory CoinGecko spoza tej listy; backfillRank – historię
 * z ostatniego roku uzupełniamy dla kryptowalut do tego miejsca w rankingu, po backfillPerRun przy aktualizacji.
 */
export async function buildCrypto({ previous = null, now = new Date(), fetchImpl = fetchWithRetry, env = {}, top = 100, extra = [], backfillPerRun = 8, backfillRank = 50, pauseMs = null } = {}) {
  const today = toISO(now);
  if (previous?.fetched === today && previous?.coins?.length) return { ...previous, warnings: [] };
  const prev = previous?.dates ? previous : EMPTY;
  const key = env.COINGECKO_API_KEY;
  const headers = { Accept: 'application/json', ...(key ? { 'x-cg-demo-api-key': key } : {}) };
  // Publiczne API pozwala na kilka zapytań na minutę, z kluczem Demo – 30.
  const pause = pauseMs ?? (key ? 2200 : 6500);
  let calls = 0;
  const get = async (query, label) => {
    const res = await fetchImpl(`${API}${query}`, { label, headers, retries: 2, timeoutMs: 45000 });
    calls++;
    if (res.status === 429) throw new Error('CoinGecko: chwilowy limit zapytań');
    if (res.status === 401 || res.status === 403) throw new Error(`CoinGecko: odmowa dostępu (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`CoinGecko: HTTP ${res.status}`);
    try {
      return await res.json();
    } catch (err) {
      throw new Error(err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'CoinGecko: przekroczony czas odpowiedzi' : 'CoinGecko: nieoczekiwana odpowiedź');
    }
  };

  const byDate = new Map(prev.dates.map((d, i) => [d, new Map(Object.entries(prev.values ?? {}).filter(([, v]) => v[i] !== null && v[i] !== undefined).map(([s, v]) => [s, v[i]]))]));
  const put = (d, id, v) => {
    if (!byDate.has(d)) byDate.set(d, new Map());
    byDate.get(d).set(id, v);
  };

  const warnings = [];
  const markets = '&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d,30d,1y';
  let coins;
  try {
    coins = parseMarkets(await get(`/coins/markets?vs_currency=pln&per_page=${top}&page=1${markets}`, 'CoinGecko – kursy kryptowalut'));
    if (!coins?.length) throw new Error('CoinGecko: pusta lista kryptowalut');
    const missing = [...new Set(extra)].filter((id) => id && !coins.some((c) => c.id === id));
    if (missing.length) {
      if (pause) await sleep(pause);
      try {
        coins.push(...(parseMarkets(await get(`/coins/markets?vs_currency=pln&ids=${missing.map(encodeURIComponent).join(',')}${markets}`, 'CoinGecko – dodatkowe kryptowaluty')) ?? []));
      } catch (err) {
        warnings.push(`${err.message} – bez dodatkowych kryptowalut z konfiguracji.`);
      }
    }
  } catch (err) {
    return { ...(previous ?? EMPTY), warnings: [`${err.message} – kursy kryptowalut z poprzedniej aktualizacji.`] };
  }
  for (const c of coins) put(today, c.id, c.price);

  // Uzupełnienie historii z ostatniego roku (raz dla każdej monety).
  const done = new Set(prev.backfilled ?? []);
  const todo = coins.filter((c) => !done.has(c.id) && (c.rank ?? Infinity) <= backfillRank).slice(0, backfillPerRun);
  for (const c of todo) {
    if (pause) await sleep(pause);
    try {
      for (const [d, v] of parseChart(await get(`/coins/${encodeURIComponent(c.id)}/market_chart?vs_currency=pln&days=365&interval=daily`, `CoinGecko – historia ${c.symbol}`))) if (d < today) put(d, c.id, v);
      done.add(c.id);
    } catch (err) {
      // Bez ostrzeżenia przy limicie zapytań – historia uzupełni się przy następnej aktualizacji.
      if (!/limit/.test(err.message)) warnings.push(`${err.message} (historia ${c.symbol}).`);
      break;
    }
  }

  const ids = coins.map((c) => c.id);
  const dates = keepDates([...byDate.keys()].filter((d) => [...byDate.get(d).keys()].some((id) => ids.includes(id))), KEEP);
  const values = Object.fromEntries(ids.map((id) => [id, dates.map((d) => byDate.get(d).get(id) ?? null)]));
  return { updatedAt: now.toISOString(), fetched: today, asOf: today, source: 'CoinGecko – api.coingecko.com', currency: 'PLN', coins, dates, values, backfilled: [...done].filter((id) => ids.includes(id)), calls, warnings };
}

export const readCrypto = (docsDir) => readDataScript(docsDir, 'krypto.js', 'GEM_KRYPTO');
export const writeCrypto = (docsDir, data) => (data?.coins?.length ? writeDataScript(docsDir, 'krypto.js', 'GEM_KRYPTO', data) : undefined);
