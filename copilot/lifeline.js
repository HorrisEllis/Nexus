'use strict';
/**
 * copilot/lifeline.js
 * comp_id: nexus.copilot.lifeline
 * uuid: nexus-copilot-lifeline-v1-0000-2026-0627-jamesbrooks-001
 * spec: docs/copilot-expansion.spec
 *
 * Model router — Ollama primary, Guardian NCP fallback.
 *
 * Priority:
 *   1. Ollama Bridge :3749  — local, zero cost, sovereign
 *   2. Guardian NCP :7820   — claude/chatgpt/mistral/gemini via browser tab
 *   3. Error with context   — never silent (§1.2)
 *
 * When Ollama's confidence is below CONFIDENCE_THRESHOLD (0.75),
 * the lifeline escalates to Guardian. Ollama "asks for help" rather
 * than returning a low-quality answer silently.
 *
 * All results tagged: { provider_used, confidence, escalated, requestId }
 * All results written to Cortex chat_log via cortex-write.
 */
'use strict';

const http   = require('http');
const crypto = require('crypto');

const OL_URL  = process.env.OLLAMA_URL    || 'http://127.0.0.1:3749';
const GD_URL  = process.env.GUARDIAN_URL  || 'http://127.0.0.1:7820';
const CX_URL  = process.env.CORTEX_URL    || 'http://127.0.0.1:3748';

const CONFIDENCE_THRESHOLD = parseFloat(process.env.LIFELINE_CONF || '0.75');
const OLLAMA_POLL_MAX      = 35;    // seconds to poll for Ollama result
const GUARDIAN_TIMEOUT_MS  = 45000;

const MODULE_ID = 'copilot/lifeline';
const VERSION   = '1.0.0';

let _cortexWrite = null;
function _getCW(systemId = 'copilot') {
  if (!_cortexWrite) {
    try { _cortexWrite = require('../lib/cortex-write')(systemId); } catch(_) {}
  }
  return _cortexWrite;
}

// ── Simple HTTP helpers ───────────────────────────────────────────────────────
async function _post(url, body, timeoutMs = 10000) {
  return new Promise((res, rej) => {
    const b   = JSON.stringify(body);
    const u   = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
      timeout: timeoutMs,
    }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(_) { res({ ok: false, raw: d }); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    req.write(b); req.end();
  });
}

async function _get(url, timeoutMs = 5000) {
  return new Promise(res => {
    http.get(url, { timeout: timeoutMs }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(_) { res(null); } });
    }).on('error', () => res(null)).on('timeout', () => res(null));
  });
}

// ── Estimate confidence from Ollama response ──────────────────────────────────
// A simple heuristic — real confidence would come from Ollama logprobs
// but those aren't always available. We use response characteristics.
//
// §FIXED 2026-07-10 — "confidence metrics are fucked, keeps using lifeline for
// everything." Root cause: base was 0.6 against a 0.75 escalation threshold, so
// a NORMAL answer (0.6 + 0.1 for length = 0.70) never cleared the bar and
// escalated to Guardian every time. The heuristic was structurally biased below
// its own threshold — lifeline fired on 100% of prompts by construction, not by
// genuine uncertainty. Base is now 0.72 so a substantive answer clears 0.75,
// and only thin/hedged/error responses fall through to escalation. The penalties
// still do real work; they just start from a centre that isn't pre-failed.
function _estimateConfidence(text = '', prompt = '') {
  // §FIXED 2026-08-13 — found live: "hello" -> a short, correct ollama reply
  // -> scored 10% confidence -> auto-escalated to Guardian, every time. The
  // old check (`text.length < 10 -> 0.1`) conflated "short reply" with
  // "uncertain reply" — but a brief, complete answer to a trivial prompt
  // (a greeting, a yes/no, a one-word fact) is not evidence of low
  // confidence, it's evidence the question was simple. Only a genuinely
  // EMPTY response (ollama returned nothing at all) is real evidence of
  // failure; that alone floors to low confidence. A short but real answer
  // now gets the normal scoring path instead of an automatic floor —
  // §user_wellbeing/§1.1 concern either way was never "make ollama look
  // falsely confident," it's "don't manufacture false uncertainty and
  // burn an escalation on every trivial exchange."
  if (!text || text.trim().length === 0) return 0.1;

  // §FIXED 2026-08-13 — found alongside the length-floor fix above: 0.72
  // was BELOW CONFIDENCE_THRESHOLD (0.75), directly contradicting this
  // comment's own stated intent. A plain reply with no hedging, no error
  // language, and no length bonus (most short, correct replies) would
  // still fall 0.03 short and escalate anyway — the same wasted-escalation
  // problem the length-floor fix targeted, just smaller. Bumped to clear
  // the real threshold, not just read as if it did.
  let score = 0.76; // base — a plain answer should NOT auto-escalate

  // Longer, more detailed responses tend to be more confident
  if (text.length > 120) score += 0.06;
  if (text.length > 300) score += 0.06;
  if (text.length > 600) score += 0.04;

  // Hedging language = lower confidence
  const hedges = ['i think', 'i believe', 'might be', 'not sure', 'unclear', "i don't know", 'uncertain', 'i am not able', "i can't", 'as an ai'];
  // §0.39.282 — an answer that says it failed ("I could not determine the answer") scored 0.76 and was never escalated
  // (copilot-confidence T-004). A self-reported failure is real uncertainty: it floors low, like an empty reply.
  const failed = ['could not determine', "couldn't determine", 'could not find', "couldn't find", 'unable to determine', 'unable to find', 'i was unable', 'no way to know', 'not enough information'];
  if (failed.some(f => text.toLowerCase().includes(f))) return 0.3;
  const hedgeCount = hedges.filter(h => text.toLowerCase().includes(h)).length;
  score -= hedgeCount * 0.1;

  // Direct statements = higher confidence
  const direct = ['the answer is', 'this is', 'specifically', 'in summary', 'the key point', 'here is', "here's"];
  const directCount = direct.filter(d => text.toLowerCase().includes(d)).length;
  score += directCount * 0.04;

  // Error/failure language = low confidence
  if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) score -= 0.25;

  return Math.max(0.1, Math.min(0.99, score));
}

