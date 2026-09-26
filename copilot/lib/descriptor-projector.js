'use strict';
/**
 * lib/descriptor-projector.js — Phase 40 T1.5: Descriptor Projections
 * UUID: nexus-descriptor-projector-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * One descriptor → six projections, all zero-LLM:
 *   .comp    Component identity (already in registry)
 *   .cli     CLI command name + help text
 *   .grammar Grammar aliases for trie
 *   .ui      Button label + icon + tooltip
 *   .config  Default config shape
 *   .seam    SEAM dispatch shape
 *   .doc     Markdown stub
 *
 * Blueprint UUID namespace: bp_001.comp.* → bp_001.cli.* etc.
 * Called by component-registry on register() and by the compiler T1.5 gate.
 *
 * §CC-002: zero LLM in T0/T1/T1.5
 * §3.1: projections generated before any UI or docs
 */

const MODULE_ID = 'descriptor-projector';
const VERSION   = '1.0.0';

/**
 * project — derive all six projections from a component descriptor.
 *
 * @param {object} descriptor — component from registry (post Phase 40 seeding)
 * @returns {object} { comp, cli, grammar, ui, config, seam, doc }
 */
function project(descriptor) {
  const d = descriptor || {};
  const id          = d.id || 'unknown';
  const name        = d.name || id;
  const description = d.description || '';
  const grammar     = Array.isArray(d.grammar) ? d.grammar : [];
  const capabilities= Array.isArray(d.capabilities) ? d.capabilities : [];
  const tier        = d.tier || 'T1';
  const route       = d.route || null;
  const ns          = d.blueprint_ns || 'bp_000';

  // ── .comp — identity projection (passthrough + namespace) ─────────────────
  const comp = {
    proj_type:    'comp',
    bp_uuid:      `${ns}.comp.${id}`,
    componentId:  id,
    version:      d.version || '1.0.0',
    namespace:    d.namespace || 'unknown',
    name,
    tier,
    lifecycle:    d.lifecycle || 'versioned',
    earned_roles: d.earned_roles || [],
  };

  // ── .cli — CLI command projection ─────────────────────────────────────────
  // Primary CLI command: last segment of id, lowercased, hyphens
  const cliName = id.split('.').pop().replace(/_/g, '-').toLowerCase();
  const aliases  = grammar.slice(0, 3);  // first 3 grammar aliases become CLI shortcuts

  // Generate help text from capabilities if available
  const capHelp = capabilities.length
    ? capabilities.map(c => `  ${c.verb} ${c.noun || ''} — ${c.input || ''} → ${c.output || ''}`).join('\n')
    : `  ${description.slice(0, 100)}`;

  const cli = {
    proj_type:   'cli',
    bp_uuid:     `${ns}.cli.${id}`,
    command:     cliName,
    aliases,
    help:        `${name}\n${capHelp}`,
    route,
    componentId: id,
  };

  // ── .grammar — grammar trie projection ───────────────────────────────────
  // All grammar entries + natural language variants from capabilities
  const grammarEntries = new Set(grammar);
  for (const cap of capabilities) {
    if (cap.verb && cap.noun) {
      grammarEntries.add(`${cap.verb} ${cap.noun}`);
      grammarEntries.add(`${cap.noun}`);
    }
  }
  // Add name-based entries
  grammarEntries.add(name.toLowerCase());
  grammarEntries.add(cliName);

  const grammarProj = {
    proj_type:    'grammar',
    bp_uuid:      `${ns}.grammar.${id}`,
    componentId:  id,
    entries:      [...grammarEntries].slice(0, 20),
    route,
    confidence:   1.0,  // registry-defined aliases get max confidence
  };

  // ── .ui — UI button projection ────────────────────────────────────────────
  // Icon heuristic: pick from tier or comp_type
  const iconMap = {
    'T0': '⬡', 'T1': '◈', 'T2': '⬢', 'T3': '◉',
    'interface': '⊕', 'orchestrator': '⬡', 'memory': '◈',
    'design': '⬢', 'router': '→', 'knowledge': '◉',
  };
  const icon = iconMap[tier] || iconMap[d.comp_type] || '□';

  const ui = {
    proj_type:   'ui',
    bp_uuid:     `${ns}.ui.${id}`,
    componentId: id,
    label:       name.toUpperCase().slice(0, 16),
    icon,
    tooltip:     description.slice(0, 80),
    action:      route ? { method: 'GET', path: route } : null,
    tier,
  };

  // ── .config — default config shape ───────────────────────────────────────
  const config = {
    proj_type:    'config',
    bp_uuid:      `${ns}.config.${id}`,
    componentId:  id,
    defaults: {
      enabled:    true,
      tier:       d.resolution?.max_level || 'pattern',
      lifecycle:  d.lifecycle || 'versioned',
      pollMs:     null,
      timeout:    30000,
    },
    overrideable: true,
  };

  // ── .seam — SEAM dispatch shape ───────────────────────────────────────────
  const seam = {
    proj_type:    'seam',
    bp_uuid:      `${ns}.seam.${id}`,
    componentId:  id,
    chunk1: {
      system:     d.namespace || 'unknown',
      command:    cliName,
      provider:   d.namespace?.includes('guardian') ? 'guardian' : 'orchestrator',
    },
    chunk2: null,  // T2 fills implementation
    timeout_ms:   30000,
    hooks:        (d.events?.emits || []).map(e => ({ type: 'out', event: e })),
  };

  // ── .doc — Markdown stub ──────────────────────────────────────────────────
  const doc = {
    proj_type:   'doc',
    bp_uuid:     `${ns}.doc.${id}`,
    componentId: id,
    markdown: [
      `# ${name}`,
      ``,
      `**ID:** \`${id}\` · **Tier:** ${tier} · **Version:** ${d.version || '?'}`,
      ``,
      description,
      ``,
      capabilities.length ? `## Capabilities\n${capabilities.map(c =>
        `- **${c.verb}** ${c.noun || ''}: ${c.input || ''} → ${c.output || ''}`).join('\n')}` : '',
      ``,
      route ? `## API\n\`${route}\`` : '',
    ].filter(s => s !== undefined).join('\n').trim(),
  };

  return { comp, cli, grammar: grammarProj, ui, config, seam, doc };
}

/**
 * projectAll — project all registered components.
 * Returns a cli-map (for grammar/REPL) and ui-map (for Architect).
 */
function projectAll(components) {
  const projections = components.map(project);
  return {
    cliMap: projections.map(p => p.cli),
    grammarMap: projections.map(p => p.grammar),
    uiMap: projections.map(p => p.ui),
    seamMap: projections.map(p => p.seam),
    docMap: projections.map(p => p.doc),
    projections,
    generatedAt: Date.now(),
    version: VERSION,
  };
}

module.exports = { project, projectAll, MODULE_ID, VERSION };
