// Wpłaty do planów inwestycyjnych: zakup z wolnej gotówki zamiast drugiego przelewu, wykrywanie podwójnych pobrań
// (przelew na konto zapisany osobno i wpłata „z banku”) oraz wpłat wpisanych dwa razy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balances, emptyFinance, markPlanEntryOk, planDeposit, planDoubleCharges, planDuplicates, planEntryToCash, removePlanEntry } from '../src/client/finance-core.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
let n = 0;
const newId = () => `id${++n}`;
const MARKET = { fx: { EUR: [['2026-11-01', 4.4]] }, assets: {} };
const PRICES = { 'ETF.DE': 100 };

// Bank w złotych i konto inwestycyjne w euro z planem (100% jednego ETF-u).
function base() {
  const fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 10000 },
    { id: 'xtb', name: 'XTB EUR', type: 'inwestycje', currency: 'EUR', openingBalance: 0, plans: [{ id: 'p', name: 'Plan', items: [{ asset: 'ETF.DE', currency: 'EUR', pct: 100 }], recurring: null, log: [] }] },
  ];
  return fin;
}
// Przelew wpisany ręcznie: 1000 zł z banku, na konto w euro trafia 227,27 EUR (wolna gotówka).
const transfer = (date, pln = 1000, eur = 227.27) => ({ id: newId(), type: 'przelew', amount: pln, toAmount: eur, date, accountId: 'bank', toAccountId: 'xtb', source: 'reczne', createdAt: Date.parse(`${date}T10:00:00Z`), updatedAt: 1 });
const deposit = (fin, date, fromId, amount = 226) => planDeposit(fin, 'xtb', 'p', { date, amount, prices: PRICES, fromId, market: MARKET, newId, now: Date.parse(`${date}T11:00:00Z`) });

test('wpłata z wolnej gotówki: kupno zmniejsza wolną gotówkę, bank bez zmian', () => {
  let fin = base();
  fin.txs.push(transfer('2026-11-20'));
  const res = deposit(fin, '2026-11-20', 'xtb');
  fin = res.fin;
  const b = balances(fin);
  near(b.bank, 9000);
  near(b.xtb, 227.27 - 226);
  assert.equal(res.entry.fromId, 'xtb');
  assert.equal(planDoubleCharges(fin).length, 0);
});

test('podwójne pobranie: przelew był zapisany, a wpłata do planu „z banku” dopisała drugi – naprawa kupuje z wolnej gotówki', () => {
  let fin = base();
  fin.txs.push(transfer('2026-11-20'));
  fin = deposit(fin, '2026-11-20', 'bank').fin;
  // Bank stracił 1000 zł i jeszcze 226 EUR × 4,4 = 994,40 zł; wolna gotówka na XTB się nie zmieniła.
  near(balances(fin).bank, 10000 - 1000 - 994.4);
  near(balances(fin).xtb, 227.27);
  const found = planDoubleCharges(fin);
  assert.equal(found.length, 1);
  near(found[0].back, 994.4);
  assert.equal(found[0].fromId, 'bank');
  const fixed = planEntryToCash(fin, 'xtb', 'p', found[0].entryId, { market: MARKET, newId });
  near(balances(fixed).bank, 9000);
  near(balances(fixed).xtb, 1.27);
  assert.equal(fixed.accounts[1].plans[0].log[0].fromId, 'xtb');
  assert.equal(fixed.accounts[1].lots.length, 1); // jednostki zostają
  assert.equal(planDoubleCharges(fixed).length, 0); // po naprawie nic więcej
  // Oznaczenie „to nie błąd” wyłącza ostrzeżenie.
  assert.equal(planDoubleCharges(markPlanEntryOk(fin, 'xtb', 'p', found[0].entryId, 'double')).length, 0);
});

test('wpłata z banku bez osobnego przelewu jest poprawna; przelew sprzed ponad tygodnia się nie liczy', () => {
  let fin = base();
  fin = deposit(fin, '2026-11-20', 'bank').fin;
  assert.equal(planDoubleCharges(fin).length, 0);
  fin.txs.push(transfer('2026-11-10'));
  fin = deposit(fin, '2026-11-20', 'bank').fin;
  assert.equal(planDoubleCharges(fin).length, 0);
  // Jeden przelew pokrywa tylko tyle wpłat, na ile starcza kwoty.
  let two = base();
  two.txs.push(transfer('2026-11-20'));
  two = deposit(two, '2026-11-20', 'bank').fin;
  two = deposit(two, '2026-11-21', 'bank').fin;
  assert.equal(planDoubleCharges(two).length, 1);
});

test('wpłata wpisana dwa razy: wykrycie identycznych zakupów i usunięcie jednej (jednostki, przelew i kupno)', () => {
  let fin = base();
  fin.txs.push(transfer('2026-11-23'));
  fin = deposit(fin, '2026-11-20', 'bank').fin; // pomyłka: zła data
  fin = deposit(fin, '2026-11-23', 'bank').fin;
  const dups = planDuplicates(fin);
  assert.equal(dups.length, 1);
  assert.deepEqual([dups[0].a.date, dups[0].b.date], ['2026-11-20', '2026-11-23']);
  // Podwójne pobranie dotyczy tylko wpłaty z 23 listopada (przelew z tego dnia).
  const dbl = planDoubleCharges(fin);
  assert.deepEqual(dbl.map((d) => d.date), ['2026-11-23']);
  let fixed = planEntryToCash(fin, 'xtb', 'p', dbl[0].entryId, { market: MARKET, newId });
  fixed = removePlanEntry(fixed, 'xtb', 'p', dups[0].a.id);
  const b = balances(fixed);
  near(b.bank, 9000);
  near(b.xtb, 1.27);
  assert.equal(fixed.accounts[1].lots.length, 1);
  assert.equal(fixed.accounts[1].plans[0].log.length, 1);
  assert.equal(planDuplicates(fixed).length, 0);
  assert.equal(planDoubleCharges(fixed).length, 0);
  // „To nie duplikat” – para znika z ostrzeżeń.
  assert.equal(planDuplicates(markPlanEntryOk(fin, 'xtb', 'p', dups[0].a.id, 'dup', dups[0].b.id)).length, 0);
});
