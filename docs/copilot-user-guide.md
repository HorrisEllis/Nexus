# Talking to co-pilot

_Generated live from co-pilot's own tool registry (44 tools) — regenerate this file with `node lib/agent-tools/user-guide-generator.js`, never hand-edit it (§R6). Co-pilot can find this same file itself via nexus_help's search_docs — ask it "what can you do" or "how do I schedule something" and it can quote from here.

Co-pilot is NEXUS's agent — talk to it in plain language and it decides which of the tools below to use. You very rarely need to name a tool yourself; this page exists so you know what's actually possible, and so co-pilot has something real to point to when you ask.

A few things worth knowing up front:
- **Everything consequential is governed.** Scheduled tasks, triggers, chain steps, and hat-wearing all pass through the same real gate (RAID) before they run — a denial is logged, not hidden.
- **"Forging" is real, not a metaphor.** Ask co-pilot to forge a tool or a hat and it makes one — a real named capability it (or another agent) can use again.
- **Nothing here fabricates.** If co-pilot doesn't know something, the tools below are built to say so (a missing source, an UNAVAILABLE lens, a null instead of a guess) rather than make it up.

## Talking to co-pilot about itself

### `nexus_help`

Ask anything about NEXUS itself — the system, not the user's task.

*In practice:* Ask anything about NEXUS itself — rundown/diagnose/ask/search_docs.
*Reach for this instead of a similar tool when:* search_docs for "how does X work in depth"; "ask" for quick state questions; "rundown"/"diagnose" when you already know which you want.

### `nexus_status`

Read NEXUS's own real, current state — not a static description, live queries.

*In practice:* Report real health/proposals/cross-system status.

### `copilot_identity`

Get or set co-pilot's own display name, or which provider it dispatches to by default ("the hat" — ollama/claude/chatgpt/gemini/mistral/perplexity, or "auto" for the normal ollama-first cascade with confidence-based escalation).

*In practice:* Get/set co-pilot's own display name.
*Reach for this instead of a similar tool when:* Use when the person asks to rename or asks what co-pilot is currently called.

## Getting things built

### `run_command`

Execute a NEXUS cockpit command.

*In practice:* Dispatch a cockpit command (forge pipeline/seam/idea/gap/trust/guardian/bus/jaa/etc.) through cockpit's real INTERACTION_CONTRACT — the same contract the CLI and UI use. NOT a raw shell executor.

### `run_pipeline`

Run the NEXUS autonomous execution pipeline (build → sandbox-verify → compare-to-golden → governed promote).

*In practice:* Build a spec through the execution pipeline (isolate→verify→promote).

### `run_closed_loop`

Import a spec and automatically build a repository from it: create the spec manifest, chunk it, and populate every chunk via the WARP build spine, then create a repo.

*In practice:* Run an autonomous build/verify loop.

### `module_builder`

Build a new NEXUS module from a natural-language description, running the full spec → QC → build pipeline.

*In practice:* Scaffold a new module/capability when none exists — the "no is not an answer" path.

### `forge_tool`

Create your own tools.

*In practice:* Make your own tool: a name, a JSON-schema, and steps binding to a capability, lens, or existing tool.
*Reach for this instead of a similar tool when:* Read action "schema" first. Forge when you find yourself making the same 2-3 calls repeatedly, not to reach something new.

### `safe_apply`

Real verify-before-merge for proposed file changes — isolate, apply, check, and only merge if the check genuinely passes.

*In practice:* Verify a proposed file change in a real isolated copy before it ever touches the real target.
*Reach for this instead of a similar tool when:* Always mirror + propose + check before merge — never allowUncheckedMerge unless you genuinely mean it.

## Understanding what NEXUS is doing

### `diagnose`

Diagnose the NEXUS system via the real diagnostic service.

*In practice:* Get live health/gaps for a system when something seems wrong.
*Reach for this instead of a similar tool when:* Use before proposing a fix, so the fix is grounded.

### `loom_scan`

Scan the real NEXUS tree to expand/diagnose the map — the "what actually exists" layer under nexus_status's summaries.

*In practice:* Scan the real tree: declared capabilities, dangling requires, spec/registry divergence, source structure, undeclared components, phase roadmap.
*Reach for this instead of a similar tool when:* Run before nexus_heal's propose, so the fix is grounded in what loom actually found, not assumed.

### `nexus_heal`

Propose and track fixes for gaps/diagnostics found elsewhere in NEXUS.

*In practice:* Propose a fix for a gap/finding and track it through evaluation.
*Reach for this instead of a similar tool when:* Ground every propose in a real finding from loom_scan, query_movement, or diagnose — evidence-free proposals are refused downstream.

### `query_movement`

All movement for one NEXUS system: process, events, ledgers, changes, gaps, sigma, friction, schema drift, file drift (sha256 manifest vs baseline), and errors.

*In practice:* All movement for one system: process, events, ledgers, changes, gaps, sigma, friction, drift, file drift, errors.
*Reach for this instead of a similar tool when:* Use instead of diagnose when you want WHAT a system is doing over time, not just whether it is up.

