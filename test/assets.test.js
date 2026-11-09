// Kryptowaluty, złoto i obligacje skarbowe: wycena w przeglądarce (wzory z list emisyjnych MF) i zapis wypłat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOND_PREFIX,
  GOLD_ASSET,
  bondCpi,
  bondDefaultFee,
  bondEvents,
  bondMaturity,
  bondNextPayout,
  bondPeriods,
  bondRate,
  bondRedeem,
  bondRef,
  bondRefDate,
  bondSeries,
  bondState,
  cryptoEntry,
  cryptoSearch,
  cryptoSymbol,
  goldEntry,
  goldFine,
  OZ_GRAMS,
} from '../src/client/assets.js';
import { balances, emptyFinance, investSummary, lotActive, lotPrice, lotResult, processBonds } from '../src/client/finance-core.js';

const near = (a, b, eps = 0.0051) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const bond = (type, date, extra = {}) => ({ id: `${type}-${date}`, asset: `${BOND_PREFIX}${bondSeries(type, date)}`, name: bondSeries(type, date), currency: 'PLN', qty: 1, price: 100, date, bond: { type, ...extra } });

test('kod serii, okresy odsetkowe i wykup jak w listach emisyjnych', () => {
  assert.equal(bondSeries('EDO', '2026-11-09'), 'EDO1136');
  assert.equal(bondSeries('OTS', '2026-11-30'), 'OTS0227'); // kupione 29 i 30 listopada – wykup 28 lutego
  assert.equal(bondSeries('ROR', '2026-11-01'), 'ROR1127');
  assert.equal(bondMaturity(bond('OTS', '2026-11-30', { rate1: 2 })), '2027-02-28');
  // ROR kupione 29.11.2026 (załącznik nr 3 do listu ROR1127): okres 3 – 29.01–28.02.2027, okres 4 – 28.02–29.03.2027.
  const p = bondPeriods('ROR', '2026-11-29');
  assert.equal(p.length, 12);
  assert.deepEqual(p[2], { k: 3, start: '2027-01-29', end: '2027-02-28' });
  assert.deepEqual(p[3], { k: 4, start: '2027-02-28', end: '2027-03-29' });
  assert.equal(p[11].end, '2027-11-29');
  assert.equal(bondPeriods('EDO', '2024-02-29')[1].start, '2025-02-28');
  assert.equal(bondPeriods('EDO', '2024-02-29')[4].start, '2028-02-29');
  assert.equal(bondDefaultFee('EDO', '2024-08-31'), 2);
  assert.equal(bondDefaultFee('EDO', '2024-09-01'), 3);
});

test('oprocentowanie: inflacja ogłoszona miesiąc przed okresem (za miesiąc o dwa wcześniejszy) i stopa NBP z 10. dnia roboczego', () => {
  // Tabela odsetkowa EDO0127 (okres 10 od stycznia 2026): 4,00% = inflacja za listopad 2025 (2,5%) + marża 1,50%.
  const data = { cpi: [['2025-10', 2.8], ['2025-11', 2.5], ['2025-12', 2.4]], ref: [['2025-12-04', 4], ['2026-03-05', 3.75]] };
  const edo = bond('EDO', '2017-01-15', { rate1: 2.7, margin: 1.5 });
  assert.equal(bondCpi(data, '2026-01-15'), 2.5);
  near(bondRate(edo, 10, data), 0.04, 1e-9);
  // Deflacja: zostaje sama marża.
  near(bondRate(edo, 10, { cpi: [['2025-11', -1.2]] }), 0.015, 1e-9);
  assert.equal(bondRate(edo, 10, { cpi: [] }), null);
  // Dziesiąty dzień roboczy przed 1.12.2026 to 17.11.2026; przed 1.01.2027 – 16.12.2026 (święta i Wigilia wolne).
  assert.equal(bondRefDate('2026-12'), '2026-11-17');
  assert.equal(bondRefDate('2027-01'), '2026-12-16');
  assert.equal(bondRef(data, '2026-03-02'), 4); // 10 dni roboczych przed 1.03 – jeszcze stopa 4,00%
  assert.equal(bondRef(data, '2026-04-02'), 3.75);
  const ror = bond('ROR', '2026-01-10', { rate1: 4.25, margin: 0 });
  near(bondRate(ror, 3, data), 0.04, 1e-9); // okres od 10.03.2026 – stopa z 13.02.2026
  near(bondRate(ror, 4, data), 0.0375, 1e-9);
});

