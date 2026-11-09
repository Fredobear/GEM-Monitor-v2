// Interfejs dziennika finansowego. Dane są zapisywane wyłącznie w tej przeglądarce (localStorage, dokumenty w IndexedDB).
// Strona ma zablokowane połączenia sieciowe (Content-Security-Policy: connect-src 'none'), więc nie może ich nigdzie wysłać.
// Kursy NBP i ceny ETF-ów są wklejane do strony przy publikacji (element #fin-market) – strona niczego nie pobiera.
// Korzysta z funkcji z finance-core.js i mmbackup.js (wklejonych wyżej w tym samym skrypcie).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const NF0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF1 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF4 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const tidy = (x) => (Math.abs(x) < 0.005 ? 0 : x);
const zl = (x) => `${NF2.format(tidy(x))} zł`;
const zl0 = (x) => `${NF0.format(Math.round(tidy(x)))} zł`;
const money = (x, cur) => (!cur || cur === 'PLN' ? zl(x) : `${NF2.format(tidy(x))} ${cur}`);
const signed = (x) => `${x < -0.004 ? '−' : '+'}${zl(Math.abs(x))}`;
const pct = (x) => (x === null || !Number.isFinite(x) ? '–' : `${Math.round(x * 100)}%`);
const pct1 = (x) => `${NF1.format(Math.abs(x * 100))}%`;
// Zysk lub strata z procentem, np. „+2 085,79 zł (+28,0%)”.
const gainText = (gain, gainPct) => `${signed(gain)}${gainPct === null || !Number.isFinite(gainPct) ? '' : ` (${gainPct < -0.00005 ? '−' : '+'}${pct1(gainPct)})`}`;
const gainClass = (x) => (x > 0.004 ? 'pos' : x < -0.004 ? 'neg' : '');
const isFundLot = (l) => typeof l?.asset === 'string' && l.asset.startsWith(FUND_PREFIX);
const compact = (x) => (x >= 10000 ? `${NF0.format(Math.round(x / 1000))} tys.` : NF0.format(Math.round(x)));
const fmtInput = (x) => (Number.isFinite(x) && Math.abs(x) >= 0.005 ? String(round2(x)).replace('.', ',') : '');
const fmtQty = (q) => (Number.isFinite(q) && q ? String(Number(q.toFixed(6))).replace('.', ',') : '');
const curLabel = (cur) => (!cur || cur === 'PLN' ? 'zł' : cur);
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
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ---------- Kursy NBP i ceny (dołączone do strony) ----------
const MARKET = (() => {
  try {
    return JSON.parse(document.getElementById('fin-market')?.textContent || '{}');
  } catch {
    return {};
  }
})();
// Kurs waluty z datą notowania (do podpowiedzi przy kwotach).
function fxInfo(cur, date) {
  const pairs = MARKET.fx?.[cur];
  if (!pairs?.length) return null;
  let p = pairs[0];
  for (const x of pairs) {
    if (x[0] > date) break;
    p = x;
  }
  return { rate: p[1], date: p[0] };
}
const valuationDate = () => today();

