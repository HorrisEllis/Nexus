'use strict';
// ── agents/claude/index.js ────────────────────────────────────────────────────
// UUID: mod-claude-v5-0000-4000-0000-000000000001
//
// Claude cloud agent. LAW I: only reached when ollama is unavailable or
// explicitly requested by caller. Uses Anthropic API.
//
// §M1: init(cfg) + stop() + dispatch(call).
// §M2: reads: agent_calls. writes: agent_calls, event_log, failures.

const https  = require('https');
const { jaaDB, uid } = require('../../memory/jaa-db');

const MODULE_ID = 'agents/claude';

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 3000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    const pending = jaaDB.query('agent_calls', r => r.routedTo === 'claude' && r.status === 'routed', 3);
    for (const call of pending) await dispatch(call).catch(() => {});
  } catch {}
}

async function dispatch(call) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = 'ANTHROPIC_API_KEY not set — claude agent unavailable';
    jaaDB.update('agent_calls', call.uuid, { status: 'failed', error: err });
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err, ts: Date.now() });
    throw new Error(err);
  }

  jaaDB.update('agent_calls', call.uuid, { status: 'processing', agentModule: MODULE_ID, startedAt: Date.now() });

  const body = JSON.stringify({
    model:      process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages:   [{ role: 'user', content: call.prompt || call.content || '' }],
  });

  try {
    const result = await _callClaude(apiKey, body);
    jaaDB.update('agent_calls', call.uuid, { status: 'complete', result, completedAt: Date.now() });
    jaaDB.insert('event_log', {
      uuid: uid(), type: 'agent.response.received',
      payload: { callUuid: call.uuid, agent: 'claude', chars: result.length },
      source: MODULE_ID, causedBy: call.uuid, ts: Date.now(),
    });
  } catch (err) {
    jaaDB.update('agent_calls', call.uuid, { status: 'failed', error: err.message });
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, causedBy: call.uuid, ts: Date.now() });
    throw err;
  }
}

function _callClaude(apiKey, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host:    'api.anthropic.com',
      path:    '/v1/messages',
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Claude API ${res.statusCode}: ${raw.slice(0, 200)}`));
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.content?.[0]?.text || raw);
        } catch { resolve(raw); }
      });
    });

    req.setTimeout(60000, () => { req.destroy(new Error('Claude API timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { init, stop, dispatch };
