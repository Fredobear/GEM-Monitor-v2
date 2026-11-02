// Import kopii z aplikacji „Money Manager: finanse, przychody i wydatki” (Orange Dog), plik .mmbackup.
// Budowa pliku: (opcjonalny wypełniacz) + archiwum ZIP z bazą SQLite „MyFinance.db” i opcjonalnym „backup_meta”.
// Wszystko liczone lokalnie: własny czytnik ZIP (DecompressionStream) i własny czytnik SQLite, bez sieci.
// Na stronie finanse.html plik jest wklejany po finance-core.js (bez instrukcji import/export).
import { DEFAULT_CATEGORIES, accountCurrency, balances, convert, daysBetween, liveTx, nextColor, nextRecurringDate, round2, setBalance } from './finance-core.js';

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
const msOf = (s) => (s ? Date.parse(s) : NaN);

// Wbudowane kategorie Money Managera mają w bazie pustą nazwę (aplikacja wyświetla nazwę w języku telefonu).
// [nazwa po polsku, odpowiadająca kategoria domyślna dziennika]
const MM_DEFAULTS = {
  DefaultProducts: ['Produkty spożywcze', 'zakupy'],
  DefaultTransport: ['Transport', 'transport'],
  DefaultHealth: ['Zdrowie', 'zdrowie'],
  DefaultLeisure: ['Wypoczynek', 'rozrywka'],
  DefaultHome: ['Dom', 'mieszkanie'],
  DefaultFamily: ['Rodzina', null],
  DefaultCafe: ['Kawiarnia', 'jedzenie'],
  DefaultEducation: ['Edukacja', 'edukacja'],
  DefaultPresents: ['Prezenty', 'prezenty'],
  DefaultSport: ['Sport', null],
  DefaultClothes: ['Ubrania', 'ubrania'],
  DefaultCar: ['Samochód', 'transport'],
  DefaultBeauty: ['Uroda', 'zdrowie'],
  DefaultEntertainment: ['Rozrywka', 'rozrywka'],
  DefaultRestaurant: ['Restauracje', 'jedzenie'],
  DefaultBills: ['Rachunki', 'rachunki'],
  DefaultCommunication: ['Telefon i internet', 'subskrypcje'],
  DefaultTravel: ['Podróże', 'podroze'],
  DefaultPets: ['Zwierzęta', null],
  other_expense: ['Inne wydatki', 'inne'],
  DefaultSalary: ['Wynagrodzenie', 'wynagrodzenie'],
  DefaultPresent: ['Prezenty (otrzymane)', null],
  DefaultPercents: ['Odsetki', null],
  other_income: ['Inne przychody', 'inne_przychody'],
};
const mmCategoryName = (c) => String(c.title ?? '').trim() || MM_DEFAULTS[c.uid]?.[0] || String(c.uid).replace(/^Default/, '').replace(/([a-z])([A-Z])/g, '$1 $2') || 'Kategoria';

