# 0.60.535 — Ollama runs on whatever model is installed, so the pipeline's Ollama step can run on his PC

James, 2026-11-14: "We need the highest leverage, that gets me closer to cutting depende on you and using it the pipeline to build nexus.
Vital. The pipeline. Focus on that." His words for this fix, the day before (2026-11-13): "Have it use any that's on my pc. Fallback to any
other?"

## Found
- His PC's log of 2026-11-14 shows the default model, `qwen2.5-coder:7b`, is not installed.
- **The build pipeline.** It tries agents in order, local Ollama first, then the paid agents (Idearium's ladder). An Ollama step whose model
  is not installed was left off before the build started (`lib/pipeline-routing.js` `present`, a rule from 0.52.0). So on his PC the build
  went straight to the paid agents.
- **Every other caller.** Copilot, the chunk builds and anything else calling Ollama through its bridge asked for the missing default model
  and failed.
- So the pipeline could not build anything on Ollama. This is the dependence he named.

## Fixed (PC18 slice a, docs/2026-11-08-pipeline-canvas-phasemap.spec)
- **The ladder** (`present`): a step whose model is not installed now runs on an installed model that is not already on the ladder. A coder
  model is chosen first, then the order Ollama lists them in.
  - The run says so ("swapped: … runs in its place").
  - The step is left off only when no installed model is left.
- **The bridge** (`ollama/lib/ollama-client.js` `callOllamaRaw`): before each call it reads the installed models (kept for 30 s). A missing
  model is replaced by an installed one, and the log names both.
  - If the list cannot be read, it asks for the named model, as before.
- **Idearium's build** reports the swap on the run's route.
- **Scope.** Existing JavaScript changed; no new code file (§17.13).

## Changed test, said
- HR-03 (`test-hardening-pass`) asserted the old rule: a missing model's step is left off. His call of 2026-11-13 replaces that rule, so
  HR-03 now asserts the swap. The old behaviour is kept, and asserted, for the case where every installed model is already on the ladder.
- `test-ollama-tape`'s stand-in Ollama counted every request as a model call. The bridge now asks for the installed list first, so the
  stand-in records only model calls.

## Proof
- `node tests/modules/test-ollama-uses-what-is-installed.test.js`: 4 passed, 0 failed.
  - A ladder naming a missing model runs on an installed coder model.
  - With nothing installed, the step is skipped as before.
  - The pick rules hold.
  - The bridge, against a stand-in Ollama, runs a call for the missing 7b on the installed 3b.
- Passing, among the related suites: hardening-pass 9, pipeline-routing 20, escalation-ladder 9, model-fit-ladder 5, ollama-runtime 9,
  ollama-tape 5, agent-routing 16, guardian-dispatch-ladder 18.

## Not yet seen
- Not yet seen on his PC: the build pipeline (`idearium-build`) taking one small phase from start to finish on Ollama. That run is the
  evidence for thread T11.
