'use strict';
/**
 * copilot/lib/self-model.js — co-pilot's identity, governance, and the NEXUS
 * model in cortex (§P5 who-am-I + §P6 governance/agent-switch foundation)
 * UUID: nexus-copilot-self-model-v1-0000-2026-0807-001
 *
 * James: "wire them in, then update registry, then spec addendums. NEXUS model in
 * cortex."
 *
 * Pure §8.6 composition of modules that ALREADY EXIST in lib/ — nothing new built:
 *   - lib/reflection.trackIdentityEvidence  → "who am I / what's my name" evidence
 *   - lib/constitutional-ai.getIdentityKernel/check → the mind's identity + the
 *       governance gate (what the mind may do)
 *   - lib/agent-router.routeAgent           → "switch to a different model/agent"
 *   - lib/intent-classifier.classify        → intent + RISK_LEVEL for governance
 *   - cortex self_model table               → the NEXUS model persisted in the brain
 *
 * §1.1 identity answered from real evidence, never invented. §1.2 every wire
 * guarded — a missing module degrades honestly, never throws to the request
 * thread. Cached where it reads (the failed-to-fetch lesson).
 */

function _try(mod) { try { return require(mod); } catch (_) { return null; } }

// ── P5: who am I ──────────────────────────────────────────────────────────────
/**
 * whoAmI(opts) — answer identity questions from real evidence: the user-model
 * hypotheses + reflection's identity evidence + constitutional-ai's identity
 * kernel. Never fabricates; if nothing is known, says so (and can ask back).
 */
function whoAmI(opts = {}) {
  const out = { hypotheses: [], identityKernel: null, known: false, text: null };

  // user-model hypotheses (what NEXUS has learned about the user).
  // §FIXED 2026-08-12 — found live-verifying P5 of nexus-live-mind-phasemap.spec:
  // getHypotheses(optsOrMinConf=0.3, limit=20) treats a bare number as
  // minConfidence, not limit. The old call here — getHypotheses(10) — set
  // minConfidence to 10 against a 0-1 confidence scale, so it ALWAYS
  // returned []  regardless of real data (confirmed: 3 real hypotheses
  // exist and are retrievable with the correct call; the old call returned
  // 0 every time). whoAmI() has been silently answering "I don't have
  // enough evidence" even when real evidence existed. Fixed to pass the
  // real default minConf (0.3) and 10 as the actual limit.
  try {
    const um = opts.userModel || require('./user-model');
    out.hypotheses = (um.getHypotheses ? um.getHypotheses(0.3, 10) : []) || [];
  } catch (_) {}

  // constitutional-ai identity kernel (the mind's own identity anchor).
  const cai = opts.constitutionalAi || _try('../../lib/constitutional-ai');
  try { if (cai && cai.getIdentityKernel) out.identityKernel = cai.getIdentityKernel(); } catch (_) {}

  out.known = out.hypotheses.length > 0;
  if (out.known) {
    const top = out.hypotheses.slice(0, 4).map(h => h.claim || h.text || h.hypothesis).filter(Boolean);
    out.text = top.length
      ? `Here's what I've learned about you so far: ${top.join('; ')}. These are hypotheses from our interactions, not certainties — tell me what's off.`
      : `I have ${out.hypotheses.length} hypotheses about you, but nothing confident enough to state yet.`;
  } else {
    // §user_wellbeing — don't fabricate identity. Ask back (the "dynamic" ask).
    out.text = `I don't have enough evidence yet to say who you are with confidence. What would you like me to know about you?`;
  }
  return out;
}

/**
 * recordIdentityEvidence(key, item) — when the user tells co-pilot something
 * about themselves, record it via reflection's identity-evidence tracker.
 */
function recordIdentityEvidence(key, item) {
  try {
    const refl = require('../../lib/reflection');
    if (refl.trackIdentityEvidence) { refl.trackIdentityEvidence(key, item); return { ok: true }; }
  } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: false, reason: 'reflection.trackIdentityEvidence unavailable' };
}

