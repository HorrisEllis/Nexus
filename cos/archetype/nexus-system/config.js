'use strict';
// config.js — the system's configuration: {{slug}}.config.json, then the environment over it ({{SLUG}}_PORT,
// {{SLUG}}_HEARTBEAT_MS). Anything adjustable lives here, not in code.
const fs = require('fs');
const path = require('path');

function load(root = __dirname) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, '{{slug}}.config.json'), 'utf8'));
  const env = (k) => process.env[`{{SLUG}}_${k}`];
  if (env('PORT') !== undefined) cfg.port = Number(env('PORT'));
  if (env('HEARTBEAT_MS') !== undefined) cfg.heartbeatMs = Number(env('HEARTBEAT_MS'));
  return cfg;
}

module.exports = { load };
