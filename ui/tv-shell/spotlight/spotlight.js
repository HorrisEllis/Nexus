/**
 * ui/tv-shell/spotlight/spotlight.js
 * UUID: nexus-spotlight-v1-0000-2026-0627-jamesbrooks-001
 *
 * Sovereign spotlight + pressure system.
 * Zero coupling to home shell. Zero coupling to co-pilot.
 * Co-pilot sends commands via HTTP. Spotlight executes. Shell mounts it.
 *
 * Public API (window.Spotlight):
 *   Spotlight.on(targets, opts)   — light up elements (pressure + glow)
 *   Spotlight.off()               — clear all spotlights
 *   Spotlight.step(steps, opts)   — guided step sequence
 *   Spotlight.tension(map)        — update tension field (CFR sigma)
 *   Spotlight.execute(ui)         — execute co-pilot ui{} instruction block
 *   Spotlight.navigate(channelId) — navigate the TV shell to a channel
 *
 * HTTP API (any system can call via orchestrator):
 *   POST /api/ui/spotlight/on   { target: 'guardian', ttl: 8000 }
 *   POST /api/ui/spotlight/off
 *   POST /api/ui/spotlight/step { steps: [] }
 *   POST /api/ui/spotlight/tension { map: {} }
 */
'use strict';

// ── Co-pilot UI Runtime ───────────────────────────────────────────────────────
// Spotlight, tension field, guided steps, interaction observation, CFR loop.
// Co-pilot returns ui:{} instructions — the runtime executes them.
// Nothing changes themes. Everything is additive, removable, variable-based.

