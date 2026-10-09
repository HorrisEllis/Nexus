spec:
  meta:
    name:        spec-registry
    version:     2.0.0
    foundation:  nexus-system-foundation@1.1.0
    status:      living-document
    uuid:        nexus-spec-registry-v2-0000-2026-0902-jamesbrooks-001
    author:      james-brooks
    created:     2026-06-29
    purpose: >
      Every real .spec file in this repo is entered here on creation and
      updated every time it's checked for drift, not just when written — a
      spec not in this registry is unaccounted for (§6.3,
      docs/AXIOMS-v3.1.md). Converted from SPEC-REGISTRY.md to this real
      .spec format on 2026-09-02, James: "can we convert SPEC-REGISTRY.md
      to a .spec seems stupid to have it a md."
    conversion_method: >
      Mechanical, not hand-retyped, and lossless. First pass extracted only
      the 162 real table rows programmatically (146 main registry + 16
      later §REGISTERED batches) into the structured `registry:` list
      below — but a diff check against the original found 4 real .spec
      filenames referenced only in narrative prose (jaa-store.spec,
      rfr2.spec, cortex/spec/cortex.spec, ollama/spec/ollama.spec) that the
      table-only extraction had silently dropped — several real, multi-
      paragraph session-log sections (2026-07-24's real-gaps-found entry
      alone runs 242 lines) live BETWEEN the tables, not just around them.
      Rather than hand-summarize 17 narrative blocks and risk losing or
      distorting real history, the full original document is preserved
      verbatim below as `original_full_text` — every filename, every
      finding, guaranteed present. The structured `registry:` list is the
      queryable layer on top, not a replacement for it.
    real_consumers: >
      loom/bootstrap.js, loom/scanners/spec-map.js, and
      scripts/precommit-check.js all read this file — checked directly
      before converting: all three do a plain substring match
      (content.includes(filename)), not markdown-table parsing, so the
      format change is safe as long as every filename string survives —
      confirmed it does (see conversion_method above). Each file's own
      hardcoded path ('docs/SPEC-REGISTRY.md') was updated to
      'docs/SPEC-REGISTRY.spec' in the same commit as this conversion.
    status_legend:
      checked_clean:  "checked against live code, no drift found (or drift found and closed)"
      partial:        "checked, some drift found, not fully resolved"
      drifted:        "checked, real drift found, open"
      unchecked:      "not yet checked this pass — no claim either way"

  # ── The real registry — 146 entries, mechanically extracted from the
  # original markdown table, not retyped ──
  registry:
    - spec:             'idearium/spec/idearium.repo-graph.spec'
      version:          '1.0.0'
      last_drift_check: 'written 2026-09-19, BEFORE the code (§8.5 honored this time)'
      status: >
        Real spec for idearium/repo/graph.js — nexus-repository-system.spec §24 relationship_graph, §25 graph_traversal, §26 dependency_cone; closes MCO1_graph_layer in nexus-repository-system-build-phasemap. Ships contains/belongs_to/imports/exports/depends_on/depended_on_by and DECLARES the relations it does not produce (calls, implements, emits, tested_by...) so empty is distinguishable from none. Unresolvable imports stay as unresolved edges rather than being omitted (§24 constraint, REPO-009). Verified 49/49 against a real repo run through the real pipeline. Two findings measured during the build are recorded in the spec: import-pipeline.js's LANGUAGES table detects no Go/Rust/Ruby/Java/C#/C/C++ (reported, not fixed here — one owner), and its brace-balance check had a 100% false-positive rate on 6 of 407 real files including guardian/server.js (fixed, 12/12 regression tests).
    - spec:             'guardian/spec/guardian.code-artifact.spec'
      version:          '1.0.0'
      last_drift_check: 'written 2026-09-19 — spec written AFTER the code, recorded as a §8.5 violation in the spec itself'
      status: >
        Real spec for guardian/lib/code-artifact.js — a job declares fileName + syntax at createJob time, and the ncp-handler completion listener writes the returned fenced code to that name and stages it through lib/intake.js's existing gate. Verified 27/27 including a real intake.stage() round trip. Two real gaps named in the spec rather than implied away: the mesh completion path is not wired (ncp path only), and no live run against a real provider tab has happened.
    - spec:             'docs/contracts/synthesis-contract.spec'
      version:          '1.0.0'
      last_drift_check: 'written 2026-09-02'
      status: >
        Real B1 contract schema spec (endState/conditions/warpPrimitives/axioms/tools/compartmentUuid/fileDirectory/fileName) plus the boundary block (primitive/invariants/principles) cortex/core/raid/contract-boundary.js implements. Corrected mid-session: boundary.primitive accepts a confirmed-real module/function path as well as a loom-registered id, since 2 of the 4 real contract sources (self-heal, agent-mesh) have no HTTP route and are not loom-registerable.
    - spec:             'docs/contracts/context-candidate.spec'
      version:          '1.0.0'
      last_drift_check: 'written 2026-09-02'
      status: >
        Real spec for a context-candidate object — the intermediate shape between raw context and a synthesized contract.
    - spec:             'docs/contracts/context-synthesis-pipeline.spec'
      version:          '1.0.0'
      last_drift_check: 'written 2026-09-02'
      status: >
        Real spec for the end-to-end context-synthesis pipeline (stage_2_schema_registry and related real rows) that cortex/core/raid/officiator.js and contract-boundary.js implement.
    - spec:             'docs/2026-09-02-nexus-vision-master-phasemap.spec'
      version:          '1.0.0'
      last_drift_check: 'not applicable — phasemap, mapped-not-built'
      status: >
        Master phasemap for James's full vision dump this session (tool/event awareness, build-contract primitives, idearium spec pipeline, agent-mesh UI, guardian agents/ refactor, clear-glass macros+CLI-first architecture, versionium's deeper file-tracking role, the living-model framework itself, co-pilot rigidity/learning/model-selection, and a draft AX-014 candidate axiom). Two real, concrete findings folded in: the loom-map 41-systems count is confirmed inflated (real bug in lib/loom-map.js's resolveSystem(), folder/category prefixes like tests/lib/spec counted as systems, cos/cg double-counted against their full names), and the duplicate boot-log lines are confirmed already-fixed (stale log from before the fix reached that machine). Explicitly mapped-not-built per James's own instruction.
    - spec:             'alk-perception.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'api-dispatch.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'architect.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-28'
      status: >
        ✗ DRIFTED — 3-way version split: spec says 2.0.0, lib/version.js says 1.0.0, service.js boot event hardcodes '3.0.0'. Not yet reconciled.
    - spec:             'auth.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'autonomous-loop.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'bda.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'behavioral-boundary.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'blueprint.spec'
      version:          '1.1.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'bridge.spec'
      version:          '3.0.0'
      last_drift_check: '2026-06-28'
      status: >
        ⚠ PARTIAL — described routes not found in live registry-components.js. Mechanical version sync applied, route drift not.
    - spec:             'builder.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'case-library.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'cfr-contract-wire.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'cfr.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'chat-logger.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'clearglass-agent-suite-and-cfr-loom-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-08-17'
      status: >
        10 phases (TX1-TX10) from a parallel live session's real transcript plus two new asks. 1 DONE (TX5, the cos.spec/snapshot-engine backup work already covers the "backup the system" ask, confirmed against earlier this session's own investigation), 1 PARTIAL (TX3, a real switchTo(id) tab-switch precedent found in clear-glass/renderer/browser.js — the launcher is smaller than it looked), 8 OPEN including a real schema mismatch found by the parallel session (hat-forge's VALID_BASE_AGENTS allows ollama/mistral, account-registry has no slot for either — needs a decision, not an assumption) and a real precedent for the loom-3D-CFR ask (eravos/ui/runtime/canvas-cfr.js, a genuine 192-line working WebGL canvas, confirmed by reading it directly — an adaptation, not a from-scratch build).
    - spec:             'cli-reasoning.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'cli.spec'
      version:          '1.4.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'component-registry.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'copilot-tool-system.spec'
      version:          '0.1.0'
      last_drift_check: '2026-08-19'
      status: >
        Spec for the real, expanded co-pilot tool system — agent-tools, agent-reach.js, tool-forge, copilot/lib/autonomy-router.js, and the guardian NCP surface. Found genuinely missing from this registry by the precommit hook after merging in nexus0822/master; registered without re-auditing its full internal content this pass.
    - spec:             'constitutional-ai.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'context-builder.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'contract-queue.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'contracts.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'copilot-expansion.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'copilot-full-capability-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-08-12'
      status: >
        ✓ ALL 11 PHASES DONE — written and self-checked this session, every substrate claim verified live before writing, then every phase live-verified as built. P7 (the last, hardest phase) had a real route-ordering bug found and fixed by live end-to-end testing before being marked done.
    - spec:             'copilot-guardian-cos-expansion-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-08-17'
      status: >
        10 phases (GA1-GA10) compiled from the person's own screenshots of a parallel conversation, each checked against real code before being marked done/partial/open, not trusted from the screenshots' framing alone. 2 DONE (GA2 diagnostic-report.js real; GA5 git history confirmed intact, 314 commits unbroken), 4 PARTIAL, 4 OPEN. Also found and flagged (not fixed here): loom/scanners/phasemap-map.js's status parser only recognizes explicit ←DONE/✓DONE/#DONE/COMPLETE markers — even the established SB1_schema_extension phase (nexus-self-build-pipeline-phasemap.spec) parses as "pending" under the real scanner despite being genuinely complete, meaning loom's own done-counts likely undercount real completed work across this whole registry, not just this file.
    - spec:             'copilot-omniscience-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-07-30 → 2026-08-12'
      status: >
        ✓ ALL 7 PHASES DONE — pre-existing file from 2026-07-30, was missing from this registry until now. P1's inline DONE marker was also missing (P2-P7 had one, P1 didn't) despite the file's own header already claiming all 7 done — fixed same commit, confirmed live first (copilot/server.js:1222 -> tool-runtime.js -> runToolLoop).
    - spec:             'copilot-migration-and-new-capabilities.spec'
      version:          '1.1.0'
      last_drift_check: '2026-06-29'
      status: >
        ✓ filed session 6 — MIG-01 resolved, MIG-02 resolved differently than proposed, MIG-03 unverifiable (file not in tree), capability_cli_authoring built session 6.
    - spec:             'copilot.spec'
      version:          '3.5.0'
      last_drift_check: '2026-09-19'
      status: >
        ✓ CHECKED — version field corrected (was '2.0.0' here, real file says 3.5.0). Extended, not
        rewritten: added built_2026_09_19_inject_rule documenting the new inject_rule node type and its 5
        real injection sites. Full route/handshake drift audit not repeated this pass.
    - spec:             'cortex-dual-cognition.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'cortex.spec'
      version:          '3.2.0'
      last_drift_check: '2026-06-29'
      status: >
        ⚠ PARTIAL — version synced session 3. Phase 84/85 intelligence description overstated vs. code (session 6 finding) — not yet corrected here.
    - spec:             'cos.spec'
      version:          '1.5.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'diagnostic-engines.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'diagnostic-fixes.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'diagnostic-phase-map.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'diagnostic.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-28'
      status: >
        ✗ DRIFTED — describes a registry-components.js and handshake that don't exist in code. Flagged, not fixed (code gap, not a doc fix).
    - spec:             'emerge.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-28'
      status: >
        ⚠ PARTIAL — described routes not found in live registry. Mechanical sync only.
    - spec:             'eravos.spec'
      version:          '3.0.0'
      last_drift_check: '2026-06-28'
      status: >
        ✓ written fresh session 3 — no prior spec existed, generated from the live exported module.
    - spec:             'erosmancer.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'escalation.spec'
      version:          '1.1.0'
      last_drift_check: '2026-06-28'
      status: >
        ✓ mechanical version sync only, no further drift found.
    - spec:             'forge.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'gap-lifecycle.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'grammar-engine.spec'
      version:          '1.2.0'
      last_drift_check: '2026-06-28'
      status: >
        ✓ mechanical version sync only, no further drift found.
    - spec:             'guardian-user-understanding.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'clear-glass.spec'
      version:          '3.1.0'
      last_drift_check: '2026-09-19'
      status: >
        ✓ CHECKED — no prior registry entry existed for this spec at all (real, pre-existing gap, closed
        here). Extended: version_history gained a 2026-09-19 entry for the 13 new real mesh gates
        (workflow CRUD/run/step-move + 3 list gates) in clear-glass/src/gates/index.js — no version bump,
        same real object/methods, just newly reachable.
    - spec:             'guardian.spec'
      version:          '3.19.1'
      last_drift_check: '2026-10-02'
      status: >
        §GA1 2026-10-02 — ONE guardian spec: guardian/spec/guardian.spec (3.19.1). docs/guardian.spec, a copy 13 versions
        stale whose every line was already in the real one, is now a pointer to it; Guardian's agent facts are its provider
        nodes (guardian/data/nodes/provider/). Earlier note, kept:
        ✓ CHECKED — version field corrected (was '3.6.1' here, real file says 3.6.2). Extended: added
        built_2026_09_19_agent_tool_expansion — no guardian-owned code changed, but its real job-dispatch
        surface (POST /command + GET /jobs) is now exercised by 47 real actions across two agent-tools
        (agent_mesh_route, browser_action), up from 9. Named one real, still-open decision: whether
        cockpit's own command contract should also expose these, a second path to the same capability.
    - spec:             'healer.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'heartbeat.spec'
      version:          '2.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'home-ui.spec'
      version:          '1.4.0'
      last_drift_check: '2026-09-25'
      status: >
        file layout checked against code (v0.39.228 split); phase 2 found broken and fixed
    - spec:             'hooks.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'hot-module-loader.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'idearium.spec'
      version:          '4.1.0'
      last_drift_check: '2026-09-19'
      status: >
        ✓ CHECKED — version field corrected (was '3.0.0' here, real file says 4.1.0, itself already noted
        in-file as a 2026-09-13 drift fix from a stale 3.2.0). Extended: added
        built_2026_09_19_compiler_t0_and_bottom_up_build — spec-compiler's T0 tier, real dependsOn/topo-sort/
        cycle-detection on addChunk(), two real bugs fixed (ingestFilesAsSpec's fabricated empty-file
        placeholder, RepoLayer.materialize()'s false ok:true), lib/extract-code.js wired opt-in.
    - spec:             'intelligence-bridge.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'intelligence.spec'
      version:          '1.0.0'
      last_drift_check: '2026-09-19'
      status: >
        ✓ CHECKED, extended (not rewritten) — added built_2026_09_19_pulse_and_nodes: intelligence/server.js wired into the real orchestrator pulse/heartbeat system (was the one sovereign system relying on active polling), and intelligence/lib/domain-nodes.js closes intelligence.node-taxonomy.md's own "node: NOT USED" finding — real, schema-validated .gap/.bep_pattern/.pattern_sequence/.resonance_crystal node exports at every real construction site. See intelligence/spec/intelligence.spec's own new section for the full record, including two pre-existing schema mismatches and one unrelated blocking YAML bug (lib/node-schemas/schema.repository) found and fixed along the way.
    - spec:             'jaa-db.spec'
      version:          '6.0.0'
      last_drift_check: '2026-07-24'
      status: >
        ✓ CHECKED, correction — this spec governs the `JaaDB` append-only journal class (`new JaaDB({dir})`, `cortex/memory/jaa-db.js` lines 110-289), confirmed by its exact exports list. It does NOT govern `JaaStore` (`guardian/jaa-store.js`) despite the similar file/name — different class, different persistence model (JSONL append-only vs full-snapshot JSON), no shared code. My prior entry here (same date, since corrected) wrongly attributed `JaaStore`'s undocumented `skipTables` mechanism to this spec as drift. That was wrong — this spec is untouched and accurate for what it actually governs. See the new note below the table for the real, still-open finding: `JaaStore` has no spec at all.
    - spec:             'jaa-store.spec'
      version:          '1.0.0'
      last_drift_check: '2026-07-24'
      status: >
        ✓ NEW — first spec ever written for `guardian/jaa-store.js` (class `JaaStore`), the shared persistence layer for 9+ processes. Written from live code (§3.3), not proposed. Documents the real construction options (`tablePrefix`/`tables`/`skipTables`), the 3-way where-clause dispatch, the multi-process merge-on-flush mechanism, and the 2026-07-24b recursion fix. Two known-open issues named explicitly rather than hidden: the still-unfixed MP-001 concurrent-write race, and `stats()`'s hardcoded table list. Closes the §17.1/§8.5 gap flagged two commits ago.
    - spec:             'lib.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'liminal-space.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'liminal.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'mcp.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'meta-layer.spec'
      version:          '1.2.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'ncp.spec'
      version:          '1.1.0'
      last_drift_check: '2026-08-18 (created same day)'
      status: >
        ✓ written this session, real — closes a real spec.missing gap the gap system itself flagged. Documents the real isConnected() staleness fix (735062f) verified by direct integration test.
    - spec:             'nexus-analysis-module-foundation.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'nexus-architecture-rebuild-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-08-13'
      status: >
        ✓ written and self-checked this session — P1/P2 live-traced from real Windows boot/crash logs (not assumed from reading code), fixed, syntax-verified. P2 cannot be fully live-verified in this environment (no Windows) — needs a real boot to confirm. P3-P7 pending.
    - spec:             'nexus-cli.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'nexus-copilot-recall.spec'
      version:          '1.3.0'
      last_drift_check: '2026-07-13'
      status: >
        ✓ LIVING — all 4 chunks complete. chunk_1 (query_recall, 5 real lanes), chunk_2 (auto-recall context injection — found and fixed 2 real bugs along the way: POST /api/recall silently dropped query/tier from the body since 2026-07-10, and pure recency was crossing the relevance threshold with zero topical signal), chunk_3 (causalPatterns action, named to avoid colliding with the existing 'patterns' action), chunk_4 (GET /api/cortex/lattice — the route query-intelligence.js's lattice action has called since 2026-07-10 and never existed; system-lattice itself was already real and fed). Every chunk verified end-to-end against real code, not asserted from the spec text.
    - spec:             'eravos-agnostic-canvas.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-29'
      status: >
        ✓ NEW — organism/wire/pack/transport already domain-agnostic by construction; proposes CFR field, causal graph, and component/seam map all become organism types in the existing canvas instead of four separate renderers.
    - spec:             'cortex-intelligence.spec'
      version:          '1.0.0'
      last_drift_check: '2026-08-22'
      status: >
        ⚠ PARTIAL, real correction to a stale note — this entry previously said "INTUITION/MASTERMIND are inline functions in cortex/boot.js, not separate files." That's no longer true and, per phase 1's own commit history, was never quite accurate even before — they were always real, separate files (cortex/intelligence/intuition.js, mastermind.js), just instantiated from cortex/boot.js's own closure. As of this session's phase 1 move, both files live at intelligence/intuition.js and intelligence/mastermind.js; cortex/boot.js remains their real, documented composition root. Also closed this session: neither had ever been reachable via HTTP anywhere — real routes now exist on cortex/boot.js (GET /api/intelligence/intuition, POST /api/intelligence/mastermind), verified live.
    - spec:             'versionium.spec'
      version:          '3.1.0'
      last_drift_check: '2026-09-15'
      status: >
        ✓ CHECKED — real, live at versionium/lib/engine.js (port 3754). §6.3 drift check found this entry stale (last read version 1.0.0/2026-06-29, three major versions behind: 2.0.0 VS-reconciliation, 2.1.0 SnapshotGate merge, 3.0.0 sovereign promotion, now 3.1.0). This session closed gap V5 (idearium_snapshots backfill, versionium/lib/migrate-idearium-snapshots.js, mirroring the already-closed V6) and confirmed cortex/versionium/index.js + causality.js remain correctly archived, unexecuted, per §0.3 — see versionium.spec's own 2026-09-15 history entries for the full account.
    - spec:             'warp.spec'
      version:          '1.4.0'
      last_drift_check: '2026-07-24'
      status: >
        ✓ CHECKED — real implementation at `warp/core`, `warp/dispatch`, `warp/plugins` (13 real primitives: Event/Gate/Stream/StreamLog/Axiom + unified dispatch). Was never entered in this registry despite existing and being actively used (idearium's chunk-dispatch: `[idearium/api] WARP chunk dispatch active — exact cache in the build path`, confirmed live in the 2026-07-24 boot log) — §6.3 gap, now closed. Also moved this session from the legacy `warp/warp.spec` to the standard `warp/spec/warp.spec` layout (orchestrator's own spec-drift checker flagged it live: "◇ warp: spec at legacy path... standard is warp/spec/warp.spec"); `warp/MANIFEST.json`'s `spec` field updated to match.
    - spec:             'nexus-decomposition-architecture.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-29'
      status: >
        ✓ NEW — consolidates this session's full design arc (component/seam/wire/variable/UI/event/handoff/hot-swap). Status: proposed, not yet built — see build_order.
    - spec:             'nexus-improvement-roadmap.spec'
      version:          '1.0.0'
      last_drift_check: '2026-06-29'
      status: >
        ⚠ PARTIAL — IMP-02 corrected proposed→built (lib/file-integrity.js, verified). Other 29 items still uniformly 'proposed', not re-audited.
    - spec:             'nexus-organisms.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'nexus-shell-ui.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'nexus-system-foundation-addendum-v1.1.0.spec'
      version:          '1.1.0'
      last_drift_check: '2026-06-29'
      status: >
        ⚠ SUPERSEDED — folded into nexus-system-foundation.spec v1.1.0. Kept as historical record only.
    - spec:             'nexus-system-foundation.spec'
      version:          '1.1.0'
      last_drift_check: '2026-06-29'
      status: >
        ✓ LIVING — this is the spec governing all specs. AX-008/009 promoted in from the addendum, AX-010 added, hooks added to interaction_contract. Addendum file superseded.
    - spec:             'nexus.spec'
      version:          '2.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'ollama.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'orchestrator.spec'
      version:          '2.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'phase-map.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'raid-snr-filter.spec'
      version:          '1.1.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'raid.spec'
      version:          '6.2.0'
      last_drift_check: '2026-06-29'
      status: >
        ✓ CORE BUILT — cortex/core/raid/index.js + cortex/contract/index.js built session 7, 21/21 against pre-existing tests. Layer-2 fitness (role_confidence/topological_proximity/SNR_tier_gate) honestly stubbed — named dependencies not yet built.
    - spec:             'reflection-engine.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'replay-engine.spec'
      version:          '1.1.0'
      last_drift_check: '2026-06-29'
      status: >
        ⚠ PARTIAL — lib/replay-engine.js is real but has zero test coverage in this tree; a prior audit's "16/16 tests" claim actually described a different project (erosmancer-os). Comparison baseline needs re-establishing.
    - spec:             'request-handler.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             '2026-08-22-session-full-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-08-22'
      status: >
        18 phases (SF1-SF18), 17 DONE, 1 OPEN (SF13, orchestrator-agent-pipeline — the real, single largest remaining gap, named directly and left honestly open, not padded to look more complete). Every phase checked against real commit hashes, not recalled from memory — see the file's own header for the discipline. Registered here per the gate's own flag; was written and updated across this whole session but never entered in this table until now.
    - spec:             '2026-08-23-backlog-phasemap.spec'
      version:          '0.2.0-phasemap'
      last_drift_check: '2026-08-29'
      status: >
        32 phases (BL0-BL31) — this row was itself stale before this edit (said "19 phases (BL0-BL18)" while the file already held phases through BL29 from earlier, uncounted work this pass didn't re-audit). This update adds BL30 (registry-components.js drift audit — found clear-glass's own copy stale, 32 declared components missing this session's entire real feature set) and BL31 (Architect as a swappable block canvas, building forward from BL20's already-real read-only graph), both OPEN, BL31 depends_on BL30. Verified against the real, live loom/scanners/phasemap-map.js scanner, not just visually matched to the format — both new phases parse, dependsOn correctly resolves BL31→BL30, systems auto-tagged correctly from the real system names named in each phase's own text.
    - spec:             'session-2026-08-18-axioms-governed-phasemap.spec'
      version:          '1.0.0'
      last_drift_check: '2026-08-18 (created same day)'
      status: >
        ACTIVE — the real, living session record for this checkout lineage (no prior one existed here). Every item checked against real commits, not recalled from memory. Extend in place, no new fragments.
    - spec:             'seam-component-registry.spec'
      version:          '1.1.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'seam-queue.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'seam.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'self-heal.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'service.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'siso.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'snapshot.spec'
      version:          '1.2.0'
      last_drift_check: '2026-06-28'
      status: >
        ✓ mechanical version sync only, no further drift found.
    - spec:             'spatial.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'spec-compiler.spec'
      version:          '1.1.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'spec-drift.spec'
      version:          '1.1.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'telemetry-codec.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'tests.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'topo-kernel.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'ui-location.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'ui-registry.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'ui.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'user-model.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'vector-memory.spec'
      version:          '1.0.0'
      last_drift_check: '—'
      status: >
        not yet checked against live code this pass
    - spec:             'nexus-nerve.spec'
      version:          '0.2.0'
      last_drift_check: '2026-07-01'
      status: >
        ✓ REGISTERED — spec written by James from-scratch (v0.1 lost, §2.1 violation noted in spec itself). Audited against live code this session. Phase 0 (pulse audit) complete — copilot/ollama heartbeats added. Phase 1 (read layer) built: `lib/nerve/index.js`, 16/16 tests passing. Phases 2+ not started. FieldMonitor/Living Glass dedup check (Phase 3) still open — see spec §E.
    - spec:             'nexus-query-surface.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 2 in build order. Prerequisite for everything else in the intelligence layer.
    - spec:             'copilot-system-programmer.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 4. Depends on query surface.
    - spec:             'nexus-project-flow.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 5. Depends on query surface + co-pilot programmer.
    - spec:             'nexus-relationship-shape.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 3. Extends query surface with two-subject support + RFR2 delta wiring.
    - spec:             'nexus-optimization-service.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 6. Depends on all prior phases.
    - spec:             'NEXUS-INTELLIGENCE-LAYER-INDEX.md'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        master index — dependency order, real vs proposed, what it looks like when running.
    - spec:             'NEXUS-LATTICE-COGNITION-ROADMAP-v0_1.md'
      version:          '0.2.0'
      last_drift_check: '2026-07-01'
      status: >
        living roadmap — v0.2 corrects RFR2 mischaracterization and Versionium/snapshot confusion.
    - spec:             'raid-simulation-engine.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — Phase 5 in build order. New module `cortex/core/raid/simulation.js`, wraps _decide() without modifying it. Completes RAID Layer 2 fitness (role_confidence, topological_proximity, snrTierGate become real values).
    - spec:             'rfr2.spec'
      version:          '1.0.0'
      last_drift_check: '2026-07-24'
      status: >
        ✓ DONE — Job 1 (9 modules, commit 9cff74a), Job 2 (harvested causality/sigma/adapter/kernel — 4 modules, not the originally-scoped 3 — then converted clip/compress/context), and Job 2b (harvested `forge` too, the ONE real live external consumer causal-nexus actually has — the 2026-07-21 audit's "2 consumers" claim was itself imprecise, checked directly: the "loom scanner" was a caveat comment, not a real require(); true count was 1, nexus-healer, migrated to the new path) all complete. rfr2 is 14/14 real CJS, zero remaining ESM, all verified by functional execution. Two real converter bugs found and fixed by testing the actual output, not trusting a clean grep: `import {X as Y}` producing invalid CJS destructuring, and `export async function` not being matched at all (silently dropping 4 of forge's 5 exports on the first pass). Real, unresolved version drift flagged (9 modules @5.0.0, 5 harvested @5.0.2) — not silently normalized. `meta/causal-nexus` still holds ledger/persist/projection/loader with zero consumers anywhere outside itself — confirmed dead weight from the rest of the system's view, but retiring the tree is still a real decision, not executed unilaterally from a grep. Suite: 31 rfr2-specific tests (up from 14), 806 total passed / 0 failed.
    - spec:             'nexus-intelligence-system.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — master spec for the 7-layer intelligence stack. Names the three genuine gaps and the dependency-ordered 8-phase build path to close them.
    - spec:             'alk-gl-intelligence-canvas.spec'
      version:          '0.1.0'
      last_drift_check: '2026-07-01'
      status: >
        proposed — new driver module `canvas-intelligence.js` reading from intelligence system instead of audio. ALK-GL, canvas-cfr pattern, Eravos organisms all unchanged. One new data source. Phase 1-6 build order inside.
    - spec:             'hooks-migration.spec'
      version:          '1.0.0'
      last_drift_check: '2026-07-20'
      status: >
        ✓ Phase 1 IMPLEMENTED same session. Registry class → lib/hook-registry.js (git mv); loom = write authority (seed+sync+CRUD/wire); architect = read view + 410 pointer; orchestrator proxy reads→architect writes→loom. Blueprint's registry dep verified decorative (grep -c: 0). 6 ownership tests.
    - spec:             'registry-consolidation.spec'
      version:          '0.1.0-spec'
      last_drift_check: '2026-07-21'
      status: >
        SPEC ONLY, no code. Maps all 3 registries + their real consumers (component: 12+, hook: 6, wire/seam: none-exists). §8.5 mandates the MISSING consumer side. 4 phases, P1 = consumer side on hook-registry (smallest, loom already owns it). Architect-fork objection recorded per §8.2/§17.3, OPEN.
    - spec:             'handshake-ledger.spec'
      version:          '0.1.0-spec'
      last_drift_check: '2026-07-20'
      status: >
        SPEC ONLY, deliberately not built. Signed cross-system handoff receipts; bridge = sole writer (§10.1); RFR2 CQL = verification surface; 5 laws incl. no eternal 'pending'. Written spec-first so it doesn't become unspecced module #13.
    - spec:             'raid.spec` (addendum)'
      version:          '6.3.0'
      last_drift_check: '2026-07-21'
      status: >
        ✓ UPDATED — universal_router addendum. RAID now decides TWO things on independent paths: which AI agent (existing _decide, untouched) and which SYSTEM fulfills a request (new router.js + envelope.js). Verified live vs real 217-cap registry.
    - spec:             'cortex.spec` (addendum)'
      version:          '3.3.0'
      last_drift_check: '2026-07-20'
      status: >
        ✓ UPDATED — organs Phases 0-6 addendum, event-name corrections (deployed contract is `escalation.friction.increased`/`newFric`), foundation fixes (3 jaa-store _matches bugs at source), pressure reflex. Closes one of the 10 drift gaps.
    - spec:             'escalation.spec` (addendum)'
      version:          '1.2.0'
      last_drift_check: '2026-07-20'
      status: >
        ✓ UPDATED — BUILT + new `nexus.resource.pressure` input → memory_pressure fault class. Oscillation damping NAMED as future work, not built.
    - spec:             'self-heal.spec` (addendum)'
      version:          '1.1.0'
      last_drift_check: '2026-07-20'
      status: >
        ✓ UPDATED — BUILT. 5-level ladder, level from fault_taxonomy count, L2 propose-only. SEMANTIC_GAP_TYPES flagged as a §7.2 judgment call, not found spec.
    - spec:             'nexus-tablet.spec'
      version:          '0.4.0-spec'
      last_drift_check: '2026-07-24'
      status: >
        **T1 BUILT + GATE-VERIFIED** (same day, per §8.5 spec preceded build). Read-only /ledger routes on autopilot's status server (disk-backed per the observation law; strict segment allowlist + resolved-path containment §4.3; corrupt lines counted, reported, never repaired §1.2) + `tablet/index.html` — single file, single endpoint (autopilot :7799), zero hardcoded ports, zero state, zero writes. Gate walked live against the real 462-file tree incl. hostile inputs; pinned in `test-tablet-ledger-api.js` (12 tests, registered). Honest limitation recorded: UI verified by contract, not pixels (no browser in sandbox). REST OF SPEC unchanged: container primitive, autopilot broker, observe/mutate boundary, change governance (ledger+registry+cortex), sigma/CFR/RFR2 detection. Blockers still real: B1 single-process consumers, B2 ESM/CJS (**substantially closed by today's rfr2 completion**), B3 UI unverifiable, B4 COS unwired, B5 replay-engine orphaned. T2-T3 have zero blockers, unbuilt.
    - spec:             'nexus-sentinel.spec'
      version:          '0.4.0-spec'
      last_drift_check: '2026-07-24'
      status: >
        **NEW, SPEC ONLY** — the sovereign diagnostic-and-repair system James asked for. Written spec-first (§8.5) after a full scan (§8.4). Key framing: this is a **CONSOLIDATION of four existing surfaces**, not a greenfield build — `service/nexus-diagnostic.js` (2100 lines, supervised, live) is ~80% of it already and becomes the BASE; `cli/diagnose.js` becomes a client that keeps local checks (they work when the service is down); `nexus-healer/` is an orphaned scaffold to absorb-or-delete (§16.5); `cortex/self-heal` moves in (James's call). Building it *beside* nexus-diagnostic rather than *as* it is listed as the primary failure mode. The real gap driving the whole spec: the existing service is **poll-based and never subscribes inward** — a monitor, not a nervous system. Contains 3 scan-found hazards as first-class sections, the blocking one being **liminal-space's in-process subscription to `escalation.friction.increased`**, which a naive folder-move would kill silently. 7 laws (incl. SEN-7: a repair that did not happen cannot report success — earned from three real dead heal paths found the same day). Notifications decided: **yes in the tablet, no owned by the tablet** — the fault goes to the ledger, the notification is a projection read, so it survives a closed tab. 7 phases, S1 CLI-first. **v0.2.0 (same day):** James asked whether it uses the intelligence system and meta/ — answer was NO, a real hole. `cortex/intelligence` already maintains the pattern/failure-mode memory (bep_patterns, failures taxonomy, reuse index) and v0.1.0 would have been a SECOND pattern engine beside it, violating its own SEN-1. Added SEN-8 (never derive what you can consult), an intelligence section, explicit meta/ subsystem mapping (meta/gap as detection substrate, meta/rfr2 for causality, meta/confidence for scoring — noting EVIDENCE_LESS_DISCOUNT as §0.1 in numeric form), and phase S6b. Key finding: intelligence already has HTTP routes on cortex, so unlike self-heal it has NO cross-process hazard. Also verified: `service/nexus-diagnostic.js` references intelligence NOWHERE — an unclosed wire in live code, not just a spec gap. Name settled (James: "Sentinel is fine"), with the `nexus.organism.git-sentinel` near-collision recorded. **v0.3.0 (same day): two corrections from James, both execution-layer errors.** (a) Added SEN-9 decoupling law — bus/API/CLI/SSE only, never `require()` of another system's internals; the violator is CORTEX (`boot.js:113-119` requires the intelligence faculties in-process) while copilot correctly fetches them over HTTP. (b) **Copilot is the MIND, not cortex** — v0.2.0 prose described "asking cortex", inverting the architecture; copilot (port 3750) has its own faculties and queries cortex over HTTP, so cortex remembers and copilot thinks. Also **retracted a false claim**: v0.2.0 said intelligence "already maintains" bep_patterns/failures — it does NOT; `index.js` (933 lines) has never run, `init()` is never called, neither table has ever been created. Scoped turning it on: costs ~one line (init dry-run clean), and the decisive finding is that `copilot/intuition.js` reads `precursor/outcome/confidence` — **bep_patterns' shape** — while `_buildPatterns()` serves it from the `crystals` table, so the mind has always been asking for the core's output and getting a different engine's. **v0.4.0 (same day): James closed the loop** — contract → gated handshake → failed handshake IS a fault → every fault logged+tracked → intelligence reads ledgers AND causal graph → conditions + onset. Added `the_loop`, a universal `ledger_schema`, and phases S5b/S6c. Schema finding: **9 of the 13 requested fields already exist** in `component-ledger.write()`, so this is extend-and-enforce, not design-from-scratch. Pushback applied and recorded: **`next event` REFUSED** (append-only cannot know the future; requires mutating written rows, breaks immutability, and is derivable as `causedBy` reverse-index), **ledger file/dir as fields REFUSED** (already derived by `_partitionPath`; self-referential and drifts — the useful version is `sourceRef`), **embedded `context` REFUSED** (rows are ~303B and the tree is 9.6MB; a blob would roughly triple it — use references), **unconstrained `relation` REFUSED** until the enum types are named. Accepted: **hook + wire** (the strongest item — makes a row locatable in the architecture, recorded nowhere today), constrained `intent`, `faultId` by reference. Two REAL unclosed wires named: **intelligence reads no causal graph** (verified by grep — so "why" is temporal adjacency, not causation, though `meta/cfr/graph.js` CausalGraph with `ancestors()` is already reachable elsewhere in cortex), and **onset is recorded nowhere** — `fault_taxonomy` has `lastSeen`/`count` but no `firstSeen`, so nothing can be correlated to what changed.
    - spec:             'docs/raid-warp-verification-phasemap.spec'
      version:          '0.2.0-phasemap'
      last_drift_check: '2026-07-30'
      status: >
        RAID as the verification spine, governed by AXIOMS-v3.1 (87 laws parsed), new code via WARP logic (warp/core Axiom→Gate→Stream), drift accounted per phase. Supersedes raid-verification-spine v0.1.0. 11 phases (Part I verify spine + Part II co-pilot bridge): record→constitution→COS-isolate→sigma/drift→compare→rewind→one raid.verify() GateFusion; then P8 UI-as-tools, P9 gated-events-to-copilot, P10 diagnose+notify, P11 diagnose+repair-on-prompt (co-pilot as the bridge: user↔UI↔NEXUS). Connects built systems (constitutional-ai, cos/playground, replay-engine, sigma, meta/bda) through RAID. ALL 11 PHASES BUILT 2026-07-30, suite 1168/0. raid.verify() is the fused entry; copilot/assist-loop.js + repair-on-prompt.js are the bridge.
    - spec:             'docs/cortex-schema-registry-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-07-30'
      status: >
        Schemas-per-system as expectation + integrity, living IN cortex as EDITABLE rows. FLUID not rigid: describes shape, observes writes, records deviation as drift data — NEVER blocks. Addresses "no flat" — jaaDB.insert validates nothing today. 5 phases: schema table in cortex → conformance-check lib (agnostic, lib/) → observe-on-write (non-blocking) → editable surface → expectation for consumers (makes user-model trustworthy). Builds outward from config-schema.validateConfig + SYSTEM-CONTRACTS (already names SCHEMA_VIOLATION). P1-P3 + UM1-UM4 BUILT 2026-07-30 (lib/schema-registry.js, user-model schema-observed + queried-everywhere + richer-capture + editable surface), suite 1168/0.
    - spec:             'docs/copilot-awareness-routing-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-07-30'
      status: >
        Co-pilot self-awareness + intent routing. 7 phases: CA1 status-report (poll system+loom on "how are you"), CA2 tool self-awareness (edge cases + how-to-use), CA3 tool-first (look for a tool before fallback), CA4 capability-extend ("no is not an answer" → gap/module_builder), CA5 intent routing (perplexity=data, claude=big-code+WARP, chatgpt=optimal-900tok-chunked, gemini=coding/adversarial-secondary, claude=last), CA6 routing config (editable cortex rows), CA7 ClearGlass multi-account gear. Extends routing-ir + intent-classifier (exist). CA1 building now.
    - spec:             'docs/nexus-observability-tablet-phasemap.spec'
      version:          '0.1.0-phasemap'
      last_drift_check: '2026-07-30'
      status: >
        Per-system tablet modules + full live diagnostics + movement mapping + real 3D visual. 9 phases / 5 chunks: E diagnostics (OB1 live diag + OB2 gap-detection), F movement (OB3 registry→CFR/ALK-GL map + OB4 bottleneck via sigma/delta/friction), G tablet (OB5 per-system modules+escalation + OB6 continuous ollama injection), H intelligence (OB7 optimization + OB8 pattern leverage ratio), H also OB10 sigma-role intent-map (sigma=deviation/performance/expectations/drift/leverage per component) + OB11 edge-case mapping. I visual (OB9 real 3D map, no mocks). Grounded in EXISTING substrate: tablet/ UI, cfr/field.js (friction/tension), sigma, capability-registry, cortex/intelligence, gap-hunter. Wiring+expansion, not greenfield. Map only.
    - spec:             'docs/component-registry.spec` (ADDENDUM 2026-07-30)'
      version:          '+CodeFactory'
      last_drift_check: '2026-07-30'
      status: >
        FORGE-CodeFactory alignment: tier (component/mod, mod requires ≥1 component producer — enforced at register), seam boundary contracts (derivative of seam-block, not a second schema), similarity-sigma vs drift-sigma (two DISTINCT scalars — dedup/clustering vs baseline-drift; maps onto OB10 sigma-roles), promotion states (observed→candidate→pattern→component→module, evidence-required), anti-generalization guard (high structure + low semantic = do not merge). §10.3 stance: CodeFactory does NOT replace Architect/Eravos — loom stays registry-truth, Architect stays topology-declarer, CodeFactory Blueprint is a PRODUCER into loom. Design decision recorded, not enacted.
    - spec:             'codefactory/codefactory.spec.md'
      version:          'v0.16'
      last_drift_check: '2026-07-30'
      status: >
        FORGE-CodeFactory combined spec (v0.15 living doc + Sigma Similarity 2c merged at its specified insertion point after 2b; 2c open questions folded into 8). Visual block/module code builder, no AI runtime dependency. 8 layers (0-7) + cross-cutting mandates 2a/2b/2c. Lives in codefactory/ folder. Registry-alignment recorded in component-registry.spec addendum. Phase 0 (Orient) — map only, no build.
    - spec:             'lib/activity-log'
      version:          '1.0.0'
      last_drift_check: '2026-08-04'
      status: >
        Per-system activity + error logging into cortex, riding the ledger fan-in. Full activity → event_log, errors → error_log, tagged by system, history preserved (append-only). Per-system enable/disable.
    - spec:             'lib/ledger-fanin'
      version:          '1.0.0'
      last_drift_check: '2026-08-04'
      status: >
        Unified event fan-in — every system emits, intelligence/autopilot/co-pilot subscribe once, see everything. coverage() names silent systems (the detection gap).
    - spec:             'CLAUDE.md'
      version:          '—'
      last_drift_check: '2026-08-04'
      status: >
        The persistent working agreement: map first, reuse first, wire the registry, addend specs, lose nothing. Read every session. Enforced by scripts/precommit-check.js.
    - spec:             'docs/nexus-live-mind-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-07'
      status: >
        The full vision mapped before build: P1 nervous system live (fan-in→intelligence/autopilot/copilot/logging), P2 snapshot-on-sigma, P3 diagnostic kernel (RFR2+CFR+loom+intelligence, causal conditions), P4 co-pilot system-aware (loom+diagnostic+intelligence, full toolbox), P5 co-pilot dynamic+user-aware (user-model), P6 co-pilot programmable (schedule/automate/workflows/switch-agent, RAID-governed). Dependency order P1→P6. Substrate already built this session; phases wire it.
    - spec:             'docs/gemini-multiagent-coding-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-07'
      status: >
        Multi-agent Gemini coding framework (James's structured-injection blueprint): P1 per-agent contracts (identity/axioms/scoped-toolbox/injected-context, extends gemini-toolbox CONTRACT + agent-router AGENT_CONSTRAINTS), P2 tree/parse/cortex-recall injection tool, P3 line/block/seam sync (extends the toolbox's line addressing), P4 structured JSON agent-to-agent, P5 autonomous multi-agent loop (via lib/autonomous-loop + RAID gate). Answers chunk-vs-seam, emerge-vs-cockpit. Dependency order P1→P5. Substrate largely exists (§8.6).
    - spec:             'docs/agent-intelligence-loop-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-07'
      status: >
        Wiring the multi-agent layer into NEXUS's live intelligence substrate (fan-in + RFR2 + CFR + cortex dynamic DBs + RAID) so injection strategy is LEARNED per agent, not hardcoded. James's clarified vision: push+pull context delivery, intelligence optimizing around each agent's constraints automatically, strategy as an evolving cortex database, RAID-governed. AP1 pull toolbox → AP2 agent events to intelligence → AP3 strategy dynamic DB → AP4 intelligence optimizes → AP5 autonomous build loop. Expands P3-P5 of gemini-multiagent-coding. All substrate exists (§8.6) — this is wiring, no new brain.
    - spec:             'docs/raid-routing-fidelity-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-08'
      status: >
        RAID as the governing routing layer: chunk→contract→RAID→best agent by signal-to-noise + fidelity. Major §8.6 finding: the SNR/fidelity gate (cortex/core/raid/snr-filter.js), per-agent token configs (agent-router), multi-account login (account-registry), and guardian↔clear-glass bridge ALREADY EXIST — ~70% wiring. Phases: RR1 verify/wire SNR-fidelity gate, RR2 contract-based token-sized chunking, RR3 per-agent config in cortex, RR4 governed handshake on handoff (+ enforcement-index.js), RR5 clear-glass accounts/features, RR6 cortex-fitness (= agent-intelligence-loop AP4 system-wide), RR7 per-system tablet dashboards (checkmk-style). Converges with agent-intelligence-loop at fitness.
    - spec:             'docs/loom-phasemap-section-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-08'
      status: >
        LP1+LP2+LP3 ALL DONE 2026-08-08. Consolidates all 16 phasemaps → splits phases by system → live in loom as a section. loom/scanners/phasemap-map.js (LP1+LP2) + /api/phasemap + /api/phasemap/:system in loom/server.js, registered in loom/registry-components.js v1.3.0, live view-roadmap in loom/ui/index.html (LP3). 8 tests (loom/test/phasemap-map.test.js). Verified live: 102 phases / 16 phasemaps / 19 systems, 58 done / 2 in progress / 42 pending. Spec closed.
    - spec:             'docs/nexus-system-standardization-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-08'
      status: >
        THE TARGET ARCHITECTURE: every system standardized — own folder, config, event-driven handshake-gated interaction contracts, full logging (error.log + event ledger + SSE to cortex), diagnostics-reads-and-fixes, dynamic commands, persistent cortex data, hashed integrity, fully decoupled via contracts/APIs. Census shows the pattern exists in fragments (guardian has config+contract, others don't) — this STANDARDIZES it. SS0 clear clutter → SS1 manifest → SS2 config → SS3 handshake contracts → SS4 logging → SS5 diagnostics-fix → SS6 dynamic/fluid → SS7 decoupling audit. The spine all other maps hang on. SS6 converges with raid-routing RR6 + agent-loop AP4.
    - spec:             'docs/copilot-autonomous-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-08'
      status: >
        ALL SEVEN PHASES DONE 2026-08-08 — spec closed. CA1 scheduler, CA2 triggers/conditions, CA3 pipeline chains, CA4 http/sse connections, CA5 system control + governed clear-glass/DOM, CA6 self-building commands, CA7 constant autonomy. lib/scheduler.js, lib/triggers.js, lib/chains.js, lib/connections.js, lib/system-control.js, lib/command-builder.js, lib/constant-autonomy.js — all registered in loom/maps/observability-map.js. 67 tests total (7+10+8+8+10+14+10), all passing against real substrate (real HTTP/SSE servers, the real live capability registry, real autonomous-loop execution). Four spec assumptions checked against real code and corrected where wrong; two real bugs caught by tests before shipping; one pre-existing unrelated bug in compartment-engine surfaced and noted, not scope-crept into fixing.
    - spec:             'docs/repair-contract-and-loom-hub-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-12'
      status: >
        MAPPED, NOT BUILT — §3.3, map before build. Six phases, bottom-up: R1 repair contract schema (extends gap-field), R2 real cortex/snapshot rollback (the one genuine gap — everything else here is disconnection, not absence), R3 wires repair-on-prompt.js (real, correct, zero callers) to fire autonomously from a detected gap instead of only a typed prompt, R4 loom reads the real 15,472-row component-ledger it has never once queried, R5 the zoomable node map over loom's already-real registry data, R6 generated (not hand-written) documentation over R4+R5. Found along the way: repair-on-prompt.js's own header already assumes real snapshots exist for rewind-on-fail (R2 blocks R3), and a data-quality issue in component_ledger (session ids leaking into the systemId field). Three open questions logged in the spec itself, not silently assumed.
    - spec:             'docs/agent-model-and-user-continuity-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-13'
      status: >
        MAPPED, NOT BUILT (AM4 DONE). 10 phases now (AM1-AM10). AM10 new: (a) thinking-partner mode — "keep mental note"/contract feedback/"continue from last time"/brainstorm, each composing a real existing mechanism (push-recall, reflection.js's satisfaction slot, AM7's session continuity, AM3's classifier) rather than one new feature; (b) rename command — backend ALREADY REAL (self-model.js:97,111 getIdentityName/setIdentityName) but confirmed UNWIRED to any conversational trigger (zero hits in copilot/server.js), unlike switchAgent which is wired; (c) UI builder from a shared spec/design philosophy, reusing SB2/SB3 from the sibling phasemap. langgraph_comparison note removed per direct correction — it was a passing statement, not a spec ask.
    - spec:             'docs/nexus-self-build-pipeline-phasemap.spec'
      version:          '0.1.0 PHASEMAP'
      last_drift_check: '2026-08-13'
      status: >
        MAPPED, NOT BUILT — §3.3. 9 phases now (SB1-SB9). SB7 compartments-as-sessions: elevates COS's real create/start/stop/destroy compartment lifecycle into a conversational primitive (axioms+endState prompt reusing lib/emergence.js's real shape), 24h decay via lib/scheduler.js, ledger+cortex-index on creation, both sides removed together on delete. SB8: tool-agnosticism logging (extends tool-index.js's real row shape) + "make me a tool" — ALREADY REAL, copilot/module-builder.js's own header is literally map->spec->QC->contract->build->verify->merge, reused not rebuilt + honest Tasker-vs-CA1-7 comparison deferred, not assumed + calendar tool confirmed a real gap (schedule-task.js is task-scheduling, not a calendar). SB9: the element picker is not a gap, it's an ORPHAN — verified across 4 real files (clear-glass/src/dom/archaeology.js emits real dom.picked/dom.pick.registered SSE, real gate, real IPC handler, real browser-action tool action) that copilot/server.js never subscribes to (zero hits grepped directly) — this phase is one missing SSE listener between two fully-real systems, not new picker infrastructure.
    - spec:             'docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec'
      version:          '1.0.0'
      last_drift_check: 'mapped-not-built'
      status: >
        James's full-scope ask this session: Versionium promoted to a sovereign system (VS1-VS4), agent-suite consolidation decision (LM_AGENT_1), clear-glass process manager + native features + adblocker (CG1-CG3), cortex 3-tier memory + ledger reorg (MEM1-MEM3), and a 9-item filesystem cleanup track (CLEANUP1-9: .md migration, lib/orchestrator reorg, migrate-or-remove triage, guardian decomposition, clear-glass registry dedup, UI-to-system moves, hotswap living contracts, archive history backfill, agent context reduction). MAPPED, NOT BUILT, per §8.5 — this session's real, verified work (idearium fix confirmation, Versionium state/getState merge) landed outside the phasemap since it was bounded and didn't need mapping first.

  # ── The 16 later §REGISTERED batch entries (LM1, versionium-sovereign) ──
  registered_batches:
    - spec:             'docs/pressure-causality.spec'
      version:          '0.1.0'
      status:           'Specified'
      last_drift_check: '2026-08-18 (written)'
      governs: >
        resource-monitor, autopilot exit path, CFR/RFR2/sigma query surface
    - spec:             'docs/clear-glass-toolkit.spec'
      version:          '0.1.0'
      status:           'Specified'
      last_drift_check: '2026-08-18 (written)'
      governs: >
        clear-glass driver + copilot tool surface, screenshot/picker destination
    - spec:             'docs/idearium-agent-pipeline.spec'
      version:          '0.1.0'
      status:           'Specified'
      last_drift_check: '2026-08-19 (written)'
      governs: >
        idea/spec → compartment → chunks → ChatGPT → wake loop → staged drop
    - spec:             'docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec'
      version:          '0.1.0-phasemap'
      status:           'PHASEMAP'
      last_drift_check: '2026-08-27 (written; 8 phases verified parsing correctly against loom/scanners/phasemap-map.js''s real loadAll() before commit)'
      governs: >
        Per-system event taxonomy (guardian, clear-glass, orchestrator each own their own event-taxonomy.js; loom gets a read-only aggregation scanner mirroring phasemap-map.js) + sigma gates built on top; remainder of James's 2026-08-27 architecture brainstorm, cross-referenced against already-tracked phase IDs rather than duplicated
    - spec:             'docs/2026-08-28-self-building-pipeline-phasemap.spec'
      version:          '0.1.0-phasemap'
      status:           'PHASEMAP'
      last_drift_check: '2026-08-28 (written; 6 phases verified parsing correctly against loom/scanners/phasemap-map.js''s real loadAll() before commit)'
      governs: >
        Full loom/idearium -> compartment -> repository -> spec -> chunk -> contract -> RAID -> agent pipeline, grounded bottom-up per axiom §3.1. Confirmed real, already-built pieces cross-referenced not duplicated (Versionium all 4 steps, RAID's dependency graph, BR5 agent-aware chunking, COS's blueprint/archetype system, routing-ir.js's agent-preference support)
    - spec:             'docs/2026-08-28-definition-of-complete-phasemap.spec'
      version:          '0.1.0-phasemap'
      status:           'PHASEMAP'
      last_drift_check: '2026-08-28 (written; 8 phases verified parsing correctly against loom/scanners/phasemap-map.js''s real loadAll() before commit — caught and fixed a real false-positive: the literal substring "STARTED" inside the honest phrase "not yet started" flipped a phase''s real status to IN-PROGRESS in the scanner''s own heuristic)'
      governs: >
        James's own stated conditions for NEXUS to be considered complete (autonomy, self-repair, build-from-idearium, build-from-loom, living model, axiom compliance, COS-based testing, contract/comparison/drift engines) — each graded honestly against real current state, cross-referenced to already-tracked real phases rather than restated
    - spec:             'docs/2026-08-30-interaction-contract-context-phasemap.spec'
      version:          '0.1.0-phasemap'
      status:           'PHASEMAP'
      last_drift_check: '2026-08-30 (written; 4 new phases + RR4''s own expansion verified parsing correctly against loom/scanners/phasemap-map.js''s real loadAll() before commit)'
      governs: >
        Real, distinct pieces of James's handshake/context/introspection ask NOT already covered by RR4 (handshake, expanded in the same commit) or the uploaded audit's #23 (adaptive-fulfillment, already built): context-by-UUID injection into agent chats, RAID's real test-env hook (cross-ref DOD7), a per-system intention taxonomy, and idearium's system template update — the last two deliberately sequenced after the others, not designed or written blind ahead of real usage data
    - spec:             'docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec'
      version:          '0.2.0-phasemap'
      status:           'PHASEMAP'
      last_drift_check: '2026-09-19 (LM18-LM26 added; verified as valid YAML with all 26 phase keys + recommended_start present, and phasemap-map.js loadAll() in loom reading all 26, before commit; 2026-09-01: written with LM1-LM17)'
      governs: >
        26 phases (LM1-LM26) mapping James's registry-as-hub/watchdog-propagation, .spec-as-living-model, per-system tool index, RAID contract authorship, full agent-mesh pipeline wiring, deterministic agent-switch CLI, per-agent wake words, co-pilot ollama/guardian toggle, and successful-prompt caching via the crystallization engine — plus a longer secondary list (guardian agents-folder refactor, components store, master settings, per-system data decay). Each phase's status names the specific real, already-confirmed precedent it builds on, or states plainly that none was found and a design pass is needed first. recommended_start: LM1 first; LM9/LM10/LM12 independently buildable now; LM7/LM8 correctly depend on LM6 (contract-authorship) per this codebase's own RAID-governance ordering; LM18/LM19 (atlas survey + spec coverage) buildable now and gate LM20-LM26. LM18-LM26 (added 2026-09-19): a living, recursive, human-readable atlas per system for guardian, ollama, cortex, intelligence, diagnostic, clear-glass, loom and copilot — survey first (LM18), spec coverage (LM19), schema plus deterministic seed (LM20), FACTS extractors (LM21), structure ledger (LM22), history and calendar (LM23), PROSE layer (LM24), living update (LM25), completeness and release gate with an AX-015 draft (LM26). Mapped only, nothing built.
    - spec:             'docs/nexus-system-foundation-addendum-v1.3.0.spec'
      version:          '1.3.0'
      status:           'proposed'
      last_drift_check: '2026-09-01 (written against nexus-system-foundation@1.1.0)'
      governs: >
        Adds AX-013: three new, additive per-system spec sections (`history`, `gaps`, `version_history`) — the real schema LM1 called for. Additive/revertible, same convention as the v1.2.0 addendum.
    - spec:             'clear-glass/spec/clear-glass.spec'
      version:          '3.1.0'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        First real spec for clear-glass — written FROM the live `clear-glass/registry-components.js` contract (67 components), not from scratch.
    - spec:             'loom/spec/loom.spec'
      version:          '1.5.0'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        First real spec for loom — routes traced directly from `loom/server.js`.
    - spec:             'docs/grammar-fallback.spec'
      version:          '1.0.1'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        guardian's CLI grammar-resolution fallback (`guardian/lib/grammar-fallback.js`). Library module, not a service — placed in `docs/` per spec-drift.js's docs-fallback matching (no top-level dir of this name).
    - spec:             'docs/mutation-contract.spec'
      version:          '1.0.1'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        orchestrator's component-mutation governance layer (`orchestrator/lib/mutation-contract.js`), implementing seam-component-registry-spec.md §9.5.
    - spec:             'docs/open-loop-taxonomy.spec'
      version:          '1.0.0'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        The 10-type/5-state open-loop taxonomy (`lib/open-loop-taxonomy.js`) — 8 confirmed real consumers.
    - spec:             'docs/loop-topology.spec'
      version:          '1.0.0'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        Focal-point/leverage-scoring module (`lib/loop-topology.js`). **Real finding**: zero confirmed live consumers — built and tested per its own header, genuinely disconnected. Flagged as gap LT1, not wired this pass.
    - spec:             'docs/gap-finder.spec'
      version:          '1.1.0'
      status:           'active'
      last_drift_check: '2026-09-01'
      governs: >
        Cortex's gap-emission organ (`cortex/gap-finder/index.js`) — listens for `anomaly.detected`/`sigma.event.*`, dedups against the live `gaps` table.
    - spec:             'docs/2026-09-11-brainos-agent-orchestration-phasemap.spec'
      version:          '0.1.0'
      status:           'active'
      last_drift_check: '2026-09-12'
      governs: >
        BrainOS agent-orchestration build order (5 phases) — supersedes docs/brainos-live-control-panel.spec. §REGISTERED 2026-09-12 (was missing from this registry entirely, caught by precommit-check.js's own §6.3 rule). Drift found and closed same pass: phase 1 (context menu) and phase 2 (routing/pipeline edges) were still marked BUILDING/SPECCED though shipped in 0.39.87/0.39.88 — both corrected to DONE with version references.
    - spec:             'docs/2026-09-11-brainos-external-concept-mapping.spec'
      version:          '0.1.0'
      status:           'active'
      last_drift_check: '2026-09-12'
      governs: >
        Maps an uploaded external BrainOS reference project's concepts onto real NEXUS equivalents (mapping only, nothing built by the spec itself). §REGISTERED 2026-09-12 (same missing-registration gap as the sibling orchestration-phasemap spec above). Drift found and closed same pass: the trigger/scheduler/branching GENUINE_GAP entry was still open though closed by automation-engine.js in 0.39.89/0.39.91 — corrected to CLOSED with version references and the real remaining scope (branch/http/notification step types) named explicitly.
    - spec:             'docs/idearium-repository-overhaul-phasemap.spec'
      version:          '0.2.0-phasemap'
      status:           'active'
      last_drift_check: '2026-09-15'
      governs: >
        §REGISTERED 2026-09-15 — copied into docs/ from a separate
        session-handoff bundle where it previously lived disconnected
        from this repo (§2.1/§6.3 — a spec not in this tree and not in
        this registry is unaccounted for). 13-MCO merged phasemap for
        turning idearium into a full creative-repo host. MCO0 (real-code
        audit) and MCO-A (schema.phase_node + schema.file_delta
        registered) DONE; MCO-B through MCO-G remain NOT STARTED per the
        file's own build_order.
    - spec:             'docs/idearium-creative-repo.spec'
      version:          '1.0.0'
      status:           'active'
      last_drift_check: '2026-09-15'
      governs: >
        §REGISTERED 2026-09-15, same reason as its sibling phasemap
        above. Canonical spec the merged phasemap's MCOs build toward —
        depends_on nexus-repository-system.spec/versionium.spec/
        idearium.spec/loom.spec, owns nothing they already own. Core
        axiom ICR-001 NO_PHANTOM_PROGRESS, invariants ICR-001..014.

  # ── Full original document, preserved verbatim — every narrative session
  # log, every filename mentioned only in prose, zero information loss.
  # This is the authoritative historical record; registry: above is a
  # queryable projection of its tables, not a replacement. ──
  original_full_text: |
    # NEXUS Spec Registry
    **Author:** James Brooks (Erosmancer)
    **Created:** 2026-06-29 (session 8)
    **Status:** Living document — §6.3 (`docs/AXIOMS-v3.1.md`). Every `.spec` file
    is entered here on creation. This registry is updated every time a spec is
    checked for drift, not just when it's written — a spec not in this table
    is unaccounted for.
    
    **§AXIOMS CONSOLIDATION 2026-08-13** — two live copies of `AXIOMS-v3.1.md`
    existed (repo root, 44906 bytes, 2026-08-01; `docs/`, 43764 bytes,
    2026-07-24) and disagreed: the root copy had §8.6 ("Reuse Before Build")
    entirely, the `docs/` copy didn't. A real §10.3 violation ("competing truth
    layers are a system failure") at the most foundational level possible — the
    law disagreeing with itself. Fixed: the newer, complete copy is now the
    single file at `docs/AXIOMS-v3.1.md`; the stale one is archived (never
    deleted, §0.3) at `_archive/superseded-docs-2026-08-13/`. This registry's
    own header line above was also citing the superseded v3.0 as authority —
    corrected to v3.1, the version its own preamble says supersedes v1.0-v3.0.
    No live code referenced the old root path (checked directly, zero hits).
    
    **88 spec files exist in `docs/` as of this session.** Most have not been
    checked against live code in this conversation — that's stated honestly
    below, not glossed over. 17 have been, with real findings, across sessions
    3 through 7. The other 71 are real work still ahead, not assumed clean.
    
    ## Status legend
    - ✓ — checked against live code, no drift found (or drift found and closed)
    - ⚠ PARTIAL — checked, some drift found, not fully resolved
    - ✗ DRIFTED — checked, real drift found, open
    - — not yet checked this pass — no claim either way
    
    ---
    
    | Spec | Version | Last drift-check | Status |
    |------|---------|-------------------|--------|
    | `alk-perception.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `api-dispatch.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `architect.spec` | 1.0.0 | 2026-06-28 | ✗ DRIFTED — 3-way version split: spec says 2.0.0, lib/version.js says 1.0.0, service.js boot event hardcodes '3.0.0'. Not yet reconciled. |
    | `auth.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `autonomous-loop.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `bda.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `behavioral-boundary.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `blueprint.spec` | 1.1.0 | — | not yet checked against live code this pass |
    | `bridge.spec` | 3.0.0 | 2026-06-28 | ⚠ PARTIAL — described routes not found in live registry-components.js. Mechanical version sync applied, route drift not. |
    | `builder.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `case-library.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `cfr-contract-wire.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `cfr.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `chat-logger.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `clearglass-agent-suite-and-cfr-loom-phasemap.spec` | 0.1.0-phasemap | 2026-08-17 | 10 phases (TX1-TX10) from a parallel live session's real transcript plus two new asks. 1 DONE (TX5, the cos.spec/snapshot-engine backup work already covers the "backup the system" ask, confirmed against earlier this session's own investigation), 1 PARTIAL (TX3, a real switchTo(id) tab-switch precedent found in clear-glass/renderer/browser.js — the launcher is smaller than it looked), 8 OPEN including a real schema mismatch found by the parallel session (hat-forge's VALID_BASE_AGENTS allows ollama/mistral, account-registry has no slot for either — needs a decision, not an assumption) and a real precedent for the loom-3D-CFR ask (eravos/ui/runtime/canvas-cfr.js, a genuine 192-line working WebGL canvas, confirmed by reading it directly — an adaptation, not a from-scratch build). |
    | `cli-reasoning.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `cli.spec` | 1.4.0 | — | not yet checked against live code this pass |
    | `component-registry.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `copilot-tool-system.spec` | 0.1.0 | 2026-08-19 | Spec for the real, expanded co-pilot tool system — agent-tools, agent-reach.js, tool-forge, copilot/lib/autonomy-router.js, and the guardian NCP surface. Found genuinely missing from this registry by the precommit hook after merging in nexus0822/master; registered without re-auditing its full internal content this pass. |
    | `constitutional-ai.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `context-builder.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `contract-queue.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `contracts.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `copilot-expansion.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `copilot-full-capability-phasemap.spec` | 0.1.0-phasemap | 2026-08-12 | ✓ ALL 11 PHASES DONE — written and self-checked this session, every substrate claim verified live before writing, then every phase live-verified as built. P7 (the last, hardest phase) had a real route-ordering bug found and fixed by live end-to-end testing before being marked done. |
    | `copilot-guardian-cos-expansion-phasemap.spec` | 0.1.0-phasemap | 2026-08-17 | 10 phases (GA1-GA10) compiled from the person's own screenshots of a parallel conversation, each checked against real code before being marked done/partial/open, not trusted from the screenshots' framing alone. 2 DONE (GA2 diagnostic-report.js real; GA5 git history confirmed intact, 314 commits unbroken), 4 PARTIAL, 4 OPEN. Also found and flagged (not fixed here): loom/scanners/phasemap-map.js's status parser only recognizes explicit ←DONE/✓DONE/#DONE/COMPLETE markers — even the established SB1_schema_extension phase (nexus-self-build-pipeline-phasemap.spec) parses as "pending" under the real scanner despite being genuinely complete, meaning loom's own done-counts likely undercount real completed work across this whole registry, not just this file. |
    | `copilot-omniscience-phasemap.spec` | 0.1.0-phasemap | 2026-07-30 → 2026-08-12 | ✓ ALL 7 PHASES DONE — pre-existing file from 2026-07-30, was missing from this registry until now. P1's inline DONE marker was also missing (P2-P7 had one, P1 didn't) despite the file's own header already claiming all 7 done — fixed same commit, confirmed live first (copilot/server.js:1222 -> tool-runtime.js -> runToolLoop). |
    | `copilot-migration-and-new-capabilities.spec` | 1.1.0 | 2026-06-29 | ✓ filed session 6 — MIG-01 resolved, MIG-02 resolved differently than proposed, MIG-03 unverifiable (file not in tree), capability_cli_authoring built session 6. |
    | `copilot.spec` | 2.0.0 | — | not yet checked against live code this pass |
    | `cortex-dual-cognition.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `cortex.spec` | 3.2.0 | 2026-06-29 | ⚠ PARTIAL — version synced session 3. Phase 84/85 intelligence description overstated vs. code (session 6 finding) — not yet corrected here. |
    | `cos.spec` | 1.5.0 | — | not yet checked against live code this pass |
    | `diagnostic-engines.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `diagnostic-fixes.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `diagnostic-phase-map.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `diagnostic.spec` | 1.0.0 | 2026-06-28 | ✗ DRIFTED — describes a registry-components.js and handshake that don't exist in code. Flagged, not fixed (code gap, not a doc fix). |
    | `emerge.spec` | 1.0.0 | 2026-06-28 | ⚠ PARTIAL — described routes not found in live registry. Mechanical sync only. |
    | `eravos.spec` | 3.0.0 | 2026-06-28 | ✓ written fresh session 3 — no prior spec existed, generated from the live exported module. |
    | `erosmancer.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `escalation.spec` | 1.1.0 | 2026-06-28 | ✓ mechanical version sync only, no further drift found. |
    | `forge.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `gap-lifecycle.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `grammar-engine.spec` | 1.2.0 | 2026-06-28 | ✓ mechanical version sync only, no further drift found. |
    | `guardian-user-understanding.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `guardian.spec` | 3.6.1 | 2026-06-28 | ✓ mechanical version sync only, no further drift found. (2026-10-02 GA1: docs/guardian.spec is now a pointer to guardian/spec/guardian.spec 3.19.1) |
    | `healer.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `heartbeat.spec` | 2.0.0 | — | not yet checked against live code this pass |
    | `home-ui.spec` | 1.4.0 | 2026-09-25 | file layout checked against code (v0.39.228 split); phase 2 found broken and fixed |
    | `hooks.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `hot-module-loader.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `idearium.spec` | 3.0.0 | 2026-06-29 | ✓ AX-008 closed session 5/7 (idearium→copilot wire built and verified) — this spec's axioms list updated to match. |
    | `intelligence-bridge.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `intelligence.spec` | 1.0.0 | 2026-09-19 | ✓ CHECKED, extended — added built_2026_09_19_pulse_and_nodes: intelligence wired into the real orchestrator pulse/heartbeat system, plus intelligence/lib/domain-nodes.js closing the node-taxonomy's own "node: NOT USED" finding with schema-validated .gap/.bep_pattern/.pattern_sequence/.resonance_crystal exports. See intelligence.spec's own new section for the full record. |
    | `jaa-db.spec` | 6.0.0 | 2026-07-24 | ✓ CHECKED, correction — this spec governs the `JaaDB` append-only journal class (`new JaaDB({dir})`, `cortex/memory/jaa-db.js` lines 110-289), confirmed by its exact exports list. It does NOT govern `JaaStore` (`guardian/jaa-store.js`) despite the similar file/name — different class, different persistence model (JSONL append-only vs full-snapshot JSON), no shared code. My prior entry here (same date, since corrected) wrongly attributed `JaaStore`'s undocumented `skipTables` mechanism to this spec as drift. That was wrong — this spec is untouched and accurate for what it actually governs. See the new note below the table for the real, still-open finding: `JaaStore` has no spec at all. |
    | `jaa-store.spec` | 1.0.0 | 2026-07-24 | ✓ NEW — first spec ever written for `guardian/jaa-store.js` (class `JaaStore`), the shared persistence layer for 9+ processes. Written from live code (§3.3), not proposed. Documents the real construction options (`tablePrefix`/`tables`/`skipTables`), the 3-way where-clause dispatch, the multi-process merge-on-flush mechanism, and the 2026-07-24b recursion fix. Two known-open issues named explicitly rather than hidden: the still-unfixed MP-001 concurrent-write race, and `stats()`'s hardcoded table list. Closes the §17.1/§8.5 gap flagged two commits ago. |
    | `lib.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `liminal-space.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `liminal.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `mcp.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `meta-layer.spec` | 1.2.0 | — | not yet checked against live code this pass |
    | `ncp.spec` | 1.1.0 | 2026-08-18 (created same day) | ✓ written this session, real — closes a real spec.missing gap the gap system itself flagged. Documents the real isConnected() staleness fix (735062f) verified by direct integration test. |
    | `nexus-analysis-module-foundation.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `nexus-architecture-rebuild-phasemap.spec` | 0.1.0-phasemap | 2026-08-13 | ✓ written and self-checked this session — P1/P2 live-traced from real Windows boot/crash logs (not assumed from reading code), fixed, syntax-verified. P2 cannot be fully live-verified in this environment (no Windows) — needs a real boot to confirm. P3-P7 pending. |
    | `nexus-cli.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `nexus-copilot-recall.spec` | 1.3.0 | 2026-07-13 | ✓ LIVING — all 4 chunks complete. chunk_1 (query_recall, 5 real lanes), chunk_2 (auto-recall context injection — found and fixed 2 real bugs along the way: POST /api/recall silently dropped query/tier from the body since 2026-07-10, and pure recency was crossing the relevance threshold with zero topical signal), chunk_3 (causalPatterns action, named to avoid colliding with the existing 'patterns' action), chunk_4 (GET /api/cortex/lattice — the route query-intelligence.js's lattice action has called since 2026-07-10 and never existed; system-lattice itself was already real and fed). Every chunk verified end-to-end against real code, not asserted from the spec text. |
    | `eravos-agnostic-canvas.spec` | 1.0.0 | 2026-06-29 | ✓ NEW — organism/wire/pack/transport already domain-agnostic by construction; proposes CFR field, causal graph, and component/seam map all become organism types in the existing canvas instead of four separate renderers. |
    | `cortex-intelligence.spec` | 1.0.0 | 2026-08-22 | ⚠ PARTIAL, real correction to a stale note — this entry previously said "INTUITION/MASTERMIND are inline functions in cortex/boot.js, not separate files." That's no longer true and, per phase 1's own commit history, was never quite accurate even before — they were always real, separate files (cortex/intelligence/intuition.js, mastermind.js), just instantiated from cortex/boot.js's own closure. As of this session's phase 1 move, both files live at intelligence/intuition.js and intelligence/mastermind.js; cortex/boot.js remains their real, documented composition root. Also closed this session: neither had ever been reachable via HTTP anywhere — real routes now exist on cortex/boot.js (GET /api/intelligence/intuition, POST /api/intelligence/mastermind), verified live. |
    | `versionium.spec` | 1.0.0 | 2026-06-29 | ✓ NEW — no implementation exists under this name (lib/version.js is a flat string). Real shape built from primitives already proven this session: idearium's commit graph (branch/parentId bug still open), file-integrity's hashing, rfr2-nexus's compress/clip/context (diff vs replay-engine.js still undone). |
    | `warp.spec` | 1.4.0 | 2026-07-24 | ✓ CHECKED — real implementation at `warp/core`, `warp/dispatch`, `warp/plugins` (13 real primitives: Event/Gate/Stream/StreamLog/Axiom + unified dispatch). Was never entered in this registry despite existing and being actively used (idearium's chunk-dispatch: `[idearium/api] WARP chunk dispatch active — exact cache in the build path`, confirmed live in the 2026-07-24 boot log) — §6.3 gap, now closed. Also moved this session from the legacy `warp/warp.spec` to the standard `warp/spec/warp.spec` layout (orchestrator's own spec-drift checker flagged it live: "◇ warp: spec at legacy path... standard is warp/spec/warp.spec"); `warp/MANIFEST.json`'s `spec` field updated to match. |
    | `nexus-decomposition-architecture.spec` | 1.0.0 | 2026-06-29 | ✓ NEW — consolidates this session's full design arc (component/seam/wire/variable/UI/event/handoff/hot-swap). Status: proposed, not yet built — see build_order. |
    | `nexus-improvement-roadmap.spec` | 1.0.0 | 2026-06-29 | ⚠ PARTIAL — IMP-02 corrected proposed→built (lib/file-integrity.js, verified). Other 29 items still uniformly 'proposed', not re-audited. |
    | `nexus-organisms.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `nexus-shell-ui.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `nexus-system-foundation-addendum-v1.1.0.spec` | 1.1.0 | 2026-06-29 | ⚠ SUPERSEDED — folded into nexus-system-foundation.spec v1.1.0. Kept as historical record only. |
    | `nexus-system-foundation.spec` | 1.1.0 | 2026-06-29 | ✓ LIVING — this is the spec governing all specs. AX-008/009 promoted in from the addendum, AX-010 added, hooks added to interaction_contract. Addendum file superseded. |
    | `nexus.spec` | 2.0.0 | — | not yet checked against live code this pass |
    | `ollama.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `orchestrator.spec` | 2.0.0 | — | not yet checked against live code this pass |
    | `phase-map.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `raid-snr-filter.spec` | 1.1.0 | — | not yet checked against live code this pass |
    | `raid.spec` | 6.2.0 | 2026-06-29 | ✓ CORE BUILT — cortex/core/raid/index.js + cortex/contract/index.js built session 7, 21/21 against pre-existing tests. Layer-2 fitness (role_confidence/topological_proximity/SNR_tier_gate) honestly stubbed — named dependencies not yet built. |
    | `reflection-engine.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `replay-engine.spec` | 1.1.0 | 2026-06-29 | ⚠ PARTIAL — lib/replay-engine.js is real but has zero test coverage in this tree; a prior audit's "16/16 tests" claim actually described a different project (erosmancer-os). Comparison baseline needs re-establishing. |
    | `request-handler.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `2026-08-22-session-full-phasemap.spec` | 0.1.0-phasemap | 2026-08-22 | 18 phases (SF1-SF18), 17 DONE, 1 OPEN (SF13, orchestrator-agent-pipeline — the real, single largest remaining gap, named directly and left honestly open, not padded to look more complete). Every phase checked against real commit hashes, not recalled from memory — see the file's own header for the discipline. Registered here per the gate's own flag; was written and updated across this whole session but never entered in this table until now. |
    | `2026-08-23-backlog-phasemap.spec` | 0.2.0-phasemap | 2026-08-29 | 32 phases (BL0-BL31) — this row was itself stale before this edit (said "19 phases (BL0-BL18)" while the file already held phases through BL29 from earlier, uncounted work this pass didn't re-audit). This update adds BL30 (registry-components.js drift audit — found clear-glass's own copy stale, 32 declared components missing this session's entire real feature set) and BL31 (Architect as a swappable block canvas, building forward from BL20's already-real read-only graph), both OPEN, BL31 depends_on BL30. Verified against the real, live loom/scanners/phasemap-map.js scanner, not just visually matched to the format — both new phases parse, dependsOn correctly resolves BL31→BL30, systems auto-tagged correctly from the real system names named in each phase's own text. |
    | `session-2026-08-18-axioms-governed-phasemap.spec` | 1.0.0 | 2026-08-18 (created same day) | ACTIVE — the real, living session record for this checkout lineage (no prior one existed here). Every item checked against real commits, not recalled from memory. Extend in place, no new fragments. |
    | `seam-component-registry.spec` | 1.1.0 | — | not yet checked against live code this pass |
    | `seam-queue.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `seam.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `self-heal.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `service.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `siso.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `snapshot.spec` | 1.2.0 | 2026-06-28 | ✓ mechanical version sync only, no further drift found. |
    | `spatial.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `spec-compiler.spec` | 1.1.0 | — | not yet checked against live code this pass |
    | `spec-drift.spec` | 1.1.0 | — | not yet checked against live code this pass |
    | `telemetry-codec.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `tests.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `topo-kernel.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `ui-location.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `ui-registry.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `ui.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `user-model.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `vector-memory.spec` | 1.0.0 | — | not yet checked against live code this pass |
    | `nexus-nerve.spec` | 0.2.0 | 2026-07-01 | ✓ REGISTERED — spec written by James from-scratch (v0.1 lost, §2.1 violation noted in spec itself). Audited against live code this session. Phase 0 (pulse audit) complete — copilot/ollama heartbeats added. Phase 1 (read layer) built: `lib/nerve/index.js`, 16/16 tests passing. Phases 2+ not started. FieldMonitor/Living Glass dedup check (Phase 3) still open — see spec §E. |
    
    ## Intelligence Layer (2026-07-01)
    
    | Spec | Version | Date | Status |
    |---|---|---|---|
    | `nexus-query-surface.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 2 in build order. Prerequisite for everything else in the intelligence layer. |
    | `copilot-system-programmer.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 4. Depends on query surface. |
    | `nexus-project-flow.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 5. Depends on query surface + co-pilot programmer. |
    | `nexus-relationship-shape.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 3. Extends query surface with two-subject support + RFR2 delta wiring. |
    | `nexus-optimization-service.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 6. Depends on all prior phases. |
    | `NEXUS-INTELLIGENCE-LAYER-INDEX.md` | 0.1.0 | 2026-07-01 | master index — dependency order, real vs proposed, what it looks like when running. |
    | `NEXUS-LATTICE-COGNITION-ROADMAP-v0_1.md` | 0.2.0 | 2026-07-01 | living roadmap — v0.2 corrects RFR2 mischaracterization and Versionium/snapshot confusion. |
    
    ## RAID / Intelligence / COS Simulation (2026-07-01)
    
    | Spec | Version | Date | Status |
    |---|---|---|---|
    | `raid-simulation-engine.spec` | 0.1.0 | 2026-07-01 | proposed — Phase 5 in build order. New module `cortex/core/raid/simulation.js`, wraps _decide() without modifying it. Completes RAID Layer 2 fitness (role_confidence, topological_proximity, snrTierGate become real values). |
    | `rfr2.spec` | 1.0.0 | 2026-07-24 | ✓ DONE — Job 1 (9 modules, commit 9cff74a), Job 2 (harvested causality/sigma/adapter/kernel — 4 modules, not the originally-scoped 3 — then converted clip/compress/context), and Job 2b (harvested `forge` too, the ONE real live external consumer causal-nexus actually has — the 2026-07-21 audit's "2 consumers" claim was itself imprecise, checked directly: the "loom scanner" was a caveat comment, not a real require(); true count was 1, nexus-healer, migrated to the new path) all complete. rfr2 is 14/14 real CJS, zero remaining ESM, all verified by functional execution. Two real converter bugs found and fixed by testing the actual output, not trusting a clean grep: `import {X as Y}` producing invalid CJS destructuring, and `export async function` not being matched at all (silently dropping 4 of forge's 5 exports on the first pass). Real, unresolved version drift flagged (9 modules @5.0.0, 5 harvested @5.0.2) — not silently normalized. `meta/causal-nexus` still holds ledger/persist/projection/loader with zero consumers anywhere outside itself — confirmed dead weight from the rest of the system's view, but retiring the tree is still a real decision, not executed unilaterally from a grep. Suite: 31 rfr2-specific tests (up from 14), 806 total passed / 0 failed. |
    | `nexus-intelligence-system.spec` | 0.1.0 | 2026-07-01 | proposed — master spec for the 7-layer intelligence stack. Names the three genuine gaps and the dependency-ordered 8-phase build path to close them. |
    
    | `alk-gl-intelligence-canvas.spec` | 0.1.0 | 2026-07-01 | proposed — new driver module `canvas-intelligence.js` reading from intelligence system instead of audio. ALK-GL, canvas-cfr pattern, Eravos organisms all unchanged. One new data source. Phase 1-6 build order inside. |
    
    ## Session 2026-07-20/21 — organs, spine, consolidation (§6.3 entries on creation)
    
    | Spec | Version | Last drift-check | Status |
    |---|---|---|---|
    | `hooks-migration.spec` | 1.0.0 | 2026-07-20 | ✓ Phase 1 IMPLEMENTED same session. Registry class → lib/hook-registry.js (git mv); loom = write authority (seed+sync+CRUD/wire); architect = read view + 410 pointer; orchestrator proxy reads→architect writes→loom. Blueprint's registry dep verified decorative (grep -c: 0). 6 ownership tests. |
    | `registry-consolidation.spec` | 0.1.0-spec | 2026-07-21 | SPEC ONLY, no code. Maps all 3 registries + their real consumers (component: 12+, hook: 6, wire/seam: none-exists). §8.5 mandates the MISSING consumer side. 4 phases, P1 = consumer side on hook-registry (smallest, loom already owns it). Architect-fork objection recorded per §8.2/§17.3, OPEN. |
    | `handshake-ledger.spec` | 0.1.0-spec | 2026-07-20 | SPEC ONLY, deliberately not built. Signed cross-system handoff receipts; bridge = sole writer (§10.1); RFR2 CQL = verification surface; 5 laws incl. no eternal 'pending'. Written spec-first so it doesn't become unspecced module #13. |
    | `raid.spec` (addendum) | 6.3.0 | 2026-07-21 | ✓ UPDATED — universal_router addendum. RAID now decides TWO things on independent paths: which AI agent (existing _decide, untouched) and which SYSTEM fulfills a request (new router.js + envelope.js). Verified live vs real 217-cap registry. |
    | `cortex.spec` (addendum) | 3.3.0 | 2026-07-20 | ✓ UPDATED — organs Phases 0-6 addendum, event-name corrections (deployed contract is `escalation.friction.increased`/`newFric`), foundation fixes (3 jaa-store _matches bugs at source), pressure reflex. Closes one of the 10 drift gaps. |
    | `escalation.spec` (addendum) | 1.2.0 | 2026-07-20 | ✓ UPDATED — BUILT + new `nexus.resource.pressure` input → memory_pressure fault class. Oscillation damping NAMED as future work, not built. |
    | `self-heal.spec` (addendum) | 1.1.0 | 2026-07-20 | ✓ UPDATED — BUILT. 5-level ladder, level from fault_taxonomy count, L2 propose-only. SEMANTIC_GAP_TYPES flagged as a §7.2 judgment call, not found spec. |
    | `nexus-tablet.spec` | 0.4.0-spec | 2026-07-24 | **T1 BUILT + GATE-VERIFIED** (same day, per §8.5 spec preceded build). Read-only /ledger routes on autopilot's status server (disk-backed per the observation law; strict segment allowlist + resolved-path containment §4.3; corrupt lines counted, reported, never repaired §1.2) + `tablet/index.html` — single file, single endpoint (autopilot :7799), zero hardcoded ports, zero state, zero writes. Gate walked live against the real 462-file tree incl. hostile inputs; pinned in `test-tablet-ledger-api.js` (12 tests, registered). Honest limitation recorded: UI verified by contract, not pixels (no browser in sandbox). REST OF SPEC unchanged: container primitive, autopilot broker, observe/mutate boundary, change governance (ledger+registry+cortex), sigma/CFR/RFR2 detection. Blockers still real: B1 single-process consumers, B2 ESM/CJS (**substantially closed by today's rfr2 completion**), B3 UI unverifiable, B4 COS unwired, B5 replay-engine orphaned. T2-T3 have zero blockers, unbuilt. |
    | `nexus-sentinel.spec` | 0.4.0-spec | 2026-07-24 | **NEW, SPEC ONLY** — the sovereign diagnostic-and-repair system James asked for. Written spec-first (§8.5) after a full scan (§8.4). Key framing: this is a **CONSOLIDATION of four existing surfaces**, not a greenfield build — `service/nexus-diagnostic.js` (2100 lines, supervised, live) is ~80% of it already and becomes the BASE; `cli/diagnose.js` becomes a client that keeps local checks (they work when the service is down); `nexus-healer/` is an orphaned scaffold to absorb-or-delete (§16.5); `cortex/self-heal` moves in (James's call). Building it *beside* nexus-diagnostic rather than *as* it is listed as the primary failure mode. The real gap driving the whole spec: the existing service is **poll-based and never subscribes inward** — a monitor, not a nervous system. Contains 3 scan-found hazards as first-class sections, the blocking one being **liminal-space's in-process subscription to `escalation.friction.increased`**, which a naive folder-move would kill silently. 7 laws (incl. SEN-7: a repair that did not happen cannot report success — earned from three real dead heal paths found the same day). Notifications decided: **yes in the tablet, no owned by the tablet** — the fault goes to the ledger, the notification is a projection read, so it survives a closed tab. 7 phases, S1 CLI-first. **v0.2.0 (same day):** James asked whether it uses the intelligence system and meta/ — answer was NO, a real hole. `cortex/intelligence` already maintains the pattern/failure-mode memory (bep_patterns, failures taxonomy, reuse index) and v0.1.0 would have been a SECOND pattern engine beside it, violating its own SEN-1. Added SEN-8 (never derive what you can consult), an intelligence section, explicit meta/ subsystem mapping (meta/gap as detection substrate, meta/rfr2 for causality, meta/confidence for scoring — noting EVIDENCE_LESS_DISCOUNT as §0.1 in numeric form), and phase S6b. Key finding: intelligence already has HTTP routes on cortex, so unlike self-heal it has NO cross-process hazard. Also verified: `service/nexus-diagnostic.js` references intelligence NOWHERE — an unclosed wire in live code, not just a spec gap. Name settled (James: "Sentinel is fine"), with the `nexus.organism.git-sentinel` near-collision recorded. **v0.3.0 (same day): two corrections from James, both execution-layer errors.** (a) Added SEN-9 decoupling law — bus/API/CLI/SSE only, never `require()` of another system's internals; the violator is CORTEX (`boot.js:113-119` requires the intelligence faculties in-process) while copilot correctly fetches them over HTTP. (b) **Copilot is the MIND, not cortex** — v0.2.0 prose described "asking cortex", inverting the architecture; copilot (port 3750) has its own faculties and queries cortex over HTTP, so cortex remembers and copilot thinks. Also **retracted a false claim**: v0.2.0 said intelligence "already maintains" bep_patterns/failures — it does NOT; `index.js` (933 lines) has never run, `init()` is never called, neither table has ever been created. Scoped turning it on: costs ~one line (init dry-run clean), and the decisive finding is that `copilot/intuition.js` reads `precursor/outcome/confidence` — **bep_patterns' shape** — while `_buildPatterns()` serves it from the `crystals` table, so the mind has always been asking for the core's output and getting a different engine's. **v0.4.0 (same day): James closed the loop** — contract → gated handshake → failed handshake IS a fault → every fault logged+tracked → intelligence reads ledgers AND causal graph → conditions + onset. Added `the_loop`, a universal `ledger_schema`, and phases S5b/S6c. Schema finding: **9 of the 13 requested fields already exist** in `component-ledger.write()`, so this is extend-and-enforce, not design-from-scratch. Pushback applied and recorded: **`next event` REFUSED** (append-only cannot know the future; requires mutating written rows, breaks immutability, and is derivable as `causedBy` reverse-index), **ledger file/dir as fields REFUSED** (already derived by `_partitionPath`; self-referential and drifts — the useful version is `sourceRef`), **embedded `context` REFUSED** (rows are ~303B and the tree is 9.6MB; a blob would roughly triple it — use references), **unconstrained `relation` REFUSED** until the enum types are named. Accepted: **hook + wire** (the strongest item — makes a row locatable in the architecture, recorded nowhere today), constrained `intent`, `faultId` by reference. Two REAL unclosed wires named: **intelligence reads no causal graph** (verified by grep — so "why" is temporal adjacency, not causation, though `meta/cfr/graph.js` CausalGraph with `ancestors()` is already reachable elsewhere in cortex), and **onset is recorded nowhere** — `fault_taxonomy` has `lastSeen`/`count` but no `firstSeen`, so nothing can be correlated to what changed. |
    
    ## Session 2026-07-24 — real gaps found, §17.1 (every artifact has an owner)
    
    Two runtime files with real consumers and no dedicated governing spec — found
    while auditing the JaaStore recursion fix and rfr2 CJS conversion against
    AXIOMS v3.1 §8.5 ("do not build anything without creating a spec file
    first"). One closed same session, one still open.
    
    - **`guardian/jaa-store.js` (class `JaaStore`)** — CLOSED. `docs/jaa-store.spec`
      v1.0.0 written from live code (§3.3), registered above. Was mentioned only
      incidentally before this — as a byproduct of unrelated work: `cortex.spec`
      (`cortex/spec/cortex.spec`, `foundation_fixes`) records three `_matches()`
      where-clause bugs fixed at its source, and `hooks-migration.spec` mentions
      it once in passing (multi-process flush note) — neither documented its
      actual contract. NOT the same class `jaa-db.spec` governs (see that row's
      correction above).
    - **`meta/rfr2/*`** — CLOSED. `docs/rfr2.spec` v1.0.0 written from live
      code, registered above. Job 1 (9 modules converted) recorded as done;
      Job 2 (clip/compress/context) recorded as an open, undecided
      harvest-vs-mark-incomplete choice — the spec existing doesn't mean
      the underlying work is finished, only that it's now honestly tracked.
    
    ## Session 2026-07-24 (cont.) — widening P0.3, real findings
    
    James: "widen" — from the rfr2-only scope to the mind map's actual
    Tier-0 item (meta/ + idearium ESM/CJS interop, "highest-leverage fix
    in the system" per the 2026-07-21 full audit). Mapped current state
    before touching anything (§3.3); it reframed the item substantially.
    
    - **The ESM/CJS "fault line" is smaller than the 2026-07-21 audit's
      framing suggested, on THIS runtime.** Verified directly: Node 22.12+
      supports synchronous `require()` of real ES modules natively
      (confirmed live — `require('./meta/causal-nexus/modules/kernel/index.js')`,
      genuine `import` syntax, loads with zero conversion). The audit was
      written before this was checked against the actual installed Node
      (v22.22.2, confirmed in the 2026-07-24 boot log). `package.json`
      still declares `"engines": {"node": ">=18.0.0"}` — where this
      wouldn't work — so this is a real fact to weigh, not a green light
      to abandon conversion work: if <22.12 support genuinely matters,
      mechanical CJS conversion (Job 1's approach) or the async
      `lib/rfr2-bridge.js` remain the only portable options. Not decided
      here which floor the project actually needs — flagged for James.
    - **meta/causal-nexus/ (36 of the 39 "ESM in meta/" files) should NOT
      be mechanically converted.** Already decided 2026-07-21: causal-nexus
      is the near-dead ancestor (2 consumers), rfr2 is canonical, harvest
      3 modules (kernel/sigma/adapter — see rfr2.spec's corrected Job 2
      section) then retire the tree. Converting 36 files' syntax just
      before deleting most of them would be pure waste (§0.5/§16.5).
    - **A real, load-bearing bug found and fixed while mapping this.**
      `idearium/lib/event-ledger.js` and `idearium/lib/spec-container.js`
      are genuinely CJS (`require()`/`module.exports`, zero `import`/
      `export` of their own) but sat inside `idearium/`'s `"type":"module"`
      tree, so Node force-interpreted them as ES modules — every call threw
      `ReferenceError: require is not defined in ES module scope`. Caught
      by try/catch at both real call sites (`orchestrator/lib/sigma-writer.js`,
      `idearium/repo/watcher.js`), so the failure was loud at the require()
      boundary but silently absorbed one level up: `_getLedger()` had been
      permanently null forever, and every `.spec` archive ingested through
      `watcher.js` had been failing verification and never actually
      ingesting, logged as if it were a hash-mismatch/corrupt-archive
      problem — never was. Fixed by renaming both to `.cjs` (Node honors
      that extension as CommonJS regardless of an enclosing type:module) —
      not by rewriting them to real ESM, they never needed to be. All 3
      real call sites updated to the explicit `.cjs` path (a bare require()
      does not auto-resolve `.cjs`). `tests/modules/spec-container.test.js`
      existed, was orphaned (never registered in run-all.js), and would
      have crashed on its own require() if run — now registered, 9/9 pass
      for real, functional coverage (hash-mismatch rejection, truncated-
      archive detection, header parsing). New regression suite
      `test-idearium-cjs-under-esm.js` (7 tests) pins the fix and scans
      the rest of `idearium/` for the same pattern (found none — siso/ and
      meta/causal-nexus/, the other two `type:module` scopes in the repo,
      checked too, also clean). Full suite: 783 passed / 0 failed.
    
    ## Session 2026-07-24 (cont.) — cortex heartbeat gap, from a pasted boot log
    
    James pasted a live boot log showing `[watchdog] cortex → OFFLINE`
    during a busy multi-system boot window. Traced to root cause, not
    patched blind: `orchestrator.js`'s `allHealth()` only flags a system
    OFFLINE when BOTH the direct `/health` GET fails (3s timeout) AND the
    registry's `lastSeen` is >15s stale (the fallback that should absorb a
    transient miss). Checked every one of orchestrator's 3
    `REQUIRED_SYSTEMS`: guardian, idearium, copilot, and ollama-bridge all
    send a recurring `POST /api/heartbeat` (10s interval) that keeps
    `lastSeen` fresh — cortex sent none, ever. It only had the one-time
    `/api/register` at boot, so after the first 15 seconds of runtime it
    ran with zero protection against any transient event-loop delay (e.g.
    the synchronous multi-table JAA load every system does at boot — the
    exact congestion visible in the pasted log's surrounding lines).
    Confirmed this wasn't a process crash — autopilot's own "stable for
    60s" fired seconds after the OFFLINE flag, meaning the process itself
    was fine, only the HTTP health check briefly went unanswered.
    
    Fixed: `cortex/boot.js` gained `_startHeartbeat()`, called once
    registration succeeds, mirroring idearium's real working pattern
    exactly (same interval, same payload shape, same fire-and-forget error
    handling) rather than inventing something new. Pinned with
    `tests/modules/test-cortex-heartbeat.js` (4 tests, including a real
    HTTP round-trip against a live throwaway server proving the actual
    payload arrives).
    
    **Separate, bigger, NOT fixed here:** `tests/pipeline.test.js` — a
    712-line, 10-section integration suite (heartbeat/project_registry,
    gap-finder, healer, self-heal, snapshot/replay, agent-tools, full
    pipeline, contract+RAID enforcement) — `require`s `../cortex/heartbeat`
    at line 92, a file that does not exist anywhere in the repo. Confirmed
    directly (not assumed): that require throws `MODULE_NOT_FOUND`
    immediately, meaning **none of the 10 sections in this file have ever
    been able to run**, not just the heartbeat one. This is a different,
    larger concept than the outbound heartbeat just fixed above — the
    test's own section name ("Heartbeat — project_registry population")
    implies a local polling/population mechanism, not an outbound ping —
    and building it blind from a test's expectations alone is exactly the
    kind of real, scope-bearing decision this session has been deliberately
    NOT making unilaterally. Flagged with its full blast radius quantified,
    not built. Full suite (module tests only, `pipeline.test.js` is a
    separate top-level suite outside `run-all.js`): 810 passed / 0 failed.
    
    
    
    ## Session 2026-07-24 (cont.) — storage direction DECIDED, first consolidation executed
    
    James resolved the §10.3 competing-truth between his own two directives:
    his 2026-07-18 "migrate all of the data nexus uses to cortex" (executed:
    guardian_/idearium_ tables in the shared store) vs the 2026-07-21 mind
    map's P0.1 "migrate strays to owners" (out-migration, never executed).
    **His word: "1. stored in cortex." P0.1's out-migration is DEAD.** The
    consolidation direction stands; remaining work is completing it, not
    reversing it.
    
    First straggler consolidated same turn: guardian's CFR ledger
    (cfr_state.json / event_stats.json / event_log.jsonl — 8.7MB live).
    The 2026-07-18 migration comment claimed its writer "wasn't found in
    this file to migrate safely" — the writer was in the SAME FILE, ~60
    lines above that comment (guardian/server.js:1606,
    ledgerDir: guardian/memory_store/ — a live write target inside the
    SOURCE tree, outside data/ entirely). Moved to data/guardian/ledger/cfr
    (bridge's exact existing pattern). Data migrated by copy, byte-exact
    verified; originals archived in place (§7.4). Functional resume proven:
    30 event types + non-default CFR field (friction 0.0941, regime
    resonant) loaded from the migrated files, not fresh defaults. CLI
    helper paths updated (cfr-debug examples, diagnose listing). Pinned:
    test-guardian-cfr-consolidation.js (5 tests incl. a repo-wide
    live-reference scan). Suite: 836/0.
    
    **Consolidation still remaining (mapped, not yet executed):** (a) the
    dual ledger roots — guardian-service/diagnostic/bridge services write
    data/<system>/ledger/*.ndjson while the canonical hook tree is
    data/ledger/<system>/<hook>/<day>.jsonl; two truths about what
    happened. (b) orchestrator's CFR ledger writes loose files at the
    data/ledger TREE ROOT (event_log.jsonl, cfr_state.json,
    event_stats.json, orchestrator.jsonl mixed among system dirs) —
    untidy but already under the data root; lower priority than (a).
    (c) ~35 assorted flat data files across architect/bridge/diagnostic/
    emerge/orchestrator that never went through any migration — need
    per-file writer identification before touching, same discipline as
    this one.
    
    ## Session 2026-07-24 (cont.) — tablet T2/T3 built, B1 blocker closed
    
    - **T2 container shell** — 4 routes on autopilot (contract proxy with the
      port taken from each kernel's own healthUrl so no second topology map
      exists; disk-backed JAA table reads; data subtree listing; real test
      invocation via a new `--filter` on the REAL run-all.js). Container view
      added to tablet/index.html. 14 tests. **Real flaw found and fixed at the
      class:** the test-invocation route allowed recursion — a suite filtering
      on a term matching itself makes the spawned runner re-run it, forever.
      Passed standalone (unregistered), failed the instant the full suite ran.
      Fixed both in the test AND architecturally (`NEXUS_TEST_RUN_DEPTH` guard
      on the route), because `_testRunActive` can never catch it — each nested
      run is a fresh process with its own state.
    - **T3 change governance** — `lib/config-governance.js`, all five gate
      steps, deliberately thin: CFR's `record()` supplies the stamp+sigma,
      `component-ledger.write()` the canonical write+registry projection,
      `escalation.js` the friction. Emits `anomaly.detected` rather than
      computing friction, so no second truth about system health (§10.3).
      10 tests against real modules, nothing mocked; anomaly forced by
      threshold, never by a faked sigma score. **Not wired to any caller yet** —
      recorded honestly rather than claimed.
    - **B1 CLOSED** — `lib/bus-subscriptions.js`. `consumer-registry.consumers()`
      read only the local EventEmitter while NEXUS runs 9+ processes, so every
      remote subscriber was invisible and `unconsumed()` called real work
      "emitted into the void." Now every process publishes its own subscription
      snapshot to the shared store and reads aggregate from disk (§5.12
      decoupling + the tablet's disk-backed observation law). **Staleness is not
      liveness:** live and stale counts are reported separately and never
      summed — a crashed process's last snapshot must not be drawn as live
      wiring. `consumers()` still returns a number for every existing caller
      (§5.14); `consumersDetailed()` adds the per-system breakdown and names its
      source. 12 tests. Two API assumptions were wrong on first attempt and are
      now pinned: JaaStore has no `find()` (it's `all()`), and `upsert()` MERGES
      — which would have kept an unsubscribed event type alive as a live edge
      forever; `insert()` with an explicit id does the required full replace.
      **T4 is now blocked only on publishers being wired into each system's
      boot** (the library is proven; no system calls `publish()` yet).
    
    ### B1 publishers wired (2026-07-24, same session)
    
    `lib/bus-subscriptions.js` now has real producers, not just a proven library:
    - **cortex** publishes from `_startHeartbeat()` — i.e. after registration
      succeeds, which is after boot wired its listeners. Publishing at module
      load would snapshot an empty bus and record cortex as consuming nothing.
    - **orchestrator** publishes from `startWatchdog()` — after the server binds,
      same reasoning. It is a heavy subscriber (sigma-writer, request-handler,
      CFR influence poller) and every one of those listeners was invisible to
      other processes before this.
    Both wrap the start in try/catch with a loud failure: observability must
    never be the reason a system fails to boot.
    
    **Honest scope limit — guardian CANNOT publish, and this is not an oversight.**
    Its bus is a custom `_kernelEmit()` that forwards over HTTP to
    orchestrator/cortex; it is not an EventEmitter and has no introspectable
    subscriber set, so there is nothing to snapshot. Forcing a fake publish would
    have put zeros in the map that read as "guardian consumes nothing." Recorded
    rather than papered over. Any future EventEmitter-style bus in guardian can be
    wired in one line.
    
    **Store-facade compatibility fixed while wiring:** this codebase has two live
    store facades — `JaaStore` (read-many = `all()`) and `cortex/memory/jaa-db.js`'s
    `jaaDB` (read-many = `query()`, no `.all` on the facade). The first draft
    supported only `all()`, which would have returned `observed:false` for cortex
    and orchestrator — both of which hold the `jaaDB` shape — making the whole
    cross-process map read as "no subscribers anywhere." Caught before wiring, not
    after. Both shapes now supported and pinned (T-B1-015).
    
    ### 2026-07-24 — two standing decisions closed
    
    - **Intelligence core SWITCHED ON** (James: "Yes to the core"). One line in
      `cortex/boot.js`'s organs array. 933 lines that had never executed — nothing
      required it, `init()` was never called, `bep_patterns`/`failures` never
      existed. Its three siblings were live, which is exactly why nobody noticed:
      the routes answered. Not a competing pattern engine — copilot reads
      `precursor/outcome/confidence`, which is `bep_patterns`' shape, so the core
      supplies what the mind was already asking for. Still open, deliberately:
      whether `_buildPatterns()` now serves `bep_patterns`.
    - **`meta/causal-nexus` RETIRED** (James: "retiring causal, I don't want
      junk"). 37 files, 728K, zero code dependencies verified by require-grep,
      absent from the suite. Its useful modules were harvested into `meta/rfr2`
      earlier the same day and its one real consumer (`nexus-healer`) migrated, so
      nothing was lost with it. Git preserves the history — retired, not
      destroyed. Suite unchanged at 926 before/after removal, now 933 with the
      pinning tests.
    | `docs/raid-warp-verification-phasemap.spec` | 0.2.0-phasemap | 2026-07-30 | RAID as the verification spine, governed by AXIOMS-v3.1 (87 laws parsed), new code via WARP logic (warp/core Axiom→Gate→Stream), drift accounted per phase. Supersedes raid-verification-spine v0.1.0. 11 phases (Part I verify spine + Part II co-pilot bridge): record→constitution→COS-isolate→sigma/drift→compare→rewind→one raid.verify() GateFusion; then P8 UI-as-tools, P9 gated-events-to-copilot, P10 diagnose+notify, P11 diagnose+repair-on-prompt (co-pilot as the bridge: user↔UI↔NEXUS). Connects built systems (constitutional-ai, cos/playground, replay-engine, sigma, meta/bda) through RAID. ALL 11 PHASES BUILT 2026-07-30, suite 1168/0. raid.verify() is the fused entry; copilot/assist-loop.js + repair-on-prompt.js are the bridge. |
    | `docs/cortex-schema-registry-phasemap.spec` | 0.1.0-phasemap | 2026-07-30 | Schemas-per-system as expectation + integrity, living IN cortex as EDITABLE rows. FLUID not rigid: describes shape, observes writes, records deviation as drift data — NEVER blocks. Addresses "no flat" — jaaDB.insert validates nothing today. 5 phases: schema table in cortex → conformance-check lib (agnostic, lib/) → observe-on-write (non-blocking) → editable surface → expectation for consumers (makes user-model trustworthy). Builds outward from config-schema.validateConfig + SYSTEM-CONTRACTS (already names SCHEMA_VIOLATION). P1-P3 + UM1-UM4 BUILT 2026-07-30 (lib/schema-registry.js, user-model schema-observed + queried-everywhere + richer-capture + editable surface), suite 1168/0. |
    | `docs/copilot-awareness-routing-phasemap.spec` | 0.1.0-phasemap | 2026-07-30 | Co-pilot self-awareness + intent routing. 7 phases: CA1 status-report (poll system+loom on "how are you"), CA2 tool self-awareness (edge cases + how-to-use), CA3 tool-first (look for a tool before fallback), CA4 capability-extend ("no is not an answer" → gap/module_builder), CA5 intent routing (perplexity=data, claude=big-code+WARP, chatgpt=optimal-900tok-chunked, gemini=coding/adversarial-secondary, claude=last), CA6 routing config (editable cortex rows), CA7 ClearGlass multi-account gear. Extends routing-ir + intent-classifier (exist). CA1 building now. |
    | `docs/nexus-observability-tablet-phasemap.spec` | 0.1.0-phasemap | 2026-07-30 | Per-system tablet modules + full live diagnostics + movement mapping + real 3D visual. 9 phases / 5 chunks: E diagnostics (OB1 live diag + OB2 gap-detection), F movement (OB3 registry→CFR/ALK-GL map + OB4 bottleneck via sigma/delta/friction), G tablet (OB5 per-system modules+escalation + OB6 continuous ollama injection), H intelligence (OB7 optimization + OB8 pattern leverage ratio), H also OB10 sigma-role intent-map (sigma=deviation/performance/expectations/drift/leverage per component) + OB11 edge-case mapping. I visual (OB9 real 3D map, no mocks). Grounded in EXISTING substrate: tablet/ UI, cfr/field.js (friction/tension), sigma, capability-registry, cortex/intelligence, gap-hunter. Wiring+expansion, not greenfield. Map only. |
    | `docs/component-registry.spec` (ADDENDUM 2026-07-30) | +CodeFactory | 2026-07-30 | FORGE-CodeFactory alignment: tier (component/mod, mod requires ≥1 component producer — enforced at register), seam boundary contracts (derivative of seam-block, not a second schema), similarity-sigma vs drift-sigma (two DISTINCT scalars — dedup/clustering vs baseline-drift; maps onto OB10 sigma-roles), promotion states (observed→candidate→pattern→component→module, evidence-required), anti-generalization guard (high structure + low semantic = do not merge). §10.3 stance: CodeFactory does NOT replace Architect/Eravos — loom stays registry-truth, Architect stays topology-declarer, CodeFactory Blueprint is a PRODUCER into loom. Design decision recorded, not enacted. |
    | `codefactory/codefactory.spec.md` | v0.16 | 2026-07-30 | FORGE-CodeFactory combined spec (v0.15 living doc + Sigma Similarity 2c merged at its specified insertion point after 2b; 2c open questions folded into 8). Visual block/module code builder, no AI runtime dependency. 8 layers (0-7) + cross-cutting mandates 2a/2b/2c. Lives in codefactory/ folder. Registry-alignment recorded in component-registry.spec addendum. Phase 0 (Orient) — map only, no build. |
    
    | `lib/activity-log` | 1.0.0 | 2026-08-04 | Per-system activity + error logging into cortex, riding the ledger fan-in. Full activity → event_log, errors → error_log, tagged by system, history preserved (append-only). Per-system enable/disable. |
    | `lib/ledger-fanin` | 1.0.0 | 2026-08-04 | Unified event fan-in — every system emits, intelligence/autopilot/co-pilot subscribe once, see everything. coverage() names silent systems (the detection gap). |
    | `CLAUDE.md` | — | 2026-08-04 | The persistent working agreement: map first, reuse first, wire the registry, addend specs, lose nothing. Read every session. Enforced by scripts/precommit-check.js. |
    | `docs/nexus-live-mind-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-07 | The full vision mapped before build: P1 nervous system live (fan-in→intelligence/autopilot/copilot/logging), P2 snapshot-on-sigma, P3 diagnostic kernel (RFR2+CFR+loom+intelligence, causal conditions), P4 co-pilot system-aware (loom+diagnostic+intelligence, full toolbox), P5 co-pilot dynamic+user-aware (user-model), P6 co-pilot programmable (schedule/automate/workflows/switch-agent, RAID-governed). Dependency order P1→P6. Substrate already built this session; phases wire it. |
    | `docs/gemini-multiagent-coding-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-07 | Multi-agent Gemini coding framework (James's structured-injection blueprint): P1 per-agent contracts (identity/axioms/scoped-toolbox/injected-context, extends gemini-toolbox CONTRACT + agent-router AGENT_CONSTRAINTS), P2 tree/parse/cortex-recall injection tool, P3 line/block/seam sync (extends the toolbox's line addressing), P4 structured JSON agent-to-agent, P5 autonomous multi-agent loop (via lib/autonomous-loop + RAID gate). Answers chunk-vs-seam, emerge-vs-cockpit. Dependency order P1→P5. Substrate largely exists (§8.6). |
    | `docs/agent-intelligence-loop-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-07 | Wiring the multi-agent layer into NEXUS's live intelligence substrate (fan-in + RFR2 + CFR + cortex dynamic DBs + RAID) so injection strategy is LEARNED per agent, not hardcoded. James's clarified vision: push+pull context delivery, intelligence optimizing around each agent's constraints automatically, strategy as an evolving cortex database, RAID-governed. AP1 pull toolbox → AP2 agent events to intelligence → AP3 strategy dynamic DB → AP4 intelligence optimizes → AP5 autonomous build loop. Expands P3-P5 of gemini-multiagent-coding. All substrate exists (§8.6) — this is wiring, no new brain. |
    | `docs/raid-routing-fidelity-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-08 | RAID as the governing routing layer: chunk→contract→RAID→best agent by signal-to-noise + fidelity. Major §8.6 finding: the SNR/fidelity gate (cortex/core/raid/snr-filter.js), per-agent token configs (agent-router), multi-account login (account-registry), and guardian↔clear-glass bridge ALREADY EXIST — ~70% wiring. Phases: RR1 verify/wire SNR-fidelity gate, RR2 contract-based token-sized chunking, RR3 per-agent config in cortex, RR4 governed handshake on handoff (+ enforcement-index.js), RR5 clear-glass accounts/features, RR6 cortex-fitness (= agent-intelligence-loop AP4 system-wide), RR7 per-system tablet dashboards (checkmk-style). Converges with agent-intelligence-loop at fitness. |
    | `docs/loom-phasemap-section-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-08 | LP1+LP2+LP3 ALL DONE 2026-08-08. Consolidates all 16 phasemaps → splits phases by system → live in loom as a section. loom/scanners/phasemap-map.js (LP1+LP2) + /api/phasemap + /api/phasemap/:system in loom/server.js, registered in loom/registry-components.js v1.3.0, live view-roadmap in loom/ui/index.html (LP3). 8 tests (loom/test/phasemap-map.test.js). Verified live: 102 phases / 16 phasemaps / 19 systems, 58 done / 2 in progress / 42 pending. Spec closed. |
    | `docs/nexus-system-standardization-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-08 | THE TARGET ARCHITECTURE: every system standardized — own folder, config, event-driven handshake-gated interaction contracts, full logging (error.log + event ledger + SSE to cortex), diagnostics-reads-and-fixes, dynamic commands, persistent cortex data, hashed integrity, fully decoupled via contracts/APIs. Census shows the pattern exists in fragments (guardian has config+contract, others don't) — this STANDARDIZES it. SS0 clear clutter → SS1 manifest → SS2 config → SS3 handshake contracts → SS4 logging → SS5 diagnostics-fix → SS6 dynamic/fluid → SS7 decoupling audit. The spine all other maps hang on. SS6 converges with raid-routing RR6 + agent-loop AP4. |
    | `docs/copilot-autonomous-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-08 | ALL SEVEN PHASES DONE 2026-08-08 — spec closed. CA1 scheduler, CA2 triggers/conditions, CA3 pipeline chains, CA4 http/sse connections, CA5 system control + governed clear-glass/DOM, CA6 self-building commands, CA7 constant autonomy. lib/scheduler.js, lib/triggers.js, lib/chains.js, lib/connections.js, lib/system-control.js, lib/command-builder.js, lib/constant-autonomy.js — all registered in loom/maps/observability-map.js. 67 tests total (7+10+8+8+10+14+10), all passing against real substrate (real HTTP/SSE servers, the real live capability registry, real autonomous-loop execution). Four spec assumptions checked against real code and corrected where wrong; two real bugs caught by tests before shipping; one pre-existing unrelated bug in compartment-engine surfaced and noted, not scope-crept into fixing. |
    | `docs/repair-contract-and-loom-hub-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-12 | MAPPED, NOT BUILT — §3.3, map before build. Six phases, bottom-up: R1 repair contract schema (extends gap-field), R2 real cortex/snapshot rollback (the one genuine gap — everything else here is disconnection, not absence), R3 wires repair-on-prompt.js (real, correct, zero callers) to fire autonomously from a detected gap instead of only a typed prompt, R4 loom reads the real 15,472-row component-ledger it has never once queried, R5 the zoomable node map over loom's already-real registry data, R6 generated (not hand-written) documentation over R4+R5. Found along the way: repair-on-prompt.js's own header already assumes real snapshots exist for rewind-on-fail (R2 blocks R3), and a data-quality issue in component_ledger (session ids leaking into the systemId field). Three open questions logged in the spec itself, not silently assumed. |
    | `docs/agent-model-and-user-continuity-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-13 | MAPPED, NOT BUILT (AM4 DONE). 10 phases now (AM1-AM10). AM10 new: (a) thinking-partner mode — "keep mental note"/contract feedback/"continue from last time"/brainstorm, each composing a real existing mechanism (push-recall, reflection.js's satisfaction slot, AM7's session continuity, AM3's classifier) rather than one new feature; (b) rename command — backend ALREADY REAL (self-model.js:97,111 getIdentityName/setIdentityName) but confirmed UNWIRED to any conversational trigger (zero hits in copilot/server.js), unlike switchAgent which is wired; (c) UI builder from a shared spec/design philosophy, reusing SB2/SB3 from the sibling phasemap. langgraph_comparison note removed per direct correction — it was a passing statement, not a spec ask. |
    
    | `docs/nexus-self-build-pipeline-phasemap.spec` | 0.1.0 PHASEMAP | 2026-08-13 | MAPPED, NOT BUILT — §3.3. 9 phases now (SB1-SB9). SB7 compartments-as-sessions: elevates COS's real create/start/stop/destroy compartment lifecycle into a conversational primitive (axioms+endState prompt reusing lib/emergence.js's real shape), 24h decay via lib/scheduler.js, ledger+cortex-index on creation, both sides removed together on delete. SB8: tool-agnosticism logging (extends tool-index.js's real row shape) + "make me a tool" — ALREADY REAL, copilot/module-builder.js's own header is literally map->spec->QC->contract->build->verify->merge, reused not rebuilt + honest Tasker-vs-CA1-7 comparison deferred, not assumed + calendar tool confirmed a real gap (schedule-task.js is task-scheduling, not a calendar). SB9: the element picker is not a gap, it's an ORPHAN — verified across 4 real files (clear-glass/src/dom/archaeology.js emits real dom.picked/dom.pick.registered SSE, real gate, real IPC handler, real browser-action tool action) that copilot/server.js never subscribes to (zero hits grepped directly) — this phase is one missing SSE listener between two fully-real systems, not new picker infrastructure. |
    
    ---
    ## Doc cleanup 2026-08-09
    Eleven superseded docs moved from `docs/` to `_archive/superseded-docs-2026-08-09/`
    (git-mv'd, history intact, per §0.3 — archived, never deleted). Each checked
    for live references before moving, not archived on filename appearance alone:
    `docs/PHASE-MAP-TEMP.md` looked like the obvious first candidate (its name)
    and was explicitly **not** archived — `tests/modules/test-health-authority.js`
    (HA-008) reads it live and asserts it still holds a specific historical
    correction record. Two live-code docblock comments and one live doc's prose
    reference were updated to point at the new archive location rather than left
    dangling. Full rationale per file: `_archive/superseded-docs-2026-08-09/README.md`.
    `docs/NEXUS-PHASE-MAP.md` (the old monolithic phase map, 1287 lines, phases
    0-125) was deliberately left for a separate, more careful pass — referenced
    by three other docs, too large to archive on a quick read. `loom/maps/`
    checked too: both files there (`observability-map.js`, `warp-map.js`) are
    actively current, nothing to clean.
    
    ## §REGISTERED 2026-08-18 — session specs (§6.3)
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/pressure-causality.spec` | 0.1.0 | Specified | resource-monitor, autopilot exit path, CFR/RFR2/sigma query surface | 2026-08-18 (written) |
    | `docs/clear-glass-toolkit.spec` | 0.1.0 | Specified | clear-glass driver + copilot tool surface, screenshot/picker destination | 2026-08-18 (written) |
    
    Both are Specified, not Implemented (§17.2) — no code was written for either in
    this drop, per §8.5. Their §3.3 map is `docs/MAP-2026-08-18-pressure-and-toolkit.md`.
    
    ## §REGISTERED 2026-08-19 (§6.3)
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/idearium-agent-pipeline.spec` | 0.1.0 | Specified | idea/spec → compartment → chunks → ChatGPT → wake loop → staged drop | 2026-08-19 (written) |
    
    Map: `docs/MAP-2026-08-19-idearium-agent-pipeline.md`. No code in this drop
    (§8.5). P0 is blocked on `lib/intake.js` landing in the tree — landed this
    session, so P0 is now unblocked, not yet built (§8.5 order still applies).
    
    ## §REGISTERED 2026-08-27 (§6.3)
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec` | 0.1.0-phasemap | PHASEMAP | Per-system event taxonomy (guardian, clear-glass, orchestrator each own their own event-taxonomy.js; loom gets a read-only aggregation scanner mirroring phasemap-map.js) + sigma gates built on top; remainder of James's 2026-08-27 architecture brainstorm, cross-referenced against already-tracked phase IDs rather than duplicated | 2026-08-27 (written; 8 phases verified parsing correctly against loom/scanners/phasemap-map.js's real loadAll() before commit) |
    
    Not built this drop (§8.5) — MAPPED, NOT BUILT. Scoped from real, grepped
    fragmentation (guardian: 6 bus events, all `ncp.*`; clear-glass: 36 files
    independently emitting with no shared registry), not assumed. All 8 real
    phases (ET1-6, BR1-2) start PENDING.
    
    ## §REGISTERED 2026-08-28 (§6.3)
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/2026-08-28-self-building-pipeline-phasemap.spec` | 0.1.0-phasemap | PHASEMAP | Full loom/idearium -> compartment -> repository -> spec -> chunk -> contract -> RAID -> agent pipeline, grounded bottom-up per axiom §3.1. Confirmed real, already-built pieces cross-referenced not duplicated (Versionium all 4 steps, RAID's dependency graph, BR5 agent-aware chunking, COS's blueprint/archetype system, routing-ir.js's agent-preference support) | 2026-08-28 (written; 6 phases verified parsing correctly against loom/scanners/phasemap-map.js's real loadAll() before commit) |
    
    Not built this drop (§8.5) — MAPPED, NOT BUILT, per James's own explicit
    instruction ("Map first. Phasemap. Bottom up."). Real, confirmed findings
    baked into the phase descriptions themselves, not left as open questions
    in prose: COS's `launchBlueprint()` already IS the real template-to-
    compartment mechanism (11 pre-built blueprints confirmed); `routing-ir.js`
    already supports a preferred/specified agent but `contract-intake.js`
    bypasses it entirely; a second, real "repository" concept (idearium's own
    `RepoLayer`) exists independently of COS's compartment persistence and
    needs the SAME reconciliation discipline this session already applied
    once to `.nex` vs COS's `SnapshotEngine` — flagged as SBP1, the required
    first step, not assumed either way. All 6 real phases (SBP1-6) start
    PENDING.
    
    ## §REGISTERED 2026-08-28 (§6.3), second entry
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/2026-08-28-definition-of-complete-phasemap.spec` | 0.1.0-phasemap | PHASEMAP | James's own stated conditions for NEXUS to be considered complete (autonomy, self-repair, build-from-idearium, build-from-loom, living model, axiom compliance, COS-based testing, contract/comparison/drift engines) — each graded honestly against real current state, cross-referenced to already-tracked real phases rather than restated | 2026-08-28 (written; 8 phases verified parsing correctly against loom/scanners/phasemap-map.js's real loadAll() before commit — caught and fixed a real false-positive: the literal substring "STARTED" inside the honest phrase "not yet started" flipped a phase's real status to IN-PROGRESS in the scanner's own heuristic) |
    
    Not built this drop — this is a criteria document, not a build phase set. 2 of 8
    conditions (idearium build pipeline, axiom compliance) are already
    genuinely DONE; the rest are real, open gaps named at their actual size
    (loom deciding-and-acting, not just mapping, is the single largest one).
    
    ## §REGISTERED 2026-08-30 (§6.3), third entry
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/2026-08-30-interaction-contract-context-phasemap.spec` | 0.1.0-phasemap | PHASEMAP | Real, distinct pieces of James's handshake/context/introspection ask NOT already covered by RR4 (handshake, expanded in the same commit) or the uploaded audit's #23 (adaptive-fulfillment, already built): context-by-UUID injection into agent chats, RAID's real test-env hook (cross-ref DOD7), a per-system intention taxonomy, and idearium's system template update — the last two deliberately sequenced after the others, not designed or written blind ahead of real usage data | 2026-08-30 (written; 4 new phases + RR4's own expansion verified parsing correctly against loom/scanners/phasemap-map.js's real loadAll() before commit) |
    | `docs/2026-09-01-living-model-and-autonomous-pipeline-phasemap.spec` | 0.2.0-phasemap | PHASEMAP | 26 phases (LM1-LM26) mapping James's registry-as-hub/watchdog-propagation, .spec-as-living-model, per-system tool index, RAID contract authorship, full agent-mesh pipeline wiring, deterministic agent-switch CLI, per-agent wake words, co-pilot ollama/guardian toggle, and successful-prompt caching via the crystallization engine — plus a longer secondary list (guardian agents-folder refactor, components store, master settings, per-system data decay). Each phase's status names the specific real, already-confirmed precedent it builds on, or states plainly that none was found and a design pass is needed first. recommended_start: LM1 first; LM9/LM10/LM12 independently buildable now; LM7/LM8 correctly depend on LM6 (contract-authorship) per this codebase's own RAID-governance ordering; LM18/LM19 (atlas survey + spec coverage) buildable now and gate LM20-LM26. LM18-LM26 (added 2026-09-19): a living, recursive, human-readable atlas per system for guardian, ollama, cortex, intelligence, diagnostic, clear-glass, loom and copilot — survey first (LM18), spec coverage (LM19), schema plus deterministic seed (LM20), FACTS extractors (LM21), structure ledger (LM22), history and calendar (LM23), PROSE layer (LM24), living update (LM25), completeness and release gate with an AX-015 draft (LM26). Mapped only, nothing built. | 2026-09-19 (LM18-LM26 added; verified as valid YAML with all 26 phase keys + recommended_start present, and phasemap-map.js loadAll() in loom reading all 26, before commit; 2026-09-01: written with LM1-LM17) |
    
    Not built — mapped only, per James's own explicit instruction ("Map it
    all first. Always."). Real, load-bearing findings baked into the phase
    descriptions themselves: intelligence/rfr2/enforcement/index.js's
    RuntimeGuard (RR4's own named guarantee-layer candidate) confirmed real,
    not aspirational; associative-lattice.js confirmed real and already
    tested (the audit's #21) as the actual context source IC1 would query;
    adaptive-fulfillment.js confirmed real and already IS the introspect/
    iterate loop James described (the audit's #23) — not re-opened as new
    scope, only its existing single-provider limitation remains open. All
    4 new phases (IC1-4) start PENDING, correctly sequenced so the taxonomy
    and template-update phases depend on the mechanisms they'd otherwise be
    designed blind ahead of.
    
    ## §REGISTERED 2026-09-01 (§6.3) — LM1, per-system living-model schema + real missing specs
    
    | spec | version | status | governs | last checked vs code |
    |---|---|---|---|---|
    | `docs/nexus-system-foundation-addendum-v1.3.0.spec` | 1.3.0 | proposed | Adds AX-013: three new, additive per-system spec sections (`history`, `gaps`, `version_history`) — the real schema LM1 called for. Additive/revertible, same convention as the v1.2.0 addendum. | 2026-09-01 (written against nexus-system-foundation@1.1.0) |
    | `clear-glass/spec/clear-glass.spec` | 3.1.0 | active | First real spec for clear-glass — written FROM the live `clear-glass/registry-components.js` contract (67 components), not from scratch. | 2026-09-01 |
    | `loom/spec/loom.spec` | 1.5.0 | active | First real spec for loom — routes traced directly from `loom/server.js`. | 2026-09-01 |
    | `docs/grammar-fallback.spec` | 1.0.1 | active | guardian's CLI grammar-resolution fallback (`guardian/lib/grammar-fallback.js`). Library module, not a service — placed in `docs/` per spec-drift.js's docs-fallback matching (no top-level dir of this name). | 2026-09-01 |
    | `docs/mutation-contract.spec` | 1.0.1 | active | orchestrator's component-mutation governance layer (`orchestrator/lib/mutation-contract.js`), implementing seam-component-registry-spec.md §9.5. | 2026-09-01 |
    | `docs/open-loop-taxonomy.spec` | 1.0.0 | active | The 10-type/5-state open-loop taxonomy (`lib/open-loop-taxonomy.js`) — 8 confirmed real consumers. | 2026-09-01 |
    | `docs/loop-topology.spec` | 1.0.0 | active | Focal-point/leverage-scoring module (`lib/loop-topology.js`). **Real finding**: zero confirmed live consumers — built and tested per its own header, genuinely disconnected. Flagged as gap LT1, not wired this pass. | 2026-09-01 |
    | `docs/gap-finder.spec` | 1.1.0 | active | Cortex's gap-emission organ (`cortex/gap-finder/index.js`) — listens for `anomaly.detected`/`sigma.event.*`, dedups against the live `gaps` table. | 2026-09-01 |
    
    `ollama/spec/ollama.spec` — **renamed, not rewritten**: `meta.name` corrected
    from `ollama` to `ollama-bridge` to match `lib/version.js`'s real
    code-version key. Content was already accurate and complete (confirmed by
    direct read); `spec-drift.js` had been reporting it missing purely because
    its own name-matcher doesn't bridge `ollama-bridge` <-> `ollama`. Given
    `history`/`gaps`/`version_history` sections per AX-013 in the same pass.
    
    **Live verification, not assumed**: ran `node orchestrator/lib/spec-drift.js`
    before and after this batch. Before: 45 synced / 0 drifted / 11 missing.
    After: **53 synced / 0 drifted / 3 missing**. The 3 remaining —
    `divergence-watcher`, `macro-compiler`, `gap-loop` — are deliberately NOT
    given specs this pass: checked directly and found none is a single-file,
    single-owner module the way the other 8 were. `divergence-watcher` is a
    route alias in `orchestrator/orchestrator.js` forwarding to cortex;
    `macro-compiler` appears only as a comment reference in
    `orchestrator/lib/sigma-compaction.js` with no dedicated module found;
    `gap-loop` is a conceptual label spanning a dozen-plus real files
    (`guardian/event-taxonomy.js`, `orchestrator/lib/autonomous-loop.js`,
    `intelligence/gap/*`, others), not one module. Writing a spec for any of
    these three would either claim false ownership or require a real design
    decision (which module IS canonical, if any) that's recorded as an open
    question in the addendum's compliance section, not silently guessed here.
    
    **Separate, pre-existing gap found and recorded (not fixed this pass)**:
    `loom/scanners/spec-map.js`'s own `SPEC_DIRS` allowlist (`docs`,
    `warp/spec`, `cortex/spec`, `idearium/spec`, `copilot/spec`, `bridge/spec`)
    does not include the ~24 other system-local `<system>/spec/` locations
    `spec-drift.js` itself already discovers — including, now, `clear-glass/spec`
    and `loom/spec`. Loom's own §6.3 coverage scanner is therefore blind to
    roughly a quarter of the real specs this registry now tracks. Named
    honestly in the addendum (SM1/SM2) as a separate, small, out-of-scope fix.
    
    ## §REGISTERED 2026-09-02 — Versionium-sovereign + cleanup phasemap
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec` | 1.0.0 | mapped-not-built | James's full-scope ask this session: Versionium promoted to a sovereign system (VS1-VS4), agent-suite consolidation decision (LM_AGENT_1), clear-glass process manager + native features + adblocker (CG1-CG3), cortex 3-tier memory + ledger reorg (MEM1-MEM3), and a 9-item filesystem cleanup track (CLEANUP1-9: .md migration, lib/orchestrator reorg, migrate-or-remove triage, guardian decomposition, clear-glass registry dedup, UI-to-system moves, hotswap living contracts, archive history backfill, agent context reduction). MAPPED, NOT BUILT, per §8.5 — this session's real, verified work (idearium fix confirmation, Versionium state/getState merge) landed outside the phasemap since it was bounded and didn't need mapping first. |
    
    Two real findings folded into this phasemap rather than fixed silently:
    `loom/agent-suite/index.js` is a deliberate, wired port of idearium's own
    agent-suite (Phase 141), not a stray duplicate — whether the two copies
    should consolidate into shared `lib/` infra is a real open decision
    (LM_AGENT_1). The `migrate or remove/` folder is real triage debt, not a
    naming mistake — one concrete sub-finding: its `cortex/versionium/` copy
    is a superseded pre-canonical version, safe to remove pending a tree-wide
    reference check (not yet exhaustive).
    
    ---
    ## Doc cleanup 2026-09-10 (root + docs/ monolithic overviews)

    Two passes, same session. First: 14 stale, session-dated docs that had
    accumulated at project root (old handoffs, patch notes, one-off audits,
    2026-06-27 through 2026-08-24 vintage) moved to
    `_archive/root-docs-consolidated-2026-09-10/` — git-mv'd, full rationale
    per file in that folder's own `README.md`.

    Second: the "separate, more careful pass" the 2026-08-09 entry above
    deferred — `docs/NEXUS-PHASE-MAP.md` (1287-1315 lines, phases 0-125) and
    seven related docs (`NEXUS.md`, `NEXUS-SPEC.md`, `NEXUS-SYSTEM.md`,
    `NEXUS-ENCYCLOPEDIA.md`, `NEXUS-PLAIN-ENGLISH.md`,
    `NEXUS-PHASE-MAP-CROSSREF.md`, `phase-map.spec` — the last already named
    "a dead, pre-v3.0-axiom ancestor" by `docs/META-SYSTEM-AND-SUBSYSTEM-SPECS.md`
    itself) moved to `_archive/superseded-docs-2026-09-10/`. All predate the
    per-system `*-phasemap.spec` convention this registry now indexes; none
    of it was the *current* living picture even before this move, per their
    own headers and per the 2026-09-10 architecture-brainstorm synthesis
    (`docs/2026-09-11-sovereign-node-architecture-phasemap.spec`'s own P1).

    One live functional reference found and fixed, not just a citation:
    `cli/session.js` (the real `SESSION.md` renderer) told every user to
    read `docs/NEXUS-SPEC.md` and `docs/AXIOMS-v1.0.md` — both stale.
    Repointed at `CLAUDE.md`, `docs/nexus.spec`, `docs/AXIOMS-v3.1.md`.
    `loom/data/registry.json`'s live entry for `docs/phase-map.spec` was
    left to self-correct on the next real `loom/bootstrap.js` run (that file
    is explicitly not git-tracked, regenerated fresh per environment).

    Not touched this pass: the ~180 remaining `docs/*.spec`/`docs/*.md`
    files, including every dated `*-phasemap.spec` (a genuinely still-
    current, accumulating convention) and `AXIOMS-v1.0/2.0/3.0.md` (a real
    version history — worth its own archive-or-keep decision, not rushed
    here). Full rationale per file:
    `_archive/superseded-docs-2026-09-10/README.md`.
    
    ## §REGISTERED 2026-09-26 — 0.39.264 COS test VM + Nexus atlas phasemap
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-26-cos-testenv-vm-and-nexus-atlas-phasemap.spec` | 1.0.0 | built (0.39.264) | The COS test VM for any repo (tar disk, detect, provision, setup, network cut), the written-out Nexus atlas with nested atlases for every system, Create/Build only inside a repo, Eravos new organism → Idearium idea/spec. T1–T3 were built before the map; the drift is recorded in the spec. ErosmancerOS starting with Clear Glass came mid-release and is addended to `erosmancer/spec/erosmancer.spec` and `clear-glass/spec/clear-glass.spec`. |
    
    ## §REGISTERED 2026-09-27 — 0.39.267–269 agent hat, agent memory, download manager
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-27-agent-hat-memory-download-manager-phasemap.spec` | 1.0.0 | built (0.39.267–269) | What Ollama was doing (copilot's self-test) and cutting it to 1 call / 10 min; intuition's crashes; vector memory reaching Ollama; copilot's "what have you been up to" (activity recall); one provider list; chunk and codebase builds wearing the repo hat (else the_builder) on ollama / copilot / a guardian agent; RAID's intent check reading the worn hat; guardian capturing code with its fences; the ChatGPT A/B chooser; agent memory as the Clear Glass download manager (record on every backend, recall before every call). Phases O–M were built before the map — the drift is recorded in the spec; X1 is the axioms pass. Addenda in copilot, idearium, guardian, ollama, clear-glass, loom and cortex specs. |
    | `docs/agent-memory.spec` | 1.0.0 | built (0.39.269) | lib/agent-memory.js — record/recall over the Clear Glass download manager, any backend. |
    | `docs/agent-providers.spec` | 1.0.0 | built (0.39.267) | lib/agent-providers.js — the one list of who can wear a hat; copilot resolved, never guessed. |
    | `docs/activity-recall.spec` | 1.0.0 | built (0.39.267) | copilot/lib/activity-recall.js — "what have you been up to", from records. |
    
    ## §REGISTERED 2026-09-27 — 0.39.270 Idearium atlas
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-27-idearium-atlas-phasemap.spec` | 1.0.0 | built (0.39.270) | docs/atlases/idearium-atlas.md rewritten from the code (the Agent tab end to end, the 13 repo tabs, the build path, the 217 routes), the old one archived, the atlas reference test holding it to 0 dead references, the Nexus atlas's Idearium paragraph corrected. Mapped before building. |
    
    ## §REGISTERED 2026-09-27 — 0.39.271 one Idearium, Phases, living spec, COS debugging, nodes
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec` | 1.0.0 | built (0.39.271) | The :9000 /idearium/ redirect; Versionium's repo lists (their own branch, newest first — they were the first 200 commits of every repo) and the whole-NEXUS Versionium view; one Idearium bar; the Phases manager (Roadmap + Phasemap, every phasemap form, build = snapshot then agent); the Spec tab as the living spec; COS suite / every test / debug reports; copilot's declared = served; per-system nodes + Guardian's .hat/.agent. Mapped before building. |
    | `docs/system-nodes.spec` | 1.0.0 | built (0.39.271) | lib/system-nodes.js — every system's capability/command/system nodes from the tree (declared vs served), Guardian's .hat/.agent, GET /api/nodes. |
    | `docs/phases-manager.spec` | 1.0.0 | built (0.39.271) | idearium/repo/phases.js — the Phases tab's model and routes; builds snapshot first. |
    | `docs/living-spec.spec` | 1.0.0 | built (0.39.271) | idearium/repo/living-spec.js — the repo's spec folder, parsed (meta, sections, version history, gaps, addenda). |
    | `docs/cos-debug-report.spec` | 1.0.0 | built (0.39.271) | lib/cos-debug-report.js — a failed run's error, repo frames and source lines. |

    
    ## §REGISTERED 2026-09-27 — 0.39.273 Idearium codebase toolkit
    
    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec` | 1.0.0 | built (0.39.273) | Idearium solid for building codebases: the measured chunker defects (1054 of 3584 chunks cut mid-body, 984 docs split from their symbol, chunks to 1253 lines), chunker v2, chunk cards, the search index, the edit engine, the code API and tools. Mapped before building. |
    | `docs/code-intel.spec` | 1.0.0 | built (0.39.273) | lib/code-intel (structural chunker v2, cards, BM25 search, grep), lib/code-edit.js, idearium/repo/code-api.js (/api/repos/:uuid/code/*), the eleven idearium.code_*.tool agent tools; the inject delete op and RepoLayer's real-bytes read/delete. |

    ## §REGISTERED 2026-09-28 — mapped on 0.39.274 (docs only, nothing built)

    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-28-staging-self-heal-phasemap.spec` | 1.0.0 | C0, C1 (0.39.277), S0, S1 (0.39.279) built; S2 onward open | Staging as the missing piece of the autonomous loop: branch fork point, code-edit stage/promote, heal loop onto staging, verify gate, score (compound), before/after tension, promote/auto-rewind, feedback, compound → failure-mode mapping, loom L1, atlases A1. |
    | `docs/2026-09-28-graph-build-context-settings-memory-phasemap.spec` | 1.1.0 | mapped, not built | Revised 0.39.277 for sovereignty (I12: every system self-contained, crossings only by declared contract; SV0 census in the graph, SV1 contracts, SV2 data, SV3 code) and re-grounded on 0.39.276 (D2: the linked code repo vs build-in-place). A dependency graph per repo (global-symbol + load-order + uses_member + SCCs); builds in the source repo, uncommitted, snapshot per chunk, path-gated; one identity and one compose so every build wears the hat with context locked on; graph-ordered chunk phases with contract-diff acceptance; full enterprise per-repo settings (identity, context, build, gates, promote, quotas, security, audit, export); memory bounded by rate, per-process tables, one writer per table. Atlas + loom map per file; L1/A1/X1 inside every phase. |

    ## §REGISTERED 2026-09-29 — mapped and built on 0.39.280

    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-29-build-surface-phasemap.spec` | 1.0.0 | BS0–BS11, BS13–BS19 built (0.39.280); BS12 = the release | The build surface: compartment windows, the rewind hit-test fix, file states, baseline deviation, environment check and options, spec → bottom-up phasemap with the axioms, build plan with gates, their API and UI (Files Manage, Spec build bar, plan panel, Start building, Settings environment), provider sovereignty, honest git errors, code-repo retirement, the provider login wall, co-pilot browser verbs, Sync & CI theme, the co-pilot user guide. |

    ## §REGISTERED 2026-09-29 — mapped and built on 0.39.281

    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-29-provider-economy-phasemap.spec` | 1.0.0 | EC0–EC10 built (0.39.281); EC11 = the release | The provider economy: tiers and limits per provider (lib/economy policy, usage ledger, gate), learned token limits (estimate-v1), the learning router (Thompson sampling, only when nobody chose), staging by tier, guardian enforcement at dispatch (wait / stop / a configured fallback, never a silent swap), the settings console's Provider economy page, browser steps with ErosmancerOS input, the ErosmancerOS workbench. Excludes, on purpose, anything that disguises automation as a person typing. Code version: lib/version.js modules['provider-economy']. |
    | `docs/2026-09-29-nex-node-store-phasemap.spec` | 0.2.0 | N0 census, N1 record + log, N2 types and gates built (0.39.300); N3–N13 open | The NEX node store (working name nexstore): every kept thing a node; a type declares its kind (record, ledger, ring, edge, lattice, blob, snapshot); one append-only, hash-chained log per system as the source of truth, with provenance on every record; state, indexes, graphs and lattices as projections; YAML nodes and .nex as views; versionium as positions in the log; one writer per system; pure Node. Relates to (does not replace) docs/2026-09-11-sovereign-node-architecture-phasemap.spec. ADDENDUM 2026-09-29: N14–N29 added (failure-mode field, contract history, settings without iframes, data migration, hardcode census, suite triage [mostly done], desktop login [done], event-gated steps, shadow/negative-space reasoning, ollama-first build + agent review, YAML node types only, Manage surface, contract-built work surface/TV UI, 700-zip history import, live-run findings, full-run-only failures). |

    ## §REGISTERED 2026-09-30 — mapped on 0.39.283, built toward 0.39.284

    | spec | version | status | governs |
    |---|---|---|---|
    | `docs/2026-09-30-idearium-coding-flow-phasemap.spec` | 1.0.0 | W0 done; W1–W6 open | Getting idearium to code its projects: no event-loop freeze on git, a plan that always lands (reply text, else derived from the spec), the work surface (changed files as diffs, tools), Create/Build back on the main bar, theme and CSS unity. |
    | `docs/2026-09-29-tool-layers-and-pane-memory-phasemap.spec` | 1.0.0 | built (0.39.278); P6 open | Tool layers (nexus.tools / nexus.tools_expand) and the co-pilot pane's own memory. Recovered 2026-10-01 from the nexus-14 zip — built in 0.39.278 but the map never reached git. |
    | `docs/2026-10-01-work-visibility-job-reuse-phasemap.spec` | 1.0.0 | D0, D2 ported (0.39.285); D1 superseded by 0.39.282 N20; J0–J7 open | Work visibility and job reuse: one work.* event, Guardian job nodes, background panel, build order → plan panel, cross-repo job reuse, pane memory → NEXUS via Guardian, stalled-build policy. From the nexus-14 fork (built on 0.39.278). |
    | `docs/2026-10-01-routing-registry-genesis-phasemap.spec` | 1.0.0 | done (0.39.286) | Pipeline routing and fallback (modes, chains, failure classes, breaker, hop provenance); the 11th spec block — the component registry and interaction contract as Guardian-style nodes; genesis the default template; the architecture spec cut to what exists. |
    | `docs/2026-10-01-idearium-agent-ready-master-phasemap.spec` | 1.10.0 — DK2 the desktop setup popup (0.39.340); DK3, DK4 mapped · 1.9.0 | PF1–PF5 (0.39.288), CT1 (0.39.289), IL1 the spec library (0.39.290), PV1–PV4 verify + prove (0.39.291), IL2 a library spec into the pipeline as a repo with its .spec file (0.39.292), DK1 the desktop image and login (0.39.293) built; CP1 copilot drives idearium and talks to its agents mapped; SW1 the spec workshop mapped; James's answers recorded (one account per hat or URL; GL1 the gate-verify-fix loop; UM1 Nexus understands James; IL1 his spec library as ideas) (never bypass the gate; RAID last, as the middle line; accounts picked for fallback; run in Sync & CI; Debug + Intelligence one tab); the rest open — 1.1.0 adds blocked-is-actionable, phase builds that write code, idea+phases in one tab, the tree's sort/restructure, the registry chunk in repo chunking, the code tab, docked panels, the context cascade (project → memory → web), data ingestion, Clear Glass accounts/private windows/drag wrapper, file merge/patch/drop, the promote-to-spec template catalogue, isolated run + environments | Everything still open, in one map: boot and sync performance; failure modes and the fault taxonomy in idearium (failure-mode field, routes, pre-flight); compounding iterate (a locked verified baseline, additive-only gate); registry-driven moves; the hat agent on the COS build surface; a coding-agent provider; the UI moves; the settings retheme. Points to J0–J7, N0–N26 and W7 rather than copying them. |
    | `docs/2026-10-02-workshop-codex-rewind-phasemap.spec` | 1.6.0 | SW1 the spec workshop built (0.39.294); SW2 its own page in the Void's look (0.39.297); AR2 ARCHITECT built on loom + the component store (0.39.298); AR3–AR5 both Architects rebuilt on one canvas stripped from MASTERMIND (0.39.299); mapped: RW1 the rewind engine (VM snapshots like VMware), DP1 the desktop popout's options, CX0 CODEX (the component store grown into CodeFactory's model), AR2 Architect in the workshop, BP1 destroy-and-rebuild blueprint, PL1 one entry point (idea → workshop → architect → blueprint → repo → COS), GD1 guardian supervises COS, UI12 the workshop surface (the old spec builders retired + archived), NX1 NEXUS in a VM | James's pipeline from idea to COS, the workshop first. |
    | `docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec` | 1.0.0 | built (0.39.300): VX1 versionium degrades, WS3 the pipeline together, AZ1 semantic zoom, SY1/SY2 gap synthesis, LV1 filled by leverage | Synthesis of Nexus's own gaps in intelligence, ranked by leverage, and the fill. |
    | `docs/2026-10-02-fractal-graph-any-size-agent-phasemap.spec` | 1.0.0 | mapped, not built | The containment tree, token budgets, summaries up the tree, context for any size agent, recursive build; the whole workshop; versioned UIs in compartments. |
    | `docs/2026-10-02-emerge-field-memory-build-phasemap.spec` | 1.7.15 | FV0 (fulfil a taken Fiverr order — FV1's first slice; the buyer's conditions as the end state; copilot as the repo agent, working it out with its tools; deliver_check as a tool) mapped 2026-10-05; PR1, PH1, IN1, IN2a, IN2b, GA1 built; EV0 (3)(4)(5); EM0 (1)(2) done, (3)(4) wait on emergence-6.zip; EV0 (1) done but warp, (3) built | EMERGE (James's Rheon constraint field as code: deterministic core, probabilistic shell), WARP 2 his own (the causal link, not SISO's event), CFR improved with RFR2 (typed edges, bounds, physics, rewind, liminal), one relational field with every graph as a Lens, one write path, the recall triad + context table, gap-driven search, field memory, recipes, crystallization, agents audited by the liminal detectors, CFR as a build logic, analysis→synthesis→code, the CAUSAL spec block, the workshop's parts + modes, the repo main chat; 1.1.0: exact local tokenizers + the economy pricing builds, shadow space, Guardian the Clear Glass agents' one truth, COS + Idearium as build teams, client jobs (Fiverr), settings, and a wiring row per phase (nodes, routes, CLI, loom, settings); 1.2.0: Claude Code working from inside Nexus (MCP + introspect), Claude Code as a provider, multiple accounts into the agents, economy and settings; 1.3.0: the event contract, isolation and declared systems for every phase, EV0 (taxonomies + contracts for every system it touches, a drift check); 1.4.0: a declared value on every phase (read by synthesis), UI0, a value-first build order; 1.5.0: PR1 the proof run (delivery checker), PR2 screenshots, LB1 the end-state lab, FM1 failure modes mined, MS1 mental simulation; 1.6.0: RD1 RAID complete-or-build, DA1 domain-agnostic end states, GL1 the graphs as a model; PR1 built (0.39.302); 1.7.0: PH1 phase runs end in proof (next), GG1 the graphs generate code, CL1 the Component Lab, CX0, E18 the judge never edits the judge, E19 where the graphs live |
    | `docs/2026-10-02-spatial-void-phasemap.spec` | 1.1.0 | V1–V7 built (0.39.295); capitals + the enterprise pass (0.39.296): the Spatial Void rebuilt from Nexus v0.54 as its own page — local OFL fonts, the engine (linked dials, tension, the old engines as voices, echoes, take in his words, drift), ideas carry void, /api/void + CLI, the page, replaces Ideas and Brainstorm | The idea station of the pipeline: James's ideas, never the agent's. |
    | `docs/build-context.spec` | 1.1.0 | built (0.39.328, 0.39.329) | lib/build-context.js (what a build agent knows about the file it writes: builds on, relations, used by, proven primitives, invariants), the file prompt's full / by-interface split, the four editable build blocks in lib/repo-prompt-blocks.js, the speceng.build dispatch that sends them. |
    | `docs/2026-10-05-verified-primitives-phasemap.spec` | 1.1.0 | VP0 and VP7 built (0.39.330; VP7's test on Clear Glass 0.39.331); VP1–VP6 open; systems: and value: declared (0.39.332) | The verified-primitives loop in James's words: confidence from evidence (build verdict, proof conditions, Clear Glass, reproduced adversarial findings, agent record), adversarial review through lifeline (independent, a finding counts only when it reproduces), the repo's lens on the one model of the user (communication gaps, the session ledger), the primitive field (the component store tiered draft → proven → crystal — the entry gate of CX0/CL1/MR8), provenance for every primitive, debug and intelligence in the Debian desktop VM. |
    | `docs/2026-10-05-cli-data-code-phasemap.spec` | 1.4.0 | SY2 cos is its own system, the 16th (0.39.341); CL/DS/CT open; HG7, HG8 done (0.39.333); SY1 the 15 systems done (0.39.334); HG1–HG6, HG9 open | 1.1.0 (0.39.332): HG1–HG7 defects found on the way, the session inventory (every request → its phase); 1.2.0: HG8 | The Agent tab as the endpoint for every system's CLI (declared .command verbs, through RAID, no shell); each system owns its data with cortex as the catalog and associative lattice (extends sovereign-node P5); the Code tab as the one review surface for new code (one pending-change path: proposed → staged → applied → committed; Changes · Generation · Search). Records the coder's input and four open questions. |
    | `docs/2026-10-05-fiverr-guide-phasemap.spec` | 1.0.0 | mapped, not built; paused on James's word (Fiverr orders first) | FR1 a popup guide in Clear Glass Settings › Autofill › Fiverr gigs that walks the whole Fiverr path, built on the existing gig writer (content in one pure module, limits from gig.js); FR2 "show me" — the spotlight rings the matched field (needs a cgId-aware driver action). |
    | `docs/2026-10-05-cos-machines-phasemap.spec` | 1.0.0 | mapped, not built (0.39.340); nothing started — James to choose the first phase | VM1 VMware-style control on QEMU (pause, live snapshots, checkpoints, rewind); OS1 compartments as operating systems (debian, android via Android-x86 + adb, bring-your-own ISO); OS2 images downloaded, verified and kept current (HTTPS + checksum, Clear Glass where a page needs a browser); AP1–AP3 a native Android build compartment (SDK + Gradle, no WebView wrapper), tests on an android compartment, enterprise release (R8, signed APK + AAB, keystore as a secret); EL1 an Electron compiler (AppImage/deb, Windows in a Windows compartment; no macOS in a VM). |
    | `docs/2026-10-07-compartment-control-and-activity-phasemap.spec` | 1.0.0 | CC1 built (0.39.367); AL1 built (0.39.368); AL2 built (0.39.369); DT1 built (0.39.370); VM1 + CK1 built (0.39.371); NC2 built (0.39.372); BO1 built (0.39.373); CM1 built (0.39.374) — every capability a command; CM2 built (0.39.376) — every command for every agent; UN1 · SP1 · DC1 · DX1 mapped (copilot drives the UI, spotlight, dead clicks, diagnostics) | One write path for every agent's files (land(): Claude Code's diff included — a Nexus repo always through approval), one durable activity log per compartment (Tasks, a Log view, BrainOS), the repo's COS desktop as a source of it, VM1's checkpoints written on its rows (the log is the rewind), Nexus systems as nested compartments with supervisor-routed controls. NC1 answered: the live tree only through the approval gate; a Nexus system's desktop runs a copy. |
    | `docs/2026-10-07-versionium-releases-phasemap.spec` | 1.0.0 | VR1 built (0.40.0) — every change a commit; MAPPED — LT1 cortex provenance lattice, VR2 history and diff, RN1 release node + tag, RN2 cortex the bookkeeper, RN3 releases section, GH1 git bridge | James: "link the releases with versionium. needs to snapshot every accept, every change, diff, write, only the changes. like github … i want to replace it for myself." Versioning: patch = minor improvement, minor = a phase, major = James's milestone. |
    | `docs/2026-10-07-runtime-load-phasemap.spec` | 1.4.0 | PF1 (0.40.1), PF3 (0.41.0), PF4 (0.42.0), PF5 (0.43.0) built; PF1 built (0.40.1) — the 5-min cortex stall (update by id); MAPPED — PF3 append not rewrite (the store re-read and re-wrote whole tables per write), PF4 hold only what you read (OOM), PF6 slow ticks name themselves, PF2 liminal velocity steers the governor, PF5 bounded tables | James: "whats up with the optimization? it seems almost worst? also liminal space with the velocity, like use that also?" |
    | `docs/2026-10-07-heal-nodes-phasemap.spec` | 1.0.0 | MAPPED — HL0 runtime faults (crash, breaker, stall) reach the self-heal ladder, HL1 the .heal node (failure → cause → fix → proof → outcome), HL2 level 0 replays proven heals, HL3 heal before it breaks (liminal forward inference), HL4 the heal ledger | James: "also diagnostic system and self-heal system, creating .heal nodes? for repairing nexus?" |
    | `docs/2026-10-07-system-expectations-phasemap.spec` | 1.0.0 | MAPPED — EX1 schema.expectation as an `expects` block in every interaction-contract.json, EX2 vitals from every process (preloaded by autopilot), EX3 the diagnostic reads expectations (silence is a reading), EX4 intelligence learns the normal (declared vs learned, drift, tension), EX5 time to breach | James: "yes, lets improve the intelligence system. maybe make the schemas for the diagnostic system for the expectionn for each system." |
    | `docs/2026-10-07-ollama-recorder-phasemap.spec` | 1.1.0 | OR1–OR3 built (0.44.0); MAPPED — OR4 live and what-if, OR5 model vitals. OR1 one door to Ollama, OR2 every call a frame (seed, digest, prompt/answer blobs, timings), OR3 the cassette (replay as recorded, no Ollama), OR4 live and what-if replay, OR5 model vitals | James: "can we use the rewind engine on ollama? like record ollamas process as a macro?" |
    | `docs/2026-10-07-idearium-one-surface-phasemap.spec` | 1.1.0 | BUILT 0.47.0 — OS1 commits say what they touched (history by file), OS2 the plan panel holds tasks · log · control · versions · machine (no second drawer), OS3 the Code tab knows its file's history, OS4 every agent option in the Agent tab, OS5 settings without iframes, OS6 proved on the real page | James: "thats supposed to be a idearium feature. also needs to look like the rest of it like the plan panel. also hooked into the code tab" · "all agent options go into the agents tab" |
    | `docs/2026-10-05-build-from-the-spec-phasemap.spec` | 1.19.0 — SB39 one agnostic context tool (0.39.339); 1.18.0 — SB38 prerequisites, the questions first (0.39.338); 1.17.0 — SB37 the working set (0.39.337); 1.16.0 — SB36 every agent can use the tools (0.39.336); 1.15.0 — SB35 the index is there when the agent asks (0.39.335); 1.10.0 — SB28 genesis in the real systems' shape, SB29 the build flow in his order (compartment until committed); 1.9.0 — SB17 done (0.39.313); SB24 loom builds a system, SB25 atlas template, SB26 an imported project shows its progress, SB27 expanding keeps spec + phases current; 1.6.0 — SB23 a new system slots in (systems declare themselves; the four hand lists become readers); SB22 the default via the scaffold; 1.5.0 — every phase opens with James's words (james:), the coder's own phases marked; SB22 every component: capability, command, events, each a node (the system template: SB16 genesis nodes domain built before mapped, SB17–SB19 open, SB4 widened; ownership SB20 and deterministic expansion SB21 open) | SB1–SB3 (0.39.305), SB12 the registry drives the build (0.39.309) built; SB4–SB11, SB13–SB15 open; each phase names the older one it overlaps | 1.1.0: the whole pipeline in his words — promote with every block's options and a write-in, the .spec file as the artifact, reuse keyed on the contract with tokens saved measured, each block chunked, the registry as the component list / dependency graph / file checklist, each component chunked, reuse that compounds. 1.0.0: Nexus builds from the spec, and itself from within: the standing templates frame every new spec by default (specs.default_templates), the author's words seed it (setAuthorWords), a domain-agnostic section prompt; mapped: template fidelity against every kernel, a kernel rebuilt from its own spec in a COS branch (ollama-bridge first), hundreds of specs as a resumable reuse-first queue, domain file-tree templates. Found on James's DAW spec. · From branch claude/nexus-idearium-overview-yoguem (renumbered on merging main): SB1–SB3 built (0.39.305), author-reuse fix (0.39.306); BC1 (0.39.328, drift recorded), BC2 (0.39.329) built; SB4–SB14, BC3, BC4 open · 1.3.0: BC3 what a build was sent as a node, BC4 relational-context wired or archived; systems: and value: declared. 1.2.0: BC1 the build context, BC2 the build agent gets all of the hat/repo context through the editable prompt blocks. 1.1.0: the whole pipeline in his words — promote with every block's options and a write-in, the .spec file as the artifact, reuse keyed on the contract with tokens saved measured, each block chunked, the registry as the component list / dependency graph / file checklist, each component chunked, reuse that compounds. 1.0.0: Nexus builds from the spec, and itself from within: the standing templates frame every new spec by default (specs.default_templates), the author's words seed it (setAuthorWords), a domain-agnostic section prompt; mapped: template fidelity against every kernel, a kernel rebuilt from its own spec in a COS branch (ollama-bridge first), hundreds of specs as a resumable reuse-first queue, domain file-tree templates. Found on James's DAW spec. |
    | `docs/2026-10-05-announce-pulse-repair-phasemap.spec` | 1.0.0 — PR1 the announced registry is the list, PR2 the diagnostic listens not polls, PR3 negative space for missed heartbeats (WARP 2 expectations), PR4 deviation raises the bpm, PR5 repair for real (restart through autopilot; code repair only through the shadow space, his call) | mapped | James: "remove the polling then. need the systems to anounce themselves … use negative space reasoning for missed heartbeats … with the ability to actual repair nexus." Four pushbacks recorded for him. |
    | `docs/2026-10-05-idea-to-spec-workshop-phasemap.spec` | 1.0.0 — WK0 pop-out windows borderless (built 0.39.345); WK1 the workshop is blocks from the templates, WK2 templates edited/saved/removed, WK3 the agent drafts every block, WK4 the void feeds the workshop, WK5 lanes feed gaps and phases, WK6 enterprise grade | WK0 built; WK1–WK6 open; extends WS5, WS6, UI0 | James: "the spec workshop was supposed to use blocks … the spacial void is supposed to feed into the spec workshop pipeline … edit, save, and remove spec templates." Four pushbacks recorded. |
    | `docs/2026-10-05-spec-workshop-rebuild-phasemap.spec` | 1.2.0 — RS3 + RS9 done (0.49.0), RS10 (0.50.0), RS11 (0.51.0); + RS9 the thread (spec blocks ⇄ phases ⇄ runs ⇄ files), RS10 the Phases tab rebuilt, RS11 workshop and phases one surface (recovered from an unmerged branch); — RS1 the generation recorder (macros), RS2 replay · rewind · branch, RS3 the spec document (blocks with custom ids over the real .spec / .eg text), RS4 the pipeline on WARP 2 (deterministic first, the model gated), RS5 the template picker, RS6 the workshop as the editor, RS7 architect and blueprint stations, RS8 what converges becomes deterministic | mapped | James: "rebuild the spec workshop … record the generation process from the agents and create a macro or replayable file to rebuild or reconstruct data using events, snapshots etc." Supersedes WK1–WK3. |
    | `docs/2026-10-09-hardening-pass-phasemap.spec` | 1.0.0 — HP1–HP12 done (0.52.0–0.55.1); HP13–HP22 done (0.55.2): the stack run end to end with tests/sim/fake-tab.js — the right gate, pickup in 90 s, a typed prompt never re-sent, a job nobody waits for cancelled, no tab said in 45 s, auto tries agents with a tab first, a routing try is not a job, the economy's hold said, a missing tab is not a login wall | done | James: "Do the hardening pass" · "loop simulations of every deep and drecursive test and debug method you can for idearium and the agents". A pinned agent's next rung stays with ME5. |
    | `docs/2026-10-10-idearium-solid-phasemap.spec` | 1.0.0 — what "solid" means (six checks) · SD0–SD3 done (0.56.0): versionium's reset → 413 and Idearium waits for it, ⟲ versions and rewind on the repo's box, copilot never ok with nothing, the person before background builds · SD4–SD10 open, SD10 the adversarial gate for every output (his answer to the filler problem) | in progress | James: "maybe we get idearium solid then start finally using nexus to build nexus" · "the adversarial is a gate for each output". |
    | `docs/2026-10-09-one-model-engine-phasemap.spec` | 2.2.0 — checked against the nexus, idearium, guardian and copilot specs and atlases: his standing rules (a chosen agent is the only one tried, tokens last, nothing guessed, sign-in never moves on), his words on the first model in order, ten drift items, what already exists (economy job types × tiers, learned token limits), ME15 the docs tell the truth. 2.1.0 — corrected against RAID's atlas, spec and axioms (§5.2, §9, §15): RAID is the brain and the learner, copilot the door; folds raid-routing-fidelity RR1/RR2/RR3/RR6 and agent-intelligence-loop AP4. 2.0.0 rewritten from a full scan: inventory of every transport, service, chooser (8), ladder, learner (7), breaker, drainer (3), recorder and setting; to_prove (a suspected double dispatch through RAID's drainer first); ME0 the inventory proved, ME1 one failure list, ME2 caller policy, ME3 one engine one budget, ME4 one attempt record, ME5 one chooser, ME6 one learner, ME7 RAID's spine joins, ME8 the drainers run the engine, ME9 the layers below report, ME10 nested ladders folded, ME11 old settings translated, ME12 callers moved, ME13 no bypass, ME14 across callers | mapped | James: "Wait. I meant idearium needs escalating retry logic, and fallback routing. … Your aren't fragmenting everything are you?" · "What about hooking in raid?" · "Doesn't it have a drainer." · "Okay. Map thoroughly before moving. That was supposed to be the point of the map." · "Look at the raid engine atlas and spec" · "okay. deeply check, nexus idearium guardian and coipilot specs and atals". Four calls left to him (decide:). Ahead of RS1. |
    | `docs/2026-10-09-one-roadmap-phasemap.spec` | 1.0.0 — the census (1,136 phases, 94 maps: 422 done, 31 in progress, 683 open), the path (one engine → the loop in Idearium → Idearium holds the systems), OR1 five answers for an open phase (PATH · LATER · DONE-ELSEWHERE · FOLDED · RETIRED), OR2 the coder's proposal per map, OR3 his decisions applied, OR4 one roadmap in Idearium, OR5 it stays decluttered | mapped | James: "i have a mentor. he codes. can you get us there. idearium is also meant to hold the systems for me. we also need to declutter the roadmap." Nothing deleted (§0.3). |
    | `docs/2026-10-05-failure-reproduction-phasemap.spec` | 1.0.0 — FM1 every ledger into rfr2 (edges typed at ingestion), FM2 a failure is a clip (the reproduction macro), FM3 run it in COS (reproduced; a fix proven; kept as a test), FM4 the failure mode report | mapped | James: "thats how i want failure mode reports, like creating a macro to reproduce the bug and be able to run it cos." · "using the event ledgers, debug system, and intelligence system. interaction contracts. each system has a full event ledger … using rfr2" |
    | `docs/2026-10-05-code-tab-and-one-router-phasemap.spec` | 1.0.0 — CT1 one door for models (copilot decides who and which model; pipeline-routing is its policy), CT2 it learns and switches (failure classes and the verifiers' word), CT3 the Code tab is the work surface, CT4 Ollama checked on his machine, CT5 hooked into the Plan, CT6 the escalation ladder, CT7 the plan shows current work, CT8 live agent activity, CT9 the Plan's pull tab | done — CT1–CT9 (0.39.353) | James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it. failure modes, dynamically switch models, if its not equipped for the task" · "make sure ollama is all wired into idearium." |
