'use strict';
/**
 * guardian/lib/provider-routing.js — provider selection + Mistral dispatch,
 * decompiled out of guardian/server.js.
 * comp_id: nexus.guardian.provider-routing
 * UUID: nexus-guardian-provider-routing-v1-0000-2026-0902-001
 *
 * Moved verbatim from server.js: chooseProvider (asks cortex's real RAID
 * via HTTP, /api/raid/decide — the same real endpoint Clear Glass's
 * AgentMesh._raidDecide() calls, confirmed this session), normaliseProvider,
 * parseCommand, and _dispatchToMistral (routes to ollama-bridge :3749,
 * dispatcher.js already depends on this one by name).
 *
 * ── REAL BUG FOUND WHILE EXTRACTING THIS, FIXED HERE ────────────────────
 * The original normaliseProvider() reads `PROVIDERS.hasOwnProperty(r)`
 * and `Object.keys(PROVIDERS)`, where PROVIDERS (server.js ~1479) is
 * `new Proxy({}, { get, set })` — a *connection-status* check
 * (`ncp.isConnected(x) ? {...} : null`), not a real object. That Proxy
 * has no ownKeys/getOwnPropertyDescriptor trap, so `Object.keys()` on it
 * is always `[]`, and — worse — `PROVIDERS.hasOwnProperty` itself goes
 * through the `get` trap: since `ncp.isConnected('hasOwnProperty')` is
 * false, the trap returns `null`, so `PROVIDERS.hasOwnProperty` IS
 * `null`, and calling it throws `TypeError: PROVIDERS.hasOwnProperty is
 * not a function`. Verified by running the exact real construction
 * (see this session's log) — not a guess.
 *
 * Confirmed reachable and common: cli.js's sendCommand() (backing /code,
 * /ask, /paste — the primary documented CLI commands) posts only
 * `{ raw }`, no `provider` field. server.js's /command handler calls
 * `parseCommand(body.raw)` unconditionally on that path, which calls
 * normaliseProvider(providerRaw) with the bare name ('chatgpt', 'claude',
 * etc.) — never a hostname, so the PROVIDER_ALIASES lookup misses and
 * execution reaches the throwing line every time. The outer
 * `.catch(e => pRes(res, 400, {error: e.message}))` keeps the process up
 * but returns exactly this cryptic 400 to the caller for the CLI's main
 * commands.
 *
 * The comment already sitting on PROVIDERS in server.js explains why:
 * "Compatibility shims — code that used PROVIDERS[x] now uses
 * ncp.isConnected(x)." PROVIDERS used to be a real static registry;
 * normaliseProvider needed *that* — "is this a known provider name" —
 * not "is it currently connected right now" (a raw command targeting an
 * offline provider must still normalise correctly so it can queue, per
 * dispatcher.js's own queue-when-disconnected path). This file restores
 * a real static KNOWN_PROVIDERS list instead of relying on the
 * connection Proxy at all.
 */

const http = require('http');

// §RECONCILED 2026-09-02 — this package was decompiled from server.js
// before deepseek was added (server.js's own §ADDED 2026-09-02 comment
// on _dispatchToDeepseek). Wiring this package in unmodified would have
// silently dropped deepseek routing entirely. Added here, verbatim
// parity with the same-day server.js addition — not guessed.
const KNOWN_PROVIDERS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'ollama', 'mistral', 'deepseek'];

const PROVIDER_ALIASES = {
  'claude.ai':           'claude',
  'chat.openai.com':     'chatgpt',
  'chatgpt.com':         'chatgpt',
  'gemini.google.com':   'gemini',
  'aistudio.google.com': 'gemini',
  'perplexity.ai':       'perplexity',
  'localhost':           'ollama',
  '127.0.0.1':           'ollama',
  'chat.mistral.ai':     'mistral',
  'chat.deepseek.com':   'deepseek',
};

const _RAID_AGENT_TO_PROVIDER = {
  'ollama':              'ollama',
  'guardian-claude':     'claude',
  'guardian-chatgpt':    'chatgpt',
  'guardian-gemini':     'gemini',
  'guardian-perplexity': 'perplexity',
  'claude':     'claude',
  'chatgpt':    'chatgpt',
  'gemini':     'gemini',
  'perplexity': 'perplexity',
};

/**
 * createProviderRouter(deps) — deps: updateJob, bus (both from
 * guardian/lib/jobs.js's store / server.js's bus), NEXUS_URL (cortex base
 * URL, config.NEXUS_URL in the original), and optional postEvent
 * (nc.postEvent wrapper — non-fatal if omitted, matches original's own
 * `if (nc)` guard). No isProviderConnected/PROVIDERS dependency — see
 * header, that Proxy was never safe for this function to use.
 */
