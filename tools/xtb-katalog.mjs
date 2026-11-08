// Generator katalogu instrumentów XTB (akcje oraz ETF/ETN/ETC) z oficjalnej
// „Tabeli Specyfikacji Instrumentów Finansowych Rynku Zorganizowanego (OMI)” (PDF ze strony XTB).
//
// Narzędzie uruchamiasz ręcznie, gdy XTB opublikuje nową tabelę (kilka razy w roku):
//   1. pobierz PDF: https://www.xtb.com/pl/pliki/07.-omi-specification-tables-pl.pdf
//   2. npm install --no-save pdfjs-dist@4.10.38
//   3. node tools/xtb-katalog.mjs <ścieżka do PDF> "<data obowiązywania z 1. strony, np. 2026-10-05>"
// Wynik: config/xtb-instrumenty.json (aplikacja i codzienna aktualizacja korzystają z tego pliku).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [file, validFrom = ''] = process.argv.slice(2);
if (!file) {
  console.error('Użycie: node tools/xtb-katalog.mjs <plik.pdf> [data obowiązywania RRRR-MM-DD]');
  process.exit(1);
}
let pdfjs;
try {
  pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
} catch {
  console.error('Brak biblioteki pdfjs-dist. Zainstaluj ją jednorazowo: npm install --no-save pdfjs-dist@4.10.38');
  process.exit(1);
}

const SYMBOL = /^([A-Z0-9][A-Z0-9._&-]*)\.(US|UK|DE|PL|FR|NL|IT|ES|PT|BE|CH|DK|FI|NO|SE|CZ|IE|AT)(\*?)$/;
// Waluty zgodne z rynkiem – wiersze z inną walutą to błędy w tabeli XTB (np. „NKLA.US … All in! Games SA, PLN”).
const MARKET_CURRENCIES = {
  US: ['USD'], PL: ['PLN'], UK: ['GBP', 'USD', 'EUR'], DE: ['EUR', 'USD'], FR: ['EUR'], NL: ['EUR'], IT: ['EUR'], ES: ['EUR'],
  PT: ['EUR'], BE: ['EUR'], FI: ['EUR'], IE: ['EUR'], AT: ['EUR'], CH: ['CHF'], SE: ['SEK'], NO: ['NOK'], DK: ['DKK'], CZ: ['CZK'],
};

const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true, verbosity: 0 }).promise;
const rows = [];
let section = null;
for (let p = 2; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  const cells = tc.items.filter((it) => it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }));
  if (cells.some((c) => c.s === 'Tabela Specyfikacji Praw Ułamkowych')) break; // dalej są prawa ułamkowe (duplikaty)
  // Nagłówki sekcji (y rośnie ku górze strony): wiersz należy do najbliższego nagłówka nad nim.
  const heads = cells
    .filter((c) => c.x < 80 && (c.s === 'Akcje' || c.s === 'ETF, ETN, ETC'))
    .map((c) => ({ y: c.y, t: c.s === 'Akcje' ? 'A' : 'E' }))
    .sort((u, v) => u.y - v.y);
  const sectionAt = (y) => heads.find((h) => h.y > y)?.t ?? section;
  for (const a of cells.filter((c) => c.x < 100 && SYMBOL.test(c.s))) {
    const t = sectionAt(a.y);
    if (!t) continue;
    const near = cells.filter((c) => c !== a && Math.abs(c.y - a.y) <= 5);
    const pick = (x0, x1) => near.filter((c) => c.x >= x0 && c.x < x1).sort((u, v) => u.x - v.x).map((c) => c.s).join(' ').trim();
    const m = a.s.match(SYMBOL);
    const rawName = pick(100, 355);
    rows.push({
      s: `${m[1]}.${m[2]}`,
      market: m[2],
      n: rawName.replace(/^CLOSE ONLY\s*\/\s*/i, '').replace(/Â(?=[®©™])/g, '').replace(/\s+/g, ' '),
      i: pick(355, 415).replace(/\s+/g, ''),
      c: pick(415, 445),
      t,
      closeOnly: m[3] === '*' || /CLOSE ONLY/i.test(rawName),
    });
  }
  if (heads.length) section = heads[0].t;
}

const valid = (r) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(r.i) && (MARKET_CURRENCIES[r.market] ?? []).includes(r.c) && r.n;
const bySymbol = new Map();
let rejected = 0;
for (const r of rows) {
  if (!valid(r)) {
    rejected++;
    continue;
  }
  const prev = bySymbol.get(r.s);
  // Ten sam symbol dwa razy: wygrywa instrument dostępny do kupna (nie „close only”), potem pierwszy w tabeli.
  if (!prev || (prev.closeOnly && !r.closeOnly)) bySymbol.set(r.s, r);
}
const items = [...bySymbol.values()]
  .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0))
  .map((r) => (r.closeOnly ? [r.s, r.n, r.i, r.c, r.t, 1] : [r.s, r.n, r.i, r.c, r.t]));

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'xtb-instrumenty.json');
const payload = {
  zrodlo: 'XTB – Tabela Specyfikacji Instrumentów Finansowych Rynku Zorganizowanego (OMI)',
  url: 'https://www.xtb.com/pl/pliki/07.-omi-specification-tables-pl.pdf',
  obowiazujeOd: validFrom || null,
  wygenerowano: new Date().toISOString().slice(0, 10),
  pola: ['symbol', 'nazwa', 'isin', 'waluta', 'typ (A – akcje, E – ETF/ETN/ETC)', 'tylko zamknięcie pozycji (1)'],
  instrumenty: items,
};
// Jeden instrument w wierszu – czytelne różnice w historii repozytorium po aktualizacji katalogu.
writeFileSync(out, `${JSON.stringify({ ...payload, instrumenty: [] }, null, 1).replace('"instrumenty": []', `"instrumenty": [\n${items.map((i) => JSON.stringify(i)).join(',\n')}\n ]`)}\n`);
const count = (t) => items.filter((i) => i[4] === t).length;
console.log(`Zapisano ${items.length} instrumentów (akcje: ${count('A')}, ETF/ETN/ETC: ${count('E')}, tylko zamknięcie: ${items.filter((i) => i[5]).length}); odrzucone wiersze z błędami: ${rejected}.`);
console.log(`Plik: ${out}`);
