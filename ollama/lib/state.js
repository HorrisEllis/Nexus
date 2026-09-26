'use strict';
/**
 * ollama/lib/state.js
 * All shared, mutable, in-process state for the Ollama bridge, in one place.
 * Every route/dispatch module requires this instead of holding its own
 * copy — there is exactly one queue, one running map, one channel set,
 * for the life of the process.
 */

const config = require('../config.js');

const state = {
  // Job queue
  queue:    [],          // waiting
  running:  new Map(),   // jobId → job
  complete: [],          // last 100

  // P7 standing streaming context channels — channelId → { history, lastActivity }
  channels: new Map(),

  // Uploads referenced by jobs via uploadId — bounded to 200 in the route handler
  uploads: new Map(),

  sseClients: new Set(),

  ollamaOnline: false,
  statsToday: { completed: 0, failed: 0 },

  // §RUNTIME-OVERRIDE 2026-08-23 — in-memory active-model override, set via
  // PUT /api/model. config.js's own DEFAULT_MODEL is the value on a fresh
  // boot; this only overrides it for the life of this process.
  defaultModel: config.DEFAULT_MODEL,
};

function broadcast(type, payload) {
  const msg = `data: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`;
  for (const c of state.sseClients) {
    try { c.write(msg); } catch (_) { state.sseClients.delete(c); }
  }
}

// Prune channels idle past 1 hour — a standing channel is not meant to
// outlive its actual use forever; unref'd so it never blocks process exit.
function startChannelSweep() {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, ch] of state.channels) {
      if (now - ch.lastActivity > 3600000) state.channels.delete(id);
    }
  }, 300000);
  if (sweep.unref) sweep.unref();
  return sweep;
}

module.exports = { state, broadcast, startChannelSweep };