function createProviderRouter(deps) {
  const { updateJob, bus, NEXUS_URL, postEvent } = deps;
  for (const [name, v] of Object.entries({ updateJob, bus, NEXUS_URL })) {
    if (!v) throw new Error(`[provider-routing] missing required dependency: ${name}`);
  }
  const _postEvent = postEvent || (() => {}); // §1.2 non-fatal — matches original's `if (nc)` guard

  function normaliseProvider(raw) {
    if (!raw) return null;
    const r = raw.toLowerCase().trim();
    if (PROVIDER_ALIASES[r]) return PROVIDER_ALIASES[r];
    if (KNOWN_PROVIDERS.includes(r)) return r; // fixed: was PROVIDERS.hasOwnProperty(r), always threw
    for (const key of KNOWN_PROVIDERS) {        // fixed: was Object.keys(PROVIDERS), always []
      if (r.includes(key)) return key;
    }
    return null;
  }

  function parseCommand(raw) {
    const str = (raw || '').trim();
    const match = str.match(/^\/(\w+)\s+(\w[\w.-]*)\s*([\s\S]*)$/);
    if (!match) return null;
    const [, command, providerRaw, rest] = match;
    const provider = normaliseProvider(providerRaw);
    const prompt = rest.trim().replace(/^["']|["']$/g, '');
    return { command: command.toLowerCase(), provider, prompt, raw: str };
  }

  // ── RAID routing seam ────────────────────────────────────────────────────
  // Guardian asks cortex's RAID which provider for this intent before
  // dispatch. Non-fatal: cortex unreachable -> fall back. LAW I lives in RAID.
  async function chooseProvider(intent, fallback = 'claude', preferred = '') {
    if (process.env.GUARDIAN_RAID_OFF === '1') return fallback;
    try {
      const u = new URL('/api/raid/decide', NEXUS_URL);
      u.searchParams.set('intent', (intent || '').slice(0, 300));
      if (preferred) u.searchParams.set('preferred', preferred);
      const decision = await new Promise((resolve, reject) => {
        const req = http.get(u, { timeout: 1500 }, res => {
          let raw = ''; res.on('data', d => raw += d);
          res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
        });
        req.on('timeout', () => req.destroy(new Error('raid timeout')));
        req.on('error', reject);
      });
      if (decision?.ok && decision.agent) {
        const provider = _RAID_AGENT_TO_PROVIDER[decision.agent.toLowerCase()] || fallback;
        _postEvent('guardian.route.decided', { agent: decision.agent, provider, reason: decision.reason, cluster: decision.cluster });
        return provider;
      }
      return fallback;
    } catch (e) {
      _postEvent('guardian.route.fallback', { reason: e.message, fallback });
      return fallback;
    }
  }

  // §fix 2026-07-04: /generate never existed on ollama-bridge. Real route
  // is POST /api/jobs + poll GET /api/jobs/:id
  async function _dispatchToMistral(job) {
    const BRIDGE_PORT = parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749');
    const model = process.env.MISTRAL_MODEL || 'mistral:7b-instruct-q4_K_M';
    return new Promise(resolve => {
      const body = JSON.stringify({
        prompt: job.prompt || job.content || '',
        model,
        command: job.command || 'chat',
        jobId: job.id,
        meta: { source: 'guardian-mistral', jobId: job.id },
      });
      const req = http.request({
        hostname: '127.0.0.1', port: BRIDGE_PORT, path: '/api/jobs',
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 120000,
      }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(raw);
            const jobId = d.jobId || d.uuid;
            if (!jobId) { resolve({ ok: false, error: 'no jobId returned' }); return; }
            let polls = 0;
            const poll = () => {
              polls++;
              if (polls > 120) { resolve({ ok: false, error: 'poll timeout' }); return; }
              const pr = http.request({ hostname: '127.0.0.1', port: BRIDGE_PORT, path: `/api/jobs/${jobId}`, method: 'GET', timeout: 5000 }, rs => {
                let rb = ''; rs.on('data', c => rb += c);
                rs.on('end', () => {
                  try {
                    const pd = JSON.parse(rb);
                    if (pd.status === 'complete' || pd.progress === 'complete') {
                      updateJob(job.id, { status: 'complete', response: pd.result || pd.text || '', completedAt: Date.now() });
                      // §CODE-ARTIFACT 2026-09-20 — same listener the NCP
                      // path uses. A job that declared a fileName gets its
                      // file here too; one that didn't costs nothing.
                      try {
                        require('./code-artifact.js').onJobComplete({ job, text: pd.result || pd.text || '', bus });
                      } catch (e) { console.warn(`[guardian] code-artifact listener (bridge poll) failed: ${e.message}`); }
                      bus.emit('guardian.job.complete', { jobId: job.id, provider: 'mistral', chars: (pd.result || '').length });
                      resolve({ ok: true, text: pd.result || pd.text || '' });
                    } else if (pd.status === 'failed' || pd.progress === 'failed') {
                      resolve({ ok: false, error: pd.error || 'ollama job failed' });
                    } else {
                      setTimeout(poll, 1000);
                    }
                  } catch (_) { setTimeout(poll, 1000); }
                });
              });
              pr.on('error', () => setTimeout(poll, 1000));
              pr.end();
            };
            setTimeout(poll, 1000);
          } catch (e) {
            updateJob(job.id, { status: 'error', error: 'parse error: ' + e.message });
            resolve({ ok: false, error: e.message });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); updateJob(job.id, { status: 'error', error: 'mistral timeout' }); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', e => { updateJob(job.id, { status: 'error', error: e.message }); resolve({ ok: false, error: e.message }); });
      req.write(body); req.end();
    });
  }

  // §ADDED 2026-09-02 — James: "I want deepseek added as an agent." Moved
  // verbatim from server.js's own same-day addition — same real pattern
  // as _dispatchToMistral immediately above (mirrored, not reinvented):
  // DeepSeek's real, commonly-available local models (deepseek-coder-v2,
  // deepseek-r1) are served through Ollama, not a browser tab, so this
  // routes directly to the sovereign ollama-bridge HTTP service, exactly
  // like mistral does.
  async function _dispatchToDeepseek(job) {
    const BRIDGE_PORT = parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749');
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-coder-v2';
    return new Promise(resolve => {
      const body = JSON.stringify({
        prompt: job.prompt || job.content || '',
        model,
        command: job.command || 'chat',
        jobId: job.id,
        meta: { source: 'guardian-deepseek', jobId: job.id },
      });
      const req = http.request({
        hostname: '127.0.0.1', port: BRIDGE_PORT, path: '/api/jobs',
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 120000,
      }, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try {
            const d = JSON.parse(raw);
            const jobId = d.jobId || d.uuid;
            if (!jobId) { resolve({ ok: false, error: 'no jobId returned' }); return; }
            let polls = 0;
            const poll = () => {
              polls++;
              if (polls > 120) { resolve({ ok: false, error: 'poll timeout' }); return; }
              const pr = http.request({ hostname: '127.0.0.1', port: BRIDGE_PORT, path: `/api/jobs/${jobId}`, method: 'GET', timeout: 5000 }, rs => {
                let rb = ''; rs.on('data', c => rb += c);
                rs.on('end', () => {
                  try {
                    const pd = JSON.parse(rb);
                    if (pd.status === 'complete' || pd.progress === 'complete') {
                      updateJob(job.id, { status: 'complete', response: pd.result || pd.text || '', completedAt: Date.now() });
                      // §CODE-ARTIFACT 2026-09-20 — same listener the NCP
                      // path uses. A job that declared a fileName gets its
                      // file here too; one that didn't costs nothing.
                      try {
                        require('./code-artifact.js').onJobComplete({ job, text: pd.result || pd.text || '', bus });
                      } catch (e) { console.warn(`[guardian] code-artifact listener (bridge poll) failed: ${e.message}`); }
                      bus.emit('guardian.job.complete', { jobId: job.id, provider: 'deepseek', chars: (pd.result || '').length });
                      resolve({ ok: true, text: pd.result || pd.text || '' });
                    } else if (pd.status === 'failed' || pd.progress === 'failed') {
                      resolve({ ok: false, error: pd.error || 'ollama job failed' });
                    } else {
                      setTimeout(poll, 1000);
                    }
                  } catch (_) { setTimeout(poll, 1000); }
                });
              });
              pr.on('error', () => setTimeout(poll, 1000));
              pr.end();
            };
            setTimeout(poll, 1000);
          } catch (e) {
            updateJob(job.id, { status: 'error', error: 'parse error: ' + e.message });
            resolve({ ok: false, error: e.message });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); updateJob(job.id, { status: 'error', error: 'deepseek timeout' }); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', e => { updateJob(job.id, { status: 'error', error: e.message }); resolve({ ok: false, error: e.message }); });
      req.write(body); req.end();
    });
  }

  return { chooseProvider, normaliseProvider, parseCommand, _dispatchToMistral, _dispatchToDeepseek, PROVIDER_ALIASES };
}

module.exports = { createProviderRouter };
