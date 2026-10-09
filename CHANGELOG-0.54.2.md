# 0.54.2 — 2026-10-09

James: "Include any useful or important."

## The shelf, combed

All 585 shelved phases were scanned for anything broken, failing, losing data, security-critical, or needed by the loop. The scan flagged 42. Each one was checked against the code.

**Back on the path, as step 0 (health):**
- **HG9:** loom's persistHistory test still fails (12/13).
- **HG1:** the components-store map is loose YAML that js-yaml cannot read. The roadmap scanner can still read it.
- **HG2:** whatever is left of the bootstrap rejections. Check first: bootstrap now exits 0 with 114 unresolved.

**Already done elsewhere, now marked:**
- **HG3:** BV-09 passes now.
- **RD1:** `lib/repo-inject.js` already takes every block in a reply that names its path.

**Folded into the one-model-engine map:**
- BR7 and IC11 go into ME0 and ME5.
- AM8 goes into ME10.

**Checked and left on the shelf:**
- **N28:** its live bug was fixed in 0.39.282, and its spec drift is now ME15's job.
- **Guardian's ChatGPT reply break:** jobs have completed from the chat transcript since 0.39.255.

**Fixed on the way:** re-answering a shelved phase didn't lift it back onto the path. A re-answer now replaces the shelf answer and restores the phase's old status.

## The roadmap

52 open phases on the path. `docs/the-path.md` is regenerated.

Docs only.
