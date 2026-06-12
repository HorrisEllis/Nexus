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
      constraints: (spec.constraints || []).map((c, i) => ({
        id:          c.id || `CC-${String(i+1).padStart(3,'0')}`,
        description: c.description || c.rule || '',
        type:        c.type || (c.rule?.match(/\b(must not|never|forbidden)\b/i) ? 'hard' : 'soft'),
        enforced_by: c.enforced_by || c.enforcedBy || [],
        causedBy:    c.causedBy || 'spec',
        status:      c.status || 'active',
        // Embed axiom reference if present
        axiom:       c.axiom || c.ref || null,
        // Embed condition for SNR gate evaluation
        condition:   c.condition || null,
      })),
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

  // ── route — L7 final output surface ──────────────────────────────────────
  // §A-5: SNR gate is the last thing before output.
  // Dispatches to the correct downstream based on score.
  async route(source, context = {}, opts = {}) {
    const snrResult = this.check(source, context);
    const { score, recommendation } = snrResult;
    const guardianPort = opts.guardianPort || 7820;
    const ideariumPort = opts.ideariumPort || 4800;
    const ollamaPort   = opts.ollamaPort   || 11434;
    const http = require('http');

    const dispatch = (port, path, body, label) => new Promise(resolve => {
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ ok: true, label, status: res.statusCode, body: JSON.parse(d) }); }
          catch(_) { resolve({ ok: true, label, status: res.statusCode }); }
        });
      });
      req.on('error', e => resolve({ ok: false, label, error: e.message }));
      req.write(payload); req.end();
    });

    let routeResult = { snr: snrResult, dispatched: false, target: recommendation };

    if (score >= SNR_THRESHOLDS.send) {
      // ≥ 0.85: send to Guardian for AI processing
      const body = { type: 'snr.output.send', payload: { source, context, snr: snrResult }, source: 'architect-snr' };
      routeResult.dispatch = await dispatch(guardianPort, '/api/event', body, 'guardian');
      routeResult.dispatched = routeResult.dispatch.ok;

    } else if (score >= SNR_THRESHOLDS.hold) {
      // ≥ 0.65: hold in Idearium for review
      const body = { description: `SNR hold: score=${score.toFixed(2)} — ${source?.name || 'unknown'}`, tags: ['snr-hold', 'needs-review'], phase: 'seed' };
      routeResult.dispatch = await dispatch(ideariumPort, '/api/ideas', body, 'idearium');
      routeResult.dispatched = routeResult.dispatch.ok;

    } else if (score >= SNR_THRESHOLDS.rewrite) {
      // ≥ 0.45: log gap, request rewrite
      if (this._jaa) {
        this._jaa.insert('gaps', { id: require('crypto').randomUUID(), status: 'open', severity: 'high',
          description: `SNR rewrite required: score=${score.toFixed(2)}`, sourceId: source?.id, causedBy: 'snr-gate', ts: Date.now() });
      }
      this._emit('architect.snr.rewrite-required', { sourceId: source?.id, score, tags: snrResult.tags });
      routeResult.dispatched = true;

    } else {
      // < 0.45: flag — do not route
      if (this._jaa) {
        this._jaa.insert('gaps', { id: require('crypto').randomUUID(), status: 'open', severity: 'critical',
          description: `SNR flagged: score=${score.toFixed(2)} below minimum threshold`, sourceId: source?.id, causedBy: 'snr-gate', ts: Date.now() });
      }
      this._emit('architect.snr.flagged', { sourceId: source?.id, score, tags: snrResult.tags });
    }

    return routeResult;
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
          : e.name.endsWith('.eg') || e.name.endsWith('.emerge') ? 'seam-grammar'
          : e.name.endsWith('.seam') ? 'seam-contract'
          : e.name.endsWith('.test.js') || e.name.endsWith('.test.ts') ? 'test'
          : e.name.endsWith('.json') ? (e.name.includes('schema') ? 'schema' : 'config')
          : e.name.endsWith('.md') ? 'data'
          : e.name.endsWith('.ts') ? 'typescript'
          : e.name.endsWith('.yaml') || e.name.endsWith('.yml') ? 'yaml'
          : 'module';
        let size = 0;
        try { size = fs.statSync(full).size; } catch(_) {}
        files.push({ path: full, relative: rel, type, size, imports: [], exports: [], hooks: [], gaps: [], events: [] });
      }
    }
  }
  walk(rootPath, 0);

  // Detect surface directories (any dir with index.js or package.json)
  // Surface seam-grammar files as explicit surfaces
  for (const f of files.filter(ff => ff.type === 'seam-grammar' || ff.type === 'seam-contract')) {
    surfaces.push({
      name: path.basename(f.path, path.extname(f.path)),
      path: f.path,
      type: f.type,
      layer: f.type === 'seam-contract' ? 5 : 4,  // L5=seam/L4=agents
    });
  }

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
  const hasSpec  = files.some(f => f.type === 'spec');
  const hasSeam  = files.some(f => f.type === 'seam-grammar' || f.type === 'seam-contract');
  if (!hasSpec) {
    gaps.push({ id: randomUUID(), type:'no-schema', description:'No .spec file found', location: rootPath, severity:'medium', suggestion:'Add a .spec or .spec.json file' });
  }
  if (hasSeam && !hasSpec) {
    gaps.push({ id: randomUUID(), type:'seam-no-spec', description:'.eg/.seam files found but no .spec — seam grammar is not backed by a spec contract', location: rootPath, severity:'medium', suggestion:'Add a .spec file describing the seam grammar contract' });
  }

  return { files, surfaces, gaps, dataFlows, snrScore: Math.max(0.3, 1 - (gaps.filter(g=>g.severity==='critical').length * 0.3)) };
}

