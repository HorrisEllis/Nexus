'use strict';
/**
 * lib/file-push.js — NEXUS File Push System
 * UUID: nexus-file-push-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Handles drag-and-drop file delivery to the running NEXUS system.
 * Routes each file type to the correct subsystem automatically.
 *
 * File type routing:
 *   .spec   → guardian physical queue → SEAM compile pipeline
 *   .eg     → emerge compiler
 *   .nex    → cortex lab (sandbox test) OR snapshot restore
 *   .js     → cortex/self-heal forge patches OR system module update
 *   .json   → guardian dispatch queue OR JAA table import
 *   .md     → idearium idea capture
 *   .pub    → auth whitelist (new client key)
 *   .pem    → rejected (private key — never accepted over the wire)
 *   *       → cortex file store (general artifact)
 *
 * §1.1  File is written to disk before any processing (§2.1)
 * §1.2  Every file event logged to JAA with source, destination, result
 * §5.1  Every push gets a UUID for tracing
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'file-push';

// ── File type router ──────────────────────────────────────────────────────────
const ROUTES = [
  {
    ext:         ['.spec'],
    label:       'Spec → SEAM pipeline',
    destination: 'guardian-queue',
    description: 'Spec file queued for SEAM compile and dispatch',
  },
  {
    ext:         ['.eg', '.emerge'],
    label:       'Emergence source → compiler',
    destination: 'emerge-compiler',
    description: 'Emergence DSL file sent to emerge compiler',
  },
  {
    ext:         ['.nex'],
    label:       'Snapshot → lab sandbox',
    destination: 'cortex-lab',
    description: 'NEX snapshot loaded into lab sandbox for testing',
  },
  {
    ext:         ['.pub'],
    label:       'Public key → auth whitelist',
    destination: 'auth-whitelist',
    description: 'Client public key registered in auth whitelist',
  },
  {
    ext:         ['.pem'],
    label:       'REJECTED — private keys never accepted',
    destination: null,
    description: 'PEM files are rejected — never push private keys over the wire',
    reject:      true,
  },
  {
    ext:         ['.json'],
    label:       'JSON → dispatch or import',
    destination: 'guardian-queue',
    description: 'JSON dispatched to guardian queue',
  },
  {
    ext:         ['.md', '.txt'],
    label:       'Text → idearium idea',
    destination: 'idearium-idea',
    description: 'Text captured as an idea in Idearium',
  },
  {
    ext:         ['.js', '.ts'],
    label:       'Code → forge review',
    destination: 'forge-review',
    description: 'Code file staged for self-heal forge review',
  },
];

function routeFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ROUTES.find(r => r.ext.includes(ext)) || {
    ext:         ['*'],
    label:       'File → cortex store',
    destination: 'cortex-store',
    description: 'File stored as artifact in cortex',
  };
}

// ── Process a pushed file ─────────────────────────────────────────────────────
async function processPush(filename, content, opts = {}) {
  const {
    guardianUrl  = 'http://127.0.0.1:7820',
    cortexUrl    = 'http://127.0.0.1:3748',
    emergeUrl    = 'http://127.0.0.1:4242',
    ideariumUrl  = 'http://127.0.0.1:4800',
    authDir      = path.join(__dirname, '..', 'auth'),
    jaaInsert    = null,
    source       = 'drag-drop',
  } = opts;

  const pushId   = crypto.randomUUID();
  const route    = routeFor(filename);
  const ext      = path.extname(filename).toLowerCase();
  const size     = Buffer.byteLength(content);
  const t0       = Date.now();

  // §1.1 — reject .pem immediately
  if (route.reject) {
    _log(jaaInsert, 'file-push.rejected', { pushId, filename, reason: route.description });
    return { ok: false, pushId, filename, error: route.description, destination: null };
  }

  let result = { ok: false, detail: 'no handler' };

  try {
    switch(route.destination) {

      case 'guardian-queue': {
        // POST to guardian's /command endpoint
        const body = JSON.stringify({
          command: ext === '.spec' ? 'spec' : 'code',
          prompt:  content,
          provider: opts.provider || 'ollama',
          _source: source,
          _filename: filename,
        });
        const r = await _post(guardianUrl + '/command', body);
        result  = r;
        break;
      }

      case 'emerge-compiler': {
        const body = JSON.stringify({ content, filename, source });
        const r = await _post(emergeUrl + '/api/compile', body);
        result  = r;
        break;
      }

      case 'cortex-lab': {
        // Load .nex into lab sandbox
        let snapData;
        try { snapData = JSON.parse(content); } catch(e) {
          result = { ok: false, error: 'invalid NEX file: ' + e.message }; break;
        }
        const body = JSON.stringify({ snapData });
        const r = await _post(cortexUrl + '/api/lab/session', body);
        result  = { ...r, action: 'lab-session-created' };
        break;
      }

      case 'auth-whitelist': {
        // Register public key — extract UUID from filename (e.g. <uuid>.pub)
        const uuid = path.basename(filename, '.pub');
        if (!uuid || uuid.length < 8) {
          result = { ok: false, error: 'filename must be <uuid>.pub' }; break;
        }
        const destFile = path.join(authDir, 'clients', path.basename(filename));
        fs.writeFileSync(destFile, content);
        result = { ok: true, action: 'client-registered', uuid, file: destFile };
        break;
      }

      case 'idearium-idea': {
        // First line becomes the idea text
        const text = content.split('\n').find(l => l.trim()) || path.basename(filename, ext);
        const body = JSON.stringify({ text: text.slice(0, 500), source, tags: [ext.slice(1)], meta: { filename } });
        const r    = await _post(ideariumUrl + '/api/ideas', body);
        result     = r;
        break;
      }

      case 'forge-review': {
        // Stage the file for self-heal forge review
        // Writes to cortex as a forge_patch candidate
        const body = JSON.stringify({
          type:   'file_push',
          payload:{ filename, content: content.slice(0, 50000), source },
          source: MODULE_ID,
          ts:     Date.now(),
        });
        const r = await _post(cortexUrl + '/api/event', body);
        result  = { ...r, action: 'forge-staged', filename };
        break;
      }

      case 'cortex-store':
      default: {
        // Store as artifact in guardian
        const body = JSON.stringify({
          name:     filename,
          type:     'file-push',
          lang:     ext.slice(1) || 'txt',
          content:  content.slice(0, 50000),
          source,
        });
        const r = await _post(guardianUrl + '/artifacts', body);
        result  = r;
        break;
      }
    }
  } catch(e) {
    result = { ok: false, error: e.message };
  }

  const entry = {
    pushId, filename, size, ext,
    destination: route.destination,
    label:       route.label,
    source,
    result:      result?.ok ? 'ok' : 'failed',
    error:       result?.error || null,
    durationMs:  Date.now() - t0,
    ts:          Date.now(),
  };

  _log(jaaInsert, result?.ok ? 'file-push.ok' : 'file-push.failed', entry);

  return { ok: result?.ok || false, pushId, filename, destination: route.destination,
           label: route.label, detail: result, durationMs: entry.durationMs };
}

// ── Push to a remote peer ─────────────────────────────────────────────────────
async function pushToPeer(peerId, filename, content, opts = {}) {
  const { orchUrl = 'http://127.0.0.1:9000' } = opts;
  const body = JSON.stringify({ filename, content, source: 'peer-push' });
  return _post(`${orchUrl}/api/remote/${peerId}/api/push/file`, body);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function _post(url, body) {
  const { URL: NURL } = require('url');
  const http  = require('http');
  const https = require('https');
  const u     = new NURL(url);
  const mod   = u.protocol === 'https:' ? https : http;
  const buf   = Buffer.from(body);

  return new Promise((resolve) => {
    const req = mod.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(_) { resolve({ ok: res.statusCode < 300 }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(buf);
    req.end();
  });
}

function _log(jaaInsert, type, payload) {
  if (jaaInsert) {
    try {
      jaaInsert('event_log', {
        uuid: require('crypto').randomUUID(),
        type: MODULE_ID + '.' + type,
        payload, source: MODULE_ID, ts: Date.now(), causedBy: null,
      });
    } catch(_) {}
  }
}

module.exports = { processPush, pushToPeer, routeFor, ROUTES, MODULE_ID };
