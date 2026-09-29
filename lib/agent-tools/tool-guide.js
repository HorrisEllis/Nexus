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
const GUIDE_VERSION = '1.2.0';   // 1.1.0 (0.39.272): full coverage — 57 notes added, browser_action note replaced · 1.2.0 (0.39.273): the 11 codebase tools

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
  // §0.39.266 — the registry harness (lib/agent-tools/tools/loom/harness.js): a repo agent's five tools.
  'loom.find.tool':  { use: 'Where is it? A file, an event, a tool, or words in the code.' },
  'loom.card.tool':  { use: 'What is it and what is it wired to — before reading or changing a component.' },
  'loom.read.tool':  { use: 'The code, 200 lines at a time.', edge: 'Read before you write; follow "more" for the rest.' },
  'loom.write.tool': { use: 'Write a whole file.', edge: 'Full content, never a fragment. On Nexus, James approves it first.' },
  'loom.test.tool':  { use: 'Run the tests that cover a component after changing it.' },
  // §0.39.273 — the codebase tools (lib/agent-tools/tools/idearium/code.js)
  'idearium.code_map.tool':     { use: 'First call in a repo: its shape, the most-used files, entry points.' },
  'idearium.code_search.tool':  { use: 'Find code by what it does or its name.', prefer: 'Then code_chunk the id; grep only for verbatim text.' },
  'idearium.code_grep.tool':    { use: 'Exact text or regex, with the chunk of each hit.' },
  'idearium.code_chunk.tool':   { use: 'A chunk: card (uses / used by / tests) + code.' },
  'idearium.code_read.tool':    { use: 'File lines, or outline:true for its chunks.', edge: 'Copy "old" text for code_edit from here, exactly.' },
  'idearium.code_refs.tool':    { use: 'Definition and every use of a name — before renaming or changing a signature.' },
  'idearium.code_edit.tool':    { use: 'Change part of a file: [{old,new}] or line ranges.', edge: 'old must match once; a syntax break is refused.' },
  'idearium.code_write.tool':   { use: 'Create, replace (overwrite), delete or move a file.' },
  'idearium.code_batch.tool':   { use: 'Several files as one all-or-nothing change.' },
  'idearium.code_check.tool':   { use: 'After changing: syntax + the tests that use the files.' },
  'idearium.code_changes.tool': { use: 'List your proposals/changes; revert or withdraw one.', edge: 'You never approve your own proposal.' },
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

