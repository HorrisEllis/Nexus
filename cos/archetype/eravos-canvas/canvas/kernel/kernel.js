/* ============================================================
 * ERAVOS KERNEL 3.2
 * conforms_to: ERAVOS.kernel.spec 1.0.0 (+ amendment 3.2: domain packs)
 *
 * The kernel never learns what any domain is. It knows organisms,
 * hooks, wires, ports, the bus, the ledger, faults, permissions,
 * mutations and assets. Everything a domain needs (port kinds,
 * wire types, asset decoders, permissions, services) is installed
 * by that domain through the extension slots below.
 *
 * Kernel.use(domain) registers a domain pack { id, version, install(K, opts) }.
 * Kernel.create(opts) builds an independent universe with every
 * registered domain (or opts.domains: [ids]; [] = bare kernel).
 * window.Kernel is the default universe.
 * ============================================================ */
(function (global) {
  'use strict';

  const KERNEL_VERSION = '3.2.0';
  const domainPacks = [];            // registered via Kernel.use (load order)
  const defaultUniverses = new Set(); // universes that take every registered domain

  // ---------------------------------------------------------- faults (Layer 14 + amendment)
  const FAULTS = {
    MOUNT_001: 'dependency_not_found', MOUNT_002: 'capability_not_satisfied', MOUNT_003: 'permission_denied',
    MOUNT_004: 'schema_version_mismatch', MOUNT_005: 'manifest_invalid', MOUNT_006: 'duplicate_organism_id',
    MOUNT_007: 'constraint_violated_on_mount',
    WIRE_001: 'contract_mismatch', WIRE_002: 'hook_not_found', WIRE_003: 'direction_incompatible',
    WIRE_004: 'duplicate_wire', WIRE_005: 'wire_type_unsupported', WIRE_006: 'signal_cycle',
    RUNTIME_001: 'permission_violation', RUNTIME_002: 'payload_schema_invalid', RUNTIME_003: 'handler_error',
    RUNTIME_004: 'timeout', RUNTIME_005: 'rate_limit_exceeded',
    MUTATION_001: 'target_not_found', MUTATION_002: 'operation_not_supported', MUTATION_003: 'constraint_violated',
    MUTATION_004: 'rollback_failed', DOMAIN_001: 'domain_not_installed', DOMAIN_002: 'extension_conflict',
    ASSET_001: 'import_failed', ASSET_002: 'decode_failed', ASSET_003: 'hash_mismatch', ASSET_004: 'mime_unsupported',
    CONSTRAINT_001: 'predicate_failed', CONSTRAINT_002: 'blocking_constraint_violated',
    PORT_001: 'port_not_found', PORT_002: 'port_kind_invalid', PORT_003: 'duplicate_port',
  };

  // ---------------------------------------------------------- semver (F-16)
  function semverParse(v) { return String(v || '0.0.0').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0); }
  function semverCompare(a, b) {
    const A = semverParse(a), B = semverParse(b);
    for (let i = 0; i < 3; i++) { if (A[i] !== B[i]) return A[i] > B[i] ? 1 : -1; }
    return 0;
  }
  const semver = { parse: semverParse, compare: semverCompare, gt: (a, b) => semverCompare(a, b) > 0, gte: (a, b) => semverCompare(a, b) >= 0 };

  // ---------------------------------------------------------- contract (Layer 16 enforcement)
  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
    return typeof v;
  }
  function typeMatches(want, v) {
    const t = typeOf(v);
    if (Array.isArray(want)) return want.some(w => typeMatches(w, v));
    if (want === 'number') return t === 'number' || t === 'integer';
    if (want === 'integer') return t === 'integer';
    if (want === 'object') return t === 'object';
    if (want === 'any') return true;
    return t === want;
  }
  function validate(schema, payload, path) {
    const errors = [];
    path = path || '$';
    if (!schema) return errors;
    if (schema.type && !typeMatches(schema.type, payload)) {
      errors.push(`${path}: expected ${schema.type}, got ${typeOf(payload)}`);
      return errors;
    }
    if (schema.enum && !schema.enum.some(e => e === payload)) errors.push(`${path}: ${JSON.stringify(payload)} not in enum`);
    if (typeof payload === 'number') {
      if (!Number.isFinite(payload)) errors.push(`${path}: not finite`);
      if (schema.minimum !== undefined && payload < schema.minimum) errors.push(`${path}: ${payload} < minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && payload > schema.maximum) errors.push(`${path}: ${payload} > maximum ${schema.maximum}`);
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      (schema.required || []).forEach(k => { if (payload[k] === undefined) errors.push(`${path}.${k}: required`); });
      const props = schema.properties || {};
      Object.keys(props).forEach(k => { if (payload[k] !== undefined) errors.push(...validate(props[k], payload[k], `${path}.${k}`)); });
    }
    if (Array.isArray(payload) && schema.items) payload.forEach((it, i) => errors.push(...validate(schema.items, it, `${path}[${i}]`)));
    return errors;
  }
  const contract = { validate: (schema, payload) => validate(schema, payload) };

  // ---------------------------------------------------------- universe factory
  function create(opts) {
    opts = opts || {};
    const K = { version: KERNEL_VERSION, FAULTS, semver, contract, id: 'k' + Math.random().toString(36).slice(2, 8) };

    // -------------------------------------------------------- causal ledger (Layer 13)
    const ledgerEntries = [];
    let ledgerSeq = 0;
    const ledger = {
      write(type, fields) {
        const e = Object.freeze(Object.assign({ seq: ++ledgerSeq, type, timestamp: new Date().toISOString(), t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) }, fields || {}));
        ledgerEntries.push(e);
        return e;
      },
      entries(filter) {
        if (!filter) return ledgerEntries.slice();
        return ledgerEntries.filter(e => Object.keys(filter).every(k => e[k] === filter[k]));
      },
      get length() { return ledgerEntries.length; },
      snapshot() { return JSON.stringify(ledgerEntries); },
    };
    K.ledger = ledger;

    // -------------------------------------------------------- bus
    const subs = new Map();        // exact topic → Set(entry)
    const wildcard = new Set();    // entries with prefix*
    let busDepth = 0;
    const taps = new Set();
    const bus = {
      subscribe(topic, fn, owner) {
        const entry = { topic, fn, owner: owner || null };
        if (topic.endsWith('*')) { entry.prefix = topic.slice(0, -1); wildcard.add(entry); }
        else { if (!subs.has(topic)) subs.set(topic, new Set()); subs.get(topic).add(entry); }
        return function unsubscribe() {
          if (entry.prefix !== undefined) wildcard.delete(entry);
          else { const s = subs.get(topic); if (s) { s.delete(entry); if (!s.size) subs.delete(topic); } }
        };
      },
      // pre-delivery observers (P11.1 undo): see every publish before any subscriber acts on it; errors isolated
      tap(fn) { taps.add(fn); return () => taps.delete(fn); },
      publish(topic, payload) {
        if (busDepth > 64) { fault('RUNTIME_005', { message: `bus recursion depth exceeded on ${topic}` }); return 0; }
        busDepth++;
        let n = 0;
        if (taps.size) for (const t of Array.from(taps)) { try { t(topic, payload); } catch (err) { console.error('[ERAVOS] bus tap failed', err); } }
        try {
          const s = subs.get(topic);
          if (s) for (const e of Array.from(s)) { n++; deliver(e, topic, payload); }
          if (wildcard.size) for (const e of Array.from(wildcard)) if (topic.startsWith(e.prefix)) { n++; deliver(e, topic, payload); }
        } finally { busDepth--; }
        return n;
      },
      subscriberCount(owner) {
        let n = 0;
        subs.forEach(s => s.forEach(e => { if (owner === undefined || e.owner === owner) n++; }));
        wildcard.forEach(e => { if (owner === undefined || e.owner === owner) n++; });
        return n;
      },
      topics() { return Array.from(subs.keys()); },
    };
    function deliver(e, topic, payload) {
      try { e.fn(payload, topic); }
      catch (err) {
        if (topic === 'kernel:fault') { console.error('[ERAVOS] fault handler failed', err); return; }
        fault('RUNTIME_003', { organism_id: e.owner, message: `handler for ${topic} threw: ${err && err.message}`, error: err });
      }
    }
    K.bus = bus;

    // -------------------------------------------------------- faults (K-2: loud, named, traceable)
    const faultList = [];
    function fault(faultClass, info) {
      info = info || {};
      const f = {
        fault_class: faultClass, name: FAULTS[faultClass] || 'unknown_fault',
        organism_id: info.organism_id || null, instance_id: info.instance_id || null, hook_id: info.hook_id || null,
        message: info.message || '', timestamp: new Date().toISOString(),
      };
      if (info.quiet) f.quiet = true; // P11.2: the caller already told the person in plain words — log it, don't announce it twice
      faultList.push(f);
      ledger.write('fault_raised', { fault_class: faultClass, organism_id: f.organism_id, hook_id: f.hook_id, message: f.message, instance_id: f.instance_id });
      if (!opts.quiet) console.warn(`[ERAVOS ${faultClass} ${f.name}] ${f.organism_id || ''} ${f.message}`, info.error || '');
      try { bus.publish('kernel:fault', f); } catch (_) { /* never recurse */ }
      if (f.instance_id) try { bus.publish('org:error:' + f.instance_id, { fault_class: faultClass, message: f.message }); } catch (_) {}
      return f;
    }
    K.fault = fault;
    // 3.28: ONE way to stop. Every tool hears it (ctx.onSilence). hard = everything quiet now, tails included (the
    // "Stop all" button / a tool's ■); soft = a stop: latches and endless loops end, natural tails ring out.
    K.silence = function (o) {
      o = o || {};
      const p = { hard: o.hard !== false, instanceId: o.instanceId || null, reason: o.reason || 'user', time: typeof o.time === 'number' ? o.time : null };
      bus.publish('kernel:silence', p); return p;
    };
    K.faults = { list: (cls) => faultList.filter(f => !cls || f.fault_class === cls), clear: () => { faultList.length = 0; }, taxonomy: FAULTS };

    // -------------------------------------------------------- organism registry (K-1)
    const registry = new Map();     // instanceId → record
    const capabilities = new Map(); // capability → Set(instanceId | 'kernel')
    function addCap(cap, who) { if (!capabilities.has(cap)) capabilities.set(cap, new Set()); capabilities.get(cap).add(who); }
    function delCap(cap, who) { const s = capabilities.get(cap); if (s) { s.delete(who); if (!s.size) capabilities.delete(cap); } }

    K.registry = {
      register(instanceId, descriptor, extra) {
        if (!instanceId || !descriptor || !descriptor.id) {
          return { ok: false, fault: fault('MOUNT_005', { message: 'register requires instanceId + descriptor.id' }) };
        }
        if (registry.has(instanceId)) return { ok: false, fault: fault('MOUNT_006', { organism_id: descriptor.id, message: `instance ${instanceId} already registered` }) };
        if (descriptor.kernel_target && semver.gt(descriptor.kernel_target, KERNEL_VERSION)) {
          return { ok: false, fault: fault('MOUNT_004', { organism_id: descriptor.id, message: `needs kernel ${descriptor.kernel_target}, running ${KERNEL_VERSION}` }) };
        }
        if (descriptor.domain && !domains.has(descriptor.domain)) return { ok: false, fault: fault('DOMAIN_001', { organism_id: descriptor.id, message: `domain ${descriptor.domain} is not installed in this universe` }) };
        const missing = (descriptor.requires || []).filter(c => !capabilities.has(c));
        if (missing.length) return { ok: false, fault: fault('MOUNT_002', { organism_id: descriptor.id, message: `missing ${missing.join(', ')}` }) };
        const deps = (descriptor.dependencies || []).filter(d => !Array.from(registry.values()).some(r => r.organism_id === d));
        if (deps.length) return { ok: false, fault: fault('MOUNT_001', { organism_id: descriptor.id, message: `dependencies not mounted: ${deps.join(', ')}` }) };
        // permissions (K-8): requested ⊆ granted
        const granted = new Set(K.permissions.granted());
        const denied = (descriptor.permissions || []).filter(p => !granted.has(p));
        if (denied.length) {
          denied.forEach(p => ledger.write('permission_denied', { organism_id: descriptor.id, permission: p }));
          return { ok: false, fault: fault('MOUNT_003', { organism_id: descriptor.id, message: `permissions not granted: ${denied.join(', ')}` }) };
        }
        // constraints
        for (const c of (descriptor.constraints || [])) {
          let okc = true;
          try { okc = typeof c.check === 'function' ? !!c.check(K) : true; } catch (e) { okc = false; }
          if (!okc) {
            const f = fault(c.failure_mode || 'CONSTRAINT_001', { organism_id: descriptor.id, message: `constraint ${c.constraint_id}: ${c.predicate}` });
            if (c.blocking) return { ok: false, fault: fault('MOUNT_007', { organism_id: descriptor.id, message: f.message }) };
          }
        }
        const hooks = new Map();
        (descriptor.hooks || []).forEach(h => hooks.set(h.hook_id, h));
        const rec = {
          instance_id: instanceId, organism_id: descriptor.id, descriptor, hooks,
          permissions: new Set(descriptor.permissions || []), mounted_at: Date.now(), extra: extra || {},
        };
        ledger.write('organism_mounted', { instance_id: instanceId, organism_id: descriptor.id, position: (extra && extra.position) || null });
        registry.set(instanceId, rec);
        (descriptor.provides || []).forEach(c => addCap(c, instanceId));
        bus.publish('kernel:organism-mounted', { instanceId, organismId: descriptor.id });
        return { ok: true, record: rec };
      },
      unregister(instanceId, reason) {
        const rec = registry.get(instanceId);
        if (!rec) return false;
        ledger.write('organism_unmounted', { instance_id: instanceId, organism_id: rec.organism_id, reason: reason || 'unmount' });
        // K-12: wires first, then ports, then mutations rollback
        K.wires.list().filter(w => w.src.instanceId === instanceId || w.dst.instanceId === instanceId)
          .forEach(w => K.wires.remove(w.wire_id, 'organism_unmounted'));
        K.ports.removeAll(instanceId);
        paramReaders.delete(instanceId);
        K.mutations.rollbackFor(instanceId);
        registry.delete(instanceId);
        (rec.descriptor.provides || []).forEach(c => delCap(c, instanceId));
        bus.publish('kernel:organism-unmounted', { instanceId, organismId: rec.organism_id, reason: reason || 'unmount' });
        return true;
      },
      get: (id) => registry.get(id) || null,
      has: (id) => registry.has(id),
      list: () => Array.from(registry.values()),
      byOrganism: (orgId) => Array.from(registry.values()).filter(r => r.organism_id === orgId),
      hook(instanceId, hookId) { const r = registry.get(instanceId); return r ? (r.hooks.get(hookId) || null) : null; },
      hasCapability: (c) => capabilities.has(c),
      providers: (c) => Array.from(capabilities.get(c) || []),
      provideKernelCapability: (c) => addCap(c, 'kernel'),
      // K-3: an organism never reads another organism's state directly. The runtime binds one reader per
      // instance; other organisms ask the kernel, which checks registry_read.
      bindParamReader(instanceId, fn) {
        if (!registry.has(instanceId) || paramReaders.has(instanceId)) { fault('MUTATION_003', { instance_id: instanceId, message: 'param reader already bound or instance unknown' }); return false; }
        paramReaders.set(instanceId, fn); return true;
      },
      readParam(readerId, targetId, key) {
        if (readerId !== 'kernel' && !K.permissions.enforce(readerId, 'registry_read', `read ${targetId}.${key}`)) return undefined;
        const fn = paramReaders.get(targetId);
        if (!fn) { fault('MUTATION_001', { instance_id: readerId, message: `readParam: ${targetId} not found` }); return undefined; }
        const v = fn(key);
        return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
      },
    };
    const paramReaders = new Map();

    // -------------------------------------------------------- permissions (K-8)
    const CORE_PERMS = ['bus_publish', 'bus_subscribe', 'filesystem_read', 'filesystem_write', 'network', 'network_fetch', 'canvas_write',
      'registry_read', 'registry_write', 'ledger_read', 'worker_spawn', 'peer_connect', 'serial_access'];
    const knownPerms = new Set(CORE_PERMS);
    let grantedPerms = new Set(opts.permissions || CORE_PERMS);
    K.permissions = {
      // domains declare their permissions; granted by default unless the universe was given an explicit grant list
      declare(list) { (list || []).forEach(p => { knownPerms.add(p); if (!opts.permissions) grantedPerms.add(p); }); },
      known: () => Array.from(knownPerms),
      granted: () => Array.from(grantedPerms),
      grant: (list) => (list || []).forEach(p => grantedPerms.add(p)),
      revoke: (p) => grantedPerms.delete(p),
      has(instanceId, perm) {
        const r = registry.get(instanceId);
        return !!(r && r.permissions.has(perm) && grantedPerms.has(perm));
      },
      enforce(instanceId, perm, what) {
        if (K.permissions.has(instanceId, perm)) return true;
        const r = registry.get(instanceId);
        ledger.write('permission_denied', { organism_id: r ? r.organism_id : instanceId, permission: perm });
        fault('RUNTIME_001', { organism_id: r ? r.organism_id : null, instance_id: instanceId, message: `${what || 'operation'} needs permission ${perm}` });
        return false;
      },
    };

    // -------------------------------------------------------- mutations (reversible, ledgered)
    const mutationLog = [];
    K.mutations = {
      apply(ownerInstanceId, m) {
        const target = registry.get(m.target);
        if (!target) return { ok: false, fault: fault('MUTATION_001', { instance_id: ownerInstanceId, message: `mutation target ${m.target} not found` }) };
        if (!['add_hook', 'remove_hook', 'set_config', 'add_projection', 'add_constraint'].includes(m.operation)) {
          return { ok: false, fault: fault('MUTATION_002', { instance_id: ownerInstanceId, message: `operation ${m.operation} unsupported` }) };
        }
        const id = m.mutation_id || ('mut-' + (mutationLog.length + 1));
        ledger.write('mutation_applied', { mutation_id: id, target: m.target, operation: m.operation, payload: m.payload || null });
        let undo = null;
        if (m.operation === 'add_hook') { target.hooks.set(m.payload.hook_id, m.payload); undo = () => target.hooks.delete(m.payload.hook_id); }
        else if (m.operation === 'remove_hook') { const prev = target.hooks.get(m.payload.hook_id); target.hooks.delete(m.payload.hook_id); undo = () => prev && target.hooks.set(prev.hook_id, prev); }
        else if (m.operation === 'set_config') {
          const prev = {}; Object.keys(m.payload || {}).forEach(k => { prev[k] = paramReaders.has(m.target) ? K.registry.readParam('kernel', m.target, k) : undefined; });
          Object.keys(m.payload || {}).forEach(k => bus.publish('ui:config_change:' + m.target, { key: k, value: m.payload[k] }));
          undo = () => Object.keys(prev).forEach(k => prev[k] !== undefined && bus.publish('ui:config_change:' + m.target, { key: k, value: prev[k] }));
        }
        else undo = () => {};
        mutationLog.push({ id, owner: ownerInstanceId, undo, target: m.target });
        return { ok: true, mutation_id: id };
      },
      rollbackFor(ownerInstanceId) {
        for (let i = mutationLog.length - 1; i >= 0; i--) {
          const m = mutationLog[i];
          if (m.owner !== ownerInstanceId) continue;
          mutationLog.splice(i, 1);
          try { if (registry.has(m.target)) m.undo(); ledger.write('mutation_rolled_back', { mutation_id: m.id, reason: 'owner_unmounted' }); }
          catch (e) { fault('MUTATION_004', { instance_id: ownerInstanceId, message: `rollback ${m.id}: ${e.message}` }); }
        }
      },
    };

    // -------------------------------------------------------- ports (kinds are defined by domains; the kernel only keeps the registry)
    // defineKind(kind, { directions?, permission(dir, spec) → perm | [anyOf] | null, validate(spec, dir) → error|null,
    //                    onRegister(port), onRemove(port) })
    const portKinds = new Map();
    const ports = new Map();           // instanceId → Map(portId → port)
    K.ports = {
      defineKind(kind, def) {
        if (portKinds.has(kind)) { fault('PORT_003', { message: `port kind ${kind} already defined` }); return false; }
        portKinds.set(kind, Object.assign({ directions: ['in', 'out'] }, def || {}));
        ledger.write('port_kind_defined', { kind });
        return true;
      },
      kinds: () => Array.from(portKinds.keys()),
      register(instanceId, portId, spec) {
        spec = spec || {};
        if (!registry.has(instanceId)) { fault('PORT_001', { instance_id: instanceId, message: `registerPort: instance ${instanceId} not registered` }); return null; }
        const def = portKinds.get(spec.kind), dir = spec.direction;
        if (!def || !def.directions.includes(dir)) { fault('PORT_002', { instance_id: instanceId, message: `port ${portId}: invalid kind/direction ${spec.kind}/${dir}` }); return null; }
        const need = def.permission ? def.permission(dir, spec) : null;
        if (need) {
          const any = Array.isArray(need) ? need : [need];
          if (!any.some(p => K.permissions.has(instanceId, p))) { K.permissions.enforce(instanceId, any[0], `registerPort ${portId}`); return null; }
        }
        const err = def.validate ? def.validate(spec, dir) : null;
        if (err) { fault('PORT_002', { instance_id: instanceId, message: `port ${portId}: ${err}` }); return null; }
        if (!ports.has(instanceId)) ports.set(instanceId, new Map());
        const map = ports.get(instanceId);
        if (map.has(portId)) { fault('PORT_003', { instance_id: instanceId, message: `duplicate port ${portId}` }); return null; }
        const port = Object.assign({}, spec, { instance_id: instanceId, port_id: portId, kind: spec.kind, direction: dir, label: spec.label || portId });
        map.set(portId, port);
        ledger.write('port_registered', { instance_id: instanceId, port_id: portId, kind: spec.kind, direction: dir });
        if (def.onRegister) def.onRegister(port);
        return port;
      },
      get(instanceId, portId) { const m = ports.get(instanceId); return m ? (m.get(portId) || null) : null; },
      list: (instanceId) => Array.from((ports.get(instanceId) || new Map()).values()),
      all: () => Array.from(ports.values()).flatMap(m => Array.from(m.values())),
      removeAll(instanceId) {
        const map = ports.get(instanceId);
        if (!map) return;
        map.forEach(p => {
          const def = portKinds.get(p.kind);
          try { if (def && def.onRemove) def.onRemove(p); } catch (e) { fault('RUNTIME_003', { instance_id: instanceId, message: `port ${p.port_id} remove: ${e.message}` }); }
          ledger.write('port_removed', { instance_id: instanceId, port_id: p.port_id });
        });
        ports.delete(instanceId);
      },
    };

    // -------------------------------------------------------- wire registry (Layer 12 + amendment)
    const wires = new Map();
    let wireSeq = 0;
    // wire types: event_bus / callto / api are core. Signal types (defined by domains) carry a handler:
    // { connect(wireId, srcPort, dstPort) → {ok, fault?, data?}, disconnect(wireId, wire), acyclic?, color?, ambient? }
    const wireTypes = new Map([['event_bus', { core: true }], ['callto', { core: true }], ['api', { core: true }]]);
    function instGraphHasPath(from, to, type) {
      // edge graph of one wire type at instance level; organism in→out implied
      const adj = new Map();
      wires.forEach(w => {
        if (w.wire_type !== type) return;
        if (!adj.has(w.src.instanceId)) adj.set(w.src.instanceId, new Set());
        adj.get(w.src.instanceId).add(w.dst.instanceId);
      });
      const seen = new Set([from]), stack = [from];
      while (stack.length) {
        const n = stack.pop();
        if (n === to) return true;
        (adj.get(n) || []).forEach(m => { if (!seen.has(m)) { seen.add(m); stack.push(m); } });
      }
      return false;
    }
    K.wires = {
      defineType(type, handler) {
        if (wireTypes.has(type)) { fault('WIRE_005', { message: `wire type ${type} already defined` }); return false; }
        wireTypes.set(type, Object.assign({}, handler)); ledger.write('wire_type_defined', { wire_type: type }); return true;
      },
      types: () => Array.from(wireTypes.entries()).map(([type, h]) => ({ type, signal: !!h.connect, color: h.color || null, ambient: h.ambient || null })),
      // 3.37: can these two hooks be wired? (same type, and the type's own rule — e.g. a data type the input accepts)
      compatible(sh, th) { if (!sh || !th || sh.wire_type !== th.wire_type) return false; const h = wireTypes.get(sh.wire_type); try { return h && typeof h.compatible === 'function' ? !!h.compatible(sh, th) : true; } catch (e) { return false; } },
      register(spec) {
        const src = spec.src || spec.source, dst = spec.dst || spec.target;
        const sh = K.registry.hook(src.instanceId, src.hookId), th = K.registry.hook(dst.instanceId, dst.hookId);
        const wt = spec.wire_type || (sh && sh.wire_type) || 'event_bus';
        const handler = wireTypes.get(wt);
        if (!handler) return { ok: false, fault: fault('WIRE_005', { hook_id: src.hookId, message: `unsupported wire_type ${wt}` }) };
        const strict = !!handler.connect;
        if (!sh || !th) {
          if (strict || !registry.has(src.instanceId) || !registry.has(dst.instanceId)) {
            return { ok: false, fault: fault('WIRE_002', { instance_id: src.instanceId, hook_id: !sh ? src.hookId : dst.hookId, message: `hook not found: ${!sh ? src.instanceId + '.' + src.hookId : dst.instanceId + '.' + dst.hookId}` }) };
          }
        }
        if (sh && th) {
          const sd = sh.direction, td = th.direction;
          if (!(sd === 'out' || sd === 'inout') || !(td === 'in' || td === 'inout')) {
            return { ok: false, fault: fault('WIRE_003', { hook_id: src.hookId, message: `${src.hookId}(${sd}) → ${dst.hookId}(${td})` }) };
          }
          if (sh.wire_type !== th.wire_type) {
            return { ok: false, fault: fault('WIRE_005', { hook_id: src.hookId, message: `wire_type ${sh.wire_type} ≠ ${th.wire_type}` }) };
          }
          if (sh.contract_version && th.contract_version && semver.parse(sh.contract_version)[0] !== semver.parse(th.contract_version)[0]) {
            return { ok: false, fault: fault('WIRE_001', { hook_id: src.hookId, message: `contract ${sh.contract_version} ≠ ${th.contract_version}` }) };
          }
          if (sh.wire_type === 'event_bus' && sh.event_type && th.event_type) {
            const se = String(sh.event_type).split('|').map(s => s.trim()), te = String(th.event_type).split('|').map(s => s.trim());
            if (!se.some(e => te.includes(e))) return { ok: false, fault: fault('WIRE_001', { hook_id: src.hookId, message: `event ${sh.event_type} ≠ ${th.event_type}` }) };
          }
        }
        for (const w of wires.values()) {
          if (w.src.instanceId === src.instanceId && w.src.hookId === src.hookId && w.dst.instanceId === dst.instanceId && w.dst.hookId === dst.hookId) {
            return { ok: false, fault: fault('WIRE_004', { hook_id: src.hookId, message: 'duplicate wire' }) };
          }
        }
        if (handler.acyclic) {
          if (src.instanceId === dst.instanceId || instGraphHasPath(dst.instanceId, src.instanceId, wt)) {
            return { ok: false, fault: fault('WIRE_006', { hook_id: src.hookId, message: `${wt} cycle ${src.instanceId} → ${dst.instanceId}` }) };
          }
        }
        const wire_id = spec.wire_id || ('w' + (++wireSeq) + '-' + Math.random().toString(36).slice(2, 6));
        const w = { wire_id, src: { instanceId: src.instanceId, hookId: src.hookId }, dst: { instanceId: dst.instanceId, hookId: dst.hookId }, wire_type: wt, validated_at: new Date().toISOString(), meta: spec.meta || {} };
        ledger.write('wire_registered', { wire_id, source: src.instanceId + '.' + src.hookId, target: dst.instanceId + '.' + dst.hookId });
        if (strict) {
          const sp = K.ports.get(src.instanceId, sh.port), dp = K.ports.get(dst.instanceId, th.port);
          if (!sp || !dp) return { ok: false, fault: fault('PORT_001', { message: `connect: port missing ${!sp ? src.instanceId + '/' + sh.port : dst.instanceId + '/' + th.port}` }) };
          const r = handler.connect(wire_id, sp, dp, w) || { ok: false };
          if (!r.ok) return r.fault ? r : { ok: false, fault: fault('WIRE_005', { message: `${wt}: ${sp.kind} → ${dp.kind} not connectable` }) };
          w.data = r.data || null;
        }
        wires.set(wire_id, w);
        bus.publish('kernel:wire-registered', Object.assign({}, w));
        return { ok: true, wire_id, wire: w };
      },
      remove(wire_id, reason) {
        const w = wires.get(wire_id);
        if (!w) return false;
        ledger.write('wire_removed', { wire_id, reason: reason || 'removed' });
        const handler = wireTypes.get(w.wire_type);
        if (handler && handler.disconnect) { try { handler.disconnect(wire_id, w); } catch (e) { fault('RUNTIME_003', { message: `disconnect ${wire_id}: ${e.message}` }); } }
        wires.delete(wire_id);
        bus.publish('kernel:wire-removed', { wire_id, src: w.src, dst: w.dst, wire_type: w.wire_type, reason: reason || 'removed' });
        return true;
      },
      get: (id) => wires.get(id) || null,
      list: () => Array.from(wires.values()),
      edges(instanceId) {
        const up = [], down = [];
        wires.forEach(w => { if (w.dst.instanceId === instanceId) up.push(w.src.instanceId); if (w.src.instanceId === instanceId) down.push(w.dst.instanceId); });
        return { upstream: up, downstream: down };
      },
      find(q) { return K.wires.list().filter(w => Object.keys(q).every(k => (k === 'src' || k === 'dst') ? Object.keys(q[k]).every(kk => w[k][kk] === q[k][kk]) : w[k] === q[k])); },
    };

    // -------------------------------------------------------- modes
    K.setMode = function (mode_id, scope) { ledger.write('mode_changed', { mode_id, scope: scope || 'universe' }); bus.publish('kernel:mode', { mode_id, scope: scope || 'universe' }); };

    // -------------------------------------------------------- assets (Layer 11)
    const assets = new Map();
    function fnv32(bytes) {
      let h = 0x811c9dc5;
      const n = Math.min(bytes.length, 4096);
      for (let i = 0; i < n; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
      return ('00000000' + h.toString(16)).slice(-8);
    }
    // decoders are defined by domains: { asset_type, mime?: RegExp, sniff?(bytes, name) → bool, decode(bytes, rec) → Promise }
    const decoders = [];
    function typeFor(bytes, meta) {
      if (meta.asset_type) return meta.asset_type;
      const byMime = decoders.find(d => d.mime && meta.mime && d.mime.test(meta.mime));
      if (byMime) return byMime.asset_type;
      const bySniff = decoders.find(d => d.sniff && d.sniff(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)), meta.name || ''));
      return bySniff ? bySniff.asset_type : 'binary';
    }
    K.assets = {
      defineDecoder(d) { decoders.push(d); ledger.write('asset_decoder_defined', { asset_type: d.asset_type }); },
      hash(arrayBuffer) {
        const b = new Uint8Array(arrayBuffer);
        // FNV-32 of first 4 KB + size suffix (collision guard for files sharing a header)
        return fnv32(b) + '-' + b.length.toString(36);
      },
      register(arrayBuffer, meta) {
        meta = meta || {};
        const hash = K.assets.hash(arrayBuffer);
        if (meta.hash && meta.hash !== hash) { fault('ASSET_003', { message: `hash mismatch ${meta.hash} ≠ ${hash}` }); }
        if (!assets.has(hash)) {
          const rec = { uuid: hash, hash, source: meta.name || 'unnamed', mime: meta.mime || 'application/octet-stream', size_bytes: arrayBuffer.byteLength, imported_at: new Date().toISOString(), asset_type: typeFor(arrayBuffer, meta), data: arrayBuffer, decoded: null, lineage: meta.lineage || [], representations: ['card'] };
          assets.set(hash, rec);
          ledger.write('asset_imported', { asset_id: hash, source: rec.source, mime: rec.mime, asset_type: rec.asset_type });
          (meta.lineage || []).forEach(l => ledger.write('asset_transformed', { asset_id: l.source, operation: l.operation, result_id: hash }));
        }
        return assets.get(hash);
      },
      // bytes + an already-decoded form (e.g. something a domain rendered in memory)
      registerDecoded(arrayBuffer, decoded, meta) { const rec = K.assets.register(arrayBuffer, meta); rec.decoded = decoded; return rec; },
      get: (hash) => assets.get(hash) || null,
      list: () => Array.from(assets.values()),
      async decode(hash) {
        const a = assets.get(hash);
        if (!a) { fault('ASSET_001', { message: `asset ${hash} not found` }); return null; }
        if (a.decoded) return a.decoded;
        if (a.asset_type === 'binary') a.asset_type = typeFor(a.data, { name: a.source, mime: a.mime });
        const d = decoders.find(x => x.asset_type === a.asset_type);
        if (!d) { fault('ASSET_004', { message: `${a.source}: no decoder for ${a.asset_type}` }); return null; }
        try { a.decoded = await d.decode(a.data.slice(0), a); return a.decoded; }
        catch (e) { fault('ASSET_002', { message: `decode ${a.source}: ${e.message}` }); return null; }
      },
    };

    // -------------------------------------------------------- domains (the only way domain knowledge enters a universe)
    const domains = new Map();
    const CORE_KEYS = new Set(Object.keys(K).concat(['extend', 'domains', 'installDomain']));
    K.extend = function (name, api, domainId) {
      if (CORE_KEYS.has(name) || Object.prototype.hasOwnProperty.call(K, name)) {
        fault('DOMAIN_002', { message: `${domainId || 'extension'} cannot claim K.${name} (already taken)` }); return false;
      }
      K[name] = api; ledger.write('extension_installed', { name, domain: domainId || null }); return true;
    };
    K.domains = {
      list: () => Array.from(domains.values()).map(d => ({ id: d.id, version: d.version })), has: (id) => domains.has(id), get: (id) => domains.get(id) || null,
      // let every installed domain warm up its runtime (e.g. a device context that needs a user gesture) before
      // capabilities are checked; safe to call repeatedly
      prepare() { domains.forEach(d => { if (typeof d.prepare === 'function') { try { d.prepare(K); } catch (e) { fault('RUNTIME_003', { message: `domain ${d.id} prepare: ${e.message}` }); } } }); },
    };
    K.installDomain = function (d) {
      if (!d || !d.id || typeof d.install !== 'function') { fault('MOUNT_005', { message: 'domain needs {id, install}' }); return false; }
      if (domains.has(d.id)) return true;
      const missing = (d.requires || []).filter(id => !domains.has(id));
      if (missing.length) { fault('DOMAIN_001', { message: `domain ${d.id} needs ${missing.join(', ')}` }); return false; }
      domains.set(d.id, d);
      try { d.install(K, opts); }
      catch (e) { domains.delete(d.id); fault('RUNTIME_003', { message: `domain ${d.id} install: ${e.message}`, error: e }); return false; }
      ledger.write('domain_installed', { domain_id: d.id, version: d.version || null });
      bus.publish('kernel:domain-installed', { id: d.id });
      return true;
    };
    if (opts.domains === undefined) { defaultUniverses.add(K); domainPacks.forEach(d => K.installDomain(d)); }
    else opts.domains.forEach(id => { const d = domainPacks.find(x => x.id === id); if (d) K.installDomain(d); else fault('DOMAIN_001', { message: `domain ${id} not registered` }); });
    return K;
  }

  const Kernel = create();
  Kernel.create = create;
  Kernel.use = function (d) {
    if (!domainPacks.some(x => x.id === d.id)) domainPacks.push(d);
    defaultUniverses.forEach(K => K.installDomain(d));
    return Kernel;
  };
  Kernel.registeredDomains = () => domainPacks.slice();
  Kernel.contract = contract;
  Kernel.semver = semver;
  Kernel.FAULTS = FAULTS;
  global.Kernel = Kernel;
  global.ERAVOS = global.ERAVOS || {};
  global.ERAVOS.Kernel = Kernel;
})(typeof window !== 'undefined' ? window : globalThis);
