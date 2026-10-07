'use strict';
/**
 * ollama/lib/ollama-client.js
 * Every HTTP call this bridge makes TO the local Ollama daemon
 * (http://127.0.0.1:11434 by default). Nothing here queues, dispatches,
 * or tracks jobs — that's lib/dispatch.js. This is just the wire.
 */

const http   = require('http');
const config = require('../config.js');
const { state } = require('./state.js');

const OLLAMA_HOST = config.OLLAMA_HOST;

async function checkOllama() {
  return new Promise(res => {
    const u = new URL(OLLAMA_HOST);
    http.get(
      { hostname: u.hostname, port: u.port || 11434, path: '/api/tags', timeout: config.HEALTH_CHECK_TIMEOUT_MS },
      r => { state.ollamaOnline = r.statusCode === 200; res(state.ollamaOnline); }
    ).on('error', () => { state.ollamaOnline = false; res(false); });
  });
}

// §GAP CLOSED 2026-07-07 — lib/agent-tools/'s runToolLoop() needed a real
// callModel(messages, toolSchemas) implementation; this is it. Uses
// Ollama's real /api/chat (not /api/generate — that endpoint has no
// tools param) with tools declared. qwen2.5-coder confirmed to support
// Ollama's native tool-calling before this was built, not assumed.
function callOllamaChatWithTools(model, messages, toolSchemas, timeoutMs, caller = 'ollama-bridge.tools') {
  // §0.39.266 — num_ctx sized to the conversation + tool schemas; every call recorded (lib/ollama-activity.js)
  const OA = require('../../lib/ollama-activity.js');
  const chars = JSON.stringify(messages || []).length + JSON.stringify(toolSchemas || []).length;
  const ctx = OA.withNumCtx({}, chars);
  const body = JSON.stringify({ model, messages, tools: toolSchemas, stream: false, options: ctx.options });
  const t0 = Date.now();
  const done = (ok, error) => OA.record({ caller, op: 'chat+tools', model, promptChars: chars, numCtx: ctx.numCtx, ms: Date.now() - t0, ok, error, warning: ctx.warning });
  return new Promise((resolve, reject) => {
    const u = new URL(`${OLLAMA_HOST}/api/chat`);
    const req = http.request({
      hostname: u.hostname, port: u.port || 11434, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs || config.CHAT_TOOLS_TIMEOUT_MS,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          const msg = parsed.message || {};
          done(true);
          resolve({
            text: msg.content || '',
            toolCalls: (msg.tool_calls || []).map(tc => ({
              id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments,
            })),
          });
        } catch (e) { done(false, e.message); reject(e); }
      });
    });
    req.on('error', (e) => { done(false, e.message); reject(e); });
    req.on('timeout', () => { req.destroy(); done(false, 'timeout'); reject(new Error('ollama chat request timeout')); });
    req.write(body);
    req.end();
  });
}

// §0.39.289 — James: "ollama has been known to cut off blocks … if it gets cut off, what about injecting the cut off
// part into the agent, and having it finish it." Three causes, measured in this function:
//   1. a non-streaming request with a 45 s TOTAL timeout — a local model writing a whole phase was killed at 45 s
//      (James's phase build: "ollama · 46s · blocked: empty"). Now streamed: the timeout is IDLE (no token for
//      timeoutMs), under a total cap (config.RAW_GENERATE_TOTAL_MS, 10 min).
//   2. `out.response || ''` — a thinking model (qwen3, deepseek-r1 …) that spent its budget in `thinking` returned
//      '' and the job read as an empty reply. Now: thinking with no answer → one retry with think:false.
//   3. done_reason 'length' was dropped — a reply cut at num_predict landed as if complete. Now it is continued
//      (lib/reply-continuation.js: the tail is shown back, the model continues, the parts are stitched).
function _generateOnce(model, prompt, maxTokens, idleMs, caller, extra = {}) {
  const OA = require('../../lib/ollama-activity.js');
  const want = maxTokens || config.DEFAULT_MAX_TOKENS;
  const ctx = OA.withNumCtx({ num_predict: want, temperature: extra.temperature != null ? extra.temperature : 0.2 }, String(prompt || '').length + String(extra.system || '').length, want);
  const body = JSON.stringify({ model, prompt, stream: true, options: ctx.options, ...(extra.system ? { system: extra.system } : {}), ...(extra.think === false ? { think: false } : {}) });
  const t0 = Date.now();
  const done = (ok, error) => OA.record({ caller, op: 'generate', model, promptChars: String(prompt || '').length, numCtx: ctx.numCtx, ms: Date.now() - t0, ok, error, warning: ctx.warning });
  return new Promise((resolve, reject) => {
    let text = '', thinking = '', buf = '', settled = false, idle = null;
    // §0.39.356 LS1 — each token as it arrives, to whoever wants to show the model writing (never in the way of the reply)
    const _tell = (d, kind) => { if (typeof extra.onDelta === 'function') { try { extra.onDelta(d, kind); } catch (_) {} } };
    const total = setTimeout(() => fail(`ollama generate exceeded ${Math.round(config.RAW_GENERATE_TOTAL_MS / 1000)} s in total`), config.RAW_GENERATE_TOTAL_MS);
    const fail = (msg) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); try { req.destroy(); } catch (_) {} done(false, msg); reject(new Error(msg)); };
    const ok = (o) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); done(true); resolve({ text, thinking, doneReason: o.done_reason || null, evalCount: o.eval_count || null }); };
    // §0.39.364 — before the first byte Ollama is loading the model and reading the prompt, not stalling: a 16b on CPU
    // with a 10k-char prompt can take longer than the 45 s allowed between tokens. The first wait is RAW_FIRST_TOKEN_MS.
    let first = true;
    const arm = () => {
      clearTimeout(idle);
      const ms = first ? Math.max(idleMs || config.RAW_GENERATE_TIMEOUT_MS, config.RAW_FIRST_TOKEN_MS || 0) : (idleMs || config.RAW_GENERATE_TIMEOUT_MS);
      const why = first ? 'before its first token (loading the model and reading the prompt)' : '(idle timeout)';
      idle = setTimeout(() => fail(`ollama sent nothing for ${ms} ms ${why} — ${text.length} chars received`), ms);
    };
    const u   = new URL(`${OLLAMA_HOST}/api/generate`);
    const req = http.request({
      hostname: u.hostname, port: u.port || 11434,
      path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      if (r.statusCode < 200 || r.statusCode >= 300) {
        let e = ''; r.on('data', c => e += c);
        r.on('end', () => { let d = e; try { d = JSON.parse(e).error || e; } catch (_) {} fail(`ollama HTTP ${r.statusCode} for model "${model}": ${d}`); });
        return;
      }
      r.on('data', c => {
        first = false;
        arm();
        buf += c.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let o; try { o = JSON.parse(line); } catch (_) { continue; }
          if (o.error) return fail(`ollama generation error for model "${model}": ${o.error}`);
          if (o.response) { text += o.response; _tell(o.response, 'text'); }
          if (o.thinking) { thinking += o.thinking; _tell(o.thinking, 'thinking'); }
          if (o.done) return ok(o);
        }
      });
      r.on('end', () => {
        // the last line can arrive without its newline — an error object included ({"error":"model not found"})
        if (buf.trim()) {
          let o = null; try { o = JSON.parse(buf); } catch (_) {}
          if (o && o.error) return fail(`ollama generation error for model "${model}": ${o.error}`);
          if (o && o.response) { text += o.response; _tell(o.response, 'text'); }
          if (o && o.thinking) { thinking += o.thinking; _tell(o.thinking, 'thinking'); }
          if (o && o.done) return ok(o);
        }
        if (!settled) ok({ done_reason: 'stream-ended' });
      });
    });
    req.on('error', (e) => fail(e.message));
    arm();
    req.end(body);
  });
}

