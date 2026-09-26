/**
 * vault/audit-log.js
 * COMPARTMENT OS — Persisted Vault Audit Log (spec §52, hk-va-007)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Found by testing, not designed up front: this CLI is a fresh process
 * per invocation, so the in-memory event bus (host.bus.tail()) is empty
 * by the time a SEPARATE `cos vault audit` command runs — there's nothing
 * left to tail. `cos vault set` and `cos vault audit` are different
 * processes. This file is the fix: a real append-only log on disk,
 * written every time a vault:* event fires (wired via bus.onAny() in
 * host/index.js), read back by the audit command.
 *
 * JSON-lines format — one event per line, append-only, no read-modify-
 * write race on concurrent writers.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { COS_VAULT_DIR } = require('../foundation/constants.js');

const DEFAULT_AUDIT_LOG_FILE = path.join(COS_VAULT_DIR, 'audit.log.jsonl');

/**
 * @param {{ type: string, payload: object, timestamp: number }} event
 * @param {string} [auditLogFile]
 */
function appendAuditEntry(event, auditLogFile = DEFAULT_AUDIT_LOG_FILE) {
  fs.mkdirSync(path.dirname(auditLogFile), { recursive: true });
  const line = JSON.stringify({ type: event.type, payload: event.payload, timestamp: event.timestamp }) + '\n';
  fs.appendFileSync(auditLogFile, line, { mode: 0o600 });
}

/**
 * @param {{ auditLogFile?: string, limit?: number }} opts
 * @returns {object[]} most recent entries last
 */
function readAuditLog(opts = {}) {
  const auditLogFile = opts.auditLogFile || DEFAULT_AUDIT_LOG_FILE;
  if (!fs.existsSync(auditLogFile)) return [];

  const lines = fs.readFileSync(auditLogFile, 'utf8').split('\n').filter(Boolean);
  const entries = lines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  return opts.limit ? entries.slice(-opts.limit) : entries;
}

module.exports = {
  DEFAULT_AUDIT_LOG_FILE,
  appendAuditEntry,
  readAuditLog,
};
