'use strict';
// ── cortex/resilience/index.js ────────────────────────────────────────────────
// UUID: nexus-resilience-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// FALLBACK STRATEGY ENGINE
//
// Every failure has a ranked chain of strategies, tried in order until one works.
// The chain for any problem is:
//
//   1. Auto-fix     — deterministic, no AI needed (restart process, clear queue)
//   2. Diagnose     — run cli/diagnose.js to surface exact root cause
//   3. Forge/Ollama — local AI patches the failing module
//   4. Guardian AI  — outsource to Claude or ChatGPT via the running userscript
//   5. Escalate     — write human_required gap with full context
//
// Every strategy attempt is written to JAA before execution (§2.1).
// Every failure of a strategy triggers the next one.
// The engine is a poll loop — it watches for gaps that haven't been actioned.
//
// §M1: init(cfg) + stop()
// §M2: reads: gaps, failures, project_registry
//      writes: event_log, failures, gaps, agent_calls, resilience_log

const fs            = require('fs');
const path          = require('path');
const http          = require('http');
const { spawnSync } = require('child_process');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'resilience';
const VERSION   = '1.0.0';
const ROOT      = path.join(__dirname, '..', '..');

// ── Config ────────────────────────────────────────────────────────────────────
const GUARDIAN_URL = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

// Gap types that resilience handles (everything else → human_required directly)
const HANDLED_GAP_TYPES = new Set([
  'stale_module', 'recurring_failure', 'missing_file', 'import_error',
  'stuck_call', 'contract_violation', 'contract_repeated_violation',
  'regime_degraded', 'replay_divergence', 'raid_ess_unresolve',
]);

// ── HTTP helpers (no external deps) ───────────────────────────────────────────
function _post(url, body, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const data   = JSON.stringify(body);
    const parsed = new URL(url);
    const req    = http.request({
      hostname: parsed.hostname,
      port:     parsed.port || 80,
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(buf), status: res.statusCode }); }
        catch { resolve({ ok: res.statusCode < 400, body: buf, status: res.statusCode }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(data);
    req.end();
  });
}

