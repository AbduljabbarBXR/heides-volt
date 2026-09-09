import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { startNode, linkPeer, delegateTask, sendOnce } from '../src/mesh/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

const brain = { complete: async (text) => ({ text: `mock understood: ${text}`, tool: 'chat' }) };

test('link swaps caps between two nodes', async (t) => {
  const a = fresh('harnessmeshA');
  const b = fresh('harnessmeshB');
  b.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  b.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  b.muscle.record({ intent: 'scan the workspace map fully', tool: 'scan', ok: true });
  const nodeB = await startNode({ muscle: b.muscle, brain, port: 0 });
  t.after(() => nodeB.close());
  const caps = await linkPeer(a.muscle, a.store, '127.0.0.1', nodeB.port);
  assert(caps.skills.includes('scan'));
  assert.equal(a.store.data.peers.length, 1);
});

test('delegate runs on peer and requester learns', async (t) => {
  const a = fresh('harnessmeshC');
  const b = fresh('harnessmeshD');
  const nodeB = await startNode({ muscle: b.muscle, brain, port: 0 });
  t.after(() => nodeB.close());
  const res = await delegateTask(a.muscle, '127.0.0.1', nodeB.port, 'scan the workspace map fully');
  assert(res.reply.length > 0);
  assert(a.muscle.store.data.routes.chat);
  assert(b.muscle.store.data.stats.turns >= 1);
});

test('garbage then hello on one socket stays alive', async (t) => {
  const b = fresh('harnessmeshE');
  const nodeB = await startNode({ muscle: b.muscle, brain, port: 0 });
  t.after(() => nodeB.close());
  const bad = await sendOnce('127.0.0.1', nodeB.port, { type: 'frobnicate' });
  assert.equal(bad.type, 'error');
  const caps = await linkPeer(b.muscle, b.store, '127.0.0.1', nodeB.port);
  assert(caps.id);
});

test('link to dead port rejects clean', async () => {
  const a = fresh('harnessmeshF');
  await assert.rejects(linkPeer(a.muscle, a.store, '127.0.0.1', 1));
  assert.equal(a.store.data.peers.length, 0);
});

test('destructive delegate fails verify on server', async (t) => {
  const a = fresh('harnessmeshG');
  const b = fresh('harnessmeshH');
  const evil = { complete: async () => ({ text: 'x', tool: 'destroy' }) };
  const nodeB = await startNode({ muscle: b.muscle, brain: evil, port: 0 });
  t.after(() => nodeB.close());
  const res = await delegateTask(a.muscle, '127.0.0.1', nodeB.port, 'anything at all');
  assert.match(res.reply, /failed verify/);
});