// Okresy stałych płatności Money Managera → częstotliwości dziennika.
const MM_PERIODS = { Week: 'tydzien', TwoWeeks: '2tyg', Month: 'miesiac', TwoMonths: '2mies', Quarter: 'kwartal', Year: 'rok' };

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
  const linkMap = (entity, other) => {
    const m = new Map();
    for (const l of links) if (String(l.entityType).toLowerCase() === entity && String(l.otherType).toLowerCase() === other) m.set(l.entityUid, [...(m.get(l.entityUid) ?? []), l.otherUid]);
    return m;
  };
  const first = (m, uid) => m.get(uid)?.[0] ?? null;
  const txAccount = linkMap('transaction', 'account');
  const txCategory = linkMap('transaction', 'category');
  const trFrom = linkMap('transfer', 'fromaccount');
  const trTo = linkMap('transfer', 'toaccount');
  const balance = new Map(db.all('account_balance').map((b) => [b.uid, cents(b.value)]));
  const defaultCurrency = db.all('syncable_settings').find((s) => s.uid === 'defaultCurrencyCode' && !flag(s.isRemoved))?.value || 'PLN';
  // Kursy z Money Managera (zapasowo, gdy brak kursu NBP): ile złotych za jednostkę waluty.
  const rates = {};
  for (const r of db.all('rates')) {
    const v = Number(r.value);
    if (!(v > 0)) continue;
    if (r.fromCurrencyCode === defaultCurrency && r.toCurrencyCode) rates[r.toCurrencyCode] = 1 / v;
    else if (r.toCurrencyCode === defaultCurrency && r.fromCurrencyCode) rates[r.fromCurrencyCode] = v;
  }
  const accounts = db.all('account').map((a) => ({
    uid: a.uid,
    title: a.title || 'Konto',
    color: argbToHex(a.color),
    currency: a.currencyCode || defaultCurrency,
    hidden: (a.isActive !== null && a.isActive !== undefined && Number(a.isActive) === 0) || flag(a.isArchived),
    removed: flag(a.isRemoved),
    excluded: flag(a.ignoreInBalance),
    position: Number(a.position) || 0,
    created: a.created ?? null,
    storedBalance: balance.get(a.uid) ?? null,
  }));
  const accCreated = new Map(accounts.map((a) => [a.uid, msOf(a.created)]));
  const txRows = db.all('transaction');
  const trRows = db.all('transfer');

  // Stałe płatności (tabela reminding, typ regularPayments). Daty już zapisanych terminów są w identyfikatorach operacji.
  const remPeriods = linkMap('reminding', 'regularpaymentperiod');
  const periodTx = linkMap('regularpaymentperiod', 'transaction');
  const remAccount = linkMap('reminding', 'account');
  const remCategory = linkMap('reminding', 'category');
  const recurring = [];
  let reminders = 0;
  for (const r of db.has('reminding') ? db.all('reminding') : []) {
    if (flag(r.isRemoved)) continue;
    if (r.remindingType !== 'regularPayments') {
      reminders++;
      continue;
    }
    const freq = MM_PERIODS[r.period];
    const type = { income: 'przychod', expense: 'wydatek' }[String(r.transactionType).toLowerCase()];
    const startDate = dayOf(r.startDate);
    if (!freq || !type || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      warnings.push(`Stała płatność „${r.title || 'bez nazwy'}” ma ustawienia, których dziennik nie obsługuje (${r.period ?? '?'}) – nie zostanie przeniesiona.`);
      continue;
    }
    const posted = (remPeriods.get(r.uid) ?? [])
      .flatMap((p) => periodTx.get(p) ?? [])
      .map((uid) => String(uid).match(/_(\d{4}-\d{2}-\d{2})$/)?.[1])
      .filter(Boolean)
      .sort();
    recurring.push({
      uid: r.uid,
      title: r.title || 'Stała płatność',
      type,
      amount: Math.abs(cents(r.amount) ?? 0),
      freq,
      startDate,
      anchorDay: Number(startDate.slice(8, 10)),
      endDate: r.endDate ? dayOf(r.endDate) : null,
      auto: flag(r.addAutomatically),
      paused: !flag(r.enabled),
      accountUid: first(remAccount, r.uid),
      categoryUid: first(remCategory, r.uid),
      lastPosted: posted.at(-1) ?? null,
    });
  }

  return {
    version,
    defaultCurrency,
    warnings,
    rates,
    accounts,
    categories: db.all('category').map((c) => ({ uid: c.uid, title: mmCategoryName(c), builtIn: !String(c.title ?? '').trim() && Boolean(MM_DEFAULTS[c.uid]), income: String(c.type).toLowerCase() === 'income', color: argbToHex(c.color), removed: flag(c.isRemoved), archived: flag(c.isArchived), limit: cents(c.limitAmount) || null, position: Number(c.position) || 0 })),
    // Operacja bez kategorii to korekta salda: saldo początkowe przy zakładaniu konta albo późniejsza zmiana salda.
    // Money Manager nie liczy ich do wydatków ani przychodów.
    entries: txRows
      .filter((t) => !flag(t.isRemoved))
      .map((t) => {
        const accountUid = first(txAccount, t.uid);
        const categoryUid = first(txCategory, t.uid);
        const correction = !categoryUid;
        return {
          uid: t.uid,
          income: String(t.type).toLowerCase() === 'income',
          day: dayOf(t.date),
          amount: Math.abs(cents(t.amountInAccountCurrency) ?? cents(t.amountInRealCurrency) ?? cents(t.amountInDefaultCurrency) ?? 0),
          defaultAmount: Math.abs(cents(t.amountInDefaultCurrency) ?? 0),
          note: String(t.comment ?? ''),
          accountUid,
          categoryUid,
          correction,
          opening: correction && Math.abs(msOf(t.created) - (accCreated.get(accountUid) ?? NaN)) < 60000,
        };
      }),
    transfers: trRows
      .filter((t) => !flag(t.isRemoved))
      .map((t) => ({ uid: t.uid, day: dayOf(t.date), fromAmount: Math.abs(cents(t.fromAmount) ?? 0), toAmount: Math.abs(cents(t.toAmount) ?? cents(t.fromAmount) ?? 0), note: String(t.comment ?? ''), from: first(trFrom, t.uid), to: first(trTo, t.uid) })),
    removedUids: [...txRows, ...trRows].filter((t) => flag(t.isRemoved)).map((t) => t.uid),
    recurring,
    reminders,
  };
}

