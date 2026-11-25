// Cele finansowe: ile odkładać, gdzie trzymać pieniądze (według terminu), poduszka finansowa, jednorazowa wpłata
// z nadwyżki gotówki, podział nadwyżki na cele i inwestycje oraz zakupy z celów w prognozie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFinance, goalMonthly, goalMonthsNeeded, goalPlan, goalSpends, goalTarget, goalVehicle, wealthForecast } from '../src/client/finance-core.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const BONDS = {
  offer: ['OTS0227', 'ROR1127', 'DOR1128', 'TOS1129', 'COI1130', 'EDO1136'],
  series: { OTS0227: { type: 'OTS', rate1: 2 }, ROR1127: { type: 'ROR', rate1: 4, margin: 0 }, DOR1128: { type: 'DOR', rate1: 4.15, margin: 0.15 }, TOS1129: { type: 'TOS', rate1: 4.4 }, COI1130: { type: 'COI', rate1: 4.75, margin: 1.5 }, EDO1136: { type: 'EDO', rate1: 5.35, margin: 2 } },
  ref: [['2026-03-05', 3.75]],
  cpi: [],
};
const MARKET = { fx: {}, assets: {}, bonds: BONDS };
let n = 0;
const tx = (type, amount, date, accountId, extra = {}) => ({ id: `t${++n}`, type, amount, date, accountId, createdAt: 1, updatedAt: 1, ...extra });

// Dziennik od 1 lutego: pensja 10 000 zł i wydatki 6000 zł co miesiąc (nadwyżka 4000 zł), na koncie `cash`.
function sample(cash) {
  const fin = emptyFinance();
  fin.accounts = [
    { id: 'bank', name: 'Bank', type: 'bank', openingBalance: cash - 3 * 4000 - 4000 },
    { id: 'osz', name: 'Na samochód', type: 'oszczednosci', openingBalance: 0 },
  ];
  for (const m of ['2026-02', '2026-03', '2026-04']) fin.txs.push(tx('przychod', 10000, `${m}-01`, 'bank', { categoryId: 'wynagrodzenie' }), tx('wydatek', 6000, `${m}-10`, 'bank', { categoryId: 'zakupy' }));
  fin.txs.push(tx('przychod', 10000, '2026-05-01', 'bank', { categoryId: 'wynagrodzenie' }), tx('wydatek', 6000, '2026-05-10', 'bank', { categoryId: 'zakupy' }));
  return fin;
}
const TODAY = '2026-05-15';

test('rata celu: bez zysku to brakująca kwota przez liczbę miesięcy, z zyskiem mniej; inflacja podnosi cenę', () => {
  near(goalMonthly(12000, 0, 12, 0), 1000);
  assert.ok(goalMonthly(12000, 0, 12, 4) < 1000);
  near(goalMonthly(12000, 12000, 12, 4), 0);
  near(goalMonthly(12000, 6000, 12, 0), 500);
  near(goalTarget({ amount: 10000 }, 24, 3), 10000 * 1.03 ** 2);
  near(goalTarget({ amount: 10000, inflate: false }, 24, 3), 10000);
  // Przy 1000 zł miesięcznie na 12 000 zł (bez inflacji i zysku) – 12 miesięcy.
  assert.equal(goalMonthsNeeded({ amount: 12000, inflate: false }, 0, 1000, 0), 12);
});

test('gdzie trzymać pieniądze: im bliżej zakupu, tym bezpieczniej – obligacje z bieżącej oferty, akcje tylko przy długim terminie', () => {
  assert.equal(goalVehicle(2, MARKET).key, 'konto');
  const ror = goalVehicle(8, MARKET);
  assert.equal(ror.key, 'ror');
  near(ror.ratePct, 4 * 0.81); // po podatku 19%
  assert.match(ror.where, /ROR1127/);
  assert.equal(goalVehicle(20, MARKET).key, 'dor');
  const tos = goalVehicle(30, MARKET);
  assert.equal(tos.key, 'tos');
  assert.equal(tos.eqShare, 0);
  assert.equal(goalVehicle(50, MARKET).eqShare, 0.2);
  assert.equal(goalVehicle(80, MARKET).eqShare, 0.4);
  const edo = goalVehicle(120, MARKET, 3);
  assert.equal(edo.key, 'edo');
  near(edo.ratePct, (0.6 * 7 + 0.4 * (3 + 2)) * 0.81);
});

