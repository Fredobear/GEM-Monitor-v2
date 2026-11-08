// Aplikacja WWW (GitHub Pages): jeden plik HTML z czterema zakładkami – Sygnał, Portfel, Podatki, Rynki.
// Treści statyczne renderuje serwer (GitHub Actions); Portfel i kalkulatory działają w przeglądarce (src/client/*).
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIcon } from './lib/png.js';
import { monthNamePL, monthGenitivePL, datePL } from './lib/dates.js';
import { fmtPct } from './explain.js';
import { writeLibrary } from './instruments.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pctPlain = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d).replace('.', ',')}%` : '–');
const zl = (x) => (Number.isFinite(x) ? `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(x)} zł` : '–');

function clientScript() {
  const core = readFileSync(path.join(HERE, 'client', 'core.js'), 'utf8').replace(/^export /gm, '');
  const instruments = readFileSync(path.join(HERE, 'client', 'instruments.js'), 'utf8').replace(/^export /gm, '');
  const ui = readFileSync(path.join(HERE, 'client', 'ui.js'), 'utf8');
  return `${core}\n${instruments}\n${ui}`;
}

const ICONS = {
  finanse: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  sygnal: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  portfel: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18M7 6V4h10v2"/>',
  podatki: '<path d="M7 3h10v18l-5-3-5 3z"/><path d="M10 8l4 4M14 8l-4 4" transform="translate(0 0)"/>',
  rynki: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// Podatki są podkartą zakładki Rynki (adres #podatki nadal działa, także w powiadomieniach).
const TABS = [
  ['sygnal', 'Sygnał'],
  ['portfel', 'Portfel'],
  ['finanse', 'Finanse'],
  ['rynki', 'Rynki'],
];

// Nawigacja wspólna dla index.html (zakładki w jednej stronie) i finanse.html (osobna strona offline).
export function navHtml(page) {
  return `<nav class="tabs" aria-label="Sekcje">${TABS.map(([id, label]) => {
    if (id === 'finanse') return `<a href="finanse.html" data-page="finanse" ${page === 'finanse' ? 'aria-current="page"' : ''}>${icon(id)}<span>${label}</span></a>`;
    return `<a href="${page === 'finanse' ? 'index.html' : ''}#${id}" ${page === 'finanse' ? '' : `data-tab="${id}"`}>${icon(id)}<span>${label}</span></a>`;
  }).join('')}</nav>`;
}

export const HEAD_COMMON = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#112040">
<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="GEM">`;

export const CSS = `
:root{--bg:#f4f6fb;--surface:#fff;--surface-2:#f8fafc;--ink:#0f172a;--muted:#64748b;--line:#e5e9f2;--accent:#2563eb;--accent-ink:#fff;--accent-soft:#e8efff;--pos:#047857;--pos-soft:#e3f5ec;--neg:#c62828;--neg-soft:#fdecec;--warn:#a15c07;--warn-soft:#fff3dc;--gem:#7c3aed;--sp500:#94a3b8;--invested:#64748b;--shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.05);color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0a0f1c;--surface:#111827;--surface-2:#0d1424;--ink:#e5e7eb;--muted:#94a3b8;--line:#1f2a3c;--accent:#60a5fa;--accent-ink:#0b1220;--accent-soft:#142441;--pos:#34d399;--pos-soft:#0d2a20;--neg:#f87171;--neg-soft:#2c1515;--warn:#fbbf24;--warn-soft:#2a2111;--gem:#a78bfa;--sp500:#64748b;--invested:#94a3b8;--shadow:none;color-scheme:dark}}
:root[data-theme=dark]{--bg:#0a0f1c;--surface:#111827;--surface-2:#0d1424;--ink:#e5e7eb;--muted:#94a3b8;--line:#1f2a3c;--accent:#60a5fa;--accent-ink:#0b1220;--accent-soft:#142441;--pos:#34d399;--pos-soft:#0d2a20;--neg:#f87171;--neg-soft:#2c1515;--warn:#fbbf24;--warn-soft:#2a2111;--gem:#a78bfa;--sp500:#64748b;--invested:#94a3b8;--shadow:none;color-scheme:dark}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif}
a{color:var(--accent)}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 10px) 16px 10px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap}
.brand img{width:28px;height:28px;border-radius:8px}
.brand span{color:var(--muted);font-weight:600}
.updated{margin-left:auto;color:var(--muted);font-size:12px;text-align:right;line-height:1.3}
.icon-btn{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:12px;width:40px;height:40px;display:grid;place-items:center;cursor:pointer;flex:none}
.ic{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
nav.tabs{display:flex;gap:6px;max-width:960px;margin:14px auto 0;padding:0 16px}
nav.tabs a{display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:12px;color:var(--muted);text-decoration:none;font-weight:600}
nav.tabs a[aria-current=page]{background:var(--accent-soft);color:var(--accent)}
main{max-width:960px;margin:0 auto;padding:6px 16px 48px}
@media (max-width:760px){
 nav.tabs{position:fixed;left:0;right:0;bottom:0;z-index:30;margin:0;padding:6px 4px calc(env(safe-area-inset-bottom,0px) + 6px);display:grid;grid-template-columns:repeat(4,1fr);gap:2px;background:var(--surface);border-top:1px solid var(--line)}
 nav.tabs a{flex-direction:column;gap:2px;padding:6px 0;font-size:11px}
 main{padding-bottom:calc(92px + env(safe-area-inset-bottom,0px))}
 .updated .long{display:none}
 .updated .short{display:inline}
}
.updated .short{display:none}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:18px;margin:14px 0;box-shadow:var(--shadow)}
.card h2{font-size:12.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:0 0 12px;font-weight:700}
.h2-plain{font-size:19px!important;letter-spacing:0!important;text-transform:none!important;color:var(--ink)!important}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.card-head h2{margin:0}
.muted{color:var(--muted)}.small{font-size:13px}.center{text-align:center}
.pos{color:var(--pos)}.neg{color:var(--neg)}.warn{color:var(--warn)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.chip{background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600}
.tag{display:inline-block;font-size:11px;font-weight:600;border-radius:6px;padding:1px 6px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted);vertical-align:middle}
.tag.ok{color:var(--pos);border-color:color-mix(in srgb,var(--pos) 35%,transparent);background:var(--pos-soft)}
.tag.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 35%,transparent);background:var(--warn-soft)}
.hero .ticker{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1.05}
.hero .name{font-size:16px;margin-top:6px}
.meta{color:var(--muted);font-size:13px;margin-top:2px}
.action{display:inline-flex;margin-top:14px;padding:9px 14px;border-radius:12px;font-weight:700}
.a-trzymaj,.a-kup{background:var(--pos-soft);color:var(--pos)}.a-zmiana{background:var(--warn-soft);color:var(--warn)}
.meter{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin:10px 0 6px}.meter>span{display:block;height:100%;background:var(--accent);border-radius:99px}
.banner{border-radius:14px;padding:12px 14px;margin:12px 0;font-size:14px;line-height:1.45}
.banner.err{background:var(--neg-soft);color:var(--neg)}.banner.warn{background:var(--warn-soft);color:var(--warn)}.banner.info{background:var(--accent-soft)}.banner.good{background:var(--pos-soft);color:var(--pos)}
ul.plain{margin:0;padding-left:18px}ul.plain li{margin:7px 0}
.tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:9px 6px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.sel td{font-weight:700}
.barcell{width:30%;min-width:80px;vertical-align:middle}
.bar{position:relative;height:10px}.bar .zero{position:absolute;left:50%;top:-3px;bottom:-3px;border-left:1px dashed var(--muted)}.bar .fill{position:absolute;top:0;bottom:0;border-radius:3px}
.hist{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}
.hist div{border:1px solid var(--line);border-radius:10px;padding:7px 9px;font-size:12px;background:var(--surface-2)}
.hist div b{display:block;font-size:13px}.hist .chg{border-color:var(--warn)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.ind{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface-2)}
.ind .v{font-size:20px;font-weight:700}
.t0{border-left:4px solid var(--pos)}.t1{border-left:4px solid var(--accent)}.t2{border-left:4px solid var(--warn)}.t3{border-left:4px solid var(--neg)}
.news li{margin:10px 0}.news a{color:var(--ink);text-decoration:none;font-weight:600}.news a:hover{text-decoration:underline}.news .src{color:var(--muted);font-size:12px}
.ntag{display:inline-block;font-size:11px;background:var(--accent-soft);color:var(--accent);border-radius:6px;padding:0 6px;margin:3px 4px 0 0}
.ai h4{margin:14px 0 4px;font-size:14.5px}.ai p{margin:4px 0}
details summary{cursor:pointer;color:var(--accent);font-weight:600;margin-top:6px}
footer{color:var(--muted);font-size:12px;margin:24px 0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
@media (max-width:760px){.kpis{grid-template-columns:1fr 1fr}}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:var(--shadow)}
.kpi span{display:block;color:var(--muted);font-size:12.5px}.kpi b{display:block;font-size:21px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;margin-top:2px}.kpi small{color:var(--muted);font-size:12px}
.kpi.pos b{color:var(--pos)}.kpi.neg b{color:var(--neg)}
.seg-scroll{overflow-x:auto;margin:6px 0 2px}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:3px;gap:2px}
.subnav{display:flex;margin:14px 0 2px}
.subnav[hidden]{display:none}
.subnav a{flex:1;text-align:center;text-decoration:none;color:var(--muted);font-weight:600;padding:8px 6px;border-radius:9px}
.subnav a[aria-current=page]{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.seg button{border:0;background:transparent;color:var(--muted);font:inherit;font-weight:600;padding:7px 12px;border-radius:9px;cursor:pointer;white-space:nowrap}
.seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.seg.small button{padding:5px 10px;font-size:13px}
.chip-btn{border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.chip-btn.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.chips.scroll{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.chips.scroll::-webkit-scrollbar{display:none}.chips.scroll .chip-btn{flex:none}
.chip-btn:disabled{opacity:.45;cursor:default}
.legend .chip-btn.on{background:var(--surface-2);color:var(--ink);border-color:var(--ink)}
.dates{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:4px 0 10px}
.dates label{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
input,select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:9px 10px;min-height:42px}
input:focus,select:focus{outline:2px solid color-mix(in srgb,var(--accent) 45%,transparent);outline-offset:1px}
.chart{position:relative;min-height:230px;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.chart-svg{display:block;width:100%;height:auto}
.chart .grid{stroke:var(--line);stroke-width:1}.chart .grid.zero{stroke:var(--muted);stroke-dasharray:3 3}
.chart .axis{fill:var(--muted);font-size:11px}
.chart .line{fill:none;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
.chart .line.main{stroke:var(--accent)}.chart .line.gem{stroke:var(--gem);stroke-width:1.8}.chart .line.sp500{stroke:var(--sp500);stroke-width:1.8}.chart .line.invested{stroke:var(--invested);stroke-dasharray:5 4;stroke-width:1.6}
.chart .area{fill:url(#area-grad);stroke:none}
.chart .cross{stroke:var(--muted);stroke-dasharray:3 3}
.chart .sel{fill:color-mix(in srgb,var(--accent) 16%,transparent);stroke:var(--accent);stroke-width:1}
.chart .dot{stroke:var(--surface);stroke-width:2}.chart .dot.main{fill:var(--accent)}.chart .dot.gem{fill:var(--gem)}.chart .dot.sp500{fill:var(--sp500)}.chart .dot.invested{fill:var(--invested)}
.tip{position:absolute;top:4px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:7px 10px;font-size:12.5px;box-shadow:0 6px 18px rgba(15,23,42,.14);pointer-events:none;white-space:nowrap}
.tip-date{font-weight:700;margin-bottom:2px}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:var(--accent)}.sw.gem{background:var(--gem)}.sw.sp500{background:var(--sp500)}.sw.invested{background:var(--invested)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:14px 0 8px}
@media (max-width:560px){.stats{grid-template-columns:1fr 1fr}}
.stats span{display:block;font-size:12px;color:var(--muted)}.stats b{font-size:17px;font-variant-numeric:tabular-nums}
.hint{margin:6px 0 0}
.tx-month{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px}
.tx{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid var(--line);padding:10px 2px;color:var(--ink);font:inherit;cursor:pointer}
.tx:hover{background:var(--surface-2)}
.tx-type{font-size:11.5px;font-weight:700;border-radius:8px;padding:4px 8px;background:var(--surface-2);border:1px solid var(--line)}
.t-kupno{color:var(--pos);background:var(--pos-soft);border-color:transparent}.t-sprzedaz{color:var(--neg);background:var(--neg-soft);border-color:transparent}.t-wplata{color:var(--accent);background:var(--accent-soft);border-color:transparent}
.tx-main small,.tx-amt small{display:block;color:var(--muted);font-size:12.5px}
.tx-amt{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.btn{border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-weight:600;border-radius:12px;padding:10px 14px;cursor:pointer;min-height:42px}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.small{padding:6px 12px;min-height:34px;font-size:14px}
.btn.ghost{background:transparent}.btn.danger{color:var(--neg);border-color:var(--neg)}
.link{background:none;border:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer;padding:0;text-decoration:underline}
.row-btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.empty{text-align:left}.empty-icon{font-size:34px}
.steps-mini{padding-left:20px}.steps-mini li{margin:6px 0}
.limit{margin:12px 0}.limit-row{display:flex;justify-content:space-between;gap:10px;font-variant-numeric:tabular-nums}
details.danger summary{color:var(--neg)}
.form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:8px 0 12px}
.form-row label,.field{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
label.check{flex-direction:row;align-items:center;gap:8px;color:var(--ink)}
label.check input{min-height:auto;width:18px;height:18px}
ol.plan{list-style:none;padding:0;margin:6px 0;counter-reset:s}
ol.plan li{counter-increment:s;position:relative;padding:10px 0 10px 40px;border-top:1px solid var(--line)}
ol.plan li::before{content:counter(s);position:absolute;left:0;top:10px;width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:800;font-size:14px}
.plan-head{display:flex;justify-content:space-between;gap:8px;font-size:16px}.plan-head span{font-weight:700;font-variant-numeric:tabular-nums}
.wrappers td:first-child{font-weight:600}
.rank-bar{height:8px;border-radius:6px;background:var(--accent);opacity:.85}
.cal li{display:grid;grid-template-columns:90px 1fr;gap:10px;padding:8px 0;border-top:1px solid var(--line);list-style:none}
.cal{padding:0;margin:0}.cal .when{font-weight:700;font-variant-numeric:tabular-nums}
.broker{border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0;background:var(--surface-2)}
.broker h3{margin:0 0 4px;font-size:16px}
dialog{border:0;border-radius:22px;padding:0;width:min(560px,calc(100% - 24px));max-height:92vh;background:var(--surface);color:var(--ink);box-shadow:0 24px 60px rgba(2,6,23,.35)}
dialog::backdrop{background:rgba(2,6,23,.55)}
@media (max-width:600px){dialog{margin:auto 0 0;width:100%;max-width:100%;border-radius:22px 22px 0 0}}
dialog form{padding:18px;display:flex;flex-direction:column;gap:12px}
dialog h3{margin:0;font-size:19px}
.typesel{display:flex;flex-wrap:wrap;gap:6px}
.typesel label{position:relative}
.typesel input{position:absolute;opacity:0;pointer-events:none}
.typesel span{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:7px 12px;font-size:14px;font-weight:600;cursor:pointer;color:var(--ink)}
.typesel input:checked+span{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dlg-actions{display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap;margin-top:4px}
.errors{color:var(--neg);font-size:13.5px;min-height:1em}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom,0px));background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:12px;font-size:14px;z-index:60;max-width:calc(100% - 32px);box-shadow:0 10px 30px rgba(2,6,23,.3)}
@media (min-width:761px){.toast{bottom:28px}}
.inst-picker{display:flex;flex-direction:column;gap:6px;margin:4px 0 8px}
.inst-picker .inst-q{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)}
.inst-results{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow-y:auto;-webkit-overflow-scrolling:touch}
.inst-results:empty{display:none}
.inst-head{margin:4px 2px 0}
.inst-opt{display:grid;grid-template-columns:auto 1fr;gap:1px 10px;text-align:left;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);border-radius:12px;padding:8px 10px;font:inherit;cursor:pointer}
.inst-opt:hover,.inst-opt:focus-visible{border-color:var(--accent);outline:none}
.inst-sym{font-weight:700;font-size:13.5px;white-space:nowrap}
.inst-name{font-size:13.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inst-meta{grid-column:1/-1;font-size:12px;color:var(--muted)}
.inst-status:empty{display:none}
.inst-picked{border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--surface-2);font-size:13px;margin:0 0 8px}
.inst-picked b{font-size:14px}
`;

function bar(ret, scale) {
  if (!Number.isFinite(ret)) return '';
  const w = Math.min(Math.abs(ret) / scale, 1) * 50;
  const left = ret >= 0 ? 50 : 50 - w;
  return `<div class="bar"><span class="zero"></span><span class="fill" style="left:${left}%;width:${w}%;background:var(${ret >= 0 ? '--accent' : '--neg'})"></span></div>`;
}

function renderAi(text) {
  const out = [];
  let list = [];
  const flush = () => {
    if (list.length) out.push(`<ul class="plain">${list.join('')}</ul>`);
    list = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^\*\*(.+?)\*\*$/) ?? line.match(/^#{1,4}\s+(.+)$/);
    if (h) {
      flush();
      out.push(`<h4>${esc(h[1].replace(/\*\*/g, ''))}</h4>`);
    } else if (/^[-•*]\s+/.test(line)) list.push(`<li>${esc(line.replace(/^[-•*]\s+/, '').replace(/\*\*/g, ''))}</li>`);
    else {
      flush();
      out.push(`<p>${esc(line.replace(/\*\*/g, ''))}</p>`);
    }
  }
  flush();
  return out.join('');
}

function momentumTable(signals, config, view) {
  const { rules } = signals;
  const r = view.returns;
  const keys = Object.keys(r).sort((a, b) => r[b] - r[a]);
  const scale = Math.max(0.1, ...keys.map((k) => Math.abs(r[k])));
  const decisionKeys = new Set([...rules.equities, rules.hurdle, ...rules.safe]);
  const rows = keys
    .map((k) => {
      const a = config.assets[k];
      const role = k === rules.hurdle ? 'próg' : rules.equities.includes(k) ? 'akcje' : rules.safe.includes(k) ? 'bezpieczne' : 'info';
      return `<tr class="${k === view.decision.asset ? 'sel' : ''}"><td>${esc(a.name)}<div class="meta">${esc(a.xtb.ticker)} · ${role}${decisionKeys.has(k) ? '' : ' (poza wariantem)'}</div></td><td class="num">${fmtPct(r[k])}</td><td class="barcell">${bar(r[k], scale)}</td></tr>`;
    })
    .join('');
  return `<div class="tbl-wrap"><table><thead><tr><th>Rynek / ETF w XTB</th><th class="num">${rules.lookbackMonths} mies.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function researchCard(research) {
  if (!research?.periods) return '';
  const pick = ['gem', 'gem_bony', 'us_bh', 'p6040'];
  const rows = (period) =>
    pick
      .map((k) => period.rows[k])
      .filter(Boolean)
      .map((row) => `<tr><td>${esc(row.label)}</td><td class="num">${pctPlain(row.cagr)}</td><td class="num">${pctPlain(row.maxDrawdown)}</td><td class="num">${pctPlain(row.worst12m)}</td></tr>`)
      .join('');
  const table = (p) => `<p class="meta">${esc(p.label)}</p><div class="tbl-wrap"><table><thead><tr><th>Strategia</th><th class="num">Średnio/rok</th><th class="num">Maks. spadek</th><th class="num">Najgorsze 12 mies.</th></tr></thead><tbody>${rows(p)}</tbody></table></div>`;
  return `<section class="card"><h2>Historia strategii (backtest)</h2>${table(research.periods.calosc)}<details><summary>Przed i po publikacji strategii (2014)</summary>${table(research.periods.przed2014)}${table(research.periods.po2014)}</details><p class="meta">Dane: Ken French Data Library, FRED. Wyniki historyczne nie gwarantują przyszłych. Pełna analiza: ANALIZA_GEM.md.</p></section>`;
}

function signalTab({ signals, explanation, config, research }) {
  if (!signals || !explanation) return '<section class="card"><p>Brak sygnału – uruchom narzędzie z kluczem do danych rynkowych.</p></section>';
  const { official, preview, rules } = signals;
  const t = explanation.target;
  const stab = explanation.stability;
  const parts = [];
  parts.push(`<section class="card hero">
<div class="chips"><span class="chip">Sygnał na ${esc(monthNamePL(official.forMonth))}</span><span class="chip">oficjalny · koniec ${esc(monthGenitivePL(official.month))}</span><span class="chip">wariant: ${esc(rules.variant)}</span></div>
<div class="ticker">${esc(t.ticker)}</div>
<div class="name">${esc(t.name)}</div>
<div class="meta">${esc(t.marketName)} · indeks ${esc(t.index)}</div>
<div class="meta">ISIN ${esc(t.isin)} · ${esc(t.exchange)} · ${esc(t.currency)}${Number.isFinite(t.ter) ? ` · TER ${String(t.ter).replace('.', ',')}%` : ''}</div>
<div class="action a-${esc(explanation.action.type)}">${esc(explanation.action.text)}</div>
<div class="meter" title="margines do zmiany sygnału"><span style="width:${Math.min(100, stab.minMarginPct * 10)}%;background:var(${stab.minMarginPct >= 5 ? '--pos' : stab.minMarginPct >= 2 ? '--accent' : stab.minMarginPct >= 1 ? '--warn' : '--neg'})"></span></div>
<div class="meta">${esc(explanation.stabilityText)} Następna decyzja: ${esc(datePL(signals.nextDecisionDate))} (ostatnia sesja miesiąca).</div>
<div id="signal-check"></div>
</section>`);
  parts.push(`<section class="card"><h2>Dlaczego ten rynek</h2><ul class="plain">${explanation.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`);
  if (preview) {
    const pa = config.assets[preview.decision.asset];
    parts.push(`<section class="card"><h2>Podgląd na dziś</h2><div class="banner ${preview.differsFromOfficial ? 'warn' : 'info'}">${esc(explanation.previewNote)}</div>${momentumTable(signals, config, preview)}<p class="meta">Lider w podglądzie: ${esc(pa.name)} (${esc(pa.xtb.ticker)}). Momentum liczone krocząco ${rules.lookbackMonths} mies. wstecz od ${esc(datePL(preview.asOf))}.</p></section>`);
  }
  parts.push(`<section class="card"><h2>Momentum na koniec ${esc(monthGenitivePL(official.month))}</h2>${momentumTable(signals, config, official)}<p class="meta">Filtr trendu: ${esc(config.assets[official.decision.absAsset].index)} musi pokonać bony skarbowe (${fmtPct(official.returns[rules.hurdle])}), inaczej strategia przechodzi do bezpiecznej przystani. Ceny skorygowane o dywidendy (ETF-y notowane w USA jako źródło danych); w XTB kupujesz odpowiedniki UCITS.</p></section>`);
  parts.push(`<section class="card"><h2>Jak wykonać w XTB</h2><ul class="plain">${explanation.execution.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></section>`);
  if (explanation.currency?.length) {
    parts.push(`<section class="card"><h2>W jakiej walucie kupić</h2>
    <div class="tbl-wrap"><table><tbody>${explanation.currency.map((r) => `<tr><td><b>${esc(r.label)}</b><div class="small muted">${esc(r.text)}</div></td><td class="num"><span class="chip">${esc(r.ticker)}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Waluta notowania nie zmienia ryzyka walutowego: ETF na S&amp;P 500 trzyma akcje amerykańskie, więc zarabia i traci na kursie dolara tak samo w USD, jak i w EUR. Wybór waluty decyduje tylko o liczbie przewalutowań (0,5% każde w XTB). Na koncie zwykłym otwórz subkonta USD i EUR i kupuj w walucie, którą już masz. Przy nowych złotówkach wybierz walutę, której GEM najczęściej będzie potrzebował przy następnej zmianie (według historii sygnałów).</p>
    <div id="currency-personal"></div></section>`);
  }
  const hist = signals.history.slice(-24);
  parts.push(`<section class="card"><h2>Historia sygnałów</h2><div class="hist">${hist
    .map((h) => `<div class="${h.changed ? 'chg' : ''}"><span class="meta">${esc(h.forMonth)}</span><b>${esc(config.assets[h.asset].xtb.ticker)}</b>${h.changed ? '<span class="meta">zmiana</span>' : ''}</div>`)
    .join('')}</div><p class="meta">Zmian pozycji w ostatnich ${signals.history.length} mies.: ${signals.switchesInHistory}. Miesiąc = miesiąc trzymania pozycji.</p></section>`);
  parts.push(researchCard(research));
  return parts.join('\n');
}

function wrappersTable(research) {
  const sc = research?.scenarios;
  if (!sc) return '';
  const rows = [
    ['ike_tani_fx', 'IKE/IKZE u brokera z tanim przewalutowaniem'],
    ['ike_usd', 'IKE/IKZE z subkontem USD'],
    ['oki_usd', 'OKI (od 2027 r.)'],
    ['ike', 'IKE/IKZE w XTB (tylko PLN)'],
    ['zwykle_usd', 'Konto zwykłe z subkontem USD'],
    ['zwykle_pln', 'Konto zwykłe w PLN'],
  ]
    .filter(([k]) => sc[k])
    .map(([k, label]) => ({ label, v: sc[k].rows.gem?.cagrAfterLiquidation, b: sc[k].rows.gem_bufor?.cagrAfterLiquidation }));
  const max = Math.max(...rows.map((r) => r.v ?? 0));
  return `<div class="tbl-wrap"><table class="wrappers"><thead><tr><th>Gdzie prowadzisz GEM</th><th class="num">Rocznie po kosztach i podatku</th><th class="num">z buforem 2 pp</th><th></th></tr></thead><tbody>${rows
    .map((r) => `<tr><td>${esc(r.label)}</td><td class="num"><b>${pctPlain(r.v)}</b></td><td class="num">${pctPlain(r.b)}</td><td class="barcell"><div class="rank-bar" style="width:${Math.max(4, ((r.v ?? 0) / max) * 100)}%"></div></td></tr>`)
    .join('')}</tbody></table></div><p class="muted small">Backtest GEM 1991–2026 (${pctPlain(sc.brutto?.rows.gem?.cagr)} rocznie bez kosztów). IKE/IKZE: bez podatku. OKI: 0,85% wartości rocznie. Konto zwykłe: 19% od zysku przy każdej zmianie i przy końcowej sprzedaży. Bufor 2 pp ogranicza liczbę zmian pozycji.</p>`;
}

function podatkiTab({ podatki, research, taxMonitor, now }) {
  const y = now.getUTCFullYear();
  const l = podatki.limits;
  const st = (s) => (s === 'oficjalne' ? '<span class="tag ok">oficjalne</span>' : `<span class="tag warn">${esc(s)}</span>`);
  const parts = [];
  parts.push(`<section class="card"><h2>Strategia podatkowa dla GEM</h2>
  <p>GEM zmienia pozycję średnio ${String((research?.switchStats?.perYear ?? 1.4).toFixed(1)).replace('.', ',')} razy w roku. Na koncie zwykłym każda zmiana oznacza 19% podatku od zysku, a na IKE, IKZE i OKI nie. Dlatego <b>kolejność kont ma większe znaczenie niż wybór wariantu strategii</b>.</p>
  <ol class="plan">
   <li><div class="plan-head"><b>IKZE</b><span>${zl(l[y]?.ikze ?? l[2026].ikze)}</span></div><p class="small muted">Wpłatę odliczasz od dochodu, więc dostajesz zwrot 12–32% wpłaty (ryczałt: Twoja stawka). Wewnątrz konta płacisz 0 zł podatku, a przy wypłacie po 65. roku życia 10% ryczałtu. Prowadzący firmę mają limit ${zl(l[y]?.ikzeFirma ?? l[2026].ikzeFirma)}.</p></li>
   <li><div class="plan-head"><b>IKE</b><span>${zl(l[y]?.ike ?? l[2026].ike)}</span></div><p class="small muted">Wewnątrz konta płacisz 0 zł podatku, a wypłata po 60. roku życia jest zwolniona. Przy wcześniejszej wypłacie płacisz 19% tylko od zysku, więc IKE nigdy nie jest gorsze od konta zwykłego. Wpłać na nie zwrot z IKZE.</p></li>
   <li><div class="plan-head"><b>OKI</b><span>od 1.01.2027</span></div><p class="small muted">Bez limitu wpłat i bez podatku od zysków. Zagraniczne ETF-y (np. S&amp;P 500) nie są zwolnione, więc płacisz ${pctPlain(podatki.oki.rates[2027], 2)} ich średniej wartości rocznie (od 2028 r. 19% stopy referencyjnej NBP, min. 0,1%). Dla GEM w backteście wypada lepiej niż konto zwykłe. Podatek należy się też w roku straty.</p></li>
   <li><div class="plan-head"><b>Konto zwykłe</b><span>reszta</span></div><p class="small muted">19% od zysku przy każdej zmianie. Ograniczasz go subkontem USD (bez przewalutowania między ETF-ami w USD) i realizacją strat przed końcem roku. Ponowny zakup jest w Polsce dozwolony od razu. Stratę rozliczasz do 5 lat.</p></li>
  </ol>
  ${wrappersTable(research)}</section>`);
  parts.push('<section class="card" id="plan-root"></section>');
  parts.push(`<section class="card"><h2>Ulgi i limity</h2><div class="tbl-wrap"><table><thead><tr><th>Konto</th><th class="num">${y}</th><th class="num">${y + 1}</th><th>Podatek</th></tr></thead><tbody>
    <tr><td><b>IKE</b></td><td class="num">${zl(l[y]?.ike)}<div>${l[y] ? st(l[y].status) : ''}</div></td><td class="num">${zl(l[y + 1]?.ike)}<div>${l[y + 1] ? st(l[y + 1].status) : ''}</div></td><td class="small">0 zł po 60. r.ż.; wcześniej 19% od zysku</td></tr>
    <tr><td><b>IKZE</b></td><td class="num">${zl(l[y]?.ikze)}<div class="small muted">firma: ${zl(l[y]?.ikzeFirma)}</div></td><td class="num">${zl(l[y + 1]?.ikze)}<div class="small muted">firma: ${zl(l[y + 1]?.ikzeFirma)}</div></td><td class="small">ulga przy wpłacie; 10% przy wypłacie po 65. r.ż.</td></tr>
    <tr><td><b>OKI</b></td><td class="num">–</td><td class="num">bez limitu<div class="small muted">zwolnienie do ${zl(podatki.oki.exemption)} (aktywa polskie)</div></td><td class="small">${pctPlain(podatki.oki.rates[2027], 2)} wartości rocznie (2027) dla zagranicznych ETF-ów</td></tr>
    <tr><td><b>Konto zwykłe</b></td><td class="num">bez limitu</td><td class="num">bez limitu</td><td class="small">19% od zysku (PIT-38)</td></tr>
  </tbody></table></div>
  ${l[y + 1]?.note ? `<p class="small warn">${esc(l[y + 1].note)}</p>` : ''}
  <p class="muted small">Parametry sprawdzone: ${esc(datePL(podatki.verifiedAt))}. Źródła: <a href="${esc(l[2026].source)}" rel="noopener" target="_blank">XTB (limity 2026)</a>, <a href="${esc(podatki.oki.sources[0])}" rel="noopener" target="_blank">OKI – ${esc(podatki.oki.law)}</a>.</p></section>`);
  parts.push('<section class="card" id="broker-root"></section>');
  parts.push(`<section class="card"><h2>Brokerzy – szczegóły</h2>${podatki.brokers
    .map((b) => `<div class="broker"><h3>${esc(b.name)}</h3><div class="small muted">IKE: ${esc(b.accounts.ike)} · IKZE: ${esc(b.accounts.ikze)} · OKI: ${esc(b.accounts.oki)} · waluty na IKE: ${esc(b.ikeCurrencies)}</div><div class="small">${esc(b.commissionNote)}</div><ul class="plain small">${b.pros.map((p) => `<li class="pos">+ ${esc(p)}</li>`).join('')}${b.cons.map((c) => `<li class="neg">− ${esc(c)}</li>`).join('')}</ul><div class="small">${b.sources.map((s, i) => `<a href="${esc(s)}" rel="noopener" target="_blank">źródło ${i + 1}</a>`).join(' · ')}</div></div>`)
    .join('')}<p class="muted small">Jedna osoba może mieć tylko jedno IKE i jedno IKZE (mogą być u różnych instytucji). Konto można przenieść do innego brokera bez utraty ulgi (wypłata transferowa). OKI można mieć w wielu instytucjach, ale zwolnienie jest jedno.</p></section>`);
  if (podatki.watch?.length) {
    parts.push(`<section class="card"><h2>Zmiany w przygotowaniu</h2>${podatki.watch
      .map((w) => `<div class="broker"><h3>${esc(w.title)}</h3><div class="small warn">${esc(w.status)}</div><p class="small">${esc(w.text)}</p><a class="small" href="${esc(w.source)}" rel="noopener" target="_blank">źródło</a></div>`)
      .join('')}</section>`);
  }
  if (taxMonitor?.upcoming?.length) {
    parts.push(`<section class="card"><h2>Kalendarz</h2><ul class="cal">${taxMonitor.upcoming.map((c) => `<li><span class="when">${esc(datePL(c.iso))}</span><span><b>${esc(c.title)}</b><br><span class="small muted">${esc(c.text)}</span></span></li>`).join('')}</ul></section>`);
  }
  const tn = taxMonitor?.news;
  const ai = taxMonitor?.ai;
  parts.push(`<section class="card"><h2>Monitor zmian w Polsce</h2>
  ${taxMonitor?.discrepancies?.length ? `<div class="banner warn"><b>Sprawdź parametry w config/podatki.js:</b><br>${taxMonitor.discrepancies.map(esc).join('<br>')}</div>` : ''}
  ${tn?.important?.length ? `<div class="banner info"><b>Ważne w ostatnich dniach:</b><ul class="plain">${tn.important.map((n) => `<li><a href="${esc(n.link)}" rel="noopener" target="_blank">${esc(n.title)}</a></li>`).join('')}</ul></div>` : ''}
  ${ai?.text ? `<div class="ai">${renderAi(ai.text)}</div>${ai.sources?.length ? `<details><summary>Źródła raportu (${ai.sources.length})</summary><ul class="plain small">${ai.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a></li>`).join('')}</ul></details>` : ''}<p class="muted small">Raport AI z ${esc(ai.generatedAt?.slice(0, 10))} (${esc(ai.model)}) – sprawdza aktualność limitów, OKI i opłat brokerów.</p>` : `<p class="small muted">${esc(ai?.error ?? 'Comiesięczny raport AI pojawi się po dodaniu klucza ANTHROPIC_API_KEY. Bez niego narzędzie śledzi wiadomości poniżej.')}</p>`}
  ${tn?.items?.length ? `<ul class="plain news">${tn.items.map((n) => `<li><a href="${esc(n.link)}" rel="noopener" target="_blank">${esc(n.title)}</a><div class="src">${esc(n.source)} · ${esc(n.date?.slice(0, 10))}</div>${n.topics.map((t) => `<span class="ntag">${esc(t)}</span>`).join('')}</li>`).join('')}</ul>` : '<p class="small muted">Brak nowych wiadomości o podatkach inwestorów w ostatnich 14 dniach.</p>'}
  <p class="muted small">Pełna strategia podatkowa: PODATKI_STRATEGIA.md. To opis przepisów, nie porada podatkowa – w nietypowej sytuacji skonsultuj się z doradcą podatkowym.</p></section>`);
  return parts.join('\n');
}

function rynkiTab({ macro, news, ai }) {
  const parts = [];
  if (macro?.indicators?.length) {
    const fx = macro.usdpln ? `<div class="ind t0"><div class="meta">Kurs USD/PLN (NBP)</div><div class="v">${macro.usdpln.rate.toFixed(4).replace('.', ',')}</div><div class="meta">12 mies.: ${fmtPct(macro.usdpln.change12m)}. ${macro.usdpln.change12m >= 0 ? 'Słabszy złoty podnosi wynik w PLN.' : 'Mocniejszy złoty obniża wynik w PLN.'}</div></div>` : '';
    parts.push(`<section class="card"><h2>Ryzyko rynkowe</h2><p>${esc(macro.summary)}</p><div class="grid">${macro.indicators
      .map((i) => `<div class="ind t${i.tier}"><div class="meta">${esc(i.name)}</div><div class="v">${esc(i.value)}</div><div class="meta">${esc(i.comment)} · ${esc(i.date)}</div></div>`)
      .join('')}${fx}</div><p class="meta">Wskaźniki są kontekstem. Nie zmieniają mechanicznego sygnału GEM (por. ANALIZA_GEM.md, rozdz. 7).</p></section>`);
  }
  if (ai?.text) {
    parts.push(`<section class="card ai"><h2>Kontekst polityczny i geopolityczny (AI)</h2>${renderAi(ai.text)}${ai.sources?.length ? `<details><summary>Źródła (${ai.sources.length})</summary><ul class="plain">${ai.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a></li>`).join('')}</ul></details>` : ''}<p class="meta">Wygenerowano: ${esc(ai.generatedAt?.slice(0, 16).replace('T', ' '))} UTC · ${esc(ai.model)}</p></section>`);
  } else if (ai?.error) parts.push(`<div class="banner info">${esc(ai.error)}</div>`);
  if (news?.items?.length) {
    parts.push(`<section class="card news"><h2>Wiadomości polityczne i gospodarcze</h2><ul class="plain">${news.items
      .map((n) => `<li><a href="${esc(n.link)}" rel="noopener" target="_blank">${esc(n.title)}</a><div class="src">${esc(n.source)} · ${esc(n.date?.slice(0, 16).replace('T', ' '))} UTC</div>${[...n.regions, ...n.themes].map((t) => `<span class="ntag">${esc(t)}</span>`).join('')}</li>`)
      .join('')}</ul><p class="meta">Wybrane automatycznie z ${news.fetched} nagłówków (RSS) według tematów: konflikty, sankcje i cła, banki centralne, wybory, energia, inflacja.</p></section>`);
  }
  return parts.join('\n') || '<section class="card"><p class="muted">Brak danych.</p></section>';
}

const TX_DIALOG = `<dialog id="tx-dialog"><form method="dialog" novalidate>
<h3 id="tx-title">Nowy wpis</h3>
<input type="hidden" name="id">
<div class="typesel" role="radiogroup" aria-label="Typ">${[['kupno', 'Kupno'], ['sprzedaz', 'Sprzedaż'], ['wplata', 'Wpłata'], ['wyplata', 'Wypłata'], ['wycena', 'Wycena']].map(([v, l]) => `<label><input type="radio" name="type" value="${v}"><span>${l}</span></label>`).join('')}</div>
<div class="two"><label class="field">Data<input type="date" name="date" required></label><label class="field">Rachunek<select name="account"><option value="IKE">IKE</option><option value="IKZE">IKZE</option><option value="OKI">OKI</option><option value="ZWYKLE">Konto zwykłe</option></select></label></div>
<label class="field" data-show="trade wycena">Instrument<select name="ticker" id="tx-ticker"></select></label>
<div id="custom-ticker-row" hidden><div id="tx-inst-picker"></div><input type="hidden" name="instName"><div class="inst-picked" id="tx-inst-info" hidden></div><div class="two"><label class="field">Symbol<input name="customTicker" placeholder="np. CDR.PL" autocapitalize="characters"></label><label class="field">Waluta<select name="currency">${['USD', 'EUR', 'GBP', 'PLN', 'CHF', 'SEK', 'NOK', 'DKK'].map((c) => `<option>${c}</option>`).join('')}</select></label></div></div>
<div class="two" data-show="trade wycena"><label class="field" data-show="trade">Liczba jednostek<input name="quantity" inputmode="decimal" placeholder="np. 3,25"></label><label class="field" data-show="trade wycena"><span>Cena jednostki (<span id="price-ccy">USD</span>)</span><input name="price" inputmode="decimal" placeholder="z potwierdzenia"></label></div>
<label class="field" data-show="trade cash"><span>Kwota w PLN <span class="small" data-show="trade">– opcjonalnie: kwota faktycznie pobrana lub otrzymana</span></span><input name="amountPLN" inputmode="decimal"></label>
<p class="small muted" id="amount-hint" data-show="trade"></p>
<label class="field" data-show="trade">Prowizja / opłaty w PLN (opcjonalnie)<input name="feePLN" inputmode="decimal" placeholder="0"></label>
<label class="field">Notatka<input name="note" maxlength="120"></label>
<div class="errors" id="tx-errors" role="alert"></div>
<div class="dlg-actions"><button type="button" class="btn danger" id="tx-delete" hidden>Usuń</button><span style="flex:1"></span><button type="button" class="btn ghost" id="tx-cancel">Anuluj</button><button type="submit" class="btn primary">Zapisz</button></div>
</form></dialog>`;

const SETTINGS_DIALOG = (podatki) => `<dialog id="settings-dialog"><form method="dialog" novalidate>
<h3>Ustawienia</h3>
<label class="field">Forma opodatkowania dochodów (do ulgi IKZE)<select name="taxForm">${Object.entries(podatki.taxForms).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join('')}</select></label>
<label class="field" id="ryczalt-row" hidden>Stawka ryczałtu (%)<input name="ryczaltRate" inputmode="decimal" placeholder="12"></label>
<label class="check"><input type="checkbox" name="selfEmployed"> Prowadzę działalność gospodarczą (limit IKZE ×1,8)</label>
<div class="two"><label class="field">Domyślny rachunek<select name="defaultAccount"><option value="IKE">IKE</option><option value="IKZE">IKZE</option><option value="OKI">OKI</option><option value="ZWYKLE">Konto zwykłe</option></select></label>
<label class="field">Wygląd<select name="theme"><option value="auto">Jak w systemie</option><option value="light">Jasny</option><option value="dark">Ciemny</option></select></label></div>
<details><summary>Synchronizacja między urządzeniami (GitHub)</summary>
<p class="small muted">Dziennik może trafiać do <b>prywatnego</b> repozytorium GitHub. Wtedy masz te same dane na telefonie i komputerze. Utwórz prywatne repozytorium (np. <code>gem-dane</code>) i token „fine-grained” z dostępem tylko do niego (uprawnienie <i>Contents: Read and write</i>). Token zostaje wyłącznie w tej przeglądarce.</p>
<label class="field">Repozytorium (login/nazwa)<input name="repo" placeholder="login/gem-dane" autocapitalize="none"></label>
<div class="two"><label class="field">Plik<input name="path" placeholder="portfel.json" autocapitalize="none"></label><label class="field">Token<input name="token" type="password" autocomplete="off" placeholder="github_pat_…"></label></div>
<p class="small muted" id="sync-status"></p>
</details>
<div class="dlg-actions"><span></span><span><button type="button" class="btn ghost" id="settings-cancel">Anuluj</button> <button type="submit" class="btn primary">Zapisz</button></span></div>
</form></dialog>`;

function clientData({ signals, explanation, config, prices, podatki, research, library }) {
  const tickerOf = (asset) => config.assets[asset]?.xtb?.ticker;
  const history = signals?.history?.map((h) => ({ forMonth: h.forMonth, ticker: tickerOf(h.asset) })) ?? [];
  if (signals) history.push({ forMonth: signals.official.forMonth, ticker: tickerOf(signals.official.decision.asset) });
  // Notowania w różnych walutach → rynek GEM (np. SXR8.DE i CSPX.UK to ten sam rynek „US”).
  const listingIndex = {};
  const assetsLite = {};
  for (const [key, a] of Object.entries(config.assets)) {
    const listings = a.listings?.length ? a.listings : [{ ticker: a.xtb.ticker, currency: a.xtb.currency, exchange: a.xtb.exchange }];
    assetsLite[key] = { name: a.name, listings, plnAlternative: a.plnAlternative ?? null, xtb: { ticker: a.xtb.ticker, currency: a.xtb.currency, exchange: a.xtb.exchange } };
    for (const l of listings) if (!listingIndex[l.ticker] || key === signals?.official.decision.asset) listingIndex[l.ticker] = { asset: key, currency: l.currency };
  }
  return {
    signal: explanation ? { ticker: explanation.target.ticker, asset: explanation.target.key, name: explanation.target.name, forMonth: signals.official.forMonth } : null,
    listingIndex,
    assetsLite,
    accountCurrencies: config.accountCurrencies,
    transitions: research?.transitions ?? {},
    signalHistory: history,
    instruments: Object.fromEntries(Object.entries(config.portfolio.instruments).map(([t, i]) => [t, { name: i.name, currency: i.currency }])),
    prices: prices ? { fx: prices.fx, instruments: Object.fromEntries(Object.entries(prices.instruments).map(([t, i]) => [t, { currency: i.currency, series: i.series, quotes: i.quotes }])), benchmarks: prices.benchmarks ?? {} } : { fx: {}, instruments: {}, benchmarks: {} },
    podatki: { limits: podatki.limits, oki: podatki.oki, ike: podatki.ike, ikze: podatki.ikze, belka: podatki.belka, taxForms: podatki.taxForms, brokers: podatki.brokers },
    switchStats: research?.switchStats ?? null,
    library: { editUrl: library?.editUrl ?? null },
  };
}

export function renderDashboard(payload) {
  const { signals, explanation, macro, news, ai, research, config, podatki, taxMonitor, meta } = payload;
  const now = new Date(meta.generatedAt);
  const banners = [];
  if (meta.demo) banners.push(`<div class="banner warn"><b>Tryb demonstracyjny.</b> ${esc(meta.demo)}</div>`);
  if (meta.error) banners.push(`<div class="banner err"><b>Ostatnie uruchomienie nie powiodło się:</b> ${esc(meta.error)}<br>Poniżej ostatni poprawny sygnał. Nie podejmuj decyzji, dopóki dane nie zostaną odświeżone.</div>`);
  for (const w of [...(signals?.warnings ?? []), ...(meta.warnings ?? [])]) banners.push(`<div class="banner warn">${esc(w)}</div>`);
  const updated = `${datePL(meta.generatedAt.slice(0, 10))}, ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')} UTC`;
  const data = JSON.stringify(clientData(payload)).replace(/</g, '\\u003c');
  // Strona może łączyć się tylko z GitHub API (opcjonalna synchronizacja portfela) – żadnych zewnętrznych skryptów.
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.github.com; worker-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'";
  return `<!doctype html><html lang="pl"><head>${HEAD_COMMON}
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>GEM Monitor</title>
<style>${CSS}</style></head><body>
<header class="topbar"><div class="brand"><img src="icon-192.png" alt="">GEM Monitor <span>· XTB</span></div><div class="updated"><span class="long">aktualizacja ${esc(updated)}${signals ? `<br>notowania do ${esc(datePL(signals.lastDataDate))}` : ''}</span><span class="short">${signals ? `dane z ${esc(signals.lastDataDate.split('-').reverse().join('.'))}` : ''}</span></div><button class="icon-btn" id="btn-settings" aria-label="Ustawienia">${icon('settings')}</button></header>
${navHtml('index')}
<main>
${banners.join('\n')}
<section id="tab-sygnal" class="tabpanel">${signalTab({ signals, explanation, config, research })}</section>
<section id="tab-portfel" class="tabpanel"><div id="portfel-root"><p class="muted">Ładowanie portfela…</p></div><noscript><p>Portfel wymaga włączonej obsługi JavaScript.</p></noscript></section>
<nav class="seg subnav" id="rynki-subnav" aria-label="Rynki i podatki" hidden><a href="#rynki" data-sub="rynki">Rynki i wiadomości</a><a href="#podatki" data-sub="podatki">Podatki, IKE i IKZE</a></nav>
<section id="tab-rynki" class="tabpanel">${rynkiTab({ macro, news, ai })}</section>
<section id="tab-podatki" class="tabpanel">${podatkiTab({ podatki, research, taxMonitor, now })}</section>
<footer><p><b>To nie jest porada inwestycyjna ani podatkowa.</b> Narzędzie mechanicznie realizuje opublikowaną strategię GEM (G. Antonacci, „Dual Momentum Investing”, 2014) i opisuje obowiązujące przepisy. Decyzje i ich skutki podatkowe należą do Ciebie.</p><p>Źródła danych: ${esc(meta.dataSource ?? '–')}; FRED; NBP; kanały RSS. Instrumenty sprawdzone w ofercie XTB (xtb.com/pl) w listopadzie 2026 r.</p></footer>
</main>
<div class="toast" id="toast" role="status" hidden></div>
${TX_DIALOG}
${SETTINGS_DIALOG(podatki)}
<script id="gem-data" type="application/json">${data}</script>
<script type="module">${clientScript()}</script>
</body></html>`;
}

export async function writeDashboard(dir, payload) {
  await mkdir(path.join(dir, 'data'), { recursive: true });
  await writeFile(path.join(dir, 'index.html'), renderDashboard(payload));
  const { config, research, podatki, prices, library, ...rest } = payload;
  await writeLibrary(dir, library ?? {});
  await writeFile(path.join(dir, 'data', 'latest.json'), JSON.stringify(rest, null, 1));
  if (prices) await writeFile(path.join(dir, 'data', 'prices.json'), JSON.stringify(prices));
  await writeFile(
    path.join(dir, 'manifest.webmanifest'),
    JSON.stringify(
      {
        name: 'GEM Monitor · XTB',
        short_name: 'GEM',
        start_url: './',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#112040',
        lang: 'pl',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      1,
    ),
  );
  for (const size of [180, 192, 512]) await writeFile(path.join(dir, `icon-${size}.png`), appIcon(size));
  await writeFile(path.join(dir, '.nojekyll'), '');
  // Import dynamiczny: financePage.js korzysta ze stylów i nawigacji z tego modułu.
  const { renderFinancePage, serviceWorker } = await import('./financePage.js');
  await writeFile(path.join(dir, 'finanse.html'), renderFinancePage({ prices: payload.prices, config: payload.config, library: payload.library }));
  await writeFile(path.join(dir, 'sw.js'), serviceWorker(payload.meta?.generatedAt ?? new Date().toISOString()));
}
