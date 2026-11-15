/* ERAVOS runtime — expansion.js → window.Expansion (spec eravos.shell-expansion)
 * The canvas starts AGNOSTIC: the top bar holds only the skeleton (Start, Add, undo, Library, Ports, Fit, Clear).
 * Domains do not paint the shell when they install. They register:
 *   unit({ id, label, icon, domain, describes, requires:[unitIds], build(S) })  — one piece of UI expansion
 *                                                                               (a toolbar group, a key binding,
 *                                                                               a service the tools rely on)
 *   mode({ id, label, icon, accent, blurb, domain, units:[…], categories:[…], brand:{tagline, tip} })
 *   needs(fn(descriptor) → { mode, units:[…], services:[{id,label}], notes:[…] } | null)  — derives a tool's
 *                                                                               dependency list from its hooks
 * A unit is built the first time something needs it: entering a mode builds all of the mode's units; adding a
 * tool builds only the units that tool depends on (factory before-spawn, recipe before-run, workspace restore).
 * deps(id) is the one dependency list the Add menu, the docs generator and the tests all read.
 * 3.91 "when clearing the canvas should remove all dependencies": what a unit adds when it is built (the elements it puts in the shell's
 * slots, the keys it binds) is recorded, so teardown(id) takes it away again and reset() returns the shell to agnostic — nothing built,
 * no mode, no domain touched. A unit may also bring its own teardown(S). graph() is the whole dependency graph, for the page that draws it. */