const CP = (() => {
  // ── Active state ────────────────────────────────────────────────────────────
  let _spotlitEls = [];     // elements with copilot-spotlight class
  let _stepBadges = [];     // step badge elements
  let _spotlightTimer = null;
  let _guideSteps = [];
  let _activeStep = 0;
  let _cfr = { sigma: 0, coherence: 0, friction: 0, entropy: 0, regime: 'nominal' };

  // Element registry — every element co-pilot can reference by name
  // Grows as new sections are added. Co-pilot speaks in names, not IDs.
  const EL = {
    // Tiles
    'guardian':    'tile-gd',
    'cortex':      'tile-cx',
    'idearium':    'tile-idr',
    'orchestrator':'tile-orch',
    'bridge':      'tile-br',
    'diagnostic':  'tile-dg',
    'architect':   'tile-arch',
    'emerge':      'tile-em',
    'forge':       'tile-forge',
    'agent':       'tile-agent',
    'blueprint':   'tile-blueprint',
    // Rail buttons
    'rail-overview':   'rail-0',
    'rail-guardian':   'rail-1',
    'rail-cortex':     'rail-2',
    'rail-idearium':   'rail-3',
    'rail-bridge':     'rail-4',
    'rail-log':        'rail-5',
    'rail-diagnose':   'rail-6',
    'rail-blueprint':  'rail-7',
    // Assistant
    'assistant':       'assistant-in',
    'console':         'bot-bar',
    'send':            'send-btn',
    // Nav
    'menu':            'menu-btn',
    'inspect':         'inspect-btn',
  };

  function _el(name) {
    const id = EL[name] || name; // fall back to treating name as literal id
    return document.getElementById(id);
  }

  // ── Spotlight ───────────────────────────────────────────────────────────────
  // Lights up one or more elements with a pulsing outline.
  // Never changes color, background, font, or theme.
  // Auto-clears after ttl ms (default 8s), or on clearSpotlight().

  function spotlight(targets, opts = {}) {
    clearSpotlight();
    if (!targets) return;
    const { ttl = 8000, color = null, intensity = 0.85 } = opts;

    const list = Array.isArray(targets) ? targets : [targets];
    // --cp-focus is now derived from --ac-h (animated).
    // If caller requests a specific color, parse it to a hue offset instead
    // of overriding --cp-focus directly (which would kill the animation).
    if (color) {
      // Map named spotlight colors to hue values
      const HUE = {'#ff3355':350,'#ffaa00':38,'#00ff88':152,'#cc44ff':285};
      const h = HUE[color];
      if (h) document.documentElement.style.setProperty('--ac-h', h);
      // Auto-restore after ttl
      if (ttl > 0) setTimeout(() => document.documentElement.style.removeProperty('--ac-h'), ttl);
    }
    document.documentElement.style.setProperty('--cp-focus-alpha', intensity);

    for (const name of list) {
      const el = _el(name);
      if (!el) continue;
      el.classList.add('copilot-spotlight');
      // Physical spotlight: add pressure glow classes to tiles and rail buttons
      if (el.classList.contains('sys-tile')) el.classList.add('spotlight');
      if (el.classList.contains('ch-btn')) el.classList.add('spotlight-rail');
      // Also spotlight the matching rail button if a tile was targeted
      if (el.id && el.id.startsWith('tile-')) {
        const tileMap = {
          'tile-gd':'ch-guardian','tile-cx':'ch-cortex','tile-idr':'ch-idearium',
          'tile-br':'ch-bridge','tile-arch':'ch-architect','tile-em':'ch-emerge',
          'tile-dg':'ch-diagnose','tile-orch':'ch-orch-full',
        };
        const chanId = tileMap[el.id];
        if (chanId) {
          const railBtn = document.querySelector(`.ch-btn[onclick*="${chanId}"]`);
          if (railBtn) { railBtn.classList.add('spotlight-rail'); _spotlitEls.push(railBtn); }
        }
      }
      // Ensure element has position:relative for badge positioning
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      _spotlitEls.push(el);
    }

    if (ttl > 0) {
      _spotlightTimer = setTimeout(clearSpotlight, ttl);
    }
  }

  function clearSpotlight() {
    if (_spotlightTimer) { clearTimeout(_spotlightTimer); _spotlightTimer = null; }
    for (const el of _spotlitEls) {
      el.classList.remove('copilot-spotlight');
      el.classList.remove('spotlight');
      el.classList.remove('spotlight-rail');
    }
    _spotlitEls = [];
    clearBadges();
  }

  // ── Step badges ─────────────────────────────────────────────────────────────
  // Numbered floating markers on target elements. "1", "2", "3"…
  function clearBadges() {
    for (const b of _stepBadges) b.remove();
    _stepBadges = [];
  }

  function placeBadge(el, num) {
    const badge = document.createElement('div');
    badge.className = 'cp-step-badge';
    badge.textContent = num;
    el.appendChild(badge);
    _stepBadges.push(badge);
  }

  // ── Guided steps ────────────────────────────────────────────────────────────
  // Co-pilot returns steps:[{target,text},...].
  // Guide panel renders them. Active step is spotlit.
  // User clicking the target advances to the next step.

  function showGuide(steps) {
    _guideSteps = steps;
    _activeStep = 0;
    const panel = document.getElementById('cp-guide');
    if (!panel) return;

    panel.innerHTML = steps.map((s, i) =>
      `<div class="cp-guide-step${i === 0 ? ' active' : ''}" data-step="${i}">` +
        `<div class="cp-step-num">${i + 1}</div>` +
        `<div>${s.text}</div>` +
      `</div>`
    ).join('');
    panel.classList.add('open');

    // Spotlight first target + add click listener to advance
    _activateStep(0);
  }

  function _activateStep(n) {
    if (n >= _guideSteps.length) { dismissGuide(); return; }
    const step = _guideSteps[n];

    // Update panel
    document.querySelectorAll('.cp-guide-step').forEach((el, i) => {
      el.classList.toggle('active', i === n);
      el.classList.toggle('done', i < n);
    });

    // Spotlight target
    clearSpotlight();
    if (step.target) {
      spotlight(step.target, { ttl: 0 }); // no auto-clear during guided mode
      const targetEl = _el(step.target);
      if (targetEl) {
        placeBadge(targetEl, n + 1);
        // Advance on click
        const handler = () => {
          targetEl.removeEventListener('click', handler);
          _activeStep = n + 1;
          clearBadges();
          _activateStep(_activeStep);
        };
        targetEl.addEventListener('click', handler, { once: true });
      }
    }
  }

  function dismissGuide() {
    clearSpotlight();
    const panel = document.getElementById('cp-guide');
    if (panel) { panel.classList.remove('open'); panel.innerHTML = ''; }
    _guideSteps = [];
  }

  // ── Tension field ───────────────────────────────────────────────────────────
  // Writes --cp-tension (0-1) to each tile based on system health + CFR sigma.
  // The CSS uses this to produce a subtle inner glow — the tile *feels* its health.
  // Called every CFR poll cycle. Never changes theme colors.

  const TILE_SYSTEM_MAP = {
    'tile-gd':   'gd',
    'tile-cx':   'cx',
    'tile-idr':  'idr',
    'tile-orch': 'orch',
    'tile-br':   'br',
    'tile-arch': 'arch',
    'tile-dg':   'dg',
    'tile-em':   'em',
  };

  function updateTensionField(healthMap) {
    const baseTension = Math.min(1, _cfr.sigma * 1.2); // sigma drives the field

    for (const [tileId, sysKey] of Object.entries(TILE_SYSTEM_MAP)) {
      const tile = document.getElementById(tileId);
      if (!tile) continue;

      const up = healthMap[sysKey];
      let tension = 0;
      if (up === false) {
        // System offline — high tension regardless of sigma
        tension = 0.7 + baseTension * 0.3;
      } else if (up === true) {
        // System online — tension tracks CFR sigma, scaled down
        tension = baseTension * 0.4;
      } else {
        // Unknown — mild ambient tension
        tension = baseTension * 0.2;
      }

      tile.style.setProperty('--cp-tension', tension.toFixed(3));
    }
  }

  // ── CFR polling ─────────────────────────────────────────────────────────────
  // Polls cortex CFR field every 12s. Updates _cfr state.
  // Drives tension field + can surface proactive warnings to co-pilot output.

  let _healthMap = {};  // latest health state from pollHealth()

  // §relational-field 2026-06-30 — WIRED FOR REAL. Route now exists:
  // cortex serves /hooks/summary (real hooks/index.js data, 80 hooks/10
  // systems), guardian proxies it at /api/guardian/hooks/summary, same
  // pattern as cfr/state. Refreshed every 30s (wires change rarely — no
  // need to poll as often as health/cfr) and pushed through the same
  // sensation event pipe (_emitUIEvent) so a wire-pressure change is a
  // real, causally-chained event in the ledger, not just a number that
  // silently updates in memory.
  let _hooksCache = null;
  let _lastWirePressure = {}; // "from→to" -> last emitted pressure, to avoid re-emitting unchanged values
  async function _getHooks() {
    try {
      const d = await fetch(`${B.orch}/api/guardian/hooks/summary`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (d?.ok) _hooksCache = d;
    } catch(_) { /* keep stale cache rather than null it out on a transient failure */ }
    return _hooksCache;
  }

  async function pollWirePressure() {
    const hooksData = await _getHooks();
    if (!hooksData?.wires) return;
    for (const wire of hooksData.wires) {
      const fromId = wire.from?.surface, toId = wire.to?.surface;
      if (!fromId || !toId || fromId === '*' || toId === 'browser-tab') continue; // skip non-system endpoints
      const pressure = wireRelationalTension(fromId, toId, _healthMap, hooksData.wires);
      const key = `${fromId}→${toId}`;
      // Only emit on real change — pushing through the event bus on every
      // 30s tick even when nothing moved would just be noise, the same
      // anti-pattern §13.3's fault taxonomy exists to name and avoid.
      if (_lastWirePressure[key] === undefined || Math.abs(_lastWirePressure[key] - pressure) > 0.05) {
        _lastWirePressure[key] = pressure;
        _emitUIEvent('wire.pressure.changed', { from: fromId, to: toId, pressure, seamTracked: !!wire.seam });
      }
    }
  }
  setInterval(() => pollWirePressure().catch(() => {}), 30000);

  // Relational tension between two systems = max of their own tensions,
  // boosted if the wire connecting them is NOT seam-tracked (an
  // undeclared/unmonitored connection is itself a pressure source — same
  // idea as a confirmed→drifting→violated seam, just not yet built as a
  // continuous tracker; this is the field-level proxy for it today).
  function wireRelationalTension(fromId, toId, healthMap, wires) {
    const baseFrom = (healthMap[fromId]?.health ?? 1);
    const baseTo   = (healthMap[toId]?.health ?? 1);
    const nodeTension = 1 - Math.min(baseFrom, baseTo);
    const wire = (wires || []).find(w => w.from?.surface === fromId && w.to?.surface === toId);
    const undeclaredBoost = !wire ? 0.15 : (wire.seam ? 0 : 0.08);
    return Math.min(1, nodeTension + undeclaredBoost);
  }

  async function pollCFR() {
    try {
      const d = await fetch(`${B.orch}/api/guardian/cfr/state`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      if (!d) return;
      _cfr.sigma     = typeof d.sigma === 'object' ? (d.sigma?.score ?? 0) : (d.sigma ?? 0);
      _cfr.coherence = d.coherence ?? 0;
      _cfr.friction  = d.friction  ?? 0;
      _cfr.entropy   = d.entropy   ?? 0;
      _cfr.regime    = d.regime    || 'nominal';
      // Write global sigma to root — anything reading --cp-tension gets it
      document.documentElement.style.setProperty('--cp-tension', _cfr.sigma.toFixed(3));
      updateTensionField(_healthMap);
    } catch(_) {}
  }

  // Called by pollHealth() to keep _healthMap in sync
  function setHealthState(key, up) {
    _healthMap[key] = up;
    updateTensionField(_healthMap);
  }

  // ── Interaction observation ──────────────────────────────────────────────────
  // Records what the user clicks on tiles + rail without asking.
  // Sends a lightweight observation to co-pilot channel endpoint (fire & forget).
  // Co-pilot uses this to build the user model without the user typing anything.

  const _recentClicks = [];
  const OBS_TARGETS = ['tile-gd','tile-cx','tile-idr','tile-orch','tile-br',
    'tile-dg','tile-arch','tile-em','tile-forge','tile-agent',
    'rail-0','rail-1','rail-2','rail-3','rail-4','rail-5','rail-6','rail-7'];

  // §sensation 2026-06-29 — every click is now a real event_log row, not just
  // an in-memory array. lastEventId chains causedBy so confusion (below)
  // traces back to the exact clicks that caused it — traceToRoot-able.
  // Dead-link fix applied same session: guardian/server.js now proxies
  // /api/guardian/cfr/{state,event} to cortex:3748 — both this call and
  // pollCFR()'s below now reach something real.
  let _lastEventId = null;
  function _emitUIEvent(type, payload) {
    return fetch(`${B.orch}/api/guardian/cfr/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, source: 'tv-ui.spotlight', payload, causedBy: _lastEventId }),
    }).then(r => r.json()).then(d => { if (d?.id) _lastEventId = d.id; return d; }).catch(() => null);
  }

  function _wireObservation() {
    for (const id of OBS_TARGETS) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('click', () => {
        const now = Date.now();
        _recentClicks.push({ id, ts: now });
        _emitUIEvent('ui.tile.click', { id, channel: CH_META[curCh]?.id || 'unknown' });
        // Keep last 20 clicks
        if (_recentClicks.length > 20) _recentClicks.shift();
        // Detect confusion: same element clicked 3+ times in 10s
        const recent = _recentClicks.filter(c => c.id === id && now - c.ts < 10000);
        if (recent.length >= 3) {
          _observeConfusion(id);
        }
      });
    }
  }

  function _observeConfusion(elementId) {
    // User seems stuck on this element — tell co-pilot
    fetch(`${B.orch}/api/guardian/copilot/observe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'confusion',
        element: elementId,
        channel: CH_META[curCh]?.id || 'unknown',
        ts: Date.now(),
      }),
    }).catch(() => {});
  }

  // ── Execute co-pilot UI instructions ─────────────────────────────────────────
  // Called from asSend() when co-pilot returns a ui:{} payload.

  function exec(ui, text) {
    if (!ui) return;

    // Navigation — already handled in asSend, but guard here too
    if (ui.command === 'tuneById' && ui.arg) {
      const idx = CH_META.findIndex(c => c.id === ui.arg);
      if (idx !== -1) setTimeout(() => tune(idx), 300);
    }

    // Spotlight one or more elements
    if (ui.spotlight) {
      spotlight(ui.spotlight, {
        ttl:       ui.spotlightTtl  ?? 8000,
        color:     ui.spotlightColor ?? null,
        intensity: ui.spotlightIntensity ?? 0.85,
      });
    }

    // Guided step-by-step walkthrough
    if (ui.steps && Array.isArray(ui.steps) && ui.steps.length) {
      showGuide(ui.steps);
    }

    // Dismiss guide
    if (ui.dismissGuide) dismissGuide();

    // Set tension manually (e.g. co-pilot wants to emphasise a specific tile)
    if (ui.tensionOverride && typeof ui.tensionOverride === 'object') {
      for (const [name, val] of Object.entries(ui.tensionOverride)) {
        const el = _el(name);
        if (el) el.style.setProperty('--cp-tension', Math.min(1, Math.max(0, val)).toFixed(3));
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    _wireObservation();
    setInterval(pollCFR, 12000);
    setTimeout(pollCFR, 2000); // first poll soon after boot
  }

  return { init, spotlight, clearSpotlight, showGuide, dismissGuide,
           exec, setHealthState, updateTensionField, getCFR: () => _cfr };
})();

// §BUG FIXED 2026-07-06: window.CP was never assigned anywhere — CP only
// existed as this file's own local closure variable, invisible to any
// other script. ui/copilot/copilot.js's `if (cp.ui) window.CP.exec(cp.ui,
// cp.text)` has been throwing TypeError on `undefined.exec` every time a
// copilot response included a `ui` field — harmless only because
// copilot/server.js has never actually sent one yet. Exposed for real now.
if (typeof window !== 'undefined') window.CP = CP;

// Public API — clean surface for the shell and other systems
// §BUG FIXED 2026-07-06: three of these five wrappers called method names
// that don't exist on CP's real exports (guidedSteps/updateTension/
// executeUI vs. the real showGuide/updateTensionField/exec) — checked
// every one against the IIFE's actual `return {...}` statement above
// rather than assume the other two (`on`/`off`) meant the rest were fine.
if (typeof window !== 'undefined') {
  window.Spotlight = {
    on:      (targets, opts) => typeof CP !== 'undefined' && CP.spotlight(targets, opts),
    off:     ()              => typeof CP !== 'undefined' && CP.clearSpotlight(),
    step:    (steps, _opts)  => typeof CP !== 'undefined' && CP.showGuide(steps),
    tension: (map)           => typeof CP !== 'undefined' && CP.updateTensionField(map),
    execute: (ui, text)      => typeof CP !== 'undefined' && CP.exec(ui, text),
    navigate:(ch)            => typeof tuneById !== 'undefined' && tuneById(ch),
  };
}

// §BUG FIXED 2026-07-11 — CP.init() (wires click observation for confusion
// detection + starts CFR polling) was defined and returned from the CP
// IIFE, but nothing anywhere ever called it — not internally, and
// window.Spotlight's public surface never exposed an `init` wrapper either.
// The whole observation/CFR-polling half of this module has been dead code
// since it was written. Runs after DOM is ready so _wireObservation()'s
// getElementById lookups over OBS_TARGETS find real elements.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CP.init());
  } else {
    CP.init();
  }
}
