# 0.60.231 — 2026-10-24

James, after 0.60.230 counted 20 systems: "15 systems. only the ones with a .spec in the directory. all the systems in idearium"

## His decision

The systems are exactly Idearium's own list, `lib/nexus-self/systems.js` SYSTEMS:

> orchestrator, cortex, guardian, idearium, architect, diagnostic, intelligence, ollama-bridge (`ollama/`), versionium, copilot, loom,
> clear-glass, components, cos, and core (the kernel, `lib/`)

This supersedes 0.60.230's count of 20. It also supersedes the coder's reading that had put components among the parts. Both are kept in
the map's addendum.

## Changed

- **`lib/system-boundary.js` `realSystems()`** reads Idearium's list.
  - The sovereignty census lists only those 14 folders; core is the kernel.
  - Every other folder with code is named as **unhomed**, with who uses it: warp, nexus, meta, emerge, hooks, cockpit, cli,
    architecture-spec, contracts, emergence, seams, service, tablet, ui.
  - The scan itself is unchanged: a require into `warp/` is still a real edge, and the ratchet's baseline still holds it.
- **`lib/registry-draft.js`** drafts only for Idearium's systems that have no registry: orchestrator, cos and components. The six drafts for
  cli, cockpit, emergence, meta, nexus and warp are withdrawn; they were generated, so they can be regenerated.
- **`components` is off `PARTS`**, because it is on his list.

## His ".spec in the directory", checked

- 13 of the 15 have a `.spec` in their folder.
- components has none.
- core has no folder of its own (`lib/`); `docs/lib.spec` exists.

The components gap is said, not decided.

## Measured

- Sovereign: only components, which reaches into nothing.
- Fewest ways out after it: cos 4 (1 data, 3 primitive), then architect 6 and ollama 6.
- Most entangled: idearium and orchestrator, 37 each.
- The unhomed folders' users are listed, so each one's home can be read from the evidence, as 0.60.230 did for the eight.

## Proof

- `tests/modules/test-registry-draft.test.js` 6/6:
  - RD-06: the systems are the 15 on Idearium's list, and only those 14 folders are listed; warp, nexus, meta, cli, cockpit, emerge and
    emergence are unhomed, each with its users; their drafts are withdrawn;
  - RD-02: the missing registries are exactly orchestrator, cos and components.
- Also green: test-drawbridge-registry 8/8, test-system-registry 9/9, mco15-component-boundary-check 5/5, test-phase-specs 7/7,
  test-phase-graph 5/5.
- test-system-boundary SB-06/SB-08 fail the same way as before this change.
