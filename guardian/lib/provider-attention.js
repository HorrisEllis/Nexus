'use strict';
/**
 * guardian/lib/provider-attention.js — when an agent's tab needs the person: say so, and have Clear Glass show it.
 * comp_id: nexus.guardian.provider-attention
 * UUID: nexus-guardian-provider-attention-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "guardian should detect when a sign in is needed, also when it cant map to the chat, have a
 * compartment os style popup for the chat, to have me sign in or map the dom using the element picker."
 *
 * Before: provider tabs run HIDDEN in Clear Glass. A tab that landed on claude.ai/login could not be seen, so nobody
 * signed in; the userscript never connected and every job for that agent was cancelled after 45 s ("no claude tab
 * connected"). A drifted selector reached the picker tier as a bus event nothing showed.
 *
 * Now Guardian asks for the person, once per agent and reason per cooldown:
 *   reason 'signin'      the tab reported a sign-in wall (provider-login), or its page is a sign-in page / off the agent's
 *                        own hosts while no userscript connects
 *   reason 'map'         Guardian cannot find the chat's input, send button or reply (a selector stage) — pick them
 *   reason 'no-connect'  the tab is open on the agent's page and still has not connected — look at it
 * raise() posts Clear Glass's POST :7702/providers/:id/attention, which shows that agent's window with a Nexus panel on
 * top (sign in · pick the input / send / reply · hide). The same request on the bus (guardian.provider.attention) and
 * to every cockpit client. clear() when the agent connects or its login is ok, so the next problem is asked at once.
 *
 * pageState(url, hosts) is pure: 'signin' | 'off-host' | 'ok' | 'unknown'.
 */
const http = require('http');

const MODULE_ID = 'guardian.provider-attention';
const VERSION = '1.0.0';
const REASONS = Object.freeze(['signin', 'map', 'no-connect']);
const SIGNIN_RE = /\/(login|log-in|signin|sign-in|sign_in|auth|authenticate|oauth|sso|account\/login|u\/login)(\/|$|\?|#)/i;
const SIGNIN_HOSTS = /(^|\.)(accounts\.google\.com|login\.microsoftonline\.com|auth0\.com|appleid\.apple\.com|auth\.openai\.com|login\.live\.com)$/i;

/** pageState(url, hosts) — what the tab's page is: a sign-in page, off the agent's own hosts, or its chat */
function pageState(url, hosts = []) {
  let u; try { u = new URL(String(url || '')); } catch (_) { return 'unknown'; }
  const host = u.hostname.toLowerCase();
  if (SIGNIN_HOSTS.test(host) || SIGNIN_RE.test(u.pathname + (u.search || ''))) return 'signin';
  if (hosts.length && !hosts.some(h => host === h || host.endsWith(`.${h}`) || host.includes(h))) return 'off-host';
  return 'ok';
}

function _cgPost(path, body, { port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', timeout: timeoutMs, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (_) {} resolve({ ok: res.statusCode < 400 && !!(j && j.ok !== false), status: res.statusCode, body: j }); });
    });
    req.on('error', e => resolve({ ok: false, status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: `no answer in ${timeoutMs} ms` }); });
    req.write(data); req.end();
  });
}
function _cgGet(path, { port = parseInt(process.env.CLEARGL_IPC_PORT || '7702', 10), timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', timeout: timeoutMs }, (res) => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(raw); } catch (_) {} resolve(j); });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * createAttention({ post, get, emit, cooldownMs, now }) — post(path, body) → { ok }; get(path) → json; emit(type, data)
 * for the bus and the cockpit. Everything injectable, so the decision is testable without Clear Glass.
 */
function createAttention({ post = _cgPost, get = _cgGet, emit = () => {}, cooldownMs = null, now = Date.now } = {}) {
  const _last = new Map();   // `${provider}:${reason}` -> ts
  const _open = new Map();   // provider -> { reason, at, note }
  const cd = () => { if (cooldownMs != null) return cooldownMs; try { return require('../options.js').get('jobs.attention_cooldown_ms'); } catch (_) { return 120000; } };

  async function raise({ provider, reason, jobId = null, note = null, url = null, agentId = null, forWhat = null, stage = null } = {}) {
    const p = String(provider || '').toLowerCase();
    if (!p) return { sent: false, error: 'provider required' };
    if (!REASONS.includes(reason)) return { sent: false, error: `reason must be one of ${REASONS.join(', ')}` };
    const k = `${p}:${reason}`;
    const t = now();
    if (_last.has(k) && t - _last.get(k) < cd()) return { sent: false, skipped: 'cooldown', since: _last.get(k) };
    _last.set(k, t);
    const rec = { provider: p, reason, jobId, note, url, agentId, forWhat, stage, at: t };
    _open.set(p, rec);
    emit('guardian.provider.attention', rec);
    const r = await post(`/providers/${encodeURIComponent(p)}/attention`, rec);
    return { sent: !!r.ok, clearGlass: r.ok ? 'shown' : (r.error || (r.body && r.body.error) || `status ${r.status}`), rec };
  }
  function clear(provider) {
    const p = String(provider || '').toLowerCase();
    for (const k of [..._last.keys()]) if (k.startsWith(`${p}:`)) _last.delete(k);
    const had = _open.delete(p);
    if (had) emit('guardian.provider.attention_cleared', { provider: p, at: now() });
    return had;
  }
  /** pageOf(provider) — the agent's main tab as Clear Glass sees it: { url, status, hosts, state } or null */
  async function pageOf(provider) {
    const j = await get('/providers');
    const row = j && Array.isArray(j.providers) ? j.providers.find(x => x.id === provider) : null;
    if (!row) return null;
    return { url: row.url || null, status: row.status || null, running: row.running !== false, hosts: row.hosts || [], state: pageState(row.url, row.hosts || []) };
  }
  function open() { return Object.fromEntries(_open); }
  return { raise, clear, pageOf, open, MODULE_ID };
}

let _default = null;
/** the process's one instance (guardian/server.js wires emit; ask.js and the ladder use the same one) */
function attention(opts) { if (!_default || opts) _default = createAttention(opts || {}); return _default; }

module.exports = { MODULE_ID, VERSION, REASONS, pageState, createAttention, attention };
