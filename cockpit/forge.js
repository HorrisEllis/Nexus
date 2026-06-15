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

// ── Context builder ──────────────────────────────────────────────────────────
let _ctxBuilder = null;
function _getCtxBuilder() {
  if (!_ctxBuilder) {
    try { _ctxBuilder = require('../lib/context-builder'); } catch(_) {}
  }
  return _ctxBuilder;
}

// ── Config ─────────────────────────────────────────────────────────────────────
const GUARDIAN_HTTP_URL = process.env.RHEON_GUARDIAN_URL  || 'http://127.0.0.1:7820';
const OLLAMA_URL        = process.env.RHEON_OLLAMA_URL    || 'http://127.0.0.1:11434';
const FORGE_TIMEOUT_MS  = 120_000;

// ── Ollama model cascades ─────────────────────────────────────────────────────
// Tried in order — first available model wins.
// SEAM/forge uses token-efficient local models. Claude/ChatGPT are the last resort,
// never the first choice. Tokens ∝ unresolved meaning — resolve as much as possible
// with small fast local models before escalating.
//
// Override via env vars:
//   RHEON_OLLAMA_MODEL_SEAM    — SEAM T2 chunk dispatch (default: qwen2.5-coder:1.5b)
//   RHEON_OLLAMA_MODEL_CODE    — code patches and gate generation
//   RHEON_OLLAMA_MODEL_PRIMARY — general reasoning (analysis, spec, explanation)
//   RHEON_OLLAMA_MODEL_FALLBACK— last local resort before NCP escalation

const OLLAMA_MODELS = [
  process.env.RHEON_OLLAMA_MODEL_PRIMARY   || 'mistral:7b-instruct-q4_K_M',
  process.env.RHEON_OLLAMA_MODEL_CODE      || 'qwen2.5-coder:1.5b',
  process.env.RHEON_OLLAMA_MODEL_FALLBACK  || null,
].filter(Boolean);

// Code patches and gate generation — coder-first cascade
const OLLAMA_CODE_MODELS = [
  process.env.RHEON_OLLAMA_MODEL_CODE      || 'qwen2.5-coder:1.5b',
  process.env.RHEON_OLLAMA_MODEL_PRIMARY   || 'mistral:7b-instruct-q4_K_M',
].filter(Boolean);

// SEAM T2 dispatch — token-minimised structured code completion
// Hardware: GTX 1650 (4GB VRAM), 16GB RAM, Ryzen 3700X
// qwen2.5-coder:1.5b — ~1GB VRAM, fast, code-first. Primary SEAM model.
// mistral:7b-instruct-q4_K_M — ~4GB VRAM, fills full VRAM. General fallback.
// Chunks arriving here are already maximally compressed by T0/T1.
// We are only filling genuine logic gaps — prompts are short by design.
const OLLAMA_SEAM_MODELS = [
  process.env.RHEON_OLLAMA_MODEL_SEAM || 'qwen2.5-coder:1.5b',
  process.env.RHEON_OLLAMA_MODEL_PRIMARY || 'mistral:7b-instruct-q4_K_M',
].filter(Boolean);

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

// ── _tryOllamaModel(model, systemPrompt, userMessage) ──────────────────────────
// Single model attempt — no retry, no cascade. Caller handles cascade.
async function _tryOllamaModel(model, systemPrompt, userMessage) {
  const t0  = Date.now();
  const res = await _httpPost(`${OLLAMA_URL}/api/generate`, {
    model,
    system: systemPrompt,
    prompt: userMessage,
    stream: false,
  }, FORGE_TIMEOUT_MS);

  if (res.status !== 200 || !res.body?.response) {
    throw new Error(`[forge] Ollama/${model} ${res.status}: ${JSON.stringify(res.body).slice(0,200)}`);
  }
  return { text: res.body.response, durationMs: Date.now() - t0, provider: `ollama/${model}` };
}

