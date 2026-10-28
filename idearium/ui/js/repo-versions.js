// idearium/ui/js/repo-versions.js — 0.60.7. The Versionium tab's index: every version of a repo in one place.
// James, 2026-10-13: "i want real versions with the versionium tab. like a full index of versions, versions, revisions
// from the work surface, diffs, backups/snapshots, etc. like full management system for versionium backend, then with the
// api, expand the idearium ui repo tab."
// Reads GET /api/repos/:uuid/versions (lib/repo-history.js). Filter by kind; pick A and B on any two rows and compare
// (or one against the files on disk now); open a version to see its files, diff one against now, or put it back; drop
// zips to import the project's past (a zip with its .git gives every commit; several zips become one version each).
(function () {
  'use strict';
  const KINDS = ['snapshot', 'backup', 'history', 'staging', 'revision', 'branch'];
  const ICON = { snapshot: '◉', backup: '⛨', history: '⟲', staging: '◌', revision: '✎', branch: '⑂' };
  const S = { repo: null, kind: '', a: null, b: null, open: null, shown: 80, data: null };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = (m, k) => { if (typeof toast === 'function') toast(m, k); };
  const when = (t) => { if (!t) return ''; const d = new Date(t); return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`; };
  const $ = (id) => document.getElementById(id);

  function patchHtml(p) {
    return `<pre class="vx-patch">${esc(p).split('\n').map(l => l.startsWith('+') && !l.startsWith('+++') ? `<span class="vx-add">${l}</span>` : l.startsWith('-') && !l.startsWith('---') ? `<span class="vx-del">${l}</span>` : l.startsWith('@@') ? `<span class="vx-hunk">${l}</span>` : l).join('\n')}</pre>`;
  }

  async function renderVersionIndex(repoUuid) {
    const el = $('ver-index');
    if (!el) return;
    if (S.repo !== repoUuid) Object.assign(S, { repo: repoUuid, kind: '', a: null, b: null, open: null, shown: 80, data: null });
    el.innerHTML = `<div class="detail-empty">reading every version…</div>`;
    try { S.data = await api(`/api/repos/${repoUuid}/versions`, {}, 30000); }
    catch (e) { el.innerHTML = `<div class="ds"><div class="ds-label">every version</div><div class="ds-mono">could not read versions: ${esc(e.message)}</div></div>`; return; }
    if (S.repo !== repoUuid) return;
    draw();
  }

  function draw() {
    const el = $('ver-index');
    if (!el || !S.data) return;
    const d = S.data, c = d.counts || {};
    const list = (d.entries || []).filter(e => !S.kind || e.kind === S.kind);
    const pick = (e, side) => e.kind === 'revision' ? '' : `<button class="vx-pick${S[side] === e.id ? ' on' : ''}" title="compare: ${side.toUpperCase()}" onclick="event.stopPropagation();pickVersion('${side}','${esc(e.id)}')">${side.toUpperCase()}</button>`;
    const row = (e) => `<div class="vx-row${S.open === e.id ? ' open' : ''}" onclick="openVersion('${esc(e.id)}')">
        <span class="vx-k vx-${e.kind}" title="${e.kind}">${ICON[e.kind] || '·'}</span>
        <span class="vx-when">${esc(when(e.at))}</span>
        <span class="vx-msg">${esc(e.message || '(no message)')}${e.kind === 'revision' ? ` <span class="vx-dim">${esc(e.status)}</span>` : ''}</span>
        <span class="vx-dim">${e.fileCount != null ? `${e.fileCount} files` : ''}${e.who ? ` · ${esc(e.who)}` : ''}</span>
        <span class="vx-picks">${pick(e, 'a')}${pick(e, 'b')}</span>
      </div>`;
    el.innerHTML = `<div class="ds vx">
      <div class="ds-label">every version · ${(d.entries || []).length}</div>
      <div class="vx-tools">
        <button class="vx-chip${!S.kind ? ' on' : ''}" onclick="filterVersions('')">all</button>
        ${KINDS.filter(k => c[k]).map(k => `<button class="vx-chip${S.kind === k ? ' on' : ''}" onclick="filterVersions('${k}')">${ICON[k]} ${k} ${c[k]}</button>`).join('')}
        <span class="vx-grow"></span>
        <button class="action-btn" ${S.a ? '' : 'disabled'} onclick="compareVersions()">compare ${S.a ? 'A' : '…'} → ${S.b ? 'B' : 'files now'}</button>
        <button class="action-btn" onclick="document.getElementById('vx-hist-input').click()">⟲ import history…</button>
        <input id="vx-hist-input" type="file" accept=".zip" multiple style="display:none" onchange="importRepoHistory(this.files)">
      </div>
      <div id="vx-drop" class="vx-drop">drop a project zip with its .git (every commit becomes a version) — or several zips of one project (one version each, in order) — or a Nexus change pack (nexus-change.json) to apply it</div>
      <div id="vx-hist"></div>
      <div class="vx-list">${list.slice(0, S.shown).map(row).join('') || '<div class="vx-dim" style="padding:8px">nothing of this kind yet</div>'}</div>
      ${list.length > S.shown ? `<button class="vx-more" onclick="moreVersions()">show ${Math.min(200, list.length - S.shown)} more of ${list.length - S.shown}</button>` : ''}
      <div id="vx-detail"></div>
    </div>`;
    const drop = $('vx-drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag'); importRepoHistory(e.dataTransfer.files); });
  }

  function filterVersions(k) { S.kind = k; S.shown = 80; draw(); }
  function moreVersions() { S.shown += 200; draw(); }
  function pickVersion(side, id) { S[side] = S[side] === id ? null : id; draw(); }

  async function compareVersions(a, b, onlyPath) {
    a = a || S.a; b = b || S.b || 'working';
    const out = $('vx-detail');
    if (!a || !out) return;
    out.innerHTML = `<div class="detail-empty">comparing…</div>`;
    let d;
    try { d = await api(`/api/repos/${S.repo}/versions/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${onlyPath ? `&path=${encodeURIComponent(onlyPath)}` : ''}`, {}, 60000); }
    catch (e) { out.innerHTML = `<div class="ds-mono">${esc(e.message)}</div>`; return; }
    const name = (x) => x === 'working' ? 'the files now' : x;
    out.innerHTML = `<div class="ds"><div class="ds-label">${esc(name(a))} → ${esc(name(b))} · ${d.counts.added} added · ${d.counts.removed} removed · ${d.counts.changed} changed</div>
      ${d.files.map(f => `<details class="vx-file"${d.files.length <= 3 ? ' open' : ''}><summary><span class="vx-st vx-st-${f.status}">${f.status}</span> ${esc(f.path)}</summary>${f.patch ? patchHtml(f.patch) : `<div class="vx-dim">${esc(f.note || '')}${f.note && /path=/.test(f.note) ? ` <button class="vx-more" onclick="compareVersions('${esc(a)}','${esc(b)}','${esc(f.path)}')">show this one</button>` : ''}</div>`}</details>`).join('') || '<div class="vx-dim">the same files</div>'}
    </div>`;
  }

  async function openVersion(id) {
    S.open = S.open === id ? null : id; draw();
    if (!S.open) return;
    const e = (S.data.entries || []).find(x => x.id === id);
    const out = $('vx-detail');
    if (!e || !out) return;
    if (e.kind === 'revision') {
      out.innerHTML = `<div class="ds"><div class="ds-label">revision · ${esc(e.status)} · ${esc(e.path)}</div><div class="ds-mono">${esc(e.message)} by ${esc(e.who || '?')} — ${esc(when(e.at))}\nThe work surface (Code tab) holds its before and after; applied revisions are also in the snapshots that follow them.</div></div>`;
      return;
    }
    out.innerHTML = `<div class="detail-empty">reading its files…</div>`;
    let t;
    try { t = await api(`/api/repos/${S.repo}/versions/tree?commitId=${encodeURIComponent(id)}`, {}, 30000); }
    catch (err) { out.innerHTML = `<div class="ds-mono">${esc(err.message)}</div>`; return; }
    const imp = e.imported;
    out.innerHTML = `<div class="ds"><div class="ds-label">${esc(e.kind)} · ${esc(id)} · ${(t.files || []).length} files</div>
      <div class="ds-mono">${esc(e.message)}${imp ? `\n${esc(imp.source)} ${esc(imp.originalId || '')}${imp.author ? ` · ${esc(imp.author)}` : ''} · ${esc(String(imp.date || '').slice(0, 19))}${imp.zip ? ` · from ${esc(imp.zip)}` : ''}` : ''}</div>
      <div class="vx-tools"><button class="action-btn" onclick="compareVersions('${esc(id)}','working')">compare with the files now</button></div>
      <div class="vx-files">${(t.files || []).map(f => `<div class="vx-frow"><span>${esc(f.path)}</span><span class="vx-dim">${f.bytes} b</span>
        <button class="vx-more" onclick="compareVersions('${esc(id)}','working','${esc(f.path)}')">diff now</button>
        <button class="vx-more" onclick="restoreVersionFile('${esc(id)}','${esc(f.path)}')">put back</button></div>`).join('')}</div>
    </div>`;
  }

  async function restoreVersionFile(commitId, p) {
    if (!confirm(`Put ${p} back as it was at ${commitId}?\nThe change is itself versioned, so it can be undone.`)) return;
    try { const r = await api(`/api/repos/${S.repo}/versions/restore-file`, { method: 'POST', body: JSON.stringify({ commitId, path: p }) }, 30000); say(`${r.path} put back (${r.bytes} bytes)`, 'ok'); }
    catch (e) { say(`could not put ${p} back: ${e.message}`, 'err'); }
  }

  const b64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(file); });

  async function importRepoHistory(fileList, opts = {}) {
    const files = [...(fileList || [])].filter(f => /\.zip$/i.test(f.name));
    const out = $('vx-hist');
    if (!files.length || !out) { say('drop .zip files', 'err'); return; }
    out.innerHTML = `<div class="detail-empty">reading ${files.length} zip(s)…</div>`;
    const zips = [];
    for (const f of files) zips.push({ name: f.name, contentBase64: await b64(f) });
    S.pending = zips;
    let d;
    try { d = await api(`/api/repos/${S.repo}/history/import`, { method: 'POST', body: JSON.stringify({ zips, dryRun: true }) }, 300000); }
    catch (e) { out.innerHTML = `<div class="ds-mono">${esc(e.message)}</div>`; return; }
    if (d.changePack) return showChangePack(d, out);
    const sec = d.secrets || [];
    out.innerHTML = `<div class="ds"><div class="ds-label">history to import · ${d.wouldImport} new version(s) of ${d.versions.length}</div>
      <div class="vx-list">${d.versions.map(v => `<div class="vx-row${v.skipped ? ' vx-skip' : ''}"><span class="vx-k">${v.source === 'git' ? '⟲' : '▣'}</span><span class="vx-when">${esc(String(v.date || '').slice(0, 10))}</span><span class="vx-msg">${esc(v.message)}</span><span class="vx-dim">${v.files} files${v.tooLarge ? ` · ${v.tooLarge} too large` : ''}${v.skipped ? ` · ${esc(v.skipped)}` : ''}</span></div>`).join('')}</div>
      ${sec.length ? `<div class="ds-mono vx-warn">${sec.length} possible credential(s) in this history — nothing is stored until you decide:\n${sec.slice(0, 12).map(s => `${esc(s.path)}:${s.line} ${esc(s.kind)} (${esc(s.hint)}) in "${esc(s.version)}"`).join('\n')}</div>` : ''}
      <div class="vx-tools">
        ${d.wouldImport ? `<button class="action-btn" onclick="confirmHistoryImport(${sec.length ? 'true' : 'false'})">${sec.length ? 'import, keeping them in the history' : `import ${d.wouldImport} version(s)`}</button>` : '<span class="vx-dim">nothing new to import</span>'}
        <button class="vx-more" onclick="document.getElementById('vx-hist').innerHTML=''">cancel</button>
      </div></div>`;
  }

  // 0.60.225 — James: "like i can drag it into the versionium tab and import". A change pack (a zip with nexus-change.json) is a change to
  // Nexus itself: what it would write, per system, against the files on this machine; a file changed here since its base is a conflict and
  // nothing is written. Apply goes through the gate; each apply rolls back by its id.
  function showChangePack(d, out) {
    const m = d.manifest || {}, c = d.check || { systems: {}, counts: {}, errors: [] };
    const rows = Object.entries(c.systems).map(([sys, s]) => `<div class="vx-row"><span class="vx-k">▣</span><span>${esc(sys)}</span><span class="vx-dim">${s.apply.length} to write · ${s.already.length} already here${s.conflicts.length ? ` · <b>${s.conflicts.length} conflict(s)</b>` : ''}</span></div>`
      + s.conflicts.map(x => `<div class="vx-row vx-skip"><span class="vx-k">!</span><span>${esc(x.path)}</span><span class="vx-dim">${esc(x.why)}</span></div>`).join('')).join('');
    out.innerHTML = `<div class="ds"><div class="ds-label">change to Nexus${m.version ? ` · ${esc(m.version)}` : ''} · ${m.files} file(s) · ${esc(String(m.from || '').slice(0, 8))}..${esc(String(m.to || '').slice(0, 8))}</div>
      <div class="vx-list">${rows}</div>
      ${(c.errors || []).length ? `<div class="ds-mono vx-warn">${c.errors.map(esc).join('\n')}</div>` : ''}
      <div class="vx-tools">
        ${c.ok && c.counts.apply ? `<button class="action-btn" onclick="applyChangePack()">apply ${c.counts.apply} file(s) through the gate</button>` : `<span class="vx-dim">${c.ok ? 'every file is already here — nothing to apply' : 'not applicable as it stands: nothing will be written'}</span>`}
        <button class="vx-more" onclick="document.getElementById('vx-hist').innerHTML=''">cancel</button>
      </div></div>`;
  }
  async function applyChangePack() {
    const out = $('vx-hist'); if (!S.pending) return;
    out.innerHTML = `<div class="detail-empty">applying through the gate…</div>`;
    let d; try { d = await api(`/api/repos/${S.repo}/history/import`, { method: 'POST', body: JSON.stringify({ zips: S.pending, applyPack: true }) }, 300000); }
    catch (e) { out.innerHTML = `<div class="ds-mono">${esc(e.message)}</div>`; return; }
    const a = (d.applied && d.applied.applies) || [];
    out.innerHTML = `<div class="ds"><div class="ds-label">applied · ${a.reduce((n, x) => n + x.files, 0)} file(s) in ${a.length} system(s)${d.applied && d.applied.skipped ? ` · ${d.applied.skipped} already here` : ''} — restart the system(s) that changed</div>
      <div class="vx-list">${a.map(x => `<div class="vx-row"><span class="vx-k">✓</span><span>${esc(x.system)} · ${x.files} file(s)</span><span class="vx-dim">${esc(x.applyId)}</span><button class="vx-more" onclick="rollbackApply('${esc(x.applyId)}')">roll back</button></div>`).join('')}</div></div>`;
    say('change applied through the gate', 'ok'); S.pending = null;
  }
  async function rollbackApply(id) {
    if (!confirm(`Roll back ${id}? Its files go back to what they were before it.`)) return;
    try { await api(`/api/nexus-self/applies/${encodeURIComponent(id)}/rollback`, { method: 'POST', body: '{}' }, 60000); say(`${id} rolled back`, 'ok'); }
    catch (e) { say(e.message, 'err'); }
  }

  async function confirmHistoryImport(withSecrets) {
    if (withSecrets && !confirm('Keep the possible credentials in this repo\'s history? (Rotate any that are real — they were already in the project.)')) return;
    const out = $('vx-hist');
    out.innerHTML = `<div class="detail-empty">importing…</div>`;
    try {
      const r = await api(`/api/repos/${S.repo}/history/import`, { method: 'POST', body: JSON.stringify({ zips: S.pending, allowSecrets: !!withSecrets }) }, 600000);
      say(`${r.imported} version(s) imported into ${r.branch}`, 'ok');
      out.innerHTML = '';
      S.pending = null; S.kind = 'history';
      renderVersionIndex(S.repo);
    } catch (e) { out.innerHTML = `<div class="ds-mono">${esc(e.message)}</div>`; }
  }

  // 0.60.7 PL4 — the Debug tab's button: run the import checks now and write what they find as the repo's notes
  async function runIntegrity(repoUuid) {
    try {
      const r = await api(`/api/repos/${repoUuid}/integrity`, { method: 'POST', body: '{}' }, 180000);
      const bad = r.checks.filter(c => !c.ok);
      say(bad.length ? `import checks: ${bad.map(c => `${c.id} ${c.count}`).join(', ')} — written in Notes` : 'import checks: all clean', bad.length ? 'warn' : 'ok');
    } catch (e) { say(`import checks did not run: ${e.message}`, 'err'); }
  }

  Object.assign(window, { renderVersionIndex, filterVersions, moreVersions, pickVersion, compareVersions, openVersion, restoreVersionFile, importRepoHistory, confirmHistoryImport, runIntegrity, applyChangePack, rollbackApply });
})();
