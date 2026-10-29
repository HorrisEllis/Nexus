# 0.60.203 — a starved machine does not spin

James, 2026-10-22: "yes" — to the coder's three fixes after his SP5 run:
1. stop the loop;
2. a pinned local model that won't fit goes to the browser agents and says why;
3. a build step never auto-applies a file it wasn't asked for.

Map: docs/2026-10-10-idearium-solid-phasemap.spec, SD20_a_starved_machine_does_not_spin (DAG checked: layer 3, no problems).

## What his run log showed
- **Memory.** Free memory sat at 1–9% for long stretches. Settings pinned the build to Ollama, so SP5 went to qwen2.5-coder:7b. That model
  did not fit his GPU ("failed to allocate CUDA_Host buffer") and ran on the CPU at 90–120 s per job.
- **The loop.** Every reply the build produced was staged as a drop. The officiator then turned each one into the same goal, "Build
  phase SP5_title by ensuring lib/title.js…", about every 30 s:
  - each synthesis was another model call;
  - each contract ended blocked_at_handshake or failed;
  - about 20 of them came in ten minutes.

  Each drop was different, so the officiator's per-drop dedup never caught it.
- **The stray file.** The repo's inject mode was 'auto', so a spec/title.spec written during a code step was applied without anyone
  seeing it.

## What changed
1. **The loop stops** (cortex/core/raid/officiator.js 1.2.0, worker.js; lib/intake.js).
   - **One goal, one contract.** A goal that already has an officiator contract queued or running, or one that failed or was blocked
     within the hour, is not queued again. The goal is the intention plus the file it names. The drop is marked officiated with
     `duplicateOf` pointing at the earlier contract, and the log says so. A bare verb like "build" with no file is never treated as one
     goal.
   - **A failing streak holds synthesis.** When the officiator's own last 3 contracts all failed or were blocked, it stops making
     model calls until an hour after the newest one. This is said once, with the latest reason. `idearium raid unpark all` (or
     POST /api/raid/officiator/unpark) clears it, and `parked()` shows it.
   - **Memory is read before each synthesis,** not only at the start of the tick. The RAID worker now waits on memory the same way the
     officiator already did. A queued contract waits; nothing is failed for it.
2. **A pinned Ollama falls back** (lib/pipeline-routing.js 1.3.0 `pinnedLadder`; idearium/api/index.js `_phaseBuild`).
   - With no ladder and Settings pinning Ollama, the build climbs the pinned model first, then the chain's agents (gemini, chatgpt,
     claude, deepseek).
   - The existing checks then apply to it:
     - a model that is not installed is left off (present);
     - a model that will not fit free memory now is left off (the MF1 fit check);
     - critical memory moves it after the agents.

     The run's route says which applied and why.
   - The pin is his choice, so the minimum model size never drops it.
3. **An off-phase file is held** (lib/repo-inject.js `expectPhase`/`outOfPhase`; `land()`; lib/code-edit.js `commit`).
   - While a phase builds, the build names its files. An agent's file outside them stays a proposal, whatever the inject mode. So does
     a spec, doc or phasemap while the phase asked for code. The reason goes on the proposal he sees: "held for review: spec/title.spec
     is not code, and the phase … asked for code (lib/title.js)".
   - A person's own change is never held.
   - Another phase's write is judged by its own build.
   - When the run ends, the hold ends.

## Proof
- **tests/modules/test-starved-machine.test.js, 5/5:**
  - SM-01: the pinned ladder, its move under critical memory, the fit check leaving the 7b off, and no size floor on a pin.
  - SM-02: the build reads the pin before the fit check.
  - SM-03: in auto mode, through the real repo layer, lib/title.js is applied; spec/title.spec and lib/other.js are held with the
    reason; another phase's file is applied; after the build, nothing is held.
  - SM-04: the code-edit tool path holds docs/title.md for an agent and applies a person's change.
  - SM-05: sameGoal and failStreak cover window, case and spacing, another file, a bare verb, a pass breaking the streak, and unpark.
- **tests/modules/test-raid-officiator.js, 18/18.** OFF-RT1c was changed: `unpark('all')` now also records when the streak was
  cleared (`__streakClearedAt`), so the test ignores `__` keys.

## Not changed, said
- **The handshake block itself.** The officiator's free-text intention fails `checkAgentIntentContract`, so these contracts would still
  end blocked. They are now made once, not every 30 s. Mapping a synthesized intention to an allowed verb is the next step if he wants
  the officiator's contracts to run.
- **The two title.js files in his SP5 repo.** That repo was imported before the 0.60.200 wrapper fix. Re-importing Looking Glass ends it.
