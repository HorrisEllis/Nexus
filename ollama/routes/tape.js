'use strict';
/**
 * ollama/routes/tape.js — the Ollama tape (ollama/lib/tape.js). §0.45.0 CM3
 * GET /api/tape            — every run recorded: calls, callers, models, time, failures (newest first)
 * GET /api/tape/:run       — that run's macro: each call in order, what was asked and answered (texts cut to ?chars=)
 * James: "next make sure these are all commands first, api routes if applicaple."
 */
const { json } = require('../lib/http-utils.js');

async function handle(req, res, { method, url, pathname }) {
  if (method !== 'GET' || !/^\/api\/tape(\/|$)/.test(pathname)) return false;
  const Tape = require('../lib/tape.js');
  const q = url && url.searchParams ? url.searchParams : new URLSearchParams();
  if (pathname === '/api/tape' || pathname === '/api/tape/') {
    const limit = Math.max(1, parseInt(q.get('limit') || '30', 10) || 30);
    const all = Tape.runs({ since: parseInt(q.get('since') || '0', 10) || 0 });
    json(res, 200, { ok: true, runs: all.slice(0, limit), total: all.length, replaying: process.env.NEXUS_OLLAMA_REPLAY || null });
    return true;
  }
  const run = decodeURIComponent(pathname.slice('/api/tape/'.length));
  const cut = Math.max(100, parseInt(q.get('chars') || '2000', 10) || 2000);
  const c = (t) => (t && t.length > cut ? `${t.slice(0, cut)}… (+${t.length - cut} chars)` : t);
  const steps = Tape.macro(run).map(s => ({ ...s, prompt: c(s.prompt), system: c(s.system), answer: c(s.answer) }));
  if (!steps.length) { json(res, 404, { ok: false, error: `no run ${run} on the tape — GET /api/tape lists them` }); return true; }
  json(res, 200, { ok: true, run, steps });
  return true;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/api/tape', description: 'every run on the Ollama tape — idearium ollama tape' },
  { method: 'GET', path: '/api/tape/:run', description: "a run's macro: each model call in order, asked and answered — idearium ollama tape <run>" },
];
