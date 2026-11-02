// Szeregi czasowe: tablice { date: 'YYYY-MM-DD', value: number } posortowane rosnąco.
import { monthOf, addMonths, shiftMonthsISO } from './dates.js';

export function normalizeSeries(points) {
  const byDate = new Map();
  for (const p of points) {
    if (!p || typeof p.date !== 'string' || !Number.isFinite(p.value) || p.value <= 0) continue;
    byDate.set(p.date.slice(0, 10), p.value);
  }
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
}

// Ostatnia obserwacja każdego miesiąca kalendarzowego: Map('YYYY-MM' -> {date, value}).
export function monthEnds(series) {
  const map = new Map();
  for (const p of series) map.set(monthOf(p.date), p);
  return map;
}

// Ostatnia obserwacja z datą <= iso (wyszukiwanie binarne).
export function valueOnOrBefore(series, iso) {
  let lo = 0;
  let hi = series.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= iso) {
      found = series[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Stopa zwrotu z cen na koniec miesięcy: P(M - skip) / P(M - skip - lookback) - 1.
export function monthlyMomentum(ends, month, lookback, skip = 0) {
  const end = ends.get(addMonths(month, -skip));
  const start = ends.get(addMonths(month, -skip - lookback));
  if (!end || !start) return null;
  return { ret: end.value / start.value - 1, start, end };
}

// Momentum kroczące do dowolnego dnia (podgląd w trakcie miesiąca).
export function rollingMomentum(series, iso, lookback, skip = 0) {
  const end = valueOnOrBefore(series, shiftMonthsISO(iso, -skip));
  const start = valueOnOrBefore(series, shiftMonthsISO(iso, -skip - lookback));
  if (!end || !start || start.date === end.date) return null;
  return { ret: end.value / start.value - 1, start, end };
}

// Miesięczne stopy zwrotu z cen na koniec miesięcy: Map('YYYY-MM' -> r).
export function monthlyReturns(ends) {
  const out = new Map();
  for (const [m, p] of ends) {
    const prev = ends.get(addMonths(m, -1));
    if (prev) out.set(m, p.value / prev.value - 1);
  }
  return out;
}
