import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { readMmBackup, mmToFinance, openSqlite, unzipEntries } from '../src/client/mmbackup.js';
import { emptyFinance, balances, liveTx, summarize } from '../src/client/finance-core.js';

// Schemat jak w bazie MyFinance.db aplikacji Money Manager (Room, nazwy w odwróconych apostrofach).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS \`account\` (\`uid\` TEXT NOT NULL, \`title\` TEXT NOT NULL, \`icon\` TEXT, \`color\` INTEGER NOT NULL, \`currencyCode\` TEXT NOT NULL, \`ignoreInBalance\` INTEGER NOT NULL, \`isActive\` INTEGER NOT NULL, \`isRemoved\` INTEGER NOT NULL, \`position\` INTEGER NOT NULL, \`isArchived\` INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`account_balance\` (\`uid\` TEXT NOT NULL, \`value\` INTEGER NOT NULL, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`category\` (\`uid\` TEXT NOT NULL, \`title\` TEXT NOT NULL, \`type\` TEXT NOT NULL, \`color\` INTEGER NOT NULL, \`isRemoved\` INTEGER NOT NULL, \`limitAmount\` INTEGER, \`position\` INTEGER NOT NULL, \`isArchived\` INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`transaction\` (\`uid\` TEXT NOT NULL, \`created\` INTEGER NOT NULL, \`type\` TEXT NOT NULL, \`amountInDefaultCurrency\` INTEGER NOT NULL, \`amountInRealCurrency\` INTEGER NOT NULL, \`realCurrencyCode\` TEXT NOT NULL, \`amountInAccountCurrency\` INTEGER NOT NULL, \`accountCurrencyCode\` TEXT NOT NULL, \`date\` TEXT NOT NULL, \`comment\` TEXT, \`isRemoved\` INTEGER NOT NULL, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`transfer\` (\`uid\` TEXT NOT NULL, \`fromAmount\` INTEGER NOT NULL, \`fromCurrencyCode\` TEXT NOT NULL, \`toAmount\` INTEGER NOT NULL, \`toCurrencyCode\` TEXT NOT NULL, \`date\` TEXT NOT NULL, \`comment\` TEXT, \`isRemoved\` INTEGER NOT NULL, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`sync_link\` (\`id\` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, \`entityType\` TEXT NOT NULL, \`entityUid\` TEXT NOT NULL, \`otherType\` TEXT NOT NULL, \`otherUid\` TEXT NOT NULL, \`isRemoved\` INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS \`syncable_settings\` (\`uid\` TEXT NOT NULL, \`value\` TEXT, \`isRemoved\` INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(\`uid\`));
CREATE TABLE IF NOT EXISTS \`reminding\` (\`uid\` TEXT NOT NULL, \`isRemoved\` INTEGER NOT NULL, PRIMARY KEY(\`uid\`));
`;

const LONG_NOTE = `Zakupy na urodziny – ${'tort, balony, świeczki; '.repeat(140)}`;

