import { adapterBonus } from '../sleep/reference.js';

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

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'than', 'then',
  'are', 'you', 'your', 'was', 'were', 'has', 'have', 'had', 'will',
  'would', 'all', 'any', 'our', 'out', 'about', 'into', 'over',
  'after', 'before', 'just', 'how', 'what', 'when', 'where', 'which',
  'who', 'why', 'not', 'but', 'they', 'them', 'their', 'there', 'here',
  'its', 'his', 'her', 'she', 'him', 'can', 'please', 'more', 'most',
  'other', 'such', 'only', 'also', 'very', 'too', 'keep', 'make',
]);

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
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

  remember(fact, prov = 'local') {
    const text = String(fact || '').trim();
    if (!text) return { ok: false, note: 'empty fact ignored' };
    const facts = this.store.data.facts;
    const found = facts.find((f) => f.text === text);
    if (found) {
      found.seen += 1;
      this.store.save();
      return { ok: true, note: 'fact already known, count raised' };
    }
    facts.push({ text, toks: tokens(text), uses: 0, reward: 0, seen: 1, prov });
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
    const adapter = this.store.data.activeAdapter || null;
    let best = null;
    for (const [tool, info] of Object.entries(this.store.data.routes)) {
      const hit = overlap(q, info.toks);
      const s = hit + info.reward + adapterBonus(adapter, tool, q);
      if (!best || s > best.score) best = { tool, score: s, hit };
    }
    if (best && best.hit >= 1 && best.score >= 3) return { tool: best.tool, confidence: 'high' };
    if (best && best.score >= 1) return { tool: best.tool, confidence: 'low' };
    return { tool: null, confidence: 'none' };
  }

  record({ intent, tool, ok }) {
    const t = String(tool || 'unknown');
    const entry = this.store.data.routes[t] || { toks: tokens(intent), reward: 0, wins: 0, runs: 0 };
    entry.local = true;
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

  prune(now = Date.now()) {
    const d = this.store.data;
    const tBefore = (d.traces || []).length;
    d.traces = (d.traces || []).slice(-100);
    const fBefore = d.facts.length;
    d.facts = d.facts
      .map((f) => ({ f, s: (f.uses || 0) + (f.reward || 0) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 300)
      .map((x) => x.f);
    d.recent = (d.recent || []).slice(-8);
    const mBefore = (d.market || []).length;
    d.market = (d.market || []).filter((e) => !e.expires || e.expires > now);
    this.store.save();
    return { traces: tBefore - d.traces.length, facts: fBefore - d.facts.length, shelf: mBefore - d.market.length };
  }

  macroSuggest() {
    const log = this.store.data.recent;
    if (log.length < 2) return null;
    const tail2 = log.slice(-2).join('>');
    for (const [key, count] of Object.entries(this.store.data.macros)) {
      if (count < 3) continue;
      const parts = key.split('>');
      if (parts.length === 3 && `${parts[0]}>${parts[1]}` === tail2) return parts[2];
    }
    return null;
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
    const prov = { local: 0, peer: 0, web: 0 };
    for (const f of d.facts) {
      const p = f.prov || 'local';
      if (prov[p] === undefined) prov[p] = 0;
      prov[p] += 1;
    }
    return {
      facts: d.facts.length,
      routes: Object.keys(d.routes).length,
      macros: Object.keys(d.macros).filter((k) => d.macros[k] >= 3).length,
      turns: d.stats.turns,
      recalls: d.stats.recalls,
      fastHits: d.stats.fastHits,
      prov,
    };
  }
}
