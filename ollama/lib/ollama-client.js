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

// 2026-11-24 PC25 b — the model server is the first backend; Ollama the second, used only when a model is not in the model server's store.
// James, 2026-11-24: "migrate the bridge into the model server/" · "i just want to get back to the pipeline". Ollama's app is gone. The model
// server (inference/) is reached only through its drawbridge, COS's /api/cos/systems/inference/hook/<hook> (§5.16): `models` lists its models,
// `launch` says how one model's engine starts (engine, options from that model's own settings, port). COS's supervisor starts and stops each
// engine (PC20, declared by the model server); this process talks to it in the engine's own API (llama-server, OpenAI-shaped).
const COS_PORT = Number(process.env.COS_MANAGER_PORT) || 7799;
function _cosHook(hook, q, ms = 90000) {
  return new Promise((res) => {
    const body = JSON.stringify(q || {});
    const req = http.request({ hostname: '127.0.0.1', port: COS_PORT, path: `/api/cos/systems/inference/hook/${hook}`, method: 'POST', timeout: ms,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (_) { res(null); } });
    });
    req.on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
    req.end(body);
  });
}
let _msList = { at: 0, names: null };
async function _msModels() {
  if (_msList.names && Date.now() - _msList.at < 30000) return _msList.names;
  const r = await _cosHook('models', {});
  const names = r && r.ok && r.value && Array.isArray(r.value.models) ? r.value.models.map((m) => m.name) : null;
  if (names) _msList = { at: Date.now(), names };
  return names || _msList.names;
}
function _health(port, ms = 2000) {
  return new Promise((res) => {
    http.get({ hostname: '127.0.0.1', port, path: '/health', timeout: ms }, (r) => { r.resume(); res(r.statusCode === 200); })
      .on('error', () => res(false)).on('timeout', function () { this.destroy(); res(false); });
  });
}
// an act on COS's supervisor: 'rescan' (read the declarations again), or touch a process (start it when on demand; its idle clock again)
function _cosAct(proc, act) {
  return new Promise((res) => {
    const body = JSON.stringify({ by: 'rule:model-server' });
    const p = act === 'rescan' ? '/api/cos/systems/rescan' : `/api/cos/systems/${encodeURIComponent(proc)}/${act}`;
    const req = http.request({ hostname: '127.0.0.1', port: COS_PORT, path: p, method: 'POST', timeout: 15000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (_) { res(null); } });
    });
    req.on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
    req.end(body);
  });
}
// what an engine says it serves (llama-server's /v1/models names the model file); null when it does not say
function _servedFile(port) {
  return new Promise((res) => {
    http.get({ hostname: '127.0.0.1', port, path: '/v1/models', timeout: 3000 }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => { res(d ? d : null); });
    }).on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
  });
}
const _launch = new Map(), _starting = new Map();
// the port of a model the model server holds, its engine started when it is not answering; null when the model server does not hold it
async function _msPort(model) {
  const names = await _msModels();
  if (!names || !names.includes(model)) return null;
  let l = _launch.get(model);
  if (!l || Date.now() - l.at > 60000) {
    const r = await _cosHook('launch', { model });
    if (!r || !r.ok) { console.warn(`[model-server] ${model}: no launch plan — ${(r && r.why) || 'COS did not answer'}`); return null; }
    l = { at: Date.now(), v: r.value }; _launch.set(model, l);
  }
  const { port, args, process: proc } = l.v;
  // 2026-11-24: an engine answering on the port is used only when it serves this model's file (a port once gave the 3b to every DeepSeek request)
  const file = String(args[args.indexOf('-m') + 1] || '').split(/[\\/]/).pop();
  if (await _health(port)) {
    const serves = await _servedFile(port);
    if (serves == null || serves.includes(file)) { _cosAct(proc, 'touch'); return port; }   // in use: COS's idle clock starts again
    throw new Error(`port ${port} answers with another model (${serves.slice(0, 80)}), not "${model}" (${file}); not used`);
  }
  // PC20 (his, 2026-11-24: "can you hook that into cos superviser?"): COS's supervisor starts the engine (the model server declared it), stops
  // it when idle, restarts it on a crash and stops it with COS; this process never starts one of its own
  if (!_starting.has(model)) {
    _starting.set(model, (async () => {
      console.log(`[model-server] asking COS to start ${proc} (${model}) on :${port}`);
      await _cosAct(null, 'rescan');
      const t = await _cosAct(proc, 'touch');
      if (!t || t.ok === false) { console.warn(`[model-server] COS did not start ${proc}: ${(t && t.error) || 'no answer'}`); return false; }
      const until = Date.now() + (config.RAW_FIRST_TOKEN_MS || 180000);
      while (Date.now() < until) { await new Promise((r) => setTimeout(r, 1000)); if (await _health(port)) return true; }
      return false;
    })().finally(() => setTimeout(() => _starting.delete(model), 0)));
  }
  if (await _starting.get(model)) return port;
  throw new Error(`the model server's engine for "${model}" did not answer on :${port}`);
}
// one generation on a model server engine, streamed: the same result shape Ollama's path gives ({ text, thinking, done_reason, eval_count })
function _llamaGenerate(port, model, prompt, want, options, extra, idleMs, tell) {
  const messages = [...(extra.system ? [{ role: 'system', content: extra.system }] : []), { role: 'user', content: String(prompt || '') }];
  const body = JSON.stringify({ model, messages, stream: true, max_tokens: want, temperature: options.temperature != null ? options.temperature : 0.2,
    ...(options.seed != null ? { seed: options.seed } : {}), ...(options.top_p != null ? { top_p: options.top_p } : {}) });
  return new Promise((resolve, reject) => {
    let text = '', thinking = '', buf = '', settled = false, idle = null, first = true, finish = null, evalCount = null;
    const total = setTimeout(() => fail(`model server generate exceeded ${Math.round(config.RAW_GENERATE_TOTAL_MS / 1000)} s in total`), config.RAW_GENERATE_TOTAL_MS);
    const fail = (msg) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); try { req.destroy(); } catch (_) {} reject(Object.assign(new Error(msg), { partial: { text, thinking } })); };
    const ok = () => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); resolve({ text, thinking, done_reason: finish, eval_count: evalCount }); };
    const arm = () => {
      clearTimeout(idle);
      const ms = first ? Math.max(idleMs || config.RAW_GENERATE_TIMEOUT_MS, config.RAW_FIRST_TOKEN_MS || 0) : (idleMs || config.RAW_GENERATE_TIMEOUT_MS);
      idle = setTimeout(() => fail(`the model server sent nothing for ${ms} ms ${first ? 'before its first token' : '(idle timeout)'} — ${text.length} chars received`), ms);
    };
    const req = http.request({ hostname: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      if (r.statusCode < 200 || r.statusCode >= 300) {
        let e = ''; r.on('data', (c) => e += c);
        r.on('end', () => { let d = e; try { const j = JSON.parse(e); d = (j.error && (j.error.message || j.error)) || e; } catch (_) {} fail(`model server HTTP ${r.statusCode} for model "${model}": ${d}`); });
        return;
      }
      r.on('data', (c) => {
        first = false; arm(); buf += c.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          const t = line.trim(); if (!t.startsWith('data:')) continue;
          const p = t.slice(5).trim(); if (p === '[DONE]') return ok();
          let o; try { o = JSON.parse(p); } catch (_) { continue; }
          if (o.error) return fail(`model server generation error for model "${model}": ${o.error.message || o.error}`);
          const ch = (o.choices && o.choices[0]) || {}, d = ch.delta || {};
          if (d.content) { text += d.content; tell(d.content, 'text'); }
          if (d.reasoning_content) { thinking += d.reasoning_content; tell(d.reasoning_content, 'thinking'); }
          if (ch.finish_reason) finish = ch.finish_reason;
          if (o.usage && o.usage.completion_tokens != null) evalCount = o.usage.completion_tokens;
        }
      });
      r.on('end', () => ok());
    });
    req.on('error', (e) => fail(e.message));
    arm();
    req.end(body);
  });
}
// 0.60.620 — smallest first (his, 2026-11-20): a small model stays loaded (config.KEEP_ALIVE), a big one is unloaded once it answers (KEEP_ALIVE_BIG);
// the size is read from the model's own tag (":3b", ":16b", ":30b"); a tag with no size keeps the small rule
// 2026-11-24 — a tag with no size ("hf.co/…DeepSeek-Coder-V2-Lite…GGUF:Q4_K_M") was taken for a small model and kept loaded 30 min: 11 GB of his
// 16 held next to the 3b, and his PC froze (James: "as long as my pc doesn't freeze up"). The size is now Ollama's own word for each installed
// model (GET /api/tags, details.parameter_size), read when the bridge starts and again when a model it does not know is asked; the tag is the fallback
const _SIZES = new Map();
function _readSizes() {
  try { const u = new URL(/^https?:/.test(String(OLLAMA_HOST || '')) ? OLLAMA_HOST : 'http://' + (OLLAMA_HOST || '127.0.0.1:11434'));
    http.get({ host: u.hostname, port: u.port || 11434, path: '/api/tags', timeout: 5000 }, (r) => { let t = ''; r.on('data', (c) => t += c); r.on('end', () => { try {
      for (const x of JSON.parse(t).models || []) { const p = /(\d+(?:\.\d+)?)\s*B/i.exec(String((x.details && x.details.parameter_size) || '')); if (p) _SIZES.set(x.name, parseFloat(p[1])); } } catch (_) {} }); })
      .on('error', () => {}).on('timeout', function () { this.destroy(); }); } catch (_) {}
}
setImmediate(_readSizes);
function _sizeB(model) { const k = String(model || ''); if (_SIZES.has(k)) return _SIZES.get(k); const m = /[:_-](\d+(?:\.\d+)?)b\b/i.exec(k); if (!m) _readSizes(); return m ? parseFloat(m[1]) : null; }
function _keepAliveFor(model) { const b = _sizeB(model); const v = b != null && b > (config.KEEP_ALIVE_MAX_B || 4) ? config.KEEP_ALIVE_BIG : config.KEEP_ALIVE; return v != null && v !== '' ? { keep_alive: /^\d+$/.test(String(v)) ? Number(v) : v } : {}; }

