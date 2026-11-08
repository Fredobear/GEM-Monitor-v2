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
  setBalance,
  cardStatus,
  cardDue,
  repaymentTx,
  netWorth,
  nextRecurringDate,
  processRecurring,
  settleRecurring,
  dueRecurring,
  recurringBetween,
  upcomingRecurring,
  recurringMonthly,
  validateRecurring,
  calendarMonth,
  periodRange,
  shiftPeriod,
  liveTx,
  rateOn,
  convert,
  lotPrice,
  lotValuePLN,
  accountWorth,
  worthHistory,
  adjustBalance,
  deleteAccount,
  deleteCategory,
  recurringTx,
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
  const kept = txs.filter((t) => !t.apSkip);
  assert.equal(kept.length, 3);
  assert.equal(errors.length, 1);
  assert.equal(kept[0].categoryId, 'zakupy');
  assert.equal(kept[0].accountId, 'mb');
  assert.equal(kept[0].amount, 45.2);
  assert.equal(kept[1].categoryId, 'transport'); // z reguły
  assert.equal(kept[1].catAuto, true);
  assert.equal(kept[2].categoryId, null); // do przypisania
  assert.equal(kept[2].accountId, null);
  // Ponowny import tego samego pliku nie dubluje wpisów, a „Pomiń” nie trafia do dziennika.
  let r = mergeImported(fin, txs, { now: 1 });
  assert.equal(r.added, 3);
  assert.ok(!r.fin.txs.some((t) => t.merchant === 'Kawiarnia'));
  assert.ok(!r.fin.txs.some((t) => 'apSkip' in t || 'apCategory' in t));
  r = mergeImported(r.fin, parseShortcutLog(log, fin).txs, { now: 2 });
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 3);
});

