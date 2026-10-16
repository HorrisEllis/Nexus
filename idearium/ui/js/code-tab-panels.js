// ════════════════════════════════════════════════════════════════════════════
// §CODE TAB, expanded — idearium/ui/js/code-tab-panels.js (0.60.81 CE6 · CE7 · CE9)
// UUID: nexus-idearium-ui-code-tab-panels-v1-0000-2026-1016-jamesbrooks-001
// Map: docs/2026-10-15-code-tab-run-state-phasemap.spec (addendum 2026-10-16 (b))
//
// James, 2026-10-16: "expand the code tab in repo. the file and code tab merge. all of it from the phases3"
// James, 2026-10-15: "also the manage from the files tab, should be in the code tab." · "yes one tab." · "code tab needs
// all the activity, response ledger, etc." · "add ai assisted coding using the chunking and line count tool for the ai to
// change lines at a time or a section."
//
// What lives here (code-surface.js draws the tab and calls these):
//   CE6  the Files tab's work, in the Code tab: the tree's filter, add a file, delete one (to .trash/, as before); the open
//        file's edit mode (save through POST …/file, the one write path, so a save is versioned) and Manage (the same
//        workbench, file-manage.js, given the Code tab's file and picked lines). The Files button is gone: setRepoSubtab
//        ('files') and openApiRepoFile() open the Code tab (app.js), so every old link still lands.
//   CE7  the picked lines with an action (change · expand · refactor · fix · document · explain) → POST …/code/assist: the
//        agent gets exactly those lines; what comes back is a proposal for exactly them, a diff above the code
//   CE9  the bottom panel: activity (as before), runs (the run state Nexus keeps: goal, attempts, the agents tried, each
//        step, the files read and changed, what happened — and rewind), the route copilot gives, responses (the repo
//        agent's exchanges), and the Plan panel's views (tasks · log · control · versions · machine) mounted here
// Nothing here stores anything; every number is read from a route.
// ════════════════════════════════════════════════════════════════════════════

const CX = { filter: '', editing: false, draft: null, panel: 'activity', runs: null, runsError: null, resp: null, respError: null, openRuns: new Set() };
try { const v = localStorage.getItem('idearium.cs.panel'); if (v) CX.panel = v; } catch (_) {}

// ── CE6: the tree's actions ──────────────────────────────────────────────────────────────────────────
function cxFilter(v) {
  CX.filter = String(v || '');
  const repo = CURRENT_API_REPO; const left = document.getElementById('cs-left'); if (!repo || !left) return;
  left.innerHTML = _csTree(repo);
  const i = document.getElementById('cs-filter'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}
function cxMatches(p) { const q = CX.filter.trim().toLowerCase(); return !q || String(p).toLowerCase().includes(q); }
async function _cxReloadRepo(repo) {
  if (typeof loadApiRepos === 'function') await loadApiRepos();
  const fresh = typeof API_REPOS !== 'undefined' ? API_REPOS.find(r => r.uuid === repo.uuid) : null;
  if (fresh) CURRENT_API_REPO = fresh;
  if (typeof loadFileStates === 'function') await loadFileStates(CURRENT_API_REPO, { force: true });
}
async function cxAddFile() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  const p = typeof themedPrompt === 'function' ? await themedPrompt('new file path (e.g. src/notes.md):', 'add file') : prompt('new file path');
  if (!p) return;
  try { await api(`/api/repos/${repo.uuid}/file`, { method: 'POST', body: JSON.stringify({ path: p, content: '' }) }); toast(`created ${p}`, 'ok'); }
  catch (e) { toast(`create failed: ${e.message}`, 'err'); return; }
  await _cxReloadRepo(repo);
  await csOpen(p);
}
async function cxDeleteFile(p) {
  const repo = CURRENT_API_REPO; if (!repo || !p) return;
  if (!confirm(`delete ${p}? (moved to .trash/, not permanently erased — §7.4)`)) return;
  try { await api(`/api/repos/${repo.uuid}/file?path=${encodeURIComponent(p)}`, { method: 'DELETE' }); toast(`deleted ${p}`, 'ok'); }
  catch (e) { toast(`delete failed: ${e.message}`, 'err'); return; }
  if (CS.open === p) { CS.open = null; CS.sel = null; CX.editing = false; }
  await _cxReloadRepo(repo);
  csPaint();
}

