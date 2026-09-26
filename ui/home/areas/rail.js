'use strict';
// ui/home/areas/rail.js — Channel rail: movable / editable / removable.
// Split from ui/home/index.html (inline script, lines 762-899 at v0.39.227). Load order is set by index.html; do not reorder.
// ── Rail: movable / editable / removable channels ──────────────────────────
// §BUILT 2026-09-20 — James: "make each channel movable, editable,
// removable, etc." CH_META above is real system data (id/name/accent per
// channel) and stays untouched — this is a separate, per-browser
// PREFERENCE layer on top of it (order, hidden set, label overrides),
// same "don't mutate the source, overlay a preference" split this file
// already uses elsewhere for things like REPO_RAIL_COLLAPSED-style state
// in the sibling idearium UI. Persisted to localStorage — per-viewer only,
// never shared, exactly what that mechanism is for.
const RAIL_DEFAULT_ORDER = ['ch-overview','ch-guardian','ch-cortex','ch-idearium','ch-bridge','ch-log','ch-diagnose','ch-blueprint','ch-causal','ch-conversations','ch-canvas','ch-emerge'];
const RAIL_STATE_KEY = 'nexus.home.rail.v1';
let RAIL_STATE = { order: RAIL_DEFAULT_ORDER.slice(), hidden: [], labels: {} };
(function loadRailState(){
  try {
    const raw = localStorage.getItem(RAIL_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Only trust ids that are still real channels — CH_META may have
    // dropped or renamed something since this was saved; a stale saved id
    // must not produce a rail button pointing at nothing.
    const validIds = new Set(CH_META.map(c => c.id));
    RAIL_STATE.order  = (parsed.order  || RAIL_DEFAULT_ORDER).filter(id => validIds.has(id));
    RAIL_STATE.hidden = (parsed.hidden || []).filter(id => validIds.has(id));
    RAIL_STATE.labels = parsed.labels || {};
    // Any real channel neither ordered nor hidden (new since this was
    // saved) still needs to end up SOMEWHERE — appended, not silently
    // dropped from the rail entirely.
    for (const c of CH_META) {
      if (!RAIL_STATE.order.includes(c.id) && !RAIL_STATE.hidden.includes(c.id)) RAIL_STATE.order.push(c.id);
    }
  } catch (e) { console.warn('[rail] state load failed, using defaults:', e.message); }
})();
function saveRailState(){
  try { localStorage.setItem(RAIL_STATE_KEY, JSON.stringify(RAIL_STATE)); }
  catch (e) { console.warn('[rail] state save failed (non-fatal, this session keeps working):', e.message); }
}

let _railDragId = null;
function renderRail(){
  const rail = document.getElementById('ch-rail');
  if (!rail) return;
  const byId = new Map(CH_META.map(c => [c.id, c]));
  rail.innerHTML = '';
  for (const chId of RAIL_STATE.order) {
    const meta = byId.get(chId);
    if (!meta) continue; // real channel removed from CH_META entirely — skip, don't render a dead button
    const btn = document.createElement('button');
    btn.className = 'ch-btn' + (chId === CH_META[curCh]?.id ? ' on' : '');
    btn.dataset.chId = chId;
    btn.draggable = true;
    btn.title = RAIL_STATE.labels[chId] || meta.name;
    const dotId = Object.values(railDots).includes(chId) ? `rd-${chId}` : '';
    btn.innerHTML = `<span class="ch-dot"${dotId ? ` id="${dotId}"` : ''}></span>`
      + `<span class="ch-btn-label">${RAIL_STATE.labels[chId] || meta.name}</span>`
      + `<span class="ch-btn-edit" title="rename" onclick="event.stopPropagation();editRailLabel('${chId}')">✎</span>`
      + `<span class="ch-btn-remove" title="remove from rail" onclick="event.stopPropagation();removeFromRail('${chId}')">✕</span>`;
    btn.addEventListener('click', (e) => { if (!e.target.closest('.ch-btn-edit,.ch-btn-remove')) tuneById(chId); });
    btn.addEventListener('dragstart', (e) => { _railDragId = chId; btn.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    btn.addEventListener('dragend',   () => { btn.classList.remove('dragging'); document.querySelectorAll('.ch-btn.drag-over').forEach(b => b.classList.remove('drag-over')); });
    btn.addEventListener('dragover',  (e) => { e.preventDefault(); if (chId !== _railDragId) btn.classList.add('drag-over'); });
    btn.addEventListener('dragleave', () => btn.classList.remove('drag-over'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('drag-over');
      if (!_railDragId || _railDragId === chId) return;
      const from = RAIL_STATE.order.indexOf(_railDragId);
      if (from === -1 || RAIL_STATE.order.indexOf(chId) === -1) return;
      RAIL_STATE.order.splice(from, 1);
      // Recomputed AFTER removal — removing an earlier item shifts every
      // later index down by one, so the target's own index before removal
      // is not necessarily where it belongs relative to the shortened
      // array. This is correct regardless of drag direction.
      const insertAt = RAIL_STATE.order.indexOf(chId);
      RAIL_STATE.order.splice(insertAt, 0, _railDragId);
      saveRailState();
      renderRail();
    });
    rail.appendChild(btn);
  }
  renderRailAddMenu();
}
function editRailLabel(chId){
  const meta = CH_META.find(c => c.id === chId);
  if (!meta) return;
  const current = RAIL_STATE.labels[chId] || meta.name;
  const next = prompt(`Rail label for this channel (real channel name stays "${meta.name}" everywhere else):`, current);
  if (next === null) return; // cancelled
  const trimmed = next.trim();
  if (!trimmed || trimmed === meta.name) delete RAIL_STATE.labels[chId];
  else RAIL_STATE.labels[chId] = trimmed;
  saveRailState();
  renderRail();
}
function removeFromRail(chId){
  // Hide, never delete — the channel's real content/CH_META entry is
  // untouched; this only takes its button out of the visible rail. The +
  // menu is the only way back, and it always lists every hidden channel,
  // so nothing is ever permanently unreachable from this UI alone.
  RAIL_STATE.order = RAIL_STATE.order.filter(id => id !== chId);
  if (!RAIL_STATE.hidden.includes(chId)) RAIL_STATE.hidden.push(chId);
  saveRailState();
  // If the removed channel was active, fall back to the first remaining
  // rail item rather than leaving the view on a channel with no rail
  // button highlighted anywhere.
  if (CH_META[curCh]?.id === chId && RAIL_STATE.order.length) tuneById(RAIL_STATE.order[0]);
  renderRail();
}
function restoreToRail(chId){
  RAIL_STATE.hidden = RAIL_STATE.hidden.filter(id => id !== chId);
  if (!RAIL_STATE.order.includes(chId)) RAIL_STATE.order.push(chId);
  saveRailState();
  renderRail();
}
function toggleRailAddMenu(){
  const menu = document.getElementById('rail-add-menu');
  if (!menu) return;
  menu.classList.toggle('open');
}
function renderRailAddMenu(){
  const menu = document.getElementById('rail-add-menu');
  if (!menu) return;
  const byId = new Map(CH_META.map(c => [c.id, c]));
  if (!RAIL_STATE.hidden.length) {
    menu.innerHTML = `<div class="rail-add-empty">every channel is on the rail</div>`;
    return;
  }
  menu.innerHTML = RAIL_STATE.hidden.map(id => {
    const meta = byId.get(id);
    if (!meta) return '';
    return `<button class="rail-add-item" onclick="restoreToRail('${id}');toggleRailAddMenu()">${meta.name}</button>`;
  }).join('');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('rail-add-menu');
  if (menu?.classList.contains('open') && !e.target.closest('#rail-add-menu') && !e.target.closest('#rail-add-btn')) menu.classList.remove('open');
});
document.addEventListener('DOMContentLoaded', renderRail);

