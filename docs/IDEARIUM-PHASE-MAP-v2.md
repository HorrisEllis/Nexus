# IDEARIUM — PHASE MAP v2.0

**Status:** update. Supersedes v1.0 (2026-07-09) for Parts 0–1; v1.0's Parts 2–3
pushback and phase ordering are kept below as historical record, not rewritten.
**Compiled:** 2026-09-13, from `.git` history, `idearium/spec/idearium.spec`,
`idearium/spec/idearium.node-taxonomy.md`, the `loom/` maps, `docs/AXIOMS-v3.1.md`,
and the dated phasemaps in `docs/` (2026-08-19 through 2026-09-13).
**Governing law:** unchanged spine — §3.1 bottom-up, §1.1/§1.2/§1.3, AX-010/011/012 —
plus AXIOMS v3.1's Group 0 (Truth & Reality) and the new §5.2/§17.10/§17.11 this
update traces through idearium specifically.

---

## PART 0 — What is actually true today (measured 2026-09-13)

| Fact | Reality |
|---|---|
| Version | `idearium/package.json` says **4.1.0**; `idearium/spec/idearium.spec`'s own `meta.version` still says **3.2.0**. That's a real, unfixed version drift of the kind §5.4 (2026-08-27, `bd43b30`) was built to catch elsewhere — flagged here, not fixed in this pass. |
| Module system | Real ESM (`"type": "module"`), confirmed by the 2026-09-12 node-taxonomy sovereignty pass actually `import()`-ing it — the one system in the whole tree that is. |
| Port / purpose | Unchanged: `:4800`, idea manager + project repository, phases `seed→expanding→tensioned→specced→building→complete`. |
| Route count | `command_index` in `idearium/spec/idearium.spec` still reports **DONE, 72 real endpoints**, verified 2026-09-03 against a fresh grep. |
| Schemas | **9 real, sovereign `schema.<type>` files** (capability, command, component, hook, idea, node, system, wire, + index.js) — own local copies, zero runtime reference to `lib/node-schemas.js`, per the 2026-09-12 sovereignty pass. |
| RAID participation | Idearium is now a **RAID contract source** (2026-08-29, `26ea177`) and, as of today, the **first real consumer of `decideForContract()`** (2026-09-13, `8e7dcd6`) — its chunk-dispatch's hardcoded `'ollama'` fallback now asks RAID for a fidelity-scored agent first. |
| Repo content | Real, physical files on disk at `/projects/<repoUuid>/` (2026-09-07, `516eb81`) — no longer a metadata wrapper. |
| Build queue | Starts and drains automatically on every boot (2026-09-07, `574e85f`); orphaned `BUILDING`-state chunks self-recover on restart (2026-09-11, `ebd0322`). |

The 2026-07-09 ground-truth table in v1.0 (WARP dispatch wiring, the two
competing cascades, the RAID cascade myth, the emerge-stub miscount) is **still
accurate** — nothing in the two months since has reopened those findings.

---

## PART 1 — Status of v1.0's phase list

