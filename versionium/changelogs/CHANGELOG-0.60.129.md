# 0.60.129 — 2026-10-17

James: "all system relevant files should stay with the system.
the data nodes should reflect guardians nodes but in relation to the system they are for."

## His decisions, recorded

They are in `docs/2026-10-17-system-drawbridge-phasemap.spec`, addendum (c).
- A file that serves one system lives in that system's folder. This follows from his "sovereign and self contained": a
  compartment can only hold what is in its folder.
- Each system's data nodes are in Guardian's shape and carry their relation to the system they are for.

The coder's reading of "in relation to", to confirm:
- **What is built:** each node names its system, and the system's dependencies are nodes too.
- **Another reading, not built:** each node names the other systems it touches. That needs the event bus (DB4).

## Built: DB18, nodes in relation to their system

`lib/system-nodes.js` is his 0.39.271 generator: "exactly like gaurdian where all data, commands, etc are physical node
types". It already wrote every system's capability, command and system nodes into `<system>/data/nodes`, and the
orchestrator regenerates them at boot. Two things were missing.
- **Every node said `system: null`.** Each node now names its system.
- **No node held the system's relations.** Now:
  - each system holds one `.wire` node per system it depends on, with its kind (kernel, upward, or system to system past
    the drawbridge) and the file edges behind it;
  - its `.system` node holds `depends_on` and `consumed_by`;
  - a wire that stops holding is archived, not deleted.

The nodes on his machine update on the next start. `data/**` is state, so regenerated nodes are not committed.

## Built: DB17, the census (nothing moves yet)

`lib/system-boundary.js` `homes()`, `GET /api/system/homes` and `system homes [<system>]` cover the 495 files in the
shared folders (lib, hooks, service, contracts, components, architecture-spec, seams).
- **93 belong to one system:** they are used only by it, or named for it in `hooks/` or `service/`. By system: idearium
  34, copilot 14, guardian 9, cortex 9, nexus 5, clear-glass 4, orchestrator 4, cli 3, and 1 or 2 for the others.
- **58 are required by nothing through a static path.** That does not make them dead: tools and entry scripts are loaded
  by name, so they need a check before anything is said about them.
- **The coder's limit, applied:** the name rule only counts in `hooks/` and `service/`. A tool in `lib/agent-tools`
  named after a system is about that system, not part of it.

**The moves (open):**
- One system at a time, each a proposal.
- The file goes into its system and leaves a one-line re-export at the old path, so nothing that requires it breaks.
- The re-export goes once the ratchet shows nothing uses it.
- First are the 12 files named per system in `hooks/` and `service/`.

## Found

DB1 (0.60.126) missed `_require(...)`. idearium reaches other systems through `createRequire`, and the pattern's `\brequire`
needs a word boundary that `_require` lacks. So 22 crossings had always been there without being seen: idearium to cos
6, cortex 5, ollama 3, intelligence 3, loom 2, and others 1 each.

They are in `contracts/drawbridge-baseline.json` under `seen_late`, with that reason. They are not new drift. The defect
was found because `homes()` said `lib/system-registry.js` is used only by cli, while the idearium API uses it.

## Proof

- `tests/modules/test-system-node-relations.test.js`: SN-R1..R4 pass, on a fixture repo, including archiving a wire.
  SN-R4 caught a 10-second crossing cache that would have hidden a wire's removal, so the cache now lasts one sync.
- `test-system-boundary.test.js`: SB-01..10 pass. SB-09 covers `_require`; SB-10 covers `homes()`.
- Unchanged and passing: one-idearium-phases-nodes 21, node-export 10, node-index-watcher 3, system-registry 9,
  system-tunnel 7, drawbridge-registry 8.
