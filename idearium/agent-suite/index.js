/**
 * idearium/agent-suite/index.js — Agent Tool Suite
 * UUID: idearium-agent-suite-v1-0000-4000-0000-000000000002
 * Version: 1.0.0
 * Phase: 40.5 — Agent Suite: full NEXUS tool access for spec builders
 * Seam ID: idearium.agent-suite:v1:p0001
 * Component: idearium.agent-suite
 *
 * Gives every spec-building agent the full power of NEXUS:
 *   - Cortex memory: read JAA tables, query patterns, read decision_log
 *   - Gap diagnostic: list open gaps, query by type/status
 *   - System health: service status, job queue, provider state
 *   - Spec context: read existing specs, cross-reference components
 *   - Repair: dispatch diagnostic jobs, trigger reflection
 *
 * Agent priority: Mistral (local, sovereign) → ChatGPT → Claude
 * Each agent gets the same tool surface. Mistral calls Ollama native.
 * ChatGPT and Claude get prompts with tool results injected as context.
 *
 * §5.7 — all calls go through guardian /cli/exec or cortex HTTP
 * §1.2 — every tool call result is logged
 * §2.3 — all state observable
 */

import http    from 'http';
import crypto  from 'crypto';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// §CONFIG 2026-08-23 — real, shared model config instead of this file's
// own separate hardcoded literals (was 'mistral:7b-instruct-q4_K_M' /
// 'qwen2.5-coder:1.5b', matching neither ollama/server.js's real default
// nor its own fallback after the model changed there). Required directly,
// not through the lazy ollama-runtime require used elsewhere in this
// file for actual generation calls — config.js has no external
// dependencies and nothing to defensively guard against; it's a pure
// value file, not a live service call.
const { DEFAULT_MODEL: _OLLAMA_DEFAULT, FALLBACK_MODEL: _OLLAMA_FALLBACK } = _require('../../ollama/config.js');

const MODULE_ID = 'idearium.agent-suite';
const VERSION   = '1.0.0';

