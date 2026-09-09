import { propose, attempt } from '../curiosity/index.js';
import { sleepCycle } from '../sleep/index.js';

/**
 * sched/index.js: the daemon heartbeat.
 *
 * watchLoop ticks on interval: propose one learning target,
 * attempt it, report one line. Silent growth while you sleep.
 * Returns a stop function. CLI keeps alive until killed.
 */

export function watchLoop({ muscle, brain, intervalMs = 60000, cwd = process.cwd(), say = () => {} }) {
  let n = 0;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    n += 1;
    try {
      const p = propose(muscle);
      const res = await attempt(muscle, brain, p, { cwd });
      say(`tick ${n}: ${p.target} ${res.kept ? 'kept' : 'dropped'}`);
    } catch (e) {
      say(`tick ${n}: error seen, moving on`);
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/**
 * daemonLoop: watch plus sleep in one heartbeat.
 *
 * Every tick runs curiosity. Every sleepEvery ticks runs a
 * sleep cycle. Days look like learning, nights like growing.
 */
export function daemonLoop({ muscle, brain, watchMs = 60000, sleepEvery = 60, cwd = process.cwd(), say = () => {} }) {
  let n = 0;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    n += 1;
    try {
      const p = propose(muscle);
      const res = await attempt(muscle, brain, p, { cwd });
      say(`daemon tick ${n}: ${p.target} ${res.kept ? 'kept' : 'dropped'}`);
    } catch (e) {
      say(`daemon tick ${n}: error seen, moving on`);
    }
    if (n % Math.max(1, sleepEvery) === 0) {
      try {
        const res = sleepCycle(muscle, {});
        say(`daemon sleep: ${res.note}`);
      } catch (e) {
        say('daemon sleep: error seen, moving on');
      }
    }
  };
  void tick();
  const timer = setInterval(tick, watchMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
