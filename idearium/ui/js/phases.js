// ════════════════════════════════════════════════════════════════════════════
// §PHASES — idearium/ui/js/phases.js (0.39.271 P4)
// UUID: nexus-idearium-ui-phases-v1-0000-2026-0927-jamesbrooks-001
// Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (P4)
//
// James: "i want the roadmap and phases combined into a fully enterprise grade
// manager." One tab over every phasemap of the open repo — for a nexus repo, of
// NEXUS (idearium/repo/phases.js decides which files). Nothing here holds a phase:
// every row comes from GET /api/repos/:uuid/phases, every change is a POST that
// rewrites the phasemap file (a repo's own files, or NEXUS's live tree through the
// apply gate) and is read back.
//
//   summary      counts, progress, where edits go
//   views        Board (ready · blocked · active · complete) · Layers (dependency
//                order) · Table (sortable) · Maps (one card per phasemap)
//   filters      text, status, map, "this system's phases" (nexus systems), ready only
//   detail pane  the phase: status, depends on / needed by, blocked by, closes, files,
//                systems, runs; Build (Versionium snapshot first, then the repo's agent)
//   add          a phase appended to a chosen map, read back by loom's parser
// ════════════════════════════════════════════════════════════════════════════

const PHASES = { uuid: null, data: null, view: 'board', open: null, sort: { k: 'order', dir: 1 },
  filter: { q: '', status: 'all', map: 'all', mine: true, ready: false }, busy: false, adding: false };
const _PH_STATUS_COLOR = { complete: 'var(--mint)', active: 'var(--sky)', planned: 'var(--text2)' };
const _PH_RUN_COLOR = { building: 'var(--sky)', replied: 'var(--mint)', failed: 'var(--coral)', refused: 'var(--coral)' };
const _phShortMap = (p) => String(p || '').split('/').pop().replace(/-phasemap\.spec$|\.spec$/, '');
const _phKey = (p) => String(p.phase_key || '').split('_')[0];

async function renderRepoPhases(repo, { keepScroll = false } = {}) {
  const el = document.getElementById('repo-subtab-phases');
  if (!el || !repo) return;
  const forUuid = repo.uuid;
  if (PHASES.uuid !== forUuid) {
    Object.assign(PHASES, { uuid: forUuid, data: null, open: null, adding: false });
    PHASES.filter = { q: '', status: 'all', map: 'all', mine: true, ready: false };
    // all of NEXUS is hundreds of phases: open on what is left to do
    if (repo.nexusSelf && repo.nexusSelf.role === 'parent') PHASES.filter.status = 'open';
  }
  const scrollTop = keepScroll ? el.scrollTop : 0;
  if (!PHASES.data) el.innerHTML = `<div class="detail-empty">reading phasemaps…</div>`;
  let d;
  try { d = await api(`/api/repos/${forUuid}/phases`, {}, 30000); }
  catch (e) {
    if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'phases') return;
    el.innerHTML = `<div class="ds"><div class="ds-label">phases</div><div class="ds-mono">could not read this repo's phasemaps: ${escapeHtml(e.message)}</div></div>`;
    return;
  }
  if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'phases') return;
  PHASES.data = d;
  if (typeof loadAgentOptions === 'function') loadAgentOptions();
  _phPaint();
  el.scrollTop = scrollTop;
}

