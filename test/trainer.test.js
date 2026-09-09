import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TRAIN = join(here, '..', 'trainers', 'lora', 'train.py');

function run(args, extraEnv = {}) {
  return execFileSync('python3', [TRAIN, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, ...extraEnv },
  }).trim();
}

test('trainer check reports setup state', () => {
  const out = JSON.parse(run(['--check']));
  assert.equal(out.ok, true);
  assert(Array.isArray(out.missing));
});

test('trainer refuses thin datasets with contract json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnesstrainer'));
  const ds = join(dir, 'd.jsonl');
  writeFileSync(ds, '{"prompt":"a","completion":"b","tool":"chat"}\n', 'utf8');
  const out = JSON.parse(run([ds, join(dir, 'out')]));
  assert.equal(out.ok, false);
  assert.equal(out.evals_pass, false);
  assert.match(out.note, /too few pairs/);
});

test('trainer refuses unreadable dataset with contract json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnesstrainer'));
  const out = JSON.parse(run([join(dir, 'nope.jsonl'), join(dir, 'out')]));
  assert.equal(out.ok, false);
  assert.equal(out.evals_pass, false);
});

test('dataset labels mirror inputs minus padding', () => {
  const trainerDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'trainers', 'lora');
  const out = execFileSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(trainerDir)}); import train; enc = {'input_ids': [[1, 2, 0, 0]], 'attention_mask': [[1, 1, 0, 0]]}; print(train.with_labels(enc)['labels'])`],
    { encoding: 'utf8', timeout: 60000 }
  ).trim();
  assert.equal(out, '[[1, 2, -100, -100]]');
});
