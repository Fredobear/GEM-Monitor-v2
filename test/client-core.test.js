import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lastOnOrBefore,
  fxForTax,
  fxAt,
  makePricer,
  buildTimeline,
  rangeStats,
  realizedGains,
  harvestCandidates,
  holdings,
  contributions,
  planContributions,
  brokerCost,
  mergeTransactions,
  validateTx,
  rebase,
  isoAddMonths,
  currencyAdvice,
  currencyAdviceText,
} from '../src/client/core.js';
import podatki from '../config/podatki.js';

const fx = {
  USD: [
    ['2026-03-05', 4.0], // czwartek
    ['2026-03-06', 4.1], // piątek
    ['2026-03-09', 4.2], // poniedziałek
    ['2026-03-10', 4.2],
    ['2026-03-11', 4.2],
  ],
};
const prices = {
  fx,
  instruments: {
    'CSPX.UK': {
      currency: 'USD',
      series: [
        ['2026-03-05', 50],
        ['2026-03-06', 50],
        ['2026-03-09', 55],
        ['2026-03-10', 55],
        ['2026-03-11', 55],
      ],
      quotes: [],
    },
  },
};
const tx = (o) => ({ id: Math.random().toString(36).slice(2), account: 'ZWYKLE', currency: 'USD', ticker: 'CSPX.UK', feePLN: 0, createdAt: 0, ...o });

test('wyszukiwanie dat i kurs NBP z dnia poprzedniego (art. 11a)', () => {
  assert.deepEqual(lastOnOrBefore(fx.USD, '2026-03-08'), ['2026-03-06', 4.1]);
  assert.equal(fxForTax(fx, 'USD', '2026-03-09'), 4.1); // transakcja w poniedziałek → kurs z piątku
  assert.equal(fxAt(fx, 'USD', '2026-03-09'), 4.2);
  assert.equal(fxForTax(fx, 'PLN', '2026-03-09'), 1);
  assert.equal(isoAddMonths('2026-03-31', -1), '2026-02-28');
});

test('wycena: cena transakcyjna przesuwana o zmianę indeksu, świeże notowanie ma pierwszeństwo', () => {
  const txs = [tx({ type: 'kupno', date: '2026-03-06', quantity: 10, price: 100 })];
  const price = makePricer(prices, txs);
  assert.equal(price('CSPX.UK', '2026-03-09'), 110); // indeks +10%
  const withQuotes = { ...prices, instruments: { 'CSPX.UK': { ...prices.instruments['CSPX.UK'], quotes: [['2026-03-09', 108]] } } };
  assert.equal(makePricer(withQuotes, txs)('CSPX.UK', '2026-03-10'), 108);
  assert.equal(price('EXUS.DE', '2026-03-09'), null);
});

test('oś czasu: TWR nie zależy od dopłat, zysk = wartość − wpłaty', () => {
  const txs = [
    tx({ type: 'kupno', date: '2026-03-06', quantity: 10, price: 100 }), // 10 × 100 × 4,1 = 4100 zł
    tx({ type: 'kupno', date: '2026-03-10', quantity: 10, price: 110 }), // dopłata po wzroście
  ];
  const { points } = buildTimeline(txs, prices, { today: '2026-03-11' });
  assert.equal(points[0].date, '2026-03-06');
  assert.ok(Math.abs(points[0].value - 4100) < 1e-6);
  const mon = points.find((p) => p.date === '2026-03-09');
  // 10 × 110 USD × 4,2 = 4620 → TWR = 4620/4100 − 1
  assert.ok(Math.abs(mon.index - 4620 / 4100) < 1e-9);
  const stats = rangeStats(points, '2026-03-01', '2026-03-11');
  const last = points[points.length - 1];
  assert.ok(Math.abs(stats.gain - (last.value - stats.flows)) < 1e-6);
  // Dopłata 10.03 kupiona po cenie rynkowej nie zmienia TWR.
  assert.ok(Math.abs(last.index - mon.index) < 1e-9);
  // Zakres od poniedziałku: baza = wartość z piątku.
  const sub = rangeStats(points, '2026-03-09', '2026-03-11');
  assert.ok(Math.abs(sub.startValue - 4100) < 1e-6);
});

test('pełna sprzedaż i ponowny zakup nie psują indeksu', () => {
  const txs = [
    tx({ type: 'kupno', date: '2026-03-06', quantity: 10, price: 100 }),
    tx({ type: 'sprzedaz', date: '2026-03-09', quantity: 10, price: 110 }),
    tx({ type: 'kupno', date: '2026-03-11', quantity: 5, price: 110 }),
  ];
  const { points } = buildTimeline(txs, prices, { today: '2026-03-11' });
  const sold = points.find((p) => p.date === '2026-03-09');
  assert.equal(sold.value, 0);
  assert.ok(Math.abs(sold.index - (10 * 110 * 4.2) / 4100) < 1e-9);
  const idle = points.find((p) => p.date === '2026-03-10');
  assert.equal(idle.ret, 0);
});