test('EDO: przykład z obligacjeskarbowe.pl – przedterminowy wykup w 2. roku daje 101,75 zł', () => {
  // EDO0524 kupiona 10.05.2014 (4,00% w 1. roku), w 2. roku 1,50% (marża 1,50%, deflacja). Dyspozycja 9.06.2015,
  // odsetki do 16.06.2015: 4,16 zł; opłata 2 zł; podatek 0,41 zł od 2,16 zł.
  const lot = bond('EDO', '2014-05-10', { rate1: 4, margin: 1.5, fee: 2 });
  const data = { cpi: [['2015-03', -1.5]] };
  const st = bondState(lot, '2015-06-16', data);
  assert.equal(st.k, 2);
  near(st.rate, 0.015, 1e-9);
  assert.equal(st.value, 104.16);
  assert.equal(st.interest, 4.16);
  assert.deepEqual(bondRedeem(lot, st), { gross: 102.16, fee: 2, tax: 0.41, net: 101.75 });
  // Na IKE: bez opłaty i podatku.
  assert.equal(bondRedeem({ ...lot, bond: { ...lot.bond, ike: true } }, st).net, 104.16);
  // W 1. okresie opłata najwyżej do wysokości odsetek.
  const early = bondState(lot, '2014-06-10', data);
  assert.equal(bondRedeem(lot, early).gross, 100);
  // Wykup po 10 latach: N·Π(1+r) (bez danych o inflacji – szacunek ze stałą stopą).
  const end = bondState(lot, '2024-05-10', data);
  assert.equal(end.matured, true);
  assert.equal(end.estimated, true);
});

test('COI: odsetki co rok (N·r), wartość w trakcie okresu i najbliższa wypłata', () => {
  const lot = { ...bond('COI', '2026-11-09', { rate1: 4.75, margin: 1.5, fee: 2 }), qty: 10 };
  const data = { cpi: [['2027-09', 3.0], ['2028-09', 2.0]] };
  const mid = bondState(lot, '2027-05-09', data);
  assert.equal(mid.k, 1);
  near(mid.value, 100 + 4.75 * (bondDaysOf('2026-11-09', '2027-05-09') / 365), 0.006);
  assert.deepEqual(bondNextPayout(lot, mid), { date: '2027-11-09', gross: 4.75, last: false });
  const y2 = bondState(lot, '2028-01-09', data);
  assert.equal(y2.k, 2);
  near(y2.rate, 0.045, 1e-9); // inflacja za wrzesień 2027 (3,0%) + 1,50%
  assert.equal(y2.paid, 4.75);
  // Przedterminowy wykup od 2. okresu: opłata 2 zł w pełnej wysokości.
  assert.equal(bondRedeem(lot, bondState(lot, '2027-11-10', data)).gross, 98.01);
  // Wypłaty z okresu: 4,75 zł za 1. rok, 4,50 zł za 2. rok.
  const ev = bondEvents(lot, data, '2026-11-09', '2028-12-31');
  assert.deepEqual(ev.map((e) => [e.date, e.perBond]), [['2027-11-09', 4.75], ['2028-11-09', 4.5]]);
});

test('ROR i DOR: odsetki co miesiąc N·r/12, OTS: odsetki przy wykupie, bez odsetek przy wcześniejszym wykupie', () => {
  const ror = bond('ROR', '2026-11-29', { rate1: 4, margin: 0, fee: 0.5 });
  const data = { ref: [['2026-03-05', 3.75]] };
  const st = bondState(ror, '2027-01-05', data);
  assert.equal(st.k, 2);
  near(st.rate, 0.0375, 1e-9);
  assert.equal(st.paid, 0.33); // 100 · 4% / 12
  const ev = bondEvents(ror, data, '2026-11-29', '2027-11-29');
  assert.equal(ev.filter((e) => e.kind === 'odsetki').length, 12);
  assert.equal(ev[0].perBond, 0.33);
  assert.equal(ev[1].perBond, 0.31); // 3,75% / 12
  assert.deepEqual(ev.at(-1), { key: `bond|${ror.id}|wykup`, date: '2027-11-29', kind: 'wykup', perBond: 100 });
  const ots = bond('OTS', '2026-11-30', { rate1: 2 });
  assert.equal(bondState(ots, '2027-02-28', {}).value, 100.5);
  const half = bondState(ots, '2027-01-14', {});
  assert.ok(half.value > 100 && half.value < 100.5);
  assert.equal(bondRedeem(ots, half).gross, 100);
});

test('dziennik: wartość obligacji na koncie, zysk z wypłaconymi odsetkami, koniec po wykupie', () => {
  const market = { fx: {}, assets: {}, bonds: { cpi: [['2027-09', 3.0]] } };
  const lot = { ...bond('COI', '2026-11-09', { rate1: 4.75, margin: 1.5 }), qty: 10 };
  near(lotPrice(market, lot, '2027-11-08'), 104.74, 0.02);
  const r = lotResult(market, lot, '2028-01-09');
  near(r.income, 47.5, 1e-9);
  near(r.gain, r.value + 47.5 - 1000, 1e-9);
  assert.equal(lotActive(lot, '2030-11-08'), true);
  assert.equal(lotActive(lot, '2030-11-09'), false); // po wykupie pozycja znika z aktywów
  const sum = investSummary(market, { lots: [lot] }, '2031-01-01');
  assert.equal(sum.positions, 0);
  assert.ok(sum.realized > 0);
});

