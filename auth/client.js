#!/usr/bin/env node
'use strict';
/**
 * auth/client.js — NEXUS Remote Client
 * UUID: nexus-auth-client-v1-0000-4000-0000-000000000001
 *
 * First-run:  generates RSA-2048 keypair, prints public key for admin to register
 * Login:      GET /auth/challenge → sign nonce → encrypt session key → handshake
 * Session:    all requests encrypted AES-256-GCM, session token in header
 * Control:    full proxy to any NEXUS route through the authenticated session
 *
 * Usage:
 *   node auth/client.js setup                   — generate keypair, print pubkey
 *   node auth/client.js login                   — authenticate, save session
 *   node auth/client.js get /api/status         — authenticated GET
 *   node auth/client.js post /api/guardian/command '{"prompt":"hello"}'
 *   node auth/client.js watch                   — SSE stream from authenticated session
 *   node auth/client.js revoke                  — end session
 *   node auth/client.js whoami                  — show current session info
 *
 * Environment:
 *   NEXUS_URL          — orchestrator URL (default http://127.0.0.1:9000)
 *   NEXUS_CLIENT_DIR   — where to store keypair + session (default ~/.nexus-client)
 *   NEXUS_CLIENT_UUID  — your UUID (generated on first setup)
 */

const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');
const os      = require('os');
const readline= require('readline');

const NEXUS_URL    = process.env.NEXUS_URL       || 'http://127.0.0.1:9000';
const CLIENT_DIR   = process.env.NEXUS_CLIENT_DIR || path.join(os.homedir(), '.nexus-client');
const PRIV_FILE    = path.join(CLIENT_DIR, 'client-private.pem');
const PUB_FILE     = path.join(CLIENT_DIR, 'client-public.pem');
const UUID_FILE    = path.join(CLIENT_DIR, 'client-uuid');
const SESSION_FILE = path.join(CLIENT_DIR, 'session.json');
const UA           = `NEXUS-Client/1.0 (${os.platform()}; ${os.arch()})`;

// ── Ensure client dir ─────────────────────────────────────────────────────────
fs.mkdirSync(CLIENT_DIR, { recursive: true, mode: 0o700 });

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, urlStr, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url    = new URL(urlStr);
    const mod    = url.protocol === 'https:' ? https : http;
    const bodyBuf= body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const req = mod.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  {
        'Content-Type':  'application/json',
        'User-Agent':    UA,
        ...headers,
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.status || res.statusCode, body: JSON.parse(text), raw: text }); }
        catch(_) { resolve({ status: res.status || res.statusCode, body: null, raw: text }); }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ── AES-256-GCM ──────────────────────────────────────────────────────────────
function encryptPayload(sessionKey, plaintext) {
  const iv  = crypto.randomBytes(12);
  const cip = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const enc = Buffer.concat([cip.update(Buffer.from(plaintext)), cip.final()]);
  const tag = cip.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptPayload(sessionKey, ciphertextB64) {
  const buf = Buffer.from(ciphertextB64, 'base64');
  const iv  = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
}

// ── Keypair management ────────────────────────────────────────────────────────
function loadOrCreateKeypair() {
  if (fs.existsSync(PRIV_FILE) && fs.existsSync(PUB_FILE)) {
    return {
      privateKey: fs.readFileSync(PRIV_FILE, 'utf8'),
      publicKey:  fs.readFileSync(PUB_FILE,  'utf8'),
    };
  }
  return null;
}

function generateKeypair() {
  console.log('Generating RSA-2048 keypair…');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength:    2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(PRIV_FILE, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUB_FILE,  publicKey);
  return { privateKey, publicKey };
}

function getOrCreateUUID() {
  if (fs.existsSync(UUID_FILE)) return fs.readFileSync(UUID_FILE, 'utf8').trim();
  const uuid = crypto.randomUUID();
  fs.writeFileSync(UUID_FILE, uuid);
  return uuid;
}

// ── Session management ────────────────────────────────────────────────────────
function saveSession(sessionId, sessionKey, expiresAt) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({
    sessionId, sessionKey: sessionKey.toString('base64'), expiresAt, savedAt: Date.now(),
  }), { mode: 0o600 });
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (Date.now() > s.expiresAt) { fs.unlinkSync(SESSION_FILE); return null; }
    return { ...s, sessionKey: Buffer.from(s.sessionKey, 'base64') };
  } catch(_) { return null; }
}

function clearSession() {
  try { fs.unlinkSync(SESSION_FILE); } catch(_) {}
}

