// Aplikacja demonstracyjna bez kluczy API: sygnał liczony na miesięcznych danych indeksowych (Ken French + FRED),
// a kursy NBP, wskaźniki ryzyka, wiadomości i monitor podatkowy – na bieżących danych. Nic nie jest wysyłane.
import path from 'node:path';
import { loadLongHistory, runResearch } from './research.js';
import { buildIndex } from './backtest.js';
import { computeSignals } from './engine.js';
import { resolveRules } from './strategy.js';
import { explainSignal } from './explain.js';
import { loadMacro } from './macro.js';
import { loadNews } from './news.js';
import { buildPrices } from './prices.js';
import { loadTaxNews, upcoming } from './taxmonitor.js';
import { writeDashboard } from './dashboard.js';
import { signalMessage, stripTags } from './notify.js';
import { loadConfig, loadPodatki } from './run.js';
import { readJson } from './state.js';
import { addMonths, lastWeekdayOfMonth, monthGenitivePL } from './lib/dates.js';

export async function demo({ root, outDir = path.join(root, 'docs') }) {
  const config = await loadConfig(root);
  const podatki = await loadPodatki(root);
  const rules = resolveRules(config);
  console.log('Pobieram dane indeksowe (Ken French, FRED), kursy NBP, wskaźniki ryzyka i wiadomości...');
  const history = await loadLongHistory();
  const series = {};
  for (const [key, returns] of Object.entries(history.monthly)) {
    series[key] = [...buildIndex(returns)].map(([month, p]) => ({ date: lastWeekdayOfMonth(month), value: p.value }));
  }
  const now = new Date(`${addMonths(history.last, 1)}-02T06:00:00Z`);
  const signals = computeSignals({ series, rules, tracked: config.tracked, now, maxStaleDays: 40 });
  const research = (await readJson(path.join(root, 'research', 'wyniki.json'))) ?? runResearch(history);
  const explanation = explainSignal({ signals, config, transitions: research.transitions });
  const realNow = new Date();
  const [macro, news, taxNews] = await Promise.all([loadMacro(realNow), loadNews(config, realNow), loadTaxNews(config, realNow)]);
  const prices = await buildPrices({ config, market: { series }, signals, previous: await readJson(path.join(outDir, 'data', 'prices.json')), env: {}, now: realNow });
  const taxMonitor = { news: taxNews, upcoming: upcoming(podatki.calendar, realNow), ai: null, discrepancies: [] };

  const note = `Sygnał z miesięcznych danych indeksowych do ${monthGenitivePL(history.last)} – to nie jest bieżący sygnał. Aktualne notowania pojawią się po dodaniu klucza TIINGO_API_KEY. Kursy NBP, ryzyko i wiadomości są bieżące.`;
  await writeDashboard(outDir, {
    signals,
    explanation,
    macro,
    news,
    ai: null,
    research,
    config,
    podatki,
    prices,
    taxMonitor,
    meta: { generatedAt: realNow.toISOString(), demo: note, dataSource: 'Ken French Data Library (dane miesięczne)' },
  });
  const msg = signalMessage({ signals, explanation, macro, ai: null, config, dashboardUrl: null });
  console.log(`\nPrzykładowe powiadomienie:\n${stripTags(msg.html)}\n`);
  console.log(`Aplikacja demonstracyjna zapisana: ${path.join(outDir, 'index.html')}`);
  return { signals, explanation, macro, news, prices };
}
