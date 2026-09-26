'use strict';
/**
 * lib/agent-chat.js — the backend half of "hey nexus" / agent-to-agent chat
 * comp_id: nexus.lib.agent-chat
 * UUID: nexus-lib-agent-chat-v1-0000-2026-0819-001
 * Version: 1.1.0
 *
 * §WHY THIS FILE (reconstructed 2026-08-19) — guardian/userscript-nexus-wake.js
 * and its test (tests/modules/test-nexus-wake.js, NW-002) both require this
 * module to exist and to agree with the browser matcher EXACTLY: same
 * WAKE_RE, same parseWake() semantics. Divergence here is the "works
 * sometimes" bug class NW-002's own comment warns about, so this is not a
 * reimplementation from a description — the regex and parseWake body are
 * copied verbatim from guardian/userscript-nexus-wake.js. If one changes,
 * change both, in the same commit.
 *
 * §v1.1.0 CORRECTED — v1.0.0's ask() reimplemented dispatch with a raw HTTP
 * call to guardian's /api/copilot/prompt. Checked, not assumed, this time:
 * that path already exists, three times over, in
 * lib/agent-tools/tools/coordination/{agent-council,roundtable,parallel-dispatch}.js
 * — all three resolve a hat to a baseAgent and call
 * copilot/lifeline.js's dispatchToNcpAgent(prompt, {provider,...}), which
 * itself already does the RAID routing, the /providers connectivity
 * check, and (§BUILT 2026-08-18) hands the dispatched agent real tool
 * access to nexus via guardian/ask.js's opts.tools round. Reimplementing
 * that here would be a second, divergent copy of dispatch logic that
 * already exists and is already used by three other tools. So ask() below
 * takes its dispatch function as a parameter (same DI pattern as
 * lib/seam/queue.js's QueueCompartment) — the REAL caller is
 * lib/agent-tools/tools/coordination/agent-chat.js, which supplies
 * copilot/tool-runtime.js's runViaAgent (the same full tool loop co-pilot
 * itself runs on, per that file's own comment: "whichever agent is
 * dispatched to gets the SAME tool loop... as ollama"). A bare HTTP
 * fallback stays here ONLY for callers with no lifeline available (tests,
 * or a future non-copilot caller) — never the default when a real
 * dispatch function is supplied.
 *
 * §THE SECOND JOB — "reads and addresses other agents with a hop cap."
 * Reading: guardian_chat_log is the real table for this (confirmed live in
 * lib/agent-tools/tools/query/agent-chat-search.js's own header) but has NO
 * current writer anywhere in the tree — readChat() below is the first one.
 * Addressing: a hop cap on top of whatever dispatch function is supplied,
 * so agent A asking agent B who asks agent C cannot loop back through A
 * indefinitely — and every exchange is written to guardian_chat_log so
 * readChat() (and the existing agent_chat_search tool) have something real
 * to read, regardless of which dispatch path answered.
 *
 * §NOT THIS FILE'S JOB — guardian's GET /api/tab/dom?provider=X (a live read
 * of what's currently on screen in a provider tab, as opposed to what NEXUS
 * has already logged) does not exist yet. readChat() below serves logged
 * history only and says so in its result rather than pretending live-DOM
 * coverage it doesn't have.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Same matcher as guardian/userscript-nexus-wake.js — one grammar, two
// runtimes. Keep byte-for-byte identical; NW-002 pins this.
const WAKE_RE = /^\s*(?:hey|hi|ok|okay)[,\s]+nexus[,:\s]+([\s\S]+)$/i;

function parseWake(text) {
  if (typeof text !== 'string' || !text.trim()) return { addressed: false, ask: null };
  const m = text.match(WAKE_RE);
  if (!m) return { addressed: false, ask: null };
  const ask = (m[1] || '').trim();
  if (!ask) return { addressed: false, ask: null, note: 'wake word with no request — ignored rather than sent as an empty prompt' };
  return { addressed: true, ask };
}

const MODULE_ID = 'agent-chat';
const VERSION   = '1.1.0';
const COMP_ID   = 'lib.agent-chat';
const HOOK_ID   = 'lib.agent-chat:v1:p0001';
const COPILOT   = process.env.COPILOT_URL || 'http://127.0.0.1:3750';

const GUARDIAN_URL = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
const KNOWN_PROVIDERS = ['chatgpt', 'claude', 'gemini', 'perplexity', 'ollama', 'mistral'];

// §HOP CAP — default matches the number of chat-capable providers so a
// legitimate round-robin ("ask everyone") still completes, while a genuine
// A->B->A loop is refused well before it becomes a runaway job queue.
const DEFAULT_MAX_HOPS = 4;

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _post(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let http;
    try { http = require(url.startsWith('https') ? 'https' : 'http'); }
    catch (e) { reject(e); return; }
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: timeoutMs || 30000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(chunks); } catch (_) { parsed = { raw: chunks }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request to ${url} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * _get(url, timeoutMs) — §BUGFIX 2026-08-30, James live: guardian's real
 * /providers route (guardian/server.js) is method==='GET' only. listAgents()
 * below called _post() against it — the route never matched, guardian's
 * unmatched-method path took over, and every caller through here ("switch
 * to guardian", copilot's own agent-liveness check) reported no live
 * agents regardless of how many real NCP connections guardian actually
 * had. Confirmed directly: guardian's own boot log shows 4 real NCP
 * connections; the bug was never in the connection state, only in this
 * file's own request method. A prior session's fix here (the §BUGFIX
 * 2026-08-27 comment below) correctly fixed the RESPONSE-SHAPE parsing,
 * but never caught that the REQUEST itself was the wrong HTTP method —
 * the response shape was fixed to parse a response that was never
 * actually reaching the real route handler.
 */