const GUARDIAN_PORT  = parseInt(process.env.GUARDIAN_PORT   || '7820');
const CORTEX_PORT    = parseInt(process.env.CORTEX_PORT     || '3748');
const OLLAMA_PORT    = parseInt(process.env.OLLAMA_PORT     || '11434');
const IDEARIUM_PORT  = parseInt(process.env.IDEARIUM_PORT   || '4800');

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function _http(port, method, path, body = null, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(data), status: res.statusCode }); }
        catch { resolve({ ok: false, data: { error: 'unparseable response', raw: data.slice(0,200) } }); }
      });
    });
    req.on('error', e => resolve({ ok: false, data: { error: e.message } }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: { error: 'timeout' } }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Guardian /cli/exec wrapper ────────────────────────────────────────────────
async function _exec(command) {
  const r = await _http(GUARDIAN_PORT, 'POST', '/cli/exec',
    { command, source: 'idearium.agent-suite' }, 15000);
  return r.data;
}

// ── idearium API wrapper ──────────────────────────────────────────────────────
async function _api(method, pathStr, body = null) {
  const r = await _http(IDEARIUM_PORT, method, `/api${pathStr}`, body, 10000);
  if (!r.ok) return { error: r.data?.error || `idearium API ${method} ${pathStr} failed (status ${r.status})` };
  return r.data;
}

// ── Tool: repository access — NEXUS-001 ALWAYS_MAP_FIRST ───────────────────
// No traversal, synthesis, or mutation may happen against an unknown
// repository surface (nexus-repository-system.spec §2). These give an
// agent the deterministic MAP -> UNDERSTAND -> ACT lifecycle: get the
// topology first (getRepositoryMap), find the minimum real chunk that
// matters (getRepositorySymbols/getRepositoryChunks/getRepositoryChunk)
// rather than loading the whole repo into context, then act
// (editRepositoryFile) — every real edit re-runs the pipeline
// automatically (repo/index.js's _materializeQuiet), so the map is
// never stale after a mutation (§38, REPO-018).

export async function listRepositories(filter = {}) {
  const qs = Object.entries(filter).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return _api('GET', `/repos${qs ? `?${qs}` : ''}`);
}

export async function getRepository(repoUuid) {
  return _api('GET', `/repos/${repoUuid}`);
}

// The map (§4 ATLAS layer) — compressed topology, never raw source.
// This is the real "MAP" step of NEXUS-001; call it before anything else.
export async function getRepositoryMap(repoUuid) {
  return _api('GET', `/repos/${repoUuid}/map`);
}

export async function getRepositorySymbols(repoUuid, query = null) {
  return _api('GET', `/repos/${repoUuid}/symbols${query ? `?q=${encodeURIComponent(query)}` : ''}`);
}

// Chunk metadata only (id/file/range/symbols/hash) — the address, not the
// content. Use getRepositoryChunk(repoUuid, chunkId) for the real text of
// one specific chunk — the "minimum sufficient context" a work surface
// should hand an agent (§L7/REPO-016), not the whole file or repo.
export async function getRepositoryChunks(repoUuid, file = null) {
  return _api('GET', `/repos/${repoUuid}/chunks${file ? `?file=${encodeURIComponent(file)}` : ''}`);
}

export async function getRepositoryChunk(repoUuid, chunkId) {
  return _api('GET', `/repos/${repoUuid}/chunks/${chunkId}`);
}

export async function getRepositoryFile(repoUuid, filePath) {
  return _api('GET', `/repos/${repoUuid}/file?path=${encodeURIComponent(filePath)}`);
}

export async function getRepositoryVerification(repoUuid) {
  return _api('GET', `/repos/${repoUuid}/verification`);
}

// Deterministic modification (§L8/REPO-014/015 — a tool call, not the
// model writing bytes itself). Real content change through RepoLayer;
// repo/index.js reruns parse/atlas/chunks/verify/index right after, so
// the caller doesn't have to remember to reindex separately.
export async function editRepositoryFile(repoUuid, filePath, content) {
  return _api('POST', `/repos/${repoUuid}/file`, { path: filePath, content });
}

export async function deleteRepositoryFile(repoUuid, filePath) {
  const r = await _http(IDEARIUM_PORT, 'DELETE', `/api/repos/${repoUuid}/file?path=${encodeURIComponent(filePath)}`, null, 10000);
  if (!r.ok) return { error: r.data?.error || 'delete failed' };
  return r.data;
}

// §INCREMENTAL-REINDEX (§35) — explicit re-run, for a repo edited outside
// idearium's own write path (e.g. a direct git pull into the materialized
// directory). Native edits via editRepositoryFile/deleteRepositoryFile
// already trigger this automatically and don't need it called separately.
export async function reindexRepository(repoUuid) {
  return _api('POST', `/repos/${repoUuid}/reindex`);
}


// Given to every agent before spec building starts.
// Compact — designed to fit in a chunk prompt without dominating it.
export async function getSystemContext() {
  const [gaps, jobs, health] = await Promise.allSettled([
    _exec('gaps --status open --limit 6'),
    _exec('jobs --status delivered --limit 4'),
    _exec('health'),
  ]);

  const lines = ['## NEXUS System Context\n'];

  const h = health.status === 'fulfilled' ? health.value?.result || health.value : null;
  if (h?.uptime) lines.push(`**Guardian:** up ${Math.round(h.uptime/60)}min · ${h.jobs||0} jobs`);

  const g = gaps.status === 'fulfilled' ? (gaps.value?.result?.gaps || gaps.value?.gaps || []) : [];
  if (g.length) {
    lines.push(`\n**Open Gaps (${g.length}):**`);
    for (const gap of g.slice(0,5)) {
      lines.push(`- [${gap.severity||'?'}] ${gap.type}: ${(gap.body||'').slice(0,80)}`);
    }
  } else {
    lines.push('\n**Open Gaps:** none');
  }

  const j = jobs.status === 'fulfilled' ? (jobs.value?.result?.jobs || jobs.value?.jobs || []) : [];
  if (j.length) {
    lines.push(`\n**Active Jobs (${j.length}):**`);
    for (const job of j.slice(0,3)) {
      lines.push(`- [${job.status}] ${job.provider}: ${(job.prompt||'').slice(0,60)}`);
    }
  }

  return lines.join('\n');
}

// ── Tool: cortex memory query ─────────────────────────────────────────────────
// Agents can read cortex memory to understand existing patterns.
export async function queryCortexMemory(query, limit = 5) {
  const r = await _http(CORTEX_PORT, 'POST', '/api/memory/query',
    { query, limit }, 8000);
  if (!r.ok) return { error: r.data?.error || 'cortex memory unavailable' };
  return r.data;
}

// ── Tool: read existing component specs ──────────────────────────────────────
// Agents read specs that already exist to stay consistent with the system.
export async function getExistingSpecs(type = null) {
  const r = await _http(CORTEX_PORT, 'GET', `/api/components${type ? `?type=${type}` : ''}`,
    null, 8000);
  if (!r.ok) return [];
  return (r.data?.components || r.data || []).slice(0, 10);
}

// ── Tool: gap diagnostic ──────────────────────────────────────────────────────
export async function getGaps(filter = {}) {
  const params = Object.entries(filter)
    .map(([k,v]) => `--${k} ${v}`).join(' ');
  return _exec(`gaps ${params}`);
}

// ── Tool: repair dispatch ─────────────────────────────────────────────────────
// Agent can dispatch a repair job for a specific gap.
export async function dispatchRepair(gapUuid, prompt) {
  return _exec(`send ollama diagnose_and_repair --gap ${gapUuid} --prompt "${prompt.slice(0,200)}"`);
}

// ── Tool: read idearium ideas ─────────────────────────────────────────────────
export async function getIdeas(phase = null) {
  const r = await _http(4800, 'GET', `/api/ideas${phase ? `?phase=${phase}` : ''}`,
    null, 8000);
  return r.data;
}

// ── Ollama generation — Mistral for reasoning, Qwen for quick ────────────────
// This is what builds each chunk locally without needing a browser tab.
export async function generateWithOllama(system, prompt, { model = _OLLAMA_FALLBACK, timeoutMs = 120000 } = {}) {
  const runtime = (() => {
    try { return _require('../../ollama/ollama-runtime'); }
    catch { return null; }
  })();

  if (!runtime) {
    // Direct HTTP fallback if runtime not available
    // §0.39.266 — num_ctx sized to the prompt; the call recorded (lib/ollama-activity.js)
    const OA = _require('../../lib/ollama-activity.js');
    const _full = `${system}\n\n${prompt}`;
    const _ctx = OA.withNumCtx({ temperature: 0.3, num_predict: 2048 }, _full.length);
    const _t0 = Date.now();
    const body = JSON.stringify({ model, prompt: _full, stream: false, options: _ctx.options });
    const r = await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { resolve({ ok: true, text: JSON.parse(data).response || '' }); }
          catch { resolve({ ok: false, error: 'parse failed' }); }
        });
      });
      req.on('error', e => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.write(body);
      req.end();
    });
    OA.record({ caller: 'idearium/agent-suite', op: 'generate', model, promptChars: _full.length, numCtx: _ctx.numCtx, ms: Date.now() - _t0, ok: !!r.ok, error: r.ok ? undefined : r.error, warning: _ctx.warning });
    return r;
  }

  return new Promise((resolve) => {
    let buf = '';
    const timer = setTimeout(() => resolve({ ok: false, error: `${model} timed out after ${timeoutMs}ms` }), timeoutMs);
    runtime.streamGenerate(
      { model, prompt, system },
      (tok) => { buf += tok; },
      ()    => { clearTimeout(timer); resolve({ ok: true, text: buf.trim(), model }); },
      (err) => { clearTimeout(timer); resolve({ ok: false, error: String(err), model }); },
    );
  });
}

