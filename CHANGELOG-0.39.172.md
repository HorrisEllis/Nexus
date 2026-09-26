# v0.39.172

## Eravos — v3-17 catalog swap + organism → mod rename

- App layer replaced wholesale with the uploaded v3-17 standalone catalog
  export: `mods/` (was `organisms/`), `runtime/`, `specs/`, `kernel/`,
  `behaviors/`, `workspace/`, `index.html`, `manifest.json`. 8 new mods
  added: `macro-automation`, `master-fx`, `photo-editor`, `serial-bridge`,
  `sidechain-compressor`, `supersaw`, `video-editor`, `webhook-automation`.
- `server.js`, `config.js`, `registry-components.js`, `data/` (including
  eravos's own per-system ledger), and the nexus-taxonomy schemas
  (`schema.component`/`system`/`node`/`hook`/`capability`/`command`) were
  **not** replaced — the standalone catalog has no concept of these; they
  are Nexus's integration layer around the app, not the app itself.
- Corrected an assumption made mid-session: initially believed the catalog
  had no equivalent for the 7 `nexus-*` bridge mods (`nexus-idearium`,
  `nexus-guardian`, `nexus-cortex`, `nexus-orchestrator`, `nexus-architect`,
  `nexus-diagnostic`, `nexus-bridge`). It does — byte-identical apart from
  the rename, and more complete (root's `nexus-idearium` was a 2-file stub;
  the catalog's has `data/` and `tests/` too). Diffed before discarding
  anything; no data lost.
- `organism` → `mod` renamed everywhere in this system: paths, filenames,
  identifiers, comments, spec text. 0 residual `organism` references in
  either the catalog or the root tree (was 476 catalog / 1525 root).
  `eravos.spec` bumped 3.0.0 → 3.17.0 to reflect the catalog version.

## Ledger — per-system ownership (root cause found, not just piled-up)

- Diagnosed the "piling up fast" complaint against the actual data: the
  flat `data/ledger/event_log.jsonl` (8.5MB / 13,556 lines / 3.5 days) was
  NOT growing at an abnormal rate — measured ~0.044 events/sec average,
  ~1 pulse per system per 5 minutes, which is sane. The real problem was
  architectural: `orchestrator/orchestrator.js` opened exactly ONE
  `createCFRLedger` instance (`data/ledger/`, systemId `'orchestrator'`)
  and every event crossing the bus, from any of the 15 real systems, was
  written into that single shared sink, forever, with no split and no
  rotation.
- **Backfilled**: the existing 13,556 lines were split into
  `data/<system>/event_log.jsonl` per system, resolved by
  `payload.systemId` for pulse-type events and `source` for everything
  else (the `_system` field itself was useless for this — it was always
  `"orchestrator"`, the relaying process, not the true origin). Verified
  13,556 in → 13,556 out, zero duplicate UUIDs against pre-existing
  per-system data.
- **Patched** `orchestrator/orchestrator.js`: `_eventLedger` (one shared
  CFR ledger instance) replaced with `_getEventLedger(system)`, a lazily-
  created per-system CFR ledger instance at `data/<system>/ledger/cfr/`
  — the exact pattern `guardian/server.js` already used correctly for its
  own CFR ledger (`data/guardian/ledger/cfr/`). Each system's coherence /
  tension / sigma is now computed over only its own events, not a blended
  global stream. Both real write call sites (`ledgerWrite()` and the
  `_bootSystems` event callback) now route through the resolved system's
  own instance. The admin/debug endpoints that were already scoped to
  `systemId: 'orchestrator'` (`handleCFRRoute`, `getAllBaselines`,
  `getAllStats`, `scanInvariants`) are unaffected — kept as an alias to
  orchestrator's own instance, since they report on orchestrator itself.
- **Not yet touched**: `_ledgerFd` / `LEDGER_FILE`
  (`data/ledger/orchestrator.jsonl`) — a second, separate raw-append sink
  that persists orchestrator's own in-memory `LEDGER[system]` ring
  (already correctly per-system in memory, just journaled to one flat
  file on disk). Left alone this pass since it's orchestrator's own
  operational replay journal, not the cross-system event stream — flagging
  it as the same shape of problem if it turns out to matter.

## Intelligence — "2 rows loading" traced, not yet fixed

- Could not find the literal string in `intelligence/`. Traced it to
  `guardian/jaa-store.js:474`'s `[jaa] Loaded ${tbl.size} rows — ${name}`,
  used by `intelligence/lib/domain-nodes.js`'s node-index store. That
  construction is memoized within a process (`_indexStore()` — confirmed
  only one `new JaaStore()` call site in `intelligence/`), and `JaaStore`
  itself already has a prior fix (`§FIX 2026-07-24b`) for exactly this
  "fires on every call" failure mode. The only way this line repeats in
  autopilot's output is if intelligence's process is restarting — each
  restart is a fresh process, fresh memoization, so it reprints
  `[jaa] Loaded 2 rows — <table>` on every boot. **Not fixed**: the visible
  symptom is a crash-restart loop, not a chatty log line, and muting the
  line would hide that signal. Needs autopilot's supervisor/restart-count
  log checked before deciding whether to fix the log or the restart.
- Data-folder migration for the intelligence system: not started.

## Guardian — routes/interaction-contract hardening

- Not started. Confirmed the shape of the problem: `guardian/
  interaction-contract.json`'s own reconciliation note documents real
  drift between itself, `contracts/nexus-interaction-contract.js`, and
  `guardian/server.js`'s actual routes, including a live 404 bug
  (`/memory/ledger`, `/memory/artifacts`, `/memory/stats` are called by
  real client code with no server handler). ~25 files across cortex,
  orchestrator, loom, copilot, and every UI shell hardcode their own
  fetch calls to Guardian's port/routes instead of going through one
  client — which is why a Guardian change breaks unrelated callers.
