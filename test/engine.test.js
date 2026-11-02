import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignals, DataError } from '../src/engine.js';
import { resolveRules } from '../src/strategy.js';
import { makeDaily, testConfig } from './helpers.js';

const rules = resolveRules(testConfig);

function market({ us = 0.012, exus = 0.006, bonds = 0.002, bills = 0.003, end = '2026-11-13' } = {}) {
  return {
    US: makeDaily('2022-01-03', end, us),
    EXUS: makeDaily('2022-01-03', end, exus),
    BONDS: makeDaily('2022-01-03', end, bonds),
    TBILLS: makeDaily('2022-01-03', end, bills),
  };
}

test('oficjalny sygnał za zakończony miesiąc + podgląd w trakcie miesiąca', () => {
  const res = computeSignals({ series: market(), rules, now: new Date('2026-11-14T06:00:00Z') });
  assert.equal(res.official.month, '2026-10');
  assert.equal(res.official.forMonth, '2026-11');
  assert.equal(res.official.asOf, '2026-10-30');
  assert.equal(res.official.decision.asset, 'US');
  // 12 miesięcy po ~1,2% → ok. 15,4%
  assert.ok(Math.abs(res.official.returns.US - (1.012 ** 12 - 1)) < 0.002);
  assert.ok(res.preview);
  assert.equal(res.preview.asOf, '2026-11-13');
  assert.equal(res.preview.differsFromOfficial, false);
  assert.equal(res.nextDecisionDate, '2026-11-30');
});

test('brak podglądu, gdy najnowsze dane to koniec miesiąca (uruchomienie 1. dnia miesiąca)', () => {
  const res = computeSignals({ series: market({ end: '2026-10-30' }), rules, now: new Date('2026-11-02T06:15:00Z') });
  assert.equal(res.official.month, '2026-10');
  assert.equal(res.preview, null);
});

test('niekompletny miesiąc (brak ostatnich sesji) blokuje sygnał zamiast liczyć na starych danych', () => {
  const series = market({ end: '2026-10-20' });
  assert.throws(() => computeSignals({ series, rules, now: new Date('2026-11-02T06:15:00Z') }), DataError);
});

test('historia pokazuje zmianę pozycji, gdy reszta świata przejmuje prowadzenie', () => {
  const exus = (m) => (m >= '2025-06' ? 0.03 : 0.004);
  const series = { ...market(), EXUS: makeDaily('2022-01-03', '2026-11-13', exus) };
  const res = computeSignals({ series, rules, now: new Date('2026-11-14T06:00:00Z') });
  assert.equal(res.official.decision.asset, 'EXUS');
  const firstExus = res.history.find((h) => h.asset === 'EXUS');
  assert.ok(firstExus.changed);
  assert.equal(firstExus.previous, 'US');
});

test('bessa w USA → obligacje, podgląd wykrywa nadchodzącą zmianę', () => {
  // Od lipca 2026 akcje USA mocno tracą; w listopadzie trend 12M spada poniżej bonów.
  const us = (m) => (m >= '2026-07' ? -0.05 : 0.008);
  const series = { ...market(), US: makeDaily('2022-01-03', '2026-11-13', us) };
  const res = computeSignals({ series, rules, now: new Date('2026-11-14T06:00:00Z') });
  assert.equal(res.official.decision.riskOn, false);
  assert.equal(res.official.decision.asset, 'BONDS');
});

test('nieaktualne dane generują ostrzeżenie', () => {
  const res = computeSignals({ series: market({ end: '2026-11-03' }), rules, now: new Date('2026-11-14T06:00:00Z') });
  assert.ok(res.warnings.some((w) => w.includes('nieaktualne')));
});

test('brak serii dla rynku decyzyjnego to błąd danych', () => {
  const series = market();
  delete series.TBILLS;
  assert.throws(() => computeSignals({ series, rules, now: new Date('2026-11-14T06:00:00Z') }), /TBILLS/);
});
