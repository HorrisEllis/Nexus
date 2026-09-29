# NEXUS 0.39.281: the provider economy — tiers and limits per provider, learned token limits, a learning router, staging by tier; ErosmancerOS in workflows and its workbench

**Date:** 2026-09-29 · base: 0.39.280 · MINOR: new routes (below)
**Map:** `docs/2026-09-29-provider-economy-phasemap.spec` — written before the work, every phase closed with its proof (EC11 is this release).

James: *"What if we have economy tags for each provider. With staging branches. Like id love an extensive configurable
options for this. What about using the tokenizer and graphs to learn token constraints. Can we enforce have the jobs
types using ErosmancerOS, and enforce the semantic randomizer. What about injecting a random question or something. Like
I want it look as close to me typing it as possible, at least with the providers. I got soft signed out of ChatGPT."*
Asked two questions. Official API providers: *"Not now."* Scope: *"Economy tags + limits, Staging per economy, Learned
token limits, ErosmancerOS job types, Smart economy like dynamically evolving and learning routing. Wha about having a
huge editor for the ErosmancerOS? Only if it these are additive."*

## Not built, on purpose

Three things were not built, and I told James so before mapping: making provider-chat jobs look like a person typing
(human timing forced on every job, a mandatory semantic randomizer, injected decoy questions). Their purpose is to get
past ChatGPT's and Claude's automated-use detection. That goes against those providers' terms, and James's own account is
what is at risk. What already existed is left exactly as it was: the optional 'reword' prompt block (off by default) and
`guardian/lib/eros-typist.js`. The economy's answer to the sign-outs is limits: automated load on a browser account is
bounded, spaced, kept out of quiet hours, and visible.

## Provenance — the commits, in build order

| phase | commit | what |
|---|---|---|
| map | 0ffc097 | the phasemap, EC0–EC11, with what exists read first and the exclusion stated |
| EC0–EC4 | ca68401 | lib/economy: policy, usage ledger, gate, token constraints, learning router |
| EC5 | 700f7df | staging by economy + the policy store |
| EC6 | 46a2ce8 | guardian enforces the economy at dispatch and records every outcome |
| — | be94276 | revert: test-run state that EC6's commit swept in (data/**, two versionium snapshots) — nothing of it was code |
| EC7 | ddfdf76 | the learning router orders builds nobody chose a provider for |
| EC8 | a422570 | the Provider economy page in the settings console |
| EC9 | 29d44d3 | browser steps can send click / hover / type as real input through ErosmancerOS |
| EC10 | a0cac05 | the ErosmancerOS workbench (tabs, nodes, console, replay) |
| EC11 | this commit | versions, specs, atlases, loom map, registry, tests registered, regression |

## New

- **Economy tags and limits** (`lib/economy/policy.js`, `gate.js`, `store.js`):
  - Every provider has a tier (local, free, subscription or metered) and can be switched on or off.
  - Limits per provider: jobs per hour, jobs per day, tokens per day, concurrent jobs, and the least gap between two jobs.
  - Quiet hours, and what to do at a limit: wait, stop, or `fallback:<provider>`.
  - Job types (build, chat, plan, manage, heal, wake, automation) list the tiers allowed to take them.
  - The policy is saved as `policy.json`. The previous one is kept as `policy.prev.json`, with who changed it.
- **Enforced at dispatch** (`guardian/lib/economy-guard.js`, one call in the dispatcher). The job waits in the queue with
  the reason given, stops with the reason, or moves to the fallback YOU configured, saying so. A provider someone chose
  is never swapped silently.
- **The usage ledger** (`lib/economy/ledger.js`, the only writer). One line per outcome in
  `<data>/economy/usage-YYYY-MM-DD.jsonl`, carrying the job, provider, job type, tokens in and out (estimated, and how),
  time, model and outcome.
- **Learned token limits** (`lib/economy/tokens.js`). Per provider: the largest input that came back whole, the smallest
  that did not, p50 and p95, and a safe limit below the smallest failure. Each says how many records it rests on and that
  it is an estimate (`estimate-v1`; no vendor tokenizer is bundled). They are drawn as a graph in the console.
- **A learning router** (`lib/economy/router.js`). Thompson sampling over each provider's success record, weighted by
  cost and speed, with exploration. It is used only when nobody chose a provider. The WARP cascade uses it for such builds
  once there are enough build outcomes, and `routedBy` names the draw.
