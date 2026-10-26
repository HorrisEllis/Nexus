/*
 * clear-glass/renderer/autofill-inline.js — the Firefox-style autofill chip under an input (AF3, 0.60.263)
 * Map: docs/2026-10-26-inline-autofill-ui-phasemap.spec (AF3)
 *
 * James, 2026-10-26: "like firefox … a autofill button where it shows under the input" · "And that's in the ui? When you click on name it
 * will show autofill?" · "1" (build it first).
 *
 * Runs in an ISOLATED world (main/index.js executeJavaScriptInIsolatedWorld), so the page's own scripts cannot read the profile values this
 * closure holds, and it draws in a CLOSED shadow root, so they cannot read the chip either. The fields were tagged data-cg-af="<n>" by
 * main (a bare number, no data). Clicking fills through the native value setter and input/change events (what React and Vue listen to).
 * It never submits. Esc, blur or scrolling the field out of view hides it; it re-anchors on scroll and resize.
 *
 * Called as: (CG_AF_INIT)({ fields: [{ n, fieldType, label, value }], profile: 'label' })
 */
(function (data) {
  'use strict';
  if (!data || !Array.isArray(data.fields) || !data.fields.length) return { ok: false, why: 'no matched field' };
  const prev = window.__cgAfInline; if (prev && prev.destroy) prev.destroy();
  const byN = new Map(data.fields.map(f => [String(f.n), f]));
  const host = document.createElement('div');
  host.setAttribute('data-cg-af-chip', '');
  host.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;display:none;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .c{font:12px "Segoe UI",system-ui,sans-serif;background:#0f1018;color:#d5d8e4;border:1px solid rgba(0,245,255,.35);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.45);padding:4px;min-width:220px;max-width:360px}
    .r{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer}
    .r:hover,.r:focus{background:rgba(0,245,255,.10);outline:none}
    .k{color:#7d8199;font-size:11px;white-space:nowrap}
    .v{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f2f4fb}
    .m{width:10px;height:10px;border-radius:3px;border:1.5px solid #00f5ff;flex:none}
    .all{border-top:1px solid rgba(255,255,255,.07);margin-top:2px;color:#00f5ff}
    .f{padding:4px 8px 2px;color:#4c5068;font-size:10.5px}
  </style><div class="c" role="listbox"></div>`;
  const box = root.querySelector('.c');
  (document.body || document.documentElement).appendChild(host);
  let current = null;

  const setValue = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const fieldEl = (n) => document.querySelector(`[data-cg-af="${CSS.escape(String(n))}"]`);
  const hide = () => { host.style.display = 'none'; current = null; };
  const place = () => {
    if (!current) return;
    const r = current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width === 0) return hide();
    host.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 370))}px`;
    host.style.top = `${Math.min(r.bottom + 4, innerHeight - 40)}px`;
  };
  const fillOne = (f) => { const el = fieldEl(f.n); if (el) setValue(el, f.value); };
  const show = (el) => {
    const f = byN.get(el.getAttribute('data-cg-af')); if (!f) return;
    current = el;
    const others = data.fields.filter(x => x.n !== f.n && fieldEl(x.n) && !fieldEl(x.n).value);
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = `<div class="r" tabindex="0" data-a="one"><span class="m"></span><span class="v">${esc(f.value)}</span><span class="k">${esc(f.label || f.fieldType)}</span></div>`
      + (others.length ? `<div class="r all" tabindex="0" data-a="all"><span class="v">Fill all ${others.length + 1} fields</span></div>` : '')
      + `<div class="f">Clear Glass autofill · ${esc(data.profile || 'your profile')} · never submits</div>`;
    box.querySelector('[data-a="one"]').addEventListener('mousedown', (e) => { e.preventDefault(); fillOne(f); hide(); });
    const all = box.querySelector('[data-a="all"]');
    if (all) all.addEventListener('mousedown', (e) => { e.preventDefault(); fillOne(f); others.forEach(fillOne); hide(); });
    host.style.display = 'block';
    place();
  };
  const onFocus = (e) => { const el = e.target; if (el && el.getAttribute && el.hasAttribute('data-cg-af') && !el.value) show(el); };
  const onKey = (e) => { if (e.key === 'Escape') hide(); };
  const onBlur = (e) => { if (e.target === current) setTimeout(() => { if (document.activeElement !== current) hide(); }, 150); };
  const onInput = (e) => { if (e.target === current && e.target.value) hide(); };
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('click', onFocus, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusout', onBlur, true);
  document.addEventListener('input', onInput, true);
  addEventListener('scroll', place, true); addEventListener('resize', place);
  const api = {
    destroy() {
      document.removeEventListener('focusin', onFocus, true); document.removeEventListener('click', onFocus, true);
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusout', onBlur, true);
      document.removeEventListener('input', onInput, true);
      removeEventListener('scroll', place, true); removeEventListener('resize', place);
      host.remove();
    },
    // for tests: is the chip showing, and what does it offer (read in this isolated world only)
    state() { return { shown: host.style.display === 'block', rows: [...box.querySelectorAll('.r')].map(r => r.textContent) }; },
  };
  window.__cgAfInline = api;   // the isolated world's own window: the page cannot see it
  if (document.activeElement && document.activeElement.hasAttribute && document.activeElement.hasAttribute('data-cg-af')) show(document.activeElement);
  return { ok: true, fields: data.fields.length };
})