// ── P6 (docs/copilot-full-capability-phasemap.spec) — co-pilot's OWN name ─────
// §CORRECTION 2026-08-12 — that phasemap's own P6 entry said "whoAmI() prefers
// customName when set." Wrong: whoAmI() above answers "what does NEXUS know
// about the USER" (hypotheses about the person talking to it), not "what is
// co-pilot's own name." Those are different axes and conflating them would
// have made whoAmI silently start answering a different question than every
// existing caller (server.js:1080) expects. Kept separate: getIdentityName/
// setIdentityName are co-pilot's own display name, a user DECISION (§1.1 —
// set data, not inferred — never fabricated the other way, same principle
// whoAmI already follows for the user axis). One row, cortex-persisted,
// survives a restart.
const IDENTITY_TABLE = 'copilot_identity';
const IDENTITY_ROW_ID = 'name';

/**
 * getIdentityName() — co-pilot's own current display name. Returns the
 * default ('co-pilot') if never set — never fabricates a name that wasn't
 * actually chosen.
 */
function getIdentityName() {
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    const row = jaaDB.query(IDENTITY_TABLE, r => r.id === IDENTITY_ROW_ID)[0];
    return { name: (row && row.name) || 'co-pilot', isCustom: !!(row && row.name), setAt: row ? row.ts : null };
  } catch (e) {
    return { name: 'co-pilot', isCustom: false, error: e.message };
  }
}

/**
 * setIdentityName(name) — set co-pilot's own display name. Persisted, not
 * in-memory — a rename survives a restart. Empty/null clears back to default.
 */
