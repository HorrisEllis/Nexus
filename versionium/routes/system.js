'use strict';
/**
 * versionium/routes/system.js
 * GET /health, GET /contract, OPTIONS *
 */
const config = require('../config.js');
const { json } = require('../lib/http-utils.js');

async function handle(req, res, { method, pathname }) {
  if (method === 'OPTIONS') { json(res, 200, {}); return true; }

  if (pathname === '/contract') {
    json(res, 200, require('../registry-components'));
    return true;
  }

  if (pathname === '/health') {
    json(res, 200, {
      ok: true,
      system: config.SYSTEM_ID,
      version: config.VERSION,
    });
    return true;
  }

  return false;
}

module.exports = { handle };
