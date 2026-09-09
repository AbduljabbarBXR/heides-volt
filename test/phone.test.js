import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { watchLoop } from '../src/sched/index.js';
import { powerGate } from '../src/sched/power.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

test('corrupt main file falls back to backup', () => {
  const { dir } = fresh('harnessphoneA');
  const s1 = new Store(dir);
  const m1 = new Muscle(s1);
  m1.remember('ember engine runs onboard');
  s1.save();
  writeFileSync(join(dir, 'muscle.json'), '{{{broken', 'utf8');
  const s2 = new Store(dir);
  assert.equal(s2.recovered, 'backup');
  assert(s2.data.facts.some((f) => f.text === 'ember engine runs onboard'));
});

test('doubly corrupt store starts blank and says so', () => {
  const { dir } = fresh('harnessphoneB');
  writeFileSync(join(dir, 'muscle.json'), '{{{broken', 'utf8');
  writeFileSync(join(dir, 'muscle.json.bak'), '[[[broken', 'utf8');
  const s2 = new Store(dir);
  assert.equal(s2.recovered, 'blank');
  assert.equal(s2.data.facts.length, 0);
});

test('prune keeps hot facts and recent traces', () => {
  const { muscle } = fresh('harnessphoneC');
  for (let i = 0; i < 150; i++) {
    muscle.store.data.traces.push({ prompt: `p${i}`, reply: 'r', tool: 'chat' });
  }
  for (let i = 0; i < 400; i++) {
    muscle.store.data.facts.push({ text: `fact ${i}`, toks: [`fact${i}`], uses: i === 399 ? 50 : 0, reward: 0, seen: 1 });
  }
  muscle.store.save();
  const res = muscle.prune();
  assert.equal(res.traces, 50);
  assert.equal(res.facts, 100);
  assert(muscle.store.data.facts.some((f) => f.text === 'fact 399'));
});

test('power gate thresholds', () => {
  assert(powerGate(null).ok);
  assert(!powerGate({ pct: 10, charging: false, tempC: 30 }).ok);
  assert(powerGate({ pct: 10, charging: true, tempC: 30 }).ok);
  assert(powerGate({ pct: 80, charging: false, tempC: 30 }).ok);
  assert(!powerGate({ pct: 80, charging: false, tempC: 50 }).ok);
});

test('pause episode announces once then resumes', async () => {
  const { muscle } = fresh('harnessphoneD');
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  const lines = [];
  let calls = 0;
  const power = () => {
    calls += 1;
    if (calls <= 3) return { ok: false, note: 'paused: battery at 5 percent' };
    return { ok: true, note: 'power ok' };
  };
  const stop = watchLoop({ muscle, brain, intervalMs: 25, cwd: '/tmp', say: (s) => lines.push(s), power });
  await new Promise((r) => setTimeout(r, 160));
  stop();
  assert.equal(lines.filter((l) => l.startsWith('paused:')).length, 1);
  assert(lines.includes('power ok, resuming'));
  assert(lines.some((l) => l.startsWith('tick')));
});
