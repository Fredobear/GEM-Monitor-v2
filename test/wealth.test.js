// Zakładka „Majątek”: historia z podziałem, skąd przyrost, struktura, nawyki i prognoza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accountWorth,
  compareMonth,
  emptyFinance,
  flowStart,
  forecastDefaults,
  holdingsTradeDelta,
  investmentMix,
  investSeries,
  investSummary,
  loanOutlook,
  loanSchedule,
  localToday,
  lotExitPrice,
  monthRemainder,
  netWorth,
  PLAN_EXTERNAL,
  processLoans,
  savingsStats,
  simulateWealth,
  wealthAt,
  wealthChange,
  wealthForecast,
  wealthStructure,
  worthSeries,
} from '../src/client/finance-core.js';
import { BOND_PREFIX, GOLD_ASSET } from '../src/client/assets.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
let n = 0;
const tx = (type, amount, date, accountId, extra = {}) => ({ id: `t${++n}`, type, amount, date, accountId, createdAt: 1, updatedAt: 1, ...extra });

// Dziennik od 1 lutego: pensja 28. dnia, wydatki 1. dnia, 26. dnia 1000 zł na konto inwestycyjne (ETF po stałej
// cenie 100 zł, dziś 120 zł), składka pracodawcy do PPE 300 zł miesięcznie i kredyt z ratami z harmonogramu.
const LOAN = { kind: 'gotowkowy', amount: 12000, principal: 12000, start: '2026-01-15', firstDue: '2026-02-15', months: 24, installments: 'rowne', rateType: 'stale', rates: [['2026-01-15', 12]], payFromId: 'bank', autoPost: true, trackFrom: '2026-01-15' };
const RATY = loanSchedule(LOAN).filter((r) => r.kind === 'rata');
const odsetki = (od, ile) => RATY.slice(od, od + ile).reduce((s, r) => s + r.interest, 0);
const kapital = (od, ile) => RATY.slice(od, od + ile).reduce((s, r) => s + r.principal, 0);
function sample() {
  let fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 5000 },
    { id: 'xtb', name: 'XTB', type: 'inwestycje', openingBalance: 0, lots: [] },
    { id: 'ppe', name: 'PPE', type: 'inwestycje', openingBalance: 0, lots: [], plans: [{ id: 'p', name: 'PPE', items: [], log: [] }] },
    { id: 'kredyt', name: 'Kredyt', type: 'kredyt', openingBalance: -12000, loan: { ...LOAN } },
  ];
  for (const m of ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) {
    fin.txs.push(tx('wydatek', 4000, `${m}-01`, 'bank', { categoryId: 'zakupy' }));
    fin.txs.push(tx('przychod', 8000, `${m}-28`, 'bank', { categoryId: 'wynagrodzenie' }));
    // Wpłata na inwestycje: przelew i kupno 10 szt. po 100 zł.
    fin.txs.push(tx('przelew', 1000, `${m}-26`, 'bank', { toAccountId: 'xtb' }));
    fin.txs.push(tx('korekta', -1000, `${m}-26`, 'xtb'));
    fin.accounts[1].lots.push({ id: `l${m}`, asset: 'ETF.PL', currency: 'PLN', qty: 10, price: 100, date: `${m}-26`, since: `${m}-26`, planId: 'x' });
    // Składka pracodawcy: jednostki funduszu spoza budżetu.
    fin.accounts[2].plans[0].log.push({ id: `e${m}`, date: `${m}-20`, amount: 300, fromId: PLAN_EXTERNAL });
    fin.accounts[2].lots.push({ id: `f${m}`, asset: 'INGTFI:1:E', currency: 'PLN', qty: 3, price: 100, date: `${m}-20`, planId: 'p' });
  }
  // Raty luty–czerwiec: odsetki jako wydatek, kapitał jako przelew na kredyt.
  fin = processLoans(fin, '2026-06-30', { newId: () => `t${++n}`, market: null }).fin;
  return fin;
}
const MARKET = { fx: {}, assets: { 'ETF.PL': { currency: 'PLN', quotes: [['2026-02-01', 100], ['2026-06-30', 100], ['2026-07-10', 120]], series: [] }, 'INGTFI:1:E': { currency: 'PLN', quotes: [['2026-02-01', 100], ['2026-07-10', 100]], series: [] } } };

