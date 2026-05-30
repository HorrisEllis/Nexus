// ═══════════════════════════════════════════════════
// NEXUS — Alignment Scanner
// core/translation/alignment.js
//
// Measures the delta between:
//   IntentIR (what user asked for)
//   Build output (what's being generated)
//
// Gap types applied to alignment:
//   missing — concept in IR not present in build
//   shadow  — concept in build not in IR (AI introduced it)
//   broken  — concept mapped incorrectly
//   weak    — concept present but poorly implemented
//
// Score updates live as each gate completes.
// RAID learner records alignment per agent.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../../foundation/kernel');

class AlignmentScanner {
  constructor() {
    this._scores  = new Map();  // manifestId → AlignmentState
    this._history = [];         // all alignment events

    // Subscribe to gate completions — update score live
    kernel.on('gate.passed',    e => this._onGateComplete(e, true));
    kernel.on('gate.failed',    e => this._onGateComplete(e, false));
    kernel.on('output.ready',   e => this._onOutputReady(e));
  }

  // ── Scan: intent IR vs manifest ───────────────
  // Called after manifest generation to check IR→manifest fidelity
  scanIRvsManifest(ir, manifest) {
    const gaps = [];

    const manifestConcepts = this._extractManifestConcepts(manifest);
    const irConcepts       = ir.normalized.concepts.map(c => c.resolves);

    // MISSING: IR concept not reflected in manifest
    for (const concept of ir.normalized.concepts) {
      const reflected = manifestConcepts.some(mc =>
        mc.resolves === concept.resolves ||
        mc.deps?.some(d => (concept.impliedDeps || []).includes(d))
      );
      if (!reflected && !concept.ambiguous) {
        gaps.push({
          type:       'missing',
          path:       `alignment/ir→manifest/${concept.resolves}`,
          term:       concept.term,
          body:       `Intent concept "${concept.term}" (${concept.resolves}) not reflected in manifest nodes.`,
          severity:   'high',
          irConcept:  concept,
          layer:      'ir→manifest',
        });
      }
    }

    // SHADOW: manifest concept not in IR (AI introduced it)
    for (const mc of manifestConcepts) {
      const inIR = irConcepts.includes(mc.resolves) ||
                   ir.normalized.concepts.some(c => (c.impliedDeps || []).includes(mc.term));
      if (!inIR && !mc.fromDeps) {
        gaps.push({
          type:      'shadow',
          path:      `alignment/manifest→ir/${mc.resolves}`,
          term:      mc.term,
          body:      `Manifest introduces "${mc.term}" (${mc.resolves}) not present in user intent. AI may have added scope.`,
          severity:  'medium',
          mc,
          layer:     'manifest→ir',
        });
      }
    }

    const score = this._computeScore(ir.normalized.concepts.length, gaps);

    kernel.emit('alignment.scanned', {
      layer:      'ir→manifest',
      manifestId: manifest.id,
      score,
      gaps:       gaps.length,
      missing:    gaps.filter(g => g.type === 'missing').length,
      shadow:     gaps.filter(g => g.type === 'shadow').length,
    });

    return { gaps, score };
  }

  // ── Scan: manifest vs generated code ──────────
  // Called after each gate — does the output match the spec?
  scanManifestvsOutput(manifest, generatedCode, nodeId) {
    const gaps    = [];
    const node    = manifest.nodes?.find(n => n.id === nodeId);
    if (!node) return { gaps, score: 1 };

    // MISSING: deps specified in manifest not imported in code
    const importedDeps = this._extractImports(generatedCode);
    for (const dep of (node.deps || [])) {
      if (!importedDeps.includes(dep)) {
        gaps.push({
          type:     'missing',
          path:     `alignment/manifest→code/${nodeId}/${dep}`,
          term:     dep,
          body:     `Manifest specifies dep "${dep}" but it's not imported in generated code.`,
          severity: 'high',
          nodeId,
          layer:    'manifest→code',
        });
      }
    }

    // SHADOW: code imports things not in manifest deps
    const manifestDeps = new Set(node.deps || []);
    const STDLIB = new Set(['fs','path','crypto','http','https','os','events','stream','util','buffer']);
    for (const imp of importedDeps) {
      if (!manifestDeps.has(imp) && !STDLIB.has(imp) && !imp.startsWith('.')) {
        gaps.push({
          type:     'shadow',
          path:     `alignment/code→manifest/${nodeId}/${imp}`,
          term:     imp,
          body:     `Code imports "${imp}" not listed in manifest deps for node "${nodeId}". Undeclared dependency.`,
          severity: 'medium',
          nodeId,
          layer:    'code→manifest',
        });
      }
    }

    // WEAK: exported API doesn't match spec title/description
    if (node.title && generatedCode.length < 50) {
      gaps.push({
        type:     'weak',
        path:     `alignment/manifest→code/${nodeId}/output_size`,
        term:     nodeId,
        body:     `Generated code for "${nodeId}" is suspiciously short (${generatedCode.length} chars). May be incomplete.`,
        severity: 'high',
        nodeId,
        layer:    'manifest→code',
      });
    }

    const score = this._computeScore((node.deps || []).length + 1, gaps);

    for (const gap of gaps) {
      kernel.emit('gap.found', gap, { relatedTo: [nodeId, manifest.id] });
    }

    return { gaps, score };
  }

