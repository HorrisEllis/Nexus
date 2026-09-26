'use strict';
/**
 * lib/context-builder.js — NEXUS System Context Builder
 * UUID: nexus-ctx-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Assembles a compressed system context for injection into Ollama calls.
 * Gives every local model awareness of the NEXUS system, what's been built,
 * what's broken, and what the active intent is.
 *
 * Output is a system prompt string, token-budgeted for Mistral 7B context.
 *
 * §1.1 — only includes data that can be verified from live JAA
 * §2.1 — reads from disk, never writes
 */

const fs   = require('fs');
const path = require('path');

const MODULE_ID   = 'context-builder';
const MAX_TOKENS  = parseInt(process.env.NEXUS_CTX_TOKENS || '3000');
const WORDS_PER_TOKEN = 0.75; // rough estimate

// ── Component intent registry (from component-map) ───────────────────────────
const COMPONENT_INTENTS = {
  'nexus-co':  'Immutable kernel — invariants, axioms, load-bearing layer',
  'nexus-jaa': 'Three-tier memory — working/short/long with decay. ULTIMATE TRUTH.',
  'nexus-bus': 'Event multiplex — all systems emit/subscribe here',
  'nexus-que': 'Physical queue — file-first, atomic claim, replay on crash',
  'nexus-or':  'Central hub — service registry, SSE broadcast, proxy routes',
  'nexus-br':  'Identity + transport — handshake, tokens, causal routing',
  'nexus-cx':  'Sovereign memory + intelligence — storage, pattern formation, operational intelligence',
  'nexus-gu':  'AI dispatch + routing — SEAM chunker, NCP transport, job queue, RAID',
  'nexus-id':  'Idea capture + knowledge — stores, tags, decay-weighted recall',
  'nexus-ar':  'Constraint-first authoring — spec builder, blueprint viewer, SNR gate',
  'nexus-em':  'Code generation kernel — SEAM compiler, emergence pipeline',
  'nexus-di':  'System observability — sigma/slope/friction, gaps, CFR field',
};

// ── Estimate token count from string ─────────────────────────────────────────
function estimateTokens(str) {
  return Math.ceil(str.split(/\s+/).length / WORDS_PER_TOKEN);
}

// ── Truncate to token budget ──────────────────────────────────────────────────
function truncate(str, maxTokens) {
  const words = str.split(/\s+/);
  const limit = Math.floor(maxTokens * WORDS_PER_TOKEN);
  if (words.length <= limit) return str;
  return words.slice(0, limit).join(' ') + '…';
}

