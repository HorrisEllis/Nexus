'use strict';
// ── gate/gap-finder.js ────────────────────────────────────────────────────────
// UUID: mod-gap-finder-v5-0000-4000-0000-000000000001
//
// v5.0: No kernel.emit('gap.found'). Writes directly to gaps table (§G-V5-01 resolved).
// Scans project_registry for stale modules, agent_calls for timeouts,
// failures for recurring patterns. Each gap written once (deduped by path+type).
//
// §M1: init(cfg) + stop().
// §M2: reads: project_registry, agent_calls, failures. writes: gaps, event_log.
// §M3: pollMs from cfg.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'gate/gap-finder';
const STALE_MS   = 60000;  // module not seen in 60s → stale gap

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
    // Cooldown: don't re-detect a path+type that was recently resolved
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
    const recentlyResolved = jaaDB.query('gaps',
      r => r.status === 'resolved' && r.resolvedAt && (now - r.resolvedAt) < COOLDOWN_MS,
      200
    );
    const cooldownPaths = new Set(recentlyResolved.map(r => `${r.path}:${r.type}`));

    // ── Stale module detection ─────────────────────────────────────────────
    const modules = jaaDB.query('project_registry', () => true, 50);
    for (const mod of modules) {
      const lastSeen = mod.lastSeenAt || mod._ts || 0;
      const staleSec = Math.floor((now - lastSeen) / 1000);
      if (now - lastSeen > STALE_MS && mod.status !== 'stale') {
        // Typed severity based on how long stale + whether it's a hard dependency
        const CRITICAL_MODULES = new Set(['cortex', 'orchestrator', 'guardian']);
        const severity = CRITICAL_MODULES.has(mod.name) ? 'high'
                       : staleSec > 300 ? 'high'
                       : staleSec > 120 ? 'medium'
                       : 'low';
        found.push({
          path:       `modules/${mod.name}`,
          type:       'stale_module',
          severity,
          // Named and typed: module name + expected port + how long offline
          body:       `[${mod.name}:${mod.port || '?'}] stale ${staleSec}s — last seen: ${lastSeen ? new Date(lastSeen).toISOString() : 'never'}`,
          moduleName: mod.name,
          modulePort: mod.port || null,
          staleSec,
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

    // ── Write gaps (deduplicated + cooldown) ──────────────────────────────
    for (const gap of found) {
      // Skip if recently resolved (cooldown prevents thrash loops)
      if (cooldownPaths.has(`${gap.path}:${gap.type}`)) continue;

      const existing = jaaDB.query('gaps',
        r => r.path === gap.path && r.type === gap.type &&
             !['resolved', 'forge_applied', 'human_required'].includes(r.status),
        1
      );
      if (existing.length) continue; // already open

      const row = jaaDB.insert('gaps', {
        uuid:       uid(),
        path:       gap.path,
        type:       gap.type,
        severity:   gap.severity,
        body:       gap.body,
        status:     'pending',
        source:     MODULE_ID,
        causedBy:   null,
        createdAt:  now,
        // Named identity fields — populated for stale_module, sticky to gap
        moduleName: gap.moduleName || null,
        modulePort: gap.modulePort || null,
        staleSec:   gap.staleSec   || null,
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
      uuid:    uid(),
      module:  MODULE_ID,
      gapsFound: found.length,
      ts:      now,
      source:  MODULE_ID,
    });

  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