// Rodzaj konta po nazwie i saldzie (karta kredytowa ma saldo ujemne).
export const guessAccountType = (title, stored) => {
  const t = keyName(title);
  if (/kredyt|credit/.test(t) || (/kart|card/.test(t) && (stored ?? 0) < 0)) return 'karta';
  if (/inwest|makler|broker|\bxtb\b|\bike\b|\bikze\b|\bppk\b|\bppe\b|\betf/.test(t)) return 'inwestycje';
  if (/gotowk|cash|portfel|wallet/.test(t)) return 'gotowka';
  if (/oszczed|saving|lokat|skarbonk/.test(t)) return 'oszczednosci';
  return 'bank';
};

// Ikona kategorii po nazwie (Money Manager zapisuje własne ikony, których tu nie ma). Służy też do podpowiedzi,
// która kategoria dziennika odpowiada kategorii z Money Managera (ta sama ikona = ta sama grupa).
const EMOJI_HINTS = [
  [/restaur|kawiar|kawa|na miesc|fast ?food|cafe|coffee|dining|lunch|obiad/, '🍽️'],
  [/spozyw|zakup|market|grocer|jedzen|zywnos|produkt|food/, '🛒'],
  [/paliw|benzyn|transport|samoch|\bauto|taxi|taksow|uber|bilet|komunik|\bcar\b|fuel/, '🚗'],
  [/czynsz|mieszk|najem|\brent|housing/, '🏠'],
  [/rachun|media|prad|\bgaz\b|woda|internet|\bbills?\b|utilit/, '💡'],
  [/telefon|abonam|subskr|netflix|spotify|phone|subscr/, '📱'],
  [/zdrow|lekarz|\bleki?\b|aptek|suplement|medic|health|pharm|urod|kosmet|fryzj|beauty/, '💊'],
  [/ubran|odziez|obuw|\bbuty|ciuch|cloth/, '👕'],
  [/rozryw|\bkino|hobby|\bgry\b|games|entertain|wypoczyn|leisure/, '🎬'],
  [/sport|silown|fitness|\bgym/, '🏋️'],
  [/podroz|wakac|urlop|wyjazd|hotel|travel|trip/, '✈️'],
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
const plainEmoji = (s) => String(s ?? '').replace(/️/g, '');
const hintEmoji = (title) => EMOJI_HINTS.find(([rx]) => rx.test(keyName(title)))?.[1] ?? null;
const guessEmoji = (title, income) => hintEmoji(title) ?? (income ? '💰' : '🏷️');

// Podobieństwo nazw kont: wspólne słowa (z tolerancją literówek), bez słów ogólnych jak „konto” czy „PLN”.
const STOP_WORDS = new Set(['konto', 'karta', 'rachunek', 'osobiste', 'glowne', 'debit', 'debetowa', 'debetowe', 'kredytowa', 'oszczednosciowe', 'inwestycyjne', 'pln', 'eur', 'usd', 'gbp', 'chf', 'moje', 'bank']);
const nameTokens = (s) => keyName(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // przestawione litery
    }
  }
  return d[a.length][b.length];
}
const similarWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= (Math.max(a.length, b.length) >= 7 ? 2 : 1));
export function accountSimilarity(mm, acc) {
  if ((mm.currency || 'PLN') !== (acc.currency || 'PLN')) return 0;
  const a = nameTokens(mm.name);
  const b = nameTokens(acc.name);
  let score;
  if (!a.length || !b.length) score = keyName(mm.name) === keyName(acc.name) ? 1 : 0;
  else score = a.filter((x) => b.some((y) => similarWord(x, y))).length / Math.min(a.length, b.length);
  const cardA = mm.type === 'karta';
  const cardB = acc.type === 'karta';
  return cardA === cardB ? score : score * 0.4;
}

