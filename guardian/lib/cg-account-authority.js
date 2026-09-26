'use strict';
/**
 * guardian/lib/cg-account-authority.js — Clear Glass is the account authority
 * UUID: guardian-cg-account-authority-v1-0000-2026-0923-001
 *
 * §BUILT 2026-09-23 — James: "yes clearglass" (decides D3 of
 * docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec). Before this,
 * guardian/lib/agent-registry.js kept its OWN per-agent account list with a
 * default flag, never exposed over HTTP, while Clear Glass's options store
 * held the real account entities, their provider identities and — through the
 * CookieVault — their sessions. Two account truths (§10.3): an account created
 * in Clear Glass never reached guardian, so the ladder dispatched with
 * accountId null and the mesh opened mesh-<provider>-default, a session nobody
 * had signed into.
 *
 * Now the ladder asks Clear Glass (GET :7702/accounts/resolve). Error codes:
 *   unknown_account        explicit id not an account linked to that provider (loud, never a substitute)
 *   authority_unreachable  Clear Glass down — the mesh lives in Clear Glass too, so the ladder
 *                          falls back to NCP with this reason recorded, not a silent default
 */
const http = require('http');

function createClearGlassAccountAuthority({ port = parseInt(process.env.CLEARGL_IPC_PORT || process.env.CG_IPC_PORT || '7702', 10), host = '127.0.0.1', timeoutMs = 3000, request = http.request } = {}) {
  function resolve(provider, explicit) {
    const qs = `provider=${encodeURIComponent(provider)}${explicit ? `&account=${encodeURIComponent(explicit)}` : ''}`;
    return new Promise((ok, fail) => {
      const req = request({ host, port, path: `/accounts/resolve?${qs}`, method: 'GET', timeout: timeoutMs }, (res) => {
        let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
        res.on('end', () => {
          let j = null; try { j = JSON.parse(body); } catch (_) { /* handled below */ }
          if (res.statusCode === 404 && j && j.code === 'unknown_account') return fail(Object.assign(new Error(j.error), { code: 'unknown_account' }));
          if (res.statusCode !== 200 || !j || !j.ok) return fail(Object.assign(new Error(`clear-glass /accounts/resolve returned ${res.statusCode}: ${(j && j.error) || body.slice(0, 120)}`), { code: 'authority_unreachable' }));
          ok(j.accountId || null);
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => fail(Object.assign(new Error(`clear-glass account authority unreachable on :${port}: ${e.code || e.message}`), { code: 'authority_unreachable' })));
      req.end();
    });
  }
  return { resolve, port };
}

module.exports = { createClearGlassAccountAuthority };