test('PIT-38: FIFO, kurs NBP z dnia poprzedniego, prowizje w kosztach, zaokrąglenia', () => {
  const txs = [
    tx({ type: 'kupno', date: '2026-03-06', quantity: 10, price: 100, feePLN: 10 }), // kurs D-1: 4,0 → koszt 4010
    tx({ type: 'kupno', date: '2026-03-09', quantity: 10, price: 120 }), // kurs D-1: 4,1 → 4920
    tx({ type: 'sprzedaz', date: '2026-03-11', quantity: 15, price: 130, feePLN: 10 }), // kurs D-1: 4,2 → 8190
  ];
  const r = realizedGains(txs, fx);
  const y = r.byYear['2026'];
  assert.ok(Math.abs(y.revenue - 8190) < 1e-6);
  assert.ok(Math.abs(y.costs - (4010 + 2460 + 10)) < 1e-6);
  assert.ok(Math.abs(y.income - 1710) < 1e-6);
  assert.equal(y.tax, 325);
  assert.ok(Math.abs(r.openLots['CSPX.UK'][0].quantity - 5) < 1e-9);
  // IKE nie trafia do PIT-38
  const ike = realizedGains(txs.map((t) => ({ ...t, account: 'IKE' })), fx);
  assert.deepEqual(ike.byYear, {});
});

test('strata do zrealizowania przed końcem roku obniża podatek', () => {
  const txs = [
    tx({ type: 'kupno', date: '2026-03-05', quantity: 10, price: 100 }),
    tx({ type: 'sprzedaz', date: '2026-03-09', quantity: 10, price: 130 }), // zysk
    tx({ type: 'kupno', date: '2026-03-09', ticker: 'EXUS.DE', currency: 'USD', quantity: 10, price: 100 }),
    tx({ type: 'wycena', date: '2026-03-11', ticker: 'EXUS.DE', currency: 'USD', price: 80 }), // spadek wyceny
  ];
  const h = harvestCandidates(txs, prices, '2026-03-11');
  assert.ok(h.ytdIncome > 0);
  assert.equal(h.candidates.length, 1);
  assert.equal(h.candidates[0].ticker, 'EXUS.DE');
  assert.ok(h.potentialSaving > 0);
});

test('pozycje z wyceną i średnim kosztem', () => {
  const txs = [
    tx({ type: 'kupno', date: '2026-03-06', quantity: 10, price: 100, account: 'IKE' }),
    tx({ type: 'sprzedaz', date: '2026-03-09', quantity: 4, price: 110, account: 'IKE' }),
  ];
  const [h] = holdings(txs, prices, '2026-03-11');
  assert.equal(h.account, 'IKE');
  assert.ok(Math.abs(h.quantity - 6) < 1e-9);
  assert.ok(Math.abs(h.cost - 4100 * 0.6) < 1e-6);
  assert.ok(Math.abs(h.value - 6 * 110 * 4.2) < 1e-6);
});

test('limity i plan wpłat: IKZE → IKE → konto zwykłe (2026) / OKI (2027)', () => {
  const plan = planContributions({ budget: 50000, year: 2026, podatki, used: {}, taxRate: 0.32 });
  assert.deepEqual(
    plan.steps.map((s) => [s.account, Math.round(s.amount)]),
    [
      ['IKZE', 11304],
      ['IKE', 28260],
      ['ZWYKLE', 10436],
    ],
  );
  assert.ok(Math.abs(plan.refund - 11304 * 0.32) < 1e-6);
  const p27 = planContributions({ budget: 60000, year: 2027, podatki, used: { IKE: 5000 }, taxRate: 0.12 });
  assert.equal(p27.steps[p27.steps.length - 1].account, 'OKI');
  assert.equal(Math.round(p27.steps.find((s) => s.account === 'IKE').amount), 30099 - 5000);
  // Ryczałt 8,5%: odliczenie niższe niż 10% przy wypłacie → najpierw IKE
  assert.equal(planContributions({ budget: 1000, year: 2026, podatki, taxRate: 0.085 }).steps[0].account, 'IKE');
  const used = contributions([{ type: 'wplata', account: 'IKE', date: '2026-02-01', amountPLN: 1000 }, { type: 'wplata', account: 'IKE', date: '2025-12-31', amountPLN: 500 }], 2026);
  assert.equal(used.IKE, 1000);
});

