# 0.60.104 — 2026-10-16

James: "can you do the code tab changes?"

He sent a screenshot of the Code tab showing three problems:
- a pending `lib/intent-chain.js` from the agent, whose body is `// Placeholder implementation` and a `resolve()` that
  returns nulls, credited to a run marked `contract-complete`;
- `TL0_find_the_loss` building at attempt 9, 20 steps, 0 changed;
- the old layout, with every region open at once.

## 1. A placeholder is not the work (the code.write gate)

- **What was wrong.** A brick's check (`lib/phase-plan.js checkChunk`) only looked for the export names its plan named.
  The stub exported `resolve`, so it passed, and the contract went complete.
- **What changed.** The one door every proposal passes (`lib/repo-inject.js` `_screen` and `land`) runs the code.write
  gate, and the gate node (`lib/step-gates/code.write.step_gate`) gains `not-a-placeholder` (a new check kind,
  `no_placeholder`, in `lib/step-gate.js`). A file an agent writes is refused when:
  - a comment on a line it adds calls the file a placeholder or a stub (the phrases are in the node; extend them there);
  - a line it adds throws "not implemented".
  The refusal names the line.
- **What it never judges:**
  - a person's file;
  - a line the file already had;
  - the same words inside a string or a name.
- `lib/stub-scanner.js` stays the broad advisory scan (TODO, hack, for now). This check is its narrow, hard subset.

## 2. The Code tab, one view at a time, made solid (TB5)

- 0.60.103 split the tab into files, changes, plans, runs and COS, and left 7 of `test-code-tab`'s checks red. They were
  written for the old all-at-once layout. Each now opens the view it tests.
- **The Runs tab's live badge now updates from any view.** Before, it changed only on a full repaint, so a call running
  while you were in files did not show on the tab.
- **A draft in the agent box survives a view switch.** CT-31 was rewritten to check it.
- CT-22's own race is fixed: its first event's delayed reload landed after the stub had changed.

## 3. TL0 is a question for him, not a build

- TL0 asked which screen and log lost the 17 chunks. Only he has that, so an agent searched the repo for 9 attempts and
  changed nothing.
- It was moved, whole, under `decisions:` of `docs/2026-10-16-durable-work-timeline-phasemap.spec` (addendum c). Entries
  there are kind `decision`, which no build picks. TL1 no longer waits on it.

## Proof

- `test-inject-screen` 14/14. IS-10 is the screenshot's file.
- `test-step-gate` 18/18, `test-repo-inject` 83/83.
- `test-code-tab` 16/16 (was 9/16; driven in Clear Glass, never Playwright), `test-code-tab-expand` 8/8, `test-code-tab-merge` 8/8.

## Not done, said

- The pending `lib/intent-chain.js` on his machine is still waiting for Apply. Reject it: IH1's real build waits on his
  answer to IH0a (one intent list with aliases, or three).
- "copilot gave no route: timed out after 5000ms" in the agent pane was not looked into.
- TB2/TB3a/TB4a (save every tool call, recall exact repeats first) and TB7 (the runs graph with zoom) are still open.
