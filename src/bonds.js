// Obligacje skarbowe oszczędnościowe (detaliczne): dane, z których dziennik finansowy liczy wartość obligacji
// według wzorów z listów emisyjnych Ministra Finansów (strona niczego nie pobiera – dostaje gotowy plik):
//  • inflacja r/r (CPI) – GUS, plik CSV „Miesięczne wskaźniki cen towarów i usług konsumpcyjnych od 1982 roku”
//    (oprocentowanie COI, EDO, ROS i ROD od 2. roku = inflacja + marża),
//  • stopa referencyjna NBP – archiwum i bieżąca tabela stóp procentowych (ROR i DOR = stopa NBP + marża),
//  • parametry nowych emisji – oprocentowanie w 1. okresie, marża, opłata za przedterminowy wykup i cena zamiany –
//    ze stron bieżącej oferty www.obligacjeskarbowe.pl (robots.txt serwisu pozwala). Parametry zapisujemy przy
//    każdej nowej emisji, więc tabela rośnie z miesiąca na miesiąc; starsze serie uzupełnia się w dzienniku ręcznie.
// Każde źródło jest niezależne: gdy któreś nie odpowiada, zostają dane z poprzedniej aktualizacji z ostrzeżeniem.
import { fetchWithRetry } from './lib/http.js';
import { toISO } from './lib/dates.js';
import { readDataScript, writeDataScript } from './lib/datafile.js';

const GUS_PAGE = 'https://stat.gov.pl/obszary-tematyczne/ceny-handel/wskazniki-cen/wskazniki-cen-towarow-i-uslug-konsumpcyjnych-pot-inflacja-/miesieczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych-od-1982-roku/';
const NBP_RATES = 'https://static.nbp.pl/dane/stopy/stopy_procentowe.xml';
const NBP_ARCHIVE = 'https://static.nbp.pl/dane/stopy/stopy_procentowe_archiwum.xml';
const OFFER_BASE = 'https://www.obligacjeskarbowe.pl';
const SINCE = '2004-01'; // najstarsze obligacje oszczędnościowe w obiegu mają kilkanaście lat
export const BOND_TYPE_CODES = ['OTS', 'ROR', 'DOR', 'TOS', 'COI', 'ROS', 'EDO', 'ROD'];
const EMPTY = { cpi: [], ref: [], series: {}, offer: [] };

const plNum = (s) => {
  const x = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};
const decodeHtml = (s) =>
  String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&oacute;/g, 'ó')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ');

/** Link do pliku CSV z miesięcznymi wskaźnikami CPI na stronie GUS (nazwa pliku zmienia się przy aktualizacjach). */
export function findCpiCsv(html) {
  const m = String(html ?? '').match(/href="([^"]*miesieczne[^"]*\.csv)"/i) ?? String(html ?? '').match(/href="([^"]*\.csv)"/i);
  return m ? new URL(m[1], 'https://stat.gov.pl').href : null;
}

