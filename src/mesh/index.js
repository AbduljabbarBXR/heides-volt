import { createServer, createConnection } from 'node:net';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { runTurn, logTrace } from '../vessel/index.js';
import { listSkills } from '../skills/index.js';
import { describeBrain } from '../brain/index.js';

/**
 * mesh/index.js: task parallelism across devices.
 *
 * One node serves turns to linked peers over plain TCP with
 * newline delimited JSON. No daemons, no accounts, no cloud.
 * Default bind is loopback. Point HOST at LAN only if you
 * trust the network, the wire carries plain text in v1.
 *
 * Serving side always runs the verify gate inside runTurn,
 * so a peer can never make your node run a denied tool.
 * Requesting side records the delegated outcome in its own
 * muscle, so use keeps teaching even across the wire.
 */

export function nodeId() {
  return randomBytes(4).toString('hex');
}

export function codesMatch(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function sealCaps(caps, code) {
  const salt = randomBytes(8);
  const key = scryptSync(String(code), salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(caps), 'utf8'), cipher.final()]);
  return { salt: salt.toString('hex'), iv: iv.toString('hex'), data: data.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}

export function unsealCaps(sealed, code) {
  const key = scryptSync(String(code), Buffer.from(sealed.salt, 'hex'), 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, 'hex')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function advertise(muscle, id) {
  return {
    id,
    skills: listSkills(muscle).map((s) => s.tool),
    brain: describeBrain(),
    ts: Date.now(),
  };
}

export function sendOnce(host, port, msg, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(val);
    };
    const sock = createConnection({ host, port: Number(port) }, () => {
      sock.write(JSON.stringify(msg) + '\n');
    });
    let buf = '';
    const timer = setTimeout(() => {
      sock.destroy();
      finish(reject, new Error('peer timeout'));
    }, timeoutMs);
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      const i = buf.indexOf('\n');
      if (i >= 0) {
        const line = buf.slice(0, i);
        sock.end();
        try {
          finish(resolve, JSON.parse(line));
        } catch (e) {
          finish(reject, e);
        }
      }
    });
    sock.on('error', (e) => finish(reject, e));
  });
}

