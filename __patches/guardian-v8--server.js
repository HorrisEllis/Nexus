/**
 * guardian/server.js  — single entry point, v8
 *
 * WSS  :7821  — userscripts (TLS — accept cert at https://127.0.0.1:7821 first)
 * HTTP :7820  — Guardian API + Cockpit dashboard + CLI bridge
 * HTTP :7822  — Dropzone file server (LAN, 0.0.0.0)
 * HTTP :7823  — Memory + Jaa/SQLite store (LAN, 0.0.0.0)
 *
 * node server.js   ← starts everything
 *
 * New in v8:
 *   SISO event bus (Stream/Gate/StreamLog) — all events routed through gates
 *   SQLite persistence via better-sqlite3 (Jaa schema)
 *   GapHunter v3 taxonomy (200+ gaps, 60+ domains, 9 reasons)
 *   Prompt Archaeology storage
 *   Cockpit dashboard (/cockpit) with live SSE stream
 *   CLI bridge (/cli)
 *   Settings API (/settings)
 *   Sessions API (/sessions)
 *   Timeline API (/timeline)
 */

'use strict';

const http       = require('http');
const https      = require('https');
const tls        = require('tls');
const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execSync } = require('child_process');

// ── Optional deps ─────────────────────────────────────────────────────────────
let express, multer;
try { express = require('express'); multer = require('multer'); } catch (_) {}

// ── Jaa pure-JS store (zero native deps) ────────────────────────────────────────────
const { JaaStore } = require('./jaa-store.js');
const tagEngine  = require('./tag-engine.js');

// ── config ────────────────────────────────────────────────────────────────────

const HTTP_PORT     = process.env.GUARDIAN_HTTP_PORT  || 7820;
const WSS_PORT      = process.env.GUARDIAN_WS_PORT    || 7821;
const DROPZONE_PORT = process.env.GUARDIAN_DROPZONE_PORT || 7822;
const NEXUS_URL     = process.env.NEXUS_URL || 'http://127.0.0.1:3001';

const CERT_FILE = path.join(__dirname, 'guardian-cert.pem');
const KEY_FILE  = path.join(__dirname, 'guardian-key.pem');
const DB_FILE   = path.join(__dirname, 'guardian.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// ── self-signed cert generation ───────────────────────────────────────────────

function ensureCert() {
  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    console.log('[guardian] Using existing TLS cert');
    return;
  }
  console.log('[guardian] Generating self-signed TLS cert...');
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" ` +
      `-days 825 -nodes -subj "/CN=127.0.0.1" ` +
      `-addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`,
      { stdio: 'pipe' }
    );
    console.log('[guardian] TLS cert generated ✓');
  } catch (e) {
    // openssl not available — generate with Node crypto (no external dep)
    generateCertWithNode();
  }
}

function generateCertWithNode() {
  // Use selfsigned npm package if available, otherwise instruct user
  try {
    const selfsigned = require('selfsigned');
    const attrs = [{ name: 'commonName', value: '127.0.0.1' }];
    const opts  = {
      keySize: 2048,
      days: 825,
      extensions: [
        { name: 'subjectAltName', altNames: [
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' },
        ]},
      ],
    };
    const pems = selfsigned.generate(attrs, opts);
    fs.writeFileSync(KEY_FILE,  pems.private);
    fs.writeFileSync(CERT_FILE, pems.cert);
    console.log('[guardian] TLS cert generated via selfsigned ✓');
  } catch (e) {
    console.error('[guardian] Cannot generate TLS cert automatically.');
    console.error('[guardian] Run: npm install selfsigned');
    console.error('[guardian] Or install openssl and re-run.');
    process.exit(1);
  }
}

ensureCert();

const tlsOpts = {
  key:  fs.readFileSync(KEY_FILE),
  cert: fs.readFileSync(CERT_FILE),
};

// ── provider registry ─────────────────────────────────────────────────────────

const PROVIDERS = { claude: null, chatgpt: null, gemini: null, ollama: null };
const PROVIDER_ALIASES = {
  'claude.ai':         'claude',
  'chat.openai.com':   'chatgpt',
  'chatgpt.com':       'chatgpt',
  'gemini.google.com': 'gemini',
  'localhost':         'ollama',
  '127.0.0.1':         'ollama',
};

// ── job store ─────────────────────────────────────────────────────────────────

const jobs = new Map();
const responseLog = [];
const LOG_MAX = 200;

function logResponse(entry) {
  responseLog.push({ ...entry, ts: Date.now() });
  if (responseLog.length > LOG_MAX) responseLog.shift();
}

// ── helpers ───────────────────────────────────────────────────────────────────

function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  for (const ws of wss.clients) send(ws, obj);
}

function normaliseProvider(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (PROVIDER_ALIASES[r]) return PROVIDER_ALIASES[r];
  if (PROVIDERS.hasOwnProperty(r)) return r;
  for (const key of Object.keys(PROVIDERS)) {
    if (r.includes(key)) return key;
  }
  return null;
}

function parseCommand(raw) {
  const str   = (raw || '').trim();
  const match = str.match(/^\/(\w+)\s+(\w[\w.-]*)\s*([\s\S]*)$/);
  if (!match) return null;
  const [, command, providerRaw, rest] = match;
  const provider = normaliseProvider(providerRaw);
  const prompt   = rest.trim().replace(/^["']|["']$/g, '');
  return { command: command.toLowerCase(), provider, prompt, raw: str };
}

// ── NEXUS write ───────────────────────────────────────────────────────────────

async function writeToNexus(job) {
  try {
    await fetch(`${NEXUS_URL}/api/event`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:    'guardian.response.received',
        source:  'guardian',
        payload: {
          jobId: job.id, command: job.command, provider: job.provider,
          prompt: job.prompt, response: job.response,
          durationMs: Date.now() - job.ts, complete: true,
        },
        causedBy: job.id,
        ts: Date.now(),
      }),
    });
  } catch (err) {
    console.warn(`[guardian] NEXUS write failed: ${err.message}`);
  }
}

// ── job lifecycle ─────────────────────────────────────────────────────────────

function createJob({ command, provider, prompt, content }) {
  const id  = randomUUID();
  const job = { id, command, provider, prompt, content: content || null,
    status: 'pending', response: '', ts: Date.now(), updatedAt: Date.now() };
  jobs.set(id, job);
  console.log(`[guardian] job created: ${id} → ${provider} /${command}`);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function dispatchJob(job) {
  const ws = PROVIDERS[job.provider];
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    updateJob(job.id, { status: 'failed', error: `No connected userscript for: ${job.provider}` });
    console.error(`[guardian] no userscript for ${job.provider}`);
    writeToNexus({ ...job, response: '', status: 'failed' }).catch(() => {});
    return false;
  }
  send(ws, { type: 'GUARDIAN_JOB', jobId: job.id, command: job.command,
    provider: job.provider, prompt: job.prompt, content: job.content });
  updateJob(job.id, { status: 'delivered' });
  console.log(`[guardian] dispatched ${job.id} → ${job.provider}`);
  return true;
}

// ── artifact helpers ──────────────────────────────────────────────────────────

const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  python: 'py', py: 'py', html: 'html', css: 'css', json: 'json',
  markdown: 'md', md: 'md', bash: 'sh', shell: 'sh', sh: 'sh',
  rust: 'rs', go: 'go', cpp: 'cpp', c: 'c', java: 'java',
  yaml: 'yaml', toml: 'toml', sql: 'sql', graphql: 'graphql',
  jsx: 'jsx', tsx: 'tsx', svelte: 'svelte', vue: 'vue',
};

function extractCodeBlocks(text, provider = 'ai') {
  const blocks = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) !== null) {
    const lang    = (m[1] || '').toLowerCase();
    const content = m[2].trimEnd();
    if (!content.trim()) continue;
    const ext      = LANG_EXT[lang] || lang || 'txt';
    const ts       = Date.now();
    const filename = `${provider}-${ts}-${++n}.${ext}`;
    blocks.push({ filename, content, lang, ext });
  }
  return blocks;
}

function autoUploadBlocks(text, provider, jobId) {
  if (!dropzone?.autoUpload) return [];
  const blocks  = extractCodeBlocks(text, provider);
  const results = [];
  for (const b of blocks) {
    const r = dropzone.autoUpload(b.filename, b.content);
    if (r) results.push({ ...r, lang: b.lang, jobId });
  }
  if (results.length) {
    console.log(`[guardian] auto-uploaded ${results.length} code block(s) from job ${jobId}`);
  }
  return results;
}

// ── WSS server (userscripts) ──────────────────────────────────────────────────

const httpsServer = https.createServer(tlsOpts, (req, res) => {
  // Cert-acceptance landing page
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><head><title>Guardian WSS</title>
<style>body{background:#111;color:#eee;font-family:monospace;padding:40px;text-align:center}</style>
</head><body>
<h2 style="color:#2ecc71">✓ Guardian TLS cert accepted</h2>
<p>You can close this tab. The userscript will now connect successfully.</p>
<p style="color:#888;font-size:12px">wss://127.0.0.1:${WSS_PORT} is ready</p>
</body></html>`);
});

const wss = new WebSocketServer({ server: httpsServer });

wss.on('connection', (ws, req) => {
  let providerName = null;
  const clientIp     = req.socket.remoteAddress;
  const clientOrigin = req.headers['origin'] || '(no origin)';
  console.log(`[guardian] WS CONNECTED  ip:${clientIp}  origin:${clientOrigin}`);

  ws.on('message', (raw) => {
    console.log(`[guardian] MSG (${providerName || 'unregistered'}): ${String(raw).slice(0, 200)}`);
    let msg;
    try { msg = JSON.parse(raw); }
    catch (e) { console.error(`[guardian] JSON parse error: ${e.message}`); return; }

    switch (msg.type) {
      case 'GUARDIAN_REGISTER': {
        console.log(`[guardian] REGISTER  provider:"${msg.provider}"  host:"${msg.host}"`);
        const p = normaliseProvider(msg.provider || msg.host);
        console.log(`[guardian] normaliseProvider → "${p}"`);
        if (!p) {
          console.error(`[guardian] REGISTER rejected — unknown: ${msg.provider || msg.host}`);
          send(ws, { type: 'ERROR', error: `Unknown provider: ${msg.provider}` });
          return;
        }
        providerName = p;
        PROVIDERS[p] = ws;
        console.log(`[guardian] registered: ${p} ✓`);
        send(ws, { type: 'GUARDIAN_READY', provider: p });
        for (const [, job] of jobs) {
          if (job.provider === p && job.status === 'pending') dispatchJob(job);
        }
        break;
      }
      case 'GUARDIAN_DELIVERED': {
        updateJob(msg.jobId, { status: 'delivered' });
        console.log(`[guardian] delivered: ${msg.jobId}`);
        break;
      }
      case 'GUARDIAN_CHUNK': {
        const job = jobs.get(msg.jobId);
        if (!job) return;
        job.response += (msg.text || '');
        job.status    = 'streaming';
        job.updatedAt = Date.now();
        broadcast({ type: 'GUARDIAN_CHUNK', jobId: msg.jobId, text: msg.text });
        break;
      }
      case 'GUARDIAN_COMPLETE': {
        const job = jobs.get(msg.jobId);
        if (!job) return;
        if (msg.text) job.response = msg.text;
        updateJob(msg.jobId, { status: 'complete' });
        logResponse({ jobId: job.id, provider: job.provider,
          command: job.command, prompt: job.prompt, response: job.response });
        console.log(`[guardian] complete: ${job.id} (${job.response.length} chars)`);
        // Auto-upload any code blocks in the response
        autoUploadBlocks(job.response, job.provider, job.id);
        writeToNexus(job).catch(() => {});
        // Resolve /api/complete promise (Callto-executor is waiting)
        if (job._calltoResolve) {
          job._calltoResolve(job.response || '');
          delete job._calltoResolve;
          delete job._calltoReject;
        }
        break;
      }
      case 'GUARDIAN_ARTIFACT': {
        // Userscript sends: { type, jobId, filename, content, mimeType }
        if (!msg.jobId || !msg.content) return;
        const job = jobs.get(msg.jobId);
        const provider = job?.provider || 'artifact';
        const filename = msg.filename || `${provider}-artifact-${Date.now()}.txt`;
        const result   = dropzone?.autoUpload(filename, msg.content);
        if (result) {
          // Echo URL back to userscript so it can display it
          send(ws, { type: 'GUARDIAN_ARTIFACT_SAVED', jobId: msg.jobId,
            url: result.url, filename: result.filename, size: result.size });
        }
        break;
      }
      case 'GUARDIAN_FILE_UPLOAD': {
        // Userscript sends: { type, jobId, filename, dataBase64, mimeType }
        if (!msg.filename || !msg.dataBase64) return;
        const job      = jobs.get(msg.jobId);
        const provider = job?.provider || 'upload';
        const buf      = Buffer.from(msg.dataBase64, 'base64');
        const result   = dropzone?.autoUpload(msg.filename, buf);
        if (result) {
          send(ws, { type: 'GUARDIAN_FILE_SAVED', jobId: msg.jobId,
            url: result.url, filename: result.filename, size: result.size });
        }
        break;
      }
      case 'GUARDIAN_ERROR': {
        updateJob(msg.jobId, { status: 'failed', error: msg.error });
        console.error(`[guardian] error on ${msg.jobId}: ${msg.error}`);
        break;
      }
      case 'GUARDIAN_HEARTBEAT': {
        send(ws, { type: 'GUARDIAN_HEARTBEAT_ACK', ts: Date.now() });
        break;
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[guardian] WS CLOSED (${providerName || 'unregistered'}) code:${code}`);
    if (providerName && PROVIDERS[providerName] === ws) {
      PROVIDERS[providerName] = null;
      console.log(`[guardian] disconnected: ${providerName}`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[guardian] WS ERROR (${providerName || 'unregistered'}): ${err.message}`);
  });
});

httpsServer.listen(WSS_PORT, '127.0.0.1', () => {
  console.log(`[guardian] WSS server on wss://127.0.0.1:${WSS_PORT}`);
  console.log(`[guardian] ⚠  FIRST RUN: visit https://127.0.0.1:${WSS_PORT}/ in your browser and accept the cert warning`);
});

// ── SSE clients ───────────────────────────────────────────────────────────────

const sseClients = new Map();

function broadcastChunk(jobId, text) {
  const clients = sseClients.get(jobId);
  if (!clients) return;
  for (const res of clients) res.write(`data: ${JSON.stringify({ text })}\n\n`);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'GUARDIAN_CHUNK' && msg.jobId && msg.text) broadcastChunk(msg.jobId, msg.text);
      if (msg.type === 'GUARDIAN_COMPLETE' && msg.jobId) {
        const clients = sseClients.get(msg.jobId);
        if (clients) {
          for (const res of clients) { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); }
          sseClients.delete(msg.jobId);
        }
      }
    } catch {}
  });
});