// ── Build context from live JAA via HTTP ──────────────────────────────────────
async function buildContext(opts = {}) {
  const {
    includeGaps     = true,
    includeArtifacts= true,
    includeEvents   = true,
    maxTokens       = MAX_TOKENS,
    intent          = null,    // current user intent (for relevance filtering)
    cortexUrl       = 'http://127.0.0.1:3748',
    guardianUrl     = 'http://127.0.0.1:7820',
  } = opts;

  const budget = { remaining: maxTokens };
  const sections = [];

  function add(section, content) {
    const tokens = estimateTokens(content);
    if (budget.remaining - tokens < 100) return false; // keep 100 token buffer
    sections.push(content);
    budget.remaining -= tokens;
    return true;
  }

  // ── §1: System identity ───────────────────────────────────────────────────
  // §23.14 — same fix as guardian/agents/co-pilot/index.js's system prompt:
  // "sovereign AI orchestration platform" with no further grounding is
  // exactly the seed phrase that produced a fabricated claim about US
  // government use when a small local model was asked "what is NEXUS."
  // This block is shared/reused more broadly than co-pilot's own prompt, so
  // it's the more important of the two to have actually said the real
  // facts rather than a phrase a small model can run away with.
  add('identity', `=== NEXUS SYSTEM CONTEXT ===
NEXUS is a personal, local AI development and orchestration system — built
and operated by one person, running entirely on this machine. No government
affiliation, no remote users, no production deployment beyond localhost.
If asked what NEXUS is or who uses it, answer only from this — do not
embellish or speculate about scope, users, or purpose beyond what's stated.
Architecture: 8 services, all on localhost. CLI → API → Event bus.
Memory: Cortex (:3748) is the ultimate truth — all state lives there.
Routing: RAID routes jobs. LAW_I: local (Ollama) always first.
Every decision is logged to JAA (Just Another Abstraction) before execution.
`);

  // ── §2: Active components ─────────────────────────────────────────────────
  let compSection = '=== COMPONENTS ===\n';
  for (const [id, intent_] of Object.entries(COMPONENT_INTENTS)) {
    compSection += `${id}: ${intent_}\n`;
  }
  add('components', compSection);

  // ── §3: Current gaps (what's broken) ─────────────────────────────────────
  if (includeGaps) {
    try {
      const r = await fetch(`${cortexUrl}/api/gaps?status=open&n=10`,
        { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        const gaps = (d.gaps || d || []).filter(g =>
          g.type !== 'DELTA.TENSION' && g.status !== 'resolved'
        ).slice(0, 8);
        if (gaps.length) {
          let gapSection = '=== OPEN GAPS (what needs fixing) ===\n';
          for (const g of gaps) {
            gapSection += `[${g.severity || 'medium'}] ${g.type}: ${(g.body || '').slice(0, 80)}\n`;
          }
          add('gaps', gapSection);
        }
      }
    } catch(_) {}
  }

  // ── §4: Recent artifacts (what's already been built) ─────────────────────
  if (includeArtifacts) {
    try {
      const r = await fetch(`${guardianUrl}/artifacts?limit=10`,
        { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        const artifacts = (d.artifacts || d || []).slice(0, 8);
        if (artifacts.length) {
          let artSection = '=== RECENT ARTIFACTS (already built — check before generating) ===\n';
          for (const a of artifacts) {
            artSection += `[${a.lang || 'code'}] ${a.name || a.hash?.slice(0,8)}: ${(a.description || a.content || '').slice(0, 60)}\n`;
          }
          add('artifacts', artSection);
        }
      }
    } catch(_) {}
  }

  // ── §5: Recent system events (what just happened) ─────────────────────────
  if (includeEvents) {
    try {
      const r = await fetch(`${cortexUrl}/api/events?n=15&type=guardian.job.complete`,
        { signal: AbortSignal.timeout(2000) }).catch(() => null);
      if (r?.ok) {
        const d = await r.json();
        const events = (d.rows || d.events || []).slice(0, 6);
        if (events.length) {
          let evtSection = '=== RECENT COMPLETIONS ===\n';
          for (const e of events) {
            const p = e.payload || {};
            evtSection += `${p.provider || '?'}: ${(p.prompt || '').slice(0, 60)}\n`;
          }
          add('events', evtSection);
        }
      }
    } catch(_) {}
  }

  // ── §6: Current intent ───────────────────────────────────────────────────
  if (intent) {
    add('intent', `=== CURRENT INTENT ===\n${intent}\n`);
  }

  // ── §7: Active axioms (abridged) ─────────────────────────────────────────
  add('axioms', `=== CORE AXIOMS ===
§1.1 Nothing exists until proven (no stubs, no claimed-working)
§1.2 Nothing silently fails (every error emits to event log)
§1.3 No stubs — real implementations or nothing
§2.1 Disk before behavior (write to JAA before executing)
§3.1 Bottom-up only (data/schema before UI)
§5.7 No sibling imports — everything through event bus or HTTP seam
`);

  const systemPrompt = sections.join('\n');
  return {
    systemPrompt,
    tokensUsed:   maxTokens - budget.remaining,
    tokensBudget: maxTokens,
    sections:     sections.length,
  };
}

// ── Compress conversation history via Ollama ──────────────────────────────────
// When token budget is running low, summarize prior messages with Mistral
async function compressHistory(messages, opts = {}) {
  const {
    ollamaUrl  = 'http://127.0.0.1:11434',
    model      = process.env.RHEON_OLLAMA_MODEL_PRIMARY || 'mistral:7b-instruct-q4_K_M',
    maxTokens  = 800,
  } = opts;

  const history = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const prompt = `Summarize this conversation in under 200 words, keeping key decisions and code snippets:\n\n${history}`;

  try {
    const r = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.response || null;
  } catch(e) {
    console.warn(`[${MODULE_ID}] compress failed: ${e.message}`);
    return null;
  }
}

// ── Check artifact cache before dispatching ───────────────────────────────────
// Returns existing artifact if found, null if needs generation
async function checkArtifactCache(prompt, opts = {}) {
  const {
    guardianUrl = 'http://127.0.0.1:7820',
    similarity  = 0.85,
  } = opts;

  try {
    const r = await fetch(`${guardianUrl}/memory/query?q=${encodeURIComponent(prompt)}&limit=3`,
      { signal: AbortSignal.timeout(2000) }).catch(() => null);
    if (!r?.ok) return null;
    const d = await r.json();
    const hits = (d.results || d || []);
    if (hits.length && hits[0].score >= similarity) {
      return hits[0]; // cache hit
    }
    return null;
  } catch(_) {
    return null;
  }
}

// ── Semantic context assembly ─────────────────────────────────────────────────
// Uses vector memory SNR gate to find semantically relevant context for a prompt.
async function buildSemanticContext(prompt, opts = {}) {
  const { maxTokens = 2000, tables = null, threshold = 0.70 } = opts;
  try {
    const vm = require('./vector-memory');
    const st = await vm.status();
    if (!st.ready) throw new Error('vector memory not ready');
    const { context, items, tokenEstimate, snr } = await vm.assembleContext(prompt, {
      k: 10, threshold, tables, maxTokens,
    });
    if (context && items.length > 0) {
      return { context, itemCount: items.length, tokenEstimate, snr, source: 'vector' };
    }
  } catch(_) {}
  // Fallback to standard context
  const ctx = buildContext({});
  return { context: ctx, itemCount: 0, tokenEstimate: Math.round(ctx.length/4), snr: 0, source: 'standard' };
}

module.exports = {
  buildContext,
  buildSemanticContext,
  compressHistory,
  checkArtifactCache,
  estimateTokens,
  MODULE_ID,
};
