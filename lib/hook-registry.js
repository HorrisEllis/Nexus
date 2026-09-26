'use strict';
/**
 * architect/src/hooks/Registry.js
 * L2 — Hook Registry + Wire Engine
 * UUID: architect-hook-registry-v1-0000-4000
 *
 * The central nervous system. Every inter-surface communication
 * passes through a declared hook. No direct calls between surfaces.
 *
 * §A-2  Hooks are the wire.
 * §I-1  Every hook has a unique UUID and a unique name.
 * §I-2  Every hook has a declared schema.
 * §I-3  All inter-surface communication uses a declared hook.
 * §I-18 Hook Registry persisted to JAA on every write.
 * §I-19 Hook frictionScore updated after every execution and persisted.
 */

const { randomUUID } = require('crypto');

// ── 22 hook types (complete taxonomy from §3.2) ────────────────────────────
const HOOK_TYPES = new Set([
  'api','event-bus','callto','direct','stream','webserver',
  'blueprint','clip','macro','gate','lens','translate',
  'synthesize','reconstruct','compress','decompress','behavior',
  'snr','gap','tension','seam','ollama','raid'
]);

const HOOK_DIRECTIONS = new Set([
  'unidirectional','bidirectional','broadcast','sink'
]);

const HOOK_STATUSES = new Set(['active','deprecated','seed']);

class HookRegistry {
  constructor({ jaa, busEmit = null } = {}) {
    this._jaa    = jaa;
    this._emit   = busEmit || (() => {});
    // In-memory index: uuid → Hook, name → uuid
    this._hooks    = new Map();   // uuid → Hook
    this._byName   = new Map();   // name → uuid
    this._bindings = new Map();   // binding uuid → HookBinding
    this._loaded   = false;
  }

  // ── Init — replay from JAA ─────────────────────────────────────────────────
  init() {
    if (!this._jaa) return;
    try {
      const records = this._jaa.query('hooks', () => true, 2000);
      for (const r of records) {
        const h = r.data || r;
        if (h.uuid && h.name) {
          this._hooks.set(h.uuid, h);
          this._byName.set(h.name, h.uuid);
        }
      }
      const binds = this._jaa.query('hook_bindings', () => true, 2000);
      for (const r of binds) {
        const b = r.data || r;
        if (b.id && b.op !== 'remove') {
          this._bindings.set(b.id, b);
        } else if (b.op === 'remove') {
          this._bindings.delete(b.id);
        }
      }
      this._loaded = true;
      console.log(`[architect/hooks] replayed ${this._hooks.size} hooks, ${this._bindings.size} bindings`);
    } catch(e) {
      console.warn(`[architect/hooks] §1.2 replay failed: ${e.message}`);
    }
  }

  // ── register ───────────────────────────────────────────────────────────────
  register(descriptor) {
    // §I-1 unique name
    if (this._byName.has(descriptor.name)) {
      throw new Error(`§I-1 hook name already exists: ${descriptor.name}`);
    }
    // §I-2 schema required
    if (!descriptor.schema?.input && !descriptor.schema?.output) {
      throw new Error(`§I-2 hook must declare schema.input or schema.output`);
    }
    // type validation
    if (!HOOK_TYPES.has(descriptor.type)) {
      throw new Error(`invalid hook type: ${descriptor.type}. valid: ${[...HOOK_TYPES].join(', ')}`);
    }
    if (!HOOK_DIRECTIONS.has(descriptor.direction)) {
      throw new Error(`invalid hook direction: ${descriptor.direction}`);
    }
    // §I-4 no direct hooks crossing layers
    if (descriptor.type === 'direct') {
      const fromLayer = descriptor.from?.layer ?? -1;
      const toLayer   = descriptor.to?.layer   ?? -1;
      if (fromLayer !== toLayer && fromLayer !== -1 && toLayer !== -1) {
        throw new Error(`§I-4 direct hook cannot cross layers (from L${fromLayer} to L${toLayer})`);
      }
    }

    const uuid = randomUUID();
    const now  = Date.now();
    const hook = {
      uuid,
      id:        uuid,
      name:      descriptor.name,
      intent:    descriptor.intent || '',
      version:   descriptor.version || '1.0.0',
      type:      descriptor.type,
      direction: descriptor.direction,
      from:      descriptor.from  || { surface: '*', layer: 0 },
      to:        descriptor.to    || { surface: '*', layer: 0 },
      config:    descriptor.config || {},
      schema:    {
        input:  descriptor.schema?.input  || null,
        output: descriptor.schema?.output || null,
        errors: descriptor.schema?.errors || [],
      },
      contract: {
        axioms:      descriptor.contract?.axioms      || [],
        sideEffects: descriptor.contract?.sideEffects || [],
        idempotent:  descriptor.contract?.idempotent  ?? false,
        replayable:  descriptor.contract?.replayable  ?? false,
        snrGated:    descriptor.contract?.snrGated    ?? false,
        timeout:     descriptor.contract?.timeout     || null,
        retryPolicy: descriptor.contract?.retryPolicy || null,
      },
      frictionScore: { latency: 0, failureRate: 0, semanticDistance: 0 },
      routerPolicy: descriptor.routerPolicy || {
        blockIfFrictionGt: 0.85,
        requiresApproval:  false,
        allowedSources:    ['*'],
        executionMode:     'async',
      },
      bindings: {
        cli:    `architect hook ${descriptor.name}`,
        event:  `architect.hook.${descriptor.name.replace(/-/g,'.')}`,
        ...(descriptor.bindings || {}),
      },
      meta: {
        causedBy:  descriptor.causedBy || 'registry.register',
        createdAt: now,
        updatedAt: now,
        status:    descriptor.status || 'active',
        tags:      descriptor.tags   || [],
        notes:     descriptor.notes  || '',
      },
    };

    this._hooks.set(uuid, hook);
    this._byName.set(hook.name, uuid);

    // §I-18 persist to JAA
    this._persist('hooks', { op:'create', data: hook, causedBy: hook.meta.causedBy, ts: now });
    this._emit('architect.hook.registered', { uuid, name: hook.name, type: hook.type });
    return hook;
  }

