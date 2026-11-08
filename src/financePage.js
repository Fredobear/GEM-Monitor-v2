// Strona finanse.html (dziennik finansowy) i service worker (praca bez internetu).
// Dziennik ma politykę bezpieczeństwa „connect-src 'none'”: przeglądarka zablokuje każde połączenie sieciowe z tej strony.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS, HEAD_COMMON, navHtml } from './dashboard.js';
import { ACCOUNT_ICONS, ACCOUNT_TYPES, CURRENCIES, FREQS, GEM_ACCOUNTS, LOAN_KINDS, LOAN_RATE_TYPES } from './client/finance-core.js';
import { addDays } from './lib/dates.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Kursy NBP i ceny instrumentów dla dziennika (z danych pobieranych przez GitHub Actions do portfela GEM):
// ostatnie 100 dni dzień po dniu, wcześniej ostatni dzień każdego miesiąca. Trafiają do strony jako dane,
// więc dziennik nie musi niczego pobierać z sieci.
export function marketSnapshot(prices, config, podatki = null) {
  const thin = (pairs = []) => {
    if (!pairs.length) return [];
    const cut = addDays(pairs[pairs.length - 1][0], -100);
    return pairs.filter(([d], i) => d >= cut || i === pairs.length - 1 || pairs[i + 1][0].slice(0, 7) !== d.slice(0, 7));
  };
  const fx = Object.fromEntries(Object.entries(prices?.fx ?? {}).filter(([, p]) => p?.length).map(([c, p]) => [c, thin(p)]));
  const assets = {};
  for (const [ticker, inst] of Object.entries(prices?.instruments ?? {})) {
    if (!inst.series?.length && !inst.quotes?.length) continue;
    assets[ticker] = { name: inst.name ?? config?.portfolio?.instruments?.[ticker]?.name ?? ticker, currency: inst.currency, series: thin(inst.series), quotes: (inst.quotes ?? []).slice(-10) };
  }
  const latest = (list) => list.filter(Boolean).sort().at(-1) ?? null;
  // Limity wpłat IKE/IKZE (do paska limitu przy koncie powiązanym z portfelem GEM).
  const limits = Object.fromEntries(Object.entries(podatki?.limits ?? {}).map(([y, l]) => [y, { ike: l.ike, ikze: l.ikze, ikzeFirma: l.ikzeFirma, status: l.status }]));
  return { asOf: latest(Object.values(fx).map((p) => p.at(-1)[0])), pricesAsOf: latest(Object.values(assets).map((a) => a.series.at(-1)?.[0])), fx, assets, limits };
}

