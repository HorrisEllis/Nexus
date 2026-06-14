'use strict';
/**
 * cortex/lab/index.js — Snapshot Test Environment
 * UUID: nexus-lab-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * A sandboxed runtime that:
 *   1. Loads a .nex snapshot into an isolated in-memory JAA instance
 *   2. Applies a patch or runs an experiment against it
 *   3. Diffs the before/after state
 *   4. Reports without touching production data
 *
 * Designed for:
 *   - Testing self-heal patches before live application
 *   - Drag-and-drop from diagnostic UI: drop a .nex, run, diff
 *   - Comparing enhancements against a known-good baseline
 *
 * §1.2  Nothing silently fails — errors surface as session.error
 * §2.1  Production JAA never touched — sandbox is in-memory clone
 * §3.1  Bottom-up: snapshot → sandbox → experiment → diff → report
 */

const fs   = require('fs');
const path = require('path');
const { JaaDB, uid } = require('../memory/jaa-db');
const { randomUUID } = require('crypto');

const MODULE_ID = 'cortex/lab';
const VERSION   = '1.0.0';

const _sessions = new Map();

// ── LabSession ─────────────────────────────────────────────────────────────────
class LabSession {
  constructor(id, snapData) {
    this.id        = id;
    this.snapId    = snapData.uuid || snapData.snapId || 'unknown';
    this.snapTs    = snapData.ts || 0;
    this.status    = 'loaded';
    this.startedAt = Date.now();
    this.endedAt   = null;
    this.result    = null;
    this.error     = null;
    this.log       = [];
    this._baseline = {};

    // Clone snapshot into fresh in-memory JaaDB — no disk writes
    this._sandbox = new JaaDB({ dir: null });
    const tables  = snapData.tables || {};
    let totalRows = 0;
    for (const [table, rows] of Object.entries(tables)) {
      this._sandbox._tables[table] = rows.map(r => ({ ...r }));
      this._baseline[table] = rows.length;
      totalRows += rows.length;
    }
    this._log(`Loaded ${this.snapId}: ${totalRows} rows / ${Object.keys(tables).length} tables`);
  }

  _log(msg) { this.log.push({ ts: Date.now(), msg }); }

  async run(experiment) {
    this.status = 'running';
    this._log(`Running: ${experiment.type}`);
    const t0 = Date.now();

    try {
      let output;

      switch (experiment.type) {

        case 'query': {
          const { table, filter, limit = 50 } = experiment.payload || {};
          if (!table) throw new Error('query requires table');
          const filterFn = filter ? new Function('r', 'return ' + filter) : () => true;
          const rows = this._sandbox.query(table, filterFn, limit);
          output = { table, count: rows.length, rows };
          break;
        }

        case 'insert': {
          const { table, row } = experiment.payload || {};
          if (!table || !row) throw new Error('insert requires table and row');
          const inserted = this._sandbox.insert(table, { uuid: uid(), ...row, ts: Date.now() });
          output = { inserted, tableSize: (this._sandbox._tables[table] || []).length };
          break;
        }

        case 'patch': {
          const { moduleSource, patchInstruction } = experiment.payload || {};
          if (!moduleSource) throw new Error('patch requires moduleSource');
          try { new Function(moduleSource); } catch(e) {
            output = { valid: false, error: 'syntax error: ' + e.message }; break;
          }
          output = {
            valid: true,
            sourceLines: moduleSource.split('\n').length,
            instruction: patchInstruction || '(none)',
            note: 'Validated in sandbox — apply via self-heal trust tier',
          };
          break;
        }

        case 'heal': {
          const TYPE_STRATEGIES = {
            stale_module:      { strategy:'forge_patch', automated:false, escalate:true },
            stuck_call:        { strategy:'timeout_and_retry', automated:true },
            recurring_failure: { strategy:'forge_patch', automated:false, escalate:true },
            missing_file:      { strategy:'forge_scaffold', automated:false, escalate:true },
            import_error:      { strategy:'forge_patch', automated:false, escalate:true },
            deviation:         { strategy:'log_and_observe', automated:false },
          };
          const gaps = this._sandbox.query('gaps', r => r.status === 'pending', 20);
          const prescriptions = gaps.map(gap => ({
            gapUuid:      gap.uuid,
            gapType:      gap.type,
            gapPath:      gap.path,
            severity:     gap.severity,
            prescription: TYPE_STRATEGIES[gap.type] || { strategy:'manual_review', automated:false },
          }));
          output = { gapsFound: gaps.length, prescriptions };
          break;
        }

        case 'custom': {
          const { fn } = experiment.payload || {};
          if (!fn) throw new Error('custom requires fn');
          const sandboxFn = new Function('jaa', 'uid', fn);
          output = sandboxFn(this._sandbox, uid);
          break;
        }

        default:
          throw new Error('unknown experiment type: ' + experiment.type);
      }

      const diff     = this._diff();
      this.status    = 'complete';
      this.endedAt   = Date.now();
      this.result    = { type: experiment.type, durationMs: Date.now() - t0, output, diff };
      this._log('Complete in ' + (Date.now() - t0) + 'ms — ' + diff.tablesChanged + ' tables changed');
      return this.result;

    } catch(e) {
      this.status  = 'failed';
      this.endedAt = Date.now();
      this.error   = e.message;
      this._log('FAILED: ' + e.message);
      throw e;
    }
  }

  _diff() {
    const changed   = [];
    const allTables = new Set([
      ...Object.keys(this._baseline),
      ...Object.keys(this._sandbox._tables || {}),
    ]);
    for (const table of allTables) {
      const before = this._baseline[table] || 0;
      const after  = (this._sandbox._tables[table] || []).length;
      if (before !== after) changed.push({ table, before, after, delta: after - before });
    }
    return {
      tablesChanged: changed.length,
      changes:       changed,
      summary:       changed.map(c => c.table + ': ' + c.before + '→' + c.after + ' (' + (c.delta>0?'+':'') + c.delta + ')').join(', '),
    };
  }

  toJSON() {
    return {
      id: this.id, snapId: this.snapId, snapTs: this.snapTs,
      status: this.status, startedAt: this.startedAt, endedAt: this.endedAt,
      result: this.result, error: this.error, log: this.log,
      baselineTables: Object.keys(this._baseline).length,
      baselineRows:   Object.values(this._baseline).reduce((s,n) => s+n, 0),
    };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

function createSession(snapPathOrData) {
  const id = 'lab-' + randomUUID().slice(0, 8);
  let snapData;
  if (typeof snapPathOrData === 'string') {
    if (!fs.existsSync(snapPathOrData)) throw new Error('snapshot not found: ' + snapPathOrData);
    snapData = JSON.parse(fs.readFileSync(snapPathOrData, 'utf8'));
  } else {
    snapData = snapPathOrData;
  }
  const session = new LabSession(id, snapData);
  _sessions.set(id, session);
  console.log('[' + MODULE_ID + '] session ' + id + ' created from ' + session.snapId);
  return session;
}

function getSession(id)          { return _sessions.get(id) || null; }
function listSessions()          { return [..._sessions.values()].map(s => s.toJSON()); }
function destroySession(id)      { const s=_sessions.get(id); if(!s)return false; _sessions.delete(id); return true; }

async function runExperiment(sessionId, experiment) {
  const session = _sessions.get(sessionId);
  if (!session) throw new Error('lab session not found: ' + sessionId);
  return session.run(experiment);
}

function loadProductionSnapshot(snapId) {
  return require('../snapshot/index').load(snapId);
}

module.exports = { createSession, getSession, listSessions, destroySession, runExperiment, loadProductionSnapshot, VERSION, MODULE_ID };
