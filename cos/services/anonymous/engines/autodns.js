'use strict';
/**
 * engines/autodns.js — fully automatic DNS delegation
 * ─────────────────────────────────────────────────────────────────────────────
 * Gets your domain pointed at nexus with zero manual steps.
 *
 * What it does:
 *   1. Detects your public IP
 *   2. Tries each DNS automation method in order until one works
 *   3. Automatically re-points when your IP changes
 *   4. Publishes NS + glue records for full delegation when possible
 *
 * Methods (tries in order):
 *
 *   A. GoDaddy API (if key set) — updates A record directly, no registrar UI
 *   B. Cloudflare API (if token+zone set) — updates A record, instant
 *   C. DuckDNS (free, no account for basic use) — gives yourdomain.duckdns.org
 *      then CNAME at GoDaddy via API
 *   D. dynv6 (free, supports custom domains and IPv6)
 *   E. Afraid.org FreeDNS — huge shared free DNS, custom subdomains
 *   F. GitHub Pages trick — push IP to a known Gist, peers poll it
 *   G. Nexus peer gossip — tell all known nexus peers your new IP
 *      (works once you have 1+ peers online — fully decentralized)
 *
 * Auto-delegation pipeline (full control of your domain):
 *   Once GoDaddy/CF API is working:
 *   1. Register ns1/ns2 host records via API
 *   2. Set NS records via API to point to nexus
 *   3. Nexus DNS engine becomes authoritative
 *   4. All future subdomain creates are instant, no API calls needed
 *
 * HTTP API:
 *   GET  /autodns/status       current IP, which method is active, last update
 *   GET  /autodns/methods      all methods + their status
 *   POST /autodns/config       set API tokens
 *   POST /autodns/run          force a DNS update cycle
 *   GET  /autodns/history      IP change log
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http   = require('http');
const https  = require('https');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort:      7802,
  domain:          'anonymousservers.info',
  checkIntervalMs: 60000,
  delegateNs:      true,   // attempt full NS delegation when API supports it

  // Method configs — set any one to enable it
  godaddy: {
    apiKey:    '',
    apiSecret: '',
  },
  cloudflare: {
    apiToken: '',
    zoneId:   '',   // auto-detected from domain if blank
  },
  duckdns: {
    token:    '',
    subdomain: '',  // your duckdns subdomain (without .duckdns.org)
  },
  dynv6: {
    token: '',
    zone:  '',      // your dynv6 zone (e.g. yourdomain.dynv6.net)
  },
  afraid: {
    key: '',        // DirectUpdate key from freedns.afraid.org
  },
  github: {
    token:  '',
    gistId: '',     // auto-created on first run if token set
  },
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('autodns: wrote default conf');
  process.exit(0);
}

let cfg        = conf.load(DEFAULTS);
let currentIp  = null;
let activeMethod = null;
const methodStatus = {};
const ipHistory = [];

// ─── IP detection ─────────────────────────────────────────────────────────────

async function getPublicIp() {
  const sources = [
    'https://api.ipify.org',
    'https://checkip.amazonaws.com',
    'https://icanhazip.com',
    'https://api4.my-ip.io/ip',
    'https://ifconfig.me/ip',
  ];
  for (const url of sources) {
    try {
      const raw = await httpsGet(url, 4000);
      const ip  = raw.trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {}
  }
  return null;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsGet(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(b.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function apiRequest(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data    = body ? JSON.stringify(body) : null;
    const parsed  = new URL(url);
    const mod     = url.startsWith('https') ? https : http;
    const allHeaders = {
      'Content-Type': 'application/json',
      'User-Agent':   'nexus-autodns/1.0',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...headers,
    };
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  allHeaders,
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, body: b }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Method A: GoDaddy API ────────────────────────────────────────────────────

async function updateGoDaddy(ip) {
  const { apiKey, apiSecret } = cfg.godaddy;
  if (!apiKey || !apiSecret) return { ok: false, reason: 'no credentials' };

  const auth = `sso-key ${apiKey}:${apiSecret}`;

  // Update A record
  const r = await apiRequest(
    'PUT',
    `https://api.godaddy.com/v1/domains/${cfg.domain}/records/A/@`,
    [{ data: ip, ttl: 600 }],
    { Authorization: auth }
  );

  if (r.status !== 200 && r.status !== 204) {
    return { ok: false, reason: `GoDaddy API ${r.status}: ${JSON.stringify(r.body)}` };
  }

  log(`godaddy: A @ → ${ip}`);

  // Attempt NS delegation if enabled
  if (cfg.delegateNs) {
    await delegateGoDaddy(ip, auth);
  }

  return { ok: true, method: 'godaddy', ip };
}

async function delegateGoDaddy(ip, auth) {
  const ns1 = `ns1.${cfg.domain}`;
  const ns2 = `ns2.${cfg.domain}`;

  try {
    // Step 1: Register host (glue) records
    for (const [label, nsHost] of [['ns1', ns1], ['ns2', ns2]]) {
      const r = await apiRequest(
        'PUT',
        `https://api.godaddy.com/v1/domains/${cfg.domain}/records/A/${label}`,
        [{ data: ip, ttl: 3600 }],
        { Authorization: auth }
      );
      log(`godaddy: glue A ${label} → ${ip} (${r.status})`);
    }

    // Step 2: Set nameservers to our nexus node
    const nsR = await apiRequest(
      'PUT',
      `https://api.godaddy.com/v1/domains/${cfg.domain}/records/NS/@`,
      [
        { data: ns1 + '.', ttl: 3600 },
        { data: ns2 + '.', ttl: 3600 },
      ],
      { Authorization: auth }
    );
    log(`godaddy: NS delegation set (${nsR.status})`);

    // Apply to local DNS engine too
    ipc.send('route', { type: 'zone:update', name: 'ns1', type2: 'A', value: ip, ttl: 3600 }, 'dns');
    ipc.send('route', { type: 'zone:update', name: 'ns2', type2: 'A', value: ip, ttl: 3600 }, 'dns');
    ipc.send('route', { type: 'zone:update', name: '@', type2: 'NS', value: ns1 + '.', ttl: 3600 }, 'dns');
    ipc.send('route', { type: 'zone:update', name: '@', type2: 'NS', value: ns2 + '.', ttl: 3600 }, 'dns');

    log('godaddy: full NS delegation attempted — propagation 1-48h');
  } catch (e) {
    log(`godaddy delegation error: ${e.message}`, 'WARN');
  }
}

// ─── Method B: Cloudflare API ─────────────────────────────────────────────────

async function updateCloudflare(ip) {
  const { apiToken, zoneId: cfgZoneId } = cfg.cloudflare;
  if (!apiToken) return { ok: false, reason: 'no CF token' };

  const auth = `Bearer ${apiToken}`;

  // Auto-detect zone ID if not set
  let zoneId = cfgZoneId;
  if (!zoneId) {
    const zones = await apiRequest('GET',
      `https://api.cloudflare.com/client/v4/zones?name=${cfg.domain}`,
      null, { Authorization: auth }
    );
    zoneId = zones.body?.result?.[0]?.id;
    if (zoneId) { cfg.cloudflare.zoneId = zoneId; conf.save(cfg); log(`cloudflare: detected zone ${zoneId}`); }
  }
  if (!zoneId) return { ok: false, reason: 'could not find CF zone for domain' };

  // Find existing A record
  const list = await apiRequest('GET',
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${cfg.domain}`,
    null, { Authorization: auth }
  );

  const payload = { type: 'A', name: '@', content: ip, ttl: 60, proxied: false };
  let r;
  if (list.body?.result?.length) {
    const id = list.body.result[0].id;
    r = await apiRequest('PUT',
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${id}`,
      payload, { Authorization: auth }
    );
  } else {
    r = await apiRequest('POST',
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      payload, { Authorization: auth }
    );
  }

  if (!r.body?.success) return { ok: false, reason: `CF: ${JSON.stringify(r.body?.errors)}` };
  log(`cloudflare: A @ → ${ip}`);
  return { ok: true, method: 'cloudflare', ip };
}

// ─── Method C: DuckDNS (free, no account needed for subdomain) ───────────────

async function updateDuckDNS(ip) {
  const { token, subdomain } = cfg.duckdns;
  if (!token || !subdomain) return { ok: false, reason: 'no duckdns token/subdomain' };

  const resp = await httpsGet(
    `https://www.duckdns.org/update?domains=${subdomain}&token=${token}&ip=${ip}`
  );
  if (resp.trim() === 'OK') {
    log(`duckdns: ${subdomain}.duckdns.org → ${ip}`);
    return { ok: true, method: 'duckdns', ip, alias: `${subdomain}.duckdns.org` };
  }
  return { ok: false, reason: `duckdns: ${resp}` };
}

// ─── Method D: dynv6 ─────────────────────────────────────────────────────────

async function updateDynv6(ip) {
  const { token, zone } = cfg.dynv6;
  if (!token || !zone) return { ok: false, reason: 'no dynv6 token/zone' };

  const resp = await httpsGet(
    `https://dynv6.com/api/update?zone=${zone}&token=${token}&ipv4=${ip}`
  );
  if (resp.includes('addresses updated') || resp.includes('no change')) {
    log(`dynv6: ${zone} → ${ip}`);
    return { ok: true, method: 'dynv6', ip };
  }
  return { ok: false, reason: `dynv6: ${resp}` };
}

// ─── Method E: FreeDNS (afraid.org) ─────────────────────────────────────────

async function updateAfraid(ip) {
  const { key } = cfg.afraid;
  if (!key) return { ok: false, reason: 'no afraid.org key' };

  const resp = await httpsGet(`https://sync.afraid.org/u/${key}/`);
  if (resp.includes('Updated') || resp.includes('No IP change')) {
    log(`afraid.org: updated → ${ip}`);
    return { ok: true, method: 'afraid', ip };
  }
  return { ok: false, reason: `afraid: ${resp}` };
}

// ─── Method F: GitHub Gist peer registry ─────────────────────────────────────

async function updateGitHubGist(ip) {
  const { token, gistId } = cfg.github;
  if (!token) return { ok: false, reason: 'no github token' };

  const content = JSON.stringify({ ip, domain: cfg.domain, ts: new Date().toISOString() }, null, 2);

  // Create gist if we don't have one
  if (!gistId) {
    const r = await apiRequest('POST', 'https://api.github.com/gists', {
      description: `nexus peer registry for ${cfg.domain}`,
      public: true,
      files: { 'nexus-ip.json': { content } },
    }, { Authorization: `token ${token}`, 'User-Agent': 'nexus/1.0' });

    if (r.body?.id) {
      cfg.github.gistId = r.body.id;
      conf.save(cfg);
      log(`github: gist created: https://gist.github.com/${r.body.id}`);
      return { ok: true, method: 'github-gist', ip, gistUrl: `https://gist.githubusercontent.com/raw/${r.body.id}` };
    }
    return { ok: false, reason: `github gist create failed: ${r.status}` };
  }

  // Update existing gist
  const r = await apiRequest('PATCH', `https://api.github.com/gists/${gistId}`, {
    files: { 'nexus-ip.json': { content } },
  }, { Authorization: `token ${token}`, 'User-Agent': 'nexus/1.0' });

  if (r.status === 200) {
    log(`github: gist updated: gist.github.com/${gistId}`);
    return { ok: true, method: 'github-gist', ip };
  }
  return { ok: false, reason: `github gist update: ${r.status}` };
}

// ─── Method G: peer gossip ────────────────────────────────────────────────────

async function updatePeerGossip(ip) {
  // Tell the peer engine which will forward to all known peers
  ipc.send('route', { type: 'ip:changed', ip }, 'peer');
  // Also update local DNS
  ipc.send('route', { type: 'zone:update', name: '@', type2: 'A', value: ip }, 'dns');
  return { ok: true, method: 'peer-gossip', ip, note: 'announced to peer network' };
}

// ─── main update cycle ────────────────────────────────────────────────────────

const METHODS = [
  { name: 'godaddy',      fn: updateGoDaddy },
  { name: 'cloudflare',   fn: updateCloudflare },
  { name: 'duckdns',      fn: updateDuckDNS },
  { name: 'dynv6',        fn: updateDynv6 },
  { name: 'afraid',       fn: updateAfraid },
  { name: 'github-gist',  fn: updateGitHubGist },
  { name: 'peer-gossip',  fn: updatePeerGossip },
];

async function runUpdate(forceIp) {
  const ip = forceIp || await getPublicIp();
  if (!ip) { log('autodns: could not detect public IP', 'WARN'); return; }

  const changed = ip !== currentIp;
  if (!changed && !forceIp) { return; }

  currentIp = ip;
  ipHistory.unshift({ ip, ts: new Date().toISOString() });
  if (ipHistory.length > 100) ipHistory.pop();

  log(`autodns: IP ${changed ? 'changed' : 'confirmed'} → ${ip}`);

  // update local DNS zone first (always)
  ipc.send('route', { type: 'zone:update', name: '@',    type2: 'A', value: ip }, 'dns');
  ipc.send('route', { type: 'zone:update', name: 'mail', type2: 'A', value: ip }, 'dns');
  ipc.send('route', { type: 'zone:update', name: 'ns1',  type2: 'A', value: ip }, 'dns');
  ipc.send('route', { type: 'zone:update', name: 'ns2',  type2: 'A', value: ip }, 'dns');
  ipc.send('ip:changed', { ip });

  // try each external method
  let anyOk = false;
  for (const m of METHODS) {
    try {
      const result = await m.fn(ip);
      methodStatus[m.name] = { ...result, lastRun: new Date().toISOString() };
      if (result.ok) {
        activeMethod = m.name;
        anyOk = true;
        log(`autodns: ${m.name} OK`);
      }
    } catch (e) {
      methodStatus[m.name] = { ok: false, reason: e.message, lastRun: new Date().toISOString() };
    }
  }

  if (!anyOk) log('autodns: all external DNS methods failed — local zone updated only', 'WARN');
  return { ip, anyOk, activeMethod };
}

// ─── HTTP API ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => b += d);
    req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj, null, 2));
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url    = req.url.split('?')[0];
  const body   = ['POST','PUT','PATCH'].includes(method) ? await readBody(req) : {};

  try {
    if (method === 'GET' && url === '/autodns/status') {
      return json(res, 200, {
        ip:           currentIp,
        domain:       cfg.domain,
        activeMethod,
        lastUpdate:   ipHistory[0] || null,
        delegateNs:   cfg.delegateNs,
      });
    }

    if (method === 'GET' && url === '/autodns/methods') {
      return json(res, 200, {
        methods: METHODS.map(m => ({
          name:      m.name,
          status:    methodStatus[m.name] || null,
          isCurrent: m.name === activeMethod,
          configured: isConfigured(m.name),
        })),
      });
    }

    if (method === 'GET' && url === '/autodns/history') {
      return json(res, 200, { history: ipHistory });
    }

    if (method === 'POST' && url === '/autodns/config') {
      // Merge config sections
      for (const key of ['godaddy','cloudflare','duckdns','dynv6','afraid','github']) {
        if (body[key]) cfg[key] = { ...cfg[key], ...body[key] };
      }
      if (body.domain)      cfg.domain      = body.domain;
      if (body.delegateNs !== undefined) cfg.delegateNs = body.delegateNs;
      conf.save(cfg);
      return json(res, 200, { ok: true });
    }

    if (method === 'POST' && url === '/autodns/run') {
      const result = await runUpdate(body.ip);
      return json(res, 200, result || { ok: false });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    log(`autodns error: ${e.message}`, 'ERROR');
    json(res, 500, { error: e.message });
  }
});

function isConfigured(name) {
  switch (name) {
    case 'godaddy':     return !!(cfg.godaddy?.apiKey);
    case 'cloudflare':  return !!(cfg.cloudflare?.apiToken);
    case 'duckdns':     return !!(cfg.duckdns?.token && cfg.duckdns?.subdomain);
    case 'dynv6':       return !!(cfg.dynv6?.token && cfg.dynv6?.zone);
    case 'afraid':      return !!(cfg.afraid?.key);
    case 'github-gist': return !!(cfg.github?.token);
    case 'peer-gossip': return true; // always available
    default: return false;
  }
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`autodns engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('ip:changed', payload => {
  if (payload?.ip) runUpdate(payload.ip).catch(() => {});
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

// ─── startup ──────────────────────────────────────────────────────────────────

// Initial run after 5s (let ddns and peer engines start first)
setTimeout(() => runUpdate().catch(e => log(e.message, 'WARN')), 5000);

// Check every interval
setInterval(() => runUpdate().catch(() => {}), cfg.checkIntervalMs);

log('autodns engine ready');
