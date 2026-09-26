'use strict';
/**
 * lib/blueprint.js — Phase 42: Blueprint
 * UUID: nexus-blueprint-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * The loop closes. The system reads itself.
 *
 * blueprint.nex.json — machine-readable, single source of truth.
 * blueprint.md       — human-readable, same content.
 *
 * Authority chain:
 *   Blueprint → Manifest → Registry
 *   Blueprint → cli-map  → Grammar + REPL
 *   Blueprint → axioms   → Constitution
 *   Blueprint → config   → Runtime
 *   Blueprint → ui-map   → Architect
 *
 * Boot: one read. component-registry → grammar+cli-map → axioms → config → UI-map → emit blueprint.loaded
 *
 * Blueprint sigma:
 *   Missing from heartbeat → σ += 0.05
 *   σ > 0.65 → INTEGRITY gap, recompile suggested
 *   Any projection divergence → gap opened, fix = recompile
 *
 * §6.1 Blueprint→Manifest is the authority chain — divergent projection = wrong by definition
 * §1.1 Nothing exists until in Blueprint
 * §2.1 Blueprint written to disk before emitting blueprint.loaded
 * §3.1 Bottom-up: registry read before projections generated before Blueprint written
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'blueprint';
const VERSION   = '1.0.0';

const ROOT          = path.join(__dirname, '..');
const BLUEPRINT_JSON = path.join(ROOT, 'blueprint.nex.json');
const BLUEPRINT_MD   = path.join(ROOT, 'blueprint.md');

let _bus = null, _jaa = null;

function init({ bus, jaaDB } = {}) {
  _bus = bus    || null;
  _jaa = jaaDB  || null;
}

/**
 * compile — read the live system, produce blueprint.nex.json + blueprint.md.
 * Zero LLM. One function. Same input → same output.
 *
 * @returns {object} { ok, blueprint, sigma, gaps }
 */