| Phase | v1.0 status | Now |
|---|---|---|
| 0 — Ground truth | DONE 2026-07-09 | still holds |
| 1 — Template registry | DONE 2026-07-09 | holds; templates since expanded (2026-07-11: minimal-kernel, api-service, event-system, plugin-runtime, ai-agent-system merged in from a parallel branch — see Part 2.A) |
| 2 — Closed loop (idea→spec→chunk→artifact→repo) | DONE 2026-07-09, 18/18 | **still the spine** — every item below extends this loop rather than replacing it |
| 3 — Interaction contract | proposed | **DONE** — `idearium/interaction-contract.json` (409 lines) is real and is what the UI reads |
| 4 — WARP as idearium's spine | proposed | **DONE** — chunk-dispatch runs through `warp-build-dispatch.js`; extended 2026-09-11 with real per-chunk dependency tracking (`490cd06`) |
| 5 — AX-010 cleanup (hardcoded `127.0.0.1:9000`) | proposed | **DONE** — `idearium/index.js` now requires `lib/nexus-client.js` (`nx`) for cross-system calls (see §SNAPSHOTGATE MERGE comment in `index.js`) |
| 6 — Intelligence in the loop | proposed | partially: RAID fidelity-scoring is now in the loop (Part 2.F); `intuition`/`mastermind`/`adversarial` feedback into dispatch outcomes not confirmed done |
| 7 — Repo compartment compress/decompress | blocked on RFR2 kernel | **still blocked** — no evidence `meta/rfr2/kernel/` has landed since 2026-07-09; repo content is real files (Part 2.B) but no rewind/snapshot layer for it |
| 8 — UI reading the interaction contract | proposed | partial — automation condition/command steps + a Tasker-style step editor shipped 2026-09-11 (`b6c3a7b`); no evidence of the full brainstorm/roadmap/IDE UI described in v1.0 |
| 9 — Versionium | buildable, not blocked | **DONE and then some** — idearium is fully migrated onto cortex/versionium as canonical (2026-09-02, `3fc9946`), including a full-state restore path (2026-09-02, `a9f74fc`) |

---

## PART 2 — New work since v1.0 (2026-07-09 → 2026-09-13), by theme

### A. Template/RepoLayer merge (2026-07-11)
Two independent sessions forked from the same baseline and diverged completely.
Reconciled rather than picking a winner (`idearium/CHANGES-2026-07-11-MERGE.md`):
this session's multi-template composition (`templateIds[]`, `buildEngine`
selector, idea↔spec phase auto-advance) merged with the parallel branch's
3-dialect boundary engine (YAML/Markdown/line-statement DSL upload parsing),
content-addressable `RepoLayer` v2 (`computeRootHash`/`findByRootHash`, free
dedup, free forking), and the copilot adapter gate. Two real bugs found only
by live-testing the merge: `addChunk` returning a single chunk instead of the
fresh manifest, and `computeRootHash` hashing soft-deleted chunks.

### B. RepoLayer becomes real files (2026-09-06 → 2026-09-08)
- `02ee544` — spec-engine wasn't loading on a clean `npm install` at all (a
  `js-yaml` default-import bug) — the whole pipeline was silently inert on a
  fresh checkout.
- `ddb4587` — test pollution from hardcoded data-dir paths, no isolation.
- `5b1a128` / `516eb81` — specs now create a real repo *at creation time*, not
  later on promote, and that repo is real physical files on disk at
  `/projects/<repoUuid>/`, not a metadata wrapper over spec-engine chunks.
- `fdcff2a` — real per-repo file-tree checklist (`checklist()`/
  `checklistMarkdown()`).
- `490cd06` — real chunk dependency tracking, so "each chunk is one component
  and its dependencies" is an enforced relationship, not a description.

### C. Reliability fixes in the dispatch/build loop (2026-09-07 → 2026-09-11)
- `e757dd0` — idearium's lazy-loader getters retried a failed import on
  **every single call, forever** — a real, compounding resource drain, not a
  cosmetic bug.
- `574e85f` — the build queue now starts and drains automatically every boot
  (previously required something else to kick it).
- `ebd0322` — chunks orphaned in `BUILDING` state (process died mid-build)
  now recover on restart instead of sitting stuck.
- `5f56dd7` — the ESM direct-run guard was broken on Windows specifically.

### D. Idearium 3.3.0 and the merge that nearly erased it (2026-09-03 → 2026-09-04)
- `7ea8b49` — idearium 3.3.0: per-chunk agent routing, restart-surviving
  guardian sync, a real CLI, HUD/taskbar fix.
- `484f2e2` — chunk dispatch was silently sending every non-ollama/non-claude
  request to ChatGPT — a routing bug, not a config choice.
