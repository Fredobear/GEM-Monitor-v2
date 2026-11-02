// Interfejs dziennika finansowego. Dane są zapisywane wyłącznie w tej przeglądarce (localStorage).
// Strona ma zablokowane połączenia sieciowe (Content-Security-Policy: connect-src 'none'), więc nie może ich nigdzie wysłać.
// Korzysta z funkcji z finance-core.js (wklejonych wyżej w tym samym skrypcie).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NF0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const zl = (x) => `${NF2.format(x)} zł`;
const zl0 = (x) => `${NF0.format(Math.round(x))} zł`;
const pct = (x) => (x === null || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`);
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const DOW = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayLabel = (iso) => `${DOW[new Date(`${iso}T12:00:00`).getDay()]}, ${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const KEY = 'gem.fin.v1';
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v?.version === 1) return { ...emptyFinance(), ...v };
  } catch {
    // brak danych albo uszkodzony zapis – zaczynamy od pustego dziennika
  }
  return emptyFinance();
}
let fin = load();
let persisted = false;
function save() {
  fin.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(fin));
  } catch {
    toast('Nie udało się zapisać danych. Zrób kopię zapasową (Ustawienia → Kopia).');
  }
  if (!persisted && navigator.storage?.persist) {
    persisted = true;
    navigator.storage.persist().catch(() => {});
  }
}

const ui = { view: 'przeglad', month: today().slice(0, 7), report: 'miesiac', year: today().slice(0, 4), from: `${today().slice(0, 4)}-01-01`, to: today(), q: '', account: '', category: '', type: '', limit: 120, csv: null, inbox: false };

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cat = (id) => fin.categories.find((c) => c.id === id);
const acc = (id) => fin.accounts.find((a) => a.id === id);
const catChip = (id) => {
  const c = cat(id);
  return c ? `<span class="cat-chip" style="--c:${esc(c.color)}">${esc(c.emoji)} ${esc(c.name)}</span>` : '<span class="cat-chip none">❓ Do przypisania</span>';
};

// ---------- Wykresy (SVG) ----------
function donut(items, total, label) {
  const R = 64;
  const W = 22;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = items
    .filter((i) => i.amount > 0)
    .map((i) => {
      const len = (i.amount / total) * C;
      const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${esc(i.color)}" stroke-width="${W}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(i.name)}: ${zl(i.amount)}</title></circle>`;
      offset += len;
      return s;
    })
    .join('');
  return `<svg class="donut" viewBox="0 0 180 180" role="img" aria-label="Wydatki według kategorii"><circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--line)" stroke-width="${W}"/>${segs}<text x="90" y="86" text-anchor="middle" class="donut-v">${esc(zl0(total))}</text><text x="90" y="106" text-anchor="middle" class="donut-l">${esc(label)}</text></svg>`;
}

// Do 16 słupków wykres mieści się na szerokość ekranu; dłuższe (np. dni miesiąca) przewijają się poziomo.
function bars(data, { height = 180, series }) {
  const fit = data.length <= 16;
  const W = fit ? 340 : Math.max(280, data.length * 24);
  const H = height;
  const M = { l: 6, r: 6, t: 10, b: 24 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] ?? 0)));
  const slot = (W - M.l - M.r) / data.length;
  const bw = Math.max(3, Math.min(18, (slot - 6) / series.length));
  const parts = [`<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" class="axis-line"/>`];
  data.forEach((d, i) => {
    const x0 = M.l + i * slot + (slot - bw * series.length) / 2;
    series.forEach((s, k) => {
      const v = d[s.key] ?? 0;
      const h = (v / max) * (H - M.t - M.b);
      parts.push(`<rect x="${(x0 + k * bw).toFixed(1)}" y="${(H - M.b - h).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${s.color}"><title>${esc(d.label)} – ${esc(s.name)}: ${zl(v)}</title></rect>`);
    });
    if (d.tick) parts.push(`<text x="${(M.l + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="axis">${esc(d.tick)}</text>`);
  });
  const size = fit ? 'style="width:100%;height:auto"' : `width="${W}" height="${H}"`;
  return `<div class="bars-wrap"><svg class="bars" viewBox="0 0 ${W} ${H}" ${size} role="img">${parts.join('')}</svg></div><div class="legend-row">${series.map((s) => `<span><i class="sw" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function categoryList(list, total, { showBudget = false } = {}) {
  if (!list.length) return '<p class="muted">Brak wydatków w tym okresie.</p>';
  return `<ul class="cat-list">${list
    .map((c) => {
      const budget = showBudget && c.budget ? `<div class="meter"><span style="width:${Math.min(100, (c.amount / c.budget) * 100)}%;background:${c.amount > c.budget ? 'var(--neg)' : esc(c.color)}"></span></div><div class="small ${c.amount > c.budget ? 'neg' : 'muted'}">budżet ${zl0(c.budget)} · ${c.amount > c.budget ? `przekroczony o ${zl0(c.amount - c.budget)}` : `zostało ${zl0(c.budget - c.amount)}`}</div>` : '';
      return `<li><div class="cat-row"><span><i class="dot" style="background:${esc(c.color)}"></i>${esc(c.emoji)} ${esc(c.name)}</span><span class="num"><b>${zl(c.amount)}</b> <span class="muted small">${pct(c.amount / total)}</span></span></div>${budget}</li>`;
    })
    .join('')}</ul>`;
}

