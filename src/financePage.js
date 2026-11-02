// Strona finanse.html (dziennik finansowy) i service worker (praca bez internetu).
// Dziennik ma politykę bezpieczeństwa „connect-src 'none'”: przeglądarka zablokuje każde połączenie sieciowe z tej strony.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS, HEAD_COMMON, navHtml } from './dashboard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FIN_CSS = `
.offline-badge{display:inline-block;background:var(--pos-soft);color:var(--pos);border-radius:999px;padding:3px 10px;font-weight:600;font-size:12px;white-space:nowrap}
.fab{position:fixed;right:18px;bottom:calc(92px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:50%;border:0;background:var(--accent);color:var(--accent-ink);font-size:30px;line-height:1;box-shadow:0 10px 26px rgba(37,99,235,.35);cursor:pointer;z-index:35}
@media (min-width:761px){.fab{bottom:28px;right:28px}}
@media (max-width:760px){main{padding-bottom:calc(170px + env(safe-area-inset-bottom,0px))}}
.month-switch{display:flex;align-items:center;justify-content:center;gap:14px;margin:10px 0 4px;font-size:17px}
.month-switch .icon-btn{font-size:22px;width:38px;height:38px}
.donut-row{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}
.donut{width:180px;height:180px;flex:none;margin:0 auto}
.donut-v{font-size:17px;font-weight:800;fill:var(--ink)}.donut-l{font-size:11px;fill:var(--muted)}
.grow{flex:1;min-width:240px}
.cat-list{list-style:none;padding:0;margin:0}.cat-list li{padding:8px 0;border-top:1px solid var(--line)}.cat-list li:first-child{border-top:0}
.cat-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.cat-row .num,details.acc summary .num{white-space:nowrap}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;vertical-align:0}
.cat-chip{display:inline-block;font-size:12px;border-radius:999px;padding:1px 8px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--ink);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
.cat-chip.none{--c:#94a3b8}
.cat-grid{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.cat-pick{border:1px solid color-mix(in srgb,var(--c) 45%,var(--line));background:color-mix(in srgb,var(--c) 10%,var(--surface));color:var(--ink);border-radius:999px;padding:7px 11px;font:inherit;font-size:13.5px;cursor:pointer}
.cat-pick.on{background:var(--c);border-color:var(--c);color:#fff;font-weight:700}
.inbox-item{border-top:1px solid var(--line);padding:12px 0}
.filters{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px}
@media (max-width:760px){.filters{grid-template-columns:1fr 1fr}.filters input{grid-column:1/-1}}
.ftx{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid var(--line);padding:10px 2px;color:var(--ink);font:inherit;cursor:pointer}
.ftx:hover{background:var(--surface-2)}
.ftx-main small{display:block;color:var(--muted);font-size:12.5px;margin-top:3px}
.ftx-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.ftx-amt small{display:block;color:var(--muted);font-weight:400;font-size:12px}
.tx-month{display:flex;justify-content:space-between}
.bars-wrap{overflow-x:auto}.bars{display:block;max-width:none}
.bars .axis{fill:var(--muted);font-size:10.5px}.bars .axis-line{stroke:var(--line)}
.legend-row{display:flex;gap:14px;font-size:12.5px;color:var(--muted);margin-top:6px}
details.acc{border-top:1px solid var(--line);padding:10px 0}details.acc summary{display:flex;justify-content:space-between;gap:10px;color:var(--ink);font-weight:600;list-style:none}
details.acc summary::-webkit-details-marker{display:none}
.acc-form{margin-top:10px}
.cat-edits{display:flex;flex-direction:column;gap:6px}
.cat-edit{display:grid;grid-template-columns:52px 1fr 46px 110px auto;gap:6px;align-items:center}
@media (max-width:560px){.cat-edit{grid-template-columns:48px 1fr 42px;}.cat-edit input[name=budget]{grid-column:1/3}}
.cat-edit input[type=color]{padding:2px;min-height:40px;width:100%}
input.emoji{text-align:center;font-size:18px;padding:6px;width:52px}
textarea{width:100%;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0}
tfoot td{border-bottom:0}
.amount-input{font-size:30px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
`;

const DIALOG = `<dialog id="fin-dialog"><form method="dialog" novalidate>
<h3 id="fd-title">Nowa operacja</h3>
<div class="typesel" role="radiogroup" aria-label="Typ">${[['wydatek', 'Wydatek'], ['przychod', 'Przychód'], ['przelew', 'Przelew']].map(([v, l]) => `<label><input type="radio" name="type" value="${v}"><span>${l}</span></label>`).join('')}</div>
<label class="field">Kwota (zł)<input name="amount" class="amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
<div id="fd-cats-wrap"><div class="small muted">Kategoria</div><div class="cat-grid" id="fd-cats"></div></div>
<div class="two"><label class="field">Data<input type="date" name="date"></label><label class="field">Konto<select name="accountId"></select></label></div>
<label class="field" id="fd-to" hidden>Na konto<select name="toAccountId"></select></label>
<label class="field">Sprzedawca / opis<input name="merchant" maxlength="80" placeholder="np. Biedronka"></label>
<label class="field">Notatka<input name="note" maxlength="160"></label>
<label class="check small"><input type="checkbox" name="remember"> Zapamiętaj kategorię dla tego sprzedawcy</label>
<div class="errors" id="fd-errors" role="alert"></div>
<div class="dlg-actions"><button type="button" class="btn danger" id="fd-delete" hidden>Usuń</button><span style="flex:1"></span><button type="button" class="btn ghost" id="fd-cancel">Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div>
</form></dialog>`;

export function renderFinancePage() {
  const core = readFileSync(path.join(HERE, 'client', 'finance-core.js'), 'utf8').replace(/^export /gm, '');
  const ui = readFileSync(path.join(HERE, 'client', 'finance-ui.js'), 'utf8');
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; worker-src 'self'; manifest-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'";
  return `<!doctype html><html lang="pl"><head>${HEAD_COMMON}
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Finanse · GEM</title>
<style>${CSS}${FIN_CSS}</style></head><body>
<header class="topbar"><div class="brand"><img src="icon-192.png" alt="">Finanse <span>· offline</span></div><div class="updated"><span class="offline-badge">🔒 tylko na tym urządzeniu</span></div></header>
${navHtml('finanse')}
<main>
<div class="seg-scroll"><div class="seg" id="fin-nav">${[['przeglad', 'Przegląd'], ['transakcje', 'Transakcje'], ['raporty', 'Raporty'], ['konta', 'Konta'], ['ustawienia', 'Ustawienia']].map(([k, l]) => `<button data-view="${k}">${l}</button>`).join('')}</div></div>
<div id="fin-root"><p class="muted">Ładowanie…</p></div>
<footer><p><b>Prywatność:</b> dziennik działa bez internetu. Dane są zapisane wyłącznie w pamięci tej przeglądarki na tym urządzeniu. Strona ma zablokowane wszystkie połączenia sieciowe (Content-Security-Policy: connect-src 'none'), więc nie może wysłać danych nigdzie, także na GitHub. Kopię zapasową tworzysz ręcznie w Ustawieniach.</p></footer>
</main>
<button class="fab" id="fab" aria-label="Dodaj operację">+</button>
<div class="toast" id="toast" role="status" hidden></div>
${DIALOG}
<noscript><p>Dziennik wymaga włączonej obsługi JavaScript.</p></noscript>
<script type="module">${core}\n${ui}</script>
</body></html>`;
}

// Service worker: najpierw sieć (świeże dane GEM), a bez internetu – kopia z pamięci podręcznej.
export function serviceWorker(version) {
  return `// Wygenerowano automatycznie (${version}).
const CACHE = 'gem-${version.replace(/[^0-9A-Za-z]/g, '')}';
const CORE = ['./', './index.html', './finanse.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('gem-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match(url.pathname.endsWith('finanse.html') ? './finanse.html' : './index.html'))),
  );
});
`;
}
