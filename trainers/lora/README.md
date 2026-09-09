# LoRA reference trainer (big iron)

Phone side trains the builtin linear adapter. This job trains a real
LoRA adapter on a CUDA box from the same `distill.jsonl`.

## Setup

```bash
pip install -r requirements.txt
python3 train.py --check
```

## Run

```bash
node ./bin/harness distill ./distill.jsonl
python3 trainers/lora/train.py ./distill.jsonl ./adapter
HARNESS_TRAINER="python3 $PWD/trainers/lora/train.py" node ./bin/harness sleep
```

Contract: `train.py <dataset> <outdir>` prints one JSON line
`{ok, evals_pass, score, adapter}`. The harness promotes only when
`evals_pass` is true. Eval is tool match on held out pairs, pass at
0.5 or better. Fewer than 8 pairs keeps old weights.

Env:

```bash
HARNESS_BASE_MODEL=HuggingFaceTB/SmolLM2-360M-Instruct
HARNESS_LORA_RANK=8
```

Merge to GGUF for serving with llama.cpp `export-lora` once green.
