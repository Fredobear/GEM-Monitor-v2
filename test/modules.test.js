import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseFeed, classify, decodeEntities } from '../src/news.js';
import { readZip } from '../src/lib/zip.js';
import { parseFrenchMonthly } from '../src/providers/french.js';
import { parseFredCsv } from '../src/providers/fred.js';
import { bondPrice, parBondReturns, emShare } from '../src/research.js';
import { runStrategy, runBuyAndHold, metrics, buildIndex } from '../src/backtest.js';
import { explainSignal } from '../src/explain.js';
import { signalMessage } from '../src/notify.js';
import { computeSignals } from '../src/engine.js';
import { resolveRules } from '../src/strategy.js';
import { addMonths } from '../src/lib/dates.js';
import { makeDaily, testConfig } from './helpers.js';

test('parser RSS i Atom, encje i CDATA', () => {
  const rss = `<rss><channel><item><title><![CDATA[Fed &amp; markets: rate cut]]></title><link>https://x.test/a?b=1&amp;c=2</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Stocks rally&lt;/p&gt;</description></item></channel></rss>`;
  const [item] = parseFeed(rss, 'Test');
  assert.equal(item.title, 'Fed & markets: rate cut');
  assert.equal(item.link, 'https://x.test/a?b=1&c=2');
  assert.equal(item.date, '2026-11-02T10:00:00.000Z');
  assert.equal(item.summary, 'Stocks rally');
  const atom = `<feed><entry><title>Wojna handlowa: nowe cła</title><link href="https://y.test/1"/><updated>2026-11-01T08:00:00Z</updated></entry></feed>`;
  const [e] = parseFeed(atom, 'Atom');
  assert.equal(e.link, 'https://y.test/1');
  assert.equal(decodeEntities('&#322;&#x105;'), 'łą');
});

test('klasyfikacja wiadomości: całe słowa vs rdzenie, filtr istotności rynkowej', () => {
  const tariff = classify({ title: 'US imposes new tariffs on Chinese goods, markets slide', summary: '' });
  assert.ok(tariff.themes.includes('Sankcje i cła'));
  assert.ok(tariff.regions.includes('USA') && tariff.regions.includes('Azja'));
  assert.ok(tariff.relevant);
  // „warning” nie może zostać uznane za „war”
  assert.deepEqual(classify({ title: 'Weather warning issued for the weekend', summary: '' }).themes, []);
  // konflikt bez kontekstu rynkowego jest odfiltrowany
  assert.equal(classify({ title: 'Five arrested after farmer attack', summary: '' }).relevant, false);
  assert.ok(classify({ title: 'Wojna na Bliskim Wschodzie podbija ceny ropy', summary: '' }).relevant);
  assert.ok(classify({ title: 'RPP obniżyła stopy procentowe', summary: '' }).themes.includes('Banki centralne i stopy'));
});

test('czytnik ZIP (deflate)', () => {
  const content = Buffer.from('hello,świat\n'.repeat(50));
  const compressed = deflateRawSync(content);
  const name = Buffer.from('a.csv');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + compressed.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, compressed, central, name, eocd]);
  const [entry] = readZip(zip);
  assert.equal(entry.name, 'a.csv');
  assert.equal(entry.data.toString(), content.toString());
});

test('parser plików Kennetha Frencha i FRED', () => {
  const csv = `This file was created...\n\n,Mkt-RF,SMB,HML,RF\n202608,   1.50,  0.1, 0.2,   0.30\n202609,  -99.99, 0.1, 0.2, 0.31\n202610,  -1.00, 0.1, 0.2, 0.30\n\n Annual Factors\n,Mkt-RF\n2025, 10\n`;
  const pad = Array.from({ length: 12 }, (_, i) => `2025${String(i + 1).padStart(2, '0')}, 1.0, 0, 0, 0.3`).join('\n');
  const m = parseFrenchMonthly(csv.replace(',Mkt-RF,SMB,HML,RF\n', `,Mkt-RF,SMB,HML,RF\n${pad}\n`));
  assert.ok(Math.abs(m.get('2026-08').market - 0.018) < 1e-12);
  assert.equal(m.has('2026-09'), false); // brak danych (-99.99) jest pomijany
  assert.ok(Math.abs(m.get('2026-10').rf - 0.003) < 1e-12);
  assert.deepEqual(parseFredCsv('observation_date,X\n2026-01-01,1.5\n2026-01-02,\n2026-01-03,.\n2026-01-04,-0.2\n'), [
    { date: '2026-01-01', value: 1.5 },
    { date: '2026-01-04', value: -0.2 },
  ]);
});

