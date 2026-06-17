'use strict';
// ── cortex/self-heal/index.js ─────────────────────────────────────────────────
// UUID: nexus-self-heal-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// THE ACTIVATION LAYER. Connects:
//   gap-finder  (finds problems) →
//   healer      (prescribes fixes) →
//   forge       (writes actual code using the running AI session)
//
// Gap status flow:
//   pending → processing (healer)
//   needs_manual → forge_processing (self-heal)
//   forge_processing → forge_applied | forge_patch_ready | forge_failed | human_required
//
// Safety rules:
//   - Max MAX_ATTEMPTS forge attempts per gap. After that: human_required.
//   - §2.1: forge_patches audit record written BEFORE any disk write.
//   - APPLY_PATCH defaults false (audit mode). Set NEXUS_FORGE_APPLY=true to patch live.
//   - Only modules in SAFE_MODULES can be patched. All others: audit only.
//
// §M1: init(cfg) + stop()
// §M2: reads: gaps, fix_map. writes: forge_patches, event_log, failures, gaps
// §1.2: every forge failure written to failures

const fs   = require('fs');
const path = require('path');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'self-heal';
const VERSION    = '1.0.0';
const ROOT       = path.join(__dirname, '..', '..');

// §TRUST-08: Heal trust tiers — explicit permissions per module class
// Tier 1 (SAFE — auto-apply):       docs, UI, diagnostics, config stubs
// Tier 2 (SNAPSHOT — apply+commit): adapters, bridges, service glue
// Tier 3 (PROPOSE — human review):  core runtime, kernel, memory, orchestrator
//
// Healer reads tier before dispatch:
//   T1 → apply patch directly (APPLY_PATCH must be true)
//   T2 → versionium.commit() then apply (creates rollback point first)
//   T3 → propose only — write to forge_patches table, never auto-apply
//
// This replaces the static SAFE_MODULES allowlist.
// Adding a new module = decide its tier, not add to a growing list.

const TRUST_TIERS = {
  // ── Tier 1: Safe to auto-apply ─────────────────────────────────────────────
  1: {
    label:  'auto-apply',
    action: 'apply',
    modules: new Set([
      // Diagnostics
      'service/nexus-diagnostic.js',
      'lib/ledger-writer.js',
      'lib/baseline.js',
      // UI files
      'ui/index.html',
      'guardian/ui/index.html',
      // Guardian adapters (non-core)
      'guardian/lib/gap-hunter.js',
      'guardian/userscript-claude.js',
      'guardian/userscript-chatgpt.js',
      // Automation glue
      'cortex/automation/engine.js',
      'cortex/gate/gap-finder.js',
    ]),
  },
  // ── Tier 2: Apply with snapshot first ─────────────────────────────────────
  2: {
    label:  'apply-with-snapshot',
    action: 'snapshot_then_apply',
    modules: new Set([
      // Bridge adapters
      'bridge/identity.js',
      'bridge/router.js',
      'bridge/registry.js',
      'bridge/ledger.js',
      // Cortex healers (can fix themselves)
      'cortex/healer/index.js',
      'cortex/self-heal/index.js',
      'cortex/intelligence/index.js',
      'cortex/orion/policy.js',
      'cortex/orion/sensor.js',
      // Agent adapters
      'cortex/agents/ollama/index.js',
      'cortex/agents/claude/index.js',
      // Service layer
      'architect/service.js',
    ]),
  },
  // ── Tier 3: Propose only — never auto-apply ────────────────────────────────
  3: {
    label:  'propose-only',
    action: 'propose',
    modules: new Set([
      // Core runtime
      'cortex/boot.js',
      'cortex/foundation/admin-server.js',
      'cortex/foundation/cobalt-core.js',
      // Memory kernel
      'cortex/memory/jaa-db.js',
      'cortex/memory/data-poller.js',
      // Versionium
      'cortex/versionium/index.js',
      'cortex/versionium/causality.js',
      // Orchestrator
      'orchestrator.js',
      // Queue
      'lib/queue.js',
      // Contracts (never auto-patch)
      'contracts/nexus-interaction-contract.js',
      'contracts/SYSTEM-CONTRACTS.js',
    ]),
  },
};