// ── Route to Ollama ───────────────────────────────────────────────────────────
async function _tryOllama(prompt, opts = {}) {
  try {
    // §0.39.269 — memory: an uncomposed prompt (copilot's own chat, via route()) is given what this agent has done
    // before, from the download manager. A composed prompt (idearium's repo agent) carries its own memory block.
    if (opts.memory === true) {
      try {
        const mem = await require('../lib/agent-memory.js').recall({ agentId: opts.memoryAgent || opts.agentId || 'copilot', query: prompt });
        if (mem.text) prompt = `${mem.text}\n\n${prompt}`;
      } catch (_) { /* memory is context, never a reason not to answer */ }
    }
    // Submit job
    const job = await _post(`${OL_URL}/api/jobs`, {
      prompt,
      // §0.39.269 — the bridge records the finished exchange to the download manager under this agent.
      agentId:       opts.memoryAgent || opts.agentId || 'copilot',
      compartmentId: opts.compartmentId || undefined,
      repoUuid:      opts.repoUuid || undefined,
      // §BUGFIX 2026-07-04: was hardcoded to 'mistral:7b' — ollama-bridge's
      // own FALLBACK_MODEL, not its DEFAULT_MODEL (qwen2.5-coder:7b, the
      // one the CLI's own onboarding tells users to `ollama pull`). If a
      // user only pulled the documented default, every co-pilot job ever
      // submitted requested a model that was never installed and failed
      // silently — _tryOllama() catches everything and returns null, so
      // this always looked like "falling through to Guardian," never like
      // an error. Omitting model here lets ollama-bridge apply its own
      // real default/fallback chain instead of a copy of one string here
      // permanently frozen out of sync with the other.
      ...(opts.model ? { model: opts.model } : {}),
      intent:      opts.intent || 'ask',
      componentId: 'copilot.lifeline',
      hookId:      'copilot.lifeline.ollama',
      requestId:   opts.requestId,
      sessionId:   opts.sessionId,
      maxTokens:   opts.maxTokens || 1024,
      timeoutMs:   opts.timeoutMs || 30000,
    });

    if (!job?.jobId) return null;

    // Poll for result
    for (let i = 0; i < OLLAMA_POLL_MAX; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await _get(`${OL_URL}/api/jobs/${job.jobId}`);
      if (status?.job?.status === 'complete') {
        const text       = status.job.result || '';
        const confidence = _estimateConfidence(text, prompt);
        return { ok: true, text, confidence, jobId: job.jobId, provider: 'ollama' };
      }
      if (status?.job?.status === 'failed') {
        // §2026-08-12 — was a silent `return null`, indistinguishable from
        // "ollama just isn't confident," and route() falls through to
        // Guardian either way — so a REAL provider failure never produced
        // any record at all. James: "make sure each failure mode is logged
        // to cortex." Now it is.
        try {
          const gapField = require('../lib/gap-field');
          gapField.report({ type: 'lifeline.provider-failure', body: `ollama job ${job.jobId} failed`, source: 'ollama', domain: 'system', severity: 'medium', meta: { requestId: opts.requestId, jobStatus: status?.job } });
        } catch (_) {}
        return null;
      }
    }
    // §2026-08-12 — a timeout is also a real failure, was also silent.
    try {
      const gapField = require('../lib/gap-field');
      gapField.report({ type: 'lifeline.provider-timeout', body: `ollama job ${job.jobId} timed out after ${OLLAMA_POLL_MAX}s`, source: 'ollama', domain: 'system', severity: 'medium', meta: { requestId: opts.requestId } });
    } catch (_) {}
    return null; // timeout
  } catch(e) {
    try {
      const gapField = require('../lib/gap-field');
      gapField.report({ type: 'lifeline.provider-error', body: `ollama call threw: ${e.message}`, source: 'ollama', domain: 'system', severity: 'medium', meta: { requestId: opts.requestId, error: e.message } });
    } catch (_) {}
    return null;
  }
}

