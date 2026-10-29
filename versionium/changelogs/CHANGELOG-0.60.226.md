# 0.60.226 — 2026-10-23 — JA2: the picked field is saved per site, and the fill path reads it back

James, 2026-10-23: "then the phases with the per site settings."

## What was missing
JA1 (0.60.225) made `matchFields` **consult** a learned map, but nothing **saved** one and nothing **loaded** one on a real fill —
so the loop was open at both ends. JA2 closes it for the general application matcher: a field taught once is saved under the
application's **origin** and filled on that site every time after, without being asked again.

## Reuse before build (§8.6)
No new store. The existing `clear-glass/src/site-settings/store.js` (`get` / `set` / `getAllForOrigin`, `normalizeOrigin`) is the
per-site home GA3/GA4 already name. Two pure helpers keep the save door and the fill path on **one** format, so there is one truth
(§10.3), not two copies drifting.

## Built (backend → API route → command/agent, his order 2026-10-07)
- **`clear-glass/src/autofill/matcher.js`** — pure helpers, exported:
  - `learnKey(fieldKey)` → `autofill.field.<fieldKey>` (lowercased, trimmed) — the one key format.
  - `learnedFromSettings(allForOrigin)` → the `{ fieldKey → fieldType }` map `matchFields` already consumes, built from only the
    prefixed keys (unrelated site-settings entries are ignored).
- **`clear-glass/src/ipc/bridge.js`**:
  - `POST /cli/autofill/learn` — `{ fieldKey, fieldType, url? }` → `siteSettings.set(origin, learnKey(fieldKey), fieldType)` under
    the tab's normalized origin; returns `{ ok, origin, fieldKey, fieldType, learned }`.
  - `_pageUrl(agentId)` / `_learnedFields(agentId)` — resolve the tab's URL and load `learnedFromSettings(getAllForOrigin(url))`.
  - `/cli/autofill/detect` and `/cli/autofill/fill` now pass that learned map to the matcher, so a taught field fills on the next
    visit with no prompt.
- **`clear-glass/src/copilot/tools.js` + `copilot/bridge.js`** — the `autofill.learn` tool and its dispatch, so an agent teaches a
  field through the same door a person uses (every capability a person has reaches the agents — his rule).

## Proof
`tests/modules/test-autofill-learn-save.test.js` — JA2 **3/3**:
- JA2-01 `learnKey` / `learnedFromSettings` round-trip, prefix-scoped (unrelated keys ignored);
- JA2-02 a saved pick is **per-origin** (real `SiteSettingsStore`, in-memory persist);
- JA2-03 a saved pick drives `matchFields` to fill a pattern-missed field **end-to-end**.

## Files
- `clear-glass/src/autofill/matcher.js`, `clear-glass/src/ipc/bridge.js`, `clear-glass/src/copilot/tools.js`,
  `clear-glass/src/copilot/bridge.js`.
- `tests/modules/test-autofill-learn-save.test.js`, `tests/modules/run-all.js`.
- `docs/2026-10-19-gig-autofill-and-learn-phasemap.spec` (JA2 addendum); `lib/version.js`, `package.json` — 0.60.226.

## Open next
- **JA3** — on a miss, the element picker pops up (reuse `renderer/selector-check.js` + `selector-assign`).
- **JA4** — the UI for the learn-loop (the fill path already loads `learned`).
- **A real Clear Glass fill** on one live listing — his login, his machine.

---

> **0.60.226 was used twice.** The entry above is main's (the JA line, Clear Glass autofill). The entry below is from `claude/sleepy-gates-9lc085` (the SL line), built in parallel under the same number and merged in 0.60.233. Neither was renumbered (§0.3): both are kept here, as they shipped.

---

# 0.60.226 — 2026-10-23

James: "can you decompose the phases into .phase with the dependancy graph per phase node. then move them into the repsective systems,
or sort them at least. need to do something about the dependancy graph. in the idearium pipeline, building phases, extending, building
from scratch. run deep and recursive simulations, of every possible failure mode, loop until we get a solid pipeline. using all phases,
specs, everything you can to get idearium coding any project, any phase. agent needs to map dependancies if nexus cant map one."

## Mapped first

`docs/2026-10-23-self-building-loop-phasemap.spec` has a dated addendum quoting this request and adding:

| Phase | What |
| --- | --- |
| SL7 | build a complete phase again only when asked |
| SL8 | the agent maps what Nexus cannot |
| SL9 | every phase a node |
| SL10 | the pipeline simulated |

SL3 (the backlog groomed) was already mapped and owns the DAG repair. `docs/self-building-loop.spec` gained four modules, one schema
(AgentMapping) and four interfaces, and compiles at full depth (test-substrate-spec 3/3). The measurements behind the map are in its
addendum:
- 1971 phases, 1172 open;
- 535 phases with no depends_on;
- 565 open phases with no files;
- 244 that MP1 cannot place;
- 3 cycles and 17 dangling references.

## SL7: building again (this release)

The pipeline's own suites were the first evidence. On main, test-contract-phase-build was 5/14 and test-chunked-phase-build was 11/16.

- **Root cause 1.** SL1 (0.60.223) closes a proven phase. After that, every later build of the phase (resume, replan, retry) was refused
  with ALREADY_COMPLETE.
  - Now a complete phase is built again only when asked: `rebuild: true` on the route, or `repo phase <repo> <phase> build --rebuild`.
  - The UI asks before it builds again. The Tasks panel's retry button now goes through the same door as ▶ build.
  - The run's rows say `rebuild: true`, and the status reason says "built again on request".
  - Without the ask, the refusal stays and now names how to ask.
- **Root cause 2**, found once builds ran again. A resumed build re-sent every file.
  - The contract's input was the whole phasemap file. The pipeline's own status writes (DONE, active, status_previous, the
    `# roadmap edit` comment) changed that file, and so did any edit to another phase in the same map. Each of these STALEd every brick.
  - `cortex/core/raid/contract-gates.js` `phaseBlock`: an input `{ path, phase }` now hashes only the phase's own block, without its
    status lines. A change to what the phase actually says still STALEs it.
  - CP-06's miscount (counted 10, dispatched 15) was the same re-sending.
- **Missed in 0.60.225:** the `VERSION` file was left at 0.60.224. It is 0.60.226 now.

## Proof

| Suite | Before | Now |
| --- | --- | --- |
| test-contract-phase-build | 5/14 | 14/14 |
| test-chunked-phase-build | 11/16 | 16/16 |

Unchanged and green: phase-close 6/6, evidence-close 5/5, contract-adapters 19/19, build-queue 6/6, phase-graph 4/4,
phase-deps-gate 3/3, substrate-spec 3/3.
