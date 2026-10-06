# 0.39.360 — 2026-10-06

James: "the daw is a test. fuck the daw. were building capacity to build the daw, not the daw" · "yeah we need to fix all o that. expanding using the specs, then phased, then chunked, then coded. look at the nexus repo. skeletons need to be greyed out until they're coded."

The nexus repo already grows this way. A phasemap `.spec` in `docs/` names, for each phase, the files it builds. The phases manager then builds each phase: a snapshot first, the escalation ladder, and a check that every named file comes back. Changes land greyed until they are committed.

A skeleton repo from 0.39.359 had none of this once it was made. Its components were slotted in once, at creation. It now grows the same way as the nexus repo. Mapped and built as SB42–SB45 (build-from-the-spec 1.21.0).

## Expanded from the spec (SB42)
There is a new route, **`POST /api/repos/:uuid/expand`** `{ feature, ask }`, and a **+ expand** button on the repo's Phases tab. It only works on a skeleton repo, meaning its `registry-components.js` has the slot. The steps:
1. **A Versionium snapshot is taken first.**
2. **The agent plans only the new components.** It sees the system's own components and is asked for the new ones, under the same slot rules as before:
   - files only under `lib/`, `tests/` or `ui/`;
   - each component has a capability and commands;
   - each component says what it uses.

   You can also pass `components` directly instead of an `ask`.
3. **The spec grows before any code.** `lib/repo-expand.js` slots the components in:
   - registry entries, appended to `registry-components.js`;
   - the living spec's `components` list;
   - every component, capability, command, event, route and hook node.

   A component already in the system is refused, with the reason.

## Phased (SB43)
The expansion writes **`docs/<date>-<feature>-phasemap.spec`** into the repo, in Nexus's own phasemap shape. Each component gets one phase:
- **Numbered in build order.** A phase comes after the components it uses. Phase keys never reuse one the repo's maps already hold.
- **Its files:** the component and its test.
- **What it must do:** export each command as `<verb>(args, ctx)`, and reach other components only through `ctx`.
- **Its proof:** the component's test.

The Phases tab reads the map with no new code (loom's parser).

## Chunked, then coded (SB44)
- **Each code file is a chunk from the moment it is planned.** It is pending, with no content (`planChunk` in the spec engine).
- **The existing phase build codes them.** It snapshots, climbs the ladder, and expects exactly the files the phase names.
- **Writing a file codes its chunk.**

## Greyed until coded (SB45)
- **Uncoded files are greyed.** A file whose chunk has no code is `uncoded`. It is tagged **U** and greyed in the Files tree and the Code tab until it is written. The summary counts files "not coded".
- **An empty slot never reads as finished.** A skeleton with nothing of the idea in it (`slotOpen`) is never complete and never 100%: the slot is one more unit of its progress. Planning a file reopens a finished spec.

## Refusals write nothing
- **409** — the repo is not a skeleton (`NOT_SKELETON`).
- **422** — nothing new slots in.
- **502** — no snapshot.

## Proof
- **New: `test-repo-expand` passes 7/7:**
  - expansion runs against a laid-out skeleton;
  - its phasemap is read by the phases manager in build order;
  - it works through the API on a real repo, against a Versionium stub on its configured port;
  - uncoded files are greyed, and coded once written;
  - an empty slot keeps the spec open;
  - refusals write nothing;
  - the UI is wired.
- **Unchanged and passing:**

| Suite | Result |
|---|---|
| test-system-skeleton | 8/8 |
| test-file-tree-plan | 63/63 |
| test-event-contracts | 8/8 |
| test-nexstore-writers | 3/3 |
| test-route-contracts | 4/4 |
| test-idearium-codegen | 6/6 |
| test-registry-drives-build | 5/5 |
| test-genesis-and-architecture-spec | 7/7 |
| test-build-surface | 13/13 |
| test-build-surface-2 | 3/3 |
| test-moce-roadmap | 43/43 |
| test-moce-roadmap-ui | 17/17 |
| test-one-idearium-phases-nodes | 21/21 |
| test-phase-actually-builds | 6/6 |
| test-workshop-full | 10/10 |

## Not yet
- **A phase isn't closed automatically when its files are coded and its test passes.** The prove loop and the status edit are unchanged.
- **The proof check doesn't yet verify every slotted component.** It should check that each one exports its handlers and that the system's own `tests/skeleton.test.js` passes. That is gap 1 from the last answer, not built here.
