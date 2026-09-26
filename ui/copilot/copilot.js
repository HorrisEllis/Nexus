/**
 * ui/copilot/copilot.js — the co-pilot input/response runtime
 *
 * Extracted from ui/home/index.html's inline asSend() + prompt-history
 * state, per DECOMP.md's plan. Behavior is preserved exactly — this is a
 * relocation, not a rewrite. The one real change: instead of reaching
 * directly for shell globals (B, CH_META, curCh, tune, post), the shell
 * injects them once via CoPilot.init(deps) — otherwise this module would
 * just recreate the same coupling DECOMP.md exists to remove, one file
 * later. get()/post()/del() themselves come from the already-extracted
 * ui/lib/api.js, loaded before this file.
 *
 * DOM elements this module still reads/writes directly (#assistant-in,
 * #assistant-out) are the co-pilot input bar itself — genuinely this
 * module's own concern, not shell chrome, so that part is NOT injected.
 *
 * §FIXED 2026-09-13 — James: (1) "the inject dom observer/mutation
 * listener should stream live the response. jobid, jobstatus." (2) "the
 * floating menu cli, and copilot dont get a response." Two real, separate
 * things, both traced to real code, not fixed by guessing:
 *
 *   (2) was ui/lib/api.js's post() aborting after a hardcoded 8 real
 *   seconds against a backend that routinely takes far longer —
 *   guardian/ask.js's own askSync defaults to 90000ms, and a real,
 *   successful NCP round trip observed this same session took ~17s.
 *   send() below now passes a real, matching timeout explicitly (see
 *   ui/lib/api.js's own header for the full trace).
 *
 *   (1) is real, live progress the widget never showed. Every piece
 *   already existed and was already flowing, just never reaching here:
 *   guardian's own DOM mutation observer (guardian/userscript-<agent>.js)
 *   already emits real, live job.chunk/job.complete events the instant a
 *   response streams in; guardian/server.js's cockpitBroadcast() already
 *   pushes them over the SSE connection the shell keeps open
 *   (`gdEs`, /api/guardian/events) — but gdEs.onmessage only ever used
 *   them to trigger a jobs-list refresh, never fed them here. onGuardianEvent()
 *   below is that missing wire: called from the shell's existing gdEs
 *   listener, it live-updates jobId/status/text while send()'s own
 *   post() is still in flight. Correlation is deliberately best-effort
 *   (a job's exact id isn't known to this widget until guardian assigns
 *   one) — the same honest "most likely, not guaranteed" discipline
 *   guardian/lib/jobs.js's own _findActiveJobForProvider already uses for
 *   the identical real problem. The FINAL rendered answer always comes
 *   from post()'s own resolution (RAID classification, hats, everything
 *   the richer /api/prompt pipeline does) — the live preview is exactly
 *   that, a preview, replaced the moment the real response lands.
 */
