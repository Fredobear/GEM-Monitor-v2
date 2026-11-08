// Tiingo: dzienne ceny skorygowane o dywidendy i splity (adjClose = stopa zwrotu całkowita).
// Darmowy klucz: https://www.tiingo.com (Account → API → Token).
import { fetchWithRetry } from '../lib/http.js';
import { normalizeSeries } from '../lib/series.js';

// field: 'adjClose' (stopa zwrotu całkowita, domyślnie) albo 'close' (cena z giełdy, do wyceny pozycji).
export async function tiingoDaily(ticker, startDate, apiKey, { field = 'adjClose', minPoints = 20, retries = 3 } = {}) {
  const label = `Tiingo ${ticker}`;
  const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(ticker.toLowerCase())}/prices?startDate=${startDate}&format=json`;
  const res = await fetchWithRetry(url, { label, retries, headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error('Tiingo: nieprawidłowy lub zablokowany klucz API (TIINGO_API_KEY)');
  if (res.status === 404) throw new Error(`${label}: ticker nie istnieje w Tiingo`);
  if (res.status === 429) throw new Error('Tiingo: przekroczony limit zapytań darmowego planu – spróbuj ponownie za godzinę');
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(`${label}: nieoczekiwana odpowiedź (${JSON.stringify(json).slice(0, 160)})`);
  const series = normalizeSeries(json.map((row) => ({ date: String(row.date).slice(0, 10), value: Number(row[field]) })));
  if (series.length < minPoints) throw new Error(`${label}: za mało notowań (${series.length})`);
  return series;
}
