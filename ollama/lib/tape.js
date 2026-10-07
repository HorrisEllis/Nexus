'use strict';
/**
 * ollama/lib/tape.js — every model call a frame; a run's frames its macro; a recorded run replayed without Ollama.
 * comp_id: nexus.ollama.lib.tape   (§0.46.0 — moved from lib/ollama-tape.js: what is Ollama's lives with Ollama)
 * Map: docs/2026-10-07-ollama-recorder-phasemap.spec (OR2 every call a frame, OR3 the cassette)
 *
 * James: "can we use the rewind engine on ollama? like record ollamas process as a macro?" · "do it. tell me what that
 * would do"
 *
 * The door (ollama/lib/ollama-client.js _generateOnce + callOllamaChatWithTools) asks the tape before it calls Ollama
 * (replay()) and gives it what happened after (record()). Nothing else changes for a caller.
 *
 *   frame   { id, run, task, hat, caller, op, model, key, seed, options, prompt|system|messages|tools → blob sha,
 *             answer → blob sha, thinking → blob sha, toolCalls, doneReason, evalCount, timings, ms, ok, error, at }
 *   blobs   content-addressed (sha256) under <data>/ollama/blobs — the same system prompt sent 1,000 times is one file
 *   frames  appended to <data>/ollama/frames/<day>.<pid>.jsonl — one writer per file (PF3's shape)
 *   run     the task the call ran in (lib/repo-activity.js current().id), else NEXUS_OLLAMA_RUN, else proc-<pid>
 *   seed    always set — a random one when the caller gives none, recorded — so every call can be run again the same
 *   key     sha256(op, model, request, options without seed/num_ctx): what the cassette matches a call on
 *
 * The cassette: NEXUS_OLLAMA_REPLAY=<run id> (only that run's frames) or 'all'. A call whose key was recorded is
 * answered from the frame — no Ollama, no GPU, the same answer; one that was not is refused and said (never invented),
 * unless NEXUS_OLLAMA_REPLAY_MISS=live lets it through to the model. NEXUS_OLLAMA_RECORD=0 records nothing.
 * Prompts and answers stay on this machine, in the data dir (never committed).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.ollama.lib.tape';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function _root() { return path.join(process.env.NEXUS_DATA_ROOT || path.resolve(__dirname, '..', '..', 'data'), 'ollama'); }
function _blobFile(h) { return path.join(_root(), 'blobs', h.slice(0, 2), `${h}.txt`); }
function _task() { try { return require('../../lib/repo-activity.js').current(); } catch (_) { return null; } }

/** blob(text) → sha (written once) | null */
function blob(text) {
  if (text == null || text === '') return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  const h = sha(s);
  const f = _blobFile(h);
  try { if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s, 'utf8'); } } catch (_) { return null; }
  return h;
}
function readBlob(h) { if (!h) return null; try { return fs.readFileSync(_blobFile(h), 'utf8'); } catch (_) { return null; } }

/** key(op, model, req, options) — what a replay matches on (the seed and num_ctx are not part of the question) */
function key(op, model, req = {}, options = {}) {
  const { seed, num_ctx, ...rest } = options || {};
  const o = Object.fromEntries(Object.keys(rest).sort().map(k => [k, rest[k]]));
  return sha(JSON.stringify([op, model, req.prompt ?? null, req.system ?? null, req.messages ?? null, req.tools ?? null, req.think ?? null, o]));
}

/** withSeed(options) — the options with a seed (the caller's, or a new random one) */
function withSeed(options = {}) { return options.seed != null ? options : { ...options, seed: crypto.randomInt(1, 2 ** 31 - 1) }; }

function runOf(task = _task()) { return (task && task.id) || process.env.NEXUS_OLLAMA_RUN || `proc-${process.pid}`; }

/** timings(o) — Ollama's own measures from its final reply object, in ms and tokens/s */
function timings(o) {
  if (!o) return null;
  const ms = (ns) => (typeof ns === 'number' ? Math.round(ns / 1e6) : null);
  const t = { totalMs: ms(o.total_duration), loadMs: ms(o.load_duration), promptTokens: o.prompt_eval_count ?? null,
    promptMs: ms(o.prompt_eval_duration), evalTokens: o.eval_count ?? null, evalMs: ms(o.eval_duration) };
  t.tokensPerSec = t.evalTokens && t.evalMs ? +(t.evalTokens / (t.evalMs / 1000)).toFixed(1) : null;
  return Object.values(t).some(v => v != null) ? t : null;
}

