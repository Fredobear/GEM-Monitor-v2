// Interfejs dziennika finansowego. Dane są zapisywane wyłącznie w tej przeglądarce (localStorage).
// Strona ma zablokowane połączenia sieciowe (Content-Security-Policy: connect-src 'none'), więc nie może ich nigdzie wysłać.
// Korzysta z funkcji z finance-core.js i mmbackup.js (wklejonych wyżej w tym samym skrypcie).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NF0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tidy = (x) => (Math.abs(x) < 0.005 ? 0 : x);
const zl = (x) => `${NF2.format(tidy(x))} zł`;
const zl0 = (x) => `${NF0.format(Math.round(tidy(x)))} zł`;
const money = (x, cur) => (!cur || cur === 'PLN' ? zl(x) : `${NF2.format(tidy(x))} ${cur}`);
const signed = (x) => `${x < -0.004 ? '−' : '+'}${zl(Math.abs(x))}`;
const pct = (x) => (x === null || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`);
const compact = (x) => (x >= 10000 ? `${NF0.format(Math.round(x / 1000))} tys.` : NF0.format(Math.round(x)));
const round2 = (x) => Math.round(x * 100) / 100;
const fmtInput = (x) => (Number.isFinite(x) && Math.abs(x) >= 0.005 ? String(round2(x)).replace('.', ',') : '');
const plural = (n, one, few, many) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const MONTHS_GEN = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const DOW = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DOW_SHORT = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const DOW_HEAD = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dowOf = (iso) => new Date(`${iso}T12:00:00`).getDay();
const thisYear = (iso) => iso.slice(0, 4) === today().slice(0, 4);
const monthLabel = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayLabel = (iso) => `${DOW[dowOf(iso)]}, ${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}${thisYear(iso) ? '' : ` ${iso.slice(0, 4)}`}`;
const shortDate = (iso, withYear = !thisYear(iso)) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}${withYear ? ` ${iso.slice(0, 4)}` : ''}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const byNewest = (a, b) => (a.date === b.date ? (b.time ?? '').localeCompare(a.time ?? '') || (b.createdAt ?? 0) - (a.createdAt ?? 0) : a.date < b.date ? 1 : -1);
const sumOf = (list, type) => list.reduce((s, t) => s + (t.type === type ? t.amount : 0), 0);

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
    toast('Nie udało się zapisać danych. Zrób kopię zapasową (Więcej → Kopia).');
  }
  if (!persisted && navigator.storage?.persist) {
    persisted = true;
    navigator.storage.persist().catch(() => {});
  }
}

const ui = {
  view: 'przeglad',
  period: 'miesiac',
  anchor: today(),
  from: `${today().slice(0, 7)}-01`,
  to: today(),
  kind: 'wydatek',
  openCat: null,
  calMonth: today().slice(0, 7),
  calDay: today(),
  q: '',
  account: '',
  category: '',
  type: '',
  limit: 120,
  setTab: 'kategorie',
  csv: null,
  mm: null,
  inbox: false,
  notice: '',
  day: today(),
};

function toast(text, ms = 3500) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
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

// Przycisk wymagający drugiego dotknięcia (usuwanie, nadpisanie danych).
function armed(btn, label) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = btn.textContent;
  btn.textContent = label;
  clearTimeout(btn.armTimer);
  btn.armTimer = setTimeout(() => disarm(btn), 3500);
  return false;
}
function disarm(btn) {
  if (!btn.dataset.armed) return;
  btn.textContent = btn.dataset.armed;
  delete btn.dataset.armed;
}

const cat = (id) => fin.categories.find((c) => c.id === id);
const acc = (id) => fin.accounts.find((a) => a.id === id);
const activeAccounts = () => fin.accounts.filter((a) => !a.archived);
const NONE_CAT = { name: 'Do przypisania', emoji: '❓', color: '#94a3b8' };
const TYPE_SIGN = { wydatek: '−', przychod: '+', przelew: '' };
const TYPE_CLASS = { wydatek: '', przychod: 'pos', przelew: 'muted' };
const accIcon = (a) => ACCOUNT_ICONS[a?.type] ?? '👛';
const colorVar = (c) => (c ? `--c:${esc(c)}` : '');

// Ikona i kolor operacji albo stałej pozycji.
function look(item, { recurring = false } = {}) {
  if (item.type === 'przelew') return { icon: isCard(acc(item.toAccountId)) ? '💳' : '⇄', color: '#64748b' };
  const c = cat(item.categoryId);
  if (c) return { icon: c.emoji, color: c.color };
  return recurring ? { icon: '🔁', color: '#64748b' } : { icon: NONE_CAT.emoji, color: NONE_CAT.color };
}

function defaultAccount(type) {
  const list = activeAccounts();
  if (type === 'wydatek' && list.some((a) => a.id === fin.lastAccountId)) return fin.lastAccountId;
  return (list.find((a) => !isCard(a)) ?? list[0])?.id ?? '';
}

function accountOptions(selected, { none = true, filter = () => true } = {}) {
  const bal = balances(fin);
  const list = fin.accounts.filter((a) => (!a.archived || a.id === selected) && filter(a));
  return `${none ? '<option value="">— bez konta —</option>' : ''}${list
    .map((a) => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(accIcon(a))} ${esc(a.name)} (${esc(money(bal[a.id], a.currency))})</option>`)
    .join('')}`;
}

// ---------- Wykresy (SVG) ----------
function donut(items, total, label) {
  const R = 66;
  const W = 20;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const parts = items.filter((i) => i.amount > 0);
  const segs = total > 0
    ? parts
        .map((i) => {
          const len = (i.amount / total) * C;
          const gap = parts.length > 1 ? Math.min(1.5, len / 3) : 0;
          const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${esc(i.color)}" stroke-width="${W}" stroke-dasharray="${(len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(i.name)}: ${zl(i.amount)}</title></circle>`;
          offset += len;
          return s;
        })
        .join('')
    : '';
  return `<svg class="donut" viewBox="0 0 180 180" role="img" aria-label="${esc(label)}: ${esc(zl(total))}"><circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--line)" stroke-width="${W}"/>${segs}<text x="90" y="88" text-anchor="middle" class="donut-v">${esc(zl0(total))}</text><text x="90" y="107" text-anchor="middle" class="donut-l">${esc(label)}</text></svg>`;
}

// Do 16 słupków wykres mieści się na szerokość ekranu; dłuższe przewijają się poziomo.
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

// ---------- Wiersze list ----------
function txRow(t) {
  const { icon, color } = look(t);
  const c = cat(t.categoryId);
  const title = t.merchant || (t.type === 'przelew' ? 'Przelew' : c?.name ?? 'Bez opisu');
  const where =
    t.type === 'przelew'
      ? `${acc(t.accountId)?.name ?? '?'} → ${acc(t.toAccountId)?.name ?? '?'}`
      : [t.merchant || !c ? c?.name ?? NONE_CAT.name : '', acc(t.accountId)?.name].filter(Boolean).join(' · ');
  const src = { applepay: 'Apple Pay', csv: 'import', stale: 'stała' }[t.source];
  const extra = t.accountAmount !== undefined ? `<small>${esc(money(t.accountAmount, acc(t.accountId)?.currency))}</small>` : t.time ? `<small>${esc(t.time)}</small>` : '';
  return `<button class="ftx" data-edit="${esc(t.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(title)}</b><small>${esc([where, src].filter(Boolean).join(' · '))}</small></span><span class="ftx-amt ${TYPE_CLASS[t.type]}">${TYPE_SIGN[t.type]}${esc(zl(t.amount))}${extra}</span></button>`;
}

function planRow({ rec, date }) {
  const { icon, color } = look(rec, { recurring: true });
  return `<button class="ftx plan" data-edit-rec="${esc(rec.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(rec.title)}</b><small>${esc(shortDate(date))} · ${esc(FREQS[rec.freq] ?? '')}${rec.auto ? '' : ' · z potwierdzeniem'}</small></span><span class="ftx-amt">${TYPE_SIGN[rec.type]}${esc(zl(rec.amount))}</span></button>`;
}

function pendRow({ rec, date }) {
  const { icon, color } = look(rec, { recurring: true });
  return `<div class="pend-row"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="pend-main"><b>${esc(rec.title)}</b><small>termin ${esc(shortDate(date))} · ${esc(FREQS[rec.freq] ?? '')}</small></span><span class="pend-amt ${TYPE_CLASS[rec.type]}">${TYPE_SIGN[rec.type]}${esc(zl(rec.amount))}</span><span class="pend-btns"><button class="btn small primary" data-settle="${esc(rec.id)}" data-post="1">Zapisz</button><button class="btn small ghost" data-settle="${esc(rec.id)}" data-post="0">Pomiń ten termin</button></span></div>`;
}

// ---------- Przegląd ----------
const PERIODS = [['dzien', 'Dzień'], ['tydzien', 'Tydzień'], ['miesiac', 'Miesiąc'], ['rok', 'Rok'], ['okres', 'Okres']];

function currentRange() {
  if (ui.period === 'okres') return ui.from <= ui.to ? { from: ui.from, to: ui.to } : { from: ui.to, to: ui.from };
  return periodRange(ui.period, ui.anchor);
}

function periodLabel() {
  const a = ui.anchor;
  if (ui.period === 'dzien') return `${a === today() ? 'dziś' : DOW_SHORT[dowOf(a)]}, ${shortDate(a, true)}`;
  if (ui.period === 'tydzien') {
    const { from, to } = periodRange('tydzien', a);
    return `${shortDate(from, from.slice(0, 4) !== to.slice(0, 4))} – ${shortDate(to, true)}`;
  }
  if (ui.period === 'rok') return a.slice(0, 4);
  return monthLabel(a.slice(0, 7));
}

function periodControls() {
  const seg = `<div class="seg small period-seg" role="tablist">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${ui.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  if (ui.period === 'okres') return `<div class="period">${seg}<div class="dates"><label>Od <input type="date" id="p-from" value="${esc(ui.from)}"></label><label>Do <input type="date" id="p-to" value="${esc(ui.to)}"></label></div></div>`;
  const { from, to } = currentRange();
  const t = today();
  const away = t < from || t > to;
  return `<div class="period">${seg}<div class="pswitch"><button class="icon-btn" data-shift="-1" aria-label="Wcześniej">‹</button><b>${esc(periodLabel())}</b><button class="icon-btn" data-shift="1" aria-label="Później">›</button></div>${away ? '<div class="back-today"><button class="link small" data-act="period-today">wróć do dziś</button></div>' : ''}</div>`;
}

function heroBalance() {
  if (!activeAccounts().length) return '';
  const nw = netWorth(fin);
  return `<button class="card hero-bal" data-view="konta"><span class="hb-main"><span class="muted small">Saldo wszystkich kont</span><span class="hb-val ${nw.total < -0.004 ? 'neg' : ''}">${esc(zl(nw.total))}</span>${nw.debt > 0.004 ? `<span class="small muted">w tym zadłużenie: <b class="neg">−${esc(zl(nw.debt))}</b></span>` : ''}</span><span class="hb-chev" aria-hidden="true">›</span></button>`;
}

function alerts() {
  const out = [];
  if (ui.notice) out.push(`<div class="banner good">${esc(ui.notice)}</div>`);
  const n = liveTx(fin).filter((t) => t.type !== 'przelew' && !t.categoryId).length;
  if (n) out.push(`<div class="banner warn"><b>${n} ${plural(n, 'operacja czeka', 'operacje czekają', 'operacji czeka')} na kategorię.</b> <button class="link" data-act="inbox">Przypisz teraz</button></div>`);
  const due = dueRecurring(fin, today());
  if (due.length) out.push(`<section class="card pend"><h2>Stałe pozycje do zatwierdzenia</h2>${due.map(pendRow).join('')}</section>`);
  const bal = balances(fin);
  for (const a of activeAccounts()) {
    const d = cardDue(a, bal[a.id], today());
    if (d && d.days <= 5) {
      const when = d.days === 0 ? 'dziś' : d.days === 1 ? 'jutro' : `za ${d.days} dni (${shortDate(d.due)})`;
      out.push(`<div class="banner info">💳 <b>${esc(a.name)}</b>: termin spłaty ${esc(when)}. Zadłużenie ${esc(zl(-bal[a.id]))}. <button class="link" data-repay="${esc(a.id)}">Spłać teraz</button></div>`);
    }
  }
  return out.join('');
}

function categoryRows(list, from, to) {
  const exp = ui.kind === 'wydatek';
  if (!list.length) return `<p class="muted center">Brak ${exp ? 'wydatków' : 'przychodów'} w tym okresie.</p>`;
  const monthly = exp && ui.period === 'miesiac';
  return `<ul class="cat-rows">${list
    .map((c) => {
      const key = c.id ?? '_none';
      const open = ui.openCat === key;
      const budget = monthly && c.budget ? c.budget : null;
      const over = budget && c.amount > budget;
      const fill = budget ? Math.min(1, c.amount / budget) : c.share;
      const note = budget ? `<small class="${over ? 'neg' : 'muted'}">${over ? `budżet ${zl0(budget)} przekroczony o ${zl0(c.amount - budget)}` : `budżet ${zl0(budget)} · zostało ${zl0(budget - c.amount)}`}</small>` : '';
      let txs = '';
      if (open) {
        const list = liveTx(fin)
          .filter((t) => t.type === ui.kind && t.date >= from && t.date <= to && (key === '_none' ? !t.categoryId : t.categoryId === key))
          .sort(byNewest);
        txs = `<div class="cat-tx">${list.slice(0, 30).map(txRow).join('')}${list.length > 30 ? `<button class="link small" data-cat-all="${esc(key)}">Pokaż wszystkie (${list.length})</button>` : ''}</div>`;
      }
      return `<li><button class="cat-line" data-open-cat="${esc(key)}" aria-expanded="${open}" style="${colorVar(c.color)}"><span class="cat-ico">${esc(c.emoji)}</span><span class="cat-name"><b>${esc(c.name)}</b><span class="cat-bar"><span style="width:${(fill * 100).toFixed(1)}%${over ? ';background:var(--neg)' : ''}"></span></span>${note}</span><span class="cat-amt"><b>${esc(zl(c.amount))}</b><small>${pct(c.share)}</small></span></button>${txs}</li>`;
    })
    .join('')}</ul>`;
}

function reportCards(s) {
  const out = [];
  const series = [{ key: 'przychody', name: 'Przychody', color: 'var(--pos)' }, { key: 'wydatki', name: 'Wydatki', color: 'var(--neg)' }];
  if (ui.period === 'miesiac') {
    const month = ui.anchor.slice(0, 7);
    const cmp = compareMonth(fin, month);
    if (cmp.rows.length)
      out.push(`<section class="card"><h2>Kategorie w porównaniu z poprzednim miesiącem</h2><div class="tbl-wrap"><table><thead><tr><th>Kategoria</th><th class="num">${esc(MONTHS_SHORT[Number(month.slice(5, 7)) - 1])}</th><th class="num">Poprz.</th><th class="num">Śr. 3 mies.</th></tr></thead><tbody>${cmp.rows
        .map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num"><b>${zl0(r.current)}</b></td><td class="num ${r.current > r.previous ? 'neg' : 'pos'}">${zl0(r.previous)}</td><td class="num muted">${zl0(r.avg3)}</td></tr>`)
        .join('')}</tbody><tfoot><tr><td><b>Razem</b></td><td class="num"><b>${zl0(cmp.current.expense)}</b></td><td class="num">${zl0(cmp.previous.expense)}</td><td></td></tr></tfoot></table></div></section>`);
  }
  if (ui.period === 'rok') {
    const y = ui.anchor.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = `${y}-${String(i + 1).padStart(2, '0')}`;
      const row = s.byMonth.find((x) => x.month === m) ?? { income: 0, expense: 0 };
      return { label: monthLabel(m), tick: MONTHS_SHORT[i], przychody: row.income, wydatki: row.expense };
    });
    const n = Math.max(1, s.byMonth.length);
    out.push(`<section class="card"><h2>Miesiąc po miesiącu</h2>${bars(months, { series })}<p class="small muted">Średnio miesięcznie (${n} mies. z danymi): wydatki ${zl0(s.expense / n)}, przychody ${zl0(s.income / n)}.</p></section>`);
  }
  if (ui.period === 'okres' && s.byMonth.length > 1)
    out.push(`<section class="card"><h2>Miesiące</h2>${bars(
      s.byMonth.map((m) => ({ label: monthLabel(m.month), tick: `${MONTHS_SHORT[Number(m.month.slice(5, 7)) - 1]}${m.month.endsWith('-01') ? ` ${m.month.slice(2, 4)}` : ''}`, przychody: m.income, wydatki: m.expense })),
      { series },
    )}</section>`);
  if (s.topMerchants.length)
    out.push(`<section class="card"><h2>Gdzie wydajesz najwięcej</h2><ul class="cat-list">${s.topMerchants.map((m) => `<li><div class="cat-row"><span>${esc(m.name)} <span class="muted small">× ${m.count}</span></span><b class="num">${esc(zl(m.amount))}</b></div></li>`).join('')}</ul></section>`);
  return out.join('');
}

function onboarding() {
  return `<section class="card empty"><div class="empty-icon">👋</div><h2 class="h2-plain">Twój dziennik finansowy</h2>
  <p>Zapisuj wydatki i przychody, sprawdzaj je w kalendarzu i w raportach, ustaw stałe płatności i pilnuj zadłużenia kart. Wszystko zostaje na tym urządzeniu.</p>
  <div class="start-grid">
   <button class="start" data-act="add-acc"><span>🏦</span><b>Dodaj konto</b><small>konto w banku, kartę kredytową, gotówkę</small></button>
   <button class="start" data-goto="import"><span>📦</span><b>Przenieś dane z Money Managera</b><small>plik .mmbackup z aplikacji Orange Dog</small></button>
   <button class="start" data-act="add-exp"><span>➖</span><b>Dodaj wydatek</b><small>konta możesz dodać później</small></button>
  </div></section>`;
}

function viewOverview() {
  if (!fin.accounts.length && !liveTx(fin).length && !fin.recurring.length) return `${ui.notice ? alerts() : ''}${onboarding()}`;
  const { from, to } = currentRange();
  const s = summarize(fin, from, to);
  const exp = ui.kind === 'wydatek';
  const list = exp ? s.expenseByCategory : s.incomeByCategory;
  const total = exp ? s.expense : s.income;
  const net = s.income > 0 ? (s.net >= 0 ? ` <span class="muted">· zostaje ${pct(s.savingsRate)} przychodów</span>` : ' <span class="muted">· wydatki większe niż przychody</span>') : '';
  return `${heroBalance()}${alerts()}
  <section class="card">
    ${periodControls()}
    <div class="kind-toggle"><button class="exp ${exp ? 'on' : ''}" data-kind="wydatek"><span>Wydatki</span><b>${esc(zl(s.expense))}</b></button><button class="inc ${exp ? '' : 'on'}" data-kind="przychod"><span>Przychody</span><b>${esc(zl(s.income))}</b></button></div>
    <div class="net-line">Bilans: <b class="${s.net >= 0 ? 'pos' : 'neg'}">${esc(signed(s.net))}</b>${net}</div>
    ${donut(list, total, exp ? 'wydatki' : 'przychody')}
    <div class="big-btns"><button class="big-btn exp" data-act="add-exp"><i>−</i>Wydatek</button><button class="big-btn inc" data-act="add-inc"><i>+</i>Przychód</button></div>
    ${categoryRows(list, from, to)}
  </section>
  ${reportCards(s)}`;
}

// ---------- Kalendarz ----------
function viewCalendar() {
  const month = ui.calMonth;
  const t = today();
  const cal = calendarMonth(fin, month);
  const { from, to } = monthBounds(month);
  const planBy = new Map();
  for (const p of recurringBetween(fin, from, to)) planBy.set(p.date, [...(planBy.get(p.date) ?? []), p]);
  const exp = cal.days.reduce((a, d) => a + d.expense, 0);
  const inc = cal.days.reduce((a, d) => a + d.income, 0);
  const elapsed = month === t.slice(0, 7) ? Number(t.slice(8, 10)) : month < t.slice(0, 7) ? cal.days.length : 0;
  const cells = Array.from({ length: cal.firstDow }, () => '<span class="cal-day out" aria-hidden="true"></span>');
  for (const d of cal.days) {
    const heat = d.expense && cal.maxExpense ? Math.round(8 + 52 * (d.expense / cal.maxExpense) ** 0.75) : 0;
    const cls = ['cal-day', d.date === t && 'today', d.date === ui.calDay && 'sel', d.date > t && 'future'].filter(Boolean).join(' ');
    const label = `${dayLabel(d.date)}${d.expense ? `, wydatki ${zl(d.expense)}` : ''}${d.income ? `, przychody ${zl(d.income)}` : ''}${planBy.has(d.date) ? ', zaplanowana stała pozycja' : ''}`;
    cells.push(`<button class="${cls}" data-day="${d.date}" style="--h:${heat}%" aria-label="${esc(label)}"><span class="d">${d.day}</span>${d.income ? '<i class="inc-dot"></i>' : ''}${planBy.has(d.date) ? '<i class="plan-dot">↻</i>' : ''}<span class="v">${d.expense ? esc(compact(d.expense)) : ''}</span></button>`);
  }
  const sel = ui.calDay && ui.calDay.startsWith(month) ? ui.calDay : '';
  return `<section class="card">
    <div class="pswitch"><button class="icon-btn" data-cal-shift="-1" aria-label="Poprzedni miesiąc">‹</button><b>${esc(cap(monthLabel(month)))}</b><button class="icon-btn" data-cal-shift="1" aria-label="Następny miesiąc">›</button></div>
    <div class="cal-sum"><span>Wydatki <b class="neg">${esc(zl(exp))}</b></span><span>Przychody <b class="pos">${esc(zl(inc))}</b></span>${elapsed && exp ? `<span>Średnio dziennie <b>${esc(zl(exp / elapsed))}</b></span>` : ''}</div>
    <div class="cal-grid" id="cal-grid">${DOW_HEAD.map((d) => `<span class="cal-dow">${d}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-legend small muted"><span><i class="lg-heat"></i>im ciemniej, tym więcej wydane</span><span><i class="inc-dot"></i>przychód</span><span><i class="plan-dot">↻</i>stała pozycja</span>${month !== t.slice(0, 7) ? '<button class="link small" data-act="cal-today">wróć do dziś</button>' : ''}</div>
  </section>
  ${sel ? dayPanel(sel, planBy.get(sel) ?? []) : '<p class="muted center">Dotknij dnia, aby zobaczyć jego operacje.</p>'}`;
}

function dayPanel(date, plans) {
  const txs = liveTx(fin).filter((t) => t.date === date).sort(byNewest);
  const exp = sumOf(txs, 'wydatek');
  const inc = sumOf(txs, 'przychod');
  return `<section class="card day-panel"><div class="card-head"><h3 class="day-title">${esc(cap(dayLabel(date)))}</h3><span class="day-tot">${exp ? `<b class="neg">−${esc(zl(exp))}</b>` : ''}${inc ? `<b class="pos">+${esc(zl(inc))}</b>` : ''}</span></div>
  ${txs.length ? txs.map(txRow).join('') : `<p class="muted">${date > today() ? 'Ten dzień jeszcze nie nadszedł.' : 'Brak operacji w tym dniu.'}</p>`}
  ${plans.length ? `<div class="day-sep"><span>Zaplanowane stałe pozycje</span></div>${plans.map(planRow).join('')}` : ''}
  <div class="row-btns"><button class="btn primary" data-act="add-day">+ Dodaj operację w tym dniu</button></div></section>`;
}

function shiftCal(n) {
  ui.calMonth = shiftMonth(ui.calMonth, n);
  ui.calDay = ui.calMonth === today().slice(0, 7) ? today() : '';
  render();
}

// ---------- Operacje ----------
function filteredTxs() {
  const q = ui.q.trim().toLowerCase();
  return liveTx(fin)
    .filter((t) => (!ui.account || t.accountId === ui.account || t.toAccountId === ui.account) && (!ui.type || t.type === ui.type) && (!ui.category || (ui.category === '_none' ? !t.categoryId && t.type !== 'przelew' : t.categoryId === ui.category)))
    .filter((t) => !q || `${t.merchant ?? ''} ${t.note ?? ''} ${cat(t.categoryId)?.name ?? ''} ${String(t.amount).replace('.', ',')}`.toLowerCase().includes(q))
    .sort(byNewest);
}

function viewTransactions() {
  const list = filteredTxs();
  const a = ui.account ? acc(ui.account) : null;
  const groups = new Map();
  for (const t of list.slice(0, ui.limit)) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`;
  const head = a
    ? `<div class="acc-head"><span class="acc-ico" style="${colorVar(a.color)}">${esc(accIcon(a))}</span><span class="acc-main"><b>${esc(a.name)}</b><small>saldo <b class="${balances(fin)[a.id] < -0.004 ? 'neg' : ''}">${esc(money(balances(fin)[a.id], a.currency))}</b></small></span><button class="link small" data-act="clear-acc">wszystkie konta</button></div>`
    : '';
  return `<section class="card">
  <div class="card-head"><h2>${a ? 'Historia konta' : 'Operacje'}</h2><button class="btn small primary" data-act="add-tx">+ Dodaj</button></div>${head}
  <div class="filters">
   <input type="search" id="f-q" placeholder="Szukaj: opis, kategoria, kwota" value="${esc(ui.q)}">
   <select id="f-account">${opt('', 'Wszystkie konta', ui.account)}${fin.accounts.map((x) => opt(x.id, x.name, ui.account)).join('')}</select>
   <select id="f-category">${opt('', 'Wszystkie kategorie', ui.category)}${opt('_none', '❓ Do przypisania', ui.category)}${fin.categories.filter((c) => !c.archived || c.id === ui.category).map((c) => opt(c.id, `${c.emoji} ${c.name}`, ui.category)).join('')}</select>
   <select id="f-type">${opt('', 'Wszystkie typy', ui.type)}${Object.entries(FIN_TYPES).map(([k, l]) => opt(k, l, ui.type)).join('')}</select>
  </div>
  <p class="small muted">${list.length} ${plural(list.length, 'operacja', 'operacje', 'operacji')} · wydatki ${esc(zl(sumOf(list, 'wydatek')))} · przychody ${esc(zl(sumOf(list, 'przychod')))}</p>
  ${[...groups]
    .map(([d, txs]) => {
      const spent = sumOf(txs, 'wydatek');
      return `<div class="day-sep"><span>${esc(dayLabel(d))}</span>${spent ? `<span>−${esc(zl(spent))}</span>` : ''}</div>${txs.map(txRow).join('')}`;
    })
    .join('') || '<p class="muted">Brak operacji.</p>'}
  ${list.length > ui.limit ? '<div class="row-btns"><button class="btn" data-act="more">Pokaż więcej</button></div>' : ''}
  <div class="row-btns"><button class="btn ghost" data-act="export-csv">Eksportuj widoczne do CSV</button></div></section>`;
}

// ---------- Konta ----------
function accountItem(a, b) {
  const card = isCard(a);
  const st = card ? cardStatus(a, b) : null;
  const due = card ? cardDue(a, b, today()) : null;
  const sub = [ACCOUNT_TYPES[a.type] ?? 'Konto', a.currency && a.currency !== 'PLN' ? a.currency : '', a.excludeFromTotal ? 'poza saldem łącznym' : ''].filter(Boolean).join(' · ');
  const cardInfo = card
    ? `${st.limit ? `<div class="meter" title="Wykorzystany limit"><span style="width:${(st.usedShare * 100).toFixed(1)}%;background:${st.usedShare > 0.8 ? 'var(--neg)' : 'var(--accent)'}"></span></div>` : ''}<div class="small muted">${st.debt > 0.004 ? `Do spłaty <b class="neg">${esc(zl(st.debt))}</b>` : 'Karta spłacona ✓'}${st.limit ? ` · limit ${esc(zl0(st.limit))} · dostępne ${esc(zl(st.available))}` : ''}${due ? ` · termin ${esc(shortDate(due.due))}` : ''}</div>`
    : '';
  return `<li class="acc-item"><div class="acc-line"><span class="acc-ico" style="${colorVar(a.color)}">${esc(accIcon(a))}</span><span class="acc-main"><b>${esc(a.name)}</b><small>${esc(sub)}</small></span><span class="acc-bal ${b < -0.004 ? 'neg' : ''}">${esc(money(b, a.currency))}</span></div>
  <div class="acc-more">${cardInfo}<div class="acc-actions">${card && st.debt > 0.004 ? `<button class="btn small primary" data-repay="${esc(a.id)}">Spłać kartę</button>` : ''}<button class="btn small" data-history="${esc(a.id)}">Historia</button><button class="btn small ghost" data-edit-acc="${esc(a.id)}">Edytuj</button></div></div></li>`;
}

function viewAccounts() {
  const bal = balances(fin);
  const nw = netWorth(fin);
  const active = activeAccounts();
  const hidden = fin.accounts.filter((a) => a.archived);
  return `${active.length ? `<section class="card"><div class="sum3"><div><span>Saldo łączne</span><b class="${nw.total < -0.004 ? 'neg' : ''}">${esc(zl(nw.total))}</b></div><div><span>Na kontach</span><b class="pos">${esc(zl(nw.assets))}</b></div><div><span>Zadłużenie</span><b class="${nw.debt > 0.004 ? 'neg' : ''}">${nw.debt > 0.004 ? '−' : ''}${esc(zl(nw.debt))}</b></div></div></section>` : ''}
  <section class="card"><div class="card-head"><h2>Konta i karty</h2><button class="btn small primary" data-act="add-acc">+ Dodaj konto</button></div>
  ${active.length ? `<ul class="acc-list">${active.map((a) => accountItem(a, bal[a.id])).join('')}</ul>` : '<p class="muted">Nie masz jeszcze kont. Dodaj konto w banku, kartę kredytową albo gotówkę.</p>'}
  ${active.length > 1 ? '<div class="row-btns"><button class="btn" data-act="transfer">⇄ Przelew między kontami</button></div>' : ''}</section>
  ${hidden.length ? `<details class="card"><summary>Ukryte konta (${hidden.length})</summary><ul class="acc-list">${hidden.map((a) => accountItem(a, bal[a.id])).join('')}</ul></details>` : ''}
  <p class="small muted">Karta kredytowa ma saldo ujemne: to Twoje zadłużenie. Wydatek kartą je powiększa, a „Spłać kartę” przelewa pieniądze z wybranego konta i zmniejsza zadłużenie (spłata nie jest liczona jako wydatek).</p>`;
}

// ---------- Stałe pozycje ----------
function recRow(r) {
  const { icon, color } = look(r, { recurring: true });
  const ended = r.endDate && r.nextDate > r.endDate;
  const status = r.paused ? 'wstrzymane' : ended ? 'zakończone' : shortDate(r.nextDate);
  return `<button class="ftx" data-edit-rec="${esc(r.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(r.title)}</b><small>${esc(status)} · ${esc((FREQS[r.freq] ?? '').toLowerCase())}${r.auto ? '' : ' · z potwierdzeniem'}</small></span><span class="ftx-amt ${r.paused || ended ? 'muted' : TYPE_CLASS[r.type]}">${TYPE_SIGN[r.type]}${esc(zl(r.amount))}</span></button>`;
}

function viewRecurring() {
  const recs = fin.recurring;
  const m = recurringMonthly(fin);
  const due = dueRecurring(fin, today());
  const up = upcomingRecurring(fin, today(), 30);
  const group = (type, title) => {
    const list = recs.filter((r) => r.type === type).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
    return list.length ? `<div class="day-sep"><span>${title}</span></div>${list.map(recRow).join('')}` : '';
  };
  return `<section class="card"><div class="sum3"><div><span>Stałe przychody</span><b class="pos">+${esc(zl(m.przychod))}</b><small>miesięcznie</small></div><div><span>Stałe wydatki</span><b class="neg">−${esc(zl(m.wydatek))}</b><small>miesięcznie</small></div><div><span>Zostaje</span><b class="${m.przychod - m.wydatek >= 0 ? 'pos' : 'neg'}">${esc(signed(m.przychod - m.wydatek))}</b><small>miesięcznie</small></div></div></section>
  ${due.length ? `<section class="card pend"><h2>Do zatwierdzenia</h2>${due.map(pendRow).join('')}</section>` : ''}
  <section class="card"><div class="card-head"><h2>Stałe przelewy i dochody</h2><button class="btn small primary" data-act="add-rec">+ Dodaj</button></div>
  ${recs.length ? `${group('przychod', 'Dochody')}${group('wydatek', 'Płatności')}${group('przelew', 'Przelewy między kontami')}` : '<p class="muted">Dodaj pensję, czynsz, rachunki, subskrypcje albo stały przelew na oszczędności. W dniu terminu operacja zapisze się sama albo poprosi o zatwierdzenie (gdy kwota co miesiąc jest inna).</p>'}</section>
  ${up.length ? `<section class="card"><h2>Najbliższe 30 dni</h2>${up.map(planRow).join('')}</section>` : ''}`;
}

// ---------- Do przypisania ----------
function viewInbox() {
  const list = liveTx(fin).filter((t) => t.type !== 'przelew' && !t.categoryId).sort(byNewest);
  const cats = (kind) => fin.categories.filter((c) => c.kind === kind && !c.archived);
  return `<section class="card"><div class="card-head"><h2>Do przypisania (${list.length})</h2><button class="btn small" data-act="inbox-close">Gotowe</button></div>
  ${list.length
    ? list
        .slice(0, 50)
        .map((t) => `<div class="inbox-item"><div class="cat-row"><span><b>${esc(t.merchant || 'Bez opisu')}</b><br><span class="small muted">${esc(dayLabel(t.date))}${t.card ? ` · ${esc(t.card)}` : ''}${t.accountId ? ` · ${esc(acc(t.accountId)?.name ?? '')}` : ''}</span></span><b class="num ${t.type === 'przychod' ? 'pos' : ''}">${TYPE_SIGN[t.type]}${esc(zl(t.amount))}</b></div>
    <div class="cat-grid">${cats(t.type).map((c) => `<button class="cat-pick" style="--c:${esc(c.color)}" data-assign="${esc(t.id)}" data-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>
    ${t.merchant ? `<label class="check small"><input type="checkbox" data-remember="${esc(t.id)}" checked> Zapamiętaj dla „${esc(rulePatternFor(t.merchant))}”</label>` : ''}</div>`)
        .join('')
    : '<p class="muted">Wszystko przypisane. 🎉</p>'}</section>`;
}

// ---------- Więcej: kategorie, import, Apple Pay, kopia ----------
const SET_TABS = [['kategorie', 'Kategorie'], ['import', 'Import'], ['applepay', 'Apple Pay'], ['kopia', 'Kopia']];

function settingsCategories() {
  const catRow = (c) =>
    `<div class="cat-edit ${c.archived ? 'muted' : ''}" data-cat-row="${esc(c.id)}"><input class="emoji" name="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="Ikona"><input name="name" value="${esc(c.name)}" aria-label="Nazwa"><input type="color" name="color" value="${esc(c.color)}" aria-label="Kolor">${c.kind === 'wydatek' ? `<input name="budget" inputmode="decimal" value="${esc(fmtInput(c.budget ?? 0))}" placeholder="budżet/mies." aria-label="Budżet miesięczny">` : '<span></span>'}<button class="link" data-archive-cat="${esc(c.id)}">${c.archived ? 'Przywróć' : 'Ukryj'}</button></div>`;
  const rows = (kind) => fin.categories.filter((c) => c.kind === kind && !c.archived).map(catRow).join('');
  const hidden = fin.categories.filter((c) => c.archived);
  const catOptions = fin.categories.filter((c) => !c.archived).map((c) => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  return `<section class="card"><h2>Kategorie wydatków</h2><div class="cat-edits">${rows('wydatek')}</div>
    <h2 style="margin-top:18px">Kategorie przychodów</h2><div class="cat-edits">${rows('przychod')}</div>
    <form class="row-btns" id="add-cat"><input name="emoji" class="emoji" value="🏷️" maxlength="4" aria-label="Ikona"><input name="name" placeholder="Nowa kategoria" required><select name="kind"><option value="wydatek">wydatek</option><option value="przychod">przychód</option></select><button class="btn" type="submit">Dodaj</button></form>
    ${hidden.length ? `<details><summary>Ukryte kategorie (${hidden.length})</summary><div class="cat-edits" style="margin-top:8px">${hidden.map(catRow).join('')}</div></details>` : ''}
    <p class="small muted">Budżet to miesięczny limit wydatków w kategorii (pasek w przeglądzie miesiąca). Ukryte kategorie zostają w historii.</p></section>
  <section class="card"><h2>Reguły automatyczne</h2><p class="small muted">Gdy opis albo sprzedawca zawiera podany tekst, kategoria przypisze się sama (przy imporcie i z Apple Pay). Wielkość liter i polskie znaki nie mają znaczenia.</p>
    ${fin.rules.length ? `<ul class="cat-list">${fin.rules.map((r) => `<li><div class="cat-row"><span>„${esc(r.pattern)}” → ${cat(r.categoryId) ? `<span class="cat-chip" style="--c:${esc(cat(r.categoryId).color)}">${esc(cat(r.categoryId).emoji)} ${esc(cat(r.categoryId).name)}</span>` : '<span class="cat-chip none">?</span>'}</span><button class="link" data-del-rule="${esc(r.id)}">Usuń</button></div></li>`).join('')}</ul>` : ''}
    <form class="row-btns" id="add-rule"><input name="pattern" placeholder="np. biedronka" required><select name="categoryId">${catOptions}</select><button class="btn" type="submit">Dodaj regułę</button></form></section>`;
}

function mmPreview(m) {
  const s = m.snap;
  const accs = s.accounts.filter((a) => !a.removed);
  const dates = [...s.entries.map((e) => e.day), ...s.transfers.map((t) => t.day)].filter(Boolean).sort();
  const exp = s.entries.filter((e) => !e.income).length;
  const stat = (n, l) => `<div><b>${NF0.format(n)}</b><span>${l}</span></div>`;
  return `<p class="small">Plik <b>${esc(m.name)}</b>${dates.length ? `: operacje od ${esc(shortDate(dates[0], true))} do ${esc(shortDate(dates.at(-1), true))}` : ''}</p>
  <div class="mm-stats">${stat(accs.length, 'kont')}${stat(s.categories.filter((c) => !c.removed).length, 'kategorii')}${stat(exp, 'wydatków')}${stat(s.entries.length - exp, 'przychodów')}${stat(s.transfers.length, 'przelewów')}</div>
  <ul class="acc-list">${accs.map((a) => `<li class="mm-acc"><span>${esc(a.title)}${a.hidden ? ' <span class="tag">ukryte</span>' : ''}</span><b class="num ${(a.storedBalance ?? 0) < 0 ? 'neg' : ''}">${a.storedBalance === null ? '—' : esc(money(a.storedBalance, a.currency))}</b></li>`).join('')}</ul>
  ${s.warnings.map((w) => `<div class="banner warn">${esc(w)}</div>`).join('')}
  ${s.reminders ? `<p class="small muted">Przypomnienia z Money Managera (${s.reminders}) nie są przenoszone. Stałe płatności ustawisz w zakładce Stałe.</p>` : ''}
  <p class="small muted">Salda kont będą takie same jak w Money Managerze. Ponowny import tej samej albo nowszej kopii nie zdubluje operacji: doda nowe i uwzględni zmiany z Money Managera, ale nie nadpisze operacji zmienionych tutaj.</p>
  <div class="row-btns"><button class="btn primary" data-act="import-mm">Importuj</button><button class="btn ghost" data-act="cancel-mm">Anuluj</button></div>`;
}

function settingsImport() {
  const m = ui.mm;
  const mmBody = !m
    ? `<ol class="steps-mini"><li>W aplikacji Money Manager utwórz kopię zapasową i zapisz plik <b>.mmbackup</b> w Plikach na iPhonie.</li><li>Wybierz ten plik poniżej. Odczytam go na tym urządzeniu i pokażę podsumowanie.</li><li>Sprawdź podsumowanie i kliknij <b>Importuj</b>.</li></ol><div class="row-btns"><button class="btn primary" data-act="pick-mm">Wybierz plik .mmbackup</button></div>`
    : m.error
      ? `<div class="banner err">Nie udało się odczytać pliku „${esc(m.name)}”: ${esc(m.error)}.</div><div class="row-btns"><button class="btn" data-act="pick-mm">Wybierz inny plik</button></div>`
      : mmPreview(m);
  return `<section class="card" id="mm"><h2>Import z Money Managera (Orange Dog)</h2><p class="small muted">Przeniesiesz konta z saldami, kategorie, wydatki, przychody i przelewy z aplikacji „Money Manager: finanse, przychody i wydatki”. Plik nie opuszcza urządzenia.</p>${mmBody}<input type="file" id="mm-file" hidden></section>
  <section class="card" id="csv"><h2>Wyciąg z banku (CSV)</h2><p class="small muted">Pobierz historię w formacie CSV z bankowości internetowej (mBank, PKO, ING, Santander, Pekao i inne), a potem wybierz plik. Kolumny rozpoznam sam, a Ty możesz je poprawić. Plik nie opuszcza urządzenia.</p>
    <div class="row-btns"><button class="btn" data-act="pick-csv">Wybierz plik CSV</button></div><input type="file" id="csv-file" accept=".csv,text/csv,text/plain" hidden><div id="csv-map">${csvMapping()}</div></section>`;
}

function settingsApplePay() {
  return `<section class="card" id="applepay"><h2>Apple Pay na iPhonie (Skróty)</h2>
    <p>Po każdej płatności Apple Pay automatyzacja w aplikacji <b>Skróty</b> pokaże listę Twoich kategorii, a wybór zapisze w pliku na iPhonie (bez internetu). Plik wczytujesz tutaj jednym przyciskiem. Szczegółowa instrukcja jest w pliku FINANSE.md.</p>
    <ol class="steps-mini"><li>Pobierz listę kategorii i zapisz ją w Plikach: <i>Na moim iPhonie → Skróty → kategorie.txt</i>.</li><li>W Skrótach utwórz automatyzację „Transakcja” (w nowszych iOS: „Portfel”) → dowolna karta → <i>Uruchom natychmiast</i>.</li><li>Akcje: <i>Pobierz plik</i> kategorie.txt → <i>Podziel tekst</i> (nowe wiersze) → <i>Wybierz z listy</i> → <i>Tekst</i>: Data ISO 8601;Kwota;Sprzedawca;Wybrany element;Karta → <i>Dołącz do pliku tekstowego</i> wydatki.txt.</li><li>Raz na jakiś czas: <b>Importuj wydatki.txt</b>. Duplikaty są pomijane automatycznie.</li></ol>
    <div class="row-btns"><button class="btn" data-act="dl-cats">Pobierz kategorie.txt</button><button class="btn primary" data-act="import-ap">Importuj wydatki.txt</button></div>
    <input type="file" id="ap-file" accept=".txt,text/plain,.csv" hidden>
    <details><summary>Wklej wpisy ręcznie</summary><textarea id="ap-paste" rows="4" placeholder="2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa"></textarea><button class="btn" data-act="paste-ap">Dodaj wklejone</button></details></section>`;
}

function settingsBackup() {
  const size = Math.round(JSON.stringify(fin).length / 1024);
  return `<section class="card"><h2>Kopia zapasowa</h2><p class="small muted">Dane są tylko w tej przeglądarce (${liveTx(fin).length} operacji, ${fin.accounts.length} kont, ok. ${size} KB). Rób kopię co jakiś czas i zapisuj ją w Plikach. Usunięcie danych witryny w ustawieniach Safari usunie też dziennik.</p>
    <div class="row-btns"><button class="btn primary" data-act="backup">Eksportuj kopię (JSON)</button><button class="btn" data-act="restore">Wczytaj kopię</button></div><input type="file" id="restore-file" accept="application/json,.json" hidden>
    <details class="danger"><summary>Usuń wszystkie dane dziennika</summary><p class="small">Tej operacji nie można cofnąć. Najpierw wyeksportuj kopię.</p><button class="btn danger" data-act="wipe">Usuń dziennik</button></details></section>`;
}

function viewSettings() {
  const seg = `<div class="seg small set-seg" style="margin-top:12px">${SET_TABS.map(([k, l]) => `<button data-set-tab="${k}" class="${ui.setTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `${seg}${{ kategorie: settingsCategories, import: settingsImport, applepay: settingsApplePay, kopia: settingsBackup }[ui.setTab]()}`;
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
  <label class="check small"><input type="checkbox" id="csv-keep" ${c.keepBalance ? 'checked' : ''}> Zachowaj obecne saldo konta (wyciąg zawiera operacje już ujęte w saldzie)</label>
  <p class="small muted">Podgląd (${txs.length} operacji${errors.length ? `, ${errors.length} pominiętych` : ''}):</p>
  <div>${txs.slice(0, 5).map((t) => txRow({ ...t, id: '' })).join('')}</div>
  <div class="row-btns"><button class="btn primary" data-act="import-csv" ${txs.length ? '' : 'disabled'}>Importuj ${txs.length} operacji</button><button class="btn ghost" data-act="cancel-csv">Anuluj</button></div>`;
}

// ---------- Render i nawigacja ----------
const VIEWS = { przeglad: viewOverview, kalendarz: viewCalendar, operacje: viewTransactions, konta: viewAccounts, stale: viewRecurring, ustawienia: viewSettings };

function render() {
  for (const b of $$('#fin-nav button')) b.classList.toggle('on', b.dataset.view === ui.view);
  const root = $('#fin-root');
  root.innerHTML = ui.inbox ? viewInbox() : VIEWS[ui.view]();
  for (const w of $$('.bars-wrap', root)) w.scrollLeft = w.scrollWidth;
}

function setView(v) {
  ui.view = v;
  ui.inbox = false;
  ui.notice = '';
  render();
  window.scrollTo({ top: 0 });
}

// Zapisuje stałe pozycje z automatem, których termin minął (przy otwarciu i po powrocie do aplikacji).
function runRecurring() {
  const before = fin.recurring.map((r) => r.nextDate).join();
  const r = processRecurring(fin, today(), { newId });
  fin = r.fin;
  if (r.posted || fin.recurring.map((x) => x.nextDate).join() !== before) save();
  if (r.posted) toast(`Zapisano ${r.posted} ${plural(r.posted, 'stałą pozycję', 'stałe pozycje', 'stałych pozycji')} z terminem do dziś.`);
}

$('#fin-nav').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-view]');
  if (!b) return;
  if (b.dataset.view === 'operacje') ui.account = '';
  setView(b.dataset.view);
});

function settle(recId, post) {
  const r = fin.recurring.find((x) => x.id === recId);
  if (!r) return;
  if (post) return openTx(null, { type: r.type, amount: r.amount, date: r.nextDate, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, merchant: r.title }, { recId });
  fin = settleRecurring(fin, recId, { post: false, newId });
  save();
  toast(`Pominięto termin ${shortDate(r.nextDate)}: ${r.title}.`);
  render();
}

$('#fin-root').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.view) return setView(d.view);
  if (d.goto) {
    ui.setTab = d.goto;
    return setView('ustawienia');
  }
  if (d.setTab) {
    ui.setTab = d.setTab;
    return render();
  }
  if (d.period) {
    ui.period = d.period;
    ui.openCat = null;
    return render();
  }
  if (d.shift) {
    ui.anchor = shiftPeriod(ui.period, ui.anchor, Number(d.shift));
    ui.openCat = null;
    return render();
  }
  if (d.kind) {
    ui.kind = d.kind;
    ui.openCat = null;
    return render();
  }
  if (d.openCat) {
    ui.openCat = ui.openCat === d.openCat ? null : d.openCat;
    return render();
  }
  if (d.catAll) {
    ui.category = d.catAll;
    ui.account = '';
    ui.type = '';
    ui.q = '';
    return setView('operacje');
  }
  if (d.calShift) return shiftCal(Number(d.calShift));
  if (d.day) {
    ui.calDay = d.day;
    render();
    $('.day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (d.edit) {
    const t = fin.txs.find((x) => x.id === d.edit);
    return t && openTx(t);
  }
  if (d.assign) {
    const t = fin.txs.find((x) => x.id === d.assign);
    const remember = $(`[data-remember="${CSS.escape(d.assign)}"]`)?.checked;
    t.categoryId = d.cat;
    t.updatedAt = Date.now();
    if (remember && t.merchant) {
      const pattern = rulePatternFor(t.merchant);
      if (!fin.rules.some((r) => r.pattern.toLowerCase() === pattern.toLowerCase())) fin.rules.push({ id: newId(), pattern, categoryId: d.cat });
      for (const o of liveTx(fin)) if (!o.categoryId && o.type === t.type && o.merchant && applyRules(o.merchant, [{ pattern, categoryId: d.cat }])) o.categoryId = d.cat;
    }
    save();
    return render();
  }
  if (d.repay) return openRepay(d.repay);
  if (d.history) {
    ui.account = d.history;
    ui.category = '';
    ui.type = '';
    ui.q = '';
    return setView('operacje');
  }
  if (d.editAcc) return openAccount(d.editAcc);
  if (d.editRec) return openRecurring(d.editRec);
  if (d.settle) return settle(d.settle, d.post === '1');
  if (d.archiveCat) {
    const c = cat(d.archiveCat);
    c.archived = !c.archived || undefined;
    save();
    return render();
  }
  if (d.delRule) {
    fin.rules = fin.rules.filter((r) => r.id !== d.delRule);
    save();
    return render();
  }
  const addDate = ui.period === 'dzien' ? ui.anchor : today();
  switch (d.act) {
    case 'add-exp':
      return openTx(null, { type: 'wydatek', date: addDate });
    case 'add-inc':
      return openTx(null, { type: 'przychod', date: addDate });
    case 'add-tx':
      return openTx(null, { accountId: ui.account || undefined });
    case 'add-day':
      return openTx(null, { date: ui.calDay || today() });
    case 'transfer':
      return openTx(null, { type: 'przelew' });
    case 'add-acc':
      return openAccount(null);
    case 'add-rec':
      return openRecurring(null);
    case 'period-today':
      ui.anchor = today();
      return render();
    case 'cal-today':
      ui.calMonth = today().slice(0, 7);
      ui.calDay = today();
      return render();
    case 'clear-acc':
      ui.account = '';
      return render();
    case 'inbox':
      ui.inbox = true;
      render();
      return window.scrollTo({ top: 0 });
    case 'inbox-close':
      ui.inbox = false;
      return render();
    case 'more':
      ui.limit += 200;
      return render();
    case 'export-csv': {
      const rows = filteredTxs().map((t) => [t.date, t.time ?? '', FIN_TYPES[t.type], t.type === 'wydatek' ? -t.amount : t.amount, cat(t.categoryId)?.name ?? '', acc(t.accountId)?.name ?? '', t.type === 'przelew' ? acc(t.toAccountId)?.name ?? '' : '', t.merchant ?? '', t.note ?? '']);
      const csv = [['data', 'godzina', 'typ', 'kwota', 'kategoria', 'konto', 'na konto', 'opis', 'notatka'], ...rows].map((r) => r.map((c) => (typeof c === 'number' ? String(c).replace('.', ',') : /[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\n');
      return download(`operacje-${today()}.csv`, `﻿${csv}`, 'text/csv');
    }
    case 'dl-cats':
      return download('kategorie.txt', shortcutCategoriesText(fin), 'text/plain');
    case 'import-ap':
      return $('#ap-file').click();
    case 'paste-ap':
      return importShortcutText($('#ap-paste').value, 'wklejonego tekstu');
    case 'pick-csv':
      return $('#csv-file').click();
    case 'cancel-csv':
      ui.csv = null;
      return render();
    case 'import-csv': {
      const id = ui.csv.accountId;
      const before = id ? balances(fin)[id] : null;
      const { txs } = csvToTxs(ui.csv.rows, ui.csv.mapping, { accountId: id || null, fin });
      const r = mergeImported(fin, txs, { newId });
      fin = r.fin;
      if (id && ui.csv.keepBalance) setBalance(fin, id, before);
      save();
      ui.csv = null;
      toast(`Dodano ${r.added} operacji${r.skipped ? `, pominięto ${r.skipped} duplikatów${r.crossSource ? ` (w tym ${r.crossSource} zapisanych już z Apple Pay)` : ''}` : ''}.`);
      return render();
    }
    case 'pick-mm':
      return $('#mm-file').click();
    case 'cancel-mm':
      ui.mm = null;
      return render();
    case 'import-mm': {
      const { fin: next, report } = mmToFinance(ui.mm.snap, fin, { newId });
      fin = next;
      save();
      ui.mm = null;
      const parts = [`dodano ${report.added} ${plural(report.added, 'operację', 'operacje', 'operacji')}`];
      if (report.updated) parts.push(`zaktualizowano ${report.updated}`);
      if (report.removed) parts.push(`usunięto ${report.removed}`);
      if (report.unchanged) parts.push(`${report.unchanged} bez zmian`);
      if (report.accounts) parts.push(`nowe konta: ${report.accounts}`);
      if (report.categories) parts.push(`nowe kategorie: ${report.categories}`);
      let notice = `Import z Money Managera: ${parts.join(', ')}.`;
      if (report.hiddenDefaults) notice += ` Domyślne kategorie bez operacji zostały ukryte (przywrócisz je w Więcej → Kategorie).`;
      if (report.foreign.length) notice += ` Konta w innych walutach (${report.foreign.join(', ')}) nie są wliczane do salda łącznego.`;
      setView('przeglad');
      ui.notice = notice;
      return render();
    }
    case 'backup':
      return download(`dziennik-finansowy-${today()}.json`, JSON.stringify(fin, null, 1), 'application/json');
    case 'restore':
      if (fin.txs.length && !armed(b, 'Zastąpi obecne dane – dotknij ponownie')) return;
      disarm(b);
      return $('#restore-file').click();
    case 'wipe':
      if (!armed(b, 'Na pewno? Dotknij ponownie')) return;
      fin = emptyFinance();
      save();
      toast('Dziennik wyczyszczony.');
      return setView('przeglad');
    default:
  }
});

$('#fin-root').addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'f-account') ui.account = el.value;
  else if (el.id === 'f-category') ui.category = el.value;
  else if (el.id === 'f-type') ui.type = el.value;
  else if (el.id === 'p-from') ui.from = el.value || ui.from;
  else if (el.id === 'p-to') ui.to = el.value || ui.to;
  else if (el.id === 'csv-keep') {
    ui.csv.keepBalance = el.checked;
    return;
  } else if (el.dataset.map) {
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
    ui.csv = { name: f.name, rows, mapping: guessMapping(rows), accountId: activeAccounts()[0]?.id ?? '', encoding, keepBalance: true };
    if (ui.csv.mapping.headerRow < 0) ui.csv.mapping.headerRow = 0;
    $('#csv-map').innerHTML = csvMapping();
    return;
  } else if (el.id === 'mm-file' && el.files[0]) {
    const f = el.files[0];
    try {
      ui.mm = { name: f.name, snap: await readMmBackup(await f.arrayBuffer()) };
    } catch (err) {
      ui.mm = { name: f.name, error: err.message };
    }
  } else if (el.id === 'restore-file' && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (data?.version !== 1 || !Array.isArray(data.txs)) throw new Error('to nie jest kopia dziennika');
      fin = { ...emptyFinance(), ...data };
      save();
      toast(`Wczytano kopię: ${liveTx(fin).length} operacji.`);
      return setView('przeglad');
    } catch (err) {
      toast(`Nie udało się wczytać kopii: ${err.message}`);
    }
    return;
  } else return;
  render();
});

$('#fin-root').addEventListener('input', (ev) => {
  if (ev.target.id !== 'f-q') return;
  ui.q = ev.target.value;
  clearTimeout(ui.qt);
  ui.qt = setTimeout(() => {
    render();
    const q = $('#f-q');
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }, 250);
});

$('#fin-root').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.id === 'add-cat') {
    if (!data.name.trim()) return;
    fin.categories.push({ id: newId(), name: data.name.trim(), emoji: data.emoji || '🏷️', kind: data.kind, color: nextColor(fin.categories.length), budget: null });
  } else if (f.id === 'add-rule') {
    if (!data.pattern.trim()) return;
    fin.rules.push({ id: newId(), pattern: data.pattern.trim(), categoryId: data.categoryId });
  } else return;
  save();
  render();
});

// Przesunięcie palcem po kalendarzu zmienia miesiąc.
let swipe = null;
$('#fin-root').addEventListener('touchstart', (ev) => (swipe = ev.target.closest('#cal-grid') ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY } : null), { passive: true });
$('#fin-root').addEventListener(
  'touchend',
  (ev) => {
    if (!swipe) return;
    const dx = ev.changedTouches[0].clientX - swipe.x;
    const dy = ev.changedTouches[0].clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) shiftCal(dx < 0 ? 1 : -1);
  },
  { passive: true },
);

function importShortcutText(text, source) {
  const { txs, errors } = parseShortcutLog(text, fin);
  const r = mergeImported(fin, txs, { newId });
  fin = r.fin;
  save();
  toast(`Z ${source}: dodano ${r.added}${r.skipped ? `, pominięto ${r.skipped} już zapisanych` : ''}${errors.length ? `, ${errors.length} wierszy z błędem` : ''}.`);
  if (txs.some((t) => !t.categoryId)) ui.inbox = true;
  render();
}

// ---------- Okna dialogowe ----------
const openDialog = (dlg) => (dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''));
const closeDialog = (dlg) => (dlg.close ? dlg.close() : dlg.removeAttribute('open'));
for (const dlg of $$('dialog')) dlg.addEventListener('click', (ev) => (ev.target === dlg || ev.target.closest('[data-close]')) && closeDialog(dlg));

function catGrid(kind, selected) {
  return fin.categories
    .filter((c) => c.kind === kind && (!c.archived || c.id === selected))
    .map((c) => `<button type="button" class="cat-pick ${c.id === selected ? 'on' : ''}" style="--c:${esc(c.color)}" data-pick="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`)
    .join('');
}
const setRadio = (f, value) => {
  for (const r of f.elements.type) r.checked = r.value === value;
};
const amountOf = (input) => round2(Math.abs(parseAmount(input.value)));

// Operacja: wydatek, przychód, przelew (także spłata karty i zatwierdzenie stałej pozycji).
const TX = $('#fin-dialog');
const txForm = $('form', TX);

function openTx(t, prefill = {}, { recId = '' } = {}) {
  const f = txForm;
  const p = Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const type = t?.type ?? p.type ?? 'wydatek';
  const tx = t ?? { type, date: today(), accountId: defaultAccount(type), categoryId: null, ...p };
  f.dataset.id = t?.id ?? '';
  f.dataset.cat = tx.categoryId ?? '';
  f.dataset.rec = recId;
  $('#fd-title').textContent = t ? 'Edytuj operację' : recId ? 'Zapisz stałą pozycję' : 'Nowa operacja';
  setRadio(f, tx.type);
  f.elements.amount.value = tx.amount ? fmtInput(tx.amount) : '';
  f.elements.date.value = tx.date;
  f.elements.merchant.value = tx.merchant ?? '';
  f.elements.note.value = tx.note ?? '';
  f.elements.accountId.innerHTML = accountOptions(tx.accountId);
  f.elements.toAccountId.innerHTML = accountOptions(tx.toAccountId);
  f.elements.repeat.value = '';
  $('#fd-repeat').hidden = Boolean(t || recId);
  f.elements.remember.checked = false;
  $('#fd-delete').hidden = !t;
  disarm($('#fd-delete'));
  $('#fd-errors').textContent = '';
  syncTxForm();
  openDialog(TX);
}

function syncTxForm() {
  const f = txForm;
  const type = f.elements.type.value;
  f.dataset.type = type;
  if (f.dataset.cat && cat(f.dataset.cat)?.kind !== type) f.dataset.cat = '';
  if (!f.dataset.id && !f.dataset.rec) $('#fd-title').textContent = { wydatek: 'Nowy wydatek', przychod: 'Nowy przychód', przelew: 'Nowy przelew' }[type];
  $('#fd-cats').innerHTML = type === 'przelew' ? '' : catGrid(type, f.dataset.cat);
  $('#fd-cats-wrap').hidden = type === 'przelew';
  $('#fd-to').hidden = type !== 'przelew';
  $('#fd-acc-label').textContent = type === 'przelew' ? 'Z konta' : 'Konto';
  $('#fd-remember').hidden = type === 'przelew';
  const a = acc(f.elements.accountId.value);
  const to = acc(f.elements.toAccountId.value);
  const hint =
    type === 'wydatek' && isCard(a)
      ? '💳 Wydatek kartą kredytową zwiększy jej zadłużenie.'
      : type === 'przelew' && isCard(to)
        ? '💳 To spłata karty: jej zadłużenie zmniejszy się o tę kwotę, a nie jest to wydatek.'
        : type === 'przychod' && isCard(a)
          ? '💳 Wpływ na kartę kredytową (np. zwrot) zmniejszy jej zadłużenie.'
          : '';
  $('#fd-hint').textContent = hint;
  $('#fd-hint').hidden = !hint;
}

txForm.addEventListener('change', (ev) => ['type', 'accountId', 'toAccountId'].includes(ev.target.name) && syncTxForm());
$('#fd-cats').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pick]');
  if (!b) return;
  txForm.dataset.cat = txForm.dataset.cat === b.dataset.pick ? '' : b.dataset.pick;
  syncTxForm();
});
txForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = txForm;
  const prev = fin.txs.find((x) => x.id === f.dataset.id);
  const type = f.elements.type.value;
  const t = {
    ...(prev ?? {}),
    id: prev?.id ?? newId(),
    type,
    amount: amountOf(f.elements.amount),
    date: f.elements.date.value,
    accountId: f.elements.accountId.value || null,
    toAccountId: type === 'przelew' ? f.elements.toAccountId.value || null : undefined,
    categoryId: type === 'przelew' ? null : f.dataset.cat || null,
    merchant: f.elements.merchant.value.trim(),
    note: f.elements.note.value.trim() || undefined,
    source: prev?.source ?? 'reczne',
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  if (prev && (prev.amount !== t.amount || prev.accountId !== t.accountId)) delete t.accountAmount;
  if (prev && (prev.amount !== t.amount || prev.toAccountId !== t.toAccountId)) delete t.toAmount;
  const errors = validateFinTx(t, fin);
  if (errors.length) {
    $('#fd-errors').textContent = errors.join(' ');
    return;
  }
  if (f.elements.remember.checked && t.merchant && t.categoryId) fin.rules.push({ id: newId(), pattern: rulePatternFor(t.merchant), categoryId: t.categoryId });
  const rec = f.dataset.rec && fin.recurring.find((x) => x.id === f.dataset.rec);
  if (rec) {
    Object.assign(t, { recurringId: rec.id, importKey: `rec|${rec.id}|${rec.nextDate}`, source: 'stale' });
    fin = settleRecurring(fin, rec.id, { post: false, newId });
  }
  fin.txs = prev ? fin.txs.map((x) => (x.id === t.id ? t : x)) : [...fin.txs, t];
  const freq = f.elements.repeat.value;
  if (!prev && !rec && freq) {
    const day = Number(t.date.slice(8, 10));
    const r = { id: newId(), title: t.merchant || cat(t.categoryId)?.name || FIN_TYPES[t.type], type: t.type, amount: t.amount, accountId: t.accountId, toAccountId: t.toAccountId ?? null, categoryId: t.categoryId, freq, anchorDay: day, nextDate: nextRecurringDate(t.date, freq, day), auto: true };
    fin.recurring = [...fin.recurring, r];
    Object.assign(t, { recurringId: r.id, importKey: `rec|${r.id}|${t.date}` });
  }
  if (t.type === 'wydatek' && t.accountId) fin.lastAccountId = t.accountId;
  save();
  closeDialog(TX);
  toast(prev ? 'Zapisano zmiany.' : `Dodano ${FIN_TYPES[t.type].toLowerCase()}: ${zl(t.amount)}${freq && !prev ? ` (powtarza się: ${FREQS[freq].toLowerCase()})` : ''}.`);
  if (freq && !prev) runRecurring();
  render();
});
$('#fd-delete').addEventListener('click', (ev) => {
  if (!armed(ev.currentTarget, 'Na pewno usunąć?')) return;
  const t = fin.txs.find((x) => x.id === txForm.dataset.id);
  if (t) {
    t.deleted = true;
    t.updatedAt = Date.now();
    save();
  }
  closeDialog(TX);
  render();
  toast('Usunięto operację.');
});

// Konto: zwykłe (saldo obecne) albo karta kredytowa (zadłużenie, limit, termin i konto spłaty).
const ACC = $('#acc-dialog');
const accForm = $('form', ACC);

function openAccount(id) {
  const f = accForm;
  const a = id ? acc(id) : null;
  const b = a ? balances(fin)[a.id] : 0;
  f.dataset.id = a?.id ?? '';
  $('#ad-title').textContent = a ? 'Edytuj konto' : 'Nowe konto';
  f.elements.name.value = a?.name ?? '';
  setRadio(f, a?.type ?? 'bank');
  f.elements.balance.value = a && !isCard(a) ? fmtInput(b) : '';
  f.elements.debt.value = a && isCard(a) ? fmtInput(Math.max(0, -b)) : '';
  f.elements.limit.value = a?.limit ? fmtInput(a.limit) : '';
  f.elements.dueDay.value = a?.dueDay ?? '';
  f.elements.payFromId.innerHTML = `<option value="">— wybiorę przy spłacie —</option>${accountOptions(a?.payFromId, { none: false, filter: (x) => !isCard(x) && x.id !== a?.id })}`;
  f.elements.cards.value = (a?.cards ?? []).join(', ');
  f.elements.excludeFromTotal.checked = Boolean(a?.excludeFromTotal);
  const used = a && (fin.txs.some((t) => !t.deleted && (t.accountId === a.id || t.toAccountId === a.id)) || fin.recurring.some((r) => r.accountId === a.id || r.toAccountId === a.id));
  $('#ad-delete').hidden = !a || used;
  disarm($('#ad-delete'));
  $('#ad-archive').hidden = !a;
  $('#ad-archive').textContent = a?.archived ? 'Przywróć' : 'Ukryj';
  $('#ad-errors').textContent = '';
  f.dataset.type = f.elements.type.value;
  syncAccForm();
  openDialog(ACC);
}

function syncAccForm() {
  const f = accForm;
  const card = f.elements.type.value === 'karta';
  const wasCard = f.dataset.type === 'karta';
  // Przy zmianie rodzaju przenosimy kwotę: saldo ujemne ↔ zadłużenie.
  if (card && !wasCard && !f.elements.debt.value) {
    const v = parseAmount(f.elements.balance.value);
    f.elements.debt.value = Number.isFinite(v) && v < 0 ? fmtInput(-v) : '';
  } else if (!card && wasCard && !f.elements.balance.value) {
    const v = parseAmount(f.elements.debt.value);
    f.elements.balance.value = Number.isFinite(v) && v > 0 ? fmtInput(-v) : '';
  }
  f.dataset.type = f.elements.type.value;
  $('#ad-plain').hidden = card;
  $('#ad-card').hidden = !card;
}

accForm.addEventListener('change', (ev) => ev.target.name === 'type' && syncAccForm());
accForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = accForm;
  const prev = acc(f.dataset.id);
  const type = f.elements.type.value;
  const card = type === 'karta';
  const name = f.elements.name.value.trim();
  const num = (input) => (input.value.trim() ? parseAmount(input.value) : 0);
  const target = card ? -Math.abs(num(f.elements.debt)) : num(f.elements.balance);
  const errors = [];
  if (!name) errors.push('Podaj nazwę konta.');
  if (!Number.isFinite(target)) errors.push(card ? 'Nie rozpoznano kwoty zadłużenia.' : 'Nie rozpoznano salda.');
  const dueDay = f.elements.dueDay.value.trim() ? Math.round(Number(f.elements.dueDay.value)) : null;
  if (card && dueDay !== null && !(dueDay >= 1 && dueDay <= 31)) errors.push('Dzień spłaty to liczba od 1 do 31.');
  if (errors.length) {
    $('#ad-errors').textContent = errors.join(' ');
    return;
  }
  const id = prev?.id ?? newId();
  const a = { ...(prev ?? { openingBalance: 0, openingDate: '1970-01-01' }), id, name, type, cards: f.elements.cards.value.split(',').map((x) => x.trim()).filter(Boolean) };
  a.excludeFromTotal = f.elements.excludeFromTotal.checked || undefined;
  a.limit = card ? Math.abs(num(f.elements.limit)) || undefined : undefined;
  a.dueDay = card ? dueDay ?? undefined : undefined;
  a.payFromId = card ? f.elements.payFromId.value || undefined : undefined;
  fin.accounts = prev ? fin.accounts.map((x) => (x.id === id ? a : x)) : [...fin.accounts, a];
  if (!prev || Math.abs(balances(fin)[id] - target) >= 0.005) setBalance(fin, id, target);
  save();
  closeDialog(ACC);
  toast(prev ? 'Zapisano konto.' : card ? 'Dodano kartę kredytową.' : 'Dodano konto.');
  render();
});
$('#ad-archive').addEventListener('click', () => {
  const a = acc(accForm.dataset.id);
  if (!a) return;
  a.archived = !a.archived || undefined;
  save();
  closeDialog(ACC);
  toast(a.archived ? 'Konto ukryte (znajdziesz je na dole listy kont).' : 'Konto przywrócone.');
  render();
});
$('#ad-delete').addEventListener('click', (ev) => {
  if (!armed(ev.currentTarget, 'Na pewno usunąć?')) return;
  fin.accounts = fin.accounts.filter((a) => a.id !== accForm.dataset.id);
  save();
  closeDialog(ACC);
  toast('Usunięto konto.');
  render();
});

