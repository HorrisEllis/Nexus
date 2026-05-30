// ═══════════════════════════════════════════════════
// NEXUS — Translation Layer
// core/translation/index.js
//
// Sits between human input and manifest generator.
// Converts natural language → normalized intent IR.
//
// Three jobs:
//   1. Ambiguity resolution — quantify vague terms
//   2. Concept grounding — map terms to known concepts
//   3. Intent preservation — every translation is a
//      causedBy edge. Drift is traceable.
//
// Produces IntentIR consumed by manifest generator.
// GapHunter measures delta between IR and build output.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel }       = require('../../foundation/kernel');
const { raid }         = require('../raid');
const { getAgent }     = require('../../agents');
const { IntentLearner} = require('./learner');
const { AlignmentScanner } = require('./alignment');

// ── Concept graph — known domain concepts ─────────
// This grows over time via learner. Seeded with common patterns.
const CONCEPT_GRAPH = {
  // Auth domain
  auth:           { resolves: 'authentication', implies: ['users','sessions'], ambiguous: false },
  authentication: { resolves: 'authentication', implies: ['jwt','bcrypt','sessions'], ambiguous: false },
  authorization:  { resolves: 'authorization',  implies: ['rbac','permissions','roles'], ambiguous: false },
  jwt:            { resolves: 'jwt_auth',        implies: ['jsonwebtoken','refresh_tokens'], ambiguous: false },
  oauth:          { resolves: 'oauth2',          implies: ['passport','redirect','scopes'], ambiguous: false },

  // Performance terms — inherently ambiguous, need quantification
  fast:     { resolves: 'performance', metric: 'latency',    target: null, ambiguous: true },
  quick:    { resolves: 'performance', metric: 'latency',    target: null, ambiguous: true },
  scalable: { resolves: 'performance', metric: 'throughput', target: null, ambiguous: true },
  slow:     { resolves: 'performance', metric: 'latency',    target: null, ambiguous: true, inverted: true },

  // Quality terms — ambiguous
  'good error handling': { resolves: 'reliability', pattern: 'error_handling', scope: 'all_endpoints', ambiguous: false },
  'error handling':      { resolves: 'reliability', pattern: 'error_handling', ambiguous: false },
  robust:   { resolves: 'reliability', ambiguous: true },
  clean:    { resolves: 'code_quality', ambiguous: true },
  simple:   { resolves: 'complexity', target: 'low', ambiguous: true },

  // Data layer
  database:   { resolves: 'persistence', ambiguous: true },
  postgres:   { resolves: 'persistence', engine: 'postgresql', ambiguous: false },
  postgresql: { resolves: 'persistence', engine: 'postgresql', ambiguous: false },
  mysql:      { resolves: 'persistence', engine: 'mysql',      ambiguous: false },
  redis:      { resolves: 'cache',       engine: 'redis',      ambiguous: false },
  mongo:      { resolves: 'persistence', engine: 'mongodb',    ambiguous: false },
  mongodb:    { resolves: 'persistence', engine: 'mongodb',    ambiguous: false },
  sqlite:     { resolves: 'persistence', engine: 'sqlite',     ambiguous: false },

  // API patterns
  rest:     { resolves: 'api_style', style: 'rest',    ambiguous: false },
  graphql:  { resolves: 'api_style', style: 'graphql', ambiguous: false },
  grpc:     { resolves: 'api_style', style: 'grpc',    ambiguous: false },
  websocket:{ resolves: 'realtime',  protocol: 'ws',   ambiguous: false },

  // Frameworks (language-specific grounding happens in learner)
  express:  { resolves: 'framework', name: 'express', lang: 'javascript', ambiguous: false },
  fastapi:  { resolves: 'framework', name: 'fastapi', lang: 'python',     ambiguous: false },
  django:   { resolves: 'framework', name: 'django',  lang: 'python',     ambiguous: false },
  actix:    { resolves: 'framework', name: 'actix',   lang: 'rust',       ambiguous: false },
  gin:      { resolves: 'framework', name: 'gin',     lang: 'go',         ambiguous: false },

  // Testing
  test:     { resolves: 'testing', ambiguous: false },
  tests:    { resolves: 'testing', ambiguous: false },
  spec:     { resolves: 'testing', style: 'bdd',    ambiguous: true },
  e2e:      { resolves: 'testing', style: 'e2e',    ambiguous: false },
  unit:     { resolves: 'testing', style: 'unit',   ambiguous: false },
};

