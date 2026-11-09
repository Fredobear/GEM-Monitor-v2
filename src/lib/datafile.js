// Pliki danych dla stron aplikacji: zwykłe skrypty „self.NAZWA={…};” w docs/data/. Strona dziennika finansowego
// ma zablokowane połączenia sieciowe (connect-src 'none'), ale może wczytać skrypt z tej samej domeny – a wczytanie
// stałego pliku niczego nie wysyła. Poprzednia wersja pliku służy do uzupełniania historii przy kolejnej aktualizacji.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const dataScript = (global, data) => `self.${global}=${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;

export function parseDataScript(global, text) {
  const prefix = `self.${global}=`;
  const s = String(text ?? '').trim();
  if (!s.startsWith(prefix) || !s.endsWith(';')) return null;
  try {
    return JSON.parse(s.slice(prefix.length, -1));
  } catch {
    return null;
  }
}

export async function readDataScript(docsDir, file, global) {
  try {
    return parseDataScript(global, await readFile(path.join(docsDir, 'data', file), 'utf8'));
  } catch {
    return null;
  }
}

/** Zapisuje plik danych bez pól roboczych (ostrzeżenia, liczba zapytań). Puste dane – plik zostaje bez zmian. */
export async function writeDataScript(docsDir, file, global, data) {
  if (!data || typeof data !== 'object') return;
  const { warnings, calls, ...rest } = data;
  if (!Object.keys(rest).length) return;
  await writeFile(path.join(docsDir, 'data', file), dataScript(global, rest));
}