// ── Translate engine (L1 §5.6) ────────────────────────────────────────────
// ── UTL keyword taxonomy ─────────────────────────────────────────────────────
const UTL_PATTERNS = {
  // Constraint signals
  constraint: /\b(must|shall|never|always|only|forbidden|required|invariant|law|axiom|§)\b/gi,
  // Gap signals
  gap:        /\b(missing|unknown|unclear|undefined|TODO|FIXME|gap|open|unresolved|tbd|not yet)\b/gi,
  // Tension signals
  tension:    /\b(vs|versus|trade.?off|either|or|conflict|tension|balance|choose|prefer)\b/gi,
  // Hook signals
  hook:       /\b(wire|connect|route|from|to|emit|listen|subscribe|dispatch|send|receive)\b/gi,
  // Layer signals
  layer:      /\b(L[0-7]|layer|foundation|persistence|bus|data|logic|agent|seam|ui|snr)\b/gi,
  // Behavioral signals
  behavior:   /\b(when|then|if|on error|fail|throw|assert|verify|validate|check)\b/gi,
};

class Translate {
  // ── utl — Universal Translation Layer ────────────────────────────────────
  // §I-5: No engine receives raw text. All input passes through UTL first.
  // Converts natural language intent into structured constraint objects.
  utl(rawInput) {
    const text = (rawInput || '').trim();
    if (!text) return { raw: text, constraints: [], gaps: [], tensions: [], hooks: [], type_signature: 'text.empty', confidence: 0 };

    const constraints = [], gaps = [], tensions = [], hooks = [];
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(Boolean);
    const words = text.split(/\s+/);

    // Score confidence from content density
    const constraintMatches = (text.match(UTL_PATTERNS.constraint) || []).length;
    const gapMatches        = (text.match(UTL_PATTERNS.gap)        || []).length;
    const tensionMatches    = (text.match(UTL_PATTERNS.tension)    || []).length;
    const hookMatches       = (text.match(UTL_PATTERNS.hook)       || []).length;
    const layerMatches      = (text.match(UTL_PATTERNS.layer)      || []).length;

    const totalSignals = constraintMatches + gapMatches + tensionMatches + hookMatches;
    const confidence = Math.min(0.95, 0.3 + (totalSignals / Math.max(words.length, 1)) * 2 + (layerMatches > 0 ? 0.1 : 0));

    // Extract constraint sentences
    for (const sent of sentences) {
      if (UTL_PATTERNS.constraint.test(sent)) {
        UTL_PATTERNS.constraint.lastIndex = 0;
        constraints.push({
          id:          `utl-c-${Date.now().toString(36)}-${constraints.length}`,
          description: sent,
          type:        sent.match(/\b(never|forbidden|must not)\b/i) ? 'hard' : 'soft',
          source:      'utl',
          confidence,
        });
      }
      UTL_PATTERNS.constraint.lastIndex = 0;

      if (UTL_PATTERNS.gap.test(sent)) {
        UTL_PATTERNS.gap.lastIndex = 0;
        gaps.push({
          id:          `utl-g-${Date.now().toString(36)}-${gaps.length}`,
          description: sent,
          severity:    sent.match(/\b(TODO|FIXME|missing|critical)\b/i) ? 'high' : 'medium',
          source:      'utl',
        });
      }
      UTL_PATTERNS.gap.lastIndex = 0;

      if (UTL_PATTERNS.tension.test(sent)) {
        UTL_PATTERNS.tension.lastIndex = 0;
        tensions.push({
          id:          `utl-t-${Date.now().toString(36)}-${tensions.length}`,
          description: sent,
          source:      'utl',
        });
      }
      UTL_PATTERNS.tension.lastIndex = 0;

      if (UTL_PATTERNS.hook.test(sent)) {
        UTL_PATTERNS.hook.lastIndex = 0;
        hooks.push({
          id:      `utl-h-${Date.now().toString(36)}-${hooks.length}`,
          intent:  sent,
          source:  'utl',
        });
      }
      UTL_PATTERNS.hook.lastIndex = 0;
    }

    // Detect type signature from content
    let type_signature = 'text.natural';
    if (text.startsWith('§') || text.match(/^[A-Z_]+:/m))   type_signature = 'text.axiom';
    else if (text.match(/^spec:|^meta:|^modules:/m))         type_signature = 'text.spec';
    else if (constraintMatches > tensionMatches + gapMatches) type_signature = 'text.constraint-dense';
    else if (gapMatches > 2)                                  type_signature = 'text.gap-rich';
    else if (hookMatches > 2)                                 type_signature = 'text.hook-dense';

    return { raw: text, constraints, gaps, tensions, hooks, confidence, type_signature, signals: { constraintMatches, gapMatches, tensionMatches, hookMatches, layerMatches } };
  }

