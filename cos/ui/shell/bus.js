/**
 * cos/ui/shell/bus.js — the event bus, drawn: the live layer everything in COS floats above. MG18, 0.60.336 (MG_D16).
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus."
 * One quiet lane per supervised system; every event the manager announces travels its system's lane as a pulse, coloured by what happened
 * (a spawn or a recovery in the accent, a crash or an open circuit red, a refusal amber, an act by a person or an agent violet). Nothing is
 * drawn that did not happen: no idle animation pretends to be traffic. Paused while the window is hidden; still under reduced motion.
 *   BUS.lanes(names) · BUS.pulse(system, kind) · BUS.flash(system, state)
 */
(function () {
  'use strict';
  const cv = document.getElementById('bus'); const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, lanes = [], pulses = [], flashes = new Map(), raf = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const colorOf = (kind) => /crash|circuit-open|down/.test(kind) ? css('--nx-err') : /refused|health|waiting/.test(kind) ? css('--nx-warn')
    : /proposal|policy|handover|circuit-close|by-person/.test(kind) ? css('--nx-violet') : /stop|idle|exit/.test(kind) ? css('--nx-dim') : css('--ac');

  function size() { dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  const laneY = (i) => { const top = H * 0.16, bot = H * 0.94; return lanes.length < 2 ? (top + bot) / 2 : top + (bot - top) * (i / (lanes.length - 1)); };

  function draw(t = performance.now()) {
    g.clearRect(0, 0, W, H);
    const rim = css('--nx-rim') || '#2a2a4a', faint = css('--nx-muted') || '#4a4a7a';
    // the grid the bus runs on
    g.globalAlpha = 0.05; g.fillStyle = faint;
    for (let x = 24; x < W; x += 48) for (let y = 24; y < H; y += 48) g.fillRect(x, y, 1, 1);
    // lanes
    lanes.forEach((name, i) => {
      const y = laneY(i), fl = flashes.get(name); const fa = fl ? Math.max(0, 1 - (t - fl.t) / 1600) : 0;
      const grad = g.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'transparent'); grad.addColorStop(0.18, rim); grad.addColorStop(0.92, rim); grad.addColorStop(1, 'transparent');
      g.globalAlpha = 0.38 + fa * 0.5; g.strokeStyle = fa ? fl.c : grad; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      g.globalAlpha = 0.42 + fa * 0.5; g.fillStyle = fa ? fl.c : faint; g.font = '500 10px "DM Mono", monospace'; g.textAlign = 'right';
      g.fillText(name.toUpperCase(), W - 22, y - 6);
    });
    // pulses
    const now = t; pulses = pulses.filter(p => now - p.t0 < p.life);
    for (const p of pulses) {
      const k = (now - p.t0) / p.life, e = 1 - Math.pow(1 - k, 3), x = -60 + (W + 120) * e, y = laneY(p.lane);
      const tail = 180 + 140 * (1 - k);
      const tg = g.createLinearGradient(x - tail, y, x, y); tg.addColorStop(0, 'transparent'); tg.addColorStop(1, p.c);
      g.globalAlpha = 0.95 * (1 - k * 0.5); g.strokeStyle = tg; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - tail, y + 0.5); g.lineTo(x, y + 0.5); g.stroke();
      g.globalAlpha = 1 - k * 0.4; g.fillStyle = p.c; g.shadowColor = p.c; g.shadowBlur = 22; g.beginPath(); g.arc(x, y + 0.5, 3.2, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      if (k < 0.25) { g.globalAlpha = 0.35 * (1 - k / 0.25); g.strokeStyle = p.c; g.lineWidth = 1; g.beginPath(); g.arc(22, y + 0.5, 4 + k * 60, 0, Math.PI * 2); g.stroke(); }
    }
    g.globalAlpha = 1;
    if ((pulses.length || [...flashes.values()].some(f => t - f.t < 1600)) && !document.hidden && !reduced()) raf = requestAnimationFrame(draw); else raf = 0;
  }
  const kick = () => { if (!raf && !reduced()) raf = requestAnimationFrame(draw); else if (reduced()) draw(); };

  window.BUS = {
    lanes(names) { lanes = [...names]; draw(); },
    pulse(system, kind = '') {
      let i = lanes.indexOf(system); if (i < 0) i = Math.floor(lanes.length / 2);
      if (!lanes.length) return; pulses.push({ lane: i, t0: performance.now(), life: 2600 + Math.random() * 600, c: colorOf(kind) }); if (pulses.length > 60) pulses.shift(); kick();
    },
    flash(system, state) { flashes.set(system, { t: performance.now(), c: colorOf(state === 'up' ? 'spawn' : state === 'down' || state === 'circuit-open' ? 'crash' : state) }); kick(); },
  };
  addEventListener('resize', size); document.addEventListener('visibilitychange', kick); size();
})();
