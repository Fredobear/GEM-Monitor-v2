import { toISO, parseISO, lastDayOfMonth } from '../src/lib/dates.js';

function weekdaysIn(month) {
  let n = 0;
  const last = Number(lastDayOfMonth(month).slice(8, 10));
  for (let day = 1; day <= last; day++) {
    const dow = parseISO(`${month}-${String(day).padStart(2, '0')}`).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

// Szereg dzienny (dni robocze); stopa zwrotu od końca do końca każdego pełnego miesiąca jest dokładnie równa `monthly`.
export function makeDaily(startIso, endIso, monthly, start = 100) {
  const out = [];
  const d = parseISO(startIso);
  const end = parseISO(endIso);
  let value = start;
  let prevMonth = null;
  let dailyRate = 0;
  while (d <= end) {
    const dow = d.getUTCDay();
    const iso = toISO(d);
    const month = iso.slice(0, 7);
    if (month !== prevMonth) {
      const r = typeof monthly === 'function' ? monthly(month) : monthly;
      dailyRate = (1 + r) ** (1 / weekdaysIn(month)) - 1;
      prevMonth = month;
    }
    if (dow !== 0 && dow !== 6) {
      value *= 1 + dailyRate;
      out.push({ date: iso, value });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const testConfig = {
  strategy: { variant: 'klasyczny', lookbackMonths: 12, skipMonths: 0, safeAssetRule: 'obligacje', switchBufferPct: 0, nearTiePct: 1 },
  variants: {
    klasyczny: { equities: ['US', 'EXUS'], absoluteRef: 'US', hurdle: 'TBILLS', safe: ['BONDS', 'TBILLS'] },
    rozszerzony: { equities: ['US', 'DEVX', 'EM'], absoluteRef: 'US', hurdle: 'TBILLS', safe: ['BONDS', 'TBILLS'] },
  },
  assets: Object.fromEntries(['US', 'EXUS', 'DEVX', 'EM', 'BONDS', 'TBILLS'].map((k) => [k, { name: k, proxy: k, xtb: { ticker: `${k}.X` } }])),
};
