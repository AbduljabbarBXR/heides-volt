import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { deepCheck, stagedFile } from '../src/vessel/verify.js';
import { attempt } from '../src/curiosity/index.js';

const savedPath = process.env.PATH;

function fakeHeides(script) {
  const dir = mkdtempSync(join(tmpdir(), 'harnessheides'));
  const file = join(dir, 'heides');
  writeFileSync(file, `#!/bin/sh\n${script}\n`, 'utf8');
  chmodSync(file, 0o755);
  process.env.PATH = `${dir}:${savedPath}`;
  return dir;
}

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'harnessverify'));
  return new Muscle(new Store(dir));
}

test('red workspace blocks learning', () => {
  fakeHeides(`echo '[blocker] broken call at app.js:3'`);
  try {
    const deep = deepCheck('/tmp');
    assert(!deep.pass);
    assert.equal(deep.blockers, 1);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('green workspace passes', () => {
  fakeHeides(`echo '0 blocker(s), 0 critical'`);
  try {
    const deep = deepCheck('/tmp');
    assert(deep.pass);
    assert.match(deep.note, /green/);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('curiosity drops attempt on red workspace', async () => {
  fakeHeides(`echo '[critical] taint at app.js:9'`);
  try {
    const m = fresh();
    const brain = { complete: async () => ({ text: 'ok', tool: 'chat' }) };
    const res = await attempt(m, brain, { target: 'memory', practice: 'gather one fact' }, { cwd: '/tmp' });
    assert(!res.kept);
    assert.equal(m.stats().turns, 0);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('staged passes heides verdict through', () => {
  fakeHeides(`echo 'patch is safe to apply'`);
  try {
    const res = stagedFile('/tmp/x.patch', '/tmp');
    assert(res.ok);
    assert.match(res.output, /safe/);
  } finally {
    process.env.PATH = savedPath;
  }
});

test('absent heides falls back to local verdict', () => {
  process.env.PATH = '/nonexistent-path-xyz';
  try {
    const deep = deepCheck('/tmp');
    assert(deep.pass);
    const staged = stagedFile('/tmp/x.patch', '/tmp');
    assert(!staged.ok);
  } finally {
    process.env.PATH = savedPath;
  }
});
