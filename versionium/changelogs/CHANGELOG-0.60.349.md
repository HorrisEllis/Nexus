# 0.60.349 — UP9: a popup when there is an update

James, 2026-11-01: "can you have it have a popup when it has an update availanel". He said it with a screenshot of COS's UI refusing to connect.
Also: "dont forget all templates and data schemas … build the exe for cos to run independant of nexus … eravos canvas for the automation pipeline
and workflow, to replace the brainos … and then the canvas for the cos ui?"

## Why COS's UI was unreachable for him
- **He was one release behind.** His folder was 0.60.346; the COS UI starts with COS from 0.60.347.
- **Nothing told him.** His automatic update check threw ("write ECONNABORTED") and left no record, so nothing could say he was behind.

## Built
- **A failed check is recorded.** lib/nexus-update.js saves a check that throws as an error.
- **notice()** says what the last check means: available, waiting, blocked, refused, error or updated.
- **Two routes answer it:** the orchestrator's GET /api/update/notice for the TV, and COS's GET /api/cos/update/notice, listed in COS's contract.
- **One popup script** (lib/ui/update-popup) on the TV and in COS's UI. It shows, with both versions:
  - an update available or waiting;
  - one that cannot apply, and why;
  - a check that failed;
  - an update that wants a restart.

  Open updates goes to Idearium's Updates page, which applies it. Later hides that notice for 6 hours; a newer version shows again.

## Recorded (docs/2026-11-01-orchestration-console-phasemap.spec)
- **His decisions:**
  - OC_D1, templates and schemas for every node type: phase OC9.
  - OC_D2, the ERAVOS canvas replaces BrainOS for pipelines and workflows: phase OC10.
  - OC_D4, the COS app runs alone and is how he updates, until Looking Glass replaces Electron: phase OC11.
- **His question, to decide** (OC_D3, the canvas for COS's UI). The coder's recommendation: the canvas for what is a graph, pages for lists and
  records, in one window.

## Proof
tests/modules/test-update-popup.test.js 3/3. The popup was driven in Clear Glass: shown, Later holds, a newer one shows, nothing when current,
"Check again" after a failed check.