/** CSV GUS → [['RRRR-MM', inflacja r/r w %], …] rosnąco (wiersze „Analogiczny miesiąc poprzedniego roku = 100”). */
export function parseCpiCsv(text, since = SINCE) {
  const out = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(/;Analogiczny miesi.{1,3}c poprzedniego roku = 100;(\d{4});(\d{1,2});(\d+(?:,\d+)?);/);
    if (!m) continue;
    const month = `${m[1]}-${m[2].padStart(2, '0')}`;
    const v = plNum(m[3]);
    if (month >= since && v !== null && v > 0) out.set(month, Math.round((v - 100) * 100) / 100);
  }
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Stopa referencyjna NBP z archiwum i bieżącej tabeli → [['RRRR-MM-DD', stopa w %], …] (daty zmian, rosnąco). */
export function parseNbpRates(...xmls) {
  const out = new Map();
  for (const xml of xmls) {
    const s = String(xml ?? '');
    // Archiwum: <pozycje obowiazuje_od="…"> <pozycja id="ref" oprocentowanie="…" /> …
    for (const block of s.matchAll(/<pozycje\b[^>]*obowiazuje_od="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/pozycje>/g)) {
      const ref = block[2].match(/<pozycja\b[^>]*\bid="ref"[^>]*>/);
      const v = ref && plNum(ref[0].match(/oprocentowanie="([^"]+)"/)?.[1]);
      if (v !== null && v !== undefined) out.set(block[1], v);
    }
    // Bieżąca tabela: <pozycja id="ref" … oprocentowanie="…" … obowiazuje_od="…" />
    for (const tag of s.matchAll(/<pozycja\b[^>]*>/g)) {
      if (!/\bid="ref"/.test(tag[0])) continue;
      const d = tag[0].match(/obowiazuje_od="(\d{4}-\d{2}-\d{2})"/)?.[1];
      const v = plNum(tag[0].match(/oprocentowanie="([^"]+)"/)?.[1]);
      if (d && v !== null) out.set(d, v);
    }
  }
  return [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Strona główna obligacjeskarbowe.pl → bieżąca oferta [{ code, url }] (np. EDO1136). */
export function parseOfferLinks(html) {
  const out = new Map();
  for (const m of String(html ?? '').matchAll(/href="(\/oferta-obligacji\/[^"/]+\/([a-z]{3})(\d{4})\/)"/gi)) {
    const code = `${m[2].toUpperCase()}${m[3]}`;
    if (BOND_TYPE_CODES.includes(code.slice(0, 3))) out.set(code, `${OFFER_BASE}${m[1]}`);
  }
  return [...out].map(([code, url]) => ({ code, url }));
}

/** Miesiąc sprzedaży serii z jej kodu (miesiąc i rok wykupu minus czas trwania obligacji). */
export function seriesSaleMonth(code) {
  const m = String(code ?? '').match(/^([A-Z]{3})(\d{2})(\d{2})$/);
  const months = { OTS: 3, ROR: 12, DOR: 24, TOS: 36, COI: 48, ROS: 72, EDO: 120, ROD: 144 }[m?.[1]];
  if (!months) return null;
  const t = (2000 + Number(m[3])) * 12 + Number(m[2]) - 1 - months;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Strona serii z oferty → { type, rate1, margin, fee, swap } (stopy w %, kwoty w zł) albo null. */
export function parseSeriesPage(html, code) {
  const text = decodeHtml(html);
  const type = String(code ?? '').slice(0, 3);
  const at = text.indexOf('Oprocentowanie:');
  if (at < 0 || !BOND_TYPE_CODES.includes(type)) return null;
  const info = text.slice(at, at + 700);
  const rate1 = plNum(info.match(/Oprocentowanie:\s*(\d+,\d+)\s*%/)?.[1]);
  if (!(rate1 > 0)) return null;
  const margin = plNum(info.match(/marża\s*(\d+,\d+)\s*%/i)?.[1] ?? info.match(/stopa referencyjna NBP\s*\+\s*(\d+,\d+)\s*%/i)?.[1]);
  // Opłata za przedterminowy wykup: dla nowych emisji kwota „od 1 września 2024 r.”, a gdy jest jedna – ta jedna.
  const feeNew = text.match(/od 1 wrze[sś]nia 2024 r\.\s*opłata wynosi (\d+,\d+) zł/i)?.[1];
  const feeAny = text.match(/[Oo]płata wynosi (\d+,\d+) zł/)?.[1];
  const swap = plNum(text.match(/Cena zamiany jednej obligacji:\s*(\d+,\d+) zł/)?.[1]);
  const out = { type, rate1 };
  if (margin !== null && type !== 'OTS' && type !== 'TOS') out.margin = margin;
  const fee = plNum(feeNew ?? feeAny);
  if (fee !== null) out.fee = fee;
  if (swap > 0) out.swap = swap;
  return out;
}

async function getText(url, label, fetchImpl, { decode = null } = {}) {
  // Zwykły identyfikator aplikacji (gem-monitor) – bez podszywania się pod przeglądarkę.
  const res = await fetchImpl(url, { label, retries: 1, timeoutMs: 45000 });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  if (!decode) return res.text();
  return new TextDecoder(decode).decode(await res.arrayBuffer());
}

/** Aktualizacja danych obligacji. previous – poprzedni stan (docs/data/obligacje.js). */
export async function buildBonds({ previous = null, now = new Date(), fetchImpl = fetchWithRetry } = {}) {
  const today = toISO(now);
  const prev = previous?.series ? previous : EMPTY;
  if (previous?.fetched === today) return { ...previous, warnings: [] };
  const warnings = [];
  let calls = 0;

  // Inflacja (GUS).
  let cpi = prev.cpi ?? [];
  try {
    const csv = findCpiCsv(await getText(GUS_PAGE, 'GUS – wskaźniki cen (strona)', fetchImpl));
    calls++;
    if (!csv) throw new Error('GUS: nie znaleziono pliku CSV ze wskaźnikami cen');
    const parsed = parseCpiCsv(await getText(csv, 'GUS – wskaźniki cen (CSV)', fetchImpl, { decode: 'windows-1250' }));
    calls++;
    if (parsed.length < 12) throw new Error('GUS: nieoczekiwany format pliku ze wskaźnikami cen');
    cpi = parsed;
  } catch (err) {
    warnings.push(`${err.message} – inflacja z poprzedniej aktualizacji.`);
  }

  // Stopa referencyjna NBP.
  let ref = prev.ref ?? [];
  try {
    const [archive, current] = [await getText(NBP_ARCHIVE, 'NBP – archiwum stóp procentowych', fetchImpl), await getText(NBP_RATES, 'NBP – stopy procentowe', fetchImpl)];
    calls += 2;
    const parsed = parseNbpRates(archive, current);
    if (parsed.length < 5) throw new Error('NBP: nieoczekiwany format tabeli stóp procentowych');
    ref = parsed;
  } catch (err) {
    warnings.push(`${err.message} – stopa referencyjna z poprzedniej aktualizacji.`);
  }

  // Bieżąca oferta i parametry nowych serii.
  const series = { ...(prev.series ?? {}) };
  let offer = prev.offer ?? [];
  let offerMonth = prev.offerMonth ?? null;
  try {
    const links = parseOfferLinks(await getText(`${OFFER_BASE}/`, 'Obligacje skarbowe – oferta', fetchImpl));
    calls++;
    if (!links.length) throw new Error('obligacjeskarbowe.pl: nie znaleziono bieżącej oferty (strona mogła się zmienić)');
    for (const { code, url } of links) {
      if (series[code]?.rate1 > 0) continue;
      try {
        const p = parseSeriesPage(await getText(url, `Obligacje skarbowe – ${code}`, fetchImpl), code);
        calls++;
        if (p) series[code] = { ...p, month: seriesSaleMonth(code) };
        else warnings.push(`obligacjeskarbowe.pl: nie odczytano parametrów ${code}.`);
      } catch (err) {
        warnings.push(err.message);
      }
    }
    offer = links.map((l) => l.code).filter((c) => series[c]);
    offerMonth = offer.map(seriesSaleMonth).filter(Boolean).sort().at(-1) ?? offerMonth;
  } catch (err) {
    warnings.push(`${err.message} – oferta obligacji z poprzedniej aktualizacji.`);
  }

  if (!cpi.length && !ref.length && !Object.keys(series).length) return { ...(previous ?? EMPTY), warnings };
  return {
    updatedAt: now.toISOString(),
    fetched: warnings.length ? previous?.fetched ?? null : today,
    source: 'GUS (inflacja), NBP (stopa referencyjna), obligacjeskarbowe.pl (oferta)',
    cpi,
    cpiAsOf: cpi.at(-1)?.[0] ?? null,
    ref,
    series: Object.fromEntries(Object.entries(series).sort(([a], [b]) => (a < b ? -1 : 1))),
    offer,
    offerMonth,
    calls,
    warnings,
  };
}

export const readBonds = (docsDir) => readDataScript(docsDir, 'obligacje.js', 'GEM_OBLIGACJE');
export const writeBonds = (docsDir, data) => (data?.cpi?.length || data?.ref?.length ? writeDataScript(docsDir, 'obligacje.js', 'GEM_OBLIGACJE', data) : undefined);
