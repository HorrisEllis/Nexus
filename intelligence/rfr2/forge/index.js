/**
 * @module       forge
 * @uuid         0091ce2c-287d-4a7b-827a-60c7fb7793d7
 * @version      5.0.2
 *
 * AI-powered self-modification engine. Calls the Anthropic API to rewrite,
 * patch, generate gates, or add hooks to live modules.
 *
 * Four entry points:
 *   forgeModule(src, instruction, opts)  — full module rewrite
 *   forgePatch(src, patchSpec, opts)     — minimal targeted patch
 *   forgeGate(description, opts)         — generate gate function body
 *   forgeHook(src, hookSpec, opts)       — add new exported function with UUID
 *
 * Design laws enforced in SYSTEM_NUCLEUS prompt (never violate):
 *   I-1  event.id is UUID v4 — never deterministic, never reused
 *   C-1  every edge has explicitly declared edgeType
 *   C-2  macro:detected is never a kernel event
 *   C-4  gates execute before listeners
 *   A-2  gates return GateOutput[] — never call ingest() directly
 *   H-1  edge graph bounded — pruned on ring eviction
 *   H-2  typeIndex O(1) — Set<id> per type
 *   H-3  query.typeIds() returns defensive copy
 *   H-6  seenMap LRU-bounded at 10,000
 *
 * Fix (audit finding): _deterministicUuid for forgeHook now accepts a stable
 * seed without Date.now(), producing a stable UUID per (module, hook name) pair.
 * _patchUuid still includes Date.now() for uniqueness of patch records.
 *
 * @hook 1bcd9b96-0d13-48b5-84d0-044b7c768be9  forgeModule
 * @hook 60de8b56-ccd2-40ba-95d0-e03d191c8484  forgePatch
 * @hook 3b160d46-8e4e-4c69-bc3c-0c7e577b2209  forgeGate
 * @hook 674d5576-5fb4-40d9-add7-ee9c26ce7f9a  forgeHook
 * @hook df40d4ff-6d77-4656-86f8-1c50ee3b1afa  ForgePatchRecord
 */

'use strict';

// §REMOVED 2026-07-14 — FORGE_MODEL/FORGE_TOKENS/FORGE_API used to hardcode
// one specific external provider and model. Removed rather than left
// unused: leaving them would misleadingly suggest forge still targets
// Anthropic's API specifically. It no longer decides a provider at all —
// see _callAPI below, which routes through Guardian/RAID instead.

// ── ForgePatchRecord ──────────────────────────────────────────────────────────

/**
 * Standard shape returned by all forge operations.
 * @hook df40d4ff-6d77-4656-86f8-1c50ee3b1afa  forge:ForgePatchRecord
 */
const ForgePatchRecord = {
  create(fields) {
    return Object.freeze({
      uuid: null, module: null, instruction: null, strategy: null,
      src: null, gateFn: null, hooksDelta: [], inputTokens: 0,
      outputTokens: 0, durationMs: 0, ts: Date.now(), ...fields,
    });
  },
};

// ── System prompt nucleus ─────────────────────────────────────────────────────

const SYSTEM_NUCLEUS = `\
You are the Causal Nexus forge — an AI that modifies live JavaScript modules
in a running causal event engine.

DESIGN LAWS (never violate):
  I-1  event.id is UUID v4 — never deterministic, never reused
  C-1  every edge has explicitly declared edgeType at ingestion time
  C-2  macro:detected is never a kernel event — projection only
  C-4  gates execute before listeners
  A-2  gates return GateOutput[] — never call ingest() directly
  H-1  edge graph is bounded — edges pruned on ring eviction
  H-2  typeIndex is O(1) — Set<id> per type
  H-3  query.typeIds() returns a defensive copy
  H-6  seenMap is LRU-bounded at 10,000 entries

AXIOMS:
  - Zero external dependencies. Never import from npm.
  - All mutations flow through the kernel API.
  - Projections are read-only — they never call kernel.ingest().
  - Every new exported symbol must have a @hook UUID comment above it.
    Format: // @hook <uuid>  <module>:<symbol>  kind:<function|factory|constant>
  - Source is ES module syntax (import/export). Keep it.
  - Never remove existing @hook UUIDs or change existing function signatures.
  - Loud failure modes: errors must be observable, never silently swallowed.`;

