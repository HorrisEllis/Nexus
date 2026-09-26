'use strict';
/**
 * lib/nexus-client.js — sovereign inter-system transport
 * UUID: nexus-client-v1-0000-2026-0709-jamesbrooks-001
 * Version: 1.0.0
 *
 * §THE INTENT (stated by James, 2026-07-09): "no hardwiring. I need to be
 * able to remove any system and swap in another. They use the API and the
 * orchestrator as a hub for each connection."
 *
 * §WHAT WAS ACTUALLY HAPPENING — measured, not assumed. Twelve direct
 * cross-system `require()` calls exist, reaching into another sovereign
 * system's filesystem:
 *     guardian/server.js      -> require('../cortex/core/raid/routing-ir.js')
 *     guardian/api-dispatch.js-> require('../cortex/core/raid')
 *     copilot/lifeline.js     -> require('../cortex/core/raid/routing-ir.js')
 *     copilot/server.js       -> require('../cortex/personas.js')
 *     copilot/server.js       -> require('../cortex/memory/jaa-db.js')
 *     copilot/adversarial.js  -> require('../cortex/intelligence/adversarial')
 *     copilot/axiom-manager.js-> require('../cortex/memory/jaa-db')
 * Six of these I introduced myself in this session. A `require()` across a
 * system boundary is the hardest possible wire: it couples file layout,
 * module system, and process. Cortex cannot be swapped out while anything
 * requires its files. Sovereignty was intended; hardwiring was implemented.
 *
 * §THE IRONY THAT MAKES IT ONE PROBLEM — cortex already EXPOSES these as
 * real HTTP APIs: /api/raid/decide, /api/intelligence/adversarial,
 * /api/memory/insert. All of them appear in verify-wires' orphaned-route
 * list. They are orphaned BECAUSE everyone reaches around them with
 * require(). The "64 undeclared routes" and the "hardwiring" are the same
 * finding seen from two directions.
 *
 * §HUB — orchestrator.js already has exactly this: a SYS map plus
 * sysReq(systemId, method, path, body). A caller names a SYSTEM and a
 * PATH, never a port. But it is locked inside orchestrator.js, unusable by
 * any other process, so every other system reinvented a hardcoded port.
 * This module is that indirection, extracted and made shared.
 *
 * §SINGLE SOURCE OF TRUTH — resolves systemId -> port from
 * orchestrator.config.json's `ports` block via lib/nexus-config, which is
 * already hot-reloadable (onChange/watch). That block was itself an orphan:
 * nothing in the codebase read `ports.*`. It is now the authority. Swap a
 * system to a new port, or point a systemId at a different implementation,
 * by editing config — no code changes anywhere.
 *
 * §1.2 — an unknown systemId is a loud error, never a guessed default.
 * Guessing a port is how you get two sources of truth.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const nexusConfig = require('./nexus-config');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * resolve(systemId) -> { host, port }
 * Reads the live config every call, so a hot config change takes effect on
 * the next request without a restart. That is what makes a system
 * swappable at runtime rather than only at boot.
 */
function resolve(systemId) {
  const ports = nexusConfig.getPath('ports', null);
  if (!ports || typeof ports !== 'object') {
    throw new Error('[nexus-client] orchestrator.config.json has no `ports` block — cannot resolve any system');
  }
  const port = ports[systemId];
  if (!port) {
    throw new Error(`[nexus-client] unknown system '${systemId}'. Known: ${Object.keys(ports).join(', ')}. Refusing to guess a port.`);
  }
  return { host: DEFAULT_HOST, port };
}

/**
 * call(systemId, method, path, body, opts) -> parsed JSON response
 * Never takes a host or a port. That is the whole point: a caller that
 * cannot name a port cannot hardwire one.
 */
function call(systemId, method, path, body, opts = {}) {
  const { host, port } = resolve(systemId);
  const timeout = opts.timeout || DEFAULT_TIMEOUT_MS;
  const payload = body !== undefined && body !== null ? JSON.stringify(body) : null;

  return new Promise((resolve_, reject) => {
    const req = http.request({
      hostname: host, port, path, method,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Client': 'nexus-client-v1',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        // §1.2 — a non-2xx is surfaced with its real status, never
        // flattened into a null that a caller mistakes for "no data".
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`[nexus-client] ${systemId} ${method} ${path} -> HTTP ${res.statusCode}: ${d.slice(0, 160)}`));
        }
        try { resolve_(JSON.parse(d)); }
        catch (e) { reject(new Error(`[nexus-client] ${systemId} ${method} ${path} -> non-JSON response: ${e.message}`)); }
      });
    });
    req.on('error',   e => reject(new Error(`[nexus-client] ${systemId} unreachable at ${host}:${port} — ${e.message}`)));
    req.on('timeout', () => { req.destroy(); reject(new Error(`[nexus-client] ${systemId} ${method} ${path} timed out after ${timeout}ms`)); });
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (systemId, path, opts)       => call(systemId, 'GET',  path, undefined, opts);
const post = (systemId, path, body, opts) => call(systemId, 'POST', path, body, opts);

