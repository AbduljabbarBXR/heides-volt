import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'harness');

// Every command below must work with zero network and zero keys.
// Provider and search paths are excluded on purpose: they need
// the outside world by definition.
const CASES = [
  ['help', 0],
  ['version', 0],
  ['doctor', 0],
  ['remember', 'offline', 'audit', 'fact', 0],
  ['recall', 'offline', 0],
  ['stats', 0],
  ['curious', 0],
  ['skills', 0],
  ['trust', 0],
  ['market', 0],
  ['peers', 0],
  ['relays', 0],
  ['boot', 0],
  ['verify', 0],
  ['prune', 0],
  ['adapter', 0],
];

for (const args of CASES) {
  const want = args[args.length - 1];
  const cmd = args.slice(0, -1);
  test(`offline: harness ${cmd[0] || 'help'} exits ${want}`, () => {
    const home = mkdtempSync(join(tmpdir(), 'harnessoffline'));
    const env = { ...process.env, HOME: home };
    for (const k of Object.keys(env)) {
      if (/KEY|TOKEN|PROVIDER|SEARCH/i.test(k)) delete env[k];
    }
    const out = execFileSync('node', [BIN, ...cmd], { encoding: 'utf8', timeout: 30000, env });
    assert(typeof out === 'string');
  });
}
