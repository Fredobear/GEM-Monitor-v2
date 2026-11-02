import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, monthDiff, lastWeekdayOfMonth, shiftMonthsISO, monthNamePL, monthGenitivePL, datePL } from '../src/lib/dates.js';
import { normalizeSeries, monthEnds, valueOnOrBefore, monthlyMomentum, rollingMomentum } from '../src/lib/series.js';

test('addMonths przechodzi przez granice lat w obie strony', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-03', -27), '2023-12');
  assert.equal(monthDiff('2025-11', '2026-11'), 12);
});

test('lastWeekdayOfMonth pomija weekendy', () => {
  assert.equal(lastWeekdayOfMonth('2026-10'), '2026-10-30'); // 31.10.2026 to sobota
  assert.equal(lastWeekdayOfMonth('2026-05'), '2026-05-29'); // 31.05.2026 to niedziela
  assert.equal(lastWeekdayOfMonth('2026-09'), '2026-09-30');
});

test('shiftMonthsISO przycina dzień do długości miesiąca (lata przestępne)', () => {
  assert.equal(shiftMonthsISO('2024-03-31', -1), '2024-02-29');
  assert.equal(shiftMonthsISO('2025-03-31', -1), '2025-02-28');
  assert.equal(shiftMonthsISO('2026-11-15', -12), '2025-11-15');
});

test('polskie nazwy miesięcy', () => {
  assert.equal(monthNamePL('2026-11'), 'listopad 2026');
  assert.equal(monthGenitivePL('2026-10'), 'października 2026');
  assert.equal(datePL('2026-11-02'), '2 listopada 2026');
});

test('normalizeSeries sortuje, usuwa duplikaty i błędne wartości', () => {
  const s = normalizeSeries([
    { date: '2026-01-03', value: 3 },
    { date: '2026-01-01', value: 1 },
    { date: '2026-01-02', value: NaN },
    { date: '2026-01-03', value: 4 },
    { date: '2026-01-04', value: -1 },
  ]);
  assert.deepEqual(s, [
    { date: '2026-01-01', value: 1 },
    { date: '2026-01-03', value: 4 },
  ]);
});

test('monthEnds bierze ostatnią obserwację miesiąca, momentum liczone z końców miesięcy', () => {
  const s = [
    { date: '2025-10-30', value: 90 },
    { date: '2025-10-31', value: 100 },
    { date: '2026-10-29', value: 118 },
    { date: '2026-10-30', value: 120 },
  ];
  const ends = monthEnds(s);
  assert.equal(ends.get('2025-10').value, 100);
  assert.equal(ends.get('2026-10').value, 120);
  const m = monthlyMomentum(ends, '2026-10', 12);
  assert.ok(Math.abs(m.ret - 0.2) < 1e-12);
  assert.equal(monthlyMomentum(ends, '2026-10', 6), null);
});

test('valueOnOrBefore i rollingMomentum', () => {
  const s = [
    { date: '2025-11-14', value: 100 },
    { date: '2025-11-17', value: 101 },
    { date: '2026-11-13', value: 110 },
  ];
  assert.equal(valueOnOrBefore(s, '2025-11-16').value, 100);
  assert.equal(valueOnOrBefore(s, '2025-11-01'), null);
  const m = rollingMomentum(s, '2026-11-15', 12);
  assert.equal(m.start.date, '2025-11-14');
  assert.equal(m.end.date, '2026-11-13');
  assert.ok(Math.abs(m.ret - 0.1) < 1e-12);
});
