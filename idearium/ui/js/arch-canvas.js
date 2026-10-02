/*
 * idearium/ui/js/arch-canvas.js — THE ARCHITECT'S CANVAS, one for both Architects (0.39.299 AR3).
 * component_id: idearium.ui.arch-canvas
 * Map: docs/2026-10-02-workshop-codex-rewind-phasemap.spec (AR3, AR4, AR5)
 *
 * James, 2026-10-02: "no. look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and
 * consistent, open ui." · "one is for the idearium pipeline and the other is for the repos." · (with MASTERMIND
 * v0.1.49) "look at this canvas. its huge. you can strip it. its a copy".
 *
 * Stripped from MASTERMIND's nexus-canvas.js (2,263 lines beside a 16,001-line engine) to what a map needs:
 *   the world transform — zoom toward the cursor, drag empty space to pan, pinch on touch (MASTERMIND zoomToward/_nmDown)
 *   glass cards with a coloured edge and a clipped corner (MASTERMIND .node-frame), dot mode when far out
 *   bezier wires with a travelling particle, frustum-culled, drawn in one batch (MASTERMIND drawConns)
 *   the dot grid (drawBg), the minimap (drawMinimap — here, click it to go there), box select, drag, a link handle
 *   the adaptive render loop: 60fps while you work, 30 idle, nothing while hidden (renderLoop)
 * Left behind: the vault, JAA, auth, tags, fractal, themes, lattice, Electron, every module.
 * Added for architecture: layer bands bottom-up, a pure layered layout (layout(), testable in node), focus — the
 * selected component's needs (yellow) and consumers (magenta) lit, everything else dimmed.
 *
 * One canvas, one truth (§16.5): the pipeline's Architect (ui/architect.html) and the repo's Architect tab
 * (js/app.js) both mount this; neither draws its own.
 *
 * API — ArchCanvas.mount(el, opts) → canvas
 *   opts      { linkable, onSelect(ids), onMove([{id,x,y}]), onLink(fromId, toId), onOpen(id), onDelete(ids), nodeW,
 *               inset() → { t, r, b, l } — what the page's overlays cover, so fit frames the map in what is left,
 *               layout: { maxPerRow, nodeH, … } — passed to layout() }
 *   canvas    setGraph({ nodes, edges, bands }, { keepView }) · layout({ all }) · fit() · zoomBy(f) · select(id) ·
 *             selected() · center(id) · resize() · destroy()
 *   nodes     [{ id, band, html, color, cls, x?, y?, pinned? }]   — html is the card (ArchCanvas.card helps)
 *   edges     [{ from, to, kind }]  from NEEDS to (to sits lower); kind: dep | breach | gap | external | event
 *   bands     [{ key, label, color }]  bottom first
 *   groups    [{ key, label, color }]  (0.39.300 AZ1) systems: each node's `group`; with two or more the map has three
 *             increments — SYSTEMS · COMPONENTS · DETAIL (step(±1), goLevel(name), openGroup(key), keys 1·2·3, + −)
 *   opts      … onLevel(level), onSelectGroup(key), groupHtml(box, { needs, usedBy }) → the system card's body
 */
