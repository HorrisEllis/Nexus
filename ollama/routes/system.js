'use strict';
/**
 * ollama/routes/system.js
 * GET /health, GET /contract, GET /events (SSE), OPTIONS *
 * Matches registry-components.js: health
 */

const config = require('../config.js');
const { state } = require('../lib/state.js');
const { json } = require('../lib/http-utils.js');

async function handle(req, res, { method, pathname }) {
  if (method === 'OPTIONS') { json(res, 200, {}); return true; }

  if (pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'ollama.connected', ts: Date.now() })}\n\n`);
    state.sseClients.add(res);
    req.on('close', () => state.sseClients.delete(res));
    return true;
  }

  // Contract — required for orchestrator verification
  if (pathname === '/contract') {
    json(res, 200, require('../registry-components'));
    return true;
  }

  // §0.39.266 — James: "don't even know what ollama is doing?" Every model call Nexus makes (this bridge's jobs and
  // channels, and the modules that call Ollama directly) — lib/ollama-activity.js. ?n=50
  if (method === 'GET' && pathname === '/api/activity') {
    const OA = require('../../lib/ollama-activity.js');
    const n = parseInt(new URL(req.url, 'http://x').searchParams.get('n') || '50', 10);
    json(res, 200, { ok: true, numCtx: { min: OA.MIN, max: OA.MAX }, activity: OA.tail(n) });
    return true;
  }
  if (pathname === '/health') {
    json(res, 200, {
      ok: state.ollamaOnline,
      system: config.SYSTEM_ID,
      version: config.VERSION,
      model: state.defaultModel,
      queue_depth: state.queue.length,
      running: state.running.size,
      completed_today: state.statsToday.completed,
      failed_today: state.statsToday.failed,
      ollama_host: config.OLLAMA_HOST,
      ts: Date.now(),
    });
    return true;
  }

  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'GET', path: '/events', description: 'SSE stream, real ollama.connected event on open' },
  { method: 'GET', path: '/contract' },
  { method: 'GET', path: '/health' },
];
