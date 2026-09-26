'use strict';
/**
 * cli/nexus-cli.js — RETIRED (consolidated into copilot/cli.js)
 * UUID: nexus-cli-runtime-v1-0000-4000-0000-000000000001
 * Version: 2.0.0
 *
 * §CONSOLIDATION 2026-07-30 (James: "the only cli should have co-pilot available
 * to talk to, and also every system and cli command that updates dynamically").
 * This file WAS the grammar-driven runtime; it was renamed/expanded into
 * copilot/cli.js, which is now THE one canonical NEXUS CLI — it has co-pilot
 * talk (_talkToCopilot), the live registry grammar (SSE rebuild on
 * component.registered), AND system pass-through (/guardian, /cockpit, /cortex,
 * /idearium). This shim remains only to (a) re-export the canonical CLI so any
 * lingering `require('cli/nexus-cli')` still resolves, and (b) preserve
 * _copilotAsk, which one test still imports. ~470 lines of duplicated runtime
 * removed (§16.5 delete the duplicate; §10.3 one CLI, not competing entries).
 */

const http = require('http');

// Preserved: the raw copilot POST helper (tests/modules/cli-copilot-fallback.test.js).
function _copilotAsk(prompt, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const COPILOT_URL = process.env.NEXUS_COPILOT_URL || 'http://127.0.0.1:3750';
    const payload = Buffer.from(JSON.stringify({ prompt, source: 'nexus-cli' }));
    let done = false;
    const req = http.request(COPILOT_URL + '/api/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
      timeout: timeoutMs,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (done) return; done = true;
        try { const j = JSON.parse(d); resolve({ ok: true, text: j.text || j.response || j.answer || '' }); }
        catch (_) { resolve({ ok: false }); }
      });
    });
    req.on('timeout', () => { if (!done) { done = true; req.destroy(); resolve({ ok: false }); } });
    req.on('error', () => { if (!done) { done = true; resolve({ ok: false }); } });
    req.write(payload); req.end();
  });
}

// The canonical CLI is copilot/cli.js — re-export it so this path still works.
const canonical = require('../copilot/cli');

module.exports = { ...canonical, _copilotAsk };

// Running this file directly just launches the canonical CLI.
if (require.main === module) {
  if (typeof canonical.start === 'function') canonical.start();
}
