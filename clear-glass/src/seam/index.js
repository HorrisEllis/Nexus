'use strict';
/**
 * src/seam/index.js — NEXUS registration shim
 * Version: 3.1.0 — delegates to main/index.js _registerWithNexus()
 *
 * This module is kept for gate backward-compat. Actual NEXUS registration
 * happens in main/index.js via POST /api/register on orchestrator :9000,
 * matching nc.registerWithOrchestrator() exactly.
 *
 * The old protocol (/api/seam/register on :7700) does not exist in NEXUS.
 * This shim is a no-op stub so existing gate refs don't crash.
 */

class SeamModule {
  constructor({ moduleId, uuid, sse } = {}) {
    this.moduleId   = moduleId || 'clear-glass';
    this.uuid       = uuid;
    this.sse        = sse;
    this.registered = false; // registration happens in main/index.js
  }

  // dispatch — gate hook calls come here, emit onto the bus via sse
  async dispatch(hookName, payload) {
    try {
      this.sse?.emit('hook.result', { hook: hookName, result: payload, ts: Date.now() });
      return { ok: true, hook: hookName };
    } catch (err) {
      return { error: err.message };
    }
  }

  // No-ops — lifecycle managed by main/index.js
  async register()    { return true; }
  async deregister()  { return true; }
}

module.exports = SeamModule;
