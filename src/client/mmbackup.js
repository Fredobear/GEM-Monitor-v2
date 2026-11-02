// Import kopii z aplikacji „Money Manager: finanse, przychody i wydatki” (Orange Dog), plik .mmbackup.
// Budowa pliku: (opcjonalny wypełniacz) + archiwum ZIP z bazą SQLite „MyFinance.db” i opcjonalnym „backup_meta”.
// Wszystko liczone lokalnie: własny czytnik ZIP (DecompressionStream) i własny czytnik SQLite, bez sieci.
// Na stronie finanse.html plik jest wklejany po finance-core.js (bez instrukcji import/export).
import { liveTx, nextColor, setBalance } from './finance-core.js';

async function inflateRawBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('ta przeglądarka nie umie rozpakować pliku (zaktualizuj iOS do wersji 16.4 lub nowszej)');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Pliki z archiwum ZIP: Map(nazwa → bajty). Obsługuje wypełniacz przed archiwum (przesunięte offsety).
export async function unzipEntries(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('to nie jest kopia .mmbackup (brak archiwum ZIP)');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const shift = Math.max(0, eocd - cdSize - cdOffset);
  const out = new Map();
  let p = cdOffset + shift;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('uszkodzone archiwum');
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true) + shift;
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, await inflateRawBytes(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------- Minimalny czytnik SQLite: odczyt tabel (drzewa B z rowid), z obsługą stron przepełnienia ----------
const varintAt = (bytes, pos) => {
  let v = 0;
  for (let i = 0; i < 8; i++) {
    const b = bytes[pos + i];
    v = v * 128 + (b & 0x7f);
    if (!(b & 0x80)) return [v, i + 1];
  }
  return [v * 256 + bytes[pos + 8], 9];
};

export function openSqlite(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (new TextDecoder('latin1').decode(u8.subarray(0, 15)) !== 'SQLite format 3') throw new Error('w kopii brak bazy danych');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const pageSize = dv.getUint16(16) === 1 ? 65536 : dv.getUint16(16);
  const usable = pageSize - u8[20];
  const enc = dv.getUint32(56);
  const text = new TextDecoder(enc === 2 ? 'utf-16le' : enc === 3 ? 'utf-16be' : 'utf-8');

  // Treść komórki liścia tabeli; dłuższe rekordy ciągną się na kolejnych stronach (overflow).
  const payload = (pos, len) => {
    const X = usable - 35;
    if (len <= X) return u8.subarray(pos, pos + len);
    const M = Math.floor(((usable - 12) * 32) / 255) - 23;
    const K = M + ((len - M) % (usable - 4));
    const local = K <= X ? K : M;
    const out = new Uint8Array(len);
    out.set(u8.subarray(pos, pos + local), 0);
    let filled = local;
    let next = dv.getUint32(pos + local);
    while (next && filled < len) {
      const base = (next - 1) * pageSize;
      const take = Math.min(usable - 4, len - filled);
      out.set(u8.subarray(base + 4, base + 4 + take), filled);
      filled += take;
      next = dv.getUint32(base);
    }
    return out;
  };

  const record = (buf) => {
    const bv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const [hdrLen, n0] = varintAt(buf, 0);
    const types = [];
    for (let p = n0; p < hdrLen; ) {
      const [t, n] = varintAt(buf, p);
      types.push(t);
      p += n;
    }
    const values = [];
    let p = hdrLen;
    for (const t of types) {
      let v = null;
      let size = 0;
      switch (t) {
        case 1: v = bv.getInt8(p); size = 1; break;
        case 2: v = bv.getInt16(p); size = 2; break;
        case 3: v = (((buf[p] << 16) | (buf[p + 1] << 8) | buf[p + 2]) << 8) >> 8; size = 3; break;
        case 4: v = bv.getInt32(p); size = 4; break;
        case 5: v = bv.getInt16(p) * 4294967296 + bv.getUint32(p + 2); size = 6; break;
        case 6: v = Number(bv.getBigInt64(p)); size = 8; break;
        case 7: v = bv.getFloat64(p); size = 8; break;
        case 8: v = 0; break;
        case 9: v = 1; break;
        default:
          if (t >= 12 && t % 2 === 0) {
            size = (t - 12) / 2;
            v = buf.slice(p, p + size);
          } else if (t >= 13) {
            size = (t - 13) / 2;
            v = text.decode(buf.subarray(p, p + size));
          }
      }
      values.push(v);
      p += size;
    }
    return values;
  };

  // Przejście drzewa B tabeli: strony wewnętrzne 0x05, liście 0x0D.
  const rowsOf = (root) => {
    const out = [];
    const stack = [root];
    let guard = 0;
    while (stack.length && guard++ < 1e6) {
      const pg = stack.pop();
      const base = (pg - 1) * pageSize;
      const hdr = base + (pg === 1 ? 100 : 0);
      const type = u8[hdr];
      const cells = dv.getUint16(hdr + 3);
      if (type === 0x0d) {
        for (let i = 0; i < cells; i++) {
          let pos = base + dv.getUint16(hdr + 8 + i * 2);
          const [len, a] = varintAt(u8, pos);
          pos += a;
          const [rowid, b] = varintAt(u8, pos);
          pos += b;
          out.push({ rowid, values: record(payload(pos, len)) });
        }
      } else if (type === 0x05) {
        const children = [];
        for (let i = 0; i < cells; i++) children.push(dv.getUint32(base + dv.getUint16(hdr + 12 + i * 2)));
        children.push(dv.getUint32(hdr + 8));
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      } else throw new Error(`nieobsługiwana strona bazy danych (typ ${type})`);
    }
    return out;
  };

  const columnsOf = (sql) => {
    const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
    const parts = [];
    let depth = 0;
    let cur = '';
    let quote = null;
    for (const ch of body) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`' || ch === '[') quote = ch === '[' ? ']' : ch;
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts
      .filter((p) => !/^(constraint|primary\s+key|unique|check|foreign\s+key)\b/i.test(p))
      .map((p) => {
        const m = p.match(/^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))\s*([\s\S]*)$/);
        return { name: m[1] ?? m[2] ?? m[3] ?? m[4], rowidAlias: /^integer\s+primary\s+key/i.test((m[5] ?? '').trim()) };
      });
  };

  const tables = new Map();
  for (const { values } of rowsOf(1)) {
    const [type, name, , rootpage, sql] = values;
    if (type === 'table' && sql && !/without\s+rowid/i.test(sql)) tables.set(name, { root: rootpage, columns: columnsOf(sql) });
  }
  return {
    has: (name) => tables.has(name),
    all(name) {
      const t = tables.get(name);
      if (!t) return [];
      return rowsOf(t.root).map(({ rowid, values }) => Object.fromEntries(t.columns.map((c, i) => [c.name, c.rowidAlias ? rowid : values[i] ?? null])));
    },
  };
}

// ---------- Odczyt danych Money Managera ----------
const argbToHex = (v) => {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return null;
  const n = Number(v) < 0 ? Number(v) + 4294967296 : Number(v);
  return `#${(n % 16777216).toString(16).padStart(6, '0').toUpperCase()}`;
};
const dayOf = (v) => (typeof v === 'number' ? new Date(v > 1e12 ? v : v * 1000).toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
const cents = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v) / 100);
const flag = (v) => v !== null && v !== undefined && Number(v) !== 0;
const keyName = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').trim();

export async function readMmBackup(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  if (new TextDecoder('latin1').decode(u8.subarray(0, 15)) === 'SQLite format 3') throw new Error('to sama baza danych, a nie kopia .mmbackup (może z innej aplikacji)');
  const entries = await unzipEntries(u8);
  const dbName = entries.has('MyFinance.db') ? 'MyFinance.db' : [...entries.keys()].find((n) => /\.db$/i.test(n));
  if (!dbName) throw new Error('w kopii brak pliku MyFinance.db');
  const warnings = [];
  let version = 1;
  if (entries.has('backup_meta')) {
    try {
      version = Number(JSON.parse(new TextDecoder().decode(entries.get('backup_meta'))).version ?? 1);
    } catch {
      version = 1;
    }
  }
  if (version > 1) warnings.push(`Kopia pochodzi z nowszej wersji Money Managera (format ${version}). Sprawdź podsumowanie przed importem.`);
  if ((entries.get(`${dbName}-wal`)?.length ?? 0) > 32) warnings.push('Kopia może nie zawierać zmian z ostatnich minut przed jej utworzeniem. Jeśli czegoś brakuje, zrób kopię ponownie.');

  const db = openSqlite(entries.get(dbName));
  const links = db.all('sync_link').filter((l) => !flag(l.isRemoved));
  const link = (entity, other) =>
    new Map(links.filter((l) => String(l.entityType).toLowerCase() === entity && String(l.otherType).toLowerCase() === other).map((l) => [l.entityUid, l.otherUid]));
  const txAccount = link('transaction', 'account');
  const txCategory = link('transaction', 'category');
  const trFrom = link('transfer', 'fromaccount');
  const trTo = link('transfer', 'toaccount');
  const balance = new Map(db.all('account_balance').map((b) => [b.uid, cents(b.value)]));
  const defaultCurrency = db.all('syncable_settings').find((s) => s.uid === 'defaultCurrencyCode' && !flag(s.isRemoved))?.value || 'PLN';
  const txRows = db.all('transaction');
  const trRows = db.all('transfer');
  return {
    version,
    defaultCurrency,
    warnings,
    accounts: db.all('account').map((a) => ({
      uid: a.uid,
      title: a.title || 'Konto',
      color: argbToHex(a.color),
      currency: a.currencyCode || defaultCurrency,
      hidden: (a.isActive !== null && a.isActive !== undefined && Number(a.isActive) === 0) || flag(a.isArchived),
      removed: flag(a.isRemoved),
      excluded: flag(a.ignoreInBalance),
      position: Number(a.position) || 0,
      storedBalance: balance.get(a.uid) ?? null,
    })),
    categories: db.all('category').map((c) => ({ uid: c.uid, title: c.title || 'Kategoria', income: String(c.type).toLowerCase() === 'income', color: argbToHex(c.color), removed: flag(c.isRemoved), archived: flag(c.isArchived), limit: cents(c.limitAmount) || null, position: Number(c.position) || 0 })),
    entries: txRows
      .filter((t) => !flag(t.isRemoved))
      .map((t) => ({
        uid: t.uid,
        income: String(t.type).toLowerCase() === 'income',
        day: dayOf(t.date),
        amount: Math.abs(cents(t.amountInAccountCurrency) ?? cents(t.amountInRealCurrency) ?? cents(t.amountInDefaultCurrency) ?? 0),
        defaultAmount: Math.abs(cents(t.amountInDefaultCurrency) ?? 0),
        note: String(t.comment ?? ''),
        accountUid: txAccount.get(t.uid) ?? null,
        categoryUid: txCategory.get(t.uid) ?? null,
      })),
    transfers: trRows
      .filter((t) => !flag(t.isRemoved))
      .map((t) => ({ uid: t.uid, day: dayOf(t.date), fromAmount: Math.abs(cents(t.fromAmount) ?? 0), toAmount: Math.abs(cents(t.toAmount) ?? cents(t.fromAmount) ?? 0), note: String(t.comment ?? ''), from: trFrom.get(t.uid) ?? null, to: trTo.get(t.uid) ?? null })),
    removedUids: [...txRows, ...trRows].filter((t) => flag(t.isRemoved)).map((t) => t.uid),
    reminders: db.has('reminding') ? db.all('reminding').filter((r) => !flag(r.isRemoved)).length : 0,
  };
}

// Rodzaj konta po nazwie i saldzie (karta kredytowa ma saldo ujemne).
const guessType = (title, stored) => {
  const t = keyName(title);
  if (/kredyt|credit/.test(t) || (/kart|card/.test(t) && (stored ?? 0) < 0)) return 'karta';
  if (/gotowk|cash|portfel|wallet/.test(t)) return 'gotowka';
  if (/oszczed|saving|lokat|skarbonk/.test(t)) return 'oszczednosci';
  return 'bank';
};

// Ikona kategorii po nazwie (Money Manager zapisuje własne ikony, których tu nie ma).
const EMOJI_HINTS = [
  [/restaur|kawiar|kawa|na miesc|fast ?food|cafe|coffee|dining|lunch|obiad/, '🍽️'],
  [/spozyw|zakup|market|grocer|jedzen|zywnos|food/, '🛒'],
  [/paliw|benzyn|transport|samoch|\bauto|taxi|uber|bilet|komunik|\bcar\b|fuel/, '🚗'],
  [/czynsz|mieszk|najem|\brent|housing/, '🏠'],
  [/rachun|media|prad|\bgaz\b|woda|internet|\bbills?\b|utilit/, '💡'],
  [/telefon|abonam|subskr|netflix|spotify|phone|subscr/, '📱'],
  [/zdrow|lekarz|\bleki?\b|aptek|medic|health|pharm/, '💊'],
  [/urod|kosmet|fryzj|beauty/, '💄'],
  [/ubran|odziez|obuw|\bbuty|cloth/, '👕'],
  [/rozryw|\bkino|hobby|\bgry\b|games|entertain/, '🎬'],
  [/sport|silown|fitness|\bgym/, '🏋️'],
  [/podroz|wakac|urlop|hotel|travel|trip/, '✈️'],
  [/prezent|gift|upomin/, '🎁'],
  [/eduk|szkol|kurs|ksiaz|nauka|educat|book/, '📚'],
  [/dzieci|dziecko|\bkids?\b|child/, '🧸'],
  [/zwierz|\bpies|\bkot|\bpets?\b/, '🐾'],
  [/\bdom\b|wyposaz|meble|remont|\bhome|furnit/, '🛋️'],
  [/podat|\btax|\bzus\b|oplat|\bfees?\b/, '🧾'],
  [/wynagr|pensj|wyplat|salary|\bpraca|wage/, '💼'],
  [/premi|bonus|nagrod/, '🎉'],
  [/oszczed|inwest|lokat|odsetk|dywid|saving|invest|interest|dividend/, '📈'],
  [/zwrot|refund/, '↩️'],
];
const guessEmoji = (title, income) => EMOJI_HINTS.find(([rx]) => rx.test(keyName(title)))?.[1] ?? (income ? '💰' : '🏷️');

// Scala kopię z dziennikiem. Ponowny import tej samej albo nowszej kopii nie dubluje operacji:
// dodaje nowe, aktualizuje zmienione w Money Managerze i usuwa usunięte tam (o ile nie zmieniono ich tutaj).
// Salda kont są ustawiane tak, by zgadzały się z saldami z Money Managera.
export function mmToFinance(snap, fin, { newId, now = Date.now() }) {
  const out = JSON.parse(JSON.stringify(fin));
  out.recurring ??= [];
  const fresh = !liveTx(out).length;
  const report = { accounts: 0, categories: 0, entries: snap.entries.length, transfers: snap.transfers.length, added: 0, updated: 0, unchanged: 0, removed: 0, uncategorized: 0, foreign: [], hiddenDefaults: 0 };
  const usedAcc = new Set([...snap.entries.map((e) => e.accountUid), ...snap.transfers.flatMap((t) => [t.from, t.to])]);
  const usedCat = new Set(snap.entries.map((e) => e.categoryUid));

  const accMap = new Map();
  const currencyOf = new Map();
  for (const a of [...snap.accounts].sort((x, y) => x.position - y.position)) {
    if (a.removed && !usedAcc.has(a.uid)) continue;
    let acc = out.accounts.find((x) => x.mmUid === a.uid);
    if (!acc) {
      acc = { id: newId(), name: a.title, type: guessType(a.title, a.storedBalance), openingBalance: 0, openingDate: '1970-01-01', cards: [], mmUid: a.uid };
      out.accounts.push(acc);
      report.accounts++;
    }
    acc.archived = a.hidden || a.removed;
    if (a.color) acc.color = a.color;
    if (a.excluded) acc.excludeFromTotal = true;
    const currency = a.currency || snap.defaultCurrency;
    currencyOf.set(a.uid, currency);
    if (currency !== 'PLN') {
      acc.currency = currency;
      report.foreign.push(`${a.title} (${currency})`);
    }
    accMap.set(a.uid, acc.id);
  }

  const catMap = new Map();
  for (const c of [...snap.categories].sort((x, y) => x.position - y.position)) {
    if (c.removed && !usedCat.has(c.uid)) continue;
    const kind = c.income ? 'przychod' : 'wydatek';
    let cat = out.categories.find((x) => x.mmUid === c.uid) ?? out.categories.find((x) => !x.mmUid && x.kind === kind && keyName(x.name) === keyName(c.title));
    if (!cat) {
      cat = { id: newId(), name: c.title, emoji: guessEmoji(c.title, c.income), kind, color: c.color ?? nextColor(out.categories.length), budget: c.limit ?? null };
      out.categories.push(cat);
      report.categories++;
    }
    cat.mmUid = c.uid;
    cat.archived = c.archived || c.removed || undefined;
    catMap.set(c.uid, cat.id);
  }

  const byKey = new Map(out.txs.filter((t) => t.importKey?.startsWith('mm|')).map((t) => [t.importKey, t]));
  const FIELDS = ['type', 'amount', 'accountAmount', 'toAmount', 'date', 'merchant', 'note', 'categoryId', 'accountId', 'toAccountId'];
  const pristine = (t) => !t.deleted && t.updatedAt === t.createdAt;
  const upsert = (t) => {
    const prev = byKey.get(t.importKey);
    if (!prev) {
      const tx = { id: newId(), ...t, source: 'mm', createdAt: now, updatedAt: now };
      for (const k of FIELDS) if (tx[k] === undefined) delete tx[k];
      out.txs.push(tx);
      byKey.set(t.importKey, tx);
      report.added++;
    } else if (pristine(prev) && FIELDS.some((k) => (prev[k] ?? null) !== (t[k] ?? null))) {
      for (const k of FIELDS) {
        if (t[k] === undefined) delete prev[k];
        else prev[k] = t[k];
      }
      prev.createdAt = prev.updatedAt = now;
      report.updated++;
    } else report.unchanged++;
  };

  for (const e of snap.entries) {
    const note = e.note.trim();
    const foreign = (currencyOf.get(e.accountUid) ?? snap.defaultCurrency) !== 'PLN' && e.defaultAmount > 0;
    upsert({
      type: e.income ? 'przychod' : 'wydatek',
      amount: foreign ? e.defaultAmount : e.amount,
      accountAmount: foreign ? e.amount : undefined,
      date: e.day,
      merchant: note.slice(0, 80),
      note: note.length > 80 ? note : undefined,
      categoryId: catMap.get(e.categoryUid) ?? null,
      accountId: accMap.get(e.accountUid) ?? null,
      importKey: `mm|${e.uid}`,
    });
    if (!catMap.get(e.categoryUid)) report.uncategorized++;
  }
  for (const t of snap.transfers) {
    const sameCurrency = (currencyOf.get(t.from) ?? 'PLN') === (currencyOf.get(t.to) ?? 'PLN');
    upsert({
      type: 'przelew',
      amount: t.fromAmount,
      toAmount: sameCurrency || Math.abs(t.toAmount - t.fromAmount) < 0.005 ? undefined : t.toAmount,
      date: t.day,
      merchant: t.note.trim().slice(0, 80) || 'Przelew',
      categoryId: null,
      accountId: accMap.get(t.from) ?? null,
      toAccountId: accMap.get(t.to) ?? null,
      importKey: `mm|${t.uid}`,
    });
  }
  for (const uid of snap.removedUids ?? []) {
    const prev = byKey.get(`mm|${uid}`);
    if (prev && pristine(prev)) {
      prev.deleted = true;
      prev.updatedAt = now;
      report.removed++;
    }
  }

  // Saldo = saldo z Money Managera (saldo początkowe wyliczane z różnicy).
  for (const a of snap.accounts) if (accMap.has(a.uid) && a.storedBalance !== null) setBalance(out, accMap.get(a.uid), a.storedBalance);

  // Pierwszy import do pustego dziennika: domyślne kategorie bez operacji chowamy, żeby lista była taka jak w Money Managerze.
  if (fresh && catMap.size) {
    const used = new Set([...liveTx(out).map((t) => t.categoryId), ...out.rules.map((r) => r.categoryId), ...out.recurring.map((r) => r.categoryId)]);
    for (const c of out.categories) {
      if (!c.mmUid && !c.archived && !used.has(c.id)) {
        c.archived = true;
        report.hiddenDefaults++;
      }
    }
  }
  out.updatedAt = now;
  return { fin: out, report };
}
