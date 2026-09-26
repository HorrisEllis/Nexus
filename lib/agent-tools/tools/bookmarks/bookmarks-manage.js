'use strict';
/**
 * lib/agent-tools/tools/bookmarks/bookmarks-manage.js — bookmarks_manage tool
 * UUID: nexus-agent-tools-bookmarks-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — closes the bookmarks half of docs/2026-08-27-
 * event-taxonomy-and-brainstorm-phasemap.spec's BR8 (real, still open
 * at the time this was built — checked live via loom's own
 * phasemap-map.js forSystem(), not assumed). clear-glass/src/bookmarks/
 * store.js has a real, complete backend; clear-glass/src/gates/
 * index.js already had 6 real, registered gates for it
 * (bookmarks.add/remove/list/open/visit/check) — checked directly,
 * confirmed live-wired (bookmarks && bookmarkAddGate(bookmarks) etc.)
 * — with zero agent-tool coverage at all. Same real Guardian-job
 * dispatch + poll mechanism every ClearGlass-facing tool this session
 * uses (browser_action, agent_mesh_route) — reused, not reinvented.
 *
 * §HONEST LIMIT — traced against real source (bookmarks/store.js,
 * gates/index.js), not guessed; has NOT been run against a live
 * Electron instance — same honest limit every ClearGlass-facing tool
 * this session names.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

// Real gate names, confirmed directly against clear-glass/src/gates/index.js.
const REAL_ACTIONS = {
  add:    'bookmarks.add',    // { url, title?, ... } -> bookmarks.added { ... } | bookmarks.error
  remove: 'bookmarks.remove', // { id } -> bookmarks.removed { ... }
  list:   'bookmarks.list',   // {} -> bookmarks.listed { bookmarks }
  open:   'bookmarks.open',   // { id, agentId? } -> bookmarks.opened { bookmark, result } — real navigate via the driver
  visit:  'bookmarks.visit',  // { id } -> bookmarks.visited { ... } — records a visit without opening
  check:  'bookmarks.check',  // { url } -> bookmarks.check.result { url, isBookmarked }
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command, provider: 'bookmarks', content: JSON.stringify(content || {}) }));
    const req = http.request({
      hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/command', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
      timeout: 20000,
    }, (res) => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({ ok: false, error: `bad response from guardian: ${e.message}` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `could not reach guardian (:${GUARDIAN_PORT}): ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'guardian job submission timed out' }); });
    req.write(body);
    req.end();
  });
}

function _pollJob(jobId, deadlineMs) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const req = http.request({ hostname: '127.0.0.1', port: GUARDIAN_PORT, path: '/jobs?limit=200', method: 'GET', timeout: 5000 }, (res) => {
        let raw = ''; res.on('data', c => raw += c);
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
          const job = parsed?.jobs?.find(j => j.id === jobId);
          if (job?.status === 'complete') { resolve({ ok: true, response: job.response }); return; }
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'bookmark action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `bookmark action did not complete within ${deadlineMs}ms` }); return; }
          setTimeout(tick, 500);
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: `lost contact with guardian while polling: ${e.message}` }));
      req.end();
    };
    tick();
  });
}

module.exports = {
  name: 'bookmarks_manage',
  description:
    'Add, remove, list, open, or check a real ClearGlass bookmark (clear-glass/src/bookmarks/store.js). ' +
    '"open" navigates a real agent tab to the bookmark\'s URL and records a visit; "visit" records without ' +
    'navigating; "check" answers whether a URL is already bookmarked. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'add needs {url, title?}, remove/open/visit need {id}, open also takes {agentId?}, check needs {url}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which bookmark action to perform' },
      data:   { type: 'object', description: 'Action-specific parameters' },
    },
    required: ['action'],
  },
  execute: async ({ action, data = {} } = {}) => {
    const eventType = REAL_ACTIONS[action];
    if (!eventType) return { error: `unknown action "${action}" — expected one of: ${Object.keys(REAL_ACTIONS).join(', ')}` };

    const created = await _createGuardianJob(eventType, data);
    if (!created.ok) return { error: created.error || 'guardian rejected the job' };

    const result = await _pollJob(created.jobId, 20000);
    if (!result.ok) return { error: result.error };
    return { ok: true, action, result: result.response };
  },
};
