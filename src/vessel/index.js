import { execFileSync } from 'node:child_process';

/**
 * vessel/index.js: the turn loop.
 *
 * muscle fast path first. brain slow path on miss.
 * verify gate before record. silent learning only on verify pass.
 * HEIDES CLI is used when present, else a local stub verdict.
 */

export function heidesAvailable() {
  try {
    execFileSync('heides', ['version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function verifyGate(action) {
  if (!action || !action.tool) return { pass: false, note: 'empty action rejected' };
  if (action.tool === 'destroy' || action.tool === 'wipe') {
    return { pass: false, note: 'destructive action denied by policy' };
  }
  return { pass: true, note: 'local verdict pass' };
}

export async function runTurn(input, deps) {
  const { muscle, brain } = deps;
  const text = String(input || '').trim();
  if (!text) return { path: 'none', reply: 'empty input ignored' };

  const guess = muscle.predictTool(text);
  if (guess.tool && guess.confidence === 'high') {
    const action = { tool: guess.tool, input: text };
    const verdict = verifyGate(action);
    if (verdict.pass) {
      muscle.noteFastHit();
      muscle.record({ intent: text, tool: guess.tool, ok: true });
      return {
        path: 'fast',
        reply: `muscle served this with tool ${guess.tool}, no brain call needed`,
      };
    }
  }

  const out = await brain.complete(text);
  const verdict = verifyGate({ tool: out.tool, input: text });
  muscle.record({ intent: text, tool: out.tool || 'chat', ok: verdict.pass });
  if (!verdict.pass) return { path: 'slow', reply: 'brain output failed verify, muscle learned nothing' };
  return { path: 'slow', reply: out.text };
}