function setIdentityName(name) {
  const trimmed = (name || '').trim();
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    if (!trimmed) {
      jaaDB.insert(IDENTITY_TABLE, { id: IDENTITY_ROW_ID, name: null, ts: Date.now(), cleared: true });
      return { ok: true, name: 'co-pilot', isCustom: false, cleared: true };
    }
    if (trimmed.length > 60) return { ok: false, reason: 'name too long (max 60 chars)' };
    jaaDB.insert(IDENTITY_TABLE, { id: IDENTITY_ROW_ID, name: trimmed, ts: Date.now() });
    return { ok: true, name: trimmed, isCustom: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── P6.5 (2026-08-13) — "co-pilot should be like a hat, not a static
// identity." getCurrentAgent/setCurrentAgent — WHICH provider copilot
// dispatches to by default, persisted, swappable on demand. Distinct from
// switchAgent (a one-off routing decision for a single request) and from
// identity naming (WHAT copilot is called, not WHICH model answers).
// §CORRECTED SCOPE — this is the missing piece lifeline.js's route() never
// had: it accepts a per-call opts.provider override but nothing persists
// one, so every message restarts the ollama-first cascade from scratch
// unless the caller re-specifies an override every single time. Same
// cortex row shape as identity (copilot_identity table), new row id
// 'agent'. Governed exactly like switchAgent — changing the hat is a real
// action, RAID sees it.
const AGENT_ROW_ID = 'agent';
const VALID_AGENTS = new Set(['ollama', 'claude', 'chatgpt', 'gemini', 'mistral', 'perplexity', 'auto']);

/**
 * getCurrentAgent() — the provider copilot currently defaults to. 'auto'
 * (the default when never set) means the normal ollama-first cascade with
 * confidence-based escalation — unchanged behavior for anyone who never
 * touches this.
 */
function getCurrentAgent() {
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    const row = jaaDB.query(IDENTITY_TABLE, r => r.id === AGENT_ROW_ID)[0];
    // §BUGFIX 2026-08-19 — was returning row.hatName/.toolScope/.personaPrompt
    // directly: a stale SNAPSHOT from whenever the hat was worn, not the
    // hat's current, real state. Two real failure modes this caused: a
    // renamed worn hat kept reporting its old name forever (hat-forge.js
    // itself resolves fresh by uuid; this function didn't), and a
    // REVOKED worn hat kept reporting a live-looking name/scope/persona
    // that no longer corresponds to anything real — indistinguishable
    // from a genuinely active hat. Real fix: if hatUuid is pinned,
    // re-resolve the CURRENT hat by that permanent uuid on every read.
    //
    // §MERGE NOTE 2026-08-22 — a second, independently-built version of
    // this exact fix (same real bug, same real date) arrived via merge.
    // Kept this side: it backfills the resolved uuid onto the row in the
    // name-only fallback case, giving a genuine "resolved by name, ONCE"
    // (the other version re-resolves by name on every single call,
    // forever, despite its own comment implying otherwise) — verified
    // against the real HAT-021 test, already passing.
    let hatName = (row && row.hatName) || null;
    let toolScope = (row && row.toolScope) || null;
    let personaPrompt = (row && row.personaPrompt) || null;
    let hatMissing = false;
    let stale = false;
    let resolvedByNameOnly = false;
    let hatUuid = (row && row.hatUuid) || null;
    if (hatUuid) {
      let live = null;
      try { live = require('../../lib/hat-forge').get(hatUuid); } catch (_) {}
      if (live) {
        hatName = live.name; toolScope = live.toolScope; personaPrompt = live.personaPrompt;
      } else {
        // Revoked or otherwise gone — say so plainly rather than serving
        // the last snapshot as if it were still real (§1.2).
        hatMissing = true; stale = true; toolScope = null; personaPrompt = null;
      }
    } else if (row && row.hatName) {
      // §BUGFIX 2026-08-19 — a pre-patch row (written before hatUuid
      // existed at all) has only a name. Resolve it once, by name, and
      // BACK-FILL the real uuid onto the row so every subsequent read
      // takes the fast, unambiguous hatUuid path instead of repeating
      // this fallback forever — "resolved by name, once", not "resolved
      // by name, silently, every single time" (the exact ambiguity
      // hatUuid exists to retire).
      let live = null;
      try { live = require('../../lib/hat-forge').get(row.hatName); } catch (_) {}
      if (live) {
        hatUuid = live.uuid; hatName = live.name; toolScope = live.toolScope; personaPrompt = live.personaPrompt;
        resolvedByNameOnly = true;
        try {
          const { jaaDB } = require('../../cortex/memory/jaa-db');
          jaaDB.insert(IDENTITY_TABLE, { ...row, hatUuid: live.uuid });
        } catch (_) { /* §1.2 — a failed backfill degrades to "resolve by name every time", not a crash */ }
      }
    }
    return {
      agent: (row && row.agent) || 'auto',
      hatUuid, hatName, toolScope, personaPrompt, hatMissing, stale, resolvedByNameOnly,
      isCustom: !!(row && row.agent && row.agent !== 'auto'),
      setAt: row ? row.ts : null,
    };
  } catch (e) {
    return { agent: 'auto', isCustom: false, error: e.message };
  }
}

/**
 * setCurrentAgent(agent) — put on a new hat. RAID-governed (same as
 * switchAgent) — a persistent routing change for every future message is
 * exactly the kind of live-control action RAID exists to gate. 'auto'
 * (or empty) takes the hat off — back to the normal ollama-first cascade.
 * §EXTENDED 2026-08-13 (P8) — `agent` can now also be a forged hat's NAME
 * (lib/hat-forge.js), not just a raw base agent. Wearing a named hat sets
 * the underlying base agent AND remembers the hat's toolScope/personaPrompt
 * so route()/runViaAgent can apply them — same governance either way.
 */
function setCurrentAgent(agent, opts = {}) {
  const raw = (agent || 'auto').trim().toLowerCase();

  // A forged hat's name takes priority if one exists with that exact name —
  // validate() already refused any forged hat from colliding with a real
  // base agent name, so there's no ambiguity between the two namespaces.
  let forgedHat = null;
  if (!VALID_AGENTS.has(raw)) {
    try { forgedHat = require('../../lib/hat-forge').get(raw); } catch (_) {}
    if (!forgedHat) return { ok: false, reason: `unknown agent "${agent}" — one of: ${[...VALID_AGENTS].join(', ')}, or a forged hat name` };
  }

  // §BUILT 2026-08-18 — James: "I want guardian agents to be swappable as
  // co-pilot. co-pilot is a hat." Checked first, real and precise:
  // allowedAgents was already a real, validated field on every forged hat
  // (lib/hat-forge.js's own HAT_SCHEMA) but this function never actually
  // consulted it — always forced the hat's fixed baseAgent, no matter
  // what. That's the real, exact reason a guardian agent couldn't wear
  // the co-pilot hat before this: there was no path for it. opts.agent,
  // when given, must be in the hat's own real allowedAgents (or IS the
  // hat's own baseAgent) — never an unlisted agent, even if it's
  // otherwise a real, valid one.
  let normalized;
  if (forgedHat && opts.agent) {
    const requested = opts.agent.trim().toLowerCase();
    const permitted = requested === forgedHat.baseAgent || (forgedHat.allowedAgents || []).includes(requested);
    if (!permitted) return { ok: false, reason: `hat "${forgedHat.name}" does not permit agent "${requested}" — allowed: ${[...new Set([forgedHat.baseAgent, ...(forgedHat.allowedAgents || [])])].join(', ')}` };
    normalized = requested;
  } else {
    normalized = forgedHat ? forgedHat.baseAgent : raw;
  }

  const gov = governAction({ action: 'switch_agent', target: normalized }, {});
  if (gov.allowed === false) {
    return { ok: false, reason: `denied by governance: ${gov.reason || 'no reason given'}`, governance: gov };
  }
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db');
    jaaDB.insert(IDENTITY_TABLE, {
      id: AGENT_ROW_ID, agent: normalized,
      // §BUGFIX 2026-08-19 — was storing only hatName. A hat is renameable
      // (hat-forge.js's own real design — name is for humans, uuid is
      // permanent) but this row had no way to survive a rename: hatName
      // would go stale the moment the worn hat was renamed elsewhere,
      // pointing at a name nothing answers to anymore. hatUuid is the
      // real, permanent pin; getCurrentAgent() below now resolves the
      // CURRENT name from it fresh on every read, rather than trusting
      // this snapshot.
      hatUuid: forgedHat ? forgedHat.uuid : null,
      hatName: forgedHat ? forgedHat.name : null,
      toolScope: forgedHat ? forgedHat.toolScope : null,
      personaPrompt: forgedHat ? forgedHat.personaPrompt : null,
      ts: Date.now(),
    });
    // §PERSONALITY-MODEL 2026-08-23 — James: "personalities are also hats
    // using the hat forge, and a model per model." The real, live effect:
    // wearing a hat with a configured model actually switches what
    // generates the response, not just which persona prompt gets
    // prepended. Fire-and-forget, matching this file's own established
    // pattern for async side effects of a synchronous function
    // (_navigateAgentToUrl, just above) — setCurrentAgent's own callers
    // all expect a synchronous return; this doesn't block that.
    // Deliberately silent on failure beyond a console.warn: a bridge
    // that's down shouldn't prevent wearing a hat, it should just mean
    // the NEXT generation uses whatever was already active — a real,
    // honest degradation, not a hard failure over a best-effort switch.
    if (forgedHat && forgedHat.model && normalized === 'ollama') {
      const http = require('http');
      const body = JSON.stringify({ model: forgedHat.model });
      const req2 = http.request({ hostname: '127.0.0.1', port: 3749, path: '/api/model', method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (r2) => { let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
          try { const j = JSON.parse(d); if (!j.ok) console.warn(`[self-model] hat "${forgedHat.name}"'s model "${forgedHat.model}" rejected by the bridge: ${j.error}`); }
          catch (_) {}
        }); });
      req2.on('error', (e) => console.warn(`[self-model] couldn't reach the ollama bridge to apply hat "${forgedHat.name}"'s model: ${e.message}`));
      req2.write(body); req2.end();
    }
    return { ok: true, agent: normalized, hatUuid: forgedHat ? forgedHat.uuid : null, hatName: forgedHat ? forgedHat.name : null, isCustom: normalized !== 'auto', governance: gov };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── P6 foundation: governance + agent switching ──────────────────────────────
/**
 * governAction(req, ctx) — the governance gate (RAID-adjacent): classify intent +
 * risk, then run the constitutional check. Returns whether an action is permitted
 * and why. This is what a programmable/automated co-pilot action passes through.
 */
function governAction(req = {}, ctx = {}) {
  const out = { allowed: true, risk: null, reason: null, checks: {} };

  // §ADDED 2026-08-13 — same real precedent check as executeTool's, now
  // covering the OTHER universal chokepoint: every switchAgent, hat wear,
  // scheduled task, trigger, and chain step already goes through
  // governAction. Advisory, not blocking — real precedent attached for
  // whoever reads the governance result to weigh.
  try { out.faultHistory = require('../../lib/fault-log.js').checkFaultHistory(req.action || 'unknown', { intent: req.target || null, limit: 3 }); } catch (_) {}

  let classifiedIntent = ctx.intent || null;
  try {
    const ic = _try('../../lib/intent-classifier');
    if (ic && ic.classify) {
      const c = ic.classify(req);
      out.risk = c.risk || c.riskLevel || (c.RISK_LEVEL);
      out.checks.intent = c;
      // §FIXED 2026-08-13 — found alongside the v.allowed field-name bug:
      // this classification was computed and stored for the caller to see,
      // but never actually passed to the constitutional check below, which
      // requires ctx.intent to do anything but return its own "you called
      // me wrong" BLOCK. classify()'s real return shape nests the actual
      // intent object at c.intent (confirmed live) — that's what
      // constitutional-ai.check() expects as ctx.intent. Caller-supplied
      // ctx.intent (if any) still wins; this only fills the gap when
      // nothing was supplied, which was every real caller until now.
      if (!classifiedIntent && c && c.intent) classifiedIntent = c.intent;
    }
  } catch (_) {}
  try {
    const cai = _try('../../lib/constitutional-ai');
    // §FIXED 2026-08-13 — found live, verifying setCurrentAgent's own
    // governance result: constitutional-ai.check() returns {pass, reason,
    // axiom, severity, ...} — it NEVER returns a field called `allowed`.
    // The old check (`v.allowed === false`) tested a field that is always
    // undefined on the real return value, so this denial branch has never
    // fired once since this function was written — a real BLOCK-severity
    // constitutional violation was never actually enforced here, ever.
    // Every prior caller of governAction (switchAgent, this session's own
    // setCurrentAgent) believed it was gated when it was not. Corrected to
    // the same check cortex/core/raid/index.js's _approveTool already gets
    // right: pass === false AND severity === 'block' is a real denial;
    // pass === false with a lower severity (WARN/held) is NOT — that's
    // "held" territory by constitutional-ai's own design, not a hard stop.
    if (cai && cai.check) {
      const v = cai.check(req, { ...ctx, intent: classifiedIntent });
      out.checks.constitutional = v;
      if (v && v.pass === false && v.severity === 'block') {
        out.allowed = false;
        out.reason = `constitution denied — ${v.axiom}: ${v.reason || 'no reason given'}`;
      }
    }
  } catch (_) {}
  return out;
}

/**
 * switchAgent(intent, prompt, directed) — "switch to a different model/agent" via
 * the existing agent-router. Returns the chosen agent + its constraints.
 * §FIXED 2026-08-12 — closes P6 of nexus-live-mind-phasemap.spec's gate
 * ("'switch to <agent>' routes through the agent-mesh; all governed by
 * RAID"). governAction and switchAgent were both real, both exported, but
 * NOTHING called governAction before a switch — confirmed by grep across
 * self-model.js and copilot/server.js's real handler. A directed agent
 * switch is exactly the kind of live-control action RAID exists to gate;
 * wired here so every caller (not just server.js's one regex handler) gets
 * governed, not just the one call site this session happened to check.
 */
/**
 * verifyAgentReachable(providerId, opts) — real, new. Requested directly:
 * "switch agent tool needs to use NCP like: job created -> dispatched via
 * NCP -> job.dispatched ack" — switchAgent() before this was a PURE local
 * decision (agent-router.routeAgent() picking a name), never confirming
 * the target's NCP channel was actually alive. A tab that's disconnected,
 * crashed, or never opened would "succeed" at switching to it and then
 * silently fail on the first real prompt.
 *
 * Uses the real raw-job HTTP shape (guardian/server.js's POST /command,
 * the "Raw job dispatch" branch — checked directly, not guessed: body.
 * provider bypasses RAID auto-pick, command/prompt/content as shown
 * there) and polls for the CHEAP 'acked' status (guardian/server.js's
 * real guardian.job.dispatched handler, extended alongside this to
 * persist that ack — it never touched job.status before, checked first)
 * rather than 'complete', which would wait for and pay for a full AI
 * generation just to answer "is the tab there."
 */
function verifyAgentReachable(providerId, opts = {}) {
  const http = require('http');
  const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');
  const timeoutMs = opts.timeoutMs || 8000;

  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({
      provider: providerId, command: 'ping',
      prompt: '(connectivity check — no reply needed)',
      // §BUGFIX 2026-08-31, James live: "RAID denied dispatch: proof
      // required, none supplied for 'chat'" on every real reachability
      // check. Traced exactly: this real request body never included
      // source, so guardian's /command route's real _approveTool check
      // (cortex/contract/index.js) fell to _default (proof_required:
      // true, no chat in allowed_actions) instead of the real,
      // already-registered 'copilot' contract (chat allowed, no proof
      // required) — this function genuinely lives in copilot.
      source: 'copilot',
    }));
    const req = http.request({
      hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 5000,
    }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => {
        let created;
        try { created = JSON.parse(raw); } catch (e) { return resolve({ ok: false, reachable: false, error: `bad response from guardian: ${e.message}` }); }
        if (!created.ok && !created.jobId) return resolve({ ok: false, reachable: false, error: created.error || 'guardian rejected the ping job' });
        const jobId = created.jobId || created.id;
        if (!jobId) return resolve({ ok: false, reachable: false, error: 'guardian did not return a jobId' });
        _pollForAck(jobId, timeoutMs, resolve);
      });
    });
    // §FIXED 2026-08-18 — James, direct: "asked again and my computer
    // started freezing." Real, confirmed cause: {timeout: 5000} in the
    // request options alone does NOT abort a stalled request — Node only
    // emits a 'timeout' event; without a real handler that calls
    // req.destroy(), the socket can hang indefinitely if guardian is slow
    // or unresponsive. Grepped this whole file before this fix: zero
    // req.on('timeout') handlers existed anywhere. Real, resolves the
    // promise honestly instead of hanging forever.
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reachable: false, error: 'guardian did not respond within 5000ms (request timed out, not aborted before this fix)' }); });
    req.on('error', (e) => resolve({ ok: false, reachable: false, error: `could not reach guardian: ${e.message}` }));
    req.write(body); req.end();
  });
}

