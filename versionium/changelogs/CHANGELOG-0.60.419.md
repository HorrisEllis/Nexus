# CHANGELOG 0.60.419 — SL11: the phase ledger, in Idearium; "always log in the ledger"

James, 2026-11-06: "we also need to add a phase ledger, to idearium, then add to claude.md to to always log in the ledger". Asked first on
2026-11-03: "We need a fucking ledger too of phases, and we need, like, so they stop getting written, you know what I mean?" · "Like they stop
getting written and start getting, they expand."

## Mapped first
- SL11 in `docs/2026-10-23-self-building-loop-phasemap.spec` was expanded, not written again (his SL_D11).
- His words moved it into Idearium (`idearium/spec-engine/`, beside phase-specs) out of `lib/`, and added the log.
- Its graph adds no new crossing between systems.

## Built — `idearium/spec-engine/phase-ledger.cjs`
- **The table:** every phase of every map, generated from the maps and never typed by hand. On main today:
  - 2,568 phases in 233 maps: 1,088 done, 1,480 open;
  - **49 ids written in more than one map**, breaking his "unique across all maps" rule (A1 in 5 maps, A2 in 3, and so on);
  - 416 short ids reused across maps, TB1 and PF1 among them.

  These are listed for his phase cleaning, not changed.
- **The gate:** `covers(files, does)` names the phases that already cover a piece of work, by shared files or the same intent, so they are
  expanded instead of a new phase being written.
- **The log:** every phase written, expanded, built, closed or noted is appended, with who, when and why, to `idearium/phases/LEDGER.jsonl`.
  The file is committed because `data/` is not, and the log has to outlive a session.
  - A phase in no map can only be logged as written.
  - A bad event, a missing why, or an id that is in two maps without its map given, is refused with the reason.
- **Routes:** `GET /api/phases/ledger`, `GET /api/phases/ledger/history?phase=`, `POST /api/phases/ledger/covers`,
  `POST /api/phases/ledger/log`.
- **Commands:** `phases ledger`, `phases log`, `phases history`, `phases covers`.
- **Screen:** the Phases tab gets a **Ledger** view (the counts, a form to log an event, the latest events, the ids in more than one map), and
  each phase's detail pane shows its own ledger.
- **The rule:** `CLAUDE.md` and `docs/CLAUDE.md` now say: always log in the ledger, in the same commit as the work, and run `covers` before
  writing a phase.
- The first two entries are SL11's own: expanded, then built.

**Reading, to confirm (his):** "log" read as an append-only record of phase events, kept beside the generated table.

## Proof
- `tests/modules/test-phase-ledger.test.js` **7/7**:
  - PL-01: the table over the real maps, with TB1 and PF1 listed;
  - PL-02: the cover check;
  - PL-03: the log and its refusals, on a fixture;
  - PL-04: the real API routes, with the real ledger left untouched;
  - PL-05: the command rows;
  - PL-06: the Ledger view rendered;
  - PL-07: the rule in both CLAUDE.md files.
- PL-03 caught a bug on its first run: an id in two maps counted as logged twice. Fixed.
- **Not yet driven in Clear Glass:** the Ledger view was rendered in a stand-in window.
