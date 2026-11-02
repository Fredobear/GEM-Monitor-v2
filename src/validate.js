// Kontrole jakości danych: wykrywają błędy dostawcy, zanim przełożą się na błędny sygnał.
import { daysBetween } from './lib/dates.js';
import { decide } from './strategy.js';

// Jednodniowy ruch szerokiego ETF-u powyżej tego progu prawie zawsze oznacza błąd danych (np. brak korekty o split).
const MAX_DAILY_MOVE = 0.25;
const MAX_GAP_DAYS = 10;

export function sanityCheckSeries(series, label) {
  const issues = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    const move = cur.value / prev.value - 1;
    if (Math.abs(move) > MAX_DAILY_MOVE) {
      issues.push(`${label}: podejrzany ruch ${(move * 100).toFixed(1)}% między ${prev.date} a ${cur.date}`);
    }
    const gap = daysBetween(prev.date, cur.date);
    if (gap > MAX_GAP_DAYS) issues.push(`${label}: luka w danych ${gap} dni (${prev.date} → ${cur.date})`);
  }
  return issues;
}

// Porównuje stopy zwrotu z dwóch niezależnych źródeł i sprawdza, czy decyzja jest taka sama.
export function crossCheck(primary, secondary, rules, tolerancePct) {
  const diffs = {};
  let maxDiff = 0;
  for (const key of Object.keys(primary)) {
    if (!Number.isFinite(secondary[key])) continue;
    const d = (primary[key] - secondary[key]) * 100;
    diffs[key] = d;
    maxDiff = Math.max(maxDiff, Math.abs(d));
  }
  let secondaryAsset = null;
  try {
    secondaryAsset = decide(secondary, rules).asset;
  } catch {
    // brak kompletu danych w drugim źródle – porównujemy tylko stopy zwrotu
  }
  const primaryAsset = decide(primary, rules).asset;
  return {
    diffs,
    maxDiffPct: maxDiff,
    withinTolerance: maxDiff <= tolerancePct,
    sameDecision: secondaryAsset === null ? null : secondaryAsset === primaryAsset,
    secondaryAsset,
  };
}

// Najmniejszy margines (pp) dzielący sygnał od zmiany – im mniejszy, tym większe ryzyko „przeskoku”.
export function stability(decision) {
  const margins = [Math.abs(decision.excess)];
  if (decision.relativeMargin !== null) margins.push(decision.relativeMargin);
  if (decision.safeMargin !== null) margins.push(Math.abs(decision.safeMargin));
  const minPct = Math.min(...margins) * 100;
  const level = minPct >= 5 ? 'stabilny' : minPct >= 2 ? 'umiarkowany' : minPct >= 1 ? 'słaby' : 'na granicy';
  return { minMarginPct: minPct, level };
}
