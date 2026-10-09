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

// §RS10 0.50.0 — James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade.
// interconnected". Rebuilt on the thread (GET …/thread, idearium/repo/thread.js): the specs and their maps on the left;
// the phases in build order, lanes by dependency layer, current work first (complete folded, as the Plan); each card with
// its spec blocks, its gates (the Plan's gate bar, GET …/plan), its last run's model and rung, a stale mark when its block
// moved; the phase on the right with its block's own text, its runs (the Plan's ledger), its files and waiting changes
// (open in Code), and build · status · open in the Plan · open its spec. Table and Maps stay; Board became Lanes.
const PHASES = { uuid: null, data: null, view: 'lanes', open: null, sort: { k: 'order', dir: 1 },
  filter: { q: '', status: 'all', map: 'all', mine: true, ready: false }, busy: false, adding: false,
  specs: null, spec: null, thread: null, threadErr: null, plan: null, showDone: _phShowDoneSaved() };
const _PH_STATUS_COLOR = { complete: 'var(--mint)', active: 'var(--sky)', planned: 'var(--text2)' };
const _PH_RUN_COLOR = { building: 'var(--sky)', replied: 'var(--mint)', failed: 'var(--coral)', refused: 'var(--coral)', escalating: 'var(--amber)', retrying: 'var(--amber)', proven: 'var(--mint)', unproven: 'var(--coral)', interrupted: 'var(--amber)' };   // §HP2 interrupted: idearium restarted mid-run
const _phShortMap = (p) => String(p || '').split('/').pop().replace(/-phasemap\.spec$|\.spec$/, '');
const _phKey = (p) => String(p.phase_key || '').split('_')[0];
const _phq = (s) => escapeHtml(String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
function _phShowDoneSaved() { try { return localStorage.getItem('idearium.phases.showDone') === '1'; } catch (_) { return false; } }

async function renderRepoPhases(repo, { keepScroll = false } = {}) {
  const el = document.getElementById('repo-subtab-phases');
  if (!el || !repo) return;
  const forUuid = repo.uuid;
  if (PHASES.uuid !== forUuid) {
    Object.assign(PHASES, { uuid: forUuid, data: null, open: null, adding: false, specs: null, spec: null, thread: null, threadErr: null, plan: null });
    PHASES.filter = { q: '', status: 'all', map: 'all', mine: true, ready: false };
  }
  // §RS11 — handed a spec (and a phase) from a workshop section: applied after any reset for a new repo, not wiped by it
  if (PHASES.wantSpec) { PHASES.spec = PHASES.wantSpec; PHASES.thread = null; PHASES.wantSpec = null; }
  if (PHASES.view === 'board' || PHASES.view === 'layers') PHASES.view = 'lanes';
  const sc = document.querySelector('#repo-subtab-phases .ph2-mid'); const scrollTop = keepScroll && sc ? sc.scrollTop : 0;
  if (!PHASES.data) el.innerHTML = `<div class="detail-empty">reading phasemaps…</div>`;
  let d;
  // the phases (every map), the thread's specs, the plan's gates — read together; only the first is required
  const [pr, sr, gr] = await Promise.allSettled([
    api(`/api/repos/${forUuid}/phases`, {}, 30000),
    api(`/api/repos/${forUuid}/thread`, {}, 30000),
    api(`/api/repos/${forUuid}/plan`, {}, 30000),
  ]);
  if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'phases') return;
  if (pr.status !== 'fulfilled') {
    el.innerHTML = `<div class="ds"><div class="ds-label">phases</div><div class="ds-mono">could not read this repo's phasemaps: ${escapeHtml(pr.reason && pr.reason.message || 'no answer')}</div></div>`;
    return;
  }
  d = pr.value;
  PHASES.data = d;
  PHASES.specs = sr.status === 'fulfilled' ? (sr.value.specs || []) : null;
  PHASES.plan = gr.status === 'fulfilled' ? gr.value : null;
  if (PHASES.spec) await _phLoadThread(PHASES.spec, { paint: false });
  // §RS11 — opened from a workshop section: its phase opened
  if (PHASES.wantKey) { const w = d.phases.find(p => p.phase_key === PHASES.wantKey); if (w) PHASES.open = w.uuid; PHASES.wantKey = null; }
  if (typeof loadAgentOptions === 'function') loadAgentOptions();
  _phPaint();
  const sc2 = document.querySelector('#repo-subtab-phases .ph2-mid'); if (sc2) sc2.scrollTop = scrollTop;
}

