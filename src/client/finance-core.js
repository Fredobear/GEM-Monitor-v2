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

export const emptyFinance = () => ({ version: 1, accounts: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), txs: [], rules: [], recurring: [], updatedAt: 0 });
export const ACCOUNT_ICONS = { bank: '🏦', karta: '💳', gotowka: '💵', oszczednosci: '🐷', inne: '👛' };
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

// Saldo każdego konta: saldo początkowe + operacje od daty salda początkowego.
// Dla kont w innej walucie liczy kwotę w walucie konta (accountAmount, a przy przelewie toAmount).
export function balances(fin, upTo = '9999-12-31') {
  const out = Object.fromEntries(fin.accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
  const start = Object.fromEntries(fin.accounts.map((a) => [a.id, a.openingDate ?? '0000-00-00']));
  for (const t of liveTx(fin)) {
    if (t.date > upTo) continue;
    if (t.accountId in out && t.date >= start[t.accountId]) {
      const v = t.accountAmount ?? t.amount;
      if (t.type === 'przychod') out[t.accountId] += v;
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

// Saldo łączne aktywnych kont w złotych (zadłużenie kart odejmuje się samo, bo saldo karty jest ujemne).
// Pomija konta w innych walutach i oznaczone „nie wliczaj do salda łącznego”.
export function netWorth(fin) {
  const bal = balances(fin);
  const counted = fin.accounts.filter((a) => !a.archived && !a.excludeFromTotal && (!a.currency || a.currency === 'PLN'));
  const sum = (list, f) => list.reduce((s, a) => s + f(bal[a.id]), 0);
  return {
    total: sum(counted, (v) => v),
    assets: sum(counted, (v) => Math.max(0, v)),
    debt: sum(counted, (v) => Math.max(0, -v)),
    cardDebt: sum(counted.filter(isCard), (v) => Math.max(0, -v)),
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

export function recurringTx(rec, date, { newId, now = Date.now() }) {
  return {
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
}

// Księguje automatyczne pozycje, których termin minął; zwraca też pozycje „do zatwierdzenia” (bez automatu).
export function processRecurring(fin, today, { newId, now = Date.now() }) {
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
      const tx = recurringTx(r, r.nextDate, { newId, now });
      if (!keys.has(tx.importKey)) txs.push(tx);
      r.nextDate = nextRecurringDate(r.nextDate, r.freq, r.anchorDay);
    }
  }
  return { fin: txs.length ? { ...fin, recurring, txs: [...fin.txs, ...txs], updatedAt: now } : { ...fin, recurring }, posted: txs.length, pending };
}

// Zatwierdzenie lub pominięcie terminu pozycji „z potwierdzeniem” – przesuwa termin na następny.
export function settleRecurring(fin, recId, { post, newId, now = Date.now() }) {
  const r = fin.recurring.find((x) => x.id === recId);
  if (!r?.nextDate) return fin;
  const tx = post ? recurringTx(r, r.nextDate, { newId, now }) : null;
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

// Stałe pozycje w przeliczeniu na miesiąc (bez wstrzymanych i zakończonych).
export function recurringMonthly(fin) {
  const out = { przychod: 0, wydatek: 0, przelew: 0 };
  for (const r of fin.recurring ?? []) if (r.nextDate && recActive(r, r.nextDate)) out[r.type] += r.amount * (PER_MONTH[r.freq] ?? 1);
  return out;
}

// ---------- Kalendarz ----------
export function calendarMonth(fin, month, { accountId = null } = {}) {
  const { from, to } = monthBounds(month);
  const days = new Map();
  for (const t of liveTx(fin)) {
    if (t.type === 'przelew' || t.date < from || t.date > to || (accountId && t.accountId !== accountId)) continue;
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
