# 0.60.458 — AE7: ERAVOS's way into COS's automation engine

James, 2026-11-08: "I want cos to have the automation engine. With a ui for this." · "Then an api that eravos can use for the step. So needs full
cli commands, events, nodes."

- **COS's contract spells out the engine** for anyone to read, by route only:
  - 14 routes: workflows, export, run, one step, catalogue, templates, active, runs, log, nodes, import, pipelines, webhooks;
  - its 8 `automation.*` events, streamed on `/api/cos/events`;
  - a `for_eravos` section: the box kinds come from `/catalogue`, a box runs one step through `POST /step`, and a workflow runs through its run
    route. It also covers watching the events and the node routes.
- **COS's command line:** `automation workflows | run <id> | step <type> [key=value …] | active | log [n] | catalogue | nodes | export <id> |
  import <file>`. It goes through the same door as the routes, so the two can't drift.
- **Agents:** the row `cos.automation`. Reading is any agent's; run, step and import act, so they are his, or an agent proposes.
- **Proof:** test-cos-hub HB-06 checks:
  - the commands answer, and the procedure step is listed as a box kind;
  - one step runs by route;
  - a workflow created by route and run by command puts `automation.run.start` and `automation.run.complete` on COS's stream;
  - the contract carries ERAVOS's section.

  The test passes 6/6. test-change-record 7, cos-ui 6, cos-console 11 and orchestrator-automation 8 all pass. CL-07 still fails, as before,
  because it needs Guardian.
- **The UI:** a preview of COS's Workflows page was shown to him for critique. It is built after his notes.