// ---------- Widoki ----------
function monthSwitcher(month) {
  return `<div class="month-switch"><button class="icon-btn" data-month="${shiftMonth(month, -1)}" aria-label="Poprzedni miesiąc">‹</button><b>${esc(monthLabel(month))}</b><button class="icon-btn" data-month="${shiftMonth(month, 1)}" aria-label="Następny miesiąc">›</button></div>`;
}

function kpis(s) {
  return `<div class="kpis">
  <div class="kpi"><span>Wydatki</span><b class="neg">${zl0(s.expense)}</b></div>
  <div class="kpi"><span>Przychody</span><b class="pos">${zl0(s.income)}</b></div>
  <div class="kpi"><span>Bilans</span><b class="${s.net >= 0 ? 'pos' : 'neg'}">${s.net >= 0 ? '+' : '−'}${zl0(Math.abs(s.net))}</b></div>
  <div class="kpi"><span>Oszczędzasz</span><b>${pct(s.savingsRate)}</b><small>przychodów</small></div></div>`;
}

function inboxBanner() {
  const n = liveTx(fin).filter((t) => t.type !== 'przelew' && !t.categoryId).length;
  return n ? `<div class="banner warn"><b>${n} ${n === 1 ? 'płatność czeka' : 'płatności czekają'} na kategorię.</b> <button class="link" data-act="inbox">Przypisz teraz</button></div>` : '';
}

function viewOverview() {
  if (!fin.accounts.length && !liveTx(fin).length) return onboarding();
  const { from, to } = monthBounds(ui.month);
  const s = summarize(fin, from, to);
  const bal = balances(fin);
  const days = [];
  for (let d = 1; d <= Number(to.slice(8, 10)); d++) {
    const iso = `${ui.month}-${String(d).padStart(2, '0')}`;
    days.push({ label: iso, tick: d === 1 || d % 5 === 0 ? String(d) : '', wydatki: s.byDay.find(([x]) => x === iso)?.[1] ?? 0 });
  }
  return `${monthSwitcher(ui.month)}${inboxBanner()}${kpis(s)}
  <section class="card"><h2>Wydatki według kategorii</h2>${s.expense ? `<div class="donut-row">${donut(s.expenseByCategory, s.expense, 'wydatki')}<div class="grow">${categoryList(s.expenseByCategory, s.expense, { showBudget: true })}</div></div>` : '<p class="muted">Brak wydatków w tym miesiącu. Dodaj pierwszy przyciskiem +.</p>'}</section>
  <section class="card"><h2>Wydatki dzień po dniu</h2>${bars(days, { series: [{ key: 'wydatki', name: 'Wydatki', color: 'var(--neg)' }], height: 150 })}</section>
  ${fin.accounts.length ? `<section class="card"><h2>Konta</h2><ul class="cat-list">${fin.accounts
    .filter((a) => !a.archived)
    .map((a) => `<li><div class="cat-row"><span>${esc(a.name)} <span class="tag">${esc(ACCOUNT_TYPES[a.type] ?? '')}</span></span><b class="num ${bal[a.id] < 0 ? 'neg' : ''}">${zl(bal[a.id])}</b></div></li>`)
    .join('')}</ul><p class="small muted">Razem: <b>${zl(fin.accounts.filter((a) => !a.archived).reduce((x, a) => x + bal[a.id], 0))}</b></p></section>` : ''}`;
}

function onboarding() {
  return `<section class="card empty"><div class="empty-icon">💳</div><h2 class="h2-plain">Twój dziennik finansowy</h2>
  <p>Zapisuj wydatki i przychody, przypisuj je do kategorii i sprawdzaj raporty miesięczne i roczne. Wszystko zostaje na tym urządzeniu: strona nie łączy się z siecią i nikomu nie wysyła danych.</p>
  <ol class="steps-mini"><li><b>Dodaj konta</b>, np. konto w banku, kartę, gotówkę, z saldem początkowym.</li><li><b>Dopasuj kategorie</b> do siebie i ustaw miesięczne budżety.</li><li>Na iPhonie <b>podłącz Apple Pay</b> przez Skróty: po każdej płatności pojawi się lista Twoich kategorii (Ustawienia → Apple Pay).</li><li>Starsze operacje <b>wczytaj z wyciągu CSV</b> z banku.</li></ol>
  <div class="row-btns"><button class="btn primary" data-view="konta">Dodaj konto</button><button class="btn" data-act="add">Dodaj wydatek</button><button class="btn ghost" data-view="ustawienia">Ustawienia i import</button></div></section>`;
}

