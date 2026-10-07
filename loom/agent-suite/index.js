'use strict';
/**
 * loom/agent-suite/index.js — LOOM Agent Tool Suite
 * comp_id: nexus.loom.agent-suite
 * UUID: nexus-loom-agent-suite-v1-0000-2026-0701-jamesbrooks-001
 * Phase: 141
 *
 * Mirrors idearium/agent-suite/index.js's real, shipped pattern — same
 * tool-surface shape (system context, cortex memory query, gap/repair
 * dispatch, Ollama generation with Mistral->ChatGPT->Claude fallback) —
 * scoped to LOOM instead of Idearium's spec wizard. Ported to LOOM's own
 * CommonJS convention (the rest of loom/schema/* uses require/module.exports,
 * not idearium's ESM) rather than copied verbatim.
 *
 * Two kinds of tool here, and this file is honest about the difference:
 *
 *   LOCAL tools  — getRegistrySnapshot(), getGraph(), declareViaAgent() —
 *   touch only LOOM's own disk-first registry. Fully real, fully tested,
 *   zero external dependency.
 *
 *   NETWORK tools — getSystemContext(), queryCortexMemory(), dispatchRepair(),
 *   generateWithOllama(), buildComponentWithAgent() — talk to Guardian
 *   (:7820), Cortex (:3748), Ollama (:11434) over real HTTP, same as
 *   idearium's version. These are structurally real (same request/response
 *   shape, same error handling) but NOT verified against live servers in
 *   this session — none were running in the sandbox this was built in.
 *   Their failure-path (timeout, connection refused) IS tested, since
 *   that's verifiable without a live server; their success-path is not,
 *   and this file does not claim otherwise.
 *
 * §5.1 UUID/hook/bus registration — see bootstrap.js for this component's
 * own LOOM registration. §2.3 all state observable — every network call
 * returns { ok, ... } or { error, ... }, nothing throws past this module.
 */
const http = require('http');
const { LoomDriver } = require('../schema/index');

const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_HTTP_PORT || process.env.GUARDIAN_PORT || '7820', 10);
// ^ guardian/server.js itself reads GUARDIAN_HTTP_PORT (confirmed: line 268 of the
//   real server.js, default 7820). idearium/agent-suite/index.js — the file this
//   suite mirrors — reads GUARDIAN_PORT instead, which happens to default to the
//   same 7820 so it's silently correct today, but would silently break if anyone
//   ever overrides the port via env var and only sets one of the two names. Fixed
//   here to check the real one first.
const CORTEX_PORT   = parseInt(process.env.CORTEX_PORT   || '3748', 10);
const OLLAMA_PORT    = parseInt(process.env.OLLAMA_PORT   || '11434', 10);

