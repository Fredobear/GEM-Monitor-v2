// Pobieranie danych do wyceny: złoto (NBP), kryptowaluty (CoinGecko), obligacje (GUS, NBP, obligacjeskarbowe.pl).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGold, parseGold, thinDaily } from '../src/gold.js';
import { buildCrypto, parseChart, parseMarkets } from '../src/crypto.js';
import { buildBonds, findCpiCsv, parseCpiCsv, parseNbpRates, parseOfferLinks, parseSeriesPage, seriesSaleMonth } from '../src/bonds.js';
import { dataScript, parseDataScript } from '../src/lib/datafile.js';

test('złoto: odpowiedź NBP, pierwsze pobranie historii w przedziałach do 367 dni, potem tylko ostatnie dni', async () => {
  assert.deepEqual(parseGold([{ data: '2026-11-09', cena: 514.79 }, { data: '2026-11-06', cena: 518.36 }]), [['2026-11-06', 518.36], ['2026-11-09', 514.79]]);
  assert.equal(parseGold({ rates: [] }), null);
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const [from, to] = url.match(/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/).slice(1);
    const days = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) days.push({ data: d.toISOString().slice(0, 10), cena: 400 });
    return days.length ? Response.json(days) : new Response('404 NotFound - Not Found - Brak danych', { status: 404 });
  };
  const now = new Date('2026-11-09T07:00:00Z');
  const first = await buildGold({ now, fetchImpl, start: '2024-01-02' });
  assert.deepEqual(first.warnings, []);
  assert.equal(urls.length, 3); // 2024-01-02…2025-01-02…2026-01-03…2026-11-09
  assert.ok(first.prices.length > 50);
  urls.length = 0;
  const again = await buildGold({ previous: { ...first, fetched: '2026-11-08' }, now, fetchImpl });
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes(`/${first.prices.at(-1)[0].slice(0, 8)}`) || urls[0].includes('2026-1'));
  // Awaria NBP: zostają poprzednie ceny.
  const down = await buildGold({ previous: { ...first, fetched: '2026-11-08' }, now, fetchImpl: async () => new Response('err', { status: 500 }) });
  assert.match(down.warnings[0], /NBP/);
  assert.deepEqual(down.prices, first.prices);
  // Przycinanie: dziennie z ostatnich 400 dni, wcześniej ostatnia cena miesiąca.
  const thin = thinDaily([['2020-01-30', 1], ['2020-01-31', 2], ['2020-02-28', 3], ['2026-11-08', 4], ['2026-11-09', 5]]);
  assert.deepEqual(thin.map((p) => p[0]), ['2020-01-31', '2020-02-28', '2026-11-08', '2026-11-09']);
  assert.deepEqual(parseDataScript('GEM_ZLOTO', dataScript('GEM_ZLOTO', { a: '<b>' })), { a: '<b>' });
});

test('kryptowaluty: kursy w złotych, zmiany, historia z ostatniego roku uzupełniana po kilka monet', async () => {
  const market = (id, rank, price) => ({ id, symbol: id.slice(0, 3), name: id, market_cap_rank: rank, current_price: price, price_change_percentage_24h_in_currency: -2.43, price_change_percentage_1y_in_currency: 24.7, last_updated: '2026-11-09T06:00:00Z' });
  assert.deepEqual(parseMarkets([market('bitcoin', 1, 292061.123456789)])[0], { id: 'bitcoin', symbol: 'BIT', name: 'bitcoin', rank: 1, price: 292061.12, ch: { d1: -0.0243, y1: 0.247 } });
  const day = (iso) => Date.parse(`${iso}T00:00:00Z`);
  assert.deepEqual(parseChart({ prices: [[day('2026-11-07'), 1], [day('2026-11-08'), 2], [day('2026-11-08') + 3600e3, 2.5]] }), [['2026-11-07', 1], ['2026-11-08', 2.5]]);

  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    if (url.includes('/coins/markets')) return Response.json([market('bitcoin', 1, 292061), market('ethereum', 2, 8313.15), market('tether', 3, 3.91)]);
    const id = url.match(/coins\/([^/]+)\/market_chart/)[1];
    if (id === 'tether') return new Response('{"status":{"error_code":429}}', { status: 429 });
    assert.equal(opts.headers['x-cg-demo-api-key'], 'demo');
    return Response.json({ prices: [[day('2025-11-30'), 300000], [day('2026-10-31'), 280000], [day('2026-11-09'), 1]] });
  };
  const now = new Date('2026-11-09T07:00:00Z');
  const r = await buildCrypto({ now, fetchImpl, env: { COINGECKO_API_KEY: 'demo' }, top: 3, backfillPerRun: 5, pauseMs: 0 });
  assert.deepEqual(r.warnings, []); // limit zapytań przy historii – bez ostrzeżenia, uzupełni się później
  assert.deepEqual(r.backfilled, ['bitcoin', 'ethereum']);
  assert.equal(r.asOf, '2026-11-09');
  assert.deepEqual(r.dates, ['2025-11-30', '2026-10-31', '2026-11-09']);
  assert.deepEqual(r.values.bitcoin, [300000, 280000, 292061]); // dzisiejszy kurs z listy, nie z wykresu
  assert.deepEqual(r.values.tether, [null, null, 3.91]);
  // Następnego dnia: historia tylko dla brakujących.
  calls.length = 0;
  const next = await buildCrypto({ previous: r, now: new Date('2026-11-10T07:00:00Z'), fetchImpl: async (url, o) => (url.includes('tether') ? Response.json({ prices: [[day('2026-10-31'), 3.9]] }) : fetchImpl(url, o)), env: { COINGECKO_API_KEY: 'demo' }, top: 3, pauseMs: 0 });
  assert.deepEqual(next.backfilled, ['bitcoin', 'ethereum', 'tether']);
  assert.deepEqual(next.values.tether.slice(-3), [3.9, 3.91, 3.91]);
  // CoinGecko nie działa – poprzednie kursy z ostrzeżeniem.
  const down = await buildCrypto({ previous: { ...r, fetched: '2026-11-08' }, now, fetchImpl: async () => new Response('<html>', { status: 200 }), pauseMs: 0 });
  assert.match(down.warnings[0], /CoinGecko/);
  assert.deepEqual(down.values, r.values);
});

