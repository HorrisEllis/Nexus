/* lib/ui/update-popup/update-popup.js — the update popup (UP9, 2026-11-01). One script for every screen that loads it (the TV, COS's UI).
   James, 2026-11-01: "can you have it have a popup when it has an update availanel".
   It asks its page's door for the notice (data-api on the script tag: the TV → /api/update/notice on :9000; COS → /api/cos/update/notice)
   on load and every 10 minutes, and shows a card when there is something to know: an update available or waiting, one that cannot apply
   (and why), a check that failed, or an update that wants a restart. Updating itself stays on Idearium's Updates page (Open updates).
   Later hides that same notice for 6 hours; a new version or a new kind of notice shows again. Nothing on a timer for show (§NO_DECORATIVE_MOTION).
   CE4 (0.60.376, docs/2026-11-02-cos-enterprise-phasemap.spec) — James, 2026-11-02: "i want toasts in cos ui for gibhub updates with a update tool. so i
   can update nexus automatically. per system". With data-tool="cos" (COS's shell) the card is the update tool: the systems the update changes
   (restarted by themselves; Clear Glass waits for him), Update now, or Keep mine and update when local commits block it, each confirmed once on
   the card; then what restarted, and a Restart button for what waits. It asks COS's routes (GET /api/cos/update, POST /api/cos/update/apply). */
