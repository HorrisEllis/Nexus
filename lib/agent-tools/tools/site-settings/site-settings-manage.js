'use strict';
/**
 * lib/agent-tools/tools/site-settings/site-settings-manage.js — site_settings_manage tool
 * UUID: nexus-agent-tools-site-settings-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "site specific settings." clear-glass/src/
 * site-settings/store.js has 7 real methods (get/getAllForOrigin/set/
 * clear/deleteKey/clearAll/listOrigins). 3 of 7 had gates
 * (get/set/deleteKey — get's own gate already branches to
 * getAllForOrigin when no key is given); clear/clearAll/listOrigins
 * did not — built alongside this tool, same convention as every other
 * gate this session.
 *
 * §HONEST LIMIT — traced against real source, not guessed; has NOT
 * been run against a live Electron instance — same honest limit every
 * ClearGlass-facing tool this session names.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

const REAL_ACTIONS = {
  get:          'site-settings.get',         // { url, key? } -> site-settings.result { url, key, value } — omit key for every setting on that origin
  set:          'site-settings.set',         // { url, key, value } -> site-settings.set.result { ... }
  deleteKey:    'site-settings.deleteKey',   // { url, key } -> site-settings.deleteKey.result { ... }
  clear:        'site-settings.clear',       // { url } -> site-settings.cleared { ... } — every setting for one origin
  clearAll:     'site-settings.clearAll',    // {} -> site-settings.clearedAll { ... } — every origin, every setting
  listOrigins:  'site-settings.listOrigins', // {} -> site-settings.list.result { origins }
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command, provider: 'site-settings', content: JSON.stringify(content || {}) }));
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
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'site-settings action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `site-settings action did not complete within ${deadlineMs}ms` }); return; }
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
  name: 'site_settings_manage',
  description:
    'Get, set, delete, clear, or list real per-site (per-origin) ClearGlass settings ' +
    '(clear-glass/src/site-settings/store.js). get with no key returns every setting for that origin. ' +
    'clear wipes one origin\'s settings; clearAll wipes every origin. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'get takes {url, key?}, set needs {url, key, value}, deleteKey needs {url, key}, clear needs {url}, ' +
    'clearAll and listOrigins take {}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which site-settings action to perform' },
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
