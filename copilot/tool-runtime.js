'use strict';
/**
 * copilot/tool-runtime.js — P1 of the omniscience phasemap
 * UUID: nexus-copilot-tool-runtime-v1-0000-2026-0730-001
 * Version: 1.0.0
 *
 * §PHASEMAP P1 (docs/copilot-omniscience-phasemap.spec). Wires the SOVEREIGN
 * tool-calling loop (lib/agent-tools) into copilot by injecting copilot's own
 * model dispatch as `callModel`. agent-tools stays sovereign — it knows nothing
 * about copilot; copilot brings the model, agent-tools brings the loop and the
 * 10 tools (§10.1 — copilot owns its callModel, not the loop; §16.5 — use the
 * module, don't duplicate it).
 *
 * This is deliberately a SEPARATE module, not inlined into the 1266-line
 * server.js: the loop + the callModel adapter + the persistence/stream threading
 * are testable in isolation here, and server.js just calls run().
 *
 * §B / non-linear — the same lib/agent-tools is wired into guardian in P4 with a
 * DIFFERENT callModel (guardian's providers). Nobody owns the loop.
 */

const agentTools = require('../lib/agent-tools');
const http = require('http');
const path = require('path');
const nodeExport = require('../lib/node-export.js');
const { uid } = require('../cortex/memory/jaa-db');

// §ADDED 2026-09-13 — the .injection node type. James: "every time
// something gets prepended to a dispatch, there'd be a real node
// recording what and why" (see lib/node-schemas/schema.injection,
// status:REAL). Written at the one real construction site
// (makeNcpCallModel's callModel, below) every call, primed or not —
// a skipped injection is real data too, not just a sent one. Same
// non-fatal discipline as this file's own gapField.report() calls:
// a write failure here must never break the real dispatch it's
// describing.
// Overridable for tests, same convention as test-node-index.js's JAA_DATA_DIR
// redirect — real writes must never land in the real data dir during a test run.
// 0.39.257 — a test process gets a temp dir first (lib/test-sandbox.js); the override alone was opt-in, and
// tests/modules/lifeline-fluid-routing.test.js left .injection files in the real tree on every run.
require('../lib/test-sandbox.js').ensure();
const INJECTION_NODES_DIR = process.env.COPILOT_INJECTION_DIR || path.join(__dirname, 'data', 'nodes', 'injection');
function _recordInjection(payload) {
  try {
    nodeExport.exportToFile('injection', uid(), payload, {
      context: 'copilot/tool-runtime.js makeNcpCallModel callModel',
      system: 'copilot',
      source: 'copilot.tool-runtime.makeNcpCallModel',
    }, INJECTION_NODES_DIR);
  } catch (e) {
    console.warn(`[copilot/tool-runtime] .injection record failed (non-fatal): ${e.message}`);
  }
}

// §ADDED 2026-09-11 — the fallback lookup for makeNcpCallModel's failure
// path below. GET /response/:jobId already exists on guardian's server
// (server.js ~1875, built for Forge's GuardianClient) with real, already-
// built multi-layer recovery: in-memory `jobs` Map -> persisted JAA jobs
// table -> matching artifact content. Not new infrastructure — this just
// reaches an endpoint that was already there and already more resilient
// than the in-memory-only path that fails in the screenshot's exact
// scenario (dispatch completes, response never reaches the caller).
const GD_URL = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
function _fetchGuardianResponse(jobId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!jobId) return resolve(null);
    const req = http.get(`${GD_URL}/response/${jobId}`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j?.ok && j.response ? j : null);
        } catch (_) { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}


/**
 * makeOllamaCallModel(dispatch, pollJob) — adapt copilot's job-based ollama
 * dispatch into the (messages, toolSchemas) => {text, toolCalls} shape
 * runToolLoop expects.
 *
 * copilot's dispatch is async/job-based (POST /api/jobs then poll), and returns
 * ollama's response which may contain tool_calls. This adapter:
 *   1. flattens messages into the prompt/context shape _dispatchToOllama wants,
 *   2. awaits the job to completion,
 *   3. extracts tool_calls from the response (ollama returns them OpenAI-shaped),
 *   4. returns { text, toolCalls } — null toolCalls means "final answer".
 *
 * dispatch(prompt, context, opts) — copilot's _dispatchToOllama (returns a job or job result)
 * pollJob(jobRef) — resolves a job to its final { text, toolCalls?, model } (injected; copilot owns the poll)
 */
