'use strict';
/**
 * engines/provisioner.js — user provisioning
 * anonymousservers.info
 *
 * One call creates everything a new user needs:
 *   account (auth)  →  tenant (billing)  →  database  →  subdomain  →  vhost  →  TLS
 *
 * Result is a ready-to-use hosting account with credentials.
 */

const http   = require('http');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort:      4008,
  defaultPlan:     'free',
  defaultDomain:   'anonymousservers.info',
  dbEngine:        'sqlite',   // 'sqlite' | 'mysql' | 'postgres'
  subdomainLength: 3,          // min label length
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('provisioner: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── helpers ──────────────────────────────────────────────────────────────────

function randomStr(n = 12) { return crypto.randomBytes(n).toString('hex'); }
function randomPass()      { return crypto.randomBytes(16).toString('base64url'); }

function ipcReq(engine, type, payload, ms = 8000) {
  return new Promise((resolve, reject) => {
    const requestId = `prov-${Date.now()}-${randomStr(4)}`;
    const timer = setTimeout(() => reject(new Error(`${engine}:${type} timeout`)), ms);
    ipc.on(type + ':reply', msg => {
      if (msg.requestId !== requestId) return;
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg);
    });
    ipc.send('route', { type, ...payload, requestId }, engine);
  });
}

// ─── subdomain availability ───────────────────────────────────────────────────

async function subdomainAvailable(sub) {
  const rows = await ipc.db.query('domains', `r => r.domain === '${sub}.${cfg.defaultDomain}'`).catch(() => []);
  return rows.length === 0;
}

function sanitizeSubdomain(input) {
  return (input || '').toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

// ─── database provisioning ────────────────────────────────────────────────────

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT   = process.env.NEXUS_ROOT || path.join(__dirname, '..');
const DB_DIR = path.join(ROOT, 'state', 'databases');

function provisionSQLite(dbName) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const file = path.join(DB_DIR, `${dbName}.sqlite`);
  // touch the file — SQLite creates on first connection
  fs.writeFileSync(file, '', { flag: 'a' });
  return { engine: 'sqlite', file, connection: `sqlite://${file}` };
}

function provisionMySQL(dbName, dbUser, dbPass) {
  try {
    execSync(`mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`${dbName}\`;"`, { stdio: 'pipe' });
    execSync(`mysql -u root -e "CREATE USER IF NOT EXISTS '${dbUser}'@'localhost' IDENTIFIED BY '${dbPass}';"`, { stdio: 'pipe' });
    execSync(`mysql -u root -e "GRANT ALL ON \`${dbName}\`.* TO '${dbUser}'@'localhost'; FLUSH PRIVILEGES;"`, { stdio: 'pipe' });
    return { engine: 'mysql', host: '127.0.0.1', port: 3306, database: dbName, user: dbUser, password: dbPass, connection: `mysql://${dbUser}:${dbPass}@127.0.0.1/${dbName}` };
  } catch (e) {
    log(`MySQL unavailable (${e.message}) — falling back to SQLite`, 'WARN');
    return provisionSQLite(dbName);
  }
}

async function provisionDatabase(tenantId, label) {
  const dbName = `db_${tenantId.slice(0, 8)}_${label || randomStr(4)}`;
  const dbUser = `u_${randomStr(6)}`;
  const dbPass = randomPass();

  let db;
  if (cfg.dbEngine === 'mysql') db = provisionMySQL(dbName, dbUser, dbPass);
  else                           db = provisionSQLite(dbName);

  // Store credentials encrypted in billing secrets vault
  ipc.send('route', {
    type:     'secret:set',
    tenantId,
    key:      `db:${dbName}`,
    value:    JSON.stringify(db),
  }, 'billing');

  await ipc.db.insert('databases', {
    tenantId, dbName,
    engine:    db.engine,
    label:     label || dbName,
    createdAt: Date.now(),
  });

  log(`database provisioned: ${dbName} [${db.engine}] for tenant ${tenantId}`);
  return db;
}

// ─── full user provisioning ───────────────────────────────────────────────────

