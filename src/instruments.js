// Biblioteka instrumentów XTB: katalog wszystkich akcji i ETF/ETN/ETC z oferty XTB (config/xtb-instrumenty.json)
// oraz ceny do wyceny portfela i kont inwestycyjnych:
//  • GPW – kursy zamknięcia wszystkich akcji, ETF-ów, ETC i ETN z Warszawy (oficjalne archiwum notowań GPW),
//  • NewConnect – ostatni kurs mniejszych spółek (tabela notowań newconnect.pl),
//  • USA – dzienne notowania z Tiingo dla instrumentów z pliku config/obserwowane.txt (limit darmowego planu),
//  • ETF-y UCITS z Londynu, Frankfurtu, Paryża itd. – wycena przybliżona: zmiana amerykańskiego ETF-u śledzącego
//    ten sam indeks (proxy), przeliczona na walutę instrumentu.
// Wynik trafia do docs/data/notowania.js i docs/data/katalog.js (zwykłe skrypty – działają też na stronie dziennika
// finansowego, która ma zablokowane połączenia sieciowe).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry } from './lib/http.js';
import { readXls } from './xls.js';
import { tiingoDaily } from './providers/tiingo.js';
import { addDays, addMonths, monthOf, toISO } from './lib/dates.js';
import { chainLink, mergePairs } from './prices.js';

export const MARKET_NAMES = {
  US: 'USA', UK: 'Londyn', DE: 'Xetra', PL: 'GPW', FR: 'Paryż', NL: 'Amsterdam', IT: 'Mediolan', ES: 'Madryt', PT: 'Lizbona',
  BE: 'Bruksela', CH: 'Szwajcaria', DK: 'Kopenhaga', FI: 'Helsinki', NO: 'Oslo', SE: 'Sztokholm', CZ: 'Praga', IE: 'Dublin', AT: 'Wiedeń',
};

// Amerykańskie ETF-y-proxy (Tiingo) i indeksy, które śledzą.
export const PROXY_NAMES = {
  SPY: 'S&P 500', QQQ: 'Nasdaq-100', VT: 'FTSE All-World / MSCI ACWI', URTH: 'MSCI World', VEA: 'rynki rozwinięte bez USA',
  ACWX: 'MSCI ACWI ex USA', EFA: 'MSCI EAFE', EEM: 'MSCI Emerging Markets', IEMG: 'MSCI EM IMI', IEUR: 'akcje europejskie (MSCI Europe)',
  FEZ: 'Euro Stoxx 50', EWJ: 'MSCI Japan', IWM: 'Russell 2000', XLK: 'sektor technologii', SMH: 'półprzewodniki', GLD: 'złoto',
  SLV: 'srebro', IBIT: 'bitcoin', BIL: 'bony skarbowe USA', SHY: 'obligacje skarbowe USA 1–3 lata', IEF: 'obligacje skarbowe USA 7–10 lat',
  TLT: 'obligacje skarbowe USA 20+ lat', AGG: 'obligacje USA (Aggregate)',
};