function makeOllamaCallModel(dispatch, pollJob, opts = {}) {
  return async function callModel(messages, toolSchemas) {
    // Flatten the running message list: system+user+prior tool results become
    // the context; the latest user/tool content is the live prompt.
    const system = opts.composed ? '' : (messages.find(m => m.role === 'system')?.content || '');
    // 0.39.258 composed: ollama keeps no conversation, so every turn is re-sent — but unlabeled, as composed, with
    // tool results framed by the caller's 'tool-result' template.
    const convo = opts.composed
      ? messages.filter(m => m.role !== 'system').map(m => m.role === 'tool' ? formatToolResult(opts.resultTemplate, m.name, m.content) : String(m.content || '')).filter(Boolean).join('\n\n')
      : messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') return `[tool:${m.name}] ${m.content}`;
        if (m.role === 'assistant') return `ASSISTANT: ${m.content || ''}`;
        return `USER: ${m.content || ''}`;
      })
      .join('\n');

    const jobRef = await dispatch(convo, system, {
      ...opts,
      tools: toolSchemas,            // ollama-bridge passes these to /api/chat tools
      intent: 'tool-loop',
      componentId: 'copilot.tool-runtime',
      hookId: 'copilot.tool-runtime.to-ollama',
    });

    const final = await pollJob(jobRef);
    // Normalize: a job result may carry toolCalls (ollama tool_calls) or just text.
    const toolCalls = _extractToolCalls(final);
    const text = final.text || final.result || '';
    if (toolCalls && toolCalls.length) return { text, toolCalls };
    // §0.39.336 SB36 — the bridge runs a tool-loop job as a plain generate (no native tools reach /api/chat), so a call
    // is what the model WRITES: the same ```tool block (or bare {"name": …} of a known tool) the browser agents write,
    // read by the same parser. Before this an Ollama agent had no way to call any tool.
    const known = (toolSchemas || []).map(t => t && t.function && t.function.name).filter(Boolean);
    const found = _findToolCalls(text, known.length ? known : null);
    return { text: found.calls.length ? found.text : text, toolCalls: found.calls.length ? found.calls : null };
  };
}

/** Pull OpenAI/ollama-shaped tool_calls out of a job result, normalized to runToolLoop's shape. */
function _extractToolCalls(final) {
  const raw = final.toolCalls || final.tool_calls || final.message?.tool_calls;
  if (!Array.isArray(raw)) return null;
  return raw.map((c, i) => {
    const rawArgs = c.arguments !== undefined ? c.arguments : c.function?.arguments;
    return {
      id: c.id || `call_${i}`,
      name: c.name || c.function?.name,
      arguments: typeof rawArgs === 'string' ? _safeParse(rawArgs) : (rawArgs || {}),
    };
  }).filter(c => c.name);
}

function _safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

// ── P6.5 (2026-08-13) — "co-pilot is the hat, the agents are who wear
// them." Ollama gets real tool-calling because ollama-bridge's /api/chat
// takes a real `tools` param. Claude/chatgpt/gemini/mistral/perplexity via
// NCP are browser automation (guardian's userscripts driving the actual
// web chat UI) — there is no function-calling API in that path, structurally
// can't be, you're typing into a textbox and reading back what appears. So
// "wearing the copilot hat" for those agents was pure conversation, no
// tools — checked and confirmed live before building this, not assumed.
//
// Fix: give NCP-driven agents the SAME tool loop through prompt-engineered
// structured responses instead of a native API param. Not inventing a new
// convention — clear-glass/src/copilot/bridge.js's _parseCommands() already
// scans co-pilot responses for fenced ```tool blocks containing raw JSON
// (built for browser-driver commands). Reusing that exact fenced-block
// SYNTAX for agent-tools calls too — same shape any of these models can
// already produce reliably (a JSON code block), no retraining, no new
// protocol to teach them beyond what's in the prompt itself.
const TOOL_BLOCK_RE = /```tool\s*\n([\s\S]*?)\n```/g;

