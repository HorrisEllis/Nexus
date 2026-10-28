'use strict';
/**
 * engines/ddns.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Watches your public IP. On change:
 *   1. Updates the local zonefile (via dns engine IPC)
 *   2. Pushes to any configured remote provider (Cloudflare, etc.)
 *   3. Notifies the proxy engine so it can re-resolve backends if needed
 *
 * conf/ddns.conf:
 *   intervalSeconds   how often to check (default 60)
 *   domain            your root domain
 *   provider          'cloudflare' | 'duckdns' | 'none'
 *   cloudflare        { apiToken, zoneId, recordName, proxied }
 *   duckdns           { token, domain }
 *   lastIp            (written automatically — do not edit)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const https  = require('https');
const http   = require('http');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  intervalSeconds: 60,
  domain: 'anonymousservers.info',
  provider: 'none',           // 'cloudflare' | 'duckdns' | 'godaddy' | 'none'
  cloudflare: {
    apiToken:    '',
    zoneId:      '',
    recordName:  '@',
    proxied:     false
  },
  duckdns: {
    token:  '',
    domain: ''
  },
  godaddy: {
    apiKey:    '',
    apiSecret: '',
    domain:    'anonymousservers.info',
    name:      '@',           // record name, '@' = root
  },
  lastIp: null,
  lastChecked: null,
};

if (isInit()) {
  conf.init(DEFAULTS);
  process.stdout.write(JSON.stringify({ type: 'log', payload: { msg: 'ddns: wrote default conf', level: 'INFO' } }) + '\n');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── public IP resolution ─────────────────────────────────────────────────────
//   Try several services in order; return the first successful result.

const IP_SOURCES = [
  () => httpGet('https://api.ipify.org'),
  () => httpGet('https://checkip.amazonaws.com'),
  () => httpGet('https://icanhazip.com'),
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 5000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getPublicIp() {
  for (const src of IP_SOURCES) {
    try {
      const ip = await src();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {}
  }
  return null;
}

// ─── provider pushes ─────────────────────────────────────────────────────────

function cfApiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path: `/client/v4/${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch { resolve(out); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pushCloudflare(ip) {
  const { apiToken, zoneId, recordName, proxied } = cfg.cloudflare;
  if (!apiToken || !zoneId) {
    log('cloudflare push skipped — apiToken or zoneId missing', 'WARN');
    return false;
  }

  // list existing A records
  const list = await cfApiRequest('GET',
    `zones/${zoneId}/dns_records?type=A&name=${recordName === '@' ? cfg.domain : recordName + '.' + cfg.domain}`,
    null, apiToken
  );

  if (!list.success) {
    log(`cloudflare list failed: ${JSON.stringify(list.errors)}`, 'ERROR');
    return false;
  }

  const payload = { type: 'A', name: recordName, content: ip, ttl: 60, proxied };

  let result;
  if (list.result.length) {
    const id = list.result[0].id;
    result = await cfApiRequest('PUT', `zones/${zoneId}/dns_records/${id}`, payload, apiToken);
  } else {
    result = await cfApiRequest('POST', `zones/${zoneId}/dns_records`, payload, apiToken);
  }

  if (result.success) {
    log(`cloudflare updated: ${recordName} -> ${ip}`);
    return true;
  } else {
    log(`cloudflare update failed: ${JSON.stringify(result.errors)}`, 'ERROR');
    return false;
  }
}

async function pushDuckDNS(ip) {
  const { token, domain } = cfg.duckdns;
  if (!token || !domain) {
    log('duckdns push skipped — token or domain missing', 'WARN');
    return false;
  }
  try {
    const resp = await httpGet(
      `https://www.duckdns.org/update?domains=${domain}&token=${token}&ip=${ip}`
    );
    const ok = resp.trim() === 'OK';
    if (ok) log(`duckdns updated: ${domain} -> ${ip}`);
    else log(`duckdns returned: ${resp}`, 'WARN');
    return ok;
  } catch (e) {
    log(`duckdns push failed: ${e.message}`, 'ERROR');
    return false;
  }
}

async function pushGoDaddy(ip) {
  const { apiKey, apiSecret, domain, name } = cfg.godaddy;
  if (!apiKey || !apiSecret) {
    log('godaddy push skipped — apiKey or apiSecret missing in conf/ddns.conf', 'WARN');
    return false;
  }
  const recordName = name || '@';
  const body = JSON.stringify([{ data: ip, ttl: 600 }]);
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.godaddy.com',
      path: `/v1/domains/${domain || cfg.domain}/records/A/${recordName}`,
      method: 'PUT',
      headers: {
        Authorization: `sso-key ${apiKey}:${apiSecret}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        const ok = res.statusCode === 200 || res.statusCode === 204;
        if (ok) log(`godaddy updated: ${recordName} -> ${ip}`);
        else log(`godaddy update failed HTTP ${res.statusCode}: ${out}`, 'ERROR');
        resolve(ok);
      });
    });
    req.on('error', e => { log(`godaddy push error: ${e.message}`, 'ERROR'); resolve(false); });
    req.write(body);
    req.end();
  });
}

async function pushToProvider(ip) {
  switch (cfg.provider) {
    case 'cloudflare': return pushCloudflare(ip);
    case 'duckdns':    return pushDuckDNS(ip);
    case 'godaddy':    return pushGoDaddy(ip);
    case 'none':
    default:           return true; // local-only, always ok
  }
}

// ─── notify local dns engine ──────────────────────────────────────────────────

async function updateLocalZone(ip) {
  try {
    await ipc.route('dns', 'zone:update', { name: '@', type: 'A', value: ip });
    await ipc.route('dns', 'zone:update', { name: 'mail', type: 'A', value: ip });
    log(`local zone updated: @ -> ${ip}`);
  } catch (e) {
    // dns engine may not be running — not fatal, zone file will catch up on restart
    log(`local zone update skipped (dns engine not reachable): ${e.message}`, 'WARN');
  }
}

// ─── notify proxy engine ─────────────────────────────────────────────────────

async function notifyProxy(ip) {
  try {
    await ipc.route('proxy', 'ip:changed', { ip });
  } catch {}
}

// ─── main tick ────────────────────────────────────────────────────────────────

async function tick() {
  const ip = await getPublicIp();
  if (!ip) {
    log('could not resolve public IP — skipping tick', 'WARN');
    return;
  }

  cfg = conf.load(DEFAULTS); // reload in case it changed

  if (ip === cfg.lastIp) {
    log(`IP unchanged: ${ip}`);
    return;
  }

  log(`IP changed: ${cfg.lastIp || '(none)'} -> ${ip}`);

  const ok = await pushToProvider(ip);
  await updateLocalZone(ip);
  await notifyProxy(ip);

  // persist last known IP
  cfg.lastIp = ip;
  cfg.lastChecked = new Date().toISOString();
  conf.save(cfg);

  // also record in db for history
  ipc.db.insert('ddns_log', { ip, provider: cfg.provider, ok }).catch(() => {});
}

// ─── start ────────────────────────────────────────────────────────────────────

log('ddns engine starting');

// handle on-demand check from kernel or other engines
ipc.on('ddns:check', () => tick());
ipc.on('ip:changed', payload => {
  log(`received ip:changed event: ${payload?.ip}`);
});

// run immediately then on interval
tick().catch(e => log(e.message, 'ERROR'));
const intervalMs = (cfg.intervalSeconds || 60) * 1000;
setInterval(() => tick().catch(e => log(e.message, 'ERROR')), intervalMs);
log(`watching IP every ${cfg.intervalSeconds}s`);

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

