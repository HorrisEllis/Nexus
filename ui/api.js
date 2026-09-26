/**
 * ui/api.js — NEXUS Transport Layer
 * UUID: nexus-ui-api-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Generic fetch wrapper, SSE manager, NCP channel, job polling.
 * Zero UI logic. Zero global side effects except the SSE managers
 * stored on the exported object.
 *
 * Every call returns { ok: bool, data: any, error: string|null }.
 * No unhandled throws cross this boundary.
 *
 * §AXIOM: CLI = UI = API.
 * §1.2  Nothing silently fails.
 * §2.1  Persistence first — reads from cortex, writes to cortex.
 */

'use strict';

// contracts.js must be loaded before this file (sets window.NX in browser)
// or required first in Node.
const C = (typeof window !== 'undefined' ? window.NX : require('./contracts'));

// ── Core fetch wrapper ────────────────────────────────────────────────────────

/**
 * nx_fetch — wraps fetch with timeout, JSON parse, and normalised
 * { ok, data, error } return.
 *
 * @param {string} url
 * @param {object} opts       — standard fetch init, plus:
 * @param {number} opts.timeoutMs   — abort after N ms (default TIMEOUTS.read)
 * @param {any}    opts.body        — auto-serialised to JSON string
 * @returns {Promise<{ok: boolean, data: any, error: string|null}>}
 */
async function nx_fetch(url, opts = {}) {
  const { timeoutMs = C.TIMEOUTS.read, body, ...rest } = opts;
  const controller = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const init = {
    ...rest,
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
  };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const res = await fetch(url, init);
    if (timer) clearTimeout(timer);

    // Try JSON first, fall back to text
    let data;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { data = await res.json(); }
      catch { data = { raw: await res.text() }; }
    } else {
      data = { raw: await res.text() };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      return { ok: false, data, error: msg };
    }
    return { ok: true, data, error: null };

  } catch (err) {
    if (timer) clearTimeout(timer);
    const isAbort = err.name === 'AbortError';
    return {
      ok: false,
      data: null,
      error: isAbort ? `timeout after ${timeoutMs}ms` : err.message,
    };
  }
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

const get  = (url, opts = {}) => nx_fetch(url, { method: 'GET',    ...opts });
const post = (url, body, opts = {}) => nx_fetch(url, { method: 'POST', body, ...opts });
const patch= (url, body, opts = {}) => nx_fetch(url, { method: 'PATCH', body, ...opts });
const del  = (url, opts = {}) => nx_fetch(url, { method: 'DELETE', ...opts });

// ── Health checks ─────────────────────────────────────────────────────────────

async function health(system) {
  const urls = {
    orchestrator: C.ORCH.health,
    cortex:       C.CORTEX.health,
    guardian:     C.GUARDIAN.health,
    idearium:     C.IDEARIUM.health,
    ollama:       C.OLLAMA.health,
  };
  const url = urls[system];
  if (!url) return { ok: false, data: null, error: `unknown system: ${system}` };
  return get(url, { timeoutMs: C.TIMEOUTS.health });
}

async function healthAll() {
  const systems = ['orchestrator','cortex','guardian','idearium','ollama'];
  const results = await Promise.allSettled(systems.map(s => health(s)));
  const out = {};
  systems.forEach((s, i) => {
    const r = results[i];
    out[s] = r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message };
  });
  return out;
}

// ── Guardian — job dispatch (three-leg async) ─────────────────────────────────

/**
 * dispatchJob — POST /command, then poll until complete or timeout.
 *
 * @param {object} opts
 * @param {string} opts.provider    — 'claude'|'chatgpt'|'ollama'
 * @param {string} opts.command     — 'code'|'analyze'|'generate'|...
 * @param {string} opts.prompt
 * @param {string} [opts.content]
 * @param {function} [opts.onStatus] — called with { status, jobId } on each poll
 * @returns {Promise<{ok, jobId, response, status, error}>}
 */
async function dispatchJob({ provider, command = 'code', prompt, content = '', onStatus } = {}) {
  if (!prompt) return { ok: false, error: 'prompt required' };

  // Leg 1 — dispatch
  const d = await post(C.GUARDIAN.command, { provider, command, prompt, content },
    { timeoutMs: C.TIMEOUTS.dispatch });
  if (!d.ok) return { ok: false, error: d.error, jobId: null };

  const jobId = d.data?.jobId;
  if (!jobId) return { ok: false, error: 'no jobId returned', data: d.data };

  // Leg 2 — poll until complete
  for (let i = 0; i < C.POLL.maxPolls; i++) {
    await sleep(C.POLL.intervalMs);
    const s = await get(C.GUARDIAN.jobStatus(jobId), { timeoutMs: C.TIMEOUTS.poll });
    if (!s.ok) continue;  // transient — keep polling

    const { status, complete } = s.data;
    onStatus?.({ status, jobId, poll: i });

    if (complete || status === C.JOB_STATES.COMPLETE || status === C.JOB_STATES.DONE) {
      // Leg 3 — fetch response
      const r = await get(C.GUARDIAN.jobResponse(jobId), { timeoutMs: C.TIMEOUTS.read });
      return {
        ok: r.ok,
        jobId,
        response: r.data?.response || '',
        status,
        error: r.ok ? null : r.error,
      };
    }

    if (status === C.JOB_STATES.FAILED || status === C.JOB_STATES.ERROR) {
      return { ok: false, jobId, response: '', status, error: 'job failed' };
    }
  }

  return { ok: false, jobId, response: '', status: 'timeout',
    error: `job did not complete within ${C.POLL.maxPolls * C.POLL.intervalMs}ms` };
}

