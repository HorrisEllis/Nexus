'use strict';
/**
 * lib/agent-tools/tools/guardian/dispatch.js
 * James: "wires tools for copilot for... guardian." Real, confirmed
 * endpoint — guardian/server.js:2688's POST /command, the same real
 * route copilot/lib/self-model.js already uses successfully for its
 * own reachability checks. Body shape copied exactly from that proven
 * real caller, including the `source: 'copilot'` field — confirmed by
 * reading self-model.js's own real bugfix comment: omitting it makes
 * RAID's _approveTool gate fall to the default contract (proof
 * required), rejecting every real call. Getting this wrong here would
 * silently reproduce that exact bug.
 */
const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820', 10);

function _post(path, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { hostname: '127.0.0.1', port: GUARDIAN_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: timeoutMs },
      (res) => {
        let out = ''; res.on('data', c => out += c);
        res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`bad response from guardian: ${e.message}`)); } });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('guardian unreachable — is it running?')); });
    req.write(data);
    req.end();
  });
}

module.exports = {
  name: 'guardian_dispatch',
  description:
    'Dispatch a real command/prompt to a connected agent tab through guardian — the same real POST /command ' +
    'route copilot itself already uses for reachability checks. Needs provider (e.g. "claude", "chatgpt") and ' +
    'prompt. Honestly fails if guardian is unreachable or the provider has no live tab — never fabricates a ' +
    'response.',
  parameters: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: 'target agent provider id — e.g. claude, chatgpt, gemini, perplexity' },
      prompt:   { type: 'string', description: 'the prompt/command text to dispatch' },
      command:  { type: 'string', description: 'real guardian job command type (default: "queue")' },
    },
    required: ['provider', 'prompt'],
  },
  execute: async (a) => {
    if (!a.provider) return { error: 'provider required' };
    if (!a.prompt) return { error: 'prompt required' };
    try {
      const result = await _post('/command', {
        provider: a.provider, prompt: a.prompt, command: a.command || 'queue',
        // §CRITICAL — do not omit. See file header: RAID's real
        // _approveTool gate needs this to resolve the real 'copilot'
        // contract instead of falling to a proof-required default.
        source: 'copilot',
      });
      return result;
    } catch (e) {
      return { error: `guardian_dispatch failed: ${e.message}` };
    }
  },
};