// ── Dispatch chunk to agent ─────────────────────────────────────────────────
// §FIX 2026-09-03 — James: "make sure the ui reflects the backend system.
// like the chunk contracts sent to where?" Traced the real dispatch path
// end to end to answer that question honestly, and found a real,
// previously-undocumented bug while doing it: this function's own header
// comment and code structure LOOKED like a real per-agent router
// (`preferAgent` parameter, a documented "priority chain"), but line 219
// hardcoded `provider: 'chatgpt'` regardless of what `preferAgent` actually
// was. Requesting gemini, deepseek, or perplexity — all real, working
// guardian providers (guardian/lib/provider-routing.js's own
// KNOWN_PROVIDERS, checked directly) — silently dispatched to ChatGPT
// instead, with zero indication anywhere that the requested agent was
// ignored. A caller (or a future UI agent-selector) trusting `preferAgent`
// would have been lied to about where its own contract actually went.
//
// Real fix: route by the REAL requested agent using guardian's REAL known
// provider list, not a hardcoded 3-name chain. ollama/mistral still run
// directly (no guardian round-trip needed for a local model); every other
// real provider goes to guardian's /command with THAT exact provider, not
// a substituted one. An unrecognized agent is now a real, loud error —
// never a silent redirect to whichever provider happened to be hardcoded.
// §0.39.267 — was a hardcoded REAL_GUARDIAN_PROVIDERS list. The list is lib/agent-providers.js now (guardian's
// userscripts on disk + copilot + ollama), the same one repo-agent, WARP's cascade and the UI read.
const _providers = () => _require('../../lib/agent-providers.js');

