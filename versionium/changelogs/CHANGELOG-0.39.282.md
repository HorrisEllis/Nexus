# NEXUS 0.39.282: the suite green with every gap named, the test sandbox closed, step gates (nothing written empty), the desktop login, Ollama by default

**Date:** 2026-09-29 · base: 0.39.281 · MINOR: new config keys and a new node type (below)
**Map:** `docs/2026-09-29-nex-node-store-phasemap.spec` (N0–N29). It was written before the work, and each phase states its status and proof. **Handoff:** `docs/2026-09-29-handoff.md`.

James: *"Get the suite green, or mark each failing test as a known gap with its reason."* · *"the desktop envitement needs to either ask, or give me the login. or use a generic password listed in the atlas."* · *"Ollama should be default I feel like."* · *"Shouldn't generate empty. Why not gate each step with events."* The live boot log showed:
- guardian crash-restarting with `json is not defined`;
- replies recorded as `0ch`;
- empty code captures;
- the officiator failing on a hard-coded `claude`;
- src/kernel/state.js at 0 bytes, with its plan job marked "replied".

## The suite

- **The suite is green.** A full run of 404 suites (in chunks, via `--start/--count`) has 0 unregistered failures. 30 cases in 20 registered files still fail, each one listed in `tests/known-gaps.yaml` with its kind and reason. 4 of the 24 registered files are not in run-all's list.
- **Triage.** Of 81 failing files, 57 were fixed at their root cause. The other 24 are registered with one of these kinds:
  - missing-module
  - missing-archive (`_archive/` is not in the repository)
  - needs-live-data
  - spec-drift, tied to N14
  - decision (the tablet's "one write verb" law)
  - regression (map3d bottleneck colour)
  - unbuilt
  - stale-ui
- **How run-all reports gaps.** A registered file failing at or under its count is reported as a **known gap**, with its reason. A file over its count still fails the run, and so does any timeout. A gap that now passes is flagged so its entry can be retired. `--strict` ignores the register.
- **run-all kills a suite's whole process group** on timeout and when it exits. Before, a timed-out suite's guardian and autopilot kept running, held their ports, and answered later suites, causing failures that showed up only in a full run. A suite that needs longer declares it in its header (`run-all: timeout <ms>`). `tests/modules/test-run-all-process-group.test.js` proves this live.

## Real bugs fixed

- **guardian:** `json()` was undefined, so the provider sign-in and economy routes crash-restarted it; async routes also answered 404 before replying.
- **guardian:** `guardian.job.complete` now carries the reply text and chat url. Before, `jobs.response` was stored empty.
- **Code capture:** code is now taken from replies whose fences arrive split away from the file (`lib/extract-code.js`, `guardian/lib/code-artifact.js`).
- **RAID officiator:** RAID now picks who synthesizes, replacing five literal `'claude'` defaults.
- **Default provider:** a repo with no provider follows the global setting (`repos.default_provider`) instead of a hard-coded chatgpt.
- **copilot confidence:** an answer that reports its own failure now floors confidence and escalates. Before, it scored 0.76 and never escalated.
- **cortex:** `/api/event` now broadcasts to `/sse`, and `/api/raid/status` is restored, so the orchestrator's `raid` command no longer always says "offline".
- **intelligence:** `POST /api/intelligence/event` was served but never declared in the registry or the contract.
- **copilot / module-builder:** the full token intersection now resolves ("connect the eravos wire" → `eravos.wire.connect`).
- **tablet:** every address now comes from autopilot. The page used to carry copilot's `:3750` and a nine-system port map, which its own connection law forbids. Autopilot's status now reports each kernel's port.
- **Queue:** `lib/queue.js` `retry()` could tie in the same millisecond, so a retried item sometimes sorted ahead of work that never failed.
- **Also fixed:**
  - `.docx` resume import;
  - a second "hey nexus";
  - the duplicate copilot component id (`context.get` → `context.session`);
  - guardian's registry version.

## The test sandbox, closed

Ten stores used to write into the real tree during tests. Each now follows a sandbox root (`lib/test-sandbox.js` STORES):
- the versionium store and `.nex` snapshots;
- `lib/cortex-write.js`;
- guardian response nodes;
- seven hard-wired `data/` ledger paths: guardian ledger, boot and CFR; autopilot's `cfr_state`; the orchestrator's CFR ledgers and `data/ledger`; RAID contract-intake; `lib/component-ledger.js`;
- `LEDGER_STORE_ROOT`: tests had counted the real tree's canonical writes against sandboxed breadcrumbs and reported intelligence "starving";
- RAID's per-system input/output (`RAID_SYSTEMS_ROOT`), plus `RAID_INPUT_DIR` and `RAID_OUTPUT_DIR`;
- intelligence's domain nodes (`INTELLIGENCE_NODES_DIR`);
- `emerge/cortex-query/writeback.js`'s failure log.

Two more fixes:
- `lib/system-nodes.js` sync is now a dry run when a test process calls it on the real tree.
- guardian's downloads queue sits beside its nodes directory. In the sandbox it had resolved to `/tmp` itself, one queue shared by every suite.

## N21: step gates (nothing written empty)

`lib/step-gate.js` runs a build step's rule node before the step hands its output on, and emits `step.passed` or `step.blocked` on nexus-bus. The event carries the reasons and `causedBy`, which is the step before it.
- **Rules as nodes:** the rules are YAML nodes in `lib/step-gates/*.step_gate`, with a new schema `lib/node-schemas/schema.step_gate` and a new node type `step_gate`.
- **reply.accept:** a reply that only says it can't do the work, with no code, is blocked as a refusal.
- **code.write:** no empty file, and json/yaml must parse.
- **Where it runs:** in `lib/repo-inject.js` `fromReply` (the reply first, then each file), and in `lib/repo-agent.js` for a refusal that contains no code.
- **Job status:** a blocked plan or manage job now reads **blocked** with its reason, never "replied".
- **Test:** `tests/modules/test-step-gate.test.js` runs the live refusal through the real repo layer.

## The desktop login (N20), and who answers by default

- **Desktop login: nexus / nexus.** The settings are `desktop.user` and `desktop.password`.
  - `cos/testenv/provision.js --with desktop` sets them with chpasswd and adds the account to sudo.
  - Every desktop boot applies them again through the guest agent's `guest-set-user-password`, so older images get them too.
  - The viewer shows the login (click to copy the password).
  - An invalid login name is refused before any shell sees it.
- **`repos.default_provider` defaults to ollama.** Clearing it restores guardian's first agent.
- **Staging note:** with Ollama as the default, economy staging (0.39.281 EC5) stages an Ollama reply on the repo's staging branch instead of applying it. Promote it with the existing `code/promote`.

## Versions

- system **0.39.282**
- guardian **3.19.1** (PATCH)
- idearium **4.13.0** (MINOR: config keys)
- cortex **3.6.0** (MINOR: `/api/raid/status`)
- orchestrator **2.2.2** (PATCH)
- copilot **3.7.1** (PATCH)
- eravos spec caught up to **3.18.0**; copilot's spec caught up from 3.6.0

Spec drift: 0.

## Provenance: the commits, in build order

| commit | what |
|---|---|
| bd04bb2 | map the NEX node store, N0–N13, before building |
| 6b0ef02 · 07bf7a0 · 31cbb13 | suite triage 1–3: eleven, five and six files; confidence, `/sse`, `/api/raid/status`, cortex-write sandboxed |
| ecf26b5 | map N14–N20; the known-gaps register started |
| b2b8b5b · ae28752 | triage 4–5: response nodes sandboxed, registry version, a second hey nexus, `.docx` import, duplicate copilot id |
| 22c3516 | guardian crash-restart: `json()` undefined, async routes 404 first |
| 4b94188 | the default provider comes from the setting, not a hard-coded chatgpt |
| 4ba332a | code from split fences |
| ea04667 | the RAID officiator asks RAID |
| e608505 | `job.complete` carries the reply text; six stale tests |
| 4f4f9af | userscript adapter test: comment stripping, the shared anchor list |
| 11663f5 | re-exported capability nodes (guardian 3.19.0, copilot `context.session`) |
| 76ed6fb | system-nodes: tests never rewrite the real node exports |
| a1dd891 | intelligence `/event` declared; five tests |
| 67b6f6b | seven ledger paths follow `NEXUS_DATA_ROOT` |
| c8800be | module-builder full intersection; four tests |
| 8a6524f | the tablet resolves every address through autopilot |
| eb50cba | `LEDGER_STORE_ROOT` sandboxed |
| e65b313 | the known-gaps register complete; run-all reports gaps apart |
| 4b0ffe5 · 2d52e4d · f797e14 | the desktop login; the atlas |
| 1413ca0 | Ollama the default provider |
| 5b971b8 · eeb425a | map N21–N29; the handoff |
| b6189c2 · 847f2a2 · 02e5105 | N29: process groups, the queue tie, the last sandbox writers, the downloads queue |
| c08bbaa | N21 step gates |

## Open (see the map and the handoff)

- N22: shadow and negative-space reasoning.
- N23: Ollama-first build, then agent review.
- N24: YAML node types only.
- N25: the Manage surface.
- N26: a work surface and TV UI built from contracts.
- N27: history import from your 700 zips.
- N28:
  - idearium's event loop blocks during the 10-minute sync;
  - the RAID gate fails open on a check error.
- About 66 test files are not registered in run-all.
- The node store itself (N0–N18).
