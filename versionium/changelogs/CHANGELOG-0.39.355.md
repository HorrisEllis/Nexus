# 0.39.355 — 2026-10-05

James: "okay. i clicked on a phase in the phases tab in nexus core to have it built. it needs to actually build it"

This was mapped first as PB1–PB5 in `docs/2026-10-05-cli-data-code-phasemap.spec` (1.5.0). Everything in it comes from your log and screenshot.

## Why it didn't build
1. **BL8 went to `huihui_ai/qwen3-abliterated:0.6b`.** The derived ladder sorts your Ollama models smallest first, so a 0.6b model was the first rung.
2. **Its reply changed no file, and the build still counted it as "replied".** So the ladder never climbed.
3. **Round 1 failed on 71 broken imports that were already broken before anything was built.** The repair then sent those unrelated files to the 3b model to rewrite, at 33k characters and 220 s each.
4. **Most of those 71 were not imports.** They were `require('…')` written inside test fixtures' strings.

## Now
- **PB1: the ladder has a floor.** `routing.min_build_b` (default 3, in Settings → Routing) leaves off Ollama models smaller than that.
  - The ladder's description names what it left off.
  - 0 keeps every model.
  - A model with no size in its name stays.
  - A ladder you wrote in `routing.escalation` is used exactly as written.
  - For your models, the ladder is now: 3b → 7b → 16b deepseek → the agents.
- **PB2: a reply that changed nothing is incomplete.** An attempt only counts if it brought back a file (an inject) or ran a write tool that succeeded. Otherwise the attempt is `incomplete` ("the reply changed no file"), and the ladder climbs.
- **PB3: a round fails only on what the run broke.**
  - For a Nexus repo, the prove loop verifies once before it builds, and that result is the baseline.
  - Older failures, in files the run didn't build, are **known debt**. The Plan counts them each round, and they're never sent to an agent.
  - A file the run built is its own, even if it was already failing.
  - Any repo can ask for this with `{ debt: 'baseline' }`.
  - With only known debt left, the verdict is `parses`, not `proven`, because the tests don't run while anything fails.
- **PB4: strings aren't imports.** `resolveDeps` counts a quoted string as an import only right after `require(`, `import(`, `from` or `import`. Files under `_archive/` aren't checked.
- **PB5: real stale paths fixed.** `cli/run-supervised.js` now requires `orchestrator/orchestrator.js`. `erosmancer/erosmancer-os/tests/run.js` is archived to `tests/_archive/`, since `tests/suite.ts` replaced it.
- **Result: 71 broken imports in the Nexus tree went down to 13.**

## Left for you to decide
- **13 imports in 8 test suites whose subjects are gone.** They already crash in run-all, and with PB3 they're known debt, not sent to an agent.
  - The suites: admin-server-routes, brainos-panel, brainos-panel-canvas-integration, copilot.test, flush-redundancy, test-intelligence-bridge, tests/pipeline.test.js, tests/hooks-side-effect-parser.test.js.
  - Archive them, or rebuild what they tested?
- **BL8 itself names no files.** Moving every spec out of docs/ would break the tests that read them by path, so no agent can build it well until it has a file list.

## Proof
- **`tests/modules/test-phase-actually-builds.test.js`, 6/6:**
  - **PB-01:** the floor on your four models; 0 keeps every model; a written ladder is untouched; the setting is in Settings.
  - **PB-02:** what counts as a change.
  - **PB-03:** the old broken import is debt, the new one fails, a rebuilt old file is the run's own, and with no baseline every failure counts.
  - **PB-04:** strings inside test fixtures; ESM imports; `_archive/` isn't checked.
  - **PB-05:** the Nexus tree.
  - **PB-06:** the wiring.

## Versions
- idearium 4.31.0 (MINOR: a config key, and prove takes `debt`).
- pipeline-routing 1.2.0.
- build-verify 1.1.0.