test('wycena obligacji: obligacja po nominale, wzrost rentowności = strata', () => {
  assert.ok(Math.abs(bondPrice(0.04, 0.04, 5) - 100) < 1e-9);
  const ends = new Map([
    ['2026-01', { value: 4 }],
    ['2026-02', { value: 5 }],
  ]);
  const r = parBondReturns(ends, 10).get('2026-02');
  // duracja ok. 8 lat → spadek o ok. 7–8% przy +1 pp
  assert.ok(r < -0.06 && r > -0.09, `r=${r}`);
  assert.ok(emShare('2026-01') > 0.25 && emShare('1990-01') === 0.05);
});

test('backtest bez zaglądania w przyszłość i poprawne metryki', () => {
  const months = Array.from({ length: 36 }, (_, i) => addMonths('2020-01', i));
  // USA rośnie 1%/mies. do końca 2021, potem gwałtowny spadek; bony 0,2%/mies.
  const us = new Map(months.map((m) => [m, m < '2022-01' ? 0.01 : -0.08]));
  const exus = new Map(months.map((m) => [m, 0.0]));
  const bonds = new Map(months.map((m) => [m, 0.005]));
  const bills = new Map(months.map((m) => [m, 0.002]));
  const rules = resolveRules(testConfig);
  const res = runStrategy({ monthly: { US: us, EXUS: exus, BONDS: bonds, TBILLS: bills }, rules, from: '2021-01', to: '2022-12' });
  const jan22 = res.path.find((p) => p.month === '2022-01');
  // Decyzja na styczeń 2022 zapadła na danych do grudnia 2021 → nadal USA i strata −8% w styczniu.
  assert.equal(jan22.asset, 'US');
  const later = res.path.find((p) => p.month === '2022-12');
  assert.equal(later.asset, 'BONDS');

  const flat = runBuyAndHold({ weights: { BONDS: 1 }, monthly: { BONDS: new Map(months.map((m) => [m, 0.01])) }, from: '2020-01', to: '2022-12' });
  const m = metrics(flat, new Map());
  assert.ok(Math.abs(m.cagr - (1.01 ** 12 - 1)) < 1e-9);
  assert.equal(m.maxDrawdown, 0);
  assert.equal(buildIndex(new Map([['2020-01', 0.1]])).get('2020-01').value, 1.1);
});

test('koszt zmiany pozycji i podatek obniżają wynik', () => {
  const months = Array.from({ length: 48 }, (_, i) => addMonths('2019-01', i));
  const zig = new Map(months.map((m, i) => [m, Math.floor(i / 6) % 2 ? 0.03 : -0.01]));
  const zag = new Map(months.map((m, i) => [m, Math.floor(i / 6) % 2 ? -0.01 : 0.03]));
  const flat = new Map(months.map((m) => [m, 0.001]));
  const rules = resolveRules(testConfig);
  const monthly = { US: zig, EXUS: zag, BONDS: flat, TBILLS: flat };
  const gross = runStrategy({ monthly, rules, from: '2020-02', to: '2022-12' });
  const net = runStrategy({ monthly, rules, from: '2020-02', to: '2022-12', switchCost: () => 0.01, taxRate: 0.19 });
  assert.ok(gross.switches > 0);
  assert.ok(net.liquidationValue < gross.path[gross.path.length - 1].value);
  assert.ok(net.taxPaid >= 0);
});

test('uzasadnienie i treść powiadomienia zawierają ticker XTB i liczby', () => {
  const config = {
    ...testConfig,
    assets: {
      ...testConfig.assets,
      US: { name: 'Akcje USA', index: 'S&P 500', proxy: 'SPY', xtb: { ticker: 'CSPX.UK', name: 'iShares Core S&P 500', isin: 'IE00B5BMR087', exchange: 'LSE', currency: 'USD' } },
    },
  };
  const rules = resolveRules(config);
  const series = {
    US: makeDaily('2023-01-02', '2026-10-30', 0.012),
    EXUS: makeDaily('2023-01-02', '2026-10-30', 0.004),
    BONDS: makeDaily('2023-01-02', '2026-10-30', 0.002),
    TBILLS: makeDaily('2023-01-02', '2026-10-30', 0.003),
  };
  const signals = computeSignals({ series, rules, now: new Date('2026-11-02T06:00:00Z') });
  const explanation = explainSignal({ signals, config });
  assert.equal(explanation.target.ticker, 'CSPX.UK');
  assert.equal(explanation.action.type, 'trzymaj');
  assert.match(explanation.reasons[0], /S&P 500 zarobił \+15,4%/);
  const msg = signalMessage({ signals, explanation, macro: null, ai: null, config, dashboardUrl: 'https://example.test/' });
  assert.match(msg.html, /sygnał na listopad 2026/);
  assert.match(msg.html, /S&amp;P 500/);
  assert.match(msg.html, /To nie jest porada inwestycyjna/);
});
