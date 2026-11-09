# 0.60.471 — a framework as a step, recursive; schemas for executable processes

James, 2026-11-09: "Frameworks as steps. Or a framework as a step. Recursive. Fully programmable. Executable processes. Schemas for them."

## Built
- **Schemas:** `schema.process` is one shape for every executable process: id, name, kind, status, agent, takes, gives, contract, execution,
  steps. `schema.process_step` is its step: section, does, takes, gives, after, run or framework or pipeline, agent, check, when, retries, onFail.
  - Both are registered in `KNOWN_TYPES`.
  - `schema.framework` stays Intelligence's generated `.js` skeleton (same word, a different thing), with a note pointing here.
- **The engine's `framework` step:** the host (COS) compiles the framework and every framework its steps run, at any depth, children first, then
  runs it as a pipeline step. It shares the same chain and depth limit, and each nested run is a child request linked to its parent.
- **Recursive:** a framework step can run a framework. A framework that runs itself, directly or through others, is refused with the loop named,
  both when compiled and when run.
- **Programmable:** a step runs exactly one thing: an engine step, a framework, a pipeline, or an agent.
  - The framework's `execution` (`retries`, `onFail`) is its steps' default, and a step's own wins.
  - The default gate (a node of the type it gives) applies where an agent does the step. Anything else is checked by what it runs, or by its own
    check.

## Proof
- `eg test cos/pipeline/test/framework.test.eg`: 7/7.
- `node tests/modules/test-cos-pipeline.test.js`: 13/13. CP-12: a pipeline's framework step runs outer, then mid, then inner, each a request linked
  to its parent, with the deepest one's data in its own files. A loop of frameworks is refused when compiled (409) and when run.
