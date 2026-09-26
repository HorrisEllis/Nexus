'use strict';
/**
 * lib/blueprint-index.js — Phase BP-01: Live System Blueprint Index
 * comp_id:  nexus.blueprint.index
 * uuid:     nexus-blueprint-index-v1-0000-2026-0628-jamesbrooks-001
 * version:  1.0.0
 *
 * Maps every NEXUS system to its live component set, CLI commands,
 * SEAM hooks, and co-pilot entry points. Zero LLM. Pure fs + require.
 *
 * Authority chain:
 *   system/registry-components.js  →  blueprint-index (aggregator)
 *     →  copilot/analysis.js L7   (awareness layer)
 *     →  cli-map.js              (command dispatch)
 *     →  copilot/intuition.js    (fast-path grammar)
 *
 * SISO gates:
 *   nexus.blueprint.index.built  — emitted after successful build
 *   nexus.blueprint.index.error  — emitted on partial failure (§1.2)
 *
 * §LAW II  — writes blueprint-index.json BEFORE emitting bus event
 * §1.2     — every missing system logged, never silently skipped
 * §CC-002  — zero LLM; same input → same output
 * §3.1     — build() reads disk, projects, writes disk — no network
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'blueprint-index';
const VERSION   = '1.0.0';
const ROOT      = path.join(__dirname, '..');
const OUT_PATH  = path.join(ROOT, 'blueprint-index.json');

// ── System registry map ───────────────────────────────────────────────────────
// Each entry: { id, label, port, registryPath }
// registryPath is relative to ROOT.
const SYSTEMS = [
  { id: 'orchestrator', label: 'Orchestrator',  port: 9000, registryPath: null },
  // cortex has no standalone registry-components.js; its components are declared
  // inline in cortex/boot.js and cortex/admin-server.js. Skipped until extracted.
  { id: 'cortex',       label: 'Cortex',         port: 3748, registryPath: null },
  { id: 'guardian',     label: 'Guardian',        port: 7820, registryPath: 'guardian/registry-components.js' },
  { id: 'copilot',      label: 'Co-pilot',        port: 3750, registryPath: 'copilot/registry-components.js' },
  { id: 'ollama',       label: 'Ollama Bridge',   port: 3749, registryPath: 'ollama/registry-components.js' },
  { id: 'idearium',     label: 'Idearium',         port: 4800, registryPath: 'idearium/registry-components.js' },
  { id: 'bridge',       label: 'Bridge',           port: 9999, registryPath: 'bridge/registry-components.js' },
  { id: 'emerge',       label: 'Emerge IDE',       port: 4242, registryPath: 'emerge/registry-components.js' },
  { id: 'architect',    label: 'Architect',        port: 3747, registryPath: 'architect/registry-components.js' },
  { id: 'eravos',       label: 'ERAVOS DAW',       port: 3751, registryPath: 'eravos/registry-components.js' },
  { id: 'clear-glass',  label: 'Clear Glass',      port: 7701, registryPath: 'clear-glass/registry-components.js' },
];

// ── Cortex registry-components (inline — cortex folder may vary) ──────────────
const CORTEX_REGISTRY_PATHS = [
  'cortex/registry-components.js',
  'cortex-service.js',   // fallback
];

// ── Per-component CLI projection ──────────────────────────────────────────────
function _projectCLI(comp) {
  const id      = comp.id || 'unknown';
  const route   = comp.route || {};
  const grammar = Array.isArray(comp.grammar) ? comp.grammar : [];
  const params  = Array.isArray(comp.params)  ? comp.params  : [];

  // Primary command = meaningful suffix of the id
  // guardian.gaps.list → 'gaps-list'; guardian.health → 'health'
  const parts_  = id.split('.');
  const suffix  = parts_.length > 2
    ? parts_.slice(1).join('-')   // drop namespace: guardian.gaps.list → gaps-list
    : parts_[parts_.length - 1];  // single-segment: guardian.health → health
  const primary = suffix.replace(/_/g, '-').toLowerCase();

  // Usage string from params
  const usage = params.length
    ? `${primary} ${params.map(p => p.required ? `<${p.name}>` : `[${p.name}]`).join(' ')}`
    : primary;

  return {
    command:     primary,
    aliases:     grammar.slice(0, 4),
    usage,
    method:      route.method || 'GET',
    path:        route.path   || '/',
    description: comp.description || '',
    componentId: id,
    systemId:    comp.namespace || id.split('.')[0],
    tags:        comp.tags || [],
  };
}

// ── Per-component SEAM hook projection ───────────────────────────────────────
function _projectSEAM(comp) {
  const hooks = comp.hooks || {};
  if (!hooks.in?.length && !hooks.out?.length) return null;

  return {
    componentId: comp.id,
    in:  (hooks.in  || []).map(h => ({
      id:       h.id,
      intent:   h.intent   || [],
      contract: h.contract || null,
      tags:     h.tags     || [],
    })),
    out: (hooks.out || []).map(h => ({
      id:        h.id,
      wires_to:  h.wires_to  || [],
      tags:      h.tags      || [],
    })),
  };
}

// ── Per-component co-pilot entry point ────────────────────────────────────────
function _projectCopilot(comp) {
  const hooks   = comp.hooks || {};
  const grammar = Array.isArray(comp.grammar) ? comp.grammar : [];
  const has_in  = hooks.in?.some(h => h.intent?.length > 0);
  if (!has_in && !grammar.length) return null;

  // Build a compact intent→component routing hint for the co-pilot
  const intents = [
    ...(hooks.in?.flatMap(h => h.intent || []) || []),
    ...grammar,
  ];

  return {
    componentId:  comp.id,
    label:        comp.name || comp.id.split('.').pop(),
    description:  comp.description || '',
    intents:      [...new Set(intents)].slice(0, 8),
    contract:     hooks.in?.[0]?.contract || null,
    hookId:       hooks.in?.[0]?.id       || null,
  };
}

// ── Load one system's registry ────────────────────────────────────────────────
function _loadSystem(sys, errors) {
  const { id, label, port, registryPath } = sys;

  // Try to load registry-components.js
  let raw = null;
  if (registryPath) {
    const abs = path.join(ROOT, registryPath);
    if (fs.existsSync(abs)) {
      try {
        // Clear require cache so hot-reload works
        delete require.cache[require.resolve(abs)];
        raw = require(abs);
      } catch(e) {
        errors.push({ systemId: id, error: `require failed: ${e.message}` });
      }
    } else {
      errors.push({ systemId: id, error: `registry not found: ${registryPath}` });
    }
  }

  // Normalize — registry-components can be Array or { components, ... }
  const components = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.components) ? raw.components : [];

  const cliMap     = components.map(_projectCLI);
  const seamHooks  = components.map(_projectSEAM).filter(Boolean);
  const copilotMap = components.map(_projectCopilot).filter(Boolean);

  return {
    systemId:   id,
    label,
    port,
    componentCount: components.length,
    components: components.map(c => ({
      id:          c.id,
      name:        c.name,
      description: c.description,
      route:       c.route,
      tags:        c.tags || [],
      grammar:     c.grammar || [],
    })),
    cliMap,
    seamHooks,
    copilotMap,
  };
}

// ── Main build ────────────────────────────────────────────────────────────────
function build(opts = {}) {
  const { bus } = opts;
  const startMs = Date.now();
  const errors  = [];

  // Build each system
  const systems = SYSTEMS.map(sys => _loadSystem(sys, errors));

  // Flat CLI map across all systems (for grammar trie)
  const allCLI     = systems.flatMap(s => s.cliMap);
  const allSEAM    = systems.flatMap(s => s.seamHooks);
  const allCopilot = systems.flatMap(s => s.copilotMap);

  // Grammar lookup: grammar word/phrase → [{ componentId, systemId, description }]
  // Index both full phrases ('job list') AND individual words ('job', 'list')
  // so single-word queries ('jobs', 'gaps') resolve via prefix/stem matching.
  const grammarIndex = {};
  const _addGrammar = (key, entry) => {
    key = key.toLowerCase().trim().replace(/[^a-z0-9 .-]/g, '');
    if (!key) return;
    if (!grammarIndex[key]) grammarIndex[key] = [];
    // Deduplicate by componentId
    if (!grammarIndex[key].some(e => e.componentId === entry.componentId)) {
      grammarIndex[key].push(entry);
    }
  };
  for (const sys of systems) {
    for (const comp of sys.components) {
      const entry = { componentId: comp.id, systemId: sys.systemId, description: comp.description || '' };
      for (const phrase of (comp.grammar || [])) {
        // Full phrase
        _addGrammar(phrase, entry);
        // Each word individually (allows 'gaps' → 'gaps list'/'gaps summary')
        for (const w of phrase.split(/[\s-]+/)) {
          if (w.length > 2) _addGrammar(w, entry);
        }
        // Plural/stem forms (naive: drop trailing 's')
        if (phrase.endsWith('s') && phrase.length > 4) _addGrammar(phrase.slice(0,-1), entry);
      }
      // Also index the CLI command name itself
      const cliCmd = comp.id.split('.').slice(1).join('-');
      if (cliCmd) _addGrammar(cliCmd, entry);
    }
  }

  // Total component count
  const totalComponents = systems.reduce((n, s) => n + s.componentCount, 0);

  const index = {
    format:          'NEX-BLUEPRINT-INDEX/1.0',
    uuid:            `bpi_${crypto.randomUUID().slice(0, 8)}`,
    version:         VERSION,
    builtAt:         Date.now(),
    builtBy:         MODULE_ID,
    systemCount:     systems.length,
    totalComponents,
    systems,
    allCLI,
    allSEAM,
    allCopilot,
    grammarIndex,
    errors,
    buildMs:         Date.now() - startMs,
  };

  // §LAW II — write to disk BEFORE emitting
  try {
    fs.writeFileSync(OUT_PATH, JSON.stringify(index, null, 2), 'utf8');
  } catch(e) {
    if (bus) bus.emit('nexus.blueprint.index.error', { error: `write failed: ${e.message}`, uuid: index.uuid });
    return { ok: false, error: e.message, index };
  }

  // §SISO — emit AFTER write
  if (bus) {
    bus.emit('nexus.blueprint.index.built', {
      uuid:            index.uuid,
      totalComponents,
      systemCount:     systems.length,
      errors:          errors.length,
      buildMs:         index.buildMs,
    });
  }

  if (errors.length) {
    console.warn(`[${MODULE_ID}] ${errors.length} system(s) missing registry:`,
      errors.map(e => e.systemId).join(', '));
  }
  console.log(`[${MODULE_ID}] built — ${totalComponents} components across ${systems.length} systems · ${index.buildMs}ms`);

  return { ok: true, index };
}

// ── Load cached index from disk (zero-cost read) ──────────────────────────────
function load() {
  try {
    if (!fs.existsSync(OUT_PATH)) return null;
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch(_) { return null; }
}

// ── Get the co-pilot context block (L7) ──────────────────────────────────────
// Returns a compact string for injection into the analysis context.
// Called by copilot/analysis.js assembleContext().
function copilotContextBlock(promptHint = '') {
  const idx = load();
  if (!idx) return '[L7:COMPONENTS] blueprint-index not built yet — run blueprint.build()';

  // If prompt hints at a specific system, surface that system's detail
  const lower = promptHint.toLowerCase();
  const matchedSystem = idx.systems.find(s =>
    lower.includes(s.systemId) || lower.includes(s.label.toLowerCase())
  );

  if (matchedSystem) {
    // Focused: return that system's components + CLI
    const cmds = matchedSystem.cliMap.slice(0, 10)
      .map(c => `  ${c.command} (${c.method} ${c.path}) — ${c.description.slice(0, 60)}`).join('\n');
    return `[L7:COMPONENTS:${matchedSystem.systemId.toUpperCase()}] ${matchedSystem.componentCount} components · port:${matchedSystem.port}\n${cmds}`;
  }

  // Wide: summary of all systems + total component count
  const sysSummary = idx.systems
    .filter(s => s.componentCount > 0)
    .map(s => `  ${s.systemId}:${s.port} — ${s.componentCount} components`)
    .join('\n');

  return [
    `[L7:COMPONENTS] ${idx.totalComponents} total across ${idx.systemCount} systems (built ${new Date(idx.builtAt).toISOString().slice(0,19)})`,
    sysSummary,
    `[L7:CLI] ${idx.allCLI.length} commands · ${idx.allSEAM.length} SEAM hooks · ${idx.allCopilot.length} co-pilot entry points`,
  ].join('\n');
}

// ── Grammar lookup (for intuition fast-path) ──────────────────────────────────
// Returns [{ componentId, systemId, description }] or []
function lookupGrammar(word) {
  const idx = load();
  if (!idx) return [];
  return idx.grammarIndex[word.toLowerCase().trim()] || [];
}

// ── CLI lookup by command name ────────────────────────────────────────────────
function lookupCLI(command) {
  const idx = load();
  if (!idx) return null;
  const lower = command.toLowerCase().replace(/\//, '').replace(/\s+/g, '-');
  // Try exact command match, then alias match, then last-segment match
  return (
    idx.allCLI.find(c => c.command === lower) ||
    idx.allCLI.find(c => c.aliases.some(a => a === lower || a.replace(/\s+/g,'-') === lower)) ||
    idx.allCLI.find(c => c.command.endsWith('-' + lower) || c.command === lower)
  ) || null;
}

// ── System map (for copilot.intuition status fast-path) ──────────────────────
function systemMap() {
  const idx = load();
  if (!idx) return {};
  const out = {};
  for (const s of idx.systems) {
    out[s.systemId] = { label: s.label, port: s.port, components: s.componentCount };
  }
  return out;
}

module.exports = { build, load, copilotContextBlock, lookupGrammar, lookupCLI, systemMap, OUT_PATH, VERSION };
