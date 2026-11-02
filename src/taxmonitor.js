// Monitor sytuacji podatkowej w Polsce: wiadomości o IKE/IKZE/OKI/podatku Belki/brokerach,
// przypomnienia z kalendarza inwestora i (opcjonalnie) miesięczny raport AI sprawdzający aktualność parametrów.
import { fetchText } from './lib/http.js';
import { compileKeywords } from './lib/keywords.js';
import { parseFeed } from './news.js';

export const TAX_TOPICS = {
  'IKE/IKZE': { weight: 3, words: ['ike', 'ikze', 'indywidualn* kont* emerytaln*', 'indywidualn* kont* zabezpieczeni*'] },
  OKI: { weight: 3, words: ['oki', 'osobist* kont* inwestycyjn*'] },
  'Podatek Belki': { weight: 3, words: ['belk*', 'podat* od zysków kapitałowych', 'zysk* kapitałow*'] },
  'PIT i rozliczenia': { weight: 2, words: ['pit-38', 'pit-8c', 'pit', 'zeznani* podatkow*', 'urząd* skarbow*', 'e-urząd*', 'ulg* podatkow*'] },
  'Brokerzy i opłaty': { weight: 2, words: ['xtb', 'emakler', 'bossa', 'dm boś', 'prowizj*', 'przewalutowani*', 'dom* maklersk*'] },
  'PPK i emerytury': { weight: 1, words: ['ppk', 'pracownicz* plan* kapitałow*', 'oipe'] },
  'Obligacje skarbowe': { weight: 1, words: ['obligacj* skarbow*', 'obligacj* detaliczn*', 'edo', 'coi', 'ros', 'rod'] },
};

const IMPORTANT = ['limit*', 'zmian*', 'now* przepis*', 'ustaw*', 'projekt*', 'stawk*', 'od 2027', 'od 2028', 'od stycznia', 'podwyżk*', 'likwidacj*', 'koniec promocji'];

const TOPIC_RX = Object.fromEntries(Object.entries(TAX_TOPICS).map(([k, t]) => [k, compileKeywords(t.words)]));
const IMPORTANT_RX = compileKeywords(IMPORTANT);

export function classifyTax(item) {
  const text = `${item.title} ${item.summary ?? ''}`;
  const topics = Object.keys(TOPIC_RX).filter((k) => TOPIC_RX[k].test(text));
  const important = topics.some((t) => ['IKE/IKZE', 'OKI', 'Podatek Belki'].includes(t)) && IMPORTANT_RX.test(text);
  const score = topics.reduce((a, t) => a + TAX_TOPICS[t].weight, 0) + (important ? 3 : 0);
  return { ...item, topics, important, score };
}

export async function loadTaxNews(config, now = new Date()) {
  const { feeds, maxAgeDays } = config.taxNews;
  const results = await Promise.allSettled(feeds.map((f) => fetchText(f.url, { label: `RSS ${f.name}`, timeoutMs: 15000, retries: 1 }).then((xml) => parseFeed(xml, f.name))));
  const errors = [];
  const all = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? all.push(...r.value) : errors.push(r.reason.message)));
  const cutoff = now.getTime() - maxAgeDays * 86400000;
  const seen = new Set();
  const items = [];
  for (const item of all.map(classifyTax)) {
    if (!item.topics.length || !item.date || new Date(item.date).getTime() < cutoff) continue;
    const key = item.title.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  items.sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));
  return { items: items.slice(0, 12), important: items.filter((i) => i.important).slice(0, 5), errors };
}

// Przypomnienia z kalendarza, których termin (MM-DD) właśnie minął i które nie zostały jeszcze wysłane w tym roku.
export function dueReminders(calendar, now, sentKeys = []) {
  const year = now.getUTCFullYear();
  const md = now.toISOString().slice(5, 10);
  return calendar
    .filter((c) => c.notify && (!c.fromYear || year >= c.fromYear) && c.date <= md)
    .map((c) => ({ ...c, key: `${year}-${c.date}` }))
    .filter((c) => !sentKeys.includes(c.key))
    .filter((c) => {
      // tylko przypomnienia z ostatnich 10 dni – nowa instalacja nie wysyła zaległości z całego roku
      const due = new Date(`${year}-${c.date}T00:00:00Z`);
      return now - due < 10 * 86400000;
    });
}

// Najbliższe terminy (do panelu).
export function upcoming(calendar, now, count = 4) {
  const year = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const dates = [];
  for (const y of [year, year + 1]) {
    for (const c of calendar) if (!c.fromYear || y >= c.fromYear) dates.push({ ...c, iso: `${y}-${c.date}` });
  }
  return dates.filter((d) => d.iso >= today).sort((a, b) => (a.iso < b.iso ? -1 : 1)).slice(0, count);
}