// Stała pozycja: pensja, czynsz, rachunki, subskrypcje, stały przelew.
const REC = $('#rec-dialog');
const recForm = $('form', REC);

function openRecurring(id) {
  const f = recForm;
  const r = id ? fin.recurring.find((x) => x.id === id) : { type: 'wydatek', freq: 'miesiac', nextDate: today(), auto: true, accountId: defaultAccount('wydatek') };
  if (!r) return;
  f.dataset.id = id ?? '';
  f.dataset.cat = r.categoryId ?? '';
  $('#rd-title').textContent = id ? 'Edytuj stałą pozycję' : 'Nowa stała pozycja';
  setRadio(f, r.type);
  f.elements.title.value = r.title ?? '';
  f.elements.amount.value = r.amount ? fmtInput(r.amount) : '';
  f.elements.accountId.innerHTML = accountOptions(r.accountId);
  f.elements.toAccountId.innerHTML = accountOptions(r.toAccountId);
  f.elements.freq.value = r.freq;
  f.elements.nextDate.value = r.nextDate ?? today();
  f.elements.endDate.value = r.endDate ?? '';
  f.elements.auto.checked = r.auto !== false;
  f.elements.paused.checked = Boolean(r.paused);
  $('#rd-paused-wrap').hidden = !id;
  $('#rd-delete').hidden = !id;
  disarm($('#rd-delete'));
  $('#rd-errors').textContent = '';
  syncRecForm();
  openDialog(REC);
}

