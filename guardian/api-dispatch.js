'use strict';
/**
 * guardian/api-dispatch.js — Direct API dispatch for non-NCP providers
 * UUID: nexus-guardian-api-dispatch-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Guardian is the AI engine for the whole system.
 * NCP handles browser-tab providers (Claude.ai, ChatGPT.com).
 * This module handles REST API providers:
 *
 *   ChatGPT (OpenAI)   — token efficiency, grounded outputs, hostile testing
 *   Gemini (Google)    — vision, UI analysis, image generation, multimodal
 *   Perplexity         — real-world research, citations, grounded facts
 *   Claude API         — highest quality reserve, complex reasoning
 *   Ollama             — local, private, zero cost (already handled in forge.js)
 *
 * Every dispatch:
 *   1. Logs to chat-logger (both prompt and response)
 *   2. Feeds BDA signal extraction
 *   3. Updates RAID weight table on outcome
 *   4. Writes to JAA chat_log and artifacts
 *
 * Usage:
 *   const api = require('./api-dispatch');
 *   const result = await api.dispatch('chatgpt', prompt, { command, jobId });
 *
 * Environment variables:
 *   OPENAI_API_KEY       — ChatGPT
 *   GOOGLE_AI_API_KEY    — Gemini
 *   PERPLEXITY_API_KEY   — Perplexity
 *   ANTHROPIC_API_KEY    — Claude API (direct, not NCP)
 */

const https  = require('https');
const crypto = require('crypto');

const MODULE_ID = 'api-dispatch';
const VERSION   = '1.0.0';

