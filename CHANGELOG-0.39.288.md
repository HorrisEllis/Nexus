# 0.39.288 — 2026-10-01

James: "running really bad … the settings in idearium. it takes forever to load the repos on boot." Also: "map it all, phase it all … don't miss anything."

## Boot and the Nexus repo sync
- **The cause, measured.** On every boot one core file had changed, so the nexus-self sync re-ingested all of nexus/core:
  - about 2,000 chunk files and 2,000 `.chunk` nodes written, and the old 2,000 of each deleted;
  - a 20 MB manifest saved again;
  - 45 s on James's disk; here, the spec step alone held idearium's loop for 3–4 s.
  The repo list and the settings console waited behind it.
- **In-place update.** When the file set is the same, only the chunks whose content changed are rewritten, inside the same spec (`updateIngestedSpecAsync`), with one save. On the real core, the spec step went from 4.3 s to 0.21 s and the longest stall from 3.0 s to 0.27 s.
- **Whole re-ingest, now yielding.** When files are added or removed, the whole re-ingest still runs, but it yields every 50 files (`ingestFilesAsSpecAsync`).
- **The sync log names the changed files.** The next boot will show which file changes every time. Each step of a changed system is timed.
- **Cold reads.** `manifest.meta.json` sits beside each spec's manifest, and the first repo list after a boot reads it instead of parsing every manifest whole.

## Vitals
- `tests/spec-engine-yaml-import.test.js` still expected 10 blocks. The registry block made 11 on purpose; the test now also checks that `registry` comes last, after `build_order`.

## Mapped
- `docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` maps everything still open, sovereign and stored as node types or jaa tables.
- `docs/architecture-spec/architecture-spec.spec` 0.8.1: routing names the learned mode, and AS5 records registry-driven moves as planned.

Tests: `tests/modules/test-nexus-self-incremental.test.js` 5/5. Related suites green (nexus-self, spec cleanup, ingest, spec meta cache, versionium history, genesis/architecture spec, version sync).