// ── API call ──────────────────────────────────────────────────────────────────
// §FIXED 2026-07-14 — this called api.anthropic.com directly, hardcoded,
// bypassing RAID entirely. "No Anthropic API. Never asked for that." Real
// correction: this system already has a governing router for exactly this
// decision (cortex/core/raid/index.js — LAW_I tries Ollama first, always;
// Claude is the unconditional LAST resort, never the only or first
// option). forgeModule/forgePatch/forgeGate/forgeHook never decided a
// provider themselves before, and still don't — they call this function,
// which now routes through Guardian's real job dispatch (the same,
// already-tested mechanism lib/agent-tools/tools/browser/browser-action.js uses)
// and lets RAID make the actual routing decision, same as every other
// real LLM call in this system. Return shape kept identical
// ({text, inputTokens, outputTokens, durationMs}) so nothing downstream
// of this function needed to change.
const GUARDIAN_PORT = 7820;

async function _createGuardianJob(command, content) {
  const res = await fetch(`http://127.0.0.1:${GUARDIAN_PORT}/command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, content: JSON.stringify(content) }),
    // deliberately no `provider` field — RAID decides, per LAW_I, not forge.
  });
  if (!res.ok) throw new Error(`guardian /command rejected the job: ${res.status}`);
  return res.json(); // { ok, jobId, status, provider }
}

async function _pollGuardianJob(jobId, deadlineMs = 30000) {
  const started = performance.now();
  while (performance.now() - started < deadlineMs) {
    const res = await fetch(`http://127.0.0.1:${GUARDIAN_PORT}/jobs?limit=200`);
    const parsed = await res.json().catch(() => null);
    const job = parsed?.jobs?.find(j => j.id === jobId);
    if (job?.status === 'complete') return job;
    if (job?.status === 'error') throw new Error(job.error || 'forge job failed');
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`forge job did not complete within ${deadlineMs}ms`);
}

async function _callAPI(systemPrompt, userMessage) {
  const t0 = performance.now();
  const created = await _createGuardianJob('forge', { systemPrompt, userMessage });
  if (!created.ok) throw new Error(`Forge dispatch failed: ${created.error || 'unknown error'}`);
  const job = await _pollGuardianJob(created.jobId);
  const durationMs = Math.round(performance.now() - t0);
  // job.response is whatever the real provider (chosen by RAID, not
  // forge) returned — a plain string, same shape every other guardian
  // job produces. Token counts are honestly zero when the real provider
  // doesn't report them (e.g. local Ollama) rather than fabricated.
  return {
    text: job.response || '',
    inputTokens: job.inputTokens || 0,
    outputTokens: job.outputTokens || 0,
    durationMs,
    provider: job.provider || created.provider || 'unknown', // real provenance — which real provider RAID actually chose
  };
}

function _extractCode(text) {
  const jsBlock    = text.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);
  if (jsBlock) return jsBlock[1].trim();
  const plainBlock = text.match(/```\s*\n([\s\S]*?)```/);
  if (plainBlock) return plainBlock[1].trim();
  return text.trim();
}

function _extractHookUUIDs(src) {
  const uuids = [];
  const pat   = /@hook\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
  let m;
  while ((m = pat.exec(src)) !== null) uuids.push(m[1]);
  return uuids;
}

function _newHooks(oldSrc, newSrc) {
  const oldSet = new Set(_extractHookUUIDs(oldSrc));
  return _extractHookUUIDs(newSrc).filter(u => !oldSet.has(u));
}

// ── UUID helpers ──────────────────────────────────────────────────────────────

/**
 * FNV-based UUID — stable per seed (no Date.now).
 * Used for hook identity where stability across calls matters.
 */