// ── HTTP server (CLI + dashboard) ─────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);

  if (req.method === 'POST' && url.pathname === '/command') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        let parsed;
        if (data.raw) {
          parsed = parseCommand(data.raw);
          if (!parsed) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Could not parse command' }));
            return;
          }
        } else {
          parsed = { command: data.command || 'code',
            provider: normaliseProvider(data.provider),
            prompt: data.prompt || '', content: data.content || null };
        }
        if (!parsed.provider) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: `Unknown provider: ${data.provider || '?'}` }));
          return;
        }
        const job = createJob(parsed);
        dispatchJob(job);
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, jobId: job.id, status: job.status }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
    const job = jobs.get(url.pathname.split('/')[2]);
    if (!job) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Job not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, job: { ...job, resolve: undefined } }));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/response/')) {
    const job = jobs.get(url.pathname.split('/')[2]);
    if (!job) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Job not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, complete: job.status === 'complete',
      status: job.status, response: job.response, error: job.error || null }));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/stream/')) {
    const jobId = url.pathname.split('/')[2];
    const job   = jobs.get(jobId);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    if (job && job.response) res.write(`data: ${JSON.stringify({ text: job.response, partial: true })}\n\n`);
    if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
    sseClients.get(jobId).add(res);
    req.on('close', () => {
      const clients = sseClients.get(jobId);
      if (clients) { clients.delete(res); if (clients.size === 0) sseClients.delete(jobId); }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/providers') {
    const status = {};
    for (const [name, ws] of Object.entries(PROVIDERS)) {
      status[name] = ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, providers: status }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/jobs') {
    const limit  = parseInt(url.searchParams.get('limit') || '20');
    const filter = url.searchParams.get('status');
    let list     = [...jobs.values()].reverse().slice(0, limit);
    if (filter) list = list.filter(j => j.status === filter);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, jobs: list.map(j => ({ ...j, resolve: undefined })) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/log') {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, log: responseLog.slice(-limit) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    const providers = {};
    for (const [name, ws] of Object.entries(PROVIDERS)) {
      providers[name] = ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected';
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(),
      jobs: jobs.size, providers, wsClients: wss.clients.size }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/test') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html><html><head><title>Guardian WSS Test</title>
<style>body{background:#111;color:#eee;font-family:monospace;padding:20px}
h2{color:#3498db}.ok{color:#2ecc71}.err{color:#e74c3c}.info{color:#aaa}.warn{color:#f39c12}
div{margin:2px 0}</style></head><body>
<h2>Guardian WSS Test</h2>
<p class="info">Tests <strong>wss://127.0.0.1:${WSS_PORT}</strong> from this page.</p>
<p class="warn">⚠ First: visit <a href="https://127.0.0.1:${WSS_PORT}/" target="_blank" style="color:#f39c12">https://127.0.0.1:${WSS_PORT}/</a> and accept the cert, then run test.</p>
<button onclick="runTest()" style="padding:8px 18px;cursor:pointer;margin-top:8px">Run Test</button>
<div id="log"></div>
<script>
function log(msg,cls){const d=document.createElement('div');d.className=cls||'info';
d.textContent='['+new Date().toISOString().slice(11,23)+'] '+msg;document.getElementById('log').appendChild(d);}
function runTest(){
  document.getElementById('log').innerHTML='';
  log('Opening wss://127.0.0.1:${WSS_PORT} ...','info');
  let ws;
  try{ws=new WebSocket('wss://127.0.0.1:${WSS_PORT}');}
  catch(e){log('new WebSocket() threw: '+e.message,'err');return;}
  log('WebSocket object created — waiting...','info');
  ws.onopen=function(){
    log('✓ WS OPEN — handshake succeeded!','ok');
    ws.send(JSON.stringify({type:'GUARDIAN_REGISTER',provider:'test-browser',host:location.hostname}));
    log('→ sent GUARDIAN_REGISTER','info');
  };
  ws.onmessage=function(e){
    log('← received: '+e.data,'ok');
    ws.close();
  };
  ws.onerror=function(){
    log('✗ WS ERROR — cert not accepted yet? Visit https://127.0.0.1:${WSS_PORT}/ first','err');
  };
  ws.onclose=function(e){
    log('WS CLOSED code:'+e.code+' wasClean:'+e.wasClean,e.wasClean?'info':'warn');
  };
  setTimeout(function(){
    if(ws.readyState!==WebSocket.OPEN&&ws.readyState!==WebSocket.CLOSED){
      log('✗ TIMEOUT','err');ws.close();
    }
  },5000);
}
<\/script></body></html>`);
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`[guardian] HTTP API on http://127.0.0.1:${HTTP_PORT}`);
  console.log(`[guardian] Ready.\n`);
});

// ── DROPZONE server ───────────────────────────────────────────────────────────
// Starts an Express file-sharing drop zone on DROPZONE_PORT alongside guardian.
// Requires: npm install express multer
// Access: http://127.0.0.1:<DROPZONE_PORT>  (LAN-accessible on 0.0.0.0)

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push({ name, address: iface.address });
    }
  }
  return ips;
}

function sanitizeFilename(name) {
  return path.basename(name).replace(/[^\w.\-]/g, '_').slice(0, 240) || 'file';
}

function fmtSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 ** 2)   return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3)   return (bytes / 1024 ** 2).toFixed(1) + ' MB';
  return (bytes / 1024 ** 3).toFixed(2) + ' GB';
}

function buildDropzoneHTML(cfg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${cfg.serverName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #030506; --surface: #080d10; --surface2: #0d1519; --border: #0f2030;
  --text: #c8e8f0; --muted: #3a6070; --mono: 'Share Tech Mono', monospace;
  --display: 'Orbitron', sans-serif;
  --r: 0; --g: 200; --b: 255;
  --rgb: rgb(var(--r), var(--g), var(--b));
  --rgb-dim: rgba(var(--r), var(--g), var(--b), 0.12);
  --rgb-glow: rgba(var(--r), var(--g), var(--b), 0.35);
}
html, body { height: 100%; }
body { background: var(--bg); color: var(--text); font-family: var(--mono); overflow-x: hidden; min-height: 100vh; }
.bg-grid { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: linear-gradient(rgba(var(--r),var(--g),var(--b),0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--r),var(--g),var(--b),0.03) 1px, transparent 1px);
  background-size: 40px 40px; animation: gridDrift 20s linear infinite; }
@keyframes gridDrift { from { background-position: 0 0; } to { background-position: 40px 40px; } }
.scanline { position: fixed; left: 0; right: 0; height: 2px; z-index: 1; pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--rgb), transparent);
  opacity: 0.6; animation: scan 4s linear infinite; top: -2px; }
@keyframes scan { from { top: -2px; } to { top: 100vh; } }
.corner { position: fixed; width: 60px; height: 60px; z-index: 2; pointer-events: none; }
.corner::before, .corner::after { content:''; position: absolute; background: var(--rgb); }
.corner::before { width: 2px; height: 100%; }
.corner::after  { width: 100%; height: 2px; }
.corner-tl { top: 16px; left: 16px; } .corner-tr { top: 16px; right: 16px; transform: scaleX(-1); }
.corner-bl { bottom: 16px; left: 16px; transform: scaleY(-1); } .corner-br { bottom: 16px; right: 16px; transform: scale(-1); }
.app { position: relative; z-index: 10; max-width: 1200px; margin: 0 auto; padding: 2rem; }
header { display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 2.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);
  flex-wrap: wrap; gap: 1rem; }
.logo { font-family: var(--display); font-size: clamp(1.6rem, 4vw, 2.8rem); font-weight: 900;
  letter-spacing: 0.12em; color: var(--rgb);
  text-shadow: 0 0 30px var(--rgb-glow), 0 0 60px var(--rgb-dim);
  animation: logoPulse 2s ease-in-out infinite; }
@keyframes logoPulse { 0%,100% { text-shadow: 0 0 20px var(--rgb-glow); } 50% { text-shadow: 0 0 40px var(--rgb-glow), 0 0 80px var(--rgb-dim); } }
.header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.server-ip { font-size: 0.7rem; color: var(--muted); letter-spacing: 0.1em; }
.server-ip span { color: var(--rgb); }
.status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--rgb); margin-right: 6px; box-shadow: 0 0 8px var(--rgb-glow);
  animation: blink 1.2s ease-in-out infinite; }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.stats-bar { display: flex; gap: 1.5rem; margin-bottom: 2rem; flex-wrap: wrap; }
.stat { background: var(--surface); border: 1px solid var(--border);
  padding: 0.6rem 1.2rem; border-radius: 2px; font-size: 0.72rem; letter-spacing: 0.08em;
  position: relative; overflow: hidden; transition: border-color 0.3s; }
.stat::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--rgb); }
.stat:hover { border-color: rgba(var(--r),var(--g),var(--b),0.4); }
.stat-label { color: var(--muted); text-transform: uppercase; font-size: 0.62rem; margin-bottom: 0.2rem; }
.stat-value { color: var(--text); font-size: 0.9rem; }
.main-grid { display: grid; grid-template-columns: 380px 1fr; gap: 1.5rem; align-items: start; }
@media (max-width: 900px) { .main-grid { grid-template-columns: 1fr; } }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: 3px; overflow: hidden; position: relative; }
.panel::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--rgb), transparent); }
.panel-header { padding: 0.8rem 1.2rem; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; background: var(--surface2); }
.panel-title { font-family: var(--display); font-size: 0.6rem; letter-spacing: 0.2em;
  text-transform: uppercase; color: var(--rgb); }
.panel-body { padding: 1.2rem; }
#drop-zone { border: 2px dashed var(--border); border-radius: 3px; padding: 2.5rem 1rem;
  text-align: center; cursor: pointer; transition: all 0.25s; position: relative; overflow: hidden; margin-bottom: 1rem; }
#drop-zone::after { content: ''; position: absolute; inset: 0; background: var(--rgb-dim); opacity: 0; transition: opacity 0.25s; }
#drop-zone:hover, #drop-zone.dragover { border-color: var(--rgb); box-shadow: 0 0 20px var(--rgb-dim), inset 0 0 20px var(--rgb-dim); }
#drop-zone:hover::after, #drop-zone.dragover::after { opacity: 1; }
.dz-icon { font-size: 2.5rem; margin-bottom: 0.75rem; display: block; filter: drop-shadow(0 0 12px var(--rgb-glow)); animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.dz-text { color: var(--text); font-size: 0.82rem; margin-bottom: 0.3rem; }
.dz-sub  { color: var(--muted); font-size: 0.7rem; }
#file-chosen { color: var(--rgb); font-size: 0.75rem; margin-top: 0.5rem; word-break: break-all; padding: 0 0.5rem; }
#file-input { display: none; }
.form-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.9rem; font-size: 0.78rem; color: var(--muted); }
.form-row label { white-space: nowrap; }
select, input[type=number] { flex: 1; background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 2px; padding: 0.35rem 0.6rem;
  font-family: var(--mono); font-size: 0.78rem; outline: none; transition: border-color 0.2s; }
select:focus, input:focus { border-color: rgba(var(--r),var(--g),var(--b),0.5); }
#upload-btn { width: 100%; padding: 0.85rem; background: transparent; color: var(--rgb);
  border: 1px solid var(--rgb); border-radius: 2px; font-family: var(--display);
  font-size: 0.75rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;
  cursor: pointer; transition: all 0.2s; box-shadow: 0 0 12px var(--rgb-dim); position: relative; overflow: hidden; }
#upload-btn::before { content: ''; position: absolute; inset: 0; background: var(--rgb-dim); opacity: 0; transition: opacity 0.2s; }
#upload-btn:hover:not(:disabled)::before { opacity: 1; }
#upload-btn:hover:not(:disabled) { box-shadow: 0 0 24px var(--rgb-glow), inset 0 0 12px var(--rgb-dim); }
#upload-btn:disabled { opacity: 0.3; cursor: not-allowed; }
#progress-wrap { display: none; margin-top: 1rem; }
.prog-track { background: var(--border); height: 3px; border-radius: 2px; overflow: hidden; margin-bottom: 0.4rem; }
.prog-fill { height: 100%; width: 0%; background: linear-gradient(90deg, rgba(var(--r),var(--g),var(--b),0.6), var(--rgb));
  transition: width 0.15s; border-radius: 2px; box-shadow: 0 0 8px var(--rgb-glow); }
.prog-label { font-size: 0.68rem; color: var(--muted); display: flex; justify-content: space-between; }
#result { display: none; margin-top: 1rem; }
.result-box { background: var(--surface2); border: 1px solid rgba(var(--r),var(--g),var(--b),0.3);
  border-radius: 2px; padding: 0.75rem; box-shadow: 0 0 20px var(--rgb-dim); }
.result-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em; color: var(--muted); margin-bottom: 0.5rem; }
.result-url-row { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; }
.result-url-row input { flex: 1; color: var(--rgb); border-color: rgba(var(--r),var(--g),var(--b),0.3); font-size: 0.7rem; background: var(--bg); }
.copy-btn { background: rgba(var(--r),var(--g),var(--b),0.15); color: var(--rgb);
  border: 1px solid rgba(var(--r),var(--g),var(--b),0.4); padding: 0 0.8rem; border-radius: 2px;
  font-family: var(--mono); font-size: 0.68rem; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.copy-btn:hover { background: rgba(var(--r),var(--g),var(--b),0.3); }
.result-meta { font-size: 0.68rem; color: var(--muted); }
.result-meta span { color: var(--text); }
.explorer-toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.explorer-toolbar input[type=text] { flex: 1; min-width: 120px; background: var(--bg);
  border: 1px solid var(--border); color: var(--text); padding: 0.35rem 0.6rem;
  font-family: var(--mono); font-size: 0.75rem; border-radius: 2px; outline: none; transition: border-color 0.2s; }
.explorer-toolbar input[type=text]:focus { border-color: rgba(var(--r),var(--g),var(--b),0.5); }
.sort-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--muted);
  padding: 0.35rem 0.7rem; border-radius: 2px; font-family: var(--mono); font-size: 0.7rem;
  cursor: pointer; transition: all 0.2s; white-space: nowrap; }
.sort-btn:hover, .sort-btn.active { border-color: rgba(var(--r),var(--g),var(--b),0.5); color: var(--rgb); }
.file-table-wrap { overflow-x: auto; margin-top: 1rem; }
table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
thead th { text-align: left; padding: 0.5rem 0.75rem; color: var(--muted); font-size: 0.6rem;
  text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid var(--border);
  cursor: pointer; user-select: none; white-space: nowrap; background: var(--surface2); }
