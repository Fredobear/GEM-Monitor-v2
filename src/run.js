// Pełny cykl: dane → sygnał → kontekst (makro, wiadomości, podatki, AI) → ceny do portfela → aplikacja → powiadomienia → stan.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveRules } from './strategy.js';
import { computeSignals } from './engine.js';
import { loadMarketData } from './data.js';
import { explainSignal } from './explain.js';
import { loadMacro } from './macro.js';
import { loadNews } from './news.js';
import { aiCommentary, aiMarketNote } from './ai.js';
import { buildPrices } from './prices.js';
import { buildQuotes, loadCatalog, loadWatchlist, readNotowania } from './instruments.js';
import { buildFunds, readFunds } from './funds.js';
import { buildGold, readGold } from './gold.js';
import { buildCrypto, readCrypto } from './crypto.js';
import { buildBonds, readBonds } from './bonds.js';
import { buildMarketOverview } from './markets.js';
import { loadTaxNews, dueReminders, upcoming, aiTaxReport, compareWithConfig } from './taxmonitor.js';
import { writeDashboard } from './dashboard.js';
import { send, channels, signalMessage, previewFlipMessage, digestMessage, errorMessage, reminderMessage, taxNewsMessage, stripTags } from './notify.js';
import { readState, writeState, readJson } from './state.js';
import { toISO } from './lib/dates.js';

export async function loadConfig(root) {
  return (await import(pathToFileURL(path.join(root, 'config', 'gem.config.js')).href)).default;
}

export async function loadPodatki(root) {
  return (await import(pathToFileURL(path.join(root, 'config', 'podatki.js')).href)).default;
}

export async function loadCalendar(root) {
  try {
    return (await import(pathToFileURL(path.join(root, 'config', 'kalendarz.js')).href)).default;
  } catch {
    return {};
  }
}

// Link do edycji listy obserwowanych instrumentów w repozytorium (GitHub Actions podaje nazwę repozytorium i gałęzi).
export function watchlistEditUrl(env) {
  return env.GITHUB_REPOSITORY ? `https://github.com/${env.GITHUB_REPOSITORY}/edit/${env.GITHUB_REF_NAME || 'main'}/config/obserwowane.txt` : null;
}

