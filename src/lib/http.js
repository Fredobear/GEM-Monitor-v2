// fetch z limitem czasu i ponawianiem. Klucze API nigdy nie trafiają do komunikatów błędów (używamy `label`).

const USER_AGENT = 'gem-monitor/1.0 (osobiste narzedzie do analizy strategii GEM)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, { label, headers = {}, method = 'GET', body, timeoutMs = 30000, retries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : 2000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`${label}: błąd połączenia (${lastError?.name === 'TimeoutError' ? 'przekroczony czas' : lastError?.message ?? 'nieznany'})`);
}

export async function fetchText(url, opts) {
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) throw new Error(`${opts.label}: HTTP ${res.status}`);
  return res.text();
}
