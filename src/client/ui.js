// Interfejs aplikacji: zakładki, Portfel (dziennik, wykres, podatki, limity), kalkulatory w podkarcie Podatki (zakładka Rynki),
// ustawienia i synchronizacja. Korzysta z funkcji z core.js (wklejonych wyżej w tym samym skrypcie).

const D = JSON.parse(document.getElementById('gem-data').textContent);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NF0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF4 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 4 });
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_FULL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const pln = (x) => (Number.isFinite(x) ? `${NF0.format(Math.round(x))} zł` : '–');
const plnSigned = (x) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${NF0.format(Math.abs(Math.round(x)))} zł` : '–');
const pct = (x, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d).replace('.', ',')}%` : '–');
const tone = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const dShort = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
const KEYS = { tx: 'gem.v1.transactions', settings: 'gem.v1.settings', sync: 'gem.v1.sync', ui: 'gem.v1.ui' };

const state = {
  txs: store.get(KEYS.tx, []),
  settings: { taxForm: 'skala12', ryczaltRate: 0.12, selfEmployed: false, defaultAccount: 'IKE', theme: 'auto', budget: 30000, ...store.get(KEYS.settings, {}) },
  sync: store.get(KEYS.sync, null),
  ui: { account: 'ALL', range: 'MAX', from: null, to: null, mode: 'pct', bench: { gem: true, sp500: false }, ...store.get(KEYS.ui, {}) },
};
const DATA_DAY = lastDataDate(D.prices) ?? todayIso();

// ---------- Biblioteka instrumentów XTB ----------
// Nazwa instrumentu: ETF-y strategii z konfiguracji, pozostałe – nazwa zapisana przy transakcji (z katalogu XTB).
function tickerName(ticker) {
  return D.instruments[ticker]?.name ?? state.txs.find((x) => x.ticker === ticker && x.name)?.name ?? '';
}
// Ceny instrumentów spoza strategii (GPW, obserwowane z USA, ETF-y UCITS wyceniane przez indeks) z data/notowania.js.
let libraryData = null;
async function ensureLibraryPrices() {
  const missing = [...new Set(activeTx(state.txs).filter((t) => t.ticker && !D.instruments[t.ticker]).map((t) => t.ticker))];
  if (!missing.length) return false;
  libraryData = libraryData ?? (await instLoadQuotes());
  if (!libraryData) return false;
  let added = false;
  for (const sym of missing) {
    if (D.prices.instruments[sym]?.library) continue;
    const currency = state.txs.find((t) => t.ticker === sym && t.currency)?.currency ?? 'USD';
    const entry = instEntry(libraryData, sym, currency, D.prices.fx);
    if (entry) {
      D.prices.instruments[sym] = { ...entry, library: true };
      added = true;
    }
  }
  return added;
}
function refreshLibraryPrices() {
  ensureLibraryPrices()
    .then((added) => {
      if (added && !$('#tab-portfel').hidden) renderPortfolio();
      publishGemSummary();
    })
    .catch(() => publishGemSummary());
}

// Wycena rachunków portfela GEM dla dziennika finansowego (ta sama przeglądarka, klucz gem.v1.summary): konto
// w Finansach powiązane np. z IKE pokazuje wartość, wpłaty netto i zysk bez ponownego wpisywania ETF-ów.
function publishGemSummary() {
  try {
    const r2 = (x) => Math.round(x * 100) / 100;
    const live = activeTx(state.txs);
    const accounts = {};
    for (const acc of ACCOUNTS) {
      const own = live.filter((t) => t.account === acc);
      if (!own.length) continue;
      const points = buildTimeline(state.txs, D.prices, { account: acc, today: DATA_DAY }).points;
      const last = points.at(-1);
      // Wartość na koniec każdego miesiąca – do wykresu majątku w Finansach (bez niej historia pokazywałaby same wpłaty).
      const history = points.filter((p, i) => i === points.length - 1 || points[i + 1].date.slice(0, 7) !== p.date.slice(0, 7)).map((p) => [p.date, r2(p.value)]);
      if (last) accounts[acc] = { value: r2(last.value), invested: r2(last.invested), date: last.date, history: history.slice(-240) };
      else {
        const net = own.reduce((s, t) => s + (t.type === 'wplata' ? t.amountPLN || 0 : t.type === 'wyplata' ? -(t.amountPLN || 0) : 0), 0);
        accounts[acc] = { value: r2(net), invested: r2(net), date: DATA_DAY };
      }
    }
    store.set('gem.v1.summary', { date: DATA_DAY, updatedAt: Date.now(), accounts });
  } catch {
    // wycena dla dziennika nie jest konieczna do działania portfela
  }
}
const saveUi = () => store.set(KEYS.ui, state.ui);
const taxRate = () => (state.settings.taxForm === 'ryczalt' ? Number(state.settings.ryczaltRate) || 0 : D.podatki.taxForms[state.settings.taxForm]?.rate ?? 0.12);

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

// ---------- Zakładki ----------
// Menu: GEM (Sygnał, Mój portfel GEM), Finanse (osobna strona) i Rynki (Przegląd, Instrumenty, Podatki).
// Każda podkarta ma własny adres (#sygnal, #portfel, #rynki, #instrumenty, #podatki).
const TABS = ['sygnal', 'portfel', 'rynki', 'instrumenty', 'podatki'];
const NAV_OF = { sygnal: 'gem', portfel: 'gem', rynki: 'rynki', instrumenty: 'rynki', podatki: 'rynki' };
// Ostatnio otwarta podkarta w każdej części – menu wraca do niej (np. GEM → Mój portfel GEM).
const lastSub = {};
function showTab(id, scroll = true) {
  if (!TABS.includes(id)) id = 'sygnal';
  const nav = NAV_OF[id];
  lastSub[nav] = id;
  for (const t of TABS) $(`#tab-${t}`).hidden = t !== id;
  for (const a of $$('[data-tab]')) a.setAttribute('aria-current', a.dataset.tab === nav ? 'page' : 'false');
  for (const sub of $$('.subnav[data-group]')) {
    sub.hidden = sub.dataset.group !== nav;
    for (const a of $$('[data-sub]', sub)) a.setAttribute('aria-current', a.dataset.sub === id ? 'page' : 'false');
  }
  if (id === 'portfel') renderPortfolio();
  if (id === 'instrumenty') renderInstruments();
  if (id === 'podatki') renderTaxTools();
  if (scroll) window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
for (const a of $$('nav.tabs [data-tab]')) {
  a.addEventListener('click', (ev) => {
    const target = lastSub[a.dataset.tab];
    if (!target || location.hash.slice(1) === target) return;
    ev.preventDefault();
    location.hash = target;
  });
}

// Strona startowa aplikacji (wspólne ustawienie z dziennikiem finansowym).
const START_KEY = 'gem.start';
const startPage = () => {
  try {
    return localStorage.getItem(START_KEY) || 'gem';
  } catch {
    return 'gem';
  }
};

// ---------- Zapisywanie transakcji ----------
function saveTxs(txs, { sync = true } = {}) {
  state.txs = txs;
  if (!store.set(KEYS.tx, txs)) toast('Nie udało się zapisać danych w przeglądarce (tryb prywatny?). Wyeksportuj kopię.');
  if (sync && state.sync?.token) schedulePush();
  publishGemSummary();
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3500);
}

// ---------- Zakres dat ----------
const PRESETS = [
  ['1M', '1 mies.'],
  ['3M', '3 mies.'],
  ['6M', '6 mies.'],
  ['YTD', 'Od początku roku'],
  ['1R', '1 rok'],
  ['3L', '3 lata'],
  ['MAX', 'Wszystko'],
];
function resolveRange(points) {
  const first = points[0].date;
  const last = points[points.length - 1].date;
  const clamp = (d) => (d < first ? first : d > last ? last : d);
  const r = state.ui.range;
  if (r === 'CUSTOM' && state.ui.from && state.ui.to) return { from: clamp(state.ui.from), to: clamp(state.ui.to) };
  const back = { '1M': -1, '3M': -3, '6M': -6, '1R': -12, '3L': -36 }[r];
  if (back) return { from: clamp(isoAddMonths(last, back)), to: last };
  if (r === 'YTD') return { from: clamp(`${last.slice(0, 4)}-01-01`), to: last };
  return { from: first, to: last };
}

