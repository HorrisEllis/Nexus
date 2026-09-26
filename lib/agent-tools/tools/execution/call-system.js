'use strict';
/**
 * lib/agent-tools/tools/call-system.js — P6 of the omniscience phasemap
 * UUID: nexus-agent-tools-call-system-v1-0000-2026-0730-001
 *
 * §PHASEMAP P6 — omnipotence completed: every REGISTERED system is reachable by
 * the loop through ONE tool. This is where the self-registration work pays off —
 * because systems register their capabilities, call_system can resolve a target
 * from the live registry instead of a hardcoded list (§8.4).
 *
 * §10.3 — it routes THROUGH the existing infrastructure, it does NOT become a
 * competing dispatch path: it resolves via lib/capability-registry (the same
 * projection RAID reads) and dispatches via lib/nexus-client (the same client
 * every system-to-system call uses). No new routing, no second source of truth.
 *
 * Two shapes, both through the registry:
 *   - by capability intent:  { intent: 'crystallised patterns' } → resolves the
 *     owning system + route from the registry, dispatches.
 *   - by explicit system+route: { system: 'cortex', method:'GET', path:'/api/gaps' }
 *     → dispatches directly via nexus-client (still the sanctioned client).
 */

const callSystemTool = {
  name: 'call_system',
  description: 'Call any registered NEXUS system. Give an `intent` (natural-language capability, resolved via the registry) OR an explicit `system` + `path`. Returns the system\'s response. Use to reach a capability you do not have a dedicated tool for.',
  parameters: {
    type: 'object',
    properties: {
      intent: { type: 'string', description: 'Natural-language capability to resolve via the registry, e.g. "crystallised patterns" or "open gaps".' },
      system: { type: 'string', description: 'Explicit system id (e.g. "cortex", "guardian", "loom") — alternative to intent.' },
      method: { type: 'string', description: 'HTTP method (default GET).' },
      path:   { type: 'string', description: 'Route path when using explicit system, e.g. "/api/gaps".' },
      body:   { type: 'object', description: 'Optional request body for POST/PUT.' },
    },
    required: [],
  },
  execute: async ({ intent, system, method, path, body }) => {
    let nexusClient, capabilityRegistry;
    try { nexusClient = require('../../../nexus-client'); }
    catch (e) { return { error: `nexus-client unavailable: ${e.message}` }; }

    // Path 1 — resolve a capability by intent through the registry (§8.4: the
    // live registry, not a hardcoded map). The self-register work populated it.
    if (intent && !system) {
      try { capabilityRegistry = require('../../../capability-registry'); }
      catch (e) { return { error: `capability-registry unavailable: ${e.message}` }; }
      const r = capabilityRegistry.resolve(intent);
      if (!r.found) return { error: r.message || `no capability matches "${intent}"` };
      const cap = r.capabilities[0];
      // namespace IS the owning system (self-register convention); route carries method+path
      const targetSystem = cap.namespace || (cap.name || '').split('.')[0];
      const route = cap.route || {};
      if (!targetSystem || !route.path) {
        return { error: `resolved capability "${cap.name}" has no dispatchable route`, resolved: cap };
      }
      try {
        const res = await nexusClient.call(targetSystem, route.method || 'GET', route.path, body, { timeout: 30000 });
        return { ok: true, resolvedTo: `${targetSystem} ${route.path}`, via: 'registry-intent', response: res };
      } catch (e) { return { error: `dispatch to ${targetSystem} failed: ${e.message}` }; }
    }

    // Path 2 — explicit system + path, still through the sanctioned client.
    if (system && path) {
      try {
        const res = await nexusClient.call(system, method || 'GET', path, body, { timeout: 30000 });
        return { ok: true, resolvedTo: `${system} ${path}`, via: 'explicit', response: res };
      } catch (e) { return { error: `dispatch to ${system} failed: ${e.message}` }; }
    }

    return { error: 'call_system needs either `intent` (resolved via registry) or `system` + `path`' };
  },
};

module.exports = callSystemTool;
