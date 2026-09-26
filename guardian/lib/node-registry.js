'use strict';
const fs = require('fs');
const path = require('path');
const nodeExport  = require('../../lib/node-export.js');
const nodeSchemas = require('../../lib/node-schemas.js');
const nodeIndex   = require('../../lib/node-index.js');

const DEFAULT_NODES_DIR = path.join(__dirname, '..', 'data', 'nodes');
let NODES_DIR = DEFAULT_NODES_DIR;
const GUARDIAN_NODE_TYPES = Object.freeze(['tool', 'agent', 'command', 'event', 'intent', 'response']);
const LEDGER_FILE = '_ledger.jsonl';

let _bus = null;
const _registry = new Map();
const _watchDebounce = new Map();
const _watchers = [];
let _debounceCleanupTimer = null;

function _ledgerPath(type) { return path.join(NODES_DIR, type, LEDGER_FILE); }

function _appendLedger(type, entry) {
  const line = JSON.stringify({ ts: Date.now(), type, ...entry }) + '\n';
  try { fs.appendFileSync(_ledgerPath(type), line); }
  catch (e) { console.error(`[guardian/node-registry] ledger write failed for ${type}: ${e.message}`); }
}

function _idFromFilename(filename) { return path.basename(filename).split('.')[0]; }

function _processFile(type, filePath) {
  const filename = path.basename(filePath);
  if (filename === LEDGER_FILE || filename.startsWith('.')) return;

  if (!fs.existsSync(filePath)) {
    const id = _idFromFilename(filename);
    const typeMap = _registry.get(type);
    const existed = typeMap && typeMap.has(id);
    if (typeMap) typeMap.delete(id);
    _appendLedger(type, { action: 'deleted', file: filename, id });
    try { nodeIndex.removeNode(type, id); }
    catch (e) { console.warn(`[guardian/node-registry] jaaDB index removal failed for ${type}/${id} (non-fatal): ${e.message}`); }
    if (existed && _bus) _bus.emit('guardian.node.removed', { type, id, file: filename });
    console.log(`[guardian/node-registry] ${type}/${filename} removed`);
    return;
  }

  let doc;
  try { doc = nodeExport.importFromFile(filePath); }
  catch (e) {
    _appendLedger(type, { action: 'invalid', file: filename, error: e.message });
    console.warn(`[guardian/node-registry] ${type}/${filename} failed to parse: ${e.message}`);
    return;
  }

  if (doc.type !== type) {
    _appendLedger(type, { action: 'type_mismatch', file: filename, declaredType: doc.type, folderType: type });
    console.warn(`[guardian/node-registry] ${type}/${filename} declares type "${doc.type}", expected "${type}" — not registered`);
    return;
  }

  const check = nodeSchemas.checkPayload(type, doc.payload);
  if (!check.ok) {
    _appendLedger(type, { action: 'schema_invalid', file: filename, id: doc.id, missing: check.missing, wrongType: check.wrongType });
    console.warn(`[guardian/node-registry] ${type}/${filename} failed schema check — missing: ${check.missing.join(',') || '(none)'}`);
    return;
  }

  if (!_registry.has(type)) _registry.set(type, new Map());
  const typeMap = _registry.get(type);
  const isNew = !typeMap.has(doc.id);
  typeMap.set(doc.id, { node: doc, filePath });

  _appendLedger(type, { action: isNew ? 'added' : 'changed', file: filename, id: doc.id });
  // §BUILT 2026-09-12 — James: "using a Jaa database for each node type
  // and using tables for an index of each node... living and can update
  // at anytime... a ledger for tracking history and movement." Additive:
  // the .type file on disk is still the real, canonical source, and the
  // flat _ledger.jsonl above is untouched — this gives the SAME real
  // transition a second, queryable home in a live jaaDB table
  // (nodes_<type>) plus a real per-type ledger table
  // (nodes_<type>_ledger), so anything already using jaaDB.query()
  // elsewhere can find a real node without knowing this file-watcher's
  // in-memory Map exists, and the index survives a restart the Map does
  // not. Never allowed to break the real file-based path if it fails.
  try { nodeIndex.indexNode(type, doc, filePath); }
  catch (e) { console.warn(`[guardian/node-registry] jaaDB index write failed for ${type}/${filename} (non-fatal, file+flat-ledger already succeeded): ${e.message}`); }
  if (_bus) _bus.emit(isNew ? 'guardian.node.added' : 'guardian.node.changed', { type, id: doc.id, node: doc });
  console.log(`[guardian/node-registry] ${type}/${filename} ${isNew ? 'added' : 'changed'} — id=${doc.id}`);
}

function _scanExisting(type) {
  const dir = path.join(NODES_DIR, type);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f === LEDGER_FILE || f.startsWith('.')) continue;
    _processFile(type, path.join(dir, f));
  }
}

function start(opts = {}) {
  _bus = opts.bus || null;
  NODES_DIR = opts.nodesDir || DEFAULT_NODES_DIR;
  _registry.clear();

  for (const type of GUARDIAN_NODE_TYPES) {
    const dir = path.join(NODES_DIR, type);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
    if (!_registry.has(type)) _registry.set(type, new Map());
    _scanExisting(type);

    try {
      const watcher = fs.watch(dir, (event, filename) => {
        if (!filename) return;
        const key = `${dir}::${filename}`;
        const now = Date.now();
        if (now - (_watchDebounce.get(key) || 0) < 500) return;
        _watchDebounce.set(key, now);
        _processFile(type, path.join(dir, filename));
      });
      _watchers.push(watcher);
      console.log(`[guardian/node-registry] watching ${dir}`);
    } catch (e) {
      console.error(`[guardian/node-registry] watch failed for ${dir}: ${e.message}`);
    }
  }

  _debounceCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 30000;
    for (const [key, ts] of _watchDebounce) { if (ts < cutoff) _watchDebounce.delete(key); }
  }, 30000);
  if (_debounceCleanupTimer.unref) _debounceCleanupTimer.unref();

  return { ok: true };
}

function stop() {
  for (const w of _watchers) { try { w.close(); } catch (_) {} }
  _watchers.length = 0;
  if (_debounceCleanupTimer) { clearInterval(_debounceCleanupTimer); _debounceCleanupTimer = null; }
  _watchDebounce.clear();
  _bus = null;
  NODES_DIR = DEFAULT_NODES_DIR;
}

function list(type) {
  const typeMap = _registry.get(type);
  return typeMap ? [...typeMap.values()].map(e => e.node) : [];
}

function get(type, id) {
  const typeMap = _registry.get(type);
  const entry = typeMap && typeMap.get(id);
  return entry ? entry.node : null;
}

module.exports = {
  start, stop, list, get, GUARDIAN_NODE_TYPES, DEFAULT_NODES_DIR,
  getNodesDir: () => NODES_DIR,
  _processFile,
  // §BUILT 2026-09-12 — the live jaaDB view: queryLive works even after a
  // restart (the in-memory _registry above does not survive one); nodeHistory
  // is the real per-node "movement" record from nodes_<type>_ledger.
  queryLive: nodeIndex.queryNodes,
  nodeHistory: nodeIndex.history,
};
