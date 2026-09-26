'use strict';

/**
 * URL Listener
 * Add a listener for any URL pattern — fires a NEXUS hook on match.
 * Supports glob patterns, regex, and exact match.
 * Per-agent or global scope.
 * 
 * Usage:
 *   driver.exec({ action: 'url.listen', pattern: '*://api.openai.com/*', hook: 'openai.request' })
 *   driver.exec({ action: 'url.listen', pattern: /claude\.ai\/api/, hook: 'claude.api', agentId: 'x' })
 */

const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.

class UrlListener {
  constructor({ sse, seam, ctxMgr }) {
    this.sse    = sse;
    this.seam   = seam;
    this.ctxMgr = ctxMgr;
    this.listeners = new Map(); // listenerId → ListenerDef
  }

  // ── Add listener ──────────────────────────────────────────────────────
  add({ pattern, hook, agentId = '*', intercept = false, capture = [], label }) {
    const id  = uuidv4();
    const def = {
      id,
      pattern:   this._compilePattern(pattern),
      patternRaw: String(pattern),
      hook,
      agentId,
      intercept,  // if true, can cancel/redirect the request
      capture,    // ['requestHeaders', 'responseHeaders', 'body']
      label:     label || hook || pattern,
      hits:      0,
      createdAt: Date.now(),
    };

    this.listeners.set(id, def);
    this._attach(def);

    this.sse.emit('url.listener.added', {
      id, pattern: def.patternRaw, hook, agentId, label: def.label, ts: Date.now(),
    });

    console.log(`[URLListener] Added: ${def.patternRaw} → ${hook} (${agentId})`);
    return { listenerId: id, pattern: def.patternRaw };
  }

  // ── Remove listener ───────────────────────────────────────────────────
  remove(listenerId) {
    const def = this.listeners.get(listenerId);
    if (!def) return { error: 'Not found' };
    this.listeners.delete(listenerId);
    // Re-attach remaining listeners (Electron doesn't support per-filter removal)
    this._reattachAll();
    this.sse.emit('url.listener.removed', { id: listenerId, ts: Date.now() });
    return { removed: listenerId };
  }

  // ── List ──────────────────────────────────────────────────────────────
  list(agentId) {
    const all = [...this.listeners.values()];
    return agentId ? all.filter(l => l.agentId === agentId || l.agentId === '*') : all;
  }

  // ── Attach to Electron session ────────────────────────────────────────
  _attach(def) {
    const contexts = def.agentId === '*'
      ? this.ctxMgr.list().map(c => c.id)
      : [def.agentId];

    for (const ctxId of contexts) {
      const ses = this.ctxMgr.getSession(ctxId);
      if (!ses) continue;
      this._attachToSession(ses, ctxId, def);
    }
  }

  _attachToSession(ses, agentId, def) {
    // Monitor all requests
    ses.webRequest.onBeforeRequest((details, callback) => {
      if (!def.pattern.test(details.url)) {
        callback({});
        return;
      }

      def.hits++;

      const event = {
        listenerId: def.id,
        label:      def.label,
        hook:       def.hook,
        agentId,
        url:        details.url,
        method:     details.method,
        resourceType: details.resourceType,
        frameUrl:   details.frameUrl,
        requestId:  details.id,
        ts:         Date.now(),
      };

      // Fire SSE event
      this.sse.emit('url.match', event);

      // Fire NEXUS hook
      if (def.hook && this.seam) {
        this.seam.dispatch(def.hook, event).catch(() => {});
      }

      // Cancel if intercept mode
      if (def.intercept) {
        callback({ cancel: true });
      } else {
        callback({});
      }
    });

    // Capture response headers if requested
    if (def.capture.includes('responseHeaders')) {
      ses.webRequest.onHeadersReceived((details, callback) => {
        if (!def.pattern.test(details.url)) {
          callback({});
          return;
        }

        this.sse.emit('url.response', {
          listenerId:      def.id,
          agentId,
          url:             details.url,
          statusCode:      details.statusCode,
          responseHeaders: details.responseHeaders,
          ts:              Date.now(),
        });

        callback({ responseHeaders: details.responseHeaders });
      });
    }

    // Capture request headers if requested
    if (def.capture.includes('requestHeaders')) {
      ses.webRequest.onSendHeaders((details) => {
        if (!def.pattern.test(details.url)) return;
        this.sse.emit('url.request.headers', {
          listenerId:     def.id,
          agentId,
          url:            details.url,
          requestHeaders: details.requestHeaders,
          ts:             Date.now(),
        });
      });
    }
  }

  _reattachAll() {
    for (const def of this.listeners.values()) {
      this._attach(def);
    }
  }

  // ── Pattern compiler ──────────────────────────────────────────────────
  _compilePattern(pattern) {
    if (pattern instanceof RegExp) return pattern;

    if (typeof pattern === 'string') {
      // Glob-style: *://api.openai.com/* → regex
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex specials except *
        .replace(/\*/g, '.*');                     // * → .*
      return new RegExp(escaped, 'i');
    }

    return /.*/; // match all as fallback
  }
}

module.exports = UrlListener;
