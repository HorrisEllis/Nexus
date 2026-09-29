'use strict';
/**
 * lib/agent-tools/index.js — Sovereign agent tool-calling core
 * UUID: nexus-agent-tools-v1-0000-2026-0706-jamesbrooks-001
 * Version: 1.0.0
 *
 * §ARCHITECTURE — sovereign, not a monolith bolted onto copilot. This
 * file knows nothing about Ollama, WARP, or Copilot specifically.
 * `callModel` is injected by the caller — same dependency-injection
 * pattern already established for `jaa`/`busEmit` elsewhere in this
 * codebase (lib/seam/queue.js's QueueCompartment, lib/seam/gates.js's
 * CascadeGate). Guardian, Idearium, or anything else that wants a real
 * tool-calling loop uses this same module; only the thing that actually
 * talks to a model differs per caller.
 *
 * §WHY THIS EXISTS — checked before building: zero tool-calling
 * infrastructure existed anywhere in this codebase (confirmed by grep
 * across copilot/, idearium/agent-suite/, and the whole tree for
 * tool_calls/function_call/toolSchema — nothing). This is genuinely new
 * capability, not a duplicate of something that already existed.
 *
 * §TOOLS — starts with one real tool: read_file. This is the actual
 * fix for "Ollama reading a file should be a tool it decides to use,
 * not an explicit pre-upload step" — the model requests a path mid-
 * generation; the loop executes it and feeds the real content back in,
 * same turn, no human in the loop.
 */
const fs = require('fs');
const path = require('path');

// ── Tool registry ────────────────────────────────────────────────────────────
// Each tool: {name, description, parameters (JSON schema), execute(args)}.
// `execute` is real, not a stub — read_file actually reads the file.
const TOOLS = new Map();

function registerTool(tool) {
  if (!tool.name || typeof tool.execute !== 'function') {
    throw new Error('[agent-tools] registerTool requires {name, execute}');
  }
  TOOLS.set(tool.name, tool);
  // §WIRED 2026-08-17 — James: "co-pilot's tools need persistence in
  // cortex... make sure they have depth." lib/tool-index.js is real,
  // already cortex-persisted, already designed exactly for this
  // (consumers/intents/edgeCases growing from real usage) — confirmed
  // built, correct, and genuinely never called from here before this,
  // same disconnection pattern as this session's earlier AB1 finding in
  // a different checkout. Seeded with the tool's own real description as
  // `provides`, not a blank row waiting for depth that never arrives.
  try {
    require('../tool-index.js').register({
      id: tool.name, file: null, dir: null, provides: tool.description || null,
    });
  } catch (_) { /* tool-index unreachable — registration still succeeds, §1.2 non-blocking */ }
}

function getToolSchemas(opts = {}) {
  // Ollama's /api/chat `tools` param shape — OpenAI-compatible function schema.
  //
  // §GATE 1 of 2, added 2026-08-19 (docs/copilot-tool-system.spec P1). A
  // disabled tool must not be OFFERED, not merely refused when called. A model
  // shown a tool it cannot use will plan around it and then fail — worse than
  // never seeing it (§16.2: the system should read like a story).
  //
  // §CTS-INV-2 — an unconfigured tool is offered exactly as before. If
  // tool-config is unavailable for any reason, every tool is offered: the
  // config layer failing must not silently strip the agent's capabilities.
  let cfg = null;
  try { cfg = require('../tool-config.js'); } catch (_) {}
  return [...TOOLS.values()]
    .filter(t => {
      if (!cfg) return true;
      try { return cfg.check(t.name, { agent: opts.agent }).allow !== false || cfg.check(t.name, { agent: opts.agent }).needsConfirm === true; }
      catch (_) { return true; }
    })
    .map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
}