// ── CE6: edit by hand, and Manage ────────────────────────────────────────────────────────────────────
function cxEdit(on) {
  if (on && CS.text == null) return;
  if (!on && CX.editing && CX.draft != null && CX.draft !== CS.text && !confirm(`discard unsaved changes to ${CS.open}?`)) return;
  CX.editing = !!on; CX.draft = on ? CS.text : null;
  csPaint();
  if (on) { const t = document.getElementById('cs-editor'); if (t) t.focus(); }
}
function cxDirty() { return CX.editing && CX.draft != null && CX.draft !== CS.text; }
async function cxSave() {
  const repo = CURRENT_API_REPO; if (!repo || !CS.open || !CX.editing) return;
  const t = document.getElementById('cs-editor'); const content = t ? t.value : CX.draft;
  try { await api(`/api/repos/${repo.uuid}/file`, { method: 'POST', body: JSON.stringify({ path: CS.open, content }) }); }
  catch (e) { toast(`save failed: ${e.message}`, 'err'); return; }
  toast(`saved ${CS.open}`, 'ok');
  CS.text = content; CX.editing = false; CX.draft = null;
  await csAfterChange();
}
function _cxEditorHtml() {
  return `<div class="cx-edit"><div class="cx-edit-bar"><span class="cs-dim">editing by hand — a save writes the file (and is a version); Ctrl+S saves, Esc cancels</span><span class="cs-grow"></span>
      <button class="cs-chip-btn" onclick="cxEdit(false)">cancel</button><button class="cs-chip-btn on" onclick="cxSave()">save</button></div>
    <textarea id="cs-editor" class="cx-editor" spellcheck="false" oninput="CX.draft=this.value"
      onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();cxSave()}else if(event.key==='Escape'){cxEdit(false)}">${escapeHtml(CX.draft == null ? CS.text || '' : CX.draft)}</textarea></div>`;
}
/** Manage: the Files tab's workbench, on the Code tab's open file and picked lines (file-manage.js reads CS when the Code tab is up) */
function cxManage() {
  if (!CS.open) { toast('open a file first', 'err'); return; }
  if (typeof ACTIVE_API_FILE !== 'undefined') ACTIVE_API_FILE = CS.open;
  if (typeof openManagePanel === 'function') openManagePanel();
}

// ── CE7: the picked lines, with an action ────────────────────────────────────────────────────────────
const CX_ACTIONS = [['change', 'change', 'change these lines as you say (type it below)'], ['expand', 'expand', 'add what they are missing for their purpose'],
  ['refactor', 'refactor', 'the same behaviour, a better structure'], ['fix', 'fix', 'find the real fault in these lines and fix it'],
  ['document', 'document', 'comments only, no behaviour change'], ['explain', 'explain', 'what they do and how they connect — nothing is changed']];
