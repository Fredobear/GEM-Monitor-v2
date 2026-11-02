// Deterministyczne uzasadnienie sygnału po polsku – zawsze dostępne, niezależnie od AI.
import { stability } from './validate.js';
import { monthNamePL, datePL } from './lib/dates.js';
import { currencyAdvice, currencyAdviceText } from './client/core.js';

// Podpowiedź waluty zakupu dla typowych sytuacji: IKE/IKZE w XTB (tylko PLN) oraz konto zwykłe z subkontami.
export function currencyGuide({ asset, config, transitions = {} }) {
  const assets = config.assets;
  const currencies = { IKE: ['PLN'], ZWYKLE: ['PLN', 'USD', 'EUR'], ...(config.accountCurrencies ?? {}) };
  const rows = [];
  const ike = currencyAdvice({ asset, assets, accountCurrencies: currencies.IKE, transitions });
  rows.push({ key: 'IKE', label: 'IKE i IKZE w XTB (rachunek tylko w PLN)', ticker: ike.listing.ticker, text: currencyAdviceText(ike, 'PLN') });
  for (const cash of ['EUR', 'USD', 'PLN']) {
    const adv = currencyAdvice({ asset, assets, accountCurrencies: currencies.ZWYKLE, cash, transitions });
    rows.push({ key: `ZWYKLE_${cash}`, label: cash === 'PLN' ? 'Konto zwykłe – wpłacasz nowe złotówki' : `Konto zwykłe – masz ${cash} po sprzedaży`, ticker: adv.listing.ticker, text: currencyAdviceText(adv, cash) });
  }
  return rows;
}

export const fmtPct = (x, digits = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(digits).replace('.', ',')}%` : '–');
export const fmtPp = (x) => `${Math.abs(x * 100).toFixed(1).replace('.', ',')} pp`;

export function explainSignal({ signals, config, transitions = {} }) {
  const { official, preview, rules } = signals;
  const d = official.decision;
  const r = official.returns;
  const L = rules.lookbackMonths;
  const A = (key) => config.assets[key];
  const target = A(d.asset);
  const xtb = target.xtb;
  const stab = stability(d);
  const reasons = [];

  if (d.riskOn) {
    reasons.push(
      `Filtr trendu (momentum absolutne): ${A(d.absAsset).index} zarobił ${fmtPct(r[d.absAsset])} w ${L} mies., więcej niż bony skarbowe USA (${fmtPct(r[rules.hurdle])}). Nadwyżka ${fmtPp(d.excess)} oznacza trend wzrostowy na rynku akcji, więc GEM pozostaje w akcjach.`,
    );
    if (rules.equities.length > 1) {
      const [first, second] = d.ranked;
      reasons.push(
        `Siła względna (momentum względne): najsilniejszy jest rynek „${A(first).name}” (${A(first).index}: ${fmtPct(r[first])}), przed rynkiem „${A(second).name}” (${fmtPct(r[second])}). Przewaga wynosi ${fmtPp(d.relativeMargin)}.`,
      );
      if (d.bufferApplied) reasons.push(`Bufor ${rules.switchBufferPct} pp: przewaga nowego lidera jest za mała, by opłacało się zmieniać pozycję, więc zostajesz przy rynku „${target.name}”.`);
    }
    reasons.push('Dlaczego to działa: rynki, które rosły najmocniej przez ostatni rok, statystycznie częściej rosną dalej w kolejnych miesiącach. To efekt momentum, udokumentowany w danych z ponad 100 lat i z wielu klas aktywów.');
  } else {
    reasons.push(
      `Filtr trendu: ${A(d.absAsset).index} zarobił w ${L} mies. ${fmtPct(r[d.absAsset])}, czyli mniej niż bezpieczne bony skarbowe (${fmtPct(r[rules.hurdle])}). To typowy objaw słabnącego rynku lub bessy, więc GEM wychodzi z akcji, aby ograniczyć ryzyko dużego spadku.`,
    );
    if (rules.safeAssetRule === 'lepsze_z_obligacji_i_bonow') {
      const [bonds, bills] = rules.safe;
      reasons.push(`Bezpieczna przystań: ${A(bonds).name} ${fmtPct(r[bonds])} vs ${A(bills).name} ${fmtPct(r[bills])} w ${L} mies. Wybrany jest instrument z lepszym trendem: ${target.name}.`);
    } else {
      reasons.push(`Bezpieczna przystań w oryginalnym GEM to ${target.name} (${fmtPct(r[d.asset])} w ${L} mies.). Obligacje zwykle zyskują, gdy akcje tracą, choć nie zawsze (wyjątkiem był 2022 r.).`);
    }
  }

  const prev = official.previous ? A(official.previous) : null;
  let action;
  if (!prev) action = { type: 'kup', text: `KUP ${xtb.ticker}` };
  else if (official.changed) action = { type: 'zmiana', text: `ZMIANA: sprzedaj ${prev.xtb.ticker}, kup ${xtb.ticker}` };
  else action = { type: 'trzymaj', text: `BEZ ZMIAN: trzymaj ${xtb.ticker}` };
  if (prev && official.changed && prev.xtb.ticker === xtb.ticker) action = { type: 'trzymaj', text: `BEZ ZMIAN: trzymaj ${xtb.ticker} (ten sam ETF dla obu rynków)` };

  const execution = [
    `Kiedy: na pierwszej sesji miesiąca (${monthNamePL(official.forMonth)}), w godzinach notowań ${xtb.exchange} w XTB (ok. 9:00–17:30 czasu polskiego). Zlecenie z limitem ceny chroni przed złą ceną przy otwarciu.`,
  ];
  if (xtb.currency === 'EUR') execution.push('Instrument jest notowany w EUR. Przy koncie w PLN lub USD XTB pobierze 0,5% za przewalutowanie.');
  if (xtb.currency === 'USD') execution.push('Instrument jest notowany w USD. Subkonto USD w XTB pozwala uniknąć przewalutowania (0,5%) przy zmianach między ETF-ami w USD.');
  if (xtb.note) execution.push(xtb.note);

  let previewNote = null;
  if (preview) {
    const pa = A(preview.decision.asset);
    previewNote = preview.differsFromOfficial
      ? `Uwaga: wstępny sygnał (dane do ${datePL(preview.asOf)}) wskazuje rynek „${pa.name}” (${pa.xtb.ticker}). To jeszcze nie jest sygnał, bo decyzja zapada na koniec miesiąca. Do tego czasu nie zmieniaj pozycji.`
      : `Wstępny sygnał na dziś (dane do ${datePL(preview.asOf)}) potwierdza ${xtb.ticker}.`;
  }

  return {
    headline: `${target.name}: ${xtb.ticker}`,
    action,
    reasons,
    execution,
    stability: stab,
    stabilityText: `Stabilność sygnału: ${stab.level} (do zmiany sygnału brakuje ${stab.minMarginPct.toFixed(1).replace('.', ',')} pp).`,
    previewNote,
    currency: currencyGuide({ asset: d.asset, config, transitions }),
    target: { key: d.asset, marketName: target.name, index: target.index, ...xtb },
  };
}
