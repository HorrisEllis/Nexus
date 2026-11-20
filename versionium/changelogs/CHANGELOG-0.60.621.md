# 0.60.621 — import or require, as the folder is

James, 2026-11-20: "yes do that, smallest first."

## What changed
The seventh build (EMB3, run phrun-mwpbdh9a-vsqt) was the first to get a model's answer: the 3b wrote the test twice in about 40 s. It was refused: `require is not defined in ES module scope`. The brief itself said `require('node:assert')`, and idearium/ is an ES-module package.
- **The test brief** (lib/test-first.js `moduleTypeFor`) reads the folder's module system as Node does (the nearest package.json's `type`) and says `import` there.
- **The Emerge rung's output** in an ES-module folder: the built module is `.eg.cjs`, and the planned file is an ES module that loads it through `createRequire` and exports each function by name (emerge-rung.cjs `adapter`, `moduleTypeOf`).

test-emerge-rung 12/12 (ER-12 new: built, written as a build lands it, imported by name and run).

## Files
- lib/test-first.js, idearium/lib/emerge-rung.cjs, idearium/api/index.js, tests/modules/test-emerge-rung.test.js
