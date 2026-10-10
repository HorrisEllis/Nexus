'use strict';
/**
 * copilot/server.js — Sovereign Co-pilot System
 * UUID: nexus-copilot-server-v3-0000-2026-0628-jamesbrooks-001
 * Port: 3750
 *
 * P73–73.6  — copilot-context.js now wires all 7 sensing layers into every
 *             prompt (was using bespoke 5-layer assembler in analysis.js).
 * P103      — Session continuity: last N chat_log injected at session start.
 * P110      — Dual cognition full wire: Cortex /api/intelligence/intuition
 *             and /api/intelligence/mastermind queried before Ollama dispatch.
 * P112      — Streaming /api/prompt/stream SSE endpoint — token-by-token via
 *             Ollama streamed jobs; timeout eliminated.
 * AX-008    — Idearium SSE wired in. Was the one sovereign system whose
 *             activity never reached copilot. Fixed 2026-06-29.
 */

const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');

// §BUG FIXED 2026-07-11, extracted as a real shared function — "the
// co-pilot in the tv-ui is showing json strings — fixed over and over but
// keeps getting changed back." Root cause of the "keeps getting changed
// back" part specifically: the two call sites that needed this fix each
// had their OWN inline fallback chain (`r.text || r.result ||
// JSON.stringify(r)`), and tests/modules/copilot-handshake-dispatch.test.js
// tested a THIRD, independently-duplicated copy of the same logic rather
// than importing the real function — so a fix applied to the real code
// never touched what the test actually exercised, the test kept passing
// against its own stale mock, and nothing caught a regression that
// reintroduced the bug in either real call site. Extracting this once,
// exporting it, and having the test import the real function (not a mock)
// closes that loop — the test can no longer drift from the implementation.
//
// The bug itself: an upstream response can carry its text at `.text`,
// nested at `.result.text`, or (older/other providers) directly as a
// string at `.result`. Every UI consumer downstream treats the extracted
// value as a plain string — `.slice()`, template-literal interpolation,
// `textContent` assignment. Picking a raw object because it was first in
// an `||` chain breaks all of those; this always returns a string.
function extractDispatchText(r) {
  if (!r || typeof r !== 'object') return null;
  if (typeof r.text === 'string') return r.text;
  if (typeof r.result === 'string') return r.result;
  if (typeof r.result?.text === 'string') return r.result.text;
  if (typeof r.output === 'string') return r.output;
  if (typeof r.output?.text === 'string') return r.output.text;
  return null; // caller decides the fallback — different callers want different diagnostic messages
}

// §WIRED — real, distinct config, not inline constants. See
// copilot/config.js's own header for the full real scope and
// reasoning, matching guardian/config.js and intelligence/config.js.
const config = require('./config.js');
// §BUILT 2026-09-19 — real, editable .inject_rule nodes for the five
// context-injection sites below. Seeded once, lazily, on first real
// call rather than requiring a separate boot-sequence hook — matches
// this file's own existing lazy-require pattern for optional modules
// (see _getCopilotContext elsewhere in this file).
const _injectConfig = require('./lib/inject-config.js');
let _injectSeeded = false;
/** §SD2 0.56.0 — an /api/prompt with no text: ok:false, said with lifeline's reason (reason too, for callers that read it) */
function _noAnswer({ requestId, sessionId, modelUsed = 'none', lifeError = null, ...rest } = {}) {
  const error = lifeError || (modelUsed && modelUsed !== 'none' ? `${modelUsed} answered with no text` : 'no model answered — Ollama and the guardian agents gave nothing back');
  return { ok: false, error, reason: error, text: '', modelUsed, requestId, sessionId, contextLayers: 7, ...rest };
}

function _getInjectRule(id) {
  if (!_injectSeeded) { try { _injectConfig.seedDefaultInjectRules(); } catch (_) {} _injectSeeded = true; }
  return _injectConfig.getInjectRule(id);
}
const PORT     = config.PORT;
const GD_URL   = process.env.GUARDIAN_URL   || 'http://127.0.0.1:7820';
const CX_URL   = process.env.CORTEX_URL     || 'http://127.0.0.1:3748';
const INTEL_URL = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753'; // intelligence is sovereign (moved out of cortex 2026-09-19)
const ORCH_URL  = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000'; // the CFR field's authority

// §ADDED 2026-07-06 — completes the loop the Spotlight bug fix (same
// session) unblocked: ui/tv-shell/spotlight/spotlight.js's window.CP.exec
// now actually works, but nothing ever sent it a `ui{}` block. This is
// that decision logic — real, not a stub, with an honest limit stated
// directly: lib/nerve/index.js's own comment says per-node CFR stress is
// "a Phase 3+ concern... global field is honest for Phase 1," so WHICH
// system is stressed can't be answered yet — only "is the system as a
// whole calm or not" can. Built to match that real limit, not to pretend
// past it. This list must match ui/tv-shell/spotlight/spotlight.js's own
// EL registry — canonical source is that file; kept in sync manually
// since one's browser JS and one's Node, no shared import path today.
// §FIX 2026-09-06 — 'bridge' removed; the system itself is fully
// retired this session. This list mixes real system names with
// thematic keywords (forge/agent/blueprint aren't systems) — a full
// swap to lib/system-registry.js's real, live list would also change
// which keywords the spotlight UI recognizes, not just fix this one
// dead entry. Worth doing as its own deliberate pass, not bundled
// silently into this correctness-only fix.
const SPOTLIGHT_TARGETS = ['guardian','cortex','idearium','orchestrator',
  'diagnostic','architect','emerge','forge','agent','blueprint'];

async function _fetchCFRField() {
  return new Promise((resolve) => {
    const u = new URL(`${ORCH_URL}/cfr/field`);
    const req = http.request({ hostname: u.hostname, port: u.port || 9000, path: u.pathname, timeout: 1500 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * _buildSpotlightUI — real decision, real data, honest about its limit.
 * WHICH systems: literal name-mention matching against the same targets
 * Spotlight itself knows about — if the answer talks about guardian, the
 * guardian tile lights up. HOW urgently: the real global CFR regime
 * (stable vs. not) sets intensity/color — not per-system, because
 * per-system doesn't exist yet.
 */
async function _buildSpotlightUI(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const mentioned = SPOTLIGHT_TARGETS.filter(name => new RegExp(`\\b${name}\\b`).test(lower));
  if (!mentioned.length) return null;

  const field = await _fetchCFRField();
  const stable = !field || field.regime === 'stable'; // fail open to calm, never fabricate alarm from a failed fetch
  return {
    spotlight: mentioned,
    spotlightTtl: 8000,
    spotlightIntensity: stable ? 0.6 : 0.9,
    spotlightColor: stable ? null : '#ff5566',
  };
}
const OR_URL   = process.env.ORCH_URL       || 'http://127.0.0.1:9000';
const OL_URL   = process.env.OLLAMA_URL     || 'http://127.0.0.1:3749';
const IDR_URL  = process.env.IDEARIUM_URL   || 'http://127.0.0.1:4800';

const _cw = require('../lib/cortex-write')('copilot');

// Blueprint index — component awareness substrate (§BP-01)
let _blueprintIndex = null;
function _getBP() {
  if (_blueprintIndex) return _blueprintIndex;
  try { _blueprintIndex = require('../lib/blueprint-index'); return _blueprintIndex; } catch(_) { return null; }
}

// §P73: copilot-context — 7-layer sensing (L0 bus → L6 predictive intent)
let _copilotContext = null;
function _getCopilotContext() {
  if (_copilotContext) return _copilotContext;
  try { _copilotContext = require('../copilot/lib/copilot-context'); return _copilotContext; } catch(_) { return null; }
}

setImmediate(() => {
  try {
    const bi = _getBP();
    if (!bi?.load()) {
      const r = bi?.build();
      if (r?.ok) console.log(`[copilot] blueprint-index built: ${r.index?.totalComponents} components`);
    } else {
      console.log('[copilot] blueprint-index loaded');
    }
  } catch(e) { console.warn('[copilot] blueprint-index startup failed:', e.message); }
});

const _lifeline    = require('./lifeline');
const _modBuilder  = require('./module-builder');
const _rDiagnose   = require('./recursive-diagnose');
const SYSTEM_ID = 'copilot';
// §BUGFIX 2026-07-04: was a hardcoded '3.0.0', independent of
// lib/version.js's registry — sourcing from it now.
const VERSION   = require('../lib/version').services.copilot;

// ── CONTINUOUS STREAM — the co-pilot's consciousness ─────────────────────────
const _stream = [];
const MAX_STREAM = config.MAX_STREAM;

// §WIRED 2026-07-09 — copilot/lib/expectation-watcher.js arrived with
// nexus-autonomous-v8 and was orphaned: nothing in copilot/*.js required it.
// It is the event-driven expectation system — "co-pilot tracks errors from
// expected events" — detecting when a trigger fires and the expected
// follow-up never arrives within its timeout.
//
// It needs a bus. Copilot had none: its events arrive as SSE from cortex and
// guardian and land in the _stream ring via streamIngest(). Per §AX-011 the
// bus is a within-process spine, so copilot gets its own, fed by the real
// ingestion path. Same single-object event shape as nexus-bus (`on('*', ev)`),
// so anything written against that contract works here unchanged.
const { EventEmitter } = require('events');
const _copilotBus = new EventEmitter();
_copilotBus.setMaxListeners(50);

let _expectationWatcher = null;
try {
  const { createExpectationWatcher } = require('./lib/expectation-watcher.js');
  _expectationWatcher = createExpectationWatcher(_copilotBus);

  // §WIRE COMPLETED 2026-07-09 — the watcher emits 'copilot.error.detected'
  // onto the LOCAL bus, and ui/toast/toast.js already subscribes to exactly
  // that event type. But nothing carried it across: copilot never broadcast
  // it to its SSE clients, so a detected violation died in-process and the
  // user was never told. That is the dominant bug of this codebase — a real
  // detector wired to nothing — reproduced one more time. This is the wire.
  //
  // Per §AX-011 the bus is within-process; SSE is how it crosses to the UI.
  _copilotBus.on('copilot.error.detected', (d) => {
    try { broadcast('copilot.error.detected', d); }
    catch (e) { console.warn('[copilot] failed to broadcast error.detected:', e.message); }
  });

  console.log('[copilot] expectation-watcher attached — 5 expectations armed, violations broadcast to /sse');
} catch (e) {
  console.warn('[copilot] expectation-watcher not attached:', e.message);
}

function streamIngest(event) {
  _stream.push({ ...event, ingestedAt: Date.now() });
  if (_stream.length > MAX_STREAM) _stream.shift();
  broadcast('copilot.stream.event', { type: event.type, ts: event.ts || Date.now() });

  // Feed the local bus so the expectation watcher sees real traffic.
  // Both fan-outs, matching nexus-bus's contract exactly (specific + wildcard,
  // one event object). Never let a listener error break ingestion (§1.2:
  // report, don't swallow the pipeline).
  if (event?.type) {
    try { _copilotBus.emit(event.type, event); } catch (e) { console.warn('[copilot] bus listener error:', e.message); }
    try { _copilotBus.emit('*', event); }       catch (e) { console.warn('[copilot] bus wildcard error:', e.message); }
  }
}

// Subscribe to Cortex SSE for live events
function _connectCortexStream() {
  try {
    const u = new URL(`${CX_URL}/events`);
    const req = http.request({ hostname: u.hostname, port: u.port || 3748,
      path: u.pathname, headers: { Accept: 'text/event-stream' } }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try { streamIngest(JSON.parse(line.slice(5))); } catch(_) {}
        }
      });
      res.on('end', () => { setTimeout(_connectCortexStream, 2000); });
    });
    req.on('error', () => setTimeout(_connectCortexStream, 5000));
    req.end();
  } catch(_) { setTimeout(_connectCortexStream, 5000); }
}

// Subscribe to Guardian SSE
function _connectGuardianStream() {
  try {
    const u = new URL(`${GD_URL}/events`);
    const req = http.request({ hostname: u.hostname, port: u.port || 7820,
      path: '/bus', headers: { Accept: 'text/event-stream' } }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try { streamIngest(JSON.parse(line.slice(5))); } catch(_) {}
        }
      });
      res.on('end', () => setTimeout(_connectGuardianStream, 2000));
    });
    req.on('error', () => setTimeout(_connectGuardianStream, 5000));
    req.end();
  } catch(_) { setTimeout(_connectGuardianStream, 5000); }
}

// §AX-008 fix 2026-06-29: Subscribe to Idearium SSE — was scoped (IDR_URL has
// existed since at least v3) but never connected. idearium/index.js broadcasts
// every os.emit() (idea.create, idea.phase, spec.create, gap.open, ...) to all
// SSE clients on /sse — same shape as Guardian/Cortex's /events, different
// path. Closes AX-008: idearium's idea/project/lattice activity was invisible
// to copilot by construction; this is the missing wire. See hooks/idearium.hooks.js.
function _connectIdeariumStream() {
  try {
    const u = new URL(`${IDR_URL}/sse`);
    const req = http.request({ hostname: u.hostname, port: u.port || 4800,
      path: u.pathname, headers: { Accept: 'text/event-stream' } }, res => {
      let buf = '';
      res.on('data', chunk => {
        buf += chunk.toString();
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            streamIngest({ ...ev, system: ev.system || 'idearium' });
          } catch(_) {}
        }
      });
      res.on('end', () => setTimeout(_connectIdeariumStream, 2000));
    });
    req.on('error', () => setTimeout(_connectIdeariumStream, 5000));
    req.end();
  } catch(_) { setTimeout(_connectIdeariumStream, 5000); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function _fetch(url, opts = {}) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname, port: u.port || 80,
      path: u.pathname + (u.search || ''),
      method: opts.method || 'GET',
      headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
      timeout: opts.timeout || 5000,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(_) { res(d); } });
    });
    req.on('error', rej);
    req.on('timeout', () => { req.destroy(); rej(new Error('timeout')); });
    if (opts.body) req.write(JSON.stringify(opts.body));
    req.end();
  });
}

async function _post(url, body, timeoutMs = 10000) {
  return _fetch(url, { method: 'POST', body, timeout: timeoutMs });
}

// ── Dual Cognition modules ─────────────────────────────────────────────────────
const _intuition   = require('./intuition');
const _analysis    = require('./analysis');
const _adversarial = require('./adversarial');

_adversarial.start(() => _stream.slice(-30));

// ── §P110: Cortex dual cognition — INTUITION + MASTERMIND via HTTP ────────────
// Cortex runs its own intelligence layer (Phase 84/85). Before dispatching to
// Ollama, we query Cortex for a fast intuition answer and a causal mastermind
// reading. Either can satisfy the prompt without a model call.
async function _queryCortexIntuition(prompt, sessionId) {
  try {
    const r = await _fetch(`${INTEL_URL}/api/intelligence/intuition`, {
      method: 'POST',
      body: { prompt, sessionId },
      timeout: 2000,
    });
    if (r?.ok && r?.text) return r;
    return null;
  } catch(_) { return null; }
}

async function _queryCortexMastermind(prompt, contextLayers, sessionId) {
  try {
    const r = await _fetch(`${INTEL_URL}/api/intelligence/mastermind`, {
      method: 'POST',
      body: { prompt, context: contextLayers, sessionId },
      timeout: 4000,
    });
    if (r?.ok && r?.analysis) return r;
    return null;
  } catch(_) { return null; }
}

// ── §P103: Session continuity — inject last N exchanges on session start ───────
// Fetches chat_log from Cortex and appends to the 7-layer context so the
// co-pilot remembers what was said earlier in the session.
// §MERGED 2026-07-09 from the parallel 07-07 branch (nexus-wired-v6).
// Pure decision function, deliberately kept out of the HTTP handler so it
// is directly testable. Given a fast intuition answer and (maybe) an
// adversarial verdict, decides what to actually say. A contradiction is
// surfaced to the user, never hidden.
function _resolveIntuitionResponse(cortexIntuition, adversarialVerdict) {
  const av = adversarialVerdict?.adversarial;
  if (av?.verdict === 'contradiction') {
    return {
      text: `${cortexIntuition.text} (Note: deeper analysis found a discrepancy — ${av.reasons.join('; ')}.)`,
      source: 'cortex.intuition+adversarial',
    };
  }
  if (av?.verdict === 'reconciled') {
    return {
      text: av.reconciled_hypothesis || cortexIntuition.text,
      source: 'cortex.intuition+mastermind.reconciled',
    };
  }
  return { text: cortexIntuition.text, source: 'cortex.intuition' };
}

// Runs both faculties server-side in one round trip and compares them,
// rather than making copilot fetch intuition and mastermind separately and
// reconcile them itself. Returns null on any failure — never a fabricated
// verdict, so the caller falls back to plain intuition text unchanged.
async function _queryCortexAdversarial(prompt, sessionId) {
  try {
    const r = await _fetch(`${INTEL_URL}/api/intelligence/adversarial`, {
      method: 'POST',
      body: { prompt, sessionId },
      timeout: 4000,
    });
    return r || null;
  } catch(_) { return null; }
}

async function _injectSessionHistory(session, contextText) {
  if (!session?.sessionId || session.exchanges > 1) return contextText;
  const rule = _getInjectRule('session-history');
  if (!rule.enabled) return contextText; // §CONFIGURABLE — skips the network call, not just the output
  try {
    const { fetchN = 8, useLastN = 5, promptMaxChars = 80, responseMaxChars = 120 } = rule.limits || {};
    const mem = await _fetch(
      `${CX_URL}/api/memory?table=chat_log&n=${fetchN}&sessionId=${encodeURIComponent(session.sessionId)}`,
      { timeout: 2000 }
    );
    const rows = mem?.rows || [];
    if (!rows.length) return contextText;
    const history = rows
      .slice(-useLastN)
      .map(r => `  U: ${(r.prompt || '').slice(0, promptMaxChars)}\n  A: ${(r.response || '').slice(0, responseMaxChars)}`)
      .join('\n');
    const block = (rule.template || '\n\n=== SESSION HISTORY (last {count} exchanges) ===\n{history}')
      .replace('{count}', rows.length).replace('{history}', history);
    return contextText + block;
  } catch(_) { return contextText; }
}

// §BUILT 2026-07-13 — chunk_2 of docs/nexus-copilot-recall.spec: "copilot
// AUTOMATICALLY pulls relevant recall into context before answering —
// associative memory without the user asking." Deliberately distinct from
// _injectSessionHistory above, not a variant of it:
//   - session history = the last N messages of THIS session, by position,
//     only on the first exchange (continuity — "what did we just say").
//   - recall context = whatever's most RELEVANT to the CURRENT prompt,
//     across ALL past sessions, on EVERY exchange (association — "what do
//     we know about this topic, from whenever we discussed it").
// Built on top of the real §1.2-adjacent bugfix in cortex/boot.js's sibling
// route (POST /api/recall was silently dropping `query`) — checked that fix
// lands before building this, since this chunk would have silently
// inherited the same brokenness otherwise.
//
// Score threshold, not a fixed top-K alone — an irrelevant result with a
// low score is worse than no result; injecting it would poison the prompt
// exactly like this spec's own failure_modes_to_avoid warns against.
const RECALL_CONTEXT_SCORE_THRESHOLD = config.RECALL_CONTEXT_SCORE_THRESHOLD;
const RECALL_CONTEXT_TOP_K = config.RECALL_CONTEXT_TOP_K;

// §PHASEMAP UM2 (docs/cortex-schema-registry-phasemap.spec) — query the
// user-model on EVERY prompt path, not just the tool-loop. buildUserContext()
// reads the confidence-weighted hypotheses (now schema-observed, UM1) so
// co-pilot knows the user and adjusts on every response. Injected like the other
// context layers (§8.6 same pattern as _injectRecallContext). Non-fatal: a
// user-model hiccup never breaks a response (§1.2).
// §PHASEMAP UM3 (docs/cortex-schema-registry-phasemap.spec) — richer capture.
// The model already supports channel/topic/preference/communication_style
// categories (observe), but the prompt paths only ever fed it intent strings.
// This extracts lightweight, real signals from a prompt — the channel used, the
// verbosity, an explicit correction — and feeds them as low-confidence
// observations that ACCRETE over time (§13.1 intent logged, §0.3 nothing lost).
// Low initial confidence (0.15 delta) so a single prompt nudges rather than
// asserts; repetition is what builds a real hypothesis. Non-fatal (§1.2).
function _captureUserSignals(prompt, channel) {
  try {
    const um = require('./lib/user-model');
    if (!um.observe || !prompt) return;
    // channel preference — which surface the user reaches for.
    if (channel && channel !== 'unknown') {
      um.observe(`uses the ${channel} channel`, 'channel', { via: 'signal-capture' }, 0.15);
    }
    // verbosity / communication style — a real, cheap signal from length.
    const words = prompt.trim().split(/\s+/).length;
    const style = words <= 6 ? 'terse prompts' : words >= 40 ? 'detailed prompts' : null;
    if (style) {
      um.observe(`writes ${style}`, 'communication_style', { via: 'signal-capture', words }, 0.15);
    }
    // explicit correction — the user pushing back is a high-value signal.
    if (CORRECTION_RE.test(prompt)) {
      um.observe('corrects co-pilot when it misunderstands', 'communication_style', { via: 'signal-capture' }, 0.2);
    }
  } catch (_) { /* capture is best-effort — never affects the response (§1.2) */ }
}

