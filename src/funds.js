// Fundusze inwestycyjne ING TFI (dawniej NN Investment Partners / Goldman Sachs TFI): wyceny jednostek wszystkich
// funduszy i kategorii jednostek – także kategorii dla pracowniczych programów emerytalnych (PPE: E, F, S, T, W).
// Dzięki temu konto PPE w dzienniku finansowym może pokazywać bieżącą wartość i zysk funduszy.
//
// Źródło: publiczna strona notowań www.ingtfi.pl/notowania-funduszy (robots.txt serwisu pozwala na dostęp).
// Strona wczytuje wyceny z /api/quotes/funds w ramach zwykłej sesji odwiedzającego. Robimy to samo co przeglądarka:
// pobieramy stronę notowań (bez rozwiązywania jakichkolwiek zabezpieczeń), a potem API z ciasteczkiem tej sesji.
// Gdy serwis zmieni zasady (brak sesji, odmowa dostępu) – pomijamy aktualizację i zostawiamy poprzednie dane.
// Zapytań jest mało: raz dziennie najnowsze wyceny, a przy pierwszym uruchomieniu – historia z końców miesięcy.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry } from './lib/http.js';
import { addDays, addMonths, monthOf, toISO } from './lib/dates.js';

const BASE = 'https://www.ingtfi.pl';
export const FUND_PREFIX = 'INGTFI:';
export const fundSymbol = (id, cat) => `${FUND_PREFIX}${id}:${cat}`;
// Kategorie jednostek dostępne w PPE (zależą od umowy zakładowej pracodawcy).
export const PPE_CATEGORIES = ['E', 'F', 'S', 'T', 'W'];
const KEEP = { days: 30, months: 60 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ENTITIES = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ' };
const decodeAttr = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** „822,47” → 822.47; „-0,39%” → -0.0039 (gdy percent); „-” → null. */
export function plNumber(raw, { percent = false } = {}) {
  const s = String(raw ?? '').replace(/\s| /g, '').replace('%', '').replace(',', '.');
  if (!s || s === '-' || s === '–') return null;
  const x = Number(s);
  if (!Number.isFinite(x)) return null;
  return percent ? Math.round(x * 1e6) / 1e8 : x;
}

/** „05.11.2026” → „2026-11-05”. */
export const plDate = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Parametry komponentu listy funduszy ze strony notowań: kategorie jednostek i daty, z których są wyceny. */
export function parseFundsPage(html) {
  const m = String(html ?? '').match(/data-component-type-code="fund_list"[^>]*?data-js-parameters="([^"]*)"/);
  if (!m) return null;
  let p;
  try {
    p = JSON.parse(decodeAttr(m[1]));
  } catch {
    return null;
  }
  const categories = Object.fromEntries((p.unit_categories ?? []).filter((c) => c?.identifier).map((c) => [c.identifier, String(c.name ?? '').trim()]));
  const dates = (p.dates_with_quotes ?? []).map(plDate).filter(Boolean).sort();
  return { categories, dates };
}

/** Odpowiedź /api/quotes/funds → { date, funds: [{ id, name, umbrella, type, currency, risk, url, quotes: { kat: { date, value, ret } } }] }. */
export function parseFundsApi(json) {
  const funds = [];
  let date = null;
  for (const f of json?.funds ?? []) {
    const id = Number(f.fund_id);
    if (!Number.isFinite(id)) continue;
    const quotes = {};
    for (const q of f.quotes ?? []) {
      const cat = String(q.category_unit ?? '').trim();
      const d = plDate(q.pricing_date);
      const value = plNumber(q.value);
      if (!cat || !d || !(value > 0)) continue;
      const ret = {};
      for (const [k, v] of Object.entries(q.return ?? {})) {
        const x = plNumber(v, { percent: true });
        if (x !== null) ret[k] = Math.round(x * 1e6) / 1e6;
      }
      quotes[cat] = { date: d, value, ret };
      if (!date || d > date) date = d;
    }
    if (!Object.keys(quotes).length) continue;
    funds.push({
      id,
      name: String(f.name ?? '').trim(),
      umbrella: String(f.umbrella_name ?? '').trim(),
      type: String(f.type_name ?? '').trim(),
      currency: String(f.currency ?? 'PLN').trim() || 'PLN',
      risk: Number(f.risk) || null,
      url: f.fund_page_url ? `${BASE}${f.fund_page_url}` : null,
      quotes,
    });
  }
  return { date, funds };
}

