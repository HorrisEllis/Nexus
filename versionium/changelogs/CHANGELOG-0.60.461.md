# 0.60.461 — the automation engine in COS's Automation tab (AE5 slice a)

James, 2026-11-08: "just need the automation engine fully built and in the automation tab" · "cos is the orchastrator" · "idearium pipeline. also has to be real .pipeline files. it must be exportable and importable." · "i need this building already."

## What it does
- **COS's Automation tab is now the engine's.** Every list is read from COS's own door, `/api/cos/automation/*`.
  - **Pipelines:**
    - each pipeline's steps in its own words, and what each runs after;
    - **Run**: every step shown live until it is done, with its time and any error;
    - **Stop**;
    - **Export .pipeline**: the real node file, with what it runs bundled;
    - **Import .pipeline**: also `.workflow` and `.macro`;
    - **Open on canvas**: an `.erv` that ERAVOS opens as Steps.
  - **Workflows**, each with Run.
  - **Runs**, newest first, with how many steps finished.
  - **Log**: the engine's log.
  - **Supervision**: the supervisor's rules and Start at boot, exactly as before.
- **COS's contract**, its own registry, gains the routes the tab uses: pipeline run, the `.pipeline` node, runs, one run, and cancel. AE7 had listed none of the pipeline runs.

## Proof
- `test-cos-hub` 7/7. HB-07 is new, run in Clear Glass through the real cockpit:
  - a pipeline is listed;
  - it runs live to done, step by step;
  - it is exported as a `.pipeline` (`type: pipeline`) and imported back as a second pipeline;
  - the Supervision tab still shows the supervisor's rules.
- `test-cos-ui` 6/6.

## Next
- Idearium's build pipeline as a bundled `.pipeline` (OC9, his "First one").
- BrainOS read, mapped to this tab, then archived.
- `lib/automation` moved into `cos/automation` (AE6 slice b).
- Triggers, Macros and Webhooks tabs.
