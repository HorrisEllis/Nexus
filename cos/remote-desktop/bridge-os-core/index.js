'use strict';
// Copyright (c) 2026 James Brooks.
// Bridge OS — CORE build. Same license/terms as the full project.
/**
 * index.js — CORE
 *
 * Boots the 7 vital modules (bridge-node/boot.js) and exposes only the
 * routes that touch them: /health, /identity, /pulse, /nodes,
 * /ime/profile/:uuid, /sngate/trace|rules, /data/*.
 *
 * Everything route-level that belonged to a cut module is gone too —
 * /causal/*, /trust/*, /dht/*, /mesh/*, /cobalt/*, /nat*, /module/*,
 * /magnet/*, /guardian/*, /userscript, /runtime/state, CLI. Add each
 * back by restoring its module + its route block from the full
 * index.js/boot.js, not by re-deriving it here.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

const { boot } = require('./bridge-node/boot');

function jsonRes(res, status, body) {
  if (res.headersSent) return;
  const d = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) });
  res.end(d);
}

// Fail-closed API key — same fix as the full build: no key set means every
// request is rejected, not allowed. A key is generated once and persisted.
function ensureApiKey(dataDir) {
  if (process.env.NEXUS_API_KEY) return process.env.NEXUS_API_KEY;
  const keyPath = path.join(dataDir, '.nexus-api-key');
  try {
    if (fs.existsSync(keyPath)) {
      const existing = fs.readFileSync(keyPath, 'utf8').trim();
      if (existing) return existing;
    }
  } catch (_) {}
  const key = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    console.log(`  ⚠  No NEXUS_API_KEY set — generated one at ${keyPath}`);
    console.log(`     Send it as \`Authorization: Bearer <key>\` or \`X-Api-Key: <key>\`.`);
  } catch (e) {
    console.error(`  ✗  could not persist generated API key: ${e.message}`);
  }
  return key;
}

function checkAuth(req, res, apiKey) {
  const supplied = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'] || '';
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(String(apiKey));
  const lengthOk = a.length === b.length;
  const same = lengthOk && crypto.timingSafeEqual(a, b);
  if (!same) { jsonRes(res, 401, { ok: false, error: 'Unauthorized' }); return false; }
  return true;
}

async function main() {
  const config = {
    port:    Number(process.env.NEXUS_PORT) || 3747,
    dataDir: process.env.NEXUS_DATA_DIR     || path.join(process.cwd(), 'data'),
  };
  const t0 = Date.now();
  const apiKey = ensureApiKey(config.dataDir);

  const { identity, nodeRegistry, ime, gate, busEmit, dataBus, heartbeat } = await boot(config);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key' });
      return res.end();
    }
    if (!checkAuth(req, res, apiKey)) return;

    try {
      let body = {};
      if (['POST', 'PUT'].includes(req.method)) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
      }
      const urlParts = (req.url || '/').split('?')[0].split('/').filter(Boolean);
      const qs = Object.fromEntries(new URLSearchParams((req.url || '').split('?')[1] || ''));
      const { method } = req;
      const top = urlParts[0];

      if (method === 'GET' && top === 'health') {
        return jsonRes(res, 200, {
          ok: true, uuid: identity.uuid, shortId: identity.uuid.slice(0, 8),
          uptime: process.uptime(), booted: `${((Date.now() - t0) / 1000).toFixed(2)}s`,
          nodes: nodeRegistry.diagnostics(),
        });
      }
      if (method === 'GET' && top === 'identity') {
        return jsonRes(res, 200, identity.publicRecord());
      }
      if (method === 'POST' && top === 'pulse') {
        const { instanceId, logicalId, capabilities } = body || {};
        if (!instanceId) return jsonRes(res, 400, { ok: false, error: 'instanceId required' });
        const addr = req.socket?.remoteAddress || '127.0.0.1';
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(instanceId);
        const regUUID = isUUID ? instanceId : crypto.createHash('sha256').update(instanceId).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, '$1-$2-$3-$4-$5');
        try { nodeRegistry.register({ uuid: regUUID, address: addr, groupHint: logicalId || instanceId }); }
        catch { nodeRegistry.seen?.(regUUID); }
        busEmit('node:pulse', { instanceId, logicalId, capabilities }, 'DEBUG');
        return jsonRes(res, 200, { ok: true, uuid: identity.uuid, shortId: identity.uuid.slice(0, 8) });
      }
      if (method === 'GET' && top === 'nodes') {
        return jsonRes(res, 200, { ok: true, nodes: nodeRegistry.list({ all: qs.all === 'true' }), diagnostics: nodeRegistry.diagnostics() });
      }
      if (method === 'GET' && top === 'ime' && urlParts[1] === 'profile') {
        const p = ime.getProfile(urlParts[2]);
        return jsonRes(res, p ? 200 : 404, p ? { ok: true, profile: p } : { ok: false, error: 'not found' });
      }
      if (top === 'sngate') {
        if (method === 'GET' && urlParts[1] === 'trace') return jsonRes(res, 200, { ok: true, entries: gate.trace.query({}).slice(-100) });
        if (method === 'POST' && urlParts[1] === 'rules') return jsonRes(res, 200, { ok: true, id: gate.rules.add(body) });
        if (method === 'GET' && urlParts[1] === 'rules') return jsonRes(res, 200, { ok: true, rules: gate.rules.list() });
      }
      if (top === 'data') {
        const isLocal = ['127.0.0.1', '::1'].includes(req.socket?.remoteAddress);
        if (isLocal && !body.sig) body = { ...body, _localVerified: true };
        return dataBus.route(method, urlParts, body, req, res);
      }

      return jsonRes(res, 404, { ok: false, error: `Unknown route: ${method} /${urlParts.join('/')}` });
    } catch (routeErr) {
      busEmit?.('http:route:error', { path: req.url, method: req.method, error: routeErr.message }, 'ERROR');
      if (!res.headersSent) jsonRes(res, 500, { ok: false, error: 'INTERNAL_ERROR', detail: routeErr.message });
      else try { res.end(); } catch {}
    }
  });

  server.listen(config.port, () => {
    console.log(`  HTTP :${config.port}  (Authorization: Bearer <key> required — see data dir for generated key)`);
  });

  process.on('SIGINT',  () => { heartbeat?.stop?.(); process.exit(0); });
  process.on('SIGTERM', () => { heartbeat?.stop?.(); process.exit(0); });
}

main().catch(e => { console.error(e); process.exit(1); });