// §0.39.261 — James, live: the agent answered
//     tool
//     {"name":"file_tree","arguments":{}}
// and "tool did nothing". A browser agent's reply is read from the RENDERED
// page (guardian's userscripts take the DOM text), where a ```tool fence is
// already a code block: its text is the language label on its own line,
// sometimes a "Copy code" button label, then the JSON — no backticks at all.
// TOOL_BLOCK_RE only ever matched the raw-markdown form, so every tool call
// from ChatGPT/Claude's rendered page was silently dropped. _findToolCalls
// reads all three forms: the fence, the rendered block, and a bare JSON call
// object. A non-fence form counts ONLY when its name is one of the tools
// actually offered (known), so an answer that merely contains JSON never
// triggers a tool.
function _jsonObjectAt(text, start) {
  let depth = 0, q = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"') q = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function _findToolCalls(text, known = null) {
  const src = String(text || '');
  const calls = [], spans = [];
  const knownSet = known && known.length ? new Set(known) : null;
  const take = (obj, from, to, fenced) => {
    if (!obj || typeof obj.name !== 'string' || !obj.name) return false;
    if (!fenced && !knownSet) return false;                 // bare JSON needs a known tool list to be trusted
    if (knownSet && !knownSet.has(obj.name)) return false;
    const args = obj.arguments && typeof obj.arguments === 'object' ? obj.arguments : (obj.args && typeof obj.args === 'object' ? obj.args : {});
    calls.push({ id: `call_${calls.length}`, name: obj.name, arguments: args });
    spans.push([from, to]);
    return true;
  };
  TOOL_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = TOOL_BLOCK_RE.exec(src)) !== null) {
    try { take(JSON.parse(m[1].trim()), m.index, m.index + m[0].length, true); } catch (_) { /* malformed block — skipped, not fatal */ }
  }
  const inSpan = (i) => spans.some(([a, b]) => i >= a && i < b);
  const rx = /\{\s*"name"\s*:/g;
  while ((m = rx.exec(src)) !== null) {
    if (inSpan(m.index)) continue;
    const raw = _jsonObjectAt(src, m.index);
    if (!raw) continue;
    let obj; try { obj = JSON.parse(raw); } catch (_) { continue; }
    // widen the span over a rendered code block's label lines ("tool", "Copy code") just above it
    let from = m.index;
    const before = src.slice(0, from);
    const lab = before.match(/(?:^|\n)[ \t]*(?:tool|json)[ \t]*\n(?:[ \t]*copy(?: code)?[ \t]*\n)?[ \t]*$/i);
    if (lab) from = before.length - lab[0].length + (lab[0].startsWith('\n') ? 1 : 0);
    if (take(obj, from, m.index + raw.length, !!lab && !knownSet)) rx.lastIndex = m.index + raw.length;
  }
  let rest = src;
  for (const [a, b] of spans.slice().sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + rest.slice(b);
  return { calls, text: rest.replace(/\n{3,}/g, '\n\n').trim() };
}

function _parseToolBlocks(text, known = null) {
  if (known) return _findToolCalls(text, known).calls;
  const commands = [];
  TOOL_BLOCK_RE.lastIndex = 0; // regex has /g — reset between calls, a shared module-level regex with lastIndex is a real footgun otherwise
  let m;
  while ((m = TOOL_BLOCK_RE.exec(text || '')) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && parsed.name) commands.push({ id: `call_${commands.length}`, name: parsed.name, arguments: parsed.arguments || {} });
    } catch (_) { /* malformed block — skip it, don't crash the loop over one bad JSON attempt */ }
  }
  return commands;
}

