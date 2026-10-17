// ════════════════════════════════════════════════════════════════════════════
// §THE DOCK — idearium/ui/js/code-dock.js (0.60.118 DK2)
// UUID: nexus-idearium-ui-code-dock-v1-0000-2026-1017-jamesbrooks-001
// §DK3 (2026-10-17): the Control panel — James: "like yours but with a control panel."
// Map: docs/2026-10-16-code-tab-rebuild-phasemap.spec (addendum_c DK2_the_dock)
//
// James, 2026-10-17: "i want the code tab better. like you have on the right. outputs for proposals and artifacts. changes
// for the worksurface and workspace. background tasks for anything else running in the repo. i want the panels completely
// seperate from each other, collapasable, organized and updated in real time. maybe buttons for agent tools, for the repo,
// to execute. replayable proceedures? i love the context panel they need to be sperated panels though, bot just a space,
// but tabs on the collapsable panels. like how you click the tab on the right of the screen. i want to eb able to open all
// of them, or none of them."
//
// The rail: one tab per panel on the right edge (the Plan's tab joins it), each with its count or a live dot. A click opens
// or closes that panel alone; all / none at the foot. Open panels stack in the dock column, each with its own header
// (collapse ▾ ▸, close ×). Real time: tasks from idearium.repo.task (rtIn, no fetch), outputs / changes / tools from the
// inject, file, phase and procedure events; only the open panels reload, debounced. Which panels are open and collapsed is
// a per-browser view preference (localStorage, the one thing it may hold); everything shown is read from a route, and the
// procedures are .procedure files (lib/repo-procedures.js).
//
// Reuses, never redraws its own: work-surface.js _wsCard (a proposal with Apply / Reject), repo-tasks.js _rtTree / _rtRow
// (a task row), plan-panel.js _ppContext (the Context card).
// ════════════════════════════════════════════════════════════════════════════

