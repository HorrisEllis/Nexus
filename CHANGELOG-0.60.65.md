# 0.60.65 — 2026-10-15

James: "Merge with main. Then look at the recent spacs for idearium. And begin on the pipeline. The speccing, mapping, listener. It doesn't know how to map. Nexus needs to generate dependancies for each phase, with files. The agent keeps having to find context, with tools.  Need them all mapped. Need that be automatic for every new phase from any project. Look at the new spec per module phase from main"

## Merged with main

Main had moved to 0.60.61 and used 0.60.50–0.60.52 for its own releases. This branch's 0.60.50 / 51 / 52 became
0.60.62 / 63 / 64. Their version lines and CHANGELOGs say so, and only the references this branch added were renumbered.

## Read first

- Main's newest Idearium maps (code-tab run state, gate-held work) and the "spec per module" phase: CS2 in the
  capability-specs map, still OPEN.
- The 0.60.29 mapper (`idearium/repo/phase-mapping.js`): it asks a model for every phase and writes only when the model
  scores well. The evidence already in each phase's own words was never used first.
- Measured on Nexus: 898 open phases; 436 name their files; 196 name real paths in their words; 266 name nothing.

## MP1: Nexus maps every phase, with no model (`lib/phase-map-auto.js`)

For each phase:
- **files**, each with its evidence:
  - declared in the phase;
  - a real path in its words;
  - a code name it mentions → the file that defines it;
  - a hyphenated module name (`phase-files`, `end-state`) → that file.
- **requires** and **used by**: one hop, from the source tree. "Used by" is what a change to the phase can break.
- **waits on**: the earlier phase in its map that changes the same file (hub files excluded).
- **specs**: declared, plus the specs that own the files.
- `none` only when nothing names a file. That is the one case left for a model (MP4).

Result on Nexus: open phases with no file evidence fall from 462 to 198. One version also used single words and
reached 41, but "guardian", "listener", "automation" matched files the phase did not mean, so it was dropped.

## MP2: automatic, in every repo

- The Phases view of any repo carries each phase's mapping: Nexus reads its live tree, a project reads its own files.
  It's cached by the maps' text, so it reruns only when a map changes.
- A phase never seen before in a repo is announced: `idearium.phase.mapped`, with what it was mapped to.
- The phase detail shows mapped files (hover for why), requires, used by, waits on and specs.
- His maps are never rewritten; MP4 is where an accepted mapping gets written.
- Loom: `lib/phase-map-auto.js` is a component with its wires (phase-files, systems; consumed by `idearium/repo/phases.js`).

## Proof

- `tests/modules/test-phase-map-auto.test.js` 8/8:
  - MA-01..06 on a fixture project: declared, named path with requires/used-by, code name → defining file, hyphenated
    module name (a plain word does not map), none, waits-on;
  - MA-07: a project's Phases view carries the mapping, and a phase added later is announced and mapped;
  - MA-08: Nexus's own tree, 2,415 source files scanned and 1,496 phases mapped in well under a second.
- Unchanged: phases-tab 5/5, phase-specs-tag 7/7, loom-phasemap 7/7, loom-phasemap-status 14/14, loom-map 19/19.
  test-phase-mapping, test-one-idearium-phases-nodes and test-registry-harness fail the same tests with and without
  this change: they need `js-yaml`, which is not installed in this container.

## Next

- **MP3**: a build's first request carries this mapping as an editable prompt block, so the agent starts with the
  context instead of finding it with tools. Needs SF1 (intent blocks).
- **MP4**: the model mapper only for the phases left `none`.

## To confirm

"Listener" was read as: a new phase is mapped the moment any repo's phases are read, and announced as an event — not
a file watcher.