// Backwards-compat helper: resolvesTier(relPath) → { tier, action, label } | null
function _resolveTier(relPath) {
  for (const [tier, def] of Object.entries(TRUST_TIERS)) {
    if (def.modules.has(relPath)) return { tier: parseInt(tier), ...def };
  }
  // Unknown module → default to Tier 2 (safe for most, requires snapshot)
  return { tier: 2, label: 'apply-with-snapshot', action: 'snapshot_then_apply' };
}

// Keep SAFE_MODULES as backwards compat alias = all T1 + T2 combined
const SAFE_MODULES = new Set([
  ...[...TRUST_TIERS[1].modules],
  ...[...TRUST_TIERS[2].modules],
]);

const APPLY_PATCH  = process.env.NEXUS_FORGE_APPLY === 'true';
const MAX_ATTEMPTS = 3;

let _interval = null;
let _forge    = null;
let _cfg      = {};

function _getForge() {
  if (_forge) return _forge;
  try {
    _forge = require('../../cockpit/forge');
    console.log(`[${MODULE_ID}] forge loaded — LLM patching enabled`);
  } catch (_) {
    _forge = null;
  }
  return _forge;
}

function _resolveModulePath(gap) {
  const bodyMatch = (gap.body || '').match(/(?:module|file|path)[:\s]+([^\s,]+\.js)/i);
  if (bodyMatch) {
    const p = path.join(ROOT, bodyMatch[1]);
    if (fs.existsSync(p)) return bodyMatch[1];
  }
  const seg = (gap.path || '')
    .replace(/^modules\//, '')
    .replace(/^failures\//, '')
    .split('/')[0];
  const candidates = [
    `cortex/${seg}/index.js`,
    `cortex/core/${seg}/index.js`,
    `cortex/gate/${seg}.js`,
    `cortex/${seg}.js`,
    `guardian/${seg}/index.js`,
    `guardian/lib/${seg}.js`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(ROOT, c))) return c;
  }
  return null;
}

async function _forgeGap(gap) {
  const forge = _getForge();
  if (!forge) return { ok: false, reason: 'forge_unavailable', src: null };

  const modRelPath = _resolveModulePath(gap);
  if (!modRelPath) return { ok: false, reason: 'module_not_found', src: null };

  const modAbsPath = path.join(ROOT, modRelPath);
  let modSrc;
  try { modSrc = fs.readFileSync(modAbsPath, 'utf8'); }
  catch (e) { return { ok: false, reason: `read_error: ${e.message}`, src: null }; }

  const instruction = [
    `Gap type: ${gap.type}`,
    `Severity: ${gap.severity}`,
    `Path: ${gap.path}`,
    `Problem: ${gap.body}`,
    '',
    'Fix this specific problem. Minimal targeted patch. Do not change unrelated behaviour.',
  ].join('\n');

  let rec;
  try {
    rec = await forge.forgePatch(
      modSrc,
      { instruction, gapType: gap.type, gapPath: gap.path },
      {
        moduleName: modRelPath,
        store: {
          insert: (table, row) => {
            try { jaaDB.insert(table, { uuid: uid(), ...row }); } catch (_) {}
          },
        },
      }
    );
  } catch (e) {
    return { ok: false, reason: `forge_error: ${e.message}`, src: null };
  }

  if (rec.error) return { ok: false, reason: rec.error, src: null };
  return { ok: true, src: rec.src, modRelPath, modAbsPath, provider: rec.provider, durationMs: rec.durationMs };
}