const FIN_CSS = `
.offline-badge{display:inline-block;background:var(--pos-soft);color:var(--pos);border-radius:999px;padding:3px 10px;font-weight:600;font-size:12px;white-space:nowrap}
.toast{display:flex;align-items:center;justify-content:space-between;gap:12px}
.toast-btn{background:transparent;border:1px solid currentColor;color:inherit;border-radius:9px;padding:4px 12px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}
.btn.danger-solid{background:var(--neg);border-color:var(--neg);color:var(--surface)}
.btn.danger-solid:disabled{opacity:.45;cursor:default}
.link.danger-text,.btn.danger-text{color:var(--neg)}
label.check{display:flex}
.check.opt{align-items:flex-start;margin:10px 0 4px}.check.opt>span{flex:1;min-width:0}.check.opt select{margin-top:6px;width:100%}.check.sub{margin-left:26px;align-items:flex-start}
.seg.set-seg button{font-size:12.5px;padding:6px 1px;overflow:hidden;text-overflow:ellipsis}
@media (max-width:400px){.seg.set-seg button{font-size:11.5px}}
.worth-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:2px 0 6px}
.worth-chart .wc-line{fill:none;stroke:var(--accent);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}
.worth-chart .wc-area{fill:color-mix(in srgb,var(--accent) 14%,transparent)}
.worth-chart .wc-dot{fill:var(--accent);stroke:var(--surface);stroke-width:2}
.worth-chart .wc-inc{fill:var(--pos)}.worth-chart .wc-exp{fill:var(--neg)}
.worth-chart .wc-axis{fill:var(--muted);font-size:10.5px}.worth-chart .wc-grid{stroke:var(--line)}
.worth-stats{margin-top:12px}
.inv-line{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0}.inv-line span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inv-line b{white-space:nowrap;font-variant-numeric:tabular-nums}
.acc-sub{display:block;font-size:12px;color:var(--muted);font-weight:500;text-align:right}
.map-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:4px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.map-row small{display:block;color:var(--muted);font-size:12px}.map-row .map-reason{grid-column:1/-1;margin-top:-2px}
.map-row select{width:100%;min-width:0}.row-inline{display:flex;gap:6px;min-width:0}.row-inline select{flex:1}
@media (max-width:520px){.map-row{grid-template-columns:1fr}}
.map-rec{align-items:flex-start;padding:6px 0}
.mm-h{font-size:15px;margin:18px 0 4px}
.lot-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid var(--line);border-radius:14px;padding:10px;margin:8px 0;background:var(--surface-2)}
.lot-inst{font-size:14px;line-height:1.35}
.amt-pop{border:0;background:transparent;color:inherit;font:inherit;padding:2px 4px;margin:-2px -4px;border-radius:6px;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
.amt-pop.strong{font-weight:700}
.amt-pop[aria-expanded=true]{background:var(--accent-soft);color:var(--accent);text-decoration:none}
.pop{position:absolute;z-index:40;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 12px 32px rgba(2,6,23,.25);padding:10px 12px}
.pop::before{content:'';position:absolute;top:-7px;left:calc(var(--arrow-x,50%) - 7px);width:12px;height:12px;background:var(--surface);border-left:1px solid var(--line);border-top:1px solid var(--line);transform:rotate(45deg)}
.pop-head{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin-bottom:4px}
.pop-head small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.pop-x{border:0;background:transparent;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:0 4px}
.pop-list{max-height:min(52vh,420px);overflow-y:auto;-webkit-overflow-scrolling:touch}
.pop-list .ftx:first-child{border-top:0}
#ld-picker,.ld-fund{border:1px solid var(--line);border-radius:14px;padding:8px 10px;margin:8px 0;background:var(--surface)}
.inv-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:2px 0 8px;padding:8px 10px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)}
.inv-sum>div{display:flex;flex-direction:column;min-width:0}.inv-sum span{font-size:11.5px;color:var(--muted)}.inv-sum b{font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.inv-pos{align-items:flex-start}.inv-pos>span{display:flex;flex-direction:column;white-space:normal!important}.inv-pos small{color:var(--muted);font-size:11.5px;white-space:normal}
@media (max-width:420px){.inv-sum b{font-size:12.5px}}
.lot-row .full{grid-column:1/-1}.lot-foot{display:flex;justify-content:space-between;gap:10px;align-items:center}
.doc-row{display:grid;grid-template-columns:30px minmax(0,1fr);gap:4px 10px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.doc-ico{font-size:22px;line-height:1}.doc-main b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.doc-main small{color:var(--muted);font-size:12.5px}
.doc-btns{grid-column:2;display:flex;flex-wrap:wrap;gap:6px}
.doc-chip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:6px 10px;margin:6px 0;font-size:13.5px}
.doc-chip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.doc-chip select{min-height:32px;padding:4px 6px;font-size:14px}
#dv-body img{display:block;max-width:100%;border-radius:12px;margin:0 auto}
@media (max-width:760px){main{padding-bottom:calc(110px + env(safe-area-inset-bottom,0px))}.card{padding:15px}}
input,select,textarea{font-size:16px}
button,label,summary{touch-action:manipulation}
dialog{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.two>*,.field{min-width:0}.field select,.field input{width:100%;min-width:0}
.fin-tabs{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:4px;margin:12px 0 2px;box-shadow:var(--shadow)}
.fin-tabs button{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:11.5px;font-weight:600;letter-spacing:-.01em;padding:7px 0 6px;border-radius:12px;cursor:pointer;min-width:0;white-space:nowrap}
.fin-tabs .ic{width:21px;height:21px}
.fin-tabs button.on{background:var(--accent-soft);color:var(--accent)}
@media (max-width:380px){.fin-tabs button{font-size:10.5px}}
@media (min-width:761px){.fin-tabs{display:flex;gap:4px;width:max-content;max-width:100%}.fin-tabs button{flex-direction:row;gap:7px;font-size:14px;padding:8px 14px}}
.hero-bal{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;font:inherit;color:var(--ink);cursor:pointer;background:linear-gradient(135deg,var(--accent-soft),var(--surface) 75%)}
.hb-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.hb-val{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15}
.hb-chev{font-size:30px;line-height:1;color:var(--muted)}
.period{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.period-seg,.set-seg{display:flex;width:100%}.seg.period-seg button,.seg.set-seg button{flex:1;padding:6px 2px;min-width:0}
.pswitch{display:flex;align-items:center;gap:10px}
.pswitch b{flex:1;text-align:center;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pswitch .icon-btn{font-size:22px}
.period .dates{justify-content:center;margin:0}
.back-today{text-align:center;margin-top:-2px}
.kind-toggle{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:4px}
.kind-toggle button{border:0;background:transparent;border-radius:11px;padding:7px 6px;font:inherit;cursor:pointer;color:var(--muted);display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.25;min-width:0}
.kind-toggle span{font-size:12.5px;font-weight:600}
.kind-toggle b{font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.kind-toggle button.on{background:var(--surface);box-shadow:0 1px 3px rgba(15,23,42,.14);color:var(--ink)}
.kind-toggle .exp.on b{color:var(--neg)}.kind-toggle .inc.on b{color:var(--pos)}
.net-line{text-align:center;font-size:13.5px;margin:10px 0 0}
.donut{display:block;width:200px;height:200px;margin:6px auto 2px}
.donut-v{font-size:16px;font-weight:800;fill:var(--ink)}.donut-l{font-size:10.5px;fill:var(--muted)}
.big-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 4px}
.big-btn{border:0;border-radius:16px;min-height:54px;font:inherit;font-weight:700;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--surface)}
.big-btn i{font-style:normal;font-size:27px;line-height:1;font-weight:700;margin-top:-3px}
.big-btn.exp{background:var(--neg)}.big-btn.inc{background:var(--pos)}
.cat-ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:19px;line-height:1;background:color-mix(in srgb,var(--c,#94a3b8) 20%,var(--surface));flex:none}
.cat-rows{list-style:none;margin:8px 0 0;padding:0}.cat-rows>li{border-top:1px solid var(--line)}
.cat-line{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;background:transparent;border:0;padding:10px 2px;font:inherit;color:var(--ink);cursor:pointer;text-align:left}
.cat-name b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cat-name small{display:block;font-size:12px;margin-top:3px}
.cat-bar{display:block;height:5px;border-radius:9px;background:var(--line);margin-top:6px;overflow:hidden}.cat-bar>span{display:block;height:100%;background:var(--c);border-radius:9px}
.cat-amt{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.cat-amt b{display:block}.cat-amt small{color:var(--muted);font-size:12px}
.cat-tx{margin:0 0 8px 50px}
.cat-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.cat-row .num{white-space:nowrap}
.cat-list{list-style:none;padding:0;margin:0}.cat-list li{padding:8px 0;border-top:1px solid var(--line)}.cat-list li:first-child{border-top:0}
.cat-chip{display:inline-block;font-size:12px;border-radius:999px;padding:1px 8px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--ink);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
.cat-chip.none{--c:#94a3b8}
.cat-grid{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.cat-pick{border:1px solid color-mix(in srgb,var(--c) 45%,var(--line));background:color-mix(in srgb,var(--c) 10%,var(--surface));color:var(--ink);border-radius:999px;padding:7px 11px;font:inherit;font-size:13.5px;cursor:pointer}
.cat-pick.on{background:var(--c);border-color:var(--c);color:#fff;font-weight:700}
.ftx{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;background:transparent;border:0;border-top:1px solid var(--line);padding:9px 2px;color:var(--ink);font:inherit;cursor:pointer}
.ftx:hover,.cat-line:hover{background:var(--surface-2)}
.ftx-main{min-width:0}.ftx-main b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ftx-main small{display:block;color:var(--muted);font-size:12.5px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ftx-amt{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.ftx-amt small{display:block;color:var(--muted);font-weight:400;font-size:12px}
.ftx.plan .cat-ico{background:transparent;border:1.5px dashed color-mix(in srgb,var(--c,#94a3b8) 60%,var(--line))}.ftx.plan .ftx-amt{color:var(--muted)}
.day-sep{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:16px 0 4px}
.cal-sum{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 16px;font-size:13px;color:var(--muted);margin:8px 0 12px}
.cal-sum b{font-variant-numeric:tabular-nums}
.cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.cal-dow{font-size:11px;color:var(--muted);text-align:center;font-weight:700;padding-bottom:2px}
.cal-day{position:relative;min-height:52px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--neg) var(--h,0%),var(--surface));color:var(--ink);font:inherit;padding:6px 1px 5px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:2px;min-width:0}
.cal-day .d{font-size:13.5px;font-weight:700;line-height:1.1}
.cal-day .v{font-size:10.5px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;max-width:100%;overflow:hidden}
.cal-day.future{background:var(--surface-2)}.cal-day.future .d{color:var(--muted)}
.cal-day.today{border:2px solid var(--accent);padding:5px 0 4px}
.cal-day.sel{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.cal-day.sel .d{color:var(--accent-ink)}
.cal-day.out{visibility:hidden}
.inc-dot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--pos)}
.plan-dot{position:absolute;top:2px;left:4px;font-size:10px;font-style:normal;font-weight:800;color:var(--accent)}
.cal-day.sel .plan-dot{color:var(--accent-ink)}.cal-day.sel .inc-dot{background:var(--accent-ink)}
.cal-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;align-items:center}
.cal-legend .inc-dot,.cal-legend .plan-dot{position:static;display:inline-block;vertical-align:middle;margin-right:5px}
.lg-heat{display:inline-block;width:12px;height:12px;border-radius:4px;background:color-mix(in srgb,var(--neg) 40%,var(--surface));vertical-align:-2px;margin-right:5px}
.day-title{margin:0;font-size:17px}
.day-tot{display:flex;gap:10px;font-variant-numeric:tabular-nums}
.sum3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.sum3>div{display:flex;flex-direction:column;min-width:0}
.sum3 span{font-size:12.5px;color:var(--muted)}.sum3 b{font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sum3 small{color:var(--muted);font-size:11.5px}
@media (max-width:420px){.sum3 b{font-size:14.5px}}
.acc-list{list-style:none;padding:0;margin:0}
.acc-item{border-top:1px solid var(--line);padding:12px 0}.acc-item:first-child{border-top:0;padding-top:2px}
.acc-line{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center}
.acc-ico{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:22px;line-height:1;background:color-mix(in srgb,var(--c,var(--accent)) 16%,var(--surface));border:1px solid color-mix(in srgb,var(--c,var(--accent)) 28%,var(--line))}
.acc-main{min-width:0}.acc-main b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.acc-main small{color:var(--muted);font-size:12.5px}
.acc-bal{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
.acc-more{margin-left:56px}.acc-more .meter{margin:10px 0 4px}
.acc-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ln-sec{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px;border-top:1px solid var(--line);padding-top:12px}
#ad-loan .typesel{margin-bottom:6px}
.loan-line{font-size:13px;margin:4px 0;line-height:1.45}.loan-line b{font-variant-numeric:tabular-nums}
.loan-kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:6px 0 10px}
.loan-kpi>div{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:8px 10px;min-width:0}
.loan-kpi span{display:block;font-size:11.5px;color:var(--muted)}.loan-kpi b{display:block;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.loan-kpi small{color:var(--muted);font-size:11.5px}
@media (max-width:420px){.loan-kpi{grid-template-columns:1fr 1fr}.loan-kpi b{font-size:13.5px}}
.kv{width:100%;border-collapse:collapse;font-size:13.5px}.kv td{padding:6px 0;border-bottom:1px solid var(--line)}.kv td:last-child{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.lv-box{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin:10px 0;background:var(--surface-2)}
.lv-box h4{margin:0 0 8px;font-size:14px}
.sched{width:100%;border-collapse:collapse;font-size:12.5px}.sched th,.sched td{padding:5px 4px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.sched th:first-child,.sched td:first-child{text-align:left}.sched tr.now td{font-weight:700;background:var(--accent-soft)}.sched tr.op td{color:var(--pos)}.sched tr.past td{color:var(--muted)}
.sched-wrap{max-height:340px;overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:10px}
.rate-list{list-style:none;padding:0;margin:6px 0}.rate-list li{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:3px 0}
.ike-line{font-size:13px;margin:6px 0}
.acc-head{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;margin:4px 0 12px}
.pend-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.pend-row:first-of-type{border-top:0}
.pend-main{min-width:0}.pend-main b{display:block}.pend-main small{color:var(--muted);font-size:12.5px}
.pend-amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pend-btns{grid-column:2/-1;display:flex;gap:6px}
.card.pend{border-color:color-mix(in srgb,var(--warn) 50%,var(--line))}
.start-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:12px}
.start{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;border:1px solid var(--line);background:var(--surface-2);border-radius:16px;padding:14px;font:inherit;color:var(--ink);cursor:pointer}
.start span{font-size:26px;line-height:1.2}.start small{color:var(--muted)}
.mm-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:10px 0}
@media (max-width:520px){.mm-stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
.mm-stats div{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:8px 4px;text-align:center}
.mm-stats b{display:block;font-size:18px;font-variant-numeric:tabular-nums}.mm-stats span{font-size:12px;color:var(--muted)}
.mm-acc{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--line)}
.inbox-item{border-top:1px solid var(--line);padding:12px 0}
.filters{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px}.filters>*{min-width:0;width:100%}
@media (max-width:760px){.filters{grid-template-columns:1fr 1fr}.filters input{grid-column:1/-1}}
.bars-wrap{overflow-x:auto}.bars{display:block;max-width:none}
.bars .axis{fill:var(--muted);font-size:10.5px}.bars .axis-line{stroke:var(--line)}
.legend-row{display:flex;gap:14px;font-size:12.5px;color:var(--muted);margin-top:6px}
.cat-edits{display:flex;flex-direction:column;gap:6px}
.cat-edit{display:grid;grid-template-columns:52px 1fr 46px 110px auto;gap:6px;align-items:center}
@media (max-width:560px){.cat-edit{grid-template-columns:48px 1fr 42px}.cat-edit input[name=budget]{grid-column:1/-1}.cat-edit .row-inline{grid-column:1/-1;justify-content:flex-end;gap:18px}}
.cat-edit input[type=color]{padding:2px;min-height:40px;width:100%}
input.emoji{text-align:center;font-size:18px;padding:6px;width:52px}
textarea{width:100%;font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0}
tfoot td{border-bottom:0}
.amount-input{font-size:30px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
form[data-type=wydatek] .amount-input{color:var(--neg)}form[data-type=przychod] .amount-input{color:var(--pos)}
.type3{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.type3 label{position:relative}
.type3 input{position:absolute;opacity:0;pointer-events:none}
.type3 span{display:block;text-align:center;border:1px solid var(--line);border-radius:12px;padding:9px 4px;font-weight:700;cursor:pointer;color:var(--muted)}
.type3 input[value=wydatek]:checked+span{background:var(--neg);border-color:var(--neg);color:var(--surface)}
.type3 input[value=przychod]:checked+span{background:var(--pos);border-color:var(--pos);color:var(--surface)}
.type3 input[value=przelew]:checked+span{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.type3 input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.dlg-hint{background:var(--accent-soft);border-radius:10px;padding:8px 10px;font-size:13px;margin:0}
.dlg-hint:empty{display:none}
.field small{font-size:12px;color:var(--muted)}
`;

