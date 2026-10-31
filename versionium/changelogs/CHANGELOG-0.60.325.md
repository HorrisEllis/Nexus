# 0.60.325 — a test that wrote into data/ fixed; one release command; Architect's future and the orchestration order decided

James, 2026-10-31:
> "okay, since it's small. should we migrate architect to idearium or loom?"
> "also make any tools that help you speed any of this up. like i wanted a refactor tool in diearium to do all of this, in the phases."
> "lets do the orchastration. that needs to be done completely."

## FX1: a test that wrote into the real data/ (docs/2026-10-31-fixes-phasemap.spec)

- **Cause:** `lib/component-ledger.js` read `NEXUS_DATA_ROOT` when it loaded, but never called the test sandbox's `ensure()`. Every other
  store resolver does.
  - So `test-mutation-contract` wrote `data/ledger/test/test.widget.panel/<day>.jsonl` into the tree. The stop hook caught it.
- **Fix:** `ensure()` is called first, as `chat-logger` and `component-store` do.
- **Proof:** `test-test-sandbox`'s new FX1 check passes. Without the fix it fails.
- **Left open:** that suite's "every test that starts a NEXUS process" check fails on main without this change. It names
  `test-cos-app-runtime` and `test-projects-overview`.

## FX2: one release command (`scripts/release.js`)

- **What it does:** bump with his quoted line, VERSION, the changelog, every touched map's `.phase`/`.graph` regenerated, the named tests,
  then stage everything except `data/`, one commit with the trailers, and push with tracking.
  - A red test stops it before anything is committed.
  - It refuses to run on main.
  - `--dry-run` says each step and changes nothing.
- **Why:** twice on 2026-10-31 the regenerated graphs were left out of a release commit.
- This release is its first real use.
- **Proof:** `tests/modules/test-release-tool.test.js` 4/4.

## The refactor tool he asked for already exists

- Idearium has `system migrate` (`lib/architecture-migrate.js`), `architecture-apply` (move a folder, rewrite only what can be proven, check,
  undo with git) and `repo refactor move|rename` (through the registry, verified).
- **What is missing:** a phase whose work is a move, run by the tool with no model. That is to be mapped next.

## Decisions recorded

- **DO_D3 (his to confirm), Architect:**
  - Its hook registry and map scan duplicate Loom's, so they fold into Loom (§10.3, one truth).
  - Its authoring, spec wizard, translate and compile, and "move and route components", go to Idearium, beside the refactor tool and its
    Architect sub-tab (§8.6).
  - ALK goes to Intelligence. The SNR gate becomes the door template (RULE C).
  - `architect/` is archived after.
  - DO2 waits on his answer.
- **MG_D13 (decided by his axioms):**
  - MG15, the supervisor in COS, no longer waits on CS4a ("COS boots alone").
  - The supervisor carries CS4a's behaviour as a policy: `bootSet: 'all'` by default, today's behaviour; `'core'` is CS4a.
  - CS4a becomes setting that policy after the handover (MG17). That avoids building it into autopilot and then moving it (§8.6, §3.3).

Proof: `test-substrate-spec` 3/3. The DAG has no new problems.