(function (global) {
  'use strict';

  function create(S, K) {
    const units = new Map(), modes = new Map(), resolvers = [];
    const built = new Set(), active = new Set(), touched = new Set();
    const listeners = new Set();
    const changed = (what) => { listeners.forEach(fn => { try { fn(what); } catch (e) {} }); K.bus.publish('shell:expanded', { units: Array.from(built), modes: Array.from(active) }); };

    function closure(ids, out) {
      out = out || [];
      (ids || []).forEach(id => {
        if (out.includes(id)) return;
        const u = units.get(id); if (!u) return;
        closure(u.requires, out); out.push(id);
      });
      return out;
    }
    function expand(ids, reason) {
      const order = closure(ids).filter(id => !built.has(id));
      if (!order.length) return [];
      const did = [];
      order.forEach(id => {
        const u = units.get(id); built.add(id);
        const before = slotKids(), keysBefore = S.boundKeys ? S.boundKeys() : [];
        try { if (typeof u.build === 'function') u.build(S); did.push(id); }
        catch (e) { K.fault('RUNTIME_003', { message: `unit ${id}: ${e.message}` }); }
        made.set(id, { nodes: slotKids().filter(n => !before.includes(n)), keys: (S.boundKeys ? S.boundKeys() : []).filter(k => !keysBefore.includes(k)) });
        if (u.domain) touched.add(u.domain);
      });
      if (did.length) { K.ledger.write('shell_expanded', { units: did, reason: reason || 'need' }); changed({ units: did, reason }); }
      return did;
    }
    function enterMode(id) {
      const m = modes.get(id); if (!m) return false;
      const fresh = !active.has(id);
      active.add(id); if (m.domain) touched.add(m.domain);
      if (m.brand) S.brand(Object.assign({}, m.brand, { categories: m.categories || [] }));
      else if (m.categories) S.brand({ categories: m.categories });
      expand(m.units || [], 'mode ' + id);
      if (fresh) { K.ledger.write('shell_mode', { mode: id }); changed({ mode: id }); }
      return true;
    }
    function leaveMode(id) { if (active.delete(id)) changed({ left: id }); }
    // 3.91 what a unit put into the shell (to take away again)
    const made = new Map();
    const doc = global.document;
    function slotKids() { if (!doc) return []; const out = []; doc.querySelectorAll('[id^="slot-"]').forEach(sl => Array.from(sl.children).forEach(c => out.push(c))); return out; }
    function teardown(id) {
      if (!built.has(id)) return false; const u = units.get(id), m = made.get(id) || { nodes: [], keys: [] };
      try { if (u && typeof u.teardown === 'function') u.teardown(S); } catch (e) { K.fault('RUNTIME_003', { message: `unit ${id} teardown: ${e.message}` }); }
      m.nodes.forEach(n => { try { n.remove(); } catch (e) {} }); m.keys.forEach(k => { if (S.unbindKey) S.unbindKey(k); });
      made.delete(id); built.delete(id); return true;
    }
    // back to agnostic: every unit taken away (the ones others need last), no mode, no domain touched
    function reset(reason) {
      const order = closure(Array.from(built)).reverse(), gone = order.filter(teardown);
      const left = Array.from(active); active.clear(); touched.clear();
      if (gone.length || left.length) { K.ledger.write('shell_reset', { units: gone, modes: left, reason: reason || 'reset' }); changed({ reset: true, units: gone, modes: left }); }
      return { units: gone, modes: left };
    }
    // only what the tools on the canvas still need stays built
    function prune(reason) {
      const need = new Set(), tools = (K.registry.list() || []).filter(r => !(r.descriptor && r.descriptor.system)).map(r => r.organism_id);
      tools.forEach(t => { const dd = deps(t); if (dd) dd.units.forEach(x => need.add(x)); });
      const gone = closure(Array.from(built)).reverse().filter(id => !need.has(id)).filter(teardown);
      if (gone.length) { K.ledger.write('shell_pruned', { units: gone, reason: reason || 'prune' }); changed({ pruned: gone }); }
      return gone;
    }
    // the whole graph: domains → modes → units (and what each unit requires) ← tools on the canvas, and the wires between tools
    function graph() {
      const tools = (K.registry.list() || []).filter(r => !(r.descriptor && r.descriptor.system)).map(r => ({ id: r.instance_id, tool: r.organism_id, label: (r.descriptor && r.descriptor.label) || r.organism_id, deps: deps(r.organism_id) }));
      const needBy = {}; tools.forEach(t => (t.deps ? t.deps.units : []).forEach(u => { (needBy[u] = needBy[u] || []).push(t.id); }));
      return {
        domains: Array.from(touched),
        modes: Array.from(active).map(id => { const m = modes.get(id) || {}; return { id, label: m.label || id, domain: m.domain || null, units: (m.units || []).slice() }; }),
        units: Array.from(built).map(id => { const u = units.get(id) || {}; return { id, label: u.label || id, icon: u.icon || '', domain: u.domain || null, requires: (u.requires || []).slice(), neededBy: needBy[id] || [] }; }),
        tools: tools.map(t => ({ id: t.id, tool: t.tool, label: t.label, mode: t.deps ? t.deps.mode : null, units: t.deps ? t.deps.units.slice() : [] })),
        wires: ((K.wires && K.wires.list && K.wires.list()) || []).map(w => ({ from: w.src && w.src.instanceId, to: w.dst && w.dst.instanceId, type: w.wire_type })),
      };
    }

    function labelOfUnit(id) { const u = units.get(id); return u ? { id, label: u.label, icon: u.icon || '', describes: u.describes || '', built: built.has(id) } : { id, label: id, icon: '', describes: '', built: false }; }

    // ---------------------------------------------------------------- the dependency list of one tool
    function deps(idOrDesc) {
      const F = global.OrganismFactory;
      const d = typeof idOrDesc === 'string' ? F.def(idOrDesc) : idOrDesc;
      if (!d) return null;
      const out = { tool: d.id, label: d.label, domain: d.domain || null, mode: null, units: [], services: [], inputs: [], outputs: [], works_with: [], notes: [], permissions: (d.permissions || []).slice() };
      const add = (arr, v, key) => { if (v === undefined || v === null) return; const k = key ? v[key] : v; if (!arr.some(x => (key ? x[key] : x) === k)) arr.push(v); };
      resolvers.forEach(fn => {
        let r = null; try { r = fn(d); } catch (e) { K.fault('RUNTIME_003', { message: `needs resolver: ${e.message}` }); }
        if (!r) return;
        if (r.mode && !out.mode) out.mode = r.mode;
        (r.units || []).forEach(u => add(out.units, u));
        (r.services || []).forEach(s => add(out.services, typeof s === 'string' ? { id: s, label: s } : s, 'id'));
        (r.notes || []).forEach(n => add(out.notes, n));
      });
      const ex = d.needs || {};
      if (ex.mode) out.mode = ex.mode;
      (ex.units || []).forEach(u => add(out.units, u));
      (ex.services || []).forEach(s => add(out.services, typeof s === 'string' ? { id: s, label: s } : s, 'id'));
      (ex.notes || []).forEach(n => add(out.notes, n));
      out.units = closure(out.units);
      out.toolbar = out.units.map(labelOfUnit);
      // ports — straight from the declared hooks (the contract), ambient broadcasts listed as "follows"
      const WS = global.WireSystem, amb = (h) => WS && WS.isAmbient && WS.isAmbient(h.event_type);
      (d.hooks || []).forEach(h => {
        const row = { hook: h.hook_id, kind: h.wire_type === 'event_bus' ? (h.event_type || 'event') : h.wire_type, port: h.port || null, intent: h.intent || '', ambient: !!amb(h) };
        if (h.direction === 'in' || h.direction === 'inout') out.inputs.push(row);
        if (h.direction === 'out' || h.direction === 'inout') out.outputs.push(row);
      });
      // works with: explicit first, then tools that close one of this tool's point-to-point event contracts
      (ex.works_with || []).forEach(id => { if (F.def(id)) add(out.works_with, id); });
      const mine = (d.hooks || []).filter(h => h.wire_type === 'event_bus' && h.event_type && !amb(h));
      F.defined().forEach(o => {
        if (o.id === d.id || out.works_with.length >= 8) return;
        const match = (o.hooks || []).some(oh => oh.wire_type === 'event_bus' && mine.some(h => h.event_type === oh.event_type && h.direction !== oh.direction && !amb(oh)));
        if (match) add(out.works_with, o.id);
      });
      const m = out.mode && modes.get(out.mode);
      out.modeLabel = m ? m.label : null;
      out.pending = out.toolbar.filter(u => !u.built);
      return out;
    }

    // which mode a recipe belongs to: the modes its tools need (recipes carry no domain words of their own)
    function recipeModes(r) {
      const R = global.Recipes, set = new Set();
      (R ? R.needs(r) : []).forEach(id => { const dd = deps(id); if (dd && dd.mode) set.add(dd.mode); });
      if (r.mode) set.add(r.mode);
      return Array.from(set);
    }
    function expandFor(ids, reason) {
      const need = new Set();
      (ids || []).forEach(id => { const dd = deps(id); if (dd) dd.units.forEach(u => need.add(u)); });
      return expand(Array.from(need), reason);
    }

    // ---------------------------------------------------------------- wiring into the skeleton
    const F = global.OrganismFactory;
    if (F && F.onBeforeSpawn) F.onBeforeSpawn((d, o, KK) => { if (KK === K && !o.headless) expandFor([d.id], 'add ' + d.id); });
    if (global.Recipes && global.Recipes.onBeforeRun) global.Recipes.onBeforeRun((r, c) => { if (c.K === K) { recipeModes(r).forEach(enterMode); expandFor(global.Recipes.needs(r), 'recipe ' + r.id); } });
    if (global.Workspace) global.Workspace.contribute({
      id: 'shell',
      save: () => ({ modes: Array.from(active), units: Array.from(built) }),
      beforeRestore(KK, snap) {
        if (KK !== K || !snap) return;
        const st = (snap.domains || {}).shell;
        if (st) { (st.modes || []).forEach(enterMode); expand(st.units || [], 'restore'); }
        else Object.keys(snap.domains || {}).forEach(dom => { const m = Array.from(modes.values()).find(x => x.domain === dom); if (m) enterMode(m.id); }); // pre-expansion saves
        expandFor((snap.organisms || []).map(o => o.id), 'restore');
      },
    });

    return {
      unit(u) { if (!u || !u.id) return false; units.set(u.id, Object.assign({ requires: [] }, u)); return true; },
      mode(m) { if (!m || !m.id) return false; modes.set(m.id, Object.assign({ units: [], categories: [] }, m)); changed({ registered: m.id }); return true; },
      needs(fn) { if (typeof fn === 'function') resolvers.push(fn); },
      deps, expand, expandFor, enterMode, leaveMode, recipeModes,
      modes: () => Array.from(modes.values()),
      mode_: (id) => modes.get(id) || null,
      units: () => Array.from(units.values()).map(u => labelOfUnit(u.id)),
      active: () => Array.from(active),
      isActive: (id) => active.has(id),
      built: () => Array.from(built),
      isBuilt: (id) => built.has(id),
      touched: () => Array.from(touched),
      agnostic: () => built.size === 0 && active.size === 0,
      teardown, reset, prune, graph,
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  global.Expansion = { create };
})(typeof window !== 'undefined' ? window : globalThis);
