/* ═══════════════════════════════════════════════════════════
   ERAVOS CANVAS WM  v3.0.0
   Window manager for the canvas space.
   Drag · resize · snap-to-8px · collapse · z-order · close
   ═══════════════════════════════════════════════════════════ */

window.CanvasWM = (() => {
'use strict';

let _canvas = null;
let _zTop   = 100;
const SNAP  = 8;

function init(canvasEl) {
  _canvas = canvasEl;
}

function snap(v) { return Math.round(v / SNAP) * SNAP; }

function create(opts) {
  const {
    id,
    title    = 'Module',
    x        = 80,
    y        = 80,
    width    = 300,
    height   = 380,
    minWidth  = 200,
    minHeight = 120,
  } = opts;

  /* ── Root element ── */
  const el = document.createElement('div');
  el.className   = 'wm-win';
  el.dataset.wmId = id;
  el.style.cssText = `
    position: absolute;
    left: ${snap(x)}px;
    top:  ${snap(y)}px;
    width:  ${Math.max(minWidth,  width)}px;
    height: ${Math.max(minHeight, height)}px;
    min-width:  ${minWidth}px;
    min-height: ${minHeight}px;
    display: flex;
    flex-direction: column;
    background: var(--bg1);
    border: 1px solid var(--b2);
    border-radius: 5px;
    overflow: hidden;
    z-index: ${++_zTop};
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    will-change: transform;
  `;

  /* ── Title bar ── */
  const bar = document.createElement('div');
  bar.className = 'wm-bar';
  bar.style.cssText = `
    height: 30px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 6px;
    background: var(--bg2);
    border-bottom: 1px solid var(--b1);
    border-top: 2px solid var(--accent);
    cursor: grab;
    flex-shrink: 0;
    user-select: none;
  `;

  const titleEl = document.createElement('div');
  titleEl.className = 'wm-title';
  titleEl.style.cssText = `
    font-family: var(--orb, monospace);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: .18em;
    color: var(--dim2);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;
  titleEl.textContent = title;

  /* ── Bar buttons ── */
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';

  /* Collapse */
  const colBtn = _barBtn('−', 'Collapse');
  colBtn.addEventListener('click', e => { e.stopPropagation(); _toggleCollapse(el); });

  /* Close × */
  const closeBtn = _barBtn('×', 'Remove');
  closeBtn.style.color = 'var(--accent3)';
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.borderColor = 'var(--accent3)');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.borderColor = 'var(--b2)');
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    el.remove();
    if (window.KERNEL) {
      KERNEL.registry.unregister(id);
      KERNEL.bus.publish('canvas:window-closed', { id });
    }
  });

  btns.appendChild(colBtn);
  btns.appendChild(closeBtn);
  bar.appendChild(titleEl);
  bar.appendChild(btns);

  /* ── Content ── */
  const content = document.createElement('div');
  content.className = 'wm-content';
  content.style.cssText = 'flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column;';

  /* ── Resize handle ── */
  const resizer = document.createElement('div');
  resizer.className = 'wm-resizer';
  resizer.style.cssText = `
    position: absolute;
    right: 0; bottom: 0;
    width: 14px; height: 14px;
    cursor: se-resize;
    z-index: 2;
  `;
  resizer.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" style="position:absolute;right:2px;bottom:2px;opacity:.3">
    <path d="M9 1L1 9M9 5L5 9M9 9" stroke="var(--dim2)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

  el.appendChild(bar);
  el.appendChild(content);
  el.appendChild(resizer);

  /* ── Drag ── */
  let _dragging = false, _dx = 0, _dy = 0;
  bar.addEventListener('pointerdown', e => {
    if (e.target !== bar && e.target !== titleEl) return;
    _dragging = true;
    _dx = e.clientX - el.offsetLeft;
    _dy = e.clientY - el.offsetTop;
    bar.setPointerCapture(e.pointerId);
    bar.style.cursor = 'grabbing';
    _raise(el);
  });
  bar.addEventListener('pointermove', e => {
    if (!_dragging) return;
    const canvasRect = _canvas ? _canvas.getBoundingClientRect() : { left:0, top:0, width:9999, height:9999 };
    const nx = snap(Math.max(0, Math.min(canvasRect.width  - el.offsetWidth,  e.clientX - _dx)));
    const ny = snap(Math.max(0, Math.min(canvasRect.height - el.offsetHeight, e.clientY - _dy)));
    el.style.left = nx + 'px';
    el.style.top  = ny + 'px';
  });
  bar.addEventListener('pointerup',   () => { _dragging = false; bar.style.cursor = 'grab'; });
  bar.addEventListener('pointercancel',()=> { _dragging = false; bar.style.cursor = 'grab'; });

  /* ── Resize ── */
  let _resizing = false, _rx = 0, _ry = 0, _rw = 0, _rh = 0;
  resizer.addEventListener('pointerdown', e => {
    _resizing = true;
    _rx = e.clientX; _ry = e.clientY;
    _rw = el.offsetWidth; _rh = el.offsetHeight;
    resizer.setPointerCapture(e.pointerId);
    e.stopPropagation(); e.preventDefault();
  });
  resizer.addEventListener('pointermove', e => {
    if (!_resizing) return;
    const nw = snap(Math.max(minWidth,  _rw + (e.clientX - _rx)));
    const nh = snap(Math.max(minHeight, _rh + (e.clientY - _ry)));
    el.style.width  = nw + 'px';
    el.style.height = nh + 'px';
  });
  resizer.addEventListener('pointerup',   () => { _resizing = false; });
  resizer.addEventListener('pointercancel',()=> { _resizing = false; });

  /* ── Raise on click ── */
  el.addEventListener('pointerdown', () => _raise(el), { capture: true });

  /* ── Mount ── */
  (_canvas || document.body).appendChild(el);

  return {
    el, bar, content,
    raise: () => _raise(el),
    setTitle: t => titleEl.textContent = t,
    mount: child => { content.innerHTML = ''; content.appendChild(child); },
  };
}

function _raise(el) {
  el.style.zIndex = ++_zTop;
}

function _toggleCollapse(el) {
  const content = el.querySelector('.wm-content');
  const resizer = el.querySelector('.wm-resizer');
  const collapsed = el.dataset.collapsed === '1';
  if (collapsed) {
    content.style.display = '';
    resizer.style.display = '';
    el.style.height = (el.dataset.prevH || '380') + 'px';
    el.dataset.collapsed = '0';
    el.querySelector('.wm-bar button:first-child') && (el.querySelector('.wm-bar button').textContent = '−');
  } else {
    el.dataset.prevH = el.offsetHeight;
    content.style.display = 'none';
    resizer.style.display = 'none';
    el.style.height = '32px';
    el.dataset.collapsed = '1';
    el.querySelector('.wm-bar button') && (el.querySelector('.wm-bar button').textContent = '+');
  }
}

function _barBtn(label, title) {
  const b = document.createElement('button');
  b.title = title;
  b.textContent = label;
  b.style.cssText = `
    width: 16px; height: 16px;
    border-radius: 2px;
    border: 1px solid var(--b2);
    background: var(--bg3);
    color: var(--dim2);
    font-size: 11px; line-height: 1;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 0; flex-shrink: 0;
    transition: all .1s;
    font-family: monospace;
  `;
  b.addEventListener('mouseenter', () => b.style.borderColor = 'var(--accent)');
  b.addEventListener('mouseleave', () => b.style.borderColor = 'var(--b2)');
  return b;
}

return { init, create };
})();
