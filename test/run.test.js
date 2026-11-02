// Test integracyjny całego cyklu z podstawionym fetch: dane → sygnał → panel → powiadomienia → stan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/run.js';
import { makeDaily } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;
let sent;
let failTicker = null;
const realFetch = globalThis.fetch;

// Akcje poza USA przyspieszają w listopadzie 2026 → podgląd zmienia lidera w trakcie miesiąca.
const SERIES = {
  spy: makeDaily('2021-01-04', '2026-11-20', 0.01),
  acwx: makeDaily('2021-01-04', '2026-11-20', (m) => (m >= '2026-11' ? 0.12 : 0.006)),
  efa: makeDaily('2021-01-04', '2026-11-20', 0.006),
  iemg: makeDaily('2021-01-04', '2026-11-20', 0.005),
  agg: makeDaily('2021-01-04', '2026-11-20', 0.002),
  bil: makeDaily('2021-01-04', '2026-11-20', 0.003),
};

function stubFetch(now) {
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    if (u.hostname === 'api.tiingo.com') {
      const ticker = u.pathname.split('/')[3];
      if (ticker === failTicker) return new Response('err', { status: 500 });
      const cutoff = now.toISOString().slice(0, 10);
      const rows = SERIES[ticker].filter((p) => p.date < cutoff).map((p) => ({ date: `${p.date}T00:00:00.000Z`, adjClose: p.value }));
      return Response.json(rows);
    }
    if (u.hostname === 'fred.stlouisfed.org') {
      const id = u.searchParams.get('id');
      const rows = makeDaily('2020-01-01', '2026-10-30', 0.001).map((p) => `${p.date},${(id === 'T10Y3M' ? 0.5 : p.value / 10).toFixed(3)}`);
      return new Response(`observation_date,${id}\n${rows.join('\n')}\n`);
    }
    if (u.hostname === 'api.nbp.pl') return Response.json({ rates: [{ effectiveDate: '2025-11-03', mid: 3.7 }, { effectiveDate: '2026-11-02', mid: 3.9 }] });
    if (u.hostname === 'api.telegram.org') {
      sent.push(JSON.parse(opts.body).text);
      return Response.json({ ok: true });
    }
    return new Response(`<rss><channel><item><title>Fed signals rate cut as markets rally</title><link>https://n.test/1</link><pubDate>${now.toUTCString()}</pubDate></item></channel></rss>`);
  };
}

const env = { TIINGO_API_KEY: 'test', TELEGRAM_BOT_TOKEN: 'bot', TELEGRAM_CHAT_ID: '1' };
const quiet = (fn) => async (...args) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn(...args);
  } finally {
    console.log = log;
  }
};
const runAt = quiet(async (iso) => {
  const now = new Date(iso);
  stubFetch(now);
  return run({ root: tmp, env, now });
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'gem-'));
  await mkdir(path.join(tmp, 'config'));
  await copyFile(path.join(ROOT, 'config', 'gem.config.js'), path.join(tmp, 'config', 'gem.config.js'));
  await copyFile(path.join(ROOT, 'config', 'podatki.js'), path.join(tmp, 'config', 'podatki.js'));
  await copyFile(path.join(ROOT, 'package.json'), path.join(tmp, 'package.json'));
});
after(async () => {
  globalThis.fetch = realFetch;
  await rm(tmp, { recursive: true, force: true });
});

test('cały cykl: sygnał miesięczny raz, ostrzeżenie o zmianie podglądu, podsumowanie, obsługa błędów', async () => {
  sent = [];
  // 1) Pierwszy dzień miesiąca (wtorek): nowy sygnał miesięczny.
  const r1 = await runAt('2026-11-03T06:15:00Z');
  assert.equal(r1.signals.official.forMonth, '2026-11');
  assert.equal(r1.explanation.target.ticker, 'CSPX.UK');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /sygnał na listopad 2026/);
  assert.ok(existsSync(path.join(tmp, 'docs', 'index.html')));
  assert.ok(existsSync(path.join(tmp, 'docs', 'icon-180.png')));
  const html = await readFile(path.join(tmp, 'docs', 'index.html'), 'utf8');
  assert.match(html, /CSPX\.UK/);
  assert.match(html, /id="tab-portfel"/);
  assert.match(html, /Strategia podatkowa dla GEM/);
  // Ceny do wyceny portfela: kursy NBP i indeksy instrumentów zapisane do kolejnego uruchomienia.
  const prices = JSON.parse(await readFile(path.join(tmp, 'docs', 'data', 'prices.json'), 'utf8'));
  assert.ok(prices.fx.USD.length > 0);
  assert.ok(prices.instruments['CSPX.UK'].series.length > 100);
  assert.ok(prices.instruments['EXUS.DE'].series.length > 100);
  assert.ok(prices.benchmarks.sp500.length > 100 && prices.benchmarks.gem.length > 0);

  // 2) Ponowne uruchomienie tego samego dnia: bez duplikatu.
  await runAt('2026-11-03T08:00:00Z');
  assert.equal(sent.length, 1);

  // 3) W połowie miesiąca akcje poza USA wyprzedzają USA → ostrzeżenie o zmianie podglądu (jedno).
  const r3 = await runAt('2026-11-19T06:15:00Z');
  assert.equal(r3.signals.preview.decision.asset, 'EXUS');
  assert.equal(sent.length, 2);
  assert.match(sent[1], /zmienił się wstępny sygnał/);
  await runAt('2026-11-20T06:15:00Z');
  assert.equal(sent.length, 2);

  // 4) Błąd danych: komunikat raz dziennie, stan zapisany, wyjątek dla GitHub Actions.
  failTicker = 'spy';
  await assert.rejects(runAt('2026-11-24T06:15:00Z'), /Tiingo SPY|HTTP 500/);
  await assert.rejects(runAt('2026-11-24T07:15:00Z'));
  failTicker = null;
  const errors = sent.filter((s) => s.includes('problem z danymi'));
  assert.equal(errors.length, 1);
  const state = JSON.parse(await readFile(path.join(tmp, 'state', 'state.json'), 'utf8'));
  assert.ok(state.lastError);
  assert.equal(state.official.ticker, 'CSPX.UK');

  // 5) Poniedziałek: podsumowanie tygodnia.
  const before = sent.length;
  await runAt('2026-11-30T06:15:00Z');
  assert.ok(sent.slice(before).some((s) => s.includes('podsumowanie tygodnia')));
});
