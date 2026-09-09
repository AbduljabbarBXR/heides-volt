import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { propose, attempt } from '../src/curiosity/index.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'harnesscurious'));
  return new Muscle(new Store(dir));
}

test('empty muscle proposes memory first', () => {
  const m = fresh();
  const p = propose(m);
  assert.equal(p.target, 'memory');
});

test('weak route becomes curiosity target', () => {
  const m = fresh();
  m.record({ intent: 'scan alpha beta gamma delta', tool: 'scan', ok: false });
  const p = propose(m);
  assert.equal(p.target, 'scan');
});

test('verified attempt is kept and trains muscle', async () => {
  const m = fresh();
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  const res = await attempt(m, brain, { target: 'memory', practice: 'gather one fact' });
  assert(res.kept);
  assert.equal(m.stats().turns, 1);
});

test('failing verify discards attempt and trains nothing good', async () => {
  const m = fresh();
  const brain = { complete: async () => ({ text: 'x', tool: 'destroy' }) };
  const res = await attempt(m, brain, { target: 'scan', practice: 'practice safe use' });
  assert(!res.kept);
  assert.equal(m.stats().turns, 0);
});
