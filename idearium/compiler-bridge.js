'use strict';
/**
 * idearium/compiler-bridge.js — Idearium spec → emerge/compiler Tier 0/1 bridge
 * UUID: idearium-compiler-bridge-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Closes the gap idearium/api/index.js already documents at its 'spec.build'
 * route: spec.build used to only flip a phase field and never actually
 * touched emerge/compiler, a real, separate, working Tier 0/1 compiler.
 *
 * This module converts Idearium's section-shaped spec —
 *   { uuid, name, sections: [{ id, title, content, checklist, ... }] }
 *   (SECTION_IDS: intent, api_callto, module_hooks, cli_spec, schemas,
 *    gap_contract, failure_modes, tests, phase_map)
 * — into the meta/modules/schemas-shaped YAML spec emerge/compiler expects,
 * then runs the real compile() pipeline (Cortex preflight → T0 → T1 → writeback).
 *
 * MODELED ON: architect/compile-route.js's canvasToYAMLSpec()/compileCanvas().
 * That is the only other place in this codebase that bridges a different
 * source format into the spec-compiler, and it solves the exact same
 * problem (foreign shape → YAML temp file → compile()) for Architect canvas
 * JSON. This file follows the same shape-translation + temp-file + cleanup
 * pattern rather than inventing a new one.
 *
 * ── HONEST LIMITS — READ BEFORE TRUSTING OUTPUT ─────────────────────────────
 * Idearium sections are free-text/prose (a human or LLM fills `content` as
 * narrative, not structured data). The compiler needs typed `modules: []` /
 * `schemas: []`. There is no reliable, general way to turn arbitrary prose
 * into typed module definitions without an LLM extraction pass that does not
 * exist yet. So this bridge does real, structured extraction ONLY when a
 * section's content is itself valid YAML/JSON (the expected authoring format
 * for module_hooks / schemas per their section titles) — and falls back to a
 * single honestly-labeled placeholder module (kind: 'unparsed-intent') built
 * from the `intent` section when no structured module data is present.
 * `result.extraction` on the returned object tells you which path was taken:
 *   'structured' — module_hooks/schemas parsed as real module/schema defs
 *   'fallback'   — no structured content found; T0 emitted a single
 *                  placeholder module so the pipeline still runs end-to-end,
 *                  but it is NOT a real decomposition of the spec.
 * §1.3  No stubs presented as production-ready — the fallback path is
 *       reported back to the caller, not silently passed off as a real build.
 */

import { createRequire } from 'module';
import fs   from 'fs';
import path from 'path';
import os   from 'os';

const require = createRequire(import.meta.url);

// emerge/compiler/index.js is CJS — bridge it in via createRequire.
const { compile } = require('../emerge/compiler/index.js');

// ── Section lookup ───────────────────────────────────────────────────────────
function _section(spec, id) {
  return (spec.sections || []).find(s => s.id === id) || null;
}

// Try to parse a section's free-text content as YAML/JSON structured data.
// Returns null (not an exception) if it isn't — this is an expected, common
// case (most sections really are prose), not a parse failure to report.
async function _tryStructured(content) {
  if (!content || typeof content !== 'string' || !content.trim()) return null;
  try {
    const { load } = await import('js-yaml');
    const parsed = load(content);
    // A bare string/number isn't "structured" in any useful sense here.
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch (_) {
    return null; // prose that isn't valid YAML — expected, not an error
  }
}

// ── Idearium section-spec → emerge/compiler YAML spec string ────────────────
async function sectionsToYAMLSpec(spec) {
  const meta = {
    name:       spec.name || 'unnamed-idearium-spec',
    version:    '1.0.0',
    created_at: new Date().toISOString().slice(0, 10),
    status:     'bootstrapping',
    uuid:       spec.uuid || `idearium-${Date.now()}`,
    purpose:    (_section(spec, 'intent')?.content || '').slice(0, 200) || `Idearium spec: ${spec.name || 'unnamed'}`,
  };

  let modules = [];
  let schemas = [];
  let extraction = 'fallback';

  // module_hooks section, structured authoring → real modules
  const hooksContent = _section(spec, 'module_hooks')?.content;
  const structuredModules = await _tryStructured(hooksContent);
  if (structuredModules) {
    const raw = Array.isArray(structuredModules)
      ? structuredModules
      : (structuredModules.modules ?? Object.values(structuredModules));
    if (Array.isArray(raw) && raw.length) {
      modules = raw.map((m, i) => ({
        id:          m.id ?? `MOD-${(m.name ?? `H${i}`).toUpperCase().replace(/[^A-Z0-9]/g, '-')}`,
        name:        m.name ?? m.id ?? `module-${i}`,
        description: m.description ?? '',
        kind:        m.kind ?? 'module',
        ...(m.deps ? { deps: m.deps } : {}),
        ...(m.gate_pipeline ? { gate_pipeline: m.gate_pipeline } : {}),
      }));
      extraction = 'structured';
    }
  }

  // schemas section, structured authoring → real schemas
  const schemasContent = _section(spec, 'schemas')?.content;
  const structuredSchemas = await _tryStructured(schemasContent);
  if (structuredSchemas) {
    const raw = Array.isArray(structuredSchemas)
      ? structuredSchemas
      : (structuredSchemas.schemas ?? Object.values(structuredSchemas));
    if (Array.isArray(raw) && raw.length) schemas = raw;
  }

  // Fallback — no structured module data. Emit ONE honestly-labeled
  // placeholder so T0 still runs end-to-end, rather than emitting nothing
  // or fabricating modules that don't exist in the spec.
  if (!modules.length) {
    modules = [{
      id:          `MOD-${(spec.name || 'UNNAMED').toUpperCase().replace(/[^A-Z0-9]/g, '-')}`,
      name:        spec.name || 'unnamed',
      description: 'AUTO-GENERATED PLACEHOLDER — no structured module_hooks content found. ' +
                    'This is not a real decomposition of the spec; see intent section for ' +
                    'the actual prose description. Author module_hooks as YAML to get real modules.',
      kind:        'unparsed-intent',
    }];
  }

  const lines = ['spec:', '', '  meta:'];
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) lines.push(`    ${k}: ${JSON.stringify(String(v))}`);
  }
  lines.push('', '  modules:');
  for (const mod of modules) {
    lines.push(`    - id:          ${JSON.stringify(mod.id)}`);
    lines.push(`      name:        ${JSON.stringify(mod.name)}`);
    if (mod.description) lines.push(`      description: ${JSON.stringify(mod.description)}`);
    if (mod.kind && mod.kind !== 'module') lines.push(`      kind:        ${JSON.stringify(mod.kind)}`);
    if (mod.deps?.length) {
      lines.push(`      deps:`);
      for (const d of mod.deps) lines.push(`        - ${JSON.stringify(d)}`);
    }
    if (mod.gate_pipeline?.length) {
      lines.push(`      gate_pipeline:`);
      for (const g of mod.gate_pipeline) lines.push(`        - ${JSON.stringify(g)}`);
    }
  }
  if (schemas.length) {
    lines.push('', '  schemas:');
    for (const s of schemas) lines.push(`    - ${JSON.stringify(s)}`);
  }
  lines.push('');

  return { yamlSpec: lines.join('\n'), extraction };
}

