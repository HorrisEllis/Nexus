'use strict';
/**
 * ui/tv-shell/nerve/nerve.js — NEXUS Nerve System
 * UUID: nexus-nerve-v1-0000-2026-0630-jamesbrooks-001
 *
 * CFR field mapped onto nodes and wires rendered as a living nervous
 * system. Each system is a node; each declared hook wire is a nerve
 * fibre; the CFR field (sigma/coherence/friction/entropy) drives
 * pulse frequency and colour directly.
 *
 * Data sources — both wired for real this session, not stubs:
 *   GET /api/guardian/nerve/snapshot  → unified Nerve snapshot (nodes, field, stresses)
 *   (Guardian proxies to Cortex which runs lib/nerve/index.js — §5.7 sovereign consumer pattern)
 *   Individual routes still available if needed:
 *     GET /api/guardian/cfr/state     → raw field state
 *     GET /api/guardian/hooks/summary → raw wire graph
 *
 * Sovereign module: own canvas, own polling loop, HTTP-callable
 * (POST /api/ui/nerve/on|off|sigma), registers with co-pilot.
 */

(function () {
  // ── Config ──────────────────────────────────────────────────────────────
  const POLL_CFR_MS   = 2000;
  const POLL_HOOKS_MS = 30000;
  const ORCH          = window.__NEXUS_ORCH__ || 'http://127.0.0.1:9000';

  // ── Canvas setup ────────────────────────────────────────────────────────
  // §BUG FIXED 2026-07-11 — getContext('2d') on a null canvas throws
  // uncaught and halts the rest of this IIFE (same failure mode the
  // codebase already documents and guards against for ui/home/index.html's
  // #void particle canvas — see that file's §FIX 2026-06-21 comment).
  // nerve.js previously had no such guard: any page that loaded this
  // script without also injecting nerve.html's canvas+HUD markup first
  // (exactly what ui/home/shell.js did until this fix) crashed on load.
  const canvas = document.getElementById('nerve-canvas');
  if (!canvas) {
    console.warn('[nerve] #nerve-canvas not found in DOM — nerve.html\'s fragment must be present before nerve.js loads. Skipping init.');
  } else {
  const ctx    = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ── State ────────────────────────────────────────────────────────────────
  let field = { sigma: 0, coherence: 1, friction: 0, entropy: 0, regime: 'stable' };
  let nodes = {};  // id → { id, x, y, vx, vy, pressure }
  let wires = [];  // [{ from, to, seam, pressure }]
  let tick  = 0;
  // §FN2/FN3 0.59.0 — each Clear Glass window's attention (the interaction field's last map, spotlight, pointer), from the
  // snapshot's windows[].focus; and the node a person (or the field) last pressed
  let attention = [];
  let picked = null, pickedAt = 0;

  // ── Fixed layout — positions chosen for clarity, not force-directed ──────
  // Force-direction produces chaos with 10 nodes and 16 edges at this scale;
  // a hand-tuned spoke layout is more legible and doesn't jump around on
  // every data refresh. Positions are fractions of W/H, applied on resize.
  const LAYOUT = {
    orchestrator: [0.50, 0.12],
    guardian:     [0.80, 0.30],
    cortex:       [0.80, 0.70],
    copilot:      [0.50, 0.88],
    idearium:     [0.20, 0.70],
    emerge:       [0.20, 0.30],
    ollama:       [0.65, 0.50],
    eravos:       [0.35, 0.50],
    browser:      [0.93, 0.50],
    ui:           [0.07, 0.50],
  };

  function applyLayout() {
    for (const [id, [fx, fy]] of Object.entries(LAYOUT)) {
      if (!nodes[id]) nodes[id] = { id, pressure: 0 };
      nodes[id].x = fx * W;
      nodes[id].y = fy * H;
    }
  }

  // ── CFR → visual mapping ─────────────────────────────────────────────────
  // Sigma 0-1: how much stress the field is under.
  // Regime: 'stable' (cyan/teal) | 'stressed' (amber) | 'critical' (red)
  function regimeColor(regime, alpha) {
    const a = (alpha !== undefined ? alpha : 1).toFixed(2);
    if (regime === 'critical') return `rgba(255,68,102,${a})`;
    if (regime === 'stressed') return `rgba(255,180,84,${a})`;
    return `rgba(0,245,255,${a})`;  // stable — cyan, same as Spotlight's --ac
  }

  // ── Data polling ─────────────────────────────────────────────────────────
  // ── Unified Nerve snapshot poll ────────────────────────────────────────────
  // One call to /nerve/snapshot returns nodes + field + stresses together.
  // Guardian proxies → Cortex → lib/nerve/index.js. No direct imports
  // between Clear Glass and any NEXUS lib — §5.7 sovereign consumer.
  async function pollNerveSnapshot() {
    try {
      const d = await fetch(`${ORCH}/api/guardian/nerve/snapshot`, {
        signal: AbortSignal.timeout(3000),
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!d?.ok) return;

      // Update field from snapshot
      if (d.nodes?.[0]?.health) {
        const h = d.nodes[0].health; // all nodes share global field in Phase 1
        field.sigma     = h.entropy ?? 0;  // entropy as proxy for sigma until phase 4
        field.coherence = h.coherence ?? 1;
        field.friction  = h.friction  ?? 0;
        field.entropy   = h.entropy   ?? 0;
        field.regime    = h.regime    || 'stable';
      }

      // Build wire list from nodes that have declared hooks
      // (Phase 2+: Nerve will carry wire graph directly; for now
      //  fall back to the hooks/summary route if snapshot has no wires)
      if (d.stresses) field.stressCount = d.stresses.length;
      if (Array.isArray(d.windows)) attention = d.windows;   // §FN2 — where each window's attention is
    } catch (_) {}
  }

  async function pollCFR() {
    // Kept as direct fallback if nerve/snapshot unavailable
    try {
      const d = await fetch(`${ORCH}/api/guardian/cfr/state`, {
        signal: AbortSignal.timeout(3000),
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (d?.ok) {
        field.sigma     = d.sigma    ?? 0;
        field.coherence = d.coherence ?? 1;
        field.friction  = d.friction  ?? 0;
        field.entropy   = d.entropy   ?? 0;
        field.regime    = d.regime    || 'stable';
      }
    } catch (_) {}
  }

  async function pollHooks() {
    try {
      const d = await fetch(`${ORCH}/api/guardian/hooks/summary`, {
        signal: AbortSignal.timeout(3000),
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!d?.ok) return;

      // Rebuild wire list from real data
      wires = (d.wires || [])
        .filter(w => w.from?.surface && w.to?.surface
                  && w.from.surface !== '*'        && w.to.surface !== '*'
                  && w.from.surface !== 'browser-tab' && w.to.surface !== 'browser-tab')
        .map(w => ({
          from:  w.from.surface,
          to:    w.to.surface,
          seam:  !!w.seam,
          pressure: 0,
        }));

      // Add any new systems from the wire graph to the node set
      const seen = new Set(Object.keys(LAYOUT));
      for (const w of wires) {
        for (const id of [w.from, w.to]) {
          if (!seen.has(id) && id !== 'browser-tab') {
            if (!nodes[id]) nodes[id] = { id, x: W * 0.5, y: H * 0.5, pressure: 0 };
            seen.add(id);
          }
        }
      }
    } catch (_) {}
  }

  // ── Pressure per node — same formula as wireRelationalTension ─────────────
  function updatePressures() {
    // Reset
    for (const n of Object.values(nodes)) n.pressure = 0;

    for (const w of wires) {
      // Wire pressure: sigma drives base, unseamed wire adds a small boost
      const p = Math.min(1, field.sigma + (w.seam ? 0 : 0.08));
      w.pressure = p;
      if (nodes[w.from]) nodes[w.from].pressure = Math.max(nodes[w.from].pressure, p);
      if (nodes[w.to])   nodes[w.to].pressure   = Math.max(nodes[w.to].pressure,   p);
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────
  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    tick++;

    // Update HUD labels
    const hudRegime = document.getElementById('nerve-regime');
    const hudSigma  = document.getElementById('nerve-sigma');
    const hudNodes  = document.getElementById('nerve-nodes-count') || document.getElementById('nerve-nodes');   // §FN3 — nerve.html names them nerve-nodes/nerve-wires
    const hudWires  = document.getElementById('nerve-wires-count') || document.getElementById('nerve-wires');
    const nerveDot  = document.getElementById('nerve-dot');
    if (hudRegime) { hudRegime.textContent = field.regime; hudRegime.dataset.regime = field.regime; }
    if (hudSigma)  hudSigma.textContent  = `σ ${field.sigma.toFixed(3)}`;
    if (hudNodes)  hudNodes.textContent  = `${Object.keys(nodes).length} nodes`;
    if (hudWires)  hudWires.textContent  = `${wires.length} wires`;
    if (nerveDot) {
      nerveDot.className = 'ch-dot' + (field.sigma > 0.5 ? '' : ' online');
      nerveDot.style.background = field.regime === 'critical' ? 'rgba(255,68,102,.9)'
        : field.regime === 'stressed' ? 'rgba(255,180,84,.9)' : '';
    }

    // ── Wires ──
    for (const w of wires) {
      const from = nodes[w.from];
      const to   = nodes[w.to];
      if (!from || !to) continue;

      // Pulse along the wire — phase offset per wire so they don't all sync
      const phase  = (w.from.charCodeAt(0) + w.to.charCodeAt(0)) % 60;
      const pulse  = 0.5 + 0.5 * Math.sin((tick + phase) / 15);
      const alpha  = 0.15 + 0.6 * w.pressure + 0.25 * pulse;
      const width  = 0.5 + 1.5 * w.pressure + (w.seam ? 0.5 : 0);

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = regimeColor(field.regime, Math.min(1, alpha));
      ctx.lineWidth   = width;
      ctx.shadowColor = regimeColor(field.regime, 0.4);
      ctx.shadowBlur  = 4 + 8 * w.pressure;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // Travelling pulse dot — nerve impulse
      if (w.pressure > 0.05) {
        const t    = ((tick + phase * 2) % 90) / 90; // 0→1 along wire
        const px   = from.x + (to.x - from.x) * t;
        const py   = from.y + (to.y - from.y) * t;
        const pr   = 2 + 2 * w.pressure;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = regimeColor(field.regime, 0.85);
        ctx.shadowColor = regimeColor(field.regime);
        ctx.shadowBlur  = 8;
        ctx.fill();
        ctx.shadowBlur  = 0;
      }
    }

    // ── Nodes ──
    for (const n of Object.values(nodes)) {
      if (isNaN(n.x) || isNaN(n.y)) continue;

      // Node radius pulses gently with pressure
      const pulse = 0.5 + 0.5 * Math.sin((tick + n.id.charCodeAt(0)) / 20);
      const r     = 8 + 6 * n.pressure + 2 * pulse;

      // Outer glow
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
      ctx.fillStyle   = regimeColor(field.regime, 0.1 + 0.15 * n.pressure);
      ctx.shadowColor = regimeColor(field.regime);
      ctx.shadowBlur  = 12 + 10 * n.pressure;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = regimeColor(field.regime, 0.5 + 0.4 * n.pressure);
      ctx.shadowBlur  = 0;
      ctx.fill();

      // Inner bright point
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      // Label
      ctx.fillStyle   = `rgba(216,218,228,${0.6 + 0.4 * n.pressure})`;
      ctx.font        = `${10 + Math.round(2 * n.pressure)}px ui-monospace,monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText(n.id, n.x, n.y + r + 13);
    }

    // ── Field overlay — regime + sigma printed top-left ──
    ctx.fillStyle = 'rgba(216,218,228,0.35)';
    ctx.font      = '10px ui-monospace,monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`σ ${field.sigma.toFixed(3)}  ${field.regime}`, 8, 14);

    // §FN3 0.59.0 — where an agent's attention is: the browser node rings while a window's field is in use (15 s), and
    // the HUD says what it did last. The node last pressed (by a person, or through the field) rings too.
    const f = _latestFocus();
    const hudFocus = _hudSpan('nerve-focus');
    if (hudFocus) hudFocus.textContent = picked && Date.now() - pickedAt < 8000 ? _nodeText(picked) : f ? _focusText(f) : '';
    const ring = (n, a) => { if (!n || isNaN(n.x)) return; ctx.beginPath(); ctx.arc(n.x, n.y, 18 + 6 * Math.sin(tick / 8), 0, Math.PI * 2); ctx.strokeStyle = `rgba(167,139,250,${a})`; ctx.lineWidth = 1.5; ctx.stroke(); };
    if (f && Date.now() - f.at < 15000) ring(nodes.browser, 0.8);
    if (picked) ring(nodes[picked], 0.6);
    placeTargets();
  }

  // §FN3 — the newest window focus that has something to say
  function _latestFocus() {
    let best = null;
    for (const w of attention) {
      const fc = w && w.focus; if (!fc || !fc.at) continue;
      if (!(fc.pointer || fc.spotlight || fc.field)) continue;
      if (!best || fc.at > best.at) best = { ...fc, agentId: w.agentId };
    }
    return best && Date.now() - best.at < 120000 ? best : null;
  }
  function _focusText(f) {
    const last = [f.pointer && { at: f.pointer.at, t: `${f.pointer.do} ${f.pointer.n != null ? `#${f.pointer.n}` : `(${f.pointer.x},${f.pointer.y})`}${f.pointer.name ? ` ${f.pointer.name}` : ''}${f.pointer.covered ? ' (covered)' : ''}` },
      f.spotlight && { at: f.spotlight.at, t: `showing ${f.spotlight.label || f.spotlight.selector || ''}` },
      f.field && { at: f.field.at, t: `field ${f.field.targets} targets` }].filter(Boolean).sort((a, b) => b.at - a.at)[0];
    return `◎ ${f.agentId} · ${last ? last.t : ''}`;
  }
  function _hudSpan(id) {
    let el = document.getElementById(id);
    const hud = document.getElementById('nerve-hud');
    if (!el && hud) { el = document.createElement('span'); el.id = id; el.style.color = 'rgba(167,139,250,.8)'; hud.appendChild(el); }
    return el;
  }

  // §FN3 0.59.0 — a canvas has nothing for the interaction field to number, so the nerve was invisible to it (and to any
  // agent reading the page). Each node gets a transparent, labelled button over it: the field numbers the nodes by name,
  // spotlight rings one, a press says that node's state. The holder is 0×0 at the canvas's corner so only the buttons
  // take the pointer, and they inherit the root's pointer-events (the home page's background nerve stays untouchable).
  let _targets = null;
  function placeTargets() {
    const root = canvas.parentElement; if (!root) return;
    if (!_targets) { _targets = document.createElement('div'); _targets.id = 'nerve-targets'; _targets.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;'; root.appendChild(_targets); }
    const ids = Object.keys(nodes).filter(id => !isNaN(nodes[id].x));
    for (const b of [..._targets.children]) if (!nodes[b.dataset.node]) b.remove();
    for (const id of ids) {
      const n = nodes[id];
      let b = _targets.querySelector(`[data-node="${CSS.escape(id)}"]`);
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.dataset.node = id;
        b.style.cssText = 'position:absolute;width:32px;height:32px;margin:-16px 0 0 -16px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;';
        b.onclick = () => { picked = id; pickedAt = Date.now(); try { window.dispatchEvent(new CustomEvent('nerve:node', { detail: { id, wires: _wiresOf(id) } })); } catch (_) {} };
        _targets.appendChild(b);
      }
      const label = `nerve node ${id} — ${_wiresOf(id)} wire(s), pressure ${n.pressure.toFixed(2)}, field ${field.regime}`;
      if (b.getAttribute('aria-label') !== label) { b.setAttribute('aria-label', label); b.title = label; }
      const left = `${Math.round(n.x)}px`, top = `${Math.round(n.y)}px`;
      if (b.style.left !== left) b.style.left = left;
      if (b.style.top !== top) b.style.top = top;
    }
  }
  function _wiresOf(id) { return wires.filter(w => w.from === id || w.to === id).length; }
  function _nodeText(id) { const n = nodes[id] || {}; return `● ${id} · ${_wiresOf(id)} wire(s) · pressure ${(n.pressure || 0).toFixed(2)} · ${field.regime}`; }

  // ── Main loop ────────────────────────────────────────────────────────────
  function loop() {
    updatePressures();
    drawFrame();
    requestAnimationFrame(loop);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function boot() {
    await Promise.all([pollNerveSnapshot(), pollHooks()]);
    applyLayout();
    loop();

    setInterval(() => pollNerveSnapshot().catch(() => pollCFR().catch(() => {})), POLL_CFR_MS);
    setInterval(() => {
      pollHooks().then(() => applyLayout()).catch(() => {});
    }, POLL_HOOKS_MS);
  }

  boot();

  // ── HTTP control surface — co-pilot can call these ────────────────────────
  window.NexusNerve = {
    on:    ()   => { canvas.style.display = 'block'; },
    off:   ()   => { canvas.style.display = 'none'; },
    sigma: (v)  => { field.sigma = Math.max(0, Math.min(1, v)); }, // manual override for demos
    field: ()   => ({ ...field }),
    nodes: ()   => ({ ...nodes }),
    wires: ()   => wires.slice(),
    attention: () => attention.slice(),                                   // §FN2 — each window's focus
    pick:  (id) => { const b = _targets && _targets.querySelector(`[data-node="${CSS.escape(id)}"]`); if (b) b.click(); return !!b; },   // §FN3
  };
  } // §BUG FIXED 2026-07-11 — closes the `if (!canvas) {...} else {` guard added above.
    // NexusNerve is intentionally left unexposed on window when the canvas
    // never existed, rather than exposing an object whose methods would
    // throw the moment anything called them (§1.2 — loud, not deferred).
})();
