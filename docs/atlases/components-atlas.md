# components — the store of everything WARP builds

> **status: built (0.39.266)** · no port, no process · `lib/component-store.js` · plan: `docs/2026-09-27-components-store-and-atlases-phasemap.spec`

---

## What it is

Every file the Idearium build path completes through WARP is kept here, one folder per component version, with the dependencies it needs pinned by id and version. A later build asks the store before spending a token: first by the file's contract (its path, layer and purpose), then by the exact prompt. A hit completes the chunk with the stored bytes at zero cost, and it keeps working after the spec that first built the file has been purged.

Each component is `components/<id>/<version>/` holding the file itself and a `component.json` manifest (id, namespace, name, version, path, sha256, purpose, dependencies, unresolved requires, npm packages, who built it, and the reuse keys that point at it). The id is the project name plus the dotted path (loom's rule, with the project in place of "nexus"); versions count up as 1.0.n and the same bytes never make a new version. `components/index.json` lists every component and both reuse indexes.

A dependency named by relative path is pinned the moment it is stored; if the file it needs arrives later, the earlier manifest is pinned then. Nothing is dropped: an unmatched require stays listed as unresolved with the path it asked for.

## How it is reached

- The build path: `idearium/api/index.js` (speceng.build asks before dispatch; the synchronous and the callback completions both store).
- The API: GET /api/components (list, or ?q= to search), GET /api/components/<id> (manifest and closure), POST /api/components/<id>/invalidate (stop reusing a wrong version).
- Agents: loom.find.tool with kind "stored", and loom.card.tool / loom.read.tool with store:<id>@<version> — `lib/registry-harness.js`, `lib/agent-tools/tools/loom/harness.js`. A near match is found, never pushed into a prompt.
- Idearium: the nested repo nexus/components (`lib/nexus-self/systems.js`). Loom never scans it (`loom/scanners/source-map.js`); tests write to their own sandbox store (`lib/test-sandbox.js`).

Tests: `tests/modules/test-component-store.test.js`.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
