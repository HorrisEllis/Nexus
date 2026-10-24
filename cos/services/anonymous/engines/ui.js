'use strict';
// [NEXUS-COMPONENT-ID]
const COMPONENT_ID   = '636117b2';
const COMPONENT_UUID = 'a64cf1e0-c837-5fd1-9802-0c294401b9c8';
const COMPONENT_NAME = 'ui';
// [/NEXUS-COMPONENT-ID]
/**
 * engines/ui.js — NexusPanel control panel engine
 * anonymousservers.info
 *
 * This file used to be 2,040 lines: the entire panel — markup, CSS, and the
 * whole client-side application — lived in one template literal, with a
 * 300-branch if/else router underneath it.
 *
 * That arrangement had no syntax checking on the client code, and a single
 * mis-escaped quote (\' inside a template literal collapses to ') produced a
 * SyntaxError that stopped the entire panel script from executing. The panel
 * rendered, and nothing in it worked.
 *
 * Now:
 *   engines/ui/public/    real .html, .css and .js served as files
 *   engines/ui/routes/    the API, grouped by subject
 *   engines/ui/lib/       http helpers, IPC correlation, static server
 *
 * This file starts the server and wires those together. Nothing else.
 */

const http = require('http');

const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');
const { jsonR, readBody } = require('./ui/lib/http');
const { install, makeRequester, inflight } = require('./ui/lib/ipc-request');
const REPLY_TYPES = require('./ui/lib/reply-types');
const statics = require('./ui/lib/static');
const { buildRouter } = require('./ui/routes');

const DEFAULTS = {
  listenPort: 9000,
  domain:     'anonymousservers.info',
  siteTitle:  'NexusPanel',
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('ui: wrote default conf');
  process.exit(0);
}

const cfg = conf.load(DEFAULTS);

// --- IPC -------------------------------------------------------------------
// One listener per reply type, registered once. Correlation is by requestId,
// which the engine SDK stamps onto every reply sent from a route handler.

install(ipc, REPLY_TYPES);
const ipcRequest = makeRequester(ipc);

const saveConf = obj => { Object.assign(cfg, obj); conf.save(cfg); };

// --- routes ----------------------------------------------------------------

const router = buildRouter({ ipc, ipcRequest, cfg, saveConf });
log(`ui: ${router.routes.length} routes registered`);

// --- server ----------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const method  = req.method.toUpperCase();
  const rawUrl  = req.url || '/';
  const urlPath = rawUrl.split('?')[0];

  let query;
  try { query = new URL(rawUrl, 'http://localhost').searchParams; }
  catch { query = new URLSearchParams(); }

  try {
    // API first — a route always beats a file of the same name.
    const hit = router.match(method, urlPath);
    if (hit) {
      // Only JSON bodies are parsed up front. A handler that wants the raw
      // stream — the builder's archive upload — must receive it unread: the
      // body can only be consumed once, and draining it here left that
      // handler waiting on a 'data' event that had already fired, so the
      // request hung until the client gave up.
      const ctype = String(req.headers['content-type'] || '');
      const wantsJson = !ctype || /json/i.test(ctype);
      const body = (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && wantsJson)
        ? await readBody(req).catch(() => ({}))
        : {};
      return await hit.handler(req, res, { params: hit.params, query, body, saveConf });
    }

    // A path that exists under another method is a 405, not a 404.
    const allowed = router.methodsFor(urlPath);
    if (allowed.length && urlPath.startsWith('/ui/')) {
      res.writeHead(405, { 'Allow': allowed.join(', '), 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: `${method} not allowed here — try ${allowed.join(' or ')}`,
      }));
    }

    // Static assets.
    if (method === 'GET' || method === 'HEAD') {
      if (statics.serve(req, res, urlPath)) return;
      // Unknown non-API path: hand back the shell so deep links work.
      if (!urlPath.startsWith('/ui/') && !urlPath.startsWith('/auth/')) {
        if (statics.serve(req, res, '/index.html')) return;
      }
    }

    return jsonR(res, 404, { error: `no route for ${method} ${urlPath}` });

  } catch (e) {
    log(`ui: unhandled error on ${method} ${urlPath} — ${e.stack || e.message}`, 'ERROR');
    return jsonR(res, 500, { error: e.message });
  }
});

server.on('error', e => {
  if (e.code !== 'EADDRINUSE') {
    log(`ui: server error — ${e.message}`, 'ERROR');
    return;
  }
  const next = cfg.listenPort + 1;
  log(`port ${cfg.listenPort} in use — trying :${next}`, 'WARN');
  cfg.listenPort = next;
  server.listen(next);
});

server.listen(cfg.listenPort, () => {
  log(`ui control panel on :${cfg.listenPort}`);
  log(`open: http://localhost:${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', {
    requestId: payload?.requestId,
    engine: NAME,
    alive: true,
    routes: router.routes.length,
    inflight: inflight(),
    ts: Date.now(),
  });
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