async function executeTool(name, args, opts = {}) {
  const tool = TOOLS.get(name);
  if (!tool) return { error: `unknown tool '${name}' — available: ${[...TOOLS.keys()].join(', ')}` };

  // §GATE 2 of 2, added 2026-08-19 — §16.3: validation is structural, enforced
  // by the shape of the system, not an optional check bolted on inside each of
  // the ~71 tools. Every tool call in NEXUS passes through this function, so
  // this is the one place it has to hold.
  //
  // §CTS-INV-2 — an unconfigured tool reaches tool.execute() by exactly the
  // path it always did. If tool-config throws or is missing, the call proceeds:
  // a broken config layer must never become a silent capability outage.
  try {
    const toolConfig = require('../tool-config.js');
    const verdict = toolConfig.check(name, { agent: opts.agent, confirmed: opts.confirmed });
    if (!verdict.allow) {
      // §1.2 — specific and traceable: which tool, which rule, who set it.
      return { error: verdict.reason, blockedByConfig: true, needsConfirm: !!verdict.needsConfirm, config: verdict.config };
    }
    args = toolConfig.applyDefaults(name, args || {});
  } catch (_) { /* config layer unavailable — proceed as before */ }

  // §ADDED 2026-08-13 — James: "before each action, needs to check for
  // relevant failure mode or fault from fault taxonomy." Real precedent,
  // surfaced, not silently blocking — a fault having happened before to
  // this exact tool is real information the caller/model can weigh, not
  // proof it will happen again. Attached to the result, never hidden.
  let faultHistory = null;
  try { faultHistory = require('../fault-log.js').checkFaultHistory(name, { intent: opts.intent || null, limit: 3 }); } catch (_) {}

  // §WIRED 2026-08-22 — James: "wire it all." Real tool_input/tool_output
  // events, the one, single real dispatch point every tool call already
  // passes through — no per-tool wiring needed for any of the ~71 tools.
  let _et = null, _toolBlockId = null;
  try {
    _et = require('../event-types.js');
    _toolBlockId = require('crypto').randomUUID();
    require('../../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
      type: _et.INTENT.TOOL_INPUT, blockId: _toolBlockId, tool: name,
      agent: opts.agent || null, intent: opts.intent || null, ts: Date.now(),
    });
  } catch (_) { /* event pipeline unreachable — the real tool call proceeds regardless, §1.2 non-blocking */ }

  let result, outcome = 'executed', errMsg = null;
  try {
    result = await tool.execute(args || {}, { context: opts.context || null, agent: opts.agent || null });   // 0.39.257 — a run's context (e.g. repoDir) reaches the tool
    if (result && result.error) { outcome = 'error'; errMsg = result.error; }
  } catch (e) {
    // §1.2 — a tool failure is a result the model can see and react to,
    // not a thrown exception that kills the whole loop.
    outcome = 'error'; errMsg = e.message;
    result = { error: `tool '${name}' failed: ${e.message}` };
  }
  try {
    if (_et && _toolBlockId) {
      require('../../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
        type: _et.INTENT.TOOL_OUTPUT, blockId: _toolBlockId, tool: name,
        agent: opts.agent || null, outcome, ts: Date.now(),
      });
    }
  } catch (_) { /* §1.2 — the real tool result itself is unaffected either way */ }
  // §BUILT 2026-09-08 — James: "the listener for the tools... reusing
  // outputs." Confirmed directly: the real, existing TOOL_INPUT/OUTPUT
  // event pipeline right above already covers every tool call from
  // every real caller (this function — checked, this really is the one
  // shared dispatch point) but only ever records outcome (success/
  // error), never the actual result content, so no reuse was ever
  // possible from it. This is the one real, missing piece, added at the
  // one real, universal point — covers guardian's own flow AND
  // copilot's separate tool-runtime.js (wake-word included), which the
  // earlier, narrower guardian-only wiring did not reach.
  if (outcome === 'executed') {
    try {
      require('./tool-call-listener.js').recordCall(
        require('../../cortex/memory/jaa-db.js').jaaDB, opts.jobId || _toolBlockId, name, args, result
      );
    } catch (_) { /* §1.2 — reuse is additive; the real tool result itself is unaffected */ }
  }
  if (result && typeof result === 'object' && faultHistory && faultHistory.sampleSize > 0) {
    result._faultHistory = faultHistory; // real precedent, visible on every call whether it succeeded or not
  }

  // §ADDED 2026-08-13 — the actual logging half of the same request. Every
  // tool call that errors, from ANY of the 40 tools, gets a real, richly
  // tagged fault_log row — system/agent/component/status/intent/CFR
  // conditions — with zero changes needed to any individual tool file.
  if (outcome === 'error') {
    try {
      require('../fault-log.js').logFault({
        system: 'agent-tools', agent: opts.agent || null, component: name,
        faultClass: null, status: 'error', intent: opts.intent || null,
        causedBy: opts.causedBy || null, meta: { args, error: errMsg },
      });
    } catch (_) { /* fault-log unreachable — the tool result itself is unaffected, §1.2 non-blocking */ }
  }

  // §WIRED 2026-08-17 — the actual depth-building half of the same real
  // registry. register() above only seeds a static description; this is
  // what makes consumers/intents/edgeCases actually populate from real
  // calls, exactly as tool-index.js's own header describes and as James
  // asked for directly. Same non-blocking pattern as the RAID recordDecision
  // call right below — observe-only, never affects the tool result.
  try {
    require('../tool-index.js').record({
      tool: name, consumer: opts.agent || opts.source || null, intent: opts.intent || null,
      ok: outcome !== 'error', edgeCase: outcome === 'error' ? errMsg : null,
    });
  } catch (_) { /* tool-index unreachable — the tool result itself is unaffected, §1.2 non-blocking */ }

  // §PHASEMAP P1 — record every tool decision to RAID → cortex (§8.6 built
  // outward from RAID.recordDecision, §2.2 cortex-persisted, §17.6 auditable).
  // Observe-only: a recording failure never affects the tool result (§1.2).
  try {
    require('../../cortex/core/raid').recordDecision({
      source: opts.source || 'agent-tools',
      tool: name, args, outcome, error: errMsg, causedBy: opts.causedBy || null,
    });
  } catch (_) { /* RAID unreachable — the tool still ran; P1 is non-blocking */ }
  return result;
}

