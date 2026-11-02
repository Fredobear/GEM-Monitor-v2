// Wylicza oficjalny sygnał miesięczny, podgląd w trakcie miesiąca i historię sygnałów.
import { monthEnds, monthlyMomentum, rollingMomentum } from './lib/series.js';
import { monthOf, addMonths, lastWeekdayOfMonth, daysBetween, toISO } from './lib/dates.js';
import { decide, decisionAssets } from './strategy.js';

export class DataError extends Error {}

// Tolerancja na święta giełdowe przy sprawdzaniu, czy miesiąc ma notowanie z ostatniej sesji.
const MONTH_END_TOLERANCE_DAYS = 4;

function returnsAt(ends, keys, month, rules) {
  const out = {};
  for (const key of keys) {
    const m = ends[key] && monthlyMomentum(ends[key], month, rules.lookbackMonths, rules.skipMonths);
    if (m) out[key] = m.ret;
  }
  return out;
}

const hasAll = (returns, keys) => keys.every((k) => Number.isFinite(returns[k]));

export function computeSignals({ series, rules, tracked = [], now = new Date(), historyMonths = 36, maxStaleDays = 5 }) {
  const warnings = [];
  const today = toISO(now);
  const currentMonth = monthOf(today);
  const officialMonth = addMonths(currentMonth, -1);
  const required = decisionAssets(rules);
  const shown = [...new Set([...required, ...tracked])].filter((k) => series[k]?.length);

  for (const key of required) {
    if (!series[key]?.length) throw new DataError(`Brak danych dla rynku ${key}`);
  }

  const ends = Object.fromEntries(shown.map((k) => [k, monthEnds(series[k])]));

  // Oficjalny sygnał wymaga notowania z ostatniej sesji zakończonego miesiąca dla każdego rynku decyzyjnego.
  const expectedEnd = lastWeekdayOfMonth(officialMonth);
  const endDates = new Set();
  for (const key of required) {
    const p = ends[key].get(officialMonth);
    if (!p) throw new DataError(`Brak notowań ${key} za ${officialMonth} – sygnał miesięczny nie może zostać wyliczony`);
    if (daysBetween(p.date, expectedEnd) > MONTH_END_TOLERANCE_DAYS) {
      throw new DataError(`Niekompletne dane ${key}: ostatnie notowanie w ${officialMonth} to ${p.date}, oczekiwano ok. ${expectedEnd}`);
    }
    endDates.add(p.date);
  }
  if (endDates.size > 1) warnings.push(`Rynki mają różne daty końca miesiąca (${[...endDates].join(', ')}) – sprawdź dane.`);

  // Historia liczona od najstarszego możliwego miesiąca, by bufor (jeśli włączony) miał poprawny łańcuch pozycji.
  const firstMonths = required.map((k) => [...ends[k].keys()][0]).sort();
  let month = addMonths(firstMonths[firstMonths.length - 1], rules.lookbackMonths + rules.skipMonths);
  const history = [];
  let previous = null;
  for (; month <= officialMonth; month = addMonths(month, 1)) {
    const r = returnsAt(ends, shown, month, rules);
    if (!hasAll(r, required)) continue;
    const d = decide(r, rules, previous);
    history.push({ month, forMonth: addMonths(month, 1), asset: d.asset, previous, changed: previous !== null && previous !== d.asset, returns: r, decision: d });
    previous = d.asset;
  }
  const last = history[history.length - 1];
  if (!last || last.month !== officialMonth) {
    throw new DataError(`Za krótka historia danych, by policzyć ${rules.lookbackMonths}-miesięczne momentum za ${officialMonth}`);
  }

  const official = {
    month: officialMonth,
    forMonth: last.forMonth,
    asOf: [...endDates].sort().pop(),
    returns: last.returns,
    decision: last.decision,
    previous: last.previous,
    changed: last.changed,
  };

  // Podgląd: ten sam algorytm na najnowszych notowaniach (kroczące 12 miesięcy do dziś).
  const lastCommon = required.map((k) => series[k][series[k].length - 1].date).sort()[0];
  let preview = null;
  if (monthOf(lastCommon) > officialMonth) {
    const r = {};
    for (const key of shown) {
      const m = rollingMomentum(series[key], lastCommon, rules.lookbackMonths, rules.skipMonths);
      if (m) r[key] = m.ret;
    }
    if (hasAll(r, required)) {
      const d = decide(r, rules, official.decision.asset);
      preview = { asOf: lastCommon, returns: r, decision: d, differsFromOfficial: d.asset !== official.decision.asset };
    }
  }

  const age = daysBetween(lastCommon, today);
  if (age > maxStaleDays) warnings.push(`Najnowsze notowania pochodzą z ${lastCommon} (${age} dni temu) – dane mogą być nieaktualne.`);

  const recent = history.slice(-historyMonths);
  const switches = recent.filter((h) => h.changed).length;

  return {
    generatedAt: now.toISOString(),
    rules,
    official,
    preview,
    history: recent.map(({ decision, ...h }) => ({ ...h, excess: decision.excess, nearTie: decision.nearTie })),
    switchesInHistory: switches,
    nextDecisionDate: lastWeekdayOfMonth(currentMonth),
    lastDataDate: lastCommon,
    warnings,
  };
}
