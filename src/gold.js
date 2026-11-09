// Złoto: cena 1 g złota w próbie 1000 wyliczana przez NBP (publiczne API api.nbp.pl, bez klucza, dni robocze).
// Dziennik finansowy wycenia nią sztabki i monety bulionowe (masa czystego złota × cena). To cena referencyjna –
// mennice skupują zwykle kilka procent taniej, a sprzedają drożej.
// Pierwsze uruchomienie pobiera historię od 2013 r. (NBP przyjmuje zapytania o przedział do 367 dni), kolejne –
// tylko ostatnie dni. Gdy NBP nie odpowiada, zostają ceny z poprzedniej aktualizacji.
import { fetchWithRetry } from './lib/http.js';
import { addDays, toISO } from './lib/dates.js';
import { readDataScript, writeDataScript } from './lib/datafile.js';

const API = 'https://api.nbp.pl/api/cenyzlota';
const START = '2013-01-02';
// Codzienne ceny z ostatnich ~13 miesięcy, wcześniej – ostatnia cena każdego miesiąca (do wykresu majątku).
const KEEP_DAILY = 400;

/** Odpowiedź NBP [{ data, cena }] → [[data, cena], …] rosnąco albo null (nieoczekiwany format). */
export function parseGold(json) {
  if (!Array.isArray(json)) return null;
  const out = [];
  for (const r of json) {
    const d = String(r?.data ?? '');
    const p = Number(r?.cena);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && p > 0) out.push([d, p]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Zostawia ceny z ostatnich `days` dni i ostatnią cenę każdego wcześniejszego miesiąca. */
export function thinDaily(pairs, days = KEEP_DAILY) {
  if (!pairs.length) return [];
  const cut = addDays(pairs[pairs.length - 1][0], -days);
  return pairs.filter(([d], i) => d >= cut || i === pairs.length - 1 || pairs[i + 1][0].slice(0, 7) !== d.slice(0, 7));
}

async function fetchRange(from, to, fetchImpl) {
  const res = await fetchImpl(`${API}/${from}/${to}?format=json`,{ label: `NBP – cena złota ${from}…${to}`, retries: 2, headers: { Accept: 'application/json' } });
  // 404 „Brak danych” – w przedziale nie było notowań (np. same dni wolne).
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`NBP (cena złota): HTTP ${res.status}`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('NBP (cena złota): nieoczekiwana odpowiedź');
  }
  const parsed = parseGold(json);
  if (!parsed) throw new Error('NBP (cena złota): nieoczekiwany format odpowiedzi');
  return parsed;
}

/** Aktualizacja cen złota. previous – poprzedni stan (docs/data/zloto.js). */
export async function buildGold({ previous = null, now = new Date(), fetchImpl = fetchWithRetry, start = START } = {}) {
  const today = toISO(now);
  if (previous?.fetched === today && previous?.prices?.length) return { ...previous, warnings: [] };
  const map = new Map(previous?.prices ?? []);
  const last = previous?.prices?.at(-1)?.[0];
  // Kilka dni zapasu: NBP publikuje cenę w dni robocze około południa.
  let from = last ? addDays(last, -7) : start;
  const warnings = [];
  let calls = 0;
  try {
    while (from <= today && calls < 20) {
      const to = addDays(from, 366) < today ? addDays(from, 366) : today;
      for (const [d, p] of await fetchRange(from, to, fetchImpl)) map.set(d, p);
      calls++;
      from = addDays(to, 1);
    }
  } catch (err) {
    warnings.push(`${err.message} – ceny złota z poprzedniej aktualizacji.`);
  }
  const prices = thinDaily([...map].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  if (!prices.length) return { ...(previous ?? {}), warnings: warnings.length ? warnings : ['NBP (cena złota): brak notowań.'] };
  if (warnings.length && previous?.prices?.length) return { ...previous, warnings };
  return { updatedAt: now.toISOString(), fetched: today, asOf: prices[prices.length - 1][0], source: 'NBP – cena 1 g złota (próba 1000), api.nbp.pl', currency: 'PLN', unit: 'g', prices, calls, warnings };
}

export const readGold = (docsDir) => readDataScript(docsDir, 'zloto.js', 'GEM_ZLOTO');
export const writeGold = (docsDir, data) => (data?.prices?.length ? writeDataScript(docsDir, 'zloto.js', 'GEM_ZLOTO', data) : undefined);
