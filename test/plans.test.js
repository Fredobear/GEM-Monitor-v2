// Aktywa ze średnią ceną (kurs z XTB, wolna gotówka) i plany inwestycyjne z podziałem procentowym (XTB, PPE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlan,
  balances,
  duePlanDeposits,
  emptyFinance,
  holdingsTradeDelta,
  investSummary,
  lotPrice,
  lotResult,
  marketPriceAt,
  parseAmount,
  planDeposit,
  planSplit,
  PLAN_EXTERNAL,
  validatePlan,
} from '../src/client/finance-core.js';

const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('liczby wpisane w formularzu: trzy miejsca po przecinku to część dziesiętna', () => {
  assert.equal(parseAmount('43,606'), 43.606);
  assert.equal(parseAmount('43.606'), 43.606);
  assert.equal(parseAmount('154,9513'), 154.9513);
  assert.equal(parseAmount('1 234,567'), 1234.567);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234.567'), 1234567);
});

// ETF wyceniany według indeksu (proxy): seria rośnie o 10% między 1.11 a 9.11.
const MARKET = { fx: { EUR: [['2026-11-01', 4.3]] }, assets: { 'VWCE.DE': { currency: 'EUR', quotes: [], series: [['2026-11-01', 100], ['2026-11-09', 110]], source: 'proxy' }, 'CDR.PL': { currency: 'PLN', quotes: [['2026-11-06', 266.9]], series: [] } } };

test('pozycja ze średnią ceną: kurs z XTB daje od razu prawdziwy zysk, a dalej zmiana indeksu', () => {
  const lot = { id: 'l1', asset: 'VWCE.DE', currency: 'EUR', qty: 10, price: 140, date: '2026-11-09' };
  // Bez kursu z XTB: wartość = koszt (nie wiadomo, ile ETF jest wart dziś).
  near(lotResult(MARKET, lot, '2026-11-09').gain, 0);
  // Z kursem: zysk od razu.
  const marked = { ...lot, mark: ['2026-11-09', 151.3] };
  near(lotPrice(MARKET, marked, '2026-11-09'), 151.3);
  near(lotResult(MARKET, marked, '2026-11-09').gain, (151.3 - 140) * 10 * 4.3);
  // Kurs wpisany wcześniej idzie dalej za indeksem.
  const older = { ...lot, date: '2026-10-01', mark: ['2026-11-01', 150] };
  near(lotPrice(MARKET, older, '2026-11-09'), 165);
  // Świeże notowanie z giełdy ma pierwszeństwo przed kursem wpisanym ręcznie.
  near(lotPrice(MARKET, { asset: 'CDR.PL', qty: 1, price: 200, date: '2026-01-02', mark: ['2026-11-01', 250] }, '2026-11-09'), 266.9);
  // Cena dla planu: notowanie albo wycena pozycji z konta.
  assert.equal(marketPriceAt(MARKET, { lots: [marked] }, 'CDR.PL', '2026-11-09'), 266.9);
  near(marketPriceAt(MARKET, { lots: [lot, marked] }, 'VWCE.DE', '2026-11-09'), 151.3);
  assert.equal(marketPriceAt(MARKET, { lots: [] }, 'VWCE.DE', '2026-11-09'), null);
});

test('rozliczenie z gotówką: kupno i sprzedaż tak, zmiana wyceny nie', () => {
  const a = { id: 'a', asset: 'VWCE.DE', currency: 'EUR', qty: 10, price: 140, date: '2026-11-09' };
  const b = { id: 'b', asset: 'CDR.PL', currency: 'PLN', qty: 2, price: 200, date: '2026-11-09' };
  // Tylko kurs z XTB (wycena) – bez zmiany gotówki.
  near(holdingsTradeDelta(MARKET, [a, b], [{ ...a, mark: ['2026-11-09', 151.3] }, b], [], '2026-11-09'), 0);
  // Dokupienie 5 szt. i nowa pozycja.
  near(holdingsTradeDelta(MARKET, [a], [{ ...a, qty: 15 }, b], [], '2026-11-09'), 5 * 140 * 4.3 + 2 * 266.9);
  // Sprzedaż (usunięta pozycja).
  near(holdingsTradeDelta(MARKET, [a, b], [a], [{ ...b, until: '2026-11-09' }], '2026-11-09'), -2 * 266.9);
});

