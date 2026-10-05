# 0.39.314 — 2026-10-05

James: "There is only 15 systems. Not 27. Any system that’s in idearium is a system, nothing more."

## One list of systems (SY1)
Idearium's 15 are the systems: orchestrator, cortex, guardian, idearium, architect, diagnostic, eravos, intelligence, ollama-bridge, versionium, copilot, loom, clear-glass, components, core (`lib/nexus-self/systems.js`).

Loom's phasemap scanner kept its own list of 27 "systems". Those were tags: agent, chunk, raid, gemini, tablet, bridge, cos, warp, emergence, economy, nexstore and others. Now:
- **`systemFor(tag)`** in `lib/nexus-self/systems.js` resolves any tag to one of the 15:
  - a system's own name is itself (before, ollama-bridge, components and core fell to core);
  - a known alias goes to its owner: raid, chunk, replay and snapshot to cortex; agent to guardian; gemini to copilot;
  - any other tag goes to the system that owns that directory: lib, cos, warp, emerge and docs to core.
- **The scanner** guesses from words drawn from `systems.js`, with no list of its own. Declared and guessed tags both resolve to the 15, and the tags as written are kept as `tags`. A phase that names nothing is core's (it used to be "general", which isn't a system).
- **`forSystem('raid')`** answers for cortex. A name that's neither a system nor a tag answers empty, so a typo never reads as core's roadmap.
- **The result:** 959 phases. `bySystem` has 14 keys and none outside the 15 (components has no phases yet).
- **Declarations:** the 2026-10-05 maps now declare only the 15. Older maps keep their lines as written, read through `systemFor`.
- **Superseded:** the emerge map's EV0 (4), which grew the list on 2026-10-02. An addendum there says so.

## Proof
- `test-loom-phasemap` 7/7. T-006 and T-007 were rewritten to the rule: every phase's systems are among the 15, `bySystem` has no other key, EV0 is core's with cos and warp kept as tags, and `forSystem('raid')` is cortex.
- `test-moce-roadmap` 43/43. The one-parser check now carries `tags`.
- phasemap status 12/12, phases-nodes 21/21, nexus-self-and-cos-run 30/30, diagnosis-facts 10/10.

## Found
`loom/test/phasemap-map.test.js`'s persistHistory check fails on 0.39.313 too, before this change. It's mapped as HG9.
