/* ERAVOS runtime — suites.js → window.Suites (spec eravos.suites, ADDENDUM 2026-10-21 · map eravos.phase48-map P48.5a/b).
 * Domain-free. A SUITE is a system of tools: suite.json (schemas/suite.schema.json) names its parts, how they wire, and scenes
 * that set every part at once. Each part stays a tool of its own. A suite on the canvas is a SUITE WINDOW (a domain's hub tool,
 * named by suite.hub), and the parts connect to it.
 * James, 2026-10-21: "like how there is 4 wub tools, but no primay system. like i want each tool to have its components as
 * tools, then they all connect to the suite, but can be mixed and matched."
 *
 * Membership is read from the wires: the members of a suite window are every window joined to it by wires (directly or through
 * each other), plus the mods living inside them — wire any tool in and it belongs; pull the wire and it doesn't. Also members:
 * the parts the suite window opened itself (config `opened`, live ones only), since a generator has no wire to the suite until
 * its instrument is here (P48.10 finding).
 * Every action is the user's own (spawn, ui:preset_load, ui:config_change, kernel wires, Mods.add), so all of it is undoable
 * and saved with the canvas.
 *   add(suite) · get(id) · list() · forTool(toolId) · outputs(suite)
 *   open(id, {K,x,y}) → the suite window · members(K, hubId) → Map(instanceId → toolId) · status(K, hubId)
 *   addPart(K, hubId, toolId, {preset?}) · build(K, hubId) · scene(K, hubId, name) · wiring(K, hubId) · mixable(id) ·
 *   macro(K, hubId, i, 0…1) · fold(K, hubId, on) — P48.8, the suite as a control panel */