test('Apple Pay dwuetapowo: płatność zapisana od razu, kategoria z drugiego wiersza, także między importami', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'mb', name: 'mBank', cards: ['mBank Visa'] });
  fin.rules.push({ pattern: 'orlen', categoryId: 'transport' });
  const step1 = [
    '2026-11-02T14:33:05+01:00;45,20 zł;Biedronka;;mBank Visa', // pierwszy zapis
    '2026-11-02T14:33:40+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa', // wybór z listy po 35 s
    '2026-11-02T15:10:00+01:00;12,00 zł;Kawiarnia;;mBank Visa',
    '2026-11-02T15:10:30+01:00;12,00 zł;Kawiarnia;Pomiń;mBank Visa',
    '2026-11-02T16:00:00+01:00;8,50 zł;Kiosk;;mBank Visa', // lista wygasła – brak drugiego wiersza
    '2026-11-02T16:05:00+01:00;8,50 zł;Kiosk;;mBank Visa', // druga, osobna płatność w tym samym kiosku
    '2026-11-02T17:00:00+01:00;60,00 zł;ORLEN;;mBank Visa',
    '2026-11-02T17:00:20+01:00;60,00 zł;ORLEN;Później;mBank Visa',
  ];
  const parsed = parseShortcutLog(step1.join('\n'), fin);
  assert.equal(parsed.lines, 8);
  let r = mergeImported(fin, parsed.txs, { now: 1 });
  const live = r.fin.txs.filter((t) => !t.deleted);
  assert.equal(r.added, 4); // Biedronka, 2× Kiosk, ORLEN
  assert.equal(live.find((t) => t.merchant === 'Biedronka').categoryId, 'zakupy');
  assert.equal(live.find((t) => t.merchant === 'Biedronka').time, '14:33'); // czas pierwszego zapisu
  assert.equal(live.filter((t) => t.merchant === 'Kiosk').length, 2);
  assert.ok(live.filter((t) => t.merchant === 'Kiosk').every((t) => !t.categoryId));
  assert.ok(!live.some((t) => t.merchant === 'Kawiarnia'));
  assert.equal(live.find((t) => t.merchant === 'ORLEN').categoryId, 'transport'); // „Później” + reguła

  // Import pomiędzy pierwszym zapisem a wyborem z listy: kategoria i „Pomiń” uzupełnią się przy kolejnym imporcie.
  const early = ['2026-11-03T09:00:00+01:00;20,00 zł;Apteka;;mBank Visa', '2026-11-03T10:00:00+01:00;5,00 zł;Parking;;mBank Visa', '2026-11-03T11:00:00+01:00;30,00 zł;ORLEN;;mBank Visa'];
  r = mergeImported(r.fin, parseShortcutLog(early.join('\n'), fin).txs, { now: 2 });
  assert.equal(r.added, 3);
  const later = [...early, '2026-11-03T09:00:50+01:00;20,00 zł;Apteka;Zdrowie i uroda;mBank Visa', '2026-11-03T10:01:00+01:00;5,00 zł;Parking;Pomiń;mBank Visa', '2026-11-03T11:00:30+01:00;30,00 zł;ORLEN;Zakupy spożywcze;mBank Visa'];
  r = mergeImported(r.fin, parseShortcutLog(later.join('\n'), fin).txs, { now: 3 });
  assert.equal(r.added, 0);
  assert.equal(r.updated, 2); // Apteka, ORLEN (kategoria z reguły zastąpiona wyborem z listy)
  assert.equal(r.removed, 1); // Parking
  const after = r.fin.txs.filter((t) => !t.deleted);
  assert.equal(after.find((t) => t.merchant === 'Apteka').categoryId, 'zdrowie');
  assert.equal(after.find((t) => t.merchant === 'ORLEN' && t.date === '2026-11-03').categoryId, 'zakupy');
  assert.ok(!after.some((t) => t.merchant === 'Parking'));

  // Kategoria zmieniona ręcznie w aplikacji nie jest nadpisywana przy kolejnych importach.
  const fin2 = { ...r.fin, txs: r.fin.txs.map((t) => (t.merchant === 'Apteka' ? { ...t, categoryId: 'inne' } : t)) };
  r = mergeImported(fin2, parseShortcutLog(later.join('\n'), fin2).txs, { now: 4 });
  assert.equal(r.updated, 0);
  assert.equal(r.fin.txs.find((t) => t.merchant === 'Apteka').categoryId, 'inne');

  // Sam drugi wiersz, gdy pierwszy był już wczytany wcześniej (np. nowy plik): dopasowanie po kwocie, sklepie i karcie.
  const solo = mergeImported(r.fin, parseShortcutLog('2026-11-02T16:00:40+01:00;8,50 zł;Kiosk;Rozrywka i hobby;mBank Visa', fin2).txs, { now: 5 });
  assert.equal(solo.added, 0);
  assert.equal(solo.updated, 1);
  // Błędy z podpowiedzią przyczyny.
  const bad = parseShortcutLog('2026-11-02;;Biedronka;;Visa\nwczoraj;5 zł;X;;Visa', fin);
  assert.match(bad.errors[0], /brak kwoty/);
  assert.match(bad.errors[1], /ISO 8601/);
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

let seq = 0;
const newId = () => `n${++seq}`;

test('karta kredytowa: zadłużenie jako saldo ujemne, wydatek kartą, spłata z konta', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'bank', name: 'mBank', type: 'bank' }, { id: 'card', name: 'Karta', type: 'karta', limit: 5000, dueDay: 25 });
  setBalance(fin, 'bank', 4000);
  setBalance(fin, 'card', -1000); // zadłużenie 1000 zł
  fin.txs.push({ id: 'e', type: 'wydatek', amount: 200, date: '2026-10-30', accountId: 'card', categoryId: 'zakupy' });
  let bal = balances(fin);
  assert.equal(bal.card, -1200);
  assert.deepEqual(cardStatus(fin.accounts[1], bal.card), { debt: 1200, limit: 5000, available: 3800, usedShare: 0.24 });
  assert.deepEqual(netWorth(fin), { total: 2800, assets: 4000, debt: 1200, cardDebt: 1200, investments: 0, missing: [] });
  // Spłata całości: karta na zero, z konta schodzi tyle samo; to nie jest wydatek.
  fin.txs.push(repaymentTx({ fromId: 'bank', cardId: 'card', amount: 1200, date: '2026-11-02', newId }));
  bal = balances(fin);
  assert.equal(bal.card, 0);
  assert.equal(bal.bank, 2800);
  assert.equal(summarize(fin, '2026-10-01', '2026-11-30').expense, 200);
  assert.equal(cardStatus(fin.accounts[1], bal.card).debt, 0);
  // Operacja dopisana z datą wsteczną też zmienia saldo.
  fin.txs.push({ id: 'old', type: 'wydatek', amount: 50, date: '2025-01-01', accountId: 'bank' });
  assert.equal(balances(fin).bank, 2750);
  // Konto w euro i konto „nie wliczaj” są poza saldem łącznym.
  fin.accounts.push({ id: 'eur', name: 'EUR', type: 'bank', currency: 'EUR', openingBalance: 100 }, { id: 'x', name: 'X', type: 'bank', excludeFromTotal: true, openingBalance: 999 });
  assert.equal(netWorth(fin).total, 2750);
  assert.deepEqual(netWorth(fin).missing, ['EUR']); // bez kursów konto w euro nie jest wliczane
});

