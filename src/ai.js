// Opcjonalne komentarze AI (Claude) z wyszukiwaniem w sieci. Działają tylko z ANTHROPIC_API_KEY.
//  • aiCommentary – kontekst gotowego sygnału GEM (raz w tygodniu i przy nowym sygnale),
//  • aiMarketNote – codzienna notatka rynkowa do zakładki Rynki (co się dzieje, wpływ na rynki, najbliższe dni).
// Model opisuje kontekst. Nie zmienia sygnału GEM i nie udziela osobistych rekomendacji.
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

const MARKET_SYSTEM = `Jesteś analitykiem rynków finansowych. Piszesz codzienną notatkę rynkową po polsku dla inwestora indywidualnego z Polski, który inwestuje długoterminowo: ETF-y w XTB według strategii Global Equity Momentum (GEM), akcje z GPW i fundusze w pracowniczym programie emerytalnym.
Dostajesz dane rynkowe, wskaźniki ryzyka, kalendarz i nagłówki przygotowane przez aplikację. Użyj wyszukiwarki, aby potwierdzić najważniejsze wydarzenia z ostatnich 3 dni i sprawdzić zaplanowane wydarzenia na najbliższe 7 dni (decyzje banków centralnych, ważne dane makro, wyniki największych spółek, wydarzenia polityczne). Podawaj tylko fakty z danych albo potwierdzone w wyszukiwarce; liczby z danych przepisuj dokładnie. Jeśli czegoś nie wiesz, napisz to wprost.
Pisz rzeczowo i zrozumiale dla osoby bez wykształcenia finansowego, maksymalnie 450 słów. Nie udzielaj osobistych rekomendacji (kup lub sprzedaj konkretny instrument), nie obiecuj wyników i nie przedstawiaj prognoz jako pewnych. O przyszłości pisz w scenariuszach z orientacyjnym prawdopodobieństwem i z warunkami, które je potwierdzą albo obalą. Strategia GEM działa mechanicznie – nie sugeruj odstępstw od jej sygnału.
Odpowiedz dokładnie w tym formacie (zwykły tekst, bez tabel i bez linków w treści):
**W skrócie**
2–3 zdania: co jest dziś najważniejsze dla rynków.
**Co się dzieje na świecie**
- 3–5 punktów: wydarzenie → dlaczego ma znaczenie dla rynków.
**Wpływ na rynki**
- 4–6 punktów: akcje USA; Europa i rynki wschodzące; Polska i złoty; obligacje i stopy procentowe; surowce (złoto, ropa).
**Najbliższe dni**
- 2–4 zaplanowane wydarzenia z datami.
- Scenariusz bazowy (ok. X%): …
- Scenariusz pozytywny (ok. Y%): …
- Scenariusz negatywny (ok. Z%): …
**Co z tym zrobić**
- 2–4 punkty dla inwestora długoterminowego: co oznacza obecny sygnał GEM, czy utrzymywać regularne wpłaty, kiedy rozważyć rozłożenie większej kwoty na raty, rola poduszki finansowej. Ogólnie, bez osobistych porad.`;

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

const fmtSigned = (x, unit = '%', d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '–' : `${x < 0 ? '−' : '+'}${Math.abs(unit === '%' ? x * 100 : x).toFixed(d)}${unit === '%' ? '%' : ' pp'}`);

