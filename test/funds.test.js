// Fundusze ING TFI (PPE): strona notowań, API wycen, uzupełnianie historii i wycena w przeglądarce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFunds, fundsScript, keepDates, monthEndDates, parseFundsApi, parseFundsPage, parseFundsScript, plDate, plNumber } from '../src/funds.js';
import { fundDefaultCategory, fundEntry, fundQuotes, fundSymbol, instSourceLabel } from '../src/client/instruments.js';
import { investSummary, lotCost, lotResult } from '../src/client/finance-core.js';

const attr = (obj) => JSON.stringify(obj).replace(/"/g, '&quot;').replace(/\//g, '&#x2F;');
const PAGE = (dates) =>
  `<html><body><div class="component fundList js-fund-list" data-component-id="1" data-component-type-code="fund_list" data-js-parameters="${attr({
    unit_categories: [
      { id: 1, identifier: 'A', name: 'Zbywane bez ograniczeń', possibleToBuy: true },
      { id: 5, identifier: 'E', name: 'Zbywane w ramach PPE i PPI', possibleToBuy: false },
    ],
    dates_with_quotes: dates,
  })}"></div></body></html>`;

const fund = (id, name, quotes) => ({ name, fund_id: id, umbrella_name: 'ING Parasol FIO', type_name: 'akcji', currency: 'PLN', risk: 4, fund_page_url: `/fundusze/${id}`, quotes });
const quote = (cat, date, value, r12 = '10,00%') => ({ category_unit: cat, pricing_date: date, value, return: { '1M': '1,00%', '12M': r12, YTD: '-', '60M': '50,5%' } });
const apiFor = (iso, base) => {
  const d = iso.split('-').reverse().join('.');
  return { funds: [fund(1, 'ING Akcji', [quote('A', d, (base).toFixed(2).replace('.', ',')), quote('E', d, (base * 1.5).toFixed(2).replace('.', ','))]), fund(2, 'ING Obligacji', [quote('A', d, '400,10')])] };
};

test('parsowanie: liczby i daty po polsku, parametry strony, odpowiedź API', () => {
  assert.equal(plNumber('1 261,53'), 1261.53);
  assert.equal(plNumber('-0,39%', { percent: true }), -0.0039);
  assert.equal(plNumber('-'), null);
  assert.equal(plDate('05.11.2026'), '2026-11-05');
  assert.equal(plDate('2026-11-05'), null);

  const page = parseFundsPage(PAGE(['30.10.2026', '11.03.1998', '05.11.2026']));
  assert.deepEqual(page.categories, { A: 'Zbywane bez ograniczeń', E: 'Zbywane w ramach PPE i PPI' });
  assert.deepEqual(page.dates, ['1998-03-11', '2026-10-30', '2026-11-05']);
  assert.equal(parseFundsPage('<html></html>'), null);

  const api = parseFundsApi(apiFor('2026-11-05', 822.47));
  assert.equal(api.date, '2026-11-05');
  assert.equal(api.funds.length, 2);
  const akcji = api.funds[0];
  assert.equal(akcji.url, 'https://www.ingtfi.pl/fundusze/1');
  assert.equal(akcji.quotes.E.value, 1233.7);
  assert.deepEqual(akcji.quotes.A.ret, { '1M': 0.01, '12M': 0.1, '60M': 0.505 });
});

test('daty do uzupełnienia historii: koniec każdego miesiąca i przycinanie', () => {
  const valid = ['2026-08-28', '2026-08-31', '2026-09-29', '2026-09-30', '2026-10-30', '2026-11-04', '2026-11-05'];
  assert.deepEqual(monthEndDates(valid, '2026-11-08', 3), ['2026-10-30', '2026-09-30', '2026-08-31']);
  const kept = keepDates(['2026-11-05', '2026-11-04', '2026-10-01', '2026-10-30', '2025-01-15', '2020-01-31'], { days: 30, months: 24 });
  assert.deepEqual(kept, ['2025-01-15', '2026-10-30', '2026-11-04', '2026-11-05']);
});

test('aktualizacja wycen: sesja strony, najnowsze wyceny, historia z końców miesięcy, ponowne uruchomienie', async () => {
  const calls = [];
  const dates = ['31.08.2026', '30.09.2026', '29.10.2026', '30.10.2026', '04.11.2026', '05.11.2026'];
  const values = { '2026-08-31': 700, '2026-09-30': 750, '2026-10-29': 790, '2026-10-30': 800, '2026-11-04': 815, '2026-11-05': 822.47 };
  const fetchImpl = async (url, opts = {}) => {
    calls.push(url);
    if (url.endsWith('/notowania-funduszy')) return new Response(PAGE(dates), { headers: { 'Set-Cookie': '__Host-CMSSESSIONID=abc123; Path=/; Secure; HttpOnly' } });
    assert.equal(opts.headers.Cookie, '__Host-CMSSESSIONID=abc123');
    const date = new URL(url).searchParams.get('date') ?? '2026-11-05';
    return Response.json(apiFor(date, values[date]));
  };
  const now = new Date('2026-11-08T07:00:00Z');
  const r = await buildFunds({ now, fetchImpl, months: 3, recentDays: 2, pauseMs: 0 });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.asOf, '2026-11-05');
  assert.deepEqual(r.dates, ['2026-08-31', '2026-09-30', '2026-10-30', '2026-11-04', '2026-11-05']);
  assert.deepEqual(r.values['INGTFI:1:E'], [1050, 1125, 1200, 1222.5, 1233.7]);
  assert.equal(r.funds[0].cats.join(','), 'A,E');
  assert.equal(r.categories.E, 'Zbywane w ramach PPE i PPI');
  assert.equal(r.calls, 5); // najnowsze + 4 daty z historii (05.11 już jest)

  // Drugie uruchomienie tego samego dnia: bez zapytań.
  calls.length = 0;
  const again = await buildFunds({ previous: parseFundsScript(fundsScript(r)), now, fetchImpl, months: 3, recentDays: 2, pauseMs: 0 });
  assert.equal(calls.length, 0);
  assert.deepEqual(again.values['INGTFI:1:E'], r.values['INGTFI:1:E']);

  // Następny dzień: tylko najnowsze wyceny, historia zostaje.
  values['2026-11-06'] = 830;
  dates.push('06.11.2026');
  const next = await buildFunds({ previous: parseFundsScript(fundsScript(r)), now: new Date('2026-11-09T07:00:00Z'), fetchImpl: async (url, opts) => (url.includes('/api/') && !url.includes('date=') ? Response.json(apiFor('2026-11-06', 830)) : fetchImpl(url, opts)), months: 3, recentDays: 2, pauseMs: 0 });
  assert.equal(next.asOf, '2026-11-06');
  assert.equal(next.values['INGTFI:1:A'].at(-1), 830);
  assert.equal(next.values['INGTFI:1:A'][0], 700);
});

