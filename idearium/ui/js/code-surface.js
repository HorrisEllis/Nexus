// ════════════════════════════════════════════════════════════════════════════
// §CODE TAB — idearium/ui/js/code-surface.js (0.39.349 CT3)
// UUID: nexus-idearium-ui-code-surface-v1-0000-2026-1005-jamesbrooks-001
// Map: docs/2026-10-05-code-tab-and-one-router-phasemap.spec (CT3_the_code_tab_is_the_work_surface)
//
// James: "the code tab the agent tab, work surface, like full activity, enterprise grade?" · "its just the code tab is
// meaningless. what about uncommited changes?"
//
// The Code tab is where the work is, built from what already exists — nothing here stores anything:
//   left    the files (repo.files + the proposal-only ones), each with its state against the last version
//           (file-manage.js: GET …/files/state — modified · new · deleted · pending greyed); "changed only" filter
//   middle  search by meaning or exact text (code-api: search · grep); the open file with each chunk marked where it
//           starts (code-api: outline), the agent's change to it as a diff with Apply / Reject (work-surface.js:
//           GET …/worksurface, its cards and actions); with no file open, every change the agent made
//   right   the picked chunk's card (code-api: chunk — uses, used by, tests, proof); the agent docked: the model
//           copilot's door would choose (GET …/agent/route), changeable to any other hop, the ask sent with the open
//           file and lines as its context (POST …/agent/prompt); its reply says which model answered
//   bottom  activity, one strip that folds: the agent's tool calls and the changes
//
// §CT5 0.39.351 — James: "i like it but, can we have this hooked into the plan and work surface panel". The Plan panel
// (plan-panel.js) stays the one plan; the Code tab follows it: the plan's current step and the runs on the open file sit
// above activity, each opening the Plan panel on itself; "change it" in the docked agent is a Manage edit — a snapshot, a
// run on the Plan, the panel opened on it, its change a card here and there; the Code tab repaints on the Plan's events
// (codeSurfaceOnEvent, from app.js); a work-surface card opens its file here (wsOpenInCode, work-surface.js).
//
// §CT8 0.39.352 — James: "i want to see the agents activity in the code tab, in real time. like maybe have a little dot
// blinking next to it". Each tool call the agent makes arrives as it starts and ends (idearium.repo.agent.tool, from
// copilot's loop; GET …/agent/tool-events for a page opened mid-run): a blinking dot on the call that is running and on
// the file it is reading or editing in the tree, ✓ / ✗ when it ends. Only the tree and the activity strip repaint.
//
// §0.39.356 LS4 — James: "also the dom mutator/node anchor, or ollama or cpilot stream live into the worksurface panel and
// code tab." Above activity, the agent writing (app.js agentLiveHtml / agentLivePaint — the Agent tab's feed state): an
// Ollama model's text as it writes, or a browser agent's DOM mutations, its node anchor and its reply.
// ════════════════════════════════════════════════════════════════════════════

const CS = { uuid: null, overview: null, overviewError: null, open: null, text: null, textError: null, outline: null, outlineError: null,
  card: null, hits: null, more: null, q: '', mode: 'search', changedOnly: false, collapsed: new Set(), sel: null,
  agent: { route: null, error: null, pinned: null, pick: '', lines: [], busy: false, draft: '' }, activity: false, loadingChanges: false, plan: null, live: [] };