// Produkty z dźwignią, krótkie i strategie opcyjne nie mają sensownego proxy.
const NO_PROXY = /(?<!ultra)short|inverse|leverag|\b[2-9] ?x(?:\b|short|long)|daily [23]|covered call|buffer|\bbear\b|\bbull\b/i;
const SECTOR = 'equal|sector|sctr|energy|financ|health|hlth|utilit|industr|consumer|cnsmr|staples|discr|communic|materials|real estate|value|growth|dividend|aristocrat|low vol|min(?:imum)? vol|momentum|quality|small|mid cap|islamic|climate|water|paris|screened|info|tech';
const US_GOV = String.raw`(?:\$|\bus\b|u\.s\.|\busd\b).{0,25}(?:treas|t-bill|govt|government)`;
const PROXY_RULES = [
  [/nasdaq[ -]?100/i, 'QQQ'],
  [/semiconductor/i, 'SMH'],
  [/(?:s&p ?500|msci world|msci usa).{0,30}(?:information technology|info(?:rmation)? tech)|technology select sector/i, 'XLK'],
  [new RegExp(String.raw`s&p ?500(?!.{0,30}(?:${SECTOR}))|msci usa(?!.{0,20}(?:${SECTOR}))|total (?:us|u\.s\.) (?:stock )?market`, 'i'), 'SPY'],
  [/acwi ex[ -]?us/i, 'ACWX'],
  [/world ex[ -]?us|developed (?:markets? )?ex[ -]?us/i, 'VEA'],
  [/\beafe\b/i, 'EFA'],
  [new RegExp(String.raw`all[ -]world(?!.{0,25}(?:${SECTOR}|high div))|all country world(?!.{0,25}(?:${SECTOR}))|msci acwi(?!.{0,25}(?:${SECTOR}))|global all cap`, 'i'), 'VT'],
  [new RegExp(String.raw`msci world(?!.{0,25}(?:${SECTOR}|ex))|ftse developed(?! (?:europe|asia|emu|ex))|developed world(?!.{0,25}(?:${SECTOR}))`, 'i'), 'URTH'],
  [/em(?:erging markets)? imi|core msci em\b/i, 'IEMG'],
  [new RegExp(String.raw`emerging markets?(?!.{0,25}(?:bond|debt|govt|government|local|corporate|sovereign|${SECTOR}|asia|latin|ex[ -]?china))|msci em\b(?!.{0,25}(?:${SECTOR}|asia|latin|ex[ -]?china))|ftse emerging`, 'i'), 'EEM'],
  [/euro ?stoxx 50/i, 'FEZ'],
  [new RegExp(String.raw`stoxx europe 600(?=\s*(?:ucits|etf|\(|$|dr\b|esg|swap|-))|msci europe(?!.{0,20}(?:${SECTOR}|ex))|ftse developed europe|msci emu(?!.{0,20}(?:${SECTOR}))`, 'i'), 'IEUR'],
  [/msci japan(?!.{0,20}(?:small|value|esg))|nikkei 225|\btopix\b/i, 'EWJ'],
  [/russell 2000/i, 'IWM'],
  [/\bgold\b(?!.{0,25}(?:miner|producer|mining|equit|bugs))/i, 'GLD'],
  [/\bsilver\b(?!.{0,25}(?:miner|mining))/i, 'SLV'],
  [/\bbitcoin\b|\bbtc\b/i, 'IBIT'],
  [new RegExp(String.raw`${US_GOV}.{0,25}(?:0-1|0-3 ?m|1-3 ?m|bills?)|(?:\$|\bus\b|u\.s\.|\busd\b) treasury bills?|\$ ultrashort`, 'i'), 'BIL'],
  [new RegExp(String.raw`${US_GOV}.{0,25}1-3`, 'i'), 'SHY'],
  [new RegExp(String.raw`${US_GOV}.{0,25}7-10`, 'i'), 'IEF'],
  [new RegExp(String.raw`${US_GOV}.{0,25}(?:20\+|25\+|long)`, 'i'), 'TLT'],
  [/(?:\$|\bus\b|u\.s\.|core us) aggregate/i, 'AGG'],
];

/** Proxy dla ETF-u/ETC według nazwy indeksu: 'SPY', a dla klas zabezpieczonych walutowo 'SPY:h'. */
export function proxyFor(name, type = 'E') {
  if (type !== 'E' || !name || NO_PROXY.test(name)) return null;
  const rule = PROXY_RULES.find(([re]) => re.test(name));
  if (!rule) return null;
  return /hedg|hdg/i.test(name) ? `${rule[1]}:h` : rule[1];
}

export async function loadCatalog(root) {
  const json = JSON.parse(await readFile(path.join(root, 'config', 'xtb-instrumenty.json'), 'utf8'));
  const { instrumenty, ...meta } = json;
  return { meta, items: instrumenty };
}

// Plik z listą obserwowanych instrumentów spoza GPW: jeden symbol XTB w wierszu, # zaczyna komentarz.
export function parseWatchlist(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    for (const token of line.replace(/#.*/, '').split(/[\s,;]+/)) {
      const s = token.trim().toUpperCase();
      if (/^[A-Z0-9][A-Z0-9._&-]*\.[A-Z]{2}$/.test(s) && !out.includes(s)) out.push(s);
    }
  }
  return out;
}

export async function loadWatchlist(root) {
  try {
    return parseWatchlist(await readFile(path.join(root, 'config', 'obserwowane.txt'), 'utf8'));
  } catch {
    return [];
  }
}

