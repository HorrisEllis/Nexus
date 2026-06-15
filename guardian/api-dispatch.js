'use strict';
/**
 * guardian/api-dispatch.js — Direct API dispatch for non-NCP providers
 * UUID: nexus-guardian-api-dispatch-v1-0000-4000-0000-000000000001
 * Version: 1.1.0
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
 *   2. Feeds BDA signal extraction on the assistant response (coding drift detection)
 *   3. Emits explicit diagnostic console output on drift, gap, and failure
 *   4. Updates RAID weight table on outcome
 *   5. Writes to JAA chat_log and artifacts
 *   6. Escalates to self-heal if drift regime is DYSREGULATED or COLLAPSING
 *
 * BDA SESSION LIFECYCLE:
 *   One BDAKernel per provider per Guardian process lifetime.
 *   Only assistant responses are observed (coding drift is an LLM output property).
 *   On regime shift → console diagnostic + RAID weight penalty.
 *   On DYSREGULATED/COLLAPSING → self-heal escalation triggered.
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
const VERSION   = '1.1.0';

// ── BDA session registry — one kernel per provider ────────────────────────────
// Keyed by provider. Created on first dispatch. Never recreated mid-session.
const _bdaSessions = new Map();

function _bdaForProvider(provider) {
  if (_bdaSessions.has(provider)) return _bdaSessions.get(provider);
  try {
    const { BDAKernel } = require('../lib/meta/bda');
    const k = new BDAKernel();

    // ── Regime shift → diagnostic log + RAID weight signal ───────────────────
    k.on('regime', ev => {
      const trust = ev.pendulum?.trust ?? '?';
      console.warn(
        `[api-dispatch][bda][${provider}] REGIME SHIFT: ${ev.prev} → ${ev.curr}` +
        ` | trust=${trust} sigma=${ev.pendulum?.sigma} delta=${ev.pendulum?.delta}` +
        ` | n=${ev.pendulum?.n} phase=${ev.pendulum?.phase} trend=${ev.pendulum?.trend}`
      );
      _signalRaidDrift(provider, ev.curr, ev.pendulum);
    });

    // ── Drift (sigma change > 0.08) → diagnostic log ─────────────────────────
    k.on('drift', ev => {
      console.warn(
        `[api-dispatch][bda][${provider}] DRIFT DETECTED` +
        ` | sigma=${ev.pendulum?.sigma} delta=${ev.pendulum?.delta}` +
        ` | regime=${ev.pendulum?.regime} gaps=${ev.gapCount}` +
        ` | signals: val=${ev.signals?.valence} cert=${ev.signals?.certainty}` +
        ` open=${ev.signals?.openness} tens=${ev.signals?.tension}`
      );
    });

    // ── Alert (DYSREGULATED/COLLAPSING) → escalate ───────────────────────────
    k.on('alert', ev => {
      console.error(
        `[api-dispatch][bda][${provider}] !! ALERT !! regime=${ev.regime}` +
        ` | trust=${ev.pendulum?.trust} — triggering self-heal escalation`
      );
      _escalateDrift(provider, ev.regime, ev.pendulum);
    });

    // ── High-criticality gap ──────────────────────────────────────────────────
    k.on('gap', ev => {
      console.warn(
        `[api-dispatch][bda][${provider}] GAP crit=${ev.gap?.criticality}` +
        ` type=${ev.gap?.type} reason=${ev.gap?.reason} | ${ev.gap?.description?.slice(0,80)}`
      );
    });

    _bdaSessions.set(provider, k);
    console.log(`[api-dispatch][bda] session started — provider=${provider}`);
    return k;
  } catch(e) {
    console.warn(`[api-dispatch][bda] unavailable (${e.message}) — drift detection disabled for ${provider}`);
    _bdaSessions.set(provider, null);
    return null;
  }
}

// ── Signal RAID about drift — penalizes weight for this provider's cluster ────
function _signalRaidDrift(provider, regime, pendulum) {
  try {
    const raid = require('../cortex/core/raid');
    if (typeof raid.recordDrift === 'function') {
      raid.recordDrift(provider, regime, pendulum);
    }
  } catch(_) {}
}

// ── Escalate to self-heal on severe drift ─────────────────────────────────────
function _escalateDrift(provider, regime, pendulum) {
  try {
    const escalation = require('../cortex/self-heal/escalation');
    if (typeof escalation.escalate === 'function') {
      escalation.escalate({
        faultClass:  `bda.drift.${provider}`,
        level:       2,
        description: `Provider ${provider} entered ${regime} regime — coding drift detected`,
        evidence:    { provider, regime, pendulum },
        source:      MODULE_ID,
      });
    }
  } catch(_) {}
}

// ── Provider configs ───────────────────────────────────────────────────────────
const PROVIDERS = {
  chatgpt: {
    name:    'ChatGPT',
    base:    'api.openai.com',
    path:    '/v1/chat/completions',
    key:     () => process.env.OPENAI_API_KEY,
    model:   () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
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

// ── Main dispatch ──────────────────────────────────────────────────────────────
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

    console.error(`[api-dispatch][${provider}] DISPATCH FAILED after ${ms}ms | job=${jobId.slice(0,8)} | ${e.message}`);

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

  // ── BDA: observe assistant response for coding drift ─────────────────────────
  // Only assistant text is observed. Drift is an LLM output property.
  let bdaResult = null;
  const bda = _bdaForProvider(provider);
  if (bda && text) {
    try {
      bdaResult = bda.observe({ role: 'assistant', text });
      const p = bdaResult?.pendulum;
      if (p) {
        console.log(
          `[api-dispatch][bda][${provider}] job=${jobId.slice(0,8)}` +
          ` | regime=${p.regime} trust=${p.trust} sigma=${p.sigma}` +
          ` delta=${p.delta} n=${p.n} trend=${p.trend}`
        );
      }
    } catch(e) {
      console.warn(`[api-dispatch][bda][${provider}] observe error: ${e.message}`);
    }
  }

  // Log the response
  try {
    const cl = require('../lib/chat-logger');
    cl.log({
      role:'assistant', content: text, provider, outcome:'complete', jobId,
      meta: { usage, citations: citations.length, durationMs: ms,
              bdaRegime: bdaResult?.pendulum?.regime || null,
              bdaSigma:  bdaResult?.pendulum?.sigma  || null },
    }).catch(()=>{});
  } catch(_) {}

  // Run Liminal gap check on response
  let gapScore = null;
  try {
    const L   = require('../lib/meta/liminal');
    const gaps = command === 'code' ? L.analyzeCode(text) : L.analyzeText(text);
    gapScore   = gaps.length ? gaps[0].criticality : 0;
    if (gapScore > 0.7) {
      console.warn(
        `[api-dispatch][liminal][${provider}] HIGH GAP score=${gapScore}` +
        ` type=${gaps[0].type} | ${gaps[0].description?.slice(0,80)}`
      );
    }
  } catch(_) {}

  // Update RAID weights on success
  try {
    const raid = require('../cortex/core/raid');
    raid.recordOutcome?.(jobId, true, ms);
  } catch(_) {}

  console.log(
    `[api-dispatch][${provider}] OK ${ms}ms | job=${jobId.slice(0,8)}` +
    ` tokens=${usage?.total_tokens || usage?.totalTokenCount || '?'}` +
    ` gapScore=${gapScore ?? '-'}` +
    ` bdaRegime=${bdaResult?.pendulum?.regime || '-'}`
  );

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
    bdaResult,
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
    bda:             _bdaSessions.has(id) ? (_bdaSessions.get(id)?.state() || null) : null,
  }));
}

function isAvailable(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  return !!cfg.key();
}

// ── BDA state query (for admin/health endpoints) ──────────────────────────────
function bdaState(provider) {
  if (provider) {
    const k = _bdaSessions.get(provider);
    return k ? k.state() : null;
  }
  const out = {};
  for (const [p, k] of _bdaSessions.entries()) {
    out[p] = k ? k.state() : null;
  }
  return out;
}

module.exports = { dispatch, capabilities, isAvailable, bdaState, PROVIDERS, MODULE_ID, VERSION };
