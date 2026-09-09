import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { exportSkill, importSkill } from './index.js';

/**
 * skills/market.js: named skill shelf.
 *
 * publish snapshots a proven route into the market shelf with
 * its signature intact. market lists the shelf. fetch imports
 * by name through the same trust gate as raw files, so deny
 * lists, quorum and revoke all still apply.
 */

export function marketDir(store) {
  const dir = join(store.dir, 'market');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function shelf(store) {
  if (!Array.isArray(store.data.market)) store.data.market = [];
  return store.data.market;
}

export function publishSkill(muscle, store, name, opts = {}) {
  const dir = marketDir(store);
  const file = join(dir, `${name}.skill.json`);
  const ex = exportSkill(muscle, store.dir, name, file);
  if (!ex.ok) return ex;
  const fp = JSON.parse(JSON.parse(readFileSync(file, 'utf8')).body).origin;
  const ttlMs = Number(opts.ttlMs || 30 * 24 * 3600 * 1000);
  const list = shelf(store).filter((e) => e.name !== name);
  list.push({ name, tool: name, file, origin: fp, added: Date.now(), expires: Date.now() + ttlMs });
  store.data.market = list;
  store.save();
  return { ok: true, note: `published ${name}` };
}

export function listMarket(store) {
  return shelf(store);
}

export function liveShelf(store, now = Date.now()) {
  return shelf(store).filter((e) => !e.expires || e.expires > now);
}

export function shelfDigest(store, now = Date.now()) {
  return liveShelf(store, now).map((e) => ({ name: e.name, origin: e.origin }));
}

export function fetchSkill(muscle, store, name) {
  const entry = liveShelf(store).find((e) => e.name === name);
  if (!entry) {
    const stale = shelf(store).find((e) => e.name === name);
    if (stale) return { ok: false, note: 'skill expired, republish first' };
    return { ok: false, note: 'unknown skill, see market' };
  }
  if (!existsSync(entry.file)) return { ok: false, note: 'skill file gone, republish first' };
  return importSkill(muscle, store.dir, entry.file);
}
