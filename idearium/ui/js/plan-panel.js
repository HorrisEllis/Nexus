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

const PLANP = { uuid: null, map: null, data: null, runs: [], open: new Set(), focus: null, wide: false, showDone: _ppShowDoneSaved() };
// §CT7 0.39.352 — James: "the plan needs to only show current work." · "completely either need to clear or need a clear
// complete button." Complete steps and complete sections fold into one line with their count (hidden, never deleted);
// one click shows them; the choice is remembered in this browser.
function _ppShowDoneSaved() { try { return localStorage.getItem('idearium.plan.showDone') === '1'; } catch (_) { return false; } }
function planToggleDone() { PLANP.showDone = !PLANP.showDone; try { localStorage.setItem('idearium.plan.showDone', PLANP.showDone ? '1' : '0'); } catch (_) { /* a per-browser convenience */ } _planPaint(); }
function _ppDoneLine(n, what) { return n ? `<button class="pp-donefold" onclick="planToggleDone()" title="${PLANP.showDone ? 'hide' : 'show'} what is complete">✓ ${n} ${what} complete — ${PLANP.showDone ? 'hide' : 'show'}</button>` : ''; }
const _PLAN_GATE_LABEL = { escalating: 'escalating', retrying: 'retrying', mapped: 'mapped', snapshot: 'snapshot', dispatched: 'sent', replied: 'replied', blocked: 'blocked', incomplete: 'incomplete', reviewing: 'reviewing', reviewed: 'reviewed', skipped: 'skipped', landed: 'landed', closed: 'closed' };

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
  planTabSync();
  loadPlanPanel();
}
function closePlanPanel() { const el = document.getElementById('plan-panel'); if (el) el.classList.remove('open'); planTabSync(); }

// §CT9 0.39.353 — James: "need a little pull tab on the very right for when i close the plan." While a repo is open and the
// panel is closed: a tab on the right edge — "Plan", the done count, a blinking dot while a step builds; a click opens it.
// It follows the repo view (app.js setView / setRepoSubtab call planTabSync): gone on the repos grid and other pages.
function planTabSync() {
  let t = document.getElementById('plan-tab');
  const panel = document.getElementById('plan-panel');
  const inRepo = typeof CURRENT_API_REPO !== 'undefined' && !!CURRENT_API_REPO && [...document.querySelectorAll('.repo-subtab-btn')].some(b => b.offsetParent !== null);
  const show = inRepo && !(panel && panel.classList.contains('open'));
  if (!show) { if (t) t.hidden = true; return; }
  if (!t) {
    t = document.createElement('button'); t.id = 'plan-tab'; t.type = 'button'; t.title = 'open the Plan';
    t.onclick = () => openPlanPanel();
    document.body.appendChild(t);
  }
  const sm = PLANP.data && PLANP.uuid === CURRENT_API_REPO.uuid ? (PLANP.data.summary || {}) : null;
  t.innerHTML = `${sm && sm.building ? '<span class="pp-tab-dot"></span>' : ''}<span class="pp-tab-label">Plan</span>${sm && sm.total ? `<span class="pp-tab-n">${sm.complete || 0}/${sm.total}</span>` : ''}`;
  t.hidden = false;
}
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
    // §0.39.284 — James: "i just added a new idea and promoted to spec. it needs to show the plan when building." A
    // promoted spec builds as spec-engine chunks (one per file), not phasemap phases — the panel shows that build too.
    PLANP.code = null;
    const specUuid = repo.specUuid || repo.promotedFromSpec || null;
    if (specUuid) { try { const r = await api(`/api/spec-engine/specs/${specUuid}`, {}, 20000); PLANP.code = r.manifest || r.spec || r; } catch (_) {} }
    // §0.39.291 PV4 — the proof run (build → verify → repair) of this repo, when its spec builds files
    PLANP.proof = null;
    if (PLANP.code && (PLANP.code.fileTree || (PLANP.code.chunks || []).some(c => c.realPath))) {
      try { PLANP.proof = await api(`/api/repos/${repo.uuid}/prove`, {}, 15000); } catch (_) {}
      if (PLANP.proof && PLANP.proof.run && PLANP.proof.run.state === 'running' && !_planProofT) _planProofPoll();   // opened mid-run: follow it
    }
  } catch (e) { body.innerHTML = `<div class="pp-empty">could not read the plan: ${escapeHtml(e.message)}</div>`; return; }
  _planPaint();
}

