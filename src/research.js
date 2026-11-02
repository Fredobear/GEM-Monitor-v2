// Długi backtest GEM na oficjalnych danych: Ken French (akcje USA, rynki rozwinięte bez USA, rynki wschodzące,
// bony skarbowe) + FRED (rentowności 5L i 10L → przybliżone obligacje). Okres: od 07.1991.
import { frenchMonthly, FRENCH_FILES } from './providers/french.js';
import { fredSeries } from './providers/fred.js';
import { monthEnds } from './lib/series.js';
import { addMonths } from './lib/dates.js';
import { runStrategy, runBuyAndHold, metrics, windowReturn } from './backtest.js';

// Cena obligacji z kuponem półrocznym; przepływy w latach t = T, T-0,5, ... > 0 (cena brudna).
export function bondPrice(coupon, yld, years) {
  const c = (coupon / 2) * 100;
  const y = yld / 2;
  let price = 0;
  for (let t = years; t > 1e-9; t -= 0.5) price += c / (1 + y) ** (2 * t);
  return price + 100 / (1 + y) ** (2 * years);
}

// Miesięczna stopa zwrotu obligacji kupionej po nominale na koniec m-1 i wycenionej po rentowności z końca m.
export function parBondReturns(monthEndYields, maturity) {
  const out = new Map();
  for (const [m, p] of monthEndYields) {
    const prev = monthEndYields.get(addMonths(m, -1));
    if (!prev) continue;
    out.set(m, bondPrice(prev.value / 100, p.value / 100, maturity - 1 / 12) / 100 - 1);
  }
  return out;
}