function _get(url, timeoutMs = 5_000) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.get({
      hostname: parsed.hostname, port: parsed.port || 80,
      path: parsed.pathname + (parsed.search || ''), timeout: timeoutMs,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(buf) }); }
        catch { resolve({ ok: res.statusCode < 400, body: buf }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

// ── Log to resilience_log table ───────────────────────────────────────────────
function _log(gapUuid, strategy, result, detail = '') {
  jaaDB.insert('resilience_log', {
    uuid:      uid(),
    gapUuid,
    strategy,
    result,    // 'success' | 'failed' | 'skipped' | 'pending'
    detail:    detail.slice(0, 500),
    ts:        Date.now(),
    source:    MODULE_ID,
  });
}

// ── STRATEGY 1: Auto-fix (deterministic, no AI) ───────────────────────────────
async function strategyAutoFix(gap) {
  _log(gap.uuid, 'auto_fix', 'pending', `attempting auto-fix for ${gap.type}`);

  switch (gap.type) {

    case 'stuck_call': {
      // Mark the stuck agent_call as failed and re-enqueue
      const callUuid = (gap.path || '').replace('agent_calls/', '');
      const call = callUuid ? jaaDB.get('agent_calls', callUuid) : null;
      if (call && call.status === 'processing') {
        jaaDB.update('agent_calls', callUuid, {
          status: 'failed',
          error:  `auto-resolved by resilience: stuck in processing for >${Math.round((Date.now()-(call.startedAt||call._ts))/1000)}s`,
          resolvedAt: Date.now(),
        });
        // Re-enqueue with same params
        jaaDB.insert('agent_calls', {
          uuid:           uid(),
          intent:         call.intent || call.prompt?.slice(0, 80) || 'retry',
          prompt:         call.prompt || '',
          preferredAgent: call.preferredAgent || 'ollama',
          tags:           [...(call.tags || []), 'resilience-retry'],
          status:         'pending',
          source:         MODULE_ID,
          causedBy:       gap.uuid,
          ts:             Date.now(),
        });
        _log(gap.uuid, 'auto_fix', 'success', `stuck_call ${callUuid} failed+re-enqueued`);
        return { ok: true, detail: `re-enqueued ${callUuid}` };
      }
      _log(gap.uuid, 'auto_fix', 'skipped', 'call not found or not stuck');
      return { ok: false };
    }

    case 'stale_module': {
      // Check if the module is actually dead by probing its health endpoint
      const modName = (gap.path || '').replace('modules/', '');
      const PORTS = { orchestrator:9000, bridge:9999, cortex:3748, guardian:7820, idearium:4800, emerge:4242 };
      const port  = PORTS[modName];
      if (port) {
        const check = await _get(`http://127.0.0.1:${port}/health`);
        if (check.ok) {
          // Module is actually alive — false positive, resolve gap
          jaaDB.update('gaps', gap.uuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: 'false_positive' });
          _log(gap.uuid, 'auto_fix', 'success', `${modName} is alive on :${port} — false positive resolved`);
          return { ok: true, detail: 'false positive' };
        }
      }
      _log(gap.uuid, 'auto_fix', 'skipped', 'module genuinely stale — needs diagnose');
      return { ok: false };
    }

    case 'contract_violation': {
      // Contract violations are informational — auto-acknowledge after logging
      const existing = jaaDB.query('law_violations', v => v.callUuid === gap.causedBy && !v.acknowledged, 5);
      for (const v of existing) {
        jaaDB.update('law_violations', v.uuid, { acknowledged: true, acknowledgedAt: Date.now() });
      }
      // Resolve the gap — it's been logged, that's enough
      jaaDB.update('gaps', gap.uuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: 'auto_acknowledge' });
      _log(gap.uuid, 'auto_fix', 'success', `${existing.length} violations acknowledged`);
      return { ok: true, detail: 'acknowledged' };
    }

    default:
      _log(gap.uuid, 'auto_fix', 'skipped', `no auto-fix for ${gap.type}`);
      return { ok: false };
  }
}

