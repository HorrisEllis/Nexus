/* idearium/ui/js/repo-tasks.js — §0.39.366: a repo's background tasks.
 * James (with Claude Code's Background tasks panel): "the background tasks, i want that for each repo. any activity from
 * an agent wearing the hat."
 *
 * Every call to the agent wearing this repo's hat (a chat, a phase build's attempts on each rung, the draft review, a
 * proof repair) is a task (lib/repo-activity.js, GET /api/repos/:uuid/tasks). Each one arrives live over SSE as
 * idearium.repo.task. A phase build holds its attempts. A row opens to show its steps: the rung it is on, the gate the
 * tab is at, each tool call, what came back. A running task's time counts up. One state per repo (RT_TASKS); the
 * drawer repaints in place. */
const RT_TASKS = new Map();        // repoUuid -> Map(taskId -> task)
const RT_OPEN_ROWS = new Set();    // task ids opened by the person
let RT_FILTER = 'all';             // all | running | failed
let RT_TICK = null;
// §0.39.369 AL2 — James: "I also want to have a full extensive activity log in each repo." The same drawer, a second
// view of the repo's durable log (GET /api/repos/:uuid/activity): every task, phase row, proposal event (who applied,
// who undid) and fault, newest first, filtered, paged back, live (SSE idearium.repo.activity). One drawer, two views.
let RT_VIEW = 'tasks';             // tasks | log | control
const RT_CTL = { uuid: null, system: null, desktop: null, checkpoints: null, busy: null, error: null };
const RT_LOG = { uuid: null, rows: [], more: false, facets: null, kind: '', actor: '', failed: false, q: '', open: new Set(), loading: false };

function _rtState(uuid) { if (!RT_TASKS.has(uuid)) RT_TASKS.set(uuid, new Map()); return RT_TASKS.get(uuid); }
function _rtCurrent() { return (typeof CURRENT_API_REPO !== 'undefined' && CURRENT_API_REPO) ? CURRENT_API_REPO.uuid : null; }

/** rtIn(payload) — one task changed (SSE idearium.repo.task) */
function rtIn(p) {
  if (!p || !p.repoUuid || !p.task) return;
  const st = _rtState(p.repoUuid);
  const t = p.task;
  // a child arrives on its own: it is kept in the flat map and drawn under its parent
  const prev = st.get(t.id);
  st.set(t.id, { ...(prev || {}), ...t, children: prev && prev.children ? prev.children : [] });
  if (p.repoUuid === _rtCurrent()) { rtBadge(); if (_rtDrawerOpen()) rtPaint(); }
}

/** rtLoad(uuid) — the list as the server has it (on opening a repo, and when the drawer opens) */
async function rtLoad(uuid) {
  if (!uuid || typeof api !== 'function') return;
  try {
    const d = await api(`/api/repos/${uuid}/tasks?limit=120`);
    const st = _rtState(uuid); st.clear();
    for (const t of d.tasks || []) { st.set(t.id, { ...t, children: [] }); for (const c of t.children || []) st.set(c.id, { ...c, children: [] }); }
  } catch (_) { /* the panel says it has nothing rather than failing the page */ }
  if (uuid === _rtCurrent()) { rtBadge(); if (_rtDrawerOpen()) rtPaint(); }
}

/** rtRepoShown(repo) — called when a repo is opened: load its tasks, put the button's count right */
let RT_SHOWN = null;
function rtRepoShown(repo) {
  if (!repo || !repo.uuid) return;
  rtEnsureButton(); rtBadge();
  if (RT_SHOWN === repo.uuid) return;   // the same repo redrawn: its tasks are live already
  RT_SHOWN = repo.uuid;
  const name = document.getElementById('rt-repo'); if (name) name.textContent = repo.name || repo.uuid;
  if (_rtDrawerOpen()) rtPaint();
  rtLoad(repo.uuid);
  if (RT_VIEW === 'log' && _rtDrawerOpen()) rtLogLoad();
  if (RT_VIEW === 'control' && _rtDrawerOpen()) rtCtlLoad();
  if (_rtDrawerOpen()) _rtMoreLoad();   // §0.46.0 — another repo: its phases / versions
}

