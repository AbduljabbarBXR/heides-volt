import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { runTurn, logTrace } from '../src/vessel/index.js';
import { exportDistill, distillStats } from '../src/sleep/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, muscle: new Muscle(new Store(dir)) };
}

test('verified slow turns leave traces', async () => {
  const { muscle } = fresh('harnesssleepA');
  const brain = { complete: async () => ({ text: 'slow reply here', tool: 'chat' }) };
  await runTurn('first novel thought', { muscle, brain });
  await runTurn('zebra quantum vortex', { muscle, brain });
  assert.equal(distillStats(muscle).pairs, 2);
});

test('recall injects facts into brain prompt', async () => {
  const { muscle } = fresh('harnesssleepB');
  muscle.remember('project codename is ember');
  let seen = '';
  const brain = {
    complete: async (prompt) => {
      seen = prompt;
      return { text: 'ok', tool: 'chat' };
    },
  };
  await runTurn('what is the codename', { muscle, brain });
  assert.match(seen, /ember/);
  assert.match(seen, /Known facts/);
});

test('distill writes valid jsonl pairs', async () => {
  const { dir, muscle } = fresh('harnesssleepC');
  const brain = { complete: async () => ({ text: 'slow reply here', tool: 'chat' }) };
  await runTurn('novel thought one', { muscle, brain });
  const file = join(dir, 'out.jsonl');
  const res = exportDistill(muscle, file);
  assert.equal(res.pairs, 1);
  const line = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(line.prompt, 'novel thought one');
  assert.equal(line.completion, 'slow reply here');
});

test('trace log caps at 500', () => {
  const { muscle } = fresh('harnesssleepD');
  for (let i = 0; i < 505; i++) logTrace(muscle, `p${i}`, `r${i}`, 'chat');
  assert.equal(distillStats(muscle).pairs, 500);
});
