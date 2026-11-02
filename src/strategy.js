// Reguły GEM jako czyste funkcje. Wejście: stopy zwrotu z okna momentum (np. 12M) dla każdego rynku.
// Wyjście: decyzja wraz z marginesami, które pokazują, jak daleko jest do zmiany sygnału.

export const SAFE_RULES = ['obligacje', 'lepsze_z_obligacji_i_bonow'];

export function resolveRules(config) {
  const s = config.strategy;
  const variant = config.variants[s.variant];
  if (!variant) throw new Error(`Nieznany wariant strategii: "${s.variant}" (dostępne: ${Object.keys(config.variants).join(', ')})`);
  if (!SAFE_RULES.includes(s.safeAssetRule)) throw new Error(`Nieznana reguła bezpiecznej przystani: "${s.safeAssetRule}"`);
  if (!(s.lookbackMonths >= 1 && s.lookbackMonths <= 24)) throw new Error('lookbackMonths musi być w zakresie 1–24');
  for (const key of [...variant.equities, variant.hurdle, ...variant.safe]) {
    if (!config.assets[key]) throw new Error(`Wariant "${s.variant}" używa rynku "${key}", którego nie ma w sekcji assets`);
  }
  return {
    variant: s.variant,
    equities: variant.equities,
    absoluteRef: variant.absoluteRef ?? 'US',
    hurdle: variant.hurdle,
    safe: variant.safe,
    lookbackMonths: s.lookbackMonths,
    skipMonths: s.skipMonths ?? 0,
    safeAssetRule: s.safeAssetRule,
    switchBufferPct: s.switchBufferPct ?? 0,
    nearTiePct: s.nearTiePct ?? 1,
  };
}

export const decisionAssets = (rules) => [...new Set([...rules.equities, rules.hurdle, ...rules.safe])];

// Ranking malejąco; przy remisie wygrywa obecnie trzymany rynek, a potem kolejność z konfiguracji.
function rank(keys, returns, previous) {
  return [...keys].sort((a, b) => {
    const diff = returns[b] - returns[a];
    if (diff !== 0) return diff;
    if (a === previous) return -1;
    if (b === previous) return 1;
    return 0;
  });
}

export function decide(returns, rules, previous = null) {
  for (const key of decisionAssets(rules)) {
    if (!Number.isFinite(returns[key])) throw new Error(`Brak stopy zwrotu dla rynku ${key}`);
  }
  const buffer = rules.switchBufferPct / 100;
  const ranked = rank(rules.equities, returns, previous);
  const leader = ranked[0];
  const absAsset = rules.absoluteRef === 'WINNER' ? leader : rules.absoluteRef;
  const excess = returns[absAsset] - returns[rules.hurdle];
  const riskOn = excess > 0;

  let asset;
  let bufferApplied = false;
  let relativeMargin = null;
  let safeMargin = null;

  if (riskOn) {
    asset = leader;
    if (ranked.length > 1) relativeMargin = returns[ranked[0]] - returns[ranked[1]];
    if (buffer > 0 && previous && rules.equities.includes(previous) && previous !== leader && returns[leader] - returns[previous] < buffer) {
      asset = previous;
      bufferApplied = true;
    }
  } else if (rules.safeAssetRule === 'lepsze_z_obligacji_i_bonow') {
    const [bonds, bills] = rules.safe;
    asset = returns[bonds] > returns[bills] ? bonds : bills;
    safeMargin = returns[bonds] - returns[bills];
    const other = asset === bonds ? bills : bonds;
    if (buffer > 0 && previous === other && Math.abs(safeMargin) < buffer) {
      asset = previous;
      bufferApplied = true;
    }
  } else {
    asset = rules.safe[0];
  }

  const tie = rules.nearTiePct / 100;
  const nearTie =
    Math.abs(excess) < tie ||
    (riskOn && relativeMargin !== null && relativeMargin < tie) ||
    (!riskOn && safeMargin !== null && Math.abs(safeMargin) < tie);

  return { asset, riskOn, leader, ranked, absAsset, excess, relativeMargin, safeMargin, nearTie, bufferApplied };
}