// Symbole klas akcji: XTB zapisuje je bez separatora (BRKB.US), Tiingo z myślnikiem (BRK-B).
const TIINGO_SYMBOLS = { BRKB: 'BRK-B', BRKA: 'BRK-A', BFB: 'BF-B', BFA: 'BF-A', LENB: 'LEN-B', HEIA: 'HEI-A', MOGA: 'MOG-A' };
export const tiingoSymbol = (xtb) => {
  const base = xtb.replace(/\.US$/, '');
  return TIINGO_SYMBOLS[base] ?? base.replace(/\./g, '-');
};

// ---------- GPW ----------
const isXls = (buf) => buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
const gpwDate = (iso) => iso.split('-').reverse().join('-');
export const gpwUrl = (type, iso) => `https://www.gpw.pl/archiwum-notowan?fetch=1&type=${type}&instrument=&date=${gpwDate(iso)}`;
// Archiwum GPW: 10 – akcje, 241 – ETF, 560 – ETC, 561 – ETN.
const GPW_TYPES = [10, 241, 560, 561];

/** Wiersze arkusza z archiwum GPW → Map(ISIN → { name, close, date }). */
export function parseGpwRows(rows) {
  const head = (rows[0] ?? []).map((h) => String(h ?? '').toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const cIsin = col(/^isin$/);
  const cClose = col(/zamkni/);
  const cName = col(/^nazwa$/);
  const cDate = col(/^data$/);
  const out = new Map();
  if (cIsin < 0 || cClose < 0) return out;
  for (const r of rows.slice(1)) {
    const isin = String(r[cIsin] ?? '').trim();
    const close = Number(r[cClose]);
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) && close > 0) out.set(isin, { name: r[cName] ?? '', close, date: String(r[cDate] ?? '') });
  }
  return out;
}

/** Ostatnia sesja GPW (do 7 dni wstecz): kursy zamknięcia po ISIN. */
export async function gpwLastSession(today, { fetchImpl = fetchWithRetry } = {}) {
  const warnings = [];
  for (let back = 0; back <= 7; back++) {
    const date = addDays(today, -back);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const res = await fetchImpl(gpwUrl(GPW_TYPES[0], date), { label: `GPW ${date}`, retries: 1 });
    if (!res.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!isXls(buf)) continue; // brak sesji (święto) albo notowania jeszcze nieopublikowane
    const prices = parseGpwRows(readXls(buf)[0]?.rows ?? []);
    if (!prices.size) continue;
    for (const type of GPW_TYPES.slice(1)) {
      try {
        const r = await fetchImpl(gpwUrl(type, date), { label: `GPW ${date} (typ ${type})`, retries: 1 });
        const b = new Uint8Array(await r.arrayBuffer());
        if (r.ok && isXls(b)) for (const [k, v] of parseGpwRows(readXls(b)[0]?.rows ?? [])) prices.set(k, v);
      } catch (err) {
        warnings.push(`GPW (typ ${type}): ${err.message}`);
      }
    }
    return { date, prices, warnings };
  }
  return { date: null, prices: new Map(), warnings: ['GPW: brak notowań z ostatnich 7 dni.'] };
}

