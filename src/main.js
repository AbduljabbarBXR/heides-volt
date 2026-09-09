import { printBanner } from './banner.js';
import { Store } from './muscle/store.js';
import { Muscle } from './muscle/index.js';
import { complete, describeBrain } from './brain/index.js';
import { heidesAvailable, runTurn } from './vessel/index.js';
import { propose, attempt } from './curiosity/index.js';
import { listSkills, exportSkill, importSkill } from './skills/index.js';
import { startNode, linkPeer, delegateTask } from './mesh/index.js';
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
  'serve PORT: start mesh node on loopback',
  'link HOST PORT: connect a peer and swap caps',
  'peers: list known peers',
  'delegate HOST PORT TEXT: run text on peer',
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
    const node = await startNode({ muscle, brain: { complete }, port: rest[0] || 0 });
    say(`mesh node listening on ${node.host} port ${node.port}`);
    await new Promise(() => {});
    return 0;
  }
  if (cmd === 'link') {
    const store = new Store(storeDir || undefined);
    const muscle = new Muscle(store);
    try {
      const caps = await linkPeer(muscle, store, rest[0], rest[1]);
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
      const res = await delegateTask(muscle, rest[0], rest[1], rest.slice(2).join(' '));
      say(res.reply);
    } catch (e) {
      say(`delegate failed: ${e.message}`);
      return 1;
    }
    return 0;
  }

  const store = new Store(storeDir);
  const muscle = new Muscle(store);
  const res = await runTurn([cmd, ...rest].join(' '), { muscle, brain: { complete } });
  say(res.reply);
  return 0;
}
