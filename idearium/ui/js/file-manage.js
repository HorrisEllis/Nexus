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
const FS_LABEL = { committed: '', modified: 'M', new: 'N', deleted: 'D', pending: 'P', uncoded: 'U' };
const FS_TITLE = { uncoded: 'planned, not coded yet — its phase writes it (Phases tab)', committed: 'committed — as in the last version', modified: 'modified since the last version (uncommitted)',
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
  return Object.entries(FILESTATE.states).filter(([p, s]) => (s.state === 'pending' || s.state === 'uncoded') && !have.has(p)).map(([p]) => ({ path: p, bytes: 0, __pendingOnly: true }));
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
  const bits = [['not coded', c.uncoded], ['modified', c.modified], ['new', c.new], ['deleted', c.deleted], ['pending', c.pending], ['proposals', c.withProposals], ['staged', c.withStaged]].filter(([, n]) => n);
  return `${bits.map(([k, n]) => `${n} ${k}`).join(' · ') || 'everything committed'}${FILESTATE.note ? ` — ${FILESTATE.note}` : ''}`;
}

// ── Manage ───────────────────────────────────────────────────────────────────
// §0.39.282 N25 — James: "the manage button. Can you make it beautiful like the rest of idearium. Like enterprise grade,
// fully built." A workbench, not a form: the file and its state; the actions in three groups (change · fix ·
// understand), each saying whether it writes; the scope (whole file or lines, with a live preview of those lines);
// instructions; related code; who does it; the pipeline it goes through, stated before it is sent (snapshot → agent →
// gate → shadow → review of an Ollama draft); and this file's history of manage runs, newest first, each with its state
// and reason. Esc closes, Ctrl+Enter sends. Styles: css/file-manage.css (the same tokens as the rest of idearium).
const MANAGE_GROUPS = [
  ['change', 'Change it', [['expand', '⤢', 'Expand', 'add what it is missing for its purpose'], ['iterate', '↻', 'Iterate', 'the next improvement it most needs'],
    ['refactor', '⇄', 'Refactor', 'same behaviour, better structure'], ['rebuild', '⟲', 'Rebuild', 'written anew from its purpose, nothing lost'], ['optimize', '⚡', 'Optimize', 'measured, no behaviour change']]],
  ['fix', 'Fix & prove', [['debug', '⚑', 'Debug', 'find and fix the real fault'], ['test', '✓', 'Test', 'prove every behaviour'], ['document', '¶', 'Document', 'header and comments, no behaviour change']]],
  ['understand', 'Understand', [['review', '⌕', 'Review', 'hostile review — findings only'], ['explain', '?', 'Explain', 'what it does and how it connects']]],
];
const MANAGE_ACTIONS_UI = MANAGE_GROUPS.flatMap(([, , acts]) => acts.map(([k, ic, l, d]) => [k, `${ic} ${l.toLowerCase()}`, d]));   // (kept: the flat list)
const MANAGE_READONLY = new Set(['review', 'explain']);
const MANAGE = { action: 'iterate', hits: [], picked: new Set(), scope: 'file', provider: '', settings: null, runs: [] };

function _editorSelectionLines() {
  const ta = document.getElementById('ide-editor');
  if (!ta || ta.style.display === 'none' || ta.selectionStart === ta.selectionEnd) return null;
  const before = ta.value.slice(0, ta.selectionStart), sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
  const from = before.split('\n').length;
  return { from, to: from + sel.replace(/\n$/, '').split('\n').length - 1 };
}
function _editorText() { const ta = document.getElementById('ide-editor'); return ta && typeof ta.value === 'string' ? ta.value : ''; }

