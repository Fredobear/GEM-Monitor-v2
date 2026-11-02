import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, resolveRules } from '../src/strategy.js';
import { stability, crossCheck } from '../src/validate.js';
import { testConfig } from './helpers.js';

const classic = resolveRules(testConfig);
const withRule = (patch) => ({ ...classic, ...patch });

test('trend dodatni, USA silniejsze od reszty świata → USA', () => {
  const d = decide({ US: 0.18, EXUS: 0.1, BONDS: 0.03, TBILLS: 0.04 }, classic);
  assert.equal(d.asset, 'US');
  assert.equal(d.riskOn, true);
  assert.ok(Math.abs(d.excess - 0.14) < 1e-12);
  assert.ok(Math.abs(d.relativeMargin - 0.08) < 1e-12);
});

test('trend dodatni, reszta świata silniejsza → akcje poza USA', () => {
  const d = decide({ US: 0.08, EXUS: 0.2, BONDS: 0.03, TBILLS: 0.04 }, classic);
  assert.equal(d.asset, 'EXUS');
});

test('filtr absolutny liczony na USA, nie na zwycięzcy (oryginał Antonacciego)', () => {
  // Reszta świata rośnie, ale USA przegrywa z bonami → wyjście do obligacji.
  const d = decide({ US: 0.03, EXUS: 0.2, BONDS: 0.01, TBILLS: 0.04 }, classic);
  assert.equal(d.asset, 'BONDS');
  assert.equal(d.riskOn, false);
  // Wariant WINNER zostałby w akcjach poza USA.
  assert.equal(decide({ US: 0.03, EXUS: 0.2, BONDS: 0.01, TBILLS: 0.04 }, withRule({ absoluteRef: 'WINNER' })).asset, 'EXUS');
});

test('remis USA z bonami → bezpieczna przystań (wymagana nadwyżka > 0)', () => {
  assert.equal(decide({ US: 0.04, EXUS: 0.01, BONDS: 0, TBILLS: 0.04 }, classic).asset, 'BONDS');
});

test('reguła „lepsze z obligacji i bonów” wybiera bony, gdy obligacje tracą (np. 2022)', () => {
  const rules = withRule({ safeAssetRule: 'lepsze_z_obligacji_i_bonow' });
  assert.equal(decide({ US: -0.15, EXUS: -0.2, BONDS: -0.12, TBILLS: 0.01 }, rules).asset, 'TBILLS');
  assert.equal(decide({ US: -0.3, EXUS: -0.35, BONDS: 0.06, TBILLS: 0.02 }, rules).asset, 'BONDS');
  // Oryginał zawsze obligacje.
  assert.equal(decide({ US: -0.15, EXUS: -0.2, BONDS: -0.12, TBILLS: 0.01 }, classic).asset, 'BONDS');
});

test('remis między rynkami akcji: zostajemy przy obecnej pozycji', () => {
  const r = { US: 0.1, EXUS: 0.1, BONDS: 0.02, TBILLS: 0.03 };
  assert.equal(decide(r, classic, 'EXUS').asset, 'EXUS');
  assert.equal(decide(r, classic, 'US').asset, 'US');
  assert.equal(decide(r, classic, null).asset, 'US');
});

test('bufor blokuje małą zmianę między rynkami akcji, ale nie wyjście do bezpiecznej przystani', () => {
  const rules = withRule({ switchBufferPct: 2 });
  assert.equal(decide({ US: 0.11, EXUS: 0.1, BONDS: 0.02, TBILLS: 0.03 }, rules, 'EXUS').asset, 'EXUS');
  assert.equal(decide({ US: 0.13, EXUS: 0.1, BONDS: 0.02, TBILLS: 0.03 }, rules, 'EXUS').asset, 'US');
  assert.equal(decide({ US: 0.02, EXUS: 0.1, BONDS: 0.02, TBILLS: 0.03 }, rules, 'EXUS').asset, 'BONDS');
});

test('wariant rozszerzony wybiera najsilniejszy z trzech rynków', () => {
  const rules = resolveRules({ ...testConfig, strategy: { ...testConfig.strategy, variant: 'rozszerzony' } });
  assert.equal(decide({ US: 0.1, DEVX: 0.12, EM: 0.25, BONDS: 0.02, TBILLS: 0.03 }, rules).asset, 'EM');
});

test('brak danych dla rynku decyzyjnego to błąd, nie cicha decyzja', () => {
  assert.throws(() => decide({ US: 0.1, BONDS: 0.02, TBILLS: 0.03 }, classic), /EXUS/);
});

test('flaga „na granicy” i ocena stabilności', () => {
  const d = decide({ US: 0.05, EXUS: 0.045, BONDS: 0.02, TBILLS: 0.04 }, classic);
  assert.equal(d.nearTie, true);
  assert.equal(stability(d).level, 'na granicy');
  const s = decide({ US: 0.2, EXUS: 0.05, BONDS: 0.02, TBILLS: 0.04 }, classic);
  assert.equal(s.nearTie, false);
  assert.equal(stability(s).level, 'stabilny');
});

test('porównanie dwóch źródeł danych wykrywa rozbieżność decyzji', () => {
  const a = { US: 0.05, EXUS: 0.049, BONDS: 0.02, TBILLS: 0.03 };
  const b = { US: 0.048, EXUS: 0.052, BONDS: 0.02, TBILLS: 0.03 };
  const res = crossCheck(a, b, classic, 0.75);
  assert.equal(res.withinTolerance, true);
  assert.equal(res.sameDecision, false);
  assert.equal(res.secondaryAsset, 'EXUS');
});

test('walidacja konfiguracji', () => {
  assert.throws(() => resolveRules({ ...testConfig, strategy: { ...testConfig.strategy, variant: 'xyz' } }), /Nieznany wariant/);
  assert.throws(() => resolveRules({ ...testConfig, strategy: { ...testConfig.strategy, safeAssetRule: 'zloto' } }), /bezpiecznej przystani/);
});
