'use strict';
/**
 * clear-glass/ncp-client.js — Clear Glass as a sovereign NCP provider
 * UUID: nexus-clearglass-ncp-client-v1-0000-2026-0709-jamesbrooks-001
 * Version: 1.0.0
 *
 * §GAP CLOSED 2026-07-09 — guardian/ask.js was built around "a browser tab
 * connects via NCP" without ever asking WHICH browser. Checked: clear-glass/
 * contained no NCP client, and guardian/server.js contained zero references
 * to Clear Glass. The assumption had already leaked into user-facing text
 * ("no browser tab available"), which means it had become part of the
 * product's contract while still being unverified.
 *
 * §THE ARCHITECTURAL POINT — Clear Glass is a browser. It drives claude.ai
 * or chatgpt.com. It therefore connects under those SAME provider names
 * ('claude', 'chatgpt'), not a new one. RAID's provider vocabulary, the job
 * queue, and pendingQueue keys all stay exactly as they are. What changes is
 * WHO holds the tab: a sovereign Electron browser instead of a userscript in
 * someone else's Chrome. No new provider concept is invented — that would
 * have been a competing truth layer.
 *
 * §PROTOCOL (read from guardian/lib/ncp.js, not guessed):
 *   1. GET  /channel?provider=X&tabId=Y  -> SSE. First frame: NCP_READY.
 *   2. Server pushes: { type:'GUARDIAN_JOB', jobId, command, provider, prompt, content }
 *   3. Client POSTs:  /result { type:'GUARDIAN_COMPLETE', provider, jobId, text }
 *      (guardian reads `text || content`, then sets job.responseText + status:'complete')
 *
 * §NEVER FABRICATES — `answer(prompt, job)` is INJECTED. In real Clear Glass
 * it drives the renderer and reads the page. If no answerer is wired, this
 * client posts a GUARDIAN_ERROR rather than inventing text. §1.3: an
 * answerer that returns a canned string would be a stub in production, and
 * would silently poison every downstream consumer of job.responseText.
 *
 * §RECONNECT — exponential backoff, capped. guardian/lib/ncp.js documents a
 * real "flickering" race (§23.12) caused by naive reconnect churn; this does
 * not reconnect faster than that fix assumes.
 */
const http = require('http');
const { randomUUID } = require('crypto');

const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820', 10);

class ClearGlassProvider {
  /**
   * @param {object} opts
   *   provider — which site this browser is driving: 'claude' | 'chatgpt' | ...
   *   answer   — async (prompt, job) => string. REQUIRED. No default.
   *   tabId    — stable id for this tab; random if absent.
   */
  constructor({ provider, answer, tabId, host = GUARDIAN_HOST, port = GUARDIAN_PORT } = {}) {
    if (!provider) throw new Error('[clear-glass/ncp] provider required (e.g. "claude")');
    if (typeof answer !== 'function') {
      throw new Error('[clear-glass/ncp] answer(prompt, job) required — refusing to connect a provider that cannot actually answer');
    }
    this.provider = provider;
    this.answer   = answer;
    this.tabId    = tabId || randomUUID();
    this.host = host;
    this.port = port;

    this._req = null;
    this._closed = false;
    this._backoffMs = 1000;
    this._maxBackoffMs = 30000;
    this.onReady = null;   // optional observers
    this.onJob   = null;
  }

  connect() {
    if (this._closed) return;
    const path = `/channel?provider=${encodeURIComponent(this.provider)}&tabId=${encodeURIComponent(this.tabId)}`;
    const req = http.get({ host: this.host, port: this.port, path, headers: { Accept: 'text/event-stream' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        return this._scheduleReconnect(`channel returned HTTP ${res.statusCode}`);
      }
      this._backoffMs = 1000; // a real connection resets backoff
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
          this._onMessage(msg);
        }
      });
      res.on('end',   () => this._scheduleReconnect('channel ended'));
      res.on('error', e => this._scheduleReconnect(e.message));
    });
    req.on('error', e => this._scheduleReconnect(e.message));
    this._req = req;
  }

  close() {
    this._closed = true;
    try { this._req?.destroy(); } catch (_) {}
  }

  _scheduleReconnect(reason) {
    if (this._closed) return;
    const wait = this._backoffMs;
    this._backoffMs = Math.min(this._backoffMs * 2, this._maxBackoffMs);
    const t = setTimeout(() => this.connect(), wait);
    if (t.unref) t.unref();
    // §1.2 — a dropped channel is reported, never swallowed into silence.
    console.warn(`[clear-glass/ncp] channel lost (${reason}); reconnecting in ${wait}ms`);
  }

  async _onMessage(msg) {
    if (msg.type === 'NCP_READY') {
      console.log(`[clear-glass/ncp] ready as provider '${this.provider}' (tab ${this.tabId.slice(0, 8)})`);
      this.onReady?.(msg);
      return;
    }
    if (msg.type !== 'GUARDIAN_JOB') return;

    this.onJob?.(msg);
    try {
      const text = await this.answer(msg.prompt, msg);
      if (!text) {
        // An answerer that produced nothing is a failure, not an empty success.
        return this._post({ type: 'GUARDIAN_ERROR', provider: this.provider, jobId: msg.jobId, error: 'answerer returned no text' });
      }
      await this._post({ type: 'GUARDIAN_COMPLETE', provider: this.provider, jobId: msg.jobId, text });
    } catch (e) {
      await this._post({ type: 'GUARDIAN_ERROR', provider: this.provider, jobId: msg.jobId, error: e.message });
    }
  }

  _post(body) {
    return new Promise(resolve => {
      const b = JSON.stringify(body);
      const req = http.request({
        host: this.host, port: this.port, path: '/result', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
      }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', e => { console.warn('[clear-glass/ncp] result POST failed:', e.message); resolve(); });
      req.write(b); req.end();
    });
  }
}

module.exports = { ClearGlassProvider };