function _stableUuid(seed) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  const h3 = (h1 ^ h2) >>> 0;
  const h4 = (h2 ^ (h1 << 5)) >>> 0;
  const hex = (
    h1.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0') +
    h3.toString(16).padStart(8,'0') + h4.toString(16).padStart(8,'0')
  ).slice(0, 32);
  const b = hex.match(/.{1,2}/g).map(x => parseInt(x, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map(x => x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

/** UUID for patch records — includes Date.now() for uniqueness. */
function _patchUuid(seed1, seed2) {
  return _stableUuid(`patch:${seed1}:${seed2.slice(0, 40)}:${Date.now()}`);
}

// ── forgeModule ───────────────────────────────────────────────────────────────

/**
 * Rewrite an entire module with an AI instruction.
 * @hook 1bcd9b96-0d13-48b5-84d0-044b7c768be9  forge:forgeModule
 */
async function forgeModule(moduleSrc, instruction, {
  moduleName = 'unknown', manifest = null, kernel = null, deltaLib = null,
} = {}) {
  const system = `${SYSTEM_NUCLEUS}\n\nYou are patching the '${moduleName}' module.${
    manifest ? `\n\nModule context:\n${JSON.stringify(manifest, null, 2)}` : ''
  }\n\nReturn ONLY the complete patched JavaScript source in a \`\`\`javascript block.`;
  const user = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nInstruction: ${instruction}`;

  let apiResult;
  try { apiResult = await _callAPI(system, user); }
  catch (e) {
    kernel?.ingest('nexus:forge:failed', { module: moduleName, error: e.message, strategy: 'module' }, { source: 'forge:forgeModule' });
    return ForgePatchRecord.create({ module: moduleName, instruction, strategy: 'module', error: e });
  }

  const newSrc     = _extractCode(apiResult.text);
  const hooksDelta = _newHooks(moduleSrc, newSrc);
  const rec        = ForgePatchRecord.create({
    uuid: _patchUuid(moduleName, instruction), module: moduleName, instruction,
    strategy: 'module', src: newSrc, hooksDelta,
    inputTokens: apiResult.inputTokens, outputTokens: apiResult.outputTokens,
    durationMs: apiResult.durationMs, ts: Date.now(),
  });

  if (deltaLib?.patches) deltaLib.patches.push(rec);
  kernel?.ingest('nexus:forge:complete', { module: moduleName, strategy: 'module', hooksDelta, durationMs: rec.durationMs }, { source: 'forge:forgeModule' });
  return rec;
}

// ── forgePatch ────────────────────────────────────────────────────────────────

/**
 * Apply a minimal targeted patch from a structured spec.
 * @hook 60de8b56-ccd2-40ba-95d0-e03d191c8484  forge:forgePatch
 */
async function forgePatch(moduleSrc, patchSpec, {
  moduleName = 'unknown', kernel = null, deltaLib = null,
} = {}) {
  const instruction = `Apply this patch:\n${JSON.stringify(patchSpec, null, 2)}`;
  const system = `${SYSTEM_NUCLEUS}\n\nApply a minimal targeted patch to '${moduleName}'.\nReturn ONLY the complete patched JavaScript source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nPatch spec:\n${JSON.stringify(patchSpec, null, 2)}`;

  let apiResult;
  try { apiResult = await _callAPI(system, user); }
  catch (e) {
    kernel?.ingest('nexus:forge:failed', { module: moduleName, error: e.message, strategy: 'patch' }, { source: 'forge:forgePatch' });
    return ForgePatchRecord.create({ module: moduleName, instruction, strategy: 'patch', error: e });
  }

  const newSrc     = _extractCode(apiResult.text);
  const hooksDelta = _newHooks(moduleSrc, newSrc);
  const rec        = ForgePatchRecord.create({
    uuid: _patchUuid(moduleName, JSON.stringify(patchSpec)), module: moduleName, instruction,
    strategy: 'patch', src: newSrc, hooksDelta,
    inputTokens: apiResult.inputTokens, outputTokens: apiResult.outputTokens,
    durationMs: apiResult.durationMs, ts: Date.now(),
  });

  if (deltaLib?.patches) deltaLib.patches.push(rec);
  kernel?.ingest('nexus:forge:complete', { module: moduleName, strategy: 'patch', hooksDelta, durationMs: rec.durationMs }, { source: 'forge:forgePatch' });
  return rec;
}

// ── forgeGate ─────────────────────────────────────────────────────────────────

/**
 * Generate a gate function body from a natural language description.
 * Returns an arrow function string ready for evalGate().
 * @hook 3b160d46-8e4e-4c69-bc3c-0c7e577b2209  forge:forgeGate
 */
async function forgeGate(description, {
  triggerType = null, outputType = null, kernel = null, globals = {},
} = {}) {
  const availableGlobals = ['gateOutput', ...Object.keys(globals)].join(', ');
  const system = `${SYSTEM_NUCLEUS}\n\nGenerate a gate function for Causal Nexus.\n\nGate contract (A-2):\n  - Gates receive (ev, query)\n  - Gates must return GateOutput[] via gateOutput()\n  - Gates NEVER call kernel.ingest() directly\n\nAvailable: ${availableGlobals}\n\nReturn ONLY the arrow function expression in a \`\`\`javascript block.`;
  const hints  = [description, triggerType && `Trigger: '${triggerType}'`, outputType && `Output: '${outputType}'`].filter(Boolean).join('\n');

  let apiResult;
  try { apiResult = await _callAPI(system, `Gate description:\n${hints}`); }
  catch (e) {
    kernel?.ingest('nexus:forge:gate:failed', { error: e.message }, { source: 'forge:forgeGate' });
    return { ok: false, gateFn: null, error: e, durationMs: 0 };
  }

  const gateFn = _extractCode(apiResult.text);
  kernel?.ingest('nexus:forge:gate:generated', { description, triggerType, outputType, durationMs: apiResult.durationMs }, { source: 'forge:forgeGate' });
  return { ok: true, gateFn, error: null, durationMs: apiResult.durationMs };
}

// ── forgeHook ─────────────────────────────────────────────────────────────────

/**
 * Add a new exported function to a module with a stable hook UUID.
 *
 * Fix: hookUuid is now derived from _stableUuid(moduleName:hookName) — stable
 * across repeated calls with the same inputs, as hook identity requires.
 *
 * @hook 674d5576-5fb4-40d9-add7-ee9c26ce7f9a  forge:forgeHook
 */
async function forgeHook(moduleSrc, hookSpec, {
  moduleName = 'unknown', kernel = null, deltaLib = null,
} = {}) {
  // Stable UUID: same module+name always produces the same UUID
  const hookUuid = _stableUuid(`${moduleName}:${hookSpec.name}`);

  const system = `${SYSTEM_NUCLEUS}\n\nAdd a new exported function to '${moduleName}'.\nInject this @hook comment immediately above the export:\n// @hook ${hookUuid}  ${moduleName}:${hookSpec.name}  kind:function\n\nReturn ONLY the complete patched source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nNew function spec:\n${JSON.stringify(hookSpec, null, 2)}`;

  let apiResult;
  try { apiResult = await _callAPI(system, user); }
  catch (e) {
    kernel?.ingest('nexus:forge:failed', { module: moduleName, error: e.message, strategy: 'hook' }, { source: 'forge:forgeHook' });
    return ForgePatchRecord.create({ module: moduleName, instruction: hookSpec.name, strategy: 'hook', error: e });
  }

  const newSrc = _extractCode(apiResult.text);
  const rec    = ForgePatchRecord.create({
    uuid: hookUuid, module: moduleName, instruction: `Add hook: ${hookSpec.name}`,
    strategy: 'hook', src: newSrc, hooksDelta: [hookUuid],
    inputTokens: apiResult.inputTokens, outputTokens: apiResult.outputTokens,
    durationMs: apiResult.durationMs, ts: Date.now(),
  });

  if (deltaLib?.patches) deltaLib.patches.push(rec);
  kernel?.ingest('nexus:forge:hook:added', { module: moduleName, hookName: hookSpec.name, hookUuid, durationMs: rec.durationMs }, { source: 'forge:forgeHook' });
  return rec;
}

module.exports = { forgeModule, forgePatch, forgeGate, forgeHook, ForgePatchRecord };
