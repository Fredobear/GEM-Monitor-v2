// Wiadomości polityczne, geopolityczne i makro z kanałów RSS, oznaczane regionami i tematami.
// To kontekst do sygnału: pokazuje, co dzieje się na rynkach, ale nie zmienia mechanicznej decyzji GEM.
import { fetchText } from './lib/http.js';
import { compileKeywords } from './lib/keywords.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function clean(s) {
  if (!s) return '';
  const noCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(decodeEntities(noCdata).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

export function parseFeed(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const title = clean(tag(block, 'title'));
    let link = clean(tag(block, 'link'));
    if (!link) link = block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '';
    const dateRaw = clean(tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? tag(block, 'dc:date'));
    const date = dateRaw ? new Date(dateRaw) : null;
    const summary = clean(tag(block, 'description') ?? tag(block, 'summary')).slice(0, 300);
    if (title) items.push({ title, link: decodeEntities(link), date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null, summary, source });
  }
  return items;
}

// Słowa kluczowe (EN + PL). „słowo” = całe słowo, „rdzeń*” = dowolna końcówka (odmiana).
export const REGIONS = {
  USA: ['u.s.', 'usa', 'america*', 'wall street', 's&p', 'nasdaq', 'dow jones', 'fed', 'federal reserve', 'trump*', 'white house', 'congress*', 'treasury', 'stany zjednoczone', 'stanach zjednoczonych', 'amerykań*', 'kongres*', 'biały dom', 'białego domu'],
  Europa: ['europe*', 'eurozone', 'ecb', 'german*', 'france', 'french', 'uk', 'britain', 'british', 'brexit', 'ital*', 'ebc', 'europ*', 'niemc*', 'niemie*', 'francj*', 'francus*', 'wielka brytania', 'wielkiej brytanii', 'strefa euro', 'strefie euro', 'strefy euro'],
  Azja: ['china', 'chinese', 'beijing', 'japan*', 'taiwan*', 'korea*', 'india', 'indian', 'chin*', 'japoni*', 'tajwan*', 'indie', 'indii', 'pekin*'],
  'Rynki wschodzące': ['emerging market*', 'brazil*', 'mexic*', 'turkey', 'turkish', 'south africa*', 'indonesia*', 'saudi', 'rynki wschodzące', 'rynków wschodzących', 'rynkach wschodzących', 'brazyli*', 'meksyk*', 'turcj*'],
  Polska: ['poland', 'polish', 'warsaw', 'nbp', 'polsk*', 'polsce', 'warszaw*', 'gpw', 'wig*', 'złoty', 'złotego', 'złotym', 'złotówk*', 'rpp'],
  'Bliski Wschód': ['israel*', 'iran*', 'gaza', 'middle east', 'hezbollah', 'houthi*', 'izrael*', 'bliski wschód', 'bliskim wschodzie', 'bliskiego wschodu', 'strefa gazy', 'strefie gazy'],
  'Rosja/Ukraina': ['russia*', 'ukrain*', 'kremlin', 'putin*', 'zelensky*', 'rosj*', 'rosyj*', 'kreml*', 'zełenski*'],
};

export const THEMES = {
  'Konflikty i wojny': ['war', 'wars', 'military', 'missile*', 'attack*', 'airstrike*', 'troops', 'invasion', 'invade*', 'conflict*', 'ceasefire', 'wojn*', 'atak*', 'konflikt*', 'rakiet*', 'zawieszeni* broni', 'inwazj*', 'ostrzał*', 'wojsk*'],
  'Sankcje i cła': ['sanction*', 'tariff*', 'trade war*', 'export control*', 'embargo*', 'sankcj*', 'cła', 'cło', 'cłami', 'ceł', 'wojna handlowa', 'wojny handlowej', 'embarg*'],
  'Banki centralne i stopy': ['rate cut*', 'rate hike*', 'interest rate*', 'central bank*', 'fed', 'federal reserve', 'fomc', 'ecb', 'powell', 'lagarde', 'bank of japan', 'bank of england', 'stopy procentowe', 'stóp procentowych', 'stopach procentowych', 'bank centraln*', 'banku centralnego', 'rpp', 'nbp', 'obniżk* stóp', 'podwyżk* stóp', 'glapiński*'],
  'Wybory i polityka': ['election*', 'vote', 'votes', 'voting', 'parliament*', 'shutdown', 'prime minister', 'coalition', 'wybor*', 'głosowa*', 'sejm*', 'rząd', 'rządu', 'rządem', 'koalicj*', 'prezydent*'],
  'Energia i surowce': ['oil', 'crude', 'natural gas', 'lng', 'opec*', 'energy', 'brent', 'wti', 'ropa', 'ropy', 'ropę', 'gaz', 'gazu', 'energi*', 'paliw*'],
  'Inflacja i recesja': ['inflation*', 'recession*', 'cpi', 'gdp', 'jobs report', 'payroll*', 'unemployment', 'slowdown', 'stagflation', 'inflacj*', 'recesj*', 'pkb', 'bezroboci*', 'spowolnieni*', 'stagflacj*'],
};

