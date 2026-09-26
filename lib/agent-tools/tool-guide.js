'use strict';
/**
 * lib/agent-tools/tool-guide.js — CA2 of the awareness/routing phasemap
 * UUID: nexus-agent-tools-guide-v1-0000-2026-0730-001
 *
 * §PHASEMAP CA2 (docs/copilot-awareness-routing-phasemap.spec). Tool schemas
 * already carry name + description (WHAT a tool does). This adds the operational
 * knowledge they DON'T: edge cases, how-to-use, and when to PREFER one tool over
 * another — so co-pilot picks the right tool instead of guessing or escalating.
 * §8.6 — built on the existing registry; the guide is keyed by tool name and
 * only augments. §12.5 — each note carries a version so tool-behavior drift from
 * its note is detectable (drift accounting, per the phasemap).
 *
 * A note is intentionally short: the ONE thing a model needs to use the tool
 * well that the description doesn't say.
 */

// §BUGFIX 2026-08-13 — run_command's note said "shell command," the real
// tool dispatches cockpit's INTERACTION_CONTRACT (forge pipeline/gap/idea/
// etc.), never a shell. Found live while building the user-facing guide
// (lib/agent-tools/user-guide-generator.js) and cross-checking every note
// against the real schema it's supposed to describe — this exact note is
// injected into co-pilot's own system prompt, so co-pilot itself was being
// told the wrong thing about one of its own tools. Bumped per §12.5 (this
// file's own stated drift-detection contract).
const GUIDE_VERSION = '1.0.1';

