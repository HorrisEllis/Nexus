# 0.60.153 — 2026-10-18

James: "can you update and expand the read me. expand anything thats a list. all the phases. have a full section of for each
of the 15 systems, each module and all the files. the data structure. all the idearium work. use all the changelogs to expand
it."

The README is the Nexus atlas, `docs/atlases/nexus-atlas.md`, copied over by `scripts/generate-atlases.js`. That was his own
decision in 0.59.12: "copy the atlas to use as the readme". So the work is in the atlas. The narrative stays hand-written. A
new generator writes the inventory under it from the tree and its records, so the inventory cannot drift from the code.

## Generated (`lib/readme-generate.js`)

- **Each of the 15 systems.** Inside each system's own section: its modules, and every one of its files, 4,110 in all, each
  module in a fold.
  - In a module of up to 8 files, each file is named with what its own header says it is.
  - A larger module lists its files by name. Every file's purpose, exports and tests are in that system's own atlas, the next
    zoom level.
  - Each section also names the releases that touched the system.
- **Every phase.** All 1,646 phases across 132 phasemaps, each with its status and whether it is a decision. They are read by
  `loom/scanners/phasemap-map.js`, the same parser loom uses.
- **The data structure.**
  - every store, read from the code: its environment variable, its default folder and the files that open it;
  - the JAA tables, from `lib/context-atlas.js`;
  - the node types, from `lib/node-export.js`;
  - the ledgers.
- **All of Idearium's work.** Every route in its route table (`idearium/api/index.js`), and every command row
  (`idearium/cli/route-commands.js`).
- **Every release note,** 358 of them including this one, grouped by series. Each opens with his own words, then what was
  built.

## Corrected by hand

- **Fifteen systems, not sixteen.** ERAVOS was deleted in 0.60.83.
- **The healer is inside diagnostic** (since 0.60.136). Its paths are fixed in the Nexus, core and architect atlases.
- **The counts** of `lib/`, `tests/` and `docs/` are current.
- **`products/` is placed** in the tree.
- **Known drift** now names two things: the two debugging-product maps, and the two version lines merged today.

## Found on the way

- **The atlas resolver read only the first 2,000 references** (`idearium/repo/nexus-self.js` `resolveWith`). On the Idearium
  atlas page, every reference after the 2,000th would have been struck out as missing. The cap is now 20,000; each reference is
  one map lookup.
- **loom's registry was stale since 0.60.83.** It still declared routes in the old `nexus-healer/`. It was rebuilt with
  `loom/bootstrap.js`.
- **The atlas page renders folds** (`idearium/ui/js/nexus-atlas.js`), the same way GitHub does.

## Size

The README is 489 KB. GitHub has no documented limit for rendering a README; the figure people report is 512 KiB. To stay
under it, the larger modules list their files by name, and a test fails if the README reaches that size.

## Proof

| test | result | what it shows |
|---|---|---|
| `test-readme-generate` | 3/3 | RG-01: every system, every file, every phase, every release. RG-02: under 512 KiB. RG-03: in Clear Glass, the folds render closed and open with live file references. |
| `test-nexus-atlas-refs` | 49/49 | It had 4 failing before this release. |