// Instrumenty z biblioteki XTB (akcje i ETF-y z GPW, obserwowane z USA, ETF-y UCITS wyceniane według indeksu):
// notowania z pliku aplikacji data/notowania.js (zwykły skrypt z tej samej strony – nic nie jest wysyłane).
let libraryQuotes = null;
// Fundusze ING TFI (np. w PPE): wyceny jednostek z pliku data/fundusze.js.
let fundsData = null;
function addLibraryAsset(symbol, name, currency) {
  if (!symbol || (MARKET.assets?.[symbol] && !MARKET.assets[symbol].library)) return false;
  const fund = symbol.startsWith(FUND_PREFIX);
  if (fund ? !fundsData : !libraryQuotes) return false;
  const entry = fund ? fundEntry(fundsData, symbol) : instEntry(libraryQuotes, symbol, currency || 'PLN', MARKET.fx);
  if (!entry) return false;
  MARKET.assets ??= {};
  MARKET.assets[symbol] = { name: name || symbol, ...entry, library: true };
  return true;
}
async function ensureLibraryAssets() {
  const lots = fin.accounts.flatMap((a) => a.lots ?? []).filter((l) => l.asset && l.asset !== 'manual' && !MARKET.assets?.[l.asset]);
  if (!lots.length) return false;
  if (lots.some((l) => !l.asset.startsWith(FUND_PREFIX))) libraryQuotes = libraryQuotes ?? (await instLoadQuotes());
  if (lots.some((l) => l.asset.startsWith(FUND_PREFIX))) fundsData = fundsData ?? (await instLoadFunds());
  let added = false;
  for (const l of lots) added = addLibraryAsset(l.asset, l.name, l.currency) || added;
  return added;
}
// ---------- Portfel GEM (zakładka GEM → Mój portfel GEM w tej samej przeglądarce) ----------
// Dziennik czyta i dopisuje wpłaty w portfelu GEM (klucz gem.v1.transactions) oraz czyta wycenę rachunków, którą
// zapisuje zakładka GEM (gem.v1.summary). To dane z tej samej przeglądarki – nic nie jest wysyłane.
const GEM_TX_KEY = 'gem.v1.transactions';
function gemTxsLoad() {
  try {
    const v = JSON.parse(localStorage.getItem(GEM_TX_KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function gemTxsSave(list) {
  try {
    localStorage.setItem(GEM_TX_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
{
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem('gem.v1.summary'));
  } catch {
    // brak wyceny portfela GEM – konto pokaże saldo przelewów
  }
  if (s?.accounts) MARKET.gemValues = Object.fromEntries(Object.entries(s.accounts).filter(([, v]) => Number.isFinite(v?.value)).map(([k, v]) => [k, { value: v.value, invested: v.invested, date: v.date ?? s.date ?? today() }]));
}
// Limit wpłat w roku (IKE, IKZE) z danych podatkowych aplikacji.
function gemLimit(gemAccount, year) {
  const years = Object.keys(MARKET.limits ?? {}).map(Number).sort((a, b) => a - b);
  const y = years.includes(year) ? year : years.filter((x) => x <= year).pop();
  const l = y ? MARKET.limits[y] : null;
  return gemAccount === 'IKE' ? l?.ike ?? null : gemAccount === 'IKZE' ? l?.ikze ?? null : null;
}

const refreshLibraryAssets = () =>
  ensureLibraryAssets()
    .then((added) => added && render())
    .catch(() => {});

function marketNote() {
  if (!MARKET.asOf) return 'Brak kursów walut i cen ETF-ów (pojawią się po najbliższej aktualizacji aplikacji). Konta w obcych walutach i aktywa nie są na razie wliczane do majątku.';
  return `Kursy walut: średnie NBP z ${shortDate(MARKET.asOf, true)}.${MARKET.pricesAsOf ? ` Ceny ETF-ów: z ${shortDate(MARKET.pricesAsOf, true)}.` : ''} Aktualizacja w każdy dzień roboczy razem z aplikacją.`;
}

// ---------- Zapis danych ----------
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
  worthRange: 12,
  csv: null,
  mm: null,
  inbox: false,
  notice: '',
  day: today(),
};

// Dane zaimportowane pierwszą wersją importu Money Managera: operacje bez kategorii to korekty salda.
{
  const r = repairLegacyMmImport(fin);
  if (r.fin !== fin) {
    fin = r.fin;
    save();
    if (r.corrections || r.renamed)
      ui.notice = `Dane z Money Managera zostały poprawione: ${r.corrections} ${plural(r.corrections, 'operacja bez kategorii to korekta', 'operacje bez kategorii to korekty', 'operacji bez kategorii to korekty')} salda (saldo początkowe i zmiany salda), więc nie liczą się już jako przychody ani wydatki.${r.renamed ? ` Uzupełniono nazwy ${r.renamed} wbudowanych kategorii.` : ''} Aby połączyć konta z Money Managera ze swoimi kontami, usuń poprzedni import (Więcej → Import) i wczytaj kopię ponownie.`;
  }
}

// ---------- Powiadomienia i cofanie ----------
function toast(text, ms = 3500) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

// Powiadomienie z przyciskiem „Cofnij” (przywraca stan sprzed zmiany; gemSnapshot – także wpisy portfela GEM).
function showUndo(text, snapshot, gemSnapshot = null) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span><button type="button" class="toast-btn">Cofnij</button>`;
  el.hidden = false;
  clearTimeout(toast.t);
  $('.toast-btn', el).onclick = () => {
    fin = { ...emptyFinance(), ...JSON.parse(snapshot) };
    save();
    if (gemSnapshot !== null) gemTxsSave(JSON.parse(gemSnapshot));
    el.hidden = true;
    render();
    toast('Przywrócono poprzedni stan.');
  };
  toast.t = setTimeout(() => (el.hidden = true), 10000);
}
function undoable(text, mutate, { gem = false } = {}) {
  const snapshot = JSON.stringify(fin);
  const gemSnapshot = gem ? JSON.stringify(gemTxsLoad()) : null;
  mutate();
  save();
  render();
  showUndo(text, snapshot, gemSnapshot);
  scheduleDocCleanup();
}

function download(name, content, type) {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Okna dialogowe ----------
const openDialog = (dlg) => (dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''));
const closeDialog = (dlg) => (dlg.open ? (dlg.close ? dlg.close() : dlg.removeAttribute('open')) : null);
for (const dlg of $$('dialog')) dlg.addEventListener('click', (ev) => (ev.target === dlg || ev.target.closest('[data-close]')) && closeDialog(dlg));

// Okno potwierdzenia. Zwraca dane formularza (pola z „extra”) albo null, gdy anulowano.
function confirmAction({ title, body = '', extra = '', ack = '', ok = 'Usuń', danger = true }) {
  const dlg = $('#confirm-dialog');
  const f = $('form', dlg);
  $('#cf-title').textContent = title;
  $('#cf-body').innerHTML = body;
  $('#cf-extra').innerHTML = extra;
  const ackBox = $('#cf-ack');
  $('#cf-ack-wrap').hidden = !ack;
  $('#cf-ack-label').textContent = ack;
  ackBox.checked = false;
  const okBtn = $('#cf-ok');
  okBtn.textContent = ok;
  okBtn.className = `btn ${danger ? 'danger-solid' : 'primary'}`;
  okBtn.disabled = Boolean(ack);
  ackBox.onchange = () => (okBtn.disabled = Boolean(ack) && !ackBox.checked);
  return new Promise((resolve) => {
    f.onsubmit = (ev) => {
      ev.preventDefault();
      if (okBtn.disabled) return;
      const data = Object.fromEntries(new FormData(f));
      resolve(data);
      closeDialog(dlg);
    };
    dlg.onclose = () => resolve(null);
    openDialog(dlg);
  });
}

// ---------- Dokumenty (paski płacowe, paragony, umowy) – IndexedDB na tym urządzeniu ----------
const DOC_KINDS = { pasek: 'Pasek płacowy', paragon: 'Paragon / faktura', umowa: 'Umowa', podatki: 'Podatki (PIT)', wyciag: 'Wyciąg bankowy', inne: 'Inny dokument' };
const docIcon = (type) => (String(type).startsWith('image/') ? '🖼️' : type === 'application/pdf' ? '📄' : '📎');
let docsDbPromise = null;
function docsDb() {
  docsDbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('gem-fin-docs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return docsDbPromise;
}
async function docStore(mode, fn) {
  const db = await docsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const getDoc = (id) => docStore('readonly', (s) => s.get(id));
const delDoc = (id) => docStore('readwrite', (s) => s.delete(id));
const docKeys = () => docStore('readonly', (s) => s.getAllKeys());

// Usunięte dokumenty znikają z pamięci dopiero po czasie na „Cofnij”.
let cleanupTimer = null;
function scheduleDocCleanup(delay = 15000) {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(async () => {
    try {
      const live = new Set((fin.docs ?? []).map((d) => d.id));
      for (const k of await docKeys()) if (!live.has(k)) await delDoc(k);
    } catch {
      // brak IndexedDB (np. tryb prywatny) – nic do sprzątania
    }
  }, delay);
}

async function saveDocFile(file, meta) {
  const id = newId();
  const doc = { id, name: file.name || 'dokument', type: file.type || '', size: file.size, kind: meta.kind || 'inne', date: meta.date || today(), txId: meta.txId ?? null, addedAt: Date.now() };
  fin.docs = [...(fin.docs ?? []), doc];
  try {
    // Plik zapisujemy jako ArrayBuffer (najpewniejsze w Safari na iPhonie).
    await docStore('readwrite', (s) => s.put({ name: doc.name, type: doc.type, data: meta.buffer }, id));
    return doc;
  } catch {
    fin.docs = fin.docs.filter((d) => d.id !== id);
    toast(`Nie udało się zapisać pliku ${doc.name} (brak miejsca albo zablokowana pamięć przeglądarki).`, 6000);
    return null;
  }
}

async function docBlob(id) {
  const meta = (fin.docs ?? []).find((d) => d.id === id);
  const rec = await getDoc(id).catch(() => null);
  if (!meta || !rec) return null;
  return { meta, file: new File([rec.data], meta.name, { type: rec.type || meta.type || 'application/octet-stream' }) };
}

async function shareDoc(id) {
  const d = await docBlob(id);
  if (!d) return toast('Nie znaleziono pliku w pamięci urządzenia.');
  if (navigator.canShare?.({ files: [d.file] })) {
    navigator.share({ files: [d.file], title: d.meta.name }).catch(() => {});
  } else download(d.meta.name, d.file);
}

async function openDoc(id) {
  const d = await docBlob(id);
  if (!d) return toast('Nie znaleziono pliku w pamięci urządzenia (mógł zostać usunięty razem z danymi witryny).', 6000);
  if (d.file.type.startsWith('image/')) {
    const url = URL.createObjectURL(d.file);
    $('#dv-title').textContent = d.meta.name;
    $('#dv-body').innerHTML = `<img src="${url}" alt="${esc(d.meta.name)}">`;
    $('#dv-share').onclick = () => shareDoc(id);
    $('#doc-dialog').onclose = () => URL.revokeObjectURL(url);
    return openDialog($('#doc-dialog'));
  }
  // PDF: w aplikacji z ekranu początkowego iPhone'a najpewniej działa arkusz „Udostępnij” (podgląd, zapis w Plikach).
  if (navigator.standalone && navigator.canShare?.({ files: [d.file] })) return shareDoc(id);
  const url = URL.createObjectURL(d.file);
  if (!window.open(url, '_blank')) download(d.meta.name, d.file);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- Pomocnicze ----------
const cat = (id) => fin.categories.find((c) => c.id === id);
const acc = (id) => fin.accounts.find((a) => a.id === id);
const activeAccounts = () => fin.accounts.filter((a) => !a.archived);
const NONE_CAT = { name: 'Do przypisania', emoji: '❓', color: '#94a3b8' };
const TYPE_SIGN = { wydatek: '−', przychod: '+', przelew: '', korekta: '' };
const TYPE_CLASS = { wydatek: '', przychod: 'pos', przelew: 'muted', korekta: 'muted' };
const accIcon = (a) => ACCOUNT_ICONS[a?.type] ?? '👛';
const colorVar = (c) => (c ? `--c:${esc(c)}` : '');
const accName = (id) => (id ? acc(id)?.name ?? '?' : 'usunięte konto');
const hasActivity = (id) => fin.txs.some((t) => !t.deleted && (t.accountId === id || t.toAccountId === id)) || fin.recurring.some((r) => r.accountId === id || r.toAccountId === id);

// Ikona i kolor operacji albo stałej pozycji.
function look(item, { recurring = false } = {}) {
  if (item.type === 'korekta') return { icon: '⚖️', color: '#64748b' };
  if (item.type === 'przelew') return { icon: isCard(acc(item.toAccountId)) ? '💳' : '⇄', color: '#64748b' };
  const c = cat(item.categoryId);
  if (c) return { icon: c.emoji, color: c.color };
  return recurring ? { icon: '🔁', color: '#64748b' } : { icon: NONE_CAT.emoji, color: NONE_CAT.color };
}

function defaultAccount(type) {
  const list = activeAccounts();
  if (type === 'wydatek' && list.some((a) => a.id === fin.lastAccountId)) return fin.lastAccountId;
  return (list.find((a) => !isCard(a) && a.type !== 'inwestycje') ?? list[0])?.id ?? '';
}

function accountOptions(selected, { none = true, filter = () => true } = {}) {
  const bal = balances(fin);
  const list = fin.accounts.filter((a) => (!a.archived || a.id === selected) && filter(a));
  return `${none ? '<option value="">— bez konta —</option>' : ''}${list
    .map((a) => `<option value="${esc(a.id)}" ${a.id === selected ? 'selected' : ''}>${esc(accIcon(a))} ${esc(a.name)} (${esc(money(bal[a.id], a.currency))})</option>`)
    .join('')}`;
}

// Operacja z importu na koncie w obcej walucie: kwota z pliku jest w walucie konta, do raportów przeliczamy na złote.
function localizeTx(t) {
  const cur = accountCurrency(fin, t.accountId);
  if (cur === 'PLN' || t.accountAmount !== undefined) return t;
  const pln = convert(MARKET, t.amount, cur, 'PLN', t.date);
  if (pln !== null) Object.assign(t, { accountAmount: t.amount, amount: pln });
  return t;
}

// ---------- Wykresy (SVG) ----------
function donut(items, total, label) {
  const R = 66;
  const W = 20;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const parts = items.filter((i) => i.amount > 0);
  const segs =
    total > 0
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

// Majątek (linia) i przychody/wydatki w każdym miesiącu (słupki pod spodem).
function worthChart(points) {
  if (points.length < 2) return `<p class="muted small">Wykres pokaże się, gdy dziennik obejmie co najmniej dwa miesiące${points.length ? ` (dane od: ${esc(monthLabel(points[0].month))})` : ''}.</p>`;
  const n = points.length;
  const fit = n <= 14;
  const W = fit ? 340 : n * 26;
  const M = { l: 6, r: 6, t: 16 };
  const H1 = 130;
  const GAP = 26;
  const H2 = 60;
  const H = M.t + H1 + GAP + H2 + 20;
  const slot = (W - M.l - M.r) / n;
  const x = (i) => M.l + slot * (i + 0.5);
  const ws = points.map((p) => p.worth);
  let lo = Math.min(...ws);
  let hi = Math.max(...ws);
  const padY = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1;
  lo -= padY;
  hi += padY;
  const y1 = (v) => M.t + H1 - ((v - lo) / (hi - lo)) * H1;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y1(p.worth).toFixed(1)}`).join('');
  const area = `${line}L${x(n - 1).toFixed(1)},${M.t + H1}L${x(0).toFixed(1)},${M.t + H1}Z`;
  const maxFlow = Math.max(1, ...points.flatMap((p) => [p.income, p.expense]));
  const base2 = M.t + H1 + GAP + H2;
  const bw = Math.max(3, Math.min(12, slot / 2 - 3));
  const parts = [`<text x="${M.l}" y="${M.t - 5}" class="wc-axis">majątek</text>`, `<path d="${area}" class="wc-area"/>`, `<path d="${line}" class="wc-line"/>`, `<text x="${M.l}" y="${M.t + H1 + GAP - 7}" class="wc-axis">przychody i wydatki w miesiącu</text>`, `<line x1="${M.l}" x2="${W - M.r}" y1="${base2}" y2="${base2}" class="wc-grid"/>`];
  points.forEach((p, i) => {
    const label = monthLabel(p.month);
    parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y1(p.worth).toFixed(1)}" r="3.4" class="wc-dot"><title>${esc(label)}: majątek ${zl(p.worth)}</title></circle>`);
    const hi2 = (p.income / maxFlow) * H2;
    const he = (p.expense / maxFlow) * H2;
    parts.push(`<rect x="${(x(i) - bw - 1).toFixed(1)}" y="${(base2 - hi2).toFixed(1)}" width="${bw.toFixed(1)}" height="${hi2.toFixed(1)}" rx="2" class="wc-inc"><title>${esc(label)}: przychody ${zl(p.income)}</title></rect>`);
    parts.push(`<rect x="${(x(i) + 1).toFixed(1)}" y="${(base2 - he).toFixed(1)}" width="${bw.toFixed(1)}" height="${he.toFixed(1)}" rx="2" class="wc-exp"><title>${esc(label)}: wydatki ${zl(p.expense)}</title></rect>`);
    if (fit || i % 2 === 0 || i === n - 1) parts.push(`<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" class="wc-axis">${MONTHS_SHORT[Number(p.month.slice(5, 7)) - 1]}${p.month.endsWith('-01') || i === 0 ? ` ${p.month.slice(2, 4)}` : ''}</text>`);
  });
  const size = fit ? 'style="width:100%;height:auto"' : `width="${W}" height="${H}"`;
  return `<div class="bars-wrap"><svg class="worth-chart" viewBox="0 0 ${W} ${H}" ${size} role="img" aria-label="Majątek oraz przychody i wydatki miesiąc po miesiącu">${parts.join('')}</svg></div><div class="legend-row"><span><i class="sw"></i>Majątek</span><span><i class="sw" style="background:var(--pos)"></i>Przychody</span><span><i class="sw" style="background:var(--neg)"></i>Wydatki</span></div>`;
}

function worthStats(points) {
  if (points.length < 2) return '';
  const first = points[0];
  const last = points.at(-1);
  const income = points.slice(1).reduce((s, p) => s + p.income, 0);
  const expense = points.slice(1).reduce((s, p) => s + p.expense, 0);
  const change = last.worth - first.worth;
  const since = `od końca ${MONTHS_GEN[Number(first.month.slice(5, 7)) - 1]}`;
  return `<div class="sum3 worth-stats"><div><span>Zmiana majątku</span><b class="${change >= 0 ? 'pos' : 'neg'}">${esc(signed(change))}</b><small>${esc(since)}</small></div><div><span>Przychody</span><b class="pos">${esc(zl0(income))}</b><small>${esc(since)}</small></div><div><span>Odłożone</span><b class="${income - expense >= 0 ? 'pos' : 'neg'}">${esc(signed(income - expense))}</b><small>przychody − wydatki</small></div></div>`;
}

// ---------- Wiersze list ----------
function txRow(t) {
  const { icon, color } = look(t);
  const c = cat(t.categoryId);
  if (t.type === 'korekta') {
    const cur = accountCurrency(fin, t.accountId);
    const v = t.accountAmount ?? t.amount;
    return `<button class="ftx" data-edit="${esc(t.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(t.merchant || 'Korekta salda')}</b><small>${esc(accName(t.accountId))} · korekta salda, poza wydatkami</small></span><span class="ftx-amt muted">${v < 0 ? '−' : '+'}${esc(money(Math.abs(v), cur))}${cur !== 'PLN' ? `<small>≈ ${esc(zl(Math.abs(t.amount)))}</small>` : ''}</span></button>`;
  }
  const title = t.merchant || (t.type === 'przelew' ? 'Przelew' : c?.name ?? 'Bez opisu');
  const where = t.type === 'przelew' ? `${accName(t.accountId)} → ${accName(t.toAccountId)}` : [t.merchant || !c ? c?.name ?? NONE_CAT.name : '', t.accountId ? accName(t.accountId) : ''].filter(Boolean).join(' · ');
  const src = { applepay: 'Apple Pay', csv: 'import', stale: 'stała' }[t.source];
  const docs = (fin.docs ?? []).some((d) => d.txId === t.id) ? ' · 📎' : '';
  const extra = t.accountAmount !== undefined ? `<small>${esc(money(t.accountAmount, accountCurrency(fin, t.accountId)))}</small>` : t.time ? `<small>${esc(t.time)}</small>` : '';
  return `<button class="ftx" data-edit="${esc(t.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(title)}</b><small>${esc([where, src].filter(Boolean).join(' · '))}${docs}</small></span><span class="ftx-amt ${TYPE_CLASS[t.type]}">${TYPE_SIGN[t.type]}${esc(zl(t.amount))}${extra}</span></button>`;
}

function planRow({ rec, date }) {
  const { icon, color } = look(rec, { recurring: true });
  return `<button class="ftx plan" data-edit-rec="${esc(rec.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(rec.title)}</b><small>${esc(shortDate(date))} · ${esc((FREQS[rec.freq] ?? '').toLowerCase())}${rec.auto ? '' : ' · z potwierdzeniem'}</small></span><span class="ftx-amt">${TYPE_SIGN[rec.type]}${esc(money(rec.amount, accountCurrency(fin, rec.accountId)))}</span></button>`;
}

function pendRow({ rec, date }) {
  const { icon, color } = look(rec, { recurring: true });
  return `<div class="pend-row"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="pend-main"><b>${esc(rec.title)}</b><small>termin ${esc(shortDate(date))} · ${esc((FREQS[rec.freq] ?? '').toLowerCase())}</small></span><span class="pend-amt ${TYPE_CLASS[rec.type]}">${TYPE_SIGN[rec.type]}${esc(money(rec.amount, accountCurrency(fin, rec.accountId)))}</span><span class="pend-btns"><button class="btn small primary" data-settle="${esc(rec.id)}" data-post="1">Zapisz</button><button class="btn small ghost" data-settle="${esc(rec.id)}" data-post="0">Pomiń ten termin</button></span></div>`;
}

// ---------- Apple Pay: karty bez przypisanego konta ----------
function unmappedCards() {
  const m = new Map();
  for (const t of liveTx(fin)) if (t.card && !t.accountId) m.set(t.card.trim(), (m.get(t.card.trim()) ?? 0) + 1);
  return [...m].map(([card, count]) => ({ card, count }));
}

function cardPrompt() {
  const list = unmappedCards();
  if (!list.length || !activeAccounts().length) return '';
  return `<section class="card pend"><h2>Karty bez przypisanego konta</h2><p class="small muted">Te płatności z Apple Pay nie trafiły na żadne konto, bo nazwa karty z Portfela nie jest przypisana do konta. Wybierz konto raz – kolejne płatności tą kartą trafią na nie same.</p>${list
    .map(({ card, count }) => `<div class="map-row"><div><b>💳 ${esc(card)}</b><small>${count} ${plural(count, 'płatność', 'płatności', 'płatności')}</small></div><div class="row-inline"><select data-card-select="${esc(card)}" aria-label="Konto dla karty ${esc(card)}">${accountOptions(fin.accounts.find((a) => !a.archived && !isCard(a))?.id ?? '', { none: false })}</select><button class="btn small primary" data-assign-card="${esc(card)}">Przypisz</button></div></div>`)
    .join('')}</section>`;
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

// Zysk z inwestycji na kontach wliczanych do majątku (otwarte pozycje, wycena na dziś).
function investTotals() {
  const at = valuationDate();
  const out = { cost: 0, value: 0, gain: 0, gainPct: null, positions: 0 };
  for (const a of activeAccounts()) {
    if (a.excludeFromTotal || !a.lots?.length) continue;
    const s = investSummary(MARKET, a, at);
    if (!s?.positions) continue;
    out.cost += s.cost;
    out.value += s.value;
    out.positions += s.positions;
  }
  out.gain = out.value - out.cost;
  out.gainPct = out.cost > 0 ? out.value / out.cost - 1 : null;
  return out;
}

function heroBalance() {
  if (!activeAccounts().length) return '';
  const nw = netWorth(fin, MARKET);
  const inv = investTotals();
  const lines = [];
  if (nw.investments > 0.004) lines.push(`w tym inwestycje: <b>${esc(zl(nw.investments))}</b>`);
  if (inv.positions) lines.push(`zysk z inwestycji: <b class="${gainClass(inv.gain)}">${esc(gainText(inv.gain, inv.gainPct))}</b>`);
  if (nw.debt > 0.004) lines.push(`zadłużenie: <b class="neg">−${esc(zl(nw.debt))}</b>`);
  if (nw.missing.length) lines.push(`bez kursu: ${esc(nw.missing.join(', '))}`);
  return `<button class="card hero-bal" data-view="konta"><span class="hb-main"><span class="muted small">Majątek – wszystkie konta</span><span class="hb-val ${nw.total < -0.004 ? 'neg' : ''}">${esc(zl(nw.total))}</span>${lines.length ? `<span class="small muted">${lines.join(' · ')}</span>` : ''}</span><span class="hb-chev" aria-hidden="true">›</span></button>`;
}

function alerts() {
  const out = [];
  if (ui.notice) out.push(`<div class="banner good">${esc(ui.notice)}</div>`);
  const n = liveTx(fin).filter((t) => isFlow(t) && !t.categoryId).length;
  if (n) out.push(`<div class="banner warn"><b>${n} ${plural(n, 'operacja czeka', 'operacje czekają', 'operacji czeka')} na kategorię.</b> <button class="link" data-act="inbox">Przypisz teraz</button></div>`);
  out.push(cardPrompt());
  const due = dueRecurring(fin, today());
  if (due.length) out.push(`<section class="card pend"><h2>Stałe pozycje do zatwierdzenia</h2>${due.map(pendRow).join('')}</section>`);
  // Wpłaty do planów inwestycyjnych do potwierdzenia (bez automatu albo bez ceny któregoś instrumentu).
  for (const d of duePlanDeposits(fin, today())) {
    if (d.plan.recurring.auto && !planBlocked.includes(`${d.accountId}|${d.planId}`)) continue;
    const key = `${d.accountId}|${d.planId}`;
    out.push(`<div class="banner info">📋 Wpłata do planu <b>${esc(d.plan.name)}</b> (${esc(d.account.name)}) z ${esc(shortDate(d.date, true))}: ${esc(money(d.plan.recurring.amount, d.account.currency))}${planBlocked.includes(key) ? ' – brakuje ceny któregoś instrumentu, wpisz ją' : ''}. <button class="link" data-plan-pay="${esc(`${key}|${d.date}`)}">Zapisz wpłatę</button> · <button class="link" data-plan-skip="${esc(key)}">Pomiń</button></div>`);
  }
  const bal = balances(fin);
  for (const a of activeAccounts()) {
    // Kredyt bez automatycznego zapisu rat: przypomnienie o racie na 3 dni przed terminem.
    if (isLoan(a) && !a.loan.autoPost) {
      const next = loanSchedule(a.loan).find((r) => r.kind === 'rata' && r.date >= today());
      const days = next ? daysBetween(today(), next.date) : 99;
      if (days <= 3) out.push(`<div class="banner info">🏠 <b>${esc(a.name)}</b>: rata ${days === 0 ? 'dziś' : days === 1 ? 'jutro' : `za ${days} dni (${esc(shortDate(next.date))})`} – ${esc(money(next.payment + (Number(a.loan.insurance) || 0), a.currency))}. <button class="link" data-loan="${esc(a.id)}">Szczegóły</button></div>`);
    }
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
        const rows = liveTx(fin)
          .filter((t) => t.type === ui.kind && t.date >= from && t.date <= to && (key === '_none' ? !t.categoryId : t.categoryId === key))
          .sort(byNewest);
        txs = `<div class="cat-tx">${rows.slice(0, 30).map(txRow).join('')}${rows.length > 30 ? `<button class="link small" data-cat-all="${esc(key)}">Pokaż wszystkie (${rows.length})</button>` : ''}</div>`;
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
    // Każda kwota otwiera dymek z wydatkami, z których się składa (kategoria × okres).
    const amt = (id, col, value, cls = '') => `<button type="button" class="amt-pop ${cls}" data-cmp="${esc(id ?? '_none')}|${col}" aria-haspopup="dialog">${zl0(value)}</button>`;
    if (cmp.rows.length)
      out.push(`<section class="card"><h2>Kategorie w porównaniu z poprzednim miesiącem</h2><div class="tbl-wrap"><table class="cmp-table"><thead><tr><th>Kategoria</th><th class="num">${esc(MONTHS_SHORT[Number(month.slice(5, 7)) - 1])}</th><th class="num">Poprz.</th><th class="num">Śr. 3 mies.</th></tr></thead><tbody>${cmp.rows
        .map((r) => `<tr><td>${esc(r.emoji)} ${esc(r.name)}</td><td class="num">${amt(r.id, 'cur', r.current, 'strong')}</td><td class="num ${r.current > r.previous ? 'neg' : 'pos'}">${amt(r.id, 'prev', r.previous)}</td><td class="num muted">${amt(r.id, 'avg', r.avg3)}</td></tr>`)
        .join('')}</tbody><tfoot><tr><td><b>Razem</b></td><td class="num">${amt('_all', 'cur', cmp.current.expense, 'strong')}</td><td class="num">${amt('_all', 'prev', cmp.previous.expense)}</td><td></td></tr></tfoot></table></div><p class="small muted">Dotknij kwoty, aby zobaczyć wydatki, z których się składa.</p></section>`);
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
  <p>Zapisuj wydatki i przychody, sprawdzaj je w kalendarzu i w raportach, ustaw stałe płatności, pilnuj zadłużenia kart i śledź swój majątek. Wszystko zostaje na tym urządzeniu.</p>
  <div class="start-grid">
   <button class="start" data-act="add-acc"><span>🏦</span><b>Dodaj konto</b><small>konto w banku, kartę kredytową, konto inwestycyjne, gotówkę</small></button>
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
    .filter((t) => (!ui.account || t.accountId === ui.account || t.toAccountId === ui.account) && (!ui.type || t.type === ui.type) && (!ui.category || (ui.category === '_none' ? !t.categoryId && isFlow(t) : t.categoryId === ui.category)))
    .filter((t) => !q || `${t.merchant ?? ''} ${t.note ?? ''} ${cat(t.categoryId)?.name ?? ''} ${String(Math.abs(t.amount)).replace('.', ',')}`.toLowerCase().includes(q))
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
  const b = a ? balances(fin)[a.id] : 0;
  const head = a
    ? `<div class="acc-head"><span class="acc-ico" style="${colorVar(a.color)}">${esc(accIcon(a))}</span><span class="acc-main"><b>${esc(a.name)}</b><small>saldo <b class="${b < -0.004 ? 'neg' : ''}">${esc(money(b, a.currency))}</b></small></span><button class="link small" data-act="clear-acc">wszystkie konta</button></div>`
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

// ---------- Konta i majątek ----------
const WORTH_RANGES = [[6, '6 mies.'], [12, '1 rok'], [36, '3 lata'], [0, 'Wszystko']];

function lotLabel(l) {
  if (l.asset === 'manual') return l.name || 'Aktywo';
  if (isFundLot(l)) return `${l.name || 'Fundusz'} (kat. ${fundCategoryOf(l.asset)})`;
  return l.asset;
}

function investmentLines(a, cash) {
  const at = valuationDate();
  const sum = investSummary(MARKET, a, at);
  // Pozycje tego samego instrumentu (np. kolejne wpłaty w planie) pokazujemy razem: ilość, koszt, wartość i zysk.
  const groups = new Map();
  for (const l of (a.lots ?? []).filter((x) => !x.until)) {
    const key = l.asset === 'manual' ? `manual:${l.id}` : l.asset;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const lines = [...groups.values()].map((list) => {
    const l0 = list[0];
    let value = 0;
    let cost = 0;
    let qty = 0;
    let costCur = 0;
    let missing = false;
    for (const l of list) {
      const r = lotResult(MARKET, l, at);
      if (!r) missing = true;
      else if (lotActive(l, at)) {
        value += r.value;
        cost += r.costPLN;
        qty += l.qty;
        costCur += l.qty * l.price;
      }
    }
    const approx = MARKET.assets?.[l0.asset]?.source === 'proxy' ? '≈ ' : '';
    const unit = isFundLot(l0) ? 'j.u.' : 'szt.';
    const cur = lotCurrency(MARKET, l0);
    const newest = [...list].sort((x, y) => ((y.mark?.[0] ?? y.date) > (x.mark?.[0] ?? x.date) ? 1 : -1))[0];
    const priceNow = lotPrice(MARKET, newest, at);
    const priceChange = qty > 0 && costCur > 0 ? priceNow / (costCur / qty) - 1 : null;
    const gain = value - cost;
    const noMark = needsMark(l0) && !list.some((l) => l.mark);
    const detail = qty > 0
      ? `<small>zainwestowano ${esc(zl(cost))} · <span class="${gainClass(gain)}">${esc(gainText(gain, cost > 0 ? value / cost - 1 : null))}</span>${cur !== 'PLN' && priceChange !== null ? ` · cena w ${esc(cur)} ${priceChange < 0 ? '−' : '+'}${esc(pct1(priceChange))}` : ''}${list.length > 1 ? ` · ${list.length} ${plural(list.length, 'zakup', 'zakupy', 'zakupów')}` : ''}${noMark ? ' · <span class="warn">wpisz kurs z XTB w „Aktywa”, aby zobaczyć zysk</span>' : ''}</small>`
      : '';
    return `<div class="inv-line inv-pos"><span>${esc(lotLabel(l0))} · ${esc(fmtQty(Math.round(list.reduce((s, l) => s + l.qty, 0) * 1e6) / 1e6))} ${unit}${detail}</span><b>${missing && !value ? 'brak kursu' : esc(approx + zl(value))}</b></div>`;
  });
  const head = sum?.positions
    ? `<div class="inv-sum"><div><span>Zainwestowano</span><b>${esc(zl(sum.cost))}</b></div><div><span>Wartość aktywów</span><b>${esc(zl(sum.value))}</b></div><div><span>Zysk</span><b class="${gainClass(sum.gain)}">${esc(gainText(sum.gain, sum.gainPct))}</b></div></div>`
    : '';
  const realized = sum?.realized !== null && sum?.realized !== undefined && Math.abs(sum.realized) >= 0.01 ? `<div class="inv-line"><span>Zysk zrealizowany (sprzedane pozycje)</span><b class="${gainClass(sum.realized)}">${esc(signed(sum.realized))}</b></div>` : '';
  return `${head}${lines.join('')}${realized}<div class="inv-line"><span>Wolna gotówka</span><b>${esc(money(cash, a.currency))}</b></div>`;
}

const pctNum = (x) => NF2.format(Math.round(x * 100) / 100).replace(/,00$/, '');
const monthYear = (iso) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '–');

// Karta kredytowa: minimalna spłata i odsetki, gdy zadłużenie nie zostanie spłacone w terminie (z ustawień karty).
function cardCostLine(a, debt) {
  if (debt < 0.005 || !(a.cardRate > 0 || a.minPayPct > 0)) return '';
  const parts = [];
  if (a.minPayPct > 0) parts.push(`minimalna spłata ok. <b>${esc(zl(Math.min(debt, (debt * a.minPayPct) / 100)))}</b> (bank może mieć też kwotę minimalną)`);
  if (a.cardRate > 0) parts.push(`odsetki przy spłacie po terminie ok. <b>${esc(zl((debt * a.cardRate) / 1200))}</b> miesięcznie (${esc(pctNum(a.cardRate))}% rocznie)`);
  return `<div class="small muted">${parts.join(' · ')}</div>`;
}

// Kredyt: postęp spłaty, najbliższa rata, oprocentowanie i zgodność salda z harmonogramem.
function loanRateText(L, rate) {
  if (L.rateType === 'zero') return '0%';
  const ref = L.rateType === 'zmienne' && Number.isFinite(L.margin) ? ` (${L.refName || 'stawka'} ${pctNum(rate - L.margin)}% + marża ${pctNum(L.margin)}%)` : '';
  return `${pctNum(rate)}%${ref}`;
}
function loanInfo(a, b) {
  const L = a.loan;
  const cur = a.currency || 'PLN';
  const s = loanSummary(L, today());
  const ins = Number(L.insurance) || 0;
  const next = s.next
    ? `Następna rata: <b>${esc(shortDate(s.next.date))}</b> · <b>${esc(money(s.next.payment + ins, cur))}</b> <span class="muted">(kapitał ${esc(money(s.next.principal, cur))}, odsetki ${esc(money(s.next.interest, cur))}${ins ? `, opłaty ${esc(money(ins, cur))}` : ''})</span>`
    : '<b class="pos">Kredyt spłacony 🎉</b>';
  const drift = round2(-b - s.remaining);
  const fixedEnd = L.fixedUntil && L.fixedUntil >= today() && daysBetween(today(), L.fixedUntil) <= 120 ? `<div class="small warn">Okres stałej stopy kończy się ${esc(shortDate(L.fixedUntil, true))} – sprawdź w banku nowe oprocentowanie i wpisz je w szczegółach kredytu.</div>` : '';
  return `<div class="meter" title="Spłacony kapitał"><span style="width:${(s.progress * 100).toFixed(1)}%;background:var(--pos)"></span></div>
  <div class="loan-line">Spłacono <b>${esc(pct1(s.progress))}</b> kapitału · zostało <b>${esc(money(s.remaining, cur))}</b> z ${esc(money(s.original, cur))}</div>
  <div class="loan-line">${next}</div>
  <div class="loan-line muted">${esc(LOAN_KINDS[L.kind] ?? 'Kredyt')} · oprocentowanie ${esc(loanRateText(L, s.rate))} · raty ${L.installments === 'malejace' ? 'malejące' : 'równe'} · ${s.left} ${plural(s.left, 'rata', 'raty', 'rat')} do końca${s.end ? ` (${esc(monthYear(s.end))})` : ''}</div>
  ${fixedEnd}
  ${Math.abs(drift) >= 1 ? `<div class="small warn">Saldo w dzienniku różni się od harmonogramu o ${esc(money(Math.abs(drift), cur))}. <button class="link small" data-loan-sync="${esc(a.id)}">Ustaw według harmonogramu</button></div>` : ''}`;
}

// Konto powiązane z portfelem GEM (np. XTB IKE): limit wpłat, wycena z portfela i wpłaty z portfela do zapisania tutaj.
function gemInfo(a, b) {
  const gemTxs = gemTxsLoad();
  const year = Number(today().slice(0, 4));
  const limit = gemLimit(a.gemAccount, year);
  const dep = gemYearDeposits(gemTxs, a.gemAccount, year);
  const out = [];
  if (limit) {
    const share = Math.min(1, dep / limit);
    out.push(`<div class="meter" title="Wykorzystany limit wpłat"><span style="width:${(share * 100).toFixed(1)}%;background:${share >= 1 ? 'var(--warn)' : 'var(--accent)'}"></span></div><div class="ike-line">Wpłaty w ${year}: <b>${esc(zl(dep))}</b> z ${esc(zl0(limit))} limitu ${esc(a.gemAccount)} · zostało <b>${esc(zl(Math.max(0, limit - dep)))}</b></div>`);
  }
  const g = MARKET.gemValues?.[a.gemAccount];
  if (g) {
    const gain = Number.isFinite(g.invested) ? g.value - g.invested : null;
    out.push(`<div class="ike-line">Portfel GEM (${esc(GEM_ACCOUNTS[a.gemAccount] ?? a.gemAccount)}): wartość <b>${esc(zl(g.value))}</b>${Number.isFinite(g.invested) ? ` · wpłacono netto ${esc(zl(g.invested))} · zysk <b class="${gainClass(gain)}">${esc(gainText(gain, g.invested > 0 ? g.value / g.invested - 1 : null))}</b>` : ''} <span class="muted">(wycena z ${esc(shortDate(g.date, true))})</span></div>`);
  } else if (a.gemValuation) out.push('<div class="ike-line muted">Wycena pojawi się po otwarciu zakładki GEM → Mój portfel GEM (na tym urządzeniu). Do tego czasu konto pokazuje sumę przelewów.</div>');
  if (a.gemValuation) out.push(`<div class="ike-line muted">Przelewy na to konto (wpłaty netto w dzienniku): ${esc(money(b, a.currency))}</div>`);
  const pending = unlinkedGemTxs(fin, gemTxs, a);
  if (pending.length) {
    const list = pending.slice(0, 6).map((g2) => `${g2.type === 'wplata' ? 'wpłata' : 'wypłata'} ${shortDate(g2.date)} – ${zl(g2.amountPLN)}`).join(', ');
    out.push(`<div class="lv-box small">W portfelu GEM ${pending.length === 1 ? 'jest operacja' : 'są operacje'} na ${esc(a.gemAccount)}, ${pending.length === 1 ? 'której' : 'których'} nie ma w Finansach: ${esc(list)}${pending.length > 6 ? '…' : ''}.
    <label class="field">Z konta / na konto<select data-gem-from="${esc(a.id)}">${accountOptions(defaultAccount('przelew'), { none: false, filter: (x) => x.id !== a.id && !isLoan(x) && !x.gemAccount })}</select></label>
    <button type="button" class="btn small" data-gem-link="${esc(a.id)}">Zapisz jako ${pending.length === 1 ? 'przelew' : `przelewy (${pending.length})`}</button></div>`);
  }
  return out.join('');
}

// Plany inwestycyjne konta: udziały, wpłata cykliczna, przyciski wpłaty i edycji.
const planItemLabel = (i) => (String(i.asset).startsWith(FUND_PREFIX) ? `${i.name || 'fundusz'} (${fundCategoryOf(i.asset)})` : i.asset);
function plansInfo(a) {
  const cur = a.currency || 'PLN';
  return (a.plans ?? [])
    .map((p) => {
      const r = p.recurring;
      const rec = r ? ` · co miesiąc ${money(r.amount, cur)} (${r.day}. dnia, najbliższa ${shortDate(r.nextDate)})${r.auto ? '' : ' – z potwierdzeniem'}` : '';
      const total = (p.log ?? []).reduce((s, e) => s + (e.amount || 0), 0);
      return `<div class="plan-line"><div class="small"><b>📋 ${esc(p.name)}</b>: ${esc(p.items.map((i) => `${planItemLabel(i)} ${pctNum(i.pct)}%`).join(' · '))}${esc(rec)}${total ? `<br><span class="muted">Wpłacono w planie: ${esc(money(total, cur))} (${(p.log ?? []).length} ${plural((p.log ?? []).length, 'wpłata', 'wpłaty', 'wpłat')})</span>` : ''}</div><div class="acc-actions"><button class="btn small primary" data-plan-pay="${esc(`${a.id}|${p.id}`)}">Wpłać do planu</button><button class="btn small ghost" data-plan-edit="${esc(`${a.id}|${p.id}`)}">Edytuj plan</button></div></div>`;
    })
    .join('');
}

function accountItem(a, b) {
  const card = isCard(a);
  const loan = isLoan(a);
  const gemVal = Boolean(a.gemAccount && a.gemValuation);
  const inv = !loan && (a.type === 'inwestycje' || a.lots?.length);
  const cur = a.currency || 'PLN';
  const st = card ? cardStatus(a, b) : null;
  const due = card ? cardDue(a, b, today()) : null;
  const w = accountWorth(fin, a, MARKET, valuationDate(), b);
  const sub = [ACCOUNT_TYPES[a.type] ?? 'Konto', a.gemAccount ? `portfel GEM: ${GEM_ACCOUNTS[a.gemAccount] ?? a.gemAccount}` : '', cur !== 'PLN' ? cur : '', a.excludeFromTotal ? 'poza majątkiem' : ''].filter(Boolean).join(' · ');
  const main = inv || gemVal ? (w ? zl(w.total) : money(b, cur)) : money(b, cur);
  const conv = !inv && !gemVal && cur !== 'PLN' && w ? `<span class="acc-sub">≈ ${esc(zl(w.cashPLN))}</span>` : inv && !w ? '<span class="acc-sub">brak kursu</span>' : '';
  const cardInfo = card
    ? `${st.limit ? `<div class="meter" title="Wykorzystany limit"><span style="width:${(st.usedShare * 100).toFixed(1)}%;background:${st.usedShare > 0.8 ? 'var(--neg)' : 'var(--accent)'}"></span></div>` : ''}<div class="small muted">${st.debt > 0.004 ? `Do spłaty <b class="neg">${esc(zl(st.debt))}</b>` : 'Karta spłacona ✓'}${st.limit ? ` · limit ${esc(zl0(st.limit))} · dostępne ${esc(zl(st.available))}` : ''}${due ? ` · termin ${esc(shortDate(due.due))}` : ''}</div>${cardCostLine(a, st.debt)}`
    : '';
  const cards = a.cards?.length ? `<div class="small muted">Apple Pay: ${esc(a.cards.join(', '))}</div>` : '';
  const details = `${inv && !gemVal ? investmentLines(a, b) : ''}${inv && !gemVal ? plansInfo(a) : ''}${a.gemAccount ? gemInfo(a, b) : ''}${loan ? loanInfo(a, b) : ''}${cardInfo}${cards}`;
  const buttons = [
    inv && !gemVal ? `<button class="btn small" data-plan-new="${esc(a.id)}">+ Plan inwestycyjny</button>` : '',
    card && st.debt > 0.004 ? `<button class="btn small primary" data-repay="${esc(a.id)}">Spłać kartę</button>` : '',
    loan ? `<button class="btn small primary" data-loan="${esc(a.id)}">Szczegóły kredytu</button>` : '',
    a.gemAccount ? `<button class="btn small primary" data-gem-pay="${esc(a.id)}">Wpłać na ${esc(a.gemAccount === 'ZWYKLE' ? 'konto' : a.gemAccount)}</button>` : '',
    inv && !gemVal ? `<button class="btn small ${a.gemAccount ? '' : 'primary'}" data-lots="${esc(a.id)}">Aktywa</button>` : '',
    `<button class="btn small" data-history="${esc(a.id)}">Historia</button>`,
    `<button class="btn small ghost" data-edit-acc="${esc(a.id)}">Edytuj</button>`,
  ].join('');
  const negative = (inv || gemVal ? w?.total ?? b : b) < -0.004;
  return `<li class="acc-item"><div class="acc-line"><span class="acc-ico" style="${colorVar(a.color)}">${esc(accIcon(a))}</span><span class="acc-main"><b>${esc(a.name)}</b><small>${esc(sub)}</small></span><span class="acc-bal ${negative ? 'neg' : ''}">${esc(main)}${conv}</span></div>
  <div class="acc-more">${details}<div class="acc-actions">${buttons}</div></div></li>`;
}

function viewAccounts() {
  const bal = balances(fin);
  const nw = netWorth(fin, MARKET);
  const inv = investTotals();
  const active = activeAccounts();
  const hidden = fin.accounts.filter((a) => a.archived);
  const points = active.length ? worthHistory(fin, MARKET, { today: today(), months: ui.worthRange }) : [];
  const worth = active.length
    ? `<section class="card"><div class="card-head"><h2>Majątek</h2><div class="seg small">${WORTH_RANGES.map(([m, l]) => `<button data-worth-range="${m}" class="${ui.worthRange === m ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="worth-top"><b class="hb-val ${nw.total < -0.004 ? 'neg' : ''}">${esc(zl(nw.total))}</b></div>
      <div class="sum3"><div><span>Na kontach</span><b class="pos">${esc(zl(nw.assets - nw.investments))}</b></div><div><span>Inwestycje</span><b>${esc(zl(nw.investments))}</b>${inv.positions ? `<small class="${gainClass(inv.gain)}">zysk ${esc(gainText(inv.gain, inv.gainPct))}</small>` : ''}</div><div><span>Zadłużenie</span><b class="${nw.debt > 0.004 ? 'neg' : ''}">${nw.debt > 0.004 ? '−' : ''}${esc(zl(nw.debt))}</b></div></div>
      ${worthChart(points)}${worthStats(points)}
      ${nw.missing.length ? `<p class="small warn">Bez kursu waluty (poza majątkiem): ${esc(nw.missing.join(', '))}.</p>` : ''}
      <p class="small muted">${esc(marketNote())}</p></section>`
    : '';
  return `${worth}
  <section class="card"><div class="card-head"><h2>Konta i karty</h2><button class="btn small primary" data-act="add-acc">+ Dodaj konto</button></div>
  ${active.length ? `<ul class="acc-list">${active.map((a) => accountItem(a, bal[a.id])).join('')}</ul>` : '<p class="muted">Nie masz jeszcze kont. Dodaj konto w banku, kartę kredytową, konto inwestycyjne albo gotówkę.</p>'}
  ${active.length > 1 ? '<div class="row-btns"><button class="btn" data-act="transfer">⇄ Przelew między kontami</button></div>' : ''}</section>
  ${cardPrompt()}
  ${hidden.length ? `<details class="card"><summary>Ukryte konta (${hidden.length})</summary><ul class="acc-list">${hidden.map((a) => accountItem(a, bal[a.id])).join('')}</ul></details>` : ''}
  <p class="small muted">Karta kredytowa ma saldo ujemne: to Twoje zadłużenie. Wydatek kartą je powiększa, a „Spłać kartę” przelewa pieniądze z wybranego konta (spłata nie jest wydatkiem). Konto inwestycyjne: wartość to wolna gotówka plus aktywa wyceniane po bieżących cenach.</p>`;
}

// ---------- Stałe pozycje ----------
function recRow(r) {
  const { icon, color } = look(r, { recurring: true });
  const ended = r.endDate && r.nextDate > r.endDate;
  const status = r.paused ? 'wstrzymane' : ended ? 'zakończone' : shortDate(r.nextDate);
  return `<button class="ftx" data-edit-rec="${esc(r.id)}"><span class="cat-ico" style="${colorVar(color)}">${esc(icon)}</span><span class="ftx-main"><b>${esc(r.title)}</b><small>${esc(status)} · ${esc((FREQS[r.freq] ?? '').toLowerCase())}${r.auto ? '' : ' · z potwierdzeniem'}</small></span><span class="ftx-amt ${r.paused || ended ? 'muted' : TYPE_CLASS[r.type]}">${TYPE_SIGN[r.type]}${esc(money(r.amount, accountCurrency(fin, r.accountId)))}</span></button>`;
}

function viewRecurring() {
  const recs = fin.recurring;
  const m = recurringMonthly(fin, MARKET);
  const due = dueRecurring(fin, today());
  const up = upcomingRecurring(fin, today(), 30);
  const group = (type, title) => {
    const list = recs.filter((r) => r.type === type).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
    return list.length ? `<div class="day-sep"><span>${title}</span></div>${list.map(recRow).join('')}` : '';
  };
  const out = m.wydatek + m.kredyty;
  const loans = fin.accounts.filter((a) => isLoan(a) && !a.archived);
  const loanRows = loans
    .map((a) => {
      const s = loanSummary(a.loan, today());
      return `<button class="ftx" data-loan="${esc(a.id)}"><span class="cat-ico" style="${colorVar(a.color ?? LOAN_CATEGORY.color)}">${esc(accIcon(a))}</span><span class="ftx-main"><b>${esc(a.name)}</b><small>${s.next ? `${esc(shortDate(s.next.date))} · co miesiąc · ${s.left} ${plural(s.left, 'rata', 'raty', 'rat')} do końca${a.loan.autoPost ? '' : ' · zapis ręczny'}` : 'spłacony'}</small></span><span class="ftx-amt neg">${s.next ? `−${esc(money(s.next.payment + (Number(a.loan.insurance) || 0), a.currency))}` : ''}</span></button>`;
    })
    .join('');
  return `<section class="card"><div class="sum3"><div><span>Stałe przychody</span><b class="pos">+${esc(zl(m.przychod))}</b><small>miesięcznie</small></div><div><span>Stałe wydatki</span><b class="neg">−${esc(zl(out))}</b><small>${m.kredyty ? `w tym raty ${esc(zl(m.kredyty))}` : 'miesięcznie'}</small></div><div><span>Zostaje</span><b class="${m.przychod - out >= 0 ? 'pos' : 'neg'}">${esc(signed(m.przychod - out))}</b><small>miesięcznie</small></div></div></section>
  ${due.length ? `<section class="card pend"><h2>Do zatwierdzenia</h2>${due.map(pendRow).join('')}</section>` : ''}
  <section class="card"><div class="card-head"><h2>Stałe przelewy i dochody</h2><button class="btn small primary" data-act="add-rec">+ Dodaj</button></div>
  ${recs.length ? `${group('przychod', 'Dochody')}${group('wydatek', 'Płatności')}${group('przelew', 'Przelewy między kontami')}` : '<p class="muted">Dodaj pensję, czynsz, rachunki, subskrypcje albo stały przelew na oszczędności. W dniu terminu operacja zapisze się sama albo poprosi o zatwierdzenie (gdy kwota co miesiąc jest inna).</p>'}
  ${loans.length ? `<div class="day-sep"><span>Raty kredytów</span></div>${loanRows}` : '<p class="small muted">Kredyt albo pożyczkę dodasz w Kontach (rodzaj „Kredyt / pożyczka”) – raty pojawią się tutaj i w kalendarzu.</p>'}</section>
  ${up.length ? `<section class="card"><h2>Najbliższe 30 dni</h2>${up.map(planRow).join('')}</section>` : ''}`;
}

// ---------- Do przypisania ----------
function viewInbox() {
  const list = liveTx(fin).filter((t) => isFlow(t) && !t.categoryId).sort(byNewest);
  const cats = (kind) => fin.categories.filter((c) => c.kind === kind && !c.archived);
  return `<section class="card"><div class="card-head"><h2>Do przypisania (${list.length})</h2><button class="btn small" data-act="inbox-close">Gotowe</button></div>
  ${list.length
    ? list
        .slice(0, 50)
        .map((t) => `<div class="inbox-item"><div class="cat-row"><span><b>${esc(t.merchant || 'Bez opisu')}</b><br><span class="small muted">${esc(dayLabel(t.date))}${t.card ? ` · ${esc(t.card)}` : ''}${t.accountId ? ` · ${esc(accName(t.accountId))}` : ''}</span></span><b class="num ${t.type === 'przychod' ? 'pos' : ''}">${TYPE_SIGN[t.type]}${esc(zl(t.amount))}</b></div>
    <div class="cat-grid">${cats(t.type).map((c) => `<button class="cat-pick" style="--c:${esc(c.color)}" data-assign="${esc(t.id)}" data-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>
    ${t.merchant ? `<label class="check small"><input type="checkbox" data-remember="${esc(t.id)}" checked> Zapamiętaj dla „${esc(rulePatternFor(t.merchant))}”</label>` : ''}</div>`)
        .join('')
    : '<p class="muted">Wszystko przypisane. 🎉</p>'}</section>`;
}

// ---------- Więcej: kategorie, import, dokumenty, Apple Pay, kopia ----------
const SET_TABS = [['kategorie', 'Kategorie'], ['import', 'Import'], ['dokumenty', 'Dokumenty'], ['applepay', 'Apple Pay'], ['kopia', 'Kopia']];

function settingsCategories() {
  const catRow = (c) =>
    `<div class="cat-edit ${c.archived ? 'muted' : ''}" data-cat-row="${esc(c.id)}"><input class="emoji" name="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="Ikona"><input name="name" value="${esc(c.name)}" aria-label="Nazwa"><input type="color" name="color" value="${esc(c.color)}" aria-label="Kolor">${c.kind === 'wydatek' ? `<input name="budget" inputmode="decimal" value="${esc(fmtInput(c.budget ?? 0))}" placeholder="budżet/mies." aria-label="Budżet miesięczny">` : '<span></span>'}<span class="row-inline"><button class="link" data-archive-cat="${esc(c.id)}">${c.archived ? 'Przywróć' : 'Ukryj'}</button><button class="link danger-text" data-del-cat="${esc(c.id)}">Usuń…</button></span></div>`;
  const rows = (kind) => fin.categories.filter((c) => c.kind === kind && !c.archived).map(catRow).join('');
  const hidden = fin.categories.filter((c) => c.archived);
  const catOptions = fin.categories.filter((c) => !c.archived).map((c) => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  return `<section class="card"><h2>Kategorie wydatków</h2><div class="cat-edits">${rows('wydatek')}</div>
    <h2 style="margin-top:18px">Kategorie przychodów</h2><div class="cat-edits">${rows('przychod')}</div>
    <form class="row-btns" id="add-cat"><input name="emoji" class="emoji" value="🏷️" maxlength="4" aria-label="Ikona"><input name="name" placeholder="Nowa kategoria" required><select name="kind"><option value="wydatek">wydatek</option><option value="przychod">przychód</option></select><button class="btn" type="submit">Dodaj</button></form>
    ${hidden.length ? `<details><summary>Ukryte kategorie (${hidden.length})</summary><div class="cat-edits" style="margin-top:8px">${hidden.map(catRow).join('')}</div></details>` : ''}
    <p class="small muted">Budżet to miesięczny limit wydatków w kategorii (pasek w przeglądzie miesiąca). Ukryta kategoria zostaje w historii. Usunięcie przenosi jej operacje do innej kategorii albo do „Do przypisania”.</p></section>
  <section class="card"><h2>Reguły automatyczne</h2><p class="small muted">Gdy opis albo sprzedawca zawiera podany tekst, kategoria przypisze się sama (przy imporcie i z Apple Pay). Wielkość liter i polskie znaki nie mają znaczenia.</p>
    ${fin.rules.length ? `<ul class="cat-list">${fin.rules.map((r) => `<li><div class="cat-row"><span>„${esc(r.pattern)}” → ${cat(r.categoryId) ? `<span class="cat-chip" style="--c:${esc(cat(r.categoryId).color)}">${esc(cat(r.categoryId).emoji)} ${esc(cat(r.categoryId).name)}</span>` : '<span class="cat-chip none">?</span>'}</span><button class="link" data-del-rule="${esc(r.id)}">Usuń</button></div></li>`).join('')}</ul>` : ''}
    <form class="row-btns" id="add-rule"><input name="pattern" placeholder="np. biedronka" required><select name="categoryId">${catOptions}</select><button class="btn" type="submit">Dodaj regułę</button></form></section>`;
}

// Kreator importu z Money Managera: konta, kategorie i stałe płatności do potwierdzenia.
function mmWizard(m) {
  const s = m.snap;
  const p = m.plan;
  const dates = [...s.entries.map((e) => e.day), ...s.transfers.map((t) => t.day)].filter(Boolean).sort();
  const flows = s.entries.filter((e) => !e.correction);
  const exp = flows.filter((e) => !e.income).length;
  const stat = (n, l) => `<div><b>${NF0.format(n)}</b><span>${l}</span></div>`;
  const hasPrevious = fin.txs.some((t) => t.source === 'mm' && !t.deleted);
  const accOptions = (row) => {
    const same = fin.accounts.filter((a) => (!a.archived || a.id === row.choice) && ((a.currency || 'PLN') === (row.currency || 'PLN') || a.id === row.choice));
    return `<option value="new" ${row.choice === 'new' ? 'selected' : ''}>➕ Nowe konto „${esc(row.name)}”</option><option value="skip" ${row.choice === 'skip' ? 'selected' : ''}>⛔ Nie importuj tego konta</option>${same.length ? `<optgroup label="Połącz z kontem z dziennika">${same.map((a) => `<option value="${esc(a.id)}" ${row.choice === a.id ? 'selected' : ''}>${esc(accIcon(a))} ${esc(a.name)}</option>`).join('')}</optgroup>` : ''}`;
  };
  const catOptions = (row) => {
    const pool = fin.categories.filter((c) => c.kind === row.kind && (!c.archived || c.id === row.choice));
    return `<option value="none" ${row.choice === 'none' ? 'selected' : ''}>❓ Do przypisania</option><option value="new" ${row.choice === 'new' ? 'selected' : ''}>➕ Nowa kategoria „${esc(row.name)}”</option><optgroup label="Kategorie dziennika">${pool.map((c) => `<option value="${esc(c.id)}" ${row.choice === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</optgroup>`;
  };
  const linked = p.accounts.some((r) => r.choice !== 'new' && r.choice !== 'skip');
  return `${hasPrevious ? `<div class="banner warn">W dzienniku są już dane z poprzedniego importu Money Managera. Jeśli wtedy powstały duplikaty Twoich kont, najpierw <button class="link" data-act="mm-reset">usuń poprzedni import</button> – plan poniżej pokaże wtedy Twoje konta do połączenia. Ponowny import bez usuwania niczego nie zdubluje.</div>` : ''}
  <p class="small">Plik <b>${esc(m.name)}</b>${dates.length ? `: operacje od ${esc(shortDate(dates[0], true))} do ${esc(shortDate(dates.at(-1), true))}` : ''}</p>
  <div class="mm-stats">${stat(p.accounts.length, 'kont')}${stat(p.categories.length, 'kategorii')}${stat(exp, 'wydatków')}${stat(flows.length - exp, 'przychodów')}${stat(s.transfers.length, 'przelewów')}</div>
  <h3 class="mm-h">1. Konta</h3>
  <p class="small muted">Połącz konta z Money Managera z kontami, które masz już w dzienniku, albo utwórz nowe. Operacje, które już są na połączonym koncie (ta sama kwota, data ± 1 dzień), nie zostaną dodane drugi raz.</p>
  ${p.accounts.map((row) => `<div class="map-row"><div><b>${esc(accIcon({ type: row.type }))} ${esc(row.name)}</b><small>${esc(money(row.balance ?? 0, row.currency))} · ${row.ops} ${plural(row.ops, 'operacja', 'operacje', 'operacji')}${row.hidden ? ' · ukryte' : ''}</small></div><select data-mm-acc="${esc(row.uid)}" aria-label="Konto dla ${esc(row.name)}">${accOptions(row)}</select>${row.reason ? `<small class="map-reason">${esc(row.reason)}</small>` : ''}</div>`).join('')}
  ${linked ? `<label class="check small"><input type="checkbox" id="mm-setbal" ${p.setBalances ? 'checked' : ''}> Ustaw salda połączonych kont tak jak w Money Managerze</label>` : ''}
  <h3 class="mm-h">2. Kategorie</h3>
  <p class="small muted">Wydatki z kategorii bez odpowiednika trafią do „Do przypisania”. Gdy w kategorii jest dużo operacji, proponuję utworzenie nowej – możesz każdą propozycję zmienić.</p>
  ${p.categories.map((row) => `<div class="map-row"><div><b>${esc(row.name)}</b><small>${row.kind === 'przychod' ? 'przychody' : 'wydatki'} · ${row.ops} ${plural(row.ops, 'operacja', 'operacje', 'operacji')}</small></div><select data-mm-cat="${esc(row.uid)}" aria-label="Kategoria dla ${esc(row.name)}">${catOptions(row)}</select><small class="map-reason">${esc(row.reason)}</small></div>`).join('')}
  ${p.recurring.length ? `<h3 class="mm-h">3. Stałe płatności</h3>${p.recurring.map((r, i) => `<label class="check map-rec"><input type="checkbox" data-mm-rec="${i}" ${r.include ? 'checked' : ''}> <span><b>${esc(r.title)}</b> ${TYPE_SIGN[r.type]}${esc(zl(r.amount))} · ${esc((FREQS[r.freq] ?? '').toLowerCase())}${r.auto ? '' : ' · z potwierdzeniem'} · następny termin ${esc(shortDate(r.nextDate))}</span></label>`).join('')}` : ''}
  ${p.corrections ? `<div class="banner info">⚖️ Korekty salda (${p.corrections}): saldo początkowe przy zakładaniu konta i późniejsze zmiany salda. Zmieniają salda kont, ale nie są liczone jako wydatki ani przychody.</div>` : ''}
  ${s.warnings.map((w) => `<div class="banner warn">${esc(w)}</div>`).join('')}
  ${s.reminders ? `<p class="small muted">Zwykłe przypomnienia z Money Managera (${s.reminders}) nie są przenoszone.</p>` : ''}
  <div class="row-btns"><button class="btn primary" data-act="import-mm">Importuj</button><button class="btn ghost" data-act="cancel-mm">Anuluj</button></div>`;
}

function settingsImport() {
  const m = ui.mm;
  const mmCount = fin.txs.filter((t) => t.source === 'mm' && !t.deleted).length;
  const mmBody = !m
    ? `<ol class="steps-mini"><li>W aplikacji Money Manager utwórz kopię zapasową i zapisz plik <b>.mmbackup</b> w Plikach na iPhonie.</li><li>Wybierz ten plik poniżej. Odczytam go na tym urządzeniu.</li><li>Sprawdź, z którymi kontami i kategoriami połączyć dane, i kliknij <b>Importuj</b>.</li></ol><div class="row-btns"><button class="btn primary" data-act="pick-mm">Wybierz plik .mmbackup</button></div>`
    : m.error
      ? `<div class="banner err">Nie udało się odczytać pliku „${esc(m.name)}”: ${esc(m.error)}.</div><div class="row-btns"><button class="btn" data-act="pick-mm">Wybierz inny plik</button></div>`
      : mmWizard(m);
  const undoBox = mmCount && !m ? `<div class="banner info">W dzienniku jest ${mmCount} ${plural(mmCount, 'operacja', 'operacje', 'operacji')} z Money Managera. <button class="link danger-text" data-act="mm-undo">Usuń dane z importu…</button></div>` : '';
  return `<section class="card" id="mm"><h2>Import z Money Managera (Orange Dog)</h2><p class="small muted">Przeniesiesz konta z saldami, kategorie, wydatki, przychody, przelewy i stałe płatności z aplikacji „Money Manager: finanse, przychody i wydatki”. Plik nie opuszcza urządzenia.</p>${undoBox}${mmBody}<input type="file" id="mm-file" hidden></section>
  <section class="card" id="csv"><h2>Wyciąg z banku (CSV)</h2><p class="small muted">Pobierz historię w formacie CSV z bankowości internetowej (mBank, PKO, ING, Santander, Pekao i inne), a potem wybierz plik. Kolumny rozpoznam sam, a Ty możesz je poprawić. Plik nie opuszcza urządzenia.</p>
    <div class="row-btns"><button class="btn" data-act="pick-csv">Wybierz plik CSV</button></div><input type="file" id="csv-file" accept=".csv,text/csv,text/plain" hidden><div id="csv-map">${csvMapping()}</div></section>`;
}

function settingsDocs() {
  const docs = [...(fin.docs ?? [])].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.addedAt ?? 0) - (a.addedAt ?? 0));
  const years = new Map();
  for (const d of docs) {
    const y = (d.date ?? '').slice(0, 4) || '—';
    if (!years.has(y)) years.set(y, []);
    years.get(y).push(d);
  }
  const row = (d) => {
    const t = d.txId ? fin.txs.find((x) => x.id === d.txId && !x.deleted) : null;
    const link = t ? ` · ${esc(t.merchant || cat(t.categoryId)?.name || FIN_TYPES[t.type])} ${TYPE_SIGN[t.type]}${esc(zl(t.amount))}` : '';
    return `<div class="doc-row"><span class="doc-ico">${docIcon(d.type)}</span><span class="doc-main"><b>${esc(d.name)}</b><small>${esc(DOC_KINDS[d.kind] ?? 'Dokument')} · ${esc(shortDate(d.date ?? today(), true))} · ${esc(fmtSize(d.size ?? 0))}${link}</small></span><span class="doc-btns"><button class="btn small" data-doc-open="${esc(d.id)}">Otwórz</button><button class="btn small ghost" data-doc-share="${esc(d.id)}">Udostępnij / zapisz</button><button class="btn small ghost danger-text" data-doc-del="${esc(d.id)}">Usuń…</button></span></div>`;
  };
  return `<section class="card"><h2>Dodaj dokument</h2><p class="small muted">Pasek płacowy, paragon, faktura, umowa, PIT – wszystko w jednym miejscu. Pliki są zapisywane tylko w pamięci tego urządzenia, bez internetu. Pasek płacowy możesz też dołączyć od razu przy wpisywaniu wypłaty (📎 w oknie operacji).</p>
    <form id="doc-form"><div class="two"><label class="field">Rodzaj<select name="kind">${Object.entries(DOC_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label class="field">Data<input type="date" name="date" value="${today()}"></label></div>
    <label class="field">Plik (PDF albo zdjęcie)<input type="file" name="file" accept="application/pdf,image/*"></label><div class="row-btns"><button class="btn primary" type="submit">Zapisz dokument</button></div></form></section>
  <section class="card"><h2>Dokumenty (${docs.length})</h2>${docs.length ? [...years].map(([y, list]) => `<div class="day-sep"><span>${esc(y)}</span><span>${list.length}</span></div>${list.map(row).join('')}`).join('') : '<p class="muted">Nie ma jeszcze dokumentów.</p>'}
  <p class="small muted">Kopia zapasowa z dokumentami: Więcej → Kopia. Usunięcie danych witryny w ustawieniach Safari usuwa też dokumenty.</p></section>`;
}

function settingsApplePay() {
  const ap = fin.applePay;
  const mapped = fin.accounts.filter((a) => a.cards?.length);
  const fromAp = liveTx(fin).filter((t) => t.source === 'applepay');
  const noCat = fromAp.filter((t) => !t.categoryId).length;
  const diag = ap?.lastImport
    ? `<p>Ostatni import: <b>${esc(shortDate(new Date(ap.lastImport).toISOString().slice(0, 10), true))}</b>${ap.lastLines !== undefined ? ` · wierszy w pliku: ${ap.lastLines}` : ''} · nowe płatności: ${ap.lastAdded}${ap.lastUpdated ? ` · uzupełnione kategorie: ${ap.lastUpdated}` : ''}${ap.lastRemoved ? ` · usunięte („Pomiń”): ${ap.lastRemoved}` : ''}. Razem z Apple Pay: ${fromAp.length}.</p>
       ${noCat ? `<p class="small">Płatności bez kategorii: <b>${noCat}</b> – <button class="link" data-act="inbox">przypisz teraz</button>. To normalne, gdy okno z listą się nie pokazało: płatność i tak jest zapisana.</p>` : ''}
       ${ap.errorCount ? `<div class="banner warn small"><b>Wiersze z błędem: ${ap.errorCount}.</b><ul class="plain">${(ap.lastErrors ?? []).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}`
    : '<p class="warn"><b>Nie było jeszcze żadnego importu z Apple Pay.</b> Strona nie może sama czytać Portfela – płatności trafiają tu przez automatyzację w aplikacji Skróty (instrukcja poniżej).</p>';
  return `<section class="card"><h2>Stan połączenia z Apple Pay</h2>
    ${diag}
    ${mapped.length ? `<ul class="cat-list">${mapped.map((a) => `<li><div class="cat-row"><span>💳 ${esc(a.cards.join(', '))}</span><span class="small">→ ${esc(a.name)}</span></div></li>`).join('')}</ul>` : '<p class="small muted">Żadna karta nie jest jeszcze przypisana do konta. Przypiszesz ją w Konta → Edytuj (pole „Karty w Apple Pay”) albo przy pierwszym imporcie.</p>'}</section>
  ${cardPrompt()}
  <section class="card" id="applepay"><h2>Apple Pay na iPhonie (Skróty)</h2>
    <p>Po każdej płatności Apple Pay automatyzacja w aplikacji <b>Skróty</b> <b>najpierw od razu zapisuje płatność</b> w pliku na iPhonie (bez internetu), a dopiero potem pokazuje listę kategorii i dopisuje wybór. Jeśli okno z listą się nie pokaże albo iOS przerwie skrót („skrót nie zadziałał poprawnie”), płatność i tak jest w pliku – kategorię wybierzesz po imporcie w oknie „Do przypisania”.</p>
    <ol class="steps-mini"><li>Skróty → Automatyzacja → <b>+</b> → <b>Portfel</b> (albo „Transakcja”) → wybierz karty → <i>Uruchom natychmiast</i> → Nowy pusty skrót.</li><li><b>Tekst</b>: Bieżąca data (ISO 8601);Kwota;Sprzedawca;<b>;</b>Karta – czwarte pole puste (dwa średniki obok siebie).</li><li><b>Dołącz do pliku tekstowego</b>: wydatki.txt, „Utwórz nowy wiersz” włączone. Na tym etapie płatność jest już zapisana.</li><li><b>Lista</b>: nazwy kategorii dokładnie jak w aplikacji, na końcu „Później” i „Pomiń”.</li><li><b>Wybierz z listy</b> (komunikat: Kategoria: Kwota Sprzedawca).</li><li><b>Tekst</b>: Bieżąca data (ISO 8601);Kwota;Sprzedawca;Wybrany element;Karta.</li><li><b>Dołącz do pliku tekstowego</b>: ten sam plik wydatki.txt, nowy wiersz.</li><li>Raz na jakiś czas: <b>Importuj wydatki.txt</b>. Oba wiersze tej samej płatności łączą się w jedną operację, duplikaty są pomijane.</li></ol>
    <p class="small muted"><b>Tryb cichy</b> (bez okienek i bez komunikatów o błędach): zostaw tylko kroki 1–3. Kategorie przypiszesz po imporcie, a „Zapamiętaj dla tego sprzedawcy” sprawi, że kolejne płatności w tym samym sklepie dostaną kategorię same. Pełna instrukcja: plik FINANSE.md. „Pobierz kategorie.txt” zapisuje aktualne nazwy kategorii do skopiowania.</p>
    <div class="row-btns"><button class="btn" data-act="dl-cats">Pobierz kategorie.txt</button><button class="btn primary" data-act="import-ap">Importuj wydatki.txt</button></div>
    <input type="file" id="ap-file" accept=".txt,text/plain,.csv" hidden>
    <details><summary>Wklej wpisy ręcznie</summary><textarea id="ap-paste" rows="4" placeholder="2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa"></textarea><button class="btn" data-act="paste-ap">Dodaj wklejone</button></details></section>`;
}

function settingsBackup() {
  const size = Math.round(JSON.stringify(fin).length / 1024);
  const docs = fin.docs?.length ?? 0;
  return `<section class="card"><h2>Kopia zapasowa</h2><p class="small muted">Dane są tylko w tej przeglądarce (${liveTx(fin).length} operacji, ${fin.accounts.length} kont, ${docs} dokumentów, ok. ${size} KB bez dokumentów). Rób kopię co jakiś czas i zapisuj ją w Plikach. Usunięcie danych witryny w ustawieniach Safari usunie też dziennik.</p>
    ${docs ? '<label class="check small"><input type="checkbox" id="bk-docs" checked> Dołącz dokumenty (plik będzie większy)</label>' : ''}
    <div class="row-btns"><button class="btn primary" data-act="backup">Eksportuj kopię (JSON)</button><button class="btn" data-act="restore">Wczytaj kopię…</button></div><input type="file" id="restore-file" accept="application/json,.json" hidden>
    <details class="danger"><summary>Usuń wszystkie dane dziennika</summary><p class="small">Tej operacji nie można cofnąć po zamknięciu powiadomienia. Najpierw wyeksportuj kopię.</p><button class="btn danger" data-act="wipe">Usuń dziennik…</button></details></section>
    <section class="card"><h2>Aplikacja</h2><label class="field">Strona startowa (po otwarciu aplikacji z ekranu początkowego)<select id="start-page">${[['gem', 'GEM – sygnał'], ['finanse', 'Finanse – ten dziennik'], ['rynki', 'Rynki – przegląd']].map(([v, l]) => `<option value="${v}" ${startPageSetting() === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>`;
}

// Strona startowa aplikacji – wspólne ustawienie z panelem GEM (index.html przekierowuje do dziennika).
function startPageSetting() {
  try {
    return localStorage.getItem('gem.start') || 'gem';
  } catch {
    return 'gem';
  }
}
document.addEventListener('change', (ev) => {
  if (ev.target?.id !== 'start-page') return;
  try {
    localStorage.setItem('gem.start', ev.target.value);
    toast('Zapisano stronę startową.');
  } catch {
    toast('Nie udało się zapisać ustawienia w tej przeglądarce.');
  }
});

function viewSettings() {
  const seg = `<div class="seg small set-seg" style="margin-top:12px">${SET_TABS.map(([k, l]) => `<button data-set-tab="${k}" class="${ui.setTab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `${seg}${{ kategorie: settingsCategories, import: settingsImport, dokumenty: settingsDocs, applepay: settingsApplePay, kopia: settingsBackup }[ui.setTab]()}`;
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

// ---------- Dymek z wydatkami (tabela porównania kategorii) ----------
const cmpPop = document.createElement('div');
cmpPop.id = 'cmp-pop';
cmpPop.className = 'pop';
cmpPop.setAttribute('role', 'dialog');
cmpPop.hidden = true;
document.body.append(cmpPop);
let cmpAnchor = null;

function hideCmpPop() {
  cmpPop.hidden = true;
  cmpAnchor?.setAttribute('aria-expanded', 'false');
  cmpAnchor = null;
}

// Wydatki kategorii (albo wszystkie) w miesiącu z tabeli, w poprzednim albo w 3 poprzednich miesiącach.
function cmpExpenses(key, month) {
  const [catKey, col] = key.split('|');
  const range = col === 'cur' ? monthBounds(month) : col === 'prev' ? monthBounds(shiftMonth(month, -1)) : { from: monthBounds(shiftMonth(month, -3)).from, to: monthBounds(shiftMonth(month, -1)).to };
  const label = col === 'cur' ? monthLabel(month) : col === 'prev' ? monthLabel(shiftMonth(month, -1)) : `${MONTHS[Number(shiftMonth(month, -3).slice(5, 7)) - 1]} – ${monthLabel(shiftMonth(month, -1))}`;
  const list = liveTx(fin)
    .filter((t) => t.type === 'wydatek' && t.date >= range.from && t.date <= range.to && (catKey === '_all' || (catKey === '_none' ? !t.categoryId : t.categoryId === catKey)))
    .sort(byNewest);
  const c = catKey === '_all' ? { emoji: '🧾', name: 'Wszystkie wydatki' } : catKey === '_none' ? NONE_CAT : cat(catKey) ?? NONE_CAT;
  return { list, label, col, c, total: list.reduce((s, t) => s + t.amount, 0) };
}

function toggleCmpPop(btn, key) {
  if (cmpAnchor === btn && !cmpPop.hidden) return hideCmpPop();
  hideCmpPop();
  const { list, label, col, c, total } = cmpExpenses(key, ui.anchor.slice(0, 7));
  const avg = col === 'avg' ? ` · średnio ${zl(total / 3)} / mies.` : '';
  const shown = list.slice(0, 40);
  cmpPop.innerHTML = `<div class="pop-head"><div><b>${esc(c.emoji)} ${esc(c.name)}</b><small>${esc(label)} · ${list.length} ${plural(list.length, 'wydatek', 'wydatki', 'wydatków')} · ${esc(zl(total))}${esc(avg)}</small></div><button type="button" class="pop-x" aria-label="Zamknij">×</button></div>
  <div class="pop-list">${shown.length ? shown.map(txRow).join('') : '<p class="muted small">Brak wydatków w tym okresie.</p>'}${list.length > shown.length ? `<p class="muted small">…i ${list.length - shown.length} więcej. Pełną listę zobaczysz w Operacjach.</p>` : ''}</div>`;
  cmpPop.hidden = false;
  cmpAnchor = btn;
  btn.setAttribute('aria-expanded', 'true');
  // Pozycja: pod kwotą, w granicach ekranu; strzałka wskazuje kliknięte pole.
  const r = btn.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.left + r.width / 2 - width / 2));
  cmpPop.style.width = `${width}px`;
  cmpPop.style.left = `${left + window.scrollX}px`;
  cmpPop.style.top = `${r.bottom + window.scrollY + 8}px`;
  cmpPop.style.setProperty('--arrow-x', `${Math.max(14, Math.min(width - 14, r.left + r.width / 2 - left))}px`);
  const bottom = r.bottom + 8 + cmpPop.offsetHeight;
  if (bottom > window.innerHeight - 70) window.scrollBy({ top: Math.min(bottom - window.innerHeight + 80, r.top - 80), behavior: 'smooth' });
}

cmpPop.addEventListener('click', (ev) => {
  if (ev.target.closest('.pop-x')) return hideCmpPop();
  const e = ev.target.closest('[data-edit]');
  if (!e) return;
  const t = fin.txs.find((x) => x.id === e.dataset.edit);
  hideCmpPop();
  if (t) openTx(t);
});
document.addEventListener('click', (ev) => {
  if (!cmpPop.hidden && !cmpPop.contains(ev.target) && !ev.target.closest('[data-cmp]')) hideCmpPop();
});
document.addEventListener('keydown', (ev) => ev.key === 'Escape' && !cmpPop.hidden && hideCmpPop());
window.addEventListener('resize', () => !cmpPop.hidden && hideCmpPop());

function render() {
  hideCmpPop();
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
  const r = processRecurring(fin, today(), { newId, market: MARKET });
  fin = r.fin;
  // Raty kredytów z automatycznym zapisem: kapitał jako przelew na kredyt, odsetki i opłaty jako wydatek.
  const l = processLoans(fin, today(), { newId, market: MARKET });
  fin = l.fin;
  if (r.posted || l.posted || fin.recurring.map((x) => x.nextDate).join() !== before) save();
  const parts = [];
  if (r.posted) parts.push(`${r.posted} ${plural(r.posted, 'stałą pozycję', 'stałe pozycje', 'stałych pozycji')}`);
  if (l.posted) parts.push(`${l.posted} ${plural(l.posted, 'ratę kredytu', 'raty kredytów', 'rat kredytów')}`);
  if (parts.length) toast(`Zapisano ${parts.join(' i ')} z terminem do dziś.`);
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
  undoable(`Pominięto termin ${shortDate(r.nextDate)}: ${r.title}.`, () => {
    fin = settleRecurring(fin, recId, { post: false, newId });
  });
}

// ---------- Usuwanie (zawsze z potwierdzeniem i możliwością cofnięcia) ----------
function txSummary(t) {
  const cur = accountCurrency(fin, t.accountId);
  const amount = t.type === 'korekta' ? `${(t.accountAmount ?? t.amount) < 0 ? '−' : '+'}${money(Math.abs(t.accountAmount ?? t.amount), cur)}` : `${TYPE_SIGN[t.type]}${zl(t.amount)}`;
  const parts = [FIN_TYPES[t.type], amount, dayLabel(t.date), cat(t.categoryId)?.name, t.accountId ? accName(t.accountId) : ''].filter(Boolean);
  return `<p><b>${esc(t.merchant || cat(t.categoryId)?.name || FIN_TYPES[t.type])}</b><br>${esc(parts.join(' · '))}</p>`;
}

async function deleteTxFlow(id) {
  const t = fin.txs.find((x) => x.id === id);
  if (!t) return;
  closeDialog(TX);
  const docs = (fin.docs ?? []).filter((d) => d.txId === id).length;
  const res = await confirmAction({ title: 'Usunąć operację?', body: `${txSummary(t)}${docs ? `<p class="small muted">Dołączone dokumenty (${docs}) zostaną w zakładce Dokumenty.</p>` : ''}${t.gemTxId ? '<p class="small muted">Powiązana wpłata w portfelu GEM też zostanie usunięta.</p>' : ''}${t.loanId && !t.overpay ? '<p class="small muted">To rata kredytu zapisana automatycznie – nie zapisze się ponownie.</p>' : ''}`, ok: 'Usuń operację' });
  if (!res) return;
  undoable(
    'Usunięto operację.',
    () => {
      const x = fin.txs.find((y) => y.id === id);
      x.deleted = true;
      x.updatedAt = Date.now();
      fin.docs = (fin.docs ?? []).map((d) => (d.txId === id ? { ...d, txId: null } : d));
      if (x.gemTxId) {
        const list = gemTxsLoad();
        const g = list.find((y) => y.id === x.gemTxId);
        if (g) {
          Object.assign(g, { deleted: true, updatedAt: Date.now() });
          gemTxsSave(list);
        }
      }
      // Nadpłata usunięta z dziennika znika też z harmonogramu kredytu.
      if (x.overpay && x.loanId) {
        const loanAcc = acc(x.loanId);
        if (isLoan(loanAcc)) loanAcc.loan.overpayments = (loanAcc.loan.overpayments ?? []).filter((o) => o.txId !== x.id);
      }
    },
    { gem: Boolean(t.gemTxId) },
  );
}

async function deleteAccountFlow(id) {
  const a = acc(id);
  if (!a) return;
  const txCount = fin.txs.filter((t) => !t.deleted && (t.accountId === id || t.toAccountId === id)).length;
  const recCount = fin.recurring.filter((r) => r.accountId === id || r.toAccountId === id).length;
  const targets = fin.accounts.filter((x) => x.id !== id && !x.archived && (x.currency || 'PLN') === (a.currency || 'PLN'));
  const extra =
    txCount || recCount
      ? `<p class="small">Konto ma ${txCount} ${plural(txCount, 'operację', 'operacje', 'operacji')}${recCount ? ` i ${recCount} ${plural(recCount, 'stałą pozycję', 'stałe pozycje', 'stałych pozycji')}` : ''}. Co z nimi zrobić?</p>
        ${targets.length ? `<label class="check opt"><input type="radio" name="mode" value="move" checked> <span>Przenieś na konto:<select name="moveTo">${targets.map((x) => `<option value="${esc(x.id)}">${esc(accIcon(x))} ${esc(x.name)}</option>`).join('')}</select></span></label><label class="check small sub"><input type="checkbox" name="keep" checked> <span>Zachowaj obecne saldo konta docelowego (gdy to ten sam rachunek wpisany dwa razy)</span></label>` : ''}
        <label class="check opt"><input type="radio" name="mode" value="delete" ${targets.length ? '' : 'checked'}> <span>Usuń je razem z kontem. Przelewy z innymi kontami zostaną (bez tego konta), więc salda pozostałych kont się nie zmienią.</span></label>`
      : '<p class="small">Konto nie ma operacji.</p>';
  closeDialog(ACC);
  const res = await confirmAction({ title: `Usunąć konto „${a.name}”?`, extra, ack: 'Tak, chcę usunąć to konto', ok: 'Usuń konto' });
  if (!res) return;
  const moveTo = res.mode === 'move' ? res.moveTo : null;
  undoable(`Usunięto konto ${a.name}.`, () => {
    fin = deleteAccount(fin, id, { moveTo, keepTargetBalance: res.keep === 'on' });
  });
}

async function deleteCategoryFlow(id) {
  const c = cat(id);
  if (!c) return;
  const n = liveTx(fin).filter((t) => t.categoryId === id).length;
  const others = fin.categories.filter((x) => x.id !== id && x.kind === c.kind && !x.archived);
  const extra = n
    ? `<p class="small">Kategoria ma ${n} ${plural(n, 'operację', 'operacje', 'operacji')}.</p><label class="field">Przenieś je do<select name="moveTo"><option value="">❓ Do przypisania</option>${others.map((x) => `<option value="${esc(x.id)}">${esc(x.emoji)} ${esc(x.name)}</option>`).join('')}</select></label>`
    : '<p class="small">Kategoria nie ma operacji.</p>';
  const res = await confirmAction({ title: `Usunąć kategorię „${c.name}”?`, extra, ok: 'Usuń kategorię' });
  if (!res) return;
  undoable(`Usunięto kategorię ${c.name}.`, () => {
    fin = deleteCategory(fin, id, { moveTo: res.moveTo || null });
  });
}

async function deleteDocFlow(id) {
  const d = (fin.docs ?? []).find((x) => x.id === id);
  if (!d) return;
  const res = await confirmAction({ title: 'Usunąć dokument?', body: `<p><b>${esc(d.name)}</b><br>${esc(DOC_KINDS[d.kind] ?? 'Dokument')} · ${esc(shortDate(d.date ?? today(), true))}</p>`, ok: 'Usuń dokument' });
  if (!res) return;
  undoable('Usunięto dokument.', () => {
    fin.docs = fin.docs.filter((x) => x.id !== id);
  });
}

// ---------- Zdarzenia w głównym widoku ----------
$('#fin-root').addEventListener('click', async (ev) => {
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
  if (d.worthRange !== undefined) {
    ui.worthRange = Number(d.worthRange);
    return render();
  }
  if (d.openCat) {
    ui.openCat = ui.openCat === d.openCat ? null : d.openCat;
    return render();
  }
  if (d.catAll) {
    Object.assign(ui, { category: d.catAll, account: '', type: '', q: '' });
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
  if (d.cmp) return toggleCmpPop(b, d.cmp);
  if (d.assign) {
    const t = fin.txs.find((x) => x.id === d.assign);
    const remember = $(`[data-remember="${CSS.escape(d.assign)}"]`)?.checked;
    t.categoryId = d.cat;
    delete t.catAuto;
    t.updatedAt = Date.now();
    if (remember && t.merchant) {
      const pattern = rulePatternFor(t.merchant);
      if (!fin.rules.some((r) => r.pattern.toLowerCase() === pattern.toLowerCase())) fin.rules.push({ id: newId(), pattern, categoryId: d.cat });
      for (const o of liveTx(fin)) if (!o.categoryId && o.type === t.type && o.merchant && applyRules(o.merchant, [{ pattern, categoryId: d.cat }])) o.categoryId = d.cat;
    }
    save();
    return render();
  }
  if (d.assignCard) {
    const select = $$('[data-card-select]').find((s) => s.dataset.cardSelect === d.assignCard);
    const a = acc(select?.value);
    if (!a) return;
    a.cards = [...new Set([...(a.cards ?? []), d.assignCard])];
    let n = 0;
    for (const t of fin.txs) {
      if (t.deleted || !t.card || t.accountId || !accountForCard([a], t.card)) continue;
      t.accountId = a.id;
      localizeTx(t);
      n++;
    }
    save();
    toast(`Karta „${d.assignCard}” przypisana do konta ${a.name} (${n} ${plural(n, 'płatność', 'płatności', 'płatności')}).`);
    return render();
  }
  if (d.repay) return openRepay(d.repay);
  if (d.lots) return openLots(d.lots);
  if (d.loan) return openLoan(d.loan);
  if (d.planNew) return openPlan(d.planNew, null);
  if (d.planEdit) return openPlan(...d.planEdit.split('|'));
  if (d.planPay) {
    const [accId, planId, due] = d.planPay.split('|');
    return openPlanPay(accId, planId, due || null);
  }
  if (d.planSkip) {
    const [accId, planId] = d.planSkip.split('|');
    return undoable('Pominięto wpłatę do planu (termin przesunięty na kolejny miesiąc).', () => {
      fin = advancePlan(fin, accId, planId);
    });
  }
  if (d.loanSync) return syncLoanBalance(d.loanSync);
  if (d.gemPay) {
    const a = acc(d.gemPay);
    return openTx(null, { type: 'przelew', toAccountId: a.id, accountId: defaultAccount('przelew'), merchant: `Wpłata na ${a.gemAccount === 'ZWYKLE' ? 'konto inwestycyjne' : a.gemAccount}` });
  }
  if (d.gemLink) return linkGemTxs(d.gemLink);
  if (d.editRec?.startsWith('loan:')) return openLoan(d.editRec.slice(5));
  if (d.history) {
    Object.assign(ui, { account: d.history, category: '', type: '', q: '' });
    return setView('operacje');
  }
  if (d.editAcc) return openAccount(d.editAcc);
  if (d.editRec) return openRecurring(d.editRec);
  if (d.settle) return settle(d.settle, d.post === '1');
  if (d.docOpen) return openDoc(d.docOpen);
  if (d.docShare) return shareDoc(d.docShare);
  if (d.docDel) return deleteDocFlow(d.docDel);
  if (d.archiveCat) {
    const c = cat(d.archiveCat);
    c.archived = !c.archived || undefined;
    save();
    return render();
  }
  if (d.delCat) return deleteCategoryFlow(d.delCat);
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
      const rows = filteredTxs().map((t) => [t.date, t.time ?? '', FIN_TYPES[t.type], t.type === 'wydatek' ? -t.amount : t.amount, cat(t.categoryId)?.name ?? '', t.accountId ? accName(t.accountId) : '', t.type === 'przelew' ? accName(t.toAccountId) : '', t.merchant ?? '', t.note ?? '']);
      const csv = [['data', 'godzina', 'typ', 'kwota (zł)', 'kategoria', 'konto', 'na konto', 'opis', 'notatka'], ...rows].map((r) => r.map((c) => (typeof c === 'number' ? String(c).replace('.', ',') : /[;"\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\n');
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
      const r = mergeImported(fin, txs.map(localizeTx), { newId });
      const keep = ui.csv.keepBalance;
      ui.csv = null;
      return undoable(`Dodano ${r.added} operacji${r.skipped ? `, pominięto ${r.skipped} duplikatów${r.crossSource ? ` (w tym ${r.crossSource} zapisanych już z Apple Pay)` : ''}` : ''}.`, () => {
        fin = r.fin;
        if (id && keep) setBalance(fin, id, before);
      });
    }
    case 'pick-mm':
      return $('#mm-file').click();
    case 'cancel-mm':
      ui.mm = null;
      return render();
    case 'mm-reset': {
      const res = await confirmAction({ title: 'Usunąć poprzedni import?', body: '<p>Z dziennika znikną operacje, konta i kategorie z poprzedniego importu Money Managera. Twoje konta i operacje wpisane ręcznie zostaną. Potem dokończysz nowy import z połączeniem kont.</p>', ack: 'Rozumiem', ok: 'Usuń poprzedni import' });
      if (!res) return;
      return undoable('Usunięto poprzedni import.', () => {
        fin = removeMmImport(fin).fin;
        if (ui.mm?.snap) ui.mm.plan = suggestMmMapping(ui.mm.snap, fin, { today: today() });
      });
    }
    case 'mm-undo': {
      const n = fin.txs.filter((t) => t.source === 'mm' && !t.deleted).length;
      const res = await confirmAction({ title: 'Usunąć dane z importu Money Managera?', body: `<p>Znikną ${n} ${plural(n, 'operacja', 'operacje', 'operacji')} z importu, stałe pozycje z Money Managera oraz konta i kategorie, które powstały przy imporcie (o ile nie mają Twoich operacji). Konta połączone z Twoimi wrócą do sald sprzed importu. Operacje wpisane ręcznie zostaną.</p>`, ack: 'Tak, usuń dane z importu', ok: 'Usuń import' });
      if (!res) return;
      return undoable('Usunięto dane z importu Money Managera.', () => {
        fin = removeMmImport(fin).fin;
      });
    }
    case 'import-mm': {
      const { fin: next, report } = mmToFinance(ui.mm.snap, fin, { newId, plan: ui.mm.plan, market: MARKET, today: today() });
      const snapshot = JSON.stringify(fin);
      fin = next;
      save();
      ui.mm = null;
      const parts = [`dodano ${report.added} ${plural(report.added, 'operację', 'operacje', 'operacji')}`];
      if (report.corrections) parts.push(`w tym ${report.corrections} ${plural(report.corrections, 'korekta', 'korekty', 'korekt')} salda (poza wydatkami i przychodami)`);
      if (report.duplicates) parts.push(`pominięto ${report.duplicates} już zapisanych`);
      if (report.updated) parts.push(`zaktualizowano ${report.updated}`);
      if (report.removed) parts.push(`usunięto ${report.removed}`);
      if (report.accounts) parts.push(`nowe konta: ${report.accounts}`);
      if (report.categories) parts.push(`nowe kategorie: ${report.categories}`);
      if (report.recurring) parts.push(`stałe płatności: ${report.recurring}`);
      let notice = `Import z Money Managera: ${parts.join(', ')}.`;
      if (report.uncategorized) notice += ` ${report.uncategorized} ${plural(report.uncategorized, 'operacja czeka', 'operacje czekają', 'operacji czeka')} na kategorię.`;
      setView('przeglad');
      ui.notice = notice;
      render();
      return showUndo('Zaimportowano dane z Money Managera.', snapshot);
    }
    case 'backup': {
      const data = JSON.parse(JSON.stringify(fin));
      if ($('#bk-docs')?.checked && fin.docs?.length) {
        data.docsData = {};
        for (const doc of fin.docs) {
          const rec = await getDoc(doc.id).catch(() => null);
          if (!rec) continue;
          const bytes = new Uint8Array(rec.data);
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          data.docsData[doc.id] = { name: rec.name, type: rec.type, data: btoa(bin) };
        }
      }
      return download(`dziennik-finansowy-${today()}.json`, JSON.stringify(data), 'application/json');
    }
    case 'restore':
      return $('#restore-file').click();
    case 'wipe': {
      const res = await confirmAction({ title: 'Usunąć cały dziennik?', body: '<p>Znikną wszystkie konta, operacje, kategorie, stałe pozycje i dokumenty z tego urządzenia.</p>', ack: 'Rozumiem, że usuwam wszystkie dane dziennika', ok: 'Usuń wszystko' });
      if (!res) return;
      undoable('Dziennik wyczyszczony.', () => {
        fin = emptyFinance();
      });
      return setView('przeglad');
    }
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
  } else if (el.dataset.mmAcc) {
    ui.mm.plan.accounts.find((r) => r.uid === el.dataset.mmAcc).choice = el.value;
  } else if (el.dataset.mmCat) {
    ui.mm.plan.categories.find((r) => r.uid === el.dataset.mmCat).choice = el.value;
    return;
  } else if (el.dataset.mmRec !== undefined) {
    ui.mm.plan.recurring[Number(el.dataset.mmRec)].include = el.checked;
    return;
  } else if (el.id === 'mm-setbal') {
    ui.mm.plan.setBalances = el.checked;
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
      const snap = await readMmBackup(await f.arrayBuffer());
      ui.mm = { name: f.name, snap, plan: suggestMmMapping(snap, fin, { today: today() }) };
    } catch (err) {
      ui.mm = { name: f.name, error: err.message };
    }
  } else if (el.id === 'restore-file' && el.files[0]) {
    const file = el.files[0];
    el.value = '';
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data?.version !== 1 || !Array.isArray(data.txs)) throw new Error('to nie jest kopia dziennika');
    } catch (err) {
      return toast(`Nie udało się wczytać kopii: ${err.message}`, 6000);
    }
    const res = await confirmAction({ title: 'Wczytać kopię zapasową?', body: `<p>Kopia z pliku <b>${esc(file.name)}</b> (${data.txs.filter((t) => !t.deleted).length} operacji) zastąpi wszystkie obecne dane dziennika na tym urządzeniu.</p>`, ack: 'Rozumiem, że obecne dane zostaną zastąpione', ok: 'Wczytaj kopię', danger: false });
    if (!res) return;
    const { docsData, ...rest } = data;
    for (const [id, f] of Object.entries(docsData ?? {})) {
      try {
        const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
        await docStore('readwrite', (s) => s.put({ name: f.name, type: f.type, data: bytes.buffer }, id));
      } catch {
        // pojedynczy dokument nie do odtworzenia – reszta kopii i tak się wczyta
      }
    }
    undoable(`Wczytano kopię: ${rest.txs.filter((t) => !t.deleted).length} operacji.`, () => {
      fin = { ...emptyFinance(), ...rest };
    });
    return setView('przeglad');
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

$('#fin-root').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'doc-form') {
    const file = f.elements.file.files[0];
    if (!file) return toast('Wybierz plik.');
    const doc = await saveDocFile(file, { kind: f.elements.kind.value, date: f.elements.date.value || today(), buffer: await file.arrayBuffer() });
    if (!doc) return;
    save();
    toast(`Zapisano dokument: ${doc.name}.`);
    return render();
  }
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
  const { txs, errors, lines } = parseShortcutLog(text, fin);
  const r = mergeImported(fin, txs.map(localizeTx), { newId });
  fin = r.fin;
  // Diagnostyka ostatniego importu (Więcej → Apple Pay): ile wierszy, co dodano, co uzupełniono, jakie błędy.
  fin.applePay = { lastImport: Date.now(), lastAdded: r.added, lastUpdated: r.updated, lastRemoved: r.removed, lastLines: lines, errorCount: errors.length, lastErrors: errors.slice(0, 5) };
  save();
  const unmapped = unmappedCards();
  const parts = [`dodano ${r.added}`];
  if (r.updated) parts.push(`uzupełniono kategorię w ${r.updated}`);
  if (r.removed) parts.push(`usunięto ${r.removed} oznaczonych „Pomiń”`);
  if (r.skipped) parts.push(`pominięto ${r.skipped} już zapisanych`);
  if (errors.length) parts.push(`${errors.length} wierszy z błędem (szczegóły: Więcej → Apple Pay)`);
  toast(`Z ${source}: ${parts.join(', ')}.${unmapped.length ? ' Przypisz karty do kont (Przegląd).' : ''}`, 7000);
  if (r.added && txs.some((t) => !t.categoryId && !t.apSkip)) ui.inbox = true;
  else if (unmapped.length) ui.view = 'przeglad';
  render();
}

// ---------- Okna: kategorie i konta ----------
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

// ---------- Okno operacji: wydatek, przychód, przelew, korekta salda; waluty i dokumenty ----------
const TX = $('#fin-dialog');
const txForm = $('form', TX);
let txDocs = { pending: [], existing: [] };

function openTx(t, prefill = {}, { recId = '' } = {}) {
  const f = txForm;
  const p = Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const type = t?.type ?? p.type ?? 'wydatek';
  const tx = t ?? { type, date: today(), accountId: defaultAccount(type), categoryId: null, ...p };
  f.dataset.id = t?.id ?? '';
  f.dataset.cat = tx.categoryId ?? '';
  f.dataset.rec = recId;
  f.dataset.korekta = tx.type === 'korekta' ? '1' : '';
  f.dataset.toTouched = t?.toAmount !== undefined ? '1' : '';
  $('#fd-title').textContent = tx.type === 'korekta' ? 'Korekta salda' : t ? 'Edytuj operację' : recId ? 'Zapisz stałą pozycję' : 'Nowa operacja';
  setRadio(f, tx.type === 'korekta' ? 'wydatek' : tx.type);
  f.elements.amount.value = fmtInput(tx.accountAmount ?? tx.amount);
  f.elements.toAmount.value = tx.toAmount !== undefined ? fmtInput(tx.toAmount) : '';
  f.elements.date.value = tx.date;
  f.elements.merchant.value = tx.merchant ?? '';
  f.elements.note.value = tx.note ?? '';
  f.elements.accountId.innerHTML = accountOptions(tx.accountId);
  f.elements.toAccountId.innerHTML = accountOptions(tx.toAccountId);
  f.elements.repeat.value = '';
  f.elements.remember.checked = false;
  f.dataset.gemTouched = '';
  $('#fd-delete').hidden = !t;
  $('#fd-errors').textContent = '';
  txDocs = { pending: [], existing: t ? (fin.docs ?? []).filter((d) => d.txId === t.id) : [] };
  syncTxForm();
  openDialog(TX);
}

function syncTxForm() {
  const f = txForm;
  const korekta = f.dataset.korekta === '1';
  const type = korekta ? 'korekta' : f.elements.type.value;
  f.dataset.type = type;
  if (f.dataset.cat && cat(f.dataset.cat)?.kind !== type) f.dataset.cat = '';
  if (!f.dataset.id && !f.dataset.rec && !korekta) $('#fd-title').textContent = { wydatek: 'Nowy wydatek', przychod: 'Nowy przychód', przelew: 'Nowy przelew' }[type];
  $('#fd-types').hidden = korekta;
  $('#fd-korekta').hidden = !korekta;
  $('#fd-cats').innerHTML = isFlow({ type }) ? catGrid(type, f.dataset.cat) : '';
  $('#fd-cats-wrap').hidden = !isFlow({ type });
  $('#fd-to').hidden = type !== 'przelew';
  $('#fd-acc-label').textContent = type === 'przelew' ? 'Z konta' : 'Konto';
  $('#fd-remember').hidden = !isFlow({ type });
  $('#fd-repeat').hidden = Boolean(f.dataset.id || f.dataset.rec) || korekta;
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
  // Przelew na konto powiązane z portfelem GEM (np. IKE): wpłata zapisze się też w zakładce GEM → Mój portfel GEM.
  const gemInfoTx = type === 'przelew' ? gemTransferInfo(fin, { type, accountId: f.elements.accountId.value, toAccountId: f.elements.toAccountId.value }) : null;
  const linked = f.dataset.id ? fin.txs.find((x) => x.id === f.dataset.id)?.gemTxId : null;
  $('#fd-gem').hidden = !gemInfoTx;
  if (gemInfoTx) {
    const where = gemInfoTx.account === 'ZWYKLE' ? 'na koncie zwykłym' : `na ${gemInfoTx.account}`;
    $('#fd-gem-label').textContent = linked ? `Powiązana ${gemInfoTx.type === 'wplata' ? 'wpłata' : 'wypłata'} w portfelu GEM zostanie zaktualizowana.` : `Zapisz też w portfelu GEM jako ${gemInfoTx.type === 'wplata' ? 'wpłatę' : 'wypłatę'} ${where}${gemInfoTx.type === 'wplata' && ['IKE', 'IKZE'].includes(gemInfoTx.account) ? ' (liczy się do limitu)' : ''}`;
    f.elements.gem.disabled = Boolean(linked);
    if (linked) f.elements.gem.checked = true;
    else if (f.dataset.gemTouched !== '1') f.elements.gem.checked = true;
  }
  const salary = type === 'przychod' && /wynagr|pensj|wypłat|wyplat/i.test(`${cat(f.dataset.cat)?.name ?? ''} ${f.elements.merchant.value}`);
  $('#fd-docs-title').textContent = salary ? 'Dokumenty – dołącz pasek płacowy' : type === 'wydatek' ? 'Dokumenty (np. paragon, faktura)' : 'Dokumenty';
  syncTxAmounts();
  renderTxDocs();
}

// Waluta konta: etykieta kwoty, przeliczenie na złote, kwota na koncie docelowym przy przelewie walutowym.
function syncTxAmounts() {
  const f = txForm;
  const korekta = f.dataset.korekta === '1';
  const type = korekta ? 'korekta' : f.elements.type.value;
  const cur = accountCurrency(fin, f.elements.accountId.value);
  const date = f.elements.date.value || today();
  $('#fd-amount-label').textContent = `${korekta ? 'Zmiana salda' : 'Kwota'} (${curLabel(cur)})`;
  const raw = parseAmount(f.elements.amount.value);
  const amt = Number.isFinite(raw) ? (korekta ? raw : Math.abs(raw)) : 0;
  const fx = cur !== 'PLN' ? fxInfo(cur, date) : null;
  const fxEl = $('#fd-fx');
  fxEl.hidden = cur === 'PLN';
  fxEl.textContent = cur === 'PLN' ? '' : fx ? `≈ ${zl(amt * fx.rate)} · kurs średni NBP ${NF4.format(fx.rate)} z ${shortDate(fx.date, true)}` : `Brak kursu ${cur} – zapis wymaga kursu NBP (pojawi się po aktualizacji aplikacji).`;
  const toCur = type === 'przelew' && f.elements.toAccountId.value ? accountCurrency(fin, f.elements.toAccountId.value) : cur;
  const cross = type === 'przelew' && toCur !== cur;
  $('#fd-to-amount-wrap').hidden = !cross;
  if (cross) {
    $('#fd-to-amount-label').textContent = `Na konto wpłynie (${curLabel(toCur)})`;
    if (!f.dataset.toTouched) f.elements.toAmount.value = fmtInput(convert(MARKET, amt, cur, toCur, date) ?? 0);
  }
}

function renderTxDocs() {
  const kinds = (sel) => Object.entries(DOC_KINDS).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${l}</option>`).join('');
  $('#fd-docs').innerHTML = [
    ...txDocs.existing.map((d) => `<div class="doc-chip">${docIcon(d.type)} <span>${esc(d.name)}</span><small class="muted">${esc(DOC_KINDS[d.kind] ?? '')}</small><button type="button" class="link small" data-doc-open="${esc(d.id)}">Otwórz</button></div>`),
    ...txDocs.pending.map((d, i) => `<div class="doc-chip">${docIcon(d.file.type)} <span>${esc(d.file.name)}</span><select data-pending-kind="${i}" aria-label="Rodzaj dokumentu">${kinds(d.kind)}</select><button type="button" class="link small" data-pending-del="${i}">Usuń</button></div>`),
  ].join('');
}

txForm.addEventListener('change', (ev) => {
  const n = ev.target.name;
  if (ev.target.dataset.pendingKind !== undefined) txDocs.pending[Number(ev.target.dataset.pendingKind)].kind = ev.target.value;
  else if (['type', 'accountId', 'toAccountId'].includes(n)) syncTxForm();
  else if (n === 'date') syncTxAmounts();
  else if (n === 'gem') txForm.dataset.gemTouched = '1';
});
txForm.addEventListener('input', (ev) => {
  if (ev.target.name === 'amount') syncTxAmounts();
  if (ev.target.name === 'toAmount') txForm.dataset.toTouched = '1';
});
$('#fd-cats').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pick]');
  if (!b) return;
  txForm.dataset.cat = txForm.dataset.cat === b.dataset.pick ? '' : b.dataset.pick;
  syncTxForm();
});
$('#fd-docs').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.docOpen) openDoc(b.dataset.docOpen);
  if (b.dataset.pendingDel !== undefined) {
    txDocs.pending.splice(Number(b.dataset.pendingDel), 1);
    renderTxDocs();
  }
});
$('#fd-doc-add').addEventListener('click', () => $('#fd-doc-file').click());
$('#fd-doc-file').addEventListener('change', (ev) => {
  const type = txForm.dataset.korekta === '1' ? 'korekta' : txForm.elements.type.value;
  for (const file of ev.target.files) txDocs.pending.push({ file, kind: type === 'przychod' ? 'pasek' : type === 'wydatek' ? 'paragon' : 'inne' });
  ev.target.value = '';
  renderTxDocs();
});

txForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = txForm;
  const prev = fin.txs.find((x) => x.id === f.dataset.id);
  const korekta = f.dataset.korekta === '1';
  const type = korekta ? 'korekta' : f.elements.type.value;
  const date = f.elements.date.value;
  const accountId = f.elements.accountId.value || null;
  const cur = accountCurrency(fin, accountId);
  const raw = parseAmount(f.elements.amount.value);
  const amt = Number.isFinite(raw) ? round2(korekta ? raw : Math.abs(raw)) : NaN;
  const errors = [];
  let pln = amt;
  if (cur !== 'PLN' && Number.isFinite(amt)) {
    pln = convert(MARKET, amt, cur, 'PLN', date || today());
    if (pln === null) errors.push(`Brak kursu ${cur} – nie mogę przeliczyć kwoty na złote.`);
  }
  const t = {
    ...(prev ?? {}),
    id: prev?.id ?? newId(),
    type,
    amount: pln ?? amt,
    date,
    accountId,
    toAccountId: type === 'przelew' ? f.elements.toAccountId.value || null : undefined,
    categoryId: isFlow({ type }) ? f.dataset.cat || null : null,
    merchant: f.elements.merchant.value.trim(),
    note: f.elements.note.value.trim() || undefined,
    source: prev?.source ?? 'reczne',
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  delete t.accountAmount;
  delete t.toAmount;
  if (prev && prev.categoryId !== t.categoryId) delete t.catAuto; // kategoria wybrana ręcznie
  if (cur !== 'PLN') t.accountAmount = amt;
  if (type === 'przelew' && t.toAccountId) {
    const toCur = accountCurrency(fin, t.toAccountId);
    if (toCur !== cur) {
      const v = parseAmount(f.elements.toAmount.value);
      t.toAmount = Number.isFinite(v) && v > 0 ? round2(v) : convert(MARKET, amt, cur, toCur, date);
      if (t.toAmount === null) errors.push(`Brak kursu ${toCur} – wpisz kwotę, która wpłynęła na konto.`);
      if (toCur === 'PLN' && t.toAmount) t.amount = t.toAmount; // w złotych liczy się to, co faktycznie wpłynęło
    } else if (cur !== 'PLN') t.toAmount = amt;
  }
  errors.push(...validateFinTx(t, fin));
  if (errors.length) {
    $('#fd-errors').textContent = errors.join(' ');
    return;
  }
  if (f.elements.remember.checked && t.merchant && t.categoryId) fin.rules.push({ id: newId(), pattern: rulePatternFor(t.merchant), categoryId: t.categoryId });
  // Portfel GEM: przelew na powiązany rachunek (np. IKE) zapisuje albo aktualizuje wpłatę w zakładce GEM.
  const gi = gemTransferInfo(fin, t);
  let gemList = null;
  if (gi && (t.gemTxId || f.elements.gem.checked)) {
    gemList = gemTxsLoad();
    const nowTs = Date.now();
    const linkedGem = t.gemTxId ? gemList.find((g) => g.id === t.gemTxId) : null;
    if (linkedGem) Object.assign(linkedGem, { type: gi.type, date: t.date, account: gi.account, amountPLN: round2(gi.type === 'wplata' ? t.toAmount ?? t.amount : t.amount), deleted: false, updatedAt: nowTs });
    else {
      const g = gemTxFromTransfer(t, gi, { id: newId(), now: nowTs });
      gemList.push(g);
      t.gemTxId = g.id;
    }
  } else if (!gi && prev?.gemTxId) {
    gemList = gemTxsLoad();
    const g = gemList.find((x) => x.id === prev.gemTxId);
    if (g) Object.assign(g, { deleted: true, updatedAt: Date.now() });
    delete t.gemTxId;
  }
  const rec = f.dataset.rec && fin.recurring.find((x) => x.id === f.dataset.rec);
  if (rec) {
    Object.assign(t, { recurringId: rec.id, importKey: `rec|${rec.id}|${rec.nextDate}`, source: 'stale' });
    fin = settleRecurring(fin, rec.id, { post: false, newId });
  }
  fin.txs = prev ? fin.txs.map((x) => (x.id === t.id ? t : x)) : [...fin.txs, t];
  const freq = f.elements.repeat.value;
  if (!prev && !rec && freq && (isFlow(t) || t.type === 'przelew')) {
    const day = Number(t.date.slice(8, 10));
    const r = { id: newId(), title: t.merchant || cat(t.categoryId)?.name || FIN_TYPES[t.type], type: t.type, amount: amt, accountId: t.accountId, toAccountId: t.toAccountId ?? null, categoryId: t.categoryId, freq, anchorDay: day, nextDate: nextRecurringDate(t.date, freq, day), auto: true };
    fin.recurring = [...fin.recurring, r];
    Object.assign(t, { recurringId: r.id, importKey: `rec|${r.id}|${t.date}` });
  }
  if (t.type === 'wydatek' && t.accountId) fin.lastAccountId = t.accountId;
  for (const d of txDocs.pending) await saveDocFile(d.file, { kind: d.kind, date: t.date, txId: t.id, buffer: await d.file.arrayBuffer() });
  save();
  const gemNote = gemList ? (gemTxsSave(gemList) ? (gi ? ` Zapisano też w portfelu GEM (${gi.type === 'wplata' ? 'wpłata' : 'wypłata'}, ${gi.account}).` : ' Usunięto powiązany wpis w portfelu GEM.') : ' Nie udało się zapisać w portfelu GEM.') : '';
  closeDialog(TX);
  const docsNote = txDocs.pending.length ? ` Dołączone dokumenty: ${txDocs.pending.length}.` : '';
  txDocs = { pending: [], existing: [] };
  toast(prev ? `Zapisano zmiany.${docsNote}${gemNote}` : `Dodano ${FIN_TYPES[t.type].toLowerCase()}: ${zl(Math.abs(t.amount))}${freq ? ` (powtarza się: ${FREQS[freq].toLowerCase()})` : ''}.${docsNote}${gemNote}`, gemNote ? 6000 : 3500);
  if (freq && !prev) runRecurring();
  render();
});
$('#fd-delete').addEventListener('click', () => deleteTxFlow(txForm.dataset.id));

// Konto: zwykłe (saldo obecne), karta kredytowa (zadłużenie, limit, termin), inwestycyjne (gotówka + aktywa); waluta.
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
  f.elements.currency.value = a?.currency || 'PLN';
  const locked = Boolean(a && hasActivity(a.id));
  f.elements.currency.disabled = locked;
  $('#ad-currency-hint').textContent = locked ? 'Waluty nie można zmienić, bo konto ma już operacje.' : 'Konto w innej walucie liczy się do majątku po bieżącym kursie średnim NBP.';
  f.elements.balance.value = a && !isCard(a) ? fmtInput(b) : '';
  f.elements.debt.value = a && isCard(a) ? fmtInput(Math.max(0, -b)) : '';
  f.elements.limit.value = a?.limit ? fmtInput(a.limit) : '';
  f.elements.dueDay.value = a?.dueDay ?? '';
  f.elements.payFromId.innerHTML = `<option value="">— wybiorę przy spłacie —</option>${accountOptions(a?.payFromId, { none: false, filter: (x) => !isCard(x) && x.id !== a?.id })}`;
  f.elements.cards.value = (a?.cards ?? []).join(', ');
  f.elements.excludeFromTotal.checked = Boolean(a?.excludeFromTotal);
  f.elements.cardRate.value = a?.cardRate ? fmtInput(a.cardRate) : '';
  f.elements.minPayPct.value = a?.minPayPct ? fmtInput(a.minPayPct) : '';
  f.elements.gemAccount.value = a?.gemAccount ?? '';
  f.elements.gemValuation.checked = a?.gemAccount ? Boolean(a.gemValuation) : true;
  fillLoanForm(a?.loan ?? null);
  $('#ad-delete').hidden = !a;
  $('#ad-archive').hidden = !a;
  $('#ad-archive').textContent = a?.archived ? 'Przywróć' : 'Ukryj';
  $('#ad-errors').textContent = '';
  f.dataset.type = f.elements.type.value;
  syncAccForm();
  openDialog(ACC);
}

// ---------- Formularz kredytu (rodzaj konta „Kredyt / pożyczka”) ----------
const lnRadio = () => accForm.querySelector('input[name="lnRateType"]:checked')?.value ?? 'stale';
const round4 = (x) => Math.round(x * 1e4) / 1e4;
const isoAddDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Początek bieżącego okresu odsetkowego: termin ostatniej raty przed dziś (albo uruchomienie kredytu).
const loanPeriodStart = (L, date = today()) => loanSchedule(L).filter((r) => r.kind === 'rata' && r.date <= date).at(-1)?.date ?? L.start;

function fillLoanForm(L) {
  const e = accForm.elements;
  const t = today();
  const rate = L ? loanRateAt(L, t) : null;
  e.lnKind.value = L?.kind ?? 'hipoteczny';
  e.lnExisting.checked = Boolean(L?.existing);
  e.lnAmount.value = L ? fmtInput(L.amount ?? L.principal) : '';
  e.lnStart.value = L ? (L.existing ? L.origStart ?? '' : L.start) : '';
  e.lnMonths.value = L ? String((L.existing ? L.origMonths : L.months) ?? '') : '';
  e.lnRemaining.value = L?.existing ? fmtInput(L.principal) : '';
  e.lnLeft.value = L?.existing ? String(L.months) : '';
  e.lnNextDue.value = L?.existing ? L.firstDue : '';
  e.lnFirstDue.value = L && !L.existing ? L.firstDue : '';
  for (const r of accForm.querySelectorAll('input[name="lnRateType"]')) r.checked = r.value === (L?.rateType ?? 'stale');
  e.lnRate.value = L && L.rateType !== 'zero' ? fmtInput(rate) : '';
  e.lnRefName.value = L?.refName ?? 'WIBOR 3M';
  e.lnMargin.value = Number.isFinite(L?.margin) ? fmtInput(L.margin) : '';
  e.lnRef.value = L?.rateType === 'zmienne' && Number.isFinite(L?.margin) ? fmtInput(round4(rate - L.margin)) : '';
  e.lnFixedUntil.value = L?.fixedUntil ?? '';
  e.lnInstallments.value = L?.installments ?? 'rowne';
  e.lnGrace.value = L?.grace ? String(L.grace) : '';
  e.lnPayment.value = L?.payment ? fmtInput(L.payment) : '';
  e.lnFee.value = L?.fee ? fmtInput(L.fee) : '';
  e.lnFeeFinanced.checked = Boolean(L?.feeFinanced);
  e.lnInsurance.value = L?.insurance ? fmtInput(L.insurance) : '';
  e.lnPayFrom.innerHTML = accountOptions(L ? L.payFromId : defaultAccount('przelew'), { none: true, filter: (x) => !isLoan(x) && x.id !== accForm.dataset.id && x.type !== 'kredyt' });
  e.lnAuto.checked = L ? Boolean(L.autoPost) : true;
}

// Parametry kredytu z formularza (prev – dotychczasowe, żeby zachować historię oprocentowania i nadpłaty).
function readLoanForm(prev) {
  const e = accForm.elements;
  const num = (el) => (el.value.trim() ? parseAmount(el.value) : NaN);
  const int = (el) => (el.value.trim() ? Math.round(Number(el.value.replace(',', '.'))) : NaN);
  const t = today();
  const existing = e.lnExisting.checked;
  const rateType = lnRadio();
  const L = { ...(prev ?? {}), overpayments: prev?.overpayments ?? [] };
  L.kind = e.lnKind.value;
  L.existing = existing || undefined;
  L.rateType = rateType;
  L.installments = e.lnInstallments.value;
  L.grace = int(e.lnGrace) || 0;
  L.fee = Math.abs(num(e.lnFee)) || 0;
  L.feeFinanced = (!existing && e.lnFeeFinanced.checked) || undefined;
  L.insurance = Math.abs(num(e.lnInsurance)) || 0;
  L.payFromId = e.lnPayFrom.value || null;
  L.autoPost = e.lnAuto.checked;
  L.refName = rateType === 'zmienne' ? e.lnRefName.value : undefined;
  L.margin = rateType === 'zmienne' ? num(e.lnMargin) : undefined;
  L.fixedUntil = rateType === 'stale' ? e.lnFixedUntil.value || undefined : undefined;
  const amount = Math.abs(num(e.lnAmount));
  if (existing) {
    // Stan na dziś z aplikacji banku: harmonogram zaczyna się od najbliższej raty.
    L.amount = Number.isFinite(amount) ? amount : undefined;
    L.origStart = e.lnStart.value || undefined;
    L.origMonths = int(e.lnMonths) || undefined;
    L.principal = Math.abs(num(e.lnRemaining));
    L.months = int(e.lnLeft);
    L.firstDue = e.lnNextDue.value;
    L.start = L.firstDue ? shiftMonthsKeepDay(L.firstDue, -1) : '';
  } else {
    L.amount = amount;
    L.principal = amount;
    L.start = e.lnStart.value;
    L.months = int(e.lnMonths);
    L.firstDue = e.lnFirstDue.value || (L.start ? shiftMonthsKeepDay(L.start, 1) : '');
    delete L.origStart;
    delete L.origMonths;
  }
  const formRate = rateType === 'zero' ? 0 : rateType === 'zmienne' ? num(e.lnRef) + num(e.lnMargin) : num(e.lnRate);
  const anchorChanged = !prev || prev.start !== L.start || prev.principal !== L.principal || Boolean(prev.existing) !== existing;
  if (rateType === 'zero') L.rates = [];
  else if (anchorChanged || !prev?.rates?.length) L.rates = Number.isFinite(formRate) ? [[L.start, round4(formRate)]] : [];
  else if (Number.isFinite(formRate) && Math.abs(formRate - loanRateAt(prev, t)) > 1e-9) L.rates = [...prev.rates, [loanPeriodStart(prev, t), round4(formRate)]];
  const pay = num(e.lnPayment);
  if (Number.isFinite(pay) && pay > 0) {
    if (anchorChanged || Math.abs((prev?.payment ?? 0) - pay) > 0.004 || !prev?.paymentFrom) {
      L.payment = round2(pay);
      L.paymentFrom = anchorChanged ? L.start : loanPeriodStart(L, t);
    }
  } else {
    delete L.payment;
    delete L.paymentFrom;
  }
  L.trackFrom = prev?.trackFrom ?? t;
  return L;
}

function syncLoanForm() {
  const e = accForm.elements;
  const existing = e.lnExisting.checked;
  const rateType = lnRadio();
  $('#ad-ln-existing').hidden = !existing;
  $('#ad-ln-first').hidden = existing;
  $('#ad-ln-fixed').hidden = rateType !== 'stale';
  $('#ad-ln-fixed-until').hidden = rateType !== 'stale';
  $('#ad-ln-var').hidden = rateType !== 'zmienne';
  const L = readLoanForm(acc(accForm.dataset.id)?.loan ?? null);
  const errors = validateLoan({ ...L, autoPost: false });
  const el = $('#ad-ln-preview');
  if (errors.length) {
    el.textContent = 'Uzupełnij kwotę, daty, liczbę rat i oprocentowanie – zobaczysz tu ratę i koszt kredytu.';
    return;
  }
  const cur = accForm.elements.currency.value;
  const s = loanSummary(L, today());
  const first = s.next ?? s.installments[0];
  const ins = Number(L.insurance) || 0;
  el.innerHTML = `Rata: <b>${esc(money((first?.payment ?? 0) + ins, cur))}</b>${L.installments === 'malejace' ? ' (pierwsza, potem maleje)' : ''} · do spłaty dziś: <b>${esc(money(s.remaining, cur))}</b> · koniec: <b>${esc(monthYear(s.end))}</b><br>Odsetki do końca: ${esc(money(s.futureInterest, cur))} · całkowity koszt kredytu: ${esc(money(s.totalCost, cur))}${s.apr !== null ? ` · RRSO ok. ${esc(pctNum(s.apr * 100))}%` : ''}`;
}

function syncAccForm() {
  const f = accForm;
  const type = f.elements.type.value;
  const card = type === 'karta';
  const loanType = type === 'kredyt';
  $('#ad-loan').hidden = !loanType;
  $('#ad-gem').hidden = type !== 'inwestycje';
  if (loanType) syncLoanForm();
  const wasCard = f.dataset.type === 'karta';
  // Przy zmianie rodzaju przenosimy kwotę: saldo ujemne ↔ zadłużenie.
  if (card && !wasCard && !f.elements.debt.value) {
    const v = parseAmount(f.elements.balance.value);
    f.elements.debt.value = Number.isFinite(v) && v < 0 ? fmtInput(-v) : '';
  } else if (!card && wasCard && !f.elements.balance.value) {
    const v = parseAmount(f.elements.debt.value);
    f.elements.balance.value = Number.isFinite(v) && v > 0 ? fmtInput(-v) : '';
  }
  f.dataset.type = type;
  const cur = curLabel(f.elements.currency.value);
  $('#ad-plain').hidden = card || loanType;
  $('#ad-card').hidden = !card;
  $('#ad-balance-label').textContent = type === 'inwestycje' ? `Wolna gotówka na rachunku (${cur})` : `Saldo obecne (${cur})`;
  $('#ad-balance-hint').textContent =
    type === 'inwestycje'
      ? 'Same pieniądze, bez ETF-ów. Aktywa dodasz przyciskiem „Aktywa” na liście kont – ich wartość liczy się osobno, po bieżących cenach.'
      : f.dataset.id
        ? 'Zmiana salda zapisze się w historii jako korekta salda z dzisiejszą datą (nie jako wydatek ani przychód).'
        : 'Ile jest teraz na koncie. Każda zapisana operacja zmieni to saldo.';
}

accForm.addEventListener('change', (ev) => (['type', 'currency', 'lnExisting', 'lnRateType', 'lnInstallments', 'lnFeeFinanced'].includes(ev.target.name) ? syncAccForm() : ev.target.name?.startsWith('ln') && accForm.elements.type.value === 'kredyt' && syncLoanForm()));
accForm.addEventListener('input', (ev) => ev.target.name?.startsWith('ln') && accForm.elements.type.value === 'kredyt' && syncLoanForm());
accForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = accForm;
  const prev = acc(f.dataset.id);
  const type = f.elements.type.value;
  const card = type === 'karta';
  const loanType = type === 'kredyt';
  const name = f.elements.name.value.trim();
  const num = (input) => (input.value.trim() ? parseAmount(input.value) : 0);
  const loan = loanType ? readLoanForm(isLoan(prev) ? prev.loan : null) : null;
  const errors = [];
  if (!name) errors.push('Podaj nazwę konta.');
  if (loanType) errors.push(...validateLoan(loan, fin));
  // Kredyt: saldo = −kapitał do spłaty z harmonogramu na dzień przed rozpoczęciem zapisywania rat.
  const target = loanType ? (prev && isLoan(prev) ? balances(fin)[prev.id] : -loanBalanceAt(loan, loanSchedule(loan), isoAddDays(loan.trackFrom, -1))) : card ? -Math.abs(num(f.elements.debt)) : num(f.elements.balance);
  if (!loanType && !Number.isFinite(target)) errors.push(card ? 'Nie rozpoznano kwoty zadłużenia.' : 'Nie rozpoznano salda.');
  const dueDay = f.elements.dueDay.value.trim() ? Math.round(Number(f.elements.dueDay.value)) : null;
  if (card && dueDay !== null && !(dueDay >= 1 && dueDay <= 31)) errors.push('Dzień spłaty to liczba od 1 do 31.');
  if (errors.length) {
    $('#ad-errors').textContent = errors.join(' ');
    return;
  }
  const id = prev?.id ?? newId();
  const currency = f.elements.currency.value;
  const a = { ...(prev ?? { openingBalance: 0, openingDate: '1970-01-01' }), id, name, type, cards: f.elements.cards.value.split(',').map((x) => x.trim()).filter(Boolean) };
  a.currency = currency === 'PLN' ? undefined : currency;
  a.excludeFromTotal = f.elements.excludeFromTotal.checked || undefined;
  a.limit = card ? Math.abs(num(f.elements.limit)) || undefined : undefined;
  a.dueDay = card ? dueDay ?? undefined : undefined;
  a.payFromId = card ? f.elements.payFromId.value || undefined : undefined;
  a.cardRate = card ? Math.abs(num(f.elements.cardRate)) || undefined : undefined;
  a.minPayPct = card ? Math.abs(num(f.elements.minPayPct)) || undefined : undefined;
  const gemAccount = type === 'inwestycje' ? f.elements.gemAccount.value || undefined : undefined;
  a.gemLinkedAt = gemAccount ? (prev?.gemAccount === gemAccount ? prev.gemLinkedAt ?? today() : today()) : undefined;
  a.gemAccount = gemAccount;
  a.gemValuation = gemAccount ? f.elements.gemValuation.checked || undefined : undefined;
  a.loan = loanType ? loan : undefined;
  fin.accounts = prev ? fin.accounts.map((x) => (x.id === id ? a : x)) : [...fin.accounts, a];
  if (!prev || (loanType && !isLoan(prev))) setBalance(fin, id, target);
  else if (!loanType && Math.abs(balances(fin)[id] - target) >= 0.005) adjustBalance(fin, id, target, { date: today(), newId, market: MARKET });
  if (loanType) runRecurring();
  save();
  closeDialog(ACC);
  toast(prev ? 'Zapisano konto.' : card ? 'Dodano kartę kredytową.' : loanType ? 'Dodano kredyt. Szczegóły, harmonogram i nadpłaty znajdziesz pod przyciskiem „Szczegóły kredytu”.' : type === 'inwestycje' ? (gemAccount ? `Dodano konto powiązane z portfelem GEM (${gemAccount}). Przelewy na nie zapiszą się też jako wpłaty w portfelu.` : 'Dodano konto inwestycyjne. Aktywa dodasz przyciskiem „Aktywa”.') : 'Dodano konto.', 6000);
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
$('#ad-delete').addEventListener('click', () => deleteAccountFlow(accForm.dataset.id));

// ---------- Aktywa na koncie inwestycyjnym ----------
const LOTS = $('#lots-dialog');
const lotsForm = $('form', LOTS);
let lotsState = null;
// ETF-y strategii GEM (ceny dołączone do strony) – pokazywane w wyszukiwarce, zanim cokolwiek wpiszesz.
const gemAssets = () => Object.entries(MARKET.assets ?? {}).filter(([, a]) => !a.library);
const latestMark = (l) => (l.marks?.length ? l.marks.at(-1)[1] : l.price);

const lotPicker = instPicker({
  extra: () => gemAssets().map(([symbol, a]) => ({ symbol, name: a.name, currency: a.currency })),
  onPick: async (it) => {
    libraryQuotes = libraryQuotes ?? (await instLoadQuotes());
    const gem = MARKET.assets?.[it.symbol] && !MARKET.assets[it.symbol].library;
    if (!gem) addLibraryAsset(it.symbol, it.name, it.currency);
    const priced = gem || MARKET.assets?.[it.symbol] || it.market === 'PL' || it.market === 'US' || it.proxy;
    if (priced) {
      const last = instLastPrice(MARKET.assets?.[it.symbol]);
      lotsState.lots.push({ id: newId(), asset: it.symbol, name: it.name, currency: it.currency, qty: 0, price: 0, date: today(), hint: last ? `Ostatni kurs: ${fmtInput(last[1])} ${it.currency} (${shortDate(last[0], true)}).` : '' });
    } else {
      // Brak darmowych notowań (np. akcje z Frankfurtu czy Paryża): pozycja z wyceną ręczną z historią zmian.
      lotsState.lots.push({ id: newId(), asset: 'manual', name: `${it.symbol} · ${it.name}`, currency: it.currency, qty: 0, price: 0, value: 0, date: today() });
    }
    lotPicker.reset();
    $('#ld-picker').hidden = true;
    renderLots();
    $('#ld-rows').lastElementChild?.querySelector('[data-lf="qty"]')?.focus();
  },
});

function openLots(accountId) {
  const a = acc(accountId);
  if (!a) return;
  lotsState = {
    accountId,
    lots: (a.lots ?? []).filter((l) => !l.until).map((l) => ({ ...l, value: l.asset === 'manual' ? latestMark(l) : undefined })),
    before: holdingsPLN(MARKET, a, valuationDate()) ?? 0,
    fundCategory: a.fundCategory ?? '',
  };
  $('#ld-title').textContent = `Aktywa: ${a.name}`;
  $('#ld-info').textContent = `${marketNote()} Akcje i ETF-y z GPW wyceniam po kursie zamknięcia z giełdy, fundusze ING TFI (np. w PPE) – po wycenie jednostki z ING TFI, a popularne ETF-y UCITS – od ceny zakupu według zmiany indeksu, który śledzą (wycena przybliżona, oznaczona „≈”).`;
  if (!$('#ld-picker').firstChild) $('#ld-picker').append(lotPicker);
  $('#ld-picker').hidden = true;
  $('#ld-fund').hidden = true;
  lotPicker.reset();
  lotsForm.elements.settle.checked = true;
  lotsForm.elements.cash.value = '';
  $('#ld-errors').textContent = '';
  renderLots();
  openDialog(LOTS);
  const refresh = () => lotsState?.accountId === accountId && lotsState.lots.some((l) => l.asset !== 'manual' && !MARKET.assets?.[l.asset] && addLibraryAsset(l.asset, l.name, l.currency)) && renderLots();
  instLoadQuotes().then((data) => {
    libraryQuotes = libraryQuotes ?? data;
    refresh();
  });
  if (lotsState.lots.some(isFundLot) || /ppe|ppk|ing tfi/i.test(a.name)) {
    instLoadFunds().then((data) => {
      fundsData = fundsData ?? data;
      refresh();
    });
  }
}

// Opis źródła ceny pozycji (GEM, GPW, USA, fundusz ING TFI, indeks albo cena zakupu).
function lotSource(l) {
  const a = MARKET.assets?.[l.asset];
  if (a && !a.library) return 'ETF strategii GEM – cena z codziennej aktualizacji';
  if (a) return instSourceLabel(a, libraryQuotes);
  if (isFundLot(l)) return 'Wycena jednostki z ING TFI pojawi się po najbliższej aktualizacji aplikacji.';
  if (l.asset?.endsWith('.US')) return 'Brak notowań – wycena według ceny zakupu. Dopisz symbol do obserwowanych (Rynki → Instrumenty), aby pobierać kurs.';
  if (l.asset?.endsWith('.PL')) return 'Kurs z GPW pojawi się po najbliższej aktualizacji aplikacji.';
  return 'Brak notowań – wycena według ceny zakupu.';
}

function lotSummary(l) {
  const at = valuationDate();
  const lot = l.asset === 'manual' ? { ...l, marks: [[l.date, l.value]] } : l;
  if (!(l.qty > 0) || !((l.asset === 'manual' ? l.value : l.price) > 0)) return isFundLot(l) ? 'Uzupełnij liczbę jednostek i kwotę wpłat (albo średnią cenę).' : 'Uzupełnij ilość i cenę.';
  const v = lotValuePLN(MARKET, lot, at);
  if (v === null) return 'Brak kursu waluty.';
  if (l.asset === 'manual') return `Wartość: ${zl(v)}`;
  const r = lotResult(MARKET, { ...withMark(l, at), since: undefined, until: undefined }, at);
  const noPrice = needsMark(l) && !(l.markNew > 0) && !l.mark;
  return r ? `Wartość dziś: ${zl(r.value)} · zysk ${gainText(r.gain, r.gainPct)}${noPrice ? ' – wpisz kurs teraz z XTB, aby zobaczyć prawdziwy zysk' : ''}` : `Wartość dziś: ${zl(v)}`;
}
// Pozycja bez dokładnych notowań (ETF wyceniany według indeksu): przyda się bieżący kurs z XTB.
const needsMark = (l) => l.asset !== 'manual' && !isFundLot(l) && !hasExactQuotes(MARKET, l.asset, valuationDate());
const withMark = (l, at) => (l.markNew > 0 ? { ...l, mark: [at, l.markNew] } : l);

function renderLots() {
  $('#ld-rows').innerHTML = lotsState.lots.length
    ? lotsState.lots
        .map((l, i) => {
          const cur = lotCurrency(MARKET, l);
          const fund = isFundLot(l);
          const pence = l.asset !== 'manual' && !fund ? instPenceHint({ market: l.asset.slice(l.asset.lastIndexOf('.') + 1), currency: cur, name: l.name ?? '' }) : '';
          const head = fund
            ? `<b>${esc(l.name ?? 'Fundusz')}</b> <span class="tag">kat. ${esc(fundCategoryOf(l.asset))}</span>`
            : `<b>${esc(l.asset)}</b> ${esc(l.name ?? MARKET.assets?.[l.asset]?.name ?? '')}`;
          const body =
            l.asset === 'manual'
              ? `<label class="field full">Nazwa aktywa<input data-lf="name" value="${esc(l.name ?? '')}" placeholder="np. Obligacje skarbowe EDO"></label>
                 <label class="field">Waluta<select data-lf="currency">${[...new Set([...CURRENCIES, l.currency || 'PLN'])].map((c) => `<option ${c === (l.currency || 'PLN') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
                 <label class="field">Ilość<input data-lf="qty" inputmode="decimal" value="${esc(fmtQty(l.qty))}"></label>
                 <label class="field">Wartość za sztukę dziś (${esc(curLabel(cur))})<input data-lf="value" inputmode="decimal" value="${esc(fmtInput(l.value))}"></label>
                 <label class="field">Od kiedy<input type="date" data-lf="date" value="${esc(l.date)}"></label>`
              : `<div class="full lot-inst">${head}<div class="small muted">${esc(lotSource(l))}</div>${l.hint ? `<div class="small muted">${esc(l.hint)}</div>` : ''}${pence ? `<div class="small warn">${esc(pence)}</div>` : ''}</div>
                 <label class="field">${fund ? 'Liczba jednostek' : 'Ilość (szt.)'}<input data-lf="qty" inputmode="decimal" value="${esc(fmtQty(l.qty))}"></label>
                 <label class="field">${fund ? 'Średnia cena jednostki' : 'Cena zakupu za szt.'} (${esc(curLabel(cur))})<input data-lf="price" inputmode="decimal" value="${esc(fmtInput(l.price))}"></label>
                 <label class="field">${fund ? 'Suma wpłat' : 'Zainwestowano'} (${esc(curLabel(cur))})<input data-lf="cost" inputmode="decimal" value="${esc(fmtInput(l.qty * l.price))}" placeholder="ilość × cena"></label>
                 <label class="field">${fund ? 'Data pierwszej wpłaty' : 'Data zakupu'}<input type="date" data-lf="date" value="${esc(l.date)}"></label>
                 ${needsMark(l) ? `<label class="field full">Kurs teraz z XTB (${esc(curLabel(cur))}) – do wyceny i zysku<input data-lf="mark" inputmode="decimal" value="${esc(fmtInput(l.markNew))}" placeholder="${l.price > 0 ? `teraz ok. ${esc(fmtInput(lotPrice(MARKET, l, valuationDate())))}` : 'np. 143,22'}"><small>${l.mark ? `Ostatnio wpisany: ${esc(fmtInput(l.mark[1]))} (${esc(shortDate(l.mark[0], true))}); od tego dnia kurs zmienia się razem z indeksem. ` : ''}Przepisz cenę z XTB (pozycja → aktualna cena). Wystarczy raz – dalej aplikacja śledzi zmiany indeksu, a kurs możesz poprawić w każdej chwili.</small></label>` : ''}`;
          return `<div class="lot-row" data-lot="${i}">${body}<div class="lot-foot full"><span class="small muted" data-lot-val="${i}">${esc(lotSummary(l))}</span><button type="button" class="link small danger-text" data-lot-del="${i}">Usuń</button></div></div>`;
        })
        .join('')
    : '<p class="muted small">Brak aktywów. Dodaj instrument z oferty XTB (wyszukaj po nazwie, symbolu albo ISIN), fundusz ING TFI (np. z PPE) albo inne aktywo z wyceną ręczną, np. obligacje skarbowe.</p>';
  updateLotsSum();
}

// Panel wyboru funduszu ING TFI i kategorii jednostek (w PPE zwykle E, F, S, T albo W – zależy od umowy pracodawcy).
function fillFundPanel() {
  const fSel = $('#ldf-fund');
  const cSel = $('#ldf-cat');
  if (!fundsData?.funds?.length) {
    fSel.innerHTML = '<option value="">Brak danych – pojawią się po najbliższej aktualizacji aplikacji</option>';
    cSel.innerHTML = '';
    $('#ldf-info').textContent = '';
    $('#ldf-ok').disabled = true;
    return;
  }
  $('#ldf-ok').disabled = false;
  if (!fSel.options.length || !fSel.value) {
    const groups = new Map();
    for (const f of [...fundsData.funds].sort((x, y) => FUND_TYPE_ORDER.indexOf(x.type) - FUND_TYPE_ORDER.indexOf(y.type) || x.name.localeCompare(y.name, 'pl'))) {
      if (!groups.has(f.type)) groups.set(f.type, []);
      groups.get(f.type).push(f);
    }
    fSel.innerHTML = [...groups].map(([type, list]) => `<optgroup label="${esc(cap(type))}">${list.map((f) => `<option value="${f.id}">${esc(f.name)}${f.cats.some((c) => FUND_PPE_CATEGORIES.includes(c)) ? '' : ' (bez kategorii PPE)'}</option>`).join('')}</optgroup>`).join('');
  }
  updateFundCats();
}
function updateFundCats() {
  const fund = fundsData?.funds?.find((f) => f.id === Number($('#ldf-fund').value));
  const cSel = $('#ldf-cat');
  if (!fund) return;
  const keep = cSel.value && fund.cats.includes(cSel.value) ? cSel.value : fundDefaultCategory(fund, lotsState?.fundCategory);
  cSel.innerHTML = fund.cats.map((c) => `<option value="${esc(c)}" ${c === keep ? 'selected' : ''}>${esc(c)} – ${esc(fundsData.categories?.[c] ?? '')}</option>`).join('');
  updateFundInfo();
}
function updateFundInfo() {
  const fund = fundsData?.funds?.find((f) => f.id === Number($('#ldf-fund').value));
  const cat = $('#ldf-cat').value;
  if (!fund || !cat) return;
  const last = fundQuotes(fundsData, fundSymbol(fund.id, cat)).at(-1);
  const ret = fund.ret?.[cat] ?? {};
  const r = (k, l) => (Number.isFinite(ret[k]) ? `${l} ${ret[k] < 0 ? '−' : '+'}${pct1(ret[k])}` : '');
  $('#ldf-info').innerHTML = `${last ? `Wycena jednostki: <b>${esc(NF2.format(last[1]))} ${esc(curLabel(fund.currency))}</b> (${esc(shortDate(last[0], true))}). ` : ''}${esc([r('12M', '12 mies.:'), r('YTD', 'od początku roku:'), r('60M', '5 lat:')].filter(Boolean).join(' · '))}<br><span class="muted">${esc(fund.umbrella)} · ryzyko ${esc(fund.risk ?? '–')}/7${fund.url ? ` · <a href="${esc(fund.url)}" target="_blank" rel="noopener">karta funduszu</a>` : ''}</span>`;
}
$('#ldf-fund').addEventListener('change', updateFundCats);
$('#ldf-cat').addEventListener('change', updateFundInfo);
$('#ld-add-fund').addEventListener('click', async () => {
  const box = $('#ld-fund');
  box.hidden = !box.hidden;
  $('#ld-picker').hidden = true;
  if (box.hidden) return;
  fundsData = fundsData ?? (await instLoadFunds());
  fillFundPanel();
});
$('#ldf-ok').addEventListener('click', () => {
  const fund = fundsData?.funds?.find((f) => f.id === Number($('#ldf-fund').value));
  const cat = $('#ldf-cat').value;
  if (!fund || !cat) return;
  const symbol = fundSymbol(fund.id, cat);
  addLibraryAsset(symbol, fund.name, fund.currency);
  const last = fundQuotes(fundsData, symbol).at(-1);
  lotsState.fundCategory = cat;
  lotsState.lots.push({ id: newId(), asset: symbol, name: fund.name, currency: fund.currency, qty: 0, price: 0, date: today(), hint: last ? `Ostatnia wycena jednostki: ${fmtInput(last[1])} ${curLabel(fund.currency)} (${shortDate(last[0], true)}). Liczbę jednostek i sumę wpłat znajdziesz w serwisie ING TFI24.` : '' });
  $('#ld-fund').hidden = true;
  renderLots();
  $('#ld-rows').lastElementChild?.querySelector('[data-lf="qty"]')?.focus();
});

function workingValue() {
  const at = valuationDate();
  let sum = 0;
  for (const l of lotsState.lots) {
    if (!(l.qty > 0)) continue;
    const lot = l.asset === 'manual' ? { ...l, marks: [[l.date, l.value ?? 0]] } : withMark(l, at);
    sum += lotValuePLN(MARKET, lot, at) ?? 0;
  }
  return sum;
}

function updateLotsSum() {
  const now = workingValue();
  const delta = now - lotsState.before;
  $('#ld-sum').textContent = `Wartość aktywów: ${zl(now)}${Math.abs(delta) >= 0.01 ? ` (zmiana ${signed(delta)})` : ''}.`;
}

lotsForm.addEventListener('input', (ev) => {
  const el = ev.target;
  const row = el.closest('[data-lot]');
  if (!row || !el.dataset.lf) return;
  const l = lotsState.lots[Number(row.dataset.lot)];
  const k = el.dataset.lf;
  const num = () => Math.abs(parseAmount(el.value)) || 0;
  const setField = (name, v) => {
    const input = $(`[data-lf="${name}"]`, row);
    if (input && input !== el) input.value = fmtInput(v);
  };
  // „Zainwestowano” i cena za sztukę są powiązane: kwota = ilość × cena. Ostatnio wpisane pole decyduje przy zmianie ilości.
  if (k === 'mark') l.markNew = num();
  else if (k === 'cost') {
    l.cost = num();
    l.costMode = true;
    l.price = l.qty > 0 ? l.cost / l.qty : 0;
    setField('price', l.price);
  } else if (k === 'qty' || k === 'price' || k === 'value') {
    l[k] = num();
    if (k === 'price') l.costMode = false;
    if (k === 'qty' && l.costMode) {
      l.price = l.qty > 0 ? (l.cost ?? 0) / l.qty : 0;
      setField('price', l.price);
    } else if (k !== 'value') setField('cost', l.qty * l.price);
  } else l[k] = el.value;
  if (k === 'asset' || k === 'currency') return renderLots();
  $(`[data-lot-val="${row.dataset.lot}"]`).textContent = lotSummary(l);
  updateLotsSum();
});
lotsForm.addEventListener('change', (ev) => ev.target.dataset.lf === 'asset' && renderLots());
$('#ld-rows').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-lot-del]');
  if (!b) return;
  lotsState.lots.splice(Number(b.dataset.lotDel), 1);
  renderLots();
});
$('#ld-add').addEventListener('click', () => {
  const box = $('#ld-picker');
  box.hidden = !box.hidden;
  $('#ld-fund').hidden = true;
  if (!box.hidden) lotPicker.focusInput();
});
$('#ld-add-manual').addEventListener('click', () => {
  lotsState.lots.push({ id: newId(), asset: 'manual', name: '', currency: 'PLN', qty: 1, price: 0, value: 0, date: today() });
  renderLots();
});
lotsForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const a = acc(lotsState.accountId);
  const errors = [];
  lotsState.lots.forEach((l, i) => {
    const n = i + 1;
    if (!(l.qty > 0)) errors.push(`Pozycja ${n}: podaj ${isFundLot(l) ? 'liczbę jednostek' : 'ilość'}.`);
    if (l.asset === 'manual' ? !(l.value > 0) : !(l.price > 0)) errors.push(`Pozycja ${n}: podaj ${l.asset === 'manual' ? 'wartość' : isFundLot(l) ? 'sumę wpłat albo średnią cenę jednostki' : 'cenę zakupu albo kwotę'}.`);
    if (l.asset === 'manual' && !String(l.name ?? '').trim()) errors.push(`Pozycja ${n}: podaj nazwę.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date ?? '')) errors.push(`Pozycja ${n}: podaj datę.`);
  });
  if (errors.length) {
    $('#ld-errors').textContent = errors.join(' ');
    return;
  }
  const cashRaw = lotsForm.elements.cash.value.trim();
  const cashTarget = cashRaw ? parseAmount(cashRaw) : null;
  if (cashRaw && !Number.isFinite(cashTarget)) {
    $('#ld-errors').textContent = 'Nie rozpoznano kwoty wolnej gotówki.';
    return;
  }
  const t = valuationDate();
  const lots = lotsState.lots.map((l) => {
    if (l.asset !== 'manual') {
      // Kurs teraz z XTB: znana cena rynkowa od dziś (wycena i zysk od razu, dalej zmiana indeksu).
      const mark = l.markNew > 0 ? [t, Math.round(l.markNew * 1e6) / 1e6] : l.mark;
      const out = { id: l.id, asset: l.asset, name: l.name, currency: l.currency, qty: l.qty, price: Math.round(l.price * 1e6) / 1e6, date: l.date, since: l.since };
      if (mark) out.mark = mark;
      return out;
    }
    // Aktywo z wyceną ręczną: każda zmiana wartości to nowy punkt historii (do wykresu majątku).
    const old = (a.lots ?? []).find((x) => x.id === l.id);
    let marks = old?.marks?.map((m) => [...m]) ?? [];
    if (!marks.length) marks = [[l.date, l.value]];
    else if (Math.abs(marks.at(-1)[1] - l.value) > 0.004) {
      if (marks.at(-1)[0] === t) marks.at(-1)[1] = l.value;
      else marks.push([t, l.value]);
    }
    if (marks.length === 1 || l.date < marks[1][0]) marks[0][0] = l.date;
    return { id: l.id, asset: 'manual', name: l.name.trim(), currency: l.currency || 'PLN', qty: l.qty, price: marks[0][1], date: l.date, since: l.since, marks };
  });
  const settleCash = lotsForm.elements.settle.checked;
  closeDialog(LOTS);
  undoable(cashTarget !== null ? 'Zapisano aktywa i wolną gotówkę.' : 'Zapisano aktywa.', () => {
    const target = acc(lotsState.accountId);
    // Rozliczenie z gotówką: nowa pozycja liczy się osobno od dziś (wcześniej jej wartość była w saldzie gotówki),
    // a usunięta to sprzedaż – zostaje w historii do dziś. Bez rozliczenia usunięta pozycja znika całkiem.
    const oldActive = (target.lots ?? []).filter((l) => !l.until);
    const closed = (target.lots ?? []).filter((l) => l.until);
    const kept = new Set(lots.map((l) => l.id));
    const sold = settleCash ? oldActive.filter((l) => !kept.has(l.id)).map((l) => ({ ...l, until: t })) : [];
    for (const l of lots) {
      if (settleCash && !oldActive.some((o) => o.id === l.id)) l.since = t;
      if (!l.since) delete l.since;
    }
    const all = [...closed, ...sold, ...lots];
    if (all.length) target.lots = all;
    else delete target.lots;
    if (lotsState.fundCategory) target.fundCategory = lotsState.fundCategory;
    const cur = target.currency || 'PLN';
    if (settleCash) {
      // Gotówka zmienia się tylko o kupno i sprzedaż (nowe, usunięte pozycje i zmiany ilości) – nie o zmianę wyceny.
      const delta = round2(holdingsTradeDelta(MARKET, oldActive, lots, sold, t));
      const cash = Math.abs(delta) < 0.01 ? null : cur === 'PLN' ? -delta : convert(MARKET, -delta, 'PLN', cur, t);
      if (cash !== null) {
        const tx = { id: newId(), type: 'korekta', amount: -delta, date: t, accountId: target.id, merchant: delta > 0 ? 'Kupno aktywów (z gotówki na koncie)' : 'Sprzedaż aktywów (na gotówkę na koncie)', source: 'reczne', createdAt: Date.now(), updatedAt: Date.now() };
        if (cur !== 'PLN') tx.accountAmount = cash;
        fin.txs.push(tx);
      }
    }
    // Wolna gotówka wg XTB: saldo konta ustawione na podaną kwotę (reszta wartości konta to aktywa i ich zysk).
    if (cashTarget !== null && Math.abs(balances(fin)[target.id] - cashTarget) >= 0.005) adjustBalance(fin, target.id, cashTarget, { date: t, newId, market: MARKET, note: 'Wolna gotówka wg brokera' });
  });
});

// ---------- Plany inwestycyjne: edycja planu i wpłata do planu ----------
const PLAN = $('#plan-dialog');
const planForm = $('form', PLAN);
let planState = null;

const planPicker = instPicker({
  placeholder: 'Szukaj ETF-u lub akcji z XTB',
  extra: () => gemAssets().map(([symbol, a]) => ({ symbol, name: a.name, currency: a.currency })),
  onPick: async (it) => {
    libraryQuotes = libraryQuotes ?? (await instLoadQuotes());
    if (!MARKET.assets?.[it.symbol]) addLibraryAsset(it.symbol, it.name, it.currency);
    addPlanItem({ asset: it.symbol, name: it.name, currency: it.currency });
    planPicker.reset();
    $('#pl-picker').hidden = true;
  },
});

// Ceny do planu: biblioteka XTB i fundusze ING TFI dla instrumentów, których jeszcze nie ma w wycenie.
async function ensurePlanAssets(items) {
  if (items.some((i) => String(i.asset).startsWith(FUND_PREFIX))) fundsData = fundsData ?? (await instLoadFunds());
  if (items.some((i) => !String(i.asset).startsWith(FUND_PREFIX))) libraryQuotes = libraryQuotes ?? (await instLoadQuotes());
  for (const i of items) if (!MARKET.assets?.[i.asset]) addLibraryAsset(i.asset, i.name, i.currency);
}

function planFromOptions(a, selected) {
  const others = fin.accounts.filter((x) => x.id !== a.id && !x.archived && !isLoan(x) && !isCard(x));
  const opt = (v, l) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(l)}</option>`;
  return `${others.map((x) => opt(x.id, `Przelew z konta: ${x.name}`)).join('')}${opt(a.id, 'Z wolnej gotówki na tym koncie')}${opt(PLAN_EXTERNAL, 'Spoza aplikacji (np. składka pracodawcy do PPE)')}`;
}
const defaultPlanFrom = (a) => (/ppe|ppk/i.test(a.name) ? PLAN_EXTERNAL : defaultAccount('przelew') || a.id);

function addPlanItem(item) {
  const d = planState?.draft;
  if (!d || d.items.some((i) => i.asset === item.asset)) return;
  const used = d.items.reduce((s, i) => s + (Number(i.pct) || 0), 0);
  d.items.push({ asset: item.asset, name: item.name, currency: item.currency || 'PLN', pct: Math.max(0, round2(100 - used)) });
  renderPlanEdit();
}

function openPlan(accountId, planId) {
  const a = acc(accountId);
  if (!a) return;
  const p = planId ? (a.plans ?? []).find((x) => x.id === planId) : null;
  // Nowy plan: instrumenty z konta z udziałami według obecnej wartości (do poprawienia).
  let items = [];
  if (!p) {
    const at = valuationDate();
    const byAsset = new Map();
    for (const l of (a.lots ?? []).filter((x) => !x.until && x.asset !== 'manual')) byAsset.set(l.asset, { l, v: (byAsset.get(l.asset)?.v ?? 0) + (lotValuePLN(MARKET, l, at) ?? 0) });
    const total = [...byAsset.values()].reduce((s, x) => s + x.v, 0);
    let left = 100;
    items = [...byAsset.values()].map(({ l, v }, k, arr) => {
      const pct = k === arr.length - 1 ? left : total > 0 ? Math.round((v / total) * 100) : Math.round(100 / arr.length);
      left -= pct;
      return { asset: l.asset, name: l.name, currency: lotCurrency(MARKET, l), pct };
    });
  }
  planState = { mode: 'edit', accountId, planId: p?.id ?? null, draft: p ? JSON.parse(JSON.stringify(p)) : { id: newId(), name: /ppe/i.test(a.name) ? 'PPE – podział wpłat' : '', items, recurring: null, log: [] } };
  $('#pl-title').textContent = p ? `Plan: ${p.name}` : 'Nowy plan inwestycyjny';
  $('#pl-delete').hidden = !p;
  $('#pl-ok').textContent = 'Zapisz plan';
  if (!$('#pl-picker').firstChild) $('#pl-picker').append(planPicker);
  $('#pl-picker').hidden = true;
  $('#pl-errors').textContent = '';
  renderPlanEdit();
  openDialog(PLAN);
}

function planSumText() {
  const sum = round2(planState.draft.items.reduce((x, i) => x + (Number(i.pct) || 0), 0));
  const el = $('#pl-sum');
  if (el) {
    el.textContent = `Suma udziałów: ${pctNum(sum)}%${Math.abs(sum - 100) > 0.011 ? ` – brakuje ${pctNum(round2(100 - sum))}%` : ' ✓'}`;
    el.className = Math.abs(sum - 100) > 0.011 ? 'warn' : 'pos';
  }
}

function renderPlanEdit() {
  const a = acc(planState.accountId);
  const d = planState.draft;
  const cur = a.currency || 'PLN';
  const r = d.recurring;
  const held = [...new Map((a.lots ?? []).filter((l) => !l.until && l.asset !== 'manual').map((l) => [l.asset, l])).values()].filter((l) => !d.items.some((i) => i.asset === l.asset));
  $('#pl-body').innerHTML = `<label class="field">Nazwa planu<input id="pl-name" maxlength="60" value="${esc(d.name)}" placeholder="np. Plan globalny"></label>
  <div class="ln-sec">Instrumenty i udziały (%)</div>
  <div id="pl-items">${d.items.map((i, k) => `<div class="plan-item"><span><b>${esc(planItemLabel(i))}</b> <span class="muted">${esc(String(i.asset).startsWith(FUND_PREFIX) ? '' : i.name ?? '')}</span></span><input data-pl-pct="${k}" inputmode="decimal" value="${esc(fmtInput(i.pct))}" aria-label="Udział ${esc(planItemLabel(i))} w procentach"><button type="button" class="link small danger-text" data-pl-del="${k}">usuń</button></div>`).join('') || '<p class="small muted">Dodaj instrumenty poniżej.</p>'}</div>
  <p class="small"><span id="pl-sum"></span>${d.items.length > 1 ? ' · <button type="button" class="link small" data-pl-even="1">rozłóż po równo</button>' : ''}</p>
  ${held.length ? `<label class="field">Dodaj z aktywów tego konta<select id="pl-add-held"><option value="">— wybierz —</option>${held.map((l) => `<option value="${esc(l.asset)}">${esc(lotLabel(l))}</option>`).join('')}</select></label>` : ''}
  <div class="row-btns"><button type="button" class="btn small" data-pl-xtb="1">+ Instrument z XTB</button><button type="button" class="btn small" data-pl-fund="1">+ Fundusz ING TFI</button></div>
  <div id="pl-fund" class="ld-fund" hidden><label class="field">Fundusz<select id="plf-fund"></select></label><label class="field">Kategoria jednostek<select id="plf-cat"></select></label><button type="button" class="btn small primary" data-plf-ok="1">Dodaj fundusz</button></div>
  <div class="ln-sec">Wpłata cykliczna</div>
  <label class="check small"><input type="checkbox" id="pl-rec" ${r ? 'checked' : ''}> <span>Co miesiąc wpłacam stałą kwotę (np. zlecenie stałe do XTB albo składka do PPE)</span></label>
  <div id="pl-rec-box" ${r ? '' : 'hidden'}>
    <div class="two"><label class="field">Kwota (${esc(curLabel(cur))})<input id="pl-rec-amount" inputmode="decimal" value="${esc(fmtInput(r?.amount))}"></label><label class="field">Dzień miesiąca<input id="pl-rec-day" inputmode="numeric" value="${esc(r?.day ?? '')}" placeholder="np. 10"></label></div>
    <label class="field">Najbliższa wpłata<input type="date" id="pl-rec-next" value="${esc(r?.nextDate ?? '')}"></label>
    <label class="field">Skąd pieniądze<select id="pl-rec-from">${planFromOptions(a, r?.fromId ?? defaultPlanFrom(a))}</select></label>
    <label class="check small"><input type="checkbox" id="pl-rec-auto" ${!r || r.auto ? 'checked' : ''}> <span>Kupuj automatycznie w dniu wpłaty (po cenach z tego dnia). Bez zaznaczenia aplikacja poprosi o potwierdzenie kwoty.</span></label>
  </div>
  <p class="small muted">Wpłata do planu dzieli kwotę według udziałów i kupuje jednostki po cenach z dnia wpłaty. Plan nie zmienia aktywów, które już masz.</p>`;
  planSumText();
}

function fillPlanFunds() {
  const fSel = $('#plf-fund');
  if (!fundsData?.funds?.length) {
    fSel.innerHTML = '<option value="">Brak danych – pojawią się po aktualizacji aplikacji</option>';
    return;
  }
  const sorted = [...fundsData.funds].sort((x, y) => FUND_TYPE_ORDER.indexOf(x.type) - FUND_TYPE_ORDER.indexOf(y.type) || x.name.localeCompare(y.name, 'pl'));
  fSel.innerHTML = sorted.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  fillPlanCats();
}
function fillPlanCats() {
  const f = fundsData?.funds?.find((x) => x.id === Number($('#plf-fund').value));
  if (!f) return;
  const pref = acc(planState.accountId)?.fundCategory;
  const def = fundDefaultCategory(f, pref);
  $('#plf-cat').innerHTML = f.cats.map((c) => `<option value="${esc(c)}" ${c === def ? 'selected' : ''}>${esc(c)} – ${esc(fundsData.categories?.[c] ?? '')}</option>`).join('');
}

async function openPlanPay(accountId, planId, due = null) {
  const a = acc(accountId);
  const p = a?.plans?.find((x) => x.id === planId);
  if (!p) return;
  await ensurePlanAssets(p.items);
  const date = due || today();
  planState = { mode: 'pay', accountId, planId, due, date, amount: p.recurring?.amount ?? 0, fromId: p.recurring?.fromId ?? defaultPlanFrom(a), prices: {}, edited: {} };
  for (const i of p.items) planState.prices[i.asset] = marketPriceAt(MARKET, a, i.asset, date);
  $('#pl-title').textContent = `Wpłata do planu „${p.name}”`;
  $('#pl-delete').hidden = true;
  $('#pl-ok').textContent = 'Kup według planu';
  $('#pl-picker').hidden = true;
  $('#pl-errors').textContent = '';
  renderPlanPay();
  openDialog(PLAN);
}

function renderPlanPay() {
  const s = planState;
  const a = acc(s.accountId);
  const p = a.plans.find((x) => x.id === s.planId);
  const cur = a.currency || 'PLN';
  $('#pl-body').innerHTML = `<p class="small">${esc(p.items.map((i) => `${planItemLabel(i)} ${pctNum(i.pct)}%`).join(' · '))}</p>
  <div class="two"><label class="field">Kwota wpłaty (${esc(curLabel(cur))})<input id="pp-amount" inputmode="decimal" value="${esc(fmtInput(s.amount))}" placeholder="np. 1000"></label><label class="field">Data<input type="date" id="pp-date" value="${esc(s.date)}"></label></div>
  <label class="field">Skąd pieniądze<select id="pp-from">${planFromOptions(a, s.fromId)}</select></label>
  <div class="sched-wrap"><table class="sched pp-tbl"><thead><tr><th>Instrument</th><th>Kwota</th><th>Cena</th><th>Jednostki</th></tr></thead><tbody>${p.items.map((i) => `<tr><td>${esc(planItemLabel(i))}<br><span class="muted">${esc(pctNum(i.pct))}%</span></td><td data-pp-amt="${esc(i.asset)}"></td><td><input data-pp-price="${esc(i.asset)}" inputmode="decimal" value="${esc(fmtInput(s.prices[i.asset]))}" placeholder="cena"><br><span class="muted">${esc(curLabel(i.currency))}</span></td><td data-pp-qty="${esc(i.asset)}"></td></tr>`).join('')}</tbody></table></div>
  <p class="small muted">Ceny z dnia wpłaty: dla funduszy ING TFI i akcji z GPW – z notowań, dla ETF-ów z Xetry czy Londynu – szacunek według indeksu od ostatniego kursu, który wpisałeś. Popraw je według potwierdzenia z XTB albo ING, jeśli się różnią.</p>`;
  updatePlanPay();
}

function updatePlanPay() {
  const s = planState;
  const a = acc(s.accountId);
  const p = a.plans.find((x) => x.id === s.planId);
  const cur = a.currency || 'PLN';
  for (const part of planSplit(p, s.amount || 0)) {
    const price = s.prices[part.asset];
    const amtAsset = convert(MARKET, part.amount, cur, part.currency || 'PLN', s.date);
    const amtEl = $(`[data-pp-amt="${CSS.escape(part.asset)}"]`, PLAN);
    const qtyEl = $(`[data-pp-qty="${CSS.escape(part.asset)}"]`, PLAN);
    if (amtEl) amtEl.textContent = money(part.amount, cur);
    if (qtyEl) qtyEl.textContent = price > 0 && amtAsset !== null ? fmtQty(Math.round((amtAsset / price) * 1e4) / 1e4) || '0' : '–';
  }
}

PLAN.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!planState) return;
  if (planState.mode === 'edit') {
    if (el.id === 'pl-name') planState.draft.name = el.value;
    else if (el.dataset.plPct !== undefined) {
      planState.draft.items[Number(el.dataset.plPct)].pct = Math.abs(parseAmount(el.value)) || 0;
      planSumText();
    }
    return;
  }
  if (el.id === 'pp-amount') planState.amount = Math.abs(parseAmount(el.value)) || 0;
  else if (el.dataset.ppPrice) {
    planState.prices[el.dataset.ppPrice] = Math.abs(parseAmount(el.value)) || null;
    planState.edited[el.dataset.ppPrice] = true;
  } else return;
  updatePlanPay();
});

PLAN.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (!planState) return;
  if (planState.mode === 'edit') {
    if (el.id === 'pl-add-held' && el.value) {
      const l = (acc(planState.accountId).lots ?? []).find((x) => x.asset === el.value);
      if (l) addPlanItem({ asset: l.asset, name: l.name, currency: lotCurrency(MARKET, l) });
    } else if (el.id === 'pl-rec') {
      $('#pl-rec-box').hidden = !el.checked;
      if (el.checked && !$('#pl-rec-next').value) {
        const day = Number($('#pl-rec-day').value) || Number(today().slice(8, 10));
        const thisMonth = shiftMonthsKeepDay(`${today().slice(0, 8)}01`, 0, day);
        $('#pl-rec-next').value = thisMonth >= today() ? thisMonth : nextPlanDate(thisMonth, day);
        if (!$('#pl-rec-day').value) $('#pl-rec-day').value = String(day);
      }
    } else if (el.id === 'plf-fund') fillPlanCats();
    return;
  }
  if (el.id === 'pp-date') {
    planState.date = el.value || today();
    const a = acc(planState.accountId);
    for (const i of a.plans.find((x) => x.id === planState.planId).items) {
      if (planState.edited[i.asset]) continue;
      planState.prices[i.asset] = marketPriceAt(MARKET, a, i.asset, planState.date);
      const inp = $(`[data-pp-price="${CSS.escape(i.asset)}"]`, PLAN);
      if (inp) inp.value = fmtInput(planState.prices[i.asset]);
    }
    updatePlanPay();
  } else if (el.id === 'pp-from') planState.fromId = el.value;
});

PLAN.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b || !planState || planState.mode !== 'edit') return;
  const d = planState.draft;
  if (b.dataset.plDel !== undefined) {
    d.items.splice(Number(b.dataset.plDel), 1);
    renderPlanEdit();
  } else if (b.dataset.plEven) {
    let left = 100;
    d.items.forEach((i, k) => {
      i.pct = k === d.items.length - 1 ? round2(left) : Math.floor((100 / d.items.length) * 100) / 100;
      left -= i.pct;
    });
    renderPlanEdit();
  } else if (b.dataset.plXtb) {
    $('#pl-fund').hidden = true;
    $('#pl-picker').hidden = !$('#pl-picker').hidden;
    if (!$('#pl-picker').hidden) planPicker.focusInput();
  } else if (b.dataset.plFund) {
    $('#pl-picker').hidden = true;
    const box = $('#pl-fund');
    box.hidden = !box.hidden;
    if (!box.hidden) {
      fundsData = fundsData ?? (await instLoadFunds());
      fillPlanFunds();
    }
  } else if (b.dataset.plfOk) {
    const f = fundsData?.funds?.find((x) => x.id === Number($('#plf-fund').value));
    const cat = $('#plf-cat').value;
    if (!f || !cat) return;
    const symbol = fundSymbol(f.id, cat);
    addLibraryAsset(symbol, f.name, f.currency);
    addPlanItem({ asset: symbol, name: f.name, currency: f.currency });
  }
});

$('#pl-delete').addEventListener('click', async () => {
  const s = planState;
  const a = acc(s?.accountId);
  if (!a || !s.planId) return;
  closeDialog(PLAN);
  const res = await confirmAction({ title: `Usunąć plan „${s.draft.name}”?`, body: '<p class="small">Aktywa kupione w planie zostaną na koncie – usuwasz tylko plan (udziały i wpłatę cykliczną).</p>', ok: 'Usuń plan' });
  if (!res) return;
  undoable('Usunięto plan.', () => {
    a.plans = (a.plans ?? []).filter((p) => p.id !== s.planId);
    if (!a.plans.length) delete a.plans;
  });
});

planForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const s = planState;
  const a = acc(s?.accountId);
  if (!a) return;
  const err = (list) => ($('#pl-errors').textContent = list.join(' '));
  if (s.mode === 'edit') {
    const d = s.draft;
    d.name = d.name.trim();
    if ($('#pl-rec').checked) {
      const nextDate = $('#pl-rec-next').value;
      d.recurring = { amount: Math.abs(parseAmount($('#pl-rec-amount').value)) || 0, day: Math.round(Number($('#pl-rec-day').value)) || Number(nextDate.slice(8, 10)) || 0, fromId: $('#pl-rec-from').value || null, auto: $('#pl-rec-auto').checked, nextDate };
    } else d.recurring = null;
    const errors = validatePlan(d, fin);
    if (errors.length) return err(errors);
    closeDialog(PLAN);
    undoable(s.planId ? 'Zapisano plan.' : `Dodano plan „${d.name}”. Wpłatę zrobisz przyciskiem „Wpłać do planu”.`, () => {
      a.plans = s.planId ? a.plans.map((p) => (p.id === s.planId ? d : p)) : [...(a.plans ?? []), d];
    });
    runPlans();
    return;
  }
  const res = planDeposit(fin, a.id, s.planId, { date: s.date, amount: s.amount, prices: s.prices, fromId: s.fromId, market: MARKET, newId });
  if (res.error) return err([res.error]);
  closeDialog(PLAN);
  const p = a.plans.find((x) => x.id === s.planId);
  undoable(`Kupiono w planie „${p.name}”: ${res.buys.map((x) => `${planItemLabel(x)} ${fmtQty(Math.round(x.qty * 1e4) / 1e4)}`).join(', ')}.`, () => {
    fin = res.fin;
    if (s.due && p.recurring?.nextDate === s.due) fin = advancePlan(fin, a.id, s.planId);
  });
});

// Wpłaty cykliczne z automatem: kupno po cenach z dnia wpłaty (gdy brakuje ceny – prośba o wpisanie w Przeglądzie).
let planBlocked = [];
async function runPlans() {
  const due = duePlanDeposits(fin, today()).filter((d) => d.plan.recurring.auto);
  if (!due.length) return;
  await ensurePlanAssets(due.flatMap((d) => d.plan.items)).catch(() => {});
  let posted = 0;
  planBlocked = [];
  for (const d of due) {
    for (let guard = 0; guard < 24; guard++) {
      const a = acc(d.accountId);
      const p = a?.plans?.find((x) => x.id === d.planId);
      const r = p?.recurring;
      if (!r?.auto || r.nextDate > today()) break;
      const prices = Object.fromEntries(p.items.map((i) => [i.asset, marketPriceAt(MARKET, a, i.asset, r.nextDate)]));
      const res = planDeposit(fin, a.id, p.id, { date: r.nextDate, amount: r.amount, prices, fromId: r.fromId, market: MARKET, newId });
      if (res.error) {
        planBlocked.push(`${a.id}|${p.id}`);
        break;
      }
      fin = advancePlan(res.fin, a.id, p.id);
      posted++;
    }
  }
  if (posted) {
    save();
    toast(`Zapisano ${posted} ${plural(posted, 'wpłatę', 'wpłaty', 'wpłat')} do planów inwestycyjnych (kupno po cenach z dnia wpłaty).`, 6000);
  }
  if (posted || planBlocked.length) render();
}

// ---------- Szczegóły kredytu: koszty, oprocentowanie, nadpłata, symulacje, harmonogram ----------
const LOAN = $('#loan-dialog');
let loanView = { id: null, full: false };

function openLoan(id) {
  if (!isLoan(acc(id))) return;
  loanView = { id, full: false };
  $('#lv-errors').textContent = '';
  renderLoanView();
  openDialog(LOAN);
}

function loanSchedRow(r, L, cur, t, next) {
  const ins = Number(L.insurance) || 0;
  if (r.kind === 'nadplata') return `<tr class="op"><td>Nadpłata ${esc(shortDate(r.date, true))}</td><td>${esc(money(r.overpay, cur))}</td><td>${esc(money(r.overpay, cur))}</td><td>–</td><td>${esc(money(r.balance, cur))}</td></tr>`;
  const cls = [r.date <= t ? 'past' : '', next && r.n === next.n ? 'now' : ''].filter(Boolean).join(' ');
  return `<tr class="${cls}"><td>${r.n}. ${esc(shortDate(r.date, true))}</td><td>${esc(money(r.payment + ins, cur))}</td><td>${esc(money(r.principal, cur))}</td><td>${esc(money(r.interest, cur))}</td><td>${esc(money(r.balance, cur))}</td></tr>`;
}

function renderLoanView() {
  const a = acc(loanView.id);
  if (!isLoan(a)) return closeDialog(LOAN);
  const L = a.loan;
  const cur = a.currency || 'PLN';
  const t = today();
  const s = loanSummary(L, t);
  const ins = Number(L.insurance) || 0;
  const mny = (x) => money(x, cur);
  $('#lv-title').textContent = a.name;
  const facts = [
    ['Rodzaj', LOAN_KINDS[L.kind] ?? 'Kredyt'],
    ['Oprocentowanie teraz', `${loanRateText(L, s.rate)}${L.rateType === 'stale' ? ` – stałe${L.fixedUntil ? ` do ${shortDate(L.fixedUntil, true)}` : ''}` : L.rateType === 'zmienne' ? ' – zmienne' : ''}`],
    ['RRSO (szacunek)', s.apr !== null ? `${pctNum(s.apr * 100)}%` : '–'],
    ['Raty', `${L.installments === 'malejace' ? 'malejące' : 'równe'}${L.payment ? ` · rata wg banku ${mny(L.payment)}` : ''}${L.grace ? ` · karencja ${L.grace} mies.` : ''}`],
    ['Rat do końca', `${s.left} z ${s.count}${s.end ? ` · koniec ${monthYear(s.end)}` : ''}`],
    [`Odsetki zapłacone${L.existing ? ` (od ${shortDate(L.start, true)})` : ''}`, mny(s.paidInterest)],
    ['Odsetki do końca', mny(s.futureInterest)],
    ['Prowizja', L.fee ? `${mny(L.fee)}${L.feeFinanced ? ' (doliczona do kredytu)' : ''}` : '–'],
    ['Ubezpieczenie i opłaty', ins ? `${mny(ins)} miesięcznie · razem ${mny(s.insuranceTotal)}` : '–'],
    ['Całkowity koszt kredytu', `${mny(s.totalCost)} (odsetki, prowizja i opłaty${L.existing ? ' od stanu na dziś' : ''})`],
    ['Nadpłacono', s.overpaid ? mny(s.overpaid) : '–'],
    ['Spłata', L.payFromId ? `z konta ${accName(L.payFromId)}${L.autoPost ? ' · raty zapisują się same' : ''}` : 'konto spłaty nie jest wybrane'],
  ];
  const rates = [...(L.rates ?? [])].sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const sims = L.rateType === 'zero' || !s.next ? '' : [-1, 1, 2].map((d) => {
    const r = loanRateSim(L, d, t);
    return r ? `${d > 0 ? '+' : '−'}${Math.abs(d)} pp: rata <b>${esc(mny(r.payment + ins))}</b> (${r.diff >= 0 ? '+' : '−'}${esc(mny(Math.abs(r.diff)))})` : '';
  }).filter(Boolean).join(' · ');
  const pStart = loanPeriodStart(L, t);
  const rateBox = `<div class="lv-box"><h4>Oprocentowanie</h4>
    ${rates.length ? `<ul class="rate-list">${rates.map(([d, v], i) => `<li><span>od ${esc(shortDate(d, true))}</span><span><b>${esc(pctNum(v))}%</b>${i > 0 ? ` <button type="button" class="link small danger-text" data-lv-rate-del="${i}">usuń</button>` : ''}</span></li>`).join('')}</ul>` : ''}
    ${L.rateType === 'zero' ? '<p class="small muted">Kredyt 0% – bez odsetek.</p>' : `<div class="two"><label class="field">Od dnia<input type="date" id="lv-rate-date" value="${esc(pStart)}"></label><label class="field">${L.rateType === 'zmienne' ? `Nowa stawka ${esc(L.refName || 'referencyjna')} (%)` : 'Nowe oprocentowanie (%)'}<input id="lv-rate" inputmode="decimal" placeholder="${esc(pctNum(L.rateType === 'zmienne' && Number.isFinite(L.margin) ? s.rate - L.margin : s.rate))}"></label></div>
    <p class="small muted">${L.rateType === 'zmienne' && Number.isFinite(L.margin) ? `Oprocentowanie = stawka + marża ${esc(pctNum(L.margin))}%. ` : ''}Nowa stopa obowiązuje od pierwszej raty po tym dniu (bank ustala ją na początku okresu odsetkowego).</p>
    <button type="button" class="btn small" data-lv="rate">Zapisz zmianę oprocentowania</button>
    ${sims ? `<p class="small">Gdyby oprocentowanie się zmieniło: ${sims}</p>` : ''}`}</div>`;
  const ops = [...(L.overpayments ?? [])].sort((x, y) => (x.date < y.date ? -1 : 1));
  const opBox = `<div class="lv-box"><h4>Nadpłata</h4>
    <div class="two"><label class="field">Kwota (${esc(curLabel(cur))})<input id="lv-op-amount" inputmode="decimal" placeholder="np. 10 000"></label><label class="field">Data<input type="date" id="lv-op-date" value="${esc(t)}"></label></div>
    <div class="typesel" role="radiogroup" aria-label="Efekt nadpłaty"><label><input type="radio" name="lvOpMode" value="okres" checked><span>Skróć okres</span></label><label><input type="radio" name="lvOpMode" value="rata"><span>Zmniejsz ratę</span></label></div>
    <label class="field">Z konta<select id="lv-op-from">${accountOptions(L.payFromId ?? defaultAccount('przelew'), { none: false, filter: (x) => !isLoan(x) && x.id !== a.id })}</select></label>
    <p class="dlg-hint" id="lv-op-sim">Wpisz kwotę, a pokażę, ile zaoszczędzisz na odsetkach.</p>
    <button type="button" class="btn small primary" data-lv="overpay">Zapisz nadpłatę</button>
    ${ops.length ? `<ul class="rate-list">${ops.map((o) => `<li><span>${esc(shortDate(o.date, true))} · ${o.mode === 'rata' ? 'niższa rata' : 'krótszy okres'}</span><span><b>${esc(mny(o.amount))}</b> <button type="button" class="link small danger-text" data-lv-op-del="${esc(o.id)}">usuń</button></span></li>`).join('')}</ul>` : ''}
    <p class="small muted">W Polsce nadpłata kredytu hipotecznego ze zmienną stopą jest bezpłatna po 3 latach od zawarcia umowy; wcześniej bank może pobrać prowizję (sprawdź umowę).</p></div>`;
  const rows = s.rows;
  const nextIdx = s.next ? rows.indexOf(s.next) : rows.length;
  const shown = loanView.full ? rows : rows.slice(Math.max(0, nextIdx - 3), nextIdx + 12);
  const sched = `<div class="lv-box"><h4>Harmonogram</h4><div class="sched-wrap"><table class="sched"><thead><tr><th>Nr i data</th><th>Rata</th><th>Kapitał</th><th>Odsetki</th><th>Saldo</th></tr></thead><tbody>${shown.map((r) => loanSchedRow(r, L, cur, t, s.next)).join('')}</tbody></table></div>
    <button type="button" class="link small" data-lv="full">${loanView.full ? 'Pokaż mniej' : `Pokaż cały harmonogram (${s.count} rat)`}</button>
    <p class="small muted">Harmonogram przybliżony: odsetki = saldo × oprocentowanie / 12. Bank liczy według dni, więc kwoty mogą różnić się o kilka złotych – ratę z harmonogramu banku wpiszesz w „Edytuj parametry”.</p></div>`;
  $('#lv-body').innerHTML = `<div class="loan-kpi"><div><span>Zostało do spłaty</span><b class="neg">${esc(mny(s.remaining))}</b><small>z ${esc(mny(s.original))}</small></div><div><span>Spłacono</span><b class="pos">${esc(pct1(s.progress))}</b><small>${esc(mny(s.paidPrincipal))} kapitału</small></div><div><span>Najbliższa rata</span><b>${s.next ? esc(mny(s.next.payment + ins)) : '–'}</b><small>${s.next ? esc(shortDate(s.next.date, true)) : 'kredyt spłacony'}</small></div></div>
  <div class="meter" title="Spłacony kapitał"><span style="width:${(s.progress * 100).toFixed(1)}%;background:var(--pos)"></span></div>
  <table class="kv">${facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  ${rateBox}${opBox}${sched}`;
}

function loanOverpaySimText() {
  const a = acc(loanView.id);
  if (!isLoan(a)) return;
  const amount = Math.abs(parseAmount($('#lv-op-amount').value));
  const el = $('#lv-op-sim');
  if (!(amount > 0)) {
    el.textContent = 'Wpisz kwotę, a pokażę, ile zaoszczędzisz na odsetkach.';
    return;
  }
  const mode = $('input[name="lvOpMode"]:checked', LOAN)?.value ?? 'okres';
  const cur = a.currency || 'PLN';
  const r = loanOverpaySim(a.loan, { amount, date: $('#lv-op-date').value || today(), mode });
  const ins = Number(a.loan.insurance) || 0;
  el.innerHTML =
    mode === 'rata'
      ? `Rata spadnie z ${esc(money(r.paymentBefore + ins, cur))} do <b>${esc(money(r.paymentAfter + ins, cur))}</b>. Oszczędność na odsetkach: <b class="pos">${esc(money(r.interestSaved, cur))}</b>.`
      : `Kredyt skończy się <b>${r.monthsShorter} ${plural(r.monthsShorter, 'miesiąc', 'miesiące', 'miesięcy')}</b> wcześniej (${esc(monthYear(r.endAfter))} zamiast ${esc(monthYear(r.endBefore))}). Oszczędność na odsetkach: <b class="pos">${esc(money(r.interestSaved, cur))}</b>.`;
}

LOAN.addEventListener('input', (ev) => ['lv-op-amount', 'lv-op-date'].includes(ev.target.id) && loanOverpaySimText());
LOAN.addEventListener('change', (ev) => (ev.target.name === 'lvOpMode' || ev.target.id === 'lv-op-date') && loanOverpaySimText());
$('#lv-edit').addEventListener('click', () => {
  closeDialog(LOAN);
  openAccount(loanView.id);
});
LOAN.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const a = acc(loanView.id);
  if (!isLoan(a)) return;
  const L = a.loan;
  const err = (msg) => ($('#lv-errors').textContent = msg);
  if (b.dataset.lv === 'full') {
    loanView.full = !loanView.full;
    return renderLoanView();
  }
  if (b.dataset.lv === 'rate') {
    const date = $('#lv-rate-date').value;
    const v = parseAmount($('#lv-rate').value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(v)) return err('Podaj datę i nowe oprocentowanie.');
    const rate = round4(L.rateType === 'zmienne' && Number.isFinite(L.margin) ? v + L.margin : v);
    if (!(rate >= 0 && rate < 100)) return err('Oprocentowanie musi być między 0 a 100%.');
    undoable(`Zapisano oprocentowanie ${pctNum(rate)}% od ${shortDate(date, true)}.`, () => {
      L.rates = [...(L.rates ?? []).filter((r) => r[0] !== date), [date, rate]];
    });
    return renderLoanView();
  }
  if (b.dataset.lvRateDel) {
    const sorted = [...(L.rates ?? [])].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const del = sorted[Number(b.dataset.lvRateDel)];
    undoable('Usunięto zmianę oprocentowania.', () => {
      L.rates = sorted.filter((r) => r !== del);
    });
    return renderLoanView();
  }
  if (b.dataset.lv === 'overpay') {
    const amount = round2(Math.abs(parseAmount($('#lv-op-amount').value)));
    const date = $('#lv-op-date').value;
    const fromId = $('#lv-op-from').value;
    const mode = $('input[name="lvOpMode"]:checked', LOAN)?.value ?? 'okres';
    if (!(amount > 0)) return err('Podaj kwotę nadpłaty.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('Podaj datę nadpłaty.');
    if (!fromId) return err('Wybierz konto, z którego nadpłacasz.');
    const remaining = loanBalanceAt(L, loanSchedule(L), date);
    if (amount > remaining + 0.005) return err(`Do spłaty zostało ${money(remaining, a.currency)} – nadpłata nie może być większa.`);
    const fromCur = accountCurrency(fin, fromId);
    const loanCur = a.currency || 'PLN';
    const pln = convert(MARKET, amount, loanCur, 'PLN', date);
    const fromAmt = convert(MARKET, amount, loanCur, fromCur, date);
    if (pln === null || fromAmt === null) return err('Brak kursu waluty – nie mogę przeliczyć kwoty.');
    const tx = { id: newId(), type: 'przelew', amount: pln, date, accountId: fromId, toAccountId: a.id, merchant: `${a.name}: nadpłata`, source: 'kredyt', loanId: a.id, overpay: true, createdAt: Date.now(), updatedAt: Date.now() };
    if (fromCur !== 'PLN') tx.accountAmount = fromAmt;
    if (loanCur !== fromCur) tx.toAmount = amount;
    undoable(`Zapisano nadpłatę ${money(amount, a.currency)}.`, () => {
      fin.txs.push(tx);
      L.overpayments = [...(L.overpayments ?? []), { id: newId(), date, amount, mode, txId: tx.id }];
    });
    return renderLoanView();
  }
  if (b.dataset.lvOpDel) {
    const op = (L.overpayments ?? []).find((o) => o.id === b.dataset.lvOpDel);
    if (!op) return;
    undoable('Usunięto nadpłatę (razem z przelewem w dzienniku).', () => {
      L.overpayments = L.overpayments.filter((o) => o.id !== op.id);
      const tx = fin.txs.find((x) => x.id === op.txId);
      if (tx) Object.assign(tx, { deleted: true, updatedAt: Date.now() });
    });
    return renderLoanView();
  }
});

// Saldo kredytu w dzienniku = −kapitał z harmonogramu na dziś (korekta salda z dzisiejszą datą).
function syncLoanBalance(id) {
  const a = acc(id);
  if (!isLoan(a)) return;
  const target = -loanBalanceAt(a.loan, loanSchedule(a.loan), today());
  undoable('Saldo kredytu ustawione według harmonogramu.', () => {
    adjustBalance(fin, id, target, { date: today(), newId, market: MARKET, note: 'Wyrównanie do harmonogramu kredytu' });
  });
}

// Wpłaty z portfela GEM, których nie ma w dzienniku → przelewy między kontami (i powiązanie w obu miejscach).
function linkGemTxs(accountId) {
  const a = acc(accountId);
  const otherId = $(`[data-gem-from="${accountId}"]`)?.value;
  if (!a || !otherId) return toast('Wybierz konto, z którego były wpłaty.');
  const gemTxs = gemTxsLoad();
  const list = unlinkedGemTxs(fin, gemTxs, a);
  if (!list.length) return;
  const now = Date.now();
  undoable(`Zapisano ${list.length} ${plural(list.length, 'przelew', 'przelewy', 'przelewów')} z portfela GEM.`, () => {
    for (const g of list) {
      const t = { id: newId(), type: 'przelew', amount: round2(g.amountPLN), date: g.date, accountId: g.type === 'wplata' ? otherId : a.id, toAccountId: g.type === 'wplata' ? a.id : otherId, merchant: `${g.type === 'wplata' ? 'Wpłata na' : 'Wypłata z'} ${a.gemAccount === 'ZWYKLE' ? 'konto inwestycyjne' : a.gemAccount}`, source: 'gem', gemTxId: g.id, createdAt: now, updatedAt: now };
      const fromCur = accountCurrency(fin, t.accountId);
      const toCur = accountCurrency(fin, t.toAccountId);
      if (fromCur !== 'PLN') t.accountAmount = convert(MARKET, t.amount, 'PLN', fromCur, t.date) ?? t.amount;
      if (toCur !== fromCur) t.toAmount = convert(MARKET, t.amount, 'PLN', toCur, t.date) ?? t.amount;
      fin.txs.push(t);
      g.finTxId = t.id;
      g.updatedAt = now;
    }
    gemTxsSave(gemTxs);
  }, { gem: true });
}

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
  $('#rd-amount-label').textContent = `Kwota (${curLabel(accountCurrency(fin, f.elements.accountId.value))})`;
  const next = f.elements.nextDate.value;
  const late = next && next <= today();
  $('#rd-hint').textContent = f.elements.auto.checked
    ? late
      ? 'Termin już minął: zaległe operacje od tej daty zapiszą się od razu po zapisaniu.'
      : 'Operacja zapisze się sama w dniu terminu (przy otwarciu aplikacji).'
    : 'W dniu terminu zobaczysz prośbę o zatwierdzenie i będzie można zmienić kwotę (np. rachunek za prąd).';
}

recForm.addEventListener('change', (ev) => ['type', 'auto', 'nextDate', 'accountId'].includes(ev.target.name) && syncRecForm());
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
$('#rd-delete').addEventListener('click', async () => {
  const r = fin.recurring.find((x) => x.id === recForm.dataset.id);
  if (!r) return;
  closeDialog(REC);
  const res = await confirmAction({ title: `Usunąć stałą pozycję „${r.title}”?`, body: '<p>Zapisane już operacje zostaną w historii. Znikną tylko przyszłe terminy.</p>', ok: 'Usuń stałą pozycję' });
  if (!res) return;
  undoable('Usunięto stałą pozycję.', () => {
    fin.recurring = fin.recurring.filter((x) => x.id !== r.id);
  });
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
  const sameCur = (a) => (a.currency || 'PLN') === (card.currency || 'PLN');
  const sources = activeAccounts().filter((a) => a.id !== cardId && !isCard(a) && sameCur(a));
  const def = sources.find((a) => a.id === card.payFromId)?.id ?? [...sources].sort((x, y) => bal[y.id] - bal[x.id])[0]?.id ?? '';
  f.dataset.card = cardId;
  f.dataset.debt = String(debt);
  $('#rp-title').textContent = `Spłata karty: ${card.name}`;
  $('#rp-debt').innerHTML = `Zadłużenie: <b class="neg">${esc(zl(debt))}</b>${card.limit ? ` · limit ${esc(zl0(card.limit))}` : ''}`;
  $('#rp-full').textContent = `Całe zadłużenie (${zl(debt)})`;
  f.elements.amount.value = fmtInput(debt);
  f.elements.fromId.innerHTML = accountOptions(def, { none: false, filter: (a) => a.id !== cardId && !isCard(a) && sameCur(a) });
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
    const r = mergeImported(fin, [localizeTx({ ...tx, card: p.get('karta') || undefined, time: when.time, source: 'applepay', importKey: `ap|${when.date}|${when.time ?? ''}|${amount.toFixed(2)}|${merchant.toLowerCase()}` })], { newId });
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
refreshLibraryAssets();
runPlans().catch(() => {});
handleHash();
scheduleDocCleanup(20000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
