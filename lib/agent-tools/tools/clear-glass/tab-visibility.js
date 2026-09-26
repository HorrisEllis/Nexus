'use strict';
/**
 * lib/agent-tools/tools/clear-glass/tab-visibility.js — real agent
 * control over whether a provider tab is visible or backgrounded.
 * James: "background tabs feature... in the settings... right click
 * on a tab... move it to the background."
 *
 * Same real, checked architecture as dom-archaeology.js and
 * userscripts.js in this same folder: this runs in copilot's own Node
 * process; ProviderHost lives in clear-glass's separate Electron main
 * process. Reached via the real HTTP bridge (clear-glass's own wire
 * server, :7704) -> ProviderHost's already-real show(providerId)/
 * hide(providerId) — confirmed directly by reading them before this
 * tool was built, not invented. This is the real primitive a future
 * right-click "move to background" menu item would call; it's also
 * genuinely useful right now, on its own, as something co-pilot can
 * already do when asked.
 *
 * Honestly fails, never fabricates: if ClearGlass isn't running, or
 * the named provider has no live window, this returns a real,
 * specific ok:false — not an invented success.
 */
const http = require('http');

const WIRE_PORT = process.env.WIRE_PORT || 7704;

function _post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: WIRE_PORT, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, timeout: 5000 },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ClearGlass wire server unreachable — is ClearGlass running?')); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'clear_glass_tab_visibility',
  description:
    'Move a real, live provider tab to the background (hide) or bring it back to the foreground (show). Needs ' +
    'providerId (e.g. claude, chatgpt) and action (background or foreground). Honestly fails — with ok:false — if ' +
    'ClearGlass is not running or the provider has no live window right now, rather than a fabricated success.',
  parameters: {
    type: 'object',
    properties: {
      providerId: { type: 'string', description: 'which real provider tab — e.g. claude, chatgpt, gemini' },
      action: { type: 'string', enum: ['background', 'foreground'] },
    },
    required: ['providerId', 'action'],
  },
  execute: async (a) => {
    if (!a.providerId) return { error: 'providerId required' };
    if (a.action !== 'background' && a.action !== 'foreground') return { error: 'action must be "background" or "foreground"' };
    const path = a.action === 'background' ? '/provider/move-to-background' : '/provider/bring-to-foreground';
    try {
      return await _post(path, { providerId: a.providerId });
    } catch (e) {
      return { error: `clear_glass_tab_visibility failed: ${e.message}` };
    }
  },
};