// ── Route to Guardian NCP ─────────────────────────────────────────────────────
async function _tryGuardian(prompt, opts = {}) {
  try {
    // §GAP CLOSED 2026-08-29 — this comment used to say "the endpoint it's
    // handed to (/api/copilot/prompt) still doesn't exist on Guardian's
    // side" — checked directly, that's now stale: guardian/server.js's
    // real /api/copilot/prompt route (using ./ask.js's real askSync, with
    // real createJob/dispatchJob/isProviderConnected/resolveProvider
    // dependencies genuinely wired, not stubbed) exists and is real. This
    // dispatch path was correct and ready even while stale; it's now also
    // confirmed reachable.
    let ragProvider = opts.provider;
    if (!ragProvider) {
      // §SOVEREIGNTY 2026-07-09 — was require('../cortex/core/raid/routing-ir.js'),
      // a hardwire across a system boundary that I introduced. Cortex exposes
      // POST /api/raid/decide; copilot asks for it now. Unreachable cortex
      // falls back to 'auto', which guardian resolves on its own side —
      // degraded, never crashed.
      try {
        const nx = require('../lib/nexus-client');
        const d = await nx.post('cortex', '/api/raid/decide', { prompt }, { timeout: 3000 });
        ragProvider = d?.agent || 'auto';
      } catch (_) { ragProvider = 'auto'; }
    }

    // §MERGED 2026-07-09 — client-side early-out from the 07-07 branch.
    // guardian/ask.js already fail-fasts authoritatively, so this is an
    // optimization, not a second source of truth. Two conditions that look
    // similar but are not, and were conflated in my first version:
    //   - /providers answered, and the provider is not positively connected
    //     -> FAIL CLOSED. We have real evidence; don't dispatch on a hope.
    //     (An unlisted provider is not connected, not "unknown".)
    //   - /providers itself is unreachable -> FAIL OPEN. We have no
    //     evidence at all; proceed and let the server decide, rather than
    //     blocking on a check that may itself be the broken thing.
    // §AGENT-TAB 0.39.244 — James: a repo agent's "hello" failed instantly with "guardian
    // unavailable or returned no real response". A job carrying agentId goes to that repo's
    // OWN tab, which guardian's dispatcher opens itself (lib/dispatcher.js _awaitAgentTab,
    // waits up to 60s, then falls back to the shared tab). Checking whether the SHARED
    // provider tab is connected refused the job before guardian could open the one it
    // needed. Skipped for an agentId job; guardian decides with real evidence.
    if (opts.agentId) { /* guardian opens the repo's own tab — no shared-tab pre-check */ }
    else if (ragProvider && ragProvider !== 'auto') {
      const provCheck = await _get(`${GD_URL}/providers`, 3000).catch(() => null);
      // §BUGFIX 2026-08-28, RE-APPLIED — this exact fix (originally
      // commit e2f68f6) was silently lost when a parallel session's own
      // branch, diverged from before this fix landed, overtook this
      // branch via a later fast-forward merge. Confirmed by grep: this
      // was the real, broken original code. Guardian's real GET
      // /providers response is a flat map of provider name -> STRING
      // status ('connected'|'null'), not {name:{connected:bool}}
      // objects. provCheck.providers[ragProvider] is a STRING, so
      // `.connected` on it is always undefined, and `undefined !== true`
      // is always true — this branch ALWAYS concluded "not connected"
      // and returned null before ever attempting a real dispatch,
      // regardless of actual connection state.
      if (provCheck?.providers && provCheck.providers[ragProvider] !== 'connected') {
        // real evidence of not-connected — fall through to the cascade, SAYING why (0.39.244: was a bare null,
        // which surfaced as "guardian unavailable or returned no real response" with no reason)
        return { ok: false, text: null, provider: ragProvider, error: `guardian reports no ${ragProvider} tab connected (GET /providers: ${provCheck.providers[ragProvider] || 'absent'})` };
      }
    } else if (ragProvider === 'auto') {
      // §REGRESSION FIXED 2026-07-09 — introduced by the sovereignty refactor
      // in this same pass. When cortex's /api/raid/decide is unreachable we
      // fall back to 'auto', and the branch above skipped the connectivity
      // check entirely, dispatching blindly to a guardian that has nobody to
      // ask. Unresolved does not mean unchecked: if /providers answers and
      // NOT ONE provider is connected, nothing can possibly answer — return
      // null and let the cascade handle it. Same fail-closed-on-evidence,
      // fail-open-on-no-evidence rule as above.
      const provCheck = await _get(`${GD_URL}/providers`, 3000).catch(() => null);
      // §BUGFIX 2026-08-28, RE-APPLIED — same shape mismatch as above: p
      // is a STRING ('connected'|'null'), p?.connected is always
      // undefined, so .some() always returned false and this branch
      // always concluded "nothing is connected" regardless of real state.
      if (provCheck?.providers && !Object.values(provCheck.providers).some(p => p === 'connected')) {
        return { ok: false, text: null, provider: 'auto', error: 'guardian reports no provider tab connected at all (GET /providers)' };
      }
    }

    // §BUILT 2026-08-18 — James: "have the same access to nexus, within
    // reason." A real, conservative starter set, not all 63 -- mostly
    // read/diagnostic tools, nothing destructive. Confirmed real names
    // against lib/agent-tools/index.js's own TOOLS map before using them
    // here, not assumed.
    const ESCALATION_TOOLS = ['read_file', 'diagnose', 'system_priority', 'intent_hat'];

    // Use the NEXUS co-pilot proxy on Guardian
    // §FIX 2026-09-23 — James, live: a repo-agent's dispatch still showed
    // nothing after a real, watched wait. Traced: lib/repo-agent.js's
    // dispatch() deliberately bumps ITS OWN timeout to 300000ms for a
    // guardian backend — its own comment already says why ("a browser
    // provider answers through a real tab... 90s is too short for a long
    // answer"), and that reasoning is even stronger for a tab that just
    // cold-spawned and has to load+authenticate first (the exact case in
    // the boot log this was traced against — chatgpt.com had JUST been
    // injected when this job was already in flight). But this call to
    // guardian used the hardcoded GUARDIAN_TIMEOUT_MS (45000) regardless
    // of what the caller was willing to wait — copilot silently cut the
    // hop short at 45s no matter how patient the caller upstream was,
    // defeating repo-agent's own 300000ms allowance entirely without
    // either side ever knowing. opts.timeoutMs is now honoured when a
    // caller sends one (idearium's own dispatch() now does, see that
    // file's own note); GUARDIAN_TIMEOUT_MS stays the real default for
    // every other existing caller that doesn't set it.
    const result = await _post(`${GD_URL}/api/copilot/prompt`, {
      prompt,
      provider:   ragProvider,
      // §TR1 2026-09-22 — forward a caller-supplied agentId through to
      // guardian's own /api/copilot/prompt, which (via ask.js's
      // createJob) already has a real agentId field, just never fed —
      // confirmed by direct trace, not assumed. Only meaningful for a
      // guardian-routed (browser-tab) dispatch.
      agentId:    opts.agentId || undefined,
      canonical:  typeof opts.canonical === 'string' ? opts.canonical : undefined,   // 0.39.265 — the meaning, when prompt is a reworded variant
      requestId:  opts.requestId,
      sessionId:  opts.sessionId,
      channel:    'lifeline',
      channelName: 'Lifeline',
      tools:      opts.tools || ESCALATION_TOOLS,
      // §HP7 0.55.0 — James's log: "claude failed — timed out after 90000ms — waiting at gate 7/8 \"reply appears\"
      // … 114 mutations". The caller's wait was used for this HTTP call only; guardian's askSync never saw it and fell to
      // its own 90 s default, so a browser agent was cut off mid-reply whatever the caller allowed. Sent on now, a few
      // seconds under ours, so guardian answers with its gate sentence before we stop listening.
      timeoutMs:  opts.timeoutMs ? (opts.timeoutMs > 10000 ? opts.timeoutMs - 5000 : opts.timeoutMs) : undefined,
    }, opts.timeoutMs || GUARDIAN_TIMEOUT_MS);

    if (!result?.text) {
      try {
        const gapField = require('../lib/gap-field');
        gapField.report({ type: 'lifeline.provider-empty-response', body: `guardian/${ragProvider} returned no text`, source: ragProvider || 'guardian', domain: 'system', severity: 'medium', meta: { requestId: opts.requestId } });
      } catch (_) {}
      // §FIXED 2026-09-11 — this used to `return null`, discarding
      // result.jobId even though guardian/ask.js's askSync already
      // returns a real jobId on every branch, including this exact
      // failure case (checked directly: askSync's empty-response and
      // timeout returns both carry `jobId: job.id`). That jobId is the
      // one thing that makes GET /response/:jobId's real, already-built
      // multi-layer fallback (in-memory job -> persisted JAA jobs table
      // -> matching artifact) reachable at all. Returning null threw
      // away the key to a real, working recovery path tool-runtime.js
      // had no way to use.
      // 0.39.244 — guardian's own reason travels up (it was dropped, leaving only copilot's generic text).
      return { ok: false, text: null, jobId: result?.jobId || null, provider: ragProvider, error: result?.error || (result ? `guardian job ${result.jobId || '?'} ended with no reply text` : 'guardian did not answer /api/copilot/prompt') };
    }
    const confidence = _estimateConfidence(result.text, prompt);
    // §BUG FIXED 2026-07-09 — this fell back to the literal string
    // 'guardian' when the response didn't name a model, which HIDES which
    // agent actually answered (guardian is the router, never the answerer).
    // The 07-07 branch reported the dispatched agent and was right to.
    // ragProvider is always known here, so there is never a reason to
    // report a placeholder.
    // §AGENT-MESH-ARTIFACTS 2026-09-02 — James: "hook it into agent mesh...
    // like idearium works end to end." Checked directly: guardian/ask.js's
    // askSync ALREADY returns a real jobId on every branch (its own JSDoc
    // says so: "@returns {Promise<{ok, text?, jobId, provider, error?}>}"),
    // but this function discarded it — the one real thing missing for a
    // download-captured artifact to ever be traced back to the RAID
    // contract/job that produced it. Carried through below.
    return { ok: true, text: result.text, confidence, provider: result.modelUsed || result.provider || ragProvider, fromGuardian: true, jobId: result.jobId || null };
  } catch(e) {
    try {
      const gapField = require('../lib/gap-field');
      gapField.report({ type: 'lifeline.provider-error', body: `guardian call threw: ${e.message}`, source: 'guardian', domain: 'system', severity: 'medium', meta: { requestId: opts.requestId, error: e.message } });
    } catch (_) {}
    return { ok: false, text: null, error: `guardian call failed: ${e.message}` };
  }
}