  // ── Measure drift: IR vs prior manifest ───────
  // Was the user's intent consistent with what was built last time?
  measureDrift(ir, priorManifest) {
    const irDomain  = ir.normalized.domain;
    const mfDomain  = priorManifest.nodes?.[0]?.type || 'unknown';
    const domainMatch = irDomain === mfDomain ? 1 : 0.5;

    const irConcepts = ir.normalized.concepts.map(c => c.resolves);
    const mfConcepts = this._extractManifestConcepts(priorManifest).map(c => c.resolves);

    const overlap   = irConcepts.filter(c => mfConcepts.includes(c)).length;
    const total     = new Set([...irConcepts, ...mfConcepts]).size || 1;
    const similarity = overlap / total;

    const drift = {
      domainMatch,
      conceptSimilarity: similarity,
      magnitude:         1 - similarity,
      isSignificant:     similarity < 0.5,
    };

    if (drift.isSignificant) {
      kernel.emit('alignment.drift.significant', {
        sessionId:  ir.sessionId,
        similarity,
        irDomain,
        mfDomain,
        message:    'Intent has significantly changed from previous build. Recommend fresh manifest.',
      });
    }

    return drift;
  }

  // ── Gate completion handler ────────────────────
  _onGateComplete(event, passed) {
    const { manifestId, nodeId, agentId } = event.payload;
    if (!manifestId) return;

    const state = this._scores.get(manifestId) || { passed: 0, failed: 0, score: 1 };
    if (passed) state.passed++;
    else        state.failed++;
    state.score = state.passed / (state.passed + state.failed);
    this._scores.set(manifestId, state);

    kernel.emit('alignment.score.updated', {
      manifestId,
      score:  state.score,
      passed: state.passed,
      failed: state.failed,
      agentId,
    });
  }

  _onOutputReady(event) {
    const { manifestId } = event.payload;
    if (!manifestId) return;
    const state = this._scores.get(manifestId);
    if (state) {
      kernel.emit('alignment.final', { manifestId, score: state.score });
    }
  }

  // ── Helpers ────────────────────────────────────
  _extractManifestConcepts(manifest) {
    const concepts = [];
    for (const node of (manifest.nodes || [])) {
      concepts.push({ resolves: node.type, term: node.title, deps: node.deps || [] });
      for (const dep of (node.deps || [])) {
        concepts.push({ resolves: 'dep', term: dep, fromDeps: true });
      }
    }
    return concepts;
  }

  _extractImports(code) {
    const imports = new Set();
    const es  = code.matchAll(/import\s+.+?\s+from\s+['"]([^'"]+)['"]/g);
    const cjs = code.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const m of es)  imports.add(m[1]);
    for (const m of cjs) imports.add(m[1]);
    return [...imports].filter(i => !i.startsWith('.') && !i.startsWith('/'));
  }

  _computeScore(total, gaps) {
    const high = gaps.filter(g => g.severity === 'high').length;
    const med  = gaps.filter(g => g.severity === 'medium').length;
    const penalty = (high * 0.2) + (med * 0.05);
    return Math.max(0, Math.min(1, 1 - penalty));
  }

  getScore(manifestId) { return this._scores.get(manifestId) || null; }
  get history()         { return this._history; }
}

module.exports = { AlignmentScanner };
