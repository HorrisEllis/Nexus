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
            const ts   = data.ts ? new Date(data.ts).toLocaleTimeString() : '';
            console.log(`[${ts}] ${data.type || 'event'}`, JSON.stringify(data).slice(0, 120));
          } catch(_) {
            if (line.length > 6) console.log(line.slice(6));
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
        console.log('Keypair already exists at', CLIENT_DIR);
      } else {
        keys = generateKeypair();
        console.log('✓ Keypair generated');
      }
      const uuid = getOrCreateUUID();
      console.log('\n── Register this client with NEXUS ──────────────────────');
      console.log('UUID:');
      console.log(uuid);
      console.log('\nPublic key (POST to /auth/clients or drop in auth/clients/<uuid>.pub):');
      console.log(keys.publicKey);
      console.log('\nOr run on the NEXUS machine:');
      console.log(`curl -X POST ${NEXUS_URL}/auth/clients \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"uuid":"${uuid}","publicKey":"<paste_public_key>","meta":{"label":"my-client"}}'`);
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
      console.log('UUID:      ', uuid);
      console.log('Session:   ', s.sessionId);
      console.log('Expires:   ', new Date(s.expiresAt).toLocaleString());
      console.log('NEXUS URL: ', NEXUS_URL);
      break;
    }

    case 'get': {
      const route = args[0] || '/api/status';
      const res   = await authRequest('GET', route);
      console.log(`HTTP ${res.status}`);
      console.log(JSON.stringify(res.body, null, 2));
      break;
    }

    case 'post': {
      const route = args[0] || '/api/status';
      const body  = args[1] ? JSON.parse(args[1]) : {};
      const res   = await authRequest('POST', route, body);
      console.log(`HTTP ${res.status}`);
      console.log(JSON.stringify(res.body, null, 2));
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
      console.log('✓ Session revoked');
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
      console.log('Pushing', filename, peerId ? '→ peer:' + peerId : '→ local');
      const route = peerId ? '/api/push/peer/' + peerId : '/api/push/file';
      const res   = await authRequest('POST', route, { filename, content, source: 'auth-client-push' });
      console.log(`HTTP ${res.status}`);
      console.log(JSON.stringify(res.body, null, 2));
      break;
    }

    case 'dispatch': {
      // Sugar: nexus-client dispatch "write me a rate limiter"
      const prompt    = args.join(' ');
      const provider  = process.env.NEXUS_PROVIDER || 'ollama';
      const res       = await authRequest('POST', '/api/guardian/command', { prompt, provider, command: 'code' });
      console.log(`HTTP ${res.status}`);
      console.log(JSON.stringify(res.body, null, 2));
      break;
    }

    case 'status': {
      const res = await authRequest('GET', '/api/status');
      const d   = res.body;
      if (!d) { console.log('No response'); break; }
      console.log('\n── NEXUS STATUS ─────────────────────────────────────────');
      const systems = d.systems || d.statuses || [];
      for (const s of systems) {
        const dot = s.online ? '●' : '○';
        console.log(`  ${dot}  ${(s.systemId || s.id || '?').padEnd(14)} :${s.port || '?'}  ${s.online ? 'online' : 'offline'}`);
      }
      break;
    }

    case 'gaps': {
      const res = await authRequest('GET', '/api/cortex/gaps?status=open&n=20');
      const gaps = res.body?.gaps || res.body || [];
      if (!gaps.length) { console.log('No open gaps.'); break; }
      console.log(`\n── ${gaps.length} OPEN GAPS ──────────────────────────────────────`);
      for (const g of gaps) {
        console.log(`  [${(g.severity||'?').padEnd(8)}] ${g.type}  ${(g.body||'').slice(0,60)}`);
      }
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
      console.log(JSON.stringify(res.body, null, 2));
      break;
    }

    case 'list-clients': {
      const res = await authRequest('GET', '/auth/clients');
      const clients = res.body?.clients || [];
      console.log(`\n── ${clients.length} REGISTERED CLIENTS ──────────────────────────`);
      for (const c of clients) {
        console.log(`  ${c.uuid}  ${JSON.stringify(c.meta)}`);
      }
      break;
    }

    case 'revoke-client': {
      const [uuid] = args;
      if (!uuid) { console.log('Usage: revoke-client <uuid>'); break; }
      const res = await authRequest('DELETE', `/auth/clients/${uuid}`);
      console.log(JSON.stringify(res.body, null, 2));
      break;
    }

    default: {
      console.log(`
NEXUS Remote Client — ${NEXUS_URL}

Commands:
  setup                      Generate keypair, print public key to register
  login                      Authenticate with NEXUS
  whoami                     Show current session
  revoke                     End current session

  get <route>                Authenticated GET request
  post <route> <json>        Authenticated POST request
  watch [route]              Stream SSE events (default: /sse)
  dispatch <prompt>          Send a job to the AI provider
  status                     All system status
  gaps                       Open system gaps

  register-client <uuid> <pubkey.pem>   Admin: add a client
  list-clients                           Admin: list all clients
  revoke-client <uuid>                   Admin: remove a client

Environment:
  NEXUS_URL          ${NEXUS_URL}
  NEXUS_CLIENT_DIR   ${CLIENT_DIR}
  NEXUS_PROVIDER     ollama (for dispatch)
`);
    }
  }
}

run().catch(e => {
  console.error('✗', e.message);
  process.exit(1);
});
