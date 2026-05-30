// ═══════════════════════════════════════════════════
// NEXUS — GapHunter
// gate/gap-finder.js
//
// ALK GapHunter adapted for manifest gaps, not verbal.
// Hunts structural absence:
//   missing files, broken contracts,
//   weak assumptions in specs,
//   shadow fields in the task graph.
//
// Every gap found → gap.found event on bus.
// Healer subscribes to gap.found → fix loop.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel }   = require('../foundation/kernel');
const { fileStore, fileRefs } = require('../core/index');

// Gap types from spec
const GAP_TYPES = {
  MISSING:  'missing',   // file/schema/contract does not exist
  BROKEN:   'broken',    // exists but references fail
  SHADOW:   'shadow',    // field exists in one place, missing in another
  WEAK:     'weak',      // assumption present but unvalidated
};

class GapHunter {
  constructor() {
    this._gaps       = [];
    this._ignoreList = new Set();
  }

  // ── Scan manifest for gaps ────────────────────
  async scanManifest(manifest) {
    kernel.emit('gap_hunter.scanning', { manifestId: manifest.id, nodes: manifest.nodes?.length });

    const gaps = [];

    // 1. MISSING: required files not referenced in nodes
    gaps.push(...this._findMissingFiles(manifest));

    // 2. BROKEN: broken node references (causedBy points to nonexistent id)
    gaps.push(...this._findBrokenRefs(manifest));

    // 3. SHADOW: fields present in manifest but absent in schema
    gaps.push(...this._findShadowFields(manifest));

    // 4. WEAK: nodes with no tests defined, no schema reference, no agent assigned
    gaps.push(...this._findWeakAssumptions(manifest));

    // Emit each gap as an event
    for (const gap of gaps) {
      if (this._ignoreList.has(gap.path)) continue;
      this._gaps.push(gap);
      kernel.emit('gap.found', gap, { relatedTo: [manifest.id] });
    }

    kernel.emit('gap_hunter.complete', {
      manifestId: manifest.id,
      gapsFound:  gaps.length,
      byType: {
        missing: gaps.filter(g => g.type === GAP_TYPES.MISSING).length,
        broken:  gaps.filter(g => g.type === GAP_TYPES.BROKEN).length,
        shadow:  gaps.filter(g => g.type === GAP_TYPES.SHADOW).length,
        weak:    gaps.filter(g => g.type === GAP_TYPES.WEAK).length,
      }
    });

    return gaps;
  }

  // ── Scan generated code for gaps ──────────────
  async scanCode(code, manifest, nodeId) {
    const gaps = [];

    // MISSING: imports referenced but likely not available
    const imports = this._extractImports(code);
    for (const imp of imports) {
      if (!this._isKnownPackage(imp)) {
        gaps.push({
          type:     GAP_TYPES.MISSING,
          path:     `${nodeId}/import:${imp}`,
          body:     `Import '${imp}' not found in dependency map. Add to manifest node deps.`,
          nodeId,
          severity: 'medium',
        });
      }
    }

    // BROKEN: function calls to undefined symbols
    const undefinedCalls = this._findUndefinedCalls(code);
    for (const call of undefinedCalls) {
      gaps.push({
        type:     GAP_TYPES.BROKEN,
        path:     `${nodeId}/call:${call}`,
        body:     `Call to '${call}' — not defined in this module. Missing dependency or wrong scope.`,
        nodeId,
        severity: 'high',
      });
    }

    // WEAK: exported functions with no JSDoc / no types
    const untypedExports = this._findUntypedExports(code);
    if (untypedExports.length > 0) {
      gaps.push({
        type:     GAP_TYPES.WEAK,
        path:     `${nodeId}/types`,
        body:     `${untypedExports.length} exported functions lack type annotations: ${untypedExports.slice(0,3).join(', ')}`,
        nodeId,
        severity: 'low',
      });
    }

    for (const gap of gaps) {
      this._gaps.push(gap);
      kernel.emit('gap.found', gap, { relatedTo: [nodeId] });
    }

    return gaps;
  }

  // ── Gap detection methods ──────────────────────

  _findMissingFiles(manifest) {
    const gaps   = [];
    const nodeIds = new Set((manifest.nodes || []).map(n => n.id));

    // Boot order files that should always be present
    const REQUIRED_TYPES = ['project', 'module', 'spec'];
    const presentTypes   = new Set((manifest.nodes || []).map(n => n.type));

    for (const type of REQUIRED_TYPES) {
      if (!presentTypes.has(type)) {
        gaps.push({
          type:     GAP_TYPES.MISSING,
          path:     `manifest/node_type:${type}`,
          body:     `No node of type '${type}' in manifest. Required for complete build.`,
          severity: 'high',
          manifestId: manifest.id,
        });
      }
    }

    // Check for missing test node when code nodes present
    const hasCode = (manifest.nodes || []).some(n => n.type === 'module');
    const hasTest = (manifest.nodes || []).some(n => n.type === 'test');
    if (hasCode && !hasTest) {
      gaps.push({
        type:     GAP_TYPES.MISSING,
        path:     'manifest/test_node',
        body:     'Module nodes present but no test node defined. Gate cannot verify output.',
        severity: 'high',
        manifestId: manifest.id,
      });
    }

    return gaps;
  }