### `resource_monitor`

Real resource/load signals — system-wide (CPU load average, memory), a specific process by pid (default: this process), a running COS compartment's watchdog state, or ollama's real queue depth.

*In practice:* Real system/process/compartment/ollama-queue load signals.
*Reach for this instead of a similar tool when:* Check before a heavy action, not to pick between equivalent workers (there are none).

### `fault_log`

Real fault/failure precedent for a component — not a fabricated risk score.

*In practice:* Real fault/failure precedent for a component — every tool-call error already logs here automatically.
*Reach for this instead of a similar tool when:* Check before a consequential/repeated action, not for routine reads.

### `axiom_check`

Check a prompt, spec, or proposed action against the NEXUS axioms.

*In practice:* Check an action/plan against the constitution/axioms before doing it.

### `raid_snr`

Introspect RAID's real routing decisions and tunables, and run the SNR pre-gate on demand.

*In practice:* Read RAID's real routing decisions/tunables, or run the real SNR pre-gate on demand.
*Reach for this instead of a similar tool when:* Use "decisions" to answer "why did you route that" before guessing.

## Working with other AI agents

### `agent_capability`

Real, measured capability data for an agent — not assumed constraints.

*In practice:* Real, measured capability data per agent — not hardcoded constraints.
*Reach for this instead of a similar tool when:* Check this before assuming an agent can handle a large job — see what actually happened, not a static table.

### `agent_chat_search`

"Do you remember when we talked about X" or "do you remember when I talked to Y about X" — plain keyword search across real conversation logs, newest first.

*In practice:* "Do you remember when we/I talked about X (with Y)" — keyword search across real chat_log and guardian_chat_log.
*Reach for this instead of a similar tool when:* Use over query_recall when the question is "did this conversation happen" rather than "what pattern applies".

### `agent_council`

Convene multiple real agents on the same decision, independently — no member sees another's answer before giving their own.

*In practice:* Convene multiple real agents on the same decision, independently — no cross-contamination between verdicts.
*Reach for this instead of a similar tool when:* Use for a genuinely consequential decision worth more than one perspective, not routine dispatch.

### `roundtable`

A real, shared, persisted multi-party conversation — the opposite of agent_council's independent verdicts.

*In practice:* A real shared multi-party chat — every member (and the user) sees the same growing thread, unlike agent_council's independent verdicts.
*Reach for this instead of a similar tool when:* Use when members should genuinely respond to each other; use agent_council instead when independence matters more than dialogue.

### `parallel_dispatch`

Real concurrent multi-agent dispatch — DIFFERENT jobs to DIFFERENT agents at the same time, each independently RAID-governed, concurrency-capped (default 3, set maxConcurrent).

*In practice:* DIFFERENT jobs to DIFFERENT agents at the same time, real concurrency cap, each independently governed.
*Reach for this instead of a similar tool when:* Use for genuinely independent work; not for one shared question (agent_council) or dependent steps (run_chain).

### `cos_simulate`

Run a real LLM mental simulation before committing to a real action — a scenario against a real provider, scored and tracked.

*In practice:* Run a real LLM scenario (single/h2h/loop/chain/stress) against a real provider before committing to a real action.
*Reach for this instead of a similar tool when:* h2h to compare two providers on the same prompt before picking one for real work.

### `run_adversarial`

Run an adversarial critique pass over the current system stream — attacks recent activity to surface violations, weaknesses, and contradictions.

*In practice:* Adversarially probe a build/answer for weaknesses.
*Reach for this instead of a similar tool when:* Pair with gemini-class agents for adversarial testing (CA5).

### `emergence`

Real axioms + end-state -> iteratively propose, verify in an isolated real branch (safe_apply), and refine.

*In practice:* Axioms + end-state -> propose, verify in a real isolated branch, refine — pivots the METHOD (not just the attempt) after repeated same-method failure.
*Reach for this instead of a similar tool when:* Use for open-ended "find something that satisfies these real constraints," not for a known, specific fix (use safe_apply directly).

## Memory, recall & analysis

### `query_recall`

Search past conversations and stored memory for relevant context.

*In practice:* Search past conversations/memory for context.

### `nexus_intelligence`

Query NEXUS's live intelligence and event surfaces directly, one real signal at a time — use this instead of a full diagnose "summary" when you only need one answer, not a whole system report.

*In practice:* Query cortex intelligence (patterns, failures, context).

### `meta_query`

Real analytical/perception subsystems: alk_query/alk_stats (causal ledger — record/resolve/rewind history), alk_perception_classify (telemetry -> state classification), bda_compute (pendulum regime from observations)/bda_detect (gap detection in text), cfr_sigma/cfr_regime/cfr_delta (causal field math — sigma, regime from coherence/friction/resonance/entropy, delta between two states), gap_analyze (the real gap-hunter — logical/evidential/temporal/etc gap taxonomy on a text), lattice_get_edge (associative lattice — real edge weight between two nodes), liminal_analyze (code/text/field/music/relational gap detection — the broadest analyzer).

