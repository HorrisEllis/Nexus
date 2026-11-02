'use strict';
/**
 * clear-glass/src/main/idle-tray.js — Clear Glass goes to the tray after a period with no input (CA1, 0.60.366). Spec: clear-glass/spec/tray.spec
 * MOD-CGT-IDLE-TRAY · Map: docs/2026-11-02-cos-the-application-phasemap.spec CA1_clear_glass_to_the_tray.
 *
 * James, 2026-11-02: "clearglass needs a setting for automatically minimizing to tray after a period of time."
 *
 * Off by default (his period: 5, 15, 30 or 60 minutes). The idle time is the OS's own (powerMonitor.getSystemIdleTime: no keyboard or mouse
 * anywhere). Never while a window plays sound or an automation run (a macro, a workflow) is active (CGT-001). Once per idle stretch: input
 * resets it, so a window he brings back is not hidden again until he goes idle again.
 *
 *   decide({ minutes, idleSec, audible, activeRuns, anyVisible }) → { hide, why }
 *   start({ everyMs, read, hide }) → { stop, tick }      read() → the state decide takes; hide() hides every window
 */
const MINUTES = Object.freeze([0, 5, 15, 30, 60]);

function decide({ minutes = 0, idleSec = null, audible = false, activeRuns = 0, anyVisible = true } = {}) {
  if (!MINUTES.includes(minutes) || !minutes) return { hide: false, why: 'off' };
  if (!anyVisible) return { hide: false, why: 'already in the tray' };
  if (idleSec == null || !Number.isFinite(idleSec)) return { hide: false, why: 'the idle time could not be read' };
  if (audible) return { hide: false, why: 'a window is playing sound' };
  if (activeRuns > 0) return { hide: false, why: `${activeRuns} automation run(s) active` };
  if (idleSec < minutes * 60) return { hide: false, why: `idle ${Math.round(idleSec)} s of ${minutes * 60} s` };
  return { hide: true, why: `no input for ${minutes} min` };
}

function start({ everyMs = 30000, read, hide, log = () => {} } = {}) {
  let done = false;   // hidden once in this idle stretch
  const tick = async () => {
    let st; try { st = await read(); } catch (e) { return { hide: false, why: e.message }; }
    if (st && Number.isFinite(st.idleSec) && st.idleSec < 30) done = false;   // input since: a new stretch
    const d = decide(st || {});
    if (d.hide && !done) { done = true; try { hide(); log(`[idle-tray] ${d.why} — to the tray`); } catch (_) {} }
    return d;
  };
  const t = setInterval(() => { tick(); }, everyMs); if (t.unref) t.unref();
  return { stop: () => clearInterval(t), tick };
}

module.exports = { decide, start, MINUTES, MODULE_ID: 'clear-glass.main.idle-tray', VERSION: '1.0.0' };
