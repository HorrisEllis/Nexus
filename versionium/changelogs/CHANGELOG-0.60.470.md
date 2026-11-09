# 0.60.470 — frameworks as steps (meta), requests recursive

James, 2026-11-09: "you did the .frameworks right? .macros? .pipeline? like for steps? its meant to be recursive and meta."

## Checked first, and said
- `.macro`, `.pipeline`, `.procedure` and workflows were already steps.
- `.framework` was not: PC2 slice b was open, and his framework file is prose.
- A pipeline step started a child run, but the child's request didn't know its parent, and the parent step didn't name its child.

## Built
- **Meta (`cos/pipeline/framework.eg`):** a `.framework` that declares its steps (a ```` ```json framework-steps ```` block beside its prose, never
  replacing it) compiles to a `.pipeline`. Each step becomes a task with:
  - what it takes and gives;
  - a node gate of its type;
  - a condition;
  - what it waits on;
  - by default, an agent step that does its section with what it takes.

  The pipeline runs as a step of any other. A framework that only describes is refused, with the missing parts named (409).
  - Routes: `GET /api/cos/frameworks`, `POST /api/cos/frameworks/:file/pipeline`.
  - Command rows: `cos frameworks`, `cos framework-compile`.
- **Recursive:** a step that runs a pipeline passes itself as the child's parent. The child request names its parent request and step, and the
  step names its children, at any depth.
- **His framework:** `docs/innovation-toolkit.framework` gains a DRAFT executable block, the coder's, drawn from the words of Sections 2 to 10. It
  compiles to a 9-step DAG ending in hostile verification.
  - Section 0 is the gate before the framework runs.
  - Section 1 is the loop around it (PC7).
  - Section 11 is somatic, and his.
  - Which Sections are steps, what each gives, and the agent who does them (drafted as claude) are his to correct.

## Proof
- `eg test cos/pipeline/test/framework.test.eg`: 4/4.
- `node tests/modules/test-cos-pipeline.test.js`: 12/12. CP-11: a framework compiled, run as a step of another pipeline, both requests linked,
  the framework's `.context` and `.contract` in the child's files.
