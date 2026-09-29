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
module.exports = { set, get, all, blockedReason };
