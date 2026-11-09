/**
 * cos/ui/settings/page.js — COS's Settings (SC7, expanded 2026-11-08). Spec: cos/spec/cos-console.spec MOD-MG-UI-SETTINGS.
 * James, 2026-11-08: "none of cos ui should be hardcoded when it comes to compartments." Nothing is named here: the tabs are the contract's pages
 * with nav "settings", in their `tab` order, titled by `tabTitle`. Each tab is that page, whole, in a frame of its own; it speaks to the shell
 * (the top frame) itself (core.js), so its confirms, notices and events are the shell's as before. #/settings/<page> opens a tab; the last one
 * is remembered in this browser. A page moved here keeps its own route.
 */
(async function () {
  'use strict';
  const { h, esc } = COS; const $ = (id) => document.getElementById(id);
  try { await COS.page('settings'); } catch (e) { return e.down ? COS.down($('stage'), e.message) : COS.say($('stage'), { glyph: 'x', title: 'Settings could not start', text: esc(e.message) }); }
  const tabs = (COS.contract.pages || []).filter(p => p.built && p.nav === 'settings').sort((a, b) => (a.tab || 99) - (b.tab || 99));
  if (!tabs.length) return COS.say($('stage'), { glyph: 'compass', title: 'No settings yet', text: 'No page in the manager’s contract is marked as a tab of Settings (nav settings).' });
  const frames = new Map();
  const remember = (id) => { try { localStorage.setItem('cos.settings.tab', id); } catch (_) {} };
  const remembered = () => { try { return localStorage.getItem('cos.settings.tab'); } catch (_) { return null; } };
  const fromHash = () => { try { const m = /^#\/settings\/([^/]+)/.exec(window.top.location.hash); return m ? decodeURIComponent(m[1]) : null; } catch (_) { return null; } };
  const theme = () => document.documentElement.dataset.theme;
  function show(id, write) {
    const p = tabs.find(t => t.id === id) || tabs[0];
    let f = frames.get(p.id);
    if (!f) {
      f = h('iframe', { src: `../${p.path}index.html`, title: p.tabTitle || p.title, 'data-page': p.id });
      f.addEventListener('load', () => {
        f.contentWindow.postMessage({ type: 'cos.theme', theme: theme() }, location.origin);
        // one scroll, the page's: the frame grows to its page's height (same origin), so a tab never scrolls inside itself
        try { const d = f.contentDocument, fit = () => { f.style.height = `${Math.max(520, d.documentElement.scrollHeight)}px`; }; new ResizeObserver(fit).observe(d.body); fit(); } catch (_) {}
      });
      $('stage').append(f); frames.set(p.id, f);
    }
    for (const x of frames.values()) x.classList.toggle('on', x === f);
    for (const b of $('tabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === p.id));
    remember(p.id);
    if (write) { try { const want = `#/settings/${encodeURIComponent(p.id)}`; if (!window.top.location.hash.startsWith(want)) window.top.location.hash = want; } catch (_) {} }
  }
  $('tabs').replaceChildren(...tabs.map(p => h('button', { role: 'tab', 'data-tab': p.id, onclick: () => show(p.id, true) }, p.tabTitle || p.title)));
  show(fromHash() || remembered() || tabs[0].id, false);
  try { window.top.addEventListener('hashchange', () => { const id = fromHash(); if (id) show(id, false); }); } catch (_) {}
  // the shell tells its own frames the theme; a tab is one frame deeper, so the theme is passed on to it
  addEventListener('message', (m) => { if (m.origin === location.origin && m.data && m.data.type === 'cos.theme') for (const f of frames.values()) f.contentWindow && f.contentWindow.postMessage(m.data, location.origin); });
})();