async function _phLoadThread(spec, { paint = true } = {}) {
  const uuid = PHASES.uuid; if (!uuid || !spec) return;
  try { PHASES.thread = await api(`/api/repos/${uuid}/thread?spec=${encodeURIComponent(spec)}`, {}, 30000); PHASES.threadErr = null; }
  catch (e) { PHASES.thread = null; PHASES.threadErr = e.message; }
  if (paint) _phPaint();
}
/** the spec a map was planned from, as the thread's list says */
function _phSpecOfMap(mapPath) { for (const s of PHASES.specs || []) if ((s.maps || []).includes(mapPath)) return s.path; return null; }
function phasesPickSpec(spec) {
  PHASES.spec = spec || null; PHASES.thread = null; PHASES.threadErr = null; PHASES.open = null;
  PHASES.filter.map = 'all';
  if (spec) _phLoadThread(spec); else _phPaint();
}
function phasesToggleDone() { PHASES.showDone = !PHASES.showDone; try { localStorage.setItem('idearium.phases.showDone', PHASES.showDone ? '1' : '0'); } catch (_) { /* a per-browser convenience */ } _phPaint(); }

function _phFiltered() {
  const d = PHASES.data; if (!d) return [];
  const f = PHASES.filter; const q = f.q.trim().toLowerCase();
  const specMaps = PHASES.spec ? new Set(((PHASES.specs || []).find(s => s.path === PHASES.spec) || {}).maps || []) : null;
  return d.phases.filter(p => {
    if (d.scope.system && f.mine && !p.mine) return false;
    if (specMaps && !specMaps.has(p.map)) return false;
    if (f.map !== 'all' && p.map !== f.map) return false;
    if (f.status === 'open' && p.status === 'complete') return false;
    if (f.status === 'blocked' && !(p.status !== 'complete' && p.blocked_by.length)) return false;
    if (['planned', 'active', 'complete'].includes(f.status) && p.status !== f.status) return false;
    if (f.ready && !p.ready) return false;
    if (q && !`${p.phase_key} ${p.title} ${p.name || ''} ${p.map} ${(p.closes || []).join(' ')} ${(p.files || []).join(' ')} ${(p.blocks || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
/** the thread's view of one phase (stale blocks, changes) when its spec is loaded */
function _phThreadOf(p) { const t = PHASES.thread; return t ? (t.phases || []).find(x => x.key === p.phase_key && x.map === p.map) || null : null; }
/** the Plan's step for a phase (its gates and ledger) */
function _phStepOf(p) { const pl = PHASES.plan; return pl ? (pl.steps || []).find(s => s.map === p.map && s.key === p.phase_key) || null : null; }

function _phRail(d) {
  const specs = PHASES.specs;
  const fromSpec = new Set((specs || []).flatMap(s => s.maps || []));
  const other = d.maps.filter(m => !fromSpec.has(m.path));
  const sumOf = (paths) => { const ph = d.phases.filter(p => paths.includes(p.map)); return { n: ph.length, done: ph.filter(p => p.status === 'complete').length }; };
  const bar = (x) => `<span class="ph2-mini"><i style="width:${x.n ? Math.round(100 * x.done / x.n) : 0}%"></i></span>`;
  const t = PHASES.thread;
  return `<div class="ph2-rail-head">specs</div>
    <div class="ph2-spec ${!PHASES.spec ? 'on' : ''}" onclick="phasesPickSpec(null)"><span class="ph2-spec-name">every phasemap</span><span class="ph2-dim">${d.phases.length}</span></div>
    ${specs == null ? '<div class="ph2-dim ph2-pad">the specs could not be read</div>' : specs.filter(s => (s.maps || []).length).map(s => { const x = sumOf(s.maps); return `<div class="ph2-spec ${PHASES.spec === s.path ? 'on' : ''}" onclick="phasesPickSpec('${_phq(s.path)}')" title="${escapeHtml(s.path)}">
        <span class="ph2-spec-name">${escapeHtml(s.path.split('/').pop())}</span><span class="ph2-dim">${x.done}/${x.n}</span>${bar(x)}
        ${PHASES.spec === s.path && t ? `<div class="ph2-spec-sub">${t.summary.blocks} blocks · ${t.summary.planned} planned${t.summary.unplanned ? ` · <span class="ph2-warn">${t.summary.unplanned} unplanned</span>` : ''}${t.summary.staleBlocks ? ` · <span class="ph2-warn">${t.summary.staleBlocks} moved</span>` : ''}${t.summary.unlinked ? ` · ${t.summary.unlinked} unlinked` : ''}</div>` : ''}</div>`; }).join('')}
    ${specs && specs.filter(s => !(s.maps || []).length).length ? `<div class="ph2-rail-head">specs not planned yet</div>${specs.filter(s => !(s.maps || []).length).slice(0, 20).map(s => `<div class="ph2-spec dim" title="${escapeHtml(s.path)}"><span class="ph2-spec-name">${escapeHtml(s.path.split('/').pop())}</span><button class="ph2-mini-btn" onclick="event.stopPropagation();phPlanDerive('${_phq(s.path)}')" title="one phase per block, bottom-up — no agent">⚡ plan</button></div>`).join('')}` : ''}
    ${other.length ? `<div class="ph2-rail-head">maps not from a spec</div>${other.map(m => { const x = sumOf([m.path]); return `<div class="ph2-spec ${PHASES.filter.map === m.path ? 'on' : ''}" onclick="PHASES.spec=null;PHASES.thread=null;phasesFilter('map','${_phq(m.path)}')" title="${escapeHtml(m.path)}"><span class="ph2-spec-name">${escapeHtml(_phShortMap(m.path))}</span><span class="ph2-dim">${x.done}/${x.n}</span>${bar(x)}</div>`; }).join('')}` : ''}`;
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
  const views = [['lanes', 'lanes'], ['table', 'table'], ['maps', 'maps']].map(([v, l]) => `<button class="ph-view ${PHASES.view === v ? 'on' : ''}" onclick="phasesView('${v}')">${l}</button>`).join('');
  const header = `<div class="ph-head">
      <div class="ph-title">phases · ${escapeHtml(d.scope.label)} <span>${s.maps} phasemap${s.maps === 1 ? '' : 's'} · ${s.total} phases${d.scope.system ? ` · ${s.mine} tagged ${escapeHtml(d.scope.system)}` : ''}${PHASES.spec ? ` · <b>${escapeHtml(PHASES.spec)}</b>` : ''}</span></div>
      <div class="ph-bar"><div style="width:${pct}%"></div></div>
      <div class="ph-chips">
        ${chip('active', s.active, 'var(--sky)', "phasesFilter('status','active')")}
        ${chip('ready', s.ready, 'var(--mint)', "phasesFilter('ready',true)")}
        ${chip('blocked', s.blocked, 'var(--amber)', "phasesFilter('status','blocked')")}
        ${chip('planned', s.planned, 'var(--text2)', "phasesFilter('status','planned')")}
        ${chip('complete', s.complete, 'var(--mint)', "phasesFilter('status','complete')")}
        ${chip('builds', s.runs || 0, 'var(--text2)')}
        <span class="ph-via">${pct}% complete · ${escapeHtml(via)}</span>
      </div>
    </div>`;
  const toolbar = `<div class="ph-tools">
      <input type="text" placeholder="search id, name, map, block, closes, files…" value="${escapeHtml(f.q)}" oninput="phasesFilter('q',this.value)">
      <select onchange="phasesFilter('status',this.value)">${[['all', 'every status'], ['open', 'not complete'], ['planned', 'planned'], ['active', 'active'], ['blocked', 'blocked'], ['complete', 'complete']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${PHASES.spec ? '' : `<select onchange="phasesFilter('map',this.value)"><option value="all">every phasemap</option>${mapOpts}</select>`}
      ${d.scope.system ? `<label><input type="checkbox" ${f.mine ? 'checked' : ''} onchange="phasesFilter('mine',this.checked)"> ${escapeHtml(d.scope.system)}'s only</label>` : ''}
      <label><input type="checkbox" ${f.ready ? 'checked' : ''} onchange="phasesFilter('ready',this.checked)"> ready only</label>
      <span class="ph-views">${views}</span>
      <button class="action-btn" onclick="phasesAddOpen()">+ phase</button>
      ${d.scope.source === 'nexus' ? '' : '<button class="action-btn" title="grow the system from its spec: new components slotted into the registry and the nodes, a phasemap of them here, their code planned (greyed until coded)" onclick="phasesExpandOpen()">+ expand</button>'}
    </div>`;

  let body;
  if (!d.phases.length) {
    body = `<div class="ds"><div class="ds-label">no phases</div><div class="ds-mono">${d.scope.source === 'nexus'
      ? 'No phasemap in the NEXUS snapshot tags this system. Phasemaps are docs/*phasemap*.spec.'
      : 'This repo has no *phasemap*.spec file yet. Plan a spec below (its phases land here), "+ phase" starts roadmap-phasemap.spec, or add an idea iteration from the Idea tab.'}${(d.skipped || []).length ? `\n\nnot read:\n${d.skipped.map(x => `${x.path} — ${x.reason}`).join('\n')}` : ''}</div></div>
      ${d.scope.source === 'nexus' ? '' : '<div class="ds" id="ph-plan-specs"><div class="ds-label">plan a spec</div><div class="ds-mono">reading the specs…</div></div>'}`;
    if (d.scope.source !== 'nexus') setTimeout(_phPlanSpecs, 0);
  } else if (PHASES.view === 'maps') body = _phMaps(d);
  else if (PHASES.view === 'table') body = _phTable(list);
  else body = _phLanes(list);

  const warn = (d.warnings || []).filter(w => w.type !== 'unresolved_dependency');
  const notes = warn.length ? `<details class="ds"><summary class="ds-label" style="cursor:pointer">notes (${warn.length})</summary><div class="ds-mono">${warn.slice(0, 80).map(w => escapeHtml(`${w.type} · ${w.map ? _phShortMap(w.map) + ' · ' : ''}${w.phase || (w.phases || []).join(', ')}${w.token ? ' → ' + w.token : ''}`)).join('\n')}</div></details>` : '';
  const t = PHASES.thread;
  const unplanned = t ? t.spec.blocks.filter(b => !b.bookkeeping && !b.planned) : [];
  const threadNote = PHASES.spec ? (PHASES.threadErr ? `<div class="ph2-note bad">the spec's thread could not be read: ${escapeHtml(PHASES.threadErr)}</div>`
    : !t ? '<div class="ph2-note">reading the spec\'s thread…</div>'
    : `${unplanned.length ? `<div class="ph2-note">blocks with no phase yet: ${unplanned.map(b => `<span class="ph2-block">${escapeHtml(b.id)}</span>`).join(' ')}</div>` : ''}${t.summary.staleBlocks ? `<div class="ph2-note warn">${t.summary.staleBlocks} block${t.summary.staleBlocks === 1 ? '' : 's'} moved since planned — ${t.summary.stalePhases} phase${t.summary.stalePhases === 1 ? '' : 's'} stale${t.summary.staleDownstream ? `, ${t.summary.staleDownstream} of them through a phase they depend on` : ''} (↻ on the card)</div>` : ''}`) : '';

  el.innerHTML = `<div class="ph-wrap">${header}${toolbar}
      ${PHASES.adding ? _phAddForm(d) : ''}
      ${PHASES.expanding ? _phExpandForm() : ''}
      <div class="ph2 ${PHASES.open ? 'with-detail' : ''}">
        <nav class="ph2-rail">${_phRail(d)}</nav>
        <div class="ph2-mid">${threadNote}${body}<div class="ph-count">${list.length} of ${d.phases.length} shown</div>${notes}</div>
        ${PHASES.open ? `<aside class="ph-detail ph2-detail" id="ph-detail">${_phDetail(d, PHASES.open)}</aside>` : ''}
      </div></div>`;
}

function _phCard(p) {
  const run = p.lastRun; const th = _phThreadOf(p); const step = _phStepOf(p);
  const stale = th ? th.stale : [];
  const blocks = p.blocks || [];
  const chips = blocks.slice(0, 3).map(b => `<span class="ph2-block ${stale.includes(b) ? 'stale' : ''}" title="${stale.includes(b) ? 'this block moved since the phase was planned' : 'a block of its spec'}">${stale.includes(b) ? '↻ ' : ''}${escapeHtml(b)}</span>`).join('') + (blocks.length > 3 ? `<span class="ph2-dim">+${blocks.length - 3}</span>` : '');
  const gates = step && step.gates && typeof _gateBar === 'function' ? _gateBar(step) : '';
  return `<div class="ph-card ph2-card st-${escapeHtml(p.status)} ${PHASES.open === p.uuid ? 'open' : ''} ${stale.length || (th && (th.specMoved || th.staleVia)) ? 'stale' : ''}" onclick="phasesOpen('${escapeHtml(p.uuid)}')" data-key="${escapeHtml(p.phase_key)}" title="${escapeHtml(p.map)}:${p.line}">
    <div class="ph-card-top"><span class="ph-key" style="color:${_PH_STATUS_COLOR[p.status]}">${escapeHtml(_phKey(p))}</span>${PHASES.spec ? '' : `<span class="ph-map">${escapeHtml(_phShortMap(p.map))}</span>`}
      ${p.status !== 'complete' ? `<button class="ph-quick" title="snapshot, then the agent builds it (climbing the ladder)" ${PHASES.busy ? 'disabled' : ''} onclick="event.stopPropagation();phasesBuildQuick('${_phq(p.map)}','${_phq(p.phase_key)}')">▶</button>` : ''}</div>
    <div class="ph-card-title">${escapeHtml(p.name || p.title)}</div>
    ${blocks.length ? `<div class="ph2-blocks">${chips}</div>` : (PHASES.spec ? '<div class="ph2-dim">no link to its spec</div>' : '')}
    ${th && th.staleVia ? `<div class="ph2-warn" title="it depends on a phase whose block moved since it was planned">↻ via ${escapeHtml(String(th.staleVia).split('_')[0])}</div>` : ''}
    <div class="ph-card-foot">
      ${p.status === 'complete' ? '<span style="color:var(--mint)">complete</span>' : p.status === 'active' ? '<span style="color:var(--sky)">active</span>' : p.blocked_by.length ? `<span style="color:var(--amber)">blocked by ${p.blocked_by.length}</span>` : p.ready ? '<span style="color:var(--mint)">ready</span>' : ''}
      ${run ? `<span style="color:${_PH_RUN_COLOR[run.state] || 'var(--text3)'}">${escapeHtml(run.state)}${run.provider ? ` · ${escapeHtml(run.provider)}` : ''}${run.rung ? ` (${run.rung}/${run.rungs})` : ''}</span>` : ''}
    </div>${gates ? `<div class="ph2-gates">${gates}</div>` : ''}</div>`;
}

/** lanes: the phases in build order — one lane per dependency layer; complete ones folded unless shown */
function _phLanes(list) {
  const done = list.filter(p => p.status === 'complete');
  const show = PHASES.showDone ? list : list.filter(p => p.status !== 'complete');
  const by = new Map();
  for (const p of show) { const k = p.layer == null ? 'cycle' : p.layer; if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
  const keys = [...by.keys()].sort((a, b) => (a === 'cycle') - (b === 'cycle') || a - b);
  const rank = (p) => (p.status === 'active' ? 0 : p.ready ? 1 : p.status === 'complete' ? 3 : 2);
  const fold = done.length ? `<button class="ph2-fold" onclick="phasesToggleDone()">✓ ${done.length} complete — ${PHASES.showDone ? 'hide' : 'show'}</button>` : '';
  if (!keys.length) return `${fold}<div class="ph-empty">${done.length ? 'everything here is complete' : 'nothing matches'}</div>`;
  const CAP = 200;
  return `${fold}<div class="ph2-lanes">${keys.map(k => { const items = by.get(k).slice().sort((a, b) => rank(a) - rank(b) || a.order - b.order); return `<section class="ph2-lane">
      <div class="ph2-lane-head" title="${k === 0 ? 'depends on nothing in its map' : k === 'cycle' ? 'these depend on each other' : `after layer ${k - 1}`}">${k === 'cycle' ? 'in a cycle' : `layer ${k}`}<span class="ph2-dim">${items.length}</span></div>
      ${items.slice(0, CAP).map(_phCard).join('')}${items.length > CAP ? `<div class="ph-empty">${items.length - CAP} more — narrow the filter</div>` : ''}</section>`; }).join('')}</div>`;
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
    return `<div class="ph-mapcard" onclick="phasesFilter('map','${escapeHtml(m.path)}');phasesView('lanes')">
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
  const run = p.lastRun; const th = _phThreadOf(p); const step = _phStepOf(p);
  const opts = (typeof AGENT_OPTIONS !== 'undefined' ? AGENT_OPTIONS : []);
  const nexus = d.scope.source === 'nexus';
  const specOf = _phSpecOfMap(p.map);
  const blocksHtml = (() => {
    const ids = p.blocks || [];
    if (!ids.length) return `<div class="ph2-dim">no link to its spec — this phase names no block${specOf ? '' : ' (its map was not planned from a spec)'}</div>`;
    const t = PHASES.thread && PHASES.spec === specOf ? PHASES.thread : null;
    if (!t) return `${ids.map(b => `<span class="ph2-block">${escapeHtml(b)}</span>`).join(' ')}${specOf ? ` <button class="ph2-mini-btn" onclick="phasesPickSpec('${_phq(specOf)}');PHASES.open='${escapeHtml(p.uuid)}'">read them from ${escapeHtml(specOf.split('/').pop())}</button>` : ''}`;
    return ids.map(id => { const b = t.spec.blocks.find(x => x.id === id); const stale = th && th.stale.includes(id);
      return b ? `<div class="ph2-blocktext ${stale ? 'stale' : ''}"><div class="ph2-bt-head"><b>${escapeHtml(b.id)}</b><span class="ph2-dim">${escapeHtml(b.label)} · line ${b.line}</span>${stale ? '<span class="ph2-warn">↻ moved since planned</span>' : ''}</div><pre>${escapeHtml(String(b.text || '').trimEnd())}</pre></div>`
        : `<div class="ph2-blocktext broken"><b>${escapeHtml(id)}</b> <span class="ph2-warn">not in ${escapeHtml(specOf)} any more</span></div>`; }).join('');
  })();
  const files = [...new Set([...(p.files || []), ...((th && th.files) || []), ...((run && run.injects && run.injects.injected) || [])])];
  const changes = (th && th.changes) || [];
  const ledger = step && step.ledger && typeof _ledgerHtml === 'function' ? _ledgerHtml(step.ledger) : null;
  return `<div class="ph-d-head"><span class="ph-key" style="color:${_PH_STATUS_COLOR[p.status]}">${escapeHtml(p.phase_key)}</span><button class="ph-x" onclick="phasesOpen(null)">×</button></div>
    <div class="ph-d-title">${escapeHtml(p.name || p.title)}</div>
    <div class="ph-d-meta">${escapeHtml(p.map)}:${p.line} · layer ${p.layer ?? '—'} · order ${p.order}${specOf ? ` · from <a href="#" onclick="phasesOpenSpec('${_phq(specOf)}');return false">${escapeHtml(specOf)}</a>` : ''}</div>
    ${step && step.gates && typeof _gateBar === 'function' ? `<div class="ph2-gates big">${_gateBar(step)}<span class="ph2-dim">gate: ${escapeHtml(step.gate || 'all passed')}</span></div>` : ''}
    <div class="ph-d-row"><label>status</label>
      <select onchange="phasesSetStatus('${_phq(p.map)}','${_phq(p.phase_key)}',this.value)" ${PHASES.busy ? 'disabled' : ''}>
        ${['planned', 'active', 'complete'].map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      ${p.status !== 'complete' ? (p.blocked_by.length ? `<span style="color:var(--amber)">blocked by ${p.blocked_by.map(link).join(' ')}</span>` : '<span style="color:var(--mint)">ready</span>') : ''}</div>
    <div class="ph-d-sec">from the spec</div>
    ${blocksHtml}
    ${th && th.staleVia ? `<div class="ph2-note warn">stale through ${escapeHtml(th.staleVia)} — it depends on a phase whose block moved since it was planned (§HP1)</div>` : ''}
    <div class="ph-d-row"><label>depends on</label><span>${p.depends_on.map(link).join(' ') || '—'}${(p.unresolved_deps || []).length ? ` <span style="color:var(--text3)">(not phases here: ${escapeHtml(p.unresolved_deps.join(', '))})</span>` : ''}</span></div>
    <div class="ph-d-row"><label>needed by</label><span>${dependents.map(x => link(x.uuid)).join(' ') || '—'}</span></div>
    <div class="ph-d-row"><label>closes</label><span>${escapeHtml((p.closes || []).join(' ') || '—')}</span></div>
    <div class="ph-d-sec">files · ${files.length}</div>
    <div class="ph2-files">${files.map(f => `<a href="#" class="ph2-file" title="open in the Code tab" onclick="${typeof wsOpenInCode === 'function' ? `wsOpenInCode('${_phq(f)}')` : ''};return false">${escapeHtml(f)}</a>`).join('') || '<span class="ph2-dim">—</span>'}</div>
    ${changes.length ? `<div class="ph-d-sec">changes waiting · ${changes.length}</div><div class="ph2-files">${changes.map(c => `<a href="#" class="ph2-file warn" onclick="${typeof wsOpenInCode === 'function' ? `wsOpenInCode('${_phq(c.path)}')` : ''};return false">${escapeHtml(c.op)} ${escapeHtml(c.path)} — ${escapeHtml(c.status)}</a>`).join('')}</div>` : ''}
    <div class="ph-d-sec">build this phase</div>
    <div class="ph-d-note">1 · a Versionium snapshot of ${nexus ? (d.scope.system ? `nexus/${escapeHtml(d.scope.system)}` : 'the system that owns its files') : 'this repo'} — nothing is sent without one<br>2 · the phase goes active<br>3 · the agent gets the phase, its blocks, its dependencies and the map's invariants — with no agent picked it climbs the escalation ladder</div>
    <div class="ph-d-row"><label>agent</label><select id="ph-build-provider"><option value="">the ladder (Settings → Routing)</option>${opts.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}</select></div>
    <textarea id="ph-build-note" rows="2" placeholder="anything to add for the agent (optional)"></textarea>
    <div class="action-row"><button class="action-btn" ${p.status === 'complete' || PHASES.busy ? 'disabled' : ''} onclick="phasesBuild('${_phq(p.map)}','${_phq(p.phase_key)}')">▶ snapshot + build</button>
      ${typeof openPlanPanel === 'function' ? `<button class="action-btn" onclick="openPlanPanel({ map: '${_phq(p.map)}'${run && run.runId ? `, focus: '${_phq(run.runId)}'` : ''} })">open in the Plan</button>` : ''}
      ${PHASES.thread && PHASES.spec === specOf && PHASES.thread.workshop && typeof openWorkshop === 'function' ? `<button class="action-btn" title="the spec workshop, at the section this phase was planned from" onclick="openWorkshop(null,'${_phq(PHASES.thread.workshop.uuid)}'${(p.blocks || [])[0] ? `,'${_phq(p.blocks[0])}'` : ''})">open in the workshop</button>` : ''}</div>
    <div class="ph-d-sec">builds · ${p.runs}</div>
    ${ledger ? `<div class="ph2-ledger">${ledger}</div>` : run ? `<div class="ph-run"><span style="color:${_PH_RUN_COLOR[run.state] || 'var(--text3)'}">${escapeHtml(run.state)}</span> · ${escapeHtml(new Date(run.ts).toLocaleString())}${run.snapshot ? ` · snapshot <code>${escapeHtml(run.snapshot)}</code>` : ''}${run.provider ? ` · ${escapeHtml(run.provider)}` : ''}${run.rung ? ` (rung ${run.rung}/${run.rungs})` : ''}${run.elapsedMs ? ` · ${Math.round(run.elapsedMs / 1000)}s` : ''}
      ${run.error ? `<div style="color:var(--coral)">${escapeHtml(run.error)}</div>` : ''}
      ${run.reply ? `<details><summary>reply</summary><pre>${escapeHtml(run.reply)}</pre></details>` : ''}</div>` : '<div class="ph-empty">not built yet</div>'}`;
}
/** open the spec a phase came from in the Spec tab */
async function phasesOpenSpec(spec) {
  setRepoSubtab('spec');
  if (typeof renderLivingSpec === 'function') await renderLivingSpec(CURRENT_API_REPO, spec);
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

// §0.39.360 SB42–SB44 — James: "expanding using the specs, then phased, then chunked, then coded." The system grows from
// its spec: the agent plans the new components (POST /api/repos/:uuid/expand), which land as a phasemap here — one
// phase per component, in build order — with their code planned and greyed (Files, Code) until a phase codes it.
function _phExpandForm() {
  return `<div class="ds ph-add"><div class="ds-label">expand the system from its spec</div>
    <input id="ph-exp-feature" placeholder="the feature, capability or expansion — a few words (it names the phasemap)" style="width:100%">
    <textarea id="ph-exp-ask" rows="3" placeholder="what it should do — the agent plans the components, each with its capability and commands" style="width:100%"></textarea>
    <div class="ph-empty">a snapshot is taken first · the registry, the living spec and the nodes grow · each component becomes a phase · its code stays greyed until its phase writes it</div>
    <div class="action-row"><button class="action-btn" onclick="phasesExpand()">expand</button><button class="action-btn" onclick="phasesExpandOpen(false)">cancel</button></div></div>`;
}
function phasesExpandOpen(on = true) { PHASES.expanding = !!on; _phPaint(); }
async function phasesExpand() {
  const uuid = PHASES.uuid;
  const feature = ((document.getElementById('ph-exp-feature') || {}).value || '').trim();
  const ask = ((document.getElementById('ph-exp-ask') || {}).value || '').trim();
  if (!feature && !ask) return toast('say what the system should gain', 'err');
  PHASES.busy = true; _phPaint();
  try {
    const r = await api(`/api/repos/${uuid}/expand`, { method: 'POST', body: JSON.stringify({ feature: feature || ask.slice(0, 80), ask: ask || feature }) }, 300000);
    toast(`expanded: ${r.components.length} component(s) slotted in · ${r.phasemap.phases.length} phase(s) in ${_phShortMap(r.phasemap.path)} · snapshot ${r.snapshot}`, 'ok');
    PHASES.expanding = false;
    if (typeof loadFileStates === 'function') loadFileStates(CURRENT_API_REPO, { force: true });
  } catch (e) { toast(`not expanded: ${e.message}`, 'err'); }
  PHASES.busy = false;
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'phases') renderRepoPhases(CURRENT_API_REPO, { keepScroll: true });
}
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


// §0.39.284 W2 — James: "the phases tab needs to populate with the plan". An empty tab lists the repo's specs, each
// with "plan from the spec" (derived at once, no agent) and "ask the agent" (the Spec tab's Build this spec).
async function _phPlanSpecs() {
  const el = document.getElementById('ph-plan-specs'); const repo = CURRENT_API_REPO; if (!el || !repo) return;
  let specs = [];
  try { specs = ((await api(`/api/repos/${repo.uuid}/living-spec`, {}, 20000)).specs || []); } catch (e) { el.querySelector('.ds-mono').textContent = `could not read the specs: ${e.message}`; return; }
  if (!specs.length) { el.querySelector('.ds-mono').textContent = 'no .spec file in this repo yet — add one in the Files tab, then plan it here.'; return; }
  el.innerHTML = `<div class="ds-label">plan a spec — its phases land here</div>` + specs.slice(0, 20).map(s => `<div class="ph-plan-row">
      <span class="ph-plan-name">${escapeHtml(s.path.split('/').pop())}<small>${escapeHtml(s.path)}</small></span>
      <button class="action-btn" onclick="phPlanDerive('${escapeHtml(s.path)}')" title="one phase per section of the spec, bottom-up — no agent, written now">⚡ plan from the spec</button>
      <button class="action-btn" onclick="phPlanAgent('${escapeHtml(s.path)}')" title="the repo's agent plans it; if it writes no map, the plan is derived">▶ ask the agent</button></div>`).join('');
}
async function phPlanDerive(specPath) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try {
    const r = await api(`/api/repos/${repo.uuid}/spec/plan`, { method: 'POST', body: JSON.stringify({ path: specPath, derive: true }) }, 60000);
    toast(`${r.mapPath}: ${r.phases} phases`, 'ok');
    renderPhasesRefresh();
  } catch (e) { toast(`not planned: ${e.message}`, 'err'); }
}
async function phPlanAgent(specPath) {
  setRepoSubtab('spec');
  await renderLivingSpec(CURRENT_API_REPO, specPath);
  await specBuildLoad(specPath);
  specPlanAsk();
}
function renderPhasesRefresh() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (typeof renderRepoPhases === 'function') renderRepoPhases(repo, { keepScroll: true });
}
