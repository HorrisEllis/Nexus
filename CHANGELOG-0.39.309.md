# 0.39.309 — 2026-10-05

James: "Using the register as a dependancy and file check list."
James: "wire it up. then update the map."

## The registry drives the build (SB12)
- **The registry section ends in a component list.** The agent writing it is asked for one YAML list: each component's file, layer, purpose and what it depends on.
- **"Generate code" builds from that list.** It makes one file per component, and each file waits only on the files it depends on, not on every file in the layer below. No agent is asked to plan the files.
- **Verify checks the built repo against the list.** A promised file that's missing, empty or doesn't parse fails, and the prove loop sends it back to be built.
- **Without a usable registry,** the agent plans the files as before, and the answer says why the registry couldn't be used.

## Found while wiring it
An unbuilt chunk is written to disk as an **empty file**. An empty `.js` parses and an empty test "passes", so verify could call a repo with no code in it proven. The registry check now counts an empty file as missing. The same fix for repos without a registry is mapped as SB15.

## Fixed
BV-09 in `test-build-verify` checked the exact source text of the line 0.39.307 changed, so it failed. It now checks the new line and keeps its purpose: a code file chunk is still judged as a file.

## Maps updated
- `docs/2026-10-05-build-from-the-spec-phasemap.spec` 1.2.0:
  - SB12 is done.
  - Each SB phase names the older phase it overlaps (TP1, FG2/FG4/FG5, DT4, CX0), so it's one picture, not two.
  - SB15 is added: empty files don't count as built.
- **DT4** (agent-ready master map) is marked partial, since SB12 covers part of it.
- **The Idearium atlas** has a new section on building from the spec.
- **Loom** has the hat-with-the-repo edge and the registry edges.

## Proof
- `tests/modules/test-registry-drives-build.test.js` passes **5/5**:
  - parsing, including a missing dependency, a self-dependency, a lower layer depending on a higher one, a cycle and an unsafe path;
  - the dependency order;
  - the checklist, including an empty file;
  - the prompt;
  - the real routes: Generate code builds from the registry, verify fails on the five unbuilt files, and a spec without a registry says why.
- `test-build-verify` passes **11/11**.
- The codegen, prove-loop, file-tree, build-surface, plan-lands, phase-proof, proof-run, workshop and build-from-the-spec suites all pass.
