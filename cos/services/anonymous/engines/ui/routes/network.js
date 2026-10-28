'use strict';
/** engines/ui/routes/network.js — tunnel, peer identity, auto DNS. */

const { jsonR } = require('../lib/http');

module.exports = ({ ipcRequest, ipc }) => ({

  'GET /ui/tunnel/status': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('tunnel', 'tunnel:get', {}));
    } catch (e) {
      return jsonR(res, 200, { tunnel: null, error: e.message });
    }
  },

  'GET /ui/peer/identity': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('peer', 'peer:announce', {}));
    } catch (e) {
      return jsonR(res, 200, { ip: null, error: e.message });
    }
  },

  'GET /ui/peer/list': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('peer', 'peer:find', {}));
    } catch (e) {
      return jsonR(res, 200, { peers: [], error: e.message });
    }
  },

  'GET /ui/autodns/status': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('autodns', 'ip:changed', { probe: true }));
    } catch (e) {
      return jsonR(res, 200, { ip: null, error: e.message });
    }
  },

  'POST /ui/autodns/push': async (req, res) => {
    ipc.send('route', { type: 'ip:changed', reason: 'panel manual push' }, 'autodns');
    return jsonR(res, 202, { ok: true });
  },
});
