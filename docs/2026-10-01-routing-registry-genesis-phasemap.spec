spec:
  meta:
    name:     routing-registry-genesis
    version:  1.0.0
    date:     2026-10-01
    release:  0.39.285 (base) → 0.39.286
    uuid:     nexus-routing-registry-genesis-phasemap-v1-0000-2026-1001-jamesbrooks-001
    owner:    idearium.spec-engine · idearium.api · idearium.repo · idearium.ui · lib.pipeline-routing · docs.genesis · docs.architecture-spec
    status:   DONE 2026-10-01 (0.39.286) — every phase built and proven; tests named in the addendum.
    axioms:   docs/AXIOMS-v3.1.md — §3.1 bottom-up, §3.3 map before build, §8.6 reuse before build, §0.3 nothing lost,
              §1.2 nothing silently fails, §17.5 every output has provenance.
    origin: >
      James, 2026-10-01: "can we have full options for fallback logic, routing. what could improve stability with the
      pipeline? can we add the components registry as an 11th chunk for the systems template, like its where its all
      wired in, event driven interaction contract, after the file list and tree, then the registry can map the relation
      to each component and chunk, and also is its self the doorway, and the rest is isolated modular, interacting
      through the interaction contract/registry? also for the routes, cli, nodes and dir, everything loom and the
      component registry have, that way the ui can also float on top, have genesis the default spec? i want this saved
      to the architecture spec and genesis updated, also needs to use the nodes based data structure exactly like
      guardian … also can you remove anything from the architecture spec thats absent from nexus?"

  found:
    - >-
      Fallback today is ONE hop, hard-coded: idearium/api/index.js speceng.build sets fallbackAgent = 'gemini' only when
      the preferred agent is chatgpt; chunk-dispatch.js tries it once and never cascades. The outer cap
      (maxWallClockAttempts = 6) is a literal. No breaker: a provider that is down is tried again on every chunk.
    - >-
      Pieces to reuse (§8.6): guardian/lib/job-retry.js classify() (retryable vs needs-you), the circuit breaker in
      guardian/lib/dispatch-ladder.js, lib/economy/gate.js decide() and lib/economy/router.js choose() (the learned
      router), lib/agent-providers.js (the one list of providers), the seam Detector's summary (why a reply was refused).
    - >-
      The systems template is idearium/spec-engine/blocks.yaml: 10 blocks; build_order carries the file list and tree
      (compiler-t0 reads it). There is no block for the registry — the wiring is spread over integration/events/api.
    - >-
      Guardian's node structure: <dir>/nodes/<type>/<id>.<type>, one envelope (lib/node-export.js wrap: envelope,
      uuid, type, id, context, intent, summary, system, tags, payload), archived not deleted (lib/system-nodes.js).
      idearium/repo/architecture.js (0.39.284) already projects a repo into components/hooks/wires but writes JSON only.
    - >-
      genesis is a template (idearium/spec-engine/templates.js id 'genesis') but not the default: a new spec starts with
      no template. docs/architecture-spec/architecture-spec.spec names module paths that do not exist
      (architecture-spec/schema/*.js, architecture-spec/compiler/lattice.js — the real files are under
      architecture-spec/registry/), eleven events nothing emits, and target routes never built.

    - >-
      Found while wiring RG3: chunk-dispatch.js is an ES module, and its RAID default (`require('../../cortex/core/raid')`
      when no agent was chosen) calls a require that does not exist there — it throws, the catch swallows it, and the
      provider falls to 'ollama'. It has never run. speceng.build always passes an agent, so builds are unaffected; left
      as is and named here (turning RAID on inside every unassigned dispatch is its own decision).

  phases:
    RG0_map:
      layer: foundation
      status: DONE
      depends_on: []
      files: [docs/2026-10-01-routing-registry-genesis-phasemap.spec, docs/SPEC-REGISTRY.spec]
      does: "This map, registered."
      proof: "the file exists and is registered"

    RG1_routing_policy_library:
      layer: library
      status: DONE
      depends_on: [RG0_map]
      files: [lib/pipeline-routing.js]
      does: >-
        One pure module: the routing policy and what it does with a failure.
          modes     fixed (the chosen agent only) · chain (chosen, then the fallback chain in order) · local-first
                    (ollama first, then the chain) · economy (lib/economy/router.choose orders the candidates by what
                    has worked) — the default is chain.
          chain     an ordered provider list (global, per block in blocks.yaml `fallback:`, per call), de-duplicated,
                    unknown names dropped with a reason (lib/agent-providers).
          classify  a failed attempt → empty · truncated · refused · timeout · provider-down · rate-limit · login ·
                    unknown (guardian/lib/job-retry.js classify + the detector summary).
          fallback_on  which classes move to the next provider (default: all but login, which needs a person).
          breaker   per provider: N failures in a row open it for a cooldown; an open provider is skipped and the
                    skip is recorded (guardian dispatch-ladder's breaker, per provider).
          caps      max hops, wall-clock attempts per hop.
        plan() returns the ordered route with a reason per step; nothing is chosen silently.
      proof: "unit tests: each mode's order, chain parsing, classification, fallback_on, the breaker opening/closing"

    RG2_routing_config_api_cli:
      layer: api
      status: DONE
      depends_on: [RG1_routing_policy_library]
      files: [idearium/lib/config-core.cjs, idearium/api/index.js, idearium/cli/index.js]
      does: >-
        Config group `routing` (mode, chain, fallback_on, max_hops, attempts_per_hop, breaker_threshold,
        breaker_cooldown_ms, skip_open). GET /api/routing (policy, breaker state, the planned route per block) and
        GET /api/routing/plan?block=&agent= (a dry run); POST /api/config sets it (API first); `idearium routing` in the
        CLI shows the same.
      proof: "the routes through the real router; the CLI prints the plan"

    RG3_dispatch_uses_the_route:
      layer: library
      status: DONE
      depends_on: [RG2_routing_config_api_cli]
      files: [idearium/spec-engine/chunk-dispatch.js, idearium/api/index.js]
      does: >-
        speceng.build asks plan() for the route instead of the one hard-coded hop; chunk-dispatch walks it: each hop's
        outcome is classified, the breaker fed, a class not in fallback_on stops the walk, the cap is the policy's.
        Every hop is kept on the chunk (chunk.route: provider, outcome, class, ms, why) — provenance of who built it
        and who failed first.
      proof: "a stub dispatch that fails on A and B and answers on C: the chunk is built by C with three hops recorded;
              login on A stops the walk; an open breaker skips A"

    RG4_routing_ui:
      layer: ui
      status: DONE
      depends_on: [RG3_dispatch_uses_the_route]
      files: [idearium/ui/settings.html]
      does: "Settings console → Routing & fallback: mode, chain, fallback-on chips, caps, breaker state, the plan per block."
      proof: "a static check that the page reads /api/routing and writes routing.* through /api/config"

    RC1_registry_block:
      layer: foundation
      status: DONE
      depends_on: [RG0_map]
      files: [idearium/spec-engine/blocks.yaml]
      does: >-
        The 11th block, `registry` — "Component Registry & Interaction Contract", after build_order (the file list and
        tree). It maps every component and the chunk that builds it: id, type, layer, file; hooks and wires (consumer ←
        dependency); events emitted and consumed; routes; CLI commands; node types; data dirs; orphans. The registry is
        the doorway: modules do not reach each other directly — every crossing goes through the contract (events,
        hooks), so each module stays isolated and replaceable and the UI floats on top reading the registry only. It
        is written as nodes in Guardian's layout (nodes/<type>/<id>.<type>, lib/node-export.js envelope).
      proof: "a new spec has 11 chunks, registry last, depending on build_order; existing specs unchanged"

    RC2_registry_as_nodes:
      layer: library
      status: DONE
      depends_on: [RC1_registry_block]
      files: [idearium/repo/architecture.js, idearium/api/index.js, lib/node-export.js]
      does: >-
        architecture() also reads routes, CLI commands and events from the code; toNodes() turns the registry into
        envelopes — .component, .hook, .wire, .command (routes and CLI), .event, .system, and one .contract (the
        interaction contract: what crosses which boundary). POST /api/repos/:uuid/architecture writes them into the repo
        at nodes/<type>/<id>.<type> beside ARCHITECTURE.json; a node no longer produced is moved to nodes/_archive/.
      proof: "a fixture repo → the node files, each a valid envelope; a removed file's component is archived"

    GN1_genesis:
      layer: foundation
      status: DONE
      depends_on: [RC2_registry_as_nodes]
      files: [idearium/spec-engine/templates/genesis.spec, idearium/spec-engine/templates.js, idearium/ui/js/app.js]
      does: >-
        genesis gains the registry domain (the doorway, the interaction contract, the node layout) and the routing
        domain (fallback policy). genesis becomes the default template: the New spec form opens with it checked.
      proof: "genesis parses as a template seed; the form's default is genesis"

    AR1_architecture_spec:
      layer: foundation
      status: DONE
      depends_on: [GN1_genesis]
      files: [docs/architecture-spec/architecture-spec.spec, docs/architecture-spec/_archive/]
      does: >-
        0.8.0: module paths corrected to the real files; events nothing emits, routes never built, and claims with no
        code behind them moved out — kept whole in docs/architecture-spec/_archive/architecture-spec-0.7.0.spec (§0.3).
        The registry block and the routing policy added as real sections.
      proof: "every path the spec names exists (a test)"

    RG9_release:
      layer: ui
      status: DONE
      depends_on: [AR1_architecture_spec, RG4_routing_ui]
      files: [lib/version.js, package.json, CHANGELOG-0.39.286.md, docs/atlases/idearium-atlas.md, loom/maps/one-idearium-map.js]
      does: "versions, changelog, atlas, loom wires, tests registered"
      proof: "the touched suites green"

## ADDENDUM 2026-10-01 — built (0.39.286)
# RG1–RG4  lib/pipeline-routing.js; idearium config routing.*; GET /api/routing, /api/routing/plan, POST
#          /api/routing/breaker/reset; `idearium routing [show|plan|set]`; chunk-dispatch walks the route and keeps each hop
#          on the chunk (spec-engine recordChunkRoute); the settings console's Routing & fallback page.
#          Found and fixed on the way: a hop's own error was replaced by "exceeded outer wall-clock attempt cap" (now kept
#          as "— last error: …"), and a login or a limit was retried six times against the same provider (now ends the hop).
#          tests/modules/test-pipeline-routing.test.js 14/14.
# RC1–RC2  blocks.yaml block 11 `registry` (dependsOn build_order, fallback [ollama, gemini]); architecture.js reads
#          routes/CLI/events and toNodes() writes nodes/<type>/<id>.<type> (node-export envelope), unchanged nodes left
#          alone, stale ones archived. tests/modules/test-repo-architecture.test.js 12/12.
# GN1      genesis 1.1.0 (Domain 2c registry, Domain 11 routing, registry/node-registry.js, spine/route-policy.js), the
#          default template of a system spec and checked in the New spec form. AR1 architecture-spec 0.8.0, 0.7.0 archived
#          whole. tests/modules/test-genesis-and-architecture-spec.test.js 5/5.
# Loom     one-idearium-map: api → lib/pipeline-routing.js, chunk-dispatch → lib/pipeline-routing.js (both land on bootstrap).

## ADDENDUM 2026-10-01 — RG5 learned routing (0.39.287)
# James: "smart fallback for ollama and guardian, learn which models are best for what chunks."
# RG5_learned: lib/pipeline-routing.js mode 'learned' (default) — provider:model candidates (Ollama per model), jobTypeOf()
# (build:<block> | build:file.<ext>), recordHop() into lib/economy/ledger.js from chunk-dispatch's walk (cache hits
# skipped), the route ordered by Beta-posterior success per chunk type once learn_min_records exist (deterministic;
# untried 0.5), learned() + GET /api/routing/learned + `idearium routing learned` + the settings table.
# The hop's model rides to the agent (dispatchOpts.model wins over the hat's). tests: test-pipeline-routing PR-31…34, PR-26.
