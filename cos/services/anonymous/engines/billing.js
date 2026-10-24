'use strict';
/**
 * engines/billing.js — billing + tenant management
 * anonymousservers.info
 *
 * Tenants are the unit of isolation. Everything is scoped to a tenantId.
 * Plans enforce quotas. Usage is metered per resource type.
 *
 * Value adds:
 *   - Anonymous accounts: no real name, no address required
 *   - Usage-based metering: bandwidth, storage, mailboxes, sites
 *   - Plan enforcement: quota checks before provisioning
 *   - Stripe-compatible webhook receiver (swap in real Stripe later)
 *   - Trial periods with auto-downgrade
 *   - Per-tenant secrets vault (encrypted at rest)
 */

const http   = require('http');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort: 4003,
  currency:   'usd',
  trialDays:  14,
  plans: [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      quotas: { sites: 1, emailBoxes: 1, storageGb: 1, bandwidthGb: 10, databases: 1, apps: 0 }
    },
    {
      id: 'basic',
      name: 'Basic',
      price: 5,
      quotas: { sites: 5, emailBoxes: 10, storageGb: 10, bandwidthGb: 100, databases: 3, apps: 2 }
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 15,
      quotas: { sites: 25, emailBoxes: 50, storageGb: 50, bandwidthGb: 500, databases: 10, apps: 10 }
    },
    {
      id: 'anon',
      name: 'Anonymous',
      price: 10,
      quotas: { sites: 10, emailBoxes: 20, storageGb: 20, bandwidthGb: 200, databases: 5, apps: 5 },
      noLogs: true,
      description: 'Privacy-first. No logs. Anonymous identifier only.'
    }
  ],
  encryptionKey: '', // auto-generated
};

