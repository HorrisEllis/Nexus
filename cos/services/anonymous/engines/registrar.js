'use strict';
/**
 * engines/registrar.js — domain management + registrar tools
 * anonymousservers.info
 *
 * Features:
 *   - Domain availability check (RDAP + WHOIS fallback)
 *   - Nameserver management (point any domain at this platform)
 *   - Domain portfolio: track all domains owned by each tenant
 *   - Auto-configure: add domain → creates zonefile + vhost + TLS cert
 *   - Transfer guidance: step-by-step instructions per registrar
 *   - WHOIS privacy: remind users to enable it at registrar
 *   - Expiry tracking: alerts before domain expires
 */

const http   = require('http');
const https  = require('https');
const dns    = require('dns').promises;
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort: 4007,
  nameservers: [
    'ns1.anonymousservers.info',
    'ns2.anonymousservers.info',
  ],
  // RDAP bootstrap — maps TLD to RDAP endpoint
  rdapBootstrap: 'https://data.iana.org/rdap/dns.json',
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('registrar: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── RDAP domain availability ─────────────────────────────────────────────────
// RDAP is the modern replacement for WHOIS — structured JSON, no scraping

let rdapMap = null; // TLD -> RDAP base URL

async function loadRDAPBootstrap() {
  if (rdapMap) return rdapMap;
  try {
    const res = await httpsGet('https://data.iana.org/rdap/dns.json');
    const data = JSON.parse(res);
    rdapMap = {};
    for (const service of data.services || []) {
      const [tlds, urls] = service;
      for (const tld of tlds) rdapMap[tld.toLowerCase()] = urls[0];
    }
    return rdapMap;
  } catch {
    return {};
  }
}

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function rdapLookup(domain) {
  const tld = domain.split('.').slice(1).join('.').toLowerCase();
  const map = await loadRDAPBootstrap();
  const base = map[tld] || map[tld.split('.').pop()];
  if (!base) return null;
  try {
    const url = `${base.replace(/\/$/, '')}/domain/${domain}`;
    const res = await httpsGet(url);
    return JSON.parse(res);
  } catch { return null; }
}

async function checkAvailability(domain) {
  domain = domain.toLowerCase().trim();
  if (!domain.includes('.')) return { available: null, error: 'invalid domain' };

  try {
    // RDAP check
    const rdap = await rdapLookup(domain);
    if (rdap) {
      const status = rdap.status || [];
      const available = status.includes('inactive') ||
                        rdap.errorCode === 404 ||
                        (rdap.notices || []).some(n => n.title?.toLowerCase().includes('not found'));
      return {
        available: !rdap.ldhName ? true : available,
        domain,
        rdap,
        registrar:  rdap.entities?.find(e => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(f => f[0] === 'fn')?.[3] || null,
        expiry:     rdap.events?.find(e => e.eventAction === 'expiration')?.eventDate || null,
        nameservers: rdap.nameservers?.map(n => n.ldhName) || [],
      };
    }

    // Fallback: DNS resolution — if NXDOMAIN then likely available
    try {
      await dns.resolve(domain, 'NS');
      return { available: false, domain, method: 'dns' };
    } catch (e) {
      if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
        return { available: true, domain, method: 'dns', note: 'No DNS records found — likely available, verify at registrar' };
      }
      return { available: null, domain, error: e.message };
    }
  } catch (e) {
    return { available: null, domain, error: e.message };
  }
}

// ─── bulk availability check ──────────────────────────────────────────────────

async function checkBulk(name, tlds) {
  const results = await Promise.allSettled(
    tlds.map(tld => checkAvailability(`${name}.${tld}`))
  );
  return results.map((r, i) => ({
    domain: `${name}.${tlds[i]}`,
    ...(r.status === 'fulfilled' ? r.value : { available: null, error: r.reason?.message }),
  }));
}

// ─── nameserver configuration ─────────────────────────────────────────────────

function getNSInstructions(domain, registrar) {
  const ns1 = cfg.nameservers[0];
  const ns2 = cfg.nameservers[1];

  const generic = `
Set your nameservers at your current registrar to:
  NS1: ${ns1}
  NS2: ${ns2}

This points your domain's DNS to this platform.
Changes propagate within 24-48 hours.
`.trim();

  const instructions = {
    namecheap: `
1. Log in to Namecheap → Domain List → Manage
2. Under "Nameservers", select "Custom DNS"
3. Enter: ${ns1}  and  ${ns2}
4. Save — propagates in 30 min to 24h
`.trim(),
    godaddy: `
1. Log in to GoDaddy → My Products → Domains → Manage
2. Click "DNS" tab → scroll to "Nameservers"
3. Click "Change" → "Enter my own nameservers"
4. Enter: ${ns1}  and  ${ns2}
5. Save — propagates in 1-48h
`.trim(),
    cloudflare: `
Cloudflare manages DNS internally. To use external nameservers:
1. Go to Cloudflare dashboard → your domain → DNS tab
2. Disable "Cloudflare proxy" (orange cloud → grey)
3. Contact Cloudflare support to transfer DNS authority
OR: Simply add your DNS records directly in Cloudflare pointing to ${cfg.nameservers[0].replace('ns1.', '')}
`.trim(),
    porkbun: `
1. Log in to Porkbun → Domain Management
2. Click "NS" next to your domain
3. Replace default NS with: ${ns1}  and  ${ns2}
4. Save
`.trim(),
    squarespace: `
1. Log in to Squarespace → Domains
2. Click the domain → Advanced Settings
3. Under "Nameservers", click "Use Custom Nameservers"
4. Enter: ${ns1}  and  ${ns2}
`.trim(),
  };

  return {
    nameservers: cfg.nameservers,
    instructions: instructions[registrar?.toLowerCase()] || generic,
    registrar: registrar || 'generic',
    domain,
    note: 'After setting nameservers, all DNS for this domain is managed by your Nexus platform.',
  };
}

// ─── add domain to platform ───────────────────────────────────────────────────
// One call sets up everything: zone + vhost + TLS + tenant record

async function addDomainToPlatform(domain, tenantId, opts = {}) {
  const results = [];

  // 1. Add DNS zone
  ipc.send('route', {
    type:  'zone:update',
    name:  '@',
    type2: 'A',
    value: opts.ip || '127.0.0.1',
  }, 'dns');
  results.push({ step: 'dns:zone', status: 'queued' });

  // 2. Add wildcard DNS
  ipc.send('route', {
    type:  'zone:update',
    name:  '*',
    type2: 'CNAME',
    value: '@',
  }, 'dns');
  results.push({ step: 'dns:wildcard', status: 'queued' });

  // 3. Register vhost in proxy
  ipc.send('route', {
    type:   'vhost:add',
    host:   domain,
    target: opts.target || `static:./sites/${tenantId}/${domain}`,
  }, 'proxy');
  results.push({ step: 'proxy:vhost', status: 'queued' });

  // 4. Request TLS cert
  ipc.send('route', { type: 'tls:issue', domain }, 'tls');
  ipc.send('route', { type: 'tls:issue', domain: `*.${domain}` }, 'tls');
  results.push({ step: 'tls:cert', status: 'queued' });

  // 5. Record in db
  await ipc.db.insert('domains', {
    domain, tenantId,
    addedAt: Date.now(),
    nameservers: cfg.nameservers,
    status: 'active',
  });
  results.push({ step: 'db:record', status: 'ok' });

  log(`domain added: ${domain} → tenant ${tenantId}`);
  return { domain, tenantId, steps: results };
}

// ─── domain expiry tracking ───────────────────────────────────────────────────

async function checkExpiries() {
  const domains = await ipc.db.all('domains').catch(() => []);
  const alerts  = [];
  for (const d of domains) {
    if (!d.expiry) continue;
    const daysLeft = (new Date(d.expiry) - Date.now()) / 86400000;
    if (daysLeft < 30) {
      alerts.push({ domain: d.domain, daysLeft: Math.floor(daysLeft), expiry: d.expiry });
      log(`domain expiry warning: ${d.domain} expires in ${Math.floor(daysLeft)} days`, 'WARN');
    }
  }
  return alerts;
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
  const body   = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await readBody(req) : {};

  try {

    // GET /registrar/check?domain=example.com
    if (method === 'GET' && url === '/registrar/check') {
      const domain = qs.get('domain');
      if (!domain) return json(res, 400, { error: 'domain required' });
      const result = await checkAvailability(domain);
      return json(res, 200, result);
    }

    // GET /registrar/search?name=mysite&tlds=com,net,org,io
    if (method === 'GET' && url === '/registrar/search') {
      const name = qs.get('name');
      const tlds = (qs.get('tlds') || 'com,net,org,io,co,app,dev').split(',');
      if (!name) return json(res, 400, { error: 'name required' });
      const results = await checkBulk(name.toLowerCase().replace(/[^a-z0-9-]/g, ''), tlds);
      return json(res, 200, { name, results });
    }

    // GET /registrar/whois?domain=example.com
    if (method === 'GET' && url === '/registrar/whois') {
      const domain = qs.get('domain');
      if (!domain) return json(res, 400, { error: 'domain required' });
      const rdap = await rdapLookup(domain);
      if (!rdap) return json(res, 404, { error: 'RDAP data not available for this TLD' });
      return json(res, 200, rdap);
    }

    // GET /registrar/ns?domain=example.com&registrar=namecheap
    if (method === 'GET' && url === '/registrar/ns') {
      const domain    = qs.get('domain') || 'yourdomain.com';
      const registrar = qs.get('registrar') || 'generic';
      return json(res, 200, getNSInstructions(domain, registrar));
    }

    // GET /registrar/nameservers — what nameservers does this platform use
    if (method === 'GET' && url === '/registrar/nameservers') {
      return json(res, 200, { nameservers: cfg.nameservers });
    }

    // POST /registrar/domains — add a domain to the platform
    if (method === 'POST' && url === '/registrar/domains') {
      const { domain, tenantId, target } = body;
      if (!domain) return json(res, 400, { error: 'domain required' });
      const result = await addDomainToPlatform(domain, tenantId || 'default', { target });
      return json(res, 201, result);
    }

    // GET /registrar/domains — list all domains
    if (method === 'GET' && url === '/registrar/domains') {
      const domains = await ipc.db.all('domains').catch(() => []);
      return json(res, 200, { domains });
    }

    // GET /registrar/domains/:tenantId — list domains for a tenant
    if (method === 'GET' && url.startsWith('/registrar/domains/')) {
      const tenantId = url.slice('/registrar/domains/'.length);
      const domains  = await ipc.db.query('domains', `r => r.tenantId === '${tenantId}'`).catch(() => []);
      return json(res, 200, { domains });
    }

    // DELETE /registrar/domains — remove a domain
    if (method === 'DELETE' && url === '/registrar/domains') {
      const { domain } = body;
      await ipc.db.delete('domains', `r => r.domain === '${domain}'`);
      ipc.send('route', { type: 'vhost:remove', host: domain }, 'proxy');
      return json(res, 200, { removed: domain });
    }

    // GET /registrar/expiry — check all tracked domains for expiry
    if (method === 'GET' && url === '/registrar/expiry') {
      const alerts = await checkExpiries();
      return json(res, 200, { alerts });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    log(`registrar error: ${e.message}`, 'ERROR');
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
  log(`registrar engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipc.on('registrar:check', async payload => {
  const { domain, requestId } = payload || {};
  const result = await checkAvailability(domain).catch(e => ({ error: e.message }));
  ipc.send('registrar:check:reply', { requestId, ...result });
});

ipc.on('registrar:add', async payload => {
  const { domain, tenantId, target, requestId } = payload || {};
  const result = await addDomainToPlatform(domain, tenantId, { target }).catch(e => ({ error: e.message }));
  ipc.send('registrar:add:reply', { requestId, ...result });
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

// Daily expiry check
setInterval(() => checkExpiries().catch(() => {}), 24 * 60 * 60 * 1000);

log('registrar engine ready');