/**
 * runToolLoop — the actual agentic loop.
 *
 * @param {function} callModel  — (messages, toolSchemas) => Promise<{
 *   text, toolCalls: [{id, name, arguments}] | null }>
 *   INJECTED — the caller decides how this actually talks to a model.
 *   This is where WARP's unifiedDispatch plugs in for callers that want
 *   cache/population behavior; runToolLoop itself has no opinion about it.
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} opts — { maxIterations = 6 }
 * @returns {Promise<{text, iterations, toolCallLog}>}
 */
async function runToolLoop(callModel, systemPrompt, userPrompt, opts = {}) {
  const maxIterations = opts.maxIterations || 6;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const toolCallLog = [];
  const schemas = getToolSchemas();
  // §GENERIC, sovereign (2026-08-13) — an optional allow-list restricting
  // which tools may actually EXECUTE this run. Not copilot- or hat-
  // specific: any caller of runToolLoop can pass this. Enforced here, not
  // just left to the caller's own prompt-narrowing (a callModel adapter
  // can narrow what's OFFERED, but only this loop can guarantee what's
  // ALLOWED to run — the model still names the tool, this is the actual
  // gate).
  const allowedTools = Array.isArray(opts.allowedTools) && opts.allowedTools.length ? new Set(opts.allowedTools) : null;

  for (let i = 0; i < maxIterations; i++) {
    const response = await callModel(messages, schemas);

    // 0.39.257 — a model call that failed (e.g. a browser agent's job stopped at a gate) ends the run as a
    // failure, with its reason and jobId, instead of being returned as if it were the answer.
    if (response && response.failed) {
      return { text: response.text || '', failed: true, error: response.error || 'model call failed', jobId: response.jobId || null, iterations: i + 1, toolCallLog };
    }
    if (!response.toolCalls || !response.toolCalls.length) {
      // No tool requested — this is the final answer.
      return { text: response.text || '', iterations: i + 1, toolCallLog };
    }

    // Model requested one or more tools. Execute each for real, append
    // both the assistant's tool-call message and the tool results, then
    // loop back so the model can use them.
    messages.push({ role: 'assistant', content: response.text || '', tool_calls: response.toolCalls });
    for (const call of response.toolCalls) {
      const result = allowedTools && !allowedTools.has(call.name)
        ? { error: `"${call.name}" is outside the allowed tool scope for this run (${[...allowedTools].join(', ')}) — not executed` }
        : await executeTool(call.name, call.arguments, { context: opts.context || null, agent: opts.agent || null });   // 0.39.257 — context: the run's repoDir etc.
      toolCallLog.push({ name: call.name, arguments: call.arguments, result, iteration: i + 1, scopeRejected: !!(allowedTools && !allowedTools.has(call.name)) });
      messages.push({ role: 'tool', name: call.name, content: JSON.stringify(result) });
    }
  }

  return { text: '[agent-tools] exceeded maxIterations without a final answer', iterations: maxIterations, toolCallLog };
}

module.exports = { registerTool, getToolSchemas, executeTool, runToolLoop, TOOLS };

