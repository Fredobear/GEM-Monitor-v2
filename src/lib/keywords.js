// Wyrażenia regularne ze słów kluczowych (PL/EN): „słowo” = całe słowo,
// „rdzeń*” = dowolna końcówka, gwiazdka w środku frazy = dowolna końcówka danego słowa.
const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export function compileKeywords(words) {
  const parts = words.map((w) => {
    const prefix = w.endsWith('*');
    const body = prefix ? w.slice(0, -1) : w;
    const core = body
      .split('*')
      .map((s) => escape(s).replace(/ /g, '\\s+'))
      .join('\\p{L}*');
    return prefix ? core : `${core}(?![\\p{L}\\p{N}])`;
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})`, 'iu');
}
