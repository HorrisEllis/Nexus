/* ERAVOS runtime — app-settings.js → window.AppSettings (3.110). Domain-free.
 * His words, 2026-11-05: "also need a actual settings built not a drop down". The app's settings were entries in the ⋯ Options
 * dropdown, each opening its own popover. Now: ⚙ Settings in the toolbar (or Ctrl+,) opens ONE page, styled like the tool pages
 * (which he approved: "that looks nice as hell"), with a tab per section. ⋯ Options keeps the actions (undo, stop all, fit, tidy…).
 * Sections are contributed — the canvas adds its own (Look, About & updates), a domain adds its own — so the canvas names none of
 * the domain's settings:
 *   AppSettings.addSection({ id, label, order, icon, sub, make(close) → Element })   make runs each time the page opens
 *   AppSettings.open(id?) · close() · toggle() · sections() · get isOpen */
(function (global) {
  'use strict';
  const doc = global.document;
  const list = [];
  let cur = null, last = null;
  const AS = {
    addSection(s) { if (!s || !s.id || list.some(x => x.id === s.id)) return; list.push(s); list.sort((a, b) => (a.order || 50) - (b.order || 50)); if (cur) render(cur.tab); },
    sections: () => list.map(s => ({ id: s.id, label: s.label, order: s.order || 50 })),
    open, close, toggle: (id) => (cur ? close() : open(id)), get isOpen() { return !!cur; },
  };
  function key(e) { if (e.key === 'Escape' && cur && !doc.querySelector('.uk-ask-back')) { e.preventDefault(); e.stopPropagation(); close(); } }
  function open(id) {
    if (!doc || !global.UIKit) return null; const h = global.UIKit.h;
    if (!cur) {
      const el = h('div', { class: 'tp-overlay as-overlay', role: 'dialog', 'aria-label': 'Settings' });
      el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
      const page = h('div', { class: 'tp-page as-page', tabindex: '-1' });
      el.appendChild(page); doc.body.appendChild(el);
      cur = { el, page, tab: null }; doc.addEventListener('keydown', key, true);
    }
    render(id || (cur && cur.tab) || last || (list[0] && list[0].id));
    try { cur.page.focus({ preventScroll: true }); } catch (e) {}
    return cur.el;
  }
  function render(id) {
    const h = global.UIKit.h, page = cur.page; page.innerHTML = '';
    const sec = list.find(s => s.id === id) || list[0]; cur.tab = last = sec ? sec.id : null;
    const x = h('button', { class: 'tp-btn as-x', title: 'close (Esc)', 'aria-label': 'close settings', text: '✕ Close' }); x.addEventListener('click', close);
    page.appendChild(h('header', { class: 'tp-head as-head' }, [
      h('div', { class: 'tp-ht' }, [h('h2', { text: 'Settings' }), h('p', { text: 'How ERAVOS looks, sounds and behaves — remembered on this computer. Each tool keeps its own under its ⚙.' })]),
      h('div', { class: 'tp-act' }, [x])]));
    const nav = h('nav', { class: 'tp-nav as-nav', role: 'tablist' });
    list.forEach(s => { const b = h('button', { class: 'tp-btn tp-tab' + (sec && s.id === sec.id ? ' on' : ''), role: 'tab', 'aria-selected': String(!!sec && s.id === sec.id), 'data-tab': s.id, text: s.label });
      b.addEventListener('click', () => render(s.id)); nav.appendChild(b); });
    page.appendChild(nav);
    if (!sec) return;
    let body = null; try { body = sec.make(close); } catch (e) { body = h('p', { class: 'tp-p', text: 'This section could not open: ' + e.message }); }
    page.appendChild(h('section', { class: 'tp-sec as-sec', 'data-sec': sec.id }, [sec.sub ? h('p', { class: 'as-sub', text: sec.sub }) : null, body].filter(Boolean)));
  }
  function close() { if (!cur) return; cur.el.remove(); cur = null; doc.removeEventListener('keydown', key, true); }
  // the entry: ⚙ Settings in the toolbar (beside ⋯ Options), a line at the top of Options, and Ctrl+,
  function entry() {
    const opts = doc.querySelector('.tb-opts'); if (!opts || !global.UIKit) return false; if (doc.getElementById('settingsBtn')) return true;
    const b = doc.createElement('button'); b.id = 'settingsBtn'; b.type = 'button'; b.className = 'tb-btn'; b.title = 'Settings — theme, colours, sound, updates (Ctrl+,)'; b.setAttribute('data-ic', 'sliders-horizontal');
    b.textContent = 'Settings'; b.addEventListener('click', (e) => { e.stopPropagation(); const m = doc.getElementById('optMenu'); if (m) m.hidden = true; AS.toggle(); });
    if (global.Icons && global.Icons.decorate) { try { global.Icons.decorate(b); } catch (e) {} }
    opts.parentNode.insertBefore(b, opts); return true;
  }
  if (doc) {
    doc.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); AS.toggle(); } });
    const boot = () => { if (!entry()) setTimeout(boot, 300); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
  }
  global.AppSettings = AS;
})(typeof window !== 'undefined' ? window : globalThis);
