/* ═══════════════════════════════════════════════════════════
   WIRE SYSTEM  v1.0.0
   runtime/wire-system.js

   Right-click any mod window → shows its hooks.
   Drag from an output hook → compatible input hooks glow.
   Release on an input hook → wire drawn, bus subscription made.
   Click a wire → remove it.

   Wires are visual SVG paths + live bus subscriptions.
   ═══════════════════════════════════════════════════════════ */
window.WireSystem = (() => {
'use strict';

/* SVG overlay for wire drawing */
let _svg       = null;
let _canvasEl  = null;
let _dragging  = null; /* { fromInstanceId, fromHookId, fromEl, tempPath } */
const _wires   = new Map(); /* wireId → { path, sub, fromId, toId } */
const _hookEls = new Map(); /* instanceId → { el, hooks[] } */

const HOOK_R    = 6;   /* hook circle radius px */
const WIRE_COL  = 'rgba(0,212,255,0.55)';
const WIRE_HOV  = '#00d4ff';
const COMPAT_COL= 'rgba(0,255,136,0.4)';

function init(canvasEl) {
  _canvasEl = canvasEl;

  _svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  _svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:800;overflow:visible;';
  canvasEl.appendChild(_svg);

  /* Global mousemove/up for drag-to-connect */
  document.addEventListener('mousemove', _onDragMove);
  document.addEventListener('mouseup',   _onDragEnd);
}

/* ── Hook context menu on right-click of any wm-win ── */
function _attachContextMenu(win, instanceId) {
  win.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    _showHookMenu(instanceId, e.clientX, e.clientY);
  });
}

function _showHookMenu(instanceId, cx, cy) {
  /* Remove any existing hook menu */
  document.querySelectorAll('.wire-hook-menu').forEach(m => m.remove());

  const org = KERNEL.registry.get(instanceId);
  if (!org || !org.hooks?.length) return;

  const menu = document.createElement('div');
  menu.className = 'wire-hook-menu';
  menu.style.cssText = `
    position:fixed;left:${cx}px;top:${cy}px;
    background:var(--bg1);border:1px solid var(--b2);border-top:2px solid var(--accent2);
    border-radius:0 0 5px 5px;z-index:9200;min-width:200px;
    box-shadow:0 8px 32px rgba(0,0,0,.6);overflow:hidden;font-family:var(--mono);
  `;

  const title = document.createElement('div');
  title.style.cssText = 'padding:6px 12px;font-size:7px;letter-spacing:.16em;color:var(--accent2);background:var(--bg2);border-bottom:1px solid var(--b1);';
  title.textContent = `HOOKS — ${org.label}`;
  menu.appendChild(title);

  org.hooks.forEach(hook => {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--b1);transition:background .1s;`;
    const dirCol = hook.direction === 'out' ? '#00ff88' : '#00d4ff';
    row.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${dirCol};flex-shrink:0;box-shadow:0 0 4px ${dirCol};"></span>
      <span style="font-size:7.5px;color:var(--dim2);flex:1;">${hook.hook_id.split('.').pop()}</span>
      <span style="font-size:6.5px;color:${dirCol};letter-spacing:.1em;">${hook.direction.toUpperCase()}</span>
      <span style="font-size:6px;color:var(--dim);letter-spacing:.06em;">${hook.event_type}</span>
    `;
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(0,212,255,.08)');
    row.addEventListener('mouseleave', () => row.style.background = '');

    if (hook.direction === 'out') {
      row.title = 'Drag to connect to an input';
      row.style.cursor = 'crosshair';
      row.addEventListener('mousedown', e => {
        e.preventDefault();
        menu.remove();
        _startDrag(instanceId, hook, e.clientX, e.clientY);
      });
    } else {
      row.title = `Listening on: ${hook.event_type}`;
    }
    menu.appendChild(row);
  });

  /* Close */
  const close = document.createElement('div');
  close.style.cssText = 'padding:6px 12px;font-size:7px;color:var(--accent3);cursor:pointer;text-align:center;';
  close.textContent = '× CLOSE';
  close.addEventListener('click', () => menu.remove());
  menu.appendChild(close);

  document.body.appendChild(menu);
  /* Close on outside click */
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once:true });
  }, 10);
}

/* ── Drag to connect ── */
function _startDrag(fromInstanceId, fromHook, x, y) {
  const r   = _canvasEl.getBoundingClientRect();
  const sx  = x - r.left;
  const sy  = y - r.top;

  /* Temp path */
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('fill','none');
  path.setAttribute('stroke', WIRE_HOV);
  path.setAttribute('stroke-width','2');
  path.setAttribute('stroke-dasharray','6,3');
  path.setAttribute('opacity','0.8');
  _svg.appendChild(path);

  _dragging = { fromInstanceId, fromHook, startX:sx, startY:sy, path };

  /* Highlight compatible input hooks */
  _highlightCompatible(fromHook.event_type);
}

function _onDragMove(e) {
  if (!_dragging) return;
  const r   = _canvasEl.getBoundingClientRect();
  const ex  = e.clientX - r.left;
  const ey  = e.clientY - r.top;
  const { startX, startY, path } = _dragging;
  const d   = `M${startX},${startY} C${startX+60},${startY} ${ex-60},${ey} ${ex},${ey}`;
  path.setAttribute('d', d);
}

