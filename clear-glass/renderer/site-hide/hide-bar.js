/**
 * clear-glass/renderer/site-hide/hide-bar.js — "Hide this element" after an element pick (EE2, 0.60.402). Styles: hide-bar.css (#cg-hide-bar).
 * Map: docs/2026-11-05-clear-glass-element-engine-phasemap.spec EE2 · James, 2026-11-05: "can you integrate erosmanceros, the adblocker, and
 * guardian picker into one?" · "1 and 2"
 *
 * After a pick on a site (browser.js, dom:pick-result), the bar offers Hide: the Element Engine plugin (the adblocker's id) writes one
 * host##selector rule into his own filters, so the element is hidden on that site from the next load; Undo takes the rule out again. The
 * rule is also listed in the plugin's panel (Hidden on this site), where it can be removed later.
 *
 *   window.CGHideBar.mount({ cg })                once, from browser.js
 *   window.CGHideBar.offer({ selector, url })     after a pick — an http(s) page with a selector only
 */
(function () {
  'use strict';
  const PLUGIN = '8c2f1a90-4e3b-4f1a-9c2d-1a2b3c4d5e6f';   // the Element Engine (was the Ad Blocker): its id is unchanged
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let ctx = null, bar = null;
  function mount({ cg }) { ctx = { cg }; }
  function close() { if (bar) { bar.remove(); bar = null; } }
  function offer({ selector, url } = {}) {
    if (!ctx || !selector || selector === 'unknown' || !/^https?:/i.test(String(url || ''))) return false;
    close();
    let host = url; try { host = new URL(url).host; } catch (_) {}
    bar = el('div'); bar.id = 'cg-hide-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Hide this element');
    const title = el('div', 'hb-title', `🚫 Hide this element on ${host}`);
    const sel = el('code', 'hb-sel', selector.length > 90 ? selector.slice(0, 87) + '…' : selector); sel.title = selector;
    const say = el('div', 'hb-say');
    const hide = el('button', 'hb-hide', 'Hide'); const undo = el('button', 'hb-undo', 'Undo'); undo.hidden = true;
    const x = el('button', 'hb-x', '×'); x.title = 'Close'; x.addEventListener('click', close);
    let rule = null;
    hide.addEventListener('click', async () => {
      hide.disabled = true;
      let r; try { r = await ctx.cg.plugins.settings(PLUGIN, 'set', 'hide', { selector, url }, { url }); } catch (e) { r = { ok: false, error: e.message }; }
      hide.disabled = false;
      if (!r || r.ok === false) { say.className = 'hb-say bad'; say.textContent = (r && r.error) || 'the Element Engine did not answer'; return; }
      rule = r.rule || null; say.className = rule ? 'hb-say ok' : 'hb-say bad'; say.textContent = r.note || (rule ? `hidden: ${rule}` : 'not hidden');
      if (rule) { hide.hidden = true; undo.hidden = false; }
    });
    undo.addEventListener('click', async () => {
      if (!rule) return;
      let r; try { r = await ctx.cg.plugins.settings(PLUGIN, 'set', 'hidden', { id: rule, remove: true }, { url }); } catch (e) { r = { ok: false, error: e.message }; }
      say.className = r && r.ok !== false ? 'hb-say ok' : 'hb-say bad'; say.textContent = (r && (r.note || r.error)) || 'not undone';
      if (r && r.ok !== false) { rule = null; undo.hidden = true; hide.hidden = false; }
    });
    bar.append(title, sel, hide, undo, x, say);
    document.body.append(bar);
    return true;
  }
  window.CGHideBar = { mount, offer, close };
})();
