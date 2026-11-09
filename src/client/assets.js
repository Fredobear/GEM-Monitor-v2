// Kryptowaluty, złoto i obligacje skarbowe: wspólne definicje i wycena (strona GEM i dziennik finansowy).
// Ceny publikuje GitHub Actions w plikach data/krypto.js, data/zloto.js i data/obligacje.js – to zwykłe skrypty z tej
// samej domeny, a ich wczytanie niczego nie wysyła (adres jest stały, bez danych użytkownika).
// Wartość obligacji skarbowych liczymy tutaj, według wzorów z listów emisyjnych Ministra Finansów: oprocentowanie
// w kolejnych okresach (inflacja GUS albo stopa referencyjna NBP + marża), kapitalizacja albo wypłata odsetek,
// opłata za przedterminowy wykup i podatek od odsetek.
import { instLoadScript } from './instruments.js';

export const GOLD_ASSET = 'ZLOTO';
export const CRYPTO_PREFIX = 'KRYPTO:';
export const BOND_PREFIX = 'OBLIGACJE:';
export const OZ_GRAMS = 31.1034768; // uncja trojańska

export const assetLoadGold = () => instLoadScript('data/zloto.js', 'GEM_ZLOTO');
export const assetLoadCrypto = () => instLoadScript('data/krypto.js', 'GEM_KRYPTO');
export const assetLoadBonds = () => instLoadScript('data/obligacje.js', 'GEM_OBLIGACJE');

export const isGoldLot = (l) => l?.asset === GOLD_ASSET;
export const isCryptoLot = (l) => typeof l?.asset === 'string' && l.asset.startsWith(CRYPTO_PREFIX);
export const isBondLot = (l) => typeof l?.asset === 'string' && l.asset.startsWith(BOND_PREFIX);
export const cryptoSymbol = (id) => `${CRYPTO_PREFIX}${id}`;
export const cryptoIdOf = (symbol) => String(symbol ?? '').slice(CRYPTO_PREFIX.length);
const astRound2 = (x) => Math.round(x * 100) / 100;
const astFold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

// ---------- Złoto ----------
// Wyroby inwestycyjne i masa czystego złota w jednej sztuce (g). Monety bulionowe 1 oz zawierają uncję czystego złota
// niezależnie od próby (np. Krugerrand w próbie 916,7 waży 33,93 g, ale złota ma 31,10 g). Sztabki – masa nominalna.
export const GOLD_PRODUCTS = [
  { id: 'moneta-1oz', name: 'Moneta bulionowa 1 oz (Krugerrand, Filharmonik, Maple Leaf, Orzeł Bielik, Kangur…)', fine: OZ_GRAMS },
  { id: 'moneta-1-2oz', name: 'Moneta bulionowa 1/2 oz', fine: OZ_GRAMS / 2 },
  { id: 'moneta-1-4oz', name: 'Moneta bulionowa 1/4 oz', fine: OZ_GRAMS / 4 },
  { id: 'moneta-1-10oz', name: 'Moneta bulionowa 1/10 oz', fine: OZ_GRAMS / 10 },
  ...[1, 2.5, 5, 10, 20, 31.1, 50, 100, 250, 500, 1000].map((g) => ({ id: `sztabka-${g}`, name: g === 31.1 ? 'Sztabka 1 oz (31,1 g)' : `Sztabka ${String(g).replace('.', ',')} g`, fine: g === 31.1 ? OZ_GRAMS : g })),
  { id: 'gramy', name: 'Złoto w gramach czystego kruszcu', fine: 1 },
  { id: 'inny', name: 'Inny wyrób – podaj masę i próbę', fine: null },
];
export const goldProduct = (id) => GOLD_PRODUCTS.find((p) => p.id === id) ?? null;
/** Masa czystego złota w sztuce (g): z wyrobu z listy albo masa × próba (np. 999,9 albo 916,7). */
export function goldFine(gold) {
  const p = goldProduct(gold?.product);
  if (p?.fine) return p.fine;
  const mass = Number(gold?.mass);
  const purity = Number(gold?.purity);
  return mass > 0 && purity > 0 && purity <= 1000 ? (mass * purity) / 1000 : null;
}

