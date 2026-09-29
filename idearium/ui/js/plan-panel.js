// ════════════════════════════════════════════════════════════════════════════
// §PLAN — idearium/ui/js/plan-panel.js (0.39.280 BS11)
// UUID: nexus-idearium-ui-plan-panel-v1-0000-2026-0929-jamesbrooks-001
// Map: docs/2026-09-29-build-surface-phasemap.spec (BS11)
//
// James: "the plan, can you have something like that, showing progress, and expandable tasks, to show the event ledger
// and activity. maybe use the gates as progress also?" · "need to have a better area for beginning the build"
//
//   the panel     a floating panel (drag its header, resize its corner, ⤢ wide, ✕ close): the repo's build steps in
//                 build order — ✓ done · ◌ current · ○ next — each with its gates as a progress bar (mapped → snapshot
//                 → dispatched → replied → landed → closed) and, expanded, its event ledger (every run: when, state,
//                 snapshot, agent, files, the reply). Below: ACTIVITY — every run of the repo (phases, spec plans,
//                 file manages), newest first. Live on idearium.repo.phase.run / file.manage / deviation events.
//                 GET /api/repos/:uuid/plan[?map=] (idearium/repo/build-plan.js — a projection, it stores nothing)
//                 and GET …/phases/runs.
//   start card    the repo's Home tab: "Start building" — its specs, each with Plan / Build next, and the plan.
// ════════════════════════════════════════════════════════════════════════════

const PLANP = { uuid: null, map: null, data: null, runs: [], open: new Set(), focus: null, wide: false };
const _PLAN_GATE_LABEL = { mapped: 'mapped', snapshot: 'snapshot', dispatched: 'sent', replied: 'replied', blocked: 'blocked', incomplete: 'incomplete', reviewing: 'reviewing', reviewed: 'reviewed', skipped: 'skipped', landed: 'landed', closed: 'closed' };

