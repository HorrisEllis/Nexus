'use strict';
/**
 * architect/compile-route.js — /api/compile route handler
 * UUID: architect-compile-route-v1-0000-4000
 *
 * Bridges the Architect canvas → spec-compiler pipeline.
 *
 * POST /api/compile
 *   Body: { spec: <arch-builder canvas JSON>, name?: string, dryRun?: boolean }
 *   → Converts canvas JSON to spec-compiler YAML format
 *   → Runs compile() pipeline (T0+T1+KG+gap field+tier map+execution plan)
 *   → Returns full CompileResult
 *
 * POST /api/compile/idearium
 *   Body: { spec: <canvas JSON>, name: string, ideaUuid?: string, ideariumPort?: number }
 *   → Compiles spec
 *   → Creates or updates an Idearium spec with the compile result
 *   → Returns { compileResult, idearium }
 *
 * GET /api/compile/history
 *   → Returns last N compile results from JAA
 *
 * §CC-001  Cortex queried before emit (skipCortex flag for offline use)
 * §CC-002  T0+T1 are deterministic, zero LLM tokens
 * §1.2     All errors are returned as { ok: false, error, step }
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');

// ── Locate spec-compiler ──────────────────────────────────────────────────────
// Look relative to architect/ directory, then NEXUS root
function findSpecCompiler(architectRoot) {
  const candidates = [
    path.join(architectRoot, '..', 'spec-compiler', 'compiler', 'pipeline.js'),
    path.join(architectRoot, 'spec-compiler', 'compiler', 'pipeline.js'),
    path.join(process.cwd(), 'spec-compiler', 'compiler', 'pipeline.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Canvas JSON → spec-compiler YAML string ───────────────────────────────────
// The arch-builder emits JSON with { layers, gates, nodes, edges }.
// spec-compiler wants a YAML .spec with { meta, modules, events, schemas }.
// We translate as faithfully as possible, filling gaps with sane defaults.

function canvasToYAMLSpec(canvasSpec, name = 'unnamed') {
  const meta = {
    name,
    version:    canvasSpec.version || '1.0.0',
    created_at: canvasSpec.generated || new Date().toISOString().slice(0, 10),
    status:     'bootstrapping',
    uuid:       `${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
    purpose:    `Architected in Architect canvas. ${canvasSpec.layers?.length || 0} layers, ${canvasSpec.gates?.length || 0} gates, ${canvasSpec.nodes?.length || 0} nodes.`,
  };

  // Map canvas nodes to spec modules
  const modules = [];

  // Layers become top-level modules
  for (const layer of (canvasSpec.layers || [])) {
    modules.push({
      id:          `MOD-${layer.id?.toUpperCase() || randomUUID().slice(0,8)}`,
      name:        layer.label || layer.id,
      description: layer.sub   || layer.notes || `Layer: ${layer.label}`,
      kind:        'layer',
    });
  }

  // Gates become gate modules with gate_pipeline entries
  for (const gate of (canvasSpec.gates || [])) {
    const gatePipeline = [];
    // Find edges where this gate is the source
    for (const edge of (canvasSpec.edges || [])) {
      if (edge.from === gate.label || edge.from === gate.id) {
        gatePipeline.push(`${gate.label} → ${edge.to}`);
      }
    }
    const mod = {
      id:             `MOD-GATE-${gate.id?.toUpperCase() || randomUUID().slice(0,8)}`,
      name:           gate.label || gate.id,
      description:    gate.sub   || gate.notes || `Gate: ${gate.label}`,
      kind:           'gate',
    };
    if (gatePipeline.length) mod.gate_pipeline = gatePipeline;
    if (gate.snr)  mod.snr_threshold = parseFloat(gate.snr) || undefined;
    if (gate.fail) mod.failure_mode  = gate.fail;
    modules.push(mod);
  }

  // Surfaces/nodes become module entries
  for (const node of (canvasSpec.nodes || [])) {
    modules.push({
      id:          `MOD-${node.id?.toUpperCase() || randomUUID().slice(0,8)}`,
      name:        node.label || node.id,
      description: node.sub   || node.notes || node.label,
      kind:        node.type  || 'module',
    });
  }

  // Build dependency edges from canvas edges
  const edgeMap = {};
  for (const edge of (canvasSpec.edges || [])) {
    if (!edgeMap[edge.from]) edgeMap[edge.from] = [];
    edgeMap[edge.from].push(edge.to);
  }

  // Wire deps: for each module, find edges where its name is the source
  for (const mod of modules) {
    const targets = edgeMap[mod.name] || [];
    if (targets.length) {
      mod.deps = targets.map(t => {
        const target = modules.find(m => m.name === t);
        return target ? target.id : t;
      });
    }
  }

  // Serialize to YAML-compatible spec string
  // spec-compiler uses js-yaml to parse, so we emit proper YAML
  const lines = ['spec:', ''];
  lines.push('  meta:');
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) lines.push(`    ${k}: ${JSON.stringify(String(v))}`);
  }
  lines.push('');
  lines.push('  modules:');
  for (const mod of modules) {
    lines.push(`    - id:          ${JSON.stringify(mod.id)}`);
    lines.push(`      name:        ${JSON.stringify(mod.name)}`);
    if (mod.description) lines.push(`      description: ${JSON.stringify(mod.description)}`);
    if (mod.kind && mod.kind !== 'module') lines.push(`      kind:        ${JSON.stringify(mod.kind)}`);
    if (mod.gate_pipeline?.length) {
      lines.push(`      gate_pipeline:`);
      for (const g of mod.gate_pipeline) lines.push(`        - ${JSON.stringify(g)}`);
    }
    if (mod.deps?.length) {
      lines.push(`      deps:`);
      for (const d of mod.deps) lines.push(`        - ${JSON.stringify(d)}`);
    }
    if (mod.snr_threshold !== undefined) lines.push(`      snr_threshold: ${mod.snr_threshold}`);
    if (mod.failure_mode) lines.push(`      failure_mode: ${JSON.stringify(mod.failure_mode)}`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Compile a canvas spec ─────────────────────────────────────────────────────

async function compileCanvas({ canvasSpec, name, dryRun = true, skipCortex = true, compilerPath, outputDir }) {
  const compile = require(compilerPath);

  // Write spec to a temp file
  const tmpDir  = require('os').tmpdir();
  const specFile = path.join(tmpDir, `architect-${Date.now()}.spec`);
  const outDir   = outputDir || path.join(tmpDir, `architect-out-${Date.now()}`);

  const yamlSpec = canvasToYAMLSpec(canvasSpec, name || 'architect-canvas');
  fs.writeFileSync(specFile, yamlSpec, 'utf8');

  try {
    const result = await compile(specFile, outDir, {
      dryRun,
      skipCortex,
      skipWriteback: skipCortex,
      verbose: false,
    });
    return { ok: result.ok, result, specFile: specFile, yamlSpec };
  } finally {
    // Clean up temp spec file
    try { fs.unlinkSync(specFile); } catch(_) {}
  }
}

// ── Distill compile result for storage / Idearium ────────────────────────────
// The full compile result contains class instances (KG graph, gapField).
// We serialize the parts we care about for JAA storage and Idearium posting.

function distillResult(r) {
  if (!r.ok) return { ok: false, error: r.error, step: r.step };

  const nodes = r.graph
    ? r.graph.getNodesByKind?.('module').map(n => ({
        id:           n.id,
        name:         n.name,
        specDepth:    +(n.specDepth?.toFixed(2) ?? 0),
        readiness:    +(n.generationReadiness?.toFixed(2) ?? 0),
        confidence:   n.confidence,
        tier:         r.executionPlan?.getByTier?.(n.id)?.tier ?? null,
      }))
    : [];

  const gaps = r.gapField
    ? (r.gapField.getAll?.() ?? []).slice(0, 50).map(g => ({
        nodeId:   g.nodeId,
        type:     g.type,
        reason:   g.reason,
        weight:   +(g.weight?.toFixed(3) ?? 0),
        message:  g.message,
      }))
    : [];

  const tierMap = r.tierMap
    ? Object.fromEntries(
        Object.entries(r.tierMap).map(([k, v]) => [
          k, Array.isArray(v) ? v.map(n => ({ id: n.id, name: n.name, tier: n.tier })) : v
        ])
      )
    : null;

  const plan = r.executionPlan ? {
    isExecutable:    r.executionPlan.isExecutable,
    hasBlockers:     r.executionPlan.hasBlockers,
    hasDeferrals:    r.executionPlan.hasDeferrals,
    nextNode:        r.executionPlan.nextNode ? { id: r.executionPlan.nextNode.id, name: r.executionPlan.nextNode.name } : null,
    runCount:        r.executionPlan.counts?.run   ?? 0,
    deferCount:      r.executionPlan.counts?.defer ?? 0,
    blockCount:      r.executionPlan.counts?.block ?? 0,
    t0Count:         r.executionPlan.counts?.t0    ?? 0,
    t1Count:         r.executionPlan.counts?.t1    ?? 0,
    t2Count:         r.executionPlan.counts?.t2    ?? 0,
    runTokenEstimate: r.executionPlan.runTokenEstimate ?? 0,
  } : null;

  return {
    ok:              true,
    moduleName:      r.moduleName,
    readiness:       r.readiness,
    totalGapWeight:  r.totalGapWeight ?? 0,
    tokenForecast:   r.tokenForecast,
    recommendations: r.recommendations ?? [],
    nodes,
    gaps,
    tierMap,
    plan,
    violations:      r.violations ? { count: r.violations.violations?.length ?? 0 } : null,
  };
}

// ── POST to Idearium ──────────────────────────────────────────────────────────

async function postToIdearium({ distilled, name, ideaUuid, ideariumPort = 4800 }) {
  return new Promise((resolve) => {
    // Build sections from compile result
    const sections = [
      { id: 'intent',        content: `Compiled from Architect canvas. ${distilled.nodes?.length ?? 0} modules.` },
      { id: 'module_hooks',  content: JSON.stringify(distilled.nodes, null, 2) },
      { id: 'gap_contract',  content: JSON.stringify(distilled.gaps, null, 2) },
      { id: 'phase_map',     content: JSON.stringify(distilled.tierMap, null, 2) },
    ];

    const payload = JSON.stringify({
      name:        name || 'Architect Spec',
      ideaUuid:    ideaUuid || null,
      source:      'architect.compile',
      sections,
      buildOrder:  distilled.nodes?.map(n => n.name) ?? [],
      wired:       true,
    });

    const req = http.request({
      hostname: '127.0.0.1',
      port:     ideariumPort,
      path:     ideaUuid ? `/api/ideas/${ideaUuid}/spec` : '/api/ideas',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ ok: true, status: res.statusCode, body: JSON.parse(body) }); }
        catch(_) { resolve({ ok: true, status: res.statusCode, body }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

// ── Route handler factory ─────────────────────────────────────────────────────

function createCompileRoutes({ jaa, busEmit, architectRoot }) {
  const compilerPipelinePath = findSpecCompiler(architectRoot);

  return async function handleCompileRoute(method, path_, req, res, url, readBody, json) {
    // ── POST /api/compile ──────────────────────────────────────────────────
    if (method === 'POST' && path_ === '/api/compile') {
      if (!compilerPipelinePath) {
        return json(res, 503, { ok: false, error: 'spec-compiler not found — place spec-compiler/ adjacent to architect/', location: architectRoot });
      }

      const body = await readBody(req);
      const { spec: canvasSpec, name, dryRun = true, skipCortex = true } = body;
      if (!canvasSpec) return json(res, 400, { ok: false, error: 'spec (canvas JSON) required' });

      const started = Date.now();
      try {
        const { ok, result, yamlSpec } = await compileCanvas({
          canvasSpec, name, dryRun, skipCortex,
          compilerPath: compilerPipelinePath,
        });

        const distilled = distillResult(result);
        const elapsed   = Date.now() - started;

        // Persist to JAA
        const record = jaa.insert('snr_results', {
          op: 'compile', name: name || 'canvas',
          distilled, yamlSpec: yamlSpec.slice(0, 4000), // truncate for JAA
          elapsed, ts: Date.now(),
        });

        busEmit('architect.compile.complete', {
          id: record.uuid, name, ok: distilled.ok,
          modules: distilled.nodes?.length, gaps: distilled.gaps?.length,
          elapsed,
        });

        return json(res, 200, { ok: true, id: record.uuid, compile: distilled, elapsed, yamlSpec });
      } catch(e) {
        busEmit('architect.compile.error', { name, error: e.message });
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    // ── POST /api/compile/idearium ─────────────────────────────────────────
    if (method === 'POST' && path_ === '/api/compile/idearium') {
      if (!compilerPipelinePath) {
        return json(res, 503, { ok: false, error: 'spec-compiler not found' });
      }

      const body = await readBody(req);
      const { spec: canvasSpec, name, ideaUuid, ideariumPort = 4800, dryRun = false, skipCortex = true } = body;
      if (!canvasSpec) return json(res, 400, { ok: false, error: 'spec required' });

      const started = Date.now();
      try {
        const { ok, result, yamlSpec } = await compileCanvas({
          canvasSpec, name, dryRun, skipCortex,
          compilerPath: compilerPipelinePath,
        });

        const distilled = distillResult(result);
        const elapsed   = Date.now() - started;

        // Post to Idearium
        const idearium = await postToIdearium({ distilled, name, ideaUuid, ideariumPort });

        // JAA persist
        const record = jaa.insert('snr_results', {
          op: 'compile.idearium', name, distilled,
          idearium: { status: idearium.status, ok: idearium.ok },
          elapsed, ts: Date.now(),
        });

        busEmit('architect.compile.idearium', {
          id: record.uuid, name, ideariumOk: idearium.ok,
          modules: distilled.nodes?.length, elapsed,
        });

        return json(res, 200, { ok: true, id: record.uuid, compile: distilled, idearium, elapsed, yamlSpec });
      } catch(e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    }

    // ── GET /api/compile/history ───────────────────────────────────────────
    if (method === 'GET' && path_ === '/api/compile/history') {
      const records = jaa.query('snr_results', r => r.op?.startsWith?.('compile'), 20)
        .map(r => ({
          id:       r.uuid,
          op:       r.op,
          name:     r.name,
          ok:       r.distilled?.ok,
          modules:  r.distilled?.nodes?.length ?? 0,
          gaps:     r.distilled?.gaps?.length  ?? 0,
          elapsed:  r.elapsed,
          ts:       r.ts,
        }))
        .reverse();
      return json(res, 200, { ok: true, history: records });
    }

    // ── GET /api/compile/status ────────────────────────────────────────────
    if (method === 'GET' && path_ === '/api/compile/status') {
      return json(res, 200, {
        ok:              true,
        compilerFound:   !!compilerPipelinePath,
        compilerPath:    compilerPipelinePath || null,
        architectRoot,
      });
    }

    return null; // not handled — caller should 404
  };
}

module.exports = { createCompileRoutes, canvasToYAMLSpec, distillResult };