- `3b5f75e` / `69ff888` — idea/spec phase was stuck at "building" on the WARP
  chunk-dispatch path; fixed so `building` phase now spawns a real compartment.
- `c730bbd` then `2c7cb41` — a merge commit **silently reverted the entire
  idearium 3.3.0 session**. Caught and re-applied the next day — worth noting
  as the kind of loss §0.3 ("information must never be lost") exists to catch.

### E. Versionium migration (2026-08-28 → 2026-09-02)
Idearium's snapshot/restore story moved fully onto cortex/versionium as the
canonical implementation: `e4b5934` (fix idearium's own `parentId`/branch bug,
the spec's own required first step) → `7f0a0bd` (sigma-gated auto-commit,
verified end-to-end) → `3fc9946` (full migration, sovereign transport applied)
→ `a9f74fc`/`0198c55` (SnapshotGate-state continuation merged in, including a
real `getState()` and full-state restore — `idearium/cli/index.js` was the one
file missed on the first merge pass).

### F. RAID integration — idearium as contract source, then as a real consumer (2026-08-29, 2026-09-13)
- `9242a07` / `26ea177` — idearium migrated to real `createPulse` and became
  one of the first 3 real RAID contract sources (alongside self-heal and
  co-pilot).
- **Today (2026-09-13), three MCO commits wire this further:**
  - `8e7dcd6` (MCO2/RR1+RR2) — `cortex/core/raid/index.js` gained
    `decideForContract()`, an additive fidelity-scored agent picker (reuses
    `_fitness()`/`_agentAvailable()`, no second scoring formula; `claude` is
    still the unconditional reserve on empty survivors per LAW_III). Wired so
    idearium's chunk-dispatch's previously-hardcoded `'ollama'` fallback asks
    RAID first — `opts.preferAgent` still wins outright if the caller names
    one. RAID unreachable → same `'ollama'` default as before (§1.2: no new
    silent failure mode introduced). Explicitly **not** wired into guardian's
    `POST /command`, whose own code comment says provider selection there is
    deliberately caller-owned.
  - `95767a8` (MCO4) — STAGE's remaining dead pipeline values
    (`HANDSHAKE_VERIFIED` → `QC_PENDING`) wired to real transitions, each its
    own jaaDB write + ledger event. Real per-system `output/` dirs created,
    including `idearium/output/`.
  - `810790f` (MCO7+MCO8) — audited all 131 real proxy routes for RAID
    observability; found idearium's own `submitContract()` +
    `reportExternalOutcome()` pattern (proven safe, non-blocking) is the
    honest mechanism, and reused it to wire idearium's **legacy** `spec.build`
    route (the newer spec-engine chunk path already had this) plus one
    architect route. 2 of the ~40 real write-candidates, by design — the rest
    are excluded on stated grounds (sync handlers, caller-owned routing,
    internal bookkeeping) rather than silently skipped.
  - `docs/2026-09-13-track-b-sovereignty-phasemap.spec` separately notes
    `boundary.js`'s ownership REGISTRY going from 0→78 real entries under
    idearium's own name.

### G. Node-taxonomy sovereignty pass (2026-09-12)
Idearium is one of 8 systems given a fully local, non-referencing copy of
every schema type it uses (9 files — Part 0 table). Confirmed by actually
importing it: idearium is the one real-ESM system in the pass, so its
`schemas/index.js` uses real `import()` rather than the CommonJS pattern every
other system uses. A second real bug (`guardian/jaa-store.js`'s `insert()`
using a node's own `id` as its ledger-row key, silently overwriting repeated
entries) was found and fixed while testing the shared `lib/node-index.js` this
pass introduced — general infrastructure idearium's own ledger benefits from,
not idearium-specific.

### H. UI — automation steps (2026-09-11)
`b6c3a7b` adds condition/command automation steps and a Tasker-style step
editor. This is the first concrete UI work toward v1.0's Phase 8
(brainstorm/roadmap/IDE reading the interaction contract) — narrower in scope
than what Phase 8 originally described.

