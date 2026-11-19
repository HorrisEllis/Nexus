# 0.60.603 — the build snapshot waits for Versionium

James, 2026-11-19: "yes, only what needs to run." · "Help me get nexus building asap."

## What changed
the build's Versionium snapshot gets 120 s: NM1a run 2813375c was refused NO_SNAPSHOT because Idearium's four snapshot commits used the client's 8 s default, and a whole-repo snapshot with DeepSeek holding 10.5 GB took longer. A fix, nothing added.

## Files
- cos/automation/pipeline.js: the reuse index by fingerprint, the link across pipelines
- cos/ui/automation/engine.js (0.60.599): the Pipelines tab opens the gates
- tests/modules/test-pipeline-waits-for-a-system.test.js: PW-11
