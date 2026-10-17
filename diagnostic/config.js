'use strict';
// diagnostic/config.js — diagnostic's configuration: diagnostic.config.json, then the environment over it (genesis 1.5.0's
// config.js). James, 2026-10-17: "the diagnostic needs to be a real system matching genasis."
const fs = require('fs');
const path = require('path');

function load(root = __dirname) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(path.join(root, 'diagnostic.config.json'), 'utf8')); } catch (_) { file = {}; }
  const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
  return {
    system: file.system || 'diagnostic',
    port: num(process.env.DIAGNOSTIC_PORT, num(file.port, 7825)),
    heartbeatMs: num(process.env.DIAGNOSTIC_HEARTBEAT_MS, num(file.heartbeatMs, 30000)),
    dataDir: path.join(root, file.dataDir || 'data'),
  };
}

module.exports = { load };