function viewInbox() {
  const list = liveTx(fin).filter((t) => t.type !== 'przelew' && !t.categoryId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const cats = (kind) => fin.categories.filter((c) => c.kind === kind && !c.archived);
  return `<section class="card"><div class="card-head"><h2>Do przypisania (${list.length})</h2><button class="link" data-act="inbox-close">Zamknij</button></div>
  ${list.length ? list
    .slice(0, 50)
    .map((t) => `<div class="inbox-item"><div class="cat-row"><span><b>${esc(t.merchant || 'Bez opisu')}</b><br><span class="small muted">${esc(dayLabel(t.date))}${t.card ? ` · ${esc(t.card)}` : ''}</span></span><b class="num ${t.type === 'przychod' ? 'pos' : ''}">${t.type === 'przychod' ? '+' : '−'}${zl(t.amount)}</b></div>
    <div class="cat-grid">${cats(t.type === 'przychod' ? 'przychod' : 'wydatek').map((c) => `<button class="cat-pick" style="--c:${esc(c.color)}" data-assign="${esc(t.id)}" data-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>
    <label class="check small"><input type="checkbox" data-remember="${esc(t.id)}" checked> Zapamiętaj dla „${esc(rulePatternFor(t.merchant))}”</label></div>`)
    .join('') : '<p class="muted">Wszystko przypisane. 🎉</p>'}</section>`;
}

function filteredTxs() {
  const q = ui.q.trim().toLowerCase();
  return liveTx(fin)
    .filter((t) => (!ui.account || t.accountId === ui.account || t.toAccountId === ui.account) && (!ui.type || t.type === ui.type) && (!ui.category || (ui.category === '_none' ? !t.categoryId : t.categoryId === ui.category)))
    .filter((t) => !q || `${t.merchant ?? ''} ${t.note ?? ''} ${cat(t.categoryId)?.name ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => (a.date === b.date ? (b.time ?? '').localeCompare(a.time ?? '') || (b.createdAt ?? 0) - (a.createdAt ?? 0) : a.date < b.date ? 1 : -1));
}

function txRow(t) {
  const sign = t.type === 'przychod' ? '+' : t.type === 'przelew' ? '⇄ ' : '−';
  const label = t.type === 'przelew' ? `${esc(acc(t.accountId)?.name ?? '?')} → ${esc(acc(t.toAccountId)?.name ?? '?')}` : catChip(t.categoryId);
  return `<button class="ftx" data-edit="${esc(t.id)}"><span class="ftx-main"><b>${esc(t.merchant || (t.type === 'przelew' ? 'Przelew' : 'Bez opisu'))}</b><small>${label}${t.accountId && t.type !== 'przelew' ? ` · ${esc(acc(t.accountId)?.name ?? '')}` : ''}${t.source === 'applepay' ? ' · Apple Pay' : t.source === 'csv' ? ' · import' : ''}</small></span><span class="ftx-amt ${t.type === 'przychod' ? 'pos' : t.type === 'przelew' ? 'muted' : ''}">${sign}${zl(t.amount)}${t.time ? `<small>${esc(t.time)}</small>` : ''}</span></button>`;
}

function viewTransactions() {
  const list = filteredTxs();
  const groups = new Map();
  for (const t of list.slice(0, ui.limit)) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  return `<section class="card"><div class="filters">
   <input type="search" id="f-q" placeholder="Szukaj: sprzedawca, opis, kategoria" value="${esc(ui.q)}">
   <select id="f-account">${opt('', 'Wszystkie konta', ui.account)}${fin.accounts.map((a) => opt(a.id, a.name, ui.account)).join('')}</select>
   <select id="f-category">${opt('', 'Wszystkie kategorie', ui.category)}${opt('_none', '❓ Do przypisania', ui.category)}${fin.categories.map((c) => opt(c.id, `${c.emoji} ${c.name}`, ui.category)).join('')}</select>
   <select id="f-type">${opt('', 'Wszystkie typy', ui.type)}${Object.entries(FIN_TYPES).map(([k, l]) => opt(k, l, ui.type)).join('')}</select>
  </div>
  <p class="small muted">${list.length} operacji · wydatki ${zl(list.filter((t) => t.type === 'wydatek').reduce((a, t) => a + t.amount, 0))} · przychody ${zl(list.filter((t) => t.type === 'przychod').reduce((a, t) => a + t.amount, 0))}</p>
  ${[...groups]
    .map(([d, txs]) => {
      const spent = txs.filter((t) => t.type === 'wydatek').reduce((a, t) => a + t.amount, 0);
      return `<div class="tx-month"><span>${esc(dayLabel(d))}</span>${spent ? `<span>−${zl(spent)}</span>` : ''}</div>${txs.map(txRow).join('')}`;
    })
    .join('') || '<p class="muted">Brak operacji.</p>'}
  ${list.length > ui.limit ? '<button class="btn" data-act="more">Pokaż więcej</button>' : ''}
  <div class="row-btns"><button class="btn ghost" data-act="export-csv">Eksportuj widoczne do CSV</button></div></section>`;
}

function viewReports() {
  const seg = `<div class="seg small">${[['miesiac', 'Miesiąc'], ['rok', 'Rok'], ['zakres', 'Własny okres']].map(([k, l]) => `<button data-report="${k}" class="${ui.report === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (ui.report === 'miesiac') {
    const cmp = compareMonth(fin, ui.month);
    const s = cmp.current;
    body = `${monthSwitcher(ui.month)}${kpis(s)}
    <section class="card"><h2>Kategorie: ten miesiąc vs poprzedni</h2>${cmp.rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Kategoria</th><th class="num">${esc(MONTHS_SHORT[Number(ui.month.slice(5, 7)) - 1])}</th><th class="num">Poprz.</th><th class="num">Śr. 3 mies.</th></tr></thead><tbody>${cmp.rows
      .map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num"><b>${zl0(r.current)}</b></td><td class="num ${r.current > r.previous ? 'neg' : 'pos'}">${zl0(r.previous)}</td><td class="num muted">${zl0(r.avg3)}</td></tr>`)
      .join('')}</tbody><tfoot><tr><td><b>Razem</b></td><td class="num"><b>${zl0(s.expense)}</b></td><td class="num">${zl0(cmp.previous.expense)}</td><td class="num muted"></td></tr></tfoot></table></div>` : '<p class="muted">Brak danych.</p>'}</section>
    <section class="card"><h2>Gdzie wydajesz najwięcej</h2>${s.topMerchants.length ? `<ul class="cat-list">${s.topMerchants.map((m) => `<li><div class="cat-row"><span>${esc(m.name)} <span class="muted small">× ${m.count}</span></span><b class="num">${zl(m.amount)}</b></div></li>`).join('')}</ul>` : '<p class="muted">Brak danych.</p>'}</section>
    ${s.incomeByCategory.length ? `<section class="card"><h2>Przychody</h2>${categoryList(s.incomeByCategory, s.income)}</section>` : ''}`;
  } else if (ui.report === 'rok') {
    const y = ui.year;
    const s = summarize(fin, `${y}-01-01`, `${y}-12-31`);
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = `${y}-${String(i + 1).padStart(2, '0')}`;
      const row = s.byMonth.find((x) => x.month === m) ?? { income: 0, expense: 0 };
      return { label: monthLabel(m), tick: MONTHS_SHORT[i], przychody: row.income, wydatki: row.expense };
    });
    const activeMonths = Math.max(1, s.byMonth.length);
    body = `<div class="month-switch"><button class="icon-btn" data-year="${Number(y) - 1}" aria-label="Poprzedni rok">‹</button><b>${esc(y)}</b><button class="icon-btn" data-year="${Number(y) + 1}" aria-label="Następny rok">›</button></div>${kpis(s)}
    <section class="card"><h2>Miesiąc po miesiącu</h2>${bars(months, { series: [{ key: 'przychody', name: 'Przychody', color: 'var(--pos)' }, { key: 'wydatki', name: 'Wydatki', color: 'var(--neg)' }] })}</section>
    <section class="card"><h2>Kategorie w roku</h2>${s.expense ? `<div class="donut-row">${donut(s.expenseByCategory, s.expense, `wydatki ${y}`)}<div class="grow">${categoryList(s.expenseByCategory, s.expense)}</div></div><p class="small muted">Średnio miesięcznie (${activeMonths} mies. z danymi): wydatki ${zl0(s.expense / activeMonths)}, przychody ${zl0(s.income / activeMonths)}.</p>` : '<p class="muted">Brak danych.</p>'}</section>`;
  } else {
    const s = summarize(fin, ui.from, ui.to);
    body = `<div class="dates"><label>Od <input type="date" id="r-from" value="${esc(ui.from)}"></label><label>Do <input type="date" id="r-to" value="${esc(ui.to)}"></label></div>${kpis(s)}
    ${s.byMonth.length > 1 ? `<section class="card"><h2>Miesiące</h2>${bars(s.byMonth.map((m) => ({ label: monthLabel(m.month), tick: `${MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1]}${m.month.endsWith('-01') ? ` ${m.month.slice(2, 4)}` : ''}`, przychody: m.income, wydatki: m.expense })), { series: [{ key: 'przychody', name: 'Przychody', color: 'var(--pos)' }, { key: 'wydatki', name: 'Wydatki', color: 'var(--neg)' }] })}</section>` : ''}
    <section class="card"><h2>Kategorie</h2>${s.expense ? `<div class="donut-row">${donut(s.expenseByCategory, s.expense, 'wydatki')}<div class="grow">${categoryList(s.expenseByCategory, s.expense)}</div></div>` : '<p class="muted">Brak danych.</p>'}</section>`;
  }
  return `<div class="card-head">${seg}</div>${body}`;
}