const ICONS = {
  przeglad: '<path d="M11 3.6a8.5 8.5 0 1 0 9.4 9.4H11z"/><path d="M14 3.2a7.6 7.6 0 0 1 6.8 6.8H14z"/>',
  kalendarz: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2"/>',
  operacje: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.8"/>',
  konta: '<path d="M5 7.5v-.7a2.3 2.3 0 0 1 2.3-2.3H17"/><rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M16 13.5h1.5"/>',
  stale: '<path d="M17 2.5l3 3-3 3"/><path d="M4 11v-1.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/>',
  ustawienia: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};
const TABS = [['przeglad', 'Przegląd'], ['kalendarz', 'Kalendarz'], ['operacje', 'Operacje'], ['konta', 'Konta'], ['stale', 'Stałe'], ['ustawienia', 'Więcej']];

const typeRadios = () => `<div class="type3" role="radiogroup" aria-label="Typ">${[['wydatek', 'Wydatek'], ['przychod', 'Przychód'], ['przelew', 'Przelew']].map(([v, l]) => `<label><input type="radio" name="type" value="${v}"><span>${l}</span></label>`).join('')}</div>`;
const actions = (del = '', extra = '', submit = 'Zapisz') =>
  `<div class="dlg-actions">${del}${extra}<span style="flex:1"></span><button type="button" class="btn ghost" data-close>Anuluj</button><button type="submit" class="btn primary">${submit}</button></div>`;