function _csq(s) { return escapeHtml(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }

function _csReset(repo) {
  Object.assign(CS, { uuid: repo.uuid, overview: null, overviewError: null, open: null, text: null, textError: null, outline: null, outlineError: null,
    card: null, hits: null, more: null, q: '', sel: null, collapsed: new Set(), plan: null, live: [], agent: { route: null, error: null, pinned: null, pick: '', lines: [], busy: false, draft: '' } });
}

async function renderRepoCode(repo) {
  const el = document.getElementById('repo-subtab-code');
  if (!el || !repo) return;
  if (CS.uuid !== repo.uuid) {
    _csReset(repo);
    el.innerHTML = '<div class="detail-empty">reading the index…</div>';
    const here = () => CURRENT_API_REPO?.uuid === repo.uuid && CURRENT_REPO_SUBTAB === 'code';
    // each part paints when it arrives; one that fails says why in its own place
    api(`/api/repos/${repo.uuid}/code/overview`, {}, 120000).then(o => { CS.overview = o; }, e => { CS.overviewError = e.message; }).finally(() => here() && csPaint());
    csLoadChanges(repo).then(() => here() && csPaint());
    if (typeof loadFileStates === 'function') loadFileStates(repo, { force: true }).then(() => here() && csPaint());
    csLoadRoute(repo).then(() => here() && csPaint());
    csLoadPlan(repo).then(() => here() && csPaint());
    api(`/api/repos/${repo.uuid}/agent/tool-events`, {}, 10000).then(r => { for (const e of r.events || []) csOnTool(e, { paint: false }); }, () => {}).finally(() => here() && csPaint());
    return;
  }
  csPaint();
}

async function csLoadChanges(repo) {
  repo = repo || CURRENT_API_REPO; if (!repo) return;
  CS.loadingChanges = true;
  try {
    const d = await api(`/api/repos/${repo.uuid}/worksurface`, {}, 30000);
    if (typeof WSURF !== 'undefined') { if (WSURF.uuid !== repo.uuid) Object.assign(WSURF, { uuid: repo.uuid, open: new Set() }); WSURF.data = d; WSURF.error = null; }
  } catch (e) { if (typeof WSURF !== 'undefined') WSURF.error = e.message; }
  CS.loadingChanges = false;
}

async function csLoadRoute(repo) {
  repo = repo || CURRENT_API_REPO; if (!repo) return;
  try { const r = await api(`/api/repos/${repo.uuid}/agent/route`, {}, 15000); Object.assign(CS.agent, { route: r.route || [], error: r.error || null, pinned: r.pinned || null }); }
  catch (e) { Object.assign(CS.agent, { route: [], error: e.message, pinned: null }); }
}

// §CT5 — the plan as the Plan panel reads it (GET …/plan, …/phases/runs): its summary, the current step, every run
async function csLoadPlan(repo) {
  repo = repo || CURRENT_API_REPO; if (!repo) return;
  try {
    const [plan, runs] = await Promise.all([api(`/api/repos/${repo.uuid}/plan`, {}, 30000), api(`/api/repos/${repo.uuid}/phases/runs`, {}, 30000).catch(() => ({ runs: [] }))]);
    // a run is several rows (building, then replied / failed …): the newest row of each is its state
    const last = new Map();
    for (const r of runs.runs || []) { const k = r.runId || r.uuid; const o = last.get(k); if (!o || (r.ts || 0) >= (o.ts || 0)) last.set(k, r); }
    CS.plan = { summary: plan.summary || {}, current: (plan.steps || []).find(x => x.current) || null, runs: [...last.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)), error: null };
  } catch (e) { CS.plan = { summary: {}, current: null, runs: [], error: e.message }; }
}
/** §CT5 — the Plan's live events (a run, a manage, an inject …) repaint the Code tab too; one read per burst */
let _csEvT = null;
function codeSurfaceOnEvent(ev) {
  const t = ev && ev.type ? ev.type.replace(/^idearium\./, '') : '';
  if (t === 'repo.agent.tool') { const p = ev.payload || {}; if (CS.uuid && p.repoUuid === CS.uuid) csOnTool(p); return; }   // §CT8 — live, no reload
  if (!/^(repo\.(phase\.run|file\.manage|inject\.|deviation|prove\.|verify)|repo\.file|spec\.chunk|chunk\.)/.test(t)) return;
  const repo = CURRENT_API_REPO; if (!repo || CS.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'code') return;
  const u = ev.payload && ev.payload.repoUuid; if (u && u !== repo.uuid) return;
  clearTimeout(_csEvT); _csEvT = setTimeout(csAfterChange, 500);
}
// §CT8 — one tool call, live: a 'running' entry, then its end replaces it (same session, iteration and name)
const CS_LIVE_STALE_MS = 10 * 60 * 1000;   // a call with no end after this long is not shown as running
function csOnTool(e, { paint = true } = {}) {
  if (!e || !e.name) return;
  const k = (x) => `${x.session || ''}|${x.iteration || ''}|${x.name}`;
  if (e.state !== 'running') {
    const i = CS.live.findIndex(x => x.state === 'running' && k(x) === k(e));
    if (i >= 0) { CS.live[i] = { ...CS.live[i], ...e }; } else CS.live.push(e);
  } else CS.live.push(e);
  if (CS.live.length > 80) CS.live.splice(0, CS.live.length - 80);
  if (paint) _csPaintLive();
}
function _csRunning() { const now = Date.now(); return CS.live.filter(x => x.state === 'running' && now - (x.at || 0) < CS_LIVE_STALE_MS); }
/** the file a call is about, from its arguments (path, paths[0], file) */
function _csFileOf(c) { try { const a = typeof c.args === 'string' ? JSON.parse(c.args) : (c.args || {}); return a.path || (Array.isArray(a.paths) && a.paths[0]) || a.file || null; } catch (_) { const m = String(c.args || '').match(/"path"\s*:\s*"([^"]+)"/); return m ? m[1] : null; } }
function _csLiveFiles() { return new Set(_csRunning().map(_csFileOf).filter(Boolean)); }
function _csPaintLive() {
  const repo = CURRENT_API_REPO; if (!repo || CS.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'code') return;
  const act = document.getElementById('cs-activity'); if (act) act.innerHTML = _csActivity();
  const left = document.getElementById('cs-left');
  if (left) { const t = left.querySelector('.cs-tree'); const sc = t ? t.scrollTop : 0; left.innerHTML = _csTree(repo); const t2 = left.querySelector('.cs-tree'); if (t2) t2.scrollTop = sc; }
}

function _csRunsOnOpen() {
  if (!CS.plan || !CS.open) return [];
  return CS.plan.runs.filter(r => r.map === `file:${CS.open}` || ((r.injects && r.injects.injected) || []).includes(CS.open)).slice(0, 6);
}
function _csPlanStrip() {
  const p = CS.plan; if (!p) return '';
  if (p.error) return `<div class="cs-plan"><span class="cs-dim">plan: ${escapeHtml(p.error)}</span></div>`;
  const sm = p.summary, cur = p.current;
  const runs = _csRunsOnOpen();
  const gates = cur && typeof _gateBar === 'function' && cur.gates ? _gateBar(cur) : '';
  return `<div class="cs-plan"><button class="cs-chip-btn" onclick="openPlanPanel()" title="the Plan panel: every step, its gates and ledger, and the work surface">plan ▸</button>
      <span class="cs-dim">${sm.total ? `${sm.complete || 0}/${sm.total} done${sm.building ? ` · ${sm.building} building` : ''}${sm.failed ? ` · <span class="cs-bad">${sm.failed} stopped</span>` : ''}` : 'no phases planned'}</span>
      ${cur ? `<span class="cs-cur" onclick="openPlanPanel(${cur.run && cur.run.runId ? `{ focus: '${_csq(cur.run.runId)}' }` : ''})">◌ ${escapeHtml(cur.title || cur.key)}</span>${gates}` : ''}
      ${runs.length ? `<span class="cs-grow"></span><span class="cs-dim">on this file:</span>${runs.map(r => `<span class="cs-run pp-${escapeHtml(r.state)}" onclick="openPlanPanel({ focus: '${_csq(r.runId || '')}' })" title="${escapeHtml(r.title || '')}${r.error ? ` — ${escapeHtml(r.error)}` : ''}">${escapeHtml(String(r.phase || '').toLowerCase())} · ${escapeHtml(r.state)}</span>`).join('')}` : ''}</div>`;
}

/** called by work-surface.js after Apply / Reject / Revert / Promote, and when a card is opened or closed */
async function csAfterChange() {
  const repo = CURRENT_API_REPO; if (!repo || CS.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'code') return;
  await csLoadChanges(repo);
  if (typeof loadFileStates === 'function') await loadFileStates(repo, { force: true });
  await Promise.all([CS.open ? csReadOpen(repo) : null, csLoadPlan(repo)]);
  csPaint();
}
function csRepaint() { if (CURRENT_REPO_SUBTAB === 'code' && CURRENT_API_REPO && CS.uuid === CURRENT_API_REPO.uuid) csPaint(); }

function _csChanges() { return (typeof WSURF !== 'undefined' && WSURF.data && WSURF.uuid === CS.uuid && WSURF.data.files) || []; }
function _csChangeFor(p) { return _csChanges().filter(f => f.path === p); }

// ── left: the files ──────────────────────────────────────────────────────────────────────────────────
function _csTree(repo) {
  const changed = new Set(_csChanges().filter(f => f.status === 'proposed' || f.status === 'staged').map(f => f.path));
  const all = [...(repo.files || []), ...(typeof pendingOnlyFiles === 'function' ? pendingOnlyFiles(repo) : [])];
  const stateOf = (p) => (typeof fileStateOf === 'function' ? fileStateOf(p) : null);
  const liveFiles = _csLiveFiles();
  const isChanged = (p) => { const s = stateOf(p); return changed.has(p) || (s && (s.state !== 'committed' || s.pending || s.staged)); };
  const files = CS.changedOnly ? all.filter(f => isChanged(f.path)) : all;
  const root = {};
  for (const f of files) {
    const parts = f.path.split('/'); let node = root, acc = '';
    for (let i = 0; i < parts.length - 1; i++) { acc = acc ? `${acc}/${parts[i]}` : parts[i]; node[parts[i]] = node[parts[i]] || { __dir: true, __path: acc, children: {} }; node = node[parts[i]].children; }
    node[parts[parts.length - 1]] = { __dir: false, __path: f.path, __pendingOnly: !!f.__pendingOnly };
  }
  const walk = (node, depth) => Object.entries(node).sort(([a, av], [b, bv]) => (av.__dir !== bv.__dir ? (av.__dir ? -1 : 1) : a.localeCompare(b))).map(([name, e]) => {
    const pad = `<span class="cs-indent" style="width:${depth * 12}px"></span>`;
    if (e.__dir) {
      const shut = CS.collapsed.has(e.__path);
      return `<div class="cs-node cs-dir" onclick="csToggleDir('${_csq(e.__path)}')">${pad}<span class="cs-caret">${shut ? '▸' : '▾'}</span>${escapeHtml(name)}</div>${shut ? '' : walk(e.children, depth + 1)}`;
    }
    const fsm = typeof fileStateMark === 'function' ? fileStateMark(e.__path) : { cls: '', mark: '' };
    const diff = changed.has(e.__path) ? '<span class="cs-diffdot" title="the agent changed this file — its diff is waiting">●</span>' : '';
    const live = liveFiles.has(e.__path) ? '<span class="cs-livedot" title="the agent is working on this file now"></span>' : '';
    return `<div class="cs-node cs-file${CS.open === e.__path ? ' on' : ''}${fsm.cls}${e.__pendingOnly ? ' cs-pending' : ''}" data-path="${escapeHtml(e.__path)}" onclick="csOpen('${_csq(e.__path)}')">${pad}<span class="cs-fname">${escapeHtml(name)}</span>${live}${diff}${fsm.mark}</div>`;
  }).join('');
  const summary = typeof fileStatesSummary === 'function' ? fileStatesSummary() : '';
  return `<div class="cs-pane-head"><span>files</span><span class="cs-grow"></span>
      <button class="cs-chip-btn${CS.changedOnly ? ' on' : ''}" onclick="CS.changedOnly=!CS.changedOnly;csPaint()" title="only files that differ from the last version or have a change waiting">changed only</button></div>
    ${summary ? `<div class="cs-summary">${escapeHtml(summary)}</div>` : ''}
    <div class="cs-tree">${walk(root, 0) || `<div class="cs-empty">${CS.changedOnly ? 'no changes — every file is as in the last snapshot' : 'no files'}</div>`}</div>`;
}
function csToggleDir(p) { if (CS.collapsed.has(p)) CS.collapsed.delete(p); else CS.collapsed.add(p); csPaint(); }

// ── middle: search, the file, the changes ────────────────────────────────────────────────────────────
async function csOpen(p, line = null) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (CS.open !== p) { CS.open = p; CS.text = null; CS.textError = null; CS.outline = null; CS.outlineError = null; CS.sel = null; CS.hist = null; }
  if (line) CS.sel = { from: line, to: line };
  CS.hits = null;
  csPaint();
  await csReadOpen(repo);
  if (CS.open === p) { csPaint(); if (line) _csScrollTo(line); }
}
async function csReadOpen(repo) {
  const p = CS.open; if (!p) return;
  const st = typeof fileStateOf === 'function' ? fileStateOf(p) : null;
  const pendingOnly = st && st.state === 'pending';
  await Promise.all([
    pendingOnly ? Promise.resolve().then(() => { CS.text = null; CS.textError = 'this file exists only as a proposal — its diff is above; Apply writes it'; })
      : api(`/api/repos/${repo.uuid}/file?path=${encodeURIComponent(p)}`, {}, 20000).then(r => { if (CS.open === p) { CS.text = r.content || ''; CS.textError = null; } }, e => { if (CS.open === p) CS.textError = e.message; }),
    api(`/api/repos/${repo.uuid}/code/outline?path=${encodeURIComponent(p)}`, {}, 30000).then(r => { if (CS.open === p) { CS.outline = r; CS.outlineError = null; } }, e => { if (CS.open === p) { CS.outline = null; CS.outlineError = e.message; } }),
    // §0.47.0 OS3 — James: "also hooked into the code tab". The commits that touched this file (VR1: who and why)
    api(`/api/repos/${repo.uuid}/history?path=${encodeURIComponent(p)}`, {}, 20000).then(r => { if (CS.open === p) CS.hist = r; }, () => { if (CS.open === p) CS.hist = null; }),
  ]);
}
/** _csHistLine() — one quiet line under the open file: how many versions, the last change, by whom — opening the Plan
 *  panel's versions view on this file */
