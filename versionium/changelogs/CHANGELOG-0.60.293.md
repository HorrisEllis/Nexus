# 0.60.293 — gates are pipeline blocks; macros, workflows and pipelines linked; per-site pipelines

James, 2026-10-30, reading 0.60.292:
> "what? gates are for the pipelines for macro atuomation"

Asked why it was misread:
> "considering what the context of what i proposed., and the request. why, did you misread me? i also told to stop thimnking so fucking
> narrow"

Then:
> "yes. i want that with the option for per site pipelines. make sure macros, automations, and pipelines are interconnected. i build bottom
> up, and interconnected, and compound leverage"

## The misreading, said plainly

His record says what a gate is: "fiverr working with gates for each step, each gate can be like blocks." · "gating for each step, that way
it can continue to a new page." (2026-10-28, quoted at the top of `gate-eval.js`), then KB4's step gates (2026-10-29), then 0.60.284's
pipeline task gates. A gate is a block a flow waits on before its next step.

The coder misread him in two ways:
- It took "gated" from its own last task (0.60.290's read-back of each gig field), not from his record.
- It read "universal ... stop thinking so narrow" as "push the check lower, into every write", when he meant "make gates available
  everywhere".

So 0.60.292 put an automatic read-back inside every driver and DOM write. That is archived in `_archive/2026-10-30-write-gates/`, with a
README. The parts that fit his meaning stay:
- the gate itself (`element-gate.js`);
- his gates made with the picker, per site or page;
- the driver's `gate` action, which only reads;
- `glass gates`.

## Built bottom up (PL6–PL11)

Spec: `docs/automation-pipelines.spec`. Map: `docs/2026-10-29-pipelines-phasemap.spec`, which is DAG-clean, with decisions PL_D4 and PL_D5.

1. **PL6, the block: "Wait at a gate".** It is one engine step. It waits on one of his gates (by id) or on any condition on an element:
   holds a value, holds exactly, matches a pattern, shows a choice, is ticked or clear, contains text, is visible, is gone, the address,
   or the page's text. Clear Glass's driver reads it until it opens; if it never does, the step fails with what it saw. A pipeline task is
   one engine step, so this single block works in workflows and in pipelines.
2. **PL7, pipeline task gates.** Besides "output contains", a task's gate takes an element gate, read by that same step on the page the
   task acted on. A closed gate retries the task, then fails it and blocks the tasks that depend on it.
3. **PL8, macro step gates.** They take the same conditions, and his gates by id (`use: <id>`). One gate idea now serves macros,
   workflows and pipelines.
4. **PL9, the links:**
   - a workflow runs a pipeline (the new step "Run a pipeline");
   - a pipeline task runs another pipeline, and a pipeline that would run itself is refused;
   - a macro runs a workflow or a pipeline (`run_workflow`, `run_pipeline`) through Clear Glass's own engine.

   There is one engine and one store, so what a workflow runs is what the Pipelines screen shows.
5. **PL10, per-site pipelines.** A pipeline may name its site (an address or a pattern) and run when a page of it opens. The site's Site
   settings can turn pipelines off, and `pipeline list --site <url>` lists a site's pipelines.
6. **PL11, the screens.**
   - **The Pipelines editor:**
     - Site, and "Run when a page of the site opens";
     - each task's gate: one of his gates, or an element with what it must hold;
     - two new task kinds: "Run a pipeline" and "Wait at a gate".
   - **Workflows** get both new steps from the catalogue.
   - **The gate bar and Settings** now describe gates as blocks to wait on.

## Proof

`tests/modules/test-pipeline-gates.test.js` passes 6/6 (all but PG-05 in Clear Glass). It uses one real engine, a real driver on a page,
and real macros run through the bridge's own runner:
- **PG-01:** "Wait at a gate" waits for a value that appears after 600 ms, and fails with what it saw when the value never comes.
- **PG-02:** in a pipeline, a macro's task opens at his gate; a task with a gate that never opens is retried, fails, and blocks the task
  after it.
- **PG-03:** a macro step gated on his gate by id stops on a non-email and goes on with an email.
- **PG-04:** a macro runs a workflow that runs a pipeline whose task runs a gated macro, and the email is typed at the bottom of the
  chain. A pipeline that would run itself is refused.
- **PG-05:** a site pipeline matches by origin and by pattern, only on its own site.
- **PG-06:** the Pipelines editor saves a site pipeline that runs on load, with a "Run a pipeline" task and an element gate.

Also: `test-element-gates` 3/3. Its two write-gate checks are archived with the code they tested.
