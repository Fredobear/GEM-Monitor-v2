// Rdzeń dziennika finansowego: konta, kategorie, transakcje, import (Apple Pay ze Skrótów, wyciągi CSV) i raporty.
// Działa wyłącznie lokalnie – bez DOM, bez sieci. Plik jest wklejany do strony finanse.html i testowany w Node.

// Korekta salda: zmiana salda konta (saldo początkowe, wycena konta inwestycyjnego, wyrównanie do banku).
// Kwota korekty ma znak (+/−) i nie liczy się do wydatków ani przychodów.
export const FIN_TYPES = { wydatek: 'Wydatek', przychod: 'Przychód', przelew: 'Przelew', korekta: 'Korekta salda' };
export const ACCOUNT_TYPES = { bank: 'Konto bankowe', karta: 'Karta kredytowa', gotowka: 'Gotówka', oszczednosci: 'Oszczędności', inwestycje: 'Konto inwestycyjne', inne: 'Inne' };
export const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];
export const isFlow = (t) => t.type === 'wydatek' || t.type === 'przychod';
export const SKIP_CATEGORY = 'pomiń';
const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea', '#ca8a04', '#475569', '#be123c', '#059669'];

export const DEFAULT_CATEGORIES = [
  ['zakupy', '🛒', 'Zakupy spożywcze', 'wydatek'],
  ['jedzenie', '🍽️', 'Restauracje i kawiarnie', 'wydatek'],
  ['mieszkanie', '🏠', 'Mieszkanie', 'wydatek'],
  ['rachunki', '💡', 'Rachunki i media', 'wydatek'],
  ['transport', '🚗', 'Transport i paliwo', 'wydatek'],
  ['zdrowie', '💊', 'Zdrowie i uroda', 'wydatek'],
  ['ubrania', '👕', 'Ubrania i obuwie', 'wydatek'],
  ['rozrywka', '🎬', 'Rozrywka i hobby', 'wydatek'],
  ['subskrypcje', '📱', 'Subskrypcje i telefon', 'wydatek'],
  ['podroze', '✈️', 'Podróże', 'wydatek'],
  ['prezenty', '🎁', 'Prezenty', 'wydatek'],
  ['edukacja', '📚', 'Edukacja', 'wydatek'],
  ['dom', '🛋️', 'Dom i wyposażenie', 'wydatek'],
  ['inne', '🧾', 'Inne wydatki', 'wydatek'],
  ['wynagrodzenie', '💼', 'Wynagrodzenie', 'przychod'],
  ['inne_przychody', '💰', 'Inne przychody', 'przychod'],
].map(([id, emoji, name, kind], i) => ({ id, emoji, name, kind, color: PALETTE[i % PALETTE.length], budget: null }));

export const emptyFinance = () => ({ version: 1, accounts: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), txs: [], rules: [], recurring: [], updatedAt: 0 });
export const ACCOUNT_ICONS = { bank: '🏦', karta: '💳', gotowka: '💵', oszczednosci: '🐷', inwestycje: '📈', inne: '👛' };
export const isCard = (a) => a?.type === 'karta';
export const nextColor = (n) => PALETTE[n % PALETTE.length];
export const liveTx = (fin) => fin.txs.filter((t) => !t.deleted);
const pad = (n) => String(n).padStart(2, '0');
// Porównania bez wielkości liter, emoji i polskich znaków (banki często je usuwają: „ŻABKA” → „ZABKA”).
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

// Kwoty w formatach polskich i angielskich: „45,20 zł”, „-1 234,56”, „1.234,56”, „PLN 45.20”, „45,20-”.
export function parseAmount(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw ?? '').replace(/ | /g, ' ').trim();
  if (!s) return NaN;
  const negative = /^[-−–]/.test(s) || /[-−–]$/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/[^\d,.]/g, '');
  if (!/\d/.test(s)) return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma > -1) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length !== 3 ? parts.join('.') : parts.join('');
  } else if (lastDot > -1) {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join('');
  }
  const v = Number(s);
  return Number.isFinite(v) ? (negative ? -v : v) : NaN;
}