const THEME_WEIGHT = { 'Konflikty i wojny': 3, 'Sankcje i cła': 3, 'Banki centralne i stopy': 2, 'Wybory i polityka': 2, 'Energia i surowce': 2, 'Inflacja i recesja': 2 };

// Tematy z natury rynkowe; pozostałe (konflikty, polityka) wymagają dodatkowo słowa związanego z rynkami.
const ECONOMIC_THEMES = new Set(['Banki centralne i stopy', 'Sankcje i cła', 'Energia i surowce', 'Inflacja i recesja']);
const MARKET_WORDS = ['market*', 'stock*', 'shares', 'equit*', 'investor*', 'econom*', 'bond*', 'yield*', 'currenc*', 'dollar*', 'price*', 'trade', 'export*', 'supply', 'giełd*', 'rynk*', 'rynek', 'inwestor*', 'akcj*', 'obligacj*', 'walut*', 'gospodar*', 'cena', 'ceny', 'cen', 'cenach', 'handl*', 'eksport*', 'dolar*', 'notowa*'];

const compile = compileKeywords;
// Skróty pisane wielkimi literami (np. „US”) sprawdzamy z rozróżnieniem wielkości liter – „us” to zaimek.
const REGION_ABBREVIATIONS = { USA: /(?<![\p{L}\p{N}])US(?![\p{L}\p{N}])/u, Europa: /(?<![\p{L}\p{N}])(?:EU|UE)(?![\p{L}\p{N}])/u };
const REGION_RX = Object.fromEntries(
  Object.entries(REGIONS).map(([k, w]) => {
    const rx = compile(w);
    const abbr = REGION_ABBREVIATIONS[k];
    return [k, abbr ? { test: (s) => rx.test(s) || abbr.test(s) } : rx];
  }),
);
const THEME_RX = Object.fromEntries(Object.entries(THEMES).map(([k, w]) => [k, compile(w)]));
const MARKET_RX = compile(MARKET_WORDS);

export function classify(item) {
  const text = `${item.title} ${item.summary}`;
  const regions = Object.keys(REGION_RX).filter((k) => REGION_RX[k].test(text));
  const themes = Object.keys(THEME_RX).filter((k) => THEME_RX[k].test(text));
  const marketRelated = MARKET_RX.test(text);
  const relevant = themes.length > 0 && (marketRelated || themes.some((t) => ECONOMIC_THEMES.has(t)));
  const score = themes.reduce((a, t) => a + THEME_WEIGHT[t], 0) + regions.length + (marketRelated ? 2 : 0);
  return { ...item, regions, themes, relevant, score };
}

const normalizeTitle = (t) => t.toLowerCase().replace(/\s+-\s+[^-]+$/, '').replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 70);

export async function loadNews(config, now = new Date()) {
  const { feeds, maxAgeHours } = config.news;
  const results = await Promise.allSettled(feeds.map((f) => fetchText(f.url, { label: `RSS ${f.name}`, timeoutMs: 15000, retries: 1 }).then((xml) => parseFeed(xml, f.name))));
  const errors = [];
  const all = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? all.push(...r.value) : errors.push(r.reason.message)));

  const cutoff = now.getTime() - maxAgeHours * 3600 * 1000;
  const seen = new Set();
  const relevant = [];
  for (const item of all.map(classify)) {
    if (!item.date || new Date(item.date).getTime() < cutoff) continue;
    if (!item.relevant) continue;
    const key = normalizeTitle(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    relevant.push(item);
  }
  relevant.sort((a, b) => b.score - a.score || (a.date < b.date ? 1 : -1));

  const themeCounts = Object.fromEntries(Object.keys(THEMES).map((t) => [t, relevant.filter((i) => i.themes.includes(t)).length]));
  const regionCounts = Object.fromEntries(Object.keys(REGIONS).map((r) => [r, relevant.filter((i) => i.regions.includes(r)).length]));
  return { fetched: all.length, items: relevant.slice(0, 15), themeCounts, regionCounts, errors };
}
