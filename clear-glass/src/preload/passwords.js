'use strict';
/**
 * clear-glass/src/preload/passwords.js — the page side of the password manager (PW2, 0.60.186).
 * Spec: clear-glass/spec/passwords.spec MOD-PW-PAGE. comp_id: cg.preload.passwords
 *
 * James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
 * Registered on every session Clear Glass makes (src/main/passwords-wiring.js), so ordinary pages, account windows and provider tabs (the
 * sign-in window) all have it. It runs in the preload's own world: the page's scripts cannot reach it. It only reports and fills; main
 * decides (which site this is — from the sender's URL —, whether to offer, whether to fill).
 *   pw:form     a login form is on the page (once per page, again after a single-page app swaps it in)
 *   pw:capture  a login form was submitted: { username, password } (to main only; the window never sees the password)
 *   pw:fill     main → page: { username, password, force } — set through the native setter with input/change, so frameworks see it
 */
(function (root) {
  const visible = (el) => !!el && !el.disabled && el.type !== 'hidden' && (el.offsetParent !== null || el.getClientRects().length > 0);
  const USERISH = /user|email|login|account|phone|mobile|ident/i;

  /** findLogin(doc) → { pass, user, form, isNew } | null — the first visible password field and the user field before it */
  function findLogin(doc) {
    const passes = [...doc.querySelectorAll('input[type="password"]')].filter(visible);
    if (!passes.length) return null;
    const pass = passes[0];
    const scope = pass.form || doc;
    const inputs = [...scope.querySelectorAll('input')].filter(visible);
    const before = inputs.slice(0, Math.max(0, inputs.indexOf(pass)))
      .filter(i => ['text', 'email', 'tel', ''].includes((i.getAttribute('type') || '').toLowerCase()));
    const user = before.find(i => /username|email/.test(i.getAttribute('autocomplete') || ''))
      || [...before].reverse().find(i => i.type === 'email' || USERISH.test(`${i.name} ${i.id} ${i.getAttribute('placeholder') || ''} ${i.getAttribute('aria-label') || ''}`))
      || before[before.length - 1] || null;
    const isNew = passes.length > 1 || /new-password/.test(pass.getAttribute('autocomplete') || '');
    return { pass, user, form: pass.form || null, isNew };
  }

  function setValue(el, v) {
    const proto = Object.getPrototypeOf(el); const d = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** install(win, io) — io: { send(channel, data), on(channel, fn) } */
  function install(win, io) {
    const doc = win.document; let reported = false; let last = { key: '', at: 0 };
    const capture = () => {
      const f = findLogin(doc); if (!f || !f.pass.value) return;
      const username = f.user ? f.user.value : ''; const key = `${username}\u0000${f.pass.value}`;
      if (key === last.key && Date.now() - last.at < 3000) return;   // one capture per submit (submit, Enter and click can all fire)
      last = { key, at: Date.now() };
      io.send('pw:capture', { username, password: f.pass.value, isNew: f.isNew });
    };
    doc.addEventListener('submit', (e) => { if (e.target && e.target.querySelector && e.target.querySelector('input[type="password"]')) capture(); }, true);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.type === 'password') capture(); }, true);
    doc.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
      if (!b) return; const f = findLogin(doc); if (!f || !f.pass.value) return;
      const inForm = f.form ? f.form.contains(b) : true;
      if (inForm && (b.type === 'submit' || b.getAttribute('type') == null || /log ?in|sign ?in|continue|next|submit/i.test(b.textContent || b.value || ''))) capture();
    }, true);
    const look = () => { if (reported) return; const f = findLogin(doc); if (!f) return; reported = true; io.send('pw:form', { hasUser: !!f.user, isNew: f.isNew }); };
    let t = null; const soon = () => { clearTimeout(t); t = setTimeout(look, 400); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', look); else look();
    try { new win.MutationObserver(soon).observe(doc.documentElement, { childList: true, subtree: true }); } catch (_) {}
    io.on('pw:fill', (d) => {
      const f = findLogin(doc); if (!f || !d) return;
      if (f.isNew && !d.force) return;   // a sign-up / change-password form is not autofilled
      if (f.user && d.username != null && (d.force || !f.user.value)) setValue(f.user, d.username);
      if (d.force || !f.pass.value) setValue(f.pass, d.password);
    });
  }

  const api = { findLogin, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  let electron = null; try { electron = typeof require === 'function' ? require('electron') : null; } catch (_) { electron = null; }
  if (electron && electron.ipcRenderer && root && root.document) {
    const { ipcRenderer } = electron;
    install(root, { send: (ch, d) => ipcRenderer.send(ch, d), on: (ch, fn) => ipcRenderer.on(ch, (_e, d) => fn(d)) });
  } else if (root && root.document) root.__cgPasswordsPage = api;   // a test page drives it with its own io
})(typeof window !== 'undefined' ? window : globalThis);