  // ── get ────────────────────────────────────────────────────────────────────
  get(idOrName) {
    if (this._hooks.has(idOrName)) return this._hooks.get(idOrName);
    const uuid = this._byName.get(idOrName);
    return uuid ? this._hooks.get(uuid) : null;
  }

  // ── list ───────────────────────────────────────────────────────────────────
  list(filter = {}) {
    let hooks = [...this._hooks.values()];
    if (filter.type)      hooks = hooks.filter(h => Array.isArray(filter.type) ? filter.type.includes(h.type) : h.type === filter.type);
    if (filter.direction) hooks = hooks.filter(h => h.direction === filter.direction);
    if (filter.surface)   hooks = hooks.filter(h => h.from?.surface === filter.surface || h.to?.surface === filter.surface);
    if (filter.status)    hooks = hooks.filter(h => h.meta?.status === filter.status);
    if (filter.tags?.length) hooks = hooks.filter(h => filter.tags.every(t => h.meta?.tags?.includes(t)));
    if (filter.layer !== undefined) hooks = hooks.filter(h => h.from?.layer === filter.layer || h.to?.layer === filter.layer);
    return hooks;
  }

  // ── update ─────────────────────────────────────────────────────────────────
  update(id, patch) {
    const hook = this.get(id);
    if (!hook) throw new Error(`hook not found: ${id}`);
    // id, name, type, from, to are immutable after registration
    const IMMUTABLE = ['uuid','id','name','type','from','to'];
    for (const k of IMMUTABLE) { if (k in patch) throw new Error(`§I-1 field '${k}' is immutable`); }
    const now = Date.now();
    Object.assign(hook, patch);
    hook.meta.updatedAt = now;
    this._hooks.set(hook.uuid, hook);
    this._persist('hooks', { op:'update', data: hook, causedBy: patch.causedBy || 'registry.update', ts: now });
    this._emit('architect.hook.updated', { uuid: hook.uuid, name: hook.name });
    return hook;
  }

  // ── deprecate ──────────────────────────────────────────────────────────────
  deprecate(id, reason, causedBy) {
    const hook = this.get(id);
    if (!hook) throw new Error(`hook not found: ${id}`);
    const now = Date.now();
    hook.meta.status        = 'deprecated';
    hook.meta.deprecatedAt  = now;
    hook.meta.deprecationReason = reason;
    hook.meta.updatedAt     = now;
    this._hooks.set(hook.uuid, hook);
    this._persist('hooks', { op:'deprecate', data: hook, causedBy, ts: now });
    this._emit('architect.hook.deprecated', { uuid: hook.uuid, name: hook.name, reason });
  }

  // ── remove ─────────────────────────────────────────────────────────────────
  remove(id) {
    const hook = this.get(id);
    if (!hook) throw new Error(`hook not found: ${id}`);
    // §A-2 hard remove only if zero active bindings
    const active = [...this._bindings.values()].filter(b => b.fromId === hook.uuid || b.toId === hook.uuid);
    if (active.length) throw new Error(`§A-2 cannot remove hook with ${active.length} active binding(s)`);
    this._hooks.delete(hook.uuid);
    this._byName.delete(hook.name);
    this._persist('hooks', { op:'remove', data: { uuid: hook.uuid, name: hook.name }, causedBy: 'registry.remove', ts: Date.now() });
    this._emit('architect.hook.removed', { uuid: hook.uuid, name: hook.name });
  }

  // ── wire ───────────────────────────────────────────────────────────────────
  wire(fromId, toId, opts = {}) {
    const from = this.get(fromId);
    const to   = this.get(toId);
    if (!from) throw new Error(`wire: from hook not found: ${fromId}`);
    if (!to)   throw new Error(`wire: to hook not found: ${toId}`);
    // Schema compatibility check (basic — output of from must satisfy input of to)
    // Full JSON Schema validation deferred to Phase 4 schema builder
    const id  = randomUUID();
    const now = Date.now();
    const binding = {
      id, fromId: from.uuid, toId: to.uuid, op: 'create',
      causedBy: opts.causedBy || 'registry.wire',
      meta: { causedBy: opts.causedBy || 'registry.wire', notes: opts.notes || '' },
      createdAt: now,
    };
    this._bindings.set(id, binding);
    this._persist('hook_bindings', { ...binding, ts: now });
    this._emit('architect.hook.wired', { bindingId: id, fromId: from.uuid, toId: to.uuid });
    return binding;
  }