function viewAccounts() {
  const bal = balances(fin);
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  const form = (a = {}) => `<form class="acc-form" data-acc-form="${esc(a.id ?? '')}">
    <div class="two"><label class="field">Nazwa<input name="name" value="${esc(a.name ?? '')}" required placeholder="np. mBank – konto osobiste"></label><label class="field">Rodzaj<select name="type">${Object.entries(ACCOUNT_TYPES).map(([k, l]) => opt(k, l, a.type ?? 'bank')).join('')}</select></label></div>
    <div class="two"><label class="field">Saldo początkowe (zł)<input name="openingBalance" inputmode="decimal" value="${esc(a.openingBalance ?? '')}" placeholder="0,00"></label><label class="field">Na dzień<input type="date" name="openingDate" value="${esc(a.openingDate ?? today())}"></label></div>
    <label class="field">Karty Apple Pay przypisane do konta (nazwy z Portfela, po przecinku)<input name="cards" value="${esc((a.cards ?? []).join(', '))}" placeholder="np. mBank Visa, Debetowa 1234"></label>
    <div class="row-btns"><button class="btn primary" type="submit">${a.id ? 'Zapisz konto' : 'Dodaj konto'}</button>${a.id ? `<button class="btn ghost" type="button" data-archive-acc="${esc(a.id)}">${a.archived ? 'Przywróć' : 'Ukryj konto'}</button>` : ''}</div></form>`;
  return `<section class="card"><h2>Twoje konta</h2>${fin.accounts.length ? fin.accounts
    .map((a) => `<details class="acc ${a.archived ? 'muted' : ''}"><summary><span>${esc(a.name)} <span class="tag">${esc(ACCOUNT_TYPES[a.type] ?? '')}</span>${a.archived ? ' <span class="tag">ukryte</span>' : ''}</span><b class="num ${bal[a.id] < 0 ? 'neg' : ''}">${zl(bal[a.id])}</b></summary>${form(a)}</details>`)
    .join('') : '<p class="muted">Nie masz jeszcze kont. Dodaj pierwsze poniżej.</p>'}</section>
  <section class="card"><h2>Nowe konto</h2>${form()}<p class="small muted">Saldo bieżące = saldo początkowe + operacje od tego dnia. Przelewy między własnymi kontami nie są wydatkami.</p></section>`;
}

