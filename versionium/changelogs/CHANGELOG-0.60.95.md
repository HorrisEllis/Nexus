# 0.60.95 — 2026-10-16

James: "code tab?"

He asked this right after the agent work funnel (0.60.94) shipped with no screen. His rule for the funnel: "Every thing
the agents do. Needs to determine dependancies, spec, phase, then chunk."

## What changed

- **The Code tab's bottom panel gains a "work" tab** (FN4). For the open file it shows, in his order:
  - the dependencies, with what the file requires and what uses it;
  - the spec that owns it;
  - the open phase that maps it;
  - that phase's chunks.

  The note being typed in the agent box is part of the request. Where the funnel stops is said. It asks again when
  another file is opened.
- **The range edit is the first entry point through the funnel** (FN1). This is the Code tab's agent on picked lines
  (`repo.code.assist`). Before the agent edits, the server runs the funnel. The answers ride to the agent as context
  ("WHERE THIS WORK SITS") and come back with the reply. The transcript line names the phase, or where the funnel
  stopped. A question ("explain") is answered directly.
- **Not a block yet.** A missing spec or phase is shown, not refused. Making it first is FN2.
- This is also the context half of the Code tab's open CE11.

## Proof

- `tests/modules/test-code-tab-merge.test.js` 8/8, driven in Clear Glass. The new MG-16 checks that:
  - the four steps appear in order, with the missing ones dimmed;
  - the requires and used-by lines and the spec show;
  - the stop is said;
  - the request sent was "change src/a.js".

  MG-15, which runs after it, still checks that the page logged no errors.
- `tests/modules/test-code-tab-expand.test.js` 8/8. CX-03 now checks that the agent's prompt carried the funnel and the
  reply returned it, and that explain carried none.
- Green: work-funnel 8/8, build-paths 6/6, code-tab 16/16, code-surface-state 6/6, loom-map 19/19.

## Still open

- **FN1 for the other entry points:** the Agent tab, copilot, the officiator and phase builds.
- **FN2:** making what is missing.
- **FN3:** the answers saved as nodes.
- **FN4 elsewhere:** the Agent tab and the Plan panel's run row.