// ── Persist result to Cortex ──────────────────────────────────────────────────
function _persist(opts, result) {
  // §2026-08-12 — the contract check. Mutates `result` in place (every call
  // site calls _persist() immediately before its own `return result`, so
  // this is visible to the caller without touching 6 separate return
  // points). Doesn't change what's returned or block on a bad answer —
  // §0.4 the user/caller still gets what the provider said — but now the
  // caller can SEE whether it matched what was actually asked for, and a
  // mismatch is a real, findable gap, not silent.
  try {
    const lc = require('./lib/lifeline-contracts');
    const check = lc.validateResponse(opts.intent || 'ask', result.text, { provider: result.provider, requestId: opts.requestId });
    result.contract_valid = check.valid;
    if (!check.valid) result.contract_violation_reason = check.reason;
  } catch (_) { /* contract check is enrichment, never blocks a real answer */ }

  const cw = _getCW();
  if (!cw) return;
  cw.insert('chat_log', {
    uuid:         crypto.randomUUID(),
    requestId:    opts.requestId,
    sessionId:    opts.sessionId,
    prompt:       (opts.prompt || '').slice(0, 500),
    response:     (result.text || '').slice(0, 2000),
    modelUsed:    result.provider || 'unknown',
    confidence:   result.confidence,
    escalated:    result.escalated || false,
    channel:      opts.channel || 'lifeline',
    componentId:  'copilot.lifeline',
    hookId:       'copilot.lifeline.complete',
    intent:       opts.intent || 'ask',
    contractValid: result.contract_valid,
    ts:           Date.now(),
    source:       'lifeline',
  });
}

