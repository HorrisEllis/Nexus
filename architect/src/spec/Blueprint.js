'use strict';
/**
 * architect/src/spec/Blueprint.js
 * L1 — Spec Engine
 * UUID: architect-spec-engine-v1-0000-4000
 *
 * Blueprint: structural digest — shape without implementation.
 * §A-1  Architecture before implementation.
 * §A-4  Spec is living — append-only, never frozen.
 * §I-7  Compress never modifies kernel.
 * §I-12 Spec file is append-only. Deletions are deprecations.
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ── SNR thresholds (§4.11) ────────────────────────────────────────────────
const SNR_THRESHOLDS = { send: 0.85, hold: 0.65, rewrite: 0.45, flag: 0 };

// ── Blueprint engine ──────────────────────────────────────────────────────
class Blueprint {
  constructor({ jaa, hooks, busEmit = null } = {}) {
    this._jaa   = jaa;
    this._hooks = hooks;  // HookRegistry ref
    this._emit  = busEmit || (() => {});
  }

  // Build blueprint from a .spec.json file
  fromSpec(specPath) {
    const raw = fs.readFileSync(specPath, 'utf8');
    const spec = JSON.parse(raw);
    return this._buildBlueprint(spec, 'spec', specPath);
  }

  // Build blueprint from a YAML .spec file (the NEXUS spec-compiler format)
  fromSpecYAML(specPath) {
    // Read the spec, extract key structural info
    const content = fs.readFileSync(specPath, 'utf8');
    const spec = { meta: { name: path.basename(specPath, '.spec'), version: '1.0.0' }, content };
    return this._buildBlueprint(spec, 'spec', specPath);
  }

  // Build from scanning a directory (L3 topology mapper)
  fromScan(rootPath, opts = {}) {
    const map = scanTopology(rootPath, opts);
    const spec = {
      meta: { name: path.basename(rootPath), version: '0.1.0', source: 'scan' },
      hooks: [],
      surfaces: map.surfaces,
      gaps: map.gaps,
      files: map.files,
    };
    const bp = this._buildBlueprint(spec, 'file-scan', rootPath);
    bp.topology = map;
    return bp;
  }

  _buildBlueprint(spec, source, sourceId) {
    const now = Date.now();
    const id  = randomUUID();
    const bp = {
      id, source, sourceId,
      name:    spec.meta?.name    || 'unnamed',
      version: spec.meta?.version || '1.0.0',
      hooks:       (spec.hooks    || []).map(h => ({ id: h.id || randomUUID(), name: h.name, type: h.type, intent: h.intent })),
      surfaces:    (spec.surfaces || spec.architecture?.surfaces || []).map(s => ({ id: s.id, name: s.name, layer: s.layer, path: s.path })),
      constraints: (spec.constraints || []).map(c => ({ id: c.id, description: c.description, type: c.type })),
      gaps:        (spec.gaps || []).map(g => ({ id: g.id, severity: g.severity, description: g.description, status: g.status })),
      tensions:    [],
      vocabulary:  [],
      macros:      [],
      grammar:     { transitions: {}, roots: [] },
      schemas:     {},
      baseline:    { invariants: [], composite: 1.0, trend: 'stable', peak: { score: 1.0, ts: now } },
      snrScore:    1.0,
      meta:        { causedBy: 'blueprint.build', createdAt: now, updatedAt: now },
      raw:         spec,
    };
    // Compute SNR from spec completeness
    bp.snrScore = this._scoreBlueprint(bp);
    // Persist to JAA
    if (this._jaa) {
      try { this._jaa.insert('blueprints', { id, version: 1, data: bp, causedBy: 'blueprint.build', ts: now }); }
      catch(e) { console.error(`[architect/blueprint] JAA persist: ${e.message}`); }
    }
    this._emit('architect.blueprint.built', { id, name: bp.name, source, snrScore: bp.snrScore });
    return bp;
  }

  _scoreBlueprint(bp) {
    const scores = [];
    scores.push(bp.hooks.length > 0 ? 1 : 0.3);          // has hooks
    scores.push(bp.surfaces.length > 0 ? 1 : 0.3);       // has surfaces
    scores.push(bp.constraints.length > 0 ? 0.9 : 0.5);  // has constraints
    scores.push(bp.gaps.length === 0 ? 1 : Math.max(0.3, 1 - bp.gaps.filter(g=>g.severity==='critical').length * 0.2));
    const sum = scores.reduce((a,b) => a+b, 0);
    return Math.round((sum / scores.length) * 100) / 100;
  }

  read(id) {
    if (!this._jaa) return null;
    const records = this._jaa.query('blueprints', r => r.id === id || r.data?.id === id, 1);
    return records[0]?.data || null;
  }

  list() {
    if (!this._jaa) return [];
    return this._jaa.query('blueprints', () => true, 100)
      .map(r => ({ id: r.id, name: r.data?.name, version: r.data?.version, snrScore: r.data?.snrScore, createdAt: r.ts }));
  }

  diff(a, b) {
    const addedHooks    = b.hooks.filter(h => !a.hooks.find(ah => ah.name === h.name));
    const removedHooks  = a.hooks.filter(h => !b.hooks.find(bh => bh.name === h.name));
    return {
      addedHooks, removedHooks,
      addedEventTypes:   [],
      removedEventTypes: [],
      snrDelta:          (b.snrScore || 0) - (a.snrScore || 0),
      summary: `${addedHooks.length} hooks added, ${removedHooks.length} removed`,
    };
  }

  export(bp, format = 'json') {
    if (format === 'json')    return JSON.stringify(bp, null, 2);
    if (format === 'mermaid') return this._toMermaid(bp);
    if (format === 'spec')    return JSON.stringify(bp.raw || bp, null, 2);
    return JSON.stringify(bp, null, 2);
  }

  _toMermaid(bp) {
    const lines = ['graph TD'];
    for (const s of bp.surfaces) {
      lines.push(`  ${s.id || s.name}["${s.name} (L${s.layer})"]`);
    }
    for (const h of bp.hooks) {
      const from = h.from?.surface || 'src';
      const to   = h.to?.surface   || 'dst';
      lines.push(`  ${from} --"${h.name} [${h.type}]"--> ${to}`);
    }
    return lines.join('\n');
  }
}

// ── SNR Gate (L7) ─────────────────────────────────────────────────────────
class SNRGate {
  constructor({ jaa, busEmit = null } = {}) {
    this._jaa  = jaa;
    this._emit = busEmit || (() => {});
  }

  check(source, context = {}) {
    const id  = randomUUID();
    const now = Date.now();
    // Compute 8-axis SNR score
    const axes = {
      structural:  this._scoreStructural(source),
      causal:      0.9, // deferred until causal graph wired
      constraint:  context.constraints ? this._scoreConstraints(source, context.constraints) : 0.85,
      gap:         context.gaps ? (1 - (context.gaps.filter(g=>g.status==='open').length / Math.max(1, context.gaps.length))) : 0.9,
      tension:     context.tensions ? (1 - (context.tensions.filter(t=>t.status==='open').length / Math.max(1, context.tensions.length))) : 0.9,
      vocabulary:  0.85, // deferred until event type vocabulary wired
      temporal:    0.9,
      behavioral:  0.85,
    };
    const score = Object.values(axes).reduce((a,b) => a+b, 0) / Object.values(axes).length;
    const result = {
      id, sourceId: source?.id || 'unknown', scoredAt: now,
      score: Math.round(score * 100) / 100,
      axes,
      tags: this._collectTags(axes),
      gaps: context.gaps?.filter(g=>g.status==='open') || [],
      tensions: context.tensions?.filter(t=>t.status==='open') || [],
      recommendation: score >= SNR_THRESHOLDS.send    ? 'send'
                    : score >= SNR_THRESHOLDS.hold    ? 'hold'
                    : score >= SNR_THRESHOLDS.rewrite ? 'rewrite'
                    : 'flag',
      confidence: 0.75,
      reasoning: `SNR ${score.toFixed(2)} across 8 axes`,
    };
    // §I-15 never route below 0.45 without operator override
    if (score >= SNR_THRESHOLDS.hold) {
      result.routing = { target: score >= SNR_THRESHOLDS.send ? 'ollama' : 'hold' };
    }
    if (this._jaa) {
      try { this._jaa.insert('snr_results', { id, sourceId: result.sourceId, data: result, ts: now }); }
      catch(e) {}
    }
    this._emit('architect.snr.checked', { id, score: result.score, recommendation: result.recommendation });
    return result;
  }

  _scoreStructural(source) {
    if (!source) return 0.3;
    const hasId   = !!(source.id || source.uuid);
    const hasName = !!(source.name);
    const hasType = !!(source.type || source.meta?.type);
    return (hasId ? 0.4 : 0) + (hasName ? 0.3 : 0) + (hasType ? 0.3 : 0);
  }

  _scoreConstraints(source, constraints) {
    const hard   = constraints.filter(c => c.type === 'hard');
    const passed = hard.filter(c => this._evalConstraint(c, source));
    return hard.length === 0 ? 0.9 : passed.length / hard.length;
  }

  _evalConstraint(constraint, source) {
    // Basic — field presence check. Full expression evaluator in Phase 4.
    if (constraint.condition?.required) {
      return constraint.condition.required.every(field => source[field] !== undefined);
    }
    return true;
  }

  _collectTags(axes) {
    const tags = [];
    for (const [axis, score] of Object.entries(axes)) {
      if (score < SNR_THRESHOLDS.hold) {
        tags.push({ axis, severity: score < SNR_THRESHOLDS.rewrite ? 'critical' : 'high',
          description: `${axis} score below threshold: ${score.toFixed(2)}`,
          suggestion: `Review ${axis} completeness` });
      }
    }
    return tags;
  }

  history(sourceId) {
    if (!this._jaa) return [];
    return this._jaa.query('snr_results', r => r.sourceId === sourceId, 50)
      .map(r => r.data || r);
  }
}

// ── File Topology Scanner (L3) ────────────────────────────────────────────
function scanTopology(rootPath, opts = {}) {
  const ignore   = opts.ignore || ['node_modules','dist','.git','data'];
  const maxDepth = opts.maxDepth || 6;
  const files    = [];
  const surfaces = [];
  const gaps     = [];
  const dataFlows= [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch(_) { return; }
    for (const e of entries) {
      if (ignore.some(i => e.name.startsWith(i) || e.name === i)) continue;
      const full = path.join(dir, e.name);
      const rel  = path.relative(rootPath, full);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (e.isFile() && /\.(js|json|ts|spec|md|yaml|yml|eg)$/.test(e.name)) {
        const type = e.name.endsWith('.spec') || e.name.endsWith('.spec.json') ? 'spec'
          : e.name.endsWith('.test.js') ? 'test'
          : e.name.endsWith('.json') ? (e.name.includes('schema') ? 'schema' : 'config')
          : e.name.endsWith('.md') ? 'data'
          : 'module';
        let size = 0;
        try { size = fs.statSync(full).size; } catch(_) {}
        files.push({ path: full, relative: rel, type, size, imports: [], exports: [], hooks: [], gaps: [], events: [] });
      }
    }
  }
  walk(rootPath, 0);

  // Detect surface directories (any dir with index.js or package.json)
  const dirSet = new Set(files.map(f => path.dirname(f.path)));
  let layerIdx = 0;
  for (const dir of [...dirSet].slice(0, 20)) {
    const rel = path.relative(rootPath, dir);
    if (rel.includes('..')) continue;
    const depth = rel.split(path.sep).length;
    surfaces.push({ id: rel.replace(/[^a-z0-9]/gi,'_'), name: rel, layer: depth, files: [], hooks: [] });
  }

  // Basic gap detection
  if (files.length === 0) {
    gaps.push({ id: randomUUID(), type:'missing-file', description:'No source files found', location: rootPath, severity:'critical', suggestion:'Add source files' });
  }
  const hasTests = files.some(f => f.type === 'test');
  if (!hasTests) {
    gaps.push({ id: randomUUID(), type:'missing-test', description:'No test files found', location: rootPath, severity:'high', suggestion:'Add test files' });
  }
  const hasSpec = files.some(f => f.type === 'spec');
  if (!hasSpec) {
    gaps.push({ id: randomUUID(), type:'no-schema', description:'No .spec file found', location: rootPath, severity:'medium', suggestion:'Add a .spec or .spec.json file' });
  }

  return { files, surfaces, gaps, dataFlows, snrScore: Math.max(0.3, 1 - (gaps.filter(g=>g.severity==='critical').length * 0.3)) };
}

// ── Translate engine (L1 §5.6) ────────────────────────────────────────────
class Translate {
  utl(rawInput) {
    // Universal Translation Layer — raw text → structured constraint objects
    // Full expression evaluator is Phase 2 — this is the stub layer
    const constraints = [], gaps = [], tensions = [];
    const words = (rawInput || '').split(/\s+/);
    const confidence = words.length > 5 ? 0.7 : 0.4;
    return { raw: rawInput, constraints, gaps, tensions, confidence, type_signature: 'text.natural' };
  }

  fieldToSchema(field) {
    // ConstraintField → JSON Schema
    if (!field) return { type: 'object' };
    return { type: 'object', description: JSON.stringify(field), properties: {} };
  }

  clipToTimeline(clip, format = 'markdown') {
    if (!clip?.events?.length) return '# Empty clip\n';
    const lines = [`# Clip: ${clip.id}`, `Events: ${clip.events.length}`, ''];
    for (const ev of clip.events.slice(0, 50)) {
      lines.push(`- [${new Date(ev.meta?.wall || 0).toISOString()}] ${ev.type}`);
    }
    return lines.join('\n');
  }

  blueprintToSpec(blueprint) {
    return {
      meta: { name: blueprint.name, version: blueprint.version, status: 'growing', uuid: blueprint.id },
      intent: { purpose: `Blueprint: ${blueprint.name}`, problem_statement: '', non_goals: [] },
      hooks: blueprint.hooks || [],
      surfaces: blueprint.surfaces || [],
      constraints: blueprint.constraints || [],
      gaps: blueprint.gaps || [],
    };
  }
}

module.exports = { Blueprint, SNRGate, Translate, scanTopology, SNR_THRESHOLDS };
