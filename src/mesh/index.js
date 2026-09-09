import { createServer, createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { runTurn } from '../vessel/index.js';
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

export async function startNode({ muscle, brain, port = 0, host = '127.0.0.1' }) {
  const id = nodeId();
  const peers = new Map();

  async function handleMsg(msg, socket) {
    const send = (obj) => socket.write(JSON.stringify(obj) + '\n');
    if (!msg || !msg.type) {
      send({ type: 'error', note: 'bad message ignored' });
      return;
    }
    if (msg.type === 'hello') {
      if (msg.caps && msg.caps.id) peers.set(msg.caps.id, { caps: msg.caps });
      send({ type: 'welcome', caps: advertise(muscle, id) });
      return;
    }
    if (msg.type === 'delegate') {
      const res = await runTurn(String(msg.text || ''), { muscle, brain });
      send({ type: 'result', id: msg.id || null, reply: res.reply, path: res.path, tool: res.tool || null });
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

export async function linkPeer(muscle, store, host, port) {
  const res = await sendOnce(host, Number(port), { type: 'hello', caps: advertise(muscle, 'guest') });
  if (!res || res.type !== 'welcome') throw new Error('peer refused hello');
  const peers = store.data.peers || [];
  const known = peers.find((p) => p.host === host && Number(p.port) === Number(port));
  const entry = {
    host,
    port: Number(port),
    id: res.caps.id,
    skills: res.caps.skills || [],
    seen: Date.now(),
  };
  if (known) Object.assign(known, entry);
  else peers.push(entry);
  store.data.peers = peers;
  store.save();
  return res.caps;
}

export async function delegateTask(muscle, host, port, text) {
  const res = await sendOnce(host, Number(port), {
    type: 'delegate',
    id: nodeId(),
    text: String(text || ''),
  });
  if (!res || res.type !== 'result') throw new Error('peer gave no result');
  muscle.record({ intent: String(text || ''), tool: res.tool || 'chat', ok: true });
  return res;
}