function _toolInstructions(toolSchemas, opts = {}) {
  // §FIXED 2026-09-13 — James: "i bet you its the agent model." Right
  // instinct, exact real cause: runViaAgent() (below) already bakes
  // lib/agent-tools/tool-guide.js's full "how and when to use" prose —
  // name + description + edge-case + prefer-this-over-that, for every
  // real tool — into systemPrompt BEFORE this function ever runs. This
  // function then re-listed every tool's own full description a SECOND
  // time, in a different format, for the exact same real purpose. Two
  // real, independently-built, both-correct pieces that were never
  // reconciled — same collision class as the earlier `tools:[]` fix,
  // just one level up: that one stopped GUARDIAN duplicating the
  // catalog; this stops COPILOT duplicating it against its own already-
  // included guide.
  //
  // guide:true (passed by makeNcpCallModel below, since runViaAgent's
  // systemPrompt always includes toolGuide()) renders ONLY what
  // toolGuide() genuinely does not say — the exact machine-readable
  // calling syntax — plus a bare name list, not a second copy of every
  // description. Defaults to the original, fuller format for any other
  // real caller that hasn't already given the model a guide.
  const list = opts.guide
    ? toolSchemas.map(t => t.function.name).join(', ')
    : toolSchemas.map(t => `- ${t.function.name}: ${t.function.description}`).join('\n');
  return [
    'You have real tools available. To use one, respond with EXACTLY this format (a fenced code block, nothing else in that block):',
    '```tool',
    '{"name": "tool_name_here", "arguments": {"param": "value"}}',
    '```',
    'Only one tool call per response. If you don\'t need a tool, just answer normally in plain text — no fenced block.',
    opts.guide ? 'Available tools (see YOUR TOOLS above for what each does and when to use it):' : 'Available tools:',
    list,
  ].join('\n');
}

// §FIXED 2026-09-13 — James: "i have no idea that the problem. i type
// mdawp in tv ui floating menu cli and it pastes a mountain." Traced:
// every single call to callModel() below rebuilds and resends the
// FULL system context (copilot-context.js's 7-layer L0-L6 assembly +
// axioms + user model + session history + recall context) AND the
// complete tool catalog (_toolInstructions() above, 60+ real tools with
// full descriptions) — regardless of how trivial the actual message is.
// A 5-character "mdawp" produces the exact same multi-thousand-word
// paste as a real, complex request, every time, because nothing here
// ever asked "does the live tab this is going to already have this
// context from a moment ago?"
//
// It usually does: guardian dispatches into ONE real, persistent
// browser tab per provider (clear-glass/src/providers/host.js) that
// keeps its own real conversational memory as long as it stays alive.
// Re-sending the whole mountain on every turn of an ongoing exchange is
// real, unnecessary, repeated cost — the tab already has it.
//
// §HONEST LIMIT — the real provider often isn't resolved yet at this
// point (RAID can still be routing 'auto'), and there is no live,
// cross-process signal here for "was this exact tab destroyed and
// recreated since I last sent full context" — clear-glass/src/
// providers/host.js's own real idle-timeout (IDLE_TIMEOUT_MS, 120000ms
// default) is the only real, named number that bounds how long a tab
// can go quiet before ProviderHost genuinely destroys and later
// recreates it, wiping its conversational memory. Reusing that exact
// constant here, not inventing a new one: a provider heard from within
// the last 120s is treated as still the same live, already-primed tab
// (skip the mountain); anything older, or a provider never primed
// before, gets the real, full context again. When genuinely uncertain
// (provider not yet resolved), this errs toward sending full context —
// an occasional repeated mountain is a real cost, but silently losing
// tool access mid-conversation because a guess about tab freshness was
// wrong would be a worse one.
const PROVIDER_IDLE_MS = 120000; // matches clear-glass/src/providers/host.js's own real IDLE_TIMEOUT_MS
const _lastPrimedAt = new Map(); // provider -> ts of the most recent exchange (full or short)

function _isFreshlyPrimed(provider) {
  if (!provider || provider === 'auto') return false; // unresolved — can't know which tab this is, don't guess
  const last = _lastPrimedAt.get(provider);
  return typeof last === 'number' && (Date.now() - last) < PROVIDER_IDLE_MS;
}

