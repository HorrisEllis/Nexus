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

const PLANP = { uuid: null, map: null, data: null, runs: [], open: new Set(), focus: null, wide: false, popout: (() => { try { return localStorage.getItem('idearium.plan.popout') === '1'; } catch (_) { return false; } })(), showDone: _ppShowDoneSaved(), logOpen: (() => { try { return localStorage.getItem('idearium.rt.open') === '1'; } catch (_) { return false; } })() };
// §CT7 0.39.352 — James: "the plan needs to only show current work." · "completely either need to clear or need a clear
// complete button." Complete steps and complete sections fold into one line with their count (hidden, never deleted);
// one click shows them; the choice is remembered in this browser.
function _ppShowDoneSaved() { try { return localStorage.getItem('idearium.plan.showDone') === '1'; } catch (_) { return false; } }
const PP_NEXT_N = 3;   // §HP9 — how many not-started steps the queue shows after what is running
function planToggleRest() { PLANP.showRest = !PLANP.showRest; _planPaint(); }
function planToggleDone() { PLANP.showDone = !PLANP.showDone; try { localStorage.setItem('idearium.plan.showDone', PLANP.showDone ? '1' : '0'); } catch (_) { /* a per-browser convenience */ } _planPaint(); }
// §0.60.0 PP1 — James: "the plan panel doesn't need to show all the completed phases at all times. needs a clear button
// to remove them." ⌫ clear takes everything complete off the panel — steps, a finished spec build, a finished proof, done
// plans and file jobs — as of that moment; new work still shows. Nothing is deleted (the runs stay in the ledger and the
// log); "restore" brings them back. Per repo, remembered in this browser.
function _ppClearKey(uuid) { return `idearium.plan.cleared.${uuid}`; }
function _ppClearedAt() { try { return Number(localStorage.getItem(_ppClearKey(PLANP.uuid))) || 0; } catch (_) { return 0; } }
function planClearDone() { try { localStorage.setItem(_ppClearKey(PLANP.uuid), String(Date.now())); } catch (_) { /* a per-browser convenience */ } PLANP.showDone = false; _planPaint(); }
function planRestoreDone() { try { localStorage.removeItem(_ppClearKey(PLANP.uuid)); } catch (_) {} _planPaint(); }
function _ppLastTs(s) { let t = 0; for (const l of s.ledger || []) t = Math.max(t, Number(l.ts) || 0); return t; }
function _ppDoneLine(n, what) { return n ? `<button class="pp-donefold" onclick="planToggleDone()" title="${PLANP.showDone ? 'hide' : 'show'} what is complete">✓ ${n} ${what} complete — ${PLANP.showDone ? 'hide' : 'show'}</button>` : ''; }
const _PLAN_GATE_LABEL = { escalating: 'escalating', retrying: 'retrying', interrupted: 'interrupted', mapped: 'mapped', snapshot: 'snapshot', dispatched: 'sent', replied: 'replied', blocked: 'blocked', incomplete: 'incomplete', reviewing: 'reviewing', reviewed: 'reviewed', skipped: 'skipped', landed: 'landed', closed: 'closed' };

