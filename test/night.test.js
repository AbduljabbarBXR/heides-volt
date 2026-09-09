import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { runTurn } from '../src/vessel/index.js';
import { sleepCycle } from '../src/sleep/index.js';
import { publishSkill, listMarket, fetchSkill } from '../src/skills/market.js';
import { denyOrigin } from '../src/skills/trust.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

function fakeTrainer(dir, payload) {
  const file = join(dir, 'trainer.sh');
  writeFileSync(file, `#!/bin/sh\necho '${JSON.stringify(payload)}'\n`, 'utf8');
  chmodSync(file, 0o755);
  return file;
}

function chain(m, rounds) {
  for (let r = 0; r < rounds; r++) {
    m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
    m.record({ intent: 'do check phase', tool: 'check', ok: true });
    m.record({ intent: 'do recall phase', tool: 'recall', ok: true });
  }
}

test('sleep with no trainer leaves dataset ready', () => {
  const { dir, muscle } = fresh('harnessnightA');
  muscle.record({ intent: 'alpha beta gamma delta', tool: 'scan', ok: true });
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  return runTurn('quiet zeta moon lamp', { muscle, brain }).then(() => {
    const res = sleepCycle(muscle, { outDir: join(dir, 'sleep') });
    assert(res.ok);
    assert(!res.promoted);
    assert.match(res.note, /dataset ready/);
  });
});

test('green evals promote, red evals keep old weights', () => {
  const a = fresh('harnessnightB');
  a.muscle.record({ intent: 'alpha beta gamma delta', tool: 'scan', ok: true });
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  return runTurn('quiet zeta moon lamp', { muscle: a.muscle, brain }).then(() => {
    const good = fakeTrainer(a.dir, { ok: true, evals_pass: true, score: 9, adapter: 'lora/r1' });
    const promoted = sleepCycle(a.muscle, { outDir: join(a.dir, 's1'), trainer: good });
    assert(promoted.promoted);
    assert.equal(a.muscle.store.data.promotions.length, 1);

    const b = fresh('harnessnightC');
    b.muscle.record({ intent: 'alpha beta gamma delta', tool: 'scan', ok: true });
    return runTurn('quiet zeta moon lamp', { muscle: b.muscle, brain }).then(() => {
      const bad = fakeTrainer(b.dir, { ok: true, evals_pass: false, score: 1 });
      const kept = sleepCycle(b.muscle, { outDir: join(b.dir, 's2'), trainer: bad });
      assert(!kept.promoted);
      assert.match(kept.note, /old weights/);
      assert(!b.muscle.store.data.promotions);
    });
  });
});

test('crashed trainer touches nothing', () => {
  const { dir, muscle } = fresh('harnessnightD');
  muscle.record({ intent: 'alpha beta gamma delta', tool: 'scan', ok: true });
  const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
  return runTurn('quiet zeta moon lamp', { muscle, brain }).then(() => {
    const res = sleepCycle(muscle, { outDir: join(dir, 's3'), trainer: '/nonexistent-trainer-xyz' });
    assert(!res.ok);
    assert.match(res.note, /untouched/);
  });
});

test('market fetch fails clean on gone file', () => {
  const a = fresh('harnessnightE');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  assert.equal(listMarket(a.store).length, 1);

  const b = fresh('harnessnightF');
  b.store.data.market = [{ name: 'scan', tool: 'scan', file: join(b.dir, 'missing.json'), origin: 'abc', added: 1 }];
  b.store.save();
  const fetched = fetchSkill(b.muscle, b.store, 'scan');
  assert(!fetched.ok);
  assert.match(fetched.note, /gone|unknown/);
  const unknown = fetchSkill(b.muscle, b.store, 'nosuch');
  assert(!unknown.ok);
});

test('market fetch merges through trust gate', () => {
  const a = fresh('harnessnightG');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');

  const b = fresh('harnessnightH');
  const entry = a.store.data.market[0];
  b.store.data.market = [{ ...entry, file: entry.file }];
  b.store.save();
  const fetched = fetchSkill(b.muscle, b.store, 'scan');
  assert(fetched.ok);
  assert.equal(b.muscle.predictTool('scan the workspace').tool, 'scan');

  const fp = entry.origin;
  denyOrigin(b.store, fp);
  const c = fresh('harnessnightI');
  c.store.data.market = [{ ...entry, file: entry.file }];
  c.store.save();
  denyOrigin(c.store, fp);
  const blocked = fetchSkill(c.muscle, c.store, 'scan');
  assert(!blocked.ok);
  assert.match(blocked.note, /denied/);
});

test('red deep gate stops macro fire', async () => {
  const m = fresh('harnessnightJ').muscle;
  chain(m, 3);
  m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
  m.record({ intent: 'do check phase', tool: 'check', ok: true });
  const brain = { complete: async () => ({ text: 'slow', tool: 'chat' }) };
  const red = await runTurn('something unrelated here', { muscle: m, brain, deepCheck: () => ({ pass: false }) });
  assert.notEqual(red.tool, 'recall');
  m.record({ intent: 'do scan phase', tool: 'scan', ok: true });
  m.record({ intent: 'do check phase', tool: 'check', ok: true });
  const green = await runTurn('something unrelated here', { muscle: m, brain, deepCheck: () => ({ pass: true }) });
  assert.equal(green.path, 'fast');
  assert.equal(green.tool, 'recall');
});