// Baza z ~1500 operacjami na stronach 1 KB: wymusza wielopoziome drzewo B i strony przepełnienia.
function buildDb(dir, { extra = () => {} } = {}) {
  const file = path.join(dir, `MyFinance-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA page_size = 1024;');
  db.exec(SCHEMA);
  db.exec('BEGIN');
  const acc = db.prepare('INSERT INTO account VALUES (?,?,?,?,?,?,?,?,?,?)');
  acc.run('a-bank', 'mBank konto', 'bank', -16776961, 'PLN', 0, 1, 0, 0, 0);
  acc.run('a-card', 'Karta kredytowa', 'card', -65536, 'PLN', 0, 1, 0, 1, 0);
  acc.run('a-eur', 'Revolut EUR', 'card', -16711936, 'EUR', 1, 1, 0, 2, 0);
  acc.run('a-old', 'Stare konto', 'bank', -1, 'PLN', 0, 0, 1, 3, 0);
  const bal = db.prepare('INSERT INTO account_balance VALUES (?,?)');
  bal.run('a-bank', 523450);
  bal.run('a-card', -125000);
  bal.run('a-eur', 10000);
  const cat = db.prepare('INSERT INTO category VALUES (?,?,?,?,?,?,?,?)');
  cat.run('c-food', 'Jedzenie', 'Expense', -65536, 0, 150000, 0, 0);
  cat.run('c-fuel', 'Paliwo', 'Expense', -23296, 0, null, 1, 0);
  cat.run('c-salary', 'Wynagrodzenie', 'Income', -16744448, 0, null, 2, 0);
  cat.run('c-gone', 'Usunięta', 'Expense', -1, 1, null, 3, 0);
  const tx = db.prepare('INSERT INTO "transaction" VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const link = db.prepare('INSERT INTO sync_link (entityType, entityUid, otherType, otherUid, isRemoved) VALUES (?,?,?,?,0)');
  for (let i = 0; i < 1500; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 3)));
    const uid = `t-${i}`;
    tx.run(uid, d.getTime(), 'Expense', 1000 + i, 1000 + i, 'PLN', 1000 + i, 'PLN', d.toISOString().slice(0, 10), i === 7 ? LONG_NOTE : `zakup ${i}`, 0);
    link.run('Transaction', uid, 'Account', i % 2 ? 'a-bank' : 'a-card');
    link.run('Transaction', uid, 'Category', i % 5 ? 'c-food' : 'c-fuel');
  }
  tx.run('t-pay', Date.UTC(2026, 9, 10), 'Income', 850000, 850000, 'PLN', 850000, 'PLN', '2026-10-10', 'Pensja', 0);
  link.run('Transaction', 't-pay', 'Account', 'a-bank');
  link.run('Transaction', 't-pay', 'Category', 'c-salary');
  tx.run('t-eur', Date.UTC(2026, 9, 12), 'Expense', 4300, 1000, 'EUR', 1000, 'EUR', '2026-10-12', 'Kawa w Wiedniu', 0);
  link.run('Transaction', 't-eur', 'Account', 'a-eur');
  link.run('Transaction', 't-eur', 'Category', 'c-food');
  tx.run('t-del', Date.UTC(2026, 9, 13), 'Expense', 99900, 99900, 'PLN', 99900, 'PLN', '2026-10-13', 'usunięty', 1);
  link.run('Transaction', 't-del', 'Account', 'a-bank');
  tx.run('t-old', Date.UTC(2024, 5, 1), 'Expense', 2000, 2000, 'PLN', 2000, 'PLN', '2024-06-01', 'stare', 0);
  link.run('Transaction', 't-old', 'Account', 'a-old');
  link.run('Transaction', 't-old', 'Category', 'c-gone');
  const tr = db.prepare('INSERT INTO transfer VALUES (?,?,?,?,?,?,?,?)');
  tr.run('tr-repay', 50000, 'PLN', 50000, 'PLN', '2026-10-20', 'Spłata karty', 0);
  link.run('Transfer', 'tr-repay', 'FromAccount', 'a-bank');
  link.run('Transfer', 'tr-repay', 'ToAccount', 'a-card');
  tr.run('tr-fx', 43000, 'PLN', 10000, 'EUR', '2026-10-11', '', 0);
  link.run('Transfer', 'tr-fx', 'FromAccount', 'a-bank');
  link.run('Transfer', 'tr-fx', 'ToAccount', 'a-eur');
  tr.run('tr-gone', 1, 'PLN', 1, 'PLN', '2026-10-21', '', 1);
  db.prepare('INSERT INTO syncable_settings VALUES (?,?,0)').run('defaultCurrencyCode', 'PLN');
  db.prepare('INSERT INTO reminding VALUES (?,0)').run('r-1');
  extra(db);
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

// Minimalny zapis ZIP (bez kompresji albo deflate) z opcjonalnym wypełniaczem na początku.
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
    Buffer.from('MMBACKUP-PADDING'),
  );

let seq = 0;
const newId = () => `id-${++seq}`;
const toBuf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

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

test('kopia .mmbackup: wypełniacz, ZIP, wielostronicowa baza, długie notatki', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
  try {
    const file = backup(buildDb(dir));
    const entries = await unzipEntries(file);
    assert.deepEqual([...entries.keys()], ['MyFinance.db', 'backup_meta']);
    const snap = await readMmBackup(toBuf(file));
    assert.equal(snap.version, 1);
    assert.equal(snap.defaultCurrency, 'PLN');
    assert.deepEqual(snap.warnings, []);
    assert.equal(snap.accounts.length, 4);
    assert.equal(snap.accounts.find((a) => a.uid === 'a-bank').color, '#0000FF');
    assert.equal(snap.accounts.find((a) => a.uid === 'a-old').hidden, true);
    assert.equal(snap.accounts.find((a) => a.uid === 'a-eur').excluded, true);
    assert.equal(snap.entries.length, 1503); // 1500 + pensja + EUR + stara; usunięta pominięta
    assert.equal(snap.transfers.length, 2);
    assert.deepEqual(snap.removedUids.sort(), ['t-del', 'tr-gone']);
    assert.equal(snap.entries.find((e) => e.uid === 't-7').note, LONG_NOTE);
    assert.equal(snap.reminders, 1);
    const eur = snap.entries.find((e) => e.uid === 't-eur');
    assert.equal(eur.amount, 10);
    assert.equal(eur.defaultAmount, 43);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('import do dziennika: salda jak w Money Managerze, karta na minusie, waluty, kategorie', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
  try {
    const snap = await readMmBackup(toBuf(backup(buildDb(dir))));
    const { fin, report } = mmToFinance(snap, emptyFinance(), { newId, now: 1000 });
    const byMm = (uid) => fin.accounts.find((a) => a.mmUid === uid);
    const bal = balances(fin);
    assert.equal(Math.round(bal[byMm('a-bank').id] * 100), 523450);
    assert.equal(Math.round(bal[byMm('a-card').id] * 100), -125000);
    assert.equal(byMm('a-card').type, 'karta');
    assert.equal(Math.round(bal[byMm('a-eur').id] * 100), 10000); // saldo w euro
    assert.equal(byMm('a-eur').currency, 'EUR');
    assert.equal(byMm('a-eur').excludeFromTotal, true);
    assert.equal(byMm('a-old').archived, true); // usunięte, ale ma operacje
    assert.equal(report.added, 1503 + 2);
    assert.equal(report.uncategorized, 0);
    assert.deepEqual(report.foreign, ['Revolut EUR (EUR)']);
    // Kawa w euro liczy się w raportach w złotych.
    const oct = summarize(fin, '2026-10-01', '2026-10-31');
    assert.equal(oct.income, 8500);
    assert.equal(Math.round(oct.expense * 100), 4300);
    const kawa = liveTx(fin).find((t) => t.importKey === 'mm|t-eur');
    assert.equal(kawa.amount, 43);
    assert.equal(kawa.accountAmount, 10);
    const fx = liveTx(fin).find((t) => t.importKey === 'mm|tr-fx');
    assert.equal(fx.amount, 430);
    assert.equal(fx.toAmount, 100);
    const longOne = liveTx(fin).find((t) => t.importKey === 'mm|t-7');
    assert.equal(longOne.merchant.length, 80);
    assert.equal(longOne.note, LONG_NOTE.trim());
    // Kategorie z Money Managera zastępują domyślne (domyślne bez operacji są ukryte).
    const food = fin.categories.find((c) => c.mmUid === 'c-food');
    assert.equal(food.emoji, '🛒');
    assert.equal(food.budget, 1500);
    assert.equal(fin.categories.find((c) => c.mmUid === 'c-fuel').emoji, '🚗');
    assert.equal(fin.categories.find((c) => c.mmUid === 'c-gone').archived, true);
    assert.ok(report.hiddenDefaults > 10);
    assert.ok(fin.categories.filter((c) => !c.archived).every((c) => c.mmUid));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ponowny import: bez duplikatów, aktualizuje zmienione, usuwa usunięte, nie rusza edytowanych tutaj', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
  try {
    const snap = await readMmBackup(toBuf(backup(buildDb(dir))));
    let { fin } = mmToFinance(snap, emptyFinance(), { newId, now: 1000 });
    const again = mmToFinance(snap, fin, { newId, now: 2000 });
    assert.equal(again.report.added, 0);
    assert.equal(again.report.updated, 0);
    assert.equal(liveTx(again.fin).length, liveTx(fin).length);

    // Tutaj zmieniona kategoria jednej operacji; w nowszej kopii zmieniona kwota dwóch innych i usunięta jeszcze inna.
    fin = again.fin;
    const local = fin.txs.find((t) => t.importKey === 'mm|t-1');
    local.categoryId = 'zakupy';
    local.updatedAt = 3000;
    const next = JSON.parse(JSON.stringify(snap));
    next.entries.find((e) => e.uid === 't-1').amount = 999;
    next.entries.find((e) => e.uid === 't-2').amount = 777;
    next.entries = next.entries.filter((e) => e.uid !== 't-3');
    next.removedUids.push('t-3');
    next.entries.push({ ...next.entries[0], uid: 't-new', amount: 5 });
    const r = mmToFinance(next, fin, { newId, now: 4000 });
    assert.equal(r.report.added, 1);
    assert.equal(r.report.updated, 1);
    assert.equal(r.report.removed, 1);
    const get = (k) => r.fin.txs.find((t) => t.importKey === k);
    assert.equal(get('mm|t-1').amount, 10.01); // edytowana tutaj – zostaje
    assert.equal(get('mm|t-2').amount, 777);
    assert.equal(get('mm|t-3').deleted, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('błędne pliki: sama baza, zwykły plik, nowsza wersja kopii', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mm-'));
  try {
    const db = buildDb(dir);
    await assert.rejects(readMmBackup(toBuf(db)), /sama baza danych/);
    await assert.rejects(readMmBackup(toBuf(Buffer.from('to nie jest kopia'))), /nie jest kopia/);
    const snap = await readMmBackup(toBuf(backup(db, { version: 3 })));
    assert.match(snap.warnings[0], /nowszej wersji/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
