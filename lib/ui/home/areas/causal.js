'use strict';
// ui/home/areas/causal.js — Causal channel: CFR force graph (CG).
// Split from ui/home/index.html (inline script, lines 1643-1896 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Causal Graph ─────────────────────────────────────────────────────────────
// Force-directed graph of CFR causal events. Reads /cfr/nodes + /cfr/deltas.
// Sigma drives node size and color. Causal edges drawn as directed arrows.
// Pure canvas 2D — no library dependency.

const CG = (() => {
  let _nodes = [], _edges = [], _sim = null;
  let _drag = null, _hover = null;
  let _pan = {x:0, y:0}, _panStart = null;
  let _scale = 1;
  let _raf = null;
  const ORCH = `http://127.0.0.1:${P.orch}`;

  function sigCol(s) {
    s = Math.min(1, Math.max(0, s||0));
    if (s < 0.35) return `rgba(0,255,136,${0.5+s})`;
    if (s < 0.7)  { const t=(s-.35)/.35; return `rgba(${Math.round(t*255)},${Math.round(229-t*59)},${Math.round(255-t*255)},0.9)`; }
    const t=(s-.7)/.3; return `rgba(255,${Math.round(170-t*170)},${Math.round(t*85)},0.95)`;
  }

  async function load() {
    const depth = parseInt(document.getElementById('cg-depth')?.value||'50');
    try {
      const [nodesR, deltasR] = await Promise.allSettled([
        fetch(`${ORCH}/api/cortex/cfr/nodes`).then(r=>r.json()),
        fetch(`${ORCH}/api/cortex/cfr/deltas?limit=${depth}`).then(r=>r.json()),
      ]);
      const rawNodes = nodesR.status==='fulfilled' ? (nodesR.value?.nodes||[]) : [];
      const rawDeltas = deltasR.status==='fulfilled' ? (deltasR.value?.deltas||[]) : [];

      // Build node map from events — aggregate by type
      const nodeMap = {};
      [...rawNodes, ...rawDeltas].forEach(e => {
        const key = e.label || e.type || '?';
        if (!nodeMap[key]) nodeMap[key] = { id:key, label:key, sigma:0, count:0, mass:1 };
        const s = e.sigma?.score ?? e.sigma ?? 0;
        nodeMap[key].sigma = Math.max(nodeMap[key].sigma, s);
        nodeMap[key].count++;
        nodeMap[key].mass = 1 + nodeMap[key].sigma * 3 + Math.min(nodeMap[key].count * 0.1, 2);
      });

      _nodes = Object.values(nodeMap);

      // Build edges from causedBy links in deltas
      const edgeMap = {};
      rawDeltas.forEach(e => {
        if (e.causedBy) {
          // Find the type of the causing event
          const fromDelta = rawDeltas.find(d => d.uuid === e.causedBy);
          if (fromDelta) {
            const fromKey = fromDelta.label || fromDelta.type || '?';
            const toKey   = e.label || e.type || '?';
            if (fromKey !== toKey) {
              const ek = `${fromKey}→${toKey}`;
              edgeMap[ek] = (edgeMap[ek]||0) + 1;
            }
          }
        }
      });
      _edges = Object.entries(edgeMap).map(([k,w]) => {
        const [f,t] = k.split('→');
        return { from:f, to:t, weight:w };
      });

      // Assign initial positions (random in canvas center area)
      const canvas = document.getElementById('cg-canvas');
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      _nodes.forEach(n => {
        if (!n.x) { n.x = W/2 + (Math.random()-.5)*300; n.y = H/2 + (Math.random()-.5)*300; }
        n.vx = 0; n.vy = 0;
      });

      document.getElementById('cg-node-count').textContent = `${_nodes.length} nodes · ${_edges.length} edges`;
      document.getElementById('cg-empty').style.display = _nodes.length ? 'none' : 'flex';

      // Update sigma badge with max sigma
      const maxSig = _nodes.reduce((m,n) => Math.max(m, n.sigma), 0);
      const sigEl = document.getElementById('cg-sigma');
      if (sigEl) { sigEl.textContent = `σ ${maxSig.toFixed(3)}`; sigEl.style.color = sigCol(maxSig); }

      _simulate();
    } catch(e) {
      document.getElementById('cg-empty').style.display='flex';
      document.getElementById('cg-empty').textContent = `Error: ${e.message}`;
    }
  }

  function _simulate() {
    if (_raf) cancelAnimationFrame(_raf);
    let ticks = 0;
    const REPEL = 3000, ATTRACT = 0.03, DAMP = 0.88, CENTER = 0.004;

    function tick() {
      const canvas = document.getElementById('cg-canvas');
      if (!canvas || CH_META[curCh]?.id !== 'ch-causal') { _raf=null; return; }
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
      const ctx = canvas.getContext('2d');
      ctx.scale(devicePixelRatio, devicePixelRatio);

      // Force simulation (simplified Barnes-Hut)
      if (ticks < 300) {
        _nodes.forEach(a => {
          // Center gravity
          a.vx += (W/2 - a.x) * CENTER;
          a.vy += (H/2 - a.y) * CENTER;
          // Node-node repulsion
          _nodes.forEach(b => {
            if (a===b) return;
            const dx=a.x-b.x, dy=a.y-b.y;
            const d2 = dx*dx+dy*dy+1;
            const f = REPEL/(d2);
            a.vx += dx*f; a.vy += dy*f;
          });
        });
        // Edge attraction
        _edges.forEach(e => {
          const a = _nodes.find(n=>n.id===e.from), b = _nodes.find(n=>n.id===e.to);
          if (!a||!b) return;
          const dx=b.x-a.x, dy=b.y-a.y;
          a.vx += dx*ATTRACT*e.weight; a.vy += dy*ATTRACT*e.weight;
          b.vx -= dx*ATTRACT*e.weight; b.vy -= dy*ATTRACT*e.weight;
        });
        _nodes.forEach(n => {
          if (_drag?.id===n.id) return;
          n.vx *= DAMP; n.vy *= DAMP;
          n.x  += n.vx; n.y  += n.vy;
          n.x = Math.max(40,Math.min(W-40,n.x));
          n.y = Math.max(40,Math.min(H-40,n.y));
        });
        ticks++;
      }

      // Draw
      ctx.save();
      ctx.translate(_pan.x, _pan.y);
      ctx.scale(_scale, _scale);

      ctx.clearRect(-_pan.x/_scale-100, -_pan.y/_scale-100, W/_scale+200, H/_scale+200);

      // Edges
      ctx.globalAlpha = 0.35;
      _edges.forEach(e => {
        const a=_nodes.find(n=>n.id===e.from), b=_nodes.find(n=>n.id===e.to);
        if(!a||!b) return;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = Math.min(e.weight, 4) * 0.5;
        ctx.stroke();
        // Arrow
        const angle = Math.atan2(b.y-a.y, b.x-a.x);
        const r = 6 + b.mass*3;
        const ax = b.x - Math.cos(angle)*r, ay = b.y - Math.sin(angle)*r;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - Math.cos(angle-.5)*6, ay - Math.sin(angle-.5)*6);
        ctx.lineTo(ax - Math.cos(angle+.5)*6, ay - Math.sin(angle+.5)*6);
        ctx.closePath(); ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fill();
      });

      // Nodes
      ctx.globalAlpha = 1;
      _nodes.forEach(n => {
        const r = 6 + n.mass * 3;
        const col = sigCol(n.sigma);
        const isHov = _hover?.id===n.id;

        // Glow for high sigma
        if (n.sigma > 0.4) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r*2.2, 0, Math.PI*2);
          ctx.fillStyle = col.replace('0.9','0.06').replace('0.95','0.08'); ctx.fill();
        }

        // Node body
        ctx.beginPath(); ctx.arc(n.x, n.y, r + (isHov?2:0), 0, Math.PI*2);
        ctx.fillStyle = col; ctx.fill();
        if (isHov) { ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1.5; ctx.stroke(); }

        // Label
        ctx.fillStyle = isHov ? '#fff' : 'rgba(255,255,255,.55)';
        ctx.font = `${isHov?'700 ':''} ${Math.min(9,7+n.mass*.3)}px 'Space Mono',monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        // Truncate long labels
        const lbl = n.label.length > 20 ? n.label.slice(0,18)+'…' : n.label;
        ctx.fillText(lbl, n.x, n.y + r + 3);
      });

      ctx.restore();
      _raf = requestAnimationFrame(tick);
    }
    _raf = requestAnimationFrame(tick);
  }

  function attachEvents() {
    const canvas = document.getElementById('cg-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', e => {
      const p = _canvasPoint(canvas, e);
      const hit = _nodeAt(p);
      if (hit) { _drag = hit; hit._dragOx = p.x-hit.x; hit._dragOy = p.y-hit.y; }
      else { _panStart = p; }
    });
    canvas.addEventListener('mousemove', e => {
      const p = _canvasPoint(canvas, e);
      if (_drag) { _drag.x=p.x-_drag._dragOx; _drag.y=p.y-_drag._dragOy; _drag.vx=0; _drag.vy=0; }
      else if (_panStart) { _pan.x+=p.x-_panStart.x; _pan.y+=p.y-_panStart.y; _panStart=p; }
      const hit = _nodeAt(p);
      if (hit !== _hover) {
        _hover = hit;
        const tip = document.getElementById('cg-tooltip');
        if (hit && tip) {
          tip.style.display='block'; tip.style.left=(e.offsetX+12)+'px'; tip.style.top=(e.offsetY-10)+'px';
          tip.innerHTML = `<b style="color:${sigCol(hit.sigma)}">${hit.label}</b><br>σ ${hit.sigma.toFixed(3)} · count ${hit.count}`;
        } else if (tip) tip.style.display='none';
      }
    });
    canvas.addEventListener('mouseup', () => { _drag=null; _panStart=null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      _scale = Math.max(0.3, Math.min(3, _scale * delta));
    }, {passive:false});
  }

  function _canvasPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return { x:(e.clientX-r.left-_pan.x)/_scale, y:(e.clientY-r.top-_pan.y)/_scale };
  }
  function _nodeAt(p) {
    for (const n of _nodes) {
      const r=6+n.mass*3+4, dx=p.x-n.x, dy=p.y-n.y;
      if (dx*dx+dy*dy < r*r) return n;
    }
    return null;
  }

  // Co-pilot readable state — exposed as window property for co-pilot context
  function getState() {
    return { nodeCount:_nodes.length, edgeCount:_edges.length,
      topNodes: _nodes.sort((a,b)=>b.sigma-a.sigma).slice(0,5).map(n=>({label:n.label,sigma:n.sigma.toFixed(3),count:n.count})),
      maxSigma: _nodes.reduce((m,n)=>Math.max(m,n.sigma),0).toFixed(3),
    };
  }

  return { load, attachEvents, getState };
})();

function cgLoad() { CG.load(); }
document.addEventListener('DOMContentLoaded', () => {
  CG.attachEvents();
});

