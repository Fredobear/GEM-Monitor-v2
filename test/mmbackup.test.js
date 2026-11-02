import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { readMmBackup, mmToFinance, suggestMmMapping, removeMmImport, repairLegacyMmImport, openSqlite, unzipEntries } from '../src/client/mmbackup.js';
import { emptyFinance, balances, liveTx, summarize } from '../src/client/finance-core.js';

// Schemat jak w bazie MyFinance.db aplikacji Money Manager (sprawdzony na prawdziwej kopii z listopada 2026).
const SCHEMA = `
CREATE TABLE \`account\` (\`uid\` TEXT PRIMARY KEY, \`created\` TEXT, \`modified\` TEXT, \`title\` TEXT, \`icon\` TEXT, \`color\` INTEGER, \`currencyCode\` TEXT, \`comment\` TEXT, \`ignoreInBalance\` INTEGER, \`isActive\` INTEGER, \`isRemoved\` INTEGER, \`position\` INTEGER, \`isArchived\` INTEGER NOT NULL DEFAULT 0, \`isFavorite\` INTEGER NOT NULL DEFAULT 0);
CREATE TABLE \`account_balance\` (\`uid\` TEXT PRIMARY KEY, \`value\` INTEGER);
CREATE TABLE category (uid TEXT PRIMARY KEY, created TEXT, modified TEXT, title TEXT, type TEXT, icon TEXT, color INTEGER, useCount INTEGER, lastUse TEXT, isRemoved INTEGER, limitAmount INTEGER, position INTEGER, isArchived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE rates (fromCurrencyCode TEXT, toCurrencyCode TEXT, modified TEXT, value NUMERIC, PRIMARY KEY (fromCurrencyCode, toCurrencyCode));
CREATE TABLE regular_payment_period (uid TEXT PRIMARY KEY, created TEXT, modified TEXT, isRemoved INTEGER, startDate TEXT, endDate TEXT, lastTransactionDate TEXT);
CREATE TABLE reminding (uid TEXT PRIMARY KEY, created TEXT, modified TEXT, title TEXT, text TEXT, period TEXT, transactionType TEXT, startDate TEXT, time TEXT, standardUid TEXT, enabled INTEGER, isRemoved INTEGER, amount INTEGER, remindingType TEXT, endDate TEXT, addAutomatically INTEGER, customPeriodData TEXT);
CREATE TABLE \`sync_link\` (\`entityType\` TEXT, \`entityUid\` TEXT, \`otherType\` TEXT, \`otherUid\` TEXT, \`modified\` TEXT, \`isRemoved\` INTEGER, PRIMARY KEY (\`entityType\`, \`entityUid\`, \`otherType\`, \`otherUid\`));
CREATE TABLE syncable_settings (uid TEXT PRIMARY KEY, created TEXT, modified TEXT, value TEXT, type TEXT, isRemoved INTEGER);
CREATE TABLE \`transaction\` (\`uid\` TEXT PRIMARY KEY, \`created\` TEXT, \`modified\` TEXT, \`type\` TEXT, \`amountInDefaultCurrency\` INTEGER, \`amountInRealCurrency\` INTEGER, \`realCurrencyCode\` TEXT, \`amountInAccountCurrency\` INTEGER, \`accountCurrencyCode\` TEXT, \`date\` TEXT, \`comment\` TEXT, \`v\` INTEGER, \`isRemoved\` INTEGER);
CREATE TABLE \`transfer\` (\`uid\` TEXT PRIMARY KEY, \`created\` TEXT, \`modified\` TEXT, \`fromAmount\` INTEGER, \`fromCurrencyCode\` TEXT, \`toAmount\` INTEGER, \`toCurrencyCode\` TEXT, \`date\` TEXT, \`comment\` TEXT, \`isRemoved\` INTEGER);
`;

const LONG_NOTE = `Zakupy na urodziny – ${'tort, balony, świeczki; '.repeat(140)}`;

