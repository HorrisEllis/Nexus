/**
 * clear-glass/renderer/macro-toast.js — the macro recording/playing toast (MT1, 0.60.335).
 * Map: docs/2026-10-31-macro-toast-and-gig-metadata-phasemap.spec (MT1).
 * James, 2026-10-31: "i want a step recorder and player when macros are playing. a toast with playback controls. and i want the
 * same for when recording macros and wi want the classic red dot breathing when recording." · "step by step macro recorder, with a hotkey"
 *
 * One persistent toast, two states, drawn in Clear Glass's own window (over the page):
 *   window.CGMacroToast.recording(on, { onStop })        — the breathing red dot + "Recording macro" + a live step count + Stop
 *   window.CGMacroToast.recStep(n)                        — update the captured-step count while recording
 *   window.CGMacroToast.playing({ name, index, total, paused }, { onPause, onResume, onStep, onStop }) — the player bar
 *   window.CGMacroToast.step(index, total, label)         — update play progress (MT2 drives this from the runner's per-step events)
 *   window.CGMacroToast.hide()
 */
(function () {
  'use strict';
  if (window.CGMacroToast) return;
  var root = document.createElement('div');
  root.id = 'cg-macro-toast'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
  function mount() { try { if (!root.isConnected && document.body) document.body.appendChild(root); } catch (_) {} }
  var cbs = {};
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function wire() { root.querySelectorAll('[data-mt]').forEach(function (b) { b.addEventListener('click', function () { var fn = cbs[b.getAttribute('data-mt')]; if (typeof fn === 'function') fn(); }); }); }

  var API = {
    recording: function (on, opts) {
      opts = opts || {}; mount();
      if (!on) return API.hide();
      cbs = { stop: opts.onStop };
      root.className = 'show recording';
      root.innerHTML = '<span class="mt-dot" aria-hidden="true"></span>'
        + '<span class="mt-label">Recording macro</span>'
        + '<span class="mt-sub" id="mt-sub">press the shortcut to stop</span>'
        + '<button class="mt-stop" data-mt="stop" title="Stop recording">Stop</button>';
      wire(); return API;
    },
    recStep: function (n) { var s = root.querySelector('#mt-sub'); if (s) s.textContent = n + ' step' + (n === 1 ? '' : 's') + ' captured'; return API; },
    playing: function (st, ctrls) {
      st = st || {}; ctrls = ctrls || {}; mount();
      cbs = { pause: ctrls.onPause, resume: ctrls.onResume, step: ctrls.onStep, stop: ctrls.onStop };
      var idx = st.index || 0, total = st.total || 0, pct = total ? Math.round(100 * idx / total) : 0;
      root.className = 'show playing';
      root.innerHTML = '<span class="mt-label">▶ ' + esc(st.name || 'Macro') + '</span>'
        + '<span class="mt-sub" id="mt-prog">step ' + idx + ' / ' + total + '</span>'
        + '<span class="mt-bar"><i style="width:' + pct + '%"></i></span>'
        + (st.paused ? '<button data-mt="resume" title="Resume">Resume</button>' : '<button data-mt="pause" title="Pause">Pause</button>')
        + '<button data-mt="step" title="Run one step">Step</button>'
        + '<button class="mt-stop" data-mt="stop" title="Stop">Stop</button>';
      wire(); return API;
    },
    step: function (index, total, label) {
      var p = root.querySelector('#mt-prog'); if (p) p.textContent = 'step ' + index + ' / ' + total + (label ? ' — ' + label : '');
      var bar = root.querySelector('.mt-bar > i'); if (bar && total) bar.style.width = Math.round(100 * index / total) + '%';
      return API;
    },
    hide: function () { root.className = ''; root.innerHTML = ''; cbs = {}; return API; },
  };
  window.CGMacroToast = API;
})();
