# 0.60.604 — the build snapshot off the main thread

James, 2026-11-19: "it is meant to chunk all of that, look at the import pipeline." · "no nexus chunks, look at  the import pipeline for idearium. like for importing projects"

## What changed
the snapshot before a build off Idearium's main thread, the import pipeline's own way (SW1, a worker thread): NM1a's build read and hashed the repo twice on the main thread, keeping every file's bytes, and Idearium answered nothing for 11 minutes (phrun-mwo6egoh-vxh3). Now the record and the file pass run in idearium/repo/snapshot-worker.js; no bytes are kept, only the files Versionium needs are read again; the re-index before a build uses runImportPipelineOffThread. Measured on NM1a's repo (5,466 files): 239 s off the thread, the main thread's longest pause 201 ms, its heap 9 MB. Not yet: chunk size by the resource monitor and a COS setting (his "maybe dynamically in relation to the resource manager and the memory heap allocation"); a boot job still holds Idearium about 4 minutes after start, not yet found. The snapshot tests import by a D: path, which Node on Windows refuses (pre-existing).

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