// Register the one real tool built so far — read_file (lib/agent-tools/tools/read-file.js).
registerTool(require('./tools/query/read-file.js'));
registerTool(require('./tools/execution/run-command.js'));
// §MERGED 2026-07-09 from nexus-merged-v7 — diagnose reads the real
// diagnostic service (:7825); move-data moves records between JAA tables.
registerTool(require('./tools/diagnostic/diagnose.js'));
registerTool(require('./tools/execution/move-data.js'));

// §MERGED 2026-07-09 — from nexus-v8-rfr2-wired + copilot-full-tool-access.
// run_pipeline executes a real cockpit pipeline; nexus_intelligence queries
// cortex's faculties (intuition/mastermind/adversarial).
//
// §DUPLICATE REFUSED — the incoming index also registered
// tools/run-cockpit-command.js alongside tools/run-command.js. Both read
// cockpit's INTERACTION_CONTRACT and both execute via ForgeCLI.exec(): they
// are the same tool under two names. A model offered both would pick
// arbitrarily, and the two would drift. run_command stays canonical (it
// enumerates args, which run_cockpit_command does not). Merge duplicates by
// picking one and deleting the other — never by keeping both.
registerTool(require('./tools/execution/run-pipeline.js'));
registerTool(require('./tools/query/query-intelligence.js'));

// §MERGED 2026-07-10 from nexus-v9 — run_closed_loop drives the full pipeline
// (idea → spec → chunk → build → repo) as a single agent tool. This is
// "co-pilot can do anything nexus can": it calls the same idearium HTTP API a
// human would. Its test passes (4/4).
//
// §DUPLICATE REFUSED AGAIN — v9's index also registered run-cockpit-command
// alongside run-command, for the second time. Both read cockpit's
// INTERACTION_CONTRACT and both exec via ForgeCLI. Same tool, two names.
// run_command stays canonical. Refused once, refused again — a prior decision
// isn't undone by re-uploading the file.
registerTool(require('./tools/execution/run-closed-loop.js'));

// §PHASEMAP P5 — faculty-as-tool adapters (module_builder, run_adversarial,
// axiom_check, analyze). Thin wrappers over the copilot faculties so the loop
// can invoke them; faculties stay sovereign in copilot/ (§16.5). Exports an
// array — register each. Both copilot's and Guardian's loops get them.
for (const facultyTool of require('./tools/faculty/faculty-tools.js')) registerTool(facultyTool);

// §PHASEMAP P6 — call_system: every registered system reachable through one
// tool, resolving via the capability registry (the self-register work) and
// dispatching via nexus-client. Routes THROUGH the registry, not a competing
// path (§10.3).
registerTool(require('./tools/execution/call-system.js'));

// §PHASEMAP P8 (bridge) — UI as co-pilot tools: ui_spotlight + ui_nerve wrap the
// existing tv-shell HTTP surfaces so co-pilot can guide the user through the UI.
for (const uiTool of require('./tools/faculty/ui-tools.js')) registerTool(uiTool);

// §MERGED 2026-07-10 — query_recall. cortex /api/recall EXISTS
// (CortexPushRecall) with two real lanes, lexical + recency. copilot WROTE to
// recall but never READ it: it had no way to query its own past conversations.
// This is that read path, exposed to the agent loop — "what did we decide about
// X". Honest scope: 3 of 5 lanes (causal/failure/bep) need the absent kernel
// causal graph, so the tool only offers the intents whose lanes are real.
registerTool(require('./tools/query/query-recall.js'));

// §BUILT 2026-07-13 — browser_action. "Guardian is supposed to use Clear
// Glass. It's NEXUS' browser. Give the co-pilot more access." Guardian and
// Clear Glass only ever talked one direction before this — Clear Glass's
// userscripts connect INTO guardian's NCP channel, guardian never called
// out to Clear Glass at all, despite a real, complete command surface
// (IpcBridge's /cmd) sitting there unused. This tool is the first real
// path the other way: navigate/dom-query/dom-mutate/driver-exec/cookie
// management, through guardian's new 'browser' provider dispatch
// (guardian/server.js) → guardian/clear-glass-bridge.js's real two-step
// round trip (POST /cmd to submit, SSE /events to collect the actual
// result — checked Clear Glass's real wire format directly, not assumed).
// Verified end-to-end against a real mock of the full chain: tool →
// guardian job creation (POST /command — not /api/jobs, an assumption
// caught and fixed before shipping) → guardian job polling (GET /jobs,
// filtered by id — there is no single-job route, also caught before
// shipping) → the real clear-glass-bridge.js → a real Clear Glass mock
// implementing both /cmd and /events exactly. Full round trip confirmed.
registerTool(require('./tools/browser/browser-action.js'));

