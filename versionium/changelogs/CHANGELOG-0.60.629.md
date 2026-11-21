# 0.60.629 — the split speaks ES modules (DC1, slice a)

James, 2026-11-21: "Like I'm talking the way emerge does. Like each component its own file. ... That way we can fix nexus' architecture, and build new systems with architectural consistency. Decouple."

## What changed
The decomposer's first slice (docs/2026-11-21-the-decomposer-phasemap.spec DC1).
- **lib/adapters/javascript.js** names ES-module units: an import's bindings and source, `export` declarations (read as the declaration, exported), `export default`, export lists. CommonJS is read as before.
- **lib/project-split.js** splits an ES module like a CommonJS one: each piece imports what it needs and exports its names; the door imports what it uses and re-exports what the file exported (`export { … } from`, the default too); anything using `import.meta` or a top-level await stays in the door. TypeScript is still refused, said.

Previewed on Idearium's server (12,329 lines, nothing written): 7 pieces, 194 of 232 units held in the door, nearly all because they use `_require` (`createRequire(import.meta.url)`). Slice b gives each piece its own.

test-project-split-esm 3/3 (new: split, written, imported, the same exports and behaviour); test-project-spine 7/8 (PS-05 updated: an ES module splits; PS-08 is Clear Glass's window host on his PC, failing before).

## Files
- lib/adapters/javascript.js, lib/project-split.js, tests/modules/test-project-split-esm.test.js, tests/modules/test-project-spine.test.js, tests/modules/run-all.js