// §INTROSPECT-RETRY 2026-08-19 — the correction signal now DOES something.
//
// This pattern was already here, at the top of _captureUserSignals, and its
// only effect was to record a user-model observation that the user corrects
// the co-pilot. The strongest ground truth the system ever receives — a human
// stating the answer was wrong — used solely to note that it had happened.
//
// Promoted to a module constant so the detector and the retry path cannot
// drift apart: two copies of this regex would mean a phrase that logs a
// correction without triggering a retry, or the reverse, and either is worse
// than not having the feature.
const CORRECTION_RE = config.CORRECTION_RE;

/**
 * _introspectRetry — run lib/introspect over the last exchange and re-ask with
 * the SPECIFIC finding, not "try again".
 *
 * Returns null when introspection cannot say anything useful, and null means
 * fall through to the normal path. Re-asking with no new information returns a
 * reworded version of the same answer, which is how a retry loop burns
 * attempts while looking like it works.
 */
async function _introspectRetry({ prompt, sessionId, requestId, intent, dispatchFn }) {
  try {
    const introspect = require('../lib/introspect');
    const session = _getSession(sessionId);
    const last = session && session.lastResponse ? session.lastResponse : null;
    if (!last) return null;   // nothing to introspect — not a failure, just no prior turn

    const r = await introspect.retry({
      prompt: session.lastPrompt || prompt, response: last,
      dispatchFn, requestId, sessionId, intent,
    });
    if (!r.ok || !r.answer) return null;

    broadcast('copilot.retry.introspected', {
      requestId, sessionId, verdict: r.examined.verdict,
      diagnosis: r.diagnosis, blind: r.examined.missedBy || [],
    });

    // The diagnosis rides along with the answer. A retry that does not say
    // what it changed is indistinguishable from a re-roll, and the user has no
    // way to tell whether the system understood the correction.
    return { text: r.answer, diagnosis: r.diagnosis, actionable: r.actionable,
             verdict: r.examined.verdict };
  } catch (_) {
    return null;   // §1.2 — introspection must never break the response path
  }
}

function _injectUserModel(contextText) {
  const rule = _getInjectRule('user-model');
  if (!rule.enabled) return contextText;
  try {
    const um = require('./lib/user-model');
    const model = um.buildUserContext ? um.buildUserContext() : '';
    if (model && model.trim()) {
      const out = (rule.template || '{model}\n\n{contextText}').replace('{model}', model).replace('{contextText}', contextText);
      return out;
    }
  } catch (_) { /* user-model unavailable — respond without it */ }
  return contextText;
}

async function _injectRecallContext(prompt, contextText) {
  const rule = _getInjectRule('recall-context');
  const minPromptLength = rule.limits?.minPromptLength ?? 8;
  if (!rule.enabled || !prompt || prompt.length < minPromptLength) return contextText; // too short to search meaningfully, or disabled
  try {
    const mem = await _fetch(`${CX_URL}/api/recall`, {
      method: 'POST',
      timeout: 2500,
      body: { intent: 'general', query: prompt },
    });
    // §FIXED 2026-07-13 — found by the relevant/irrelevant test this chunk's
    // own drift_gate requires, not assumed correct: a prompt with zero real
    // topical overlap ("explain quantum entanglement") was still surfacing
    // freshly-pushed, completely unrelated content, because recency alone
    // was enough to cross the score threshold. Fix: require an actual
    // topical signal (lexical, causal, or bep score > 0) in addition to the
    // threshold — recency can raise a genuinely relevant result's rank, but
    // can't manufacture relevance alone.
    const results = (mem?.results || [])
      .filter(r => (r.score || 0) >= RECALL_CONTEXT_SCORE_THRESHOLD)
      .filter(r => r.breakdown && ((r.breakdown.lexical || 0) > 0 || (r.breakdown.causal || 0) > 0 || (r.breakdown.bep || 0) > 0))
      .slice(0, RECALL_CONTEXT_TOP_K);
    if (!results.length) return contextText; // honest empty — nothing relevant enough, not a fabricated match
    const block = results
      .map(r => `  [score ${r.score.toFixed(2)}] ${(r.content || '').slice(0, 200)}`)
      .join('\n');
    return contextText + `\n\n=== RELEVANT PAST CONTEXT (${results.length} match${results.length===1?'':'es'}) ===\n${block}`;
  } catch (_) { return contextText; } // best-effort — never blocks a real answer over a recall lookup
}

// ── Dispatch to Ollama sovereign system ───────────────────────────────────────
// §BUILT 2026-08-18 — real, tool-aware follow-up generation. Deliberately
// deterministic, not a second LLM round-trip — highest leverage, lowest
// friction: no added latency or cost for something that can be reasoned
// from the tool's own real, structured result.
function _generateToolFollowUp(toolName, args, result) {
  try {
    switch (toolName) {
      case 'read_file':
        return result?.ok
          ? `Want me to search this file for something specific, or edit it?`
          : null;
      case 'search_files': {
        const n = result?.matchCount || 0;
        if (n === 0) return `No matches for that. Want to try a different keyword, or search a specific directory?`;
        return `Found ${n} real match${n === 1 ? '' : 'es'}${result?.truncated ? ' (scan hit its limit — want me to narrow the search?)' : ''}. Want me to open one, or search further?`;
      }
      case 'diagnose':
        return `Want me to act on any of these findings, or look deeper at a specific one?`;
      case 'system_priority':
        return args?.action === 'boot_check'
          ? `Want me to write these as real gaps (dryRun:false), or just review them first?`
          : null;
      case 'intent_hat':
        return result?.suggested
          ? `Want me to actually switch to "${result.hatName}" for this, or keep going as-is?`
          : null;
      case 'self_repair':
        if (args?.action === 'propose') return `Proposed in compartment "${args.name}". Want me to test it now?`;
        if (args?.action === 'test') return result?.passed
          ? `Test passed. Want me to promote it to the live file?`
          : `Test didn't pass. Want me to see the real output, or try a different approach?`;
        return null;
      default:
        return null; // an unlisted/future tool gets no generic filler — real, honest silence over boilerplate
    }
  } catch (_) { return null; } // §1.2 — a follow-up failure never affects the real tool result already sent
}

// §WORK-QUEUE 2026-08-19 — every LLM dispatch is serialised here.
//
// This is the right chokepoint, deliberately narrower than the prompt handler:
// fast paths ("what agent are you on", "list your tools", the grammar router)
// answer from local state and must NOT wait behind a generation. Queuing the
// whole handler would make the cheap answers as slow as the expensive ones.
//
// The queue is memory-AWARE, not merely serial. In the 2026-08-19 run the
// machine hit 2.8% free and took all four provider renderers plus this process
// with it. A queue that keeps draining under that pressure does not prevent the
// OOM, it schedules one — so admission is gated on real free memory using
// autopilot's own thresholds.
const _llmQueue = require('../lib/work-queue').get('copilot.llm', {
  concurrency: 1,      // matches ollama's MAX_CONCURRENT, now also 1
  maxDepth: 25,
  timeoutMs: 180000,   // a hung generation must not hold the only slot forever
});

/**
 * resolveDefaultBackend(provider) — 0.39.258. Maps copilot's default provider to the { backend, agent } an explicit
 * /api/prompt call takes. 'auto' is lifeline's cascade, which starts at Ollama and escalates to guardian only on
 * low confidence; a composed caller gets its first tier (ollama) and is told the escalation is not applied.
 */
function resolveDefaultBackend(provider) {
  const p = String(provider || 'auto');
  if (p === 'ollama') return { provider: p, backend: 'ollama', agent: null };
  if (p === 'guardian') return { provider: p, backend: 'guardian', agent: null, note: 'guardian picks the agent (RAID)' };
  if (p === 'auto' || p === 'copilot') return { provider: p, backend: 'ollama', agent: null,
    note: 'copilot default is auto: ollama first; lifeline\'s low-confidence escalation to guardian does not apply to a composed prompt' };
  return { provider: p, backend: 'guardian', agent: p };
}

async function _dispatchToOllama(prompt, context, opts = {}) {
  return _llmQueue.push(() => _dispatchToOllamaNow(prompt, context, opts),
    `ollama:${opts.intent || 'ask'}:${(opts.requestId || '').slice(0, 8)}`,
    { priority: opts.priority });
}

async function _dispatchToOllamaNow(prompt, context, opts = {}) {
  return _post(`${OL_URL}/api/jobs`, {
    // 0.39.258 — opts.raw: a composed prompt goes to the model as it stands (no SYSTEM CONTEXT / USER / NEXUS CO-PILOT frame)
    prompt:      opts.raw ? String(prompt) : `SYSTEM CONTEXT:\n${context}\n\nUSER: ${prompt}\nNEXUS CO-PILOT: `,
    // §BUGFIX 2026-07-04: was hardcoded to 'mistral:7b' (ollama-bridge's
    // FALLBACK_MODEL) instead of leaving it unset so ollama-bridge's real
    // DEFAULT_MODEL (qwen2.5-coder:7b, what the CLI tells users to pull)
    // applies. See lifeline.js's matching fix for the full explanation.
    ...(opts.model ? { model: opts.model } : {}),
    intent:      opts.intent || 'ask',
    componentId: 'copilot.prompt',
    hookId:      'copilot.prompt.to-ollama',
    requestId:   opts.requestId,
    sessionId:   opts.sessionId,
    contractId:  'nexus-interaction-contract-v1::copilot',
    stream:      opts.stream || false,
    ...(opts.priority ? { priority: opts.priority } : {}),
  });
}

// ── Sessions ──────────────────────────────────────────────────────────────────
const _sessions = new Map();

// §FIXED 2026-08-17 — James, direct, several turns ago: "starts to
// plummet in ram after asking a question." Confirmed real, severe cause:
// sessionId falls back to crypto.randomUUID() (twice — once at the
// /api/prompt/stream call site, again inside _getSession itself) whenever
// a caller doesn't pass one, and nothing anywhere in this file ever
// deleted a _sessions entry (grepped, confirmed zero .delete()/.clear()
// calls existed). If a client doesn't consistently thread a real session
// id through, every single question creates a brand-new, permanently-
// retained Map entry — the exact real shape of "RAM grows with every
// question," not a guess.
//
// Same real pattern already built and verified this session for
// guardian/lib/ncp.js's isConnected() staleness fix: a real staleness
// check plus a periodic sweep. 30 minutes of inactivity is the real
// threshold — long enough that a genuinely ongoing conversation is never
// evicted mid-use, short enough that an abandoned/orphaned session
// doesn't sit in memory indefinitely.
const SESSION_STALE_MS = config.SESSION_STALE_MS;
const _sessionSweep = setInterval(() => {
  const now = Date.now();
  let evicted = 0;
  for (const [id, s] of _sessions) {
    if (now - s.lastActive > SESSION_STALE_MS) { _sessions.delete(id); evicted++; }
  }
  if (evicted) console.log(`[copilot] session sweep: evicted ${evicted} stale session(s), ${_sessions.size} remain`);
}, 5 * 60 * 1000);
if (_sessionSweep.unref) _sessionSweep.unref(); // never keeps the process alive on its own

function _getSession(sessionId, channel, prompt) {
  if (!sessionId) sessionId = crypto.randomUUID();
  if (!_sessions.has(sessionId)) {
    _sessions.set(sessionId, { sessionId, channel, exchanges: 0,
      startedAt: Date.now(), lastActive: Date.now(), lastPrompt: null,
      // §INTROSPECT-RETRY 2026-08-19 — added for the same reason lastPrompt was:
      // _introspectRetry needs the previous ANSWER to examine, and the session
      // only ever kept the previous prompt. Declared here rather than read off a
      // record that never had it (§1.1) — the mistake the note below describes.
      lastResponse: null, lastRequestId: null, lastIntent: null });
  }
  const s = _sessions.get(sessionId);
  s.lastActive = Date.now();
  s.channel = channel || s.channel;
  // §2026-08-13 — recorded so GET /api/context/:sessionId can assemble a
  // snapshot for THIS session's actual intent rather than an empty one. Added
  // because the new route referenced a lastPrompt field that did not exist:
  // rather than read a field off a record that never had it (§1.1), the field
  // is made real at the one place every prompt path already passes through.
  if (typeof prompt === 'string' && prompt) s.lastPrompt = prompt;
  return s;
}

/**
 * _recordResponse(sessionId, text, meta) — close the loop on an exchange.
 *
 * §INTROSPECT-RETRY 2026-08-19 — without this the session remembered what was
 * ASKED but never what was ANSWERED, so "try again" had nothing to examine.
 * Called wherever a response is finalised; missing one call site degrades to
 * "no prior turn" rather than to a wrong diagnosis, which is the right
 * failure direction.
 */
function _recordResponse(sessionId, text, meta = {}) {
  try {
    const s = _sessions.get(sessionId);
    if (!s) return;
    s.lastResponse  = typeof text === 'string' ? text : null;
    s.lastRequestId = meta.requestId || s.lastRequestId;
    s.lastIntent    = meta.intent || s.lastIntent;
    s.lastAnsweredAt = Date.now();
  } catch (_) { /* §1.2 never breaks the response */ }
  return s;
}

