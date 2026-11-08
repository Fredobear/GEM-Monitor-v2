// Biblioteka instrumentów XTB: czytnik XLS (archiwum GPW), reguły proxy, notowania (GPW, NewConnect, Tiingo),
// wyszukiwarka i wycena w przeglądarce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readXls } from '../src/xls.js';
import {
  buildQuotes,
  compactPairs,
  katalogScript,
  notowaniaScript,
  parseGpwRows,
  parseNewConnect,
  parseNotowaniaScript,
  parseWatchlist,
  proxyFor,
  tiingoSymbol,
} from '../src/instruments.js';
import { instEntry, instFind, instItem, instPenceHint, instProxySeries, instSearch, instSourceLabel } from '../src/client/instruments.js';
import { makePricer } from '../src/client/core.js';
import { lotCurrency, lotPrice } from '../src/client/finance-core.js';
import { makeXls } from './helpers.js';

const HEADER = ['Data', 'Nazwa', 'ISIN', 'Waluta', 'Kurs otwarcia', 'Kurs max', 'Kurs min', 'Kurs zamknięcia', 'Zmiana', 'Wolumen', 'Liczba Transakcji', 'Obrót'];
const gpwRows = (date, rows) => [HEADER, ...rows.map(([name, isin, close, volume = 1000]) => [date, name, isin, 'PLN', close, close, close, close, 0.5, volume, 12, 431.64])];

test('czytnik XLS: teksty z SST (z podziałem na CONTINUE), liczby NUMBER/RK/MULRK i LABEL', () => {
  const rows = [
    ['Data', 'Nazwa', 'ISIN', 'Kurs zamknięcia', 'Wolumen', 'Transakcje', 'Opis'],
    ['2026-11-06', '11BIT', 'PL11BTS00015', 113.5, 3813, 213, 'Spółka gamingowa – żółw'],
    ['2026-11-06', 'CDPROJEKT', 'PLOPTTC00011', 241.2, -5, 7, null],
    ['2026-11-06', 'ŻABKA', 'LU2799202525', 19.06, 120000, null, 'zwykły LABEL'],
  ];
  const sheets = readXls(makeXls(rows, { chunk: 37, label: 'zwykły LABEL' }));
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'Arkusz');
  // puste komórki na końcu wiersza nie istnieją w pliku (wiersz kończy się na ostatniej zapisanej komórce)
  const trimmed = rows.map((r) => r.slice(0, r.findLastIndex((v) => v !== null) + 1));
  assert.deepEqual(sheets[0].rows, trimmed);
  assert.throws(() => readXls(Buffer.from('<html>brak sesji</html>')), /nie jest plik XLS/);
});

test('archiwum GPW: kolumny po nagłówku, ISIN → kurs zamknięcia (bez pustych i zerowych)', () => {
  const rows = gpwRows('2026-11-06', [
    ['11BIT', 'PL11BTS00015', 113],
    ['CDPROJEKT', 'PLOPTTC00011', 241.2],
    ['ZERO', 'PLZERO000011', 0],
  ]);
  const m = parseGpwRows(readXls(makeXls(rows))[0].rows);
  assert.equal(m.size, 2);
  assert.deepEqual(m.get('PL11BTS00015'), { name: '11BIT', close: 113, date: '2026-11-06' });
  assert.equal(parseGpwRows([['coś', 'innego']]).size, 0);
});

test('NewConnect: ostatni kurs albo kurs odniesienia, polski zapis liczb', () => {
  const html = `<table><thead><tr><th></th><th>Nazwa</th><th>ISIN</th><th>Skrót</th><th>Waluta</th><th>Kurs odn.</th><th>Kurs ost. trans.</th></tr></thead>
  <tbody><tr><td></td><td>1SOLUTION</td><td>PLONESL00011</td><td>ONE</td><td></td><td>0,0976</td><td>0,0974</td></tr>
  <tr><td></td><td>4MOBILITY</td><td>PLESLTN00010</td><td>4MB</td><td></td><td>1 170,50</td><td>-</td></tr>
  <tr><td></td><td>ZŁY</td><td>xx</td><td>X</td><td></td><td>1</td><td>1</td></tr></tbody></table>`;
  const m = parseNewConnect(html);
  assert.equal(m.size, 2);
  assert.equal(m.get('PLONESL00011'), 0.0974);
  assert.equal(m.get('PLESLTN00010'), 1170.5);
});