const CSV = [
  'Nazwa zmiennej;Jednostka terytorialna;Sposób prezentacji;Rok;Miesiąc;Wartość;Flaga;;',
  'Wskaźnik cen towarów i usług konsumpcyjnych;Polska;Grudzień poprzedniego roku = 100;2026;9;103,7;;;',
  'Wskaźnik cen towarów i usług konsumpcyjnych;Polska;Analogiczny miesiąc poprzedniego roku = 100;2003;12;101,7;;;',
  ...Array.from({ length: 13 }, (_, i) => `Wskaźnik cen towarów i usług konsumpcyjnych;Polska;Analogiczny miesiąc poprzedniego roku = 100;${i < 4 ? 2025 : 2026};${i < 4 ? i + 9 : i - 3};10${(i % 5) + 1},${i % 10};;;`),
  'Wskaźnik cen towarów i usług konsumpcyjnych;Polska;Analogiczny miesiąc poprzedniego roku = 100;2026;10;;;;',
].join('\r\n');
const NBP_ARCH = `<stopy_procentowe_archiwum><pozycje obowiazuje_od="2025-12-04"><pozycja id="ref" oprocentowanie="4,00" /><pozycja id="lom" oprocentowanie="4,50" /></pozycje>
<pozycje obowiazuje_od="2025-11-06"><pozycja id="ref" oprocentowanie="4,25" /></pozycje><pozycje obowiazuje_od="2025-10-09"><pozycja id="ref" oprocentowanie="4,50" /></pozycje>
<pozycje obowiazuje_od="2025-09-04"><pozycja id="ref" oprocentowanie="4,75" /></pozycje><pozycje obowiazuje_od="2025-07-03"><pozycja id="ref" oprocentowanie="5,00" /></pozycje></stopy_procentowe_archiwum>`;
const NBP_NOW = '<stopy_procentowe data_publikacji="2026-03-05"><tabela id="stoproc"><pozycja id="ref" nazwa="Stopa referencyjna" oprocentowanie="3,75" trend="spadek" obowiazuje_od="2026-03-05" /><pozycja id="lom" oprocentowanie="4,25" obowiazuje_od="2026-03-05" /></tabela></stopy_procentowe>';
const HOME = '<a href="/oferta-obligacji/obligacje-10-letnie-edo/edo1136/">EDO</a><a href="/oferta-obligacji/obligacje-roczne-ror/ror1127/">ROR</a><a href="/oferta/">x</a>';
const SERIES = {
  edo1136: '<div><span class="label">Oprocentowanie: </span><span>5,35% w pierwszym rocznym okresie odsetkowym, w kolejnych rocznych okresach odsetkowych: marża 2,00% + inflacja</span><p>Cena zamiany jednej obligacji: 99,90 zł</p><p>Dla emisji zakupionych do 31 sierpnia 2024 r. opłata wynosi 2,00 zł od każdej obligacji dziesięcioletniej. Dla emisji zakupionych od 1 września 2024 r. opłata wynosi 3,00 zł od każdej obligacji dziesięcioletniej.</p></div>',
  ror1127: '<p>Oprocentowanie: 4,00% w skali roku, w pierwszym miesięcznym okresie odsetkowym. W kolejnych miesięcznych okresach odsetkowych: stopa referencyjna NBP+0,00%.</p><p>Opłata wynosi 0,50 zł od każdej obligacji rocznej.</p>',
};