const currencyOptions = () => CURRENCIES.map((c) => `<option value="${c}">${c === 'PLN' ? 'PLN – złoty' : c}</option>`).join('');

const TX_DIALOG = `<dialog id="fin-dialog"><form method="dialog" novalidate>
<h3 id="fd-title">Nowa operacja</h3>
<div id="fd-types">${typeRadios()}</div>
<p class="dlg-hint" id="fd-korekta" hidden>⚖️ Korekta salda zmienia saldo konta (saldo początkowe, wycena konta inwestycyjnego, wyrównanie do banku), ale nie liczy się do wydatków ani przychodów. Gdy saldo maleje, wpisz kwotę z minusem.</p>
<label class="field"><span id="fd-amount-label">Kwota (zł)</span><input name="amount" class="amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
<p class="small muted" id="fd-fx" hidden></p>
<div id="fd-cats-wrap"><div class="small muted">Kategoria</div><div class="cat-grid" id="fd-cats"></div></div>
<div class="two"><label class="field"><span id="fd-acc-label">Konto</span><select name="accountId"></select></label><label class="field">Data<input type="date" name="date"></label></div>
<label class="field" id="fd-to" hidden>Na konto<select name="toAccountId"></select></label>
<label class="field" id="fd-to-amount-wrap" hidden><span id="fd-to-amount-label">Na konto wpłynie</span><input name="toAmount" inputmode="decimal" placeholder="0,00" autocomplete="off"><small>Wpisz kwotę, która faktycznie wpłynęła (np. po kursie z XTB). Domyślnie liczę po kursie NBP.</small></label>
<p class="dlg-hint" id="fd-hint" hidden></p>
<label class="check small" id="fd-gem" hidden><input type="checkbox" name="gem"> <span id="fd-gem-label">Zapisz też w portfelu GEM</span></label>
<label class="field">Opis / sprzedawca<input name="merchant" maxlength="80" placeholder="np. Biedronka"></label>
<label class="field">Notatka<input name="note" maxlength="1000"></label>
<label class="field" id="fd-repeat">Powtarzaj<select name="repeat"><option value="">Nie powtarzaj</option>${Object.entries(FREQS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
<div id="fd-docs-wrap"><div class="small muted" id="fd-docs-title">Dokumenty</div><div id="fd-docs"></div><button type="button" class="btn small" id="fd-doc-add">📎 Dodaj dokument</button><input type="file" id="fd-doc-file" accept="application/pdf,image/*" hidden></div>
<label class="check small" id="fd-remember"><input type="checkbox" name="remember"> Zapamiętaj kategorię dla tego sprzedawcy</label>
<div class="errors" id="fd-errors" role="alert"></div>
${actions('<button type="button" class="btn danger" id="fd-delete" hidden>Usuń…</button>')}
</form></dialog>`;

