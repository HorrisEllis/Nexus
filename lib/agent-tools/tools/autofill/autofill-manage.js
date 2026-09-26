'use strict';
/**
 * lib/agent-tools/tools/autofill/autofill-manage.js — autofill_manage tool
 * UUID: nexus-agent-tools-autofill-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — James: "autofill... deep and enterprise grade
 * code. Follow axioms." Real profile CRUD (clear-glass/src/autofill/
 * store.js), a real, evidence-graded field-matching engine (matcher.js
 * — autocomplete attribute first, per the actual WHATWG standard, name/
 * id/placeholder heuristics only as real fallbacks, each match
 * carrying its own real confidence), and two real orchestration
 * actions (detect: preview only; fill: actually dispatches, default
 * refuses low-confidence matches). Found and fixed a real, pre-existing
 * bug along the way: dom_mutate's own value-setting never worked
 * correctly against a React/Vue-controlled input and never dispatched
 * a real input/change event — fixed at the source in
 * clear-glass/src/dom/archaeology.js's mutate(), not worked around
 * here, since every other real caller of dom_mutate's value mutation
 * had the exact same bug.
 *
 * §HONEST LIMIT, NAMED NOT HIDDEN — file-upload fields (resume PDFs)
 * are NOT filled by this tool. ClearDriver has no real file-input-
 * setting capability at all (checked directly, zero matches for
 * setInputFiles/uploadFile anywhere in clear-glass/src/driver/
 * index.js) — a real, separate, larger gap, not faked here. detect/
 * fill both correctly exclude type="file" inputs from their real
 * match set rather than silently failing on them.
 *
 * §HONEST LIMIT — traced and unit-tested (the matcher and store are
 * pure/file-backed and were run for real against realistic input),
 * but detect/fill's own real dom.handleQuery/handleMutate round trip
 * has NOT been run against a live Electron instance — same honest
 * limit every ClearGlass-facing tool this session names.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

const REAL_ACTIONS = {
  listProfiles:   'autofill.profile.list',   // {} -> autofill.profile.list.result { profiles }
  getProfile:     'autofill.profile.get',    // { id } -> autofill.profile.get.result { profile }
  createProfile:  'autofill.profile.create', // { label, fields?, documents? } -> autofill.profile.created { ...profile }
  updateProfile:  'autofill.profile.update', // { id, updates } -> autofill.profile.updated { ...profile }
  deleteProfile:  'autofill.profile.delete', // { id } -> autofill.profile.deleted { ... }
  detect:         'autofill.detect',         // { agentId?, profileId } -> autofill.detect.result { totalFields, matches } — real preview, never fills
  fill:           'autofill.fill',           // { agentId?, profileId, minConfidence?('high'|'medium'|'low', default 'medium') } -> autofill.fill.result { filled, skipped, failed }
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command, provider: 'autofill', content: JSON.stringify(content || {}) }));
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
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'autofill action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `autofill action did not complete within ${deadlineMs}ms` }); return; }
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
  name: 'autofill_manage',
  description:
    'Manage real AutofillProfiles and use them to fill real web forms — job applications, contact ' +
    'forms, checkout. detect previews which fields WOULD be filled and how confidently (high: the ' +
    'field itself declares its purpose via the real HTML autocomplete attribute; medium: matched by ' +
    'name/id; low: matched by placeholder text only) without touching the page. fill actually types ' +
    'the values in, refusing low-confidence matches by default. Does NOT fill file-upload fields ' +
    '(resume PDFs) — ClearDriver has no real file-input capability yet. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'getProfile/updateProfile/deleteProfile need {id}, createProfile needs {label, fields?, documents?}, ' +
    'updateProfile needs {id, updates}, detect/fill need {profileId, agentId?}, fill also takes ' +
    '{minConfidence?} to widen or narrow which matches get filled).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which autofill action to perform' },
      data:   { type: 'object', description: 'Action-specific parameters' },
    },
    required: ['action'],
  },
  execute: async ({ action, data = {} } = {}) => {
    const eventType = REAL_ACTIONS[action];
    if (!eventType) return { error: `unknown action "${action}" — expected one of: ${Object.keys(REAL_ACTIONS).join(', ')}` };

    const created = await _createGuardianJob(eventType, data);
    if (!created.ok) return { error: created.error || 'guardian rejected the job' };

    const result = await _pollJob(created.jobId, 30000); // wider than the other tools' 20s — fill can dispatch several real mutate calls in sequence
    if (!result.ok) return { error: result.error };
    return { ok: true, action, result: result.response };
  },
};