test('proxy ETF-ów UCITS według indeksu; bez proxy dla dźwigni, sektorów i akcji', () => {
  const cases = [
    ['iShares Core S&P 500 UCITS ETF (Acc USD)', 'SPY'],
    ['Vanguard FTSE All-World UCITS ETF (Acc EUR)', 'VT'],
    ['iShares Core MSCI World UCITS ETF (Acc USD)', 'URTH'],
    ['iShares Core MSCI EM IMI UCITS ETF (Acc USD)', 'IEMG'],
    ['Xtrackers MSCI World ex USA UCITS (Acc EUR)', 'VEA'],
    ['iShares $ Treasury Bond 0-1y UCITS ETF (Acc USD)', 'BIL'],
    ['iShares US Aggregate Bond UCITS ETF (Acc USD)', 'AGG'],
    ['iShares NASDAQ 100 UCITS ETF (Acc USD)', 'QQQ'],
    ['iShares S&P 500 EUR Hedged UCITS ETF (Acc EUR)', 'SPY:h'],
    ['iShares Physical Gold ETC (USD)', 'GLD'],
    ['Beta ETF Nasdaq-100 2xShort', null],
    ['WisdomTree EURO STOXX Banks 3x (Acc, EUR)', null],
    ['iShares S&P 500 Cnsmr Staples Sctr UCITS (Acc EUR)', null],
    ['Amundi NYSE Arca Gold Bugs UCITS (Dist, EUR)', null],
    ['iShares J.P. Morgan USD EM Bond UCITS ETF (Acc USD)', null],
  ];
  for (const [name, expected] of cases) assert.equal(proxyFor(name, 'E'), expected, name);
  assert.equal(proxyFor('Goldman Sachs Group Inc', 'A'), null);
});

test('lista obserwowanych, symbole Tiingo, skracanie historii', () => {
  assert.deepEqual(parseWatchlist('# komentarz\naapl.us\nMSFT.US, brkb.us # Berkshire\nzle\nAAPL.US\n'), ['AAPL.US', 'MSFT.US', 'BRKB.US']);
  assert.equal(tiingoSymbol('BRKB.US'), 'BRK-B');
  assert.equal(tiingoSymbol('AAPL.US'), 'AAPL');
  const pairs = [];
  for (let d = new Date('2025-01-01T00:00:00Z'); d <= new Date('2026-11-06T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) pairs.push([d.toISOString().slice(0, 10), pairs.length]);
  const c = compactPairs(pairs, { days: 14, months: 6 });
  assert.equal(c.at(-1)[0], '2026-11-06');
  assert.ok(c.some(([d]) => d === '2026-10-31'), 'koniec miesiąca zostaje');
  assert.ok(!c.some(([d]) => d === '2026-10-15'), 'środek miesiąca znika');
  assert.equal(c.filter(([d]) => d >= '2026-10-23').length, 15);
  assert.ok(c[0][0] >= '2026-05-01');
});

// Podstawione źródła: GPW (XLS), NewConnect (HTML), Tiingo.
function stubs({ session = '2026-11-06' } = {}) {
  const calls = { tiingo: [], fetch: [] };
  const xls = (rows) => ({ ok: true, arrayBuffer: async () => new Uint8Array(makeXls(rows)).buffer });
  const html = (text) => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(text).buffer, text: async () => text });
  const fetchImpl = async (url) => {
    calls.fetch.push(url);
    const u = new URL(url);
    if (u.hostname === 'newconnect.pl') return html('<table><tr><th>ISIN</th><th>Kurs ost. trans.</th></tr><tr><td>PLESLTN00010</td><td>1,17</td></tr></table>');
    const date = u.searchParams.get('date').split('-').reverse().join('-');
    const type = u.searchParams.get('type');
    if (date !== session) return html('<!DOCTYPE html><html>brak notowań</html>');
    if (type === '10') return xls(gpwRows(date, [['CDPROJEKT', 'PLOPTTC00011', 241.2], ['11BIT', 'PL11BTS00015', 113]]));
    if (type === '241') return xls(gpwRows(date, [['ETFBSPXPL', 'PLBETWT00028', 302.95]]));
    return html('<html></html>');
  };
  const tiingo = async (ticker, from, key, opts = {}) => {
    calls.tiingo.push({ ticker, from, opts });
    if (ticker === 'XXX') throw new Error('Tiingo XXX: ticker nie istnieje w Tiingo');
    const base = ticker === 'AAPL' ? 200 : 50;
    return [
      { date: '2026-11-04', value: base },
      { date: '2026-11-05', value: base * 1.01 },
      { date: '2026-11-06', value: base * 1.02 },
    ];
  };
  return { calls, fetchImpl, tiingo };
}

