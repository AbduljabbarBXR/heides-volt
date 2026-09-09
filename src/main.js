import { printBanner } from './banner.js';
import { Store } from './muscle/store.js';
import { Muscle } from './muscle/index.js';
import { complete, describeBrain } from './brain/index.js';
import { heidesAvailable, runTurn } from './vessel/index.js';
import { propose, attempt } from './curiosity/index.js';
import { listSkills, exportSkill, importSkill } from './skills/index.js';
import { startNode, linkPeer, delegateTask, syncMarket } from './mesh/index.js';
import { deepCheck, stagedFile } from './vessel/verify.js';
import { allowOrigin, denyOrigin, setQuorum, revokeOrigin, trustReport } from './skills/trust.js';
import { watchLoop, daemonLoop } from './sched/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportDistill, distillStats, sleepCycle } from './sleep/index.js';
import { rollbackAdapter } from './sleep/reference.js';
import { publishSkill, listMarket, fetchSkill } from './skills/market.js';
import { pinRelay, unpinRelay, relays, pullAll } from './skills/relays.js';
import { detectPlatform, bootTarget, installBoot, cronLine } from './boot/index.js';
import { webget, websearch } from './web/index.js';
import { VERSION } from './version.js';

export const HELP_LINES = [
  'usage: harness command',
  'help: show this help',
  'version: show version',
  'doctor: check setup',
  'demo: run offline demo',
  'remember TEXT: store a fact',
  'recall TEXT: find stored facts',
  'stats: show muscle stats',
  'curious: propose plus attempt one learning step',
  'skills: list learned skills',
  'export NAME FILE: write signed skill file',
  'import FILE: verify plus merge skill file',
  'serve PORT CODE: start mesh node on loopback',
  'link HOST PORT CODE: connect a peer and swap caps',
  'peers: list known peers',
  'delegate HOST PORT TEXT: run text on peer',
  'verify: deep check workspace now',
  'staged FILE: judge patch before apply',
  'trust: show trust policy',
  'trust allow FP: mark origin safe',
  'trust deny FP: block origin',
  'trust quorum N: set votes needed',
  'revoke FP: roll back origin',
  'watch SECONDS: tick curiosity on interval',
  'daemon WSECS SLEEPTICKS: watch plus sleep in one loop',
  'sync HOST PORT CODE: pull peer shelf into muscle',
  'distill FILE: export sleep training pairs',
  'sleep: consolidate traces into adapter',
  'adapter: show active adapter',
  'adapter rollback: restore previous adapter',
  'publish NAME: shelve proven skill',
  'market: list shelved skills',
  'fetch NAME: import skill by name',
  'pin HOST PORT CODE: pin relay',
  'unpin HOST PORT: drop relay',
  'relays: list pinned relays',
  'pull: sync every relay plus peer',
  'prune: trim traces plus cold facts',
  'boot: show autostart recipe',
  'boot install: write autostart file',
  'webget URL: fetch page as text',
  'websearch TEXT: search the web',
  'any other text runs one turn through muscle then brain',
];

export function uiTexts() {
  return [...HELP_LINES];
}

export function helpText() {
  return HELP_LINES.join('\n');
}

