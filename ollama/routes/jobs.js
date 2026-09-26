'use strict';
/**
 * ollama/routes/jobs.js
 * POST /api/jobs, POST /api/jobs/tools, GET /api/jobs, GET /api/jobs/:id,
 * DELETE /api/jobs/:id
 * Matches registry-components.js: jobs.dispatch, jobs.list, jobs.get, jobs.cancel
 */

const crypto = require('crypto');
const config = require('../config.js');
const { state, broadcast } = require('../lib/state.js');
const { json, readBody } = require('../lib/http-utils.js');
const { dispatchWithTools } = require('../lib/ollama-client.js');
const { pump } = require('../lib/dispatch.js');

async function handle(req, res, { method, url, pathname }) {
  if (method === 'POST' && pathname === '/api/jobs/tools') {
    const body = await readBody(req);
    if (!body.prompt) { json(res, 400, { ok: false, error: 'prompt required' }); return true; }
    try {
      const result = await dispatchWithTools(body.prompt, body.model || state.defaultModel, body.maxIterations);
      json(res, 200, { ok: true, text: result.text, iterations: result.iterations, toolCallLog: result.toolCallLog });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
    return true;
  }

  if (method === 'POST' && pathname === '/api/jobs') {
    const body = await readBody(req);
    if (!body.prompt) { json(res, 400, { ok: false, error: 'prompt required' }); return true; }
    if (!state.ollamaOnline) { json(res, 503, { ok: false, error: 'Ollama host unreachable' }); return true; }

    // A job can reference an uploadId from POST /api/upload; the file's
    // plaintext is prepended as real context, not silently dropped if the
    // upload has expired (400, not a job that quietly runs without it).
    let prompt = body.prompt;
    if (body.uploadId) {
      const up = state.uploads.get(body.uploadId);
      if (!up) { json(res, 400, { ok: false, error: `uploadId '${body.uploadId}' not found — may have expired` }); return true; }
      prompt = `[Uploaded file: ${up.filename}]\n${up.text}\n\n${body.prompt}`;
    }

    const job = {
      uuid:        crypto.randomUUID(),
      prompt,
      model:       body.model || state.defaultModel,
      maxTokens:   body.maxTokens || config.DEFAULT_MAX_TOKENS,
      timeoutMs:   body.timeoutMs || config.DEFAULT_JOB_TIMEOUT_MS,
      contractId:  body.contractId  || 'nexus-interaction-contract-v1::ollama',
      componentId: body.componentId || 'ollama.jobs.dispatch',
      hookId:      body.hookId      || 'ollama.jobs.dispatch.receive',
      requestId:   body.requestId   || crypto.randomUUID(),
      sessionId:   body.sessionId   || null,
      intent:      body.intent      || 'ask',
      status:      'queued',
      queuedAt:    Date.now(),
    };
    // A genuinely elevated request (e.g. copilot's "hey nexus" handshake)
    // jumps to the front instead of waiting its turn.
    if (body.priority === 'highest') state.queue.unshift(job); else state.queue.push(job);
    broadcast('ollama.job.queued', { uuid: job.uuid, intent: job.intent });
    pump();
    json(res, 200, { ok: true, jobId: job.uuid, status: 'queued', position: state.queue.length });
    return true;
  }

  if (method === 'GET' && pathname === '/api/jobs') {
    const status = url.searchParams.get('status');
    let jobs = [...state.running.values(), ...state.complete];
    if (status) jobs = jobs.filter(j => j.status === status);
    json(res, 200, { ok: true, jobs: jobs.slice(0, 50) });
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/jobs/')) {
    const id = pathname.split('/')[3];
    const job = state.running.get(id) || state.complete.find(j => j.uuid === id);
    if (!job) { json(res, 404, { ok: false, error: 'not found' }); return true; }
    json(res, 200, { ok: true, job });
    return true;
  }

  if (method === 'DELETE' && pathname.startsWith('/api/jobs/')) {
    const id  = pathname.split('/')[3];
    const idx = state.queue.findIndex(j => j.uuid === id);
    if (idx >= 0) { state.queue.splice(idx, 1); json(res, 200, { ok: true, cancelled: id }); return true; }
    json(res, 404, { ok: false, error: 'not in queue (may be running or complete)' });
    return true;
  }

  return false;
}

module.exports = { handle };
module.exports.commands = [
  { method: 'POST', path: '/api/jobs/tools' },
  { method: 'POST', path: '/api/jobs' },
  { method: 'GET', path: '/api/jobs' },
  { method: 'GET', path: '/api/jobs/:id', description: 'prefix match — pathname.startsWith(\'/api/jobs/\')' },
  { method: 'DELETE', path: '/api/jobs/:id', description: 'prefix match — pathname.startsWith(\'/api/jobs/\')' },
];
