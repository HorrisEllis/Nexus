'use strict';
/**
 * guardian/lib/dispatch-ladder.js — the escalation ladder for a job (2026-09-19,
 * docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec). James's design:
 *
 *   guardian (source of truth for agents) -> agent MESH: job queue, spawn a tab, inject into the
 *   agent's chat input -> if that fails, ARCHAEOLOGY + automatic DOM mapping diagnose and repair
 *   the selectors -> retry -> then the USERSCRIPT (NCP) -> if all else fails, USER INTERVENTION
 *   through the guardian picker.
 *
 * This module is the DECISION logic and is pure Node: the Clear Glass mesh, the NCP path and the
 * picker are injected, so all of it is testable without Electron.
 *
 *   attempt(job) -> { kind, ... }
 *     'complete'   the mesh delivered a response       { text, chatUrl, agentId, accountId }
 *     'ncp'        fall through to the existing userscript (NCP) path in the dispatcher
 *     'user'       needs a human (picker)               { reason, note }
 *     'failed'     cannot proceed at all                { reason }
 *
 * INVARIANTS (each has a test):
 *  - LOOP GUARD: jobs originating from the mesh (source 'mesh') or pinned (transport 'ncp') NEVER go
 *    to the mesh: mesh.route() -> guardian /api/copilot/prompt -> job would otherwise loop forever.
 *  - NO DUPLICATE PROMPT: once the mesh reports sent:true the prompt is in the agent's chat. We never
 *    resend it over NCP (the AI would be asked twice); that case escalates to the user instead.
 *  - Selector drift is repaired at most ONCE per job; a repair is persisted in the registry.
 *  - Login/captcha are not DOM problems: no repair attempt, straight to the user.
 *  - Infrastructure failures (no window/webview, mesh unreachable) fall back to NCP and feed a
 *    circuit breaker, so a dead mesh costs one attempt per window, not one per job.
 */
const MODULE_ID = 'guardian.dispatch-ladder';

const SELECTOR_STAGES = new Set(['input_not_found', 'send_not_found', 'response_not_found']);
const USER_STAGES     = new Set(['no_login', 'captcha']);
// The payload could not be delivered by the mesh (bulk attach / injection refused): the userscript is the right fallback,
// but the mesh itself is healthy, so this must not trip the circuit breaker.
const CONTENT_STAGES  = new Set(['attach_failed', 'inject_failed']);

