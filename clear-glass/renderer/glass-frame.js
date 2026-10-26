'use strict';
// clear-glass/renderer/glass-frame.js — the frame's buttons and its state (title, host, back, devtools), through preload/glass-frame.js
(() => {
  const F = window.glassFrame; if (!F) return;
  for (const id of ['back', 'reload', 'devtools', 'minimize', 'maximize', 'close']) document.getElementById(id).addEventListener('click', () => F.control(id));
  document.getElementById('bar').addEventListener('dblclick', (e) => { if (e.target.tagName !== 'BUTTON') F.control('maximize'); });
  F.onState((s) => {
    document.getElementById('t').textContent = s.title || 'Clear Glass';
    document.getElementById('h').textContent = s.host ? `· ${s.host}` : '';
    document.title = s.title || 'Clear Glass';
    document.getElementById('back').disabled = !s.canGoBack;
    document.getElementById('devtools').classList.toggle('on', !!s.devtools);
    document.getElementById('maximize').innerHTML = s.maximized ? '&#x2750;' : '&#x25a1;';
  });
  F.control('state');
})();
