# NEXUS — Session Handoff

**Repo state:** `master` at `2b01f72`. Working tree clean. `data/` gitignored (no stray test artifacts).

**Purpose of this document:** this session ran very long and covered a lot of ground — this is a real, honest inventory of what's built, what's verified, what's genuinely still open, and one important, unresolved finding that needs attention before the next big piece of work (rebuilding the userscripts) begins.

---

## 1. What shipped this session, in order

| Commit | What |
|---|---|
| `171b428` to `3fc9946` | Versionium migration to canonical location, sovereign transport applied |
| `a9f74fc` | SnapshotGate merge — real getState(), idearium full-state restore |
| `65476c9`, `c258cf7` | Real bug fixes: clear-glass /status probe timeout, NCP tool-call header conflict |
| `972de75` | VS1 — Versionium promoted to a fully sovereign system (own folder, port 3754, own data store, own event taxonomy, live-verified via curl against a running instance) |
| `e549975` | Clear-glass patch batch applied (focus-ring fix, history write path, etc.) plus cortex/snapshot half-life pruning (tombstone-based, chain-integrity-aware) |
| `6c07bc9` | SPEC-REGISTRY.md converted to a real .spec (mechanical extraction plus full original text preserved as a safety net) |
| `cea0e76` | ACK-injection fix — replaced the force-fed context blob in all 4 provider userscripts with real, hat-based personas |
| `6ae0e8f` | AM1 — real per-agent intent contracts (hats gained allowedIntents), artifact storage wired through clear-glass's download-capture into guardian's intake pipeline |
| `27a15e6` | AM1's gate made mandatory, not opt-in — processNext() now auto-acknowledges every contract before dispatch |
| `7f8907f` | DeepSeek added as a real agent; the loom-map "41 systems" bug fixed (was really ~13, folder names like tests/lib were being counted as systems); clear-glass moved to heartbeat-first health checking |
| `90b5cd2` to `e27acef` | The officiator — cortex/core/raid/officiator.js, real agent-synthesized contracts from staged artifacts, persisted dedup |
| `61fb6b8` | intuition, mastermind, synthesize_contract added as real agent tools |
| `893ae85` | Vector-memory pipeline fix — the embedding hook (onJaaInsert) had been dead code since it was built; wired into cortex's real jaaDB writes; found and fixed a real $in/$eq filter bug in the fallback index along the way |
| `2b01f72` | Reconciled a parallel session's work — merged contract-boundary.js, an improved officiator.js design (submit:true/false), a synthesize tool. Caught and restored a real regression: the parallel session's own merge had silently dropped the AM1 gate-enforcement fix from processNext(). |

Full detail for any of these is in each commit's own message — they're written to stand alone.

## 2. What's real and working right now

- Agent mesh: hats (the_builder, the_diagnostician, the_auditor, the_librarian, the_officiator), real intent verbs, RAID's intent-contract gate actually enforced at every dispatch.
- RAID contract pipeline: submitContract() then boundary resolution (contract-boundary.js) then acknowledge() (AM1 gate) then raid-worker.js's 15s auto-drain then real dispatch via guardian to a real agent tab.
- The officiator: polls lib/intake.js's staged-artifact directory, synthesizes a real B1-schema contract from context using the_officiator hat, submits it. Also callable directly as a tool (synthesize) with submit:true/false.
- Versionium: fully sovereign (port 3754), real commit/restore/calendar/state API, live-verified.
- Vector memory: real semantic search (Ollama embeddings plus TF-IDF fallback), now actually receiving writes from cortex's real tables plus all 14 systems' component registries.
- Faculty tools: analyze, intuition, mastermind, synthesize, module_builder, run_adversarial, axiom_check — all real, all registered, available to both copilot's and guardian's agentic loops.

## 3. The one real, unresolved finding — read this before touching userscripts

