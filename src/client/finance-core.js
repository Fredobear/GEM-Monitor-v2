// Rdzeń dziennika finansowego: konta, kategorie, transakcje, import (Apple Pay ze Skrótów, wyciągi CSV) i raporty.
// Działa wyłącznie lokalnie – bez DOM, bez sieci. Plik jest wklejany do strony finanse.html i testowany w Node.

export const FIN_TYPES = { wydatek: 'Wydatek', przychod: 'Przychód', przelew: 'Przelew' };
export const ACCOUNT_TYPES = { bank: 'Konto bankowe', karta: 'Karta kredytowa', gotowka: 'Gotówka', oszczednosci: 'Oszczędności', inne: 'Inne' };
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

export const emptyFinance = () => ({ version: 1, accounts: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), txs: [], rules: [], updatedAt: 0 });
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
export function parseShortcutLog(text, fin) {
  const txs = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const sep = line.includes(';') ? ';' : line.includes('|') ? '|' : '\t';
    const f = line.split(sep).map((x) => x.trim());
    if (f.length < 3) return errors.push(`Wiersz ${i + 1}: za mało pól.`);
    const when = parseDate(f[0]);
    const amount = parseAmount(f[1]);
    if (!when || !Number.isFinite(amount) || amount === 0) return errors.push(`Wiersz ${i + 1}: nie rozpoznano daty albo kwoty („${f[0]}”, „${f[1]}”).`);
    const merchant = f[2] || 'Apple Pay';
    const categoryName = f[3] ?? '';
    if (norm(categoryName) === norm(SKIP_CATEGORY)) return;
    const card = f.slice(4).join(' ').trim();
    const category = findCategory(fin.categories, categoryName);
    txs.push({
      type: 'wydatek',
      amount: Math.abs(amount),
      date: when.date,
      time: when.time,
      merchant,
      categoryId: category?.id ?? applyRules(merchant, fin.rules),
      accountId: accountForCard(fin.accounts, card),
      card: card || undefined,
      source: 'applepay',
      importKey: `ap|${when.date}|${when.time ?? ''}|${Math.abs(amount).toFixed(2)}|${norm(merchant)}`,
    });
  });
  return { txs, errors };
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
  for (const t of txs) {
    if (keys.has(t.importKey)) continue;
    const other = t.source === 'csv' ? 'applepay' : t.source === 'applepay' ? 'csv' : null;
    const twin = other && live.find((o) => o.source === other && isSamePayment(o, t));
    if (twin) {
      crossSource++;
      if (!twin.accountId && t.accountId) twin.accountId = t.accountId;
      continue;
    }
    keys.add(t.importKey);
    fresh.push({ ...t, id: newId ? newId() : `${now}-${fresh.length}`, createdAt: now, updatedAt: now });
  }
  return { fin: { ...fin, txs: [...fin.txs, ...fresh], updatedAt: now }, added: fresh.length, skipped: txs.length - fresh.length, crossSource };
}

export function validateFinTx(t, fin) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date ?? '')) errors.push('Podaj datę.');
  if (!FIN_TYPES[t.type]) errors.push('Wybierz typ.');
  if (!(t.amount > 0)) errors.push('Podaj kwotę większą od zera.');
  if (fin.accounts.length && !t.accountId) errors.push('Wybierz konto.');
  if (t.type === 'przelew' && (!t.toAccountId || t.toAccountId === t.accountId)) errors.push('Przelew wymaga dwóch różnych kont.');
  return errors;
}

// Saldo każdego konta: saldo początkowe + operacje od daty saldo początkowego.
export function balances(fin, upTo = '9999-12-31') {
  const out = Object.fromEntries(fin.accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
  const start = Object.fromEntries(fin.accounts.map((a) => [a.id, a.openingDate ?? '0000-00-00']));
  for (const t of liveTx(fin)) {
    if (t.date > upTo) continue;
    if (t.accountId in out && t.date >= start[t.accountId]) {
      if (t.type === 'przychod') out[t.accountId] += t.amount;
      else out[t.accountId] -= t.amount;
    }
    if (t.type === 'przelew' && t.toAccountId in out && t.date >= start[t.toAccountId]) out[t.toAccountId] += t.amount;
  }
  return out;
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
  const txs = liveTx(fin).filter((t) => t.type !== 'przelew' && t.date >= from && t.date <= to && (!accountId || t.accountId === accountId));
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

// Wzorzec reguły z nazwy sprzedawcy: pierwsze słowo („ORLEN Stacja 1234” → „ORLEN”), żeby pasował do innych oddziałów.
export function rulePatternFor(merchant) {
  const word = String(merchant ?? '').trim().split(/[\s*#/,;:|]+/)[0].replace(/[^\p{L}\p{N}.&'-]/gu, '');
  return word.length >= 3 ? word : String(merchant ?? '').trim().slice(0, 40);
}

export function shortcutCategoriesText(fin) {
  return [...fin.categories.filter((c) => c.kind === 'wydatek' && !c.archived).map((c) => c.name), 'Pomiń'].join('\n');
}