function _planEl() {
  let el = document.getElementById('plan-panel');
  if (el) return el;
  el = document.createElement('div'); el.id = 'plan-panel';
  el.innerHTML = `<div class="pp-head" id="pp-head"><span class="pp-title">Plan</span><span class="pp-sub" id="pp-sub"></span><span class="pp-grow"></span>
      <select id="pp-map" class="pp-map" onchange="PLANP.map=this.value||null;loadPlanPanel()"></select>
      <span id="pp-run" class="pp-run"></span>
      <button class="pp-btn" title="take everything complete off the panel (kept in the ledger; restore brings it back)" onclick="planClearDone()">⌫ clear done</button>
      <button class="pp-btn" id="pp-dockbtn" title="pop out to a window you can move (it docks back with this button)" onclick="planDockToggle()">⧉</button>
      <button class="pp-btn" title="wide" onclick="PLANP.wide=!PLANP.wide;document.getElementById('plan-panel').classList.toggle('wide',PLANP.wide)">⤢</button>
      <button class="pp-btn" title="close" onclick="closePlanPanel()">✕</button></div>
    <div class="pp-body" id="pp-body"></div>`;
  document.body.appendChild(el);
  // drag by the header (a compartment you can move)
  const head = el.querySelector('#pp-head');
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button,select') || el.classList.contains('docked')) return;   // docked: it sits in the column
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
// §0.60.142 LV3 — James: "plan panel isn't bonud to the tab like the other." The Plan is the dock column's first panel
// (code-dock.js _dockPaintCol moves this element into it), bound to the Code tab and the rail like the others; ⧉ pops it
// out to a window and docks it back, remembered per browser.
function planDockToggle() {
  PLANP.popout = !PLANP.popout;
  try { localStorage.setItem('idearium.plan.popout', PLANP.popout ? '1' : '0'); } catch (_) { /* a per-browser convenience */ }
  planTabSync();
}
function closePlanPanel() { const el = document.getElementById('plan-panel'); if (el) el.classList.remove('open'); planTabSync(); }

// §CT9 0.39.353 — James: "need a little pull tab on the very right for when i close the plan." While a repo is open and the
// panel is closed: a tab on the right edge — "Plan", the done count, a blinking dot while a step builds; a click opens it.
// It follows the repo view (app.js setView / setRepoSubtab call planTabSync): gone on the repos grid and other pages.
function planTabSync() {
  let t = document.getElementById('plan-tab');
  const panel = document.getElementById('plan-panel');
  const inRepo = typeof CURRENT_API_REPO !== 'undefined' && !!CURRENT_API_REPO && [...document.querySelectorAll('.repo-subtab-btn')].some(b => b.offsetParent !== null);
  // §0.60.118 DK2 — with the dock on the page, the Plan's tab is the dock rail's first tab (one rail on the right edge, not two)
  if (typeof dockSync === 'function') { dockSync(); if (t) t.hidden = true; return; }
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
    // §0.60.107 PS2 — the Progress card's one line for the proposals (their diffs are Code › changes)
    try { const inj = await api(`/api/repos/${repo.uuid}/injects?status=proposed`, {}, 15000); PLANP.pending = (inj.injects || []).length; } catch (_) { PLANP.pending = 0; }
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
// §0.39.361 SB50 — James: "tasks need time stamped." A time: today → 14:02; another day → 6 Oct 14:02; another year with
// it. A date-only value (a map's YYYY-MM-DD) stays a date. A span: 45s · 3m 10s · 2h 05m · 3d 4h.
function _ppWhen(x) {
  if (!x) return '';
  if (typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x)) { const d = new Date(`${x}T00:00:00`); return isNaN(d) ? x : d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }); }
  const d = new Date(x); if (isNaN(d)) return '';
  const now = new Date(); const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })} ${hm}`;
}
function _ppSpan(ms) {
  if (ms == null || !(ms >= 0)) return '';
  const s = Math.round(ms / 1000); if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60); if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function _ppTimes(s) {
  const t = s.times || {}; const full = (x) => (x ? new Date(typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x) ? `${x}T00:00:00` : x).toLocaleString() : '');
  const bits = [['mapped', t.mapped], ['started', t.started], ['last run', t.lastRun], ['closed', t.closed]].filter(([, v]) => v)
    .map(([k, v]) => `<span title="${escapeHtml(`${k} ${full(v)}`)}">${k} ${escapeHtml(_ppWhen(v))}</span>`);
  if (t.runningMs != null) bits.push(`<span class="pp-running">building ${escapeHtml(_ppSpan(t.runningMs))}</span>`);
  return bits.length ? `<div class="pp-times">${bits.join('<span class="pp-dot">·</span>')}</div>` : '';
}

// §0.39.362 CH5 — James: "use the least amount of code with the highest levarage that achieves the end state". When the
// compartment's charter names an end state, that is its progress — the main bar; the phase count sits under it.
function _ppEndState(c) {
  if (!c || !(c.endState || []).length) return '';
  const l = c.latest;
  if (!l) return `<div class="pp-end"><div class="pp-end-h"><b>end state</b> <span class="pp-dim">not checked yet — ${c.endState.length} check${c.endState.length === 1 ? '' : 's'}</span><button class="pp-mini" onclick="ppCharterCheck()">check</button></div></div>`;
  const pct = l.total ? Math.round((l.met / l.total) * 100) : 0;
  return `<div class="pp-end"><div class="pp-end-h"><b>end state ${l.met}/${l.total}</b> <span class="pp-dim">${escapeHtml(_ppWhen(l.ts))}${l.against === 'proposed' && (l.overlaid || []).length ? ` · with ${l.overlaid.length} proposed file${l.overlaid.length === 1 ? '' : 's'}` : ''}</span><button class="pp-mini" onclick="ppCharterCheck()">check</button></div>
    <div class="pp-progress pp-progress-end"><div style="width:${pct}%"></div></div>
    <div class="pp-end-list">${(l.results || []).map(r => `<div class="${r.met ? 'ok' : 'bad'}" title="${escapeHtml(r.evidence || '')}">${r.met ? '✓' : '✗'} ${escapeHtml(r.says)}</div>`).join('')}</div></div>`;
}
// the charter itself: its axioms, conditions and end state — read, edited, saved (PUT /api/repos/:uuid/charter)
function _ppCharter(c) {
  const sum = !c || !c.exists ? 'none yet — axioms, conditions and an end state for this compartment' : `${(c.axioms || []).length} axiom${(c.axioms || []).length === 1 ? '' : 's'} · ${c.conditions || 0} condition${c.conditions === 1 ? '' : 's'} · ${(c.endState || []).length} end-state check${(c.endState || []).length === 1 ? '' : 's'}${(c.errors || []).length ? ` · <span style="color:var(--coral)">${c.errors.length} problem${c.errors.length === 1 ? '' : 's'}</span>` : ''}`;
  return `<details class="pp-actwrap pp-charter" ontoggle="if(this.open)ppCharterLoad()"><summary class="pp-sec">charter · ${sum}</summary>
    ${c && (c.axioms || []).length ? `<div class="pp-ax">${c.axioms.map(a => `<div>◆ ${escapeHtml(a)}</div>`).join('')}</div>` : ''}
    <textarea id="pp-charter-text" class="pp-charter-text" spellcheck="false" placeholder="reading charter.spec…"></textarea>
    <div class="pp-charter-bar"><button class="pp-mini" onclick="ppCharterSave()">save</button><button class="pp-mini" onclick="ppCharterCheck()">check the end state</button><span id="pp-charter-msg" class="pp-dim"></span></div></details>`;
}
async function ppCharterLoad() {
  const ta = document.getElementById('pp-charter-text'); if (!ta || !PLANP.uuid) return;
  try { const c = await api(`/api/repos/${PLANP.uuid}/charter`, {}, 20000); if (!ta.dataset.dirty) ta.value = c.exists ? c.text : (c.template || ''); }
  catch (e) { ta.placeholder = `could not read: ${e.message}`; }
  ta.oninput = () => { ta.dataset.dirty = '1'; };
}
async function ppCharterSave() {
  const ta = document.getElementById('pp-charter-text'), msg = document.getElementById('pp-charter-msg'); if (!ta) return;
  try { await api(`/api/repos/${PLANP.uuid}/charter`, { method: 'PUT', body: JSON.stringify({ text: ta.value }) }, 30000); delete ta.dataset.dirty; if (msg) msg.textContent = 'saved'; toast('charter saved', 'ok'); loadPlanPanel(); }
  catch (e) { if (msg) msg.textContent = e.message; toast(`charter not saved: ${e.message}`, 'err'); }
}
async function ppCharterCheck() {
  const msg = document.getElementById('pp-charter-msg'); if (msg) msg.textContent = 'checking the end state…';
  try { const r = await api(`/api/repos/${PLANP.uuid}/charter/check`, { method: 'POST', body: '{}' }, 300000); toast(r.empty ? r.note : `end state ${r.met}/${r.total}`, r.empty ? 'err' : 'ok'); loadPlanPanel(); }
  catch (e) { toast(`end state not checked: ${e.message}`, 'err'); if (msg) msg.textContent = e.message; }
}

// §0.39.361 AR2 — what went wrong on this phase before (fault_log), read before the run and handed to the agent
function _ppPrecedent(p) {
  if (!p || !p.length) return '';
  return `<div class="pp-prec"><span class="pp-route-h">failed before — the agent was told</span>${p.map(f => `<span class="pp-pf" title="fault ${escapeHtml(f.uuid || '')}">${escapeHtml(_ppWhen(f.ts))} · ${escapeHtml(f.agent || 'the build')} · <b>${escapeHtml(f.mode)}</b>${f.promptChars ? ` · ${f.promptChars} chars` : ''}</span>`).join('')}</div>`;
}
// §0.39.361 AR1 — the route a build took and why: each agent in ladder order, what Nexus has learned of it
function _ppRoute(r) {
  if (!r || !(r.order || []).length) return '';
  const why = new Map((r.why || []).map(w => [w.provider, w]));
  return `<div class="pp-route"><span class="pp-route-h">${r.learned ? 'route — learned from past builds' : 'route — as configured (nothing learned changes it yet)'}${r.bucket ? ` · ${escapeHtml(r.bucket)} request` : ''}</span>${r.order.map((p, i) => {
    const w = why.get(p); return `<span class="pp-rt${w && w.limited ? ' lim' : ''}" title="${escapeHtml(w ? w.why : '')}">${i + 1}. ${escapeHtml(p)}${w ? ` <i>${escapeHtml(w.why)}</i>` : ''}</span>`; }).join('')}${(r.skipped || []).map(s => `<span class="pp-rt lim" title="never tried — not counted as its failure">left off: ${escapeHtml(s.provider)} <i>${escapeHtml(s.why)}</i></span>`).join('')}</div>`;   // §HP3
}

function _ledgerHtml(rows) {
  if (!rows.length) return '<div class="pp-led-empty">no runs yet — ▶ builds it (a snapshot first, then the repo\'s agent)</div>';
  return rows.map(l => `<div class="pp-led"><span class="pp-led-t" title="${escapeHtml(new Date(l.ts).toLocaleString())}${l.startedAt ? ` · run started ${escapeHtml(new Date(l.startedAt).toLocaleString())}` : ''}">${escapeHtml(_ppWhen(l.ts))}${l.startedAt && l.ts > l.startedAt ? ` <small>+${escapeHtml(_ppSpan(l.ts - l.startedAt))}</small>` : ''}</span>${l.chunk ? `<span class="pp-led-c" title="${escapeHtml(l.file || '')}">chunk ${l.chunk}/${l.chunks}</span>` : ''}<span class="pp-led-s pp-${escapeHtml(l.state)}">${escapeHtml(l.state)}</span>
    <span class="pp-led-d">${l.snapshot ? `snapshot ${escapeHtml(String(l.snapshot).slice(0, 12))} · ` : ''}${l.provider ? `${escapeHtml(l.provider)}${l.rung ? ` (rung ${l.rung}/${l.rungs}${l.attempt > 1 ? `, try ${l.attempt}` : ''})` : ''} · ` : ''}${l.toolErrors ? '<span style="color:var(--coral)">stopped: failed tool calls in a row</span> · ' : ''}${(l.injected || []).length ? `files ${l.injected.slice(0, 6).map(f => typeof wsOpenInCode === 'function' ? `<a href="#" class="pp-file" title="open in the Code tab" onclick="wsOpenInCode('${escapeHtml(String(f).replace(/'/g, "\\'"))}');return false">${escapeHtml(f)}</a>` : escapeHtml(f)).join(', ')}${l.injected.length > 6 ? ` +${l.injected.length - 6}` : ''} · ` : ''}${l.error ? `<span style="color:var(--coral)">${escapeHtml(l.error)}</span>` : ''}</span>
    ${l.against === 'proposed' ? `<div class="pp-against">${l.state === 'proven' ? '✓ proven on the proposed code' : 'checked on the proposed code'} (${(l.overlaid || []).length} file${(l.overlaid || []).length === 1 ? '' : 's'}) — nothing is in your files until you Apply${l.leverage ? ` · <span title="the least-code axiom, measured">${escapeHtml(l.leverage.says)}</span>` : ''}</div>` : l.againstNote ? `<div class="pp-against warn">${escapeHtml(l.againstNote)}</div>` : ''}${_ppPrecedent(l.precedent)}${_ppRoute(l.route)}${_ppPlanned(l)}${l.reply ? `<details class="pp-reply"><summary>reply</summary><pre>${escapeHtml(l.reply)}</pre></details>` : ''}</div>`).join('');
}

// §0.60.0 RS1 — the repo's play / pause / rewind in the Plan header (the same routes as the repo card, repo-card-time.js)
async function ppRunLoad() {
  const el = document.getElementById('pp-run'); if (!el || !PLANP.uuid) return;
  let r; try { r = await api(`/api/repos/${PLANP.uuid}/run`, {}, 10000); } catch (_) { el.innerHTML = ''; return; }
  const paused = r.run && r.run.state === 'paused';
  el.innerHTML = `${paused ? `<button class="pp-btn" title="paused ${escapeHtml(new Date(r.run.since).toLocaleTimeString())} — play: the waiting work goes on" onclick="rcRun('${PLANP.uuid}','play')">▶</button>` : `<button class="pp-btn" title="pause the repo's activity at its next step (a version and a desktop checkpoint first)" onclick="rcRun('${PLANP.uuid}','pause')">⏸</button>`}<button class="pp-btn" title="pause and rewind one version" onclick="rcRun('${PLANP.uuid}','rewind')">⏮</button>${paused ? '<span class="pp-paused" style="font-size:10px;margin:0 4px">paused</span>' : ''}`;
}

// §0.60.0 PC1/PC2 — plan, then code, on the ledger: who plans and why, the system it maps to, what the planner read,
// the plan (files → registry components, exports, conditions), why a plan was refused, what a coder dropped
function _ppPlanned(l) {
  const out = [];
  // §GT2 0.60.42 — a gate's move: where the run stands, the commit it passed at (tagged in Versionium), why it failed
  if (l.brick && l.progress) {
    const pr = l.progress, pct = pr.total ? Math.round(pr.passed / pr.total * 100) : 0;
    out.push(`<div class="pp-against${l.state === 'brick-failed' ? ' warn' : ''}">▪ ${escapeHtml(l.brick)}${l.file ? ` · ${escapeHtml(l.file)}` : ''} — ${escapeHtml(String(l.state).replace(/^brick-/, ''))}${l.failureClass ? ` (${escapeHtml(l.failureClass)})` : ''} · ${pr.passed}/${pr.total} passed (${pct}%)${l.commit ? ` · at ${escapeHtml(String(l.commit).slice(0, 12))}` : ''}</div>`);
  }
  // 0.60.28 PF1 — ready before run: what was left off or put last before the first agent call, and why
  if (l.ready && l.ready.line) out.push(`<div class="pp-against${(l.ready.dropped || []).length || l.state === 'refused' ? ' warn' : ''}">ready: ${escapeHtml(l.ready.line)}</div>`);
  // 0.60.28 PF2 — no planner could plan it: Nexus planned it from the phase itself, one file per request
  if (l.derived) out.push(`<div class="pp-against">◇ planned without a model${l.derivedNote ? ` — ${escapeHtml(l.derivedNote)}` : ''}</div>`);
  if (l.planning && l.state === 'building') out.push(`<div class="pp-against">${l.planning.plan ? '◇ plan, then code' : 'no plan'} — ${escapeHtml(l.planning.why || '')}</div>`);
  if (l.system && l.system.conflict) out.push(`<div class="pp-against warn">system: ${escapeHtml(l.system.conflict)}</div>`);
  else if (l.system && l.system.system && l.state === 'building') out.push(`<div class="pp-against">system: ${escapeHtml(l.system.system)} (${escapeHtml(l.system.why || '')})</div>`);
  if (l.grounding) out.push(`<div class="pp-against">read first: ${l.grounding.system ? `atlas ${l.grounding.atlas ? '✓' : '—'} · loom ${l.grounding.loom} components · ` : ''}registry ${l.grounding.registry}${(l.grounding.reuse || []).length ? ` · reuse ${escapeHtml(l.grounding.reuse.slice(0, 4).join(', '))}` : ''}${l.grounding.lessons ? ` · ${l.grounding.lessons} lesson${l.grounding.lessons === 1 ? '' : 's'} from earlier builds` : ''}${(l.grounding.notes || []).length ? ` · <span style="color:var(--coral)">${escapeHtml(l.grounding.notes.join('; '))}</span>` : ''}</div>`);
  if (l.planSummary && l.plan) out.push(`<details class="pp-reply"><summary>plan — ${escapeHtml(l.planSummary)}</summary><pre>${escapeHtml([
    l.plan.read && l.plan.read.length ? `read: ${l.plan.read.join(' · ')}` : '',
    ...(l.plan.files || []).map(f => `${f.path}  ← ${f.component || (f.new ? `new ${f.layer || ''}` : '?')}${f.exports.length ? `  exports ${f.exports.join(', ')}` : ''}`),
    (l.plan.conditions || []).length ? `\nconditions (from the intent):\n${l.plan.conditions.map(c => `- ${c}`).join('\n')}` : '',
    (l.warnings || []).length ? `\nwarnings:\n${l.warnings.map(w => `- ${w}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'))}</pre></details>`);
  if ((l.problems || []).length) out.push(`<div class="pp-against warn">plan refused: ${escapeHtml(l.problems.slice(0, 4).join(' · '))}</div>`);
  // 0.60.18 EX0f — the build as a contract: bricks, what resumed, what a changed input made stale; at the end the audit
  if (l.contractInfo) out.push(`<div class="pp-against">◇ contract — ${l.contractInfo.bricks} brick${l.contractInfo.bricks === 1 ? '' : 's'}, ${l.contractInfo.concurrency} at once${l.contractInfo.resumed ? ` · resumed: ${l.contractInfo.kept.length} kept${l.contractInfo.stale.length ? `, ${l.contractInfo.stale.length} stale (${escapeHtml(l.contractInfo.stale.join(', '))})` : ''}${l.contractInfo.reset.length ? `, ${l.contractInfo.reset.length} given new retries` : ''}` : ' · fresh'}</div>`);
  if (l.audit) out.push(`<details class="pp-reply"><summary>contract audit — ${l.audit.bricks.filter(b => b.status === 'PASSED').length}/${l.audit.bricks.length} bricks · ${l.audit.dependencies.length} dependencies · ${l.audit.checkpoints} checkpoints · ${l.audit.gates.length} gates${(l.audit.blocked || []).length ? ` · ${l.audit.blocked.length} blocked` : ''}</summary><pre>${escapeHtml([
    ...l.audit.bricks.map(b => `${String(b.status).padEnd(7)} ${b.file || b.id}${b.commit ? `  · passed at ${String(b.commit).slice(0, 12)}` : ''}${b.class ? `  · ${b.class}` : ''}${b.rewound ? `  · rewound${b.rewound.to ? ` to ${String(b.rewound.to).slice(0, 12)}` : ''}${(b.rewound.files || []).length ? ` (${b.rewound.files.join(', ')})` : ''}` : ''}${b.agent ? `  · ${b.agent}` : ''}${b.attempts ? `  · ${b.attempts} attempt(s)` : ''}${b.verified ? `  · ${b.verified}` : ''}${b.blocked ? `  · ${b.blocked}` : ''}`),
    `\ndependencies:\n${l.audit.dependencies.map(e => `- ${e.from} → ${e.to}`).join('\n')}`,
    `\ngates:\n${l.audit.gates.map(g => `- ${g.id} (${g.type}) ${g.status}${(g.reasons || []).length ? ` — ${g.reasons.join('; ')}` : ''}`).join('\n')}`,
    (l.audit.splits || []).length ? `\nsplits:\n${l.audit.splits.map(x => `- ${x.gate} → ${x.into.join(', ')}`).join('\n')}` : '',
  ].filter(Boolean).join('\n'))}</pre></details>`);
  // §GW3 0.60.75 — the contract traced end to end: every record, checkpoint and ledger move in time order, per brick, holes named
  if (l.contract && l.phase && (l.audit || /^contract-|^brick-/.test(String(l.state)))) out.push(`<div class="pp-against"><button class="pp-btn" onclick="ppTrace(this, ${escapeHtml(JSON.stringify(l.phase))}, ${escapeHtml(JSON.stringify(l.map || ''))})">trace</button><div class="pp-trace"></div></div>`);
  if (l.coderOrder) out.push(`<div class="pp-against">coders: ${escapeHtml(l.coderOrder.join(' → '))}${l.note ? ` — ${escapeHtml(l.note)}` : ''}</div>`);
  return out.join('');
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
    const open = PLANP.open.has(key) || (PLANP.focus && ((s.run && s.run.runId === PLANP.focus) || (s.history && s.history.runs.some(r => r.runId === PLANP.focus))));   // §0.60.123 PP3 — any of its runs
    return `<div class="pp-task ${done ? 'done' : ''} ${s.current ? 'cur' : ''}">
      <div class="pp-row" onclick="planToggle('${escapeHtml(key)}')">
        <span class="pp-mark">${done ? '✓' : s.current ? '◌' : s.failed ? '!' : '○'}</span>
        <span class="pp-name">${escapeHtml(s.title)}</span>
        ${s.layer ? `<span class="pp-layer">${escapeHtml(s.layer)}</span>` : ''}${_ppPieces(s)}
      </div>
      ${_ppTimes(s)}
      ${s.failed && !done ? `<div class="pp-why" title="${escapeHtml(s.failed.error || s.failed.state)}">${escapeHtml(s.failed.state)}${s.failed.error ? ` — ${escapeHtml(String(s.failed.error).slice(0, 160))}` : ''}</div>` : ''}
      ${open ? `<div class="pp-detail"><div class="pp-meta">${escapeHtml(s.key)} · ${escapeHtml(String(s.map).split('/').pop())} · gate: ${escapeHtml(s.gate || 'all passed')}${s.failed ? ` · <span style="color:var(--coral)">${escapeHtml(s.failed.state)}: ${escapeHtml(s.failed.error || '')}</span>` : ''}</div>
        ${s.cost ? `<div class="pp-against" title="${escapeHtml(`${s.cost.runs} run(s) · tokens: ${s.cost.method || 'estimate'} — 0.60.27 AG1a: agents used as little as possible, counted`)}">agents: ${escapeHtml(s.cost.line)}</div>` : ''}
        ${done ? '' : `<button class="pp-go" onclick="event.stopPropagation();planBuild('${escapeHtml(s.map)}','${escapeHtml(s.key)}')">▶ build</button>`}
        ${_ppPieceList(s)}${_ppHistory(s)}</div>` : ''}
    </div>`;
  };
  // §0.60.107 PS2 — James: "Can you make something like the sidebar, for contexT? can you strip the plan panel to just the
  // plan with context, and progress? make the rest theyre own panel? and remove what is creating clutter". Three cards,
  // like the sidebar he showed: Progress, Plan, Context. What left (kept, not lost — §0.3): the charter, agents and jobs
  // are their own panels in the Code tab's bottom bar (code-tab-panels.js); activity is the bottom panels; the work
  // surface is Code › changes. Each was drawn here a second time.
  const progress = `${_planCodeBuild()}
    ${_planProof()}
    ${sm.total ? `<div class="pp-prog-line"><b>${sm.complete || 0}/${sm.total}</b> phases done${sm.building ? ` · <span class="pp-running">${sm.building} building</span>` : ''}${sm.failed ? ` · <span class="pp-bad">${sm.failed} stopped</span>` : ''}</div>
    <div class="pp-progress${d.charter && d.charter.latest ? ' pp-progress-2' : ''}" title="phases: ${sm.complete || 0}/${sm.total} done"><div style="width:${Math.round((sm.progress || 0) * 100)}%"></div></div>` : ''}
    ${_ppEndLine(d.charter)}
    ${PLANP.pending ? `<button class="pp-donefold pp-pending" onclick="ppOpenChanges()" title="the proposals, as diffs, in the Code tab">◆ ${PLANP.pending} proposal${PLANP.pending === 1 ? '' : 's'} waiting — open in Code › changes</button>` : ''}
    <div class="al pp-live" data-al="${escapeHtml(PLANP.uuid || '')}">${typeof agentLiveHtml === 'function' && PLANP.uuid ? agentLiveHtml(PLANP.uuid) : ''}</div>`;
  body.innerHTML = `
    ${_ppCard('progress', 'Progress', '', progress)}
    ${_ppCard('plan', 'Plan', sm.total ? `${sm.complete || 0}/${sm.total}` : '', `
    ${(() => {   // §CT7 — current work: what is building, next, stopped or waiting; the complete fold into one line
      if (!steps.length) return '<div class="pp-empty">no phases yet — plan a spec (Spec tab → ▶ Build this spec)</div>';
      // §HP9 0.55.1 — James: "it is for the current plans only, basically the queue". NOW: a step with runs or marked
      // active; NEXT: a few not-started steps of the maps that have something now (or of the one map chosen); the rest
      // one line; shelved phases never; done folded as before.
      const isDone = (s) => s.status === 'complete' || s.status === 'done';
      const live = steps.filter(s => !s.shelf);
      const clearedAt = _ppClearedAt();
      const allDone = live.filter(isDone), open = live.filter(s => !isDone(s));
      const done = clearedAt ? allDone.filter(s => _ppLastTs(s) > clearedAt) : allDone;
      const cleared = allDone.length - done.length;
      const isNow = (s) => (s.runs || 0) > 0 || s.current && s.run || ['active', 'building', 'in-progress'].includes(String(s.status));
      const now = open.filter(isNow);
      const nowMaps = new Set(now.map(s => s.map));
      const pool = open.filter(s => !isNow(s) && (PLANP.map ? s.map === PLANP.map : nowMaps.has(s.map)));
      const next = pool.slice(0, PP_NEXT_N), rest = open.length - now.length - next.length;
      const shelf = steps.length - live.length;
      return (now.length ? now.map(task).join('') : `<div class="pp-empty">nothing building${PLANP.map ? '' : ' — pick a map to see what is next, or ▶ build a phase'}</div>`)
        + (next.length ? `<div class="pp-sec pp-next">next</div>${next.map(task).join('')}` : '')
        + (rest > 0 ? `<button class="pp-donefold" onclick="planToggleRest()" title="every other not-started phase">○ ${rest} more not started${PLANP.showRest ? ' — hide' : ' — show'}</button>${PLANP.showRest ? open.filter(s => !isNow(s) && !next.includes(s)).map(task).join('') : ''}` : '')
        + _ppDoneLine(done.length, `step${done.length === 1 ? '' : 's'}`) + (PLANP.showDone ? done.map(task).join('') : '')
        + (cleared ? `<button class="pp-donefold" onclick="planRestoreDone()" title="bring the cleared steps back">⌫ ${cleared} cleared — restore</button>` : '')
        + (shelf ? `<div class="pp-shelfnote" title="the declutter's LATER — kept in their maps, not the queue">${shelf} on the shelf</div>` : '');
    })()}`)}`;
  // §0.60.123 PP4 — James: "strip the context from the plan panel since we have a dedicated one now." The dock's Context
  // panel draws it (code-dock.js, with this file's _ppContext); a run's "context" button opens it on that run.
  PLANP.focus = null;
  // (§0.47.0 OS2 rtMounted here: the activity views moved to the Code tab's bottom panel, 0.60.107 PS3)
  planTabSync();   // §CT9 — the tab's count follows the plan
  ppRunLoad();     // §0.60.0 RS1 — ▶ / ⏸ / ⏮ for the repo, beside the plan
  // (§0.39.284 W3 the work surface was drawn here: it is Code › changes now, one place — 0.60.107 PS3)
}
// ── §0.60.123 PP1–PP3 — James: "each chunk/dependancy a piece of the progress indication. progress shows for each task
// with a full run history, and log to make it explicit. like the panels should remain interconnected."
// A phase's bar is its pieces (build-plan.js piecesOf: one per planned file, its state, attempts, agent, what it uses);
// expanded, the pieces and every run with its log (historyOf). A piece points the dock's Changes and Outputs at its file;
// a run points the dock's Context at that run (code-dock.js dockFocus).
const _PP_PC_GLYPH = { pending: '·', running: '◌', written: '◆', failed: '✗', proven: '✓', done: '✓' };
const _ppQ = (x) => escapeHtml(String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
function _ppPieceTip(p) { return `${p.path} — ${p.state}${p.attempts ? ` · ${p.attempts} attempt${p.attempts === 1 ? '' : 's'}` : ''}${p.agent ? ` · ${p.agent}` : ''}${(p.uses || []).length ? ` · uses ${p.uses.join(', ')}` : ''}${p.why ? ` · ${p.why}` : ''}`; }
function _ppPieces(s) {
  const pcs = s.pieces || [];
  if (!pcs.length) return _gateBar(s);
  const ok = pcs.filter(p => p.state === 'proven' || p.state === 'done').length;
  return `<span class="pp-pcount" title="pieces proven or done, of all — ${escapeHtml(s.piecesFrom || '')}">${ok}/${pcs.length}</span><div class="pp-pieces${s.open ? ' live' : ''}" title="${pcs.length} piece${pcs.length === 1 ? '' : 's'} from ${escapeHtml(s.piecesFrom || '')} — click one for its changes">${pcs.map(p => `<span class="pp-pc st-${escapeHtml(p.state)}" title="${escapeHtml(_ppPieceTip(p))}" onclick="event.stopPropagation();ppFocusPiece('${_ppQ(s.key)}','${_ppQ(p.path)}')"></span>`).join('')}</div>`;
}
function _ppPieceList(s) {
  const pcs = s.pieces || []; if (!pcs.length) return '';
  return `<div class="pp-sec">pieces · from ${escapeHtml(s.piecesFrom || '')}</div><div class="pp-pclist">${pcs.map(p => `<div class="pp-pcrow st-${escapeHtml(p.state)}" onclick="event.stopPropagation();ppFocusPiece('${_ppQ(s.key)}','${_ppQ(p.path)}')" title="open its changes in the dock"><span class="pp-pcg">${_PP_PC_GLYPH[p.state] || '?'}</span><span class="pp-pcp">${escapeHtml(p.path)}</span><span class="pp-pcs">${escapeHtml(p.state)}${p.attempts ? ` · ${p.attempts}×` : ''}${p.agent ? ` · ${escapeHtml(p.agent)}` : ''}</span>${(p.uses || []).length ? `<span class="pp-pcu">uses ${escapeHtml(p.uses.join(', '))}</span>` : ''}${p.why ? `<span class="pp-pcw">${escapeHtml(p.why)}</span>` : ''}</div>`).join('')}</div>`;
}
function _ppHistory(s) {
  const h = s.history || { runs: [] };
  if (!h.runs.length) return _ledgerHtml(s.ledger || []);   // no raw rows (an older server): the merged ledger, as before
  const byRun = new Map((s.ledger || []).map(l => [l.runId, l]));
  return `<div class="pp-sec">runs · ${h.runs.length}${h.more ? ` of ${h.runs.length + h.more}` : ''}</div>` + h.runs.map((r, i) => {
    const merged = byRun.get(r.runId);
    const dur = r.startedAt && r.endedAt ? _ppSpan(r.endedAt - r.startedAt) : '';
    return `<details class="pp-run"${(i === 0 && s.open) || PLANP.focus === r.runId ? ' open' : ''}><summary><span class="pp-led-t">${escapeHtml(_ppWhen(r.startedAt))}</span><span class="pp-led-s st-${escapeHtml(r.end)}">${escapeHtml(r.end)}</span><span class="pp-led-d">${r.startedBy ? `<span class="pp-by" title="who started this run — ${escapeHtml(r.startedBy.whence)}">by ${escapeHtml(r.startedBy.who)}</span> · ` : '<span class="pp-by" title="a run from before 0.60.188 did not record who started it">by ?</span> · '}${escapeHtml(r.agents.join(' → ') || 'no agent')}${dur ? ` · ${escapeHtml(dur)}` : ''} · ${r.total} row${r.total === 1 ? '' : 's'}</span><button class="pp-runctx" title="what this run's agent was given — the dock's Context panel" onclick="event.preventDefault();event.stopPropagation();ppFocusRun('${_ppQ(r.runId)}')">context</button></summary>
      ${merged ? _ledgerHtml([merged]) : ''}
      <div class="pp-log">${r.cut ? `<div class="pp-log-cut">… ${r.cut} earlier row${r.cut === 1 ? '' : 's'} not shown</div>` : ''}${r.log.map(l => `<div class="pp-log-r st-${escapeHtml(l.state)}"><span class="pp-log-t">${escapeHtml(l.ts ? new Date(l.ts).toLocaleTimeString([], { hour12: false }) : '')}</span><span class="pp-log-s">${l.part ? `${escapeHtml(l.part)} · ` : ''}${escapeHtml(l.state)}${l.reused ? ' <b data-reused>↺ reused</b>' : ''}</span><span class="pp-log-f">${escapeHtml(l.file || '')}</span><span class="pp-log-a">${escapeHtml(l.provider || '')}${l.rung ? ` r${l.rung}` : ''}${l.attempt ? ` t${l.attempt}` : ''}</span><span class="pp-log-n">${escapeHtml(l.note || '')}</span></div>`).join('')}</div></details>`;
  }).join('') + (h.more ? `<div class="pp-log-cut">${h.more} older run${h.more === 1 ? '' : 's'} not shown — repo plan &lt;repo&gt; ${escapeHtml(s.key)} lists them</div>` : '');
}
/** a piece → the dock's Changes and Outputs, on its file */
function ppFocusPiece(phase, path) {
  if (typeof dockFocus !== 'function') return;
  dockFocus({ file: path === '(whole phase)' ? null : path, phase });
  if (typeof dockToggle === 'function') { dockToggle('changes', true); dockToggle('outputs', true); }
}
/** a run → the dock's Context, on that run */
function ppFocusRun(runId) {
  if (typeof dockFocus !== 'function') return;
  dockFocus({ runId });
  if (typeof dockToggle === 'function') dockToggle('context', true);
}

// ── §0.60.107 PS2/PS3 — the cards, the Context card, and what moved to its own panel ─────────────────────────────────
const _PP_FOLD_KEY = 'idearium.plan.fold';
function _ppFolded() { try { return new Set(JSON.parse(localStorage.getItem(_PP_FOLD_KEY) || '[]')); } catch (_) { return new Set(); } }
function ppFold(k) {
  const f = _ppFolded(); if (f.has(k)) f.delete(k); else f.add(k);
  try { localStorage.setItem(_PP_FOLD_KEY, JSON.stringify([...f])); } catch (_) { /* a per-browser convenience */ }
  const el = document.querySelector(`#pp-body .pp-card[data-card="${k}"]`); if (el) el.classList.toggle('folded', f.has(k));
}
/** one card of the sidebar: a header that folds it (remembered), its body */
function _ppCard(k, title, aside, html) {
  return `<section class="pp-card${_ppFolded().has(k) ? ' folded' : ''}" data-card="${k}"><div class="pp-card-h" onclick="ppFold('${k}')"><span class="pp-card-t">${escapeHtml(title)}</span><span class="pp-card-chev">⌄</span>${aside ? `<span class="pp-card-aside">${escapeHtml(aside)}</span>` : ''}</div><div class="pp-card-b">${html}</div></section>`;
}
/** the end state in one line (its list and the charter editor are the Code tab's charter panel) */
function _ppEndLine(c) {
  if (!c || !c.endState || !c.endState.length) return '';
  const l = c.latest;
  return `<button class="pp-donefold" onclick="ppOpenPanel('charter')" title="the end state, each check, and the charter — the Code tab's charter panel">${l ? `end state <b>${l.met}/${l.total}</b> · ${escapeHtml(_ppWhen(l.ts))}` : `end state not checked yet — ${c.endState.length} check${c.endState.length === 1 ? '' : 's'}`}</button>`;
}
function _ppTok(n) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n); }
const _PP_CTX_COLOR = { request: 'var(--accent,#3b82f6)', mapped: 'var(--mint,#34d399)', charter: 'var(--violet,#a78bfa)', lessons: 'var(--coral,#f87171)', note: 'var(--amber,#fbbf24)' };
/**
 * The Context card — like the sidebar James showed: what the agent building the phase is given, part by part (the
 * request, the mapped files, the charter, the lessons, his note), each as tokens and a share, against the model's window
 * when Nexus knows it. Read from the run's 'building' row (idearium/api _phaseBuild, lib/economy/tokens.js breakdown).
 */