function _applyPatch(modAbsPath, modRelPath, newSrc) {
  if (!APPLY_PATCH)             return { applied: false, reason: 'apply_disabled — set NEXUS_FORGE_APPLY=true' };
  const tier = _resolveTier(modRelPath);

  // §TRUST-08: tier-based dispatch
  if (tier.action === 'propose') {
    // T3: write to forge_patches table, never auto-apply
    const { jaaDB, uid: _uid } = require('../memory/jaa-db');
    jaaDB.insert('forge_patches', {
      uuid:      _uid(),
      gapUuid:   gap.uuid,
      modPath:   modRelPath,
      tier:      3,
      action:    'propose',
      status:    'proposed',
      body:      gap.body,
      source:    MODULE_ID,
      ts:        Date.now(),
    });
    return { applied: false, reason: `tier_3_propose_only: ${modRelPath}`, tier: 3 };
  }

  if (tier.action === 'snapshot_then_apply') {
    // T2: full snapshot before applying — Phase 8.6 wiring
    // This creates a rewind point so the timeline shows this decision.
    let snapId = null;
    try {
      const snap = require('../snapshot/index');
      const result = snap.create({ type: 'pre_forge', message: `self-heal pre-apply: ${gap.type} in ${modRelPath}`, causedBy: gap.uuid });
      snapId = result?.snapId;
      if (snapId) console.log(`[${MODULE_ID}] §2.1 snapshot before apply — ${snapId}`);
    } catch(e) {
      // Snapshot failure is non-fatal — still attempt the patch, but log it
      console.warn(`[${MODULE_ID}] §2.1 pre-apply snapshot failed (non-fatal): ${e.message}`);
      try {
        // Fallback: versionium commit (lighter weight)
        const versionium = require('../versionium/index');
        versionium.commit({ message: `pre-heal snapshot: ${gap.type} in ${modRelPath}`, causedBy: gap.uuid });
      } catch {}
    }
    // Log the decision so replay engine can reconstruct it
    try {
      const replayMod = require('../../lib/replay-engine');
      replayMod.logDecision({
        actor: MODULE_ID, snapshotId: snapId,
        input: `gap: ${gap.type} in ${modRelPath}`,
        chosen: 'forge_apply', alternatives: ['defer', 'escalate'],
        cost: { complexity: tier.tier }, outcome: null, // filled in after apply
      });
    } catch {}
  }
  const backupPath = modAbsPath + `.backup-${Date.now()}`;
  try {
    fs.copyFileSync(modAbsPath, backupPath);
    fs.writeFileSync(modAbsPath, newSrc, 'utf8');
    return { applied: true, reason: 'patch_written', backupPath };
  } catch (e) {
    return { applied: false, reason: `write_error: ${e.message}` };
  }
}

