# Decision Log — versionium snapshot ownership + per-system ledgers — 2026-09-19

Continues the numbering of `docs/2026-09-15-versionium-cortex-snapshot-migration-decision.md`
(D1–D7). Each decision checked against `docs/AXIOMS-v3.1.md` before being
made, not after (§8.4/§6.2). §17.3 asks for every decision recorded with
alternatives and rejections named; this is that index.

James, this session: *"cortex is not versionium, or the intelligence
system. there should not be any .nex files generating in cortex. also the
ledgers in cortex need to be per system."* and *"clean up the old cortex
versionium and snapshots folder."*

---

## D8 — the rewind engine is versionium; `cortex/snapshot` moves

**Decision:** the snapshot/rollback engine moved to
`versionium/lib/snapshot.js`. D3 in the 2026-09-19 cortex→intelligence
handoff had been left open pending a git-vs-versionium decision; James
made it.

**Axiom check:** §5.9 (every system owns its own state — a record belongs
to the system whose history it describes). §0.2 (architecture is
permanent, implementations temporary — cortex's *former* role as host is
exactly the implementation detail that shouldn't decide where this lives
going forward). Same reasoning D1 already applied to `file_delta`.

**Alternative rejected:** git, via `lib/project-container.js`. Not
rejected as wrong in general — §17.4 keeps git authoritative for
file/repo history — but this engine hash-chains *live jaaDB table state*,
which is not file history and which git has no way to express.

---

## D9 — the ROLE SPLIT: versionium owns the index, not the subject

**Decision:** `versionium/lib/snapshot.js` talks to two stores on
purpose. `_jaa()` is versionium's own sovereign store and holds
`backup_records` + `snapshot_prune_log`. `_subjectJaa()` is cortex's
shared jaaDB — the live tables a snapshot captures and a rollback
restores. Only the first moved.

**Axiom check:** §5.9 again, read precisely: owning the index is not
owning the thing indexed. §0.0 (truth is supreme) — a versionium that
snapshotted its own private store instead of real system state would
produce artifacts that *look* like snapshots and restore nothing, which
is worse than not having them.

**Not invented here:** this is the same exception `versionium/lib/store.js`
already documents for `event_log` ("§HONEST EXCEPTION — event_log is NOT
versionium's own data"), applied to the same class of problem, and stated
in the same place a reader will look for it (§5.6 structural
self-similarity).

**Alternative rejected:** moving both halves. Would have satisfied the
letter of "snapshots belong to versionium" while destroying the feature.

---

## D10 — `cortex/snapshot/index.js` becomes a re-export shim, not a deletion

**Decision:** the old path delegates — `module.exports =
require('../../versionium/lib/snapshot.js')`.

**Axiom check:** §0.3 (nothing simply disappears). Five real call sites
require that path. Checked directly rather than trusting the handoff,
which said three (§0.1 — reality is authority over the doc's description
of it): the two it missed are `cortex/boot.js` (registers the `cos` state
provider) and `guardian/server.js` (registers `guardian`), and **neither
guards its require**. Deleting in the same pass would have taken
guardian's boot down.

**Why a re-export and not a second implementation:** `_stateProviders` is
module-level state. Two copies would have silently split the registry in
half, and every system-state restore would fail for whichever half
registered through the other path. Verified: both paths return the
identical module object.

---

## D11 — the JAA ledger mirror goes per-system; `event_log` does not

**Decision:** `lib/component-ledger.js`'s write step 2 now routes each row
to the owning system's own store via new `lib/ledger-store.js`
(`<system>/data/ledger/`). All five read functions aggregate across those
stores. The `event_log` breadcrumb in step 3 still goes to cortex.

**Found first, not assumed (§3.3):** the *physical* half was already
per-system — `_partitionPath()` has partitioned by system since it was
built. Only the JAA mirror was centralised: 742 rows across 12 systems
in cortex's one table. That is the §5.9 violation VS1 already fixed for
versionium's commits.

**Axiom check:** §5.9 (sovereignty). §5.6 (`lib/ledger-store.js` is
modelled on `versionium/lib/store.js` — same JaaStore class, same adapter
shape; the one difference is caching per system id instead of a
singleton). §0.5 (complexity earns its existence — `bySystem()` now opens
one store instead of scanning a shared table and filtering, which is the
point of partitioning by owner).

**Why `event_log` stays:** it is genuinely shared cross-system causal
state, written by cortex, guardian and orchestrator from separate
processes. Moving a ledger row to its owner and moving the shared causal
log are different questions, and only the first was asked.

**Alternative rejected:** per-system *tables* inside cortex's store
(`component_ledger_copilot`, …). Would have satisfied "per system"
cosmetically while leaving every row in cortex — no sovereignty gained.

**Stated uncertainty (§0.1):** `eros` and `cg` are short names with no
matching directory at this root (`erosmancer` and `clear-glass` are).
They resolve to `data/ledger-store/<name>/` — a real, honest home —
rather than being force-mapped to a directory this file guessed at. An
alias table can be added from evidence later.

---

## D12 — `cortex/versionium/` and `cortex/data/snapshots/` DELETED, not archived

**Decision:** both removed from the working tree.

**Axiom check:** §0.3 does not forbid deletion — it requires that
information be *"either preserved or intentionally discarded with a
stated reason. Nothing simply disappears."* This is that stated reason.
The precedent is `docs/ARCHITECTURE.md`, retired and deleted rather than
archived at v0.39.76, recorded the same way.

**`cortex/versionium/`** (`index.js`, `causality.js`) — D6 kept these as
unexecuted historical reference. Re-verified this pass rather than
trusting D6's claim (§0.1): every remaining mention across the tree is a
*comment*, zero live `require()`. The real implementation is
`versionium/lib/engine.js` and `versionium/lib/causality.js`.
**Recoverable:** both files are git-tracked; `git show
b60ab30:cortex/versionium/index.js` restores them byte for byte.

**`cortex/data/snapshots/`** — its 17 `.nex` files were moved to
`versionium/data/snapshots/` (each verified parseable before the move),
then re-indexed. The now-empty directory is removed, and
`cortex/boot.js` no longer creates a snapshot directory at all — that
line was also making a root-level `data/snapshots` the engine never wrote
to, an empty directory whose only effect was to keep implying cortex owns
snapshots.

**§0.4 check (every change must increase optionality):** deleting an
unexecuted archive removes no future option — the code is in git, and the
live implementation it duplicates is untouched. What it removes is the
standing ambiguity about which of two versionium implementations is real,
which was costing a reader time on every encounter.

---

## Wiring (§1.1 — nothing exists until it's actually called)

Both migrations run automatically now; neither was reachable before.

- `versionium/server.js` — `migrateCortexSnapshots()`, added beside the
  existing V6 and V5 calls, same idempotent run-every-boot shape.
  Verified firing: re-indexed 17 relocated snapshots.
- `cortex/boot.js` — `migrateLedgerPerSystem()`, immediately after the
  data-dir block. Placed in cortex for two real reasons, not convenience:
  cortex OWNS the source table, and it is autopilot's phase-1 kernel, so
  this completes before any phase-2 system writes its first ledger row.
  Verified firing: 742 rows across 12 systems on first boot, silent on
  the second.

**`purgeSource` is deliberately not passed.** Five readers still query
cortex's table directly (`cli/sentinel.js`, `lib/introspect.js`,
`intelligence/index.js`, `cli/compact.js`, `cli/purge-pollution.js`).
Purging before they move would make them report "no rows" rather than
"moved" — §1.2, a failure must never look like a success. Cortex's copy
stays until those five are repointed.