const MONTH_PREFIX = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTH_PREFIX_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function monthFromWord(word) {
  const w = word.toLowerCase();
  let i = MONTH_PREFIX.findIndex((p) => w.startsWith(p));
  if (i < 0 && w.startsWith('maj')) i = 4;
  if (i < 0) i = MONTH_PREFIX_EN.findIndex((p) => w.startsWith(p));
  return i < 0 ? null : i + 1;
}
function timeFrom(s) {
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
  if (m[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${pad(h)}:${m[2]}`;
}

// Daty: ISO 8601, „02.11.2026”, „2 lis 2026 o 14:33”, „Nov 2, 2026 at 2:33 PM”.
export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: timeFrom(s.slice(10)) };
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return { date: `${m[3]}-${pad(m[2])}-${pad(m[1])}`, time: timeFrom(s.slice(m[0].length)) };
  m = s.match(/^(\d{1,2})\s+([\p{L}]+)\.?\s+(\d{4})/u);
  if (m && monthFromWord(m[2])) return { date: `${m[3]}-${pad(monthFromWord(m[2]))}-${pad(m[1])}`, time: timeFrom(s.slice(m[0].length)) };
  m = s.match(/^([\p{L}]+)\.?\s+(\d{1,2}),?\s+(\d{4})/u);
  if (m && monthFromWord(m[1])) return { date: `${m[3]}-${pad(monthFromWord(m[1]))}-${pad(m[2])}`, time: timeFrom(s.slice(m[0].length)) };
  return null;
}

export function findCategory(categories, name) {
  const n = norm(name);
  if (!n) return null;
  return categories.find((c) => !c.archived && (norm(c.name) === n || c.id === n)) ?? null;
}

export function applyRules(text, rules) {
  const s = norm(text);
  for (const r of rules ?? []) if (r.pattern && s.includes(norm(r.pattern))) return r.categoryId;
  return null;
}

// Konto przypisane do karty z Apple Pay (pole „Karty Apple Pay” w ustawieniach konta).
export function accountForCard(accounts, card) {
  const c = norm(card);
  if (!c) return null;
  return accounts.find((a) => !a.archived && (a.cards ?? []).some((x) => norm(x) && (c.includes(norm(x)) || norm(x).includes(c))))?.id ?? null;
}

// Plik zapisywany przez Skrót iOS: jeden wiersz na płatność, pola: data;kwota;sprzedawca;kategoria;karta.
// Automatyzacja Apple Pay zapisuje płatność dwuetapowo: najpierw od razu wiersz bez kategorii (płatność nie przepadnie,
// nawet gdy okno z listą się nie pokaże albo iOS przerwie skrót), a po wyborze z listy – drugi wiersz z kategorią.
// Wiersze tej samej płatności łączymy: ta sama kwota, sprzedawca i karta, czas do 15 minut różnicy.
const AP_PAIR_MINUTES = 15;
const apMinutes = (t) => Date.parse(`${t.date}T${t.time ?? '12:00'}:00Z`) / 60000;
export const isSameApplePay = (a, b) =>
  Math.abs(a.amount - b.amount) < 0.005 && norm(a.merchant) === norm(b.merchant) && norm(a.card ?? '') === norm(b.card ?? '') && Math.abs(apMinutes(a) - apMinutes(b)) <= AP_PAIR_MINUTES;

export function parseShortcutLog(text, fin) {
  const rows = [];
  const errors = [];
  let lines = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    lines++;
    const sep = line.includes(';') ? ';' : line.includes('|') ? '|' : '\t';
    const f = line.split(sep).map((x) => x.trim());
    if (f.length < 3) return errors.push(`Wiersz ${i + 1}: za mało pól („${line.slice(0, 60)}”).`);
    const when = parseDate(f[0]);
    const amount = parseAmount(f[1]);
    if (!when) return errors.push(`Wiersz ${i + 1}: nie rozpoznano daty („${f[0]}”) – w akcji Tekst ustaw format daty ISO 8601.`);
    if (!Number.isFinite(amount) || amount === 0) return errors.push(`Wiersz ${i + 1}: brak kwoty („${f[1]}”) – bank tej karty nie przekazał kwoty do Portfela albo w akcji Tekst brakuje zmiennej Kwota.`);
    rows.push({ amount: Math.abs(amount), date: when.date, time: when.time, merchant: f[2] || 'Apple Pay', categoryName: f[3] ?? '', card: f.slice(4).join(' ').trim() });
  });
  // Łączenie par z jednego pliku. Wiersz z pustą kategorią to zawsze nowa płatność (pierwszy zapis). Wiersz z wyborem
  // z listy (kategoria, „Później” albo „Pomiń”) uzupełnia najbliższy wcześniejszy, jeszcze niepołączony pierwszy zapis
  // tej samej płatności; bez pary jest samodzielną płatnością (format z poprzedniej wersji instrukcji).
  const entries = [];
  for (const r of rows) {
    if (!norm(r.categoryName)) {
      entries.push(r);
      continue;
    }
    const partner = [...entries].reverse().find((e) => !e.paired && !e.standalone && !norm(e.categoryName) && isSameApplePay(e, r));
    if (partner) {
      partner.categoryName = r.categoryName;
      partner.paired = true;
    } else entries.push({ ...r, standalone: true });
  }
  const txs = [];
  for (const e of entries) {
    // „Pomiń” z listy: płatność nie trafi do dziennika (a wczytana wcześniej bez kategorii zostanie usunięta).
    const skip = norm(e.categoryName) === norm(SKIP_CATEGORY);
    const category = findCategory(fin.categories, e.categoryName);
    const ruleCat = category ? null : applyRules(e.merchant, fin.rules);
    txs.push({
      type: 'wydatek',
      amount: e.amount,
      date: e.date,
      time: e.time,
      merchant: e.merchant,
      categoryId: category?.id ?? ruleCat,
      catAuto: ruleCat ? true : undefined,
      accountId: accountForCard(fin.accounts, e.card),
      card: e.card || undefined,
      source: 'applepay',
      importKey: `ap|${e.date}|${e.time ?? ''}|${e.amount.toFixed(2)}|${norm(e.merchant)}`,
      apSkip: skip || undefined,
      apCategory: category ? true : undefined, // kategoria wybrana na liście w Skrótach
    });
  }
  return { txs, errors, lines };
}

// Plik CSV z banku: wykrywanie separatora, cudzysłowy, znaki nowej linii w polach.
export function parseCsv(text) {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n');
  const count = (ch) => sample.split(ch).length;
  const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return { rows, delimiter: delim };
}

const HEADER_HINTS = {
  date: [/data\s+(operacji|transakcji)/i, /^data$/i, /data\s+ksi[eę]gowania/i, /data/i, /date/i],
  amount: [/^kwota$/i, /kwota\s+(operacji|transakcji)/i, /kwota/i, /amount/i, /warto[sś][cć]/i],
  description: [/opis\s+operacji/i, /tytu[lł]/i, /opis/i, /szczeg[oó][lł]y/i, /description/i, /title/i],
  counterparty: [/kontrahent/i, /odbiorca|nadawca/i, /nazwa\s+(odbiorcy|nadawcy)/i, /merchant|payee/i, /dane\s+kontrahenta/i],
};

// Zgaduje wiersz nagłówka i kolumny daty, kwoty, opisu i kontrahenta (formaty polskich banków się różnią).
export function guessMapping(rows) {
  const pick = (header, hints, taken) => {
    for (const rx of hints) {
      const i = header.findIndex((h, k) => !taken.includes(k) && rx.test(h) && !/saldo|balance/i.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const header = rows[r];
    const date = pick(header, HEADER_HINTS.date, []);
    const amount = pick(header, HEADER_HINTS.amount, [date]);
    if (date >= 0 && amount >= 0) {
      const description = pick(header, HEADER_HINTS.description, [date, amount]);
      const counterparty = pick(header, HEADER_HINTS.counterparty, [date, amount, description]);
      return { headerRow: r, date, amount, description, counterparty };
    }
  }
  return { headerRow: -1, date: 0, amount: 1, description: 2, counterparty: -1 };
}

export function csvToTxs(rows, mapping, { accountId, fin }) {
  const txs = [];
  const errors = [];
  for (let r = mapping.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const when = parseDate(row[mapping.date]);
    const amount = parseAmount(row[mapping.amount]);
    if (!when || !Number.isFinite(amount) || amount === 0) {
      if (row.filter(Boolean).length > 2) errors.push(`Wiersz ${r + 1}: pominięty (brak daty lub kwoty).`);
      continue;
    }
    const description = mapping.description >= 0 ? row[mapping.description] ?? '' : '';
    const counterparty = mapping.counterparty >= 0 ? row[mapping.counterparty] ?? '' : '';
    const merchant = (counterparty || description).replace(/\s+/g, ' ').trim().slice(0, 80) || 'Operacja';
    txs.push({
      type: amount < 0 ? 'wydatek' : 'przychod',
      amount: Math.abs(amount),
      date: when.date,
      time: when.time,
      merchant,
      note: description && description !== merchant ? description.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined,
      categoryId: applyRules(`${counterparty} ${description}`, fin.rules),
      accountId,
      source: 'csv',
      importKey: `csv|${accountId ?? ''}|${when.date}|${amount.toFixed(2)}|${norm(`${counterparty} ${description}`).slice(0, 60)}`,
    });
  }
  return { txs, errors };
}

// Ta sama płatność z dwóch źródeł: Apple Pay (od razu) i wyciąg z banku (z opóźnieniem księgowania).
// Kryteria: ta sama kwota, daty różnią się najwyżej o 3 dni, pierwsze słowo sprzedawcy z Apple Pay jest w opisie z banku.
export function isSamePayment(a, b) {
  if (a.type !== b.type || Math.abs(a.amount - b.amount) > 0.005) return false;
  const days = Math.abs(Date.parse(`${a.date}T00:00:00Z`) - Date.parse(`${b.date}T00:00:00Z`)) / 86400000;
  if (days > 3) return false;
  const [ap, bank] = a.source === 'applepay' ? [a, b] : [b, a];
  const token = norm(rulePatternFor(ap.merchant));
  return token.length >= 3 && norm(`${bank.merchant ?? ''} ${bank.note ?? ''}`).includes(token);
}

// Dodaje zaimportowane wpisy, pomijając te, które już są (ten sam klucz importu albo ta sama płatność z innego źródła).
export function mergeImported(fin, txs, { now = Date.now(), newId } = {}) {
  const live = liveTx(fin);
  const keys = new Set(live.filter((t) => t.importKey).map((t) => t.importKey));
  const fresh = [];
  let crossSource = 0;
  let updated = 0;
  let removed = 0;
  let duplicates = 0;
  const changed = new Map();
  // Kategoria albo „Pomiń” z listy w Skrótach dla płatności wczytanej wcześniej bez kategorii (albo z kategorią z reguły).
  // Kategorii wybranej ręcznie w aplikacji nie zmieniamy.
  const applyChoice = (prev, t) => {
    const cur = changed.get(prev.id) ?? prev;
    if (cur.deleted || (cur.categoryId && !cur.catAuto)) return false;
    if (t.apSkip) {
      changed.set(prev.id, { ...cur, deleted: true, updatedAt: now });
      removed++;
      return true;
    }
    if (!t.apCategory || !t.categoryId || t.categoryId === cur.categoryId) return false;
    changed.set(prev.id, { ...cur, categoryId: t.categoryId, catAuto: undefined, updatedAt: now });
    updated++;
    return true;
  };
  for (const t of txs) {
    if (keys.has(t.importKey)) {
      const prev = t.source === 'applepay' && (t.apCategory || t.apSkip) ? live.find((o) => o.importKey === t.importKey) : null;
      if (!prev || !applyChoice(prev, t)) duplicates++;
      continue;
    }
    if (t.source === 'applepay' && (t.apCategory || t.apSkip)) {
      const prev = live.find((o) => o.source === 'applepay' && isSameApplePay(o, t));
      if (prev) {
        if (!applyChoice(prev, t)) duplicates++;
        continue;
      }
      if (t.apSkip) continue;
    }
    const other = t.source === 'csv' ? 'applepay' : t.source === 'applepay' ? 'csv' : null;
    const twin = other && live.find((o) => o.source === other && isSamePayment(o, t));
    if (twin) {
      crossSource++;
      if (!twin.accountId && t.accountId) twin.accountId = t.accountId;
      continue;
    }
    keys.add(t.importKey);
    const { apSkip, apCategory, ...clean } = t;
    fresh.push({ ...clean, id: newId ? newId() : `${now}-${fresh.length}`, createdAt: now, updatedAt: now });
  }
  const txsOut = fin.txs.map((x) => changed.get(x.id) ?? x);
  return { fin: { ...fin, txs: [...txsOut, ...fresh], updatedAt: now }, added: fresh.length, skipped: duplicates + crossSource, crossSource, updated, removed };
}

export function validateFinTx(t, fin) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date ?? '')) errors.push('Podaj datę.');
  if (!FIN_TYPES[t.type]) errors.push('Wybierz typ.');
  if (t.type === 'korekta') {
    if (!Number.isFinite(t.amount) || Math.abs(t.amount) < 0.005) errors.push('Podaj kwotę korekty (ze znakiem minus, gdy saldo maleje).');
    if (!t.accountId) errors.push('Wybierz konto.');
    return errors;
  }
  if (!(t.amount > 0)) errors.push('Podaj kwotę większą od zera.');
  if (fin.accounts.length && !t.accountId) errors.push('Wybierz konto.');
  if (t.type === 'przelew' && (!t.toAccountId || t.toAccountId === t.accountId)) errors.push('Przelew wymaga dwóch różnych kont.');
  return errors;
}

// Saldo każdego konta: saldo początkowe + operacje od daty salda początkowego.
// Dla kont w innej walucie liczy kwotę w walucie konta (accountAmount, a przy przelewie toAmount).
export function balances(fin, upTo = '9999-12-31') {
  const out = Object.fromEntries(fin.accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
  const start = Object.fromEntries(fin.accounts.map((a) => [a.id, a.openingDate ?? '0000-00-00']));
  for (const t of liveTx(fin)) {
    if (t.date > upTo) continue;
    if (t.accountId in out && t.date >= start[t.accountId]) {
      const v = t.accountAmount ?? t.amount;
      if (t.type === 'przychod' || t.type === 'korekta') out[t.accountId] += v; // korekta ma kwotę ze znakiem
      else out[t.accountId] -= v;
    }
    if (t.type === 'przelew' && t.toAccountId in out && t.date >= start[t.toAccountId]) out[t.toAccountId] += t.toAmount ?? t.amount;
  }
  return out;
}

// Ustawia bieżące saldo konta (pole „Saldo obecne” albo „Zadłużenie”). Od tej chwili każda operacja na koncie,
// także dopisana z datą wsteczną, zmienia saldo – tak jak w aplikacji Money Manager.
export function setBalance(fin, accountId, target) {
  const a = fin.accounts.find((x) => x.id === accountId);
  if (!a) return fin;
  a.openingBalance = 0;
  a.openingDate = '1970-01-01';
  a.openingBalance = Math.round((target - balances(fin)[accountId]) * 100) / 100;
  return fin;
}

export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
}
export const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

// Podsumowanie okresu: przychody, wydatki, bilans, stopa oszczędności, kategorie, dni, miesiące, sprzedawcy.
export function summarize(fin, from, to, { accountId = null } = {}) {
  const txs = liveTx(fin).filter((t) => isFlow(t) && t.date >= from && t.date <= to && (!accountId || t.accountId === accountId));
  const byCat = new Map();
  const byDay = new Map();
  const byMonth = new Map();
  const merchants = new Map();
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    const month = t.date.slice(0, 7);
    const m = byMonth.get(month) ?? { month, income: 0, expense: 0 };
    if (t.type === 'przychod') {
      income += t.amount;
      m.income += t.amount;
    } else {
      expense += t.amount;
      m.expense += t.amount;
      byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount);
      const key = norm(t.merchant) || '—';
      const mm = merchants.get(key) ?? { name: t.merchant || '—', amount: 0, count: 0 };
      mm.amount += t.amount;
      mm.count++;
      merchants.set(key, mm);
    }
    byMonth.set(month, m);
    const ck = `${t.type}|${t.categoryId ?? ''}`;
    byCat.set(ck, (byCat.get(ck) ?? 0) + t.amount);
  }
  const catInfo = (id) => fin.categories.find((c) => c.id === id) ?? { id: null, name: 'Do przypisania', emoji: '❓', color: '#94a3b8' };
  const categories = (kind) =>
    [...byCat]
      .filter(([k]) => k.startsWith(`${kind}|`))
      .map(([k, amount]) => {
        const id = k.split('|')[1] || null;
        const c = catInfo(id);
        return { id, name: c.name, emoji: c.emoji, color: c.color, amount, share: (kind === 'wydatek' ? expense : income) ? amount / (kind === 'wydatek' ? expense : income) : 0, budget: c.budget ?? null };
      })
      .sort((a, b) => b.amount - a.amount);
  return {
    from,
    to,
    count: txs.length,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? (income - expense) / income : null,
    expenseByCategory: categories('wydatek'),
    incomeByCategory: categories('przychod'),
    byDay: [...byDay].sort(),
    byMonth: [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    topMerchants: [...merchants.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
    uncategorized: txs.filter((t) => !t.categoryId).length,
  };
}

// Porównanie kategorii z poprzednim miesiącem i średnią z 3 poprzednich miesięcy.
export function compareMonth(fin, month) {
  const cur = summarize(fin, monthBounds(month).from, monthBounds(month).to);
  const prev = summarize(fin, monthBounds(shiftMonth(month, -1)).from, monthBounds(shiftMonth(month, -1)).to);
  const last3 = summarize(fin, monthBounds(shiftMonth(month, -3)).from, monthBounds(shiftMonth(month, -1)).to);
  const ids = new Set([...cur.expenseByCategory, ...prev.expenseByCategory].map((c) => c.id));
  const find = (list, id) => list.find((c) => c.id === id)?.amount ?? 0;
  const rows = [...ids].map((id) => {
    const c = cur.expenseByCategory.find((x) => x.id === id) ?? prev.expenseByCategory.find((x) => x.id === id);
    return { id, name: c.name, emoji: c.emoji, color: c.color, current: find(cur.expenseByCategory, id), previous: find(prev.expenseByCategory, id), avg3: find(last3.expenseByCategory, id) / 3 };
  });
  return { current: cur, previous: prev, rows: rows.sort((a, b) => b.current - a.current) };
}

// ---------- Karty kredytowe ----------
// Saldo karty kredytowej jest ujemne (zadłużenie). Wydatek kartą zwiększa zadłużenie, spłata to przelew z konta na kartę.
export function cardStatus(account, balance) {
  const debt = Math.max(0, -balance);
  const limit = Number(account.limit) || 0;
  return { debt, limit, available: limit ? Math.max(0, limit - debt) : null, usedShare: limit ? Math.min(1, debt / limit) : null };
}

// Najbliższy termin spłaty karty (dzień miesiąca z ustawień konta); tylko gdy na karcie jest zadłużenie.
export function cardDue(account, balance, today) {
  if (!isCard(account) || !account.dueDay || -balance < 0.005) return null;
  const at = (y, m) => `${y}-${pad(m)}-${pad(Math.min(account.dueDay, new Date(Date.UTC(y, m, 0)).getUTCDate()))}`;
  const [y, m] = today.split('-').map(Number);
  let due = at(y, m);
  if (due < today) due = m === 12 ? at(y + 1, 1) : at(y, m + 1);
  return { due, days: Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) };
}

export function repaymentTx({ fromId, cardId, amount, date, newId, now = Date.now() }) {
  return { id: newId(), type: 'przelew', amount, date, accountId: fromId, toAccountId: cardId, merchant: 'Spłata karty', repayment: true, source: 'reczne', createdAt: now, updatedAt: now };
}

// ---------- Kursy walut i ceny aktywów ----------
// market = { asOf, fx: { EUR: [[data, kurs średni NBP], …] }, assets: { 'CSPX.UK': { name, currency, series, quotes } } }.
// Dane są wklejane do strony przy każdej publikacji (GitHub Actions w dni robocze), więc strona nie łączy się z siecią.
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Ostatnia para [data, wartość] z datą <= iso; dla daty sprzed początku danych – pierwsza para.
function pairAt(pairs, iso) {
  if (!pairs?.length) return null;
  let lo = 0;
  let hi = pairs.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][0] <= iso) {
      found = pairs[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found ?? pairs[0];
}

export function rateOn(market, currency, date) {
  if (!currency || currency === 'PLN') return 1;
  return pairAt(market?.fx?.[currency], date)?.[1] ?? null;
}

export const round2 = (x) => Math.round(x * 100) / 100;
export const accountCurrency = (fin, accountId) => fin.accounts.find((a) => a.id === accountId)?.currency || 'PLN';

// Przeliczenie kwoty między walutami po kursach średnich NBP z danego dnia (null, gdy brak kursu).
export function convert(market, amount, from, to, date) {
  const a = rateOn(market, from, date);
  const b = rateOn(market, to, date);
  return a === null || b === null ? null : round2((amount * a) / b);
}

// Pozycje na koncie inwestycyjnym („partie”): { asset: ticker albo 'manual', qty, price (za sztukę, w walucie aktywa), date }.
// Cena aktywa z rynku: notowanie, jeśli świeże, albo cena zakupu przesunięta o zmianę indeksu od dnia zakupu
// (tak samo jak w portfelu GEM). Aktywo z wyceną ręczną ma historię wycen w polu marks.
// Instrument z katalogu XTB ma walutę zapisaną przy pozycji – wycena działa także bez notowań.
export const lotCurrency = (market, lot) => (lot.asset && lot.asset !== 'manual' ? market?.assets?.[lot.asset]?.currency ?? lot.currency : lot.currency) || 'PLN';

export function lotPrice(market, lot, date) {
  if (!lot.asset || lot.asset === 'manual') return pairAt(lot.marks?.length ? lot.marks : [[lot.date, lot.price]], date)[1];
  const a = market?.assets?.[lot.asset];
  if (!a) return lot.price;
  const q = a.quotes?.length ? pairAt(a.quotes, date) : null;
  const quote = q && q[0] <= date ? q : null;
  if (quote && daysBetween(quote[0], date) <= 7) return quote[1];
  // Najnowsza znana cena – notowanie (jeśli późniejsze niż zakup) albo cena zakupu – przesunięta o zmianę indeksu.
  const base = quote && quote[0] > lot.date ? quote : [lot.date, lot.price];
  if (!a.series?.length) return base[1];
  const s0 = pairAt(a.series, base[0]);
  const s1 = pairAt(a.series, date);
  return s0 && s1 && s0[1] > 0 ? (base[1] * s1[1]) / s0[1] : base[1];
}

// Pozycja liczy się od daty zakupu, a gdy jej wartość była wcześniej w saldzie gotówki (rozliczenie przy dodaniu) –
// od dnia rozliczenia (since). Sprzedana pozycja (until) zostaje w historii do dnia sprzedaży.
export const lotActive = (lot, date) => (lot.since && lot.since > lot.date ? lot.since : lot.date) <= date && !(lot.until && date >= lot.until);

export function lotValuePLN(market, lot, date) {
  if (!lotActive(lot, date)) return 0;
  const r = rateOn(market, lotCurrency(market, lot), date);
  return r === null ? null : lot.qty * lotPrice(market, lot, date) * r;
}

export function holdingsPLN(market, account, date) {
  let sum = 0;
  for (const lot of account.lots ?? []) {
    const v = lotValuePLN(market, lot, date);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

// Ile zainwestowano w pozycję: ilość × cena zakupu, w walucie aktywa i w złotych po kursie NBP z dnia zakupu.
export function lotCost(market, lot) {
  const currency = lotCurrency(market, lot);
  const cost = lot.qty * lot.price;
  const r = rateOn(market, currency, lot.date);
  return { cost, currency, costPLN: r === null ? null : cost * r };
}

// Wynik otwartej pozycji na dany dzień: wartość, koszt i zysk w złotych (z efektem kursu walutowego)
// oraz zmiana samej ceny w walucie aktywa.
export function lotResult(market, lot, date) {
  const value = lotValuePLN(market, lot, date);
  const { costPLN, currency } = lotCost(market, lot);
  if (value === null || costPLN === null) return null;
  return { value, costPLN, gain: value - costPLN, gainPct: costPLN > 0 ? value / costPLN - 1 : null, priceChange: lot.price > 0 ? lotPrice(market, lot, date) / lot.price - 1 : null, currency };
}

// Podsumowanie konta inwestycyjnego: ile zainwestowano w otwarte pozycje, ile są dziś warte i jaki jest zysk.
// Pozycje sprzedane (until) dają zysk zrealizowany: wartość w dniu sprzedaży minus koszt zakupu.
export function investSummary(market, account, date) {
  const out = { cost: 0, value: 0, gain: 0, gainPct: null, positions: 0, missing: 0, realized: null };
  for (const lot of account.lots ?? []) {
    if (lot.until) {
      if (lot.until > date) continue;
      const r = rateOn(market, lotCurrency(market, lot), lot.until);
      const { costPLN } = lotCost(market, lot);
      if (r === null || costPLN === null) continue;
      out.realized = (out.realized ?? 0) + lot.qty * lotPrice(market, lot, lot.until) * r - costPLN;
      continue;
    }
    if (!lotActive(lot, date)) continue;
    const res = lotResult(market, lot, date);
    if (!res) {
      out.missing++;
      continue;
    }
    out.cost += res.costPLN;
    out.value += res.value;
    out.positions++;
  }
  out.gain = out.value - out.cost;
  out.gainPct = out.cost > 0 ? out.value / out.cost - 1 : null;
  return out.positions || out.realized !== null ? out : null;
}

// Wartość konta w złotych: saldo (gotówka, w walucie konta) po kursie z dnia + wartość pozycji inwestycyjnych.
export function accountWorth(fin, account, market, date, balance = balances(fin, date)[account.id]) {
  const rate = rateOn(market, account.currency || 'PLN', date);
  const inv = account.lots?.length ? holdingsPLN(market, account, date) : 0;
  if (rate === null || inv === null) return null;
  return { cash: balance, cashPLN: balance * rate, investments: inv, total: balance * rate + inv };
}

// Majątek: suma aktywnych kont w złotych (zadłużenie kart odejmuje się samo, bo saldo karty jest ujemne).
// Konta „nie wliczaj do salda łącznego” są pomijane, a konta bez kursu waluty trafiają do listy missing.
export function netWorth(fin, market = null, date = null) {
  // Domyślnie wycena na dziś (jak na liście kont): najnowsze kursy i notowania, także z biblioteki instrumentów.
  const at = date ?? new Date().toISOString().slice(0, 10);
  const bal = balances(fin, date ?? '9999-12-31');
  const out = { total: 0, assets: 0, debt: 0, cardDebt: 0, investments: 0, missing: [] };
  for (const a of fin.accounts) {
    if (a.archived || a.excludeFromTotal) continue;
    const w = accountWorth(fin, a, market, at, bal[a.id]);
    if (!w) {
      out.missing.push(a.name);
      continue;
    }
    out.total += w.total;
    out.assets += Math.max(0, w.cashPLN) + w.investments;
    out.debt += Math.max(0, -w.cashPLN);
    if (isCard(a)) out.cardDebt += Math.max(0, -w.cashPLN);
    out.investments += w.investments;
  }
  return out;
}

// Historia majątku i dochodów miesiąc po miesiącu (do wykresu). Ostatni punkt to dziś.
export function worthHistory(fin, market, { today, months = 0 } = {}) {
  const dates = [...liveTx(fin).map((t) => t.date), ...fin.accounts.flatMap((a) => (a.lots ?? []).map((l) => l.date))].filter((d) => d && d <= today);
  if (!dates.length) return [];
  let start = dates.reduce((m, d) => (d < m ? d : m)).slice(0, 7);
  if (months) {
    const cut = shiftMonth(today.slice(0, 7), -(months - 1));
    if (cut > start) start = cut;
  }
  const points = [];
  for (let m = start; m <= today.slice(0, 7); m = shiftMonth(m, 1)) {
    const { from, to } = monthBounds(m);
    const end = to < today ? to : today;
    const s = summarize(fin, from, end);
    points.push({ month: m, date: end, worth: netWorth(fin, market, end).total, income: s.income, expense: s.expense });
  }
  return points;
}

// Ustawia saldo konta na kwotę z formularza. Gdy konto ma już operacje, różnica trafia do historii jako korekta salda
// z podaną datą – wykres majątku pokaże zmianę w dniu, w którym nastąpiła.
export function adjustBalance(fin, accountId, target, { date, newId, now = Date.now(), market = null, note = 'Korekta salda' }) {
  const a = fin.accounts.find((x) => x.id === accountId);
  const delta = round2(target - balances(fin)[accountId]);
  if (!a || Math.abs(delta) < 0.005) return fin;
  if (!liveTx(fin).some((t) => t.accountId === accountId || t.toAccountId === accountId)) return setBalance(fin, accountId, target);
  const cur = a.currency || 'PLN';
  const tx = { id: newId(), type: 'korekta', amount: cur === 'PLN' ? delta : convert(market, delta, cur, 'PLN', date) ?? delta, date, accountId, merchant: note, source: 'reczne', createdAt: now, updatedAt: now };
  if (cur !== 'PLN') tx.accountAmount = delta;
  fin.txs.push(tx);
  return fin;
}

// Usuwa konto. Jego operacje przenosi na inne konto (moveTo, ta sama waluta) albo usuwa razem z kontem.
// keepTargetBalance: przy scalaniu dwóch wpisów tego samego konta saldo konta docelowego się nie zmienia.
// Bez moveTo przelewy z innymi kontami zostają (bez usuniętej strony), żeby salda pozostałych kont się nie zmieniły.
export function deleteAccount(fin, accountId, { moveTo = null, keepTargetBalance = false, now = Date.now() } = {}) {
  const before = moveTo ? balances(fin)[moveTo] : null;
  const relink = (x) => {
    if (x.accountId !== accountId && x.toAccountId !== accountId) return [x];
    const c = { ...x };
    const swap = (id) => (id === accountId ? moveTo : id);
    if (!moveTo && c.type !== 'przelew') return [];
    c.accountId = swap(c.accountId);
    if (c.type === 'przelew') c.toAccountId = swap(c.toAccountId);
    if (c.type === 'przelew' && (c.accountId === c.toAccountId || (!c.accountId && !c.toAccountId))) return []; // przelew między scalanymi kontami znika
    return [c];
  };
  const txs = fin.txs.flatMap(relink);
  const kept = new Set(txs.map((t) => t.id));
  const out = {
    ...fin,
    updatedAt: now,
    txs,
    recurring: (fin.recurring ?? []).flatMap((r) => (!moveTo && (r.accountId === accountId || r.toAccountId === accountId) ? [] : relink(r))),
    accounts: fin.accounts.filter((a) => a.id !== accountId).map((a) => (a.payFromId === accountId || a.id === moveTo ? { ...a, payFromId: a.payFromId === accountId ? moveTo ?? undefined : a.payFromId } : a)),
    docs: (fin.docs ?? []).map((d) => (d.txId && !kept.has(d.txId) ? { ...d, txId: null } : d)),
  };
  if (out.lastAccountId === accountId) delete out.lastAccountId;
  if (moveTo && keepTargetBalance) setBalance(out, moveTo, before);
  return out;
}

// Usuwa kategorię. Jej operacje trafiają do innej kategorii (moveTo) albo do „Do przypisania”.
export function deleteCategory(fin, categoryId, { moveTo = null, now = Date.now() } = {}) {
  return {
    ...fin,
    updatedAt: now,
    categories: fin.categories.filter((c) => c.id !== categoryId),
    txs: fin.txs.map((t) => (t.categoryId === categoryId ? { ...t, categoryId: moveTo } : t)),
    rules: moveTo ? fin.rules.map((r) => (r.categoryId === categoryId ? { ...r, categoryId: moveTo } : r)) : fin.rules.filter((r) => r.categoryId !== categoryId),
    recurring: (fin.recurring ?? []).map((r) => (r.categoryId === categoryId ? { ...r, categoryId: moveTo } : r)),
  };
}

// ---------- Stałe płatności i dochody ----------
export const FREQS = { tydzien: 'Co tydzień', '2tyg': 'Co 2 tygodnie', '4tyg': 'Co 4 tygodnie', miesiac: 'Co miesiąc', '2mies': 'Co 2 miesiące', kwartal: 'Co kwartał', rok: 'Co rok' };
const PER_MONTH = { tydzien: 52 / 12, '2tyg': 26 / 12, '4tyg': 13 / 12, miesiac: 1, '2mies': 1 / 2, kwartal: 1 / 3, rok: 1 / 12 };
const MONTH_STEP = { miesiac: 1, '2mies': 2, kwartal: 3, rok: 12 };

function isoDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Następny termin. Dla okresów miesięcznych pamiętamy dzień miesiąca (31 → 30 lub 28 w krótszych miesiącach).
export function nextRecurringDate(date, freq, anchorDay) {
  if (freq === 'tydzien') return isoDays(date, 7);
  if (freq === '2tyg') return isoDays(date, 14);
  if (freq === '4tyg') return isoDays(date, 28);
  const step = MONTH_STEP[freq] ?? 1;
  const [y, m] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + step, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(anchorDay || Number(date.slice(8, 10)), last));
  return t.toISOString().slice(0, 10);
}

const recActive = (r, date) => !r.paused && (!r.endDate || date <= r.endDate);

// Kwota stałej pozycji jest w walucie konta; do raportów przeliczamy ją na złote po kursie NBP z dnia terminu.
export function recurringTx(rec, date, { newId, now = Date.now(), fin = null, market = null }) {
  const tx = {
    id: newId(),
    type: rec.type,
    amount: rec.amount,
    date,
    accountId: rec.accountId || null,
    toAccountId: rec.type === 'przelew' ? rec.toAccountId || null : undefined,
    categoryId: rec.type === 'przelew' ? null : rec.categoryId || null,
    merchant: rec.title,
    source: 'stale',
    recurringId: rec.id,
    importKey: `rec|${rec.id}|${date}`,
    createdAt: now,
    updatedAt: now,
  };
  const from = fin ? accountCurrency(fin, rec.accountId) : 'PLN';
  if (from !== 'PLN') {
    tx.accountAmount = rec.amount;
    tx.amount = convert(market, rec.amount, from, 'PLN', date) ?? rec.amount;
  }
  if (rec.type === 'przelew' && fin) {
    const to = accountCurrency(fin, rec.toAccountId);
    if (to !== from) tx.toAmount = convert(market, rec.amount, from, to, date) ?? rec.amount;
  }
  return tx;
}

// Księguje automatyczne pozycje, których termin minął; zwraca też pozycje „do zatwierdzenia” (bez automatu).
export function processRecurring(fin, today, { newId, now = Date.now(), market = null }) {
  const keys = new Set(liveTx(fin).filter((t) => t.importKey).map((t) => t.importKey));
  const txs = [];
  const pending = [];
  const recurring = (fin.recurring ?? []).map((r) => ({ ...r }));
  for (const r of recurring) {
    let guard = 0;
    while (r.nextDate && r.nextDate <= today && recActive(r, r.nextDate) && guard++ < 120) {
      if (!r.auto) {
        pending.push({ rec: r, date: r.nextDate });
        break;
      }
      const tx = recurringTx(r, r.nextDate, { newId, now, fin, market });
      if (!keys.has(tx.importKey)) txs.push(tx);
      r.nextDate = nextRecurringDate(r.nextDate, r.freq, r.anchorDay);
    }
  }
  return { fin: txs.length ? { ...fin, recurring, txs: [...fin.txs, ...txs], updatedAt: now } : { ...fin, recurring }, posted: txs.length, pending };
}

// Zatwierdzenie lub pominięcie terminu pozycji „z potwierdzeniem” – przesuwa termin na następny.
export function settleRecurring(fin, recId, { post, newId, now = Date.now(), market = null }) {
  const r = fin.recurring.find((x) => x.id === recId);
  if (!r?.nextDate) return fin;
  const tx = post ? recurringTx(r, r.nextDate, { newId, now, fin, market }) : null;
  const txs = tx && !liveTx(fin).some((t) => t.importKey === tx.importKey) ? [...fin.txs, tx] : fin.txs;
  const recurring = fin.recurring.map((x) => (x.id === recId ? { ...x, nextDate: nextRecurringDate(x.nextDate, x.freq, x.anchorDay) } : x));
  return { ...fin, txs, recurring, updatedAt: now };
}

// Pozycje „z potwierdzeniem”, których termin już minął.
export const dueRecurring = (fin, today) =>
  (fin.recurring ?? []).filter((r) => !r.auto && r.nextDate && r.nextDate <= today && recActive(r, r.nextDate)).map((r) => ({ rec: r, date: r.nextDate }));

// Wszystkie terminy stałych pozycji w zakresie dat (kalendarz, lista najbliższych).
export function recurringBetween(fin, from, to) {
  const out = [];
  for (const r of fin.recurring ?? []) {
    let d = r.nextDate;
    let guard = 0;
    while (d && d <= to && guard++ < 400) {
      if (d >= from && recActive(r, d)) out.push({ rec: r, date: d });
      d = nextRecurringDate(d, r.freq, r.anchorDay);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export const upcomingRecurring = (fin, today, days = 30) => recurringBetween(fin, isoDays(today, 1), isoDays(today, days));

export function validateRecurring(r, fin) {
  const errors = [];
  if (!String(r.title ?? '').trim()) errors.push('Podaj nazwę.');
  if (!FIN_TYPES[r.type]) errors.push('Wybierz typ.');
  if (!(r.amount > 0)) errors.push('Podaj kwotę większą od zera.');
  if (!FREQS[r.freq]) errors.push('Wybierz, jak często.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.nextDate ?? '')) errors.push('Podaj najbliższy termin.');
  else if (r.endDate && r.endDate < r.nextDate) errors.push('Ostatni termin jest wcześniejszy niż najbliższy.');
  if (fin.accounts.length && !r.accountId) errors.push('Wybierz konto.');
  if (r.type === 'przelew' && (!r.toAccountId || r.toAccountId === r.accountId)) errors.push('Przelew wymaga dwóch różnych kont.');
  return errors;
}

// Stałe pozycje w przeliczeniu na miesiąc i na złote (bez wstrzymanych i zakończonych).
export function recurringMonthly(fin, market = null) {
  const out = { przychod: 0, wydatek: 0, przelew: 0 };
  for (const r of fin.recurring ?? []) {
    if (!r.nextDate || !recActive(r, r.nextDate)) continue;
    const pln = convert(market, r.amount, accountCurrency(fin, r.accountId), 'PLN', r.nextDate) ?? r.amount;
    out[r.type] += pln * (PER_MONTH[r.freq] ?? 1);
  }
  return out;
}

// ---------- Kalendarz ----------
export function calendarMonth(fin, month, { accountId = null } = {}) {
  const { from, to } = monthBounds(month);
  const days = new Map();
  for (const t of liveTx(fin)) {
    if (!isFlow(t) || t.date < from || t.date > to || (accountId && t.accountId !== accountId)) continue;
    const d = days.get(t.date) ?? { expense: 0, income: 0, count: 0 };
    if (t.type === 'przychod') d.income += t.amount;
    else d.expense += t.amount;
    d.count++;
    days.set(t.date, d);
  }
  const firstDow = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7; // poniedziałek = 0
  const list = [];
  for (let day = 1; day <= Number(to.slice(8, 10)); day++) {
    const date = `${month}-${pad(day)}`;
    list.push({ date, day, ...(days.get(date) ?? { expense: 0, income: 0, count: 0 }) });
  }
  return { firstDow, days: list, maxExpense: Math.max(0, ...list.map((d) => d.expense)) };
}

// Zakres dat dla okresu przeglądu: dzień, tydzień (pn–nd), miesiąc, rok.
export function periodRange(kind, anchor) {
  if (kind === 'dzien') return { from: anchor, to: anchor };
  if (kind === 'tydzien') {
    const dow = (new Date(`${anchor}T12:00:00Z`).getUTCDay() + 6) % 7;
    const from = isoDays(anchor, -dow);
    return { from, to: isoDays(from, 6) };
  }
  if (kind === 'rok') return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31` };
  return monthBounds(anchor.slice(0, 7));
}

export function shiftPeriod(kind, anchor, n) {
  if (kind === 'dzien') return isoDays(anchor, n);
  if (kind === 'tydzien') return isoDays(anchor, 7 * n);
  if (kind === 'rok') return `${Number(anchor.slice(0, 4)) + n}${anchor.slice(4)}`;
  return `${shiftMonth(anchor.slice(0, 7), n)}-01`;
}

// Wzorzec reguły z nazwy sprzedawcy: pierwsze słowo („ORLEN Stacja 1234” → „ORLEN”), żeby pasował do innych oddziałów.
export function rulePatternFor(merchant) {
  const word = String(merchant ?? '').trim().split(/[\s*#/,;:|]+/)[0].replace(/[^\p{L}\p{N}.&'-]/gu, '');
  return word.length >= 3 ? word : String(merchant ?? '').trim().slice(0, 40);
}

export function shortcutCategoriesText(fin) {
  return [...fin.categories.filter((c) => c.kind === 'wydatek' && !c.archived).map((c) => c.name), 'Pomiń'].join('\n');
}
