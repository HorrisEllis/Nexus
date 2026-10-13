// idearium/ui/js/repo-notes.js — 0.60.6. A repo's Notes tab: write it down before it is lost.
// James, 2026-10-13: "this is what i mean by i need to be able to log these somewhere, its too much. like can we have a
// notes or something section for the repos so i can note all of this down? im out of ideas"
// One box at the top: type, Enter saves (Shift+Enter for a new line). Pick what it is (note · idea · decision · todo ·
// question · quote) or leave it a note. Below: search, filter by kind, this repo or every repo. Each note: ★ pin, ✓ done
// (a todo ticked, a question answered), edit in place, archive (never deleted). Agents write here too; the line says who.
(function () {
  'use strict';
  const KINDS = ['note', 'idea', 'decision', 'todo', 'question', 'quote'];
  const ICON = { note: '✎', idea: '✦', decision: '⚑', todo: '☐', question: '?', quote: '❝' };
  const S = { kind: 'note', filter: '', q: '', scope: 'repo', repo: null };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };

  function shell(panel) {
    panel.innerHTML = `
      <div class="nt-wrap">
        <div class="nt-capture">
          <textarea id="nt-box" rows="3" placeholder="Write it down — Enter saves, Shift+Enter for a new line"></textarea>
          <div class="nt-row">
            ${KINDS.map(k => `<button class="nt-kind${k === S.kind ? ' on' : ''}" data-kind="${k}" title="${k}">${ICON[k]} ${k}</button>`).join('')}
            <input id="nt-tags" placeholder="tags, comma separated" autocomplete="off">
            <button id="nt-save" class="modal-btn confirm">save</button>
          </div>
        </div>
        <div class="nt-row nt-tools">
          <input id="nt-q" placeholder="search notes…" autocomplete="off" value="${esc(S.q)}">
          <select id="nt-filter"><option value="">every kind</option>${KINDS.map(k => `<option value="${k}"${k === S.filter ? ' selected' : ''}>${k}</option>`).join('')}<option value="done">done</option><option value="archived">archived</option></select>
          <select id="nt-scope"><option value="repo"${S.scope === 'repo' ? ' selected' : ''}>this repo</option><option value="all"${S.scope === 'all' ? ' selected' : ''}>every repo</option></select>
          <span id="nt-count" class="nt-dim"></span>
        </div>
        <div id="nt-list" class="nt-list"></div>
      </div>`;
    const box = panel.querySelector('#nt-box');
    panel.querySelectorAll('.nt-kind').forEach(b => b.addEventListener('click', () => { S.kind = b.dataset.kind; panel.querySelectorAll('.nt-kind').forEach(x => x.classList.toggle('on', x === b)); box.focus(); }));
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
    panel.querySelector('#nt-save').addEventListener('click', save);
    let t = null;
    panel.querySelector('#nt-q').addEventListener('input', (e) => { S.q = e.target.value; clearTimeout(t); t = setTimeout(load, 200); });
    panel.querySelector('#nt-filter').addEventListener('change', (e) => { S.filter = e.target.value; load(); });
    panel.querySelector('#nt-scope').addEventListener('change', (e) => { S.scope = e.target.value; load(); });
  }

  async function save() {
    const box = document.getElementById('nt-box'); if (!box) return;
    const text = box.value.trim(); if (!text) return;
    const tags = (document.getElementById('nt-tags') || {}).value || '';
    try {
      await api(`/api/repos/${S.repo}/notes`, { method: 'POST', body: JSON.stringify({ body: text, kind: S.kind, tags }) });
      box.value = ''; say(`${S.kind} saved`, 'ok'); load();
    } catch (e) { say(`not saved: ${e.message}`, 'err'); }
  }

  async function patch(id, change) {
    try { await api(`/api/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) }); load(); }
    catch (e) { say(e.message, 'err'); }
  }

  async function load() {
    const list = document.getElementById('nt-list'); if (!list || !S.repo) return;
    const qs = [S.q ? `q=${encodeURIComponent(S.q)}` : '', S.filter && KINDS.includes(S.filter) ? `kind=${S.filter}` : '', S.filter === 'done' || S.filter === 'archived' ? `status=${S.filter}` : ''].filter(Boolean).join('&');
    let d;
    try { d = S.scope === 'all' ? await api(`/api/notes?scope=all${qs ? `&${qs}` : ''}`) : await api(`/api/repos/${S.repo}/notes${qs ? `?${qs}` : ''}`); }
    catch (e) { list.innerHTML = `<div class="nt-dim">${esc(e.message)}</div>`; return; }
    const notes = d.notes || [], names = d.names || {};
    document.getElementById('nt-count').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
    list.innerHTML = notes.length ? notes.map(n => `
      <div class="nt-item${n.status === 'done' ? ' done' : ''}${n.pinned ? ' pinned' : ''}" data-id="${esc(n.id)}">
        <div class="nt-head">
          <span class="nt-k nt-k-${esc(n.kind)}">${ICON[n.kind] || '✎'} ${esc(n.kind)}</span>
          <b class="nt-title">${esc(n.title)}</b>
          <span class="nt-dim">${S.scope === 'all' ? `${esc(n.repoUuid ? (names[n.repoUuid] || n.repoUuid.slice(0, 8)) : 'no repo')} · ` : ''}${esc(n.source || '')} · ${ago(n.updatedAt || n.createdAt)}</span>
          <span class="nt-acts">
            <button data-a="pin" title="${n.pinned ? 'unpin' : 'pin to the top'}">${n.pinned ? '★' : '☆'}</button>
            <button data-a="done" title="${n.status === 'done' ? 'reopen' : 'done'}">${n.status === 'done' ? '↺' : '✓'}</button>
            <button data-a="edit" title="edit">✎</button>
            <button data-a="archive" title="${n.status === 'archived' ? 'bring back' : 'archive (kept, hidden)'}">${n.status === 'archived' ? '⤒' : '⌫'}</button>
          </span>
        </div>
        ${n.body && n.body !== n.title ? `<div class="nt-body">${esc(n.body)}</div>` : ''}
        ${(n.tags || []).length ? `<div class="nt-tags">${n.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`).join('') : `<div class="nt-dim">${S.q || S.filter ? 'nothing matches' : 'no notes yet — write the first one above'}</div>`;
    list.querySelectorAll('.nt-item').forEach(el => {
      const id = el.dataset.id, n = notes.find(x => x.id === id);
      el.querySelectorAll('.nt-acts button').forEach(b => b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'pin') patch(id, { pinned: !n.pinned });
        else if (a === 'done') patch(id, { status: n.status === 'done' ? 'open' : 'done' });
        else if (a === 'archive') patch(id, { status: n.status === 'archived' ? 'open' : 'archived' });
        else if (a === 'edit') edit(el, n);
      }));
    });
  }

  function edit(el, n) {
    const body = el.querySelector('.nt-body') || el.appendChild(Object.assign(document.createElement('div'), { className: 'nt-body' }));
    body.innerHTML = `<textarea rows="5" class="nt-edit">${esc(n.body)}</textarea><div class="nt-row"><button class="modal-btn confirm">save</button><button class="modal-btn">cancel</button></div>`;
    const [ok, cancel] = body.querySelectorAll('button');
    ok.addEventListener('click', () => patch(n.id, { body: body.querySelector('textarea').value }));
    cancel.addEventListener('click', load);
    body.querySelector('textarea').focus();
  }

  window.renderRepoNotes = function (repo) {
    const panel = document.getElementById('repo-subtab-notes');
    if (!panel || !repo) return;
    if (S.repo !== repo.uuid || !panel.querySelector('#nt-box')) { S.repo = repo.uuid; shell(panel); }
    load();
  };
})();
