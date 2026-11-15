/* ERAVOS core — field/field.js → window.Workshop (3.150, W1 flat; the Field — moved from canvas/runtime/workshop.js 2026-11-13, specs/eravos.bare-canvas.spec BC1). Domain-free: it names no domain and no topic; every word, field and
 * picture comes from the KIND that is open (specs/eravos.workshop.spec and its ADDENDA 2026-11-07).
 * His words, 2026-11-07: "can you make it more like photoshop? or like a 3d renderer? then it could support a game engine, like this could be
 * the build surface for emerge." · "Yeah, we can just start with this. The small, like just the flat". The approved preview:
 * docs/previews/workshop-studio.png (its 3D viewport, its time lane and its asset browser are later phases).
 * The surface: a bar (name, the kind's stations, Apply, close) · the options bar (the selected layer's fields) · a tool strip (the kind's tools) ·
 * a tab per open document · ONE flat viewport (the kind draws it) · OUTLINER · LAYERS (grouped, as the kind groups them) · INSPECTOR / HISTORY ·
 * a status bar. Every edit is one undo step (Ctrl+Z / Ctrl+Shift+Z, or a click in HISTORY); every edit reaches its owner at once (live).
 *   Workshop.check(kind) → [] or the problems, in words · Workshop.addKind(kind) → { ok, problems } · Workshop.kinds()
 *   Workshop.open(kindId, doc, { onChange(doc), onApply(doc), onClose(), title }) → { doc(), set(key, v), select(layerId), undo(), redo(),
 *     history(), close(), el } · Workshop.current
 * I1 open(…, { onLive(doc) }): called with the previewed document while a drag moves (before it is kept); kind.toolset: the tool ids it offers.
 * W3h actions with `strip: true` sit at the top right of the bar, with ✕ close, and nowhere else (2026-11-12: no duplicates); hint(doc, { tool, mode, selected }) → a line of help in the
 *   view; in 3D every layer is a plane (2026-11-12, as at 3.156) and a click picks a plane — a shape first where planes overlap.
 * W3g drag(doc, tool, points, W, H, { selected, phase, alt, shift }) → { key, value, label } (the toolbar: pen line points smooth move erase);
 *   bar(doc) → fields shown in the options bar (a document-wide value the kind names).
 * W3f picker(doc) → { label, key, value, options: [{ value, label } | { group, options }] } (a dropdown first in the options bar; a change is
 *   edit(key, value)); pick may return { run } (a click that changes the view, not the document — no history).
 * W3e the layout: the bar = the path only; options bar = the view; tools V B O; PROPERTIES (the one place a value is edited) · HISTORY ·
 *   OUTLINER over LAYERS (eye, thumbnail, name, folding groups, footer tools = actions with `icon`); keys (an action's `keys`, e.g. 'Space',
 *   'Mod+Enter', 'Shift+A'; `open: true` = what Enter / a double-click does) and right-click menus (an action's `only`: 'layer' | 'view').
 * W3a (optional): drawLayer(g, W, H, doc, layerId, { wire, selected }) → the 3D viewport (layers as planes) · stroke(doc, points, W, H,
 *   { selected }) → { key, value, label } (a drag that draws) · drag(doc, tool, pts, W, H, { selected, phase, norm }) — norm: pts are 0–1
 *   across and up on the selected layer's plane (a drag in 3D; only for a kind with planeDraw: true) · actions(doc, { selected }) items may be { label, key, value } (an edit) ·
 *   stationKey (a station click = edit(stationKey, index)).
 * A kind: { id, label, layers(doc) → [{ id, label, group, type, sub, fields: [{ key, label, type: number|enum|text, min, max, step, unit,
 *   options }] }], get(doc, key), set(doc, key, value) → doc, draw(g, W, H, doc, { selected, hover }), apply(doc)?, title(doc)?, stations(doc)?,
 *   outline(doc)? → [[depth, text, layerId?, { key, value, label }?]] (a click selects the layer and makes the edit — e.g. opens that item), status(doc)? → [[label, value]], tools? [{ id, label, glyph, layer? }],
 *   addable(doc)? → [{ section?, label, key, value, hint? }] — the layers that can be made: ＋ on LAYERS, Ctrl+Shift+N, right-click › NEW LAYER
 *     (each an edit; his words, 2026-11-12: "why cant i add layers?"),
 *   pick(doc, x, y, W, H, { selected, tool })? → a key/value edit for a click in the viewport (the kind decides what a click means; a tool may take it),
 *   actions(doc)? → [{ label, hint, run(doc) → words to show }] (buttons in the bar: where the document can go — the kind says) }
 * Layer types the surface knows (it draws their badges; a kind says what they mean): constraint · curve · value · events · emergent. */