function _planEl() {
  let el = document.getElementById('plan-panel');
  if (el) return el;
  el = document.createElement('div'); el.id = 'plan-panel';
  el.innerHTML = `<div class="pp-head" id="pp-head"><span class="pp-title">Plan</span><span class="pp-sub" id="pp-sub"></span><span class="pp-grow"></span>
      <select id="pp-map" class="pp-map" onchange="PLANP.map=this.value||null;loadPlanPanel()"></select>
      <button class="pp-btn" title="wide" onclick="PLANP.wide=!PLANP.wide;document.getElementById('plan-panel').classList.toggle('wide',PLANP.wide)">⤢</button>
      <button class="pp-btn" title="close" onclick="closePlanPanel()">✕</button></div>
    <div class="pp-body" id="pp-body"></div>`;
  document.body.appendChild(el);
  // drag by the header (a compartment you can move)
  const head = el.querySelector('#pp-head');
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button,select')) return;
    const r = el.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (m) => { el.style.left = `${Math.max(0, Math.min(innerWidth - 80, m.clientX - dx))}px`; el.style.top = `${Math.max(0, Math.min(innerHeight - 40, m.clientY - dy))}px`; el.style.right = 'auto'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  return el;
}

function openPlanPanel({ map = undefined, focus = null } = {}) {
  const repo = CURRENT_API_REPO; if (!repo) { toast('open a repo first', 'err'); return; }
  if (PLANP.uuid !== repo.uuid) Object.assign(PLANP, { uuid: repo.uuid, map: null, data: null, runs: [], open: new Set() });
  if (map !== undefined) PLANP.map = map;
  if (focus) PLANP.focus = focus;
  _planEl().classList.add('open');
  loadPlanPanel();
}
function closePlanPanel() { const el = document.getElementById('plan-panel'); if (el) el.classList.remove('open'); }
function togglePlanPanel() { const el = document.getElementById('plan-panel'); if (el && el.classList.contains('open')) closePlanPanel(); else openPlanPanel(); }

async function loadPlanPanel() {
  const repo = CURRENT_API_REPO; if (!repo || PLANP.uuid !== repo.uuid) return;
  const body = document.getElementById('pp-body'); if (!body) return;
  if (!PLANP.data) body.innerHTML = '<div class="pp-empty">reading the plan…</div>';
  try {
    const [plan, runs] = await Promise.all([
      api(`/api/repos/${repo.uuid}/plan${PLANP.map ? `?map=${encodeURIComponent(PLANP.map)}` : ''}`, {}, 30000),
      api(`/api/repos/${repo.uuid}/phases/runs`, {}, 30000).catch(() => ({ runs: [] })),
    ]);
    if (PLANP.uuid !== repo.uuid) return;
    PLANP.data = plan; PLANP.runs = runs.runs || [];
  } catch (e) { body.innerHTML = `<div class="pp-empty">could not read the plan: ${escapeHtml(e.message)}</div>`; return; }
  _planPaint();
}

function _gateBar(s) {
  return `<div class="pp-gates" title="${s.gates.map(g => `${_PLAN_GATE_LABEL[g.gate]} ${g.passed ? '✓' : '·'}`).join('  ')}">${s.gates.map(g => `<span class="pp-g ${g.passed ? 'on' : ''} ${s.gate === g.gate ? (s.failed ? 'bad' : 'cur') : ''}"></span>`).join('')}</div>`;
}
function _ledgerHtml(rows) {
  if (!rows.length) return '<div class="pp-led-empty">no runs yet — ▶ builds it (a snapshot first, then the repo\'s agent)</div>';
  return rows.map(l => `<div class="pp-led"><span class="pp-led-t">${new Date(l.ts).toLocaleTimeString()}</span><span class="pp-led-s pp-${escapeHtml(l.state)}">${escapeHtml(l.state)}</span>
    <span class="pp-led-d">${l.snapshot ? `snapshot ${escapeHtml(String(l.snapshot).slice(0, 12))} · ` : ''}${l.provider ? `${escapeHtml(l.provider)} · ` : ''}${(l.injected || []).length ? `files ${escapeHtml(l.injected.slice(0, 6).join(', '))}${l.injected.length > 6 ? ` +${l.injected.length - 6}` : ''} · ` : ''}${l.error ? `<span style="color:var(--coral)">${escapeHtml(l.error)}</span>` : ''}</span>
    ${l.reply ? `<details class="pp-reply"><summary>reply</summary><pre>${escapeHtml(l.reply)}</pre></details>` : ''}</div>`).join('');
}

function _planPaint() {
  const d = PLANP.data; const body = document.getElementById('pp-body'); if (!d || !body) return;
  const sel = document.getElementById('pp-map');
  const maps = [...new Set((PLANP.runs || []).map(r => r.map).filter(m => m && !String(m).startsWith('file:')))];
  if (PLANP.map && !maps.includes(PLANP.map)) maps.unshift(PLANP.map);
  if (sel) sel.innerHTML = `<option value="">every phasemap</option>${maps.map(m => `<option value="${escapeHtml(m)}" ${m === PLANP.map ? 'selected' : ''}>${escapeHtml(String(m).split('/').pop())}</option>`).join('')}`;
  const sm = d.summary || {};
  document.getElementById('pp-sub').textContent = `${sm.complete || 0}/${sm.total || 0} done${sm.building ? ` · ${sm.building} building` : ''}${sm.failed ? ` · ${sm.failed} stopped` : ''}`;
  const steps = (d.steps || []).slice(0, 400);
  const task = (s) => {
    const done = s.status === 'complete' || s.status === 'done';
    const key = `${s.map}::${s.key}`;
    const open = PLANP.open.has(key) || (PLANP.focus && s.run && s.run.runId === PLANP.focus);
    return `<div class="pp-task ${done ? 'done' : ''} ${s.current ? 'cur' : ''}">
      <div class="pp-row" onclick="planToggle('${escapeHtml(key)}')">
        <span class="pp-mark">${done ? '✓' : s.current ? '◌' : s.failed ? '!' : '○'}</span>
        <span class="pp-name">${escapeHtml(s.title)}</span>
        ${s.layer ? `<span class="pp-layer">${escapeHtml(s.layer)}</span>` : ''}${_gateBar(s)}
      </div>
      ${open ? `<div class="pp-detail"><div class="pp-meta">${escapeHtml(s.key)} · ${escapeHtml(String(s.map).split('/').pop())} · gate: ${escapeHtml(s.gate || 'all passed')}${s.failed ? ` · <span style="color:var(--coral)">${escapeHtml(s.failed.state)}: ${escapeHtml(s.failed.error || '')}</span>` : ''}</div>
        ${done ? '' : `<button class="pp-go" onclick="event.stopPropagation();planBuild('${escapeHtml(s.map)}','${escapeHtml(s.key)}')">▶ build</button>`}
        ${_ledgerHtml(s.ledger || [])}</div>` : ''}
    </div>`;
  };
  const other = (PLANP.runs || []).filter(r => r.phase === 'PLAN' || String(r.map || '').startsWith('file:')).slice(0, 12);
  const activity = (PLANP.runs || []).slice(0, 25);
  body.innerHTML = `
    ${sm.total ? `<div class="pp-progress"><div style="width:${Math.round((sm.progress || 0) * 100)}%"></div></div>` : ''}
    <div class="pp-sec">tasks</div>
    ${steps.length ? steps.map(task).join('') : '<div class="pp-empty">no phases yet — plan a spec (Spec tab → ▶ Build this spec)</div>'}
    ${other.length ? `<div class="pp-sec">plans and file jobs</div>${other.map(r => `<div class="pp-act"><span class="pp-led-s pp-${escapeHtml(r.state)}">${escapeHtml(r.state)}</span> ${escapeHtml(r.title || `${r.phase} ${r.map}`)} <span class="pp-led-t">${new Date(r.ts).toLocaleTimeString()}</span>${r.error ? `<div style="color:var(--coral);font-size:10px">${escapeHtml(r.error)}</div>` : ''}</div>`).join('')}` : ''}
    <details class="pp-actwrap"><summary class="pp-sec">activity · ${activity.length}</summary>${activity.map(r => `<div class="pp-act"><span class="pp-led-t">${new Date(r.ts).toLocaleString()}</span> <span class="pp-led-s pp-${escapeHtml(r.state)}">${escapeHtml(r.state)}</span> ${escapeHtml(r.phase || '')} <span style="opacity:.6">${escapeHtml(String(r.map || '').split('/').pop())}</span></div>`).join('')}</details>`;
  PLANP.focus = null;
}
function planToggle(key) { if (PLANP.open.has(key)) PLANP.open.delete(key); else PLANP.open.add(key); _planPaint(); }
async function planBuild(map, phase) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try {
    const r = await api(`/api/repos/${repo.uuid}/phases/build`, { method: 'POST', body: JSON.stringify({ map, phase }) }, 120000);
    toast(`${phase}: snapshot ${r.snapshot} · the agent is building it`, 'ok'); PLANP.focus = r.runId; PLANP.open.add(`${map}::${phase}`);
  } catch (e) { toast(`${phase} not built: ${e.message}`, 'err'); }
  loadPlanPanel();
}