function _pollForAck(jobId, deadlineMs, resolve) {
  const http = require('http');
  const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');
  const started = Date.now();
  const tick = () => {
    const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/jobs?limit=200', method: 'GET', timeout: 5000 }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
        const job = parsed?.jobs?.find(j => j.id === jobId);
        if (job?.status === 'acked' || job?.status === 'complete') return resolve({ ok: true, reachable: true, jobId, status: job.status, ms: Date.now() - started });
        if (job?.status === 'error') return resolve({ ok: true, reachable: false, jobId, error: job.error || 'dispatch failed', ms: Date.now() - started });
        if (Date.now() - started > deadlineMs) return resolve({ ok: true, reachable: false, jobId, error: `no ack within ${deadlineMs}ms — tab may be disconnected or not open`, ms: Date.now() - started });
        setTimeout(tick, 300);
      });
    });
    // §FIXED 2026-08-18 — the more critical instance of the same missing
    // handler: this request fires every 300ms in a real loop. Without
    // this, a guardian that's slow (not down — down triggers req.on
    // ('error') below, which was already handled) can accumulate a new
    // hung socket every 300ms, on top of whatever the FIRST call to this
    // whole function already left hanging if the person asked again
    // before the first attempt resolved. That's a real, plausible,
    // compounding resource cascade, not just a slow response.
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reachable: false, jobId, error: 'guardian did not respond to a poll within 5000ms (request timed out, not aborted before this fix)' }); });
    req.on('error', (e) => resolve({ ok: false, reachable: false, jobId, error: `lost contact with guardian while polling: ${e.message}` }));
    req.end();
  };
  tick();
}