function syncRecForm() {
  const f = recForm;
  const type = f.elements.type.value;
  f.dataset.type = type;
  if (f.dataset.cat && cat(f.dataset.cat)?.kind !== type) f.dataset.cat = '';
  $('#rd-cats').innerHTML = type === 'przelew' ? '' : catGrid(type, f.dataset.cat);
  $('#rd-cats-wrap').hidden = type === 'przelew';
  $('#rd-to').hidden = type !== 'przelew';
  $('#rd-acc-label').textContent = type === 'przelew' ? 'Z konta' : 'Konto';
  const next = f.elements.nextDate.value;
  const late = next && next <= today();
  $('#rd-hint').textContent = f.elements.auto.checked
    ? late
      ? 'Termin już minął: zaległe operacje od tej daty zapiszą się od razu po zapisaniu.'
      : 'Operacja zapisze się sama w dniu terminu (przy otwarciu aplikacji).'
    : 'W dniu terminu zobaczysz prośbę o zatwierdzenie i będzie można zmienić kwotę (np. rachunek za prąd).';
}

recForm.addEventListener('change', (ev) => ['type', 'auto', 'nextDate'].includes(ev.target.name) && syncRecForm());
$('#rd-cats').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pick]');
  if (!b) return;
  recForm.dataset.cat = recForm.dataset.cat === b.dataset.pick ? '' : b.dataset.pick;
  syncRecForm();
});
recForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = recForm;
  const prev = fin.recurring.find((x) => x.id === f.dataset.id);
  const type = f.elements.type.value;
  const nextDate = f.elements.nextDate.value;
  const r = {
    ...(prev ?? {}),
    id: prev?.id ?? newId(),
    title: f.elements.title.value.trim(),
    type,
    amount: amountOf(f.elements.amount),
    accountId: f.elements.accountId.value || null,
    toAccountId: type === 'przelew' ? f.elements.toAccountId.value || null : null,
    categoryId: type === 'przelew' ? null : f.dataset.cat || null,
    freq: f.elements.freq.value,
    nextDate,
    anchorDay: prev && prev.nextDate === nextDate ? prev.anchorDay : Number(nextDate.slice(8, 10)),
    endDate: f.elements.endDate.value || undefined,
    auto: f.elements.auto.checked,
    paused: (prev && f.elements.paused.checked) || undefined,
  };
  const errors = validateRecurring(r, fin);
  if (errors.length) {
    $('#rd-errors').textContent = errors.join(' ');
    return;
  }
  fin.recurring = prev ? fin.recurring.map((x) => (x.id === r.id ? r : x)) : [...fin.recurring, r];
  save();
  closeDialog(REC);
  toast(prev ? 'Zapisano stałą pozycję.' : `Dodano: ${r.title}, ${FREQS[r.freq].toLowerCase()}.`);
  runRecurring();
  render();
});
$('#rd-delete').addEventListener('click', (ev) => {
  if (!armed(ev.currentTarget, 'Na pewno usunąć?')) return;
  fin.recurring = fin.recurring.filter((r) => r.id !== recForm.dataset.id);
  save();
  closeDialog(REC);
  toast('Usunięto stałą pozycję. Zapisane już operacje zostają.');
  render();
});

