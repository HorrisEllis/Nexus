# 0.60.253 (renumbered from 0.60.249) — AU1: the automation union, one neutral door over all six sources

James, 2026-10-24: "copilot system, ollama, lib folder, clearglass, idearium, and brainos have automation"
James, 2026-10-25: "Copilot programmable and automation and the Lib folder automation. Clearglass automation, and macros, continue."

He named the six places that run automation and said unify them. AU1 does, through one neutral registry —
`lib/automation-registry.js` — with an adapter per source, not six engines merged into one.

## What changed
- **`lib/automation-registry.js`** (new): the one door.
  - `sources()` — each of his six sources (copilot, ollama, lib, clear-glass, idearium, brainos) with its presence, named.
  - `list({source})` — the workflows **and** macros across every present source, merged; a source that fails is named in
    `sources[]`, never thrown (§1.2).
  - `run(source, id)` — runs one automation through its source and **records it under that source** (and says `via` when the
    shared engine actually executed it — no silent redirect).
  - `describe()` — the honest self-model: which source is the engine, which are drivers, which is in-process, which is absent.
- **Route** (his delivery order): `GET /api/automation` (and `?source=`), `POST /api/automation/run`.
- **Command**: `automation list [--source <id>]`, `automation run <source> <id>` — so every agent has it through `nexus.command`.
- Wired into loom with its real consumer edge (idearium/api → the registry).

## Reuse before build (§8.6), and what that surfaced (§0.0 truth over coherence, §0.1 evidence)
Read before built: there is exactly **one** real workflow+macro engine in this tree —
`clear-glass/src/mesh/automation-engine.js` (:7704), already complete (triggers, steps, cron, webhooks, runs). So the registry
does **not** invent six engines; it reaches that one over the wire door `lib/agent-tools` and `ui/brainos` already use, and
tells the truth about each source:
- **clear-glass** — the engine itself (workflows + the `.macro` nodes).
- **brainos** — that engine's own store (`data/brainos/workflows`); the same data, surfaced under brainos, not a second engine.
- **copilot** / **idearium** — **drivers** that run on the shared engine (copilot via its agent-tools; idearium via the BrainOS
  fold BX7); no separate store, so a run delegates and says so.
- **lib** — does not run automations; it **defines the node types** every source builds from (`lib/node-schemas`:
  `schema.macro`, `schema.workflow`, `schema.debug_macro`).
- **ollama** — has **no** automation surface at all (checked 2026-10-25); named absent, never faked.

Cobalt's `automation/engine.js` was deliberately **not** ported: this tree already has the richer engine, and a second would
duplicate it. The transport is dependency-injected, so the registry is a pure, testable neutral core with no static
cross-system require; the edge to :7704 is a runtime port (the declared convention), not a boundary crossing.

His decision **AU_D1** is recorded DECIDED 2026-10-25 in `docs/2026-10-24-agent-orchestration-phasemap.spec`, with the finding
above attached as the coder's, to confirm the framing with him.

## Proof
- `tests/modules/test-automation-registry.test.js` **11/11** (in `run-all`): lists workflows and macros from clear-glass;
  brainos surfaces the same store via clear-glass; a run records under its source with `via`; lib refuses honestly saying where
  it runs; ollama is named absent; the engine down is named in `sources[]`, never thrown.

## What is next (his delivery order)
The UI — a panel on the BrainOS Flow canvas that lists the union and runs one — is deferred to the BrainOS build (BX), said.