function switchAgent(opts = {}) {
  const gov = governAction({ action: 'switch_agent', target: opts.directed || opts.intent }, {});
  if (gov.allowed === false) {
    return { ok: false, reason: `denied by governance: ${gov.reason || 'no reason given'}`, governance: gov };
  }
  try {
    const ar = require('../../lib/agent-router');
    if (ar.routeAgent) {
      const r = ar.routeAgent({ intent: opts.intent, prompt: opts.prompt, directed: opts.directed, config: opts.config, available: opts.available });
      const result = { ok: true, agent: r.agent || r.route || r, constraints: (ar.AGENT_CONSTRAINTS && r.agent) ? ar.AGENT_CONSTRAINTS[r.agent] : null, detail: r, governance: gov };
      // §BUILT 2026-08-14 — real request: "switch co-pilot to claude with
      // this URL... use a URL given as the surface... prompt me to sign in
      // if needed." opts.url is optional and additive — every existing
      // caller of switchAgent (who never passes url) is completely
      // unaffected; this branch only runs when a real url is present.
      if (opts.url && result.agent) {
        result.navigate = _navigateAgentToUrl(result.agent, opts.url); // sync placeholder overwritten below — see note
      }
      return result;
    }
  } catch (e) { return { ok: false, reason: e.message }; }
  return { ok: false, reason: 'agent-router unavailable' };
}

