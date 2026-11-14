# 0.60.526: his request, built by the pipeline (PC13)

James, 2026-11-13: "put a pin in the can be moved anywhere. need the pipeline building all of my requests." · "like the pipeline can build
all of this if we get ollama working with emerge and the pipeline"

## Built
- **`idearium/pipelines/his-request.pipeline`** ("His request" in COS's Automation tab), four steps, each a route Idearium already serves:
  1. **intent:** his words to Idearium's intent route (what it means, the context it needs, what is missing). A blocking gap holds the run
     and says the gap's id and question.
  2. **phase:** his words written as a phase (`HR<n>`) in `docs/2026-11-13-his-requests-phasemap.spec`.
  3. **build:** Idearium's build pipeline run as one step for that phase (Ollama's ladder first; evidence holds for his yes).
  4. **told:** a notification.
- **COS's console:** `request <his words>` starts it; `request answer <run> <gap-id> <answer>` answers a gap and the run goes on.
- **`lib/automation/pipeline.js`:** Continue can carry values into a held run (his answers, merged with earlier ones). A closed gate
  names only the gaps still open.

## Proof
- On a real Idearium: the run held on two named gaps, and two console answers carried it past the intent step. The sandbox's Idearium has
  no synced "nexus" repo and stalled for minutes syncing one, so the remaining steps were not run against it.
- With a stand-in Idearium serving the real pipeline files, the whole chain ran: the gap, the answer, HR1 written, then the build
  pipeline's nine routes called with phase HR1, through to the ledger line.
- test-pipelines 8/8 (PL-03c added), test-cos-pipeline 21/21, test-cos-console 11/11, test-cos-hub 10/10.

## Not proved
A real build written by Ollama: that needs his machine. How far a request gets alone depends on what his models can write (EMB2).
