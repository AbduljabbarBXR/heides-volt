import { verifyGate } from '../vessel/index.js';

/**
 * curiosity/index.js: the drive. proposes what to learn next,
 * tries it sandboxed, keeps it only on verify pass.
 * Unverified attempts are discarded and teach nothing.
 */

export function propose(muscle) {
  const s = muscle.stats();
  const routes = muscle.store.data.routes;
  let weakest = null;
  for (const [tool, info] of Object.entries(routes)) {
    if (info.runs > 0 && info.reward <= 0 && (!weakest || info.reward < weakest.reward)) {
      weakest = { tool, reward: info.reward };
    }
  }
  if (weakest) {
    return { target: weakest.tool, practice: `practice safe use of ${weakest.tool} on demo input` };
  }
  if (s.facts < 3) {
    return { target: 'memory', practice: 'gather one more fact about the workspace' };
  }
  return { target: 'macros', practice: 'repeat the most useful chain to compile it' };
}

export async function attempt(muscle, brain, proposal) {
  const out = await brain.complete(proposal.practice);
  const verdict = verifyGate({ tool: out.tool, input: proposal.practice });
  if (!verdict.pass) return { kept: false, note: 'attempt discarded, verify failed' };
  muscle.record({ intent: proposal.practice, tool: out.tool || 'chat', ok: true });
  return { kept: true, note: `attempt kept, muscle trained on ${out.tool || 'chat'}` };
}