/**
 * §BUILT 2026-08-14 — real navigation for switchAgent's url option. Goes
 * through the SAME path every other real browser action in NEXUS uses
 * (browser-action.js's REAL_ACTIONS -> Guardian's /command -> RAID
 * approval -> ClearGlass's real provider.navigate gate -> ProviderHost.
 * navigateTo(), all real, checked directly before wiring this) rather
 * than a parallel, unaudited path — a real browser navigation is a
 * consequential action and deserves the same RAID gate every other one
 * gets, not a shortcut because it's convenient here.
 *
 * switchAgent() itself is synchronous (every existing caller expects that
 * — checked directly, not assumed, before deciding not to make the whole
 * function async and risk breaking them); this fires the real navigation
 * and returns a pending marker immediately. Callers that need the actual
 * outcome (in particular: whether a sign-in prompt is needed) should call
 * navigateAgentToUrl() directly and await it — this is documented on the
 * return value itself, not left implicit.
 */
function _navigateAgentToUrl(providerId, url) {
  navigateAgentToUrl(providerId, url).catch(e => {
    console.warn(`[self-model] switchAgent navigate (fire-and-forget) failed: ${e.message}`);
  });
  return { status: 'pending', note: 'switchAgent is synchronous; call navigateAgentToUrl(providerId, url) directly and await it for the real result, including needsSignIn.' };
}

