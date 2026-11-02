// FRED (Bank Rezerwy Federalnej w St. Louis): oficjalne dane makro, bez klucza API.
import { fetchText } from '../lib/http.js';

export function parseFredCsv(text) {
  const out = [];
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [date, raw] = line.split(',');
    const value = Number(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && raw !== '' && raw !== '.' && Number.isFinite(value)) out.push({ date, value });
  }
  return out;
}

export async function fredSeries(id, startDate) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}${startDate ? `&cosd=${startDate}` : ''}`;
  const series = parseFredCsv(await fetchText(url, { label: `FRED ${id}` }));
  if (!series.length) throw new Error(`FRED ${id}: pusta seria`);
  return series;
}
