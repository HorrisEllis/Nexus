'use strict';
/**
 * idearium/lib/data-dir.cjs — the one answer to "where does idearium write?"
 *
 * §BUILT 2026-09-25 — seven files each computed this themselves
 * (IDEARIUM_DATA_DIR || <file>/../data), and two (repo/repo-node.js,
 * lib/chunk-nodes.js) ignored IDEARIUM_DATA_DIR altogether, so even a test
 * that did isolate itself still wrote repository and chunk nodes into the
 * real idearium/data/nodes/. Every one of them now asks here.
 *
 * In a test process lib/test-sandbox.js has already pointed
 * IDEARIUM_DATA_DIR at a temp root by the time this returns; in production
 * nothing is set and the answer is idearium/data, exactly as before.
 */
const path = require('path');
const sandbox = require('../../lib/test-sandbox.js');

const REAL_DEFAULT = path.resolve(__dirname, '..', 'data');

function ideariumDataDir() {
  sandbox.ensure();
  return process.env.IDEARIUM_DATA_DIR || REAL_DEFAULT;
}

/**
 * idearium's event ledger lives in the shared data root (data/idearium/),
 * next to every other system's, not under idearium/data. NEXUS_DATA_ROOT is
 * that root's existing override (lib/ledger-writer.js, intelligence/alk).
 */
function ideariumLedgerDir() {
  sandbox.ensure();
  return path.join(process.env.NEXUS_DATA_ROOT || path.resolve(__dirname, '..', '..', 'data'), 'idearium');
}

/** A config path like 'data/nodes/chunk' is relative to idearium/ — resolve its data/ part here. */
function resolveIdeariumPath(rel) {
  if (path.isAbsolute(rel)) return rel;
  const norm = rel.split('\\').join('/');
  if (norm === 'data' || norm.startsWith('data/')) return path.join(ideariumDataDir(), norm.slice(5));
  return path.resolve(__dirname, '..', rel);
}

module.exports = { ideariumDataDir, ideariumLedgerDir, resolveIdeariumPath, REAL_DEFAULT };
