'use strict';
/**
 * lib/economy/store.js — where the economy's policy lives: <data>/economy/policy.json. §0.39.281 (EC0's persistence).
 * comp_id: nexus.lib.economy.store
 * UUID: nexus-lib-economy-store-v1-0000-2026-0929-jamesbrooks-001
 * load(providers) → the stored policy normalized for the providers that exist now (defaults if none stored);
 * save(patch, providers, { by }) → merge, normalize, write (the previous policy kept as policy.prev.json — nothing
 * lost), returns { policy, dropped }. Guardian's POST /api/economy is the writer; readers only load.
 */
const fs = require('fs');
const path = require('path');
const P = require('./policy.js');
const L = require('./ledger.js');

function file() { return path.join(L.dir(), 'policy.json'); }
function _providers(given) { if (given) return given; try { return require('../agent-providers.js').all().filter(p => p !== 'copilot'); } catch (_) { return ['ollama']; } }

function load(providers = null) {
  const ps = _providers(providers);
  let stored = null;
  try { stored = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (_) {}
  return stored ? P.normalize(stored, ps).policy : P.defaults(ps);
}

function save(patch = {}, providers = null, { by = 'unknown' } = {}) {
  const ps = _providers(providers);
  const cur = load(ps);
  const r = P.merge(cur, patch, ps);
  r.policy.updatedAt = Date.now(); r.policy.updatedBy = by;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  try { if (fs.existsSync(file())) fs.copyFileSync(file(), path.join(path.dirname(file()), 'policy.prev.json')); } catch (_) {}
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(r.policy, null, 2)); fs.renameSync(tmp, file());
  return r;
}

module.exports = { load, save, file, MODULE_ID: 'nexus.lib.economy.store', VERSION: '1.0.0' };
