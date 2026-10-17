# 0.60.125 — 2026-10-17

James pasted the proposal Gemini left for `PC1_the_point_first`: `lib/phase-manifest.js`, from run vur-acn3, which ended
contract-incomplete.

The coder recommended rejecting it, for four reasons:
- It requires `./schema.contract`, which is not there. The real `lib/node-schemas/schema.contract` is a node file, not
  code.
- `parsePhasePlan` returns its input unchanged.
- It is not one of the phase's files.
- It makes no manifest, which is what the phase's proof asks for.

The coder named the cause: PC1 depends on PC0a, PC0b and PC0c. Those are three decisions in the phasemap that are his and
still OPEN, and ▶ build did not check `depends_on`. So five agents spent twelve attempts building a phase whose design
questions had no answers.

His answers, verbatim:
- PC0a: no preference.
- PC0b: no preference.
- PC0c: "thats what the agent proposed. do not impliment. thats on me".
- On the gate: "Refuse, say why (Recommended)".

The coder's reading of the PC0c answer, to confirm: the manifest and the PC1 proposal are his to write and to decide.
Neither is implemented here, and the proposal is left for him. PC0a, PC0b and PC0c stay OPEN. All of this is recorded in
`docs/2026-10-17-pieces-not-order-phasemap.spec`, addendum (b).

## DG1 — a phase is not built while what it depends on is open

- **Backend:** `lib/phase-deps-gate.js` decides what counts as open.
  - Open: a decision in the map's `decisions:` that has not been made, and a phase that is not complete.
  - Not open: a decision that was made, a phase that is done, and a name found nowhere. A name found nowhere is said,
    not blocking.
- **Route:** `POST /api/repos/:uuid/phases/build` refuses with 409 `DEPS_OPEN`. The refusal names each decision by its
  question, for example: "PC1_the_point_first waits on PC0b_first_kinds (a decision still OPEN: "which purposes are the
  first piece kinds?")…". `anyway: true` builds it anyway, and every row of that run records the override as
  `depsOverride`.
- **Command:** `repo phase <repo> <phase> build --anyway` does the same.
- **UI:** one door for every ▶ build, `phaseBuildPost` in `plan-panel.js`. The Plan, the Phases tab's cards and its
  detail pane all go through it. It shows what the phase waits on and asks before building anyway.

## Proof

`tests/modules/test-phase-deps-gate.test.js` passes 3/3:
- DG-01: the gate itself. On the real phasemap, PC1 waits on PC0b and PC0c.
- DG-02: through Idearium's real router, a 409 with the question, and `anyway` passes the gate.
- DG-03: every ▶ build uses the one door, and the command has `--anyway`.

Neighbouring suites, all passing:

| Suite | Result |
|---|---|
| test-contract-phase-build | 14/14 |
| test-hardening-pass | 9/9 |
| test-phases-tab | 5/5 |
| test-plan-sidebar | 4/4 |
| test-plan-pieces | 4/4 |
| test-code-tab | 16/16 |
| test-step-gate | 18/18 |
| test-chunked-phase-build | 16/16 |

test-chunked-phase-build showed 11/16 in one run that shared port 3754 with another test running at the same time. Run
alone, it passes 16/16.