const CATALOG = {
  meta: { obowiazujeOd: '2026-10-05' },
  items: [
    ['11B.PL', '11 bit studios SA', 'PL11BTS00015', 'PLN', 'A'],
    ['4MB.PL', '4Mobility SA', 'PLESLTN00010', 'PLN', 'A'],
    ['AAPL.US', 'Apple Inc', 'US0378331005', 'USD', 'A'],
    ['CDR.PL', 'CD Projekt SA', 'PLOPTTC00011', 'PLN', 'A'],
    ['CSPX.UK', 'iShares Core S&P 500 UCITS ETF (Acc USD)', 'IE00B5BMR087', 'USD', 'E'],
    ['ETFBSPXPL.PL', 'BETA ETF S&P 500 PLN-HEDGED PORTFELOWY FIZ (Acc PLN)', 'PLBETWT00028', 'PLN', 'E'],
    ['SAP.DE', 'SAP SE', 'DE0007164600', 'EUR', 'A'],
    ['VWCE.DE', 'Vanguard FTSE All-World UCITS ETF (Acc EUR)', 'IE00BK5BQT80', 'EUR', 'E', 0],
    ['XXX.US', 'Old Corp', 'US0000000001', 'USD', 'A', 1],
  ],
};
const CONFIG = { assets: { US: { proxy: 'SPY' } }, portfolio: { historyStart: '2026-01-01' } };
const MARKET = { series: { US: [{ date: '2026-11-05', value: 600 }, { date: '2026-11-06', value: 606 }] } };

test('notowania biblioteki: GPW i NewConnect po ISIN, proxy z danych GEM i Tiingo, obserwowane z USA', async () => {
  const s = stubs();
  const now = new Date('2026-11-08T06:15:00Z'); // niedziela → ostatnia sesja w piątek
  const q = await buildQuotes({ config: CONFIG, catalog: CATALOG, market: MARKET, watchlist: ['AAPL.US', 'SAP.DE', 'XXX.US', 'NOPE.US'], env: { TIINGO_API_KEY: 'k' }, now, fetchImpl: s.fetchImpl, tiingo: s.tiingo });
  assert.equal(q.gpwDate, '2026-11-06');
  assert.deepEqual(q.quotes['CDR.PL'], [['2026-11-06', 241.2]]);
  assert.deepEqual(q.quotes['11B.PL'], [['2026-11-06', 113]]);
  assert.deepEqual(q.quotes['ETFBSPXPL.PL'], [['2026-11-06', 302.95]]);
  assert.deepEqual(q.quotes['4MB.PL'], [['2026-11-06', 1.17]]);
  assert.equal(q.src['4MB.PL'], 'nc');
  assert.equal(q.src['CDR.PL'], 'gpw');
  // proxy: SPY z danych rynkowych GEM (bez zapytania), pozostałe z Tiingo
  assert.deepEqual(q.proxies.SPY, [['2026-11-05', 600], ['2026-11-06', 606]]);
  assert.ok(!s.calls.tiingo.some((c) => c.ticker === 'SPY'));
  assert.equal(q.proxyOf['CSPX.UK'], 'SPY');
  assert.equal(q.proxyOf['VWCE.DE'], 'VT');
  assert.equal(q.proxyOf['ETFBSPXPL.PL'], 'SPY:h');
  assert.ok(q.proxies.VT.length);
  // obserwowane: kurs zamknięcia (nie skorygowany), błędy jako ostrzeżenia
  const aapl = s.calls.tiingo.find((c) => c.ticker === 'AAPL');
  assert.equal(aapl.opts.field, 'close');
  assert.equal(aapl.from, '2026-01-01');
  assert.equal(q.src['AAPL.US'], 'tiingo');
  assert.equal(q.quotes['AAPL.US'].at(-1)[1], 204);
  assert.ok(q.warnings.some((w) => w.includes('SAP.DE') && w.includes('ręczna')));
  assert.ok(q.warnings.some((w) => w.includes('NOPE.US') && w.includes('katalogu')));
  assert.ok(q.warnings.some((w) => w.includes('XXX.US')));

  // Ponowne uruchomienie tego samego dnia: bez zapytań do Tiingo, dane zostają.
  const s2 = stubs();
  const again = await buildQuotes({ config: CONFIG, catalog: CATALOG, market: MARKET, previous: q, watchlist: ['AAPL.US'], env: { TIINGO_API_KEY: 'k' }, now, fetchImpl: s2.fetchImpl, tiingo: s2.tiingo });
  assert.equal(again.tiingoCalls, 0);
  assert.deepEqual(again.quotes['AAPL.US'], q.quotes['AAPL.US']);

  // Plik dla przeglądarki: zapis i odczyt bez strat; stare notowania (ponad miesiąc) znikają.
  const parsed = parseNotowaniaScript(notowaniaScript(again));
  assert.deepEqual(parsed.quotes, again.quotes);
  const later = await buildQuotes({ config: CONFIG, catalog: CATALOG, market: MARKET, previous: parsed, watchlist: [], env: {}, now: new Date('2026-12-20T06:15:00Z'), fetchImpl: stubs({ session: '2026-12-18' }).fetchImpl, tiingo: s2.tiingo });
  assert.equal(later.quotes['AAPL.US'], undefined);
  assert.deepEqual(later.quotes['CDR.PL'].at(-1), ['2026-12-18', 241.2]);
});