(function (global) {
  'use strict';
  const suites = new Map();
  const F = () => global.OrganismFactory;
  const toast = (m, k, ms) => { if (global.Shell && global.Shell.toast) global.Shell.toast(m, k || '', ms || 2200); };
  const live = (id) => { const r = id && F().handle(id); return r && !r.unmounted ? r : null; };

  // 3.126 (his words, 2026-11-06: "Suites are tools with each component wired in" · "can you clear out suites and make them the tool
  // and its components wired together? But also the ability to create them?"): a SUITE (kind "suite", the default) is a tool and its
  // components wired together. A system of whole tools (kind "setup") is not a suite: it is offered under Start › SETUPS, opening
  // and building exactly as before (its suite window, scenes and macros are kept). Suites are also made from the canvas: what is
  // wired together is saved as a suite of your own (capture → saveUser), across domains.
  function add(s) {
    if (!s || !s.id || !Array.isArray(s.parts) || !s.parts.length) { console.warn('Suites.add: id and parts[] required', s && s.id); return false; }
    s.wiring = s.wiring || []; s.scenes = s.scenes || {}; s.kind = s.kind || 'suite';
    suites.set(s.id, s); if (s.kind === 'setup') asSetup(s); return true;
  }
  const get = (id) => suites.get(id) || null;
  const list = () => Array.from(suites.values()).filter(s => s.kind !== 'setup');
  const setups = () => Array.from(suites.values()).filter(s => s.kind === 'setup');
  const short = (t) => { t = String(t || '').split('. ')[0]; t = t.split('; ')[0]; return t.length > 90 ? t.slice(0, 88).replace(/\s+\S*$/, '') + '…' : t + (t && !/[.!?…]$/.test(t) ? '.' : ''); };
  // a setup is a Start card: the recipe op "suite" opens its window and builds every part, wired, on its starter scene
  function asSetup(s, n) {
    const R = global.Recipes; if (!R) { if ((n || 0) < 400) global.setTimeout(() => asSetup(s, (n || 0) + 1), 25); return; }
    if (!asSetup.op) { asSetup.op = true; R.defineOp('suite', async (st, { K }) => { const hub = await openAsync(st.suite, { K, x: st.x, y: st.y }); if (hub) build(K, hub); }); }
    // 3.132 a setup may carry steps of its own (its domain's recipe ops), run before it opens — the canvas passes them through, unread
    R.register({ id: 'setup:' + s.id, label: s.label, icon: s.icon, accent: s.accent, art: s.art ? (global.ERAVOS_TOOLS || '') + s.art : undefined, tagline: short(s.blurb), section: 'SETUPS', setup: s.id, steps: (Array.isArray(s.steps) ? s.steps : []).concat([{ op: 'suite', suite: s.id, x: 30, y: 20 }]) });
  }
  const forTool = (toolId) => list().filter(s => s.parts.some(p => p.tool === toolId));
  const partOf = (s, toolId) => s.parts.find(p => p.tool === toolId) || null;
  // the parts whose sound ends in the suite window: as named, else every linked part whose signal (the kind the suite window
  // takes in) does not go on to another part
  function outputs(s) {
    if (Array.isArray(s.output)) return s.output.slice();
    const t = sigType(s), feeds = new Set(s.wiring.filter(w => hookOf(w.from[0], w.from[1], t)).map(w => w.from[0]));
    return s.parts.filter(p => p.as !== 'mod' && !feeds.has(p.tool) && sigOut(F().def(p.tool), t)).map(p => p.tool);
  }
  // any part of any OTHER suite, and the suite's own parts not open yet → what "Mix in" offers
  function mixable(id) {
    const out = new Map();
    list().filter(s => s.id !== id).forEach(s => s.parts.forEach(p => { if (!out.has(p.tool) && F().def(p.tool)) out.set(p.tool, { tool: p.tool, from: s.label || s.id, role: p.role || '' }); }));
    return Array.from(out.values());
  }

  // ---------------------------------------------------------------- the ports
  const ports = (d, dir) => ((d && d.hooks) || []).filter(h => !h.internal && (h.direction === dir || h.direction === 'inout') && !/^slot\./.test(h.hook_id));
  // the suite window's input names the signal the system ends in; nothing here names a domain's wire types
  const hubIn = (d) => ports(d, 'in').find(h => h.wire_type !== 'event_bus') || null;
  const sigType = (s) => { const d = s && s.hub && F().def(s.hub), h = d && hubIn(d); return h ? h.wire_type : null; };
  const sigOut = (d, t) => (t && ports(d, 'out').find(h => h.wire_type === t)) || null;
  function hookOf(toolId, hookId, type) { const d = F().def(toolId), h = d && (d.hooks || []).find(x => x.hook_id === hookId); return h && (!type || h.wire_type === type) ? h : null; }
  function wire(K, a, ah, b, bh) {
    if (K.wires.list().some(w => w.src.instanceId === a && w.src.hookId === ah && w.dst.instanceId === b && w.dst.hookId === bh)) return true;
    const r = K.wires.register({ src: { instanceId: a, hookId: ah }, dst: { instanceId: b, hookId: bh } });
    return !!(r && r.ok);
  }
  // first pair of ports that fit, a → b (events never)
  function fitWire(K, a, b) {
    const da = live(a).def, db = live(b).def;
    for (const o of ports(da, 'out')) for (const i of ports(db, 'in')) {
      if (o.wire_type !== i.wire_type || o.wire_type === 'event_bus') continue;
      if (wire(K, a, o.hook_id, b, i.hook_id)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- the suite window and who belongs to it
  const suiteOf = (K, hubId) => { const r = live(hubId); return r ? get(r.ctx.params.get('suite')) : null; };
  // the parts this suite window opened (its config `opened`) belong until they close — a generator has no wire to the suite until
  // its instrument is here (found 2026-10-21: EDM Lab's Groove opened, joined nothing, and the starter scene opened a second one)
  const opened = (hubId) => { const r = live(hubId), v = r && r.ctx.params.get('opened'); return Array.isArray(v) ? v.filter(id => live(id)) : []; };
  function remember(K, hubId, id) { const v = opened(hubId); if (!v.includes(id)) K.bus.publish('ui:config_change:' + hubId, { key: 'opened', value: v.concat([id]) }); }
  function members(K, hubId) {
    const out = new Map(); if (!live(hubId)) return out;
    const seen = new Set([hubId].concat(opened(hubId))), todo = Array.from(seen), ws = K.wires.list();
    while (todo.length) {
      const id = todo.pop();
      ws.forEach(w => {
        const other = w.src.instanceId === id ? w.dst.instanceId : w.dst.instanceId === id ? w.src.instanceId : null;
        if (!other || seen.has(other) || !live(other)) return;
        seen.add(other); todo.push(other);
      });
    }
    seen.delete(hubId);
    seen.forEach(id => {
      out.set(id, live(id).def.id);
      if (global.Mods) global.Mods.entries(id).forEach(e => { if (e.child && live(e.child)) out.set(e.child, e.tool); });
    });
    return out;
  }
  // the instance that plays a part here (a member of this suite window), else null
  function instanceOf(K, hubId, toolId, ms) {
    ms = ms || members(K, hubId);
    for (const [id, t] of ms) if (t === toolId) return id;
    return null;
  }
  function status(K, hubId) {
    const s = suiteOf(K, hubId); if (!s) return [];
    const ms = members(K, hubId);
    const parts = s.parts.map(p => ({ part: p, instanceId: instanceOf(K, hubId, p.tool, ms), installed: !!F().def(p.tool) }));
    const named = new Set(s.parts.map(p => p.tool));
    const extra = Array.from(ms).filter(([, t]) => !named.has(t)).map(([id, t]) => ({ part: { tool: t, role: 'mixed in' }, instanceId: id, installed: true, mixed: true }));
    return parts.concat(extra);
  }
  function wiring(K, hubId) {
    const s = suiteOf(K, hubId); if (!s) return [];
    const ms = members(K, hubId), ws = K.wires.list();
    return s.wiring.map(w => {
      const a = instanceOf(K, hubId, w.from[0], ms), b = instanceOf(K, hubId, w.to[0], ms);
      const on = !!(a && b && ws.some(x => x.src.instanceId === a && x.src.hookId === w.from[1] && x.dst.instanceId === b && x.dst.hookId === w.to[1]));
      return { wire: w, on, possible: !!(a && b) };
    }).concat(outputs(s).map(t => {
      const a = instanceOf(K, hubId, t, ms), i = hubIn(live(hubId).def), o = sigOut(F().def(t), i && i.wire_type);
      const on = !!(a && o && i && ws.some(x => x.src.instanceId === a && x.dst.instanceId === hubId));
      return { wire: { from: [t, o && o.hook_id], to: ['suite', i && i.hook_id] }, on, possible: !!a, toSuite: true };
    }));
  }

  // ---------------------------------------------------------------- doing things
  // parts land on a grid beside the suite window, two across, so none hides another (the first try cascaded them into a pile)
  function placeNear(hubId, n) {
    const w = global.CanvasWM && global.CanvasWM.windowOf && global.CanvasWM.windowOf(hubId); if (!w) return {};
    return { x: Math.round(parseFloat(w.style.left) + w.offsetWidth + 24 + (n % 2) * 580), y: Math.round(parseFloat(w.style.top) + Math.floor(n / 2) * 620) };
  }
  function open(id, o) {
    o = o || {}; const K = o.K || global.Kernel, s = get(id); if (!s) return null;
    if (!s.hub || !F().def(s.hub)) { K.fault('MOUNT_001', { organism_id: s.hub || '?', message: `suite ${id}: its suite window (${s.hub}) is not installed` }); return null; }
    const hub = F().spawn(s.hub, Object.assign({ K }, o.x !== undefined ? { x: o.x, y: o.y } : {})); if (!hub) return null;
    K.bus.publish('ui:config_change:' + hub, { key: 'suite', value: id });
    (s.macros || []).forEach((m, i) => { if (typeof m.default === 'number') K.bus.publish('ui:config_change:' + hub, { key: 'm' + (i + 1), value: m.default }); });   // the knobs show the suite's own start
    return hub;
  }
  // a fresh profile has not installed the suite window or its parts yet: install them all, then open (→ Promise<hubId | null>)
  async function openAsync(id, o) {
    o = o || {}; const K = o.K || global.Kernel, s = get(id); if (!s) return null;
    const C = global.Catalog, want = [s.hub].concat(s.parts.map(p => p.tool)).filter(t => !F().def(t) && C && C.meta && C.meta(t));
    if (want.length) await C.install(want, K);
    return open(id, o);
  }
  // join a part to what is here: the suite's own wires first, then (an output part) into the suite window, then (mixed in)
  // the first ports that fit any member, then the suite window
  function join(K, hubId, id, toolId) {
    const s = suiteOf(K, hubId), ms = members(K, hubId); let n = 0;
    ms.set(id, toolId);
    s.wiring.forEach(w => {
      if (w.from[0] !== toolId && w.to[0] !== toolId) return;
      const a = w.from[0] === toolId ? id : instanceOf(K, hubId, w.from[0], ms), b = w.to[0] === toolId ? id : instanceOf(K, hubId, w.to[0], ms);
      if (a && b && wire(K, a, w.from[1], b, w.to[1])) n++;
    });
    const i = hubIn(live(hubId).def), o = sigOut(live(id).def, i && i.wire_type);
    // a part that now feeds this one stops going into the suite directly (it went there while this part was missing):
    // otherwise it would be heard twice, once through this part and once on its own
    if (i) s.wiring.forEach(w => {
      if (w.to[0] !== toolId || !hookOf(w.from[0], w.from[1], i.wire_type) || outputs(s).includes(w.from[0])) return;
      const a = instanceOf(K, hubId, w.from[0], ms); if (!a) return;
      K.wires.list().filter(x => x.src.instanceId === a && x.dst.instanceId === hubId).forEach(x => K.wires.remove(x.wire_id, 'user'));
    });
    const fedOn = s.wiring.some(w => w.from[0] === toolId && hookOf(toolId, w.from[1], i && i.wire_type) && instanceOf(K, hubId, w.to[0], ms));
    if (outputs(s).includes(toolId) || (!partOf(s, toolId) && o && !fedOn)) { if (o && i && wire(K, id, o.hook_id, hubId, i.hook_id)) n++; }
    if (!n) for (const [m] of ms) { if (m !== id && (fitWire(K, id, m) || fitWire(K, m, id))) { n++; break; } }
    if (!n && o && i && wire(K, id, o.hook_id, hubId, i.hook_id)) n++;
    return n;
  }
  function presetLoad(K, id, name) { if (name && live(id)) K.bus.publish('ui:preset_load:' + id, { name }); }
  function addPart(K, hubId, toolId, o) {
    o = o || {}; const s = suiteOf(K, hubId); if (!s) return null;
    const p = partOf(s, toolId) || { tool: toolId };
    const have = instanceOf(K, hubId, toolId); if (have && !o.another) { join(K, hubId, have, toolId); return have; }
    if (p.as === 'mod') {
      const host = instanceOf(K, hubId, p.in) || addPart(K, hubId, p.in); if (!host || !global.Mods) return null;
      const u = global.Mods.add(host, p.slot, toolId); if (!u) return null;
      const want = o.preset || p.preset;
      if (want) { let n = 0; const tryLoad = () => { const c = global.Mods.childOf(host, u); if (c) presetLoad(K, c, want); else if (n++ < 30) global.setTimeout(tryLoad, 20); }; tryLoad(); }
      return global.Mods.childOf(host, u) || u;
    }
    const id = F().spawn(toolId, Object.assign({ K }, placeNear(hubId, members(K, hubId).size))); if (!id) return null;
    remember(K, hubId, id);
    presetLoad(K, id, o.preset || p.preset);
    join(K, hubId, id, toolId);
    return id;
  }
  // every required part (all of them when none is marked), wired, on the starter scene
  function build(K, hubId) {
    const s = suiteOf(K, hubId); if (!s) return [];
    const req = s.parts.filter(p => p.required); const want = req.length ? req : s.parts;
    const order = want.filter(p => p.as !== 'mod').concat(want.filter(p => p.as === 'mod'));
    const out = order.map(p => addPart(K, hubId, p.tool));
    if (s.starter && s.scenes[s.starter]) scene(K, hubId, s.starter);
    toast(`${s.label}: the whole system is on (${out.filter(Boolean).length} of ${order.length}) — Ctrl+Z takes it back a step at a time`, 'good', 3500);
    return out;
  }
  // a scene sets every part here; a missing required part opens first
  function scene(K, hubId, name) {
    const s = suiteOf(K, hubId), sc = s && s.scenes[name]; if (!sc) return 0;
    let n = 0;
    Object.keys(sc).forEach(toolId => {
      const p = partOf(s, toolId); let id = instanceOf(K, hubId, toolId);
      if (!id && p && (p.required || !s.parts.some(x => x.required))) id = addPart(K, hubId, toolId, { preset: sc[toolId].preset });
      else if (id) presetLoad(K, id, sc[toolId].preset);
      if (!id || !live(id)) return;
      const ps = sc[toolId].params || {}; Object.keys(ps).forEach(k => K.bus.publish('ui:config_change:' + id, { key: k, value: ps[k] }));
      n++;
    });
    if (live(hubId)) K.bus.publish('ui:config_change:' + hubId, { key: 'scene', value: name });
    return n;
  }

  // P48.8 macros: suite.json macros[i] = { label, default?, targets: [{ tool, key, min?, max? }] }. One value 0…1 turns each target
  // part's key across its range (its own min…max unless the suite narrows it). The suite window keeps the value as m1…m4.
  function macro(K, hubId, i, v) {
    const s = suiteOf(K, hubId), m = s && (s.macros || [])[i]; if (!m) return 0;
    v = Math.max(0, Math.min(1, +v || 0)); const ms = members(K, hubId); let n = 0;
    K.bus.publish('ui:config_change:' + hubId, { key: 'm' + (i + 1), value: v });
    (m.targets || []).forEach(t => {
      for (const [id, tool] of ms) {
        if (tool !== t.tool) continue;
        const c = (live(id).def.config || []).find(x => x.key === t.key); if (!c) continue;
        const lo = t.min !== undefined ? t.min : c.min, hi = t.max !== undefined ? t.max : c.max; if (typeof lo !== 'number' || typeof hi !== 'number') continue;
        let x = lo + v * (hi - lo); if (c.type === 'integer') x = Math.round(x); else if (c.step) x = Math.round(x / c.step) * c.step;
        K.bus.publish('ui:config_change:' + id, { key: t.key, value: +x.toFixed(6) }); n++;
      }
    });
    return n;
  }
  // P48.8 the panel is where you play: fold every part window to its title bar (or open them again)
  function fold(K, hubId, on) {
    const WM = global.CanvasWM; if (!WM || !WM.windowOf) return 0; let n = 0;
    members(K, hubId).forEach((tool, id) => { const w = WM.windowOf(id); if (!w) return; w.classList.toggle('collapsed', !!on); n++; });
    K.bus.publish('canvas:layout', {});
    return n;
  }

  // ---------------------------------------------------------------- 3.126 your own suites, from what is wired on the canvas
  // capture(K, fromId): every window joined to fromId by wires (and through each other) — any domain — becomes a suite: its parts,
  // its wires, and a scene "As saved" that puts every part's settings back. Nothing is copied but settings; each part stays a tool.
  const USER_KEY = 'eravos.userSuites';
  const readUser = () => { try { return JSON.parse((global.localStorage && global.localStorage.getItem(USER_KEY)) || '[]') || []; } catch (e) { return []; } };
  const writeUser = (a) => { try { if (global.localStorage) global.localStorage.setItem(USER_KEY, JSON.stringify(a)); } catch (e) {} };
  let defaultHub = null;
  function wiredGroup(K, fromId) {
    const seen = new Set([fromId]), todo = [fromId], ws = K.wires.list();
    while (todo.length) { const id = todo.pop(); ws.forEach(w => { const o = w.src.instanceId === id ? w.dst.instanceId : w.dst.instanceId === id ? w.src.instanceId : null; if (o && !seen.has(o) && live(o) && !live(o).def.system && !live(o).service) { seen.add(o); todo.push(o); } }); }
    return Array.from(seen).filter(id => live(id) && !live(id).def.system && !(live(id).def.id === defaultHub));
  }
  function capture(K, fromId, o) {
    o = o || {}; const ids = wiredGroup(K, fromId); if (ids.length < 2) return null;
    const byTool = new Map(); ids.forEach(id => { const t = live(id).def.id; if (!byTool.has(t)) byTool.set(t, id); });   // one of each tool (a suite names tools)
    const inst = new Map(Array.from(byTool).map(([t, id]) => [id, t]));
    const parts = Array.from(byTool).map(([t, id]) => { const r = live(id), pr = r.ctx.currentPreset; return Object.assign({ tool: t, required: true, role: (r.def.label || t).toLowerCase() }, pr && !/^user:/.test(pr) ? { preset: pr } : {}); });
    const wiring = K.wires.list().filter(w => inst.has(w.src.instanceId) && inst.has(w.dst.instanceId)).map(w => ({ from: [inst.get(w.src.instanceId), w.src.hookId], to: [inst.get(w.dst.instanceId), w.dst.hookId] }));
    const scene = {}; byTool.forEach((id, t) => { const r = live(id), cfg = r.def.config || [], all = r.ctx.params.all ? r.ctx.params.all() : {}, ps = {};
      cfg.forEach(c => { if (!c.hidden && c.type !== 'object' && all[c.key] !== undefined) ps[c.key] = all[c.key]; }); scene[t] = { params: ps }; });
    const first = live(fromId) || live(ids[0]), label = String(o.label || 'My suite').trim() || 'My suite';
    const id = 'user.' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    return { schema: 'eravos.suite/1', id, label, icon: '◈', accent: first.def.accent || '#00d4ff', version: '1.0.0', kind: 'suite', user: true, hub: defaultHub,
      blurb: 'Saved from the canvas: ' + parts.map(p => (F().def(p.tool) || {}).label || p.tool).join(' · ') + '.', parts, wiring, starter: 'As saved', scenes: { 'As saved': scene } };
  }
  function saveUser(s) { if (!s) return false; const a = readUser().filter(x => x.id !== s.id).concat([s]); writeUser(a); return add(s); }
  function removeUser(id) { const s = get(id); if (!s || !s.user) return false; writeUser(readUser().filter(x => x.id !== id)); suites.delete(id); return true; }
  readUser().forEach(s => add(s));

  global.Suites = { add, get, list, setups, forTool, outputs, mixable, open, openAsync, members, status, wiring, addPart, build, scene, macro, fold, instanceOf: (K, hubId, t) => instanceOf(K, hubId, t),
    capture, saveUser, removeUser, wiredGroup, setDefaultHub: (id) => { defaultHub = id; suites.forEach(s => { if (s.user && !s.hub) s.hub = id; }); }, defaultHub: () => defaultHub };
})(typeof window !== 'undefined' ? window : globalThis);
