// Alpha Vantage: miesięczne ceny skorygowane (koniec każdego miesiąca + ostatnia sesja bieżącego miesiąca).
// Darmowy klucz: https://www.alphavantage.co/support/#api-key (limit 25 zapytań dziennie).
import { fetchWithRetry } from '../lib/http.js';
import { normalizeSeries } from '../lib/series.js';

// Dzienne ceny zamknięcia (ostatnie ok. 100 sesji) – do wyceny ETF-ów UCITS, np. 'CSPX.LON', 'EXUS.DEX'.
export async function alphaVantageDaily(symbol, apiKey) {
  const label = `Alpha Vantage ${symbol}`;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, { label });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const json = await res.json();
  if (json['Error Message']) throw new Error(`${label}: symbol nieobsługiwany`);
  if (json.Note || json.Information) throw new Error(`Alpha Vantage: limit zapytań albo problem z kluczem – ${String(json.Note ?? json.Information).slice(0, 160)}`);
  const table = json['Time Series (Daily)'];
  if (!table) throw new Error(`${label}: brak danych w odpowiedzi`);
  return normalizeSeries(Object.entries(table).map(([date, row]) => ({ date, value: Number(row['4. close']) })));
}

export async function alphaVantageMonthly(ticker, apiKey) {
  const label = `Alpha Vantage ${ticker}`;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(url, { label });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const json = await res.json();
  if (json['Error Message']) throw new Error(`${label}: ${json['Error Message']}`);
  if (json.Note || json.Information) throw new Error(`Alpha Vantage: limit zapytań albo problem z kluczem – ${String(json.Note ?? json.Information).slice(0, 160)}`);
  const table = json['Monthly Adjusted Time Series'];
  if (!table) throw new Error(`${label}: brak danych w odpowiedzi`);
  return normalizeSeries(Object.entries(table).map(([date, row]) => ({ date, value: Number(row['5. adjusted close']) })));
}
