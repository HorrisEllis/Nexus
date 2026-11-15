/* ERAVOS runtime R2 — organism-sdk.js → window.OrganismSDK (domain-free)
 * Every engine is written against ctx: typed params, bus access through declared hooks, ports (kinds come
 * from domains), timers, presets, serialize/deserialize, dispose. Engines never touch the DOM, never touch
 * another organism, never bind keys.
 * Domains add hook builders, statics and ctx capabilities with OrganismSDK.extend({ id, std, uiHooks, statics, ctx(ctx, api) }). */
(function (global) {
  'use strict';

  const ASSET_SCHEMA = { type: 'object', required: ['hash'], properties: { hash: { type: 'string' }, name: { type: 'string' }, duration: { type: 'number' } } };
  const STD = {
    asset_in: (hook_id) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'event_bus', event_type: 'asset:ready', contract_version: '1.0.0', schema: ASSET_SCHEMA, failure_mode: 'ASSET_001', intent: 'receive an asset' }),
    asset_out: (hook_id) => ({ hook_id, hook_type: 'emitter', direction: 'out', wire_type: 'event_bus', event_type: 'asset:ready', contract_version: '1.0.0', schema: ASSET_SCHEMA, failure_mode: 'ASSET_001', intent: 'publish an asset' }),
    event: (hook_id, direction, event_type, schema, version) => ({ hook_id, hook_type: direction === 'out' ? 'emitter' : direction === 'in' ? 'receiver' : 'bidirectional', direction, wire_type: 'event_bus', event_type, contract_version: version || '1.0.0', schema: schema || { type: 'object' }, failure_mode: 'RUNTIME_002' }),
  };
  const STD_UI_HOOKS = ['config_change', 'preset_load', 'preset_save', 'preset_apply', 'preset_put', 'preset_delete', 'preset_rename', 'request_state', 'silence'];
  const extensions = [];

  // ---------------------------------------------------------------- IndexedDB (presets store — A-3)
  const IDB = {
    _db: null,
    open() {
      if (IDB._db) return IDB._db;
      IDB._db = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
        const r = indexedDB.open('eravos', 2);
        r.onupgradeneeded = () => { const db = r.result; ['autosave', 'presets', 'assets', 'library'].forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      return IDB._db;
    },
    async get(store, key) { try { const db = await IDB.open(); return await new Promise((res, rej) => { const q = db.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; } },
    async put(store, key, val) { try { const db = await IDB.open(); return await new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); } catch (e) { return false; } },
  };

  // a link = { peer, organism, label, provides, category, dir: 'in'|'out', hook, peerHook, wire_type, wire_id }.
  // A host's own insert chain (its mods, meta.insert) is not a link: that is the tool itself.
  function linksOf(K, id) {
    const out = [];
    K.wires.list().forEach(w => {
      if (w.meta && w.meta.insert) return;
      const mine = w.dst.instanceId === id ? 'in' : w.src.instanceId === id ? 'out' : null; if (!mine) return;
      const peer = mine === 'in' ? w.src : w.dst, me = mine === 'in' ? w.dst : w.src, r = K.registry.get(peer.instanceId); if (!r) return;
      const d = global.OrganismFactory && global.OrganismFactory.def(r.organism_id);
      out.push({ peer: peer.instanceId, organism: r.organism_id, label: r.descriptor.label || r.organism_id, icon: r.descriptor.icon || '', provides: r.descriptor.provides || [], category: (d && d.category) || '',
        dir: mine, hook: me.hookId, peerHook: peer.hookId, wire_type: w.wire_type, wire_id: w.wire_id });
    });
    return out;
  }

  // ---------------------------------------------------------------- ctx
  function create(instanceId, K, descriptor, opts) {
    opts = opts || {};
    const bus = K.bus;
    const unsubs = [], tracked = new Set(), timers = new Set(), rafs = new Set(), disposers = [], silencers = [];
    const cfg = new Map();
    (descriptor.config || []).forEach(c => cfg.set(c.key, c));
    const values = {};
    cfg.forEach((c, k) => { values[k] = clone(c.default); });
    const paramHandlers = new Map();
    let disposed = false;
    const stateContribs = [];
    const userPresets = {};
    const persist = () => { const snap = clone(userPresets); return IDB.get('presets', descriptor.id).then(() => IDB.put('presets', descriptor.id, snap)).then(() => { ctx.syncUI(); return true; }); };

    function clone(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }
    function fault(cls, message, hook_id) { return K.fault(cls, { organism_id: descriptor.id, instance_id: instanceId, hook_id, message }); }

    function coerce(key, v) {
      const c = cfg.get(key);
      if (!c) return { err: `unknown config key ${key}` };
      switch (c.type) {
        case 'number': case 'integer':
          if (typeof v !== 'number' || !Number.isFinite(v)) return { err: `${key}: expected number, got ${typeof v}` };
          if (c.min !== undefined) v = Math.max(c.min, v);
          if (c.max !== undefined) v = Math.min(c.max, v);
          if (c.type === 'integer') v = Math.round(v);
          return { v };
        case 'boolean': if (typeof v !== 'boolean') return { err: `${key}: expected boolean` }; return { v };
        case 'string': if (typeof v !== 'string') return { err: `${key}: expected string` }; return { v };
        case 'enum':
          if (!c.options.some(o => o === v || String(o) === String(v))) return { err: `${key}: ${JSON.stringify(v)} not in [${c.options.join(', ')}]` };
          return { v: c.options.find(o => o === v || String(o) === String(v)) };
        case 'array': if (!Array.isArray(v)) return { err: `${key}: expected array` }; return { v: clone(v) };
        case 'object': if (!v || typeof v !== 'object') return { err: `${key}: expected object` }; return { v: clone(v) };
        default: return { v };
      }
    }

    // 3.49 (eravos.phase49-map P49.1, D-49.2): a LIVE value — what a mover (a tool wired to the knob) moves it to right now. The engine hears it
    // (get() returns it, onChange runs) but it is never saved, never undoable, never echoed as a setting: all() and serialize()
    // keep the knob's own value. live(k, null) hands the knob back. The window hears 'param_live' (at most every 40 ms per knob).
    const liveVals = new Map(), liveSaid = new Map();
    const fire = (k, v, prev) => { (paramHandlers.get(k) || []).forEach(fn => safe(() => fn(v, prev, k))); (paramHandlers.get('*') || []).forEach(fn => safe(() => fn(v, prev, k))); };
    const sayLive = (k, v) => { const now = Date.now(); if (v !== null && now - (liveSaid.get(k) || 0) < 40) return; liveSaid.set(k, now); ctx.emitUI('param_live', { key: k, value: v }); };
    const params = {
      get: (k) => (liveVals.has(k) ? liveVals.get(k) : values[k]),
      base: (k) => values[k],
      isLive: (k) => liveVals.has(k),
      live(k, v) {
        if (v === null || v === undefined) { if (!liveVals.has(k)) return false; const prev = liveVals.get(k); liveVals.delete(k); fire(k, values[k], prev); sayLive(k, null); return true; }
        const r = coerce(k, v); if (r.err) return false;
        const prev = params.get(k); if (liveVals.has(k) && JSON.stringify(prev) === JSON.stringify(r.v)) return false;
        liveVals.set(k, r.v); fire(k, r.v, prev); sayLive(k, r.v); return true;
      },
      all: () => clone(values),
      schema: () => descriptor.config || [],
      set(k, v, o) {
        o = o || {};
        const r = coerce(k, v);
        if (r.err) { fault('RUNTIME_002', r.err); return false; }
        const prev = values[k];
        values[k] = r.v;
        if (!o.silent && !liveVals.has(k)) fire(k, r.v, prev);   // a knob being moved live: the next sample carries the new own value
        if (!o.noEcho) ctx.emitUI('param', { key: k, value: clone(r.v) });
        return true;
      },
      setMany(obj, o) { Object.keys(obj || {}).forEach(k => { if (cfg.has(k)) params.set(k, obj[k], o); }); },
      onChange(k, fn) { if (!paramHandlers.has(k)) paramHandlers.set(k, []); paramHandlers.get(k).push(fn); },
    };
    function safe(fn) { try { return fn(); } catch (e) { fault('RUNTIME_003', e.message); } }

    const ctx = {
      id: instanceId, instanceId, K, descriptor, params, STD,
      get disposed() { return disposed; },
      fault,
      // secrets (API keys, tokens): kept on this computer only, per tool type — never in a save, preset, backup or export
      secret(name) {
        const k = 'eravos.secret.' + descriptor.id + '.' + String(name), ls = () => (typeof window !== 'undefined' && window.localStorage) || null;
        return {
          get() { try { const s = ls(); return (s && s.getItem(k)) || ''; } catch (e) { return ''; } },
          set(v) { try { const s = ls(); if (!s) throw new Error('no storage'); s.setItem(k, String(v)); return true; } catch (e) { fault('RUNTIME_003', 'This browser would not keep the key (storage is blocked) — it will work until you close the page.'); return false; } },
          clear() { try { const s = ls(); if (s) s.removeItem(k); } catch (e) {} },
        };
      },
      now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000,
      isTarget: (p) => p && (p.target === instanceId || p.target === '*'),
      on(topic, schema, fn) {
        if (!K.permissions.has(instanceId, 'bus_subscribe')) { K.permissions.enforce(instanceId, 'bus_subscribe', 'subscribe ' + topic); return () => {}; }
        const un = bus.subscribe(topic, (payload, t) => {
          if (disposed) return;
          if (schema) { const errs = K.contract.validate(schema, payload); if (errs.length) { fault('RUNTIME_002', `${t}: ${errs.join('; ')}`); return; } }
          fn(payload, t);
        }, instanceId);
        unsubs.push(un); return un;
      },
      onUI(type, schema, fn) { return ctx.on('ui:' + type + ':' + instanceId, schema, fn); },
      emitUI(type, payload) { if (!disposed) bus.publish('org:' + type + ':' + instanceId, payload); },
      emit(topic, payload) {
        if (disposed) return 0;
        if (!K.permissions.has(instanceId, 'bus_publish')) { K.permissions.enforce(instanceId, 'bus_publish', 'publish ' + topic); return 0; }
        const hooks = descriptor.hooks || [];
        const ok = hooks.some(h => (h.direction === 'out' || h.direction === 'inout') && String(h.event_type || '').split('|').some(e => { e = e.trim(); return e === topic || topic.startsWith(e + ':'); }));
        if (!ok) { fault('RUNTIME_002', `emit ${topic}: no declared out hook`); return 0; }
        const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.assign({ _from: instanceId }, payload) : payload;
        return bus.publish(topic, p);
      },
      port(portId, spec) {
        const p = K.ports.register(instanceId, portId, spec);
        if (!p) throw new Error(`port ${portId} not registered (see fault log)`);
        return p;
      },
      track(x) { tracked.add(x); return x; },
      untrack(x) { tracked.delete(x); },
      interval(fn, ms) { const t = setInterval(() => { if (!disposed) safe(fn); }, ms); timers.add(t); return t; },
      timeout(fn, ms) { const t = setTimeout(() => { timers.delete(t); if (!disposed) safe(fn); }, ms); timers.add(t); return t; },
      onDispose(fn) { disposers.push(fn); },
      // 3.28: stop contract — fn({ hard, reason, time }) must leave nothing sounding forever (tests/p18 proves it per tool)
      onSilence(fn) { silencers.push(fn); },
      silenceNow(p) { if (!disposed) silencers.forEach(fn => safe(() => fn(Object.assign({ hard: false, reason: 'stop', time: null }, p || {})))); },
      // ---- presets (A-3)
      presets: {
        factory: descriptor.presets || {},
        user: userPresets,
        names() { return Object.keys(descriptor.presets || {}).concat(Object.keys(userPresets).map(n => 'user:' + n)); },
        load(name) {
          const n = String(name);
          const p = n.startsWith('user:') ? userPresets[n.slice(5)] : (descriptor.presets || {})[n];
          if (!p) { fault('RUNTIME_002', `preset ${name} not found`); return false; }
          const vals = p.params || p;
          Object.keys(vals).forEach(k => { if (cfg.has(k)) params.set(k, vals[k]); });
          ctx.currentPreset = n;
          if (p.extra && ctx.loadExtra) {
            // 3.26: a saved piece (pattern set, kit with its clips, …) brings its files back before it loads
            const missing = (p.assets || []).filter(h => !K.assets.get(h));
            if (!missing.length) safe(() => ctx.loadExtra(clone(p.extra), { preset: true }));
            else Promise.all(missing.map(h => IDB.get('assets', h).then(a => { if (a && a.data) K.assets.register(a.data, { name: a.name, mime: a.mime, asset_type: a.asset_type }); })))
              .then(() => { if (!disposed) { safe(() => ctx.loadExtra(clone(p.extra), { preset: true })); ctx.syncUI(); } });
          }
          ctx.syncUI();
          return true;
        },
        save(name, o) {
          userPresets[name] = { params: params.all() };
          // 3.26: user presets keep the whole piece by default (patterns, notes, kits, clips) — {extra:false} = knobs only
          if ((!o || o.extra !== false) && ctx.saveExtra) {
            const x = safe(() => ctx.saveExtra());
            if (x !== undefined) {
              userPresets[name].extra = clone(x);
              const txt = JSON.stringify(x), used = K.assets.list().filter(a => a.data && a.data.byteLength > 8 && txt.indexOf(a.hash) >= 0);
              userPresets[name].assets = used.map(a => a.hash);
              used.forEach(a => IDB.put('assets', a.hash, { name: a.source, mime: a.mime, asset_type: a.asset_type, data: a.data }));
            }
          }
          IDB.get('presets', descriptor.id).then(all => { all = all || {}; all[name] = userPresets[name]; return IDB.put('presets', descriptor.id, all); });
          ctx.syncUI();
        },
        // 3.34 preset editor: my presets can be written from given values, renamed and deleted (shipped packs are read-only)
        put(name, value) {
          const vals = (value && value.params) || {}; const clean = {};
          Object.keys(vals).forEach(k => { if (cfg.has(k)) clean[k] = vals[k]; });
          userPresets[name] = Object.assign({}, userPresets[name] || {}, { params: Object.assign({}, (userPresets[name] || {}).params || {}, clean) });
          return persist();
        },
        remove(name) { if (!(name in userPresets)) return false; delete userPresets[name]; return persist(); },
        rename(from, to) { if (!(from in userPresets) || !to || to === from) return false; userPresets[to] = userPresets[from]; delete userPresets[from]; if (ctx.currentPreset === 'user:' + from) ctx.currentPreset = 'user:' + to; return persist(); },
        get: (name) => { const n = String(name); return clone(n.startsWith('user:') ? userPresets[n.slice(5)] : (descriptor.presets || {})[n]) || null; },
      },
      syncUI(extra) {
        ctx.emitUI('state_sync', Object.assign({ params: params.all(), presets: ctx.presets.names(), preset: ctx.currentPreset || null }, ...stateContribs.map(fn => safe(fn) || {}), ctx.stateExtra ? safe(() => ctx.stateExtra()) || {} : {}, extra || {}));
      },
      serialize() { return { params: params.all(), userPresets: clone(userPresets), extra: ctx.saveExtra ? safe(() => ctx.saveExtra()) : undefined }; },
      deserialize(obj) {
        if (!obj) return;
        if (obj.userPresets) Object.assign(userPresets, obj.userPresets);
        if (obj.params) Object.keys(obj.params).forEach(k => { if (cfg.has(k)) params.set(k, obj.params[k], { noEcho: true }); });
        if (obj.extra !== undefined && ctx.loadExtra) safe(() => ctx.loadExtra(obj.extra));
        ctx.syncUI();
      },
      dispose() {
        if (disposed) return;
        disposers.forEach(fn => { try { fn(); } catch (e) { fault('RUNTIME_003', 'dispose: ' + e.message); } });
        disposed = true;
        unsubs.forEach(u => u()); unsubs.length = 0;
        timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers.clear();
        tracked.forEach(n => {
          try { if (typeof n.dispose === 'function') n.dispose(); } catch (e) {}
          try { if (typeof n.stop === 'function') n.stop(); } catch (e) {}
          try { if (typeof n.disconnect === 'function') n.disconnect(); } catch (e) {}
          try { if (n.port && typeof n.port.close === 'function') n.port.close(); } catch (e) {}
        });
        tracked.clear();
        K.registry.unregister(instanceId, opts.reason || 'unmount');
      },
    };

    // ---- links: who this tool is wired to, live (tools/<d> engines adapt to their neighbours — eravos.links spec)
    ctx.links = () => linksOf(K, instanceId);
    ctx.onLinks = (fn) => {
      const fire = (w) => { if (disposed || !w) return; const src = w.src && w.src.instanceId, dst = w.dst && w.dst.instanceId; if (src === instanceId || dst === instanceId || w.instanceId) safe(() => fn(ctx.links())); };
      ['kernel:wire-registered', 'kernel:wire-removed', 'kernel:organism-unmounted'].forEach(t => unsubs.push(bus.subscribe(t, fire, instanceId)));
      safe(() => fn(ctx.links()));
    };

    // the stop signal reaches every tool regardless of its declared hooks (a kernel signal, not a wire)
    unsubs.push(bus.subscribe('kernel:silence', (p) => { if (!disposed && (!p.instanceId || p.instanceId === instanceId)) ctx.silenceNow(p); }, instanceId));
    // a stop request from this tool's own window (its ■)
    ctx.onUI('silence', null, () => K.silence({ hard: true, instanceId, reason: 'tool' }));

    // standard ui hooks
    ctx.onUI('config_change', { type: 'object', required: ['key'] }, (p) => params.set(p.key, p.value));
    ctx.onUI('preset_load', { type: 'object', required: ['name'] }, (p) => ctx.presets.load(p.name));
    ctx.onUI('preset_save', { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }, (p) => ctx.presets.save(p.name, { extra: p.extra }));
    ctx.onUI('preset_put', { type: 'object', required: ['name', 'value'] }, (p) => ctx.presets.put(String(p.name), p.value));
    ctx.onUI('preset_delete', { type: 'object', required: ['name'] }, (p) => ctx.presets.remove(String(p.name)));
    ctx.onUI('preset_rename', { type: 'object', required: ['from', 'to'] }, (p) => ctx.presets.rename(String(p.from), String(p.to)));
    ctx.onUI('preset_apply', { type: 'object', required: ['params'] }, (p) => { params.setMany(p.params); if (p.extra && ctx.loadExtra) ctx.loadExtra(p.extra, { preset: true }); ctx.syncUI(); });
    ctx.onUI('request_state', null, () => ctx.syncUI());
    // domain extensions (in registration order)
    const api = { fault, safe, addState: (fn) => stateContribs.push(fn) };
    extensions.forEach(x => { if (x.ctx) x.ctx(ctx, api); });
    // user presets from IndexedDB
    IDB.get('presets', descriptor.id).then(all => { if (all && !disposed) { Object.assign(userPresets, Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v]))); ctx.syncUI(); } });

    return ctx;
  }

  const SDK = global.OrganismSDK = {
    create, STD, STD_UI_HOOKS, ASSET_SCHEMA, IDB,
    linksOf,
    extend(x) {
      if (!x || !x.id || extensions.some(e => e.id === x.id)) return false;
      extensions.push(x);
      Object.keys(x.std || {}).forEach(k => { if (!STD[k]) STD[k] = x.std[k]; });
      (x.uiHooks || []).forEach(u => { if (!STD_UI_HOOKS.includes(u)) STD_UI_HOOKS.push(u); });
      Object.keys(x.statics || {}).forEach(k => { if (!(k in SDK)) SDK[k] = x.statics[k]; });
      return true;
    },
    extensions: () => extensions.map(e => e.id),
  };
})(typeof window !== 'undefined' ? window : globalThis);
