'use strict';
/**
 * engines/proxy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Reverse proxy + automatic port mapper.
 *
 * Auto port mapping works like this:
 *   - Other engines call claimPort(N) → kernel sends proxy a port:registered msg
 *   - Proxy auto-creates a vhost route: <engine>.anonymousservers.info -> :N
 *   - No manual config needed for internal services
 *   - External requests hit :80/:443, proxy routes by Host header
 *
 * conf/proxy.conf:
 *   httpPort      external HTTP port  (default 80)
 *   httpsPort     external HTTPS port (default 443)
 *   forceHttps    redirect all HTTP -> HTTPS (default false)
 *   vhosts        array of { host, target, webroot? }
 *   autoMap       true = auto-create subdomain routes for claimed ports
 *   domain        root domain (used for auto-map subdomain generation)
 *
 * Vhost target format:
 *   'http://127.0.0.1:PORT'   proxy to local port
 *   'static:/path'            serve static files from path
 *   'redirect:https://...'    301 redirect
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http   = require('http');
const https  = require('https');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const tls    = require('tls');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  httpPort:   80,
  httpsPort:  443,
  forceHttps: false,
  autoMap:    true,   // auto-route engine subdomains when they claim ports
  domain:     'anonymousservers.info',
  vhosts: [
    {
      host:    'anonymousservers.info',
      target:  'static:./sites/root',
      webroot: './sites/root'
    },
    {
      host:   'admin.anonymousservers.info',
      target: 'http://127.0.0.1:9000'
    }
  ]
};

if (isInit()) {
  conf.init(DEFAULTS);
  process.stdout.write(JSON.stringify({ type: 'log', payload: { msg: 'proxy: wrote default conf', level: 'INFO' } }) + '\n');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── vhost table (live, hot-reloadable) ───────────────────────────────────────

// host -> { target, webroot? }
const routes = new Map();

function buildRouteTable() {
  routes.clear();
  for (const v of cfg.vhosts || []) {
    routes.set(normalizeHost(v.host), v);
  }
  log(`route table rebuilt: ${routes.size} vhosts`);
}

function normalizeHost(h) {
  return (h || '').toLowerCase().replace(/:\d+$/, '');
}

function addAutoRoute(engineName, port) {
  if (!cfg.autoMap) return;
  const host = `${engineName}.${cfg.domain}`;
  const target = `http://127.0.0.1:${port}`;
  routes.set(normalizeHost(host), { host, target, auto: true });

  // persist to conf so it survives restarts
  cfg.vhosts = cfg.vhosts.filter(v => v.host !== host);
  cfg.vhosts.push({ host, target, auto: true });
  conf.save(cfg);

  log(`auto-mapped: ${host} -> ${target}`);
}

buildRouteTable();

// ─── TLS context cache ────────────────────────────────────────────────────────

const certDir = path.join(process.env.NEXUS_ROOT || '..', 'conf', 'tls', 'certs');

function getTlsContext(hostname) {
  // look for <hostname>.crt + <hostname>.key
  const crt = path.join(certDir, `${hostname}.crt`);
  const key = path.join(certDir, `${hostname}.key`);
  if (fs.existsSync(crt) && fs.existsSync(key)) {
    try {
      return tls.createSecureContext({
        cert: fs.readFileSync(crt),
        key:  fs.readFileSync(key),
      });
    } catch (e) {
      log(`TLS load failed for ${hostname}: ${e.message}`, 'WARN');
    }
  }
  // fallback: wildcard
  const wcrt = path.join(certDir, `wildcard.crt`);
  const wkey = path.join(certDir, `wildcard.key`);
  if (fs.existsSync(wcrt) && fs.existsSync(wkey)) {
    try {
      return tls.createSecureContext({
        cert: fs.readFileSync(wcrt),
        key:  fs.readFileSync(wkey),
      });
    } catch {}
  }
  return null;
}

// ─── static file server ───────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function serveStatic(docRoot, req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(docRoot, urlPath);

  // prevent directory traversal
  if (!filePath.startsWith(path.resolve(docRoot))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // try index.html fallback for SPA routing
      const index = path.join(docRoot, 'index.html');
      fs.readFile(index, (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not Found'); }
        else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(data2); }
      });
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    }
  });
}

// ─── upstream proxy ───────────────────────────────────────────────────────────

function proxyToUpstream(target, req, res) {
  const url = new URL(target);
  const options = {
    hostname: url.hostname,
    port:     Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    path:     req.url,
    method:   req.method,
    headers:  {
      ...req.headers,
      'X-Forwarded-For':   req.socket.remoteAddress,
      'X-Forwarded-Proto': req.socket.encrypted ? 'https' : 'http',
      'X-Forwarded-Host':  req.headers.host,
    }
  };

  const mod = url.protocol === 'https:' ? https : http;
  const proxyReq = mod.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Bad Gateway: ${err.message}`);
    }
    log(`upstream error [${target}]: ${err.message}`, 'WARN');
  });

  // handle WebSocket upgrade
  if (req.headers.upgrade?.toLowerCase() === 'websocket') {
    proxyReq.end();
    return;
  }

  req.pipe(proxyReq);
}

// ─── WebSocket tunnelling ─────────────────────────────────────────────────────

function proxyUpgrade(req, socket, head, target) {
  const url = new URL(target);
  const upstream = net.createConnection({ host: url.hostname, port: Number(url.port) });
  upstream.on('connect', () => {
    upstream.write(
      `GET ${req.url} HTTP/1.1\r\n` +
      `Host: ${req.headers.host}\r\n` +
      `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}\r\n` +
      `Sec-WebSocket-Version: 13\r\n\r\n`
    );
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
}

// ─── request handler ─────────────────────────────────────────────────────────

function handleRequest(req, res) {
  const host = normalizeHost(req.headers.host || '');
  const route = routes.get(host) || routes.get(`*.${cfg.domain}`) || routes.get(cfg.domain);

  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`no route for host: ${host}`);
    log(`404 no-route: ${host}${req.url}`, 'WARN');
    return;
  }

  const { target } = route;

  // log access
  ipc.db.insert('access_log', {
    host, url: req.url, method: req.method,
    ip: req.socket.remoteAddress, ts: Date.now()
  }).catch(() => {});

  if (target.startsWith('static:')) {
    const docRoot = target.slice(7);
    serveStatic(docRoot, req, res);
    return;
  }

  if (target.startsWith('redirect:')) {
    const dest = target.slice(9);
    res.writeHead(301, { Location: dest });
    res.end();
    return;
  }

  if (cfg.forceHttps && !req.socket.encrypted && !req.headers['x-forwarded-proto']?.includes('https')) {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    return;
  }

  proxyToUpstream(target, req, res);
}

// ─── servers ──────────────────────────────────────────────────────────────────

let httpServer, httpsServer;

function tryListenHttp(port) {
  httpServer.listen(port, () => {
    log(`HTTP listening on :${port}`);
    claimPort(port);
  });
}

function startHttp() {
  httpServer = http.createServer(handleRequest);
  httpServer.on('upgrade', (req, socket, head) => {
    const host  = normalizeHost(req.headers.host || '');
    const route = routes.get(host);
    if (route?.target.startsWith('http')) proxyUpgrade(req, socket, head, route.target);
    else socket.destroy();
  });
  httpServer.on('error', err => {
    if (err.code === 'EACCES') {
      const fallback = 8080;
      log(`HTTP port ${cfg.httpPort} needs admin (EACCES) — falling back to :${fallback}`, 'WARN');
      log('To use port 80: run as admin, or set httpPort=8080 in conf/proxy.conf', 'WARN');
      httpServer.removeAllListeners('error');
      httpServer.on('error', e2 => log(`HTTP error: ${e2.message}`, 'ERROR'));
      tryListenHttp(fallback);
    } else if (err.code === 'EADDRINUSE') {
      // On a default boot this is almost always our own tls engine, which
      // binds :80 for the ACME http-01 challenge. Saying "another process
      // owns it" sent people hunting for an external conflict that isn't
      // there. Name the likely owner and give the actual resolution.
      const fallback = 8080;
      log(`HTTP port ${cfg.httpPort} already bound — the tls engine holds it for ACME challenges`, 'WARN');
      log(`falling back to :${fallback} — put the tls engine in front, or set httpPort in conf/proxy.conf`, 'WARN');
      httpServer.removeAllListeners('error');
      httpServer.on('error', e2 => {
        if (e2.code === 'EADDRINUSE') log(`HTTP fallback port ${fallback} also in use — HTTP disabled`, 'ERROR');
        else log(`HTTP error: ${e2.message}`, 'ERROR');
      });
      tryListenHttp(fallback);
    } else {
      log(`HTTP error: ${err.message}`, 'ERROR');
    }
  });
  tryListenHttp(cfg.httpPort);
}

function startHttps() {
  // Build a minimal self-signed context so the server can start even without real certs
  let defaultCtx;
  try {
    const certDir2 = require('path').join(process.env.NEXUS_ROOT || '..', 'conf', 'tls', 'certs');
    const wcrt = require('path').join(certDir2, 'wildcard.crt');
    const wkey = require('path').join(certDir2, 'wildcard.key');
    if (require('fs').existsSync(wcrt) && require('fs').existsSync(wkey)) {
      defaultCtx = { cert: require('fs').readFileSync(wcrt), key: require('fs').readFileSync(wkey) };
    }
  } catch {}

  if (!defaultCtx) {
    // No cert at all yet — start without HTTPS, TLS engine will notify us when ready
    log('No TLS cert available yet — HTTPS skipped until tls engine issues a cert', 'WARN');
    return;
  }

  httpsServer = https.createServer({
    ...defaultCtx,
    SNICallback: (hostname, cb) => {
      const context = getTlsContext(hostname);
      cb(null, context || tls.createSecureContext(defaultCtx));
    },
  }, handleRequest);

  httpsServer.on('error', err => {
    if (err.code === 'EACCES') {
      log(`HTTPS port ${cfg.httpsPort} needs admin (EACCES) — falling back to :8443`, 'WARN');
      httpsServer.removeAllListeners('error');
      httpsServer.on('error', e2 => log(`HTTPS error: ${e2.message}`, 'ERROR'));
      httpsServer.listen(8443, () => { log('HTTPS listening on :8443'); claimPort(8443); });
    } else {
      log(`HTTPS error: ${err.message}`, 'WARN');
    }
  });

  httpsServer.listen(cfg.httpsPort, () => {
    log(`HTTPS listening on :${cfg.httpsPort}`);
    claimPort(cfg.httpsPort);
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// another engine claimed a port → auto-map a subdomain
ipc.on('port:registered', payload => {
  const { name, port } = payload || {};
  if (name && port) addAutoRoute(name, port);
});

// DDNS detected an IP change → nothing to do in proxy, but we log it
ipc.on('ip:changed', payload => {
  log(`IP changed to ${payload?.ip} — routes still valid (all local targets)`);
});

// hot-reload route table from conf
ipc.on('proxy:reload', () => {
  cfg = conf.load(DEFAULTS);
  buildRouteTable();
  log('route table reloaded');
});

// add or remove a vhost at runtime
ipc.on('vhost:add', payload => {
  const { host, target, webroot } = payload || {};
  if (!host || !target) return;
  cfg.vhosts = (cfg.vhosts || []).filter(v => v.host !== host);
  cfg.vhosts.push({ host, target, ...(webroot ? { webroot } : {}) });
  conf.save(cfg);
  buildRouteTable();
  log(`vhost added: ${host} -> ${target}`);
});

ipc.on('vhost:remove', payload => {
  const { host } = payload || {};
  if (!host) return;
  cfg.vhosts = (cfg.vhosts || []).filter(v => v.host !== host);
  conf.save(cfg);
  buildRouteTable();
  log(`vhost removed: ${host}`);
});

// dump current route table on request
ipc.on('proxy:routes', () => {
  const table = [];
  for (const [host, v] of routes) table.push({ host, target: v.target });
  ipc.send('proxy:routes:reply', { routes: table });
});

// ─── start ────────────────────────────────────────────────────────────────────

log('proxy engine starting');
startHttp();
startHttps();

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

