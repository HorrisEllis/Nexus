spec:
  meta:
    name:        2026-09-11-compartment-nodetype-and-reorg-phasemap
    version:     1.0.0
    foundation:  nexus-system-foundation@1.1.0
    status:      mapped-not-built
    uuid:        nexus-phasemap-v1-0000-2026-0911-jamesbrooks-001
    supersedes_open_items_in: 2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec
    purpose: >
      Locks the compartment/nodetype architecture decided this session and
      phases the folder-level reorg (snapshots, self-heal, intelligence,
      recall, cli, root cleanup, hooks, architect, SISO->WARP). Per §8.5
      discipline: map first, phase, no monoliths. Nothing here is built
      except done_this_session below.

  done_this_session:
    zero_risk_deletes: >
      Confirmed zero live requirers before touching anything (grepped
      tree-wide, not assumed):
        - bridge/ removed — 0 files, only an empty bridge/input/ dir.
          Real bridge system already lives in
          _archive/bridge-retired-2026-09-06/.
        - tools/ removed — 1 file (record-session-2026-08-17.js), 0 real
          requirers tree-wide (the one "tools/" grep hit was
          clear-glass/src/copilot/bridge.js requiring its own local
          ./tools, unrelated).
        - cos/playgrounds/ archived to
          _archive/cos-playgrounds-orphaned-2026-09-11/ — real code
          (Phase 30, spec §67), 0 requirers found tree-wide. cos/playground/
          (singular) is the live one — 8 real requirers confirmed
          (cortex/boot.js, guardian/server.js, lib/safe-apply.js,
          lib/execution-pipeline.js, lib/chains.js,
          lib/agent-tools/tools/sandbox/cos-simulate.js, +2 loom maps).
          node --check cos/playground/index.js clean after the move.
    flagged_not_deleted: >
      cli/nexus-cli.js's own header says "RETIRED (consolidated into
      copilot/cli.js)" — checked before trusting that claim, and it's
      contradicted by real code: 6 live requirers found
      (lib/component-registry.js, lib/grammar-engine.js, lib/version.js,
      copilot/cli.js itself, cli/nexus-repl.js, cli/nexus-repl-descriptors.js)
      plus 3 tests. Either the header is stale or copilot/cli.js's
      "consolidation" never actually dropped the old requires. Not deleted
      — needs a real trace of what copilot/cli.js actually still calls on
      it before this is touched. Logged as a gap, not resolved here.

  # ── The locked architecture (reference for every phase below) ─────────────
  locked_model:
    compartment_tiers:
      system:    "real COS compartment — process-level isolation, own port"
      module:    "logical compartment — own dir, own living .spec, own event contract, no spawned process"
      component: "logical compartment — same shape as module, narrower scope"
      rule: >
        PROCESS BOUNDARY (physical, COS) is never the same word-meaning as
        LOGICAL COMPARTMENT (semantic ownership/contract/lifecycle). Do not
        nest OS processes for modules/components.
    living_model: >
      system.spec -> module.spec -> component.spec, same structural grammar
      (history/gaps/version_history per AX-013), different scope. One
      recursive architecture, not three.
    nodetype_enum: [capability, command, tool, ledger, gate, route]
    id_grammar: "<system>.<semantic>.<nodetype>  — nodetype always last"
    ledger_type_convention: >
      Decoupled from a special "ledger.type" field. A ledger node's type
      value fills the <semantic> slot in the standard grammar, nodetype
      "ledger" stays last: e.g. cortex.primary.ledger, cortex.runtime.ledger,
      diagnostic.audit.ledger — not "ledger.primary" or a separate type field.
    ledger_type_registry: >
      type ∈ LedgerTypeRegistry(system) ⊇ {primary, runtime}. Core two are
      universal; a system may declare additional types (audit, telemetry,
      reconciliation) in its own spec/schema — never invented at runtime.
    capability_invariant: >
      ∀ capability node C, ∃ ≥1 command node K such that K routes/provides C.
      |routes(C)| ≥ 1. A capability with 0 routed commands is structurally
      unresolved — an auditable gap, not "probably incomplete."
    indexes: >
      Every system owns tool-index.js and command-index.js — aggregate
      registries of that system's .tool and .command nodes, same aggregation
      pattern hooks/index.js already used (ownership of that pattern moves
      to Loom, see AR1 below).

  phases:

    # ── TRACK T — Template + taxonomy (build order root) ──────────────────

    T1_extend_system_scaffold:
      status: DONE — 2026-09-11
      depends_on: []
      done: >
        loom/templates/system-scaffold.js extended from 5 to 9 base
        projections (+ optional 10th/11th): config.js (versionium/ollama/
        intelligence's real pattern), event-taxonomy.js (ET1 shape per
        lib/event-taxonomy-pattern.js, one stub event per operation),
        command-index.js (one entry per operation, same aggregation role
        hooks/index.js played), tool-index.js (seeded empty — operations
        produce commands/routes, not tools), and a real .spec at
        spec/<name>.spec (nexus-system-foundation shape: meta/core/events/
        routes/handshake/compartment/history/gaps/tests) replacing the old
        .spec.md. Two new optional inputs: `capabilities` ({capName:
        [opId,...]}) — validated BEFORE any file is written, throws if a
        capability routes to 0 operations or an unknown one, generates
        capabilities.js only when used (the capability_invariant enforced
        at scaffold time, not just auditable after the fact); `modules`
        ([{name, components:[{name}]}]) — generates the module/component
        logical-compartment skeleton per the locked model (own dir, own
        living .spec, own event-contract.json, kind: logical — never a
        spawned process, distinct from the system's own real COS
        compartment tier). data/<system>/{failures,invariant} now created
        alongside outDir automatically, decoupled from the pre-existing
        `dataDir` param (which is LoomDriver's own registry storage —
        conflating the two was caught and fixed before commit, would have
        put a system's data folders inside Loom's internal registry dir
        whenever dataDir was passed).
      verified: >
        End-to-end test run (demo-sys, throwaway outDir): all 14 files
        generated (9 base + capabilities.js + 4 module/component files),
        every generated .js syntax-clean, capability invariant confirmed
        to throw on a 0-route capability before writing anything.
        loom/test/system-scaffold.test.js updated (was asserting exactly
        5 projections and a .spec.md file, both now stale by design) and
        passes 12/12. Full loom/test/*.test.js suite run: 3 pre-existing
        failures (doc-generator timeout, friction-proxy fetch failed,
        schema.test.js StreamLog .endsWith) confirmed via git stash to
        predate this session's changes entirely and don't reference
        system-scaffold — not touched, out of scope.

    T2_idearium_genesis_alignment:
      status: OPEN — needs T3 resolved first
      depends_on: [T3_warp_replaces_siso]
      does: >
        idearium/spec-engine/templates/genesis.spec declares "spine WARP"
        already. Once T3 confirms WARP has full parity, genesis.spec becomes
        the architectural source T1's scaffold reads from (spine primitives,
        binding table) instead of being schema-agnostic. Real work: wire
        loom's scaffold to genesis.spec's binding table, not two unrelated
        template systems drifting apart.

    T3_warp_replaces_siso:
      status: IN PROGRESS — corrected scope after real verification, one
        real regression found and reverted, root-level dead code cleared
      depends_on: []
      done_this_session:
        - >
          Original scope was wrong — verified, not assumed. warp/core has
          NO real require() of cos/siso anywhere (the earlier "found a
          contradiction" claim was me misreading header COMMENTS that
          narrate warp's origin — "forked from cos/siso/Stream.js" — as
          live code deps. warp/core/index.js only requires its own
          Event/Gate/Axiom/Stream/StreamLog/GateFusion. WARP's
          zero-dependency claim is TRUE.
        - >
          cos already did its own real switch on 2026-07-11
          (cos/siso/index.js's own header: "§SWITCHED TO WARP... Ported
          [cos's] extensions into warp/core/Stream.js and
          warp/core/StreamLog.js additively... then pointed this file at
          warp instead of cos's own copies"). cos/siso/index.js now
          requires Event/Stream/StreamLog from warp/core/*.js directly.
          Gate.js is a deliberate, documented exception — cos's 30+ real
          gates subclass a different constructor pattern than warp's Gate,
          rewriting them is separate, larger, unattempted work.
        - >
          clear-glass/siso/ and emerge/siso/ are each fully separate,
          self-contained local forks (own Event/Gate/Stream/StreamLog,
          emerge's adds a Bus wrapper) — not touching root siso/, cos/siso/,
          or warp/core at all. Every "requirer of siso" I originally listed
          for clear-glass and emerge resolves LOCALLY on correct path
          resolution (../siso from clear-glass/seam/ = clear-glass/siso/,
          not root) — corrected, these are not part of this phase's blast
          radius.
        - >
          Real, confirmed, unfixed bug found IN cos: 11 files bypass
          cos/siso/index.js's barrel and require the STALE local
          cos/siso/{Event,Stream,StreamLog}.js directly —
          cos/cli/commands/create.js, cos/host/gates/{blueprint,plugin,
          compartment,vault,process,playgrounds,archetype}.js (Event),
          cos/compartment/process-runner.js (Event),
          cos/host/event-bus.js (Stream+StreamLog+Event),
          cos/host/index.js (Event). Those stale files' own header
          comments claim "Nothing in the tree requires this file anymore
          (checked)" — FALSE, same failure pattern as cli/nexus-cli.js's
          incorrect RETIRED claim from last session. Real consequence:
          events built via the 11 files lack warp's uuid/ts/frozen-data
          shape that events built via the barrel have — a live internal
          inconsistency, not cosmetic.
        - >
          ATTEMPTED the fix (repoint all 11 to cos/siso/index.js) —
          REVERTED. cos/test/test.js baseline is 153/157 passing (4
          pre-existing failures, all Stream/StreamLog seq/timestamp shape
          mismatches from the original 07-11 switch, unrelated to this
          fix). After the 11-file repoint: 8 NEW failures appeared, all in
          spawnProcess/host-boot tests — root cause traced to
          cos/host/event-bus.js's bus wrapper depending on the OLD local
          Stream's specific stamped-event shape ({seq, type, payload,
          timestamp} — note "payload", COS's own field name) that
          warp/core/Stream.js's internal stamped/ring-buffer/SSE shape
          doesn't produce the same way. This is not a mechanical
          import swap — event-bus.js needs real adapter work to bridge
          COS's .payload convention onto warp's shape before the barrel
          repoint is safe. Reverted cleanly, verified back to 153/157,
          working tree clean.
        - >
          Archived (confirmed 0 requirers, checked before moving, not
          assumed): root-level siso/ folder (the ESM one,
          "type":"module", zero real requirers found anywhere in the tree)
          to _archive/root-siso-orphaned-2026-09-11/; cos/manager.js
          (0 requirers, never spawned, references a BusKernel class that
          does not exist anywhere in the codebase — dead code with a
          latent broken reference) to _archive/cos-manager-dead-2026-09-11/.
          cos/test/test.js reruns clean at 153/157 after both archives —
          confirmed neither was load-bearing.
      remaining_open_work: >
        cos/test/test.js: 156/157 now (was 153/157 baseline, then briefly
        145/157 mid-fix before the two follow-up corrections below). One
        real design call left, not fixed here: "Stream: stamped event has
        seq + timestamp" asserts s.emit(...) RETURNS the stamped object
        directly — warp/core/Stream.js's own _emitProduced comment says
        returning nothing "is exactly like the original void contract",
        a deliberate choice (stamped events are retrieved via tail()/
        since() instead, which event-bus.js's own emit() adapter now does).
        Changing Stream.emit()'s return contract to satisfy this one test
        would affect every warp consumer, not just cos — real design
        decision, not guessed. Options: (a) update this one test to read
        stream.tail(1)[0] instead of the return value, matching
        event-bus.js's already-fixed pattern, or (b) change warp/core's
        contract. (a) is the low-risk default unless there's a real reason
        emit()'s return value specifically (not tail()) needs to carry it.
      fixed_this_session: >
        Root cause found and fixed at the source, not patched around:
        warp/core/StreamLog.js's record() silently stopped renaming
        Stream.emit()'s eventType/eventData/gateClaimed params to the
        type/data/claimed fields its own doc comment ("Same shape as
        SISO's log") promises, when it was ported from cos's version 7
        weeks ago — cos's original record() did this rename explicitly;
        warp's spread-everything-verbatim rewrite dropped it silently,
        and nothing caught it because nothing exercised this path for
        real until cos/host/event-bus.js got repointed to the barrel
        today. Restored the rename (with the same lvl-gating old code
        had — data only at DATA level, streamId/parentStreamId only at
        DEEP+) and added StreamLog.seq as a public getter (Stream.js
        already had this exact pattern for its own _seq; StreamLog's
        was private with no accessor — a real small gap, not a design
        change). Added cos/host/event-bus.js's own adapter for the two
        places warp's Stream genuinely changed contract on purpose
        (emit() returns void/Promise now, not stamped; on(type,fn)
        handlers get the raw Event, not a stamped wrapper) — onAny(fn)
        needed no adapter, warp already hands wildcards the stamped
        shape natively. Verified at every step: warp's own 43 tests
        (core/digest-regression/v1.1.0/v1.4-additions — the 5th test
        file, dispatch.test.js, fails on an unrelated pre-existing
        ENOENT for a siso_ref/ path that isn't part of this checkout,
        not touched) stayed 43/43 passed through all three edits. The 11
        real files that were bypassing cos/siso/index.js's barrel
        (create.js, 7 gates, process-runner.js, event-bus.js, host/
        index.js) are now correctly repointed and tested green.

    T4_cos_role_confirmed:
      status: OPEN
      depends_on: [T1_extend_system_scaffold]
      does: >
        cos/ stays a separate real product (Compartment OS — process
        isolation, archetype/blueprint scaffold for compartments), not
        merged into loom's system-scaffold. loom's scaffold calls cos's
        create/archetype path for the system-tier real COS compartment
        instead of hand-spawning; module/component tiers never touch cos.

    # ── TRACK V — Versionium / snapshots ───────────────────────────────────

    V1_repoint_old_versionium_refs:
      status: DONE — mapped, found nothing to fix, original claim was wrong
      depends_on: []
      corrected: >
        The "6 confirmed live requirers" in this phase's original entry was
        wrong — those were grep hits on the STRING "cortex/versionium" that
        matched historical comments, not real require() calls (same class
        of mistake T3 caught itself making once already). Checked precisely
        this time: grep for require(.*cortex/versionium across the whole
        tree returns exactly ONE real hit —
        tests/modules/test-versionium-migration.js. And that one is
        deliberate, not a bug: test-versionium-sovereign.js's own header
        says outright — "test-versionium-migration.js still tests
        cortex/versionium/index.js, which is now real, unexecuted archive
        code (nothing in production requires it anymore)... Kept passing,
        not deleted, since it's still real, accurate coverage of real code
        that still exists on disk." cortex/versionium/{index,causality}.js
        are exports-compatible with versionium/lib/engine.js (identical
        `module.exports = { init, stop, setDeps, commit, restore,
        calendar, getState }` signature on both) — confirmed the "logic
        moved wholesale" claim in versionium.spec's history is literally
        true, not just asserted. Nothing to repoint, nothing to archive
        that isn't already correctly archived-in-place. Closed.

    V2_snapshot_ownership_decision:
      status: OPEN — real design call
      depends_on: []
      does: >
        cortex/snapshot/index.js (file-backed .nex rollback/chain-integrity)
        is a different contract than Versionium's commit/restore. Decide:
        folds into Versionium, or stays cortex-local rollback with Versionium
        only owning cross-system causal snapshots. Not guessed here.

    # ── TRACK D — Diagnostic / self-heal ────────────────────────────────────

    D1_diagnostic_real_folder:
      status: OPEN — real scope found, much larger than estimated, not executed
      depends_on: [T1_extend_system_scaffold]
      real_scope_found: >
        service/nexus-diagnostic.js is 2,667 lines with 44 real files
        referencing it — cortex/self-heal/*, cortex/core/raid/index.js,
        cortex/gap-finder/index.js, orchestrator.js, guardian/lib/
        gap-hunter.js, loom/{server,scanners,maps}, 10+ test files,
        lib/{system-check,diagnostic-contract,diagnostic-causal,
        gap-relay,file-integrity,system-registry,version}.js,
        architect/service.js, nexus/autopilot.js, and MANIFEST.json.
        Same class of work as N2 (repoint every reference, verify each
        affected test against a true git-stash baseline, catch any
        __dirname-relative-to-new-location bugs) but ~4x N2's size. Not
        started — a partial move here with no verification budget left
        would be worse than leaving it alone. docs/diagnostic.spec's own
        flagged gap (no registry-components.js, no
        registerWithOrchestrator()) still stands, unaddressed.

    D2_self_heal_migration:
      status: RESOLVED — real evidence, no file moved
      depends_on: [D1_diagnostic_real_folder]
      resolved: >
        Checked diagnostic's own existing /self-heal route before deciding
        anything: it reports on open loops/pending patches/human-required
        gaps — read-only aggregation, it does not own fault-detection
        logic. cortex/self-heal/{index,escalation,fault-taxonomy}.js is
        called SYNCHRONOUSLY inside cortex/core/raid/{officiator,worker,
        contract-intake,contract-boundary}.js — real-time retry/escalation
        decisions inside RAID's own decision path. Moving that logic out
        to a separate diagnostic process would turn every one of those
        calls into a cross-process HTTP round-trip inside RAID's hot
        path — a real latency/coupling regression, not a clean
        architectural win, regardless of the original "self-heal moves to
        diagnostic" framing. Decision: cortex/self-heal/* stays in
        cortex, owned by RAID. Diagnostic keeps its existing read-only
        reporting role over it — already correct, nothing to migrate.
        This closes the open design question from the original phasemap
        entry without moving a single file.

    # ── TRACK I — Intelligence ───────────────────────────────────────────────

    I1_boot_js_intelligence_routes:
      status: CORRECTED — original premise wrong, verified before acting
      depends_on: []
      corrected: >
        Checked function signatures before converting anything (per this
        session's own established discipline). cortex/boot.js's
        _adversarialCompare(prompt, contextSnippet) calls
        adversarial.compareCortexFaculties(intuitionResult,
        mastermindResult) — comparing CORTEX'S OWN local intuition vs.
        mastermind faculty outputs against each other, using cortex's
        local _intuition/_mastermind instances. intelligence/server.js's
        /api/adversarial calls a different export from the same module,
        adversarial.compare({left, right}) — a generic two-arbitrary-
        things comparator. Same file, two real, distinct, non-overlapping
        functions — not duplication. Converting boot.js's route to a
        proxy would silently change its behavior, not deduplicate it.
        /api/intelligence/{context,intuition,mastermind,mastermind/
        patterns} checked the same way: intelligence/server.js has no
        real routes for any of them (only /api/adversarial and
        /api/framework/create exist there) — building those would be new
        route work in intelligence/server.js, not a proxy conversion of
        existing duplication. This phase's original framing ("cortex/
        boot.js duplicates logic that already exists sovereign in
        intelligence/") does not hold up under verification. Only
        /api/cortex/lattice (requires ../intelligence/spatial/
        system-lattice directly, a real cross-system reach-around) and
        /api/intelligence/status (already proxies, confirmed correct)
        remain real candidates — everything else in this phase is closed,
        not deferred.

    # ── TRACK R — Recall / lib ──────────────────────────────────────────────

    R1_recall_to_lib:
      status: OPEN — real design call
      depends_on: []
      does: >
        cortex/push-recall.js depends on cortex/memory/{bep-lookup,
        causal-lookup,fix-map}.js for its 5 scoring lanes. Decide: memory/
        moves to lib/ with it (recall + its lanes as one lib unit), or
        memory/ stays cortex-local and lib/ gets a thin interface. Not
        guessed here — moving push-recall alone breaks 3 of 5 lanes.

    # ── TRACK C — CLI ────────────────────────────────────────────────────────

    C1_cli_per_system_split:
      status: OPEN
      depends_on: []
      does: >
        Clean 1:1 moves: cli/sentinel.js -> sentinel/, cli/copilot-window.js
        -> copilot/, cli/cfr-debug.js -> versionium/ (CFR-Ω is Versionium's
        per VS2). Genuinely cross-system, no single home, STAY in cli/:
        diagnose.js, boot-systems.js, nexus-repl.js, nexus-repl-descriptors.js,
        nexus-movement.js, axiom.js, pressure.js, run-supervised.js,
        session.js. cli/nexus-cli.js NOT touched — see
        done_this_session.flagged_not_deleted above.

    # ── TRACK N — Root cleanup ───────────────────────────────────────────────

    N1_root_md_consolidation:
      status: DONE — 2026-09-11
      depends_on: []
      done: >
        Real per-file judgment applied, not a blanket move. Result: root
        now holds only README.md — already explicitly self-documented
        (own banner) as deliberately staying, superseded content intact,
        not touched. Moved to docs/ (living, current, still real):
        CLAUDE.md, START.md, SESSION-PROTOCOL.md, CHANGELOG.md. Archived
        to _archive/superseded-docs-2026-09-11/ (materially stale content,
        preserved per §0.3 not deleted): SYSTEM-MAP.md (dated 2026-06-27,
        describes components as "missing" that are long since built —
        its own header says "never delete," honored by archiving not
        erasing), CHANGELOG-SESSION.md (single dated 2026-08-12 session
        snapshot, superseded by lib/version.js's own much more current
        changelog array and by CHANGELOG.md itself).
        ARCHITECTURE-BRAINSTORM-SYNTHESIS-2026-09-10.md folded in
        verbatim as a new addendum key in THIS phasemap
        (docs/2026-09-11-sovereign-node-architecture-phasemap.spec) since
        its own content explicitly analyzes and corrects course against
        this exact phasemap — belongs structurally attached to it, not
        freestanding at root. Verified: re-parsed the modified spec file
        with js-yaml after the append, confirms valid YAML and the full
        19,242-char addendum present before deleting the source .md.
      real_bugs_found_and_fixed: >
        orchestrator/lib/changelog.js's own DOCS_DIR/SNAPSHOT_PATH/
        CHANGELOG_PATH were each one directory level short — from
        orchestrator/lib/, a single '..' resolves to orchestrator/, not
        the real repo root. Confirmed neither orchestrator/docs/ nor
        orchestrator/data/ has ever existed on disk — this entire
        automated-changelog-from-specs module has been a silent no-op in
        production since it was built, never once actually reading real
        specs or writing to the real CHANGELOG.md. Found while repointing
        CHANGELOG_PATH for this move (same file already being edited);
        fixed all three together rather than leaving 2 of 3 broken.
        Updated tests/modules/changelog.test.js's matching dynamic-patch
        strings — 5/5 passing after the fix (was 5/5 before too, since
        the test always used its own env-var-isolated path, this bug was
        invisible to the existing test suite by construction).
      also_fixed: >
        2 real references to CLAUDE.md's old path (scripts/
        precommit-check.js's "See CLAUDE.md" error message,
        cli/session.js's printed session-start instruction) — both
        repointed to docs/CLAUDE.md.

    N2_root_nexus_js_to_nexus_folder:
      status: DONE — 2026-09-11
      depends_on: []
      done: >
        6 files moved to new nexus/ folder: nexus-bus.js, nexus-connect.js,
        nexus-query.js, nexus-knowledge.js, nexus-cfr-influence.js,
        autopilot.js — all confirmed cross-cutting infra by header, none
        owned by a single system. ollama-runtime.js correctly excluded
        (no nexus- prefix, it's ollama's shared model config) — not moved.
        package.json's 5 `node autopilot.js` script lines repointed.
      real_scope_found: >
        Originally estimated ~28 call sites from one grep pass. Actual
        count after three separate sweeps (production requires, then
        fs.readFileSync/path.join source-scanning tests, then string-
        literal file-existence-check arrays) was ~50 across production
        code and tests — each sweep surfaced a category the previous one's
        pattern didn't match. Real lesson, not just volume: a single grep
        shape is not sufficient evidence of "found everything" for a
        tree-wide path rename; verified via a final zero-hits sweep with a
        broader pattern before trusting the count was complete.
      real_bug_found_and_fixed: >
        Two of the moved files computed their own real filesystem root
        from `__dirname` (autopilot.js's `const ROOT = __dirname` — used
        for every data/ walk, child-process spawn cwd, and cross-system
        relative path in the file; nexus-knowledge.js's `DATA_DIR =
        path.join(__dirname, 'data', 'knowledge')`). Both were correct
        before the move (dirname WAS repo root) and silently wrong after
        it (dirname is now nexus/) — neither is a require-path issue the
        mechanical repoint would have caught. Found via 4 real regressions
        in the tablet/ledger/graph API test suites (14/14->9/14, 12/12->
        7/12, 11/11->10/11) that a blind "tests still run" check would
        have missed if only checked for pass/fail count without comparing
        against the true pre-change baseline via git stash. Fixed both to
        path.join(__dirname, '..', ...).
      also_fixed: >
        2 stale test assertions doing literal source-string matching
        against the old un-prefixed require path (test-autopilot-warp-
        spine.js's AWS-001 regex, test-architect-pulse-migration.js's
        AP-001 regex) — both legitimately need to match the new correct
        `../nexus/...` path now, not a regression, the old assertion was
        checking for the literal string that used to be correct.
      verified: >
        Every test file touched or affected (19 files) reran individually
        against a git-stash-established true baseline, not just checked
        for "passes" — 4 real regressions found this way (see above), all
        fixed, all confirmed back to exact pre-move pass count. cos (156/
        157, unchanged from T3's own end state), warp (43/43, unchanged),
        loom/system-scaffold (12/12, unchanged) re-run clean. Zero syntax
        failures across all ~55 modified files, checked individually with
        node --check, not assumed from "no crash on require."

    # ── TRACK H — Hooks / Architect ─────────────────────────────────────────

    AR1_architect_retirement_and_hooks_to_loom:
      status: OPEN
      depends_on: []
      does: >
        architect.spec's own purpose line ("spec builder, hook registry,
        blueprint scanner") is being narrowed to spec-builder/blueprint-
        authoring only (architect/src/spec/Blueprint.js, arch-builder.html,
        spec-builder.html) — matching what Architect was actually supposed
        to be. docs/hooks-migration.spec already moved write-ownership to
        Loom once ("Loom owns all writes... Architect never dirties
        'hooks'/'hook_bindings'") — this phase finishes that: hooks/index.js's
        aggregation (7 live requirers: cortex/boot.js, architect/service.js,
        copilot/intents.js, lib/nerve/index.js, lib/agent-tools/tools/query/
        nexus-status.js, scripts/generate-hooks.js, scripts/verify-wires.js)
        moves fully under Loom, tool-index.js/command-index.js pattern
        included. Each hooks/<system>.hooks.js decentralizes into its owning
        system's own interaction-contract.json per the foundation spec's own
        v1.1.0 changelog intent, never executed until now. architect/
        service.js:621's hardcoded 'architect.booted' version:'3.0.0'
        (vs lib/version.js's 1.0.0) gets fixed in the same pass since it's
        in the same file being edited.
      flagged_broken_unrelated: >
        tests/modules/nerve-phase0-phase1.test.js and
        tests/modules/nexus-nerve.test.js hardcode absolute paths
        (/home/claude/nexus_fixed/..., /home/claude/new_nexus/extracted/...)
        that don't exist in this checkout. Already broken, unrelated to this
        phase, not fixed here.

    # ── TRACK X — Node decomposition tool ───────────────────────────────────

    X1_node_decomposition_tool:
      status: OPEN — scope confirmed, not built
      depends_on: [T1_extend_system_scaffold]
      does: >
        Route-handler-monolith decomposer (confirmed scope: pattern-matching
        on inline `if (p === '/api/...')` blocks, not a generic AST walker).
        Real test case: cortex/boot.js, 1794 lines, ~55 inline route blocks.
        Output: one file per route under the owning system's real component
        dir, named per the locked id_grammar
        (<system>.<semantic>.<nodetype>.js), classified into the 6-value
        nodetype enum, wired into that system's tool-index.js/
        command-index.js, with the capability_invariant checked on output
        (a route with no declared capability, or a capability with 0 routes,
        gets flagged, not silently passed).

    N3_stray_root_files_found_after_N1:
      status: DONE — 2026-09-11, found via James spot-checking, not this session's own sweep
      depends_on: []
      done: >
        N1 only searched for *.md — missed non-.md root clutter. Found:
        phase_map_11.html (216-entry phasemap dashboard, zero code
        references) moved to docs/. nexus-roadmap-combined.html found to
        be a byte-identical duplicate of an existing docs/ copy — root
        copy removed, not moved (moving over an identical file is a
        no-op with extra steps). ollama-runtime.js (flagged in N2's own
        notes as needing to move to ollama/, never executed then) moved
        to ollama/ollama-runtime.js — 4 real requirers repointed
        (idearium/agent-suite, orchestrator/lib/autonomous-loop.js,
        emerge/emerge-ide.js, tests/modules/ollama-runtime.test.js).
        Real bug caught by the move, same __dirname-relative class as
        N2's: the file's own internal require('./ollama/config.js')
        was correct when it lived at root (config.js really was one
        level down, inside ollama/) and silently wrong once the file
        itself moved into ollama/ (would have resolved to a nonexistent
        ollama/ollama/config.js) — fixed to './config.js'. Verified:
        tests/modules/ollama-runtime.test.js 8/8 (was crashing on
        MODULE_NOT_FOUND before the fix), idearium/agent-suite and
        orchestrator/lib/autonomous-loop.js both load clean.
      flagged_not_resolved: >
        powershell.exe found at repo root — real Windows PE32+ executable,
        454KB, zero references anywhere in the codebase. Not moved,
        not deleted, not touched. This needs a real answer from James
        directly (what it is, why it's there) before any disposition —
        an unreferenced Windows binary in a Node.js repo is a real
        finding to flag, not file away as clutter.
      still_present_flagged_not_executed: >
        blueprint-index.json (generated output, "builtBy":
        "blueprint-index", real live generator at lib/blueprint-index.js),
        writeback-failures.jsonl (a real runtime error log,
        emerge/cortex-query/writeback.js writes to it — this is state,
        not code, and CLAUDE.md's own rule says "NEVER commit data/**"
        — this file being tracked in git at all looks like exactly the
        violation that rule exists to prevent, not touched pending real
        decision), verification-manifest.json (its own _meta says
        "human-authored... NOT generated" — real, deliberate, checked-in
        content, not clutter, candidate for docs/ but not urgent).
        None moved — each needs its own real check of the generator/
        writer's hardcoded path before touching, same discipline as
        everything else this session, not done here due to budget.

    AR2_decentralize_interaction_contracts:
      status: OPEN — real scope mapped, not executed, larger than D1
      depends_on: [D1_diagnostic_real_folder]
      real_scope_found: >
        contracts/nexus-interaction-contract.js (554 lines) already has
        per-system sections (ORCHESTRATOR, GUARDIAN, CORTEX, ARCHITECT,
        IDEARIUM, BRIDGE [retired], COPILOT, CLEAR-GLASS, DIAGNOSTIC) —
        exactly the centralized content each system's own
        interaction-contract.json should hold instead (most sovereign
        systems already have one — versionium/, nexus-healer/, cortex/
        all do). Not a static data file: also carries live logic — a
        Contract API, versioned contract snapshots (hash-keyed Map),
        snapshot-bound validation, and a circuit breaker for UI contract
        loading — real, active machinery orchestrator/orchestrator.js
        calls at runtime. Decentralizing means rebuilding that logic to
        read N per-system files instead of one central object, not just
        copying data out. contracts/SYSTEM-CONTRACTS.js (1007 lines) is a
        separate, much broader thing — AXIOMS/EVENTS/GAPS/FAULTS/EDGES/
        DELTAS/LEDGERS/CAUSAL_PHYSICS, with only one sub-section
        (INTERACTION_CONTRACTS) touching this at all, and that
        sub-section is itself cross-system policy (seam contracts,
        universal rules like "every request carries X-Bridge-UUID"), not
        per-system content to redistribute — likely stays put, out of
        scope for this specific phase.
      blocked_on: >
        diagnostic doesn't have a real folder yet (D1) — its section in
        nexus-interaction-contract.js has nowhere real to land until D1
        lands first.
      not_executed_why: >
        Larger than D1 (which was itself deferred for size — 44 files,
        2667 lines) and requires the same repoint-and-verify-per-file
        discipline this session used throughout (T3, N1, N2, N3) at
        bigger scale: rebuild live Contract API logic against N files,
        repoint orchestrator/orchestrator.js + 2 real test files
        (tests/modules/interaction-contract.test.js, tests/brutal.test.js),
        decide SYSTEM-CONTRACTS.js's fate separately. Not started this
        session — logged precisely so it doesn't need re-discovery.

  build_order_recommendation: >
    T3 (WARP/SISO) first — it blocks T2 and touches 25 real files, cheapest
    to derisk now before anything else is built on top of it. T1 (scaffold
    extension) second — every system-creation phase (D1, X1) depends on it.
    Zero-dependency deletes are done. Everything else (V, D2, I1, R1, C1, N,
    AR1) is independently startable but real surgery, not folder moves —
    none executed this pass beyond done_this_session.