// tool name → { use, edge, prefer }
const NOTES = {
  // §2026-08-09 — the three tools added this session. CA2 requires FULL
  // coverage and test-tool-guide.js T-001 enforces it; it caught these three
  // missing, which is the guide working.
  propose_idea:    { use: "Propose an improvement to NEXUS, yourself, or the user process — it lands in idearium tagged with its provenance.", edge: "Evidence is MANDATORY and must name where a reviewer can check it. You cannot accept your own proposal; that is refused in code.", prefer: "Propose when you have observed something specific. A proposal without evidence is a wish, and a queue of wishes stops being read." },
  forge_tool:      { use: 'Make your own tool: a name, a JSON-schema, and steps binding to a capability, lens, or existing tool.', edge: 'A forged tool is DATA, not code — it can only package what you could already do. Every step is verified BEFORE the tool exists; an unserved capability is refused with the step number.', prefer: 'Read action "schema" first. Forge when you find yourself making the same 2-3 calls repeatedly, not to reach something new.' },
  query_movement:  { use: 'All movement for one system: process, events, ledgers, changes, gaps, sigma, friction, drift, file drift, errors.', edge: 'blind[] comes FIRST in the reply — a source that could not be read is named, never shown as zero. Read it before any number.', prefer: 'Use instead of diagnose when you want WHAT a system is doing over time, not just whether it is up.' },
  parse_lenses:    { use: 'Read one input through five independent lenses and contrast them.', edge: 'A lens can return UNAVAILABLE (e.g. axioms, whose table is empty) — that is not a clean read. Check coverage before trusting a CLEAN verdict.', prefer: 'Use action "contrast" over "parse": a SOLE FINDING (one lens fires, the rest abstain) is the signal, and the raw readings bury it.' },
  nexus_capability:{ use: 'Call any declared capability of any system — 239 of them, generated from the registry at call time.', edge: 'Always "list" first (narrow by system or q); 255 schemas will not fit your context. 16 capabilities are declared but served by nothing and are refused by name, not called.', prefer: 'Use over call_system when you do not already know the exact route — this one discovers it.' },
  read_file:       { use: 'Read a known file path before editing or answering about it.', edge: 'Fails on binary/missing paths — check the error, do not retry blindly.' },
  run_command:     { use: "Dispatch a cockpit command (forge pipeline/seam/idea/gap/trust/guardian/bus/jaa/etc.) through cockpit's real INTERACTION_CONTRACT — the same contract the CLI and UI use. NOT a raw shell executor.", edge: 'Command vocabulary is read live from the contract at load time, not hardcoded — a command added to cockpit appears here automatically. A subsystem whose deps are not composed in cockpit/live.js (some guardian/idearium handles) returns its own empty/error result, not broader coverage than the live instance actually has.' },
  diagnose:        { use: 'Get live health/gaps for a system when something seems wrong.', edge: 'Reports state; it does not fix — pair with a repair path.', prefer: 'Use before proposing a fix, so the fix is grounded.' },
  move_data:       { use: 'Move/transform data between systems via the pipeline.', edge: 'Consequential — this goes through raid.verify; a failed verify leaves the target untouched.' },
  run_pipeline:    { use: 'Build a spec through the execution pipeline (isolate→verify→promote).', edge: 'Needs a real spec path; a trivial spec fails at validate.' },
  nexus_intelligence: { use: 'Query cortex intelligence (patterns, failures, context).', edge: 'Best for "what do we know about X"; not a general chat.' },
  run_closed_loop: { use: 'Run an autonomous build/verify loop.', edge: 'Consequential + long; prefer for a well-specified task, not exploration.' },
  module_builder:  { use: 'Scaffold a new module/capability when none exists — the "no is not an answer" path.', edge: 'Creates real files; goes through verification. Use when a capability is genuinely missing, not to avoid a simpler tool.' },
  run_adversarial: { use: 'Adversarially probe a build/answer for weaknesses.', edge: 'Returns findings, not a verdict; read them.', prefer: 'Pair with gemini-class agents for adversarial testing (CA5).' },
  axiom_check:     { use: 'Check an action/plan against the constitution/axioms before doing it.', edge: 'A WARN is not a block; a BLOCK names the axiom.' },
  analyze:         { use: 'Analyze a file/topic in depth.', edge: 'For understanding, not mutation.' },
  intuition:       { use: 'Fast, associative, pattern-based answer from what the system already knows (<50ms, no model call).', edge: 'Can return null if there is no confident match — that is a real answer, not a failure.', prefer: 'Use before analyze for a cheap first pass; escalate to analyze if intuition comes back empty or low-confidence.' },
  mastermind:      { use: 'Strategic, predictive answer using the real causal graph — "if this is true, what follows?"', edge: 'The opposite question from intuition (\'what does this resemble\') — do not use interchangeably.' },
  synthesize:      { use: 'Synthesize a real, structured build contract (fileName, primitives, compartmentUuid, synthesized context) from plain-text context, using the same the_officiator hat and B1 schema officiate() uses for staged artifacts.', edge: 'Does not queue a real contract by default — pass submit:true to also submit one, otherwise the result is for your own reasoning only.', prefer: 'Use when you need grounded, structured context (not free prose) before proposing or building something — not a substitute for propose_idea or nexus_heal.' },
  schedule_task:   { use: 'Fire a payload to an agent/system/command once at a time or on a repeating interval.', edge: 'Every fire is RAID-governed — a denied fire logs and does not run, it does not error back to you silently.', prefer: 'Use for "at time T do Y". For "when event E happens do Y" use register_trigger instead.' },
  register_trigger:{ use: 'Bind a condition (event type or metric threshold) to an action.', edge: 'Defaults to firing once then disarming; set once:false with maxFires for a bounded repeat.', prefer: 'Use for reactive "when X, do Y". For time-based firing use schedule_task.' },
  nexus_heal:      { use: 'Propose a fix for a gap/finding and track it through evaluation.', edge: 'merge/archive are not exposed — those handlers are unfinished stubs in nexus-healer itself; only propose/list/evaluate are real.', prefer: 'Ground every propose in a real finding from loom_scan, query_movement, or diagnose — evidence-free proposals are refused downstream.' },
  loom_scan:       { use: 'Scan the real tree: declared capabilities, dangling requires, spec/registry divergence, source structure, undeclared components, phase roadmap.', edge: 'capabilities/dangling/source/closed_door read the filesystem directly and can be slow on a full scan; specs with checkRegistry:true is the slowest.', prefer: 'Run before nexus_heal\'s propose, so the fix is grounded in what loom actually found, not assumed.' },
  raid_snr:        { use: 'Read RAID\'s real routing decisions/tunables, or run the real SNR pre-gate on demand.', edge: '"snr" is not a dry sim — it writes an event_log row and counts toward snr_stats, same as a real dispatch. Never a second routing path; read-only for decisions/tunables.', prefer: 'Use "decisions" to answer "why did you route that" before guessing.' },
  rewind_replay:   { use: 'Snapshot/restore a Clear Glass agent session\'s state.', edge: 'Direct HTTP to clear-glass\'s own /rewind routes, not the gate/SSE path — deliberately, since that path had a real bug elsewhere in this session. Needs agentId on every action.', prefer: 'snapshot before a risky browser_action sequence; restore if it goes wrong.' },
  copilot_identity:{ use: 'Get/set co-pilot\'s own display name.', edge: 'Separate from whoAmI (that\'s about the user, not co-pilot). Empty string clears back to default "co-pilot".', prefer: 'Use when the person asks to rename or asks what co-pilot is currently called.' },
  resource_monitor:{ use: 'Real system/process/compartment/ollama-queue load signals.', edge: 'Signal only — reports load, never routes or balances. No fleet of instances exists to balance across in this system.', prefer: 'Check before a heavy action, not to pick between equivalent workers (there are none).' },
  agent_chat_search:{ use: '"Do you remember when we/I talked about X (with Y)" — keyword search across real chat_log and guardian_chat_log.', edge: 'Literal substring match, not semantic — no scoring model. Use "providers" first to see valid withAgent values.', prefer: 'Use over query_recall when the question is "did this conversation happen" rather than "what pattern applies".' },
  nexus_help:      { use: 'Ask anything about NEXUS itself — rundown/diagnose/ask/search_docs.', edge: '"ask" returns ok:false for anything that isn\'t actually a NEXUS-state question — that\'s not an error, just not this tool\'s job. search_docs returns excerpts only, never a whole file.', prefer: 'search_docs for "how does X work in depth"; "ask" for quick state questions; "rundown"/"diagnose" when you already know which you want.' },
  cos_compartment: { use: 'Create/start/stop/destroy/list/status a real isolated COS compartment.', edge: 'Real, persistent state on disk — not a dry run. destroy with wipe:true actually removes data.', prefer: 'Use before running anything risky that shouldn\'t touch the main environment.' },
  cos_simulate:    { use: 'Run a real LLM scenario (single/h2h/loop/chain/stress) against a real provider before committing to a real action.', edge: 'Dispatches a REAL job through guardian — costs real time/tokens, not free, not a dry sim.', prefer: 'h2h to compare two providers on the same prompt before picking one for real work.' },
  meta_query:      { use: 'Real analytical/perception subsystems: causal ledger, telemetry classification, pendulum regime, CFR field math, gap-hunting, lattice edges, liminal gap detection.', edge: 'RFR2 deliberately not here — use nexus_intelligence\'s mastermind action, its one real bridge. spatial/telemetry-codec/topo-kernel not wrapped — stateful engine classes, needs separate lifecycle work.', prefer: 'gap_analyze/liminal_analyze on real prose to find real logical/assumption gaps, not a guess.' },
  run_chain:       { use: 'Run a real multi-step workflow (agent/command/system/http steps), each RAID-gated individually.', edge: 'A denied or failing step HALTS the chain there — later results are never produced, never skipped-past.', prefer: 'Use when a later step genuinely depends on an earlier step\'s real output, not for independent parallel actions.' },
  hat_forge:       { use: 'Make/wear/list/revoke named hats — base agent + optional scoped tools + optional persona.', edge: 'A hat scoped to a nonexistent tool is refused at forge time. Scope is actually enforced at execution, not just suggested — an out-of-scope call never runs.', prefer: 'Forge a narrow hat (few tools) for a repeated specific job instead of re-explaining scope every time.' },
  agent_capability:{ use: 'Real, measured capability data per agent — not hardcoded constraints.', edge: 'Three separately-labeled sources: live (chat_log), historical/stale (guardian_chat_log, no current writer), raid (coarse health). Missing data is null, never guessed.', prefer: 'Check this before assuming an agent can handle a large job — see what actually happened, not a static table.' },
  safe_apply:      { use: 'Verify a proposed file change in a real isolated copy before it ever touches the real target.', edge: 'merge refuses a branch that failed its check, or was never checked, by default. Nothing reaches the real target except through a passing merge.', prefer: 'Always mirror + propose + check before merge — never allowUncheckedMerge unless you genuinely mean it.' },
  agent_council:   { use: 'Convene multiple real agents on the same decision, independently — no cross-contamination between verdicts.', edge: 'Only collects verdicts, does not decide anything — weighing them into an action still goes through RAID/governance.', prefer: 'Use for a genuinely consequential decision worth more than one perspective, not routine dispatch.' },
  agent_chat:      { use: 'Address ONE other agent (chatgpt/claude/gemini/perplexity/ollama/mistral) as a real turn and get its answer — that agent gets the same real tool access to nexus this loop has. "read" gets logged history with that agent.', edge: 'Hop-capped (default 4) — refuses if the addressee is already in the chain, so relayed asks cannot loop forever; pass hops forward when relaying, not when starting fresh.', prefer: 'Use over agent_council when you want ONE addressed conversation, not several independent verdicts on the same question.' },
  fault_log:       { use: 'Real fault/failure precedent for a component — every tool-call error already logs here automatically.', edge: 'Advisory only — a component having failed before does not block it now, it is real information to weigh, attached to results as _faultHistory automatically.', prefer: 'Check before a consequential/repeated action, not for routine reads.' },
  roundtable:      { use: 'A real shared multi-party chat — every member (and the user) sees the same growing thread, unlike agent_council\'s independent verdicts.', edge: 'Nothing auto-chains replies — each turn (speak) is explicit, the caller decides who talks next.', prefer: 'Use when members should genuinely respond to each other; use agent_council instead when independence matters more than dialogue.' },
  parallel_dispatch:{ use: 'DIFFERENT jobs to DIFFERENT agents at the same time, real concurrency cap, each independently governed.', edge: 'Never fabricates one final answer — returns every real result, including real failures and denials.', prefer: 'Use for genuinely independent work; not for one shared question (agent_council) or dependent steps (run_chain).' },
  emergence:       { use: 'Axioms + end-state -> propose, verify in a real isolated branch, refine — pivots the METHOD (not just the attempt) after repeated same-method failure.', edge: 'Requires the agent to respond with a ```candidate JSON block naming its method — real methods are compared by that label, not guessed.', prefer: 'Use for open-ended "find something that satisfies these real constraints," not for a known, specific fix (use safe_apply directly).' },
  call_system:     { use: 'Reach any registered system by capability (resolves via the registry).', edge: 'The action must be in that system\'s allowed_actions or it is denied — that denial is the contract working.' },
  ui_spotlight:    { use: 'Highlight a system in the tv-ui to guide the user.', edge: 'Needs the UI running (:3000); unreachable → it reports, does not crash.' },
  ui_nerve:        { use: 'Show the live CFR field in the tv-ui.', edge: 'Visual only; on/off/sigma.' },
  query_recall:    { use: 'Search past conversations/memory for context.', edge: 'Short queries (<8 chars) are skipped as too thin.' },
  browser_action:  { use: 'Drive a browser tab (navigate, read DOM, act) via the bridge.', edge: 'Needs a live provider tab; routes through guardian NCP.' },
  nexus_status:    { use: 'Report real health/proposals/cross-system status.', edge: 'For "how is X"; the system-status path (CA1) already handles "how are you".' },
};

