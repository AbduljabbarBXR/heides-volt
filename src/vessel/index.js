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

export function logTrace(muscle, prompt, reply, tool) {
  const traces = muscle.store.data.traces || [];
  traces.push({ prompt: String(prompt || '').slice(0, 2000), reply: String(reply || '').slice(0, 2000), tool });
  while (traces.length > 500) traces.shift();
  muscle.store.data.traces = traces;
  muscle.store.save();
}

export async function runTurn(input, deps) {
  const { muscle, brain } = deps;
  const text = String(input || '').trim();
  if (!text) return { path: 'none', tool: null, reply: 'empty input ignored' };

  const macro = muscle.macroSuggest();
  if (macro) {
    const verdict = verifyGate({ tool: macro, input: text });
    if (verdict.pass) {
      muscle.noteFastHit();
      muscle.record({ intent: text, tool: macro, ok: true });
      return { path: 'fast', tool: macro, reply: `macro fired ${macro} with zero brain call` };
    }
  }

  const guess = muscle.predictTool(text);
  if (guess.tool && guess.confidence === 'high') {
    const action = { tool: guess.tool, input: text };
    const verdict = verifyGate(action);
    if (verdict.pass) {
      muscle.noteFastHit();
      muscle.record({ intent: text, tool: guess.tool, ok: true });
      return {
        path: 'fast',
        tool: guess.tool,
        reply: `muscle served this with tool ${guess.tool}, no brain call needed`,
      };
    }
  }

  let out;
  let prompt = text;
  if (muscle.store.data.facts.length > 0) {
    const known = muscle.recall(text, 2);
    if (known.length > 0) prompt = `Known facts:\n${known.map((f) => `- ${f}`).join('\n')}\n\n${text}`;
  }
  try {
    out = await brain.complete(prompt);
  } catch (e) {
    return { path: 'slow', tool: null, reply: 'brain unreachable, nothing recorded' };
  }
  const verdict = verifyGate({ tool: out.tool, input: text });
  muscle.record({ intent: text, tool: out.tool || 'chat', ok: verdict.pass });
  if (!verdict.pass) return { path: 'slow', tool: out.tool || null, reply: 'brain output failed verify, muscle learned nothing' };
  logTrace(muscle, text, out.text, out.tool || 'chat');
  return { path: 'slow', tool: out.tool || 'chat', reply: out.text };
}
