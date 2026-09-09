import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { runTurn } from '../src/vessel/index.js';
import { watchLoop } from '../src/sched/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return new Muscle(new Store(dir));
}

function chain(m, rounds) {
  for (let r = 0; r < rounds; r++) {
    m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
    m.record({ intent: 'do check phase', tool: 'check', ok: true });
    m.record({ intent: 'do recall phase', tool: 'recall', ok: true });
  }
}

test('macro suggests third tool after two prefix hits', () => {
  const m = fresh('harnessmacroA');
  assert.equal(m.macroSuggest(), null);
  chain(m, 3);
  m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
  m.record({ intent: 'do check phase', tool: 'check', ok: true });
  assert.equal(m.macroSuggest(), 'recall');
});

test('runTurn fires macro before brain', async () => {
  const m = fresh('harnessmacroB');
  chain(m, 3);
  m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
  m.record({ intent: 'do check phase', tool: 'check', ok: true });
  let brainCalls = 0;
  const brain = {
    complete: async () => {
      brainCalls += 1;
      return { text: 'slow', tool: 'chat' };
    },
  };
  const res = await runTurn('something unrelated here', { muscle: m, brain });
  assert.equal(res.path, 'fast');
  assert.equal(res.tool, 'recall');
  assert.equal(brainCalls, 0);
});

test('watch ticks learn and stop ends loop', async () => {
  const m = fresh('harnesswatchA');
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  const lines = [];
  const stop = watchLoop({ muscle: m, brain, intervalMs: 30, cwd: '/tmp', say: (s) => lines.push(s) });
  await new Promise((r) => setTimeout(r, 120));
  stop();
  const count = lines.length;
  assert(count >= 2, `expected ticks, saw ${count}`);
  assert(m.stats().turns >= 1);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(lines.length, count);
});