// ── _tryOllamaCascade(models, systemPrompt, userMessage) ───────────────────────
// Try each model in order. First success wins.
// §NO_SINGLE_POINT_OF_FAILURE: model unavailable → next model
async function _tryOllamaCascade(models, systemPrompt, userMessage) {
  const errs = [];
  for (const model of models) {
    try {
      const result = await _tryOllamaModel(model, systemPrompt, userMessage);
      return result;
    } catch(e) {
      errs.push(`${model}: ${e.message.slice(0,80)}`);
      console.warn(`[forge] ${model} failed — trying next: ${e.message.slice(0,60)}`);
    }
  }
  throw new Error('[forge] All Ollama models failed:\n  ' + errs.join('\n  '));
}

// ── _tryGuardianAsync(systemPrompt, userMessage) ──────────────────────────────
// Submit to Guardian NCP dispatch. Guardian routes to whatever tab is open.
// This is ASYNC — we submit and return the jobId. Caller polls /jobs/:id.
// Used as a fire-and-forget for non-blocking forge (large rewrites).
async function _tryGuardianAsync(systemPrompt, userMessage) {
  const t0 = Date.now();
  const res = await _httpPost(`${GUARDIAN_HTTP_URL}/command`, {
    command:  'forge',
    prompt:   `${systemPrompt}

---

${userMessage}`,
    provider: 'ollama', // route to local model via NCP
  }, 5000); // short timeout — just submit

  if (!res?.body?.id && !res?.body?.jobId) {
    throw new Error(`[forge] Guardian submit failed: ${JSON.stringify(res?.body).slice(0,120)}`);
  }
  return { text: null, jobId: res.body.id || res.body.jobId, durationMs: Date.now() - t0, provider: 'guardian-async' };
}