export async function main(argv, opts = {}) {
  const out = opts.out || process.stdout;
  const storeDir = opts.storeDir || null;
  const say = (s) => out.write(String(s) + '\n');
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === 'help') {
    printBanner(out);
    say(helpText());
    return 0;
  }
  if (cmd === 'version') {
    say(`harness ${VERSION}`);
    return 0;
  }
  if (cmd === 'doctor') {
    say(`node ${process.version} ok`);
    say('store ok');
    say(describeBrain());
    say(heidesAvailable() ? 'heides cli present' : 'heides cli absent, optional');
    return 0;
  }
  if (cmd === 'demo') {
    printBanner(out);
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    say('demo start, all offline');
    const r1 = await runTurn('remember that demo facts persist locally', { muscle, brain: { complete } });
    say(`turn 1 of 3 used ${r1.path} path`);
    muscle.remember('demo project uses node with zero extra installs');
    const hits = muscle.recall('demo project node');
    say(`turn 2 of 3 recall found ${hits.length} fact(s)`);
    const r3 = await runTurn('check demo workspace please', { muscle, brain: { complete } });
    say(`turn 3 of 3 used ${r3.path} path`);
    say('demo done');
    return 0;
  }
  if (cmd === 'remember') {
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    const res = muscle.remember(rest.join(' '));
    say(res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'recall') {
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    const hits = muscle.recall(rest.join(' '));
    if (hits.length === 0) say('nothing found yet');
    for (const h of hits) say(`found: ${h}`);
    return 0;
  }
  if (cmd === 'stats') {
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    const s = muscle.stats();
    say(`facts ${s.facts} | routes ${s.routes} | macros ${s.macros} | turns ${s.turns} | recalls ${s.recalls} | fast hits ${s.fastHits}`);
    return 0;
  }
  if (cmd === 'curious') {
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    const p = propose(muscle);
    say(`curiosity target: ${p.target}`);
    const res = await attempt(muscle, { complete }, p);
    say(res.note);
    return 0;
  }
  if (cmd === 'skills') {
    const store = new Store(storeDir);
    const muscle = new Muscle(store);
    const skills = listSkills(muscle);
    if (skills.length === 0) say('no skills yet, use curious first');
    for (const s of skills) say(`skill ${s.tool} wins ${s.wins}`);
    return 0;
  }
  if (cmd === 'export') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = exportSkill(muscle, store.dir, rest[0], rest[1] || null);
    say(res.file ? `${res.note}: ${res.file}` : res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'import') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = importSkill(muscle, store.dir, rest[0]);
    say(res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'serve') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const code = rest[1] || process.env.HARNESS_PAIR_CODE || null;
    const node = await startNode({ muscle, brain: { complete }, port: rest[0] || 0, pairCode: code, store });
    say(`mesh node listening on ${node.host} port ${node.port}`);
    if (code) say('pairing on, code required');
    await new Promise(() => {});
    return 0;
  }
  if (cmd === 'link') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    try {
      const caps = await linkPeer(muscle, store, rest[0], rest[1], rest[2] || process.env.HARNESS_PAIR_CODE || null);
      say(`peer linked: ${(caps.skills || []).length} skill(s) advertised`);
    } catch (e) {
      say(`link failed: ${e.message}`);
      return 1;
    }
    return 0;
  }
  if (cmd === 'peers') {
    const store = new Store(storeDir || undefined);
    const peers = store.data.peers || [];
    if (peers.length === 0) say('no peers yet, use link first');
    for (const p of peers) say(`peer ${p.id} at ${p.host} port ${p.port} skills ${(p.skills || []).length}`);
    return 0;
  }
  if (cmd === 'delegate') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    try {
      const res = await delegateTask(muscle, rest[0], rest[1], rest.slice(2).join(' '), store);
      say(res.reply);
    } catch (e) {
      say(`delegate failed: ${e.message}`);
      return 1;
    }
    return 0;
  }
  if (cmd === 'verify') {
    const res = deepCheck(process.cwd());
    say(res.note);
    return res.pass ? 0 : 1;
  }
  if (cmd === 'staged') {
    const res = stagedFile(rest[0]);
    say(res.output);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'trust') {
    const store = new Store(storeDir || undefined);
    if (rest[0] === 'allow' && rest[1]) {
      say(allowOrigin(store, rest[1]).note);
      return 0;
    }
    if (rest[0] === 'deny' && rest[1]) {
      say(denyOrigin(store, rest[1]).note);
      return 0;
    }
    if (rest[0] === 'quorum' && rest[1]) {
      say(setQuorum(store, rest[1]).note);
      return 0;
    }
    const rep = trustReport(store);
    say(`quorum ${rep.quorum} | allowed ${rep.allowed.length} | denied ${rep.denied.length}`);
    const fps = Object.keys(rep.origins);
    if (fps.length === 0) say('no origins seen yet');
    for (const fp of fps) say(`origin ${fp}: ${rep.origins[fp]} import(s)`);
    return 0;
  }
  if (cmd === 'revoke') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    say(revokeOrigin(muscle, rest[0] || '').note);
    return 0;
  }
  if (cmd === 'watch') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const secs = Math.max(1, Math.floor(Number(rest[0]) || 60));
    say(`watch every ${secs}s, ctrl c stops`);
    watchLoop({ muscle, brain: { complete }, intervalMs: secs * 1000, say });
    await new Promise(() => {});
    return 0;
  }
  if (cmd === 'daemon') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const wsecs = Math.max(1, Math.floor(Number(rest[0]) || 60));
    const every = Math.max(1, Math.floor(Number(rest[1]) || 60));
    say(`daemon watch ${wsecs}s sleep every ${every} ticks, ctrl c stops`);
    daemonLoop({ muscle, brain: { complete }, watchMs: wsecs * 1000, sleepEvery: every, say });
    await new Promise(() => {});
    return 0;
  }
  if (cmd === 'sync') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    try {
      await linkPeer(muscle, store, rest[0], rest[1], rest[2] || process.env.HARNESS_PAIR_CODE || null);
      const res = await syncMarket(muscle, store, rest[0], rest[1], (entry, envelope) => {
        const dir = tmpdir();
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `sync-${Date.now()}-${entry.name}.skill.json`);
        writeFileSync(file, JSON.stringify(envelope), 'utf8');
        return importSkill(muscle, store.dir, file);
      });
      say(`sync: ${res.imported} imported, ${res.refused} refused of ${res.total}`);
    } catch (e) {
      say(`sync failed: ${e.message}`);
      return 1;
    }
    return 0;
  }
  if (cmd === 'distill') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const stats = distillStats(muscle);
    if (stats.pairs === 0) {
      say('no traces yet, run turns first');
      return 1;
    }
    const res = exportDistill(muscle, rest[0] || 'distill.jsonl');
    say(`${res.note}: ${res.file}`);
    return 0;
  }
  if (cmd === 'sleep') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = sleepCycle(muscle, {});
    say(res.file ? `${res.note}: ${res.file}` : res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'adapter') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    if (rest[0] === 'rollback') {
      say(rollbackAdapter(muscle).note);
      return 0;
    }
    const a = store.data.activeAdapter || null;
    if (!a) say('no adapter yet, run sleep first');
    else say(`adapter tools ${(a.tools || []).length} pairs ${a.pairs} score ${a.score}`);
    return 0;
  }
  if (cmd === 'publish') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = publishSkill(muscle, store, rest[0]);
    say(res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'market') {
    const store = new Store(storeDir || undefined);
    const entries = listMarket(store);
    if (entries.length === 0) say('market empty, publish first');
    for (const e of entries) say(`shelf: ${e.name} origin ${e.origin}`);
    return 0;
  }
  if (cmd === 'fetch') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = fetchSkill(muscle, store, rest[0]);
    say(res.note);
    return res.ok ? 0 : 1;
  }
  if (cmd === 'pin') {
    const store = new Store(storeDir || undefined);
    say(pinRelay(store, rest[0], rest[1], rest[2] || process.env.HARNESS_PAIR_CODE || null).note);
    return 0;
  }
  if (cmd === 'unpin') {
    const store = new Store(storeDir || undefined);
    say(unpinRelay(store, rest[0], rest[1]).note);
    return 0;
  }
  if (cmd === 'relays') {
    const store = new Store(storeDir || undefined);
    const list = relays(store);
    if (list.length === 0) say('no relays pinned yet');
    for (const r of list) say(`relay ${r.host} port ${r.port}`);
    return 0;
  }
  if (cmd === 'pull') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = await pullAll(muscle, store);
    say(`pull: ${res.imported} imported, ${res.refused} refused over ${res.reached} of ${res.targets}`);
    return 0;
  }
  if (cmd === 'prune') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    const res = muscle.prune();
    say(`pruned ${res.traces} trace(s) plus ${res.facts} fact(s)`);
    return 0;
  }
  if (cmd === 'boot') {
    const kind = detectPlatform();
    if (rest[0] === 'install') {
      const argv1 = process.argv[1] || 'harness';
      const root = argv1.endsWith('harness') ? argv1.split('/').slice(0, -2).join('/') || '/' : null;
      const res = installBoot({ kind, home: process.env.HOME || undefined, bin: argv1, root });
      say(res.note);
      if (res.hint) say(res.hint);
      return res.ok ? 0 : 1;
    }
    const target = bootTarget(kind);
    say(`platform ${kind}`);
    if (target) say(`recipe target: ${target}`);
    else say(`cron recipe: ${cronLine('harness daemon 60 60')}`);
    return 0;
  }
  if (cmd === 'webget') {
    const res = await webget(rest[0]);
    if (!res.ok) {
      say(res.note);
      return 1;
    }
    if (res.title) say(`title: ${res.title}`);
    say(res.text);
    return 0;
  }
  if (cmd === 'websearch') {
    const res = await websearch(rest.join(' '));
    if (!res.ok) {
      say(res.note);
      return 1;
    }
    if (res.answer) say(res.answer);
    if (res.hits.length === 0) say('no hits found');
    for (const h of res.hits) say(`hit: ${h.title} | ${h.url}`);
    return 0;
  }

  const store = new Store(storeDir);
  const muscle = new Muscle(store);
  const res = await runTurn([cmd, ...rest].join(' '), { muscle, brain: { complete }, deepCheck, cwd: process.cwd() });
  say(res.reply);
  return 0;
}
