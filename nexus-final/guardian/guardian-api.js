/**
 * guardian-api.js — Canonical Guardian v8 API Connector
 * -------------------------------------------------------
 * Single source of truth for all HTTP communication with guardian/server.js.
 *
 * Usage (Node.js / CommonJS):
 *   const { GuardianAPI } = require('./guardian-api');
 *   const g = new GuardianAPI();                          // reads guardian-api.config.js or env
 *   const g = new GuardianAPI({ host: '127.0.0.1', port: 7820 });
 *
 * Usage (browser / ES Module):
 *   import { GuardianAPI } from './guardian-api.js';
 *   const g = new GuardianAPI({ host: '127.0.0.1', port: 7820 });
 *
 * API surface mirrors guardian/server.js v8 exactly.
 * See FORENSIC-AUDIT.md for endpoint reference.
 *
 * @version 1.0.0
 * @author  James Brooks (Erosmancer) — rheon.world
 */

'use strict';

// ── Config resolution ─────────────────────────────────────────────────────────

function _resolveConfig(overrides = {}) {
  // 1. Try env vars (works in Node and Electron)
  const fromEnv = {
    host:     process?.env?.GUARDIAN_HOST      || '127.0.0.1',
    port:     parseInt(process?.env?.GUARDIAN_HTTP_PORT || '7820'),
    wssPort:  parseInt(process?.env?.GUARDIAN_WS_PORT   || '7821'),
    ipcToken: process?.env?.GUARDIAN_IPC_TOKEN || '',
  };

  // 2. Try guardian.config.json (Node only — silently skip in browser)
  let fromFile = {};
  if (typeof require !== 'undefined' && typeof __dirname !== 'undefined') {
    try {
      const fs   = require('fs');
      const path = require('path');
      // Walk up from this file's dir to find guardian.config.json
      let dir = __dirname;
      for (let i = 0; i < 5; i++) {
        const candidate = path.join(dir, 'guardian.config.json');
        if (fs.existsSync(candidate)) {
          const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          fromFile = {
            host:     raw.server?.host      || fromEnv.host,
            port:     raw.server?.httpPort  || fromEnv.port,
            wssPort:  raw.server?.wssPort   || fromEnv.wssPort,
          };
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
    } catch (_) { /* not in Node or config missing — env wins */ }
  }

  return { ...fromEnv, ...fromFile, ...overrides };
}

// ── GuardianAPI class ─────────────────────────────────────────────────────────

class GuardianAPI {
  /**
   * @param {object} [opts]
   * @param {string} [opts.host='127.0.0.1']
   * @param {number} [opts.port=7820]
   * @param {number} [opts.wssPort=7821]
   * @param {string} [opts.ipcToken='']
   * @param {number} [opts.defaultTimeout=10000]   ms — for quick reads
   * @param {number} [opts.dispatchTimeout=90000]  ms — for AI job completion
   * @param {number} [opts.pollInterval=600]        ms — job status polling
   * @param {number} [opts.pollMax=150]             max polls (~90s at 600ms)
   */
  constructor(opts = {}) {
    const cfg = _resolveConfig(opts);
    this.host            = cfg.host;
    this.port            = cfg.port;
    this.wssPort         = cfg.wssPort;
    this.ipcToken        = cfg.ipcToken || '';
    this.defaultTimeout  = opts.defaultTimeout  || 10_000;
    this.dispatchTimeout = opts.dispatchTimeout || 90_000;
    this.pollInterval    = opts.pollInterval    || 600;
    this.pollMax         = opts.pollMax         || 150;
    this.base            = `http://${this.host}:${this.port}`;
  }

  // ── Low-level fetch ──────────────────────────────────────────────────────────

  /**
   * Raw HTTP call. Returns parsed JSON or throws.
   * @param {string} path
   * @param {'GET'|'POST'|'PUT'|'DELETE'} method
   * @param {object|null} body
   * @param {number} timeout ms
   * @returns {Promise<object>}
   */
  async _req(path, method = 'GET', body = null, timeout = this.defaultTimeout) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const headers = { 'Content-Type': 'application/json' };
    if (this.ipcToken) headers['X-Guardian-Token'] = this.ipcToken;

    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        let msg = `Guardian ${method} ${path} → ${res.status}`;
        try { const j = await res.json(); msg += `: ${j.error || JSON.stringify(j)}`; } catch (_) {}
        throw new Error(msg);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new Error(`Guardian timeout: ${method} ${path} (${timeout}ms)`);
      throw err;
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────────

  /**
   * GET /health
   * @returns {Promise<{ok:boolean, uptime:number, jobs:number, artifacts:number, ...}>}
   */
  async health() {
    return this._req('/health');
  }

  /**
   * Returns true if Guardian is reachable.
   * @param {number} [timeout=2000]
   */
  async isOnline(timeout = 2000) {
    try { await this._req('/health', 'GET', null, timeout); return true; }
    catch (_) { return false; }
  }

  // ── Providers ─────────────────────────────────────────────────────────────────

  /**
   * GET /providers — returns connected AI providers (claude, chatgpt, gemini, ollama)
   * @returns {Promise<object>}
   */
  async providers() {
    return this._req('/providers');
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────────

  /**
   * POST /command — create an AI job.
   * @param {'claude'|'chatgpt'|'gemini'|'ollama'} provider
   * @param {string} prompt
   * @param {'code'|'chat'|'search'} [command='code']
   * @returns {Promise<{ok:boolean, jobId:string, status:string}>}
   */
  async createJob(provider, prompt, command = 'code') {
    return this._req('/command', 'POST', { provider, prompt, command });
  }

  /**
   * GET /status/:jobId
   * @param {string} jobId
   * @returns {Promise<{ok:boolean, complete:boolean, status:string, ...}>}
   */
  async jobStatus(jobId) {
    return this._req(`/status/${jobId}`);
  }

  /**
   * GET /response/:jobId
   * @param {string} jobId
   * @returns {Promise<{ok:boolean, response:string, ...}>}
   */
  async jobResponse(jobId) {
    return this._req(`/response/${jobId}`);
  }

  /**
   * GET /jobs
   * @param {object} [opts] - limit, status filter
   * @returns {Promise<{ok:boolean, jobs:Array}>}
   */
  async jobs(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/jobs${qs ? '?' + qs : ''}`);
  }

  /**
   * Dispatch an AI job and wait for completion (command → poll → response).
   * This is the replacement for the missing /api/complete endpoint.
   *
   * @param {'claude'|'chatgpt'|'gemini'|'ollama'} provider
   * @param {string} prompt
   * @param {object} [opts]
   * @param {string} [opts.command='code']
   * @param {number} [opts.timeout] - override dispatchTimeout
   * @param {Function} [opts.onChunk] - called with (text, jobId) if SSE streaming available
   * @returns {Promise<string>} — response text
   */
  async dispatch(provider, prompt, opts = {}) {
    const { command = 'code', timeout = this.dispatchTimeout, onChunk } = opts;

    // Step 1: Create job
    const created = await this.createJob(provider, prompt, command);
    if (!created.ok) throw new Error(`Guardian dispatch failed: ${JSON.stringify(created)}`);
    const jobId = created.jobId;

    // Step 2: If onChunk provided, open SSE stream in parallel
    let sseController = null;
    if (typeof onChunk === 'function' && typeof EventSource !== 'undefined') {
      try {
        const es = new EventSource(`${this.base}/stream/${jobId}`);
        sseController = es;
        es.onmessage = (e) => {
          try { const d = JSON.parse(e.data); if (d.chunk) onChunk(d.chunk, jobId); } catch (_) {}
        };
        es.onerror = () => es.close();
      } catch (_) { /* SSE unavailable — fall back to polling only */ }
    }

    // Step 3: Poll for completion
    const deadline = Date.now() + timeout;
    let polls = 0;
    while (Date.now() < deadline && polls < this.pollMax) {
      await _sleep(this.pollInterval);
      polls++;
      const st = await this.jobStatus(jobId).catch(() => null);
      if (!st) continue;
      if (st.complete || st.status === 'complete' || st.status === 'done') {
        if (sseController) sseController.close();
        // Step 4: Fetch response
        const resp = await this.jobResponse(jobId);
        return resp.response || resp.text || resp.content || '';
      }
      if (st.status === 'error' || st.status === 'failed') {
        if (sseController) sseController.close();
        throw new Error(`Guardian job ${jobId} failed: ${st.error || st.status}`);
      }
    }
    if (sseController) sseController.close();
    throw new Error(`Guardian dispatch timeout: job ${jobId} did not complete in ${timeout}ms`);
  }

  // ── Artifacts ─────────────────────────────────────────────────────────────────

  /**
   * GET /artifacts
   * @param {object} [opts] - limit, lang, chatId, account, q, after
   */
  async artifacts(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/artifacts${qs ? '?' + qs : ''}`);
  }

  /** GET /artifacts/:id */
  async artifact(id) { return this._req(`/artifacts/${id}`); }

  /** DELETE /artifacts/:id */
  async deleteArtifact(id) { return this._req(`/artifacts/${id}`, 'DELETE'); }

  /** PUT /artifacts/:id/tags  body: { tags: string[] } */
  async tagArtifact(id, tags) { return this._req(`/artifacts/${id}/tags`, 'PUT', { tags }); }

  // ── Gaps ──────────────────────────────────────────────────────────────────────

  /** GET /gaps */
  async gaps(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/gaps${qs ? '?' + qs : ''}`);
  }
  /** GET /gaps/summary */
  async gapSummary() { return this._req('/gaps/summary'); }
  /** GET /gaps/catalogue */
  async gapCatalogue() { return this._req('/gaps/catalogue'); }
  /** POST /gaps/:id/close */
  async closeGap(id) { return this._req(`/gaps/${id}/close`, 'POST'); }
  /** POST /gaps/:id/ignore */
  async ignoreGap(id) { return this._req(`/gaps/${id}/ignore`, 'POST'); }

  // ── Ledger ────────────────────────────────────────────────────────────────────

  /** GET /ledger */
  async ledger(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/ledger${qs ? '?' + qs : ''}`);
  }
  /** GET /ledger/metrics */
  async ledgerMetrics() { return this._req('/ledger/metrics'); }
  /** POST /ledger  body: ledger entry */
  async addLedgerEntry(entry) { return this._req('/ledger', 'POST', entry); }

  // ── Sessions ──────────────────────────────────────────────────────────────────

  /** GET /sessions */
  async sessions(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/sessions${qs ? '?' + qs : ''}`);
  }
  /** GET /sessions/:id */
  async session(id) { return this._req(`/sessions/${id}`); }
  /** POST /sessions/:chatId/name  body: { name } */
  async nameSession(chatId, name) { return this._req(`/sessions/${chatId}/name`, 'POST', { name }); }
  /** GET /sessions/:id/timeline */
  async sessionTimeline(id) { return this._req(`/sessions/${id}/timeline`); }

  // ── PA sessions ───────────────────────────────────────────────────────────────

  /** GET /pa */
  async paSessions(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/pa${qs ? '?' + qs : ''}`);
  }
  /** GET /pa/:id */
  async paSession(id) { return this._req(`/pa/${id}`); }

  // ── Timeline ──────────────────────────────────────────────────────────────────

  /** GET /timeline */
  async timeline(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/timeline${qs ? '?' + qs : ''}`);
  }

  // ── Settings ──────────────────────────────────────────────────────────────────

  /** GET /settings */
  async settings() { return this._req('/settings'); }
  /** GET /settings/:key */
  async getSetting(key) { return this._req(`/settings/${key}`); }
  /** PUT /settings/:key  body: { value } */
  async setSetting(key, value) { return this._req(`/settings/${key}`, 'PUT', { value }); }
  /** POST /settings/reset */
  async resetSettings() { return this._req('/settings/reset', 'POST'); }

  // ── Memory ────────────────────────────────────────────────────────────────────

  /** GET /memory/stats */
  async memoryStats() { return this._req('/memory/stats'); }
  /** GET /memory/query?q= */
  async memoryQuery(q) { return this._req(`/memory/query?q=${encodeURIComponent(q)}`); }
  /** GET /memory/context?chatId= */
  async memoryContext(chatId) {
    return this._req(`/memory/context${chatId ? '?chatId=' + encodeURIComponent(chatId) : ''}`);
  }
  /** GET /memory/artifacts */
  async memoryArtifacts(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/memory/artifacts${qs ? '?' + qs : ''}`);
  }
  /** GET /memory/ledger */
  async memoryLedger(opts = {}) {
    const qs = new URLSearchParams(opts).toString();
    return this._req(`/memory/ledger${qs ? '?' + qs : ''}`);
  }
  /** POST /memory/ingest */
  async memoryIngest(payload) { return this._req('/memory/ingest', 'POST', payload); }

  // ── SSE stream (Node.js — uses http module) ───────────────────────────────────

  /**
   * Subscribe to the cockpit SSE stream (/events).
   * Returns an object with { close() }.
   * Callback receives parsed event data.
   *
   * Node.js only (uses http module). Browser: use native EventSource.
   *
   * @param {Function} onEvent  (data: object) => void
   * @param {Function} [onError] (err: Error) => void
   * @returns {{ close: Function }}
   */
  subscribeEvents(onEvent, onError) {
    if (typeof require === 'undefined') {
      // Browser — return a native EventSource wrapper
      const es = new EventSource(`${this.base}/events`);
      es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch (_) {} };
      if (onError) es.onerror = (e) => onError(new Error('SSE error'));
      return { close: () => es.close() };
    }

    // Node.js — use http module
    const http = require('http');
    let _req = null;
    let closed = false;

    function connect() {
      if (closed) return;
      _req = http.get(`${this.base}/events`, { timeout: 0 }, (res) => {
        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString();
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { onEvent(JSON.parse(line.slice(6))); } catch (_) {}
            }
          }
        });
        res.on('end', () => { if (!closed) setTimeout(connect.bind(this), 2000); });
        res.on('error', (e) => { if (onError) onError(e); if (!closed) setTimeout(connect.bind(this), 3000); });
      });
      _req.on('error', (e) => { if (onError) onError(e); if (!closed) setTimeout(connect.bind(this), 3000); });
    }

    connect.call(this);
    return { close: () => { closed = true; _req?.destroy(); } };
  }

  // ── Convenience ───────────────────────────────────────────────────────────────

  /**
   * Returns a plain config object — useful for display / logging.
   */
  toConfig() {
    return {
      base:            this.base,
      host:            this.host,
      port:            this.port,
      wssPort:         this.wssPort,
      wssUrl:          `wss://${this.host}:${this.wssPort}`,
      defaultTimeout:  this.defaultTimeout,
      dispatchTimeout: this.dispatchTimeout,
      hasIpcToken:     !!this.ipcToken,
    };
  }

  toString() { return `GuardianAPI(${this.base})`; }
}

// ── Singleton default instance ────────────────────────────────────────────────

let _default = null;

/**
 * Get (or lazily create) the default singleton GuardianAPI instance.
 * @param {object} [opts] - only applied on first call
 * @returns {GuardianAPI}
 */
function getGuardian(opts = {}) {
  if (!_default) _default = new GuardianAPI(opts);
  return _default;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Exports ───────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GuardianAPI, getGuardian };
} else if (typeof window !== 'undefined') {
  window.GuardianAPI = GuardianAPI;
  window.getGuardian = getGuardian;
}
