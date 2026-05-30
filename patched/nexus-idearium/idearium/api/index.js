'use strict';
// ── idearium/api/index.js ─────────────────────────────────────────────────────
// UUID: idearium-api-v1-0000-4000-0000-000000000002
// VERSION: 1.0.0 — §5.4
// PORT: 4800 — §P map extension
//
// HTTP API for Idearium. Built from the interaction-contract.json.
// Every endpoint declared in the contract is implemented here.
// GET /api/contract — returns the full interaction contract (enables UI hotswap).
//
// LAW V: UI is a skin on the API. The API is the feature.
// §4.3: No unauthenticated writes in production (IDEARIUM_TOKEN env var).

const http = require('http');
const path = require('path');
const fs   = require('fs');
const { IdeaOS, VERSION } = require('../core');

// ── Guardian API connector (v8) ────────────────────────────────────────────────
// /api/complete does NOT exist in guardian/server.js v8.
// Use GuardianAPI.dispatch() — POST /command → poll /status → GET /response.
const { GuardianAPI } = require('../../guardian-api');
const _guardian = new GuardianAPI({
  port:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  ipcToken: process.env.GUARDIAN_IPC_TOKEN || '',
});

const PORT          = parseInt(process.env.IDEARIUM_PORT || '4800');
const DATA_DIR      = process.env.IDEARIUM_DATA || path.join(process.cwd(), '.idearium');
const IDEARIUM_TOKEN = process.env.IDEARIUM_TOKEN; // optional auth token

// SSE clients
const _sseClients = new Set();
let   _sseLogId   = 0;

// Singleton IdeaOS
const ideaOS = new IdeaOS({ dataDir: DATA_DIR });

function start() {
  ideaOS.open();

  // Monkey-patch _emit to broadcast to SSE clients
  const _origEmit = ideaOS._emit.bind(ideaOS);
  ideaOS._emit = function(type, payload = {}) {
    const row = _origEmit(type, payload);
    _broadcast(row);
    return row;
  };

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    _handle(req, res).catch(err => {
      console.error('[idearium-api] unhandled:', err.message);
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      } catch (_) {}
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[idearium-api] v${VERSION} listening on http://127.0.0.1:${PORT}`);
    console.log(`[idearium-api] contract: http://127.0.0.1:${PORT}/api/contract`);
  });

  return server;
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────
function _broadcast(event) {
  if (!_sseClients.size) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of _sseClients) {
    try { client.write(data); } catch { _sseClients.delete(client); }
  }
}

