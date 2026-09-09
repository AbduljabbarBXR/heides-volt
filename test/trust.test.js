import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { exportSkill, importSkill } from '../src/skills/index.js';
import { allowOrigin, denyOrigin, setQuorum, revokeOrigin, trustReport } from '../src/skills/trust.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

function trainExport(src, tool, intent, file) {
  for (let i = 0; i < 3; i++) src.muscle.record({ intent, tool, ok: true });
  const ex = exportSkill(src.muscle, src.dir, tool, file);
  assert(ex.ok);
  const fp = JSON.parse(JSON.parse(readFileSync(file, 'utf8')).body).origin;
  return fp;
}

test('denied origin is refused', () => {
  const a = fresh('harnesstrustA');
  const fp = trainExport(a, 'scan', 'scan the workspace map fully', join(a.dir, 's.json'));
  const b = fresh('harnesstrustB');
  denyOrigin(b.store, fp);
  const im = importSkill(b.muscle, b.dir, join(a.dir, 's.json'));
  assert(!im.ok);
  assert.match(im.note, /denied/);
  assert.equal(Object.keys(b.muscle.store.data.routes).length, 0);
});

test('quorum holds reward until second origin vouches', () => {
  const a = fresh('harnesstrustC');
  const fpA = trainExport(a, 'scan', 'scan the workspace map fully', join(a.dir, 'a.json'));
  void fpA;
  const d = fresh('harnesstrustD');
  trainExport(d, 'scan', 'scan the workspace map fully', join(d.dir, 'd.json'));
  const b = fresh('harnesstrustE');
  setQuorum(b.store, 2);
  const first = importSkill(b.muscle, b.dir, join(a.dir, 'a.json'));
  assert(first.ok);
  assert.match(first.note, /quorum not met/);
  assert.equal(b.muscle.store.data.routes.scan.reward, 0);
  const second = importSkill(b.muscle, b.dir, join(d.dir, 'd.json'));
  assert(second.ok);
  assert(b.muscle.store.data.routes.scan.reward >= 2);
});

test('allowed origin bypasses quorum', () => {
  const a = fresh('harnesstrustF');
  const fp = trainExport(a, 'scan', 'scan the workspace map fully', join(a.dir, 's.json'));
  const b = fresh('harnesstrustG');
  setQuorum(b.store, 5);
  allowOrigin(b.store, fp);
  const im = importSkill(b.muscle, b.dir, join(a.dir, 's.json'));
  assert(im.ok);
  assert(b.muscle.store.data.routes.scan.reward > 0);
});

test('revoke rolls back merged wins', () => {
  const a = fresh('harnesstrustH');
  const fp = trainExport(a, 'scan', 'scan the workspace map fully', join(a.dir, 's.json'));
  const b = fresh('harnesstrustI');
  importSkill(b.muscle, b.dir, join(a.dir, 's.json'));
  assert(b.muscle.store.data.routes.scan);
  const rev = revokeOrigin(b.muscle, fp);
  assert.match(rev.note, /revoked 1/);
  assert(!b.muscle.store.data.routes.scan);
  assert.equal(Object.keys(trustReport(b.store).origins).length, 0);
});

test('revoke keeps local learning intact', () => {
  const a = fresh('harnesstrustJ');
  const fp = trainExport(a, 'scan', 'scan the workspace map fully', join(a.dir, 's.json'));
  const b = fresh('harnesstrustK');
  b.muscle.record({ intent: 'check the code please', tool: 'check', ok: true });
  importSkill(b.muscle, b.dir, join(a.dir, 's.json'));
  revokeOrigin(b.muscle, fp);
  assert(b.muscle.store.data.routes.check);
  assert(!b.muscle.store.data.routes.scan);
});
