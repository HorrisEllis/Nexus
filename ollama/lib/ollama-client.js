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
function callOllamaChatWithTools(model, messages, toolSchemas, timeoutMs) {
  const body = JSON.stringify({ model, messages, tools: toolSchemas, stream: false });
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
          resolve({
            text: msg.content || '',
            toolCalls: (msg.tool_calls || []).map(tc => ({
              id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments,
            })),
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ollama chat request timeout')); });
    req.write(body);
    req.end();
  });
}

function callOllamaRaw(model, prompt, maxTokens, timeoutMs) {
  const body = JSON.stringify({
    model, prompt, stream: false,
    options: { num_predict: maxTokens || 2048, temperature: 0.2 },
  });
  return new Promise((resolve, reject) => {
    const u   = new URL(`${OLLAMA_HOST}/api/generate`);
    const req = http.request({
      hostname: u.hostname, port: u.port || 11434,
      path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs || config.RAW_GENERATE_TIMEOUT_MS,
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { resolve(JSON.parse(d).response || ''); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ollama request timeout')); });
    req.end(body);
  });
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

module.exports = { checkOllama, callOllamaChatWithTools, callOllamaRaw, dispatchWithTools };