// §BUILT 2026-09-19 — agent_mesh_route. Closes a real, confirmed,
// previously-unbuilt gap: this tool name was already in copilot's own
// tool guide, and a dangling-hook GAP for it had already surfaced in a
// real boot log earlier this session — declared, never built. Reuses
// browser_action's own proven, completely generic Guardian-job dispatch
// + poll mechanism, pointed at clear-glass/src/gates/index.js's
// already-real, already-registered mesh.spawn/mesh.send/mesh.route/
// mesh.enqueue gates (checked directly, not assumed) instead of
// driver.exec/dom.query. See the tool's own header for the one real,
// named gap left open (no list/listNodes/listMeshView/listAgents gate
// exists yet — a real, separate, smaller follow-up).
registerTool(require('./tools/mesh/agent-mesh-route.js'));

// §BUILT 2026-09-19 — bookmarks_manage + account_manage. Close
// docs/2026-08-27-event-taxonomy-and-brainstorm-phasemap.spec's BR8
// (real, still open — checked live via loom's own phasemap-map.js
// forSystem() before building, not assumed stale or current).
// Bookmarks already had 6 real gates with zero tool coverage;
// accounts had zero gate coverage at all — 5 new gates built alongside
// account_manage. BR8's third named item, rewind snapshots, was
// already real and complete (lib/agent-tools/tools/sandbox/
// rewind-replay.js, confirmed by reading it directly) — not rebuilt.
registerTool(require('./tools/bookmarks/bookmarks-manage.js'));
registerTool(require('./tools/accounts/account-manage.js'));
registerTool(require('./tools/history/history-manage.js'));
registerTool(require('./tools/clear-glass/stream-bridge.js'));
registerTool(require('./tools/clear-glass/search-engine.js'));
registerTool(require('./tools/site-settings/site-settings-manage.js'));
registerTool(require('./tools/autofill/autofill-manage.js'));

// §BUILT 2026-07-14 — nexus_status. "Copilot needs to be the face of
// NEXUS, can do anything the system can." Checked what was actually
// missing: LOOM (concerns, impact queries), nexus-healer (proposal
// status), and hooks' impact-propagation queries had zero agent-tool
// coverage. This is the read-only half of that gap — five real, live
// queries, nothing here mutates anything, so it doesn't need the same
// authorization questions browser_action or forge needed. Verified
// against real declared LOOM data (concerns, a real component/hook/wire
// chain producing a real impactOf() relation) and real hooks/*.hooks.js
// data (writersOf/emittersOf against the real idearium.idea.create hook)
// — found and documented a real, honest distinction along the way: LOOM's
// own 'hook' kind and the hooks/*.hooks.js system are genuinely separate,
// not one system split across two stores, despite sharing a name.
registerTool(require('./tools/query/nexus-status.js'));

// §WIRED 2026-08-08 — movement + manifest drift had a CLI and an HTTP route but
// no agent access at all. The agent could not ask what a system was doing.
registerTool(require('./tools/query/query-movement.js'));
registerTool(require('./tools/query/query-lenses.js'));
registerTool(require('./tools/execution/forge-tool.js'));
registerTool(require('./tools/governance/propose-idea.js'));

// §2026-08-09 — re-attach tools copilot forged in earlier sessions. Each is
// RE-VALIDATED on load: one whose target capability has since been removed does
// not come back (§0.1 — proven now, not when it was written).
try { require('../tool-forge.js').loadAll(); } catch (_) {}
registerTool(require('./tools/coordination/capability-tools.js'));

