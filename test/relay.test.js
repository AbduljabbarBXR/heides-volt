import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { startNode } from '../src/mesh/index.js';
import { publishSkill } from '../src/skills/market.js';
import { pinRelay, unpinRelay, relays, pullAll } from '../src/skills/relays.js';
import { detectPlatform, unitContent, plistContent, termuxContent, cronLine, bootTarget, installBoot } from '../src/boot/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

const brain = { complete: async (text) => ({ text: `mock understood: ${text}`, tool: 'chat' }) };

test('pull imports from pinned relay shelf', async (t) => {
  const a = fresh('harnessrelayA');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());

  const b = fresh('harnessrelayB');
  pinRelay(b.store, '127.0.0.1', node.port);
  assert.equal(relays(b.store).length, 1);
  const res = await pullAll(b.muscle, b.store);
  assert.equal(res.targets, 1);
  assert.equal(res.reached, 1);
  assert.equal(res.imported, 1);
  assert(b.muscle.store.data.routes.scan);
  unpinRelay(b.store, '127.0.0.1', node.port);
  assert.equal(relays(b.store).length, 0);
});

test('pull with dead relay counts refused', async () => {
  const b = fresh('harnessrelayC');
  pinRelay(b.store, '127.0.0.1', 1);
  const res = await pullAll(b.muscle, b.store);
  assert.equal(res.reached, 0);
  assert.equal(res.refused, 1);
});

test('boot recipes render per platform', () => {
  assert.match(unitContent('node x daemon 60 60'), /WantedBy/);
  assert.match(plistContent('node x daemon 60 60'), /LaunchAgents|com\.heidesharness/);
  assert.match(termuxContent('node x daemon 60 60'), /Termux:Boot/);
  assert.match(cronLine('node x daemon 60 60'), /@reboot/);
  assert(bootTarget('linux', '/home/u').endsWith('heidesharness.service'));
  assert(bootTarget('macos', '/home/u').endsWith('.plist'));
  assert(bootTarget('termux', '/home/u').includes('.termux'));
  assert.equal(bootTarget('windows', '/home/u'), null);
  assert(['linux', 'macos', 'termux', 'windows'].includes(detectPlatform()));
});

test('boot install writes recipe file', () => {
  const home = mkdtempSync(join(tmpdir(), 'harnessboot'));
  const res = installBoot({ kind: 'linux', home, bin: 'node /opt/harness/bin/harness' });
  assert(res.ok);
  assert(res.target.includes(home));
  const res2 = installBoot({ kind: 'windows', home, bin: 'x' });
  assert(!res2.ok);
});