function _phFiltered() {
  const d = PHASES.data; if (!d) return [];
  const f = PHASES.filter; const q = f.q.trim().toLowerCase();
  return d.phases.filter(p => {
    if (d.scope.system && f.mine && !p.mine) return false;
    if (f.map !== 'all' && p.map !== f.map) return false;
    if (f.status === 'open' && p.status === 'complete') return false;
    if (f.status === 'blocked' && !(p.status !== 'complete' && p.blocked_by.length)) return false;
    if (['planned', 'active', 'complete'].includes(f.status) && p.status !== f.status) return false;
    if (f.ready && !p.ready) return false;
    if (q && !`${p.phase_key} ${p.title} ${p.name || ''} ${p.map} ${(p.closes || []).join(' ')} ${(p.files || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function _phPaint() {
  const el = document.getElementById('repo-subtab-phases');
  const d = PHASES.data; if (!el || !d) return;
  const s = d.summary; const list = _phFiltered();
  const pct = s.total ? Math.round(100 * s.complete / s.total) : 0;
  const chip = (label, n, color, click) => `<span class="ph-chip" ${click ? `onclick="${click}"` : ''} style="${color ? `color:${color};` : ''}${click ? 'cursor:pointer;' : ''}">${escapeHtml(label)} <b>${n}</b></span>`;
  const via = d.editVia === 'apply-gate'
    ? 'edits write NEXUS\'s live tree through the apply gate — recorded, reversible (Nexus applies)'
    : 'edits write this repo\'s own phasemap files';
  const f = PHASES.filter;
  const mapOpts = d.maps.map(m => `<option value="${escapeHtml(m.path)}" ${f.map === m.path ? 'selected' : ''}>${escapeHtml(_phShortMap(m.path))} (${m.summary.total})</option>`).join('');
  const views = ['board', 'layers', 'table', 'maps'].map(v => `<button class="ph-view ${PHASES.view === v ? 'on' : ''}" onclick="phasesView('${v}')">${v}</button>`).join('');

  const header = `<div class="ph-head">
      <div class="ph-title">phases · ${escapeHtml(d.scope.label)} <span>${s.maps} phasemap${s.maps === 1 ? '' : 's'} · ${s.total} phases${d.scope.system ? ` · ${s.mine} tagged ${escapeHtml(d.scope.system)}` : ''}</span></div>
      <div class="ph-bar"><div style="width:${pct}%"></div></div>
      <div class="ph-chips">
        ${chip('complete', s.complete, 'var(--mint)', "phasesFilter('status','complete')")}
        ${chip('active', s.active, 'var(--sky)', "phasesFilter('status','active')")}
        ${chip('planned', s.planned, 'var(--text2)', "phasesFilter('status','planned')")}
        ${chip('ready', s.ready, 'var(--mint)', "phasesFilter('ready',true)")}
        ${chip('blocked', s.blocked, 'var(--amber)', "phasesFilter('status','blocked')")}
        ${chip('builds', s.runs || 0, 'var(--text2)')}
        <span class="ph-via">${pct}% complete · ${escapeHtml(via)}</span>
      </div>
    </div>`;
  const toolbar = `<div class="ph-tools">
      <input type="text" placeholder="search id, name, map, closes, files…" value="${escapeHtml(f.q)}" oninput="phasesFilter('q',this.value)">
      <select onchange="phasesFilter('status',this.value)">${[['all', 'every status'], ['open', 'not complete'], ['planned', 'planned'], ['active', 'active'], ['blocked', 'blocked'], ['complete', 'complete']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select onchange="phasesFilter('map',this.value)"><option value="all">every phasemap</option>${mapOpts}</select>
      ${d.scope.system ? `<label><input type="checkbox" ${f.mine ? 'checked' : ''} onchange="phasesFilter('mine',this.checked)"> ${escapeHtml(d.scope.system)}'s only</label>` : ''}
      <label><input type="checkbox" ${f.ready ? 'checked' : ''} onchange="phasesFilter('ready',this.checked)"> ready only</label>
      <span class="ph-views">${views}</span>
      <button class="action-btn" onclick="phasesAddOpen()">+ phase</button>
    </div>`;

  let body;
  if (!d.phases.length) {
    body = `<div class="ds"><div class="ds-label">no phases</div><div class="ds-mono">${d.scope.source === 'nexus'
      ? 'No phasemap in the NEXUS snapshot tags this system. Phasemaps are docs/*phasemap*.spec.'
      : 'This repo has no *phasemap*.spec file. "+ phase" starts roadmap-phasemap.spec; an idea iteration can also be added from the Idea tab.'}${(d.skipped || []).length ? `\n\nnot read:\n${d.skipped.map(x => `${x.path} — ${x.reason}`).join('\n')}` : ''}</div></div>`;
  } else if (PHASES.view === 'maps') body = _phMaps(d);
  else if (PHASES.view === 'table') body = _phTable(list);
  else if (PHASES.view === 'layers') body = _phLayers(list);
  else body = _phBoard(list);

  const warn = (d.warnings || []).filter(w => w.type !== 'unresolved_dependency');
  const notes = warn.length ? `<details class="ds"><summary class="ds-label" style="cursor:pointer">notes (${warn.length})</summary><div class="ds-mono">${warn.slice(0, 80).map(w => escapeHtml(`${w.type} · ${w.map ? _phShortMap(w.map) + ' · ' : ''}${w.phase || (w.phases || []).join(', ')}${w.token ? ' → ' + w.token : ''}`)).join('\n')}</div></details>` : '';

  el.innerHTML = `<div class="ph-wrap">${header}${toolbar}
      ${PHASES.adding ? _phAddForm(d) : ''}
      <div class="ph-main ${PHASES.open ? 'with-detail' : ''}">
        <div class="ph-list">${body}<div class="ph-count">${list.length} of ${d.phases.length} shown</div>${notes}</div>
        ${PHASES.open ? `<aside class="ph-detail" id="ph-detail">${_phDetail(d, PHASES.open)}</aside>` : ''}
      </div></div>`;
}

function _phCard(p) {
  const run = p.lastRun;
  return `<div class="ph-card ${PHASES.open === p.uuid ? 'open' : ''}" onclick="phasesOpen('${escapeHtml(p.uuid)}')" title="${escapeHtml(p.map)}:${p.line}">
    <div class="ph-card-top"><span class="ph-key" style="color:${_PH_STATUS_COLOR[p.status]}">${escapeHtml(_phKey(p))}</span><span class="ph-map">${escapeHtml(_phShortMap(p.map))}</span></div>
    <div class="ph-card-title">${escapeHtml(p.name || p.title)}</div>
    <div class="ph-card-foot">
      ${p.blocked_by.length && p.status !== 'complete' ? `<span style="color:var(--amber)">blocked by ${p.blocked_by.length}</span>` : p.ready ? '<span style="color:var(--mint)">ready</span>' : ''}
      ${(p.closes || []).length ? `<span>closes ${escapeHtml(p.closes.join(' '))}</span>` : ''}
      ${run ? `<span style="color:${_PH_RUN_COLOR[run.state] || 'var(--text3)'}">build ${escapeHtml(run.state)}</span>` : ''}
      ${p.status !== 'complete' ? `<button class="ph-quick" title="snapshot, then the repo's agent builds it" ${PHASES.busy ? 'disabled' : ''} onclick="event.stopPropagation();phasesBuildQuick('${escapeHtml(p.map)}','${escapeHtml(p.phase_key)}')">▶</button>` : ''}
    </div></div>`;
}

function _phBoard(list) {
  const cols = [
    ['ready', 'Ready', list.filter(p => p.status === 'planned' && p.ready), 'var(--mint)'],
    ['blocked', 'Blocked', list.filter(p => p.status === 'planned' && !p.ready), 'var(--amber)'],
    ['active', 'Active', list.filter(p => p.status === 'active'), 'var(--sky)'],
    ['complete', 'Complete', list.filter(p => p.status === 'complete'), 'var(--mint)'],
  ];
  const CAP = 150;
  return `<div class="ph-board">${cols.map(([k, label, items, color]) => `<div class="ph-col">
      <div class="ph-col-head" style="color:${color}">${label} <span>${items.length}</span></div>
      ${items.slice(0, CAP).map(_phCard).join('') || '<div class="ph-empty">—</div>'}
      ${items.length > CAP ? `<div class="ph-empty">${items.length - CAP} more — narrow the filter</div>` : ''}
    </div>`).join('')}</div>`;
}

function _phLayers(list) {
  const by = new Map();
  for (const p of list) { const k = p.layer == null ? 'cycle' : p.layer; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const keys = [...by.keys()].sort((a, b) => (a === 'cycle') - (b === 'cycle') || a - b);
  return keys.map(k => `<div class="ds"><div class="ds-label">${k === 'cycle' ? 'in a dependency cycle' : `layer ${k}${k === 0 ? ' — depends on nothing in its map' : ''}`} · ${by.get(k).length}</div>
      <div class="ph-grid">${by.get(k).map(_phCard).join('')}</div></div>`).join('');
}

function _phTable(list) {
  const { k, dir } = PHASES.sort;
  const val = (p) => k === 'deps' ? p.depends_on.length : k === 'runs' ? p.runs : k === 'map' ? p.map : k === 'status' ? p.status : k === 'layer' ? (p.layer ?? 1e9) : k === 'title' ? (p.name || p.title) : p.order;
  const rows = list.slice().sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
  const th = (key, label) => `<th onclick="phasesSort('${key}')">${label}${k === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  return `<table class="ph-table"><thead><tr>${th('order', '#')}${th('title', 'phase')}${th('map', 'phasemap')}${th('status', 'status')}${th('layer', 'layer')}${th('deps', 'depends')}<th>closes</th>${th('runs', 'builds')}</tr></thead><tbody>
    ${rows.slice(0, 600).map(p => `<tr class="${PHASES.open === p.uuid ? 'open' : ''}" onclick="phasesOpen('${escapeHtml(p.uuid)}')">
      <td>${p.order}</td><td><b style="color:${_PH_STATUS_COLOR[p.status]}">${escapeHtml(_phKey(p))}</b> ${escapeHtml(p.name || p.title)}</td>
      <td>${escapeHtml(_phShortMap(p.map))}</td>
      <td style="color:${_PH_STATUS_COLOR[p.status]}">${p.status}${p.status !== 'complete' && p.blocked_by.length ? ' <span style="color:var(--amber)">· blocked</span>' : p.ready ? ' <span style="color:var(--mint)">· ready</span>' : ''}</td>
      <td>${p.layer ?? '—'}</td><td>${p.depends_on.length}</td><td>${escapeHtml((p.closes || []).join(' '))}</td>
      <td>${p.runs ? `${p.runs} · <span style="color:${_PH_RUN_COLOR[p.lastRun.state] || 'var(--text3)'}">${escapeHtml(p.lastRun.state)}</span>` : ''}</td></tr>`).join('')}
    </tbody></table>${rows.length > 600 ? `<div class="ph-empty">${rows.length - 600} more rows — narrow the filter</div>` : ''}`;
}

function _phMaps(d) {
  return `<div class="ph-maps">${d.maps.map(m => {
    const s = m.summary; const pct = s.total ? Math.round(100 * s.complete / s.total) : 0;
    return `<div class="ph-mapcard" onclick="phasesFilter('map','${escapeHtml(m.path)}');phasesView('board')">
      <div class="ph-card-top"><span class="ph-key">${escapeHtml(m.meta?.name || _phShortMap(m.path))}</span><span class="ph-map">${escapeHtml(m.meta?.release || m.meta?.date || '')}</span></div>
      <div class="ph-bar small"><div style="width:${pct}%"></div></div>
      <div class="ph-card-foot"><span style="color:var(--mint)">${s.complete}/${s.total}</span>${s.active ? `<span style="color:var(--sky)">${s.active} active</span>` : ''}${s.ready ? `<span style="color:var(--mint)">${s.ready} ready</span>` : ''}${s.blocked ? `<span style="color:var(--amber)">${s.blocked} blocked</span>` : ''}</div>
      <div class="ph-mappath">${escapeHtml(m.path)}${m.meta?.status ? ` · ${escapeHtml(String(m.meta.status).slice(0, 80))}` : ''}</div>
    </div>`;
  }).join('')}</div>`;
}

function _phDetail(d, uuid) {
  const p = d.phases.find(x => x.uuid === uuid);
  if (!p) return `<div class="detail-empty">that phase is no longer in the map</div>`;
  const byUuid = new Map(d.phases.map(x => [x.uuid, x]));
  const link = (u) => { const x = byUuid.get(u); return x ? `<span class="ph-link" onclick="phasesOpen('${escapeHtml(u)}')" style="color:${_PH_STATUS_COLOR[x.status]}">${escapeHtml(_phKey(x))}</span>` : escapeHtml(u); };
  const dependents = d.phases.filter(x => x.depends_on.includes(p.uuid));
  const run = p.lastRun;
  const opts = (typeof AGENT_OPTIONS !== 'undefined' ? AGENT_OPTIONS : []);
  const nexus = d.scope.source === 'nexus';
  return `<div class="ph-d-head"><span class="ph-key" style="color:${_PH_STATUS_COLOR[p.status]}">${escapeHtml(p.phase_key)}</span><button class="ph-x" onclick="phasesOpen(null)">×</button></div>
    <div class="ph-d-title">${escapeHtml(p.name || p.title)}</div>
    <div class="ph-d-meta">${escapeHtml(p.map)}:${p.line} · ${p.form === 'list' ? 'list form' : 'key form'} · layer ${p.layer ?? '—'} · order ${p.order}</div>
    <div class="ph-d-row"><label>status</label>
      <select onchange="phasesSetStatus('${escapeHtml(p.map)}','${escapeHtml(p.phase_key)}',this.value)" ${PHASES.busy ? 'disabled' : ''}>
        ${['planned', 'active', 'complete'].map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      ${p.status !== 'complete' ? (p.blocked_by.length ? `<span style="color:var(--amber)">blocked by ${p.blocked_by.map(link).join(' ')}</span>` : '<span style="color:var(--mint)">ready</span>') : ''}</div>
    <div class="ph-d-row"><label>depends on</label><span>${p.depends_on.map(link).join(' ') || '—'}${(p.unresolved_deps || []).length ? ` <span style="color:var(--text3)">(not phases here: ${escapeHtml(p.unresolved_deps.join(', '))})</span>` : ''}</span></div>
    <div class="ph-d-row"><label>needed by</label><span>${dependents.map(x => link(x.uuid)).join(' ') || '—'}</span></div>
    <div class="ph-d-row"><label>closes</label><span>${escapeHtml((p.closes || []).join(' ') || '—')}</span></div>
    <div class="ph-d-row"><label>files</label><span class="ph-files">${(p.files || []).map(f => `<code>${escapeHtml(f)}</code>`).join(' ') || '—'}</span></div>
    <div class="ph-d-row"><label>systems</label><span>${escapeHtml((p.systems || []).join(', ') || '—')}</span></div>
    <div class="ph-d-sec">build this phase</div>
    <div class="ph-d-note">1 · a Versionium snapshot of ${nexus ? (d.scope.system ? `nexus/${escapeHtml(d.scope.system)}` : 'the system that owns its files') : 'this repo'} — nothing is sent without one<br>2 · the phase goes active<br>3 · ${nexus ? 'that' : 'this'} repo's agent gets the phase, its dependencies, what it closes and the map's invariants as its task</div>
    <div class="ph-d-row"><label>agent</label><select id="ph-build-provider"><option value="">the repo's own switch</option>${opts.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}</select></div>
    <textarea id="ph-build-note" rows="2" placeholder="anything to add for the agent (optional)"></textarea>
    <div class="action-row"><button class="action-btn" ${p.status === 'complete' || PHASES.busy ? 'disabled' : ''} onclick="phasesBuild('${escapeHtml(p.map)}','${escapeHtml(p.phase_key)}')">▶ snapshot + build</button>
      <button class="action-btn" onclick="setRepoSubtab('agent')">open the Agent tab</button></div>
    <div class="ph-d-sec">builds · ${p.runs}</div>
    ${run ? `<div class="ph-run"><span style="color:${_PH_RUN_COLOR[run.state] || 'var(--text3)'}">${escapeHtml(run.state)}</span> · ${escapeHtml(new Date(run.ts).toLocaleString())}${run.snapshot ? ` · snapshot <code>${escapeHtml(run.snapshot)}</code>` : ''}${run.provider ? ` · ${escapeHtml(run.provider)}` : ''}${run.elapsedMs ? ` · ${Math.round(run.elapsedMs / 1000)}s` : ''}
      ${run.error ? `<div style="color:var(--coral)">${escapeHtml(run.error)}</div>` : ''}
      ${run.injects && run.injects.injected && run.injects.injected.length ? `<div>injected: ${run.injects.injected.map(f => `<code>${escapeHtml(f)}</code>`).join(' ')}</div>` : ''}
      ${run.reply ? `<details><summary>reply</summary><pre>${escapeHtml(run.reply)}</pre></details>` : ''}</div>` : '<div class="ph-empty">not built from here yet</div>'}`;
}

function _phAddForm(d) {
  const maps = d.maps.map(m => `<option value="${escapeHtml(m.path)}">${escapeHtml(_phShortMap(m.path))}</option>`).join('');
  return `<div class="ds ph-add"><div class="ds-label">new phase</div>
    <div class="ph-d-row"><label>phasemap</label><select id="ph-add-map">${d.scope.source === 'nexus' ? '' : '<option value="">roadmap-phasemap.spec (new or existing)</option>'}${maps}</select>
      <label>id prefix</label><input id="ph-add-prefix" value="P" maxlength="3" style="width:50px"></div>
    <input id="ph-add-title" placeholder="title" style="width:100%">
    <textarea id="ph-add-does" rows="2" placeholder="what it does" style="width:100%"></textarea>
    <input id="ph-add-deps" placeholder="depends on (phase keys, comma separated)" style="width:100%">
    <div class="action-row"><button class="action-btn" onclick="phasesAdd()">add phase</button><button class="action-btn" onclick="phasesAddOpen(false)">cancel</button></div></div>`;
}

// ── actions ────────────────────────────────────────────────────────────────
function phasesView(v) { PHASES.view = v; _phPaint(); }
function phasesSort(k) { PHASES.sort = { k, dir: PHASES.sort.k === k ? -PHASES.sort.dir : 1 }; _phPaint(); }
function phasesOpen(uuid) { PHASES.open = uuid; _phPaint(); }
function phasesAddOpen(on = true) { PHASES.adding = !!on; _phPaint(); }
function phasesFilter(k, v) {
  if (k === 'status' && PHASES.filter.status === v) v = 'all';
  PHASES.filter[k] = v;
  if (k === 'q') { clearTimeout(phasesFilter._t); phasesFilter._t = setTimeout(() => { _phPaint(); const i = document.querySelector('.ph-tools input[type=text]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 180); return; }
  _phPaint();
}

async function phasesSetStatus(map, phase, status, force = false) {
  const uuid = PHASES.uuid; PHASES.busy = true;
  try {
    const r = await api(`/api/repos/${uuid}/phases/status`, { method: 'POST', body: JSON.stringify({ map, phase, status, force }) }, 60000);
    toast(`${phase} → ${status}${r.change?.via === 'apply-gate' ? ` (applied live, ${r.change.applyId})` : ''}`, 'ok');
  } catch (e) {
    if (e.data && e.data.code === 'DEPS_INCOMPLETE' && confirm(`${e.message}\n\nMark it ${status} anyway?`)) { PHASES.busy = false; return phasesSetStatus(map, phase, status, true); }
    toast(`status not changed: ${e.message}`, 'err');
  }
  PHASES.busy = false;
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'phases') renderRepoPhases(CURRENT_API_REPO, { keepScroll: true });
}

async function phasesBuild(map, phase) {
  const uuid = PHASES.uuid;
  const provider = (document.getElementById('ph-build-provider') || {}).value || null;
  const note = ((document.getElementById('ph-build-note') || {}).value || '').trim();
  PHASES.busy = true; _phPaint();
  try {
    const r = await api(`/api/repos/${uuid}/phases/build`, { method: 'POST', body: JSON.stringify({ map, phase, provider, note }) }, 120000);
    toast(`${phase}: snapshot ${r.snapshot} taken · ${r.targetName}'s agent is building it${r.statusNote ? ` (status not changed: ${r.statusNote})` : ''}`, 'ok');
  } catch (e) { toast(`${phase} not built: ${e.message}`, 'err'); }
  PHASES.busy = false;
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'phases') renderRepoPhases(CURRENT_API_REPO, { keepScroll: true });
}

async function phasesAdd() {
  const uuid = PHASES.uuid;
  const body = {
    map: (document.getElementById('ph-add-map') || {}).value || null,
    title: (document.getElementById('ph-add-title') || {}).value || '',
    does: (document.getElementById('ph-add-does') || {}).value || '',
    prefix: ((document.getElementById('ph-add-prefix') || {}).value || 'P').toUpperCase(),
    dependsOn: ((document.getElementById('ph-add-deps') || {}).value || '').split(',').map(x => x.trim()).filter(Boolean),
  };
  if (!body.title.trim()) return toast('a phase needs a title', 'err');
  try {
    const r = await api(`/api/repos/${uuid}/phases/add`, { method: 'POST', body: JSON.stringify(body) }, 60000);
    toast(`added ${r.id} to ${_phShortMap(r.map)}`, 'ok'); PHASES.adding = false;
  } catch (e) { toast(`phase not added: ${e.message}`, 'err'); }
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'phases') renderRepoPhases(CURRENT_API_REPO, { keepScroll: true });
}

// a phase edit or a build step from anywhere refreshes the open Phases tab (one repaint per burst)
function phasesOnEvent(t, payload) {
  if (!(t === 'repo.roadmap.updated' || t === 'repo.phase.run')) return;
  if (!CURRENT_API_REPO || CURRENT_REPO_SUBTAB !== 'phases' || PHASES.busy) return;
  if (payload && payload.repoUuid && payload.repoUuid !== CURRENT_API_REPO.uuid) return;
  clearTimeout(phasesOnEvent._t);
  phasesOnEvent._t = setTimeout(() => renderRepoPhases(CURRENT_API_REPO, { keepScroll: true }), 400);
}

// §0.39.280 BS9 — James: "click on a spec in the spec tab and have it built. phases the same way." ▶ on every card:
// the same build as the detail pane (snapshot first, then the repo's agent), without opening it.
async function phasesBuildQuick(map, phase) {
  const uuid = PHASES.uuid; if (!uuid || PHASES.busy) return;
  PHASES.busy = true;
  try {
    const r = await api(`/api/repos/${uuid}/phases/build`, { method: 'POST', body: JSON.stringify({ map, phase }) }, 120000);
    toast(`${phase}: snapshot ${r.snapshot} taken · ${r.targetName}'s agent is building it`, 'ok');
    if (typeof openPlanPanel === 'function') openPlanPanel({ map, focus: r.runId });
  } catch (e) { toast(`${phase} not built: ${e.message}`, 'err'); }
  PHASES.busy = false;
  if (CURRENT_API_REPO) renderRepoPhases(CURRENT_API_REPO, { keepScroll: true });
}
