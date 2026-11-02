// Stan między uruchomieniami (commitowany do repozytorium przez GitHub Actions).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EMPTY = {
  version: 1,
  lastRun: null,
  lastSuccess: null,
  lastError: null,
  official: null, // { forMonth, asset, ticker } – ostatni wysłany sygnał miesięczny
  previewNotified: null, // { forMonth, asset } – ostatni zgłoszony stan podglądu
  lastDigest: null,
  lastErrorNotified: null,
  ai: null, // { key, result }
  taxAi: null, // { key: 'YYYY-MM', result } – miesięczny raport podatkowy AI
  remindersSent: [], // klucze 'RRRR-MM-DD' wysłanych przypomnień
  taxSeen: [], // linki już zgłoszonych ważnych wiadomości podatkowych
};

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export async function readState(root) {
  return { ...EMPTY, ...((await readJson(path.join(root, 'state', 'state.json'))) ?? {}) };
}

export async function writeState(root, state) {
  await mkdir(path.join(root, 'state'), { recursive: true });
  await writeFile(path.join(root, 'state', 'state.json'), `${JSON.stringify(state, null, 2)}\n`);
}