test('termin spłaty karty: ten albo następny miesiąc, krótsze miesiące', () => {
  const card = { type: 'karta', dueDay: 25 };
  assert.deepEqual(cardDue(card, -100, '2026-11-22'), { due: '2026-11-25', days: 3 });
  assert.deepEqual(cardDue(card, -100, '2026-11-26'), { due: '2026-12-25', days: 29 });
  assert.deepEqual(cardDue(card, -100, '2026-12-28'), { due: '2027-01-25', days: 28 });
  assert.equal(cardDue({ type: 'karta', dueDay: 31 }, -1, '2027-02-10').due, '2027-02-28');
  assert.equal(cardDue(card, 0, '2026-11-22'), null);
  assert.equal(cardDue({ type: 'bank', dueDay: 25 }, -100, '2026-11-22'), null);
});

test('stałe pozycje: terminy, automatyczne księgowanie zaległych, bez duplikatów', () => {
  assert.equal(nextRecurringDate('2026-01-31', 'miesiac', 31), '2026-02-28');
  assert.equal(nextRecurringDate('2026-02-28', 'miesiac', 31), '2026-03-31');
  assert.equal(nextRecurringDate('2026-11-02', 'tydzien'), '2026-11-09');
  assert.equal(nextRecurringDate('2026-11-30', 'kwartal', 30), '2027-02-28');
  assert.equal(nextRecurringDate('2028-02-29', 'rok', 29), '2029-02-28');
  const fin = emptyFinance();
  fin.accounts.push({ id: 'bank', name: 'mBank', type: 'bank' });
  fin.recurring.push(
    { id: 'rent', title: 'Czynsz', type: 'wydatek', amount: 2000, accountId: 'bank', categoryId: 'mieszkanie', freq: 'miesiac', nextDate: '2026-09-10', anchorDay: 10, auto: true },
    { id: 'pay', title: 'Pensja', type: 'przychod', amount: 9000, accountId: 'bank', categoryId: 'wynagrodzenie', freq: 'miesiac', nextDate: '2026-11-10', anchorDay: 10, auto: true },
    { id: 'power', title: 'Prąd', type: 'wydatek', amount: 180, accountId: 'bank', freq: '2mies', nextDate: '2026-10-15', anchorDay: 15, auto: false },
    { id: 'gym', title: 'Siłownia', type: 'wydatek', amount: 150, accountId: 'bank', freq: 'miesiac', nextDate: '2026-10-01', anchorDay: 1, auto: true, paused: true },
    { id: 'old', title: 'Rata', type: 'wydatek', amount: 300, accountId: 'bank', freq: 'miesiac', nextDate: '2026-10-05', anchorDay: 5, auto: true, endDate: '2026-10-31' },
  );
  const r = processRecurring(fin, '2026-11-02', { newId, now: 1 });
  // Czynsz: zaległe terminy z września i października (10 listopada jeszcze nie minął). Rata: tylko październik.
  assert.equal(r.posted, 3);
  assert.deepEqual(liveTx(r.fin).filter((t) => t.recurringId === 'rent').map((t) => t.date), ['2026-09-10', '2026-10-10']);
  assert.equal(r.fin.recurring.find((x) => x.id === 'rent').nextDate, '2026-11-10');
  assert.equal(r.fin.recurring.find((x) => x.id === 'old').nextDate, '2026-11-05');
  assert.equal(r.fin.recurring.find((x) => x.id === 'gym').nextDate, '2026-10-01');
  assert.deepEqual(r.pending.map((p) => p.rec.id), ['power']);
  assert.deepEqual(dueRecurring(r.fin, '2026-11-02').map((p) => p.date), ['2026-10-15']);
  assert.equal(processRecurring(r.fin, '2026-11-02', { newId, now: 2 }).posted, 0);
  // Pozycja z potwierdzeniem: zatwierdzenie księguje i przesuwa termin, pominięcie tylko przesuwa.
  let f2 = settleRecurring(r.fin, 'power', { post: true, newId, now: 3 });
  assert.equal(liveTx(f2).filter((t) => t.recurringId === 'power').length, 1);
  assert.equal(f2.recurring.find((x) => x.id === 'power').nextDate, '2026-12-15');
  f2 = settleRecurring(f2, 'power', { post: false, newId, now: 4 });
  assert.equal(f2.recurring.find((x) => x.id === 'power').nextDate, '2027-02-15');
  assert.equal(liveTx(f2).filter((t) => t.recurringId === 'power').length, 1);
  // Kalendarz i lista najbliższych terminów.
  assert.deepEqual(upcomingRecurring(r.fin, '2026-11-02', 30).map((p) => `${p.rec.id}@${p.date}`), ['rent@2026-11-10', 'pay@2026-11-10']);
  assert.deepEqual(recurringBetween(r.fin, '2026-10-01', '2026-12-31').map((p) => p.rec.id + p.date.slice(4)), ['power-10-15', 'rent-11-10', 'pay-11-10', 'rent-12-10', 'pay-12-10', 'power-12-15']);
  const m = recurringMonthly(r.fin);
  assert.equal(m.przychod, 9000);
  assert.equal(m.wydatek, 2000 + 90); // prąd co 2 miesiące = 90 zł/mies.; siłownia wstrzymana, rata zakończona
});

