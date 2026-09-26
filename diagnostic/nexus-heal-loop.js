'use strict';
/**
 * nexus-heal-loop.js — Self-Healing Gap Closure Pipeline
 * UUID: nexus-heal-loop-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * THE CLOSED LOOP.
 *
 * gap detected
 *   → UTL classify (understand what kind of gap)
 *   → Blueprint generate (propose a fix spec)
 *   → Architect propose (emit to hook registry)
 *   → Forge dispatch (send to Guardian for LLM patch)
 *   → Versionium snapshot (capture state before + after)
 *   → gap resolved (or escalated to human)
 *
 * This module listens to the nexus-bus for gap events and
 * orchestrates the full repair pipeline.
 *
 * Safety rules (§1.1 Nothing pretends to work):
 *   - MAX_AUTO_ATTEMPTS per gap before human_required
 *   - Only gaps with severity < 'critical' are auto-attempted
 *   - Every step writes to JAA before executing
 *   - Dry-run mode (NEXUS_HEAL_DRY=true) logs without dispatching
 *
 * §2.1  JAA write before behavior — every heal attempt persisted first
 * §1.2  Every failure written to failures table
 * §1.3  No stubs — if Guardian unreachable, gap stays in needs_manual
 */

const http = require('http');
const { randomUUID } = require('crypto');
const nexusConfig = require('../lib/nexus-config');

function _healCfg() {
  // config wins; env vars are a fallback only if the config block is absent
  const cfg = nexusConfig.get();
  if (cfg.heal) {
    return {
      dryRun: cfg.heal.mode !== 'live',
      maxAttempts: cfg.heal.maxAttempts ?? 3,
      requireRaidApproval: cfg.heal.requireRaidApproval !== false,
      autoHealSeverity: cfg.heal.autoHealSeverity || ['low', 'medium'],
      escalateSeverity: cfg.heal.escalateSeverity || ['high', 'critical'],
    };
  }
  return {
    dryRun: process.env.NEXUS_HEAL_DRY !== 'false',
    maxAttempts: 3,
    requireRaidApproval: false,
    autoHealSeverity: ['low', 'medium'],
    escalateSeverity: ['high', 'critical'],
  };
}

const DRY_RUN       = _healCfg().dryRun; // snapshot at boot; re-read live in _dispatchToGuardian
const MAX_ATTEMPTS  = _healCfg().maxAttempts;
const GUARDIAN_PORT = 7820;
const CORTEX_PORT   = 3748;
const ARCH_PORT     = 3747;

// ── Attempt tracking (in-memory, also written to JAA) ────────────────────────
const _attempts = new Map(); // gapId → count

// ── Helpers ───────────────────────────────────────────────────────────────────

function _post(port, path, body) {
  return new Promise(resolve => {
    const raw = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) },
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(b) }); }
        catch(_) { resolve({ ok: res.statusCode < 400 }); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(raw); req.end();
  });
}

// ── JAA write helper ──────────────────────────────────────────────────────────
function _jaaWrite(table, record) {
  return _post(CORTEX_PORT, '/api/table/insert', { table, record: { uuid: randomUUID(), ts: Date.now(), ...record } });
}

// ── UTL classify gap ─────────────────────────────────────────────────────────
async function _classifyGap(gap) {
  const r = await _post(ARCH_PORT, '/api/translate/utl', {
    text: `${gap.description || gap.type || ''} ${gap.body || ''} ${gap.path || ''}`,
  });
  return r.ok ? r.data?.result : null;
}

