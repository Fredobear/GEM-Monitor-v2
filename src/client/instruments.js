// Biblioteka instrumentów XTB w przeglądarce: wyszukiwarka w katalogu (data/katalog.js) i wycena z notowań
// (data/notowania.js). Oba pliki to zwykłe skrypty z tej samej domeny – działają też na stronie dziennika finansowego,
// która ma zablokowane wszystkie połączenia sieciowe (Content-Security-Policy: connect-src 'none'). Wczytanie pliku
// niczego nie wysyła: adres jest stały, bez żadnych danych użytkownika.

const INST_SCRIPTS = {};
export function instLoadScript(src, globalName) {
  if (typeof self !== 'undefined' && self[globalName]) return Promise.resolve(self[globalName]);
  if (typeof document === 'undefined') return Promise.resolve(null);
  INST_SCRIPTS[src] ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(self[globalName] ?? null);
    el.onerror = () => {
      delete INST_SCRIPTS[src];
      el.remove();
      resolve(null);
    };
    document.head.append(el);
  });
  return INST_SCRIPTS[src];
}
export const instLoadCatalog = () => instLoadScript('data/katalog.js', 'GEM_KATALOG');
export const instLoadQuotes = () => instLoadScript('data/notowania.js', 'GEM_NOTOWANIA');

// ---------- Fundusze ING TFI (PPE, PPK, IKE) – wyceny jednostek z pliku data/fundusze.js ----------
// Symbol pozycji: INGTFI:<id funduszu>:<kategoria jednostek>, np. INGTFI:1:E (ING Akcji, kategoria E dla PPE).
export const FUND_PREFIX = 'INGTFI:';
export const FUND_PPE_CATEGORIES = ['E', 'F', 'S', 'T', 'W'];
export const FUND_TYPE_ORDER = ['akcji', 'mieszany', 'obligacji', 'krótkoterminowy dłużny', 'cyklu życia', 'alternatywny', 'Emerytura (PPK)'];
export const instLoadFunds = () => instLoadScript('data/fundusze.js', 'GEM_FUNDUSZE');
export const fundSymbol = (id, cat) => `${FUND_PREFIX}${id}:${cat}`;
export const fundIdOf = (symbol) => Number(String(symbol ?? '').split(':')[1]);
export const fundCategoryOf = (symbol) => String(symbol ?? '').split(':')[2] ?? '';
export const fundInfo = (data, symbol) => data?.funds?.find((f) => f.id === fundIdOf(symbol)) ?? null;

/** Wyceny jednostki [[data, wartość], …] dla symbolu funduszu. */
export function fundQuotes(data, symbol) {
  const vals = data?.values?.[symbol];
  if (!vals) return [];
  const out = [];
  for (let i = 0; i < data.dates.length; i++) if (vals[i] !== null && vals[i] !== undefined) out.push([data.dates[i], vals[i]]);
  return out;
}

/** Wpis do wyceny (jak instEntry) dla funduszu albo null, gdy brak wycen. */
export function fundEntry(data, symbol) {
  const quotes = fundQuotes(data, symbol);
  if (!quotes.length) return null;
  return { currency: fundInfo(data, symbol)?.currency ?? 'PLN', quotes, series: [], source: 'tfi', proxy: null };
}

/** Domyślna kategoria jednostek: zapamiętana, potem pierwsza z kategorii PPE, potem A. */
export function fundDefaultCategory(fund, preferred = '') {
  const cats = fund?.cats ?? [];
  if (preferred && cats.includes(preferred)) return preferred;
  return FUND_PPE_CATEGORIES.find((c) => cats.includes(c)) ?? (cats.includes('A') ? 'A' : cats[0] ?? '');
}

const instEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const instFold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

/** Wiersz katalogu [symbol, nazwa, ISIN, waluta, typ, tylko-zamknięcie, proxy] → obiekt. */
export function instItem(row, catalog = null) {
  if (!row) return null;
  const market = row[0].slice(row[0].lastIndexOf('.') + 1);
  return {
    symbol: row[0],
    name: row[1],
    isin: row[2],
    currency: row[3],
    type: row[4],
    closeOnly: row[5] === 1,
    proxy: row[6] ?? null,
    market,
    marketName: catalog?.markets?.[market] ?? market,
  };
}

export function instFind(catalog, symbol) {
  const items = catalog?.items ?? [];
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = items[mid][0];
    if (s === symbol) return instItem(items[mid], catalog);
    if (s < symbol) lo = mid + 1;
    else hi = mid - 1;
  }
  return instItem(items.find((r) => r[0] === symbol), catalog);
}

