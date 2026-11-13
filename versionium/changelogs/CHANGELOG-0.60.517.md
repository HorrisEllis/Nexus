# 0.60.517: every pipeline in Nexus reaches COS's Automation tab

James, 2026-11-13: "also all pipelines in nexus need to be here." (His screenshot: Pipelines 0, after `automation import-from idearium
idearium-build` had answered "imported".)

## Found (on a real COS manager and a real Idearium, in the sandbox)
1. **The answer was cut.** COS's call to a system (`cos/manager/server.js` `_systemCall`) keeps the first 4,096 bytes unless asked for more.
   Idearium's pipeline is 5,704 bytes, so its JSON broke and the sync skipped it **without a word**: listed 1, fetched 0.
2. **The sync ran once,** 1.5 s after COS started, before Idearium or Clear Glass answered, and never again.
3. **The tab read its list once,** when the page opened.

## Built
- `cos/pipeline/index.js`: the list and each pipeline read whole (4 MB); a pipeline that cannot be fetched or read is named
  (`skipped: [{ id, why }]`, with how many bytes of how many when cut); each system says `files` of `listed`.
- `cos/manager/server.js`: the sync runs at start, again when a system it reads pipelines from spawns, resumes or beats in COS's ledger
  (heard, not polled, PR6), and when a person asks. `cos.pipeline.synced` on COS's stream. `GET /api/cos/pipeline/sync`: the last sync.
- `cos/manager/cli.js`: `pipeline-sync` in COS's own console; a leading `cos ` is the verb's (his `cos pipeline-sync` answered "no verb cos").
- `cos/ui/automation`: a **Sync** button; a line saying when it last synced, what each system gave and which did not answer; the list read
  again when the stream says a pipeline was made or a sync ended.
- `cos/manager/contract.json`: GET /api/cos/pipeline/sync.

## Proof
- Sandbox: COS's manager, then `start idearium`: the sync followed Idearium's first beat by itself and imported "Idearium build pipeline",
  9 steps. `cos pipeline-sync`: "idearium: 1 of 1 fetched · clear-glass: did not answer (ECONNREFUSED): its last files kept".
- test-cos-hub 10/10 (HB-10 added: in Clear Glass, Sync names the system that did not answer; a pipeline made elsewhere appears without a
  reload), test-cos-pipeline 21/21, test-pipelines 7/7, test-cos-console 11/11, test-cos-console-tab 4/4.

## Not proved
Clear Glass's own pipelines (fiverr-gig, the gated PL pipelines, his saved ones) come in by the same path when Clear Glass answers; no
Clear Glass ran in the sandbox. On his PC after the update and COS's restart.
