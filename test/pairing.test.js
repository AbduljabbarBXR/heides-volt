import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/muscle/store.js';
import { Muscle } from '../src/muscle/index.js';
import { startNode, linkPeer, delegateTask, sealCaps, unsealCaps, sendOnce } from '../src/mesh/index.js';

function fresh(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = new Store(dir);
  return { dir, store, muscle: new Muscle(store) };
}

const brain = { complete: async (text) => ({ text: `mock understood: ${text}`, tool: 'chat' }) };

test('sealed caps open only with right code', () => {
  const sealed = sealCaps({ id: 'x', skills: ['scan'] }, 'plum 42');
  assert.deepEqual(unsealCaps(sealed, 'plum 42'), { id: 'x', skills: ['scan'] });
  assert.throws(() => unsealCaps(sealed, 'wrong code'), Error);
  const broken = { ...sealed, data: sealed.data.replace(/^../, 'ff') };
  assert.throws(() => unsealCaps(broken, 'plum 42'), Error);
});

test('locked node refuses codeless hello', async (t) => {
  const b = fresh('harneshpairA');
  const node = await startNode({ muscle: b.muscle, brain, port: 0, pairCode: 'plum 42' });
  t.after(() => node.close());
  const res = await sendOnce('127.0.0.1', node.port, { type: 'hello', caps: { id: 'guest' } });
  assert.equal(res.type, 'error');
  assert.match(res.note, /pair code refused/);
});

test('locked node accepts right code and proves sealed caps', async (t) => {
  const a = fresh('harneshpairB');
  const b = fresh('harneshpairC');
  const node = await startNode({ muscle: b.muscle, brain, port: 0, pairCode: 'plum 42' });
  t.after(() => node.close());
  const caps = await linkPeer(a.muscle, a.store, '127.0.0.1', node.port, 'plum 42');
  assert(caps.id);
  const peers = a.store.data.peers;
  assert.equal(peers[0].code, 'plum 42');
});

test('locked delegate needs stored code', async (t) => {
  const a = fresh('harneshpairD');
  const b = fresh('harneshpairE');
  const node = await startNode({ muscle: b.muscle, brain, port: 0, pairCode: 'plum 42' });
  t.after(() => node.close());
  await assert.rejects(delegateTask(a.muscle, '127.0.0.1', node.port, 'hi there', a.store), /pair code refused/);
  assert.equal(b.muscle.store.data.stats.turns, 0);
  await linkPeer(a.muscle, a.store, '127.0.0.1', node.port, 'plum 42');
  const res = await delegateTask(a.muscle, '127.0.0.1', node.port, 'hi there', a.store);
  assert(res.reply.length > 0);
  assert.equal(b.muscle.store.data.stats.turns, 1);
});

test('open node still works codeless', async (t) => {
  const a = fresh('harneshpairF');
  const b = fresh('harneshpairG');
  const node = await startNode({ muscle: b.muscle, brain, port: 0 });
  t.after(() => node.close());
  const caps = await linkPeer(a.muscle, a.store, '127.0.0.1', node.port);
  assert(caps.id);
});