/** Wyszukiwanie po symbolu, nazwie (wszystkie słowa) lub ISIN; najpierw trafienia dokładne i instrumenty z wyceną. */
export function instSearch(catalog, query, { limit = 25, type = '' } = {}) {
  const q = instFold(query).trim();
  if (!catalog?.items?.length || !q) return [];
  const words = q.split(/[\s,]+/).filter(Boolean);
  const hits = [];
  for (const row of catalog.items) {
    if (type && row[4] !== type) continue;
    const sym = row[0].toLowerCase();
    const base = sym.slice(0, sym.lastIndexOf('.'));
    let score;
    if (sym === q || base === q) score = 100;
    else if (row[2].toLowerCase() === q) score = 98;
    else if (sym.startsWith(q)) score = 85 - Math.min(10, sym.length - q.length);
    else {
      const name = ` ${instFold(row[1])}`;
      if (!words.every((w) => name.includes(w) || sym.includes(w))) continue;
      score = 40 + words.filter((w) => name.includes(` ${w}`)).length * 8;
    }
    if (row[5] === 1) score -= 30;
    if (row[0].endsWith('.PL') || row[6]) score += 4;
    hits.push([score, row]);
  }
  hits.sort((a, b) => b[0] - a[0] || a[1][0].length - b[1][0].length || (a[1][0] < b[1][0] ? -1 : 1));
  return hits.slice(0, limit).map(([, row]) => instItem(row, catalog));
}

