'use strict';
/**
 * lib/capability-registry.js — Co-pilot's emergent tool surface
 * UUID: nexus-lib-capability-registry-v1-0000-2026-0720-001
 * Version: 1.0.0
 *
 * copilot-expansion.spec phase 3, specced and never built until now
 * ("it should have been already built" — James, 2026-07-20, correctly).
 *
 * THE POINT: Co-pilot's tools were a STATIC array in
 * clear-glass/src/copilot/tools.js — a frozen list that could never see
 * anything the system built after it was written. But NEXUS builds its own
 * capabilities at runtime: copilot/module-builder.js (phase 4, already
 * complete) registers new components into lib/component-registry.js live.
 * Those new capabilities were invisible to Co-pilot — it could BUILD a tool
 * and then not know it had it.
 *
 * This closes that loop. Capabilities are not a list to maintain; they are a
 * LIVE QUERY over component-registry (JAA/Cortex-backed — §the correct method
 * James asked about: anything dynamic goes through Cortex, no second store).
 * When module-builder registers a component, it appears here on the next read.
 * Emergent by construction, not by maintenance.
 *
 * A component ALREADY carries everything a capability needs — no augmentation
 * table, no parallel schema (that would be a §10.1 second authority):
 *   description  → what it does
 *   grammar      → when to use it (the natural-language trigger phrases)
 *   params       → how to call it
 *   examples     → worked usage
 *   namespace    → its category
 *   available / deprecated → whether Co-pilot should be offered it at all
 *
 * Two kinds of capability, merged:
 *   1. EMERGENT — live components from the registry (grow at runtime)
 *   2. FIXED    — the browser/session primitives that are NOT components
 *      (navigate, click, screenshot, dom.query…). These live in clear-glass
 *      and have no registry row; they're passed in so the prompt is complete.
 *
 * §14.2 — projection is pure: same registry state in, same prompt out.
 */

const MODULE_ID = 'lib/capability-registry';
const VERSION = '1.0.0';

let _componentRegistry = null;

function init(componentRegistry) {
  _componentRegistry = componentRegistry;
  return { ok: true };
}

// ── Pure projection: a component row → a capability descriptor ────────────────
function _project(component) {
  return {
    name: component.id,
    namespace: component.namespace,
    description: component.description || '',
    when: component.grammar || [],           // natural-language triggers = "when to use"
    params: (component.params || []).map(p => ({
      name: p.name, type: p.type, required: !!p.required,
      ...(p.values ? { values: p.values } : {}),
    })),
    examples: component.examples || [],
    route: component.route || null,
    returns: component.returns || null,
    source: 'emergent',
  };
}

// ── The live capability set ───────────────────────────────────────────────────
// Only available, non-deprecated components — Co-pilot must never be offered a
// tool that's been retired (that's how you get it calling dead routes).
function capabilities(filter = {}) {
  if (!_componentRegistry) return [];
  const rows = _componentRegistry.list({ available: true, deprecated: false, ...filter });
  return rows.map(_project);
}

// ── buildToolsPrompt — drop-in replacement for tools.js's static version ──────
// Takes the fixed (non-component) browser tools as input and merges them with
// the emergent set, so the prompt Co-pilot sees is complete AND live.
// `fixedTools` is clear-glass tools.js's TOOLS array (name, cat, desc, params).
function buildToolsPrompt(fixedTools = []) {
  const emergent = capabilities();

  let out = '## Available Tools\n';
  out += 'Issue tool calls as ```driver JSON blocks. Multiple calls allowed per response.\n\n';
  out += '```driver\n{ "action": "navigate", "url": "https://example.com" }\n```\n\n';
  out += '```driver\n{ "action": "guardian.dispatch", "provider": "claude", "prompt": "Write a test" }\n```\n\n';

  // Fixed browser/session tools first — grouped by their cat, same as before
  const byCat = {};
  for (const t of fixedTools) { (byCat[t.cat] = byCat[t.cat] || []).push(t); }
  for (const [cat, tools] of Object.entries(byCat)) {
    out += `### ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
    for (const t of tools) {
      const params = Object.entries(t.params || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      out += `- **${t.name}** — ${t.desc}${params ? ` (${params})` : ''}\n`;
    }
    out += '\n';
  }

  // Emergent capabilities — grouped by namespace, the registry's own category axis
  const byNs = {};
  for (const c of emergent) { (byNs[c.namespace] = byNs[c.namespace] || []).push(c); }
  const nsNames = Object.keys(byNs).sort();
  if (nsNames.length) {
    out += '## System Capabilities (live registry — grows as NEXUS builds itself)\n\n';
    for (const ns of nsNames) {
      out += `### ${ns}\n`;
      for (const c of byNs[ns]) {
        const params = c.params.map(p => `${p.name}${p.required ? '' : '?'}: ${p.type}`).join(', ');
        out += `- **${c.name}** — ${c.description}${params ? ` (${params})` : ''}`;
        if (c.when.length) out += `\n  _use when:_ ${c.when.slice(0, 3).join(' · ')}`;
        out += '\n';
      }
      out += '\n';
    }
  }
  return out;
}

// ── Resolve — "can you X?" → the capability, or an honest miss ────────────────
// The spec's canonical flow: user asks, co-pilot checks the registry, routes
// or says what's missing. Matches against id, description, grammar, tags via
// the registry's own `q` filter (one authority for search, not a reimpl).
function resolve(query) {
  if (!_componentRegistry || !query) return { found: false, query };
  const hits = _componentRegistry.list({ available: true, deprecated: false, q: query });
  if (!hits.length) return { found: false, query, message: `no capability matches "${query}" — it may need to be built` };
  return { found: true, query, capabilities: hits.map(_project) };
}

function health() {
  return {
    ok: true, module: MODULE_ID, version: VERSION,
    registryConnected: !!_componentRegistry,
    liveCapabilities: _componentRegistry ? capabilities().length : 0,
  };
}

module.exports = { MODULE_ID, VERSION, init, capabilities, buildToolsPrompt, resolve, health, _project };
