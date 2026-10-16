# 0.60.66 — 2026-10-15

James: "Continue" — continuing the pipeline he asked for: "need the agents to use the spec compiler? like the yaml. need to inject a framework for generating a .spec file. then need to listen for it to collect it. intent based .inject nodes" · "The agent keeps having to find context, with tools."

## SF1: prompt blocks chosen by intent

- A prompt block can say `when: intent:<name>` (or `intent:a|b`).
- The intent comes from the repo agent's own checklist step (`lib/context-prereqs.js`), which gains `spec`: a request
  to write or draft a spec, or one naming a `.spec` file. "Does this match the spec?" stays `explain`.
- `compose()` works the intent out for every caller (chat, preview, builds).
- The Agents settings show an intent block's intent in full ("requests whose intent is spec").

## SF2: the spec framework

- A new default block, `spec-framework`, is sent only for spec requests. It teaches the spec compiler's own format:
  root `spec:`, meta, modules with exports as `name(params) → returns`, schemas, tests.
- Its example is itself checked to be a spec the compiler can read, so it can't teach a broken shape.
- Editable and switchable like every block; his edit is what is sent.

## SF3: the listener that collects it

- **Gate**: the `code.write` step gate, which every agent file write already passes, gains `spec_format`
  (`lib/spec-collect.js`). A `.spec` whose top key is `spec:` must satisfy `docs/spec-compiler.spec` spec_format, or
  it is refused with exactly what to add ("spec.meta.version is required", "exports[0] must read name(params) →
  returns"). Phasemaps and prose specs are never judged.
- **Collect**: a spec that lands carries its modules and exports on its `.inject`, and `idearium.spec.collected` goes
  out on the bus, tagged with the phase that asked for it (a phase build passes `map::phase` through to the reply).
- **Not built, said**: registering a collected spec in the spec engine (the file is in the repo, which is where Idearium
  reads specs from); and re-asking the agent once when its spec is refused (the reasons are in the reply's refused list).

## MP3: builds start with their context

- A phase build's request carries the new `build-phase-map` block (editable): what Nexus mapped for the phase — files
  and why, the names they export, what they require, what uses them, what it waits on, the specs.
- A chunked build for a small model gets only its own file's part, inside the existing budget.
- The chat Agent tab is not changed: it still finds context with tools.

## Found by the run

Threading the phase broke 9 of 67 `test-repo-agent-provider` checks ("phase is not defined"): the inject call sits
in `_finish`, not `_dispatch`. Fixed before shipping; 67/67.

## Proof

- `tests/modules/test-spec-pipeline.test.js` 7/7 (5 fail on the old code). SP-06/07 land a real agent reply through the
  real repo layer: a good spec is collected with its modules, exports and phase; a bad one is refused with what to fix.
- `test-chunked-phase-build` 16/16; the new CB-03b fails without the build wiring.
- Unchanged: repo-agent (35), repo-agent-provider (67), repo-agent-node (44), repo-agent-late (17), repo-inject (83),
  step-gate (18), context-prereqs (7), contract-phase-build (11), nexus-inject-approval (9), shadow (16).
- `js-yaml` was installed locally (not committed) to run the suites that need it.

## Next

WB0–WB2 (every build through WARP), SF4 (compile a collected spec, zero tokens), MP4 (a model only for phases nothing
maps), IS1 (intent settings per repo).