function viewSettings() {
  const catRows = (kind) =>
    fin.categories
      .filter((c) => c.kind === kind)
      .map((c) => `<div class="cat-edit ${c.archived ? 'muted' : ''}" data-cat-row="${esc(c.id)}"><input class="emoji" name="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="Ikona"><input name="name" value="${esc(c.name)}" aria-label="Nazwa"><input type="color" name="color" value="${esc(c.color)}" aria-label="Kolor">${kind === 'wydatek' ? `<input name="budget" inputmode="decimal" value="${esc(c.budget ?? '')}" placeholder="budżet/mies." aria-label="Budżet miesięczny">` : '<span></span>'}<button class="link" data-archive-cat="${esc(c.id)}">${c.archived ? 'Przywróć' : 'Ukryj'}</button></div>`)
      .join('');
  const catOptions = fin.categories.filter((c) => !c.archived).map((c) => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  return `<section class="card"><h2>Kategorie wydatków</h2><div class="cat-edits">${catRows('wydatek')}</div>
    <form class="row-btns" id="add-cat"><input name="emoji" class="emoji" value="🏷️" maxlength="4"><input name="name" placeholder="Nowa kategoria" required><select name="kind"><option value="wydatek">wydatek</option><option value="przychod">przychód</option></select><button class="btn" type="submit">Dodaj</button></form>
    <h2 style="margin-top:18px">Kategorie przychodów</h2><div class="cat-edits">${catRows('przychod')}</div>
    <p class="small muted">Budżet to miesięczny limit wydatków w kategorii (pasek w przeglądzie). Ukryte kategorie zostają w historii.</p></section>
  <section class="card"><h2>Reguły automatyczne</h2><p class="small muted">Gdy opis albo sprzedawca zawiera tekst, kategoria przypisze się sama (przy imporcie i z Apple Pay). Wielkość liter i polskie znaki nie mają znaczenia.</p>
    ${fin.rules.length ? `<ul class="cat-list">${fin.rules.map((r) => `<li><div class="cat-row"><span>„${esc(r.pattern)}” → ${catChip(r.categoryId)}</span><button class="link" data-del-rule="${esc(r.id)}">Usuń</button></div></li>`).join('')}</ul>` : ''}
    <form class="row-btns" id="add-rule"><input name="pattern" placeholder="np. biedronka" required><select name="categoryId">${catOptions}</select><button class="btn" type="submit">Dodaj regułę</button></form></section>
  <section class="card" id="applepay"><h2>Apple Pay na iPhonie (Skróty)</h2>
    <p>Po każdej płatności Apple Pay automatyzacja w aplikacji <b>Skróty</b> pokaże listę Twoich kategorii, a wybór zapisze w pliku na iPhonie (bez internetu). Plik wczytujesz tutaj jednym przyciskiem. Szczegółowa instrukcja jest w pliku FINANSE.md.</p>
    <ol class="steps-mini"><li>Pobierz listę kategorii i zapisz ją w Plikach: <i>Na moim iPhonie → GEM → kategorie.txt</i>.</li><li>W Skrótach utwórz automatyzację „Transakcja” (w iOS 26: „Portfel”) → dowolna karta → <i>Uruchom natychmiast</i>.</li><li>Akcje: <i>Pobierz plik</i> kategorie.txt → <i>Podziel tekst</i> (nowe wiersze) → <i>Wybierz z listy</i> → <i>Tekst</i>: Data ISO 8601;Kwota;Sprzedawca;Wybrany element;Karta → <i>Dołącz do pliku tekstowego</i> GEM/wydatki.txt.</li><li>Raz na jakiś czas: <b>Importuj wydatki.txt</b>. Duplikaty są pomijane automatycznie.</li></ol>
    <div class="row-btns"><button class="btn" data-act="dl-cats">Pobierz kategorie.txt</button><button class="btn primary" data-act="import-ap">Importuj wydatki.txt</button></div>
    <input type="file" id="ap-file" accept=".txt,text/plain,.csv" hidden>
    <details><summary>Wklej wpisy ręcznie</summary><textarea id="ap-paste" rows="4" placeholder="2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa"></textarea><button class="btn" data-act="paste-ap">Dodaj wklejone</button></details></section>
  <section class="card" id="csv"><h2>Import wyciągu z banku (CSV)</h2><p class="small muted">Pobierz historię w formacie CSV z bankowości internetowej (mBank, PKO, ING, Santander, Pekao i inne), a potem wybierz plik. Kolumny rozpoznam sam, a Ty możesz je poprawić. Plik nie opuszcza urządzenia.</p>
    <div class="row-btns"><button class="btn" data-act="pick-csv">Wybierz plik CSV</button></div><input type="file" id="csv-file" accept=".csv,text/csv,text/plain" hidden><div id="csv-map">${csvMapping()}</div></section>
  <section class="card"><h2>Kopia zapasowa</h2><p class="small muted">Dane są tylko w tej przeglądarce. Rób kopię co jakiś czas i zapisuj ją w Plikach. Usunięcie danych witryny w ustawieniach Safari usunie też dziennik.</p>
    <div class="row-btns"><button class="btn" data-act="backup">Eksportuj kopię (JSON)</button><button class="btn" data-act="restore">Wczytaj kopię</button></div><input type="file" id="restore-file" accept="application/json,.json" hidden>
    <details class="danger"><summary>Usuń wszystkie dane dziennika</summary><p class="small">Tej operacji nie można cofnąć. Najpierw wyeksportuj kopię.</p><button class="btn danger" data-act="wipe">Usuń dziennik</button></details></section>`;
}

function csvMapping() {
  const c = ui.csv;
  if (!c) return '';
  const header = c.rows[c.mapping.headerRow] ?? c.rows[0];
  const sel = (key, label, allowNone) => `<label class="field">${label}<select data-map="${key}">${allowNone ? `<option value="-1" ${c.mapping[key] === -1 ? 'selected' : ''}>— brak —</option>` : ''}${header.map((h, i) => `<option value="${i}" ${c.mapping[key] === i ? 'selected' : ''}>${esc(h || `kolumna ${i + 1}`)}</option>`).join('')}</select></label>`;
  const { txs, errors } = csvToTxs(c.rows, c.mapping, { accountId: c.accountId || null, fin });
  return `<p class="small">Plik: <b>${esc(c.name)}</b> · ${c.rows.length} wierszy · kodowanie ${esc(c.encoding)} · nagłówek w wierszu ${c.mapping.headerRow + 1}</p>
  <div class="two">${sel('date', 'Data')}${sel('amount', 'Kwota')}</div><div class="two">${sel('description', 'Opis', true)}${sel('counterparty', 'Kontrahent', true)}</div>
  <label class="field">Konto<select data-map="account"><option value="">— bez konta —</option>${fin.accounts.map((a) => `<option value="${esc(a.id)}" ${c.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
  <p class="small muted">Podgląd (${txs.length} operacji${errors.length ? `, ${errors.length} pominiętych` : ''}):</p>
  <div>${txs.slice(0, 5).map((t) => txRow({ ...t, id: '' })).join('')}</div>
  <div class="row-btns"><button class="btn primary" data-act="import-csv" ${txs.length ? '' : 'disabled'}>Importuj ${txs.length} operacji</button><button class="btn ghost" data-act="cancel-csv">Anuluj</button></div>`;
}

// ---------- Render i zdarzenia ----------
function render() {
  for (const b of $$('#fin-nav button')) b.classList.toggle('on', b.dataset.view === ui.view);
  const root = $('#fin-root');
  root.innerHTML = ui.inbox ? viewInbox() : { przeglad: viewOverview, transakcje: viewTransactions, raporty: viewReports, konta: viewAccounts, ustawienia: viewSettings }[ui.view]();
  for (const w of $$('.bars-wrap', root)) w.scrollLeft = w.scrollWidth; // najnowsze dni widoczne od razu
}

function setView(v) {
  ui.view = v;
  ui.inbox = false;
  render();
  window.scrollTo({ top: 0 });
}

$('#fin-nav').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-view]');
  if (b) setView(b.dataset.view);
});

$('#fin-root').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.view) return setView(d.view);
  if (d.month) {
    ui.month = d.month;
    return render();
  }
  if (d.year) {
    ui.year = d.year;
    return render();
  }
  if (d.report) {
    ui.report = d.report;
    return render();
  }
  if (d.edit) return openTx(fin.txs.find((t) => t.id === d.edit));
  if (d.assign) {
    const t = fin.txs.find((x) => x.id === d.assign);
    const remember = $(`[data-remember="${CSS.escape(d.assign)}"]`)?.checked;
    t.categoryId = d.cat;
    t.updatedAt = Date.now();
    if (remember && t.merchant) {
      const pattern = rulePatternFor(t.merchant);
      if (!fin.rules.some((r) => r.pattern.toLowerCase() === pattern.toLowerCase())) fin.rules.push({ id: newId(), pattern, categoryId: d.cat });
      for (const o of liveTx(fin)) if (!o.categoryId && o.merchant && applyRules(o.merchant, [{ pattern, categoryId: d.cat }])) o.categoryId = d.cat;
    }
    save();
    return render();
  }
  if (d.archiveAcc) {
    const a = acc(d.archiveAcc);
    a.archived = !a.archived;
    save();
    return render();
  }
  if (d.archiveCat) {
    const c = cat(d.archiveCat);
    c.archived = !c.archived;
    save();
    return render();
  }
  if (d.delRule) {
    fin.rules = fin.rules.filter((r) => r.id !== d.delRule);
    save();
    return render();
  }
  const act = d.act;
  if (act === 'add') openTx(null);
  else if (act === 'inbox') {
    ui.inbox = true;
    render();
  } else if (act === 'inbox-close') {
    ui.inbox = false;
    render();
  } else if (act === 'more') {
    ui.limit += 200;
    render();
  } else if (act === 'export-csv') {
    const rows = filteredTxs().map((t) => [t.date, t.time ?? '', FIN_TYPES[t.type], t.type === 'wydatek' ? -t.amount : t.amount, cat(t.categoryId)?.name ?? '', acc(t.accountId)?.name ?? '', t.merchant ?? '', t.note ?? '']);
    const csv = [['data', 'godzina', 'typ', 'kwota', 'kategoria', 'konto', 'sprzedawca', 'notatka'], ...rows].map((r) => r.map((c) => (typeof c === 'number' ? String(c).replace('.', ',') : /[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\n');
    download(`wydatki-${today()}.csv`, `﻿${csv}`, 'text/csv');
  } else if (act === 'dl-cats') download('kategorie.txt', shortcutCategoriesText(fin), 'text/plain');
  else if (act === 'import-ap') $('#ap-file').click();
  else if (act === 'paste-ap') importShortcutText($('#ap-paste').value, 'wklejonego tekstu');
  else if (act === 'pick-csv') $('#csv-file').click();
  else if (act === 'cancel-csv') {
    ui.csv = null;
    render();
  } else if (act === 'import-csv') {
    const { txs } = csvToTxs(ui.csv.rows, ui.csv.mapping, { accountId: ui.csv.accountId || null, fin });
    const r = mergeImported(fin, txs, { newId });
    fin = r.fin;
    save();
    ui.csv = null;
    toast(`Dodano ${r.added} operacji${r.skipped ? `, pominięto ${r.skipped} duplikatów${r.crossSource ? ` (w tym ${r.crossSource} zapisanych już z Apple Pay)` : ''}` : ''}.`);
    render();
  } else if (act === 'backup') download(`dziennik-finansowy-${today()}.json`, JSON.stringify(fin, null, 1), 'application/json');
  else if (act === 'restore') $('#restore-file').click();
  else if (act === 'wipe') {
    fin = emptyFinance();
    save();
    toast('Dziennik wyczyszczony.');
    setView('przeglad');
  }
});

$('#fin-root').addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'f-account') ui.account = el.value;
  else if (el.id === 'f-category') ui.category = el.value;
  else if (el.id === 'f-type') ui.type = el.value;
  else if (el.id === 'r-from') ui.from = el.value;
  else if (el.id === 'r-to') ui.to = el.value;
  else if (el.dataset.map) {
    if (el.dataset.map === 'account') ui.csv.accountId = el.value;
    else ui.csv.mapping[el.dataset.map] = Number(el.value);
    $('#csv-map').innerHTML = csvMapping();
    return;
  } else if (el.closest('[data-cat-row]')) {
    const c = cat(el.closest('[data-cat-row]').dataset.catRow);
    if (el.name === 'budget') c.budget = el.value.trim() === '' ? null : Math.abs(parseAmount(el.value)) || null;
    else if (el.name) c[el.name] = el.value.trim() || c[el.name];
    save();
    return;
  } else if (el.id === 'ap-file' && el.files[0]) {
    return importShortcutText(await el.files[0].text(), el.files[0].name);
  } else if (el.id === 'csv-file' && el.files[0]) {
    const f = el.files[0];
    const buf = await f.arrayBuffer();
    let text;
    let encoding = 'UTF-8';
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1250').decode(buf);
      encoding = 'Windows-1250';
    }
    const { rows } = parseCsv(text.replace(/^﻿/, ''));
    ui.csv = { name: f.name, rows, mapping: guessMapping(rows), accountId: fin.accounts[0]?.id ?? '', encoding };
    if (ui.csv.mapping.headerRow < 0) ui.csv.mapping.headerRow = 0;
    $('#csv-map').innerHTML = csvMapping();
    return;
  } else if (el.id === 'restore-file' && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (data?.version !== 1 || !Array.isArray(data.txs)) throw new Error('to nie jest kopia dziennika');
      fin = { ...emptyFinance(), ...data };
      save();
      toast(`Wczytano kopię: ${liveTx(fin).length} operacji.`);
      setView('przeglad');
    } catch (err) {
      toast(`Nie udało się wczytać kopii: ${err.message}`);
    }
    return;
  } else return;
  render();
});

$('#fin-root').addEventListener('input', (ev) => {
  if (ev.target.id === 'f-q') {
    ui.q = ev.target.value;
    clearTimeout(ui.qt);
    ui.qt = setTimeout(() => {
      render();
      const q = $('#f-q');
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }, 250);
  }
});

$('#fin-root').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.dataset.accForm !== undefined) {
    const data = Object.fromEntries(new FormData(f));
    const id = f.dataset.accForm || newId();
    const prev = acc(id);
    const a = { ...(prev ?? {}), id, name: data.name.trim(), type: data.type, openingBalance: parseAmount(data.openingBalance || '0') || 0, openingDate: data.openingDate || today(), cards: data.cards.split(',').map((x) => x.trim()).filter(Boolean) };
    if (!a.name) return toast('Podaj nazwę konta.');
    fin.accounts = prev ? fin.accounts.map((x) => (x.id === id ? a : x)) : [...fin.accounts, a];
    save();
    toast(prev ? 'Zapisano konto.' : 'Dodano konto.');
    render();
  } else if (f.id === 'add-cat') {
    const data = Object.fromEntries(new FormData(f));
    if (!data.name.trim()) return;
    fin.categories.push({ id: newId(), name: data.name.trim(), emoji: data.emoji || '🏷️', kind: data.kind, color: nextColor(fin.categories.length), budget: null });
    save();
    render();
  } else if (f.id === 'add-rule') {
    const data = Object.fromEntries(new FormData(f));
    if (!data.pattern.trim()) return;
    fin.rules.push({ id: newId(), pattern: data.pattern.trim(), categoryId: data.categoryId });
    save();
    render();
  }
});

function importShortcutText(text, source) {
  const { txs, errors } = parseShortcutLog(text, fin);
  const r = mergeImported(fin, txs, { newId });
  fin = r.fin;
  save();
  toast(`Z ${source}: dodano ${r.added}${r.skipped ? `, pominięto ${r.skipped} już zapisanych` : ''}${errors.length ? `, ${errors.length} wierszy z błędem` : ''}.`);
  if (txs.some((t) => !t.categoryId)) ui.inbox = true;
  render();
}

// ---------- Okno operacji ----------
function catGrid(kind, selected) {
  return fin.categories
    .filter((c) => c.kind === kind && !c.archived)
    .map((c) => `<button type="button" class="cat-pick ${c.id === selected ? 'on' : ''}" style="--c:${esc(c.color)}" data-pick="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`)
    .join('');
}

function openTx(t, prefill = {}) {
  const dlg = $('#fin-dialog');
  const f = $('form', dlg);
  const tx = t ?? { type: 'wydatek', date: today(), accountId: fin.accounts.find((a) => !a.archived)?.id ?? '', categoryId: null, ...prefill };
  f.dataset.id = t?.id ?? '';
  f.dataset.cat = tx.categoryId ?? '';
  $('#fd-title').textContent = t ? 'Edytuj operację' : 'Nowa operacja';
  for (const r of f.elements.type) r.checked = r.value === tx.type;
  f.elements.amount.value = tx.amount ? String(tx.amount).replace('.', ',') : '';
  f.elements.date.value = tx.date;
  f.elements.merchant.value = tx.merchant ?? '';
  f.elements.note.value = tx.note ?? '';
  const opts = (sel) => `<option value="">— bez konta —</option>${fin.accounts.filter((a) => !a.archived || a.id === sel).map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}`;
  f.elements.accountId.innerHTML = opts(tx.accountId);
  f.elements.toAccountId.innerHTML = opts(tx.toAccountId);
  f.elements.remember.checked = false;
  $('#fd-delete').hidden = !t;
  $('#fd-errors').textContent = '';
  syncTxForm();
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
  if (!t) setTimeout(() => f.elements.amount.focus(), 50);
}

function syncTxForm() {
  const f = $('#fin-dialog form');
  const type = f.elements.type.value;
  $('#fd-cats').innerHTML = type === 'przelew' ? '' : catGrid(type === 'przychod' ? 'przychod' : 'wydatek', f.dataset.cat);
  $('#fd-to').hidden = type !== 'przelew';
  $('#fd-cats-wrap').hidden = type === 'przelew';
}

function closeTx() {
  const dlg = $('#fin-dialog');
  dlg.close ? dlg.close() : dlg.removeAttribute('open');
}

(() => {
  const dlg = $('#fin-dialog');
  const f = $('form', dlg);
  f.addEventListener('change', (ev) => ev.target.name === 'type' && syncTxForm());
  $('#fd-cats').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pick]');
    if (!b) return;
    f.dataset.cat = b.dataset.pick;
    syncTxForm();
  });
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const prev = fin.txs.find((x) => x.id === f.dataset.id);
    const t = {
      ...(prev ?? {}),
      id: prev?.id ?? newId(),
      type: f.elements.type.value,
      amount: Math.abs(parseAmount(f.elements.amount.value)),
      date: f.elements.date.value,
      accountId: f.elements.accountId.value || null,
      toAccountId: f.elements.type.value === 'przelew' ? f.elements.toAccountId.value || null : undefined,
      categoryId: f.elements.type.value === 'przelew' ? null : f.dataset.cat || null,
      merchant: f.elements.merchant.value.trim(),
      note: f.elements.note.value.trim() || undefined,
      source: prev?.source ?? 'reczne',
      createdAt: prev?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    const errors = validateFinTx(t, fin);
    if (errors.length) {
      $('#fd-errors').textContent = errors.join(' ');
      return;
    }
    if (f.elements.remember.checked && t.merchant && t.categoryId) fin.rules.push({ id: newId(), pattern: rulePatternFor(t.merchant), categoryId: t.categoryId });
    fin.txs = prev ? fin.txs.map((x) => (x.id === t.id ? t : x)) : [...fin.txs, t];
    save();
    closeTx();
    toast(prev ? 'Zapisano zmiany.' : `Dodano: ${zl(t.amount)}.`);
    render();
  });
  $('#fd-delete').addEventListener('click', () => {
    const t = fin.txs.find((x) => x.id === f.dataset.id);
    if (t) {
      t.deleted = true;
      t.updatedAt = Date.now();
      save();
    }
    closeTx();
    render();
    toast('Usunięto operację.');
  });
  $('#fd-cancel').addEventListener('click', closeTx);
})();