if (isInit()) {
  const c = { ...DEFAULTS, encryptionKey: crypto.randomBytes(32).toString('hex') };
  conf.init(c);
  log('billing: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
if (!cfg.encryptionKey) {
  cfg.encryptionKey = crypto.randomBytes(32).toString('hex');
  conf.save(cfg);
}

// ─── secrets vault (AES-256-GCM) ─────────────────────────────────────────────

const ENC_KEY = Buffer.from(cfg.encryptionKey, 'hex');

function encrypt(text) {
  const iv  = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(stored) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const iv      = Buffer.from(ivHex, 'hex');
  const tag     = Buffer.from(tagHex, 'hex');
  const enc     = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ─── plan helpers ─────────────────────────────────────────────────────────────

function getPlan(planId) {
  return cfg.plans.find(p => p.id === planId) || cfg.plans.find(p => p.id === 'free');
}

// ─── tenant provisioning ──────────────────────────────────────────────────────

async function createTenant({ handle, planId, email }) {
  const tenantId  = crypto.randomBytes(12).toString('hex');
  const plan      = getPlan(planId || 'free');
  const trialEnd  = Date.now() + (cfg.trialDays * 86400000);

  const tenant = await ipc.db.insert('tenants', {
    tenantId,
    handle:    handle || `anon-${crypto.randomBytes(4).toString('hex')}`,
    planId:    plan.id,
    status:    'trial',
    trialEnd,
    email:     email ? encrypt(email) : null,  // encrypted if provided
    noLogs:    plan.noLogs || false,
    createdAt: Date.now(),
    quotas:    plan.quotas,
    usage:     { sites: 0, emailBoxes: 0, storageGb: 0, bandwidthGb: 0, databases: 0, apps: 0 },
  });

  // provision auth user
  ipc.send('route', {
    type: 'auth:user:create',
    handle: tenant.handle,
    tenantId,
    scopes: ['hosting:read', 'hosting:write', 'billing:read'],
  }, 'auth');

  log(`tenant created: ${tenant.handle} [${tenantId}] plan=${plan.id}`);
  return tenant;
}

// ─── quota enforcement ────────────────────────────────────────────────────────

async function checkQuota(tenantId, resource, amount = 1) {
  const tenants = await ipc.db.query('tenants', `r => r.tenantId === '${tenantId}'`);
  const tenant  = tenants[0];
  if (!tenant) return { allowed: false, reason: 'tenant not found' };

  const plan  = getPlan(tenant.planId);
  const quota = plan.quotas[resource];
  const used  = tenant.usage?.[resource] || 0;

  if (quota === undefined) return { allowed: true }; // no quota for this resource
  if (used + amount > quota) {
    return {
      allowed: false,
      reason:  `${resource} quota exceeded (${used}/${quota})`,
      used, quota, planId: tenant.planId,
      upgrade: cfg.plans.filter(p => (p.quotas[resource] || 0) > quota).map(p => p.id),
    };
  }
  return { allowed: true, used, quota, remaining: quota - used - amount };
}

async function recordUsage(tenantId, resource, delta) {
  await ipc.db.update('tenants',
    `r => r.tenantId === '${tenantId}'`,
    // We load and mutate; JAA doesn't support nested field updates natively
    // so we do a full object patch via a read-modify-write
    {} // placeholder — handled below
  );
  // read-modify-write
  const tenants = await ipc.db.query('tenants', `r => r.tenantId === '${tenantId}'`);
  if (!tenants[0]) return;
  const usage = { ...tenants[0].usage };
  usage[resource] = Math.max(0, (usage[resource] || 0) + delta);
  await ipc.db.update('tenants', `r => r.tenantId === '${tenantId}'`, { usage });
}

// ─── bandwidth metering ───────────────────────────────────────────────────────
// proxy reports bytes per tenant per interval

const bandwidthAccum = new Map(); // tenantId -> bytes this interval

setInterval(async () => {
  for (const [tenantId, bytes] of bandwidthAccum) {
    const gb = bytes / 1073741824;
    await recordUsage(tenantId, 'bandwidthGb', gb).catch(() => {});
  }
  bandwidthAccum.clear();
}, 60000); // flush every minute

// ─── HTTP API ─────────────────────────────────────────────────────────────────

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
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url    = req.url.split('?')[0];
  const body   = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};

  try {

    // GET /plans
    if (method === 'GET' && url === '/plans') {
      return json(res, 200, { plans: cfg.plans.map(p => ({ ...p, encryptionKey: undefined })) });
    }

    // POST /tenants — create tenant
    if (method === 'POST' && url === '/tenants') {
      const tenant = await createTenant(body);
      return json(res, 201, {
        tenantId:  tenant.tenantId,
        handle:    tenant.handle,
        planId:    tenant.planId,
        trialEnd:  tenant.trialEnd,
        quotas:    tenant.quotas,
      });
    }

    // GET /tenants/:id
    if (method === 'GET' && url.startsWith('/tenants/')) {
      const tenantId = url.slice('/tenants/'.length);
      const rows     = await ipc.db.query('tenants', `r => r.tenantId === '${tenantId}'`);
      if (!rows[0]) return json(res, 404, { error: 'tenant not found' });
      const t = { ...rows[0], email: undefined }; // never return encrypted email
      return json(res, 200, t);
    }

    // GET /tenants/:id/usage
    if (method === 'GET' && url.includes('/usage')) {
      const tenantId = url.split('/')[2];
      const rows     = await ipc.db.query('tenants', `r => r.tenantId === '${tenantId}'`);
      if (!rows[0]) return json(res, 404, { error: 'not found' });
      return json(res, 200, { usage: rows[0].usage, quotas: rows[0].quotas, planId: rows[0].planId });
    }

    // POST /tenants/:id/upgrade
    if (method === 'POST' && url.includes('/upgrade')) {
      const tenantId = url.split('/')[2];
      const { planId } = body;
      const plan = getPlan(planId);
      if (!plan) return json(res, 400, { error: 'invalid plan' });
      await ipc.db.update('tenants', `r => r.tenantId === '${tenantId}'`, {
        planId: plan.id, quotas: plan.quotas, status: 'active', noLogs: plan.noLogs || false
      });
      log(`tenant ${tenantId} upgraded to ${plan.id}`);
      return json(res, 200, { planId: plan.id, quotas: plan.quotas });
    }

    // POST /quota/check
    if (method === 'POST' && url === '/quota/check') {
      const { tenantId, resource, amount } = body;
      const result = await checkQuota(tenantId, resource, amount);
      return json(res, result.allowed ? 200 : 402, result);
    }

    // POST /secrets — store encrypted secret
    if (method === 'POST' && url === '/secrets') {
      const { tenantId, key, value } = body;
      if (!tenantId || !key || !value) return json(res, 400, { error: 'tenantId, key, value required' });
      const encrypted = encrypt(value);
      await ipc.db.upsert('secrets',
        `r => r.tenantId === '${tenantId}' && r.key === '${key}'`,
        { tenantId, key, value: encrypted, ts: Date.now() }
      );
      return json(res, 200, { ok: true });
    }

    // GET /secrets/:tenantId/:key
    if (method === 'GET' && url.startsWith('/secrets/')) {
      const parts    = url.slice('/secrets/'.length).split('/');
      const tenantId = parts[0];
      const key      = parts[1];
      const rows     = await ipc.db.query('secrets', `r => r.tenantId === '${tenantId}' && r.key === '${key}'`);
      if (!rows[0]) return json(res, 404, { error: 'not found' });
      try {
        const value = decrypt(rows[0].value);
        return json(res, 200, { value });
      } catch { return json(res, 500, { error: 'decrypt failed' }); }
    }

    // POST /webhook — Stripe-compatible payment webhook receiver
    if (method === 'POST' && url === '/webhook') {
      const { type, data } = body;
      log(`webhook: ${type}`);
      if (type === 'payment_intent.succeeded') {
        const { tenantId, planId } = data?.metadata || {};
        if (tenantId && planId) {
          const plan = getPlan(planId);
          await ipc.db.update('tenants', `r => r.tenantId === '${tenantId}'`, {
            planId: plan.id, status: 'active', quotas: plan.quotas
          });
          log(`payment confirmed: tenant ${tenantId} → plan ${planId}`);
        }
      }
      return json(res, 200, { received: true });
    }

    json(res, 404, { error: 'not found' });

  } catch (e) {
    log(`billing error: ${e.message}`, 'ERROR');
    json(res, 500, { error: 'internal error' });
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
  log(`billing engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('quota:check', async payload => {
  const { tenantId, resource, amount, requestId } = payload || {};
  const result = await checkQuota(tenantId, resource, amount);
  ipc.send('quota:result', { requestId, ...result });
});

ipc.on('quota:record', async payload => {
  const { tenantId, resource, delta } = payload || {};
  await recordUsage(tenantId, resource, delta || 1).catch(() => {});
});

ipc.on('bandwidth:report', payload => {
  const { tenantId, bytes } = payload || {};
  if (!tenantId || !bytes) return;
  bandwidthAccum.set(tenantId, (bandwidthAccum.get(tenantId) || 0) + bytes);
});

ipc.on('tenant:create', async payload => {
  const { handle, planId, email, requestId } = payload || {};
  const tenant = await createTenant({ handle, planId, email }).catch(e => ({ error: e.message }));
  ipc.send('tenant:created', { requestId, ...tenant });
});

ipc.on('tenant:get', async payload => {
  const { tenantId, requestId } = payload || {};
  const rows = await ipc.db.query('tenants', `r => r.tenantId === '${tenantId}'`).catch(() => []);
  ipc.send('tenant:reply', { requestId, tenant: rows[0] || null });
});

ipc.on('secret:get', async payload => {
  const { tenantId, key, requestId } = payload || {};
  const rows = await ipc.db.query('secrets', `r => r.tenantId === '${tenantId}' && r.key === '${key}'`).catch(() => []);
  if (!rows[0]) return ipc.send('secret:reply', { requestId, value: null });
  try {
    const value = decrypt(rows[0].value);
    ipc.send('secret:reply', { requestId, value });
  } catch { ipc.send('secret:reply', { requestId, value: null }); }
});

// trial expiry check — daily
setInterval(async () => {
  const now  = Date.now();
  const rows = await ipc.db.query('tenants', `r => r.status === 'trial' && r.trialEnd < ${now}`).catch(() => []);
  for (const t of rows) {
    await ipc.db.update('tenants', `r => r.tenantId === '${t.tenantId}'`, {
      planId: 'free', status: 'expired', quotas: getPlan('free').quotas
    });
    log(`trial expired: ${t.handle} → downgraded to free`);
  }
  if (rows.length) log(`trial expiry check: ${rows.length} downgraded`);
}, 24 * 60 * 60 * 1000);

log('billing engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

