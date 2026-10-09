# 0.54.0 — 2026-10-09

James: "okay" (accepting the roadmap triage) · "make sure to clean up old code that isnt needed anymore"

## The roadmap, decluttered

Each shelved or folded map got one line at the top:

- **48 maps are on the shelf.** Each has `roadmap: 'later — <why>'`.
- **5 maps are folded into a map already on the path.** Each has `roadmap: 'folded into <map> — <why>'`.

The phases inside those maps are untouched. Undoing it means deleting the one line.

The scanner now reads a whole map's answer from that line (test PS-014). It also fixes a bug from 0.53.0: `loadAll()` dropped the shelf and closed marks, so the counts would always have read 0.

The roadmap now reads:

| | phases |
|---|---|
| Open, on the path | 188 |
| On the shelf | 463 |
| Closed by the clean-up | 36 |

## Old code, archived

Every code file was scanned for any mention of it anywhere: code, HTML, JSON, YAML and scripts.

- **First pass:** 55 candidates.
- **Strict re-check:** the scan was redone with whole file names, folders loaded through their `index.js`, and HTML `src=`. That left:
  - 34 files that are actually used;
  - 7 tools that are run by hand;
  - 14 files that only docs or tests mention.

Three of the 14 are superseded, and were moved to `_archive/2026-10-09-declutter/` with a header saying why:

- `ui/ui-pulse.js` — an older copy of `ui/pulse.js`.
- `ui/pipeline-tutorial.js` — the old shell's tutorial.
- `scripts/_register-session-hooks.js` — a one-time script that has already run.

Kept on purpose, because they are James's built work that was never wired in:

- `security/e2e-channel.js`
- `guardian/lib/command-registry.js`
- `ui/consent/consent-gate.js`

Also kept: modules only tests use. The atlas now names the archived paths as plain text.

**The bigger clutter isn't unused files.** It's old paths that were replaced but are still wired in:

- eight places that choose a model;
- three drainers;
- retry ladders nested inside each other;
- doubled specs, Eravos canvases and run-all lists.

These go out with the phases that replace them. The rule from here: a phase that replaces something archives the old version in the same change (one-roadmap OR6; one-model-engine ME12 `retires:`).

## Tests

| suite | result |
|---|---|
| `test-loom-phasemap-status` | 14/14 |
| `test-nexus-atlas-refs` | 53/53 |
| `test-nexus-atlas-and-glass` | 10/10 |

Loom's unresolved count is still 114.