test('obligacje: parsowanie inflacji GUS, stóp NBP i oferty obligacjeskarbowe.pl', () => {
  const cpi = parseCpiCsv(CSV);
  assert.equal(cpi.length, 13); // bez 2003 r. i bez pustego października
  assert.deepEqual(cpi[0], ['2025-09', 1]);
  assert.equal(findCpiCsv('<a href="/download/gfx/x/miesiecznewskaznikicentowarowiuslugkonsumpcyjnychod1982roku_9.csv">CSV</a>'), 'https://stat.gov.pl/download/gfx/x/miesiecznewskaznikicentowarowiuslugkonsumpcyjnychod1982roku_9.csv');
  assert.deepEqual(parseNbpRates(NBP_ARCH, NBP_NOW), [['2025-07-03', 5], ['2025-09-04', 4.75], ['2025-10-09', 4.5], ['2025-11-06', 4.25], ['2025-12-04', 4], ['2026-03-05', 3.75]]);
  assert.deepEqual(parseOfferLinks(HOME).map((l) => l.code), ['EDO1136', 'ROR1127']);
  assert.equal(seriesSaleMonth('EDO1136'), '2026-11');
  assert.equal(seriesSaleMonth('OTS0227'), '2026-11');
  assert.deepEqual(parseSeriesPage(SERIES.edo1136, 'EDO1136'), { type: 'EDO', rate1: 5.35, margin: 2, fee: 3, swap: 99.9 });
  assert.deepEqual(parseSeriesPage(SERIES.ror1127, 'ROR1127'), { type: 'ROR', rate1: 4, margin: 0, fee: 0.5 });
  assert.equal(parseSeriesPage('<p>Strona w przebudowie</p>', 'EDO1136'), null);
});

test('obligacje: aktualizacja – nowe serie raz, awaria jednego źródła nie kasuje danych', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('stat.gov.pl/obszary')) return new Response('<a href="/download/plik_9.csv">CSV</a>');
    if (url.endsWith('plik_9.csv')) return new Response(new TextEncoder().encode(CSV));
    if (url.includes('archiwum.xml')) return new Response(NBP_ARCH);
    if (url.includes('stopy_procentowe.xml')) return new Response(NBP_NOW);
    if (url === 'https://www.obligacjeskarbowe.pl/') return new Response(HOME);
    const code = url.match(/\/([a-z]{3}\d{4})\/$/)?.[1];
    return new Response(SERIES[code] ?? 'brak', { status: SERIES[code] ? 200 : 404 });
  };
  const now = new Date('2026-11-09T07:00:00Z');
  const r = await buildBonds({ now, fetchImpl });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.offer, ['EDO1136', 'ROR1127']);
  assert.equal(r.offerMonth, '2026-11');
  assert.deepEqual(r.series.EDO1136, { type: 'EDO', rate1: 5.35, margin: 2, fee: 3, swap: 99.9, month: '2026-11' });
  assert.equal(r.cpiAsOf, '2026-09');
  assert.equal(r.ref.at(-1)[1], 3.75);
  // Kolejny dzień: strony serii, które już znamy, nie są pobierane ponownie.
  urls.length = 0;
  const next = await buildBonds({ previous: { ...r, fetched: '2026-11-09' }, now: new Date('2026-11-10T07:00:00Z'), fetchImpl });
  assert.ok(!urls.some((u) => /edo1136|ror1127/.test(u)));
  assert.deepEqual(next.series, r.series);
  // GUS nie odpowiada: inflacja z poprzedniej aktualizacji, reszta odświeżona.
  const gusDown = await buildBonds({ previous: { ...r, fetched: '2026-11-09' }, now: new Date('2026-11-10T07:00:00Z'), fetchImpl: async (url) => (url.includes('stat.gov.pl') ? new Response('err', { status: 503 }) : fetchImpl(url)) });
  assert.match(gusDown.warnings[0], /GUS/);
  assert.deepEqual(gusDown.cpi, r.cpi);
  assert.equal(gusDown.fetched, '2026-11-09'); // spróbuje ponownie przy następnym uruchomieniu
});