test('walidacja stałej pozycji', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'a' }, { id: 'b' });
  const ok = { title: 'Czynsz', type: 'wydatek', amount: 10, freq: 'miesiac', nextDate: '2026-11-10', accountId: 'a' };
  assert.deepEqual(validateRecurring(ok, fin), []);
  assert.equal(validateRecurring({ ...ok, title: ' ', amount: 0 }, fin).length, 2);
  assert.equal(validateRecurring({ ...ok, endDate: '2026-11-01' }, fin).length, 1);
  assert.equal(validateRecurring({ ...ok, type: 'przelew', toAccountId: 'a' }, fin).length, 1);
  assert.deepEqual(validateRecurring({ ...ok, type: 'przelew', toAccountId: 'b' }, fin), []);
});

test('kalendarz miesiąca i okresy przeglądu', () => {
  const fin = emptyFinance();
  fin.txs.push(
    { id: '1', type: 'wydatek', amount: 40, date: '2026-11-02', categoryId: 'zakupy' },
    { id: '2', type: 'wydatek', amount: 60, date: '2026-11-02', categoryId: 'jedzenie' },
    { id: '3', type: 'przychod', amount: 9000, date: '2026-11-10' },
    { id: '4', type: 'przelew', amount: 500, date: '2026-11-03', accountId: 'a', toAccountId: 'b' },
    { id: '5', type: 'wydatek', amount: 70, date: '2026-11-30', deleted: true },
  );
  const cal = calendarMonth(fin, '2026-11');
  assert.equal(cal.firstDow, 6); // 1 listopada 2026 to niedziela
  assert.equal(cal.days.length, 30);
  assert.deepEqual(cal.days[1], { date: '2026-11-02', day: 2, expense: 100, income: 0, count: 2 });
  assert.equal(cal.days[2].count, 0); // przelew nie jest wydatkiem
  assert.equal(cal.days[9].income, 9000);
  assert.equal(cal.maxExpense, 100);
  assert.deepEqual(periodRange('tydzien', '2026-11-04'), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(periodRange('tydzien', '2026-11-01'), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(periodRange('miesiac', '2026-02-14'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodRange('rok', '2026-11-02'), { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(periodRange('dzien', '2026-11-02'), { from: '2026-11-02', to: '2026-11-02' });
  assert.equal(shiftPeriod('dzien', '2026-11-30', 1), '2026-12-01');
  assert.equal(shiftPeriod('tydzien', '2026-11-04', -1), '2026-10-28');
  assert.equal(shiftPeriod('miesiac', '2026-01-31', 1), '2026-02-01');
  assert.equal(shiftPeriod('rok', '2026-11-02', -1), '2025-11-02');
});

// Kursy NBP i ceny wklejane do strony przy publikacji.
const MARKET = {
  asOf: '2026-11-02',
  fx: { EUR: [['2026-09-30', 4.3], ['2026-10-31', 4.4], ['2026-11-02', 4.5]], USD: [['2026-11-02', 4]] },
  assets: {
    'SXR8.DE': { name: 'S&P 500 (EUR)', currency: 'EUR', series: [['2026-09-30', 100], ['2026-10-31', 110], ['2026-11-02', 120]], quotes: [] },
    'CSPX.UK': { name: 'S&P 500 (USD)', currency: 'USD', series: [['2026-11-02', 50]], quotes: [['2026-10-30', 700]] },
  },
};

test('korekta salda zmienia saldo, ale nie jest wydatkiem ani przychodem', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'xtb', name: 'XTB', type: 'inwestycje' });
  fin.txs.push(
    { id: '1', type: 'korekta', amount: 138378, date: '2026-09-27', accountId: 'xtb' },
    { id: '2', type: 'korekta', amount: -128743, date: '2026-09-27', accountId: 'xtb' },
    { id: '3', type: 'wydatek', amount: 55, date: '2026-09-28', accountId: 'xtb', categoryId: 'inne' },
  );
  assert.equal(balances(fin).xtb, 9580);
  const s = summarize(fin, '2026-09-01', '2026-09-30');
  assert.equal(s.income, 0);
  assert.equal(s.expense, 55);
  assert.equal(s.uncategorized, 0);
  assert.equal(calendarMonth(fin, '2026-09').days[26].count, 0);
  assert.deepEqual(validateFinTx({ type: 'korekta', amount: -10, date: '2026-09-27', accountId: 'xtb' }, fin), []);
  assert.equal(validateFinTx({ type: 'korekta', amount: 0, date: '2026-09-27', accountId: 'xtb' }, fin).length, 1);
});

test('waluty: kurs NBP z dnia, przeliczenia, majątek z kontem w euro', () => {
  assert.equal(rateOn(MARKET, 'PLN', '2026-11-02'), 1);
  assert.equal(rateOn(MARKET, 'EUR', '2026-11-01'), 4.4); // ostatni kurs przed datą
  assert.equal(rateOn(MARKET, 'EUR', '2020-01-01'), 4.3); // przed początkiem danych – najstarszy kurs
  assert.equal(rateOn(MARKET, 'CHF', '2026-11-02'), null);
  assert.equal(convert(MARKET, 100, 'EUR', 'PLN', '2026-11-02'), 450);
  assert.equal(convert(MARKET, 450, 'PLN', 'USD', '2026-11-02'), 112.5);
  assert.equal(convert(MARKET, 100, 'EUR', 'USD', '2026-11-02'), 112.5);
  const fin = emptyFinance();
  fin.accounts.push({ id: 'pln', name: 'PLN', type: 'bank', openingBalance: 1000 }, { id: 'eur', name: 'EUR', type: 'bank', currency: 'EUR', openingBalance: 100 }, { id: 'chf', name: 'CHF', type: 'bank', currency: 'CHF', openingBalance: 10 });
  const nw = netWorth(fin, MARKET, '2026-11-02');
  assert.equal(nw.total, 1450);
  assert.deepEqual(nw.missing, ['CHF']);
  // Stała płatność z konta w euro: kwota w euro, do raportów w złotych po kursie z dnia terminu.
  const tx = recurringTx({ id: 'r', title: 'Abonament', type: 'wydatek', amount: 10, accountId: 'eur' }, '2026-10-31', { newId: () => 'x', fin, market: MARKET });
  assert.equal(tx.accountAmount, 10);
  assert.equal(tx.amount, 44);
  const tr = recurringTx({ id: 'r2', title: 'Na euro', type: 'przelew', amount: 450, accountId: 'pln', toAccountId: 'eur' }, '2026-11-02', { newId: () => 'y', fin, market: MARKET });
  assert.equal(tr.amount, 450);
  assert.equal(tr.toAmount, 100);
});

test('konto inwestycyjne: wycena pozycji według indeksu, notowań i ręcznych wycen', () => {
  const lot = { asset: 'SXR8.DE', qty: 10, price: 600, date: '2026-09-30' };
  assert.equal(lotPrice(MARKET, lot, '2026-09-30'), 600);
  assert.equal(lotPrice(MARKET, lot, '2026-11-02'), 720); // indeks +20%
  assert.equal(lotValuePLN(MARKET, lot, '2026-11-02'), 10 * 720 * 4.5);
  assert.equal(lotValuePLN(MARKET, lot, '2026-09-01'), 0); // przed zakupem
  // Wartość była w saldzie gotówki do dnia rozliczenia; sprzedana pozycja liczy się do dnia sprzedaży.
  assert.equal(lotValuePLN(MARKET, { ...lot, since: '2026-11-02' }, '2026-10-31'), 0);
  assert.equal(lotValuePLN(MARKET, { ...lot, since: '2026-11-02' }, '2026-11-02'), 10 * 720 * 4.5);
  assert.equal(lotValuePLN(MARKET, { ...lot, until: '2026-11-02' }, '2026-10-31'), 10 * 660 * 4.4);
  assert.equal(lotValuePLN(MARKET, { ...lot, until: '2026-11-02' }, '2026-11-02'), 0);
  // Świeże notowanie (do 7 dni) ma pierwszeństwo przed indeksem.
  assert.equal(lotPrice(MARKET, { asset: 'CSPX.UK', qty: 1, price: 650, date: '2026-10-01' }, '2026-11-02'), 700);
  // Aktywo z wyceną ręczną: ostatnia wycena przed datą.
  const flat = { asset: 'manual', name: 'Obligacje', currency: 'PLN', qty: 1, price: 1000, date: '2026-10-01', marks: [['2026-10-01', 1000], ['2026-11-01', 1010]] };
  assert.equal(lotPrice(MARKET, flat, '2026-10-15'), 1000);
  assert.equal(lotPrice(MARKET, flat, '2026-11-02'), 1010);
  const fin = emptyFinance();
  fin.accounts.push({ id: 'xtb', name: 'XTB EUR', type: 'inwestycje', currency: 'EUR', openingBalance: 50, lots: [lot] });
  const w = accountWorth(fin, fin.accounts[0], MARKET, '2026-11-02');
  assert.equal(w.cash, 50);
  assert.equal(w.investments, 32400);
  assert.equal(w.total, 50 * 4.5 + 32400);
  assert.equal(netWorth(fin, MARKET, '2026-11-02').investments, 32400);
});

test('historia majątku i dochodów miesiąc po miesiącu', () => {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'bank', name: 'Bank', type: 'bank' }, { id: 'xtb', name: 'XTB', type: 'inwestycje', currency: 'EUR', lots: [{ asset: 'SXR8.DE', qty: 1, price: 100, date: '2026-10-15' }] });
  fin.txs.push(
    { id: '1', type: 'korekta', amount: 1000, date: '2026-09-10', accountId: 'bank' },
    { id: '2', type: 'przychod', amount: 5000, date: '2026-10-10', accountId: 'bank', categoryId: 'wynagrodzenie' },
    { id: '3', type: 'wydatek', amount: 1500, date: '2026-10-20', accountId: 'bank', categoryId: 'zakupy' },
  );
  const h = worthHistory(fin, MARKET, { today: '2026-11-02' });
  assert.deepEqual(h.map((p) => p.month), ['2026-09', '2026-10', '2026-11']);
  assert.equal(h[0].worth, 1000);
  assert.equal(h[1].worth, 1000 + 5000 - 1500 + 110 * 4.4); // pozycja wyceniona na koniec października
  assert.equal(h[1].income, 5000);
  assert.equal(h[1].expense, 1500);
  assert.equal(h[2].date, '2026-11-02');
  assert.deepEqual(worthHistory(fin, MARKET, { today: '2026-11-02', months: 2 }).map((p) => p.month), ['2026-10', '2026-11']);
});

