'use strict';
/** engines/ui/routes/services.js — catalog, storage, mail, cron, users, billing. */

const http = require('http');
const { jsonR } = require('../lib/http');

module.exports = ({ ipcRequest, ipc, cfg }) => ({

  'GET /ui/catalog': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('catalog', 'catalog:list', {}, 6000));
    } catch (e) {
      return jsonR(res, 200, { apps: [], error: e.message });
    }
  },

  'POST /ui/catalog/install': async (req, res, { body }) => {
    if (!body.app || !body.domain) return jsonR(res, 400, { error: 'app and domain are required' });
    const requestId = `ui-install-${Date.now().toString(36)}`;
    ipc.send('route', { type: 'catalog:install', ...body, requestId }, 'catalog');
    return jsonR(res, 202, { requestId, ok: true });
  },

  'GET /ui/installs': async (req, res) => {
    try {
      return jsonR(res, 200, { installs: await ipc.db.all('installs') });
    } catch (e) {
      return jsonR(res, 200, { installs: [], error: e.message });
    }
  },

  'GET /ui/storage': async (req, res) => {
    try {
      return jsonR(res, 200, { buckets: await ipc.db.all('buckets') });
    } catch (e) {
      return jsonR(res, 200, { buckets: [], error: e.message });
    }
  },

  'POST /ui/storage/bucket': async (req, res, { body }) => {
    const bucket = String(body.bucket || '').trim();
    if (!bucket) return jsonR(res, 400, { error: 'bucket name is required' });
    const r = await new Promise(resolve => {
      const rq = http.request({
        hostname: '127.0.0.1', port: 9100, path: '/' + encodeURIComponent(bucket),
        method: 'PUT', headers: { 'x-tenant-id': 'default', 'Content-Length': 0 },
      }, rs => { rs.resume(); resolve({ ok: rs.statusCode < 400, status: rs.statusCode }); });
      rq.on('error', e => resolve({ error: `storage engine unreachable: ${e.code || e.message}` }));
      rq.end();
    });
    return r.error ? jsonR(res, 502, r) : jsonR(res, 201, r);
  },

  'GET /ui/mail/mailboxes': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('smtp', 'smtp:mailbox:list', {}));
    } catch (e) {
      return jsonR(res, 200, { mailboxes: [], error: e.message });
    }
  },

  'GET /ui/mail/dkim': async (req, res) => {
    try {
      const r = await ipcRequest('smtp', 'smtp:mailbox:list', {});
      return jsonR(res, 200, { record: r?.dkim || null });
    } catch (e) {
      return jsonR(res, 200, { record: null, error: e.message });
    }
  },

  'POST /ui/mail/disposable': async (req, res, { body }) => {
    if (!body.forwardTo) return jsonR(res, 400, { error: 'forwardTo is required' });
    try {
      return jsonR(res, 201, await ipcRequest('smtp', 'smtp:disposable:create', body));
    } catch (e) {
      return jsonR(res, 502, { error: `smtp did not answer: ${e.message}` });
    }
  },

  'GET /ui/cron': async (req, res) => {
    try {
      return jsonR(res, 200, { jobs: await ipc.db.all('cron_jobs') });
    } catch (e) {
      return jsonR(res, 200, { jobs: [], error: e.message });
    }
  },

  'POST /ui/cron': async (req, res, { body }) => {
    if (!body.name || !body.cron) return jsonR(res, 400, { error: 'name and cron are required' });
    try {
      await ipc.db.insert('cron_jobs', { name: body.name, cron: body.cron, action: body.action || {} });
      ipc.send('route', { type: 'queue:register', ...body }, 'queue');
      return jsonR(res, 201, { ok: true });
    } catch (e) {
      return jsonR(res, 500, { error: e.message });
    }
  },

  'DELETE /ui/cron': async (req, res, { body }) => {
    if (!body.name) return jsonR(res, 400, { error: 'name is required' });
    try {
      await ipc.db.delete('cron_jobs', `r => r.name === ${JSON.stringify(String(body.name))}`);
      return jsonR(res, 200, { ok: true });
    } catch (e) {
      return jsonR(res, 500, { error: e.message });
    }
  },

  'GET /ui/users': async (req, res) => {
    try {
      return jsonR(res, 200, { users: await ipc.db.all('users') });
    } catch (e) {
      return jsonR(res, 200, { users: [], error: e.message });
    }
  },

  'POST /ui/users': async (req, res, { body }) => {
    if (!body.handle) return jsonR(res, 400, { error: 'handle is required' });
    try {
      return jsonR(res, 201, await ipcRequest('provisioner', 'provision:user', body, 15000));
    } catch (e) {
      return jsonR(res, 502, { error: `provisioner did not answer: ${e.message}` });
    }
  },

  'GET /ui/billing/tenants': async (req, res) => {
    try {
      return jsonR(res, 200, { tenants: await ipc.db.all('tenants') });
    } catch (e) {
      return jsonR(res, 200, { tenants: [], error: e.message });
    }
  },
});