test('dziennik: odsetki i wykup zapisują się na koncie raz, z podatkiem 19%, od dnia dodania obligacji', () => {
  let n = 0;
  const newId = () => `t${++n}`;
  const fin = emptyFinance();
  const lot = { ...bond('COI', '2026-11-09', { rate1: 4.75, margin: 1.5, trackFrom: '2026-11-09' }), qty: 10 };
  fin.accounts = [
    { id: 'obl', name: 'Obligacje PKO', type: 'inwestycje', openingBalance: 0, lots: [lot] },
    { id: 'bank', name: 'PKO konto', type: 'bank', openingBalance: 0 },
  ];
  const market = { fx: {}, bonds: { cpi: [['2027-09', 3.0], ['2028-09', 2.5], ['2029-09', 2.0]] } };
  const r1 = processBonds(fin, '2027-11-09', { newId, market });
  assert.equal(r1.posted, 1);
  const t = r1.fin.txs[0];
  assert.equal(t.type, 'przychod');
  assert.equal(t.amount, 38.47); // 47,50 zł − 9,03 zł podatku
  assert.equal(t.accountId, 'obl');
  assert.ok(r1.fin.categories.some((c) => c.id === 'odsetki'));
  // Drugi raz – nic nowego; po usunięciu operacji też nie wraca.
  assert.equal(processBonds(r1.fin, '2027-11-20', { newId, market }).posted, 0);
  const deleted = { ...r1.fin, txs: r1.fin.txs.map((x) => ({ ...x, deleted: true })) };
  assert.equal(processBonds(deleted, '2027-11-20', { newId, market }).posted, 0);
  // Wypłaty na inne konto i wykup po 4 latach (odsetki za 4. rok + zwrot 1000 zł).
  const fin2 = { ...fin, accounts: [{ ...fin.accounts[0], lots: [{ ...lot, bond: { ...lot.bond, payTo: 'bank' } }] }, fin.accounts[1]] };
  const r2 = processBonds(fin2, '2030-11-20', { newId, market });
  assert.equal(r2.posted, 5);
  const bal = balances(r2.fin);
  near(bal.bank, 38.47 + 36.45 + 32.4 + 28.35 + 1000, 0.001); // 4,75% · 4,5% · 4,0% · 3,5% minus 19% od każdej wypłaty
  assert.equal(bal.obl, 0);
  // Bez danych o inflacji: odsetki za 2. rok czekają na aktualizację.
  assert.equal(processBonds(fin, '2028-11-20', { newId, market: { bonds: { cpi: [] } } }).posted, 1);
  // Obligacje dodane później: wcześniejsze wypłaty (już na koncie w banku) się nie zapisują.
  const later = { ...fin, accounts: [{ ...fin.accounts[0], lots: [{ ...lot, bond: { ...lot.bond, trackFrom: '2028-01-01' } }] }, fin.accounts[1]] };
  assert.equal(processBonds(later, '2028-12-01', { newId, market }).posted, 1);
});

test('złoto i kryptowaluty: wycena po cenie NBP za gram i kursie w złotych', () => {
  assert.equal(goldFine({ product: 'moneta-1oz' }), OZ_GRAMS);
  near(goldFine({ product: 'inny', mass: 8, purity: 900 }), 7.2, 1e-9);
  const gold = { prices: [['2026-11-06', 518.36], ['2026-11-09', 514.79]] };
  const crypto = { coins: [{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: 1 }, { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2 }, { id: 'wrapped-bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', rank: 20 }], dates: ['2026-11-08', '2026-11-09'], values: { bitcoin: [290000, 292061], ethereum: [8000, null] } };
  const market = { fx: {}, assets: { [GOLD_ASSET]: goldEntry(gold), [cryptoSymbol('bitcoin')]: cryptoEntry(crypto, cryptoSymbol('bitcoin')) } };
  // 2 monety 1 oz kupione po 15 000 zł: ilość w gramach, cena za gram.
  const g = { id: 'g', asset: GOLD_ASSET, currency: 'PLN', qty: 2 * OZ_GRAMS, price: 15000 / OZ_GRAMS, date: '2026-01-10', gold: { product: 'moneta-1oz', pieces: 2 } };
  near(lotResult(market, g, '2026-11-09').value, 2 * OZ_GRAMS * 514.79, 0.01);
  const b = { id: 'b', asset: cryptoSymbol('bitcoin'), currency: 'PLN', qty: 0.05, price: 250000, date: '2026-05-01' };
  near(lotResult(market, b, '2026-11-09').gain, 0.05 * (292061 - 250000), 1e-6);
  assert.deepEqual(cryptoSearch(crypto, 'btc').map((c) => c.id), ['bitcoin']);
  assert.deepEqual(cryptoSearch(crypto, 'bitcoin').map((c) => c.id), ['bitcoin', 'wrapped-bitcoin']);
  assert.deepEqual(cryptoSearch(crypto, 'eth').map((c) => c.id), ['ethereum']);
  assert.equal(cryptoEntry(crypto, cryptoSymbol('solana')), null);
});

function bondDaysOf(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
function round2(x) {
  return Math.round(x * 100) / 100;
}