(function (global) {
  'use strict';
  const doc = global.document; if (!doc) return;
  const TYPES = ['constraint', 'curve', 'value', 'events', 'emergent', 'raster', 'adjust'];
  const KINDS = new Map();
  let CLIP = null;   // 2026-11-13 layers: a copied layer ({ kind, data }) — kept across documents, so a layer copied on one note pastes onto another
  const el = (tag, cls, kids, attrs) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (attrs) Object.keys(attrs).forEach(k => { if (k === 'text') e.textContent = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] === false || attrs[k] == null) { /* a false flag is no attribute (disabled: false must not disable) */ } else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }); (kids || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }); return e; };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function check(k) {
    const p = [];
    if (!k || typeof k !== 'object') return ['a kind is an object'];
    if (typeof k.id !== 'string' || !/^[a-z][\w.-]{1,60}$/.test(k.id)) p.push('id: a short lowercase name (' + JSON.stringify(k.id) + ')');
    if (typeof k.label !== 'string' || !k.label.trim()) p.push('label: a name people read');
    ['layers', 'get', 'set', 'draw'].forEach(f => { if (typeof k[f] !== 'function') p.push(f + ': missing (a function)'); });
    if (k.apply !== undefined && typeof k.apply !== 'function') p.push('apply: a function, when given');
    if (k.tools !== undefined && !Array.isArray(k.tools)) p.push('tools: a list');
    ['drawLayer', 'stroke', 'actions', 'pick'].forEach(f => { if (k[f] !== undefined && typeof k[f] !== 'function') p.push(f + ': a function, when given'); });
    return p;
  }
  function addKind(k) { const problems = check(k); if (!problems.length) KINDS.set(k.id, k); return { ok: !problems.length, problems }; }

  let current = null;
  function open(kindId, doc0, o) {
    o = o || {}; const K = KINDS.get(kindId); if (!K) throw new Error('Workshop: no kind "' + kindId + '"');
    if (current) current.close();
    let d = clone(doc0 || {}), selected = null, note = '', past = [], future = [], hist = [{ label: 'OPENED', doc: clone(d) }];
    const root = el('div', 'ws-app', [], { role: 'dialog', 'aria-label': K.label });
    const bar = el('div', 'ws-bar'), opts = el('div', 'ws-opts'), strip = el('div', 'ws-strip'), tabs = el('div', 'ws-tabs'), vp = el('div', 'ws-vp');
    const cv = el('canvas', 'ws-canvas'), vph = el('div', 'ws-vph'), hintline = el('div', 'ws-hintline'); vp.append(cv, hintline);   // W3h a line saying what to do here
    // W3a the viewport: 2D (the kind's draw) or 3D (the kind's layers as planes; K.drawLayer) — orbit, top, front, exploded / flat, wire / lit
    let mode = '2d', exploded = true, wire = false, cam = { yaw: -0.55, pitch: 0.62, zoom: 1 }, stroke = null, orbit = null;
    const offs = new Map(); let planes = [];   // W3h the 3D planes as drawn (a click picks one)
    const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / ((P[j][1] - P[i][1]) || 1e-9) + P[i][0]) c = !c; } return c; };
    const lays = el('div', 'ws-pane ws-layers'), insp = el('div', 'ws-pane ws-props'), status = el('div', 'ws-status');
    const right = el('div', 'ws-right', [insp, lays]), centre = el('div', 'ws-centre', [tabs, vp]);
    let hidden = new Set(); const folded = new Set();   // the eye and the folded groups (the view's, not the document's)
    // ---- LAYERS (2026-11-13, his words: "make sure we can edit, change and manipulate layers in workshop. Let's get that finished."): a kind says
    // what each layer can do (layerOps(doc, id, { clip }) → { enable, amount, rename, duplicate, remove, reset, move, copy, paste, label }) and
    // does it (set(doc, '@layer', { id, op, value })); copyLayer(doc, id) → what a copy carries. The canvas keeps LOCK (no edit reaches a locked
    // layer) and the clipboard. The eye turns a layer off in the result where the kind can (else it hides it from the view).
    const locked = new Set();
    const opsOf = (id) => { if (!K.layerOps || !id) return {}; try { return K.layerOps(d, id, { clip: CLIP && CLIP.kind === K.id ? CLIP.data : null }) || {}; } catch (e) { console.error(e); return {}; } };
    const opName = (ops, op, dflt) => (ops.label && ops.label[op]) || dflt;
    function refuse(why) { note = why; render(); return false; }
    function layerOp(id, op, value, label) {
      if (!id) return false; const ops = opsOf(id), lay = layerOf(id), nm = lay ? String(lay.label) : id;
      if (op === 'lock') { if (locked.has(id)) locked.delete(id); else locked.add(id); note = (locked.has(id) ? 'LOCKED ' : 'UNLOCKED ') + nm.toUpperCase(); render(); return true; }
      if (op === 'hide') { if (hidden.has(id)) hidden.delete(id); else hidden.add(id); render(); return true; }
      if (op === 'copy') { if (!ops.copy || !K.copyLayer) return false; const data = K.copyLayer(d, id); if (!data) return false; CLIP = { kind: K.id, data }; note = 'COPIED ' + nm.toUpperCase(); render(); return true; }
      if (op !== 'enable' && locked.has(id)) return refuse('LOCKED — unlock it (/) to change it');
      if (op === 'paste') { if (!ops.paste || !CLIP) return false; edit('@layer', { id, op, value: CLIP.data }, label || 'Paste ' + (CLIP.data.label || 'layer') + ' onto ' + nm); return true; }
      const can = op === 'enable' ? ops.enable !== undefined : op === 'amount' ? ops.amount !== undefined : !!ops[op]; if (!can) return false;
      edit('@layer', { id, op, value }, label || ({ enable: value ? 'Turn on ' : 'Turn off ', amount: 'Amount of ', rename: 'Rename ', duplicate: 'Duplicate ', remove: 'Delete ', reset: 'Reset ', move: 'Move ' }[op] || op + ' ') + nm);
      return true;
    }
    // a step up or down in its group (Ctrl+[ / ]): before the one above, after the one below
    function moveBy(id, dir) { const L = layers(), me = L.find(l => l.id === id); if (!me) return false; const grp = L.filter(l => opsOf(l.id).move), i = grp.indexOf(me), nb = grp[i + dir];   // the layers that move, among themselves (a modulator per group)
      return nb ? layerOp(id, 'move', dir < 0 ? { before: nb.id } : { after: nb.id }, (dir < 0 ? 'Move up ' : 'Move down ') + me.label) : false; }
    function renameAt(id) { const row = lays.querySelector('.ws-lay[data-id="' + (global.CSS && CSS.escape ? CSS.escape(id) : id) + '"] .ws-ln'), lay = layerOf(id); if (!row || !lay || !opsOf(id).rename || locked.has(id)) return false;
      const inp = el('input', 'ws-rename', [], { value: String(lay.label).replace(/ \(off\)$| · \d+ %$/, '') }); row.replaceChildren(inp); inp.focus(); inp.select();
      const done = (ok) => { inp.onblur = null; if (ok && inp.value.trim() !== String(lay.label)) layerOp(id, 'rename', inp.value); else render(); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }); inp.onblur = () => done(true); return true; }
    // the LAYER section of a layer's right-click menu: only what this layer can do
    function layerItems(l) {
      const ops = opsOf(l.id), lk = locked.has(l.id), it = [{ section: 'LAYER' }];
      if (ops.enable !== undefined) it.push({ label: ops.enable ? 'Turn off (it stops playing)' : 'Turn on', keys: '.', run: () => layerOp(l.id, 'enable', !ops.enable) });
      it.push({ label: hidden.has(l.id) ? 'Show it in the view' : 'Hide it from the view', keys: 'H', run: () => layerOp(l.id, 'hide') });
      if (ops.rename) it.push({ label: 'Rename…', keys: 'F2', disabled: lk, run: () => renameAt(l.id) });
      if (ops.duplicate) it.push({ label: 'Duplicate', keys: 'Mod+J', disabled: lk, run: () => layerOp(l.id, 'duplicate') });
      if (ops.copy) it.push({ label: 'Copy', keys: 'Mod+C', run: () => layerOp(l.id, 'copy') });
      if (ops.paste !== undefined || CLIP) it.push({ label: 'Paste' + (CLIP && CLIP.kind === K.id ? ' ' + (CLIP.data.label || '') : ''), keys: 'Mod+V', disabled: !ops.paste || lk, run: () => layerOp(l.id, 'paste') });
      if (ops.move) it.push({ label: 'Move up', keys: 'Mod+[', disabled: lk, run: () => moveBy(l.id, -1) }, { label: 'Move down', keys: 'Mod+]', disabled: lk, run: () => moveBy(l.id, 1) });
      if (ops.reset) it.push({ label: opName(ops, 'reset', 'Reset'), disabled: lk, run: () => layerOp(l.id, 'reset') });
      if (ops.remove) it.push({ label: opName(ops, 'remove', 'Delete'), keys: 'Delete', disabled: lk, run: () => layerOp(l.id, 'remove') });
      it.push({ label: lk ? 'Unlock' : 'Lock', keys: '/', run: () => layerOp(l.id, 'lock') });
      return it;
    }
    root.append(bar, opts, strip, centre, right, status);
    const layers = () => K.layers(d) || [];
    const layerOf = (id) => layers().find(l => l.id === id) || null;
    let inspTab = 'properties';

    function field(f, big) {
      if (f.key === '@amount') return amountField();
      const v = K.get(d, f.key), wrap = el('label', 'ws-f' + (big ? ' big' : ''), [el('span', 'ws-fk', [], { text: f.label || f.key })]);
      if (f.type === 'enum' && (f.options || []).length > (big ? 3 : 8)) {   // more than a few choices: one dropdown, not a wall of buttons
        const sel = el('select', 'ws-sel'); (f.options || []).forEach(op => { const o2 = el('option', '', [], { value: String(op), text: String(op) }); if (String(op) === String(v)) o2.selected = true; sel.appendChild(o2); });
        sel.addEventListener('change', () => edit(f.key, typeof v === 'number' ? +sel.value : sel.value, f.label)); wrap.appendChild(sel); }
      else if (f.type === 'enum') { const ch = el('span', 'ws-chips'); (f.options || []).forEach(op => ch.appendChild(el('button', 'ws-chip' + (String(op) === String(v) ? ' on' : ''), [], { type: 'button', text: String(op), onclick: () => edit(f.key, typeof v === 'number' ? +op : op, f.label) }))); wrap.appendChild(ch); }
      else if (f.type === 'number') { const inp = el('input', 'ws-num', [], { type: 'number', step: String(f.step || 1), value: String(v) }); if (f.min !== undefined) inp.min = f.min; if (f.max !== undefined) inp.max = f.max;
        inp.addEventListener('change', () => { let x = +inp.value; if (!isFinite(x)) return; if (f.min !== undefined) x = Math.max(f.min, x); if (f.max !== undefined) x = Math.min(f.max, x); edit(f.key, x, f.label); });
        wrap.appendChild(inp); if (f.unit) wrap.appendChild(el('span', 'ws-unit', [], { text: f.unit })); }
      else { const inp = el('input', 'ws-txt', [], { value: String(v == null ? '' : v) }); inp.addEventListener('change', () => edit(f.key, inp.value, f.label)); wrap.appendChild(inp); }
      return wrap;
    }
    // AMOUNT (0–100 %): how much of the selected layer plays — one place, in PROPERTIES
    function amountField() {
      const ops = opsOf(selected), v = Math.round((ops.amount === undefined ? 1 : ops.amount) * 100), wrap = el('label', 'ws-f big ws-amount', [el('span', 'ws-fk', [], { text: 'Amount' })]);
      const sl = el('input', 'ws-range', [], { type: 'range', min: '0', max: '100', step: '1', value: String(v), title: 'how much of this layer plays (0–100 %)' }), num = el('span', 'ws-unit', [], { text: v + ' %' });
      sl.addEventListener('input', () => { num.textContent = sl.value + ' %'; }); sl.addEventListener('change', () => layerOp(selected, 'amount', +sl.value / 100)); sl.addEventListener('keydown', (e) => e.stopPropagation());
      wrap.append(sl, num); return wrap;
    }
    function edit(key, value, label) {
      past.push(clone(d)); future = []; d = K.set(d, key, value) || d;
      if (d && d.__sel !== undefined) { if (d.__sel) selected = d.__sel; d = Object.assign({}, d); delete d.__sel; }   // 2026-11-13: the kind names the layer to select (a moved / duplicated / pasted one)
      hist.push({ label: (label || key) + (value !== null && typeof value === 'object' ? '' : ' · ' + (typeof value === 'number' ? +value.toFixed(3) : String(value))), doc: clone(d) }); if (hist.length > 200) hist.splice(1, 1);
      if (o.onChange) { try { o.onChange(clone(d)); } catch (e) { console.error(e); } } render();
    }
    function restore(x, label) { d = clone(x); if (o.onChange) { try { o.onChange(clone(d)); } catch (e) { console.error(e); } } hist.push({ label, doc: clone(d) }); render(); }
    function undo() { if (!past.length) return false; future.push(clone(d)); restore(past.pop(), 'UNDO'); return true; }
    function redo() { if (!future.length) return false; past.push(clone(d)); restore(future.pop(), 'REDO'); return true; }

    function draw() {
      const r = vp.getBoundingClientRect(), dpr = Math.min(2, global.devicePixelRatio || 1), W = Math.max(50, r.width), H = Math.max(50, r.height);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      try { if (mode === '3d' && K.drawLayer) draw3d(g, W, H, dpr); else K.draw(g, W, H, preview || d, { selected, hidden, tool }); } catch (e) { console.error(e); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stroke && stroke.pts.length > 1) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); stroke.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.setLineDash([]); }
    }
    function onPlane(pl, x, y) {
      const [p0, px, , pz] = pl.poly, ax = px[0] - p0[0], ay = px[1] - p0[1], bx = pz[0] - p0[0], by = pz[1] - p0[1], det = ax * by - ay * bx || 1e-9;
      const u = ((x - p0[0]) * by - (y - p0[1]) * bx) / det, v = (ax * (y - p0[1]) - ay * (x - p0[0])) / det;   // u across (0–1), v into the plane's rows (0–1)
      return [Math.max(0, Math.min(1, (u * 512 - 8) / 496)), Math.max(0, Math.min(1, 1 - (v * 256 - 8) / 240))];
    }
    // a plane in space is an affine map of its 2D drawing (near-orthographic camera): x = across the layer, z = into it, y = its height
    function proj(W, H, x, y, z) {
      const s = Math.min(W * 0.34, H * 0.5) * cam.zoom * fit, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      return [W / 2 + s * (x * cy - z * sy), H / 2 - s * y * cp + s * (x * sy + z * cy) * sp];
    }
    let fit = 1;   // the camera steps back so a tall stack stays in view (the user's zoom still applies on top)
    function draw3d(g, W, H, dpr) {
      // exploded: the layers keep their distance however many there are (it was 1.15 / n — fourteen stages ended 0.08 apart, one block);
      // the camera fits the stack instead. Few layers: the same view as before (fit stays 1)
      planes = []; const L = layers().filter(l => !l.hidden && !hidden.has(l.id)),   // every layer a plane, as at 3.156 (his: "it was exploded before")
        n = L.length, PW = 512, PH = 256, A = 1, B = 0.42, gap = exploded ? (n <= 2 ? 0.42 : Math.max(0.383, Math.min(0.42, 1.15 / n))) : 0.025;
      fit = 1; const z0 = cam.zoom; cam.zoom = 1; const top = ((n - 1) / 2) * gap, ext = [];
      [-top, top].forEach(h => [[-A, -B], [A, -B], [-A, B], [A, B]].forEach(([x, z]) => ext.push(proj(W, H, x, h, z)))); cam.zoom = z0;
      const ew = Math.max(...ext.map(q => q[0])) - Math.min(...ext.map(q => q[0])), eh = Math.max(...ext.map(q => q[1])) - Math.min(...ext.map(q => q[1]));
      fit = Math.min(1, (W * 0.86) / Math.max(1, ew), (H * 0.86) / Math.max(1, eh));
      g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
      // the floor: a faint grid under the stack
      const fy = -((n - 1) / 2) * gap - 0.18; g.strokeStyle = 'rgba(120,150,180,0.08)'; g.lineWidth = 1;
      for (let i = -6; i <= 6; i++) { let a = proj(W, H, i / 6 * 1.3, fy, -0.9), b = proj(W, H, i / 6 * 1.3, fy, 0.9); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        a = proj(W, H, -1.3, fy, i / 6 * 0.9); b = proj(W, H, 1.3, fy, i / 6 * 0.9); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      L.forEach((l, i) => {
        let o = offs.get(l.id); if (!o) { o = doc.createElement('canvas'); o.width = PW; o.height = PH; offs.set(l.id, o); }
        const og = o.getContext('2d'); og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, PW, PH);
        try { K.drawLayer(og, PW, PH, d, l.id, { wire, selected: l.id === selected }); } catch (e) { console.error(e); }
        const h = (i - (n - 1) / 2) * gap, p0 = proj(W, H, -A, h, -B), px = proj(W, H, A, h, -B), pz = proj(W, H, -A, h, B), p3 = proj(W, H, A, h, B);
        const sel = l.id === selected; planes.push({ id: l.id, type: l.type, poly: [p0, px, p3, pz] });
        // the plane: glass, its frame, its name
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(px[0], px[1]); g.lineTo(p3[0], p3[1]); g.lineTo(pz[0], pz[1]); g.closePath();
        if (!wire) { g.fillStyle = sel ? 'rgba(0,212,255,0.07)' : 'rgba(140,170,200,0.035)'; g.fill(); }
        g.strokeStyle = sel ? 'rgba(0,212,255,0.75)' : 'rgba(140,170,200,0.22)'; g.lineWidth = sel ? 1.4 : 1; g.stroke();
        g.setTransform(dpr * (px[0] - p0[0]) / PW, dpr * (px[1] - p0[1]) / PW, dpr * (pz[0] - p0[0]) / PH, dpr * (pz[1] - p0[1]) / PH, dpr * p0[0], dpr * p0[1]);
        if (!wire) g.globalCompositeOperation = 'lighter';
        g.drawImage(o, 0, 0); g.globalCompositeOperation = 'source-over';
        g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = sel ? '#00d4ff' : 'rgba(170,190,210,0.7)'; g.font = '10px "DM Mono", monospace';
        const lx = Math.min(p0[0], pz[0]) - 8; g.textAlign = 'right'; g.fillText(String(l.label).toUpperCase(), lx, (p0[1] + pz[1]) / 2 + 3); g.textAlign = 'left';
      });
      // the axis gizmo
      const gx = W - 46, gy = 46, ax = [[1, 0, 0, '#ff4d6d', 'X'], [0, 1, 0, '#2bff88', 'Y'], [0, 0, 1, '#00d4ff', 'Z']], o0 = proj(W, H, 0, 0, 0);
      g.strokeStyle = 'rgba(140,170,200,0.25)'; g.beginPath(); g.arc(gx, gy, 30, 0, Math.PI * 2); g.stroke();
      ax.forEach(([x, y, z, c, t]) => { const q = proj(W, H, x * 0.12 / cam.zoom, y * 0.12 / cam.zoom, z * 0.12 / cam.zoom); const dx = q[0] - o0[0], dy = q[1] - o0[1], k = 24 / Math.max(1e-6, Math.hypot(dx, dy) || 1) * Math.min(1, Math.hypot(dx, dy) / 8);
        g.strokeStyle = c; g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + dx * k, gy + dy * k); g.stroke(); g.fillStyle = c; g.fillText(t, gx + dx * k + 3, gy + dy * k + 3); });
    }
    function chips() {
      hintline.textContent = K.hint ? (K.hint(d, { tool, mode, selected }) || '') : '';   // W3h the help line follows the view
      if (!K.drawLayer) { vph.replaceChildren(); return; }
      const chip = (t, on, fn, title) => el('button', 'ws-chip' + (on ? ' on' : ''), [], { type: 'button', text: t, title: title || '', onclick: () => { fn(); chips(); draw(); } });
      vph.replaceChildren(chip('2D', mode === '2d', () => { mode = '2d'; }), chip('3D', mode === '3d', () => { mode = '3d'; }), el('span', 'ws-vs'),
        chip('TOP', mode === '3d' && cam.pitch > 1.5, () => { mode = '3d'; cam.pitch = Math.PI / 2 - 0.001; cam.yaw = 0; }, 'look down on the stack'),
        chip('FRONT', mode === '3d' && Math.abs(cam.yaw) < 0.01 && cam.pitch < 0.3, () => { mode = '3d'; cam.pitch = 0.18; cam.yaw = 0; }, 'look at it from the front'),
        chip('ORBIT', false, () => { mode = '3d'; cam = { yaw: -0.55, pitch: 0.62, zoom: 1 }; }, 'back to the turned view (Alt-drag to turn, wheel to zoom)'), el('span', 'ws-vs'),
        chip('EXPLODED', exploded, () => { exploded = true; }), chip('FLAT', !exploded, () => { exploded = false; }), el('span', 'ws-vs'),
        chip('WIRE', wire, () => { wire = true; }), chip('LIT', !wire, () => { wire = false; }));
    }
    // ---- W3e the layout (his words, 2026-11-09: "the ui needs more of a photoshop format. Like layers. I hate the top right. Add key bindings.
    // Right click context menus less explicit buttons … Like undo doesn't need a button … Shouldn't be two places to change [a value] either.
    // Replace the bottom right with a photoshop esc layers menu and group the layer tools there."): the bar holds only the path; the options
    // bar the view; the left strip the tools (V B O); the right column PROPERTIES (the ONE place a value is edited · HISTORY · OUTLINER)
    // over LAYERS (eye, thumbnail, name; groups that fold; the layer tools in its footer). Everything else: keys and right-click menus.
    const KEYS = (k) => String(k || '').replace('Mod+', /Mac/.test(global.navigator && global.navigator.platform || '') ? '⌘' : 'Ctrl+');
    function acts() { return (K.actions ? K.actions(d, { selected }) : []).filter(Boolean); }
    function runAct(a) { if (!a || a.disabled) return false; if (a.key !== undefined) { edit(a.key, a.value, a.label); return true; } let said = null; try { said = a.run(clone(d)); } catch (e) { said = 'failed: ' + e.message; console.error(e); } if (said) note = String(said); render(); return true; }
    const viewItems = () => !K.drawLayer ? [] : [{ section: 'VIEW' },
      { label: mode === '3d' ? '2D view' : '3D view', keys: mode === '3d' ? '2' : '3', run: () => { mode = mode === '3d' ? '2d' : '3d'; chips(); draw(); } },
      { label: 'Look from the top', keys: 'T', run: () => setCam('top') }, { label: 'Look from the front', keys: 'F', run: () => setCam('front') },
      { label: exploded ? 'Stack the layers flat' : 'Spread the layers apart', keys: 'Shift+E', run: () => { exploded = !exploded; chips(); draw(); } },
      { label: wire ? 'Lit' : 'Wire', keys: 'W', run: () => { wire = !wire; chips(); draw(); } }];
    const histItems = () => [{ section: 'EDIT' }, { label: 'Undo' + (past.length ? '' : ''), keys: 'Mod+Z', disabled: !past.length, run: undo }, { label: 'Redo', keys: 'Mod+Shift+Z', disabled: !future.length, run: redo },
      ...((o.onApply || K.apply) ? [{ label: 'Apply — write it back', keys: 'Mod+Enter', run: apply }] : []), { label: 'Close the Field', keys: 'Esc', run: () => close() }];
    function menu(x, y, items, title) {
      const CM = global.ContextMenu; if (!CM || !CM.show) return;
      CM.show(x, y, items.map(it => it.section || it.sep ? it : Object.assign({}, it, { label: it.label, keys: it.keys ? KEYS(it.keys) : '', run: it.run || (() => runAct(it)) })), title);
    }
    const nameOf = (a) => a.name || a.label.replace(/^[^\w(]+\s*/, '');   // an action's words in a menu or the key sheet (its `name`, else its label)
    // NEW LAYER: what the kind says can be made (a menu of edits, grouped by its sections)
    const addables = () => { try { return (K.addable ? K.addable(d) : []).filter(Boolean); } catch (e) { console.error(e); return []; } };
    const newItems = () => { const A = addables(); if (!A.length) return []; const out = []; let sec = null;
      A.forEach(a => { const s2 = a.section || 'NEW LAYER'; if (s2 !== sec) { out.push({ section: s2 }); sec = s2; } out.push({ label: a.label, hint: a.hint, disabled: a.disabled, run: () => { edit(a.key, a.value, a.name || a.label); } }); });
      return out; };
    function newLayerMenu(x, y) { const items = newItems(); if (items.length) menu(x, y, items, 'NEW LAYER'); }
    const kindItems = (where) => acts().filter(a => !where || !a.only || a.only === where).map(a => ({ label: nameOf(a), keys: a.keys, hint: a.hint, disabled: a.disabled, run: () => runAct(a) }));
    function apply() { if (o.onApply) o.onApply(clone(d)); else if (K.apply) K.apply(clone(d)); note = 'APPLIED'; render(); }
    function setCam(v) { mode = '3d'; if (v === 'top') { cam.pitch = Math.PI / 2 - 0.001; cam.yaw = 0; } else if (v === 'front') { cam.pitch = 0.18; cam.yaw = 0; } else cam = { yaw: -0.55, pitch: 0.62, zoom: 1 }; chips(); draw(); }
    // W3g the toolbar (his words, 2026-11-09: "manipulate it on the canvas, like photoshop, needs the toolbar, for drawing, shaping, editing"):
    // each tool works ON the view, live while the hand moves (K.drag → K.set, drawn, no history), one history step when it lets go
    const ALL_TOOLS = [['select', 'V', '⬚', 'Select — a click opens what is under it'], ['pen', 'P', '✎', 'Pen — draw freehand; only the stretch you draw changes'],
      ['line', 'L', '╱', 'Line — a straight line from where you start to where you let go'], ['points', 'D', '◇', 'Points — drag a point; click the curve to add one; Alt+click removes one'],
      ['smooth', 'S', '≈', 'Smooth — a brush that smooths what it passes over'], ['move', 'G', '↕', 'Move — drag the whole curve up or down; Shift scales it'],
      ['erase', 'E', '⌫', 'Erase — a brush that flattens what it passes over']];   // no Orbit tool (2026-11-12, his: "the toolbar is for editing, not for different views") — the view: ORBIT / TOP / FRONT, Alt-drag
    const CURVE_TOOLS = ['pen', 'line', 'points', 'smooth', 'move', 'erase'];
    const TOOLS = ALL_TOOLS.filter(([id]) => id === 'select' || (K.drag ? true : id === 'pen' && !!K.stroke)).filter(([id]) => !K.toolset || K.toolset.includes(id));   // I1 a kind may offer only some tools
    let tool = TOOLS.some(t => t[0] === 'pen') ? 'pen' : 'select', preview = null, drag = null;
    function thumb(l) {
      if (!K.drawLayer) return el('span', 'ws-badge t-' + (TYPES.includes(l.type) ? l.type : 'value'), [], { text: (l.type || 'value').slice(0, 4).toUpperCase() });
      const c = el('canvas', 'ws-thumb'); c.width = 96; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#02050a'; g.fillRect(0, 0, 96, 48);
      try { K.drawLayer(g, 96, 48, d, l.id, { wire: true, thumb: true, selected: l.id === selected }); } catch (e) {} g.shadowBlur = 0; return c;
    }
    function render() {
      const L = layers(); if (!selected || !layerOf(selected)) selected = (L.find(l => l.fields && l.fields.length) || L[0] || {}).id || null;
      const sel = layerOf(selected), title = (o.title || (K.title ? K.title(d) : K.label));
      // the bar: the name and the path (where this document sits; click to go up) — nothing else
      bar.replaceChildren(el('span', 'ws-name', [], { text: 'FIELD' }), el('span', 'ws-sep'),
        el('span', 'ws-stations', (K.stations ? K.stations(d) : [K.label]).map((s, i, a) => el('span', 'ws-st' + (i === a.length - 1 ? ' on' : '') + (K.stationKey && i < a.length - 1 ? ' go' : ''), [el('i', '', [], { text: String(i + 1).padStart(2, '0') }), String(s)],
          K.stationKey && i < a.length - 1 ? { title: 'go up to ' + s + ' (Backspace: one level up)', onclick: () => edit(K.stationKey, i, 'GO TO ' + s) } : {}))),
        el('span', 'ws-acts', acts().filter(a => a.strip).map(a => el('button', 'ws-ab', [], { type: 'button', text: a.icon || '•', disabled: !!a.disabled, title: nameOf(a) + (a.keys ? '  (' + KEYS(a.keys) + ')' : '') + (a.hint ? ' — ' + a.hint : ''), onclick: () => runAct(a) }))
          .concat([el('button', 'ws-ab ws-close', [], { type: 'button', text: '✕', title: 'Close the Field (Esc) — your changes are already in place', onclick: () => close() })])));
      // the options bar: what the current tool works on, and the view
      // the options bar: the kind's picker (what the document plays on, its owner's choice — e.g. an instrument), then the view. Nothing that
      // the panels already say (the selected layer is PROPERTIES' to show).
      const pk = K.picker ? K.picker(d) : null;
      opts.replaceChildren(...(pk ? [el('span', 'ws-pkl', [], { text: pk.label }), (() => { const sl = el('select', 'ws-sel ws-picker', [], { title: pk.hint || pk.label });
        (pk.options || []).forEach(op => { if (op.group) { const og = el('optgroup', '', [], {}); og.label = op.group; (op.options || []).forEach(o2 => { const oe = el('option', '', [], { value: String(o2.value), text: o2.label }); if (String(o2.value) === String(pk.value)) oe.selected = true; og.appendChild(oe); }); sl.appendChild(og); }
          else { const oe = el('option', '', [], { value: String(op.value), text: op.label }); if (String(op.value) === String(pk.value)) oe.selected = true; sl.appendChild(oe); } });
        sl.addEventListener('change', () => edit(pk.key, sl.value, pk.label)); sl.addEventListener('keydown', (e) => e.stopPropagation()); return sl; })(), el('span', 'ws-vs')] : []),
        ...(K.bar ? K.bar(d) : []).map(f => field(f, false)).concat(K.bar && K.bar(d).length ? [el('span', 'ws-vs')] : []), vph);   // W3g the kind's own bar fields (document-wide values it names)
      // the tool strip: the canvas's tools, then the kind's
      strip.replaceChildren(...TOOLS.map(([id, key, glyph, hint]) => el('button', 'ws-ti' + (tool === id ? ' on' : ''), [], { type: 'button', title: hint + ' (' + key + ')', text: glyph, onclick: () => { tool = id; render(); } })),
        ...(K.tools || []).map(t => el('button', 'ws-ti' + (t.layer && t.layer === selected ? ' on' : ''), [], { type: 'button', title: t.label, text: t.glyph || t.label.slice(0, 1), onclick: () => { if (t.layer) { selected = t.layer; render(); } } })));
        // W3h's ▶ ⤓ ✕ moved to the top right (2026-11-12) — the strip holds only editing tools
      tabs.replaceChildren(el('span', 'ws-tab on', [String(title), el('i', '', [], { text: '×', title: 'close (Esc)', onclick: () => close() })]));
      // PROPERTIES · HISTORY · OUTLINER (top right): the one place a value is edited
      const tabsI = el('div', 'ws-ph', ['properties', 'history', 'outliner'].map(t => el('span', t === inspTab ? 'on' : '', [], { text: t.toUpperCase(), onclick: () => { inspTab = t; render(); } })));
      if (inspTab === 'history') insp.replaceChildren(tabsI, el('div', 'ws-hist', hist.slice(-60).map((h2, i, a) => el('div', i === a.length - 1 ? 'now' : '', [el('i', '', [], { text: String(hist.length - a.length + i + 1).padStart(2, '0') }), h2.label], { onclick: () => { if (i < a.length - 1) { past.push(clone(d)); future = []; restore(h2.doc, 'BACK TO ' + String(hist.length - a.length + i + 1).padStart(2, '0')); } } }))));
      else if (inspTab === 'outliner') { const ol = K.outline ? K.outline(d) : [[0, title]]; insp.replaceChildren(tabsI, el('div', 'ws-tree', ol.map(([depth, t, lid, go]) => el('div', (lid && lid === selected ? 'sel' : '') + (lid || go ? ' go' : ''), [], { text: ' '.repeat(depth * 3) + t, onclick: () => { if (lid) selected = lid; if (go && go.key !== undefined) edit(go.key, go.value, go.label || t); else if (lid) render(); } })))); }
      else insp.replaceChildren(tabsI, el('div', 'ws-ins' + (sel && locked.has(sel.id) ? ' locked' : ''), [sel ? el('div', 'ws-big', [], { text: sel.label }) : null, sel && sel.sub ? el('div', 'ws-sub', [], { text: sel.sub }) : null,
        sel && locked.has(sel.id) ? el('button', 'ws-lockbar', [], { type: 'button', text: '🔒 LOCKED — click to unlock (/)', onclick: () => layerOp(sel.id, 'lock') }) : null].concat((sel && opsOf(sel.id).amount !== undefined ? [{ key: '@amount' }] : []).concat((sel && sel.fields) || []).map(f => field(f, true)))
        .concat(sel && !(sel.fields || []).length ? [el('div', 'ws-hint', [], { text: 'nothing to set here — right-click for what it can do' })] : [])));
      // LAYERS (bottom right): eye · thumbnail · name; groups fold; the layer tools in the footer
      const groups = []; L.forEach(l => { const gname = l.group || ''; let gr = groups.find(x => x[0] === gname); if (!gr) groups.push(gr = [gname, []]); gr[1].push(l); });
      let dragId = null;
      const row = (l) => { const ops = opsOf(l.id), sound = ops.enable !== undefined, on = sound ? ops.enable : !hidden.has(l.id), lk = locked.has(l.id);
        const nameEl = el('div', 'ws-ln', [String(l.label), el('small', '', [], { text: l.sub || '' })]);
        if (ops.rename) nameEl.addEventListener('dblclick', (e) => { e.stopPropagation(); selected = l.id; renameAt(l.id); });
        const r = el('div', 'ws-lay' + (l.id === selected ? ' sel' : '') + (!on || hidden.has(l.id) ? ' off' : '') + (lk ? ' locked' : ''), [
          el('button', 'ws-eye', [], { type: 'button', text: on && !hidden.has(l.id) ? '◉' : '◌', title: sound ? (on ? 'on — click to turn it off (it stops playing)' : 'off — click to turn it on') + ' · Alt+click: show only this' : 'show / hide in the view (H) · Alt+click: show only this',
            onclick: (e) => { e.stopPropagation(); if (e.altKey) { hidden = new Set(layers().map(x => x.id).filter(x => x !== l.id)); render(); return; } if (sound) layerOp(l.id, 'enable', !ops.enable); else layerOp(l.id, 'hide'); } }),
          thumb(l), nameEl,
          el('button', 'ws-lock' + (lk ? ' on' : ''), [], { type: 'button', text: lk ? '🔒' : '🔓', title: (lk ? 'locked — click to unlock' : 'lock it: no edit reaches it') + ' (/)', onclick: (e) => { e.stopPropagation(); layerOp(l.id, 'lock'); } })],
          { onclick: () => { selected = l.id; render(); } });
        r.dataset.id = l.id;
        if (ops.move && !lk) { r.draggable = true;
          r.addEventListener('dragstart', (e) => { dragId = l.id; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); } catch (er) {} });
          r.addEventListener('dragend', () => { dragId = null; lays.querySelectorAll('.ws-lay.drop').forEach(x => x.classList.remove('drop')); }); }
        r.addEventListener('dragover', (e) => { if (!dragId || dragId === l.id || !opsOf(l.id).move) return; e.preventDefault(); r.classList.add('drop'); });
        r.addEventListener('dragleave', () => r.classList.remove('drop'));
        r.addEventListener('drop', (e) => { e.preventDefault(); r.classList.remove('drop'); const from = dragId; dragId = null; if (from && from !== l.id) { const L2 = layers(), a = L2.findIndex(x => x.id === from), b = L2.findIndex(x => x.id === l.id); layerOp(from, 'move', a < b ? { after: l.id } : { before: l.id }); } });
        r.addEventListener('dblclick', () => { selected = l.id; const a = acts().find(x => x.open); if (a && !a.disabled) runAct(a); else render(); });
        r.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); selected = l.id; render();
          menu(e.clientX, e.clientY, layerItems(l).concat([{ label: 'Show only this', keys: 'Alt+H', run: () => { hidden = new Set(L.map(x => x.id).filter(id => id !== l.id)); render(); } }, { label: 'Show all', run: () => { hidden = new Set(); render(); } }],
            acts().filter(a => a.only === 'layer').length ? [{ section: String(l.label).toUpperCase() }].concat(acts().filter(a => a.only === 'layer').map(a => ({ label: nameOf(a), keys: a.keys, hint: a.hint, disabled: a.disabled, run: () => runAct(a) }))) : [], newItems()), String(l.label).toUpperCase()); });   // 2026-11-13: a layer's menu holds what acts on the layer (the note's and the pattern's own actions are the view's right-click)
        return r; };
      const canAdd = addables().length > 0;
      const foot = el('div', 'ws-lfoot', [canAdd ? el('button', 'ws-lt ws-new', [], { type: 'button', text: '＋', title: 'New layer  (' + KEYS('Mod+Shift+N') + ') — shape something, set a knob, add a mod', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); newLayerMenu(r.left, r.top - 4); } }) : null,
        opsOf(selected).remove ? el('button', 'ws-lt ws-del', [], { type: 'button', text: '🗑', disabled: locked.has(selected), title: opName(opsOf(selected), 'remove', 'Delete') + ' — ' + ((layerOf(selected) || {}).label || '') + '  (Delete)', onclick: () => layerOp(selected, 'remove') }) : null].filter(Boolean).concat(acts().filter(a => a.icon && !a.strip).map(a => el('button', 'ws-lt', [], { type: 'button', text: a.icon, disabled: !!a.disabled, title: nameOf(a) + (a.keys ? '  (' + KEYS(a.keys) + ')' : '') + (a.hint ? ' — ' + a.hint : ''), onclick: () => runAct(a) }))));
      lays.replaceChildren(el('div', 'ws-ph', [el('span', 'on', [], { text: 'LAYERS' }), el('span', 'ws-x', [], { text: String(L.length) })]),
        el('div', 'ws-lbody', [].concat(...groups.map(([gname, ls]) => [gname ? el('div', 'ws-lh' + (folded.has(gname) ? ' folded' : ''), [], { text: (folded.has(gname) ? '▸ ' : '▾ ') + gname, onclick: () => { folded.has(gname) ? folded.delete(gname) : folded.add(gname); render(); } }) : null]
          .concat(folded.has(gname) ? [] : ls.map(row)))).filter(Boolean)), foot);
      status.replaceChildren(...(K.status ? K.status(d) : []).map(([k, v]) => el('span', '', [k + ' ', el('b', '', [], { text: String(v) })])),
        el('span', 'ws-r', [], { text: (note ? note + ' · ' : '') + (past.length ? past.length + ' EDITS · ' : '') + 'LIVE' }), el('button', 'ws-keys', [], { type: 'button', text: '? KEYS', title: 'every key (?)', onclick: () => keySheet() }));
      chips(); draw();
    }
    // the keys, in one place (?): the canvas's, then the kind's
    function keyList() {
      return [['Undo', 'Mod+Z'], ['Redo', 'Mod+Shift+Z'], ...((o.onApply || K.apply) ? [['Apply', 'Mod+Enter']] : []), ['Close', 'Esc'], ['Select · Pen · Line · Points · Smooth · Move · Erase', 'V P L D S G E'], ['Turn the 3D view', 'Alt-drag · middle-drag'], ['Previous / next layer', '↑ · ↓'], ['Show / hide the layer', 'H'], ...(K.layerOps ? [['Turn the layer on / off (it plays or not)', '.'], ['Rename the layer', 'F2'], ['Duplicate', 'Mod+J'], ['Copy · paste a layer', 'Mod+C · Mod+V'], ['Move the layer up / down', 'Mod+[ · Mod+]'], ['Delete the layer', 'Delete'], ['Lock / unlock', '/']] : []), ...(K.addable ? [['New layer', 'Mod+Shift+N']] : []),
        ...(K.drawLayer ? [['2D / 3D', '2 · 3'], ['Top / front view', 'T · F'], ['Spread / flat', 'Shift+E'], ['Wire / lit', 'W']] : []), ['Right-click', 'what the layer or view can do'], ['This sheet', '?']]
        .concat(acts().filter(a => a.keys).map(a => [nameOf(a), a.keys]));
    }
    function keySheet() {
      const old = root.querySelector('.ws-sheet'); if (old) { old.remove(); return; }
      const sh = el('div', 'ws-sheet', [el('div', 'ws-ph', [el('span', 'on', [], { text: 'KEYS' }), el('span', 'ws-x', [], { text: 'Esc or ? closes' })]), el('div', 'ws-kl', keyList().map(([w, k]) => el('div', 'ws-kv', [el('span', '', [], { text: w }), el('b', '', [], { text: KEYS(k) })])))]);
      sh.addEventListener('click', () => sh.remove()); root.appendChild(sh);
    }
    // keys: the canvas's (undo, redo, apply, close, tools, view, layers), then the kind's (an action with keys)
    const match = (e, k) => { const parts = String(k).split('+'), key = parts.pop(), want = { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
      const ek = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      return (e.ctrlKey || e.metaKey) === want.mod && e.shiftKey === want.shift && e.altKey === want.alt && ek.toUpperCase() === key.toUpperCase(); };
    const onKey = (e) => { if (!root.isConnected) return; const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (global.ContextMenu && global.ContextMenu.open) return;   // a menu is open: its own keys
      if (o.hostKey) { let mine = false; try { mine = !!o.hostKey(e); } catch (er) {} if (mine) return; }
      const sheet = root.querySelector('.ws-sheet'); if (sheet && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); sheet.remove(); return; }
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), eat = () => { e.preventDefault(); e.stopPropagation(); };
      if (mod && e.shiftKey && k === 'n' && addables().length) { eat(); const r = lays.getBoundingClientRect(); return newLayerMenu(r.left + 10, r.top + 30); }
      if (selected && K.layerOps) {   // 2026-11-13 the selected layer's own keys
        if (e.key === 'Delete' && !e.shiftKey && opsOf(selected).remove) { eat(); return layerOp(selected, 'remove'); }
        if (mod && k === 'j' && opsOf(selected).duplicate) { eat(); return layerOp(selected, 'duplicate'); }
        if (mod && !e.shiftKey && k === 'c' && opsOf(selected).copy) { eat(); return layerOp(selected, 'copy'); }
        if (mod && !e.shiftKey && k === 'v' && CLIP) { eat(); return layerOp(selected, 'paste'); }
        if (mod && (e.key === '[' || e.key === ']') && opsOf(selected).move) { eat(); return moveBy(selected, e.key === '[' ? -1 : 1); }
        if (!mod && e.key === '/') { eat(); return layerOp(selected, 'lock'); }
        if (e.key === 'F2') { eat(); return renameAt(selected); }
        if (!mod && e.key === '.' && opsOf(selected).enable !== undefined) { eat(); return layerOp(selected, 'enable', !opsOf(selected).enable); }
      }
      if (mod && k === 'z') { eat(); return e.shiftKey ? redo() : undo(); } if (mod && k === 'y') { eat(); return redo(); }
      if (mod && e.key === 'Enter' && (o.onApply || K.apply)) { eat(); return apply(); }
      // the kind's own keys first (Space, Enter, Backspace, M …), so a kind can give a key a meaning
      const A = acts().find(a => a.keys && match(e, a.keys)); if (A) { eat(); return runAct(A); }
      if (e.key === 'Escape') { eat(); return close(); }
      if (mod || e.altKey && k !== 'h') return;
      const L = layers(), i = Math.max(0, L.findIndex(l => l.id === selected));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { eat(); const j = Math.max(0, Math.min(L.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); selected = L[j] && L[j].id; return render(); }
      if (e.key === '?') { eat(); return keySheet(); }
      if (k === 'e' && e.shiftKey && K.drawLayer) { eat(); exploded = !exploded; chips(); return draw(); }
      const T = !e.shiftKey && TOOLS.find(t => t[1].toLowerCase() === k); if (T) { eat(); tool = T[0]; return render(); }
      if (k === 'h' && selected) { eat(); if (e.altKey) hidden = new Set(L.map(x => x.id).filter(id => id !== selected)); else hidden.has(selected) ? hidden.delete(selected) : hidden.add(selected); return render(); }
      if (!K.drawLayer) return;
      if (k === '2' || k === '3') { eat(); mode = k === '3' ? '3d' : '2d'; return render(); }
      if (k === 't') { eat(); return setCam('top'); } if (k === 'f') { eat(); return setCam('front'); }
      if (k === 'w') { eat(); wire = !wire; chips(); return draw(); }
    };
    const onResize = () => draw();
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (e.button === 2) return;
      // 2026-11-12 (his: "drawing does nothing"): in 3D a curve tool draws on the plane under the hand — its point on that plane, 0–1 across
      // and up, goes to the kind as o.norm; the camera turns with Orbit (O), Alt, the middle button, or a drag that starts off every plane
      if (mode === '3d' && K.drawLayer && K.drag && K.planeDraw && CURVE_TOOLS.includes(tool) && !e.altKey && e.button === 0) {
        const under = planes.slice().reverse().filter(pl => inPoly(x, y, pl.poly)), hit = under.find(pl => pl.type !== 'value') || under[0];   /* a shape first, as a click */
        if (hit && locked.has(hit.id)) { selected = hit.id; return refuse('LOCKED — unlock it (/) to draw on it'); }
        if (hit) { if (selected !== hit.id) { selected = hit.id; render(); } stroke = { pts: [[x, y]], plane: hit, uv: [onPlane(hit, x, y)] }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} return; } }
      if (mode === '3d' && K.drawLayer) { orbit = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} return; }
      const p = K.pick ? K.pick(d, x, y, r.width, r.height, { selected, tool }) : null; if (p && p.run) { try { p.run(); } catch (er) { console.error(er); } render(); return; } if (p && p.key !== undefined) return edit(p.key, p.value, p.label);
      if ((K.drag && CURVE_TOOLS.includes(tool)) || (K.stroke && tool === 'pen')) { if (selected && locked.has(selected)) return refuse('LOCKED — unlock it (/) to draw on it'); }
      if (K.drag && CURVE_TOOLS.includes(tool)) { drag = { pts: [[x, y]], alt: e.altKey, shift: e.shiftKey }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} dragStep('move'); return; }
      if (K.stroke && tool === 'pen') { stroke = { pts: [[x, y]] }; try { cv.setPointerCapture(e.pointerId); } catch (er) {} }
    });
    cv.addEventListener('pointermove', (e) => {
      if (orbit) { orbit.lastX = e.clientX; orbit.lastY = e.clientY; cam.yaw = orbit.yaw + (e.clientX - orbit.x) * 0.008; cam.pitch = Math.max(0.02, Math.min(Math.PI / 2 - 0.001, orbit.pitch + (e.clientY - orbit.y) * 0.006)); draw(); return; }
      if (drag) { const r = cv.getBoundingClientRect(); drag.pts.push([e.clientX - r.left, e.clientY - r.top]); drag.shift = e.shiftKey; dragStep('move'); return; }
      if (stroke) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; stroke.pts.push([x, y]); if (stroke.plane) stroke.uv.push(onPlane(stroke.plane, x, y)); draw(); }
    });
    // a curve tool: what the hand has done so far, drawn (not kept); kept once, when it lets go
    function dragStep(phase) {
      const r = cv.getBoundingClientRect(); let res = null;
      try { res = K.drag(d, tool, drag.pts, r.width, r.height, { selected, phase, alt: drag.alt, shift: drag.shift }); } catch (e) { console.error(e); }
      if (phase === 'end') { preview = null; drag = null; if (res && res.key !== undefined) return edit(res.key, res.value, res.label); return draw(); }
      try { preview = res && res.key !== undefined ? K.set(d, res.key, res.value) : null; } catch (e) { preview = null; } draw();
      if (preview && o.onLive) { try { o.onLive(clone(preview)); } catch (e) { console.error(e); } }   // I1 the owner may follow the hand (live), before it is kept
    }
    const endPointer = () => {
      if (orbit) { const o2 = orbit; orbit = null;
        if (o2.lastX === undefined || Math.hypot(o2.lastX - o2.x, o2.lastY - o2.y) < 4) {   // W3h a click in 3D (no turn): the plane under it is selected
          const r = cv.getBoundingClientRect(), x = o2.x - r.left, y = o2.y - r.top; const under = planes.slice().reverse().filter(pl => inPoly(x, y, pl.poly)), hit = under.find(pl => pl.type !== 'value') || under[0];   /* a shape first where planes overlap */ if (hit) { selected = hit.id; render(); return; } }
        chips(); return; }
      if (drag) return dragStep('end');
      if (!stroke) return; const st = stroke; stroke = null; const r = cv.getBoundingClientRect();
      if (st.plane) { if (st.uv.length > 1) { let res = null; try { res = K.drag(d, tool, st.uv, r.width, r.height, { selected: st.plane.id, phase: 'end', norm: true }); } catch (e) { console.error(e); } if (res && res.key !== undefined) return edit(res.key, res.value, res.label); } return draw(); }
      if (st.pts.length > 1) { let res = null; try { res = K.stroke(d, st.pts, r.width, r.height, { selected }); } catch (e) { console.error(e); } if (res && res.key !== undefined) return edit(res.key, res.value, res.label); }
      draw();
    };
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); menu(e.clientX, e.clientY, kindItems('view').concat(viewItems(), histItems())); });
    root.addEventListener('contextmenu', (e) => { if (e.defaultPrevented) return; const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return; e.preventDefault(); e.stopPropagation(); menu(e.clientX, e.clientY, kindItems().concat(newItems(), histItems())); });
    cv.addEventListener('dblclick', () => { const a = acts().find(x => x.open); if (a && !a.disabled) runAct(a); });   // W3h double-click opens what is selected (2D or 3D)
    cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('wheel', (e) => { if (mode !== '3d') return; e.preventDefault(); cam.zoom = Math.max(0.3, Math.min(4, cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); draw(); }, { passive: false });
    function close() { if (!root.isConnected) return; root.remove(); doc.documentElement.classList.remove('ws-open'); global.removeEventListener('keydown', onKey, true); global.removeEventListener('resize', onResize); if (current === api) current = null; if (o.onClose) o.onClose(clone(d)); }
    global.addEventListener('keydown', onKey, true); global.addEventListener('resize', onResize);
    doc.body.appendChild(root); doc.documentElement.classList.add('ws-open'); render(); global.requestAnimationFrame(draw);
    const api = { el: root, doc: () => clone(d), set: (k, v, label) => edit(k, v, label), select: (id) => { selected = id; render(); }, undo, redo, history: () => hist.map(h2 => h2.label), close, kind: K.id,
      get selected() { return selected; }, keys: () => keyList(), tools: () => TOOLS.map(t => t[0]),
      drag: (t, pts, o3) => { const r = cv.getBoundingClientRect(); const res = K.drag ? K.drag(d, t, pts, r.width, r.height, Object.assign({ selected, phase: 'end' }, o3 || {})) : null; if (res && res.key !== undefined) edit(res.key, res.value, res.label); return !!res; }, get hidden() { return Array.from(hidden); }, tool: (t) => { if (t) { tool = t; render(); } return tool; },
      // W3a: the viewport (for tests and the kind's own buttons)
      view: (o2) => { if (o2) { if (o2.mode) mode = o2.mode; if (o2.exploded !== undefined) exploded = !!o2.exploded; if (o2.wire !== undefined) wire = !!o2.wire; if (o2.cam) Object.assign(cam, o2.cam); chips(); draw(); } return { mode, exploded, wire, cam: Object.assign({}, cam), planes: planes.map(p => ({ id: p.id, poly: p.poly.map(q => q.slice()) })) }; },
      stroke: (pts) => { const r = cv.getBoundingClientRect(); const res = K.stroke ? K.stroke(d, pts, r.width, r.height, { selected }) : null; if (res && res.key !== undefined) edit(res.key, res.value, res.label); return !!res; },
      tool: () => tool, layer: (id, op, value) => layerOp(id, op, value), layerOps: (id) => opsOf(id), locked: (id) => locked.has(id), clipboard: () => CLIP, moveBy: (id, dir) => moveBy(id, dir),
      addable: () => addables().map(a => (a.section ? a.section + ' › ' : '') + a.label), add: (label, section) => { const a = addables().find(x => x.label === label && (!section || x.section === section || String(x.section || '').startsWith(section + ' · '))); if (!a || a.disabled) return false; edit(a.key, a.value, a.name || a.label); return true; },
      action: (label) => { const a = (K.actions ? K.actions(d, { selected }) : []).find(x => x.label === label); if (!a || a.disabled) return false; if (a.key !== undefined) edit(a.key, a.value, a.label); else a.run(clone(d)); return true; } };
    current = api; return api;
  }
  global.Workshop = { check, addKind, open, kinds: () => Array.from(KINDS.keys()), TYPES, get current() { return current; } };
})(window);