const ACC_DIALOG = `<dialog id="acc-dialog"><form method="dialog" novalidate>
<h3 id="ad-title">Nowe konto</h3>
<label class="field">Nazwa<input name="name" maxlength="60" placeholder="np. mBank – konto osobiste" autocomplete="off"></label>
<div class="field"><span>Rodzaj</span><div class="typesel" role="radiogroup" aria-label="Rodzaj konta">${Object.entries(ACCOUNT_TYPES).map(([k, l]) => `<label><input type="radio" name="type" value="${k}"><span>${ACCOUNT_ICONS[k]} ${l}</span></label>`).join('')}</div></div>
<label class="field">Waluta<select name="currency">${currencyOptions()}</select><small id="ad-currency-hint">Konto w innej walucie liczy się do majątku po bieżącym kursie średnim NBP.</small></label>
<label class="field" id="ad-plain"><span id="ad-balance-label">Saldo obecne (zł)</span><input name="balance" inputmode="decimal" placeholder="0,00" autocomplete="off"><small id="ad-balance-hint">Ile jest teraz na koncie. Każda zapisana operacja zmieni to saldo.</small></label>
<div id="ad-card" hidden>
<label class="field">Zadłużenie na karcie (zł)<input name="debt" inputmode="decimal" placeholder="0,00" autocomplete="off"><small>Kwota do spłaty, np. 1250. Saldo karty będzie ujemne, a każdy wydatek tą kartą je powiększy.</small></label>
<div class="two"><label class="field">Limit karty (zł)<input name="limit" inputmode="decimal" placeholder="np. 5000" autocomplete="off"></label><label class="field">Dzień spłaty<input name="dueDay" inputmode="numeric" placeholder="np. 25" maxlength="2" autocomplete="off"></label></div>
<div class="two"><label class="field">Oprocentowanie karty (% rocznie)<input name="cardRate" inputmode="decimal" placeholder="np. 18,5" autocomplete="off"></label><label class="field">Minimalna spłata (% zadłużenia)<input name="minPayPct" inputmode="decimal" placeholder="np. 3" autocomplete="off"></label></div>
<label class="field">Spłacaj z konta<select name="payFromId"></select></label>
</div>
<div id="ad-loan" hidden>
<label class="field">Rodzaj<select name="lnKind">${Object.entries(LOAN_KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
<div class="two"><label class="field">Kwota kredytu z umowy (zł)<input name="lnAmount" inputmode="decimal" placeholder="np. 300 000" autocomplete="off"></label><label class="field">Data uruchomienia<input type="date" name="lnStart"></label></div>
<label class="field">Liczba rat w umowie (miesięcy)<input name="lnMonths" inputmode="numeric" placeholder="np. 360 (30 lat)" autocomplete="off"></label>
<label class="check small"><input type="checkbox" name="lnExisting"> <span>Kredyt jest już spłacany – podam stan na dziś z aplikacji banku (dokładniej)</span></label>
<div id="ad-ln-existing" hidden><div class="two"><label class="field">Kapitał do spłaty dziś<input name="lnRemaining" inputmode="decimal" placeholder="np. 285 120,45" autocomplete="off"></label><label class="field">Pozostało rat<input name="lnLeft" inputmode="numeric" placeholder="np. 340" autocomplete="off"></label></div>
<label class="field">Termin najbliższej raty<input type="date" name="lnNextDue"></label></div>
<label class="field" id="ad-ln-first">Termin pierwszej raty<input type="date" name="lnFirstDue"><small>Zwykle miesiąc po uruchomieniu. Ten sam dzień miesiąca to dzień każdej kolejnej raty.</small></label>
<div class="ln-sec">Oprocentowanie</div>
<div class="typesel" role="radiogroup" aria-label="Oprocentowanie">${Object.entries(LOAN_RATE_TYPES).map(([k, l]) => `<label><input type="radio" name="lnRateType" value="${k}"><span>${l.split(' (')[0]}</span></label>`).join('')}</div>
<label class="field" id="ad-ln-fixed">Oprocentowanie (% rocznie)<input name="lnRate" inputmode="decimal" placeholder="np. 7,35" autocomplete="off"><small>Oprocentowanie nominalne z umowy (nie RRSO).</small></label>
<div id="ad-ln-var" hidden><div class="two"><label class="field">Stawka referencyjna<select name="lnRefName">${['WIBOR 3M', 'WIBOR 6M', 'WIRON 1M', 'WIRON 3M', 'EURIBOR 3M', 'EURIBOR 6M', 'inna'].map((x) => `<option>${x}</option>`).join('')}</select></label><label class="field">Wartość stawki (%)<input name="lnRef" inputmode="decimal" placeholder="np. 4,21" autocomplete="off"></label></div>
<label class="field">Marża banku (%)<input name="lnMargin" inputmode="decimal" placeholder="np. 2,10" autocomplete="off"></label></div>
<label class="field" id="ad-ln-fixed-until">Stała stopa do (opcjonalnie)<input type="date" name="lnFixedUntil"><small>Przy okresowo stałej stopie (np. na 5 lat) przypomnę, kiedy się kończy.</small></label>
<div class="ln-sec">Raty</div>
<div class="two"><label class="field">Rodzaj rat<select name="lnInstallments"><option value="rowne">równe (annuitetowe)</option><option value="malejace">malejące</option></select></label><label class="field">Karencja (mies., opcjonalnie)<input name="lnGrace" inputmode="numeric" placeholder="0" autocomplete="off"></label></div>
<label class="field">Rata z harmonogramu banku (opcjonalnie)<input name="lnPayment" inputmode="decimal" placeholder="wyliczę sam" autocomplete="off"><small>Wpisz, jeśli bank podaje inną ratę niż wyliczona. Obowiązuje do najbliższej zmiany oprocentowania.</small></label>
<div class="ln-sec">Koszty</div>
<div class="two"><label class="field">Prowizja (zł)<input name="lnFee" inputmode="decimal" placeholder="0" autocomplete="off"></label><label class="field">Ubezpieczenie i opłaty miesięcznie (zł)<input name="lnInsurance" inputmode="decimal" placeholder="0" autocomplete="off"></label></div>
<label class="check small"><input type="checkbox" name="lnFeeFinanced"> <span>Prowizja doliczona do kwoty kredytu (kredytowana)</span></label>
<div class="ln-sec">Spłata</div>
<label class="field">Spłacam z konta<select name="lnPayFrom"></select></label>
<label class="check small"><input type="checkbox" name="lnAuto"> <span>Zapisuj raty w dzienniku w dniu terminu: część kapitałowa jako przelew na kredyt, odsetki i opłaty jako wydatek „Kredyty i odsetki”</span></label>
<p class="dlg-hint" id="ad-ln-preview"></p>
</div>
<div id="ad-gem" hidden>
<label class="field">Rachunek w portfelu GEM<select name="gemAccount"><option value="">— nie łącz —</option>${Object.entries(GEM_ACCOUNTS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><small>Przelew na to konto zapisze się też jako wpłata w zakładce GEM → Mój portfel GEM (liczy się do limitu IKE/IKZE).</small></label>
<label class="check small"><input type="checkbox" name="gemValuation"> <span>Wartość konta według wyceny portfela GEM (bez dodawania aktywów tutaj)</span></label>
</div>
<label class="field">Karty w Apple Pay (nazwy z Portfela, po przecinku)<input name="cards" placeholder="np. mBank Visa"></label>
<label class="check small"><input type="checkbox" name="excludeFromTotal"> Nie wliczaj do salda łącznego</label>
<div class="errors" id="ad-errors" role="alert"></div>
${actions('<button type="button" class="btn danger" id="ad-delete" hidden>Usuń…</button>', '<button type="button" class="btn ghost" id="ad-archive" hidden>Ukryj</button>')}
</form></dialog>`;