// ── Write to Cortex ───────────────────────────────────────────────────────────
async function _persist(table, row) {
  try { await _post(`${CX_URL}/api/memory/insert`, { table, row }); } catch(_) {}
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────
const _sseClients = new Set();
function broadcast(type, payload) {
  const ts = Date.now();
  const msg = `data: ${JSON.stringify({ type, payload, ts })}\n\n`;
  for (const c of _sseClients) { try { c.write(msg); } catch(_) { _sseClients.delete(c); } }

  // §LEDGER-WIRE 2026-08-17 — THE FINDING: copilot was not among the 22 files
  // that call lib/component-ledger.write(). It broadcast 20+ real event types
  // here — prompt.received, lifeline.escalated, context.assembled,
  // fulfillment.attempt, build.complete — and every one of them died at the
  // edge of this Set. None reached the ledger tree, event_log, error_log, or
  // the pattern engine. That is the literal, mechanical reason co-pilot
  // activity is invisible in autopilot, and the reason intelligence's meta-scan
  // reports so few sources: it can only learn from systems that write.
  //
  // Now every broadcast is ALSO a ledger row. The SSE above is untouched, so
  // the UI sees exactly what it saw before (§5.14 zero behaviour change).
  // §1.2 — telemetry is never in the critical path: a ledger failure here can
  // never break a co-pilot response.
  try {
    const parts     = String(type).split('.');
    const action    = parts.length > 1 ? parts[parts.length - 1] : type;
    const component = parts.length > 1 ? parts.slice(0, -1).join('.') : 'copilot';
    require('../lib/component-ledger').write({
      system: 'copilot', component, action,
      status: /error|fail|denied|escalat|reject/.test(action) ? 'error' : 'info',
      detail: payload || null,
      causedBy: (payload && payload.causedBy) || null,
      session:  (payload && payload.sessionId) || null,
      // hook/wire stay null — never derived. A fabricated hook would read as
      // evidence, which is worse than an absent one (component-ledger §schema).
      hook: null, wire: null,
      intent: (payload && payload.intent) || null,
      tags: ['copilot', 'sse'],
    });
  } catch (_) { /* §1.2 — never breaks the response path */ }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'*',
    'Access-Control-Allow-Headers':'Content-Type,X-Session-Id' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  return new Promise((res,rej) => {
    let d=''; req.on('data',c=>d+=c);
    req.on('end',()=>{try{res(JSON.parse(d));}catch(_){res({});}});
    req.on('error',rej);
  });
}

// ── §P112: SSE streaming helpers ──────────────────────────────────────────────
function sseHeaders(res) {
  res.writeHead(200, {
    'Content-Type':                'text/event-stream',
    'Cache-Control':               'no-cache',
    'Connection':                  'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Session-Id',
    'X-Accel-Buffering':           'no',
  });
}

function sseSend(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch(_) {}
}

// Poll Ollama job and stream token chunks to SSE response
// §PHASEMAP P1 — headless job poll for the tool-loop (no SSE res coupling).
// runToolLoop needs a plain (jobRef) => { text, toolCalls } resolver; the
// streaming poll above is tied to an HTTP res. Same /api/jobs/:id status shape,
// no streaming side-effects. Carries tool_calls through if ollama returns them.
// §0.39.289 — was a fixed 90 s: the bridge now streams a local generation (idle timeout, 10-minute total cap) and
// continues a cut reply, so a long file took longer than this wait and was handed back half-written. The wait follows
// the bridge's own cap (it fails the job itself on an idle model — this loop is not the timeout anymore).
const OLLAMA_JOB_MAX_WAIT_S = parseInt(process.env.COPILOT_OLLAMA_MAX_WAIT_S || '660', 10);
// §0.39.356 LS2 — opts.onPartial({ jobId, model, delta, fullLen, thinkingLen }): what the model wrote since the last poll
// (the bridge's job.partial, LS1), every 500 ms while it writes — the caller shows the model writing. Without it, as before.
async function _pollOllamaJobHeadless(jobRef, opts = {}) {
  const jobId = jobRef?.jobId || jobRef;
  if (!jobId) return { text: '', toolCalls: null };
  const MAX_WAIT = OLLAMA_JOB_MAX_WAIT_S;
  const onPartial = typeof opts.onPartial === 'function' ? opts.onPartial : null;
  const step = onPartial ? 500 : 1000;
  let lastText = '', sent = 0;
  for (let i = 0; i < MAX_WAIT * 1000 / step; i++) {
    await new Promise(r => setTimeout(r, step));
    try {
      const status = await _fetch(`${OL_URL}/api/jobs/${jobId}`, { timeout: 3000 });
      const job = status?.job;
      if (!job) continue;
      if (onPartial && typeof job.partial === 'string') {
        const full = (job.partialDropped || 0) + job.partial.length;
        if (full > sent) {
          const delta = job.partial.slice(Math.max(0, job.partial.length - (full - sent)));
          sent = full;
          try { onPartial({ jobId, model: job.model || null, delta, fullLen: full, thinkingLen: (job.partialThinking || '').length }); } catch (_) {}
        }
      }
      if (job.result && job.result.length > lastText.length) lastText = job.result;
      if (job.status === 'complete') {
        return { text: job.result || lastText, modelUsed: job.model || 'ollama',
          toolCalls: job.tool_calls || job.toolCalls || null };
      }
      if (job.status === 'failed') return { text: lastText, modelUsed: 'ollama', failed: true, toolCalls: null };
    } catch (_) {}
  }
  return { text: lastText, modelUsed: 'ollama', timedOut: true, toolCalls: null };
}

// §0.39.356 LS2 — a poll that tells the sink each turn's start, its text as it grows, and its end
function _streamingPoll(sink) {
  return async (jobRef) => {
    const jobId = jobRef?.jobId || jobRef;
    sink({ event: 'dispatched', jobId, generating: true });
    let model = null;
    const r = await _pollOllamaJobHeadless(jobRef, { onPartial: (p) => { model = p.model || model; sink({ event: 'chunk', jobId, model, text: p.delta, fullLen: p.fullLen, generating: true }); } });
    sink({ event: r.failed ? 'error' : r.timedOut ? 'timeout' : 'complete', jobId, model: r.modelUsed && r.modelUsed !== 'ollama' ? r.modelUsed : model, chars: (r.text || '').length, generating: false });
    return r;
  };
}

async function _streamOllamaJob(jobId, res, sessionId) {
  let lastText = '';
  const MAX_WAIT = OLLAMA_JOB_MAX_WAIT_S; // seconds (§0.39.289 — was 90)
  for (let i = 0; i < MAX_WAIT; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const status = await _fetch(`${OL_URL}/api/jobs/${jobId}`, { timeout: 3000 });
      const job = status?.job;
      if (!job) continue;

      // Stream any new text as a delta chunk
      if (job.result && job.result.length > lastText.length) {
        const delta = job.result.slice(lastText.length);
        lastText = job.result;
        sseSend(res, 'chunk', { delta, total: lastText.length });
      }

      if (job.status === 'complete') {
        return { text: job.result || lastText, modelUsed: job.model || 'ollama', done: true };
      }
      if (job.status === 'failed') {
        return { text: lastText, modelUsed: 'ollama', done: true, failed: true };
      }
    } catch(_) {}
  }
  return { text: lastText, modelUsed: 'ollama', done: true, timedOut: true };
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const p      = url.pathname;

  if (method === 'OPTIONS') { json(res, 200, {}); return; }

  // §LEDGER-WIRE 2026-08-17 — the CANONICAL ledger stream, in component-ledger
  // schema, for machine consumers (autopilot, intelligence, diagnostic).
  // /events below stays exactly as it is: it is the UI's stream, a different
  // shape for a different reader, and nothing that works today changes (§5.14).
  //
  // THE DEFECT THIS CLOSES — lib/ledger-fanin holds subscribers in module-level
  // state, so it is per-PROCESS. Copilot runs as its own `node copilot/server.js`
  // under autopilot's supervisor, which is why autopilot's boot line has always
  // read `(deferred: intelligence,copilot)` and always would have: "co-pilot
  // subscribes at its own boot" meant subscribing to a DIFFERENT array in a
  // DIFFERENT process. No copilot event could ever reach autopilot. This is the
  // wire that lets it.
  if (p === '/ledger/stream') {
    try { return require('../lib/ledger-sse').mount(res, { system: 'copilot' }); }
    catch (e) { json(res, 503, { ok: false, error: `ledger stream unavailable: ${e.message}` }); return; }
  }

  // SSE — event stream for UI
  if (p === '/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache',
      'Connection':'keep-alive', 'Access-Control-Allow-Origin':'*' });
    res.write(`data: ${JSON.stringify({ type:'copilot.connected', streamDepth: _stream.length })}\n\n`);
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
    return;
  }

  // ── PERSON MODEL ────────────────────────────────────────────────────────
  // §2026-08-17 — the co-pilot's model of the USER (distinct from
  // copilot/lib/self-model.js, which is the co-pilot's model of ITSELF).
  //
  // The read surface is the point: a model of a person is only trustworthy if
  // the person can see all of it and change any of it. Every payload here
  // carries provenance (stated/observed/inferred) and lens COVERAGE, so a
  // partial reading can never be mistaken for a complete one (§LN-7).
  // §WIRED 2026-08-23 — James: "agent mesh needs to connect to the
  // agent system for co-pilot. like when you want to switch agents
  // in co-pilot." Real, previously-missing HTTP surface for self-
  // model.js's getCurrentAgent/switchAgent — those already existed
  // and were already used internally for chat-message "switch to X"
  // detection, but no external client (clear-glass's Agent Mesh
  // panel, a separate real process) could reach them directly.
  //
  // §BL27 2026-08-23 — real, first consolidation piece: current agent
  // + hats together in one call. hat-forge.js already lives in the
  // same real process as self-model.js — no cross-process bridge
  // needed for this part (unlike accounts, which live in clear-glass).
  if (p === '/api/agent/suite' && method === 'GET') {
    try {
      const sm = require('./lib/self-model.js');
      const hf = require('../lib/hat-forge.js');
      json(res, 200, { ok: true, current: sm.getCurrentAgent(), hats: hf.list() });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (p === '/api/agent/current' && method === 'GET') {
    try {
      const sm = require('./lib/self-model.js');
      json(res, 200, { ok: true, ...sm.getCurrentAgent() });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (p === '/api/agent/switch' && method === 'POST') {
    const body = await readBody(req);
    if (!body.agent) { json(res, 400, { ok: false, error: 'agent required' }); return; }
    try {
      const sm = require('./lib/self-model.js');
      const r = sm.switchAgent({ intent: 'directed', directed: body.agent, prompt: body.prompt || '' });
      // §BUGFIX 2026-08-27 — James, live, session-long theme: switchAgent()
      // is a pure local routing decision — it never confirmed the target's
      // tab was actually reachable before this. The natural-language
      // "switch to X" path (below, same file) already fixed this on
      // 2026-08-14 via verifyAgentReachable's real, cheap NCP round trip
      // (polls for 'acked', not a full generation) — this HTTP API
      // endpoint was the one caller that never got the same fix. Same
      // function, same pattern, applied here instead of reinvented.
      const reach = r && r.ok ? await sm.verifyAgentReachable(r.agent) : null;
      const reachNote = reach && !reach.reachable ? ` Heads up: ${r.agent}'s tab didn't ack within the timeout — ${reach.error} — the switch is set, but that agent may not actually be reachable right now.` : '';
      json(res, r && r.ok !== false ? 200 : 502, { ok: true, ...r, reachability: reach, note: reachNote || undefined });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // §DECOMPOSED 2026-08-28 — the full person_model.* cluster (12 routes)
  // moved to routes/person-model.js verbatim. See that file's header for
  // the §IP-5 user-only note and a flagged undocumented route found
  // during extraction (POST /api/person-model/correct has no
  // registry-components.js entry).
  if (await require('./routes/person-model.js').handle(req, res, { method, url, pathname: p, json, readBody })) return;
  // 0.39.272 — /api/opportunity/* (jobs, gigs, Fiverr/Upwork leads), /api/context/* (the context atlas), /api/learned/* (what copilot learned in Clear Glass)
  if (await require('./routes/opportunity.js').handle(req, res, { method, url, pathname: p, json, readBody })) return;

  if (p === '/contract') { json(res, 200, require('./registry-components')); return; }

  if (p === '/health') {
    json(res, 200, { ok:true, system:SYSTEM_ID, version:VERSION, port:PORT,
      streamDepth: _stream.length, sessions: _sessions.size,
      phases: { p73:'wired', p103:'wired', p110:'wired', p112:'wired' }, ts:Date.now() });
    return;
  }

  if (method === 'GET' && p === '/api/stream') {
    const n = parseInt(url.searchParams.get('n') || '50');
    json(res, 200, { ok:true, events: _stream.slice(-n), total: _stream.length });
    return;
  }

  // §GAP CLOSED 2026-07-07 — copilot's hook registry has declared
  // /api/axioms, /api/axioms/add and /api/axioms/remove as active since
  // it was written, while copilot/axiom-manager.js sat real, complete,
  // and unwired — zero references to "axioms" existed anywhere in this
  // file. Found by scripts/verify-wires.js, confirmed by hand. These
  // three routes were copilot's ONLY remaining gap against its own
  // registry (all 12 other checkable hooks verified real).
  if (method === 'GET' && p === '/api/axioms') {
    try {
      const am = require('./axiom-manager.js');
      const tier   = url.searchParams.get('tier')   || undefined;
      const status = url.searchParams.get('status') || undefined;
      const axioms = am.list({ tier, status });
      json(res, 200, { ok: true, count: axioms.length, axioms });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (method === 'POST' && p === '/api/axioms/add') {
    try {
      const am = require('./axiom-manager.js');
      const body = await readBody(req);
      if (!body.id || !body.text) { json(res, 400, { ok:false, error:'id and text required' }); return; }
      const result = am.add(body.id, body.text, { reason: body.reason, source: body.source || 'copilot-api', tier: body.tier || 'RUNTIME' });
      json(res, 200, { ok: true, axiom: result });
    } catch (e) {
      // axiom-manager throws real errors (duplicate id, immutable tier) —
      // surface them, never swallow into a false success.
      json(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (method === 'POST' && p === '/api/axioms/remove') {
    try {
      const am = require('./axiom-manager.js');
      const body = await readBody(req);
      if (!body.id) { json(res, 400, { ok:false, error:'id required' }); return; }
      // confirm defaults false — axiom-manager's own guard refuses an
      // unconfirmed removal. Not overridden here: a destructive call
      // should require an explicit confirm from the caller, not a default.
      const result = am.remove(body.id, { confirm: body.confirm === true });
      json(res, 200, { ok: true, removed: result });
    } catch (e) { json(res, 400, { ok: false, error: e.message }); }
    return;
  }

  if (method === 'GET' && p === '/api/sessions') {
    json(res, 200, { ok:true, sessions: [..._sessions.values()] });
    return;
  }

  // §BUILT 2026-08-13 — both of these were declared in copilot.spec and had no
  // handler: only the exact '/api/sessions' above was ever matched, so every
  // consumer of the contract believed in two routes that did not exist. The
  // work underneath them was already real — _sessions is live, and
  // copilot/lib/copilot-context.js assembles all 7 layers and is already
  // called on the prompt path (see §P73 below) — there was simply no way to
  // LOOK at either. These expose what already runs; they compute nothing new.
  if (method === 'GET' && p.startsWith('/api/sessions/')) {
    const sessionId = decodeURIComponent(p.slice('/api/sessions/'.length));
    const session = _sessions.get(sessionId);
    // §1.2 — an unknown session is a real 404, not an empty object that would
    // read as "a session with no activity".
    if (!session) {
      json(res, 404, { ok:false, error:`no session "${sessionId}"`, known: [..._sessions.keys()] });
      return;
    }
    // Recent exchanges come from cortex chat_log, as the spec described.
    // §CORRECTED 2026-08-13 — first written against the LOCAL jaaDB, which
    // returned [] every time: copilot does not write chat_log locally, it
    // persists over HTTP to cortex via _persist(). Read it the same way
    // _injectSessionHistory() already does, so this route and copilot's own
    // session continuity agree about where history lives (§16.5).
    //
    // Note chat_log has TWO writers with different shapes: copilot's rows
    // carry { sessionId, prompt, response }, while lib/chat-logger.js writes
    // { sessionId: <its own logger session>, role, content }. Only copilot's
    // rows can match a copilot sessionId, which is why no shape translation
    // is attempted here — rows that don't match simply aren't this session's.
    let exchanges = [];
    try {
      const mem = await _fetch(
        `${CX_URL}/api/memory?table=chat_log&n=200&sessionId=${encodeURIComponent(sessionId)}`,
        { timeout: 2000 }
      );
      exchanges = (mem?.rows || []).slice(-25);
    } catch (e) {
      // §1.2 — report the failure. An empty array here would be
      // indistinguishable from a session that genuinely said nothing.
      json(res, 200, { ok:true, session, exchanges: null, exchangesError: `cortex unreachable: ${e.message}` });
      return;
    }
    json(res, 200, { ok:true, session, exchanges, exchangeCount: exchanges.length });
    return;
  }


  if (method === 'GET' && p.startsWith('/api/context/')) {
    const sessionId = decodeURIComponent(p.slice('/api/context/'.length));
    const cc = _getCopilotContext();
    if (!cc) { json(res, 503, { ok:false, error:'copilot-context module not loadable' }); return; }
    try {
      const session = _sessions.get(sessionId) || null;
      const snap = await cc.assemble({ eventBuffer: _stream, intent: (session && session.lastPrompt) || '' });
      json(res, 200, {
        ok: true, sessionId,
        sessionKnown: !!session,   // honest: a snapshot for an unknown session
                                   // is still a real system snapshot, but the
                                   // caller must know it isn't session-specific
        layerCount: Object.keys(snap.layers).length,
        tokensUsed: snap.tokensUsed,
        layers: snap.layers,
        text: snap.text,
      });
    } catch (e) { json(res, 500, { ok:false, error:e.message }); }
    return;
  }

  if (method === 'POST' && p === '/api/diagnose') {
    const body = await readBody(req);
    const result = await _rDiagnose.start(body.topic || 'system health', { requestId: body.requestId });
    json(res, 200, result);
    return;
  }

  if (method === 'GET' && p === '/api/diagnose/list') {
    json(res, 200, { ok:true, sessions: _rDiagnose.list() });
    return;
  }

  if (method === 'GET' && p === '/api/lifeline/health') {
    const h = await _lifeline.health();
    json(res, 200, { ok:true, ...h });
    return;
  }

  // §NEW 2026-07-11 — copilot only ever PULLED events (subscribing out to
  // Guardian/Cortex SSE streams via _connectGuardianStream/
  // _connectCortexStream). No system without its own SSE server could
  // ever push an event into copilot's stream/bus — which is exactly
  // Emerge's situation (a compiler library, not a service, confirmed:
  // no http.createServer anywhere under emerge/). Rather than build a
  // whole SSE server just for Emerge's consumer to report
  // accept/complete/fail, this is the general missing counterpart: any
  // system can POST a well-formed event here and it reaches the same
  // streamIngest() pull-based events already do — same ring buffer, same
  // expectation-watcher, same /sse broadcast.
  if (method === 'POST' && p === '/api/event') {
    const body = await readBody(req);
    if (!body?.type) { json(res, 400, { ok:false, error:'event.type required' }); return; }
    streamIngest({ ...body, ts: body.ts || Date.now() });
    json(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && p === '/api/build') {
    const body      = await readBody(req);
    const sessionId = body.sessionId || req.headers['x-session-id'];
    if (!body.description) { json(res, 400, { ok:false, error:'description required' }); return; }
    broadcast('copilot.build.started', { description: body.description.slice(0,100) });
    _modBuilder.build(body.description, { requestId: body.requestId, sessionId, skipGaps: body.skipGaps })
      .then(result => {
        broadcast('copilot.build.complete', { ok: result.ok, passed: result.passed });
        // §NEW 2026-07-11 — the real trigger for the
        // 'module-build-dispatched-then-accepted' expectation (see
        // expectation-watcher.js's own comment on it). module-builder.js's
        // build() only calls cq.dispatch() — which just writes a file —
        // when result.passed is true; this is that dispatch, now made
        // observable to the expectation watcher instead of invisible to
        // everything except the filesystem. If Emerge ever gets a real
        // consumer that calls cq.accept()/cq.complete() and emits a
        // matching event, this expectation is exactly what will confirm
        // it actually closed the loop — until then, it's the thing that
        // keeps saying, correctly, that it hasn't.
        if (result.passed && result.contract) {
          try {
            _copilotBus.emit('emerge.contract.dispatched', {
              type: 'emerge.contract.dispatched',
              payload: { contractUuid: result.contract, moduleName: result.plan?.name, requestId: result.requestId },
              ts: Date.now(),
            });
            _copilotBus.emit('*', {
              type: 'emerge.contract.dispatched',
              payload: { contractUuid: result.contract, moduleName: result.plan?.name, requestId: result.requestId },
              ts: Date.now(),
            });
          } catch (e) { console.warn('[copilot] failed to emit emerge.contract.dispatched:', e.message); }
        }
        json(res, 200, result);
      })
      .catch(e => json(res, 500, { ok:false, error: e.message }));
    return;
  }

  // ── §P112: POST /api/prompt/stream — SSE streaming response ─────────────────
  if (method === 'POST' && p === '/api/prompt/stream') {
    const body      = await readBody(req);
    const prompt    = body.prompt || '';
    const channel   = body.channel || 'unknown';
    const sessionId = body.sessionId || req.headers['x-session-id'] || crypto.randomUUID();
    const requestId = crypto.randomUUID();
    let requestGrammar = null;   // §P5 — what the grammar engine resolved this prompt to (if anything)
    const session   = _getSession(sessionId, channel, prompt);
    session.exchanges++;

    if (!prompt) { json(res, 400, { ok:false, error:'prompt required' }); return; }

    // §BUILT 2026-08-18c — James: "when 'hey nexus' is used, it
    // establishes a handshake connection... highest priority... handshake
    // decays after 30 seconds of inactivity." Real, honest scope: a real
    // elevated-priority session state, checked and refreshed on every
    // real message, decaying via the same real staleness pattern already
    // proven this session (a timestamp check, not a background sweep —
    // handshake state only matters at the moment someone is actually
    // talking, so checking on arrival is the real, correct trigger, not
    // an interval that would fire even with nobody there).
    const HANDSHAKE_DECAY_MS = 30_000;
    const isWakePhrase = /\bhey\s+nexus\b/i.test(prompt);
    if (isWakePhrase) {
      session.handshake = { establishedAt: Date.now(), lastActive: Date.now(), priority: 'highest' };
    } else if (session.handshake) {
      if (Date.now() - session.handshake.lastActive > HANDSHAKE_DECAY_MS) {
        session.handshake = null; // real, honest decay — not silently kept alive past its real window
      } else {
        session.handshake.lastActive = Date.now(); // real activity within the window — refresh, don't reset the clock to a new handshake
      }
    }

    // §BUILT 2026-08-18d — James, clarifying the SSE-injection trigger
    // directly: "when hey nexus is used. Or I give a task to co-pilot.
    // Like if I tell it to create a feedback loop." Real, reused signal,
    // not invented: lib/intent-classifier.js's own real verb-match
    // confidence (0.85 for a genuine matched verb like build/diagnose/
    // create, vs 0.3 for 'unknown') is exactly "is this a real task,"
    // already computed by an existing, tested system — §16.5, delete
    // before you add, applies to not building a second classifier too.
    let isRealTask = false;
    let _detectedVerb = 'unknown';
    try {
      const ic = require('../lib/intent-classifier.js');
      const { intent } = ic.classify(prompt);
      _detectedVerb = intent.verb;
      // §FIXED, found by testing before shipping: intent.confidence is a
      // harmonic mean of domain-confidence AND verb-confidence — not a
      // flat "was a real verb matched" signal. Comparing it to 0.85
      // incorrectly rejected a genuinely, correctly-matched verb
      // ('diagnose' composite-scored 0.824 despite a real pattern match).
      // The real, precise signal was already right there: verb !==
      // 'unknown' IS what a genuine pattern match looks like, confirmed
      // by reading _classifyVerb's own real fallback (verb:'unknown' only
      // when nothing matched) — no confidence math needed on top of it.
      isRealTask = intent.verb !== 'unknown';
    } catch (_) { /* classifier unreachable — real, honest fail-open: no injection rather than a guess, §1.2 */ }

    // §FIXED — James's own literal example ("create a feedback loop")
    // wasn't caught by the shared classifier at all (verb:unknown; "create"
    // alone isn't a matched pattern there). Tried widening the SHARED
    // classifier's own "build" pattern to bare "create" first — reverted
    // immediately after testing found a real, serious over-match ("i will
    // create some time for this" incorrectly tagged FORGE-risk on a
    // system-wide, other-callers-depend-on-it classifier). This is the
    // safer fix per §16.6 (the architecture decides, a local convenience
    // never outranks a shared invariant): a real, LOCAL, narrow check
    // scoped only to this one feature, bounded to known real, buildable
    // nouns — "create a feedback loop" matches, "create some time" was
    // never at risk since "time" was never in this list.
    if (!isRealTask) {
      isRealTask = /\b(create|build|make)\s+(a|an|the|some)?\s*\w*\s*(feedback\s*loop|pipeline|compartment|tool|agent|system|component|contract|hat)\b/i.test(prompt);
      if (isRealTask) _detectedVerb = 'create';
    }

    // §BUILT 2026-08-18d — real live NEXUS context, reusing the existing,
    // already-bounded _stream ring buffer (the actual, real "NEXUS live
    // event stream" — not a new one). Injected as real, ongoing context
    // into whichever agent is currently wearing the co-pilot hat,
    // whether that's ollama (below) or a guardian-dispatched agent
    // (copilot/lifeline.js's escalation path) — co-pilot is a real,
    // swappable hat now, so this must reach both real dispatch paths,
    // not just one.
    const injectLiveContext = !!(session.handshake || isRealTask);
    let liveNexusContext = '';
    if (injectLiveContext) {
      const recent = _stream.slice(-15).map(e => `[${new Date(e.ingestedAt || Date.now()).toISOString()}] ${e.type || 'event'}: ${JSON.stringify(e.payload || e).slice(0, 150)}`).join('\n');
      liveNexusContext = recent
        ? `\n\n=== LIVE NEXUS CONTEXT (${session.handshake ? 'hey-nexus handshake active' : 'real task detected'}) ===\n${recent}\n=== END LIVE CONTEXT ===`
        : '';
      // §13.1 — every real injection decision is logged with its own
      // real trigger reason, not silent.
      console.log(`[copilot] live NEXUS context injected — reason: ${session.handshake ? 'handshake' : 'task:' + _detectedVerb}, events: ${_stream.slice(-15).length}`);
    }

    // confirmation reply ("yes", "do it") shouldn't be treated as a fresh
    // question and routed through the normal model dispatch.
    if (session.pendingConfirmation) {
      const pending = session.pendingConfirmation;
      session.pendingConfirmation = null; // real, one-shot — cleared regardless of the answer, never re-asked stale
      sseHeaders(res);
      sseSend(res, 'start', { requestId, sessionId });
      if (/^\s*(yes|confirm|do it|go ahead|approved?)\b/i.test(prompt)) {
        try {
          const agentToolsForExec = require('../lib/agent-tools/index.js');
          const toolResult = await agentToolsForExec.executeTool(pending.name, pending.args, { source: 'copilot-chat-confirmed', agent: pending.modelUsed });
          sseSend(res, 'tool_call', { name: pending.name, args: pending.args, result: toolResult, wasConfirmed: true });
          sseSend(res, 'chunk', { delta: 'Confirmed — promoted.', total: 20 });
        } catch (e) {
          sseSend(res, 'chunk', { delta: `Confirmed, but the real promote failed: ${e.message}`, total: 40 });
        }
      } else {
        sseSend(res, 'chunk', { delta: 'Not confirmed — the proposed change was not promoted.', total: 50 });
      }
      sseSend(res, 'done', { requestId, sessionId, modelUsed: 'confirmation-gate' });
      res.end();
      return;
    }

    sseHeaders(res);
    sseSend(res, 'start', { requestId, sessionId });

    // Fast path — intuition (no model needed)
    const intuition = await _intuition.answer(prompt, session, _stream);
    if (intuition?.text) {
      sseSend(res, 'chunk', { delta: intuition.text, total: intuition.text.length });
      sseSend(res, 'done', { requestId, sessionId, modelUsed: intuition.modelUsed,
        intent: intuition.intent, source: intuition.source });
      res.end();
      await _persist('chat_log', { uuid: crypto.randomUUID(), requestId, sessionId,
        prompt: prompt.slice(0,500), response: intuition.text, modelUsed: intuition.modelUsed,
        intent: intuition.intent, channel, componentId:'copilot.prompt', hookId:'copilot.prompt.reply',
        contextLayers: 1, fromStream: true, ts: Date.now() });
      return;
    }

    // §P73: 7-layer context assembly via copilot-context
    let contextText = '';
    const cc = _getCopilotContext();
    if (cc) {
      try {
        const snap = await cc.assemble({ eventBuffer: _stream, intent: prompt });
        contextText = snap.text;
        sseSend(res, 'context', { layers: Object.keys(snap.layers).length, tokens: snap.tokensUsed });
      } catch(e) {
        contextText = await _analysis.assembleContext(prompt, _stream, session);
      }
    } else {
      contextText = await _analysis.assembleContext(prompt, _stream, session);
    }

    // §P103: inject session history on first exchange
    contextText = _injectUserModel(contextText);   // §UM2 — know the user on every path
    _captureUserSignals(prompt, channel);   // §UM3 — richer capture
    contextText = await _injectSessionHistory(session, contextText);
    // §BUILT 2026-07-13 — chunk_2: associative recall, every exchange (not
    // just session-start), best-effort, never blocks.
    contextText = await _injectRecallContext(prompt, contextText);

    // §ADDED 2026-07-07 — persona support. A `persona` param (defaults to
    // 'default') selects a real personality profile (cortex/personas.js)
    // whose systemPrompt prepends the assembled context, shaping tone,
    // tool bias, and default intent. Never fails the request — an unknown
    // persona name falls back to the built-in default inside get().
    // §SOVEREIGNTY 2026-07-09 — this used to
    // require('../cortex/personas.js') + require('../cortex/memory/jaa-db.js'),
    // reaching straight into another sovereign system's filesystem. I wrote
    // that; it was hardwiring. Copilot now asks cortex over its API through
    // lib/nexus-client, which resolves 'cortex' from config. Cortex is
    // swappable again, and copilot no longer opens cortex's database.
    try {
      const nx = require('../lib/nexus-client');
      const r = await nx.get('cortex', `/api/personas?name=${encodeURIComponent(body.persona || 'default')}`, { timeout: 2500 });
      const persona = r?.persona;
      if (persona?.systemPrompt) {
        contextText = `${persona.systemPrompt}\n\n${contextText}`;
      }
    } catch (_) { /* personas optional — never block a real answer over profile lookup */ }

    // §P110: query Cortex MASTERMIND for causal context before model call
    const mastermind = await _queryCortexMastermind(prompt, contextText.slice(0, 500), sessionId);
    if (mastermind?.analysis) {
      contextText += `\n\n=== CORTEX MASTERMIND ===\n${mastermind.analysis.slice(0, 400)}`;
    }

    // §BUILT 2026-08-18 — James: "it is supposed to be co-pilot." Real
    // tool access as the actual default for the main chat path, not a
    // separate, hidden endpoint (/api/prompt/tools existed but nothing
    // in the visible chat UI ever reached it — confirmed by grep, zero
    // hits). Same real, proven manifest+detection pattern already built
    // and tested for guardian's escalation path (guardian/ask.js) — not
    // reinvented. The live SSE token stream itself is completely
    // untouched: the model's real output (including a TOOL_CALL line, if
    // it writes one) streams exactly as before; detection happens AFTER
    // _streamOllamaJob resolves with the full real text, as a real,
    // additional step, not a change to the streaming mechanism.
    // §BUILT 2026-08-18b — James: "i do [want self_repair available].
    // maybe with a confirmation." Added to the default set, but with a
    // real gate: only self_repair's "promote" action (the actual live
    // file write) requires confirmation. "propose" and "test" are
    // sandboxed/compartment-scoped already — real risk, but contained —
    // so they execute freely, matching this session's own established
    // reasoning for why compartment work doesn't need the same gate as
    // a live write.
    // §UPDATED 2026-08-22 — James: "did you update the tool index? and
    // model of co-pilot so it is aware of its new capa[bilities]". Checked
    // directly rather than assuming: tool_index was already fine (every
    // registered tool is auto-recorded there via registerTool itself,
    // confirmed live — 67 entries, agent_chat/tool_config/self_repair all
    // present). This list was the real, genuine gap: agent_chat (the
    // multi-round converse() capability) and tool_config (the governance
    // ratchet) were both fully registered and working, but copilot itself
    // had no way to reach for them in ordinary chat since they weren't in
    // its own default toolset. tool_config's own internal design already
    // gates its dangerous half (loosening always needs the user, regardless
    // of who calls it), so offering it here doesn't bypass that protection.
    const DEFAULT_CHAT_TOOLS = ['read_file', 'search_files', 'diagnose', 'system_priority', 'intent_hat', 'self_repair', 'agent_chat', 'tool_config', 'agent_notes', 'nexus_wake_events', 'framework_builder', 'intelligence_query', 'clear_glass_dom_archaeology', 'clear_glass_userscripts', 'clear_glass_tab_visibility', 'clear_glass_automation', 'clear_glass_browser',
      // 0.39.272 — James: "i want copilot completely aware of clearglass … all of it" / "so he can do everything clearglass
      // can do?". Every Clear Glass tool in the ordinary chat, plus the atlas, the opportunity pipeline and what it learned.
      // Cost, stated: the tool manifest in each chat prompt grows by these entries.
      'clearglass.browser.tool', 'clearglass.learned.tool', 'nexus.context.tool', 'nexus.opportunity.tool',
      'browser_action', 'macro', 'rewind_replay', 'agent_mesh_route', 'bookmarks_manage', 'history_manage', 'account_manage',
      'site_settings_manage', 'autofill_manage', 'clear_glass_provider_deploy', 'clear_glass_command_index',
      'clear_glass_stream_bridge', 'clearglass.search_engine.tool',
      // §0.59.3 — James: "can you make sure copilot has access to all of nexus". Every command a person has (idearium dump,
      // census, field, picks, repos, phases, versions, systems …) through the one command tool; the person-only rows
      // (approving, minting passwords, stopping a system) stay refused for an agent by the tool itself.
      'nexus.command.tool'];
    if (DEFAULT_CHAT_TOOLS.length) {
      const agentToolsForManifest = require('../lib/agent-tools/index.js');
      const manifest = DEFAULT_CHAT_TOOLS
        .map(name => agentToolsForManifest.TOOLS.get(name))
        .filter(Boolean)
        .map(t => {
          // §FIXED 2026-08-22 — James, live test: co-pilot fabricated
          // {"action":"list","lens":"agent_notes","query":"claude-copilot"}
          // for a tool whose real schema is {action, agent, kind, source,
          // relatesTo, supersedes} — because only a truncated description
          // was ever sent, never the real parameter names. This is that
          // fix, general to every tool here, not special-cased to one.
          const props = t.parameters?.properties || {};
          const fields = Object.entries(props)
            .map(([k, v]) => `${k}${v.enum ? `: ${v.enum.map(e => `"${e}"`).join('|')}` : v.type ? `: ${v.type}` : ''}`)
            .join(', ');
          return `- ${t.name}(${fields}): ${(t.description || '').split('\n')[0].slice(0, 140)}`;
        })
        .join('\n');
      if (manifest) {
        contextText += `\n\n---\nReal tools available. To use one, end your response with a single line, exactly: TOOL_CALL: {"name": "<tool_name>", "args": {...}}\n${manifest}\n---`;
      }
    }

    // §BUILT 2026-08-18d — real injection into ollama's real dispatch path.
    if (liveNexusContext) contextText += liveNexusContext;

    // §BUILT 2026-08-18e — James: "I want guardian agents to be swappable
    // as co-pilot." Real, critical, foundational gap found and fixed
    // here, not assumed already working: this handler never once
    // consulted the currently-worn agent — it always dispatched to
    // ollama regardless of what hat was worn. "Co-pilot is a hat" had
    // zero real effect on the actual dispatch before this fix. §3.1 —
    // the SSE-injection work above needs a real guardian dispatch path
    // to inject into; building that on a handler that never reaches
    // guardian would be building on something that doesn't exist yet.
    let currentAgentName = 'ollama';
    try { const sm = require('./lib/self-model.js'); currentAgentName = sm.getCurrentAgent().agent || 'ollama'; } catch (_) { /* self-model unreachable — real, honest fallback to ollama, never a guess at a different agent */ }

    if (currentAgentName !== 'ollama') {
      try {
        const lifeline = require('./lifeline.js');
        const guardianPrompt = liveNexusContext ? `${prompt}${liveNexusContext}` : prompt;
        const gResult = await lifeline.dispatchToNcpAgent(guardianPrompt, { provider: currentAgentName, requestId, sessionId });
        if (gResult?.text) {
          // §0.1 — guardian's response is not natively token-streamed; sent
          // as one real, honest chunk rather than faking a stream that
          // doesn't exist for this real dispatch path.
          sseSend(res, 'chunk', { delta: gResult.text, total: gResult.text.length });
          _recordResponse(sessionId, gResult.text, { requestId, intent: 'ask' });
          sseSend(res, 'done', { requestId, sessionId, modelUsed: gResult.provider || currentAgentName, contextLayers: 7, viaGuardian: true });
          res.end();
          await _persist('chat_log', { uuid: crypto.randomUUID(), requestId, sessionId,
            prompt: prompt.slice(0,500), response: gResult.text.slice(0,2000),
            modelUsed: gResult.provider || currentAgentName, intent: 'ask', channel,
            componentId:'copilot.prompt', hookId:'copilot.prompt.reply.guardian',
            contextLayers: 7, fromStream: true, ts: Date.now() });
          return;
        }
        // §1.2 — a real, failed guardian dispatch falls through to ollama
        // rather than dead-ending the request; logged, not silent.
        console.warn(`[copilot] guardian dispatch for hat-selected agent "${currentAgentName}" failed or returned no text — falling through to ollama`);
      } catch (e) {
        console.warn(`[copilot] guardian dispatch threw for agent "${currentAgentName}": ${e.message} — falling through to ollama`);
      }
    }

    // Dispatch to Ollama with stream flag
    try {
      const ollamaResult = await _dispatchToOllama(prompt, contextText, {
        intent: 'ask', requestId, sessionId, stream: true,
        priority: session.handshake ? session.handshake.priority : undefined });

      if (ollamaResult?.jobId) {
        const result = await _streamOllamaJob(ollamaResult.jobId, res, sessionId);

        // §BUILT 2026-08-18 — real detection, after the real stream
        // completes. Same safety discipline as guardian/ask.js: only
        // ever executes a tool that was genuinely in DEFAULT_CHAT_TOOLS,
        // malformed JSON or an unoffered tool name just falls through
        // silently to the normal done event below — never half-broken.
        let toolCall = null;
        let confirmationRequested = null;
        const toolMatch = (result.text || '').match(/TOOL_CALL:\s*(\{.*\})\s*$/s);
        if (toolMatch) {
          try {
            const req = JSON.parse(toolMatch[1]);
            if (req.name && DEFAULT_CHAT_TOOLS.includes(req.name)) {
              // §BUILT 2026-08-18b — the real confirmation gate: only
              // self_repair's promote action (a genuine live file write)
              // gets held. Every other tool, and self_repair's own
              // propose/test actions (sandboxed, compartment-scoped),
              // execute exactly as before — this is a narrow, specific
              // gate, not a blanket one.
              if (req.name === 'self_repair' && req.args?.action === 'promote') {
                session.pendingConfirmation = { name: req.name, args: req.args, modelUsed: result.modelUsed, ts: Date.now() };
                confirmationRequested = { name: req.name, targetFile: req.args?.targetFile, compartment: req.args?.name };
                sseSend(res, 'confirmation_required', confirmationRequested);
              } else {
                const agentToolsForExec = require('../lib/agent-tools/index.js');
                const toolResult = await agentToolsForExec.executeTool(req.name, req.args || {}, { source: 'copilot-chat', agent: result.modelUsed });
                toolCall = { name: req.name, args: req.args || {}, result: toolResult };
                sseSend(res, 'tool_call', toolCall);

                // §BUILT 2026-08-18 — James: "have co-pilot ask a follow up
                // when using tools." Real, tool-aware, not a flat generic
                // string — genuinely different per tool and what it
                // actually found, so the question is worth answering, not
                // boilerplate.
                const followUp = _generateToolFollowUp(req.name, req.args, toolResult);
                if (followUp) sseSend(res, 'follow_up', { text: followUp, forTool: req.name });
              }
            }
          } catch (_) { /* malformed TOOL_CALL — real, honest no-op, not a crash */ }
        }

        _recordResponse(sessionId, result.text, { requestId, intent: 'ask' });
        sseSend(res, 'done', { requestId, sessionId, modelUsed: result.modelUsed,
          contextLayers: 7, timedOut: result.timedOut || false, toolCall, confirmationRequested });
        res.end();
        await _persist('chat_log', { uuid: crypto.randomUUID(), requestId, sessionId,
          prompt: prompt.slice(0,500), response: result.text.slice(0,2000),
          modelUsed: result.modelUsed, intent: 'ask', channel,
          componentId:'copilot.prompt', hookId:'copilot.prompt.reply',
          contextLayers: 7, fromStream: true, ts: Date.now() });
      } else {
        sseSend(res, 'error', { error: 'Ollama job dispatch failed' });
        res.end();
      }
    } catch(e) {
      sseSend(res, 'error', { error: e.message });
      res.end();
    }
    return;
  }

  // ── §15.1-15.3: POST /api/prompt/fulfill — adaptive iteration ─────────────
  // Built 2026-06-29 against AXIOMS-v3.0.md Group 15. Routes through RAID,
  // classifies failures via the fault taxonomy, scores via reflection,
  // re-routes away from what just failed, learns across requests (RAID's
  // _weights persists between calls). dispatchFn here only knows how to
  // reach ollama — claude/chatgpt via Guardian's NCP is not wired. That
  // boundary is real and stated in the response, not papered over (§1.1).
  if (method === 'POST' && p === '/api/prompt/fulfill') {
    const body      = await readBody(req);
    const prompt    = body.prompt || '';
    const requestId = crypto.randomUUID();
    const events    = [];

    const dispatchFn = async (agent, promptText, ctx) => {
      if (agent === 'ollama') {
        const r = await _dispatchToOllama(promptText, '', { requestId, intent: 'ask' });
        if (!r?.ok) return { ok: false, error: r?.error || 'ollama dispatch failed', errorType: 'ollama_dispatch_failed' };
        const ollamaText = extractDispatchText(r);
        return { ok: true, output: ollamaText ?? `[unstructured ollama response — keys: ${Object.keys(r).join(', ')}]` };
      }
      if (agent === 'claude' || agent === 'chatgpt') {
        const provCheck = await _fetch(`${GD_URL}/providers`, { method: 'GET', timeout: 3000 }).catch(() => null);
        const connected = provCheck?.providers?.[agent]?.connected ?? provCheck?.[agent]?.connected;

        // §Phase-120 2026-06-29 — dual-sided handoff event. One row carrying
        // both sides' variables at the moment of crossing, not two separately-
        // correlated logs. traceToRoot() on a downstream failure now walks a
        // chain where every handoff link shows what RAID assumed vs what
        // guardian actually had — that gap is where bugs live.
        const handoffEvent = {
          type:    'handoff.copilot_to_guardian',
          causedBy: null, // wired by _emitUIEvent's lastEventId chain if called from UI
          from: {
            agent,
            cfrSigmaFloor: ctx?.cfrSigmaFloor ?? 0,
            cfrRegime:     ctx?.cfrRegime     ?? 'stable',
            requestId,
          },
          to: {
            connected:     !!connected,
            providerShape: provCheck ? (provCheck.providers ? 'nested' : 'flat') : 'unreachable',
          },
          ts: Date.now(),
        };
        _fetch(`${GD_URL}/api/guardian/cfr/event`, {
          method: 'POST', body: handoffEvent, timeout: 1000,
        }).catch(() => {}); // fire-and-forget, never block dispatch on telemetry

        if (!connected) {
          return { ok: false, error: `guardian reports '${agent}' not connected via NCP — handshake failed before dispatch`, errorType: 'ncp_not_connected' };
        }
        const dispatchRes = await _post(`${GD_URL}/command`, { provider: agent, prompt: promptText, source: 'copilot.fulfill' }, 10000).catch(e => ({ ok: false, error: e.message }));
        if (!dispatchRes?.ok) return { ok: false, error: dispatchRes?.error || 'guardian dispatch failed', errorType: 'guardian_dispatch_failed' };
        // §BUG FIXED 2026-07-11 — "the co-pilot in the tv-ui is showing json
        // strings." Root cause: `dispatchRes.result || dispatchRes.text ||
        // JSON.stringify(dispatchRes)` picks whichever is truthy first —
        // when guardian's /command returns `result` as an OBJECT (e.g.
        // `{text: "...", modelUsed: "..."}`) rather than a plain string,
        // that object wins the `||` chain and becomes `output` directly,
        // never reaching the JSON.stringify fallback. Every UI consumer
        // downstream (conversations.html, menu.js's CLI, spotlight) treats
        // `output`/`response` as a string — .slice(), template-literal
        // interpolation, textContent assignment. A few of those coerce an
        // object into "[object Object]"; others explicitly fall back to
        // JSON.stringify(x) when `.text` is missing, which is exactly
        // where the visible raw JSON came from. Fixed at the source
        // instead of chasing every consumer: extract the real text here,
        // once, so `output` is a guaranteed string no matter what shape
        // guardian's response takes.
        const resultText = extractDispatchText(dispatchRes);
        if (resultText === null) {
          // No plain-text field found anywhere in the response — this IS
          // worth surfacing as JSON (something is genuinely unstructured),
          // but tagged so it's diagnosable as a fallback, not mistaken for
          // a normal response.
          console.warn(`[copilot] guardian /command response had no string .result/.result.text/.text field — ${JSON.stringify(Object.keys(dispatchRes))}`);
        }
        return { ok: true, output: resultText ?? `[unstructured guardian response — keys: ${Object.keys(dispatchRes).join(', ')}]` };
      }
      return { ok: false, error: `agent '${agent}' has no dispatch path wired in this endpoint yet`, errorType: 'dispatch_not_wired' };
    };

    const { fulfill } = require('./adaptive-fulfillment');
    const outcome = await fulfill(prompt, dispatchFn, {
      maxAttempts: body.maxAttempts || 3,
      context: { cfrSigmaFloor: 0, cfrRegime: 'stable' },
      onAttempt: (rec) => {
        events.push(rec);
        broadcast('copilot.fulfillment.attempt', rec);
      },
    });

    // §WIRED 2026-08-12 (P2 of docs/copilot-full-capability-phasemap.spec) —
    // capability-extend.js is the TRUE last resort, only after fulfill()'s
    // own iteration budget is genuinely exhausted (outcome.ok === false),
    // never on a single attempt failing. shouldExtend() is not used here —
    // outcome.ok already IS that same "nothing worked" signal, one level up
    // (adaptive-fulfillment tried every agent RAID would route to; this is
    // the point past that, not a duplicate check). Never blocks or throws
    // over the response — best-effort, same as every other optional wire.
    if (!outcome.ok) {
      try {
        const { extendCapability } = require('./capability-extend');
        const ext = await extendCapability(prompt, { source: 'copilot.adaptive-fulfillment', reason: outcome.reason, requestId });
        outcome.capabilityGap = ext;
      } catch (e) { console.warn('[copilot] capability-extend not filed:', e.message); }
    }

    json(res, outcome.ok ? 200 : 502, { ...outcome, requestId, events });
    return;
  }

  // ── POST /bridge/deliver — Bridge :9999 routes requests here ────────────────
  // §2026-07-04: tv-shell and Clear Glass both go through Bridge → /bridge/deliver
  // Bridge sends: { request: { uuid, payload: { prompt, channel, sessionId, ... } } }
  if (method === 'POST' && p === '/bridge/deliver') {
    const body      = await readBody(req);
    const payload   = body.request?.payload || body.payload || body;
    const prompt    = payload.prompt || '';
    const channel   = payload.channel || 'bridge';
    const sessionId = payload.sessionId || req.headers['x-bridge-source'] || _newId();
    const requestId = body.request?.uuid || crypto.randomUUID();
    const session   = _getSession(sessionId, channel, prompt);
    session.exchanges++;

    if (!prompt) {
      json(res, 400, { ok:false, error:'payload.prompt required' });
      return;
    }

    broadcast('copilot.prompt.received', { prompt: prompt.slice(0,100), channel, sessionId, via: 'bridge' });

    // Full context assembly — same path as /api/prompt
    let contextText = '';
    try { contextText = await _analysis.assembleContext(prompt, _stream, session); } catch(_) {}
    contextText = _injectUserModel(contextText);   // §UM2 — know the user on every path
    _captureUserSignals(prompt, channel);   // §UM3 — richer capture
    contextText = await _injectSessionHistory(session, contextText);
    // §BUILT 2026-07-13 — chunk_2: associative recall, every exchange (not
    // just session-start), best-effort, never blocks.
    contextText = await _injectRecallContext(prompt, contextText);

    const mastermind = await _queryCortexMastermind(prompt, contextText.slice(0,500), sessionId);
    if (mastermind?.analysis) contextText += `\n\n=== CORTEX MASTERMIND ===\n${mastermind.analysis.slice(0,400)}`;

    // §PHASEMAP CA1 — if the user asks how the system/co-pilot is doing, answer
    // with a REAL status poll (health + gaps + loom wiring) instead of routing to
    // the LLM, which produced the canned "I don't have enough context" reply.
    try {
      const _status = require('./system-status');
      if (_status.isStatusQuery(prompt)) {
        // OB1 — a DEEP diagnostic query ("how is nexus doing", "diagnostics",
        // "what's wrong") gets the full live report; a light "how are you" gets
        // the status line.
        const wantsDeep = /\b(diagnostic|diagnose|what('?s| is) wrong|how is nexus (doing|running)|full status|deep|health check)\b/i.test(prompt);
        if (wantsDeep) {
          const rep = await require('./diagnostics').diagnoseText();
          return json(res, 200, { text: rep.text, model_used: 'nexus-diagnostics', confidence: 1, escalated: false, report: rep.report, requestId });
        }
        const rep = await _status.statusReport();
        return json(res, 200, { text: rep.text, model_used: 'nexus-status', confidence: 1, escalated: false, status: rep.status, requestId });
      }
    } catch (_) { /* status/diagnostic poll unavailable — fall through to the normal path */ }

    // §RAID-SOURCE 2026-08-29 — James: "hook... co-pilot system into
    // raid." Real, honest finding before building this: the '/build
    // <description>' text in clear-glass's own real textarea placeholder
    // (browser.html) had ZERO backend anywhere — checked directly,
    // cosmetic UI text implying a feature that didn't exist. This is
    // that real feature, built to match exactly what the placeholder
    // promises: a literal '/build ' prefix (not fuzzy natural-language
    // matching, unlike /diagnose above — a build request should be
    // unambiguous, not risk misfiring on ordinary conversation that
    // happens to mention building something).
    const buildMatch = prompt.match(/^\/build\s+(.+)/is);
    if (buildMatch) {
      const description = buildMatch[1].trim();
      try {
        const intake = require('../cortex/core/raid/contract-intake.js');
        const submitted = intake.submitContract({
          content: `${description}\n\nRead the relevant real code before proposing or making any change (bottom-up — no guessing at what exists). If you make a real, verified change, report SEAM VERDICT: PASS. If you cannot, report SEAM VERDICT: FAIL with your real findings.`,
          title: description.slice(0, 80),
        }, { source: 'copilot', intention: 'build' });
        return json(res, 200, {
          text: `Queued as a real contract (${submitted.queueId.slice(0, 8)}) — it'll be picked up and dispatched to a real agent. This doesn't run instantly; check RAID's queue for its real status.`,
          model_used: 'nexus-raid-contract', confidence: 1, escalated: false, requestId, queueId: submitted.queueId,
        });
      } catch (e) {
        return json(res, 200, { text: `Couldn't queue that as a real contract: ${e.message}`, model_used: 'nexus-raid-contract', confidence: 0, escalated: false, requestId });
      }
    }

    // §P5 DYNAMIC GRAMMAR — resolve the prompt through the registry grammar trie
    // FIRST. This understands ALL capabilities (and future ones) via loom's
    // registry, not hand-written regex. High-confidence → we know the exact
    // capability the user means (surfaced for routing/telemetry); low-confidence
    // → fall through to the specific intercepts + LLM below. §1.2 never blocks.
    try {
      const gr = require('./lib/grammar-router');
      const resolved = await gr.route(prompt, {});
      if (resolved && resolved.routed) {
        // Record what the grammar understood; the specific handlers below still
        // produce the answer. This makes co-pilot's understanding legible and is
        // the hook where a future turn dispatches directly to the capability.
        requestGrammar = resolved;
      }
    } catch (_) { /* grammar unavailable — fall through, never block */ }

    // §CONTAINER PANELS — structured queries the tablet's config/user_model/
    // controls panels consume via this same endpoint (decoupling law: the tablet
    // talks to co-pilot, never the modules directly). Non-fatal; fall through.
    try {
      // §P5 who-am-I / §P6 switch-agent — wired from the existing reflection +
      // constitutional-ai + agent-router modules via copilot/lib/self-model.
      if (/\b(who am i|what('?s| is) my name|what do you know about me|who do you think i am)\b/i.test(prompt)) {
        const sm = require('./lib/self-model');
        const who = sm.whoAmI({});
        return json(res, 200, { text: who.text, model_used: 'nexus-identity', confidence: who.known ? 0.8 : 0.3, escalated: false, hypotheses: who.hypotheses, requestId });
      }
      // §BUGFIX 2026-08-14 — found live: "switch agent to claude" (a
      // completely natural phrasing, confirmed the literal trigger for
      // this bug) never matched. The old pattern only recognized "switch
      // to X", "use X", "route to X" — the word "agent"/"model" landing
      // BEFORE "to"/the target broke the match entirely (verified with a
      // direct regex test: 'switch agent to claude'.match(oldPattern) ===
      // null). The message fell through untouched to normal intent
      // classification, which routed it to chatgpt as 'general' intent —
      // exactly what the screenshot showed ("via chatgpt (bridge)",
      // dispatch failed). Now matches BOTH orders: "switch [agent/model]
      // to X" and "switch to X [agent/model]".
      // §BUGFIX 2026-08-14, ROUND 3 — caught mid-flight, again, before
      // shipping: "switch co-pilot to claude" (no URL, no literal
      // "agent"/"model" word anywhere) matched the regex fine but still
      // failed to trigger, because the OLD gate required the word
      // "agent"/"model" to appear SOMEWHERE in the sentence — a
      // requirement that predates this fix and was never actually
      // necessary once the target itself is checked. Replaced with a
      // real three-way gate: trigger when the captured target is a KNOWN
      // agent name (claude/chatgpt/gemini/perplexity/clearglass) OR the
      // sentence says agent/model explicitly (the old safety net,
      // preserved for the \w+ catch-all case) OR a URL is present.
      // Tested against 10 real should-match and 4 real should-NOT-match
      // phrasings before landing this, not just the happy path.
      const urlM = prompt.match(/https?:\/\/[^\s]+/i);
      // §FIXED 2026-08-17 — James, live: "change agent to gemini" got the
      // generic fallback. Real, same bug class as the 2026-08-14 fix noted
      // above, different verb: "change" wasn't recognized alongside
      // switch/use/route. Safe to add — the switchIsReal gate below
      // (requires a known agent name, explicit "agent"/"model", or a URL)
      // already prevents a false positive regardless of which verb
      // matched, so widening the verb list doesn't widen what actually
      // triggers a switch.
      const switchM = prompt.match(/\b(?:switch\s+(?:\S+\s+)?to|change\s+(?:\S+\s+)?to|use|route to)\s+(claude|chatgpt|gemini|perplexity|deepseek|clear[- ]?glass|\w+)\s*(agent|model)?\b/i);
      const KNOWN_AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek', 'clear glass', 'clear-glass', 'clearglass'];
      const switchTarget = switchM ? switchM[1].toLowerCase() : null;

      // §FIXED 2026-08-22 — James, live: "change to guardian" got the
      // generic 66%-confidence ollama fallback, not a real switch. Traced
      // directly: the regex DID match and capture "guardian" — the gate
      // right below refused it, correctly, because Guardian isn't an
      // agent (it's not in KNOWN_AGENTS, and the phrase has no "agent"/
      // "model" word) — it's the NCP ROUTING LAYER that reaches the real
      // agents (claude/chatgpt/gemini/perplexity). "switch to guardian"
      // is a real, distinct, valid request that was never built: stop
      // defaulting to ollama, use whichever real agent guardian can
      // currently reach. Resolved here rather than treating "guardian" as
      // a fake pseudo-agent name switchAgent() would just reject.
      if (switchTarget === 'guardian' || switchTarget === 'ncp') {
        try {
          const ac = require('../lib/agent-chat');
          const { DEFAULT_FALLBACK } = require('../lib/agent-router');
          const listed = await ac.listAgents();
          if (!listed.ok) {
            return json(res, 200, { text: `Wanted to switch you to guardian, but guardian itself is unreachable: ${listed.error}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, requestId });
          }
          const live = new Set(listed.agents.filter(a => a.state === 'live').map(a => a.provider));
          // §BUGFIX 2026-08-31, James live: "switch agent to guardian using
          // agent chatgpt" — real symptom, "it works to route but not to
          // switch agents. keeps using perplexity." Traced exactly: switchM's
          // real regex only captures the ONE word right after "to" — in this
          // real phrasing that's "guardian", and "chatgpt" (the actual real,
          // named target later in the same sentence) was never even looked
          // at. This branch then always fell through to DEFAULT_FALLBACK.find
          // (['perplexity', 'gemini', 'chatgpt', 'claude'] — perplexity
          // first), silently overriding whatever specific agent the user
          // actually named. Real fix: check the REST of the real prompt for
          // a real, named KNOWN_AGENTS mention before falling back to the
          // generic "pick whichever's live" behavior — "switch to guardian
          // using chatgpt" means "route through guardian, specifically to
          // chatgpt," not "pick guardian's own default."
          const namedMatch = prompt.match(/\b(claude|chatgpt|gemini|perplexity|deepseek)\b/gi);
          const namedAgent = namedMatch?.map(m => m.toLowerCase()).find(a => a !== switchTarget && live.has(a));
          const pick = namedAgent || DEFAULT_FALLBACK.find(a => live.has(a));
          if (!pick) {
            return json(res, 200, { text: `Guardian is reachable, but no real agent tab is currently live to route through (checked: ${DEFAULT_FALLBACK.join(', ')}). Open one, or say "switch to <agent>" directly.`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, requestId });
          }
          const sm = require('./lib/self-model');
          const r = sm.switchAgent({ intent: 'directed', directed: pick, prompt });
          if (r.ok) sm.setCurrentAgent(r.agent);
          return json(res, 200, { text: r.ok ? `Routing to ${JSON.stringify(r.agent)} via guardian. Every message uses it until you change it again.` : `Could not switch: ${r.reason}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: r, requestId });
        } catch (e) {
          return json(res, 200, { text: `Wanted to switch you to guardian, but hit a real error resolving a live agent: ${e.message}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, requestId });
        }
      }

      const switchIsReal = switchM && (KNOWN_AGENTS.includes(switchTarget) || /\b(agent|model)\b/i.test(prompt) || !!urlM);
      if (switchIsReal) {
        const sm = require('./lib/self-model');
        const r = sm.switchAgent({ intent: 'directed', directed: switchTarget, prompt });
        // §BUGFIX 2026-09-01, James live: "switch agent to chatgpt using
        // guardian says 'routing to chatgpt' which didn't work." Traced
        // exactly: switchAgent() is a pure, local, synchronous decision —
        // it resolves a valid target and returns ok:true, but never
        // itself persists WHICH agent is now current. The sibling
        // 'switch to guardian' branch above already does this correctly
        // (if (r.ok) sm.setCurrentAgent(r.agent)) — this branch, the
        // real path "switch agent to X" actually takes, never did.
        // Every subsequent message kept routing to whatever agent was
        // ALREADY current, while this branch's own response text
        // falsely reported the switch had happened.
        if (r.ok) sm.setCurrentAgent(r.agent);
        // §BUILT 2026-08-14 — real request: "switch agent tool needs to use
        // NCP like: job created -> dispatched via NCP -> job.dispatched
        // ack." switchAgent() alone was a pure local decision, never
        // confirming the target's NCP channel was actually alive — a
        // disconnected/crashed/never-opened tab would "succeed" here and
        // then silently fail on the first real prompt. verifyAgentReachable
        // does a real, cheap round trip (checked: polls the NEW 'acked'
        // status, not 'complete' — doesn't wait for or pay for a full AI
        // generation just to confirm the tab is there).
        const reach = r.ok ? await sm.verifyAgentReachable(r.agent) : null;
        if (r.ok && urlM) {
          const nav = await sm.navigateAgentToUrl(r.agent, urlM[0]);
          const reachNote = reach && !reach.reachable ? ` (heads up: ${r.agent}'s tab didn't ack within the timeout — ${reach.error})` : '';
          const text = nav.ok
            ? (nav.needsSignIn
                ? `Routing to ${JSON.stringify(r.agent)} and opened ${urlM[0]}. ${nav.signInPrompt}${reachNote}`
                : `Routing to ${JSON.stringify(r.agent)} and opened ${urlM[0]}.${reachNote}`)
            : `Routing to ${JSON.stringify(r.agent)}, but couldn't open that URL: ${nav.error}${reachNote}`;
          return json(res, 200, { text, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: { ...r, navigate: nav, reachability: reach }, requestId });
        }
        const reachNote = reach && !reach.reachable ? ` Heads up: ${r.agent}'s tab didn't ack within the timeout — ${reach.error} — the switch is set, but that agent may not actually be reachable right now.` : '';
        return json(res, 200, { text: r.ok ? `Routing to ${JSON.stringify(r.agent)}.${reachNote}` : `Could not switch: ${r.reason}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: { ...r, reachability: reach }, requestId });
      }
      // §BUILT 2026-08-14 — real request: "create compartment command".
      // Checked first: no trigger existed at all (grepped copilot/server.js
      // directly), the message fell through to ollama and got refused —
      // same class of gap as switch-agent above, a real backend
      // (cos-compartment.js's create action, real, tested this session)
      // with zero conversational trigger pointing at it.
      const compartM = prompt.match(/\b(?:create|make|start|new)\s+(?:a\s+)?compartment\b(?:\s+(?:named|called)\s+["']?([\w-]+)["']?)?/i);
      if (compartM) {
        const cosCompartment = require('../lib/agent-tools/tools/sandbox/cos-compartment.js');
        const name = compartM[1] || `compartment-${Date.now()}`;
        const r = await cosCompartment.execute({ action: 'create', name, purpose: prompt });
        const text = r.ok
          ? `Created compartment "${name}". Want axioms and an end-state for it, or should I leave it open-ended for now?`
          : `Couldn't create that compartment: ${r.error || 'unknown error'}`;
        return json(res, 200, { text, model_used: 'nexus-compartment', confidence: 1, escalated: false, detail: r, requestId });
      }
      // §BUILT 2026-08-17 — GA9. "co-pilot to be able to list current
      // compartments, delete them." Checked first: cos-compartment.js's
      // list/destroy actions already exist and are real, tested — same
      // exact gap class as create-compartment above had before it was
      // fixed: a real backend, zero conversational trigger. Following the
      // identical pattern, not a new mechanism.
      const listCompartM = prompt.match(/\b(?:list|show(?:\s+me)?|what)\s+(?:are\s+)?(?:the\s+|my\s+|current\s+)*compartments?\b/i);
      if (listCompartM) {
        const cosCompartment = require('../lib/agent-tools/tools/sandbox/cos-compartment.js');
        const r = await cosCompartment.execute({ action: 'list' });
        const names = r.ok && r.compartments ? r.compartments.map(c => c.name || c.id).filter(Boolean) : [];
        const text = r.ok
          ? (names.length ? `${names.length} compartment${names.length === 1 ? '' : 's'}: ${names.join(', ')}.` : 'No compartments exist right now.')
          : `Couldn't list compartments: ${r.error || 'unknown error'}`;
        return json(res, 200, { text, model_used: 'nexus-compartment', confidence: 1, escalated: false, detail: r, requestId });
      }

      // §1.1 — "wipe"/"force" are only honored when the person actually
      // says them; the default is the safe, real backend default (false).
      const delCompartM = prompt.match(/\b(?:delete|destroy|remove)\s+(?:the\s+|compartment\s+)?(?:compartment\s+)?(?:named\s+|called\s+)?["']?([\w-]+)["']?\s*(compartment)?\b(?:\s|$)/i);
      if (delCompartM && /compartment/i.test(prompt)) {
        const cosCompartment = require('../lib/agent-tools/tools/sandbox/cos-compartment.js');
        const name = delCompartM[1];
        const force = /\bforce\b/i.test(prompt);
        const wipe = /\bwipe\b/i.test(prompt);
        const r = await cosCompartment.execute({ action: 'destroy', name, force, wipe });
        const text = r.ok ? `Destroyed compartment "${name}".` : `Couldn't destroy "${name}": ${r.error || 'unknown error'}`;
        return json(res, 200, { text, model_used: 'nexus-compartment', confidence: 1, escalated: false, detail: r, requestId });
      }


      // static identity" + "how do I change the agent for co-pilot?" — the
      // feature existed (copilot_identity's setAgent/getAgent, wired into
      // lifeline.js's route()) but had no guaranteed plain-chat trigger,
      // only tool-loop invocation, which depends on the model choosing to
      // call it. Distinct phrasing from switchM above on purpose (that one
      // already claims "switch to/use/route to X agent" for a ONE-OFF
      // route) — "always use", "default to", "wear the X hat" mean the
      // PERSISTENT hat, every future message, until changed again.
      // ── §2026-08-13 — MAKE A HAT FROM CHAT ────────────────────────────
      // hat_forge exists as a tool, but reaching it depends on the model
      // choosing to call it, which is not guaranteed from plain chat the way
      // "switch to X" is. These are real regex handlers on the same
      // guaranteed path as the wear/take-off ones below.
      //
      // Grammar (every clause after the name is optional):
      //   make a hat called the_auditor
      //   make a hat called the_auditor using claude
      //   create a hat named x using claude with tools loom_scan, read_file
      //   forge a hat called x using claude that audits every claim it is given
      const mkHat = prompt.match(/\b(?:make|create|forge|build)\s+(?:me\s+)?(?:a\s+|an\s+)?(?:new\s+)?hat\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9_]{2,48})\b([\s\S]*)$/i);
      if (mkHat) {
        const hatForge = require('../lib/hat-forge');
        const agentTools = require('../lib/agent-tools');
        const name = mkHat[1].toLowerCase();
        const rest = mkHat[2] || '';

        // Each clause is pulled independently rather than with one big
        // ordered regex, so clause ORDER doesn't silently change the result.
        const baseM  = rest.match(/\b(?:using|based on|from|on|with)\s+(claude|chatgpt|gemini|ollama|mistral|perplexity)\b/i);
        const toolsM = rest.match(/\bwith\s+tools?\s+([A-Za-z0-9_,\s]+?)(?=\s+that\b|\s*$)/i);
        const persM  = rest.match(/\bthat\s+([\s\S]+)$/i);

        const def = { name, baseAgent: baseM ? baseM[1].toLowerCase() : 'claude' };
        if (toolsM) {
          def.toolScope = toolsM[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
        }
        if (persM) def.personaPrompt = persM[1].trim();

        // §1.1 — a scope naming a tool that isn't registered is refused with
        // the real list, not accepted into a hat that would silently do less
        // than it claims.
        if (def.toolScope) {
          const unknown = def.toolScope.filter(t => !agentTools.TOOLS.has(t));
          if (unknown.length) {
            return json(res, 200, {
              text: `Can't forge "${name}" — these aren't real tools: ${unknown.join(', ')}.\n\n` +
                    `Registered tools (${agentTools.TOOLS.size}): ${[...agentTools.TOOLS.keys()].sort().join(', ')}`,
              model_used: 'nexus-hat-forge', confidence: 1, escalated: false, requestId,
            });
          }
        }

        const r = hatForge.forge(def);
        if (!r || !r.ok) {
          return json(res, 200, {
            text: `Couldn't forge "${name}":\n  ${((r && r.errors) || ['unknown error']).join('\n  ')}`,
            model_used: 'nexus-hat-forge', confidence: 1, escalated: false, detail: r, requestId,
          });
        }
        const scopeTxt = def.toolScope ? `${def.toolScope.length} scoped tools (${def.toolScope.join(', ')})` : `all ${agentTools.TOOLS.size} tools`;
        return json(res, 200, {
          text: `Forged "${name}" — base agent ${def.baseAgent}, ${scopeTxt}` +
                `${def.personaPrompt ? `, persona set` : ''}.\n` +
                `Wear it with: "wear the ${name} hat".`,
          model_used: 'nexus-hat-forge', confidence: 1, escalated: false, detail: r.hat, requestId,
        });
      }

      if (/\b(list (the )?hats|what hats( do you have| are there| exist)?|show (me )?(the )?hats|which hats)\b/i.test(prompt)) {
        const hats = require('../lib/hat-forge').list() || [];
        const txt = hats.length
          ? hats.map(h => `  ${h.name} — ${h.baseAgent}, ${h.toolScope ? h.toolScope.length + ' tools' : 'all tools'}${h.personaPrompt ? ', persona' : ''}`).join('\n')
          : '  (none forged yet — "make a hat called x using claude")';
        return json(res, 200, { text: `Forged hats:\n${txt}`, model_used: 'nexus-hat-forge', confidence: 1, escalated: false, detail: hats, requestId });
      }

      const rmHat = prompt.match(/\b(?:revoke|delete|remove|destroy)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_]{2,48})\s+hat\b/i)
        || prompt.match(/\b(?:revoke|delete|remove|destroy)\s+(?:the\s+)?hat\s+(?:called|named)\s+([A-Za-z][A-Za-z0-9_]{2,48})\b/i);
      if (rmHat) {
        const nm = rmHat[1].toLowerCase();
        const r = require('../lib/hat-forge').revoke(nm);
        return json(res, 200, { text: r && r.ok ? `Revoked the ${nm} hat.` : `Couldn't revoke "${nm}": ${(r && r.reason) || 'unknown'}`, model_used: 'nexus-hat-forge', confidence: 1, escalated: false, detail: r, requestId });
      }

      // §2026-08-13 — this used to match ONLY the six base agent names, so a
      // forged hat could never be worn from chat even though setCurrentAgent
      // has accepted forged names since P8 (self-model.js:183). The mechanism
      // was there; the only guaranteed path to it wasn't. The candidate name
      // is checked against the real forged-hat store before being accepted,
      // so this stays a closed set and can't swallow arbitrary text.
      const BASE_AGENTS = /claude|chatgpt|gemini|ollama|mistral|perplexity/i;
      let hatM = prompt.match(/\b(always use|default to|wear the)\s+([A-Za-z][A-Za-z0-9_]{2,48})\b/i)
        || prompt.match(/\bwear\s+(?:the\s+)?([A-Za-z][A-Za-z0-9_]{2,48})\s+hat\b/i);
      if (hatM) {
        const candidate = (hatM[2] || hatM[1]).toLowerCase();
        let known = BASE_AGENTS.test(candidate);
        if (!known) {
          try { known = !!require('../lib/hat-forge').get(candidate); } catch (_) {}
        }
        if (!known) hatM = null;   // not a real agent or hat — fall through
      }
      if (hatM) {
        const sm = require('./lib/self-model');
        const agent = (hatM[2] || hatM[1]).toLowerCase();
        const r = sm.setCurrentAgent(agent);
        return json(res, 200, { text: r.ok ? `Wearing the ${r.hatName || r.agent} hat now — every message uses it until you change it again.` : `Couldn't put on that hat: ${r.reason}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: r, requestId });
      }

      if (/\b(take off (the|your) hat|stop using (that|the current) agent|go back to auto|clear (your |the )?(current )?agent|reset (your |the )?agent)\b/i.test(prompt)) {
        const sm = require('./lib/self-model');
        const r = sm.setCurrentAgent('auto');
        return json(res, 200, { text: r.ok ? `Hat off — back to the normal ollama-first cascade.` : `Couldn't clear it: ${r.reason}`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: r, requestId });
      }
      if (/\b(what agent are you (using|on)|what('?s| is) your (current )?agent|what hat are you wearing|which (agent|model) (are you|is copilot) (using|on))\b/i.test(prompt)) {
        const sm = require('./lib/self-model');
        const r = sm.getCurrentAgent();
        return json(res, 200, { text: r.isCustom ? `Wearing the ${r.agent} hat.` : `No hat on — normal ollama-first cascade with confidence-based escalation.`, model_used: 'nexus-agent-router', confidence: 1, escalated: false, detail: r, requestId });
      }
      if (/\b(what can you do|what can i do|list (your )?(tools|capabilities)|full (list of )?(tools|capabilities)|what (are your|tools do you have))\b/i.test(prompt)) {
        const cap = require('./lib/capabilities');
        const r = cap.whatCanIDo();
        // §2026-08-09 — CA1-CA7 aren't HTTP-routed capabilities, so
        // whatCanIDo()'s route-verified list (correctly) doesn't include
        // them. "What can you do" was silently omitting a real, working
        // part of the answer — this appends it rather than leaving it out.
        const autonomyNote = ' Plus autonomy: I can schedule recurring tasks, react to conditions, change and revert system settings, build my own commands for things I can do, and run a constant background check on open problems — ask me directly, e.g. "schedule X every N minutes" or "make me a command for <system> to <ability>".';
        return json(res, 200, { text: r.text + autonomyNote, model_used: 'nexus-capabilities', confidence: 1, escalated: false, capabilities: r.systems, total: r.total, requestId });
      }
      const perSys = prompt.match(/\bwhat can (\w+) do\b/i);
      if (perSys && !/\byou\b/i.test(perSys[1])) {
        const cap = require('./lib/capabilities');
        const r = cap.capabilitiesForSystem(perSys[1].toLowerCase());
        return json(res, 200, { text: r.text, model_used: 'nexus-capabilities', confidence: 1, escalated: false, capabilities: r.capabilities, requestId });
      }
      // §P4 — NEXUS self-awareness: rundown / what's wrong / versions, from real state.
      try {
        const na = require('./lib/nexus-awareness');
        const ans = await na.answerAbout(prompt, {});
        if (ans) return json(res, 200, { text: ans.text, model_used: 'nexus-awareness', confidence: 1, escalated: false, detail: ans, requestId });
      } catch (_) { /* awareness unavailable — fall through to normal path */ }
      if (/^\s*list accounts\b/i.test(prompt) || /\bshow (my )?accounts\b/i.test(prompt)) {
        const ar = require('../lib/account-registry');
        const accounts = ar.listAccounts ? ar.listAccounts() : [];
        const text = accounts.length ? `${accounts.length} account slot(s): ${accounts.map(a => `${a.provider}/${a.label}${a.active ? '' : ' (inactive)'}`).join(', ')}.` : 'No account slots registered yet.';
        return json(res, 200, { text, model_used: 'nexus-accounts', confidence: 1, escalated: false, accounts, requestId });
      }
      const addAcct = prompt.match(/^\s*add account\s+(\w+)\s+(\S+)/i);
      if (addAcct) {
        const ar = require('../lib/account-registry');
        const row = ar.addAccount ? ar.addAccount(addAcct[1], addAcct[2], {}) : null;
        const text = row && !row.error ? `Registered ${addAcct[1]}/${addAcct[2]} (credentials stored as a reference, not raw).` : `Could not add: ${(row && row.error) || 'registry unavailable'}.`;
        return json(res, 200, { text, model_used: 'nexus-accounts', confidence: 1, escalated: false, account: row, requestId });
      }
      if (/^\s*user[- ]model\b/i.test(prompt) || /\bwhat do you know about me\b/i.test(prompt)) {
        const um = require('./lib/user-model');
        let hyps = [];
        try { hyps = um.getHypotheses ? um.getHypotheses(10) : []; } catch { hyps = []; }
        const text = (hyps && hyps.length) ? `${hyps.length} hypotheses tracked (confidence-weighted).` : 'No user-model hypotheses yet.';
        return json(res, 200, { text, model_used: 'nexus-user-model', confidence: 1, escalated: false, hypotheses: hyps, requestId });
      }
      // §2026-08-09 — CA1-CA7, the autonomous layer built and tested this
      // session, wired into the actual conversation for the first time.
      // Same pattern as every intercept above: a real lib module, called
      // directly, not grammar-engine auto-dispatch (nothing uses that path
      // yet for any capability — see copilot/lib/autonomy-router.js's own
      // header for why). "co-pilot needs to work and have access to all of
      // its tools" (James) — this is that wire.
      try {
        const ar = require('./lib/autonomy-router');
        const auto = await ar.route(prompt, { sessionId, channel });
        if (auto) return json(res, 200, { text: auto.text, model_used: 'nexus-autonomy', confidence: 1, escalated: false, detail: auto.detail, requestId });
      } catch (_) { /* autonomy layer unavailable — fall through, never block */ }
    } catch (_) { /* container-panel query unavailable — fall through */ }

    // Dispatch through lifeline (lib/lifeline → Ollama first, Guardian fallback)
    let text = '', modelUsed = 'none', confidence = null, escalated = false, escalationReason = null, lifeError = null;
    try {
      // §BUILT 2026-09-06 — James: "a toggle switch to switch between
      // ollama and guardian." lifeline.route() already accepts a real
      // opts.provider override (checked directly before adding this —
      // it already validates 'auto'/a real guardian agent name against
      // guardian's own live /providers); this endpoint just never passed
      // the caller's own choice through, always letting lifeline
      // auto-decide. payload.provider is optional — every existing caller
      // that never sends it gets the exact same auto-decide behavior as
      // before, unchanged.
      // §FIX 2026-09-07 (merge) — found while merging a parallel thread's
      // real toggle-UI work: this read body.provider, but body is the
      // RAW, still-wrapped {request:{uuid,payload}} object — provider
      // actually lives at payload.provider (this same handler's own top
      // already does the real unwrap for exactly this reason).
      // body.provider was always undefined, so no provider choice ever
      // reached lifeline at all — even the new, real toggle UI (which
      // correctly sends a specific agent name) was silently defeated by
      // this one line underneath it.
      // §BUILT 2026-09-06 — James: "copilot is the middle option for
      // whatever is enabled in the programmable configuration file."
      // 'copilot' (the toggle's real, middle value — see ui/tv-shell's
      // own real toggle) resolves through the real, single config value
      // this session already established the convention for (copilot/
      // config.js's DEFAULT_PROVIDER), not a second, separate default
      // baked into this route. A caller that sends neither 'copilot' nor
      // any real provider at all also falls through to the exact same
      // real config value — one real source, not two.
      const resolvedProvider = (!payload.provider || payload.provider === 'copilot')
        ? config.DEFAULT_PROVIDER
        : payload.provider;
      const life = await _lifeline.route(
        `${contextText}\n\nUSER: ${prompt}\nNEXUS CO-PILOT: `,
        { requestId, sessionId, intent: 'ask', channel, provider: resolvedProvider }
      );
      text      = life?.text || '';
      modelUsed = life?.provider_used || 'none';
      lifeError = life && !life.ok ? (life.error || null) : null;   // §SD2
      confidence = life?.confidence ?? null;
      escalated  = !!life?.escalated;
      // §BUG FIXED 2026-07-11 — "the confidence score is over-relying on
      // lifeline" is unverifiable without this: lifeline's route() already
      // computes and returns confidence/escalated/ollama_offline on every
      // response, but none of it reached storage — only provider_used did.
      // Every escalation was invisible after the fact; the only place it
      // existed was one console.log line and a fire-and-forget SSE
      // broadcast nothing persisted or displayed. Now on the actual
      // persisted record, so it's answerable from data instead of guessed:
      // was this exchange high-confidence Ollama, or an escalation — and
      // if an escalation, was it because confidence was low, or because
      // Ollama was unreachable entirely (two very different problems that
      // both look identical without this).
      escalationReason = life?.ollama_offline ? 'ollama_unreachable'
        : life?.escalated ? 'low_confidence'
        : null;
      if (life?.escalated) broadcast('copilot.lifeline.escalated', { provider: life.provider_used, confidence, reason: escalationReason });
    } catch(e) { text = `Dispatch failed: ${e.message}`; }

    // Persist (best-effort)
    try {
      await _persist('chat_log', {
        uuid: crypto.randomUUID(), requestId, sessionId,
        prompt: prompt.slice(0,500), response: text.slice(0,2000),
        modelUsed, intent: 'ask', channel,
        confidence, escalated, escalationReason,
        componentId: 'copilot.bridge.deliver', hookId: 'copilot.bridge.in',
        contextLayers: 7, fromStream: false, ts: Date.now()
      });
    } catch(_) {}

    streamIngest({ type: 'copilot.answered', requestId, intent: 'ask', modelUsed });

    // §BUG FIXED 2026-07-05, CORRECTED 2026-07-11: this originally
    // pre-wrapped the answer in {result:{response:{...}}}, and got
    // changed to the flat shape below on the theory that ResultGate
    // already wraps a raw body once, so pre-wrapping here doubled it.
    // That theory was half right and half wrong: pre-wrapping here WAS
    // the wrong move, but ResultGate wasn't actually wrapping anything —
    // it was destructuring the route.result event without ever pulling
    // out `data` (DispatchGate's captured response body) at all, so the
    // resolved value never contained ANY version of this endpoint's
    // response, flat or nested. This fix looked right and WAS right,
    // it just couldn't be verified from this side, since nothing
    // downstream of router.js's ResultGate ever received whatever shape
    // was sent here. Confirmed live, repeatedly, across sessions: the
    // bridge tab kept showing {"ok":true,"uuid":...,"status":"fulfilled"}
    // with no actual answer anywhere in it. The real fix is in
    // bridge/router.js's ResultGate — this endpoint's shape was correct
    // then and is correct now; it was never the actual problem.
    // §SD2 0.56.0 — James's screenshot: "[unstructured response — keys: ok, … text, modelUsed …] via none". Nothing
    // answered and this said ok:true with empty text. No text is a failure, said with lifeline's own reason.
    if (!String(text || '').trim()) { json(res, 200, _noAnswer({ requestId, sessionId, modelUsed, lifeError })); return; }
    json(res, 200, { ok: true, text, modelUsed, contextLayers: 7, requestId, sessionId });
    return;
  }

  // ── §PHASEMAP P1: POST /api/prompt/tools — agentic tool-loop ───────────────
  // §BUILT 2026-08-19 — real, honest visibility into the new memory-aware
  // LLM dispatch queue: not just "is it running" but WHY nothing is moving
  // when it isn't (idle vs pumping vs genuinely held by memory pressure).
  if (p === '/api/queue/health') {
    try { json(res, 200, require('../lib/work-queue').healthAll()); }
    catch (e) { json(res, 503, { ok: false, error: e.message }); }
    return;
  }

  // Co-pilot runs the sovereign agent-tools loop (lib/agent-tools) with its OWN
  // ollama dispatch injected as callModel. The model can request tools mid-turn
  // (read_file, diagnose, query-recall, run-command, ...) and the loop executes
  // them for real, feeding results back. Additive: the existing /api/prompt path
  // is untouched. P2 (memory) and P3 (stream) enrich the run via opts without
  // changing this contract.
  // §TOOLS 0.39.257 — the tool catalog in plain language (lib/agent-tools/tool-catalog.js): idearium's Agent tab
  // /tools and /help read it here, where the registry is already loaded (loading it elsewhere re-indexes cortex's
  // tool_index). ?q= narrows it; ?scope=a,b,c marks which are in a caller's scope.
  // 0.39.258 — GET /api/prompt/resolve: which backend copilot's default (config.DEFAULT_PROVIDER) resolves to, for a
  // caller that composes its own prompt (idearium's repo agent in the "copilot" position) and must send it straight
  // there instead of through /api/prompt's plain path, which adds copilot's own context. Pure: config only.
  // §0.39.265 — the semantic randomizer (copilot/lib/reword.js): { text, key, n, model, useModel } → the same
  // meaning in new words (Ollama first, JS fallback), protected parts verbatim, novel against what `key` was sent.
  if (method === 'POST' && p === '/api/reword') {
    try {
      const body = await readBody(req);
      const r = await require('./lib/reword.js').reword({ text: body.text, key: body.key || 'default', n: Math.min(Math.max(parseInt(body.n, 10) || 3, 1), 5),
        model: body.model || null, useModel: body.useModel !== false, guidance: typeof body.guidance === 'string' ? body.guidance : '' });
      json(res, r.ok ? 200 : 400, r);
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  // §0.39.271 C1 — declared in registry-components since 2026-08-19, never served (every call
  // fell to the 404). The modules were real and tested: lib/introspect.js, lib/agent-capability.js.
  if (method === 'POST' && p === '/api/introspect') {
    try {
      const b = await readBody(req);
      const r = await require('../lib/introspect.js').examine({ prompt: b.prompt, response: b.response, requestId: b.requestId || null, sessionId: b.sessionId || null, userSaidWrong: !!b.userSaidWrong, intent: b.intent || null });
      json(res, 200, { ok: true, ...r });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (method === 'POST' && p === '/api/introspect/retry') {
    try {
      const b = await readBody(req);
      if (!b.prompt || !b.response) return json(res, 400, { ok: false, error: 'prompt and response (the answer being retried) are required' });
      const r = await require('../lib/introspect.js').retry({ prompt: b.prompt, response: b.response, requestId: b.requestId || null, sessionId: b.sessionId || null, intent: b.intent || null,
        // the retry goes out the way any copilot prompt does (lifeline's cascade), carrying the finding
        dispatchFn: async (retryPrompt) => { const l = await _lifeline.route(retryPrompt, { intent: b.intent || 'ask', sessionId: b.sessionId || null, channel: 'copilot-introspect-retry' }); if (!l || !l.ok) throw new Error((l && l.error) || 'no provider answered'); return l.text; } });
      json(res, 200, { ok: r.ok !== false, ...r });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (method === 'GET' && p === '/api/introspect/health') {
    try { json(res, 200, require('../lib/introspect.js').health()); } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (method === 'GET' && p === '/api/agents/capability') {
    try {
      const AC = require('../lib/agent-capability.js');
      const agent = new URL(req.url, 'http://x').searchParams.get('agent');
      json(res, 200, agent ? { ok: true, ...AC.profile(agent), chunk: AC.chunkFor(agent) } : { ok: true, agents: AC.all(), health: AC.health() });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // §0.39.267 — what copilot has been up to, structured (the same records intuition's "what have you been up to" reads).
  // ?hours=N (default 6) or ?since=<ms epoch>; &text=1 adds the sentence form.
  if (method === 'GET' && p === '/api/activity') {
    try {
      const recall = require('./lib/activity-recall.js');
      const u = new URL(req.url, 'http://x');
      const hours = parseFloat(u.searchParams.get('hours') || '6');
      const sinceMs = u.searchParams.get('since') ? parseInt(u.searchParams.get('since'), 10) : Date.now() - (Number.isFinite(hours) ? hours : 6) * 3600000;
      const r = recall.recall({ sinceMs, stream: _stream.slice(-200) });
      if (u.searchParams.get('text')) r.text = recall.format(r, { label: `in the last ${hours} hour${hours === 1 ? '' : 's'}` });
      json(res, 200, { ok: true, ...r });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // §CT1 0.39.346 — James: "i feel like it should use copilot regardless, have copilot figure it, and learn from it.
  // failure modes, dynamically switch models, if its not equipped for the task". The one door for "which model":
  // POST /api/route { kind, preferAgent, policy } → the route to try, in order — each hop a provider, its backend, its
  // agent and its model — from lib/pipeline-routing.js (the build's policy: learned per kind of job, breakers, the
  // chain), not a fourth router. POST /api/route/outcome { provider, kind, ok, class, ms, error } → recorded in the
  // economy ledger (what the learned mode learns from) and the breaker. The caller still sends its own prompt (0.39.258).
  if (method === 'POST' && p === '/api/route') {
    // §HP18 0.55.2 — guardian's open tabs order the browser agents (fail-open: guardian silent = order unchanged)
    try { const b = await readBody(req); const tabs = await require('../lib/agent-providers.js').guardianTabs({ url: GD_URL });
      json(res, 200, require('../lib/model-door.js').route(b, { defaultProvider: config.DEFAULT_PROVIDER, resolve: resolveDefaultBackend, tabs })); }
    catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (method === 'POST' && p === '/api/route/outcome') {
    try { const r = require('../lib/model-door.js').outcome(await readBody(req)); json(res, r.ok ? 200 : 400, r); }
    catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  if (method === 'GET' && p === '/api/prompt/resolve') {
    json(res, 200, { ok: true, ...resolveDefaultBackend(config.DEFAULT_PROVIDER) });
    return;
  }
  if (method === 'GET' && p === '/api/tools/list') {
    try {
      const agentTools = require('../lib/agent-tools/index.js');
      const C = require('../lib/agent-tools/tool-catalog.js');
      const u = new URL(req.url, 'http://x');
      const scope = u.searchParams.get('scope') ? u.searchParams.get('scope').split(',').map(x => x.trim()).filter(Boolean) : null;
      let noteFor = null; try { noteFor = require('../lib/agent-tools/tool-guide.js').noteFor; } catch (_) {}
      const all = C.catalog({ tools: [...agentTools.TOOLS.values()], noteFor, scope });
      const tools = C.search(all, u.searchParams.get('q') || '');
      json(res, 200, { ok: true, total: all.length, count: tools.length, groups: C.GROUPS.map(g => ({ id: g.id, title: g.title })), tools });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }
  // §TOOLS 0.39.257 — run ONE tool directly, through the same gate every tool call takes (executeTool: tool-config,
  // fault history, event log). For commands that need an answer from a system, not a model: idearium's /debug report.
  // body: { name, args, context: { repoDir }, scope: [names] | undefined } — a name outside scope is refused, not run.
  if (method === 'POST' && p === '/api/tools/run') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { name, args, context, scope, agent } = JSON.parse(body || '{}');   // 0.39.272 — agent: who is calling (clear-glass-copilot, idearium…); default idearium, as before
        if (!name) { json(res, 400, { ok: false, error: 'name required' }); return; }
        if (Array.isArray(scope) && scope.length && !scope.includes(name)) { json(res, 403, { ok: false, error: `"${name}" is outside this caller's tool scope — not run` }); return; }
        const agentTools = require('../lib/agent-tools/index.js');
        if (!agentTools.TOOLS.has(name)) { json(res, 404, { ok: false, error: `no tool "${name}"` }); return; }
        const result = await agentTools.executeTool(name, args || {}, { context: context || null, agent: (typeof agent === 'string' && agent) ? agent.slice(0, 64) : 'idearium' });
        json(res, 200, { ok: !(result && result.error), name, result });
      } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    });
    return;
  }

  if (method === 'POST' && p === '/api/prompt/tools') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { prompt, sessionId, maxIterations } = JSON.parse(body || '{}');
        if (!prompt) { json(res, 400, { ok: false, error: 'prompt required' }); return; }
        const toolRuntime = require('./tool-runtime');
        const userModel = require('./lib/user-model');
        const requestId = crypto.randomUUID();

        // §PHASEMAP P2 — persistent memory. buildUserContext() reads the
        // confidence-weighted hypotheses from cortex's JAA store (survives
        // restart — §0.3 nothing lost). Injected as `memory` so the co-pilot
        // remembers this user across sessions.
        let memory = '';
        try { memory = userModel.buildUserContext() || ''; } catch (_) {}

        const dispatch = (convo, sysContext, opts) =>
          _dispatchToOllama(convo, sysContext, { ...opts, intent: 'tool-loop', requestId, sessionId });

        // §PHASEMAP P3 — continuous stream. _stream is copilot's live ring
        // buffer, already fed by Cortex + Guardian + Idearium SSE (streamIngest).
        // normalizeStream turns the recent slice into readable text; injected as
        // streamDigest so the co-pilot sees live system events every turn
        // (omniscience — §1.2 the stream is observable). P7 promotes this to a
        // shared subscribable so every system's loop reads the same digest.
        let streamDigest = '';
        try {
          const { normalizeStream } = require('./stream-digest');
          streamDigest = normalizeStream(_stream, 30) || '';
        } catch (_) {}

        // §PHASEMAP OB6 — continuous diagnostic injection. Append a BOUNDED live
        // health + bottleneck summary to the stream digest, so co-pilot's context
        // continuously carries system state + movement (not just raw events).
        // Bounded to one health line + the single worst bottleneck so it enriches
        // rather than drowns the signal (OB6 drift note). Non-fatal.
        try {
          const diag = await require('./diagnostics').diagnose();
          const parts = [];
          if (diag.health) parts.push(`${diag.health.online}/${diag.health.total} systems online`);
          if (diag.gaps && diag.gaps.open) parts.push(`${diag.gaps.open} open gaps`);
          if (diag.regime && diag.regime.state && diag.regime.state !== 'stable') parts.push(`CFR regime ${diag.regime.state}`);
          if (parts.length) streamDigest += `\nLIVE DIAGNOSTICS: ${parts.join(', ')}.`;
          // top bottleneck (OB4) if the movement map has recent flow
          const mm = require('./movement-map');
          const graph = mm.buildMovementGraph((_stream || []).slice(-40));
          const bn = mm.detectBottlenecks(graph, {});
          if (bn.length) streamDigest += ` BOTTLENECK: ${bn[0].why} (score ${bn[0].score}).`;
        } catch (_) { /* diagnostics injection is best-effort */ }

        const result = await toolRuntime.run({
          userPrompt: prompt,
          dispatch,
          pollJob: _pollOllamaJobHeadless,
          maxIterations: maxIterations || 6,
          memory,
          streamDigest,
        });

        // §P2 write-back — record this interaction so the model learns across
        // sessions. recordIntent persists to cortex; the next session's
        // buildUserContext() will reflect it.
        try {
          userModel.recordIntent('tool-loop', String(prompt).slice(0, 300), sessionId || 'copilot');
          if (result.toolCallLog.length) {
            userModel.observe(`uses tools: ${[...new Set(result.toolCallLog.map(t => t.name))].join(', ')}`,
              'behaviour', { via: 'tool-loop' }, 0.55);
          }
        } catch (_) {}

        await _persist('chat_log', { uuid: crypto.randomUUID(), requestId, sessionId,
          prompt: String(prompt).slice(0, 500), response: (result.text || '').slice(0, 2000),
          modelUsed: 'ollama', intent: 'tool-loop', toolsUsed: result.toolCallLog.map(t => t.name),
          iterations: result.iterations, componentId: 'copilot.prompt.tools',
          hookId: 'copilot.prompt.tools.reply', ts: Date.now() });

        json(res, 200, { ok: true, text: result.text, iterations: result.iterations,
          toolCallLog: result.toolCallLog, requestId });
      } catch (e) {
        json(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  // ── POST /api/prompt — standard JSON response ─────────────────────────────
  if (method === 'POST' && p === '/api/prompt') {
    const body      = await readBody(req);
    const prompt    = body.prompt || '';
    const channel   = body.channel || 'unknown';
    const sessionId = body.sessionId || req.headers['x-session-id'] || crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const session   = _getSession(sessionId, channel, prompt);
    session.exchanges++;
    // §2026-08-28 — James, live: guardian-picker.js's real "Co-pilot CLI"
    // link target lets a person set an intent per listener; this endpoint
    // hardcoded intent:'ask' at the _lifeline.route() call below
    // regardless of what a caller sent, so that per-listener intent was
    // silently dropped. Real, minimal fix: accept it here, default to the
    // existing 'ask' behavior unchanged for every other caller.
    const callerIntent = typeof body.intent === 'string' && body.intent.trim() ? body.intent.trim() : 'ask';
    // §FIXED 2026-09-08 — James: floating menu's toggle/dropdown "aren't
    // hooked into anything." Traced: this endpoint (unlike its sibling
    // /api/prompt/fulfill, already fixed 2026-09-06/07 with the real
    // ollama|copilot|guardian convention) never read body.provider at
    // all, so the _lifeline.route() call below always ran with no
    // opts.provider — every /api/prompt caller (menu.js's CLI included)
    // fell through to lifeline's own default cascade regardless of what
    // the toggle said. Same real resolution as the fulfill endpoint, not
    // a second one invented here: 'copilot' (or nothing sent) resolves
    // through config.DEFAULT_PROVIDER, a real agent name or 'ollama'
    // passes straight through. This is also the actual cause of "blank
    // responses with a confidence score" — lifeline's honest low-
    // confidence fallback text is literally `[CONFIDENCE: N%] ${text}`;
    // with no provider ever reaching it, a caller had no way to opt out
    // of the cascade that produces that text.
    const resolvedProvider = (!body.provider || body.provider === 'copilot')
      ? config.DEFAULT_PROVIDER
      : body.provider;

    if (!prompt) { json(res, 400, { ok:false, error:'prompt required' }); return; }

    // §NEW 2026-09-11 — James, direct: "I don't want it to route through
    // lifeline. Toggle needs to actually toggle copilot between guardian.
    // Like switch between cli interfaces and server.js." Real, distinct
    // from the existing provider/resolvedProvider logic below (which
    // still goes through lifeline.route()'s own cascade — kept, unchanged,
    // for callers that never set backend at all). This is a genuinely
    // different real field: an explicit backend switch bypasses copilot's
    // own intent routing AND lifeline's cascade entirely, calling the
    // chosen system's own real dispatch function directly — 'guardian'
    // uses copilot/lifeline.js's already-real, already-tested
    // dispatchToNcpAgent (guardian's own /api/copilot/prompt path,
    // exported as dispatchToNcpAgent since 2026-08-29); 'ollama' uses the
    // newly-exported dispatchToOllama (ollama-bridge's real /api/jobs
    // path) — same real functions lifeline.route()'s cascade already
    // calls internally, just reached directly instead of through the
    // confidence-check/auto-escalate logic around them.
    if (body.backend === 'guardian' || body.backend === 'ollama') {
      const dispatchFn = body.backend === 'guardian' ? _lifeline.dispatchToNcpAgent : _lifeline.dispatchToOllama;
      try {
        // §TR1 2026-09-22 — traced directly: this handler previously read
        // only provider/requestId/sessionId from body, silently dropping
        // any agentId a caller sent (idearium's lib/repo-agent.js now
        // sends one — see that file's own §TR1 note). ollama has no tab
        // to pick between, so agentId is only meaningful for 'guardian'.
        // §FIX 2026-09-23 — see copilot/lifeline.js's own note on this
        // same date: a caller's real patience (idearium's repo-agent
        // dispatch bumps to 300000ms for exactly this reason) was being
        // silently cut short by this hop's own hardcoded 45s default.
        // Only meaningful for 'guardian' (ollama's own dispatch has no
        // equivalent per-call override here).
        // 0.39.253 — body.model reaches Ollama (lifeline._tryOllama already sends opts.model to the bridge's /api/jobs; this
        // handler dropped it, so a caller's chosen model — idearium's per-compartment Ollama model — never arrived).
        // Unset = nothing sent, the bridge's own default applies, as before. guardian ignores it.
        const olModel = body.backend === 'ollama' && typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
        // §TOOLS 0.39.257 — James: "the toolscope for the agents tab. need the full capabilities, with the /help and
        // tool awareness". body.tools = { scope: 'all' | [names], identity, repoDir, maxIterations }: the same chosen
        // backend, but through the real tool loop (copilot/tool-runtime.js — runViaAgent for a browser agent, run for
        // Ollama), with the scope ENFORCED by runToolLoop's allowedTools, the tool guide in the system prompt, the
        // caller's identity instead of "the NEXUS co-pilot", and context.repoDir so file tools work in that repo.
        // Without body.tools this branch is exactly what it was.
        if (body.tools && typeof body.tools === 'object') {
          const toolRuntime = require('./tool-runtime');
          const T = body.tools;
          const scope = Array.isArray(T.scope) && T.scope.length ? T.scope : undefined;   // undefined = every registered tool
          const context = (T.repoDir || T.repoUuid) ? { repoDir: T.repoDir ? String(T.repoDir) : null, agentId: body.agentId || null, repoUuid: T.repoUuid ? String(T.repoUuid) : null } : null;   // 0.39.266 — repoUuid: the harness tools know their repo without the model passing it
          const identity = typeof T.identity === 'string' && T.identity.trim() ? T.identity.trim() : null;
          const maxIterations = Math.min(Math.max(parseInt(T.maxIterations, 10) || 6, 1), 12);
          // §CT6 0.39.352 — failed tool calls in a row that end the run (the caller climbs to a stronger model); 0 = no cap
          const maxToolErrors = Math.min(Math.max(parseInt(T.maxToolErrors, 10) || 0, 0), 20);
          // §CT8 — each tool call reported as it starts and ends to the caller's sink (idearium's tool-event route), so the
          // Code tab shows the agent working; loopback only, fire and forget, never in the way of the run
          const onToolCall = toolRuntime.toolEventSink(T.progressUrl, { session: sessionId || null, repoUuid: T.repoUuid ? String(T.repoUuid) : null });
          // §0.39.356 LS2 — what the model writes, as it writes it, to the caller's stream sink (idearium's agent/stream
          // route → the Code tab and the work surface). Ollama only: a browser agent's text reaches idearium through
          // guardian's own feed (0.39.244), with its DOM mutations and node anchor.
          const onStream = body.backend === 'guardian' ? null : toolRuntime.streamSink(T.streamUrl, { session: sessionId || null, repoUuid: T.repoUuid ? String(T.repoUuid) : null });
          // 0.39.258 — composed: the caller (idearium's repo agent) built the whole prompt from blocks the person
          // edits; the loop adds no system prompt, identity or turn labels (copilot/tool-runtime.js composed mode).
          const composed = T.composed === true;
          const resultTemplate = composed && typeof T.resultTemplate === 'string' ? T.resultTemplate : null;
          let loop;
          if (body.backend === 'guardian') {
            const agent = body.agent || 'guardian';
            // 0.39.265 — the first round carries the caller's canonical text (the question as typed, when copilot
            // reworded it), so guardian can join an identical in-flight job; tool rounds carry none.
            let _canon = typeof body.canonical === 'string' ? body.canonical : undefined;
            const dispatchToAgent = (fullPrompt, o = {}) => { const c = _canon; _canon = undefined; return _lifeline.dispatchToNcpAgent(fullPrompt, { ...o, provider: body.agent || undefined,
              agentId: body.agentId || undefined, timeoutMs: body.timeoutMs || undefined, requestId, sessionId, canonical: c }); };
            loop = await toolRuntime.runViaAgent(agent, dispatchToAgent, prompt, { toolScope: scope, identity: composed ? null : identity, context, maxIterations, composed, resultTemplate, maxToolErrors, onToolCall });
          } else {
            // §0.39.337 SB37 — the working set: the caller's 'workset' template and the question its signal is picked by
            const worksetTemplate = composed && typeof T.worksetTemplate === 'string' ? T.worksetTemplate : null;
            loop = await toolRuntime.run({ userPrompt: prompt, identity: composed ? null : identity, context, toolScope: scope, maxIterations, composed, resultTemplate, maxToolErrors, onToolCall,
              worksetTemplate, question: typeof T.question === 'string' ? T.question : null, sessionId,
              checklist: Array.isArray(T.checklist) ? T.checklist.slice(0, 20) : null,   // §0.39.339 SB39
              dispatch: (convo, sysContext, o) => _dispatchToOllama(convo, sysContext, { ...o, intent: 'tool-loop', requestId, sessionId, model: olModel, raw: composed }),
              pollJob: onStream ? _streamingPoll(onStream) : _pollOllamaJobHeadless });
          }
          const toolCallLog = (loop.toolCallLog || []).map(t => ({ name: t.name, arguments: t.arguments, iteration: t.iteration, scopeRejected: !!t.scopeRejected,
            ok: !(t.result && t.result.error), error: t.result && t.result.error ? String(t.result.error).slice(0, 300) : null }));
          const toolsInfo = { scope: scope ? scope.length : 'all', iterations: loop.iterations, calls: toolCallLog.length };
          if (loop.failed) { json(res, 502, { ok: false, error: loop.error, ...(loop.toolErrors ? { toolErrors: true } : {}), jobId: loop.jobId || null, toolCallLog, tools: toolsInfo, requestId }); return; }
          json(res, 200, { ok: true, text: loop.text, ...(loop.workset ? { workset: loop.workset } : {}), provider_used: body.backend === 'guardian' ? (body.agent || 'guardian') : 'ollama',
            model_used: body.backend === 'ollama' ? (olModel || null) : undefined, toolCallLog, tools: toolsInfo, requestId });
          return;
        }
        const result = await dispatchFn(prompt, { canonical: body.backend === 'guardian' && typeof body.canonical === 'string' ? body.canonical : undefined, provider: body.agent || undefined, agentId: body.agentId || undefined, compartmentId: body.backend === 'ollama' ? (body.compartmentId || undefined) : undefined, repoUuid: body.backend === 'ollama' ? (body.repoUuid || undefined) : undefined, timeoutMs: body.backend === 'guardian' ? (body.timeoutMs || undefined) : undefined, model: olModel, requestId, sessionId });
        if (result?.ok || result?.text) {
          json(res, 200, { ok: true, text: result.text, provider_used: body.backend === 'guardian' ? (result.provider || body.agent) : 'ollama', model_used: body.backend === 'ollama' ? (result.model || olModel || null) : undefined, requestId });
        } else {
          // 0.39.244 — jobId: guardian DID create a job (its reply may still come, late); absent = none was created.
          json(res, 502, { ok: false, error: result?.error || `${body.backend} unavailable or returned no real response`, jobId: result?.jobId || null, requestId });
        }
      } catch (e) {
        json(res, 502, { ok: false, error: e.message, requestId });
      }
      return;
    }

    // §GAP CLOSED 2026-07-07 — copilot's own hook registry declares seven
    // intents (ask|build|diagnose|navigate|note|tool|action); `ask` was
    // hardcoded at nine points in this file, and navigate/note/tool/action
    // had no implementation anywhere. copilot/intents.js implements those
    // four. Strictly ADDITIVE: route() returns null for ask/build/diagnose,
    // so every existing request falls through to the exact pipeline below,
    // unchanged. Only a genuinely-matched new intent returns early.
    try {
      const _intents = require('./intents.js');
      const intentResult = await _intents.route(prompt, {
        pushToCortex: (content, tags, tier) => new Promise((resolve, reject) => {
          const b = JSON.stringify({ content, tags, tier });
          const rq = http.request({ hostname: '127.0.0.1', port: 3748, path: '/api/push', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } },
            r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ try { resolve(JSON.parse(d)); } catch(e){ reject(e); } }); });
          rq.on('error', reject);
          rq.write(b); rq.end();
        }),
        runTools: async (userPrompt) => {
          // §SOVEREIGNTY 2026-07-09 — two violations lived here, both mine:
          // a require() into cortex's filesystem, and a hardcoded
          // `port: 3749` for ollama. Both resolved through lib/nexus-client
          // now: a caller that cannot name a port cannot hardwire one, and a
          // caller that asks over HTTP does not care which implementation
          // answers.
          const nx = require('../lib/nexus-client');
          let personaName = 'default';
          try {
            const r = await nx.get('cortex', `/api/personas?name=${encodeURIComponent(body.persona || 'default')}`, { timeout: 2500 });
            personaName = r?.persona?.name || 'default';
          } catch (_) { /* cortex unreachable — proceed with the default profile, never block the tool call */ }
          return nx.post('ollama', '/api/jobs/tools', { prompt: userPrompt, persona: personaName }, { timeout: 90000 });
        },
      });
      if (intentResult) {
        streamIngest({ type: 'copilot.answered', requestId, intent: intentResult.intent, modelUsed: 'copilot.intents' });
        json(res, intentResult.ok ? 200 : 400, { ...intentResult, requestId, sessionId, channel });
        return;
      }
    } catch (e) {
      // §1.2 — an intent-routing failure must never swallow a real request.
      // Log it and fall through to the existing, working ask pipeline.
      console.warn('[copilot] intent routing failed, falling through to ask:', e.message);
    }

    // §2026-08-09 — CA1-CA7, the autonomous layer, wired into the PRIMARY
    // entry point. First attempt landed only in /bridge/deliver (Bridge's
    // relay path) — checked with a real HTTP call against THIS route and
    // found it wasn't reached here at all, /api/prompt has its own separate
    // handler with its own fall-through chain (_intents.route(), then the
    // intuition fast-path below). Same "try, return early on match, else
    // fall through" shape as _intents.route() just above, so this doesn't
    // change what already works.
    try {
      const ar = require('./lib/autonomy-router');
      const auto = await ar.route(prompt, { sessionId, channel });
      if (auto) {
        streamIngest({ type: 'copilot.answered', requestId, modelUsed: 'nexus-autonomy' });
        json(res, 200, { ok: true, text: auto.text, modelUsed: 'nexus-autonomy', intent: 'autonomy', requestId, sessionId, channel, detail: auto.detail });
        return;
      }
    } catch (e) { console.warn('[copilot] autonomy routing failed, falling through:', e.message); }

    broadcast('copilot.prompt.received', { prompt: prompt.slice(0,100), channel, sessionId });

    // INTUITION — fast path (comp_id: nexus.copilot.intuition)
    const intuition = await _intuition.answer(prompt, session, _stream);
    if (intuition?.text) {
      const row = { uuid: crypto.randomUUID(), requestId, sessionId,
        prompt: prompt.slice(0,500), response: intuition.text,
        modelUsed: intuition.modelUsed, intent: intuition.intent,
        channel, componentId:'copilot.prompt', hookId:'copilot.prompt.reply',
        contextLayers: 1, fromStream: true, ts: Date.now() };
      await _persist('chat_log', row);
      const ui = await _buildSpotlightUI(intuition.text);
      json(res, 200, { ok:true, requestId, sessionId, ...intuition, channel, ...(ui ? { ui } : {}) });
      return;
    }

    // §P110: Cortex INTUITION fast path (L2 dual cognition)
    const cortexIntuition = await _queryCortexIntuition(prompt, sessionId);
    if (cortexIntuition?.text && (cortexIntuition?.confidence || 0) > 0.75) {
      const row = { uuid: crypto.randomUUID(), requestId, sessionId,
        prompt: prompt.slice(0,500), response: cortexIntuition.text,
        modelUsed: 'cortex.intuition', intent: cortexIntuition.intent || 'ask',
        channel, componentId:'copilot.prompt', hookId:'copilot.prompt.reply',
        contextLayers: 2, fromStream: true, source: 'cortex.intuition', ts: Date.now() };
      await _persist('chat_log', row);
      const ui = await _buildSpotlightUI(cortexIntuition.text);
      json(res, 200, { ok:true, requestId, sessionId, text: cortexIntuition.text,
        modelUsed: 'cortex.intuition', channel, source: 'cortex.intuition', ...(ui ? { ui } : {}) });
      return;
    }

    // §P73: 7-layer context via copilot-context.js
    let contextText = '';
    const cc = _getCopilotContext();
    if (cc) {
      try {
        const snap = await cc.assemble({ eventBuffer: _stream, intent: prompt });
        contextText = snap.text;
        broadcast('copilot.context.assembled', { layers: Object.keys(snap.layers).length, tokens: snap.tokensUsed });
      } catch(e) {
        contextText = await _analysis.assembleContext(prompt, _stream, session);
        broadcast('copilot.context.assembled', { layers: 7, fallback: true });
      }
    } else {
      contextText = await _analysis.assembleContext(prompt, _stream, session);
      broadcast('copilot.context.assembled', { layers: 7, noCopilotContext: true });
    }

    // §P103: session history injection (first exchange only)
    contextText = _injectUserModel(contextText);   // §UM2 — know the user on every path
    _captureUserSignals(prompt, channel);   // §UM3 — richer capture
    contextText = await _injectSessionHistory(session, contextText);
    // §BUILT 2026-07-13 — chunk_2: associative recall, every exchange (not
    // just session-start), best-effort, never blocks.
    contextText = await _injectRecallContext(prompt, contextText);

    // §P110: Cortex MASTERMIND causal enrichment
    const mastermindRule = _getInjectRule('mastermind');
    if (mastermindRule.enabled) {
      const mastermind = await _queryCortexMastermind(prompt, contextText.slice(0, 500), sessionId);
      if (mastermind?.analysis) {
        const maxChars = mastermindRule.limits?.analysisMaxChars ?? 400;
        const block = (mastermindRule.template || '\n\n=== CORTEX MASTERMIND ===\n{analysis}').replace('{analysis}', mastermind.analysis.slice(0, maxChars));
        contextText += block;
        broadcast('copilot.mastermind.enriched', { sessionId });
      }
    }

    // Route through LIFELINE — Ollama primary, Guardian fallback
    let text = '';
    let modelUsed = 'none';
    let lifeError = null;
    try {
      const lifeResult = await _lifeline.route(
        `${contextText}\n\nUSER: ${prompt}\nNEXUS CO-PILOT: `,
        { requestId, sessionId: session.sessionId, intent: callerIntent, channel, provider: resolvedProvider }
      );
      text      = lifeResult?.text || '';
      modelUsed = lifeResult?.provider_used || 'none';
      lifeError = lifeResult && !lifeResult.ok ? (lifeResult.error || null) : null;   // §SD2
      if (lifeResult?.escalated) broadcast('copilot.lifeline.escalated', { provider: lifeResult.provider_used });
    } catch(e) {
      text = `Analysis failed: ${e.message}`;
      // §ADDED 2026-07-06 — a lifeline failure used to only ever exist as
      // the text of the answer shown to the person asking. Now also lands
      // in data/copilot/failures.jsonl, queryable and correlatable with
      // everything else logged the same way.
      try { require('../lib/ledger-writer').writeFailure('copilot', e, { module: 'lifeline', source: 'api.prompt', prompt: prompt.slice(0,200) }); } catch(_) {}
    }

    const row = { uuid: crypto.randomUUID(), requestId, sessionId,
      prompt: prompt.slice(0,500), response: text.slice(0,2000),
      modelUsed, intent: callerIntent, channel,
      componentId:'copilot.prompt', hookId:'copilot.prompt.reply',
      contextLayers: 7, fromStream: true, ts: Date.now() };
    await _persist('chat_log', row);
    streamIngest({ type: 'copilot.answered', requestId, intent: callerIntent, modelUsed });

    if (!String(text || '').trim()) { json(res, 200, _noAnswer({ requestId, sessionId, modelUsed, lifeError, intent: 'ask', channel })); return; }   // §SD2
    const ui = await _buildSpotlightUI(text);
    json(res, 200, { ok:true, requestId, sessionId, text, modelUsed, intent:'ask',
      channel, contextLayers: 7, fromStream: true, ...(ui ? { ui } : {}) });
    return;
  }

  if (method === 'POST' && p === '/api/channel') {
    const body = await readBody(req);
    const { channelId, channelName } = body || {};
    if (!channelId) { json(res, 400, { ok:false, error:'channelId required' }); return; }
    for (const s of _sessions.values()) s.channel = channelId;
    broadcast('copilot.channel.changed', { channelId, channelName });
    json(res, 200, { ok:true, channelId, channelName });
    return;
  }

  if (method === 'POST' && p === '/api/observe') {
    const body = await readBody(req);
    const { type, element, channel } = body || {};
    try {
      const um = require('../copilot/lib/user-model');
      if (type === 'confusion' && element && um.recordError) {
        um.recordError(`ui_confusion:${element}`, channel || 'unknown', 'low');
      }
    } catch(_) {}
    json(res, 200, { ok:true });
    return;
  }

  if (method === 'POST' && p === '/api/stream/ingest') {
    const body = await readBody(req);
    if (body.type) streamIngest(body);
    json(res, 200, { ok:true, depth: _stream.length });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

// ── Register with orchestrator ────────────────────────────────────────────────
function register() {
  const components = require('./registry-components');
  const body = JSON.stringify({ systemId:SYSTEM_ID, port:PORT, version:VERSION,
    status:'online', meta:{ label:'COPILOT', color:'#cc44ff' },
    components: components.components || [] });
  const u = new URL(`${OR_URL}/api/register`);
  const r = http.request({ hostname:u.hostname, port:u.port||9000, path:u.pathname,
    method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
    timeout:4000 }, () => {
    console.log('[copilot] registered');
    // §Phase-0 nerve-pulse 2026-07-01 — start recurring heartbeat so this
    // system appears in nexus-bus._sources and Nerve's presence layer can
    // track it. Without this, copilot registered once and was then invisible
    // to the bus's per-source emitCount/lastSeen map that the Nerve read
    // layer reads. startHeartbeat pings /api/heartbeat every 10s, unref'd
    // so it doesn't block process exit. Confirmed absent before this add —
    // grep for 'startHeartbeat\|createPulse' in copilot/server.js returned
    // zero matches per the Phase 0 audit this session.
    try {
      const { startHeartbeat } = require('../nexus/nexus-connect');
      startHeartbeat(SYSTEM_ID, PORT);
    } catch (_) { /* nexus-connect optional — never crash the server over a heartbeat */ }
  });
  r.on('error', () => setTimeout(register, 5000));
  r.write(body); r.end();
}

// §BUG FIXED 2026-07-11 — this used to call server.listen() unconditionally
// at module load, meaning any `require('./copilot/server.js')` — including
// from a test wanting only extractDispatchText — started a real HTTP
// server bound to :3750 as a side effect. This is very likely WHY
// tests/modules/copilot-handshake-dispatch.test.js duplicated the dispatch
// logic as an inline mock instead of importing the real functions: doing
// so safely wasn't possible before this guard existed. Standard Node
// pattern — only listen when this file is the actual entrypoint
// (`node copilot/server.js`), not when something else requires it for
// what it exports.
if (require.main === module) {
server.listen(PORT, () => {
  console.log(`[copilot] :${PORT} — v${VERSION} — P73/P103/P110/P112/AX-008 wired`);
  setTimeout(register, 1000);
  setTimeout(_connectCortexStream, 2000);
  setTimeout(_connectGuardianStream, 3000);
  setTimeout(_connectIdeariumStream, 4000);
  // 0.39.272 — the opportunity cycle on James's own schedule (profile.schedule.everyMinutes; 0 = off, the default)
  setTimeout(() => { try { require('./routes/opportunity.js').startScheduler(); } catch (e) { console.warn(`[copilot] opportunity scheduler not started: ${e.message}`); } }, 6000);

  // §RAID-FIX 2026-09-16 — James: "raid also needs to stop failing, i
  // dont think its using... ncp." Real, traced gap: register() above
  // already POSTs copilot's components to orchestrator's /api/register
  // — but that feeds ORCHESTRATOR's own component-registry instance
  // (orchestrator.js calls compReg.init(jaaDB, nexusBus) on its own
  // boot — a second, separate registry living in orchestrator's own
  // process, for orchestrator's own presence/trust/heartbeat purposes).
  // cortex/core/raid/router.js resolves against CORTEX's registry
  // instance (cortex/boot.js's own capabilityRegistry.init(...)) — a
  // different process, a different in-memory registry. copilot's real
  // capabilities were always reaching orchestrator, never cortex, so
  // RAID could never route to NCP. This is additive, not a replacement
  // for register() above — orchestrator's own registration still does
  // its own real job (system.registered broadcast, contract
  // verification, heartbeat) and is untouched.
  try {
    const { registerSelfRemote } = require('../lib/self-register-remote.js');
    registerSelfRemote('copilot', [
      { name: 'prompt',       description: 'dispatch a prompt to the live co-pilot — real system state, gap/component/test awareness',
        route: { method: 'POST', path: '/api/prompt' } },
      { name: 'prompt_tools', description: 'dispatch a prompt with the full agent-tools registry available — the same loop wake-relay and autonomous jobs run',
        route: { method: 'POST', path: '/api/prompt/tools' } },
      { name: 'diagnose',     description: 'run real diagnostics — system health, bottlenecks, friction, queue state',
        route: { method: 'POST', path: '/api/diagnose' } },
      { name: 'build',        description: 'trigger a real build/pipeline action through copilot',
        route: { method: 'POST', path: '/api/build' } },
    ], { registeredBy: 'copilot/server.js' }).then((r) => {
      if (r.ok) console.log(`[copilot] registered ${r.registered} capabilit${r.registered === 1 ? 'y' : 'ies'} with RAID (cortex)`);
      else console.warn(`[copilot] RAID self-registration incomplete: ${r.error || (r.failed + ' failed')}`);
    });
  } catch (err) {
    console.warn('[copilot] RAID self-registration failed:', err.message);
  }

  // §ADDED 2026-07-07 — continuous stream digest. The _stream buffer is
  // already fed live from Cortex/Guardian SSE and already flows into
  // context assembly; this adds the two missing pieces (normalize to
  // plain text, push a durable digest into Cortex so nothing is lost on
  // restart). Pushes to the real /api/push endpoint built this session.
  try {
    const { StreamDigest } = require('./stream-digest.js');
    const _digest = new StreamDigest({
      getStream: () => _stream,
      pushToCortex: (content, tags, tier) => {
        const body = JSON.stringify({ content, tags, tier });
        const u = new URL(`${CX_URL}/api/push`);
        const req = http.request({ hostname: u.hostname, port: u.port || 3748, path: '/api/push', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, () => {});
        req.on('error', () => {}); // digest is best-effort, never crashes copilot
        req.write(body); req.end();
      },
      intervalMs: 60000,
    });
    _digest.start();
    console.log('[copilot] stream-digest started — activity persists to Cortex every 60s');
  } catch (e) { console.warn('[copilot] stream-digest not started:', e.message); }

  // §WIRED 2026-08-12 — schedule_task/register_trigger (lib/agent-tools) write
  // to lib/scheduler.js and lib/triggers.js, which persist to cortex but only
  // ARM a live timer `if (_running)`. Grepped the whole tree before adding this:
  // nothing outside tests/ ever called .start() on either module, so every
  // task/trigger created through the new tools — and the 6 tasks + 1 trigger
  // already sitting in cortex from before this fix — persisted and then never
  // fired. copilot is the natural owner: both modules' own docblocks are
  // written for it ("co-pilot can schedule tasks, jobs, alarms..."). Each
  // .start() hydrates existing rows from cortex and arms them; same
  // never-crash-the-server guard as stream-digest above.
  try {
    require('../lib/scheduler.js').start();
    console.log('[copilot] scheduler started — persisted tasks hydrated and armed');
  } catch (e) { console.warn('[copilot] scheduler not started:', e.message); }
  try {
    require('../lib/triggers.js').start();
    console.log('[copilot] triggers started — persisted triggers hydrated and armed');
  } catch (e) { console.warn('[copilot] triggers not started:', e.message); }

  // §WIRED 2026-08-13 — R3 (docs/repair-contract-and-loom-hub-phasemap.spec)
  // built lib/autonomous-repair.js, the exact "loom notices and fixes itself"
  // wire James asked for: detected gap -> diagnose -> raid.verify (isolate ->
  // sigma/drift -> compare -> rewind-on-fail) -> apply only on pass. Marked
  // DONE 2026-08-12, 7 tests passing — but wireAutonomousRepair() itself was
  // NEVER CALLED anywhere outside its own test file, confirmed by grepping
  // every real caller of registerTrigger() in the whole tree: only this
  // module's own internals and the manual register_trigger agent-tool. The
  // exact same "declared \u2260 real" gap this phasemap's own R3 entry
  // documents finding and fixing for repair-on-prompt.js one layer down —
  // recurred one layer up, in the thing that was supposed to fix it. Found
  // while wiring loom/intelligence self-healing per James's direct request.
  // triggers.js must be .start()-ed first (immediately above) since this
  // registers a live trigger against it; same never-crash-the-server guard.
  try {
    require('../lib/autonomous-repair.js').wireAutonomousRepair();
    console.log('[copilot] autonomous-repair wired — gap-field.found events for chunk-build exhaustion now trigger real diagnose->raid.verify->apply, not just detection');
  } catch (e) { console.warn('[copilot] autonomous-repair not wired:', e.message); }

  // §WIRED 2026-08-13 — hat-forge has been live since P8 with working
  // forge/get/list/revoke, but list() returned []: the mechanism shipped with
  // nothing in it, which is indistinguishable from a mechanism that doesn't
  // work. lib/hat-seed.js forges four real, scoped hats (auditor,
  // diagnostician, builder, librarian). Idempotent — it skips any hat already
  // present and never overwrites one you edited by hand. Seeds carry NO
  // responsibilities: those create real recurring NCP dispatches, and starting
  // browser jobs against claude/chatgpt unasked at boot is not a default
  // anyone consented to. Same never-crash-the-server guard as above.
  try {
    require('../lib/hat-seed.js').seedHats();
  } catch (e) { console.warn('[copilot] hats not seeded:', e.message); }

  // §WIRED 2026-08-12 — buildNexusModel() (copilot/lib/self-model.js) existed
  // complete but self_model had 0 rows: nothing ever called it, AND its own
  // persist call was miswired against lib/cortex-write.js's real factory
  // contract (fixed same session). Fixed both halves — this is the "never
  // goes stale again" half: a recurring schedule_task, same mechanism P2's
  // never-say-no and every schedule_task-authored task use, so the model in
  // cortex tracks reality instead of being a one-time manual snapshot.
  try {
    const scheduler = require('../lib/scheduler.js');
    const EXISTING_ID = 'self-model-refresh';
    if (!scheduler.get(EXISTING_ID)) {
      scheduler.schedule({
        id: EXISTING_ID, name: 'self-model-refresh', everyMs: 3600000, maxRuns: Infinity,
        target: { kind: 'fn' },
        fn: async () => require('./lib/self-model.js').buildNexusModel({}),
        intent: 'scheduled.self-model-refresh',
      });
      console.log('[copilot] self-model-refresh scheduled — buildNexusModel() every hour, persists to cortex self_model');
    }
  } catch (e) { console.warn('[copilot] self-model-refresh not scheduled:', e.message); }

  // §WIRED 2026-08-12 (P7c, docs/copilot-full-capability-phasemap.spec) —
  // lib/nerve-ollama-bridge.js exists and is correct (live-verified this
  // session, including a route-order bug found and fixed by that same
  // testing) but on its own is only a function someone has to remember to
  // call. This is the "continuous" half: a recurring schedule_task, same
  // mechanism as self-model-refresh above, so Nerve's per-window attention
  // actually flows into ollama's standing context channel on its own.
  // Channel id fixed at 'nexus-live' — the one standing channel this
  // bridge feeds; a caller wanting the live context uses that channel id
  // with ollama's /api/stream routes.
  try {
    const scheduler = require('../lib/scheduler.js');
    const BRIDGE_TASK_ID = 'nerve-ollama-bridge-push';
    if (!scheduler.get(BRIDGE_TASK_ID)) {
      scheduler.schedule({
        id: BRIDGE_TASK_ID, name: 'nerve-ollama-bridge-push', everyMs: 5000, maxRuns: Infinity,
        target: { kind: 'fn' },
        fn: async () => require('../lib/nerve-ollama-bridge.js').pushContext('nexus-live'),
        intent: 'scheduled.nerve-ollama-bridge-push',
      });
      console.log('[copilot] nerve-ollama-bridge-push scheduled — Nerve window activity -> ollama channel "nexus-live" every 5s');
    }
  } catch (e) { console.warn('[copilot] nerve-ollama-bridge-push not scheduled:', e.message); }
});
}

module.exports = { server, streamIngest, _resolveIntuitionResponse, extractDispatchText, resolveDefaultBackend };