function _get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let http;
    try { http = require(url.startsWith('https') ? 'https' : 'http'); }
    catch (e) { reject(e); return; }
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: 'GET',
      timeout: timeoutMs || 30000,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(chunks); } catch (_) { parsed = { raw: chunks }; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`request to ${url} timed out after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
  });
}

// §DEFAULT FALLBACK DISPATCH — only used when no dispatch function is
// injected (see ask() below). Goes through guardian's real askSync path so
// even the fallback isn't a made-up transport, but it does NOT get the real
// agent-tools loop that lifeline's dispatchToNcpAgent + runViaAgent give a
// dispatched agent — that's the reason the injected path is preferred.
async function _defaultDispatch(prompt, opts) {
  const res = await _post(`${GUARDIAN_URL}/api/copilot/prompt`, {
    prompt, provider: opts.provider, timeoutMs: opts.timeoutMs,
  }, (opts.timeoutMs || 30000) + 5000);
  const ok = res.status === 200 && res.body && res.body.ok !== false;
  const text = ok ? (res.body.text || res.body.response || res.body.result || null) : null;
  return ok && text
    ? { ok: true, text }
    : { ok: false, text: null, error: (res.body && res.body.error) || `guardian returned ${res.status} with no usable text` };
}

/**
 * ask(provider, message, opts) — address another agent as a real agent,
 * with a hop cap so agent-to-agent chains can't loop forever.
 *
 * opts: { from, hops, maxHops, timeoutMs, dispatch }
 *   from     — who is asking (for the log row and for cycle detection)
 *   hops     — the chain of askers so far, e.g. ['nexus', 'chatgpt']. Passed
 *              through untouched by the CALLER on the first hop; this
 *              function appends `from` and refuses if `provider` is already
 *              in the chain (a real cycle) or the chain is at maxHops.
 *   dispatch — (prompt, {provider, requestId, ...}) => {ok, text, error}.
 *              Inject copilot/lifeline.js's dispatchToNcpAgent (or
 *              tool-runtime's runViaAgent, for the full tool loop) here.
 *              Falls back to a plain guardian askSync call if omitted —
 *              real, but without the dispatched agent's own tool access.
 *
 * Returns { ok, text, error, hops }. Never throws — a failed ask is a
 * result, per the same §1.2 convention as the wake handler.
 */
async function ask(provider, message, opts = {}) {
  if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
    return { ok: false, error: `unknown provider "${provider}" — expected one of ${KNOWN_PROVIDERS.join(', ')}` };
  }
  if (typeof message !== 'string' || !message.trim()) {
    return { ok: false, error: 'message required' };
  }

  const from     = opts.from || 'nexus';
  const maxHops  = opts.maxHops || DEFAULT_MAX_HOPS;
  const hops     = Array.isArray(opts.hops) ? opts.hops.slice() : [];
  const dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : _defaultDispatch;

  if (hops.includes(provider)) {
    return { ok: false, error: `hop cap: "${provider}" is already in this chain (${hops.join(' -> ')} -> ${provider}) — refusing to loop`, hops };
  }
  if (hops.length >= maxHops) {
    return { ok: false, error: `hop cap: chain already at ${hops.length} hops (max ${maxHops}) — ${hops.join(' -> ')}`, hops };
  }

  const nextHops = hops.concat(from);
  const startedAt = Date.now();
  let d;
  try {
    d = await dispatch(message, { provider, from, hops: nextHops, timeoutMs: opts.timeoutMs, requestId: opts.requestId });
  } catch (e) {
    return { ok: false, error: `dispatch to ${provider} threw: ${e.message}`, hops: nextHops };
  }

  const ok   = !!(d && d.ok !== false && d.text);
  const text = ok ? d.text : null;
  const result = ok
    ? { ok: true, text, hops: nextHops }
    : { ok: false, error: (d && d.error) || `${provider} returned no usable text`, hops: nextHops };

  // §WRITER — guardian_chat_log has no current writer anywhere else in the
  // tree (confirmed in lib/agent-tools/tools/query/agent-chat-search.js's own
  // header). Logging failures too, not just successes — a table that only
  // records what worked is not a real history.
  const jaa = _jaa();
  if (jaa) {
    try {
      jaa.insert('guardian_chat_log', {
        ts: startedAt, provider, from, prompt: message,
        response: text || null, ok: result.ok, error: result.ok ? null : result.error,
        hops: nextHops, durationMs: Date.now() - startedAt,
      });
    } catch (_) { /* logging must never break the ask path */ }
  }

  return result;
}

/**
 * readChat(provider, opts) — logged history for one provider, newest first.
 *
 * This reads guardian_chat_log (what NEXUS has actually asked and logged
 * via ask() above). It is NOT a live read of what's currently on screen in
 * that provider's tab — that would be GET /api/tab/dom?provider=X on
 * guardian, which does not exist yet. Returned explicitly as `liveDom:
 * false` rather than silently passing off logged history as a live read.
 */
function readChat(provider, opts = {}) {
  const limit = opts.limit || 20;
  const jaa = _jaa();
  if (!jaa) return { ok: false, error: 'jaa store unavailable', rows: [], liveDom: false };
  let rows;
  try {
    rows = jaa.query('guardian_chat_log', provider ? (r => r.provider === provider) : (() => true));
  } catch (e) {
    return { ok: false, error: e.message, rows: [], liveDom: false };
  }
  rows = rows.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, limit);
  return { ok: true, rows, liveDom: false };
}

/**
 * converse({ agentA, agentB, openingLine, from, maxRounds, dispatch, requestId }) —
 * a genuine, multi-round, back-and-forth conversation between two named
 * agents. James: "I want them to be able to talk back and forth."
 *
 * §WHY ON TOP OF ask(), NOT A REIMPLEMENTATION — every single turn below is
 * a real, individual ask() call. That means every turn independently gets
 * the same real hop-cap protection, the same real tool access (via
 * whatever dispatch fn the caller supplies — copilot/tool-runtime.js's
 * runViaAgent, same as a single ask()), and the same real
 * guardian_chat_log write. A conversation is not a different kind of
 * exchange than a single ask — it is several of them, in sequence, and
 * treating it as anything else would mean two divergent code paths for
 * dispatch that must stay in sync forever.
 *
 * §THE HOP CAP DOES DOUBLE DUTY HERE — ask()'s hops array already refuses
 * a provider that's already in the chain. Passed straight through on every
 * turn (not reset), which means the SAME real protection that stops a
 * relay loop (A asks B asks C asks A) also naturally bounds a two-agent
 * conversation once maxHops is reached — no second bound needed for that
 * failure mode. maxRounds below is a SEPARATE, real bound for the case hops
 * doesn't cover: A and B legitimately only ever hop between each other,
 * which never grows the hops array past 2 real entries, so a conversation
 * between exactly two agents needs its own real stop condition.
 *
 * Real, honest stop conditions, not glossed over: maxRounds reached, either
 * side's ask() genuinely fails (empty text, dispatch error, hop-cap
 * refusal), or a real END_RE match on either side's own words — a
 * conversation that runs to the bound every time even when both sides are
 * done talking is not "back and forth," it's forced small talk.
 */
const END_RE = /\b(nothing (else|further) to add|that('?s| is) all|no further questions|conversation (complete|concluded|done)|i'?m done here)\b/i;

async function converse({ agentA, agentB, openingLine, from = 'nexus', maxRounds = 4, dispatch, requestId } = {}) {
  if (!agentA || !agentB) return { ok: false, error: 'converse needs agentA and agentB' };
  if (agentA === agentB) return { ok: false, error: 'converse needs two DIFFERENT agents — talking to yourself is not a conversation' };
  if (typeof openingLine !== 'string' || !openingLine.trim()) return { ok: false, error: 'converse needs openingLine' };

  const MAX_ROUNDS_HARD_CAP = 10; // §1.1 — a real, stated bound regardless of what a caller requests
  const rounds = Math.min(maxRounds, MAX_ROUNDS_HARD_CAP);
  const transcript = [];

  let speaker = agentA, listener = agentB, message = openingLine;
  for (let i = 0; i < rounds * 2; i++) {
    // §FIXED, found by testing before shipping: ask()'s hop-cap exists to
    // stop an INDIRECT relay loop through intermediaries (A asks B asks C
    // asks A) — accumulating hops across MY OWN conversation rounds meant
    // round 2 always saw the round-1 speaker already "in the chain" and
    // refused, even though direct back-and-forth between exactly these
    // two agents is the entire point. rounds above is already the real,
    // correct bound for THIS failure mode; each turn passes a fresh,
    // single-entry hops array — enough for ask()'s own logging, without
    // triggering protection built for a different problem.
    const r = await ask(listener, message, { from: speaker, hops: [speaker], dispatch, requestId, maxHops: 2 });
    if (!r.ok) {
      transcript.push({ speaker: listener, error: r.error, round: transcript.length });
      return { ok: transcript.length > 0, transcript, rounds: Math.ceil(transcript.length / 2), stoppedBecause: r.error };
    }
    transcript.push({ speaker: listener, text: r.text, round: transcript.length });

    if (END_RE.test(r.text)) {
      return { ok: true, transcript, rounds: Math.ceil(transcript.length / 2), stoppedBecause: `${listener} signaled the conversation was complete` };
    }

    message = r.text;
    [speaker, listener] = [listener, speaker]; // real, genuine alternation — the previous listener now speaks
  }

  return { ok: true, transcript, rounds: Math.ceil(transcript.length / 2), stoppedBecause: `reached the real, requested bound (${rounds} rounds)` };
}


// ── Real agent discovery, live-DOM reads, and the acceptance channel ────────
// §MERGE 2026-08-22 — reconciled from a second, independently-built version
// of this file (the freeze-thaw lineage) that reached converse()/ask()'s
// real hop-cycle-detection/audit-logging improvements before this side did.
// Everything below is this side's own real, separately-tested contribution,
// kept rather than dropped, adapted to call the newer ask() (hops, not
// trail — see iterate() below).

async function listAgents() {
  try {
    const r = await _get(`${GUARDIAN_URL}/providers`, 8000).then(res => res.body);
    // §BUGFIX 2026-08-27 — James, live: guardian showed 4 providers NCP-
    // connected in its own boot log, but every caller through here (the
    // "switch to guardian" fallback, copilot/server.js:1787) reported "no
    // real agent tab is currently live" regardless. Traced directly against
    // the REAL handler (guardian/server.js's GET /providers, confirmed
    // against guardian/lib/ncp.js's getProviders()/isConnected()): guardian
    // returns `{ ok, providers: {name: 'connected'|'null', ...}, channels:
    // {name: {tabId, lastHeartbeat, ...}, ...} }` — both OBJECTS keyed by
    // provider name. Guardian has never returned an array, and never nested
    // one under `.providers` — that shape only ever existed in this file's
    // own assumption. `r.providers || []` took the truthy object as-is
    // (never fell through to `[]`), then `.map()` on a plain object threw,
    // and the catch below silently turned that into a generic ok:false —
    // which is why this always failed the same way no matter how many
    // tabs were actually connected. Fixed to read the real shape: `channels`
    // (only present for providers actually NCP-connected right now) is the
    // authoritative "live" signal; `providers` fills in the rest as
    // registered-not-connected. Verified against guardian's real /providers
    // response, not reconstructed from what this file wished it returned.
    const providers = (r && typeof r.providers === 'object' && r.providers) || {};
    const channels  = (r && typeof r.channels  === 'object' && r.channels)  || {};
    const names = new Set([...Object.keys(providers), ...Object.keys(channels)]);
    const agents = [...names].map(name => {
      const ch = channels[name] || null;
      const connected = !!ch || providers[name] === 'connected';
      return {
        provider: name, tabId: ch?.tabId || null,
        connected, lastSeen: ch?.lastHeartbeat || null,
        state: connected ? 'live' : 'registered-not-connected',
      };
    });
    return { ok: true, agents };
  } catch (e) {
    // §1.2 — unreachable guardian is NOT "no agents".
    return { ok: false, agents: [], error: e.message,
      note: 'guardian unreachable — this is NOT the same as no agents being connected' };
  }
}

