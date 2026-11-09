# 0.60.472 — .pipeline and .macro: every kind of process, by name, as a step

James, 2026-11-09: "Also .pipelines and .macros. Is it done?"

## Checked, and said
- Pipelines ran as steps and nested: a pipeline can run a pipeline or a framework, and a framework can run a pipeline.
- Macros ran as steps through Clear Glass.
- What was missing:
  - a framework's step could reach a macro, a procedure or a workflow only through a generic `run`;
  - `schema.pipeline` didn't describe today's task fields;
  - `schema.macro` didn't say a macro is a process.

## Built
- **Every kind by name:** a framework step names any kind and runs exactly one: `framework`, `pipeline`, `macro` (with `params`), `procedure`,
  `workflow`, or `run` (any engine step). `schema.process_step` has each.
- **`schema.pipeline`:** its tasks carry today's fields: framework and procedure steps, typed gates, `takes` and `gives`, `when`. It says a
  pipeline is a process.
- **`schema.macro`:** says a macro is a process and a leaf. It is Clear Glass's page actions, so it runs as a step of anything and composes upward:
  pipelines and frameworks run macros, a macro doesn't run them.

## Proof
- `eg test cos/pipeline/test/framework.test.eg`: 8/8.
- `node tests/modules/test-cos-pipeline.test.js`: 14/14. CP-13: a framework runs a pipeline (a linked child request), a workflow, and a macro. With
  Clear Glass down, the macro step fails and says so, and `onFail: continue` carries on.
