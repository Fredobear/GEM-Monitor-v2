// Backtest miesięczny: decyzja na koniec miesiąca m (dane do m włącznie), pozycja trzymana w miesiącu m+1.
// Dzięki temu nie ma „zaglądania w przyszłość”. Opcjonalnie: koszt każdej zmiany pozycji i podatek Belki.
import { addMonths } from './lib/dates.js';
import { monthlyMomentum } from './lib/series.js';
import { decide, decisionAssets } from './strategy.js';

// Indeks wartości z miesięcznych stóp zwrotu: Map('YYYY-MM' -> { date, value }), baza 1 przed pierwszym miesiącem.
export function buildIndex(returns) {
  const months = [...returns.keys()].sort();
  const index = new Map();
  if (!months.length) return index;
  let level = 1;
  index.set(addMonths(months[0], -1), { date: addMonths(months[0], -1), value: level });
  for (const m of months) {
    level *= 1 + returns.get(m);
    index.set(m, { date: m, value: level });
  }
  return index;
}

// Podatek od zysków kapitałowych rozliczany rocznie, ze stratami przenoszonymi na kolejne lata (uproszczenie).
class TaxLedger {
  constructor(rate) {
    this.rate = rate;
    this.realized = 0;
    this.carry = 0;
    this.paid = 0;
  }
  realize(gain) {
    this.realized += gain;
  }
  settle() {
    let taxable = this.realized;
    this.realized = 0;
    if (taxable < 0) {
      this.carry -= taxable;
      return 0;
    }
    const offset = Math.min(this.carry, taxable);
    this.carry -= offset;
    taxable -= offset;
    const tax = taxable * this.rate;
    this.paid += tax;
    return tax;
  }
}

// annualAssetTax – podatek od wartości aktywów (np. OKI), pobierany w przybliżeniu co miesiąc (1/12 stawki).
export function runStrategy({ monthly, rules, from, to, switchCost = () => 0, taxRate = 0, annualAssetTax = 0 }) {
  const keys = decisionAssets(rules);
  const indexes = Object.fromEntries(keys.map((k) => [k, buildIndex(monthly[k])]));
  const ledger = new TaxLedger(taxRate);
  let value = 1;
  let basis = 1;
  let previous = null;
  let switches = 0;
  const path = [];

  for (let month = from; month <= to; month = addMonths(month, 1)) {
    const signalMonth = addMonths(month, -1);
    const r = {};
    for (const k of keys) {
      const m = monthlyMomentum(indexes[k], signalMonth, rules.lookbackMonths, rules.skipMonths);
      if (m) r[k] = m.ret;
    }
    if (!keys.every((k) => Number.isFinite(r[k]))) {
      if (path.length) break; // dziura w danych w środku okresu – kończymy, nie zgadujemy
      continue;
    }
    const d = decide(r, rules, previous);
    if (previous && d.asset !== previous) {
      switches++;
      if (taxRate) ledger.realize(value - basis);
      value *= 1 - switchCost(previous, d.asset);
      basis = value;
    }
    const ret = monthly[d.asset].get(month);
    if (!Number.isFinite(ret)) break;
    value *= 1 + ret;
    if (annualAssetTax) value *= 1 - annualAssetTax / 12;
    if (taxRate && month.endsWith('-12')) {
      const tax = ledger.settle();
      if (tax > 0) {
        basis *= (value - tax) / value;
        value -= tax;
      }
    }
    path.push({ month, asset: d.asset, value, signal: r, decision: d });
    previous = d.asset;
  }

  let liquidationValue = value;
  if (taxRate && path.length) {
    ledger.realize(value - basis);
    liquidationValue = value - ledger.settle();
  }
  return { path, switches, liquidationValue, taxPaid: ledger.paid };
}

