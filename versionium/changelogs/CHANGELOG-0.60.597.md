# 0.60.597 — lean build mode

James, 2026-11-19: "Lean build mode" (asked: lean build mode, or more RAM)

## What changed
lean build mode: a paused process keeps its memory, so pausing (the build profile) freed none; lean stops what the build does not reach and unloads every Ollama model it does not use, at the start of every build of a lean pipeline, tight or not; everything stopped is started again when the run ends. Decided in Emerge (cos/pipeline/profile.eg: lean → { stop, unload }, the build's own model kept from RAID's routing); each stop is RAID's to approve with its measured proof, as a pause is (COS's stop and start by a rule now go through RAID too; checked: approved with proof). `pipeline-lean <pipeline> on|off` in COS's console sets it (settings.lean), or a run's var lean=on. profile.test.eg 3/3 (lean new), gate 11/11, stall 2/2; test-cos-service 11/11.

## Files
- cos/pipeline/profile.eg, cos/pipeline/test/profile.test.eg (Emerge)
- cos/pipeline/index.js: stop, unload, start again after
- cos/manager/server.js: a rule's stop/start through RAID
- cos/manager/cli.js: pipeline-lean