// ── STRATEGY 2: Diagnose ──────────────────────────────────────────────────────
// Runs cli/diagnose.js targeted at the failing system.
// Parses the output for PASS/FAIL/WARN counts and fix commands.
// If --fix mode resolves it, marks gap resolved.
async function strategyDiagnose(gap) {
  _log(gap.uuid, 'diagnose', 'pending', `running diagnose for ${gap.path}`);

  // Map gap paths to system names
  const pathToSystem = {
    'modules/orchestrator': 'orchestrator', 'modules/bridge': 'bridge',
    'modules/cortex':       'cortex',       'modules/guardian': 'guardian',
    'modules/idearium':     'idearium',     'modules/emerge': 'emerge',
    'failures/orchestrator': 'orchestrator', 'failures/bridge': 'bridge',
    'failures/cortex':       'cortex',       'failures/guardian': 'guardian',
    'failures/idearium':     'idearium',     'failures/emerge': 'emerge',
  };
  const gapPath = gap.path || '';
  let system = pathToSystem[gapPath];
  if (!system) {
    // Try to extract system name from path
    const parts = gapPath.split('/');
    const known = ['orchestrator','bridge','cortex','guardian','idearium','emerge'];
    system = parts.find(p => known.includes(p)) || '';
  }

  try {
    // First: run diagnose without --fix to get a picture
    const diagArgs = ['cli/diagnose.js', ...(system ? [system] : [])];
    const probe = spawnSync('node', diagArgs, {
      cwd: ROOT, encoding: 'utf8', timeout: 30_000,
    });

    const output = (probe.stdout || '') + (probe.stderr || '');
    const pass   = (output.match(/✓/g) || []).length;
    const fail   = (output.match(/✗/g) || []).length;
    const warn   = (output.match(/⚠/g) || []).length;

    // Write diagnose result to event_log
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'resilience.diagnose.result',
      payload: { gapUuid: gap.uuid, system: system||'all', pass, fail, warn, output: output.slice(0, 2000) },
      source:  MODULE_ID,
      causedBy: gap.uuid,
      ts:      Date.now(),
    });

    if (fail === 0 && warn <= 2) {
      // All clear — gap was transient
      jaaDB.update('gaps', gap.uuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: 'diagnose_clear' });
      _log(gap.uuid, 'diagnose', 'success', `diagnose clear: ${pass}✓ ${fail}✗ ${warn}⚠`);
      return { ok: true, detail: `diagnose clear — ${pass} pass` };
    }

    if (fail > 0) {
      // Run with --fix
      const fixProbe = spawnSync('node', [...diagArgs, '--fix'], {
        cwd: ROOT, encoding: 'utf8', timeout: 60_000,
      });
      const fixOut  = (fixProbe.stdout || '') + (fixProbe.stderr || '');
      const fixPass = (fixOut.match(/✓/g) || []).length;
      const fixFail = (fixOut.match(/✗/g) || []).length;

      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.diagnose.fix_result',
        payload: { gapUuid: gap.uuid, system: system||'all', pass: fixPass, fail: fixFail, output: fixOut.slice(0, 2000) },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });

      if (fixFail === 0) {
        jaaDB.update('gaps', gap.uuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: 'diagnose_fix' });
        _log(gap.uuid, 'diagnose', 'success', `--fix resolved all: ${fixPass}✓`);
        return { ok: true, detail: `--fix resolved` };
      }

      _log(gap.uuid, 'diagnose', 'failed', `${fixFail} failures remain after --fix`);
      return { ok: false, detail: `${fixFail} still failing`, diagOutput: output };
    }

    _log(gap.uuid, 'diagnose', 'skipped', 'only warnings — not auto-resolvable');
    return { ok: false, detail: `${warn} warnings` };

  } catch (e) {
    _log(gap.uuid, 'diagnose', 'failed', e.message);
    return { ok: false, error: e.message };
  }
}