// 0.60.535 PC18 slice a — James, 2026-11-13: "Have it use any that's on my pc. Fallback to any other?" · 2026-11-14: "We need the highest
// leverage, that gets me closer to cutting depende on you and using it the pipeline to build nexus." A call that names a model not installed
// (his PC lacked the default qwen2.5-coder:7b, 2026-11-14) runs on the best installed one, said in the log, instead of failing.
// pickInstalled(wanted, installed) → the model to run: the wanted one when installed; else a coder model; else the first Ollama lists; null when none.
function _same(a, b) { const n = (x) => String(x || '').replace(/:latest$/, ''); return n(a) === n(b); }
function pickInstalled(wanted, installed = []) {
  const names = (installed || []).map(m => (m && m.name) || String(m || '')).filter(Boolean);
  if (!names.length) return null;
  if (wanted && names.some(n => _same(n, wanted))) return names.find(n => _same(n, wanted));
  return names.find(n => /coder/i.test(n)) || names[0];
}
let _tags = { at: 0, names: null };
function _installed() {
  if (_tags.names && Date.now() - _tags.at < 30000) return Promise.resolve(_tags.names);
  // 2026-11-24 PC25 b: the model server's models first, then whatever an Ollama server (if one answers) lists
  return Promise.all([_msModels(), _ollamaTags()]).then(([a, b]) => {
    if (!a && !b) return null;
    _tags = { at: Date.now(), names: [...new Set([...(a || []), ...(b || [])])] };
    return _tags.names;
  });
}
function _ollamaTags() {
  return new Promise(res => {
    const u = new URL(OLLAMA_HOST);
    http.get({ hostname: u.hostname, port: u.port || 11434, path: '/api/tags', timeout: config.HEALTH_CHECK_TIMEOUT_MS }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res((JSON.parse(d).models || []).map(m => m.name)); } catch (_) { res(null); } });
    }).on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
  });
}
async function resolveModel(wanted, caller = '') {
  const names = await _installed();
  if (!names) return wanted;                       // the list could not be read: ask for what was named, as before
  const m = pickInstalled(wanted, names);
  if (m && !_same(m, wanted)) console.warn(`[ollama-bridge] ${wanted || '(no model named)'} is not installed — using ${m}${caller ? ` for ${caller}` : ''}`);
  return m || wanted;
}

