'use strict';
/**
 * renderer/shell/passwords.js — the key in the address bar: save a login when a site asks, fill one when you return (PW4, 0.60.186).
 * Spec: clear-glass/spec/passwords.spec MOD-PW-SHELL. comp_id: cg.renderer.shell.passwords
 *
 * James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
 * Firefox's shape: when a page's login form is submitted, main holds the login and this panel asks "Save login for <site>?" — the username
 * editable, the password as dots (this window never has it), the account it belongs to (this window's, or one signed in to the site, from
 * 0.60.185's accounts:forSite), and Save / Not now / Never for this site; "Update" when the password changed. When a page has saved
 * logins the key shows their count; clicking it lists them with Fill, and Manage passwords opens Settings.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const UI = () => window.CGShellUI;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const wcId = () => { try { return window.CGShell.wv.getWebContentsId(); } catch (_) { return null; } };
  const hostOf = (o) => { try { return new URL(o).host; } catch (_) { return o; } };
  let offer = null, avail = null;

  function key(on, count) {
    const b = $('btn-pw'); if (!b) return;
    b.hidden = !on; const badge = b.querySelector('.sh-badge');
    if (badge) { badge.textContent = count > 1 ? String(count) : ''; badge.hidden = !(count > 1); }
    b.classList.toggle('pending', !!offer);
  }

  async function drawOffer(pop) {
    const o = offer; const site = hostOf(o.origin);
    const head = el('div', 'sh-pop-head'); head.innerHTML = (window.CGIcons && window.CGIcons.svg('key', { size: 18 })) || '';
    head.append(el('span', null, o.kind === 'update' ? `Update login for ${site}?` : `Save login for ${site}?`));
    const user = el('input', 'ps-input'); user.value = o.username || ''; user.placeholder = 'Username'; user.spellcheck = false;
    const pass = el('input', 'ps-input'); pass.type = 'password'; pass.value = '••••••••'; pass.disabled = true; pass.title = 'Kept by Clear Glass; this window never has the password';
    const acct = el('select', 'ps-select');
    acct.append(Object.assign(el('option', null, 'No account'), { value: '' }));
    try {
      const r = await cg().accounts.forSite(o.origin, null);
      for (const a of (r && r.accounts) || []) { const opt = el('option', null, `${a.label}${a.state === 'signed-in' ? ' — signed in here' : a.state === 'provider' ? ' — this site’s account' : ''}`); opt.value = a.id; if (!acct.dataset.picked && a.state === 'signed-in') { opt.selected = true; acct.dataset.picked = '1'; } acct.append(opt); }
    } catch (_) { /* no accounts: No account */ }
    const note = el('div', 'ps-note'); note.hidden = true;
    const save = el('button', 'ps-btn primary', o.kind === 'update' ? 'Update' : 'Save');
    const later = el('button', 'ps-btn', 'Not now');
    const never = el('button', 'ps-btn', 'Never for this site');
    save.addEventListener('click', async (e) => { e.stopPropagation(); const r = await cg().passwords.save(o.wcId, o.origin, user.value.trim(), acct.value || null).catch(err => ({ ok: false, error: err.message }));
      if (!r || r.ok === false) { note.textContent = (r && r.error) || 'Not saved'; note.hidden = false; return; }
      offer = null; UI().close(); UI().toast(`Login saved for ${site}${acct.value ? ` · ${acct.options[acct.selectedIndex].textContent.split(' — ')[0]}` : ''}`); refresh(); });
    later.addEventListener('click', (e) => { e.stopPropagation(); cg().passwords.dismiss(o.wcId, o.origin, false); offer = null; UI().close(); refresh(); });
    never.addEventListener('click', (e) => { e.stopPropagation(); cg().passwords.dismiss(o.wcId, o.origin, true); offer = null; UI().close(); UI().toast(`Clear Glass will not offer to save logins for ${site}`); refresh(); });
    const f = (label, input) => { const d = el('div', 'ps-field'); d.append(el('div', 'ps-label', label), input); return d; };
    const acts = el('div', 'ps-acts pw-acts'); acts.append(never, el('span', 'sh-grow'), later, save);
    pop.replaceChildren(head, f('Username', user), f('Password', pass), f('Account', acct), note, acts);
    if (user.value === '') user.focus();
  }

  async function drawList(pop) {
    const head = el('div', 'sh-pop-head'); head.innerHTML = (window.CGIcons && window.CGIcons.svg('key', { size: 18 })) || '';
    const r = await cg().passwords.forPage(wcId()).catch(err => ({ ok: false, error: err.message }));
    head.append(el('span', null, r && r.origin ? `Logins for ${hostOf(r.origin)}` : 'Saved logins'));
    const body = el('div', 'ps-body');
    if (!r || r.ok === false) body.append(el('div', 'sh-empty', (r && r.error) || 'Not available here.'));
    else if (!r.logins.length) body.append(el('div', 'sh-empty', 'No saved login for this site. Sign in once and Clear Glass offers to save it.'));
    for (const l of (r && r.logins) || []) {
      const row = el('div', 'ps-item'); const t = el('div', 'ps-itxt'); t.append(el('div', 'ps-ilabel', l.username)); if (l.accountId) t.append(el('div', 'ps-isub', 'tied to an account in the vault'));
      const fill = el('button', 'ps-btn', 'Fill'); fill.addEventListener('click', async (e) => { e.stopPropagation(); const x = await cg().passwords.fillPage(wcId(), l.id).catch(err => ({ ok: false, error: err.message })); if (x && x.ok === false) UI().toast(`Not filled: ${x.error}`); else UI().close(); });
      row.append(t, fill); body.append(row);
    }
    const foot = el('div', 'sh-pop-foot'); const m = el('button', 'sh-link', 'Manage passwords…'); m.addEventListener('click', () => { UI().close(); cg().window.openSettings('privacy'); }); foot.append(m);
    pop.replaceChildren(head, body, foot);
  }

  async function open() { const pop = $('sh-pw-panel'); if (!pop) return; if (offer) await drawOffer(pop); else await drawList(pop); UI().show(pop, $('btn-pw')); }
  function refresh() { key(!!offer || !!(avail && avail.count), avail ? avail.count : 0); }

  window.CGPasswords = {
    open,
    offer(d) { if (!d) return; offer = d; refresh(); open(); },
    available(d) { avail = d; refresh(); },
  };
  function mount() {
    const b = $('btn-pw'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); const pop = $('sh-pw-panel'); if (UI().current() === pop) return UI().close(); open(); });
    const p = cg() && cg().passwords;
    if (p && typeof p.onOffer === 'function') p.onOffer((d) => { if (d && d.wcId === wcId()) window.CGPasswords.offer(d); });
    if (p && typeof p.onAvailable === 'function') p.onAvailable((d) => { if (d && d.wcId === wcId()) window.CGPasswords.available(d); });
    // a new page: its own logins come with its pw:form; an unanswered offer stays (it is often answered after the sign-in redirect, as in Firefox)
    const wv = $('wv'); if (wv) wv.addEventListener('did-navigate', () => { avail = null; refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