function _cxLinesHtml() {
  if (!CS.open || !CS.sel) return '';
  const a = CS.agent;
  return `<div class="cx-lines"><div class="cs-dim">lines <b>${CS.sel.from}${CS.sel.to !== CS.sel.from ? `–${CS.sel.to}` : ''}</b> → the agent gets exactly these; its answer replaces exactly these, as a diff to Apply</div>
    <div class="cx-acts">${CX_ACTIONS.map(([k, l, d]) => `<button class="cs-chip-btn cx-act" data-a="${k}" title="${escapeHtml(d)}" ${a.busy ? 'disabled' : ''} onclick="cxAssist('${k}')">${l}</button>`).join('')}</div></div>`;
}
async function cxAssist(action) {
  const repo = CURRENT_API_REPO; if (!repo || !CS.open || !CS.sel || CS.agent.busy) return;
  const note = (CS.agent.draft || '').trim();
  if (action === 'change' && !note) { toast('say how to change them (type it in the box below)', 'err'); return; }
  const h = CS.agent.pick !== '' && CS.agent.route ? CS.agent.route[+CS.agent.pick] : null;
  const body = { path: CS.open, from: CS.sel.from, to: CS.sel.to || CS.sel.from, action, ...(note ? { note } : {}), ...(h ? { backend: h.backend, agent: h.agent || null, model: h.model || null } : {}) };
  const where = `${CS.open} ${body.from}${body.to !== body.from ? `–${body.to}` : ''}`;
  CS.agent.lines.push({ role: 'you', text: `${action} ${where}${note ? `: ${note}` : ''}` });
  const line = { role: 'agent', text: 'working on those lines…', meta: null }; CS.agent.lines.push(line);
  CS.agent.draft = ''; CS.agent.busy = true; csPaint();
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/code/assist`, { method: 'POST', body: JSON.stringify(body) }, 20 * 60000); }
  catch (e) { r = { ok: false, error: (e.data && e.data.error) || e.message }; }
  CS.agent.busy = false;
  if (!r.ok) { line.role = 'failed'; line.text = `${r.error || 'no answer'}${r.reply ? `\n\n${r.reply}` : ''}`; }
  else if (action === 'explain') line.text = r.reply || '';
  else line.text = `a change to ${where} is waiting above the code — Apply writes it (a version of its own), Reject drops it`;
  line.meta = [r.provider, r.checksumBefore ? `${r.checksumBefore} → ${r.checksumAfter}` : null].filter(Boolean).join(' · ') || null;
  await csAfterChange();
}

// ── CE9: the bottom panel ────────────────────────────────────────────────────────────────────────────
const CX_PANELS = [['activity', 'activity'], ['runs', 'runs'], ['responses', 'responses'], ['tasks', 'tasks'], ['log', 'log'], ['control', 'control'], ['versions', 'versions'], ['machine', 'machine']];
const CX_RT = new Set(['tasks', 'log', 'control', 'versions', 'machine']);
function cxPanel(k) {
  CX.panel = CX_PANELS.some(p => p[0] === k) ? k : 'activity';
  try { localStorage.setItem('idearium.cs.panel', CX.panel); } catch (_) {}
  if (CX.panel !== 'activity') CS.activity = true;
  csPaint();
  cxPanelLoad();
}
function cxPanelLoad() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (CX.panel === 'runs') return cxRunsLoad(repo);
  if (CX.panel === 'responses') return cxRespLoad(repo);
  if (CX_RT.has(CX.panel) && typeof rtView === 'function') { rtView(CX.panel); if (typeof rtMounted === 'function') rtMounted(true); }
}
async function cxRunsLoad(repo) {
  try { const r = await api(`/api/repos/${repo.uuid}/runs?limit=30`, {}, 20000); CX.runs = r.runs || []; CX.runsError = null; }
  catch (e) { CX.runs = []; CX.runsError = e.message; }
  if (CX.panel === 'runs') _cxPaintPanel();
}
async function cxRespLoad(repo) {
  try { const r = await api(`/api/repos/${repo.uuid}/agent/history?limit=40`, {}, 20000); CX.resp = r.exchanges || []; CX.respError = null; }
  catch (e) { CX.resp = []; CX.respError = e.message; }
  if (CX.panel === 'responses') _cxPaintPanel();
}
function _cxPaintPanel() { const b = document.getElementById('cx-panel-body'); if (b) b.innerHTML = _cxPanelBody(); }
function _cxWhen(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { hour12: false, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }

/** the route copilot gives this repo's agent (RAID's door): who answers first, and the hops after */
function _cxRoute() {
  const a = CS.agent; if (!a) return '';
  if (a.pinned) return `<div class="cx-route">route: Settings pins <b>${escapeHtml(a.pinned)}</b></div>`;
  if (!a.route || !a.route.length) return `<div class="cx-route cs-dim">route: ${a.route == null ? 'asking copilot…' : escapeHtml(a.error || 'none')}</div>`;
  return `<div class="cx-route">route: ${a.route.map((h, i) => `<span class="cx-hop${i ? '' : ' first'}" title="${escapeHtml(h.why || '')}">${escapeHtml(_csHopLabel(h))}</span>`).join('<span class="cx-arrow">→</span>')}</div>`;
}
/** one run as a pipeline: goal → each step (✓ / ✗) → its state; the agents that tried it; what happened to it */
function _cxRun(r) {
  const open = CX.openRuns.has(r.runId);
  const steps = r.steps || [];
  const chain = steps.slice(-24).map(s => `<span class="cx-step${s.ok ? '' : ' bad'}" title="${escapeHtml(`${s.n}. ${s.name} ${s.arg || ''}${s.error ? ` — ${s.error}` : ''}`)}">${s.ok ? '✓' : '✗'} ${escapeHtml(String(s.name).replace(/^idearium\.|\.tool$/g, '').slice(0, 18))}</span>`).join('<span class="cx-arrow">→</span>');
  const who = (r.providers && r.providers.length ? r.providers.map(p => `${p.provider || '?'}#${p.attempt}`) : [r.provider].filter(Boolean)).join(', ');
  return `<div class="cx-run s-${escapeHtml(r.status || '')}">
    <div class="cx-run-head" onclick="CX.openRuns.has('${_csq(r.runId)}')?CX.openRuns.delete('${_csq(r.runId)}'):CX.openRuns.add('${_csq(r.runId)}');_cxPaintPanel()">
      <span class="cx-st">${escapeHtml(r.status || '?')}</span><b>${escapeHtml(String(r.goal || '').split('\n')[0].slice(0, 120) || r.runId)}</b>
      <span class="cs-grow"></span><span class="cs-dim">attempt ${r.attempt || 1} · ${r.stepCount || 0} steps · ${(r.filesChanged || []).length} changed · ${_cxWhen(r.updatedAt)}</span></div>
    <div class="cx-pipe"><span class="cx-node">goal</span>${chain ? `<span class="cx-arrow">→</span>${chain}` : ''}<span class="cx-arrow">→</span><span class="cx-node s-${escapeHtml(r.status || '')}">${escapeHtml(r.status || '?')}</span></div>
    ${open ? `<div class="cx-run-body">
      ${who ? `<div><span class="cs-dim">agents:</span> ${escapeHtml(who)}</div>` : ''}${r.brick ? `<div><span class="cs-dim">brick:</span> ${escapeHtml(r.brick)}</div>` : ''}
      ${r.next ? `<div><span class="cs-dim">next:</span> ${escapeHtml(r.next)}</div>` : ''}
      <div><span class="cs-dim">changed:</span> ${(r.filesChanged || []).map(f => `<a href="#" onclick="csOpen('${_csq(f)}');return false">${escapeHtml(f)}</a>`).join(', ') || '—'}</div>
      <div><span class="cs-dim">read:</span> ${(r.filesRead || []).slice(-20).map(f => `<a href="#" onclick="csOpen('${_csq(f)}');return false">${escapeHtml(f)}</a>`).join(', ') || '—'}</div>
      ${(r.events || []).length ? `<div class="cx-evs">${r.events.slice(-12).map(e => `<div><span class="cx-st">${escapeHtml(e.kind)}</span> ${escapeHtml(e.text || '')} <span class="cs-dim">#${e.attempt || ''} ${_cxWhen(e.at)}</span></div>`).join('')}</div>` : ''}
      ${r.note ? `<div class="cs-dim">${escapeHtml(r.note)}</div>` : ''}
      <div class="cx-run-acts"><button class="cs-chip-btn" ${(r.filesChanged || []).length ? '' : 'disabled title="this run recorded no file it changed"'} onclick="cxRewind('${_csq(r.runId)}')">rewind this run</button>
        <span class="cs-dim">${escapeHtml(r.runId)}</span></div></div>` : ''}</div>`;
}
async function cxRewind(runId) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  let dry;
  try { dry = await api(`/api/repos/${repo.uuid}/runs/${encodeURIComponent(runId)}/rewind`, { method: 'POST', body: JSON.stringify({ dryRun: true }) }, 60000); }
  catch (e) { toast(`cannot rewind: ${e.message}`, 'err'); return; }
  const list = dry.results.map(x => x.path).join('\n  ');
  if (!confirm(`Put these files back as they were at ${String(dry.to.commitId).slice(0, 12)} (${_cxWhen(dry.to.ts)}), before this run?\n  ${list}\n\nEach restore is itself a version; a file the run created is left as it is.`)) return;
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/runs/${encodeURIComponent(runId)}/rewind`, { method: 'POST', body: JSON.stringify({ by: 'person' }) }, 120000); }
  catch (e) { toast(`rewind failed: ${e.message}`, 'err'); return; }
  const done = r.results.filter(x => x.done).length, left = r.results.filter(x => !x.done);
  toast(`rewound ${done} file${done === 1 ? '' : 's'}${left.length ? ` · left ${left.map(x => x.path).join(', ')}` : ''}`, left.length ? 'warn' : 'ok');
  await csAfterChange(); cxRunsLoad(repo);
}
function _cxResp(x) {
  return `<div class="cx-resp${x.ok ? '' : ' bad'}"><div class="cx-resp-head"><span class="cx-st">${x.ok ? 'ok' : 'failed'}</span> <b>${escapeHtml(x.provider || x.backend || '?')}</b>
      <span class="cs-dim">${_cxWhen(x.ts)}${x.elapsedMs ? ` · ${Math.round(x.elapsedMs / 100) / 10}s` : ''}${x.promptChars ? ` · ${x.promptChars} chars in` : ''}${(x.injects || []).length ? ` · ${x.injects.length} proposal${x.injects.length === 1 ? '' : 's'}` : ''}</span></div>
    <div class="cx-resp-q">${escapeHtml(String(x.message || '').slice(0, 240))}</div>
    <div class="cx-resp-a">${escapeHtml(String(x.ok ? x.response || '' : x.error || '').slice(0, 600))}</div></div>`;
}
function _cxPanelBody() {
  if (CX.panel === 'activity') return '';   // code-surface.js draws activity itself (_csActivity)
  if (CX.panel === 'runs') {
    const cur = CS.plan && CS.plan.current;
    const gates = cur && typeof _gateBar === 'function' && cur.gates ? `<div class="cx-gates"><span class="cs-dim">plan step</span> <b>${escapeHtml(cur.title || cur.key)}</b> ${_gateBar(cur)}</div>` : '';
    return `${_cxRoute()}${gates}${CX.runsError ? `<div class="cs-empty cs-bad">${escapeHtml(CX.runsError)}</div>` : ''}${CX.runs == null ? '<div class="cs-empty">reading the runs…</div>'
      : CX.runs.length ? CX.runs.map(_cxRun).join('') : '<div class="cs-empty">no runs yet — every agent run on this repo (a chat, a phase, a brick) keeps its state here: what it read, changed, and where it stopped</div>'}`;
  }
  if (CX.panel === 'responses') {
    return `${CX.respError ? `<div class="cs-empty cs-bad">${escapeHtml(CX.respError)}</div>` : ''}${CX.resp == null ? '<div class="cs-empty">reading the exchanges…</div>'
      : CX.resp.length ? CX.resp.map(_cxResp).join('') : '<div class="cs-empty">no exchanges with this repo\'s agent yet</div>'}`;
  }
  const pp = document.getElementById('pp-log'), pl = document.getElementById('plan-panel');
  const there = pp && pp.open && pl && pl.classList.contains('open');
  return `${there ? '<div class="cs-dim cx-note">also open in the Plan panel\'s activity section — drawn here while this tab is up</div>' : ''}
    <div class="rt-views" id="cs-rt-views" style="display:none"></div><div class="rt-filters" id="cs-rt-filters"></div><div class="rt-list" id="cs-rt-list"></div>`;
}
/** the panel bar and its body; activity's body is code-surface.js's own strip */
function cxPanelsHtml(activityHtml) {
  const bar = CX_PANELS.map(([k, l]) => `<button class="cx-tab${CX.panel === k ? ' on' : ''}" onclick="cxPanel('${k}')">${l}</button>`).join('');
  return `<div class="cx-panels"><div class="cx-bar">${bar}</div>${CX.panel === 'activity' ? activityHtml : `<div class="cx-panel-body" id="cx-panel-body">${_cxPanelBody()}</div>`}</div>`;
}
/** after csPaint drew the tab: the Plan panel's views redraw into their mount here (from what they hold — no re-read) */
function cxAfterPaint() {
  if (CX_RT.has(CX.panel) && typeof rtPaint === 'function' && document.getElementById('cs-rt-list')) { try { if (typeof RT_VIEW !== 'undefined' && RT_VIEW !== CX.panel) rtView(CX.panel); else rtPaint(); } catch (_) {} }
}
