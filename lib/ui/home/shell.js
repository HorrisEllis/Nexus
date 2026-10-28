'use strict';
/**
 * ui/home/shell.js — thin shell, per ui/home/DECOMP.md's own spec:
 * "tune(), toggleMenu(), connectSSE(), flashDot(), pollHealth(),
 * CH_META[], MODE_CONFIG{}, P{}. Everything else is in the module
 * that owns it." This shell only boots modules and wires the one SSE
 * connection everything else shares — it owns no rendering of its own.
 *
 * §NOTE — this is an ADDITIVE new entry point (nexus-home.html), not a
 * replacement of the existing ui/home/index.html. That file is a real,
 * working 4000-line surface already carrying production traffic
 * (per DECOMP.md's own "What exists now" section) — DECOMP.md's own
 * migration plan (Phase 1-3) extracts modules out of it incrementally
 * rather than swapping the whole file at once, which is the same
 * instinct followed here: prove the decomposed shape works standalone
 * first, cut the monolith over to it once it does.
 */
(function () {
  const P = { orchestrator: 9000 }; // same origin — see STRUCTURE.md SISO law
  // §BUG FIXED 2026-07-11 — ui/tv-shell/spotlight/spotlight.js reads
  // `B.orch` directly at four call sites (observation events, confusion
  // detection, CFR polling). B existed in the old monolith as a shell-scope
  // global; this shell never defined it at all, so every one of those four
  // call sites threw ReferenceError the instant spotlight.js ran.
  const B = { orch: `http://127.0.0.1:${P.orchestrator}` };
  window.B = B;

  // §GAP CLOSED 2026-07-11 — this used to hardcode ONE channel ('build')
  // with no way to reach any other. CH_META is the registry DECOMP.md
  // specified for shell.js to own ("CH_META[] — channel registry (id,
  // name, accent)"); it existed only in the old monolith (ui/home/
  // index.html), never here. Every channel below is a real, standalone
  // file under ui/channels/ — see DECOMP.md's Phase 2 for which.
  const CH_META = [
    { id: 'build',         name: 'BUILD',         accent: 'Closed-loop build pipeline',           src: '/ui/channels/build/build.html' },
    { id: 'overview',      name: 'OVERVIEW',      accent: 'System grid · health',                  src: '/ui/channels/overview/overview.html' },
    { id: 'idearium',      name: 'IDEARIUM',      accent: ':4800 · Idea lattice',                  src: '/ui/channels/idearium/idearium.html' },
    { id: 'guardian',      name: 'GUARDIAN',      accent: ':7820 · Agent dispatch',                src: '/ui/channels/guardian/guardian.html' },
    { id: 'cortex',        name: 'CORTEX',        accent: ':3748 · Memory · gaps',                 src: '/ui/channels/cortex/cortex.html' },
    { id: 'bridge',        name: 'BRIDGE',        accent: ':9999 · P2P relay',                     src: '/ui/channels/bridge/bridge.html' },
    { id: 'diagnose',      name: 'DIAGNOSE',      accent: 'System checks · CFR · gaps',             src: '/ui/channels/diagnose/diagnose.html' },
    { id: 'causal',        name: 'CAUSAL',        accent: 'Event causality · live force graph',     src: '/ui/channels/causal/causal.html' },
    { id: 'conversations', name: 'CONVERSATIONS', accent: 'Co-pilot exchange log',                  src: '/ui/channels/conversations/conversations.html' },
    { id: 'log',           name: 'LOG',           accent: 'Live SSE event stream',                  src: '/ui/channels/log/log.html' },
    { id: 'blueprint',     name: 'BLUEPRINT',     accent: 'Component descriptor · phase map',        src: '/ui/channels/blueprint/blueprint.html' },
  ];
  const mounted = {}; // id -> iframe element, lazy-mounted on first visit
  let activeId = null;

  async function boot() {
    // 1. Toast layer mounts first — every subsequent step can report failure.
    window.Toast && window.Toast.mount(document.body);
    const sse = window.Toast ? window.Toast.connect('/sse') : new EventSource('/sse');

    // 2. Consent gate — blocks nothing except RFR2 people-modeling itself.
    //    The rest of the UI (build pipeline, health, etc.) works whether
    //    the user says yes or no; this only decides whether copilot's
    //    user-model calls getRelationalSignal() successfully or gets
    //    'consent-not-granted' back.
    if (window.ConsentGate) {
      const alreadyDecided = await window.ConsentGate.checkAndShow();
      window.ConsentGate.on('decided', ({ granted }) => {
        window.Toast && window.Toast.show(
          granted ? 'Pattern learning enabled.' : 'Pattern learning stays off.', 'info');
      });
    }

    // 3. Build the rail (one button per CH_META entry) and tune to the
    //    first channel — build pipeline stays the default landing tab,
    //    matching the prior behavior exactly for anyone already using it.
    _buildRail();
    tuneById('build');

    // 4. Floating menu + copilot CLI — reuses the real, existing
    //    tv-shell modules rather than re-inventing them here.
    _loadScript('/ui/tv-shell/menu.js');
    _loadScript('/ui/tv-shell/spotlight/spotlight.js');
    // nerve.html's own header comment documents this as a requirement
    // ("Requires: nerve.js, nerve.css, window.__NEXUS_ORCH__ set before
    // load") — nerve.js has a matching fallback default so this isn't
    // strictly load-bearing, but setting it explicitly matches the
    // documented contract instead of relying on the fallback silently
    // being correct.
    window.__NEXUS_ORCH__ = `http://127.0.0.1:${P.orchestrator}`;
    _loadScript('/ui/tv-shell/nerve/nerve.js');
  }

  function _buildRail() {
    const rail = document.getElementById('shell-rail');
    if (!rail) return;
    for (const ch of CH_META) {
      const btn = document.createElement('button');
      btn.id = `rail-btn-${ch.id}`;
      btn.textContent = ch.name;
      btn.title = ch.accent;
      btn.onclick = () => tuneById(ch.id);
      rail.appendChild(btn);
    }
  }

  // tune(n) / tuneById(id) — DECOMP.md's own required shell.js API. Switches
  // the active channel by swapping which mounted iframe is visible,
  // lazy-mounting a channel's iframe the first time it's tuned to (so
  // opening NEXUS doesn't pay the cost of loading all 11 channels at once).
  function tune(n) {
    const ch = CH_META[n];
    if (ch) tuneById(ch.id);
  }

  function tuneById(id) {
    const ch = CH_META.find(c => c.id === id);
    if (!ch) { console.warn(`[shell] unknown channel: ${id}`); return; }
    if (!mounted[id]) _mountChannel(ch.id, ch.src);

    Object.values(mounted).forEach(f => f.classList.remove('active'));
    mounted[id].classList.add('active');
    document.querySelectorAll('#shell-rail button').forEach(b => b.classList.remove('active'));
    document.getElementById(`rail-btn-${id}`)?.classList.add('active');
    activeId = id;
    // §BUG FIXED 2026-07-11 — ui/tv-shell/spotlight/spotlight.js reads
    // `CH_META[curCh]?.id` directly (two call sites: click observation and
    // confusion detection) expecting a global numeric index tracking the
    // active channel. Nothing here ever declared `curCh`, so both call
    // sites threw a ReferenceError the moment a tile was clicked —
    // spotlight's confusion-detection never ran. window.curCh is kept in
    // sync on every tune, same contract the old monolith's tune() honored.
    window.curCh = CH_META.findIndex(c => c.id === id);
  }

  function _mountChannel(id, src) {
    const host = document.getElementById('shell-channel-host');
    if (!host) return;
    const iframe = document.createElement('iframe');
    iframe.id = `channel-${id}`;
    iframe.className = 'shell-channel-frame';
    iframe.src = src;
    host.appendChild(iframe);
    mounted[id] = iframe;
  }

  function _loadScript(src) {
    const s = document.createElement('script');
    s.src = src;
    s.onerror = () => console.warn(`[shell] optional module not found: ${src} (safe to ignore if not yet decomposed)`);
    document.body.appendChild(s);
  }

  window.tune = tune;
  window.tuneById = tuneById;
  // §BUG FIXED 2026-07-11 — ui/tv-shell/menu.js's own _buildNavButtons()
  // reads `window.CH_META || []` to render its floating-menu nav row (and
  // re-reads it every time the menu opens, per its own comment: "in case
  // CH_META loaded after menu init"). CH_META existed here only as a
  // module-local closure variable, so the floating menu's nav row rendered
  // empty every time — tuneById() worked fine if called directly, but
  // nothing in the menu could ever call it. This is the other half of
  // that contract.
  window.CH_META = CH_META;
  document.addEventListener('DOMContentLoaded', boot);
})();