function _gateBar(s) {
  return `<div class="pp-gates" title="${s.gates.map(g => `${_PLAN_GATE_LABEL[g.gate]} ${g.passed ? '✓' : '·'}`).join('  ')}">${s.gates.map(g => `<span class="pp-g ${g.passed ? 'on' : ''} ${s.gate === g.gate ? (s.failed ? 'bad' : 'cur') : ''}"></span>`).join('')}</div>`;
}
function _ledgerHtml(rows) {
  if (!rows.length) return '<div class="pp-led-empty">no runs yet — ▶ builds it (a snapshot first, then the repo\'s agent)</div>';
  return rows.map(l => `<div class="pp-led"><span class="pp-led-t">${new Date(l.ts).toLocaleTimeString()}</span><span class="pp-led-s pp-${escapeHtml(l.state)}">${escapeHtml(l.state)}</span>
    <span class="pp-led-d">${l.snapshot ? `snapshot ${escapeHtml(String(l.snapshot).slice(0, 12))} · ` : ''}${l.provider ? `${escapeHtml(l.provider)}${l.rung ? ` (rung ${l.rung}/${l.rungs}${l.attempt > 1 ? `, try ${l.attempt}` : ''})` : ''} · ` : ''}${l.toolErrors ? '<span style="color:var(--coral)">stopped: failed tool calls in a row</span> · ' : ''}${(l.injected || []).length ? `files ${l.injected.slice(0, 6).map(f => typeof wsOpenInCode === 'function' ? `<a href="#" class="pp-file" title="open in the Code tab" onclick="wsOpenInCode('${escapeHtml(String(f).replace(/'/g, "\\'"))}');return false">${escapeHtml(f)}</a>` : escapeHtml(f)).join(', ')}${l.injected.length > 6 ? ` +${l.injected.length - 6}` : ''} · ` : ''}${l.error ? `<span style="color:var(--coral)">${escapeHtml(l.error)}</span>` : ''}</span>
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
    ${_planCodeBuild()}
    ${_planProof()}
    ${sm.total ? `<div class="pp-progress"><div style="width:${Math.round((sm.progress || 0) * 100)}%"></div></div>` : ''}
    <div class="pp-sec">tasks</div>
    ${(() => {   // §CT7 — current work: what is building, next, stopped or waiting; the complete fold into one line
      if (!steps.length) return '<div class="pp-empty">no phases yet — plan a spec (Spec tab → ▶ Build this spec)</div>';
      const isDone = (s) => s.status === 'complete' || s.status === 'done';
      const open = steps.filter(s => !isDone(s)), done = steps.filter(isDone);
      return (open.length ? open.map(task).join('') : '<div class="pp-empty">nothing left to build here — every step is complete</div>')
        + _ppDoneLine(done.length, `step${done.length === 1 ? '' : 's'}`) + (PLANP.showDone ? done.map(task).join('') : '');
    })()}
    ${other.length ? `<div class="pp-sec">plans and file jobs</div>${other.map(r => `<div class="pp-act"><span class="pp-led-s pp-${escapeHtml(r.state)}">${escapeHtml(r.state)}</span> ${escapeHtml(r.title || `${r.phase} ${r.map}`)} <span class="pp-led-t">${new Date(r.ts).toLocaleTimeString()}</span>${r.error ? `<div style="color:var(--coral);font-size:10px">${escapeHtml(r.error)}</div>` : ''}</div>`).join('')}` : ''}
    <details class="pp-actwrap"><summary class="pp-sec">activity · ${activity.length}</summary>${activity.map(r => `<div class="pp-act"><span class="pp-led-t">${new Date(r.ts).toLocaleString()}</span> <span class="pp-led-s pp-${escapeHtml(r.state)}">${escapeHtml(r.state)}</span> ${escapeHtml(r.phase || '')} <span style="opacity:.6">${escapeHtml(String(r.map || '').split('/').pop())}</span></div>`).join('')}</details>
    <div id="pp-ws" class="pp-ws"></div>`;
  PLANP.focus = null;
  planTabSync();   // §CT9 — the tab's count follows the plan
  // §0.39.284 W3 — the work surface, below the plan: every file the agent changed, as diffs, and its tools
  if (typeof wsLoad === 'function') { const w = document.getElementById('pp-ws'); if (WSURF.data && WSURF.uuid === PLANP.uuid) wsPaint(w); wsLoad(w); }
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
  if (!/^(repo\.(phase\.run|file\.manage|deviation|roadmap\.updated|inject\.|spec\.planned|prove\.|verify)|spec-engine\.|spec\.chunk|chunk\.)/.test(t)) return;
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


// §0.39.284 — the spec's own build (spec-engine chunks: one per file for a code spec), as tasks with their state
const _PP_CHUNK_MARK = { complete: '✓', building: '◌', dispatched: '◌', generating: '◌', failed: '!', stalled: '!', pending: '○', removed: '–' };
function _planCodeBuild() {
  const m = PLANP.code; if (!m || !Array.isArray(m.chunks) || !m.chunks.length) return '';
  const live = m.chunks.filter(c => c.status !== 'removed');
  const done = live.filter(c => c.status === 'complete').length;
  const bad = live.filter(c => c.status === 'failed' || c.status === 'stalled');
  const busy = live.some(c => ['building', 'dispatched', 'generating'].includes(c.status));
  const isDone = (c) => c.status === 'complete';
  const rows = live.filter(c => PLANP.showDone || !isDone(c)).map(c => {
    const name = (c.file && c.file.path) || c.title || c.sectionId;
    const err = c.failureMode || c.error || c.lastError || c.failReason || (c.dispatch && c.dispatch.error) || '';
    return `<div class="pp-task ${c.status === 'complete' ? 'done' : ''} ${['building', 'dispatched', 'generating'].includes(c.status) ? 'cur' : ''}"><div class="pp-row">
      <span class="pp-mark" style="${c.status === 'failed' || c.status === 'stalled' ? 'color:var(--coral)' : ''}">${_PP_CHUNK_MARK[c.status] || '○'}</span>
      <span class="pp-name">${escapeHtml(name)}</span>${c.file && c.file.layer ? `<span class="pp-layer">${escapeHtml(c.file.layer)}</span>` : ''}
      <span class="pp-led-s pp-${escapeHtml(c.status === 'complete' ? 'replied' : c.status === 'failed' || c.status === 'stalled' ? 'failed' : c.status === 'pending' ? 'pending' : 'building')}">${escapeHtml(c.status)}</span></div>
      ${err ? `<div class="pp-detail" style="color:var(--coral)">${escapeHtml(String(err).slice(0, 300))}</div>` : ''}</div>`;
  }).join('');
  return `<div class="pp-sec">building ${escapeHtml(m.name || 'the spec')} — ${done}/${live.length} ${m.fileTree ? 'files' : 'sections'}${bad.length ? ` · <span style="color:var(--coral)">${bad.length} stopped</span>` : ''}</div>
    <div class="pp-progress"><div style="width:${live.length ? Math.round(done / live.length * 100) : 0}%"></div></div>
    ${done < live.length ? `<button class="pp-go" ${busy ? 'disabled' : ''} onclick="planCodeBuild('${escapeHtml(m.uuid)}')">${busy ? '◌ building…' : bad.length ? '▶ retry the stopped and build the rest' : '▶ build the rest'}</button>` : ''}
    ${_ppDoneLine(done, m.fileTree ? `file${done === 1 ? '' : 's'}` : `section${done === 1 ? '' : 's'}`)}
    ${rows}`;
}
// §0.39.291 PV4 — James: "gate, verify, check, if failed, send back and fix it, then back through." Does the code work:
// Verify once, or Build & prove (build every file, verify in COS, send each failure back with its exact error, again).
const _PP_VERDICT = { proven: ['proven', 'var(--mint, #34d399)'], parses: ['parses — not proven', 'var(--amber, #fbbf24)'], failed: ['failed', 'var(--coral, #f87171)'], stalled: ['stalled', 'var(--coral, #f87171)'] };
function _ppVerdict(v) { const x = _PP_VERDICT[v]; return x ? `<span style="color:${x[1]};font-weight:600">${escapeHtml(x[0])}</span>` : '<span style="opacity:.6">…</span>'; }
function _planProof() {
  const m = PLANP.code; if (!m || !(m.fileTree || (m.chunks || []).some(c => c.realPath))) return '';
  const run = PLANP.proof && PLANP.proof.run;
  const running = run && run.state === 'running';
  const rounds = run ? (run.rounds || []).map(rr => `<div class="pp-task ${rr.verdict === 'proven' ? 'done' : ''}"><div class="pp-row">
      <span class="pp-mark">${rr.round}</span><span class="pp-name">round ${rr.round} · ${rr.built} built${rr.reused ? ` · ${rr.reused} reused` : ''}${rr.current ? ` · building ${escapeHtml(rr.current)}` : ''}</span>
      <span class="pp-led-s">${_ppVerdict(rr.verdict)}</span></div>
      ${(rr.failures || []).slice(0, 8).map(f => `<div class="pp-detail" style="color:var(--coral)">${escapeHtml(f.kind)} · ${escapeHtml(f.file || '(project)')}${f.line ? `:${f.line}` : ''} — ${escapeHtml(String(f.error).slice(0, 220))}</div>`).join('')}
      ${rr.known ? `<div class="pp-detail" title="${escapeHtml((rr.knownFiles || []).join('\n'))}">known debt: ${rr.known} older failure(s) in files this run did not touch — not this run's, not sent back</div>` : ''}
      ${(rr.repaired || []).length ? `<div class="pp-detail">sent back with the failure: ${escapeHtml(rr.repaired.join(', '))}</div>` : ''}
      ${(rr.notBuiltBySpec || []).length ? `<div class="pp-detail" style="color:var(--coral)">not built by this spec (cannot be sent back): ${escapeHtml(rr.notBuiltBySpec.join(', '))}</div>` : ''}
      ${rr.stalled ? `<div class="pp-detail" style="color:var(--coral)">${escapeHtml(rr.stalled)}</div>` : ''}</div>`).join('') : '';
  return `<div class="pp-sec">does it work${run ? ` — ${_ppVerdict(run.verdict || (running ? null : run.state))}` : ''}</div>
    ${run && run.why ? `<div class="pp-detail">${escapeHtml(run.why)}</div>` : ''}
    <div class="pp-row" style="gap:8px;flex-wrap:wrap;margin:6px 0">
      <button class="pp-go" ${running ? 'disabled' : ''} onclick="planVerify()" title="parses · imports resolve · the project's own tests in an isolated COS branch">✓ verify</button>
      <button class="pp-go" ${running ? 'disabled' : ''} onclick="planProve()" title="build every file, verify, send each failing file back with its exact error, again — up to 3 rounds">▶ build &amp; prove</button>
      ${running ? `<button class="pp-go" onclick="planProveCancel()">■ stop</button>` : ''}
    </div>
    ${rounds}`;
}
async function planVerify() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  toast('verifying — the files, their imports, then the tests in COS…', 'ok');
  try {
    const v = await api(`/api/repos/${repo.uuid}/verify`, { method: 'POST', body: '{}' }, 600000);
    PLANP.proof = { run: { state: 'done', verdict: v.verdict, why: `verify — ${v.why}`, rounds: [{ round: 1, built: 0, reused: 0, verdict: v.verdict, failures: v.failures }] } };
    _planPaint();
    toast(`${v.verdict}: ${v.why}`, v.verdict === 'failed' ? 'err' : 'ok');
  } catch (e) { toast(`not verified: ${e.message}`, 'err'); }
}
async function planProve() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { const r = await api(`/api/repos/${repo.uuid}/prove`, { method: 'POST', body: JSON.stringify({ rounds: 3 }) }, 30000); toast(r.alreadyRunning ? 'a proof run is already working — following it' : 'proving — build, verify, repair; each round lands here', 'ok'); }
  catch (e) { toast(`not started: ${e.message}`, 'err'); }
  _planProofPoll();
}
async function planProveCancel() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { await api(`/api/repos/${repo.uuid}/prove/cancel`, { method: 'POST', body: '{}' }, 15000); toast('stopping after the current file', 'ok'); } catch (e) { toast(e.message, 'err'); }
}
let _planProofT = null;
function _planProofPoll() {
  clearTimeout(_planProofT);
  _planProofT = setTimeout(async () => {
    await loadPlanPanel();
    const run = PLANP.proof && PLANP.proof.run;
    _planProofT = null;
    if (run && run.state === 'running') _planProofPoll();
  }, 2500);
}

async function planCodeBuild(specUuid) {
  try { await api(`/api/spec-engine/specs/${specUuid}/build`, { method: 'POST', body: '{}' }, 60000); toast('building — each file lands here as it completes', 'ok'); }
  catch (e) { toast(`not started: ${e.message}`, 'err'); }
  setTimeout(loadPlanPanel, 1500);
}