function _ppContext(steps, { runId = null } = {}) {
  let pick = null;
  for (const s of steps || []) for (const l of s.ledger || []) {
    if (!l.context) continue;
    // §0.60.123 PP3 — a run picked in the Plan: that run's context, whatever else is live
    if (runId && l.runId === runId) { pick = { s, l, live: s.current || l.state === 'building', chosen: true }; break; }
    if (runId && pick && pick.chosen) continue;
    const live = s.current || l.state === 'building';
    if (!pick || (live && !pick.live) || (live === pick.live && (l.ts || 0) > (pick.l.ts || 0))) pick = { s, l, live };
  }
  if (!pick) return `${runId ? `<div class="pp-empty">run ${escapeHtml(runId)} recorded no context.</div>` : ''}<div class="pp-empty">no build has recorded its context yet — the next ▶ build shows here what its agent is given</div>`;
  const c = pick.l.context;
  // §0.60.123 PP3 — the run asked for, or why another is shown; and the way back to that run in the Plan
  const asked = runId && !pick.chosen ? `<div class="pp-empty">run ${escapeHtml(runId)} recorded no context — showing the ${pick.live ? 'live' : 'latest'} one</div>` : '';
  const back = pick.l.runId && typeof openPlanPanel === 'function' ? ` <button class="pp-runctx" title="this run in the Plan: its pieces and its log" onclick="openPlanPanel({ focus: '${_ppQ(pick.l.runId)}' })">in the Plan</button>` : '';
  const head = c.window ? `<div class="pp-ctx-h"><b>${c.pct}% used</b><span>${_ppTok(c.used)} / ${_ppTok(c.window)}</span></div>`
    : `<div class="pp-ctx-h"><b>~${_ppTok(c.used)} tokens</b><span title="Nexus knows the window for Ollama only (the num_ctx it sets); this agent's is not known here">window not known</span></div>`;
  const base = c.window || c.used || 1;
  const bar = `<div class="pp-ctx-bar">${c.parts.map(p => `<span style="width:${(p.tokens / base) * 100}%;background:${_PP_CTX_COLOR[p.id] || 'var(--text3)'}" title="${escapeHtml(p.label)} ${p.tokens}"></span>`).join('')}</div>`;
  const rows = c.parts.map(p => `<div class="pp-ctx-row"><span class="pp-ctx-sw" style="background:${_PP_CTX_COLOR[p.id] || 'var(--text3)'}"></span><span class="pp-ctx-l">${escapeHtml(p.label)}</span><span class="pp-ctx-n">${_ppTok(p.tokens)}</span><span class="pp-ctx-p">${(c.window ? (p.tokens / c.window) * 100 : p.share * 100).toFixed(1)}%</span></div>`).join('')
    + (c.window ? `<div class="pp-ctx-row pp-ctx-free"><span class="pp-ctx-sw"></span><span class="pp-ctx-l">free</span><span class="pp-ctx-n">${_ppTok(c.free)}</span><span class="pp-ctx-p">${(100 - c.pct).toFixed(1)}%</span></div>` : '');
  return `${asked}${head}${bar}<div class="pp-ctx-rows">${rows}</div><div class="pp-ctx-for">${pick.live ? 'building now' : 'last build'} · ${escapeHtml(pick.s.title || pick.s.key)}${pick.l.provider ? ` · ${escapeHtml(pick.l.provider)}` : ''} · ${escapeHtml(_ppWhen(pick.l.ts))} <span title="${escapeHtml(c.method || '')}: no vendor tokenizer is bundled">· estimated</span>${back}</div>`;
}
/** the proposals are Code › changes; the charter, agents and jobs panels are the Code tab's bottom bar */
function ppOpenChanges() { if (typeof setRepoSubtab === 'function' && CURRENT_REPO_SUBTAB !== 'code') setRepoSubtab('code'); if (typeof csView === 'function') csView('changes'); }
function ppOpenPanel(k) { if (typeof setRepoSubtab === 'function' && CURRENT_REPO_SUBTAB !== 'code') setRepoSubtab('code'); if (typeof cxPanel === 'function') cxPanel(k); }
/** the panels that left the Plan panel, drawn by the Code tab's bottom bar (code-tab-panels.js) from what PLANP holds */
function ppCharterPanelHtml() { const c = PLANP.data && PLANP.data.charter; return `${_ppEndState(c)}${_ppCharter(c)}`; }
function ppJobsPanelHtml() {
  const _cAt = _ppClearedAt();
  const other = (PLANP.runs || []).filter(r => r.phase === 'PLAN' || String(r.map || '').startsWith('file:')).filter(r => !_cAt || (r.ts || 0) > _cAt || ['building', 'running', 'dispatched'].includes(r.state)).slice(0, 40);
  return other.length ? other.map(r => `<div class="pp-act"><span class="pp-led-s pp-${escapeHtml(r.state)}">${escapeHtml(r.state)}</span> ${escapeHtml(r.title || `${r.phase} ${r.map}`)} <span class="pp-led-t">${new Date(r.ts).toLocaleTimeString()}</span>${r.error ? `<div style="color:var(--coral);font-size:10px">${escapeHtml(r.error)}</div>` : ''}</div>`).join('')
    : '<div class="pp-empty">no plans or file jobs</div>';
}
function ppAgentsPanelHtml() { return `<details class="pp-actwrap pp-agents" open><summary class="pp-sec">agents · what Nexus has learned</summary><div class="pp-agents-body">${PLANP.agentsHtml || 'reading…'}</div></details>`; }
// §0.39.361 AR1 — each agent's record building phases (GET /api/routing/agents): the table the ladder is ordered by
function _ppFaultRow(f) {
  return `<div class="pp-fault"><span class="pp-led-t" title="${escapeHtml(new Date(f.ts).toLocaleString())}">${escapeHtml(_ppWhen(f.ts))}</span><b>${escapeHtml(f.mode)}</b> ${escapeHtml(f.phase || f.path || '')}${f.promptChars ? ` <span style="opacity:.6">${f.promptChars} chars</span>` : ''}${f.error ? `<div class="pp-fault-e">${escapeHtml(f.error)}</div>` : ''}</div>`;
}
async function ppAgentsLoad(el) {
  const body = el.querySelector('.pp-agents-body'); if (!body) return;
  try {
    const d = await api('/api/routing/agents', {}, 30000);
    const ps = Object.values(d.providers || {}).sort((a, b) => b.score - a.score || b.attempts - a.attempts);
    const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));
    PLANP.agentsHtml = !ps.length ? 'nothing yet — every phase build records which agent did it and how it went; the ladder learns from that' : `
      <table><tr><th>agent</th><th>landed</th><th>proven</th><th>undone</th><th>failed</th><th>limit</th><th>score</th></tr>${ps.map(p => `<tr title="${escapeHtml(p.last ? `last: ${p.last.cls} on ${p.last.phase || '?'}${p.last.error ? ` — ${p.last.error}` : ''}` : '')}">
        <td>${escapeHtml(p.provider)}</td><td class="${p.landed ? 'ok' : ''}">${p.landed}/${p.attempts}</td><td>${p.proven || ''}</td><td class="${p.undone ? 'bad' : ''}">${p.undone || ''}</td>
        <td class="${p.failed ? 'bad' : ''}" title="${escapeHtml(Object.entries(p.byClass || {}).map(([c, n]) => `${c} ${n}`).join(' · '))}">${p.failed ? `${p.failed} <span style="opacity:.6">${escapeHtml(Object.entries(p.byClass || {}).filter(([c]) => c !== 'undone').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c, n]) => `${c} ${n}`).join(', '))}</span>` : ''}</td>
        <td class="${p.limit ? 'bad' : ''}" title="${escapeHtml(p.limit ? p.limit.why : p.maxLanded ? `landed up to ${p.maxLanded} chars` : '')}">${p.limit ? `≥${k(p.limit.from)} chars` : ''}</td><td>${Math.round(p.score * 100)}%</td></tr>${(p.faults || []).length ? `<tr><td colspan="7"><details class="pp-faults"><summary>${p.faults.length} fault${p.faults.length === 1 ? '' : 's'} · ${escapeHtml(Object.entries(p.modes || {}).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(' · '))}</summary>${p.faults.map(_ppFaultRow).join('')}</details></td></tr>` : ''}`).join('')}</table>
      ${(d.unassigned || []).length ? `<details class="pp-faults"><summary>${d.unassigned.length} fault${d.unassigned.length === 1 ? '' : 's'} of no one agent (every rung tried, no snapshot…)</summary>${d.unassigned.map(_ppFaultRow).join('')}</details>` : ''}
      <div style="opacity:.6;margin-top:4px">${d.learn ? 'the ladder is ordered by this: higher score first, an agent past its size limit last — routing.ladder_learn: false keeps the configured order' : 'learning is off (routing.ladder_learn: false) — the ladder keeps its configured order'}</div>`;
  } catch (e) { PLANP.agentsHtml = `could not read: ${escapeHtml(e.message)}`; }
  body.innerHTML = PLANP.agentsHtml;
}
function planToggle(key) { if (PLANP.open.has(key)) PLANP.open.delete(key); else PLANP.open.add(key); _planPaint(); }
// §0.60.125 DG1 — James chose "Refuse, say why": a build refused because its depends_on are still open (DEPS_OPEN) says
// what it waits on — his decisions by their question — and asks before building anyway (the run records the override).
// One door for every ▶ build (the Plan, the Phases tab's card and detail pane).
// §0.60.147 DG2 — James, 2026-10-18: "each phase, has to have a dependany graph before executing." A build refused for having no
// dependency graph is never offered "build anyway" (his "has to have"); the message says how to give the phase one.
function _noGraphHeld(e) { const x = new Error(`no dependency graph — ${(e.detail.missing || []).join('; ')}${e.detail.remedy ? `. ${e.detail.remedy}` : ''}`); x.held = true; return x; }
async function phaseBuildPost(uuid, body) {
  const go = (b) => api(`/api/repos/${uuid}/phases/build`, { method: 'POST', body: JSON.stringify({ startedBy: 'person:ui', ...b }) }, 120000);   // 0.60.188 RC7
  try { return await go(body); }
  catch (e) {
    if (e.detail && e.detail.code === 'NO_GRAPH') throw _noGraphHeld(e);   // §0.60.147 DG2
    if (!(e.detail && e.detail.code === 'DEPS_OPEN')) throw e;
    const open = e.detail.open || [];
    const list = open.map(o => `• ${o.key} — ${o.kind === 'decision' ? `your decision, still ${o.status}${o.asked ? `: "${o.asked}"` : ''}` : `a phase not done yet (${o.status})`}`).join('\n');
    if (!confirm(`${body.phase} depends on what is still open:\n\n${list}\n\nBuild it anyway? The run records that it was built with these open.`)) {
      const x = new Error(`waits on ${open.map(o => o.key).join(', ')}`); x.held = true; throw x;
    }
    return await go({ ...body, anyway: true });
  }
}
async function planBuild(map, phase) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try {
    const r = await phaseBuildPost(repo.uuid, { map, phase });
    toast(`${phase}: snapshot ${r.snapshot} · the agent is building it`, 'ok'); PLANP.focus = r.runId; PLANP.open.add(`${map}::${phase}`);
  } catch (e) { toast(`${phase} not built: ${e.message}`, 'err'); }
  loadPlanPanel();
}