// ── HTTP helper — same shape as idearium's, ported to CommonJS ─────────────
function _http(port, method, path, body = null, timeoutMs = 10000) {
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
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(data), status: res.statusCode }); }
        catch { resolve({ ok: false, data: { error: 'unparseable response', raw: data.slice(0, 200) } }); }
      });
    });
    req.on('error', e => resolve({ ok: false, data: { error: e.message, code: e.code } }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, data: { error: 'timeout' } }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function _exec(command) {
  return _http(GUARDIAN_PORT, 'POST', '/cli/exec', { command, source: 'loom.agent-suite' }, 15000)
    .then(r => r.data);
}

class LoomAgentSuite {
  constructor({ dataDir = null } = {}) {
    this.driver = new LoomDriver({ dataDir });
  }

  // ── LOCAL — LOOM's own registry, no network ────────────────────────────

  /** getRegistrySnapshot() — compact counts, for a prompt, not a dump. */
  getRegistrySnapshot() {
    const comp = this.driver.registry.all('component');
    const seam = this.driver.registry.all('seam');
    const hook = this.driver.registry.all('hook');
    const wire = this.driver.registry.all('wire');
    return {
      components: Object.keys(comp).length,
      seams: Object.keys(seam).length,
      hooks: Object.keys(hook).length,
      wires: Object.keys(wire).length,
      componentIds: Object.keys(comp),
    };
  }

  /** getGraph() — hook/wire adjacency, same shape LoomDriver.graph() returns. */
  getGraph() {
    return this.driver.graph();
  }

  /**
   * declareViaAgent(kind, payload) — the one write path an agent gets.
   * Thin wrapper over LoomDriver.declare() so an agent's tool surface is
   * exactly one call, never direct registry access.
   */
  declareViaAgent(kind, payload) {
    return this.driver.declare(kind, payload);
  }

  // ── NETWORK — Guardian / Cortex / Ollama, real HTTP, untested live ────

  /** getSystemContext() — same shape as idearium's version, LOOM-labeled. */
  async getSystemContext() {
    const [gaps, jobs, health] = await Promise.allSettled([
      _exec('gaps --status open --limit 6'),
      _exec('jobs --status delivered --limit 4'),
      _exec('health'),
    ]);

    const lines = ['## LOOM System Context\n'];
    const h = health.status === 'fulfilled' ? (health.value?.result || health.value) : null;
    if (h?.uptime) lines.push(`**Guardian:** up ${Math.round(h.uptime / 60)}min - ${h.jobs || 0} jobs`);

    const g = gaps.status === 'fulfilled' ? (gaps.value?.result?.gaps || gaps.value?.gaps || []) : [];
    lines.push(g.length ? `\n**Open Gaps (${g.length}):**` : '\n**Open Gaps:** none');
    for (const gap of g.slice(0, 5)) {
      lines.push(`- [${gap.severity || '?'}] ${gap.type}: ${(gap.body || '').slice(0, 80)}`);
    }

    const j = jobs.status === 'fulfilled' ? (jobs.value?.result?.jobs || jobs.value?.jobs || []) : [];
    if (j.length) {
      lines.push(`\n**Active Jobs (${j.length}):**`);
      for (const job of j.slice(0, 3)) lines.push(`- [${job.status}] ${job.provider}: ${(job.prompt || '').slice(0, 60)}`);
    }

    return lines.join('\n');
  }

  /** queryCortexMemory(query, limit) — same shape as idearium's version. */
  async queryCortexMemory(query, limit = 5) {
    const r = await _http(CORTEX_PORT, 'POST', '/api/memory/query', { query, limit }, 8000);
    if (!r.ok) return { error: r.data?.error || 'cortex memory unavailable' };
    return r.data;
  }

  /** dispatchRepair(gapUuid, prompt) — same shape as idearium's version. */
  dispatchRepair(gapUuid, prompt) {
    return _exec(`send ollama diagnose_and_repair --gap ${gapUuid} --prompt "${String(prompt).slice(0, 200)}"`);
  }

  /** generateWithOllama — same shape as idearium's version, direct HTTP path only
   *  (idearium's guardian/ollama-runtime streaming path is NEXUS-repo-relative
   *  and out of scope for this standalone LOOM package — see Phase 142). */
  async generateWithOllama(system, prompt, { model = 'mistral:7b-instruct-q4_K_M', timeoutMs = 120000 } = {}) {
    // §0.43.0 OR1 — the one door first (ollama/lib/ollama-client.js: streamed, continued when cut, recorded on the tape);
    // the direct HTTP below stays only for this package run standalone, without the Nexus tree around it
    let OC = null; try { OC = require('../../ollama/lib/ollama-client.js'); } catch (_) {}
    if (OC) {
      try {
        const text = await OC.callOllamaRaw(model, prompt, null, Math.min(timeoutMs, 120000), 'loom/agent-suite', { system, temperature: 0.3 });
        return String(text || '').trim() ? { ok: true, text: String(text) } : { ok: false, error: `${model} returned an empty reply` };
      } catch (e) { return { ok: false, error: e.message, code: e.code }; }
    }
    return new Promise((resolve) => {
      // §0.39.266 — num_ctx sized to the prompt; the call recorded (lib/ollama-activity.js)
      const OA = require('../../lib/ollama-activity.js');
      const _full = `${system}\n\n${prompt}`;
      const _ctx = OA.withNumCtx({ temperature: 0.3, num_predict: 2048 }, _full.length);
      const _t0 = Date.now();
      const _resolve = resolve;
      resolve = (r) => { OA.record({ caller: 'loom/agent-suite', op: 'generate', model, promptChars: _full.length, numCtx: _ctx.numCtx, ms: Date.now() - _t0, ok: !!(r && r.ok), error: r && !r.ok ? r.error : undefined, warning: _ctx.warning }); _resolve(r); };
      const body = JSON.stringify({ model, prompt: _full, stream: false, options: _ctx.options });
      const req = http.request({
        hostname: '127.0.0.1', port: OLLAMA_PORT, path: '/api/generate', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: timeoutMs,
      }, (res) => {
        let data = '';
        res.on('data', d => { data += d; });
        res.on('end', () => {
          try { resolve({ ok: true, text: JSON.parse(data).response || '' }); }
          catch { resolve({ ok: false, error: 'parse failed' }); }
        });
      });
      req.on('error', e => resolve({ ok: false, error: e.message, code: e.code }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.write(body);
      req.end();
    });
  }

  /**
   * buildComponentWithAgent(componentSpec, { preferAgent }) — LOOM's version
   * of idearium's buildChunkWithAgent: same Mistral -> ChatGPT -> Claude
   * fallback chain, scoped to "generate an implementation for an already-
   * declared LOOM component" instead of "write a spec chunk."
   */
  async buildComponentWithAgent(componentSpec, { preferAgent = 'ollama' } = {}) {
    if (preferAgent === 'ollama' || preferAgent === 'mistral') {
      const r = await this.generateWithOllama(
        'You are a precise implementation writer for a NEXUS LOOM component. Write only the requested code — no preamble.',
        JSON.stringify(componentSpec),
        { model: 'mistral:7b-instruct-q4_K_M', timeoutMs: 120000 },
      );
      if (r.ok && r.text) return { ok: true, text: r.text, agent: 'ollama' };
    }
    if (preferAgent !== 'claude') {
      const r = await _http(GUARDIAN_PORT, 'POST', '/command', {
        command: 'build', provider: 'chatgpt', prompt: JSON.stringify(componentSpec),
        meta: { source: 'loom.agent-suite', task: 'component_build' },
      }, 300000);
      if (r.ok && r.data?.jobId) return { ok: true, queued: true, jobId: r.data.jobId, agent: 'chatgpt' };
    }
    const r = await _http(GUARDIAN_PORT, 'POST', '/command', {
      command: 'build', provider: 'claude', prompt: JSON.stringify(componentSpec),
      meta: { source: 'loom.agent-suite', task: 'component_build' },
    }, 300000);
    if (r.ok && r.data?.jobId) return { ok: true, queued: true, jobId: r.data.jobId, agent: 'claude' };
    return { ok: false, error: 'all agents failed or unavailable' };
  }
}

module.exports = { LoomAgentSuite };
