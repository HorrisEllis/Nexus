'use strict';
// ui/home/areas/assistant.js — Assistant bar: prompt history keys.
// Split from ui/home/index.html (inline script, lines 1636-1642 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Assistant with grammar engine ─────────────────────────────────────────────
// asHist/asIdx moved into ui/copilot/copilot.js — CoPilot.navigateHistory()
document.getElementById('assistant-in').addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'){e.target.value=CoPilot.navigateHistory('up');e.preventDefault()}
  if(e.key==='ArrowDown'){e.target.value=CoPilot.navigateHistory('down');e.preventDefault()}
});