  _findBrokenRefs(manifest) {
    const gaps   = [];
    const ids    = new Set((manifest.nodes || []).map(n => n.id));

    for (const node of (manifest.nodes || [])) {
      if (node.causedBy && !ids.has(node.causedBy)) {
        gaps.push({
          type:     GAP_TYPES.BROKEN,
          path:     `manifest/node:${node.id}/causedBy`,
          body:     `Node '${node.id}' references causedBy:'${node.causedBy}' which does not exist in manifest.`,
          severity: 'high',
          nodeId:   node.id,
          manifestId: manifest.id,
        });
      }
    }
    return gaps;
  }

  _findShadowFields(manifest) {
    const gaps = [];

    // Shadow: a field exists in payload but is not in the schema
    const KNOWN_NODE_FIELDS = new Set(['id','type','title','causedBy','deps','lang','framework','agent','priority','relatedTo']);
    for (const node of (manifest.nodes || [])) {
      for (const key of Object.keys(node)) {
        if (!KNOWN_NODE_FIELDS.has(key)) {
          gaps.push({
            type:     GAP_TYPES.SHADOW,
            path:     `manifest/node:${node.id}/${key}`,
            body:     `Shadow field '${key}' in node '${node.id}' — not present in manifest schema. May cause validation failures downstream.`,
            severity: 'medium',
            nodeId:   node.id,
          });
        }
      }
    }
    return gaps;
  }

  _findWeakAssumptions(manifest) {
    const gaps = [];

    for (const node of (manifest.nodes || [])) {
      // Weak: no agent assigned for non-trivial nodes
      if (['module','api','schema'].includes(node.type) && !node.agent) {
        gaps.push({
          type:     GAP_TYPES.WEAK,
          path:     `manifest/node:${node.id}/agent`,
          body:     `No agent assigned to node '${node.id}' (type: ${node.type}). RAID will decide at runtime — may not be optimal.`,
          severity: 'low',
          nodeId:   node.id,
        });
      }
      // Weak: no deps listed for module nodes
      if (node.type === 'module' && (!node.deps || !node.deps.length)) {
        gaps.push({
          type:     GAP_TYPES.WEAK,
          path:     `manifest/node:${node.id}/deps`,
          body:     `Module node '${node.id}' has no deps listed. Gate generator cannot verify import resolution.`,
          severity: 'low',
          nodeId:   node.id,
        });
      }
    }

    // Weak: no token budget constraint
    if (!manifest.constraints?.tokenBudget) {
      gaps.push({
        type:     GAP_TYPES.WEAK,
        path:     'manifest/constraints/tokenBudget',
        body:     'No token budget constraint set. Generation may exceed agent capabilities.',
        severity: 'medium',
        manifestId: manifest.id,
      });
    }

    return gaps;
  }

  // ── Code analysis helpers ──────────────────────

  _extractImports(code) {
    const imports = new Set();
    // ES modules
    const esMatches = code.matchAll(/import\s+.+?\s+from\s+['"]([^'"]+)['"]/g);
    for (const m of esMatches) imports.add(m[1]);
    // CommonJS
    const cjMatches = code.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
    for (const m of cjMatches) imports.add(m[1]);
    // Only external packages (not relative)
    return [...imports].filter(i => !i.startsWith('.') && !i.startsWith('/'));
  }

  _isKnownPackage(pkg) {
    const NODE_BUILTINS = new Set(['fs','path','crypto','http','https','os','events','stream','util','buffer','url','child_process','worker_threads','net','assert','readline']);
    return NODE_BUILTINS.has(pkg) || pkg.startsWith('@');
  }

  _findUndefinedCalls(code) {
    // Detect calls to likely-undefined symbols (very heuristic)
    // Real impl: AST analysis via tree-sitter
    const defined  = new Set();
    const called   = new Set();

    const defMatches = code.matchAll(/(?:function|const|let|var|class)\s+(\w+)/g);
    for (const m of defMatches) defined.add(m[1]);

    const callMatches = code.matchAll(/\b(\w+)\s*\(/g);
    for (const m of callMatches) {
      if (!defined.has(m[1]) && !GLOBAL_FNS.has(m[1])) called.add(m[1]);
    }

    return [...called].filter(c => c.length > 2 && /^[A-Z]/.test(c)); // only capitalized = likely class refs
  }

  _findUntypedExports(code) {
    // Find exported functions without JSDoc
    const exported = [];
    const matches  = code.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g);
    for (const m of matches) {
      // Check if preceded by JSDoc
      const pos     = m.index;
      const before  = code.slice(Math.max(0, pos - 200), pos);
      if (!before.includes('/**')) exported.push(m[1]);
    }
    return exported;
  }

  ignore(path) { this._ignoreList.add(path); }
  clearGaps()  { this._gaps = []; }
  get gaps()   { return this._gaps; }
}

const GLOBAL_FNS = new Set([
  'console','setTimeout','setInterval','clearTimeout','clearInterval',
  'fetch','require','module','exports','process','Buffer','Promise',
  'Object','Array','String','Number','Boolean','JSON','Math','Date',
  'Error','TypeError','RangeError','parseInt','parseFloat','isNaN',
]);

const gapHunter = new GapHunter();
module.exports = { GapHunter, gapHunter };