/** Dane do notatki rynkowej w zwięzłej postaci tekstowej (to, co model ma traktować jako fakty). */
export function marketPrompt({ overview, macro, news, explanation, now = new Date() }) {
  const lines = [`Data notatki: ${now.toISOString().slice(0, 10)} (notowania z ${overview?.asOf ?? '?'}).`];
  if (overview?.stance) {
    lines.push(`Termometr rynku (z reguł aplikacji): ${overview.stance.label} (wynik ${overview.stance.score}).`);
    for (const f of overview.stance.factors) lines.push(`- ${f.label}: ${f.detail} (${f.score > 0 ? '+' : ''}${f.score})`);
  }
  if (overview?.world?.length) {
    lines.push('Rynki (ostatnia wartość; zmiana 1 sesja / tydzień / miesiąc / od początku roku; trend):');
    for (const r of overview.world) {
      const unit = r.kind === 'yield' ? 'pp' : '%';
      const val = r.kind === 'yield' ? `${r.last}%` : r.last;
      lines.push(`- ${r.name}: ${val}; ${fmtSigned(r.d1, unit, unit === 'pp' ? 2 : 1)} / ${fmtSigned(r.w1, unit, unit === 'pp' ? 2 : 1)} / ${fmtSigned(r.m1, unit, unit === 'pp' ? 2 : 1)} / ${fmtSigned(r.ytd, unit, unit === 'pp' ? 2 : 1)}${r.trend ? `; trend ${r.trend === 'up' ? 'wzrostowy' : 'spadkowy'}` : ''}${r.fromHigh !== null && r.fromHigh !== undefined ? `; ${fmtSigned(r.fromHigh)} od szczytu 52 tyg.` : ''} (${r.date})`);
    }
  }
  if (macro?.indicators?.length) {
    lines.push('Wskaźniki ryzyka (FRED):');
    for (const i of macro.indicators) lines.push(`- ${i.name}: ${i.value} – ${i.comment} (${i.date})`);
  }
  if (overview?.stats?.current && overview.regime) {
    const c = overview.stats.current;
    lines.push(`Statystyka S&P 500 od ${overview.stats.since?.slice(0, 4)} w obecnym reżimie (trend ${overview.regime.trend === 'up' ? 'wzrostowy' : 'spadkowy'}, zmienność ${Math.round((overview.regime.volValue ?? 0) * 100)}% rocznie):`);
    for (const [h, label] of [[5, '1 tydzień'], [21, '1 miesiąc'], [63, '3 miesiące']]) if (c[h]) lines.push(`- ${label}: wzrost w ${Math.round(c[h].up * 100)}% przypadków, mediana ${fmtSigned(c[h].median)}, 10–90%: ${fmtSigned(c[h].p10)} … ${fmtSigned(c[h].p90)}`);
  }
  if (overview?.events?.length) {
    lines.push('Kalendarz aplikacji (najbliższe dni):');
    for (const e of overview.events.slice(0, 8)) lines.push(`- ${e.date}: ${e.title}${e.approx ? ' (termin orientacyjny)' : ''}`);
  }
  if (explanation?.target) lines.push(`Sygnał GEM: ${explanation.target.marketName} → ${explanation.target.ticker}. ${explanation.action?.text ?? ''}. ${explanation.stabilityText ?? ''}`);
  if (news?.items?.length) {
    lines.push('Nagłówki z ostatnich 72 godzin (do weryfikacji):');
    for (const n of news.items.slice(0, 15)) lines.push(`- [${n.source}, ${n.date?.slice(0, 10) ?? '?'}] ${n.title} (${[...(n.regions ?? []), ...(n.themes ?? [])].join(', ')})`);
  }
  return lines.join('\n');
}

/** Jedno zapytanie do Claude z wyszukiwarką; zwraca { text, sources, model, generatedAt, usage } albo { error }. */
async function askClaude({ system, prompt, model, effort, maxWebSearches, env }) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return { error: 'Brak pakietu @anthropic-ai/sdk – uruchom „npm install”.' };
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const messages = [{ role: 'user', content: prompt }];
  try {
    let response;
    for (let round = 0; round < 5; round++) {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxWebSearches }],
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

export async function aiCommentary({ signals, explanation, macro, news, config, env = process.env }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  return askClaude({
    system: SYSTEM.replace('{TICKER}', explanation.target.ticker),
    prompt: buildPrompt({ signals, explanation, macro, news, config }),
    model: config.ai.model,
    effort: config.ai.effort,
    maxWebSearches: config.ai.maxWebSearches,
    env,
  });
}

/** Codzienna notatka rynkowa (zakładka Rynki → Przegląd). */
export async function aiMarketNote({ overview, macro, news, explanation, config, env = process.env, now = new Date() }) {
  const cfg = config.ai?.marketNote;
  if (!env.ANTHROPIC_API_KEY || !cfg?.enabled) return null;
  const result = await askClaude({
    system: MARKET_SYSTEM,
    prompt: marketPrompt({ overview, macro, news, explanation, now }),
    model: cfg.model ?? config.ai.model,
    effort: cfg.effort ?? config.ai.effort,
    maxWebSearches: cfg.maxWebSearches ?? 4,
    env,
  });
  return result?.text ? { ...result, date: now.toISOString().slice(0, 10) } : result;
}
