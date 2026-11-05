# CHANGELOG 0.60.412 — EAS4e built, EAS4f started: Cortex is Emerge's build host by route; Guardian's /build runs in Emerge

James, 2026-11-05, asked how Nexus's pieces take part when it asks Emerge through its door: "Emerge calls back by route"

## Built
- **Cortex serves Emerge's build host** on its own routes: `POST /api/emerge-host/ping`, `/preflight` and `/writeback`. They live in
  `cortex/boot.js`, are reached through Cortex's door, and have three entries in Cortex's own registry. The handlers are
  `lib/emerge/cortex-query`'s two files, copied unchanged into `cortex/emerge-host/`, so a build's answer does not change.
- **Guardian's model needs no new route.** Its `POST /api/copilot/prompt` already answers Emerge's model contract, with RAID resolving
  the provider. Emerge's route model gained `extra`: fields the route's own contract takes, such as `provider` and `timeoutMs`.
- **`guardian/server.js` `POST /build` runs in Emerge** (`POST /compiler/run`). The host is named by Cortex's routes, and the model by
  Guardian's own ask route. The files are written to the output folder as before.
- **`lib/nexus-client.js` `urlOf(system, path)`**: a route as a URL, from the ports table. It is transport only. Each caller names its own
  host and model settings, because lib is not for what a system uses (his 2026-11-03 rule).

## Found by reading the old code first (EAS4e's prerequisite)
- **Preflight:** `/api/gaps` and `/api/memory?table=` answer. `/api/projects`, `/api/files` and `/api/memory/search` are served by no
  system, so `existingFiles` is always empty and `skipGeneration` is never true.
- **Writeback:** `/api/event` and `/api/table/insert` answer. `/api/files/upload` and `/api/versionium/commit` do not. All of this is kept
  as it was; a fix is its own phase.
- **Idearium's sync:** all five of its routes are served by no system, and it posts to :7820 (Guardian's port). It has always failed
  silently, so it was not rebuilt: dropping it changes no answer anyone gets.

## Named differences (Guardian's /build)
- An unconnected provider now fails fast, with its reason. The SEAM queue (`/command`, `'seam'`) waited for it.
- `guardian.build.progress` is emitted after the run, from its list, not live.

## Proof
- `compiler-door` 8/8; `test-cortex-door` 4/4; `test-emerge-in-nexus` 5/5; `test-substrate-spec` 3/3.
- Census 1122 → 1121: Guardian no longer requires lib/emerge.
- `test-registry-sovereign` RS-01 fails the same way on main without this change: Loom's `cos-testenv-map.js` grew 122 → 124 lines
  elsewhere.

## Left in EAS4
- EAS4f: `idearium/compiler-bridge.js`, `copilot/module-builder.js`, `lib/build-pipeline.js`.
- EAS4g: archive lib/emerge, with phase-specs and kg-builder moved into Emerge first (EAS_D7).
