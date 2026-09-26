'use strict';
/**
 * lib/agent-tools/tools/accounts/account-manage.js — account_manage tool
 * UUID: nexus-agent-tools-account-manage-v1-0000-2026-0919-jamesbrooks-001
 *
 * §BUILT 2026-09-19 — closes the deeper half of BR8 (docs/2026-08-27-
 * event-taxonomy-and-brainstorm-phasemap.spec, still real and open —
 * checked live via loom's phasemap-map.js forSystem(), not assumed).
 * clear-glass/src/options/store.js has a real, dedicated account CRUD
 * surface (listAccounts/getAccount/createAccount/updateAccount/
 * deleteAccount — real stable-uuid entities, real agentKeys linking) —
 * checked directly. Unlike bookmarks (which already had gates), this
 * one had ZERO gate coverage at all: 5 new real gates
 * (account.list/get/create/update/delete) were built alongside this
 * tool, in clear-glass/src/gates/index.js, same convention as the mesh
 * workflow gates from earlier this session.
 *
 * §HONEST LIMIT — traced against real source (options/store.js's own
 * real method signatures, gates/index.js), not guessed; has NOT been
 * run against a live Electron instance — same honest limit every
 * ClearGlass-facing tool this session names.
 */

const http = require('http');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');

const REAL_ACTIONS = {
  list:   'account.list',   // {} -> account.list.result { accounts }
  get:    'account.get',    // { id } -> account.get.result { account }
  create: 'account.create', // { label, agentKeys? } -> account.created { ...account }
  update: 'account.update', // { id, updates } -> account.updated { ...account }
  delete: 'account.delete', // { id } -> account.deleted { ... }
  // §BUILT 2026-09-19 — James: "account manager with account ids for
  // providers." Real per-provider identity, additive to the account
  // itself — see clear-glass/src/options/store.js's own
  // linkProviderAccount header for the full real invariant (one real
  // provider login can't silently belong to two different NEXUS
  // accounts at once).
  linkProvider:      'account.provider.link',   // { id, provider, accountId, email?, displayName? } -> account.provider.linked { ...account }
  unlinkProvider:    'account.provider.unlink', // { id, provider } -> account.provider.unlinked { ...account }
  verifyProvider:    'account.provider.verify', // { id, provider } -> account.provider.verified { ...account }
  getProvider:       'account.provider.get',    // { id, provider } -> account.provider.get.result { entry }
  findByProvider:    'account.provider.find',   // { provider, accountId } -> account.provider.find.result { account }
};

function _createGuardianJob(command, content) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify({ command, provider: 'account', content: JSON.stringify(content || {}) }));
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
          if (job?.status === 'error')    { resolve({ ok: false, error: job.error || 'account action failed' }); return; }
          if (Date.now() - started > deadlineMs) { resolve({ ok: false, error: `account action did not complete within ${deadlineMs}ms` }); return; }
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
  name: 'account_manage',
  description:
    'Create, read, update, delete, or list real ClearGlass accounts (clear-glass/src/options/store.js) — ' +
    'a real entity (stable uuid, label, agentKeys) linking one or more agent identities together, ' +
    'distinct from a single agent-mesh node (agent_mesh_route) or a single provider tab. ' +
    'linkProvider/unlinkProvider/verifyProvider/getProvider/findByProvider manage real, verified ' +
    'per-provider identity (which actual chatgpt.com/claude.ai/etc login this account is) — a real ' +
    'invariant is enforced: the same real provider login can\'t be linked to two different accounts. ' +
    `Params: action (required — one of: ${Object.keys(REAL_ACTIONS).join(', ')}), data (object — action-specific: ` +
    'get/update/delete need {id}, create needs {label, agentKeys?}, update needs {id, updates}, ' +
    'linkProvider needs {id, provider, accountId, email?, displayName?}, unlinkProvider/verifyProvider/' +
    'getProvider need {id, provider}, findByProvider needs {provider, accountId}).',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(REAL_ACTIONS), description: 'Which account action to perform' },
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