/**
 * toolGuide(names) — a compact usage guide for the given tool names (or all).
 * Injected into the co-pilot system prompt so the model knows how/when to use
 * each tool. Returns a short string; unknown tools are simply omitted.
 */
function toolGuide(names) {
  const keys = Array.isArray(names) && names.length ? names : Object.keys(NOTES);
  const lines = [];
  for (const k of keys) {
    const n = NOTES[k];
    if (!n) continue;
    let line = `- ${k}: ${n.use}`;
    if (n.edge) line += ` (edge: ${n.edge})`;
    if (n.prefer) line += ` (prefer: ${n.prefer})`;
    lines.push(line);
  }
  return lines.join('\n');
}

/** noteFor(name) — the structured note for one tool (for tests / drift checks). */
function noteFor(name) { return NOTES[name] || _forgedNote(name); }

/**
 * §2026-08-09 — FORGED tools carry their OWN note.
 *
 * CA2 requires full coverage and test-tool-guide.js T-001 enforces it. A tool
 * copilot forged at runtime cannot have a hand-written note, and exempting
 * forged tools from CA2 would make coverage a lie the moment one is created.
 * So a forged tool self-documents from its definition — description plus the
 * steps it composes — and NOTES stays the hand-authored layer for built-ins.
 * The note is real content, not a placeholder: it names exactly what the tool
 * calls, which is the one thing a caller needs and the schema does not say.
 */
function _forgedNote(name) {
  try {
    const T = require('./index.js');
    const t = T.TOOLS.get(name);
    if (!t || !t._forged) return null;
    const calls = (t._steps || []).map(s => s.call).join(' → ') || 'unknown steps';
    return {
      use: String(t.description || '').replace(/^\[forged\]\s*/, ''),
      edge: `Forged, not built-in. It composes: ${calls}. It can only do what those already do — a failing step stops the tool and returns the trail.`,
      prefer: 'Prefer the underlying calls when you need one of them alone; prefer this when you need the whole sequence.',
      forged: true,
    };
  } catch (_) { return null; }
}

// NOTES is the hand-authored layer; allNoteNames() is what coverage should be
// judged against, so a forged tool counts as covered by its own note.
function allNoteNames() {
  const names = new Set(Object.keys(NOTES));
  try { for (const [n, t] of require('./index.js').TOOLS) if (t._forged) names.add(n); } catch (_) {}
  return [...names];
}

module.exports = { toolGuide, noteFor, GUIDE_VERSION, NOTES, allNoteNames, _forgedNote };