export function runBuyAndHold({ weights, monthly, from, to, taxRate = 0, annualAssetTax = 0 }) {
  let value = 1;
  const path = [];
  for (let month = from; month <= to; month = addMonths(month, 1)) {
    let ret = 0;
    for (const [k, w] of Object.entries(weights)) {
      const r = monthly[k].get(month);
      if (!Number.isFinite(r)) return finish();
      ret += w * r;
    }
    value *= 1 + ret;
    if (annualAssetTax) value *= 1 - annualAssetTax / 12;
    path.push({ month, asset: Object.keys(weights).join('+'), value });
  }
  return finish();
  function finish() {
    // Rebalansowanie portfela mieszanego realizuje niewielkie zyski – pomijamy (uproszczenie na korzyść B&H).
    const liquidationValue = taxRate && value > 1 ? value - (value - 1) * taxRate : value;
    return { path, switches: 0, liquidationValue, taxPaid: 0 };
  }
}

export function metrics(result, rf) {
  const { path } = result;
  if (!path.length) return null;
  const n = path.length;
  const rets = path.map((p, i) => p.value / (i ? path[i - 1].value : 1) - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const excess = rets.map((r, i) => r - (rf.get(path[i].month) ?? 0));
  const exMean = excess.reduce((a, b) => a + b, 0) / n;
  const exSd = Math.sqrt(excess.reduce((a, b) => a + (b - exMean) ** 2, 0) / (n - 1));

  let peak = 1;
  let peakMonth = addMonths(path[0].month, -1);
  let maxDD = 0;
  let ddPeak = null;
  let ddTrough = null;
  for (const p of path) {
    if (p.value > peak) {
      peak = p.value;
      peakMonth = p.month;
    }
    const dd = p.value / peak - 1;
    if (dd < maxDD) {
      maxDD = dd;
      ddPeak = peakMonth;
      ddTrough = p.month;
    }
  }

  const years = {};
  for (let i = 0; i < n; i++) {
    const y = path[i].month.slice(0, 4);
    years[y] = (years[y] ?? 1) * (1 + rets[i]);
  }
  for (const y of Object.keys(years)) years[y] -= 1;
  const fullYears = Object.entries(years).filter(([y]) => path.filter((p) => p.month.startsWith(y)).length === 12);

  let worst12 = Infinity;
  for (let i = 12; i <= n; i++) {
    const start = i === 12 ? 1 : path[i - 13].value;
    worst12 = Math.min(worst12, path[i - 1].value / start - 1);
  }

  const timeIn = {};
  for (const p of path) timeIn[p.asset] = (timeIn[p.asset] ?? 0) + 1 / n;

  const yearsCount = n / 12;
  return {
    from: path[0].month,
    to: path[n - 1].month,
    months: n,
    cagr: path[n - 1].value ** (1 / yearsCount) - 1,
    cagrAfterLiquidation: result.liquidationValue ** (1 / yearsCount) - 1,
    volatility: sd * Math.sqrt(12),
    sharpe: exSd > 0 ? (exMean * 12) / (exSd * Math.sqrt(12)) : null,
    maxDrawdown: maxDD,
    maxDrawdownPeak: ddPeak,
    maxDrawdownTrough: ddTrough,
    worst12m: Number.isFinite(worst12) ? worst12 : null,
    worstYear: fullYears.length ? Math.min(...fullYears.map(([, r]) => r)) : null,
    bestYear: fullYears.length ? Math.max(...fullYears.map(([, r]) => r)) : null,
    years,
    timeIn,
    switches: result.switches,
    switchesPerYear: result.switches / yearsCount,
    finalValue: path[n - 1].value,
  };
}

// Skumulowana stopa zwrotu w oknie (np. kryzys 2008) dla gotowej ścieżki.
export function windowReturn(path, from, to) {
  const inWindow = path.filter((p) => p.month >= from && p.month <= to);
  if (!inWindow.length) return null;
  const idx = path.indexOf(inWindow[0]);
  const start = idx === 0 ? 1 : path[idx - 1].value;
  return inWindow[inWindow.length - 1].value / start - 1;
}