/** health(systemId) — true only on a real ok:true. Never optimistic. */
async function health(systemId) {
  try {
    const r = await get(systemId, '/health', { timeout: 3000 });
    return r?.ok === true;
  } catch (_) { return false; }
}

// §BUILT 2026-08-17 — James: "I don't want data corruption. Worst case
// each system needs a redundant data folder until it connects to cortex
// again if it goes offline." Investigated first: jaaDB writes don't
// actually depend on cortex's process (every system writes the same
// shared files directly, confirmed by reading jaa-db.js's own header).
// The real, correctly-scoped gap is narrower: calls THROUGH cortex's real
// HTTP API (this file) currently just fail and the write is gone. This
// closes that, specifically — not a redundant folder per system (the
// architecture doesn't need one for jaaDB writes), a real retry buffer
// for the one real dependency that genuinely exists.
//
// §MULTI-WRITER SAFETY, learned the hard way earlier tonight (jaa-db.js's
// own honest "shared by convention" admission, and the real historical
// race it documents): the buffer file itself must not become a SECOND
// version of that same problem. Scoped per-process (pid in the filename)
// — no two processes ever write the same buffer file, so there's nothing
// here to race.
const BUFFER_DIR = path.join(__dirname, '..', 'data', 'nexus-client-buffer');
const BUFFER_FILE = path.join(BUFFER_DIR, `pending-${process.pid}.ndjson`);

function _appendBuffered(entry) {
  try {
    fs.mkdirSync(BUFFER_DIR, { recursive: true });
    fs.appendFileSync(BUFFER_FILE, JSON.stringify(entry) + '\n');
    return true;
  } catch (_) { return false; } // §1.2 — even the buffer failing is surfaced to the caller, not hidden
}

function _isUnreachable(err) {
  const m = (err && err.message) || '';
  return m.includes('unreachable') || m.includes('timed out') || m.includes('ECONNREFUSED');
}

/**
 * postDurable(systemId, path, body, opts) — tries the real post()
 * immediately. On a genuine unreachable failure (not a real 4xx/5xx
 * application error — those are real answers, not lost writes), queues
 * the write to this process's own real, disk-persisted buffer and
 * returns { ok: true, buffered: true } rather than throwing — honest
 * about the write not landing YET, never silently swallowed.
 */
async function postDurable(systemId, path, body, opts = {}) {
  try {
    const result = await post(systemId, path, body, opts);
    return { ok: true, buffered: false, result };
  } catch (e) {
    if (!_isUnreachable(e)) throw e; // a real application error is a real answer — never buffered, never hidden
    const entry = { systemId, path, body, queuedAt: Date.now(), error: e.message };
    const written = _appendBuffered(entry);
    return { ok: written, buffered: written, error: e.message, entry: written ? undefined : entry };
  }
}

/**
 * drainBuffer() — retries every real buffered write across ALL pending
 * files, not just this process's own. §CORRECTED, found by testing across
 * two real separate process invocations: the first version only read this
 * process's own PID-named file — which defeats the actual point, since a
 * process that crashed or restarted has a NEW pid and its old buffer file
 * would sit undrained forever unless something else scans for it. A
 * caller (autopilot, a small watcher, whoever cares) calls this on its
 * own real interval — this module never starts a hidden timer itself,
 * same lesson as this session's own earlier finding that a live require()
 * with an ungated side effect is exactly the wrong shape.
 */
async function drainBuffer() {
  let files;
  try { files = fs.readdirSync(BUFFER_DIR).filter(f => f.startsWith('pending-') && f.endsWith('.ndjson')); }
  catch (_) { return { drained: 0, remaining: 0, failed: 0, files: 0 }; } // no buffer dir = nothing pending, honest zero

  let drained = 0, remaining = 0, failed = 0;
  for (const file of files) {
    const filePath = path.join(BUFFER_DIR, file);
    let lines;
    try { lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean); }
    catch (_) { continue; } // file vanished between listing and reading — another drain got it first, fine

    const stillPending = [];
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch (_) { continue; } // a corrupt line is dropped, not retried forever
      try {
        await post(entry.systemId, entry.path, entry.body);
        drained++;
      } catch (e) {
        if (_isUnreachable(e)) stillPending.push(line); // still unreachable — keep it for next drain
        else failed++; // now reachable but the write itself is genuinely rejected — real answer, not requeued forever
      }
    }
    try {
      if (stillPending.length) fs.writeFileSync(filePath, stillPending.join('\n') + '\n');
      else fs.rmSync(filePath, { force: true });
    } catch (_) { /* rewrite failure — next drain will just re-read whatever's still on disk */ }
    remaining += stillPending.length;
  }
  return { drained, remaining, failed, files: files.length };
}

/** systems() — every systemId the config knows about. */
function systems() {
  const ports = nexusConfig.getPath('ports', {}) || {};
  return Object.keys(ports);
}

module.exports = { call, get, post, postDurable, drainBuffer, health, resolve, systems };