// live: a run, a manage job or a deviation for the open repo repaints the panel (one read per burst)
let _planT = null;
function planPanelOnEvent(ev) {
  const t = ev && ev.type ? ev.type.replace(/^idearium\./, '') : '';
  if (!/^(repo\.(run|phase\.run|file\.manage|deviation|roadmap\.updated|inject\.|spec\.planned|prove\.|verify)|spec-engine\.|spec\.chunk|chunk\.)/.test(t)) return;
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
  if (_ppClearedAt() && live.length && done === live.length) return '';   // §0.60.0 PP1 — a finished build, cleared
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
  if (run && !running && run.verdict === 'proven' && _ppClearedAt() && (Number(run.endedAt || run.ts || run.startedAt) || 0) <= _ppClearedAt()) return '';   // §0.60.0 PP1
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

// §GW3 0.60.75 — James: "each contract tracked through the system using the event ledger, tagging and each gate". The
// newest run's contract for this phase, traced (GET .../phases/contract?trace=1); the server builds it, this only shows it.
async function ppTrace(btn, phase, map) {
  const box = btn && btn.nextElementSibling; if (!box || !PLANP.uuid) return;
  if (box.dataset.open === '1') { box.dataset.open = ''; box.innerHTML = ''; return; }
  box.dataset.open = '1'; box.innerHTML = '<div class="pp-led-empty">tracing…</div>';
  let d; try { d = await api(`/api/repos/${PLANP.uuid}/phases/contract?phase=${encodeURIComponent(phase)}${map ? `&map=${encodeURIComponent(map)}` : ''}&trace=1`, {}, 15000); }
  catch (e) { box.innerHTML = `<div class="pp-against warn">could not trace: ${escapeHtml(e.message)}</div>`; return; }
  const tr = d.trace || { bricks: [], holes: [], counts: {} };
  box.innerHTML = `<div class="pp-against">${tr.counts.passed || 0}/${tr.counts.bricks || 0} bricks passed · ${tr.counts.steps || 0} steps · ${tr.counts.files || 0} files · ${tr.counts.commits || 0} commits${tr.holes.length ? ` · <span style="color:var(--amber)">${tr.holes.length} hole${tr.holes.length === 1 ? '' : 's'}</span>` : ' · no holes'}</div>`
    + tr.holes.map(x => `<div class="pp-against warn">hole · ${escapeHtml(x.gate || '')}: ${escapeHtml(x.what)}</div>`).join('')
    // §GW2 0.60.77 — each brick's run: what every attempt and agent resumed (the baton)
    + tr.bricks.filter(b => b.run).map(b => `<div class="pp-against">▪ ${escapeHtml(b.id)} — attempt ${b.run.attempt} · ${escapeHtml(b.run.status)}${b.run.providers.length ? ` · tried by ${escapeHtml([...new Set(b.run.providers)].join(' → '))}` : ''} · ${b.run.steps} step${b.run.steps === 1 ? '' : 's'}${b.run.read.length ? ` · read ${escapeHtml(b.run.read.join(', '))}` : ''}${b.run.changed.length ? ` · changed ${escapeHtml(b.run.changed.join(', '))}` : ''}${b.run.note ? ` — ${escapeHtml(b.run.note)}` : ''}</div>`).join('')
    + `<details class="pp-reply" open><summary>timeline</summary><pre>${escapeHtml((d.lines || []).join('\n'))}</pre></details>`;
}

