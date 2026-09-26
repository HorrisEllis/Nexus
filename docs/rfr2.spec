spec:
  meta:
    name:        rfr2
    version:     1.0.0
    status:      written-from-live-code
    uuid:        nexus-rfr2-v1-0000-2026-0724-jamesbrooks-001
    axioms:      [§0.1, §3.3, §5.4, §6.3, §8.5, §17.1]
    written_because: >
      Found unspecced 2026-07-24 while auditing the ESM→CJS conversion
      (Job 1, commit 9cff74a) against §8.5 ("do not build anything
      without creating a spec file first") — the conversion landed
      before this existed, a real process violation. Written after the
      fact as a map of what already exists, not a design proposal.
    purpose: >
      "RFR2 Causal Toolkit" — 13 modules for identity, timing, querying
      (CQL), delta/bottleneck analysis, invariant enforcement, and
      version gating over causal event graphs. Entry point:
      meta/rfr2/index.js, a lazy-getter CJS barrel.

  file: meta/rfr2/index.js
  submodule_dir: meta/rfr2/<name>/index.js
  all_modules_at: >
    9 of 14 (Job 1's conversions) at @version 5.0.0. The 5 harvested-and-
    converted (Job 2's kernel/sigma/adapter/causality + Job 2b's forge)
    carry @version 5.0.2 unchanged from their causal-nexus origin — real,
    newly-introduced version drift (§5.4), not silently normalized here.
    Not clear which is "right": 5.0.2 may reflect real fixes the rest of
    rfr2 never received (causal-nexus and rfr2 forked from a common
    ancestor per the 2026-07-21 audit), or it may just be an unrelated
    numbering scheme. Flagged for a real decision, not guessed at.

  job_1_converted_2026_07_24:
    status: DONE — commit 9cff74a
    modules: [identity, lazy, time, observer, adapter-sandbox, query, enforcement, version-gate, delta]
    what: >
      Mechanical ESM→CJS: `export function/const/class` → single
      `module.exports = {...}` per file; `import{}from` → `require()`.
      No logic changed. 61 exports total, all verified present after
      conversion by exact count match against a pre-computed expected
      list, not just "it loaded."
    why_it_mattered: >
      meta/rfr2/index.js already had a CJS lazy-getter barrel
      (`get delta() { return require('./delta/index.js'); }` etc.) but
      it was SILENTLY BROKEN for every submodule before this — Node's
      require() throws on `export` syntax. The only thing that could
      ever load these 9 modules was lib/rfr2-bridge.js's async dynamic
      import(). Confirmed the bridge still works unchanged against the
      now-CJS files (Node's import() can load CJS) — no existing
      consumer (cortex/boot.js, cortex/intelligence/mastermind.js,
      hooks/cortex.hooks.js, meta/lattice/associative-lattice.js,
      lib/consent.js, lib/agent-tools/tools/query-intelligence.js)
      broke.
    functional_proof: >
      Not just syntax-verified. parseQuery("FIND events WHERE type =
      'gap.found'") produced a correct AST and computeDeltaStream() ran
      its real 4-argument signature (events, findById, edgeMeta,
      getChildren) through the converted files via plain require(), for
      the first time.
    pinned_by: tests/modules/test-rfr2-cjs.js (14 tests, registered in run-all.js)

  job_2_done_2026_07_24:
    status: DONE — same-session follow-up to Job 1
    decision_source: >
      Already decided by James, 2026-07-21, docs_out/nexus-full-audit.md
      Finding 2 (§10.3 competing-truth resolution by consumer count: rfr2
      8, causal-nexus/modules 2 — rfr2 canonical). Confirmed again by
      James mid-session: "yes rfr2 replaced causal nexus. keep
      converting."
    harvested_from: meta/causal-nexus/modules/
    modules_harvested: [causality, sigma, adapter, kernel]
    scope_correction: >
      The 2026-07-21 audit's "7 modules rfr2 dropped" list (causality,
      forge, kernel, ledger, persist, projection, sigma) was directionally
      right but imprecise — verified by actually reading all three
      originally-blocked files' import statements (not assumed): the
      real set was THREE — kernel, sigma, adapter — and `adapter` isn't
      in the audit's list at all. Reading kernel/index.js in full (§3.3,
      not just grepping its import line) surfaced a FOURTH, genuinely
      transitive dependency the 3-module scope missed: `causality`
      (kernel imports createEdge/createCausalStore/createCalltoMap/
      EDGE_CAUSAL_* from it; adapter does too). Real harvest set: 4
      modules, not 3. causality and sigma are leaves (zero imports of
      their own); adapter depends only on causality; kernel depends on
      identity + time (both already in rfr2 from Job 1) + causality.
      The other 6 real causal-nexus modules (forge, ledger, persist,
      projection, loader, plus adapter-sandbox which rfr2 already had
      independently) remain unharvested — confirmed zero references to
      any of them anywhere in rfr2's now-13 modules. Real, separate
      capability; not silently swept into this harvest.
    conversion: >
      Same mechanical ESM→CJS as Job 1, with one real bug found and
      fixed in the converter itself: `import { X as Y } from '...'`
      (ESM rename syntax) was being translated to `const { X as Y } =
      require(...)`, which is INVALID CommonJS destructuring — `as`
      only works in ESM import statements; CJS rename syntax is
      `{ X: Y }`. Caught by actually requiring the converted clip and
      context modules and hitting a real SyntaxError, not assumed
      clean from a successful grep. Fixed in the converter (X as Y →
      X: Y) and in the 3 already-converted occurrences (clip×2,
      context×1). No other file in Job 1's 9 used `as` renaming, so
      this was a Job 2-only latent bug, not a retroactive Job 1 defect.
    then_converted: [clip, compress, context]
      # the original Job 2 target — unblocked once kernel/sigma/adapter/
      # causality existed in the rfr2 tree.
    functional_proof: >
      Not just syntax/export-count verified. A real createKernel()
      ingests real events and builds a real causal graph (traceToRoot
      returns the correct path). A real createAdapter() translates a
      real bus event ('page:navigated') through that kernel. A real
      classify() classifies a real synthetic kinematic window into a
      real regime. Most importantly — the actual point of Job 2 —
      compress.snapshot()/restore() round-trips a real kernel: a kernel
      with real causal edges, snapshotted, restored into a fresh
      kernel, matching event count AND edge count. clip.snapshotRange()
      extracts a real bounded causal subgraph with a real attached
      stability profile. context.createLiveContext() wraps a real
      kernel. All via plain require(), all for the first time.
    barrel_updated: >
      meta/rfr2/index.js's lazy-getter barrel gained 4 new getters
      (kernel, sigma, adapter, causality) alongside the 9 already there.
      All 15 getters (13 modules — adapterSandbox/versionGate use
      camelCase names) verified resolving to real objects.
    pinned_by: >
      tests/modules/test-rfr2-cjs.js, expanded from 14 to 28 tests —
      per-module load+export-count checks for all 13 modules, the
      barrel test extended to the 4 new getters, and 6 new functional
      tests (kernel, sigma, adapter, compress round-trip, clip, context)
      plus a final zero-remaining-ESM sweep across all 13.
    still_not_decided: >
      Retiring meta/causal-nexus itself (the tree the harvest came
      from) is a SEPARATE, bigger decision, not executed here — it
      still holds 6 real modules (causality's copy plus forge, ledger,
      persist, projection, loader) that rfr2 doesn't use, and 2 real
      external consumers (a loom scanner + nexus-healer, per the
      2026-07-21 audit) that would need migrating or verified-safe
      first. rfr2 no longer NEEDS causal-nexus for anything — that's
      confirmed — but "not needed" and "safe to delete" are different
      claims and only the first one is proven here.

  job_2b_done_2026_07_24:
    status: DONE — same-session follow-up to Job 2, prompted by James's "Continue"
    trigger: >
      Investigated whether meta/causal-nexus could actually be retired,
      since rfr2 no longer needs anything from it. Found the 2026-07-21
      audit's "2 consumers" (a loom scanner + nexus-healer) claim was
      itself imprecise — checked directly (§0.1), not trusted: the
      "loom scanner" reference (loom/scanners/closed-door.js) is a
      comment in that file's own caveat text mentioning the causality
      path as an EXAMPLE of a detection blind spot — not a real
      require() anywhere in loom/. Grepped loom/ for any real
      require(...causal-nexus...): zero matches. The true real-consumer
      count was 1, not 2: nexus-healer/api/index.js, via a single
      require('../../meta/causal-nexus/modules/forge/index.js') —
      wrapped in try/catch, and forge is one of the 6 modules Job 2
      deliberately did NOT harvest (out of scope at the time).
    harvested: [forge]
    forge_shape: >
      Leaf module (zero imports of its own) — AI-powered self-
      modification engine, 4 real async entry points (forgeModule,
      forgePatch, forgeGate, forgeHook) plus ForgePatchRecord. Genuinely
      real ESM (`export async function` — NOT the idearium-style
      mistyping bug found earlier this session; forge is correctly,
      intentionally ESM and was correctly loading via Node 22.12+'s
      require(esm) before this, just not as portable CJS).
    converter_bug_found_2: >
      convert.js's `export function` regex didn't match `export async
      function` — forge is the first module either Job touched that
      used async exports. Converting forge with the unfixed script
      silently dropped all 4 real exports (only the plain `const
      ForgePatchRecord` export survived), caught by the same discipline
      as the Job 2 `as`-rename bug: verify export count against a
      pre-computed expectation, don't trust "it ran without error."
      Fixed in convert.js (matches `export (async )?function`), forge
      reconverted clean, all 5 exports present, async-ness confirmed
      preserved (fn.constructor.name === 'AsyncFunction').
    migrated_consumer: >
      nexus-healer/api/index.js's require() updated from
      meta/causal-nexus/modules/forge/index.js to
      meta/rfr2/forge/index.js. Functionally identical (harvested
      verbatim, only the module system changed) — a path update, not a
      behavior change. Verified the new path resolves and exports the
      same real function shape.
    remaining_in_causal_nexus: >
      ledger, persist, projection, loader — confirmed via grep to have
      ZERO consumers anywhere in the 814-file codebase outside
      causal-nexus's own modules/index.js barrel and its own test
      files. Genuinely, confidently dead weight from the rest of the
      system's perspective — but NOT deleted here. Confirming "zero
      current references" is not the same claim as "safe to delete
      forever" (could be intentionally-dormant, planned-future-use
      capability) — that's still a real decision for James, not
      inferred from a grep.
    pinned_by: "tests/modules/test-rfr2-cjs.js, 28 -> 31 tests"

  barrel_index:
    file: meta/rfr2/index.js
    pattern: "lazy getters — get <name>() { return require('./<name>/index.js'); }"
    all_13_present: true
    all_13_working: >
      Job 2 closed the last gap — rfr2.clip/.compress/.context (and the
      4 harvested getters) now resolve to real, functional modules.
      Zero remaining ESM in rfr2; zero remaining broken getters.

  consumers_confirmed_live:
    - "cortex/boot.js"
    - "cortex/intelligence/mastermind.js"
    - "hooks/cortex.hooks.js"
    - "meta/lattice/associative-lattice.js"
    - "lib/consent.js"
    - "lib/agent-tools/tools/query-intelligence.js"
    - "lib/rfr2-bridge.js — the async ESM bridge; still functional post-Job-1, now largely redundant for the 9 converted modules but not removed (§16.5 flagged, not acted on — removing it or migrating its callers to plain require() is a separate decision, not bundled into this spec)"
    - "tests/modules/mastermind-fractals.test.js — exercises rfr2-bridge → delta, one functional test (fractal pattern detection), not adversarial coverage"

  known_test_gap: >
    No module in rfr2 — converted or not — has §12.1-grade "brutal"
    adversarial coverage (hostile/malformed input, null/undefined,
    unicode, concurrent access, corrupted files). test-rfr2-cjs.js
    verifies the CONVERSION (loads, exports resolve, one real CQL parse,
    one real delta computation) but is not a substitute for that.
    Flagged, not built here — real scope, not bundled into this pass.

---
## ADDENDUM 2026-07-30 — RFR2 wired into the intelligence system (James)
Before: intelligence touched only ONE of RFR2's 14 modules — mastermind → delta.detectFractals (recurring causal shapes). The causal CORE (causality/sigma) was unused by intelligence, and RFR2 wasn't in loom's connection graph. Now: cortex/intelligence/relational-field.js is the Relational Field Reader wired into intelligence. readFieldForFriction(frictionEvent) uses RFR2 causality.createCausalStore().traceToRoot to find the CONDITIONS that caused a friction/tension event (the causal path root→friction), and RFR2 sigma.classify to characterize the deviation from baseline. trackFrictionConditions() batches this over many events so the intelligence system sees WHICH conditions recur behind friction. §8.6 composes the existing rfr2-bridge + RFR2's own causality/sigma; §1.2 honest degrade (RFR2 unavailable → stated reason, never breaks intelligence). Registered as the 'relational-field' intelligence capability (/api/intelligence/relational-field). In loom's connection graph: relational-field → {rfr2-bridge, mastermind}, so the system SEES that RFR2 is wired into intelligence. This is the substrate the snapshot trigger needs — friction conditions traced by the intelligence system via RFR2, not a raw sigma threshold. Verified: friction at C traces to root A (A→B→C). Suite 1288/0.