/**
 * Main entry point — route prompt through priority chain.
 *
 * @param {string} prompt
 * @param {object} opts — { requestId, sessionId, intent, model, maxTokens, channel }
 * @returns {object} { ok, text, confidence, provider_used, escalated, requestId }
 */
// §MERGED 2026-07-09 from the parallel 07-07 branch (nexus-wired-v6).
// Fluid routing: when a person names an agent ("talk to chatgpt", "use
// claude"), skip the Ollama-first cascade and dispatch straight to them.
// If that explicit dispatch fails (agent not connected), fall through to
// the normal cascade rather than dead-ending — they asked for a specific
// agent, but they should still get an answer.
// §0.59.1 — James: "deepseek is absent." Was hard-coded without deepseek or perplexity; the browser agents now come from
// lib/agent-providers.js (the guardian userscripts — one source), then the local ones
const KNOWN_AGENTS = [...(() => { try { return require('../lib/agent-providers.js').guardianProviders(); } catch (_) { return ['chatgpt', 'claude', 'deepseek', 'gemini', 'perplexity']; } })(), 'mistral', 'ollama'];
const EXPLICIT_AGENT_RE = new RegExp(
  `\\b(?:talk to|use|switch to|route (?:this|it)? ?to|ask)\\s+(${KNOWN_AGENTS.join('|')})\\b`, 'i'
);

