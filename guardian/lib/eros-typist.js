'use strict';
/**
 * guardian/lib/eros-typist.js — guardian's line to ErosmancerOS, the fallback typist.
 * comp_id: nexus.guardian.eros-typist
 * §0.39.265 — James: "Maybe hook that in to ErosmancerOS" (asked: fallback typist — the userscript stays primary).
 *
 * When a provider tab could not take a job twice (no composer, send never pressed), guardian/lib/job-retry.js
 * marks it transport 'eros' and the dispatcher calls type(job): Clear Glass's wire proxies POST /eros/human-type
 * to ErosmancerOS's /api/human-type, which finds the provider's OWN tab by host, types the prompt with
 * ErosmancerOS's human timing (Shift+Enter for new lines), and presses send. The reply comes back through the
 * tab's transcript, like any other.
 *
 * available() is synchronous (the retry decision is): it answers from the last check of Clear Glass's
 * /eros-supervisor (running AND connected to a browser), refreshed in the background every 15 s while asked.
 */
const http = require('http');

const HOSTS = { chatgpt: 'chatgpt.com', claude: 'claude.ai', gemini: 'gemini.google.com', perplexity: 'perplexity.ai', deepseek: 'chat.deepseek.com', mistral: 'chat.mistral.ai', grok: 'grok.com' };
// Built-in composer/send selectors per provider, tried after guardian's own selector map for that provider.
const DEFAULT_SELECTORS = {
  chatgpt:    { input: ['#prompt-textarea', 'div[contenteditable="true"][id="prompt-textarea"]', 'textarea[data-id]'], send: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'] },
  claude:     { input: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'], send: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'] },
  gemini:     { input: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]'], send: ['button[aria-label*="Send"]'] },
  perplexity: { input: ['textarea', 'div[contenteditable="true"]'], send: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'] },
  deepseek:   { input: ['textarea#chat-input', 'textarea'], send: ['div[role="button"][aria-disabled="false"]', 'button[type="submit"]'] },
};

function _req(port, method, p, body, timeoutMs) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let d = ''; res.on('data', c => { d += c; });
      res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { ok: false, error: 'timeout' } }); });
    req.on('error', (e) => resolve({ status: 502, body: { ok: false, error: e.message } }));
    req.end(data || undefined);
  });
}

function createErosTypist({ wirePort = parseInt(process.env.WIRE_PORT || '7704', 10), selectorsFor = () => null, profile = process.env.GUARDIAN_EROS_PROFILE || 'precise', _req: req = _req } = {}) {
  let last = { ok: false, at: 0, reason: 'not checked yet' };
  let checking = null;

  async function check() {
    if (checking) return checking;
    checking = (async () => {
      const r = await req(wirePort, 'GET', '/eros-supervisor', null, 3000);
      const b = r.body || {};
      const h = await req(wirePort, 'GET', '/eros/health', null, 3000);
      const hb = h.body || {};
      last = { ok: r.status === 200 && b.state === 'running' && hb.state === 'connected', at: Date.now(),
               reason: r.status !== 200 ? `Clear Glass wire :${wirePort} unreachable` : b.state !== 'running' ? `ErosmancerOS ${b.state || 'not running'}` : hb.state !== 'connected' ? 'ErosmancerOS is not connected to the browser' : 'ready' };
      checking = null;
      return last;
    })();
    return checking;
  }

  function available() {
    if (Date.now() - last.at > 15000) check().catch(() => {});
    return last.ok;
  }

  /** type(job) -> { ok, typed, ms, url } | { ok:false, error } */
  async function type(job) {
    const provider = job.provider;
    if (!HOSTS[provider]) return { ok: false, error: `no ErosmancerOS typing for provider ${provider}` };
    let mapped = null;
    try { mapped = selectorsFor(provider); } catch (_) {}
    const def = DEFAULT_SELECTORS[provider] || { input: [], send: [] };
    const input = [...(mapped && mapped.input ? [mapped.input] : []), ...def.input];
    const send = [...(mapped && mapped.send ? [mapped.send] : []), ...def.send];
    const r = await req(wirePort, 'POST', '/eros/human-type', {
      provider, host: HOSTS[provider], chatUrl: job.chatUrl || null, text: String(job.prompt || ''),
      inputSelectors: [...new Set(input)], sendSelectors: [...new Set(send)], profile, jobId: job.id,
    }, 10 * 60000);
    const b = r.body || {};
    if (r.status >= 400 || !b.ok) return { ok: false, error: b.error || `HTTP ${r.status}` };
    return { ok: true, typed: b.typed, ms: b.ms, url: b.url || null };
  }

  return { available, check, type, status: () => ({ ...last }) };
}

module.exports = { createErosTypist, HOSTS, DEFAULT_SELECTORS };
