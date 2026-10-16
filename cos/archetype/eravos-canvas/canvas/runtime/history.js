/* ERAVOS runtime — history.js → window.History (undo / redo, spec eravos.phase11-1-undo). Domain-free.
 * Records what the USER does on the canvas, for any organism — including ones future packs add:
 *   state   — a window's own content (params + extra): snapshot before its first ui: action, settle 450 ms, snapshot after
 *   spawn / close — windows (a close keeps state, position and its wires) · wire — connect / disconnect
 * Steps starting within 150 ms of each other undo together. Recipes and workspace restores are not recorded
 * (history clears after them). Everything is applied through the organisms' own serialize/deserialize. */
(function (global) {
  'use strict';
  const MAX = 200, SETTLE = 450, GROUP = 150;
  // step names: an organism may name its own ui hooks (descriptor.ui_hook_labels); otherwise the hook, humanised
  const GENERIC = { config_change: 'setting', preset_load: 'preset' };

  function create(K) {
    const F = global.OrganismFactory;
    const undo = [], redo = [], listeners = new Set(), open = new Map(), closing = new Set();
    let applying = 0, suspended = 0, suspendTimer = null;
    const label = (id) => { const r = K.registry.get(id); return r ? (r.descriptor.label || r.organism_id) : 'window'; };
    const mine = (id) => { const r = F.handle(id); return r && r.K === K && !r.ephemeral ? r : null; };
    function snap(id) { const r = mine(id); if (!r) return null; try { return JSON.stringify(r.ctx.serialize()); } catch (e) { return null; } }
    const changed = () => listeners.forEach(fn => { try { fn(api.state()); } catch (e) {} });
    function push(step) {
      const last = undo[undo.length - 1];
      if (last && step.t0 - last.t1 <= GROUP && !last.sealed) { last.steps.push(step); last.t1 = Math.max(last.t1, step.t0); last.label = last.label || step.label; }
      else { undo.push({ label: step.label, steps: [step], t0: step.t0, t1: step.t0 }); if (undo.length > MAX) undo.shift(); }
      redo.length = 0; changed();
    }
    const quiet = () => applying || suspended;

    // ---- window content: every ui:<hook>:<instance> publish, seen BEFORE it is delivered
    const untap = K.bus.tap((topic, payload) => {
      if (quiet() || topic.charCodeAt(0) !== 117 || !topic.startsWith('ui:')) return;
      if (payload && payload._auto) return; // 3.36: a change marked _auto is automation playing back, not an edit — no undo step
      const i = topic.indexOf(':', 3); if (i < 0) return;
      const hook = topic.slice(3, i), id = topic.slice(i + 1);
      if (!mine(id)) return;
      let o = open.get(id);
      if (!o) { const before = snap(id); if (before == null) return; o = { before, hook, t0: performance.now() }; open.set(id, o); }
      o.hook = hook; // name the step after the burst's LAST action (a click may audition first, then edit)
      clearTimeout(o.timer); o.timer = setTimeout(() => settle(id), SETTLE);
    });
    function settle(id) {
      const o = open.get(id); if (!o) return; open.delete(id); clearTimeout(o.timer);
      const after = snap(id); if (after == null || after === o.before) return;
      const r = K.registry.get(id), d = r && F.def(r.organism_id), names = (d && d.ui_hook_labels) || {}; // the factory keeps the full definition
      push({ kind: 'state', id, before: o.before, after, t0: o.t0, label: `${label(id)} — ${names[o.hook] || GENERIC[o.hook] || String(o.hook).replace(/_/g, ' ')}` });
    }
    function flush() { Array.from(open.keys()).forEach(settle); }

    // ---- structure: windows and wires
    function capture(id) {
      const r = mine(id); if (!r) return null;
      const rect = global.CanvasWM && global.CanvasWM.rectOf ? global.CanvasWM.rectOf(id) : null;
      const wires = K.wires.list().filter(w => w.src.instanceId === id || w.dst.instanceId === id).map(w => ({ src: Object.assign({}, w.src), dst: Object.assign({}, w.dst), wire_type: w.wire_type }));
      let state = null; try { state = r.ctx.serialize(); } catch (e) {}
      return { organism: r.id, instanceId: id, state: state ? JSON.parse(JSON.stringify(state)) : null, rect, wires };
    }
    const unF = F.onChange((ev, id) => {
      if (ev === 'before-unmount') { if (quiet()) return; const c = capture(id); if (!c) return; closing.add(id); if (open.has(id)) settle(id); push({ kind: 'close', c, t0: performance.now(), label: `Close ${label(id)}` }); }
      else if (ev === 'unmount') { closing.delete(id); open.delete(id); }
      else if (ev === 'spawn') { if (quiet() || !mine(id)) return; const c = capture(id); if (c) push({ kind: 'spawn', c, t0: performance.now(), label: `Add ${label(id)}` }); }
    });
    const same = (a, b) => a.src.instanceId === b.src.instanceId && a.src.hookId === b.src.hookId && a.dst.instanceId === b.dst.instanceId && a.dst.hookId === b.dst.hookId;
    const unW1 = K.bus.subscribe('kernel:wire-registered', (w) => { if (quiet() || !w || !w.src) return; push({ kind: 'wire', add: true, w: { src: Object.assign({}, w.src), dst: Object.assign({}, w.dst), wire_type: w.wire_type }, t0: performance.now(), label: `Connect ${label(w.src.instanceId)} → ${label(w.dst.instanceId)}` }); }, 'history');
    const unW2 = K.bus.subscribe('kernel:wire-removed', (w) => { if (quiet() || !w || !w.src) return; if (closing.has(w.src.instanceId) || closing.has(w.dst.instanceId)) return; push({ kind: 'wire', add: false, w: { src: Object.assign({}, w.src), dst: Object.assign({}, w.dst), wire_type: w.wire_type }, t0: performance.now(), label: `Disconnect ${label(w.src.instanceId)} → ${label(w.dst.instanceId)}` }); }, 'history');
    // ---- recipes and workspace restores are a fresh start, not steps
    function pause() { suspended++; clearTimeout(suspendTimer); suspendTimer = setTimeout(() => { suspended = 0; }, 20000); }
    function resumeAndClear() { setTimeout(() => { suspended = Math.max(0, suspended - 1); if (!suspended) clearTimeout(suspendTimer); api.clear(); }, SETTLE + 50); }
    const unR = [K.bus.subscribe('recipe:start', pause, 'history'), K.bus.subscribe('recipe:done', resumeAndClear, 'history'),
      K.bus.subscribe('workspace:restoring', pause, 'history'), K.bus.subscribe('workspace:restored', resumeAndClear, 'history')];

    // ---- apply
    function respawn(c) {
      const id = F.spawn(c.organism, Object.assign({ instanceId: K.registry.has(c.instanceId) ? undefined : c.instanceId, state: c.state, K }, c.rect || {}));
      if (!id) return null;
      if (id !== c.instanceId) c.instanceId = id;
      c.wires.forEach(w => { const fix = (e) => Object.assign({}, e, { instanceId: e.instanceId === c.instanceId || !K.registry.has(e.instanceId) ? id : e.instanceId }); K.wires.register({ src: fix(w.src), dst: fix(w.dst), wire_type: w.wire_type }); });
      return id;
    }
    function removeWire(w) { const x = K.wires.list().find(y => same(y, w)); if (x) K.wires.remove(x.wire_id, 'undo'); }
    function run(step, dir) { // dir: 'undo' | 'redo'
      const u = dir === 'undo';
      if (step.kind === 'state') { const r = mine(step.id); if (r) r.ctx.deserialize(JSON.parse(u ? step.before : step.after)); }
      else if (step.kind === 'spawn') { if (u) { const c = capture(step.c.instanceId); if (c) step.c = c; F.close(step.c.instanceId, 'undo'); } else respawn(step.c); }
      else if (step.kind === 'close') { if (u) respawn(step.c); else F.close(step.c.instanceId, 'undo'); }
      else if (step.kind === 'wire') { if (step.add === u) removeWire(step.w); else K.wires.register({ src: step.w.src, dst: step.w.dst, wire_type: step.w.wire_type }); }
    }
    function apply(from, to, dir) {
      flush(); const g = from.pop(); if (!g) return null;
      applying++;
      try { (dir === 'undo' ? g.steps.slice().reverse() : g.steps).forEach(s => { try { run(s, dir); } catch (e) { K.fault('RUNTIME_003', { message: `${dir} ${s.label}: ${e.message}` }); } }); }
      finally { setTimeout(() => { applying--; }, 0); }
      g.sealed = true; to.push(g); changed(); return g.label;
    }
    const api = {
      undo: () => apply(undo, redo, 'undo'), redo: () => apply(redo, undo, 'redo'),
      clear() { open.forEach(o => clearTimeout(o.timer)); open.clear(); undo.length = 0; redo.length = 0; changed(); },
      flush, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      state: () => ({ canUndo: undo.length > 0, canRedo: redo.length > 0, undoLabel: undo.length ? undo[undo.length - 1].label : null, redoLabel: redo.length ? redo[redo.length - 1].label : null, size: undo.length }),
      dispose() { untap(); unF && unF(); unW1(); unW2(); unR.forEach(u => u()); api.clear(); },
    };
    return api;
  }
  global.History = { create };
})(typeof window !== 'undefined' ? window : globalThis);
