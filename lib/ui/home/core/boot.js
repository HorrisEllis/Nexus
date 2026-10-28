'use strict';
// ui/home/core/boot.js — Boot: first polls, intervals, SSE connect.
// Split from ui/home/index.html (inline script, lines 2630-2640 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Boot ──────────────────────────────────────────────────────────────────────
buildDiag();
pollHealth();
setInterval(pollHealth,15000);
setInterval(gdLoadJobs,8000); // poll jobs every 8s for live updates
setInterval(gdLoadProvs,12000); // poll providers
setInterval(updateForgeTile,10000); // update forge+agent tiles
setInterval(_replayPendingLogs,30000); // replay buffered logs when cortex recovers
updateForgeTile(); // immediate first pass
_logToData('ui.boot', { version:'1.1.0', ts: Date.now() });
connectSSE();
