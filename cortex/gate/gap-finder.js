'use strict';
// ── gate/gap-finder.js ────────────────────────────────────────────────────────
// UUID: mod-gap-finder-v5-0000-4000-0000-000000000001
//
// v5.1: Added self-repair awareness — scans forge_patches, fix_map, fault_taxonomy.
// Escalation artifacts are first-class gap sources. The loop is closed.
//
// v5.0: No kernel.emit('gap.found'). Writes directly to gaps table (§G-V5-01 resolved).
// Scans project_registry for stale modules, agent_calls for timeouts,
// failures for recurring patterns. Each gap written once (deduped by path+type).
//
// §M1: init(cfg) + stop().
// §M2: reads: project_registry, agent_calls, failures, forge_patches, fix_map, fault_taxonomy.
//      writes: gaps, event_log.
// §M3: pollMs from cfg.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'gate/gap-finder';
const STALE_MS   = 60000;   // module not seen in 60s → stale gap
const PATCH_AGE_MS = 300000; // forge patch pending > 5min without apply → gap
const HIGH_FRICTION = 0.7;   // fault_taxonomy friction threshold → elevated gap

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 2000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    const now    = Date.now();
    const found  = [];

    // ── Stale module detection ─────────────────────────────────────────────
    const modules = jaaDB.query('project_registry', () => true, 50);
    for (const mod of modules) {
      const lastSeen = mod.lastSeenAt || mod._ts || 0;
      if (now - lastSeen > STALE_MS && mod.status !== 'stale') {
        found.push({
          path:     `modules/${mod.name}`,
          type:     'stale_module',
          severity: 'medium',
          body:     `Module '${mod.name}' has not sent a heartbeat in ${Math.floor((now - lastSeen) / 1000)}s`,
        });
      }
    }

    // ── Stuck agent calls ─────────────────────────────────────────────────
    const stuckCalls = jaaDB.query('agent_calls',
      r => r.status === 'processing' && (now - (r.startedAt || r._ts)) > 35000,
      10
    );
    for (const call of stuckCalls) {
      found.push({
        path:     `agent_calls/${call.uuid}`,
        type:     'stuck_call',
        severity: 'high',
        body:     `agent_call ${call.uuid} stuck in 'processing' for ${Math.floor((now - (call.startedAt || call._ts)) / 1000)}s — agent: ${call.routedTo || 'unknown'}`,
      });
    }

    // ── Recurring failures ────────────────────────────────────────────────
    const recentFails = jaaDB.tail('failures', 50);
    const failsBySource = {};
    for (const f of recentFails) {
      const src = f.source || 'unknown';
      failsBySource[src] = (failsBySource[src] || 0) + 1;
    }
    for (const [src, count] of Object.entries(failsBySource)) {
      if (count >= 3) {
        found.push({
          path:     `failures/${src}`,
          type:     'recurring_failure',
          severity: count >= 5 ? 'high' : 'medium',
          body:     `Source '${src}' has ${count} failures in recent window`,
        });
      }
    }

    // ── [v5.1] Stalled forge patches ──────────────────────────────────────
    // A patch proposed but not applied after PATCH_AGE_MS is a stuck repair.
    // Status 'proposed' or 'forge_patch_ready' and older than threshold.
    const stalledPatches = jaaDB.query('forge_patches',
      r => (r.status === 'proposed' || r.status === 'forge_patch_ready' || r.applied === false) &&
           (now - (r.ts || 0)) > PATCH_AGE_MS,
      10
    );
    for (const p of stalledPatches) {
      found.push({
        path:     `forge_patches/${p.uuid}`,
        type:     'stalled_patch',
        severity: 'medium',
        body:     `Forge patch for '${p.module || p.modPath || 'unknown'}' has been pending for ${Math.floor((now - p.ts) / 60000)}min — gap: ${p.gapUuid || 'unknown'}`,
        meta:     { patchUuid: p.uuid, gapUuid: p.gapUuid, module: p.module || p.modPath },
      });
    }

    // ── [v5.1] Unresolved fix_map entries ────────────────────────────────
    // fix_map entries with status='manual_required' and no resolution in 10min.
    const FIX_STALE_MS = 600000;
    const stalledFixes = jaaDB.query('fix_map',
      r => r.status === 'manual_required' && (now - (r.createdAt || r.ts || 0)) > FIX_STALE_MS,
      10
    );
    for (const f of stalledFixes) {
      found.push({
        path:     `fix_map/${f.gapPath || f.uuid}`,
        type:     'unresolved_fix',
        severity: 'medium',
        body:     `Fix for '${f.gapPath || f.gapType}' requires manual action (strategy: ${f.strategy}) — unresolved for ${Math.floor((now - (f.createdAt || f.ts || now)) / 60000)}min`,
        meta:     { fixUuid: f.uuid, gapUuid: f.gapUuid, strategy: f.strategy },
      });
    }

    // ── [v5.1] High-friction fault classes ───────────────────────────────
    // fault_taxonomy entries approaching failure mode (friction >= HIGH_FRICTION).
    // These are pre-failure signals — surface them before the system hits the wall.
    const hotFaults = jaaDB.query('fault_taxonomy',
      r => (r.friction || 0) >= HIGH_FRICTION && !r.failureMode,
      10
    );
    for (const f of hotFaults) {
      found.push({
        path:     `fault_taxonomy/${f.faultClass}`,
        type:     'high_friction_fault',
        severity: f.friction >= 0.9 ? 'high' : 'medium',
        body:     `Fault class '${f.faultClass}' has friction ${f.friction.toFixed(2)} — approaching failure mode. Last reason: ${f.lastReason || 'unknown'}`,
        meta:     { faultClass: f.faultClass, friction: f.friction, count: f.count },
      });
    }

    // ── [v5.1] Active failure modes ───────────────────────────────────────
    // failure_modes entries with status='active' — these need human action.
    // Gap-finder surfaces them continuously until resolved.
    const activeFailures = jaaDB.query('failure_modes',
      r => r.status === 'active',
      5
    );
    for (const fm of activeFailures) {
      found.push({
        path:     `failure_modes/${fm.faultClass}`,
        type:     'failure_mode_active',
        severity: 'high',
        body:     `FAILURE MODE: '${fm.faultClass}' — friction: ${(fm.friction || 0).toFixed(2)}. Human action required: ${fm.humanAction || 'review escalation history'}`,
        meta:     { fmUuid: fm.uuid, faultClass: fm.faultClass, humanAction: fm.humanAction },
      });
    }

    // ── Write gaps (deduplicated) ──────────────────────────────────────────
    // Terminal statuses: resolved, forge_applied (patch written), human_required (escalated).
    // All three suppress re-detection — the gap is either fixed or handed off.
    const TERMINAL = new Set(['resolved', 'forge_applied', 'human_required', 'failure_mode']);
    for (const gap of found) {
      const existing = jaaDB.query('gaps',
        r => r.path === gap.path && r.type === gap.type && !TERMINAL.has(r.status),
        1
      );
      if (existing.length) continue; // already open or terminally handled

      const row = jaaDB.insert('gaps', {
        uuid:      uid(),
        path:      gap.path,
        type:      gap.type,
        severity:  gap.severity,
        body:      gap.body,
        status:    'pending',
        source:    MODULE_ID,
        meta:      gap.meta || null,
        causedBy:  null,
        createdAt: now,
      });

      jaaDB.insert('event_log', {
        uuid:     uid(),
        type:     'gap.found',
        payload:  { gapUuid: row.uuid, path: gap.path, type: gap.type, severity: gap.severity },
        source:   MODULE_ID,
        causedBy: null,
        ts:       now,
      });
    }

    jaaDB.insert('poll_log', {
      uuid:      uid(),
      module:    MODULE_ID,
      gapsFound: found.length,
      ts:        now,
      source:    MODULE_ID,
    });

  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