function extractExplicitAgent(prompt) {
  const m = EXPLICIT_AGENT_RE.exec(String(prompt || ''));
  return m ? m[1].toLowerCase() : null;
}

async function _routeInner(prompt, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();

  // §WIRED 2026-08-13 — "co-pilot should be like a hat, not a static
  // identity." A per-call opts.provider already short-circuits the cascade
  // below; this is what was missing — a PERSISTENT hat, checked here so
  // every message honors it without the caller re-specifying an override
  // each time. 'auto' (never worn, or explicitly taken off) falls through
  // to the unchanged ollama-first cascade — zero behavior change for
  // anyone who never touches this.
  if (!opts.provider) {
    try {
      const { getCurrentAgent } = require('./lib/self-model');
      const hat = getCurrentAgent();
      if (hat.agent && hat.agent !== 'auto') {
        // §EXTENDED 2026-08-13 (P8) — a named forged hat carries more than
        // just which base agent: its toolScope/personaPrompt travel with
        // it now, so wearing "the_debugger" hat actually narrows the tool
        // set and adjusts persona, not just which model answers.
        opts = { ...opts, provider: hat.agent, hatName: hat.hatName, toolScope: hat.toolScope, personaPrompt: hat.personaPrompt };
      }
    } catch (_) { /* self-model unavailable — fall through to normal cascade, never block on this */ }
  }

  // Explicit agent request short-circuits the cascade. Note this composes
  // with my RAID wiring rather than bypassing it: _tryGuardian only asks
  // RoutingIR to pick a provider when none was supplied, so an explicit
  // agent is honored exactly as named.
  const explicitAgent = (opts.provider && opts.provider !== 'auto') ? opts.provider : extractExplicitAgent(prompt);
  if (explicitAgent && explicitAgent !== 'ollama') {
    // §WIRED 2026-08-13 — "co-pilot is the hat, the agents are who wear
    // them." Was a single raw _tryGuardian call — plain conversation, zero
    // tool access, confirmed and explained directly before building this.
    // Now runs through the SAME tool loop ollama gets (copilot/tool-runtime
    // .js's runViaAgent + makeNcpCallModel), via prompt-engineered ```tool
    // fenced blocks since NCP has no native function-calling. Whichever
    // agent is dispatched to now genuinely wears copilot's full capability
    // set — schedule_task, run_chain, agent_chat_search, all 36 tools —
    // not just that model's raw conversational ability.
    try {
      const { runViaAgent } = require('./tool-runtime');
      const dispatchToAgent = (fullPrompt, dispatchOpts) => _tryGuardian(fullPrompt, { ...opts, ...dispatchOpts, provider: explicitAgent, requestId });
      const loopResult = await runViaAgent(explicitAgent, dispatchToAgent, prompt, opts);
      // 0.39.257 — a round that failed (its job stopped at a gate) is a failure with guardian's reason and the
      // jobId, not an answer. Not re-sent below: the job exists and may still complete.
      if (loopResult && loopResult.failed) {
        return { ok: false, error: loopResult.error, jobId: loopResult.jobId || null, provider_used: explicitAgent, toolCallLog: loopResult.toolCallLog, requestId };
      }
      const result = {
        ok: true, text: loopResult.text, confidence: 1,
        provider_used: explicitAgent, escalated: true,
        explicit_agent_request: true, toolCallLog: loopResult.toolCallLog, requestId,
      };
      _persist({ ...opts, prompt, requestId }, result, 'explicit_agent_request');
      return result;
    } catch (e) {
      // §1.2 — the tool loop failing is not silent; falls through to the
      // plain single-call path below so a broken loop doesn't mean a
      // broken agent, then to the normal cascade if that also fails.
      console.warn(`[lifeline] tool loop via ${explicitAgent} failed, falling back to plain dispatch: ${e.message}`);
    }
    const guardianResult = await _tryGuardian(prompt, { ...opts, provider: explicitAgent, requestId });
    if (guardianResult?.ok) {
      const result = {
        ok: true, text: guardianResult.text, confidence: guardianResult.confidence,
        provider_used: guardianResult.provider, escalated: true,
        explicit_agent_request: true, requestId,
      };
      _persist({ ...opts, prompt, requestId }, result, 'explicit_agent_request');
      return result;
    }
    // Explicit request failed — fall through to the normal cascade.
  }

  // §FIX 2026-09-07 (merge) — James's real toggle UI (ui/tv-shell's
  // #cp-toggle-ollama / #cp-toggle-guardian) is a genuine, deliberate
  // binary choice between two backends — not a hint the normal auto-
  // cascade can still override. Two real, symmetric gaps found and
  // closed together:
  //
  // (a) provider:'guardian' — this UI's own dropdown never actually
  // sends this literal value (it sends a specific agent name instead,
  // already handled correctly by the explicit-agent short-circuit
  // above), but it's a real, valid value other real callers (API
  // consumers, CLI, tests) can send meaning "let guardian's own
  // connected agents compete, don't touch ollama at all" — kept
  // separate from 'auto' (which still means "let the normal cascade
  // decide, ollama-first") on purpose.
  //
  // (b) provider:'ollama' — this UI's own dropdown DOES send this
  // literal value when the toggle is on the ollama side. Checked the
  // cascade below directly: selecting it did NOT actually guarantee
  // staying on ollama — explicitAgent's own check deliberately excludes
  // 'ollama' from the explicit short-circuit (ollama has its own real
  // path via _tryOllama below), so it fell through to the SAME cascade
  // as no-preference-given — including auto-escalating to Guardian on
  // low confidence, silently overriding the user's own explicit choice
  // to stay on ollama. That's the same class of bug as the guardian
  // side already fixed: a real, deliberate selection with no real
  // effect on actual behavior.
  if (opts.provider === 'guardian') {
    console.log('[lifeline] explicit provider:guardian — skipping Ollama entirely');
    const guardianResult = await _tryGuardian(prompt, { ...opts, provider: 'auto', requestId });
    if (guardianResult?.ok) {
      const result = {
        ok: true, text: guardianResult.text,
        confidence: guardianResult.confidence,
        provider_used: guardianResult.provider,
        escalated: false, requestId,
      };
      _persist({ ...opts, prompt, requestId }, result, 'explicit_guardian_request');
      return result;
    }
    // Explicit guardian request failed — honest failure, not a silent
    // fall-through to ollama (which would recreate the exact bug this
    // fix closes: the UI would show "guardian" while ollama quietly
    // answered instead).
    const result = {
      ok: false, text: null, confidence: 0,
      provider_used: null, escalated: false,
      error: guardianResult?.error || 'no guardian agent available or connected',
      requestId,
    };
    _persist({ ...opts, prompt, requestId }, result, 'explicit_guardian_request_failed');
    return result;
  }

  if (opts.provider === 'ollama') {
    console.log('[lifeline] explicit provider:ollama — no auto-escalation to Guardian');
    const ollamaOnlyResult = await _tryOllama(prompt, { ...opts, requestId });
    const result = ollamaOnlyResult?.ok
      ? {
          ok: true, text: ollamaOnlyResult.text,
          confidence: ollamaOnlyResult.confidence,
          provider_used: 'ollama', escalated: false, requestId,
        }
      : {
          ok: false, text: null, confidence: 0,
          provider_used: null, escalated: false,
          error: ollamaOnlyResult?.error || 'ollama unavailable',
          requestId,
        };
    _persist({ ...opts, prompt, requestId }, result, ollamaOnlyResult?.ok ? 'explicit_ollama_request' : 'explicit_ollama_request_failed');
    return result;
  }

  // ── 1. Try Ollama ──────────────────────────────────────────────────────────
  const ollamaResult = await _tryOllama(prompt, { ...opts, requestId });

  if (ollamaResult?.ok) {
    if (ollamaResult.confidence >= CONFIDENCE_THRESHOLD) {
      // High confidence — return Ollama result
      const result = {
        ok: true, text: ollamaResult.text,
        confidence: ollamaResult.confidence,
        provider_used: 'ollama', escalated: false, requestId,
      };
      _persist({ ...opts, prompt, requestId }, result);
      return result;
    }

    // ── 2. Ollama confidence low ────────────────────────────────────────────
    // §FLUID 2026-07-30 (James: "have co-pilot ask me if I want to use lifeline").
    // When askBeforeEscalate is set, DON'T auto-escalate — return the low-confidence
    // answer plus an offer, and let the user decide (§0.4 the user stays in
    // control). The auto path below is unchanged when the flag isn't set, so
    // nothing that relied on auto-escalation breaks.
    if (opts.askBeforeEscalate) {
      const result = {
        ok: true, text: ollamaResult.text,
        confidence: ollamaResult.confidence,
        provider_used: 'ollama', escalated: false,
        offer_lifeline: true,                          // the UI/CLI shows the offer
        offer_reason: `Ollama confidence ${(ollamaResult.confidence * 100).toFixed(0)}% is below ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`,
        requestId,
      };
      _persist({ ...opts, prompt, requestId }, result, 'lifeline_offered');
      return result;
    }

    // ── 2b. auto-escalate to Guardian (lifeline) ────────────────────────────
    console.log(`[lifeline] Ollama confidence ${ollamaResult.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD} — escalating to Guardian`);

    const guardianResult = await _tryGuardian(prompt, { ...opts, requestId });

    if (guardianResult?.ok) {
      const result = {
        ok: true,
        text: guardianResult.text,
        confidence: guardianResult.confidence,
        provider_used: guardianResult.provider,
        escalated: true,
        ollama_confidence: ollamaResult.confidence,
        requestId,
      };
      _persist({ ...opts, prompt, requestId }, result);
      return result;
    }

    // Guardian failed — return Ollama's low-confidence result with warning
    const result = {
      ok: true,
      text: `[CONFIDENCE: ${Math.round(ollamaResult.confidence * 100)}%] ${ollamaResult.text}`,
      confidence: ollamaResult.confidence,
      provider_used: 'ollama',
      escalated: false,
      escalation_failed: true,
      requestId,
    };
    _persist({ ...opts, prompt, requestId }, result);
    return result;
  }

  // ── 3. Ollama unavailable — go straight to Guardian ────────────────────────
  console.log('[lifeline] Ollama unavailable — routing directly to Guardian');
  const guardianResult = await _tryGuardian(prompt, { ...opts, requestId });

  if (guardianResult?.ok) {
    const result = {
      ok: true, text: guardianResult.text,
      confidence: guardianResult.confidence,
      provider_used: guardianResult.provider,
      escalated: true, ollama_offline: true, requestId,
    };
    _persist({ ...opts, prompt, requestId }, result);
    return result;
  }

  // ── 4. Both unavailable ───────────────────────────────────────────────────
  return {
    ok: false,
    text: null,
    error: 'Both Ollama and Guardian are unavailable. Check system health.',
    provider_used: 'none',
    escalated: false,
    requestId,
  };
}

