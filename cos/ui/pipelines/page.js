/* cos/ui/pipelines/page.js — the Pipelines page (PC1, 0.60.454; cos/spec/pipeline-canvas.spec MOD-PC-BOX).
   James, 2026-11-08: "steps as boxes, with wires as the flow into the hooks of gates" · "i want this built and added to cos ui."
   The shape and its faults are Emerge's (GET /api/cos/boxes); this page only lays the boxes out by their DAG and draws them. Read-only. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const KIND = { gate: '#f5b84a', system: '#5aa9ff', agent: '#38d6c5', macro: '#b48cff', pipeline: '#ff7ab6', procedure: '#7ee081', tool: '#9aa3b8', build: '#ff8a5c' };
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) e.appendChild(c); return e; };
  const sv = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const api = async (p) => { const r = await fetch(p); const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.error || `refused (${r.status})`); return d; };
  $('pl-legend').replaceChildren(...Object.entries(KIND).map(([k, c]) => el('span', { style: `--k:${c}`, text: k })));

  function layers(g) {   // the column of each box: one past the deepest box it waits on (layout only; the DAG's faults are Emerge's)
    const from = {}; for (const w of g.wires) { const [a] = w.from.split('.'), [b] = w.to.split('.'); (from[b] = from[b] || []).push(a); }
    const col = {}, seen = new Set();
    const depth = (id) => { if (col[id] != null) return col[id]; if (seen.has(id)) return 0; seen.add(id); col[id] = Math.max(-1, ...(from[id] || []).map(depth)) + 1; return col[id]; };
    for (const b of g.boxes) depth(b.id); return col;
  }
  function draw(g) {
    const svg = $('pl-svg'), W = 190, H = 54, GX = 70, GY = 26, P = 24;
    const col = layers(g), rows = {}, pos = {};
    for (const b of g.boxes) { const c = col[b.id] || 0; rows[c] = (rows[c] || 0) + 1; pos[b.id] = { x: P + c * (W + GX), y: P + (rows[c] - 1) * (H + GY) }; }
    const w = P * 2 + (Math.max(0, ...Object.values(col)) + 1) * (W + GX) - GX, h = P * 2 + Math.max(1, ...Object.values(rows)) * (H + GY) - GY;
    svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.replaceChildren();
    for (const wr of g.wires) {
      const a = pos[wr.from.split('.')[0]], b = pos[wr.to.split('.')[0]]; if (!a || !b) continue;
      const k = (g.boxes.find(x => x.id === wr.from.split('.')[0]) || {}).kind;
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2, dx = Math.max(40, (x2 - x1) / 2);
      svg.appendChild(sv('path', { class: 'pl-wire', d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, stroke: KIND[k] || '#9aa3b8', 'data-wire': `${wr.from}->${wr.to}` }));
    }
    for (const b of g.boxes) {
      const p = pos[b.id], k = KIND[b.kind] || '#9aa3b8';
      const grp = sv('g', { class: 'pl-box', transform: `translate(${p.x},${p.y})`, style: `--k:${k}`, 'data-box': b.id, 'data-kind': b.kind });
      grp.appendChild(sv('rect', { class: 'body', width: W, height: H, rx: 9 }));
      grp.appendChild(sv('rect', { class: 'chip', x: 10, y: 13, width: 28, height: 28, rx: 7 }));
      const t = sv('text', { class: 't', x: 48, y: 24 }); t.textContent = String(b.ref).slice(0, 22); grp.appendChild(t);
      const s = sv('text', { class: 's', x: 48, y: 40 }); s.textContent = `${b.kind} · ${b.id}${b.gate ? ' · gated' : ''}`; grp.appendChild(s);
      grp.appendChild(sv('circle', { class: 'port', cx: 0, cy: H / 2, r: 5 })); grp.appendChild(sv('circle', { class: 'port', cx: W, cy: H / 2, r: 5 }));
      grp.addEventListener('click', () => { svg.querySelectorAll('.pl-box.sel').forEach(x => x.classList.remove('sel')); grp.classList.add('sel');
        $('pl-detail').textContent = JSON.stringify({ id: b.id, kind: b.kind, ref: b.ref, hooks: b.hooks, contract: b.contract, gate: b.gate, args: b.args }, null, 2); });
      svg.appendChild(grp);
    }
  }
  async function open(q, name, btn) {
    document.querySelectorAll('.pl-item').forEach(x => x.removeAttribute('aria-current')); if (btn) btn.setAttribute('aria-current', 'true');
    $('pl-title').textContent = name; $('pl-sum').textContent = 'reading…'; $('pl-faults').textContent = ''; $('pl-detail').textContent = '';
    try {
      const d = await api(`/api/cos/boxes?${q}`);
      $('pl-sum').textContent = `${d.kind} · ${d.graph.boxes.length} boxes · ${d.graph.wires.length} wires${d.unchecked && d.unchecked.length ? ` · refs not checked here: ${d.unchecked.join(', ')}` : ''}`;
      $('pl-faults').textContent = d.problems && d.problems.length ? d.problems.join(' · ') : '';
      draw(d.graph);
    } catch (e) { $('pl-sum').textContent = ''; $('pl-faults').textContent = e.message; $('pl-svg').replaceChildren(); }
  }
  async function lists() {
    try { const d = await api('/api/cos/automation/pipelines'); const ps = d.pipelines || [];
      $('pl-pipes').replaceChildren(...(ps.length ? ps.map(p => { const b = el('button', { class: 'pl-item', 'data-pipeline': p.id }, [document.createTextNode(p.name || p.id), el('small', { text: `${(p.tasks || []).length} tasks` })]); b.onclick = () => open(`pipeline=${encodeURIComponent(p.id)}`, p.name || p.id, b); return b; }) : [el('p', { text: 'No pipelines yet.' })]));
    } catch (e) { $('pl-pipes').textContent = e.message; }
    try { const d = await api('/api/cos/procedures'); const ps = d.procedures || [];
      $('pl-procs').replaceChildren(...(ps.length ? ps.map(p => { const b = el('button', { class: 'pl-item', 'data-procedure': p.id }, [document.createTextNode(p.name || p.id), el('small', { text: `${(p.steps || []).length || p.stepCount || ''} steps` })]); b.onclick = () => open(`procedure=${encodeURIComponent(p.id)}`, p.name || p.id, b); return b; }) : [el('p', { text: 'No procedures.' })]));
    } catch (e) { $('pl-procs').textContent = e.message; }
  }
  lists();
  window.PIPELINES = { open, lists };
})();