const TAX_SYSTEM = `Jesteś doradcą-analitykiem przepisów podatkowych dla polskiego rezydenta podatkowego, który inwestuje w ETF-y UCITS (strategia GEM: S&P 500, akcje poza USA, obligacje USA) przez polskich brokerów, głównie XTB.
Sprawdź w sieci aktualny stan (na dziś) i porównaj z parametrami z konfiguracji użytkownika. Opieraj się na źródłach oficjalnych (Dziennik Ustaw, Monitor Polski, gov.pl, strony brokerów) i wiarygodnych mediach finansowych. Nie zgaduj – jeśli czegoś nie potwierdzisz, napisz to.
Nie udzielaj indywidualnych porad inwestycyjnych; opisuj przepisy, ich skutki i ogólne możliwości optymalizacji zgodne z prawem.
Odpowiedz po polsku w dwóch częściach:
1) Raport (maks. 250 słów) z nagłówkami „**Co się zmieniło**”, „**Co to oznacza dla strategii GEM**”, „**Terminy i działania na najbliższe tygodnie**”.
2) Na końcu blok \`\`\`json z obiektem: {"ike_2027": liczba|null, "ikze_2027": liczba|null, "ikze_firma_2027": liczba|null, "oki_stawka_2028": liczba|null (ułamek, np. 0.0071), "zmiany": ["krótki opis zmiany", ...], "rozbieznosci": ["parametr z konfiguracji, który jest nieaktualny i jaka jest poprawna wartość", ...]}.`;

export async function aiTaxReport({ podatki, env = process.env, model = 'claude-opus-5-5', effort = 'medium', maxWebSearches = 6 }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return { error: 'Brak pakietu @anthropic-ai/sdk – uruchom „npm install”.' };
  }
  const client = new Anthropic();
  const params = {
    limity: podatki.limits,
    oki: { start: podatki.oki.start, stawki: podatki.oki.rates, zasada: podatki.oki.rateRule, zwolnienie: podatki.oki.exemption },
    belka: podatki.belka,
    brokerzy: podatki.brokers.map((b) => ({ broker: b.name, fx: b.fx, prowizja: b.commissionNote, ike_waluty: b.ikeCurrencies })),
  };
  const messages = [{ role: 'user', content: `Data: ${new Date().toISOString().slice(0, 10)}\nParametry z konfiguracji:\n${JSON.stringify(params, null, 1)}` }];
  try {
    let response;
    for (let round = 0; round < 5; round++) {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system: TAX_SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxWebSearches }],
        messages,
      });
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    if (response.stop_reason === 'refusal') return { error: 'Model odmówił odpowiedzi.' };
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) return { error: 'Pusta odpowiedź modelu.' };
    let check = null;
    const block = text.match(/```json\s*([\s\S]*?)```/);
    if (block) {
      try {
        check = JSON.parse(block[1]);
      } catch {
        check = null;
      }
    }
    const sources = new Map();
    for (const b of response.content) for (const c of b.citations ?? []) if (c.url && !sources.has(c.url)) sources.set(c.url, c.title ?? c.url);
    return {
      text: text.replace(/```json[\s\S]*?```/, '').trim(),
      check,
      sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
      model: response.model,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { error: `Raport podatkowy AI niedostępny: ${String(err?.message ?? err).slice(0, 200)}` };
  }
}

// Porównuje wynik raportu AI z konfiguracją i zwraca listę rozbieżności do pokazania na panelu.
export function compareWithConfig(check, podatki) {
  if (!check) return [];
  const out = [];
  const l27 = podatki.limits[2027] ?? {};
  const near = (a, b) => Math.abs(a - b) < 1;
  if (Number.isFinite(check.ike_2027) && l27.ike && !near(check.ike_2027, l27.ike)) out.push(`Limit IKE 2027: w konfiguracji ${l27.ike} zł, według raportu ${check.ike_2027} zł.`);
  if (Number.isFinite(check.ikze_2027) && l27.ikze && !near(check.ikze_2027, l27.ikze)) out.push(`Limit IKZE 2027: w konfiguracji ${l27.ikze} zł, według raportu ${check.ikze_2027} zł.`);
  if (Number.isFinite(check.oki_stawka_2028) && podatki.oki.rates[2028] && Math.abs(check.oki_stawka_2028 - podatki.oki.rates[2028]) > 1e-5) {
    out.push(`Stawka OKI 2028: w konfiguracji ${podatki.oki.rates[2028]}, według raportu ${check.oki_stawka_2028}.`);
  }
  for (const r of check.rozbieznosci ?? []) if (typeof r === 'string') out.push(r);
  return out;
}
