/* ERAVOS runtime — canvas-wm.js → window.CanvasWM
 * The canvas is one space (K-11): euclidean 2D pan/zoom. Windows are projections of organisms.
 * Focus: window pointerdown → canvas:focus {instanceId}. Removal of a .wm-win from the canvas by any
 * route (× button, CLEAR ALL) unmounts the organism exactly once (R9). */
(function (global) {
  const IC = (x, text, fb) => global.Icons ? global.Icons.label(x, text, { fallback: fb }) : ((fb || '') + ' ' + text).trim();   // 3.64 a drawn icon, then the words
  'use strict';
  const doc = global.document;
  const titleActions = [];
  const WM = { focused: null, view: { x: 0, y: 0, z: 1 }, addTitleAction(a) { titleActions.push(a); } };
  let canvas, world, zTop = 10, K;
  // 3.34: every drag registers with the shared guard (UIKit.drag) — it can't outlive its press
  const guard = (end) => (global.UIKit && global.UIKit.drag) ? global.UIKit.drag.begin(end) : () => {};

  function init(el, kernel) {
    K = kernel || global.Kernel;
    canvas = el;
    world = doc.createElement('div'); world.id = 'world';
    canvas.appendChild(world);
    WM.world = world; WM.canvas = canvas;
    applyView();
    // pan: drag empty background ; wheel scroll ; ctrl/⌘+wheel zoom
    let pan = null;
    // middle-button drag pans from anywhere (over windows too)
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 1) return; e.preventDefault(); e.stopPropagation();
      pan = { x: e.clientX, y: e.clientY, vx: WM.view.x, vy: WM.view.y, done: guard(() => endPan()) }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} canvas.classList.add('panning');
    }, true);
    canvas.addEventListener('pointerdown', (e) => {
      if (pan || e.button !== 0) return;
      if (e.target !== canvas && e.target !== world && !(e.target.classList && (e.target.classList.contains('wires-bg') || e.target.classList.contains('wires')))) return;
      pan = { x: e.clientX, y: e.clientY, vx: WM.view.x, vy: WM.view.y, done: guard(() => endPan()) };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {} canvas.classList.add('panning');
      setFocus(null);
    });
    canvas.addEventListener('pointermove', (e) => { if (!pan) return; WM.view.x = pan.vx + (e.clientX - pan.x); WM.view.y = pan.vy + (e.clientY - pan.y); applyView(); });
    const endPan = () => { if (pan && pan.done) pan.done(); pan = null; canvas.classList.remove('panning'); };
    canvas.addEventListener('pointerup', endPan); canvas.addEventListener('pointercancel', endPan); canvas.addEventListener('lostpointercapture', endPan);
    canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    // 3.121 "hold middle mouse and drag to move": on Windows a middle press starts the browser's own autoscroll (the round cursor),
    // which takes the drag over — it is stopped at mousedown, so the middle drag always pans
    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }, true);
    // 3.121 "wasd to navigate": W A S D move the view while held (smoothly; Shift faster) — not while typing, and not when a tool used
    // the key itself (it said so: preventDefault)
    const held = new Set(); let wRaf = 0, wLast = 0;
    const DIR = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [1, 0], KeyD: [-1, 0] };
    const typing = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
    function wStep(t) {
      wRaf = 0; if (!held.size) { wLast = 0; return; }
      const dt = wLast ? Math.min(0.05, (t - wLast) / 1000) : 0.016; wLast = t; let dx = 0, dy = 0;
      held.forEach(k => { if (k === 'Shift') return; const d = DIR[k]; if (d) { dx += d[0]; dy += d[1]; } });
      const v = (held.has('Shift') ? 1800 : 700) * dt; if (dx || dy) { WM.view.x += dx * v; WM.view.y += dy * v; applyView(); }
      wRaf = global.requestAnimationFrame(wStep);
    }
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') { if (held.size) held.add('Shift'); return; }
      if (!DIR[e.code] || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      e.preventDefault(); held.add(e.code); if (e.shiftKey) held.add('Shift'); if (!wRaf) wRaf = global.requestAnimationFrame(wStep);
    });
    doc.addEventListener('keyup', (e) => { if (e.key === 'Shift') held.delete('Shift'); else held.delete(e.code); });
    global.addEventListener('blur', () => held.clear());
    // the canvas never scrolls as a box (a focused input in an off-screen window would make the browser scroll it, shifting everything)
    canvas.addEventListener('scroll', () => { if (canvas.scrollTop || canvas.scrollLeft) { canvas.scrollTop = 0; canvas.scrollLeft = 0; } });
    function scrollsInWindow(el, dy) {
      const win = el && el.closest && el.closest('.wm-win'); if (!win) return false;
      for (let n = el; n && n !== win.parentElement; n = n.parentElement) {
        if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)
          && (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return true;
      }
      return false;
    }
    canvas.addEventListener('wheel', (e) => {
      if (e.target.closest && e.target.closest('.wm-body') && !(e.ctrlKey || e.metaKey)) return;
      // 3.39 (RCA "the tool settings are absent and i cant use them"): the ⚙ panel lives on the window frame, not in its
      // body, so the wheel panned the canvas instead of scrolling the panel — everything under PACKS was unreachable.
      // Any element inside a window that can scroll in the wheel's direction keeps the wheel.
      if (!(e.ctrlKey || e.metaKey) && (e.target.closest('.ts-panel') || scrollsInWindow(e.target, e.deltaY))) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const z0 = WM.view.z, z1 = Math.max(0.3, Math.min(1.6, z0 * Math.exp(-e.deltaY * 0.0015)));
        WM.view.x = mx - (mx - WM.view.x) * z1 / z0; WM.view.y = my - (my - WM.view.y) * z1 / z0; WM.view.z = z1;
      } else { WM.view.x -= e.deltaX; WM.view.y -= e.deltaY; }
      applyView();
    }, { passive: false });
    // any .wm-win removed from the world → unmount once (covers CLEAR ALL in a locked shell)
    new MutationObserver((muts) => {
      muts.forEach(m => m.removedNodes.forEach(n => {
        if (n.nodeType === 1 && n.classList.contains('wm-win') && !n._wmRemoving) {
          K.bus.publish('canvas:window-closed', { instanceId: n.dataset.instance, reason: 'dom_removed' });
        }
      }));
    }).observe(world, { childList: true });
    // ---- interaction safety net (P14 debug: "can't interact sometimes, especially when dragging")
    // 1. the browser's own drag-and-drop must never start from inside the canvas or dock: it swallows every pointer
    //    event until the drop (dragging over selected text, an svg, a canvas). Files dropped FROM the desktop still work.
    const own = (e) => e.target && e.target.closest && e.target.closest('#canvas, #dock');
    doc.addEventListener('dragstart', (e) => { if (own(e) && !(e.target.closest && e.target.closest('[draggable="true"]'))) e.preventDefault(); }, true);
    // 2. any drag state left behind (released outside the window, alt-tab, a lost capture) is cleared
    const release = () => { endPan(); doc.body.classList.remove('wm-dragging', 'wiring'); canvas.classList.remove('panning', 'dropping'); };
    global.addEventListener('blur', release); doc.addEventListener('visibilitychange', () => { if (doc.hidden) release(); });
    doc.addEventListener('pointerup', () => setTimeout(() => { if (!doc.querySelector(':active')) doc.body.classList.remove('wm-dragging'); }, 0), true);
    doc.addEventListener('drop', () => canvas.classList.remove('dropping'), true); doc.addEventListener('dragend', () => canvas.classList.remove('dropping'), true);
    canvas.addEventListener('dragleave', (e) => { if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('dropping'); });
    WM.release = release;
    K.bus.subscribe('canvas:collapse', (p) => { const w = world.querySelector(`.wm-win[data-instance="${p.instanceId}"]`); if (w) { w.classList.toggle('collapsed', p.on !== false); K.bus.publish('canvas:layout', {}); } }, 'wm');
    K.bus.subscribe('canvas:focus-request', (p) => { const w = world.querySelector(`.wm-win[data-instance="${p.instanceId}"]`); if (w) { raise(w); flash(w); centerOn(w); } }, 'wm');
  }
  let layoutRaf = 0;
  function layoutSoon(p) { if (layoutRaf) return; layoutRaf = global.requestAnimationFrame(() => { layoutRaf = 0; K.bus.publish('canvas:layout', p || {}); }); }
  WM.layoutSoon = layoutSoon;
  // Esc leaves a maximized window (unless a field or another handler took the key) · the browser resizing re-fits it
  global.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !world || (e.target && e.target.closest && e.target.closest('input, textarea, select'))) return;
    const m = Array.from(world.querySelectorAll('.wm-win.maximized')).sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
    if (m) maximize(m.dataset.instance, false);
  });
  global.addEventListener('resize', () => { if (world) world.querySelectorAll('.wm-win.maximized, .wm-panel.maximized').forEach(fitMax); });
  function applyView() {
    world.style.transform = `translate(${WM.view.x}px, ${WM.view.y}px) scale(${WM.view.z})`;
    canvas.style.backgroundPosition = `${WM.view.x}px ${WM.view.y}px`;
    canvas.style.backgroundSize = `${24 * WM.view.z}px ${24 * WM.view.z}px`;
    if (world) world.querySelectorAll('.wm-win.maximized, .wm-panel.maximized').forEach(fitMax); // 3.35: a maximized window stays 1:1 on the screen
    K && layoutSoon();
  }
  function toWorld(cx, cy) { const r = canvas.getBoundingClientRect(); return { x: (cx - r.left - WM.view.x) / WM.view.z, y: (cy - r.top - WM.view.y) / WM.view.z }; }
  function centerOn(w) {
    const r = canvas.getBoundingClientRect();
    const x = parseFloat(w.style.left), y = parseFloat(w.style.top);
    WM.view.x = r.width / 2 - (x + w.offsetWidth / 2) * WM.view.z; WM.view.y = Math.min(80, r.height / 2 - (y + w.offsetHeight / 2) * WM.view.z);
    applyView();
  }
  function raise(w) { w.style.zIndex = ++zTop; }
  function flash(w) { w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash'); }
  function setFocus(instanceId) {
    WM.focused = instanceId;
    world.querySelectorAll('.wm-win').forEach(w => w.classList.toggle('focused', w.dataset.instance === instanceId));
    K.bus.publish('canvas:focus', { instanceId });
  }

  let cascade = 0;
  function nextPos(w, h) {
    const r = canvas.getBoundingClientRect();
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    cascade = (cascade + 1) % 8;
    return { x: Math.round(c.x - w / 2 + cascade * 24), y: Math.max(10, Math.round(c.y - h / 2 + cascade * 20)) };
  }

  // ---- bottom dock (domain-free): a descriptor with dock:'bottom' mounts pinned under the canvas, full width
  let dockH = 300, userDockH = 0, dockPrev = 0;
  function dockEls() { return { dock: doc.getElementById('dock'), body: doc.getElementById('dockBody'), grip: doc.getElementById('dockGrip') }; }
  function layoutDock() {
    const { dock, body } = dockEls(); if (!dock) return;
    const has = body && body.children.length > 0, folded = dock.classList.contains('folded');
    dock.classList.toggle('empty', !has);
    // 3.37 (QA: a fixed 300 px dock took 43 % of a 700 px screen): at most 30 % of the window unless you drag it taller,
    // and the canvas always keeps at least 260 px
    const ih = global.innerHeight || 800, fitH = userDockH ? userDockH : Math.max(150, Math.min(300, Math.round(ih * 0.3)));
    if (!dockPrev) dockH = Math.max(120, Math.min(ih - 52 - 260, fitH)); // ⤢ (maximized dock) keeps its full height
    const hpx = !has ? 0 : folded ? 34 : dockH;
    dock.style.height = hpx + 'px'; canvas.style.bottom = hpx + 'px';
    layoutSoon();
  }
  function initDock() {
    const { dock, grip } = dockEls(); if (!dock || dock._init) return; dock._init = true;
    try { const v = +global.localStorage.getItem('eravos.dockH'); if (v > 80) userDockH = v; } catch (e) {} global.addEventListener('resize', () => layoutDock());
    let g = null;
    grip.addEventListener('pointerdown', (e) => { g = { y: e.clientY, h: dockH, done: guard(() => end()) }; try { grip.setPointerCapture(e.pointerId); } catch (_) {} doc.body.classList.add('wm-dragging'); });
    grip.addEventListener('pointermove', (e) => { if (!g) return; userDockH = Math.max(120, Math.min(global.innerHeight - 52 - 200, g.h + (g.y - e.clientY))); dock.classList.remove('folded'); layoutDock(); });
    const end = () => { if (!g) return; g.done(); g = null; doc.body.classList.remove('wm-dragging'); try { global.localStorage.setItem('eravos.dockH', String(userDockH)); } catch (e) {} K.bus.publish('canvas:resize', { dock: true }); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => grip.addEventListener(t, end));
    grip.addEventListener('dblclick', () => { dock.classList.toggle('folded'); layoutDock(); });
    new MutationObserver((muts) => { layoutDock(); muts.forEach(m => m.removedNodes.forEach(n => { if (n.nodeType === 1 && n.classList.contains('wm-win') && !n._wmRemoving) K.bus.publish('canvas:window-closed', { instanceId: n.dataset.instance, reason: 'dom_removed' }); })); }).observe(dockEls().body, { childList: true });
  }
  function openDocked(rec) {
    const d = rec.def, UI = global.UIKit, h = UI.h; initDock();
    const { dock, body: host } = dockEls();
    const closeBtn = h('button', { class: 'wm-x', title: 'remove', text: '×' });
    const foldBtn = h('button', { class: 'wm-min', title: 'fold / unfold (or double-click the edge)', text: '▾' });
    const maxBtn = h('button', { class: 'wm-min wm-max', title: 'expand to the full screen / back', 'aria-label': 'Expand ' + d.label, text: '⤢' });
    const actions = titleActions.filter(a => !a.noDock && a.when(d)).map(a => a.make(rec, K)).filter(Boolean);
    const header = h('div', { class: 'wm-head' }, [h('span', { class: 'wm-icon', html: IC(d, '', d.icon || '◻') }), h('span', { class: 'wm-title', text: d.label }), h('span', { class: 'wm-spacer' }), ...actions, maxBtn, foldBtn, closeBtn]);
    const body = h('div', { class: 'wm-body' });
    const win = h('div', { class: 'wm-win docked', 'data-instance': rec.instanceId, 'data-organism': d.id, style: { '--acc': d.accent || '#00d4ff' } }, [header, body, h('div', { class: 'wm-dusk', 'aria-hidden': 'true' })]);
    host.appendChild(win);
    header.addEventListener('dblclick', (e) => { if (e.target.closest('button, input, select, .wm-vol')) return; dock.classList.toggle('folded'); layoutDock(); });
    foldBtn.addEventListener('click', () => { dock.classList.toggle('folded'); layoutDock(); });
    maxBtn.addEventListener('click', () => maximizeDock());
    closeBtn.addEventListener('click', () => K.bus.publish('canvas:window-closed', { instanceId: rec.instanceId, reason: 'close_button' }));
    win.addEventListener('pointerdown', () => { if (WM.focused !== rec.instanceId) setFocus(rec.instanceId); }, true);
    rec.win = win;
    global.OrganismFactory.mountUI(rec, body);
    layoutDock();
    K.bus.publish('canvas:window-opened', { instanceId: rec.instanceId, docked: true });
    return win;
  }
  function open(rec, o) {
    const d = rec.def, UI = global.UIKit, h = UI.h;
    if (d.dock === 'bottom') return openDocked(rec);
    const size = d.size || { w: 420, h: 320 };
    // 3.37 (RCA "keys on some tools won't click"): a window opened, or fitted to its content, TALLER than the visible canvas
    // put its keyboard (always at the bottom) under a docked window — clicks landed on the dock. A window now
    // never opens or fits larger than what is visible; its body scrolls (and on-screen keyboards stick to its bottom)
    const vr = canvas.getBoundingClientRect(), vz = (WM.view && WM.view.z) || 1, capW = Math.max(320, (vr.width - 24) / vz), capH = Math.max(240, (vr.height - 24) / vz);
    const w = o.w || Math.min(size.w, capW), hgt = o.h || Math.min(size.h, capH);
    const pos = (o.x !== undefined) ? { x: o.x, y: o.y } : nextPos(w, hgt);
    const closeBtn = h('button', { class: 'wm-x', title: 'remove this tool (its connections go with it) — Ctrl+Z brings it back', 'aria-label': 'Remove ' + d.label, text: '×' });
    const minBtn = h('button', { class: 'wm-min', title: 'fold / unfold', 'aria-label': 'Fold ' + d.label, text: '–' });
    const maxBtn = h('button', { class: 'wm-min wm-max', title: 'expand to fill the screen / back to its size', 'aria-label': 'Expand ' + d.label, text: '⤢' });
    // title-bar actions contributed by domains: { when(descriptor) → bool, make(rec, K) → element }
    const actions = titleActions.filter(a => a.when(d)).map(a => a.make(rec, K)).filter(Boolean);
    const tag = h('span', { class: 'wm-tag', text: rec.instanceId.split('-').slice(-2).join('') });
    const header = h('div', { class: 'wm-head' }, [
      h('span', { class: 'wm-icon', html: IC(d, '', d.icon || '◻'), title: 'open its page' }), h('span', { class: 'wm-title', text: d.label, title: 'open its page — mods, packs, every control' }), tag,
      rec.ctx.readOnly ? h('span', { class: 'wm-ro', text: 'READ-ONLY' }) : null,
      h('span', { class: 'wm-spacer' }), ...actions, maxBtn, minBtn, closeBtn,
    ]);
    // 3.87 .wm-dusk: a sunset light over the window (screen-blended, never in the way of a click)
    const body = h('div', { class: 'wm-body' });
    const grip = h('div', { class: 'wm-grip' });
    const win = h('div', { class: 'wm-win', role: 'group', 'aria-label': d.label, 'data-instance': rec.instanceId, 'data-organism': d.id, style: { left: pos.x + 'px', top: pos.y + 'px', width: w + 'px', height: hgt + 'px', '--acc': d.accent || '#00d4ff' } }, [header, body, h('div', { class: 'wm-dusk', 'aria-hidden': 'true' }), grip]);
    { const m = global.Catalog && global.Catalog.meta && global.Catalog.meta(d.id); if (m && m.art) { let u = m.art; try { u = new URL(m.art, doc.baseURI).href; } catch (e) {} win.style.setProperty('--art', 'url("' + u + '")'); } }   // 3.91 its painting (the Dusk theme's title bar) · 3.114 an absolute URL: a relative one in a custom property resolves against the stylesheet that uses it (canvas/runtime/), not the page — every window asked for /canvas/tools/…/art.svg (404)
    win.classList.add('wm-new'); global.setTimeout(() => win.classList.remove('wm-new'), 320);   // 3.73 fluid: it grows into place
    win.style.zIndex = ++zTop;
    world.appendChild(win);
    // drag (title bar). Controls inside the bar keep their clicks; drags always end (up / cancel / lost capture).
    const NO_DRAG = 'button, input, select, textarea, .wm-vol, .uk-num, [data-nodrag]';
    let drag = null;
    const endDrag = () => { if (!drag) return; showSnap([]); drag.done(); drag = null; doc.body.classList.remove('wm-dragging'); K.bus.publish('canvas:layout', { instanceId: rec.instanceId, final: true }); };
    header.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (e.target.closest && e.target.closest(NO_DRAG)) || win.classList.contains('maximized')) return;
      drag = { x: e.clientX, y: e.clientY, l: parseFloat(win.style.left), t: parseFloat(win.style.top), done: guard(() => endDrag()) };
      try { header.setPointerCapture(e.pointerId); } catch (_) {} doc.body.classList.add('wm-dragging');
    });
    header.addEventListener('pointermove', (e) => {
      if (!drag) return;
      // keep the title bar reachable: never under the toolbar, never fully off either side or below the canvas
      const cr = canvas.getBoundingClientRect(), z = WM.view.z, w0 = win.offsetWidth * z;
      const sx = Math.max(cr.left - w0 + 90, Math.min(cr.right - 90, cr.left + WM.view.x + (drag.l + (e.clientX - drag.x) / z) * z));
      const sy = Math.max(cr.top + 2, Math.min(cr.bottom - 34, cr.top + WM.view.y + (drag.t + (e.clientY - drag.y) / z) * z));
      let L = Math.round((sx - cr.left - WM.view.x) / z), T = Math.round((sy - cr.top - WM.view.y) / z);
      if (!e.altKey) { const sn = snapMove(win, L, T, win.offsetWidth, win.offsetHeight, z); L = sn.l; T = sn.t; showSnap(sn.to); } else showSnap([]);   // 3.58 edges connect (Alt: free)
      win.style.left = L + 'px'; win.style.top = T + 'px';
      layoutSoon({ instanceId: rec.instanceId });
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => header.addEventListener(t, endDrag));
    header.addEventListener('dblclick', (e) => { if (e.target.closest && e.target.closest(NO_DRAG)) return; if (win.classList.contains('maximized')) { maximize(rec.instanceId, false); return; } win.classList.toggle('collapsed'); K.bus.publish('canvas:layout', {}); });
    // resize
    let rs = null;
    const endRs = () => { if (!rs) return; showSnap([]); rs.done(); rs = null; doc.body.classList.remove('wm-dragging'); K.bus.publish('canvas:resize', { instanceId: rec.instanceId, final: true }); };
    grip.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (win.classList.contains('maximized')) return; rs = { x: e.clientX, y: e.clientY, w: win.offsetWidth, h: win.offsetHeight, done: guard(() => endRs()) }; try { grip.setPointerCapture(e.pointerId); } catch (_) {} doc.body.classList.add('wm-dragging'); });
    grip.addEventListener('pointermove', (e) => {
      if (!rs) return;
      const minW = (d.minSize && d.minSize.w) || 220, minH = (d.minSize && d.minSize.h) || 120;
      let W = Math.max(minW, Math.round(rs.w + (e.clientX - rs.x) / WM.view.z)), H = Math.max(minH, Math.round(rs.h + (e.clientY - rs.y) / WM.view.z));
      if (!e.altKey) { const sn = snapSize(win, parseFloat(win.style.left) || 0, parseFloat(win.style.top) || 0, W, H, WM.view.z); W = Math.max(minW, sn.w); H = Math.max(minH, sn.h); showSnap(sn.to); } else showSnap([]);
      win.style.width = W + 'px'; win.style.height = H + 'px';
      layoutSoon({ instanceId: rec.instanceId });
      K.bus.publish('canvas:resize', { instanceId: rec.instanceId });
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => grip.addEventListener(t, endRs));
    win.addEventListener('pointerdown', () => { raise(win); if (WM.focused !== rec.instanceId) setFocus(rec.instanceId); }, true);
    closeBtn.addEventListener('click', () => K.bus.publish('canvas:window-closed', { instanceId: rec.instanceId, reason: 'close_button' }));
    minBtn.addEventListener('click', () => { win.classList.toggle('collapsed'); K.bus.publish('canvas:layout', {}); });
    maxBtn.addEventListener('click', () => maximize(rec.instanceId));
    rec.win = win;
    global.OrganismFactory.mountUI(rec, body);
    K.bus.publish('canvas:window-opened', { instanceId: rec.instanceId });
    K.bus.publish('canvas:layout', {});
    // 3.27: nothing opens clipped — a fresh window grows to fit what its UI actually drew (a restored window keeps
    // the size you gave it). Double-click the resize grip to fit again any time.
    if (!o.state) { const fit = () => fitToContent(rec.instanceId); global.requestAnimationFrame(() => global.requestAnimationFrame(fit)); setTimeout(fit, 300); }
    grip.addEventListener('dblclick', (e) => { e.stopPropagation(); fitToContent(rec.instanceId, { shrink: true }); });
    return win;
  }
  // 3.35 ⤢: a window fills the visible canvas at 1:1 screen scale whatever the canvas zoom (3.34 filled it AT the zoom,
  // so a zoomed-out canvas gave a tiny "maximized" tool). It is counter-scaled (scale 1/z) and re-fitted on pan / zoom /
  // browser resize, so it stays put. Again, or Esc → back to the size and place it had.
  function fitMax(win) {
    const cr = canvas.getBoundingClientRect(), a = toWorld(cr.left + 8, cr.top + 8), z = WM.view.z || 1;
    Object.assign(win.style, { left: a.x + 'px', top: a.y + 'px', width: Math.max(200, Math.round(cr.width - 16)) + 'px', height: Math.max(120, Math.round(cr.height - 16)) + 'px', transform: z === 1 ? '' : `scale(${1 / z})`, transformOrigin: '0 0' });
  }
  function maximize(instanceId, on) {
    const win = world && world.querySelector(`.wm-win[data-instance="${CSS.escape(instanceId)}"]`); if (!win) return false;
    const isMax = !!win._restore; if (on === undefined) on = !isMax; if (on === isMax) return isMax;
    if (on) {
      win._restore = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height, transform: win.style.transform, transformOrigin: win.style.transformOrigin };
      win.classList.remove('collapsed'); win.classList.add('maximized'); fitMax(win); raise(win); setFocus(instanceId);
    } else { Object.assign(win.style, win._restore); win._restore = null; win.classList.remove('maximized'); }
    layoutSoon({ instanceId }); K.bus.publish('canvas:resize', { instanceId, final: true });
    return on;
  }
  function maximizeDock(on) {
    const { dock } = dockEls(); if (!dock) return false; const isMax = !!dockPrev; if (on === undefined) on = !isMax; if (on === isMax) return isMax;
    if (on) { dockPrev = dockH; dockH = Math.max(160, global.innerHeight - 110); dock.classList.add('maximized'); }
    else { dockH = dockPrev; dockPrev = 0; dock.classList.remove('maximized'); }
    dock.classList.remove('folded'); layoutDock(); K.bus.publish('canvas:resize', { dock: true, final: true });
    return on;
  }
  function fitToContent(instanceId, o) {
    o = o || {};
    const win = world.querySelector(`.wm-win[data-instance="${CSS.escape(instanceId)}"]`); if (!win || win.classList.contains('collapsed') || win.classList.contains('docked')) return false;
    const body = win.querySelector('.wm-body'); if (!body) return false;
    // 3.95 sizing: a window opens big enough for what it holds (up to 1400 × 1200), whatever the screen shows at the moment. It used
    // to stop at the visible canvas, so with the dock open or a suite opening many windows every tall tool came out squeezed and
    // scrolling. The canvas pans, so a tall window is reached by panning, not by scrolling inside it.
    const MAX_W = 1400, MAX_H = 1200;
    let w = win.offsetWidth, hh = win.offsetHeight;
    const dx = body.scrollWidth - body.clientWidth, dy = body.scrollHeight - body.clientHeight;
    if (dx > 2) w = Math.min(MAX_W, w + dx + 2);
    if (dy > 2) hh = Math.min(MAX_H, hh + dy + 2);
    if (o.shrink && dy <= 2) { // measure the natural height: let the body size to its content once
      const prev = win.style.height; win.style.height = 'auto'; body.style.flex = 'none';
      const nat = win.offsetHeight; win.style.height = prev; body.style.flex = '';
      hh = Math.min(MAX_H, Math.max(nat, 120));
    }
    if (w === win.offsetWidth && hh === win.offsetHeight) return false;
    win.style.width = w + 'px'; win.style.height = hh + 'px';
    layoutSoon({ instanceId }); K.bus.publish('canvas:resize', { instanceId, final: true });
    return true;
  }
  WM.fitToContent = fitToContent;
  function removeWindow(win, fromFactory) {
    if (!win || !win.parentNode) return;
    win._wmRemoving = true;
    const docked = win.classList.contains('docked');
    win.parentNode.removeChild(win);
    if (docked) layoutDock();
    K.bus.publish('canvas:layout', {});
    if (!fromFactory) K.bus.publish('canvas:window-closed', { instanceId: win.dataset.instance });
  }
  // 3.109 a PANEL: a borderless window on the canvas that holds part of a window (an editor pulled out of it so it gets the room it
  // needs). It belongs to its owner window (it takes the owner's colour and goes when the owner goes) and is not a tool: no ports, no
  // page. Moved by its title bar (3.112: always shown, snaps like a window), sized from its corner.
  //   CanvasWM.openPanel({ owner, el, title, w, h, x, y, onClose }) → { win, body, setTitle(text), close(), maximize(on), show(), placeUnder() }
  function openPanel(o) {
    const UI = global.UIKit, h = UI.h, owner = o.owner ? windowOf(o.owner) : null;
    const title = h('span', { class: 'wm-ptitle', text: o.title || '' });
    const maxBtn = h('button', { class: 'wm-min wm-max', title: 'expand to fill the screen / back', 'aria-label': 'Expand', text: '⤢' });
    const closeBtn = h('button', { class: 'wm-x', title: 'close (it goes back where it came from)', 'aria-label': 'Close', text: '×' });
    const strip = h('div', { class: 'wm-pstrip' }, [title, h('span', { class: 'wm-spacer' }), maxBtn, closeBtn]);
    const body = h('div', { class: 'wm-pbody' }), grip = h('div', { class: 'wm-pgrip' });
    let x = o.x, y = o.y, hh = o.h || 420; const w = o.w || 1000;
    // 3.112 it opens under its owner and never over it (it used to be pushed up over the owner's tracks to stay on screen); the view
    // moves to show it instead (show())
    const under = () => ({ x: owner ? parseFloat(owner.style.left) || 0 : 0, y: owner ? (parseFloat(owner.style.top) || 0) + owner.offsetHeight + SNAP_GAP : 0 });
    if (x === undefined) { if (owner) { const u = under(); x = u.x; y = u.y; } else { const p = nextPos(w, hh); x = p.x; y = p.y; } }
    const win = h('div', { class: 'wm-panel', role: 'group', 'aria-label': o.title || 'panel', 'data-owner': o.owner || '', style: { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px', '--acc': (owner && owner.style.getPropertyValue('--acc')) || '#00d4ff' } }, [strip, body, grip]);
    win.style.zIndex = ++zTop; world.appendChild(win);
    if (o.el) body.appendChild(o.el);
    win.addEventListener('pointerdown', () => raise(win), true);
    let mv = null; const endMv = () => { if (!mv) return; mv.done(); mv = null; doc.body.classList.remove('wm-dragging'); };
    strip.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('button') || win._restore) return; mv = { x: e.clientX, y: e.clientY, l: parseFloat(win.style.left), t: parseFloat(win.style.top), done: guard(endMv) }; try { strip.setPointerCapture(e.pointerId); } catch (_) {} doc.body.classList.add('wm-dragging'); });
    // 3.112 it snaps to the windows near it, like every window (Alt: free)
    strip.addEventListener('pointermove', (e) => { if (!mv) return; const z = WM.view.z; let L = Math.round(mv.l + (e.clientX - mv.x) / z), T = Math.round(mv.t + (e.clientY - mv.y) / z);
      if (!e.altKey) { const sn = snapMove(win, L, T, win.offsetWidth, win.offsetHeight, z); L = sn.l; T = sn.t; showSnap(sn.to); } else showSnap([]);
      win.style.left = L + 'px'; win.style.top = T + 'px'; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => strip.addEventListener(t, () => { showSnap([]); endMv(); }));
    let rs = null; const endRs = () => { if (!rs) return; rs.done(); rs = null; doc.body.classList.remove('wm-dragging'); };
    grip.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (win._restore) return; rs = { x: e.clientX, y: e.clientY, w: win.offsetWidth, h: win.offsetHeight, done: guard(endRs) }; try { grip.setPointerCapture(e.pointerId); } catch (_) {} doc.body.classList.add('wm-dragging'); });
    grip.addEventListener('pointermove', (e) => { if (!rs) return; const z = WM.view.z; win.style.width = Math.max(360, Math.round(rs.w + (e.clientX - rs.x) / z)) + 'px'; win.style.height = Math.max(200, Math.round(rs.h + (e.clientY - rs.y) / z)) + 'px'; });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => grip.addEventListener(t, endRs));
    const max = (on) => { if (on === undefined) on = !win._restore; if (on === !!win._restore) return;
      if (on) { win._restore = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height, transform: win.style.transform, transformOrigin: win.style.transformOrigin }; win.classList.add('maximized'); fitMax(win); raise(win); }
      else { Object.assign(win.style, win._restore); win._restore = null; win.classList.remove('maximized'); } };
    maxBtn.addEventListener('click', () => max());
    strip.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) max(); });
    let closed = false;
    const close = (why) => { if (closed) return; closed = true; endMv(); endRs(); offOwner(); if (win.parentNode) win.parentNode.removeChild(win); if (o.onClose) o.onClose(why || 'close'); };
    closeBtn.addEventListener('click', () => close('close_button'));
    const offOwner = o.owner ? K.bus.subscribe('canvas:window-closed', (p) => { if (p && p.instanceId === o.owner) close('owner_closed'); }, 'wm-panel') : () => {};
    // in view, never over its owner: pan only as far as keeps the owner's title bar on screen, then make the panel shorter to fit
    // (down to 360 px), and only then pan further. Sideways: just into view.
    function show() {
      const cr = canvas.getBoundingClientRect(), z = WM.view.z || 1; let r = win.getBoundingClientRect(), dy = 0, dx = 0;
      const bot = cr.bottom - 8, ownTop = owner ? owner.getBoundingClientRect().top : r.top;
      if (r.bottom > bot) {
        const need = r.bottom - bot, room = Math.max(0, ownTop - (cr.top + 8)); dy = -Math.min(need, room);
        const over = r.bottom + dy - bot; if (over > 0 && !win._restore) { const H0 = win.offsetHeight, H1 = Math.max(360, Math.round(H0 - over / z)); win.style.height = H1 + 'px'; r = win.getBoundingClientRect(); }
        if (r.bottom + dy > bot) dy = bot - r.bottom;
      }
      if (r.top + dy < cr.top + 8 && !owner) dy = (cr.top + 8) - r.top;
      if (r.right > cr.right - 8) dx = (cr.right - 8) - r.right; if (r.left + dx < cr.left + 8) dx = (cr.left + 8) - r.left;
      if (dx || dy) { WM.view.x += dx; WM.view.y += dy; applyView(); }
    }
    const placeUnder = () => { if (!owner || win._restore) return; const u = under(); win.style.left = u.x + 'px'; win.style.top = u.y + 'px'; show(); };
    return { win, body, setTitle: (t) => { title.textContent = t || ''; win.setAttribute('aria-label', t || 'panel'); }, close: () => close('api'), maximize: max, show, placeUnder };
  }
  WM.openPanel = openPanel;
  function windowOf(instanceId) { return world ? world.querySelector(`.wm-win[data-instance="${instanceId}"]`) || doc.querySelector(`#dock .wm-win[data-instance="${instanceId}"]`) : null; }
  function rectOf(instanceId) {
    const w = windowOf(instanceId); if (!w) return null;
    return { x: parseFloat(w.style.left), y: parseFloat(w.style.top), w: w.offsetWidth, h: w.offsetHeight, collapsed: w.classList.contains('collapsed') };
  }
  function place(instanceId, r) { const w = windowOf(instanceId); if (!w) return; if (r.x !== undefined) w.style.left = r.x + 'px'; if (r.y !== undefined) w.style.top = r.y + 'px'; if (r.w) w.style.width = r.w + 'px'; if (r.h) w.style.height = r.h + 'px'; K.bus.publish('canvas:layout', {}); }
  // ---- 3.58 EDGES CONNECT ("auto connect to edge … I want the UI to stay clean and organized"): a window you drag or resize
  // snaps to the edges of the windows near it — side by side with a 10 px gap, or lined up with their edges — within 14 screen
  // px. Hold Alt to place it freely. The windows it connects to light up while you drag.
  const SNAP_GAP = 10;
  const rectsBut = (self) => Array.from(world.querySelectorAll('.wm-win')).filter(w => w !== self && !w.classList.contains('maximized') && w.offsetParent !== null)
    .map(w => ({ el: w, l: parseFloat(w.style.left) || 0, t: parseFloat(w.style.top) || 0, w: w.offsetWidth, h: w.offsetHeight }));
  // 3.114 Settings › Canvas › Snap windows to each other (on by default; Alt still places freely)
  const snapOff = () => doc.documentElement.dataset.snap === 'off';
  function snapMove(self, l, t, w, h, z) {
    if (snapOff()) return { l, t, to: [] };
    const T = 14 / z, near = 60 / z; let bx = null, by = null, dx = T, dy = T, gx = null, gy = null;
    rectsBut(self).forEach(o => {
      const vNear = t < o.t + o.h + near && t + h > o.t - near, hNear = l < o.l + o.w + near && l + w > o.l - near;
      if (vNear) [o.l, o.l + o.w - w, o.l + o.w + SNAP_GAP, o.l - w - SNAP_GAP].forEach(x => { const d = Math.abs(x - l); if (d < dx) { dx = d; bx = x; gx = o.el; } });
      if (hNear) [o.t, o.t + o.h - h, o.t + o.h + SNAP_GAP, o.t - h - SNAP_GAP].forEach(y => { const d = Math.abs(y - t); if (d < dy) { dy = d; by = y; gy = o.el; } });
    });
    return { l: bx !== null ? Math.round(bx) : l, t: by !== null ? Math.round(by) : t, to: [gx, gy].filter(Boolean) };
  }
  function snapSize(self, l, t, w, h, z) {
    if (snapOff()) return { w, h, to: [] };
    const T = 14 / z, near = 60 / z; let bw = null, bh = null, dw = T, dh = T, gx = null, gy = null;
    rectsBut(self).forEach(o => {
      const vNear = t < o.t + o.h + near && t + h > o.t - near, hNear = l < o.l + o.w + near && l + w > o.l - near;
      if (vNear) [o.l - SNAP_GAP, o.l + o.w].forEach(r => { const d = Math.abs(r - (l + w)); if (d < dw) { dw = d; bw = r - l; gx = o.el; } });
      if (hNear) [o.t - SNAP_GAP, o.t + o.h].forEach(b => { const d = Math.abs(b - (t + h)); if (d < dh) { dh = d; bh = b - t; gy = o.el; } });
    });
    return { w: bw !== null ? Math.round(bw) : w, h: bh !== null ? Math.round(bh) : h, to: [gx, gy].filter(Boolean) };
  }
  function showSnap(list) { world.querySelectorAll('.wm-win.wm-snap').forEach(w => { if (!list.includes(w)) w.classList.remove('wm-snap'); }); list.forEach(w => w.classList.add('wm-snap')); }
  /** ⊞ Tidy: every window in rows, in the order the domain gives (WM.tidyRank(descriptor) → a number, low first), edges touching
   * (10 px gaps), from where the windows start now. One move, animated; then everything is fitted into view. */
  function tidy() {
    const wins = Array.from(world.querySelectorAll('.wm-win')).filter(w => !w.classList.contains('maximized'));
    if (!wins.length) return;
    const recOf = (w) => { const id = w.dataset.instance || w.dataset.instanceId || w.dataset.id; const r = id && K && K.registry.get(id); return r && r.descriptor; };
    const rank = (w) => { const d = recOf(w) || {}; try { return WM.tidyRank ? +WM.tidyRank(d) || 0 : 0; } catch (e) { return 0; } };   // a domain says what goes first
    const order = wins.map((w, i) => ({ w, i, r: rank(w), lab: (recOf(w) || {}).label || '' })).sort((a, b) => a.r - b.r || a.lab.localeCompare(b.lab) || a.i - b.i).map(x => x.w);
    const x0 = Math.min(...wins.map(w => parseFloat(w.style.left) || 0)), y0 = Math.min(...wins.map(w => parseFloat(w.style.top) || 0));
    const maxRow = Math.max(1800, ...wins.map(w => w.offsetWidth));
    let x = x0, y = y0, rowH = 0;
    order.forEach(w => { const ww = w.offsetWidth, hh = w.offsetHeight; if (x > x0 && x - x0 + ww > maxRow) { x = x0; y += rowH + SNAP_GAP; rowH = 0; } w.classList.add('wm-tidying'); w.style.left = Math.round(x) + 'px'; w.style.top = Math.round(y) + 'px'; x += ww + SNAP_GAP; rowH = Math.max(rowH, hh); });
    setTimeout(() => { order.forEach(w => w.classList.remove('wm-tidying')); K.bus.publish('canvas:layout', { final: true }); fitAll(); }, 320);
  }
  function fitAll() {
    const wins = Array.from(world.querySelectorAll('.wm-win'));
    if (!wins.length) { WM.view = { x: 0, y: 0, z: 1 }; applyView(); return; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    wins.forEach(w => { const x = parseFloat(w.style.left), y = parseFloat(w.style.top); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w.offsetWidth); y1 = Math.max(y1, y + w.offsetHeight); });
    const r = canvas.getBoundingClientRect();
    const z = Math.max(0.3, Math.min(1, Math.min((r.width - 60) / (x1 - x0), (r.height - 60) / (y1 - y0))));
    WM.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: 30 - y0 * z };
    applyView();
  }

  Object.assign(WM, { maximize, maximizeDock, layoutDock, init, open, removeWindow, windowOf, rectOf, place, fitAll, toWorld, setFocus, raise, centerOn, applyView, tidy, snapMove, snapSize });
  global.CanvasWM = WM;
})(typeof window !== 'undefined' ? window : globalThis);