---

## Honest findings surfaced by this work, not repaired silently

1. **The 17 `.nex` files were already orphaned before the move.** No
   `backup_records` rows exist anywhere in this checkout, and `load()`
   resolves `snapPath` through the index, not the filesystem — so none of
   them were reachable. They were recoverable only because a `.nex`
   carries its own `snapId`, state hash, prev hash and `createdAt`.

2. **14 of the 17 are empty captures** — `tables: {}` with state hash
   `44136fa355b3…`, the SHA-256 of `{}`. Real artifacts of the bug the
   engine's own header documents under §BUGFIX 2026-08-25. Indexed with
   `emptyCapture: true` and reported loudly at boot rather than dropped:
   a rollback to one restores nothing, and the operator should see that
   before trying it (§1.2). **Not deleted** — that is a retention
   decision, not a migration one.

3. **`orchestrator.js:3333` still routes `/api/cortex/snapshots/create`.**
   Naming only, but it carries the same wrong implication this pass
   removed everywhere else. Left for a deliberate rename, not renamed
   blind as unplanned scope (§16.1).

4. **A test-isolation bug of my own, caught and fixed.** The first draft
   of `tests/modules/test-versionium-snapshot-migration.js` left
   `VERSIONIUM_DATA_DIR` unset and wrote real rows into
   `data/versionium/`. The tests still *passed* — it was caught by reading
   the store's own "Store ready" boot line, not by a failure. Same class
   D5 already fixed for `test-versionium-sovereign.js`. Fixed with a
   per-run temp dir; the file's header now says so, so the next reader
   inherits the warning rather than the mistake.

## Verification (§17.10 — verify before promote)

- `tests/modules/test-versionium-snapshot-migration.js` — 8/8. These
  assert the role split in **both** directions: D3-004 that the index
  lands in versionium's store *and does not leak into cortex's*, D3-005
  and D3-007 that the captured and restored subject is still cortex's
  live tables. A move that got either half backwards would pass a naive
  smoke test.
- Ledger migration: 742 copied, distribution matching source exactly;
  re-run copies 0 and reports 742 already present. `bySystem('copilot')`
  → 364, `byComponent('copilot.stream')` → 327, both matching known
  counts. A live write routes per-system and leaks 0 rows into cortex.
- After deletion: `cortex/boot.js` → `:3748`, `versionium/server.js` →
  `:3754`, `guardian/server.js` → `:7820 12/12 pass`.
