# 0.39.306 — 2026-10-05

James: "I just need to get this all mapped. Like idearium is for my ideas. Promote into a spec with full options for each block and a custom setting to write in. Like it needs to reuse as much as possible by default. To save tokens. Like nexus gets more effectient. Like it needs to build .spec files. Each block is then chunked, then each component is chunked. Using the register as a dependancy and file check list."

## The whole pipeline, mapped
`docs/2026-10-05-build-from-the-spec-phasemap.spec` 1.1.0 lays out the pipeline in his words. Idearium's own phasemap checker reads it as valid and bottom-up.

**The pipeline:** idea (his) → promote → `.spec` → blocks → registry → components → proven → stored.

- **SB8, promote with full options for each block.** For every block you choose who writes it (him, reuse, a template, an agent, or skip it), which agent and fallback, its frame, and how deep it's chunked. Each block also has a custom box: his own text, or his instruction to the agent writing it. The choices are saved as a preset, and reuse-first is the default.
- **SB9, the `.spec` file is the artifact.** The repo's `spec/<name>.spec`, in the block format the workshop and the library already use, is written as each block completes and reads back into the same blocks. One writer replaces the current three.
- **SB10, reuse first, keyed on the right thing.** The order for every chunk is: the component store, then the same block contract already built, then WARP's exact cache, then an agent. A block contract is the block plus its frame plus what the spec is about. The tokens saved are recorded, so efficiency is measured rather than claimed.
- **SB11, each block chunked.** A block bigger than its agent's budget is built as sub-chunks and joined, reusing the fractal-graph map's FG2.
- **SB12, the registry drives the build.** Block 11 becomes three things:
  - the component list, from which the file tree is derived;
  - the dependency graph, ordering components by their real wires rather than by layer;
  - the file checklist: every component's file must exist, parse and pass.

  After the build, the registry read back from the real code is compared against the promised one.
- **SB13, each component chunked.** A component is built from its own contract plus the interfaces of what it depends on, not their code. A large component is built in pieces at code-intel's cut points (FG4, FG5).
- **SB14, reuse compounds.** Each proven component enters the store, and the next spec's registry is matched against it before anything is built.

## Found while mapping, fixed
The build's second reuse step, `findPriorSection`, matches a section only by its name and description. So another project's schema or API section can complete a new spec's section at zero tokens. 0.39.305 made his author sections reusable that way; now they never are. The general fix is SB10.

## Proof
`tests/modules/test-build-from-the-spec.test.js` passes **4/4**. BS-02 now also asserts that an author section is never reused across specs.
