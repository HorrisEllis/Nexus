'use strict';
/** engines/ui/routes/dns.js — zone records, templates, SSL, glue. */

const { jsonR } = require('../lib/http');

module.exports = ({ ipcRequest, ipc, cfg }) => ({

  'GET /ui/dns': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('dns', 'zone:get', {}));
    } catch (e) {
      return jsonR(res, 200, { records: [], error: e.message });
    }
  },

  'POST /ui/dns': async (req, res, { body }) => {
    if (!body.type || body.value === undefined) {
      return jsonR(res, 400, { error: 'type and value are required' });
    }
    ipc.send('route', { type: 'zone:update', ...body }, 'dns');
    return jsonR(res, 202, { ok: true });
  },

  'DELETE /ui/dns': async (req, res, { body }) => {
    if (!body.type) return jsonR(res, 400, { error: 'type is required' });
    ipc.send('route', { type: 'zone:delete', ...body }, 'dns');
    return jsonR(res, 202, { ok: true });
  },

  'POST /ui/dns/template': async (req, res, { body }) => {
    const tpl = String(body.template || '');
    const d   = cfg.domain;
    const SETS = {
      web: [
        { name: '@',   type: 'A',     value: '@',  ttl: 300 },
        { name: 'www', type: 'CNAME', value: d,    ttl: 300 },
      ],
      mail: [
        { name: '@',        type: 'MX',  value: `10 mail.${d}`, ttl: 300 },
        { name: 'mail',     type: 'A',   value: '@',            ttl: 300 },
        { name: '@',        type: 'TXT', value: `v=spf1 mx a ip4:@ -all`, ttl: 300 },
        { name: '_dmarc',   type: 'TXT', value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${d}`, ttl: 300 },
      ],
      ns: [
        { name: 'ns1', type: 'A',  value: '@', ttl: 3600 },
        { name: 'ns2', type: 'A',  value: '@', ttl: 3600 },
        { name: '@',   type: 'NS', value: `ns1.${d}`, ttl: 3600 },
        { name: '@',   type: 'NS', value: `ns2.${d}`, ttl: 3600 },
      ],
    };
    const records = SETS[tpl];
    if (!records) {
      return jsonR(res, 400, { error: `unknown template '${tpl}' — expected web, mail or ns` });
    }
    for (const r of records) ipc.send('route', { type: 'zone:update', ...r }, 'dns');
    return jsonR(res, 202, { ok: true, applied: records.length });
  },

  'GET /ui/ssl/certs': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('tls', 'tls:status', {}));
    } catch (e) {
      return jsonR(res, 200, { certs: [], error: e.message });
    }
  },

  'POST /ui/ssl/issue': async (req, res, { body }) => {
    const domain = String(body.domain || '').trim();
    if (!domain) return jsonR(res, 400, { error: 'domain is required' });
    ipc.send('route', { type: 'tls:issue', domain }, 'tls');
    return jsonR(res, 202, { ok: true, domain });
  },

  'POST /ui/glue/apply': async (req, res) => {
    ipc.send('route', { type: 'ip:changed', reason: 'panel glue apply' }, 'glue');
    return jsonR(res, 202, { ok: true });
  },
});
