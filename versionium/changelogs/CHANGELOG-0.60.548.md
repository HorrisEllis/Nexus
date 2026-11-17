# 0.60.548: one source of truth for an agent reply, each system's own data, the pipeline ledger, all booked with Cortex

James, 2026-11-17: "Need one source of truth. .jobs with the relative .response node. Queue and ledger." · "As long as systems stay
decoupled." · "No the .responses in the library turn into that. The full store and ledger." · "The pipeline needs a ledger also. Each step,
job and response that came back. The ui is for me. Backend first always, commands and api routes." · "Sit besides. Maybe bundle in the
compartment? Look at the pipeline in cos." · "All systems keep their own data. look at Claude.md" · "yes. we need to have this logged
somewhere. look at the changelogs in versionium."

Mapped and decided; no code changed. This release is the record of the decisions.

## What he reported, and the cause
His screenshots: every claude reply was under Downloads (`c98bb7d3-….response`), and Responses showed no claude entries, with the newest
item 16 days old.
- His own log (07:22:09, job `c98bb7d3`) shows the wall in audit mode ("would refuse"), so nothing was blocked. It also shows
  `[jaa] Store ready — C:\WINDOWS\system32\config\systemprofile\AppData\Roaming\CompartmentOS\compartments\…\index-jaa`.
- The cause: since 2026-11-01, COS starts the system servers and Guardian runs as the SYSTEM account. The Library store
  (`clear-glass/src/downloads/artifact-chat-index.js`) keeps its data in a COS compartment, under the `%APPDATA%` of whichever account
  runs it. Guardian wrote into SYSTEM's folder, while the Library reads his.
- The store was the violation: Clear Glass's data was not in `clear-glass/data/`.
- Ruled out by reading the code:
  - Guardian not writing to Responses at all: `ncp-handler.js` does write there, through `onJobComplete`.
  - The 200-item limit cutting off new replies: `bridge.js` sorts newest first before it takes 200.

## Decided (his words, his axioms)
- **GD_D3, one source of truth for an agent reply** (`docs/2026-10-24-guardian-into-cos-phasemap.spec`):
  - Guardian's `.job` with its `.response` beside it, one folder per job: `guardian/data/jobs/<id>/<id>.job` and `<id>.response`.
  - The job ledger (JL1, `GET /jobs/ledger`) reads both.
  - A pipeline that asked for a job holds only a reference to it (his choice: "Guardian's, referenced").
- **Each system keeps its own data** (his, and `docs/CLAUDE.md` 2026-11-09):
  - Clear Glass's captures stay Clear Glass's, in the same `.job`/`.response` shape, in `clear-glass/data/`. The Library store moves off
    the COS compartment root.
  - The coder's first reading (captures handed into Guardian) and the word "compartment" are withdrawn. Both are kept in the map, marked
    superseded (§0.3).
- **The pipeline ledger** (PC8 slice c, `docs/2026-11-08-pipeline-canvas-phasemap.spec`):
  - Where: `<request>/run.ledger` in COS's request bundle (`cos/data/manager/pipeline/runs/`), beside `run.run` and `dag.dag`, written by
    `cos/pipeline/runs.eg` (Emerge).
  - Lines: each step, each job sent (id, provider, RAID's decision), and each response that came back (size, hash, how long, which
    `.response`).
  - The reply text is referenced, never copied.
  - Found: `cos/manager/automation-door.js` drops the jobId Guardian returns, so nothing linked a step to its job.
- **Every ledger line is also booked with Cortex** (his "yes"):
  - after its owner writes it, through Cortex's route;
  - when Cortex is down, the line waits in the owner's outbox and is booked on replay, said and never dropped.
- Recorded as D32–D35 in `docs/2026-10-17-decisions-by-the-axioms.spec`.

## Phases
- GD5 expanded into:
  - GD5a: one write, the job and its `.response` side by side;
  - GD5b: transcripts are Guardian's, captures stay Clear Glass's;
  - GD5c: the Library shows both, each labelled with its owner;
  - GD5d: his one-time import of both old stores (his and SYSTEM's), each system importing its own.
- PC8 expanded with slice c, in his order: backend, then `GET /api/cos/pipeline/ledger`, then `cos request-ledger`, then the UI.
- Each phase was specced again with its graph (`phase-specs.cjs`). The DAG check found no problems for GD5* or PC8, and no new crossing.
  Every step is logged in the phase ledger.

## Proof
Nothing ran: this is a map. Checkable:
- the two maps' `decisions:` and their dated corrections, with the earlier readings kept;
- `idearium/phases/LEDGER.jsonl`, 2026-11-17;
- the `.phase` and `.graph` files under `guardian/phases/2026-10-24-guardian-into-cos/` and `cos/phases/2026-11-08-pipeline-canvas/`;
- `lib/release-version.js` `agreement()`: lib/version.js, package.json and VERSION at 0.60.548.

## Not yet (said)
- No code. Next, in his order: PC8 slice c (the pipeline ledger), then GD5a–d.
- The other COS compartments still resolve `%APPDATA%` per account. The supervisor can pin `COS_DATA_ROOT`, but no phase covers it yet.
- Versionium: this sandbox cannot reach his Versionium. The release and its commits are recorded on his machine by the boot sync
  (`versionium pending` shows it waiting).
- The five ledger lines written earlier today carried `version: undefined`. The coder's own shell read the version from a field
  `lib/version.js` does not export; the ledger tool was not at fault. They were corrected by hand to 0.60.547, said here.
