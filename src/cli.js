#!/usr/bin/env node
// GEM Monitor – punkt wejścia. Użycie: node src/cli.js <polecenie> [opcje]
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , command = 'help', ...rest] = process.argv;
const flags = new Set(rest.filter((a) => a.startsWith('--')));

// Lokalnie klucze można trzymać w pliku .env (w GitHub Actions pochodzą z Secrets).
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function research() {
  const { loadLongHistory, runResearch, researchMarkdown } = await import('./research.js');
  console.log('Pobieram dane: Ken French (akcje, bony) i FRED (rentowności obligacji)...');
  const data = await loadLongHistory();
  console.log(`Dane miesięczne: ${data.first} – ${data.last}`);
  const result = runResearch(data);
  const dir = path.join(ROOT, 'research');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'wyniki.json'), JSON.stringify(result, null, 2));
  const md = researchMarkdown(result);
  await writeFile(path.join(dir, 'wyniki.md'), md);
  console.log(md);
  console.log('\nZapisano: research/wyniki.md i research/wyniki.json');
}

async function testNotify() {
  const { send, channels } = await import('./notify.js');
  const { pagesUrl } = await import('./run.js');
  const list = channels();
  if (!list.length) throw new Error('Brak kanałów: ustaw TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID albo NTFY_TOPIC.');
  const dashboardUrl = pagesUrl(process.env);
  const results = await send(
    { title: 'GEM Monitor: test', html: '✅ <b>GEM Monitor działa.</b>\nTo wiadomość testowa – powiadomienia są poprawnie skonfigurowane.', priority: 3, tags: ['white_check_mark'] },
    { dashboardUrl },
  );
  for (const r of results) console.log(`${r.channel}: ${r.ok ? 'wysłano' : `BŁĄD – ${r.error}`}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

async function telegramChatId() {
  const { telegramChatIds } = await import('./notify.js');
  const chats = await telegramChatIds();
  if (!chats.length) console.log('Brak wiadomości. Napisz do swojego bota w Telegramie „/start” i uruchom polecenie ponownie.');
  for (const c of chats) console.log(`TELEGRAM_CHAT_ID=${c.id}   (${c.name})`);
}

const COMMANDS = {
  run: async () => (await import('./run.js')).run({ flags, root: ROOT }),
  research,
  demo: async () => (await import('./demo.js')).demo({ root: ROOT }),
  'test-notify': testNotify,
  'telegram-chat-id': telegramChatId,
  help: async () => {
    console.log(`GEM Monitor – polecenia:
  run                 pobiera dane, liczy sygnał, generuje panel i wysyła powiadomienia
    --dry             bez wysyłania powiadomień i bez zapisu stanu
    --ai              wymusza komentarz AI (wymaga ANTHROPIC_API_KEY)
  research            długi backtest od 1991 r. (Ken French + FRED), zapis do research/
  demo                panel demonstracyjny na danych historycznych (bez kluczy API)
  test-notify         wysyła wiadomość testową na skonfigurowane kanały
  telegram-chat-id    pokazuje identyfikator czatu Telegrama (po wysłaniu /start do bota)`);
  },
};

const handler = COMMANDS[command];
if (!handler) {
  console.error(`Nieznane polecenie: ${command}`);
  await COMMANDS.help();
  process.exit(2);
}
try {
  await handler();
} catch (err) {
  console.error(`Błąd: ${err.message}`);
  if (flags.has('--debug')) console.error(err.stack);
  process.exit(1);
}