function _csHistLine() {
  const h = CS.hist; if (!h || !CS.open) return '';
  const l = h.commits || [];
  if (!l.length) return `<div class="cs-hist">no recorded change to this file yet${h.untracked ? ' — older versions do not say what they touched' : ''}</div>`;
  const c = l[0], by = (c.provenance.by || []).join(', ') || 'unattributed';
  const when = new Date(c.ts).toLocaleString('en-GB', { hour12: false, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="cs-hist"><button class="cs-hist-n" title="every version of this file, in the Plan panel" onclick="csHistoryInPlan()">${l.length} version${l.length === 1 ? '' : 's'}</button>
    <span>last ${c.op === 'delete' ? 'deleted' : 'changed'} ${escapeHtml(when)} by <b>${escapeHtml(by)}</b></span><span class="cs-hist-m" title="${escapeHtml(c.message || '')}">${escapeHtml(String(c.message || '').replace(/ — by .*$/, ''))}</span></div>`;
}
function csHistoryInPlan() {
  if (typeof RT_MORE === 'undefined' || typeof rtToggleDrawer !== 'function') return;
  RT_MORE.file = CS.open; RT_VIEW = 'versions';
  try { localStorage.setItem('idearium.rt.view', 'versions'); } catch (_) {}
  rtToggleDrawer(true);
}
function _csScrollTo(line) { const row = document.querySelector(`#cs-code [data-ln="${line}"]`); if (row) row.scrollIntoView({ block: 'center' }); }

function _csCode() {
  if (!CS.open) return '';
  if (CS.text == null) return `<div class="cs-empty">${CS.textError ? escapeHtml(CS.textError) : 'reading…'}</div>`;
  const lines = CS.text.split('\n'); const MAX = 4000;
  const starts = new Map();
  for (const c of (CS.outline && CS.outline.chunks) || []) { const s = parseInt(String(c.lines).split('-')[0], 10); if (!starts.has(s)) starts.set(s, []); starts.get(s).push(c); }
  const pick = CS.card && CS.card.card && CS.card.card.file === CS.open ? String(CS.card.card.lines).split('-').map(Number) : null;
  const sel = CS.sel;
  const out = [];
  for (let i = 0; i < Math.min(lines.length, MAX); i++) {
    const n = i + 1;
    for (const c of starts.get(n) || []) out.push(`<div class="cs-chunk" onclick="csCard('${_csq(c.id)}')" title="${escapeHtml(c.summary || '')}"><span class="cs-ck">${escapeHtml(c.kind || '')}</span> ${escapeHtml(c.name || '')}<span class="cs-grow"></span><span class="cs-cl">${escapeHtml(c.lines)}</span></div>`);
    const inPick = pick && n >= pick[0] && n <= pick[1], inSel = sel && n >= sel.from && n <= (sel.to || sel.from);
    out.push(`<div class="cs-ln${inPick ? ' pick' : ''}${inSel ? ' sel' : ''}" data-ln="${n}"><span class="cs-g" onclick="csPickLine(event,${n})">${n}</span><span class="cs-t">${escapeHtml(lines[i]) || ' '}</span></div>`);
  }
  if (lines.length > MAX) out.push(`<div class="cs-empty">lines ${MAX + 1}–${lines.length} not shown — search, or open a chunk</div>`);
  return out.join('');
}
function csPickLine(ev, n) {
  if (ev.shiftKey && CS.sel) CS.sel = { from: Math.min(CS.sel.from, n), to: Math.max(CS.sel.to || CS.sel.from, n) };
  else CS.sel = CS.sel && CS.sel.from === n && CS.sel.to === n ? null : { from: n, to: n };
  csPaint();
}

async function csSearch() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  CS.q = ((document.getElementById('cs-q') || {}).value || '').trim(); CS.mode = (document.getElementById('cs-mode') || {}).value || 'search';
  if (!CS.q) { CS.hits = null; return csPaint(); }
  try {
    if (CS.mode === 'grep') { const r = await api(`/api/repos/${repo.uuid}/code/grep?pattern=${encodeURIComponent(CS.q)}&limit=60`, {}, 60000); CS.hits = (r.matches || []).map(m => ({ ...m, id: m.chunkId })); CS.more = r.more || null; }
    else { const r = await api(`/api/repos/${repo.uuid}/code/search?q=${encodeURIComponent(CS.q)}&limit=20`, {}, 60000); CS.hits = r.hits || []; CS.more = r.more || null; }
  } catch (e) { toast(e.message, 'err'); return; }
  csPaint();
}
function _csHits() {
  const row = (h) => { const line = h.range ? h.range.start_line : h.line;
    return `<div class="cs-hit" onclick="csHit('${_csq(h.file)}', ${parseInt(line, 10) || 0}, '${_csq(h.id || h.chunkId || '')}')"><span class="cs-hf">${escapeHtml(h.file)}:${h.range ? `${h.range.start_line}-${h.range.end_line}` : escapeHtml(String(h.line))}</span> ${h.kind ? `<span class="cs-ck">${escapeHtml(h.kind)}</span> ` : ''}${escapeHtml(h.name || '')}${h.summary ? `<div class="cs-hs">${escapeHtml(h.summary)}</div>` : ''}${h.text != null ? `<div class="cs-hs mono">${escapeHtml(h.text)}</div>` : ''}</div>`; };
  return `<div class="cs-sec">${CS.hits.length} result${CS.hits.length === 1 ? '' : 's'}${CS.more ? ` · ${escapeHtml(CS.more)}` : ''}<span class="cs-grow"></span><button class="cs-chip-btn" onclick="CS.hits=null;csPaint()">close</button></div>${CS.hits.map(row).join('') || '<div class="cs-empty">nothing matched</div>'}`;
}
async function csHit(file, line, id) { if (id) csCard(id); await csOpen(file, line || null); }

// ── right: the chunk card ────────────────────────────────────────────────────────────────────────────
async function csCard(id) {
  const repo = CURRENT_API_REPO; if (!repo || !id) return;
  try { CS.card = await api(`/api/repos/${repo.uuid}/code/chunk?id=${encodeURIComponent(id)}&code=0`, {}, 60000); }
  catch (e) { toast(e.message, 'err'); return; }
  const c = CS.card.card;
  if (c && c.file && c.file !== CS.open) { await csOpen(c.file, parseInt(String(c.lines).split('-')[0], 10)); return; }
  csPaint(); if (c) _csScrollTo(parseInt(String(c.lines).split('-')[0], 10));
}
function _csCardHtml() {
  const c = CS.card; if (!c || !c.card) return '<div class="cs-empty">click a chunk in the file (or a search result) for its card: what it uses, what uses it, its tests</div>';
  const k = c.card;
  const link = (id, label) => `<a href="#" onclick="csCard('${_csq(id)}');return false">${escapeHtml(label)}</a>`;
  const list = (xs, total) => `${(xs || []).map(u => `${link(u.chunkId, u.name || u.file)} <span class="cs-dim">(${escapeHtml(u.basis)})</span>`).join(', ') || '—'}${total > (xs || []).length ? ` +${total - xs.length}` : ''}`;
  return `<div class="cs-card-head"><span class="cs-ck">${escapeHtml(k.kind)}</span> <b>${escapeHtml(k.qualifiedName || k.name || k.file)}</b>${c.stale ? ' <span class="cs-bad">stale</span>' : ''}<div class="cs-dim">${escapeHtml(k.file)}:${escapeHtml(k.lines)}${k.exported ? ' · exported' : ''}</div></div>
    ${k.summary ? `<div class="cs-card-sum">${escapeHtml(k.summary)}</div>` : ''}
    <dl class="cs-dl">${k.signature ? `<dt>signature</dt><dd class="mono">${escapeHtml(k.signature)}</dd>` : ''}${k.doc ? `<dt>doc</dt><dd>${escapeHtml(k.doc)}</dd>` : ''}
      <dt>uses</dt><dd>${list(k.uses, k.usesTotal)}</dd><dt>used by</dt><dd>${list(k.usedBy, k.usedByTotal)}</dd>
      <dt>tests</dt><dd>${(k.tests || []).map(t => link(t, t)).join(', ') || '—'}${c.proof ? ` · proof: ${escapeHtml(c.proof.proof)}${c.proof.stale ? ' (stale)' : ''}` : ''}</dd>
      <dt>around</dt><dd>${['parent', 'prev', 'next'].map(x => c.around && c.around[x] ? `${x} ${link(c.around[x].id, c.around[x].name || c.around[x].kind)}` : null).filter(Boolean).join(' · ') || '—'}</dd></dl>
    ${c.pending ? `<div class="cs-note">${escapeHtml(c.pending.note)}</div>` : ''}`;
}

// ── right: the agent, docked ─────────────────────────────────────────────────────────────────────────
function _csHopLabel(h) { return h.model ? `${h.provider}` : `${h.provider}${h.agent && h.agent !== h.provider ? ` (${h.agent})` : ''}`; }
function _csAgentHtml() {
  const a = CS.agent;
  const first = a.route && a.route[0];
  const who = a.pinned ? `Settings pins <b>${escapeHtml(a.pinned)}</b> — copilot is not asked` : first ? `copilot → <b>${escapeHtml(_csHopLabel(first))}</b>` : a.route == null ? 'asking copilot…' : `<span class="cs-bad">copilot gave no route: ${escapeHtml(a.error || 'no answer')}</span>`;
  const opts = [`<option value="">${a.pinned ? `as Settings says (${escapeHtml(a.pinned)})` : 'copilot decides'}</option>`]
    .concat((a.route || []).map((h, i) => `<option value="${i}"${String(a.pick) === String(i) ? ' selected' : ''}>${escapeHtml(_csHopLabel(h))}</option>`)).join('');
  const ctx = CS.open ? `${CS.open}${CS.sel ? `:${CS.sel.from}${CS.sel.to && CS.sel.to !== CS.sel.from ? `-${CS.sel.to}` : ''}` : ''}` : null;
  return `<div class="cs-pane-head"><span>agent</span><span class="cs-grow"></span><button class="cs-chip-btn" title="ask copilot again" onclick="csLoadRoute().then(csPaint)">↻</button></div>
    <div class="cs-who">${who}${first && !a.pinned && first.why ? `<div class="cs-dim">${escapeHtml(first.why)}</div>` : ''}</div>
    <label class="cs-pickrow">model <select id="cs-pick" onchange="CS.agent.pick=this.value">${opts}</select></label>
    <div class="cs-talk" id="cs-talk">${a.lines.map(l => `<div class="cs-msg cs-m-${l.role}"><div class="cs-msg-text">${escapeHtml(l.text)}</div>${l.meta ? `<div class="cs-dim">${escapeHtml(l.meta)}</div>` : ''}</div>`).join('') || '<div class="cs-empty">ask about the open file or the picked lines — its changes land in the diffs, waiting for Apply</div>'}</div>
    <div class="cs-ctx">${ctx ? `context: <b>${escapeHtml(ctx)}</b>${CS.card && CS.card.card ? ` · ${escapeHtml(CS.card.card.qualifiedName || CS.card.card.name || '')}` : ''}` : 'no file open — the agent gets the repo'}</div>
    <textarea id="cs-ask" class="cs-ask" rows="3" placeholder="what to do — Ctrl+Enter asks" oninput="CS.agent.draft=this.value" onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey))csAsk()">${escapeHtml(a.draft)}</textarea>
    <div class="cs-sends"><button class="cs-send cs-send-ask" ${a.busy ? 'disabled' : ''} onclick="csAsk()" title="an answer — nothing is written, nothing is snapshotted">${a.busy ? 'working…' : 'ask'}</button>
      <button class="cs-send cs-send-change" ${a.busy || !CS.open ? 'disabled' : ''} onclick="csChange()" title="${CS.open ? 'a run on the Plan: a snapshot first, then the agent edits this file (the picked lines); its change lands as a diff here and in the Plan panel' : 'open a file to change it'}">change it</button></div>`;
}
async function csAsk() {
  const repo = CURRENT_API_REPO; if (!repo || CS.agent.busy) return;
  const text = (CS.agent.draft || '').trim(); if (!text) { toast('say what to do', 'err'); return; }
  const ctx = CS.open ? `[Code tab — about ${CS.open}${CS.sel ? ` lines ${CS.sel.from}-${CS.sel.to || CS.sel.from}` : ''}${CS.card && CS.card.card && CS.card.card.file === CS.open ? ` (chunk ${CS.card.card.qualifiedName || CS.card.card.name || CS.card.card.id})` : ''}]\n` : '';
  const body = { message: ctx + text };
  const h = CS.agent.pick !== '' && CS.agent.route ? CS.agent.route[+CS.agent.pick] : null;
  if (h) Object.assign(body, { backend: h.backend, agent: h.agent || null, model: h.model || null });
  CS.agent.lines.push({ role: 'you', text }); const line = { role: 'agent', text: 'thinking…', meta: null }; CS.agent.lines.push(line);
  CS.agent.draft = ''; CS.agent.busy = true; csPaint();
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/agent/prompt`, { method: 'POST', body: JSON.stringify(body) }, 320000); }
  catch (e) { r = (e.data && typeof e.data === 'object') ? { ...e.data, ok: false, error: e.data.error || e.message } : { ok: false, error: e.message }; }
  CS.agent.busy = false;
  line.role = r.ok ? 'agent' : 'failed';
  line.text = r.ok ? (r.text || '') : (r.error || 'no response');
  const v = r.viaCopilot;
  line.meta = [v ? `copilot → ${v.provider || v.backend}${v.model && !(v.provider || '').includes(v.model) ? ` ${v.model}` : ''}` : h ? `picked ${_csHopLabel(h)}` : (r.providerUsed || r.provider || null),
    r.modelUsed && !(v && v.model) ? r.modelUsed : null, (r.switchedFrom || []).length ? `switched from ${r.switchedFrom.map(s => `${s.provider} (${s.class})`).join(', ')}` : null,
    r.elapsedMs ? `${Math.round(r.elapsedMs / 100) / 10}s` : null].filter(Boolean).join(' · ') || null;
  await csAfterChange();
  csPaint();
}

/** §CT5 — "change it": a Manage edit of the open file (the picked lines), a run on the Plan; the panel opens on it */
async function csChange() {
  const repo = CURRENT_API_REPO; if (!repo || CS.agent.busy || !CS.open) return;
  const text = (CS.agent.draft || '').trim(); if (!text) { toast('say what to change', 'err'); return; }
  const h = CS.agent.pick !== '' && CS.agent.route ? CS.agent.route[+CS.agent.pick] : null;
  const body = { path: CS.open, action: 'edit', note: text,
    ...(CS.sel ? { from: CS.sel.from, to: CS.sel.to || CS.sel.from } : {}),
    ...(CS.card && CS.card.card && CS.card.card.file === CS.open ? { refs: [{ file: CS.card.card.file, line: parseInt(String(CS.card.card.lines), 10), name: CS.card.card.qualifiedName || CS.card.card.name }] } : {}),
    ...(h ? { backend: h.backend, agent: h.agent || null, model: h.model || null } : {}) };
  CS.agent.lines.push({ role: 'you', text: `change ${CS.open}${CS.sel ? ` lines ${CS.sel.from}–${CS.sel.to || CS.sel.from}` : ''}: ${text}` });
  CS.agent.draft = ''; CS.agent.busy = true; csPaint();
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/manage`, { method: 'POST', body: JSON.stringify(body) }, 120000); }
  catch (e) { r = { ok: false, error: (e.data && e.data.error) || e.message }; }
  CS.agent.busy = false;
  if (r && r.runId) {
    CS.agent.lines.push({ role: 'agent', text: `a run on the Plan: ${r.title}`, meta: `snapshot ${String(r.snapshot || '—').slice(0, 12)} · ${h ? `picked ${_csHopLabel(h)}` : 'copilot decides'} · its change lands as a diff, waiting for Apply` });
    if (typeof openPlanPanel === 'function') openPlanPanel({ focus: r.runId });
    await csLoadPlan(repo);
  } else CS.agent.lines.push({ role: 'failed', text: `not started: ${(r && r.error) || 'no answer'}` });
  csPaint();
}

