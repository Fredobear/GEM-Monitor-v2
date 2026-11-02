// Rdzeń obliczeń aplikacji: portfel, stopy zwrotu, podatki, plan wpłat, koszty brokerów.
// Bez DOM i bez importów – plik jest wklejany do strony i testowany w Node.

export const ACCOUNTS = ['IKE', 'IKZE', 'OKI', 'ZWYKLE'];
export const ACCOUNT_LABELS = { ALL: 'Wszystkie', IKE: 'IKE', IKZE: 'IKZE', OKI: 'OKI', ZWYKLE: 'Konto zwykłe' };
export const TX_LABELS = { kupno: 'Kupno', sprzedaz: 'Sprzedaż', wplata: 'Wpłata', wyplata: 'Wypłata', wycena: 'Wycena' };
const TYPE_ORDER = { wplata: 0, sprzedaz: 1, kupno: 2, wycena: 3, wyplata: 4 };
const EPS = 1e-9;

export function isoAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isoAddMonths(iso, n) {
  const [y, m, day] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.toISOString().slice(0, 10);
}

export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Pary [data, wartość] posortowane rosnąco – ostatnia z datą <= iso (albo < iso, gdy strict).
export function lastOnOrBefore(pairs, iso, strict = false) {
  let lo = 0;
  let hi = (pairs?.length ?? 0) - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? pairs[mid][0] < iso : pairs[mid][0] <= iso) {
      found = pairs[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function fxAt(fx, ccy, iso) {
  if (!ccy || ccy === 'PLN') return 1;
  const p = lastOnOrBefore(fx?.[ccy], iso);
  return p ? p[1] : null;
}

// Do podatku: średni kurs NBP z ostatniego dnia roboczego przed dniem transakcji (art. 11a ustawy o PIT).
export function fxForTax(fx, ccy, iso) {
  if (!ccy || ccy === 'PLN') return 1;
  const p = lastOnOrBefore(fx?.[ccy], iso, true);
  return p ? p[1] : null;
}

export function sortTx(txs) {
  return [...txs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || (a.createdAt ?? 0) - (b.createdAt ?? 0)));
}

export const activeTx = (txs) => txs.filter((t) => !t.deleted);

// Kwota transakcji w PLN bez prowizji: kwota z brokera (jeśli podana) albo ilość × cena × kurs NBP z dnia.
export function cashPLN(tx, fx) {
  if (Number.isFinite(tx.amountPLN) && tx.amountPLN > 0) return tx.amountPLN;
  const rate = fxAt(fx, tx.currency, tx.date);
  return rate ? tx.quantity * tx.price * rate : null;
}

// Cena instrumentu w jego walucie w dniu iso: notowanie (jeśli świeże) albo ostatnia znana cena
// (transakcja lub ręczna wycena) przesunięta o zmianę indeksu-proxy.
export function makePricer(prices, txs) {
  const anchors = {};
  for (const t of sortTx(activeTx(txs))) {
    if (!t.ticker || !(t.price > 0) || !['kupno', 'sprzedaz', 'wycena'].includes(t.type)) continue;
    (anchors[t.ticker] ??= []).push([t.date, t.price]);
  }
  return (ticker, iso) => {
    const inst = prices?.instruments?.[ticker];
    const quote = inst?.quotes?.length ? lastOnOrBefore(inst.quotes, iso) : null;
    if (quote && dayDiff(quote[0], iso) <= 7) return quote[1];
    const anchor = anchors[ticker] ? lastOnOrBefore(anchors[ticker], iso) : null;
    if (!anchor) return quote ? quote[1] : null;
    if (inst?.series?.length) {
      const s0 = lastOnOrBefore(inst.series, anchor[0]);
      const s1 = lastOnOrBefore(inst.series, iso);
      if (s0 && s1) return (anchor[1] * s1[1]) / s0[1];
    }
    return anchor[1];
  };
}

export function lastDataDate(prices) {
  let last = null;
  for (const pairs of [prices?.fx?.USD, ...Object.values(prices?.instruments ?? {}).map((i) => i.series)]) {
    const d = pairs?.[pairs.length - 1]?.[0];
    if (d && (!last || d > last)) last = d;
  }
  return last;
}

// Dzienna oś wartości portfela w PLN i indeks stopy zwrotu ważonej czasem (TWR).
// Wpływy liczone na początek dnia, wypływy na koniec: r = (V + wypływ) / (V_poprz + wpływ) − 1.
export function buildTimeline(txs, prices, { account = 'ALL', today = null } = {}) {
  const list = sortTx(activeTx(txs).filter((t) => account === 'ALL' || t.account === account));
  const trades = list.filter((t) => t.type === 'kupno' || t.type === 'sprzedaz');
  if (!trades.length) return { points: [], issues: [], units: {} };
  const fx = prices?.fx ?? {};
  const price = makePricer(prices, txs);
  const currency = {};
  for (const t of trades) currency[t.ticker] = t.currency;
  const byDate = new Map();
  for (const t of trades) (byDate.get(t.date) ?? byDate.set(t.date, []).get(t.date)).push(t);

  const start = trades[0].date;
  const dataEnd = lastDataDate(prices);
  let end = today ?? dataEnd ?? trades[trades.length - 1].date;
  if (trades[trades.length - 1].date > end) end = trades[trades.length - 1].date;

  const units = {};
  const issues = new Set();
  const points = [];
  let prevValue = 0;
  let index = 1;
  let invested = 0;
  for (let d = start; d <= end; d = isoAddDays(d, 1)) {
    const todays = byDate.get(d) ?? [];
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if ((dow === 0 || dow === 6) && !todays.length) continue;
    let inflow = 0;
    let outflow = 0;
    for (const t of todays) {
      const cash = cashPLN(t, fx);
      if (cash === null) {
        issues.add(`Brak kursu ${t.currency} z ${t.date} – wpisz kwotę w PLN dla tej transakcji.`);
        continue;
      }
      const fee = t.feePLN || 0;
      if (t.type === 'kupno') {
        units[t.ticker] = (units[t.ticker] ?? 0) + t.quantity;
        inflow += cash + fee;
      } else {
        units[t.ticker] = (units[t.ticker] ?? 0) - t.quantity;
        outflow += cash - fee;
        if (units[t.ticker] < -EPS) issues.add(`Sprzedaż ${t.ticker} z ${t.date} przekracza posiadaną liczbę jednostek.`);
      }
    }
    let value = 0;
    for (const [ticker, u] of Object.entries(units)) {
      if (Math.abs(u) < EPS) continue;
      const p = price(ticker, d);
      const rate = fxAt(fx, currency[ticker], d);
      if (p === null || rate === null) {
        issues.add(`Brak wyceny ${ticker} na ${d}.`);
        continue;
      }
      value += u * p * rate;
    }
    const base = prevValue + inflow;
    const ret = base > EPS ? (value + outflow) / base - 1 : 0;
    index *= 1 + ret;
    invested += inflow - outflow;
    points.push({ date: d, value, inflow, outflow, invested, index, ret });
    prevValue = value;
  }
  return { points, issues: [...issues], units };
}

// Statystyki dla zakresu dat: zysk w PLN, TWR, TWR rocznie, maks. obsunięcie, przepływy.
export function rangeStats(points, from, to) {
  const inRange = points.filter((p) => p.date >= from && p.date <= to);
  if (!inRange.length) return null;
  const i0 = points.indexOf(inRange[0]);
  const base = i0 > 0 ? points[i0 - 1] : null;
  const baseIndex = base ? base.index : 1;
  const baseValue = base ? base.value : 0;
  const last = inRange[inRange.length - 1];
  const flows = inRange.reduce((a, p) => a + p.inflow - p.outflow, 0);
  const twr = last.index / baseIndex - 1;
  const days = dayDiff(base ? base.date : inRange[0].date, last.date);
  let peak = baseIndex;
  let maxDrawdown = 0;
  for (const p of inRange) {
    peak = Math.max(peak, p.index);
    maxDrawdown = Math.min(maxDrawdown, p.index / peak - 1);
  }
  return {
    from: base ? base.date : inRange[0].date,
    to: last.date,
    days,
    twr,
    annualized: days >= 365 ? (1 + twr) ** (365 / days) - 1 : null,
    gain: last.value - baseValue - flows,
    startValue: baseValue,
    endValue: last.value,
    flows,
    maxDrawdown,
  };
}

// Seria wzorca przeskalowana tak, by w dniu bazowym wynosiła 0%.
export function rebase(pairs, fromDate, toDate) {
  const base = lastOnOrBefore(pairs, fromDate) ?? pairs?.find(([d]) => d >= fromDate);
  if (!base) return [];
  return pairs.filter(([d]) => d >= base[0] && d <= toDate).map(([d, v]) => [d, v / base[1] - 1]);
}

// Zysk do PIT-38 dla konta zwykłego: FIFO, kursy NBP z dnia poprzedniego, prowizje jako koszt.
export function realizedGains(txs, fx, { account = 'ZWYKLE' } = {}) {
  const lots = {};
  const sales = [];
  const byYear = {};
  const issues = [];
  for (const t of sortTx(activeTx(txs))) {
    if (t.account !== account || (t.type !== 'kupno' && t.type !== 'sprzedaz')) continue;
    const rate = fxForTax(fx, t.currency, t.date);
    if (rate === null) {
      issues.push(`Brak kursu NBP sprzed ${t.date} dla ${t.currency}.`);
      continue;
    }
    const amount = t.quantity * t.price * rate;
    const fee = t.feePLN || 0;
    if (t.type === 'kupno') {
      (lots[t.ticker] ??= []).push({ date: t.date, quantity: t.quantity, costPerUnit: (amount + fee) / t.quantity });
      continue;
    }
    let remaining = t.quantity;
    let cost = 0;
    const queue = lots[t.ticker] ?? [];
    while (remaining > EPS && queue.length) {
      const lot = queue[0];
      const take = Math.min(lot.quantity, remaining);
      cost += take * lot.costPerUnit;
      lot.quantity -= take;
      remaining -= take;
      if (lot.quantity <= EPS) queue.shift();
    }
    if (remaining > EPS) issues.push(`Sprzedaż ${t.ticker} z ${t.date}: w historii brakuje zakupu ${remaining.toFixed(4)} jedn.`);
    const year = t.date.slice(0, 4);
    const row = (byYear[year] ??= { revenue: 0, costs: 0, income: 0, tax: 0 });
    row.revenue += amount;
    row.costs += cost + fee;
    row.income += amount - cost - fee;
    sales.push({ date: t.date, ticker: t.ticker, quantity: t.quantity, revenue: amount, cost: cost + fee, gain: amount - cost - fee });
  }
  // Podstawa i podatek zaokrąglane do pełnych złotych (Ordynacja podatkowa).
  for (const row of Object.values(byYear)) row.tax = row.income > 0 ? Math.round(Math.round(row.income) * 0.19) : 0;
  return { byYear, sales, openLots: lots, issues };
}

// Pozycje konta zwykłego ze stratą – ich sprzedaż przed końcem roku obniży podatek od tegorocznych zysków.
export function harvestCandidates(txs, prices, today) {
  const fx = prices?.fx ?? {};
  const { openLots, byYear } = realizedGains(txs, fx);
  const price = makePricer(prices, txs);
  const currency = {};
  for (const t of activeTx(txs)) if (t.ticker) currency[t.ticker] = t.currency;
  const ytdIncome = byYear[today.slice(0, 4)]?.income ?? 0;
  const candidates = [];
  for (const [ticker, lots] of Object.entries(openLots)) {
    const quantity = lots.reduce((a, l) => a + l.quantity, 0);
    if (quantity <= EPS) continue;
    const p = price(ticker, today);
    const rate = fxAt(fx, currency[ticker], today);
    if (p === null || rate === null) continue;
    const value = quantity * p * rate;
    const cost = lots.reduce((a, l) => a + l.quantity * l.costPerUnit, 0);
    if (value < cost) candidates.push({ ticker, quantity, value, cost, loss: cost - value });
  }
  const totalLoss = candidates.reduce((a, c) => a + c.loss, 0);
  return { ytdIncome, candidates, totalLoss, potentialSaving: Math.max(0, Math.min(totalLoss, ytdIncome)) * 0.19 };
}

// Bieżące pozycje z wyceną: instrument × rachunek.
export function holdings(txs, prices, today) {
  const fx = prices?.fx ?? {};
  const price = makePricer(prices, txs);
  const map = new Map();
  for (const t of sortTx(activeTx(txs))) {
    if (t.type !== 'kupno' && t.type !== 'sprzedaz') continue;
    const key = `${t.ticker}|${t.account}`;
    const h = map.get(key) ?? { ticker: t.ticker, account: t.account, currency: t.currency, quantity: 0, cost: 0 };
    const cash = (cashPLN(t, fx) ?? 0) + (t.type === 'kupno' ? t.feePLN || 0 : -(t.feePLN || 0));
    if (t.type === 'kupno') {
      h.quantity += t.quantity;
      h.cost += cash;
    } else if (h.quantity > EPS) {
      h.cost -= h.cost * Math.min(1, t.quantity / h.quantity); // średni koszt jednostki
      h.quantity -= t.quantity;
    }
    map.set(key, h);
  }
  const out = [];
  for (const h of map.values()) {
    if (h.quantity <= EPS) continue;
    const p = price(h.ticker, today);
    const rate = fxAt(fx, h.currency, today);
    const value = p !== null && rate !== null ? h.quantity * p * rate : null;
    out.push({ ...h, price: p, value, gain: value === null ? null : value - h.cost, gainPct: value === null || !h.cost ? null : value / h.cost - 1 });
  }
  const total = out.reduce((a, h) => a + (h.value ?? 0), 0);
  for (const h of out) h.weight = total ? (h.value ?? 0) / total : 0;
  return out.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

// Wpłaty w roku kalendarzowym na każdy rachunek (do limitów IKE/IKZE).
export function contributions(txs, year) {
  const out = { IKE: 0, IKZE: 0, OKI: 0, ZWYKLE: 0 };
  for (const t of activeTx(txs)) if (t.type === 'wplata' && t.date.startsWith(String(year)) && t.account in out) out[t.account] += t.amountPLN || 0;
  return out;
}

export function limitsFor(podatki, year) {
  const years = Object.keys(podatki.limits).map(Number).sort();
  const y = years.includes(year) ? year : years.filter((x) => x <= year).pop() ?? years[0];
  return { ...podatki.limits[y], year: y, exact: y === year };
}

// Kolejność wpłat: IKZE (jeśli odliczenie > 10% ryczałtu przy wypłacie) → IKE → OKI (od 2027) albo konto zwykłe.
export function planContributions({ budget, year, podatki, used = {}, taxRate, selfEmployed = false }) {
  const lim = limitsFor(podatki, year);
  const ikzeLimit = selfEmployed ? lim.ikzeFirma : lim.ikze;
  const ikzeRoom = Math.max(0, ikzeLimit - (used.IKZE ?? 0));
  const ikeRoom = Math.max(0, lim.ike - (used.IKE ?? 0));
  const okiAvailable = year >= Number(podatki.oki.start.slice(0, 4));
  const okiRate = podatki.oki.rates[year] ?? podatki.oki.rates[Math.max(...Object.keys(podatki.oki.rates).map(Number))];
  let left = Math.max(0, budget || 0);
  const steps = [];
  const add = (account, cap, reason) => {
    const amount = Math.min(left, cap);
    if (amount > 0) {
      steps.push({ account, amount, reason });
      left -= amount;
    }
  };
  const ikzeReason = `Wpłatę odliczysz od dochodu: zwrot ok. ${Math.round(Math.min(left, ikzeRoom) * taxRate)} zł przy stawce ${Math.round(taxRate * 100)}%. Zmiany pozycji GEM bez podatku, a przy wypłacie po 65. roku życia płacisz 10% ryczałtu.`;
  const ikeReason = 'Zmiany pozycji GEM bez podatku Belki, a wypłata po 60. roku życia jest zwolniona z podatku. Przy wcześniejszej wypłacie płacisz tylko podatek od zysku, jak na koncie zwykłym.';
  if (taxRate > podatki.ikze.exitTax) {
    add('IKZE', ikzeRoom, ikzeReason);
    add('IKE', ikeRoom, ikeReason);
  } else {
    add('IKE', ikeRoom, ikeReason);
    add('IKZE', ikzeRoom, 'Przy Twojej stawce odliczenie jest niższe niż 10% ryczałtu przy wypłacie, więc IKZE ma sens dopiero po wypełnieniu IKE.');
  }
  if (okiAvailable) add('OKI', Infinity, `Bez limitu wpłat i bez podatku od zysków. Za zagraniczne ETF-y płacisz ${(okiRate * 100).toFixed(2).replace('.', ',')}% wartości rocznie. Dla GEM w backteście korzystniejsze niż konto zwykłe.`);
  else add('ZWYKLE', Infinity, 'Podatek Belki przy każdej zmianie pozycji. Załóż subkonto USD i realizuj straty przed końcem roku. Od 2027 r. rozważ OKI.');
  const ikze = steps.find((s) => s.account === 'IKZE')?.amount ?? 0;
  return { steps, refund: ikze * taxRate, ikeRoom, ikzeRoom, ikeLimit: lim.ike, ikzeLimit, limitYear: lim.year, limitStatus: lim.status, exactYear: lim.exact };
}

// Roczny koszt zmian pozycji GEM u brokera. Bez subkonta walutowego każda zmiana to dwa przewalutowania;
// z subkontem USD przewalutowanie dotyczy tylko zmian z udziałem ETF-u w EUR (eurShare).
export function brokerCost(broker, { value, perYear, eurShare, wrapper, afterPromo = false }) {
  const available = wrapper === 'ike' ? broker.accounts.ike === 'tak' : broker.accounts.zwykle === 'tak';
  if (!available) return { available: false };
  const usd = wrapper === 'ike' ? broker.ikeUsd === true : broker.regularUsd === true;
  const commission = afterPromo && Number.isFinite(broker.commissionAfterPromo) ? broker.commissionAfterPromo : broker.commission;
  const perSwitch = 2 * commission + (usd ? eurShare * broker.fx : 2 * broker.fx);
  return { available: true, usd, perSwitch, annualPct: perSwitch * perYear, annualPLN: perSwitch * perYear * value };
}

// Doradca waluty zakupu. Waluta notowania nie zmienia ekspozycji walutowej (fundusz S&P 500 trzyma akcje w USD,
// niezależnie od tego, czy kupisz go w USD, czy w EUR), ale decyduje o liczbie przewalutowań:
// teraz (gotówka w innej walucie) i przy kolejnej zmianie pozycji (prawdopodobieństwa z historii sygnałów).
export function currencyAdvice({ asset, assets, accountCurrencies = ['PLN'], cash = 'PLN', transitions = {}, fx = 0.005 }) {
  const a = assets[asset];
  const listings = a?.listings?.length ? a.listings : [{ ticker: a.xtb.ticker, currency: a.xtb.currency, exchange: a.xtb.exchange }];
  const plnOnly = accountCurrencies.every((c) => c === 'PLN');
  if (plnOnly) {
    return { listing: listings[0], plnOnly: true, conversionsNow: 1, expectedFuture: 1, costNow: fx, alternatives: listings.slice(1), plnAlternative: a.plnAlternative ?? null };
  }
  const next = transitions[asset] ?? {};
  const ranking = listings
    .filter((l) => accountCurrencies.includes(l.currency))
    .map((l) => {
      const now = l.currency === cash ? 0 : 1;
      let future = 0;
      for (const [nextAsset, p] of Object.entries(next)) {
        const currencies = (assets[nextAsset]?.listings ?? []).map((x) => x.currency);
        future += currencies.includes(l.currency) ? 0 : p;
      }
      return { listing: l, now, future, total: now + future };
    })
    .sort((x, y) => x.total - y.total);
  if (!ranking.length) return { listing: listings[0], plnOnly: false, conversionsNow: 1, expectedFuture: 1, costNow: fx, alternatives: listings.slice(1), plnAlternative: a.plnAlternative ?? null };
  const best = ranking[0];
  return { listing: best.listing, plnOnly: false, conversionsNow: best.now, expectedFuture: best.future, costNow: best.now * fx, ranking, alternatives: listings.filter((l) => l !== best.listing), plnAlternative: a.plnAlternative ?? null };
}

export function currencyAdviceText(advice, cash) {
  const l = advice.listing;
  if (advice.plnOnly) {
    return `${l.ticker} (${l.currency}, ${l.exchange}). Rachunek jest tylko w PLN, więc każda waluta kosztuje tyle samo: 0,5% przy zakupie i 0,5% przy sprzedaży. Wybierz najpłynniejsze notowanie.${advice.plnAlternative ? ` Bez przewalutowania: ${advice.plnAlternative.ticker} (${advice.plnAlternative.note}).` : ''}`;
  }
  const now = advice.conversionsNow ? `przewalutowanie ${cash}→${l.currency} teraz (0,5%)` : `bez przewalutowania (masz już ${l.currency})`;
  const future = advice.expectedFuture > 0 ? `; przy następnej zmianie pozycji ok. ${Math.round(advice.expectedFuture * 100)}% szans na kolejne przewalutowanie` : '; następna zmiana pozycji też bez przewalutowania';
  return `${l.ticker} (${l.currency}, ${l.exchange}) – ${now}${future}.`;
}

// Scalanie dwóch list transakcji (np. telefon i komputer): wygrywa nowsza wersja każdego wpisu.
export function mergeTransactions(a = [], b = []) {
  const map = new Map();
  for (const t of [...a, ...b]) {
    const prev = map.get(t.id);
    if (!prev || (t.updatedAt ?? 0) > (prev.updatedAt ?? 0)) map.set(t.id, t);
  }
  return sortTx([...map.values()]);
}

export function validateTx(t) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date ?? '')) errors.push('Podaj datę.');
  if (!ACCOUNTS.includes(t.account)) errors.push('Wybierz rachunek.');
  if (!TX_LABELS[t.type]) errors.push('Wybierz typ transakcji.');
  if (['kupno', 'sprzedaz', 'wycena'].includes(t.type)) {
    if (!t.ticker) errors.push('Wybierz instrument.');
    if (!(t.price > 0)) errors.push('Podaj cenę jednostki.');
    if (!t.currency) errors.push('Podaj walutę.');
  }
  if (['kupno', 'sprzedaz'].includes(t.type) && !(t.quantity > 0)) errors.push('Podaj liczbę jednostek.');
  if (['wplata', 'wyplata'].includes(t.type) && !(t.amountPLN > 0)) errors.push('Podaj kwotę w PLN.');
  return errors;
}