const NC_URL = 'https://newconnect.pl/ajaxindex.php?action=NCExternalDataFrontController&start=showTable&tab=all&lang=PL&type=ALL&full=1&system_type=&format=html&download_xls=1';
const plNumber = (s) => {
  const v = Number(String(s ?? '').replace(/\s|&nbsp;/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/** Tabela notowań NewConnect (HTML) → Map(ISIN → ostatni kurs). */
export function parseNewConnect(html) {
  const cells = (row, tag) => [...row.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
  const rows = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const head = cells(rows.find((r) => r.includes('<th')) ?? '', 'th').map((h) => h.toLowerCase());
  const cIsin = head.findIndex((h) => h === 'isin');
  const cLast = head.findIndex((h) => h.startsWith('kurs ost'));
  const cRef = head.findIndex((h) => h.startsWith('kurs odn'));
  const out = new Map();
  if (cIsin < 0 || (cLast < 0 && cRef < 0)) return out;
  for (const r of rows) {
    const c = cells(r, 'td');
    if (c.length <= Math.max(cIsin, cLast, cRef)) continue;
    const price = (cLast >= 0 ? plNumber(c[cLast]) : null) || (cRef >= 0 ? plNumber(c[cRef]) : null);
    if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(c[cIsin]) && price > 0) out.set(c[cIsin], price);
  }
  return out;
}

// ---------- historia ----------
/** Zostawia notowania z ostatnich `days` dni i ostatnie notowanie każdego wcześniejszego miesiąca (do `months` miesięcy). */
export function compactPairs(pairs, { days, months }) {
  if (!pairs?.length) return [];
  const last = pairs[pairs.length - 1][0];
  const cutDaily = addDays(last, -days);
  const cutMonths = `${addMonths(monthOf(last), -months)}-01`;
  return pairs.filter(([d], i) => d >= cutDaily || (d >= cutMonths && (i === pairs.length - 1 || pairs[i + 1][0].slice(0, 7) !== d.slice(0, 7))));
}
const KEEP_EXCHANGE = { days: 14, months: 24 }; // GPW/NewConnect: wszystkie spółki, więc krótko
const KEEP_DAILY = { days: 400, months: 48 }; // proxy i obserwowane z USA

// ---------- pliki dla przeglądarki ----------
export const notowaniaScript = (data) => `self.GEM_NOTOWANIA=${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
export function parseNotowaniaScript(text) {
  const m = String(text ?? '').match(/^self\.GEM_NOTOWANIA=([\s\S]*);\s*$/);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

/** Katalog dla przeglądarki: [symbol, nazwa, ISIN, waluta, typ, tylko-zamknięcie (0/1), proxy?]. */
export function katalogScript(catalog) {
  const items = catalog.items.map((it) => {
    const proxy = proxyFor(it[1], it[4]);
    const row = [it[0], it[1], it[2], it[3], it[4]];
    if (it[5] || proxy) row.push(it[5] ? 1 : 0);
    if (proxy) row.push(proxy);
    return row;
  });
  return `self.GEM_KATALOG=${JSON.stringify({ ...catalog.meta, items, markets: MARKET_NAMES, proxyNames: PROXY_NAMES }).replace(/</g, '\\u003c')};\n`;
}

export async function readNotowania(docsDir) {
  try {
    return parseNotowaniaScript(await readFile(path.join(docsDir, 'data', 'notowania.js'), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeLibrary(docsDir, { catalog, notowania }) {
  if (catalog) await writeFile(path.join(docsDir, 'data', 'katalog.js'), katalogScript(catalog));
  if (notowania) await writeFile(path.join(docsDir, 'data', 'notowania.js'), notowaniaScript(notowania));
}

const TIINGO_WATCH_LIMIT = 20; // darmowy plan Tiingo: 50 zapytań na godzinę dla całego uruchomienia

/**
 * Buduje notowania biblioteki instrumentów. Poprzednie dane (previous) są uzupełniane – historia narasta z każdym dniem.
 * @returns {{updatedAt, gpwDate, quotes, src, proxies, proxyOf, proxyNames, watchlist, fetched, warnings}}
 */
export async function buildQuotes({ config, catalog, market, previous = null, watchlist = [], env = process.env, now = new Date(), fetchImpl = fetchWithRetry, tiingo = tiingoDaily }) {
  const today = toISO(now);
  const warnings = [];
  const quotes = { ...(previous?.quotes ?? {}) };
  const src = { ...(previous?.src ?? {}) };
  const proxies = { ...(previous?.proxies ?? {}) };
  const fetched = { ...(previous?.fetched ?? {}) };
  const byIsinPl = new Map();
  const known = new Map(catalog.items.map((it) => [it[0], it]));
  for (const it of catalog.items) if (it[0].endsWith('.PL')) (byIsinPl.get(it[2]) ?? byIsinPl.set(it[2], []).get(it[2])).push(it[0]);

  // GPW + NewConnect: jedna sesja dla wszystkich spółek.
  let gpwDay = previous?.gpwDate ?? null;
  try {
    const session = await gpwLastSession(today, { fetchImpl });
    warnings.push(...session.warnings);
    if (session.date) {
      gpwDay = session.date;
      let nc = new Map();
      try {
        const res = await fetchImpl(NC_URL, { label: 'NewConnect', retries: 1 });
        if (res.ok) nc = parseNewConnect(await res.text());
      } catch (err) {
        warnings.push(`NewConnect: ${err.message}`);
      }
      for (const [isin, price, origin] of [...[...session.prices].map(([i, v]) => [i, v.close, 'gpw']), ...[...nc].map(([i, v]) => [i, v, 'nc'])]) {
        for (const sym of byIsinPl.get(isin) ?? []) {
          if (origin === 'nc' && src[sym] === 'gpw' && quotes[sym]?.at(-1)?.[0] === session.date) continue;
          quotes[sym] = compactPairs(mergePairs(quotes[sym], [[session.date, price]]), KEEP_EXCHANGE);
          src[sym] = origin;
        }
      }
    }
  } catch (err) {
    warnings.push(`GPW: ${err.message}`);
  }

  // Proxy ETF-ów UCITS: notowania z danych rynkowych GEM (już pobrane) albo z Tiingo.
  const proxyOf = {};
  for (const it of catalog.items) {
    const p = proxyFor(it[1], it[4]);
    if (p) proxyOf[it[0]] = p;
  }
  const fromMarket = {};
  for (const [key, a] of Object.entries(config.assets ?? {})) if (market?.series?.[key]?.length) fromMarket[a.proxy] = market.series[key].map((p) => [p.date, p.value]);
  const startDate = config.portfolio?.historyStart ?? addDays(today, -730);
  let tiingoCalls = 0;
  let canTiingo = Boolean(env.TIINGO_API_KEY);
  // Limit lub zły klucz: kolejne zapytania też by się nie udały – kończymy, zostają poprzednie notowania.
  const tiingoFailed = (err) => {
    if (/limit|klucz/i.test(err.message)) canTiingo = false;
  };
  for (const code of Object.keys(PROXY_NAMES)) {
    if (fromMarket[code]) {
      proxies[code] = compactPairs(fromMarket[code].filter(([d]) => d >= startDate), KEEP_DAILY);
      continue;
    }
    if (!canTiingo || fetched[code] === today) continue;
    const prev = proxies[code] ?? [];
    const from = prev.length ? addDays(prev[prev.length - 1][0], -45) : startDate;
    try {
      tiingoCalls++;
      const s = await tiingo(code, from, env.TIINGO_API_KEY, { minPoints: 5, retries: 1 });
      proxies[code] = compactPairs(chainLink(prev, s.map((p) => [p.date, p.value])), KEEP_DAILY);
      fetched[code] = today;
    } catch (err) {
      warnings.push(`Proxy ${code}: ${err.message}`);
      tiingoFailed(err);
    }
  }

  // Obserwowane z USA: kursy zamknięcia (nieskorygowane – zgodne z ceną w XTB).
  const watchUs = watchlist.filter((s) => s.endsWith('.US'));
  for (const s of watchlist) {
    if (!known.has(s)) warnings.push(`Obserwowane: ${s} nie ma w katalogu XTB (sprawdź symbol).`);
    else if (!s.endsWith('.US') && !s.endsWith('.PL') && !proxyOf[s]) warnings.push(`Obserwowane: dla ${s} nie ma darmowego źródła notowań – wycena ręczna.`);
  }
  if (watchUs.length > TIINGO_WATCH_LIMIT) warnings.push(`Obserwowane: pobieram ceny pierwszych ${TIINGO_WATCH_LIMIT} instrumentów z USA (limit darmowego planu Tiingo).`);
  for (const sym of watchUs.slice(0, TIINGO_WATCH_LIMIT)) {
    if (!canTiingo || fetched[sym] === today) continue;
    const prev = quotes[sym] ?? [];
    const from = prev.length ? addDays(prev[prev.length - 1][0], -10) : startDate;
    try {
      tiingoCalls++;
      const s = await tiingo(tiingoSymbol(sym), from, env.TIINGO_API_KEY, { field: 'close', minPoints: 1, retries: 1 });
      quotes[sym] = compactPairs(mergePairs(prev, s.map((p) => [p.date, p.value])), KEEP_DAILY);
      src[sym] = 'tiingo';
      fetched[sym] = today;
    } catch (err) {
      warnings.push(`Obserwowane ${sym}: ${err.message}`);
      tiingoFailed(err);
    }
  }
  // Instrumenty usunięte z obserwowanych przestają być aktualizowane – po miesiącu bez notowań znikają z pliku.
  for (const sym of Object.keys(quotes)) {
    const last = quotes[sym].at(-1)?.[0];
    if (!last || last < addDays(today, -31)) {
      delete quotes[sym];
      delete src[sym];
      delete fetched[sym];
    }
  }

  return { updatedAt: now.toISOString(), gpwDate: gpwDay, quotes, src, proxies, proxyOf, proxyNames: PROXY_NAMES, watchlist, fetched, tiingoCalls, warnings };
}
