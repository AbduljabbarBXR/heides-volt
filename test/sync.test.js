import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { startNode, linkPeer, syncMarket } from '../src/mesh/index.js';
import { importSkill } from '../src/skills/index.js';
import { denyOrigin } from '../src/skills/trust.js';
import { publishSkill } from '../src/skills/market.js';
import { daemonLoop } from '../src/sched/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

const brain = { complete: async (text) => ({ text: `mock understood: ${text}`, tool: 'chat' }) };

function importerFor(b) {
  return (entry, envelope) => {
    const file = join(b.dir, `sync-${entry.name}.skill.json`);
    writeFileSync(file, JSON.stringify(envelope), 'utf8');
    return importSkill(b.muscle, b.dir, file);
  };
}

test('sync pulls peer shelf into muscle', async (t) => {
  const a = fresh('harnesssyncA');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());

  const b = fresh('harnesssyncB');
  await linkPeer(b.muscle, b.store, '127.0.0.1', node.port);
  const res = await syncMarket(b.muscle, b.store, '127.0.0.1', node.port, importerFor(b));
  assert.equal(res.total, 1);
  assert.equal(res.imported, 1);
  assert.equal(res.refused, 0);
  assert(b.muscle.store.data.routes.scan);
});

test('sync honors deny list', async (t) => {
  const a = fresh('harnesssyncC');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());

  const b = fresh('harnesssyncD');
  await linkPeer(b.muscle, b.store, '127.0.0.1', node.port);
  denyOrigin(b.store, a.store.data.market[0].origin);
  const res = await syncMarket(b.muscle, b.store, '127.0.0.1', node.port, importerFor(b));
  assert.equal(res.imported, 0);
  assert.equal(res.refused, 1);
});

test('sync against empty shelf imports nothing', async (t) => {
  const a = fresh('harnesssyncE');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());
  const b = fresh('harnesssyncF');
  await linkPeer(b.muscle, b.store, '127.0.0.1', node.port);
  const res = await syncMarket(b.muscle, b.store, '127.0.0.1', node.port, importerFor(b));
  assert.equal(res.total, 0);
  assert.equal(res.imported, 0);
});

test('daemon ticks curiosity and sleeps on schedule', async () => {
  const { muscle } = fresh('harnessdaemonA');
  const lines = [];
  const stop = daemonLoop({ muscle, brain, watchMs: 30, sleepEvery: 2, cwd: '/tmp', say: (s) => lines.push(s) });
  await new Promise((r) => setTimeout(r, 200));
  stop();
  assert(lines.some((l) => l.startsWith('daemon tick')), `no ticks in ${JSON.stringify(lines)}`);
  assert(lines.some((l) => l.startsWith('daemon sleep')), `no sleep in ${JSON.stringify(lines)}`);
  const count = lines.length;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(lines.length, count);
});