  // ── fieldToSchema — ConstraintField → JSON Schema ─────────────────────────
  fieldToSchema(field) {
    if (!field) return { type: 'object', properties: {} };
    const props = {};
    for (const [k, v] of Object.entries(field)) {
      if (typeof v === 'number')  props[k] = { type: 'number',  description: `CFR dimension: ${k}`, minimum: 0, maximum: 1 };
      else if (typeof v === 'string') props[k] = { type: 'string' };
      else if (typeof v === 'boolean') props[k] = { type: 'boolean' };
      else props[k] = { type: 'object' };
    }
    return { type: 'object', description: 'ConstraintField snapshot', properties: props, required: Object.keys(props) };
  }

  // ── schemaToTypes — JSON Schema → TypeScript interfaces ───────────────────
  schemaToTypes(schema, name = 'Schema') {
    if (!schema?.properties) return `export interface ${name} {}
`;
    const lines = [`export interface ${name} {`];
    for (const [k, v] of Object.entries(schema.properties)) {
      const tsType = v.type === 'number' ? 'number' : v.type === 'boolean' ? 'boolean' : v.type === 'object' ? 'Record<string,unknown>' : 'string';
      const optional = (schema.required || []).includes(k) ? '' : '?';
      lines.push(`  ${k}${optional}: ${tsType};${v.description ? ' // '+v.description : ''}`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  // ── clipToTimeline — Clip → human-readable timeline ───────────────────────
  clipToTimeline(clip, format = 'markdown') {
    if (!clip?.events?.length) return format === 'json' ? '[]' : '# Empty clip\n';
    if (format === 'json') return JSON.stringify(clip.events.map(ev => ({ ts: ev.meta?.wall || 0, type: ev.type, payload: ev.payload })), null, 2);
    if (format === 'seam') {
      const lines = [`seam clip ${clip.id} {`];
      for (const ev of clip.events.slice(0, 100)) lines.push(`  event ${ev.type} { ts = ${ev.meta?.wall || 0} }`);
      lines.push('}');
      return lines.join('\n');
    }
    // markdown
    const lines = [`# Clip: ${clip.id || 'unnamed'}`, `> ${clip.events.length} events · ${clip.duration || '?'}ms`, ''];
    for (const ev of clip.events.slice(0, 100)) {
      const wall = ev.meta?.wall || ev.ts || 0;
      lines.push(`- **${ev.type}** \`${new Date(wall).toISOString()}\`${ev.payload ? ' — '+JSON.stringify(ev.payload).slice(0,80) : ''}`);
    }
    return lines.join('\n');
  }

  // ── seamToJs — Seam phrase → JS predicate/handler ─────────────────────────
  seamToJs(phrase) {
    if (!phrase) return '// empty phrase';
    // Simple Seam → JS pattern translation
    const p = phrase.trim();
    // "when X emit Y" → event handler
    const whenEmit = p.match(/^when\s+([\w.]+)\s+emit\s+([\w.]+)(?:\s+\{(.+)\})?$/i);
    if (whenEmit) {
      const [,trigger, event, payload=''] = whenEmit;
      return `stream.register(new Gate('${trigger}', ev => {\n  stream.emit(new Event('${event}', {${payload}}));\n}));`;
    }
    // "if X then Y" → conditional
    const ifThen = p.match(/^if\s+(.+)\s+then\s+(.+)$/i);
    if (ifThen) {
      const [,cond, action] = ifThen;
      return `if (${cond.trim()}) { ${action.trim()}; }`;
    }
    // "gate X validates Y" → gate registration
    const gate = p.match(/^gate\s+([\w.]+)\s+validates?\s+(.+)$/i);
    if (gate) {
      const [,name, contract] = gate;
      return `stream.register(new Gate('${name}', ev => {\n  // validate: ${contract.trim()}\n  if (!ev.data) throw new Error('${name}: invalid — ${contract.trim()}');\n}));`;
    }
    return `// seam: ${p}`;
  }

  // ── blueprintToSpec — Blueprint → living .spec structure ─────────────────
  blueprintToSpec(blueprint) {
    const id = blueprint.id || require('crypto').randomUUID();
    return {
      meta: {
        name:       blueprint.name,
        version:    blueprint.version || '0.1.0',
        status:     'growing',
        uuid:       id,
        created_at: new Date().toISOString().slice(0, 10),
        author:     'architect-utl',
      },
      intent: {
        purpose:           `Blueprint: ${blueprint.name}`,
        problem_statement: blueprint.intent || '',
        non_goals:         [],
      },
      constraints: (blueprint.constraints || []).map((c, i) => ({
        id:          c.id || `CC-${String(i+1).padStart(3,'0')}`,
        description: c.description,
        type:        c.type || 'soft',
        enforced_by: [],
      })),
      hooks:    blueprint.hooks    || [],
      surfaces: blueprint.surfaces || [],
      gaps:     (blueprint.gaps || []).map(g => ({ ...g, status: g.status || 'open' })),
      schemas:  blueprint.schemas  || {},
    };
  }
}

module.exports = { Blueprint, SNRGate, Translate, scanTopology, SNR_THRESHOLDS };
