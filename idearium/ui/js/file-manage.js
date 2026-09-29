// ════════════════════════════════════════════════════════════════════════════
// §FILES — idearium/ui/js/file-manage.js (0.39.280 BS8)
// UUID: nexus-idearium-ui-file-manage-v1-0000-2026-0929-jamesbrooks-001
// Map: docs/2026-09-29-build-surface-phasemap.spec (BS8)
//
// James: "in the files page, we have a greyed out files, for pending files, that are uncommited." · "click a file in
// the files tab and have a button that says manage or something, with expand, iterate, rebuild/refactor, debug,
// anything else i need for having ai manage a single file, and possibly specific lines, using the search in the code
// tab, like agents need full context ability."
//
//   file states   GET /api/repos/:uuid/files/state → every file's state against the repo's last version (committed ·
//                 modified · new · deleted · pending = a proposal only, greyed) and its proposals / staged batches.
//                 renderApiRepoPanel (app.js) draws them; refreshed on file / inject / snapshot events.
//   Manage        the open file (or a line range: the editor's selection, or typed), one action, a note, related code
//                 from the Code tab's search (or a search here) → POST /api/repos/:uuid/manage → the repo's agent.
//                 A write action takes a Versionium snapshot first (the server refuses without one).
// ════════════════════════════════════════════════════════════════════════════

const FILESTATE = { uuid: null, states: {}, counts: null, note: null, loading: false, at: 0 };
const FS_LABEL = { committed: '', modified: 'M', new: 'N', deleted: 'D', pending: 'P' };
const FS_TITLE = { committed: 'committed — as in the last version', modified: 'modified since the last version (uncommitted)',
  new: 'new — in no version yet (uncommitted)', deleted: 'deleted since the last version', pending: 'pending — exists only as a proposal (Agent tab to approve)' };

async function loadFileStates(repo, { force = false } = {}) {
  if (!repo || !repo.uuid || FILESTATE.loading) return;
  if (!force && FILESTATE.uuid === repo.uuid && Date.now() - FILESTATE.at < 3000) return;
  FILESTATE.loading = true;
  try {
    const r = await api(`/api/repos/${repo.uuid}/files/state`, {}, 60000);
    if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
    Object.assign(FILESTATE, { uuid: repo.uuid, states: r.states || {}, counts: r.counts || null, note: r.versionNote || null, at: Date.now() });
    renderApiRepoPanel(CURRENT_API_REPO);
  } catch (_) { FILESTATE.at = Date.now(); }
  finally { FILESTATE.loading = false; }
}
function fileStateOf(path) { return FILESTATE.uuid === (CURRENT_API_REPO && CURRENT_API_REPO.uuid) ? FILESTATE.states[path] || null : null; }
/** the paths only a proposal knows (greyed rows the tree adds) */
function pendingOnlyFiles(repo) {
  if (!repo || FILESTATE.uuid !== repo.uuid) return [];
  const have = new Set((repo.files || []).map(f => f.path));
  return Object.entries(FILESTATE.states).filter(([p, s]) => s.state === 'pending' && !have.has(p)).map(([p]) => ({ path: p, bytes: 0, __pendingOnly: true }));
}
function fileStateMark(path) {
  const s = fileStateOf(path);
  if (!s) return { cls: '', mark: '' };
  const tags = [];
  if (FS_LABEL[s.state]) tags.push(`<span class="fs-tag fs-${s.state}" title="${escapeHtml(FS_TITLE[s.state])}">${FS_LABEL[s.state]}</span>`);
  if (s.pending && s.state !== 'pending') tags.push(`<span class="fs-tag fs-pending" title="${s.pending.length} proposal(s) waiting — Agent tab">P${s.pending.length > 1 ? s.pending.length : ''}</span>`);
  if (s.staged) tags.push(`<span class="fs-tag fs-staged" title="staged on repo-…@staging — promote to apply">S</span>`);
  return { cls: ` fs-row-${s.state}${s.pending ? ' fs-has-pending' : ''}`, mark: tags.join('') };
}
function fileStatesSummary() {
  const c = FILESTATE.counts; if (!c) return '';
  const bits = [['modified', c.modified], ['new', c.new], ['deleted', c.deleted], ['pending', c.pending], ['proposals', c.withProposals], ['staged', c.withStaged]].filter(([, n]) => n);
  return `${bits.map(([k, n]) => `${n} ${k}`).join(' · ') || 'everything committed'}${FILESTATE.note ? ` — ${FILESTATE.note}` : ''}`;
}

