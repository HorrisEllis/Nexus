# 0.60.233 — 2026-10-24 — the SL line merged into main, additively

James, 2026-10-24: "merge and push" · "anything additive".

The coder's reading, acted on: merge every branch whose work adds to `main` without overwriting or losing anything `main` already
has. If you meant only some of them, say so.

## What was checked
The checks ran on full git history. The clone was shallow at first, which made three old branches look like rollbacks of `main`.

| branch | commits `main` lacks | verdict |
|---|---|---|
| `claude/sleepy-gates-9lc085` | 6 (NF1, SL7, SL3, SL8, SL9, a PS-01 fix; 0.60.225–0.60.229) | **additive**: 3662 files added, 202 changed, 113 moved to `_archive/phases-moved/` (archived, not deleted, §0.3), none deleted, no `data/` |
| `claude/charming-lamport-mdzuau` | 0 | already in `main` |
| `claude/new-session-4vpr7p` | 0 | already in `main` |
| `claude/nexus-idearium-overview-yoguem` | 0 | already in `main` |

## What the merge needed
- **Code:** no conflicts.
- **Release numbers:** the two lines of work were built in parallel, and both used **0.60.225 and 0.60.226**. `main` used them for
  JA1/JA2 (Clear Glass autofill), `sleepy-gates` for NF1/SL7. Nothing was renumbered (§0.3, nothing rewritten):
  - `CHANGELOG-0.60.225.md` and `CHANGELOG-0.60.226.md` each hold **both** entries, and say the number was used twice;
  - `lib/version.js` keeps both lines' entries under this one: the JA line (0.60.232 → 0.60.225), then the SL line
    (0.60.229 → 0.60.225);
  - this merge is released as **0.60.233** (`VERSION`, `lib/version.js`, `package.json`).
- **Phase files:** SL9 writes a `.phase` and its dependency `.graph` beside the system that owns each phase. Some were missing or
  stale:
  - `main`'s JA1–JA5 phases had none;
  - six maps that `main` changed after the branch generated its files had drifted (site settings, browser providers, RAID,
    interaction contract, the agent suite).

  They were regenerated with SL9's own tool (`emerge/compiler/phase-specs.js`). `--all --check` now reports **1944 phases, 0 with
  drift**. A stale `.graph` for an old hash is replaced by the tool; it is regenerated from the map, so it is redundant, not lost.

## Proof
See the PR: the branch's own tests, JA1–JA5, the release check, and the full suite compared against the last run.