test('koszt zmian pozycji u brokerów', () => {
  const xtb = podatki.brokers.find((b) => b.id === 'xtb');
  const bossa = podatki.brokers.find((b) => b.id === 'bossa');
  const ibkr = podatki.brokers.find((b) => b.id === 'ibkr');
  const c = brokerCost(xtb, { value: 100000, perYear: 1.42, eurShare: 0.62, wrapper: 'ike' });
  assert.ok(Math.abs(c.perSwitch - 0.01) < 1e-12);
  assert.ok(Math.abs(c.annualPLN - 1420) < 1e-6);
  const z = brokerCost(xtb, { value: 100000, perYear: 1.42, eurShare: 0.62, wrapper: 'zwykle' });
  assert.ok(Math.abs(z.perSwitch - 0.62 * 0.005) < 1e-12);
  const b = brokerCost(bossa, { value: 100000, perYear: 1.42, eurShare: 0.62, wrapper: 'ike', afterPromo: true });
  assert.ok(Math.abs(b.perSwitch - (2 * 0.0029 + 0.62 * 0.001)) < 1e-12);
  assert.equal(brokerCost(ibkr, { value: 1, perYear: 1, eurShare: 0, wrapper: 'ike' }).available, false);
});

test('doradca waluty: kupuj w walucie, którą masz; dla nowych PLN wybierz walutę następnej zmiany', () => {
  const assets = {
    US: { listings: [{ ticker: 'CSPX.UK', currency: 'USD', exchange: 'LSE' }, { ticker: 'SXR8.DE', currency: 'EUR', exchange: 'Xetra' }], plnAlternative: { ticker: 'ETFBSPXPL.PL', note: 'hedged' }, xtb: {} },
    EXUS: { listings: [{ ticker: 'EXUS.DE', currency: 'EUR', exchange: 'Xetra' }], xtb: {} },
    BONDS: { listings: [{ ticker: 'IUAA.UK', currency: 'USD', exchange: 'LSE' }], xtb: {} },
  };
  const transitions = { US: { EXUS: 0.59, BONDS: 0.41 } };
  const regular = ['PLN', 'USD', 'EUR'];
  assert.equal(currencyAdvice({ asset: 'US', assets, accountCurrencies: regular, cash: 'USD', transitions }).listing.ticker, 'CSPX.UK');
  assert.equal(currencyAdvice({ asset: 'US', assets, accountCurrencies: regular, cash: 'EUR', transitions }).listing.ticker, 'SXR8.DE');
  const pln = currencyAdvice({ asset: 'US', assets, accountCurrencies: regular, cash: 'PLN', transitions });
  assert.equal(pln.listing.ticker, 'SXR8.DE'); // 59% szans, że następny ETF też będzie w EUR
  assert.ok(Math.abs(pln.expectedFuture - 0.41) < 1e-12);
  // IKE/IKZE w XTB: tylko PLN – waluta nie zmienia kosztu, podpowiedź alternatywy w PLN
  const ike = currencyAdvice({ asset: 'US', assets, accountCurrencies: ['PLN'], transitions });
  assert.equal(ike.plnOnly, true);
  assert.equal(ike.listing.ticker, 'CSPX.UK');
  assert.match(currencyAdviceText(ike, 'PLN'), /ETFBSPXPL\.PL/);
  assert.match(currencyAdviceText(currencyAdvice({ asset: 'US', assets, accountCurrencies: regular, cash: 'EUR', transitions }), 'EUR'), /bez przewalutowania/);
});

test('scalanie danych z dwóch urządzeń, walidacja i wzorce', () => {
  const a = [{ id: '1', date: '2026-01-01', type: 'kupno', updatedAt: 1, quantity: 1 }];
  const b = [
    { id: '1', date: '2026-01-01', type: 'kupno', updatedAt: 2, quantity: 2 },
    { id: '2', date: '2026-01-02', type: 'kupno', updatedAt: 1, deleted: true },
  ];
  const m = mergeTransactions(a, b);
  assert.equal(m.find((t) => t.id === '1').quantity, 2);
  assert.ok(m.find((t) => t.id === '2').deleted);
  assert.ok(validateTx({ type: 'kupno', date: '2026-01-01', account: 'IKE' }).length >= 2);
  assert.deepEqual(validateTx({ type: 'wplata', date: '2026-01-01', account: 'IKE', amountPLN: 100 }), []);
  const r = rebase([['2026-01-01', 100], ['2026-01-02', 110]], '2026-01-01', '2026-01-02');
  assert.ok(Math.abs(r[1][1] - 0.1) < 1e-12);
});