$('#fab').addEventListener('click', () => openTx(null));

// Szybkie dodawanie z adresu (np. ze Skrótu w Safari): finanse.html#dodaj?kwota=45,20&sprzedawca=Biedronka&kategoria=Zakupy
function handleHash() {
  const m = location.hash.match(/^#dodaj\??(.*)$/);
  if (!m) return;
  const p = new URLSearchParams(m[1]);
  const when = parseDate(p.get('data') ?? '') ?? { date: today() };
  const amount = Math.abs(parseAmount(p.get('kwota') ?? ''));
  const category = findCategory(fin.categories, p.get('kategoria') ?? '');
  const merchant = p.get('sprzedawca') ?? '';
  history.replaceState(null, '', location.pathname);
  const tx = { type: 'wydatek', amount: Number.isFinite(amount) ? amount : undefined, date: when.date, merchant, categoryId: category?.id ?? applyRules(merchant, fin.rules), accountId: accountForCard(fin.accounts, p.get('karta') ?? '') ?? fin.accounts[0]?.id ?? '' };
  if (p.get('zapisz') === '1' && amount > 0) {
    const r = mergeImported(fin, [{ ...tx, time: when.time, source: 'applepay', importKey: `ap|${when.date}|${when.time ?? ''}|${amount.toFixed(2)}|${merchant.toLowerCase()}` }], { newId });
    fin = r.fin;
    save();
    toast(r.added ? `Zapisano ${zl(amount)} – ${merchant}.` : 'Ta płatność była już zapisana.');
    render();
  } else openTx(null, tx);
}
window.addEventListener('hashchange', handleHash);

render();
handleHash();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