// ── Provider configs ──────────────────────────────────────────────────────────
const PROVIDERS = {
  chatgpt: {
    name:    'ChatGPT',
    base:    'api.openai.com',
    path:    '/v1/chat/completions',
    key:     () => process.env.OPENAI_API_KEY,
    model:   () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    // gpt-4o-mini: 85% cost reduction vs gpt-4, still grounded
    buildBody: (prompt, system, opts) => ({
      model:       opts.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      max_tokens:  opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.3,
      messages: [
        ...(system ? [{ role:'system', content: system }] : []),
        { role:'user', content: prompt },
      ],
    }),
    extractText: (d) => d.choices?.[0]?.message?.content || '',
    extractUsage: (d) => d.usage || {},
    supportsVision: true,
    strengths: ['token_efficiency', 'grounded', 'hostile_testing', 'structured_output'],
  },

  gemini: {
    name:  'Gemini',
    base:  'generativelanguage.googleapis.com',
    path:  () => `/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}:generateContent`,
    key:   () => process.env.GOOGLE_AI_API_KEY,
    buildBody: (prompt, system, opts) => ({
      contents: [{ role:'user', parts: [{ text: prompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens: opts.maxTokens || 4096,
        temperature:     opts.temperature ?? 0.4,
      },
    }),
    extractText: (d) => d.candidates?.[0]?.content?.parts?.[0]?.text || '',
    extractUsage: (d) => d.usageMetadata || {},
    supportsVision: true,
    supportsImageGen: true,
    strengths: ['vision', 'ui_analysis', 'image_understanding', 'multimodal', 'speed'],
  },

  perplexity: {
    name:  'Perplexity',
    base:  'api.perplexity.ai',
    path:  '/chat/completions',
    key:   () => process.env.PERPLEXITY_API_KEY,
    buildBody: (prompt, system, opts) => ({
      model:       opts.model || 'llama-3.1-sonar-small-128k-online',
      max_tokens:  opts.maxTokens || 4096,
      temperature: opts.temperature ?? 0.2,
      return_citations: true,
      return_images:    false,
      messages: [
        ...(system ? [{ role:'system', content: system }] : []),
        { role:'user', content: prompt },
      ],
    }),
    extractText:     (d) => d.choices?.[0]?.message?.content || '',
    extractCitations:(d) => d.citations || [],
    extractUsage:    (d) => d.usage || {},
    strengths: ['real_world_facts', 'citations', 'web_search', 'research', 'grounded'],
  },

  claude: {
    name:  'Claude API',
    base:  'api.anthropic.com',
    path:  '/v1/messages',
    key:   () => process.env.ANTHROPIC_API_KEY,
    buildBody: (prompt, system, opts) => ({
      model:      opts.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: opts.maxTokens || 8192,
      ...(system ? { system } : {}),
      messages: [{ role:'user', content: prompt }],
    }),
    headers: () => ({ 'anthropic-version': '2023-06-01', 'anthropic-beta': 'messages-2023-12-15' }),
    extractText: (d) => d.content?.[0]?.text || '',
    extractUsage:(d) => d.usage || {},
    strengths: ['complex_reasoning', 'code_quality', 'nuance', 'long_context', 'forge'],
  },
};

// ── HTTP helper ────────────────────────────────────────────────────────────────
function _post(provider, body, opts = {}) {
  const cfg  = PROVIDERS[provider];
  if (!cfg) return Promise.reject(new Error(`unknown provider: ${provider}`));

  const key = cfg.key();
  if (!key) return Promise.reject(new Error(`${provider}: no API key (set ${_keyEnvVar(provider)})`));

  const path     = typeof cfg.path === 'function' ? cfg.path() : cfg.path;
  const fullPath = provider === 'gemini' ? `${path}?key=${key}` : path;
  const payload  = Buffer.from(JSON.stringify(body));
  const timeout  = opts.timeout || 60000;

  const extraHeaders = typeof cfg.headers === 'function' ? cfg.headers() : {};

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: cfg.base,
      path:     fullPath,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': payload.length,
        ...(provider !== 'gemini' ? { 'Authorization': `Bearer ${key}` } : {}),
        ...(provider === 'claude' ? { 'x-api-key': key } : {}),
        ...extraHeaders,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          const d = JSON.parse(raw);
          if (d.error) reject(new Error(`${provider} API error: ${d.error.message || JSON.stringify(d.error)}`));
          else resolve(d);
        } catch(e) {
          reject(new Error(`${provider} JSON parse failed: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`${provider} timeout after ${timeout}ms`)); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function _keyEnvVar(provider) {
  const vars = { chatgpt:'OPENAI_API_KEY', gemini:'GOOGLE_AI_API_KEY',
                 perplexity:'PERPLEXITY_API_KEY', claude:'ANTHROPIC_API_KEY' };
  return vars[provider] || provider.toUpperCase() + '_API_KEY';
}

// ── Main dispatch ─────────────────────────────────────────────────────────────
async function dispatch(provider, prompt, opts = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return { ok:false, error:`unknown provider: ${provider}`, provider };

  const {
    system     = null,
    command    = 'code',
    jobId      = crypto.randomUUID(),
    maxTokens  = 4096,
    temperature = null,
    model      = null,
    timeout    = 60000,
  } = opts;

  const t0 = Date.now();

  // Log the outgoing prompt
  try {
    const cl = require('../lib/chat-logger');
    if (!cl.getSession()) cl.startSession({ meta: { source: 'guardian-api' } });
    cl.log({ role:'user', content: prompt, provider, intent: command, jobId, outcome:'pending' }).catch(()=>{});
  } catch(_) {}

  let response, text, usage, citations;

  try {
    const body = cfg.buildBody(prompt, system, { maxTokens, temperature, model });
    response   = await _post(provider, body, { timeout });
    text       = cfg.extractText(response);
    usage      = cfg.extractUsage(response);
    citations  = cfg.extractCitations?.(response) || [];
  } catch(e) {
    const ms = Date.now() - t0;

    // Update RAID weights on failure
    try {
      const raid = require('../cortex/core/raid');
      raid.recordOutcome?.(jobId, false, ms);
    } catch(_) {}

    // Log failure
    try {
      const cl = require('../lib/chat-logger');
      cl.log({ role:'assistant', content:'ERROR: '+e.message, provider, outcome:'error', jobId }).catch(()=>{});
    } catch(_) {}

    return { ok:false, error: e.message, provider, jobId, durationMs: ms };
  }

  const ms = Date.now() - t0;

  // Log the response
  try {
    const cl = require('../lib/chat-logger');
    cl.log({ role:'assistant', content: text, provider, outcome:'complete', jobId,
      meta: { usage, citations: citations.length, durationMs: ms } }).catch(()=>{});
  } catch(_) {}

  // Run Liminal gap check on response
  let gapScore = null;
  try {
    const L   = require('../intelligence/liminal');
    const gaps = command === 'code' ? L.analyzeCode(text) : L.analyzeText(text);
    gapScore   = gaps.length ? gaps[0].criticality : 0;
  } catch(_) {}

  // Update RAID weights on success
  try {
    const raid = require('../cortex/core/raid');
    raid.recordOutcome?.(jobId, true, ms);
  } catch(_) {}

  return {
    ok:         true,
    text,
    provider,
    model:      response.model || opts.model || 'unknown',
    jobId,
    durationMs: ms,
    usage,
    citations,
    gapScore,
    strengths:  cfg.strengths,
  };
}

// ── Provider capabilities query ────────────────────────────────────────────────
function capabilities() {
  return Object.entries(PROVIDERS).map(([id, cfg]) => ({
    id,
    name:            cfg.name,
    available:       !!cfg.key(),
    strengths:       cfg.strengths,
    supportsVision:  cfg.supportsVision || false,
    supportsImageGen:cfg.supportsImageGen || false,
    model:           typeof cfg.model === 'function' ? cfg.model() : cfg.model || '?',
  }));
}

function isAvailable(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  return !!cfg.key();
}

module.exports = { dispatch, capabilities, isAvailable, PROVIDERS, MODULE_ID, VERSION };