// ── STRATEGY 3: Ollama local forge ────────────────────────────────────────────
// Tries Ollama first (LAW_I local-first), builds a repair prompt from the gap,
// and applies the patch if forge is available and NEXUS_FORGE_APPLY=true.
async function strategyOllamaForge(gap) {
  _log(gap.uuid, 'ollama_forge', 'pending', `checking ollama for ${gap.type}`);

  // Is Ollama up?
  const health = await _get(`${OLLAMA_URL}/api/tags`);
  if (!health.ok) {
    _log(gap.uuid, 'ollama_forge', 'skipped', 'Ollama offline');
    return { ok: false, reason: 'ollama_offline' };
  }

  const models = (health.body?.models || []).map(m => m.name || m.model || '').filter(Boolean);
  if (!models.length) {
    _log(gap.uuid, 'ollama_forge', 'skipped', 'no Ollama models loaded');
    return { ok: false, reason: 'no_models' };
  }

  // Build a repair prompt from the gap
  const prompt = [
    `You are the NEXUS self-repair kernel. A runtime gap was detected:`,
    ``,
    `Gap type:     ${gap.type}`,
    `Path:         ${gap.path}`,
    `Severity:     ${gap.severity}`,
    `Description:  ${gap.body}`,
    ``,
    `Your task: diagnose the root cause and propose a precise fix.`,
    `If the fix requires a code change, return the complete fixed JavaScript source in a \`\`\`javascript block.`,
    `If the fix is operational (restart a service, clear a queue), return the exact command to run.`,
    `Be specific. Be minimal. Do not change unrelated code.`,
  ].join('\n');

  try {
    const model  = models[0];
    const result = await _post(`${OLLAMA_URL}/api/generate`, {
      model, prompt, stream: false,
    }, 60_000);

    if (!result.ok || !result.body?.response) {
      _log(gap.uuid, 'ollama_forge', 'failed', `Ollama returned no response`);
      return { ok: false };
    }

    const response = result.body.response;

    // Write the AI's suggestion to JAA before doing anything with it
    jaaDB.insert('forge_patches', {
      uuid:        uid(),
      gapUuid:     gap.uuid,
      module:      gap.path,
      instruction: gap.body,
      strategy:    'ollama_forge',
      src:         response,
      provider:    `ollama/${model}`,
      durationMs:  result.body.total_duration ? Math.round(result.body.total_duration / 1e6) : 0,
      applied:     false,
      ts:          Date.now(),
      source:      MODULE_ID,
      causedBy:    gap.uuid,
    });

    // Try to apply if forge module is available and apply mode is on
    const forgeApply = process.env.NEXUS_FORGE_APPLY === 'true';
    if (forgeApply) {
      try {
        const forge = require('../../cockpit/forge');
        // Extract code block from response if present
        const codeMatch = response.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
        if (codeMatch) {
          // Resolve module path from gap
          const modPath = _resolveModulePath(gap);
          if (modPath) {
            const modAbs = path.join(ROOT, modPath);
            const backup = modAbs + `.backup-${Date.now()}`;
            fs.copyFileSync(modAbs, backup);
            fs.writeFileSync(modAbs, codeMatch[1], 'utf8');

            jaaDB.update('gaps', gap.uuid, {
              status: 'forge_applied', resolvedAt: Date.now(), fixStrategy: 'ollama_forge',
            });
            _log(gap.uuid, 'ollama_forge', 'success', `patch applied to ${modPath}`);
            return { ok: true, detail: `patched ${modPath}`, provider: `ollama/${model}` };
          }
        }
      } catch (_) {}
    }

    // Audit-only mode — patch written to forge_patches, mark gap as patch_ready
    jaaDB.update('gaps', gap.uuid, {
      status: 'forge_patch_ready',
      fixStrategy: 'ollama_forge',
    });
    _log(gap.uuid, 'ollama_forge', 'success', `patch written to forge_patches (audit mode)`);
    return { ok: true, detail: 'patch written (audit mode)', provider: `ollama/${model}` };

  } catch (e) {
    _log(gap.uuid, 'ollama_forge', 'failed', e.message);
    return { ok: false, error: e.message };
  }
}

