/**
 * skills/trust.js: who may teach this muscle.
 *
 * Deny list blocks origins outright. Quorum holds reward until
 * enough distinct origins vouch for one tool. Revoke rolls back
 * every win and reward merged from one fingerprint.
 */

export function policy(store) {
  const t = store.data.trust || {};
  return {
    allowed: t.allowed || [],
    denied: t.denied || [],
    quorum: t.quorum && t.quorum >= 1 ? t.quorum : 1,
  };
}

function savePolicy(store, p) {
  store.data.trust = p;
  store.save();
}

export function allowOrigin(store, fp) {
  const p = policy(store);
  if (!p.allowed.includes(fp)) p.allowed.push(fp);
  p.denied = p.denied.filter((x) => x !== fp);
  savePolicy(store, p);
  return { ok: true, note: 'origin allowed' };
}

export function denyOrigin(store, fp) {
  const p = policy(store);
  if (!p.denied.includes(fp)) p.denied.push(fp);
  p.allowed = p.allowed.filter((x) => x !== fp);
  savePolicy(store, p);
  return { ok: true, note: 'origin denied' };
}

export function setQuorum(store, n) {
  const p = policy(store);
  p.quorum = Math.max(1, Math.floor(Number(n) || 1));
  savePolicy(store, p);
  return { ok: true, note: `quorum set to ${p.quorum}` };
}

export function revokeOrigin(muscle, fp) {
  const routes = muscle.store.data.routes;
  let touched = 0;
  for (const [tool, entry] of Object.entries(routes)) {
    const src = (entry.sources || {})[fp];
    if (!src) continue;
    entry.wins = Math.max(0, (entry.wins || 0) - src.wins);
    entry.reward = (entry.reward || 0) - (src.granted || 0);
    entry.held = Math.max(0, (entry.held || 0) - (src.held || 0));
    delete entry.sources[fp];
    touched += 1;
    if (!entry.local && entry.wins <= 0 && Object.keys(entry.sources || {}).length === 0) {
      delete routes[tool];
    }
  }
  if (muscle.store.data.origins) delete muscle.store.data.origins[fp];
  const rep = repute(muscle.store);
  const entry = rep[fp] || { imports: 0, fails: 0, revokes: 0 };
  entry.revokes += 1;
  rep[fp] = entry;
  let quarantined = '';
  const pol = policy(muscle.store);
  if (entry.revokes >= 2 && !pol.denied.includes(fp)) {
    pol.denied.push(fp);
    pol.allowed = pol.allowed.filter((x) => x !== fp);
    savePolicy(muscle.store, pol);
    quarantined = ', origin quarantined';
  }
  muscle.store.save();
  return { ok: true, note: `revoked ${touched} route(s)${quarantined}` };
}

export function repute(store) {
  if (!store.data.repute || typeof store.data.repute !== 'object') store.data.repute = {};
  return store.data.repute;
}

export function noteImport(store, fp, ok) {
  const rep = repute(store);
  const entry = rep[fp] || { imports: 0, fails: 0, revokes: 0 };
  if (ok) entry.imports += 1;
  else entry.fails += 1;
  rep[fp] = entry;
  store.save();
}

export function trustReport(store) {
  const p = policy(store);
  const origins = store.data.origins || {};
  return { quorum: p.quorum, allowed: p.allowed, denied: p.denied, origins, repute: repute(store) };
}
