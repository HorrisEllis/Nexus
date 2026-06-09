'use strict';
// ── cortex/self-heal/index.js ─────────────────────────────────────────────────
// UUID: nexus-self-heal-v1-0000-4000-0000-000000000001
// Version: 1.0.0
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

const SAFE_MODULES = new Set([
  'cortex/gate/gap-finder.js',
  'cortex/healer/index.js',
  'cortex/automation/engine.js',
  'cortex/agents/ollama/index.js',
  'cortex/agents/claude/index.js',
  'guardian/lib/gap-hunter.js',
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
  if (!SAFE_MODULES.has(modRelPath)) return { applied: false, reason: `not_in_safe_list: ${modRelPath}` };
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
  console.log(`[${MODULE_ID}] v${VERSION} — apply=${APPLY_PATCH} max_attempts=${MAX_ATTEMPTS}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { init, stop, VERSION, MODULE_ID };