// ── Request router ────────────────────────────────────────────────────────────
async function _handle(req, res) {
  const url    = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const route  = `${req.method} ${url.pathname}`;
  const parts  = url.pathname.replace(/^\//, '').split('/');

  // §4.3 token gate (optional — only when IDEARIUM_TOKEN is set)
  if (IDEARIUM_TOKEN && req.method !== 'GET' && parts[0] === 'api') {
    const auth = req.headers.authorization || '';
    if (!auth.includes(IDEARIUM_TOKEN)) {
      return _json(res, 401, { ok: false, error: 'unauthorized — set Authorization: Bearer <IDEARIUM_TOKEN>' });
    }
  }

  // ── GET /api/contract — THE interaction contract (UI hot-swap hook) ────────
  if (route === 'GET /api/contract') {
    const contractPath = path.join(__dirname, '../schemas/interaction-contract.json');
    const contract = fs.existsSync(contractPath) ? JSON.parse(fs.readFileSync(contractPath,'utf8')) : {};
    return _json(res, 200, { ok: true, contract, version: VERSION });
  }

  // ── GET /health ───────────────────────────────────────────────────────────
  if (route === 'GET /health') {
    return _json(res, 200, { ok: true, version: VERSION, ...ideaOS.stats() });
  }

  // ── GET /sse — Server-Sent Events ─────────────────────────────────────────
  if (route === 'GET /sse') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    res.write('data: {"type":"connected","source":"idearium"}\n\n');
    _sseClients.add(res);
    req.on('close', () => _sseClients.delete(res));
    return; // keep alive
  }

  // ── GET /api/stats ────────────────────────────────────────────────────────
  if (route === 'GET /api/stats') {
    return _json(res, 200, { ok: true, ...ideaOS.stats() });
  }

  // ── /api/ideas ────────────────────────────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'ideas') {
    const uuid = parts[2];

    if (!uuid && req.method === 'GET') {
      const phase = url.searchParams.get('phase');
      const tag   = url.searchParams.get('tag');
      const sort  = url.searchParams.get('sort') || 'tension';
      const limit = parseInt(url.searchParams.get('limit') || '50');
      return _json(res, 200, { ok: true, ideas: ideaOS.listIdeas({ phase, tag, sort, limit }) });
    }

    if (!uuid && req.method === 'POST') {
      const body = await _body(req);
      const idea = ideaOS.createIdea(body);
      return _json(res, 201, { ok: true, idea });
    }

    if (uuid && req.method === 'GET' && !parts[3]) {
      return _json(res, 200, { ok: true, idea: ideaOS.getIdea(uuid) });
    }

    if (uuid && req.method === 'PATCH' && !parts[3]) {
      const body = await _body(req);
      return _json(res, 200, { ok: true, idea: ideaOS.updateIdea(uuid, body) });
    }

    if (uuid && req.method === 'DELETE' && !parts[3]) {
      const body = await _body(req);
      return _json(res, 200, { ok: true, ...ideaOS.archiveIdea(uuid, body.reason) });
    }

    if (uuid && parts[3] === 'tension' && req.method === 'POST') {
      return _json(res, 200, { ok: true, ...ideaOS.computeTension(uuid) });
    }

    if (uuid && parts[3] === 'link' && req.method === 'POST') {
      const body = await _body(req);
      return _json(res, 200, { ok: true, link: ideaOS.linkIdeas(uuid, body.targetUuid, body.type) });
    }

    if (uuid && parts[3] === 'spec' && req.method === 'POST') {
      return _json(res, 201, { ok: true, spec: ideaOS.createSpec(uuid) });
    }
  }

  // ── /api/specs ────────────────────────────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'specs') {
    const uuid = parts[2];

    if (!uuid && req.method === 'GET') {
      const specs = ideaOS._jaa.query('specs', () => true, 100);
      return _json(res, 200, { ok: true, specs });
    }

    if (uuid && req.method === 'GET' && !parts[3]) {
      return _json(res, 200, { ok: true, spec: ideaOS.getSpec(uuid) });
    }

    if (uuid && req.method === 'PATCH' && !parts[3]) {
      const body = await _body(req);
      return _json(res, 200, { ok: true, spec: ideaOS.updateSpec(uuid, body) });
    }

    if (uuid && parts[3] === 'check' && req.method === 'POST') {
      return _json(res, 200, { ok: true, ...ideaOS.checkSpec(uuid) });
    }

    if (uuid && parts[3] === 'build' && req.method === 'POST') {
      const ci = ideaOS.runCI(uuid);
      return _json(res, 200, { ok: true, ci });
    }

    if (uuid && parts[3] === 'export' && req.method === 'GET') {
      const spec = ideaOS.getSpec(uuid);
      const md   = _specToMarkdown(spec);
      res.writeHead(200, { 'Content-Type': 'text/markdown' });
      res.end(md);
      return;
    }
  }

  // ── /api/gaps ─────────────────────────────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'gaps') {
    const uuid = parts[2];

    if (!uuid && req.method === 'GET') {
      const status   = url.searchParams.get('status');
      const severity = url.searchParams.get('severity');
      return _json(res, 200, { ok: true, gaps: ideaOS.listGaps({ status, severity }) });
    }

    if (!uuid && req.method === 'POST') {
      const body = await _body(req);
      return _json(res, 201, { ok: true, gap: ideaOS.createGap(body) });
    }

    if (uuid && parts[3] === 'resolve' && req.method === 'POST') {
      const body = await _body(req);
      return _json(res, 200, { ok: true, ...ideaOS.resolveGap(uuid, body.resolution) });
    }
  }

  // ── /api/snapshots ────────────────────────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'snapshots') {
    if (req.method === 'GET' && !parts[2]) {
      return _json(res, 200, { ok: true, snapshots: ideaOS._jaa.tail('snapshots', 30) });
    }
    if (req.method === 'POST' && !parts[2]) {
      const body = await _body(req);
      return _json(res, 201, { ok: true, snapshot: ideaOS.snapshot(body.message, body.causedBy) });
    }
    if (parts[2] && parts[3] === 'diff' && parts[4] && req.method === 'GET') {
      return _json(res, 200, { ok: true, ...ideaOS.diffSnapshots(parts[2], parts[4]) });
    }
  }

  // ── /api/ci ───────────────────────────────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'ci') {
    if (parts[2] === 'run' && req.method === 'POST') {
      const body = await _body(req);
      if (!body.specUuid) return _json(res, 400, { ok: false, error: 'specUuid required' });
      return _json(res, 200, { ok: true, ...ideaOS.runCI(body.specUuid) });
    }
    if (parts[2] === 'status' && req.method === 'GET') {
      const latest = ideaOS._jaa.tail('ci_runs', 5);
      return _json(res, 200, { ok: true, runs: latest });
    }
    if (parts[2] === 'history' && req.method === 'GET') {
      return _json(res, 200, { ok: true, runs: ideaOS._jaa.tail('ci_runs', 50) });
    }
  }

  // ── /api/snr ──────────────────────────────────────────────────────────────
  if (route === 'GET /api/snr') {
    return _json(res, 200, { ok: true, snr: ideaOS.getSNR() });
  }

  // ── /api/agents — proxy to Guardian :7820 ────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'agents') {
    if (req.method === 'GET' && !parts[2]) {
      // Try to get Guardian health — uses guardian-api.js (port 7820, not 3748)
      try {
        const gData = await _guardian.health();
        const agents = gData ? _buildAgentList(gData) : [];
        return _json(res, 200, { ok: true, agents, guardianConnected: !!gData });
      } catch {
        return _json(res, 200, { ok: true, agents: [], guardianConnected: false });
      }
    }
    if (parts[2] === 'dispatch' && req.method === 'POST') {
      const body = await _body(req);
      // Use GuardianAPI.dispatch() — POST /command → poll /status → GET /response
      // /api/complete does NOT exist in guardian/server.js v8
      try {
        const provider = (body.service || body.provider || 'claude').replace('guardian-', '');
        const text = await _guardian.dispatch(provider, body.prompt || '', {
          command: body.command || 'code',
          timeout: 90_000,
        });
        return _json(res, 200, { ok: true, result: { content: text } });
      } catch (e) {
        return _json(res, 503, { ok: false, error: `Guardian dispatch failed: ${e.message}` });
      }
    }
  }

  _json(res, 404, { ok: false, error: `No route: ${route}` });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function _body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

