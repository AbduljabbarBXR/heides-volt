/**
 * brain/index.js: swappable reasoner interface.
 *
 * Default is mock, fully offline. Set HARNESS_PROVIDER to pick
 * a channel: openai, deepseek, openrouter, hf, anthropic,
 * llama, ollama. HARNESS_MODEL and HARNESS_BASE_URL override.
 * The vessel never trusts raw brain output. Verify first.
 */
import { resolveChannel, completeVia, mapTool } from './providers.js';

export const BRAIN_VERSION = '0.2.0';

export function describeBrain() {
  try {
    const ch = resolveChannel();
    if (!ch) return 'mock brain: offline, deterministic, built in';
    return `${ch.name} brain: ${ch.model || 'model from env'}`;
  } catch (e) {
    return `brain config issue: ${e.message}`;
  }
}

export async function complete(prompt, opts = {}) {
  const text = String(prompt || '');
  let ch = null;
  try {
    ch = resolveChannel();
  } catch (e) {
    throw new Error(`brain unreachable: ${e.message}`);
  }
  if (!ch) {
    return { text: `mock understood: ${text.slice(0, 120)}`, tool: mapTool(text), note: 'slow path used, muscle will learn this' };
  }
  try {
    return await completeVia(ch, text, opts);
  } catch (e) {
    throw new Error(`brain unreachable: ${e.message}`);
  }
}
