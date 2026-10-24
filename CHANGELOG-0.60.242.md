# 0.60.242 — SV0: the census tells the truth (sovereign both ways), and the ratchet is green

James, 2026-10-24: "then focus on the ones that get each system sovereign, bugs ad / anything not related to sovereignty, do last unless
necassarry" · "i want to get each system soveriegn and inside a cos compartment"

His order is in docs/2026-10-23-cos-spine-phasemap.spec, addendum (b): SV0–SV8 come first, and each system becomes sovereign and then goes
into its COS compartment. SV0 is first because every later phase is cut from this census.

## What changed
1. **A require in a comment is no crossing.** `lib/system-boundary.js` scans code with its comments blanked, using
   `stripComments` from `lib/capability-spec.js` (a character scanner that leaves strings, templates and regexes whole; reused, not
   rewritten). `intelligence/alk/index.js:122` had counted as a crossing into a cortex path that does not exist. Known limit, said:
   `require('…')` text inside a string still counts, because a real require's argument is a string too.
2. **Sovereign means both ways** (his CS_D7: "Dont they need to be sovereign first?", own data and no other system loading its code).
   Until now `sovereign` meant only "it loads no other system's code". loom's cos-compartment template sealed a compartment on that, so a
   system that others still load could have been sealed. Each row now carries:
   - `outClean` (the old meaning);
   - `inFrom { systems, core }`;
   - `registry` and `compartment` (whether the files exist);
   - `step`: crossings → registry → compartment → ready.
   The `system sovereign` command shows them, and Settings › a system's repo › System has a Sovereignty card read only from the route.
3. **The ratchet is green**, for the first time since 0.60.170. Three crossings had never been designed out or baselined:
   - `lib/phase-dag.js → loom/scanners/phasemap-map.js` and `idearium/repo/roadmap-import.js → loom/scanners/phasemap-map.js`. Both used
     only the parser. It moves verbatim to `lib/phasemap-parse.js`: a parser several systems need is a primitive, and primitives are core's
     (DB0a). loom's scanner re-exports it. All 173 phasemaps parse identically, and `loadAll()` is byte-for-byte the same.
   - `lib/verify-first.js → cos/testenv/run-target.js`. COS's door `cos/testenv/index.js` now offers `runTarget` (a lazy getter), and
     Idearium hands it to verify-first through the edge it already had. verify-first refuses, saying why, when no runner is given.
   The baseline was not raised to hide any of them.
4. **Loom** has `lib/phasemap-parse.js` with its wires, and the new consumer edges (build-surface-map).

## What the census shows now (both ways)
Only **components** is sovereign. ollama had read as sovereign, but 12 places still load its code. The numbers per system are in the map's
addendum (b), and `system sovereign` gives them live.

## Proof
- test-sovereign-systems 9/9 (new SV-09: a commented require; both ways; the step).
- test-system-boundary 10/10 (SB-06 and SB-08 were red on main).
- test-cos-compartment-template 8/8 (CT-03, CT-04 and CT-07 were red on main; sentinel is core now, so components is the example).
- test-verify-first 10/10; test-phase-dag 8/8; test-roadmap-import 8/8; test-loom-phasemap-status 14/14; test-phase-graph 5/5.

## Found, not fixed here (said, §1.2)
- `loom/test/phasemap-map.test.js`: persistHistory's seeded-prior-state diff fails, the same on main.
- `test-cli-route-commands` CL-07 needs a running Guardian, the same on main.
- Many idearium and core files still take the parser from loom. They go through SV2 and SV6.
