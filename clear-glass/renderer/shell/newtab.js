'use strict';
/**
 * renderer/shell/newtab.js — the start page (BS10, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-NEWTAB.
 * comp_id: cg.renderer.shell.newtab
 *
 * A new tab was a black about:blank. This draws a start page over the page area while the tab is blank — in the shell's own DOM, never in a
 * site's page — and hides it the moment the tab goes somewhere: a search box that navigates like the address bar, Guardian's agents as
 * cards (start or open in one press), bookmarks as tiles, and Snowflake's state with Start.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const I = (n, size = 18) => (window.CGIcons ? window.CGIcons.svg(n, { size }) : '');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const BRIDGE = 'http://127.0.0.1:7702';
  const blank = (u) => !u || u === 'about:blank' || /^about:blank/.test(u);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return u; } };
  const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

  let _retry = null;
  // 0.60.211 — James: "why remove the agents from new tab?" Nothing removed them; the page read the list once, and a read that failed early in
  // the window's start (or came back empty) left the section saying "not answering" until another new tab. It now says what failed and reads
  // the agents again every 3 s while the page is open — that section only, so typing in the search box and open panels are left alone.
  async function readAgents() {
    try { const r = await (window.CGAgents ? window.CGAgents.list() : cg().providers.list()); return Array.isArray(r) ? { providers: r, listError: null } : { providers: [], listError: 'Clear Glass\'s agent list did not answer yet' }; }
    catch (e) { return { providers: [], listError: `Clear Glass's agent list did not answer: ${e.message}` }; }
  }
  function agentsHtml(providers, listError) {
    return providers.map(p => `<button class="nt-agent" data-id="${esc(p.id)}" data-running="${!!p.running}" style="--brand:${esc(p.color || 'var(--cyan)')}">
            <span class="ag-avatar">${esc((p.name || p.id).slice(0, 1))}</span><span class="nt-agent-name">${esc(p.name || p.id)}</span>
            <span class="nt-agent-state"><span class="ag-dot ${p.running ? 'ok' : 'idle'}"></span>${p.running ? 'Open' : 'Start'}</span></button>`).join('') || `<div class="sh-empty">${esc(listError || 'No agents yet')} — trying again…</div>`;
  }
  function wireAgents(el) {
    el.querySelectorAll('.nt-agent').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.id; try { b.dataset.running === 'true' ? await cg().providers.show(id) : await cg().providers.start(id, { show: true }); } catch (e) { window.CGShellUI && window.CGShellUI.toast(`${id}: ${e.message}`); }
      setTimeout(() => refreshAgents(el), 900);
    }));
  }
  async function refreshAgents(el) {
    const box = el.querySelector('.nt-agents'); if (!box || el.hidden) return;
    const { providers, listError } = await readAgents();
    box.innerHTML = agentsHtml(providers, listError); wireAgents(el); retryAgents(el, providers);
  }
  function retryAgents(el, providers) { clearTimeout(_retry); if (!providers.length) _retry = setTimeout(() => refreshAgents(el), 3000); }
  async function render() {
    const el = $('sh-newtab'); if (!el) return;
    const S = window.CGShell || {};
    const { providers, listError } = await readAgents();
    let marks = []; try { const r = await cg().bookmarks.list({ agentId: S.agentId }); marks = (Array.isArray(r) ? r : (r && r.items) || []).slice(0, 12); } catch (_) {}
    let net = null; try { net = await fetch(BRIDGE + '/cli/net/status', { signal: AbortSignal.timeout(2500) }).then(r => r.json()); } catch (_) {}
    const t = net && net.transport ? net.transport.state : null;
    el.innerHTML = `
      <div class="nt-wrap">
        <div class="nt-hello"><span class="nt-mark">${I('sparkle', 22)}</span><div><h1>${greet()}</h1><p>Clear Glass · ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div></div>
        <form class="nt-search" autocomplete="off">${I('search', 18)}<input id="nt-q" placeholder="Search the web or type an address" aria-label="Search or address" spellcheck="false"><kbd>Enter</kbd></form>
        <section class="nt-sec"><h2>Guardian agents</h2>
          <div class="nt-agents">${agentsHtml(providers, listError)}</div></section>
        ${marks.length ? `<section class="nt-sec"><h2>Bookmarks</h2><div class="nt-tiles">${marks.map(b => `<button class="nt-tile" data-url="${esc(b.url)}" title="${esc(b.url)}"><span class="nt-tile-ico">${esc((b.title || host(b.url)).slice(0, 1).toUpperCase())}</span><span class="nt-tile-name">${esc(b.title || host(b.url))}</span></button>`).join('')}</div></section>` : ''}
        <section class="nt-sec nt-row">
          <div class="nt-card"><span class="nt-card-ico">${I('snow', 20)}</span><div><b>Snowflake</b><small>${t === 'ready' ? `Connected through Tor${net.lastCheck && net.lastCheck.isTor ? ` · exits ${esc(net.lastCheck.ip)}` : ''}` : t === 'bootstrapping' || t === 'starting' ? 'Connecting…' : t ? 'Off — the bridge is set up when you start it' : 'Clear Glass\'s bridge is not answering'}</small></div>
            ${t && t !== 'ready' && t !== 'bootstrapping' && t !== 'starting' ? '<button class="sh-btn primary" data-snow>Start</button>' : ''}</div>
          <div class="nt-card"><span class="nt-card-ico">${I('terminal', 20)}</span><div><b>Floating CLI</b><small>Hidden from screen recording · Ctrl+Shift+Space</small></div><button class="sh-btn" data-cli>Open</button></div>
        </section>
      </div>`;
    const q = el.querySelector('#nt-q');
    el.querySelector('.nt-search').addEventListener('submit', (e) => { e.preventDefault(); const v = q.value.trim(); if (v && S.navigate) S.navigate(S.normalizeUrl(v)); });
    wireAgents(el);
    retryAgents(el, providers);
    el.querySelectorAll('.nt-tile').forEach(b => b.addEventListener('click', () => S.navigate && S.navigate(b.dataset.url)));
    const sb = el.querySelector('[data-snow]'); if (sb) sb.addEventListener('click', async () => { sb.disabled = true; sb.textContent = 'Starting…';
      try { const r = await fetch(BRIDGE + '/cli/net/transport', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) }).then(x => x.json()); if (r.ok === false) window.CGShellUI.toast(`Snowflake: ${r.error}`); } catch (e) { window.CGShellUI.toast(`Snowflake: ${e.message}`); }
      setTimeout(render, 1500); });
    const cb = el.querySelector('[data-cli]'); if (cb) cb.addEventListener('click', () => $('btn-float-cli') && $('btn-float-cli').click());
    setTimeout(() => { if (!el.hidden && document.activeElement !== $('url-bar')) q.focus(); }, 50);
  }

  function show() { const el = $('sh-newtab'); if (!el) return; if (el.hidden) { el.hidden = false; render(); } }
  function hide() { const el = $('sh-newtab'); if (el) el.hidden = true; }
  function sync(url) { blank(url) ? show() : hide(); }

  function mount() {
    const wv = $('wv'); if (!wv) return;
    for (const ev of ['did-navigate', 'did-navigate-in-page', 'did-start-navigation']) wv.addEventListener(ev, (e) => { if (e.isMainFrame === false) return; sync(e.url); });
    let first = ''; try { first = new URLSearchParams(location.search).get('url') || ''; } catch (_) {}
    sync(first);
  }
  window.CGNewTab = { show, hide, render, sync };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
