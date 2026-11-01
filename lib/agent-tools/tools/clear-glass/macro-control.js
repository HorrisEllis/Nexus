'use strict';
/**
 * lib/agent-tools/tools/clear-glass/macro-control.js — a macro run a person can steer: pause, skip, back one step (MB4, 0.60.359).
 * James, 2026-11-01: "also the macro toast for playback and recording, shows what step your on, out of how many. with a pause and skip, goes
 * back one step." Map: docs/2026-11-01-macro-blocks-phasemap.spec MB4.
 *
 *   createControl({ name, onChange }) → { pause, resume, skip, back, stop, turn(i, n, step), done(result), state() }
 *   turn(i, n, step) waits while paused, then answers what to do at step i: 'run', 'skip', 'back' or 'stop'. Every change calls onChange(state).
 */
function createControl({ name = null, onChange = () => {} } = {}) {
  const st = { kind: 'playback', name, i: 0, n: 0, label: null, paused: false, done: false, ok: null, error: null };
  let pending = null, wake = null;
  const say = () => { try { onChange({ ...st }); } catch (_) {} };
  const poke = () => { if (wake) { const w = wake; wake = null; w(); } };
  const api = {
    pause() { if (!st.done) { st.paused = true; say(); } return api.state(); },
    resume() { st.paused = false; say(); poke(); return api.state(); },
    skip() { pending = 'skip'; st.paused = false; say(); poke(); return api.state(); },
    back() { pending = 'back'; st.paused = false; say(); poke(); return api.state(); },
    stop() { pending = 'stop'; st.paused = false; say(); poke(); return api.state(); },
    async turn(i, n, step) {
      st.i = i; st.n = n; st.label = step ? `${step.action}${step.data && (step.data.selector || step.data.url) ? ` ${step.data.selector || step.data.url}` : ''}` : null; say();
      while (st.paused && !pending) await new Promise(r => { wake = r; });
      const p = pending || 'run'; pending = null; return p;
    },
    done(r = {}) { st.done = true; st.paused = false; st.ok = !r.error; st.error = r.error || null; say(); poke(); },
    state: () => ({ ...st }),
  };
  return api;
}

module.exports = { createControl };