async function checkOllama() {
  // 2026-11-24 PC25 b: online when the model server holds a model (its engines start on demand), else when an Ollama server answers
  const ms = await _msModels().catch(() => null);
  if (ms && ms.length) { state.ollamaOnline = true; return true; }
  return new Promise(res => {
    const u = new URL(OLLAMA_HOST);
    http.get(
      { hostname: u.hostname, port: u.port || 11434, path: '/api/tags', timeout: config.HEALTH_CHECK_TIMEOUT_MS },
      // 0.60.598 — found 2026-11-19: the body was never read, so every check (about every 10 s) left its socket open: 1,540 sockets to Ollama
      // from this bridge after a morning, and Windows refused new ones ("connect ENOBUFS 127.0.0.1:3750"), failing NM1's whole ladder.
      // The body is drained (the socket closes or returns to the pool) and a timeout destroys the request.
      r => { r.resume(); state.ollamaOnline = r.statusCode === 200; res(state.ollamaOnline); }
    ).on('error', () => { state.ollamaOnline = false; res(false); }).on('timeout', function () { this.destroy(); state.ollamaOnline = false; res(false); });
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
  // §0.43.0 OR2/OR3 — the tape (ollama/lib/tape.js): a seed always set and recorded; the cassette answers first when replaying
  const Tape = require('./tape.js');
  const options = Tape.withSeed(ctx.options);
  const req = { messages, tools: toolSchemas };
  const body = JSON.stringify({ model, messages, tools: toolSchemas, stream: false, options, ..._keepAliveFor(model) });   // 0.60.617: his "keep deekseek stay loaded"
  const t0 = Date.now();
  const done = (ok, error, res = {}, raw = null) => {
    OA.record({ caller, op: 'chat+tools', model, promptChars: chars, numCtx: ctx.numCtx, ms: Date.now() - t0, ok, error, warning: ctx.warning });
    Tape.record({ caller, op: 'chat+tools', model, req, options, res, raw, ms: Date.now() - t0, ok, error });
  };
  const rp = Tape.replay('chat+tools', model, req, options);
  if (rp && rp.miss) return Promise.reject(new Error(rp.error));
  if (rp && rp.hit) { OA.record({ caller: `${caller} (replayed)`, op: 'chat+tools', model, promptChars: chars, numCtx: ctx.numCtx, ms: 0, ok: true }); return Promise.resolve({ text: rp.res.text, toolCalls: rp.res.toolCalls || [] }); }
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
          const out = {
            text: msg.content || '',
            toolCalls: (msg.tool_calls || []).map(tc => ({
              id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments,
            })),
          };
          done(true, null, out, parsed);
          resolve(out);
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
function _generateOnceRaw(model, prompt, maxTokens, idleMs, caller, extra = {}) {
  const OA = require('../../lib/ollama-activity.js');
  const want = maxTokens || config.DEFAULT_MAX_TOKENS;
  const ctx = OA.withNumCtx({ num_predict: want, temperature: extra.temperature != null ? extra.temperature : 0.2 }, String(prompt || '').length + String(extra.system || '').length, want);
  // §0.43.0 OR2/OR3 — the tape (ollama/lib/tape.js): a seed always set and recorded; the cassette answers first when replaying
  const Tape = require('./tape.js');
  const options = { ...Tape.withSeed(ctx.options), ...(extra.optionsOverride || {}) };   // §0.60.7 — the GPU-out-of-memory retry sets num_gpu / num_ctx here
  const treq = { prompt, system: extra.system || null, think: extra.think === false ? false : null };
  const body = JSON.stringify({ model, prompt, stream: true, options, ...(extra.system ? { system: extra.system } : {}), ...(extra.think === false ? { think: false } : {}), ..._keepAliveFor(model) });   // 0.60.617: his "keep deekseek stay loaded"
  const t0 = Date.now();
  const done = (ok, error, res = {}, raw = null) => {
    OA.record({ caller, op: 'generate', model, promptChars: String(prompt || '').length, numCtx: ctx.numCtx, ms: Date.now() - t0, ok, error, warning: ctx.warning });
    Tape.record({ caller, op: 'generate', model, req: treq, options, res, raw, ms: Date.now() - t0, ok, error });
  };
  const rp = Tape.replay('generate', model, treq, options);
  if (rp && rp.miss) return Promise.reject(new Error(rp.error));
  if (rp && rp.hit) {
    OA.record({ caller: `${caller} (replayed)`, op: 'generate', model, promptChars: String(prompt || '').length, numCtx: ctx.numCtx, ms: 0, ok: true });
    if (typeof extra.onDelta === 'function') { try { if (rp.res.thinking) extra.onDelta(rp.res.thinking, 'thinking'); if (rp.res.text) extra.onDelta(rp.res.text, 'text'); } catch (_) {} }
    return Promise.resolve({ text: rp.res.text, thinking: rp.res.thinking, doneReason: rp.res.doneReason, evalCount: rp.res.evalCount });
  }
  // 2026-11-24 PC25 b: a model the model server holds runs on its engine; the tape, the activity log and the result shape stay the same
  return _msPort(model).then((port) => {
    if (!port) return _ollamaGenerate();
    const tell = (d, kind) => { if (typeof extra.onDelta === 'function') { try { extra.onDelta(d, kind); } catch (_) {} } };
    return _llamaGenerate(port, model, prompt, want, options, extra, idleMs, tell).then(
      (o) => { const out = { text: o.text, thinking: o.thinking, doneReason: o.done_reason || null, evalCount: o.eval_count || null }; done(true, null, out, o); return out; },
      (e) => { done(false, e.message, e.partial || {}); throw e; });
  });
  function _ollamaGenerate() { return new Promise((resolve, reject) => {
    let text = '', thinking = '', buf = '', settled = false, idle = null;
    // §0.39.356 LS1 — each token as it arrives, to whoever wants to show the model writing (never in the way of the reply)
    const _tell = (d, kind) => { if (typeof extra.onDelta === 'function') { try { extra.onDelta(d, kind); } catch (_) {} } };
    const total = setTimeout(() => fail(`ollama generate exceeded ${Math.round(config.RAW_GENERATE_TOTAL_MS / 1000)} s in total`), config.RAW_GENERATE_TOTAL_MS);
    const fail = (msg) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); try { req.destroy(); } catch (_) {} done(false, msg, { text, thinking }); reject(new Error(msg)); };
    const ok = (o) => { if (settled) return; settled = true; clearTimeout(total); clearTimeout(idle); const out = { text, thinking, doneReason: o.done_reason || null, evalCount: o.eval_count || null }; done(true, null, out, o); resolve(out); };
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
  }); }
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
  model = await resolveModel(model, caller);   // 0.60.535 PC18 slice a: an installed model, never one that is missing
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


// §0.60.7 — "llama-server reported out-of-memory during startup: cudaMalloc failed" (the bridge jobs, the adversarial probe).
// The GPU did not have room for the model while the browser, Electron and Idearium were holding memory. Not a model fault:
// retry the same call once on the CPU (num_gpu 0) with a smaller context, and remember for GPU_OOM_COOLDOWN_MS that the GPU
// is full, so the next jobs go straight to the CPU instead of each paying a failed model load first.
const OOM_RE = /out of memory|cudaMalloc|failed to allocate|GGML_ASSERT|unable to allocate|0xc0000409|kv cache/i;
const GPU_OOM_COOLDOWN_MS = parseInt(process.env.NEXUS_OLLAMA_GPU_OOM_COOLDOWN_MS || '600000', 10);
const _cpuOverride = (extra) => ({ ...(extra.optionsOverride || {}), num_gpu: 0, num_ctx: Math.min(4096, (extra.optionsOverride && extra.optionsOverride.num_ctx) || 4096) });
async function _generateOnce(model, prompt, maxTokens, idleMs, caller, extra = {}) {
  if (state.gpuFullUntil && Date.now() < state.gpuFullUntil && !(extra.optionsOverride && extra.optionsOverride.num_gpu === 0)) {
    return _generateOnceRaw(model, prompt, maxTokens, idleMs, `${caller} [cpu: gpu full]`, { ...extra, optionsOverride: _cpuOverride(extra) });
  }
  try { return await _generateOnceRaw(model, prompt, maxTokens, idleMs, caller, extra); }
  catch (e) {
    if (!OOM_RE.test(String(e && e.message))) throw e;
    state.gpuFullUntil = Date.now() + GPU_OOM_COOLDOWN_MS;
    console.warn(`[ollama] ${caller}: the GPU is out of memory for "${model}" — retrying on the CPU; the GPU is skipped for ${Math.round(GPU_OOM_COOLDOWN_MS / 60000)} min`);
    return _generateOnceRaw(model, prompt, maxTokens, idleMs, `${caller} [cpu retry]`, { ...extra, optionsOverride: _cpuOverride(extra) });
  }
}

module.exports = { _keepAliveFor,  checkOllama, callOllamaChatWithTools, callOllamaRaw, dispatchWithTools, _generateOnce, _ollamaCut, pickInstalled, resolveModel };