function _onDragEnd(e) {
  if (!_dragging) return;
  _clearHighlights();

  /* Check if we're over a compatible input */
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const hookEl = target?.closest('[data-hook-input]');
  if (hookEl) {
    const toInstanceId = hookEl.dataset.instanceId;
    const toHookId     = hookEl.dataset.hookId;
    const toEventType  = hookEl.dataset.eventType;
    const { fromInstanceId, fromHook } = _dragging;

    /* Draw permanent wire */
    _drawWire(fromInstanceId, fromHook.hook_id, fromHook.event_type,
              toInstanceId,   toHookId,         toEventType);
  }

  _dragging.path.remove();
  _dragging = null;
}

function _highlightCompatible(eventType) {
  /* Add glow to all input hook elements with matching event_type */
  document.querySelectorAll('[data-hook-input]').forEach(el => {
    if (el.dataset.eventType === eventType) {
      el.style.background = COMPAT_COL;
      el.style.boxShadow  = '0 0 8px rgba(0,255,136,.6)';
    }
  });
}

function _clearHighlights() {
  document.querySelectorAll('[data-hook-input]').forEach(el => {
    el.style.background = '';
    el.style.boxShadow  = '';
  });
}

/* ── Draw permanent wire ── */
function _drawWire(fromId, fromHookId, fromEventType, toId, toHookId, toEventType) {
  /* Kernel wire registration */
  const wireId = KERNEL.wireRegistry.register({
    sourceInstanceId: fromId,
    sourceHookId:     fromHookId,
    targetInstanceId: toId,
    targetHookId:     toHookId,
    wireType:         'event_bus',
  });
  if (!wireId) return; /* validation failed */

  /* Bus subscription: when fromId publishes fromEventType, route to toId */
  const topic = fromEventType + ':' + fromId;
  const sub   = KERNEL.bus.subscribe(fromEventType, payload => {
    if (payload?._from !== fromId && fromEventType !== 'pad:trigger') return;
    KERNEL.bus.publish(toEventType + ':' + toId, payload);
  });

  /* SVG path between mod window centers */
  const fromWin = _canvasEl.querySelector(`[data-wm-id="${fromId}"]`);
  const toWin   = _canvasEl.querySelector(`[data-wm-id="${toId}"]`);
  if (!fromWin || !toWin) { sub(); return; }

  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('fill','none');
  path.setAttribute('stroke', WIRE_COL);
  path.setAttribute('stroke-width','2');
  path.setAttribute('opacity','0.7');
  path.style.cursor = 'pointer';
  path.title = `${fromHookId} → ${toHookId}  (click to remove)`;
  _svg.appendChild(path);

  const entry = { wireId, path, sub, fromId, toId, fromHookId, toHookId };
  _wires.set(wireId, entry);
  _updateWirePath(entry);

  /* Click wire to remove */
  path.addEventListener('click', () => _removeWire(wireId));
  path.addEventListener('mouseenter', () => path.setAttribute('stroke', WIRE_HOV));
  path.addEventListener('mouseleave', () => path.setAttribute('stroke', WIRE_COL));

  /* Track window moves to redraw wire */
  const observer = new MutationObserver(() => _updateWirePath(entry));
  [fromWin, toWin].forEach(w => observer.observe(w, { attributes:true, attributeFilter:['style'] }));
  entry.observer = observer;

  KERNEL.bus.publish('kernel:notify', { message: `🔌 Wired: ${fromHookId.split('.').pop()} → ${toHookId.split('.').pop()}` });
  KERNEL.ledger._write({ type:'wire_drawn', wireId, fromId, toId });
}

function _updateWirePath(entry) {
  const r       = _canvasEl.getBoundingClientRect();
  const fromWin = _canvasEl.querySelector(`[data-wm-id="${entry.fromId}"]`);
  const toWin   = _canvasEl.querySelector(`[data-wm-id="${entry.toId}"]`);
  if (!fromWin || !toWin) return;

  const fr = fromWin.getBoundingClientRect();
  const tr = toWin.getBoundingClientRect();
  const sx = fr.right  - r.left;
  const sy = fr.top    - r.top + fr.height / 2;
  const ex = tr.left   - r.left;
  const ey = tr.top    - r.top + tr.height / 2;
  const d  = `M${sx},${sy} C${sx+80},${sy} ${ex-80},${ey} ${ex},${ey}`;
  entry.path.setAttribute('d', d);
}

function _removeWire(wireId) {
  const e = _wires.get(wireId); if (!e) return;
  e.sub?.();
  e.path?.remove();
  e.observer?.disconnect();
  KERNEL.wireRegistry.remove(wireId);
  _wires.delete(wireId);
  KERNEL.bus.publish('kernel:notify', { message: '✂ Wire removed' });
}

/* ── Called by shell when an mod window spawns ── */
function onSpawn(instanceId) {
  /* Small delay for DOM to settle */
  setTimeout(() => {
    const win = _canvasEl?.querySelector(`[data-wm-id="${instanceId}"]`);
    if (!win) return;
    _attachContextMenu(win, instanceId);
  }, 50);
}

function onClose(instanceId) {
  /* Remove all wires involving this mod */
  _wires.forEach((entry, wireId) => {
    if (entry.fromId === instanceId || entry.toId === instanceId) {
      _removeWire(wireId);
    }
  });
}

/* Redraw all wires (e.g. after scroll/resize) */
function redrawAll() {
  _wires.forEach(entry => _updateWirePath(entry));
}

window.addEventListener('resize', redrawAll);

return { init, onSpawn, onClose, redrawAll };
})();