test('limit Tiingo przerywa kolejne zapytania w tym uruchomieniu', async () => {
  let n = 0;
  const tiingo = async () => {
    n++;
    throw new Error('Tiingo: przekroczony limit zapytań darmowego planu – spróbuj ponownie za godzinę');
  };
  const q = await buildQuotes({ config: CONFIG, catalog: CATALOG, market: MARKET, watchlist: ['AAPL.US'], env: { TIINGO_API_KEY: 'k' }, now: new Date('2026-11-08T06:15:00Z'), fetchImpl: stubs().fetchImpl, tiingo });
  assert.equal(n, 1);
  assert.equal(q.tiingoCalls, 1);
});

test('katalog dla przeglądarki i wyszukiwarka: symbol, ISIN, słowa z nazwy, polskie znaki', () => {
  const src = katalogScript(CATALOG);
  const sandbox = {};
  new Function('self', src)(sandbox);
  const cat = sandbox.GEM_KATALOG;
  assert.equal(cat.items.length, CATALOG.items.length);
  assert.deepEqual(cat.items.find((r) => r[0] === 'CSPX.UK'), ['CSPX.UK', 'iShares Core S&P 500 UCITS ETF (Acc USD)', 'IE00B5BMR087', 'USD', 'E', 0, 'SPY']);
  assert.deepEqual(cat.items.find((r) => r[0] === 'CDR.PL'), ['CDR.PL', 'CD Projekt SA', 'PLOPTTC00011', 'PLN', 'A']);
  assert.equal(instSearch(cat, 'cdr')[0].symbol, 'CDR.PL');
  assert.equal(instSearch(cat, 'IE00BK5BQT80')[0].symbol, 'VWCE.DE');
  assert.equal(instSearch(cat, 'all world')[0].symbol, 'VWCE.DE');
  assert.equal(instSearch(cat, 'projekt')[0].symbol, 'CDR.PL');
  assert.equal(instSearch(cat, 'old').at(-1).symbol, 'XXX.US');
  assert.deepEqual(instSearch(cat, 'S&P 500', { type: 'A' }), []);
  assert.equal(instSearch(cat, '').length, 0);
  const it = instFind(cat, 'VWCE.DE');
  assert.equal(it.marketName, 'Xetra');
  assert.equal(it.proxy, 'VT');
  assert.equal(instFind(cat, 'NIE.MA'), null);
  assert.equal(instItem(['ABC.UK', 'X Fund (Acc, GBp)', 'IE0000000000', 'GBP', 'E']).market, 'UK');
  assert.match(instPenceHint(instItem(['ABC.UK', 'X Fund (Acc, GBp)', 'IE0000000000', 'GBP', 'E'])), /pensach/);
  assert.equal(instPenceHint(it), '');
});