// ---------- Wykres (SVG) ----------
function niceTicks(min, max, count = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

function drawChart(el, { lines, format, onSelect }) {
  const W = Math.max(280, el.clientWidth || 320);
  const H = W < 520 ? 230 : 300;
  const all = lines.flatMap((l) => l.points);
  if (!all.length) {
    el.innerHTML = '<p class="muted center">Brak danych w wybranym okresie.</p>';
    return;
  }
  const ts = (d) => Date.parse(`${d}T00:00:00Z`);
  const xs = all.map((p) => ts(p[0]));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs) === x0 ? x0 + 86400000 : Math.max(...xs);
  let y0 = Math.min(...all.map((p) => p[1]));
  let y1 = Math.max(...all.map((p) => p[1]));
  if (format === 'pct') {
    y0 = Math.min(0, y0);
    y1 = Math.max(0, y1);
  }
  const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.05 || 1;
  y0 -= pad;
  y1 += pad;
  // Opisy osi to pełne kwoty (np. 125 000), bez skrótów „tys.” i „mln”; lewy margines dopasowuje się do najdłuższego.
  const fmtY = (v) => (format === 'pct' ? `${(v * 100).toFixed(Math.abs(y1 - y0) < 0.1 ? 1 : 0).replace('.', ',')}%` : NF0.format(Math.round(v) || 0).replace(/^-/, '−'));
  const yTicks = niceTicks(y0, y1, 5);
  const labelW = Math.max(...yTicks.map((v) => [...fmtY(v)].reduce((w, ch) => w + (/\s/.test(ch) ? 3.2 : 6.8), 0)));
  const M = { l: Math.max(46, Math.ceil(labelW) + 14), r: 12, t: 14, b: 28 };
  const X = (t) => M.l + ((t - x0) / (x1 - x0)) * (W - M.l - M.r);
  const Y = (v) => M.t + (1 - (v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const spanDays = (x1 - x0) / 86400000;
  const xTicks = [];
  for (let i = 0; i <= 4; i++) xTicks.push(x0 + ((x1 - x0) * i) / 4);
  const fmtX = (t) => {
    const d = new Date(t);
    return spanDays > 300 ? `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(ts(p[0])).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const parts = [];
  parts.push(`<defs><linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>`);
  for (const v of yTicks) parts.push(`<line class="grid${v === 0 && format === 'pct' ? ' zero' : ''}" x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${M.l - 8}" y="${Y(v) + 4}" text-anchor="end">${fmtY(v)}</text>`);
  xTicks.forEach((t, i) => parts.push(`<text class="axis" x="${X(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}">${fmtX(t)}</text>`));
  for (const l of lines) {
    if (!l.points.length) continue;
    if (l.area) parts.push(`<path class="area" d="${path(l.points)}L${X(ts(l.points[l.points.length - 1][0]))},${Y(Math.max(y0, 0))}L${X(ts(l.points[0][0]))},${Y(Math.max(y0, 0))}Z"/>`);
    parts.push(`<path class="line ${l.cls}" d="${path(l.points)}"/>`);
  }
  parts.push('<line class="cross" x1="0" x2="0" y1="0" y2="0" visibility="hidden"/><rect class="sel" x="0" y="0" width="0" height="0" visibility="hidden"/>');
  for (const l of lines) parts.push(`<circle class="dot ${l.cls}" r="4" visibility="hidden"/>`);
  el.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Wykres portfela">${parts.join('')}</svg><div class="tip" hidden></div>`;

  const svg = $('svg', el);
  const tip = $('.tip', el);
  const cross = $('.cross', svg);
  const sel = $('.sel', svg);
  const dots = $$('.dot', svg);
  const base = lines[0].points;
  const baseTs = base.map((p) => ts(p[0]));
  const nearest = (px) => {
    const t = x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0);
    let lo = 0;
    let hi = baseTs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (baseTs[mid] < t) lo = mid;
      else hi = mid;
    }
    return Math.abs(baseTs[lo] - t) <= Math.abs(baseTs[hi] - t) ? lo : hi;
  };
  const localX = (ev) => {
    const r = svg.getBoundingClientRect();
    return ((ev.clientX - r.left) / r.width) * W;
  };
  let dragFrom = null;
  const showAt = (px) => {
    const i = nearest(px);
    const date = base[i][0];
    const x = X(baseTs[i]);
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.setAttribute('y1', M.t);
    cross.setAttribute('y2', H - M.b);
    cross.setAttribute('visibility', 'visible');
    const rows = [];
    lines.forEach((l, k) => {
      const p = lastOnOrBefore(l.points, date);
      if (!p) return dots[k].setAttribute('visibility', 'hidden');
      dots[k].setAttribute('cx', x);
      dots[k].setAttribute('cy', Y(p[1]));
      dots[k].setAttribute('visibility', 'visible');
      rows.push(`<div><i class="sw ${l.cls}"></i>${esc(l.name)}: <b>${format === 'pct' ? pct(p[1]) : pln(p[1])}</b></div>`);
    });
    tip.innerHTML = `<div class="tip-date">${dShort(date)}</div>${rows.join('')}`;
    tip.hidden = false;
    const r = svg.getBoundingClientRect();
    const left = (x / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth)}px`;
    return date;
  };
  svg.addEventListener('pointerdown', (ev) => {
    dragFrom = { px: localX(ev), date: showAt(localX(ev)) };
    svg.setPointerCapture(ev.pointerId);
  });
  svg.addEventListener('pointermove', (ev) => {
    const px = localX(ev);
    showAt(px);
    if (dragFrom && Math.abs(px - dragFrom.px) > 6) {
      const a = Math.max(M.l, Math.min(px, dragFrom.px));
      const b = Math.min(W - M.r, Math.max(px, dragFrom.px));
      sel.setAttribute('x', a);
      sel.setAttribute('y', M.t);
      sel.setAttribute('width', b - a);
      sel.setAttribute('height', H - M.t - M.b);
      sel.setAttribute('visibility', 'visible');
    }
  });
  const end = (ev) => {
    if (!dragFrom) return;
    const px = localX(ev);
    const moved = Math.abs(px - dragFrom.px) > 12;
    const a = dragFrom.date;
    const b = base[nearest(px)][0];
    dragFrom = null;
    sel.setAttribute('visibility', 'hidden');
    if (moved && a !== b) onSelect(a < b ? a : b, a < b ? b : a);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => {
    dragFrom = null;
    sel.setAttribute('visibility', 'hidden');
  });
  svg.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'mouse' && !dragFrom) {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    }
  });
}

// ---------- Portfel ----------
function txsFor(account) {
  return activeTx(state.txs).filter((t) => account === 'ALL' || t.account === account);
}

function emptyPortfolio() {
  return `<section class="card empty">
  <div class="empty-icon">📒</div>
  <h2 class="h2-plain">Zacznij prowadzić historię inwestycji</h2>
  <p>Zapisuj tu wpłaty i transakcje z XTB (albo innego brokera). Aplikacja wyceni portfel w złotych na podstawie kursów NBP, policzy stopę zwrotu w dowolnym okresie, pokaże zysk do PIT-38 i wykorzystanie limitów IKE/IKZE.</p>
  <ol class="steps-mini"><li>Dodaj <b>wpłatę</b> na rachunek (IKE, IKZE, OKI albo zwykły).</li><li>Dodaj <b>kupno</b> ETF-u: liczbę jednostek i cenę z potwierdzenia transakcji.</li><li>Przy zmianie sygnału GEM dodaj <b>sprzedaż</b> starego i <b>kupno</b> nowego ETF-u.</li></ol>
  <div class="row-btns"><button class="btn primary" data-act="add">Dodaj pierwszą transakcję</button><button class="btn" data-act="demo">Pokaż przykładowe dane</button><button class="btn ghost" data-act="import">Wczytaj kopię</button></div>
  <p class="muted small">Dane zapisują się w tej przeglądarce. W Ustawieniach możesz włączyć synchronizację z prywatnym repozytorium GitHub, aby mieć je na telefonie i komputerze.</p>
</section>`;
}

function renderPortfolio() {
  const root = $('#portfel-root');
  const active = activeTx(state.txs);
  if (!active.some((t) => t.type === 'kupno' || t.type === 'sprzedaz')) {
    root.innerHTML = emptyPortfolio() + contributionsCard() + dataCard();
    bindPortfolio(root);
    return;
  }
  const accounts = ['ALL', ...ACCOUNTS.filter((a) => active.some((t) => t.account === a && (t.type === 'kupno' || t.type === 'sprzedaz')))];
  if (!accounts.includes(state.ui.account)) state.ui.account = 'ALL';
  const acc = state.ui.account;
  const tl = buildTimeline(state.txs, D.prices, { account: acc, today: DATA_DAY });
  const pts = tl.points;
  const last = pts[pts.length - 1];
  const total = rangeStats(pts, pts[0].date, last.date);
  const range = resolveRange(pts);
  const stats = rangeStats(pts, range.from, range.to);
  const demo = active.some((t) => t.demo);

  root.innerHTML = `
  ${demo ? '<div class="banner info">Widzisz przykładowe dane. <button class="link" data-act="clear-demo">Usuń przykładowe dane</button></div>' : ''}
  ${tl.issues.length ? `<div class="banner warn">${tl.issues.slice(0, 3).map(esc).join('<br>')}</div>` : ''}
  <div class="seg-scroll"><div class="seg" role="tablist">${accounts.map((a) => `<button data-acc="${a}" class="${a === acc ? 'on' : ''}">${ACCOUNT_LABELS[a]}</button>`).join('')}</div></div>
  <div class="kpis">
    <div class="kpi"><span>Wartość</span><b>${pln(last.value)}</b><small>wycena na ${dShort(last.date)}</small></div>
    <div class="kpi"><span>Wpłacono netto</span><b>${pln(last.invested)}</b><small>zakupy minus sprzedaże</small></div>
    <div class="kpi ${tone(total.gain)}"><span>Zysk łącznie</span><b>${plnSigned(total.gain)}</b><small>${pct(total.twr)} od ${dShort(pts[0].date)}</small></div>
    <div class="kpi"><span>Średnio rocznie</span><b>${total.annualized === null ? '–' : pct(total.annualized)}</b><small>${total.annualized === null ? 'pojawi się po roku' : 'stopa ważona czasem'}</small></div>
  </div>
  <section class="card">
    <div class="card-head"><h2>Wykres zwrotu</h2><div class="seg small">${[['pct', 'Stopa zwrotu'], ['pln', 'Wartość']].map(([k, l]) => `<button data-mode="${k}" class="${state.ui.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="chips scroll" role="group" aria-label="Zakres">${PRESETS.map(([k, l]) => `<button class="chip-btn ${state.ui.range === k ? 'on' : ''}" data-range="${k}">${l}</button>`).join('')}</div>
    <div class="dates"><label>Od <input type="date" id="r-from" value="${range.from}" min="${pts[0].date}" max="${last.date}"></label><label>Do <input type="date" id="r-to" value="${range.to}" min="${pts[0].date}" max="${last.date}"></label>${state.ui.range === 'CUSTOM' ? '<button class="link" data-range="MAX">Resetuj</button>' : ''}</div>
    ${state.ui.mode === 'pct' ? `<div class="chips legend">${[['gem', 'Model GEM'], ['sp500', 'S&P 500 w PLN']].map(([k, l]) => `<button class="chip-btn bench-${k} ${state.ui.bench[k] ? 'on' : ''}" data-bench="${k}" ${D.prices.benchmarks?.[k]?.length ? '' : 'disabled'}><i class="sw ${k}"></i>${l}</button>`).join('')}</div>` : ''}
    <div id="chart" class="chart"></div>
    <p class="muted small hint">Przesuń palcem lub myszą po wykresie, aby zobaczyć wartości. Przeciągnij, aby zaznaczyć okres.</p>
    ${stats ? `<div class="stats">
      <div><span>Zysk w okresie</span><b class="${tone(stats.gain)}">${plnSigned(stats.gain)}</b></div>
      <div><span>Stopa zwrotu (TWR)</span><b class="${tone(stats.twr)}">${pct(stats.twr)}</b></div>
      <div><span>Rocznie</span><b>${stats.annualized === null ? '–' : pct(stats.annualized)}</b></div>
      <div><span>Maks. obsunięcie</span><b class="${stats.maxDrawdown < 0 ? 'neg' : ''}">${pct(stats.maxDrawdown)}</b></div>
      <div><span>Wartość na początku</span><b>${pln(stats.startValue)}</b></div>
      <div><span>Wpłaty netto w okresie</span><b>${plnSigned(stats.flows)}</b></div>
    </div><p class="muted small">Okres: ${dShort(stats.from)} – ${dShort(stats.to)}. Stopa ważona czasem (TWR) pomija wpływ dopłat i wypłat, więc można ją porównać z rynkiem.</p>` : ''}
  </section>
  ${holdingsCard(acc)}
  ${acc === 'ALL' || acc === 'ZWYKLE' ? taxCard() : ''}
  ${contributionsCard()}
  ${transactionsCard(acc)}
  ${dataCard()}`;

  const chartEl = $('#chart', root);
  const lines = [];
  if (state.ui.mode === 'pct') {
    const inRange = pts.filter((p) => p.date >= range.from && p.date <= range.to);
    const i0 = pts.indexOf(inRange[0]);
    const baseIdx = i0 > 0 ? pts[i0 - 1].index : 1;
    const baseDate = i0 > 0 ? pts[i0 - 1].date : inRange[0].date;
    lines.push({ name: 'Twój portfel', cls: 'main', points: [...(i0 > 0 ? [[baseDate, 0]] : []), ...inRange.map((p) => [p.date, p.index / baseIdx - 1])] });
    for (const [k, l] of [['gem', 'Model GEM'], ['sp500', 'S&P 500 w PLN']]) {
      if (state.ui.bench[k] && D.prices.benchmarks?.[k]?.length) lines.push({ name: l, cls: k, points: rebase(D.prices.benchmarks[k], baseDate, range.to) });
    }
  } else {
    const inRange = pts.filter((p) => p.date >= range.from && p.date <= range.to);
    lines.push({ name: 'Wartość portfela', cls: 'main', area: true, points: inRange.map((p) => [p.date, p.value]) });
    lines.push({ name: 'Wpłacono netto', cls: 'invested', points: inRange.map((p) => [p.date, p.invested]) });
  }
  const paint = () =>
    drawChart(chartEl, {
      lines,
      format: state.ui.mode,
      onSelect: (from, to) => {
        Object.assign(state.ui, { range: 'CUSTOM', from, to });
        saveUi();
        renderPortfolio();
      },
    });
  paint();
  renderPortfolio.onResize = paint;
  bindPortfolio(root);
}

function holdingsCard(acc) {
  const list = holdings(txsFor(acc), D.prices, DATA_DAY);
  if (!list.length) return '';
  const target = D.signal?.ticker;
  const rows = list
    .map((h) => {
      const ok = matchesSignal(h.ticker);
      const lib = D.prices.instruments[h.ticker]?.library ? D.prices.instruments[h.ticker] : null;
      return `<tr><td><b>${esc(h.ticker)}</b> <span class="tag">${esc(ACCOUNT_LABELS[h.account])}</span><div class="muted small">${esc(tickerName(h.ticker))}</div>${lib ? `<div class="muted small">${esc(instSourceLabel(lib, libraryData))}</div>` : ''}${target ? `<div class="small ${ok ? 'pos' : 'warn'}">${ok ? '✓ zgodne z sygnałem' : `sygnał GEM: ${esc(target)}`}</div>` : ''}</td><td class="num">${NF4.format(h.quantity)}</td><td class="num">${pln(h.value)}<div class="muted small">${Math.round(h.weight * 100)}%</div></td><td class="num ${tone(h.gain)}">${plnSigned(h.gain)}<div class="small">${pct(h.gainPct)}</div></td></tr>`;
    })
    .join('');
  return `<section class="card"><h2>Pozycje</h2><div class="tbl-wrap"><table><thead><tr><th>Instrument</th><th class="num">Jednostki</th><th class="num">Wartość</th><th class="num">Zysk</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted small">Wycena: ostatnia cena z Twoich transakcji lub wycen, przesunięta o zmianę indeksu i kursu NBP. Aby zgrać się z XTB co do grosza, dodaj czasem „Wycenę” z ceną z aplikacji.</p></section>`;
}

function taxCard() {
  const year = DATA_DAY.slice(0, 4);
  const r = realizedGains(state.txs, D.prices.fx);
  const hasRegular = activeTx(state.txs).some((t) => t.account === 'ZWYKLE' && (t.type === 'kupno' || t.type === 'sprzedaz'));
  if (!hasRegular) return '';
  const y = r.byYear[year] ?? { revenue: 0, costs: 0, income: 0, tax: 0 };
  const h = harvestCandidates(state.txs, D.prices, DATA_DAY);
  const years = Object.entries(r.byYear).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return `<section class="card"><h2>Podatek – konto zwykłe (${year})</h2>
  <div class="stats">
    <div><span>Przychód</span><b>${pln(y.revenue)}</b></div>
    <div><span>Koszty</span><b>${pln(y.costs)}</b></div>
    <div><span>Dochód / strata</span><b class="${tone(y.income)}">${plnSigned(y.income)}</b></div>
    <div><span>Szacowany podatek 19%</span><b>${pln(y.tax)}</b></div>
  </div>
  ${h.candidates.length && h.ytdIncome > 0 ? `<div class="banner info"><b>Możesz obniżyć podatek o ok. ${pln(h.potentialSaving)}.</b> ${h.candidates.map((c) => `${esc(c.ticker)}: strata ${pln(c.loss)}`).join(', ')}. Sprzedaż przed końcem roku zrealizuje stratę, a ponowny zakup jest w Polsce dozwolony od razu. Rozliczenie trwa 2 sesje, więc zrób to najpóźniej kilka dni przed 31 grudnia.</div>` : ''}
  ${years.length > 1 ? `<details><summary>Poprzednie lata</summary><table><tbody>${years.map(([yy, v]) => `<tr><td>${yy}</td><td class="num ${tone(v.income)}">${plnSigned(v.income)}</td><td class="num">${pln(v.tax)}</td></tr>`).join('')}</tbody></table></details>` : ''}
  ${r.issues.length ? `<p class="small warn">${r.issues.slice(0, 3).map(esc).join('<br>')}</p>` : ''}
  <p class="muted small">Liczone jak w PIT-38: kolejka FIFO, kurs średni NBP z dnia roboczego przed transakcją, prowizje w kosztach. To szacunek. Wiążący jest PIT-8C od brokera. Strata z danego roku obniża dochody z kolejnych 5 lat (maks. 50% straty w jednym roku albo jednorazowo do 5 mln zł).</p></section>`;
}

function contributionsCard() {
  const year = Number(todayIso().slice(0, 4));
  const used = contributions(state.txs, year);
  const lim = limitsFor(D.podatki, year);
  const ikzeLimit = state.settings.selfEmployed ? lim.ikzeFirma : lim.ikze;
  const bar = (v, max) => `<div class="meter"><span style="width:${Math.min(100, (v / max) * 100)}%"></span></div>`;
  return `<section class="card"><h2>Limity ${year}</h2>
  <div class="limit"><div class="limit-row"><b>IKE</b><span>${pln(used.IKE)} z ${pln(lim.ike)}</span></div>${bar(used.IKE, lim.ike)}<div class="muted small">Zostało ${pln(Math.max(0, lim.ike - used.IKE))}</div></div>
  <div class="limit"><div class="limit-row"><b>IKZE</b><span>${pln(used.IKZE)} z ${pln(ikzeLimit)}</span></div>${bar(used.IKZE, ikzeLimit)}<div class="muted small">Zostało ${pln(Math.max(0, ikzeLimit - used.IKZE))} · szacowany zwrot podatku z tegorocznych wpłat: <b>${pln(used.IKZE * taxRate())}</b></div></div>
  ${lim.exact ? '' : `<p class="small warn">Brak limitów na ${year} r. w konfiguracji – pokazuję limity z ${lim.year} r.</p>`}
  <p class="muted small">Liczone z wpisów „Wpłata” w Twoim dzienniku. Limit dotyczy wpłat, nie zysków. Niewykorzystany limit przepada 31 grudnia.</p></section>`;
}

function transactionsCard(acc) {
  const list = sortTx(txsFor(acc)).reverse();
  const groups = new Map();
  for (const t of list) {
    const k = t.date.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const fx = D.prices.fx;
  const item = (t) => {
    const cash = t.type === 'kupno' || t.type === 'sprzedaz' ? cashPLN(t, fx) : t.amountPLN;
    // Z perspektywy gotówki na rachunku: kupno i wypłata zmniejszają ją, sprzedaż i wpłata zwiększają.
    const sign = t.type === 'kupno' || t.type === 'wyplata' ? '−' : '+';
    const detail = t.type === 'kupno' || t.type === 'sprzedaz' ? `${NF4.format(t.quantity)} × ${NF2.format(t.price)} ${esc(t.currency)}` : t.type === 'wycena' ? `cena ${NF2.format(t.price)} ${esc(t.currency)}` : 'przelew';
    return `<button class="tx" data-edit="${esc(t.id)}"><span class="tx-type t-${t.type}">${TX_LABELS[t.type]}</span><span class="tx-main"><b>${esc(t.ticker || ACCOUNT_LABELS[t.account])}</b> <span class="tag">${esc(ACCOUNT_LABELS[t.account])}</span><small>${detail}${t.note ? ` · ${esc(t.note)}` : ''}</small></span><span class="tx-amt">${t.type === 'wycena' ? '' : `${sign}${pln(cash)}`}<small>${dShort(t.date)}</small></span></button>`;
  };
  return `<section class="card"><div class="card-head"><h2>Historia transakcji</h2><button class="btn primary small" data-act="add">+ Dodaj</button></div>
  ${[...groups].map(([m, txs]) => `<div class="tx-month">${MONTHS_FULL[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}</div>${txs.map(item).join('')}`).join('') || '<p class="muted">Brak transakcji dla tego rachunku.</p>'}
  </section>`;
}

// ---------- Rynki → Instrumenty ----------
// Wyszukiwarka akcji i ETF-ów z oferty XTB (cena i źródło wyceny) oraz porównanie funduszy ING TFI (np. z PPE).
let instrumentsMounted = false;
function renderInstruments() {
  const root = $('#instrumenty-root');
  if (!root || instrumentsMounted) return;
  instrumentsMounted = true;
  root.innerHTML = libraryCard() + bondsCard() + fundsCard() + goldCard() + cryptoCard();
  mountLibrary(root);
  mountBonds(root);
  mountFunds(root);
  mountGold(root);
  mountCrypto(root);
  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act="lib-add"]');
    if (!b) return;
    const known = Boolean(D.instruments[b.dataset.sym]);
    location.hash = 'portfel';
    openTxDialog(null, { ticker: b.dataset.sym, currency: b.dataset.cur, name: known ? undefined : b.dataset.name });
  });
}

function fundsCard() {
  return `<section class="card" id="funds-card"><div class="card-head"><h2>Fundusze ING TFI (PPE, PPK, IKE)</h2><label class="small">Kategoria jednostek <select id="fund-cat"></select></label></div>
  <div id="funds-body"><p class="muted small">Ładowanie wycen…</p></div>
  <p class="meta">Wyceny jednostek z ING TFI, aktualizowane w dni robocze. W PPE kategoria jednostek zależy od umowy pracodawcy (zwykle E, F, S, T lub W) – sprawdzisz ją w serwisie ING TFI24. Swoje fundusze z PPE dodasz w Finansach: konto inwestycyjne → Aktywa → „+ Fundusz ING TFI (PPE)”. Wyniki z przeszłości nie gwarantują przyszłych.</p></section>`;
}

const FUND_CAT_KEY = 'gem.fundCategory';
async function mountFunds(root) {
  const body = $('#funds-body', root);
  const sel = $('#fund-cat', root);
  const data = await instLoadFunds();
  if (!data?.funds?.length) {
    body.innerHTML = '<p class="muted small">Wyceny funduszy pojawią się po najbliższej aktualizacji aplikacji.</p>';
    sel.hidden = true;
    return;
  }
  const order = [...FUND_PPE_CATEGORIES, 'A', 'K', 'I'];
  const cats = [...new Set(data.funds.flatMap((f) => f.cats))].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  let saved = 'E';
  try {
    saved = localStorage.getItem(FUND_CAT_KEY) || 'E';
  } catch {
    // brak dostępu do pamięci przeglądarki – zostaje kategoria E
  }
  sel.innerHTML = cats.map((c) => `<option value="${esc(c)}" ${c === saved ? 'selected' : ''}>${esc(c)} – ${esc(data.categories?.[c] ?? '')}</option>`).join('');
  const draw = () => {
    const c = sel.value;
    const list = data.funds.filter((f) => f.cats.includes(c)).sort((x, y) => FUND_TYPE_ORDER.indexOf(x.type) - FUND_TYPE_ORDER.indexOf(y.type) || x.name.localeCompare(y.name, 'pl'));
    const types = [...new Set(list.map((f) => f.type))];
    const cell = (x) => `<td class="num ${Number.isFinite(x) ? (x >= 0 ? 'pos' : 'neg') : ''}">${Number.isFinite(x) ? pct(x) : '–'}</td>`;
    body.innerHTML = `<div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th>Fundusz</th><th class="num">Jednostka</th><th class="num opt">1 mies.</th><th class="num">12 mies.</th><th class="num opt">Od 1.01</th><th class="num">5 lat</th></tr></thead><tbody>${types
      .map((t) => `<tr class="grp"><td colspan="6">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</td></tr>${list
        .filter((f) => f.type === t)
        .map((f) => {
          const last = fundQuotes(data, fundSymbol(f.id, c)).at(-1);
          const r = f.ret?.[c] ?? {};
          return `<tr><td>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}<div class="small muted">${esc(f.umbrella)} · ryzyko ${esc(f.risk ?? '–')}/7</div></td><td class="num">${last ? NF2.format(last[1]) : '–'}</td>${cell(r['1M']).replace('<td class="num', '<td class="num opt')}${cell(r['12M'])}${cell(r.YTD).replace('<td class="num', '<td class="num opt')}${cell(r['60M'])}</tr>`;
        })
        .join('')}`)
      .join('')}</tbody></table></div><p class="small muted">Wyceny z ${data.asOf ? dShort(data.asOf) : '–'} (${list.length} ${list.length === 1 ? 'fundusz' : list.length % 10 >= 2 && list.length % 10 <= 4 && (list.length % 100 < 12 || list.length % 100 > 14) ? 'fundusze' : 'funduszy'} w kategorii ${esc(c)}).</p>`;
  };
  sel.addEventListener('change', () => {
    try {
      localStorage.setItem(FUND_CAT_KEY, sel.value);
    } catch {
      // ustawienie tylko na tę sesję
    }
    draw();
  });
  draw();
}

// ---------- Obligacje skarbowe, złoto i kryptowaluty (dane z data/obligacje.js, data/zloto.js, data/krypto.js) ----------
const pctPlain = (x) => `${NF2.format(x).replace(/,00$/, '')}%`;
const signedCell = (x) => `<td class="num ${Number.isFinite(x) ? (x >= 0 ? 'pos' : 'neg') : ''}">${Number.isFinite(x) ? pct(x) : '–'}</td>`;

function bondsCard() {
  return `<section class="card" id="bonds-card"><h2>Obligacje skarbowe</h2>
  <div id="bonds-body"><p class="muted small">Ładowanie oferty…</p></div>
  <p class="meta">Oferta z obligacjeskarbowe.pl zmienia się co miesiąc. Obligacje indeksowane (COI, ROS, EDO, ROD) od 2. roku mają oprocentowanie: inflacja z GUS + marża, a zmiennoprocentowe (ROR, DOR): stopa referencyjna NBP + marża. Swoje obligacje dodasz w Finansach: konto → Aktywa → „+ Obligacje skarbowe” – aplikacja policzy odsetki, wypłaty i kwotę przy wcześniejszym wykupie.</p></section>`;
}

async function mountBonds(root) {
  const body = $('#bonds-body', root);
  const data = await assetLoadBonds();
  if (!data?.offer?.length) {
    body.innerHTML = '<p class="muted small">Oferta obligacji pojawi się po najbliższej aktualizacji aplikacji.</p>';
    return;
  }
  const cpi = data.cpi?.at(-1);
  const ref = data.ref?.at(-1);
  const order = Object.keys(BOND_TYPES);
  const rows = data.offer
    .map((code) => ({ code, s: data.series[code] }))
    .filter((x) => x.s && BOND_TYPES[x.s.type])
    .sort((a, b) => order.indexOf(a.s.type) - order.indexOf(b.s.type))
    .map(({ code, s }) => {
      const t = BOND_TYPES[s.type];
      const term = t.months < 12 ? `${t.months} mies.` : t.months === 12 ? '1 rok' : t.months < 60 ? `${t.months / 12} lata` : `${t.months / 12} lat`;
      const base = t.kind === 'inflacja' ? cpi?.[1] : t.kind === 'nbp' ? ref?.[1] : null;
      const later = t.kind === 'stale' ? 'stałe' : `${t.kind === 'inflacja' ? 'inflacja' : 'stopa NBP'} + ${pctPlain(s.margin ?? 0)}${Number.isFinite(base) ? `<div class="small muted">dziś ok. ${pctPlain(Math.max(0, base) + (s.margin ?? 0))}</div>` : ''}`;
      const payout = t.pay ? (t.step === 1 ? 'co miesiąc' : 'co rok') : t.cap ? 'dopisywane co rok, wypłata przy wykupie' : 'przy wykupie';
      return `<tr><td><b>${esc(code)}</b><div class="small muted">${esc(t.name.split(' – ')[1] ?? t.name)}</div></td><td class="num">${esc(term)}</td><td class="num"><b>${pctPlain(s.rate1)}</b>${t.step === 1 ? '<div class="small muted">1. miesiąc</div>' : ''}</td><td class="num">${later}</td><td class="opt">${esc(payout)}</td><td class="num opt">${s.fee > 0 ? `${NF2.format(s.fee)} zł` : '–'}</td></tr>`;
    })
    .join('');
  body.innerHTML = `<div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th>Seria</th><th class="num">Na ile</th><th class="num">1. rok</th><th class="num">Potem</th><th class="opt">Odsetki</th><th class="num opt">Opłata za wcześniejszy wykup</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="small muted">Oferta na ${esc(data.offerMonth ? `${MONTHS_FULL[Number(data.offerMonth.slice(5, 7)) - 1]} ${data.offerMonth.slice(0, 4)}` : '–')}.${cpi ? ` Inflacja r/r (GUS): ${pctPlain(cpi[1])} za ${esc(`${MONTHS_FULL[Number(cpi[0].slice(5, 7)) - 1]} ${cpi[0].slice(0, 4)}`)}.` : ''}${ref ? ` Stopa referencyjna NBP: ${pctPlain(ref[1])} (od ${dShort(ref[0])}).` : ''} „Dziś ok.” – oprocentowanie od 2. okresu przy obecnej inflacji lub stopie NBP; w Twoim 2. roku zależy od inflacji z tamtego czasu. Obligacje rodzinne (ROS, ROD) są dla osób pobierających 800+.</p>`;
}

function goldCard() {
  return `<section class="card" id="gold-card"><h2>Złoto</h2><div id="gold-body"><p class="muted small">Ładowanie…</p></div>
  <p class="meta">Cena 1 g złota w próbie 1000 wyliczana przez NBP w dni robocze. To cena referencyjna: mennice skupują zwykle kilka procent taniej, a sprzedają drożej. Monety bulionowe 1 oz zawierają 31,1 g czystego złota. Swoje złoto dodasz w Finansach: konto → Aktywa → „+ Złoto”.</p></section>`;
}

async function mountGold(root) {
  const body = $('#gold-body', root);
  const data = await assetLoadGold();
  const p = data?.prices ?? [];
  if (!p.length) {
    body.innerHTML = '<p class="muted small">Cena złota pojawi się po najbliższej aktualizacji aplikacji.</p>';
    return;
  }
  const last = p.at(-1);
  const at = (iso) => {
    let found = null;
    for (const x of p) {
      if (x[0] <= iso) found = x;
      else break;
    }
    return found;
  };
  const back = (months) => {
    const d = new Date(`${last[0]}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - months);
    return at(d.toISOString().slice(0, 10));
  };
  const ch = (x) => (x ? last[1] / x[1] - 1 : null);
  const ytd = at(`${Number(last[0].slice(0, 4)) - 1}-12-31`);
  const rows = [
    ['1 g', 1],
    ['moneta 1 oz (31,1 g)', OZ_GRAMS],
    ['sztabka 10 g', 10],
    ['sztabka 100 g', 100],
  ];
  body.innerHTML = `<p>1 g złota: <b>${NF2.format(last[1])} zł</b> <span class="muted">(NBP, ${dShort(last[0])})</span></p>
  <div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th>Wyrób</th><th class="num">Wartość wg NBP</th></tr></thead><tbody>${rows.map(([n, g]) => `<tr><td>${esc(n)}</td><td class="num">${NF2.format(g * last[1])} zł</td></tr>`).join('')}</tbody></table></div>
  <div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th class="num">1 mies.</th><th class="num">Od 1.01</th><th class="num">12 mies.</th><th class="num">5 lat</th></tr></thead><tbody><tr>${[ch(back(1)), ch(ytd), ch(back(12)), ch(back(60))].map(signedCell).join('')}</tr></tbody></table></div>`;
}

function cryptoCard() {
  return `<section class="card" id="crypto-card"><div class="card-head"><h2>Kryptowaluty</h2><input type="search" id="crypto-q" class="crypto-q" placeholder="Szukaj: BTC, Ethereum…" aria-label="Szukaj kryptowaluty"></div>
  <div id="crypto-body"><p class="muted small">Ładowanie kursów…</p></div>
  <p class="meta">Kursy w złotych z CoinGecko, aktualizowane codziennie (100 największych kryptowalut). Kryptowaluty są bardzo zmienne – w skrajnych przypadkach można stracić większość wpłaconych pieniędzy. Swoje kryptowaluty dodasz w Finansach: konto → Aktywa → „+ Kryptowaluta”.</p></section>`;
}

async function mountCrypto(root) {
  const body = $('#crypto-body', root);
  const q = $('#crypto-q', root);
  const data = await assetLoadCrypto();
  if (!data?.coins?.length) {
    body.innerHTML = '<p class="muted small">Kursy kryptowalut pojawią się po najbliższej aktualizacji aplikacji.</p>';
    q.hidden = true;
    return;
  }
  let all = false;
  const price = (x) => (x >= 1 ? NF2.format(x) : String(Number(x.toPrecision(3))).replace('.', ','));
  const draw = () => {
    const query = q.value.trim();
    const list = query ? cryptoSearch(data, query, 30) : data.coins.slice(0, all ? data.coins.length : 15);
    body.innerHTML = `<div class="tbl-wrap"><table class="fund-tbl"><thead><tr><th>Kryptowaluta</th><th class="num">Kurs</th><th class="num">24 h</th><th class="num opt">7 dni</th><th class="num">30 dni</th><th class="num opt">1 rok</th></tr></thead><tbody>${list
      .map((c) => {
        const last = cryptoQuotes(data, c.id).at(-1);
        return `<tr><td><b>${esc(c.symbol)}</b> ${esc(c.name)}<div class="small muted">#${esc(c.rank ?? '–')}</div></td><td class="num">${last ? `${price(last[1])} zł` : '–'}</td>${signedCell(c.ch?.d1)}${signedCell(c.ch?.d7).replace('<td class="num', '<td class="num opt')}${signedCell(c.ch?.d30)}${signedCell(c.ch?.y1).replace('<td class="num', '<td class="num opt')}</tr>`;
      })
      .join('') || '<tr><td colspan="6" class="muted">Brak wyników.</td></tr>'}</tbody></table></div>
    <p class="small muted">Kursy z ${data.asOf ? dShort(data.asOf) : '–'}.${!query && !all && data.coins.length > 15 ? ` <button type="button" class="link small" id="crypto-all">Pokaż wszystkie (${data.coins.length})</button>` : ''}</p>`;
    $('#crypto-all', body)?.addEventListener('click', () => {
      all = true;
      draw();
    });
  };
  q.addEventListener('input', draw);
  draw();
}

// Karta wyszukiwarki: dowolna akcja lub ETF z oferty XTB, ostatni kurs i źródło wyceny, lista obserwowanych.
function libraryCard() {
  const edit = D.library?.editUrl;
  return `<section class="card" id="lib-card"><h2>Instrumenty XTB</h2>
  <p class="small muted">Wyszukaj dowolną akcję lub ETF z oferty XTB i sprawdź, skąd aplikacja weźmie jego cenę. Akcje i ETF-y z GPW mają kurs zamknięcia z giełdy (dni robocze), popularne ETF-y UCITS – wycenę według indeksu, a akcje z USA – kurs po dopisaniu do listy obserwowanych. Instrument dodasz do portfela GEM albo – w Finansach – do konta inwestycyjnego (Aktywa).</p>
  <div id="lib-picker"></div><div id="lib-detail"></div>
  <div id="lib-watch" class="small"></div>
  <p class="small">${edit ? `<a href="${esc(edit)}" target="_blank" rel="noopener">Edytuj listę obserwowanych na GitHubie</a> (plik config/obserwowane.txt, ceny od następnej aktualizacji).` : 'Lista obserwowanych: plik config/obserwowane.txt w repozytorium.'}</p>
  </section>`;
}

function mountLibrary(root) {
  const host = $('#lib-picker', root);
  if (!host) return;
  const extra = () => Object.entries(D.instruments).map(([symbol, i]) => ({ symbol, name: i.name, currency: i.currency }));
  host.append(instPicker({ onPick: (it) => showLibDetail(it), extra }));
  instLoadQuotes().then((data) => {
    libraryData = libraryData ?? data;
    const el = $('#lib-watch', root);
    if (!el || !data) return;
    const rows = (data.watchlist ?? []).map((s) => {
      const q = data.quotes?.[s]?.at(-1);
      return `<b>${esc(s)}</b>${q ? ` ${NF2.format(q[1])} (${dShort(q[0])})` : ' – brak notowań'}`;
    });
    el.innerHTML = `<p class="muted">Notowania GPW z ${data.gpwDate ? dShort(data.gpwDate) : '–'}.${rows.length ? ` Obserwowane: ${rows.join(' · ')}.` : ' Lista obserwowanych jest pusta.'}</p>`;
  });
}

async function showLibDetail(it) {
  const el = $('#lib-detail');
  if (!el) return;
  libraryData = libraryData ?? (await instLoadQuotes());
  const own = D.prices.instruments[it.symbol] && !D.prices.instruments[it.symbol].library ? D.prices.instruments[it.symbol] : null;
  const entry = own ?? instEntry(libraryData, it.symbol, it.currency, D.prices.fx);
  const last = instLastPrice(entry);
  const source = own ? 'ETF strategii GEM – notowania i indeks z codziennej aktualizacji' : instExpectedSource(it, libraryData, D.prices.fx);
  const pence = instPenceHint(it);
  el.innerHTML = `<div class="inst-picked"><b>${esc(it.symbol)}</b> ${esc(it.name)}<br><span class="muted">${esc([it.isin, it.marketName, it.currency, it.type === 'E' ? 'ETF/ETC' : it.type === 'A' ? 'akcje' : ''].filter(Boolean).join(' · '))}${it.closeOnly ? ' · tylko zamknięcie pozycji' : ''}</span>
  ${last ? `<br>Ostatni kurs: <b>${NF2.format(last[1])} ${esc(it.currency)}</b> (${dShort(last[0])})` : ''}
  <br><span class="muted">Wycena: ${esc(source)}</span>${pence ? `<br><span class="warn">${esc(pence)}</span>` : ''}
  <div class="row-btns" style="margin-top:8px"><button class="btn small" type="button" data-act="lib-add" data-sym="${esc(it.symbol)}" data-cur="${esc(it.currency)}" data-name="${esc(it.name)}">Dodaj do portfela GEM</button></div></div>`;
}

function dataCard() {
  const n = activeTx(state.txs).length;
  const s = state.sync;
  return `<section class="card"><h2>Twoje dane</h2>
  <p class="small">${n} ${n === 1 ? 'wpis' : 'wpisów'} zapisanych w tej przeglądarce.${s?.token ? ` Synchronizacja z <b>${esc(s.repo)}</b>${s.lastSync ? `, ostatnio ${new Date(s.lastSync).toLocaleString('pl-PL')}` : ''}.` : ' Synchronizacja wyłączona.'}</p>
  <div class="row-btns"><button class="btn" data-act="export-json">Eksportuj kopię (JSON)</button><button class="btn" data-act="export-csv">Eksportuj CSV</button><button class="btn" data-act="import">Wczytaj kopię</button>${s?.token ? '<button class="btn" data-act="sync">Synchronizuj teraz</button>' : '<button class="btn" data-act="settings">Włącz synchronizację</button>'}</div>
  <input type="file" id="import-file" accept="application/json,.json" hidden>
  <details class="danger"><summary>Usuń wszystkie dane z tej przeglądarki</summary><p class="small">Tej operacji nie można cofnąć. Najpierw wyeksportuj kopię.</p><button class="btn danger" data-act="wipe">Usuń wszystkie wpisy</button></details>
  </section>`;
}

function bindPortfolio(root) {
  root.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.acc) {
      state.ui.account = b.dataset.acc;
      saveUi();
      return renderPortfolio();
    }
    if (b.dataset.mode) {
      state.ui.mode = b.dataset.mode;
      saveUi();
      return renderPortfolio();
    }
    if (b.dataset.range) {
      Object.assign(state.ui, { range: b.dataset.range, from: null, to: null });
      saveUi();
      return renderPortfolio();
    }
    if (b.dataset.bench) {
      state.ui.bench[b.dataset.bench] = !state.ui.bench[b.dataset.bench];
      saveUi();
      return renderPortfolio();
    }
    if (b.dataset.edit) return openTxDialog(state.txs.find((t) => t.id === b.dataset.edit));
    const act = b.dataset.act;
    if (act === 'add') openTxDialog(null);
    else if (act === 'demo') loadDemo();
    else if (act === 'clear-demo') {
      saveTxs(state.txs.map((t) => (t.demo ? { ...t, deleted: true, updatedAt: Date.now() } : t)));
      renderPortfolio();
    } else if (act === 'export-json') download(`gem-portfel-${todayIso()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions: state.txs }, null, 1), 'application/json');
    else if (act === 'export-csv') exportCsv();
    else if (act === 'import') $('#import-file', root)?.click();
    else if (act === 'sync') syncNow(true);
    else if (act === 'settings') openSettings();
    else if (act === 'wipe') {
      saveTxs(state.txs.map((t) => ({ ...t, deleted: true, updatedAt: Date.now() })));
      renderPortfolio();
      toast('Usunięto wszystkie wpisy.');
    }
  };
  const from = $('#r-from', root);
  const to = $('#r-to', root);
  const onDates = () => {
    if (from.value && to.value && from.value <= to.value) {
      Object.assign(state.ui, { range: 'CUSTOM', from: from.value, to: to.value });
      saveUi();
      renderPortfolio();
    }
  };
  from?.addEventListener('change', onDates);
  to?.addEventListener('change', onDates);
  const file = $('#import-file', root);
  file?.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const list = Array.isArray(json) ? json : json.transactions;
      if (!Array.isArray(list)) throw new Error('nieznany format');
      saveTxs(mergeTransactions(state.txs, list));
      toast(`Wczytano ${list.length} wpisów.`);
      renderPortfolio();
    } catch (err) {
      toast(`Nie udało się wczytać pliku: ${err.message}`);
    }
  });
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