// ── Auth flow ─────────────────────────────────────────────────────────────────
async function login() {
  const keys = loadOrCreateKeypair();
  if (!keys) { console.error('Run: node auth/client.js setup  first'); process.exit(1); }
  const uuid = getOrCreateUUID();

  // 1. Fetch NEXUS public key
  console.log('Fetching NEXUS public key…');
  const pubkeyRes = await request('GET', `${NEXUS_URL}/auth/pubkey`);
  if (!pubkeyRes.body?.ok) throw new Error('Cannot reach NEXUS: ' + (pubkeyRes.body?.error || pubkeyRes.raw?.slice(0,80)));
  const nexusPubKey = pubkeyRes.body.publicKey;

  // 2. Get challenge nonce
  console.log('Requesting challenge…');
  const challengeRes = await request('GET', `${NEXUS_URL}/auth/challenge`);
  if (!challengeRes.body?.ok) throw new Error('Challenge failed: ' + challengeRes.body?.reason);
  const { nonce } = challengeRes.body;

  // 3. Sign nonce with our private key
  const sign = crypto.createSign('SHA256');
  sign.update(nonce);
  const signature = sign.sign(keys.privateKey, 'base64');

  // 4. Generate ephemeral session key + encrypt with NEXUS public key
  const sessionKey = crypto.randomBytes(32);
  const encryptedSessionKey = crypto.publicEncrypt(
    { key: nexusPubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    sessionKey
  ).toString('base64');

  // 5. Handshake
  console.log('Authenticating…');
  const handshakeRes = await request('POST', `${NEXUS_URL}/auth/handshake`, {
    uuid, signature, encryptedSessionKey, nonce, ts: Date.now(),
  });

  if (!handshakeRes.body?.ok || !handshakeRes.body?.encrypted) {
    throw new Error('Handshake failed: ' + (handshakeRes.body?.reason || 'unknown'));
  }

  // 6. Decrypt session response
  const decrypted  = JSON.parse(decryptPayload(sessionKey, handshakeRes.body.encrypted));
  const { sessionId, expiresAt } = decrypted;

  // 7. Save session
  saveSession(sessionId, sessionKey, expiresAt);

  const exp = new Date(expiresAt).toLocaleString();
  console.log(`\n✓ Authenticated`);
  console.log(`  UUID:      ${uuid}`);
  console.log(`  Session:   ${sessionId}`);
  console.log(`  Expires:   ${exp}`);
  console.log(`  Client dir: ${CLIENT_DIR}`);
}

// ── Authenticated request ─────────────────────────────────────────────────────
async function authRequest(method, routePath, body = null) {
  const session = loadSession();
  if (!session) {
    console.error('No active session. Run: node auth/client.js login');
    process.exit(1);
  }

  // Encrypt body if present
  let headers = { 'X-Nexus-Session': session.sessionId };
  let payload = null;

  if (body) {
    const plaintext = typeof body === 'string' ? body : JSON.stringify(body);
    const encrypted = encryptPayload(session.sessionKey, plaintext);
    payload = JSON.stringify({ encrypted });
    headers['X-Nexus-Encrypted'] = '1';
  }

  const res = await request(method, `${NEXUS_URL}${routePath}`, payload, headers);

  // Decrypt response if encrypted
  if (res.body?.encrypted && session.sessionKey) {
    try {
      const decrypted = decryptPayload(session.sessionKey, res.body.encrypted);
      res.body = JSON.parse(decrypted);
    } catch(_) {}
  }

  return res;
}

// ── SSE watch ─────────────────────────────────────────────────────────────────
function watchSSE(routePath = '/sse') {
  const session = loadSession();
  if (!session) { console.error('Not logged in.'); process.exit(1); }

  const url = new URL(`${NEXUS_URL}${routePath}`);
  const mod = url.protocol === 'https:' ? https : http;

  const req = mod.request({
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname,
    method:   'GET',
    headers:  {
      'Accept':           'text/event-stream',
      'X-Nexus-Session':  session.sessionId,
      'User-Agent':       UA,
    },
  }, (res) => {
    console.log(`\n▶ Connected to ${routePath}  (Ctrl+C to stop)\n`);
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            printEvent(data);
          } catch(_) {
            if (line.length > 6) console.log(dim('  ' + line.slice(6).slice(0,80)));
          }
        }
      }
    });
    res.on('end', () => { console.log('\n⚡ Stream ended'); process.exit(0); });
  });

  req.on('error', e => { console.error('SSE error:', e.message); process.exit(1); });
  req.end();
}

// ── Commands ──────────────────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