// §WIRED 2026-08-12 — James: "Tasks, schedule jobs, polling... fully
// programmable... use co-pilot to use loom to expand, diagnose/heal/monitor."
// lib/scheduler.js, lib/triggers.js, nexus-healer's proposal API, and loom's
// scanners all existed complete with zero agent-tool coverage (§1.1 — a
// capability the agent cannot call is not the agent's capability). All four
// are thin wrappers (§16.5) — no new scheduling, governance, persistence, or
// scanning logic; that all already lives in the wrapped modules.
registerTool(require('./tools/governance/schedule-task.js'));
registerTool(require('./tools/governance/register-trigger.js'));
registerTool(require('./tools/diagnostic/nexus-heal.js'));
registerTool(require('./tools/diagnostic/loom-scan.js'));
// §BUILT 2026-09-13 — James: "no a .tool for the stubs finder to find
// stubs in the codebase." loom_scan's "stubs" action (same real
// scanner) already exists; this is the same logic as its own
// first-class, directly discoverable tool.
registerTool(require('./tools/diagnostic/stub-finder.js'));
// §BUILT 2026-09-13 — James: "can you create a .tool to find mock data
// also." Real, distinct signal class — literal fake DATA VALUES, not
// code shapes. See lib/agent-tools/tools/diagnostic/mock-data-finder.js's
// own header.
registerTool(require('./tools/diagnostic/mock-data-finder.js'));
registerTool(require('./tools/governance/raid-snr.js'));

// §BUILT 2026-08-17 — James: "co-pilot able to walk through making a spec
// using the compiler, dimensions." Wraps idearium's real spec-engine.
registerTool(require('./tools/governance/spec-wizard.js'));

// §BUILT 2026-08-17 — James: bottom-up priority system for gaps, a real
// boot check in the right order, and a real path to log fixes as work
// happens. See lib/gap-priority.js and lib/system-check.js.
registerTool(require('./tools/diagnostic/system-priority.js'));
registerTool(require('./tools/sandbox/rewind-replay.js'));
// §BUILT 2026-08-23 — James: "lets do macros." Built on top of
// browser_action + rewind_replay, not parallel to them.
registerTool(require('./tools/clear-glass/macro.js'));
registerTool(require('./tools/identity/copilot-identity.js'));
registerTool(require('./tools/diagnostic/resource-monitor.js'));
registerTool(require('./tools/query/agent-chat-search.js'));
registerTool(require('./tools/query/nexus-help.js'));
registerTool(require('./tools/sandbox/cos-compartment.js'));

// §BUILT 2026-08-18 — James: "it's time to have the system start
// building and repairing itself." The real, complete propose/test/
// promote pipeline. See lib/agent-tools/tools/sandbox/self-repair.js.
registerTool(require('./tools/sandbox/self-repair.js'));
registerTool(require('./tools/sandbox/cos-simulate.js'));
registerTool(require('./tools/query/meta-query.js'));
registerTool(require('./tools/execution/run-chain.js'));
registerTool(require('./tools/identity/hat-forge.js'));
registerTool(require('./tools/coordination/agent-capability.js'));
registerTool(require('./tools/coordination/agent-notes.js'));
registerTool(require('./tools/coordination/nexus-wake-events.js'));
registerTool(require('./tools/coordination/framework-builder.js'));
registerTool(require('./tools/coordination/intelligence-query.js'));
registerTool(require('./tools/clear-glass/dom-archaeology.js'));
registerTool(require('./tools/clear-glass/userscripts.js'));
registerTool(require('./tools/clear-glass/tab-visibility.js'));
// §0.39.265 — workflows (schedules, events, webhooks, DOM steps) and a browser page agents drive with the same DOM tools
registerTool(require('./tools/clear-glass/automation.js'));
registerTool(require('./tools/clear-glass/browser-automation.js'));
registerTool(require('./tools/clear-glass/provider-deploy.js'));
registerTool(require('./tools/clear-glass/command-index.js'));
registerTool(require('./tools/execution/safe-apply.js'));
registerTool(require('./tools/coordination/agent-council.js'));
registerTool(require('./tools/query/fault-log.js'));
registerTool(require('./tools/coordination/roundtable.js'));
registerTool(require('./tools/coordination/parallel-dispatch.js'));
registerTool(require('./tools/execution/emergence.js'));

// §WIRED 2026-08-19 — the "hey nexus" merge. agent_council/roundtable/
// parallel-dispatch all fan the same question out to several agents;
// nothing addressed ONE agent with a hop cap and a real logged history
// (guardian_chat_log had zero writers — confirmed by grep before building
// lib/agent-chat.js). This is that tool.
registerTool(require('./tools/coordination/agent-chat.js'));

// §WIRED 2026-08-14 — James: "give you a tool to check loom, cortex and
// file tree and system." read_file only ever handled one named file — no
// way for the model to discover what's there before requesting it.
// Checked before building: zero listDir/fileTree/walkTree coverage
// anywhere in lib/agent-tools. file_tree is the read-side counterpart to
// read_file, same safe-path containment pattern, reused not re-derived.
registerTool(require('./tools/query/file-tree.js'));