// Spłata karty kredytowej: przelew z wybranego konta na kartę.
const REPAY = $('#repay-dialog');
const repayForm = $('form', REPAY);

function openRepay(cardId) {
  const f = repayForm;
  const card = acc(cardId);
  if (!card) return;
  const bal = balances(fin);
  const debt = round2(Math.max(0, -bal[cardId]));
  const sources = activeAccounts().filter((a) => a.id !== cardId && !isCard(a));
  const def = sources.find((a) => a.id === card.payFromId)?.id ?? [...sources].sort((x, y) => bal[y.id] - bal[x.id])[0]?.id ?? '';
  f.dataset.card = cardId;
  f.dataset.debt = String(debt);
  $('#rp-title').textContent = `Spłata karty: ${card.name}`;
  $('#rp-debt').innerHTML = `Zadłużenie: <b class="neg">${esc(zl(debt))}</b>${card.limit ? ` · limit ${esc(zl0(card.limit))}` : ''}`;
  $('#rp-full').textContent = `Całe zadłużenie (${zl(debt)})`;
  f.elements.amount.value = fmtInput(debt);
  f.elements.fromId.innerHTML = accountOptions(def, { none: false, filter: (a) => a.id !== cardId && !isCard(a) });
  f.elements.date.value = today();
  $('#rp-errors').textContent = sources.length ? '' : 'Najpierw dodaj konto, z którego spłacasz kartę (np. konto w banku).';
  syncRepay();
  openDialog(REPAY);
}