thead th:hover { color: var(--rgb); }
tbody tr { border-bottom: 1px solid rgba(15,32,48,0.8); transition: background 0.15s; animation: rowIn 0.3s ease both; }
@keyframes rowIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
tbody tr:hover { background: var(--surface2); }
tbody td { padding: 0.65rem 0.75rem; vertical-align: middle; }
.file-icon { font-size: 1.1rem; }
.file-name-cell { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.file-name-text { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.file-token { color: var(--muted); font-size: 0.6rem; letter-spacing: 0.05em; }
.badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 2px; font-size: 0.6rem;
  text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
.badge-ext { background: rgba(var(--r),var(--g),var(--b),0.1); color: var(--rgb); border: 1px solid rgba(var(--r),var(--g),var(--b),0.2); }
.badge-size { background: rgba(255,255,255,0.04); color: var(--muted); }
.badge-dl { background: rgba(100,220,100,0.08); color: #5ec45e; }
.ttl-bar-wrap { display: flex; align-items: center; gap: 0.5rem; min-width: 100px; }
.ttl-bar-bg { flex: 1; height: 3px; background: var(--border); border-radius: 2px; }
.ttl-bar-fill { height: 100%; border-radius: 2px;
  background: linear-gradient(90deg, rgba(var(--r),var(--g),var(--b),0.5), var(--rgb));
  box-shadow: 0 0 6px var(--rgb-glow); transition: width 1s linear; }
.ttl-text { font-size: 0.65rem; color: var(--muted); white-space: nowrap; }
.action-btns { display: flex; gap: 0.4rem; }
.act-btn { background: transparent; border: 1px solid var(--border); color: var(--muted);
  padding: 0.25rem 0.55rem; border-radius: 2px; font-family: var(--mono); font-size: 0.68rem;
  cursor: pointer; transition: all 0.15s; white-space: nowrap; text-decoration: none; display: inline-block; }
.act-btn:hover { border-color: var(--rgb); color: var(--rgb); background: var(--rgb-dim); }
.act-btn.del:hover { border-color: #e05; color: #e05; background: rgba(238,0,85,0.08); }
.empty-state { padding: 3rem; text-align: center; color: var(--muted); font-size: 0.8rem; letter-spacing: 0.05em; }
.empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.3; display: block; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;
  font-size: 0.65rem; color: var(--muted); letter-spacing: 0.08em; }
footer span { color: var(--rgb); }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(var(--r),var(--g),var(--b),0.4); }
.toast-container { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; }
.toast { background: var(--surface2); border: 1px solid rgba(var(--r),var(--g),var(--b),0.4);
  color: var(--text); padding: 0.6rem 1rem; border-radius: 3px; font-size: 0.75rem;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 20px var(--rgb-dim);
  animation: toastIn 0.3s ease both; max-width: 300px; }
@keyframes toastIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.toast.bye { animation: toastOut 0.3s ease both; }
@keyframes toastOut { to { opacity: 0; transform: translateY(10px); } }
@media (max-width: 600px) { .app { padding: 1rem; } .stats-bar { gap: 0.75rem; } .stat { padding: 0.5rem 0.8rem; } table { font-size: 0.7rem; } .file-name-text { max-width: 140px; } }
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="scanline"></div>
<div class="corner corner-tl"></div><div class="corner corner-tr"></div>
<div class="corner corner-bl"></div><div class="corner corner-br"></div>
<div class="app">
  <header>
    <div class="logo">${cfg.serverName}</div>
    <div class="header-right">
      <div class="server-ip"><span class="status-dot"></span>LIVE &nbsp;·&nbsp; PORT <span id="hdr-port">...</span></div>
      <div class="server-ip" id="hdr-ips">Detecting interfaces...</div>
    </div>
  </header>
  <div class="stats-bar">
    <div class="stat"><div class="stat-label">Files Active</div><div class="stat-value" id="stat-count">0</div></div>
    <div class="stat"><div class="stat-label">Total Size</div><div class="stat-value" id="stat-size">0 B</div></div>
    <div class="stat"><div class="stat-label">Downloads</div><div class="stat-value" id="stat-dl">0</div></div>
    <div class="stat"><div class="stat-label">Max File</div><div class="stat-value">${cfg.maxFileSizeMB} MB</div></div>
  </div>
  <div class="main-grid">
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Upload</span><span style="font-size:0.65rem;color:var(--muted)">All formats accepted</span></div>
      <div class="panel-body">
        <div id="drop-zone" onclick="document.getElementById('file-input').click()">
          <span class="dz-icon">⬆</span>
          <div class="dz-text"><strong>Click to browse</strong> or drag &amp; drop</div>
          <div class="dz-sub">Any file type · up to ${cfg.maxFileSizeMB} MB</div>
          <div id="file-chosen"></div>
        </div>
        <input type="file" id="file-input">
        <div class="form-row">
          <label>Expires in</label>
          <select id="ttl">
            <option value="300">5 min</option><option value="900">15 min</option>
            <option value="3600" selected>1 hour</option><option value="10800">3 hours</option>
            <option value="21600">6 hours</option><option value="43200">12 hours</option>
            <option value="86400">24 hours</option>
          </select>
        </div>
        <button id="upload-btn" disabled onclick="uploadFile()">⬆ &nbsp;Upload File</button>
        <div id="progress-wrap">
          <div class="prog-track"><div class="prog-fill" id="prog-fill"></div></div>
          <div class="prog-label"><span id="prog-pct">0%</span><span id="prog-speed"></span></div>
        </div>
        <div id="result">
          <div class="result-box">
            <div class="result-label">Share Link</div>
            <div class="result-url-row">
              <input type="text" id="share-url" readonly>
              <button class="copy-btn" onclick="copyUrl()">Copy</button>
            </div>
            <div class="result-meta" id="result-meta"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header"><span class="panel-title">File Explorer</span><span class="status-dot" style="margin-left:4px"></span></div>
      <div class="panel-body">
        <div class="explorer-toolbar">
          <input type="text" id="search-input" placeholder="Search files..." oninput="renderTable()">
          <button class="sort-btn active" id="sort-time" onclick="setSort('time')">Time ↓</button>
          <button class="sort-btn" id="sort-name" onclick="setSort('name')">Name</button>
          <button class="sort-btn" id="sort-size" onclick="setSort('size')">Size</button>
        </div>
        <div class="file-table-wrap">
          <table id="file-table">
            <thead><tr>
              <th style="width:36px"></th><th>Filename</th><th>Ext</th>
              <th>Size</th><th>Downloads</th><th>Expires</th><th>Actions</th>
            </tr></thead>
            <tbody id="file-tbody">
              <tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📂</span>No files yet. Upload one!</div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  <footer>
    <span>DROP ZONE &nbsp;·&nbsp; Guardian v2 &nbsp;·&nbsp; <span id="ft-time"></span></span>
    <span><span id="ft-uptime"></span></span>
  </footer>
</div>
<div class="toast-container" id="toasts"></div>
<script>
let hue = 0;
function cycleRGB() {
  hue = (hue + 0.4) % 360;
  const r = Math.round(127 + 127 * Math.sin((hue * Math.PI / 180)));
  const g = Math.round(127 + 127 * Math.sin((hue * Math.PI / 180) + 2.094));
  const b = Math.round(127 + 127 * Math.sin((hue * Math.PI / 180) + 4.189));
  document.documentElement.style.setProperty('--r', r);
  document.documentElement.style.setProperty('--g', g);
  document.documentElement.style.setProperty('--b', b);
}
setInterval(cycleRGB, 30);
function toast(msg, dur = 3000) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('bye'); setTimeout(() => el.remove(), 300); }, dur);
}
function fmtSize(b) {
  if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b/1048576).toFixed(1) + ' MB'; return (b/1073741824).toFixed(2) + ' GB';
}
function fmtCountdown(expiresAt) {
  const diff = Math.max(0, expiresAt - Date.now());
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return h + 'h ' + m + 'm'; if (m > 0) return m + 'm ' + s + 's'; return s + 's';
}
function extIcon(ext) {
  const map = { pdf:'📄', png:'🖼', jpg:'🖼', jpeg:'🖼', gif:'🖼', svg:'🖼', webp:'🖼',
    mp4:'🎬', mov:'🎬', avi:'🎬', mkv:'🎬', webm:'🎬', mp3:'🎵', wav:'🎵', flac:'🎵', ogg:'🎵',
    zip:'🗜', tar:'🗜', gz:'🗜', rar:'🗜', '7z':'🗜',
    js:'💻', ts:'💻', py:'💻', rb:'💻', go:'💻', rs:'💻', c:'💻', cpp:'💻', java:'💻',
    html:'🌐', css:'🎨', json:'📋', xml:'📋', csv:'📊', xlsx:'📊', xls:'📊',
    doc:'📝', docx:'📝', txt:'📝', md:'📝', exe:'⚙', dmg:'⚙', pkg:'⚙', deb:'⚙', apk:'📱' };
  return map[ext.toLowerCase()] || '📁';
}
function getExt(filename) { return filename.includes('.') ? filename.split('.').pop() : ''; }
let files = [], sortKey = 'time', serverInfo = {};
async function loadInfo() {
  const r = await fetch('/api/info'); serverInfo = await r.json();
  document.getElementById('hdr-port').textContent = serverInfo.port;
  document.getElementById('hdr-ips').textContent = serverInfo.ips.map(i => i.address).join('  ·  ') || 'localhost';
}
async function loadFiles() {
  const r = await fetch('/api/files'); files = await r.json(); renderTable(); updateStats();
}
function updateStats() {
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const totalDl = files.reduce((s, f) => s + f.downloads, 0);
  document.getElementById('stat-count').textContent = files.length;
  document.getElementById('stat-size').textContent = fmtSize(totalSize);
  document.getElementById('stat-dl').textContent = totalDl;
}
function setSort(key) {
  sortKey = key;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sort-' + key).classList.add('active'); renderTable();
}
function renderTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  let list = files.filter(f => f.filename.toLowerCase().includes(q));
  if (sortKey === 'time') list.sort((a, b) => a.expiresAt - b.expiresAt);
  if (sortKey === 'name') list.sort((a, b) => a.filename.localeCompare(b.filename));
  if (sortKey === 'size') list.sort((a, b) => b.size - a.size);
  const tbody = document.getElementById('file-tbody');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📂</span>' +
      (q ? 'No files match "' + q + '"' : 'No files yet. Upload one!') + '</div></td></tr>'; return;
  }
  tbody.innerHTML = list.map((f, i) => {
    const ext = getExt(f.filename), icon = extIcon(ext);
    const pct = Math.max(0, Math.min(100, ((f.expiresAt - Date.now()) / (f.ttl * 1000)) * 100)).toFixed(1);
    const dlUrl = '/d/' + f.token;
    return \`<tr style="animation-delay:\${i * 40}ms">
      <td class="file-icon">\${icon}</td>
      <td><div class="file-name-cell"><span class="file-name-text" title="\${f.filename}">\${f.filename}</span><span class="file-token">\${f.token}</span></div></td>
      <td><span class="badge badge-ext">\${ext || '—'}</span></td>
      <td><span class="badge badge-size">\${fmtSize(f.size)}</span></td>
      <td><span class="badge badge-dl">\${f.downloads}</span></td>
      <td><div class="ttl-bar-wrap"><div class="ttl-bar-bg"><div class="ttl-bar-fill" style="width:\${pct}%"></div></div>
        <span class="ttl-text" id="ttl-\${f.token}">\${fmtCountdown(f.expiresAt)}</span></div></td>
      <td><div class="action-btns">
        <button class="act-btn" onclick="copyLink('\${dlUrl}')">Copy</button>
        <a class="act-btn" href="\${dlUrl}" target="_blank" download>↓ DL</a>
        <button class="act-btn del" onclick="deleteFile('\${f.token}')">✕</button>
      </div></td>
    </tr>\`;
  }).join('');
}
setInterval(() => {
  files.forEach(f => {
    const el = document.getElementById('ttl-' + f.token);
    if (el) el.textContent = fmtCountdown(f.expiresAt);
    const pct = Math.max(0, Math.min(100, ((f.expiresAt - Date.now()) / (f.ttl * 1000)) * 100));
    const row = el && el.closest('tr');
    if (row) { const bar = row.querySelector('.ttl-bar-fill'); if (bar) bar.style.width = pct.toFixed(1) + '%'; }
  });
}, 1000);
async function deleteFile(token) {
  const r = await fetch('/api/files/' + token, { method: 'DELETE' });
  if (r.ok) { toast('File deleted'); loadFiles(); } else toast('Delete failed');
}
function copyLink(path) {
  navigator.clipboard.writeText(location.origin + path).then(() => toast('Link copied!')).catch(() => toast('Copy failed'));
}
function copyUrl() {
  const input = document.getElementById('share-url'); input.select();
  navigator.clipboard.writeText(input.value).then(() => { toast('Link copied!'); }).catch(() => { document.execCommand('copy'); toast('Copied!'); });
  const btn = document.querySelector('.copy-btn'); btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = 'Copy', 1800);
}
const dz = document.getElementById('drop-zone'), fi = document.getElementById('file-input');
let selectedFile = null;
function selectFile(file) {
  selectedFile = file;
  document.getElementById('file-chosen').textContent = file.name + ' (' + fmtSize(file.size) + ')';
  document.getElementById('upload-btn').disabled = false;
}
fi.addEventListener('change', () => fi.files[0] && selectFile(fi.files[0]));
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('dragover'); });
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]); });
function uploadFile() {
  if (!selectedFile) return;
  const ttl = document.getElementById('ttl').value, btn = document.getElementById('upload-btn');
  btn.disabled = true;
  const fd = new FormData(); fd.append('file', selectedFile); fd.append('ttl', ttl);
  document.getElementById('progress-wrap').style.display = 'block';
  document.getElementById('result').style.display = 'none';
  const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/upload');
  let startTime = Date.now(), lastLoaded = 0;
  xhr.upload.addEventListener('progress', e => {
    if (!e.lengthComputable) return;
    const pct = Math.round(e.loaded / e.total * 100);
    document.getElementById('prog-fill').style.width = pct + '%';
    document.getElementById('prog-pct').textContent = pct + '%';
    const elapsed = (Date.now() - startTime) / 1000, speed = elapsed > 0 ? (e.loaded - lastLoaded) / elapsed : 0;
    lastLoaded = e.loaded;
    if (speed > 0) document.getElementById('prog-speed').textContent = fmtSize(speed) + '/s';
  });
  xhr.onload = () => {
    btn.disabled = false;
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText), url = location.origin + '/d/' + data.token;
      document.getElementById('share-url').value = url;
      document.getElementById('result-meta').innerHTML = '<span>' + fmtSize(data.size) + '</span> &nbsp;·&nbsp; expires in <span>' + fmtCountdown(data.expiresAt) + '</span>';
      document.getElementById('result').style.display = 'block';
      toast('✓ Uploaded! Link ready.'); loadFiles();
    } else toast('Upload failed: ' + xhr.responseText);
  };
  xhr.onerror = () => { btn.disabled = false; toast('Network error during upload.'); };
  xhr.send(fd);
}
const startTs = Date.now();
function updateFooter() {
  document.getElementById('ft-time').textContent = new Date().toLocaleTimeString();
  const up = Math.floor((Date.now() - startTs) / 1000);
  const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60), s = up % 60;
  document.getElementById('ft-uptime').textContent = 'Uptime: ' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
setInterval(updateFooter, 1000);
loadInfo(); loadFiles(); setInterval(loadFiles, 8000);
</script>
</body>
</html>`;
}

function startDropzone() {
  if (!express || !multer) {
    console.warn('[dropzone] Skipping — express or multer not installed.');
    console.warn('[dropzone] Run: npm install express multer');
    return null;
  }

  const cfg = {
    port:         DROPZONE_PORT,
    host:         '0.0.0.0',
    uploadDir:    process.env.DROPZONE_UPLOAD_DIR || path.join(__dirname, 'dropzone_files'),
    maxFileSizeMB: parseInt(process.env.DROPZONE_MAX_MB || '500'),
    defaultTTL:   3600,
    maxTTL:       86400,
    serverName:   'DROP ZONE',
  };

  const app      = express();
  const registry = new Map(); // token → entry

  const uploadDir = path.resolve(cfg.uploadDir);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => {
      const token = require('crypto').randomBytes(6).toString('hex');
      cb(null, `${token}__${sanitizeFilename(file.originalname)}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: cfg.maxFileSizeMB * 1024 * 1024 } });

  // Cleanup expired files every 30s
  setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of registry) {
      if (entry.expiresAt < now) { fs.unlink(entry.filepath, () => {}); registry.delete(token); }
    }
  }, 30_000);

  app.get('/',    (req, res) => res.send(buildDropzoneHTML(cfg)));

  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file.');
    const ttl       = Math.min(Math.max(parseInt(req.body.ttl) || cfg.defaultTTL, 60), cfg.maxTTL);
    const token     = path.basename(req.file.filename).split('__')[0];
    const expiresAt = Date.now() + ttl * 1000;
    registry.set(token, { filename: req.file.originalname, filepath: req.file.path, expiresAt, size: req.file.size, downloads: 0, ttl });
    console.log(`[dropzone] upload: ${req.file.originalname} (${fmtSize(req.file.size)}) token:${token}`);
    res.json({ token, size: req.file.size, expiresAt });
  });

  app.get('/d/:token', (req, res) => {
    const entry = registry.get(req.params.token);
    if (!entry)                    return res.status(404).send('Not found or expired.');
    if (Date.now() > entry.expiresAt) return res.status(410).send('Expired.');
    entry.downloads++;
    res.download(entry.filepath, entry.filename);
  });

  app.get('/api/files', (req, res) => {
    const now = Date.now(), list = [];
    for (const [token, f] of registry) {
      if (f.expiresAt > now) list.push({ token, filename: f.filename, size: f.size, expiresAt: f.expiresAt, downloads: f.downloads, ttl: f.ttl });
    }
    res.json(list.sort((a, b) => a.expiresAt - b.expiresAt));
  });

  app.delete('/api/files/:token', (req, res) => {
    const entry = registry.get(req.params.token);
    if (!entry) return res.status(404).send('Not found.');
    fs.unlink(entry.filepath, () => {}); registry.delete(req.params.token);
    res.json({ ok: true });
  });

  app.get('/api/info', (req, res) => {
    res.json({ port: cfg.port, ips: getLocalIPs(), serverName: cfg.serverName });
  });

  const dzServer = app.listen(cfg.port, cfg.host, () => {
    const ips = getLocalIPs();
    console.log(`[dropzone] UI on http://127.0.0.1:${cfg.port}`);
    ips.forEach(ip => console.log(`[dropzone] LAN: http://${ip.address}:${cfg.port}  (${ip.name})`));
    console.log(`[dropzone] Upload dir: ${uploadDir}`);
  });

  dzServer.on('error', err => console.error(`[dropzone] ERROR: ${err.message}`));

  // ── Internal auto-upload: write directly into registry, no HTTP round-trip ──
  function autoUpload(filename, content, ttl = 3600) {
    try {
      const buf      = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
      const token    = require('crypto').randomBytes(6).toString('hex');
      const safe     = sanitizeFilename(filename);
      const filepath = path.join(uploadDir, `${token}__${safe}`);
      fs.writeFileSync(filepath, buf);
      const expiresAt = Date.now() + ttl * 1000;
      registry.set(token, { filename: safe, filepath, expiresAt, size: buf.length, downloads: 0, ttl });
      const url = `http://127.0.0.1:${cfg.port}/d/${token}`;
      console.log(`[dropzone] auto-upload: ${safe}  (${fmtSize(buf.length)})  → ${url}`);
      return { token, url, filename: safe, size: buf.length };
    } catch (err) {
      console.error(`[dropzone] autoUpload failed: ${err.message}`);
      return null;
    }
  }

  return { server: dzServer, autoUpload };
}


const dropzone = startDropzone();
const dropzoneServer = dropzone ? dropzone.server : null;

// ══════════════════════════════════════════════════════════════════════════════
//  SISO EVENT BUS  (inline — no import needed)
// ══════════════════════════════════════════════════════════════════════════════

class SISOGate {
  constructor(sig, fn) { this.signature = sig; this._fn = fn; }
  transform(event, stream) { try { this._fn(event.data, stream); } catch(e) { console.error(`[siso] ${this.signature}: ${e.message}`); } }
}
let _streamSeq = 0;
class SISOStream {
  constructor() { this.gates = new Map(); this.log = []; this.logLevel = 'EVENTS'; }
  register(gate) {
    if (this.gates.has(gate.signature)) throw new Error(`SISO: collision '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
  }
  emit(type, data = {}) {
    const gate = this.gates.get(type);
    if (this.logLevel !== 'OFF') {
      const entry = { seq: _streamSeq++, ts: Date.now(), type, claimed: gate ? gate.signature : null };
      if (this.logLevel === 'DATA') entry.data = data;
      this.log.push(entry);
      if (this.log.length > 2000) this.log.shift();
    }
    if (gate) gate.transform({ type, data }, this);
    cockpitBroadcast({ seq: _streamSeq - 1, type, ts: Date.now() });
  }
}
const bus = new SISOStream();

// ══════════════════════════════════════════════════════════════════════════════
//  SQLITE / JAA PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
//  JAA STORE — Pure-JS relational store, zero native deps
//  Persists to memory_store/*.json (same dir as memory server)
//  Memory server and main API share the same store — ONE source of truth
// ══════════════════════════════════════════════════════════════════════════════

const STORE_DIR = process.env.MEMORY_STORE_DIR || path.join(__dirname, 'memory_store');
const jaa = new JaaStore(STORE_DIR);

// Shutdown hook — flush all dirty tables before exit
process.on('exit', () => jaa.flushAll());
process.on('SIGINT', () => { jaa.close(); process.exit(0); });
process.on('SIGTERM', () => { jaa.close(); process.exit(0); });

// ── Compatibility shims (same call shape as before, now pure-JS) ──────────────

function dbRun(sql, params = []) {
  // This is a no-op shim — all persistence goes through gate handlers directly.
  // Legacy callers that still use SQL strings are silently ignored; gates handle writes.
  return { changes: 0, lastInsertRowid: null };
}
function dbGet(sql, params = []) { return null; }  // shim — gates handle reads via jaa.*
function dbAll(sql, params = []) { return []; }      // shim — routes use jaa.all() directly
function getSetting(key, fallback = null) { return jaa.getSetting(key, fallback); }
function setSetting(key, value) { jaa.setSetting(key, value); bus.emit('guardian.setting.update', { key, value }); }
function getAllSettings() { return jaa.getAllSettings(); }

// ══════════════════════════════════════════════════════════════════════════════
//  GAPHUNTER v3 — INLINE TAXONOMY DETECTION
// ══════════════════════════════════════════════════════════════════════════════

const GAP_TYPE = { LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal', OBLIGATION:'obligation', ASSUMPTION:'assumption', CONTRADICTION:'contradiction' };
const GAP_REASON = { COMPRESSION:'compression', AVOIDANCE:'avoidance', ATTENTION:'attention', STRUCTURAL_LIMIT:'structural_limit', DEFERRED_VARIABLE:'deferred_variable', IDENTITY_REFLECTION:'identity_reflection' };
const DOMAIN = { CODE:'code', AI_ML:'ai_ml', COMMUNICATION:'communication', EPISTEMOLOGICAL:'epistemological', LOGIC:'logic' };

function gaphunterAnalyze(text, opts = {}) {
  const gaps = []; if (!text || text.length < 50) return gaps;
  const lines = text.split('\n'), words = text.toLowerCase().match(/\b\w+\b/g)||[], wc = words.length;
  const bd = lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length / Math.max(1,lines.length);
  const ld = wc > 5 ? (new Set(words).size / wc) : 1;
  const freq = {}; for (const ch of text) freq[ch]=(freq[ch]||0)+1;
  let H=0; for (const f of Object.values(freq)) { const p=f/text.length; H -= p*Math.log2(p); }
  H = parseFloat(H.toFixed(3));
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often)\b/gi)||[]).length;
  const hedgeRate = wc > 0 ? hedges/wc : 0;
  const min = opts.minScore ?? 0.25;
  const lastLine = lines[lines.length-1]?.trim()||'';

  if (bd > 0.5 && Math.min(0.95,bd) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.COMPRESSION, description:`High bullet density (${(bd*100).toFixed(0)}%) — reasoning compressed, load-bearing assumptions hidden`, score:Math.min(0.95,bd), evidence:{metric:bd,pattern:'bullet_density'} });
  if (ld < 0.35 && Math.min(0.9,1-ld) >= min) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:`Low lexical diversity (${ld}) — formulaic or repetitive phrasing`, score:Math.min(0.9,1-ld), evidence:{metric:ld,pattern:'lexical_diversity'} });
  if (H < 3.2 && wc > 80) { const sc=parseFloat(((4-H)/4).toFixed(3)); if (sc>=min) gaps.push({ type:GAP_TYPE.TEMPORAL, domain:DOMAIN.AI_ML, reason:GAP_REASON.COMPRESSION, description:`Low entropy H=${H} — pre-planned or template content`, score:sc, evidence:{metric:H,pattern:'entropy'} }); }
  if (hedgeRate > 0.04 && Math.min(0.85,hedgeRate*10) >= min) gaps.push({ type:GAP_TYPE.ASSUMPTION, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.AVOIDANCE, description:`High hedge density (${(hedgeRate*100).toFixed(1)}%) — epistemic evasion`, score:Math.min(0.85,hedgeRate*10), evidence:{metric:hedgeRate,pattern:'hedge_rate'} });
  if (wc > 200 && (lastLine.endsWith('...')||lastLine.endsWith('etc.')||lastLine.length < 12)) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.COMMUNICATION, reason:GAP_REASON.STRUCTURAL_LIMIT, description:'Possible truncation — context window pressure', score:0.75, evidence:{pattern:'truncation'} });
  const asserts = (text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi)||[]).length;
  const assertRate = wc>0?asserts/wc:0;
  if (assertRate > 0.02 && hedgeRate < 0.01 && wc > 100 && Math.min(0.8,assertRate*20) >= min) gaps.push({ type:GAP_TYPE.EVIDENTIAL, domain:DOMAIN.EPISTEMOLOGICAL, reason:GAP_REASON.IDENTITY_REFLECTION, description:'High assertion density without evidence markers', score:Math.min(0.8,assertRate*20), evidence:{metric:assertRate,pattern:'assertion_without_evidence'} });
  if ((text.includes('```')||text.includes('function ')||text.includes('const '))) {
    const todos = (text.match(/\bTODO\b|\bFIXME\b|\bHACK\b/g)||[]).length;
    if (todos > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${todos} deferred variable(s) — §1.3 violation`, score:Math.min(0.9,0.3+todos*0.15), evidence:{metric:todos,pattern:'todo_markers'} });
    const stubs = (text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim)||[]).length;
    if (stubs > 0) gaps.push({ type:GAP_TYPE.OBLIGATION, domain:DOMAIN.CODE, reason:GAP_REASON.DEFERRED_VARIABLE, description:`${stubs} stub/unimplemented — §1.3 violation`, score:0.85, evidence:{metric:stubs,pattern:'stubs'} });
  }
  return gaps;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT SSE
// ══════════════════════════════════════════════════════════════════════════════

const cockpitClients = new Set();
function cockpitBroadcast(data) {
  if (!cockpitClients.size) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const r of cockpitClients) { try { r.write(msg); } catch(_) { cockpitClients.delete(r); } }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SISO GATE REGISTRATIONS
// ══════════════════════════════════════════════════════════════════════════════

bus.register(new SISOGate('guardian.artifact', (data) => {
  const ts   = Date.now();
  const hash = data.hash || '';
  const existing = jaa.get('artifacts', { hash });

  // Auto-tag: full taxonomy on every artifact
  const autoTags = tagEngine.autoTag({
    content:  data.content || '',
    lang:     data.lang,
    name:     data.name,
    context:  data.context,
    account:  data.account,
    provider: data.provider,
  });
  const tagsJson = JSON.stringify(autoTags);

  if (existing) {
    // Merge tags (keep existing custom tags, update auto-tags)
    let existingTags = [];
    try { existingTags = JSON.parse(existing.tags||'[]'); } catch(_){}
    const customTags = existingTags.filter(t => t.startsWith('custom:') || t.startsWith('project:'));
    const merged = [...new Set([...autoTags, ...customTags])];
    jaa.update('artifacts', { hash }, { seen_count: (existing.seen_count||1)+1, last_seen: ts, tags: JSON.stringify(merged) });
  } else {
    jaa.insert('artifacts', {
      id: randomUUID(), hash, name: data.name||'artifact', type: data.type||'code_block',
      lang: data.lang||null, content: (data.content||'').slice(0,8000),
      context: (data.context||'').slice(0,400), chat_url: data.chatUrl||'',
      chat_id: data.chatId||'', account: data.account||'', job_id: data.jobId||null,
      session_id: data.sessionId||null, direction: data.direction||'output',
      provider: data.provider||'claude', ts, last_seen: ts, seen_count: 1, tags: tagsJson,
    });

    // Emit gaps for unmapped/unclassified artifacts (soft warnings)
    const unmappedGaps = tagEngine.gapsForUnmapped({ content: data.content||'', name: data.name, lang: data.lang }, autoTags);
    if (unmappedGaps.length > 0) {
      bus.emit('guardian.gaps', { gaps: unmappedGaps, jobId: data.jobId, chatId: data.chatId, account: data.account, provider: data.provider });
    }
  }

  // Auto-upload to dropzone — content as file + zip detection
  const autoUp = getSetting('dropzone_auto_upload','true')==='true';
  if (autoUp && dropzone?.autoUpload && data.content && data.name) {
    const ext = {typescript:'ts',javascript:'js',python:'py',html:'html',css:'css',json:'json',bash:'sh',rust:'rs',go:'go'}[data.lang]||'txt';
    const safeName = (data.name).replace(/[^\w.-]/g,'_');
    dropzone.autoUpload(`${safeName}.${ext}`, data.content);
  }
}));

bus.register(new SISOGate('guardian.gaps', (data) => {
  const ts = Date.now();
  for (const gap of (data.gaps||[])) {
    jaa.insert('gaps', {
      id: randomUUID(), type: gap.type||'assumption', domain: gap.domain||null,
      reason: gap.reason||null, description: gap.description||'', score: gap.score||0.5,
      status: 'open', job_id: data.jobId||null, chat_id: data.chatId||null,
      session_id: data.sessionId||null, account: data.account||null,
      provider: data.provider||null, evidence: JSON.stringify(gap.evidence||{}),
      opened_ts: ts,
    });
  }
}));

bus.register(new SISOGate('guardian.job.complete', (data) => {
  const ts = Date.now();
  const jobId = data.jobId || randomUUID();
  const existing = jaa.get('jobs', { id: jobId });
  if (existing) {
    jaa.update('jobs', { id: jobId }, { status:'complete', response:(data.text||'').slice(0,5000), chars:(data.text||'').length, completed_ts:ts });
  } else {
    jaa.insert('jobs', {
      id: jobId, provider: data.provider||'claude', command: data.command||'',
      prompt: (data.prompt||'').slice(0,500), response: (data.text||'').slice(0,5000),
      status: 'complete', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
      account: data.account||'', session_id: null, chars: (data.text||'').length,
      source: 'guardian-ws', started_ts: data.startedTs||ts, completed_ts: ts,
    });
  }
}));

bus.register(new SISOGate('guardian.pa.session', (data) => {
  const ent = Array.isArray(data.entropy) ? (data.entropy.reduce((a,b)=>a+b,0)/Math.max(1,data.entropy.length)) : (data.entropy||0);
  jaa.insert('pa_sessions', {
    id: randomUUID(), job_id: data.jobId||null, chat_id: data.chatId||null,
    session_id: data.sessionId||null, account: data.account||null, provider: data.provider||null,
    total_tokens: data.tokens||0, tps_avg: parseFloat(data.tps)||0, pause_count: data.pauses||0,
    entropy_avg: parseFloat(ent)||0, burst_count: 0,
    hypotheses: JSON.stringify(data.hypotheses||[]), structure_events: '[]', ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.ledger', (data) => {
  jaa.insert('ledger_entries', {
    id: randomUUID(), ledger_type: data.ledgerType||'event', category: data.category||'EVENT',
    msg: data.msg||'', chat_url: data.chatUrl||'', chat_id: data.chatId||'',
    account: data.account||'', provider: data.provider||null, job_id: data.jobId||null,
    session_id: data.sessionId||null, source: data.source||'guardian',
    meta: JSON.stringify(data.meta||{}), ts: Date.now(),
  });
  // Mirror to memory server so its dashboard stays current
  memoryServer?.ingest({ type:'LEDGER', payload:{ category:data.category||'EVENT', msg:data.msg||'', meta:data.meta||{} }, source:'siso-gate', chatUrl:data.chatUrl, account:data.account });
}));

bus.register(new SISOGate('guardian.download', (data) => {
  jaa.insert('downloads', {
    id: randomUUID(), filename: data.filename||'download', href: data.href||'',
    chat_url: data.chatUrl||'', chat_id: data.chatId||'', account: data.account||'',
    job_id: data.jobId||null, session_id: data.sessionId||null,
    provider: data.provider||null, ts: Date.now(),
  });
}));

bus.register(new SISOGate('guardian.session.named', (data) => {
  const ts = Date.now();
  const existing = jaa.get('sessions', { chat_id: data.chatId||'' });
  if (existing) {
    jaa.update('sessions', { chat_id: data.chatId||'' }, { name: data.name, updated_ts: ts });
  } else {
    jaa.insert('sessions', {
      id: randomUUID(), chat_id: data.chatId||'', chat_url: data.chatUrl||'',
      provider: data.provider||'claude', account: data.account||'', name: data.name||'',
      token_total: 0, started_ts: ts, updated_ts: ts,
    });
  }
  const ws = PROVIDERS[data.provider||'claude'];
  if (ws && ws.readyState === WebSocket.OPEN) send(ws, { type:'GUARDIAN_SESSION_NAMED', ...data });
}));

bus.register(new SISOGate('guardian.timeline', (data) => {
  jaa.insert('timeline_events', {
    id: randomUUID(), channel: data.channel||'unknown', person_id: data.personId||null,
    pair_id: null, chat_id: data.chatId||null, session_id: data.sessionId||null,
    payload: JSON.stringify(data.payload||{}), ts: data.ts||Date.now(),
  });
}));

bus.register(new SISOGate('guardian.setting.update', (data) => {
  // Already persisted by setSetting() — just broadcast
  cockpitBroadcast({ type:'setting.updated', key:data.key, value:data.value, ts:Date.now() });
}));

// ══════════════════════════════════════════════════════════════════════════════
//  EXTENDED HTTP ROUTES
// ══════════════════════════════════════════════════════════════════════════════

function pRes(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }); res.end(JSON.stringify(data)); }
function bodyJ(req) { return new Promise((resolve,reject) => { let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{resolve(JSON.parse(b))}catch(e){reject(e)} }); req.on('error',reject); }); }

function handleExtendedRoutes(req, res, url, method) {
  const parts = url.pathname.split('/').filter(Boolean);

  // Cockpit
  if (method==='GET' && (url.pathname==='/'||url.pathname==='/cockpit'||url.pathname==='/cockpit/')) {
    res.writeHead(200,{'Content-Type':'text/html','Access-Control-Allow-Origin':'*'}); res.end(buildCockpitHTML()); return true;
  }

  // SSE events
  if (method==='GET' && url.pathname==='/events') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});
    res.write(`data: ${JSON.stringify({type:'connected',ts:Date.now()})}\n\n`);
    cockpitClients.add(res); req.on('close',()=>cockpitClients.delete(res)); return true;
  }

  // ── Settings ──────────────────────────────────────────────────────────────────
  if (parts[0]==='settings') {
    if (method==='GET' && parts.length===1) { pRes(res,200,{ok:true,settings:getAllSettings()}); return true; }
    if (method==='GET' && parts[1]) {
      const v = getSetting(parts[1]); if(v===null){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,key:parts[1],value:v}); return true;
    }
    if (method==='PUT' && parts[1]) {
      bodyJ(req).then(b=>{setSetting(parts[1],b.value??'');pRes(res,200,{ok:true,key:parts[1],value:b.value});}).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='POST' && parts[1]==='reset') {
      // Re-bootstrap defaults
      const { JaaStore: JS2 } = require('./jaa-store.js');
      const defaults = JS2.prototype?._bootstrapSettings?.call?.(jaa) || null;
      // Force re-insert all defaults
      for (const [k,v] of Object.entries({session_greeting_enabled:'true',session_greeting_text:'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',scan_debounce_ms:'1500',artifact_max:'500',gap_min_score:'0.25',pa_enabled:'true',memory_auto_push:'true',dropzone_auto_upload:'true',stream_log_level:'EVENTS',greeting_delay_ms:'1200',poll_interval_ms:'500',stable_count_threshold:'5'})) {
        setSetting(k, v);
      }
      pRes(res,200,{ok:true,settings:getAllSettings()}); return true;
    }
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────────
  if (parts[0]==='artifacts') {
    if (method==='GET' && !parts[1]) {
      const limit   = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const lang    = url.searchParams.get('lang');
      const chatId  = url.searchParams.get('chatId');
      const account = url.searchParams.get('account');
      const after   = parseInt(url.searchParams.get('after')||'0');
      const q       = url.searchParams.get('q');
      const where = {};
      if (lang)    where.lang     = lang;
      if (chatId)  where.chat_id  = chatId;
      if (account) where.account  = account;
      let rows = jaa.all('artifacts', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r => r.ts > after);
      if (q) { const ql=q.toLowerCase(); rows = rows.filter(r=>(r.name||'').toLowerCase().includes(ql)||(r.content||'').toLowerCase().includes(ql)||(r.lang||'').toLowerCase().includes(ql)); }
      pRes(res,200,{ok:true,count:rows.length,artifacts:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,artifact:r}); return true;
    }
    if (method==='DELETE' && parts[1]) {
      const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
      if (r) jaa.delete('artifacts',{id:r.id});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='PUT' && parts[1] && parts[2]==='tags') {
      bodyJ(req).then(b=>{
        const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
        if (r) jaa.update('artifacts',{id:r.id},{tags:JSON.stringify(b.tags||[])});
        pRes(res,200,{ok:true,tags:b.tags});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  // ── Gaps ──────────────────────────────────────────────────────────────────────
  if (parts[0]==='gaps') {
    if (method==='GET' && parts[1]==='summary') {
      const rows = jaa.all('gaps').filter(g=>g.status!=='ignored');
      const bt = {};
      for (const g of rows) {
        if(!bt[g.type])bt[g.type]={count:0,totalScore:0,open:0,widening:0};
        bt[g.type].count++;bt[g.type].totalScore+=(g.score||0);
        if(g.status==='open')bt[g.type].open++;if(g.status==='widening')bt[g.type].widening++;
      }
      pRes(res,200,{ok:true,total:rows.length,byType:bt}); return true;
    }
    if (method==='GET' && parts[1]==='catalogue') {
      pRes(res,200,{ok:true,gapTypes:GAP_TYPE,domains:DOMAIN,reasons:GAP_REASON}); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where = {};
      const type   = url.searchParams.get('type');
      const domain = url.searchParams.get('domain');
      const status = url.searchParams.get('status');
      if (type)   where.type   = type;
      if (domain) where.domain = domain;
      if (status) where.status = status;
      const rows = jaa.all('gaps', where, { orderBy:'score', order:'DESC', limit });
      pRes(res,200,{ok:true,gaps:rows}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='close') {
      jaa.update('gaps',{id:parts[1]},{status:'closed',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='ignore') {
      jaa.update('gaps',{id:parts[1]},{status:'ignored',closed_ts:Date.now()});
      pRes(res,200,{ok:true}); return true;
    }
  }

  // ── Ledger ────────────────────────────────────────────────────────────────────
  if (parts[0]==='ledger') {
    if (method==='GET' && parts[1]==='metrics') {
      const all = jaa.all('ledger_entries');
      pRes(res,200,{ok:true,
        total:    all.length,
        upgrades: all.filter(e=>e.ledger_type==='upgrade').length,
        ideas:    all.filter(e=>e.ledger_type==='idea').length,
        gaps:     all.filter(e=>e.category==='GAP').length,
      }); return true;
    }
    if (method==='POST' && parts.length===1) {
      bodyJ(req).then(b=>{bus.emit('guardian.ledger',{...b,source:'api'});pRes(res,200,{ok:true});}).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
      const where  = {};
      const cat    = url.searchParams.get('category');
      const after  = parseInt(url.searchParams.get('after')||'0');
      if (cat) where.category = cat;
      let rows = jaa.all('ledger_entries', where, { orderBy:'ts', order:'DESC', limit });
      if (after) rows = rows.filter(r=>r.ts>after);
      pRes(res,200,{ok:true,count:rows.length,ledger:rows}); return true;
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────────
  if (parts[0]==='sessions') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
      const where  = {};
      const prov   = url.searchParams.get('provider');
      const acc    = url.searchParams.get('account');
      if (prov) where.provider = prov;
      if (acc)  where.account  = acc;
      pRes(res,200,{ok:true,sessions:jaa.all('sessions',where,{orderBy:'updated_ts',order:'DESC',limit})}); return true;
    }
    if (method==='GET' && parts[1] && !parts[2]) {
      const r = jaa.get('sessions',{id:parts[1]}) || jaa.get('sessions',{chat_id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      pRes(res,200,{ok:true,session:r}); return true;
    }
    if (method==='POST' && parts[1] && parts[2]==='name') {
      bodyJ(req).then(b=>{
        bus.emit('guardian.session.named',{chatId:parts[1],name:b.name,...b});
        pRes(res,200,{ok:true,name:b.name});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
    if (method==='GET' && parts[1] && parts[2]==='timeline') {
      const events = jaa.all('timeline_events').filter(e=>e.session_id===parts[1]||e.chat_id===parts[1]).sort((a,b)=>a.ts-b.ts).slice(0,500);
      pRes(res,200,{ok:true,events}); return true;
    }
  }

  // ── PA sessions ───────────────────────────────────────────────────────────────
  if (parts[0]==='pa') {
    if (method==='GET' && !parts[1]) {
      const limit  = Math.min(parseInt(url.searchParams.get('limit')||'20'),100);
      const where  = {};
      const chatId = url.searchParams.get('chatId');
      if (chatId) where.chat_id = chatId;
      const rows   = jaa.all('pa_sessions', where, {orderBy:'ts',order:'DESC',limit}).map(r=>{
        try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
        return r;
      });
      pRes(res,200,{ok:true,sessions:rows}); return true;
    }
    if (method==='GET' && parts[1]) {
      const r = jaa.get('pa_sessions',{id:parts[1]});
      if(!r){pRes(res,404,{ok:false,error:'Not found'});return true;}
      try{r.hypotheses=JSON.parse(r.hypotheses||'[]');}catch(_){r.hypotheses=[];}
      pRes(res,200,{ok:true,session:r}); return true;
    }
  }

  // ── Timeline ──────────────────────────────────────────────────────────────────
  if (parts[0]==='timeline' && method==='GET') {
    const limit    = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
    const where    = {};
    const personId = url.searchParams.get('personId');
    const channel  = url.searchParams.get('channel');
    const from     = parseInt(url.searchParams.get('from')||'0');
    if (personId) where.person_id = personId;
    if (channel)  where.channel   = channel;
    let rows = jaa.all('timeline_events', where, {orderBy:'ts',order:'DESC',limit});
    if (from) rows = rows.filter(r=>r.ts>from);
    pRes(res,200,{ok:true,events:rows}); return true;
  }

  // ── Memory (query / context / stats) ──────────────────────────────────────────
  if (parts[0]==='memory') {
    if (method==='GET' && parts[1]==='query') {
      const q = url.searchParams.get('q')||'';
      if (!q) { pRes(res,400,{ok:false,error:'Missing q'}); return true; }
      const results = jaa.search(q);
      pRes(res,200,{ok:true,query:q,results}); return true;
    }
    if (method==='GET' && parts[1]==='context') {
      const chatId = url.searchParams.get('chatId');
      const arts   = chatId ? jaa.all('artifacts',{chat_id:chatId},{orderBy:'ts',order:'DESC',limit:50}) : jaa.all('artifacts',{},{orderBy:'ts',order:'DESC',limit:50});
      const gaps   = jaa.all('gaps',{status:'open'},{orderBy:'score',order:'DESC',limit:20});
      const led    = jaa.all('ledger_entries',{},{orderBy:'ts',order:'DESC',limit:20});
      pRes(res,200,{ok:true,ts:Date.now(),artifacts:arts,gaps,ledger:led}); return true;
    }
    if (method==='GET' && parts[1]==='stats') {
      const s = jaa.stats();
      s.storeDir = STORE_DIR;
      pRes(res,200,{ok:true,stats:s}); return true;
    }
    // POST /memory/ingest — used by userscripts when they can't hit WS
    if (method==='POST' && parts[1]==='ingest') {
      bodyJ(req).then(body => {
        memoryServer?.ingest(body);
        // Also route through SISO bus
        if (body.type==='ARTIFACT' && body.payload) bus.emit('guardian.artifact', body.payload);
        if (body.type==='LEDGER' && body.payload) bus.emit('guardian.ledger', { ...body.payload, chatUrl:body.chatUrl, account:body.account, source:'memory-ingest' });
        pRes(res,200,{ok:true});
      }).catch(e=>pRes(res,400,{ok:false,error:e.message})); return true;
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────────────
  if (parts[0]==='tags') {
    // GET /tags — full taxonomy reference
    if (method==='GET' && parts.length===1) {
      pRes(res,200,{ok:true,namespaces:tagEngine.TAG_NAMESPACES,values:tagEngine.TAG_VALUES}); return true;
    }
    // GET /tags/:ns — all values for a namespace  e.g. /tags/intent
    if (method==='GET' && parts[1] && !parts[2]) {
      const vals = tagEngine.TAG_VALUES[parts[1]] || [];
      pRes(res,200,{ok:true,namespace:parts[1],values:vals}); return true;
    }
    // GET /tags/search?q=  — find artifacts by tag string
    if (method==='GET' && parts[1]==='search') {
      const q = url.searchParams.get('q')||'';
      if (!q) { pRes(res,400,{ok:false,error:'Missing q'}); return true; }
      const ql = q.toLowerCase();
      const rows = jaa.all('artifacts').filter(r => {
        try { return JSON.parse(r.tags||'[]').some(t => t.toLowerCase().includes(ql)); }
        catch(_) { return false; }
      }).slice(0,100).map(r=>({...r,content:(r.content||'').slice(0,200)}));
      pRes(res,200,{ok:true,query:q,count:rows.length,artifacts:rows}); return true;
    }
  }

  // ── Guardian → Nexus Cobalt heartbeat relay ──────────────────────────────────
  // Guardian v8 receives heartbeats from userscripts and forwards to Nexus at :3748
  // so Pulse can build guardian_nodes. Also writes to event_log on Nexus.
  if (parts[0]==='guardian' && parts[1]==='heartbeat' && method==='POST') {
    bodyJ(req).then(async body => {
      const instanceId = body.instanceId || 'guardian-unknown';
      const payload = {
        instanceId,
        capabilities: body.capabilities || ['claude','chatgpt','capture','inject'],
        tabCount:      body.tabCount || Object.keys(PROVIDERS).length,
        listenerCount: body.listenerCount || wss.clients.size,
        ts:            Date.now(),
      };
      // Forward to Nexus admin server (fire-and-forget)
      _nexusPost('/api/event', {
        type: 'guardian.heartbeat',
        payload,
        source: instanceId,
        ts: Date.now(),
      }).catch(() => {});
      // Also track locally
      bus.emit('guardian.ledger', { category:'HEARTBEAT', msg:`Heartbeat: ${instanceId}`, meta:payload, source:'heartbeat' });
      pRes(res, 200, { ok: true, instanceId });
    }).catch(e => pRes(res, 400, { ok:false, error:e.message }));
    return true;
  }

  // ── POST /api/complete — Nexus Cobalt dispatches agent calls here ─────────────
  // Callto-executor POSTs { service, prompt, calltoUuid, temperature, maxTokens }
  // Guardian routes to the claimed WSS tab and returns the response.
  // §4.3 — IPC token enforced when GUARDIAN_IPC_TOKEN env var is set.
  if (parts[0]==='api' && parts[1]==='complete' && method==='POST') {
    bodyJ(req).then(async body => {
      const { service = 'claude', prompt, calltoUuid, temperature, maxTokens } = body;
      // Token gate — only enforced when env var is set (local-first: no token = open)
      const expectedToken = process.env.GUARDIAN_IPC_TOKEN;
      if (expectedToken && body.ipcToken !== expectedToken) {
        pRes(res, 401, { ok:false, error:'IPC token required — set GUARDIAN_IPC_TOKEN on both sides' });
        return;
      }
      if (!prompt) { pRes(res, 400, { ok:false, error:'prompt required' }); return; }

      // Find a connected provider for this service
      const ws = PROVIDERS[service] || PROVIDERS['claude'];
      if (!ws || ws.readyState !== 1) {
        pRes(res, 503, { ok:false, error:`No connected provider for ${service}` });
        return;
      }

      // Create a job and wait for completion via a promise
      const jobId = require('crypto').randomUUID();
      const timeout = (maxTokens || 4096) > 2000 ? 120_000 : 60_000;

      const responsePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          jobs.delete(jobId);
          reject(new Error(`Guardian dispatch timeout (${timeout}ms)`));
        }, timeout);

        jobs.set(jobId, {
          id: jobId, service, prompt, calltoUuid,
          status: 'pending', ts: Date.now(),
          _calltoResolve: (text) => { clearTimeout(timer); resolve(text); },
          _calltoReject:  (err)  => { clearTimeout(timer); reject(err); },
          resolve: (text) => { clearTimeout(timer); resolve(text); },
          reject:  (err)  => { clearTimeout(timer); reject(err); },
        });
      });

      // Send to WSS tab
      send(ws, {
        type:       'GUARDIAN_JOB',
        jobId,
        service,
        prompt,
        calltoUuid: calltoUuid || null,
        temperature: temperature || 0.15,
        maxTokens:   maxTokens || 4096,
      });

      try {
        const text = await responsePromise;
        // Post completion back to Nexus so Siphon can ingest it
        _nexusPost('/api/event', {
          type: 'guardian.chat.complete',
          payload: { text, complete: true, provider: service, calltoUuid, chatId: jobId },
          source: `guardian-${service}`,
          ts: Date.now(),
        }).catch(() => {});

        pRes(res, 200, { ok:true, content: text, chatId: jobId, calltoUuid });
      } catch (err) {
        pRes(res, 503, { ok:false, error: err.message });
      }
    }).catch(e => pRes(res, 400, { ok:false, error:e.message }));
    return true;
  }

  // ── GET /api/agent-poll — Nexus polls Guardian for pending jobs ───────────────
  // This is the reverse channel: Nexus can also pull jobs by polling this endpoint.
  // Returns { jobs: [...] } of jobs in the Guardian job queue.
  if (parts[0]==='api' && parts[1]==='agent-poll' && method==='GET') {
    const status  = url.searchParams.get('status') || 'pending';
    const service = url.searchParams.get('service');
    const limit   = Math.min(parseInt(url.searchParams.get('limit')||'10'), 50);
    let pending = [...jobs.values()].filter(j => j.status === status || status === 'pending');
    if (service) pending = pending.filter(j => j.service === service);
    pRes(res, 200, { ok:true, count: pending.length, jobs: pending.slice(0, limit).map(j => ({
      id: j.id, service: j.service, calltoUuid: j.calltoUuid,
      promptLen: (j.prompt||'').length, ts: j.ts,
    })) });
    return true;
  }

  // ── POST /api/event — receive events FROM Nexus Cobalt ───────────────────────
  // Nexus uses this to dispatch GUARDIAN_EXECUTE_INTENT events to Guardian.
  if (parts[0]==='api' && parts[1]==='event' && method==='POST') {
    bodyJ(req).then(body => {
      const { type, payload, source } = body;
      if (!type) { pRes(res, 400, { ok:false, error:'type required' }); return; }

      if (type === 'GUARDIAN_EXECUTE_INTENT' && payload?.callUuid) {
        // Nexus is asking Guardian to execute a pending agent_call
        bus.emit('guardian.ledger', { category:'NEXUS_DISPATCH', msg:`EXECUTE_INTENT: ${payload.service||'claude'}`, meta:payload, source:'nexus' });
        // If we have the full prompt, dispatch immediately; otherwise just log
        if (payload.prompt) {
          const ws = PROVIDERS[payload.service||'claude'];
          if (ws && ws.readyState === 1) {
            const jobId = payload.callUuid;
            send(ws, { type:'GUARDIAN_JOB', jobId, service:payload.service||'claude', prompt:payload.prompt, calltoUuid:payload.callUuid });
          }
        }
      }

      // Route all events through SISO bus
      bus.emit(`nexus.${type.toLowerCase().replace(/[^a-z.]/g,'_')}`, payload || {});
      pRes(res, 200, { ok:true, type });
    }).catch(e => pRes(res, 400, { ok:false, error:e.message }));
    return true;
  }

  // ── Context injection bundle ───────────────────────────────────────────────────
  // GET /inject?chatId=&project=&maxArts=&includeAxioms=
  // Returns everything needed for session context injection in userscript
  if (parts[0]==='inject' && method==='GET') {
    const chatId       = url.searchParams.get('chatId');
    const project      = url.searchParams.get('project');
    const maxArts      = Math.min(parseInt(url.searchParams.get('maxArts')||'5'),20);
    const withAxioms   = url.searchParams.get('includeAxioms') !== 'false';
    const withGaps     = url.searchParams.get('includeGaps') !== 'false';

    // Get relevant artifacts — by project tag or chatId
    let arts = [];
    if (project) {
      arts = jaa.all('artifacts').filter(r => {
        try { return JSON.parse(r.tags||'[]').some(t => t === `project:${project}`); }
        catch(_) { return false; }
      }).sort((a,b)=>b.ts-a.ts).slice(0,maxArts);
    } else if (chatId) {
      arts = jaa.all('artifacts',{chat_id:chatId},{orderBy:'ts',order:'DESC',limit:maxArts});
    } else {
      arts = jaa.all('artifacts',{},{orderBy:'ts',order:'DESC',limit:maxArts});
    }

    // Active gaps
    const openGaps = withGaps ? jaa.all('gaps',{status:'open'},{orderBy:'score',order:'DESC',limit:5}) : [];

    // Session info
    const session = chatId ? jaa.get('sessions',{chat_id:chatId}) : null;

    // Build injection text — what gets prepended to the first message
    const parts2 = [];
    if (withAxioms && AXIOMS_BRIEF.length) {
      parts2.push('## Guardian Context\n\n**Active Axioms:**\n' + AXIOMS_BRIEF.map(a=>`- ${a}`).join('\n'));
    }
    if (arts.length) {
      parts2.push('\n**Recent Artifacts:**\n' + arts.map(a => {
        let tags = [];
        try { tags = JSON.parse(a.tags||'[]'); } catch(_) {}
        return `- \`${a.name}\` [${tags.filter(t=>t.startsWith('lang:')||t.startsWith('type:')||t.startsWith('intent:')).join(', ')}] — ${(a.content||'').slice(0,100).replace(/\n/g,' ')}…`;
      }).join('\n'));
    }
    if (openGaps.length) {
      parts2.push('\n**Open Gaps:**\n' + openGaps.map(g=>`- △ ${g.type}/${g.domain}: ${g.description}`).join('\n'));
    }
    if (session?.name) {
      parts2.push(`\n**Session:** ${session.name}`);
    }

    pRes(res,200,{
      ok:true, ts:Date.now(), chatId, project, session,
      artifacts: arts.map(a=>({id:a.id,hash:a.hash,name:a.name,lang:a.lang,tags:a.tags,ts:a.ts})),
      gaps: openGaps, axioms: withAxioms ? AXIOMS_BRIEF : [],
      injectionText: parts2.join('\n\n'),
    }); return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COCKPIT HTML
// ══════════════════════════════════════════════════════════════════════════════
function buildCockpitHTML() {
  const ips = getLocalIPs();
  const port = HTTP_PORT;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Cockpit v8</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#020408;--s1:#06090e;--s2:#0a0e14;--border:#0d1a26;--text:#b0cce0;--muted:#2a4050;--mono:'SF Mono','Fira Code',monospace;--acc:#00b4d8;--grn:#22c55e;--yel:#f59e0b;--red:#ef4444;--pur:#a78bfa}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);overflow:hidden}
.grid{position:fixed;inset:0;background-image:linear-gradient(rgba(0,180,216,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(0,180,216,.02) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--acc),transparent);opacity:.3;animation:scan 6s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{display:grid;grid-template-rows:48px 1fr;height:100vh;position:relative;z-index:10}
.topbar{display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid var(--border);background:var(--s1);flex-shrink:0}
.topbar-logo{font-size:.85rem;font-weight:700;letter-spacing:.2em;color:var(--acc)}
.body{display:grid;grid-template-columns:200px 1fr;height:100%;overflow:hidden}
.sidebar{border-right:1px solid var(--border);background:var(--s1);overflow-y:auto}
.nav-item{padding:8px 16px;cursor:pointer;font-size:.72rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;border-left:2px solid transparent;transition:all .15s}
.nav-item:hover{color:var(--text);background:rgba(0,180,216,.04)}
.nav-item.active{color:var(--acc);border-left-color:var(--acc);background:rgba(0,180,216,.06)}
.main{overflow:hidden;display:flex;flex-direction:column}
.panel{display:none;flex-direction:column;height:100%;overflow:hidden}
.panel.active{display:flex}
.ph{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:var(--s2)}
.pt{font-size:.7rem;text-transform:uppercase;letter-spacing:.15em;color:var(--acc);font-weight:700}
.pb{flex:1;overflow-y:auto;padding:12px 20px}
.pb::-webkit-scrollbar{width:4px}.pb::-webkit-scrollbar-thumb{background:var(--border)}
.stats{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.stat{background:var(--s1);border:1px solid var(--border);padding:7px 10px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--acc)}
.sv{color:var(--acc);font-size:1rem;font-weight:600}.sl{color:var(--muted);font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}
#stream-feed{font-size:.7rem;height:100%;overflow-y:auto;padding:2px 0}
.sr{padding:2px 0;border-bottom:1px solid rgba(13,26,38,.5);display:flex;gap:8px}
.sts{color:#1a3040;font-size:.62rem;flex-shrink:0;width:68px}.sty{font-size:.62rem;font-weight:700;flex-shrink:0;width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd{color:#1a3040;font-size:.62rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{background:none;border:1px solid var(--border);color:var(--muted);padding:2px 8px;font-size:.68rem;cursor:pointer;font-family:var(--mono);transition:all .15s}
.btn:hover{border-color:var(--acc);color:var(--acc)}
.search{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:5px 10px;font-family:var(--mono);font-size:.75rem;width:100%;margin-bottom:8px;outline:none}
.search:focus{border-color:rgba(0,180,216,.4)}
.fb{display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap}
.fb .btn.on{border-color:var(--acc);color:var(--acc);background:rgba(0,180,216,.06)}
.acard{border:1px solid var(--border);margin-bottom:5px;overflow:hidden;cursor:pointer}
.acard:hover{border-color:rgba(0,180,216,.3)}.acard.exp{border-color:var(--acc)}
.ahdr{display:flex;align-items:center;gap:7px;padding:6px 10px;background:var(--s1);font-size:.75rem}
.aname{color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.alang{color:var(--muted);font-size:.62rem}.ats{color:#1a3040;font-size:.6rem}
.abody{padding:7px 10px;border-top:1px solid var(--border);background:#030608}
.ameta{display:flex;gap:10px;font-size:.62rem;margin-bottom:5px;flex-wrap:wrap}
.aml{color:#1a3040;text-transform:uppercase;letter-spacing:.08em}
.amv{color:var(--muted)}.amv.url{color:var(--acc);cursor:pointer;text-decoration:underline}
.acont{background:#020305;border:1px solid var(--border);padding:6px 8px;font-size:.65rem;color:#2a4050;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow-y:auto;margin-top:4px;font-family:var(--mono)}
.aact{display:flex;gap:4px;margin-top:5px}
.gap-hm{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px;margin-bottom:10px}
.gcel{background:var(--s1);border:1px solid var(--border);padding:7px 10px;cursor:pointer;transition:all .15s}
.gcel:hover{border-color:var(--acc)}
.gcet{font-size:.7rem;font-weight:700;margin-bottom:2px}.gcec{font-size:.62rem;color:var(--muted)}
.gcebar{height:2px;margin-top:3px;background:var(--border);border-radius:1px;overflow:hidden}
.gcebarfill{height:100%;background:var(--acc);border-radius:1px}
.grow{padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:6px;font-size:.7rem}
.gtype{font-weight:700;flex-shrink:0;width:78px}.gdomain{color:var(--muted);flex-shrink:0;width:80px;font-size:.62rem}
.greason{color:#1a3040;flex-shrink:0;width:90px;font-size:.6rem}
.gdesc{color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gscore{flex-shrink:0;width:34px;text-align:right;font-weight:700}
.drift{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dbar{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden}
.dfill{height:100%;background:var(--acc);transition:width .5s}
.sg{display:grid;grid-template-columns:1fr 1fr;gap:6px}
@media(max-width:900px){.sg{grid-template-columns:1fr}}
.sc{background:var(--s1);border:1px solid var(--border);padding:9px 11px}
.sk{font-size:.62rem;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px}
.sl2{font-size:.74rem;color:var(--text);margin-bottom:6px;font-weight:600}
.sd2{font-size:.6rem;color:#1a3040;margin-bottom:7px}
.sc input[type=range]{width:100%;accent-color:var(--acc)}
.sc input[type=text],.sc textarea,.sc select{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;font-family:var(--mono);font-size:.7rem;width:100%;outline:none}
.sc textarea{resize:vertical;min-height:54px}
.tgl{position:relative;width:34px;height:18px;cursor:pointer}
.tgl input{opacity:0;width:0;height:0}
.tsl{position:absolute;inset:0;background:var(--border);border-radius:18px;transition:.2s}
.tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:var(--muted);border-radius:50%;transition:.2s}
.tgl input:checked+.tsl{background:var(--acc)}
.tgl input:checked+.tsl::before{transform:translateX(16px);background:#fff}
.pacard{background:var(--s1);border:1px solid var(--border);padding:9px 11px;margin-bottom:5px}
.pamets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px}
.pamet{background:var(--bg);border:1px solid var(--border);padding:4px 6px;text-align:center}
.pamv{color:var(--acc);font-size:.85rem;font-weight:600}.paml{color:var(--muted);font-size:.58rem;text-transform:uppercase}
.pahyp{background:var(--bg);border-left:2px solid var(--acc);padding:4px 7px;margin-bottom:3px}
.pahyl{color:var(--text);font-size:.7rem;margin-bottom:2px}.pahyc{color:var(--acc);font-size:.62rem}
.pabar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin:2px 0}
.pabarf{height:100%;background:var(--acc);border-radius:2px}
.pc{background:var(--s1);border:1px solid var(--border);padding:9px 12px;margin-bottom:5px;display:flex;align-items:center;gap:10px}
.ps{font-size:.66rem;flex:1}.ps.on{color:var(--grn)}.ps.off{color:var(--muted)}
.jcard{background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px}
.jhdr{display:flex;gap:7px;align-items:center;margin-bottom:3px}.jid{font-size:.62rem;color:#1a3040}
.jst{font-size:.62rem;padding:1px 5px;border-radius:3px}
.jst.pending{background:rgba(245,158,11,.1);color:var(--yel)}.jst.complete{background:rgba(34,197,94,.1);color:var(--grn)}
.jst.streaming{background:rgba(0,180,216,.1);color:var(--acc)}.jst.failed{background:rgba(239,68,68,.1);color:var(--red)}
#cli-out{background:#010305;border:1px solid var(--border);padding:9px;font-size:.7rem;color:#2a6080;height:280px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-family:var(--mono);margin-bottom:7px}
.clir{display:flex;gap:5px}
#cli-in{flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:.7rem;padding:4px 0;outline:none}
.ccmds{display:flex;flex-wrap:wrap;gap:3px;margin-top:7px}
.empty{color:var(--muted);text-align:center;padding:2.5rem;font-size:.76rem}
</style>
</head>
<body>
<div class="grid"></div><div class="scan"></div>
<div class="app">
  <div class="topbar">
    <span class="topbar-logo">GUARDIAN v8</span>
    <span style="color:var(--muted);font-size:.66rem">${ips.map(i=>i.address).join(' · ')||'localhost'} · :${port}</span>
    <div id="pstatus" style="display:flex;gap:8px;margin-left:auto"></div>
    <span id="dbst" style="font-size:.62rem;color:var(--muted)">DB…</span>
  </div>
  <div class="body">
    <div class="sidebar">
      <div class="nav-item active" data-p="stream">◈ Stream</div>
      <div class="nav-item" data-p="artifacts">◻ Artifacts</div>
      <div class="nav-item" data-p="gaps">△ Gaps</div>
      <div class="nav-item" data-p="pa">⚡ PA Sessions</div>
      <div class="nav-item" data-p="sessions">◇ Sessions</div>
      <div class="nav-item" data-p="agents">◉ Agents</div>
      <div class="nav-item" data-p="settings">⚙ Settings</div>
      <div class="nav-item" data-p="cli">$ CLI</div>
      <div style="flex:1;min-height:40px"></div>
      <div style="padding:8px 14px;font-size:.6rem;color:var(--muted);border-top:1px solid var(--border)">
        <div id="sb1">Artifacts: —</div><div id="sb2">Gaps: —</div><div id="sb3">Sessions: —</div>
      </div>
    </div>
    <div class="main">
      <div class="panel active" id="panel-stream">
        <div class="ph"><span class="pt">Live SISO Stream</span><button class="btn" style="margin-left:auto" onclick="document.getElementById('stream-feed').innerHTML=''">Clear</button><label style="display:flex;align-items:center;gap:5px;font-size:.65rem;color:var(--muted);margin-left:8px"><input type="checkbox" id="sp"> Pause</label></div>
        <div class="pb" style="padding:0"><div id="stream-feed"></div></div>
      </div>
      <div class="panel" id="panel-artifacts">
        <div class="ph"><span class="pt">Artifact Store</span><span id="artcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="stats" id="artstats"></div><input class="search" id="asrch" placeholder="Search name, lang, content, account…" oninput="loadArt()"><div class="fb" id="afilts"></div><div id="artlist"></div></div>
      </div>
      <div class="panel" id="panel-gaps">
        <div class="ph"><span class="pt">Gap Intelligence (GapHunter v3)</span><span id="gapcnt" style="margin-left:auto;font-size:.62rem;color:var(--muted)"></span></div>
        <div class="pb"><div class="drift"><span style="font-size:.66rem;color:var(--muted)">Drift</span><div class="dbar"><div class="dfill" id="drf" style="width:0%"></div></div><span id="drv" style="font-size:.7rem;font-weight:700;width:36px;text-align:right">—</span></div><div class="gap-hm" id="ghm"></div><div id="glist"></div></div>
      </div>
      <div class="panel" id="panel-pa"><div class="ph"><span class="pt">Prompt Archaeology</span></div><div class="pb"><div id="palist"></div></div></div>
      <div class="panel" id="panel-sessions"><div class="ph"><span class="pt">Sessions</span></div><div class="pb"><div id="sesslist"></div></div></div>
      <div class="panel" id="panel-agents"><div class="ph"><span class="pt">Agent Controls</span></div><div class="pb"><div style="font-size:.62rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.1em">Providers</div><div id="provlist"></div><div style="font-size:.62rem;color:var(--muted);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.1em">Jobs</div><div id="joblist"></div></div></div>
      <div class="panel" id="panel-settings"><div class="ph"><span class="pt">Settings</span><button class="btn" style="margin-left:auto;color:var(--red)" onclick="resetS()">Reset All</button></div><div class="pb"><div class="sg" id="sgrid"></div></div></div>
      <div class="panel" id="panel-cli"><div class="ph"><span class="pt">CLI Bridge</span></div><div class="pb"><div id="cli-out">[guardian] CLI ready\n</div><div class="clir"><span style="color:var(--acc);font-size:.7rem;flex-shrink:0;font-family:var(--mono)">guardian $</span><input id="cli-in" placeholder="jobs | artifacts | gaps | sessions | providers | health | stats" autocomplete="off"></div><div class="ccmds" id="ccmds"></div></div></div>
    </div>
  </div>
</div>
<script>
const BASE='';let af='all',aexp=new Set(),spsd=false,ch=[],ci=-1;
const TC={'guardian.artifact':'#a78bfa','guardian.gaps':'#f472b6','guardian.job.complete':'#34d399','guardian.pa.session':'#f59e0b','guardian.ledger':'#94a3b8','GUARDIAN_COMPLETE':'#34d399','GUARDIAN_ARTIFACT':'#a78bfa','GUARDIAN_GAPS':'#f472b6','GUARDIAN_DONE':'#22c55e','GUARDIAN_CHUNK':'#475569'};
const ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function ft(ts){return new Date(ts).toLocaleTimeString()}
document.querySelectorAll('.nav-item').forEach(n=>{n.onclick=()=>{document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));n.classList.add('active');document.getElementById('panel-'+n.dataset.p)?.classList.add('active');const p=n.dataset.p;if(p==='artifacts')loadArt();if(p==='gaps')loadGaps();if(p==='pa')loadPA();if(p==='sessions')loadSess();if(p==='agents')loadAgents();if(p==='settings')loadSettings();}});
const es=new EventSource('/events');const sf=document.getElementById('stream-feed');
es.onmessage=e=>{if(spsd)return;const d=JSON.parse(e.data);const row=document.createElement('div');row.className='sr';const col=TC[d.type]||'#2a4050';row.innerHTML='<span class="sts">'+ft(d.ts||Date.now())+'</span><span class="sty" style="color:'+col+'">'+esc(d.type||'event')+'</span><span class="sd">'+esc(JSON.stringify(d.data||{}).slice(0,100))+'</span>';sf.appendChild(row);if(sf.children.length>200)sf.firstChild.remove();sf.scrollTop=sf.scrollHeight;updateSB();};
document.getElementById('sp').onchange=e=>spsd=e.target.checked;
async function loadPS(){try{const r=await fetch('/providers').then(x=>x.json());document.getElementById('pstatus').innerHTML=Object.entries(r.providers||{}).map(([n,s])=>'<span style="display:flex;align-items:center;gap:4px;font-size:.65rem;color:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"><span style="width:5px;height:5px;border-radius:50%;background:'+(s==='connected'?'var(--grn)':'var(--muted)')+'"></span>'+n+'</span>').join('');}catch(_){}}
async function loadDB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const el=document.getElementById('dbst');el.textContent=r.stats?.dbExists?'DB ✓':'DB flat';el.style.color=r.stats?.dbExists?'var(--grn)':'var(--yel)';}catch(_){}}
async function updateSB(){try{const r=await fetch('/memory/stats').then(x=>x.json());const s=r.stats||{};document.getElementById('sb1').textContent='Artifacts: '+(s.artifacts||0);document.getElementById('sb2').textContent='Gaps: '+(s.gaps||0);document.getElementById('sb3').textContent='Sessions: '+(s.sessions||0);}catch(_){}}
async function loadArt(){const q=document.getElementById('asrch')?.value||'',lang=af==='all'?'':af;const r=await fetch('/artifacts?'+new URLSearchParams({limit:100,...(lang?{lang}:{}),...(q?{q}:{})})).then(x=>x.json());const arts=r.artifacts||[];document.getElementById('artcnt').textContent=arts.length+' results';document.getElementById('artstats').innerHTML=[['Total',arts.length],['Langs',[...new Set(arts.map(a=>a.lang).filter(Boolean))].length],['Chats',[...new Set(arts.map(a=>a.chat_id))].length]].map(([l,v])=>'<div class="stat"><div class="sv">'+v+'</div><div class="sl">'+l+'</div></div>').join('');document.getElementById('afilts').innerHTML=['all','ts','js','python','html','css','json','bash','rust'].map(f=>'<button class="btn'+(af===f?' on':'')+'" onclick="af=\''+f+'\';loadArt()">'+f+'</button>').join('');const list=document.getElementById('artlist');if(!arts.length){list.innerHTML='<div class="empty">No artifacts</div>';return;}list.innerHTML=arts.slice(0,80).map(a=>{const ic=ICONS[a.lang]||'◻',exp=aexp.has(a.hash);const body=exp?'<div class="abody"><div class="ameta"><span><span class="aml">Account </span><span class="amv">'+esc((a.account||'').slice(0,28))+'</span></span><span><span class="aml">Chat </span><span class="amv url" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">'+((a.chat_id||'').slice(0,14))+'</span></span><span><span class="aml">Hash </span><span class="amv">'+(a.hash||'').slice(0,8)+'</span></span></div>'+(a.context?'<div style="color:#1a3040;font-size:.62rem;margin-bottom:4px;font-style:italic">'+esc(a.context.slice(0,120))+'</div>':'')+'<pre class="acont">'+esc((a.content||'').slice(0,1800))+'</pre><div class="aact"><button class="btn" onclick="navigator.clipboard.writeText('+JSON.stringify(a.content||'')+').then(()=>this.textContent=\'✓\')">⎘ Copy</button><button class="btn" onclick="window.open(\''+esc(a.chat_url||'')+'\',\'_blank\')">↗ Chat</button></div></div>':'';return'<div class="acard'+(exp?' exp':'')+'" onclick="aexp.'+(exp?'delete':'add')+'(\''+a.hash+'\');loadArt()"><div class="ahdr"><span>'+ic+'</span><span class="aname" style="color:'+(a.direction==='output'?'#a78bfa':'#60a5fa')+'">'+esc(a.name||'artifact')+'</span>'+(a.lang?'<span class="alang">'+a.lang+'</span>':'')+'<span class="ats">'+ft(a.ts)+'</span></div>'+body+'</div>';}).join('');}
async function loadGaps(){const r=await fetch('/gaps?limit=80').then(x=>x.json());const gs=r.gaps||[];const sum=await fetch('/gaps/summary').then(x=>x.json());document.getElementById('gapcnt').textContent=gs.length+' open';const open=gs.filter(g=>g.status==='open').length,tot=gs.length,dr=tot>0?(open/tot):0;document.getElementById('drf').style.width=(dr*100)+'%';document.getElementById('drv').textContent=(dr*100).toFixed(0)+'%';const bt=sum.byType||{},mx=Math.max(...Object.values(bt).map(t=>t.count||0),1);document.getElementById('ghm').innerHTML=Object.entries(bt).map(([type,info])=>{const pct=(info.count/mx*100).toFixed(0);const col=info.widening>0?'var(--red)':info.open>info.count/2?'var(--yel)':'var(--acc)';return'<div class="gcel" onclick="fgtype(\''+type+'\')"><div class="gcet" style="color:'+col+'">'+type+'</div><div class="gcec">'+info.count+' · '+(info.widening||0)+' wid.</div><div class="gcebar"><div class="gcebarfill" style="width:'+pct+'%;background:'+col+'"></div></div></div>';}).join('');document.getElementById('glist').innerHTML=!gs.length?'<div class="empty">No open gaps</div>':gs.map(g=>{const col=g.status==='widening'?'var(--red)':g.status==='narrowing'?'var(--grn)':'var(--yel)';return'<div class="grow"><span class="gtype" style="color:'+col+'">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore" style="color:'+col+'">'+((g.score||0)*100).toFixed(0)+'%</span></div>';}).join('');}
async function loadPA(){const r=await fetch('/pa?limit=15').then(x=>x.json());const ss=r.sessions||[];document.getElementById('palist').innerHTML=!ss.length?'<div class="empty">No PA sessions yet</div>':ss.map(s=>{const hs=Array.isArray(s.hypotheses)?s.hypotheses:[];return'<div class="pacard"><div style="display:flex;gap:8px;align-items:center;margin-bottom:5px"><span style="font-size:.65rem;color:var(--muted)">'+ft(s.ts)+'</span><span style="font-size:.65rem;color:var(--acc);margin-left:auto">'+(s.provider||'—')+'</span></div><div class="pamets">'+[['Tokens',s.total_tokens||0],['Tok/s',(s.tps_avg||0).toFixed(1)],['Pauses',s.pause_count||0],['Entropy',(s.entropy_avg||0).toFixed(2)]].map(([l,v])=>'<div class="pamet"><div class="pamv">'+v+'</div><div class="paml">'+l+'</div></div>').join('')+'</div>'+hs.slice(0,3).map(h=>'<div class="pahyp"><div class="pahyl">'+esc(h.label||'')+'</div><div class="pahyc">'+((h.confidence||0)*100).toFixed(0)+'%</div><div class="pabar"><div class="pabarf" style="width:'+((h.confidence||0)*100)+'%"></div></div></div>').join('')+'</div>';}).join('');}
async function loadSess(){const r=await fetch('/sessions?limit=30').then(x=>x.json());const ss=r.sessions||[];document.getElementById('sesslist').innerHTML=!ss.length?'<div class="empty">No sessions yet</div>':ss.map(s=>'<div style="background:var(--s1);border:1px solid var(--border);padding:7px 11px;margin-bottom:5px;display:flex;gap:8px;align-items:center"><span style="font-size:.76rem;font-weight:700;color:var(--acc)">'+esc(s.name||'Unnamed')+'</span><span style="font-size:.62rem;color:var(--muted)">'+(s.provider||'—')+'</span><span style="font-size:.62rem;color:#1a3040;margin-left:auto">'+ft(s.updated_ts||s.started_ts)+'</span><button class="btn" onclick="window.open(\''+esc(s.chat_url||'')+'\',\'_blank\')">↗</button></div>').join('');}
async function loadAgents(){const[pr,jr]=await Promise.all([fetch('/providers').then(x=>x.json()),fetch('/jobs?limit=8').then(x=>x.json())]);const prov=pr.providers||{},jobs=jr.jobs||[];document.getElementById('provlist').innerHTML=Object.entries(prov).map(([n,s])=>'<div class="pc"><span style="font-size:.76rem;font-weight:700;width:72px">'+n+'</span><span class="ps '+(s==='connected'?'on':'off')+'">'+s+'</span><button class="btn" onclick="fetch(\'/providers/'+n+'/claim\',{method:\'POST\'})">Claim</button><button class="btn" onclick="fetch(\'/providers/'+n+'/release\',{method:\'POST\'})">Release</button></div>').join('');document.getElementById('joblist').innerHTML=!jobs.length?'<div style="color:var(--muted);font-size:.7rem">No recent jobs</div>':jobs.map(j=>'<div class="jcard"><div class="jhdr"><span class="jid">#'+(j.id||'').slice(0,8)+'</span><span style="font-size:.66rem;font-weight:700;color:'+(j.provider==='claude'?'#a78bfa':'#34d399')+'">'+(j.provider||'—')+'</span><span class="jst '+(j.status||'pending')+'">'+(j.status||'—')+'</span><span style="margin-left:auto;font-size:.6rem;color:#1a3040">'+ft(j.started_ts)+'</span></div><div style="font-size:.7rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((j.prompt||'').slice(0,70))+'</div></div>').join('');}
const SMETA={session_greeting_enabled:{label:'Session Greeting',type:'toggle',desc:'Auto-inject on new chats'},session_greeting_text:{label:'Greeting Text',type:'textarea',desc:'Prompt injected into blank chats'},scan_debounce_ms:{label:'Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'DOM scan delay'},artifact_max:{label:'Artifact Limit',type:'range',min:100,max:5000,step:100,unit:'',desc:'Max artifacts in memory'},gap_min_score:{label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude'},pa_enabled:{label:'Prompt Archaeology',type:'toggle',desc:'Enable PA analysis'},memory_auto_push:{label:'Auto Memory Push',type:'toggle',desc:'Push artifacts to memory'},dropzone_auto_upload:{label:'Auto Dropzone Upload',type:'toggle',desc:'Upload artifacts to file server'},stream_log_level:{label:'SISO Log Level',type:'select',options:['OFF','EVENTS','DEEP','DATA'],desc:'Event bus verbosity'},greeting_delay_ms:{label:'Greeting Delay',type:'range',min:500,max:5000,step:100,unit:'ms',desc:'Delay before greeting inject'},poll_interval_ms:{label:'Poll Interval',type:'range',min:100,max:2000,step:100,unit:'ms',desc:'Response check interval'},stable_count_threshold:{label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls before job complete'}};
async function loadSettings(){const r=await fetch('/settings').then(x=>x.json());const cs=r.settings||{};document.getElementById('sgrid').innerHTML=Object.entries(SMETA).map(([key,m])=>{const val=cs[key]??'';let ctrl='';if(m.type==='toggle'){ctrl='<div style="display:flex;align-items:center;gap:6px"><label class="tgl"><input type="checkbox" id="s_'+key+'" '+(val==='true'?'checked':'')+' onchange="sv(\''+key+'\',this.checked?\'true\':\'false\')"><span class="tsl"></span></label><span style="font-size:.7rem;color:var(--muted)">'+(val==='true'?'ON':'OFF')+'</span></div>';}else if(m.type==='range'){ctrl='<div><input type="range" id="s_'+key+'" min="'+m.min+'" max="'+m.max+'" step="'+m.step+'" value="'+val+'" oninput="document.getElementById(\'sv_'+key+'\').textContent=this.value+\''+(m.unit||'')+'\'" onchange="sv(\''+key+'\',this.value)"> <span id="sv_'+key+'" style="font-size:.7rem;color:var(--acc)">'+val+(m.unit||'')+'</span></div>';}else if(m.type==='select'){ctrl='<select id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+(m.options||[]).map(o=>'<option '+(o===val?'selected':'')+' value="'+o+'">'+o+'</option>').join('')+'</select>';}else if(m.type==='textarea'){ctrl='<textarea id="s_'+key+'" onchange="sv(\''+key+'\',this.value)">'+esc(val)+'</textarea>';}else{ctrl='<input type="text" id="s_'+key+'" value="'+esc(val)+'" onchange="sv(\''+key+'\',this.value)">';}return'<div class="sc"><div class="sk">'+key+'</div><div class="sl2">'+m.label+'</div><div class="sd2">'+m.desc+'</div>'+ctrl+'</div>';}).join('');}
async function sv(key,value){await fetch('/settings/'+key,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value})});}
async function resetS(){if(!confirm('Reset all settings to defaults?'))return;await fetch('/settings/reset',{method:'POST'});loadSettings();}
function fgtype(type){fetch('/gaps?type='+type+'&limit=50').then(x=>x.json()).then(r=>{document.getElementById('glist').innerHTML=(r.gaps||[]).map(g=>'<div class="grow"><span class="gtype">'+(g.type||'—')+'</span><span class="gdomain">'+(g.domain||'—')+'</span><span class="greason">'+(g.reason||'—')+'</span><span class="gdesc">'+esc(g.description||'')+'</span><span class="gscore">'+((g.score||0)*100).toFixed(0)+'%</span></div>').join('');});}
const CMDS=[{l:'jobs',c:'jobs'},{l:'jobs pending',c:'jobs --status pending'},{l:'artifacts',c:'artifacts'},{l:'gaps',c:'gaps --status open'},{l:'gap summary',c:'gaps summary'},{l:'sessions',c:'sessions'},{l:'providers',c:'providers'},{l:'stats',c:'stats'},{l:'ledger',c:'ledger'},{l:'health',c:'health'}];
document.getElementById('ccmds').innerHTML=CMDS.map(c=>'<button class="btn" onclick="runCLI(\''+c.c+'\')">'+c.l+'</button>').join('');
const cin=document.getElementById('cli-in'),cout=document.getElementById('cli-out');
cin.onkeydown=e=>{if(e.key==='Enter'){runCLI(cin.value);cin.value='';}if(e.key==='ArrowUp'){ci=Math.min(ci+1,ch.length-1);cin.value=ch[ci]||'';}if(e.key==='ArrowDown'){ci=Math.max(ci-1,-1);cin.value=ci>=0?ch[ci]:'';}};
async function runCLI(cmd){if(!cmd.trim())return;ch.unshift(cmd);ci=-1;clog('> guardian '+cmd);const pts=cmd.trim().split(/\s+/),sc=pts[0],fl=parseFL(pts.slice(1));try{let r;if(sc==='jobs')r=await fetch('/jobs?'+new URLSearchParams(fl)).then(x=>x.json());else if(sc==='artifacts')r=await fetch('/artifacts?'+new URLSearchParams(fl)).then(x=>x.json());else if(sc==='gaps')r=fl.summary!=null?await fetch('/gaps/summary').then(x=>x.json()):await fetch('/gaps?'+new URLSearchParams(fl)).then(x=>x.json());else if(sc==='sessions')r=await fetch('/sessions?'+new URLSearchParams(fl)).then(x=>x.json());else if(sc==='providers')r=await fetch('/providers').then(x=>x.json());else if(sc==='health')r=await fetch('/health').then(x=>x.json());else if(sc==='stats')r=await fetch('/memory/stats').then(x=>x.json());else if(sc==='ledger')r=await fetch('/ledger?'+new URLSearchParams(fl)).then(x=>x.json());else if(sc==='settings')r=await fetch('/settings').then(x=>x.json());else if(sc==='set'&&pts[1]&&pts[2]){r=await fetch('/settings/'+pts[1],{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:pts[2]})}).then(x=>x.json());}else if(sc==='send'&&pts[1]&&pts[2]){r=await fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:pts[1],command:'code',prompt:pts.slice(2).join(' ')})}).then(x=>x.json());}else{clog('Unknown: '+sc+'. Try: jobs, artifacts, gaps, sessions, providers, health, stats, ledger, settings, set, send');return;}clog(JSON.stringify(r,null,2));}catch(e){clog('[error] '+e.message);}}
function parseFL(args){const fl={};for(let i=0;i<args.length;i+=2){const k=args[i]?.replace(/^--/,''),v=args[i+1];if(k&&v&&!v.startsWith('--'))fl[k]=v;else if(k&&(!v||v.startsWith('--'))){fl[k]='true';i--;}}return fl;}
function clog(t){cout.textContent+=t+'\n';cout.scrollTop=cout.scrollHeight;}
loadPS();loadDB();updateSB();setInterval(loadPS,5000);setInterval(loadDB,15000);
</script>
</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  WIRE SISO GATES INTO WSS
// ══════════════════════════════════════════════════════════════════════════════

wss.on('connection', (clientWs) => {
  clientWs.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'GUARDIAN_ARTIFACT') {
        bus.emit('guardian.artifact', { hash:msg.hash, name:msg.name, lang:msg.lang, content:msg.content, context:msg.context, type:msg.artifactType||'code_block', chatUrl:msg.chatUrl, chatId:msg.chatUrl?.split('/').pop()||'', account:msg.account, jobId:msg.jobId, direction:'output', provider:'claude' });
      }
      if (msg.type === 'GUARDIAN_GAPS') {
        // Use full GapHunter analysis if response text available
        const gapsToRecord = msg.gaps?.length ? msg.gaps : [];
        bus.emit('guardian.gaps', { gaps:gapsToRecord, jobId:msg.jobId, chatId:null, account:msg.account, provider:'claude' });
      }
      if (msg.type === 'GUARDIAN_COMPLETE') {
        // Run GapHunter v3 on completed response
        const gaps = gaphunterAnalyze(msg.text||'', { minScore: parseFloat(getSetting('gap_min_score','0.25'))||0.25 });
        if (gaps.length > 0) bus.emit('guardian.gaps', { gaps, jobId:msg.jobId, chatId:null, account:msg.account, provider:'claude' });
        bus.emit('guardian.job.complete', { jobId:msg.jobId, text:msg.text, chatUrl:msg.chatUrl, account:msg.account, chars:(msg.text||'').length, provider:'claude', source:'guardian-ws', startedTs:Date.now()-10000 });
        bus.emit('guardian.timeline', { channel:'guardian.job.complete', personId:msg.account, payload:{ jobId:msg.jobId, chars:(msg.text||'').length }, ts:Date.now() });
      }
      if (msg.type === 'GUARDIAN_PA_SESSION') bus.emit('guardian.pa.session', { ...msg, provider:'claude' });
      if (msg.type === 'GUARDIAN_LEDGER_EVENT') bus.emit('guardian.ledger', { ...msg, provider:'claude' });
      if (msg.type === 'GUARDIAN_FILE_UPLOAD') bus.emit('guardian.download', { filename:(msg.files||[]).map(f=>f.name).join(','), chatUrl:msg.chatUrl, account:msg.account, jobId:msg.jobId, provider:'claude' });
      if (msg.type === 'GUARDIAN_DOWNLOAD') bus.emit('guardian.download', { ...msg, provider:'claude' });
    } catch (_) {}
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH HTTP SERVER — inject extended routes
// ══════════════════════════════════════════════════════════════════════════════

const _origListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const url = new URL(req.url,`http://127.0.0.1:${HTTP_PORT}`);
  if (handleExtendedRoutes(req,res,url,req.method)) return;
  for (const listener of _origListeners) listener.call(server,req,res);
});


// ── Nexus Cobalt bridge helpers ───────────────────────────────────────────────
const NEXUS_HOST = process.env.NEXUS_HOST || '127.0.0.1';
const NEXUS_PORT = parseInt(process.env.NEXUS_PORT || '3748');

function _nexusPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = http.request({
      hostname: NEXUS_HOST, port: NEXUS_PORT,
      path, method: 'POST',
      headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); } });
    });
    req.setTimeout(5000, () => req.destroy(new Error('nexus timeout')));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── AXIOMS — injected into context bundles ────────────────────────────────────
const AXIOMS_BRIEF = [
  '§1.1 Nothing exists until proven.',
  '§1.2 Nothing silently fails.',
  '§1.3 No stubs in production.',
  '§2.1 Persistence is the golden rule.',
  '§4.3 Enterprise+military grade.',
  '§5.1 UUID+hook+bus on everything.',
  '§5.2 Everything implements the bridge.',
  '§5.3 No monkey patches.',
  '§8.1 Session context before build.',
  '§8.2 Hostile review before spec.',
  '§8.3 SISO+Jaa are load-order prerequisites.',
];

// ══════════════════════════════════════════════════════════════════════════════
//  LAN SERVER — Port 7823
//  Clean REST API over the shared JaaStore instance.
//  Bound to 0.0.0.0 so LAN devices can reach it.
//  This replaces the old memory server — same port, same paths, authoritative.
//
//  POST /ingest              push event (ARTIFACT | LEDGER | DOWNLOAD | JOB_*)
//  GET  /artifacts           ?lang=&chatId=&q=&limit=&after=
//  GET  /artifacts/:hash     single artifact
//  DELETE /artifacts/:hash   remove
//  GET  /gaps                ?type=&domain=&status=&limit=
//  GET  /ledger              ?category=&limit=&after=
//  GET  /sessions            ?provider=&account=&limit=
//  GET  /query?q=            full-text search
//  GET  /context?chatId=     full bundle for injection
//  GET  /stats               store stats
//  GET  /health              health check
//  GET  /tags                tag taxonomy
//  PUT  /artifacts/:id/tags  update tags
// ══════════════════════════════════════════════════════════════════════════════

function startLANServer() {
  const LAN_PORT = process.env.MEMORY_PORT || 7823;

  function lanRes(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type',
      'Content-Length':              Buffer.byteLength(body),
    });
    res.end(body);
  }

  function lanBody(req) {
    return new Promise((resolve, reject) => {
      let b = '';
      req.on('data', c => b += c);
      req.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { reject(e); } });
      req.on('error', reject);
    });
  }

  // POST /ingest — main entry for userscripts and external agents
  function ingest(event) {
    const { type, payload, source, chatUrl, account, chatId } = event;
    const ts = event.ts || Date.now();

    if (type === 'ARTIFACT' || type === 'ARTIFACT_MANUAL_PUSH') {
      if (!payload?.content) return { ok: false, error: 'No content' };
      // Route through SISO bus so gate handles tagging + dropzone
      bus.emit('guardian.artifact', {
        ...payload,
        chatUrl: payload.chatUrl || chatUrl || '',
        account: payload.account || account || '',
        chatId:  payload.chatId  || chatId  || '',
        provider: payload.provider || source?.split('-')[1] || 'claude',
        ts,
      });
      return { ok: true, hash: payload.hash };
    }

    if (type === 'LEDGER') {
      if (!payload) return { ok: false, error: 'No payload' };
      bus.emit('guardian.ledger', {
        ...payload, chatUrl: chatUrl||'', account: account||'', source: source||'lan-ingest',
      });
      return { ok: true };
    }

    if (type === 'DOWNLOAD') {
      bus.emit('guardian.download', { ...payload, chatUrl, account, provider: 'claude' });
      return { ok: true };
    }

    if (type === 'JOB_START') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      const existing = jaa.get('jobs', { id: payload.jobId });
      if (!existing) {
        jaa.insert('jobs', {
          id: payload.jobId, provider: payload.provider||'claude', prompt: (payload.prompt||'').slice(0,500),
          status: 'started', chat_url: chatUrl||'', account: account||'', started_ts: ts,
        });
      }
      return { ok: true };
    }

    if (type === 'JOB_COMPLETE') {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      jaa.update('jobs', { id: payload.jobId }, { status:'complete', completed_ts: ts, chars: payload.chars||0 });
      return { ok: true };
    }

    if (type === 'FILE_UPLOAD') {
      bus.emit('guardian.ledger', { category:'INPUT', msg:`Upload: ${(payload?.files||[]).map(f=>f.name).join(', ')}`, meta:payload, chatUrl, account, source:'lan-ingest' });
      return { ok: true };
    }

    // Generic → ledger
    bus.emit('guardian.ledger', { category:'EVENT', msg: type, meta: payload||{}, chatUrl, account, source:'lan-ingest' });
    return { ok: true };
  }

  const lanServer = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url    = new URL(req.url, `http://127.0.0.1:${LAN_PORT}`);
    const parts  = url.pathname.split('/').filter(Boolean);
    const method = req.method;

    try {
      // POST /ingest
      if (method === 'POST' && parts[0] === 'ingest') {
        const body = await lanBody(req);
        lanRes(res, 200, ingest(body));
        return;
      }

      // GET /artifacts
      if (method === 'GET' && parts[0] === 'artifacts' && !parts[1]) {
        const limit   = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
        const lang    = url.searchParams.get('lang');
        const chatId  = url.searchParams.get('chatId');
        const account = url.searchParams.get('account');
        const after   = parseInt(url.searchParams.get('after')||'0');
        const q       = url.searchParams.get('q');
        const where   = {};
        if (lang)    where.lang    = lang;
        if (chatId)  where.chat_id = chatId;
        if (account) where.account = account;
        let rows = jaa.all('artifacts', where, { orderBy:'ts', order:'DESC', limit });
        if (after) rows = rows.filter(r => r.ts > after);
        if (q) { const ql = q.toLowerCase(); rows = rows.filter(r => (r.name||'').toLowerCase().includes(ql)||(r.content||'').toLowerCase().includes(ql)); }
        // Strip heavy content from list view
        const slim = rows.map(r => ({ ...r, content: (r.content||'').slice(0, 200) }));
        lanRes(res, 200, { ok:true, count:slim.length, artifacts:slim });
        return;
      }

      // GET /artifacts/:hash
      if (method === 'GET' && parts[0] === 'artifacts' && parts[1]) {
        const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
        if (!r) { lanRes(res,404,{ok:false,error:'Not found'}); return; }
        lanRes(res, 200, { ok:true, artifact:r });
        return;
      }

      // DELETE /artifacts/:hash
      if (method === 'DELETE' && parts[0] === 'artifacts' && parts[1]) {
        const r = jaa.get('artifacts',{hash:parts[1]}) || jaa.get('artifacts',{id:parts[1]});
        if (r) jaa.delete('artifacts',{id:r.id});
        lanRes(res, 200, { ok:true });
        return;
      }

      // PUT /artifacts/:id/tags
      if (method === 'PUT' && parts[0] === 'artifacts' && parts[1] && parts[2] === 'tags') {
        const body = await lanBody(req);
        const r = jaa.get('artifacts',{id:parts[1]}) || jaa.get('artifacts',{hash:parts[1]});
        if (r) jaa.update('artifacts',{id:r.id},{ tags: JSON.stringify(body.tags||[]) });
        lanRes(res, 200, { ok:true, tags: body.tags });
        return;
      }

      // GET /gaps
      if (method === 'GET' && parts[0] === 'gaps') {
        const limit  = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
        const where  = {};
        const type   = url.searchParams.get('type');
        const domain = url.searchParams.get('domain');
        const status = url.searchParams.get('status');
        if (type)   where.type   = type;
        if (domain) where.domain = domain;
        if (status) where.status = status;
        const rows = jaa.all('gaps', where, { orderBy:'score', order:'DESC', limit });
        lanRes(res, 200, { ok:true, gaps:rows });
        return;
      }

      // GET /ledger
      if (method === 'GET' && parts[0] === 'ledger') {
        const limit = Math.min(parseInt(url.searchParams.get('limit')||'100'),500);
        const where = {};
        const cat   = url.searchParams.get('category');
        if (cat) where.category = cat;
        const rows = jaa.all('ledger_entries', where, { orderBy:'ts', order:'DESC', limit });
        lanRes(res, 200, { ok:true, count:rows.length, ledger:rows });
        return;
      }

      // GET /sessions
      if (method === 'GET' && parts[0] === 'sessions') {
        const limit = Math.min(parseInt(url.searchParams.get('limit')||'50'),200);
        const where = {};
        const prov  = url.searchParams.get('provider');
        const acc   = url.searchParams.get('account');
        if (prov) where.provider = prov;
        if (acc)  where.account  = acc;
        lanRes(res, 200, { ok:true, sessions: jaa.all('sessions', where, {orderBy:'updated_ts',order:'DESC',limit}) });
        return;
      }

      // GET /query?q=
      if (method === 'GET' && parts[0] === 'query') {
        const q = url.searchParams.get('q')||'';
        if (!q) { lanRes(res,400,{ok:false,error:'Missing q'}); return; }
        lanRes(res, 200, { ok:true, query:q, results: jaa.search(q) });
        return;
      }

      // GET /context?chatId=  — full injection bundle
      if (method === 'GET' && parts[0] === 'context') {
        const chatId = url.searchParams.get('chatId');
        const arts   = chatId ? jaa.all('artifacts',{chat_id:chatId},{orderBy:'ts',order:'DESC',limit:20}) : jaa.all('artifacts',{},{orderBy:'ts',order:'DESC',limit:20});
        const gaps   = jaa.all('gaps',{status:'open'},{orderBy:'score',order:'DESC',limit:10});
        const sess   = chatId ? jaa.get('sessions',{chat_id:chatId}) : null;
        lanRes(res, 200, { ok:true, ts:Date.now(), chatId, session:sess, artifacts:arts, gaps, axioms: AXIOMS_BRIEF });
        return;
      }

      // GET /tags — full taxonomy
      if (method === 'GET' && parts[0] === 'tags') {
        lanRes(res, 200, { ok:true, namespaces: tagEngine.TAG_NAMESPACES, values: tagEngine.TAG_VALUES });
        return;
      }

      // GET /stats
      if (method === 'GET' && parts[0] === 'stats') {
        lanRes(res, 200, { ok:true, stats: jaa.stats() });
        return;
      }

      // GET /health
      if (method === 'GET' && (parts[0] === 'health' || url.pathname === '/')) {
        lanRes(res, 200, { ok:true, uptime: process.uptime(), ...jaa.stats(), port: LAN_PORT, ips: getLocalIPs() });
        return;
      }

      lanRes(res, 404, { ok:false, error:`Not found: ${url.pathname}` });
    } catch(e) {
      lanRes(res, 500, { ok:false, error: e.message });
    }
  });

  lanServer.listen(LAN_PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    console.log(`[lan]   API:  http://127.0.0.1:${LAN_PORT}`);
    ips.forEach(ip => console.log(`[lan]   LAN:  http://${ip.address}:${LAN_PORT}  (${ip.name})`));
    console.log(`[lan]   Store: ${STORE_DIR}`);
    const s = jaa.stats();
    console.log(`[lan]   Loaded: ${s.artifacts} artifacts, ${s.ledger} ledger entries, ${s.gaps} gaps`);
  });

  lanServer.on('error', err => {
    console.error(`[lan] ERROR: ${err.message}`);
    if (err.code === 'EADDRINUSE') console.error(`[lan] Port ${LAN_PORT} in use — set MEMORY_PORT env var`);
  });

  return { server: lanServer, ingest };
}

const memoryServer = startLANServer();

module.exports = { server, wss, jobs, PROVIDERS, dropzoneServer, dropzone, memoryServer };
