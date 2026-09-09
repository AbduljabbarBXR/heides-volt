import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { linkPeer, syncMarket } from '../mesh/index.js';
import { importSkill } from './index.js';

/**
 * skills/relays.js: the pull network.
 *
 * Pin a relay once, pull any time. pull walks every pinned
 * relay plus every known peer, links, syncs the shelf, imports
 * through trust. One command keeps a whole shelf fresh across
 * all your devices.
 */

export function relays(store) {
  if (!Array.isArray(store.data.relays)) store.data.relays = [];
  return store.data.relays;
}

export function pinRelay(store, host, port, code = null) {
  const list = relays(store);
  const known = list.find((r) => r.host === host && Number(r.port) === Number(port));
  const entry = { host, port: Number(port), code: code || null };
  if (known) Object.assign(known, entry);
  else list.push(entry);
  store.data.relays = list;
  store.save();
  return { ok: true, note: 'relay pinned' };
}

export function unpinRelay(store, host, port) {
  const list = relays(store);
  store.data.relays = list.filter((r) => !(r.host === host && Number(r.port) === Number(port)));
  store.save();
  return { ok: true, note: 'relay unpinned' };
}

export async function pullAll(muscle, store) {
  const targets = [];
  for (const r of relays(store)) targets.push({ host: r.host, port: r.port, code: r.code || null });
  for (const p of store.data.peers || []) {
    if (!targets.some((t) => t.host === p.host && Number(t.port) === Number(p.port))) {
      targets.push({ host: p.host, port: p.port, code: p.code || null });
    }
  }
  let imported = 0;
  let refused = 0;
  let reached = 0;
  for (const t of targets) {
    try {
      await linkPeer(muscle, store, t.host, t.port, t.code || process.env.HARNESS_PAIR_CODE || null);
      const res = await syncMarket(muscle, store, t.host, t.port, (entry, envelope) => {
        const dir = tmpdir();
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `pull-${Date.now()}-${entry.name}.skill.json`);
        writeFileSync(file, JSON.stringify(envelope), 'utf8');
        return importSkill(muscle, store.dir, file);
      });
      reached += 1;
      imported += res.imported;
      refused += res.refused;
    } catch (e) {
      refused += 1;
    }
  }
  return { reached, imported, refused, targets: targets.length };
}
