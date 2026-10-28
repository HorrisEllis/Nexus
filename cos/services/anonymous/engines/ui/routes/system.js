'use strict';
/** engines/ui/routes/system.js — status, logs, engine control, settings, docs. */

const fs   = require('fs');
const path = require('path');
const { jsonR } = require('../lib/http');
const { renderMarkdown } = require('../lib/markdown');

const ROOT = process.env.NEXUS_ROOT || path.join(__dirname, '..', '..', '..');

module.exports = ({ ipcRequest, ipc, cfg }) => ({

  'GET /ui/config': async (req, res) => jsonR(res, 200, {
    domain: cfg.domain, siteTitle: cfg.siteTitle, port: cfg.listenPort,
  }),

  'GET /ui/status': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('monitor', 'monitor:status', {}));
    } catch (e) {
      return jsonR(res, 200, { status: 'unknown', services: [], error: e.message });
    }
  },

  'GET /ui/monitor': async (req, res) => {
    try {
      return jsonR(res, 200, await ipcRequest('monitor', 'monitor:status', {}));
    } catch (e) {
      return jsonR(res, 200, { checks: [], error: e.message });
    }
  },

  'POST /ui/monitor/add': async (req, res, { body }) => {
    if (!body.name || !body.url) return jsonR(res, 400, { error: 'name and url are required' });
    ipc.send('route', { type: 'monitor:add', ...body }, 'monitor');
    return jsonR(res, 202, { ok: true });
  },

  'GET /ui/logs/:engine': async (req, res, { params, query }) => {
    const engine = String(params.engine || '').replace(/[^a-z0-9_-]/gi, '');
    if (!engine) return jsonR(res, 400, { error: 'engine name required' });
    const lines = Math.min(parseInt(query.get('lines'), 10) || 200, 5000);
    const file  = path.join(ROOT, 'logs', engine + '.log');
    try {
      const all = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
      return jsonR(res, 200, { lines: all.slice(-lines) });
    } catch (e) {
      if (e.code === 'ENOENT') return jsonR(res, 200, { lines: [] });
      return jsonR(res, 500, { error: `cannot read ${engine}.log: ${e.message}` });
    }
  },

  'POST /ui/engine/restart': async (req, res, { body }) => {
    const engine = String(body.engine || '').replace(/[^a-z0-9_-]/gi, '');
    if (!engine) return jsonR(res, 400, { error: 'engine name required' });
    ipc.send('engine:restart', { engine });
    return jsonR(res, 202, { ok: true, engine });
  },

  'GET /ui/settings': async (req, res) => jsonR(res, 200, {
    domain: cfg.domain, siteTitle: cfg.siteTitle,
    paths: {
      root: ROOT,
      conf: path.join(ROOT, 'conf'),
      sites: path.join(ROOT, 'sites'),
      logs: path.join(ROOT, 'logs'),
      vhosts: path.join(ROOT, 'conf', 'vhosts'),
    },
  }),

  'POST /ui/settings': async (req, res, { body, saveConf }) => {
    const next = { ...cfg };
    if (body.domain)    next.domain    = String(body.domain).trim();
    if (body.siteTitle) next.siteTitle = String(body.siteTitle).trim();
    saveConf(next);
    return jsonR(res, 200, { ok: true, restartRequired: true });
  },

  'GET /ui/readme': async (req, res) => {
    try {
      const md = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
      return jsonR(res, 200, { html: renderMarkdown(md) });
    } catch { return jsonR(res, 200, { html: null }); }
  },
});