// §BUILT 2026-08-18 — James: "query for a file or keyword."
registerTool(require('./tools/query/search-files.js'));

// §WIRED 2026-08-14 — James: "build any copilot tools you can. all the
// compartment tools. compiler? hats? mapping tool?" hat_forge (identity/
// hat-forge.js) already covers forge/wear/list/get/revoke in full —
// checked, nothing to add there. cos_compartment (2026-08-12) only ever
// wrapped host/gates/compartment.js; its five siblings in the same
// directory had zero coverage until now. compiler_info is honestly
// scoped — no real "run a build" gate exists anywhere in COS to wrap, so
// this is reference lookup over the real compiler-enum, not a fabricated
// compile action. nexus_map composes loom's already-computed real graph
// with agent-system/contracts.js's real per-agent token limits — a
// chunked reader over existing data, not a second file-tree parser.
registerTool(require('./tools/sandbox/cos-archetype.js'));
registerTool(require('./tools/sandbox/cos-blueprint.js'));
registerTool(require('./tools/sandbox/cos-playground.js'));
registerTool(require('./tools/sandbox/cos-plugin.js'));
registerTool(require('./tools/sandbox/cos-vault.js'));   // get/export deliberately excluded — see file header
registerTool(require('./tools/query/compiler-info.js'));
registerTool(require('./tools/query/nexus-map.js'));

// §WIRED 2026-08-14 — James: "co-pilot can create its own capabilities...
// reference its models... switch agent... log ideas... create compartment
// types, axioms... build new capabilities and add hook/wires but has to
// have a consumer." Checked before building: forge-tool.js (2026-08-09)
// already covers "create its own capabilities/commands." propose_idea
// (2026-08-09) already covers "log ideas" — confirmed empty in the store
// this session, but the mechanism is real and complete, nothing to add.
// agent-capability.js already covers "reference its models." Genuinely
// missing: the WRITE half of axioms (axiom_check was read-only), a
// consumer-enforced way to register new hooks/wires (registry.add() had
// zero consumer check — the exact shape of the dangling-hook flood this
// session already fought), and a dedicated switch_agent (hat_forge's
// "wear" already did this, just buried inside hat-shaped params).
registerTool(require('./tools/governance/axiom-manage.js'));
registerTool(require('./tools/governance/loom-register.js'));
registerTool(require('./tools/identity/switch-agent.js'));

// §BUILT 2026-08-17 — James: intent-based co-pilot, intents linked to
// hats. See lib/intent-hat-router.js.
registerTool(require('./tools/identity/intent-hat.js'));

// §WIRED 2026-08-14 (same session, continued) — "take notes. to do list...
// versionium." notes_todo: genuinely missing primitive, checked directly
// (zero hits anywhere for notes/todo).
//
// §VERSIONIUM MIGRATION 2026-09-01 — versionium-commit.js now exports
// three real tools (commit/history/restore), all reached via sovereign
// transport (lib/nexus-client.js -> cortex's real /api/versionium/*
// routes) rather than the cross-process require() this file used before —
// see that module's own header for the real bug that fixed.
registerTool(require('./tools/query/notes-todo.js'));
{
  const { commitTool, historyTool, restoreTool } = require('./tools/governance/versionium-commit.js');
  registerTool(commitTool);
  registerTool(historyTool);
  registerTool(restoreTool);
}
registerTool(require('./tools/execution/delete-file.js'));

// §WIRED 2026-08-14 — James, directly: "co-pilot should not give 'no' for
// an answer — either figures it out, asks me, or uses lifeline contract."
// This is AM8(d) of docs/agent-model-and-user-continuity-phasemap.spec,
// already mapped three turns ago, confirmed still true by re-reading
// lifeline.js's route() directly this turn: the escalation chain is
// AI-to-AI only, zero "ask the actual person" rung. Uses AM7(e)'s already-
// scoped {needs, why, whatWouldUnblock} shape rather than a new one.
registerTool(require('./tools/governance/ask-james.js'));

// §WIRED 2026-08-19 — found unregistered: the file existed, its own 34
// tests passed, but nothing could actually reach it as a real tool.
registerTool(require('./tools/governance/tool-config.js'));

// §BUILT 2026-08-14 — AM5 of agent-model-and-user-continuity-phasemap.spec.
// Composes real pieces (query_recall, loom_scan, lifeline.route to
// perplexity, browser_action) in the exact cheap-to-expensive order the
// phasemap specified, not a new dispatch mechanism. AM1's step honestly
// skipped — that phase is still mapped, not built.
registerTool(require('./tools/query/ambiguity-pull.js'));