/** Zwykła wizyta na stronie notowań: ciasteczko sesji CMS i parametry listy funduszy. */
export async function ingtfiSession({ fetchImpl = fetchWithRetry } = {}) {
  const res = await fetchImpl(`${BASE}/notowania-funduszy`, { label: 'ING TFI (strona notowań)', retries: 1 });
  if (!res.ok) throw new Error(`ING TFI: strona notowań niedostępna (HTTP ${res.status}) – wyceny funduszy z poprzedniej aktualizacji.`);
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') ?? ''];
  const session = setCookies.map((c) => String(c).split(';')[0].trim()).find((c) => c.startsWith('__Host-CMSSESSIONID='));
  const html = await res.text();
  if (!session) throw new Error('ING TFI: strona nie utworzyła sesji (serwis mógł zmienić zasady) – wyceny funduszy z poprzedniej aktualizacji.');
  return { cookie: session, page: parseFundsPage(html) };
}

/** Wyceny wszystkich funduszy na dzień (YYYY-MM-DD) albo najnowsze (date = null). */
export async function ingtfiQuotes(session, date, { fetchImpl = fetchWithRetry } = {}) {
  const url = `${BASE}/api/quotes/funds${date ? `?date=${date}` : ''}`;
  const res = await fetchImpl(url, { label: `ING TFI ${date ?? 'najnowsze wyceny'}`, retries: 1, headers: { Accept: 'application/json', Cookie: session.cookie, Referer: `${BASE}/notowania-funduszy` } });
  if (res.status === 401 || res.status === 403) throw new Error('ING TFI: serwis odmówił dostępu do wycen (mógł zmienić zasady) – wyceny funduszy z poprzedniej aktualizacji.');
  if (!res.ok) throw new Error(`ING TFI: HTTP ${res.status}`);
  return parseFundsApi(await res.json());
}

/** Ostatnia data wyceny w każdym z `months` poprzednich miesięcy (bez bieżącego). */
export function monthEndDates(validDates, today, months) {
  const out = [];
  const current = monthOf(today);
  for (let i = 1; i <= months; i++) {
    const m = addMonths(current, -i);
    let last = null;
    for (const d of validDates) {
      if (d.slice(0, 7) === m) last = d;
      else if (d.slice(0, 7) > m) break;
    }
    if (last) out.push(last);
  }
  return out;
}

/** Zostawia daty z ostatnich `days` dni i ostatnią datę każdego miesiąca z `months` miesięcy. */
export function keepDates(dates, { days, months }) {
  if (!dates.length) return [];
  const sorted = [...new Set(dates)].sort();
  const last = sorted[sorted.length - 1];
  const cutDaily = addDays(last, -days);
  const cutMonths = `${addMonths(monthOf(last), -months)}-01`;
  return sorted.filter((d, i) => d >= cutDaily || (d >= cutMonths && (i === sorted.length - 1 || sorted[i + 1].slice(0, 7) !== d.slice(0, 7))));
}

const EMPTY = { dates: [], values: {}, funds: [], categories: {} };

/**
 * Aktualizacja danych funduszy. previous – poprzedni stan (docs/data/fundusze.js).
 * Zapisuje wspólną listę dat i wartości jednostek dla każdego symbolu INGTFI:<id>:<kategoria>.
 */
