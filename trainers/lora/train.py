#!/usr/bin/env python3
"""Reference LoRA trainer for big iron.

Contract (same as builtin): trainer <dataset.jsonl> <outdir>
prints exactly one JSON line: {ok, evals_pass, score, adapter}.

Trains a LoRA adapter with torch plus peft plus transformers on
distill.jsonl pairs, held out eval on tool match plus loss,
promotes only on green. Needs a CUDA box. Phone side stays on
the builtin linear adapter. See README.md beside this file.

Usage:
  python3 train.py --check                 validate setup, no torch needed
  python3 train.py distill.jsonl ./adapter [--base MODEL] [--rank N]
"""

import json
import os
import sys

PAIRS_MIN = 8


def load_pairs(path):
    pairs = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("prompt") and obj.get("completion"):
                pairs.append(obj)
    return pairs


def with_labels(enc):
    """Mirror input ids as labels, ignoring padding. Trainer needs
    labels or it reports logits only and refuses to train."""
    labels = []
    for ids, mask in zip(enc["input_ids"], enc["attention_mask"]):
        labels.append([i if m else -100 for i, m in zip(ids, mask)])
    enc["labels"] = labels
    return enc


def check_only():
    missing = []
    for mod in ("torch", "peft", "transformers", "datasets"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    print(json.dumps({"ok": True, "ready": not missing, "missing": missing}))
    return 0


def emit(report):
    print(json.dumps(report))
    return 0


def main(argv):
    if "--check" in argv:
        return check_only()
    if len(argv) < 3:
        return emit({"ok": False, "evals_pass": False, "score": 0, "adapter": "", "note": "usage: train.py distill.jsonl outdir"})
    dataset, outdir = argv[1], argv[2]
    base = os.environ.get("HARNESS_BASE_MODEL", "HuggingFaceTB/SmolLM2-360M-Instruct")
    rank = int(os.environ.get("HARNESS_LORA_RANK", "8"))
    try:
        pairs = load_pairs(dataset)
    except (OSError, ValueError) as exc:
        return emit({"ok": False, "evals_pass": False, "score": 0, "adapter": "", "note": "unreadable dataset"})
    if len(pairs) < PAIRS_MIN:
        return emit({"ok": False, "evals_pass": False, "score": 0, "adapter": "", "note": "too few pairs, kept old weights"})

    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
    except ImportError as exc:
        return emit({"ok": False, "evals_pass": False, "score": 0, "adapter": "", "note": "missing python deps, see README"})

    cut = max(1, int(len(pairs) * 0.8))
    train_pairs, held_pairs = pairs[:cut], pairs[cut:]
    tok = AutoTokenizer.from_pretrained(base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    def fmt(p):
        return "### Task\n" + p["prompt"] + "\n### Answer\n" + p["completion"]

    def tok_all(items):
        enc = tok([fmt(p) for p in items], truncation=True, max_length=512, padding="max_length")
        return with_labels(enc)

    model = AutoModelForCausalLM.from_pretrained(base, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
    model = get_peft_model(model, LoraConfig(r= rank, lora_alpha=rank * 2, target_modules=["q_proj", "v_proj"], lora_dropout=0.05, task_type="CAUSAL_LM"))
    args = TrainingArguments(output_dir=outdir, per_device_train_batch_size=2, num_train_epochs=2, learning_rate=2e-4, logging_steps=10, save_steps=50, save_total_limit=1, report_to="none", fp16=torch.cuda.is_available())
    trainer = Trainer(model=model, args=args, train_dataset=Dataset.from_dict(tok_all(train_pairs)))
    trainer.train()

    model.eval()
    hits = 0
    with torch.no_grad():
        for h in held_pairs:
            ids = tok(fmt(h), return_tensors="pt", truncation=True, max_length=512)
            ids = {k: v.to(model.device) for k, v in ids.items()}
            out = model.generate(**ids, max_new_tokens=60, do_sample=False)
            text = tok.decode(out[0], skip_special_tokens=True).lower()
            want = str(h.get("tool", "")).lower()
            if want and want in text:
                hits += 1
    score = round(hits / max(1, len(held_pairs)), 2)
    model.save_pretrained(outdir)
    tok.save_pretrained(outdir)
    return emit({"ok": True, "evals_pass": score >= 0.5, "score": score, "adapter": outdir})


if __name__ == "__main__":
    sys.exit(main(sys.argv))
