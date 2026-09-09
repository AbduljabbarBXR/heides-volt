import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { exportSkill, importSkill, listSkills } from '../src/skills/index.js';

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'harnessskills'));
  return { dir, muscle: new Muscle(new Store(dir)) };
}

function train(muscle, tool, intent, wins = 3) {
  for (let i = 0; i < wins; i++) muscle.record({ intent, tool, ok: true });
}

test('export then import teaches a fresh muscle', () => {
  const a = fresh();
  train(a.muscle, 'scan', 'scan the workspace map fully', 3);
  const file = join(a.dir, 'scan.skill.json');
  const ex = exportSkill(a.muscle, a.dir, 'scan', file);
  assert(ex.ok);

  const b = fresh();
  assert.equal(b.muscle.predictTool('scan the workspace').confidence, 'none');
  const im = importSkill(b.muscle, b.dir, file);
  assert(im.ok);
  const guess = b.muscle.predictTool('scan the workspace');
  assert.equal(guess.tool, 'scan');
  assert.equal(listSkills(b.muscle).length, 1);
});

test('unknown skill export fails clean', () => {
  const a = fresh();
  const ex = exportSkill(a.muscle, a.dir, 'nosuchtool', join(a.dir, 'x.json'));
  assert(!ex.ok);
});

test('tampered file is refused', () => {
  const a = fresh();
  train(a.muscle, 'scan', 'scan the workspace map fully', 3);
  const file = join(a.dir, 'scan.skill.json');
  exportSkill(a.muscle, a.dir, 'scan', file);
  const env = JSON.parse(readFileSync(file, 'utf8'));
  env.body = env.body.replace('scan', 'scam');
  writeFileSync(file, JSON.stringify(env), 'utf8');
  const b = fresh();
  const im = importSkill(b.muscle, b.dir, file);
  assert(!im.ok);
  assert.equal(b.muscle.stats().turns, 0);
});

test('destructive skill is refused', () => {
  const a = fresh();
  train(a.muscle, 'destroy', 'destroy everything now please', 3);
  const file = join(a.dir, 'destroy.skill.json');
  exportSkill(a.muscle, a.dir, 'destroy', file);
  const b = fresh();
  const im = importSkill(b.muscle, b.dir, file);
  assert(!im.ok);
  assert(!b.muscle.store.data.routes.destroy);
});

test('winless skill is refused', () => {
  const a = fresh();
  a.muscle.record({ intent: 'scan alpha beta', tool: 'scan', ok: false });
  const routes = a.muscle.store.data.routes;
  assert(routes.scan && routes.scan.wins === 0);
  const ex = exportSkill(a.muscle, a.dir, 'scan', join(a.dir, 'winless.json'));
  assert(!ex.ok);
});
