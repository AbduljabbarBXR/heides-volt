import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { webget, websearch } from '../src/web/index.js';

const savedEnv = { ...process.env };

function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(savedEnv)) process.env[k] = v;
}

function stubServer(handler) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, body, res));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('webget extracts title and text, strips scripts', async () => {
  process.env.HARNESS_ALLOW_PRIVATE = '1';
  const server = await stubServer((req, body, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><head><title>Ember Docs</title><script>evil()</script></head><body><p>Hello <b>world</b></p></body></html>');
  });
  try {
    const res = await webget(`http://127.0.0.1:${server.address().port}/page`);
    assert(res.ok);
    assert.equal(res.title, 'Ember Docs');
    assert.match(res.text, /Hello world/);
    assert(!res.text.includes('evil'));
  } finally {
    server.close();
    restoreEnv();
  }
});

test('webget blocks private ranges by default', async () => {
  delete process.env.HARNESS_ALLOW_PRIVATE;
  const res = await webget('http://127.0.0.1:9/page');
  assert(!res.ok);
  assert.match(res.note, /private/);
  restoreEnv();
});

test('webget reports page errors', async () => {
  process.env.HARNESS_ALLOW_PRIVATE = '1';
  const server = await stubServer((req, body, res) => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('gone');
  });
  try {
    const res = await webget(`http://127.0.0.1:${server.address().port}/gone`);
    assert(!res.ok);
  } finally {
    server.close();
    restoreEnv();
  }
});

test('tavily channel parses answer plus hits', async () => {
  const server = await stubServer((req, body, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ answer: 'Ember is hot', results: [{ title: 'T', url: 'https://x.test', content: 'snippet here' }] }));
  });
  try {
    process.env.HARNESS_SEARCH = 'tavily';
    process.env.HARNESS_SEARCH_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.TAVILY_API_KEY = 'k';
    const res = await websearch('ember status');
    assert(res.ok);
    assert.equal(res.answer, 'Ember is hot');
    assert.equal(res.hits[0].snippet, 'snippet here');
  } finally {
    server.close();
    restoreEnv();
  }
});

test('brave channel parses hits', async () => {
  const server = await stubServer((req, body, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ web: { results: [{ title: 'B', url: 'https://y.test', description: 'desc here' }] } }));
  });
  try {
    process.env.HARNESS_SEARCH = 'brave';
    process.env.HARNESS_SEARCH_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.BRAVE_API_KEY = 'k';
    const res = await websearch('ember status');
    assert(res.ok);
    assert.equal(res.hits[0].snippet, 'desc here');
  } finally {
    server.close();
    restoreEnv();
  }
});

test('missing channel guides setup', async () => {
  delete process.env.HARNESS_SEARCH;
  const res = await websearch('anything');
  assert(!res.ok);
  assert.match(res.note, /HARNESS_SEARCH/);
  restoreEnv();
});
