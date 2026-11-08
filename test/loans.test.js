// Kredyty i pożyczki (harmonogram, nadpłaty, oprocentowanie, raty w dzienniku) oraz konta powiązane z portfelem GEM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountWorth,
  balances,
  emptyFinance,
  gemTransferInfo,
  gemTxFromTransfer,
  gemYearDeposits,
  loanApr,
  loanBalanceAt,
  loanOverpaySim,
  loanRateAt,
  loanRateSim,
  loanSchedule,
  loanSummary,
  netWorth,
  processLoans,
  recurringBetween,
  recurringMonthly,
  unlinkedGemTxs,
  validateLoan,
} from '../src/client/finance-core.js';

const near = (a, b, eps = 0.011) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const MORTGAGE = { principal: 300000, start: '2026-01-10', firstDue: '2026-02-15', months: 360, installments: 'rowne', rateType: 'stale', rates: [['2026-01-10', 8]] };
const rata = (rows) => rows.filter((r) => r.kind === 'rata');

test('harmonogram: raty równe, malejące, 0% i karencja', () => {
  const rows = rata(loanSchedule(MORTGAGE));
  assert.equal(rows.length, 360);
  assert.equal(rows[0].date, '2026-02-15');
  assert.equal(rows[1].date, '2026-03-15');
  near(rows[0].payment, 2201.29); // wzór na ratę annuitetową
  near(rows[0].interest, 2000);
  assert.equal(rows.at(-1).balance, 0);
  near(rows.reduce((s, r) => s + r.principal, 0), 300000);

  const dec = rata(loanSchedule({ ...MORTGAGE, installments: 'malejace' }));
  near(dec[0].payment, 833.33 + 2000);
  assert.ok(dec[1].payment < dec[0].payment && dec.at(-1).payment < 900);

  const zero = rata(loanSchedule({ principal: 3000, start: '2026-10-01', firstDue: '2026-11-01', months: 10, rateType: 'zero', rates: [] }));
  assert.deepEqual(zero.map((r) => r.payment), Array(10).fill(300));

  const grace = rata(loanSchedule({ ...MORTGAGE, months: 120, grace: 6 }));
  assert.ok(grace.slice(0, 6).every((r) => r.principal === 0 && Math.abs(r.interest - 2000) < 0.01));
  assert.equal(grace.length, 120);
  assert.equal(grace.at(-1).balance, 0);

  // Dzień raty 31 → w krótszych miesiącach ostatni dzień miesiąca.
  const eom = rata(loanSchedule({ ...MORTGAGE, firstDue: '2026-01-31', start: '2025-12-31', months: 3 }));
  assert.deepEqual(eom.map((r) => r.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('zmiana oprocentowania i rata z harmonogramu banku', () => {
  const L = { ...MORTGAGE, rates: [['2026-01-10', 8], ['2026-06-15', 6]] };
  assert.equal(loanRateAt(L, '2026-06-14'), 8);
  assert.equal(loanRateAt(L, '2026-06-15'), 6);
  const rows = rata(loanSchedule(L));
  const before = rows.find((r) => r.date === '2026-06-15');
  const after = rows.find((r) => r.date === '2026-07-15');
  near(before.payment, 2201.29); // okres 15.05–15.06 jeszcze po 8%
  assert.ok(after.payment < 1900 && after.rate === 6); // nowa rata po 6% od kolejnego okresu
  // Rata wg banku obowiązuje do najbliższej zmiany oprocentowania.
  const custom = rata(loanSchedule({ ...L, payment: 2250, paymentFrom: '2026-01-10' }));
  assert.equal(custom[0].payment, 2250);
  assert.notEqual(custom.find((r) => r.date === '2026-07-15').payment, 2250);
  // Symulacja: +1 pp podnosi ratę.
  const sim = loanRateSim(MORTGAGE, 1, '2026-11-08');
  near(sim.payment, 2201.29 + 209.82, 0.5);
  assert.ok(sim.totalInterestDiff > 0);
});

test('nadpłaty: krótszy okres albo niższa rata, oszczędność na odsetkach', () => {
  const okres = loanOverpaySim(MORTGAGE, { amount: 20000, date: '2026-11-08', mode: 'okres' });
  assert.ok(okres.monthsShorter > 60 && okres.interestSaved > 100000);
  near(okres.paymentAfter, okres.paymentBefore);
  const nizsza = loanOverpaySim(MORTGAGE, { amount: 20000, date: '2026-11-08', mode: 'rata' });
  assert.equal(nizsza.monthsShorter, 0);
  assert.ok(nizsza.paymentAfter < nizsza.paymentBefore - 100);
  assert.ok(nizsza.interestSaved > 0 && nizsza.interestSaved < okres.interestSaved);
  // Nadpłata w harmonogramie: wiersz nadpłaty i niższe saldo od tego dnia.
  const L = { ...MORTGAGE, overpayments: [{ id: 'n1', date: '2026-11-08', amount: 20000, mode: 'okres' }] };
  const rows = loanSchedule(L);
  const op = rows.find((r) => r.kind === 'nadplata');
  assert.equal(op.overpay, 20000);
  near(loanBalanceAt(L, rows, '2026-11-08'), loanBalanceAt(MORTGAGE, loanSchedule(MORTGAGE), '2026-11-08') - 20000);
  // Spłata całości jedną nadpłatą kończy harmonogram.
  const all = loanSchedule({ ...MORTGAGE, overpayments: [{ id: 'x', date: '2026-03-01', amount: 999999, mode: 'okres' }] });
  assert.equal(rata(all).length, 1);
  assert.equal(all.at(-1).balance, 0);
});

test('podsumowanie: zostało do spłaty, odsetki, koszt, RRSO z prowizją i ubezpieczeniem', () => {
  const s = loanSummary(MORTGAGE, '2026-11-08');
  assert.equal(s.next.date, '2026-11-15');
  assert.equal(s.left, 351);
  near(s.totalInterest, 492470.6, 1);
  near(s.paidInterest + s.futureInterest, s.totalInterest, 0.02);
  assert.ok(Math.abs(s.apr - 0.083) < 0.002); // 8% nominalnie ≈ 8,3% efektywnie
  const costly = loanSummary({ ...MORTGAGE, fee: 6000, insurance: 50 }, '2026-11-08');
  assert.ok(costly.apr > s.apr);
  near(costly.totalCost, s.totalInterest + 6000 + 50 * 360, 1);
  assert.ok(loanApr({ ...MORTGAGE, fee: 6000, feeFinanced: true }) > s.apr);
  // Kredyt „stan na dziś”: kwota z umowy tylko do postępu spłaty.
  const existing = loanSummary({ ...MORTGAGE, existing: true, amount: 300000, principal: 250000, start: '2026-10-15', firstDue: '2026-11-15', months: 300 }, '2026-11-08');
  assert.equal(existing.remaining, 250000);
  near(existing.progress, 50000 / 300000, 1e-6);
});

test('walidacja parametrów kredytu', () => {
  assert.deepEqual(validateLoan({ ...MORTGAGE, autoPost: false }), []);
  assert.ok(validateLoan({ ...MORTGAGE, principal: 0 }).some((e) => /kwotę/.test(e)));
  assert.ok(validateLoan({ ...MORTGAGE, firstDue: '2025-12-01' }).some((e) => /po dacie uruchomienia/.test(e)));
  assert.ok(validateLoan({ ...MORTGAGE, rates: [] }).some((e) => /oprocentowanie/.test(e)));
  assert.ok(validateLoan({ ...MORTGAGE, autoPost: true }).some((e) => /konto/.test(e)));
  assert.ok(validateLoan({ ...MORTGAGE, payment: 1500 }).some((e) => /nie pokrywa nawet odsetek/.test(e)));
});

test('raty w dzienniku: przelew kapitału i wydatek odsetek, raz na ratę, w kalendarzu i w stałych kosztach', () => {
  let n = 0;
  const newId = () => `id${++n}`;
  const fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'mBank', type: 'bank', openingBalance: 10000, openingDate: '1970-01-01' },
    { id: 'kr', name: 'Hipoteka', type: 'kredyt', openingBalance: -298000, openingDate: '1970-01-01', loan: { ...MORTGAGE, insurance: 40, payFromId: 'bank', autoPost: true, trackFrom: '2026-10-01' } },
  ];
  const r = processLoans(fin, '2026-11-20', { newId, now: 1 });
  assert.equal(r.posted, 2); // raty z 15.10 i 15.11
  const txs = r.fin.txs;
  assert.equal(txs.length, 4);
  const k = txs.find((t) => t.importKey === 'loan|kr|10|k');
  const o = txs.find((t) => t.importKey === 'loan|kr|10|o');
  assert.equal(k.type, 'przelew');
  assert.equal(k.toAccountId, 'kr');
  assert.equal(o.type, 'wydatek');
  assert.equal(o.categoryId, 'kredyty');
  near(k.amount + o.amount, 2201.29 + 40);
  assert.ok(r.fin.categories.some((c) => c.id === 'kredyty'));
  const bal = balances(r.fin);
  near(bal.bank, 10000 - 2 * (2201.29 + 40), 0.02);
  // Ponownie – bez duplikatów, także gdy ratę usunięto.
  const again = processLoans({ ...r.fin, txs: r.fin.txs.map((t, i) => (i === 0 ? { ...t, deleted: true } : t)) }, '2026-11-20', { newId, now: 2 });
  assert.equal(again.posted, 0);
  // Kalendarz i lista najbliższych: raty jako pozycje planu.
  const plan = recurringBetween(r.fin, '2026-12-01', '2027-01-31');
  assert.deepEqual(plan.map((p) => p.date), ['2026-12-15', '2027-01-15']);
  assert.equal(plan[0].rec.id, 'loan:kr');
  near(plan[0].rec.amount, 2241.29);
  near(recurringMonthly(r.fin, null, '2026-11-20').kredyty, 2241.29);
  // Zadłużenie kredytu w majątku.
  assert.ok(netWorth(r.fin, null, '2026-11-20').debt > 290000);
});

test('konto powiązane z portfelem GEM: przelew = wpłata na IKE, operacje do zapisania, limit i wycena', () => {
  const fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'mBank', type: 'bank', openingBalance: 5000 },
    { id: 'ike', name: 'XTB IKE', type: 'inwestycje', gemAccount: 'IKE', gemLinkedAt: '2026-11-05', gemValuation: true, openingBalance: 0 },
  ];
  const t = { id: 't1', type: 'przelew', amount: 1000, date: '2026-11-08', accountId: 'bank', toAccountId: 'ike', merchant: 'Wpłata na IKE' };
  const info = gemTransferInfo(fin, t);
  assert.deepEqual(info, { type: 'wplata', account: 'IKE', accountId: 'ike' });
  assert.deepEqual(gemTransferInfo(fin, { ...t, accountId: 'ike', toAccountId: 'bank' }), { type: 'wyplata', account: 'IKE', accountId: 'ike' });
  assert.equal(gemTransferInfo(fin, { ...t, type: 'wydatek' }), null);
  const g = gemTxFromTransfer(t, info, { id: 'g1', now: 5 });
  assert.deepEqual({ type: g.type, account: g.account, amountPLN: g.amountPLN, date: g.date, finTxId: g.finTxId }, { type: 'wplata', account: 'IKE', amountPLN: 1000, date: '2026-11-08', finTxId: 't1' });

  const gemTxs = [g, { id: 'g2', type: 'wplata', account: 'IKE', date: '2026-11-07', amountPLN: 500 }, { id: 'g3', type: 'wplata', account: 'IKE', date: '2026-11-02', amountPLN: 490 }, { id: 'g4', type: 'wplata', account: 'IKZE', date: '2026-11-07', amountPLN: 300 }, { id: 'g5', type: 'wplata', account: 'IKE', date: '2026-11-07', amountPLN: 50, deleted: true }];
  fin.txs = [{ ...t, gemTxId: 'g1' }];
  assert.deepEqual(unlinkedGemTxs(fin, gemTxs, fin.accounts[1]).map((x) => x.id), ['g2']); // g3 sprzed powiązania, g4 inny rachunek
  assert.equal(gemYearDeposits(gemTxs, 'IKE', 2026), 1990);

  // Wartość konta z wyceny portfela GEM (gdy jest świeża), a bez niej – saldo przelewów.
  const market = { fx: {}, gemValues: { IKE: { value: 1950, invested: 1990, date: '2026-11-06' } } };
  const w = accountWorth(fin, fin.accounts[1], market, '2026-11-08', 1000);
  assert.deepEqual({ total: w.total, investments: w.investments, gem: w.gem }, { total: 1950, investments: 1950, gem: true });
  assert.equal(accountWorth(fin, fin.accounts[1], market, '2026-10-01', 0).total, 0);
  assert.equal(accountWorth(fin, { ...fin.accounts[1], gemValuation: false }, market, '2026-11-08', 1000).total, 1000);
});