// §WIRED 2026-08-22 — James: "wire it all." Thin wrapper, not touching
// _routeInner's 4 real internal exit paths individually — emits
// lifeline_input/lifeline_output around whichever path actually runs.
async function route(prompt, opts = {}) {
  const requestId = opts.requestId || crypto.randomUUID();
  let et = null;
  try {
    et = require('../lib/event-types.js');
    require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
      type: et.INTENT.LIFELINE_INPUT, blockId: requestId,
      agent: opts.provider || null, intent: opts.intent || null, ts: Date.now(),
    });
  } catch (_) { /* event pipeline unreachable — the real route proceeds regardless, §1.2 non-blocking */ }

  // §0.39.269 — copilot's own conversation is one agent with one memory (lib/agent-memory.js, over the download
  // manager): recalled before Ollama answers (_tryOllama, memory:true) and recorded under 'copilot' afterwards.
  // Its own field, not agentId: an agentId makes _tryGuardian skip the "is that tab connected?" check (a repo-tab rule).
  const result = await _routeInner(prompt, { ...opts, requestId, memoryAgent: opts.memoryAgent || opts.agentId || 'copilot', memory: opts.memory !== false });

  try {
    if (et) {
      require('../cortex/memory/jaa-db.js').jaaDB.insert('event_log', {
        type: et.INTENT.LIFELINE_OUTPUT, blockId: requestId,
        agent: result?.provider_used || opts.provider || null,
        ok: !!result?.ok, escalated: !!result?.escalated, ts: Date.now(),
      });
    }
  } catch (_) { /* §1.2 — the real result is unaffected either way */ }

  return result;
}

/**
 * Quick health check — which providers are available?
 */
async function health() {
  const [ollamaH, guardianH] = await Promise.allSettled([
    _get(`${OL_URL}/health`),
    _get(`${GD_URL}/health`),
  ]);
  return {
    ollama:     { online: !!ollamaH.value?.ok, url: OL_URL },
    guardian:   { online: !!guardianH.value?.ok, url: GD_URL },
    threshold:  CONFIDENCE_THRESHOLD,
    priority:   ['ollama', 'guardian'],
    version:    VERSION,
  };
}

module.exports = { route, health, MODULE_ID, VERSION, CONFIDENCE_THRESHOLD, extractExplicitAgent, dispatchToNcpAgent: _tryGuardian, dispatchToOllama: _tryOllama, _estimateConfidence };   // §0.39.282 _estimateConfidence exported for its tests
