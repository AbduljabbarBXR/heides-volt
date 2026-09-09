import { writeFileSync } from 'node:fs';

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
  const byTool = {};
  for (const t of traces) byTool[t.tool || 'chat'] = (byTool[t.tool || 'chat'] || 0) + 1;
  return { pairs: traces.length, byTool };
}

export function exportDistill(muscle, file = 'distill.jsonl') {
  const traces = muscle.store.data.traces || [];
  const lines = traces.map((t) => JSON.stringify({ prompt: t.prompt, completion: t.reply, tool: t.tool || 'chat' }));
  writeFileSync(file, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf8');
  return { ok: true, note: `wrote ${lines.length} pair(s)`, file, pairs: lines.length };
}