/** record({ caller, op, model, req, options, res, raw, ms, ok, error }) → the frame (never throws) */
function record({ caller, op, model, req = {}, options = {}, res = {}, raw = null, ms = null, ok = true, error = null }) {
  if (process.env.NEXUS_OLLAMA_RECORD === '0') return null;
  try {
    const task = _task();
    const frame = {
      id: crypto.randomUUID(), run: runOf(task), task: task ? task.id : null, hat: task ? (task.hat || task.provider || null) : null,
      caller: caller || null, op, model, key: key(op, model, req, options), seed: options.seed ?? null, options,
      prompt: blob(req.prompt), system: blob(req.system), messages: blob(req.messages), tools: blob(req.tools),
      answer: blob(res.text), thinking: blob(res.thinking), toolCalls: res.toolCalls && res.toolCalls.length ? res.toolCalls : null,
      doneReason: res.doneReason ?? null, evalCount: res.evalCount ?? null, timings: timings(raw), ms, ok: !!ok, error: error || null,
      at: Date.now(),
    };
    const dir = path.join(_root(), 'frames');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${new Date(frame.at).toISOString().slice(0, 10)}.${process.pid}.jsonl`), JSON.stringify(frame) + '\n');
    _index = null;
    return frame;
  } catch (_) { return null; }   // observing a call never breaks it
}

/** frames({ run, since }) → frames in time order */
function frames({ run = null, since = 0 } = {}) {
  const dir = path.join(_root(), 'frames');
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort(); } catch (_) { return []; }
  const out = [];
  for (const f of files) {
    let txt = ''; try { txt = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (_) { continue; }
    for (const ln of txt.split('\n')) {
      if (!ln) continue;
      let fr; try { fr = JSON.parse(ln); } catch (_) { continue; }
      if ((run && fr.run !== run) || fr.at < since) continue;
      out.push(fr);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** macro(run) — a run's calls, in order, with what was asked and answered: the macro of that run */
function macro(run) {
  return frames({ run }).map(f => ({ at: f.at, caller: f.caller, op: f.op, model: f.model, seed: f.seed, ok: f.ok, error: f.error,
    prompt: readBlob(f.prompt), system: readBlob(f.system), answer: readBlob(f.answer), toolCalls: f.toolCalls, timings: f.timings }));
}

let _index = null;   // key → newest ok frame, for the cassette (rebuilt when a frame is recorded)
function _lookup(k, run) {
  if (!_index || _index.run !== run) {
    const m = new Map();
    for (const f of frames(run === 'all' ? {} : { run })) if (f.ok) m.set(f.key, f);
    _index = { run, m };
  }
  return _index.m.get(k) || null;
}

/** replay(op, model, req, options) → null (call the model) | { hit, res } | { miss: true, error } — the cassette */
function replay(op, model, req = {}, options = {}) {
  const run = process.env.NEXUS_OLLAMA_REPLAY;
  if (!run) return null;
  const f = _lookup(key(op, model, req, options), run);
  if (f) return { hit: true, frame: f.id, res: { text: readBlob(f.answer) || '', thinking: readBlob(f.thinking) || '', toolCalls: f.toolCalls || [], doneReason: f.doneReason, evalCount: f.evalCount } };
  if (process.env.NEXUS_OLLAMA_REPLAY_MISS === 'live') return null;
  return { miss: true, error: `not in the cassette (${run}): ${op} ${model} — this call was never recorded; NEXUS_OLLAMA_REPLAY_MISS=live lets it reach the model` };
}

/** runs({ since }) — every run on the tape: its calls, callers, models, time, failures (newest first) */
function runs({ since = 0 } = {}) {
  const by = new Map();
  for (const f of frames({ since })) {
    let r = by.get(f.run); if (!r) { r = { run: f.run, hat: f.hat, calls: 0, failed: 0, ms: 0, first: f.at, last: f.at, callers: new Set(), models: new Set() }; by.set(f.run, r); }
    r.calls++; if (!f.ok) r.failed++; r.ms += f.ms || 0; r.last = f.at; if (f.caller) r.callers.add(f.caller); if (f.model) r.models.add(f.model); if (f.hat) r.hat = f.hat;
  }
  return [...by.values()].map(r => ({ ...r, callers: [...r.callers], models: [...r.models] })).sort((a, b) => b.last - a.last);
}

module.exports = { MODULE_ID, runs, record, replay, frames, macro, key, withSeed, blob, readBlob, timings, runOf };
