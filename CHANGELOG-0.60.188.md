# 0.60.188 — 2026-10-21 — The census: every Idearium phase judged against its evidence

James, 2026-10-21: "Follow the axioms in docs. Use them as law, and for every decision. It built 5 phases in a row. I think I see what
you mean but there are way more idearium phases than that." Then: "go ahead with the census".

His axioms decided that the census comes before the graph (BX0e: §3.3 the map names what has drifted, §12.5, §3.1 bottom-up). A graph
drawn from maps with wrong statuses would show a false pipeline. The coder's part: the census and the fixes it led to.

## The census (CNS1)
- **What it is:** `lib/phase-census.js` judges every phase against what can be checked, and asks no model. The evidence is:
  - commits that name the phase and touched its code;
  - release lines;
  - its files on disk;
  - its proof's test files, and the test ids inside them.
- **Where to read it:** `phases census [--system idearium] [--open]`, `GET /api/phases/census`, and the full table with every verdict's
  evidence in `docs/idearium-phase-census.md`.
- **What it read:** 733 phases whose map is Idearium's, or that name an idearium/ file or the idearium system. The git history is full
  (802 commits; the clone was unshallowed for this).

| verdict | phases |
|---|---|
| done | 330 |
| not built (nothing names it) | 206 |
| no files named (cannot be judged; DG3) | 92 |
| deferred (the map says LATER) | 82 |
| partly built (the map says PARTLY) | 12 |
| mentioned, no build shown | 11 |

- **Built but marked open: none.** The maps' "done" lines do not undercount. The drift runs the other way: 206 phases are marked open,
  and no record names them as built. No status addendum was owed to any map.
- **What is open:** 321 phases, listed bottom-up by DAG layer: layer 0 has 86, layer 1 has 80, layer 2 has 48, and so on.

## How the evidence rules got strict
Each rule was written after a false hit on the real tree:
- **Whole ids only.** "UI1" counted as naming I1 under a plain substring test. Ids now match as whole words.
- **Shared ids need their map.** When two maps use the same id, a record must also name the phase's own map.
- **Mapping is not building.** `35a44a9951` "Map the whole build pipeline (SB8–SB14)" touched `idearium/spec-engine/index.js`, but only
  to bump the version. `69bcf9e1ed` says "Mapped next: … SD0–SD9".
- **Citing a map is not building.** CHANGELOG-0.60.130 lists P33… as "what the map already holds".
- **The map's own words stand.** Where a map says what is left ("OPEN — … left here: …"), the census does not overrule it.
- **Reading the right block.** phase-dag's line number for a phase is 0-based. Read blind, the census took each phase's status from the
  phase above it. The fixture test caught this, and the phase's line is now found by name.

## Found and fixed at the cause (§1.2)
- **Skipped phases.** `loom/scanners/phasemap-map.js` is the parser DG1, DG2 and DG3 all read through. It silently skipped:
  - 8 COSA phases;
  - MR3b, TB7a–TB7d, GT1a, PI3b, DT4b, CT1b and GA1a;
  - decision ids like BX0a.

  Its pattern stopped at three capitals, and at the digits. It now allows up to five capitals and one letter after the number.
- **Nested decisions.** A map nested under `spec:` keeps `  decisions:` at indent 2. That now counts as a section, so its entries stay
  decisions.
- **Decision nodes.** `lib/phase-dag.js` no longer lets a parsed entry overwrite a decision node.
- **The whole DAG:** 1900 → 1925 phases, and 25 → 17 dangling references.
- **His answers, where the parser can read them.** His answers to BX0b, BX0c and BX0d had been written above the BrainOS map's title, and
  the block the parser reads still said OPEN. They are merged into that block. The copy above the title was a true duplicate and is
  dropped, which is said in the map's addendum (§0.3).

## Measured
- `test-phase-census` 6/6, on fixture maps with fake commits:
  - **PCN-01:** every verdict.
  - **PCN-02:** short and shared ids.
  - **PCN-03:** mapping is not evidence.
  - **PCN-04:** the map's own words stand; bottom-up order.
  - **PCN-05:** the document.
  - **PCN-06:** the real tree, the command row, the route.
- The parser and DAG tests still pass:
  - `test-phase-dag` 8/8;
  - `test-loom-phasemap` 8/8;
  - `test-loom-phasemap-status` 14/14;
  - `test-substrate-spec` 3/3;
  - `test-run-state` 33/33.
- **Red before this release, unchanged by it:** `test-moce-roadmap` (3 failures) and `test-readme-generate` RG-01. Checked on the
  stashed tree.

## Not done, said
- **The screen.** The census has no screen yet. It is the data for BX2/BX3's Flow view, which draws each phase's verdict. Its routes and
  command come first, by the order of delivery.
- **Your "5 in a row".** The census does not explain it. The run records (who started each run) will, and that trace comes next, before
  BX5 (the node controls) and BX7 (auto-advance).
- **The limits of "not built".** It means no record names the phase. Work done without naming its phase id cannot be seen by this
  census.