function exportCsv() {
  const head = ['data', 'typ', 'rachunek', 'instrument', 'jednostki', 'cena', 'waluta', 'kwota_pln', 'prowizja_pln', 'notatka'];
  const rows = sortTx(activeTx(state.txs)).map((t) => [t.date, TX_LABELS[t.type], ACCOUNT_LABELS[t.account], t.ticker ?? '', t.quantity ?? '', t.price ?? '', t.currency ?? '', t.amountPLN ?? '', t.feePLN ?? '', (t.note ?? '').replace(/"/g, '""')]);
  const csv = [head, ...rows].map((r) => r.map((c) => (typeof c === 'string' && /[;"\n]/.test(c) ? `"${c}"` : String(c).replace('.', ','))).join(';')).join('\n');
  download(`gem-portfel-${todayIso()}.csv`, `﻿${csv}`, 'text/csv');
}

// Przykładowe dane: wpłaty na IKE/IKZE i zmiany pozycji zgodne z historią sygnałów GEM.
function loadDemo() {
  const hist = D.signalHistory ?? [];
  const inst = D.prices.instruments;
  const fx = D.prices.fx;
  const firstSession = (month) => {
    for (let d = `${month}-01`; d.startsWith(month); d = isoAddDays(d, 1)) {
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow !== 0 && dow !== 6 && lastOnOrBefore(fx.USD, d)?.[0] === d) return d;
    }
    return `${month}-02`;
  };
  const priceOf = (ticker, d) => lastOnOrBefore(inst[ticker]?.series ?? [], d)?.[1];
  const out = [];
  const mk = (o) => out.push({ id: newId(), demo: true, createdAt: Date.now() + out.length, updatedAt: Date.now(), feePLN: 0, ...o });
  const months = hist.slice(-18);
  if (!months.length) return toast('Brak historii sygnałów do przykładu.');
  let holding = null;
  let qty = 0;
  let cashPln = 0;
  for (const h of months) {
    const d = firstSession(h.forMonth);
    const year = d.slice(0, 4);
    if (!priceOf(h.ticker, d) || (holding && !priceOf(holding, d))) continue;
    if (!out.some((t) => t.type === 'wplata' && t.date.startsWith(year))) {
      const amount = Math.round(limitsFor(D.podatki, Number(year)).ike * 0.6);
      mk({ type: 'wplata', account: 'IKE', date: d, amountPLN: amount });
      cashPln += amount;
    }
    if (holding && holding !== h.ticker) {
      const p = priceOf(holding, d);
      const c = inst[holding].currency;
      mk({ type: 'sprzedaz', account: 'IKE', date: d, ticker: holding, currency: c, quantity: qty, price: Number(p.toFixed(2)) });
      cashPln += qty * p * fxAt(fx, c, d) * 0.995;
      holding = null;
    }
    if (!holding && inst[h.ticker]) {
      const p = priceOf(h.ticker, d);
      const c = inst[h.ticker].currency;
      const rate = fxAt(fx, c, d);
      qty = Math.floor((cashPln * 0.995) / (p * rate) * 100) / 100;
      if (qty > 0) {
        mk({ type: 'kupno', account: 'IKE', date: d, ticker: h.ticker, currency: c, quantity: qty, price: Number(p.toFixed(2)), note: 'przykład' });
        cashPln -= qty * p * rate / 0.995;
        holding = h.ticker;
      }
    } else if (holding === h.ticker && cashPln > 1000) {
      const p = priceOf(holding, d);
      const c = inst[holding].currency;
      const add = Math.floor((cashPln * 0.995) / (p * fxAt(fx, c, d)) * 100) / 100;
      if (add > 0) {
        mk({ type: 'kupno', account: 'IKE', date: d, ticker: holding, currency: c, quantity: add, price: Number(p.toFixed(2)) });
        qty += add;
        cashPln -= add * p * fxAt(fx, c, d) / 0.995;
      }
    }
  }
  saveTxs(mergeTransactions(state.txs, out), { sync: false });
  renderPortfolio();
  toast('Wczytano przykładowe dane (konto IKE według sygnałów GEM).');
}

// ---------- Okno transakcji ----------
let txPicked = null; // instrument wybrany z katalogu XTB w oknie transakcji
function openTxDialog(tx, prefill = null) {
  const dlg = $('#tx-dialog');
  const f = $('form', dlg);
  const editing = Boolean(tx);
  const t = tx ?? { type: 'kupno', date: todayIso(), account: state.settings.defaultAccount, ticker: D.signal?.ticker ?? Object.keys(D.instruments)[0], feePLN: 0, ...prefill };
  $('#tx-title').textContent = editing ? 'Edytuj wpis' : 'Nowy wpis';
  f.reset();
  f.elements.id.value = tx?.id ?? '';
  for (const r of f.elements.type) r.checked = r.value === t.type;
  f.elements.date.value = t.date;
  f.elements.account.value = t.account;
  const known = Object.keys(D.instruments).includes(t.ticker);
  f.elements.ticker.value = !t.ticker ? Object.keys(D.instruments)[0] : known ? t.ticker : '__other';
  f.elements.customTicker.value = known ? '' : t.ticker ?? '';
  f.elements.instName.value = known ? '' : t.name ?? '';
  txPicked = !known && t.ticker ? instFind(self.GEM_KATALOG, t.ticker) ?? (t.name ? { symbol: t.ticker, name: t.name, currency: t.currency } : null) : null;
  $('#tx-inst-picker .inst-picker')?.reset?.();
  f.elements.currency.value = t.currency ?? D.instruments[f.elements.ticker.value]?.currency ?? 'USD';
  f.elements.quantity.value = t.quantity ?? '';
  f.elements.price.value = t.price ?? '';
  f.elements.amountPLN.value = t.amountPLN ?? '';
  f.elements.feePLN.value = t.feePLN || '';
  f.elements.note.value = t.note ?? '';
  $('#tx-delete').hidden = !editing;
  $('#tx-errors').textContent = '';
  updateTxForm();
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
}

function readTxForm() {
  const f = $('#tx-dialog form');
  const type = f.elements.type.value;
  const tickerSel = f.elements.ticker.value;
  const ticker = tickerSel === '__other' ? f.elements.customTicker.value.trim().toUpperCase() : tickerSel;
  const num = (v) => (v === '' ? undefined : Number(String(v).replace(',', '.')));
  const t = {
    id: f.elements.id.value || newId(),
    type,
    date: f.elements.date.value,
    account: f.elements.account.value,
    note: f.elements.note.value.trim() || undefined,
    updatedAt: Date.now(),
  };
  if (type === 'wplata' || type === 'wyplata') t.amountPLN = num(f.elements.amountPLN.value);
  else {
    t.ticker = ticker;
    t.currency = f.elements.currency.value;
    if (tickerSel === '__other' && f.elements.instName.value) t.name = f.elements.instName.value;
    t.price = num(f.elements.price.value);
    if (type !== 'wycena') {
      t.quantity = num(f.elements.quantity.value);
      t.amountPLN = num(f.elements.amountPLN.value);
      t.feePLN = num(f.elements.feePLN.value) ?? 0;
    }
  }
  return t;
}

function updateTxForm() {
  const f = $('#tx-dialog form');
  const type = f.elements.type.value;
  const trade = type === 'kupno' || type === 'sprzedaz';
  const cashOnly = type === 'wplata' || type === 'wyplata';
  for (const el of $$('[data-show]', f)) {
    const show = el.dataset.show.split(' ');
    el.hidden = !(show.includes(type) || (show.includes('trade') && trade) || (show.includes('cash') && cashOnly));
  }
  const other = f.elements.ticker.value === '__other';
  $('#custom-ticker-row').hidden = !other || cashOnly;
  if (!other && D.instruments[f.elements.ticker.value]) f.elements.currency.value = D.instruments[f.elements.ticker.value].currency;
  $('#price-ccy').textContent = f.elements.currency.value;
  // Instrument z katalogu: opis, źródło ceny i ostatni kurs; ręcznie zmieniony symbol kasuje wybór.
  const sym = f.elements.customTicker.value.trim().toUpperCase();
  if (txPicked && sym !== txPicked.symbol) {
    txPicked = null;
    f.elements.instName.value = '';
  }
  const info = $('#tx-inst-info');
  info.hidden = !(other && txPicked);
  if (other && txPicked) {
    const entry = instEntry(libraryData, txPicked.symbol, f.elements.currency.value, D.prices.fx);
    const last = instLastPrice(entry);
    const pence = instPenceHint(txPicked);
    info.innerHTML = `<b>${esc(txPicked.symbol)}</b> ${esc(txPicked.name ?? '')}${last ? `<br>Ostatni kurs: ${NF2.format(last[1])} ${esc(f.elements.currency.value)} (${dShort(last[0])})` : ''}<br><span class="muted">Wycena: ${esc(txPicked.market ? instExpectedSource(txPicked, libraryData, D.prices.fx) : instSourceLabel(entry, libraryData))}</span>${pence ? `<br><span class="warn">${esc(pence)}</span>` : ''}`;
  }
  const t = readTxForm();
  const hint = $('#amount-hint');
  if (trade && t.quantity > 0 && t.price > 0 && t.date) {
    const rate = fxAt(D.prices.fx, t.currency, t.date);
    hint.textContent = rate ? `Szacunek wg kursu NBP ${NF4.format(rate)}: ${pln(t.quantity * t.price * rate)}. Wpisz kwotę z potwierdzenia XTB (z przewalutowaniem), jeśli ją znasz.` : '';
  } else hint.textContent = '';
}

function bindTxDialog() {
  const dlg = $('#tx-dialog');
  const f = $('form', dlg);
  $('#tx-ticker').innerHTML = `${Object.entries(D.instruments)
    .map(([t, i]) => `<option value="${esc(t)}">${esc(t)} – ${esc(i.name)}</option>`)
    .join('')}<option value="__other">Inny instrument z oferty XTB (wyszukaj)…</option>`;
  const picker = instPicker({
    onPick: (it) => {
      if (D.instruments[it.symbol]) {
        f.elements.ticker.value = it.symbol;
      } else {
        f.elements.customTicker.value = it.symbol;
        f.elements.currency.value = it.currency;
        f.elements.instName.value = it.name;
        txPicked = it;
      }
      picker.reset();
      instLoadQuotes().then((data) => {
        libraryData = libraryData ?? data;
        updateTxForm();
      });
      updateTxForm();
    },
  });
  $('#tx-inst-picker').append(picker);
  f.addEventListener('input', updateTxForm);
  f.addEventListener('change', updateTxForm);
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const t = readTxForm();
    const prev = state.txs.find((x) => x.id === t.id);
    const errors = validateTx(t);
    if (errors.length) {
      $('#tx-errors').textContent = errors.join(' ');
      return;
    }
    if (t.type === 'sprzedaz') {
      const held = holdings(state.txs.filter((x) => x.id !== t.id), D.prices, t.date).find((h) => h.ticker === t.ticker && h.account === t.account);
      if (!held || held.quantity + 1e-9 < t.quantity) {
        $('#tx-errors').textContent = `Na rachunku ${ACCOUNT_LABELS[t.account]} masz ${held ? NF4.format(held.quantity) : 0} jedn. ${t.ticker} – sprawdź liczbę albo najpierw dodaj zakup.`;
        return;
      }
    }
    const saved = { ...prev, ...t, createdAt: prev?.createdAt ?? Date.now() };
    saveTxs(prev ? state.txs.map((x) => (x.id === t.id ? saved : x)) : [...state.txs, saved]);
    dlg.close ? dlg.close() : dlg.removeAttribute('open');
    renderPortfolio();
    toast(prev ? 'Zapisano zmiany.' : 'Dodano wpis.');
    refreshLibraryPrices();
  });
  $('#tx-delete').addEventListener('click', () => {
    const id = f.elements.id.value;
    saveTxs(state.txs.map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: Date.now() } : x)));
    dlg.close ? dlg.close() : dlg.removeAttribute('open');
    renderPortfolio();
    toast('Usunięto wpis.');
  });
  $('#tx-cancel').addEventListener('click', () => (dlg.close ? dlg.close() : dlg.removeAttribute('open')));
}

// ---------- Ustawienia i synchronizacja ----------
function openSettings() {
  const dlg = $('#settings-dialog');
  const f = $('form', dlg);
  f.elements.taxForm.value = state.settings.taxForm;
  f.elements.ryczaltRate.value = String(Math.round((state.settings.ryczaltRate ?? 0.12) * 1000) / 10).replace('.', ',');
  f.elements.selfEmployed.checked = Boolean(state.settings.selfEmployed);
  f.elements.defaultAccount.value = state.settings.defaultAccount;
  f.elements.theme.value = state.settings.theme;
  f.elements.startPage.value = startPage();
  f.elements.repo.value = state.sync?.repo ?? '';
  f.elements.path.value = state.sync?.path ?? 'portfel.json';
  f.elements.token.value = state.sync?.token ?? '';
  $('#ryczalt-row').hidden = f.elements.taxForm.value !== 'ryczalt';
  $('#sync-status').textContent = state.sync?.lastSync ? `Ostatnia synchronizacja: ${new Date(state.sync.lastSync).toLocaleString('pl-PL')}` : '';
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
}

function bindSettings() {
  const dlg = $('#settings-dialog');
  const f = $('form', dlg);
  f.elements.taxForm.addEventListener('change', () => ($('#ryczalt-row').hidden = f.elements.taxForm.value !== 'ryczalt'));
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    state.settings = {
      ...state.settings,
      taxForm: f.elements.taxForm.value,
      ryczaltRate: Number(String(f.elements.ryczaltRate.value).replace(',', '.')) / 100 || 0,
      selfEmployed: f.elements.selfEmployed.checked,
      defaultAccount: f.elements.defaultAccount.value,
      theme: f.elements.theme.value,
    };
    store.set(KEYS.settings, state.settings);
    try {
      localStorage.setItem(START_KEY, f.elements.startPage.value);
    } catch {
      // bez pamięci przeglądarki strona startowa zostaje domyślna
    }
    applyTheme();
    const repo = f.elements.repo.value.trim();
    const token = f.elements.token.value.trim();
    if (repo && token) {
      state.sync = { ...(state.sync ?? {}), repo, path: f.elements.path.value.trim() || 'portfel.json', token };
      store.set(KEYS.sync, state.sync);
      $('#sync-status').textContent = 'Łączę z GitHubem…';
      const ok = await syncNow(true);
      if (!ok) return;
    } else if (!repo && !token && state.sync) {
      state.sync = null;
      store.set(KEYS.sync, null);
    }
    dlg.close ? dlg.close() : dlg.removeAttribute('open');
    renderPortfolio();
    renderTaxTools();
    toast('Zapisano ustawienia.');
  });
  $('#settings-cancel').addEventListener('click', () => (dlg.close ? dlg.close() : dlg.removeAttribute('open')));
}

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function gh(method, body) {
  const { repo, path, token } = state.sync;
  const url = `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
}

// Pobiera plik z repozytorium, scala z lokalnymi danymi i zapisuje wynik z powrotem.
async function syncNow(verbose = false) {
  if (!state.sync?.token) return false;
  const status = (m) => {
    $('#sync-status') && ($('#sync-status').textContent = m);
    if (verbose) toast(m);
  };
  try {
    const res = await gh('GET');
    let remote = [];
    let sha;
    if (res.status === 200) {
      const json = await res.json();
      sha = json.sha;
      remote = JSON.parse(b64decode(json.content)).transactions ?? [];
    } else if (res.status !== 404) {
      throw new Error(res.status === 401 ? 'nieprawidłowy token' : res.status === 403 ? 'brak uprawnień tokenu (Contents: Read and write)' : `HTTP ${res.status}`);
    }
    const merged = mergeTransactions(state.txs, remote);
    saveTxs(merged, { sync: false });
    const put = await gh('PUT', { message: `Portfel: aktualizacja ${new Date().toISOString().slice(0, 16)}`, content: b64encode(JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), transactions: merged }, null, 1)), ...(sha ? { sha } : {}) });
    if (!put.ok) throw new Error(put.status === 409 ? 'konflikt wersji – spróbuj ponownie' : `zapis HTTP ${put.status}`);
    state.sync.lastSync = Date.now();
    store.set(KEYS.sync, state.sync);
    status(`Zsynchronizowano (${activeTx(merged).length} wpisów).`);
    if (!$('#tab-portfel').hidden) renderPortfolio();
    return true;
  } catch (err) {
    status(`Synchronizacja nieudana: ${err.message}`);
    return false;
  }
}
let pushTimer = null;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow(false), 1500);
}

// ---------- Podatki: kalkulatory ----------
function renderTaxTools() {
  const plan = $('#plan-root');
  const brokers = $('#broker-root');
  if (!plan || !brokers) return;
  const now = Number(todayIso().slice(0, 4));
  const year = Number(plan.dataset.year ?? now);
  const used = contributions(state.txs, year);
  const rate = taxRate();
  const p = planContributions({ budget: Number(state.settings.budget) || 0, year, podatki: D.podatki, used, taxRate: rate, selfEmployed: state.settings.selfEmployed });
  plan.innerHTML = `<div class="card-head"><h2>Twój plan wpłat</h2><div class="seg small">${[now, now + 1].map((y) => `<button data-year="${y}" class="${y === year ? 'on' : ''}">${y}</button>`).join('')}</div></div>
  <div class="form-row"><label>Ile chcesz zainwestować w ${year} r.? <input type="number" inputmode="numeric" id="plan-budget" min="0" step="1000" value="${Number(state.settings.budget) || 0}"></label>
  <label>Forma opodatkowania <select id="plan-form">${Object.entries(D.podatki.taxForms).map(([k, f]) => `<option value="${k}" ${k === state.settings.taxForm ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>
  <label class="check"><input type="checkbox" id="plan-firma" ${state.settings.selfEmployed ? 'checked' : ''}> Prowadzę działalność gospodarczą (wyższy limit IKZE)</label></div>
  <ol class="plan">${p.steps.map((s) => `<li><div class="plan-head"><b>${ACCOUNT_LABELS[s.account]}</b><span>${pln(s.amount)}</span></div><p class="small muted">${esc(s.reason)}</p></li>`).join('') || '<li class="muted">Wpisz kwotę, aby zobaczyć plan.</li>'}</ol>
  ${p.refund > 0 ? `<div class="banner good"><b>Zwrot podatku z IKZE: ok. ${pln(p.refund)}</b> w rozliczeniu PIT za ${year} r. Wpłać go na IKE w kolejnym roku, aby pracował bez podatku.</div>` : ''}
  <p class="muted small">Limity ${p.limitYear}: IKE ${pln(p.ikeLimit)}, IKZE ${pln(p.ikzeLimit)}${p.limitStatus === 'prognoza' ? ' (prognoza – oficjalne kwoty w grudniu)' : ''}. Wpłacone w ${year} r. (z dziennika): IKE ${pln(used.IKE)}, IKZE ${pln(used.IKZE)}. ${state.settings.taxForm === 'ryczalt' ? 'Na ryczałcie wpłatę na IKZE odliczasz od przychodu, więc zwrot liczony jest wg Twojej stawki ryczałtu.' : ''}</p>`;

  const value = Number(brokers.dataset.value ?? 0) || Math.round(holdings(state.txs, D.prices, DATA_DAY).reduce((a, h) => a + (h.value ?? 0), 0)) || 50000;
  const wrapper = brokers.dataset.wrapper ?? 'ike';
  const afterPromo = brokers.dataset.promo === '1';
  const stats = D.switchStats ?? { perYear: 1.4, eurShare: 0.6 };
  const rows = D.podatki.brokers
    .map((b) => ({ b, c: brokerCost(b, { value, perYear: stats.perYear, eurShare: stats.eurShare, wrapper, afterPromo }) }))
    .sort((x, y) => (x.c.available === y.c.available ? (x.c.annualPLN ?? 0) - (y.c.annualPLN ?? 0) : x.c.available ? -1 : 1));
  const st = (s) => (s === 'oficjalne' ? '<span class="tag ok">potwierdzone</span>' : s === '–' ? '' : '<span class="tag warn">do weryfikacji</span>');
  brokers.innerHTML = `<div class="card-head"><h2>Koszt GEM u brokerów</h2><div class="seg small">${[['ike', 'IKE / IKZE'], ['zwykle', 'Konto zwykłe']].map(([k, l]) => `<button data-wrapper="${k}" class="${k === wrapper ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="form-row"><label>Wartość portfela <input type="number" inputmode="numeric" id="broker-value" min="0" step="1000" value="${value}"></label>
  <label class="check"><input type="checkbox" id="broker-promo" ${afterPromo ? 'checked' : ''}> Licz stawki po końcu promocji</label></div>
  <div class="tbl-wrap"><table><thead><tr><th>Broker</th><th class="num">Jedna zmiana</th><th class="num">Rocznie</th></tr></thead><tbody>${rows
    .map(({ b, c }) => (c.available ? `<tr><td><b>${esc(b.name)}</b><div class="small muted">${c.usd ? 'subkonto USD' : 'tylko PLN – 2 przewalutowania'} · FX ${(b.fx * 100).toFixed(2).replace('.', ',')}% ${st(b.status.fx)}</div></td><td class="num">${pct(c.perSwitch, 2).replace('+', '')}</td><td class="num"><b>${pln(c.annualPLN)}</b><div class="small muted">${pct(c.annualPct, 2).replace('+', '')}</div></td></tr>` : `<tr class="muted"><td><b>${esc(b.name)}</b><div class="small">nie oferuje ${wrapper === 'ike' ? 'IKE/IKZE' : 'tego konta'}</div></td><td class="num">–</td><td class="num">–</td></tr>`))
    .join('')}</tbody></table></div>
  <p class="muted small">Założenia z backtestu: średnio ${String(stats.perYear.toFixed(1)).replace('.', ',')} zmiany pozycji rocznie, ${Math.round(stats.eurShare * 100)}% z nich dotyczy ETF-u w EUR (EXUS.DE). Pomijam minimalne prowizje i spread. Stawki oznaczone „do weryfikacji” sprawdź w tabeli opłat brokera przed decyzją.</p>`;
}

function bindTaxTools() {
  const panel = $('#tab-podatki');
  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.year) {
      $('#plan-root').dataset.year = b.dataset.year;
      renderTaxTools();
    } else if (b.dataset.wrapper) {
      $('#broker-root').dataset.wrapper = b.dataset.wrapper;
      renderTaxTools();
    }
  });
  panel.addEventListener('change', (ev) => {
    const id = ev.target.id;
    if (id === 'plan-budget') state.settings.budget = Number(ev.target.value) || 0;
    else if (id === 'plan-form') state.settings.taxForm = ev.target.value;
    else if (id === 'plan-firma') state.settings.selfEmployed = ev.target.checked;
    else if (id === 'broker-value') $('#broker-root').dataset.value = ev.target.value;
    else if (id === 'broker-promo') $('#broker-root').dataset.promo = ev.target.checked ? '1' : '0';
    else return;
    store.set(KEYS.settings, state.settings);
    renderTaxTools();
  });
}

// ---------- Sygnał: zgodność portfela i waluta zakupu ----------
// Ten sam rynek może być kupiony w różnych walutach (np. CSPX.UK w USD i SXR8.DE w EUR).
const assetOf = (ticker) => D.listingIndex?.[ticker]?.asset ?? null;
const matchesSignal = (ticker) => ticker === D.signal?.ticker || (assetOf(ticker) && assetOf(ticker) === D.signal?.asset);

function renderSignalCheck() {
  const el = $('#signal-check');
  if (!el || !D.signal) return;
  const list = holdings(state.txs, D.prices, DATA_DAY);
  if (!list.length) {
    el.innerHTML = '<a class="link" href="#portfel">Dodaj swoje transakcje w zakładce Mój portfel GEM, a sprawdzę, czy portfel jest zgodny z sygnałem.</a>';
    return;
  }
  const wrong = list.filter((h) => !matchesSignal(h.ticker));
  el.innerHTML = wrong.length
    ? `<div class="banner warn"><b>Twój portfel różni się od sygnału.</b> Masz ${wrong.map((h) => `${esc(h.ticker)} (${esc(ACCOUNT_LABELS[h.account])})`).join(', ')}, a sygnał na ten miesiąc to <b>${esc(D.signal.ticker)}</b>.</div>`
    : `<div class="banner good">✓ Twój portfel jest zgodny z sygnałem (${esc(D.signal.ticker)}).</div>`;
  renderCurrencyPersonal(list);
}

function renderCurrencyPersonal(list) {
  const el = $('#currency-personal');
  if (!el || !D.signal || !D.assetsLite) return;
  const rows = list.map((h) => {
    const currencies = D.accountCurrencies?.[h.account] ?? ['PLN'];
    if (matchesSignal(h.ticker)) return `<li><b>${esc(ACCOUNT_LABELS[h.account])}</b>: trzymasz ${esc(h.ticker)} – zgodne z sygnałem, nic nie zmieniaj.</li>`;
    const cash = currencies.every((c) => c === 'PLN') ? 'PLN' : h.currency;
    const advice = currencyAdvice({ asset: D.signal.asset, assets: D.assetsLite, accountCurrencies: currencies, cash, transitions: D.transitions });
    return `<li><b>${esc(ACCOUNT_LABELS[h.account])}</b>: sprzedaj ${esc(h.ticker)}, kup ${esc(currencyAdviceText(advice, cash))}</li>`;
  });
  el.innerHTML = rows.length ? `<div class="banner info"><b>Dla Twojego portfela:</b><ul class="plain">${rows.join('')}</ul></div>` : '';
}

// ---------- Start ----------
applyTheme();
bindTxDialog();
bindSettings();
bindTaxTools();
$('#btn-settings').addEventListener('click', openSettings);
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => !$('#tab-portfel').hidden && renderPortfolio.onResize?.(), 150);
});
document.documentElement.classList.add('js');
showTab(location.hash.slice(1) || (startPage() === 'rynki' ? 'rynki' : 'sygnal'), false);
renderSignalCheck();
refreshLibraryPrices();
if (state.sync?.token) syncNow(false);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
