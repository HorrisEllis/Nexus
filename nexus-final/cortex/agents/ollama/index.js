'use strict';
// ── agents/ollama/index.js ────────────────────────────────────────────────────
// UUID: mod-ollama-v5-0000-4000-0000-000000000001
//
// Ollama local agent. LAW I enforcement point.
// Reads agent_calls where routedTo='ollama', calls Ollama HTTP API, writes result.
//
// §M1: init(cfg) + stop() + dispatch(call) for dispatcher.
// §M2: reads: agent_calls, cortex_memory. writes: agent_calls, cortex_memory, event_log.

const http   = require('http');
const { jaaDB, uid } = require('../../memory/jaa-db');

const MODULE_ID   = 'agents/ollama';
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = parseInt(process.env.OLLAMA_PORT || '11434');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b-instruct-q4_K_M';

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 2000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  // Self-dispatch: pick up pending calls routed to ollama not yet claimed
  try {
    const pending = jaaDB.query('agent_calls', r => r.routedTo === 'ollama' && r.status === 'routed', 5);
    for (const call of pending) await dispatch(call);
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

async function dispatch(call) {
  jaaDB.update('agent_calls', call.uuid, { status: 'processing', agentModule: MODULE_ID, startedAt: Date.now() });

  // Build memory context
  const mem = jaaDB.tail('cortex_memory', 6)
    .map(m => `[${(m.tags || []).join('·')}] ${m.content}`)
    .join('\n');

  const systemPrompt = `You are CORTEX — the intelligence layer of NEXUS v5.0.\n\nCURRENT MEMORY:\n${mem || '(empty)'}\n\nRespond as CORTEX: concise, technical, system-aware.`;

  try {
    const result = await _callOllama(systemPrompt, call.prompt || call.content || '');

    jaaDB.update('agent_calls', call.uuid, {
      status:      'complete',
      result,
      completedAt: Date.now(),
    });

    // Write response to cortex memory
    jaaDB.insert('cortex_memory', {
      uuid:    uid(),
      tags:    ['agent', 'ollama', 'response', ...(call.tags || [])],
      type:    'recall',
      content: result.slice(0, 400),
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts:      Date.now(),
    });

    jaaDB.insert('event_log', {
      uuid:     uid(),
      type:     'agent.response.received',
      payload:  { callUuid: call.uuid, agent: 'ollama', chars: result.length },
      source:   MODULE_ID,
      causedBy: call.uuid,
      ts:       Date.now(),
    });

  } catch (err) {
    jaaDB.update('agent_calls', call.uuid, { status: 'failed', error: err.message });
    jaaDB.insert('failures', {
      uuid:     uid(),
      source:   MODULE_ID,
      error:    err.message,
      stack:    err.stack,
      causedBy: call.uuid,
      ts:       Date.now(),
    });
    throw err;
  }
}

function _callOllama(system, prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:    OLLAMA_MODEL,
      messages: [
        { role: 'system',  content: system },
        { role: 'user',    content: prompt },
      ],
      stream: false,
    });

    const req = http.request({
      host:   OLLAMA_HOST,
      port:   OLLAMA_PORT,
      path:   '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Ollama HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.message?.content || parsed.response || raw);
        } catch {
          resolve(raw);
        }
      });
    });

    req.setTimeout(30000, () => { req.destroy(new Error('Ollama timeout after 30s')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Health check ──────────────────────────────────────────────────────────────
function ping() {
  return new Promise((resolve) => {
    const req = http.request({
      host: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/tags', method: 'GET',
    }, (res) => {
      resolve({ online: res.statusCode === 200, status: res.statusCode });
    });
    req.setTimeout(2000, () => { req.destroy(); resolve({ online: false, status: 'timeout' }); });
    req.on('error', () => resolve({ online: false, status: 'error' }));
    req.end();
  });
}

module.exports = { init, stop, dispatch, ping, MODEL: OLLAMA_MODEL };
