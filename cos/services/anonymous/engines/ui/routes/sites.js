'use strict';
/** engines/ui/routes/sites.js — vhosts, PHP detection, per-site provisioning. */

const { jsonR } = require('../lib/http');

module.exports = ({ ipcRequest, ipc, cfg }) => ({

  'GET /ui/webserver/vhosts': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('webserver', 'webserver:vhost:list', {}));
    } catch (e) {
      return jsonR(res, 200, { vhosts: [], error: e.message });
    }
  },

  'GET /ui/webserver/php': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('webserver', 'webserver:php:check', {}));
    } catch (e) {
      return jsonR(res, 200, { available: false, platform: process.platform, error: e.message });
    }
  },

  'GET /ui/webserver/status': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('webserver', 'webserver:status', {}));
    } catch (e) {
      return jsonR(res, 503, { error: e.message });
    }
  },

  'POST /ui/webserver/vhost': async (req, res, { body }) => {
    const v = body.vhost || {};
    if (!v.hostname) return jsonR(res, 400, { error: 'vhost.hostname is required' });
    try {
      const r = await ipcRequest('webserver', 'webserver:vhost:add', { vhost: v }, 8000);
      if (r && r.ok === false) return jsonR(res, 400, { error: r.error || 'webserver refused the vhost' });
      // Route the hostname through the proxy so TLS terminates in front of it.
      ipc.send('route', {
        type: 'proxy:vhost:add', hostname: v.hostname,
        target: `http://127.0.0.1:7700`,
      }, 'proxy');
      return jsonR(res, 201, r || { ok: true });
    } catch (e) {
      return jsonR(res, 502, { error: `webserver did not confirm: ${e.message}` });
    }
  },

  'POST /ui/webserver/vhost/update': async (req, res, { body }) => {
    const v = body.vhost || {};
    if (!v.hostname) return jsonR(res, 400, { error: 'vhost.hostname is required' });
    try {
      return jsonR(res, 200, await ipcRequest('webserver', 'webserver:vhost:update', { vhost: v }, 8000));
    } catch (e) {
      return jsonR(res, 502, { error: `webserver did not confirm: ${e.message}` });
    }
  },

  'DELETE /ui/webserver/vhost/:hostname': async (req, res, { params }) => {
    const hostname = decodeURIComponent(params.hostname || '');
    if (!hostname) return jsonR(res, 400, { error: 'hostname is required' });
    try {
      const r = await ipcRequest('webserver', 'webserver:vhost:remove', { hostname }, 8000);
      ipc.send('route', { type: 'proxy:vhost:remove', hostname }, 'proxy');
      return jsonR(res, 200, r || { ok: true });
    } catch (e) {
      return jsonR(res, 502, { error: `webserver did not confirm: ${e.message}` });
    }
  },
});
