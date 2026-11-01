# 0.60.355 — every system walled by COS (CP1a)

James, 2026-11-01:
> "continue moving the rest of the systems into cos. then i want resource management for each cos compartment, and snapsjot"

This release is the first part: moving the systems in. Resources (CP6a), snapshots (CP5a) and his later "also can you add the nexus-sync
options to the control panel" (CP7a) follow, each in its own release. Map: `docs/2026-11-01-the-compartment-phasemap.spec` (CP_D5, CP1a).
Spec: `cos/spec/compartment.spec` (MOD-CP-WALLS), the start of CP0.

## Found

COS boots 14 processes. Two ran behind a wall: Loom (since LM6, 0.60.338) and Emerge (its own `emerge.cos`). The other twelve started
bare: architect, clear-glass, copilot, cortex, diagnostic, guardian, idearium, intelligence, intelligence-consumer, ollama-bridge,
orchestrator and versionium.

## Built

- **Each system declares its own wall** in its own `compartment.json`: `compartment: nexus-self-<system>` and `boundary`, equal to the
  census's `boundaryFor` (its folder, the kernel, `node_modules`). `scripts/cos-walls.js` writes them and `--check` compares them. COS's
  manager reads these files and never writes them.
- **The mode follows his DO_D9** ("audit first, enforce when the audit is empty"):
  - **Enforce** for the Ollama bridge, which has no way out.
  - **Audit** for the eleven systems with ways still open (3 to 31 each). Each crossing is a `wall` line on COS's ledger, and the boot
    still goes through.
- **Clear Glass (Electron) is walled through `NODE_OPTIONS`**, because Electron takes no `--require` on its command line.
  - Found by running it: Node reads a backslash inside quotes in `NODE_OPTIONS` as an escape, so the Windows path lost its separators
    and the preload failed. The path now goes in with forward slashes.
- **A junctioned mount is the same mount**: an allowed folder reached through a junction (a worktree's `node_modules`) is allowed by
  its real path too.
- **`cos/manager/walls.js`** reports each wall:
  - its mode, and how it is put up;
  - the crossings it has said since its process last started;
  - whether it is ready for enforce.

  Served at `GET /api/cos/walls`, and as the row `cos walls` for him and every agent. The Overview card says "walled" or "audit wall".
- Loom: `walls.js`, `scripts/cos-walls.js`, and the supervisor's wire to `boundary.js` (the preload, by path) are mapped in
  `loom/maps/cos-testenv-map.js`.

## Proof

`tests/modules/test-cos-walls.test.js` **5/5**:
- CW-01: all 14 declared processes are walled, and each wall equals the census.
- CW-02: an audit wall lets a crossing through, and the crossing is a ledger line that `walls.report` lists.
- CW-03: Electron's command carries `NODE_OPTIONS` and `COS_BOUNDARY`; the junction's real path is allowed.
- CW-04: **the real Ollama bridge, started by COS's supervisor behind its enforcing wall, answers `/health`, and the wall refused
  nothing.** It ran on a spare port, pointed at no orchestrator, beside his live Nexus.
- CW-05: **a real Electron main process, started the way Clear Glass is, is behind the wall.** The refusal line came from inside
  Electron's `main.js`.

Also green: `test-cos-walled` 3/3, `test-cos-supervisor` 8/8, `test-substrate-spec` 3/3, `test-loom-map` 19/19.
- SV-08 was updated for the wall. It had also been failing since MG17b: it compared a `{{root}}`-filled absolute entry path with
  `cortex/boot.js`.

**Not fixed here, failing before this release too:**
- `test-compartment-declarations` CD-02 (`clear-glass.env`).
- `test-compartment-declarations` CD-05 (path separators on Windows).
- `test-cos-ui` CU-06 (the Clear Glass host exited: his running Clear Glass holds the single instance).

## What is not walled

The wall stops code coupling (`require`). It does not stop `fs` reads, child processes or the network. Clear Glass's children inherit
its `NODE_OPTIONS`, so their crossings are said under clear-glass. On his next boot, `cos walls` lists what each audit wall said: that
list is the work left before enforce.

## Versionium

His Versionium runs on this machine, but this release is on a branch, not his running tree. The boot sync records it when it lands.