test('zmiana salda konta: bez operacji – saldo początkowe, z operacjami – korekta z datą', () => {
  let n = 0;
  const newId = () => `k${++n}`;
  const fin = emptyFinance();
  fin.accounts.push({ id: 'a', name: 'A', type: 'bank' }, { id: 'e', name: 'E', type: 'bank', currency: 'EUR' });
  adjustBalance(fin, 'a', 500, { date: '2026-11-02', newId });
  assert.equal(fin.accounts[0].openingBalance, 500);
  assert.equal(fin.txs.length, 0);
  fin.txs.push({ id: 't', type: 'wydatek', amount: 100, date: '2026-11-01', accountId: 'a' });
  adjustBalance(fin, 'a', 450, { date: '2026-11-02', newId });
  assert.equal(balances(fin).a, 450);
  assert.deepEqual(fin.txs.at(-1), { id: 'k1', type: 'korekta', amount: 50, date: '2026-11-02', accountId: 'a', merchant: 'Korekta salda', source: 'reczne', createdAt: fin.txs.at(-1).createdAt, updatedAt: fin.txs.at(-1).updatedAt });
  fin.txs.push({ id: 'u', type: 'wydatek', amount: 10, accountAmount: 10, date: '2026-11-01', accountId: 'e' });
  adjustBalance(fin, 'e', 90, { date: '2026-11-02', newId, market: MARKET });
  assert.equal(balances(fin).e, 90);
  assert.equal(fin.txs.at(-1).accountAmount, 100);
  assert.equal(fin.txs.at(-1).amount, 450);
});

