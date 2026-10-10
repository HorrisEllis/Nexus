/* idearium/ui/js/repo-card-time.js — §SD1 0.56.0 (docs/2026-10-10-idearium-solid-phasemap.spec): a repo's versions and
 * rewind on its own card in the Repos list.
 * James: "can you add the rewind engine controls and versioning to the repos box you click on to open it."
 *
 * Nothing new behind it: the same routes the Plan panel's versions and control views read
 * (GET /api/repos/:uuid/snapshots · /desktop · /desktop/checkpoints) and the same actions — previewRepoRestore /
 * runRepoRestore (app.js: preview first, a pre-restore snapshot, verified against disk) and rtRewind (repo-tasks.js).
 * Three lines per kind, not a second Plan panel; "all versions" opens the repo on its versions view.
 * Loaded before app.js: the card renderer reads RC_TIME. */
const RC_TIME = { open: new Set(), data: {} };   // uuid → { versions, desktop, checkpoints, err }

function _rcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _rcWhen(ts) {   // today: the time; otherwise the day — the box is narrow, the message matters more
  if (!ts) return '—';
  const d = new Date(ts), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function rcTimeToggle(uuid) {
  if (RC_TIME.open.has(uuid)) RC_TIME.open.delete(uuid);
  else { RC_TIME.open.add(uuid); rcTimeLoad(uuid); }
  if (typeof renderRepoLibrary === 'function') renderRepoLibrary();
}

async function rcTimeLoad(uuid) {
  const [v, d, c] = await Promise.all([
    api(`/api/repos/${uuid}/snapshots`, {}, 30000).catch(e => ({ error: e.message })),
    api(`/api/repos/${uuid}/desktop`, {}, 15000).catch(e => ({ error: e.message })),
    api(`/api/repos/${uuid}/desktop/checkpoints`, {}, 15000).catch(e => ({ error: e.message })),
  ]);
  RC_TIME.data[uuid] = { versions: v, desktop: d, checkpoints: c, at: Date.now() };
  const el = document.getElementById(`rct-${uuid}`);
  if (el) el.innerHTML = rcTimeHtml(uuid);
}

async function rcDesk(uuid, op) {
  try { await api(`/api/repos/${uuid}/desktop/${op}`, { method: 'POST', body: JSON.stringify(op === 'checkpoint' ? { label: 'by hand' } : {}) }, 120000); if (typeof toast === 'function') toast(`desktop ${op} — done`, 'ok'); }
  catch (e) { if (typeof toast === 'function') toast(`desktop ${op} refused: ${e.message}`, 'err'); }
  rcTimeLoad(uuid);
}

function rcAllVersions(uuid) {
  if (typeof selectApiRepo === 'function') selectApiRepo(uuid);
  setTimeout(() => { if (typeof openPlanPanel === 'function') openPlanPanel({}); if (typeof rtView === 'function') rtView('versions'); }, 300);
}

function rcTimeHtml(uuid) {
  const t = RC_TIME.data[uuid];
  if (!t || !t.at) return '<div class="rc-dim">reading versions and checkpoints…</div>';
  const vs = (t.versions && t.versions.snapshots) || [];
  const cps = (t.checkpoints && t.checkpoints.checkpoints) || [];
  const d = t.desktop || {};
  let h = '<div class="rc-sec">versions</div>';
  if (t.versions && t.versions.error) h += `<div class="rc-bad">${_rcEsc(t.versions.error)}</div>`;
  else if (!vs.length) h += '<div class="rc-dim">no versions yet — the next file change makes the first</div>';
  for (const c of vs.slice(0, 3)) {
    h += `<div class="rc-row"><span class="rc-id" title="${_rcEsc(c.commitId)}">${_rcEsc(String(c.commitId).slice(0, 8))}</span><span class="rc-dim">${_rcWhen(c.ts)}</span><span class="rc-msg" title="${_rcEsc(c.message)}">${_rcEsc(String(c.message || '').slice(0, 60))}</span><button class="rc-act" title="preview restoring this version" onclick="previewRepoRestore('${uuid}','${_rcEsc(c.commitId)}','rct-out-${uuid}')">↶</button></div>`;
  }
  if (vs.length) h += `<button class="rc-link" onclick="rcAllVersions('${uuid}')">all ${vs.length} versions →</button>`;
  h += `<div class="rc-sec">desktop <span class="rc-dim">${_rcEsc(d.state || (d.error ? 'unavailable' : '…'))}</span></div>`;
  if (d.state === 'running') h += `<div class="rc-row"><button class="rc-act" onclick="rcDesk('${uuid}','pause')">⏸ pause</button><button class="rc-act" onclick="rcDesk('${uuid}','resume')">▶ resume</button><button class="rc-act" onclick="rcDesk('${uuid}','checkpoint')">◉ checkpoint</button></div>`;
  for (const c of cps.slice(0, 3)) {
    h += `<div class="rc-row"><span class="rc-dim">${_rcWhen(c.ts)}</span><span class="rc-msg" title="${_rcEsc(c.tag)}">${_rcEsc(c.label || c.tag)}</span>${c.present === false ? '<span class="rc-bad">gone</span>' : `<button class="rc-act" title="rewind the desktop to this checkpoint" onclick="rtRewind('${_rcEsc(c.tag)}','${uuid}')">↶</button>`}</div>`;
  }
  if (!cps.length && d.state === 'running') h += '<div class="rc-dim">no checkpoints yet — one is taken before every task</div>';
  return h + `<div id="rct-out-${uuid}"></div>`;
}
