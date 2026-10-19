# 0.60.163 — 2026-10-19 — MF1: model-fit routing (the solid foundation, brick 1)

James, 2026-10-19: "yes, get this solid. learn, and know what for what, limits, contraints, dynamic chunking, etc. memory,
everything that can get it working." · "ollama first, but nexus should be learning… as long as local and free can handle it."
· "the core foundation needs to be solid before t can build naything else." His machine: Ryzen 3700X / 16 GB RAM / GTX 1650.

First brick of `docs/2026-10-19-solid-build-foundation-phasemap.spec`, built bottom-up, free/local, no paid APIs.

## The problem

The escalation ladder is ordered smallest-capable local model first — but it discovered "won't fit RAM" **one rung at a time**:
each too-big Ollama model (`qwen3.5:9b` needs ~7.3 GB, `qwen2.5-coder:7b` ~5.2 GB, ~3.6 GB free) was selected, dispatched, and
skipped with `no-memory` before the climb moved on. On a 16 GB / 4 GB-VRAM box that is most of the ladder, every brick — churn
that wastes the local tier and pushes work onto the rate-limited browser agents.

## The fix — leave off what can't fit, up front

- **`lib/pipeline-routing.js byFit(rungs, { fits })`** — at readiness, a local (Ollama) rung whose model cannot fit free memory
  *now* is left off the ladder, with why. A **skip, not an attempt** (nothing recorded against it, the climb never counts it as a
  failure) — mirroring `present()` for not-installed models. A guardian (non-Ollama) rung is **never** memory-gated — the reasoning
  tier stays available. The `fits(model)` predicate is injected (the caller binds `lib/resource-monitor.js fitsModel` with the
  current Ollama sizes/loaded), so the routing module stays pure and testable.
- **`fittingModels(models, { fits })`** — the shared "what fits now" oracle. DC1 (dynamic chunking) will size a chunk to a fitting
  model's budget; AB1 (resume) will wait until at least one model fits before re-attempting. One place answers "what can run locally
  right now," reused instead of re-derived.
- **Wired at readiness** (`idearium/api/index.js`, the run-ready block): the ladder is pre-filtered by per-model fit (not just the
  coarse ok/pressure/critical level it already had). If every local model is too big *and* no guardian rung remains, the run is
  refused with `NOT_READY { memory: true }` and the exact reason — instead of silently churning. The per-rung dispatch check stays
  as a safety net (RAM moves between readiness and dispatch).

## Reuse, not new (§8.6)

`fitsModel` (resource-monitor), the ladder, `present()`'s skip semantics, and the existing `idearium/api/index.js`→routing /
→resource-monitor edges — all reused. No new component, no loom declaration needed; `byFit`/`fittingModels` are functions on the
already-mapped `pipeline-routing.js`. No paid APIs.

## Proof

- `tests/modules/test-model-fit-ladder.test.js` — MF 5/5 (registered in `run-all.js`): byFit keeps the fitting local models in
  order and skips the rest with why (MF-01); never memory-gates a guardian rung (MF-02); a no-op without a predicate (MF-03);
  `fittingModels` returns only the fitting models (MF-04); and against the **real** `fitsModel`, a model 4× total RAM is left off
  while guardian stays (MF-05).
- `test-pipeline-routing` 19/19 (regression; the one transient 18/1 was a cold-start timing blip on an HTTP-route test, 3/3 green on
  repeat).

## Files

- `lib/pipeline-routing.js` — `byFit`, `fittingModels`, exported.
- `idearium/api/index.js` — pre-filter the ladder by per-model fit at readiness.
- `tests/modules/test-model-fit-ladder.test.js`, `tests/modules/run-all.js` — the test, registered.
- `lib/version.js`, `package.json` — 0.60.163.
- `docs/2026-10-19-solid-build-foundation-phasemap.spec` — MF1 marked built.

## Next

DC1 — dynamic chunking at plan time, sized to the fitting model (using `fittingModels`), so a small local model gets a unit it can do.