/** Wpis do wyceny (jak notowania instrumentu): cena 1 g czystego złota w złotych z NBP. */
export function goldEntry(data) {
  if (!data?.prices?.length) return null;
  return { currency: 'PLN', quotes: data.prices, series: [], source: 'nbp', proxy: null };
}

// ---------- Kryptowaluty ----------
/** Ceny [[data, cena w zł], …] kryptowaluty (identyfikator CoinGecko, np. „bitcoin”). */
export function cryptoQuotes(data, id) {
  const vals = data?.values?.[id];
  if (!vals) return [];
  const out = [];
  for (let i = 0; i < data.dates.length; i++) if (vals[i] !== null && vals[i] !== undefined) out.push([data.dates[i], vals[i]]);
  return out;
}
export const cryptoInfo = (data, id) => data?.coins?.find((c) => c.id === id) ?? null;
export function cryptoEntry(data, symbol) {
  const quotes = cryptoQuotes(data, cryptoIdOf(symbol));
  return quotes.length ? { currency: 'PLN', quotes, series: [], source: 'coingecko', proxy: null } : null;
}
/** Wyszukiwanie po symbolu (BTC), nazwie albo identyfikatorze; przy pustym polu – największe kryptowaluty. */
export function cryptoSearch(data, query, limit = 12) {
  const coins = data?.coins ?? [];
  const q = astFold(query).trim();
  if (!q) return coins.slice(0, limit);
  const scored = [];
  for (const c of coins) {
    const sym = c.symbol.toLowerCase();
    const name = astFold(c.name);
    let s = 0;
    if (sym === q) s = 100;
    else if (c.id === q || name === q) s = 95;
    else if (sym.startsWith(q)) s = 70;
    else if (name.startsWith(q) || c.id.startsWith(q)) s = 60;
    else if (name.includes(q) || c.id.includes(q)) s = 30;
    if (s) scored.push([s - Math.min(20, (c.rank ?? 999) / 50), c]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
}

// ---------- Obligacje skarbowe oszczędnościowe ----------
// months – czas do wykupu, step – długość okresu odsetkowego w miesiącach, kind – oprocentowanie od 2. okresu
// (stałe, inflacja + marża, stopa referencyjna NBP + marża), cap – kapitalizacja co rok (odsetki przy wykupie),
// pay – odsetki wypłacane po każdym okresie.
export const BOND_NOMINAL = 100;
export const BOND_TAX = 0.19;
export const BOND_TYPES = {
  OTS: { name: 'OTS – 3-miesięczne', months: 3, step: 3, kind: 'stale', cap: false, pay: false, info: 'stałe oprocentowanie, odsetki przy wykupie' },
  ROR: { name: 'ROR – roczne', months: 12, step: 1, kind: 'nbp', cap: false, pay: true, info: 'stopa referencyjna NBP + marża, odsetki co miesiąc' },
  DOR: { name: 'DOR – 2-letnie', months: 24, step: 1, kind: 'nbp', cap: false, pay: true, info: 'stopa referencyjna NBP + marża, odsetki co miesiąc' },
  TOS: { name: 'TOS – 3-letnie', months: 36, step: 12, kind: 'stale', cap: true, pay: false, info: 'stałe oprocentowanie, odsetki dopisywane co rok' },
  COI: { name: 'COI – 4-letnie', months: 48, step: 12, kind: 'inflacja', cap: false, pay: true, info: 'od 2. roku inflacja + marża, odsetki wypłacane co rok' },
  ROS: { name: 'ROS – 6-letnie rodzinne', months: 72, step: 12, kind: 'inflacja', cap: true, pay: false, info: 'od 2. roku inflacja + marża, odsetki dopisywane co rok (dla rodzin z 800+)' },
  EDO: { name: 'EDO – 10-letnie', months: 120, step: 12, kind: 'inflacja', cap: true, pay: false, info: 'od 2. roku inflacja + marża, odsetki dopisywane co rok' },
  ROD: { name: 'ROD – 12-letnie rodzinne', months: 144, step: 12, kind: 'inflacja', cap: true, pay: false, info: 'od 2. roku inflacja + marża, odsetki dopisywane co rok (dla rodzin z 800+)' },
};

/** Opłata za przedterminowy wykup (zł za obligację) według list emisyjnych; od 1.09.2024 wyższa dla części obligacji. */
export function bondDefaultFee(type, date = '') {
  const late = date >= '2024-09-01';
  return { OTS: 0, ROR: 0.5, DOR: 0.7, TOS: late ? 1 : 0.7, COI: late ? 2 : 0.7, ROS: late ? 2 : 0.7, EDO: late ? 3 : 2, ROD: late ? 3 : 2 }[type] ?? 0;
}

const bondUTC = (iso) => Date.parse(`${iso}T00:00:00Z`);
const bondIso = (t) => new Date(t).toISOString().slice(0, 10);
export const bondDays = (a, b) => Math.round((bondUTC(b) - bondUTC(a)) / 86400000);
/** Data przesunięta o n miesięcy z zachowaniem dnia (31 → ostatni dzień krótszego miesiąca). */
export function bondShift(iso, n, day = Number(iso.slice(8, 10))) {
  const t = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + n;
  const y = Math.floor(t / 12);
  const m = t - y * 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
const bondMonthShift = (month, n) => bondShift(`${month}-01`, n).slice(0, 7);

/** Kod serii z rodzaju i daty zakupu, np. EDO kupione 9.11.2026 → EDO1136 (miesiąc i rok wykupu). */
export function bondSeries(type, date) {
  const t = BOND_TYPES[type];
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
  const m = bondShift(date, t.months);
  return `${type}${m.slice(5, 7)}${m.slice(2, 4)}`;
}

/** Okresy odsetkowe od dnia zakupu: [{ k, start, end }] (koniec okresu = początek następnego). */
export function bondPeriods(type, date) {
  const t = BOND_TYPES[type];
  if (!t) return [];
  const day = Number(date.slice(8, 10));
  return Array.from({ length: t.months / t.step }, (_, i) => ({ k: i + 1, start: i ? bondShift(date, i * t.step, day) : date, end: bondShift(date, (i + 1) * t.step, day) }));
}
export const bondMaturity = (lot) => (BOND_TYPES[lot?.bond?.type] && lot.date ? bondShift(lot.date, BOND_TYPES[lot.bond.type].months) : null);

// Święta ustawowe w Polsce (do dni roboczych w regule stopy referencyjnej dla ROR i DOR). Wigilia – od 2025 r.
function bondEaster(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const bondHolidayCache = new Map();
function bondHolidays(y) {
  if (bondHolidayCache.has(y)) return bondHolidayCache.get(y);
  const e = bondUTC(bondEaster(y));
  const set = new Set(['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'].map((d) => `${y}-${d}`));
  if (y >= 2025) set.add(`${y}-12-24`);
  for (const n of [0, 1, 49, 60]) set.add(bondIso(e + n * 86400000));
  bondHolidayCache.set(y, set);
  return set;
}
/** Dziesiąty dzień roboczy (bez sobót, niedziel i świąt) przed pierwszym dniem miesiąca – dzień ustalenia stopy NBP. */
export function bondRefDate(month) {
  let t = bondUTC(`${month}-01`);
  let n = 0;
  while (n < 10) {
    t -= 86400000;
    const iso = bondIso(t);
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6 && !bondHolidays(Number(iso.slice(0, 4))).has(iso)) n++;
  }
  return bondIso(t);
}

const bondCpiCache = new WeakMap();
/** Inflacja r/r (%) ogłoszona przez GUS w miesiącu przed początkiem okresu, czyli za miesiąc o dwa wcześniejszy. */
export function bondCpi(data, start) {
  if (!data?.cpi?.length) return null;
  let map = bondCpiCache.get(data);
  if (!map) {
    map = new Map(data.cpi);
    bondCpiCache.set(data, map);
  }
  const v = map.get(bondMonthShift(start.slice(0, 7), -2));
  return v === undefined ? null : v;
}
/** Stopa referencyjna NBP (%) z 10. dnia roboczego przed pierwszym dniem miesiąca, w którym zaczyna się okres. */
export function bondRef(data, start) {
  const pairs = data?.ref;
  if (!pairs?.length) return null;
  const d = bondRefDate(start.slice(0, 7));
  if (d < pairs[0][0]) return null;
  let found = null;
  for (const p of pairs) {
    if (p[0] <= d) found = p;
    else break;
  }
  return found ? found[1] : null;
}

/** Oprocentowanie okresu k (ułamek, np. 0.0535) albo null, gdy nie ma jeszcze danych (inflacji lub stopy NBP). */
export function bondRate(lot, k, data, periods = bondPeriods(lot.bond.type, lot.date)) {
  const b = lot.bond;
  const t = BOND_TYPES[b.type];
  if (k <= 1 || t.kind === 'stale') return Number(b.rate1) / 100;
  const manual = b.rates?.[k];
  if (manual !== undefined && manual !== null && manual !== '' && Number.isFinite(Number(manual))) return Number(manual) / 100;
  const start = periods[k - 1]?.start;
  if (!start) return null;
  const base = t.kind === 'inflacja' ? bondCpi(data, start) : bondRef(data, start);
  if (base === null) return null;
  // Ujemna inflacja (deflacja) albo ujemna stopa NBP – przyjmuje się zero, zostaje marża.
  return Math.round((Math.max(0, base) + (Number(b.margin) || 0)) * 1e6) / 1e8;
}

/** Odsetki wypłacane za pełny okres od jednej obligacji (COI: N·r; ROR, DOR: N·r/12), zaokrąglone do grosza. */
export const bondCoupon = (type, r) => astRound2((BOND_NOMINAL * r * BOND_TYPES[type].step) / 12);

/**
 * Stan jednej obligacji w dniu `date`: okres odsetkowy, oprocentowanie, wartość (nominał + odsetki narosłe, z dopisanymi
 * przy kapitalizacji), odsetki już wypłacone (COI, ROR, DOR) i czy to szacunek (brak inflacji lub stopy NBP).
 * Wzory z list emisyjnych: kapitalizacja N·Π(1+rⱼ)·(1+rₖ·a/ACT), COI N·(1+r·a/ACT), ROR/DOR N·(1+r·a/(ACT·12)).
 */
export function bondState(lot, date, data) {
  const b = lot?.bond;
  const t = BOND_TYPES[b?.type];
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(lot.date ?? '') || !(Number(b.rate1) > 0)) return null;
  const N = BOND_NOMINAL;
  const periods = bondPeriods(b.type, lot.date);
  const maturity = periods[periods.length - 1].end;
  const matured = date >= maturity;
  const k = matured ? periods.length : Math.max(1, periods.findIndex((p) => date < p.end) + 1);
  let capital = N;
  let paid = 0;
  let estimated = false;
  const rates = [];
  const rateOf = (j) => {
    let r = bondRate(lot, j, data, periods);
    if (r === null) {
      estimated = true;
      r = rates.length ? rates[rates.length - 1] : Number(b.rate1) / 100;
    }
    rates.push(r);
    return r;
  };
  for (let j = 1; j < k; j++) {
    const r = rateOf(j);
    if (t.cap) capital *= 1 + r;
    else if (t.pay) paid += bondCoupon(b.type, r);
  }
  const r = rateOf(k);
  const p = periods[k - 1];
  const act = bondDays(p.start, p.end);
  const a = matured ? act : Math.min(act, Math.max(0, bondDays(p.start, date)));
  const exact = t.cap ? capital * (1 + (r * a) / act) : N * (1 + (r * a * t.step) / (act * 12));
  const value = matured && t.pay ? N + bondCoupon(b.type, r) : astRound2(exact);
  return { type: b.type, k, n: periods.length, start: p.start, end: p.end, rate: r, rates, maturity, matured, value, interest: astRound2(value - N), paid: astRound2(paid), estimated };
}

/** Wartość jednej obligacji do wyceny konta (bez danych o inflacji – szacunek ze stałym oprocentowaniem). */
export const bondLotPrice = (data, lot, date) => bondState(lot, date, data)?.value ?? lot.price;

/**
 * Ile dostaniesz za jedną obligację przy przedterminowym wykupie w dniu stanu: opłata (najwyżej narosłe odsetki
 * w 1. okresie i przy kapitalizacji), podatek 19% od odsetek (poza IKE/IKZE – tam bez opłaty i podatku).
 * OTS przy przedterminowym wykupie nie daje odsetek.
 */
export function bondRedeem(lot, st) {
  if (!st) return null;
  const b = lot.bond;
  const t = BOND_TYPES[b.type];
  const N = BOND_NOMINAL;
  const ike = Boolean(b.ike);
  let gross;
  if (st.matured) gross = st.value;
  else if (b.type === 'OTS') gross = N;
  else {
    const fee = ike ? 0 : Number(b.fee ?? bondDefaultFee(b.type, lot.date)) || 0;
    gross = st.value - fee;
    if ((t.cap || st.k === 1) && gross < N) gross = N;
  }
  gross = astRound2(gross);
  const tax = ike ? 0 : astRound2(Math.max(0, gross - N) * BOND_TAX);
  return { gross, fee: astRound2(Math.max(0, st.value - gross)), tax, net: astRound2(gross - tax) };
}

/** Najbliższa wypłata od jednej obligacji: odsetki za bieżący okres (COI, ROR, DOR) albo wykup. */
export function bondNextPayout(lot, st) {
  if (!st || st.matured) return null;
  const t = BOND_TYPES[lot.bond.type];
  if (t.pay) return { date: st.end, gross: bondCoupon(lot.bond.type, st.rate), last: st.end === st.maturity };
  return { date: st.maturity, gross: null, last: true };
}

/**
 * Wypłaty z obligacji w przedziale [from, to]: odsetki po okresach (COI, ROR, DOR), a przy wykupie – odsetki
 * (obligacje z kapitalizacją i OTS) i zwrot wartości nominalnej. Kwoty od jednej obligacji, brutto.
 * Wypłata, której oprocentowania jeszcze nie znamy (brak danych), czeka na następną aktualizację.
 */
export function bondEvents(lot, data, from, to) {
  const t = BOND_TYPES[lot?.bond?.type];
  if (!t || !lot.date) return [];
  const periods = bondPeriods(lot.bond.type, lot.date);
  const maturity = periods[periods.length - 1].end;
  const sold = lot.until && lot.until < maturity ? lot.until : null;
  const inRange = (d) => d >= from && d <= to && !(sold && d >= sold);
  const out = [];
  let interestAtMaturity = t.pay;
  if (t.pay) {
    for (const p of periods) {
      if (!inRange(p.end)) continue;
      const r = bondRate(lot, p.k, data, periods);
      if (r === null) {
        if (p.end === maturity) interestAtMaturity = false;
        continue;
      }
      out.push({ key: `bond|${lot.id}|${p.k}`, date: p.end, kind: 'odsetki', k: p.k, perBond: bondCoupon(lot.bond.type, r) });
    }
  } else if (inRange(maturity)) {
    const st = bondState(lot, maturity, data);
    if (st && !st.estimated) {
      out.push({ key: `bond|${lot.id}|${periods.length}`, date: maturity, kind: 'odsetki', k: periods.length, perBond: st.interest });
      interestAtMaturity = true;
    }
  }
  if (inRange(maturity) && interestAtMaturity) out.push({ key: `bond|${lot.id}|wykup`, date: maturity, kind: 'wykup', perBond: BOND_NOMINAL });
  return out;
}

/** Parametry serii z pliku danych (oprocentowanie w 1. okresie, marża, opłata) albo null, gdy serii nie ma w tabeli. */
export const bondSeriesParams = (data, code) => (code && data?.series?.[code]) || null;