/**
 * makeNcpCallModel(dispatchToAgent) — adapt guardian's NCP dispatch (a
 * browser-driven agent — claude/chatgpt/gemini/mistral/perplexity) into the
 * (messages, toolSchemas) => {text, toolCalls} shape runToolLoop expects.
 * No native function-calling exists on this path; tool calls are parsed
 * from a fenced ```tool block in the plain text response instead.
 *
 * dispatchToAgent(prompt, opts) — a single async call that returns the
 * agent's real text response (e.g. lifeline.js's _tryGuardian shape:
 * {ok, text, confidence}). No separate poll step — NCP dispatch is already
 * one round trip by the time this is called.
 */
// ── 0.39.258 composed mode ──────────────────────────────────────────────────
// James: "not to inject anything into it that i cant edit in the agent settings." A composed caller (idearium's
// repo agent) has already built the whole prompt from blocks the person edits (lib/repo-prompt-blocks.js). Here
// only its two tool placeholders are filled — {tools}: the names in scope; {tool_guide}: tool-guide.js for those
// names — and nothing is added: no system prompt, no identity, no USER:/ASSISTANT: labels, no priming logic.
// Follow-up rounds send ONLY the new tool results, each framed by the caller's 'tool-result' template ({name},
// {result}); with no template a result goes as its bare JSON. A browser tab keeps its own conversation, so the
// earlier turns are never re-pasted.
function _scopeNames(scope) {
  const all = agentTools.getToolSchemas().map(t => t.function.name);
  return Array.isArray(scope) && scope.length ? all.filter(n => scope.includes(n)) : all;
}
function fillToolPlaceholders(text, scope) {
  let out = String(text || '');
  if (out.includes('{tools}')) out = out.split('{tools}').join(_scopeNames(scope).join(', '));
  if (out.includes('{tool_guide}')) {
    let guide = '';
    try { guide = require('../lib/agent-tools/tool-guide').toolGuide(_scopeNames(scope)); }
    catch (e) { guide = ''; console.warn(`[copilot/tool-runtime] {tool_guide} could not be built (left empty, not guessed): ${e.message}`); }
    out = out.split('{tool_guide}').join(guide);
  }
  return out;
}
function formatToolResult(template, name, content) {
  if (typeof template !== 'string' || !template) return String(content);
  return template.split('{name}').join(String(name || '')).split('{result}').join(String(content));
}