// ── _callLLM(systemPrompt, userMessage, opts) ─────────────────────────────────
// Routing cascade: Ollama code models → Ollama general models → Guardian async
// Context injection: prepends live NEXUS system context to every Ollama call
// §NO_SINGLE_POINT_OF_FAILURE: every failure tries the next option
// §1.2: if ALL fail, throw loud with full error chain
async function _callLLM(systemPrompt, userMessage, opts = {}) {
  const errs  = [];
  const models = opts.preferCode ? OLLAMA_CODE_MODELS : OLLAMA_MODELS;

  // §NEXUS-CTX: inject live system context into every Ollama call
  // Gives Mistral awareness of gaps, artifacts, axioms — uses local data only
  let enrichedSystem = systemPrompt;
  if (!opts.skipContext) {
    try {
      const ctxBuilder = _getCtxBuilder();
      if (ctxBuilder) {
        const ctx = await ctxBuilder.buildContext({ intent: userMessage.slice(0, 200) });
        enrichedSystem = ctx.systemPrompt + '\n\n' + systemPrompt;
      }
    } catch(_) {} // context injection never blocks dispatch
  }

  // §LAW_I equivalent for forge: local Ollama first, always
  try {
    return await _tryOllamaCascade(models, enrichedSystem, userMessage);
  } catch(e) {
    errs.push(`ollama-cascade: ${e.message.slice(0,120)}`);
  }

  // Guardian NCP dispatch as async fallback — Guardian routes to open tab
  // Only use for non-blocking tasks (patch will be returned via jobs table)
  if (!opts.requireSync) {
    try {
      const r = await _tryGuardianAsync(systemPrompt, userMessage);
      // Guardian async — text will come via NCP, not immediately
      // Return a placeholder that signals async dispatch
      return { text: null, jobId: r.jobId, durationMs: r.durationMs, provider: 'guardian-async', async: true };
    } catch(e) {
      errs.push(`guardian-async: ${e.message.slice(0,80)}`);
    }
  }

  // §1.2 — nothing silently fails
  const errMsg = '[forge] All LLM backends failed — is Ollama running? (ollama serve)' +
    '\n  Models tried: ' + models.join(', ') +
    '\n  Errors:\n  ' + errs.join('\n  ') +
    '\n  Ollama URL: ' + OLLAMA_URL;
  throw new Error(errMsg);
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
// ── SEAM T2 dispatch — token-minimised chunk completion ──────────────────────
// This is the right function for SEAM chunks. Uses OLLAMA_SEAM_MODELS cascade.
// Chunks arriving here are already maximally compressed — T0/T1 stripped everything
// deterministic. We're only filling genuine logic gaps.
//
// System prompt is tight: no preamble, no explanation, code only.
// If Ollama is entirely unavailable, escalates to Guardian NCP (chatgpt → claude).
//
// §CC-001: T2 chunks never exceed 2048 tokens on input
// §CC-002: Output must be valid JS or return error — never silent empty
async function seamDispatch(chunk, opts = {}) {
  const { intent = '', moduleName = 'seam-chunk', jobId = null } = opts;

  const system = `You are a code completion engine. Fill the implementation gap exactly.
Return ONLY the completed JavaScript. No explanation. No markdown. No preamble.
Laws: §1.1 no stubs, §1.2 nothing silent, §2.1 disk before memory, §5.1 UUID on new symbols.
Module: ${moduleName}`;

  const user = `Intent: ${intent}

Chunk to complete:
${chunk}`;

  const t0 = Date.now();

  // Try SEAM-specific model cascade first (Ollama only)
  try {
    const result = await _tryOllamaCascade(OLLAMA_SEAM_MODELS, system, user);
    if (result?.text?.trim()) {
      console.log(`[forge/seam] ${moduleName} — ${OLLAMA_SEAM_MODELS[0]} — ${Date.now()-t0}ms`);
      return { ok:true, text: result.text, provider: result.provider, durationMs: Date.now()-t0 };
    }
  } catch(e) {
    console.warn(`[forge/seam] Ollama cascade failed: ${e.message} — escalating to Guardian NCP`);
  }

  // Ollama unavailable — escalate to Guardian NCP (chatgpt preferred, claude last)
  // This should be rare. SEAM chunks are small, Ollama handles them well.
  try {
    const r = await _callLLM(system, user, { preferCode: true, requireSync: false });
    if (r?.text) {
      return { ok:true, text: r.text, provider: r.provider, durationMs: Date.now()-t0, escalated: true };
    }
  } catch(e) {
    return { ok:false, error: e.message, durationMs: Date.now()-t0 };
  }

  return { ok:false, error:'all providers exhausted', durationMs: Date.now()-t0 };
}

async function forgePatch(moduleSrc, patchSpec, { moduleName = 'unknown', store = null, bus = null } = {}) {
  const instruction = `Apply this patch:\n${JSON.stringify(patchSpec, null, 2)}`;
  // ── Inject prior chat context for continuity ─────────────────────────────
  let chatCtx = '';
  try {
    const cl = require('../lib/chat-logger');
    chatCtx = await cl.buildInjectionContext(patchSpec?.description || moduleName, {
      k: 5, threshold: 0.68, maxChars: 1500
    });
  } catch(_) {}

  const system = `${SYSTEM_NUCLEUS}\n\n${chatCtx ? chatCtx + '\n' : ''}Apply a minimal targeted patch to '${moduleName}'.\nReturn ONLY the complete patched JavaScript source in a \`\`\`javascript block.`;
  const user   = `Current source:\n\`\`\`javascript\n${moduleSrc}\n\`\`\`\n\nPatch spec:\n${JSON.stringify(patchSpec, null, 2)}`;

  let r;
  try { r = await _callLLM(system, user, { preferCode: true, requireSync: true }); }
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
  try { r = await _callLLM(system, `Gate description:\n${hints}`, { preferCode: true, requireSync: true }); }
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
module.exports = { ForgePatchRecord, forgeModule, forgePatch, forgeGate, forgeHook, healthCheck, seamDispatch, _callLLM, _extractCode, _stableUuid };