export async function buildFunds({ previous = null, now = new Date(), fetchImpl = fetchWithRetry, months = 36, recentDays = 10, maxCalls = 50, pauseMs = 300 } = {}) {
  const today = toISO(now);
  const prev = previous?.dates ? previous : EMPTY;
  if (previous?.fetched === today) return { ...previous, warnings: [] };

  // Wartości w postaci mapy data → (symbol → wartość), żeby łatwo łączyć stare i nowe wyceny.
  const byDate = new Map(prev.dates.map((d, i) => [d, new Map(Object.entries(prev.values).filter(([, v]) => v[i] !== null && v[i] !== undefined).map(([s, v]) => [s, v[i]]))]));
  const absorb = (parsed) => {
    for (const f of parsed.funds) {
      for (const [cat, q] of Object.entries(f.quotes)) {
        if (!byDate.has(q.date)) byDate.set(q.date, new Map());
        byDate.get(q.date).set(fundSymbol(f.id, cat), q.value);
      }
    }
  };

  const warnings = [];
  let session;
  try {
    session = await ingtfiSession({ fetchImpl });
  } catch (err) {
    return { ...(previous ?? EMPTY), warnings: [err.message] };
  }
  let calls = 0;
  let latest;
  try {
    latest = await ingtfiQuotes(session, null, { fetchImpl });
    calls++;
  } catch (err) {
    return { ...(previous ?? EMPTY), warnings: [err.message] };
  }
  if (!latest.funds.length) return { ...(previous ?? EMPTY), warnings: ['ING TFI: pusta lista funduszy – wyceny z poprzedniej aktualizacji.'] };
  absorb(latest);

  // Uzupełnienie historii: ostatnie dni wyceny i końce miesięcy, których jeszcze nie mamy.
  const valid = (session.page?.dates ?? []).filter((d) => d <= latest.date);
  if (!valid.length) warnings.push('ING TFI: brak listy dni wyceny na stronie – bez uzupełniania historii.');
  const targets = [...new Set([...valid.slice(-recentDays).reverse(), ...monthEndDates(valid, today, months)])].filter((d) => !byDate.has(d));
  for (const d of targets) {
    if (calls >= maxCalls) {
      warnings.push(`ING TFI: historia uzupełniona częściowo (limit ${maxCalls} zapytań) – reszta przy kolejnych aktualizacjach.`);
      break;
    }
    if (pauseMs) await sleep(pauseMs);
    try {
      const parsed = await ingtfiQuotes(session, d, { fetchImpl });
      calls++;
      absorb(parsed);
      if (!parsed.funds.length) byDate.set(d, byDate.get(d) ?? new Map());
    } catch (err) {
      warnings.push(err.message);
      break;
    }
  }

  const dates = keepDates([...byDate.keys()].filter((d) => byDate.get(d).size), KEEP);
  const symbols = [...new Set(dates.flatMap((d) => [...byDate.get(d).keys()]))].sort();
  const values = Object.fromEntries(symbols.map((s) => [s, dates.map((d) => byDate.get(d).get(s) ?? null)]));
  const categories = { ...(prev.categories ?? {}), ...(session.page?.categories ?? {}) };
  const funds = latest.funds.map((f) => ({
    id: f.id,
    name: f.name,
    umbrella: f.umbrella,
    type: f.type,
    currency: f.currency,
    risk: f.risk,
    url: f.url,
    cats: Object.keys(f.quotes),
    ret: Object.fromEntries(Object.entries(f.quotes).map(([c, q]) => [c, q.ret])),
  }));
  return { updatedAt: now.toISOString(), fetched: today, asOf: latest.date, source: 'ING TFI – www.ingtfi.pl/notowania-funduszy', categories, funds, dates, values, calls, warnings };
}

export const fundsScript = (data) => `self.GEM_FUNDUSZE=${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;

export function parseFundsScript(text) {
  const m = String(text ?? '').match(/^self\.GEM_FUNDUSZE=([\s\S]*);\s*$/);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

export async function readFunds(docsDir) {
  try {
    return parseFundsScript(await readFile(path.join(docsDir, 'data', 'fundusze.js'), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeFunds(docsDir, data) {
  if (!data?.dates?.length) return;
  const { warnings, calls, ...rest } = data;
  await writeFile(path.join(docsDir, 'data', 'fundusze.js'), fundsScript(rest));
}
