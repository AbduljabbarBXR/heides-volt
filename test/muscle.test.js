import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'harnessmuscle'));
  return new Muscle(new Store(dir));
}

test('remember stores and recall finds', () => {
  const m = fresh();
  assert(m.remember('demo project uses node with zero extra installs').ok);
  const hits = m.recall('demo project node');
  assert(hits.length >= 1);
});

test('empty fact ignored', () => {
  const m = fresh();
  assert(!m.remember('   ').ok);
});

test('verified wins raise route confidence', () => {
  const m = fresh();
  assert.equal(m.predictTool('please scan the workspace').confidence, 'none');
  m.record({ intent: 'please scan the workspace now', tool: 'scan', ok: true });
  m.record({ intent: 'scan the workspace fully today', tool: 'scan', ok: true });
  m.record({ intent: 'scan workspace map again', tool: 'scan', ok: true });
  const guess = m.predictTool('scan the workspace');
  assert.equal(guess.tool, 'scan');
  assert.equal(guess.confidence, 'high');
});

test('failures lower reward', () => {
  const m = fresh();
  m.record({ intent: 'scan alpha beta gamma', tool: 'scan', ok: true });
  const before = m.predictTool('scan alpha').confidence;
  m.record({ intent: 'scan alpha beta gamma', tool: 'scan', ok: false });
  m.record({ intent: 'scan alpha beta gamma', tool: 'scan', ok: false });
  const after = m.predictTool('scan alpha').confidence;
  assert.notEqual(before, after);
});

test('chain seen 3 times compiles to macro', () => {
  const m = fresh();
  let done = null;
  for (let round = 0; round < 3; round++) {
    m.compileChains('a', 'scan', true);
    m.compileChains('b', 'check', true);
    done = m.compileChains('c', 'recall', true);
  }
  assert(done && done.macro === 'scan>check>recall');
  assert.equal(m.stats().macros, 1);
});