function makeNcpCallModel(dispatchToAgent, opts = {}) {
  let _composedSent = 0;   // composed mode: how many messages this tab has already been given
  return async function callModel(messages, toolSchemas) {
    if (opts.composed) {
      // First round: the user message exactly as composed. Later rounds: only the tool results since then.
      const fresh = messages.slice(Math.max(_composedSent, 1)).filter(m => m.role === 'user' || m.role === 'tool');
      const out = fresh.map(m => m.role === 'tool' ? formatToolResult(opts.resultTemplate, m.name, m.content) : String(m.content || '')).join('\n\n');
      _composedSent = messages.length;
      _recordInjection({ provider: opts.provider || 'auto', primed: false, composed: true, injectedSystemPrompt: false,
        injectedToolGuide: false, toolCount: toolSchemas.length, promptLength: out.length, idleMsThreshold: PROVIDER_IDLE_MS });
      const result = await dispatchToAgent(out, { ...opts, tools: [] });
      if (!result || !result.ok) {
        const jobId = result && result.jobId;
        const recovered = jobId ? await _fetchGuardianResponse(jobId) : null;
        if (recovered && recovered.response) return { text: recovered.response, toolCalls: null, viaLedgerFallback: true, recoveredJobId: jobId };
        const why = (result && result.error) || 'no response';
        return { text: (result && result.text) || `[NCP dispatch failed — ${why}]`, toolCalls: null, failed: !(result && result.text), error: why, jobId: jobId || null };
      }
      const found = _findToolCalls(result.text, (opts.toolScope && opts.toolScope.length ? opts.toolScope : toolSchemas.map(t => t.function.name)));
      return { text: found.calls.length ? found.text : result.text, toolCalls: found.calls.length ? found.calls : null };
    }
    // §EXTENDED 2026-08-13 (P8) — a hat with a toolScope narrows which
    // tools are even OFFERED, not just which are allowed to run. A
    // "debugging hat" scoped to {read_file, diagnose} should never see
    // schedule_task in its own instructions — narrower is honest, not
    // just enforced after the fact.
    const scoped = opts.toolScope && opts.toolScope.length
      ? toolSchemas.filter(t => opts.toolScope.includes(t.function.name))
      : toolSchemas;

    const system = messages.find(m => m.role === 'system')?.content || '';
    const convo = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (m.role === 'tool') return `[tool result — ${m.name}] ${m.content}`;
        if (m.role === 'assistant') return `ASSISTANT: ${m.content || ''}`;
        return `USER: ${m.content || ''}`;
      })
      .join('\n');

    const primed = _isFreshlyPrimed(opts.provider);
    const fullPrompt = primed
      ? convo // already has real, live tools/context from moments ago — just the real new turn
      : [system, _toolInstructions(scoped, { guide: true }), convo].filter(Boolean).join('\n\n');
    const _lastPrimedTs = _lastPrimedAt.get(opts.provider);
    _recordInjection({
      provider: opts.provider || 'auto',
      primed,
      injectedSystemPrompt: !primed,
      injectedToolGuide: !primed,
      toolCount: scoped.length,
      promptLength: fullPrompt.length,
      idleMsThreshold: PROVIDER_IDLE_MS,
      ...(typeof _lastPrimedTs === 'number' ? { msSinceLastPrimed: Date.now() - _lastPrimedTs } : {}),
    });
    if (opts.provider && opts.provider !== 'auto') _lastPrimedAt.set(opts.provider, Date.now());
    // §FIXED 2026-09-13 — James: screenshots showing chatgpt's real,
    // dispatched prompt with TWO complete, DIFFERENT-SYNTAX tool catalogs
    // stacked in one message ([[TOOL: name {...}]] followed by a second,
    // full ```tool``` fenced-block catalog) — the exact same class of bug
    // guardian/ask.js's own 2026-09-02 fix already found and fixed for
    // ITS OWN internal manifest ("two independent tool-call mechanisms...
    // never reconciled"), but not for this specific chain: fullPrompt
    // above ALREADY embeds this loop's own complete _toolInstructions(),
    // and dispatchToAgent (copilot/lifeline.js's _tryGuardian) defaults
    // `tools: opts.tools || ESCALATION_TOOLS` — opts here never set
    // `tools`, so ESCALATION_TOOLS fell through every time, and
    // guardian/userscript-<agent>.js's own _buildToolsHeader(tools) then
    // prepended a SECOND, complete, [[TOOL:...]]-syntax catalog on top.
    // Real fix, at the source rather than patched downstream: this loop
    // is always the single source of truth for tool instructions once
    // fullPrompt is built, so it explicitly tells guardian not to build
    // its own — `tools:[]` is truthy (empty array), so it overrides the
    // `|| ESCALATION_TOOLS` fallback correctly rather than being treated
    // as unset.
    const result = await dispatchToAgent(fullPrompt, { ...opts, tools: [] });
    if (!result || !result.ok) {
      // §FIXED 2026-09-11 — this used to always return the canned
      // '[NCP dispatch failed — no response]' string, the exact string
      // shown in the screenshot even though the provider had already
      // answered correctly. Real cause traced to copilot/lifeline.js's
      // _tryGuardian discarding result.jobId on this exact failure path
      // (fixed there too, same pass) — without a jobId there was never
      // anything to recover from. With it, guardian's own GET
      // /response/:jobId (already real, already more resilient than the
      // in-memory-only path that failed) can often still answer.
      const jobId = result && result.jobId;
      const recovered = jobId ? await _fetchGuardianResponse(jobId) : null;
      if (recovered && recovered.response) {
        // §HONEST, per "nothing pretends to work" — a recovered answer
        // is not the same as a live round trip and must stay
        // distinguishable downstream, not silently presented as identical.
        return { text: recovered.response, toolCalls: null, viaLedgerFallback: true, recoveredJobId: jobId };
      }
      // §FIXED 2026-09-13 — James: "with the no response, need to know
      // why, like give me gap or error id... everything error needs to
      // log for every system." This fallback previously returned a bare
      // string with nothing behind it — no id, no record of promptLen/
      // provider/jobId to actually investigate why. Every other failure
      // branch in this same function already reports to lib/gap-field.js
      // (copilot/lifeline.js's own _tryGuardian does too, on its own
      // throw/empty-response paths) — this was the one silent gap in an
      // otherwise-consistent pattern. type/dedup_key stay stable per
      // provider so repeat failures bump occurrences on the same real
      // gap row instead of creating a new one every time (see this
      // file's own _dedupKey — same discipline as every other reporter).
      let gapUuid = null;
      try {
        const gapField = require('../lib/gap-field');
        const rep = gapField.report({
          type: 'copilot.ncp-dispatch-no-response',
          body: `NCP dispatch returned no usable response for provider "${opts.provider || 'unknown'}"` +
            (jobId ? ` (jobId ${jobId}, GET /response/:jobId recovery also came back empty)` : ' (no jobId — recovery was never reachable)'),
          source: opts.provider || 'copilot',
          domain: 'system',
          severity: 'medium',
          meta: {
            jobId,
            provider: opts.provider || null,
            promptLength: fullPrompt.length,
            recoveryAttempted: !!jobId,
            resultError: (result && result.error) || null,
          },
        });
        gapUuid = rep.gap && rep.gap.uuid;
      } catch (e) {
        console.warn(`[copilot/tool-runtime] gap report for NCP no-response failed (non-fatal): ${e.message}`);
      }
      // 0.39.257 — marked as a failure, with guardian's own reason (ask.js says which gate it stopped at) and
      // the jobId (its reply may still come), so runToolLoop ends the run as a failure instead of returning this
      // text as the answer, and the caller can watch for the late reply.
      const why = (result && result.error) || 'no response';
      return {
        text: (result && result.text) || `[NCP dispatch failed — ${why}${gapUuid ? ` — gap ${gapUuid}` : ''}]`,
        toolCalls: null,
        gapUuid,
        failed: !(result && result.text), error: why, jobId: jobId || null,
      };
    }

    // Strip the tool call out of the visible text if a call was made — the
    // JSON is machine-facing, not something the loop should echo back as if it
    // were a real answer once a real tool call is going to run. Enforcement of
    // opts.toolScope lives in runToolLoop's allowedTools (lib/agent-tools/
    // index.js); the known list here only decides what COUNTS as a call.
    const found = _findToolCalls(result.text, scoped.map(t => t.function.name));
    return { text: found.calls.length ? found.text : result.text, toolCalls: found.calls.length ? found.calls : null };
  };
}