async function compile() {
  const now = Date.now();
  const gaps = [];

  // ── Step 1: Read component registry ─────────────────────────────────────
  let components = [];
  try {
    const reg = require('./component-registry');
    components = reg.list ? reg.list() : [];
  } catch(e) {
    gaps.push({ type: 'blueprint_source_missing', body: `component-registry: ${e.message}`, severity: 'high' });
  }

  // ── Step 2: Read projections (T1.5 output) ───────────────────────────────
  let projections = { cliMap: [], grammarMap: [], uiMap: [], seamMap: [] };
  try {
    const proj = require('../copilot/lib/descriptor-projector');
    projections = proj.projectAll(components);
  } catch(e) {
    gaps.push({ type: 'blueprint_projection_failed', body: e.message, severity: 'medium' });
  }

  // ── Step 2.5: Generate cli-map.json (Phase 40.5) ────────────────────────────
  let cliMapResult = null;
  try {
    const cliMap = require('./cli-map');
    cliMapResult = cliMap.generate();
    if (!cliMapResult.ok) gaps.push({ type: 'cli_map_failed', body: cliMapResult.error, severity: 'medium' });
  } catch(e) {
    gaps.push({ type: 'cli_map_unavailable', body: e.message, severity: 'low' });
  }

  // ── Step 3: Read grammar tree ────────────────────────────────────────────
  let grammarStatus = { ready: false, componentCount: 0 };
  try {
    const ge = require('./grammar-engine');
    grammarStatus = ge.status ? ge.status() : grammarStatus;
  } catch(_) {}

  // ── Step 4: Read axioms from constitutional-ai ───────────────────────────
  let axioms = [];
  try {
    const cai = require('./constitutional-ai');
    axioms = cai.getAxioms ? cai.getAxioms() : [];
  } catch(_) {}

  // ── Step 5: Read runtime config ──────────────────────────────────────────
  let runtimeConfig = {};
  try {
    const cfg = require('./nexus-config');
    runtimeConfig = cfg.getAll ? cfg.getAll() : {};
  } catch(_) {}

  // ── Step 6: Check spec drift ─────────────────────────────────────────────
  let specDrift = [];
  try {
    const drift = require('../orchestrator/lib/spec-drift');
    specDrift = drift.check ? await drift.check() : [];
  } catch(_) {}
  if (specDrift.some(d => d.status === 'DRIFTED')) {
    gaps.push({ type: 'spec_drift', body: `${specDrift.filter(d=>d.status==='DRIFTED').map(d=>d.name).join(', ')}`, severity: 'medium' });
  }

  // ── Step 7: Compute blueprint sigma ──────────────────────────────────────
  let sigma = 0;
  if (components.length === 0) sigma += 0.30;
  if (!grammarStatus.ready)    sigma += 0.10;
  if (axioms.length === 0)     sigma += 0.15;
  if (gaps.length > 0)         sigma += gaps.length * 0.05;
  sigma = Math.min(1, sigma);

  if (sigma > 0.65) {
    gaps.push({ type: 'blueprint_integrity', body: `Blueprint sigma ${sigma.toFixed(3)} > 0.65 — recompile recommended`, severity: 'high' });
  }

  // ── Step 8: Assemble blueprint ───────────────────────────────────────────
  const blueprint = {
    format:      'NEX-BLUEPRINT/1.0',
    uuid:        `bp_${crypto.randomUUID().slice(0, 8)}`,
    version:     VERSION,
    compiledAt:  now,
    compiledBy:  MODULE_ID,
    sigma,

    // Authority chain
    registry: {
      components:    components.length,
      namespaces:    [...new Set(components.map(c => c.namespace))],
      componentIds:  components.map(c => c.id),
    },
    grammar: {
      ready:          grammarStatus.ready,
      componentCount: grammarStatus.componentCount || 0,
      entries:        projections.grammarMap.length,
    },
    constitution: {
      axiomCount: axioms.length,
      axioms:     axioms.slice(0, 20),  // first 20 in blueprint
    },
    cliMap:  projections.cliMap,
    uiMap:   projections.uiMap,
    seamMap: projections.seamMap,
    config:  runtimeConfig,
    specDrift,
    gaps,

    // Full projection index (for Architect)
    projectionIndex: projections.projections?.map(p => ({
      componentId: p.comp?.componentId,
      bpUuids: {
        comp:    p.comp?.bp_uuid,
        cli:     p.cli?.bp_uuid,
        grammar: p.grammar?.bp_uuid,
        ui:      p.ui?.bp_uuid,
        seam:    p.seam?.bp_uuid,
        doc:     p.doc?.bp_uuid,
      },
    })) || [],
  };

  // ── Step 9: §2.1 Write to disk before emitting ───────────────────────────
  try {
    fs.writeFileSync(BLUEPRINT_JSON, JSON.stringify(blueprint, null, 2), 'utf8');
  } catch(e) {
    return { ok: false, error: `Blueprint write failed: ${e.message}`, sigma };
  }

  // Write human-readable blueprint.md
  try {
    const md = _toMarkdown(blueprint);
    fs.writeFileSync(BLUEPRINT_MD, md, 'utf8');
  } catch(_) {}

  // Write gaps to JAA
  if (_jaa) {
    for (const gap of gaps) {
      try {
        _jaa.insert('gaps', { uuid: crypto.randomUUID(), ...gap, status: 'open',
          source: MODULE_ID, ts: now });
      } catch(_) {}
    }
    try {
      _jaa.insert('event_log', { uuid: crypto.randomUUID(), type: 'blueprint.compiled',
        payload: { sigma, components: components.length, gaps: gaps.length, uuid: blueprint.uuid },
        source: MODULE_ID, ts: now });
    } catch(_) {}
  }

  // Emit blueprint.loaded
  if (_bus?.emit) {
    try { _bus.emit('blueprint.loaded', { uuid: blueprint.uuid, sigma, components: components.length }); }
    catch(_) {}
  }

  console.log(`[${MODULE_ID}] compiled — ${components.length} components · σ=${sigma.toFixed(3)} · ${gaps.length} gap(s)`);
  return { ok: true, blueprint, sigma, gaps };
}

function _toMarkdown(bp) {
  const lines = [
    `# NEXUS Blueprint`,
    ``,
    `**UUID:** \`${bp.uuid}\` · **Compiled:** ${new Date(bp.compiledAt).toISOString()} · **σ:** ${bp.sigma.toFixed(3)}`,
    ``,
    `## Registry`,
    `${bp.registry.components} components across ${bp.registry.namespaces.join(', ')}`,
    ``,
    `## Grammar`,
    `${bp.grammar.entries} grammar entries · ready: ${bp.grammar.ready}`,
    ``,
    `## Components`,
    ...bp.cliMap.map(c => `- \`${c.command}\` — ${c.componentId}`),
    ``,
    bp.gaps.length ? [`## Gaps (${bp.gaps.length})`, ...bp.gaps.map(g => `- **[${g.severity}]** ${g.type}: ${g.body}`)].join('\n') : '',
    ``,
    `*Generated by lib/blueprint.js Phase 42*`,
  ];
  return lines.join('\n');
}

/** load — read blueprint from disk */
function load() {
  try {
    return JSON.parse(fs.readFileSync(BLUEPRINT_JSON, 'utf8'));
  } catch(_) { return null; }
}

/** sigma — read current blueprint sigma without recompiling */
function sigma() {
  const bp = load();
  return bp?.sigma ?? null;
}

module.exports = { init, compile, load, sigma, MODULE_ID, VERSION,
  BLUEPRINT_JSON, BLUEPRINT_MD };