- **Staging by economy.** In an auto-inject repo, code from a stage-tier provider (by default: local) is staged on
  `repo-<uuid>@staging` as one Versionium commit (`causedBy economy:<tier>:<provider>`), not written. If Versionium
  fails, nothing is written and the reason is given.
- **Settings → Provider economy** (idearium's settings console): all of the above is editable, with live usage against
  each limit, the token graphs and the router's scores. Changes save as one POST.
- **ErosmancerOS input on browser steps** (Clear Glass workflows). Click, hover and type can go through ErosmancerOS as
  real input. The default (in the page) is unchanged, a refusal fails the step and never falls back silently, and the
  output names which path ran.
- **The ErosmancerOS workbench** (Settings → ErosmancerOS): tabs (open, attach with a role, close), nodes (search,
  inspect, use in console), a command console (one command, or its plan only), and replay (frames, replay one). The
  existing panes are unchanged, and the console sends no behaviour profile of its own.

Routes:
- Guardian: GET and POST `/api/economy`; GET `/api/economy/usage`, `/api/economy/limits`, `/api/economy/routing`.
- Idearium: GET and POST `/api/economy`; GET `/api/economy/:what` (proxy to guardian).
- ErosmancerOS: `GET /api/replay/frames` adds `frames` beside the snapshot.

## Drift found and fixed on the way (read, not guessed)

- **Clear Glass's version points had drifted again.** CG_VERSION in main/index.js was still 3.18.0. The registry's `V`
  and the interaction contract were still 3.17.0. idearium/index.js's VERSION was still 4.7.0. All are synced now.
- **`version-sync-and-registry.test.js` pinned literal versions** (3.17.0, 4.7.0), so every release bump failed it (6
  failing on 0.39.279, 11 on 0.39.280) and the sync it guards went unchecked. It now holds every point to package.json
  and passes 30/30.
- **ErosmancerOS listed replay frames as counts only**, so no frame could be picked. It gains `ScriptReplayQueue.list()`,
  which is additive; erosmancer-os is now 0.3.0.
- **The spec-drift checker would have reported the new lib entry as "no spec".** It is named `provider-economy`, so it
  pairs with its phasemap (synced at 1.0.0).

## Registry, specs, atlases

- **Loom:** `loom/maps/economy-map.js`, wired in `loom/bootstrap.js`: 10 components, 15 hooks, 27 wires. It maps deps,
  HTTP and wire-proxy edges, including the .ts and .html ends the scanner cannot see. After a full bootstrap, all 27 of
  its wires are in the registry (checked in `loom/data/registry.json`, not just declared).
- **Correction to 0.39.280.** Its changelog said the build-surface map had 25 wires. A full bootstrap put only 21 in the
  registry: two consumers (the dispatcher, living-spec.js) had no import hook, because their edges are not require()s.
  Both maps now declare the import hook a consumer lacks, and 24 of 25 build-surface wires are in. The one still missing
  is a cos/testenv edge (detect → environment or setup-job → build-surface): its endpoint comes from cos-testenv-map and
  is among loom's 108 still-unresolved declarations, all of which predate this release. `loom/data/registry.json` is
  regenerated by the bootstrap and, as in 0.39.280, is not committed.
- **Specs:** guardian 3.19.0, idearium 4.12.0 and clear-glass 3.22.0, each with a dated addendum. `docs/SPEC-REGISTRY.spec`
  registers the phasemap. ErosmancerOS has a CHANGELOG entry.
- **Atlases:** guardian (the economy at dispatch), idearium (the Provider economy page, staging, who builds) and
  clear-glass (ErosmancerOS input, the workbench).

## Versions

system 0.39.281 · guardian 3.19.0 · idearium 4.12.0 · clear-glass 3.22.0 · erosmancer-os 0.3.0 · provider-economy 1.0.0.

## Tests

New: test-economy (11: EC0–EC5, EC7, EC9), test-economy-guardian (5, the real dispatcher), test-eros-workbench (6), probe
economy-console-chromium (9). Repaired: version-sync-and-registry (30/30).

REGRESSION

## Not done / not proven here

- No live ChatGPT or Claude account was run against the limits. Whether they prevent sign-outs is untested; the limits make
  the load visible and bounded, and nothing more is claimed.
- Token counts are estimates (`estimate-v1`), not a vendor tokenizer. Learned limits say how many records they rest on.
- No real ErosmancerOS or Chrome was driven here. The workbench was tested against a fake built to the shapes in
  `server.ts`, and EC9 against a fake driver.
- The router orders builds only after `minRecords` (20) build outcomes. Until then, the fixed chain applies.