// ── Clarification questions — for ambiguous terms ──
const CLARIFY_TEMPLATES = {
  performance: (term) => `"${term}" — do you mean: (a) response latency < X ms, (b) throughput > Y req/s, or (c) build/compile time?`,
  reliability: (term) => `"${term}" — what failure modes matter most: (a) network errors, (b) validation errors, (c) database failures, or (d) all?`,
  persistence: ()     => `What database engine? PostgreSQL, MySQL, SQLite, MongoDB, or other?`,
  complexity:  (term) => `"${term}" — simple in what way: (a) minimal dependencies, (b) few files, (c) easy to understand, or (d) all of the above?`,
  code_quality:(term) => `"${term}" — what does that mean for this project: (a) linted/formatted, (b) typed, (c) well-documented, or (d) tested?`,
};

// ── Translation Layer ─────────────────────────────
class TranslationLayer {
  constructor() {
    this._learner   = new IntentLearner();
    this._alignment = new AlignmentScanner();
    this._sessionCtx = {}; // per-session accumulated context
  }

  // ── Main translate method ──────────────────────
  // input: raw user string
  // sessionId: for context accumulation across turns
  // Returns IntentIR
  async translate(input, opts = {}) {
    const { sessionId = 'default', priorManifest = null, requestEventId } = opts;

    kernel.emit('translation.started', {
      inputLength: input.length,
      sessionId,
    }, { causedBy: requestEventId });

    // Step 1: Local grounding (no LLM needed for known concepts)
    const localGrounding = this._groundLocally(input, sessionId);

    // Step 2: LLM normalization for complex/ambiguous remainder
    let llmNormalized = null;
    if (localGrounding.needsLLM) {
      llmNormalized = await this._normalizeWithLLM(input, localGrounding, requestEventId);
    }

    // Step 3: Merge local + LLM groundings
    const normalized = this._merge(localGrounding, llmNormalized);

    // Step 4: Run GapHunter on the IR itself
    const gaps = this._detectIntentGaps(normalized, input);

    // Step 5: Compute alignment score
    const alignmentScore = this._scoreAlignment(normalized, gaps);

    // Step 6: If prior manifest exists — measure drift
    let drift = null;
    if (priorManifest) {
      drift = this._alignment.measureDrift(normalized, priorManifest);
    }

    // Step 7: Update learner with this translation
    this._learner.record(sessionId, { input, normalized, gaps, alignmentScore });

    // Accumulate session context
    this._mergeSessionCtx(sessionId, normalized);

    const ir = {
      id:              `ir-${Date.now()}`,
      sessionId,
      original:        input,
      normalized,
      gaps,
      alignmentScore,
      drift,
      needsClarification: gaps.filter(g => g.type === 'weak' && g.needsClarification).map(g => g.term),
      confident:       normalized.concepts.filter(c => !c.ambiguous).map(c => c.term),
      ambiguous:       normalized.concepts.filter(c => c.ambiguous).map(c => c.term),
      impliedDeps:     [...new Set(normalized.concepts.flatMap(c => c.impliedDeps || []))],
      sessionCtx:      this._sessionCtx[sessionId] || {},
    };

    kernel.emit('translation.complete', {
      id:             ir.id,
      alignmentScore: ir.alignmentScore,
      gaps:           ir.gaps.length,
      needsClarification: ir.needsClarification,
      confident:      ir.confident.length,
    }, { causedBy: requestEventId });

    return ir;
  }