// live: a run, a manage job or a deviation for the open repo repaints the panel (one read per burst)
let _planT = null;
function planPanelOnEvent(ev) {
  const t = ev && ev.type ? ev.type.replace(/^idearium\./, '') : '';
  if (!/^repo\.(phase\.run|file\.manage|deviation|roadmap\.updated|inject\.applied)/.test(t)) return;
  const el = document.getElementById('plan-panel'); if (!el || !el.classList.contains('open')) return;
  const u = ev.payload && ev.payload.repoUuid; if (u && PLANP.uuid && u !== PLANP.uuid) return;
  clearTimeout(_planT); _planT = setTimeout(loadPlanPanel, 500);
}

// ── the build-start area (Home tab) ─────────────────────────────────────────
async function renderBuildStart(repo) {
  const el = document.getElementById('repo-build-start'); if (!el || !repo) return;
  el.innerHTML = '<div class="bs-card"><div class="bs-title">Start building</div><div class="bs-sub">reading the specs…</div></div>';
  let specs = [];
  try { const d = await api(`/api/repos/${repo.uuid}/living-spec`, {}, 20000); specs = d.specs || []; } catch (_) {}
  if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
  const plans = await Promise.all(specs.slice(0, 12).map(s => api(`/api/repos/${repo.uuid}/spec/plan?path=${encodeURIComponent(s.path)}`, {}, 20000).catch(() => null)));
  if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
  const row = (s, p) => {
    const n = p && p.exists ? p.phases.length : 0, done = p && p.exists ? p.phases.filter(x => x.status === 'done' || x.status === 'complete').length : 0;
    return `<div class="bs-spec"><div class="bs-spec-name">${escapeHtml(s.path.split('/').pop())}<small>${escapeHtml(s.path)}</small></div>
      <div class="bs-spec-state">${!p ? '—' : !p.exists ? 'no phases yet' : `${done}/${n} phases${p.next ? ` · next ${escapeHtml(p.next.split('_')[0])}` : ''}`}</div>
      <div class="bs-bar"><div style="width:${n ? Math.round(done / n * 100) : 0}%"></div></div>
      <button class="ls-go" onclick="buildStartGo('${escapeHtml(s.path)}')">${!p || !p.exists ? '▶ plan + build' : p.next ? '▶ build next' : '✓ built'}</button></div>`;
  };
  el.innerHTML = `<div class="bs-card"><div class="bs-top"><div><div class="bs-title">Start building</div>
      <div class="bs-sub">pick a spec: its whole build is split into phases — bottom-up, chunked, with the axioms — then built one at a time, each after a Versionium snapshot.</div></div>
      <button class="ls-mini" onclick="openPlanPanel()">plan ▸</button></div>
    ${specs.length ? specs.slice(0, 12).map((s, i) => row(s, plans[i])).join('') : `<div class="bs-sub">no .spec in this repo yet — put one at spec/${escapeHtml(String(repo.name || 'repo').split('/').pop())}.spec (Files tab), then start here.</div>`}</div>`;
}
async function buildStartGo(specPath) {
  // the Spec tab is where a spec is built: open it on that spec, then press its build button
  setRepoSubtab('spec');
  await renderLivingSpec(CURRENT_API_REPO, specPath);
  await specBuildLoad(specPath);
  const p = LSBUILD.plan;
  if (!p) return;
  if (!p.exists) return specPlanAsk();
  if (p.next) return specBuildPhase(null);
  toast(`${specPath}: every phase is done`, 'ok');
}