// ── STRATEGY 4: Outsource to Guardian AI (Claude or ChatGPT userscript) ───────
// This dispatches a structured repair prompt to the running userscript session.
// If no tab is connected, the job queues and fires when the user opens the browser.
// The response comes back via the NCP channel and gets stored in guardian JAA.
async function strategyGuardianAI(gap, opts = {}) {
  const provider = opts.provider || 'claude'; // prefer claude for code repair
  _log(gap.uuid, `guardian_ai_${provider}`, 'pending', `dispatching to ${provider} via Guardian`);

  // Build a repair prompt
  const prompt = [
    `NEXUS SYSTEM SELF-REPAIR REQUEST`,
    ``,
    `A critical runtime gap was detected in the NEXUS orchestration system.`,
    `Your response will be used directly by the self-healing engine.`,
    ``,
    `GAP DETAILS:`,
    `  Type:        ${gap.type}`,
    `  Path:        ${gap.path}`,
    `  Severity:    ${gap.severity}`,
    `  Description: ${gap.body}`,
    ``,
    `SYSTEM CONTEXT:`,
    `  Platform:    Node.js ${process.version}, NEXUS v3.5`,
    `  Architecture: SISO event bus, JAA persistence, CJS modules`,
    `  Axioms: §1.1 nothing pretends to work, §1.2 nothing silently fails, §2.1 persistence before action`,
    ``,
    `TASK:`,
    `  1. Identify the precise root cause of this gap`,
    `  2. Write a minimal targeted fix`,
    `  3. Return ONLY the fixed JavaScript source in a \`\`\`javascript block`,
    `  4. If it's not a code problem, return the exact operational steps to resolve it`,
    ``,
    `Do not explain. Do not apologize. Return the fix only.`,
  ].join('\n');

  try {
    // Check if Guardian is running
    const guardianHealth = await _get(`${GUARDIAN_URL}/health`);
    if (!guardianHealth.ok) {
      _log(gap.uuid, `guardian_ai_${provider}`, 'skipped', 'Guardian offline');
      return { ok: false, reason: 'guardian_offline' };
    }

    // §2.1 — write the agent_call to JAA before dispatching
    const callRecord = jaaDB.insert('agent_calls', {
      uuid:           uid(),
      intent:         `resilience:repair:${gap.type}`,
      prompt,
      preferredAgent: provider,
      tags:           ['resilience', 'self-repair', gap.type],
      status:         'pending',
      source:         MODULE_ID,
      causedBy:       gap.uuid,
      ts:             Date.now(),
    });

    // Dispatch to Guardian via /command
    const dispatch = await _post(`${GUARDIAN_URL}/command`, {
      provider,
      command: 'code',
      prompt,
      jobId:  callRecord.uuid,
    }, 10_000);

    if (!dispatch.ok) {
      _log(gap.uuid, `guardian_ai_${provider}`, 'failed', `dispatch rejected: ${JSON.stringify(dispatch.body).slice(0, 100)}`);
      jaaDB.update('agent_calls', callRecord.uuid, { status: 'failed', error: 'dispatch rejected' });
      return { ok: false, reason: 'dispatch_rejected' };
    }

    const jobId  = dispatch.body?.jobId || callRecord.uuid;
    const status = dispatch.body?.status || 'unknown';

    jaaDB.update('agent_calls', callRecord.uuid, {
      status:     'dispatched',
      routedTo:   provider,
      routedAt:   Date.now(),
      guardianJobId: jobId,
    });

    // Update the gap to show it's been handed to AI
    jaaDB.update('gaps', gap.uuid, {
      status:      'ai_dispatched',
      fixStrategy: `guardian_ai_${provider}`,
      aiJobId:     jobId,
      aiProvider:  provider,
    });

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'resilience.ai_dispatched',
      payload: { gapUuid: gap.uuid, provider, jobId, queueStatus: status },
      source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
    });

    if (status === 'queued') {
      _log(gap.uuid, `guardian_ai_${provider}`, 'success',
        `queued — will execute when ${provider} tab connects via Tampermonkey`);
    } else {
      _log(gap.uuid, `guardian_ai_${provider}`, 'success', `dispatched — job ${jobId}`);
    }

    return { ok: true, jobId, status, provider };

  } catch (e) {
    _log(gap.uuid, `guardian_ai_${provider}`, 'failed', e.message);
    return { ok: false, error: e.message };
  }
}

// ── STRATEGY 5: Escalate to human ────────────────────────────────────────────
function strategyEscalate(gap, context = []) {
  _log(gap.uuid, 'escalate', 'pending', 'all strategies exhausted — escalating to human');

  const summary = [
    `Gap ${gap.uuid.slice(0, 8)}: ${gap.type} (${gap.severity})`,
    `Path: ${gap.path}`,
    `Problem: ${gap.body}`,
    `Strategies tried: ${context.join(' → ')}`,
    `Attempts: ${(gap.attempts || 0) + 1}`,
  ].join('\n');

  jaaDB.update('gaps', gap.uuid, {
    status:           'human_required',
    fixStrategy:      'escalated',
    escalationSummary: summary,
    escalatedAt:      Date.now(),
  });

  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'resilience.escalated',
    payload: { gapUuid: gap.uuid, gapType: gap.type, summary },
    source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
  });

  _log(gap.uuid, 'escalate', 'success', 'marked human_required');
  return { ok: true, escalated: true };
}

