/**
 * brain/index.js: swappable reasoner interface.
 *
 * Default is mock, fully offline. Set env HARNESS_PROVIDER to
 * passthrough to any OpenAI compatible chat endpoint, else mock.
 * The vessel never trusts raw brain output. Verify first.
 */

export const BRAIN_VERSION = '0.1.0';

export function describeBrain() {
  if (process.env.HARNESS_PROVIDER) return `provider brain: ${process.env.HARNESS_PROVIDER}`;
  return 'mock brain: offline, deterministic, built in';
}

export async function complete(prompt, opts = {}) {
  const text = String(prompt || '');
  if (process.env.HARNESS_PROVIDER) {
    return {
      text: `provider echo (${text.slice(0, 80)})`,
      tool: null,
      note: 'passthrough stub, wire a real endpoint here',
    };
  }
  const low = text.toLowerCase();
  let tool = 'chat';
  if (low.includes('scan') || low.includes('map')) tool = 'scan';
  else if (low.includes('check') || low.includes('review')) tool = 'check';
  else if (low.includes('remember') || low.includes('note')) tool = 'remember';
  else if (low.includes('recall') || low.includes('find')) tool = 'recall';
  return {
    text: `mock understood: ${text.slice(0, 120)}`,
    tool,
    note: 'slow path used, muscle will learn this',
  };
}