### I. Governance / drift enforcement (2026-08-23 → 2026-08-27)
`385d620` — `idearium/config.js` made real, centralized, genuinely ESM (with
a real path bug caught only by actually booting it, not by reading it).
`bd43b30` — 8 real spec/code version drifts fixed tree-wide and spec-drift
enforcement added to git (§5.4) — the same class of bug flagged, unfixed, in
Part 0's version-number table above.

---

## PART 3 — Reconciling the two "idearium spec" documents

Two documents claim to describe idearium's spec-level shape, and they
disagree badly:

- **`idearium/spec/idearium.spec`** (v3.2.0/pkg 4.1.0) — the real one. Matches
  the code: idea-store, project-repo, lattice, queue-listener; 72 real,
  verified routes; phases `seed→...→complete`.
- **`docs/specs/IDEARIUM.spec.md`** ("v9.0", last touched 2026-07-20, commit
  `16502d7`) — describes `.map`/`.spec`/`.nex` file formats, a `NEX0` binary
  header, a miniworld manager, a revision manager, LAW_VIII/LAW_IX/§A-1–§A-4
  axioms not present anywhere else in this doc set, and 25 server routes none
  of which match `idearium.spec`'s real 72. **None of this is corroborated by
  `.git`, the real spec, the node-taxonomy doc, or the loom scanners.** It
  reads as the exact failure pattern AXIOMS v3.1 §0.1 and v1.0's Part 1.3
  named repeatedly this session: real-sounding, unwired, and — per §1.3 — not
  a valid description of anything in production.

**Recommendation, not yet actioned:** mark `docs/specs/IDEARIUM.spec.md` as
superseded/aspirational in its own header, or delete it, rather than let a
future session treat it as ground truth. This phase map and
`idearium/spec/idearium.spec` are the two documents that currently agree with
what runs.

---

## PART 4 — Axioms actually governing idearium today (v3.1 mapping)

| Axiom | How it shows up in idearium right now |
|---|---|
| §0.1 Reality Is Authority | Every commit in Part 2 above was verified by running the system, not by reading it — the pattern v1.0 already established, continued unbroken across two months. |
| §0.3 Information Must Never Be Lost | The `c730bbd`→`2c7cb41` revert-then-recover (Part 2.D) is this axiom in practice, not in the abstract. |
| §1.2 Nothing Silently Fails | RAID-unreachable in `decideForContract()` falls back to the same `'ollama'` default as before — a named, not silent, degradation (Part 2.F). |
| §5.4 (version-drift enforcement) | Caught 8 drifts tree-wide 2026-08-27; **idearium's own spec/package version drift (3.2.0 vs 4.1.0) is currently un-caught** — a live gap, not a hypothetical one. |
| §17.10/§17.11 (build discipline, from WARP v1.4) | The WARP digest cache and per-chunk dependency tracking (Part 2.B) are the concrete instances. |

---

## PART 5 — What's still open

1. **Version drift**: `idearium/spec/idearium.spec`'s `meta.version` (3.2.0)
   vs `idearium/package.json` (4.1.0) — pick one, fix the other.
2. **`docs/specs/IDEARIUM.spec.md`** — resolve per Part 3 (mark superseded or
   delete); it is actively misleading in its current, un-flagged state.
3. **RFR2 kernel** (`meta/rfr2/kernel/`) — still absent as of this pass;
   Phase 7 (repo compartment compress/decompress) stays blocked on it, exactly
   as in v1.0.
4. **Phase 6 (intelligence in the loop)** — RAID fidelity-scoring is now live;
   feeding dispatch outcomes back into `intuition`/`mastermind`/`adversarial`
   is not yet confirmed anywhere in this pass.
5. **Phase 8 (full UI)** — automation steps shipped; the brainstorm/notes/
   roadmap/IDE panels v1.0 described are not yet evidenced.