const REC_DIALOG = `<dialog id="rec-dialog"><form method="dialog" novalidate>
<h3 id="rd-title">Nowa stała pozycja</h3>
${typeRadios()}
<label class="field">Nazwa<input name="title" maxlength="60" placeholder="np. Czynsz, Wynagrodzenie, Netflix" autocomplete="off"></label>
<label class="field"><span id="rd-amount-label">Kwota (zł)</span><input name="amount" class="amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
<div id="rd-cats-wrap"><div class="small muted">Kategoria</div><div class="cat-grid" id="rd-cats"></div></div>
<label class="field"><span id="rd-acc-label">Konto</span><select name="accountId"></select></label>
<label class="field" id="rd-to" hidden>Na konto<select name="toAccountId"></select></label>
<div class="two"><label class="field">Jak często<select name="freq">${Object.entries(FREQS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label class="field">Najbliższy termin<input type="date" name="nextDate"></label></div>
<label class="field">Ostatni termin (opcjonalnie)<input type="date" name="endDate"></label>
<label class="check small"><input type="checkbox" name="auto"> Zapisuj automatycznie w dniu terminu</label>
<p class="dlg-hint" id="rd-hint"></p>
<label class="check small" id="rd-paused-wrap"><input type="checkbox" name="paused"> Wstrzymaj (bez kolejnych terminów)</label>
<div class="errors" id="rd-errors" role="alert"></div>
${actions('<button type="button" class="btn danger" id="rd-delete" hidden>Usuń…</button>')}
</form></dialog>`;