test('zmiana zasad serwisu: brak sesji albo odmowa dostępu – zostają poprzednie dane z ostrzeżeniem', async () => {
  const previous = { fetched: '2026-11-05', dates: ['2026-11-05'], values: { 'INGTFI:1:E': [1200] }, funds: [], categories: {} };
  const noCookie = await buildFunds({ previous, now: new Date('2026-11-08T07:00:00Z'), fetchImpl: async () => new Response('<html></html>'), pauseMs: 0 });
  assert.match(noCookie.warnings[0], /nie utworzyła sesji/);
  assert.deepEqual(noCookie.values, previous.values);
  const denied = await buildFunds({
    previous,
    now: new Date('2026-11-08T07:00:00Z'),
    fetchImpl: async (url) => (url.endsWith('/notowania-funduszy') ? new Response(PAGE([]), { headers: { 'Set-Cookie': '__Host-CMSSESSIONID=x; Path=/' } }) : Response.json({ error: { message: 'Unauthorized' } }, { status: 401 })),
    pauseMs: 0,
  });
  assert.match(denied.warnings[0], /odmówił dostępu/);
  assert.deepEqual(denied.values, previous.values);
});

test('wycena funduszu w przeglądarce i zysk z pozycji (PPE)', () => {
  const data = { dates: ['2026-10-30', '2026-11-04', '2026-11-05'], values: { 'INGTFI:1:E': [1200, null, 1261.53] }, funds: [{ id: 1, name: 'ING Akcji', currency: 'PLN', cats: ['A', 'E', 'K'] }, { id: 9, name: 'ING Emerytura 2050', currency: 'PLN', cats: ['A'] }] };
  assert.equal(fundSymbol(1, 'E'), 'INGTFI:1:E');
  assert.deepEqual(fundQuotes(data, 'INGTFI:1:E'), [['2026-10-30', 1200], ['2026-11-05', 1261.53]]);
  const entry = fundEntry(data, 'INGTFI:1:E');
  assert.equal(entry.source, 'tfi');
  assert.match(instSourceLabel(entry), /ING TFI \(05\.11\.2026\)/);
  assert.equal(fundEntry(data, 'INGTFI:1:F'), null);
  assert.equal(fundDefaultCategory(data.funds[0]), 'E');
  assert.equal(fundDefaultCategory(data.funds[0], 'K'), 'K');
  assert.equal(fundDefaultCategory(data.funds[1], 'E'), 'A');

  const market = { fx: {}, assets: { 'INGTFI:1:E': { name: 'ING Akcji', ...entry } } };
  const lot = { id: 'l1', asset: 'INGTFI:1:E', name: 'ING Akcji', currency: 'PLN', qty: 10, price: 1000, date: '2024-01-15' };
  assert.deepEqual(lotCost(market, lot), { cost: 10000, currency: 'PLN', costPLN: 10000, costIn: 10000 });
  const r = lotResult(market, lot, '2026-11-08');
  assert.equal(Math.round(r.value * 100) / 100, 12615.3);
  assert.equal(Math.round(r.gain * 100) / 100, 2615.3);
  assert.equal(Math.round(r.gainPct * 10000) / 10000, 0.2615);
  const sum = investSummary(market, { lots: [lot] }, '2026-11-08');
  assert.equal(sum.positions, 1);
  assert.equal(Math.round(sum.gain * 100) / 100, 2615.3);
});
