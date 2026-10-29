# 0.60.164 — 2026-10-19 — CR1: the project's component registry (the spine)

James, 2026-10-19: "the component registry is vital for each project becuase its the spine that makes components dumb." ·
"ollama first… as long as local and free can handle it."

Second brick of `docs/2026-10-19-solid-build-foundation-phasemap.spec`, bottom-up, free/local.

## The gap

`component-store.put` — which stores a built file **with its resolved require edges** — was wired only into the **legacy**
chunk-dispatch path (`idearium/api/index.js:9277–9596`). The **contract** build path (`fromPhasePlan` → bricks — the path
looking-glass-bundle-v0.4 used) never called it. Verified against the bundle: **no `component.json`, no graph — no registry at
all.** A built project had no spine, so nothing held the wiring that lets a component stay dumb.

## The fix — every built file joins the spine

- **`lib/project-registry.js wireBuilt({ project, repoUuid, phase, files, read, agent })`** — stores each built file into the
  project's component store (`lib/component-store.js put`) in **dependency order** (`plan.order`), so a dependency is in the store
  before its consumer and the require edge **resolves** to a real dependency rather than an unresolved import. Returns
  `{ stored, created, resolved, unresolved, standalone }`. `standalone` names a non-leaf component with no edge and no consumer —
  an isolated dot (rule 3: a component with no wires is a defect, not an update). §1.2: one file's store failure never fails the
  build.
- **Wired at contract-complete** (`idearium/api/index.js`): on `res.complete`, `wireBuilt` runs over `plan.order` reading each
  brick's final content (`codeOf`), and a `registry` run-row records what was wired (`stored`, `resolved` edges, any standalone).

## Reuse, not new (§8.6)

The component store, its dependency resolver (`_depsOf` = the require edges), and `idForproject/path` ids — all reused. No second
registry. Loom-wired: `lib/project-registry.js` declared with its `component-store` require edge; the `index.js → project-registry`
consumer edge added (`loom/maps/build-surface-map.js`).

## Why it matters (the spine → dumb components → local-first)

With the registry holding the require/consumer edges, each component can stay small and single-purpose — which is what lets a 7B-class
local model write it. The spine is the mechanism behind "chunk dynamically so local can handle it": you make components small by
decomposing against the spine, not by splitting a file mid-build. (Mapping DC1 showed the contract splitter can't chunk a single
file — its children would overwrite the same path — so CR1, the spine, is the real lever, exactly as James said.)

## Proof

- `tests/modules/test-project-registry.test.js` — CR 5/5 (registered): a file requiring a sibling resolves to a real **edge**
  (CR-01); dependency order makes the edge resolve (CR-02); a consumer built before its dependency is counted **unresolved**, not a
  false edge (CR-03); a non-leaf loner is reported **standalone** while a leaf `index.js` is not (CR-04); empty content is skipped
  and nothing throws (CR-05). Store isolated to a temp dir via `NEXUS_COMPONENTS_DIR`.

## Files

- `lib/project-registry.js` — new; `wireBuilt`.
- `idearium/api/index.js` — wire the spine at contract-complete.
- `loom/maps/build-surface-map.js` — declaration + consumer edge.
- `tests/modules/test-project-registry.test.js`, `tests/modules/run-all.js` — the test, registered.
- `lib/version.js`, `package.json` — 0.60.164; `docs/2026-10-19-solid-build-foundation-phasemap.spec` — CR1 marked built.

## Next

AB1 — the economy-wait-then-retry James flagged (his build stuck "cancelled · economy holds chatgpt 299 s"): a rate-limit hold
should **wait and retry** when the slot frees, not cancel. That's the resume lever, and it unblocks the currently-stuck build.
