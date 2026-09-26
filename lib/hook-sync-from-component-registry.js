'use strict';
// ── architect/src/hooks/sync-from-component-registry.js ─────────────────────
// UUID: architect-hooks-sync-from-cr-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// §FIX-ROADMAP-62: "One Registry, Not Three — Decision Gate" resolved:
// lib/component-registry.js is canonical (runtime + CLI already depend on
// it). Architect's HookRegistry keeps its richer schema (friction scoring,
// schema contracts, wire graph) but stops being an independent source of
// truth — it becomes a thin sync projection of the canonical registry,
// per the decision's own framing: "the other becomes a thin sync/projection,
// not a second source of truth."
//
// This REPLACES the old hooks/*.hooks.js seeding in architect/service.js.
// Those files were maintained by hand, separately, and drifted immediately
// (Addendum #2 audit: hooks/idearium.hooks.js had 3 declared, 1 real
// componentId, 20+ real undeclared actions). Syncing from the canonical
// registry means there is nothing left to keep in hand-written sync with —
// the canonical registry already reflects what each system actually serves,
// because systems register their own real components on boot (CR-007).
//
// §I-1 / §I-2 (HookRegistry invariants — unique name, declared schema) are
// satisfied for every synced hook: name = component.id (already globally
// unique, namespace-prefixed), schema.input/output derived from the
// component's params/returns.

const http = require('http');

const ORCH_PORT = process.env.ORCH_PORT || 9000;
const SYNC_TAG   = 'synced-from-component-registry';

// ── Fetch canonical components from orchestrator ────────────────────────────
function _fetchComponents() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port: ORCH_PORT, path: '/api/components',
      method: 'GET', timeout: 4000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed.components) ? parsed.components : (Array.isArray(parsed) ? parsed : []));
        } catch (_) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ── Component → Hook descriptor projection ───────────────────────────────────
function _toHookDescriptor(component) {
  const schemaInput = (component.params || []).length
    ? { type: 'object', properties: Object.fromEntries((component.params || []).map(p => [p.name, { type: p.type }])) }
    : null;
  const schemaOutput = component.returns
    ? { type: component.returns.type || 'object' }
    : { type: 'object' };

  return {
    name:      component.id,                 // already namespace.action — globally unique
    intent:    component.description || '',
    version:   component.version || '1.0.0',
    type:      'api',                         // every component-registry entry is an HTTP route
    direction: 'bidirectional',               // request → response
    from:      { surface: component.namespace || 'system', layer: 0 },
    to:        { surface: 'architect', layer: 0 },
    config:    { route: component.route || null },
    schema:    { input: schemaInput, output: schemaOutput, errors: [] },
    contract: {
      axioms:      [],
      sideEffects: ['GET', 'HEAD'].includes(component.route?.method) ? [] : ['mutates-state'],
      idempotent:  ['GET', 'PUT', 'DELETE', 'HEAD'].includes(component.route?.method || ''),
      replayable:  false,
      snrGated:    false,
    },
    bindings: {
      route: component.route ? `${component.route.method} ${component.route.path}` : null,
    },
    causedBy: 'component-registry.sync',
    status:   component.available === false ? 'deprecated' : 'active',
    tags:     [SYNC_TAG, component.namespace].filter(Boolean),
    notes:    `Synced from lib/component-registry.js — canonical source. Do not hand-edit; edit the component in its owning system instead.`,
  };
}

// ── Sync — idempotent, safe to call repeatedly ───────────────────────────────
// Registers new components, updates drifted ones (description/version/route
// changes), leaves untouched ones alone. Never touches hand-authored,
// non-synced hooks (built-ins from _seedBuiltinHooks) — only manages hooks
// it tagged itself.
async function syncFromComponentRegistry(registry) {
  const components = await _fetchComponents();
  if (!components.length) return { ok: false, reason: 'no components fetched (orchestrator unreachable or registry empty)', synced: 0 };

  let created = 0, updated = 0, skipped = 0, failed = 0;

  for (const component of components) {
    const descriptor = _toHookDescriptor(component);
    const existing = registry.get(descriptor.name);

    if (!existing) {
      try { registry.register(descriptor); created++; }
      catch (e) { failed++; console.warn(`[architect/hooks-sync] register failed for ${descriptor.name}: ${e.message}`); }
      continue;
    }

    // Only manage hooks we created — never overwrite a hand-authored hook
    // that happens to share a name (shouldn't happen given the namespace
    // prefix, but §1.2 — don't silently clobber).
    if (!existing.meta?.tags?.includes(SYNC_TAG)) { skipped++; continue; }

    const driftedDescription = existing.intent !== descriptor.intent;
    const driftedRoute = JSON.stringify(existing.config?.route) !== JSON.stringify(descriptor.config.route);
    if (driftedDescription || driftedRoute) {
      try {
        registry.update(existing.uuid, {
          intent: descriptor.intent, config: descriptor.config,
          schema: descriptor.schema, causedBy: 'component-registry.sync',
        });
        updated++;
      } catch (e) { failed++; console.warn(`[architect/hooks-sync] update failed for ${descriptor.name}: ${e.message}`); }
    } else {
      skipped++;
    }
  }

  // Only log when the sync actually did something. A no-op tick (everything
  // unchanged) is residue, not an event — logging it every 30s on every
  // boot is noise, not signal. Result is still returned in full either way.
  if (created || updated || failed) {
    console.log(`[architect/hooks-sync] ${created} created, ${updated} updated, ${skipped} unchanged, ${failed} failed (${components.length} canonical components)`);
  }
  return { ok: true, created, updated, skipped, failed, total: components.length };
}

module.exports = { syncFromComponentRegistry, _toHookDescriptor, SYNC_TAG };
