# 0.60.112 — 2026-10-16

James: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?"

Then: "can you branch it into a idearium repo?"

## The product question (the coder's reading, his to confirm)

Yes, narrower than Nexus: an undo button and flight recorder for AI coding agents. Every change an agent makes is:
- tested in a throwaway environment (COS test env: a child process, or a QEMU VM where nothing persists);
- kept as a version you can compare and put back (Versionium);
- recorded with what caused it (event ledgers, the causal graph);
- replayable (RFR2: the kernel, compress, clip and context modules all load).

The coder recommended RF2 (the refactor tool, applied one phase at a time, every step a version) as its demo. The name
"flight-recorder" is the coder's working name; he names it.

## What was built: CV1, branch a part of Nexus into its own Idearium repo

Map: `docs/2026-10-16-repo-carve-phasemap.spec`, written before the code.

- **`lib/repo-carve.js`.** `plan({ root, seeds })` walks the seeds (files or folders) and follows their requires to a
  closed set. It reports:
  - every file, with the file whose require pulled it in;
  - the npm packages Nexus installs for it, with Nexus's pins (a package only named in the code is listed, not installed);
  - the requires that resolve to nothing;
  - counts by system, and lines.

  `build()` adds `package.json`, `CARVED.json` (the whole report, the Nexus version and commit) and a README with his
  words.
- **`POST /api/repos/carve`** (`{ preset | seeds, name, dryRun }`).
  - The dry run is the plan; nothing is created.
  - Otherwise Idearium's own `repo.ingest` makes the repo, with Nexus as its parent (fork lineage).
  - Two notes go on the new repo: his words (a quote), and the carve (a decision; the name is marked "to confirm").
  - Seeds outside Nexus are refused. Nothing in Nexus moves (§0.3).
- **The command:** `repo carve --preset flight_recorder [--dry-run]`, or `repo carve <name> <path…>`.
- **The UI:** My projects → **Branch from Nexus**. Pick the preset or your own paths, then Preview (what comes along,
  from where, and why) and Create (then Open the repo).

## What the preset showed

The flight recorder is 217 files: 63 named, 154 pulled in by requires, 45,285 lines. Those come from 15 systems: cos 66,
lib 58, intelligence 27, versionium 24, loom 13, warp 11, emerge 5, guardian 4, and others. So the product does not
stand alone yet: loom, warp, guardian and emerge come along through requires. That report is the refactor tool's first
real input (CV2, with RF0–RF2).

## Found while building

The tree scanner (`lib/phase-map-auto.js` `envFromTree`) counts a require written in a comment. That's right for
mapping a phase, but wrong for a copy: it carried 44 files nothing loads. The carve reads requires with comments left
out, and CV-01 pins this.

## Proof

- `tests/modules/test-repo-carve.test.js`: 8/8.
  - The closure on a planted fixture: pulled-by, npm split, a missing require, a commented require ignored.
  - Paths outside the tree are refused.
  - The real preset is planned over Nexus.
  - The route's dry run creates nothing.
  - A real repo is carved through the real router, with its files, `CARVED.json` and the two notes.
  - The command row.
  - CV-08: the UI driven in Clear Glass.
- The full preset carved through the real router in 0.8 s.
- Neighbouring suites stay green: the route-collision guard PJ-06, the loom map, the build census.