async function run() {
  switch(cmd) {

    case 'setup': {
      let keys = loadOrCreateKeypair();
      if (keys) {
        console.log(green('  ✓ ') + 'Keypair exists  ' + dim(CLIENT_DIR));
      } else {
        keys = generateKeypair();
        console.log(green('  ✓ ') + bold('RSA-2048 keypair generated'));
      }
      const uuid = getOrCreateUUID();
      console.log('');
      console.log(hr('REGISTER THIS CLIENT'));
      console.log(field('Your UUID',  cyan(uuid)));
      console.log(field('Client dir', CLIENT_DIR));
      console.log('');
      console.log('  ' + bold('Public Key') + ' — paste this into NEXUS:');
      console.log('');
      console.log(dim(keys.publicKey));
      console.log('  ' + gray('Drop ' + uuid + '.pub into auth/clients/ on the NEXUS machine'));
      break;
    }

    case 'login': {
      await login();
      break;
    }

    case 'whoami': {
      const s = loadSession();
      if (!s) { console.log('Not logged in.'); break; }
      const uuid = getOrCreateUUID();
      printSession(s, uuid);
      break;
    }

    case 'get': {
      const route = args[0] || '/api/status';
      const res   = await authRequest('GET', route);
      printRaw('GET ' + (args[0] || '/api/status'), res.body);
      break;
    }

    case 'post': {
      const route = args[0] || '/api/status';
      const body  = args[1] ? JSON.parse(args[1]) : {};
      const res   = await authRequest('POST', route, body);
      printRaw('POST ' + route, res.body);
      break;
    }

    case 'watch': {
      watchSSE(args[0] || '/sse');
      break; // process stays alive
    }

    case 'revoke': {
      const s = loadSession();
      if (s) {
        await authRequest('POST', '/auth/revoke', { sessionId: s.sessionId });
        clearSession();
      }
      console.log(green('  ✓ ') + 'Session ended');
      break;
    }

    case 'push': {
      // node auth/client.js push <filepath> [--peer <peerId>]
      // Authenticated file push through encrypted session
      const filepath = args[0];
      if (!filepath) { console.log('Usage: push <filepath> [--peer <peerId>]'); break; }
      const peerIdx  = args.indexOf('--peer');
      const peerId   = peerIdx !== -1 ? args[peerIdx + 1] : null;
      const { readFileSync, existsSync } = require('fs');
      if (!existsSync(filepath)) { console.error('File not found:', filepath); process.exit(1); }
      const content  = readFileSync(filepath, 'utf8');
      const filename = require('path').basename(filepath);
      console.log('  ' + dim('→ ') + bold(filename) + (peerId ? dim('  to peer:' + peerId) : '') + '…');
      const route = peerId ? '/api/push/peer/' + peerId : '/api/push/file';
      const res   = await authRequest('POST', route, { filename, content, source: 'auth-client-push' });
      printPush(res.body || {}, filename);
      break;
    }

    case 'dispatch': {
      // Sugar: nexus-client dispatch "write me a rate limiter"
      const prompt    = args.join(' ');
      const provider  = process.env.NEXUS_PROVIDER || 'ollama';
      const res       = await authRequest('POST', '/api/guardian/command', { prompt, provider, command: 'code' });
      printDispatch(res.body || {});
      break;
    }

    case 'status': {
      // Also fetch version
      try {
        const vr = await authRequest('GET', '/api/version');
        if (vr.body?.system) {
          console.log('\n' + hr('NEXUS v' + vr.body.system));
          const svcs = vr.body.services || {};
          for (const [k,v] of Object.entries(svcs)) {
            console.log('  ' + dim(k.padEnd(16)) + gray(v));
          }
        }
      } catch(_) {}
      const res = await authRequest('GET', '/api/status');
      const d   = res.body;
      if (!d) { console.log('No response'); break; }
      printStatus(d);
      try {
        const caps = await authRequest('GET', '/api/guardian/capabilities');
        if (caps.body && caps.body.providers && caps.body.providers.length) {
          console.log(hr('AI PROVIDERS'));
          for (const p of caps.body.providers) {
            var avail = p.available ? green('\u2713') : red('\u2717');
            var str   = (p.strengths||[]).slice(0,3).join(', ');
            console.log('  ' + avail + '  ' + bold((p.id||'?').padEnd(14)) + dim(str));
          }
          console.log('');
        }
      } catch(_) {}
      break;
    }

    case 'search': {
      // node auth/client.js search "rate limiting strategy" [--threshold 0.72] [--table gaps]
      const query     = args.filter(a=>!a.startsWith('--')).join(' ');
      if (!query) { console.log(yellow('  Usage: search <query> [--threshold 0.72] [--table gaps]')); break; }
      const tIdx = args.indexOf('--threshold');
      const tabIdx= args.indexOf('--table');
      const threshold = tIdx !== -1 ? parseFloat(args[tIdx+1]) : 0.72;
      const table     = tabIdx !== -1 ? args[tabIdx+1] : null;
      const url = '/api/search?q=' + encodeURIComponent(query) + '&k=10&threshold=' + threshold + (table?'&table='+table:'');
      const res = await authRequest('GET', url);
      const d   = res.body;
      if (!d?.ok) { console.log(red('  ✗ ') + (d?.error||'search failed')); break; }
      console.log('');
      console.log(hr('SEMANTIC SEARCH — ' + JSON.stringify(query)));
      console.log(field('SNR',       (d.snr*100).toFixed(0) + '%'));
      console.log(field('Signal',    d.signal + ' results above threshold'));
      console.log(field('Noise',     d.noise + ' results filtered out'));
      console.log(field('Threshold', (threshold*100).toFixed(0) + '% similarity'));
      if (!d.results?.length) { console.log('\n  ' + gray('No results above threshold.')); break; }
      console.log('');
      for (const r of d.results) {
        const pct = Math.round((r.snr||r.similarity||0)*100);
        const bar = '▓'.repeat(Math.round(pct/10)) + '░'.repeat(10-Math.round(pct/10));
        const col = pct>=85?'var(--g)':pct>=72?'var(--c)':'var(--muted)';
        console.log('  ' + green('['+pct+'%]') + ' ' + cyan(bar) + ' ' + bold(r.signal||'?') + ' — ' + (r.type||r.table||'?'));
        if (r.text) console.log('    ' + dim(r.text.slice(0,80)));
      }
      console.log('');
      break;
    }

    case 'gaps': {
      const res = await authRequest('GET', '/api/cortex/gaps?status=open&n=20');
      const gaps = res.body?.gaps || res.body || [];
      if (!gaps.length) { console.log('No open gaps.'); break; }
      printGaps(gaps);
      break;
    }

    case 'register-client': {
      // Admin: register another client's public key
      const [uuid, pubkeyFile] = args;
      if (!uuid || !pubkeyFile) {
        console.log('Usage: node auth/client.js register-client <uuid> <pubkey.pem>');
        break;
      }
      const publicKey = fs.readFileSync(pubkeyFile, 'utf8');
      const res = await authRequest('POST', '/auth/clients', { uuid, publicKey });
      if (res.body?.ok) console.log(green('  ✓ ') + 'Client ' + cyan(uuid) + ' registered');
      else console.log(red('  ✗ ') + (res.body?.error || 'failed'));
      break;
    }

    case 'list-clients': {
      const res = await authRequest('GET', '/auth/clients');
      printClients(res.body?.clients || []);
      break;
    }

    case 'revoke-client': {
      const [uuid] = args;
      if (!uuid) { console.log(yellow('  Usage: revoke-client <uuid>')); break; }
      const res = await authRequest('DELETE', '/auth/clients/' + uuid);
      if (res.body?.ok) console.log(red('  ✗ ') + 'Client ' + cyan(uuid) + ' revoked');
      else console.log(red('  ✗ ') + (res.body?.error || 'failed'));
      break;
    }

    default: {
      console.log('');
      console.log(bold(cyan('NEXUS')) + ' Remote Client  ' + gray(NEXUS_URL));
      console.log('');
      console.log(bold('  First time'));
      console.log(field('setup',   'Generate RSA-2048 keypair, output public key to register'));
      console.log(field('login',   'Authenticate and start an encrypted session'));
      console.log('');
      console.log(bold('  Session'));
      console.log(field('whoami',  'Your identity, session ID, expiry'));
      console.log(field('revoke',  'End your session'));
      console.log('');
      console.log(bold('  System'));
      console.log(field('status',  'All systems — online, latency, trust'));
      console.log(field('gaps',    'Open system gaps — severity, type, age'));
      console.log(field('watch',   'Live event stream  (watch /sse, watch /api/events)'));
      console.log(field('dispatch <prompt>', 'Send a job to the AI provider'));
      console.log(field('push <file>', 'Push file to NEXUS (routed by extension)'));
      console.log('');
      console.log(bold('  Raw'));
      console.log(field('get <route>',  'Authenticated GET, readable output'));
      console.log(field('post <route> <json>', 'Authenticated POST'));
      console.log('');
      console.log(bold('  Admin'));
      console.log(field('register-client <uuid> <file.pub>', 'Add client to whitelist'));
      console.log(field('list-clients', 'All registered clients'));
      console.log(field('revoke-client <uuid>', 'Remove client — immediate'));
      console.log('');
      console.log(gray('  ' + NEXUS_URL + '  ·  ' + CLIENT_DIR));
      console.log('');
    }
  }
}

run().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