test('wycena w przeglądarce: notowania, proxy przeliczone na walutę, klasa zabezpieczona bez przeliczenia', () => {
  const data = {
    quotes: { 'CDR.PL': [['2026-10-31', 230], ['2026-11-06', 241.2]] },
    src: { 'CDR.PL': 'gpw' },
    proxies: { SPY: [['2026-11-05', 600], ['2026-11-06', 606]] },
    proxyOf: { 'SXR8.DE': 'SPY', 'IUSE.UK': 'SPY:h' },
    proxyNames: { SPY: 'S&P 500' },
  };
  const fx = { USD: [['2026-11-05', 4], ['2026-11-06', 4]], EUR: [['2026-11-05', 4.25], ['2026-11-06', 4.3]] };
  const eur = instProxySeries(data, 'SPY', 'EUR', fx);
  assert.deepEqual(eur.map(([d, v]) => [d, Math.round(v * 1000) / 1000]), [['2026-11-05', 564.706], ['2026-11-06', 563.721]]);
  assert.deepEqual(instProxySeries(data, 'SPY:h', 'EUR', fx), data.proxies.SPY);
  assert.deepEqual(instProxySeries(data, 'SPY', 'SEK', fx), []);
  const cdr = instEntry(data, 'CDR.PL', 'PLN', fx);
  assert.equal(cdr.source, 'gpw');
  assert.match(instSourceLabel(cdr, data), /GPW \(06\.11\.2026\)/);
  const sxr8 = instEntry(data, 'SXR8.DE', 'EUR', fx);
  assert.equal(sxr8.source, 'proxy');
  assert.match(instSourceLabel(sxr8, data), /S&P 500 \(ETF SPY\)/);
  assert.equal(instEntry(data, 'SAP.DE', 'EUR', fx), null);
  assert.match(instSourceLabel(null), /ręczna/);
});

test('wycena pozycji: nowsze notowanie zastępuje cenę zakupu (Portfel i konto inwestycyjne)', () => {
  // Portfel: kupno 1 października po 200, notowania tylko na koniec miesiąca.
  const prices = { fx: {}, instruments: { 'CDR.PL': { currency: 'PLN', quotes: [['2026-10-31', 230]], series: [] } } };
  const txs = [{ id: '1', type: 'kupno', date: '2026-10-01', ticker: 'CDR.PL', currency: 'PLN', quantity: 10, price: 200 }];
  const price = makePricer(prices, txs);
  assert.equal(price('CDR.PL', '2026-10-15'), 200);
  assert.equal(price('CDR.PL', '2026-11-03'), 230); // świeże notowanie
  assert.equal(price('CDR.PL', '2026-11-20'), 230); // starsze niż 7 dni, ale nowsze niż zakup
  // Konto inwestycyjne: to samo, a waluta z pozycji, gdy brak notowań.
  const market = { assets: { 'CDR.PL': { currency: 'PLN', quotes: [['2026-10-31', 230]], series: [] } } };
  const lot = { asset: 'CDR.PL', qty: 10, price: 200, date: '2026-10-01', currency: 'PLN' };
  assert.equal(lotPrice(market, lot, '2026-10-15'), 200);
  assert.equal(lotPrice(market, lot, '2026-11-20'), 230);
  assert.equal(lotCurrency({ assets: {} }, { asset: 'SAP.DE', currency: 'EUR' }), 'EUR');
  assert.equal(lotPrice({ assets: {} }, { asset: 'SAP.DE', price: 150, date: '2026-10-01' }, '2026-11-20'), 150);
  // Z indeksem: notowanie z 31.10 przesunięte o zmianę indeksu do 20.11.
  const withSeries = { assets: { X: { currency: 'EUR', quotes: [['2026-10-31', 100]], series: [['2026-10-31', 50], ['2026-11-20', 55]] } } };
  assert.equal(Math.round(lotPrice(withSeries, { asset: 'X', price: 80, date: '2026-10-01' }, '2026-11-20') * 100) / 100, 110);
});