/**
 * readLiveDom(provider, opts) — the transcript currently on-screen in
 * another agent's tab, not NEXUS's own logged history of it (that's
 * readChat() above, and this file's own header comment used to document
 * this endpoint as "does not exist yet" — checked directly against
 * guardian/server.js: it still does not exist. Kept, real code, honestly
 * degrading to a clear error rather than pretending to work — but a
 * caller should know this currently cannot succeed until that endpoint is
 * built. Renamed from an earlier readChat() to resolve a real name
 * collision found while merging this file's two independently-developed
 * versions: the OTHER real meaning of "readChat" (logged
 * guardian_chat_log history) already owns that name above and is used by
 * the real, existing agent_chat_search tool.
 */
async function readLiveDom(provider, { limit = 50, kind = null } = {}) {
  if (!provider) throw new Error(`[${MODULE_ID}] §1.1 readLiveDom requires a provider`);
  try {
    const res = await _post(`${GUARDIAN_URL}/api/tab/dom?provider=${encodeURIComponent(provider)}`, {}, 8000);
    const r = res.body || {};
    const nodes = r.nodes || r.dom_map || [];
    if (!nodes.length) {
      return { ok: true, provider, chunks: [], empty: true,
        note: 'guardian answered but holds no DOM map for this provider — the tab may be open with no userscript attached, which is not the same as an empty chat' };
    }
    let chunks = nodes.map(_toChunk).filter(Boolean);
    if (kind) chunks = chunks.filter(c => c.kind === kind);
    return { ok: true, provider, total: chunks.length, chunks: chunks.slice(-limit), empty: false };
  } catch (e) {
    return { ok: false, provider, chunks: [], error: e.message,
      note: 'unread, not empty — a consumer must not treat this as an absence of content. also: this endpoint is not yet implemented on guardian, confirmed by reading guardian/server.js directly, so this call is expected to fail until that lands' };
  }
}