function syncRepay() {
  const f = repayForm;
  const amount = amountOf(f.elements.amount) || 0;
  const bal = balances(fin);
  const card = acc(f.dataset.card);
  const from = acc(f.elements.fromId.value);
  $('#rp-after').innerHTML = card && from && amount ? `Po spłacie: <b>${esc(card.name)}</b> ${esc(zl(bal[card.id] + amount))} · <b>${esc(from.name)}</b> ${esc(money(bal[from.id] - amount, from.currency))}` : '';
}

repayForm.addEventListener('input', syncRepay);
repayForm.addEventListener('change', syncRepay);
$('#rp-full').addEventListener('click', () => {
  repayForm.elements.amount.value = fmtInput(Number(repayForm.dataset.debt));
  syncRepay();
});
repayForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = repayForm;
  const card = acc(f.dataset.card);
  const amount = amountOf(f.elements.amount);
  const fromId = f.elements.fromId.value;
  const errors = [];
  if (!(amount > 0)) errors.push('Podaj kwotę spłaty.');
  if (!fromId) errors.push('Wybierz konto, z którego spłacasz.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.elements.date.value)) errors.push('Podaj datę.');
  if (errors.length) {
    $('#rp-errors').textContent = errors.join(' ');
    return;
  }
  fin.txs.push(repaymentTx({ fromId, cardId: card.id, amount, date: f.elements.date.value, newId }));
  card.payFromId = fromId;
  save();
  closeDialog(REPAY);
  toast(`Spłacono ${zl(amount)}. Saldo karty: ${zl(balances(fin)[card.id])}.`);
  render();
});

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
  const tx = { type: 'wydatek', amount: Number.isFinite(amount) ? amount : undefined, date: when.date, merchant, categoryId: category?.id ?? applyRules(merchant, fin.rules), accountId: accountForCard(fin.accounts, p.get('karta') ?? '') ?? defaultAccount('wydatek') };
  if (p.get('zapisz') === '1' && amount > 0) {
    const r = mergeImported(fin, [{ ...tx, time: when.time, source: 'applepay', importKey: `ap|${when.date}|${when.time ?? ''}|${amount.toFixed(2)}|${merchant.toLowerCase()}` }], { newId });
    fin = r.fin;
    save();
    toast(r.added ? `Zapisano ${zl(amount)} – ${merchant}.` : 'Ta płatność była już zapisana.');
    render();
  } else openTx(null, tx);
}
window.addEventListener('hashchange', handleHash);

// Po powrocie do aplikacji następnego dnia: zapisz stałe pozycje i odśwież „dziś”.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ui.day === today()) return;
  ui.day = today();
  runRecurring();
  render();
});

runRecurring();
render();
handleHash();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
