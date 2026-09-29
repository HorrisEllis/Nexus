'use strict';
/**
 * lib/agent-tools/tools/versionium/history.js — versionium.history.tool
 *
 * James's taxonomy: "Versions, revisions, and snapshots .tools for
 * versionium." This half covers the read-only "what happened" side —
 * history and calendar. The commit/restore/state (write + point-in-time
 * read) side is versionium.snapshot.tool, same folder.
 *
 * §CHECKED FIRST — governance/versionium-commit.js already exists but
 * only wraps POST /api/versionium/commit (write side). No tool anywhere
 * covered GET /api/versionium/history or GET /api/versionium/calendar/:date
 * — confirmed by grep before writing this. Both routes are real, live in
 * versionium/routes/versionium.js, unchanged here.
 */

const http = require('http');
const { toolName } = require('../../naming.js');

const VERSIONIUM_HOST = process.env.VERSIONIUM_HOST || '127.0.0.1';
const VERSIONIUM_PORT = parseInt(process.env.VERSIONIUM_PORT || '3754', 10);

function _get(path) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: VERSIONIUM_HOST, port: VERSIONIUM_PORT, path, method: 'GET', timeout: 8000 },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(b) }); }
          catch (e) { resolve({ ok: false, error: `bad JSON from versionium: ${e.message}` }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'versionium request timed out' }); });
    req.end();
  });
}

module.exports = {
  name: toolName('versionium', 'history'),
  description:
    'Read versionium\'s real commit history — either action:"log" (optionally filtered by system) or ' +
    'action:"calendar" for all commits on a given date (YYYY-MM-DD).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['log', 'calendar'], description: 'log (default) or calendar' },
      system: { type: 'string', description: 'optional filter for action:"log" — e.g. "guardian"' },
      date: { type: 'string', description: 'required for action:"calendar" — YYYY-MM-DD' },
    },
  },
  execute: async ({ action = 'log', system, date }) => {
    if (action === 'calendar') {
      if (!date) return { error: 'date (YYYY-MM-DD) is required for action:"calendar"' };
      const result = await _get(`/api/versionium/calendar/${encodeURIComponent(date)}`);
      if (!result.ok) return { error: result.error || `versionium returned status ${result.status}` };
      return result.body;
    }
    if (action === 'log') {
      // §0.39.271 V1 — n= makes versionium answer with the NEWEST commits (without it, the first 200 stored).
      const path = system ? `/api/versionium/history?system=${encodeURIComponent(system)}&n=100` : '/api/versionium/history?n=100';
      const result = await _get(path);
      if (!result.ok) return { error: result.error || `versionium returned status ${result.status}` };
      return result.body;
    }
    return { error: `unknown action "${action}" — must be "log" or "calendar"` };
  },
};