const BUILDER_SYSTEM = 'You are a precise technical spec writer for the NEXUS sovereign AI orchestration system. Write only the requested section content — no preamble.';

/**
 * wearHat(hat, prompt) — the hat's persona on top of the chunk prompt. The same composition every backend gets,
 * so a hat means the same thing whichever model wears it. No hat → the prompt unchanged.
 */
export function wearHat(hat, prompt) {
  const persona = hat && typeof hat.personaPrompt === 'string' ? hat.personaPrompt.trim() : '';
  if (!persona) return prompt;
  return `${persona}\n\n---\n\n${prompt}`;
}

/**
 * buildChunkWithAgent(prompt, { preferAgent, hat, model })
 *
 * §0.39.267 — James: "the agent hat is meant to be agnostic, ollama/guardian/copilot."
 *   preferAgent  'copilot' | 'ollama' (alias 'mistral') | any guardian agent on disk (alias 'auto' → copilot).
 *                'copilot' asks copilot where its default goes and sends there; if copilot can't say, nothing is sent.
 *   hat          { name, personaPrompt, ... } — worn on whichever backend answers (wearHat above).
 *   model        an Ollama tag, used only when the answer comes from ollama (the repo's Agent-tab model setting).
 * Returns { ok, text, agent, model, hat, via } or { ok, queued, jobId, agent, hat, via } or { ok:false, error }.
 * `agent` is always the real provider that answered — never 'copilot' — so a chunk's provenance stays true.
 */
export async function buildChunkWithAgent(chunkPrompt, { preferAgent = 'ollama', hat = null, model = null,
  agentId = null, compartmentId = null, repoUuid = null, memory = '', fileName = null, syntax = null } = {}) {
  // §0.39.269 — memory (lib/agent-memory.js recall, computed by the caller: this agent's earlier work from the download
  // manager + the files already built in its compartment) sits between the hat and the chunk prompt, on every backend.
  // It is NOT part of the prompt WARP caches on — the caller passes it beside the prompt, not in it.
  const withMemory = memory && String(memory).trim() ? `${String(memory).trim()}\n\n${chunkPrompt}` : chunkPrompt;
  const P = _providers();
  const r = await P.resolve(preferAgent);
  if (!r.ok) return { ok: false, error: r.error };
  const provider = r.provider;
  const via = r.via || null;
  const hatName = hat && hat.name ? hat.name : null;

  // 1. Local model — no guardian round-trip.
  if (provider === 'ollama') {
    const system = hat && hat.personaPrompt ? `${hat.personaPrompt.trim()}\n\n${BUILDER_SYSTEM}` : BUILDER_SYSTEM;
    // §0.39.267 — was _OLLAMA_FALLBACK (the 7b), which on James's 4 GB GPU timed out at 120 s on a single file
    // ("huihui_ai/qwen2.5-coder-abliterate:7b timed out after 120000ms"). The repo's Agent-tab model, else the default.
    const m = (typeof model === 'string' && model.trim()) ? model.trim() : _OLLAMA_DEFAULT;
    const g = await generateWithOllama(system, withMemory, { model: m, timeoutMs: 120000 });
    if (g.ok && g.text) {
      // Direct to Ollama (not the bridge), so the exchange is recorded here — the download manager, under the agent.
      try {
        _require('../../lib/agent-memory.js').record({ agentId: agentId || 'idearium', provider: 'ollama', model: g.model || m,
          prompt: chunkPrompt, response: g.text, compartmentId, repoUuid, path: fileName, kind: 'chunk', source: 'idearium.agent-suite' }).catch(() => {});
      } catch (_) {}
      return { ok: true, text: g.text, agent: 'ollama', model: g.model || m, hat: hatName, via };
    }
    return { ok: false, error: `ollama dispatch failed: ${g.error}${via ? ' (copilot resolved to ollama)' : ''}`, hat: hatName, via };
  }

  // 2. A guardian browser agent — exactly the one that was asked for (or that copilot resolved to).
  const q = await _http(GUARDIAN_PORT, 'POST', '/command', {
    command: 'spec', provider, prompt: wearHat(hat, withMemory),
    // §FIXED 2026-09-21 — guardian's /command reads body.source (top level) for its RAID contract lookup.
    source: 'idearium',
    // §0.39.269 — filed in the download manager under the agent that asked (one tab either way, since 0.39.247);
    // the persona is already in the prompt, so guardian adds no guessed hat; the file it is for, for code capture.
    ...(agentId ? { agentId } : {}),
    ...(hatName ? { hatInPrompt: hatName } : {}),
    ...(fileName ? { fileName } : {}), ...(syntax ? { syntax } : {}),
    meta: { source: 'idearium.agent-suite', task: 'spec_chunk', hat: hatName, via },
  }, 300000); // 5min — browser-agent NCP dispatch can be slow
  if (q.ok && q.data?.jobId) {
    // Job was queued — caller polls (pollGuardianJob).
    return { ok: true, queued: true, jobId: q.data.jobId, agent: provider, hat: hatName, via };
  }
  return { ok: false, error: `${provider} dispatch failed: ${q.data?.error || q.error || 'unknown error'}${via ? ' (copilot resolved to it)' : ''}`, hat: hatName, via };
}

