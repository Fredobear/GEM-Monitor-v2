import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAmount,
  parseDate,
  parseShortcutLog,
  parseCsv,
  guessMapping,
  csvToTxs,
  mergeImported,
  balances,
  summarize,
  compareMonth,
  emptyFinance,
  validateFinTx,
  applyRules,
  accountForCard,
  shortcutCategoriesText,
  monthBounds,
  shiftMonth,
} from '../src/client/finance-core.js';

test('kwoty w polskich i angielskich formatach', () => {
  assert.equal(parseAmount('45,20 zł'), 45.2);
  assert.equal(parseAmount('-1 234,56'), -1234.56);
  assert.equal(parseAmount('1.234,56 PLN'), 1234.56);
  assert.equal(parseAmount('PLN 45.20'), 45.2);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('45,20-'), -45.2);
  assert.equal(parseAmount('−12,5 zł'), -12.5);
  assert.equal(parseAmount('1 250,00 zł'), 1250);
  assert.ok(Number.isNaN(parseAmount('brak')));
});

test('daty: ISO, polskie, angielskie (format ze Skrótów)', () => {
  assert.deepEqual(parseDate('2026-11-02T14:33:05+01:00'), { date: '2026-11-02', time: '14:33' });
  assert.deepEqual(parseDate('02.11.2026'), { date: '2026-11-02', time: null });
  assert.deepEqual(parseDate('2 lis 2026 o 14:33'), { date: '2026-11-02', time: '14:33' });
  assert.deepEqual(parseDate('15 maja 2026'), { date: '2026-05-15', time: null });
  assert.deepEqual(parseDate('Nov 2, 2026 at 2:33 PM'), { date: '2026-11-02', time: '14:33' });
  assert.equal(parseDate('jutro'), null);
});

test('plik ze Skrótu Apple Pay: kategoria, karta → konto, „Pomiń”, brak kategorii → do przypisania', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'mb', name: 'mBank', cards: ['mBank Visa'] });
  fin.rules.push({ pattern: 'orlen', categoryId: 'transport' });
  const log = [
    '2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa',
    '2026-11-02T18:01:00+01:00;250,00 zł;ORLEN Stacja 123;;mBank Visa',
    '2026-11-03T09:00:00+01:00;12,00 zł;Kawiarnia;Pomiń;mBank Visa',
    '2026-11-03T10:00:00+01:00;9,99 zł;Spotify;;Revolut',
    'zepsuty wiersz',
  ].join('\n');
  const { txs, errors } = parseShortcutLog(log, fin);
  assert.equal(txs.length, 3);
  assert.equal(errors.length, 1);
  assert.equal(txs[0].categoryId, 'zakupy');
  assert.equal(txs[0].accountId, 'mb');
  assert.equal(txs[0].amount, 45.2);
  assert.equal(txs[1].categoryId, 'transport'); // z reguły
  assert.equal(txs[2].categoryId, null); // do przypisania
  assert.equal(txs[2].accountId, null);
  // Ponowny import tego samego pliku nie dubluje wpisów.
  let r = mergeImported(fin, txs, { now: 1 });
  assert.equal(r.added, 3);
  r = mergeImported(r.fin, parseShortcutLog(log, fin).txs, { now: 2 });
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 3);
});

test('CSV z banku: separator, cudzysłowy, nagłówek po kilku wierszach, Windows-style', () => {
  const csv = [
    'Wyciąg z rachunku;;;',
    '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;#Saldo po operacji',
    '2026-10-30;"ZAKUP PRZY UŻYCIU KARTY; LIDL";PL123;Zakupy;-123,45 PLN;1 000,00 PLN',
    '2026-10-31;WYNAGRODZENIE PAŹDZIERNIK;PL123;Wpływy;8 500,00 PLN;9 500,00 PLN',
    '',
  ].join('\r\n');
  const { rows, delimiter } = parseCsv(csv);
  assert.equal(delimiter, ';');
  const m = guessMapping(rows);
  assert.equal(m.headerRow, 1);
  assert.equal(rows[1][m.date], '#Data operacji');
  assert.equal(rows[1][m.amount], '#Kwota'); // nie „Saldo po operacji”
  assert.equal(rows[1][m.description], '#Opis operacji');
  const fin = emptyFinance();
  fin.rules.push({ pattern: 'lidl', categoryId: 'zakupy' });
  const { txs } = csvToTxs(rows, m, { accountId: 'pko', fin });
  assert.equal(txs.length, 2);
  assert.deepEqual([txs[0].type, txs[0].amount, txs[0].categoryId], ['wydatek', 123.45, 'zakupy']);
  assert.deepEqual([txs[1].type, txs[1].amount], ['przychod', 8500]);
});

