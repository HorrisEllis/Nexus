# 0.60.611 — each gap its own file, each try a fresh chat told the lesson

James, 2026-11-19: "Each gap it's own file right? like each primitive should be its own file, chunked and referenced. like the way idearium chunks?" · "gates need to inject the lesson, and failure mode from the previous attempt, and try again, like it needs to understand the problem before trying again, like it needs to start a new chat and inject the context, and lesson fix again" · "all the relenavnt files per task need to be bundled in athe same folder. not fragmented. stored in a folder, maybe with the contract id or task id? so it needs to be indexed in the node index database for the server.js" (he chose the contract id)

## What changed
EMB2 expanded. Each skeleton gap of the Emerge rung is its own `.gap` node file (lib/node-export.js, the known type `gap`), in its task's folder `idearium/data/tasks/<contract>/` (the ▶ build's contract: `<repo>/<map>.<phase>`). Every attempt is written to it as it happens: the body, Emerge's compiler's words, the fix, the model, the time. Each gap is indexed into Idearium's own node database (`lib/node-registry.js storeFor('idearium')`, the one its server runs), so `system nodes idearium gap [<id>]` lists every gap, its folder and its history, through the existing route and command.

Every try is a fresh chat told `gaps.eg lesson()` (Emerge, deterministic): each distinct refused body once with how often it came back, the fix first. A new fix row for "is already declared". `lib/node-registry.js`'s boot scan keeps a node whose file is in a task folder (it dropped them before; ER-08 fails without the fix).

Measured (docs/BENCHMARKS.md, thread T14): the file-identity fixture, DeepSeek-Coder-V2 16b. With the lessons of two earlier runs on disk, `rename` got past its first refusal on try 2; from a fresh folder it repeated that refusal 3 of 3. Lessons shown as the raw refused body (the first version) made it copy that body word for word: that version was replaced the same day. `rename` is still held: it changes the registry passed in. Qwen3-Coder 30b passed the fixture on the old code in 36 minutes (2 tries for rename): on his GTX 1650 (4 GB) and 16 GB of RAM the 17 GB model runs from disk, about 12 minutes a call.

gaps.test.eg 7/7, test-emerge-rung 8/8 (ER-08 new). test-node-registry-system 12/14, the same two failing before this change (NR-08, a Windows file URL; NR-12).

## Not done (said)
- Where a task's folder lives long-term is his to settle: RAID's compartment per contract as working memory (his P12, 2026-09-11) and Idearium as long-term, or Idearium only. Built as Idearium only, the layout unchanged either way.
- A gap that will not fill is not yet split into smaller gaps.

## Files
- idearium/lib/gaps.eg, idearium/lib/eg-build/gaps/main.js, idearium/lib/test/gaps.test.eg: lesson(), the new fix row
- idearium/lib/emerge-rung.cjs: gap files per task folder, indexed; listGaps; build({ contract })
- lib/node-registry.js: the boot scan keeps nodes in task folders
- tests/modules/test-emerge-rung.test.js: ER-07 updated, ER-08 new
