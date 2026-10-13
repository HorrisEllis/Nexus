// idearium/ui/js/components-panel.js — 0.60.5. Bring in → DECOMPOSE INTO COMPONENTS.
// James, 2026-10-13: "i want to be able to copy projects and decompose them into components for the component store
// with the dependancies zipped together in a organized structured way. like make a tool for it, as well as a way to drag
// and drop zips to do it automatically."
// Drop one or more .zip files (or choose them): each is decomposed at once (POST /api/components/decompose — every code
// file a component, its requires resolved, its npm packages named), one line per project says what came of it. Below, the
// store: search it, and "⬇ bundle" downloads a component with everything it requires as one zip
// (GET /api/components/:id/bundle — files at their project paths, component.json, package.json, README).
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = (msg, kind) => { if (typeof toast === 'function') toast(msg, kind); };

  function _b64(file) {
    return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = reject; r.readAsDataURL(file); });
  }

  function _line(html) { const d = document.createElement('div'); d.className = 'cmp-line'; d.innerHTML = html; $('cmp-results').prepend(d); return d; }

  async function decomposeFiles(files) {
    const zips = [...files].filter(f => /\.zip$/i.test(f.name));
    if (!zips.length) return say('drop .zip files — a project zipped', 'err');
    for (const f of zips) {
      const row = _line(`<b>${esc(f.name)}</b> <span class="cmp-dim">reading…</span>`);
      try {
        const contentBase64 = await _b64(f);
        row.innerHTML = `<b>${esc(f.name)}</b> <span class="cmp-dim">decomposing…</span>`;
        const r = await api('/api/components/decompose', { method: 'POST', body: JSON.stringify({ filename: f.name, contentBase64 }) }, 10 * 60000);
        const s = r.stats || {};
        row.innerHTML = `<b>${esc(r.project)}</b> — ${s.components} component(s), ${s.created} new`
          + `${s.unresolved ? ` · <span class="cmp-warn">${s.unresolved} unresolved imports</span>` : ''}${s.skipped ? ` · <span class="cmp-dim">${s.skipped} skipped</span>` : ''}`
          + `${(r.npm || []).length ? `<div class="cmp-dim">npm: ${esc(r.npm.join(', '))}</div>` : ''}`;
        say(`${r.project}: ${s.components} component(s) in the store`, 'ok');
      } catch (e) { row.innerHTML = `<b>${esc(f.name)}</b> <span class="cmp-warn">not decomposed: ${esc(e.message)}</span>`; }
    }
    search();
  }

  async function search() {
    const q = ($('cmp-q') && $('cmp-q').value || '').trim();
    let r; try { r = await api(`/api/components${q ? `?q=${encodeURIComponent(q)}&limit=60` : ''}`); } catch (e) { $('cmp-list').innerHTML = `<div class="cmp-warn">${esc(e.message)}</div>`; return; }
    const list = (r.components || []).slice(0, 200);
    $('cmp-count').textContent = r.stats ? `${r.stats.components} in the store` : '';
    $('cmp-list').innerHTML = list.length ? list.map(c => `<div class="cmp-row"><span class="cmp-id">${esc(c.id)}</span><span class="cmp-dim">${esc(c.path || '')}${c.latest ? ` @${esc(c.latest)}` : ''}</span>`
      + `<a class="modal-btn cmp-dl" href="${esc(API_BASE)}/api/components/${encodeURIComponent(c.id)}/bundle" download title="this component and everything it requires, as one zip">⬇ bundle</a></div>`).join('')
      : '<div class="cmp-dim">nothing stored yet — drop a project zip above</div>';
  }

  window.openComponentsModal = function () {
    $('components-modal').classList.add('open');
    search();
  };
  window.closeComponentsModal = function () { $('components-modal').classList.remove('open'); };

  document.addEventListener('DOMContentLoaded', () => {
    const zone = $('cmp-drop'), input = $('cmp-file');
    if (!zone || !input) return;
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files.length) decomposeFiles(input.files); input.value = ''; });
    ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) decomposeFiles(e.dataTransfer.files); });
    let t = null;
    $('cmp-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 250); });
  });
})();
