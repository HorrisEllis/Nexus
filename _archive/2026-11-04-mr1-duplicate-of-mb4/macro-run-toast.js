'use strict';
/**
 * renderer/macro-run-toast.js — a running macro says its step and can be paused; a recording says it is recording (MR1, 2026-11-04).
 * (styles: macro-run-toast.css)  Spec: clear-glass/spec/gated-flows.spec MOD-MR1 · Map: docs/2026-10-28-gated-flows-phasemap.spec MR1
 *
 * James, 2026-11-04: "also gating needs to hault. macros need a toast when executing. with a steps counter, pause and play. skip and previous.
 * also when macros are recording a recording indicator in the taost when recording macros."
 *
 * window.CGMacroToast.mount(api) → { el }   api = ClearGlass.macros: onRunState, runControl, onRecState, recordStatus, recordStop
 *   a run      macros:runState { runId, name, i, total, label, state: running|pausing|paused|done|failed|stopped, error, skipped }
 *              the card: the macro, "Step n of m" and what it does, a bar, ⏮ previous · ⏸/▶ · ⏭ skip · ■ stop. Done fades; failed and
 *              stopped stay, with the reason, until closed.
 *   recording  macros:recState { recording, agentId, name } — a red dot, the macro, the steps recorded so far (recordStatus, each second), Stop.
 * Mounted by itself in any window that has ClearGlass.macros.onRunState.
 */
(function () {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const STATE = { running: 'Running', pausing: 'Pausing…', paused: 'Paused', done: 'Done', failed: 'Stopped: failed', stopped: 'Stopped by you' };

  function mount(api) {
    const root = el('div', 'mrt'); root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    const runs = new Map();   // runId → { card, fade }

    function btn(label, title, on) { const b = el('button', 'mrt-btn', label); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', (e) => { e.stopPropagation(); on(); }); return b; }

    function drawRun(d) {
      let r = runs.get(d.runId);
      if (!r) {
        const card = el('div', 'mrt-card'); card.dataset.run = d.runId;
        const head = el('div', 'mrt-head');
        const icon = el('span', 'mrt-icon', '▶'); const name = el('span', 'mrt-name'); const chip = el('span', 'mrt-chip');
        const close = btn('×', 'Close', () => { card.remove(); runs.delete(d.runId); }); close.classList.add('mrt-close');
        head.append(icon, name, chip, close);
        const step = el('div', 'mrt-step'); const what = el('div', 'mrt-what');
        const bar = el('div', 'mrt-bar'); const fill = el('div', 'mrt-fill'); bar.append(fill);
        const ctl = el('div', 'mrt-ctl');
        const prev = btn('⏮', 'Previous: run the step before this one again', () => api.runControl(d.runId, 'previous'));
        const play = btn('⏸', 'Pause', () => api.runControl(d.runId, play.dataset.paused === '1' ? 'play' : 'pause'));
        const skip = btn('⏭', 'Skip the next step', () => api.runControl(d.runId, 'skip'));
        const stop = btn('■', 'Stop the macro', () => api.runControl(d.runId, 'stop'));
        ctl.append(prev, play, skip, stop);
        const err = el('div', 'mrt-err');
        card.append(head, step, what, bar, ctl, err);
        root.append(card);
        r = { card, icon, name, chip, step, what, fill, ctl, play, err, fade: null };
        runs.set(d.runId, r);
      }
      const live = d.state === 'running' || d.state === 'pausing' || d.state === 'paused';
      r.card.dataset.state = d.state;
      r.name.textContent = d.name || 'Macro';
      r.chip.textContent = STATE[d.state] || d.state;
      const shown = Math.min(d.total || 0, (d.i || 0) + (live ? 1 : 0));
      r.step.textContent = d.total ? `Step ${shown} of ${d.total}${d.skipped ? ` · ${d.skipped} skipped` : ''}` : 'Starting…';
      r.what.textContent = live ? (d.label || '') : '';
      r.fill.style.width = d.total ? `${Math.round(100 * (d.state === 'done' ? 1 : (d.i || 0) / d.total))}%` : '0%';
      const paused = d.state === 'paused' || d.state === 'pausing';
      r.play.dataset.paused = paused ? '1' : '0'; r.play.textContent = paused ? '▶' : '⏸'; r.play.title = paused ? 'Play' : 'Pause'; r.play.setAttribute('aria-label', r.play.title);
      r.icon.textContent = paused ? '⏸' : d.state === 'done' ? '✓' : live ? '▶' : '!';
      r.ctl.hidden = !live;
      r.err.textContent = d.error && !live ? d.error : ''; r.err.hidden = !r.err.textContent;
      clearTimeout(r.fade);
      if (d.state === 'done') r.fade = setTimeout(() => { r.card.classList.add('out'); setTimeout(() => { r.card.remove(); runs.delete(d.runId); }, 300); }, 4000);
    }

    let rec = null;
    function drawRec(d) {
      if (!d.recording) { if (rec) { clearInterval(rec.timer); rec.card.remove(); rec = null; } return; }
      if (!rec) {
        const card = el('div', 'mrt-card mrt-rec'); card.dataset.state = 'recording';
        const head = el('div', 'mrt-head');
        const dot = el('span', 'mrt-dot'); dot.setAttribute('aria-hidden', 'true');
        const name = el('span', 'mrt-name'); const chip = el('span', 'mrt-chip', 'Recording');
        head.append(dot, name, chip);
        const step = el('div', 'mrt-step', '0 steps recorded');
        const ctl = el('div', 'mrt-ctl');
        const stop = btn('■ Stop', 'Stop recording', () => api.recordStop(rec && rec.agentId)); stop.classList.add('mrt-wide');
        ctl.append(stop); card.append(head, step, ctl); root.prepend(card);
        rec = { card, name, step, agentId: d.agentId, timer: null };
        rec.timer = setInterval(async () => {
          try { const s = await api.recordStatus(rec.agentId); if (!s || !s.recording) return drawRec({ recording: false });
            rec.step.textContent = `${s.steps || 0} step${s.steps === 1 ? '' : 's'} recorded`; } catch (_) {}
        }, 1000);
      }
      rec.agentId = d.agentId; rec.name.textContent = d.name ? `“${d.name}”` : 'a new macro';
    }

    api.onRunState((d) => { try { drawRun(d || {}); } catch (_) {} });
    if (api.onRecState) api.onRecState((d) => { try { drawRec(d || {}); } catch (_) {} });
    return { el: root, drawRun, drawRec };
  }

  window.CGMacroToast = { mount };
  try { const m = window.ClearGlass && window.ClearGlass.macros; if (m && typeof m.onRunState === 'function') mount(m); } catch (_) {}
})();
