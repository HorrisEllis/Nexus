'use strict';
// guardian/lib/provider-login.js — §0.39.280 BS16. Each provider tab's last reported login state (the chat-stream
// prelude's watchLogin → POST /api/provider/login). One store, read by the route and by the dispatcher (a job waiting
// for a provider behind a login wall says so, instead of "waiting for … NCP channel").
const _state = new Map();
function set(rec) { if (rec && rec.provider) _state.set(String(rec.provider).toLowerCase(), rec); return rec; }
function get(provider) { return _state.get(String(provider || '').toLowerCase()) || null; }
function all() { return Object.fromEntries(_state); }
/** why a job for this provider cannot run now, or null */
function blockedReason(provider) {
  const r = get(provider);
  return r && r.state === 'wall' ? `${provider} needs you to sign in — open its tab in Clear Glass (${r.text || 'sign-in page'}); the job waits and runs once you have` : null;
}
/**
 * §0.60.124 SW2 — holdsJobs(provider) → the wall record while queued jobs must wait for it, else null. A fresh wall holds
 * (dispatching into a sign-in page sends the tab back to sign-in and reconnects it: James's 3-second flush loop); a wall
 * older than HOLD_MS does not, so an "ok" that never arrived cannot strand a job.
 */
const HOLD_MS = 5 * 60 * 1000;
function holdsJobs(provider, now = Date.now()) { const r = get(provider); return r && r.state === 'wall' && now - (r.at || 0) < HOLD_MS ? r : null; }
/** releasableBehindWall(job) — 0.60.205 L2: a build's job (session …-phrun-…) or background work (normal / low) is not held at a
 *  sign-in wall: it has other agents to go to. Anything else (a person waiting, priority high by default) waits for the sign-in. */
function releasableBehindWall(job = {}) {
  if (!job || job.status !== 'queued') return false;
  return /(^|-)phrun-/.test(String(job.sessionId || '')) || ['normal', 'low'].includes(job.priority);
}

module.exports = { releasableBehindWall, set, get, all, blockedReason, holdsJobs, HOLD_MS };