// ── Architect topology map — real, not stubbed ──────────────────────────────
// §FIX-ROADMAP-60: this used to write a hand-rolled ui-map.json labeled
// 'phase: 43' as a placeholder. Architect already has a real, working
// endpoint for exactly this — POST /api/map/scan runs scanTopology() against
// an actual directory and persists the result to its topology_maps table.
// Calling the real thing retires one fake artifact in favor of the service
// that already exists, rather than scaffolding the placeholder Architect
// itself doesn't read.
const ARCHITECT_PORT = process.env.ARCHITECT_PORT || 3747;

async function _scanArchitectTopology(outputDir, spec) {
  const http = await import('http');
  const body = JSON.stringify({ rootPath: outputDir, opts: { causedBy: spec.uuid || null } });
  return new Promise((resolve) => {
    const req = http.default.request({
      hostname: '127.0.0.1', port: ARCHITECT_PORT, path: '/api/map/scan',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) resolve({ ok: true, mapId: parsed.id, map: parsed.map });
          else resolve({ ok: false, degraded: true, reason: parsed.error || 'architect map.scan returned not-ok' });
        } catch (e) {
          resolve({ ok: false, degraded: true, reason: `architect response unparsable: ${e.message}` });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, degraded: true, reason: `architect unreachable: ${e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, degraded: true, reason: 'architect map.scan timed out' }); });
    req.write(body);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * compileIdeariumSpec(spec, outputDir, options)
 *   spec:      Idearium section-shaped spec object ({ uuid, name, sections })
 *   outputDir: absolute path to write compiled output + ui-map.json
 *   options:   { tier=1, skipCortex=false, verbose=false }
 * Returns: { ok, t0, t1, topology, extraction, error?, step? }
 *          (same result shape idearium/api/index.js's spec.build route expects)
 */
export async function compileIdeariumSpec(spec, outputDir, options = {}) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, error: 'spec required', step: 'bridge-call' };
  }

  let yamlSpec, extraction;
  try {
    ({ yamlSpec, extraction } = await sectionsToYAMLSpec(spec));
  } catch (e) {
    return { ok: false, error: `spec translation failed: ${e.message}`, step: 'bridge-translate' };
  }

  const tmpDir   = os.tmpdir();
  const specFile = path.join(tmpDir, `idearium-${spec.uuid || Date.now()}.spec`);
  fs.writeFileSync(specFile, yamlSpec, 'utf8');

  try {
    const result = await compile(specFile, outputDir, {
      tier:          options.tier ?? 1,
      skipCortex:    options.skipCortex ?? false,
      skipWriteback: options.skipCortex ?? false,
      verbose:       options.verbose ?? false,
    });

    if (!result.ok) {
      return { ok: false, error: result.error, step: result.step || 'compile', extraction };
    }

    const topology = await _scanArchitectTopology(outputDir, spec);

    return {
      ok: true,
      t0: result.t0,
      t1: result.t1,
      cortex: result.cortex,
      writeback: result.writeback,
      topology,
      extraction,
    };
  } catch (e) {
    return { ok: false, error: e.message, step: 'compile-exception', extraction };
  } finally {
    try { fs.unlinkSync(specFile); } catch (_) {}
  }
}

export default { compileIdeariumSpec };