export async function startNode({ muscle, brain, port = 0, host = '127.0.0.1', pairCode = null, store = null }) {
  const id = nodeId();
  const peers = new Map();

  async function handleMsg(msg, socket) {
    const send = (obj) => socket.write(JSON.stringify(obj) + '\n');
    if (!msg || !msg.type) {
      send({ type: 'error', note: 'bad message ignored' });
      return;
    }
    if (pairCode && !codesMatch(msg.code, pairCode)) {
      send({ type: 'error', note: 'pair code refused' });
      return;
    }
    if (msg.type === 'hello') {
      if (msg.caps && msg.caps.id) peers.set(msg.caps.id, { caps: msg.caps });
      const caps = advertise(muscle, id);
      const welcome = { type: 'welcome', caps };
      if (pairCode) welcome.sealed = sealCaps(caps, pairCode);
      send(welcome);
      return;
    }
    if (msg.type === 'delegate') {
      const res = await runTurn(String(msg.text || ''), { muscle, brain });
      send({ type: 'result', id: msg.id || null, reply: res.reply, path: res.path, tool: res.tool || null });
      return;
    }
    if (msg.type === 'shelf') {
      if (!store) {
        send({ type: 'error', note: 'no shelf here' });
        return;
      }
      const { liveShelf } = await import('../skills/market.js');
      send({ type: 'shelf', entries: liveShelf(store).map((e) => ({ name: e.name, tool: e.tool, origin: e.origin })) });
      return;
    }
    if (msg.type === 'digest') {
      if (!store) {
        send({ type: 'error', note: 'no shelf here' });
        return;
      }
      const { shelfDigest } = await import('../skills/market.js');
      send({ type: 'digest', entries: shelfDigest(store) });
      return;
    }
    if (msg.type === 'want') {
      if (!store) {
        send({ type: 'error', note: 'no shelf here' });
        return;
      }
      const { liveShelf } = await import('../skills/market.js');
      const entry = liveShelf(store).find((e) => e.name === String(msg.name || ''));
      if (!entry) {
        send({ type: 'error', note: 'unknown skill' });
        return;
      }
      try {
        const { readFileSync } = await import('node:fs');
        send({ type: 'skill', name: entry.name, envelope: JSON.parse(readFileSync(entry.file, 'utf8')) });
      } catch {
        send({ type: 'error', note: 'skill unreadable' });
      }
      return;
    }
    send({ type: 'error', note: 'unknown message ignored' });
  }

  const server = createServer((socket) => {
    let buf = '';
    socket.on('data', async (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          await handleMsg(JSON.parse(line), socket);
        } catch {
          socket.write(JSON.stringify({ type: 'error', note: 'bad json ignored' }) + '\n');
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(Number(port), host, resolve));
  const addr = server.address();
  return {
    id,
    host,
    port: typeof addr === 'object' ? addr.port : port,
    peers,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function linkPeer(muscle, store, host, port, code = null) {
  const res = await sendOnce(host, Number(port), { type: 'hello', caps: advertise(muscle, 'guest'), code });
  if (!res || res.type !== 'welcome') throw new Error((res && res.note) || 'peer refused hello');
  if (res.sealed) {
    try {
      unsealCaps(res.sealed, code);
    } catch {
      throw new Error('peer proof failed');
    }
  }
  const peers = store.data.peers || [];
  const known = peers.find((p) => p.host === host && Number(p.port) === Number(port));
  const entry = {
    host,
    port: Number(port),
    id: res.caps.id,
    skills: res.caps.skills || [],
    code: code || null,
    seen: Date.now(),
  };
  if (known) Object.assign(known, entry);
  else peers.push(entry);
  store.data.peers = peers;
  store.save();
  return res.caps;
}

function peerCode(store, host, port) {
  const peers = store.data.peers || [];
  const known = peers.find((p) => p.host === host && Number(p.port) === Number(port));
  return (known && known.code) || null;
}

export async function delegateTask(muscle, host, port, text, store = null) {
  const code = store ? peerCode(store, host, port) : null;
  const res = await sendOnce(host, Number(port), {
    type: 'delegate',
    id: nodeId(),
    text: String(text || ''),
    code,
  });
  if (!res || res.type !== 'result') throw new Error((res && res.note) || 'peer gave no result');
  muscle.record({ intent: String(text || ''), tool: res.tool || 'chat', ok: true });
  logTrace(muscle, String(text || ''), res.reply, res.tool || 'chat', 'peer');
  return res;
}

export async function syncMarket(muscle, store, host, port, importer) {
  const code = peerCode(store, host, port);
  const list = await sendOnce(host, Number(port), { type: 'shelf', code });
  if (!list || list.type !== 'shelf') throw new Error((list && list.note) || 'peer gave no shelf');
  let imported = 0;
  let refused = 0;
  for (const entry of list.entries || []) {
    const got = await sendOnce(host, Number(port), { type: 'want', name: entry.name, code });
    if (!got || got.type !== 'skill') {
      refused += 1;
      continue;
    }
    const res = importer(entry, got.envelope);
    if (res && res.ok) imported += 1;
    else refused += 1;
  }
  return { imported, refused, total: (list.entries || []).length };
}

export async function gossipMarket(muscle, store, host, port, importer) {
  const code = peerCode(store, host, port);
  const remote = await sendOnce(host, Number(port), { type: 'digest', code });
  if (!remote || remote.type !== 'digest') throw new Error((remote && remote.note) || 'peer gave no digest');
  const { liveShelf } = await import('../skills/market.js');
  const have = new Set(liveShelf(store).map((e) => `${e.name}@${e.origin}`));
  const missing = (remote.entries || []).filter((e) => !have.has(`${e.name}@${e.origin}`));
  let imported = 0;
  let refused = 0;
  for (const entry of missing) {
    const got = await sendOnce(host, Number(port), { type: 'want', name: entry.name, code });
    if (!got || got.type !== 'skill') {
      refused += 1;
      continue;
    }
    const res = importer(entry, got.envelope);
    if (res && res.ok) imported += 1;
    else refused += 1;
  }
  return { imported, refused, total: missing.length };
}