const REPAY_DIALOG = `<dialog id="repay-dialog"><form method="dialog" novalidate>
<h3 id="rp-title">Spłata karty</h3>
<p class="small" id="rp-debt"></p>
<label class="field">Kwota spłaty (zł)<input name="amount" class="amount-input" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
<div class="chips"><button type="button" class="chip-btn" id="rp-full">Całe zadłużenie</button></div>
<div class="two"><label class="field">Z konta<select name="fromId"></select></label><label class="field">Data<input type="date" name="date"></label></div>
<p class="dlg-hint" id="rp-after"></p>
<div class="errors" id="rp-errors" role="alert"></div>
${actions('', '', 'Spłać kartę')}
</form></dialog>`;

// Pozycje konta inwestycyjnego: ETF-y z listy (wycena co dzień roboczy) i aktywa z wyceną ręczną.
const LOTS_DIALOG = `<dialog id="lots-dialog"><form method="dialog" novalidate>
<h3 id="ld-title">Aktywa na koncie</h3>
<p class="small muted" id="ld-info"></p>
<div id="ld-rows"></div>
<div class="row-btns"><button type="button" class="btn small" id="ld-add">+ Instrument z XTB</button><button type="button" class="btn small" id="ld-add-fund">+ Fundusz ING TFI (PPE)</button><button type="button" class="btn small ghost" id="ld-add-manual">+ Inne aktywo (wycena ręczna)</button></div>
<div id="ld-picker" hidden></div>
<div id="ld-fund" class="ld-fund" hidden>
<label class="field">Fundusz<select id="ldf-fund"></select></label>
<label class="field">Kategoria jednostek<select id="ldf-cat"></select></label>
<p class="small" id="ldf-info"></p>
<p class="small muted">Kategorię jednostek znajdziesz w serwisie ING TFI24 przy nazwie funduszu albo w umowie PPE pracodawcy (w PPE zwykle E, F, S, T lub W). Każda kategoria ma inną cenę jednostki, więc wybierz właściwą.</p>
<div class="row-btns"><button type="button" class="btn small primary" id="ldf-ok">Dodaj fundusz</button></div>
</div>
<label class="check small"><input type="checkbox" name="settle"> <span>Rozlicz zmianę z wolną gotówką na koncie (kupno ją zmniejsza, sprzedaż zwiększa)</span></label>
<p class="dlg-hint" id="ld-sum"></p>
<div class="errors" id="ld-errors" role="alert"></div>
${actions()}
</form></dialog>`;