// Baza ze strukturą Money Managera: wbudowane kategorie bez nazw, korekty salda (operacje bez kategorii),
// stałe płatności, kursy walut i ~1500 operacji na stronach 1 KB (wielopoziomowe drzewo B, strony przepełnienia).
function buildDb(dir) {
  const file = path.join(dir, `MyFinance-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA page_size = 1024;');
  db.exec(SCHEMA);
  db.exec('BEGIN');
  const acc = db.prepare('INSERT INTO account (uid, created, title, color, currencyCode, comment, ignoreInBalance, isActive, isRemoved, position) VALUES (?,?,?,?,?,?,?,?,?,?)');
  acc.run('main', '2026-09-01T10:00:00.000Z', 'Erste Debit', -16776961, 'PLN', '', 0, 1, 0, 0);
  acc.run('card', '2026-09-01T10:05:00.000Z', 'Karta kredytowa Erste', -65536, 'PLN', '', 0, 1, 0, 1);
  acc.run('eur', '2026-09-01T10:10:00.000Z', 'Inwestycyjne Broker EUR', -16711936, 'EUR', '', 0, 1, 0, 2);
  acc.run('ppe', '2026-09-01T10:15:00.000Z', 'PPE', -1, 'PLN', '', 1, 1, 0, 3);
  acc.run('old', '2026-09-01T10:20:00.000Z', 'Stare konto', -1, 'PLN', '', 0, 1, 1, 4);
  const bal = db.prepare('INSERT INTO account_balance VALUES (?,?)');
  bal.run('main', 523450);
  bal.run('card', -125000);
  bal.run('eur', 100000);
  bal.run('ppe', 200000);
  bal.run('old', 0);
  const cat = db.prepare('INSERT INTO category (uid, title, type, color, isRemoved, limitAmount, position) VALUES (?,?,?,?,?,?,?)');
  cat.run('DefaultProducts', '', 'Expense', -65536, 0, 150000, 0);
  cat.run('DefaultHome', '', 'Expense', -23296, 0, 0, 1);
  cat.run('other_expense', '', 'Expense', -1, 0, 0, 2);
  cat.run('c-food', 'Jedzenie na mieście', 'Expense', -1, 0, 0, 3);
  cat.run('c-alko', 'Alkohol', 'Expense', -1, 0, 0, 4);
  cat.run('c-hobby', 'Hobby', 'Expense', -1, 0, 0, 5);
  cat.run('c-kosmos', 'Kosmos', 'Expense', -1, 0, 0, 6);
  cat.run('c-gone', 'Usunięta', 'Expense', -1, 1, 0, 7);
  cat.run('DefaultSalary', '', 'Income', -16744448, 0, 0, 0);
  cat.run('other_income', '', 'Income', -1, 0, 0, 1);
  const tx = db.prepare('INSERT INTO "transaction" (uid, created, type, amountInDefaultCurrency, amountInRealCurrency, amountInAccountCurrency, accountCurrencyCode, date, comment, v, isRemoved) VALUES (?,?,?,?,?,?,?,?,?,2,?)');
  const link = db.prepare('INSERT INTO sync_link (entityType, entityUid, otherType, otherUid, isRemoved) VALUES (?,?,?,?,?)');
  const add = (uid, created, type, def, accAmount, cur, date, comment, account, category = null, removed = 0) => {
    tx.run(uid, created, type, def, null, accAmount, cur, date, comment, removed);
    link.run('Transaction', uid, 'Account', account, 0);
    if (category) link.run('Transaction', uid, 'Category', category, 0);
  };
  // Saldo początkowe: operacja bez kategorii zapisana w tej samej sekundzie co konto.
  add('o-main', '2026-09-01T10:00:00.010Z', 'Income', 2000000, 2000000, 'PLN', '2026-09-01', '', 'main');
  add('o-eur', '2026-09-01T10:10:00.020Z', 'Income', 473000, 110000, 'EUR', '2026-09-01', '', 'eur');
  add('o-ppe', '2026-09-01T10:15:00.030Z', 'Income', 200000, 200000, 'PLN', '2026-09-01', '', 'ppe');
  // Późniejsza korekta salda (zmiana wyceny konta inwestycyjnego).
  add('k-eur', '2026-10-20T12:00:00.000Z', 'Expense', 44000, 10000, 'EUR', '2026-10-20', '', 'eur');
  for (let i = 0; i < 1500; i++) {
    const d = new Date(Date.UTC(2026, 8, 2 + (i % 58)));
    add(`t-${i}`, d.toISOString(), 'Expense', 1000 + i, 1000 + i, 'PLN', d.toISOString().slice(0, 10), i === 7 ? LONG_NOTE : `zakup ${i}`, 'main', 'DefaultProducts');
  }
  add('t-pay', '2026-10-10T08:00:00.000Z', 'Income', 850000, 850000, 'PLN', '2026-10-10', 'Pensja', 'main', 'DefaultSalary');
  add('t-eur', '2026-10-12T08:00:00.000Z', 'Expense', 43000, 10000, 'EUR', '2026-10-12', 'Kawa w Wiedniu', 'eur', 'other_expense');
  for (let i = 0; i < 3; i++) add(`t-food-${i}`, '2026-10-03T08:00:00.000Z', 'Expense', 4500, 4500, 'PLN', '2026-10-03', 'Obiad', 'card', 'c-food');
  for (let i = 0; i < 4; i++) add(`t-alko-${i}`, '2026-10-04T08:00:00.000Z', 'Expense', 3000, 3000, 'PLN', '2026-10-04', '', 'card', 'c-alko');
  add('t-hobby', '2026-10-05T08:00:00.000Z', 'Expense', 9000, 9000, 'PLN', '2026-10-05', '', 'card', 'c-hobby');
  for (let i = 0; i < 2; i++) add(`t-kosmos-${i}`, '2026-10-06T08:00:00.000Z', 'Expense', 1500, 1500, 'PLN', '2026-10-06', '', 'card', 'c-kosmos');
  add('t-old', '2026-09-03T08:00:00.000Z', 'Expense', 2000, 2000, 'PLN', '2026-09-03', 'stare', 'old', 'c-gone');
  add('t-del', '2026-10-13T08:00:00.000Z', 'Expense', 99900, 99900, 'PLN', '2026-10-13', 'usunięty', 'main', 'DefaultProducts', 1);
  // Stała płatność z automatem: terminy zapisane przez Money Managera mają identyfikator „okres_data”.
  add('p1_2026-09-30', '2026-09-30T22:00:00.000Z', 'Expense', 50000, 50000, 'PLN', '2026-09-30', '', 'main', 'DefaultHome');
  add('p2_2026-10-31', '2026-10-31T22:00:00.000Z', 'Expense', 50000, 50000, 'PLN', '2026-10-31', '', 'main', 'DefaultHome');
  const tr = db.prepare('INSERT INTO transfer (uid, fromAmount, fromCurrencyCode, toAmount, toCurrencyCode, date, comment, isRemoved) VALUES (?,?,?,?,?,?,?,?)');
  tr.run('tr-repay', 50000, 'PLN', 50000, 'PLN', '2026-10-20', 'Spłata karty', 0);
  link.run('Transfer', 'tr-repay', 'FromAccount', 'main', 0);
  link.run('Transfer', 'tr-repay', 'ToAccount', 'card', 0);
  tr.run('tr-fx', 43000, 'PLN', 10000, 'EUR', '2026-10-11', '', 0);
  link.run('Transfer', 'tr-fx', 'FromAccount', 'main', 0);
  link.run('Transfer', 'tr-fx', 'ToAccount', 'eur', 0);
  tr.run('tr-null', 34772, 'PLN', null, null, '2026-10-26', '', 0); // tak zapisuje przelew w tej samej walucie
  link.run('Transfer', 'tr-null', 'FromAccount', 'main', 0);
  link.run('Transfer', 'tr-null', 'ToAccount', 'card', 0);
  tr.run('tr-gone', 100, 'PLN', 100, 'PLN', '2026-10-21', '', 1);
  const rem = db.prepare('INSERT INTO reminding (uid, title, text, period, transactionType, startDate, enabled, isRemoved, amount, remindingType, addAutomatically) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  rem.run('daily', 'Przypomnienie!', 'Dodaj wydatki', 'Day', null, '2026-09-01', 1, 0, 0, 'reminding', 0);
  rem.run('rent', 'Mieszkanie', '', 'Month', 'Expense', '2026-09-30', 1, 0, 50000, 'regularPayments', 1);
  rem.run('bonus', 'Pluxee', '', 'Month', 'Income', '2026-09-30', 1, 0, 40000, 'regularPayments', 0);
  rem.run('weird', 'Codziennie', '', 'Day', 'Expense', '2026-09-30', 1, 0, 100, 'regularPayments', 1);
  for (const [r, a, c] of [['rent', 'main', 'DefaultHome'], ['bonus', 'main', 'DefaultSalary']]) {
    link.run('Reminding', r, 'Account', a, 0);
    link.run('Reminding', r, 'Category', c, 0);
  }
  link.run('Reminding', 'rent', 'RegularPaymentPeriod', 'p1', 0);
  link.run('Reminding', 'rent', 'RegularPaymentPeriod', 'p2', 0);
  link.run('RegularPaymentPeriod', 'p1', 'Transaction', 'p1_2026-09-30', 0);
  link.run('RegularPaymentPeriod', 'p2', 'Transaction', 'p2_2026-10-31', 0);
  db.prepare('INSERT INTO rates VALUES (?,?,?,?)').run('PLN', 'EUR', '2026-11-02T10:00:00Z', 0.25);
  db.prepare('INSERT INTO syncable_settings (uid, value, type, isRemoved) VALUES (?,?,?,0)').run('defaultCurrencyCode', 'PLN', 'string');
  db.exec('COMMIT');
  db.close();
  return readFileSync(file);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Minimalny zapis ZIP (bez kompresji albo deflate) z wypełniaczem na początku, jak w plikach .mmbackup.
function zip(files, prefix = Buffer.alloc(0)) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, deflate } of files) {
    const body = deflate ? deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, body);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([prefix, ...locals, cd, eocd]);
}

const backup = (db, meta = { version: 1 }) =>
  zip(
    [
      { name: 'MyFinance.db', data: db, deflate: true },
      { name: 'backup_meta', data: Buffer.from(JSON.stringify(meta)) },
    ],
    Buffer.alloc(8, 8),
  );

let seq = 0;
const newId = () => `id-${++seq}`;
const toBuf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const TODAY = '2026-11-02';
const MARKET = { asOf: TODAY, fx: { EUR: [['2026-09-01', 4.3], [TODAY, 4.4]] }, assets: {} };

// Jedna kopia na wszystkie testy (budowa bazy trwa chwilę).
let snapPromise = null;
let dbBytes = null;
function snapshot() {
  snapPromise ??= (async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
    try {
      dbBytes = buildDb(dir);
      return await readMmBackup(toBuf(backup(dbBytes)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
  return snapPromise;
}
// Dziennik prowadzony już przed importem: konto wpisane ręcznie (z literówką) i jedna operacja, która jest też w kopii.
function existingJournal() {
  const fin = emptyFinance();
  fin.accounts.push({ id: 'mine', name: 'Ertse konto', type: 'bank', openingBalance: 4000, openingDate: '1970-01-01', cards: [] });
  fin.txs.push({ id: 'manual-pay', type: 'przychod', amount: 8500, date: '2026-10-11', accountId: 'mine', categoryId: 'wynagrodzenie', source: 'reczne', createdAt: 5, updatedAt: 5 });
  return fin;
}

test('czytnik SQLite: wszystkie typy wartości, alias rowid, polskie znaki', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
  try {
    const file = path.join(dir, 'types.db');
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v, label TEXT)');
    const values = [0, 1, -1, 127, -129, 32767, 70000, -8388608, 2147483648, -140737488355328, 9007199254740991, 3.14159, null, 'zażółć gęślą jaźń'];
    const ins = db.prepare('INSERT INTO t (v, label) VALUES (?, ?)');
    for (const v of values) ins.run(v, `x${v}`);
    ins.run(Buffer.from([1, 2, 3]), 'blob');
    db.close();
    const rows = openSqlite(readFileSync(file)).all('t');
    assert.deepEqual(rows.slice(0, values.length).map((r) => r.v), values);
    assert.deepEqual(rows.map((r) => r.id), Array.from({ length: values.length + 1 }, (_, i) => i + 1));
    assert.deepEqual([...rows.at(-1).v], [1, 2, 3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('odczyt kopii: korekty salda, nazwy wbudowanych kategorii, stałe płatności, kursy', async () => {
  const snap = await snapshot();
  const entries = await unzipEntries(backup(dbBytes));
  assert.deepEqual([...entries.keys()], ['MyFinance.db', 'backup_meta']);
  assert.equal(snap.entries.length, 4 + 1500 + 1 + 1 + 3 + 4 + 1 + 2 + 1 + 2); // bez usuniętej operacji
  const byUid = (uid) => snap.entries.find((e) => e.uid === uid);
  assert.equal(byUid('o-main').correction, true);
  assert.equal(byUid('o-main').opening, true);
  assert.equal(byUid('k-eur').correction, true);
  assert.equal(byUid('k-eur').opening, false);
  assert.equal(byUid('t-pay').correction, false);
  assert.equal(byUid('t-7').note, LONG_NOTE);
  assert.equal(snap.categories.find((c) => c.uid === 'DefaultProducts').title, 'Produkty spożywcze');
  assert.equal(snap.categories.find((c) => c.uid === 'other_income').title, 'Inne przychody');
  assert.equal(snap.categories.find((c) => c.uid === 'c-food').builtIn, false);
  assert.equal(snap.rates.EUR, 4);
  assert.equal(snap.reminders, 1);
  assert.match(snap.warnings[0], /Codziennie/);
  assert.deepEqual(snap.recurring.map((r) => [r.title, r.type, r.amount, r.freq, r.auto, r.lastPosted]), [
    ['Mieszkanie', 'wydatek', 500, 'miesiac', true, '2026-10-31'],
    ['Pluxee', 'przychod', 400, 'miesiac', false, null],
  ]);
  assert.equal(snap.transfers.find((t) => t.uid === 'tr-null').toAmount, 347.72);
  assert.deepEqual(snap.removedUids.sort(), ['t-del', 'tr-gone']);
});

test('plan importu: podobne konto (z literówką), odpowiedniki kategorii, propozycja nowej kategorii, terminy stałych', async () => {
  const snap = await snapshot();
  const plan = suggestMmMapping(snap, existingJournal(), { today: TODAY });
  const acc = Object.fromEntries(plan.accounts.map((r) => [r.uid, r]));
  assert.equal(acc.main.choice, 'mine');
  assert.equal(acc.card.choice, 'new');
  assert.equal(acc.card.type, 'karta');
  assert.equal(acc.eur.type, 'inwestycje');
  assert.equal(acc.old.choice, 'new'); // usunięte w Money Managerze, ale ma operacje
  const cat = Object.fromEntries(plan.categories.map((r) => [r.uid, r.choice]));
  assert.deepEqual(cat, {
    DefaultProducts: 'zakupy',
    DefaultHome: 'mieszkanie',
    other_expense: 'inne',
    'c-food': 'jedzenie',
    'c-alko': 'new',
    'c-hobby': 'rozrywka',
    'c-kosmos': 'none',
    'c-gone': 'none',
    DefaultSalary: 'wynagrodzenie',
  });
  assert.deepEqual(plan.recurring.map((r) => [r.title, r.nextDate]), [['Mieszkanie', '2026-11-30'], ['Pluxee', '2026-11-30']]);
  assert.equal(plan.corrections, 4);
});

test('import: korekty nie są przychodami, salda jak w Money Managerze, duplikaty pominięte, waluty', async () => {
  const snap = await snapshot();
  const plan = suggestMmMapping(snap, existingJournal(), { today: TODAY });
  const { fin, report } = mmToFinance(snap, existingJournal(), { newId, now: 1000, plan, market: MARKET });
  const byMm = (uid) => fin.accounts.find((a) => a.mmUid === uid);
  const bal = balances(fin);
  assert.equal(byMm('main').id, 'mine'); // połączone z kontem z dziennika
  assert.equal(Math.round(bal.mine * 100), 523450);
  assert.equal(Math.round(bal[byMm('card').id] * 100), -125000);
  assert.equal(Math.round(bal[byMm('eur').id] * 100), 100000); // w euro
  assert.equal(byMm('eur').currency, 'EUR');
  assert.equal(byMm('ppe').excludeFromTotal, true);
  assert.equal(byMm('old').archived, true);
  // Przychody we wrześniu: zero (saldo początkowe to korekta). Pensja w październiku tylko raz (była już w dzienniku).
  assert.equal(summarize(fin, '2026-09-01', '2026-09-30').income, 0);
  assert.equal(summarize(fin, '2026-10-01', '2026-10-31').income, 8500);
  assert.equal(report.duplicates, 1);
  assert.equal(report.corrections, 4);
  const korekty = liveTx(fin).filter((t) => t.type === 'korekta');
  assert.deepEqual(korekty.map((t) => [t.merchant, t.amount, t.accountAmount]).sort(), [
    ['Korekta salda', -440, -100],
    ['Saldo początkowe', 2000, undefined],
    ['Saldo początkowe', 20000, undefined],
    ['Saldo początkowe', 4730, 1100],
  ].sort());
  const kawa = liveTx(fin).find((t) => t.importKey === 'mm|t-eur');
  assert.deepEqual([kawa.amount, kawa.accountAmount], [430, 100]);
  const fx = liveTx(fin).find((t) => t.importKey === 'mm|tr-fx');
  assert.deepEqual([fx.amount, fx.accountAmount, fx.toAmount], [430, undefined, 100]);
  const same = liveTx(fin).find((t) => t.importKey === 'mm|tr-null');
  assert.deepEqual([same.amount, same.toAmount], [347.72, undefined]);
  // Kategorie: tylko „Alkohol” jako nowa; rzadkie bez odpowiednika trafiają do „Do przypisania”.
  assert.equal(report.categories, 1);
  assert.equal(fin.categories.find((c) => c.mmCreated).name, 'Alkohol');
  assert.equal(report.uncategorized, 3);
  assert.equal(liveTx(fin).find((t) => t.importKey === 'mm|t-food-0').categoryId, 'jedzenie');
  assert.equal(liveTx(fin).find((t) => t.importKey === 'mm|t-7').note, LONG_NOTE.trim());
  // Stałe płatności z Money Managera.
  assert.deepEqual(fin.recurring.map((r) => [r.title, r.accountId, r.categoryId, r.nextDate, r.auto]), [
    ['Mieszkanie', 'mine', 'mieszkanie', '2026-11-30', true],
    ['Pluxee', 'mine', 'wynagrodzenie', '2026-11-30', false],
  ]);
});

test('import: pominięcie konta i zachowanie salda połączonego konta', async () => {
  const snap = await snapshot();
  const plan = suggestMmMapping(snap, existingJournal(), { today: TODAY });
  plan.accounts.find((r) => r.uid === 'ppe').choice = 'skip';
  plan.setBalances = false;
  const before = balances(existingJournal()).mine;
  const { fin, report } = mmToFinance(snap, existingJournal(), { newId, now: 1000, plan, market: MARKET });
  assert.equal(report.skippedAccounts, 1);
  assert.equal(fin.accounts.some((a) => a.mmUid === 'ppe'), false);
  assert.equal(liveTx(fin).some((t) => t.importKey === 'mm|o-ppe'), false);
  assert.equal(Math.round(balances(fin).mine * 100), Math.round(before * 100));
});

test('ponowny import: bez duplikatów, zmiany z Money Managera, ochrona operacji zmienionych tutaj', async () => {
  const snap = await snapshot();
  let { fin } = mmToFinance(snap, emptyFinance(), { newId, now: 1000, market: MARKET, today: TODAY });
  const again = mmToFinance(snap, fin, { newId, now: 2000, market: MARKET, today: TODAY });
  assert.equal(again.report.added, 0);
  assert.equal(again.report.updated, 0);
  assert.equal(liveTx(again.fin).length, liveTx(fin).length);
  assert.equal(again.fin.recurring.length, fin.recurring.length);
  fin = again.fin;
  const local = fin.txs.find((t) => t.importKey === 'mm|t-1');
  local.categoryId = 'inne';
  local.updatedAt = 3000;
  const next = JSON.parse(JSON.stringify(snap));
  next.entries.find((e) => e.uid === 't-1').amount = 999;
  next.entries.find((e) => e.uid === 't-2').amount = 777;
  next.entries = next.entries.filter((e) => e.uid !== 't-3');
  next.removedUids.push('t-3');
  const r = mmToFinance(next, fin, { newId, now: 4000, market: MARKET, today: TODAY });
  assert.equal(r.report.updated, 1);
  assert.equal(r.report.removed, 1);
  const get = (k) => r.fin.txs.find((t) => t.importKey === k);
  assert.equal(get('mm|t-1').amount, 10.01); // zmieniona tutaj – zostaje
  assert.equal(get('mm|t-2').amount, 777);
  assert.equal(get('mm|t-3').deleted, true);
});

test('cofnięcie importu przywraca dziennik sprzed importu', async () => {
  const snap = await snapshot();
  const start = existingJournal();
  start.txs.push({ id: 'later', type: 'wydatek', amount: 12, date: '2026-11-02', accountId: 'mine', categoryId: 'zakupy', source: 'reczne' });
  const { fin } = mmToFinance(snap, start, { newId, now: 1000, market: MARKET, today: TODAY });
  const { fin: back, report } = removeMmImport(fin);
  assert.equal(report.accounts, 4); // karta, konto w euro, PPE, stare konto
  assert.equal(report.categories, 1);
  assert.equal(report.recurring, 2);
  assert.deepEqual(back.accounts.map((a) => a.id), ['mine']);
  assert.equal(back.accounts[0].mmUid, undefined);
  assert.equal(balances(back).mine, balances(start).mine);
  assert.deepEqual(back.txs.map((t) => t.id).sort(), ['later', 'manual-pay']);
  assert.equal(back.categories.length, emptyFinance().categories.length);
  assert.equal(back.mmImport, undefined);
});

test('naprawa danych ze starszej wersji importu: korekty salda i nazwy kategorii', () => {
  const fin = emptyFinance();
  fin.categories.push({ id: 'k1', name: 'Kategoria', emoji: '🏷️', kind: 'wydatek', mmUid: 'DefaultProducts' });
  fin.txs.push(
    { id: '1', type: 'przychod', amount: 138378, date: '2026-09-27', accountId: 'x', categoryId: null, source: 'mm' },
    { id: '2', type: 'wydatek', amount: 100, accountAmount: 25, date: '2026-09-28', accountId: 'x', categoryId: null, source: 'mm' },
    { id: '3', type: 'wydatek', amount: 50, date: '2026-09-28', accountId: 'x', categoryId: 'k1', source: 'mm' },
    { id: '4', type: 'wydatek', amount: 9, date: '2026-09-28', accountId: 'x', categoryId: null, source: 'reczne' },
  );
  const { fin: out, corrections, renamed } = repairLegacyMmImport(fin);
  assert.equal(corrections, 2);
  assert.equal(renamed, 1);
  assert.deepEqual(out.txs.map((t) => [t.type, t.amount, t.accountAmount]), [
    ['korekta', 138378, undefined],
    ['korekta', -100, -25],
    ['wydatek', 50, undefined],
    ['wydatek', 9, undefined],
  ]);
  assert.equal(out.categories.find((c) => c.id === 'k1').name, 'Produkty spożywcze');
  assert.equal(out.categories.find((c) => c.id === 'k1').emoji, '🛒');
  assert.equal(repairLegacyMmImport(out).corrections, 0); // tylko raz
});

test('błędne pliki: sama baza, zwykły plik, nowsza wersja kopii', async () => {
  await snapshot();
  await assert.rejects(readMmBackup(toBuf(dbBytes)), /sama baza danych/);
  await assert.rejects(readMmBackup(toBuf(Buffer.from('to nie jest kopia'))), /nie jest kopia/);
  const snap = await readMmBackup(toBuf(backup(dbBytes, { version: 3 })));
  assert.match(snap.warnings[0], /nowszej wersji/);
});