test('ta sama płatność z Apple Pay i z wyciągu bankowego nie jest liczona dwa razy', () => {
  let fin = emptyFinance();
  fin.accounts.push({ id: 'mb', name: 'mBank', cards: ['mBank Visa'] });
  const ap = parseShortcutLog('2026-10-28T12:00:00+01:00;18,49 zł;Żabka;Zakupy spożywcze;Visa X', fin).txs;
  fin = mergeImported(fin, ap, { now: 1 }).fin;
  const csv = parseCsv('Data operacji;Opis operacji;Kwota\n2026-10-30;ZAKUP PRZY UŻYCIU KARTY ZABKA Z1234;-18,49\n2026-10-30;ZAKUP KARTĄ ROSSMANN;-18,49\n');
  const { txs } = csvToTxs(csv.rows, guessMapping(csv.rows), { accountId: 'mb', fin });
  const r = mergeImported(fin, txs, { now: 2 });
  assert.equal(r.added, 1); // Rossmann to inna płatność o tej samej kwocie
  assert.equal(r.crossSource, 1);
  assert.equal(r.fin.txs.find((t) => t.source === 'applepay').accountId, 'mb'); // płatność z Apple Pay dostała konto z wyciągu
});

test('salda, przelewy i podsumowanie miesiąca', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'a', name: 'Konto', openingBalance: 1000, openingDate: '2026-10-01' }, { id: 'b', name: 'Oszczędności', openingBalance: 0, openingDate: '2026-10-01' });
  fin.categories.find((c) => c.id === 'zakupy').budget = 500;
  fin.txs.push(
    { id: '1', type: 'przychod', amount: 5000, date: '2026-10-10', accountId: 'a', categoryId: 'wynagrodzenie' },
    { id: '2', type: 'wydatek', amount: 300, date: '2026-10-11', accountId: 'a', categoryId: 'zakupy', merchant: 'Lidl' },
    { id: '3', type: 'wydatek', amount: 200, date: '2026-10-12', accountId: 'a', categoryId: 'zakupy', merchant: 'Lidl' },
    { id: '4', type: 'wydatek', amount: 100, date: '2026-10-12', accountId: 'a', categoryId: null, merchant: 'Sklep' },
    { id: '5', type: 'przelew', amount: 1000, date: '2026-10-15', accountId: 'a', toAccountId: 'b' },
    { id: '6', type: 'wydatek', amount: 50, date: '2026-09-30', accountId: 'a', categoryId: 'zakupy' }, // przed saldem początkowym
    { id: '7', type: 'wydatek', amount: 999, date: '2026-10-13', accountId: 'a', categoryId: 'zakupy', deleted: true },
  );
  const bal = balances(fin);
  assert.equal(bal.a, 1000 + 5000 - 300 - 200 - 100 - 1000);
  assert.equal(bal.b, 1000);
  const s = summarize(fin, '2026-10-01', '2026-10-31');
  assert.equal(s.income, 5000);
  assert.equal(s.expense, 600); // przelew i wpis usunięty nie są wydatkami
  assert.equal(s.net, 4400);
  assert.ok(Math.abs(s.savingsRate - 0.88) < 1e-12);
  assert.equal(s.expenseByCategory[0].id, 'zakupy');
  assert.equal(s.expenseByCategory[0].amount, 500);
  assert.equal(s.expenseByCategory[0].budget, 500);
  assert.equal(s.uncategorized, 1);
  assert.equal(s.topMerchants[0].name, 'Lidl');
  const cmp = compareMonth(fin, '2026-10');
  assert.equal(cmp.rows.find((r) => r.id === 'zakupy').previous, 50);
});

test('walidacja, reguły, karty, pomocnicze', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'a', name: 'A', cards: ['Visa 1234'] });
  assert.ok(validateFinTx({ type: 'wydatek', amount: 0, date: '2026-01-01' }, fin).length >= 2);
  assert.deepEqual(validateFinTx({ type: 'wydatek', amount: 10, date: '2026-01-01', accountId: 'a' }, fin), []);
  assert.ok(validateFinTx({ type: 'przelew', amount: 10, date: '2026-01-01', accountId: 'a', toAccountId: 'a' }, fin).length);
  assert.equal(applyRules('ZABKA Z1234 WARSZAWA', [{ pattern: 'orlen', categoryId: 'x' }, { pattern: 'Żabka', categoryId: 'zakupy' }]), 'zakupy');
  assert.equal(applyRules('Opłata za ŁÓDŹ', [{ pattern: 'lodz', categoryId: 'transport' }]), 'transport');
  assert.equal(accountForCard(fin.accounts, 'Visa 1234'), 'a');
  assert.match(shortcutCategoriesText(fin), /Zakupy spożywcze\n.*\nPomiń$/s);
  assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
});