// §NEW 2026-09-06 — James: "wires tools for copilot for... ncp, agentmesh
// ... guardian." clear-glass and macros already had real tool coverage
// (macro.js, dom-archaeology.js, etc. above); erosmancer already reached
// through macro.js's own real /eros/* proxy — these 3 were the genuine
// gaps, confirmed by find across the whole tools/ tree before writing
// anything.
registerTool(require('./tools/guardian/dispatch.js'));
registerTool(require('./tools/ollama/generate.js'));
registerTool(require('./tools/ncp/status.js'));
registerTool(require('./tools/agent-mesh/route.js'));

// §BUILT 2026-09-12 — James's new dotted naming convention
// (system.name.tool / system.name.command / provider.agent.name.agent.tool
// — see naming.js). cortex.restep.tool is genuinely new capability, not a
// duplicate of anything already registered above (checked every existing
// tool name against James's taxonomy first — most categories already had
// a real tool under the old flat naming; see naming.js's §SCOPE note for
// why those weren't duplicated here).
registerTool(require('./tools/system-tools/cortex-restep.js'));

// §BUILT 2026-09-12 — James's 4 confirmed real gaps against the dotted
// taxonomy (checked against all 81 existing tools + naming.js's own
// §SCOPE note first — everything else in the taxonomy already had real,
// old-naming coverage; renaming those is the separate migration naming.js
// itself calls out, not bundled in here).
//
// cortex.node_tag.tool needed a real backend fix first: cortex's own
// registry-components.js declared tags.list/tags.add as real, but no
// handler existed anywhere in cortex/boot.js — closed in the same pass
// (see cortex/boot.js's §GAP CLOSED 2026-09-12 comment), not worked
// around.
registerTool(require('./tools/cortex/node-tag.js'));
// guardian.build.tool — the literal example name from naming.js's own
// docstring, reserved but unbuilt until now. Wraps the real, already-
// working POST /build pipeline (guardian/server.js:2531).
registerTool(require('./tools/guardian/build.js'));
// versionium.history.tool + versionium.snapshot.tool — split log/calendar
// (browse-many) from state/restore (one-commit) rather than one
// do-everything tool, matching how the underlying routes are themselves
// separate concerns in versionium/routes/versionium.js.
registerTool(require('./tools/versionium/history.js'));
registerTool(require('./tools/versionium/snapshot.js'));
registerTool(require('./tools/idearium/repo-chunks.js')); // §2026-09-21 — a compartment agent reads its repo's chunk nodes for context
// §0.39.266 — the registry harness: find / card / read / write / test (lib/agent-tools/tools/loom/harness.js)
{ const H = require('./tools/loom/harness.js'); for (const t of [H.find, H.card, H.read, H.write, H.test]) registerTool(t); }
// §0.39.273 — the codebase tools (lib/agent-tools/tools/idearium/code.js): map · search · grep · chunk · read · refs ·
// edit · write · batch · check · changes, over idearium's /api/repos/:uuid/code/* (idearium/repo/code-api.js)
for (const t of require('./tools/idearium/code.js').ALL) registerTool(t);
// nexus.syntax_debug.tool — reuses precommit-check.js's own proven
// `node --check` mechanism, generalized from staged-files-only to an
// arbitrary scope.
registerTool(require('./tools/system-tools/syntax-debug.js'));

// 0.39.272 — James: "i want copilot completely aware of clearglass, hooked in completely … idearium agents should be
// able to find the context easily … automate job applications, fiverr, etc."
// clearglass.browser.tool — Clear Glass whole and synchronous (state, read, act, sequence, tabs, autofill, screen
// questions, and every IPC channel via channels/invoke) straight to :7702, results in the call; it learns per site. nexus.context.tool — one door to every memory system and graph
// (lib/context-atlas.js). nexus.opportunity.tool — the job/freelance pipeline (lib/opportunity/).
registerTool(require('./tools/clear-glass/browser.js'));
registerTool(require('./tools/query/context-atlas.js'));
registerTool(require('./tools/opportunity/opportunity.js'));
// 0.39.272 — clearglass.learned.tool: what copilot learned driving Clear Glass (lib/cg-learning.js) + application outcomes
registerTool(require('./tools/clear-glass/learned.js'));