James pointed to guardian/nexus-hey-claude.user.js (142KB, real Tampermonkey @match https://claude.ai/* headers, last touched Aug 27) as "the userscript" for the rebuild task (remove SEAM tab, rebuild NEXUS tab, wake-word to co-pilot input pipeline, tool listeners).

Checked directly before starting anything: this file is genuinely different from guardian/userscript-claude.js (the one this session edited repeatedly, including the ACK-injection fix) — same original header block, same version number (10.2.0), but roughly 1,094 lines of real divergence between them. This is not a duplicate; it's a real, unreconciled fork, and it's not obvious from the outside which one is the actual, current, "live" artifact.

Both files currently have a real TAB_LIST including 'seam' — confirmed directly:

```js
const TAB_LIST = [
  ['log','Log'], ['ledger','Ledger'], ['gaps','Gaps'], ['arts','Arts'],
  ['seam','SEAM'], ['intel','Intel'], ['nexus','NEXUS'], ['sys','Sys'], ['opts','Opts'],
];
```

A real 'nexus' tab already exists too — the ask is to rework it, not build one from scratch.

Only Claude has a separate .user.js file — gemini/chatgpt/perplexity only have their single userscript-*.js each, no second copy. So this divergence problem is isolated to Claude, but it needs resolving before the rebuild starts, or the rebuild risks being applied to the wrong file, or losing real work in whichever file gets set aside.

Recommended first step for the next session: diff guardian/userscript-claude.js against guardian/nexus-hey-claude.user.js properly (like the RAID/officiator parallel-session reconciliation earlier this session), figure out which real capabilities live only in one or the other, and decide — with James, not silently — which one is canonical going forward, or whether they need to be merged the same way the RAID work was.

## 4. Real, still-open work from this session's own phasemaps

- docs/2026-09-02-nexus-vision-master-phasemap.spec and docs/2026-09-02-agent-mesh-full-map-phasemap.spec — the two live phasemaps. Every phase in them is status: OPEN or PROPOSED unless it references a commit hash.
- The userscript rebuild itself (this session's last live ask): remove SEAM tab, rebuild NEXUS tab to be "more implicit" and actually wired to the intelligence system, behavioral drift engine, ledger, hats, intent, clear-glass accounts, add a tool-listener surface, and make the wake word inject into an actual co-pilot input/CLI path rather than just showing an overlay.
- Co-pilot's step-by-step contract-building walkthrough ("hey nexus create a build contract" then guided, step-by-step) — not started.
- AM4 / G1 (flagged, not resolved): the 4 provider userscripts (userscript-{chatgpt,claude,gemini,perplexity}.js) have confirmed, real, byte-for-byte-identical duplication in handleJob and related functions across 3 of the 4 — a real refactor target, now compounded by the .user.js divergence above.
- AX-014 draft ("Map Before You Touch") is sitting as text only in the vision phasemap — never applied to AXIOMS-v3.1.md. Needs a real yes/no from James.

## 5. Known, accepted, honestly-documented limitations (not bugs to fix blindly)

- officiator.js's in-process _seen Set is a fast-path only; the real dedup is lib/intake.js's persisted markOfficiated() marker — this is intentional, tested (OFF-006), not a gap.
- orchestrator/lib/versionium-auto-commit.js and versionium/lib/engine.js's own internal trigger both independently fire on different real signals (composite sigma vs. cortex field entropy) — a deliberate, documented coexistence, not consolidated.
- guardian/server.js's own second, separate chat_log writer (its own local JaaStore instance) is not covered by vector-memory's embedding pipeline — flagged, not fixed.
- lib/vector-memory.js's INDEX_DIR is hardcoded, not env-overridable like JAA_DATA_DIR elsewhere — noted in its own test file's header.

## 6. Test coverage added this session (all passing as of 2b01f72)

test-snapshot-half-life-prune.js (7), test-versionium-sovereign.js (8), test-ack-injection-fix.js (23), test-am1-intent-contract.js (11), test-raid-processnext-am1-gate.js (4), test-raid-officiator.js (11), test-vector-memory-pipeline.js (7), test-faculty-tools.js (8, extended), test-hat-forge.js (30, extended), test-loom-map.js (19, extended), plus real fixes to tests/diagnostic-fixes.test.js (+4) and test-intake.js (unchanged, still 18/18). All registered in tests/modules/run-all.js.

node scripts/precommit-check.js is clean as of 2b01f72 — 54 specs synced, only the same 3 pre-existing, unrelated warnings (divergence-watcher, macro-compiler, gap-loop have no .spec files — long-standing, not from this session).
