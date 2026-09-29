'use strict';
/**
 * lib/ollama-activity.js — what Ollama is doing, in one place; and a context window that fits the prompt.
 * comp_id: nexus.lib.ollama-activity
 *
 * §0.39.266 — James: "don't even know what ollama is doing?" (Task Manager: llama-server.exe holding 1.9 GB).
 * Measured: the bridge (:3749) logged no jobs, and ~8 modules called :11434 directly — so nothing in Nexus could say
 * which caller loaded a model, or when. Every model call now goes through record(): one line on the console, one
 * row in data/ollama/activity.jsonl (the bridge serves the tail at GET /api/activity).
 *
 * num_ctx: nothing in Nexus set it, so every prompt got Ollama's default window, and a prompt longer than that is
 * cut FROM THE FRONT — the instructions go first. numCtxFor() sizes the window to the prompt (≈3.5 chars/token +
 * room for the answer), floor OLLAMA_NUM_CTX_MIN (4096), ceiling OLLAMA_NUM_CTX_MAX (16384 — James's GPU is 4 GB;
 * raise it if yours is bigger). A prompt that will not fit even at the ceiling is said out loud, never cut quietly.
 */

const fs = require('fs');
const path = require('path');

const MIN = parseInt(process.env.OLLAMA_NUM_CTX_MIN || '4096', 10);
const MAX = parseInt(process.env.OLLAMA_NUM_CTX_MAX || '16384', 10);
const CHARS_PER_TOKEN = 3.5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function _file() {
  const root = process.env.NEXUS_DATA_ROOT || path.resolve(__dirname, '..', 'data');
  return path.join(root, 'ollama', 'activity.jsonl');
}

/** numCtxFor(promptChars, answerTokens) -> { numCtx, needed, fits } */
function numCtxFor(promptChars, answerTokens = 2048) {
  const needed = Math.ceil((Number(promptChars) || 0) / CHARS_PER_TOKEN) + (answerTokens || 0) + 256;
  const numCtx = Math.min(MAX, Math.max(MIN, Math.ceil(needed / 1024) * 1024));
  return { numCtx, needed, fits: needed <= numCtx };
}

/**
 * record({ caller, op, model, promptChars, numCtx, ms, ok, error, jobId }) — one line out, one row appended.
 * Never throws: observing a model call must not break it.
 */
function record(entry) {
  const row = { ts: Date.now(), ...entry };
  try {
    const f = _file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > MAX_FILE_BYTES) fs.renameSync(f, f + '.1'); } catch (_) {}
    fs.appendFileSync(f, JSON.stringify(row) + '\n');
  } catch (_) {}
  try {
    const bits = [row.caller || '?', row.op || 'generate', row.model || 'default model',
      row.promptChars != null ? `${row.promptChars} chars` : null, row.numCtx ? `num_ctx ${row.numCtx}` : null,
      row.ms != null ? `${row.ms}ms` : null, row.ok === false ? `FAILED: ${row.error || 'unknown'}` : null, row.warning || null].filter(Boolean);
    console.log(`[ollama] ${bits.join(' · ')}`);
  } catch (_) {}
  return row;
}

/** tail(n) -> the last n rows, newest last. */
function tail(n = 50) {
  try {
    const lines = fs.readFileSync(_file(), 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(n, 1000))).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

/**
 * options(base, promptChars, answerTokens) -> base options with num_ctx set (unless the caller already set one),
 * plus a warning string when even the ceiling is too small.
 */
function withNumCtx(base = {}, promptChars = 0, answerTokens = 2048) {
  if (base && base.num_ctx) return { options: base, numCtx: base.num_ctx, warning: null };
  const w = numCtxFor(promptChars, answerTokens);
  return { options: { ...(base || {}), num_ctx: w.numCtx }, numCtx: w.numCtx,
           warning: w.fits ? null : `prompt needs ~${w.needed} tokens, window is ${w.numCtx} (OLLAMA_NUM_CTX_MAX) — Ollama will drop the start` };
}

module.exports = { numCtxFor, withNumCtx, record, tail, MIN, MAX };
