spec:
  meta:
    name:        cli
    version:     1.4.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-cli-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Command-line tools for NEXUS operation, diagnosis, and boot.
      Not a service. Scripts run on demand.
      Phase 36 unifies nexus-repl into the grammar-engine-driven model
      cli/nexus-cli.js already uses.

  stale_status_fixed: >
    v1.0 said grammar-engine.js was "not yet built" / "PENDING — Phase 3".
    It's shipped — see docs/grammar-engine.spec, 16/16 tests passing.
    This file just hadn't been updated when that landed. Cross-spec drift
    isn't something spec-drift.js currently checks (it only compares
    spec-vs-code, not spec-vs-spec) — worth a future gap type, not fixed
    here, just flagged.

  modules:
    - id: diagnose
      path: "cli/diagnose.js"
      lines: 1450
      description: >
        Runs all 12 diagnostic engines against a system's ledger.
        Called automatically by boot-systems when a service fails to come up.
        Also callable manually: node cli/diagnose.js <systemId>
        Output: health score, alerts, causal chain, circuit state,
        entropy rate, fault tree, homeostasis score.

    - id: boot-systems
      path: "cli/boot-systems.js"
      description: >
        Starts all NEXUS subsystems in sequence.
        Called by orchestrator after its own boot sequence completes.
        Each system: spawn → wait for health → verify contract.
        On failure: run diagnose → log to event ledger → continue.
        Order: bridge → cortex → guardian → idearium → architect → emerge → diagnostic.

    - id: copilot-command
      path: "cli/nexus-repl.js — case 'copilot'/'cp'"
      status: built
      description: >
        Real entry point to guardian/agents/co-pilot, not previously
        wired despite the module existing — caught and fixed same
        session. `copilot <prompt>` for chat, `copilot <prompt> --cmd
        "<command>"` for a RAID-gated tool call. Registered as
        repl.copilot in cli/nexus-repl-descriptors.js, real proxy route
        added at orchestrator.js (POST /api/guardian/copilot/prompt —
        didn't exist before, verified missing before adding it).

    - id: nexus-cli
      path: "cli/nexus-cli.js"
      status: built
      bugs_fixed_this_session: >
        James reported it was broken last used, several updates ago, never
        re-tried. Traced the Qwen-reasoning fallback (the actual point of
        cli-reasoning.js — "couldn't resolve, try thinking") and found two
        real bugs, both silent, not crashes: (1) read `ge._tree` directly,
        a property grammar-engine.js never exported — always undefined,
        silently degraded to `{}`. (2) `comps` was hardcoded `[]` — and
        even a correct fix couldn't have worked, because
        component-registry.js's handleRequest had no bulk-list route at
        all, only single-component GET by id. Fixed all three: added
        getAliases() to grammar-engine.js (lib/grammar-engine.js, returns
        a copy, not the live reference — tested), added the missing
        GET /api/components bulk-list route with namespace/tag/available/q
        filters (lib/component-registry.js), wired nexus-cli.js to use
        both instead of the broken/empty values. 21/21 grammar-engine
        tests passing (+1 new), 18/18 component-registry tests passing
        (+2 new). The reasoning fallback had zero real context on every
        call before this — not degraded, completely blind — which is
        consistent with "broken" rather than just "not great."
      description: >
        Already grammar-engine-driven. Resolves componentId via
        ge.resolve(), dispatches to component.route, tracks history. The
        model Phase 36 brings nexus-repl up to.

    - id: nexus-repl
      path: "cli/nexus-repl.js"
      lines: 882
      status: phase_36_in_progress
      description: >
        Correction (checked the live file directly, twice — first
        assessment was also wrong): nexus-repl.js already requires
        lib/grammar-engine and uses it for tab-completion
        (_grammar.complete(line)), with a §PHASE-15-CLOSE comment marking
        where a prior session fixed a ReferenceError from grammar-engine
        being referenced but never required. What's actually still
        missing, narrower than originally stated: (1) the main dispatch
        loop never calls ge.resolve() to route commands — only completion
        uses grammar-engine, the switch statement is still sole
        dispatcher; (2) none of nexus-repl's ~25 commands were registered
        into component-registry, so other consumers (nexus-cli.js, future
        Phase 40.5 CLI projection) couldn't discover or resolve them.
      phase_36_built:
        file: "cli/nexus-repl-descriptors.js"
        scope: >
          forge, heal, and snapshot now registered — was only forge.
          heal and snapshot were blocked on missing orchestrator proxy
          routes; both added this session (orchestrator.js: new
          sub==='diagnostic' proxy block for POST /api/diagnostic/gaps/
          :uuid/fix, confirmed real against service/nexus-diagnostic.js;
          POST /api/cortex/snapshots/create already existed, just wasn't
          used by anything registered).
        live_bug_found_and_fixed: >
          nexus-repl.js's `snapshot` command was POSTing to
          cortex/api/snapshot (singular) — that route doesn't exist.
          Cortex only serves /api/snapshots/create (plural). Confirmed
          directly in cortex/foundation/admin-server.js before fixing —
          this 404'd silently every time `snapshot` was run. Fixed in
          nexus-repl.js, found BEFORE registering the descriptor (so the
          registry entry points at the real working route, not the bug).
        caveat: >
          repl.heal's route has a :uuid placeholder. Checked nexus-cli.js's
          generic component.route dispatcher directly — it does zero
          path-parameter substitution, sends route.path as a literal
          string. So repl.heal is discoverable (grammar/registry/tab-
          completion) but not yet genuinely dispatchable through the
          generic exec path the way forge/snapshot are. nexus-repl.js's
          own `heal` command still works — it calls diagnostic directly
          with the real gapId substituted, bypassing component.route
          entirely. Path-param substitution in the generic dispatcher is
          a real gap, not built here.
        wiring: "registerAll() called once from nexus-repl.js's existing loadGrammar(), fire-and-forget, never blocks the REPL working as it always did."
        tests: "3/3 PASSING (tests/modules/nexus-repl-descriptors.test.js) — descriptor validated against component-registry's real validate(), not a guessed shape."
        still_missing: "ge.resolve() is not yet called in the dispatch loop — checked first whether this was actually needed: it isn't yet. Unmatched local commands already fall through to guardian's generic /cli/exec endpoint (a real, working route), which itself falls back to dispatchLocal()'s own switch with a real 'unknown command' message. Wiring resolve() into dispatch() would be premature — there's no command yet that exists ONLY via registry (forge/heal/snapshot are all still hardcoded switch cases too), so there's nothing real to test the wiring against without speculative code. Real next step: once a command exists that's registry-only with no switch case, THAT'S when resolve()-based dispatch becomes necessary and testable."
      deps: "grammar-engine ✓ · component-registry ✓ · nexus-repl ✓ · jaa ✓ — unblocked"

  notes:
    - "All existing CLI tools remain functional during Phase 36 build"
    - "diagnose.js is the manual entry point to the 12-engine suite"