  // ── unwire ─────────────────────────────────────────────────────────────────
  unwire(bindingId) {
    if (!this._bindings.has(bindingId)) throw new Error(`binding not found: ${bindingId}`);
    const b = this._bindings.get(bindingId);
    this._bindings.delete(bindingId);
    const now = Date.now();
    this._persist('hook_bindings', { ...b, op:'remove', ts: now });
    this._emit('architect.hook.unwired', { bindingId });
  }

  // ── validate ───────────────────────────────────────────────────────────────
  validate() {
    const errors = [], warnings = [];
    // §I-1 unique names
    const names = new Set();
    for (const hook of this._hooks.values()) {
      if (names.has(hook.name)) errors.push(`§I-1 duplicate name: ${hook.name}`);
      names.add(hook.name);
      // §I-2 schema
      if (!hook.schema?.input && !hook.schema?.output) {
        errors.push(`§I-2 no schema on hook: ${hook.name}`);
      }
      // §I-4 direct cross-layer
      if (hook.type === 'direct') {
        const fl = hook.from?.layer ?? -1, tl = hook.to?.layer ?? -1;
        if (fl !== tl && fl !== -1 && tl !== -1) {
          errors.push(`§I-4 direct hook crosses layers: ${hook.name} (L${fl}→L${tl})`);
        }
      }
      // §I-16 macro not in kernel ring
      if (hook.type === 'macro' && hook.config?.inKernelRing) {
        errors.push(`§I-16 macro hook cannot be ingested into kernel ring: ${hook.name}`);
      }
    }
    // Dangling bindings
    for (const b of this._bindings.values()) {
      if (!this._hooks.has(b.fromId)) warnings.push(`dangling binding from: ${b.fromId}`);
      if (!this._hooks.has(b.toId))   warnings.push(`dangling binding to: ${b.toId}`);
    }
    return { ok: errors.length === 0, errors, warnings, hookCount: this._hooks.size, bindingCount: this._bindings.size };
  }

  // ── graph ──────────────────────────────────────────────────────────────────
  graph(format = 'json') {
    const nodes = [...this._hooks.values()].map(h => ({
      id: h.uuid, name: h.name, type: h.type, layer: h.from?.layer, status: h.meta?.status,
    }));
    const edges = [...this._bindings.values()].map(b => ({ from: b.fromId, to: b.toId, id: b.id }));
    if (format === 'json') return { nodes, edges };
    if (format === 'mermaid') {
      const lines = ['graph LR'];
      for (const b of [...this._bindings.values()]) {
        const fn = this._hooks.get(b.fromId)?.name || b.fromId.slice(0,8);
        const tn = this._hooks.get(b.toId)?.name   || b.toId.slice(0,8);
        lines.push(`  ${fn.replace(/-/g,'_')} --> ${tn.replace(/-/g,'_')}`);
      }
      return lines.join('\n');
    }
    return { nodes, edges };
  }

  // ── friction score update (§I-19) ──────────────────────────────────────────
  recordExecution(hookId, { latencyMs, failed }) {
    const hook = this.get(hookId);
    if (!hook) return;
    const ALPHA = 0.1; // EMA smoothing
    const latencyNorm = Math.min(1, latencyMs / 5000);
    hook.frictionScore.latency      = hook.frictionScore.latency * (1-ALPHA) + latencyNorm * ALPHA;
    hook.frictionScore.failureRate  = hook.frictionScore.failureRate * (1-ALPHA) + (failed ? 1 : 0) * ALPHA;
    hook.meta.updatedAt = Date.now();
    this._hooks.set(hook.uuid, hook);
    this._persist('hooks', { op:'update', data: hook, causedBy: 'execution.record', ts: Date.now() });
  }

  // ── summary (for UI) ───────────────────────────────────────────────────────
  summary() {
    const byType = {};
    for (const h of this._hooks.values()) {
      byType[h.type] = (byType[h.type] || 0) + 1;
    }
    return {
      total:    this._hooks.size,
      bindings: this._bindings.size,
      byType,
      byStatus: {
        active:     this.list({ status:'active'     }).length,
        deprecated: this.list({ status:'deprecated' }).length,
        seed:       this.list({ status:'seed'       }).length,
      },
    };
  }

  // ── JAA persistence ────────────────────────────────────────────────────────
  _persist(table, record) {
    if (!this._jaa) return;
    try { this._jaa.insert(table, record); }
    catch(e) { console.error(`[architect/hooks] §1.2 JAA persist failed: ${e.message}`); }
  }
}

module.exports = { HookRegistry, HOOK_TYPES, HOOK_DIRECTIONS };
