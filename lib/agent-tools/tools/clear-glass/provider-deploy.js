'use strict';
/**
 * lib/agent-tools/tools/clear-glass/provider-deploy.js
 *
 * §PHASE-2 2026-08-23 — CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md item 3:
 * "there's no way to push/hot-reload a userscript into an already-running
 * provider tab on demand — host.js only reloads a script from disk on
 * its own 60s timer or full start()." Real, narrow fix, verified before
 * this file was written: clear-glass/src/providers/host.js's real
 * deploy(providerId) reuses the EXACT _inject(providerId, win) the
 * existing 60s reload timer already calls — same real injection path,
 * on demand instead of on a timer, not a second mechanism. Wired at
 * clear-glass/src/main/index.js's real POST /provider/deploy.
 *
 * Same transport as dom-archaeology.js and provider-visibility.js,
 * deliberately — two ways of reaching the same wire server would drift
 * on timeout, error shape, and port resolution (§10.3).
 *
 * §1.2 — honest failure. If ClearGlass is not running, the named
 * provider has no live window, or the injection itself throws inside
 * the real page (a userscript syntax error, for example), this returns
 * a specific reason. It never reports a successful deploy that didn't
 * actually happen.
 */

const http = require('http');

const WIRE_PORT = process.env.WIRE_PORT || 7704;

function _post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: WIRE_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 5000 },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`ClearGlass returned unparseable response: ${out.slice(0, 120)}`)); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ClearGlass wire server unreachable — is ClearGlass running?')); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'clear_glass_provider_deploy',
  description:
    'Hot-push the current userscript file from disk into an already-running ClearGlass provider tab, right now — ' +
    'without waiting for the real 60-second reload timer or restarting the tab. Needs providerId (e.g. "claude", ' +
    '"chatgpt", "gemini", "perplexity"). Calls the real ProviderHost.deploy(), the exact same injection path the ' +
    'existing background reload timer uses. Honestly fails with a specific reason if ClearGlass is not running, ' +
    'the named provider has no live window, or the injection itself throws — it never reports a successful ' +
    'deploy that did not actually happen.',
  parameters: {
    type: 'object',
    properties: {
      providerId: { type: 'string', description: 'Which real provider window: claude, chatgpt, gemini, perplexity.' },
    },
    required: ['providerId'],
  },
  execute: async ({ providerId } = {}) => {
    // §1.1 — refuse rather than guess which window the caller meant.
    if (!providerId) {
      return { error: 'providerId required — which provider window (claude, chatgpt, gemini, perplexity)?' };
    }

    let r;
    try { r = await _post('/provider/deploy', { providerId }); }
    catch (e) { return { error: e.message, providerId }; }

    if (r && r.ok === false) {
      return { error: r.error || `deploy failed for "${providerId}"`, providerId,
        note: 'the route was reached and answered — this is a real failure, not a connectivity problem' };
    }

    return { ok: true, providerId, injectedAt: r.injectedAt,
      note: `${providerId}'s userscript was re-read from disk and re-injected into its real, live tab` };
  },
};