// ── bottom: activity ─────────────────────────────────────────────────────────────────────────────────
function _csActivity() {
  const d = typeof WSURF !== 'undefined' && WSURF.uuid === CS.uuid ? WSURF.data : null;
  const calls = (d && d.tools && d.tools.calls) || [], ch = _csChanges(), t = (d && d.totals) || {};
  const bad = calls.filter(c => !c.ok).length;
  const running = _csRunning(); const now = running[running.length - 1];
  const liveBad = CS.live.filter(x => x.state === 'failed').length;
  const mark = (x) => (x.state === 'running' && running.includes(x) ? '<span class="cs-livedot"></span>' : x.state === 'failed' || x.ok === false ? '✗' : '✓');
  const row = (x, live) => `<div class="cs-call${x.state === 'failed' || x.ok === false ? ' bad' : ''}${live && x.state === 'running' ? ' running' : ''}">${mark(x)} <b>${escapeHtml(x.name)}</b> <span class="cs-dim">${escapeHtml(x.args || '')}</span>${x.error ? ` — ${escapeHtml(x.error)}` : ''} <i>${escapeHtml(x.session || x.phase || '')}</i></div>`;
  return `<div class="cs-act-head" onclick="CS.activity=!CS.activity;csPaint()"><span>${CS.activity ? '▾' : '▸'} activity</span>
      ${now ? `<span class="cs-now"><span class="cs-livedot"></span> <b>${escapeHtml(now.name.replace(/\.tool$/, ''))}</b> <span class="cs-dim">${escapeHtml(String(now.args || '').slice(0, 90))}</span></span>` : ''}
      <span class="cs-dim">${CS.live.length ? `${CS.live.length} live call${CS.live.length === 1 ? '' : 's'}${liveBad ? ` · <span class="cs-bad">${liveBad} failed</span>` : ''} · ` : ''}${ch.length} change${ch.length === 1 ? '' : 's'}${t.pending ? ` · <span class="cs-warn">${t.pending} waiting</span>` : ''} · ${calls.length} tool call${calls.length === 1 ? '' : 's'} on runs${bad ? ` · <span class="cs-bad">${bad} failed</span>` : ''}${d && d.tools ? ` · scope ${escapeHtml(d.tools.scope || '?')}` : ''}</span></div>
    ${CS.activity ? `<div class="cs-act-body">${CS.live.length ? `<div class="cs-act-sec">live</div>${CS.live.slice().reverse().slice(0, 60).map(x => row(x, true)).join('')}` : ''}
      <div class="cs-act-sec">on the last runs</div>${calls.slice(0, 60).map(c => row(c, false)).join('') || '<div class="cs-empty">no tool calls recorded yet</div>'}
      ${ch.length ? `<div class="cs-act-sec">changes</div>` : ''}${ch.map(f => `<div class="cs-call" onclick="csOpen('${_csq(f.path)}')">${escapeHtml(f.status)} <b>${escapeHtml(f.path)}</b> <span class="ws-plus">+${f.added}</span> <span class="ws-minus">−${f.removed}</span>${f.by ? ` <span class="cs-dim">${escapeHtml(f.by)}</span>` : ''}</div>`).join('')}</div>` : ''}`;
}

