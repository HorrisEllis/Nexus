/* ERAVOS runtime R8 — wire-system.js → window.WireSystem
 * port_rail: dots on window edges from registry hooks — in left, out right (F-02)
 * colours: event_bus cyan · signal wire types use the colour their domain gave them (K.wires.defineType)
 * ambient hooks (global broadcasts a domain declares with WireSystem.ambient) get no dot
 * drag out-dot → compatible in-dots glow → release registers kernel wire ; click wire → remove
 * P10 (W-03/W-04): rails scale with 1/zoom so dots stay hittable ; drags also start from an INPUT (reverse) ;
 * releasing over a window body picks that window's first lit port ; success is confirmed with a toast. */
(function (global) {
  'use strict';
  const doc = global.document;
  const COLORS = { event_bus: '#00d4ff' };
  const ambient = [];   // topic prefixes that are global broadcasts, not point-to-point wires
  const WS = { COLORS, ambient(prefixes) { (prefixes || []).forEach(p => { if (!ambient.includes(p)) ambient.push(p); }); }, isAmbient: (et) => isAmbient(et) };
  const isAmbient = (et) => ambient.some(p => String(et || '').startsWith(p));
  const signal = (t) => { const k = K || global.Kernel; if (!k) return false; const d = k.wires.types().find(x => x.type === t); return !!(d && d.signal); };
  let K, svg, world, dragging = null;

  function wireable(h) {
    if (h.rail === false || h.internal) return false;   // a tool's insert slots (mods) are wired by the tool, not by hand
    if (signal(h.wire_type)) return true;
    if (h.wire_type !== 'event_bus') return false;
    return !isAmbient(h.event_type) && h.rail !== false;
  }
  function shortName(h) { return (h.label || h.hook_id.split('.').pop()).replace(/_/g, ' '); }

  function init(kernel) {
    K = kernel || global.Kernel;
    K.wires.types().forEach(t => { if (t.color) COLORS[t.type] = t.color; });
    world = global.CanvasWM.world;
    svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wires'); svg.setAttribute('width', '20000'); svg.setAttribute('height', '20000');
    svg.style.left = '-10000px'; svg.style.top = '-10000px';
    world.insertBefore(svg, world.firstChild);
    const redraw = () => { schedule(); };
    ['canvas:layout', 'canvas:window-opened', 'kernel:wire-registered', 'kernel:wire-removed', 'kernel:organism-unmounted'].forEach(t => K.bus.subscribe(t, redraw, 'wires'));
    K.bus.subscribe('canvas:layout', railScale, 'wires'); railScale();
    K.bus.subscribe('canvas:window-opened', (p) => buildRails(p.instanceId), 'wires');
    global.addEventListener('pointermove', onMove);
    global.addEventListener('pointerup', onUp);
    global.addEventListener('pointercancel', cancelDrag); global.addEventListener('blur', cancelDrag);
    global.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancelDrag(); });
  }

  // dots are 13 px in world space; keep them >= 13 px on screen when zoomed out (clamped so rails stay tidy)
  // capped at 1.2: rails grow outward toward the neighbour; windows 20 px apart collide above ~1.23 (26·s ≤ gap + 12)
  function railScale() { const z = (global.CanvasWM.view && global.CanvasWM.view.z) || 1; world.style.setProperty('--pz', String(Math.max(1, Math.min(1.2, 1 / z)))); }
  // title-bar plug: a big, never-overlapping handle — drag it onto any window to connect this window's main output
  function mainOut(instanceId) {
    const rec = K.registry.get(instanceId); if (!rec) return null;
    const outs = Array.from(rec.hooks.values()).filter(h => (h.direction === 'out' || h.direction === 'inout') && wireable(h));
    return outs.find(h => signal(h.wire_type)) || outs[0] || null;
  }
  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => !d.dock && (d.hooks || []).some(h => h.direction === 'out' || h.direction === 'inout'),
    make(rec) {
      const b = doc.createElement('button'); b.className = 'wm-plug'; b.textContent = '⇢'; b.dataset.instance = rec.instanceId; b.setAttribute('aria-label', 'Connect ' + (rec.def ? rec.def.label : 'this tool') + ' to…'); b.setAttribute('aria-haspopup', 'menu');
      // keyboard: Enter / Space on the plug opens the Connect menu (dragging needs a pointer; the menu doesn't)
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openMenu(rec.instanceId, b); } });
      b.addEventListener('pointerdown', (e) => {
        const hk = mainOut(rec.instanceId); if (!hk) return;
        const dot = global.CanvasWM.windowOf(rec.instanceId).querySelector(`.rail.right .port-dot[data-hook="${CSS.escape(hk.hook_id)}"]`) || b;
        startDrag(e, dot, hk, false);
        if (dragging) { dragging.fromPlug = b; dragging.cx = e.clientX; dragging.cy = e.clientY; }
      });
      setTimeout(() => { const hk = K && mainOut(rec.instanceId); if (!hk) b.remove(); else b.title = `connect: click for a list of everything this can plug into — or drag onto another window (sends “${shortName(hk)}”)`; }, 0);
      return b;
    },
  });
  function buildRails(instanceId) {
    const win = global.CanvasWM.windowOf(instanceId); const rec = K.registry.get(instanceId);
    if (!win || !rec || win.classList.contains('docked')) return; // docked panels are not patched with wires
    win.querySelectorAll('.rail').forEach(r => r.remove());
    const hooks = Array.from(rec.hooks.values()).filter(wireable);
    const ins = hooks.filter(h => h.direction === 'in' || h.direction === 'inout');
    const outs = hooks.filter(h => h.direction === 'out' || h.direction === 'inout');
    const mk = (side, list) => {
      const rail = doc.createElement('div'); rail.className = 'rail ' + side;
      list.forEach(h => {
        const dot = doc.createElement('div');
        dot.className = 'port-dot ' + h.wire_type;
        dot.style.setProperty('--pc', COLORS[h.wire_type]);
        dot.dataset.hook = h.hook_id; dot.dataset.instance = instanceId; dot.dataset.dir = side === 'left' ? 'in' : 'out'; dot.dataset.type = h.wire_type;
        dot.title = `${shortName(h)} · ${h.wire_type}${h.event_type && h.wire_type === 'event_bus' ? ' (' + h.event_type + ')' : ''}\n${side === 'right' ? 'drag onto a window (or one of its lit inputs) to connect' : 'input — drag onto a sound to plug it in here'}`;
        const lab = doc.createElement('span'); lab.className = 'port-label'; lab.textContent = shortName(h); dot.appendChild(lab);
        dot.addEventListener('pointerdown', (e) => startDrag(e, dot, h, side === 'left'));
        rail.appendChild(dot);
      });
      win.appendChild(rail);
    };
    mk('left', ins); mk('right', outs);
    schedule();
  }

  function dotPos(instanceId, hookId, dir) {
    const win = global.CanvasWM.windowOf(instanceId); if (!win) return null;
    const dot = win.querySelector(`.rail.${dir === 'in' ? 'left' : 'right'} .port-dot[data-hook="${CSS.escape(hookId)}"]`);
    const x = parseFloat(win.style.left), y = parseFloat(win.style.top);
    if (!dot || win.classList.contains('collapsed')) return { x: x + (dir === 'in' ? 0 : win.offsetWidth), y: y + 14 };
    // measured from the rendered dot (rails are scaled by --pz), mapped back to world space
    const r = dot.getBoundingClientRect(); const c = global.CanvasWM.toWorld(r.left + r.width / 2, r.top + r.height / 2);
    return { x: x + (dir === 'in' ? -1 : win.offsetWidth + 1), y: c.y };
  }
  function pathD(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x + 10000} ${a.y + 10000} C${a.x + dx + 10000} ${a.y + 10000} ${b.x - dx + 10000} ${b.y + 10000} ${b.x + 10000} ${b.y + 10000}`;
  }
  let raf = 0; const lastClick = new Map(); // wire id → last click time (paths are rebuilt between clicks)
  function schedule() { if (!raf) raf = global.requestAnimationFrame(() => { raf = 0; draw(); }); }
  function draw() {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    K.wires.list().forEach(w => {
      if (w.meta && w.meta.insert) return;   // inside a tool (its mods): shown in its window, not as a cable
      const a = dotPos(w.src.instanceId, w.src.hookId, 'out'), b = dotPos(w.dst.instanceId, w.dst.hookId, 'in');
      if (!a || !b) return;
      const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', pathD(a, b)); p.setAttribute('class', 'wire ' + w.wire_type); p.style.stroke = COLORS[w.wire_type] || '#888';
      const hit = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', pathD(a, b)); hit.setAttribute('class', 'wire-hit');
      const t = doc.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = `${w.wire_type} wire — double-click (or Alt-click) to remove`; hit.appendChild(t);
      // a single click no longer deletes: wires were lost by accident while panning
      hit.addEventListener('click', (e) => {
        e.stopPropagation(); const now = Date.now(), prev = lastClick.get(w.wire_id) || 0; lastClick.set(w.wire_id, now);
        if (e.altKey || now - prev < 400) { lastClick.delete(w.wire_id); K.wires.remove(w.wire_id, 'user'); }
      });
      hit.addEventListener('pointerenter', () => p.classList.add('hot')); hit.addEventListener('pointerleave', () => p.classList.remove('hot'));
      svg.appendChild(p); svg.appendChild(hit);
    });
    if (dragging && dragging.to) {
      const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', pathD(dragging.from, dragging.to)); p.setAttribute('class', 'wire dragging'); p.style.stroke = COLORS[dragging.hook.wire_type];
      svg.appendChild(p);
    }
  }
  function compatible(src, dst) {
    if (src.wire_type !== dst.wire_type) return false;
    if (src.wire_type !== 'event_bus') { const k = K || global.Kernel; return k && k.wires.compatible ? k.wires.compatible(src, dst) : true; }
    const se = String(src.event_type).split('|').map(s => s.trim()), te = String(dst.event_type).split('|').map(s => s.trim());
    return se.some(e => te.includes(e));
  }
  function startDrag(e, dot, hook, reverse) {
    e.stopPropagation(); e.preventDefault();
    const inst = dot.dataset.instance;
    dragging = { dot, hook, instance: inst, reverse: !!reverse, from: dotPos(inst, hook.hook_id, reverse ? 'in' : 'out'), to: null };
    // capture: the release is delivered even outside the window / over another element; a lost capture cancels
    try { dot.setPointerCapture(e.pointerId); dot.addEventListener('lostpointercapture', () => { if (dragging && dragging.dot === dot) setTimeout(() => { if (dragging && dragging.dot === dot) cancelDrag(); }, 0); }, { once: true }); } catch (err) {}
    doc.body.classList.add('wiring');
    if (global.UIKit && global.UIKit.drag) dragging.done = global.UIKit.drag.begin(() => cancelDrag()); // 3.34: can't outlive its press
    let lit = 0;
    world.querySelectorAll(reverse ? '.rail.right .port-dot' : '.rail.left .port-dot').forEach(d => {
      const rec = K.registry.get(d.dataset.instance); if (!rec || d.dataset.instance === inst) return;
      const th = rec.hooks.get(d.dataset.hook);
      if (th && (reverse ? compatible(th, hook) : compatible(hook, th))) { d.classList.add('glow'); lit++; }
    });
    world.querySelectorAll('.port-dot.glow').forEach(d => { const w = d.closest('.wm-win'); if (w) w.classList.add('wire-target'); });
    dragging.lit = lit;
    if (!lit && global.Shell && !dragging.quiet) global.Shell.toast(`Nothing on the canvas ${reverse ? 'can feed' : 'can take'} “${shortName(hook)}” yet — add something with a matching ${reverse ? 'output' : 'input'} (＋ Add).`, 'bad');
  }
  // a release over a window body (not exactly on a dot) connects to that window's first lit port
  function targetAt(x, y) {
    const el = doc.elementFromPoint(x, y); if (!el || !el.closest) return null;
    const dot = el.closest('.port-dot.glow'); if (dot) return dot;
    const win = el.closest('.wm-win'); if (!win) return null;
    return win.querySelector(`.rail.${dragging.reverse ? 'right' : 'left'} .port-dot.glow`);
  }
  function cancelDrag() {
    if (!dragging) return; if (dragging.done) dragging.done(); dragging = null; doc.body.classList.remove('wiring');
    world.querySelectorAll('.port-dot.glow').forEach(x => x.classList.remove('glow'));
    world.querySelectorAll('.wm-win.wire-target').forEach(x => x.classList.remove('wire-target'));
    schedule();
  }
  function onMove(e) { if (!dragging) return; dragging.to = global.CanvasWM.toWorld(e.clientX, e.clientY); schedule(); }
  function onUp(e) {
    if (!dragging) return;
    // 3.27: a CLICK on the title-bar plug (no drag) opens the Connect menu instead
    if (dragging.fromPlug && Math.hypot(e.clientX - dragging.cx, e.clientY - dragging.cy) < 5) {
      const d0 = dragging; cancelDrag(); openMenu(d0.instance, d0.fromPlug); return;
    }
    const target = targetAt(e.clientX, e.clientY);
    const d = dragging; dragging = null; if (d.done) d.done();
    doc.body.classList.remove('wiring');
    world.querySelectorAll('.port-dot.glow').forEach(x => x.classList.remove('glow'));
    world.querySelectorAll('.wm-win.wire-target').forEach(x => x.classList.remove('wire-target'));
    if (target) {
      const a = { instanceId: d.instance, hookId: d.hook.hook_id }, b = { instanceId: target.dataset.instance, hookId: target.dataset.hook };
      const src = d.reverse ? b : a, dst = d.reverse ? a : b;
      const r = K.wires.register({ src, dst, wire_type: d.hook.wire_type });
      if (global.Shell) {
        if (!r.ok) { const pe = global.PlainErrors ? global.PlainErrors.describe(r.fault, K) : { text: 'Those two can’t be connected.' }; global.Shell.toast(pe.text + (pe.hint ? ' ' + pe.hint : ''), 'bad', 6000); }
        else { const nm = (id) => { const rec = K.registry.get(id); return rec ? rec.descriptor.label : id; }; global.Shell.toast(`${nm(src.instanceId)} → ${nm(dst.instanceId)} connected`, 'good', 1800); }
      }
    }
    schedule();
  }
  // ---------------------------------------------------------------- 3.27 Connect menu (click the plug)
  // every output of this window × every compatible input on the canvas, one click to connect, ✓ = already connected (click to cut)
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', esc, true); } }
  const outside = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const esc = (e) => { if (e.key === 'Escape') closeMenu(); };
  function targetsFor(instanceId) {
    const rec = K.registry.get(instanceId); if (!rec) return [];
    const outs = Array.from(rec.hooks.values()).filter(h => (h.direction === 'out' || h.direction === 'inout') && wireable(h));
    const label = (id) => { const r = K.registry.get(id); return r ? r.descriptor.label : id; };
    return outs.map(o => {
      const items = [];
      K.registry.list().forEach(r => {
        if (r.instance_id === instanceId || r.descriptor.ephemeral) return;
        const rr = K.registry.get(r.instance_id); if (!rr) return;
        Array.from(rr.hooks.values()).filter(h => (h.direction === 'in' || h.direction === 'inout') && wireable(h) && compatible(o, h)).forEach(h => {
          const w = K.wires.list().find(x => x.src.instanceId === instanceId && x.src.hookId === o.hook_id && x.dst.instanceId === r.instance_id && x.dst.hookId === h.hook_id);
          items.push({ dst: r.instance_id, hook: h, name: label(r.instance_id), port: shortName(h), wire: w || null });
        });
      });
      return { out: o, items };
    });
  }
  function openMenu(instanceId, anchor) {
    closeMenu();
    const groups = targetsFor(instanceId);
    const el = doc.createElement('div'); el.className = 'wire-menu'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'Connect to');
    const title = doc.createElement('div'); title.className = 'wire-menu-title'; title.textContent = 'Connect to…'; el.appendChild(title);
    let any = false;
    groups.forEach(gr => {
      if (!gr.items.length) return; any = true;
      const hd = doc.createElement('div'); hd.className = 'wire-menu-sec'; hd.textContent = 'sends “' + shortName(gr.out) + '”'; hd.style.setProperty('--pc', COLORS[gr.out.wire_type] || '#888'); el.appendChild(hd);
      gr.items.sort((a, b) => a.name.localeCompare(b.name)).forEach(it => {
        const b = doc.createElement('button'); b.className = 'wire-menu-item' + (it.wire ? ' on' : ''); b.setAttribute('role', 'menuitemcheckbox'); b.setAttribute('aria-checked', it.wire ? 'true' : 'false');
        b.innerHTML = '<span class="wm-chk"></span><b></b><span class="wm-port"></span>';
        b.querySelector('.wm-chk').textContent = it.wire ? '✓' : '+'; b.querySelector('b').textContent = it.name; b.querySelector('.wm-port').textContent = it.port;
        b.title = it.wire ? 'connected — click to disconnect' : 'click to connect';
        b.onclick = () => {
          if (it.wire) { K.wires.remove(it.wire.wire_id, 'user'); if (global.Shell) global.Shell.toast('disconnected', '', 1200); }
          else { const r = K.wires.register({ src: { instanceId, hookId: gr.out.hook_id }, dst: { instanceId: it.dst, hookId: it.hook.hook_id }, wire_type: gr.out.wire_type }); if (global.Shell) global.Shell.toast(r.ok ? `→ ${it.name} connected` : (global.PlainErrors && r.fault ? global.PlainErrors.describe(r.fault, K).text : 'Those two can’t be connected.'), r.ok ? 'good' : 'bad', 1600); }
          openMenu(instanceId, anchor); // refresh ticks in place
        };
        el.appendChild(b);
      });
    });
    if (!any) { const p = doc.createElement('div'); p.className = 'wire-menu-empty'; p.textContent = 'Nothing on the canvas can take this yet — add a tool with a matching input (＋ Add).'; el.appendChild(p); }
    doc.body.appendChild(el); menuEl = el;
    const r = anchor.getBoundingClientRect(), mw = el.offsetWidth, mh = el.offsetHeight;
    el.style.left = Math.max(6, Math.min(global.innerWidth - mw - 6, r.right - mw)) + 'px';
    el.style.top = Math.max(6, Math.min(global.innerHeight - mh - 6, r.bottom + 4)) + 'px';
    setTimeout(() => { doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', esc, true); const first = el.querySelector('.wire-menu-item'); if (first) first.focus(); }, 0);
    // arrow keys move between items (menu pattern)
    el.addEventListener('keydown', (e) => { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault(); const items = Array.from(el.querySelectorAll('.wire-menu-item')), i = items.indexOf(doc.activeElement); const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; if (items[j]) items[j].focus(); });
  }
  Object.assign(WS, { init, buildRails, redraw: schedule, compatible, wireable, openMenu, targetsFor });
  global.WireSystem = WS;
})(typeof window !== 'undefined' ? window : globalThis);
