// Opcjonalny komentarz AI (Claude) z wyszukiwaniem w sieci. Działa tylko z ANTHROPIC_API_KEY.
// Model opisuje kontekst gotowego sygnału. Nie zmienia sygnału i nie udziela rekomendacji.
import { fmtPct } from './explain.js';

const SYSTEM = `Jesteś analitykiem rynków w narzędziu, które mechanicznie realizuje strategię Global Equity Momentum (GEM) Gary'ego Antonacciego dla inwestora z Polski, kupującego ETF-y w XTB.
Sygnał GEM jest już wyliczony z danych cenowych i jest ostateczny. Nie zmieniaj go, nie podważaj, nie proponuj odstępstw ani innych instrumentów i nie udzielaj osobistych porad inwestycyjnych.
Twoje zadanie: wyjaśnić użytkownikowi po polsku, zwięźle (maksymalnie 220 słów), kontekst rynkowy, polityczny i geopolityczny tego sygnału.
Użyj wyszukiwarki, aby sprawdzić najważniejsze wydarzenia z ostatnich 7 dni, które dotyczą rynków z sygnału (akcje USA, akcje poza USA, obligacje USA), oraz zweryfikować podane nagłówki. Podawaj tylko fakty, które potwierdziłeś; jeśli czegoś nie wiesz, napisz to wprost.
Odpowiedz dokładnie w tym formacie (zwykły tekst, bez tabel):
**Dlaczego teraz {TICKER}**
2–3 zdania oparte na podanych liczbach momentum.
**Kontekst polityczny i geopolityczny**
- 3–4 punkty o wydarzeniach istotnych dla tych rynków.
**Ryzyka do obserwowania**
- 2–3 punkty: co mogłoby odwrócić trend wybranego rynku.
**Wpływ na strategię**
Jedno zdanie: GEM działa mechanicznie, a wiadomości nie zmieniają sygnału. Jeśli ryzyko jest wyraźnie podwyższone, nazwij je bez sugerowania odstępstw.`;

function buildPrompt({ signals, explanation, macro, news, config }) {
  const { official, preview, rules } = signals;
  const lines = [];
  lines.push(`Data: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Sygnał GEM (wariant: ${rules.variant}) na ${official.forMonth}: ${explanation.target.marketName} → ${explanation.target.ticker} (${explanation.target.name}).`);
  lines.push(`Akcja: ${explanation.action.text}. ${explanation.stabilityText}`);
  lines.push(`Stopy zwrotu ${rules.lookbackMonths}M na koniec ${official.month}:`);
  for (const [k, r] of Object.entries(official.returns)) lines.push(`- ${config.assets[k].name} (${config.assets[k].index}): ${fmtPct(r)}`);
  if (preview) lines.push(`Podgląd na ${preview.asOf}: ${config.assets[preview.decision.asset].name}${preview.differsFromOfficial ? ' (RÓŻNI SIĘ od sygnału oficjalnego)' : ''}.`);
  if (macro?.indicators?.length) {
    lines.push('Wskaźniki ryzyka:');
    for (const i of macro.indicators) lines.push(`- ${i.name}: ${i.value} – ${i.comment}`);
  }
  if (news?.items?.length) {
    lines.push('Nagłówki z ostatnich dni (do weryfikacji):');
    for (const n of news.items.slice(0, 12)) lines.push(`- [${n.source}, ${n.date?.slice(0, 10) ?? '?'}] ${n.title} (${[...n.regions, ...n.themes].join(', ')})`);
  }
  return lines.join('\n');
}

export async function aiCommentary({ signals, explanation, macro, news, config, env = process.env }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return { error: 'Brak pakietu @anthropic-ai/sdk – uruchom „npm install”.' };
  }
  const client = new Anthropic();
  const messages = [{ role: 'user', content: buildPrompt({ signals, explanation, macro, news, config }) }];
  const system = SYSTEM.replace('{TICKER}', explanation.target.ticker);

  try {
    let response;
    for (let round = 0; round < 5; round++) {
      response = await client.beta.messages.create({
        model: config.ai.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: config.ai.effort },
        system,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: config.ai.maxWebSearches }],
        messages,
      });
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    if (response.stop_reason === 'refusal') return { error: `Model odmówił odpowiedzi (${response.stop_details?.category ?? 'brak kategorii'}).` };
    if (response.stop_reason === 'pause_turn') return { error: 'Model nie zakończył wyszukiwania w limicie rund.' };

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) return { error: 'Pusta odpowiedź modelu.' };
    const sources = new Map();
    for (const block of response.content) {
      for (const c of block.citations ?? []) if (c.url && !sources.has(c.url)) sources.set(c.url, c.title ?? c.url);
    }
    if (!sources.size) {
      for (const block of response.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
          for (const r of block.content.slice(0, 5)) if (r.url) sources.set(r.url, r.title ?? r.url);
        }
      }
    }
    return {
      text,
      sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
      model: response.model,
      generatedAt: new Date().toISOString(),
      usage: { input: response.usage?.input_tokens, output: response.usage?.output_tokens, webSearches: response.usage?.server_tool_use?.web_search_requests },
    };
  } catch (err) {
    const status = err?.status ? ` (HTTP ${err.status})` : '';
    return { error: `Komentarz AI niedostępny${status}: ${String(err?.message ?? err).slice(0, 200)}` };
  }
}
