'use strict';
/**
 * renderer/shell/downloads.js — the ⬇ button and panel, like Firefox's (BS5, 0.60.179). Spec: clear-glass/spec/browser-shell.spec
 * MOD-BSH-DOWNLOADS. comp_id: cg.renderer.shell.downloads
 *
 * Ordinary downloads (cg.downloads.list) with Show in folder, and — from Snowflake windows — the quarantine (/cli/net/quarantine, the
 * compartment download manager, CD2): files wait there until Release; magnets wait until Send to qBittorrent, which verifies first (CD3).
 * The same routes Settings → Network uses, so there is one behaviour. The button turns while anything is in progress.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const UI = () => window.CGShellUI;
  const BRIDGE = 'http://127.0.0.1:7702';
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const mb = (n) => n ? `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB` : '';
  const ICON = (name, kind) => kind === 'magnet' ? '🧲' : /\.(zip|7z|rar|tar|gz)$/i.test(name) ? '🗜' : /\.(png|jpe?g|gif|webp|svg)$/i.test(name) ? '🖼' : /\.(pdf)$/i.test(name) ? '📕' : /\.(exe|msi|dmg|appimage|deb|sh|bat)$/i.test(name) ? '⚙' : '📄';

  async function net(path, body) {
    const res = await fetch(BRIDGE + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const j = await res.json().catch(() => ({})); if (!res.ok || j.ok === false) throw new Error(j.error || `HTTP ${res.status}`); return j;
  }

  async function open() {
    const pop = $('sh-downloads-panel'); const btn = $('btn-downloads');
    let list = [], q = null, qErr = null;
    try { const r = await cg().downloads.list(); list = Array.isArray(r) ? r : (r && r.items) || []; } catch (_) {}
    try { q = await net('/cli/net/quarantine'); } catch (e) { qErr = e.message; }
    const qItems = ((q && q.items) || []).filter(x => !['released', 'discarded'].includes(x.state));
    const dlRows = list.slice(0, 12).map(d => `
      <div class="sh-dl-row"><span class="sh-dl-ico">${ICON(d.filename)}</span>
        <div style="min-width:0"><div class="sh-dl-name" title="${esc(d.savePath || d.filename)}">${esc(d.filename)}</div><div class="sh-dl-meta">${esc(d.state)}${d.bytes ? ' · ' + mb(d.bytes) : ''}</div></div>
        <div class="sh-dl-acts">${d.savePath && d.state === 'completed' ? `<button class="sh-btn" data-folder="${esc(d.id)}" title="Show in folder">📂</button>` : ''}<button class="sh-btn" data-clear="${esc(d.id)}" title="Remove from list">✕</button></div></div>`).join('');
    const qRows = qItems.map(x => `
      <div class="sh-dl-row" data-q="${esc(x.id)}"><span class="sh-dl-ico">${ICON(x.filename, x.kind)}</span>
        <div style="min-width:0"><div class="sh-dl-name" title="${esc(x.url)}">${esc(x.filename)}</div><div class="sh-dl-meta">${esc(x.state)}${x.bytes ? ' · ' + mb(x.bytes) : ''}${x.via ? ' · ' + esc(x.via) : ''}</div></div>
        <div class="sh-dl-acts">
          ${x.kind === 'file' && x.state === 'quarantined' ? '<button class="sh-btn primary" data-release>Release</button>' : ''}
          ${x.kind === 'magnet' && x.state === 'quarantined' ? '<button class="sh-btn primary" data-handoff title="Only if qBittorrent sends peers through a non-Tor proxy or your VPN">qBittorrent</button><button class="sh-btn" data-copy title="Copy the magnet link">⧉</button>' : ''}
          <button class="sh-btn danger" data-discard title="Discard (kept in the quarantine’s archive)">✕</button></div></div>`).join('');
    pop.innerHTML = `<div class="sh-pop-head">⬇ <span>Downloads</span><span class="sh-grow"></span></div>
      ${dlRows || '<div class="sh-empty">No downloads yet.</div>'}
      <div class="sh-group">❄ Snowflake quarantine</div>
      <div class="sh-q-note">What a Snowflake window downloads waits here until you release it; magnet links it met are listed, never opened.</div>
      ${qErr ? `<div class="sh-empty">The quarantine could not be read (${esc(qErr)}).</div>` : qRows || '<div class="sh-empty">Nothing in quarantine.</div>'}
      <div class="sh-pop-foot"><button class="sh-link" data-library>📚&nbsp;&nbsp;Show all downloads</button><button class="sh-link" data-network>❄&nbsp;&nbsp;Snowflake download settings…</button></div>`;
    pop.querySelectorAll('[data-folder]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); cg().downloads.openFolder(b.dataset.folder); }));
    pop.querySelectorAll('[data-clear]').forEach(b => b.addEventListener('click', async (e) => { e.stopPropagation(); await cg().downloads.clearItem(b.dataset.clear).catch(() => {}); open(); }));
    pop.querySelectorAll('[data-q]').forEach(row => {
      const id = row.dataset.q; const x = qItems.find(i => i.id === id);
      const act = (sel, fn) => { const b = row.querySelector(sel); if (b) b.addEventListener('click', async (e) => { e.stopPropagation(); try { await fn(); } catch (err) { UI().toast(err.message); } open(); }); };
      act('[data-release]', async () => { const r = await net('/cli/net/quarantine/release', { id }); UI().toast(`Released to ${r.path}`); });
      act('[data-handoff]', async () => { const r = await net('/cli/net/magnet/handoff', { id }); UI().toast(`Sent to qBittorrent (${r.path})`); });
      act('[data-discard]', () => net('/cli/net/quarantine/discard', { id }));
      act('[data-copy]', async () => { await navigator.clipboard.writeText(x.url); UI().toast('Magnet link copied'); });
    });
    pop.querySelector('[data-library]').addEventListener('click', () => { UI().close(); window.CGShell && window.CGShell.library('downloads'); });
    pop.querySelector('[data-network]').addEventListener('click', () => { UI().close(); cg().window.openSettings('network'); });
    if (UI().current() !== pop) UI().show(pop, btn);
  }

  async function tick() {
    let busy = false;
    try { const r = await cg().downloads.list({ state: 'in_progress' }); busy = (Array.isArray(r) ? r : (r && r.items) || []).some(d => d.state === 'in_progress'); } catch (_) {}
    const ring = document.querySelector('#btn-downloads .sh-ring'); if (ring) ring.hidden = !busy;
  }

  function mount() {
    const btn = $('btn-downloads'); if (!btn) return;
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (UI().current() === $('sh-downloads-panel')) return UI().close(); open(); });
    setInterval(tick, 2500); tick();
  }
  window.CGDownloads = { open, mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
