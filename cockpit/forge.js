'use strict';
/**
 * @module       forge
 * @component_id rheon.forge
 * @version      1.0.0
 * @uuid         rheon-forge-0000-2026-0529-jamesbrooks-001
 *
 * AI-powered self-modification engine.
 * Local-first. No API key. No external dependency.
 *
 * LLM routing priority (§LOCAL_FIRST):
 *   1. Guardian HTTP  — http://127.0.0.1:7820/command (running NEXUS session)
 *   2. Ollama         — http://127.0.0.1:11434/api/generate (local model)
 *   3. FAIL LOUD      — §1.2: nothing silently fails
 *
 * Four entry points (same contract as causal-nexus/forge v5.0.0):
 *   forgeModule(src, instruction, opts)  — full module rewrite
 *   forgePatch(src, patchSpec, opts)     — minimal targeted patch
 *   forgeGate(description, opts)         — generate SISO gate function body
 *   forgeHook(src, hookSpec, opts)       — add new exported function with UUID
 *
 * ForgePatchRecord written to JAA (store.insert) before patch is applied. Always. §2.1
 */

const http = require('http');

// ── Config ─────────────────────────────────────────────────────────────────────
const GUARDIAN_HTTP_URL = process.env.RHEON_GUARDIAN_URL  || 'http://127.0.0.1:7820';
const OLLAMA_URL        = process.env.RHEON_OLLAMA_URL    || 'http://127.0.0.1:11434';
const OLLAMA_MODEL      = process.env.RHEON_OLLAMA_MODEL  || 'deepseek-coder-v2:16b-lite-instruct-q4_K_M';
const FORGE_TIMEOUT_MS  = 120_000;

// ── RHEON system prompt nucleus ────────────────────────────────────────────────
const SYSTEM_NUCLEUS = `\
You are the RHEON Kernel forge — an AI that modifies live JavaScript modules
in a running cognitive runtime.

DESIGN LAWS (never violate):
  §1.1  Nothing pretends to work — no stubs, no fake success returns
  §1.2  Nothing silently fails — every error: named, typed, thrown or returned
  §2.1  JAA write before behavior — persistence before action
  §5.1  UUID on everything — every new symbol gets a UUID comment
  §CF   No engine consumes raw meaning — all engines operate on ConstraintField
  §SISO Every gate has exactly one signature — collision is a hard error

AXIOMS:
  - Zero external npm dependencies. Never import from npm.
  - All mutations flow through the SISO bus via emit(), never direct calls.
  - Every new exported symbol must have a @hook UUID comment above it.
    Format: // @hook <uuid>  <module>:<symbol>  kind:<function|factory|constant>
  - Never remove existing @hook UUIDs or change existing function signatures.
  - Source is CommonJS (require/module.exports). Keep it.
  - Loud failure modes: errors must be observable, never silently swallowed.
  - Constraint field is the input substrate. Raw text is never passed to engines.`;

// ── ForgePatchRecord ───────────────────────────────────────────────────────────
const ForgePatchRecord = {
  create(fields) {
    return Object.freeze({
      uuid: null, module: null, instruction: null, strategy: null,
      src: null, gateFn: null, hooksDelta: [], durationMs: 0,
      provider: null, ts: Date.now(), error: null,
      ...fields,
    });
  },
};

// ── UUID helpers ───────────────────────────────────────────────────────────────
function _stableUuid(seed) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  const h3 = (h1 ^ h2) >>> 0, h4 = (h2 ^ (h1 << 5)) >>> 0;
  const hex = (h1.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0') + h3.toString(16).padStart(8,'0') + h4.toString(16).padStart(8,'0')).slice(0, 32);
  const b = hex.match(/.{1,2}/g).map(x => parseInt(x, 16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map(x => x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}
function _patchUuid(s1, s2) { return _stableUuid(`patch:${s1}:${s2.slice(0,40)}:${Date.now()}`); }

function _extractCode(text) {
  const jsBlock = text.match(/```(?:javascript|js)\s*\n([\s\S]*?)```/);
  if (jsBlock) return jsBlock[1].trim();
  const plain   = text.match(/```\s*\n([\s\S]*?)```/);
  if (plain)    return plain[1].trim();
  return text.trim();
}

function _extractHookUUIDs(src) {
  const uuids = [], pat = /@hook\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
  let m; while ((m = pat.exec(src)) !== null) uuids.push(m[1]);
  return uuids;
}
function _newHooks(oldSrc, newSrc) {
  const oldSet = new Set(_extractHookUUIDs(oldSrc));
  return _extractHookUUIDs(newSrc).filter(u => !oldSet.has(u));
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function _httpPost(url, body, timeoutMs = FORGE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const data   = JSON.stringify(body);
    const parsed = new URL(url);
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || 80,
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`[forge] timeout ${timeoutMs}ms → ${url}`)); }, timeoutMs);
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        clearTimeout(timer);
        try   { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
    req.write(data); req.end();
  });
}