// Plan importu: z którym kontem i kategorią połączyć dane z Money Managera. Użytkownik może każdą pozycję zmienić.
export function suggestMmMapping(snap, fin, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const info = fin.mmImport ?? {};
  const countBy = (list) => list.reduce((m, k) => (k ? m.set(k, (m.get(k) ?? 0) + 1) : m), new Map());
  const opsByAcc = countBy([...snap.entries.map((e) => e.accountUid), ...snap.transfers.flatMap((t) => [t.from, t.to])]);
  const opsByCat = countBy(snap.entries.filter((e) => !e.correction).map((e) => e.categoryUid));
  const exists = (id) => fin.accounts.some((a) => a.id === id);

  const accounts = snap.accounts
    .filter((a) => !a.removed || opsByAcc.has(a.uid))
    .sort((x, y) => x.position - y.position)
    .map((a) => {
      const prev = info.accountMap && a.uid in info.accountMap ? info.accountMap[a.uid] : fin.accounts.find((x) => x.mmUid === a.uid)?.id;
      const row = { uid: a.uid, name: a.title, currency: a.currency, balance: a.storedBalance, ops: opsByAcc.get(a.uid) ?? 0, type: guessAccountType(a.title, a.storedBalance), hidden: a.hidden || a.removed, choice: null, reason: '' };
      if (prev === null) Object.assign(row, { choice: 'skip', reason: 'pominięte przy poprzednim imporcie' });
      else if (prev && exists(prev)) Object.assign(row, { choice: prev, reason: 'połączone przy poprzednim imporcie' });
      return row;
    });
  const taken = new Set(accounts.map((r) => r.choice));
  const pairs = [];
  for (const row of accounts.filter((r) => !r.choice)) {
    for (const acc of fin.accounts) {
      if (acc.archived || acc.mmUid || taken.has(acc.id)) continue;
      const s = accountSimilarity(row, acc);
      if (s >= 0.5) pairs.push([s, row, acc]);
    }
  }
  pairs.sort((x, y) => y[0] - x[0]);
  for (const [, row, acc] of pairs) {
    if (row.choice || taken.has(acc.id)) continue;
    Object.assign(row, { choice: acc.id, reason: 'podobna nazwa' });
    taken.add(acc.id);
  }
  for (const row of accounts) if (!row.choice) Object.assign(row, { choice: 'new', reason: fin.accounts.length ? 'brak podobnego konta w dzienniku' : '' });

  const categories = [];
  for (const c of [...snap.categories].sort((x, y) => Number(x.income) - Number(y.income) || x.position - y.position)) {
    const ops = opsByCat.get(c.uid) ?? 0;
    if (!ops) continue;
    const kind = c.income ? 'przychod' : 'wydatek';
    const pool = fin.categories.filter((x) => x.kind === kind && !x.archived);
    const prev = info.categoryMap && c.uid in info.categoryMap ? info.categoryMap[c.uid] : fin.categories.find((x) => x.mmUid === c.uid)?.id;
    const emoji = hintEmoji(c.title);
    const byName = pool.find((x) => keyName(x.name) === keyName(c.title));
    const target = c.builtIn ? pool.find((x) => x.id === MM_DEFAULTS[c.uid]?.[1]) : null;
    const byHint = emoji ? pool.find((x) => plainEmoji(x.emoji) === plainEmoji(emoji)) : null;
    let choice;
    let reason;
    if (prev === null) [choice, reason] = ['none', 'jak przy poprzednim imporcie'];
    else if (prev && fin.categories.some((x) => x.id === prev)) [choice, reason] = [prev, 'połączone przy poprzednim imporcie'];
    else if (byName) [choice, reason] = [byName.id, 'ta sama nazwa'];
    else if (target) [choice, reason] = [target.id, 'odpowiednik kategorii z Money Managera'];
    else if (byHint) [choice, reason] = [byHint.id, 'podobna kategoria'];
    else if (ops >= 3) [choice, reason] = ['new', `${ops} operacji – proponuję nową kategorię`];
    else [choice, reason] = ['none', 'mało operacji – trafią do „Do przypisania”'];
    categories.push({ uid: c.uid, name: c.title, kind, ops, color: c.color, limit: c.limit, choice, reason });
  }

  const recurring = snap.recurring.map((r) => {
    let d = r.startDate;
    let guard = 0;
    // Z automatem: kolejne terminy po ostatnim zapisanym w Money Managerze. Bez automatu: od dziś (bez zaległych przypomnień).
    const after = r.auto && r.lastPosted ? r.lastPosted : null;
    while (guard++ < 600 && (after ? d <= after : d < today)) d = nextRecurringDate(d, r.freq, r.anchorDay);
    return { ...r, nextDate: d, include: !fin.recurring?.some((x) => x.mmUid === r.uid) };
  });

  return { accounts, categories, recurring, corrections: snap.entries.filter((e) => e.correction).length, setBalances: true };
}

