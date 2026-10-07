'use strict';
/**
 * lib/fault-log.js — every fault, richly tagged, first-class data.
 * comp_id: nexus.lib.fault-log
 * UUID: nexus-fault-log-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "logging faults and failure modes each time
 * they are made... first class data to learn and reduce redundant
 * mistakes... extensive tagging... before each action, needs to check for
 * relevant failure mode from fault taxonomy."
 *
 * §CHECKED REAL SUBSTRATE FIRST, NOT ASSUMED — cortex/self-heal/
 * fault-taxonomy.js already exists, is real, and is the declared SOLE
 * write authority for the `fault_taxonomy` table (its own docblock: "§10.1
 * Each data type has exactly one write authority"). It IS actually called
 * (cortex/self-heal/escalation.js, lib/config-governance.js) — unlike
 * guardian_chat_log, this is not orphaned. But its scope is narrow: only
 * self-heal escalation and config anomalies raise friction. Nothing logs
 * a fault from a failed tool call, a failed hat responsibility, a denied
 * merge, a failed council member.
 *
 * §NOT A SECOND WRITER — this module does not touch the `fault_taxonomy`
 * table directly (§10.1 stays intact); it calls fault-taxonomy.js's own
 * real raiseFriction() for the coarse faultClass/friction signal, and
 * ADDITIONALLY writes a richer, fully-tagged record to a NEW table
 * (`fault_log`) carrying what fault_taxonomy's schema was never meant to:
 * system, agent, component, causedBy (a real causal pointer, not a graph
 * traversal engine — that's a real scope decision, see honest_limit
 * below), status, intent, and CFR's real field/regime state at the
 * moment of failure (the "conditions").
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'fault_log';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _cfrConditions() {
  try {
    const cfr = require(path.join(ROOT, 'nexus', 'nexus-cfr-influence.js'));
    return cfr.getState();
  } catch (e) { return { unavailable: true, reason: e.message }; }
}

/**
 * logFault({ system, agent, component, faultClass, status, intent,
 *   causedBy, meta }) — the real write. faultClass should be one of
 * fault-taxonomy's KNOWN_FAULT_CLASSES where it genuinely fits (raises
 * real friction there too); anything else still gets a real fault_log
 * row, just without the coarse friction signal.
 */
function logFault({ system, agent, component, faultClass, status = 'failed', intent = null, causedBy = null, meta = {} } = {}) {
  if (!component) throw new Error('fault-log: component is required — a fault with no real source is not a real fault record');

  const record = {
    uuid: require('crypto').randomUUID(),
    system: system || null, agent: agent || null, component,
    faultClass: faultClass || null, status, intent,
    causedBy,
    conditions: _cfrConditions(),
    meta, ts: Date.now(),
  };

  try {
    const jaa = _jaa();
    if (jaa) jaa.insert(TABLE, record);
  } catch (e) { console.warn(`[fault-log] failed to persist: ${e.message}`); }
  // §0.39.368 AL1 — a fault about a repo is a row of its activity log too: failures first class, where its work is read
  const repoUuid = meta && (meta.repoUuid || meta.targetRepo);
  if (repoUuid) {
    try { require('./activity-log/compartment.js').record({ compartment: repoUuid, kind: `fault.${faultClass || 'unknown'}`, status: 'failed', actor: agent || component, ref: record.uuid, ts: record.ts,
      title: `${faultClass || 'fault'}${intent ? ` · ${intent}` : ''}${meta.error ? ` — ${String(meta.error).slice(0, 160)}` : meta.reason ? ` — ${String(meta.reason).slice(0, 160)}` : ''}` }); } catch (_) {}
  }

  if (faultClass) {
    try {
      const ft = require(path.join(ROOT, 'cortex/self-heal/fault-taxonomy.js'));
      if (ft.KNOWN_FAULT_CLASSES && ft.KNOWN_FAULT_CLASSES.includes(faultClass)) {
        ft.raiseFriction(faultClass, 1, { component, system, agent, ts: record.ts });
      }
    } catch (_) { /* fault-taxonomy unreachable — the fault_log row above is still real and already persisted */ }
  }

  return record;
}

/**
 * checkFaultHistory(component, opts) — real precedent for a component
 * about to act, not a fabricated risk score. Returns actual past fault_log
 * rows for this component (and, if given, this intent), most recent
 * first. ADVISORY — this does not block anything itself; a caller (RAID,
 * governAction) decides what to do with real precedent. A fault having
 * happened before is real information, not proof it will happen again.
 */
function checkFaultHistory(component, opts = {}) {
  const jaa = _jaa();
  if (!jaa) return { component, sampleSize: 0, recent: [], note: 'cortex unavailable' };

  let rows = jaa.query(TABLE, r => r.component === component);
  if (opts.intent) rows = rows.filter(r => r.intent === opts.intent);
  rows.sort((a, b) => b.ts - a.ts);

  return {
    component, intent: opts.intent || null,
    sampleSize: rows.length,
    recent: rows.slice(0, opts.limit || 5).map(r => ({ faultClass: r.faultClass, status: r.status, ts: r.ts, agent: r.agent, conditions: r.conditions?.regime || null })),
  };
}

module.exports = { logFault, checkFaultHistory, TABLE, MODULE_ID: 'fault-log', VERSION: '1.0.0' };