/**
 * navigateAgentToUrl(providerId, url) — the real, awaitable version.
 * Returns { ok, needsSignIn, actualUrl, signInPrompt } — signInPrompt is a
 * real, human-readable string co-pilot's response can show directly,
 * fulfilling "prompt me to sign in if needed through co-pilot" without
 * inventing a second notification path.
 */
async function navigateAgentToUrl(providerId, url) {
  const browserAction = require('../../lib/agent-tools/tools/browser/browser-action.js');
  const r = await browserAction.execute({ action: 'navigate_provider', data: { providerId, url } });
  if (r.error) return { ok: false, error: r.error };
  const nav = r.result || {};
  const out = { ok: true, providerId, requestedUrl: url, actualUrl: nav.actualUrl, needsSignIn: !!nav.needsSignIn };
  if (out.needsSignIn) {
    out.signInPrompt = `${providerId} needs you to sign in before that page will load — I've opened it, but you'll need to log in yourself. Want me to show the window?`;
  }
  return out;
}

// ── The NEXUS model in cortex ─────────────────────────────────────────────────
/**
 * buildNexusModel(opts) — assemble the model of NEXUS (capabilities, systems,
 * versions, self-model health) and persist it to cortex's self_model table, so
 * "the model of nexus it uses for nexus questions" lives in the brain, not
 * recomputed each time. Returns the model; persistence is best-effort (§1.2).
 */