function _rtTree(uuid) {
  const all = [..._rtState(uuid).values()];
  const ids = new Set(all.map(t => t.id));
  const kids = new Map();
  for (const t of all) if (t.parent && ids.has(t.parent)) { if (!kids.has(t.parent)) kids.set(t.parent, []); kids.get(t.parent).push(t); }
  const top = all.filter(t => !t.parent || !ids.has(t.parent));
  top.sort((a, b) => (b.status === 'running') - (a.status === 'running') || (b.startedAt || 0) - (a.startedAt || 0));
  return top.map(t => ({ ...t, children: (kids.get(t.id) || []).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)) }));
}

function _rtDur(t) {
  const ms = t.status === 'running' ? Date.now() - (t.startedAt || Date.now()) : (t.ms != null ? t.ms : t.elapsedMs || 0);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
const _RT_ICON = { running: '<span class="rt-spin"></span>', done: '<span class="rt-ok">✓</span>', failed: '<span class="rt-bad">✗</span>', stale: '<span class="rt-stale" title="said running, but nothing for 15 min">◌</span>' };
const _RT_KIND = { phase: 'phase', build: 'build', review: 'review', repair: 'repair', chat: 'chat', run: 'run', setup: 'setup' };
function _rtEsc(s) { return typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function _rtRow(t, depth = 0) {
  const open = RT_OPEN_ROWS.has(t.id);
  const live = t.status === 'running' && t.live ? [t.live.tool ? `tool ${t.live.tool}…` : null, t.live.gate ? `gate ${t.live.gate}` : null, t.live.generating ? 'writing' : null, t.live.chars ? `${t.live.chars}ch` : null].filter(Boolean).join(' · ') : '';
  const last = t.steps && t.steps.length ? t.steps[t.steps.length - 1] : null;
  const kids = (t.children || []);
  const kidRun = kids.filter(k => k.status === 'running').length;
  // a phase's attempts are counted under its title, which keeps the row's width (a phase has no one provider: each attempt has its own)
  const kidsTxt = kids.length ? `${kids.length} attempt${kids.length === 1 ? '' : 's'}${kidRun ? ` · ${kidRun} running` : ''}` : '';
  const runningKid = kids.filter(k => k.status === 'running').pop();
  const kidLive = runningKid && runningKid.live ? [runningKid.live.tool ? `tool ${runningKid.live.tool}…` : null, runningKid.live.gate ? `gate ${runningKid.live.gate}` : null, runningKid.live.generating ? 'writing' : null, runningKid.live.chars ? `${runningKid.live.chars}ch` : null].filter(Boolean).join(' · ') : '';
  const kidLast = runningKid && runningKid.steps && runningKid.steps.length ? runningKid.steps[runningKid.steps.length - 1].text : '';
  const sub = runningKid ? [kidsTxt, `now ${runningKid.provider || 'an agent'}`, kidLive || kidLast].filter(Boolean).join(' · ')
    : [kidsTxt, live || (last ? last.text : '')].filter(Boolean).join(' · ');
  let h = `<div class="rt-row rt-${t.status}${depth ? ' rt-child' : ''}" data-rt="${_rtEsc(t.id)}">
    <div class="rt-head" onclick="rtToggle('${_rtEsc(t.id)}')">
      <span class="rt-ico">${_RT_ICON[t.status] || '·'}</span>
      <span class="rt-kind rt-k-${_rtEsc(t.kind)}">${_RT_KIND[t.kind] || _rtEsc(t.kind)}</span>
      <span class="rt-title" title="${_rtEsc(t.title)}">${_rtEsc(t.title)}</span>
      <span class="rt-grow"></span>
      ${t.provider && t.kind !== 'phase' ? `<span class="rt-prov">${_rtEsc(t.provider)}</span>` : ''}
      <span class="rt-dur" data-rt-dur="${_rtEsc(t.id)}">${_rtDur(t)}</span>
    </div>
    ${sub && !open ? `<div class="rt-sub${t.status === 'failed' ? ' rt-sub-bad' : ''}">${_rtEsc(sub)}</div>` : ''}`;   // red only for a task that failed: a skipped rung on the way is not
  if (open) {
    const steps = (t.steps || []).map(s => `<div class="rt-step${s.bad ? ' rt-sub-bad' : ''}"><span class="rt-dim">${new Date(s.ts).toLocaleTimeString('en-GB', { hour12: false })}</span> ${_rtEsc(s.text)}</div>`).join('');
    const r = t.result;
    const res = r ? `<div class="rt-res">${r.files && r.files.length ? `<div>files: ${r.files.map(_rtEsc).join(', ')}</div>` : ''}${r.tools && r.tools.length ? `<div>tools: ${r.tools.map(x => `${_rtEsc(x.name)}${x.ok ? '' : ' ✗'}`).join(', ')}</div>` : ''}${r.error ? `<div class="rt-sub-bad">${_rtEsc(r.error)}</div>` : ''}</div>` : '';
    const meta = [t.hat ? `hat ${t.hat}` : null, t.session ? `session ${t.session}` : null, t.promptChars ? `${t.promptChars} chars sent` : null, t.fromLog ? 'from the exchange log' : null].filter(Boolean).join(' · ');
    const rw = t.checkpoint ? `<button class="rt-rewind" onclick="event.stopPropagation();rtRewind('${_rtEsc(t.checkpoint)}')" title="the desktop as it was before this task">↶ rewind the desktop to before this</button>` : '';
    h += `<div class="rt-body">${rw}${meta ? `<div class="rt-dim rt-meta">${_rtEsc(meta)}</div>` : ''}${steps || '<div class="rt-dim">no steps yet</div>'}${res}
      ${kids.length ? `<div class="rt-kids">${kids.map(k => _rtRow(k, depth + 1)).join('')}</div>` : ''}</div>`;
  }
  return h + '</div>';
}

function _rtDrawerOpen() { const d = document.getElementById('rt-drawer'); return !!(d && d.classList.contains('open')); }

function rtPaint() {
  _rtViews();
  if (RT_VIEW === 'log') return rtLogPaint();
  if (RT_VIEW === 'control') return rtCtlPaint();
  const more = typeof RT_MORE_VIEWS !== 'undefined' && RT_MORE_VIEWS.find(v => v[0] === RT_VIEW);   // §0.46.0 Phases · Versions · Machine
  if (more) return more[3]();
  const uuid = _rtCurrent();
  const body = document.getElementById('rt-list');
  if (!body || !uuid) return;
  let tree = _rtTree(uuid);
  const n = { all: tree.length, running: tree.filter(t => t.status === 'running' || (t.children || []).some(k => k.status === 'running')).length, failed: tree.filter(t => t.status === 'failed' || t.status === 'stale').length };
  if (RT_FILTER === 'running') tree = tree.filter(t => t.status === 'running' || (t.children || []).some(k => k.status === 'running'));
  if (RT_FILTER === 'failed') tree = tree.filter(t => t.status === 'failed' || t.status === 'stale');
  const f = document.getElementById('rt-filters');
  if (f) f.innerHTML = ['all', 'running', 'failed'].map(k => `<button class="rt-f${RT_FILTER === k ? ' on' : ''}" onclick="rtFilter('${k}')">${k} ${n[k]}</button>`).join('');
  const keep = body.scrollTop;
  body.innerHTML = tree.length ? tree.map(t => _rtRow(t)).join('')
    : `<div class="rt-empty">${RT_FILTER === 'all' ? 'nothing yet — when the agent wearing this repo\'s hat chats, builds a phase, reviews or repairs, each one shows here as it happens' : `no ${RT_FILTER} tasks`}</div>`;
  body.scrollTop = keep;
}

function rtToggle(id) { if (RT_OPEN_ROWS.has(id)) RT_OPEN_ROWS.delete(id); else RT_OPEN_ROWS.add(id); rtPaint(); }
function rtFilter(k) { RT_FILTER = k; rtPaint(); }

/** rtBadge() — the button's count: tasks running now for this repo */
function rtBadge() {
  const b = document.getElementById('rt-btn-count');
  const uuid = _rtCurrent();
  if (!b) return;
  // what the panel's "running" filter counts: top-level tasks (a phase with its running attempt is one)
  const running = uuid ? _rtTree(uuid).filter(t => t.status === 'running' || (t.children || []).some(k => k.status === 'running')).length : 0;
  b.textContent = running ? String(running) : '';
  b.classList.toggle('on', running > 0);
}

function rtEnsureButton() {
  const nav = document.getElementById('repo-subnav');
  if (!nav || document.getElementById('rt-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'rt-btn'; btn.className = 'repo-subtab-btn rt-btn'; btn.type = 'button';
  btn.title = 'Background tasks — everything the agent wearing this repo\'s hat is doing, and did';
  btn.innerHTML = 'Tasks <span id="rt-btn-count" class="rt-count"></span>';
  btn.onclick = () => rtToggleDrawer();
  nav.appendChild(btn);
}

function rtToggleDrawer(force) {
  let d = document.getElementById('rt-drawer');
  if (!d) {
    d = document.createElement('aside');
    d.id = 'rt-drawer'; d.className = 'rt-drawer';
    d.innerHTML = `<div class="rt-top"><span class="rt-views" id="rt-views"></span><span class="rt-dim" id="rt-repo"></span><span class="rt-grow"></span>
      <button class="rt-x" onclick="rtToggleDrawer(false)" title="close">✕</button></div>
      <div class="rt-filters" id="rt-filters"></div><div class="rt-list" id="rt-list"></div>`;
    document.body.appendChild(d);
  }
  const open = force == null ? !d.classList.contains('open') : !!force;
  d.classList.toggle('open', open);
  const b = document.getElementById('rt-btn'); if (b) b.classList.toggle('active', open);
  try { localStorage.setItem('idearium.rt.open', open ? '1' : '0'); } catch (_) {}
  if (open) {
    const r = typeof CURRENT_API_REPO !== 'undefined' && CURRENT_API_REPO;
    const name = document.getElementById('rt-repo'); if (name) name.textContent = r ? (r.name || r.uuid) : '';
    rtPaint(); rtLoad(_rtCurrent()); if (RT_VIEW === 'log') rtLogLoad(); if (RT_VIEW === 'control') rtCtlLoad(); _rtMoreLoad();
    if (!RT_TICK) RT_TICK = setInterval(_rtTick, 1000);
  } else if (RT_TICK) { clearInterval(RT_TICK); RT_TICK = null; }
}

// §0.39.372 NC2 — James: "Do you think we should have each repo a control panel for the system, and compartment for the
// nexus repos?" The drawer's third view: the repo's compartment as a control panel. A Nexus system's repo shows its
// processes as the supervisor sees them (status, pid, restarts, crashes) with restart / stop / start — asked of the
// supervisor, never of the system itself; every repo shows its desktop VM (pause, resume, a checkpoint by hand, its
// checkpoints with rewind). Each act is a row of the log.
async function rtCtlLoad() {
  const uuid = _rtCurrent(); if (!uuid || typeof api !== 'function') return;
  if (RT_CTL.uuid !== uuid) Object.assign(RT_CTL, { uuid, system: null, desktop: null, checkpoints: null, error: null });
  const [sys, desk, cps] = await Promise.all([
    api(`/api/repos/${uuid}/system`).catch(e => ({ none: e.message })),
    api(`/api/repos/${uuid}/desktop`).catch(e => ({ error: e.message })),
    api(`/api/repos/${uuid}/desktop/checkpoints`).catch(e => ({ error: e.message })),
  ]);
  Object.assign(RT_CTL, { system: sys, desktop: desk, checkpoints: cps });
  if (RT_VIEW === 'control' && _rtDrawerOpen()) rtCtlPaint();
}
async function rtCtl(path, body, what) {
  const uuid = _rtCurrent(); if (!uuid) return;
  if (/stop|restart/.test(path) && typeof confirm === 'function' && !confirm(`${what}?`)) return;
  RT_CTL.busy = what; rtCtlPaint();
  try { await api(`/api/repos/${uuid}/${path}`, { method: 'POST', body: JSON.stringify(body || {}) }, 120000); if (typeof toast === 'function') toast(`${what} — done`, 'ok'); }
  catch (e) { if (typeof toast === 'function') toast(`${what} refused: ${e.message}`, 'err'); RT_CTL.error = e.message; }
  RT_CTL.busy = null;
  await rtCtlLoad();
}
const _RT_PSTAT = { stable: 'rt-ok', running: 'rt-ok', online: 'rt-ok', starting: 'rt-prop', restarting: 'rt-prop', held: 'rt-stale', stopped: 'rt-stale', dormant: 'rt-dim', down: 'rt-bad', circuit_open: 'rt-bad' };
function rtCtlPaint() {
  const body = document.getElementById('rt-list'), f = document.getElementById('rt-filters');
  if (!body) return;
  if (f) f.innerHTML = `<button class="rt-f" onclick="rtCtlLoad()">↻ refresh</button>${RT_CTL.busy ? `<span class="rt-dim"><span class="rt-spin"></span> ${_rtEsc(RT_CTL.busy)}…</span>` : ''}`;
  const sys = RT_CTL.system || {}, d = RT_CTL.desktop || {}, cps = (RT_CTL.checkpoints && RT_CTL.checkpoints.checkpoints) || [];
  const btn = (path, label, what, body2) => `<button class="rt-act" ${RT_CTL.busy ? 'disabled' : ''} onclick='rtCtl(${JSON.stringify(path)}, ${JSON.stringify(body2 || {})}, ${JSON.stringify(what)})'>${label}</button>`;
  let h = '';
  if (sys.system) {
    h += `<div class="rt-sec">System · ${_rtEsc(sys.system)} <span class="rt-dim">through ${_rtEsc(sys.supervisor || 'its supervisor')}</span></div>`;
    if (sys.error) h += `<div class="rt-sub-bad rt-pad">${_rtEsc(sys.error)}</div>`;
    if (sys.note) h += `<div class="rt-dim rt-pad">${_rtEsc(sys.note)}</div>`;
    for (const p of sys.processes || []) {
      h += `<div class="rt-proc"><span class="${_RT_PSTAT[p.status] || 'rt-dim'}">●</span> <b>${_rtEsc(p.name)}</b> <span class="rt-dim">${_rtEsc(p.status)}${p.pid ? ` · pid ${p.pid}` : ''}${p.port ? ` · :${p.port}` : ''} · ${p.restarts || 0} restart(s)${p.crashesInWindow ? ` · <span class="rt-sub-bad">${p.crashesInWindow} crash(es)</span>` : ''}</span><span class="rt-grow"></span>
        <span class="rt-acts">${btn(`system/restart`, '↻ restart', `restart ${p.name}`, { process: p.name })}${p.status === 'held' || p.status === 'stopped' || p.status === 'circuit_open' || p.status === 'down' ? btn(`system/start`, '▶ start', `start ${p.name}`, { process: p.name }) : btn(`system/stop`, '■ stop', `stop ${p.name}`, { process: p.name })}</span></div>`;
    }
  }
  h += `<div class="rt-sec">Desktop <span class="rt-dim">${_rtEsc(d.state || (d.error ? 'unavailable' : '…'))}</span></div>`;
  if (d.error) h += `<div class="rt-dim rt-pad">${_rtEsc(d.error)}</div>`;
  if (d.state === 'running') h += `<div class="rt-pad">${btn('desktop/pause', '⏸ pause', 'pause the desktop')}${btn('desktop/resume', '▶ resume', 'resume the desktop')}${btn('desktop/checkpoint', '◉ checkpoint now', 'checkpoint the desktop', { label: 'by hand' })}</div>`;
  if (cps.length) h += cps.map(c => `<div class="rt-proc"><span class="rt-dim">${new Date(c.ts).toLocaleString('en-GB', { hour12: false })}</span> <span title="${_rtEsc(c.tag)}">${_rtEsc(c.label || c.tag)}</span>${c.present === false ? ' <span class="rt-sub-bad">(gone from the VM)</span>' : ''}<span class="rt-grow"></span>${c.present === false ? '' : `<button class="rt-rewind" onclick="rtRewind('${_rtEsc(c.tag)}').then(rtCtlLoad)">↶ rewind</button>`}</div>`).join('');
  else if (d.state === 'running') h += `<div class="rt-dim rt-pad">no checkpoints yet — one is taken before every task while the desktop runs</div>`;
  body.innerHTML = h || '<div class="rt-empty">reading the compartment…</div>';
}

// §0.39.371 CK1 — the log is the rewind: a checkpoint taken before a task (or by hand) puts the repo's desktop back
async function rtRewind(tag) {
  const uuid = _rtCurrent(); if (!uuid || !tag) return;
  if (typeof confirm === 'function' && !confirm(`Rewind this repo's desktop to ${tag}? Its files, memory and running programs go back to that moment.`)) return;
  try {
    await api(`/api/repos/${uuid}/desktop/rewind`, { method: 'POST', body: JSON.stringify({ tag }) }, 120000);
    if (typeof toast === 'function') toast(`desktop rewound to ${tag}`, 'ok');
  } catch (e) { if (typeof toast === 'function') toast(`rewind refused: ${e.message}`, 'err'); else console.warn(e); }
  if (RT_VIEW === 'log') rtLogLoad();
}

function _rtViews() {
  const v = document.getElementById('rt-views');
  const extra = typeof RT_MORE_VIEWS !== 'undefined' ? RT_MORE_VIEWS.map(x => [x[0], x[1]]) : [];
  if (v) v.innerHTML = [['tasks', 'Background tasks'], ['log', 'Activity log'], ['control', 'Control'], ...extra].map(([k, l]) => `<button class="rt-view${RT_VIEW === k ? ' on' : ''}" onclick="rtView('${k}')">${l}</button>`).join('');
}
function _rtMoreLoad() { const m = typeof RT_MORE_VIEWS !== 'undefined' && RT_MORE_VIEWS.find(v => v[0] === RT_VIEW); if (m) m[2](); }
function _rtViewOk(k) { return ['log', 'control'].includes(k) || (typeof RT_MORE_VIEWS !== 'undefined' && RT_MORE_VIEWS.some(v => v[0] === k)); }
function rtView(k) {
  RT_VIEW = _rtViewOk(k) ? k : 'tasks';
  try { localStorage.setItem('idearium.rt.view', RT_VIEW); } catch (_) {}
  rtPaint();
  if (RT_VIEW === 'log') rtLogLoad();
  if (RT_VIEW === 'control') rtCtlLoad();
  const more = typeof RT_MORE_VIEWS !== 'undefined' && RT_MORE_VIEWS.find(v => v[0] === RT_VIEW);
  if (more) more[2]();
}

function _rtLogQuery(before) {
  const q = new URLSearchParams({ limit: '80' });
  if (RT_LOG.kind) q.set('kind', RT_LOG.kind);
  if (RT_LOG.actor) q.set('actor', RT_LOG.actor);
  if (RT_LOG.failed) q.set('status', 'failed');
  if (RT_LOG.q) q.set('q', RT_LOG.q);
  if (before) q.set('before', String(before)); else q.set('facets', '1');
  return q.toString();
}
/** rtLogLoad(more) — the log as the server has it; more: the next page back */
async function rtLogLoad(more = false) {
  const uuid = _rtCurrent();
  if (!uuid || typeof api !== 'function' || RT_LOG.loading) return;
  if (RT_LOG.uuid !== uuid) Object.assign(RT_LOG, { uuid, rows: [], more: false, facets: null, open: new Set() });
  RT_LOG.loading = true;
  try {
    const last = more && RT_LOG.rows.length ? RT_LOG.rows[RT_LOG.rows.length - 1].ts : null;
    const d = await api(`/api/repos/${uuid}/activity?${_rtLogQuery(last)}`);
    RT_LOG.rows = more ? RT_LOG.rows.concat(d.rows || []) : (d.rows || []);
    RT_LOG.more = !!d.more;
    if (d.facets) RT_LOG.facets = d.facets;
  } catch (e) { RT_LOG.error = e.message; }
  RT_LOG.loading = false;
  if (RT_VIEW === 'log' && _rtDrawerOpen()) rtLogPaint();
}
function _rtLogMatches(r) {
  return (!RT_LOG.kind || r.kind === RT_LOG.kind || String(r.kind || '').startsWith(`${RT_LOG.kind}.`)) && (!RT_LOG.actor || r.actor === RT_LOG.actor)
    && (!RT_LOG.failed || r.status === 'failed') && (!RT_LOG.q || RT_LOG.q.toLowerCase().split(/\s+/).every(w => `${r.title || ''} ${r.actor || ''} ${r.kind || ''}`.toLowerCase().includes(w)));
}
/** rtLogIn(payload) — a row just written (SSE idearium.repo.activity): to the top of an open log it matches */
function rtLogIn(p) {
  if (!p || !p.row || p.repoUuid !== RT_LOG.uuid) return;
  if (RT_LOG.facets) { const k = String(p.row.kind || '').split('.')[0]; RT_LOG.facets.kinds[k] = (RT_LOG.facets.kinds[k] || 0) + 1; RT_LOG.facets.total++; }
  if (!_rtLogMatches(p.row) || RT_LOG.rows.some(x => x.uuid === p.row.uuid)) return;
  RT_LOG.rows.unshift(p.row);
  if (RT_VIEW === 'log' && _rtDrawerOpen() && p.repoUuid === _rtCurrent()) rtLogPaint();
}
function rtLogSet(k, v) { RT_LOG[k] = v; rtLogLoad(); }
function rtLogToggle(id) { if (RT_LOG.open.has(id)) RT_LOG.open.delete(id); else RT_LOG.open.add(id); rtLogPaint(); }

const _RT_STATUS = { restored: '<span class="rt-stale">↶</span>', ok: '<span class="rt-ok">✓</span>', failed: '<span class="rt-bad">✗</span>', running: '<span class="rt-dim" title="started">▸</span>', proposed: '<span class="rt-prop">◇</span>', applied: '<span class="rt-ok">◆</span>', rejected: '<span class="rt-dim">⊘</span>', reverted: '<span class="rt-stale">↶</span>', staged: '<span class="rt-prop">◈</span>', skipped: '<span class="rt-stale">↷</span>' };
function _rtDetail(d) {
  if (d == null) return '';
  if (typeof d === 'string') return `<div class="rt-step">${_rtEsc(d)}</div>`;
  return Object.entries(d).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) =>
    `<div class="rt-step"><span class="rt-dim">${_rtEsc(k)}</span> ${_rtEsc(Array.isArray(v) ? v.map(x => typeof x === 'object' ? (x.name || JSON.stringify(x)) + (x.ok === false ? ' ✗' : '') : x).join(', ') : typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('');
}
function rtLogPaint() {
  const body = document.getElementById('rt-list');
  const f = document.getElementById('rt-filters');
  if (!body) return;
  const fc = RT_LOG.facets || { kinds: {}, actors: {}, total: 0 };
  if (f) f.innerHTML = [['', `all ${fc.total || 0}`], ...Object.entries(fc.kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${k} ${n}`])]
      .map(([k, l]) => `<button class="rt-f${RT_LOG.kind === k ? ' on' : ''}" onclick="rtLogSet('kind','${_rtEsc(k)}')">${_rtEsc(l)}</button>`).join('')
    + `<button class="rt-f${RT_LOG.failed ? ' on' : ''}" onclick="rtLogSet('failed',${!RT_LOG.failed})" title="only what failed">failed</button>`
    + `<select class="rt-sel" onchange="rtLogSet('actor',this.value)"><option value="">everyone</option>${Object.entries(fc.actors).sort((a, b) => b[1] - a[1]).map(([a, n]) => `<option value="${_rtEsc(a)}"${RT_LOG.actor === a ? ' selected' : ''}>${_rtEsc(a)} (${n})</option>`).join('')}</select>`
    + `<input class="rt-q" placeholder="search…" value="${_rtEsc(RT_LOG.q)}" onkeydown="if(event.key==='Enter')rtLogSet('q',this.value)">`;
  let day = '';
  const rows = RT_LOG.rows.map(r => {
    const d = new Date(r.ts);
    const dk = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const head = dk !== day ? `<div class="rt-day">${_rtEsc(dk)}</div>` : '';
    day = dk;
    const open = RT_LOG.open.has(r.uuid);
    return `${head}<div class="rt-lrow rt-${_rtEsc(r.status)}" onclick="rtLogToggle('${_rtEsc(r.uuid)}')">
      <span class="rt-dim rt-time">${d.toLocaleTimeString('en-GB', { hour12: false })}</span>
      <span class="rt-ico">${_RT_STATUS[r.status] || '·'}</span>
      <span class="rt-kind rt-k-${_rtEsc(String(r.kind || '').split('.')[0])}">${_rtEsc(r.kind)}</span>
      <span class="rt-ltitle${r.status === 'failed' ? ' rt-sub-bad' : ''}" title="${_rtEsc(r.title)}">${_rtEsc(r.title)}</span>
      ${r.actor ? `<span class="rt-prov">${_rtEsc(r.actor)}</span>` : ''}
      ${open ? `<div class="rt-body">${r.kind === 'checkpoint.saved' && r.detail && r.detail.tag ? `<button class="rt-rewind" onclick="event.stopPropagation();rtRewind('${_rtEsc(r.detail.tag)}')" title="the desktop goes back to this moment: its files, memory and running programs">↶ rewind the desktop to here</button>` : ''}${_rtDetail(r.detail)}<div class="rt-dim rt-meta">${_rtEsc([r.hat && `hat ${r.hat}`, r.ref && `ref ${r.ref}`, r.ms != null && `${Math.round(r.ms / 1000)}s`].filter(Boolean).join(' · '))}</div></div>` : ''}
    </div>`;
  }).join('');
  const keep = body.scrollTop;
  body.innerHTML = (rows || `<div class="rt-empty">${RT_LOG.loading ? 'reading the log…' : RT_LOG.error ? _rtEsc(RT_LOG.error) : 'nothing logged yet — every agent call, phase step, proposal (and who applied or undid it) and fault in this repo is written here'}</div>`)
    + (RT_LOG.more ? `<button class="rt-more" onclick="rtLogLoad(true)">older…</button>` : '');
  body.scrollTop = keep;
}

// a running task's time counts up without repainting the list
function _rtTick() {
  const uuid = _rtCurrent(); if (!uuid || !_rtDrawerOpen()) return;
  for (const t of _rtState(uuid).values()) {
    if (t.status !== 'running') continue;
    const el = document.querySelector(`[data-rt-dur="${CSS.escape(t.id)}"]`); if (el) el.textContent = _rtDur(t);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  rtEnsureButton();
  let wasOpen = false; try { wasOpen = localStorage.getItem('idearium.rt.open') === '1'; RT_VIEW = _rtViewOk(localStorage.getItem('idearium.rt.view')) ? localStorage.getItem('idearium.rt.view') : 'tasks'; } catch (_) {}
  if (wasOpen && _rtCurrent()) rtToggleDrawer(true);
});