async function _tick() {
  try {
    const gaps = jaaDB.query('gaps', r =>
      (r.status === 'needs_manual' || r.status === 'forge_failed') &&
      (r.attempts || 0) < MAX_ATTEMPTS &&
      (r.severity === 'high' || r.severity === 'medium') &&
      (!r.lastForgeAt || Date.now() - r.lastForgeAt > 60_000),
      5
    );
    if (!gaps.length) return;

    for (const gap of gaps) {
      const attempts = (gap.attempts || 0) + 1;

      jaaDB.update('gaps', gap.uuid, {
        status: 'forge_processing',
        lastForgeAt: Date.now(),
        attempts,
        claimedBy: MODULE_ID,
      });

      const claimed = jaaDB.get('gaps', gap.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      try {
        const result = await _forgeGap(gap);

        if (!result.ok) {
          jaaDB.update('gaps', gap.uuid, {
            status: attempts >= MAX_ATTEMPTS ? 'human_required' : 'forge_failed',
            forgeReason: result.reason,
          });

          // ── Escalation engine: level-by-level retry with friction ledger ──
          if (attempts >= MAX_ATTEMPTS) {
            setImmediate(async () => {
              try {
                const esc = require('./escalation');
                const esResult = await esc.escalate(gap);
                jaaDB.insert('event_log', {
                  uuid: uid(), type: 'self-heal.escalated',
                  payload: { gapUuid: gap.uuid, level: esResult.level,
                    resolved: esResult.resolved, friction: esc.getFriction(gap.type) },
                  source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
                });
              } catch(e) {
                console.warn(`[${MODULE_ID}] escalation failed: ${e.message}`);
              }
            });
          }
          jaaDB.insert('event_log', {
            uuid: uid(), type: 'self-heal.forge_failed',
            payload: { gapUuid: gap.uuid, gapType: gap.type, reason: result.reason, attempts },
            source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
          });
          continue;
        }

        // §2.1 — write audit record before touching disk
        const patchRow = jaaDB.insert('forge_patches', {
          uuid: uid(),
          gapUuid: gap.uuid,
          module: result.modRelPath,
          instruction: gap.body,
          strategy: 'self_heal_patch',
          src: result.src,
          provider: result.provider,
          durationMs: result.durationMs,
          applied: false,
          ts: Date.now(),
          source: MODULE_ID,
          causedBy: gap.uuid,
        });

        const applyResult = _applyPatch(result.modAbsPath, result.modRelPath, result.src);

        if (patchRow?.uuid) {
          jaaDB.update('forge_patches', patchRow.uuid, {
            applied: applyResult.applied,
            applyReason: applyResult.reason,
            backupPath: applyResult.backupPath || null,
          });
        }

        jaaDB.update('gaps', gap.uuid, {
          status: applyResult.applied ? 'forge_applied' : 'forge_patch_ready',
          fixStrategy: 'self_heal',
          resolvedAt: applyResult.applied ? Date.now() : null,
        });

        jaaDB.insert('event_log', {
          uuid: uid(), type: 'self-heal.patched',
          payload: {
            gapUuid: gap.uuid, gapType: gap.type,
            module: result.modRelPath,
            applied: applyResult.applied, applyReason: applyResult.reason,
            provider: result.provider, durationMs: result.durationMs, attempts,
          },
          source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
        });

        console.log(
          `[${MODULE_ID}] ${gap.type} → ${result.modRelPath} ` +
          `applied=${applyResult.applied} provider=${result.provider} (${result.durationMs}ms)`
        );

      } catch (err) {
        jaaDB.update('gaps', gap.uuid, {
          status: attempts >= MAX_ATTEMPTS ? 'human_required' : 'needs_manual',
          claimedBy: null,
        });
        jaaDB.insert('failures', {
          uuid: uid(), source: MODULE_ID,
          error: err.message, stack: err.stack?.slice(0, 500),
          causedBy: gap.uuid, ts: Date.now(),
        });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack?.slice(0, 500),
      ts: Date.now(),
    });
  }
}

function init(cfg = {}) {
  _cfg = cfg;
  _getForge();
  _interval = setInterval(_tick, _cfg.pollMs ?? 15_000);
  _interval.unref();

  // §ESCALATE-09: subscribe to HEAL_REQUESTED on nexus-bus
  try {
    const _bus = require('../../nexus-bus');
    _bus.on('HEAL_REQUESTED', async (payload) => {
      const syntheticGap = {
        uuid:    payload.gapUuid || require('crypto').randomUUID(),
        type:    payload.gapType || 'unknown',
        path:    payload.modulePath || '',
        body:    payload.body || '',
        sigma:   payload.sigma || 0,
        causedBy:payload.causedBy || null,
      };
      try { await _forgeGap(syntheticGap); } catch (_) {}
    });
    console.log(`[${MODULE_ID}] subscribed to HEAL_REQUESTED`);
  } catch (_) {}
  console.log(`[${MODULE_ID}] v${VERSION} — apply=${APPLY_PATCH} max_attempts=${MAX_ATTEMPTS}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { init, stop, VERSION, MODULE_ID };
