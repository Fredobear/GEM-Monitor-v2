// Biblioteka danych Kennetha Frencha (Dartmouth): miesięczne stopy zwrotu całkowite rynków akcji w USD.
// Służy do długiego backtestu (od 1990 r.), nie do bieżącego sygnału – publikowana z ok. miesięcznym opóźnieniem.
import { fetchWithRetry } from '../lib/http.js';
import { readZip } from '../lib/zip.js';

const BASE = 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/';

export const FRENCH_FILES = {
  US: 'F-F_Research_Data_Factors_CSV.zip',
  DEVX: 'Developed_ex_US_3_Factors_CSV.zip',
  EM: 'Emerging_5_Factors_CSV.zip',
};

// Zwraca Map('YYYY-MM' -> { market, rf }) jako ułamki dziesiętne; market = (Mkt-RF) + RF.
export function parseFrenchMonthly(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.findIndex((l) => /^\s*,\s*Mkt-RF/.test(l));
  if (header < 0) throw new Error('Plik Frencha: nie znaleziono nagłówka Mkt-RF');
  const cols = lines[header].split(',').map((c) => c.trim());
  const iMkt = cols.indexOf('Mkt-RF');
  const iRf = cols.indexOf('RF');
  const out = new Map();
  for (let i = header + 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((c) => c.trim());
    if (!/^\d{6}$/.test(parts[0])) break; // koniec bloku miesięcznego
    const mktRf = Number(parts[iMkt]);
    const rf = Number(parts[iRf]);
    if (!Number.isFinite(mktRf) || !Number.isFinite(rf) || mktRf <= -99 || rf <= -99) continue;
    out.set(`${parts[0].slice(0, 4)}-${parts[0].slice(4, 6)}`, { market: (mktRf + rf) / 100, rf: rf / 100 });
  }
  if (out.size < 12) throw new Error('Plik Frencha: za mało danych miesięcznych');
  return out;
}

export async function frenchMonthly(file) {
  const res = await fetchWithRetry(BASE + file, { label: `Ken French ${file}`, timeoutMs: 60000 });
  if (!res.ok) throw new Error(`Ken French ${file}: HTTP ${res.status}`);
  const entries = readZip(Buffer.from(await res.arrayBuffer()));
  const csv = entries.find((e) => /\.csv$/i.test(e.name));
  if (!csv) throw new Error(`Ken French ${file}: brak pliku CSV w archiwum`);
  return parseFrenchMonthly(csv.data.toString('latin1'));
}
