# 0.60.147 — 2026-10-17

> Built as **0.60.143** on his line (another session, from 0.60.142; uploaded as nexus.zip on 2026-10-18). Renumbered **0.60.147** at the merge into main, which had already released 0.60.143–0.60.146. Version tags in this release's code comments (§0.60.143) are kept as they were written.

James: "can we spec the product for debugging. the intelligence system crystalization memory, rewind engine, versionium,
cos, rfr2, cos, runtime deviation and friction detection, gap detection, diagnostic system? look at the recent phase."

James: "after that. should the chunks, contracts, phases, dependancies all have syncronized ids or uuids, also in relation
to the job. also what about using the dependencies to map gaps in codebases or repose, files or code"

James: "yes, its meant to be persistent. look at idearium, guardian, the atlas, the .spec files in each system spec folder.
looms component registry."

This release is mapped, not built. No source code changed.

## The map

`docs/2026-10-17-debugging-product-phasemap.spec` 1.0.0. It reads every system he named first, at 0.60.142, and records
what each one already does.

- **The product, the coder's reading:** the failure half beside Flight Recorder. Flight Recorder records and undoes what an
  agent changed. This takes a failure through detect, locate, explain (RFR2), reproduce in COS, back to known-good, fix,
  prove, and remember.
- **The one new thing is the case.** A case is a `.contract` v2 (his 2026-10-13 executable contract) whose gates are the
  stages: G1 located … G8 remembered. Its status is computed from its gates, never set by hand.
- **Phases DP1–DP11.** Each names the phase that already owns it: IM3/DB6/GW23 (the doors), PR4 (deviation), FM1–FM4
  (reproduction), PR5 and FR2 (a proven fix), DB9/DB10 (graph gaps). It says NEW only for the case, the known-good chooser,
  one gap door, and crystallizing a proven fix into `fix_map` with §17.7 counts.
- **His two questions are answered in the map.**
  - `ids_and_the_job`: what each kind's id is today, measured. Each keeps its own permanent id, and links are typed
    `<kind>:<id>` references; the job carries them.
  - `gaps_from_dependencies`: ten kinds of gap the graph shows, and which existing reader finds each. The catch: static
    edges miss dynamic wiring.

## Decided by his axioms

`docs/2026-10-17-decisions-by-the-axioms.spec` addendum (b):

- **D10:** ids are kept and referenced, not shared (§5.1, §10.3, §17.5).
- **D11:** one gap door (§10.1, §17.7, §1.2).
- **D12:** a case is a contract (§8.6, §16.5, §0.5).

Still his: DP0a, whether this is its own product or Flight Recorder's next phases, and DP0b, its name.

## Found while reading

- 34 direct `jaa.insert('gaps', …)` calls in 26 files skip `lib/gap-field.js`, the one gap door. They skip its dedup and
  occurrence count.
- `cortex/memory/fix-map.js` says of itself that it "is NOT an automatic failure→fix learner". A proven case is the
  correlation it lacks.
- `docs/atlases/diagnostic-atlas.md` said diagnostic was "Not Confirmed As a Standalone System". It has been one since
  0.60.136–0.60.138. A dated correction now heads the atlas; the old text is kept (§0.3).
- Correction of the coder's own earlier claim: chunk ids are not content hashes. They are
  `sha256(repo:path:kind+qualifiedName)`, so they are stable across edits but not across a move.

## Proof

- The map and the decisions file parse as YAML (js-yaml 4.1.0): 11 phases, 8 gates, D10–D12.
- Every count and path the map cites was read or counted in the 0.60.142 tree this session.
- No tests were run, because no code changed.