*In practice:* Real analytical/perception subsystems: causal ledger, telemetry classification, pendulum regime, CFR field math, gap-hunting, lattice edges, liminal gap detection.
*Reach for this instead of a similar tool when:* gap_analyze/liminal_analyze on real prose to find real logical/assumption gaps, not a guess.

### `parse_lenses`

Read one input through several independent lenses at once and contrast them: liminal (12 gap detectors), axioms (constitutional check), edge-cases (known per-system failures), sigma (deviation from field baseline), shape (structural markers like empty catch blocks).

*In practice:* Read one input through five independent lenses and contrast them.
*Reach for this instead of a similar tool when:* Use action "contrast" over "parse": a SOLE FINDING (one lens fires, the rest abstain) is the signal, and the raw readings bury it.

### `analyze`

Deep analytical answer to a question about the system or a problem, using the analysis faculty (assembles context and reasons over it).

*In practice:* Analyze a file/topic in depth.

## Automation — do this later / when this happens

### `schedule_task`

Schedule a task to fire once at a time or on a repeating interval, delivering a payload to an agent, system, or command.

*In practice:* Fire a payload to an agent/system/command once at a time or on a repeating interval.
*Reach for this instead of a similar tool when:* Use for "at time T do Y". For "when event E happens do Y" use register_trigger instead.

### `register_trigger`

Register a "when X, do Y" condition→action binding: fires when an event of a given type lands on the fan-in (condition.type "event", matchType exact or "prefix." ) or when a numeric predicate holds (condition.type "metric").

*In practice:* Bind a condition (event type or metric threshold) to an action.
*Reach for this instead of a similar tool when:* Use for reactive "when X, do Y". For time-based firing use schedule_task.

### `run_chain`

Run a real ordered workflow — a sequence of steps (agent/command/system/http), each RAID-gated individually.

*In practice:* Run a real multi-step workflow (agent/command/system/http steps), each RAID-gated individually.
*Reach for this instead of a similar tool when:* Use when a later step genuinely depends on an earlier step's real output, not for independent parallel actions.

## Ideas & self-improvement

### `propose_idea`

Propose an improvement to NEXUS, to yourself, to the user's process — it lands in idearium as a reviewable idea tagged with its provenance, so a machine proposal is never confused with one the user had.

*In practice:* Propose an improvement to NEXUS, yourself, or the user process — it lands in idearium tagged with its provenance.
*Reach for this instead of a similar tool when:* Propose when you have observed something specific. A proposal without evidence is a wish, and a queue of wishes stops being read.

## Reaching other systems & data

### `move_data`

Move data in/out of Cortex (NEXUS's memory).

*In practice:* Move/transform data between systems via the pipeline.

### `call_system`

Call any registered NEXUS system.

*In practice:* Reach any registered system by capability (resolves via the registry).

### `nexus_capability`

Call ANY declared capability of ANY NEXUS system.

*In practice:* Call any declared capability of any system — 239 of them, generated from the registry at call time.
*Reach for this instead of a similar tool when:* Use over call_system when you do not already know the exact route — this one discovers it.

## Browser & the visual UI

### `browser_action`

Control NEXUS' real browser (Clear Glass) — navigate to a URL, read/mutate the DOM, manage cookies, or register a backend URL listener that fires a hook on matching traffic.

*In practice:* Drive a browser tab (navigate, read DOM, act) via the bridge.

### `ui_spotlight`

Guide the user's attention in the NEXUS UI.

*In practice:* Highlight a system in the tv-ui to guide the user.

### `ui_nerve`

Surface the live NEXUS "nervous system" field (the CFR sigma field) in the UI.

*In practice:* Show the live CFR field in the tv-ui.

### `rewind_replay`

Snapshot and restore a Clear Glass agent session's state via RewindEngine.

*In practice:* Snapshot/restore a Clear Glass agent session's state.
*Reach for this instead of a similar tool when:* snapshot before a risky browser_action sequence; restore if it goes wrong.

## Isolation & safety

### `cos_compartment`

Create, start, stop, destroy, list, or check status of a real COS (Compartment OS) compartment — an isolated sandbox with its own process/network/runtime boundary.

*In practice:* Create/start/stop/destroy/list/status a real isolated COS compartment.
*Reach for this instead of a similar tool when:* Use before running anything risky that shouldn't touch the main environment.

## Roles co-pilot can wear

### `hat_forge`

Make and manage named, reusable hats — a bundle of base agent + optional scoped tools + optional persona + optional real recurring responsibilities, distinct from the raw per-message agent switch.

*In practice:* Make/wear/list/revoke named hats — base agent + optional scoped tools + optional persona.
*Reach for this instead of a similar tool when:* Forge a narrow hat (few tools) for a repeated specific job instead of re-explaining scope every time.

## Files

### `read_file`

Read a text file from the project by its path, relative to the project root.

*In practice:* Read a known file path before editing or answering about it.

---

*Looking for how co-pilot is built, not how to use it? Ask co-pilot itself with `nexus_help` — `rundown` for the current-state picture, `search_docs` for anything in `docs/*.spec`.*