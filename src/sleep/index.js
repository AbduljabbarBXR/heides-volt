import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { trainAdapter, promoteAdapter } from './reference.js';

/**
 * sleep/index.js: rest time growth.
 *
 * Phones cannot run backprop between turns, so weights grow at
 * rest instead. Every verified slow turn leaves a trace. distill
 * exports traces as JSONL pairs ready for LoRA sleep training:
 * train a small adapter on charger power, validate it, promote
 * it only on green evals, roll back otherwise. The harness owns
 * dataset plus gate. Any trainer that eats JSONL may do the math.
 */

export function distillStats(muscle) {
  const traces = muscle.store.data.traces || [];
  const local = traces.filter((t) => (t.prov || 'local') === 'local');
  const byTool = {};
  for (const t of local) byTool[t.tool || 'chat'] = (byTool[t.tool || 'chat'] || 0) + 1;
  return { pairs: local.length, skipped: traces.length - local.length, byTool };
}

export function exportDistill(muscle, file = 'distill.jsonl') {
  const traces = (muscle.store.data.traces || []).filter((t) => (t.prov || 'local') === 'local');
  const lines = traces.map((t) => JSON.stringify({ prompt: t.prompt, completion: t.reply, tool: t.tool || 'chat' }));
  writeFileSync(file, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf8');
  return { ok: true, note: `wrote ${lines.length} pair(s)`, file, pairs: lines.length };
}

/**
 * sleepCycle: one night of consolidation.
 *
 * Exports the dataset, hands it to the trainer executable named
 * by HARNESS_TRAINER (contract: trainer <dataset> <outdir> prints
 * one JSON line {ok, evals_pass, score, adapter}), promotes only
 * on green evals. No trainer means dataset ready and weights
 * untouched. Trainer crash means weights untouched.
 */
export function sleepCycle(muscle, opts = {}) {
  const stats = distillStats(muscle);
  if (stats.pairs === 0) return { ok: false, note: 'no traces yet, run turns first' };
  const outDir = opts.outDir || join(muscle.store.dir, 'sleep');
  mkdirSync(outDir, { recursive: true });
  const dataset = join(outDir, 'distill.jsonl');
  exportDistill(muscle, dataset);
  const trainer = opts.trainer !== undefined ? opts.trainer : process.env.HARNESS_TRAINER || 'builtin';
  if (trainer === 'builtin') {
    const trained = trainAdapter(muscle.store.data.traces || []);
    if (!trained.ok) return { ok: true, promoted: false, note: trained.note };
    if (trained.acc < trained.baseline) {
      return { ok: true, promoted: false, note: `sleep kept old weights at ${trained.acc} under baseline ${trained.baseline}` };
    }
    return promoteAdapter(muscle, trained);
  }
  let report;
  try {
    const out = execFileSync(trainer, [dataset, join(outDir, 'adapter')], {
      encoding: 'utf8',
      timeout: Number(opts.timeoutMs || 600000),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    report = JSON.parse(String(out).trim().split('\n').pop());
  } catch (e) {
    return { ok: false, promoted: false, note: 'trainer failed, weights untouched' };
  }
  if (!report || report.evals_pass !== true) {
    return { ok: true, promoted: false, note: 'sleep kept old weights, evals red' };
  }
  const promos = muscle.store.data.promotions || [];
  promos.push({ at: Date.now(), pairs: stats.pairs, score: report.score || 0, adapter: report.adapter || '' });
  muscle.store.data.promotions = promos;
  muscle.store.save();
  return { ok: true, promoted: true, note: 'sleep promoted adapter' };
}