// ── Wizard question builder — Qwen drives the spec wizard ─────────────────────
// Returns the next question to ask based on what's been answered so far.
export async function getNextWizardQuestion(specMeta, answeredSections) {
  const unanswered = [
    { id: 'name',        q: 'What is the name of this component?' },
    { id: 'type',        q: 'What type is it? (component / service / engine / bridge / agent)' },
    { id: 'description', q: 'What does it do in one sentence?' },
    { id: 'agent',       q: 'Which agent should wear the hat and build it? (copilot, ollama, or a guardian agent: chatgpt, claude, gemini, …)' },
    { id: 'purpose',     q: 'What problem does it solve? Why does it need to exist in NEXUS?' },
    { id: 'axioms',      q: 'Which axioms does it enforce? (e.g. §2.1, §5.1, §1.2)' },
  ].filter(q => !answeredSections[q.id]);

  if (!unanswered.length) return null; // all answered — ready to build

  // For complex questions, Qwen refines the question based on context
  const nextQ = unanswered[0];
  if (Object.keys(answeredSections).length > 2) {
    try {
      const r = await generateWithOllama(
        'You are a spec wizard for NEXUS. Ask one precise clarifying question based on what the user has already told you. Keep it short.',
        `Component so far: ${JSON.stringify(specMeta)}\nAnswered: ${JSON.stringify(answeredSections)}\nNext section to clarify: ${nextQ.id}\nDefault question: "${nextQ.q}"\nRefine this question or return it unchanged.`,
        { model: _OLLAMA_DEFAULT, timeoutMs: 15000 }
      );
      if (r.ok && r.text && r.text.length < 200) {
        return { id: nextQ.id, question: r.text.replace(/^"|"$/g, '') };
      }
    } catch (_) {}
  }

  return { id: nextQ.id, question: nextQ.q };
}

export default {
  getSystemContext, queryCortexMemory, getExistingSpecs,
  getGaps, dispatchRepair, getIdeas,
  generateWithOllama, buildChunkWithAgent, wearHat, getNextWizardQuestion,
  listRepositories, getRepository, getRepositoryMap, getRepositorySymbols,
  getRepositoryChunks, getRepositoryChunk, getRepositoryFile,
  getRepositoryVerification, editRepositoryFile, deleteRepositoryFile,
  reindexRepository,
  MODULE_ID, VERSION,
};