test('usuwanie konta: scalenie z innym kontem albo usunięcie z operacjami bez zmiany innych sald', () => {
  const base = () => {
    const fin = emptyFinance();
    fin.accounts.push({ id: 'dup', name: 'Erste (ręcznie)', type: 'bank', openingBalance: 20000 }, { id: 'imp', name: 'ERTSE DEBIT', type: 'bank' }, { id: 'card', name: 'Karta', type: 'karta', payFromId: 'imp' });
    fin.txs.push(
      { id: '1', type: 'korekta', amount: 20300, date: '2026-09-27', accountId: 'imp' },
      { id: '2', type: 'wydatek', amount: 50, date: '2026-10-01', accountId: 'imp', categoryId: 'zakupy' },
      { id: '3', type: 'przelew', amount: 100, date: '2026-10-25', accountId: 'imp', toAccountId: 'card' },
      { id: '4', type: 'przelew', amount: 30, date: '2026-10-26', accountId: 'dup', toAccountId: 'imp' },
    );
    fin.recurring.push({ id: 'r', title: 'Czynsz', type: 'wydatek', amount: 500, accountId: 'imp', freq: 'miesiac', nextDate: '2026-11-30' });
    fin.docs = [{ id: 'd', txId: '2' }];
    return fin;
  };
  // Scalenie: operacje z „imp” trafiają na „dup”, saldo „dup” zostaje takie, jak było (to ten sam rachunek).
  let fin = base();
  const before = balances(fin).dup;
  fin = deleteAccount(fin, 'imp', { moveTo: 'dup', keepTargetBalance: true });
  assert.equal(fin.accounts.length, 2);
  assert.equal(balances(fin).dup, before);
  assert.equal(fin.txs.find((t) => t.id === '2').accountId, 'dup');
  assert.equal(fin.txs.find((t) => t.id === '4'), undefined); // przelew między scalanymi kontami znika
  assert.equal(fin.recurring[0].accountId, 'dup');
  assert.equal(fin.accounts.find((a) => a.id === 'card').payFromId, 'dup');
  // Usunięcie z operacjami: saldo karty i drugiego konta się nie zmienia.
  fin = base();
  const card = balances(fin).card;
  const dup = balances(fin).dup;
  fin = deleteAccount(fin, 'imp');
  assert.equal(balances(fin).card, card);
  assert.equal(balances(fin).dup, dup);
  assert.equal(fin.txs.find((t) => t.id === '2'), undefined);
  assert.equal(fin.txs.find((t) => t.id === '3').accountId, null);
  assert.equal(fin.recurring.length, 0);
  assert.equal(fin.docs[0].txId, null); // dokument zostaje, odpięty od usuniętej operacji
});

test('usuwanie kategorii: operacje do innej kategorii albo do „Do przypisania”', () => {
  const fin = emptyFinance();
  fin.txs.push({ id: '1', type: 'wydatek', amount: 10, date: '2026-11-01', categoryId: 'inne' });
  fin.rules.push({ id: 'r', pattern: 'kiosk', categoryId: 'inne' });
  let out = deleteCategory(fin, 'inne', { moveTo: 'zakupy' });
  assert.equal(out.txs[0].categoryId, 'zakupy');
  assert.equal(out.rules[0].categoryId, 'zakupy');
  assert.equal(out.categories.some((c) => c.id === 'inne'), false);
  out = deleteCategory(fin, 'inne');
  assert.equal(out.txs[0].categoryId, null);
  assert.equal(out.rules.length, 0);
});