// ── 0.39.272 — full coverage. T-001 had been failing with 54 registered tools the model was never told how to use —
// every Clear Glass tool among them, which is most of why copilot did not "know" Clear Glass. Each note below was
// written from the tool's own schema and source (its description, its actions, its failure paths), not guessed.
Object.assign(NOTES, {
  // Clear Glass — the browser
  clear_glass_browser: { use: 'Drive a page step by step with the automation engine\'s DOM steps: your own hidden persist:automation page (or an open window by id); rich selectors (text=, label=, XPath, >> chains); read returns records, tables, links.', edge: 'Runs through the wire server (:7704 /automation/step). "show" makes the hidden page visible so James can sign in. Steps here are the same code a workflow step runs.', prefer: 'Use for scraping/extraction and anything you will turn into a workflow; clearglass.browser.tool for the tab James is looking at, form reads with selectors, uploads of real files, and every other Clear Glass capability.' },
  clear_glass_automation: { use: 'Build, run and inspect Clear Glass workflows — schedules, events, webhooks; steps drive the browser, move data, branch, loop, ask agents, notify.', edge: 'A workflow runs signed-in pages unattended — say what it will do before enabling a schedule. Every text field takes {{templates}}.', prefer: 'When a flow must repeat on a schedule or trigger; a learned flow (clearglass.learned.tool) or macro for a one-off replay.' },
  'clearglass.browser.tool': { use: 'Clear Glass, whole and synchronous: state (tabs + url/title, accounts, autofill profiles, macros, extensions), read (page text, fields with selectors, buttons), act/sequence (driver actions), tabs, autofill, on-screen questions — and channels/invoke: every capability the Clear Glass window has (window control, settings, login portal, plugins, WebExtensions, macros, recording, selectors, custom agents, errors), by IPC channel name.', edge: 'read BEFORE act — use the selectors read returns, do not invent them. sequence stops at the first failed step unless stopOnError:false. setValue for long text (typing is per-key and slow); select for <select>; check for boxes; upload needs real file paths on James\'s machine. Screenshots come back as a byte count unless keepImage:true.', prefer: 'Use this over browser_action (which goes through a guardian job and 20s polling) for anything interactive; browser_action remains for url_listen and cookie jars.' },
  browser_action:  { use: 'Browser actions through a guardian job — navigate, dom query/mutate, cookie jar save/restore, url_listen/url_unlisten.', edge: 'Five hops and a 20s ceiling; fails when guardian is down even if Clear Glass is up.', prefer: 'clearglass.browser.tool for navigate/read/click/fill; keep this for url_listen and cookies_save/restore.' },
  clear_glass_command_index: { use: 'Any Clear Glass HTTP command, found in its live route index: discover{query}, then call{method,path,body}.', edge: 'Two surfaces: /cli/* and most routes are the IPC bridge :7702, agent-mesh/automation/provider routes are the wire server :7704 — picked from the path (surface overrides). Before 0.39.272 every call went to :7704 and 404\'d.', prefer: 'Use for anything the dedicated tools do not cover (downloads listeners, calltos, site settings keys, speech).' },
  clear_glass_stream_bridge: { use: 'Forward Clear Glass\'s live SSE events into copilot\'s own stream (enable/disable/status).', edge: 'Only events from the moment it is enabled; nothing is replayed.', prefer: 'Enable before a long browser task you want to watch; clearglass.browser.tool state for a one-off snapshot.' },
  clear_glass_dom_archaeology: { use: 'Inspect a PROVIDER tab\'s live DOM tree (claude, chatgpt …) via its DOM mesh; optional query string.', edge: 'Keyed by providerId, not agentId; fails if that provider has no live window or the mesh has not loaded yet.', prefer: 'clearglass.browser.tool read for ordinary pages and forms.' },
  clear_glass_userscripts: { use: 'List userscripts and enable/disable one.', edge: 'scriptId comes from list; a toggled script applies on the next page load/injection.', prefer: 'clear_glass_provider_deploy to push an edited script into a running provider tab now.' },
  clear_glass_tab_visibility: { use: 'Move a provider tab to the background or bring it to the foreground.', edge: 'Provider tabs only (claude, chatgpt …); ok:false when that provider has no live window.' },
  clear_glass_provider_deploy: { use: 'Hot-push the userscript on disk into a running provider tab, now.', edge: 'Only a provider with a live window; the injection itself can throw and is reported.' },
  'clearglass.search_engine.tool': { use: 'Register a site\'s search as a named engine (URL template with {query}), then search it.', edge: 'method "api" fetches and parses JSON; "navigate" only resolves the URL — open it with clearglass.browser.tool act navigate.' },
  bookmarks_manage: { use: 'Add/remove/list/open/visit/check Clear Glass bookmarks.', edge: 'open navigates an agent tab and records a visit; check answers whether a URL is already saved.' },
  history_manage:  { use: 'Record/list/delete/clear Clear Glass browsing history; list filters by agentId, since, query.', edge: 'clear without agentId wipes EVERYTHING — pass agentId unless that is meant.' },
  account_manage:  { use: 'Clear Glass accounts: an identity linking agent keys and verified provider logins.', edge: 'One real provider login can belong to only one account — linkProvider refuses a second.' },
  site_settings_manage: { use: 'Per-origin Clear Glass settings: get/set/deleteKey/clear/clearAll/listOrigins.', edge: 'clearAll wipes every origin.' },
  autofill_manage: { use: 'Autofill profiles (CRUD) and detect/fill on a live form.', edge: 'detect previews without touching the page; fill refuses low-confidence matches by default. File inputs are clearglass.browser.tool act upload (0.39.272), not this.', prefer: 'nexus.opportunity.tool prepare for a whole job application — it runs autofill, then the answer bank, drafts and uploads.' },
  agent_mesh_route: { use: 'Send a prompt through Clear Glass\'s agent mesh (guardian-first, DOM automation fallback).', edge: 'Fails honestly when Clear Glass is unreachable; preferAgent is a preference, not a guarantee.', prefer: 'guardian_dispatch when you need one specific provider tab.' },
  macro:           { use: 'Named, replayable step sequences against a URL pattern (create/list/get/run …).', edge: 'erosmancer steps need a targetUuid, not a CSS selector; run drives a real tab.', prefer: 'clearglass.browser.tool sequence for a one-off flow; a macro when it will repeat.' },
  'clearglass.learned.tool': { use: 'What you learned driving Clear Glass: per site, selectors that worked (by label), ones that keep failing, healed ones, and flows that worked — replay a flow, promote it to a macro, forget a site. summary also shows what job applications led to.', edge: 'Learning is evidence only: every hint names the observations behind it. A replayed flow still heals and still stops at the first failure; a flow that types a password needs values.password (never stored).', prefer: 'Check hints before a multi-step task on a site you have used; replay a flow instead of re-deriving it.' },
  // Memory + opportunities
  'nexus.context.tool': { use: 'Find anything NEXUS remembers — one search across every cortex table (chat history, memory, crystals, fixes, gaps, faults, agent notes, repo agents\' learned facts, ideas, opportunities), the repo import graph, the system blueprint, every .spec and CHANGELOG.', edge: 'Keyword ranking, not semantic (vector memory joins only where it is initialised). Telemetry tables are skipped unless named in sources. Each hit names source+id — use get for the whole record.', prefer: 'Start here when you do not know which memory holds the answer; then the specialist tool the directory names (query_recall, agent_chat_search, nexus_map …).' },
  'nexus.opportunity.tool': { use: 'Job applications, gigs and Fiverr/Upwork leads end to end: profile (identity from James\'s Clear Glass autofill profile), cycle (find + score + shortlist + draft), capture a page, draft (learns from his edits), prepare (fill in Clear Glass), prepare_reply, submit, follow-ups, answer bank, learned (what outcomes taught the scoring).', edge: 'approve is James\'s only — refused in code. submit by an agent needs James\'s approval AND policy mode auto AND, on LinkedIn/Indeed/Upwork/Fiverr, acknowledgeTos. prepare stops at READY or NEEDS_INPUT/NEEDS_LOGIN and says why.', prefer: 'status first to see what waits on James; capture when he is looking at a job/gig in Clear Glass.' },
  // Code + files
  file_tree:       { use: 'List what exists under a path before reading.', edge: 'Depth-limited; relative to the project root (or where).', prefer: 'search_files when you know a word, file_tree when you know a folder.' },
  search_files:    { use: 'Find files by content keyword or name pattern.', edge: 'Bounded: 3000 files scanned, 200 matches — a miss in a huge tree is not proof of absence.', prefer: 'nexus.context.tool for memory/specs; this for source code.' },
  delete_file:     { use: 'Delete one file in the project.', edge: 'Needs confirm:true; refuses directories and anything outside the root. Not undoable here — versionium_commit first if in doubt.' },
  'nexus.syntax_debug.tool': { use: 'node --check a subtree; returns only failing files.', edge: 'Syntax only — a clean pass says nothing about behaviour.' },
  stub_finder:     { use: 'Find TODO/FIXME/STUB/MOCK comments, not-implemented throws, fake-named functions.', edge: 'Text patterns, not analysis — read its caveat field.', prefer: 'Pair with loom_scan closed_door for code nothing consumes.' },
  mock_data_finder:{ use: 'Find placeholder data: example.com emails, John Doe names, lorem ipsum, 555 numbers.', edge: 'Text patterns; test files excluded unless includeTests.' },
  // Systems
  nexus_map:       { use: 'Walk loom\'s system graph in agent-sized pages: systems → graph → component.', edge: 'Page with cursor; pass agentId to size pages to that agent\'s token limit.', prefer: 'Before reading source to understand how systems connect.' },
  system_priority: { use: 'Architecture-first priority: score a gap, boot_check all systems, log_fix, order.', edge: 'boot_check is dryRun by default; log_fix writes a real record — use it whenever you fix something.' },
  intelligence_query: { use: 'Intelligence system: patterns, status, failures, reuse, map, commands, cfr.', edge: 'cfr needs intelligence/server.js running; the rest are in-process.', prefer: 'framework_builder for WARP skeletons.' },
  framework_builder: { use: 'Generate a tested WARP module skeleton into intelligence/input/.', edge: 'Writes a real file named from "name".' },
  ambiguity_pull:  { use: 'Resolve an ambiguous term cheap-to-expensive: recall → loom map → Perplexity → browser search.', edge: 'Stops at the first non-empty answer; allowBrowserFallback:false stops before raw browsing. Returns the whole trace.' },
  ask_james:       { use: 'Log a durable question for James when genuinely blocked.', edge: 'Last rung only — after trying and after lifeline. needs + why are required.', prefer: 'Try nexus.context.tool and ambiguity_pull first.' },
  agent_notes:     { use: 'Write down a constraint/workaround you discovered for an agent; list them.', edge: 'Superseded notes are flagged, not hidden — pass supersedes to correct one.' },
  notes_todo:      { use: 'Persistent notes and todos: add/list/complete/delete.', edge: 'complete needs the uuid from list.' },
  nexus_wake_events: { use: '"hey nexus" requests said in any agent tab: pending, then consume with your answer.', edge: 'Captured whether or not anyone was listening — pending may hold old ones; consume marks them handled.' },
  tool_config:     { use: 'Read and tighten tool configuration (disable, require_confirm, restrict, set_defaults).', edge: 'Tightening applies at once; loosening returns a proposal for James — an agent cannot grant itself capability.' },
  axiom_manage:    { use: 'List/add/remove/freeze/summarize axioms.', edge: 'Agent-added axioms are tagged source:agent; freeze is irreversible here; remove needs confirm:true.', prefer: 'axiom_check before acting; this to change the set.' },
  loom_register:   { use: 'Register a component, a hook with its wire, or a concern in loom.', edge: 'hook_with_wire is refused unless consumerHookId already exists — no hook without a consumer.' },
  self_repair:     { use: 'Repair a file in a compartment: propose → test → promote.', edge: 'promote only with a passing testResult; the live file is untouched until then.' },
  spec_wizard:     { use: 'Walk a person through building a .spec with idearium\'s spec engine, one dimension at a time.', edge: 'Pass specMeta/answeredSections back each wizard_question; the spec compiles itself when the last dimension completes.' },
  // Agents
  switch_agent:    { use: 'Switch which agent answers, or report the current one.', edge: 'Switches the host\'s global agent — every surface follows.' },
  intent_hat:      { use: 'Suggest which hat fits a message (diagnostician/builder/auditor/librarian) without switching.', edge: 'Suggest only; the switch-and-restore wrapper is a function, not a tool action.' },
  guardian_dispatch: { use: 'Send a prompt to one connected provider tab through guardian.', edge: 'Fails when guardian or that provider\'s tab is down — check ncp_status.' },
  ncp_status:      { use: 'Which providers are actually connected (heartbeat-verified).', edge: 'Connected ≠ idle — a tab can be mid-job.', prefer: 'Before guardian_dispatch to a specific provider.' },
  ollama_generate: { use: 'Local generation on this machine, no cost.', edge: 'Small local models; long prompts are slow on a 4 GB GPU.' },
  // COS
  cos_archetype:   { use: 'COS archetypes: list/show/assign/detect/create.', edge: 'detect inspects a real path; create registers inline, no file.' },
  cos_blueprint:   { use: 'COS blueprints: list/show/create instance/status/destroy.', edge: 'create spawns a real compartment; destroy removes it.' },
  cos_playground:  { use: 'Disposable COS compartments: create/list/status/destroy/promote.', edge: 'promote makes a playground permanent.', prefer: 'Try risky changes here first.' },
  cos_plugin:      { use: 'Existing COS plugins: list/show/enable/disable/remove.', edge: 'Scaffolding new plugins is not exposed.' },
  cos_vault:       { use: 'COS vault: set/list/delete secrets, grant/revoke across compartments, audit.', edge: 'Never returns a secret\'s value — list gives key names only.' },
  compiler_info:   { use: 'COS\'s known compilers/bundlers and their config files.', edge: 'Reference data; builds nothing.' },
  // Versionium + cortex
  versionium_commit: { use: 'Commit current state with a message.', edge: 'Branch switching is not built.' },
  versionium_history: { use: 'Commit history, optionally per system.', edge: 'Read-only.' },
  versionium_restore: { use: 'Replay a commit\'s kernel snapshot (read-only).', edge: 'Does not mutate live state — versionium.snapshot.tool restore does.' },
  'versionium.history.tool': { use: 'Commit log (optionally per system) or calendar for a date.', edge: 'date is YYYY-MM-DD.' },
  'versionium.snapshot.tool': { use: 'Read a commit\'s snapshot, or restore NEXUS to it.', edge: 'restore is a real mutation, not a preview.' },
  'cortex.restep.tool': { use: 'Recount event steps from cortex\'s event_log; compare with believedCount.', edge: 'Counts the ledger, not a cache — slower, but true.' },
  'cortex.node_tag.tool': { use: 'List or add tags on any node via cortex\'s tag store.', edge: 'add needs entityId and tags[].' },
  'guardian.build.tool': { use: 'Run a spec through guardian\'s build pipeline.', edge: 'A RAID denial comes back as 403, not success; dryRun to preview.' },
  'idearium.repo_chunks.tool': { use: 'A repo\'s chunk nodes: search, list, get one chunk, proof (did a passing test run it).', edge: 'get returns ONE chunk — search or list first.', prefer: 'nexus.context.tool for memory about the project; this for its code.' },
});


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