export function pagesUrl(env) {
  if (env.DASHBOARD_URL) return env.DASHBOARD_URL;
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${name}/` : `https://${owner}.github.io/${name}/`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

const settled = (r, fallback) => (r.status === 'fulfilled' ? r.value : { ...fallback, errors: [r.reason.message] });

export async function run({ flags = new Set(), root, env = process.env, now = new Date() }) {
  const dry = flags.has('--dry');
  const log = (...a) => console.log(...a);
  const config = await loadConfig(root);
  const podatki = await loadPodatki(root);
  const rules = resolveRules(config);
  const state = await readState(root);
  const today = toISO(now);
  const dashboardUrl = pagesUrl(env);
  const docsDir = path.join(root, 'docs');
  const research = await readJson(path.join(root, 'research', 'wyniki.json'));
  const previousPrices = await readJson(path.join(docsDir, 'data', 'prices.json'));
  state.lastRun = now.toISOString();

  let market;
  let signals;
  try {
    market = await loadMarketData({ config, rules, env, now });
    signals = computeSignals({ series: market.series, rules, tracked: config.tracked, now, maxStaleDays: config.data.maxStaleDays });
  } catch (err) {
    log(`Błąd danych: ${err.message}`);
    state.lastError = { at: now.toISOString(), message: err.message };
    if (dry) throw err;
    const last = await readJson(path.join(docsDir, 'data', 'latest.json'));
    await writeDashboard(docsDir, { ...(last ?? {}), config, research, podatki, prices: previousPrices, library: { editUrl: watchlistEditUrl(env) }, meta: { ...(last?.meta ?? {}), generatedAt: now.toISOString(), error: err.message } });
    if (state.lastErrorNotified !== today && channels(env).length) {
      await send(errorMessage({ error: err.message, lastSignal: state.official?.ticker, dashboardUrl }), { env, dashboardUrl });
      state.lastErrorNotified = today;
    }
    await writeState(root, state);
    throw err;
  }

  const [macroRes, newsRes, taxRes] = await Promise.allSettled([loadMacro(now), loadNews(config, now), loadTaxNews(config, now)]);
  const macro = settled(macroRes, { indicators: [] });
  const news = settled(newsRes, { items: [] });
  const taxNews = settled(taxRes, { items: [], important: [] });
  const explanation = explainSignal({ signals, config, transitions: research?.transitions });
  const { official, preview } = signals;

  let prices = previousPrices;
  const priceWarnings = [];
  try {
    prices = await buildPrices({ config, market, signals, previous: previousPrices, env, now });
    priceWarnings.push(...prices.warnings);
  } catch (err) {
    priceWarnings.push(`Ceny do wyceny portfela nie zostały odświeżone: ${err.message}`);
  }

  // Biblioteka instrumentów XTB: kursy z GPW i NewConnect, obserwowane z USA, wycena ETF-ów UCITS przez indeks-proxy.
  const library = { editUrl: watchlistEditUrl(env) };
  try {
    library.catalog = await loadCatalog(root);
    library.notowania = await buildQuotes({ config, catalog: library.catalog, market, previous: await readNotowania(docsDir), watchlist: await loadWatchlist(root), env, now });
    priceWarnings.push(...library.notowania.warnings.map((w) => `Biblioteka instrumentów – ${w}`));
  } catch (err) {
    priceWarnings.push(`Biblioteka instrumentów nie została odświeżona: ${err.message}`);
  }

  // Fundusze ING TFI (np. w PPE): wyceny jednostek wszystkich funduszy i kategorii jednostek.
  try {
    library.funds = await buildFunds({ previous: await readFunds(docsDir), now });
    priceWarnings.push(...library.funds.warnings.map((w) => `Fundusze ING TFI – ${w}`));
  } catch (err) {
    priceWarnings.push(`Fundusze ING TFI nie zostały odświeżone: ${err.message}`);
  }

  // Złoto (NBP), kryptowaluty (CoinGecko) i obligacje skarbowe (inflacja GUS, stopa NBP, oferta) – do wyceny w Finansach.
  const aktywa = config.aktywa ?? {};
  const assetSources = [
    ['gold', 'Złoto', async () => buildGold({ previous: await readGold(docsDir), now })],
    ['crypto', 'Kryptowaluty', async () => buildCrypto({ previous: await readCrypto(docsDir), now, env, top: aktywa.kryptoTop ?? 100, extra: aktywa.kryptoDodatkowe ?? [] })],
    ['bonds', 'Obligacje skarbowe', async () => buildBonds({ previous: await readBonds(docsDir), now })],
  ];
  for (const [key, label, build] of assetSources) {
    try {
      library[key] = await build();
      priceWarnings.push(...(library[key].warnings ?? []).map((w) => `${label} – ${w}`));
    } catch (err) {
      priceWarnings.push(`${label}: dane nie zostały odświeżone (${err.message}).`);
    }
  }

  // Przegląd rynków: notowania świata i GPW, termometr nastroju, statystyka, kalendarz i notatka rynkowa.
  let rynek = null;
  try {
    rynek = await buildMarketOverview({ root, now, env, macro, news, signals, explanation, config, calendar: await loadCalendar(root), notowania: library.notowania, prices, market });
    priceWarnings.push(...rynek.warnings.map((w) => `Przegląd rynku – ${w}`));
  } catch (err) {
    priceWarnings.push(`Przegląd rynku nie został odświeżony: ${err.message}`);
  }

  const isNewOfficial = state.official?.forMonth !== official.forMonth;
  const notifiedPreviewAsset = state.previewNotified?.forMonth === official.forMonth ? state.previewNotified.asset : official.decision.asset;
  const previewChanged = Boolean(preview) && !isNewOfficial && config.notifications.notifyPreviewFlip && preview.decision.asset !== notifiedPreviewAsset;
  const digestDay = config.notifications.weeklyDigestWeekday;
  const isDigest = Boolean(digestDay) && now.getUTCDay() === digestDay && state.lastDigest !== today && !isNewOfficial;

  // Komentarz AI: przy nowym sygnale i w podsumowaniu tygodnia (albo codziennie, jeśli tak ustawiono).
  const aiKey = `${official.forMonth}|${isoWeek(now)}`;
  let ai = state.ai?.result ?? null;
  const wantAi = env.ANTHROPIC_API_KEY && (flags.has('--ai') || config.ai.frequency === 'codziennie' || isNewOfficial || isDigest || state.ai?.key !== aiKey);
  if (wantAi) {
    log('Generuję komentarz AI...');
    const fresh = await aiCommentary({ signals, explanation, macro, news, config, env });
    if (fresh?.text) {
      ai = fresh;
      state.ai = { key: aiKey, result: fresh };
    } else if (fresh?.error) {
      log(fresh.error);
      ai = ai ?? fresh;
    }
  }

  // Notatka rynkowa AI: raz dziennie (w dni robocze), gdy ustawiono ANTHROPIC_API_KEY. Bez klucza – notatka z reguł.
  let marketAi = state.marketAi?.result ?? null;
  if (rynek && env.ANTHROPIC_API_KEY && config.ai.marketNote?.enabled && (flags.has('--ai') || state.marketAi?.key !== today)) {
    log('Generuję notatkę rynkową AI...');
    const fresh = await aiMarketNote({ overview: rynek, macro, news, explanation, config, env, now });
    if (fresh?.text) {
      marketAi = fresh;
      state.marketAi = { key: today, result: fresh };
    } else if (fresh?.error) {
      log(fresh.error);
      marketAi = marketAi ?? fresh;
    }
  }
  if (rynek) rynek.ai = marketAi;

  // Raport podatkowy AI raz w miesiącu: sprawdza limity, OKI i opłaty brokerów względem config/podatki.js.
  const taxKey = today.slice(0, 7);
  let taxAi = state.taxAi?.result ?? null;
  if (env.ANTHROPIC_API_KEY && (flags.has('--ai') || state.taxAi?.key !== taxKey)) {
    log('Generuję raport podatkowy AI...');
    const fresh = await aiTaxReport({ podatki, env, model: config.ai.model, effort: config.ai.effort });
    if (fresh?.text) {
      taxAi = fresh;
      state.taxAi = { key: taxKey, result: fresh };
    } else if (fresh?.error) {
      log(fresh.error);
      taxAi = taxAi ?? fresh;
    }
  }
  const taxMonitor = { news: taxNews, upcoming: upcoming(podatki.calendar, now), ai: taxAi, discrepancies: compareWithConfig(taxAi?.check, podatki) };

  const warnings = [...market.warnings, ...priceWarnings, ...(macro.errors ?? []).map((e) => `Wskaźniki: ${e}`), ...(news.errors ?? []).map((e) => `Wiadomości: ${e}`), ...(taxNews.errors ?? []).map((e) => `Podatki: ${e}`)];
  const meta = { generatedAt: now.toISOString(), dataSource: `${market.source}${market.check ? ` (kontrola: ${market.check.source})` : ''}`, warnings: market.warnings, crossCheck: market.check };
  await writeDashboard(docsDir, { signals, explanation, macro, news, ai, research, config, podatki, prices, taxMonitor, meta, library, rynek });

  log(`Sygnał na ${official.forMonth}: ${explanation.action.text} (${explanation.stabilityText})`);
  if (preview) log(`Podgląd (${preview.asOf}): ${config.assets[preview.decision.asset].xtb.ticker}${preview.differsFromOfficial ? ' – RÓŻNI SIĘ' : ''}`);
  for (const w of warnings) log(`Ostrzeżenie: ${w}`);

  const outbox = [];
  if (isNewOfficial) outbox.push(signalMessage({ signals, explanation, macro, ai, config, dashboardUrl, firstRun: !state.official }));
  else if (previewChanged) outbox.push(previewFlipMessage({ signals, config, dashboardUrl }));
  if (isDigest) outbox.push(digestMessage({ signals, explanation, macro, news, ai, dashboardUrl }));

  const reminders = dueReminders(podatki.calendar, now, state.remindersSent);
  const limits = podatki.limits[now.getUTCFullYear()];
  for (const reminder of reminders) outbox.push({ ...reminderMessage({ reminder, limits, dashboardUrl }), reminderKey: reminder.key });
  const freshTax = (taxNews.important ?? []).filter((n) => !state.taxSeen.includes(n.link));
  if (freshTax.length) outbox.push({ ...taxNewsMessage({ items: freshTax, dashboardUrl }), taxLinks: freshTax.map((n) => n.link) });

  if (dry) {
    for (const m of outbox) log(`\n[--dry] ${m.title}\n${stripTags(m.html)}`);
    return { signals, explanation, outbox, prices, taxMonitor };
  }

  if (outbox.length && !channels(env).length) log('Brak skonfigurowanych kanałów powiadomień (Telegram/ntfy) – pomijam wysyłkę.');
  const noChannels = !channels(env).length;
  let signalDelivered = noChannels;
  for (const m of outbox) {
    const results = noChannels ? [] : await send(m, { env, dashboardUrl });
    for (const r of results) log(`${r.channel}: ${r.ok ? 'wysłano' : `BŁĄD – ${r.error}`}`);
    const ok = noChannels || results.some((r) => r.ok);
    if (ok && m.reminderKey) state.remindersSent = [...state.remindersSent, m.reminderKey].slice(-40);
    if (ok && m.taxLinks) state.taxSeen = [...state.taxSeen, ...m.taxLinks].slice(-200);
    if (ok && !m.reminderKey && !m.taxLinks) signalDelivered = true;
  }

  // Stan sygnału aktualizujemy tylko po udanej wysyłce, żeby nieudana próba powtórzyła się przy następnym uruchomieniu.
  const signalMessages = outbox.filter((m) => !m.reminderKey && !m.taxLinks).length;
  if (!signalMessages || signalDelivered) {
    if (isNewOfficial) state.official = { forMonth: official.forMonth, asset: official.decision.asset, ticker: explanation.target.ticker };
    if (preview) state.previewNotified = { forMonth: official.forMonth, asset: preview.decision.asset };
    else if (isNewOfficial) state.previewNotified = { forMonth: official.forMonth, asset: official.decision.asset };
    if (isDigest) state.lastDigest = today;
  }
  state.lastSuccess = now.toISOString();
  state.lastError = null;
  await writeState(root, state);
  return { signals, explanation, outbox, prices, taxMonitor };
}
