/* ERAVOS runtime R7 — ui-kit.js → window.UIKit
 * Bidirectional controls (control.set(v) updates without re-emitting), canvases, render loop, paramPanel.
 * Domains add their own widgets with UIKit.extend({...}). No business logic: controls only emit ui:config_change {key, value}. */
(function (global) {
  'use strict';
  const doc = global.document;

  function h(tag, attrs, children) {
    const el = doc.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(sk => { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; });
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(c => { if (c === null || c === undefined || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? doc.createTextNode(String(c)) : c); });
    if ((tag === 'button' || el.getAttribute('role') === 'button') && !el.hasAttribute('aria-label')) nameIcon(el);
    return el;
  }
  // P11.4 (gate A): a control whose visible text is only a symbol (▶ ■ × ＋ ↶ ⇢ …) is named from its tooltip for screen readers
  const HAS_WORD = /[A-Za-z0-9\u00C0-\u024F]{2,}/;
  const SYMBOL = { '▶': 'play', '■': 'stop', '⏹': 'stop', '⏺': 'record', '●': 'record', '×': 'close', '✕': 'close', '＋': 'add', '+': 'add', '–': 'fold', '−': 'minus', '↶': 'undo', '↷': 'redo', '⏮': 'back to start', '⤢': 'fit', '⇢': 'connect', '✂': 'cut', '⟲': 'restore', '⤓': 'download', '▲': 'up', '▼': 'down', '◀': 'left', '🎲': 'random', 'Ø': 'phase invert', 'φ': 'golden ratio', 'π': 'pi', '√': 'square root', '•': 'small', '⬤': 'large' };
  function nameIcon(el) {
    const t = (el.textContent || '').trim(), tip = (el.getAttribute('title') || '').split('\n')[0].trim();
    if (HAS_WORD.test(t)) return;
    const sym = Array.from(t).map(ch => SYMBOL[ch]).filter(Boolean).join(' ');
    const name = HAS_WORD.test(tip) ? tip : (sym || tip); // a tooltip that is itself just a symbol is no name
    if (name) el.setAttribute('aria-label', name);
  }
  const reduceMotion = () => { try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  // shared keyboard stepping for value controls: arrows ±1 %, shift ±0.1 %, PageUp/Down ±10 %, Home/End, Delete = default
  function keyStep(e, n) {
    const fine = e.shiftKey ? 0.001 : 0.01;
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': return n + fine;
      case 'ArrowDown': case 'ArrowLeft': return n - fine;
      case 'PageUp': return n + 0.1; case 'PageDown': return n - 0.1;
      case 'Home': return 0; case 'End': return 1;
      default: return null;
    }
  }

  function fmt(v, c) {
    if (typeof v !== 'number') return String(v);
    const unit = c && c.unit ? c.unit : '';
    if (unit === 'Hz' && v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k';
    if (unit === 'ms') return v.toFixed(v < 10 ? 1 : 0) + 'ms';
    if (unit === 's') return v < 1 ? (v * 1000).toFixed(0) + 'ms' : v.toFixed(2) + 's';
    if (unit === 'st') return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) < 10 && v % 1 ? 2 : 0);
    if (unit === 'dB') return (v > 0 ? '+' : '') + v.toFixed(1);
    if (unit === '%') return Math.round(v * 100) + '%';
    const step = c && c.step;
    const dec = (c && c.type === 'integer') || (step && step >= 1) ? 0 : step ? Math.max(0, Math.min(3, -Math.floor(Math.log10(step)))) : (Math.abs(v) < 10 ? 2 : 0);
    return v.toFixed(dec) + (unit && unit !== 'c' ? '' : '');
  }

  // mapping value ↔ 0..1 (log for Hz ranges spanning > 2 decades)
  function mapper(c) {
    const min = c.min, max = c.max;
    const log = c.curve === 'log' || (c.curve !== 'lin' && min > 0 && max / min >= 50);
    return {
      toN: (v) => log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min),
      fromN: (n) => { n = Math.max(0, Math.min(1, n)); let v = log ? min * Math.pow(max / min, n) : min + n * (max - min); if (c.step) v = Math.round(v / c.step) * c.step; return Math.max(min, Math.min(max, +v.toFixed(6))); },
    };
  }

  // ---------------------------------------------------------------- Knob
  function Knob(o) {
    const m = mapper(o);
    let value = o.value !== undefined ? o.value : o.default;
    const size = o.size || 38;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(svgNS, 'svg'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', '0 0 40 40');
    const track = doc.createElementNS(svgNS, 'path'), arc = doc.createElementNS(svgNS, 'path'), dot = doc.createElementNS(svgNS, 'circle');
    track.setAttribute('class', 'uk-knob-track'); arc.setAttribute('class', 'uk-knob-arc'); dot.setAttribute('class', 'uk-knob-dot'); dot.setAttribute('r', '2.6');
    svg.append(track, arc, dot);
    const lbl = h('div', { class: 'uk-knob-label', text: o.label || o.key || '' });
    const val = h('div', { class: 'uk-knob-val' });
    const el = h('div', { class: 'uk-knob' + (o.big ? ' big' : ''), title: (o.label || '') + (o.hint ? ' — ' + o.hint : '') + '\n(drag or arrow keys · shift fine · dbl-click / Delete resets)',
      role: 'slider', tabindex: '0', 'aria-label': o.label || o.key || 'value', 'aria-valuemin': String(o.min), 'aria-valuemax': String(o.max) }, [svg, val, lbl]);
    svg.setAttribute('aria-hidden', 'true');
    if (o.accent) el.style.setProperty('--acc', o.accent);
    const A0 = -135, A1 = 135;
    const pol = (a, r) => { const rad = (a - 90) * Math.PI / 180; return [20 + r * Math.cos(rad), 20 + r * Math.sin(rad)]; };
    const arcPath = (a0, a1, r) => { const [x0, y0] = pol(a0, r), [x1, y1] = pol(a1, r); const large = Math.abs(a1 - a0) > 180 ? 1 : 0; return `M${x0} ${y0} A${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1} ${y1}`; };
    track.setAttribute('d', arcPath(A0, A1, 15));
    function draw() {
      const n = Math.max(0, Math.min(1, m.toN(value)));
      const bip = o.min < 0 && o.max > 0;
      const zeroA = bip ? A0 + (A1 - A0) * m.toN(0) : A0;
      const a = A0 + (A1 - A0) * n;
      arc.setAttribute('d', Math.abs(a - zeroA) < 0.5 ? '' : arcPath(Math.min(zeroA, a), Math.max(zeroA, a), 15));
      const [x, y] = pol(a, 10); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      val.textContent = o.format ? o.format(value) : fmt(value, o);
      el.setAttribute('aria-valuenow', String(value)); el.setAttribute('aria-valuetext', val.textContent + (o.unit && !/[a-z]$/i.test(val.textContent) ? ' ' + o.unit : ''));
    }
    el.addEventListener('keydown', (e) => {
      const reset = e.key === 'Delete' || e.key === 'Backspace';
      const n = reset ? null : keyStep(e, m.toN(value)); if (n === null && !reset) return;
      e.preventDefault(); e.stopPropagation();
      const nv = reset ? (o.default !== undefined ? o.default : o.min) : m.fromN(n);
      if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); }
    });
    let startY = 0, startN = 0, dragging = false, kDone = null;
    svg.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); dragging = true; startY = e.clientY; startN = m.toN(value); try { svg.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('active'); kDone = drag.begin(end); });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = (startY - e.clientY) / (e.shiftKey ? 1500 : 160);
      const nv = m.fromN(startN + dy);
      if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); }
    });
    const end = () => { dragging = false; el.classList.remove('active'); if (kDone) { kDone(); kDone = null; } };
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end); svg.addEventListener('lostpointercapture', end);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); const nv = m.fromN(m.toN(value) - Math.sign(e.deltaY) * (e.shiftKey ? 0.002 : 0.01)); if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); } }, { passive: false });
    svg.addEventListener('dblclick', () => { value = o.default !== undefined ? o.default : o.min; draw(); o.onChange && o.onChange(value); });
    draw();
    return { el, set(v) { if (typeof v === 'number') { value = v; draw(); } }, get: () => value };
  }

  // ---------------------------------------------------------------- Fader (vertical)
  function Fader(o) {
    const m = mapper(o);
    let value = o.value !== undefined ? o.value : o.default;
    const thumb = h('div', { class: 'uk-fader-thumb' }), fill = h('div', { class: 'uk-fader-fill' });
    const slot = h('div', { class: 'uk-fader-slot' }, [fill, thumb]);
    const val = h('div', { class: 'uk-knob-val' });
    const el = h('div', { class: 'uk-fader', style: { height: (o.height || 140) + 'px' }, role: 'slider', tabindex: '0', 'aria-orientation': 'vertical', 'aria-label': o.label || 'fader', 'aria-valuemin': String(o.min), 'aria-valuemax': String(o.max) }, [slot, val, h('div', { class: 'uk-knob-label', text: o.label || '' })]);
    const nOf = (v) => o.law ? o.law.toN(v) : m.toN(v);
    const vOf = (n) => o.law ? o.law.fromN(n) : m.fromN(n);
    function draw() { const n = Math.max(0, Math.min(1, nOf(value))); thumb.style.bottom = `calc(${n * 100}% - 7px)`; fill.style.height = n * 100 + '%'; val.textContent = o.format ? o.format(value) : fmt(value, o); el.setAttribute('aria-valuenow', String(value)); el.setAttribute('aria-valuetext', val.textContent); }
    el.addEventListener('keydown', (e) => { const reset = e.key === 'Delete' || e.key === 'Backspace'; const n = reset ? null : keyStep(e, nOf(value)); if (n === null && !reset) return; e.preventDefault(); e.stopPropagation(); const nv = reset ? o.default : vOf(n); if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); } });
    let dragOn = false;
    const setFromY = (e) => { const r = slot.getBoundingClientRect(); const n = 1 - (e.clientY - r.top) / r.height; const nv = vOf(n); if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); } };
    let fDone = null; const fEnd = () => { dragOn = false; if (fDone) { fDone(); fDone = null; } };
    slot.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragOn = true; try { slot.setPointerCapture(e.pointerId); } catch (_) {} fDone = drag.begin(fEnd); setFromY(e); });
    slot.addEventListener('pointermove', (e) => { if (dragOn) setFromY(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => slot.addEventListener(t, fEnd));
    slot.addEventListener('dblclick', () => { value = o.default; draw(); o.onChange && o.onChange(value); });
    draw();
    return { el, set(v) { if (typeof v === 'number') { value = v; draw(); } }, get: () => value };
  }

  function Toggle(o) {
    let value = !!(o.value !== undefined ? o.value : o.default);
    const el = h('button', { class: 'uk-toggle', title: o.hint || '', text: o.label || '' });
    const draw = () => { el.classList.toggle('on', value); el.setAttribute('aria-pressed', value ? 'true' : 'false'); };
    el.addEventListener('click', (e) => { e.stopPropagation(); value = !value; draw(); o.onChange && o.onChange(value); });
    draw();
    return { el, set(v) { value = !!v; draw(); }, get: () => value };
  }
  function Select(o) {
    const el = h('select', { class: 'uk-select', title: o.hint || o.label || '', 'aria-label': o.label || o.hint || 'choose' });
    const fill = (opts) => { el.innerHTML = ''; (opts || []).forEach(op => { const v = typeof op === 'object' ? op.value : op; const t = typeof op === 'object' ? op.label : op; el.appendChild(h('option', { value: String(v), text: String(t) })); }); };
    fill(o.options);
    let opts = o.options || [];
    el.addEventListener('change', () => { const raw = el.value; const found = opts.map(op => typeof op === 'object' ? op.value : op).find(v => String(v) === raw); o.onChange && o.onChange(found !== undefined ? found : raw); });
    el.addEventListener('pointerdown', e => e.stopPropagation());
    if (o.value !== undefined) el.value = String(o.value);
    const wrap = o.label ? h('label', { class: 'uk-field' }, [h('span', { text: o.label }), el]) : el;
    return { el: wrap, select: el, set(v) { el.value = String(v); }, get: () => el.value, setOptions(op) { opts = op; const cur = el.value; fill(op); el.value = cur; } };
  }
  function Segmented(o) {
    let value = o.value !== undefined ? o.value : o.default;
    const btns = [];
    const el = h('div', { class: 'uk-seg' + (o.vertical ? ' vertical' : ''), role: 'radiogroup', 'aria-label': o.label || o.hint || 'options' });
    (o.options || []).forEach(op => {
      const v = typeof op === 'object' ? op.value : op, t = typeof op === 'object' ? op.label : op;
      const b = h('button', { text: String(t), title: typeof op === 'object' && op.hint ? op.hint : String(t), role: 'radio' });
      if (typeof op === 'object' && op.aria) b.setAttribute('aria-label', op.aria);
      b.addEventListener('click', (e) => { e.stopPropagation(); value = v; draw(); o.onChange && o.onChange(v); });
      btns.push([v, b]); el.appendChild(b);
    });
    el.addEventListener('keydown', (e) => {
      const d = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0; if (!d || !btns.length) return;
      e.preventDefault(); e.stopPropagation();
      const i = btns.findIndex(([v]) => String(v) === String(value)), j = (Math.max(0, i) + d + btns.length) % btns.length;
      value = btns[j][0]; draw(); btns[j][1].focus(); o.onChange && o.onChange(value);
    });
    function draw() { btns.forEach(([v, b]) => { const on = String(v) === String(value); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on || (!btns.some(([w]) => String(w) === String(value)) && b === btns[0][1]) ? 0 : -1; }); }
    draw();
    const wrap = o.label ? h('div', { class: 'uk-field' }, [h('span', { text: o.label }), el]) : el;
    return { el: wrap, set(v) { value = v; draw(); }, get: () => value };
  }
  function Button(o) {
    const el = h('button', { class: 'uk-btn' + (o.kind ? ' ' + o.kind : ''), title: o.hint || '', text: o.label || '' });
    return buttonApi(el, o);
  }
  function buttonApi(el, o) {
    el.addEventListener('click', (e) => { e.stopPropagation(); o.onClick && o.onClick(e); });
    el.addEventListener('pointerdown', e => e.stopPropagation());
    return { el, set(label) { el.textContent = label; if (!el.getAttribute('title')) { el.removeAttribute('aria-label'); nameIcon(el); } } };
  }
  function NumberDrag(o) {
    let value = o.value !== undefined ? o.value : o.default;
    const el = h('div', { class: 'uk-num', title: (o.hint || o.label || '') + ' (drag, arrow keys, or dbl-click to type)', role: 'spinbutton', tabindex: '0', 'aria-label': o.label || o.hint || 'value', 'aria-valuemin': String(o.min), 'aria-valuemax': String(o.max) });
    const draw = () => { el.textContent = (o.prefix || '') + (o.format ? o.format(value) : fmt(value, o)) + (o.suffix || ''); el.setAttribute('aria-valuenow', String(value)); el.setAttribute('aria-valuetext', el.textContent); };
    el.addEventListener('keydown', (e) => {
      const step = (o.step || 1) * (e.shiftKey ? 10 : 1), d = e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : e.key === 'PageUp' ? step * 10 : e.key === 'PageDown' ? -step * 10 : 0;
      if (e.key === 'Enter') { e.preventDefault(); el.dispatchEvent(new MouseEvent('dblclick')); return; }
      if (!d) return; e.preventDefault(); e.stopPropagation();
      const nv = Math.max(o.min, Math.min(o.max, +(value + d).toFixed(4))); if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); }
    });
    let sy = 0, sv = 0, dragOn = false, nDone = null; const nEnd = () => { dragOn = false; if (nDone) { nDone(); nDone = null; } };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); dragOn = true; sy = e.clientY; sv = value; try { el.setPointerCapture(e.pointerId); } catch (_) {} nDone = drag.begin(nEnd); });
    el.addEventListener('pointermove', (e) => {
      if (!dragOn) return;
      const step = o.step || 1, d = Math.round((sy - e.clientY) / (e.shiftKey ? 12 : 4)) * step;
      const nv = Math.max(o.min, Math.min(o.max, +(sv + d).toFixed(4)));
      if (nv !== value) { value = nv; draw(); o.onChange && o.onChange(value); }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, nEnd));
    el.addEventListener('dblclick', () => ask(o.label || 'value', value).then((s) => {
      if (s === null) return; const nv = Math.max(o.min, Math.min(o.max, Number(s)));
      if (Number.isFinite(nv)) { value = nv; draw(); o.onChange && o.onChange(value); }
    }));
    draw();
    return { el, set(v) { if (typeof v === 'number') { value = v; draw(); } }, get: () => value };
  }

  // ---------------------------------------------------------------- ask (3.39)
  // In-page text question → Promise<string|null>. Replaces window.prompt(), which the desktop app (Electron) does not
  // support at all ("prompt() is not supported" — every rename / new-pack button threw). Enter = OK, Esc = cancel.
  function ask(label, value) {
    return new Promise((resolve) => {
      const back = h('div', { class: 'uk-ask-back' }), inp = h('input', { class: 'uk-ask-in', type: 'text', value: value === undefined || value === null ? '' : String(value), 'aria-label': label });
      const done = (v) => { back.remove(); resolve(v); };
      const ok = h('button', { class: 'uk-btn uk-ask-ok', text: 'OK', onclick: () => done(inp.value) }), no = h('button', { class: 'uk-btn', text: 'Cancel', onclick: () => done(null) });
      const box = h('div', { class: 'uk-ask', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, [h('div', { class: 'uk-ask-label', text: label }), inp, h('div', { class: 'uk-ask-row' }, [no, ok])]);
      back.appendChild(box); ['pointerdown', 'wheel', 'keydown'].forEach(t => back.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
      back.addEventListener('pointerdown', (e) => { if (e.target === back) done(null); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } else if (e.key === 'Escape') { e.preventDefault(); done(null); } });
      doc.body.appendChild(back); inp.focus(); inp.select();
    });
  }

  // ---------------------------------------------------------------- canvases
  function Canvas(w, hgt, cls) {
    const c = h('canvas', { class: 'uk-canvas ' + (cls || ''), role: 'img', 'aria-label': 'live display' });
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    c.width = w * dpr; c.height = hgt * dpr; c.style.width = '100%'; c.style.height = hgt + 'px';
    c.dpr = dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    c.g = g; c.W = w; c.H = hgt;
    c.fit = function () { const r = c.getBoundingClientRect(); if (r.width > 4 && Math.abs(r.width - c.W) > 1) { c.W = r.width; c.width = r.width * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); } return c; };
    return c;
  }
  // loop that stops when root disconnected (R7 util)
  // visibility: canvases that are off-screen, inside a folded window or in a hidden tab do no work at all — with a
  // dozen tools open the redraws were starving pointer input ("can't interact while dragging")
  const visible = new WeakMap();
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => es.forEach(e => visible.set(e.target, e.isIntersecting)), { threshold: 0 }) : null;
  function loop(el, fn, fps) {
    let last = 0, alive = true, observed = false;
    // reduced motion (OS setting): displays still update, but calmly — at most 8 redraws a second
    const minDt = Math.max(fps ? 1000 / fps : 0, reduceMotion() ? 125 : 0);
    function frame(t) {
      if (!alive) return;
      if (!el.isConnected && el._wasConnected) { alive = false; if (io) io.unobserve(el); return; }
      if (el.isConnected) { el._wasConnected = true; if (io && !observed) { io.observe(el); observed = true; } }
      const show = !doc.hidden && (!io || visible.get(el) !== false) && !(el.closest && el.closest('.wm-win.collapsed, #dock.folded'));
      if (show && t - last >= minDt) { last = t; try { fn(t); } catch (e) { console.error(e); alive = false; } }
      global.requestAnimationFrame(frame);
    }
    global.requestAnimationFrame(frame);
    return () => { alive = false; };
  }
  // ---------------------------------------------------------------- param panel bound to an organism view
  function paramControl(view, c, o) {
    o = o || {};
    const send = (v) => view.emit('config_change', { key: c.key, value: v });
    let ctl;
    if (c.type === 'number' || c.type === 'integer') ctl = Knob(Object.assign({}, c, { value: view.state[c.key], onChange: send, accent: view.descriptor.accent, big: o.big, size: o.size }));
    else if (c.type === 'boolean') ctl = Toggle({ label: c.label || c.key, value: view.state[c.key], onChange: send, hint: c.hint });
    else if (c.type === 'enum') ctl = (c.options.length <= (o.segMax || 5) ? Segmented : Select)({ label: o.noLabel ? '' : (c.label || c.key), options: c.options, value: view.state[c.key], onChange: send, hint: c.hint });
    else if (c.type === 'string') { const inp = h('input', { class: 'uk-text', value: view.state[c.key] || '' }); inp.addEventListener('change', () => send(inp.value)); inp.addEventListener('pointerdown', e => e.stopPropagation()); ctl = { el: h('label', { class: 'uk-field' }, [h('span', { text: c.label || c.key }), inp]), set: (v) => { inp.value = v; } }; }
    else return null;
    view.bind(c.key, (v) => ctl.set(v));
    return ctl;
  }
  function paramPanel(view, keys, o) {
    o = o || {};
    const cfg = view.descriptor.config || [];
    const list = keys ? keys.map(k => cfg.find(c => c.key === k)).filter(Boolean) : cfg.filter(c => !c.hidden && !c.settingsOnly);
    const groups = new Map();
    list.forEach(c => { const g = o.flat ? '' : (c.group || ''); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); });
    const el = h('div', { class: 'uk-panel' + (o.compact ? ' compact' : '') });
    groups.forEach((cs, g) => {
      const box = h('div', { class: 'uk-group' });
      if (g && !o.noTitles) box.appendChild(h('div', { class: 'uk-group-title', text: g }));
      const row = h('div', { class: 'uk-row' });
      cs.forEach(c => { const ctl = paramControl(view, c, o); if (ctl) row.appendChild(ctl.el); });
      box.appendChild(row); el.appendChild(box);
    });
    return el;
  }
  function presetBar(view) {
    const sel = Select({ options: ['— preset —'], onChange: (v) => { if (v !== '— preset —') view.emit('preset_load', { name: v }); } });
    const save = Button({ label: '＋', hint: 'save this as your own preset — knobs AND what it holds (patterns, notes, kit, clips)', onClick: () => ask('Preset name').then((n) => { if (n) view.emit('preset_save', { name: n }); }) });
    view.on('state_sync', (s) => { sel.setOptions(['— preset —'].concat(s.presets || [])); if (s.preset) sel.set(s.preset); else sel.set('— preset —'); });
    return h('div', { class: 'uk-presetbar' }, [sel.el, save.el]);
  }
  function hint(text) { return h('div', { class: 'uk-hint', text }); }
  // client (screen) → content coordinates of an element, at any canvas zoom: windows live in a scaled world, so the
  // rect is scaled while the element draws in its own layout pixels. Every pointer → drawing mapping goes through this.
  // ---- 3.34 drag guard: a drag can never outlive the press that started it ("something gets stuck like I'm still
  // dragging — opening the dev console fixes it": only a blur cleared it). Every pointer drag registers its end with
  // drag.begin(end) → done(). After a release has finished dispatching (its own handlers ran and committed), on a
  // button-less mouse move, a fresh press, blur, a hidden tab or Escape, every drag still alive is ended.
  const drag = (function () {
    const live = new Set();
    // tool-local drags all take pointer capture: every element that captured during a press is sent a (synthetic,
    // non-bubbling) pointercancel when the guard ends that press — their own end handler runs, whatever was missed
    const captured = new Set();
    if (global.Element && Element.prototype.setPointerCapture && !Element.prototype.setPointerCapture._eravos) {
      const orig = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function (id) { captured.add(this); return orig.call(this, id); };
      Element.prototype.setPointerCapture._eravos = true;
    }
    function endAll(reason) {
      const els = Array.from(captured); captured.clear();
      els.forEach(el => { if (el.isConnected && global.PointerEvent) { try { el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: false, pointerType: 'mouse' })); } catch (e) {} } });
      if (!live.size) return els.length; const fs = Array.from(live); live.clear(); fs.forEach(f => { try { f(reason); } catch (e) {} }); return fs.length + els.length;
    }
    function begin(end) { const f = (r) => end(r); live.add(f); return () => live.delete(f); }
    if (doc && global.addEventListener) {
      const later = (r) => () => global.setTimeout(() => endAll(r), 0);
      global.addEventListener('pointerup', (e) => { if (e.isTrusted) later('up')(); }, true); global.addEventListener('pointercancel', (e) => { if (e.isTrusted) later('cancel')(); }, true);
      global.addEventListener('pointerdown', (e) => { if (e.isTrusted) endAll('press'); }, true);
      global.addEventListener('pointermove', (e) => { if (e.isTrusted && (live.size || captured.size) && e.buttons === 0 && e.pointerType === 'mouse') endAll('no-button'); }, true);
      global.addEventListener('blur', () => endAll('blur')); doc.addEventListener('visibilitychange', () => { if (doc.hidden) endAll('hidden'); });
      global.addEventListener('keydown', (e) => { if (e.key === 'Escape') endAll('escape'); }, true);
    }
    return { begin, endAll, get live() { return live.size; } };
  })();
  function mapPoint(rect, w, h2, clientX, clientY) { const sx = rect.width > 0 && w > 0 ? w / rect.width : 1, sy = rect.height > 0 && h2 > 0 ? h2 / rect.height : 1; return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy }; }
  function toContent(el, clientX, clientY) { return mapPoint(el.getBoundingClientRect(), el.offsetWidth, el.offsetHeight, clientX, clientY); }

  global.UIKit = { h, fmt, mapper, ask, Knob, Fader, Toggle, Select, Segmented, Button, NumberDrag, Canvas, loop, paramControl, paramPanel, presetBar, hint, mapPoint, toContent, drag,
    extend(o) { Object.keys(o || {}).forEach(k => { if (!(k in global.UIKit)) global.UIKit[k] = o[k]; }); } };
})(typeof window !== 'undefined' ? window : globalThis);