/** readCode(provider) — just the code blocks from the live tab. The common case for build work. */
async function readCode(provider, opts = {}) { return readLiveDom(provider, { ...opts, kind: 'code' }); }

function _toChunk(n) {
  if (!n) return null;
  if (n.tag === 'PRE' || n.kind === 'code') {
    return { kind: 'code', lang: n.lang || 'text', text: n.text || n.textContent || '', role: n.role || null };
  }
  if (n.tag === 'IMG' || n.kind === 'image') return { kind: 'image', src: n.src || null, alt: n.alt || '' };
  const t = (n.text || n.textContent || '').trim();
  return t ? { kind: 'text', text: t, role: n.role || null } : null;
}

// ── THE ACCEPTANCE CHANNEL ───────────────────────────────────────────────────
/**
 * checkAgainstSystem(output, spec) — did this output actually satisfy the ask?
 *
 * Routes the output through the real gates already in the tree:
 *   lifeline-contracts  does the output match the SHAPE the intent required
 *   raid.verify         constitution + contract + isolation + sigma + rewind
 * and returns the GATE's verdict, per-gate, in `gates`.
 *
 * An agent's own assessment is recorded when supplied, but only ever as
 * `claimed` alongside `verified` — never in place of it. When the two
 * disagree, `agreement:false` and the specific disagreement is named in
 * `actionable`, never averaged away.
 */
