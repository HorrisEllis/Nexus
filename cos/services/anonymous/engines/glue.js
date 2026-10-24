'use strict';
/**
 * engines/glue.js — nameserver & glue record setup wizard
 * ─────────────────────────────────────────────────────────────────────────────
 * Solves the GoDaddy chicken-and-egg problem:
 *   You can't set ns1.yourdomain.com as your nameserver until
 *   GoDaddy knows what IP ns1.yourdomain.com resolves to.
 *   That IP registration is called a "glue record" or "host record".
 *
 * This engine:
 *   1. Exposes step-by-step glue + NS instructions for your registrar
 *   2. Verifies that glue records are visible from public DNS
 *   3. Verifies that NS delegation is complete (your nexus DNS answers)
 *   4. Runs a full delegation health check on demand
 *   5. Publishes your nameserver config to the DNS engine automatically
 *
 * HTTP API  (all proxied through UI on :9000/ui/glue/*)
 *   GET  /glue/status          full delegation health check
 *   GET  /glue/instructions    step-by-step for your registrar
 *   GET  /glue/verify          live DNS verification (takes ~3s)
 *   POST /glue/apply           push NS + SOA records into dns engine
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http  = require('http');
const https = require('https');
const dns   = require('dns').promises;
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort: 4009,
  domain:     'anonymousservers.info',
  publicIp:   '',            // filled by ddns on first run
  ns1:        'ns1',        // label — becomes ns1.yourdomain
  ns2:        'ns2',        // label — becomes ns2.yourdomain
  registrar:  'godaddy',   // godaddy | namecheap | cloudflare | porkbun | generic
  // GoDaddy API (optional — for automated glue record submission)
  godaddy: {
    apiKey:    '',
    apiSecret: '',
  },
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('glue: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── helpers ──────────────────────────────────────────────────────────────────

function ns1() { return `${cfg.ns1}.${cfg.domain}`; }
function ns2() { return `${cfg.ns2}.${cfg.domain}`; }

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 6000 }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve(b.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getPublicIp() {
  for (const url of ['https://api.ipify.org', 'https://checkip.amazonaws.com', 'https://icanhazip.com']) {
    try {
      const ip = await httpsGet(url);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {}
  }
  return cfg.publicIp || null;
}

// ─── DNS verification ─────────────────────────────────────────────────────────

async function verifyGlue() {
  // Check that ns1/ns2 resolve to our IP in public DNS
  const results = {};
  for (const label of [cfg.ns1, cfg.ns2]) {
    const host = `${label}.${cfg.domain}`;
    try {
      const addrs = await dns.resolve4(host);
      results[host] = { ok: addrs.includes(cfg.publicIp), resolved: addrs, expected: cfg.publicIp };
    } catch (e) {
      results[host] = { ok: false, error: e.code || e.message };
    }
  }
  return results;
}

async function verifyNSDelegation() {
  // Check that the domain's NS records point to our nameservers
  try {
    const nsRecords = await dns.resolveNs(cfg.domain);
    const ourNS = [ns1(), ns2()].map(s => s.toLowerCase());
    const found  = nsRecords.map(s => s.toLowerCase());
    const match  = ourNS.every(n => found.some(f => f === n || f === n + '.'));
    return { ok: match, found, expected: ourNS };
  } catch (e) {
    return { ok: false, error: e.code || e.message, note: 'NS not delegated yet — still using registrar nameservers' };
  }
}

async function verifySOA() {
  // Check that our DNS engine answers SOA for the domain
  try {
    const soa = await dns.resolveSoa(cfg.domain);
    const ourNs = ns1().toLowerCase();
    const ok = soa.nsname?.toLowerCase().includes(ourNs.split('.')[0]);
    return { ok, soa };
  } catch (e) {
    return { ok: false, error: e.code || e.message };
  }
}

async function fullHealthCheck() {
  const ip = await getPublicIp();
  if (ip && ip !== cfg.publicIp) {
    cfg.publicIp = ip;
    conf.save(cfg);
  }

  const [glue, ns, soa] = await Promise.all([verifyGlue(), verifyNSDelegation(), verifySOA()]);

  const steps = [
    {
      id: 'glue',
      label: 'Glue records registered',
      desc: `ns1/ns2.${cfg.domain} registered as host records with your registrar`,
      status: Object.values(glue).every(r => r.ok) ? 'ok' : Object.values(glue).some(r => r.resolved) ? 'partial' : 'pending',
      detail: glue,
    },
    {
      id: 'delegation',
      label: 'NS delegation active',
      desc: `${cfg.domain} NS records point to ${ns1()} and ${ns2()}`,
      status: ns.ok ? 'ok' : 'pending',
      detail: ns,
    },
    {
      id: 'soa',
      label: 'Nexus DNS answering',
      desc: `Your nexus DNS engine is the authoritative SOA for ${cfg.domain}`,
      status: soa.ok ? 'ok' : 'pending',
      detail: soa,
    },
  ];

  const allOk = steps.every(s => s.status === 'ok');

  return {
    domain: cfg.domain,
    publicIp: ip,
    ns1: ns1(),
    ns2: ns2(),
    allDelegated: allOk,
    steps,
    nextStep: steps.find(s => s.status !== 'ok') || null,
  };
}

// ─── registrar instructions ───────────────────────────────────────────────────

function getInstructions() {
  const ip = cfg.publicIp || '(your public IP — run nexus first to detect)';
  const domain = cfg.domain;
  const n1 = ns1();
  const n2 = ns2();

  const base = {
    domain,
    publicIp: ip,
    ns1: n1,
    ns2: n2,
    steps: [],
  };

  const glueStep = {
    step: 1,
    title: 'Register glue (host) records',
    why: `GoDaddy can't accept ns1.${domain} as a nameserver until it knows what IP that hostname resolves to. You register that IP directly in the registrar's system — this is called a glue record or host record.`,
    actions: [],
  };

  const nsStep = {
    step: 2,
    title: 'Set custom nameservers',
    why: `Once glue records exist, you tell GoDaddy to stop answering DNS for ${domain} and hand off to your nexus engine instead.`,
    actions: [],
  };

  switch ((cfg.registrar || 'godaddy').toLowerCase()) {
    case 'godaddy':
      glueStep.actions = [
        `Log in to GoDaddy → My Products → Domains → Manage (for ${domain})`,
        `Click the "DNS" tab at the top`,
        `Click the "Nameservers" sub-tab`,
        `Click "Hostnames" tab (next to Nameservers in that same row)`,
        `Click "Add" — enter Hostname: ns1  |  IP Address: ${ip}  → Save`,
        `Click "Add" again — enter Hostname: ns2  |  IP Address: ${ip}  → Save`,
        `You should now see ns1.${domain} and ns2.${domain} listed`,
      ];
      nsStep.actions = [
        `Stay on the Nameservers tab`,
        `Click "Change" next to "Nameservers"`,
        `Select "I'll use my own nameservers"`,
        `Field 1: ${n1}`,
        `Field 2: ${n2}`,
        `Click Save`,
        `GoDaddy will warn about changing DNS — confirm`,
        `Propagation: 1–48 hours (usually under 2 hours)`,
      ];
      break;

    case 'namecheap':
      glueStep.actions = [
        `Log in to Namecheap → Domain List → Manage (for ${domain})`,
        `Click "Advanced DNS" tab`,
        `Scroll to "PERSONAL DNS SERVERS" section`,
        `Click "Add Nameserver"`,
        `Nameserver: ns1  |  IP: ${ip} → Save`,
        `Add again: Nameserver: ns2  |  IP: ${ip} → Save`,
      ];
      nsStep.actions = [
        `Go back to "Domain" tab`,
        `Under "NAMESERVERS" section, select "Custom DNS"`,
        `Enter: ${n1}`,
        `Enter: ${n2}`,
        `Click the checkmark to save`,
      ];
      break;

    case 'porkbun':
      glueStep.actions = [
        `Log in to Porkbun → hover your domain → click "Details"`,
        `Scroll to "Glue Records"`,
        `Add: ns1  IP: ${ip}`,
        `Add: ns2  IP: ${ip}`,
      ];
      nsStep.actions = [
        `Click "NS" next to your domain`,
        `Replace default nameservers with:`,
        `  ${n1}`,
        `  ${n2}`,
      ];
      break;

    case 'cloudflare':
      glueStep.actions = [
        `Cloudflare handles glue automatically when you use their nameservers`,
        `Since you're moving DNS AWAY from Cloudflare, contact their support`,
        `Or: Keep Cloudflare DNS and just add A records for ns1 and ns2 pointing to ${ip}`,
      ];
      nsStep.actions = [
        `In Cloudflare dashboard → your domain → DNS`,
        `Add A record: ns1 → ${ip}`,
        `Add A record: ns2 → ${ip}`,
        `To fully delegate: go to domain registrar and change NS to ${n1} / ${n2}`,
      ];
      break;

    default:
      glueStep.actions = [
        `In your registrar's control panel, find "Host Records", "Glue Records", or "Personal Nameservers"`,
        `Register: ns1.${domain} → ${ip}`,
        `Register: ns2.${domain} → ${ip}`,
      ];
      nsStep.actions = [
        `Find the nameserver settings for ${domain}`,
        `Set to custom nameservers:`,
        `  ${n1}`,
        `  ${n2}`,
      ];
  }

  base.steps = [glueStep, nsStep, {
    step: 3,
    title: 'Verify delegation',
    why: 'After propagation, confirm your nexus DNS engine is answering authoritatively.',
    actions: [
      `Run in PowerShell: nslookup -type=NS ${domain} 8.8.8.8`,
      `Expected output should include ${n1} and ${n2}`,
      `Or use the "Run Verification" button in the Nexus UI → DNS → Nameservers tab`,
      `If correct: all subdomains you create in nexus are live to the internet immediately`,
    ],
  }, {
    step: 4,
    title: 'SOA record in nexus DNS',
    why: 'Your nexus DNS engine must identify itself as authoritative with a SOA record.',
    actions: [
      `This is automatic — nexus DNS engine publishes SOA on startup`,
      `SOA mname: ${n1}`,
      `SOA rname: hostmaster.${domain}`,
      `If not working, run: node nexus.js restart dns`,
    ],
  }];

  return base;
}

// ─── apply NS + SOA to dns engine ─────────────────────────────────────────────

async function applyToDnsEngine() {
  const ip = await getPublicIp();
  if (!ip) return { ok: false, error: 'could not detect public IP' };

  cfg.publicIp = ip;
  conf.save(cfg);

  const records = [
    // Glue A records for nameservers
    { name: cfg.ns1, type: 'A', value: ip, ttl: 3600 },
    { name: cfg.ns2, type: 'A', value: ip, ttl: 3600 },
    // NS records
    { name: '@', type: 'NS', value: ns1() + '.', ttl: 3600 },
    { name: '@', type: 'NS', value: ns2() + '.', ttl: 3600 },
    // SOA
    { name: '@', type: 'SOA', value: `${ns1()}. hostmaster.${cfg.domain}. 2026062701 3600 900 604800 300`, ttl: 3600 },
  ];

  for (const r of records) {
    ipc.send('route', { type: 'zone:update', ...r }, 'dns');
  }

  log(`applied NS + SOA + glue records to dns engine for ${cfg.domain}`);
  return { ok: true, ip, records, ns1: ns1(), ns2: ns2() };
}

// ─── GoDaddy Hostnames API (optional auto-submit) ─────────────────────────────

async function submitGlueToGodaddy(ip) {
  const { apiKey, apiSecret } = cfg.godaddy || {};
  if (!apiKey || !apiSecret) {
    return { ok: false, error: 'GoDaddy API credentials not set in conf/glue.conf' };
  }

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const results = [];

  for (const label of [cfg.ns1, cfg.ns2]) {
    const body = JSON.stringify([{ data: ip }]);
    const result = await new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.godaddy.com',
        path: `/v1/domains/${cfg.domain}/records/A/${label}`,
        method: 'PUT',
        headers: {
          Authorization: `sso-key ${apiKey}:${apiSecret}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, res => {
        let b = '';
        res.on('data', d => b += d);
        res.on('end', () => resolve({ label, status: res.statusCode, body: b }));
      });
      req.on('error', e => resolve({ label, error: e.message }));
      req.write(body);
      req.end();
    });
    results.push(result);
    log(`godaddy glue A record ${label}: HTTP ${result.status || result.error}`);
  }

  return { ok: results.every(r => r.status === 200 || r.status === 204), results };
}

// ─── HTTP API ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', d => { b += d; });
    req.on('end', () => { try { res(JSON.parse(b)); } catch { res({}); } });
    req.on('error', rej);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const method = req.method;
  const url    = req.url.split('?')[0];
  const body   = ['POST', 'PUT', 'PATCH'].includes(method) ? await readBody(req) : {};

  try {
    // GET /glue/status — full health check
    if (method === 'GET' && url === '/glue/status') {
      const status = await fullHealthCheck();
      return json(res, 200, status);
    }

    // GET /glue/instructions — step-by-step setup guide
    if (method === 'GET' && url === '/glue/instructions') {
      // reload cfg in case publicIp was updated
      cfg = conf.load(DEFAULTS);
      const instructions = getInstructions();
      return json(res, 200, instructions);
    }

    // GET /glue/verify — live DNS check
    if (method === 'GET' && url === '/glue/verify') {
      const [glue, ns] = await Promise.all([verifyGlue(), verifyNSDelegation()]);
      return json(res, 200, { glue, ns, ns1: ns1(), ns2: ns2(), domain: cfg.domain });
    }

    // POST /glue/apply — push NS + SOA to dns engine
    if (method === 'POST' && url === '/glue/apply') {
      const result = await applyToDnsEngine();
      return json(res, result.ok ? 200 : 500, result);
    }

    // POST /glue/godaddy — auto-submit glue records via GoDaddy API
    if (method === 'POST' && url === '/glue/godaddy') {
      const ip = body.ip || await getPublicIp();
      if (!ip) return json(res, 400, { error: 'could not detect IP' });
      const result = await submitGlueToGodaddy(ip);
      return json(res, result.ok ? 200 : 400, result);
    }

    // POST /glue/config — update registrar / domain / ns labels
    if (method === 'POST' && url === '/glue/config') {
      if (body.domain)    cfg.domain    = body.domain;
      if (body.registrar) cfg.registrar = body.registrar;
      if (body.ns1)       cfg.ns1       = body.ns1;
      if (body.ns2)       cfg.ns2       = body.ns2;
      if (body.publicIp)  cfg.publicIp  = body.publicIp;
      if (body.godaddy)   cfg.godaddy   = { ...cfg.godaddy, ...body.godaddy };
      conf.save(cfg);
      return json(res, 200, { ok: true, cfg });
    }

    json(res, 404, { error: 'not found' });
  } catch (e) {
    log(`glue error: ${e.message}`, 'ERROR');
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
  log(`glue engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────

// When DDNS detects our IP, cache it here too
ipc.on('ip:changed', payload => {
  if (payload?.ip) {
    cfg.publicIp = payload.ip;
    conf.save(cfg);
    log(`glue: cached new public IP ${payload.ip}`);
    // Auto-apply NS/glue records to dns engine on every IP change
    applyToDnsEngine().catch(() => {});
  }
});

ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

// Apply NS records on startup (after a short delay to let dns engine start)
setTimeout(() => applyToDnsEngine().catch(() => {}), 5000);

log('glue engine ready');