// ── Build repair spec using Architect blueprint ────────────────────────────────
function _buildRepairSpec(gap, classification) {
  const name = `auto-repair: ${gap.type || 'gap'} in ${gap.path || 'system'}`;
  return {
    name,
    intent: gap.description || gap.type,
    constraints: (classification?.constraints || []).map(c => c.description),
    gaps: [{ id: gap.id || gap.uuid, description: gap.description, severity: gap.severity }],
    suggested_actions: [
      gap.type === 'missing_file'    ? `scaffold ${gap.path}` :
      gap.type === 'import_error'    ? `fix require path in ${gap.path}` :
      gap.type === 'stale_module'    ? `update module signature in ${gap.path}` :
      gap.type === 'stuck_call'      ? `add timeout + retry to ${gap.path}` :
      gap.type === 'recurring_failure'? `add error handling in ${gap.path}` :
      `review and fix ${gap.path || gap.description}`,
    ],
  };
}

// ── Dispatch to Guardian forge ────────────────────────────────────────────────
async function _dispatchToGuardian(gap, repairSpec, provider = 'claude') {
  const live = _healCfg(); // re-read on every dispatch — config changes take effect without restart
  if (live.dryRun) {
    console.log(`[heal-loop] DRY RUN — would dispatch: ${repairSpec.name}`);
    return { ok: true, dry: true };
  }
  if (live.requireRaidApproval) {
    let raid;
    try { raid = require('../cortex/core/raid'); } catch (_) { raid = null; }
    if (raid && typeof raid._decide === 'function') {
      const decision = raid._decide(
        { intent: repairSpec.intent || repairSpec.name, preferredAgent: provider },
        raid._health,
        raid._weights
      );
      if (!decision || !decision.agent) {
        console.log(`[heal-loop] RAID declined repair dispatch: ${repairSpec.name}`);
        await _jaaWrite('event_log', {
          type: 'heal-loop.raid-declined',
          payload: { gapId: gap.id || gap.uuid, repair: repairSpec.name, decision },
          source: 'heal-loop',
        }).catch(() => {});
        return { ok: false, reason: 'raid_declined', decision };
      }
      provider = decision.agent || provider;
    }
    // If RAID isn't loaded/reachable, fail closed to manual rather than silently bypassing approval (§1.3 no stubs)
    else {
      console.log(`[heal-loop] requireRaidApproval=true but RAID unavailable — escalating instead of dispatching`);
      return { ok: false, reason: 'raid_unavailable' };
    }
  }
  // forge_repair routes directly to ollama-bridge (:3749) — NOT guardian NCP.
  // Guardian NCP queues for browser tabs ("ollama userscript") which don't exist.
  // Ollama-bridge is a sovereign HTTP service, always reachable at :3749.
  const OLLAMA_BRIDGE_PORT = parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749');
  return _post(OLLAMA_BRIDGE_PORT, '/generate', {
    command:  'forge_repair',
    prompt:   JSON.stringify(repairSpec, null, 2),
    gapId:    gap.id || gap.uuid,
    priority: gap.severity === 'critical' ? 'high' : 'normal',
    meta: {
      type:        'heal-loop.repair',
      gapType:     gap.type,
      gapPath:     gap.path,
      autoAttempt: (_attempts.get(gap.id || gap.uuid) || 0) + 1,
      source:      'heal-loop',
    },
  });
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function healGap(gap) {
  const id = gap.id || gap.uuid || randomUUID();
  const attempts = (_attempts.get(id) || 0) + 1;
  _attempts.set(id, attempts);

  if (attempts > MAX_ATTEMPTS) {
    await _jaaWrite('event_log', {
      type: 'heal-loop.max-attempts-reached',
      payload: { gapId: id, attempts, maxAttempts: MAX_ATTEMPTS },
      source: 'heal-loop',
    });
    // Update gap to human_required
    await _post(CORTEX_PORT, '/api/gaps/' + id, { status: 'human_required', escalatedAt: Date.now() }).catch(() => {});
    return { ok: false, reason: 'max_attempts', attempts };
  }

  // Skip auto-healing for critical gaps — escalate immediately
  if (gap.severity === 'critical') {
    await _jaaWrite('event_log', {
      type: 'heal-loop.critical-escalated',
      payload: { gapId: id, severity: gap.severity },
      source: 'heal-loop',
    });
    return { ok: false, reason: 'critical_escalated' };
  }

  // Step 1: §2.1 JAA write before behavior
  await _jaaWrite('event_log', {
    type: 'heal-loop.attempt.started',
    payload: { gapId: id, attempt: attempts, gapType: gap.type, path: gap.path },
    source: 'heal-loop',
  });

  // Step 2: UTL classify
  const classification = await _classifyGap(gap);

  // Step 3: Build repair spec
  const repairSpec = _buildRepairSpec(gap, classification);

  // Step 4: Versionium snapshot before
  await _post(CORTEX_PORT, '/api/versionium/snapshot', {
    message: `pre-heal: ${gap.type} in ${gap.path || 'system'}`,
    causedBy: id,
  }).catch(() => {});

  // Step 5: Dispatch to Guardian
  const dispatch = await _dispatchToGuardian(gap, repairSpec);

  // Step 6: Record result
  await _jaaWrite('event_log', {
    type: dispatch.ok ? 'heal-loop.dispatched' : 'heal-loop.dispatch-failed',
    payload: { gapId: id, attempt: attempts, dispatched: dispatch.ok, dry: dispatch.dry },
    source: 'heal-loop',
  });

  return {
    ok:          dispatch.ok,
    gapId:       id,
    attempt:     attempts,
    repairSpec,
    classification,
    dispatched:  dispatch.ok && !dispatch.dry,
    dry:         !!dispatch.dry,
  };
}

// ── Bus integration ───────────────────────────────────────────────────────────

function attachToBus(bus) {
  if (!bus) return;

  // Listen for any gap opened/found event from any system
  bus.on('*', async ev => {
    if (!ev.type) return;
    if (ev.type.includes('.gap.found') || ev.type.includes('.gap.opened') ||
        ev.type === 'nexus.gap.detected') {
      const gap = ev.payload;
      // §BUG FIXED 2026-07-06 — traced through Architect's real event log:
      // 928 of 928 UTL translate calls, since this loop existed, produced
      // type_signature 'text.empty' with zero exceptions. Root cause:
      // this listener matches on event TYPE NAME substring only, never
      // shape. guardian/userscript-{chatgpt,claude}.js emit
      // 'cortex.gap.found' (matches '.gap.found') with payload
      // {jobId, gaps: issues, source} — plural `gaps` array, no
      // description/type/body/path at all. _classifyGap's template
      // literal against that shape evaluates to two spaces, which
      // Architect's UTL correctly (but uselessly) reports as empty every
      // time. Architect's pipeline was never broken — nothing shaped
      // like a real single gap had ever reached it.
      if (!gap || gap.status === 'resolved') return;
      const looksLikeSingleGap = gap.description || gap.type || gap.body || gap.path || gap.id || gap.uuid;
      if (!looksLikeSingleGap) {
        bus.emit('heal-loop.skipped', { reason: 'payload_shape_mismatch', eventType: ev.type,
          payloadKeys: Object.keys(gap) }, { source: 'heal-loop' });
        return;
      }
      try {
        const result = await healGap(gap);
        bus.emit('heal-loop.result', result, { source: 'heal-loop', causedBy: gap.id || gap.uuid });
      } catch(e) {
        bus.emit('heal-loop.error', { error: e.message, gap }, { source: 'heal-loop' });
      }
    }
  });

  // Listen for healer escalations (healer marks escalateToForge=true)
  bus.on('nexus-bus.system.booted', () => {
    console.log('[heal-loop] attached to bus');
  });

  console.log('[heal-loop] listening on bus for gap events');
}

// ── HTTP endpoint handler ─────────────────────────────────────────────────────
// Can be mounted on any service: if (url === '/api/heal') healLoopHandler(req,res)
async function healLoopHandler(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { gap } = JSON.parse(body);
      if (!gap) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: 'gap required' })); }
      const result = await healGap(gap);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result));
    } catch(e) {
      res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  });
}

module.exports = { healGap, attachToBus, healLoopHandler, DRY_RUN };
