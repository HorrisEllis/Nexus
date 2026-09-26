'use strict';
// ui/home/areas/forge-tile.js — Forge shell + blueprint tiles.
// Split from ui/home/index.html (inline script, lines 2597-2629 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Forge Shell tile ─────────────────────────────────────────────────────────
function openForgeShell() {
  _logToData('ui.navigation', { target: 'forge-shell' });
  window.open('/ui/forge-shell.html','_blank');
}

function openBlueprintBuilder() {
  _logToData('ui.navigation', { target: 'blueprint-builder' });
  tuneById('ch-blueprint'); // opens in the TV shell iframe
}

// Update forge tile metrics on each health poll
async function updateForgeTile() {
  try {
    const gaps = await get(`http://127.0.0.1:3748/api/gaps?status=open`);
    const gapCount = Array.isArray(gaps) ? gaps.length : (gaps?.gaps?.length ?? '—');
    const el = document.getElementById('tm-forge-gaps');
    if (el) el.textContent = gapCount;
  } catch(_) {}
  // Agent tile — reflect current mode
  const agentName = document.getElementById('tile-agent-name');
  const agentDesc = document.getElementById('tile-agent-desc');
  const agentStatus = document.getElementById('ts-agent');
  if (_activeMode && MODE_CONFIG[_activeMode]) {
    const cfg = MODE_CONFIG[_activeMode];
    if (agentName) { agentName.textContent = cfg.name; agentName.style.color = cfg.color; }
    if (agentDesc) agentDesc.textContent = cfg.sub.split('·').slice(0,2).join('·').trim();
    if (agentStatus) { agentStatus.textContent = cfg.badge; agentStatus.style.color = cfg.color; }
  } else {
    if (agentStatus) agentStatus.textContent = 'NONE';
  }
}