function openManagePanel() {
  const repo = CURRENT_API_REPO;
  if (!repo || !ACTIVE_API_FILE) { toast('open a file first', 'err'); return; }
  const sel = _editorSelectionLines();
  MANAGE.scope = sel ? 'lines' : 'file';
  // the Code tab's last search comes along: hits in other files are the context most worth a look
  MANAGE.hits = (typeof CS !== 'undefined' && CS.uuid === repo.uuid && Array.isArray(CS.hits)) ? CS.hits.slice(0, 20) : []   // §CT3 — the Code tab's search (code-surface.js);
  MANAGE.picked = new Set(MANAGE.hits.map((h, i) => (h.file !== ACTIVE_API_FILE && i < 5 ? i : -1)).filter(i => i >= 0));
  let ov = document.getElementById('manage-modal');
  if (!ov) { ov = document.createElement('div'); ov.id = 'manage-modal'; ov.className = 'modal-overlay mg-overlay'; ov.onclick = (e) => { if (e.target === ov) closeManagePanel(); }; document.body.appendChild(ov); }
  const st = fileStateOf(ACTIVE_API_FILE);
  const text = _editorText();
  const lines = text ? text.replace(/\n$/, '').split('\n').length : 0;
  const state = st ? st.state : 'committed';
  const esc = escapeHtml;
  ov.innerHTML = `<div class="mg-shell manage-modal" role="dialog" aria-label="Manage ${esc(ACTIVE_API_FILE)}">
    <div class="mg-head">
      <div style="min-width:0">
        <div class="mg-kicker">manage one file · ${esc(repo.name || '')}</div>
        <div class="mg-file" title="${esc(ACTIVE_API_FILE)}">${esc(ACTIVE_API_FILE)}</div>
        <div class="mg-meta">
          <span class="mg-chip st-${esc(state)}">${esc(state)}</span>
          ${lines ? `<span class="mg-chip">${lines} lines</span>` : ''}${text ? `<span class="mg-chip">${(new Blob([text]).size / 1024).toFixed(1)} KB</span>` : ''}
          ${st && st.pending ? `<span class="mg-chip st-pending">${st.pending.length} proposal${st.pending.length > 1 ? 's' : ''} waiting</span>` : ''}
          ${st && st.staged ? '<span class="mg-chip st-staged">staged</span>' : ''}
        </div>
      </div>
      <div class="mg-spacer"></div>
      <button class="mg-x" title="Close (Esc)" onclick="closeManagePanel()">✕</button>
    </div>
    <div class="mg-body">
      <div class="mg-main">
        <div class="mg-section"><h4>What should happen <span class="mg-hint">writes = the agent's code comes back into this file</span></h4>
          <div class="mg-groups">${MANAGE_GROUPS.map(([g, title, acts]) => `<div class="mg-group"><div class="mg-group-title">${esc(title)}</div>${acts.map(([k, ic, l, d]) =>
            `<button class="mg-act manage-act${MANAGE.action === k ? ' on' : ''}" data-a="${k}" title="${esc(d)}" onclick="manageSetAction('${k}')"><span class="mg-ic">${ic}</span><span><div class="mg-nm">${esc(l)}</div><div class="mg-ds">${esc(d)}</div></span><span class="mg-wr ${MANAGE_READONLY.has(k) ? 'r' : 'w'}">${MANAGE_READONLY.has(k) ? 'READS' : 'WRITES'}</span></button>`).join('')}</div>`).join('')}</div>
        </div>
        <div class="mg-section"><h4>Scope <span class="mg-hint">select text in the editor to prefill the lines</span></h4>
          <div class="mg-scope">
            <div class="mg-seg"><button id="mg-sc-file" class="${MANAGE.scope === 'file' ? 'on' : ''}" onclick="manageSetScope('file')">Whole file</button><button id="mg-sc-lines" class="${MANAGE.scope === 'lines' ? 'on' : ''}" onclick="manageSetScope('lines')">Lines</button></div>
            <input class="mg-num" id="mg-from" type="number" min="1" ${lines ? `max="${lines}"` : ''} placeholder="from" value="${sel ? sel.from : ''}" oninput="managePreview()" ${MANAGE.scope === 'file' ? 'disabled' : ''}>
            <span style="color:var(--text3)">–</span>
            <input class="mg-num" id="mg-to" type="number" min="1" ${lines ? `max="${lines}"` : ''} placeholder="to" value="${sel ? sel.to : ''}" oninput="managePreview()" ${MANAGE.scope === 'file' ? 'disabled' : ''}>
          </div>
          <div class="mg-preview" id="mg-preview"></div>
        </div>
        <div class="mg-section"><h4>Instructions <span class="mg-hint">optional — sent as "FROM JAMES"</span></h4>
          <textarea class="mg-textarea" id="mg-note" placeholder="e.g. handle the timeout case; keep the public API"></textarea>
        </div>
        <div class="mg-row2">
          <div class="mg-section"><h4>Related code <span class="mg-hint">the agent reads these with its tools</span></h4>
            <div class="mg-search"><input id="mg-q" placeholder="search this repo by meaning" value="${esc((typeof CS !== 'undefined' && CS.q) || '')}" onkeydown="if(event.key==='Enter'){event.preventDefault();manageSearch()}"><button class="mg-btn" onclick="manageSearch()">Search</button></div>
            <div id="mg-hits" class="mg-hits manage-hits"></div>
          </div>
          <div class="mg-section"><h4>Who does it</h4>
            <select class="mg-select" id="mg-provider" onchange="MANAGE.provider=this.value;managePipeline()"><option value="">this repo's agent</option></select>
            <div style="margin-top:14px"><h4>The pipeline</h4><div class="mg-pipe" id="mg-pipe"></div></div>
          </div>
        </div>
      </div>
      <aside class="mg-rail"><h4>History of this file</h4><div id="mg-history"><div class="mg-empty">loading…</div></div></aside>
    </div>
    <div class="mg-foot">
      <span class="mg-kbd">Esc to close · Ctrl+Enter to send</span><div class="mg-spacer"></div>
      <button class="mg-btn" onclick="closeManagePanel()">Cancel</button>
      <button class="mg-btn primary" id="mg-send" onclick="submitManage()">Send to the agent ▸</button>
    </div>
  </div>`;
  ov.classList.add('open');
  // keys work wherever focus is while the workbench is open (not only inside it); removed on close
  document.removeEventListener('keydown', _manageKeys, true);
  document.addEventListener('keydown', _manageKeys, true);
  const first = ov.querySelector('.manage-act.on'); if (first) first.focus();
  _paintManageHits(); managePreview(); managePipeline(); _manageLoadSide(repo, ACTIVE_API_FILE);
}
function _manageKeys(e) {
  const ov = document.getElementById('manage-modal');
  if (!ov || !ov.classList.contains('open')) { document.removeEventListener('keydown', _manageKeys, true); return; }
  if (e.key === 'Escape') { e.preventDefault(); closeManagePanel(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitManage(); }
}
function closeManagePanel() { const ov = document.getElementById('manage-modal'); if (ov) ov.classList.remove('open'); document.removeEventListener('keydown', _manageKeys, true); }
function manageSetAction(k) {
  MANAGE.action = k;
  document.querySelectorAll('.manage-act').forEach(b => b.classList.toggle('on', b.dataset.a === k));
  managePipeline();
}
function manageSetScope(sc) {
  MANAGE.scope = sc;
  document.getElementById('mg-sc-file').classList.toggle('on', sc === 'file');
  document.getElementById('mg-sc-lines').classList.toggle('on', sc === 'lines');
  for (const id of ['mg-from', 'mg-to']) document.getElementById(id).disabled = sc === 'file';
  if (sc === 'lines' && !document.getElementById('mg-from').value) { document.getElementById('mg-from').value = 1; document.getElementById('mg-to').value = Math.min(20, _editorText().split('\n').length); }
  managePreview();
}
function managePreview() {
  const el = document.getElementById('mg-preview'); if (!el) return;
  const all = _editorText().replace(/\n$/, '').split('\n');
  if (!_editorText()) { el.innerHTML = '<div class="mg-empty">the file is not open in the editor — the agent reads it itself</div>'; return; }
  let from = 1, to = Math.min(all.length, 12);
  if (MANAGE.scope === 'lines') {
    from = Math.max(1, parseInt(document.getElementById('mg-from').value, 10) || 1);
    to = Math.min(all.length, Math.max(from, parseInt(document.getElementById('mg-to').value, 10) || from));
  }
  const a = Math.max(1, from - 2), b = Math.min(all.length, to + 2);
  el.innerHTML = all.slice(a - 1, b).map((c, i) => { const n = a + i; const inside = MANAGE.scope === 'lines' && n >= from && n <= to;
    return `<div class="mg-ln${inside ? ' mg-in' : ''}"><span class="mg-n">${n}</span><span class="mg-c">${escapeHtml(c) || ' '}</span></div>`; }).join('')
    + (MANAGE.scope === 'file' && all.length > b ? `<div class="mg-empty">… ${all.length - b} more lines — the whole file is in scope</div>` : '');
}
function _manageProviderName() {
  const s = MANAGE.settings;
  return MANAGE.provider || (s && (s.provider || s.guardianAgent)) || 'the repo\'s agent';
}
function managePipeline() {
  const el = document.getElementById('mg-pipe'); if (!el) return;
  const writes = !MANAGE_READONLY.has(MANAGE.action);
  const who = _manageProviderName();
  const local = /^ollama/.test(String(who));
  const steps = [
    [writes, `<b>snapshot</b> first`], [true, `<b>${escapeHtml(who)}</b>`], [true, `<b>gate</b> — a refusal is blocked`],
    [writes, `<b>shadow</b> — ${escapeHtml(ACTIVE_API_FILE || 'the file')} must come back`], [writes && local, `<b>review</b> by a guardian agent`],
  ];
  el.innerHTML = steps.map(([on, t], i) => `${i ? '<span class="mg-arrow">→</span>' : ''}<span class="mg-step${on ? '' : ' off'}">${t}</span>`).join('');
  const btn = document.getElementById('mg-send'); if (btn) btn.textContent = writes ? 'Send to the agent ▸' : 'Ask the agent ▸';
}
async function _manageLoadSide(repo, file) {
  // who does it: the repo's agent settings (provider list + the current one)
  try {
    const s = await api(`/api/repos/${repo.uuid}/agent/settings`, {}, 20000);
    MANAGE.settings = s;
    const sel = document.getElementById('mg-provider');
    if (sel && Array.isArray(s.providers)) sel.innerHTML = `<option value="">this repo's agent${s.provider ? ` (${escapeHtml(s.provider)})` : ''}</option>` + s.providers.filter(p => p !== 'auto').map(p => `<option value="${escapeHtml(p)}"${MANAGE.provider === p ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('');
    managePipeline();
  } catch (_) { /* the list stays "this repo's agent" */ }
  // this file's history: every manage run on it, newest first
  const el = document.getElementById('mg-history');
  try {
    const r = await api(`/api/repos/${repo.uuid}/phases/runs`, {}, 20000);
    const runs = (r.runs || []).filter(x => x.map === `file:${file}` || (x.draftRunId && (r.runs || []).some(y => y.runId === x.draftRunId && y.map === `file:${file}`)));
    MANAGE.runs = runs;
    if (!el) return;
    el.innerHTML = runs.length ? runs.slice(0, 40).map(x => `<div class="mg-run s-${escapeHtml(x.state || '')}">
        <div class="mg-t">${escapeHtml(String(x.phase || '').toLowerCase())} · ${escapeHtml(x.state || '')}</div>
        <div class="mg-w">${x.ts ? new Date(x.ts).toLocaleString() : ''}${x.provider ? ` · ${escapeHtml(x.provider)}` : ''}${x.reviewer ? ` · reviewed by ${escapeHtml(x.reviewer)}` : ''}</div>
        ${x.error ? `<div class="mg-e">${escapeHtml(String(x.error).slice(0, 220))}</div>` : ''}${x.absent && x.absent.length ? `<div class="mg-e">absent: ${escapeHtml(x.absent.join(', '))}</div>` : ''}</div>`).join('')
      : '<div class="mg-empty">No manage runs on this file yet. Each one lands here with its state — replied, blocked, incomplete, reviewed — and the reason.</div>';
  } catch (e) { if (el) el.innerHTML = `<div class="mg-empty">history unavailable: ${escapeHtml(e.message)}</div>`; }
}
function _paintManageHits() {
  const el = document.getElementById('mg-hits'); if (!el) return;
  el.innerHTML = MANAGE.hits.length ? MANAGE.hits.map((h, i) => `<label class="mg-hit manage-hit"><input type="checkbox" ${MANAGE.picked.has(i) ? 'checked' : ''} onchange="this.checked?MANAGE.picked.add(${i}):MANAGE.picked.delete(${i})">
      <span><div class="mg-f">${escapeHtml(h.file)}:${h.range ? h.range.start_line : (h.line || '')}${h.name ? ` · ${escapeHtml(h.name)}` : ''}</div>${h.summary ? `<div class="mg-s">${escapeHtml(String(h.summary).slice(0, 110))}</div>` : ''}</span></label>`).join('')
    : '<div class="mg-hint-row">nothing picked — the agent searches for itself</div>';
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
  const ranged = MANAGE.scope === 'lines';
  const body = { path: ACTIVE_API_FILE, action: MANAGE.action, from: ranged ? v('mg-from') || undefined : undefined, to: ranged ? v('mg-to') || undefined : undefined,
    note: v('mg-note').trim() || undefined, refs, provider: MANAGE.provider || undefined };
  const btn = document.getElementById('mg-send'); if (btn) btn.disabled = true;
  try {
    const r = await api(`/api/repos/${repo.uuid}/manage`, { method: 'POST', body: JSON.stringify(body) }, 60000);
    toast(`${MANAGE.action} ${ACTIVE_API_FILE}: ${r.snapshot ? `snapshot ${String(r.snapshot).slice(0, 12)} taken · ` : ''}the agent is on it — follow it in the plan panel`, 'ok');
    closeManagePanel();
    if (typeof openPlanPanel === 'function') openPlanPanel({ focus: r.runId });
  } catch (e) { toast(`not sent: ${e.message}`, 'err'); if (btn) btn.disabled = false; }
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
