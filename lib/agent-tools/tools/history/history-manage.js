'use strict';
/**
 * lib/agent-tools/tools/history/history-manage.js — history_manage tool
 * UUID: nexus-agent-tools-history-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "history manager." clear-glass/src/history/
 * store.js has real methods (record/list/delete/clear — checked
 * directly) but had ZERO gate coverage AND was never even passed into
 * registerAll's deps (checked clear-glass/src/main/index.js directly —
 * `history` was instantiated and loaded, but the real registerAll(bus,
 * {...}) call simply never included it, unlike bookmarks/options right
 * next to it). Both the missing wire and the missing gates were closed
 * in the same pass as this tool, not left half-done.
 *
 * §HONEST LIMIT — traced against real source, not guessed; has NOT
 * been run against a live Electron instance — same honest limit every
 * ClearGlass-facing tool this session names.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

const REAL_ACTIONS = {
  record: 'history.record', // { url, title?, agentId? } -> history.recorded { ... }
  list:   'history.list',   // { agentId?, limit?, since?, query? } -> history.list.result { entries }
  delete: 'history.delete', // { id } -> history.deleted { ... }
  clear:  'history.clear',  // { agentId? } -> history.cleared { ... } — omit agentId to clear all
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command, provider: 'history', content: JSON.stringify(content || {}) }));
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
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'history action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `history action did not complete within ${deadlineMs}ms` }); return; }
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
  name: 'history_manage',
  description:
    'Record, list, delete, or clear real ClearGlass browsing history (clear-glass/src/history/store.js). ' +
    'list supports filtering by agentId, a time window (since), and a text query. clear wipes one agent\'s ' +
    'history, or everything if agentId is omitted. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'record needs {url, title?, agentId?}, list takes {agentId?, limit?, since?, query?}, delete needs {id}, ' +
    'clear takes {agentId?}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which history action to perform' },
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
