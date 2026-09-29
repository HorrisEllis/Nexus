'use strict';
/**
 * ollama/routes/stream.js
 * PUT /api/stream/:id/context, GET/POST /api/stream/:id, GET /api/streams
 *
 * §WHY SEPARATE FROM lib/dispatch.js — that pipeline (WARP crystallizer,
 * population, axiom scoring, SEAM Detector) is built for discrete
 * completed outputs: it scores/crystallizes ONE finished string per job.
 * A standing channel is the opposite shape on purpose — an open
 * conversation accumulating incremental context over many turns, not one
 * job to grade. This is real stream:true against ollama's own
 * /api/generate, forwarded live, chunk by chunk, as they arrive.
 *
 * §ROUTE ORDER — the context-PUT match below MUST be checked before the
 * generic '/api/stream/' prefix match in this same module, or it never
 * gets reached (it also starts with '/api/stream/'). Found by
 * live-testing the bridge end to end: the first version had this
 * reversed and every PUT context call fell into the generic block's 405.
 */

const http   = require('http');
const config = require('../config.js');
const { state } = require('../lib/state.js');
const { json, readBody } = require('../lib/http-utils.js');

const OLLAMA_HOST = config.OLLAMA_HOST;

async function handle(req, res, { method, pathname }) {
  if (pathname === '/api/streams') {
    if (method !== 'GET') return false;
    json(res, 200, {
      ok: true,
      channels: [...state.channels.entries()].map(([id, ch]) => ({
        channelId: id, turns: ch.history.length, lastActivity: ch.lastActivity,
      })),
    });
    return true;
  }

  if (!pathname.startsWith('/api/stream/')) return false;

  // MUST be checked before the generic prefix handling below.
  if (method === 'PUT' && pathname.endsWith('/context')) {
    const channelId = decodeURIComponent(pathname.slice('/api/stream/'.length, -'/context'.length));
    if (!channelId) { json(res, 400, { ok: false, error: 'channel id required' }); return true; }
    try {
      const body = await readBody(req);
      if (!body.context) { json(res, 400, { ok: false, error: 'context required' }); return true; }
      let ch = state.channels.get(channelId);
      if (!ch) { ch = { history: [], lastActivity: Date.now() }; state.channels.set(channelId, ch); }
      ch.history.push({ role: 'context', content: String(body.context), ts: Date.now() });
      // §0.39.266 — copilot's nerve push adds a context line every 5 s to 'nexus-live' and nothing reads it; the push
      // also counts as activity, so the hourly sweep never removed it. Context lines are capped (newest kept).
      const CAP = parseInt(process.env.OLLAMA_CHANNEL_CONTEXT_CAP || '200', 10);
      const ctxIdx = ch.history.reduce((a, h, i) => (h.role === 'context' ? (a.push(i), a) : a), []);
      if (ctxIdx.length > CAP) { const drop = new Set(ctxIdx.slice(0, ctxIdx.length - CAP)); ch.history = ch.history.filter((_, i) => !drop.has(i)); }
      ch.lastActivity = Date.now();
      json(res, 200, { ok: true, channelId, turns: ch.history.length });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  const channelId = decodeURIComponent(pathname.slice('/api/stream/'.length));
  if (!channelId) { json(res, 400, { ok: false, error: 'channel id required — POST/GET /api/stream/:channelId' }); return true; }

  if (method === 'GET') {
    const ch = state.channels.get(channelId);
    json(res, 200, { ok: true, channelId, exists: !!ch, history: ch ? ch.history : [], lastActivity: ch ? ch.lastActivity : null });
    return true;
  }

  if (method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (e) { json(res, 500, { ok: false, error: e.message }); return true; }

    const prompt = body.prompt;
    if (!prompt) { json(res, 400, { ok: false, error: 'prompt required' }); return true; }
    const model = body.model || state.defaultModel;

    let ch = state.channels.get(channelId);
    if (!ch) { ch = { history: [], lastActivity: Date.now() }; state.channels.set(channelId, ch); }
    ch.history.push({ role: 'user', content: prompt, ts: Date.now() });
    ch.lastActivity = Date.now();

    // Build ollama's own multi-turn context param from prior turns — the
    // channel IS the context, not a new context format invented here.
    const fullPrompt = ch.history.map(h => {
      if (h.role === 'context') return `[CONTEXT] ${h.content}`;
      return `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`;
    }).join('\n') + '\nAssistant:';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
    });

    // §0.39.266 — num_ctx sized to the whole channel history; the call recorded in the activity log
    const OA = require('../../lib/ollama-activity.js');
    const _ctx = OA.withNumCtx({}, fullPrompt.length);
    const _t0 = Date.now();
    const _rec = (ok, error) => OA.record({ caller: `bridge channel ${channelId}`, op: 'stream', model, promptChars: fullPrompt.length, numCtx: _ctx.numCtx, ms: Date.now() - _t0, ok, error, warning: _ctx.warning });
    const reqBody = JSON.stringify({ model, prompt: fullPrompt, stream: true, options: _ctx.options });
    const u = new URL(`${OLLAMA_HOST}/api/generate`);
    let assembled = '';
    const upstream = http.request({
      hostname: u.hostname, port: u.port || 11434, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(reqBody) },
    }, upstreamRes => {
      let buf = '';
      upstreamRes.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop(); // last (possibly incomplete) line stays in buf
        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed;
          try { parsed = JSON.parse(line); } catch (_) { continue; }
          if (parsed.response) assembled += parsed.response;
          res.write(`data: ${JSON.stringify({ channelId, chunk: parsed.response || '', done: !!parsed.done, ts: Date.now() })}\n\n`);
          if (parsed.done) {
            _rec(true);
            ch.history.push({ role: 'assistant', content: assembled, ts: Date.now() });
            ch.lastActivity = Date.now();
            res.end();
          }
        }
      });
      upstreamRes.on('end', () => { try { res.end(); } catch (_) {} });
    });
    upstream.on('error', e => {
      _rec(false, e.message);
      res.write(`data: ${JSON.stringify({ channelId, error: `ollama unreachable: ${e.message}`, done: true, ts: Date.now() })}\n\n`);
      res.end();
    });
    upstream.write(reqBody);
    upstream.end();
    req.on('close', () => { try { upstream.destroy(); } catch (_) {} });
    return true;
  }

  json(res, 405, { ok: false, error: 'method not allowed — GET or POST' });
  return true;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/api/streams' },
  { method: 'PUT', path: '/api/stream/:id/context', description: 'checked before the generic /api/stream/:id prefix — see this file\'s own §ROUTE ORDER comment' },
  { method: 'GET', path: '/api/stream/:id' },
  { method: 'POST', path: '/api/stream/:id' },
];