function _specToMarkdown(spec) {
  const lines = [
    `# ${spec.name}`,
    `**Version:** ${spec.version}  **Phase:** ${spec.phase}`,
    '',
  ];
  for (const s of spec.sections) {
    lines.push(`## ${s.title}${s.complete ? ' ✓' : ' ○'}`);
    if (s.content) lines.push(s.content, '');
    for (const c of s.checklist) {
      lines.push(`- [${c.done ? 'x' : ' '}] ${c.label}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function _buildAgentList(gData) {
  const agents = [];
  if (gData.artifacts !== undefined) {
    agents.push({ id: 'guardian-claude', name: 'Claude (Guardian)', provider: 'claude', status: 'connected', artifacts: gData.artifacts });
    agents.push({ id: 'guardian-chatgpt', name: 'ChatGPT (Guardian)', provider: 'chatgpt', status: 'connected' });
    agents.push({ id: 'guardian-gemini', name: 'Gemini (Guardian)', provider: 'gemini', status: 'connected' });
  }
  return agents;
}

function _proxyGet(url, timeout = 3000) {
  const http_ = require('http');
  return new Promise((resolve, reject) => {
    const req = http_.get(url, { timeout }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function _proxyPost(url, body, timeout = 30000) {
  const http_ = require('http');
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = http_.request({ ...new URL(url), method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); } });
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

if (require.main === module) start();
module.exports = { start, VERSION, PORT };
