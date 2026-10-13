# 0.60.10 — 2026-10-13

James: "stop. need you to merge these. new models. qwen3.5:9b qwen2.5-coder:7b" · "some guardian, and clearglass repressions."

## Merged: his two uploads

- **Nexus-main-47.zip** is byte-for-byte this branch's 0.60.7 (`ca92398`). There was nothing in it to merge.
- **Nexus-main-46.zip** is 0.60.6 plus his own changes on his machine: 9 files.
  - All 9 were merged three ways (0.60.6 as the base, this branch, his copy) with no conflicts, so both sides are kept.
  - `idearium/api/index.js` carries his memory guard and this branch's 0.60.7–0.60.9 routes together.
  - His changelog is kept word for word below. It was written as "0.60.7" on his machine, the same number this branch had already used, so it lands here instead of overwriting either one.

## Ollama: his new models

- `ollama/config.js`: the default is now `qwen2.5-coder:7b`, and the fallback (a thinking model) is `qwen3.5:9b`.
- `OLLAMA_DEFAULT_MODEL` / `OLLAMA_FALLBACK_MODEL` still override both.
- The abliterated tags stay listed in `ollama/abliterated-catalog.js`.

## Proof

- Suites green: `test-project-decompose` 15/15, `test-plan-code-run-attention` 40/40, `test-accounts-picker-cos` 40/40, `test-guardian-dispatch-ladder` 18/18, `test-resource-adaptive` 28/28, `test-warp-cascade-provider-fallback` 7/7, `test-agent-hat-agnostic` 15/15, `test-phase-actually-builds` 6/6.

---

## His changelog, as written on his machine (labelled 0.60.7 there)

### (his) 0.60.7 — 2026-10-13
Fix: ChatGPT NCP flapping (3 disconnects / 60 s, a reload every ~3 s).
Cause: signed-out ChatGPT is a normal page, but its userscript reports "signed-out" on every load; Guardian raised a sign-in attention, Clear Glass reloaded chatgpt.com (0.60.2 loginOptional), the reload dropped the NCP connection, the next load reported again.
- `clear-glass/src/providers/attention.js`: a loginOptional tab already off a sign-in URL is left alone; at most one send-back reload per provider per minute.
- `guardian/lib/provider-attention.js`: no signin raise for a loginOptional provider unless its URL is really a sign-in page.
## Also in 0.60.7
- **Ollama GPU out of memory** (`ollama/lib/ollama-client.js`): a "cudaMalloc failed / out of memory / GGML_ASSERT" load failure is retried once on the CPU with a 4096 context, and the GPU is skipped for 10 min (`NEXUS_OLLAMA_GPU_OOM_COOLDOWN_MS`) so later jobs do not each pay a failed load first.
- **Idearium memory** (`idearium/api/index.js`): the nexus-self sync (≈2300 files, 125 s) skips a round when free memory is under 20% (`NEXUS_SELF_MIN_FREE`), and its first pass waits 60 s instead of 20 s.
- **Gemini "no tab connected"** (`guardian/options.js`): `jobs.no_tab_ms` 45 s → 120 s; under memory pressure the Gemini window took ~30 s to load, after the job had already been cancelled.
- **Clear Glass browser**: the "▣ COMPARTMENT · BROWSER" label is gone from the top left. The search bar now sizes itself to the address in it, can be dragged along the toolbar by its ⋮⋮ grip (double-click the grip to put it back), and keeps the existing edge-drag resize (double-click the edge returns to auto-fit).