// Przybliżony udział rynków wschodzących w MSCI ACWI ex USA (interpolacja liniowa między punktami).
const EM_SHARE_ANCHORS = [
  ['1990', 0.05],
  ['1995', 0.08],
  ['2000', 0.08],
  ['2005', 0.14],
  ['2010', 0.24],
  ['2015', 0.22],
  ['2020', 0.3],
  ['2026', 0.28],
];
export function emShare(month) {
  const t = Number(month.slice(0, 4)) + (Number(month.slice(5, 7)) - 1) / 12;
  const pts = EM_SHARE_ANCHORS.map(([y, w]) => [Number(y), w]);
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (t - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

export async function loadLongHistory() {
  const [us, devx, em, dgs5, dgs10] = await Promise.all([
    frenchMonthly(FRENCH_FILES.US),
    frenchMonthly(FRENCH_FILES.DEVX),
    frenchMonthly(FRENCH_FILES.EM),
    fredSeries('DGS5', '1985-01-01'),
    fredSeries('DGS10', '1985-01-01'),
  ]);
  const b5 = parBondReturns(monthEnds(dgs5), 5);
  const b10 = parBondReturns(monthEnds(dgs10), 10);

  const monthly = { US: new Map(), DEVX: new Map(), EM: new Map(), EXUS: new Map(), BONDS: new Map(), TBILLS: new Map() };
  for (const [m, row] of us) {
    if (!devx.has(m) || !em.has(m) || !b5.has(m) || !b10.has(m)) continue;
    const w = emShare(m);
    monthly.US.set(m, row.market);
    monthly.TBILLS.set(m, row.rf);
    monthly.DEVX.set(m, devx.get(m).market);
    monthly.EM.set(m, em.get(m).market);
    monthly.EXUS.set(m, (1 - w) * devx.get(m).market + w * em.get(m).market);
    monthly.BONDS.set(m, 0.5 * b5.get(m) + 0.5 * b10.get(m));
  }
  const months = [...monthly.US.keys()].sort();
  return { monthly, first: months[0], last: months[months.length - 1] };
}

const EUR_ASSETS = new Set(['EXUS', 'DEVX']);
const touchesEur = (a, b) => EUR_ASSETS.has(a) || EUR_ASSETS.has(b);

// Scenariusze kosztów i podatków dla polskiego rezydenta. Koszt zmiany = sprzedaż + zakup.
export const SCENARIOS = {
  brutto: { label: 'Bez kosztów i podatków', switchCost: () => 0, taxRate: 0 },
  ike: { label: 'IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX)', switchCost: () => 0.01, taxRate: 0 },
  ike_tani_fx: { label: 'IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji)', switchCost: () => 0.003, taxRate: 0 },
  ike_usd: {
    label: 'IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR)',
    switchCost: (a, b) => 0.0058 + (touchesEur(a, b) ? 0.001 : 0),
    taxRate: 0,
  },
  oki_usd: {
    label: 'OKI od 2027 (0,85% wartości rocznie, subkonto USD)',
    switchCost: (a, b) => (touchesEur(a, b) ? 0.005 : 0),
    taxRate: 0,
    annualAssetTax: 0.0085,
  },
  zwykle_pln: { label: 'Konto zwykłe PLN (2 × 0,5% FX + 19% Belka)', switchCost: () => 0.01, taxRate: 0.19 },
  zwykle_usd: {
    label: 'Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka)',
    switchCost: (a, b) => (touchesEur(a, b) ? 0.005 : 0),
    taxRate: 0.19,
  },
};

const baseRules = {
  variant: 'klasyczny',
  equities: ['US', 'EXUS'],
  absoluteRef: 'US',
  hurdle: 'TBILLS',
  safe: ['BONDS', 'TBILLS'],
  lookbackMonths: 12,
  skipMonths: 0,
  safeAssetRule: 'obligacje',
  switchBufferPct: 0,
  nearTiePct: 1,
};

export const STRATEGIES = {
  gem: { label: 'GEM klasyczny (oryginał)', rules: baseRules },
  gem_bony: { label: 'GEM + wybór obligacje/bony', rules: { ...baseRules, safeAssetRule: 'lepsze_z_obligacji_i_bonow' } },
  gem_rozszerzony: { label: 'GEM rozszerzony (USA / rozwinięte / wschodzące)', rules: { ...baseRules, variant: 'rozszerzony', equities: ['US', 'DEVX', 'EM'] } },
  tylko_filtr: { label: 'Tylko filtr trendu (USA albo obligacje)', rules: { ...baseRules, equities: ['US'] } },
  gem_bufor: { label: 'GEM z buforem 2 pp', rules: { ...baseRules, switchBufferPct: 2 } },
  gem_12_1: { label: 'GEM 12-1 (bez ostatniego miesiąca)', rules: { ...baseRules, lookbackMonths: 11, skipMonths: 1 } },
};

const BENCHMARKS = {
  us_bh: { label: 'Kup i trzymaj: akcje USA', weights: { US: 1 } },
  exus_bh: { label: 'Kup i trzymaj: akcje poza USA', weights: { EXUS: 1 } },
  p6040: { label: '60/40: akcje USA / obligacje', weights: { US: 0.6, BONDS: 0.4 } },
};

export const WINDOWS = [
  { key: 'dotcom', label: 'Bańka internetowa (09.2000–09.2002)', from: '2000-09', to: '2002-09' },
  { key: 'gfc', label: 'Kryzys finansowy (11.2007–02.2009)', from: '2007-11', to: '2009-02' },
  { key: 'covid', label: 'Krach COVID (02–03.2020)', from: '2020-02', to: '2020-03' },
  { key: 'r2022', label: 'Bessa 2022 (akcje i obligacje)', from: '2022-01', to: '2022-12' },
  { key: 'odbicie2009', label: 'Odbicie po kryzysie (03.2009–12.2009)', from: '2009-03', to: '2009-12' },
];

export function runResearch({ monthly, first, last }) {
  // Pierwszy miesiąc z pozycją: po 12 miesiącach historii (+1 na decyzję).
  const from = addMonths(first, 13);
  const periods = {
    calosc: { label: `Cały okres (${from} – ${last})`, from, to: last },
    przed2014: { label: `Przed publikacją książki (${from} – 2013-12)`, from, to: '2013-12' },
    po2014: { label: `Po publikacji (2014-01 – ${last})`, from: '2014-01', to: last },
  };
  const rf = monthly.TBILLS;
  const out = { generatedAt: new Date().toISOString(), dataRange: { first, last }, periods: {}, windows: {}, scenarios: {}, lookbacks: {}, years: {} };

  for (const [pk, p] of Object.entries(periods)) {
    out.periods[pk] = { label: p.label, rows: {} };
    for (const [sk, s] of Object.entries(STRATEGIES)) {
      out.periods[pk].rows[sk] = { label: s.label, ...metrics(runStrategy({ monthly, rules: s.rules, from: p.from, to: p.to }), rf) };
    }
    for (const [bk, b] of Object.entries(BENCHMARKS)) {
      out.periods[pk].rows[bk] = { label: b.label, ...metrics(runBuyAndHold({ weights: b.weights, monthly, from: p.from, to: p.to }), rf) };
    }
  }

  const full = periods.calosc;
  const paths = {};
  for (const [sk, s] of Object.entries(STRATEGIES)) paths[sk] = runStrategy({ monthly, rules: s.rules, from: full.from, to: full.to }).path;
  for (const [bk, b] of Object.entries(BENCHMARKS)) paths[bk] = runBuyAndHold({ weights: b.weights, monthly, from: full.from, to: full.to }).path;
  for (const w of WINDOWS) {
    out.windows[w.key] = { label: w.label, values: Object.fromEntries(Object.entries(paths).map(([k, path]) => [k, windowReturn(path, w.from, w.to)])) };
  }
  out.years = Object.fromEntries(['gem', 'gem_bony', 'us_bh', 'p6040'].map((k) => [k, out.periods.calosc.rows[k].years]));

  for (const [ck, c] of Object.entries(SCENARIOS)) {
    out.scenarios[ck] = { label: c.label, rows: {} };
    for (const sk of ['gem', 'gem_bony', 'gem_bufor', 'gem_rozszerzony']) {
      const res = runStrategy({ monthly, rules: STRATEGIES[sk].rules, from: full.from, to: full.to, switchCost: c.switchCost, taxRate: c.taxRate, annualAssetTax: c.annualAssetTax ?? 0 });
      const m = metrics(res, rf);
      out.scenarios[ck].rows[sk] = { label: STRATEGIES[sk].label, cagr: m.cagr, cagrAfterLiquidation: m.cagrAfterLiquidation, maxDrawdown: m.maxDrawdown, taxPaid: res.taxPaid };
    }
    const bh = runBuyAndHold({ weights: { US: 1 }, monthly, from: full.from, to: full.to, taxRate: c.taxRate, annualAssetTax: c.annualAssetTax ?? 0 });
    const mb = metrics(bh, rf);
    out.scenarios[ck].rows.us_bh = { label: BENCHMARKS.us_bh.label, cagr: mb.cagr, cagrAfterLiquidation: mb.cagrAfterLiquidation, maxDrawdown: mb.maxDrawdown, taxPaid: 0 };
  }

  for (const lb of [3, 6, 9, 12]) {
    const rules = { ...baseRules, lookbackMonths: lb };
    const row = {};
    for (const [pk, p] of Object.entries(periods)) {
      const m = metrics(runStrategy({ monthly, rules, from: p.from, to: p.to }), rf);
      row[pk] = { cagr: m.cagr, maxDrawdown: m.maxDrawdown, sharpe: m.sharpe, switchesPerYear: m.switchesPerYear };
    }
    out.lookbacks[lb] = row;
  }

  out.signalLog = runStrategy({ monthly, rules: baseRules, from: full.from, to: full.to }).path.map((p) => ({ month: p.month, asset: p.asset }));

  // Statystyka zmian pozycji do kalkulatora kosztów brokerów: ile zmian rocznie i jaki ich odsetek dotyczy ETF-u w EUR.
  const changes = [];
  for (let i = 1; i < out.signalLog.length; i++) {
    const [a, b] = [out.signalLog[i - 1].asset, out.signalLog[i].asset];
    if (a !== b) changes.push([a, b]);
  }
  out.switchStats = {
    perYear: changes.length / (out.signalLog.length / 12),
    eurShare: changes.length ? changes.filter(([a, b]) => touchesEur(a, b)).length / changes.length : 0,
  };
  // Prawdopodobieństwo kolejnej pozycji po danej pozycji – do wyboru waluty zakupu (doradca walutowy).
  const counts = {};
  for (const [a, b] of changes) (counts[a] ??= {})[b] = (counts[a][b] ?? 0) + 1;
  out.transitions = Object.fromEntries(
    Object.entries(counts).map(([a, next]) => {
      const total = Object.values(next).reduce((s, n) => s + n, 0);
      return [a, Object.fromEntries(Object.entries(next).map(([b, n]) => [b, n / total]))];
    }),
  );
  return out;
}

const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${(x * 100).toFixed(d)}%`);
const num = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : x.toFixed(d));

export function researchMarkdown(r) {
  const lines = [];
  lines.push(`# Wyniki backtestu GEM (dane: ${r.dataRange.first} – ${r.dataRange.last})`, '');
  lines.push('Źródła: Ken French Data Library (akcje, bony skarbowe), FRED (rentowności 5L/10L → obligacje). Wygenerowano automatycznie poleceniem `npm run research`.', '');
  for (const p of Object.values(r.periods)) {
    lines.push(`## ${p.label}`, '');
    lines.push('| Strategia | CAGR | Zmienność | Sharpe | Maks. obsunięcie | Najgorsze 12 mies. | Zmiany/rok |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const row of Object.values(p.rows)) {
      lines.push(`| ${row.label} | ${pct(row.cagr)} | ${pct(row.volatility)} | ${num(row.sharpe)} | ${pct(row.maxDrawdown)} | ${pct(row.worst12m)} | ${num(row.switchesPerYear, 1)} |`);
    }
    lines.push('');
  }
  lines.push('## Zachowanie w kryzysach (skumulowana stopa zwrotu w oknie)', '');
  const keys = Object.keys(Object.values(r.windows)[0].values);
  const labels = { ...Object.fromEntries(Object.entries(STRATEGIES).map(([k, s]) => [k, s.label])), ...Object.fromEntries(Object.entries(BENCHMARKS).map(([k, b]) => [k, b.label])) };
  lines.push(`| Okno | ${keys.map((k) => labels[k]).join(' | ')} |`);
  lines.push(`|---|${keys.map(() => '---:').join('|')}|`);
  for (const w of Object.values(r.windows)) lines.push(`| ${w.label} | ${keys.map((k) => pct(w.values[k])).join(' | ')} |`);
  lines.push('');
  lines.push('## Koszty i podatki inwestora z Polski w XTB (cały okres)', '');
  lines.push('| Scenariusz | Strategia | CAGR | CAGR po likwidacji (po podatku) | Maks. obsunięcie |');
  lines.push('|---|---|---:|---:|---:|');
  for (const s of Object.values(r.scenarios)) {
    for (const row of Object.values(s.rows)) lines.push(`| ${s.label} | ${row.label} | ${pct(row.cagr)} | ${pct(row.cagrAfterLiquidation)} | ${pct(row.maxDrawdown)} |`);
  }
  lines.push('');
  lines.push('## Wrażliwość na długość okna momentum (GEM klasyczny)', '');
  lines.push('| Okno | CAGR całość | Maks. obs. całość | CAGR przed 2014 | CAGR po 2014 | Zmiany/rok |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [lb, row] of Object.entries(r.lookbacks)) {
    lines.push(`| ${lb} mies. | ${pct(row.calosc.cagr)} | ${pct(row.calosc.maxDrawdown)} | ${pct(row.przed2014.cagr)} | ${pct(row.po2014.cagr)} | ${num(row.calosc.switchesPerYear, 1)} |`);
  }
  lines.push('');
  lines.push('## Stopy zwrotu w latach kalendarzowych', '');
  const yearKeys = Object.keys(r.years.gem).filter((y) => r.signalLog.filter((s) => s.month.startsWith(y)).length === 12);
  lines.push('| Rok | GEM | GEM + bony | Akcje USA | 60/40 |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const y of yearKeys) lines.push(`| ${y} | ${pct(r.years.gem[y])} | ${pct(r.years.gem_bony[y])} | ${pct(r.years.us_bh[y])} | ${pct(r.years.p6040[y])} |`);
  lines.push('');
  return lines.join('\n');
}
