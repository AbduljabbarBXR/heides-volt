import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { startNode, gossipMarket } from '../src/mesh/index.js';
import { importSkill } from '../src/skills/index.js';
import { publishSkill, liveShelf } from '../src/skills/market.js';
import { revokeOrigin, trustReport } from '../src/skills/trust.js';
import { daemonLoop } from '../src/sched/index.js';
import { writeFileSync } from 'node:fs';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

const brain = { complete: async (text) => ({ text: `mock understood: ${text}`, tool: 'chat' }) };

function importerFor(b) {
  return (entry, envelope) => {
    const file = join(b.dir, `gossip-${entry.name}.skill.json`);
    writeFileSync(file, JSON.stringify(envelope), 'utf8');
    return importSkill(b.muscle, b.dir, file);
  };
}

test('gossip pulls only missing skills', async (t) => {
  const a = fresh('harnessgossipA');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());

  const b = fresh('harnessgossipB');
  const { linkPeer } = await import('../src/mesh/index.js');
  await linkPeer(b.muscle, b.store, '127.0.0.1', node.port);
  const first = await gossipMarket(b.muscle, b.store, '127.0.0.1', node.port, importerFor(b));
  assert.equal(first.total, 1);
  assert.equal(first.imported, 1);
  const second = await gossipMarket(b.muscle, b.store, '127.0.0.1', node.port, importerFor(b));
  assert.equal(second.total, 1);
  assert.equal(second.imported, 1);
});

test('expired shelf entries stay invisible', () => {
  const a = fresh('harnessgossipC');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan', { ttlMs: 1 });
  assert.equal(liveShelf(a.store, Date.now() + 100000).length, 0);
  const gone = a.muscle.prune(Date.now() + 100000);
  assert.equal(gone.shelf, 1);
  const res = a.muscle.prune();
  assert.equal(res.shelf, 0);
});

test('two revokes quarantine the origin', () => {
  const b = fresh('harnessgossipE');
  b.muscle.store.data.routes.scan = { toks: ['scan'], reward: 0, wins: 3, runs: 3, sources: { evilfp: { wins: 3, granted: 2, held: 0 } } };
  b.muscle.store.save();
  const r1 = revokeOrigin(b.muscle, 'evilfp');
  assert.match(r1.note, /revoked 1/);
  b.muscle.store.data.routes.scan = { toks: ['scan'], reward: 0, wins: 2, runs: 2, sources: { evilfp: { wins: 2, granted: 2, held: 0 } } };
  b.muscle.store.save();
  const r2 = revokeOrigin(b.muscle, 'evilfp');
  assert.match(r2.note, /quarantined/);
  assert(trustReport(b.store).denied.includes('evilfp'));
  assert.equal(trustReport(b.store).repute.evilfp.revokes, 2);
});

test('daemon gossip tick pulls on schedule', async (t) => {
  const a = fresh('harnessgossipF');
  for (let i = 0; i < 3; i++) a.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  publishSkill(a.muscle, a.store, 'scan');
  const node = await startNode({ muscle: a.muscle, brain, port: 0, store: a.store });
  t.after(() => node.close());

  const b = fresh('harnessgossipG');
  const { linkPeer } = await import('../src/mesh/index.js');
  await linkPeer(b.muscle, b.store, '127.0.0.1', node.port);
  const lines = [];
  const stop = daemonLoop({
    muscle: b.muscle, brain, watchMs: 30, sleepEvery: 1000, gossipEvery: 2, cwd: '/tmp',
    say: (s) => lines.push(s), power: () => ({ ok: true }),
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !lines.some((l) => l.startsWith('daemon gossip:'))) {
    await new Promise((r) => setTimeout(r, 50));
  }
  stop();
  assert(lines.some((l) => l.startsWith('daemon gossip:')), `no gossip in ${JSON.stringify(lines)}`);
  assert(b.muscle.store.data.routes.scan);
});
