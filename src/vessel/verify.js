import { execFileSync } from 'node:child_process';
import { heidesAvailable } from './index.js';

/**
 * vessel/verify.js: deep verdict from the real HEIDES binary.
 *
 * Local verifyGate stays fast and always on. deepCheck shells
 * out to `heides check` when the CLI is present and counts
 * blockers plus criticals. Curiosity and imports learn only
 * on green workspaces. stagedFile judges a patch file before
 * anything touches disk.
 */

export function deepCheck(cwd = process.cwd(), timeoutMs = 30000) {
  if (!heidesAvailable()) return { pass: true, blockers: 0, criticals: 0, note: 'heides cli absent, local verdict used' };
  let out = '';
  try {
    out = execFileSync('heides', ['check', cwd], { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    return { pass: false, blockers: 0, criticals: 0, note: 'heides run failed, learning paused' };
  }
  const blockers = (out.match(/\[blocker\]/g) || []).length;
  const criticals = (out.match(/\[critical\]/g) || []).length;
  if (blockers + criticals > 0) {
    return { pass: false, blockers, criticals, note: `workspace holds ${blockers} blocker(s) plus ${criticals} critical(s), learning paused` };
  }
  return { pass: true, blockers: 0, criticals: 0, note: 'workspace green' };
}

export function stagedFile(patchFile, cwd = process.cwd(), timeoutMs = 30000) {
  if (!heidesAvailable()) return { ok: false, output: 'heides cli absent, optional' };
  try {
    const out = execFileSync('heides', ['staged', patchFile, cwd], { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: out.trim() || 'patch judged safe' };
  } catch (e) {
    const out = e.stdout ? String(e.stdout).trim() : '';
    return { ok: false, output: out || 'patch judged unsafe' };
  }
}
