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

# locked node: pairing code required on every hello and delegate
node ./bin/harness serve 47397 plum42
node ./bin/harness link 127.0.0.1 47397 plum42

# device A: link once, then delegate any turn
node ./bin/harness link 127.0.0.1 47397
node ./bin/harness delegate 127.0.0.1 47397 check the workspace
```

Sleep consolidation, so weights grow at rest:

```bash
# interaction: verified slow turns leave traces, facts ride along
node ./bin/harness remember <fact>
node ./bin/harness ponder <novel task>

# rest: export pairs, train a LoRA adapter on charger power,
# validate, promote only on green evals
node ./bin/harness distill ./distill.jsonl
```

Web eyes:

```bash
node ./bin/harness webget https://example.com
HARNESS_SEARCH=tavily TAVILY_API_KEY=... node ./bin/harness websearch <query>
HARNESS_SEARCH=brave BRAVE_API_KEY=... node ./bin/harness websearch <query>
```

Sleep pipeline plus market shelf:

```bash
# night shift: dataset out, trainer runs, promote only on green evals
node ./bin/harness sleep
HARNESS_TRAINER=./train.sh node ./bin/harness sleep

# shelf proven skills by name, fetch honors trust
node ./bin/harness publish check
node ./bin/harness market
node ./bin/harness fetch check

# pull a whole peer shelf over the mesh, trust still applies
node ./bin/harness sync 127.0.0.1 47397

# pin relays once, pull them all with one command
node ./bin/harness pin 127.0.0.1 47397
node ./bin/harness relays
node ./bin/harness pull

# one daemon: curiosity ticks plus sleep consolidation
node ./bin/harness daemon 60 60
node ./bin/harness adapter
node ./bin/harness adapter rollback

# autostart the daemon on boot
node ./bin/harness boot
node ./bin/harness boot install
```

Grow while you sleep:

```bash
node ./bin/harness watch 60
```

Trust control for imported skills:

```bash
node ./bin/harness trust
node ./bin/harness trust deny <fingerprint>
node ./bin/harness trust allow <fingerprint>
node ./bin/harness trust quorum 2
node ./bin/harness revoke <fingerprint>
```

Judge the workspace and patches with real HEIDES when installed:

```bash
node ./bin/harness verify
node ./bin/harness staged ./fix.patch
```

## Brains: local model and cloud channels

Default is mock, fully offline. Pick a channel with `HARNESS_PROVIDER`:

| Channel | Value | Key env | Notes |
| --- | --- | --- | --- |
| Mock | (unset) | none | deterministic, offline |
| OpenAI | openai | OPENAI_API_KEY | default model gpt-4o-mini |
| DeepSeek | deepseek | DEEPSEEK_API_KEY | default model deepseek-chat |
| OpenRouter | openrouter | OPENROUTER_API_KEY | set HARNESS_MODEL |
| Hugging Face | hf | HF_TOKEN | OpenAI compatible router, set HARNESS_MODEL |
| Anthropic | anthropic | ANTHROPIC_API_KEY | native messages API |
| llama.cpp | llama | none | local server at 127.0.0.1:8080 |
| Ollama | ollama | none | local server at 127.0.0.1:11434 |

`HARNESS_MODEL` and `HARNESS_BASE_URL` override per channel.
`HARNESS_TIMEOUT_MS` caps calls (default 60000). Unreachable brains
fail soft: the turn reports it and records nothing.

Local model, proven on this repo with SmolLM2 360M Q8 on CPU:

```bash
apt-get install -y llama.cpp-tools
curl -L -o model.gguf https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf
llama-server -m model.gguf --port 8080 -c 1024 --n-gpu-layers 0
HARNESS_PROVIDER=llama HARNESS_MODEL=local node ./bin/harness doctor
```

Measured: first turn slow through the 360M brain, repeat turns
served from muscle with zero brain calls. Small brains answer best
with the built in system steer toward short action first replies.

## Architecture

```text
src/
  banner.js    ASCII banner
  main.js      command dispatch
  brain/       brain adapter interface plus provider channels:
               mock offline by default, openai, deepseek,
               openrouter, hf, anthropic native, llama, ollama
  vessel/      turn loop: muscle fast path, brain slow path,
               local verify gate, silent record
  vessel/verify.js  deep verdict via real heides check plus
               staged patch judging when the CLI is present
  muscle/      router plus recall ranker plus chain compiler,
               stopword cleaned tokens, JSON persisted
  curiosity/   drive: propose weakest point, attempt, keep
               only on verify pass plus green workspace
  skills/      signed 4 KB skill files, export plus verify
               gated import, ed25519 device keys
  skills/trust.js  deny list, quorum held rewards, revoke
               with full rollback
  mesh/        TCP task mesh: serve, link, peers, delegate,
               pairing codes plus sealed caps
  sched/       daemon heartbeat: watch ticks curiosity
  sleep/       rest time growth: trace log plus JSONL distill
               export for LoRA sleep training, trainer pipeline
               with promote only on green evals
  sleep/reference.js builtin phone side trainer: token weights,
               held out eval, promote plus rollback
  web/         outside eyes: page fetch plus search channels
  skills/market.js named shelf: publish, market, fetch
  skills/relays.js pull network: pin, unpin, relays, pull
  sched/       daemonLoop: watch plus sleep in one heartbeat
  boot/        autostart recipes: systemd, launchd, Termux, cron
```

The turn loop:

```text
input -> muscle predicts (confidence)
  high confidence -> fast path action -> verify -> record
  low confidence  -> brain reasons -> verify -> record + train muscle
```

Nothing unverified ever trains the muscle. HEIDES (`check`, `staged`)
plus real outcomes are the immune system. Hallucinated wins are discarded.

## Roadmap

1. v0.1 vessel skeleton: mock brain, muscle with JSON store, verify stub,
   HEIDES CLI passthrough when present (shipped).
2. Curiosity loop: scheduler proposes a skill, tries it sandboxed, keeps it
   only on verify pass (shipped).
3. Skill exchange: signed 4 KB skill files shared peer to peer, not weights
   (shipped).
4. Mesh: capability advertisement and delegation across phones, task
   parallelism, never tensor parallelism (shipped, loopback by default,
   pairing codes plus sealed caps).
5. Channels plus hardening: seven brain channels, deep verify, trust
   graph, macro fire, watch daemon, live 360M local proof (shipped).
6. Growth plus web: recall rides into prompts, traces distill to
   JSONL for sleep LoRA, page fetch plus two search channels (shipped).
7. Night plus market: sleep pipeline with eval gated promote, named
   skill shelf, deep gate on macro fire (shipped).
8. Adapter plus sync plus daemon: builtin phone side trainer with
   promote and rollback, shelf sync over mesh, unified daemon (shipped).
9. Iron plus relays plus boot: torch LoRA reference job, pinned relay
   pull network, autostart recipes for every platform (shipped).
10. Next: public shelf relays with gossip, torch soak run on CUDA,
    daemon health endpoint.

## Relation to HEIDES and VOLT

HEIDES is the nervous system (deterministic code map and guards).
VOLT is the reference hands (terminal agent, tools, TUI).
This repo is the vessel that binds a brain to both and adds the muscle
that learns silently from every verified turn.

## License

MIT.