// ── Manage ───────────────────────────────────────────────────────────────────
const MANAGE_ACTIONS_UI = [
  ['expand', '⤢ expand', 'add what it is missing for its purpose'], ['iterate', '↻ iterate', 'the next improvement it most needs'],
  ['refactor', '⇄ refactor', 'same behaviour, better structure'], ['rebuild', '⟲ rebuild', 'written anew from its purpose, nothing lost'],
  ['debug', '⚑ debug', 'find and fix the real fault'], ['test', '✓ test', 'prove every behaviour'],
  ['document', '¶ document', 'header and comments, no behaviour change'], ['optimize', '⚡ optimize', 'measured, no behaviour change'],
  ['review', '⌕ review', 'hostile review — findings only'], ['explain', '? explain', 'what it does and how it connects — no changes'],
];
const MANAGE = { action: 'iterate', hits: [], picked: new Set() };

function _editorSelectionLines() {
  const ta = document.getElementById('ide-editor');
  if (!ta || ta.style.display === 'none' || ta.selectionStart === ta.selectionEnd) return null;
  const before = ta.value.slice(0, ta.selectionStart), sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const from = before.split('\n').length;
  return { from, to: from + sel.replace(/\n$/, '').split('\n').length - 1 };
}

function openManagePanel() {
  const repo = CURRENT_API_REPO;
  if (!repo || !ACTIVE_API_FILE) { toast('open a file first', 'err'); return; }
  const sel = _editorSelectionLines();
  // the Code tab's last search comes along: hits in other files are the context most worth a look
  MANAGE.hits = (typeof _codeState !== 'undefined' && _codeState.uuid === repo.uuid && Array.isArray(_codeState.hits)) ? _codeState.hits.slice(0, 20) : [];
  MANAGE.picked = new Set(MANAGE.hits.map((h, i) => (h.file !== ACTIVE_API_FILE && i < 5 ? i : -1)).filter(i => i >= 0));
  let ov = document.getElementById('manage-modal');
  if (!ov) { ov = document.createElement('div'); ov.id = 'manage-modal'; ov.className = 'modal-overlay'; ov.onclick = (e) => { if (e.target === ov) closeManagePanel(); }; document.body.appendChild(ov); }
  const st = fileStateOf(ACTIVE_API_FILE);
  ov.innerHTML = `<div class="modal manage-modal">
    <div class="modal-title">manage · <span style="color:var(--sky2)">${escapeHtml(ACTIVE_API_FILE)}</span>${st && st.state !== 'committed' ? ` <span class="fs-tag fs-${st.state}">${escapeHtml(st.state)}</span>` : ''}</div>
    <div class="manage-actions">${MANAGE_ACTIONS_UI.map(([k, l, d]) => `<button class="manage-act${MANAGE.action === k ? ' on' : ''}" data-a="${k}" title="${escapeHtml(d)}" onclick="MANAGE.action='${k}';document.querySelectorAll('.manage-act').forEach(b=>b.classList.toggle('on',b.dataset.a==='${k}'))"><b>${l}</b><span>${escapeHtml(d)}</span></button>`).join('')}</div>
    <div class="field-group"><div class="field-label">lines <span style="opacity:.6">(empty = the whole file; select text in the editor to prefill)</span></div>
      <div style="display:flex;gap:8px;align-items:center"><input class="field-input" id="mg-from" type="number" min="1" style="width:100px" placeholder="from" value="${sel ? sel.from : ''}"><span>–</span><input class="field-input" id="mg-to" type="number" min="1" style="width:100px" placeholder="to" value="${sel ? sel.to : ''}"></div></div>
    <div class="field-group"><div class="field-label">what you want (optional)</div><textarea class="field-textarea" id="mg-note" rows="3" placeholder="e.g. handle the timeout case; keep the public API"></textarea></div>
    <div class="field-group"><div class="field-label">related code — the agent reads these with its tools</div>
      <div style="display:flex;gap:6px"><input class="field-input" id="mg-q" style="flex:1" placeholder="search the repo (by meaning)" value="${escapeHtml((typeof _codeState !== 'undefined' && _codeState.q) || '')}" onkeydown="if(event.key==='Enter')manageSearch()"><button class="action-btn" onclick="manageSearch()">search</button></div>
      <div id="mg-hits" class="manage-hits"></div></div>
    <div class="modal-actions"><button class="modal-btn" onclick="closeManagePanel()">cancel</button><button class="modal-btn confirm" onclick="submitManage()">▶ send to the agent</button></div>
  </div>`;
  ov.classList.add('open');
  _paintManageHits();
}
function closeManagePanel() { const ov = document.getElementById('manage-modal'); if (ov) ov.classList.remove('open'); }
function _paintManageHits() {
  const el = document.getElementById('mg-hits'); if (!el) return;
  el.innerHTML = MANAGE.hits.length ? MANAGE.hits.map((h, i) => `<label class="manage-hit"><input type="checkbox" ${MANAGE.picked.has(i) ? 'checked' : ''} onchange="this.checked?MANAGE.picked.add(${i}):MANAGE.picked.delete(${i})">
      <span style="color:var(--sky2)">${escapeHtml(h.file)}:${h.range ? h.range.start_line : (h.line || '')}</span> ${escapeHtml(h.name || '')}${h.summary ? ` <span style="opacity:.6">— ${escapeHtml(String(h.summary).slice(0, 90))}</span>` : ''}</label>`).join('')
    : '<div class="ds-mono" style="opacity:.5">no related code picked — the agent searches for itself</div>';
}
async function manageSearch() {
  const repo = CURRENT_API_REPO; const q = (document.getElementById('mg-q') || {}).value || '';
  if (!repo || !q.trim()) return;
  try { const r = await api(`/api/repos/${repo.uuid}/code/search?q=${encodeURIComponent(q.trim())}&limit=20`, {}, 60000); MANAGE.hits = r.hits || []; MANAGE.picked = new Set(); _paintManageHits(); }
  catch (e) { toast(e.message, 'err'); }
}
async function submitManage() {
  const repo = CURRENT_API_REPO; if (!repo || !ACTIVE_API_FILE) return;
  const v = (id) => (document.getElementById(id) || {}).value || '';
  const refs = [...MANAGE.picked].map(i => MANAGE.hits[i]).filter(Boolean).map(h => ({ file: h.file, line: h.range ? h.range.start_line : h.line, name: h.name || null }));
  const body = { path: ACTIVE_API_FILE, action: MANAGE.action, from: v('mg-from') || undefined, to: v('mg-to') || undefined, note: v('mg-note').trim() || undefined, refs };
  try {
    const r = await api(`/api/repos/${repo.uuid}/manage`, { method: 'POST', body: JSON.stringify(body) }, 60000);
    toast(`${MANAGE.action} ${ACTIVE_API_FILE}: ${r.snapshot ? `snapshot ${String(r.snapshot).slice(0, 12)} taken · ` : ''}the agent is on it — follow it in the plan panel`, 'ok');
    closeManagePanel();
    if (typeof openPlanPanel === 'function') openPlanPanel({ focus: r.runId });
  } catch (e) { toast(`not sent: ${e.message}`, 'err'); }
}

// events that change file states: refresh the tree's marks (one read per burst)
let _fsRefreshT = null;
function fileStatesOnEvent(ev) {
  const t = ev && ev.type ? ev.type.replace(/^idearium\./, '') : '';
  if (!/^repo\.(file\.|inject\.|snapshot\.|code\.)/.test(t)) return;
  const u = ev.payload && (ev.payload.repoUuid || ev.payload.uuid);
  if (!CURRENT_API_REPO || (u && u !== CURRENT_API_REPO.uuid)) return;
  clearTimeout(_fsRefreshT);
  _fsRefreshT = setTimeout(() => loadFileStates(CURRENT_API_REPO, { force: true }), 600);
}