test('majątek z podziałem i historia miesiąc po miesiącu zgadzają się z majątkiem łącznym', () => {
  const fin = sample();
  const today = '2026-07-10';
  const w = wealthAt(fin, MARKET, today);
  near(w.worth, netWorth(fin, MARKET, today).total);
  // Gotówka: 5000 + 5 × (8000 − 4000 − 1000) − raty; inwestycje: 50 szt. × 120 + 15 j.u. × 100; kredyt bez spłaconego kapitału.
  near(w.cash, 20000 - odsetki(0, 5) - kapital(0, 5));
  near(w.investments, 7500);
  near(w.loanDebt, 12000 - kapital(0, 5));
  near(w.invTotal, 7500);
  const points = worthSeries(fin, MARKET, { today });
  assert.deepEqual(points.map((p) => p.month), ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  near(points.at(-1).worth, w.worth);
  near(points[1].saved, 4000 - RATY[1].interest);
  near(points[1].external, 300);
  near(points[1].invested, 1000);
  assert.equal(worthSeries(fin, MARKET, { today, months: 3 }).length, 3);
});

test('skąd przyrost: odłożone z dochodów, wpłaty spoza budżetu i wynik inwestycji dają razem zmianę majątku', () => {
  const fin = sample();
  const ch = wealthChange(worthSeries(fin, MARKET, { today: '2026-07-10' }));
  assert.equal(ch.months, 5);
  near(ch.saved, 4 * 4000 - odsetki(1, 4)); // marzec–czerwiec (od końca lutego), lipiec bez operacji
  near(ch.external, 4 * 300);
  near(ch.invGain, 50 * 20); // ETF podrożał ze 100 do 120 zł
  near(ch.other, 0);
  near(ch.change, ch.saved + ch.external + ch.invGain);
  assert.equal(wealthChange([{ worth: 1 }]), null);
});

test('struktura majątku: rodzaje aktywów i długów, suma równa majątkowi netto', () => {
  const fin = sample();
  fin.accounts.push({ id: 'obl', name: 'Skarbiec', type: 'inwestycje', openingBalance: 150, lots: [{ id: 'g', asset: GOLD_ASSET, currency: 'PLN', qty: 10, price: 400, date: '2026-03-01' }, { id: 'b', asset: `${BOND_PREFIX}EDO0336`, currency: 'PLN', qty: 5, price: 100, date: '2026-03-01', bond: { type: 'EDO', rate1: 6, margin: 2 } }] });
  fin.accounts.push({ id: 'karta', name: 'Karta', type: 'karta', openingBalance: -700 });
  const market = { ...MARKET, assets: { ...MARKET.assets, [GOLD_ASSET]: { currency: 'PLN', quotes: [['2026-07-09', 500]], series: [] } }, bonds: { cpi: [] } };
  const st = wealthStructure(fin, market, '2026-07-10');
  const by = Object.fromEntries([...st.assets, ...st.debts].map((i) => [i.key, i.value]));
  near(by.konta, 20000 - odsetki(0, 5) - kapital(0, 5));
  near(by.akcje, 6000);
  near(by.fundusze, 1500);
  near(by.zloto, 5000);
  near(by.broker, 150);
  assert.ok(by.obligacje > 500 && by.obligacje < 520);
  near(by.kredyty, -(12000 - kapital(0, 5)));
  near(by.karty, -700);
  near(st.net, netWorth(fin, market, '2026-07-10').total);
  near(st.liquid, 20000 - odsetki(0, 5) - kapital(0, 5));
  near(st.assets.reduce((s, i) => s + i.share, 0), 1, 1e-9);
  assert.equal(st.assets[0].key, 'konta');
});

test('nawyki: pełne miesiące bez bieżącego, stopa oszczędności, kwota inwestowana i koszt kredytu', () => {
  const s = savingsStats(sample(), MARKET, { today: '2026-07-10' });
  assert.equal(s.n, 5);
  near(s.avgIncome, 8000);
  near(s.avgExpense, 4000 + odsetki(0, 5) / 5);
  near(s.avgSaved, 4000 - odsetki(0, 5) / 5);
  near(s.rate, (4000 - odsetki(0, 5) / 5) / 8000, 1e-9);
  near(s.avgInvested, 1000);
  near(s.avgExternal, 300);
  near(s.avgLoanCost, odsetki(0, 5) / 5);
  assert.ok(s.sd > 0 && s.sd < 15); // odsetki maleją z raty na ratę
  assert.equal(savingsStats(sample(), MARKET, { today: '2026-07-10', months: 3 }).n, 3);
  assert.equal(savingsStats(emptyFinance(), MARKET, { today: '2026-07-10' }).n, 0);
  // To, co zwykle dzieje się po 10. dniu miesiąca: pensja 28. (+8000), przelew na inwestycje 26. i składka 20.
  const rest = monthRemainder(sample(), MARKET, '2026-07-10');
  near(rest.cashIn, 8000);
  near(rest.invested, 1000);
  near(rest.external, 300);
  near(monthRemainder(sample(), MARKET, '2026-07-29').cashIn, 0);
});

test('średnie tylko z pełnych miesięcy: bez niepełnego pierwszego miesiąca dziennika i bez bieżącego', () => {
  const fin = emptyFinance();
  fin.accounts = [{ id: 'bank', name: 'Bank', type: 'bank', openingBalance: 0 }];
  // Dziennik od 15 września (wypłata z początku września nie jest zapisana), październik pełny, listopad jeszcze trwa.
  fin.txs.push(tx('wydatek', 866, '2026-09-15', 'bank', { categoryId: 'zakupy' }));
  fin.txs.push(tx('przychod', 7000, '2026-10-10', 'bank', { categoryId: 'wynagrodzenie' }), tx('wydatek', 3300, '2026-10-20', 'bank', { categoryId: 'zakupy' }));
  fin.txs.push(tx('wydatek', 1600, '2026-11-05', 'bank', { categoryId: 'zakupy' }));
  assert.deepEqual(flowStart(fin), { start: '2026-09-15', firstFull: '2026-10', partial: '2026-09' });
  const s = savingsStats(fin, MARKET, { today: '2026-11-12' });
  assert.deepEqual(s.months.map((m) => m.month), ['2026-10']);
  near(s.avgSaved, 3700);
  near(s.avgExpense, 3300);
  near(s.rate, 3700 / 7000, 1e-9);
  assert.equal(s.partial, '2026-09');
  assert.equal(s.current, '2026-11');
  // Reszta listopada w prognozie: to, co działo się po 12. dniu pełnych miesięcy (październik: wydatek 20.).
  const rest = monthRemainder(fin, MARKET, '2026-11-12');
  assert.equal(rest.n, 1);
  near(rest.cashIn, -3300);
  assert.equal(forecastDefaults(fin, MARKET, { today: '2026-11-12' }).n, 1);
  // Raty kredytu zapisane automatycznie wstecz (od marca) nie przesuwają początku dziennika.
  const withLoan = { ...fin, txs: [...fin.txs, tx('wydatek', 400, '2026-03-10', 'bank', { source: 'kredyt', categoryId: 'kredyt' })] };
  assert.equal(flowStart(withLoan).start, '2026-09-15');
  assert.equal(savingsStats(withLoan, MARKET, { today: '2026-11-12' }).n, 1);
  // Dziennik od 1. dnia miesiąca: ten miesiąc też jest pełny.
  fin.txs.push(tx('wydatek', 10, '2026-09-01', 'bank', { categoryId: 'zakupy' }));
  const s2 = savingsStats(fin, MARKET, { today: '2026-11-12' });
  assert.deepEqual(s2.months.map((m) => m.month), ['2026-09', '2026-10']);
  assert.equal(s2.partial, null);
  // Jeszcze bez pełnego miesiąca: brak średnich, a pominięty jest tylko bieżący miesiąc.
  const fresh = emptyFinance();
  fresh.accounts = fin.accounts;
  fresh.txs.push(tx('wydatek', 50, '2026-11-03', 'bank', { categoryId: 'zakupy' }));
  const s3 = savingsStats(fresh, MARKET, { today: '2026-11-12' });
  assert.equal(s3.n, 0);
  assert.equal(s3.partial, null);
  assert.equal(monthRemainder(fresh, MARKET, '2026-11-12').n, 0);
});

test('inwestycje: wartość pozycji i wpłacone pieniądze miesiąc po miesiącu, zysk to różnica', () => {
  const { points, approxUntil } = investSeries(sample(), MARKET, { today: '2026-07-10' });
  // Pierwszy punkt: koniec miesiąca przed pierwszym zakupem (zero). Co miesiąc 10 szt. ETF i 3 j.u. funduszu po 100 zł.
  assert.deepEqual(points.map((p) => p.month), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']);
  near(points[0].value, 0);
  near(points[0].invested, 0);
  near(points[1].value, 1300);
  near(points[1].invested, 1300);
  near(points[5].invested, 6500);
  const last = points.at(-1);
  assert.equal(last.date, '2026-07-10');
  near(last.value, 7500); // ETF podrożał do 120 zł
  near(last.invested, 6500);
  near(last.gain, 1000);
  assert.equal(approxUntil, null);

  // Pozycja dopisana później (since) liczy się od daty zakupu, sprzedana znika z obu linii, aktywo z wyceną ręczną
  // jest pominięte, a portfel GEM ma wartość i wpłaty z historii zakładki GEM.
  const fin = emptyFinance();
  fin.accounts = [
    {
      id: 'xtb', name: 'XTB', type: 'inwestycje', openingBalance: 0,
      lots: [
        { id: 'a', asset: 'ETF.PL', currency: 'PLN', qty: 10, price: 100, date: '2026-03-10', since: '2026-06-01' },
        { id: 's', asset: 'ETF.PL', currency: 'PLN', qty: 5, price: 100, date: '2026-03-10', until: '2026-05-15' },
        { id: 'm', asset: 'manual', name: 'Mieszkanie', currency: 'PLN', qty: 1, price: 500000, date: '2026-03-01', marks: [['2026-03-01', 500000]] },
      ],
    },
    { id: 'ike', name: 'IKE', type: 'inwestycje', openingBalance: 0, gemAccount: 'IKE', gemValuation: true },
  ];
  const market = { ...MARKET, gemValues: { IKE: { value: 13000, invested: 10000, date: '2026-07-10', history: [['2026-04-30', 10200, 10000], ['2026-05-29', 10800, 10000]] } } };
  const pts = investSeries(fin, market, { today: '2026-07-10' }).points;
  const at = (m) => pts.find((p) => p.month === m);
  assert.equal(pts[0].month, '2026-02');
  near(at('2026-03').value, 1500);
  near(at('2026-03').invested, 1500);
  near(at('2026-04').value, 1500 + 10200);
  near(at('2026-04').invested, 1500 + 10000);
  near(at('2026-05').value, 1000 + 10800);
  near(at('2026-05').invested, 1000 + 10000);
  near(at('2026-06').value, 1000 + 10800);
  near(at('2026-07').value, 1200 + 13000);
  near(at('2026-07').invested, 1000 + 10000);
  // Starsza historia GEM bez wpłat: wpłaty netto to suma przelewów na konto.
  market.gemValues.IKE.history = [['2026-04-30', 10200]];
  fin.accounts.push({ id: 'bank', name: 'Bank', type: 'bank', openingBalance: 20000 });
  fin.txs.push(tx('przelew', 9000, '2026-04-02', 'bank', { toAccountId: 'ike' }));
  near(investSeries(fin, market, { today: '2026-07-10' }).points.find((p) => p.month === '2026-04').invested, 1500 + 9000);
  // Notowania od późniejszej daty niż zakup: do tego dnia wycena po cenie zakupu.
  const early = { ...market, assets: { 'ETF.PL': { currency: 'PLN', quotes: [['2026-04-01', 100], ['2026-07-10', 120]], series: [] } } };
  assert.equal(investSeries(fin, early, { today: '2026-07-10' }).approxUntil, '2026-04-01');
  assert.deepEqual(investSeries(emptyFinance(), MARKET, { today: '2026-07-10' }), { points: [], approxUntil: null });
  // Obligacja COI: wypłacone odsetki (6% po podatku 19%) zmniejszają wpłacone pieniądze – to pieniądze już odebrane.
  const coi = emptyFinance();
  coi.accounts = [{ id: 'obl', name: 'Obligacje', type: 'inwestycje', openingBalance: 0, lots: [{ id: 'c', asset: `${BOND_PREFIX}COI0329`, currency: 'PLN', qty: 10, price: 100, date: '2025-03-10', bond: { type: 'COI', rate1: 6, margin: 1.5, fee: 2 } }] }];
  const bp = investSeries(coi, { fx: {}, assets: {}, bonds: { cpi: [['2026-01', 4]] } }, { today: '2026-04-30' }).points;
  near(bp.find((p) => p.month === '2026-02').invested, 1000);
  near(bp.find((p) => p.month === '2026-03').invested, 1000 - 48.6);
});

test('symulacja: odkładanie, procent składany, kredyt z harmonogramu, brak gotówki i deficyt', () => {
  // Sama gotówka: co miesiąc +1000 zł.
  const a = simulateWealth({ cash: 5000, investments: 0, debt: 0, months: 12, saved: 1000, indexed: false });
  assert.equal(a.length, 13);
  near(a[0].worth, 5000);
  near(a[12].worth, 17000);
  // Inwestycje: 500 zł miesięcznie przy 6% rocznie – wzór na przyszłą wartość wpłat.
  const b = simulateWealth({ cash: 0, investments: 10000, debt: 0, months: 120, saved: 500, invested: 500, returnPct: 6, indexed: false });
  const rm = 1.06 ** (1 / 12) - 1;
  near(b[120].investments, 10000 * 1.06 ** 10 + (500 * ((1 + rm) ** 120 - 1)) / rm, 0.5);
  near(b[120].cash, 0);
  // Odkładana kwota rośnie z inflacją: po roku wpłata większa o 3%.
  const c = simulateWealth({ cash: 0, investments: 0, debt: 0, months: 13, saved: 1000, inflationPct: 3 });
  near(c[13].cash - c[12].cash, 1000 * 1.03 ** (13 / 12));
  // Kredyt: w historii wydatków było 100 zł kosztu miesięcznie; harmonogram: 400 zł kapitału i 80 zł odsetek, potem koniec.
  const loans = [{ principal: 0, cost: 0 }, { principal: 400, cost: 80 }, { principal: 400, cost: 60 }, { principal: 0, cost: 0 }];
  const d = simulateWealth({ cash: 1000, investments: 0, debt: 800, months: 3, saved: 900, loanCost: 100, loans, indexed: false });
  near(d[1].cash, 1000 + 1000 - 80 - 400);
  near(d[1].debt, 400);
  near(d[2].worth, d[1].worth + 1000 - 60); // spłata kapitału nie zmienia majątku, odsetki tak
  near(d[3].cash, d[2].cash + 1000); // po spłacie kredytu zostaje więcej
  // Nie da się zainwestować więcej, niż jest gotówki; przy deficycie różnica idzie z inwestycji.
  const e = simulateWealth({ cash: 100, investments: 0, debt: 0, months: 1, saved: 200, invested: 5000, indexed: false });
  near(e[1].investments, 300);
  near(e[1].cash, 0);
  const g = simulateWealth({ cash: 100, investments: 5000, debt: 0, months: 2, saved: -600, indexed: false });
  near(g[2].cash, 0);
  near(g[2].investments, 5000 - 1100);
});

test('prognoza: założenia z historii, przedział ostrożny–optymistyczny i start niezależny od dnia miesiąca', () => {
  const fin = sample();
  const market = { ...MARKET, assets: { ...MARKET.assets, 'ETF.PL': { currency: 'PLN', quotes: [['2026-02-01', 100], ['2026-08-31', 100]], series: [] } } };
  const d = forecastDefaults(fin, market, { today: '2026-07-10' });
  assert.equal(d.basis, 'historia');
  near(d.saved, 4000 - odsetki(0, 5) / 5);
  near(d.invested, 1000);
  near(d.external, 300);
  near(d.loanCost, odsetki(0, 5) / 5);
  near(d.returnPct, (5000 * 7 + 1500 * 6) / 6500, 0.051);
  near(d.savedSpread, 0.1); // równe miesiące – wąski przedział
  const fc = wealthForecast(fin, market, { today: '2026-07-10', months: 24 });
  assert.equal(fc.base.length, 25);
  assert.equal(fc.dates[0], '2026-07-31');
  assert.equal(fc.dates[12], '2027-07-31');
  for (const i of [1, 12, 24]) assert.ok(fc.low[i].worth < fc.base[i].worth && fc.base[i].worth < fc.high[i].worth);
  // Dług maleje zgodnie z harmonogramem i znika po ostatniej racie.
  assert.ok(fc.base[6].debt < fc.base[1].debt);
  near(fc.base[24].debt, 0);
  // Przed wypłatą (10.) i po niej (29.) prognoza na koniec miesiąca i za rok jest prawie taka sama.
  const before = wealthForecast(fin, market, { today: '2026-06-10', months: 12 });
  const after = wealthForecast(fin, market, { today: '2026-06-29', months: 12 });
  near(before.base[0].worth, after.base[0].worth, 150);
  near(before.base[12].worth, after.base[12].worth, 300);
  // Własne założenia: większa odkładana kwota i wyższy zysk dają wyższy wynik.
  const more = wealthForecast(fin, market, { today: '2026-07-10', months: 24, overrides: { saved: 5000, returnPct: 9 } });
  assert.equal(more.params.saved, 5000);
  assert.equal(more.params.returnPct, 9);
  assert.ok(more.base[24].worth > fc.base[24].worth + 20000);
  // Raty: pozycja 0 – reszta bieżącego miesiąca.
  const lo = loanOutlook(fin, market, '2026-07-10', 2);
  assert.equal(lo.length, 3);
  assert.ok(lo[0].principal > 0 && lo[0].cost > 0);
});

test('prognoza bez historii: stałe pozycje i plany jako podstawa; skład portfela wyznacza oczekiwany zysk', () => {
  const fin = emptyFinance();
  fin.accounts = [{ id: 'bank', name: 'Bank', type: 'bank', openingBalance: 2000 }, { id: 'xtb', name: 'XTB', type: 'inwestycje', openingBalance: 0, plans: [{ id: 'p', name: 'Plan', items: [], recurring: { amount: 400, day: 2, fromId: 'bank', auto: true, nextDate: '2026-08-02' }, log: [] }] }];
  fin.recurring = [
    { id: 'r1', title: 'Pensja', type: 'przychod', amount: 6000, accountId: 'bank', freq: 'miesiac', nextDate: '2026-07-28', auto: true },
    { id: 'r2', title: 'Czynsz', type: 'wydatek', amount: 2500, accountId: 'bank', freq: 'miesiac', nextDate: '2026-08-05', auto: true },
  ];
  const d = forecastDefaults(fin, { fx: {} }, { today: '2026-07-10' });
  assert.equal(d.basis, 'stale');
  near(d.saved, 3500);
  near(d.invested, 400);
  assert.equal(d.returnPct, 6); // brak inwestycji – założenie dla szerokiego portfela
  assert.equal(forecastDefaults(emptyFinance(), { fx: {} }, { today: '2026-07-10' }).basis, 'brak');
  // Obligacje indeksowane: inflacja + marża; złoto: inflacja + 1,5 pp.
  fin.accounts[1].lots = [{ id: 'b', asset: `${BOND_PREFIX}EDO0736`, currency: 'PLN', qty: 10, price: 100, date: '2026-07-01', bond: { type: 'EDO', rate1: 6, margin: 2 } }, { id: 'g', asset: GOLD_ASSET, currency: 'PLN', qty: 2, price: 500, date: '2026-07-01' }];
  const mix = investmentMix(fin, { fx: {}, assets: { [GOLD_ASSET]: { currency: 'PLN', quotes: [['2026-07-09', 500]], series: [] } }, bonds: { cpi: [] } }, '2026-07-10', 3);
  assert.deepEqual(mix.items.map((i) => [i.key, Math.round(i.ret * 10) / 10]), [['obligacje', 5], ['zloto', 4.5]]);
  near(mix.returnPct, 4.8, 0.051);
});

test('portfel GEM w historii majątku: wartość z zapisanej historii zamiast sumy wpłat', () => {
  const fin = emptyFinance();
  fin.accounts = [{ id: 'ike', name: 'IKE', type: 'inwestycje', openingBalance: 10000, gemAccount: 'IKE', gemValuation: true }];
  const market = { fx: {}, gemValues: { IKE: { value: 13000, invested: 10000, date: '2026-07-10', history: [['2026-03-31', 10400], ['2026-04-30', 11200], ['2026-05-29', 12100]] } } };
  assert.equal(accountWorth(fin, fin.accounts[0], market, '2026-07-10').total, 13000);
  assert.equal(accountWorth(fin, fin.accounts[0], market, '2026-05-15').total, 11200);
  assert.equal(accountWorth(fin, fin.accounts[0], market, '2026-04-30').total, 11200);
  assert.equal(accountWorth(fin, fin.accounts[0], market, '2026-02-15').total, 10000); // przed historią: suma wpłat
  delete market.gemValues.IKE.history;
  assert.equal(accountWorth(fin, fin.accounts[0], market, '2026-05-15').total, 10000);
});

test('obligacje przy sprzedaży: przedterminowy wykup na rękę (opłata i podatek), po wykupie – odsetki po podatku', () => {
  const market = { fx: {}, assets: {}, bonds: { cpi: [['2015-03', -1.5]] } };
  const lot = { id: 'e', asset: `${BOND_PREFIX}EDO0524`, currency: 'PLN', qty: 10, price: 100, date: '2014-05-10', bond: { type: 'EDO', rate1: 4, margin: 1.5, fee: 2 } };
  // Przykład z obligacjeskarbowe.pl: 16.06.2015 wartość 104,16 zł, na rękę 101,75 zł.
  near(lotExitPrice(market, lot, '2015-06-16'), 101.75);
  near(holdingsTradeDelta(market, [lot], [], [{ ...lot, until: '2015-06-16' }], '2015-06-16'), -1017.5);
  const sold = investSummary(market, { lots: [{ ...lot, until: '2015-06-16' }] }, '2015-07-01');
  near(sold.realized, 17.5);
  // Na IKE bez opłaty i podatku.
  near(lotExitPrice(market, { ...lot, bond: { ...lot.bond, ike: true } }, '2015-06-16'), 104.16);
});

test('drobiazgi: dzisiejsza data lokalna i średnia z poprzednich pełnych miesięcy przy krótkiej historii', () => {
  assert.match(localToday(), /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  assert.equal(Number(localToday().slice(8, 10)), d.getDate());
  const fin = emptyFinance();
  fin.accounts = [{ id: 'bank', name: 'Bank', type: 'bank', openingBalance: 0 }];
  fin.txs.push(tx('wydatek', 900, '2026-06-10', 'bank', { categoryId: 'zakupy' }), tx('wydatek', 600, '2026-07-03', 'bank', { categoryId: 'zakupy' }));
  // Dziennik od 10 czerwca: czerwiec jest niepełny, więc przed lipcem nie ma jeszcze pełnego miesiąca do średniej.
  let cmp = compareMonth(fin, '2026-07');
  assert.equal(cmp.avgMonths, 0);
  assert.equal(cmp.rows[0].avg3, null);
  // Dziennik od 1 maja: średnia z maja i czerwca – dwa pełne miesiące, nie dzielimy przez 3.
  fin.txs.push(tx('wydatek', 300, '2026-05-01', 'bank', { categoryId: 'zakupy' }));
  cmp = compareMonth(fin, '2026-07');
  assert.equal(cmp.avgMonths, 2);
  assert.equal(cmp.avgFrom, '2026-05');
  assert.equal(cmp.rows[0].avg3, 600);
  assert.equal(compareMonth(fin, '2026-10').avgMonths, 3);
});
