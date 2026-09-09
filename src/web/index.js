/**
 * web/index.js: eyes on the outside world.
 *
 * webget fetches one page and returns text. websearch asks a
 * search channel. Both guard: http only, private ranges blocked
 * unless HARNESS_ALLOW_PRIVATE is set for tests, size capped,
 * calls time out. Anything learned should be remembered
 * explicitly with remember, never auto stored.
 */

const MAX_BYTES = 500 * 1024;

function blockedHost(hostname) {
  if (process.env.HARNESS_ALLOW_PRIVATE) return false;
  const h = String(hostname || '').toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^0\.0\.0\.0/.test(h) || h === '[::1]') return true;
  return false;
}

function pageText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i) || [])[1] || '';
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return { title: title.replace(/\s+/g, ' ').trim(), text: body };
}

export async function webget(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 20000);
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return { ok: false, note: 'bad url, fetch refused' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, note: 'only web pages may be fetched' };
  if (blockedHost(u.hostname)) return { ok: false, note: 'blocked host, private range' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(u.toString(), { signal: ctrl.signal, headers: { 'user-agent': 'heidesharness/0.4' } });
    if (!res.ok) return { ok: false, note: `page answered ${res.status}` };
    const type = res.headers.get('content-type') || '';
    if (!/text|json|xml/.test(type)) return { ok: false, note: 'binary skipped, text only' };
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        try { await reader.cancel(); } catch { /* done */ }
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const { title, text } = pageText(html);
    return { ok: true, url: u.toString(), title, text: text.slice(0, 4000) };
  } catch (e) {
    return { ok: false, note: 'fetch failed, moving on' };
  } finally {
    clearTimeout(timer);
  }
}

export function searchChannel() {
  return (process.env.HARNESS_SEARCH || '').toLowerCase() || null;
}

export async function websearch(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, note: 'empty query ignored' };
  const timeoutMs = Number(opts.timeoutMs || 20000);
  const channel = searchChannel();
  if (channel === 'tavily') return searchTavily(q, timeoutMs);
  if (channel === 'brave') return searchBrave(q, timeoutMs);
  return { ok: false, note: 'set HARNESS_SEARCH to tavily or brave plus key' };
}

async function postJson(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`search answered ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchTavily(q, timeoutMs) {
  const key = process.env.TAVILY_API_KEY || process.env.HARNESS_API_KEY;
  if (!key) return { ok: false, note: 'set TAVILY_API_KEY first' };
  const base = process.env.HARNESS_SEARCH_URL || 'https://api.tavily.com';
  try {
    const data = await postJson(`${base}/search`, {}, { api_key: key, query: q, max_results: 5, include_answer: true }, timeoutMs);
    const hits = (data.results || []).map((r) => ({ title: r.title || '', url: r.url || '', snippet: (r.content || '').slice(0, 300) }));
    return { ok: true, answer: (data.answer || '').slice(0, 800), hits };
  } catch (e) {
    return { ok: false, note: 'search failed, moving on' };
  }
}

async function searchBrave(q, timeoutMs) {
  const key = process.env.BRAVE_API_KEY || process.env.HARNESS_API_KEY;
  if (!key) return { ok: false, note: 'set BRAVE_API_KEY first' };
  const base = process.env.HARNESS_SEARCH_URL || 'https://api.search.brave.com';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/res/v0/web/search?q=${encodeURIComponent(q)}&count=5`, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`search answered ${res.status}`);
    const data = await res.json();
    const hits = ((data.web && data.web.results) || []).map((r) => ({ title: r.title || '', url: r.url || '', snippet: (r.description || '').slice(0, 300) }));
    return { ok: true, answer: '', hits };
  } catch (e) {
    return { ok: false, note: 'search failed, moving on' };
  } finally {
    clearTimeout(timer);
  }
}
