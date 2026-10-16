/* ERAVOS runtime R9 — organism-factory.js → window.OrganismFactory
 * handles: Map instanceId → engine handle (F-01). Unmount exactly once from any of:
 *   canvas:window-closed · .wm-win removed from canvas (MutationObserver) · kernel:organism-unmounted
 * UI files call OrganismFactory.reg(id, uiFn); engines call OrganismFactory.define(descriptor).
 * Domain-free: domains add define-time transforms (onDefine), view capabilities (extendView) and the
 * bus topics a UI may observe (allowObserve). */
(function (global) {
  'use strict';
  const defs = new Map(), uis = new Map(), handles = new Map();
  const counters = {};
  const listeners = new Set();
  const defineHooks = [], viewExts = [], beforeSpawnHooks = [];
  const observable = ['kernel:wire', 'kernel:organism', 'factory:', 'canvas:focus'];

  function define(desc) {
    if (!desc || !desc.id || typeof desc.engine !== 'function') throw new Error('OrganismFactory.define: id + engine required');
    desc.hooks = desc.hooks || [];
    desc.config = desc.config || [];
    desc.ui_hooks = desc.ui_hooks || [];
    desc.permissions = desc.permissions || ['bus_publish', 'bus_subscribe'];
    desc.requires = desc.requires || [];
    desc.provides = desc.provides || [];
    desc.version = desc.version || '1.0.0';
    defineHooks.forEach(fn => { try { fn(desc); } catch (e) { console.warn('define hook failed', desc.id, e); } });
    defs.set(desc.id, desc);
    listeners.forEach(fn => fn('define', desc.id));
    return desc;
  }
  function reg(id, uiFn) { uis.set(id, uiFn); }
  function shortId(id) {
    const base = id.replace(/^eravos\./, '');
    counters[base] = (counters[base] || 0) + 1;
    return base + '-' + counters[base] + '-' + Math.random().toString(36).slice(2, 5);
  }
  function registryDescriptor(d) {
    return { id: d.id, version: d.version, label: d.label, icon: d.icon, accent: d.accent, domain: d.domain || null, kernel_target: d.kernel_target || '3.1.0',
      permissions: d.permissions, provides: d.provides, requires: d.requires, dependencies: d.dependencies || [], hooks: d.hooks, config: d.config,
      ui_hooks: d.ui_hooks, constraints: d.constraints || [], presets: d.presets || {} };
  }

  function spawn(id, o) {
    o = o || {};
    const K = o.K || global.Kernel;
    const d = defs.get(id);
    if (!d) { K.fault('MOUNT_001', { organism_id: id, message: `organism ${id} not defined (engine file missing?)` }); return null; }
    if (!K._factoryBooted) boot(K);
    // the shell expands what a tool needs (its UI units) BEFORE the engine mounts — tools never wait on chrome
    beforeSpawnHooks.forEach(fn => { try { fn(d, o, K); } catch (e) { K.fault('RUNTIME_003', { organism_id: id, message: 'before-spawn: ' + e.message }); } });
    K.domains.prepare();
    if (d.singleton) {
      const existing = K.registry.byOrganism(id);
      if (existing.length) {
        if (d.singleton === 'block') { K.fault('MOUNT_006', { organism_id: id, message: `${d.label} is a singleton — already mounted as ${existing[0].instance_id}` }); return null; }
        K.fault('MOUNT_006', { organism_id: id, message: `${d.label} already mounted — second instance is read-only` });
        o.readOnly = true;
      }
    }
    const instanceId = o.instanceId || shortId(id);
    const rd = registryDescriptor(d);
    if (o.ephemeral) { rd.system = true; rd.ephemeral = true; o.service = true; }   // a preview: no window, not saved, not undoable, hidden from tool lists
    const r = K.registry.register(instanceId, rd, { position: o.x !== undefined ? { x: o.x, y: o.y } : null });
    if (!r.ok) return null;
    let ctx;
    try { ctx = global.OrganismSDK.create(instanceId, K, rd, {}); }
    catch (e) { K.fault('RUNTIME_003', { organism_id: id, message: 'sdk: ' + e.message }); K.registry.unregister(instanceId, 'mount_failed'); return null; }
    ctx.readOnly = !!o.readOnly;
    K.registry.bindParamReader(instanceId, (k) => ctx.params.get(k));
    let handle;
    try { handle = d.engine(ctx, o) || {}; }
    catch (e) {
      K.fault('RUNTIME_003', { organism_id: id, instance_id: instanceId, message: 'engine mount: ' + e.message, error: e });
      ctx.dispose(); return null;
    }
    const rec = { instanceId, id, def: d, ctx, handle, K, win: null, service: !!o.service, ephemeral: !!o.ephemeral, uiDisposers: [], unmounted: false, unmountCalls: 0 };
    handles.set(instanceId, rec);
    if (o.state) ctx.deserialize(o.state);
    else if (d.defaultPreset && d.presets && d.presets[d.defaultPreset]) ctx.presets.load(d.defaultPreset);
    if (!o.headless && !o.service && global.CanvasWM && K === global.Kernel) {
      try { rec.win = global.CanvasWM.open(rec, o); } catch (e) { K.fault('RUNTIME_003', { organism_id: id, instance_id: instanceId, message: 'ui: ' + e.message, error: e }); }
    }
    ctx.syncUI();
    K.bus.publish('factory:spawned', { instanceId, organismId: id });
    listeners.forEach(fn => fn('spawn', instanceId));
    return instanceId;
  }

  function unmountOnce(instanceId, reason) {
    const rec = handles.get(instanceId);
    if (!rec || rec.unmounted) return false;
    listeners.forEach(fn => { try { fn('before-unmount', instanceId, rec); } catch (e) {} }); // state still readable (undo)
    rec.unmounted = true;
    rec.unmountCalls++;
    if (handles.get(instanceId) === rec) handles.delete(instanceId);
    try { if (typeof rec.handle.unmount === 'function') rec.handle.unmount(); }
    catch (e) { rec.K.fault('RUNTIME_003', { organism_id: rec.id, instance_id: instanceId, message: 'unmount: ' + e.message }); }
    try { rec.ctx.dispose(); } catch (e) { rec.K.fault('RUNTIME_003', { organism_id: rec.id, instance_id: instanceId, message: 'dispose: ' + e.message }); }
    rec.uiDisposers.forEach(fn => { try { fn(); } catch (e) {} });
    rec.uiDisposers.length = 0;
    if (rec.win && global.CanvasWM) global.CanvasWM.removeWindow(rec.win, true);
    listeners.forEach(fn => fn('unmount', instanceId));
    return true;
  }

  // UI view — the only surface a UI gets (Layer 16)
  function makeView(rec, root) {
    const K = rec.K, d = rec.def, id = rec.instanceId;
    const allowed = new Set(global.OrganismSDK.STD_UI_HOOKS.concat(d.ui_hooks.map(u => String(u).replace(/^ui:/, '').split(/\s/)[0])));
    const state = {};
    const binds = new Map();
    const unsubs = [];
    const view = {
      root, instanceId: id, descriptor: d, ui: global.UIKit, state, K,
      emit(type, payload) {
        if (!allowed.has(type)) { K.fault('RUNTIME_002', { organism_id: d.id, instance_id: id, message: `UI event ui:${type} not declared in ui_hooks — dropped` }); return; }
        K.bus.publish('ui:' + type + ':' + id, payload === undefined ? {} : payload);
      },
      set(key, value) { view.emit('config_change', { key, value }); },
      on(type, fn) { const un = K.bus.subscribe('org:' + type + ':' + id, fn, 'ui:' + id); unsubs.push(un); return un; },
      observe(topic, fn) {
        if (!observable.some(pre => topic.startsWith(pre))) { K.fault('RUNTIME_001', { organism_id: d.id, message: `UI may not observe ${topic} (allowed: ${observable.join(', ')})` }); return () => {}; }
        const un = K.bus.subscribe(topic, fn, 'ui:' + id); unsubs.push(un); return un;
      },
      bind(key, fn) { if (!binds.has(key)) binds.set(key, []); binds.get(key).push(fn); if (state[key] !== undefined) fn(state[key]); },
      onDispose(fn) { rec.uiDisposers.push(fn); },
      targets(capability) { // live list of organisms (for target selects) — registry_read
        return K.registry.list().filter(r => !r.descriptor.system && (!capability || (r.descriptor.provides || []).includes(capability)) && r.instance_id !== id)
          .map(r => ({ value: r.instance_id, label: (r.descriptor.icon || '') + ' ' + (r.descriptor.label || r.organism_id) + ' · ' + r.instance_id.split('-').slice(-2).join('') }));
      },
      label(instanceId) { const r = K.registry.get(instanceId); return r ? (r.descriptor.icon || '') + ' ' + r.descriptor.label : 'no target'; },
      focus() { K.bus.publish('canvas:focus', { instanceId: id }); },
    };
    viewExts.forEach(fn => { try { fn(view, rec); } catch (e) { K.fault('RUNTIME_003', { organism_id: d.id, message: 'view extension: ' + e.message }); } });
    view.on('state_sync', (s) => { if (s && s.params) { Object.assign(state, s.params); Object.keys(s.params).forEach(k => (binds.get(k) || []).forEach(fn => fn(s.params[k]))); } });
    view.on('param', (p) => { if (p) { state[p.key] = p.value; (binds.get(p.key) || []).forEach(fn => fn(p.value)); } });
    rec.uiDisposers.push(() => unsubs.forEach(u => u()));
    // preload current state synchronously
    Object.assign(state, rec.ctx.params.all());
    return view;
  }

  function mountUI(rec, root) {
    const fn = uis.get(rec.id);
    const view = makeView(rec, root);
    rec.view = view;
    if (fn) fn(view);
    else root.appendChild(global.UIKit.paramPanel(view));
    return view;
  }

  function boot(K) {
    K = K || global.Kernel;
    if (K._factoryBooted) return;
    K._factoryBooted = true;
    K.bus.subscribe('kernel:organism-unmounted', (p) => { if (handles.has(p.instanceId)) unmountOnce(p.instanceId, 'kernel'); }, 'factory');
    K.bus.subscribe('canvas:window-closed', (p) => unmountOnce(p.instanceId, 'window-closed'), 'factory');
  }

  global.OrganismFactory = {
    define, reg, spawn, boot, mountUI, makeView,
    onDefine(fn) { defineHooks.push(fn); defs.forEach(d => fn(d)); },
    extendView(fn) { viewExts.push(fn); },
    onBeforeSpawn(fn) { beforeSpawnHooks.push(fn); return () => { const i = beforeSpawnHooks.indexOf(fn); if (i >= 0) beforeSpawnHooks.splice(i, 1); }; },
    allowObserve(prefixes) { (prefixes || []).forEach(p => { if (!observable.includes(p)) observable.push(p); }); },
    close: (id, reason) => unmountOnce(id, reason || 'closed'),
    handle: (id) => handles.get(id) || null,
    handles: () => Array.from(handles.values()),
    defined: () => Array.from(defs.values()),
    def: (id) => defs.get(id) || null,
    ui: (id) => uis.get(id) || null,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // services (spawn {service:true}) run without a window and are not saved; clearing the canvas keeps them
    clearAll(K) { Array.from(handles.values()).filter(r => (!K || r.K === K) && !r.service).forEach(r => unmountOnce(r.instanceId, 'clear_all')); },
    // give a service (or headless instance) its window — e.g. a background input service opened for editing
    show(id, o) { const r = handles.get(id); if (!r || r.win || !global.CanvasWM) return false; r.service = false; r.win = global.CanvasWM.open(r, o || {}); r.ctx.syncUI(); return true; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
