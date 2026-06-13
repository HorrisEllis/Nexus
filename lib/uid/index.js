'use strict';
/**
 * lib/uid/index.js — NEXUS Structured UID Factory
 * UUID: nexus-uid-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Generates structured system identifiers:
 *
 *   [componentId]-v[version]-[12-char-instance]
 *   nexus-gu-v003-a1b2c3d4e5f6
 *   │          │    └── random instance (debug identifier, this specific event/hook/seam)
 *   │          └── version (3-digit, padded)
 *   └── component ID (8 chars, human-readable: what system at a glance)
 *
 * RULES:
 *   UUID = address ONLY. Never encode routing, permissions, or runtime behavior in the format.
 *   Registry (component-map.js) = semantics.
 *   Event bus = behavior.
 *   causedBy chain = history.
 *   These four never collapse into each other.
 *
 * §5.1  Everything has a UUID — uid() is the single factory.
 * §1.2  Unknown componentId logs a warning, returns a valid UUID anyway (never throws).
 *
 * BACKWARDS COMPATIBILITY:
 *   rawUid() — generates a plain randomUUID() for code that predates this system.
 *   All existing jaaDB.uid() calls continue to work unchanged.
 */

const crypto = require('crypto');
const { COMPONENT_MAP } = require('./component-map');

// ── rawUid — plain UUID for backwards compat ──────────────────────────────────
// Used by jaaDB, queue, and all existing modules that need a simple UUID.
// No component semantics attached — use uid(componentId) for new code.
function rawUid() {
  return crypto.randomUUID();
}

// ── uid(componentId, version) — structured component-scoped identifier ─────────
// Returns: 'nexus-gu-v003-a1b2c3d4e5f6'
// componentId: 8-char component prefix from COMPONENT_MAP
// version:     integer, default 1, padded to 3 digits
//
// §1.2: unknown componentId logs warning, still returns a valid identifier.
function uid(componentId, version = 1) {
  if (!componentId) {
    // No componentId — fall back to raw UUID (backwards compat)
    return rawUid();
  }

  if (!COMPONENT_MAP[componentId]) {
    process.stderr.write(
      `[uid] §1.2 warning: unknown componentId '${componentId}' — not in component-map. ` +
      `Proceeding with unregistered UID.\n`
    );
  }

  const instance = crypto.randomBytes(6).toString('hex'); // 12 hex chars
  const v        = String(Math.max(1, Math.floor(version))).padStart(3, '0');
  return `${componentId}-v${v}-${instance}`;
}

// ── parseUid(id) — fast decompose, NO registry lookup ─────────────────────────
// Works on both structured UIDs (nexus-gu-v003-a1b2c3d4e5f6)
// and raw UUIDs (550e8400-e29b-41d4-a716-446655440000).
// Never throws. Returns null fields if format doesn't match.
function parseUid(id) {
  if (!id || typeof id !== 'string') return { componentId: null, version: null, instance: null, structured: false, raw: id };

  // Structured UID: ends with -v[digits]-[12hex]
  const structured = id.match(/^(.+)-v(\d{3})-([0-9a-f]{12})$/);
  if (structured) {
    return {
      componentId: structured[1],
      version:     parseInt(structured[2], 10),
      instance:    structured[3],
      structured:  true,
      raw:         id,
    };
  }

  // Raw UUID (legacy)
  return {
    componentId: null,
    version:     null,
    instance:    null,
    structured:  false,
    raw:         id,
  };
}

// ── resolveUid(id) — enriched with component-map semantics ────────────────────
// Adds intent, context, parent, config to the parsed UID.
// Use for debug, trace output, causal chain enrichment.
// Never throws — meta is null if componentId not in registry.
function resolveUid(id) {
  const parsed = parseUid(id);
  const meta   = parsed.componentId ? (COMPONENT_MAP[parsed.componentId] || null) : null;
  return {
    id,
    ...parsed,
    meta: meta ? {
      name:      meta.name,
      intent:    meta.intent,
      context:   meta.context,
      parent:    meta.parent,
      immutable: meta.immutable,
    } : null,
  };
}

// ── componentUid(name) — look up a component's UUID by name ───────────────────
// Convenience: get the canonical componentId for a system by name.
// Returns null if not found.
function componentUid(name) {
  const entry = Object.values(COMPONENT_MAP).find(c => c.name === name);
  return entry ? entry.componentId : null;
}

// ── isStructured(id) — fast check without parse overhead ─────────────────────
function isStructured(id) {
  return /^.+-v\d{3}-[0-9a-f]{12}$/.test(id || '');
}

// ── register(componentId, parentId?) — runtime component registration ─────────
// Called by each system on boot to register itself as a child of its parent.
// Populates the children[] array in COMPONENT_MAP at runtime.
// Safe to call multiple times — idempotent.
function register(componentId, parentId) {
  if (!COMPONENT_MAP[componentId]) {
    process.stderr.write(`[uid] §1.2 register() — unknown componentId '${componentId}'\n`);
    return false;
  }
  const parent = parentId || COMPONENT_MAP[componentId].parent;
  if (parent && COMPONENT_MAP[parent]) {
    const children = COMPONENT_MAP[parent].children;
    if (!children.includes(componentId)) {
      children.push(componentId);
    }
  }
  return true;
}

// ── getChildren(componentId) — walk the component tree ───────────────────────
function getChildren(componentId, recursive = false) {
  const entry = COMPONENT_MAP[componentId];
  if (!entry) return [];
  if (!recursive) return [...entry.children];

  const all = [];
  const walk = (id) => {
    const node = COMPONENT_MAP[id];
    if (!node) return;
    for (const child of node.children) {
      all.push(child);
      walk(child);
    }
  };
  walk(componentId);
  return all;
}

// ── getAncestors(componentId) — walk up the parent chain ─────────────────────
function getAncestors(componentId) {
  const chain = [];
  let current = COMPONENT_MAP[componentId]?.parent;
  const seen  = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = COMPONENT_MAP[current]?.parent;
  }
  return chain; // nearest parent first, root last
}

module.exports = {
  uid,
  rawUid,
  parseUid,
  resolveUid,
  componentUid,
  isStructured,
  register,
  getChildren,
  getAncestors,
  COMPONENT_MAP, // re-export for convenience
};