test('plan celu: podział nadwyżki – poduszka, cel, a reszta na inwestycje', () => {
  // 30 000 zł na koncie przy wydatkach 6000 zł miesięcznie: poduszka (3–6 miesięcy) jest, nadmiaru gotówki brak.
  const fin = sample(30000);
  fin.goals = [{ id: 'g', name: 'Wakacje', amount: 24000, date: '2027-05-20', inflate: false }];
  const plan = goalPlan(fin, MARKET, { today: TODAY });
  assert.equal(plan.basis, 'historia');
  near(plan.surplus, 4000);
  near(plan.emergency.monthly, 0);
  near(plan.excess, 0);
  const g = plan.goals[0];
  assert.equal(g.months, 12);
  assert.equal(g.vehicle.key, 'ror');
  assert.ok(g.need < 2000 && g.need > 1900); // trochę mniej niż 24 000 / 12 dzięki odsetkom
  near(g.need0, 2000);
  near(plan.investAfter, 4000 - g.need);
  near(plan.shortfall, 0);
  // Za drogi cel: brakuje części raty, a przy możliwej kwocie cel przesuwa się w czasie.
  fin.goals = [{ id: 'g', name: 'Samochód', amount: 100000, date: '2027-05-20', inflate: false }];
  const big = goalPlan(fin, MARKET, { today: TODAY });
  const b = big.goals[0];
  near(b.funded, 4000);
  assert.ok(b.short > 4000);
  assert.ok(b.extendTo > 20 && b.extendTo < 26);
  near(big.investAfter, 0);
  assert.ok(big.shortfall > 4000);
});

test('plan celu: najpierw poduszka finansowa, nadmiar gotówki jako wpłata jednorazowa, osobne konto na cel', () => {
  // Tylko 6000 zł na koncie: do 3 miesięcy wydatków (18 000 zł) brakuje 12 000 zł – 2000 zł miesięcznie przez pół roku.
  const low = goalPlan({ ...sample(6000), goals: [{ id: 'g', name: 'Cel', amount: 12000, date: '2027-05-20', inflate: false }] }, MARKET, { today: TODAY });
  near(low.emergency.gap, 12000);
  near(low.emergency.monthly, 2000);
  near(low.goals[0].funded, Math.min(2000, low.goals[0].need));
  // 50 000 zł na koncie: 14 000 zł ponad 6 miesięcy wydatków można od razu przeznaczyć na cel.
  const rich = goalPlan({ ...sample(50000), goals: [{ id: 'g', name: 'Cel', amount: 24000, date: '2027-05-20', inflate: false }] }, MARKET, { today: TODAY });
  near(rich.excess, 14000);
  near(rich.goals[0].lump, 14000);
  assert.ok(rich.goals[0].needLump < rich.goals[0].need / 2);
  // Osobne konto na cel: postęp z jego salda, a te pieniądze nie liczą się do poduszki.
  const fin = sample(30000);
  fin.accounts[1].openingBalance = 5000;
  fin.goals = [{ id: 'g', name: 'Samochód', amount: 24000, date: '2027-05-20', inflate: false, accountId: 'osz' }];
  const acc = goalPlan(fin, MARKET, { today: TODAY });
  near(acc.goals[0].saved, 5000);
  near(acc.emergency.have, 30000);
  assert.ok(acc.goals[0].need < goalMonthly(24000, 0, 12, acc.goals[0].vehicle.ratePct));
});

test('cele w prognozie: zakup w miesiącu celu zmniejsza majątek (można wyłączyć)', () => {
  const fin = sample(30000);
  fin.goals = [{ id: 'g', name: 'Samochód', amount: 20000, date: '2026-11-20', inflate: false }];
  const spends = goalSpends(fin, TODAY, 12);
  near(spends[6], 20000);
  const withGoal = wealthForecast(fin, MARKET, { today: TODAY, months: 12, overrides: { inflationPct: 0 } });
  const without = wealthForecast(fin, MARKET, { today: TODAY, months: 12, overrides: { inflationPct: 0, goals: false } });
  near(without.base[5].worth - withGoal.base[5].worth, 0);
  near(without.base[6].worth - withGoal.base[6].worth, 20000);
  assert.equal(goalSpends({ ...fin, goals: [{ ...fin.goals[0], date: '2026-05-01' }] }, TODAY, 12).length, 0); // termin minął
});
