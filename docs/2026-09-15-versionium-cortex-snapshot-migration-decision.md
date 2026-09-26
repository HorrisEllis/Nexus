# Decision Log — versionium/cortex snapshot migration — 2026-09-15

Real decisions made this pass, each checked against `docs/AXIOMS-v3.1.md`
before being made, not after (§8.4/§6.2 — read before building). Full
narrative account lives in `versionium/spec/versionium.spec`'s own
2026-09-15 history entries; this doc is the decision-by-decision index
§17.3 (every decision recorded, alternatives and rejections named) asks
for on top of that.

## D1 — file_delta's home: `versionium/`, not `cortex/`

**Decision:** confirmed per James's instruction, matching
`idearium-repository-overhaul-phasemap.spec`'s own recommendation.

**Axiom check:** §5.9 (every system is sovereign — file_delta records
belong to the system whose commits they diff, not to cortex, which is
being actively de-scoped from owning versionium's data at all per the
VS1 migration already in `versionium.spec`'s history). §0.2 (architecture
is permanent, implementations temporary — cortex's *former* role as
versionium's host is exactly the kind of implementation detail that
shouldn't leak into where a new, related schema lives going forward).

**Alternative rejected:** `cortex/`. Would have re-coupled a new type to
the system VS1 already sovereignty-separated versionium *from* — a step
backward, not forward.

## D2 — build a new migration script rather than extending migrate-legacy-data.js

**Decision:** `versionium/lib/migrate-idearium-snapshots.js`, separate
file, same pattern.

**Axiom check:** §5.7 (low coupling, high cohesion — one module, one
responsibility; V5 and V6 are different source tables with different
real row shapes, see that file's own header). §5.6 (structural
self-similarity — a reader who understands migrate-legacy-data.js can
read this file with zero new mental model, same idempotency-by-commitId
key, same try/catch-skip-if-unreachable shape).

**Alternative rejected:** adding an `idearium_snapshots` branch inside
`migrateLegacyData()`. Rejected — would have made one function respond
to two unrelated legacy tables with two different field shapes, the
exact kind of complexity §0.5 (complexity must earn its existence) puts
the burden of proof on.

## D3 — field mapping stated as a defensive guess, not asserted as fact

**Decision:** `migrate-idearium-snapshots.js` maps fields optionally
(`row.message ?? row.note ?? ...`) and preserves the full original row
under `_migratedFrom.raw`, with the uncertainty stated directly in the
file's header.

**Axiom check:** §0.1 (reality is authority — "I don't know" and "I need
more information" are valid engineering outcomes; inventing certainty
is not. No `idearium_snapshots` row shipped in this checkout to confirm
real field names against). §1.2 (nothing pretends to work — a malformed
row is counted and logged, not silently dropped). §0.3 (information must
never be lost — the raw row survives the migration even if the guessed
mapping is later found wrong).

## D4 — extract `Cortex.zip` into the working tree before migrating

**Decision:** extracted `Cortex.zip` → `cortex/`, matching git HEAD's
tree (confirmed via `git ls-tree -d HEAD -- cortex` before extracting,
not assumed).

**Axiom check:** §3.3 (map before build — the prior session's handoff
had already named this exact gap; checking it directly, not re-assuming
it was fine to skip, is what let migrate-idearium-snapshots.js's
`require('../../cortex/memory/jaa-db')` resolve to real code instead of
silently no-op'ing forever). §0.1 (reality is authority — the working
tree's actual state, not the handoff's two-week-old description of it,
is what was checked).

**Real cost surfaced by this decision, fixed in the same pass (D5):**
extracting cortex/ changed a `require()` in the existing test suite from
"fails, skip" to "succeeds" — exposing a latent test-isolation bug that
had never been triggered before. Named directly, not hidden, per §0.1
("reality is represented faithfully in both directions — failure is not
minimized").

## D5 — fix the test-isolation bug found by D4, in the same pass

**Decision:** moved `JAA_DATA_DIR` env-var isolation to the top of
`test-versionium-sovereign.js`, before any test (including the
pre-existing `VSOV-007`) can require `cortex/memory/jaa-db.js`.

**Axiom check:** §4.2 (fix bugs pre-emptively — a known vulnerability
left in a shipped system, here a test suite that writes to a real
production data path, is a decision to accept the consequences; not
acceptable once found). §1.2 (this failure was silent before the fix —
the test passed while writing real files to `data/cortex/memory/`; now
either it stays isolated or it fails loudly).

**Verification (§17.10 — verify before promote):** re-ran the full
suite after the fix; confirmed `data/cortex/memory/` was not created by
the run, and all 11 tests still pass. Not declared fixed on code reading
alone.

## D6 — leave `cortex/versionium/index.js` and `causality.js` untouched

**Decision:** checked directly (read both files, confirmed
`versionium/lib/engine.js` and `versionium/lib/causality.js` are the
real, live implementation), made no change.

**Axiom check:** §0.3 (nothing simply disappears — these two files are
already correctly kept as unexecuted historical reference per
`versionium.spec`'s own 2026-09-02 entry; re-confirming that's still true
is itself the required action, not a reason to also edit the files).
§3.3 (map before build extends to mapping before *not* building —
recorded as a checked decision, not a silent skip).

## D7 — schema status vocabulary: `OPEN`, not the drafts' `PROPOSED`

**Decision (applies to the MCO-A work that follows this migration):**
`schema.file_delta` and `schema.phase_node` will be registered with
`status: OPEN` (schema defined, no real writer yet), matching this
codebase's actual, established two-value vocabulary (`REAL` / `OPEN`,
confirmed by grepping every existing schema file — see e.g.
`versionium/schemas/schema.system`), not the draft files' own invented
`PROPOSED`, which appears nowhere else in the codebase.

**Axiom check:** §0.1 (reality is authority over the draft's own prior
choice of word). §1.1 (nothing exists until proven — `OPEN` says exactly
that: the shape is real and registered, the writer is not).
