// Przegląd rynku: wskaźniki serii, indeksy GPW, termometr nastroju, statystyka, kalendarz i notatka rynkowa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  baseRates,
  buildMarketNote,
  buildMarketOverview,
  currentRegime,
  marketStance,
  parseGpwIndices,
  seriesMetrics,
  updateGpwIndices,
  upcomingEvents,
} from '../src/markets.js';
import { marketPrompt } from '../src/ai.js';
import { investSummary } from '../src/client/finance-core.js';
import { makeDaily, makeXls } from './helpers.js';

const toPairs = (s) => s.map((p) => [p.date, p.value]);
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// Deterministyczny „losowy” szereg (generator liniowy) – do statystyki reżimów.
function randomWalk(n, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  let v = 100;
  const d = new Date('2018-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
    const vol = i % 400 < 200 ? 0.006 : 0.035;
    v *= 1 + 0.0003 + (rnd() - 0.5) * 2 * vol;
    out.push({ date: d.toISOString().slice(0, 10), value: v });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

test('wskaźniki serii: zmiany, szczyt 52 tygodni i trend (dzienny i z końców miesięcy)', () => {
  const daily = toPairs(makeDaily('2025-01-02', '2026-11-06', 0.01));
  const m = seriesMetrics(daily, 'index');
  assert.equal(m.date, '2026-11-06');
  assert.equal(m.trend, 'up');
  assert.equal(m.trendBasis, 'średnia 200 sesji');
  assert.ok(m.w1 > 0 && m.w1 < 0.01);
  near(m.ytd, 1.01 ** 10 * (m.last / daily.find(([d]) => d === '2026-10-30')[1]) - 1, 1e-4);
  assert.ok(Math.abs(m.fromHigh) < 1e-9);
  const falling = toPairs(makeDaily('2025-01-02', '2026-11-06', -0.02));
  assert.equal(seriesMetrics(falling, 'etf').trend, 'down');
  assert.ok(seriesMetrics(falling, 'etf').fromHigh < -0.2);

  const yields = [['2026-10-30', 4.0], ['2026-11-05', 4.1], ['2026-11-06', 4.25]];
  const y = seriesMetrics(yields, 'yield');
  near(y.d1, 0.15);
  near(y.w1, 0.25);
  assert.equal(y.trend, null);
  assert.equal(y.fromHigh, null);

  // Tylko końce miesięcy (świeża historia GPW): trend ze średniej 10 miesięcy, bez szczytu 52 tygodni.
  const monthly = Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}-28`, 100 + i]).concat([['2026-01-05', 120]]);
  const mm = seriesMetrics(monthly, 'index');
  assert.equal(mm.trend, 'up');
  assert.equal(mm.trendBasis, 'średnia 10 miesięcy');
  assert.equal(mm.fromHigh, null);
  assert.equal(seriesMetrics([], 'index'), null);
});

const IDX_HEADER = ['Data', 'Nazwa', 'ISIN', 'Waluta', 'Kurs otwarcia', 'Kurs max', 'Kurs min', 'Kurs zamknięcia', 'Zmiana'];
const idxXls = (date, wig20) => makeXls([IDX_HEADER, [date, 'WIG20', 'PL9999999987', 'PLN', wig20, wig20, wig20, wig20, 0.1], [date, 'WIG', 'PL9999999995', 'PLN', wig20 * 37, wig20 * 37, wig20 * 37, wig20 * 37, 0.1], [date, 'MWIG40', 'PL9999999912', 'PLN', 6000, 6000, 6000, 6000, 0]]);

test('indeksy GPW: parsowanie archiwum, ostatnia sesja i jednorazowe uzupełnienie końców miesięcy', async () => {
  const map = parseGpwIndices([IDX_HEADER, ['2026-11-06', 'WIG20', 'PL9999999987', 'PLN', 1, 1, 1, 4131.2, 0.1]]);
  assert.deepEqual(map.get('WIG20'), { close: 4131.2, date: '2026-11-06' });

  const asked = [];
  const fetchImpl = async (url) => {
    const ddmmyyyy = new URL(url).searchParams.get('date');
    const iso = ddmmyyyy.split('-').reverse().join('-');
    asked.push(iso);
    // Brak sesji: weekendy (nie powinny być pytane), 11.11 (święto) i dni po 6.11 (jeszcze bez notowań).
    if (iso > '2026-11-06' || iso === '2025-11-11') return new Response('<html>brak</html>');
    return new Response(idxXls(iso, 4000 + Number(iso.slice(5, 7)) * 10));
  };
  const r = await updateGpwIndices({}, '2026-11-08', { fetchImpl, pauseMs: 0 });
  assert.deepEqual(r.warnings, []);
  assert.ok(asked.every((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())));
  assert.equal(r.history.WIG20.at(-1)[0], '2026-11-06');
  assert.ok(r.history.WIG20.length >= 13, 'koniec każdego z 13 miesięcy + ostatnie sesje');
  assert.ok(r.history.WIG20.some(([d]) => d === '2025-12-31'));
  // Drugie uruchomienie: historia jest, więc tylko ostatnia sesja.
  asked.length = 0;
  await updateGpwIndices(r.history, '2026-11-09', { fetchImpl, pauseMs: 0 });
  assert.ok(asked.length <= 2, `zapytań: ${asked.length}`);

  // Archiwum niedostępne: ostrzeżenie i żadnych prób uzupełniania historii.
  asked.length = 0;
  const down = await updateGpwIndices({}, '2026-11-08', { fetchImpl: async (url) => (asked.push(url), new Response('x')), pauseMs: 0 });
  assert.match(down.warnings[0], /brak notowań/);
  assert.ok(asked.length <= 5);
});

const CONFIG = { strategy: { variant: 'klasyczny' }, variants: { klasyczny: { equities: ['US', 'EXUS'] } }, assets: { US: { name: 'Akcje USA' }, BONDS: { name: 'Obligacje USA' } } };
const MACRO = (vixTier, hyTier = 0) => ({
  indicators: [
    { id: 'VIXCLS', tier: vixTier, value: '28,2', comment: 'podwyższony strach' },
    { id: 'BAMLH0A0HYM2', tier: hyTier, value: '3,48 pp', comment: 'niski stres' },
    { id: 'USEPUINDXD', tier: 1, value: '274', comment: 'podwyższona' },
    { id: 'T10Y3M', tier: 0, value: '0,67 pp', comment: 'normalna' },
  ],
});
const row = (key, group, trend, extra = {}) => ({ key, name: key, short: key, group, kind: 'index', trend, trendBasis: 'średnia 200 sesji', w1: 0.01, ytd: 0.05, last: 100, date: '2026-11-06', fromHigh: -0.02, ...extra });

test('termometr nastroju: punkty za trend, szerokość rynku, obsunięcie, VIX, kredyt i sygnał GEM', () => {
  const up = { rows: ['SPX', 'NDQ', 'EUR', 'EM', 'WIG20'].map((k) => row(k, k === 'WIG20' ? 'Polska' : 'Akcje USA', 'up')) };
  const good = marketStance({ world: up, macro: MACRO(0), signals: { official: { decision: { asset: 'US' } } }, config: CONFIG });
  assert.equal(good.id, 'sprzyjajace');
  assert.equal(good.score, 5);
  const mixed = marketStance({ world: up, macro: MACRO(2), signals: { official: { decision: { asset: 'US' } } }, config: CONFIG });
  assert.equal(mixed.id, 'sprzyjajace'); // 1 + 1 + 1 − 1 + 0 + 0 + 1 = 3
  const down = { rows: ['SPX', 'NDQ', 'EUR', 'EM', 'WIG20'].map((k) => row(k, 'Akcje USA', 'down', { fromHigh: -0.25 })) };
  const bad = marketStance({ world: down, macro: MACRO(3, 3), signals: { official: { decision: { asset: 'BONDS' } } }, config: CONFIG });
  assert.equal(bad.id, 'defensywne');
  assert.ok(bad.factors.some((f) => f.label === 'Momentum (sygnał GEM)' && f.score === -1));
});

test('statystyka reżimów: odsetek wzrostów, mediana i zakres; reżim na dziś', () => {
  const series = randomWalk(1500);
  const st = baseRates(series);
  assert.equal(st.since, series[0].date);
  const all = st.table.all;
  assert.ok(all[5].n > 1000 && all[21].n > 1000 && all[63].n > 1000);
  for (const [key, cell] of Object.entries(st.table)) {
    for (const h of Object.keys(cell)) {
      const c = cell[h];
      assert.ok(c.up >= 0 && c.up <= 1, key);
      assert.ok(c.p10 <= c.median && c.median <= c.p90, key);
    }
  }
  assert.ok(Object.keys(st.table).some((k) => k.endsWith('|high')) && Object.keys(st.table).some((k) => k.endsWith('|low')));
  const reg = currentRegime(series);
  assert.match(reg.key, /^(up|down)\|(low|mid|high)$/);
  assert.ok(reg.volValue > 0);
  assert.equal(currentRegime(series.slice(0, 100)), null);
});

test('kalendarz: decyzje banków centralnych, dane cykliczne i nowy sygnał GEM', () => {
  const cal = { fed: ['2026-12-09'], ebc: ['2026-12-17'], rpp: ['2026-11-04', '2026-12-02'], inne: [{ date: '2026-11-20', title: 'Premia – dopłata do IKE' }] };
  const { events, warning } = upcomingEvents(cal, new Date('2026-11-08T07:00:00Z'));
  assert.equal(warning, null);
  const list = events.map((e) => `${e.date} ${e.kind}`);
  assert.deepEqual(list, ['2026-11-20 inne', '2026-11-30 dane', '2026-12-01 gem', '2026-12-02 bank', '2026-12-04 dane', '2026-12-09 bank']);
  assert.ok(events.find((e) => e.date === '2026-12-04').approx);
  assert.match(upcomingEvents({ fed: ['2026-01-28'] }, new Date('2026-11-08T07:00:00Z')).warning, /kalendarz/);
});

test('notatka rynkowa z reguł: podsumowanie, tematy wiadomości, najbliższe dni i wnioski', () => {
  const world = {
    rows: [
      row('SPX', 'Akcje USA', 'up', { short: 'S&P 500', w1: -0.047, ytd: 0.074 }),
      row('EUR', 'Akcje świat', 'up', { short: 'Europa', w1: -0.003 }),
      row('WIG20', 'Polska', 'up', { short: 'WIG20', w1: -0.012 }),
      { key: 'US10', short: 'rentowność', group: 'Stopy i obligacje', kind: 'yield', last: 4.84, w1: -0.14 },
      row('GOLD', 'Surowce i krypto', 'down', { short: 'złoto', kind: 'etf', w1: 0.047 }),
      row('BRENT', 'Surowce i krypto', 'up', { short: 'ropa Brent', kind: 'price', last: 107, w1: -0.131 }),
      { key: 'EURPLN', short: 'EUR/PLN', group: 'Waluty', kind: 'fx', last: 4.3925, w1: -0.001 },
    ],
  };
  const stance = marketStance({ world, macro: MACRO(2), signals: { official: { decision: { asset: 'EXUS' } } }, config: CONFIG });
  const news = { themeCounts: { 'Konflikty i wojny': 5, 'Banki centralne i stopy': 2, 'Sankcje i cła': 0 }, items: [{ title: 'Missiles hit tanker in the Gulf', source: 'BBC', themes: ['Konflikty i wojny'] }] };
  const stats = { since: '1993-01-29', table: { 'up|mid': { 21: { n: 1000, up: 0.63, median: 0.011, p10: -0.04, p90: 0.06 } } } };
  const note = buildMarketNote({ world, stance, stats, regime: { key: 'up|mid', trend: 'up', vol: 'mid' }, events: [{ date: '2026-11-12', title: 'Decyzja Fed', approx: false }], news, explanation: { target: { ticker: 'EXUS.DE' }, action: { text: 'BEZ ZMIAN: trzymaj EXUS.DE' } }, now: new Date('2026-11-08T07:00:00Z') });
  assert.match(note.summary[0], /S&P 500 −4,7%.*WIG20 −1,2%.*od początku roku \+7,4%/);
  assert.match(note.summary[1], /4,84% \(−0,14 pp w tydzień\).*ropa Brent 107,0 USD \(−13,1%\)/);
  const titles = note.sections.map((s) => s.title);
  assert.deepEqual(titles, ['Co się dzieje na świecie', 'Największe zmiany w tygodniu', 'Najbliższe dni', 'Co z tym zrobić']);
  assert.match(note.sections[0].items[0], /^Konflikty i wojny \(5 wiadomości\).*„Missiles hit tanker in the Gulf” \(BBC\)/);
  assert.match(note.sections[2].items.join(' '), /12\.11 – Decyzja Fed.*63% przypadków od 1993/);
  assert.match(note.sections[3].items[0], /Strategia GEM – BEZ ZMIAN: trzymaj EXUS\.DE/);
  assert.match(note.disclaimer, /nie rekomendacja/);

  // Dane do notatki AI zawierają liczby z aplikacji (model ma je przepisać, nie zgadywać).
  const prompt = marketPrompt({ overview: { asOf: '2026-11-06', stance, world: world.rows.map((r) => ({ ...r, name: r.short, d1: 0.001, m1: 0.01 })), events: [{ date: '2026-12-09', title: 'Decyzja Fed' }] }, macro: MACRO(2), news: { items: [{ source: 'BBC', date: '2026-11-07T10:00:00Z', title: 'Missiles hit tanker', regions: [], themes: ['Konflikty i wojny'] }] }, explanation: { target: { marketName: 'Akcje poza USA', ticker: 'EXUS.DE' }, action: { text: 'BEZ ZMIAN' } }, now: new Date('2026-11-08T07:00:00Z') });
  assert.match(prompt, /Termometr rynku/);
  assert.match(prompt, /S&P 500: 100; \+0\.1% \/ −4\.7%/);
  assert.match(prompt, /rentowność: 4\.84%; \+0\.00 pp \/ −0\.14 pp/);
  assert.match(prompt, /2026-12-09: Decyzja Fed/);
  assert.match(prompt, /\[BBC, 2026-11-07\] Missiles hit tanker/);
});

test('przegląd rynku: wszystkie źródła razem, stan zapisany między uruchomieniami', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gem-rynki-'));
  try {
    const spy = makeDaily('2024-01-02', '2026-11-06', 0.01);
    const fred = async (id) => (id === 'DGS10' || id === 'DGS2' ? makeDaily('2025-09-01', '2026-11-06', 0.001, 4) : makeDaily('2025-09-01', '2026-11-06', 0.01));
    const fetchImpl = async (url) => {
      const iso = new URL(url).searchParams.get('date').split('-').reverse().join('-');
      return iso > '2026-11-06' ? new Response('-') : new Response(idxXls(iso, 4100));
    };
    let tiingoCalls = 0;
    const tiingo = async () => (tiingoCalls++, spy);
    const args = { root, env: { TIINGO_API_KEY: 'x' }, macro: MACRO(1), news: { themeCounts: {}, items: [] }, signals: { official: { decision: { asset: 'US' } } }, explanation: { target: { ticker: 'CSPX.UK' }, action: { text: 'trzymaj CSPX.UK' } }, config: CONFIG, calendar: { fed: ['2026-12-09'] }, notowania: { proxies: { IEUR: toPairs(spy), EEM: toPairs(spy) } }, prices: { fx: { EUR: [['2026-11-05', 4.39], ['2026-11-06', 4.3925]] } }, market: { series: { US: spy } }, fetchImpl, fred, tiingo };
    const r = await buildMarketOverview({ ...args, now: new Date('2026-11-08T07:00:00Z') });
    assert.equal(r.asOf, '2026-11-06');
    const keys = r.world.map((w) => w.key);
    for (const k of ['SPX', 'US10', 'EUR', 'EM', 'WIG20', 'EURPLN']) assert.ok(keys.includes(k), k);
    assert.ok(r.stats.current && r.regime);
    assert.ok(r.note.sections.length >= 2);
    assert.equal(tiingoCalls, 1);
    const saved = JSON.parse(await readFile(path.join(root, 'state', 'rynki.json'), 'utf8'));
    assert.equal(saved.gpwFetched, '2026-11-08');
    assert.equal(saved.stats.month, '2026-11');
    // Ten sam miesiąc: statystyka z pamięci, bez pobierania historii SPY.
    await buildMarketOverview({ ...args, now: new Date('2026-11-09T07:00:00Z') });
    assert.equal(tiingoCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('zysk konta inwestycyjnego: pozycje w walucie obcej i zysk zrealizowany ze sprzedanych', () => {
  const market = {
    fx: { USD: [['2026-01-02', 4.0], ['2026-11-06', 3.9]] },
    assets: { 'CSPX.UK': { currency: 'USD', quotes: [['2026-11-06', 110]], series: [] }, 'ELT.PL': { currency: 'PLN', quotes: [['2026-06-30', 60], ['2026-11-06', 61]], series: [] } },
  };
  const account = {
    lots: [
      { id: 'a', asset: 'CSPX.UK', currency: 'USD', qty: 10, price: 100, date: '2026-01-02' },
      { id: 'b', asset: 'ELT.PL', currency: 'PLN', qty: 100, price: 50, date: '2026-01-02', until: '2026-07-01' },
    ],
  };
  const s = investSummary(market, account, '2026-11-08');
  near(s.cost, 4000); // 10 × 100 USD × 4,00
  near(s.value, 4290); // 10 × 110 USD × 3,90
  near(s.gain, 290);
  near(s.realized, 1000); // 100 × (60 − 50)
  assert.equal(s.positions, 1);
});