// ── LLM Router ────────────────────────────────────────────────────────────────
// Priority: Guardian HTTP → Ollama → FAIL LOUD
// Guardian routes internally to whatever local model is running.
// Ollama is direct fallback if Guardian is not running.

async function _tryGuardianHttp(systemPrompt, userMessage) {
  const jobId = _stableUuid(`forge:${Date.now()}:${userMessage.slice(0,40)}`);
  const t0    = Date.now();

  const submit = await _httpPost(`${GUARDIAN_HTTP_URL}/command`, {
    jobId,
    command:  'forge',
    prompt:   `${systemPrompt}\n\n---\n\n${userMessage}`,
    provider: 'local',
  });

  if (!submit?.body?.accepted && !submit?.body?.jobId) {
    throw new Error(`[forge] Guardian rejected: ${JSON.stringify(submit?.body).slice(0,120)}`);
  }

  // Poll for response using Guardian's response endpoint
  const POLL_MS = 800, DEADLINE = Date.now() + FORGE_TIMEOUT_MS;
  while (Date.now() < DEADLINE) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const res = await _httpPost(`${GUARDIAN_HTTP_URL}/response/${jobId}`, {}).catch(() => null);
    if (res?.body?.text) {
      return { text: res.body.text, durationMs: Date.now() - t0, provider: 'guardian-http' };
    }
    if (res?.body?.status === 'failed') {
      throw new Error(`[forge] Guardian job failed: ${res.body.error || 'unknown'}`);
    }
  }
  throw new Error(`[forge] Guardian poll timeout after ${FORGE_TIMEOUT_MS}ms`);
}

async function _tryOllama(systemPrompt, userMessage) {
  const t0  = Date.now();
  const res = await _httpPost(`${OLLAMA_URL}/api/generate`, {
    model:  OLLAMA_MODEL,
    system: systemPrompt,
    prompt: userMessage,
    stream: false,
  });
  if (res.status !== 200 || !res.body?.response) {
    throw new Error(`[forge] Ollama ${res.status}: ${JSON.stringify(res.body).slice(0,200)}`);
  }
  return { text: res.body.response, durationMs: Date.now() - t0, provider: 'ollama' };
}

async function _callLLM(systemPrompt, userMessage) {
  const errs = [];

  try { return await _tryGuardianHttp(systemPrompt, userMessage); }
  catch (e) { errs.push(`guardian-http: ${e.message}`); }

  try { return await _tryOllama(systemPrompt, userMessage); }
  catch (e) { errs.push(`ollama: ${e.message}`); }

  // §1.2 — nothing silently fails
  throw new Error(
    `[forge] All LLM backends failed.\n  ${errs.join('\n  ')}\n` +
    `  Ensure Guardian is running (${GUARDIAN_HTTP_URL}) or Ollama is running (${OLLAMA_URL})`
  );
}

// ── forgeModule ────────────────────────────────────────────────────────────────
// @hook rheon-forge-module-0000-2026-0529-001  forge:forgeModule  kind:function
async function forgeModule(moduleSrc, instruction, { moduleName = 'unknown', store = null, bus = null } = {}) {
  const system = `${SYSTEM_NUCLEUS}\n\nYou are patching the '${moduleName}' module.\nReturn ONLY the complete patched JavaScript source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nInstruction: ${instruction}`;

  let r;
  try { r = await _callLLM(system, user); }
  catch (e) {
    bus?.emit('forge:failed', { module: moduleName, error: e.message, strategy: 'module' });
    const rec = ForgePatchRecord.create({ module: moduleName, instruction, strategy: 'module', error: e.message, provider: 'failed' });
    store?.insert('forge_patches', rec);  // §2.1 write before behavior
    return rec;
  }

  const newSrc = _extractCode(r.text), hooksDelta = _newHooks(moduleSrc, newSrc);
  const rec = ForgePatchRecord.create({ uuid: _patchUuid(moduleName, instruction), module: moduleName, instruction, strategy: 'module', src: newSrc, hooksDelta, durationMs: r.durationMs, provider: r.provider });
  store?.insert('forge_patches', rec);
  bus?.emit('forge:complete', { module: moduleName, strategy: 'module', hooksDelta, durationMs: r.durationMs, provider: r.provider });
  return rec;
}

// ── forgePatch ─────────────────────────────────────────────────────────────────
// @hook rheon-forge-patch-0000-2026-0529-002  forge:forgePatch  kind:function
async function forgePatch(moduleSrc, patchSpec, { moduleName = 'unknown', store = null, bus = null } = {}) {
  const instruction = `Apply this patch:\n${JSON.stringify(patchSpec, null, 2)}`;
  const system = `${SYSTEM_NUCLEUS}\n\nApply a minimal targeted patch to '${moduleName}'.\nReturn ONLY the complete patched JavaScript source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nPatch spec:\n${JSON.stringify(patchSpec, null, 2)}`;

  let r;
  try { r = await _callLLM(system, user); }
  catch (e) {
    bus?.emit('forge:failed', { module: moduleName, error: e.message, strategy: 'patch' });
    const rec = ForgePatchRecord.create({ module: moduleName, instruction, strategy: 'patch', error: e.message, provider: 'failed' });
    store?.insert('forge_patches', rec);
    return rec;
  }

  const newSrc = _extractCode(r.text), hooksDelta = _newHooks(moduleSrc, newSrc);
  const rec = ForgePatchRecord.create({ uuid: _patchUuid(moduleName, JSON.stringify(patchSpec)), module: moduleName, instruction, strategy: 'patch', src: newSrc, hooksDelta, durationMs: r.durationMs, provider: r.provider });
  store?.insert('forge_patches', rec);
  bus?.emit('forge:complete', { module: moduleName, strategy: 'patch', hooksDelta, durationMs: r.durationMs, provider: r.provider });
  return rec;
}