// ── paint ────────────────────────────────────────────────────────────────────────────────────────────
function csPaint() {
  const el = document.getElementById('repo-subtab-code'); const repo = CURRENT_API_REPO;
  if (!el || !repo || CS.uuid !== repo.uuid) return;
  const keep = document.getElementById('cs-code'); const scroll = keep ? keep.scrollTop : 0;
  const talk = document.getElementById('cs-talk');
  const o = CS.overview;
  const head = o ? `${o.files} files · ${o.chunks} chunks · ${o.lines} lines · writes: ${escapeHtml(o.repo.writeMode)}${o.repo.pendingProposals ? ` · <span class="cs-warn">${o.repo.pendingProposals} pending proposal(s)</span>` : ''}`
    : CS.overviewError ? `<span class="cs-bad">the index could not be read: ${escapeHtml(CS.overviewError)}</span>` : 'reading the index…';
  const mine = CS.open ? _csChangeFor(CS.open) : [];
  const wsErr = typeof WSURF !== 'undefined' && WSURF.uuid === CS.uuid && WSURF.error;
  const middle = CS.hits ? _csHits()
    : CS.open ? `<div class="cs-sec"><b>${escapeHtml(CS.open)}</b>${(() => { const s = typeof fileStateOf === 'function' ? fileStateOf(CS.open) : null; return s && s.state !== 'committed' ? ` <span class="cs-warn">${escapeHtml(s.state)}</span>` : ''; })()}
          ${CS.outline ? `<span class="cs-dim"> · ${(CS.outline.chunks || []).length} chunk${(CS.outline.chunks || []).length === 1 ? '' : 's'}</span>` : CS.outlineError ? `<span class="cs-dim"> · no chunk cards: ${escapeHtml(CS.outlineError)}</span>` : ''}
          ${CS.sel ? `<span class="cs-dim"> · ${CS.sel.to !== CS.sel.from ? `lines ${CS.sel.from}–${CS.sel.to}` : `line ${CS.sel.from}`} picked (shift-click widens)</span>` : ''}<span class="cs-grow"></span><button class="cs-chip-btn" onclick="CS.open=null;CS.sel=null;csPaint()">close</button></div>
        ${_csHistLine()}
        ${mine.length ? `<div class="cs-diffs">${mine.map((f, i) => _wsCard(f, i)).join('')}</div>` : ''}
        <div class="cs-code" id="cs-code">${_csCode()}</div>`
    : `<div class="cs-sec">the agent's changes<span class="cs-grow"></span><button class="cs-chip-btn" title="reload" onclick="csAfterChange()">↻</button></div>
        ${wsErr ? `<div class="cs-empty cs-bad">could not read the changes: ${escapeHtml(wsErr)}</div>` : ''}
        ${_csChanges().length ? `<div class="cs-diffs">${_csChanges().map(_wsCard).join('')}</div>` : `<div class="cs-empty">${CS.loadingChanges ? 'reading the changes…' : 'no changes yet — what the agent writes shows here as a diff, and greyed in the files, until you apply it'}</div>`}`;
  el.innerHTML = `<div class="cs">
    <div class="cs-top"><span class="cs-dim">${head}</span><span class="cs-grow"></span>
      <input id="cs-q" class="field-input cs-search" placeholder="what the code does, a name, or exact text" value="${escapeHtml(CS.q)}" onkeydown="if(event.key==='Enter')csSearch()">
      <select id="cs-mode" class="field-input cs-mode"><option value="search"${CS.mode === 'search' ? ' selected' : ''}>by meaning</option><option value="grep"${CS.mode === 'grep' ? ' selected' : ''}>exact text</option></select>
      <button class="action-btn" onclick="csSearch()">search</button></div>
    <div class="cs-grid">
      <div class="cs-left" id="cs-left">${_csTree(repo)}</div>
      <div class="cs-mid">${middle}</div>
      <div class="cs-right"><div class="cs-card">${_csCardHtml()}</div><div class="cs-agent">${_csAgentHtml()}</div></div>
    </div>
    ${_csPlanStrip()}
    <div class="al cs-live" data-al="${escapeHtml(repo.uuid)}">${typeof agentLiveHtml === 'function' ? agentLiveHtml(repo.uuid) : ''}</div>
    <div class="cs-activity" id="cs-activity">${_csActivity()}</div></div>`;
  const code = document.getElementById('cs-code'); if (code && scroll) code.scrollTop = scroll;
  const t2 = document.getElementById('cs-talk'); if (t2) t2.scrollTop = talk ? t2.scrollHeight : t2.scrollHeight;
}