  // ── Local grounding — no LLM ───────────────────
  _groundLocally(input, sessionId) {
    const lower    = input.toLowerCase();
    const concepts = [];
    const matched  = new Set();
    let   needsLLM = false;

    // Match against concept graph (longest match first)
    const sorted = Object.keys(CONCEPT_GRAPH).sort((a,b) => b.length - a.length);
    for (const term of sorted) {
      if (matched.has(term)) continue;
      const idx = lower.indexOf(term);
      if (idx === -1) continue;

      const concept = { ...CONCEPT_GRAPH[term], term, matchedAt: idx };
      concepts.push(concept);
      matched.add(term);

      if (concept.ambiguous) needsLLM = true;
    }

    // Apply session context — ground terms from prior turns
    const ctx = this._sessionCtx[sessionId] || {};
    if (ctx.lang && !concepts.find(c => c.resolves === 'lang')) {
      concepts.push({ resolves: 'lang', value: ctx.lang, term: ctx.lang, ambiguous: false, fromContext: true });
    }

    // Detect language from code snippets or explicit mention
    const langMatch = lower.match(/\b(typescript|javascript|python|rust|go|java|php|csharp|c#|kotlin|swift)\b/);
    if (langMatch && !concepts.find(c => c.resolves === 'lang')) {
      concepts.push({ resolves: 'lang', value: langMatch[1], term: langMatch[1], ambiguous: false });
    }

    // Detect token/number patterns (quantified constraints)
    const numPatterns = [...input.matchAll(/(\d+)\s*(ms|seconds?|req\/s|rps|kb|mb|gb)/gi)];
    for (const m of numPatterns) {
      concepts.push({
        resolves: 'quantified_constraint',
        value:    parseInt(m[1]),
        unit:     m[2].toLowerCase(),
        term:     m[0],
        ambiguous: false,
      });
    }

    return { concepts, matched: [...matched], needsLLM };
  }

  // ── LLM normalization for complex cases ───────
  async _normalizeWithLLM(input, localGrounding, requestEventId) {
    const prompt = buildNormalizationPrompt(input, localGrounding);

    try {
      const decision = await raid.decide({ type: 'schema_gen', tokens: 600, _eventId: requestEventId });
      const agent    = getAgent(decision.agent);
      const raw      = await agent.complete({ prompt, temperature: 0, taskType: 'translation' });
      return JSON.parse(raw.replace(/```json?/g,'').replace(/```/g,'').trim());
    } catch (e) {
      kernel.emit('translation.llm_failed', { error: e.message });
      return null;
    }
  }

  // ── Merge local + LLM groundings ──────────────
  _merge(local, llm) {
    if (!llm) {
      return {
        concepts:    local.concepts,
        constraints: [],
        domain:      this._inferDomain(local.concepts),
        structure:   {},
      };
    }

    // LLM output provides structure — merge with local concept matches
    return {
      concepts:    [...local.concepts, ...(llm.additionalConcepts || [])],
      constraints: llm.constraints || [],
      domain:      llm.domain || this._inferDomain(local.concepts),
      structure:   llm.structure || {},
      entities:    llm.entities || [],
    };
  }

  // ── Intent gap detection ───────────────────────
  _detectIntentGaps(normalized, original) {
    const gaps = [];

    // WEAK: ambiguous concepts with no quantification
    for (const concept of normalized.concepts) {
      if (concept.ambiguous && !concept.target && !concept.value) {
        gaps.push({
          type:             'weak',
          path:             `intent/${concept.resolves}`,
          term:             concept.term,
          body:             `"${concept.term}" is ambiguous — ${CLARIFY_TEMPLATES[concept.resolves]?.(concept.term) || 'needs clarification'}`,
          severity:         'medium',
          needsClarification: true,
          clarifyQuestion:  CLARIFY_TEMPLATES[concept.resolves]?.(concept.term),
        });
      }
    }

    // MISSING: common implied concepts not mentioned
    const hasPersistence = normalized.concepts.some(c => ['persistence','cache'].includes(c.resolves));
    const hasAuth        = normalized.concepts.some(c => c.resolves === 'authentication');
    const hasUsers       = original.toLowerCase().includes('user');

    if (hasAuth && !hasPersistence && hasUsers) {
      gaps.push({
        type:     'missing',
        path:     'intent/persistence',
        term:     'database',
        body:     'Authentication system implies user storage — no database mentioned. Add persistence layer to intent.',
        severity: 'high',
        needsClarification: true,
        clarifyQuestion: 'What database should store users? (PostgreSQL, MySQL, SQLite, MongoDB)',
      });
    }

    // SHADOW: same word, potentially different meaning
    const shadowCandidates = normalized.concepts.filter(c =>
      c.ambiguous && normalized.concepts.filter(x => x.resolves === c.resolves).length > 1
    );
    for (const s of shadowCandidates) {
      gaps.push({
        type:     'shadow',
        path:     `intent/${s.resolves}/collision`,
        term:     s.term,
        body:     `Term "${s.term}" matches multiple concepts — semantic collision. Grounding may be incorrect.`,
        severity: 'medium',
        needsClarification: false,
      });
    }

    // MISSING: no output format specified
    if (!normalized.concepts.some(c => ['api_style','testing'].includes(c.resolves)) && normalized.domain !== 'library') {
      gaps.push({
        type:     'missing',
        path:     'intent/output_format',
        term:     'output',
        body:     'No output format specified (REST API, CLI, library, etc). Manifest generator will have to guess.',
        severity: 'low',
        needsClarification: false,
      });
    }

    return gaps;
  }

  // ── Alignment score ───────────────────────────
  // 0 = complete mismatch, 1 = perfect alignment
  _scoreAlignment(normalized, gaps) {
    const totalConcepts = normalized.concepts.length || 1;
    const confidentConcepts = normalized.concepts.filter(c => !c.ambiguous).length;
    const highSeverityGaps = gaps.filter(g => g.severity === 'high').length;
    const medSeverityGaps  = gaps.filter(g => g.severity === 'medium').length;

    const conceptScore = confidentConcepts / totalConcepts;
    const gapPenalty   = (highSeverityGaps * 0.15) + (medSeverityGaps * 0.05);

    return Math.max(0, Math.min(1, conceptScore - gapPenalty));
  }

  // ── Session context accumulation ──────────────
  _mergeSessionCtx(sessionId, normalized) {
    const ctx = this._sessionCtx[sessionId] || {};
    const lang = normalized.concepts.find(c => c.resolves === 'lang');
    if (lang) ctx.lang = lang.value;
    const db   = normalized.concepts.find(c => c.resolves === 'persistence');
    if (db && db.engine) ctx.db = db.engine;
    const domain = normalized.domain;
    if (domain) ctx.domain = domain;
    this._sessionCtx[sessionId] = ctx;
  }

  _inferDomain(concepts) {
    const resolves = concepts.map(c => c.resolves);
    if (resolves.includes('authentication') || resolves.includes('authorization')) return 'auth';
    if (resolves.includes('api_style'))     return 'api';
    if (resolves.includes('persistence'))   return 'data';
    if (resolves.includes('realtime'))      return 'realtime';
    return 'general';
  }

  // ── Clarification interface ───────────────────
  // Returns questions to ask user before generating manifest
  getClarifications(ir) {
    return ir.gaps
      .filter(g => g.needsClarification && g.clarifyQuestion)
      .map(g => ({ term: g.term, question: g.clarifyQuestion, path: g.path, severity: g.severity }));
  }

  // Apply user's clarification answers to the IR
  applyClarification(ir, answers) {
    for (const { path, value } of answers) {
      const concept = ir.normalized.concepts.find(c => `intent/${c.resolves}` === path);
      if (concept) {
        concept.ambiguous = false;
        concept.target    = value;
        concept.clarified = true;
      }
      // Remove the gap that was clarified
      ir.gaps = ir.gaps.filter(g => g.path !== path);
    }
    ir.alignmentScore = this._scoreAlignment(ir.normalized, ir.gaps);
    ir.needsClarification = ir.gaps.filter(g => g.needsClarification).map(g => g.term);

    kernel.emit('translation.clarified', {
      id:             ir.id,
      answersApplied: answers.length,
      newScore:       ir.alignmentScore,
      remainingGaps:  ir.gaps.length,
    });

    return ir;
  }

  get learner()   { return this._learner; }
  get alignment() { return this._alignment; }
}

// ── LLM normalization prompt ───────────────────────
function buildNormalizationPrompt(input, localGrounding) {
  const alreadyKnown = localGrounding.concepts.filter(c => !c.ambiguous).map(c => c.term);
  return `You are NEXUS intent normalizer. Convert this user input to structured intent JSON.
temp:0 — deterministic output only.

User input: "${input}"
Already grounded (skip these): ${JSON.stringify(alreadyKnown)}

Output ONLY this JSON shape:
{
  "domain": "auth|api|data|realtime|general|library",
  "constraints": [{ "type": "performance|reliability|security|scalability", "metric": "...", "target": null }],
  "structure": { "layers": [], "patterns": [] },
  "entities": ["user", "token", "session"],
  "additionalConcepts": [{ "resolves": "...", "term": "...", "ambiguous": false }]
}`;
}

const translationLayer = new TranslationLayer();
module.exports = { TranslationLayer, translationLayer, CONCEPT_GRAPH, CLARIFY_TEMPLATES };