// ── forgeGate ──────────────────────────────────────────────────────────────────
// @hook rheon-forge-gate-0000-2026-0529-003  forge:forgeGate  kind:function
async function forgeGate(description, { triggerType = null, outputType = null, store = null, bus = null } = {}) {
  const system = `${SYSTEM_NUCLEUS}\n\nGenerate a SISO gate function for the RHEON Kernel.\n\nSISO gate contract:\n  - Gates receive (event, stream)\n  - Gates emit via stream.emit() — NEVER call store directly\n  - Exactly one event.type per gate — collision is a hard error\n  - Pure functions only\n\nReturn ONLY the arrow function expression in a \`\`\`javascript block.`;
  const hints  = [description, triggerType && `Trigger: '${triggerType}'`, outputType && `Output: '${outputType}'`].filter(Boolean).join('\n');

  let r;
  try { r = await _callLLM(system, `Gate description:\n${hints}`); }
  catch (e) {
    bus?.emit('forge:gate:failed', { error: e.message });
    return { ok: false, gateFn: null, error: e.message, durationMs: 0, provider: 'failed' };
  }

  const gateFn = _extractCode(r.text);
  const rec    = { uuid: _patchUuid('gate', description), description, triggerType, outputType, gateFn, durationMs: r.durationMs, provider: r.provider, ts: Date.now() };
  store?.insert('forge_gates', rec);
  bus?.emit('forge:gate:generated', { description, durationMs: r.durationMs, provider: r.provider });
  return { ok: true, gateFn, error: null, durationMs: r.durationMs, provider: r.provider };
}

// ── forgeHook ──────────────────────────────────────────────────────────────────
// @hook rheon-forge-hook-0000-2026-0529-004  forge:forgeHook  kind:function
async function forgeHook(moduleSrc, hookSpec, { moduleName = 'unknown', store = null, bus = null } = {}) {
  const hookUuid = _stableUuid(`${moduleName}:${hookSpec.name}`);
  const system = `${SYSTEM_NUCLEUS}\n\nAdd a new exported function to '${moduleName}'.\nInject this @hook comment immediately above the export:\n// @hook ${hookUuid}  ${moduleName}:${hookSpec.name}  kind:function\n\nReturn ONLY the complete patched source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nNew function spec:\n${JSON.stringify(hookSpec, null, 2)}`;

  let r;
  try { r = await _callLLM(system, user); }
  catch (e) {
    bus?.emit('forge:failed', { module: moduleName, error: e.message, strategy: 'hook' });
    const rec = ForgePatchRecord.create({ module: moduleName, instruction: hookSpec.name, strategy: 'hook', error: e.message, provider: 'failed' });
    store?.insert('forge_patches', rec);
    return rec;
  }

  const newSrc = _extractCode(r.text);
  const rec    = ForgePatchRecord.create({ uuid: hookUuid, module: moduleName, instruction: `Add hook: ${hookSpec.name}`, strategy: 'hook', src: newSrc, hooksDelta: [hookUuid], durationMs: r.durationMs, provider: r.provider });
  store?.insert('forge_patches', rec);
  bus?.emit('forge:hook:added', { module: moduleName, hookName: hookSpec.name, hookUuid, durationMs: r.durationMs, provider: r.provider });
  return rec;
}

// ── Health check ───────────────────────────────────────────────────────────────
// @hook rheon-forge-health-0000-2026-0529-005  forge:healthCheck  kind:function
async function healthCheck() {
  const out = { guardianHttp: false, ollama: false, ollamaModels: [], ollamaModel: OLLAMA_MODEL, guardianUrl: GUARDIAN_HTTP_URL, ollamaUrl: OLLAMA_URL };
  try {
    const r = await _httpPost(`${GUARDIAN_HTTP_URL}/health`, {}, 3000).catch(() => null);
    out.guardianHttp = r?.status === 200;
  } catch {}
  try {
    const r = await _httpPost(`${OLLAMA_URL}/api/tags`, {}, 3000).catch(() => null);
    if (r?.status === 200 && r?.body?.models) { out.ollama = true; out.ollamaModels = r.body.models.map(m => m.name); }
  } catch {}
  out.anyAvailable = out.guardianHttp || out.ollama;
  return out;
}

module.exports = { ForgePatchRecord, forgeModule, forgePatch, forgeGate, forgeHook, healthCheck, _callLLM, _extractCode, _stableUuid };
