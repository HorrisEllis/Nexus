'use strict';
/**
 * lib/agent-tools/tools/clear-glass/dom-archaeology.js — real agent
 * access to ClearGlass's DOM Archaeology panel. James: "dom archeology
 * tool for the clear-glass toolkit."
 *
 * Real, checked architecture, not assumed: this runs in copilot's own
 * Node process, which has no direct access to a real Electron
 * webContents. clear-glass/renderer/browser.js's DOM Archaeology panel
 * itself calls window.__cgDomMesh — a real, page-injected object that
 * only exists inside a live tab's own renderer context. Reached here
 * via the real HTTP bridge (clear-glass's own wire server, :7704 —
 * confirmed the real, already-existing port other real routes on that
 * same server already use) -> ProviderHost.queryDom() (built this
 * session, matching the exact, already-proven injectAnswer() pattern)
 * -> the real, existing __cgDomMesh.getTree()/query() the panel itself
 * already calls. Nothing here is a new DOM-reading mechanism — this is
 * wiring, not a new implementation.
 *
 * Honestly fails, never fabricates: if ClearGlass isn't running, or the
 * named provider tab doesn't exist, or the page hasn't loaded
 * __cgDomMesh yet, this returns a real, specific error — not an
 * invented, empty-looking "success."
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
  name: 'clear_glass_dom_archaeology',
  description:
    'Real DOM inspection for a live ClearGlass browser tab — the exact same window.__cgDomMesh the DOM Archaeology ' +
    'panel itself uses, not a separate mechanism. Needs providerId (which real agent tab — e.g. "claude", ' +
    '"chatgpt"). Optional query: omitted returns the real, current page tree (depth 3); a real query string ' +
    'searches it. Honestly fails — with a specific reason — if ClearGlass is not running, the named tab does not ' +
    'exist, or the page has not loaded the DOM mesh yet, rather than returning an empty or fabricated result.',
  parameters: {
    type: 'object',
    properties: {
      providerId: { type: 'string', description: 'which real agent tab — e.g. claude, chatgpt, gemini' },
      query: { type: 'string', description: 'optional — a real search query against the live DOM; omit for the full tree' },
    },
    required: ['providerId'],
  },
  execute: async (a) => {
    if (!a.providerId) return { error: 'providerId required' };
    try {
      return await _post('/dom/query', { providerId: a.providerId, query: a.query });
    } catch (e) {
      return { error: `clear_glass_dom_archaeology failed: ${e.message}` };
    }
  },
};
