'use strict';
/**
 * copilot/stream-digest.js — re-export of the shared stream digest
 * §PHASEMAP P7 2026-07-30 — the normalizer + StreamDigest class moved to
 * lib/stream-digest.js so EVERY system reads the same continuous stream (not
 * just copilot). This file re-exports it for backward compatibility — copilot's
 * P3 wire (copilot/server.js) and anything else importing from here keeps
 * working unchanged. New consumers should require('../lib/stream-digest')
 * directly. One stream, many readers (§10.3).
 */
module.exports = require('../lib/stream-digest');
