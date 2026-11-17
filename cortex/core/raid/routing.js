'use strict';
/**
 * cortex/core/raid/routing.js — RAID owns the routing (PC16 slice a, docs/2026-11-08-pipeline-canvas-phasemap.spec).
 *
 * James, 2026-11-17: "i need ideariums settings to work better. this is meant to be in raid. all of the routing. so much of idearium is
 * meant to be in the automation engine and raid." · "yes build it, then merge and push." His decisions: PC_D15 (2026-11-13) "Everything
 * routes through RAID", RL_D1 "wouldn't raid be the bridge?", RL_D1b "copilot is meant to be a hat that any agent casn wear".
 *
 * The routing policy (what Idearium kept as routing.*: mode, chain, the ladder, the breakers, the planner and reasoner, the intent map,
 * the Ollama models) is RAID's: one file in Cortex's own data (cortex/data/raid/routing.json), every change one line in
 * routing.ledger.jsonl (who, when, prior → value; §0.3). Every system reads it by Cortex's route and keeps the last copy it read on disk, so a
 * Cortex restart never takes routing down (the lesson of 2026-11-17: copilot idle-stopped took the route to Ollama with it, §5.15.3).
 *
 *   get()                              → { policy, at, by }
 *   set(key, value, { by })            → { key, prior, value }        one key; value any JSON
 *   unset(key, { by })                 → { key, prior }               back to the reader's own default
 *   importPolicy(policy, { by, force }) → { imported, kept }          the first owner's values, taken once (force replaces)
 *
 * Slice a holds the values; each reader still validates against its own schema (Idearium's config-core). The schema moves here with the
 * screen (slice b). JavaScript, said: Cortex's RAID is JavaScript; no Emerge port of RAID is mapped yet (RD9's note).
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'cortex.raid.routing';
const KEY = /^[a-z][a-z0-9_]*$/;
const dir = () => process.env.RAID_ROUTING_DIR || path.join(__dirname, '..', '..', 'data', 'raid');
const FILE = 'routing.json', LEDGER = 'routing.ledger.jsonl';

function _read() {
  try { const d = JSON.parse(fs.readFileSync(path.join(dir(), FILE), 'utf8')); return { policy: d.policy || {}, at: d.at || null, by: d.by || null }; }
  catch (_) { return { policy: {}, at: null, by: null }; }
}
function _write(doc) {
  fs.mkdirSync(dir(), { recursive: true });
  const f = path.join(dir(), FILE);
  fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(f + '.tmp', f);
}
function _log(entry) { fs.mkdirSync(dir(), { recursive: true }); fs.appendFileSync(path.join(dir(), LEDGER), JSON.stringify({ at: Date.now(), ...entry }) + '\n'); }
function _key(k) { const s = String(k || '').replace(/^routing\./, ''); if (!KEY.test(s)) throw new Error(`[${MODULE_ID}] not a routing key: ${JSON.stringify(k)}`); return s; }
function _json(v) { if (v === undefined || typeof v === 'function') throw new Error(`[${MODULE_ID}] a routing value must be JSON`); return JSON.parse(JSON.stringify(v)); }

function get() { return _read(); }

function set(key, value, { by = 'route' } = {}) {
  const k = _key(key), v = _json(value), doc = _read();
  const prior = doc.policy[k];
  doc.policy[k] = v; doc.at = Date.now(); doc.by = by;
  _write(doc); _log({ key: k, prior: prior === undefined ? null : prior, value: v, by });
  return { key: k, prior: prior === undefined ? null : prior, value: v };
}

function unset(key, { by = 'route' } = {}) {
  const k = _key(key), doc = _read();
  const prior = doc.policy[k];
  if (prior === undefined) return { key: k, prior: null };
  delete doc.policy[k]; doc.at = Date.now(); doc.by = by;
  _write(doc); _log({ key: k, prior, unset: true, by });
  return { key: k, prior };
}

function importPolicy(policy, { by = 'import', force = false } = {}) {
  const doc = _read();
  if (Object.keys(doc.policy).length && !force) return { imported: 0, kept: Object.keys(doc.policy).length };
  const next = {};
  for (const [k, v] of Object.entries(policy || {})) { try { next[_key(k)] = _json(v); } catch (_) { /* not a routing key: left out, never guessed */ } }
  _write({ policy: next, at: Date.now(), by });
  _log({ import: Object.keys(next).length, replaced: Object.keys(doc.policy).length, by });
  return { imported: Object.keys(next).length, kept: 0 };
}

module.exports = { MODULE_ID, get, set, unset, importPolicy };