async function checkAgainstSystem(output, { intent, action = 'build', spec = null, agentClaim = null } = {}) {
  const verdict = {
    verified: null, claimed: agentClaim, agreement: null,
    gates: {}, reason: null, actionable: null,
  };

  // Gate 1 — contract shape.
  try {
    const lc = require(path.join(ROOT, 'copilot/lib/lifeline-contracts'));
    const c = lc.check ? lc.check(output, intent) : lc.validate?.(output, intent);
    verdict.gates.contract = c || { ran: false, note: 'lifeline-contracts exposed no check()' };
  } catch (e) {
    verdict.gates.contract = { ran: false, error: e.message,
      note: 'contract gate UNAVAILABLE — recorded as unrun, never as passed' };
  }

  // Gate 2 — the real RAID spine.
  try {
    const raid = require(path.join(ROOT, 'cortex/core/raid'));
    if (raid && typeof raid.verify === 'function') {
      verdict.gates.raid = await raid.verify({ action, intent, payload: output, spec });
    } else {
      verdict.gates.raid = { ran: false, note: 'raid.verify not exported — gate UNAVAILABLE, not passed' };
    }
  } catch (e) {
    verdict.gates.raid = { ran: false, error: e.message, note: 'raid unreachable — unrun, not passed' };
  }

  const ran = Object.values(verdict.gates).filter(g => g && g.ran !== false);
  if (!ran.length) {
    // §1.2 — no gate ran. That is UNVERIFIED, and must never read as a pass.
    verdict.verified = null;
    verdict.reason = 'no gate could run — this output is UNVERIFIED. Unverified is not approved.';
    verdict.actionable = 'bring raid or lifeline-contracts up before trusting this result';
    return verdict;
  }

  const passed = ran.every(g => g.pass !== false && g.approved !== false && g.ok !== false);
  verdict.verified = passed;
  verdict.reason = passed
    ? `passed ${ran.length} gate(s)`
    : `refused by: ${ran.filter(g => g.pass === false || g.approved === false || g.ok === false)
        .map(g => g.axiom || g.stage || g.reason || 'a gate').join(', ')}`;

  if (agentClaim !== null && typeof agentClaim === 'boolean') {
    verdict.agreement = (agentClaim === passed);
    if (!verdict.agreement) {
      // The most informative outcome in the loop. Named, never averaged away.
      verdict.actionable = agentClaim
        ? 'the agent asserted success the gate refused — feed the gate\'s reason back as the next prompt, not the agent\'s self-assessment'
        : 'the agent reported failure the gate accepted — the agent may be over-constrained, or the gate under-specified';
    }
  }
  return verdict;
}

