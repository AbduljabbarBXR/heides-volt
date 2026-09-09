import { tokens } from '../muscle/index.js';

/**
 * sleep/reference.js: the trainer that runs anywhere.
 *
 * Heavy iron trains LoRA overnight. This reference trainer runs
 * on the phone itself in milliseconds: supervised token weights
 * per tool, log odds with smoothing, held out eval, promote only
 * on green. The muscle adds adapter bonus in predictTool, capped
 * so verified rewards always dominate. Swap it by setting
 * HARNESS_TRAINER to any executable honoring the same JSON
 * contract when you have bigger iron.
 */

export function trainAdapter(traces) {
  const data = (traces || [])
    .filter((t) => (t.prov || 'local') === 'local')
    .map((t) => ({ toks: tokens(t.prompt), tool: t.tool || 'chat' }));
  if (data.length < 4) return { ok: false, note: 'too few pairs, kept old weights' };
  const cut = Math.max(1, Math.floor(data.length * 0.8));
  const train = data.slice(0, cut);
  const held = data.slice(cut);
  const tools = [...new Set(train.map((t) => t.tool))];
  const inTool = {};
  const outTool = {};
  for (const t of train) {
    inTool[t.tool] = inTool[t.tool] || {};
    for (const tok of new Set(t.toks)) inTool[t.tool][tok] = (inTool[t.tool][tok] || 0) + 1;
    for (const other of tools) {
      if (other === t.tool) continue;
      outTool[other] = outTool[other] || {};
      for (const tok of new Set(t.toks)) outTool[other][tok] = (outTool[other][tok] || 0) + 1;
    }
  }
  const weights = {};
  for (const tool of tools) {
    weights[tool] = {};
    const counts = {};
    for (const t of train) for (const tok of new Set(t.toks)) counts[tok] = (counts[tok] || 0) + 1;
    for (const tok of Object.keys(counts)) {
      const a = (inTool[tool][tok] || 0) + 0.5;
      const b = ((outTool[tool] || {})[tok] || 0) + 0.5;
      const w = Math.round(Math.log(a / b) * 100) / 100;
      if (w > 0.1) weights[tool][tok] = w;
    }
  }
  let hits = 0;
  for (const h of held) {
    let best = null;
    for (const tool of tools) {
      let s = 0;
      for (const tok of h.toks) s += (weights[tool] || {})[tok] || 0;
      if (!best || s > best.score) best = { tool, score: s };
    }
    if (best && best.tool === h.tool) hits += 1;
  }
  const acc = held.length > 0 ? hits / held.length : 0;
  const majority = {};
  for (const h of held) majority[h.tool] = (majority[h.tool] || 0) + 1;
  const baseline = held.length > 0 ? Math.max(...Object.values(majority)) / held.length : 0;
  return { ok: true, weights, tools, acc: Math.round(acc * 100) / 100, baseline: Math.round(baseline * 100) / 100, pairs: data.length };
}

export function adapterBonus(adapter, tool, toks) {
  if (!adapter || !adapter.weights) return 0;
  const w = adapter.weights[tool] || {};
  let s = 0;
  for (const tok of toks) s += w[tok] || 0;
  return Math.max(0, Math.min(2, Math.round(s * 100) / 100));
}

export function promoteAdapter(muscle, trained) {
  const prev = muscle.store.data.activeAdapter || null;
  if (prev) muscle.store.data.prevAdapter = prev;
  muscle.store.data.activeAdapter = { weights: trained.weights, tools: trained.tools, at: Date.now(), pairs: trained.pairs, score: trained.acc };
  const routes = muscle.store.data.routes;
  for (const tool of trained.tools) {
    if (!routes[tool]) {
      routes[tool] = { toks: Object.keys(trained.weights[tool] || {}), reward: 0, wins: 0, runs: 0 };
    }
  }
  const promos = muscle.store.data.promotions || [];
  promos.push({ at: Date.now(), pairs: trained.pairs, score: trained.acc, adapter: 'builtin' });
  muscle.store.data.promotions = promos;
  muscle.store.save();
  return { ok: true, promoted: true, note: `sleep promoted adapter at ${trained.acc} over baseline ${trained.baseline}` };
}

export function rollbackAdapter(muscle) {
  const prev = muscle.store.data.prevAdapter || null;
  if (!prev) return { ok: false, note: 'no previous adapter, nothing to roll back' };
  muscle.store.data.activeAdapter = prev;
  delete muscle.store.data.prevAdapter;
  muscle.store.save();
  return { ok: true, note: 'adapter rolled back' };
}