/**
 * dispatchSpec — POST /command with spec body for SEAM queue.
 * Returns { ok, queueId, total, status } immediately — does not poll.
 */
async function dispatchSpec({ specText, provider = 'claude', title, splitOn, maxChunkSize } = {}) {
  if (!specText) return { ok: false, error: 'specText required' };
  return post(C.GUARDIAN.command, { specText, provider, title, splitOn, maxChunkSize },
    { timeoutMs: C.TIMEOUTS.dispatch });
}

/**
 * cliExec — POST /cli/exec with raw command string.
 * Valid commands: jobs, artifacts, gaps, sessions, providers,
 *                 health, stats, ledger, settings, set, send, seam, version, bus
 * AI dispatch: 'send <provider> <prompt>'
 */
async function cliExec(command) {
  return post(C.GUARDIAN.cliExec, { command },
    { timeoutMs: C.TIMEOUTS.write });
}

// ── Cortex — memory read/write ────────────────────────────────────────────────

/** Read events from cortex event_log */
async function cortexEvents(n = 50) {
  return get(`${C.CORTEX.events}?n=${n}`, { timeoutMs: C.TIMEOUTS.read });
}

/** Read from any JAA table via cortex memory endpoint */
async function cortexMemory(table, n = 50) {
  return get(`${C.CORTEX.memory}?table=${encodeURIComponent(table)}&n=${n}`,
    { timeoutMs: C.TIMEOUTS.read });
}

/** Write an event to cortex event_log */
async function cortexEmit(type, payload, source = 'nexus-ui') {
  return post(C.CORTEX.event, { type, payload, source, ts: Date.now() },
    { timeoutMs: C.TIMEOUTS.write });
}

/** Get open gaps from cortex */
async function cortexGaps(status = 'open') {
  return get(`${C.CORTEX.gaps}?status=${status}`, { timeoutMs: C.TIMEOUTS.read });
}

// ── Idearium ──────────────────────────────────────────────────────────────────

async function listIdeas(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return get(`${C.IDEARIUM.ideas.list}${qs ? '?' + qs : ''}`,
    { timeoutMs: C.TIMEOUTS.read });
}

async function createIdea(text, tags = [], compartment = null) {
  const r = await post(C.IDEARIUM.ideas.create, { text, tags, compartment },
    { timeoutMs: C.TIMEOUTS.write });
  // §AXIOM: ideas also written to cortex project_registry
  if (r.ok && r.data?.idea) {
    cortexEmit('idea.created', { uuid: r.data.idea.uuid, text, tags }, 'idearium')
      .catch(() => {});
  }
  return r;
}

async function ideaPhase(uuid, phase) {
  const r = await post(C.IDEARIUM.ideas.phase(uuid), { phase },
    { timeoutMs: C.TIMEOUTS.write });
  if (r.ok) {
    cortexEmit('idea.phase.changed', { uuid, phase }, 'idearium').catch(() => {});
  }
  return r;
}

// ── SSE Manager ───────────────────────────────────────────────────────────────

/**
 * SSEChannel — manages a single EventSource connection with auto-reconnect.
 *
 * @param {string} url
 * @param {object} handlers  — { onEvent(data), onOpen(), onError(err) }
 * @param {object} [opts]    — { reconnectMs: 3000 }
 */
class SSEChannel {
  constructor(url, handlers = {}, opts = {}) {
    this.url          = url;
    this.handlers     = handlers;
    this.reconnectMs  = opts.reconnectMs ?? 3000;
    this._es          = null;
    this._dead        = false;
    this._retryTimer  = null;
    this.connected    = false;
    this.retries      = 0;
  }

  open() {
    if (this._dead) return;
    this._cleanup();

    try {
      this._es = new EventSource(this.url);
    } catch (err) {
      this.handlers.onError?.(err);
      this._scheduleRetry();
      return;
    }

    this._es.onopen = () => {
      this.connected = true;
      this.retries   = 0;
      this.handlers.onOpen?.();
    };

    this._es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this.handlers.onEvent?.(data);
      } catch {
        this.handlers.onEvent?.({ raw: ev.data });
      }
    };

    this._es.onerror = () => {
      this.connected = false;
      this.handlers.onError?.(new Error('SSE connection error'));
      this._cleanup();
      if (!this._dead) this._scheduleRetry();
    };
  }

  close() {
    this._dead = true;
    this._cleanup();
  }

  _cleanup() {
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._es) {
      try { this._es.close(); } catch {}
      this._es = null;
    }
    this.connected = false;
  }

  _scheduleRetry() {
    if (this._dead) return;
    this.retries++;
    const delay = Math.min(this.reconnectMs * Math.min(this.retries, 5), 30000);
    this._retryTimer = setTimeout(() => this.open(), delay);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** uid — short unique id for request tracking */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Export ────────────────────────────────────────────────────────────────────

const API = {
  // Core
  fetch: nx_fetch, get, post, patch, del,
  sleep, uid,

  // System
  health, healthAll,

  // Guardian
  dispatchJob, dispatchSpec, cliExec,

  // Cortex
  cortexEvents, cortexMemory, cortexEmit, cortexGaps,

  // Idearium
  listIdeas, createIdea, ideaPhase,

  // SSE
  SSEChannel,
};

if (typeof window !== 'undefined') window.NX_API = API;
if (typeof module !== 'undefined') module.exports = API;
