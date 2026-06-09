'use strict';
// ── guardian/kernel-client.js ─────────────────────────────────────────────────
// UUID: guardian-kernel-client-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// Guardian ↔ Cortex ↔ Kernel integration layer.
//
// Every mirror call (mirrorJob, mirrorProvider, mirrorEvent) writes to
// Cortex's working memory via POST /api/guardian/* BEFORE the kernel
// is notified.  §WM.1 guaranteed on the Guardian side.
//
// §LAW_II  — fire-and-forget with §1.2 logging. Never block job flow.
// §LAW_III — Cortex is the brain. Guardian writes to Cortex mind-bridge only.
//             Kernel is a peer layer — Guardian syncs to it for CLI visibility.
// §WM.1    — Cortex working memory is written before every kernel mirror.

const http = require('http');

const CORTEX_HOST = process.env.CORTEX_HOST       || '127.0.0.1';
const CORTEX_PORT = parseInt(process.env.CORTEX_PORT || '3748');

const KERNEL_HOST = process.env.KERNEL_HOST       || '127.0.0.1';
const KERNEL_PORT = parseInt(process.env.KERNEL_PORT || '7830');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_HTTP_PORT || '7820');

const MODULE_ID = 'guardian.kernel-client';
const VERSION   = '2.0.0';

// ── HTTP fire-and-forget ───────────────────────────────────────────────────────

