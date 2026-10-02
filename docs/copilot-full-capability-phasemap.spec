spec:
  meta:
    name:        copilot-full-capability
    version:     0.1.0-phasemap
    status: >-
      ALL 11 PHASES DONE 2026-08-12 (same session, ninth and final pass).
      written per §8.5 (map before build), §3.1 (build order:
      substrate before logic before surface), §16.5 (wrap what's built, don't
      duplicate). Continues docs/copilot-omniscience-phasemap.spec (P1-P7, ALL
      DONE) and the schedule_task/register_trigger/nexus_heal/loom_scan session
      (2026-08-12, also done). This phasemap covers what those did NOT reach.
    uuid:        nexus-copilot-full-capability-v0-0000-2026-0812-001

  goal: >
    Close every remaining named gap between what James asked for and what copilot can
    actually do: recall across BOTH copilot's own conversations and other agents' chat
    logs by participant ("did I talk to Y about X"); never answer "no" without first
    trying capability-extend's filed-gap path; the full COS toolkit (mental simulation,
    compartmentalization, branching, archetypes) reachable as tools; RAID's decision
    engine and SNR filter queryable, not just internally consulted; clear-glass's
    browser/URL surface wired as tools, backend-first; a settable identity; and the
    standing Nerve+DOM→Ollama continuous stream. Same rule as before: wrap what exists,
    build only what's actually missing.

  substrate_verified_2026_08_12:
    recall_today:      "cortex/push-recall.js — CortexPushRecall.recall(intent, context, tier). 7 INTENT_LANES (debug_failure, gap_fill, session_resume, causal_trace, pattern_lookup, crystal_query, general), each a lane-set over ONE unified memory store. No participant/agent axis — cannot scope to 'what Y said'. query_recall (lib/agent-tools/tools/query-recall.js) exposes this read path but inherits the same no-participant-scope limit."
    chat_log_tables:   "cortex/memory/jaa-db — TWO separate tables already populated: chat_log (253 rows, copilot's own) and guardian_chat_log (168 rows, guardian's provider conversations — claude/chatgpt/gemini/mistral). Confirmed present and real, never joined or queried together."
    never_say_no_today: "copilot/adaptive-fulfillment.js — iterate/reflect/re-route via RAID + lib/reflection.js + lib/open-loop-taxonomy.js, WIRED at copilot/server.js:974. copilot/capability-extend.js — 'no is not an answer', files a capability-extension gap via POST /api/gaps instead of refusing — built, NOT wired anywhere (grepped copilot/server.js: zero matches). The two are meant to compose: adaptive-fulfillment exhausts known agents/approaches FIRST; capability-extend is the true last resort when nothing fulfilled it."
    cos_today:         "cos/playground/{sandbox,compare,branch,llm-lab}.js and cos/host/gates/{compartment,archetype,playgrounds,blueprint,plugin,process,vault}.js — all real classes/gates, zero requires from lib/agent-tools or copilot/ (grepped both trees). SandboxRunner + CompareEngine + LabManager/LabSession (mental-simulation: run a scenario, compare two runs, score a verdict) and CreateCompartmentGate/StartCompartmentGate/StopCompartmentGate/DestroyCompartmentGate (compartmentalization) are the two clusters James named explicitly."
    raid_snr_today:    "cortex/core/raid/index.js — _decide, recordOutcome, recordDecision, _approveTool, health poll; persists to raid_decisions (18 rows) + raid_tunables (5 rows). cortex/core/raid/snr-filter.js — tested (tests/modules/test-snr-filter.js). Both consulted INTERNALLY by RAID's own routing; NEITHER is a callable agent-tool, so copilot cannot be asked 'why did you route that' or 'run SNR on this' directly."
    clear_glass_today: "clear-glass/src/copilot/bridge.js already gives full tool/DOM/browser control; lib/agent-tools/tools/browser-action.js wraps navigate/dom-query/dom-mutate/driver-exec/cookie through guardian's browser provider. clear-glass/src/driver/url-listener.js exists (a real module) but is NOT reachable from browser-action.js or any agent-tool — grepped, zero matches. 'Testing URLs, creating a listener for a URL' has no tool path today despite the backend module existing."
    identity_today:    "copilot/lib/self-model.js tracks identity EVIDENCE (reflection.trackIdentityEvidence + constitutional-ai's identity kernel) — read-only inference, no settable custom name/persona field anywhere in the tree (confirmed grep, session 2026-08-12 earlier)."
    stream_today:      "lib/nerve/index.js — Phase 1, GLOBAL field only (coherence/friction/entropy), read-only by design invariant (§attention-non-truth). ollama/server.js — jobs are stream:false, discrete request/response. clear-glass DOM archaeology emits to its own SSE, not into ollama's context. No standing channel exists (confirmed session 2026-08-12 earlier)."
    git_loom_cortex:   "loom/scanners/phasemap-map.js ALREADY resolves the real git commit per phase transition (_gitHashFor, execFileSync git log). lib/manifest.js ALREADY does per-system sha256 drift tracking, deliberately NOT per-system git (single-repo decision, documented 2026-08-08). No gap here — 'always update loom's maps / cortex models / git' is a WORKING RULE for this and future sessions (re-run loom_scan + let cortex's own write-before-respond axiom (AX-003) hold + commit), not a missing subsystem. Carried as a rule below, not a phase."
    stray_tools_audit_2026_08_12: "Grepped ollama/, copilot/, guardian/ for any {name, description, parameters, execute} tool-shaped file living outside lib/agent-tools/tools/ — ZERO found. Every real tool already lives in the one canonical location. 'Move if needed' resolved: nothing to move. This finding stands until the next audit; not re-checked per phase below."
    tv_ui_spotlight_nerve_audit: "ui/tv-shell/ has no server routes of its own beyond what ui-tools.js's ui_spotlight/ui_nerve already wrap (spotlight/on|off|step, nerve/on|off|sigma) — it's a static shell served by the UI host. Both tools were built in the omniscience phasemap (P8, DONE). No gap here."
    rewind_replay_today: "clear-glass/src/rewind/engine.js — a complete RewindEngine class (session snapshot/restore), zero agent-tool coverage. Same shape as url-listener.js: real backend module, no tool path."
    meta_systems_today: "meta/{alk,alk-perception,bda,cfr,gap,lattice,liminal,rfr2,spatial,telemetry-codec,topo-kernel} — 11 subsystems, NONE run their own HTTP server (grepped for createServer/listen across all 11 — zero). All are pure lib modules consumed INTERNALLY by other systems (e.g. query_intelligence's 'mastermind' action already reaches RFR2 through mastermind.js's own lib/rfr2-bridge.js — 'no separate RFR2 action exists because RFR2 has no HTTP surface of its own', per that tool's own header). Confirmed zero requires from lib/agent-tools/ into meta/ anywhere. A real, total gap, but each of the 11 needs its own real-export inventory before wrapping — same discipline as the COS toolkit phase, not assumed from directory names."
    load_balancer_today: "NO load balancer exists anywhere in the tree (grepped 'load.?balanc' system-wide — zero matches). What DOES exist: cos/watchdog/monitor.js (WatchdogMonitor — startMonitoring/stopMonitoring/getMonitor, per-compartment) and cos/watchdog/proc-stats.js (readProcStats(pid) — real linux/win32 process stats). 'Load balancer using resource monitor' is genuinely NEW logic on top of real substrate, not a wrap — flagged as a decision point below, not assumed."
    nexus_help_today: "copilot/lib/nexus-awareness.js — systemRundown/whatsWrong/answerAbout(prompt, opts) — already IS 'ask co-pilot anything about NEXUS', built complete. But it is wired ONLY as an HTTP-path intent-classifier shortcut inside copilot/server.js:1091-1093 — outside the agentic tool loop entirely. The loop itself (mid multi-step reasoning) cannot call it; nexus_status (the loom-concerns/impact tool) does NOT include it either — checked its real ACTIONS keys directly. Separately: no docs/spec full-text search tool exists anywhere — 17+ files in docs/*.spec are readable only by a human or by loom's own narrow phasemap/spec-map scanners, never as free-text 'explain X' lookups. 'Expand, build, or create what's needed' is ALREADY covered — capability-extend.js (P2), module_builder, and forge_tool are complete and, once P2 lands, compose exactly as asked: try everything (adaptive-fulfillment) → explain what's known (this gap) → build what's missing (module_builder/forge_tool) → if still short, file it (capability-extend). No new phase needed for that half."

  # ── PHASES — dependency-ordered. Each independently shippable and gated. ──
  phases:

    P1_cross_agent_recall:   # ← DONE 2026-08-12 — as a standalone tool, not a push-recall edit
      why_first: "Smallest true gap, no dependency on anything else here — extends a working module (push-recall) rather than building new plumbing."
      does: >
        Add an 'agent' scope to recall: a new intent-independent filter param on
        CortexPushRecall.recall (or a sibling query) that can target chat_log,
        guardian_chat_log, or both, and can filter by participant/provider
        (claude/chatgpt/gemini/mistral/ollama). Extend query_recall's tool schema
        with `scope` ('mine' | 'agents' | 'all') and `withAgent` (provider name).
      axioms: "§16.5 (extend push-recall, don't build a parallel recall), §10.3 (one recall path, two stores it can address)"
      gate: "'do you remember when we talked about X' resolves from chat_log; 'do you remember when I talked to Y about X' resolves from guardian_chat_log filtered by provider=Y — both through the same query_recall tool, proven with two real prior conversations already in the store."

    P2_never_say_no_completion:   # ← DONE 2026-08-12
      why: "Wires an already-built module (§16.5 — no new code for the refusal path itself); the missing piece is a two-line require + call, same shape as the P1 wire for stream-digest."
      does: >
        Wire capability-extend.js into copilot/server.js's response path as the
        fallback AFTER adaptive-fulfillment.js's iterate/reflect/re-route exhausts
        every agent it can try. Order matters: adaptive-fulfillment tries harder
        FIRST; capability-extend only fires when that returns genuinely exhausted,
        not on the first failure.
      axioms: "§0.4 ('I can't' becomes 'not yet — here's the work'), §1.2 (no silent dead end)"
      gate: "a request with no matching tool AND no agent that can fulfill it does NOT get a bare refusal — it gets 'not yet, tracked as gap #N', proven against a request built to have no real handler."

    P3_cos_toolkit_tools:   # ← DONE 2026-08-12
      why: "Standalone wrap, no dependency on P1/P2. Two tool files matching the two clusters James named."
      does: >
        cos_simulate (wraps cos/playground/llm-lab.js's LabManager/LabSession +
        compare.js's CompareEngine — run a scenario, run a variant, diff/verdict
        the two) and cos_compartment (wraps cos/host/gates/{compartment,
        playgrounds,archetype}.js's gates — create/start/stop/destroy a
        compartment, assign/detect an archetype). Thin wrappers only (§16.5) —
        the gates and engines keep their own logic.
      axioms: "§16.5, §10.1 (COS keeps owning its own execution semantics)"
      gate: "copilot runs a mental simulation via cos_simulate and gets a real verdict object back, then spins up and tears down a real compartment via cos_compartment — both against the live COS host, not a mock."

    P4_raid_snr_query_tool:   # ← DONE 2026-08-12
      why: "Standalone. Makes RAID introspectable — 'why did you pick that agent' becomes answerable — without touching RAID's own routing logic (too consequential to wrap loosely; read-only surface only)."
      does: >
        raid_query tool: actions 'decisions' (recent recordDecision rows),
        'tunables' (current raid_tunables), 'snr' (run snr-filter.js against a
        given input, return the filtered signal). Read-only — no action that
        calls _decide or _approveTool directly; those stay RAID's own, not a
        second entry point (§10.3).
      axioms: "§10.3 (introspect, don't compete with RAID's real routing path), §2.3 (state observable)"
      gate: "copilot answers 'why did you route that request to ollama and not guardian' by reading a real raid_decisions row, not a guess."

    P5_clear_glass_url_tools:   # ← DONE 2026-08-12 — folded into browser_action.js's REAL_ACTIONS fix
      why: "Standalone; explicit instruction to go backend-first. url-listener.js already exists — this is a wrap, not a build."
      does: >
        Extend browser-action.js (or a sibling url-tools.js) with actions backed
        by clear-glass/src/driver/url-listener.js: 'listen' (register a listener
        for a URL pattern, backend-only — no UI), 'test' (fetch/probe a URL
        through clear-glass's driver, returns status/headers/timing), 'unlisten'.
        Explicitly backend-first per instruction: no renderer/UI work in this
        phase even though clear-glass has UI surfaces (renderer/browser.html) —
        those are a later, separate phase if wanted.
      axioms: "§16.5 (wrap url-listener.js, don't reimplement), backend-first per direct instruction"
      gate: "copilot registers a real URL listener through the tool and it fires on a real navigation event, proven against clear-glass's live driver, no UI involved."

    P6_identity_naming:   # ← DONE 2026-08-12
      why: "Standalone. Smallest structural addition — one settable field plus read/write tool actions."
      does: >
        Add a settable `customName`/`persona` field to copilot/lib/self-model.js,
        separate from the evidence-based identity inference it already does
        (naming is a USER decision, not something to infer). New self_model tool
        actions: 'setName', 'getName'. whoAmI() prefers customName when set,
        falls back to inferred identity otherwise.
      axioms: "§1.1 (a set name is real data, not inferred — never fabricated the other way), §10.1"
      gate: "co-pilot is renamed via the tool, a fresh session still answers with the set name (persisted to cortex), and reverts honestly to inferred identity if the name is ever cleared."

    P7_continuous_nerve_dom_to_ollama:   # ← DONE 2026-08-12 — final phase, full chain live-verified
      why_last: "Largest structural lift — a genuinely new standing channel, not a wrap. Depends on nothing above but benefits from P4-P6 existing first as smaller proofs of the same wrap-vs-build discipline before the harder build."
      does: >
        Three real pieces, in order: (a) extend lib/nerve/index.js's read layer
        with a PER-WINDOW/PER-TAB attention signal (still read-only, still obeys
        §attention-non-truth — Nerve still decides nothing) fed by clear-glass's
        DOM archaeology mutation stream instead of only the global CFR field;
        (b) add a streaming mode to ollama/server.js (stream:true path, currently
        unused) that can hold a standing context channel instead of one-shot
        jobs; (c) a bridge that pushes Nerve's new per-window signal + DOM
        archaeology diffs into that streaming channel as continuous context,
        not a new job per event.
      axioms: "§attention-non-truth (Nerve still never decides), §2.3 (state observable), §10.3 (one stream, not N competing channels — same rule P7 of the omniscience phasemap already established for StreamDigest)"
      gate: "ollama's context visibly updates as the user moves between windows/tabs, with no explicit job submitted by anything — the DOM+Nerve signal alone drives it, proven live."

    P8_rewind_replay_tool:   # ← DONE 2026-08-12 — via direct HTTP, not the gate path
      why: "Standalone wrap, same shape as P5's url-listener — real backend module, zero tool coverage."
      does: >
        rewind_replay tool wrapping clear-glass/src/rewind/engine.js's RewindEngine:
        actions 'snapshot' (capture current session state), 'restore' (replay to a
        prior snapshot), 'list' (available snapshots). Backend-first, same as P5 —
        no renderer/UI work here.
      axioms: "§16.5 (wrap RewindEngine, don't reimplement), backend-first"
      gate: "copilot snapshots a real session, restores it, and the restored state matches the snapshot — proven against the live engine."

    P9_meta_systems_toolkit:   # ← DONE 2026-08-12 — 7 of 11 wrapped, 4 scoped out on purpose (see file header)
      why: "Real gap (11 subsystems, zero coverage) but the largest unknown here — none of the 11 has ever been inventoried for real callable exports the way COS was in P3. This phase IS that inventory, then the wrap — not assumed done in one pass."
      does: >
        For each of meta/{alk, alk-perception, bda, cfr, gap, lattice, liminal,
        rfr2, spatial, telemetry-codec, topo-kernel}: first grep its real exports
        (module.exports shape) the same way this session did for COS and
        scheduler/triggers before writing a single tool file. Wrap only the
        subsystems with real, callable, side-effect-bounded exports — matching
        query_intelligence's own precedent (RFR2 already reached indirectly via
        mastermind.js; do not build a second, competing path to RFR2 — extend
        query_intelligence's mastermind action if RFR2 needs a direct hook, don't
        duplicate the bridge).
      axioms: "§1.1 (nothing wrapped until its exports are actually verified), §10.3 (no second path to a system already reachable through an existing bridge)"
      gate: "each wrapped meta subsystem answers a real query through its tool with live data, not a stub; RFR2 specifically is proven to still route through the existing mastermind bridge, not a new parallel one."

    P10_load_balancer:   # ← DONE 2026-08-12 — resolved, not the original (a)/(b) framing
      resolution: >
        James: "give it to me" — decided directly rather than asking again. Re-checked the substrate
        before deciding: there is NO fleet of interchangeable instances anywhere in this codebase to
        balance across — ollama/server.js is one server with a bounded internal queue (MAX_CONCURRENT),
        not multiple instances; RAID's _fitness() picks WHICH AGENT (claude/chatgpt/ollama), not which
        instance of one, and is explicitly pinned/tested (its own comment: "this codebase's existing
        RAID-determinism suite pins plain prompt→provider selection... must never become a silent
        second path those tests can't see"). Neither original option (a) extend RAID, (b) separate
        post-RAID layer actually had a real target to operate on. Built the honest third thing: a
        resource_monitor tool exposing REAL load signals (system loadavg/mem, any process's real
        rssMB/cpuTimeMs via cos/watchdog/proc-stats.js, a running COS compartment's watchdog state,
        ollama's real live queue_depth from its own /health route) — the signal a load-aware decision
        needs, with zero decision authority claimed. RAID's _fitness() deliberately left untouched.
      axioms: "§10.3 (no second decision point — resolved by not building one), §1.1 (built only what's real, not a fictional fleet)"
      gate: "resource_monitor's four actions live-verified against real data: real os.loadavg()/freemem, real pid rssMB/cpuTimeMs, and a graceful, honest ECONNREFUSED against ollama's :3749/health (not running in this environment) rather than a silent hang."

    P11_nexus_help_tool:   # ← DONE 2026-08-12
      why: "Standalone wrap of a finished module (nexus-awareness), plus one genuinely new piece (docs/spec search) needed so co-pilot is educated on all of NEXUS at the tool level, not just the HTTP-shortcut level."
      does: >
        nexus_help tool: actions 'rundown' (→ systemRundown), 'diagnose'
        (→ whatsWrong), 'ask' (→ answerAbout — same function server.js:1091
        already calls, now also reachable mid-loop), and 'search_docs' (new —
        grep-based full-text search over docs/*.spec and docs/*.md, returning
        matching files + surrounding context, NOT the whole file — same
        excerpt-not-dump discipline as query_movement's summarize). Composes
        with tool-guide's per-tool notes (already in every system prompt) and
        capability-extend/module_builder/forge_tool (already complete) to close
        the full loop: explain → if still stuck, build → if still stuck, file.
      axioms: "§16.5 (wrap answerAbout, don't reimplement it), §1.2 (search_docs returns excerpts + file refs, never fabricates an explanation for a doc that doesn't cover something)"
      gate: "co-pilot answers a 'how does X work' question about a specific tool AND a 'what is NEXUS's Y system' question about a specific subsystem, both mid-tool-loop (not the old HTTP-shortcut path), both grounded in real docs/specs it actually found."

  ordering_rationale: >
    P1→P2 are pure extensions of already-wired modules (recall, adaptive-fulfillment) —
    fastest, lowest-risk, no new subsystem. P3→P6, P8, and P11 are wrap-only tool
    additions over complete, untouched code (COS, RAID/SNR, url-listener, identity,
    rewind, nexus-awareness) — same shape as the schedule_task/register_trigger/
    nexus_heal/loom_scan session, proven pattern, independent of each other. P9 is a
    larger wrap phase that starts with its own inventory step, same discipline, more
    unknowns. P7 (continuous stream) and P10 (load balancer) are the two genuinely
    new-mechanism phases — P7 because no standing channel exists yet, P10 because it's
    not even scoped yet. Both go last on purpose.

  working_rule_not_a_phase:
    git_loom_cortex: >
      No subsystem gap found — phasemap-map.js already resolves real git commits per
      phase, manifest.js already does per-system drift tracking by design (single-repo,
      not per-system git, decided 2026-08-08). Going forward this session and after:
      re-run loom_scan after any structural change, let cortex's AX-003 (write before
      respond) carry the model update, and commit. A rule to follow, not code to write.

  honest_risks:
    - "P1: guardian_chat_log's provider field needs to actually be queryable by name — confirm the real column/tag shape before wiring the filter, not assumed from the row count alone."
    - "P2: ordering risk — if capability-extend fires before adaptive-fulfillment truly exhausts its options, gaps get filed for requests that a retry would have solved. The gate must prove exhaustion happened first, not just that both modules got called."
    - "P4: raid_query must stay strictly read-only. A write action here would be a second RAID entry point — exactly what §10.3 already forbids for call_system's relationship to the real registry."
    - "P7: the only phase with real scope for drift — 'continuous' can silently become 'a poll disguised as a stream' if not built against ollama's actual stream:true path. Gate explicitly requires no explicit job submission, to catch that."
