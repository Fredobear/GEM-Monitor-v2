// Pobieranie notowań ETF-ów-proxy od dostawców z kluczem API, z kontrolą jakości i porównaniem źródeł.
import { tiingoDaily } from './providers/tiingo.js';
import { alphaVantageMonthly } from './providers/alphavantage.js';
import { sanityCheckSeries, crossCheck } from './validate.js';
import { monthEnds, monthlyMomentum } from './lib/series.js';
import { addMonths, monthOf, toISO } from './lib/dates.js';
import { decisionAssets } from './strategy.js';

export class ConfigError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Alpha Vantage w darmowym planie ogranicza tempo zapytań – zachowujemy odstęp.
const AV_SPACING_MS = 13000;

export function availableProviders(config, env) {
  return config.data.providers.filter((p) => (p === 'tiingo' ? env.TIINGO_API_KEY : p === 'alphavantage' ? env.ALPHAVANTAGE_API_KEY : false));
}

async function fetchSeries(provider, ticker, startDate, env) {
  if (provider === 'tiingo') return { series: await tiingoDaily(ticker, startDate, env.TIINGO_API_KEY), daily: true };
  return { series: await alphaVantageMonthly(ticker, env.ALPHAVANTAGE_API_KEY), daily: false };
}

export async function loadMarketData({ config, rules, env = process.env, now = new Date(), historyMonths = 36 }) {
  const providers = availableProviders(config, env);
  if (!providers.length) {
    throw new ConfigError('Brak klucza API do danych rynkowych. Ustaw TIINGO_API_KEY (zalecane) albo ALPHAVANTAGE_API_KEY – instrukcja w README, krok 2.');
  }
  const startMonth = addMonths(monthOf(toISO(now)), -(historyMonths + rules.lookbackMonths + rules.skipMonths + 2));
  const startDate = `${startMonth}-01`;
  const keys = [...new Set([...decisionAssets(rules), ...config.tracked])];
  const required = new Set(decisionAssets(rules));

  const [primary, secondary] = providers;
  const series = {};
  const warnings = [];
  let avCalls = 0;
  const throttle = async (provider) => {
    if (provider === 'alphavantage' && avCalls++ > 0) await sleep(AV_SPACING_MS);
  };

  for (const key of keys) {
    const ticker = config.assets[key].proxy;
    try {
      await throttle(primary);
      const { series: s, daily } = await fetchSeries(primary, ticker, startDate, env);
      series[key] = s;
      warnings.push(...(daily ? sanityCheckSeries(s, ticker) : []));
    } catch (err) {
      if (secondary && required.has(key)) {
        warnings.push(`${err.message} – używam zapasowego źródła (${secondary}).`);
        await throttle(secondary);
        series[key] = (await fetchSeries(secondary, ticker, startDate, env)).series;
      } else if (required.has(key)) {
        throw err;
      } else {
        warnings.push(`Pominięto rynek informacyjny ${key}: ${err.message}`);
      }
    }
  }

  // Druga, niezależna wycena stóp zwrotu na koniec ostatniego miesiąca (tylko rynki decyzyjne).
  let check = null;
  if (secondary) {
    try {
      const month = addMonths(monthOf(toISO(now)), -1);
      const primaryReturns = {};
      const secondaryReturns = {};
      for (const key of required) {
        await throttle(secondary);
        const s2 = (await fetchSeries(secondary, config.assets[key].proxy, startDate, env)).series;
        const m1 = monthlyMomentum(monthEnds(series[key]), month, rules.lookbackMonths, rules.skipMonths);
        const m2 = monthlyMomentum(monthEnds(s2), month, rules.lookbackMonths, rules.skipMonths);
        if (m1) primaryReturns[key] = m1.ret;
        if (m2) secondaryReturns[key] = m2.ret;
      }
      check = { month, source: secondary, ...crossCheck(primaryReturns, secondaryReturns, rules, config.data.crossCheckTolerancePct) };
      if (!check.withinTolerance) warnings.push(`Źródła danych różnią się o ${check.maxDiffPct.toFixed(2)} pp (${primary} vs ${secondary}). Sprawdź notowania.`);
      if (check.sameDecision === false) warnings.push(`UWAGA: drugie źródło danych (${secondary}) daje inny sygnał (${check.secondaryAsset}). Sygnał jest niepewny – zweryfikuj ręcznie przed transakcją.`);
    } catch (err) {
      warnings.push(`Nie udało się porównać z drugim źródłem (${secondary}): ${err.message}`);
    }
  }

  return { series, source: primary, check, warnings };
}
