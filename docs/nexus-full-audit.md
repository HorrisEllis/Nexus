# NEXUS — Full Mechanical Audit
*2026-07-21. Every folder, every file — 814 JS files, 224,276 lines. This is 100% MECHANICAL coverage (module-system, orphan status, dormant-init, duplicate-UUID, tier per file), plus deep-reads of the files the mechanical pass flags as high-signal. Honest distinction throughout: "scanned" (mechanical) vs "read" (comprehended). Nobody can comprehend 224k lines in a session; anyone claiming to is skimming. This covers every file mechanically and reads the ones that matter.*

## Scope (the truth about size)
- **814** JS files, **224,276** lines (excl. node_modules/.git)
- Largest: meta 26k, lib 20.8k, tests 19.8k, cos 18.6k, ui 16.4k, guardian 14.2k

## FINDING 1 — The ESM/CJS split is systemic (the biggest structural fact)
**636 CJS · 79 ESM · 99 neither.** The 79 ESM files are not scattered — they cluster in exactly the systems that "feel unwired":
- **`meta/` — 45 ESM** — the ENTIRE `meta/rfr2/` and `meta/causal-nexus/` trees. The causal reasoner, the relationship substrate.
- **`idearium` — 17 ESM** — most of the spec engine, repo watcher, cortex-listeners, db.
- **`siso` — 6 ESM** — Event/Gate/Stream/StreamLog core.

The CJS core (`require`/`module.exports`) **cannot import ESM (`export`/`import`) directly.** This is the architectural fault line behind the whole "intelligence layer feels disconnected" problem. It's not neglect — `meta/` and `idearium` are written in a module system the running system can't call, reachable only through shims (`lib/rfr2-bridge.js` is the one that exists). **This is bigger than the mind-map's "RFR2 interop" Tier-0 item — it's meta/ + idearium wholesale.** Highest-leverage fix in the system.

## FINDING 2 — Duplicate UUIDs = competing-truth (§10.3), enumerated
- **`meta/rfr2/` DUPLICATES `meta/causal-nexus/modules/`** — same UUIDs on delta/observer/query/identity/clip/context/enforcement/lazy/time/version-gate/adapter-sandbox. RESOLVED by reading consumers: **rfr2 is CANONICAL** (imported by cortex/boot, mastermind, hooks, lattice, agent-tools, rfr2-bridge — 8 consumers). **causal-nexus/modules is the near-dead ANCESTOR** (2 consumers: a loom scanner + nexus-healer). causal-nexus is a SUPERSET — it has 7 modules rfr2 dropped: causality, forge, kernel, ledger, persist, projection, sigma. Decision: adopt rfr2 as the causal engine; harvest those 7 modules from causal-nexus if needed, then retire causal-nexus. Do NOT leave both live.
- **`autonomous-loop.js`** — orchestrator/lib vs unintegrated/ (unintegrated expected).
- **`pulse.js`** — orchestrator/lib vs ui/ — a REAL split (backend pulse vs UI pulse), verify they're intentionally different.
- **`siso/core/index.js` vs `siso/index.js`** — same UUID, verify not a fork.
- ncp-client, compartment-engine — test-helper vs unintegrated (expected).

## FINDING 3 — Orphans, honestly categorized
- Raw "180 orphans" is misleading. **`tests/` shows 108 "orphans" — FALSE**: tests aren't imported, they're run. Excluded.
- Real dormant subsystems (unimported, non-entry, non-browser, ≥15L, with init()) cluster in: **meta (15), idearium (10), emerge (9), guardian (9), loom (8), warp (6), cos (7)**.
- Full dormant-with-detail list in nexus-orphan-inventory.md (the earlier focused pass); this audit confirms and extends it across all 814.

## Per-directory mechanical data (all 814 files)
```
[from /tmp/full-audit.js — files / lines / orphans / esm-count]
  meta        93f  26241L  orphan:15  esm:45   ← the ESM substrate + rfr2/causal-nexus dup
  lib         89f  20873L  orphan: 9  esm: 0   ← the CJS engine layer (loops, reflection, etc)
  tests      109f  19795L  orphan:108 esm: 1   ← "orphans" false (tests run, not imported)
  cos         85f  18626L  orphan: 7  esm: 0   ← COS host, largely unwired
  ui          61f  16423L  orphan: 0  esm: 0   ← browser (html-loaded)
  guardian    22f  14169L  orphan: 9  esm: 0   ← live core + dormant helpers
  clear-glass 42f  12088L  orphan: 6  esm: 0
  emerge      31f  10185L  orphan: 9  esm: 0   ← emerge subsystem largely dormant
  eravos      37f   9743L  orphan: 0  esm: 0
  unintegrated 29f  8973L  orphan: 9  esm:10   ← expected (staging)
  idearium    21f   8562L  orphan:10  esm:17   ← ESM island
  cortex      30f   7855L  orphan: 1  esm: 0   ← live (organs wired this session)
  orchestrator 19f  5193L  orphan: 1  esm: 0
  copilot     16f   5156L  orphan: 0  esm: 0
  cli         11f   5080L  orphan: 0  esm: 0
  loom        22f   3563L  orphan: 8  esm: 0   ← registry authority, helpers dormant
  warp        22f   2419L  orphan: 6  esm: 0
  cockpit      4f   2318L  orphan: 1  esm: 0   ← forge-ide, dormant (:7800 unserved)
  contracts    2f   1591L  orphan: 1  esm: 0   ← SYSTEM-CONTRACTS (201 entities, unwired)
  + root files: orchestrator.js 2948L, autopilot.js 711L, nexus-bus.js 204L (all live)
```

## How this refines the Mind Map (docs_out/nexus-mind-map.md)
- **Tier 0 P0.3 grows:** "RFR2 ESM/CJS interop" → "meta/ + idearium ESM/CJS interop, wholesale" + "decide rfr2-vs-causal-nexus first (rfr2 canonical, harvest causal-nexus's 7 extra modules, retire it)."
- Everything else in the map holds. The audit confirms the tier ordering: you cannot wire the intelligence substrate (Tier 1-2) until the ESM/CJS fault line (Tier 0) is resolved, because meta/ IS the substrate and it's on the far side of the split.

## Coverage honesty
- **Mechanically scanned: 814/814 files (100%).** Module system, import status, init presence, UUID, size — every file.
- **Deep-read this session (comprehended): ~40 files** — the organs, jaa-store, jaa-db, intelligence faculties, CFR, lattice, RFR2 query, envelope/router, capability-registry, gap-hunter, the loop-engine headers, SYSTEM-CONTRACTS, cortex-v2, reflection, and others named across the session's commits.
- **Not line-by-line read: the remaining ~774 files' full bodies.** Flagged honestly. The mechanical pass tells us WHICH of those warrant a deep read (the dormant-init subsystems, the ESM cluster); reading all 224k lines with comprehension is not a single-session act and I won't claim it.

## Caveat (same as every audit)
A require-graph scan can't see dynamic `require(var)`, bus-only participants, or HTTP-only services. A module absent from consumers may still run (e.g. service/nexus-diagnostic.js IS spawned as a process). Treat mechanical flags as strong signals to verify per-file, not verdicts.
