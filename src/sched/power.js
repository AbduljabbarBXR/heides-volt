import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * sched/power.js: heat and battery awareness.
 *
 * Termux battery API first, sysfs second, wall power assumption
 * when no sensor answers. Thresholds: pause under 20 percent
 * while discharging, pause at 45C and above. Loops check every
 * tick and announce pause plus resume exactly once per episode.
 */

export function readPower() {
  try {
    const out = execFileSync('termux-battery-status', [], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    const j = JSON.parse(out);
    return { pct: j.percentage, charging: j.status !== 'DISCHARGING', tempC: (j.temperature ?? 300) / 10 };
  } catch {
    /* fall through */
  }
  try {
    const pct = Number(readFileSync('/sys/class/power_supply/battery/capacity', 'utf8').trim());
    const status = String(readFileSync('/sys/class/power_supply/battery/status', 'utf8')).trim();
    const temp = Number(String(readFileSync('/sys/class/power_supply/battery/temp', 'utf8')).trim()) / 10;
    if (Number.isFinite(pct)) return { pct, charging: status !== 'Discharging', tempC: temp };
  } catch {
    /* fall through */
  }
  return null;
}

export function powerGate(reading = readPower()) {
  if (!reading) return { ok: true, note: 'no sensor, assuming wall power' };
  if (Number.isFinite(reading.tempC) && reading.tempC >= 45) {
    return { ok: false, note: `paused: heat at ${reading.tempC}C` };
  }
  if (reading.pct < 20 && !reading.charging) {
    return { ok: false, note: `paused: battery at ${reading.pct} percent` };
  }
  return { ok: true, note: 'power ok' };
}
