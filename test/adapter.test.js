import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { sleepCycle } from '../src/sleep/index.js';
import { trainAdapter, rollbackAdapter } from '../src/sleep/reference.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

function seed(muscle) {
  const pairs = [
    ['scan the workspace map fully now', 'scan'],
    ['scan every file for callers today', 'scan'],
    ['scan imports across the repo daily', 'scan'],
    ['check the code for danger signs', 'check'],
    ['review this patch for breakage soon', 'check'],
    ['check lint output before commit', 'check'],
    ['scan the map again tomorrow', 'scan'],
    ['check danger signs tonight', 'check'],
  ];
  for (const [prompt, tool] of pairs) {
    const traces = muscle.store.data.traces || [];
    traces.push({ prompt, reply: `${tool} reply`, tool });
    muscle.store.data.traces = traces;
  }
  muscle.store.save();
}

test('reference trainer promotes on green eval', () => {
  const { dir, muscle } = fresh('harnessrefA');
  seed(muscle);
  const res = sleepCycle(muscle, { outDir: join(dir, 's') });
  assert(res.promoted);
  assert.match(res.note, /promoted adapter/);
  assert(muscle.store.data.activeAdapter);
  assert.equal(muscle.store.data.promotions.length, 1);
});

test('adapter bonus lifts the right tool', () => {
  const { muscle } = fresh('harnessrefB');
  seed(muscle);
  sleepCycle(muscle, { outDir: join(muscle.store.dir, 's') });
  const guess = muscle.predictTool('scan callers in every file');
  assert.equal(guess.tool, 'scan');
});

test('rollback restores previous adapter', () => {
  const { muscle } = fresh('harnessrefC');
  assert(!rollbackAdapter(muscle).ok);
  seed(muscle);
  sleepCycle(muscle, { outDir: join(muscle.store.dir, 's1') });
  const first = muscle.store.data.activeAdapter.at;
  const traces = muscle.store.data.traces || [];
  traces.push({ prompt: 'scan the map once more', reply: 'scan reply', tool: 'scan' });
  traces.push({ prompt: 'check danger signs again', reply: 'check reply', tool: 'check' });
  muscle.store.data.traces = traces;
  muscle.store.save();
  sleepCycle(muscle, { outDir: join(muscle.store.dir, 's2') });
  const rb = rollbackAdapter(muscle);
  assert(rb.ok);
  assert.equal(muscle.store.data.activeAdapter.at, first);
});

test('thin data keeps old weights', () => {
  const { dir, muscle } = fresh('harnessrefD');
  const traces = [{ prompt: 'only pair here', reply: 'r', tool: 'chat' }];
  muscle.store.data.traces = traces;
  muscle.store.save();
  const trained = trainAdapter(traces);
  assert(!trained.ok);
  const res = sleepCycle(muscle, { outDir: join(dir, 's') });
  assert(!res.promoted);
});
