# 0.39.341 — 2026-10-05

James: "cos needs to be a nested compartment"
Asked where (its own system, or nested inside core), James: "Its own system (16th)"

Mapped first as SY2 in `docs/2026-10-05-cli-data-code-phasemap.spec` (1.4.0), right after SY1 (the 15 systems).

## COS is its own system
- **`lib/nexus-self/systems.js` lists `cos`:** `dirs: ['cos']`, loom tag `cos`, no process of its own. That's the same shape as `components`, the last nested repo without a process.
- **`cos/` belongs to COS now, not core.** The glue in `lib/` that reaches COS stays core's: `lib/cos-bridge.js`, `lib/cos-run.js`, `lib/repo-run.js`.
- **The next nexus-self sync makes the nested repo `nexus/cos`** in its own compartment under `nexus`. Core re-syncs without `cos/`, so its index is rebuilt once, and an agent asked during that waits for it (SB35).
- **Phases tagged `cos` are COS's.** That covers the COS machines map (VM1–EL1) and EV0's COS part. `forSystem('cos')` answers them, which is COS's Phases tab.
- **SY1's "only the 15" becomes "only the systems in `systems.js`" (16)**, on James's answer.

## Atlases
- **`docs/atlases/cos-atlas.md` (new).** Core atlas's `cos/` section, moved unchanged, plus its generated half: 139 files, with their routes and events from the registry.
- **`docs/atlases/core-atlas.md`** keeps a pointer where the section was. Its generated half is rewritten without `cos/`.
- **`docs/atlases/nexus-atlas.md`** gets a `cos` section, and its count is fixed: sixteen systems. It still said fourteen, which was already one short.

## Proof
- `test-loom-phasemap` 7/7. T-006 and T-007 now pin `cos` as a system, the COS machines map as COS's, and VM1 on COS's roadmap.
- `test-nexus-atlas-refs` 53/53.
- All 17 suites that read `systems.js` are green.
- version-sync 30/30.
- Loom regenerated from scratch, with nothing lost.