async function buildNexusModel(opts = {}) {
  let model = { ts: Date.now() };
  try {
    const na = opts.awareness || require('./nexus-awareness');
    const rundown = na.systemRundown(opts);
    model = { ...model, capabilities: rundown.capabilities, versions: rundown.versions, selfModel: rundown.selfModel, live: rundown.live, summary: rundown.text };
  } catch (e) { model.error = e.message; }

  // §2026-08-09 — the model of NEXUS now includes where NEXUS is uncertain
  // about itself, not just what it declares/serves. lib/gap-field.js is the
  // unified system + user-model gap pipeline (James: "gap field... this is
  // also for modeling me"). Same honest-degrade discipline as the rest of
  // this function — a missing gap-field doesn't fail the whole model.
  try {
    const gf = opts.gapField || require('../../lib/gap-field');
    const system = gf.openGaps({ domain: 'system', limit: 500 });
    const userModel = gf.openGaps({ domain: 'user-model', limit: 500 });
    model.gaps = {
      systemOpen: system.length,
      userModelOpen: userModel.length,
      topSystem: system.slice(0, 5).map(g => ({ type: g.type, source: g.source, occurrences: g.occurrences })),
      topUserModel: userModel.slice(0, 5).map(g => ({ type: g.type, source: g.source, occurrences: g.occurrences })),
    };
  } catch (e) { model.gaps = { error: e.message }; }

  // §2026-08-09 — "it needs to update the models of me and itself... each
  // system needs a model? Baysesian updating?" (James). This is the "itself"
  // half: co-pilot's own confidence in its conversational pattern-matching,
  // per pattern, Bayesian-updated on every confirm/reject (copilot/lib/
  // intent-learning.js). A model of NEXUS that only lists what it CAN do
  // without also carrying how SURE it is about understanding requests isn't
  // actually self-aware about its own limits.
  try {
    const il = opts.intentLearning || require('./intent-learning');
    const patterns = il.allPatterns();
    model.intentConfidence = {
      trackedPatterns: patterns.length,
      lowConfidence: patterns.filter(p => p.confidence < 0.4).map(p => ({ patternId: p.patternId, confidence: p.confidence, confirmations: p.confirmations, rejections: p.rejections })),
      highConfidence: patterns.filter(p => p.confidence >= 0.8).map(p => p.patternId),
    };
  } catch (e) { model.intentConfidence = { error: e.message }; }

  // Persist to cortex self_model table (the brain). Best-effort, non-blocking.
  // §FIXED 2026-08-12 — root cause of self_model having 0 rows, found by
  // actually running this function live (not assumed from "never called"):
  // lib/cortex-write.js exports a FACTORY — cortexWrite('systemName') →
  // {insert, ...} — not a bare .write(table, row). The old code's `_try(
  // '../../lib/cortex-write')` got the raw factory function back, its own
  // `writer.write` check correctly failed, then its `typeof writer ===
  // 'function'` check was ALSO true (a factory IS a function) and called
  // `writer('self_model', {...model})` — which invokes the factory with
  // 'self_model' as a systemName and the model object as an unused second
  // arg. No error, no row, nothing — silently wrong, caught only by
  // actually running it and checking the table afterward. Fixed to write
  // in-process via jaaDB directly, same proven pattern this session's other
  // tools already use (schedule-task.js, raid-snr.js, etc.) rather than
  // trust cortex-write's HTTP path, which needs a live cortex server this
  // environment doesn't have to verify against.
  if (opts.persist !== false) {
    try {
      const { jaaDB } = opts.jaaDB ? { jaaDB: opts.jaaDB } : require('../../cortex/memory/jaa-db');
      jaaDB.insert('self_model', { id: 'nexus', ...model });
    } catch (_) { /* persistence best-effort — the model is still returned */ }
  }
  return model;
}

module.exports = { whoAmI, recordIdentityEvidence, governAction, switchAgent, navigateAgentToUrl, verifyAgentReachable, buildNexusModel, getIdentityName, setIdentityName, getCurrentAgent, setCurrentAgent, MODULE_ID: 'copilot-self-model', VERSION: '1.4.0' };
