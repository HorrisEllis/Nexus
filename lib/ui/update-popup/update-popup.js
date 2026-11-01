/* lib/ui/update-popup/update-popup.js — the update popup (UP9, 2026-11-01). One script for every screen that loads it (the TV, COS's UI).
   James, 2026-11-01: "can you have it have a popup when it has an update availanel".
   It asks its page's door for the notice (data-api on the script tag: the TV → /api/update/notice on :9000; COS → /api/cos/update/notice)
   on load and every 10 minutes, and shows a card when there is something to know: an update available or waiting, one that cannot apply
   (and why), a check that failed, or an update that wants a restart. Updating itself stays on Idearium's Updates page (Open updates).
   Later hides that same notice for 6 hours; a new version or a new kind of notice shows again. Nothing on a timer for show (§NO_DECORATIVE_MOTION). */
(function () {
  'use strict';
  const me = document.currentScript;
  const API = (me && me.dataset.api) || '/api/update/notice';
  const BASE = (me && me.dataset.base) || '';
  const SNOOZE_MS = 6 * 3600 * 1000, EVERY_MS = 10 * 60 * 1000;
  const key = (n) => `nexus.update.later:${n.kind}:${n.latest || n.at || ''}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let card = null;

  function css() {
    if (document.getElementById('nx-update-css')) return;
    const l = document.createElement('style'); l.id = 'nx-update-css';
    l.textContent = `.nx-upd{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:min(380px,calc(100vw - 32px));background:#0f121b;color:#e5e7ef;
      border:1px solid #2a3046;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif;overflow:hidden}
      .nx-upd .bar{height:3px;background:var(--c,#38bdf8)} .nx-upd .in{padding:14px 16px 12px}
      .nx-upd .k{font:600 10px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--c,#38bdf8)}
      .nx-upd h3{margin:6px 0 4px;font-size:14px;font-weight:600} .nx-upd p{margin:0;color:#a3a9bd;overflow-wrap:anywhere}
      .nx-upd .v{margin-top:6px;font:11px ui-monospace,monospace;color:#7c8299} .nx-upd .row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
      .nx-upd button{all:unset;cursor:pointer;padding:6px 12px;border-radius:7px;font-size:12px;border:1px solid #2a3046;color:#d6d9e4}
      .nx-upd button.go{background:var(--c,#38bdf8);border-color:transparent;color:#05070b;font-weight:600} .nx-upd button:focus-visible{outline:2px solid var(--c,#38bdf8)}
      .nx-upd .x{position:absolute;top:8px;right:10px;padding:2px 6px;border:0;color:#7c8299}`;
    document.head.appendChild(l);
  }
  const COLOR = { available: '#38bdf8', blocked: '#fbbf24', error: '#f87171', updated: '#34d399' };
  const LABEL = { available: 'Update available', blocked: 'Update waiting on you', error: 'Update check failed', updated: 'Updated' };

  function hide() { if (card) { card.remove(); card = null; } }
  function show(n) {
    css(); hide();
    card = document.createElement('div'); card.className = 'nx-upd'; card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-live', 'polite');
    card.style.setProperty('--c', COLOR[n.kind] || '#38bdf8');
    card.innerHTML = `<div class="bar"></div><button class="x" aria-label="Close" data-a="close">✕</button><div class="in">
      <div class="k">${esc(LABEL[n.kind] || 'Update')}</div><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p>
      <div class="v">${n.current ? `you have ${esc(n.current)}` : ''}${n.latest ? ` · GitHub has ${esc(n.latest)}` : ''}${n.at ? ` · checked ${esc(new Date(n.at).toLocaleString())}` : ''}</div>
      <div class="row"><button data-a="later">Later</button><button class="go" data-a="open">${n.kind === 'error' ? 'Check again' : 'Open updates'}</button></div></div>`;
    card.addEventListener('click', (e) => {
      const a = e.target && e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'open') window.open(n.updatesPage || 'http://127.0.0.1:4800/update.html', 'nexus-update', 'width=980,height=860');
      if (a === 'later' || a === 'open') { try { localStorage.setItem(key(n), String(Date.now() + SNOOZE_MS)); } catch (_) {} }
      hide();
    });
    document.body.appendChild(card);
  }
  async function poll() {
    let n; try { const r = await fetch(BASE + API, { cache: 'no-store' }); n = await r.json(); } catch (_) { return; }   // the door down: nothing to say here, the page says it
    if (!n || n.ok === false || !n.show) { hide(); return; }
    let until = 0; try { until = Number(localStorage.getItem(key(n))) || 0; } catch (_) {}
    if (until > Date.now()) return;
    show(n);
  }
  window.NexusUpdatePopup = { poll, show, hide };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll); else poll();
  setInterval(() => { if (!document.hidden) poll(); }, EVERY_MS);
})();