window.CoPilot = (() => {
  let _deps = null; // { B, CH_META, getCurCh, tune, post }
  const _hist = [];
  let _histIdx = -1;

  // §FIXED 2026-09-13 — a real dispatch chain (copilot -> guardian -> NCP
  // round trip) routinely runs well past the platform's old 8s default;
  // this matches guardian/ask.js's own real askSync default so the
  // client stops giving up before the server does.
  const DISPATCH_TIMEOUT_MS = 90000;

  // Live-progress state for the one in-flight request, if any. Not a
  // queue — this widget sends one prompt at a time (the input is cleared
  // and disabled-by-convention while a send is out), so one slot is
  // honest, not a limitation being papered over.
  let _pending = null; // { startedAt, jobId, out, statusEl, textEl }

  function init(deps) {
    _deps = deps;
  }

  /**
   * onGuardianEvent(evt) — called by the shell's existing gdEs.onmessage
   * (ui/tv-shell/index.html) for every real message on guardian's already-
   * open SSE connection. Only acts while a send() is genuinely waiting;
   * a no-op otherwise; never throws (a live-progress miss must never
   * break the real response the caller is still waiting for).
   */
  function onGuardianEvent(evt) {
    if (!_pending || !evt || !evt.type) return;
    try {
      const isJobEvent = evt.type.startsWith('job.');
      if (!isJobEvent) return;

      // Adopt the first plausible jobId seen after this request started —
      // best-effort correlation, named as such (see header).
      if (!_pending.jobId && evt.jobId && (evt.ts || Date.now()) >= _pending.startedAt) {
        _pending.jobId = evt.jobId;
      }
      if (!_pending.jobId || evt.jobId !== _pending.jobId) return;

      if (evt.type === 'job.chunk' && typeof evt.full === 'string') {
        _pending.statusEl.textContent = `job ${_pending.jobId.slice(0, 8)} · streaming · ${evt.full.length}ch`;
        _pending.textEl.textContent = evt.full;
      } else if (evt.type === 'job.dispatched' || evt.type === 'job.confirmed') {
        _pending.statusEl.textContent = `job ${_pending.jobId.slice(0, 8)} · dispatched`;
      } else if (evt.type === 'job.complete') {
        _pending.statusEl.textContent = `job ${_pending.jobId.slice(0, 8)} · complete — finalizing…`;
      } else if (evt.type === 'job.error') {
        _pending.statusEl.textContent = `job ${_pending.jobId.slice(0, 8)} · error — waiting for the real result…`;
      }
    } catch (_) { /* live preview only — never let this break the real response */ }
  }

  /**
   * navigateHistory('up'|'down') — returns the prompt text to place in
   * the input box. The shell's keydown listener stays in shell.js (it's
   * wired to a DOM element the shell owns), but no longer touches the
   * history array/index directly — those are this module's state now.
   */
  function navigateHistory(direction) {
    if (direction === 'up') {
      _histIdx = Math.min(_histIdx + 1, _hist.length - 1);
      return _hist[_histIdx] || '';
    }
    _histIdx = Math.max(_histIdx - 1, -1);
    return _histIdx >= 0 ? _hist[_histIdx] : '';
  }

  async function send() {
    if (!_deps) throw new Error('[CoPilot] init(deps) must be called before send()');
    const { B, CH_META, getCurCh, tune, post } = _deps;

    const inp = document.getElementById('assistant-in');
    const q   = inp.value.trim(); if (!q) return;
    _hist.unshift(q); _histIdx = -1; inp.value = '';

    const out = document.getElementById('assistant-out');
    out.style.display = 'block';
    out.style.color = 'rgba(200,220,210,.8)';
    out.textContent = '';

    // clear is the only client-side command — everything else goes to co-pilot
    if (q.toLowerCase() === 'clear') { out.style.display = 'none'; return; }

    // Live-progress placeholder — replaces the old bare "…" indicator.
    // statusEl carries jobId/status once guardian assigns one; textEl
    // fills in with the real, live streamed text as it arrives.
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'opacity:.5;font-style:italic;font-size:11px;font-family:monospace';
    statusEl.textContent = '… dispatching';
    const textEl = document.createElement('div');
    textEl.style.cssText = 'opacity:.7;margin-top:4px;white-space:pre-wrap';
    out.appendChild(statusEl);
    out.appendChild(textEl);

    _pending = { startedAt: Date.now(), jobId: null, out, statusEl, textEl };

    // Pass current channel context + live UI state to co-pilot
    let uiSnapshot = null;
    try { uiSnapshot = JSON.parse(window.NEXUS_UI_STATE.snapshot()); } catch (_) {}
    const curCh = getCurCh();
    const cp = await post(`${B.orch}/api/guardian/copilot/prompt`, {
      prompt: q,
      channel: CH_META[curCh]?.id || 'ch-overview',
      channelName: CH_META[curCh]?.name || 'Overview',
      uiState: uiSnapshot,
      contextOpts: { intent: q },
    }, DISPATCH_TIMEOUT_MS);

    _pending = null;
    out.textContent = '';

    if (cp === null) {
      out.style.color = 'rgba(255,100,100,.8)';
      out.textContent = 'Orchestrator unreachable (:9000), or co-pilot (:3750) failed. Is NEXUS running?';
      return;
    }

    if (!cp.ok) {
      out.style.color = 'rgba(255,100,100,.8)';
      out.textContent = cp.denied
        ? `RAID denied: ${cp.reason}`
        : `Error: ${cp.error || 'request failed'}`;
      return;
    }

    // Execute any UI instructions from co-pilot (spotlight, steps, navigation)
    if (cp.ui) window.CP.exec(cp.ui, cp.text);

    // Navigation shortcut — co-pilot says "go to channel X"
    if (cp.action === 'navigate' && cp.ui?.command === 'tuneById') {
      const navId = cp.ui.arg;
      const navIdx = CH_META.findIndex(c => c.id === navId);
      if (navIdx !== -1) {
        out.style.color = 'rgba(150,220,180,.9)';
        out.textContent = cp.text || 'Navigating…';
        setTimeout(() => tune(navIdx), 350);
        return;
      }
    }

    // Main response
    out.style.color = 'rgba(200,220,210,.92)';
    out.textContent = cp.text || 'No response.';

    // If co-pilot spotlighted something, briefly scroll it into view
    if (cp.ui?.spotlight) {
      const name = Array.isArray(cp.ui.spotlight) ? cp.ui.spotlight[0] : cp.ui.spotlight;
      const el = document.getElementById(name) || document.getElementById(
        { guardian: 'tile-gd', cortex: 'tile-cx', idearium: 'tile-idr',
          orchestrator: 'tile-orch', bridge: 'tile-br', diagnostic: 'tile-dg' }[name]);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // RAID decision — always explicit, never hidden
    if (cp.classification) {
      const c = cp.classification;
      const raidEl = document.createElement('div');
      raidEl.style.cssText = 'font-size:10px;opacity:.45;margin-top:6px;font-family:monospace;border-top:1px solid rgba(255,255,255,.07);padding-top:4px';
      const parts = [`RAID → ${c.intent}`];
      if (c.tool) parts.push(`tool:${c.tool}`);
      if (c.confidence) parts.push(`confidence:${(c.confidence * 100).toFixed(0)}%`);
      if (cp.modelUsed) parts.push(`model:${cp.modelUsed}`);
      if (cp.systemState) parts.push(`gaps:${cp.systemState.gapCount} jobs:${cp.systemState.jobCount}`);
      raidEl.textContent = parts.join(' · ');
      out.appendChild(raidEl);
    } else if (cp.modelUsed) {
      const m = document.createElement('div');
      m.style.cssText = 'font-size:10px;opacity:.35;margin-top:4px;font-family:monospace';
      m.textContent = `via ${cp.modelUsed}`;
      out.appendChild(m);
    }
  }

  return { init, send, navigateHistory, onGuardianEvent };
})();

