/**
 * brain/providers.js: every channel speaks here.
 *
 * OpenAI compatible channels: openai, deepseek, openrouter, hf,
 * llama, ollama. Native channel: anthropic.
 * Selected by HARNESS_PROVIDER. HARNESS_BASE_URL and
 * HARNESS_MODEL override defaults. Any HARNESS_API_KEY style
 * key env is honored per channel. All calls time out.
 */

const CHANNELS = {
  openai: { kind: 'oai', base: 'https://api.openai.com/v1', key: 'OPENAI_API_KEY', model: 'gpt-4o-mini' },
  deepseek: { kind: 'oai', base: 'https://api.deepseek.com/v1', key: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  openrouter: { kind: 'oai', base: 'https://openrouter.ai/api/v1', key: 'OPENROUTER_API_KEY', model: null },
  hf: { kind: 'oai', base: 'https://router.huggingface.co/v1', key: 'HF_TOKEN', model: null },
  llama: { kind: 'oai', base: 'http://127.0.0.1:8080/v1', key: null, model: 'local' },
  ollama: { kind: 'oai', base: 'http://127.0.0.1:11434/v1', key: null, model: 'qwen2.5-coder:7b' },
  anthropic: { kind: 'anthropic', base: 'https://api.anthropic.com', key: 'ANTHROPIC_API_KEY', model: 'claude-haiku-4-5' },
};

export function channelNames() {
  return Object.keys(CHANNELS);
}

export function resolveChannel() {
  const name = (process.env.HARNESS_PROVIDER || '').toLowerCase();
  if (!name || name === 'mock') return null;
  const def = CHANNELS[name];
  if (!def) throw new Error(`unknown provider ${name}, see doctor`);
  return {
    name,
    kind: def.kind,
    base: process.env.HARNESS_BASE_URL || def.base,
    key: def.key ? process.env[def.key] || process.env.HARNESS_API_KEY || null : null,
    model: process.env.HARNESS_MODEL || def.model,
  };
}

export function mapTool(text) {
  const low = String(text || '').toLowerCase();
  if (low.includes('scan') || low.includes('map')) return 'scan';
  if (low.includes('check') || low.includes('review')) return 'check';
  if (low.includes('remember') || low.includes('note')) return 'remember';
  if (low.includes('recall') || low.includes('find')) return 'recall';
  return 'chat';
}

async function postJson(url, headers, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`provider answered ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function completeOai(ch, prompt, timeoutMs) {
  if (!ch.model) throw new Error(`set HARNESS_MODEL for provider ${ch.name}`);
  const headers = {};
  if (ch.key) headers.authorization = `Bearer ${ch.key}`;
  const data = await postJson(
    `${ch.base}/chat/completions`,
    headers,
    { model: ch.model, messages: [{ role: 'user', content: String(prompt || '') }], temperature: 0.2 },
    timeoutMs
  );
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('provider gave empty reply');
  return text;
}

async function completeAnthropic(ch, prompt, timeoutMs) {
  if (!ch.key) throw new Error('set ANTHROPIC_API_KEY or HARNESS_API_KEY');
  if (!ch.model) throw new Error(`set HARNESS_MODEL for provider ${ch.name}`);
  const data = await postJson(
    `${ch.base}/v1/messages`,
    { 'x-api-key': ch.key, 'anthropic-version': '2023-06-01' },
    {
      model: ch.model,
      max_tokens: 512,
      system: 'You are a terse on device assistant. Answer briefly.',
      messages: [{ role: 'user', content: String(prompt || '') }],
    },
    timeoutMs
  );
  const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text) throw new Error('provider gave empty reply');
  return text;
}

export async function completeVia(ch, prompt, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || process.env.HARNESS_TIMEOUT_MS || 60000);
  const text = ch.kind === 'anthropic' ? await completeAnthropic(ch, prompt, timeoutMs) : await completeOai(ch, prompt, timeoutMs);
  return { text, tool: mapTool(text), note: `${ch.name} slow path used` };
}