(function () {
  'use strict';
  const me = document.currentScript;
  const API = (me && me.dataset.api) || '/api/update/notice';
  const BASE = (me && me.dataset.base) || '';
  const TOOL = (me && me.dataset.tool) || null;   // 'cos': the update tool on the card (CE4)
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
      .nx-upd .x{position:absolute;top:8px;right:10px;padding:2px 6px;border:0;color:#7c8299}
      .nx-upd .sys{margin-top:10px;display:grid;gap:4px;font:12px ui-monospace,monospace} .nx-upd .sys div{display:flex;justify-content:space-between;gap:8px}
      .nx-upd .sys .t{color:#7c8299} .nx-upd .sys .w{color:#fbbf24} .nx-upd .sys .ok{color:#34d399} .nx-upd .sys .bad{color:#f87171}
      .nx-upd button[disabled]{opacity:.5;cursor:default} .nx-upd .busy{margin-top:8px;color:#7c8299;font-size:12px}`;
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
  // ── CE4: the update tool on the card (COS's shell) ──
  const post = async (p, body) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
  const row = (name, what, cls) => `<div><span>${esc(name)}</span><span class="${cls}">${esc(what)}</span></div>`;
  function sysList(ps, restarted) {
    if (!ps) return '';
    const done = new Map((restarted || []).map(x => [x.name, x]));
    const rows = [...(ps.restart || []).map(n => row(n, restarted ? (done.get(n) && done.get(n).ok ? 'restarted' : 'restart failed') : 'restarts by itself', restarted ? (done.get(n) && done.get(n).ok ? 'ok' : 'bad') : 't')),
      ...(ps.waitForHim || []).map(n => row(n, 'waits for you', 'w')),
      ...((ps.cosChanged || ps.kernelChanged) ? [row(ps.cosChanged ? 'COS' : 'the kernel', 'COS asks to restart', 'w')] : [])];   // CE2b 0.60.417: was 'loads at the next start of COS'
    return rows.length ? `<div class="sys">${rows.join('')}</div>` : `<div class="sys"><div><span class="t">no system's code changes</span></div></div>`;
  }
  async function tool(n) {
    let d; try { d = await (await fetch(BASE + '/api/cos/update', { cache: 'no-store' })).json(); } catch (_) { return show(n); }
    if (!d || d.ok === false || d.upToDate) return d && d.upToDate ? hide() : show(n);
    css(); hide();
    const keep = d.ahead > 0, color = keep ? '#fbbf24' : '#38bdf8';
    card = document.createElement('div'); card.className = 'nx-upd'; card.setAttribute('role', 'alertdialog'); card.style.setProperty('--c', color);
    const quote = d.releases && d.releases[0] && d.releases[0].quote ? `“${esc(String(d.releases[0].quote).slice(0, 180))}”` : '';
    const local = keep && d.local ? `<p style="margin-top:6px">Your folder has ${d.local.count} commit(s) GitHub lacks${d.local.onGitHub ? ` (${d.local.onGitHub} already there by content)` : ''}. Keep mine and update saves them on a branch first; nothing is lost.</p>` : '';
    const blocked = (d.plan && d.plan.blocks && d.plan.blocks.length) ? `<p style="margin-top:6px;color:#fbbf24">Your edits to ${esc(d.plan.blocks.slice(0, 3).map(b => b.file).join(', '))} are in the way: commit or set them aside first.</p>` : '';
    card.innerHTML = `<div class="bar"></div><button class="x" aria-label="Close" data-a="close">✕</button><div class="in">
      <div class="k">${keep ? 'Update waiting on you' : 'Update available'}</div><h3>Nexus ${esc(d.latest)} is on GitHub</h3>
      <p>${quote || `${d.behind} commit(s) since your ${esc(d.current)}.`}</p>${local}${blocked}${sysList(d.perSystem)}
      <div class="v">you have ${esc(d.current)} · GitHub has ${esc(d.latest)} · ${d.behind} commit(s)</div>
      <div class="row"><button data-a="later">Later</button><button data-a="open">Details</button>${blocked ? '' : `<button class="go" data-a="go">${keep ? 'Keep mine and update' : 'Update now'}</button>`}</div></div>`;
    let armed = false;
    card.addEventListener('click', async (e) => {
      const a = e.target && e.target.dataset && e.target.dataset.a; if (!a) return;
      if (a === 'open') { window.open(n.updatesPage || 'http://127.0.0.1:4800/update.html', 'nexus-update', 'width=980,height=860'); return; }
      if (a === 'later') { try { localStorage.setItem(key(n), String(Date.now() + SNOOZE_MS)); } catch (_) {} return hide(); }
      if (a === 'close') return hide();
      if (a === 'go' && !armed) { armed = true; e.target.textContent = `Confirm: ${(d.perSystem && d.perSystem.restart.length) ? `update and restart ${d.perSystem.restart.length}` : 'update'}`; return; }
      if (a === 'go') {
        card.querySelectorAll('button').forEach(b => { b.disabled = true; });
        card.querySelector('.row').insertAdjacentHTML('beforebegin', '<div class="busy">A backup first, then the update, then each changed system restarts by itself…</div>');
        let r; try { r = await post('/api/cos/update/apply', { by: 'person', mode: keep ? 'keep-local' : 'update' }); } catch (err) { r = { ok: false, error: err.message }; }
        return done(r);
      }
      if (a.startsWith('restart:')) {
        const name = a.slice(8); e.target.disabled = true; e.target.textContent = 'Restarting…';
        try { const r = await post(`/api/cos/systems/${encodeURIComponent(name)}/restart`, { by: 'person' }); e.target.textContent = r && r.ok === false ? `Refused: ${r.error}` : 'Restarted'; } catch (err) { e.target.textContent = `Failed: ${err.message}`; }
      }
    });
    document.body.appendChild(card);
  }
  function done(r) {
    css(); hide();
    card = document.createElement('div'); card.className = 'nx-upd'; card.setAttribute('role', 'alertdialog');
    const ok = r && r.ok && r.action !== 'none';
    card.style.setProperty('--c', ok ? '#34d399' : (r && r.ok ? '#38bdf8' : '#f87171'));
    // CE2b (0.60.417) — James, 2026-11-06: "updates need to restart cos." · on Clear Glass: "Ask me first". What waits for his yes (r.pending): each
    // system, and COS itself (asked twice, saying what closes with it); his yes goes to POST /api/cos/update/restart, which clears the ask everywhere
    const pend = ok && r.pending ? r.pending : null;
    const waits = pend ? pend.systems || [] : (ok && r.perSystem ? r.perSystem.waitForHim || [] : []);
    const cosAsk = !!(pend && pend.cos); const closes = pend && (pend.closes || []).length ? ` (${pend.closes.join(', ')} closes)` : '';
    card.innerHTML = `<div class="bar"></div><button class="x" aria-label="Close" data-a="close">✕</button><div class="in">
      <div class="k">${ok ? 'Updated' : (r && r.ok ? 'Up to date' : 'Update refused')}</div>
      <h3>${ok ? `Nexus ${esc(r.from && r.from.version)} → ${esc(r.to && r.to.version)}` : esc((r && (r.why || r.error)) || 'no answer')}</h3>
      ${ok && r.keptOn ? `<p>Your local commits are on ${esc(r.keptOn)}.</p>` : ''}${ok ? sysList(r.perSystem, r.restarted) : ''}
      ${ok && (r.said || []).length ? `<p style="margin-top:6px">${(r.said || []).map(esc).join('<br>')}</p>` : ''}
      <div class="row">${waits.map(n => `<button class="go" data-a="restart:${esc(n)}">Restart ${esc(n)}</button>`).join('')}${cosAsk ? `<button class="go" data-a="restart-cos">Restart COS${esc(closes)}</button>` : ''}<button data-a="close">Close</button></div></div>`;
    card.addEventListener('click', (e) => { const a = e.target && e.target.dataset && e.target.dataset.a; if (a === 'close') hide(); });
    let cosArmed = false;
    card.addEventListener('click', async (e) => { const a = e.target && e.target.dataset && e.target.dataset.a; if (!a || !(a.startsWith('restart:') || a === 'restart-cos')) return;
      if (a === 'restart-cos' && !cosArmed) { cosArmed = true; e.target.textContent = `Confirm: restart COS now${closes}`; return; }
      const name = a === 'restart-cos' ? 'cos' : a.slice(8); e.target.disabled = true; e.target.textContent = 'Restarting…';
      try { const x = await post('/api/cos/update/restart', { by: 'person', what: name }); e.target.textContent = x && x.ok === false ? `Refused: ${x.error}` : name === 'cos' ? 'COS is restarting: it comes back by itself' : `${name} restarted`; } catch (err) { e.target.textContent = `Failed: ${err.message}`; } });
    document.body.appendChild(card);
  }

  async function poll() {
    let n; try { const r = await fetch(BASE + API, { cache: 'no-store' }); n = await r.json(); } catch (_) { return; }   // the door down: nothing to say here, the page says it
    if (!n || n.ok === false || !n.show) { hide(); return; }
    let until = 0; try { until = Number(localStorage.getItem(key(n))) || 0; } catch (_) {}
    if (until > Date.now()) return;
    if (TOOL === 'cos' && (n.kind === 'available' || n.kind === 'blocked')) return tool(n);   // CE4: the update tool on the card
    show(n);
  }
  window.NexusUpdatePopup = { poll, show, hide, tool, done };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll); else poll();
  setInterval(() => { if (!document.hidden) poll(); }, EVERY_MS);
})();