// For Ollama the provider's own signal is trusted: continue on done_reason 'length' or an unclosed code fence —
// never on a prose guess (each continuation is a whole local generation).
function _ollamaCut(text, { doneReason } = {}) {
  if (doneReason === 'length') return { cut: true, reason: 'token limit (done_reason: length)' };
  if (((String(text || '').match(/^\s*```/gm) || []).length) % 2 === 1) return { cut: true, reason: 'code fence opened and not closed' };
  return { cut: false, reason: null };
}

// opts (0.39.291): { system, temperature } (0.39.356: onDelta) — so idearium's chunk builds (idearium/agent-suite generateWithOllama) use this
// one hardened path too: streamed, idle timeout, thinking-only retry, a cut reply continued
async function callOllamaRaw(model, prompt, maxTokens, timeoutMs, caller = 'ollama-bridge.job', opts = {}) {
  // §0.39.356 LS1 — opts.onDelta(delta, 'text' | 'thinking'): every round's tokens (the think:false retry and each continuation too)
  const base = { ...(opts.system ? { system: opts.system } : {}), ...(opts.temperature != null ? { temperature: opts.temperature } : {}), ...(typeof opts.onDelta === 'function' ? { onDelta: opts.onDelta } : {}) };
  let first = await _generateOnce(model, prompt, maxTokens, timeoutMs, caller, base);
  if (!first.text.trim() && first.thinking.trim()) {
    console.warn(`[ollama-bridge] ${model}: ${first.thinking.length} chars of thinking and no answer (${first.doneReason || 'done'}) — asking again with think:false`);
    first = await _generateOnce(model, prompt, maxTokens, timeoutMs, `${caller} (think:false)`, { ...base, think: false });
  }
  const RC = require('../../lib/reply-continuation.js');
  const out = await RC.complete((p) => _generateOnce(model, p, maxTokens, timeoutMs, `${caller} (continue)`, base), prompt,
    { first, maxRounds: config.CONTINUE_MAX_ROUNDS, isCut: _ollamaCut });
  if (out.rounds) console.log(`[ollama-bridge] ${model}: reply continued ${out.rounds}× (${out.reasons.join('; ')})${out.cut ? ' — STILL CUT after the last round' : ''}`);
  return out.text;
}

// Real agent-tools loop, separate from the raw call — a tool-enabled
// request has a genuinely different cost/latency profile (multiple model
// round-trips possible), a caller opts into that explicitly via
// POST /api/jobs/tools rather than a silent mode switch.
async function dispatchWithTools(prompt, model, maxIterations) {
  const { runToolLoop } = require('../../lib/agent-tools/index.js');
  const systemPrompt = 'You are a coding assistant with access to a read_file tool for reading real files in this project. Use it when you need to see a file\'s actual content before answering.';
  return runToolLoop(
    (messages, toolSchemas) => callOllamaChatWithTools(model, messages, toolSchemas),
    systemPrompt, prompt, { maxIterations: maxIterations || 6 }
  );
}

module.exports = { checkOllama, callOllamaChatWithTools, callOllamaRaw, dispatchWithTools, _generateOnce, _ollamaCut };
