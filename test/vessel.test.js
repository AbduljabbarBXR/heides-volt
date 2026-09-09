import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { runTurn } from '../src/vessel/index.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'harnessvessel'));
  return new Muscle(new Store(dir));
}

test('familiar intent takes fast path and skips brain', async () => {
  const muscle = fresh();
  let brainCalls = 0;
  const brain = {
    complete: async () => {
      brainCalls += 1;
      return { text: 'slow', tool: 'scan' };
    },
  };
  for (let i = 0; i < 3; i++) await runTurn('scan the workspace map fully', { muscle, brain });
  brainCalls = 0;
  const res = await runTurn('scan the workspace', { muscle, brain });
  assert.equal(res.path, 'fast');
  assert.equal(brainCalls, 0);
});

test('novel intent takes slow path and calls brain', async () => {
  const muscle = fresh();
  let brainCalls = 0;
  const brain = {
    complete: async () => {
      brainCalls += 1;
      return { text: 'slow reply', tool: 'chat' };
    },
  };
  const res = await runTurn('totally novel request about gardening tips', { muscle, brain });
  assert.equal(res.path, 'slow');
  assert.equal(brainCalls, 1);
});

test('destructive tool fails verify and trains nothing good', async () => {
  const muscle = fresh();
  const brain = { complete: async () => ({ text: 'x', tool: 'destroy' }) };
  const res = await runTurn('anything', { muscle, brain });
  assert.match(res.reply, /failed verify/);
});