/**
 * runViaAgent(agent, dispatchToAgent, userPrompt, opts) — the NCP-agent
 * equivalent of run() below. "Co-pilot is the hat, the agents are who wear
 * them" — whichever agent is dispatched to gets the SAME tool loop, same
 * system prompt discipline (tool-guide, memory, live stream), as ollama.
 */
async function runViaAgent(agent, dispatchToAgent, userPrompt, opts = {}) {
  // §FIXED 2026-09-13 — provider was never actually threaded into
  // makeNcpCallModel's opts (only modelOpts/toolScope were), so the
  // real, resolved agent this call is going to was invisible inside
  // callModel() — the "skip resending full context to an already-primed
  // tab" check above could never fire, since opts.provider was always
  // undefined regardless of which real agent this dispatch targets.
  const callModel = makeNcpCallModel(dispatchToAgent, { ...(opts.modelOpts || {}), toolScope: opts.toolScope, provider: agent,
    composed: !!opts.composed, resultTemplate: opts.resultTemplate || null });
  if (opts.composed) {
    // 0.39.258 — the caller's prompt is the whole prompt; nothing of copilot's own is added.
    return agentTools.runToolLoop(callModel, '', fillToolPlaceholders(userPrompt, opts.toolScope), {
      maxIterations: opts.maxIterations || 6, allowedTools: opts.toolScope || undefined, context: opts.context || null,
    });
  }
  // 0.39.257 — opts.identity: who this run is (a repo's project agent says so, instead of "the NEXUS co-pilot");
  // opts.context: what its tools work in (context.repoDir → file tools default to that repo, lib/agent-tools/tool-root.js).
  const systemPrompt = [
    opts.identity ? `${opts.identity}\nYou are running as ${agent}. You have tools; use them to read files, run diagnostics, query memory, and act on the system.`
      : `You are the NEXUS co-pilot, currently running as ${agent}. You have tools; use them to read files, run diagnostics, query memory, and act on the system.`,
    'ALWAYS look for a tool that can fulfill the request before answering from memory or escalating. Prefer a tool over a guess.',
    (() => { try { return 'YOUR TOOLS (how and when to use them):\n' + require('../lib/agent-tools/tool-guide').toolGuide(); } catch { return ''; } })(),
    opts.personaPrompt ? `\nYOUR CURRENT PERSONA (this hat):\n${opts.personaPrompt}` : '',
    opts.memory ? `\nWHAT YOU REMEMBER ABOUT THIS USER AND SYSTEM:\n${opts.memory}` : '',
    opts.streamDigest ? `\nLIVE SYSTEM STREAM (most recent events):\n${opts.streamDigest}` : '',
  ].filter(Boolean).join('\n');

  return agentTools.runToolLoop(callModel, systemPrompt, userPrompt, {
    maxIterations: opts.maxIterations || 6,
    allowedTools: opts.toolScope || undefined,
    context: opts.context || null,
  });
}