(function (root) {
  'use strict';

  // ── the layout: pure, no DOM ─────────────────────────────────────────────────────────────────────────────────────
  /**
   * layout(nodes, edges, bands, opts) → { pos: { id: {x,y} }, bands: [{ key, label, y, h }], width, height }
   * Bands stack bottom-up (bands[0] at the bottom). Inside a band, nodes are ordered by the barycentre of what they
   * touch in the bands already placed — two sweeps, up then down — which is what cuts the crossings; a band wider
   * than maxPerRow wraps into rows. Pinned nodes (x,y given and pinned) keep their place.
   */
  function layout(nodes, edges, bands, opts) {
    const o = Object.assign({ nodeW: 230, nodeH: 92, gapX: 34, gapY: 34, bandPad: 46, bandGap: 26, maxPerRow: 7, left: 60 }, opts || {});
    const keys = bands.map(b => b.key);
    const inBand = new Map(keys.map(k => [k, []]));
    const extra = [];
    for (const n of nodes) (inBand.has(n.band) ? inBand.get(n.band) : extra).push(n);
    if (extra.length) { keys.push('_other'); inBand.set('_other', extra); bands = bands.concat([{ key: '_other', label: 'OTHER' }]); }
    const nbr = new Map(nodes.map(n => [n.id, []]));
    for (const e of edges) if (nbr.has(e.from) && nbr.has(e.to)) { nbr.get(e.from).push(e.to); nbr.get(e.to).push(e.from); }
    const order = new Map();   // id → horizontal index within its band (fractional allowed while sweeping)
    const place = (list) => list.forEach((n, i) => order.set(n.id, i));
    const bary = (n) => { const xs = nbr.get(n.id).filter(id => order.has(id)).map(id => order.get(id)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const sortBand = (list) => {
      const scored = list.map((n, i) => ({ n, b: bary(n), i }));
      scored.sort((a, c) => (a.b == null ? a.i : a.b) - (c.b == null ? c.i : c.b) || a.i - c.i);
      return scored.map(s => s.n);
    };
    // initial: by name, so the same graph always lays out the same way
    for (const k of keys) inBand.get(k).sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
    for (const k of keys) place(inBand.get(k));
    for (let pass = 0; pass < 2; pass++) {
      for (const k of keys) { const s = sortBand(inBand.get(k)); inBand.set(k, s); place(s); }                   // up
      for (const k of keys.slice().reverse()) { const s = sortBand(inBand.get(k)); inBand.set(k, s); place(s); } // down
    }
    // geometry: rows per band, widest band sets the width, bands centred
    const rowsOf = (k) => Math.max(1, Math.ceil(inBand.get(k).length / o.maxPerRow));
    const colsOf = (k) => Math.min(o.maxPerRow, Math.max(1, inBand.get(k).length));
    const width = Math.max(...keys.map(colsOf)) * (o.nodeW + o.gapX) - o.gapX;
    const heights = keys.map(k => o.bandPad * 2 + rowsOf(k) * o.nodeH + (rowsOf(k) - 1) * o.gapY);
    const total = heights.reduce((a, b) => a + b, 0) + o.bandGap * (keys.length - 1);
    const pos = {}, outBands = [];
    let y = total;   // bottom of the stack; bands[0] sits at the bottom
    keys.forEach((k, bi) => {
      const h = heights[bi]; y -= h;
      const band = bands[bi];
      outBands.push({ key: k, label: band.label || k, color: band.color || null, y, h, count: inBand.get(k).length });
      const list = inBand.get(k);
      list.forEach((n, i) => {
        const row = Math.floor(i / o.maxPerRow), col = i % o.maxPerRow;
        const inRow = Math.min(o.maxPerRow, list.length - row * o.maxPerRow);
        const rowW = inRow * (o.nodeW + o.gapX) - o.gapX;
        const x0 = o.left + (width - rowW) / 2;
        const p = { x: Math.round(x0 + col * (o.nodeW + o.gapX)), y: Math.round(y + o.bandPad + (rowsOf(k) - 1 - row) * (o.nodeH + o.gapY)) };
        pos[n.id] = n.pinned && Number.isFinite(n.x) && Number.isFinite(n.y) ? { x: n.x, y: n.y } : p;
      });
      y -= o.bandGap;
    });
    return { pos, bands: outBands, width: width + o.left * 2, height: total };
  }

  /**
   * groupLevels(groupKeys, gEdges) → { level: { key: n }, cycles: [[keys]] }  (0.39.300 AZ1)
   * A system's level is how far it sits above what it needs: 0 needs nothing; else one above the highest system it needs.
   * Systems that need each other (a cycle) are condensed first (Tarjan) and share one level — a cycle is drawn side by
   * side, not as a ladder that hides it.
   */
  function groupLevels(keys, gEdges) {
    const out = new Map(keys.map(k => [k, []]));
    for (const e of gEdges) if (out.has(e.from) && out.has(e.to) && e.from !== e.to) out.get(e.from).push(e.to);
    let idx = 0; const index = new Map(), low = new Map(), on = new Set(), stack = [], comp = new Map(), comps = [];
    const strong = (v) => {
      index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
      for (const w of out.get(v)) {
        if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      }
      if (low.get(v) === index.get(v)) { const c = []; let w; do { w = stack.pop(); on.delete(w); comp.set(w, comps.length); c.push(w); } while (w !== v); comps.push(c); }
    };
    for (const k of keys) if (!index.has(k)) strong(k);
    const cl = new Map();
    const lv = (ci) => {
      if (cl.has(ci)) return cl.get(ci);
      cl.set(ci, 0);
      let m = -1;
      for (const k of comps[ci]) for (const w of out.get(k)) { const cj = comp.get(w); if (cj !== ci) m = Math.max(m, lv(cj)); }
      cl.set(ci, m + 1);
      return m + 1;
    };
    const level = {};
    comps.forEach((c, ci) => { const l = lv(ci); for (const k of c) level[k] = l; });
    return { level, cycles: comps.filter(c => c.length > 1) };
  }

  /**
   * layoutGrouped(nodes, edges, groups, bands, opts) → { pos, boxes, gEdges, width, height }  (0.39.300 AZ1)
   * Two levels: each group (a system) is a box laid out bottom-up by groupLevels(); inside its box, its members are laid
   * out by layout() in their bands. Boxes in a level are ordered by the barycentre of the systems they touch. The
   * members' positions are absolute, so zooming into a system shows its components exactly where the system was.
   */
  function layoutGrouped(nodes, edges, groups, bands, opts) {
    const o = Object.assign({ nodeW: 210, nodeH: 84, gapX: 24, gapY: 24, boxPad: 26, boxHead: 64, boxGapX: 70, boxGapY: 90, left: 60, minBoxW: 300, minBoxH: 170 }, opts || {});
    const gOf = new Map(nodes.map(n => [n.id, n.group]));
    const keys = groups.map(g => g.key).filter(k => nodes.some(n => n.group === k));
    const agg = new Map();
    for (const e of edges) {
      const a = gOf.get(e.from), b = gOf.get(e.to);
      if (!a || !b || a === b) continue;
      const k = `${a}>${b}`; agg.set(k, (agg.get(k) || 0) + 1);
    }
    const gEdges = [...agg.entries()].map(([k, count]) => { const [from, to] = k.split('>'); return { from, to, count }; });
    const { level, cycles } = groupLevels(keys, gEdges);
    // each box: its members laid out inside, by layer
    const boxes = new Map();
    for (const k of keys) {
      const members = nodes.filter(n => n.group === k);
      const per = Math.max(2, Math.min(8, Math.ceil(Math.sqrt(members.length * 1.4))));
      const inner = layout(members, edges.filter(e => gOf.get(e.from) === k && gOf.get(e.to) === k), bands, { nodeW: o.nodeW, nodeH: o.nodeH, gapX: o.gapX, gapY: o.gapY, bandPad: 14, bandGap: 10, maxPerRow: per, left: 0 });
      const g = groups.find(x => x.key === k) || {};
      boxes.set(k, { key: k, label: g.label || k, color: g.color || null, count: members.length, level: level[k] || 0,
        w: Math.max(o.minBoxW, inner.width + o.boxPad * 2), h: Math.max(o.minBoxH, inner.height + o.boxHead + o.boxPad), inner, cyclic: cycles.some(c => c.includes(k)) });
    }
    // levels bottom-up; within a level, order by the barycentre of the systems already placed
    const maxL = Math.max(0, ...[...boxes.values()].map(b => b.level));
    const rows = Array.from({ length: maxL + 1 }, (_, l) => [...boxes.values()].filter(b => b.level === l).sort((a, b) => a.label.localeCompare(b.label)));
    const nbr = new Map(keys.map(k => [k, []]));
    for (const e of gEdges) { nbr.get(e.from).push(e.to); nbr.get(e.to).push(e.from); }
    const order = new Map();
    rows.forEach(r => r.forEach((b, i) => order.set(b.key, i)));
    for (let pass = 0; pass < 2; pass++) rows.forEach((r, ri) => {
      const sc = r.map((b, i) => { const xs = nbr.get(b.key).filter(k => order.has(k) && boxes.get(k).level !== ri).map(k => order.get(k)); return { b, s: xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : i }; });
      sc.sort((x, y) => x.s - y.s); r.splice(0, r.length, ...sc.map(x => x.b)); r.forEach((b, i) => order.set(b.key, i));
    });
    const rowW = rows.map(r => r.reduce((s, b) => s + b.w, 0) + o.boxGapX * Math.max(0, r.length - 1));
    const rowH = rows.map(r => Math.max(0, ...r.map(b => b.h)));
    const width = Math.max(1, ...rowW), total = rowH.reduce((a, b) => a + b, 0) + o.boxGapY * Math.max(0, rows.length - 1);
    const pos = {}, outBoxes = [];
    let y = total;
    rows.forEach((r, ri) => {
      y -= rowH[ri];
      let x = o.left + (width - rowW[ri]) / 2;
      for (const b of r) {
        const by = y + (rowH[ri] - b.h);   // a row's boxes sit on a common floor
        outBoxes.push({ key: b.key, label: b.label, color: b.color, count: b.count, level: b.level, cyclic: b.cyclic, x: Math.round(x), y: Math.round(by), w: Math.round(b.w), h: Math.round(b.h) });
        const ox = x + (b.w - b.inner.width) / 2, oy = by + o.boxHead;
        for (const [id, p] of Object.entries(b.inner.pos)) pos[id] = { x: Math.round(ox + p.x), y: Math.round(oy + p.y) };
        x += b.w + o.boxGapX;
      }
      y -= o.boxGapY;
    });
    return { pos, boxes: outBoxes, gEdges, cycles, width: width + o.left * 2, height: total };
  }

  /** crossings(pos, edges) — how many wire pairs cross (straight segments); the layout's quality, for tests */
  function crossings(pos, edges) {
    const seg = edges.filter(e => pos[e.from] && pos[e.to]).map(e => [pos[e.from], pos[e.to]]);
    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    let n = 0;
    for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) {
      const [a, b] = seg[i], [c, d] = seg[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)) n++;
    }
    return n;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** card({ title, badge, sub, lines, chips }) — the one card shape both Architects use */
  function card({ title, badge = '', sub = '', lines = [], chips = [] } = {}) {
    return `<div class="ac-head"><span class="ac-title">${esc(title)}</span>${badge ? `<span class="ac-badge">${esc(badge)}</span>` : ''}</div>`
      + (sub ? `<div class="ac-sub">${esc(sub)}</div>` : '')
      + (lines.length ? `<div class="ac-lines">${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>` : '')
      + (chips.length ? `<div class="ac-chips">${chips.map(c => `<span class="ac-chip ${esc(c.cls || '')}">${esc(c.t)}</span>`).join('')}</div>` : '');
  }

  // ── the canvas: browser only ─────────────────────────────────────────────────────────────────────────────────────
  const EDGE = { dep: [0, 212, 255], breach: [255, 45, 85], gap: [255, 45, 85], external: [90, 122, 150], event: [204, 68, 255], need: [255, 204, 0], use: [204, 68, 255] };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FAR = 0.6;    // below this zoom the cards fold to their titles, drawn large (MASTERMIND's dot mode, made legible)
  // §0.39.300 AZ1 — James: "need increments of zoom. like each system is a node, which zooming in has the components as
  // nodes." Three increments when the graph has systems: SYSTEMS (each system one node, its wires summed) · COMPONENTS
  // (each system a region, its components inside as titles) · DETAIL (full cards). STEPS are where + and − stop.
  const Z_SYS = 0.3;
  const LEVELS = Object.freeze({ systems: { label: 'SYSTEMS', zoom: null }, components: { label: 'COMPONENTS', zoom: 0.42 }, detail: { label: 'DETAIL', zoom: 0.9 } });
  const STEPS = [0.08, 0.12, 0.17, 0.24, 0.32, 0.42, 0.55, 0.7, 0.9, 1.15, 1.5, 2];

  function mount(el, opts) {
    opts = Object.assign({ linkable: false, nodeW: 230 }, opts || {});
    el.classList.add('ac');
    el.innerHTML = `<canvas class="ac-bg"></canvas><canvas class="ac-wires"></canvas><div class="ac-world"></div>
      <div class="ac-selbox"></div><div class="ac-mini" title="THE WHOLE MAP — CLICK TO GO THERE"><canvas></canvas></div><div class="ac-zoom" aria-live="polite"></div><div class="ac-link-hint">DROP ON THE COMPONENT IT NEEDS</div>`;
    const bg = el.querySelector('.ac-bg'), wires = el.querySelector('.ac-wires'), world = el.querySelector('.ac-world');
    const selbox = el.querySelector('.ac-selbox'), miniBox = el.querySelector('.ac-mini'), mini = miniBox.querySelector('canvas'), zoomEl = el.querySelector('.ac-zoom');
    const V = { zoom: 1, panX: 0, panY: 0 };
    let G = { nodes: [], edges: [], bands: [] }, byId = new Map(), dims = new Map(), bandGeo = [], sel = new Set();
    let dirty = true, lastInteract = 0, frame = 0, raf = 0, alive = true, worldW = 1000, worldH = 800;
    let groupsOn = false, boxGeo = [], gEdges = [], selGroup = null, lastLevel = null;
    const level = () => groupsOn && V.zoom < Z_SYS ? 'systems' : V.zoom < FAR ? 'components' : 'detail';

    const s2w = (sx, sy) => ({ x: (sx - V.panX) / V.zoom, y: (sy - V.panY) / V.zoom });
    const rect = () => el.getBoundingClientRect();
    function applyT() {
      world.style.transform = `translate(${V.panX}px,${V.panY}px) scale(${V.zoom})`;
      el.classList.toggle('ac-far', V.zoom < FAR);
      const lv = level();
      for (const k of Object.keys(LEVELS)) el.classList.toggle(`ac-lvl-${k}`, lv === k);
      el.classList.toggle('ac-grouped', groupsOn);
      zoomEl.textContent = `${groupsOn || lv !== 'components' ? `${LEVELS[lv].label} · ` : ''}${Math.round(V.zoom * 100)}%`;
      if (lv !== lastLevel) { lastLevel = lv; if (opts.onLevel) opts.onLevel(lv); }
      dirty = true;
    }
    function zoomToward(f, cx, cy) {
      const wx = (cx - V.panX) / V.zoom, wy = (cy - V.panY) / V.zoom;
      V.zoom = Math.max(0.08, Math.min(2.5, V.zoom * f));
      V.panX = cx - wx * V.zoom; V.panY = cy - wy * V.zoom; applyT();
    }
    function resize() {
      const r = rect(), dpr = window.devicePixelRatio || 1;
      for (const c of [bg, wires]) { c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr); c.style.width = r.width + 'px'; c.style.height = r.height + 'px'; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
      dirty = true;
    }
    const dim = (id) => { if (!dims.has(id)) { const n = byId.get(id); dims.set(id, n && n.el ? { w: n.el.offsetWidth || opts.nodeW, h: n.el.offsetHeight || 80 } : { w: opts.nodeW, h: 80 }); } return dims.get(id); };

    // ── focus: the selection, what it needs, what needs it ──
    function related() {
      if (sel.size !== 1) return null;
      const id = [...sel][0], needs = new Set(), uses = new Set();
      for (const e of G.edges) { if (e.from === id) needs.add(e.to); if (e.to === id) uses.add(e.from); }
      return { id, needs, uses };
    }
    function paintFocus() {
      const r = related();
      el.classList.toggle('ac-focus', !!r);
      for (const n of G.nodes) {
        if (!n.el) continue;
        n.el.classList.toggle('ac-sel', sel.has(n.id));
        n.el.classList.toggle('ac-need', !!r && r.needs.has(n.id));
        n.el.classList.toggle('ac-use', !!r && r.uses.has(n.id));
        n.el.classList.toggle('ac-lit', !r || n.id === r.id || r.needs.has(n.id) || r.uses.has(n.id));
        n.el.setAttribute('aria-selected', sel.has(n.id));
      }
      dirty = true;
    }
    function setSel(ids, notify = true) { sel = new Set(ids); if (sel.size) selGroup = null; paintFocus(); paintGroups(); if (notify && opts.onSelect) opts.onSelect([...sel]); }
    /** a system selected (systems level): it, what it needs (yellow) and what needs it (magenta) lit, the rest dimmed */
    function paintGroups() {
      const needs = new Set(), uses = new Set();
      if (selGroup) for (const e of gEdges) { if (e.from === selGroup) needs.add(e.to); if (e.to === selGroup) uses.add(e.from); }
      world.querySelectorAll('.ac-group').forEach(b => {
        const k = b.dataset.group;
        b.classList.toggle('ac-sel', k === selGroup); b.classList.toggle('ac-need', needs.has(k)); b.classList.toggle('ac-use', uses.has(k));
        b.classList.toggle('ac-dim', !!selGroup && k !== selGroup && !needs.has(k) && !uses.has(k));
      });
      dirty = true;
    }
    function setGroup(key, notify = true) { selGroup = key; sel = new Set(); paintFocus(); paintGroups(); if (notify && opts.onSelectGroup) opts.onSelectGroup(key); }

    // ── drawing ──
    function drawBg() {
      const r = rect(), ctx = bg.getContext('2d');
      ctx.clearRect(0, 0, r.width, r.height);
      const gs = 40 * V.zoom; if (gs < 8) return;
      const ox = ((V.panX % gs) + gs) % gs, oy = ((V.panY % gs) + gs) % gs;
      ctx.fillStyle = 'rgba(0,212,255,0.07)';
      for (let x = ox; x < r.width; x += gs) for (let y = oy; y < r.height; y += gs) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
    }
    function anchor(id, top) {
      const n = byId.get(id); if (!n) return null;
      const d = dim(id);
      return { x: (n.x + d.w / 2) * V.zoom + V.panX, y: (n.y + (top ? 0 : d.h)) * V.zoom + V.panY };
    }
    function drawSystemWires(ctx, t) {
      const at = (k, top) => { const b = boxGeo.find(x => x.key === k); return b && { x: (b.x + b.w / 2) * V.zoom + V.panX, y: (b.y + (top ? 0 : b.h)) * V.zoom + V.panY, b }; };
      const parts = [];
      gEdges.forEach((e, i) => {
        const fa = boxGeo.find(x => x.key === e.from), ta = boxGeo.find(x => x.key === e.to); if (!fa || !ta) return;
        const up = fa.y + fa.h <= ta.y + 1 || fa.y < ta.y;
        const p = at(e.from, !up), q = at(e.to, up);
        let col = up ? EDGE.dep : EDGE.breach, alpha = 0.5;
        if (selGroup) { if (e.from === selGroup) { col = up ? EDGE.need : EDGE.breach; alpha = 0.95; } else if (e.to === selGroup) { col = up ? EDGE.use : EDGE.breach; alpha = 0.95; } else alpha = 0.07; }
        const w = Math.min(9, 1.2 + Math.log2(1 + e.count) * 1.3);
        const dy = Math.max(50, Math.abs(q.y - p.y) * 0.5);
        const c1 = { x: p.x, y: p.y + (up ? dy : -dy) }, c2 = { x: q.x, y: q.y + (up ? -dy : dy) };
        ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, q.x, q.y); ctx.stroke();
        if (alpha > 0.3) {
          const mx = 0.125 * p.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * q.x, my = 0.125 * p.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * q.y;
          ctx.font = '500 11px "DM Mono", monospace'; ctx.textAlign = 'center';
          const label = String(e.count), tw = ctx.measureText(label).width + 10;
          ctx.fillStyle = 'rgba(3,5,8,.92)'; ctx.fillRect(mx - tw / 2, my - 9, tw, 18);
          ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2, my - 9, tw, 18);
          ctx.fillStyle = rgba(col, 1); ctx.fillText(label, mx, my + 4);
          if (!REDUCED) for (let k = 0; k < Math.min(3, Math.ceil(e.count / 8)); k++) {
            const s2 = 1 - ((t * 0.18 + k / 3 + i * 0.11) % 1), v = 1 - s2;
            parts.push({ x: v ** 3 * q.x + 3 * v * v * s2 * c2.x + 3 * v * s2 * s2 * c1.x + s2 ** 3 * p.x, y: v ** 3 * q.y + 3 * v * v * s2 * c2.y + 3 * v * s2 * s2 * c1.y + s2 ** 3 * p.y, col });
          }
        }
      });
      ctx.shadowBlur = 8;
      for (const pt of parts) { ctx.shadowColor = rgba(pt.col, 1); ctx.fillStyle = rgba(pt.col, 1); ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    function drawWires(t) {
      const r = rect(), ctx = wires.getContext('2d');
      ctx.clearRect(0, 0, r.width, r.height);
      if (level() === 'systems') return drawSystemWires(ctx, t);
      const foc = related(), m = 140;
      const lines = [], parts = [];
      for (let i = 0; i < G.edges.length; i++) {
        const e = G.edges[i];
        const fn = byId.get(e.from), tn = byId.get(e.to);
        if (!fn || !tn) continue;
        // the needer (from) normally sits above what it needs (to): wire from the needer's foot to the need's head;
        // a needer drawn below (an inversion) wires from its head to the need's foot
        const up = fn.y <= tn.y;
        const p = anchor(e.from, !up), q = anchor(e.to, up);
        if ((p.x < -m && q.x < -m) || (p.x > r.width + m && q.x > r.width + m) || (p.y < -m && q.y < -m) || (p.y > r.height + m && q.y > r.height + m)) continue;
        let col = EDGE[e.kind] || EDGE.dep, alpha = e.kind === 'external' ? 0.35 : e.kind === 'event' ? 0.4 : 0.55, width = 1.2;
        if (foc) {
          if (e.from === foc.id) { col = e.kind === 'breach' || e.kind === 'gap' ? EDGE.breach : EDGE.need; alpha = 0.95; width = 2; }
          else if (e.to === foc.id) { col = e.kind === 'breach' ? EDGE.breach : EDGE.use; alpha = 0.95; width = 2; }
          else { alpha = 0.06; }
        }
        const dy = Math.max(40, Math.abs(q.y - p.y) * 0.5);
        const c1 = { x: p.x, y: p.y + (up ? dy : -dy) }, c2 = { x: q.x, y: q.y + (up ? -dy : dy) };
        lines.push({ p, q, c1, c2, col, alpha, width: width * Math.max(0.7, Math.min(1.4, V.zoom)), dash: e.kind === 'gap' || e.kind === 'external' || e.kind === 'event' });
        if (!REDUCED && alpha > 0.3) {
          // the particle travels from what is needed to what needs it — support flows upward
          const s = 1 - ((t * 0.22 + (i * 0.137) % 1) % 1), v = 1 - s;
          const bx = v ** 3 * q.x + 3 * v * v * s * c2.x + 3 * v * s * s * c1.x + s ** 3 * p.x;
          const by = v ** 3 * q.y + 3 * v * v * s * c2.y + 3 * v * s * s * c1.y + s ** 3 * p.y;
          parts.push({ x: bx, y: by, col, r: Math.max(1, 1.7 * V.zoom) });
        }
      }
      for (const l of lines) {
        ctx.strokeStyle = rgba(l.col, l.alpha); ctx.lineWidth = l.width; ctx.setLineDash(l.dash ? [5, 5] : []);
        ctx.beginPath(); ctx.moveTo(l.p.x, l.p.y); ctx.bezierCurveTo(l.c1.x, l.c1.y, l.c2.x, l.c2.y, l.q.x, l.q.y); ctx.stroke();
        // the arrowhead at what is needed
        const ang = Math.atan2(l.q.y - l.c2.y, l.q.x - l.c2.x), s = 5 * Math.max(0.7, V.zoom);
        ctx.setLineDash([]); ctx.fillStyle = rgba(l.col, Math.min(1, l.alpha + 0.1));
        ctx.beginPath(); ctx.moveTo(l.q.x, l.q.y); ctx.lineTo(l.q.x - s * Math.cos(ang - 0.45), l.q.y - s * Math.sin(ang - 0.45)); ctx.lineTo(l.q.x - s * Math.cos(ang + 0.45), l.q.y - s * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 6;
      for (const p of parts) { ctx.shadowColor = rgba(p.col, 1); ctx.fillStyle = rgba(p.col, 0.95); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
      if (link) {
        const a = anchor(link.from, true);
        ctx.strokeStyle = 'rgba(255,204,0,.8)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(link.x, link.y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    function drawMini() {
      const W = miniBox.clientWidth, H = miniBox.clientHeight; if (!W) return;
      mini.width = W; mini.height = H;
      const ctx = mini.getContext('2d');
      ctx.fillStyle = 'rgba(3,5,8,.92)'; ctx.fillRect(0, 0, W, H);
      if (!G.nodes.length) return;
      const sc = Math.min((W - 10) / worldW, (H - 10) / worldH), ox = (W - worldW * sc) / 2, oy = (H - worldH * sc) / 2;
      for (const b of bandGeo) { ctx.fillStyle = 'rgba(0,212,255,.035)'; ctx.fillRect(ox, oy + b.y * sc, worldW * sc, b.h * sc); }
      for (const b of boxGeo) { ctx.strokeStyle = b.key === selGroup ? '#ffffff' : (b.color || 'rgba(0,212,255,.5)'); ctx.lineWidth = 1; ctx.strokeRect(ox + b.x * sc, oy + b.y * sc, b.w * sc, b.h * sc); }
      for (const n of G.nodes) { ctx.fillStyle = sel.has(n.id) ? '#ffffff' : (n.color || '#00d4ff'); ctx.fillRect(ox + n.x * sc, oy + n.y * sc, Math.max(2, opts.nodeW * sc), Math.max(2, 60 * sc)); }
      const r = rect();
      ctx.strokeStyle = 'rgba(0,212,255,.6)'; ctx.lineWidth = 1;
      ctx.strokeRect(ox + (-V.panX / V.zoom) * sc, oy + (-V.panY / V.zoom) * sc, (r.width / V.zoom) * sc, (r.height / V.zoom) * sc);
      miniBox._map = { sc, ox, oy };
    }
    function loop() {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || !el.offsetParent) return;
      frame++;
      const idle = Date.now() - lastInteract > 2000;
      const animate = !REDUCED && (G.edges.length > 0 || gEdges.length > 0);
      if (!dirty && !animate) return;
      if (idle && !dirty && frame % 2) return;   // 30fps idle, 60 while working
      drawBg(); drawWires(Date.now() / 1000);
      if (dirty || frame % 8 === 0) drawMini();
      dirty = false;
    }

    // ── the graph ──
    function setGraph(g, { keepView = false } = {}) {
      const prev = byId;
      G = { nodes: g.nodes || [], edges: (g.edges || []).filter(e => e.from !== e.to), bands: g.bands || [], groups: g.groups || [] };
      groupsOn = G.groups.length > 1 && G.nodes.some(n => n.group);
      if (!groupsOn) { boxGeo = []; gEdges = []; selGroup = null; }
      byId = new Map(G.nodes.map(n => [n.id, n])); dims = new Map();
      for (const n of G.nodes) { const p = prev.get(n.id); if (p && !Number.isFinite(n.x)) { n.x = p.x; n.y = p.y; n.pinned = p.pinned; } }
      sel = new Set([...sel].filter(id => byId.has(id)));
      world.innerHTML = '';
      const bandLayer = document.createElement('div'); bandLayer.className = 'ac-bands'; world.appendChild(bandLayer);
      const groupLayer = document.createElement('div'); groupLayer.className = 'ac-groups'; world.appendChild(groupLayer);
      for (const n of G.nodes) {
        const d = document.createElement('div');
        d.className = `ac-node ${n.cls || ''}`; d.dataset.id = n.id; d.tabIndex = 0; d.setAttribute('role', 'button');
        d.style.setProperty('--ac-color', n.color || '#00d4ff'); d.style.width = opts.nodeW + 'px';
        d.innerHTML = `<div class="ac-frame">${n.html || esc(n.id)}</div>${opts.linkable ? '<span class="ac-handle" title="DRAG ONTO WHAT THIS NEEDS"></span>' : ''}`;
        world.appendChild(d); n.el = d;
      }
      relayout(!keepView);
      paintFocus(); paintGroups();
    }
    function relayout(fit, all = false) {
      if (groupsOn) return relayoutGrouped(fit, all);
      world.querySelector('.ac-groups').innerHTML = '';
      const L = layout(G.nodes.map(n => ({ id: n.id, band: n.band, label: n.label, x: n.x, y: n.y, pinned: all ? false : n.pinned })), G.edges, G.bands, Object.assign({ nodeW: opts.nodeW }, opts.layout || {}));
      bandGeo = L.bands; worldW = L.width; worldH = L.height;
      for (const n of G.nodes) { const p = L.pos[n.id]; n.x = p.x; n.y = p.y; if (all) n.pinned = false; n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; }
      const bl = world.querySelector('.ac-bands');
      // a band runs the canvas's whole width — strata, not boxes; its name sits at the content's left edge
      const SPAN = 6000;
      bl.innerHTML = L.bands.map((b, i) => `<div class="ac-band ${i % 2 ? 'alt' : ''}" style="top:${b.y}px;height:${b.h}px;left:${-SPAN}px;width:${L.width + SPAN * 2}px${b.color ? `;--ac-band:${b.color}` : ''}"><span class="ac-band-label" style="left:${SPAN + 14}px">${esc(b.label)}<b>${b.count}</b></span></div>`).join('');
      dims = new Map();
      if (fit) requestAnimationFrame(() => fitView());
      dirty = true;
    }
    /** the two-level map: systems as boxes, bottom-up by what they need; each system's components inside it (AZ1) */
    function relayoutGrouped(fit, all) {
      const L = layoutGrouped(G.nodes.map(n => ({ id: n.id, band: n.band, label: n.label, group: n.group })), G.edges, G.groups, G.bands,
        Object.assign({ nodeW: opts.nodeW }, opts.layout || {}));
      boxGeo = L.boxes; gEdges = L.gEdges; worldW = L.width; worldH = L.height; bandGeo = [];
      for (const n of G.nodes) { const p = (!all && n.pinned && Number.isFinite(n.x)) ? { x: n.x, y: n.y } : L.pos[n.id]; if (!p) continue; n.x = p.x; n.y = p.y; if (all) n.pinned = false; n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; }
      world.querySelector('.ac-bands').innerHTML = '';
      const needs = (k) => gEdges.filter(e => e.from === k), uses = (k) => gEdges.filter(e => e.to === k);
      world.querySelector('.ac-groups').innerHTML = L.boxes.map(b => {
        const g = G.groups.find(x => x.key === b.key) || {};
        const nIn = needs(b.key), nOut = uses(b.key);
        const summary = typeof opts.groupHtml === 'function' ? opts.groupHtml(b, { needs: nIn, usedBy: nOut })
          : `<div class="ac-gstat"><b>${b.count}</b> COMPONENTS</div><div class="ac-gstat"><b>${nIn.length}</b> SYSTEMS IT NEEDS · <b>${nOut.length}</b> NEED IT</div>`;
        // the system card's type scales with its box, so a big system reads as clearly as a small one at the SYSTEMS level
        // title + up to three one-line stats + a hint must fit the box: height ≈ gt + 3 × 1.35·gs + 0.9·gs, gs = 0.3·gt
        const gt = Math.round(Math.max(28, Math.min(b.w / Math.max(4, b.label.length * 0.66), (b.h - 40) / 2.75, 240)));
        return `<div class="ac-group ${b.cyclic ? 'cyclic' : ''}" data-group="${esc(b.key)}" tabindex="0" role="button" aria-label="${esc(b.label)}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--gt:${gt}px;--gs:${Math.round(gt * 0.3)}px${g.color ? `;--ac-band:${g.color}` : ''}">
          <div class="ac-ghead"><span class="ac-gname">${esc(b.label)}</span><span class="ac-gmeta">${b.count} · LEVEL ${b.level}${b.cyclic ? ' · IN A CYCLE' : ''}</span></div>
          <div class="ac-gcard"><div class="ac-gtitle">${esc(b.label)}</div>${summary}<div class="ac-ghint">DOUBLE-CLICK TO OPEN · ${b.cyclic ? 'NEEDS SYSTEMS THAT NEED IT' : `LEVEL ${b.level}`}</div></div></div>`;
      }).join('');
      dims = new Map();
      if (fit) requestAnimationFrame(() => fitView());
      dirty = true;
    }
    function openGroup(key) {
      const b = boxGeo.find(x => x.key === key); if (!b) return;
      const r = rect(), ins = Object.assign({ t: 30, r: 30, b: 30, l: 30 }, typeof opts.inset === 'function' ? opts.inset() : {});
      const w = Math.max(120, r.width - ins.l - ins.r), h = Math.max(120, r.height - ins.t - ins.b);
      V.zoom = Math.max(Z_SYS + 0.02, Math.min(1.1, Math.min(w / b.w, h / b.h) * 0.94));
      V.panX = ins.l + (w - b.w * V.zoom) / 2 - b.x * V.zoom; V.panY = ins.t + (h - b.h * V.zoom) / 2 - b.y * V.zoom;
      selGroup = key; applyT(); paintGroups();
      if (opts.onSelectGroup) opts.onSelectGroup(key);
    }
    /** goLevel — the increments: SYSTEMS fits the whole map; COMPONENTS and DETAIL zoom to their step around the selection */
    function goLevel(lv) {
      if (lv === 'systems') { if (!groupsOn) return fitView(); fitView(); if (V.zoom >= Z_SYS) { const r = rect(); zoomToward((Z_SYS - 0.02) / V.zoom, r.width / 2, r.height / 2); } return; }
      const r = rect();
      let cx = r.width / 2, cy = r.height / 2;
      const one = sel.size === 1 && byId.get([...sel][0]);
      if (one) { const d = dim(one.id); cx = (one.x + d.w / 2) * V.zoom + V.panX; cy = (one.y + d.h / 2) * V.zoom + V.panY; }
      else if (selGroup) { const b = boxGeo.find(x => x.key === selGroup); if (b) { cx = (b.x + b.w / 2) * V.zoom + V.panX; cy = (b.y + b.h / 2) * V.zoom + V.panY; } }
      zoomToward(LEVELS[lv].zoom / V.zoom, cx, cy);
      V.panX += r.width / 2 - cx; V.panY += r.height / 2 - cy; applyT();
    }
    /** step — + and − stop on STEPS (the increments), toward the cursor or the centre */
    function step(dir, cx, cy) {
      const r = rect(); cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
      const next = dir > 0 ? STEPS.find(z => z > V.zoom * 1.01) : [...STEPS].reverse().find(z => z < V.zoom * 0.99);
      if (next) zoomToward(next / V.zoom, cx, cy);
    }
    /** fit — the whole map in what is left of the view once the page's overlays (toolbar, drawers, numbers) take theirs */
    function fitView() {
      const r = rect(); if (!r.width) return;
      const ins = Object.assign({ t: 30, r: 30, b: 30, l: 30 }, typeof opts.inset === 'function' ? opts.inset() : {});
      const w = Math.max(120, r.width - ins.l - ins.r), h = Math.max(120, r.height - ins.t - ins.b);
      V.zoom = Math.max(0.08, Math.min(1.1, Math.min(w / worldW, h / worldH)));
      V.panX = ins.l + (w - worldW * V.zoom) / 2; V.panY = ins.t + (h - worldH * V.zoom) / 2;
      applyT();
    }
    function center(id) {
      const n = byId.get(id); if (!n) return;
      const r = rect(), d = dim(id);
      V.zoom = Math.max(V.zoom, 0.7);
      V.panX = r.width / 2 - (n.x + d.w / 2) * V.zoom; V.panY = r.height / 2 - (n.y + d.h / 2) * V.zoom; applyT();
    }

    // ── interaction (MASTERMIND's, trimmed) ──
    let drag = null, pan = null, box = null, link = null, moved = false;
    const nodeAt = (t) => t && t.closest ? t.closest('.ac-node') : null;
    function down(e) {
      if (e.button !== 0 && e.button !== 1) return;
      lastInteract = Date.now();
      const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (e.target.closest('.ac-mini')) { goMini(sx, sy, r); return; }
      const h = e.target.closest('.ac-handle');
      if (h && opts.linkable) { const id = nodeAt(h).dataset.id; link = { from: id, x: sx, y: sy }; el.classList.add('ac-linking'); e.preventDefault(); return; }
      const gEl = e.target.closest && e.target.closest('.ac-group');
      const nEl0 = nodeAt(e.target);
      if (gEl && !nEl0 && e.button === 0 && (level() === 'systems' || e.target.closest('.ac-ghead'))) {
        // a system: select it (its needs and users lit); drag still pans
        setGroup(gEl.dataset.group);
        pan = { x: e.clientX - V.panX, y: e.clientY - V.panY, sx: e.clientX, sy: e.clientY, keep: true }; el.classList.add('ac-panning');
        e.preventDefault(); return;
      }
      const nEl = nEl0;
      if (nEl && e.button === 0 && !e.target.closest('button, a, input, textarea, select')) {
        const id = nEl.dataset.id;
        if (e.shiftKey || e.metaKey || e.ctrlKey) { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); }
        else if (!sel.has(id)) setSel([id]);
        const w = s2w(sx, sy);
        drag = { start: w, items: [...sel].map(i => { const n = byId.get(i); return { n, x: n.x, y: n.y }; }) }; moved = false;
        e.preventDefault(); return;
      }
      if (!nEl) {
        if (e.shiftKey) { box = { x: sx, y: sy }; selbox.style.display = 'block'; Object.assign(selbox.style, { left: sx + 'px', top: sy + 'px', width: 0, height: 0 }); }
        else { pan = { x: e.clientX - V.panX, y: e.clientY - V.panY, sx: e.clientX, sy: e.clientY }; el.classList.add('ac-panning'); }
        e.preventDefault();
      }
    }
    function move(e) {
      if (!drag && !pan && !box && !link) return;
      lastInteract = Date.now();
      const r = rect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (pan) { V.panX = e.clientX - pan.x; V.panY = e.clientY - pan.y; applyT(); return; }
      if (link) { link.x = sx; link.y = sy; const t = nodeAt(document.elementFromPoint(e.clientX, e.clientY)); el.querySelectorAll('.ac-target').forEach(x => x.classList.remove('ac-target')); if (t && t.dataset.id !== link.from) t.classList.add('ac-target'); dirty = true; return; }
      if (drag) {
        const w = s2w(sx, sy), dx = w.x - drag.start.x, dy = w.y - drag.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        for (const it of drag.items) { it.n.x = Math.round(it.x + dx); it.n.y = Math.round(it.y + dy); it.n.el.style.left = it.n.x + 'px'; it.n.el.style.top = it.n.y + 'px'; }
        dirty = true; return;
      }
      if (box) {
        const x = Math.min(sx, box.x), y = Math.min(sy, box.y), w = Math.abs(sx - box.x), h = Math.abs(sy - box.y);
        Object.assign(selbox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        const a = s2w(x, y), b = s2w(x + w, y + h);
        sel = new Set(G.nodes.filter(n => n.x + dim(n.id).w > a.x && n.x < b.x && n.y + dim(n.id).h > a.y && n.y < b.y).map(n => n.id));
        paintFocus();
      }
    }
    function up(e) {
      if (link) {
        const t = nodeAt(document.elementFromPoint(e.clientX, e.clientY));
        el.querySelectorAll('.ac-target').forEach(x => x.classList.remove('ac-target'));
        el.classList.remove('ac-linking');
        const from = link.from; link = null; dirty = true;
        if (t && t.dataset.id !== from && opts.onLink) opts.onLink(from, t.dataset.id);
        return;
      }
      if (drag) {
        if (moved) { for (const it of drag.items) it.n.pinned = true; if (opts.onMove) opts.onMove(drag.items.map(it => ({ id: it.n.id, x: it.n.x, y: it.n.y }))); }
        drag = null;
      }
      if (pan) { if (!pan.keep && Math.abs(e.clientX - pan.sx) + Math.abs(e.clientY - pan.sy) < 3 && !e.target.closest('.ac-node')) { if (selGroup) setGroup(null); setSel([]); } pan = null; el.classList.remove('ac-panning'); }
      if (box) { box = null; selbox.style.display = 'none'; if (opts.onSelect) opts.onSelect([...sel]); }
    }
    function goMini(sx, sy, r) {
      const m = miniBox._map; if (!m) return;
      const mr = miniBox.getBoundingClientRect(), mx = sx + r.left - mr.left, my = sy + r.top - mr.top;
      const wx = (mx - m.ox) / m.sc, wy = (my - m.oy) / m.sc;
      V.panX = r.width / 2 - wx * V.zoom; V.panY = r.height / 2 - wy * V.zoom; applyT();
    }
    function wheel(e) { e.preventDefault(); lastInteract = Date.now(); const r = rect(); zoomToward(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); }
    function dbl(e) {
      const n = nodeAt(e.target); if (n && opts.onOpen) return opts.onOpen(n.dataset.id);
      const g = e.target.closest && e.target.closest('.ac-group'); if (g) openGroup(g.dataset.group);   // into the system
    }
    function key(e) {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const n = nodeAt(e.target);
      if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSel([n.dataset.id]); return; }
      const gk = e.target.closest && e.target.closest('.ac-group');
      if (gk && !n && e.key === 'Enter') { e.preventDefault(); openGroup(gk.dataset.group); return; }
      if (e.key === '1') return goLevel('systems');
      if (e.key === '2') return goLevel('components');
      if (e.key === '3') return goLevel('detail');
      if (e.key === 'Escape') { setSel([]); return; }
      if (e.key === 'f' || e.key === 'F') { fitView(); return; }
      if (e.key === '+' || e.key === '=') return step(1);
      if (e.key === '-') return step(-1);
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size && opts.onDelete) { e.preventDefault(); opts.onDelete([...sel]); }
    }
    // touch: one finger pans (or drags a card), two pinch (MASTERMIND's)
    let pinch = null, tdrag = null;
    function tstart(e) {
      lastInteract = Date.now();
      if (e.touches.length === 2) { const [a, b] = e.touches; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); tdrag = null; return; }
      const t = e.touches[0], nEl = nodeAt(document.elementFromPoint(t.clientX, t.clientY));
      if (nEl) { const n = byId.get(nEl.dataset.id); setSel([n.id]); const r = rect(), w = s2w(t.clientX - r.left, t.clientY - r.top); tdrag = { n, ox: w.x - n.x, oy: w.y - n.y, moved: false }; }
      else tdrag = { pan: true, x: t.clientX - V.panX, y: t.clientY - V.panY };
    }
    function tmove(e) {
      e.preventDefault(); lastInteract = Date.now();
      if (e.touches.length === 2 && pinch) { const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = rect(); zoomToward(d / pinch, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top); pinch = d; return; }
      const t = e.touches[0]; if (!tdrag) return;
      if (tdrag.pan) { V.panX = t.clientX - tdrag.x; V.panY = t.clientY - tdrag.y; applyT(); return; }
      const r = rect(), w = s2w(t.clientX - r.left, t.clientY - r.top);
      tdrag.n.x = Math.round(w.x - tdrag.ox); tdrag.n.y = Math.round(w.y - tdrag.oy); tdrag.moved = true;
      tdrag.n.el.style.left = tdrag.n.x + 'px'; tdrag.n.el.style.top = tdrag.n.y + 'px'; dirty = true;
    }
    function tend(e) { if (e.touches.length < 2) pinch = null; if (!e.touches.length && tdrag) { if (tdrag.n && tdrag.moved) { tdrag.n.pinned = true; if (opts.onMove) opts.onMove([{ id: tdrag.n.id, x: tdrag.n.x, y: tdrag.n.y }]); } tdrag = null; } }

    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    el.addEventListener('keydown', key);
    el.addEventListener('touchstart', tstart, { passive: true });
    el.addEventListener('touchmove', tmove, { passive: false });
    el.addEventListener('touchend', tend);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    if (ro) ro.observe(el); else window.addEventListener('resize', resize);
    el.tabIndex = el.tabIndex >= 0 ? el.tabIndex : 0;
    resize(); applyT(); loop();

    return {
      setGraph, fit: fitView, center, resize,
      layout: ({ all = false } = {}) => relayout(true, all),
      zoomBy: (f) => { const r = rect(); zoomToward(f, r.width / 2, r.height / 2); },
      step, goLevel, openGroup, level, selectGroup: (k) => setGroup(k, false), groups: () => boxGeo.map(b => ({ ...b })), systemWires: () => gEdges.map(e => ({ ...e })),
      select: (id) => setSel(id ? [id] : [], false),
      selected: () => [...sel],
      positions: () => G.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, pinned: !!n.pinned })),
      view: () => ({ ...V }),
      destroy() {
        alive = false; cancelAnimationFrame(raf);
        window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
        if (ro) ro.disconnect(); el.innerHTML = ''; el.classList.remove('ac');
      },
    };
  }

  const API = { layout, layoutGrouped, groupLevels, crossings, card, mount, FAR, LEVELS };
  root.ArchCanvas = API;   // a plain script in the page; in node (idearium is an ES-module package) the tests read the global
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
