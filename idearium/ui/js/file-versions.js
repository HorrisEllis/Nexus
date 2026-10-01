/* §0.39.285 (from the nexus-14 fork's 0.39.279 D0, docs/2026-10-01-work-visibility-job-reuse-phasemap.spec) — per-file version history (James: "per file versioning, add it to the manage button menu").
 * FileVersions.open(repoUuid, path): modal listing every Versionium commit that wrote this path, view any version,
 * restore it (written back through POST /api/repos/:uuid/file — the one write path, so the restore is itself versioned).
 * Hooks: (1) any Manage menu element marked [data-file-manage] or class *manage-menu* gets a "Version history" item,
 * path from data-path on it or its nearest [data-path]; (2) a "history" button on the open-file tab bar. */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const repoId = () => (typeof CURRENT_API_REPO !== 'undefined' && CURRENT_API_REPO) ? CURRENT_API_REPO.uuid : null;
  const call = (u, o, t) => (typeof api === 'function') ? api(u, o, t) : fetch(u, o).then(r => r.json());

  async function open(repoUuid, filePath) {
    repoUuid = repoUuid || repoId();
    if (!repoUuid || !filePath) return;
    document.getElementById('fv-modal')?.remove();
    const m = document.createElement('div');
    m.id = 'fv-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center';
    m.innerHTML = `<div style="background:var(--nx-panel);border:1px solid var(--nx-edge);border-radius:8px;width:min(1000px,94vw);height:min(640px,86vh);display:flex;flex-direction:column;font:12px monospace;color:var(--nx-text)">
      <div style="padding:10px 12px;border-bottom:1px solid var(--nx-edge);display:flex;gap:8px;align-items:center"><b>Version history</b><span style="opacity:.7">${esc(filePath)}</span><span style="flex:1"></span><button id="fv-x">close</button></div>
      <div style="flex:1;display:flex;min-height:0"><div id="fv-list" style="width:300px;overflow:auto;border-right:1px solid var(--nx-edge)">loading…</div>
      <div style="flex:1;display:flex;flex-direction:column;min-width:0"><div id="fv-bar" style="padding:6px 10px;border-bottom:1px solid var(--nx-edge);opacity:.8">pick a version</div>
      <pre id="fv-body" style="flex:1;margin:0;padding:10px;overflow:auto;white-space:pre-wrap"></pre></div></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m || e.target.id === 'fv-x') m.remove(); });
    const base = `/api/repos/${repoUuid}/file`;
    let r;
    try { r = await call(`${base}/versions?path=${encodeURIComponent(filePath)}`); }
    catch (e) { document.getElementById('fv-list').textContent = `versionium: ${e.message}`; return; }
    const vs = r.versions || [];
    const list = document.getElementById('fv-list');
    if (!vs.length) { list.innerHTML = '<div style="padding:10px">no versions yet — take a snapshot (Versionium tab) to start this file\'s history</div>'; return; }
    list.innerHTML = vs.map((v, i) => `<div data-i="${i}" style="padding:8px 10px;border-bottom:1px solid var(--nx-rim);cursor:pointer">
      <div>${new Date(v.wall || 0).toLocaleString()} ${i === 0 ? '<span style="color:var(--nx-ok)">latest</span>' : ''}</div>
      <div style="opacity:.65">${esc(v.kind)} · ${esc((v.commitId || '').slice(0, 10))} · ${esc((v.sha256 || '').slice(0, 8))}</div>
      <div style="opacity:.8">${esc(v.message || '')}</div></div>`).join('');
    list.onclick = async (e) => {
      const row = e.target.closest('[data-i]'); if (!row) return;
      [...list.children].forEach(c => c.style.background = ''); row.style.background = 'var(--nx-card2)';
      const v = vs[+row.dataset.i], bar = document.getElementById('fv-bar'), body = document.getElementById('fv-body');
      if (v.kind === 'deleted') { bar.textContent = 'deleted in this commit'; body.textContent = ''; return; }
      body.textContent = 'loading…';
      try {
        const c = await call(`${base}/version?path=${encodeURIComponent(filePath)}&commitId=${encodeURIComponent(v.commitId)}`);
        body.textContent = c.content;
        bar.innerHTML = `${esc(v.commitId)} · ${c.bytes}b <button id="fv-restore" style="margin-left:10px">restore this version</button>`;
        document.getElementById('fv-restore').onclick = async () => {
          if (!confirm(`Restore ${filePath} to ${v.commitId.slice(0, 10)}? The current content stays in history.`)) return;
          await call(base, { method: 'POST', body: JSON.stringify({ path: filePath, content: c.content }) });
          if (typeof toast === 'function') toast(`restored ${filePath}`, 'ok');
          m.remove();
          if (typeof openApiRepoFile === 'function' && typeof ACTIVE_API_FILE !== 'undefined' && ACTIVE_API_FILE === filePath) { API_FILE_DIRTY = false; openApiRepoFile(repoUuid, filePath); }
        };
      } catch (err) { body.textContent = `could not read this version: ${err.message}`; }
    };
  }

  function decorate(menu) {
    if (menu.querySelector('[data-fv-item]')) return;
    const holder = menu.closest('[data-path]') || menu;
    const p = menu.dataset.path || holder.dataset.path;
    if (!p) return;
    const sample = menu.querySelector('button,li,a,.menu-item');
    const it = document.createElement(sample ? sample.tagName.toLowerCase() : 'button');
    if (sample) it.className = sample.className;
    it.dataset.fvItem = '1'; it.textContent = 'Version history';
    it.addEventListener('click', (e) => { e.stopPropagation(); open(menu.dataset.repo || repoId(), p); });
    menu.appendChild(it);
  }
  const SEL = '[data-file-manage], [class*="manage-menu"], [class*="fm-menu"]';
  new MutationObserver(() => {
    document.querySelectorAll(SEL).forEach(decorate);
    const tabs = document.getElementById('ide-tabs');
    if (tabs && typeof ACTIVE_API_FILE !== 'undefined' && ACTIVE_API_FILE && !tabs.querySelector('[data-fv-tab]')) {
      const b = document.createElement('button'); b.className = 'ide-tab-btn'; b.dataset.fvTab = '1'; b.textContent = 'history';
      b.onclick = () => open(repoId(), ACTIVE_API_FILE); tabs.appendChild(b);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.FileVersions = { open };
})();