function createLadder({ registry, mesh, picker, mode = () => process.env.GUARDIAN_TRANSPORT || 'ncp-only',
                        breakerThreshold = 3, breakerMs = 60000, now = Date.now, log = () => {}, onProgress = null, wakeHint = null,
                        // v0.39.227 — claim(job, {agentId, accountId}) records on the .job that Clear Glass owns delivery,
                        // BEFORE anything is sent. Clear Glass's intake refuses any job without this claim. Throwing = no send.
                        claim = null,
                        // Whole code bases generate for many minutes: 90s was a guaranteed failure. Env-configurable, default 1h.
                        timeoutMs = parseInt(process.env.GUARDIAN_MESH_TIMEOUT_MS || '3600000', 10) } = {}) {
  let infraFails = 0, openUntil = 0;

  const breakerOpen = () => now() < openUntil;
  function infraFailure() { if (++infraFails >= breakerThreshold) { openUntil = now() + breakerMs; infraFails = 0; log(`mesh circuit OPEN for ${breakerMs}ms`); } }
  function infraOk() { infraFails = 0; }

  async function callMesh(args) {
    try { return await mesh.send(args); }
    catch (e) { return { ok: false, sent: false, stage: 'mesh_unreachable', error: e.message }; }
  }

  async function attempt(job) {
    const trail = [];
    const step = (tier, r, extra = {}) => trail.push({ tier, stage: r && r.stage || null, ok: !!(r && r.ok), sent: !!(r && r.sent), at: now(), ...extra });

    if (mode() !== 'mesh-first') return { kind: 'ncp', reason: 'policy_ncp_only', trail };
    if (job.source === 'mesh' || job.transport === 'ncp') return { kind: 'ncp', reason: 'loop_guard', trail };

    const agent = registry.get(job.provider);
    if (!agent) return { kind: 'ncp', reason: 'agent_not_in_registry', trail };   // guardian is the source of truth
    if (breakerOpen()) return { kind: 'ncp', reason: 'mesh_circuit_open', trail };

    let accountId;
    try {
      accountId = typeof registry.resolveAccountAsync === 'function'
        ? await registry.resolveAccountAsync(job.provider, job.accountId)
        : registry.resolveAccount(job.provider, job.accountId);
    } catch (e) {
      // Clear Glass (the account authority, 2026-09-23) is also where the mesh runs: if it is down the mesh is
      // down, so this is the documented NCP fallback with its reason recorded — not a silent 'default' account.
      if (e.code === 'authority_unreachable') return { kind: 'ncp', reason: 'account_authority_unreachable', error: e.message, trail };
      return { kind: 'failed', reason: e.code || 'account_error', error: e.message, trail };
    }
    const agentId = job.agentId || `mesh-${job.provider}-${accountId || 'default'}`;

    // The mesh has no userscript, so the NEXUS agent hint (wake-hint.js) is added here, once, to the SENT prompt only.
    const hint = wakeHint ? wakeHint.apply({ provider: job.provider, agentId, command: job.command, prompt: job.prompt, composed: !!(job.hat && (job.hat.personaInPrompt || job.hat.composed)) }) : null;
    const sentPrompt = hint ? hint.prompt : job.prompt;
    // One owner per job, written on the .job before delivery (guardian is the only writer of it). If the claim
    // cannot be recorded, nothing was sent — the userscript path takes the job with that reason on its trail.
    if (claim) {
      try { claim(job, { agentId, accountId }); }
      catch (e) { return { kind: 'ncp', reason: 'mesh_claim_failed', error: e.message, trail }; }
    }
    const send = (selectors) => callMesh({ provider: job.provider, prompt: sentPrompt, content: job.content, agentId, accountId, jobId: job.id, selectors, timeoutMs, onProgress: onProgress ? (p) => onProgress(job, p) : null });
    let r = await send(agent.selectors);
    step('mesh', r, hint ? { wakeHint: { injected: hint.injected, mode: hint.mode } } : {});
    if (hint && hint.injected && r.sent !== false) wakeHint.commit(hint.key);   // sent or possibly sent: the hint is spent

    // ── tier 2: archaeology + automatic DOM mapping, once, only for selector drift ──
    if (!r.ok && r.sent === false && SELECTOR_STAGES.has(r.stage)) {
      let d = null;
      try { d = await mesh.diagnose({ provider: job.provider, agentId, accountId, stage: r.stage, selectors: agent.selectors }); }
      catch (e) { d = { ok: false, error: e.message }; }
      trail.push({ tier: 'repair', ok: !!(d && d.repaired), evidence: d && d.evidence || null, at: now() });
      if (d && d.ok && d.repaired && d.selectors) {
        const rep = registry.recordRepair(job.provider, d.selectors, { source: 'archaeology', evidence: d.evidence });
        r = await send(rep.selectors);
        step('mesh-retry', r);
      }
    }

    if (r.ok) {
      infraOk(); registry.recordOutcome(job.provider, { ok: true });
      return { kind: 'complete', text: r.text, chatUrl: r.chatUrl || null, agentId: r.agentId || agentId, accountId: r.accountId || accountId, trail };
    }
    registry.recordOutcome(job.provider, { ok: false, stage: r.stage || 'unknown' });

    // The prompt is already spent (for a code base that is the expensive part) but we could not FIND the answer because our
    // response selector drifted: repair it and RE-READ the page. Never resend.
    if (r.sent === true && r.stage === 'response_not_found' && typeof mesh.read === 'function') {
      let d = null;
      try { d = await mesh.diagnose({ provider: job.provider, agentId, accountId, stage: r.stage, selectors: agent.selectors }); } catch (e) { d = { ok: false }; }
      trail.push({ tier: 'repair', ok: !!(d && d.repaired), evidence: d && d.evidence || null, at: now() });
      if (d && d.ok && d.repaired && d.selectors) {
        const rep = registry.recordRepair(job.provider, d.selectors, { source: 'archaeology', evidence: d.evidence });
        let rr; try { rr = await mesh.read({ jobId: job.id, selectors: rep.selectors, timeoutMs, onProgress: onProgress ? (p) => onProgress(job, p) : null }); } catch (e) { rr = { ok: false, sent: true, stage: 'mesh_unreachable' }; }
        step('mesh-reread', rr);
        if (rr.ok) { infraOk(); registry.recordOutcome(job.provider, { ok: true }); return { kind: 'complete', text: rr.text, chatUrl: rr.chatUrl || null, agentId, accountId, trail }; }
        r = rr;
      }
    }

    // sent:null = the mesh timed out mid-flight: the prompt MAY be in the chat, so treat it as sent.
    if (r.sent || r.sent === null) {   // the prompt is (or may be) already in the chat: NEVER resend
      return { kind: 'user', reason: 'sent_no_response', note: 'The prompt was already injected; do not resend it. Pick the response element or paste it.', stage: r.stage, trail };
    }
    if (USER_STAGES.has(r.stage)) return { kind: 'user', reason: r.stage, note: `${job.provider} needs a human (${r.stage}).`, stage: r.stage, trail };

    if (!SELECTOR_STAGES.has(r.stage) && !CONTENT_STAGES.has(r.stage)) infraFailure();   // no_window / no_webview / mesh_unreachable / ...
    return { kind: 'ncp', reason: r.stage || 'mesh_failed', stage: r.stage, trail };   // userscript fallback
  }

  // Last rung: called by the dispatcher when even the userscript path has given up.
  async function escalateToUser(job, reason, extra = {}) {
    try { if (picker && picker.request) await picker.request({ job, provider: job.provider, reason, ...extra }); }
    catch (e) { return { kind: 'failed', reason: 'picker_unavailable', error: e.message }; }
    return { kind: 'user', reason };
  }

  return { attempt, escalateToUser, breakerOpen, MODULE_ID };
}

module.exports = { createLadder, SELECTOR_STAGES, USER_STAGES, CONTENT_STAGES, MODULE_ID };
