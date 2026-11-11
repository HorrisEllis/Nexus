# 0.60.485 — the run form: a phase chosen in the page

James, 2026-11-12: "Okay the pipeline says no phase selected." · "it says phase not selected in the piplelube vital. its the next walll" ·
"i need you to release this time also"

## Found
Idearium's build pipeline needs its phase before it runs. The Automation tab asked for it with a browser prompt. COS's app window never
shows a browser prompt, so the answer came back empty and the run stopped: no phase.

## Fixed
- What a run needs is asked in the page, above the steps.
- A phase is chosen from the phases that can be built now: `GET /api/cos/pipeline/ready` (Idearium's queue, read by its route), declared in
  COS's contract. When Idearium does not answer, the phase is typed, and why is said.
- Any other value is typed. "Run with these" runs it; an empty value is refused, named.

## Proof
- test-cos-hub 9/9: HB-09 in Clear Glass through the real cockpit (no browser prompt is called; the run goes with the phase given).
- test-cos-pipeline 21/21: CP-20 reads the route.

## Not yet proved
Not seen on his machine. If the tab still says there is no phase after updating, the words on screen (or a screenshot) say which place it is.