// Scala kopię z dziennikiem według planu (suggestMmMapping, zmienionego przez użytkownika).
// Ponowny import tej samej albo nowszej kopii nie dubluje operacji: dodaje nowe, aktualizuje zmienione w Money Managerze
// i usuwa usunięte tam (o ile nie zmieniono ich tutaj). Operacje, które już są w połączonym koncie (ta sama kwota,
// data ±1 dzień), są pomijane jako duplikaty.
export function mmToFinance(snap, fin, { newId, now = Date.now(), plan = null, market = null, today } = {}) {
  plan ??= suggestMmMapping(snap, fin, { today });
  const out = JSON.parse(JSON.stringify(fin));
  out.recurring ??= [];
  const info = { createdAccounts: [], createdCategories: [], linkedBalances: {}, accountMap: {}, categoryMap: {}, ...(out.mmImport ?? {}) };
  const report = { added: 0, updated: 0, unchanged: 0, removed: 0, duplicates: 0, corrections: 0, uncategorized: 0, accounts: 0, categories: 0, recurring: 0, skippedAccounts: 0 };
  const balanceBefore = balances(out);
  const toPln = (amount, cur, date) => (cur === 'PLN' ? amount : convert(market, amount, cur, 'PLN', date) ?? (snap.rates?.[cur] ? round2(amount * snap.rates[cur]) : amount));

  const accMap = new Map();
  const linked = new Set();
  for (const row of plan.accounts) {
    const a = snap.accounts.find((x) => x.uid === row.uid);
    if (!a) continue;
    if (row.choice === 'skip') {
      accMap.set(row.uid, null);
      info.accountMap[row.uid] = null;
      report.skippedAccounts++;
      continue;
    }
    let acc = row.choice !== 'new' ? out.accounts.find((x) => x.id === row.choice) : out.accounts.find((x) => x.mmUid === a.uid && x.mmCreated);
    if (!acc) {
      acc = { id: newId(), name: a.title, type: row.type ?? guessAccountType(a.title, a.storedBalance), openingBalance: 0, openingDate: '1970-01-01', cards: [], mmUid: a.uid, mmCreated: true };
      if (a.currency !== 'PLN') acc.currency = a.currency;
      if (a.color) acc.color = a.color;
      if (a.excluded) acc.excludeFromTotal = true;
      if (a.hidden || a.removed) acc.archived = true;
      out.accounts.push(acc);
      info.createdAccounts.push(acc.id);
      report.accounts++;
    } else if (!acc.mmCreated) {
      if (!(acc.id in info.linkedBalances)) info.linkedBalances[acc.id] = { openingBalance: acc.openingBalance ?? 0, openingDate: acc.openingDate ?? '1970-01-01' };
      acc.mmUid = a.uid;
      linked.add(acc.id);
    }
    accMap.set(row.uid, acc.id);
    info.accountMap[row.uid] = acc.id;
  }
  const accountOf = (uid) => (uid && accMap.has(uid) ? accMap.get(uid) : null);
  const curOf = (id) => accountCurrency(out, id);

  const catMap = new Map();
  for (const row of plan.categories) {
    if (row.choice === 'none') {
      catMap.set(row.uid, null);
      info.categoryMap[row.uid] = null;
      continue;
    }
    let cat = row.choice !== 'new' ? out.categories.find((x) => x.id === row.choice) : out.categories.find((x) => x.mmUid === row.uid && x.mmCreated);
    if (!cat) {
      cat = { id: newId(), name: row.name, emoji: guessEmoji(row.name, row.kind === 'przychod'), kind: row.kind, color: row.color ?? nextColor(out.categories.length), budget: row.limit ?? null, mmUid: row.uid, mmCreated: true };
      out.categories.push(cat);
      info.createdCategories.push(cat.id);
      report.categories++;
    }
    catMap.set(row.uid, cat.id);
    info.categoryMap[row.uid] = cat.id;
  }

  // Kandydaci na duplikaty: operacje wpisane wcześniej ręcznie (albo z innego źródła) na połączonych kontach.
  const pool = new Map();
  for (const t of liveTx(out)) {
    if (!linked.has(t.accountId) || t.source === 'mm' || t.type === 'korekta') continue;
    if (!pool.has(t.accountId)) pool.set(t.accountId, []);
    pool.get(t.accountId).push(t);
  }
  const takeDuplicate = (t) => {
    const list = pool.get(t.accountId);
    const i = list ? list.findIndex((o) => o.type === t.type && Math.abs((o.accountAmount ?? o.amount) - (t.accountAmount ?? t.amount)) < 0.005 && Math.abs(daysBetween(o.date, t.date)) <= 1 && (t.type !== 'przelew' || o.toAccountId === t.toAccountId)) : -1;
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  };

  const byKey = new Map(out.txs.filter((t) => t.importKey?.startsWith('mm|')).map((t) => [t.importKey, t]));
  const FIELDS = ['type', 'amount', 'accountAmount', 'toAmount', 'date', 'merchant', 'note', 'categoryId', 'accountId', 'toAccountId'];
  const pristine = (t) => !t.deleted && t.updatedAt === t.createdAt;
  const upsert = (t) => {
    const prev = byKey.get(t.importKey);
    if (!prev) {
      if (takeDuplicate(t)) {
        report.duplicates++;
        return;
      }
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
    if (accMap.has(e.accountUid) && accMap.get(e.accountUid) === null) continue; // konto pominięte
    const accountId = accountOf(e.accountUid);
    const cur = accountId ? curOf(accountId) : 'PLN';
    const pln = cur === 'PLN' ? e.amount : snap.defaultCurrency === 'PLN' && e.defaultAmount > 0 ? e.defaultAmount : toPln(e.amount, cur, e.day);
    const note = e.note.trim();
    if (e.correction) {
      const sign = e.income ? 1 : -1;
      upsert({ type: 'korekta', amount: sign * pln, accountAmount: cur === 'PLN' ? undefined : sign * e.amount, date: e.day, merchant: note.slice(0, 80) || (e.opening ? 'Saldo początkowe' : 'Korekta salda'), note: note.length > 80 ? note : undefined, categoryId: null, accountId, importKey: `mm|${e.uid}` });
      report.corrections++;
      continue;
    }
    const categoryId = catMap.get(e.categoryUid) ?? null;
    upsert({ type: e.income ? 'przychod' : 'wydatek', amount: pln, accountAmount: cur === 'PLN' ? undefined : e.amount, date: e.day, merchant: note.slice(0, 80), note: note.length > 80 ? note : undefined, categoryId, accountId, importKey: `mm|${e.uid}` });
    if (!categoryId) report.uncategorized++;
  }
  for (const t of snap.transfers) {
    const from = accountOf(t.from);
    const to = accountOf(t.to);
    if (!from && !to) continue;
    const fromCur = from ? curOf(from) : 'PLN';
    const toCur = to ? curOf(to) : fromCur;
    const pln = fromCur === 'PLN' ? t.fromAmount : toCur === 'PLN' ? t.toAmount : toPln(t.fromAmount, fromCur, t.day);
    upsert({
      type: 'przelew',
      amount: pln,
      accountAmount: fromCur === 'PLN' ? undefined : t.fromAmount,
      toAmount: fromCur === 'PLN' && toCur === 'PLN' ? undefined : t.toAmount,
      date: t.day,
      merchant: t.note.trim().slice(0, 80) || 'Przelew',
      categoryId: null,
      accountId: from,
      toAccountId: to,
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

  for (const r of plan.recurring ?? []) {
    if (!r.include || out.recurring.some((x) => x.mmUid === r.uid)) continue;
    if (r.accountUid && accMap.has(r.accountUid) && accMap.get(r.accountUid) === null) continue;
    const rec = { id: newId(), title: r.title, type: r.type, amount: r.amount, accountId: accountOf(r.accountUid), toAccountId: null, categoryId: catMap.get(r.categoryUid) ?? null, freq: r.freq, nextDate: r.nextDate, anchorDay: r.anchorDay, auto: r.auto, mmUid: r.uid };
    if (r.endDate) rec.endDate = r.endDate;
    if (r.paused) rec.paused = true;
    out.recurring.push(rec);
    report.recurring++;
  }

  // Salda: nowe konta jak w Money Managerze; połączone – jak w Money Managerze albo bez zmian (wybór w planie).
  for (const a of snap.accounts) {
    const id = accountOf(a.uid);
    if (!id) continue;
    const isNew = info.createdAccounts.includes(id);
    if ((isNew || plan.setBalances) && a.storedBalance !== null) setBalance(out, id, a.storedBalance);
    else if (!isNew && id in balanceBefore) setBalance(out, id, balanceBefore[id]);
  }
  out.mmImport = { ...info, at: now };
  out.updatedAt = now;
  return { fin: out, report };
}

// Cofa import z Money Managera: usuwa jego operacje i stałe pozycje oraz konta i kategorie, które powstały przy imporcie
// (o ile nie mają innych operacji). Konta połączone z istniejącymi wracają do sald sprzed importu.
export function removeMmImport(fin) {
  const out = JSON.parse(JSON.stringify(fin));
  const info = out.mmImport ?? {};
  const legacy = !out.mmImport; // import ze starszej wersji dziennika: każde konto z mmUid powstało przy imporcie
  const isMm = (t) => t.source === 'mm' || String(t.importKey ?? '').startsWith('mm|');
  const report = { txs: out.txs.filter((t) => isMm(t) && !t.deleted).length, accounts: 0, categories: 0, recurring: out.recurring?.filter((r) => r.mmUid).length ?? 0 };
  out.txs = out.txs.filter((t) => !isMm(t));
  out.recurring = (out.recurring ?? []).filter((r) => !r.mmUid);
  const usedAcc = (id) => out.txs.some((t) => !t.deleted && (t.accountId === id || t.toAccountId === id)) || out.recurring.some((r) => r.accountId === id || r.toAccountId === id);
  out.accounts = out.accounts.filter((a) => {
    if (!a.mmUid && !info.createdAccounts?.includes(a.id)) return true;
    if ((a.mmCreated || legacy || info.createdAccounts?.includes(a.id)) && !usedAcc(a.id)) {
      report.accounts++;
      return false;
    }
    delete a.mmUid;
    delete a.mmCreated;
    return true;
  });
  for (const [id, opening] of Object.entries(info.linkedBalances ?? {})) Object.assign(out.accounts.find((a) => a.id === id) ?? {}, opening);
  const defaults = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const usedCat = (id) => out.txs.some((t) => !t.deleted && t.categoryId === id) || out.rules.some((r) => r.categoryId === id) || out.recurring.some((r) => r.categoryId === id);
  out.categories = out.categories.filter((c) => {
    if (!c.mmUid && !info.createdCategories?.includes(c.id)) return true;
    if ((c.mmCreated || info.createdCategories?.includes(c.id) || (legacy && !defaults.has(c.id))) && !usedCat(c.id)) {
      report.categories++;
      return false;
    }
    delete c.mmUid;
    delete c.mmCreated;
    return true;
  });
  // Starsza wersja importu chowała nieużywane domyślne kategorie – przywracamy je.
  if (legacy) for (const c of out.categories) if (defaults.has(c.id)) delete c.archived;
  const kept = new Set(out.txs.map((t) => t.id));
  out.docs = (out.docs ?? []).map((d) => (d.txId && !kept.has(d.txId) ? { ...d, txId: null } : d));
  delete out.mmImport;
  delete out.mmRepaired;
  return { fin: out, report };
}

// Naprawa danych zaimportowanych starszą wersją dziennika: operacje bez kategorii z Money Managera to korekty salda
// (nie wydatki ani przychody), a wbudowane kategorie dostały nazwę „Kategoria”.
export function repairLegacyMmImport(fin) {
  if (fin.mmImport || fin.mmRepaired || !fin.txs.some((t) => t.source === 'mm')) return { fin, corrections: 0, renamed: 0 };
  const out = JSON.parse(JSON.stringify(fin));
  let corrections = 0;
  let renamed = 0;
  for (const t of out.txs) {
    if (t.source !== 'mm' || t.deleted || t.categoryId || (t.type !== 'wydatek' && t.type !== 'przychod')) continue;
    const sign = t.type === 'przychod' ? 1 : -1;
    t.type = 'korekta';
    t.amount = sign * Math.abs(t.amount);
    if (t.accountAmount !== undefined) t.accountAmount = sign * Math.abs(t.accountAmount);
    if (!t.merchant) t.merchant = 'Korekta salda';
    corrections++;
  }
  for (const c of out.categories) {
    if (!c.mmUid || !MM_DEFAULTS[c.mmUid] || c.name !== 'Kategoria') continue;
    c.name = MM_DEFAULTS[c.mmUid][0];
    c.emoji = guessEmoji(c.name, c.kind === 'przychod');
    renamed++;
  }
  out.mmRepaired = true;
  return { fin: out, corrections, renamed };
}