test('plan inwestycyjny: podział kwoty, kupno po cenach z dnia, przelew i gotówka konta bez zmian', () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const plan = { id: 'p', name: 'Globalny', items: [{ asset: 'VWCE.DE', name: 'VWCE', currency: 'EUR', pct: 80 }, { asset: 'CDR.PL', name: 'CD Projekt', currency: 'PLN', pct: 20 }], recurring: { amount: 1000, day: 15, fromId: 'bank', auto: true, nextDate: '2026-11-15' }, log: [] };
  assert.deepEqual(validatePlan(plan), []);
  assert.ok(validatePlan({ ...plan, items: [{ ...plan.items[0], pct: 70 }, plan.items[1]] })[0].includes('100%'));
  assert.ok(validatePlan({ ...plan, items: [plan.items[0], plan.items[0]] }).some((e) => /tylko raz/.test(e)));
  assert.deepEqual(planSplit({ items: [{ pct: 33.33 }, { pct: 33.33 }, { pct: 33.34 }] }, 100).map((x) => x.amount), [33.33, 33.33, 33.34]);

  const fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'mBank', type: 'bank', openingBalance: 10000 },
    { id: 'xtb', name: 'XTB EUR', type: 'inwestycje', currency: 'EUR', openingBalance: 50, plans: [plan] },
  ];
  const r = planDeposit(fin, 'xtb', 'p', { date: '2026-11-15', amount: 1000, prices: { 'VWCE.DE': 160, 'CDR.PL': 266.9 }, fromId: 'bank', market: MARKET, newId, now: 1 });
  assert.equal(r.error, undefined);
  near(r.buys[0].qty, 5); // 800 EUR / 160
  near(r.buys[1].qty, (200 * 4.3) / 266.9, 1e-6); // 200 EUR → PLN po kursie NBP
  const bal = balances(r.fin);
  near(bal.bank, 10000 - 4300);
  near(bal.xtb, 50); // przelew na konto i kupno: gotówka konta bez zmian
  const acct = r.fin.accounts[1];
  assert.equal(acct.lots.length, 2);
  assert.deepEqual(acct.lots[0].mark, ['2026-11-15', 160]);
  assert.equal(acct.plans[0].log.length, 1);
  near(investSummary(MARKET, acct, '2026-11-15').cost, 4300);
  // Brak ceny jednego instrumentu – nic się nie zapisuje.
  assert.match(planDeposit(fin, 'xtb', 'p', { date: '2026-11-15', amount: 1000, prices: { 'VWCE.DE': 160 }, fromId: 'bank', market: MARKET, newId }).error, /Brak ceny/);
  // Z wolnej gotówki na koncie: tylko kupno.
  const own = planDeposit(fin, 'xtb', 'p', { date: '2026-11-15', amount: 40, prices: { 'VWCE.DE': 160, 'CDR.PL': 266.9 }, fromId: 'xtb', market: MARKET, newId });
  near(balances(own.fin).xtb, 10);
  near(balances(own.fin).bank, 10000);
});

test('PPE: składka spoza aplikacji (pracodawca) i wpłaty cykliczne', () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const market = { fx: {}, assets: { 'INGTFI:1:E': { currency: 'PLN', quotes: [['2026-11-05', 1261.53]], series: [], source: 'tfi' }, 'INGTFI:3:E': { currency: 'PLN', quotes: [['2026-11-05', 437.44]], series: [], source: 'tfi' } } };
  const plan = { id: 'ppe', name: 'PPE', items: [{ asset: 'INGTFI:1:E', name: 'ING Akcji', currency: 'PLN', pct: 60 }, { asset: 'INGTFI:3:E', name: 'ING Obligacji', currency: 'PLN', pct: 40 }], recurring: { amount: 600, day: 10, fromId: PLAN_EXTERNAL, auto: true, nextDate: '2026-11-10' }, log: [] };
  const fin = emptyFinance();
  fin.accounts = [{ id: 'ppe', name: 'PPE ING', type: 'inwestycje', openingBalance: 0, plans: [plan] }];
  const due = duePlanDeposits(fin, '2026-11-12');
  assert.deepEqual(due.map((d) => d.date), ['2026-11-10']);
  const prices = Object.fromEntries(plan.items.map((i) => [i.asset, marketPriceAt(market, fin.accounts[0], i.asset, '2026-11-10')]));
  assert.deepEqual(prices, { 'INGTFI:1:E': 1261.53, 'INGTFI:3:E': 437.44 });
  const r = planDeposit(fin, 'ppe', 'ppe', { date: '2026-11-10', amount: 600, prices, fromId: PLAN_EXTERNAL, market, newId });
  assert.equal(r.fin.txs.length, 0); // składka pracodawcy nie zmienia innych kont
  near(r.buys[0].qty, 360 / 1261.53, 1e-6);
  const next = advancePlan(r.fin, 'ppe', 'ppe');
  assert.equal(next.accounts[0].plans[0].recurring.nextDate, '2026-12-10');
  assert.equal(duePlanDeposits(next, '2026-11-12').length, 0);
  // Dzień 31 w krótszym miesiącu → ostatni dzień miesiąca.
  const p31 = { ...plan, recurring: { ...plan.recurring, day: 31, nextDate: '2027-01-31' } };
  const f31 = { ...fin, accounts: [{ ...fin.accounts[0], plans: [p31] }] };
  assert.equal(advancePlan(f31, 'ppe', 'ppe').accounts[0].plans[0].recurring.nextDate, '2027-02-28');
});