// Szczegóły kredytu: podsumowanie, koszty, oprocentowanie, nadpłata, symulacje i harmonogram (treść z finance-ui.js).
const LOAN_DIALOG = `<dialog id="loan-dialog"><form method="dialog" novalidate>
<h3 id="lv-title">Kredyt</h3>
<div id="lv-body"></div>
<div class="errors" id="lv-errors" role="alert"></div>
<div class="dlg-actions"><button type="button" class="btn ghost" id="lv-edit">Edytuj parametry</button><span style="flex:1"></span><button type="button" class="btn" data-close>Zamknij</button></div>
</form></dialog>`;

// Potwierdzenie operacji, których nie da się łatwo odwrócić (usuwanie, nadpisanie danych).
const CONFIRM_DIALOG = `<dialog id="confirm-dialog"><form method="dialog" novalidate>
<h3 id="cf-title"></h3>
<div id="cf-body" class="small"></div>
<div id="cf-extra"></div>
<label class="check small" id="cf-ack-wrap" hidden><input type="checkbox" id="cf-ack"> <span id="cf-ack-label"></span></label>
<div class="dlg-actions"><span style="flex:1"></span><button type="button" class="btn ghost" data-close>Anuluj</button><button type="submit" class="btn danger-solid" id="cf-ok">Usuń</button></div>
</form></dialog>`;

const DOC_DIALOG = `<dialog id="doc-dialog"><form method="dialog" novalidate>
<h3 id="dv-title"></h3>
<div id="dv-body"></div>
<div class="dlg-actions"><span style="flex:1"></span><button type="button" class="btn" id="dv-share">Udostępnij / zapisz</button><button type="button" class="btn primary" data-close>Zamknij</button></div>
</form></dialog>`;

export function renderFinancePage({ prices = null, config = null, podatki = null } = {}) {
  const read = (name) => readFileSync(path.join(HERE, 'client', name), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
  const market = JSON.stringify(marketSnapshot(prices, config, podatki)).replace(/</g, '\\u003c');
  // blob: tylko do podglądu dokumentów zapisanych na urządzeniu; połączenia sieciowe nadal zablokowane.
  const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; worker-src 'self'; manifest-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'";
  return `<!doctype html><html lang="pl"><head>${HEAD_COMMON}
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Finanse · GEM</title>
<style>${CSS}${FIN_CSS}</style></head><body>
<header class="topbar"><div class="brand"><img src="icon-192.png" alt="">Finanse <span>· offline</span></div><div class="updated"><span class="offline-badge">🔒 tylko na tym urządzeniu</span></div></header>
${navHtml('finanse')}
<main>
<nav class="fin-tabs" id="fin-nav" aria-label="Dziennik">${TABS.map(([k, l]) => `<button data-view="${k}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${l}</span></button>`).join('')}</nav>
<div id="fin-root"><p class="muted">Ładowanie…</p></div>
<footer><p><b>Prywatność:</b> dziennik działa bez internetu. Dane i dokumenty są zapisane wyłącznie w pamięci tej przeglądarki na tym urządzeniu. Strona ma zablokowane wszystkie połączenia sieciowe (Content-Security-Policy: connect-src 'none'), więc nie może wysłać danych nigdzie, także na GitHub. Kursy NBP i ceny ETF-ów strategii są dołączane do strony przy każdej aktualizacji aplikacji, a ceny pozostałych akcji i ETF-ów z oferty XTB oraz wyceny funduszy ING TFI strona wczytuje z plików aplikacji (data/notowania.js, data/fundusze.js) – to tylko pobranie gotowego pliku, bez wysyłania jakichkolwiek danych. Kopię zapasową tworzysz ręcznie w zakładce Więcej.</p></footer>
</main>
<div class="toast" id="toast" role="status" hidden></div>
${TX_DIALOG}${ACC_DIALOG}${REC_DIALOG}${REPAY_DIALOG}${LOTS_DIALOG}${LOAN_DIALOG}${CONFIRM_DIALOG}${DOC_DIALOG}
<noscript><p>Dziennik wymaga włączonej obsługi JavaScript.</p></noscript>
<script type="application/json" id="fin-market">${market}</script>
<script type="module">${read('finance-core.js')}\n${read('instruments.js')}\n${read('mmbackup.js')}\n${read('finance-ui.js')}</script>
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
