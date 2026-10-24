'use strict';
/** engines/ui/routes/security.js — firewall, OS firewall, UPnP, API keys. */

const { jsonR, proxyReq } = require('../lib/http');

module.exports = ({ ipcRequest, ipc }) => ({

  'GET /ui/firewall': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('firewall', 'firewall:status', {}));
    } catch (e) {
      return jsonR(res, 200, { banned: [], totalBlocked: 0, error: e.message });
    }
  },

  'POST /ui/firewall/ban': async (req, res, { body }) => {
    if (!body.ip) return jsonR(res, 400, { error: 'ip is required' });
    ipc.send('route', { type: 'firewall:ban', ...body }, 'firewall');
    return jsonR(res, 202, { ok: true });
  },

  'POST /ui/firewall/unban': async (req, res, { body }) => {
    if (!body.ip) return jsonR(res, 400, { error: 'ip is required' });
    ipc.send('route', { type: 'firewall:unban', ...body }, 'firewall');
    return jsonR(res, 202, { ok: true });
  },

  'POST /ui/firewall/whitelist': async (req, res, { body }) => {
    if (!body.ip) return jsonR(res, 400, { error: 'ip is required' });
    ipc.send('route', { type: 'firewall:whitelist:add', ...body }, 'firewall');
    return jsonR(res, 202, { ok: true });
  },

  'POST /ui/sysfw/detect': async (req, res) => sysfw(res, ipcRequest, 'sysfw:detect'),
  'POST /ui/sysfw/apply':  async (req, res) => sysfw(res, ipcRequest, 'sysfw:apply'),
  'POST /ui/sysfw/list':   async (req, res) => sysfw(res, ipcRequest, 'sysfw:list'),

  'POST /ui/upnp/open':   async (req, res) => sysfw(res, ipcRequest, 'upnp:open',   20000),
  'POST /ui/upnp/close':  async (req, res) => sysfw(res, ipcRequest, 'upnp:close',  20000),
  'GET  /ui/upnp/status': async (req, res) => sysfw(res, ipcRequest, 'upnp:status', 20000),

  'POST /auth/apikey': async (req, res, { body }) => {
    if (!body.label) return jsonR(res, 400, { error: 'label is required' });
    try {
      return jsonR(res, 201, await ipcRequest('auth', 'auth:apikey:verify', { create: true, ...body }));
    } catch (e) {
      return jsonR(res, 502, { error: `auth engine did not answer: ${e.message}` });
    }
  },
});

async function sysfw(res, ipcRequest, type, ms = 12000) {
  try {
    return jsonR(res, 200, await ipcRequest('firewall', type, {}, ms));
  } catch (e) {
    return jsonR(res, 502, { error: `firewall did not answer ${type}: ${e.message}` });
  }
}