/**
 * run(opts) — the P1 entry point copilot/server.js calls.
 *
 * @param {object} o
 *   o.userPrompt   — the user's request
 *   o.dispatch     — copilot's _dispatchToOllama
 *   o.pollJob      — copilot's job-poll resolver
 *   o.memory       — persistent user-model context string (P2), optional
 *   o.streamDigest — live normalized event stream string (P3), optional
 *   o.maxIterations
 * @returns {Promise<{text, iterations, toolCallLog}>}
 */
async function run(o = {}) {
  if (!o.dispatch || !o.pollJob) throw new Error('[tool-runtime] dispatch and pollJob are required');
  const callModel = makeOllamaCallModel(o.dispatch, o.pollJob, { ...(o.modelOpts || {}), toolScope: o.toolScope || undefined,
    composed: !!o.composed, resultTemplate: o.resultTemplate || null });
  if (o.composed) {
    // 0.39.258 — as runViaAgent: the caller's prompt is the whole prompt.
    return agentTools.runToolLoop(callModel, '', fillToolPlaceholders(o.userPrompt, o.toolScope), {
      maxIterations: o.maxIterations || 6, allowedTools: o.toolScope || undefined, context: o.context || null,
    });
  }

  // The system prompt carries co-pilot's identity + persistent memory (P2) +
  // the live continuous stream (P3). Both are optional and injected, so P1
  // works alone and P2/P3 enrich it without changing this contract.
  const systemPrompt = [
    o.identity ? `${o.identity}\nYou have tools; use them to read files, run diagnostics, query memory, and act on the system.`   // 0.39.257
      : 'You are the NEXUS co-pilot. You have tools; use them to read files, run diagnostics, query memory, and act on the system.',
    'ALWAYS look for a tool that can fulfill the request before answering from memory or escalating. Prefer a tool over a guess.',
    (() => { try { return 'YOUR TOOLS (how and when to use them):\n' + require('../lib/agent-tools/tool-guide').toolGuide(); } catch { return ''; } })(),
    o.memory ? `\nWHAT YOU REMEMBER ABOUT THIS USER AND SYSTEM:\n${o.memory}` : '',
    o.streamDigest ? `\nLIVE SYSTEM STREAM (most recent events):\n${o.streamDigest}` : '',
  ].filter(Boolean).join('\n');

  return agentTools.runToolLoop(callModel, systemPrompt, o.userPrompt, {
    maxIterations: o.maxIterations || 6,
    allowedTools: o.toolScope || undefined,   // 0.39.257 — enforced, as runViaAgent already was
    context: o.context || null,
  });
}

module.exports = { run, runViaAgent, makeOllamaCallModel, makeNcpCallModel, fillToolPlaceholders, formatToolResult, _extractToolCalls, _parseToolBlocks, _findToolCalls, toolCount: () => agentTools.TOOLS.size };