// Ostatnia para [data, wartość] z datą ≤ date (pary posortowane rosnąco).
function instAt(pairs, date) {
  let lo = 0;
  let hi = (pairs?.length ?? 0) - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid][0] <= date) {
      found = pairs[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Notowania ETF-u-proxy (USD) przeliczone na walutę instrumentu; klasy zabezpieczone walutowo – bez przeliczenia. */
export function instProxySeries(data, proxy, currency, fx) {
  if (!proxy) return [];
  const [code, hedged] = proxy.split(':');
  const pairs = data?.proxies?.[code] ?? [];
  if (!pairs.length || hedged || currency === 'USD') return pairs;
  const usd = fx?.USD ?? [];
  const other = currency === 'PLN' ? null : fx?.[currency] ?? [];
  if (!usd.length || (other && !other.length)) return [];
  const out = [];
  for (const [d, v] of pairs) {
    const u = instAt(usd, d);
    const o = other ? instAt(other, d) : [d, 1];
    if (u && o) out.push([d, (v * u[1]) / o[1]]);
  }
  return out;
}

/** Wpis do wyceny jak w prices.instruments: { currency, quotes, series, source, proxy } albo null (wycena ręczna). */
export function instEntry(data, symbol, currency, fx) {
  if (!data || !symbol) return null;
  const quotes = data.quotes?.[symbol] ?? [];
  const proxy = data.proxyOf?.[symbol] ?? null;
  const series = instProxySeries(data, proxy, currency, fx);
  if (!quotes.length && !series.length) return null;
  return { currency, quotes, series, source: quotes.length ? data.src?.[symbol] ?? 'gpw' : 'proxy', proxy };
}

const instDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

/** Opis źródła ceny dla wpisu z instEntry (albo null – brak notowań). */
export function instSourceLabel(entry, data) {
  if (!entry) return 'wycena ręczna – brak darmowych notowań';
  const last = entry.quotes?.at(-1)?.[0];
  if (entry.source === 'gpw') return `kurs zamknięcia z GPW${last ? ` (${instDate(last)})` : ''}`;
  if (entry.source === 'nc') return `kurs z NewConnect${last ? ` (${instDate(last)})` : ''}`;
  if (entry.source === 'tiingo') return `kurs zamknięcia z giełdy w USA${last ? ` (${instDate(last)})` : ''}`;
  if (entry.source === 'tfi') return `wycena jednostki z ING TFI${last ? ` (${instDate(last)})` : ''}`;
  const [code, hedged] = String(entry.proxy ?? '').split(':');
  return `wycena przybliżona: od ceny zakupu według zmiany indeksu ${data?.proxyNames?.[code] ?? code} (ETF ${code})${hedged ? ', klasa zabezpieczona walutowo' : ''}`;
}

/** Czego się spodziewać po instrumencie z katalogu (zanim powstanie pozycja). */
export function instExpectedSource(item, data, fx = null) {
  if (!item) return '';
  const entry = instEntry(data, item.symbol, item.currency, fx);
  if (entry) return instSourceLabel(entry, data);
  if (item.market === 'PL') return 'kurs z GPW – pojawi się po najbliższej aktualizacji (dni robocze)';
  if (item.proxy) {
    const [code] = item.proxy.split(':');
    return `wycena przybliżona według indeksu ${data?.proxyNames?.[code] ?? code}`;
  }
  if (item.market === 'US') return 'dopisz symbol do listy obserwowanych, aby codziennie pobierać kurs (Tiingo); do tego czasu wycena ręczna';
  return 'brak darmowych notowań – wycena ręczna (aktualizuj cenę od czasu do czasu)';
}

/** Ostatnia znana cena instrumentu w jego walucie: [data, cena] albo null. */
export function instLastPrice(entry) {
  return entry?.quotes?.length ? entry.quotes[entry.quotes.length - 1] : null;
}

/** Ostrzeżenie dla notowań z Londynu, które bywają podawane w pensach. */
export function instPenceHint(item) {
  if (!item || item.market !== 'UK' || item.currency !== 'GBP') return '';
  return /GBp/.test(item.name)
    ? 'Ten fundusz jest notowany w Londynie w pensach (GBp). Jeśli XTB pokazuje cenę w pensach (np. 15 520), wpisz ją w funtach (155,20).'
    : 'Na giełdzie w Londynie ceny bywają podawane w pensach (100 pensów = 1 GBP) – wpisz cenę w funtach.';
}

/**
 * Wyszukiwarka instrumentów: pole + lista wyników. onPick(item) po wyborze.
 * extra(): opcjonalne pozycje pokazywane przy pustym polu (np. ETF-y strategii GEM) – [{ symbol, name, currency }].
 */
export function instPicker({ onPick, type = '', placeholder = 'Szukaj: nazwa, symbol albo ISIN', extra = null, autofocus = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'inst-picker';
  wrap.innerHTML = `<input type="search" class="inst-q" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="${instEsc(placeholder)}" aria-label="Szukaj instrumentu"><div class="inst-results" role="listbox"></div><p class="small muted inst-status" aria-live="polite"></p>`;
  const input = wrap.querySelector('.inst-q');
  const list = wrap.querySelector('.inst-results');
  const status = wrap.querySelector('.inst-status');
  let catalog = null;
  let items = [];
  let timer = null;
  const row = (it) =>
    `<button type="button" role="option" class="inst-opt" data-sym="${instEsc(it.symbol)}"><span class="inst-sym">${instEsc(it.symbol)}</span><span class="inst-name">${instEsc(it.name)}</span><span class="inst-meta">${instEsc([it.marketName, it.currency, it.type === 'E' ? 'ETF/ETC' : it.type === 'A' ? 'akcje' : '', it.closeOnly ? 'tylko zamknięcie pozycji' : it.market === 'PL' ? 'kurs z GPW' : it.proxy ? 'wycena wg indeksu' : ''].filter(Boolean).join(' · '))}</span></button>`;
  const showExtra = () => {
    const base = typeof extra === 'function' ? extra() : extra;
    items = (base ?? []).map((e) => ({ ...(instFind(catalog, e.symbol) ?? {}), ...e }));
    list.innerHTML = items.length ? `<p class="small muted inst-head">ETF-y strategii GEM</p>${items.map(row).join('')}` : '';
    status.textContent = catalog ? `Katalog XTB: ${catalog.items.length.toLocaleString('pl-PL')} akcji i ETF-ów${catalog.obowiazujeOd ? ` (tabela XTB z ${instDate(catalog.obowiazujeOd)})` : ''}.` : '';
  };
  const search = async () => {
    const q = input.value.trim();
    if (!catalog) {
      status.textContent = 'Wczytuję katalog instrumentów XTB…';
      catalog = await instLoadCatalog();
      if (!catalog) {
        status.textContent = 'Nie udało się wczytać katalogu (brak internetu przy pierwszym użyciu?). Spróbuj ponownie później.';
        return;
      }
    }
    if (!q) return showExtra();
    items = instSearch(catalog, q, { type });
    list.innerHTML = items.map(row).join('');
    status.textContent = items.length ? (items.length >= 25 ? 'Pokazuję 25 najlepszych wyników – doprecyzuj nazwę albo wpisz symbol.' : '') : 'Brak wyników. Spróbuj symbolu (np. CDR, VWCE), ISIN albo innej części nazwy.';
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 140);
  });
  input.addEventListener('focus', () => !input.value && search(), { once: true });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (items.length === 1) list.querySelector('.inst-opt')?.click();
    }
  });
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('.inst-opt');
    if (!b) return;
    const it = items.find((x) => x.symbol === b.dataset.sym);
    if (it) onPick?.(it);
  });
  wrap.focusInput = () => input.focus();
  wrap.reset = () => {
    input.value = '';
    list.innerHTML = '';
    status.textContent = '';
  };
  if (autofocus) setTimeout(() => input.focus(), 50);
  showExtra();
  return wrap;
}
