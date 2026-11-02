// Powiadomienia na telefon: Telegram (bot) i/lub ntfy (aplikacja push, bez zakładania konta).
import { fetchWithRetry } from './lib/http.js';
import { monthNamePL, datePL } from './lib/dates.js';
import { fmtPct } from './explain.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const DISCLAIMER = 'Narzędzie mechanicznie realizuje strategię GEM. To nie jest porada inwestycyjna.';

function momentumLine(returns, config, keys) {
  return keys.filter((k) => Number.isFinite(returns[k])).map((k) => `${config.assets[k].name} ${fmtPct(returns[k])}`).join(' | ');
}

export function signalMessage({ signals, explanation, macro, ai, config, dashboardUrl, firstRun = false }) {
  const { official, rules } = signals;
  const t = explanation.target;
  const icon = explanation.action.type === 'zmiana' ? '🔄' : explanation.action.type === 'kup' ? '🟢' : '✅';
  const parts = [
    `📊 <b>GEM – sygnał na ${esc(monthNamePL(official.forMonth))}</b>`,
    `${icon} <b>${esc(explanation.action.text)}</b>`,
    ...(firstRun ? [`Pierwsze uruchomienie narzędzia: jeśli nie masz jeszcze pozycji w strategii, obecny sygnał oznacza zakup ${esc(t.ticker)}.`] : []),
    `${esc(t.name)}\nISIN ${esc(t.isin)} · ${esc(t.exchange)} · ${esc(t.currency)}`,
    `<b>Dlaczego:</b>\n${explanation.reasons.slice(0, 2).map((r) => `• ${esc(r)}`).join('\n')}`,
    `<b>${esc(explanation.stabilityText)}</b>`,
    `<b>Momentum ${rules.lookbackMonths}M:</b> ${esc(momentumLine(official.returns, config, [...rules.equities, rules.hurdle, ...rules.safe.filter((s) => s !== rules.hurdle)]))}`,
  ];
  if (macro?.summary) parts.push(`<b>Ryzyko rynkowe:</b> ${esc(macro.summary)}`);
  if (ai?.text) parts.push(`<b>Kontekst (AI):</b>\n${esc(ai.text.replace(/\*\*/g, '').slice(0, 1400))}`);
  parts.push(`<b>Wykonanie:</b> ${esc(explanation.execution[0])}`);
  if (explanation.currency?.length) {
    const [ike, ...regular] = explanation.currency;
    const reg = regular.map((r) => `${r.key.endsWith('PLN') ? 'nowe PLN' : `masz ${r.key.slice(-3)}`} → ${r.ticker}`).join(', ');
    parts.push(`<b>Waluta zakupu:</b> IKE/IKZE w XTB: ${esc(ike.ticker)} (rachunek w PLN, 0,5% przewalutowania). Konto zwykłe: ${esc(reg)}.`);
  }
  if (dashboardUrl) parts.push(`🔗 ${esc(dashboardUrl)}`);
  parts.push(`<i>${DISCLAIMER}</i>`);
  return {
    title: `GEM ${monthNamePL(official.forMonth)}: ${explanation.action.text}`,
    html: parts.join('\n\n'),
    priority: explanation.action.type === 'trzymaj' ? 3 : 5,
    tags: [explanation.action.type === 'zmiana' ? 'rotating_light' : 'chart_with_upwards_trend'],
  };
}

