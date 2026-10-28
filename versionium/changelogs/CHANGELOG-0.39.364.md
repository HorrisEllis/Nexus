# 0.39.364 — 2026-10-07

James: "what is that performance? and can we start using it with the resource monitor to optimize performance dynamically."

## What his console showed
| Seen | What it was |
|---|---|
| `ok -> pressure — free memory 19.7%` then `pressure -> ok` every 10 s, for hours | The machine sat **on** the 20% line. Every flip was reported, and none was a change. |
| `heap 80.4% of allocated`, flipping the same way | A false metric: heapUsed ÷ heapTotal. heapTotal is what V8 has reserved so far, and it grows on demand, so a healthy process sits at 80–95%. |
| `L2/L4 velocity runaway: 1.00`, solid | Each flip was a `nexus.resource.pressure` event, and each pushed the velocity up. A symptom of the flapping, not a separate problem. |
| 3b: 5–20 s per call. 7b and 16b: `ollama sent nothing for 45000 ms` | The ladder climbed to bigger models while 1–7% of memory was free. Each one sat loading into swap until the 45 s idle limit killed it. |
| `deepseek-coder-v2 · HTTP 404` | Asked for the name without its tag. The installed one is `deepseek-coder-v2:16b-lite-instruct-q4_K_M`. |
| A 3b adversarial probe mid-build | Background work loading a model while a repo agent's build was using Ollama. |

## The monitor now drives what runs
- **Hysteresis.** A level is entered at the threshold and left only once memory is clearly back:
  - pressure: in below 20% free, out above 25%;
  - critical: in below 10%, out above 13%.
- **Confirmation.** A new level must hold for 2 samples in a row before it is reported. Critical is reported at once.
- **Heap.** Measured against V8's real limit (`heap_size_limit`), which is how close the process is to an out-of-memory crash. Used ÷ reserved is still in the sample, for reading, but no longer judged.
- **`fitsModel()`: will a local model fit now?**
  - need = model size × 1.2;
  - available = free memory + what Ollama can release by unloading its current model − the 10% kept back.
  - An unknown size is tried anyway, and the reason says so.
- **The phase ladder asks it before every Ollama rung.**
  - A model that won't fit is **skipped**. The Plan says why, with the numbers, and the climb goes straight to the next rung, never retrying a skipped one.
  - The skip is a first-class fault (mode `no-memory`) in `fault_log`.
- **Background work gives way.**
  - The adversarial probe runs only while the monitor's settled level is ok.
  - The Ollama bridge defers background intents while foreground work (a tool loop, a build) is running.
- **First token.** The wait before the first token is now 120 s (`OLLAMA_RAW_FIRST_TOKEN_MS`), because loading a model and reading a 10k-character prompt is not idleness. Gaps between tokens keep the 45 s limit.
- **Model names.** The bridge resolves a name without its tag to the one installed tag it means. Two candidates, or none, leave the name as asked, so Ollama's own error says what's missing.
- **`/api/models`** now also returns each model's size and what Ollama holds in memory.

## Proof
- New: `test-resource-adaptive` 28/28. James's wobble, replayed through the real `tick()`, reports nothing, and only a real move under the line reports pressure.
- Unchanged and passing:

| Suite | Result |
|---|---|
| pressure-window | 16/16 |
| escalation-ladder | 9/9 |
| agent-record | 30/30 |
| chunked-phase-build | 14/14 |
| phase-proof | 7/7 |
| wire-pressure | 8/8 |
| clear-glass-pressure | 12/12 |
| adversarial (×5 suites) | all pass |
| ollama-runtime / ollama-activity / ollama-check / model-door / command-index | all pass |
| deepseek-ncp | 2/2 |

- `test-pipeline-routing` PR-03 failed once, after other suites had written economy-ledger rows, and passed on every rerun. The test depends on shared state; this change doesn't touch it.
