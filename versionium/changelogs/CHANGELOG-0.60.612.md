# 0.60.612 — the gap chain: what stops a gap becomes the gap before it

James, 2026-11-20: "if it can't fill a gap, it needs to understand why it's struggling, and add it to the learning memory, like anything that gets in the way towards filling the gap, becomes a gap in between the current step and the gap it couldn't fill" · "so each problem with filling the gap becomes the next gap, in the link." · "as each gap passes, gets logged or tagged in the gate as passed and compiled." · "make it solid. nexus should do anything that can extend capability and the capability of nexus."

## What changed
EMB2 expanded. When a gap does not fill in its tries, the rung works out what got in the way (gaps.eg `struggle`: the refusal kinds met, and the names its tries called that do not exist) and links the gap that stops it in just before it (`link`), bounded (`guard`, AXIOMS §14.4: 2 deep, 8 gaps a module by default). The gap in between is named:
1. deterministically, when the model's own try called a function that does not exist: that function becomes the gap;
2. else by one short question to the model ("name ONE smaller new function that makes this easy"), told the learning memory: earlier gaps stuck the same way and the function that unblocked them, read from Idearium's node index.

The helper is filled first, then the held gap is tried again with the helper in the module to call. Each gap that passes is tagged in its gate (`gate: { passed, compiled, by, at }`); the held gap keeps `struggle`, `blockedBy`, and once it passes `unblockedBy`, the learning memory the next task reads. A gap still held stays an open loop with its file (IF20): no whole-module fallback after it (it never passed in the runs). The ▶ build passes its contract, so its gaps land in `idearium/data/tasks/<repo>/<map>.<phase>/`.

Measured (docs/BENCHMARKS.md): DeepSeek-Coder-V2 16b on the file-identity fixture. rename was held 3 of 3 (a call left open); DeepSeek, asked why, named `findEntryById(registry, id)`; it was linked in, filled first try, and rename then passed Emerge's compiler. The module's test failed: rename changed the registry passed in through an alias (`entry.path = newPath`), which Emerge's checker lets through (the gap found 2026-11-06: "native lets a map change through a let or a parameter").

gaps.test.eg 10/10, test-emerge-rung 9/9 (ER-09 new: the chain named by the try, named by the model, and held when nothing can be named).

## Not done (said)
- A failed module test does not yet become a gap (it still falls back to the whole-module loop, which wrote unrelated code in the run).
- Emerge's checker does not refuse a change through an alias of a parameter.

## Files
- idearium/lib/gaps.eg, idearium/lib/eg-build/gaps/main.js, idearium/lib/test/gaps.test.eg: struggle, link, guard
- idearium/lib/emerge-rung.cjs: the chain, blockerFor, the gate tag
- idearium/api/index.js: the ▶ build passes its contract and its tasks folder
- tests/modules/test-emerge-rung.test.js: ER-08 updated, ER-09 new