const DOCK_PANELS = [
  ['outputs', 'Outputs', 'proposals and artifacts'],
  ['changes', 'Changes', 'the work surface and the workspace'],
  ['tasks', 'Tasks', 'everything else running in the repo'],
  ['context', 'Context', 'what the agent building is given'],
  ['tools', 'Tools', 'the repo\'s agent tools and procedures'],
  // §DK3 2026-10-17 — James: "like yours but with a control panel." The repo's run (play, pause, rewind) and who answers.
  ['control', 'Control', 'play, pause, rewind; which agent answers'],
];
const DOCK_IDS = DOCK_PANELS.map(p => p[0]);
const DOCK = { uuid: null, open: new Set(), folded: new Set(), data: {}, err: {}, loading: new Set(), toolArg: null, toolOut: {}, toolQ: '', busy: new Set(), timer: null, focus: null };
(function _dockPrefs() {
  try { const o = JSON.parse(localStorage.getItem('idearium.dock.open') || '[]'); for (const k of o) if (DOCK_IDS.includes(k)) DOCK.open.add(k); } catch (_) {}
  try { const f = JSON.parse(localStorage.getItem('idearium.dock.folded') || '[]'); for (const k of f) if (DOCK_IDS.includes(k)) DOCK.folded.add(k); } catch (_) {}
})();
function _dockSave() {
  try { localStorage.setItem('idearium.dock.open', JSON.stringify([...DOCK.open])); localStorage.setItem('idearium.dock.folded', JSON.stringify([...DOCK.folded])); } catch (_) { /* a per-browser convenience */ }
}
function _dockEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _dockQ(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _dockWhen(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { hour12: false, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
function _dockRepo() { return typeof CURRENT_API_REPO !== 'undefined' && CURRENT_API_REPO ? CURRENT_API_REPO : null; }

// ── where it shows: the repo view, as the Plan's tab (plan-panel.js planTabSync calls dockSync) ─────────────────────
function dockShown() {
  const repo = _dockRepo();
  return !!repo && [...document.querySelectorAll('.repo-subtab-btn')].some(b => b.offsetParent !== null);
}
function dockSync() {
  const repo = _dockRepo();
  let rail = document.getElementById('dock-rail'), col = document.getElementById('dock-col');
  if (!dockShown()) { if (rail) rail.hidden = true; if (col) col.hidden = true; return; }
  if (!rail) { rail = document.createElement('div'); rail.id = 'dock-rail'; document.body.appendChild(rail); }
  if (!col) { col = document.createElement('div'); col.id = 'dock-col'; document.body.appendChild(col); }
  if (DOCK.uuid !== repo.uuid) { DOCK.uuid = repo.uuid; DOCK.data = {}; DOCK.err = {}; DOCK.toolOut = {}; DOCK.toolArg = null; for (const k of DOCK.open) dockLoad(k); }
  rail.hidden = false;
  _dockPaintRail();
  _dockPaintCol();
}

// ── the rail ──────────────────────────────────────────────────────────────────────────────────────────────────
function _dockBadge(k) {
  const d = DOCK.data[k];
  const uuid = DOCK.uuid;
  if (k === 'tasks' && typeof _rtTree === 'function' && uuid) {
    const t = _rtTree(uuid); const run = t.filter(x => x.status === 'running' || (x.children || []).some(c => c.status === 'running')).length;
    return run ? `<span class="dk-dot"></span><span class="dk-n">${run}</span>` : (t.length ? `<span class="dk-n">${t.length}</span>` : '');
  }
  if (!d) return '';
  if (k === 'outputs') { const n = (d.proposals || []).length; return n ? `<span class="dk-n warn">${n}</span>` : ''; }
  if (k === 'changes') { const n = d.changed || 0; return n ? `<span class="dk-n">${n}</span>` : ''; }
  if (k === 'tools') { const n = (d.procedures || []).length; return n ? `<span class="dk-n">${n}</span>` : ''; }
  if (k === 'context' && d.live) return '<span class="dk-dot"></span>';
  if (k === 'control' && d.run && d.run.state === 'paused') return '<span class="dk-n warn">⏸</span>';
  return '';
}
function _dockPaintRail() {
  const rail = document.getElementById('dock-rail'); if (!rail) return;
  const planOpen = !!(document.getElementById('plan-panel') || {}).classList?.contains('open');
  const sm = typeof PLANP !== 'undefined' && PLANP.data && DOCK.uuid && PLANP.uuid === DOCK.uuid ? (PLANP.data.summary || {}) : null;
  rail.innerHTML = `<button class="dk-tab${planOpen ? ' on' : ''}" data-dock="plan" title="the Plan (its own window)" onclick="togglePlanPanel()">${sm && sm.building ? '<span class="dk-dot"></span>' : ''}<span class="dk-l">Plan</span>${sm && sm.total ? `<span class="dk-n">${sm.complete || 0}/${sm.total}</span>` : ''}</button>`
    + DOCK_PANELS.map(([k, l, about]) => `<button class="dk-tab${DOCK.open.has(k) ? ' on' : ''}" data-dock="${k}" title="${_dockEsc(`${l} — ${about}`)}" onclick="dockToggle('${k}')">${_dockBadge(k)}<span class="dk-l">${l}</span></button>`).join('')
    + `<div class="dk-foot"><button class="dk-all" title="open every panel" onclick="dockAll(true)">all</button><button class="dk-all" title="close every panel" onclick="dockAll(false)">none</button></div>`;
}

// ── open, close, fold ─────────────────────────────────────────────────────────────────────────────────────────
function dockToggle(k, force) {
  if (!DOCK_IDS.includes(k)) return;
  const on = force === undefined ? !DOCK.open.has(k) : !!force;
  if (on) { DOCK.open.add(k); DOCK.folded.delete(k); dockLoad(k); } else DOCK.open.delete(k);
  _dockSave(); _dockPaintRail(); _dockPaintCol();
}
function dockAll(on) {
  for (const k of DOCK_IDS) { if (on && !DOCK.open.has(k)) { DOCK.open.add(k); dockLoad(k); } if (!on) DOCK.open.delete(k); }
  if (on) DOCK.folded.clear();
  _dockSave(); _dockPaintRail(); _dockPaintCol();
}
function dockFold(k) { if (DOCK.folded.has(k)) DOCK.folded.delete(k); else DOCK.folded.add(k); _dockSave(); _dockPaintCol(); }

// ── the column: the open panels in the rail's order, each its own section ────────────────────────────────────────
function _dockPaintCol() {
  const col = document.getElementById('dock-col'); if (!col) return;
  const open = DOCK_PANELS.filter(([k]) => DOCK.open.has(k));
  col.hidden = !open.length || !dockShown();
  // §0.60.123 PP3 — the Plan panel and the dock side by side, never one over the other (index.html body.dock-col-on)
  document.body.classList.toggle('dock-col-on', !col.hidden);
  if (col.hidden) { col.innerHTML = ''; return; }
  const keep = {}; for (const el of col.querySelectorAll('.dk-body')) keep[el.dataset.dock] = el.scrollTop;
  const argEl = document.getElementById('dk-tool-args'); const argDraft = argEl ? argEl.value : null;
  col.innerHTML = open.map(([k, l, about]) => {
    const folded = DOCK.folded.has(k);
    return `<section class="dk-panel${folded ? ' folded' : ''}" data-dock="${k}">
      <header class="dk-head"><button class="dk-fold" onclick="dockFold('${k}')" title="${folded ? 'expand' : 'collapse'}">${folded ? '▸' : '▾'}</button>
        <b>${l}</b><span class="dk-about">${_dockEsc(about)}</span>${_dockBadge(k)}<span class="dk-grow"></span>
        <button class="dk-x" title="reload" onclick="dockLoad('${k}')">${DOCK.loading.has(k) ? '◌' : '↻'}</button>
        <button class="dk-x" title="close this panel" onclick="dockToggle('${k}', false)">×</button></header>
      ${folded ? '' : `<div class="dk-body" data-dock="${k}">${DOCK.err[k] ? `<div class="dk-empty dk-bad">${_dockEsc(DOCK.err[k])}</div>` : ''}${_dockBody(k)}</div>`}
    </section>`;
  }).join('');
  for (const el of col.querySelectorAll('.dk-body')) if (keep[el.dataset.dock]) el.scrollTop = keep[el.dataset.dock];
  const a2 = document.getElementById('dk-tool-args'); if (a2 && argDraft != null) a2.value = argDraft;
}
function _dockPaintOne(k) {
  const el = document.querySelector(`#dock-col .dk-body[data-dock="${k}"]`);
  if (!el) return _dockPaintCol();
  const keep = el.scrollTop;
  el.innerHTML = `${DOCK.err[k] ? `<div class="dk-empty dk-bad">${_dockEsc(DOCK.err[k])}</div>` : ''}${_dockBody(k)}`;
  el.scrollTop = keep;
  const head = el.parentElement && el.parentElement.querySelector('.dk-head');
  if (head) { const old = head.querySelectorAll('.dk-dot, .dk-n'); old.forEach(n => n.remove()); const tmp = document.createElement('span'); tmp.innerHTML = _dockBadge(k); head.querySelector('.dk-grow').before(...tmp.childNodes); }
}

// ── reading: one route per panel, only for open panels ───────────────────────────────────────────────────────────
async function dockLoad(k) {
  const repo = _dockRepo(); if (!repo || !DOCK_IDS.includes(k)) return;
  const uuid = repo.uuid;
  DOCK.loading.add(k); _dockPaintRail();
  try {
    if (k === 'outputs') {
      const [ws, art] = await Promise.all([
        api(`/api/repos/${uuid}/worksurface`, {}, 30000),
        api(`/api/repos/${uuid}/artifacts?limit=20`, {}, 12000).catch(e => ({ error: e.message })),
      ]);
      const files = (ws && ws.files) || [];
      if (typeof WSURF !== 'undefined' && (WSURF.uuid === uuid || !WSURF.uuid)) { WSURF.uuid = uuid; WSURF.data = ws; }
      DOCK.data.outputs = { proposals: files.filter(f => f.status === 'proposed' || f.status === 'staged'), recent: files.filter(f => f.status !== 'proposed' && f.status !== 'staged').slice(0, 8),
        artifacts: (art && art.artifacts) || [], artError: art && art.error ? art.error : null, repoScoped: !!(art && art.repoScoped) };
    } else if (k === 'changes') {
      const [st, ch] = await Promise.all([
        api(`/api/repos/${uuid}/files/state`, {}, 30000),
        api(`/api/repos/${uuid}/changes?limit=25`, {}, 30000).catch(e => ({ error: e.message })),
      ]);
      const states = (st && st.states) || {};
      const changedFiles = Object.entries(states).filter(([, s]) => s.state !== 'committed').map(([p, s]) => ({ path: p, state: s.state, pending: (s.pending || []).length, staged: (s.staged || []).length }));
      DOCK.data.changes = { files: changedFiles.sort((a, b) => a.state.localeCompare(b.state) || a.path.localeCompare(b.path)), counts: (st && st.counts) || {}, version: st && st.version, versionNote: st && st.versionNote,
        records: (ch && ch.changes) || [], recordsError: ch && ch.error ? ch.error : null, changed: changedFiles.length };
    } else if (k === 'tasks') {
      if (typeof rtLoad === 'function') await rtLoad(uuid);
      DOCK.data.tasks = { at: Date.now() };
    } else if (k === 'context') {
      const plan = await api(`/api/repos/${uuid}/plan`, {}, 30000);
      const steps = (plan && plan.steps) || [];
      DOCK.data.context = { steps, live: steps.some(s => (s.ledger || []).some(l => l.context && (s.current || l.state === 'building'))) };
    } else if (k === 'control') {
      const [run, st] = await Promise.all([api(`/api/repos/${uuid}/run`, {}, 15000), api(`/api/repos/${uuid}/agent/settings`, {}, 15000).catch(e => ({ error: e.message }))]);
      DOCK.data.control = { run: (run && run.run) || {}, desktop: run && run.desktop, running: (run && run.running) || [], settings: st && !st.error ? st : null, settingsError: st && st.error ? st.error : null };
    } else if (k === 'tools') {
      const [tl, pr, rn] = await Promise.all([
        api(`/api/repos/${uuid}/agent/tools`, {}, 15000).catch(e => ({ error: e.message })),
        api(`/api/repos/${uuid}/procedures`, {}, 15000),
        api(`/api/repos/${uuid}/runs?limit=5`, {}, 15000).catch(() => ({ runs: [] })),
      ]);
      DOCK.data.tools = { tools: (tl && tl.tools) || [], toolsError: tl && tl.error ? tl.error : null, scope: tl && tl.scope, procedures: (pr && pr.procedures) || [], runs: (rn && rn.runs) || [] };
      DOCK.data.procedures = DOCK.data.tools.procedures;
    }
    DOCK.err[k] = null;
  } catch (e) { DOCK.err[k] = `could not read: ${e.message}`; }
  DOCK.loading.delete(k);
  if (DOCK.uuid !== uuid) return;
  _dockPaintRail(); if (DOCK.open.has(k)) _dockPaintOne(k);
}

// ── the bodies ────────────────────────────────────────────────────────────────────────────────────────────────
// ── §0.60.123 PP3 — James: "like the panels should remain interconnected." One focus the panels read: a piece picked in
// the Plan narrows Changes and Outputs to its file; a run picked there shows its own context. Said on each panel, cleared
// with one click; not saved (a view of now, not a preference).
function dockFocus(f) {
  DOCK.focus = f && (f.file || f.runId) ? { file: f.file || null, runId: f.runId || null, phase: f.phase || null } : null;
  if (!DOCK.uuid) DOCK.uuid = (_dockRepo() || {}).uuid || null;
  _dockPaintCol();
}
function _dockFocusBar(k) {
  const f = DOCK.focus; if (!f) return '';
  if ((k === 'changes' || k === 'outputs') && f.file) return `<div class="dk-focus">from the Plan: <b>${_dockEsc(f.file)}</b>${f.phase ? ` · ${_dockEsc(f.phase)}` : ''} <a href="#" onclick="dockFocus(null);return false">show all</a></div>`;
  if (k === 'context' && f.runId) return `<div class="dk-focus">from the Plan: run <b>${_dockEsc(f.runId)}</b> <a href="#" onclick="dockFocus(null);return false">the live one</a></div>`;
  return '';
}
const _dockMatch = (x, file) => !file || (x && (x.path === file || x.file === file || x.relPath === file));
function _dockBody(k) {
  const d = DOCK.data[k];
  if (k === 'tasks') return _dockTasks();
  if (!d) return `<div class="dk-empty">${DOCK.loading.has(k) ? 'reading…' : 'not read yet'}</div>`;
  const file = DOCK.focus && DOCK.focus.file;
  if (k === 'outputs') return _dockFocusBar(k) + _dockOutputs(file ? { ...d, proposals: (d.proposals || []).filter(x => _dockMatch(x, file)), recent: (d.recent || []).filter(x => _dockMatch(x, file)) } : d);
  if (k === 'changes') return _dockFocusBar(k) + _dockChanges(file ? { ...d, files: (d.files || []).filter(x => _dockMatch(x, file)), records: (d.records || []).filter(x => _dockMatch(x, file)) } : d);
  if (k === 'context') return _dockFocusBar(k) + (typeof _ppContext === 'function' ? _ppContext(d.steps, { runId: DOCK.focus && DOCK.focus.runId }) : '<div class="dk-empty">the Context card is not loaded (plan-panel.js)</div>');
  if (k === 'tools') return _dockTools(d);
  if (k === 'control') return _dockControl(d);
  return '';
}
function _dockOutputs(d) {
  const cards = d.proposals.length && typeof _wsCard === 'function'
    ? `<div class="dk-sec">proposals · ${d.proposals.length} waiting</div><div class="cs-diffs">${d.proposals.map((f, i) => _wsCard(f, i)).join('')}</div>`
    : `<div class="dk-sec">proposals</div><div class="dk-empty">nothing waiting — what the agent proposes shows here with Apply / Reject</div>`;
  const recent = d.recent.length ? `<div class="dk-sec">settled</div>${d.recent.map(f => `<div class="dk-row"><span class="dk-st st-${_dockEsc(f.status)}">${_dockEsc(f.status)}</span><a href="#" onclick="${typeof wsOpenInCode === 'function' ? `wsOpenInCode('${_dockQ(f.path)}')` : ''};return false">${_dockEsc(f.path)}</a></div>`).join('')}` : '';
  const arts = d.artError ? `<div class="dk-empty dk-bad">artifacts: ${_dockEsc(d.artError)}</div>`
    : d.artifacts.length ? d.artifacts.map(a => `<details class="dk-art"><summary><span class="dk-st">${_dockEsc(a.lang || '··')}</span> ${_dockEsc(a.name || a.hash.slice(0, 8))} <span class="dk-dim">${a.lines} lines · ${_dockWhen(a.ts)}</span></summary><pre>${_dockEsc(a.preview)}</pre>${a.chat_url ? `<a href="${_dockEsc(a.chat_url)}" target="_blank" rel="noopener">the chat ↗</a>` : ''}</details>`).join('')
    : '<div class="dk-empty">no artifacts saved yet</div>';
  return `${cards}${recent}<div class="dk-sec">artifacts${d.repoScoped ? '' : ' <span class="dk-dim" title="Guardian keeps artifacts by chat, not by repo">· the latest from every chat, not only this repo</span>'}</div>${arts}`;
}
function _dockChanges(d) {
  const c = d.counts || {};
  const head = `<div class="dk-dim">${['modified', 'new', 'deleted', 'pending', 'uncoded'].filter(s => c[s]).map(s => `${c[s]} ${s}`).join(' · ') || 'nothing uncommitted'}${d.version ? ` · against version <code>${_dockEsc(String(d.version).slice(0, 10))}</code>` : ''}</div>${d.versionNote ? `<div class="dk-dim">${_dockEsc(d.versionNote)}</div>` : ''}`;
  const ws = `<div class="dk-sec">workspace · files not in the last version</div>${d.files.length ? d.files.slice(0, 80).map(f => `<div class="dk-row"><span class="dk-st st-${_dockEsc(f.state)}">${_dockEsc(f.state)}</span><a href="#" onclick="${typeof wsOpenInCode === 'function' ? `wsOpenInCode('${_dockQ(f.path)}')` : ''};return false">${_dockEsc(f.path)}</a>${f.pending ? `<span class="dk-dim"> · ${f.pending} proposal${f.pending === 1 ? '' : 's'}</span>` : ''}${f.staged ? `<span class="dk-dim"> · ${f.staged} staged</span>` : ''}</div>`).join('') + (d.files.length > 80 ? `<div class="dk-dim">… ${d.files.length - 80} more</div>` : '') : '<div class="dk-empty">every file matches the last version</div>'}`;
  const rec = `<div class="dk-sec">work surface · each change the agent made</div>${d.recordsError ? `<div class="dk-empty dk-bad">${_dockEsc(d.recordsError)}</div>` : d.records.length ? d.records.map(r => `<div class="dk-row"><span class="dk-st st-${_dockEsc(r.status)}">${_dockEsc(r.status)}</span>${_dockEsc(r.op === 'delete' ? 'delete ' : '')}<a href="#" onclick="${typeof wsOpenInCode === 'function' ? `wsOpenInCode('${_dockQ(r.path)}')` : ''};return false">${_dockEsc(r.path)}</a><span class="dk-dim"> · ${_dockEsc(r.agent || r.provider || '')}${r.lines ? ` · ${_dockEsc(typeof r.lines === 'object' ? `+${r.lines.added || 0} −${r.lines.removed || 0}` : r.lines)}` : ''} · ${_dockWhen(r.at)}</span>${r.goal ? `<div class="dk-dim dk-why">${_dockEsc(String(r.goal).slice(0, 140))}</div>` : ''}</div>`).join('') : '<div class="dk-empty">no change records yet</div>'}`;
  return head + ws + rec;
}
function _dockTasks() {
  const uuid = DOCK.uuid;
  if (typeof _rtTree !== 'function' || typeof _rtRow !== 'function') return '<div class="dk-empty">the task list is not loaded (repo-tasks.js)</div>';
  const tree = _rtTree(uuid);
  return tree.length ? `<div class="rt-list">${tree.map(t => _rtRow(t)).join('')}</div>` : '<div class="dk-empty">nothing running — an agent chat, a phase build, a review or a repair shows here as it happens</div>';
}
function _dockTools(d) {
  const q = DOCK.toolQ.trim().toLowerCase();
  const tools = d.tools.filter(t => !q || `${t.name} ${t.summary || ''} ${t.groupTitle || ''}`.toLowerCase().includes(q));
  const groups = new Map(); for (const t of tools) { if (!groups.has(t.groupTitle || t.group)) groups.set(t.groupTitle || t.group, []); groups.get(t.groupTitle || t.group).push(t); }
  const arg = DOCK.toolArg;
  const runner = arg ? `<div class="dk-run"><div class="dk-sec">run ${_dockEsc(arg.name)}</div>${arg.summary ? `<div class="dk-dim">${_dockEsc(arg.summary)}</div>` : ''}
      <textarea id="dk-tool-args" rows="4" spellcheck="false">${_dockEsc(arg.draft)}</textarea>
      <div class="dk-acts"><button class="action-btn" ${DOCK.busy.has(arg.name) ? 'disabled' : ''} onclick="dockRunTool()">${DOCK.busy.has(arg.name) ? 'running…' : '▶ run'}</button><button class="action-btn" onclick="dockSaveToolAsProcedure()" title="keep this call as a one-step procedure">keep as procedure</button><button class="action-btn" onclick="DOCK.toolArg=null;_dockPaintOne('tools')">close</button></div>
      ${DOCK.toolOut[arg.name] ? `<pre class="dk-out${DOCK.toolOut[arg.name].ok ? '' : ' dk-bad'}">${_dockEsc(DOCK.toolOut[arg.name].text)}</pre>` : ''}</div>` : '';
  const procs = `<div class="dk-sec">procedures · tool calls kept to run again in order</div>${d.procedures.length ? d.procedures.map(p => { const last = (p.runs || []).slice(-1)[0];
      return `<div class="dk-proc"><b>${_dockEsc(p.name)}</b><span class="dk-dim"> · ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} · ${p.runCount || 0} run${p.runCount === 1 ? '' : 's'}${last ? ` · last ${last.ok ? '✓' : `✗ at step ${last.stoppedAt}`}` : ''}</span>
        <div class="dk-dim">${p.steps.map(s => _dockEsc(s.tool.replace(/^idearium\./, '').replace(/\.tool$/, ''))).join(' → ')}</div>
        <div class="dk-acts"><button class="action-btn" ${DOCK.busy.has(p.id) ? 'disabled' : ''} onclick="dockReplay('${_dockQ(p.id)}')">${DOCK.busy.has(p.id) ? 'replaying…' : '▶ replay'}</button><button class="action-btn" onclick="dockRemoveProcedure('${_dockQ(p.id)}')" title="archived, never deleted">archive</button></div>
        ${last && !last.ok ? `<div class="dk-dim dk-bad">${_dockEsc((last.results || []).slice(-1)[0]?.error || '')}</div>` : ''}</div>`; }).join('') : '<div class="dk-empty">none yet — keep a run\'s tool calls (below) or one tool call (▶ run, then keep)</div>'}
    ${d.runs.length ? `<div class="dk-sec">keep a run as a procedure</div>${d.runs.map(r => `<div class="dk-row"><span class="dk-st st-${_dockEsc(r.status)}">${_dockEsc(r.status)}</span><span class="dk-why">${_dockEsc(String(r.goal || r.runId).slice(0, 80))}</span><span class="dk-dim"> · ${r.stepCount} calls</span> <button class="dk-mini" onclick="dockFromRun('${_dockQ(r.runId)}')">keep</button></div>`).join('')}` : ''}`;
  const list = d.toolsError ? `<div class="dk-empty dk-bad">tools: ${_dockEsc(d.toolsError)}</div>`
    : [...groups.entries()].map(([g, ts]) => `<div class="dk-sec">${_dockEsc(g)} · ${ts.length}</div><div class="dk-btns">${ts.map(t => `<button class="dk-tool${t.inScope === false ? ' off' : ''}" ${t.inScope === false ? 'disabled title="outside this repo\'s tool scope"' : `title="${_dockEsc(t.summary || t.name)}"`} onclick="dockPickTool('${_dockQ(t.name)}')">${_dockEsc(t.name.replace(/^idearium\./, '').replace(/\.tool$/, ''))}</button>`).join('')}</div>`).join('') || '<div class="dk-empty">no tool matches</div>';
  return `${runner}${procs}<div class="dk-sec">tools${d.scope ? ` · scope ${_dockEsc(d.scope)}` : ''}</div><input class="field-input dk-q" placeholder="find a tool" value="${_dockEsc(DOCK.toolQ)}" oninput="DOCK.toolQ=this.value;clearTimeout(DOCK.qT);DOCK.qT=setTimeout(()=>{_dockPaintOne('tools');const i=document.querySelector('.dk-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}},250)">${list}`;
}

// ── §DK3 the control panel: the repo's run (lib/repo-run-state.js through POST /run/:op) and the agent's settings ─────────────
function _dockControl(d) {
  const r = d.run || {};
  const paused = r.state === 'paused';
  const b = (op, label, title) => `<button class="action-btn" ${DOCK.busy.has('run') ? 'disabled' : ''} title="${_dockEsc(title)}" onclick="dockRun('${op}')">${label}</button>`;
  const run = `<div class="dk-sec">the repo's work</div>
    <div class="dk-row"><span class="dk-st st-${paused ? 'staged' : 'done'}">${paused ? 'paused' : 'playing'}</span>${paused && r.since ? `<span class="dk-dim">since ${_dockWhen(r.since)}${r.by ? ` · by ${_dockEsc(r.by)}` : ''}${r.reason ? ` · ${_dockEsc(r.reason)}` : ''}</span>` : '<span class="dk-dim">agent calls, phase attempts and spec chunks start as they come</span>'}</div>
    ${r.snapshot ? `<div class="dk-dim">rewind point: version <code>${_dockEsc(String(r.snapshot).slice(0, 12))}</code>${r.checkpoint ? ` · desktop checkpoint ${_dockEsc(r.checkpoint)}` : ''}</div>` : ''}
    <div class="dk-acts">${paused ? b('play', '▶ play', 'everything waiting goes on where it stopped') : b('pause', '⏸ pause', 'a version is taken first; work in flight finishes its step, nothing new starts')}${b('rewind', '⏮ rewind', 'put the repo back to its rewind point (the pause snapshot) — asks first')}</div>
    <div class="dk-dim">${d.running.length ? `${d.running.length} running now: ${d.running.slice(0, 4).map(t => _dockEsc(t.title || t.kind)).join(' · ')}` : 'nothing running now'}${d.desktop ? ` · desktop ${_dockEsc(d.desktop)}` : ''}</div>`;
  const st = d.settings;
  const sel = (key, opts, cur) => `<select class="field-input dk-sel" data-key="${key}" onchange="dockSetting('${key}', this.value)">${opts.map(o => `<option value="${_dockEsc(o)}"${o === cur ? ' selected' : ''}>${_dockEsc(o)}</option>`).join('')}</select>`;
  const agent = d.settingsError ? `<div class="dk-empty dk-bad">agent settings: ${_dockEsc(d.settingsError)}</div>` : st ? `<div class="dk-sec">who answers</div>
    ${st.settingsFrom ? `<div class="dk-dim">these settings belong to the original repo (${_dockEsc(st.settingsFrom)}): change them there</div>` : ''}
    <div class="dk-row"><span class="dk-st">agent</span>${sel('provider', [...new Set(['auto', ...(st.providers || []).map(p => typeof p === 'string' ? p : p.id || p.name)].filter(Boolean))], st.provider)}${st.provider === 'ollama' && st.ollamaModel ? `<span class="dk-dim"> · ${_dockEsc(st.ollamaModel)}</span>` : ''}</div>
    <div class="dk-row"><span class="dk-st">tools</span>${sel('toolScope', st.toolScopes || ['all', 'project'], st.toolScope)}</div>
    <div class="dk-row"><span class="dk-st">its code</span>${sel('injectMode', st.modes || ['review'], st.injectMode)}<span class="dk-dim"> review: you apply · auto: lands when its checks pass</span></div>` : '';
  return run + agent;
}
async function dockRun(op) {
  const repo = _dockRepo(); if (!repo) return;
  if (op === 'rewind' && !confirm('Rewind this repo to its rewind point? Its files go back to that version (the rewind is itself a version: nothing is lost).')) return;
  DOCK.busy.add('run'); _dockPaintOne('control');
  try { await api(`/api/repos/${repo.uuid}/run/${op}`, { method: 'POST', body: JSON.stringify({ by: 'person', reason: 'from the Code tab control panel' }) }, 120000); toast(`${op} — done`, 'ok'); }
  catch (e) { toast(`${op} refused: ${e.message}`, 'err'); }
  DOCK.busy.delete('run'); dockLoad('control');
}
async function dockSetting(key, value) {
  const repo = _dockRepo(); if (!repo) return;
  try { await api(`/api/repos/${repo.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ [key]: value }) }, 15000); toast(`${key}: ${value}`, 'ok'); }
  catch (e) { toast(`${key} not changed: ${e.message}`, 'err'); }
  dockLoad('control');
}

// ── tools and procedures: every one through a route (the agent's door, the repo's scope) ──────────────────────────
function dockPickTool(name) {
  const t = ((DOCK.data.tools || {}).tools || []).find(x => x.name === name);
  const skel = {}; for (const p of (t && t.params) || []) skel[p] = '';
  DOCK.toolArg = { name, summary: t && t.summary, draft: JSON.stringify(skel, null, 2) };
  _dockPaintOne('tools');
}
function _dockArgs() {
  const el = document.getElementById('dk-tool-args'); const raw = el ? el.value : (DOCK.toolArg && DOCK.toolArg.draft) || '{}';
  if (DOCK.toolArg) DOCK.toolArg.draft = raw;
  let args; try { args = raw.trim() ? JSON.parse(raw) : {}; } catch (e) { throw new Error(`the arguments are not JSON: ${e.message}`); }
  for (const [k, v] of Object.entries(args)) if (v === '') delete args[k];   // an empty skeleton field is not an argument
  return args;
}
async function dockRunTool() {
  const repo = _dockRepo(); const a = DOCK.toolArg; if (!repo || !a) return;
  let args; try { args = _dockArgs(); } catch (e) { DOCK.toolOut[a.name] = { ok: false, text: e.message }; return _dockPaintOne('tools'); }
  DOCK.busy.add(a.name); _dockPaintOne('tools');
  try {
    const r = await api(`/api/repos/${repo.uuid}/agent/tools/run`, { method: 'POST', body: JSON.stringify({ name: a.name, args }) }, 90000);
    const res = r.result || {};
    const okk = !(res.ok === false || res.error);
    DOCK.toolOut[a.name] = { ok: okk, text: `${okk ? '✓' : '✗'} ${r.ms} ms\n${JSON.stringify(res.result !== undefined ? res.result : res, null, 2).slice(0, 6000)}`, args };
  } catch (e) { DOCK.toolOut[a.name] = { ok: false, text: e.message }; }
  DOCK.busy.delete(a.name); _dockPaintOne('tools');
}
async function dockSaveToolAsProcedure() {
  const repo = _dockRepo(); const a = DOCK.toolArg; if (!repo || !a) return;
  let args; try { args = _dockArgs(); } catch (e) { toast(e.message, 'err'); return; }
  const name = typeof themedPrompt === 'function' ? await themedPrompt('name this procedure:', `${a.name.replace(/^idearium\./, '')}`) : prompt('name this procedure', a.name);
  if (!name) return;
  try { await api(`/api/repos/${repo.uuid}/procedures`, { method: 'POST', body: JSON.stringify({ name, steps: [{ tool: a.name, args }] }) }); toast(`kept: ${name}`, 'ok'); }
  catch (e) { toast(`not kept: ${e.message}`, 'err'); }
  dockLoad('tools');
}
async function dockFromRun(runId) {
  const repo = _dockRepo(); if (!repo) return;
  try {
    const r = await api(`/api/repos/${repo.uuid}/procedures/from-run`, { method: 'POST', body: JSON.stringify({ runId }) });
    toast(`kept ${r.procedure.steps.length} call${r.procedure.steps.length === 1 ? '' : 's'}${(r.cut || []).length ? ` — ${r.cut.length} left out: their arguments were cut when the run kept them` : ''}`, (r.cut || []).length ? 'warn' : 'ok');
  } catch (e) { toast(`not kept: ${e.message}`, 'err'); }
  dockLoad('tools');
}
async function dockReplay(id) {
  const repo = _dockRepo(); if (!repo) return;
  DOCK.busy.add(id); _dockPaintOne('tools');
  try {
    const r = await api(`/api/repos/${repo.uuid}/procedures/${encodeURIComponent(id)}/replay`, { method: 'POST', body: '{}' }, 600000);
    toast(r.ok ? `replayed ${r.procedure.name}: ${r.run.results.length} step${r.run.results.length === 1 ? '' : 's'} ✓` : `${r.procedure.name} stopped at step ${r.run.stoppedAt} of ${r.run.of}: ${(r.run.results.slice(-1)[0] || {}).error || ''}`, r.ok ? 'ok' : 'err');
  } catch (e) { toast(`replay failed: ${e.message}`, 'err'); }
  DOCK.busy.delete(id); dockLoad('tools');
}
async function dockRemoveProcedure(id) {
  const repo = _dockRepo(); if (!repo || !confirm('archive this procedure? (kept on disk, hidden from the list)')) return;
  try { await api(`/api/repos/${repo.uuid}/procedures/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { toast(e.message, 'err'); }
  dockLoad('tools');
}

// ── real time ─────────────────────────────────────────────────────────────────────────────────────────────────
/** a task changed (app.js passes idearium.repo.task here after rtIn): repaint, no fetch */
function dockTaskIn(p) {
  if (!p || p.repoUuid !== DOCK.uuid) return;
  _dockPaintRail();
  if (DOCK.open.has('tasks') && !DOCK.folded.has('tasks')) _dockPaintOne('tasks');
}
const _DOCK_EV = [
  [/^repo\.(inject\.|file\.|edit\.|worksurface)|^repo\.version\.|^edit\./, ['outputs', 'changes']],
  [/^repo\.phase\.run|^repo\.prove\.|^run\./, ['context', 'outputs', 'changes']],
  [/^repo\.(procedure\.|tool\.ran)/, ['tools']],
  [/^repo\.run\b|^repo\.agent\.settings/, ['control']],
];
/** an Idearium event (app.js refreshOnEvent): reload only the open panels it concerns, once per burst */
function dockOnEvent(ev) {
  if (!ev || !ev.type || !DOCK.uuid) return;
  const u = ev.payload && ev.payload.repoUuid; if (u && u !== DOCK.uuid) return;
  const t = ev.type.replace(/^idearium\./, '');
  const want = new Set(); for (const [re, ks] of _DOCK_EV) if (re.test(t)) for (const k of ks) if (DOCK.open.has(k)) want.add(k);
  if (!want.size) return;
  DOCK.pending = new Set([...(DOCK.pending || []), ...want]);
  clearTimeout(DOCK.timer);
  DOCK.timer = setTimeout(() => { const ks = [...DOCK.pending]; DOCK.pending = new Set(); for (const k of ks) dockLoad(k); }, 600);
}
