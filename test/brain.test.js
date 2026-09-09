import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { complete } from '../src/brain/index.js';
import { channelNames } from '../src/brain/providers.js';

function savedEnv() {
  return { ...process.env };
}

function restoreEnv(saved) {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  for (const [k, v] of Object.entries(saved)) process.env[k] = v;
}

function stubServer(handler) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, body, res));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('all seven channels exist', () => {
  const names = channelNames();
  for (const n of ['openai', 'deepseek', 'openrouter', 'hf', 'anthropic', 'llama', 'ollama']) {
    assert(names.includes(n), `missing channel ${n}`);
  }
});

test('openai compatible channel maps tool from reply', async () => {
  const saved = savedEnv();
  const server = await stubServer((req, body, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'I will scan the workspace now' } }] }));
  });
  try {
    process.env.HARNESS_PROVIDER = 'llama';
    process.env.HARNESS_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
    process.env.HARNESS_MODEL = 'stub';
    const out = await complete('please help');
    assert.equal(out.tool, 'scan');
    assert.match(out.text, /scan the workspace/);
  } finally {
    server.close();
    restoreEnv(saved);
  }
});

test('anthropic native channel parses content blocks', async () => {
  const saved = savedEnv();
  let seen = null;
  const server = await stubServer((req, body, res) => {
    seen = { url: req.url, key: req.headers['x-api-key'], version: req.headers['anthropic-version'] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'review the code now' }] }));
  });
  try {
    process.env.HARNESS_PROVIDER = 'anthropic';
    process.env.HARNESS_BASE_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.HARNESS_MODEL = 'stub-claude';
    process.env.ANTHROPIC_API_KEY = 'testkey';
    const out = await complete('please help');
    assert.equal(seen.url, '/v1/messages');
    assert.equal(seen.key, 'testkey');
    assert.equal(out.tool, 'check');
  } finally {
    server.close();
    restoreEnv(saved);
  }
});

test('provider error surfaces as unreachable, vessel records nothing', async () => {
  const saved = savedEnv();
  const server = await stubServer((req, body, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{}');
  });
  try {
    process.env.HARNESS_PROVIDER = 'deepseek';
    process.env.HARNESS_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
    process.env.HARNESS_MODEL = 'stub';
    await assert.rejects(complete('hi'), /brain unreachable/);
  } finally {
    server.close();
    restoreEnv(saved);
  }
});

test('unknown provider names the problem', async () => {
  const saved = savedEnv();
  try {
    process.env.HARNESS_PROVIDER = 'skynet';
    await assert.rejects(complete('hi'), /unknown provider/);
  } finally {
    restoreEnv(saved);
  }
});