export function previewFlipMessage({ signals, config, dashboardUrl }) {
  const { official, preview } = signals;
  const p = config.assets[preview.decision.asset];
  const o = config.assets[official.decision.asset];
  if (!preview.differsFromOfficial) {
    const html = [
      '✅ <b>GEM – wstępny sygnał wrócił do obowiązującego</b>',
      `Na dziś (dane do ${esc(datePL(preview.asOf))}) ponownie prowadzi ${esc(o.xtb.ticker)}, zgodnie z sygnałem na ${esc(monthNamePL(official.forMonth))}.`,
      dashboardUrl ? `🔗 ${esc(dashboardUrl)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return { title: 'GEM: wstępny sygnał zgodny z obowiązującym', html, priority: 3, tags: ['white_check_mark'] };
  }
  const html = [
    '⚠️ <b>GEM – zmienił się wstępny sygnał</b>',
    `Na dziś (dane do ${esc(datePL(preview.asOf))}) prowadzi rynek „${esc(p.name)}” (${esc(p.xtb.ticker)}). Obowiązujący sygnał na ${esc(monthNamePL(official.forMonth))}: ${esc(o.xtb.ticker)}.`,
    `Nie zmieniaj pozycji przed końcem miesiąca (${esc(datePL(signals.nextDecisionDate))}). Wstępny sygnał może jeszcze wrócić. Sygnał oficjalny przyjdzie w osobnej wiadomości.`,
    dashboardUrl ? `🔗 ${esc(dashboardUrl)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { title: 'GEM: zmiana wstępnego sygnału', html, priority: 4, tags: ['warning'] };
}

export function digestMessage({ signals, explanation, macro, news, ai, dashboardUrl }) {
  const lines = [
    '🗞️ <b>GEM – podsumowanie tygodnia</b>',
    `Obowiązuje: <b>${esc(explanation.target.ticker)}</b> (${esc(explanation.target.marketName)}). ${esc(explanation.stabilityText)}`,
  ];
  if (explanation.previewNote) lines.push(esc(explanation.previewNote));
  if (macro?.indicators?.length) lines.push(`<b>Ryzyko:</b>\n${macro.indicators.map((i) => `• ${esc(i.name)}: ${esc(i.value)} – ${esc(i.comment)}`).join('\n')}`);
  if (news?.items?.length) lines.push(`<b>Najważniejsze wiadomości:</b>\n${news.items.slice(0, 5).map((n) => `• ${esc(n.title)} <i>(${esc(n.source)})</i>`).join('\n')}`);
  if (ai?.text) lines.push(`<b>Kontekst (AI):</b>\n${esc(ai.text.replace(/\*\*/g, '').slice(0, 1200))}`);
  if (dashboardUrl) lines.push(`🔗 ${esc(dashboardUrl)}`);
  lines.push(`<i>${DISCLAIMER}</i>`);
  return { title: 'GEM: podsumowanie tygodnia', html: lines.join('\n\n'), priority: 2, tags: ['newspaper'] };
}

export function reminderMessage({ reminder, limits, dashboardUrl }) {
  const extra = limits && /IKE|IKZE/.test(reminder.title) ? `\nLimity: IKE ${limits.ike.toLocaleString('pl-PL')} zł, IKZE ${limits.ikze.toLocaleString('pl-PL')} zł (firma: ${limits.ikzeFirma.toLocaleString('pl-PL')} zł).` : '';
  const html = [`🗓️ <b>${esc(reminder.title)}</b>`, `${esc(reminder.text)}${esc(extra)}`, dashboardUrl ? `🔗 ${esc(dashboardUrl)}#podatki` : ''].filter(Boolean).join('\n\n');
  return { title: `GEM: ${reminder.title}`, html, priority: 3, tags: ['calendar'] };
}

export function taxNewsMessage({ items, dashboardUrl }) {
  const html = [
    '📜 <b>Zmiany dla inwestorów w Polsce</b>',
    items.map((n) => `• ${esc(n.title)} <i>(${esc(n.source)})</i>`).join('\n'),
    'Sprawdź, czy dotyczą Twoich kont (IKE, IKZE, OKI, konto zwykłe). Parametry narzędzia są w config/podatki.js.',
    dashboardUrl ? `🔗 ${esc(dashboardUrl)}#podatki` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { title: 'GEM: zmiany w przepisach', html, priority: 3, tags: ['scroll'] };
}

export function errorMessage({ error, lastSignal, dashboardUrl }) {
  const html = [
    '❗ <b>GEM – problem z danymi</b>',
    esc(error),
    lastSignal ? `Ostatni poprawny sygnał: <b>${esc(lastSignal)}</b>.` : '',
    'Sygnał nie został zaktualizowany. Nie podejmuj decyzji na podstawie nieaktualnych danych. Narzędzie spróbuje ponownie przy następnym uruchomieniu.',
    dashboardUrl ? `🔗 ${esc(dashboardUrl)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { title: 'GEM: problem z danymi', html, priority: 4, tags: ['x'] };
}

async function sendTelegram(msg, env) {
  const res = await fetchWithRetry(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    label: 'Telegram',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg.html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function sendNtfy(msg, env, dashboardUrl) {
  const server = (env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const res = await fetchWithRetry(server, {
    label: 'ntfy',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.NTFY_TOKEN ? { Authorization: `Bearer ${env.NTFY_TOKEN}` } : {}) },
    body: JSON.stringify({
      topic: env.NTFY_TOPIC,
      title: msg.title,
      message: stripTags(msg.html).slice(0, 3800),
      priority: msg.priority,
      tags: msg.tags,
      ...(dashboardUrl ? { click: dashboardUrl } : {}),
    }),
  });
  if (!res.ok) throw new Error(`ntfy: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export function channels(env = process.env) {
  const list = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) list.push('telegram');
  if (env.NTFY_TOPIC) list.push('ntfy');
  return list;
}

export async function send(msg, { env = process.env, dashboardUrl } = {}) {
  const results = [];
  for (const ch of channels(env)) {
    try {
      if (ch === 'telegram') await sendTelegram(msg, env);
      else await sendNtfy(msg, env, dashboardUrl);
      results.push({ channel: ch, ok: true });
    } catch (err) {
      results.push({ channel: ch, ok: false, error: err.message });
    }
  }
  return results;
}

export async function telegramChatIds(env = process.env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('Ustaw TELEGRAM_BOT_TOKEN (token od @BotFather).');
  const res = await fetchWithRetry(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`, { label: 'Telegram getUpdates' });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram: ${json.description ?? 'błąd'}`);
  const chats = new Map();
  for (const u of json.result) {
    const chat = u.message?.chat ?? u.channel_post?.chat;
    if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ') ?? chat.username);
  }
  return [...chats].map(([id, name]) => ({ id, name }));
}
