# Automation engine — dependency graph (sovereignty), 2026-10-25

James, 2026-10-25: "rememeber each system is sovereign. i feel like that should have been raid. or the orchastrator. the
automation engine. supposed to be soveriegn." · "map the depency graph first,"

Mapped before any move (docs/CLAUDE.md rule 1, and his 2026-10-18 "each phase has to have a dependency graph before
executing"). This is the graph the placement decision is made from — evidence, not instinct (§0.1).

## The finding in one line
The automation engine is **owned by Clear Glass** (a browser/front-end system) but is used as the **platform's** automation
engine. Nothing outside Clear Glass loads its code — every other system reaches it over the **:7704 port**. And the engine is
**already a dependency-injected neutral core**: every outside action is an injected hook, not a static dependency. So it is
already sovereign-SHAPED; it is just living in the wrong system. Relocating it is a move-and-re-point-ports, not a rewrite.

## The real edges (from loom — the self-model)

```
nexus.clear-glass.src.mesh.automation-engine
  depends on (6):   clear-glass/automation/cron      (schedule math — neutral)
                    clear-glass/automation/template  ({{...}} resolver — neutral)
                    clear-glass/automation/steps     (step catalogue / field defs — neutral)
                    clear-glass/automation/dom        (DOM script strings — BROWSER only)
                    clear-glass/src/driver            (browser driver — BROWSER only)
                    lib/test-sandbox                  (core — allowed)
  used by (3):      clear-glass/automation/routes     (the :7704 door — clear-glass)
                    clear-glass/src/ipc/bridge        (clear-glass)
                    tests/.../automation-engine.test  (tests)
```

**No system but Clear Glass statically loads the engine.** Everyone else is a PORT edge over :7704:

```
  lib/agent-tools/tools/clear-glass-automation   ── HTTP :7704 ─▶  the engine   (copilot/agents)
  lib/ui/brainos/brainos-automation              ── HTTP :7704 ─▶  the engine   (BrainOS UI)
  lib/automation-registry  (AU1)                 ── HTTP :7704 ─▶  the engine   (the neutral door)
  idearium (the BrainOS fold)                    ── HTTP :7704 ─▶  the engine
```

## The seams the engine ALREADY has (why it is sovereign-shaped)
The constructor + `setHooks()` inject every outside action (automation-engine.js:177, :213):

| hook | what it is | whose system it belongs to |
|---|---|---|
| `enqueueFn` / `askAgentFn` | an `agent` step's dispatch → the mesh drainer → **RAID decides** | cortex / **RAID** (already) |
| `browserFn` | a `browser`/`extract`/`wait_until`/`macro` step → the Clear Glass driver | **Clear Glass** |
| `notifyFn` | a `notify` step | Clear Glass (today) |
| `busEmit` | `emit` and run events | nexus-bus (core) |
| `meshViewFn` / `statsFn` | a `condition` step reading live mesh | mesh (read) |
| `runMacroFn` | a `macro` step | Clear Glass |

Browser steps already fail-soft when Clear Glass is absent: `if (!this._browser) throw "browser steps need Clear Glass
running"` (automation-engine.js:743). So the engine does not *depend on* Clear Glass to run — it *calls* it when a step needs
a browser.

## The step split (what is browser's vs what is neutral)
- **Browser (4) — Clear Glass's, through `browserFn`:** `browser`, `extract`, `wait_until`, `macro`.
- **Neutral (10) — no Clear Glass needed:** `command`, `http`, `file`, `condition`, `loop`, `set`, `delay`, `fail`, `stop`,
  `workflow`.
- **`agent` — RAID's decision** (routes through the mesh drainer, the engine's header says so verbatim).

So **10 of 14 step types, the scheduler, the triggers (cron/interval/event/webhook), the run store and the data-flow engine
need nothing from Clear Glass.** Only 4 step types do, and they already go through a port.

## The sovereignty picture

```
TODAY (the smell):
    copilot ─┐
    idearium ─┤ HTTP :7704
    brainos  ─┼────────────▶  [ Clear Glass ]  owns  ▶ automation-engine (store+schedule+run+steps)
    AU1 door ─┘                     │ browser steps use the driver (internal)
    → ALL platform automation depends on Clear Glass being up.

PROPOSED (sovereign):
    AU1 door ─ HTTP port ─▶ [ engine core ]  ◀── owned by ONE sovereign system (to decide: orchestrator / dedicated automation)
                                 │  agent step  ── port ─▶ [ RAID ] decides        (already)
                                 │  browser step ── port ─▶ [ Clear Glass ] driver  (browserFn)
    → Clear Glass down = only browser steps pause; the rest of automation keeps running.
```

## Crossings to design out (DG2 — a NEW crossing is designed out before code)
After the move, every cross-system edge is a runtime PORT, never a static require:
- engine core → **RAID** (agent-step decide): a port. *Already* how agent steps route — no new static crossing.
- engine core → **Clear Glass** (browser-step driver): the `browserFn` port. Clear Glass registers it; the engine never
  `require`s Clear Glass.
- **Clear Glass** → engine core: registers its `browserFn`/`runMacroFn` at boot — a port.
- `dom.js` (DOM script strings) and `src/driver` stay in **Clear Glass** (browser-only); they move *behind* the `browserFn`
  port, out of the engine's static deps.
- The AU1 registry adapter's target changes from `:7704` (Clear Glass) to the engine core's new port. **The registry itself
  does not change** — it already hides the engine behind an adapter (that is what AU1 was for).

## What this graph decides, and what stays yours
- The axioms settle two of the three parts: the **agent-step decision is RAID's** (§5.2/§9.1, already true), and the
  **browser steps are Clear Glass's** (a driver port). Neither is in question.
- What is **yours** (USER_AUTONOMY — the direction): where the **engine core** lives — the orchestrator (it already runs the
  platform's long-lived tick via lib/nexus/autopilot.js), or a dedicated sovereign automation system folded under one of the
  15. RAID is ruled out for the *core* by its own role (a per-job decider, not a cron/trigger/long-run loop) — it keeps the
  decision, not the loop.
- Nothing moves until you pick the home; then the relocation is mapped as a phasemap with its own per-phase DAG (your
  2026-10-20 order: spec → phases → each phase specced again) before any code.