// ── Module path resolver ──────────────────────────────────────────────────────
function _resolveModulePath(gap) {
  const bodyMatch = (gap.body || '').match(/(?:module|file|path)[:\s]+([^\s,]+\.js)/i);
  if (bodyMatch) {
    const p = path.join(ROOT, bodyMatch[1]);
    if (fs.existsSync(p)) return bodyMatch[1];
  }
  const seg = (gap.path || '').replace(/^modules\//, '').replace(/^failures\//, '').split('/')[0];
  const candidates = [
    `cortex/${seg}/index.js`, `cortex/core/${seg}/index.js`,
    `cortex/gate/${seg}.js`, `cortex/${seg}.js`,
    `guardian/${seg}/index.js`, `guardian/lib/${seg}.js`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(ROOT, c))) return c;
  }
  return null;
}

// ── Main strategy runner ──────────────────────────────────────────────────────
// Runs the strategy chain for a single gap.
// Stops when one succeeds, escalates if all fail.
async function _runStrategies(gap) {
  const tried = [];

  // Claim the gap
  jaaDB.update('gaps', gap.uuid, {
    status:    'resilience_processing',
    claimedBy: MODULE_ID,
    claimedAt: Date.now(),
    attempts:  (gap.attempts || 0) + 1,
  });

  // Verify claim
  const claimed = jaaDB.get('gaps', gap.uuid);
  if (!claimed || claimed.claimedBy !== MODULE_ID) return;

  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'resilience.started',
    payload: { gapUuid: gap.uuid, gapType: gap.type, severity: gap.severity },
    source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
  });

  try {

    // ── Strategy 1: Auto-fix ─────────────────────────────────────────────────
    tried.push('auto_fix');
    const r1 = await strategyAutoFix(gap);
    if (r1.ok) {
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.resolved',
        payload: { gapUuid: gap.uuid, strategy: 'auto_fix', detail: r1.detail },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return;
    }

    // ── Strategy 2: Diagnose ─────────────────────────────────────────────────
    tried.push('diagnose');
    const r2 = await strategyDiagnose(gap);
    if (r2.ok) {
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.resolved',
        payload: { gapUuid: gap.uuid, strategy: 'diagnose', detail: r2.detail },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return;
    }

    // ── Strategy 3: Ollama local forge ───────────────────────────────────────
    tried.push('ollama_forge');
    const r3 = await strategyOllamaForge(gap);
    if (r3.ok) {
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.resolved',
        payload: { gapUuid: gap.uuid, strategy: 'ollama_forge', detail: r3.detail, provider: r3.provider },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return;
    }

    // ── Strategy 4a: Guardian AI — Claude ────────────────────────────────────
    tried.push('guardian_claude');
    const r4a = await strategyGuardianAI(gap, { provider: 'claude' });
    if (r4a.ok) {
      // Dispatched — the response will come back async. Mark in-flight.
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.ai_in_flight',
        payload: { gapUuid: gap.uuid, strategy: 'guardian_claude', jobId: r4a.jobId },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return; // Gap is now 'ai_dispatched' — watchdog will check response
    }

    // ── Strategy 4b: Guardian AI — ChatGPT ───────────────────────────────────
    tried.push('guardian_chatgpt');
    const r4b = await strategyGuardianAI(gap, { provider: 'chatgpt' });
    if (r4b.ok) {
      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.ai_in_flight',
        payload: { gapUuid: gap.uuid, strategy: 'guardian_chatgpt', jobId: r4b.jobId },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return;
    }

    // ── Strategy 5: Escalate ─────────────────────────────────────────────────
    tried.push('escalate');
    strategyEscalate(gap, tried);

  } catch (err) {
    // Unexpected failure in the strategy runner itself
    jaaDB.update('gaps', gap.uuid, {
      status:    'needs_manual',
      claimedBy: null,
    });
    jaaDB.insert('failures', {
      uuid:     uid(),
      source:   MODULE_ID,
      error:    err.message,
      stack:    err.stack?.slice(0, 500),
      causedBy: gap.uuid,
      ts:       Date.now(),
    });
  }
}

