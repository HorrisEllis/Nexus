/* ERAVOS runtime — dep-graph.js → window.DepGraph (3.91) · asked: "make a dependancy graph. also when clearing the canvas should remove
 * all dependancies". One page that draws what is on, and why: the domains touched → the modes on → the parts of the shell built for them
 * (toolbar groups, services, keys) ← the tools on the canvas that need them, and the wires between the tools. A part nothing on the
 * canvas needs any more is drawn faded; "Remove what nothing needs" takes those away (Expansion.prune), "Clear everything" empties the
 * canvas and the shell (the same as Options › Clear canvas). Reads Shell.X.graph() — no domain words of its own.
 *   DepGraph.open() · close() · entry in ⋯ Options */
(function (global) {
  'use strict';
  const doc = global.document, NS = 'http://www.w3.org/2000/svg';
  let pop = null;
  const svgEl = (tag, attrs, text) => { const e = doc.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); if (text !== undefined) e.textContent = text; return e; };
  function draw(box, X) {
    const g = X.graph(), cols = [
      { key: 'domains', title: 'Domains', items: g.domains.map(d => ({ id: 'd:' + d, label: d })) },
      { key: 'modes', title: 'Modes on', items: g.modes.map(m => ({ id: 'm:' + m.id, label: m.label })) },
      { key: 'units', title: 'Built for them', items: g.units.map(u => ({ id: 'u:' + u.id, label: (u.icon ? u.icon + ' ' : '') + u.label, faded: !u.neededBy.length })) },
      { key: 'tools', title: 'On the canvas', items: g.tools.map(t => ({ id: 't:' + t.id, label: t.label })) },
    ];
    const W = 980, colW = 210, gap = (W - colW * 4) / 3, rowH = 30, top = 40, rows = Math.max(1, ...cols.map(c => c.items.length));
    const H = top + rows * rowH + 30, svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'dg-svg', role: 'img', 'aria-label': 'the dependency graph of the canvas' });
    const defs = svgEl('defs'); defs.innerHTML = '<linearGradient id="dg-line" x1="0" x2="1"><stop offset="0" stop-color="#b06bff"/><stop offset=".5" stop-color="#ff6fa8"/><stop offset="1" stop-color="#ffb36b"/></linearGradient>'; svg.appendChild(defs);
    const pos = {};
    cols.forEach((c, ci) => {
      const x = ci * (colW + gap); svg.appendChild(svgEl('text', { x: x + 4, y: 18, class: 'dg-col' }, c.title.toUpperCase() + ' · ' + c.items.length));
      c.items.forEach((it, i) => { const y = top + i * rowH; pos[it.id] = { x, y, w: colW }; });
    });
    const edges = svgEl('g', { class: 'dg-edges' }); svg.appendChild(edges);
    const link = (a, b, cls) => { const p = pos[a], q = pos[b]; if (!p || !q) return; const x1 = p.x + p.w, y1 = p.y + 11, x2 = q.x, y2 = q.y + 11, mx = (x1 + x2) / 2;
      edges.appendChild(svgEl('path', { d: `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`, class: 'dg-edge ' + (cls || '') })); };
    g.modes.forEach(m => { if (m.domain) link('d:' + m.domain, 'm:' + m.id); m.units.forEach(u => link('m:' + m.id, 'u:' + u, 'soft')); });
    g.units.forEach(u => { if (u.domain && !g.modes.some(m => m.units.includes(u.id))) link('d:' + u.domain, 'u:' + u.id, 'soft'); });
    // a tool needs its parts: drawn from the part to the tool
    g.tools.forEach(t => t.units.forEach(u => link('u:' + u, 't:' + t.id)));
    // wires between tools: an arc on the right of the tools column
    const tx = pos[Object.keys(pos).find(k => k.startsWith('t:'))];
    g.wires.forEach(w => { const a = pos['t:' + w.from], b = pos['t:' + w.to]; if (!a || !b || a === b) return; const x = a.x + a.w, r = Math.abs(b.y - a.y) / 2 + 8;
      edges.appendChild(svgEl('path', { d: `M${x} ${a.y + 11}C${x + r} ${a.y + 11} ${x + r} ${b.y + 11} ${x} ${b.y + 11}`, class: 'dg-edge wire ' + (w.type || '') })); });
    cols.forEach(c => c.items.forEach(it => { const p = pos[it.id], node = svgEl('g', { class: 'dg-node ' + c.key + (it.faded ? ' faded' : '') });
      node.appendChild(svgEl('rect', { x: p.x, y: p.y, width: p.w, height: 22, rx: 11 }));
      const label = it.label.length > 28 ? it.label.slice(0, 27) + '…' : it.label;
      node.appendChild(svgEl('text', { x: p.x + 12, y: p.y + 15 }, label + (it.faded ? '  · nothing needs it' : '')));
      const tip = svgEl('title'); tip.textContent = it.label; node.appendChild(tip); svg.appendChild(node); }));
    if (!tx && !g.units.length && !g.modes.length) svg.appendChild(svgEl('text', { x: W / 2, y: top + 20, 'text-anchor': 'middle', class: 'dg-empty' }, 'Nothing on — a truly empty canvas. Add a tool and what it needs appears here.'));
    box.innerHTML = ''; box.appendChild(svg);
    return g;
  }
  function open() {
    const S = global.Shell, X = S && S.X; if (!X || !X.graph) return null; if (pop) { close(); return null; }
    const h = global.UIKit.h, box = h('div', { class: 'dg-box' }), sum = h('span', { class: 'dg-sum' });
    const repaint = () => { const g = draw(box, X), idle = g.units.filter(u => !u.neededBy.length).length;
      sum.textContent = `${g.tools.length} tool${g.tools.length === 1 ? '' : 's'} · ${g.units.length} part${g.units.length === 1 ? '' : 's'} built · ${g.modes.length} mode${g.modes.length === 1 ? '' : 's'} on` + (idle ? ` · ${idle} nothing needs` : '');
      prune.disabled = !idle; };
    const prune = h('button', { class: 'tb-btn', type: 'button', text: 'Remove what nothing needs', title: 'take away the parts no tool on the canvas needs any more', onclick: () => { X.prune('dependency graph'); repaint(); } });
    const clear = h('button', { class: 'tb-btn', type: 'button', text: 'Clear everything', title: 'every tool off the canvas, and everything they needed — a truly empty canvas', onclick: () => { const b = doc.getElementById('clearBtn'); if (b) b.click(); repaint(); } });
    pop = h('div', { class: 'dg-pop', role: 'dialog', 'aria-label': 'Dependencies' }, [h('div', { class: 'dg-panel' }, [
      h('div', { class: 'dg-head' }, [h('b', { text: 'DEPENDENCIES' }), sum, prune, clear, h('button', { class: 'dg-x', type: 'button', text: '×', 'aria-label': 'close', onclick: close })]),
      box, h('p', { class: 'dg-note', text: 'Lines run from what is needed to what needs it. Arcs on the right are the wires between your tools.' })])]);
    pop.addEventListener('mousedown', (e) => { if (e.target === pop) close(); });
    doc.addEventListener('keydown', key, true); doc.body.appendChild(pop);
    const off = X.onChange ? X.onChange(() => { if (pop) repaint(); }) : null; pop._off = off;
    repaint(); return pop;
  }
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() { if (!pop) return; if (pop._off) pop._off(); pop.remove(); pop = null; doc.removeEventListener('keydown', key, true); }
  function entry() {
    const slot = doc && doc.getElementById('slot-options'); if (!slot || !global.UIKit) return false; if (doc.getElementById('depsBtn')) return true;
    const b = doc.createElement('button'); b.id = 'depsBtn'; b.type = 'button'; b.className = 'tb-btn'; b.textContent = 'Dependencies'; b.title = 'what is on, and why — the dependency graph of the canvas';
    b.onclick = () => { const m = doc.getElementById('optMenu'); if (m) m.hidden = true; open(); };
    slot.appendChild(b); return true;
  }
  function boot() { if (!entry()) setTimeout(boot, 300); }
  if (doc) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot(); }
  global.DepGraph = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