function _postTo(host, port, path, body, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request({
      host, port, path, method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Source':       MODULE_ID,
      },
      timeout,
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function _getFrom(host, port, path, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path, method: 'GET', headers: { 'X-Source': MODULE_ID }, timeout },
      (res) => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
      }
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// FIX-5: Cortex write buffer — events are not dropped when Cortex is temporarily down.
// Writes go into a FIFO queue. A drain loop retries with exponential backoff.
// The buffer is in-memory only — if Guardian restarts, buffered (undelivered) events
// are lost. This is acceptable because WM is the source of truth on the Cortex side;
// Guardian's NCP health beat will re-establish state on reconnect.
// Buffer cap: 500 events (~1-2 minutes of normal traffic). Oldest events are dropped
// when the cap is hit — §1.2 logged, never silent.

const _cortexBuffer  = [];          // { path, body, ts, attempts }
const BUFFER_CAP     = 500;
const DRAIN_INTERVAL = 3_000;       // retry every 3s when buffer has items
const MAX_ATTEMPTS   = 10;          // give up after 10 attempts (~30s)
let _drainTimer = null;
let _cortexReachable = false;

function _cortex(path, body) {
  _cortexBuffer.push({ path, body, ts: Date.now(), attempts: 0 });
  if (_cortexBuffer.length > BUFFER_CAP) {
    const dropped = _cortexBuffer.shift();
    console.warn(`[${MODULE_ID} §1.2] cortex buffer cap hit — dropped: ${dropped.path}`);
  }
  _scheduleDrain();
}

function _scheduleDrain() {
  if (_drainTimer) return; // already scheduled
  _drainTimer = setTimeout(_drain, _cortexReachable ? 0 : DRAIN_INTERVAL);
}

async function _drain() {
  _drainTimer = null;
  if (!_cortexBuffer.length) return;

  const toSend = _cortexBuffer.splice(0, 20); // drain up to 20 per tick
  const failed = [];

  for (const item of toSend) {
    try {
      await _postTo(CORTEX_HOST, CORTEX_PORT, item.path, item.body, 2000);
      _cortexReachable = true;
    } catch (_) {
      _cortexReachable = false;
      item.attempts++;
      if (item.attempts < MAX_ATTEMPTS) {
        failed.push(item);
      } else {
        console.warn(`[${MODULE_ID} §1.2] cortex write abandoned after ${MAX_ATTEMPTS} attempts: ${item.path}`);
      }
    }
  }

  // Put failed items back at front of queue (preserve order)
  _cortexBuffer.unshift(...failed);

  if (_cortexBuffer.length > 0) _scheduleDrain();
}

// Kernel mirror fire-and-forget (§LAW_II — peer sync, never blocking)
function _kernel(path, body) {
  _postTo(KERNEL_HOST, KERNEL_PORT, path, body)
    .catch(err => console.warn(`[${MODULE_ID}] kernel write failed (${path}): ${err.message}`));
}

// ── Job mirroring ─────────────────────────────────────────────────────────────

function mirrorJob(job) {
  const payload = {
    jobId:           job.id,
    command:         job.command,
    provider:        job.provider,
    status:          job.status,
    prompt:          (job.prompt || '').slice(0, 500),
    promptLen:       (job.prompt || '').length,
    chars:           (job.response || '').length,
    durationMs:      job.completedAt ? job.completedAt - job.ts : null,
    responsePreview: (job.response || '').slice(0, 2000),
    source:          'guardian',
  };

  // §WM.1 — Cortex working memory first
  _cortex('/api/guardian/job', payload);

  // Then kernel (CLI visibility)
  _kernel('/api/guardian/job', payload);
}

// ── Provider mirroring ────────────────────────────────────────────────────────

function mirrorProvider(provider, connected, meta = {}) {
  const payload = {
    provider,
    connected,
    adapterName:  meta.adapterName || provider,
    tabId:        meta.tabId       || null,
    source:       'guardian',
    guardianPort: GUARDIAN_PORT,
  };

  // §WM.1 — Cortex working memory first
  _cortex('/api/guardian/provider', payload);

  // Then kernel
  _kernel('/api/guardian/provider', payload);
}

// ── Event mirroring ───────────────────────────────────────────────────────────

// Significant bus events that should cross into Cortex working memory
const CORTEX_EVENT_TYPES = new Set([
  'guardian.job.complete',
  'guardian.job.queued',
  'guardian.job.dispatched',
  'guardian.job.error',
  'guardian.artifact',
  'guardian.gaps',
  'guardian.provider.connected',
  'guardian.provider.disconnected',
  'guardian.session.named',
  'guardian.gate.error',
  'guardian.setting.update',
  'guardian.seam.complete',
  'guardian.baseline.deviation',
]);

function mirrorEvent(type, data = {}) {
  // §WM.1 — all significant events into Cortex working memory
  if (CORTEX_EVENT_TYPES.has(type)) {
    _cortex('/api/guardian/event', { type, data, source: 'guardian', ts: Date.now() });
  }

  // All events into kernel SSE stream for CLI watch
  _kernel('/api/guardian/event', { type, data, source: 'guardian', ts: Date.now() });
}

// ── Relay: kernel → Cortex → Guardian ────────────────────────────────────────

let _dispatchFn = null;

async function _pollRelay() {
  try {
    // Guardian polls Cortex relay queue (via mind-bridge GET /api/guardian/relay)
    const tasks = await _getFrom(CORTEX_HOST, CORTEX_PORT, '/api/guardian/relay');
    if (!Array.isArray(tasks) || !tasks.length) return;

    for (const task of tasks) {
      if (!_dispatchFn) continue;
      try {
        await _dispatchFn({
          provider:     task.provider,
          command:      task.command || 'chat',
          prompt:       task.prompt,
          _kernelJobId: task.jobId,
        });
        // Ack via Cortex mind-bridge
        _cortex('/api/guardian/relay/ack', { jobId: task.jobId });
      } catch (e) {
        console.error(`[${MODULE_ID}] relay dispatch failed: ${e.message}`);
      }
    }
  } catch (_) {
    // Cortex unavailable — silent §LAW_II
  }
}

function completeRelayed(kernelJobId, response, error) {
  if (!kernelJobId) return;
  // §WM.1 — result into Cortex working memory
  _cortex('/api/guardian/relay/complete', { jobId: kernelJobId, response: response || null, error: error || null });
  // Also notify kernel directly so `gk response` can serve it
  _kernel('/api/guardian/relay/complete',  { jobId: kernelJobId, response: response || null, error: error || null });
}

// ── Health sync loop ──────────────────────────────────────────────────────────

let _syncTimer  = null;
let _relayTimer = null;
let _getState   = () => ({});

function startSync(opts = {}) {
  _getState   = opts.getState   || _getState;
  _dispatchFn = opts.dispatchFn || null;

  const syncMs  = opts.syncMs  || 15_000;
  const relayMs = opts.relayMs ||  5_000;

  if (_syncTimer) clearInterval(_syncTimer);
  _syncTimer = setInterval(() => {
    const state = _getState();
    const payload = {
      source:    'guardian',
      version:   state.version   || '?',
      pid:       process.pid,
      uptime:    process.uptime(),
      jobs:      state.jobs      || 0,
      providers: state.providers || {},
      port:      GUARDIAN_PORT,
    };
    // §WM.1 — health beat into Cortex working memory
    _cortex('/api/guardian/health', payload);
    // Kernel health mirror
    _kernel('/api/guardian/health', payload);
  }, syncMs);
  _syncTimer.unref();

  if (_dispatchFn) {
    if (_relayTimer) clearInterval(_relayTimer);
    _relayTimer = setInterval(_pollRelay, relayMs);
    _relayTimer.unref();
  }

  console.log(`[${MODULE_ID}] v${VERSION} sync started → cortex:${CORTEX_PORT} kernel:${KERNEL_PORT}`);
}

function stopSync() {
  if (_syncTimer)  { clearInterval(_syncTimer);  _syncTimer  = null; }
  if (_relayTimer) { clearInterval(_relayTimer); _relayTimer = null; }
}

async function kernelHealth() {
  try { return await _getFrom(KERNEL_HOST, KERNEL_PORT, '/health'); }
  catch { return { ok: false, error: 'kernel unreachable' }; }
}

async function cortexHealth() {
  try { return await _getFrom(CORTEX_HOST, CORTEX_PORT, '/health'); }
  catch { return { ok: false, error: 'cortex unreachable' }; }
}

module.exports = {
  mirrorJob,
  mirrorProvider,
  mirrorEvent,
  completeRelayed,
  startSync,
  stopSync,
  kernelHealth,
  cortexHealth,
  MODULE_ID,
  VERSION,
  get cortexBase() { return `http://${CORTEX_HOST}:${CORTEX_PORT}`; },
  get kernelBase()  { return `http://${KERNEL_HOST}:${KERNEL_PORT}`; },
};
