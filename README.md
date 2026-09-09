# HEIDES AGI Harness

The vessel that turns any brain into a learning resident.

A cloud model has IQ but no body. It forgets yesterday, touches nothing,
risks nothing, learns nothing. This harness is the part that makes it
AGI-like: hands to act, a nervous system to judge safety, memory that
persists, drive that wakes it up, and muscle memory that silently compiles
repeated reasoning into instant reflexes.

```
Brain (any model) + Vessel (this repo) = Resident
```

## Idea in one page

| Layer | Role | Lives in |
| --- | --- | --- |
| Brain | Reasons, plans, picks tools. Swappable: cloud frontier today, local 1B symbiote tomorrow | Provider endpoint |
| Nervous system | Maps code, blocks breaking patches, traces taint, grounds plans | HEIDES CLI (`heides scan/check/staged/plan`) |
| Hands | Runs shell, edits files, manages memory/schedule plugins | VOLT style tool registry (`src/vessel/`) |
| Muscle memory | Learns which tool, memory and chain worked, so familiar work skips the brain | `src/muscle/`, 50 MB JSON budget |

Use is training. Every turn the brain takes through the vessel records
(state, action, verified outcome). Verified wins train three tiny learners
(router, recall ranker, chain compiler). Familiar tasks then run on the fast
path with zero brain calls. The brain stays replaceable, the muscle becomes
you: copyable, private, offline capable.

## Quickstart

Zero dependencies. Node 18 or newer, no install step.

```bash
git clone https://github.com/AbduljabbarBXR/heides-agi-harness.git
cd heides-agi-harness
node ./bin/harness doctor
node ./bin/harness demo
node ./bin/harness help
```

All commands (subcommands, no flags needed):

```bash
node ./bin/harness help
node ./bin/harness version
node ./bin/harness doctor
node ./bin/harness demo
node ./bin/harness remember <fact>
node ./bin/harness recall <query>
node ./bin/harness stats
node ./bin/harness curious
node ./bin/harness skills
node ./bin/harness export <name> [file]
node ./bin/harness import <file>
node ./bin/harness serve [port]
node ./bin/harness link <host> <port>
node ./bin/harness peers
node ./bin/harness delegate <host> <port> <text>
```

Share a skill between two devices:

```bash
# device A: train through normal turns, then export
node ./bin/harness check
node ./bin/harness export check ./check.skill.json

# device B: verify and merge, then use with zero brain calls
node ./bin/harness import ./check.skill.json
node ./bin/harness check
```

Delegate a turn to a peer on the local network:

```bash
# device B: serve (loopback by default, LAN host only on trusted nets)
node ./bin/harness serve 47397

# device A: link once, then delegate any turn
node ./bin/harness link 127.0.0.1 47397
node ./bin/harness delegate 127.0.0.1 47397 check the workspace
```

## Architecture

```text
src/
  banner.js    ASCII banner plus UI text rules
  main.js      command dispatch
  brain/       brain adapter interface (mock offline by default,
               passthrough to any OpenAI compatible endpoint)
  vessel/      turn loop: muscle fast path, brain slow path,
               HEIDES verify gate, silent record
  muscle/      router plus recall ranker plus chain compiler,
               JSON persisted under OS config dir
  curiosity/   drive: propose weakest point, attempt, keep
               only on verify pass
  skills/      signed 4 KB skill files, export plus verify
               gated import, ed25519 device keys
  mesh/        TCP task mesh: serve, link, peers, delegate
test/
  banner.test.js   asserts UI strings carry no hyphen or em dash
  muscle.test.js   remembers, recalls, rewards, compiles macros
  vessel.test.js   fast path hit skips brain, miss calls brain
  curiosity.test.js proposes gaps, keeps verified, drops the rest
  skills.test.js   roundtrip teaches, tamper and destructive refused
  mesh.test.js     caps swap, delegate teaches, dead peer clean
```

The turn loop:

```text
input -> muscle predicts (confidence)
  high confidence -> fast path action -> verify -> record
  low confidence  -> brain reasons -> verify -> record + train muscle
```

Nothing unverified ever trains the muscle. HEIDES (`check`, `staged`)
plus real outcomes are the immune system. Hallucinated wins are discarded.

## UI text rule

Terminal output in this repo carries no hyphen-minus (`-`) and no em dash.
Authored copy uses words (`plus`, `real time`, `built in`) instead of
hyphenated forms. Dynamic data (paths, timestamps, model ids) is exempt:
it is echoed, not authored. `test/banner.test.js` enforces this on every
UI string.

## Roadmap

1. v0.1 vessel skeleton: mock brain, muscle with JSON store, verify stub,
   HEIDES CLI passthrough when present (shipped).
2. Curiosity loop: scheduler proposes a skill, tries it sandboxed, keeps it
   only on verify pass (shipped).
3. Skill exchange: signed 4 KB skill files shared peer to peer, not weights
   (shipped).
4. Mesh: capability advertisement and delegation across phones, task
   parallelism, never tensor parallelism (shipped, loopback by default,
   plain text wire in v1).
5. Next: encrypted wire, real brain endpoint, HEIDES deep verify,
   skill marketplace with trust graph.

## Relation to HEIDES and VOLT

HEIDES is the nervous system (deterministic code map and guards).
VOLT is the reference hands (terminal agent, tools, TUI).
This repo is the vessel that binds a brain to both and adds the muscle
that learns silently from every verified turn.

## License

MIT.
