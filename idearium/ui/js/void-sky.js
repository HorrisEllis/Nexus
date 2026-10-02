/*
 * idearium/ui/js/void-sky.js — the star field behind every page of the pipeline (0.39.297 SW2).
 * Rebuilt from Nexus v0.54's void (read, not copied): cyan stars that breathe on a sine, drifting slowly upward,
 * painted over a translucent wash each frame so they leave faint trails. Reads --tc (0..1, the Void's tension) to
 * warm the larger stars toward magenta and quicken the drift. Draws into <canvas id="sky">. Still under
 * prefers-reduced-motion (one frame, no animation).
 */
(function sky() {
  const cv = document.getElementById('sky'), cx = cv.getContext('2d'); let W = 0, H = 0, stars = [], dpr = Math.min(2, window.devicePixelRatio || 1);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() {
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(320, W * H / 6500));
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5 + .2, p: Math.random() * 6.28, sp: Math.random() * .02 + .006, dz: Math.random() * .06 + .01 }));
    cx.fillStyle = '#030508'; cx.fillRect(0, 0, W, H);
  }
  function frame() {
    const t = getComputedStyle(document.documentElement).getPropertyValue('--tc') * 1 || 0;
    cx.fillStyle = 'rgba(3,5,8,.16)'; cx.fillRect(0, 0, W, H);
    for (const s of stars) {
      s.p += s.sp; s.y -= s.dz * (1 + t * 2); if (s.y < -2) { s.y = H + 2; s.x = Math.random() * W; }
      const a = .06 + (Math.sin(s.p) * .5 + .5) * .18;
      cx.fillStyle = t > .05 && s.r > 1.2 ? `rgba(${Math.round(0 + 204 * t)},${Math.round(212 - 144 * t)},255,${a})` : `rgba(0,212,255,${a})`;
      cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.2832); cx.fill();
    }
    if (!still) requestAnimationFrame(frame);
  }
  addEventListener('resize', size); size(); frame();
})();
