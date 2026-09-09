/**
 * muscle/index.js: silent learner. tiny by design.
 *
 * Three learners live here:
 *  router: maps intent text to tool or skill id using token overlap
 *           weighted by past verified reward.
 *  recall: ranks stored facts by overlap plus use count plus reward.
 *  chains: compiles action sequences seen succeeding 3 plus times
 *           into one macro the fast path can fire.
 *
 * All state persists as plain JSON. Budget target is 50 MB.
 * Only verified outcomes may call record(). Unverified output
 * must never train the muscle.
 */

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2);
}

function overlap(a, b) {
  const setB = new Set(b);
  let n = 0;
  for (const t of a) if (setB.has(t)) n += 1;
  return n;
}

export class Muscle {
  constructor(store) {
    this.store = store;
  }

  remember(fact) {
    const text = String(fact || '').trim();
    if (!text) return { ok: false, note: 'empty fact ignored' };
    const facts = this.store.data.facts;
    const found = facts.find((f) => f.text === text);
    if (found) {
      found.seen += 1;
      this.store.save();
      return { ok: true, note: 'fact already known, count raised' };
    }
    facts.push({ text, toks: tokens(text), uses: 0, reward: 0, seen: 1 });
    this.store.save();
    return { ok: true, note: 'fact stored' };
  }

  recall(query, limit = 5) {
    const q = tokens(query);
    const scored = this.store.data.facts
      .map((f) => ({
        fact: f,
        score: overlap(q, f.toks) * 2 + f.reward + Math.min(f.uses, 5),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    for (const s of scored) s.fact.uses += 1;
    if (scored.length > 0) this.store.save();
    this.store.data.stats.recalls += 1;
    this.store.save();
    return scored.map((s) => s.fact.text);
  }

  predictTool(intent) {
    const q = tokens(intent);
    let best = null;
    for (const [tool, info] of Object.entries(this.store.data.routes)) {
      const s = overlap(q, info.toks) + info.reward;
      if (!best || s > best.score) best = { tool, score: s };
    }
    if (best && best.score >= 3) return { tool: best.tool, confidence: 'high' };
    if (best && best.score >= 1) return { tool: best.tool, confidence: 'low' };
    return { tool: null, confidence: 'none' };
  }

  record({ intent, tool, ok }) {
    const t = String(tool || 'unknown');
    const entry = this.store.data.routes[t] || { toks: tokens(intent), reward: 0, wins: 0, runs: 0 };
    entry.runs += 1;
    if (ok) {
      entry.wins += 1;
      entry.reward += 1;
      for (const tok of tokens(intent)) if (!entry.toks.includes(tok)) entry.toks.push(tok);
    } else {
      entry.reward -= 1;
    }
    this.store.data.routes[t] = entry;
    this.store.data.stats.turns += 1;
    this.store.save();
    this.compileChains(intent, tool, ok);
    return { ok: true, note: 'turn recorded' };
  }

  noteFastHit() {
    this.store.data.stats.fastHits += 1;
    this.store.save();
  }

  compileChains(intent, tool, ok) {
    if (!ok) return null;
    const log = this.store.data.recent;
    log.push(String(tool || 'unknown'));
    while (log.length > 8) log.shift();
    this.store.save();
    if (log.length < 3) return null;
    const tail = log.slice(-3).join('>');
    const macros = this.store.data.macros;
    macros[tail] = (macros[tail] || 0) + 1;
    this.store.save();
    if (macros[tail] === 3) return { macro: tail, note: 'chain compiled to macro' };
    return null;
  }

  stats() {
    const d = this.store.data;
    return {
      facts: d.facts.length,
      routes: Object.keys(d.routes).length,
      macros: Object.keys(d.macros).filter((k) => d.macros[k] >= 3).length,
      turns: d.stats.turns,
      recalls: d.stats.recalls,
      fastHits: d.stats.fastHits,
    };
  }
}
