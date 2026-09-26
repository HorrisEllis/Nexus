'use strict';
/**
 * src/diagnostic/error-capture.js — Clear Glass Error Capture
 * UUID: cg-error-capture-v1-0000-2026-0630-001
 *
 * §fix 2026-06-30 — built because the actual gap was found, not assumed:
 * diagnostic/engine.js is a Playwright-style TEST RUNNER (scripted
 * assertion sequences, only reports failures from tests you explicitly
 * trigger). It has zero passive error-catching. lib/error-log.js
 * (referenced in an earlier session's notes as "universal error logging")
 * doesn't exist anywhere in this tree and nothing in clear-glass ever
 * referenced it. Every error this session — the bridge handshake failures,
 * the crash loop, all of it — only ever existed as scattered console.error
 * calls, visible only if someone was staring at the right terminal at the
 * right moment. This is the actual error-capture layer that should have
 * existed from the start: catches uncaught exceptions/rejections in the
 * main process, accepts renderer-process errors via IPC, logs every one
 * with full context to a real file, and pushes them live over SSE so the
 * UI (or co-pilot) can show them as they happen instead of never.
 */

const fs   = require('fs');
const path = require('path');

class ErrorCapture {
  constructor({ sse, logDir, gapField } = {}) {
    this.sse      = sse || null;
    this.logDir   = logDir || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.clear-glass', 'errors');
    this.recent   = []; // ring buffer, last 200 — UI can ask for this on connect
    this.MAX_RECENT = 200;
    this._installed = false;
    // §R8 2026-08-12 — James: "co-pilot should be able to use clear-glass
    // to understand where the user is accessing the system and what isn't
    // working." Optional, mirroring the existing `sse` pattern exactly
    // (same constructor shape, same fire-and-forget discipline) — a real
    // caught error now ALSO reaches gap-field, not just this file's local
    // log + SSE, which had zero connection to anything else in NEXUS until
    // now.
    this.gapField = gapField || null;

    // §FIXED 2026-08-17 — James, direct evidence: a real ~228-383MB single-
    // day error log file. Root cause, confirmed by reading this file's own
    // real code: capture() had zero dedup, zero rate-limiting, and wrote a
    // FULL STACK TRACE on every single call. autopilot's own real gaps
    // table already shows clear-glass crash-looped 6 times in 5 minutes —
    // if that loop re-triggers the same uncaught exception repeatedly (a
    // real, common failure shape, not theoretical), every single
    // occurrence got a brand-new full row on disk. Real, scoped fix:
    // identical errors (same source+type+message) within a real window
    // get coalesced into a repeat counter instead of a new full row+stack.
    // The in-memory ring buffer, the real-time SSE push, and gapField's
    // own separate dedup (it already has one, confirmed by reading it)
    // are untouched — this only throttles the actual unbounded disk write.
    this._lastSig = null;
    this._lastSigCount = 0;
    this.DEDUP_WINDOW_MS = 5000;
  }

  init() {
    try { fs.mkdirSync(this.logDir, { recursive: true }); } catch (_) {}
  }

  // ── Install global handlers — call once, from main/index.js's bootstrap ──
  installMainProcessHandlers() {
    if (this._installed) return; // idempotent — safe to call more than once
    this._installed = true;

    process.on('uncaughtException', (err) => {
      this.capture({ source: 'main-process', type: 'uncaughtException',
        message: err.message, stack: err.stack, code: err.code, name: err.name });
      // §1.2 — log it, don't crash silently, but don't re-throw either;
      // an uncaught exception handler that itself throws defeats the point.
    });

    process.on('unhandledRejection', (reason, promise) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      this.capture({ source: 'main-process', type: 'unhandledRejection',
        message: err.message, stack: err.stack, code: err.code, name: err.name });
    });

    console.log(`[${new Date().toISOString()}] [clear-glass/src/diagnostic/error-capture.js] [ErrorCapture] main-process handlers installed`);
  }

  // ── Renderer-process errors arrive here via IPC (see ipc/bridge.js) ──────
  captureFromRenderer(payload) {
    return this.capture({ source: 'renderer', type: payload.type || 'rendererError',
      message: payload.message, stack: payload.stack, url: payload.url, agentId: payload.agentId });
  }

  // ── Explicit capture — for known failure points to call directly, like
  //    the bridge handshake failures this was built in response to. Doesn't
  //    require an uncaught exception; a caught-and-handled error is still
  //    worth surfacing, not just thrown ones. ────────────────────────────
  capture({ source, type, message, stack, code, name, url, agentId, extra }) {
    const row = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      isoTime: new Date().toISOString(),
      source, type, message, stack, code, name, url, agentId, extra,
    };

    this.recent.push(row);
    if (this.recent.length > this.MAX_RECENT) this.recent.shift();

    // §FIXED 2026-08-17 — real dedup on the actual disk-write path. A
    // signature is source+type+message — NOT the stack (two errors from
    // slightly different call depths but the same real cause still
    // coalesce, which is the point). First occurrence of a signature
    // (or one outside the real time window) writes a full row, same as
    // before. A repeat within the window writes a short, compact line
    // instead of a duplicate full row+stack — real information (it's
    // still on disk, still timestamped) without the unbounded growth.
    const sig = `${source}::${type}::${message}`;
    const now = row.ts;
    const isRepeat = this._lastSig === sig && (now - (this._lastSigTs || 0)) < this.DEDUP_WINDOW_MS;
    try {
      const file = path.join(this.logDir, `${new Date().toISOString().slice(0, 10)}.jsonl`);
      if (isRepeat) {
        this._lastSigCount++;
        fs.appendFileSync(file, JSON.stringify({ id: row.id, ts: row.ts, isoTime: row.isoTime, repeatOf: sig, repeatCount: this._lastSigCount }) + '\n');
      } else {
        this._lastSig = sig;
        this._lastSigCount = 1;
        fs.appendFileSync(file, JSON.stringify(row) + '\n');
      }
      this._lastSigTs = now;
    } catch (_) { /* §1.2 — logging failure shouldn't crash the app; the
                      in-memory ring buffer + SSE push below still work */ }

    console.error(`[${row.isoTime}] [ErrorCapture] [${source}:${type}] ${message}`);

    if (this.sse) {
      try { this.sse.emit('error.captured', row); } catch (_) {}
    }

    if (this.gapField) {
      try {
        this.gapField.report({
          type: 'clear-glass.renderer-error', body: message || 'unlabeled error',
          source: source || 'clear-glass', domain: 'system',
          severity: type === 'uncaughtException' ? 'high' : 'medium',
          error: stack || message, location: url || null,
          meta: { code, name, agentId, extra },
        });
      } catch (_) { /* §1.2 — same discipline as the sse push above: a gap-report failure must never break error capture itself */ }
    }

    return row;
  }

  getRecent(n = 50) {
    return this.recent.slice(-n);
  }
}

module.exports = { ErrorCapture };
