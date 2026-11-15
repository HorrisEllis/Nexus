/* ERAVOS runtime — mods.js → window.Mods (spec eravos.links-and-mods). Domain-free.
 * ANY small tool can live inside another one. A tool declares insert SLOTS; a slot hosts a chain of other tools (its
 * mods) — each a full tool of its own, running without a window, its controls on a card in the host's window.
 *   descriptor.slots  [{ id, label, wire_type, accepts?: { provides?, category?, not?: [ids] }, max? }]
 * What the runtime adds for every slot (at define time):
 *   hooks  slot.<id>.send (out) and slot.<id>.return (in) — internal: no rail, wired by the runtime only
 *   param  mods: [{ uid, slot, tool, bypass, state }] — hidden; saved, undone and loaded like any other setting
 * The tool's engine opens the ports (its domain gives it the helper — e.g. ctx.slot(id, fromNode) → node).
 * Chain wiring: send → mod 1 → mod 2 → … → return, as kernel wires with meta.insert (not cables, not a cycle).
 * A hosted mod's own edits count as its host's (one undo step on the host). */
(function (global) {
  'use strict';
  const MAX_DEPTH = 3;
  const live = new Map();   // hostId → { kids: Map(uid → childId), wires: [wire ids], depth }
  let seq = 0;
  const uid = () => 'm' + Date.now().toString(36).slice(-4) + (++seq).toString(36) + Math.random().toString(36).slice(2, 4);
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // ---------------------------------------------------------------- definition: slots → hooks + the mods param
  function shape(desc) {
    if (!desc.slots || !desc.slots.length || desc._slotsShaped) return;
    desc._slotsShaped = true;
    desc.slots.forEach(sl => {
      const like = (desc.hooks || []).find(h => h.wire_type === sl.wire_type) || {};
      const base = { wire_type: sl.wire_type, event_type: like.event_type || sl.wire_type, contract_version: like.contract_version || '1.0.0', schema: {}, failure_mode: 'PORT_001', rail: false, internal: true, slot: sl.id };
      desc.hooks.push(Object.assign({ hook_id: `slot.${sl.id}.send`, hook_type: 'emitter', direction: 'out', port: `slot.${sl.id}.send`, intent: `into the ${sl.label || sl.id} mods` }, base));
      desc.hooks.push(Object.assign({ hook_id: `slot.${sl.id}.return`, hook_type: 'receiver', direction: 'in', port: `slot.${sl.id}.return`, intent: `back from the ${sl.label || sl.id} mods` }, base));
    });
    if (!desc.config.some(c => c.key === 'mods')) desc.config.push({ key: 'mods', type: 'array', default: [], hidden: true, label: 'Mods', group: 'MODS' });
  }
  const io = (d, wt, dir) => (d.hooks || []).find(h => h.wire_type === wt && h.direction === dir && !h.internal);

  // which tools can go in this slot: same signal in AND out, not a singleton, not the host itself, matching accepts
  function compatible(hostId, slotId) {
    const F = global.OrganismFactory, rec = F.handle(hostId); if (!rec) return [];
    const sl = (rec.def.slots || []).find(s => s.id === slotId); if (!sl) return [];
    const acc = sl.accepts || {};
    return F.defined().filter(d => d.id !== rec.id && !d.singleton && !d.system && !d.noMod && io(d, sl.wire_type, 'in') && io(d, sl.wire_type, 'out')
      && (!acc.provides || (d.provides || []).includes(acc.provides)) && (!acc.category || String(d.category || '').toLowerCase() === String(acc.category).toLowerCase())
      && !(acc.not || []).includes(d.id) && (!global.Catalog || !global.Catalog.installed || global.Catalog.installed(d.id) !== false))
      .map(d => ({ id: d.id, label: d.label, icon: d.icon || '', category: d.category || '', blurb: d.blurb || '' }))
      .sort((a, b) => (a.category + a.label).localeCompare(b.category + b.label));
  }

  // ---------------------------------------------------------------- the live chain
  function list(hostId) { const r = global.OrganismFactory.handle(hostId); return r && Array.isArray(r.ctx.params.get('mods')) ? r.ctx.params.get('mods') : []; }
  function childOf(hostId, u) { const L = live.get(hostId); return L ? L.kids.get(u) || null : null; }
  function entries(hostId) { return list(hostId).map(e => Object.assign({}, e, { child: childOf(hostId, e.uid) })); }

  function rewire(hostId) {
    const F = global.OrganismFactory, rec = F.handle(hostId), L = live.get(hostId); if (!rec || !L) return;
    const K = rec.K;
    L.wires.forEach(w => K.wires.remove(w, 'mods')); L.wires = [];
    (rec.def.slots || []).forEach(sl => {
      const chain = list(hostId).filter(e => e.slot === sl.id && !e.bypass).map(e => L.kids.get(e.uid)).filter(Boolean);
      if (!chain.length) return;
      let from = { instanceId: hostId, hookId: `slot.${sl.id}.send` };
      const link = (dst) => { const r = K.wires.register({ src: from, dst, meta: { insert: true, host: hostId, slot: sl.id } }); if (r.ok) L.wires.push(r.wire_id); else K.fault('RUNTIME_003', { instance_id: hostId, message: `mod chain: ${r.fault && r.fault.message}` }); };
      chain.forEach(cid => {
        const cd = F.handle(cid).def, i = io(cd, sl.wire_type, 'in'), o = io(cd, sl.wire_type, 'out');
        link({ instanceId: cid, hookId: i.hook_id }); from = { instanceId: cid, hookId: o.hook_id };
      });
      link({ instanceId: hostId, hookId: `slot.${sl.id}.return` });
    });
    K.bus.publish('canvas:mods', { instanceId: hostId });
  }

  // bring the live children in line with the host's mods param (after an add, undo, preset, load)
  function reconcile(hostId) {
    const F = global.OrganismFactory, rec = F.handle(hostId); if (!rec || rec.unmounted || !(rec.def.slots || []).length) return;
    const K = rec.K;
    let L = live.get(hostId);
    if (!L) { const parent = rec.hostId && live.get(rec.hostId); L = { kids: new Map(), wires: [], depth: parent ? parent.depth + 1 : 0 }; live.set(hostId, L); hostSerialize(rec); }
    const want = list(hostId), keep = new Set(want.map(e => e.uid));
    L.kids.forEach((cid, u) => { if (!keep.has(u)) { L.kids.delete(u); F.close(cid, 'mod-removed'); } });
    want.forEach(e => {
      let cid = L.kids.get(e.uid);
      if (!cid) {
        if (L.depth >= MAX_DEPTH) { K.fault('RUNTIME_002', { instance_id: hostId, message: `mods go ${MAX_DEPTH} deep at most` }); return; }
        if (!F.def(e.tool)) { K.fault('MOUNT_001', { instance_id: hostId, message: `mod ${e.tool} is not installed` }); return; }
        cid = F.spawn(e.tool, { K, ephemeral: true, headless: true, state: e.state || undefined });
        if (!cid) return;
        const c = F.handle(cid); c.hostId = hostId; c.modUid = e.uid; L.kids.set(e.uid, cid);
        if ((c.def.slots || []).length) host(cid);   // a mod may host mods of its own
      } else if (e.state) {
        const c = F.handle(cid); let now = null; try { now = JSON.stringify(c.ctx.serialize().params); } catch (x) {}
        if (now !== JSON.stringify(e.state.params)) c.ctx.deserialize(clone(e.state));   // an undo / preset brought older settings
      }
    });
    rewire(hostId);
  }
  // a host's save always carries its mods' current settings (they change in their own engines)
  function hostSerialize(rec) {
    if (rec._modsWrapped) return; rec._modsWrapped = true;
    const orig = rec.ctx.serialize.bind(rec.ctx);
    rec.ctx.serialize = () => { refresh(rec.instanceId); return orig(); };
  }
  function refresh(hostId) {
    const F = global.OrganismFactory, rec = F.handle(hostId), L = live.get(hostId); if (!rec || !L) return;
    const cur = list(hostId); if (!cur.length) return;
    const next = cur.map(e => { const cid = L.kids.get(e.uid), c = cid && F.handle(cid); return c ? Object.assign({}, e, { state: c.ctx.serialize() }) : e; });
    rec.ctx.params.set('mods', next, { silent: true, noEcho: true });
  }

  // ---------------------------------------------------------------- edits (through the host's own settings → undoable)
  function commit(hostId, next) { const r = global.OrganismFactory.handle(hostId); if (!r) return; refreshQuiet(hostId); r.K.bus.publish('ui:config_change:' + hostId, { key: 'mods', value: next }); }
  function refreshQuiet(hostId) { try { refresh(hostId); } catch (e) {} }
  function add(hostId, slotId, tool, o) {
    o = o || {};
    const rec = global.OrganismFactory.handle(hostId); if (!rec) return null;
    const K = rec.K, sl = (rec.def.slots || []).find(s => s.id === slotId); if (!sl) { K.fault('RUNTIME_002', { instance_id: hostId, message: `no mod slot ${slotId}` }); return null; }
    if (!compatible(hostId, slotId).some(t => t.id === tool)) { K.fault('RUNTIME_002', { instance_id: hostId, message: `${tool} does not fit the ${sl.label || slotId} slot` }); return null; }
    refreshQuiet(hostId);
    const cur = list(hostId).slice(), inSlot = cur.filter(e => e.slot === slotId);
    if (sl.max && inSlot.length >= sl.max) { K.fault('RUNTIME_002', { instance_id: hostId, message: `${sl.label || slotId} holds ${sl.max} mods` }); return null; }
    const e = { uid: uid(), slot: slotId, tool, bypass: false, state: o.state || null };
    let at = cur.length; if (typeof o.at === 'number') { const before = inSlot[o.at]; if (before) at = cur.indexOf(before); }
    cur.splice(at, 0, e); commit(hostId, cur);
    return e.uid;
  }
  function remove(hostId, u) { refreshQuiet(hostId); commit(hostId, list(hostId).filter(e => e.uid !== u)); }
  function bypass(hostId, u, on) { refreshQuiet(hostId); commit(hostId, list(hostId).map(e => e.uid === u ? Object.assign({}, e, { bypass: on === undefined ? !e.bypass : !!on }) : e)); }
  function move(hostId, u, by) {
    refreshQuiet(hostId);
    const cur = list(hostId).slice(), i = cur.findIndex(e => e.uid === u); if (i < 0) return;
    let j = i + by; while (j >= 0 && j < cur.length && cur[j].slot !== cur[i].slot) j += Math.sign(by);
    if (j < 0 || j >= cur.length) return;
    const [x] = cur.splice(i, 1); cur.splice(j, 0, x); commit(hostId, cur);
  }

  // ---------------------------------------------------------------- in and out of a tool, with its cables stitched
  // the plain (non-insert) wires of one signal type touching a tool's main in / out
  const plain = (K, id, wt) => K.wires.list().filter(w => !(w.meta && w.meta.insert) && w.wire_type === wt && (w.src.instanceId === id || w.dst.instanceId === id));
  // ⇱ a mod becomes its own window, wired straight after its host (what the host fed now goes through it)
  function popOut(hostId, u, o) {
    o = o || {};
    const F = global.OrganismFactory, rec = F.handle(hostId); if (!rec) return null;
    const K = rec.K, e = list(hostId).find(x => x.uid === u); if (!e) return null;
    const sl = (rec.def.slots || []).find(x => x.id === e.slot), wt = sl.wire_type, cid = childOf(hostId, u);
    const state = cid ? F.handle(cid).ctx.serialize() : e.state;
    remove(hostId, u);
    const r = global.CanvasWM && global.CanvasWM.rectOf ? global.CanvasWM.rectOf(hostId) : null;
    const id = F.spawn(e.tool, Object.assign({ K, state: state || undefined }, o.headless ? { headless: true } : {}, r ? { x: r.x + r.w + 40, y: r.y } : {}));
    if (!id) return null;
    const ho = io(rec.def, wt, 'out'), d = F.handle(id).def, ni = io(d, wt, 'in'), no = io(d, wt, 'out');
    if (ho && ni && no) {
      const outs = plain(K, hostId, wt).filter(w => w.src.instanceId === hostId && w.src.hookId === ho.hook_id);
      outs.forEach(w => { K.wires.remove(w.wire_id, 'mod-pop-out'); K.wires.register({ src: { instanceId: id, hookId: no.hook_id }, dst: Object.assign({}, w.dst) }); });
      K.wires.register({ src: { instanceId: hostId, hookId: ho.hook_id }, dst: { instanceId: id, hookId: ni.hook_id } });
    }
    return id;
  }
  // ⇲ a tool already on the canvas moves inside another: what fed it now feeds what it fed, and it plays inside the host
  function absorb(hostId, slotId, instId) {
    const F = global.OrganismFactory, rec = F.handle(hostId), it = F.handle(instId); if (!rec || !it || instId === hostId || it.hostId) return null;
    const K = rec.K, sl = (rec.def.slots || []).find(x => x.id === slotId); if (!sl) return null;
    if (!compatible(hostId, slotId).some(t => t.id === it.id)) { K.fault('RUNTIME_002', { instance_id: hostId, message: `${it.def.label} does not fit the ${sl.label || slotId} slot` }); return null; }
    const wt = sl.wire_type, i = io(it.def, wt, 'in'), o = io(it.def, wt, 'out'), ws = plain(K, instId, wt);
    const from = ws.filter(w => w.dst.instanceId === instId && w.dst.hookId === i.hook_id).map(w => Object.assign({}, w.src));
    const to = ws.filter(w => w.src.instanceId === instId && w.src.hookId === o.hook_id).map(w => Object.assign({}, w.dst));
    const state = it.ctx.serialize();
    const u = add(hostId, slotId, it.id, { state }); if (!u) return null;
    F.close(instId, 'moved-inside');
    from.forEach(a => to.forEach(b => { if (a.instanceId !== b.instanceId) K.wires.register({ src: a, dst: b }); }));
    return u;
  }
  // tools on the canvas that could move into this slot (not the host, not already inside something)
  function movable(hostId, slotId) {
    const F = global.OrganismFactory, rec = F.handle(hostId); if (!rec) return [];
    const ok = new Set(compatible(hostId, slotId).map(t => t.id));
    return F.handles().filter(r => r.K === rec.K && r.instanceId !== hostId && !r.hostId && !r.service && !r.ephemeral && ok.has(r.id)).map(r => ({ instanceId: r.instanceId, id: r.id, label: r.def.label, icon: r.def.icon || '' }));
  }

  // ---------------------------------------------------------------- lifecycle (every universe: tests, previews, the canvas)
  function host(id) {
    const rec = global.OrganismFactory.handle(id); if (!rec) return;
    if (!rec._modsHosting) { rec._modsHosting = true; rec.ctx.params.onChange('mods', () => reconcile(id)); }
    reconcile(id);
  }
  function watch() {
    const F = global.OrganismFactory; if (!F || watch.on) return; watch.on = true;
    F.onDefine(shape);
    F.onChange((ev, id) => {
      const rec = F.handle(id);
      if (ev === 'spawn' && rec && !rec.ephemeral && (rec.def.slots || []).length) host(id);
      else if (ev === 'unmount') { const L = live.get(id); if (!L) return; live.delete(id); L.kids.forEach(cid => F.close(cid, 'host-closed')); }
    });
  }
  function init(K) { watch(); if (global.ModsRack) global.ModsRack.init(K || global.Kernel); }
  watch();

  global.Mods = { init, shape, compatible, add, remove, bypass, move, popOut, absorb, movable, entries, list, childOf, reconcile, refresh, hostOf: (id) => { const r = global.OrganismFactory.handle(id); return (r && r.hostId) || null; } };
})(typeof window !== 'undefined' ? window : globalThis);