// ── AI response watchdog ──────────────────────────────────────────────────────
// Polls gaps in 'ai_dispatched' state to check if the Guardian job completed.
// When a response arrives, writes the AI suggestion to forge_patches.
async function _checkAIResponses() {
  const dispatched = jaaDB.query('gaps', g => g.status === 'ai_dispatched', 10);
  if (!dispatched.length) return;

  for (const gap of dispatched) {
    if (!gap.aiJobId) continue;

    // Check Guardian for the job response
    try {
      const r = await _get(`${GUARDIAN_URL}/response/${gap.aiJobId}`);
      if (!r.ok || !r.body?.text) continue; // not ready yet

      const response = r.body.text;

      // §2.1 — write before doing anything
      jaaDB.insert('forge_patches', {
        uuid:        uid(),
        gapUuid:     gap.uuid,
        module:      gap.path,
        instruction: gap.body,
        strategy:    `guardian_ai_${gap.aiProvider || 'claude'}`,
        src:         response,
        provider:    gap.aiProvider || 'claude',
        durationMs:  r.body.durationMs || 0,
        applied:     false,
        ts:          Date.now(),
        source:      MODULE_ID,
        causedBy:    gap.uuid,
      });

      jaaDB.update('gaps', gap.uuid, {
        status:      'forge_patch_ready',
        fixStrategy: `guardian_ai_${gap.aiProvider}`,
        aiResponse:  response.slice(0, 500),
      });

      jaaDB.insert('event_log', {
        uuid:    uid(),
        type:    'resilience.ai_response_received',
        payload: { gapUuid: gap.uuid, provider: gap.aiProvider, jobId: gap.aiJobId, responseLen: response.length },
        source:  MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });

      _log(gap.uuid, `guardian_ai_${gap.aiProvider}_response`, 'success',
        `response received (${response.length} chars) — patch written to forge_patches`);

    } catch (_) {}
  }
}

// ── Main poll tick ────────────────────────────────────────────────────────────
async function _tick() {
  try {
    // Find gaps that are unhandled, high/medium severity, not already in progress
    const gaps = jaaDB.query('gaps', g =>
      HANDLED_GAP_TYPES.has(g.type) &&
      (g.status === 'pending' || g.status === 'needs_manual') &&
      (g.severity === 'high' || g.severity === 'medium') &&
      (!g.claimedBy || g.claimedBy !== MODULE_ID) &&
      (g.attempts || 0) < 5 &&
      // Don't re-attempt within 2 minutes
      (!g.lastResilienceAt || Date.now() - g.lastResilienceAt > 120_000),
      3 // process 3 gaps per tick
    );

    for (const gap of gaps) {
      // Stamp before running so concurrent ticks don't double-process
      jaaDB.update('gaps', gap.uuid, { lastResilienceAt: Date.now() });
      await _runStrategies(gap);
    }

    // Check for AI responses on in-flight gaps
    await _checkAIResponses();

  } catch (err) {
    jaaDB.insert('failures', {
      uuid:  uid(),
      source: MODULE_ID,
      error:  err.message,
      stack:  err.stack?.slice(0, 500),
      ts:     Date.now(),
    });
  }
}

// ── init / stop ───────────────────────────────────────────────────────────────
let _interval = null;

function init(cfg = {}) {
  _interval = setInterval(_tick, cfg.pollMs ?? 20_000);
  _interval.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — strategy chain: auto_fix → diagnose → ollama → claude → chatgpt → escalate`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// Export strategies for direct use by other modules
module.exports = {
  init, stop,
  strategyAutoFix,
  strategyDiagnose,
  strategyOllamaForge,
  strategyGuardianAI,
  strategyEscalate,
  VERSION, MODULE_ID,
};
