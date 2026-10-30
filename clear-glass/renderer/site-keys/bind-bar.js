/**
 * clear-glass/renderer/site-keys/bind-bar.js — "Bind a key" to an element just picked (KB3, 0.60.275). Styles: bind-bar.css (#cg-key-bind).
 *
 * James, 2026-10-28: "could always try arrows, or a number. any way you can add all of that to the keybindings. like elements to keys, per site?"
 *
 * After the element picker picks something on a site (browser.js, dom:pick-result), a small bar offers: press the keys, say what they do to
 * this element (click it, choose an option in it, press a key in it, run a macro), Save. It is saved for that site only, through
 * ClearGlass.shortcuts.siteSet (main, src/shortcuts/site-keys.js); a refused key (plain typing) shows why. Settings › Keyboard shortcuts ›
 * Keys on sites lists and removes them. Nothing is sent to the page; the bar lives in the chrome.
 *
 *   window.CGSiteKeyBar.mount({ cg })          once, from browser.js
 *   window.CGSiteKeyBar.offer({ xpath, url })  after a pick — an http(s) page only
 */
(function () {
  'use strict';
  const KEY_NAMES = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc', '+': '=' };
  function accelOf(e) {
    let key = e.key;
    if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return null;
    key = KEY_NAMES[key] || key;
    if (key.length === 1) key = key.toUpperCase();
    if (e.shiftKey && /^Digit\d$/.test(e.code)) key = e.code.slice(5);
    if (e.shiftKey && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', key].filter(Boolean).join('+');
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let ctx = null, bar = null;

  function mount({ cg }) { ctx = { cg }; }
  function close() { if (bar) { bar.remove(); bar = null; } }

  function offer({ xpath, url } = {}) {
    if (!ctx || !xpath || !/^https?:/i.test(String(url || ''))) return false;
    close();
    let origin = url; try { origin = new URL(url).origin; } catch (_) {}
    bar = el('div'); bar.id = 'cg-key-bind'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-label', 'Bind a key to this element');
    const title = el('div', 'kb-title', `⌨ Bind a key to this element on ${origin.replace(/^https?:\/\//, '')}`);
    const keys = el('input', 'kb-keys'); keys.placeholder = 'press the keys'; keys.readOnly = true;
    const does = el('select', 'kb-do');
    for (const [v, l] of [['click', 'Click it'], ['choose', 'Choose an option'], ['key', 'Press a key in it'], ['macro', 'Run a macro']]) { const o = el('option', null, l); o.value = v; does.append(o); }
    const extra = el('input', 'kb-extra'); extra.placeholder = 'option (6, or "6 Days")'; extra.style.display = 'none';
    const label = el('input', 'kb-label'); label.placeholder = 'name (optional)';
    // 2026-10-30 GF4 — James: "if you run into friction use the per site keybindings that I proposed." The gig part this key serves: when the
    // fill cannot do that part, it uses this element (types or chooses the gig's value there) or runs this key.
    const part = el('input', 'kb-part'); part.placeholder = 'for gig part (optional)'; part.setAttribute('list', 'cg-kb-parts'); part.title = 'The autofill uses this key when it cannot do this part by itself';
    if (!document.getElementById('cg-kb-parts')) { const dl = el('datalist'); dl.id = 'cg-kb-parts';
      for (const k of ['title', 'category', 'tags', 'description', 'faq', 'requirement', 'basic.name', 'basic.description', 'basic.delivery', 'basic.revisions', 'basic.price',
        'standard.name', 'standard.description', 'standard.delivery', 'standard.revisions', 'standard.price', 'premium.name', 'premium.description', 'premium.delivery', 'premium.revisions', 'premium.price']) { const o = el('option'); o.value = k; dl.append(o); }
      document.body.append(dl); }
    const say = el('div', 'kb-say');
    const save = el('button', 'kb-save', 'Save'); const x = el('button', 'kb-x', '×'); x.title = 'Close';
    const hint = { choose: 'option (6, or "6 Days")', key: 'key (Down, Up, Enter, a digit)', macro: 'macro name' };
    does.addEventListener('change', () => { extra.style.display = does.value === 'click' ? 'none' : ''; extra.placeholder = hint[does.value] || ''; });
    keys.addEventListener('keydown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.key === 'Escape' && !e.ctrlKey && !e.altKey) return close(); const a = accelOf(e); if (!a) return; keys.value = a; say.textContent = ''; });
    x.addEventListener('click', close);
    save.addEventListener('click', async () => {
      const d = does.value, v = extra.value.trim();
      const binding = { do: d, selector: xpath, label: label.value.trim() || undefined, part: part.value.trim() || undefined, ...(d === 'choose' ? { option: v } : d === 'key' ? { key: v } : d === 'macro' ? { macro: v } : {}) };
      let r; try { r = await ctx.cg.shortcuts.siteSet(url, keys.value, binding); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) { say.textContent = (r && r.error) || 'not saved'; say.className = 'kb-say bad'; return; }
      say.className = 'kb-say ok'; say.textContent = `${r.accel} saved on ${r.origin.replace(/^https?:\/\//, '')}`;
      setTimeout(close, 1400);
    });
    bar.append(title, el('div', 'kb-row', null), say);
    bar.children[1].append(keys, does, extra, label, part, save, x);
    document.body.append(bar);
    keys.focus();
    return true;
  }

  window.CGSiteKeyBar = { mount, offer, close };
})();
