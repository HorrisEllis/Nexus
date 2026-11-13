# 0.60.522: every pipeline in COS (PC12), mapped; RAID's contracts are pipelines in COS (slice a)

James, 2026-11-13: "both. each step of any pipeline. thats the point. i want all pipelines managable, orchastratred, and programmable in
cos. all of them." · "i want raid to be the hub that all systems run througj"

## Mapped: PC12 (docs/2026-11-08-pipeline-canvas-phasemap.spec)
The census of every sequence of steps Nexus runs, and where each stands.
- **In COS already:** Idearium's pipelines; Clear Glass's pipelines, workflows and macros; COS's own (the framework trial); procedures and
  frameworks as steps.
- **Not in COS yet:** RAID's contracts and its execution sequence; the build loop; chains; the intent flow; the chunk build's agent
  switching; a repo's replayable procedures; the phase build's ladder.

Four slices:
- a. RAID's contracts as pipelines (built here);
- b. RAID's execution sequence as a pipeline;
- c. the rest of the census;
- d. programmable both ways, through each owner's route.

## Built: slice a
- **Cortex** (`cortex/core/raid/contract-v2-door.js`): `GET /api/raid/contracts/v2` lists every booked contract; an unreadable one is named.
  Each gate in a contract's view now also says what it waits on, its kind, its file and its parent. The evaluation is unchanged.
- **COS** (`cos/pipeline/contract.eg`, Emerge): a contract becomes a pipeline, each gate one step. The step asks RAID to check that gate,
  through Cortex's route, and is met only when RAID says PASSED. Otherwise the run holds with RAID's own reasons and goes on with Continue.
  The work stays RAID's; the order and the waiting are COS's. Only the contract's shape is written, so the pipeline changes only when the
  contract does.
- **The sync** takes Cortex as a source whose items are converted first (`convert: contract-pipeline` in `cos/pipeline/registry.json`). It
  also runs when Cortex comes up.
- **`lib/automation/pipeline.js`**: a gate may name where the owner's reason sits in the output (`reasonAt`). A held step says the owner's
  words, not "the output does not match".

## Proof
A stand-in Cortex ran Cortex's real door. A contract was booked and synced into COS, then run: gate a passed; the run held at b saying
`no evidence recorded for "step:b"`; evidence was given; Continue; done. contract.test.eg 4/4, test-raid-contract-door 4/4 (RD2-04 added),
test-cos-pipeline 21/21, test-pipelines 7/7, test-cos-hub 10/10, and every cos/pipeline eg suite green.

## Next
- Slice b: RAID's execution sequence as a pipeline.
- His "raid to be the hub that all systems run through": readings asked.
