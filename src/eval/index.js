/**
 * eval/index.js: golden tasks prove the resident learns.
 *
 * Fixed inputs with known tools run through predictTool with
 * zero recording, so evals never train. History keeps the last
 * 20 scores plus trend against the previous run.
 */

export const GOLDENS = [
  { input: 'scan the workspace map fully', tool: 'scan' },
  { input: 'map every caller of runTask', tool: 'scan' },
  { input: 'check this patch for breakage', tool: 'check' },
  { input: 'review code for danger signs', tool: 'check' },
  { input: 'remember the release date', tool: 'remember' },
  { input: 'recall the project codename', tool: 'recall' },
];

export function runEval(muscle) {
  let score = 0;
  for (const g of GOLDENS) {
    try {
      if (muscle.predictTool(g.input).tool === g.tool) score += 1;
    } catch {
      /* a broken predictor scores zero for that task */
    }
  }
  const history = muscle.store.data.evals || [];
  const prev = history.length > 0 ? history[history.length - 1].score : null;
  history.push({ at: Date.now(), score, total: GOLDENS.length });
  while (history.length > 20) history.shift();
  muscle.store.data.evals = history;
  muscle.store.save();
  const trend = prev === null ? 'first' : score > prev ? 'up' : score < prev ? 'down' : 'same';
  return { score, total: GOLDENS.length, trend };
}