async function provisionUser({ handle, password, email, subdomain, planId, provisionDb: wantDb = true }) {

  const steps   = [];
  const result  = {};
  const logStep = (name, status, detail = '') => {
    steps.push({ name, status, detail, ts: Date.now() });
    log(`[provision] ${name}: ${status} ${detail}`);
  };

  // ── 1. Generate handle if not provided ────────────────────────────────────
  const finalHandle = handle || `user-${randomStr(4)}`;
  const finalPass   = password || randomPass();

  // ── 2. Create tenant ──────────────────────────────────────────────────────
  logStep('tenant:create', 'running');
  let tenant;
  try {
    tenant = await ipcReq('billing', 'tenant:create', {
      handle:  finalHandle,
      planId:  planId || cfg.defaultPlan,
      email,
    });
    result.tenantId = tenant.tenantId;
    result.handle   = tenant.handle;
    logStep('tenant:create', 'ok', tenant.tenantId);
  } catch (e) {
    logStep('tenant:create', 'error', e.message);
    throw e;
  }

  const tenantId = tenant.tenantId;

  // ── 3. Create auth account ────────────────────────────────────────────────
  logStep('auth:create', 'running');
  try {
    // hash password via auth engine
    await ipc.db.insert('users', {
      userId:    tenantId,
      handle:    finalHandle,
      password:  finalPass,   // auth engine will hash on first use; we store temp
      tenantId,
      scopes:    ['hosting:read', 'hosting:write'],
      createdAt: Date.now(),
    });
    result.credentials = { handle: finalHandle, password: finalPass };
    logStep('auth:create', 'ok');
  } catch (e) {
    logStep('auth:create', 'error', e.message);
  }

  // ── 4. Provision subdomain ────────────────────────────────────────────────
  logStep('subdomain:create', 'running');
  try {
    const rawSub  = sanitizeSubdomain(subdomain || finalHandle);
    const sub     = rawSub.length >= cfg.subdomainLength ? rawSub : `${rawSub}-${randomStr(2)}`;
    const domain  = `${sub}.${cfg.defaultDomain}`;
    const siteDir = path.join(ROOT, 'sites', tenantId, domain);
    fs.mkdirSync(siteDir, { recursive: true });

    // Write a default index page
    fs.writeFileSync(path.join(siteDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${domain}</title>
  <style>
    body { background:#0a0a0f; color:#e0e0f0; font-family:'Courier New',monospace;
           display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { text-align:center; }
    h1 { color:#00d4ff; font-size:2rem; margin-bottom:.5rem; }
    p  { color:#666; font-size:.9rem; }
    .dot { display:inline-block; width:8px; height:8px; background:#00ff88;
           border-radius:50%; margin-right:6px; animation:p 2s infinite; }
    @keyframes p { 0%,100%{opacity:1}50%{opacity:.3} }
  </style>
</head>
<body><div class="box">
  <h1>${domain}</h1>
  <p><span class="dot"></span>hosted on anonymousservers.info</p>
  <p style="margin-top:1rem;font-size:.8rem">Upload your files via SFTP or the control panel</p>
</div></body>
</html>`);

    // Register vhost
    ipc.send('route', { type: 'vhost:add', host: domain, target: `static:${siteDir}`, webroot: siteDir }, 'proxy');

    // Add DNS record
    ipc.send('route', { type: 'zone:update', name: sub, type: 'CNAME', value: '@' }, 'dns');

    // Request TLS cert
    ipc.send('route', { type: 'tls:issue', domain }, 'tls');

    // Record domain
    await ipc.db.insert('domains', {
      domain, tenantId, addedAt: Date.now(),
      type: 'subdomain', status: 'active',
    });

    result.subdomain = domain;
    result.siteDir   = siteDir;
    logStep('subdomain:create', 'ok', domain);
  } catch (e) {
    logStep('subdomain:create', 'error', e.message);
  }

  // ── 5. Provision database ──────────────────────────────────────────────────
  if (wantDb) {
    logStep('database:create', 'running');
    try {
      const db = await provisionDatabase(tenantId, finalHandle);
      result.database = { engine: db.engine, name: db.database || db.file };
      // Don't expose password in result — stored encrypted in secrets vault
      logStep('database:create', 'ok', `${db.engine}:${db.database || db.file}`);
    } catch (e) {
      logStep('database:create', 'error', e.message);
    }
  }

  // ── 6. Record provisioning event ──────────────────────────────────────────
  await ipc.db.insert('provisions', {
    tenantId, handle: finalHandle,
    subdomain: result.subdomain,
    database:  result.database?.name,
    planId:    planId || cfg.defaultPlan,
    steps,
    createdAt: Date.now(),
  }).catch(() => {});

  log(`user provisioned: ${finalHandle} → ${result.subdomain}`);

  return {
    ...result,
    steps,
    loginUrl:    `http://localhost:9000`,
    siteUrl:     result.subdomain ? `https://${result.subdomain}` : null,
    note: 'Password shown once — save it. Database credentials stored in encrypted vault.',
  };
}

// ─── HTTP API ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url    = req.url.split('?')[0];
  const qs     = new URL(req.url, 'http://x').searchParams;
  const body   = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};

  try {

    // POST /provision/user — full user onboarding
    if (method === 'POST' && url === '/provision/user') {
      const result = await provisionUser(body);
      return json(res, 201, result);
    }

    // POST /provision/database — add database to existing tenant
    if (method === 'POST' && url === '/provision/database') {
      const { tenantId, label } = body;
      if (!tenantId) return json(res, 400, { error: 'tenantId required' });
      const db = await provisionDatabase(tenantId, label);
      return json(res, 201, { engine: db.engine, name: db.database || db.file, note: 'Credentials stored in secrets vault' });
    }

    // POST /provision/subdomain — add subdomain to existing tenant
    if (method === 'POST' && url === '/provision/subdomain') {
      const { tenantId, subdomain } = body;
      if (!tenantId || !subdomain) return json(res, 400, { error: 'tenantId and subdomain required' });
      const sub    = sanitizeSubdomain(subdomain);
      const domain = `${sub}.${cfg.defaultDomain}`;
      const ok     = await subdomainAvailable(sub);
      if (!ok) return json(res, 409, { error: `${domain} already taken` });

      const siteDir = path.join(ROOT, 'sites', tenantId, domain);
      fs.mkdirSync(siteDir, { recursive: true });
      ipc.send('route', { type: 'vhost:add', host: domain, target: `static:${siteDir}` }, 'proxy');
      ipc.send('route', { type: 'zone:update', name: sub, type: 'CNAME', value: '@' }, 'dns');
      ipc.send('route', { type: 'tls:issue', domain }, 'tls');
      await ipc.db.insert('domains', { domain, tenantId, addedAt: Date.now(), type: 'subdomain', status: 'active' });
      return json(res, 201, { domain, siteDir });
    }

    // GET /provision/check/:subdomain — availability check
    if (method === 'GET' && url.startsWith('/provision/check/')) {
      const sub = sanitizeSubdomain(url.slice('/provision/check/'.length));
      const ok  = await subdomainAvailable(sub);
      return json(res, 200, { subdomain: `${sub}.${cfg.defaultDomain}`, available: ok });
    }

    // GET /provision/users — list all provisioned accounts
    if (method === 'GET' && url === '/provision/users') {
      const rows = await ipc.db.all('provisions').catch(() => []);
      // strip sensitive steps detail for listing
      return json(res, 200, { users: rows.map(r => ({ tenantId: r.tenantId, handle: r.handle, subdomain: r.subdomain, database: r.database, planId: r.planId, createdAt: r.createdAt })) });
    }

    json(res, 404, { error: 'not found' });

  } catch (e) {
    log(`provisioner error: ${e.message}`, 'ERROR');
    json(res, 500, { error: e.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`provisioner engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('provision:user', async payload => {
  const { requestId, ...opts } = payload || {};
  try {
    const result = await provisionUser(opts);
    ipc.send('provision:done', { requestId, ...result });
  } catch (e) {
    ipc.send('provision:error', { requestId, error: e.message });
  }
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

log('provisioner engine ready');