/**
 * iterate({provider, prompt, intent, action, maxRounds, from, onRound}) —
 * ask, gate, feed the gate's specific refusal back, repeat. Never treats a
 * confidently-claimed success as the verdict — checkAgainstSystem's real
 * gate is. Halts (does not spin) when the gate itself can't run.
 */
async function iterate({ provider, prompt, intent, action = 'build', maxRounds = 3, from = 'nexus', onRound = null }) {
  const rounds = [];
  let current = prompt, hops = [];

  for (let n = 1; n <= maxRounds; n++) {
    const reply = await ask(provider, current, { from, hops, intent });
    hops = reply.hops || hops;
    if (!reply.ok) {
      rounds.push({ round: n, reached: false, error: reply.error });
      return { ok: false, rounds, reason: `agent unreachable on round ${n}`, hops };
    }

    const verdict = await checkAgainstSystem(reply.text, { intent, action });
    rounds.push({ round: n, output: reply.text, verdict });
    if (onRound) { try { onRound({ round: n, reply, verdict }); } catch (_) {} }

    if (verdict.verified === true) return { ok: true, rounds, output: reply.text, verifiedOn: n, hops };
    if (verdict.verified === null) {
      return { ok: false, rounds, hops,
        reason: 'the gate could not run — halting rather than iterating on unverifiable output',
        actionable: verdict.actionable };
    }
    current = `Your previous output was refused by the system's verification gate.\n\n` +
              `REASON: ${verdict.reason}\n\n` +
              `Address that specific refusal and return the corrected output. ` +
              `Do not restate the original; return the fix.`;
  }

  return { ok: false, rounds, hops,
    reason: `${maxRounds} rounds without passing the gate`,
    actionable: 'the refusals across rounds are in `rounds` — a repeated identical refusal usually means the spec is wrong, not the agent' };
}

function health() {
  return { ok: true, version: VERSION, guardian: GUARDIAN_URL, copilot: COPILOT,
    defaultMaxHops: DEFAULT_MAX_HOPS, wakeWord: 'hey nexus, <request>' };
}

module.exports = {
  WAKE_RE, parseWake, ask, converse, readChat, readLiveDom, readCode, listAgents,
  checkAgainstSystem, iterate, health,
  KNOWN_PROVIDERS, DEFAULT_MAX_HOPS, MODULE_ID, VERSION, COMP_ID, HOOK_ID,
};
