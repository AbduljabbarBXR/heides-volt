import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync, sign, verify, createHash } from 'node:crypto';
import { verifyGate } from '../vessel/index.js';
import { policy } from './trust.js';

/**
 * skills/index.js: skills move, weights stay home.
 *
 * A skill is a 4KB signed JSON file: tool id, intent tokens,
 * verified win count, origin fingerprint. Export writes one.
 * Import merges one only if signature checks out, tool passes
 * the verify gate, and it carries real verified wins.
 * Tampered, destructive, or winless files are refused.
 */

export function localKeys(dir) {
  mkdirSync(dir, { recursive: true });
  const pubPath = join(dir, 'skill.pub');
  const privPath = join(dir, 'skill.priv');
  if (existsSync(pubPath) && existsSync(privPath)) {
    return { publicKey: readFileSync(pubPath, 'utf8'), privateKey: readFileSync(privPath, 'utf8') };
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  writeFileSync(pubPath, pubPem, 'utf8');
  writeFileSync(privPath, privPem, 'utf8');
  try {
    chmodSync(pubPath, 0o600);
    chmodSync(privPath, 0o600);
  } catch {
    /* best effort on odd platforms */
  }
  return { publicKey: pubPem, privateKey: privPem };
}

export function fingerprint(publicKey) {
  return createHash('sha256').update(String(publicKey)).digest('hex').slice(0, 16);
}

export function listSkills(muscle) {
  const routes = muscle.store.data.routes;
  return Object.entries(routes)
    .filter(([, info]) => info.wins > 0)
    .map(([tool, info]) => ({ tool, wins: info.wins, reward: info.reward }))
    .sort((a, b) => b.wins - a.wins);
}

export function exportSkill(muscle, storeDir, name, outFile = null) {
  const routes = muscle.store.data.routes;
  const info = routes[name];
  if (!info || info.wins <= 0) return { ok: false, note: 'unknown skill, see skills' };
  const keys = localKeys(storeDir);
  const skill = {
    kind: 'heidesharness skill',
    v: 1,
    name,
    tool: name,
    toks: info.toks,
    wins: info.wins,
    origin: fingerprint(keys.publicKey),
  };
  const body = JSON.stringify(skill);
  const sig = sign(null, Buffer.from(body), keys.privateKey).toString('hex');
  const envelope = JSON.stringify({ body, sig, pub: keys.publicKey }, null, 2);
  const file = outFile || `${name}.skill.json`;
  writeFileSync(file, envelope, 'utf8');
  return { ok: true, note: 'skill exported', file };
}

export function importSkill(muscle, storeDir, file) {
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, note: 'unreadable skill file, import refused' };
  }
  if (!envelope || !envelope.body || !envelope.sig || !envelope.pub) {
    return { ok: false, note: 'malformed skill file, import refused' };
  }
  let sigOk = false;
  try {
    sigOk = verify(null, Buffer.from(envelope.body), envelope.pub, Buffer.from(envelope.sig, 'hex'));
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, note: 'signature invalid, import refused' };
  let skill;
  try {
    skill = JSON.parse(envelope.body);
  } catch {
    return { ok: false, note: 'skill body broken, import refused' };
  }
  const verdict = verifyGate({ tool: skill.tool });
  if (!verdict.pass) return { ok: false, note: 'skill tool denied by policy, import refused' };
  if (!skill.wins || skill.wins < 1) return { ok: false, note: 'skill carries no verified wins, import refused' };
  const fp = skill.origin || 'unknown';
  const pol = policy(muscle.store);
  if (pol.denied.includes(fp)) return { ok: false, note: 'origin denied, import refused' };
  const routes = muscle.store.data.routes;
  const entry = routes[skill.tool] || { toks: [], reward: 0, wins: 0, runs: 0, held: 0, sources: {} };
  entry.sources = entry.sources || {};
  for (const tok of skill.toks || []) if (!entry.toks.includes(tok)) entry.toks.push(tok);
  const grant = Math.min(skill.wins, 2);
  const distinct = new Set([...Object.keys(entry.sources), fp]).size;
  entry.wins += skill.wins;
  entry.runs += skill.wins;
  let heldNote = '';
  if (pol.allowed.includes(fp) || distinct >= pol.quorum) {
    const released = entry.held || 0;
    entry.reward += released + grant;
    entry.held = 0;
    const prev = entry.sources[fp] || { wins: 0, granted: 0, held: 0 };
    entry.sources[fp] = { wins: prev.wins + skill.wins, granted: (prev.granted || 0) + grant + released, held: 0 };
  } else {
    entry.held = (entry.held || 0) + grant;
    const prev = entry.sources[fp] || { wins: 0, granted: 0, held: 0 };
    entry.sources[fp] = { wins: prev.wins + skill.wins, granted: prev.granted || 0, held: (prev.held || 0) + grant };
    heldNote = ', quorum not met, reward held';
  }
  routes[skill.tool] = entry;
  const data = muscle.store.data;
  data.origins = data.origins || {};
  data.origins[fp] = (data.origins[fp] || 0) + 1;
  muscle.store.save();
  return { ok: true, note: `skill imported: ${skill.tool}${heldNote}` };
}
