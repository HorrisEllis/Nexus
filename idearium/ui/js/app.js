// ════════════════════════════════════════════════════
// STARFIELD CANVAS — twinkling stars (Van Gogh / synthwave reference, dialed
// down to ambient field per the style note: ~0.15-0.2 opacity behind panels)
// ════════════════════════════════════════════════════
(function(){
  const canvas = document.getElementById('star-canvas');
  const ctx = canvas.getContext('2d');
  let stars = [];
  function resize(){
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const N = Math.round((canvas.width*canvas.height)/9000);
    stars = Array.from({length:N}, () => ({
      x: Math.random()*canvas.width, y: Math.random()*canvas.height*0.9,
      r: Math.random()*1.3+0.3, base: Math.random()*0.5+0.25,
      speed: Math.random()*0.02+0.005, phase: Math.random()*Math.PI*2
    }));
  }
  function tick(t){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (const s of stars){
      const tw = s.base + Math.sin(t*s.speed + s.phase)*0.35;
      ctx.globalAlpha = Math.max(0, Math.min(1, tw));
      ctx.fillStyle = '#cfe6ff';
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  window.addEventListener('resize', resize);
  resize(); requestAnimationFrame(tick);
})();

// ════════════════════════════════════════════════════
// NEXUS API CLIENT — wired to the real Idearium service (idearium/api/index.js)
// Real routes: GET /api/ideas, /api/specs, /api/gaps, /api/snapshots, /api/stats,
// /api/events, /sse · POST /api/ideas, /api/gaps, /api/snapshots, etc.
// Talks to idearium directly (:4800). §0.39.266 — no orchestrator-proxy fallback (see API_CANDIDATES).
// ════════════════════════════════════════════════════
// §0.39.263 — the idearium that served this page comes first: an idearium on
// another port (IDEARIUM_PORT) used to render a UI that talked to :4800 instead.
// 0.39.263 — served standalone (idearium's own port, not under the orchestrator's /ui/),
// the Eravos canvas cannot resolve ../<system>/ against this server: use the orchestrator's (the Architect is idearium's own, 0.39.299).
// §0.39.271 — the two frames start at about:blank (data-src holds the relative path):
// loading ../eravos/ before this ran was a 404 on :4800 on every page load.
(() => {
  try {
    if (typeof location === 'undefined') return;
    const underUi = /^\/ui\//.test(location.pathname);
    const orch = `${location.protocol}//${location.hostname}:9000/ui`;
    const set = () => {
      const e = document.getElementById('eravos-frame'); if (e) e.src = underUi ? e.dataset.src : `${orch}/eravos/`;
      // §0.39.299 AR4 — the Architect is idearium's own page (architect.html), served wherever idearium is: no orchestrator needed
      const a = document.getElementById('architect-frame'); if (a) a.src = a.dataset.src;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', set); else set();
  } catch (_) {}
})();
// §0.39.266 — James: "is it the sse? or the orchastrator? why is it need the orchastrator?" It is not
// needed: the page's API is idearium itself. Two candidates are gone:
//   · the orchestrator proxy (:9000/api/idearium) — its /health is idearium's, so it passed the probe,
//     but it routes no /api/*: /api/idearium/api/repos → 404. After a slow moment the reconnect could
//     land there and every list failed until a reload.
//   · the page's own origin when the orchestrator serves it (/ui/idearium/) — the orchestrator's /health
//     fans out to every system (up to 3 s) and is never idearium's anyway.
const API_CANDIDATES = [...new Set([
  ...(typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && !/^\/(api|ui)\//.test(location.pathname) ? [location.origin] : []),
  'http://127.0.0.1:4800',
])];
let API_BASE = null;
let CONNECTED = false;
let SSE = null;

async function fetchTimeout(url, opts={}, ms=5000) {
  // §2026-07-10 — was 1800ms. The screenshots showed repeated "operation was
  // aborted" toasts: the health check aborting at 1.8s against a host under
  // memory pressure (the 0xC0000409 crash cause). 1.8s is too tight for a cold
  // connection or a loaded machine. Writes already used 6000; this aligns the
  // default so health checks and exports stop spuriously aborting.
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

// §0.39.260 — James: "should not show online at 9000, thats not useful."
// An HTTP 200 from a base is not proof idearium is up: the orchestrator
// proxy at :9000 answered /health with 200 {ok:false, error:'… timeout'}
// while idearium (:4800) was dead, and this read that as connected. Only
// idearium's own health body counts: ok === true AND a version (both come
// from idearium/api's `health` action, never from the proxy's error path).
async function _ideariumAlive(base) {
  try {
    const r = await fetchTimeout(base + '/health');
    if (!r.ok) return false;
    const h = await r.json().catch(() => null);
    return !!(h && h.ok === true && h.version);
  } catch (_) { return false; }
}

async function nexusConnect(manual=false) {
  setConnUI('connecting');
  for (const base of API_CANDIDATES) {
    if (await _ideariumAlive(base)) { API_BASE = base; CONNECTED = true; setConnUI('online', base); if (window.IdeariumTheme) IdeariumTheme.load(base); await loadAll(); openSSE(); _startHealthWatch(); return true; }
  }
  CONNECTED = false; API_BASE = null; setConnUI('offline');
  _startHealthWatch();
  if (manual) toast('still unreachable — is the idearium service running?','err');
  return false;
}

// Connection state is re-proved every 10 s, not asserted once at page load:
// idearium going down after the page connected (the MASTERMIND-import stall)
// used to leave the indicator green indefinitely.
// §0.39.265 — James: "its really unstable. idearium." One missed probe (a
// 5 s window while idearium finishes a big write) flipped the page offline, and
// the reconnect 10 s later re-ran loadAll() — every list reloaded, the open view
// re-rendered. Offline now takes two misses in a row (~20 s of silence).
let _healthTimer = null, _healthBusy = false, _healthMisses = 0;
function _startHealthWatch() {
  if (_healthTimer) return;
  _healthTimer = setInterval(async () => {
    if (_healthBusy) return;
    _healthBusy = true;
    try {
      if (CONNECTED) {
        const alive = await _ideariumAlive(API_BASE);
        _healthMisses = alive ? 0 : _healthMisses + 1;
        if (!alive && _healthMisses === 1) setConnUI('slow', API_BASE);
        else if (alive && document.querySelector('.conn-slow')) setConnUI('online', API_BASE);
        if (!alive && _healthMisses >= 2) {
          _healthMisses = 0;
          CONNECTED = false; API_BASE = null;
          try { if (SSE) SSE.close(); } catch (_) {}
          SSE = null;
          setConnUI('offline');
        }
      } else {
        for (const base of API_CANDIDATES) {
          if (await _ideariumAlive(base)) { API_BASE = base; CONNECTED = true; setConnUI('online', base); await loadAll(); openSSE(); break; }
        }
      }
    } finally { _healthBusy = false; }
  }, 10000);
}

function setConnUI(state, base) {
  const el = document.getElementById('conn-indicator');
  const label = document.getElementById('conn-label');
  const banner = document.getElementById('offline-banner');
  el.className = 'tb-conn ' + (state==='online'?'online':state==='slow'?'online conn-slow':state==='connecting'?'':'offline');
  // Names what was proven alive — idearium — and the route to it, instead of
  // "nexus · :9000/api/idearium", which read as the orchestrator's state.
  const via = base && base.indexOf(':9000') !== -1 ? ' via :9000' : '';
  label.textContent = state==='online' ? `idearium · online${via}` : state==='slow' ? `idearium · busy${via}` : state==='connecting' ? 'connecting…' : 'idearium offline — click to retry';
  banner.classList.toggle('show', state==='offline');
  if (state === 'slow') return;   // busy, still connected — the banner and footer stay as they are
  document.getElementById('welcome-foot').textContent = state==='online'
    ? `idearium connected · ${base}`
    : 'idearium (:4800) not answering — awaiting connection';
}

async function api(path, opts={}, timeoutMs=6000) {
  if (!API_BASE) throw new Error('not connected to nexus');
  const r = await fetchTimeout(API_BASE + path, { headers:{'Content-Type':'application/json'}, ...opts }, timeoutMs);
  let data = {};
  try { data = await r.json(); } catch(_) {}
  if (!r.ok || data.ok === false) {
    const e = new Error(data.error || r.statusText || 'request failed');
    e.detail = data.detail; e.status = r.status; // §MCO-E — a caller can act on a stated code (e.g. DEPS_INCOMPLETE)
    e.data = data;   // 0.39.244 — the whole refusal (a caller like the Agent tab needs its awaitLate/jobId, not just the text)
    throw e;
  }
  return data;
}

function openSSE() {
  try {
    if (SSE) SSE.close();
    SSE = new EventSource(API_BASE + '/sse');
    SSE.onopen = () => { document.getElementById('sse-badge').textContent='live'; document.getElementById('sse-badge').classList.add('live'); };
    SSE.onerror = () => { document.getElementById('sse-badge').textContent='disconnected'; document.getElementById('sse-badge').classList.remove('live'); };
    SSE.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        // §FEED 0.39.244 — a repo agent's live guardian feed: to the Agent tab only (several a second;
        // it would bury the event log and trigger refreshes for nothing).
        if (ev && ev.type === 'idearium.repo.agent.feed') { _agentFeedIn(ev.payload || {}); return; }
        appendEventLog(ev); refreshOnEvent(ev);
      }
      catch(_) {}
    };
  } catch(_) {}
}

function refreshOnEvent(ev) {
  // re-pull the relevant slice rather than trust a partial payload
  if (!ev || !ev.type) return;
  // §BUG FIXED 2026-07-11 — found via loom's wire-endpoints sweep (checking
  // every os.emit(...) against what actually listens for it): two event-
  // naming conventions coexist in idearium — bare ('spec.created',
  // 'idea.updated', matching this dispatcher's original startsWith checks)
  // and 'idearium.'-prefixed ('idearium.spec.built', 'idearium.spec.
  // compiled', 'idearium.spec.imported', 'idearium.spec.promoted',
  // 'idearium.queue.progress', 'idearium.repo.file.write/.delete'). Every
  // event using the second convention silently triggered no UI refresh at
  // all — not because refreshOnEvent had a bug in its logic, but because
  // it only ever recognized the first convention's prefixes. Strip an
  // optional leading 'idearium.' before matching so both conventions work
  // the same way, instead of adding one narrow special case per event
  // every time this happens again.
  const t = ev.type.startsWith('idearium.') ? ev.type.slice('idearium.'.length) : ev.type;
  if (typeof fileStatesOnEvent === 'function') fileStatesOnEvent(ev);   // §0.39.280 BS8
  if (typeof planPanelOnEvent === 'function') planPanelOnEvent(ev);     // §0.39.280 BS11
  if (typeof codeSurfaceOnEvent === 'function') codeSurfaceOnEvent(ev); // §0.39.351 CT5 — the Code tab follows the Plan
  if (t.startsWith('idea.'))   { loadIdeas(); }
  if (t.startsWith('workbench.') && typeof loadCompartment === 'function') { loadCompartment(); }
  if (t.startsWith('gap.'))    { loadGaps(); }
  // §BUG FIXED 2026-07-15 — spec-engine's own chunk events are named
  // 'idearium.spec-engine.chunk.complete'/'.queued', which — unlike every
  // 'idearium.spec.*' event — does NOT start with 'spec.' (it's
  // 'spec-engine.', a hyphen not a dot). Those events silently fell through
  // every branch below and never refreshed anything, same class of bug as
  // the 2026-07-11 fix above this function.
  if (t.startsWith('spec.') || t.startsWith('spec-engine.')) { loadSpecs(); }
  // §FIX 2026-09-15 — James: "idearium needs to fail when chunks aren't
  // being generated." The backend now emits a real 'idearium.error' (and
  // 'idearium.spec-engine.build.stalled') when a spec's chunks are stuck
  // FAILED/ESCALATED with nothing left to dispatch — appendEventLog above
  // already logs it, but the log panel is easy to miss mid-session; a
  // stalled build deserves the same loud, impossible-to-miss toast() any
  // user-initiated failure already gets, not just a quiet log line.
  if (t === 'error' || t.startsWith('spec-engine.build.stalled')) { toast(ev.payload?.reason || 'a spec build stalled — see event log', 'err'); }
  // §BUILT 2026-09-20 — real chunk-progress toast, see toastProgress()'s
  // own header. Only updates a toast that chunkRepoWithProgress() already
  // opened for this exact repoUuid — a progress event for a repo nobody
  // is watching in this tab has nothing to update and is silently ignored,
  // not an error.
  if (t === 'repo.chunk.progress' && ev.payload?.repoUuid) {
    const p = ev.payload;
    if (_progressToasts.has(p.repoUuid)) {
      toastProgress(p.repoUuid, `chunking "${p.sectionId}" — ${p.doneChunks}/${p.totalChunks} (${p.progress}%)`, p.progress);
    }
  }
  // §FIXED 2026-09-20 — James: "is it hooked into the graph?" It wasn't;
  // see idearium/api/index.js's repo.chunk.run for the real fix
  // (makeBusForwarder wired in). These are the REAL pipeline stages —
  // parse -> atlas -> chunk -> verify -> index -> graph, idearium/repo/
  // pipeline-events.js's own 12-event catalog — not idearium.repo.chunk.
  // progress above, which fires earlier, during repo creation itself
  // (spec-engine's own per-file manifest chunks), a genuinely different
  // phase from this pipeline. Both are real; this one is what actually
  // answers "did it reach the graph."
  if (_repoPipelineStage[t] && ev.payload?.repoUuid) {
    const p = ev.payload;
    if (_progressToasts.has(p.repoUuid)) {
      const { label, pct } = _repoPipelineStage[t];
      toastProgress(p.repoUuid, label, pct);
    }
  }
  if (t==='push.complete')     { loadSnapshots(); }
  if (t==='snr.update')        { loadStats(); }
  // §RESEQUENCED 2026-09-20 — chunking progress, whoever started it. The
  // import flow toasts these itself in the foreground; this branch covers
  // the other cases (a reindex from the Intelligence tab, the CLI, another
  // window) so a chunk run is never silent. Placed BEFORE the generic
  // 'repo.' branch below, which only refreshes — it does not report.
  if (t === 'repo.chunk.started') {
    toast(`chunking "${ev.payload?.name || ''}" — ${ev.payload?.fileCount ?? '?'} file(s)…`, 'ok');
  }
  if (t === 'repo.chunk.done') {
    const c = ev.payload?.chunkCount;
    toast(`chunked "${ev.payload?.name || ''}" — ${c != null ? `${c} chunks` : 'complete'} · ${ev.payload?.state || ''}`, 'ok');
  }
  if (t === 'repo.chunk.fault') {
    toast(`chunking fault: ${ev.payload?.error || 'see verification tiers'}`, 'err');
  }
  // §MCO3-UI 2026-09-20 — a snapshot taken from anywhere (this tab, the API,
  // another window) refreshes the Versionium list if it is the open tab for
  // that repo. Placed before the generic 'repo.' branch, which would only
  // reload the file panel.
  // §MCO-E — a roadmap edit from anywhere refreshes the Roadmap tab if it is open for that repo.
  if (t === 'repo.roadmap.updated' && CURRENT_API_REPO && ev.payload?.repoUuid === CURRENT_API_REPO.uuid
      && CURRENT_REPO_SUBTAB === 'roadmap' && !ROADMAP_EDITING) {
    renderRepoRoadmap(CURRENT_API_REPO);
  }
  // §0.39.271 P4 — the Phases tab (js/phases.js) repaints on a phase edit or a build step
  if (typeof phasesOnEvent === 'function') phasesOnEvent(t, ev.payload);
  if (t === 'repo.snapshot.committed' && CURRENT_API_REPO && ev.payload?.repoUuid === CURRENT_API_REPO.uuid
      && CURRENT_REPO_SUBTAB === 'versionium') {
    renderRepoVersionium(CURRENT_API_REPO);
  }
  // §0.39.266 — the nexus-self sync creates/updates the Nexus repos after boot (first run
  // 20s in, core ~1,800 files); without this the library stayed empty until a reload.
  // §0.39.266 — loom.write.tool proposed a file on a nexus repo: the approval prompt opens for it, like a reply's inject
  if (t === 'repo.inject.proposed' && ev.payload && ev.payload.approval && ev.payload.status === 'proposed'
      && CURRENT_API_REPO && ev.payload.repoUuid === CURRENT_API_REPO.uuid && typeof NEXUS_APPROVAL_QUEUE !== 'undefined') {
    if (!NEXUS_APPROVAL_QUEUE.includes(ev.payload.inject)) NEXUS_APPROVAL_QUEUE.push(ev.payload.inject);
    setTimeout(_nexusApprovalNext, 0);
  }
  if (t.startsWith('nexus-self.')) { clearTimeout(refreshOnEvent._nx); refreshOnEvent._nx = setTimeout(loadApiRepos, 800); }   // one reload per burst (one event per system)
  if (t.startsWith('repo.')) {
    loadApiRepos().then(() => {
      if (CURRENT_API_REPO && ev.payload?.repoUuid === CURRENT_API_REPO.uuid) {
        const fresh = API_REPOS.find(r => r.uuid === CURRENT_API_REPO.uuid);
        if (fresh) { CURRENT_API_REPO = fresh; renderApiRepoPanel(fresh); }
      }
    });
  }
  if (t.startsWith('queue.'))  { if (typeof loadStats === 'function') loadStats(); }
}

// ════════════════════════════════════════════════════
// STATE — populated only from real Nexus data, never seeded
// ════════════════════════════════════════════════════
let IDEAS=[], GAPS=[], SPECS=[], SNAPSHOTS=[], STATS=null;
let SELECTED=null, SELECTED_SPEC=null, SELECTED_SNAP=null;
let CURRENT_SORT='tension';
let BRAINSTORMS = [];  // §CHANGED 2026-09-03 — was JSON.parse(localStorage...); loaded from data/ via loadBrainstorms() below, matching every other real state in this file.
const IDEA_PHASES   = ['seed','expanding','tensioned','specced','building','complete','archived'];
const GAP_SEVERITIES= ['fatal','high','medium','low'];
const LINK_TYPES    = ['resonance','tension','causal','temporal','semantic'];
const SECTION_IDS   = ['intent','api_callto','module_hooks','cli_spec','schemas','gap_contract','failure_modes','tests','phase_map'];

async function loadAll() {
  await Promise.all([loadIdeas(), loadGaps(), loadSpecs(), loadSnapshots(), loadStats(), loadApiRepos(), loadBrainstorms(),
    typeof loadCompartment === 'function' ? loadCompartment() : null]);
}
// §BUILT 2026-09-03 — real data/-backed load, replacing the old
// localStorage.getItem at module-load time. Same shape (array of
// {uuid,text,tags,ts,promoted}), sourced from the real idearium_brainstorms
// JAA table now, not the browser.
async function loadBrainstorms() { try { BRAINSTORMS = (await api('/api/brainstorms')).brainstorms || []; renderBrainstorms(); updateStats(); } catch(e){ console.warn('[idearium] loadBrainstorms failed:', e.message); } }
async function loadIdeas()    { try { IDEAS = (await api('/api/ideas')).ideas || []; renderIdeaList(); if(SELECTED){const i=IDEAS.find(x=>x.uuid===SELECTED); if(i) renderDetail(i);} } catch(e){ console.warn('[idearium] loadIdeas failed:', e.message); toast('failed to load ideas: '+e.message,'err'); } }
async function loadGaps()     { try { GAPS  = (await api('/api/gaps')).gaps  || []; renderIdeaList(); } catch(e){ console.warn('[idearium] loadGaps failed:', e.message); } }
// §BUG FIXED 2026-07-15 — loadIdeas() re-renders the open idea detail panel
// on every refresh (see the line above); loadSpecs() never did the same for
// an open spec builder. An SSE-driven chunk/build event updated the spec
// list and status chips but left a currently-open builder panel showing
// stale chunk statuses until the user reselected the spec by hand.
// §CHANGED 2026-09-21 — the Spec Library list is gone (specs are repos; see
// renderRepoSpec). SPECS is still loaded: the Spec and Architect repo subtabs
// read it, and the topbar count uses it. A refresh re-renders whichever of those
// two subtabs is open, and only those — an open builder is no longer painted
// into a hidden pane on every SSE chunk event.
async function loadSpecs()    { try { loadAgentOptions(); SPECS = (await api('/api/specs')).specs|| []; if (CURRENT_REPO_SUBTAB === 'architect' || CURRENT_REPO_SUBTAB === 'spec') renderCurrentRepoSubtab(); } catch(e){ console.warn('[idearium] loadSpecs failed:', e.message); toast('failed to load specs: '+e.message,'err'); } }
async function loadSnapshots(){ try { SNAPSHOTS = (await api('/api/snapshots')).snapshots || []; renderVersionium(); } catch(e){ console.warn('[idearium] loadSnapshots failed:', e.message); } }
async function loadStats()    { try { STATS = (await api('/api/stats')).stats; } catch(e){ console.warn('[idearium] loadStats failed:', e.message); } updateStats(); }
// Ideas/Repo merge: repos are no longer their own rail tab — they're looked
// up by ideaUuid/specUuid from idea/spec detail panels. API_REPOS is the
// client-side cache loadAll() refreshes alongside everything else.
let API_REPOS = [];
async function loadApiRepos() {
  try {
    API_REPOS = (await api('/api/repos')).repos || [];
    renderRepoLibrary();
    updateStats(); if (document.getElementById('idea-list')) renderIdeaList();   // 0.39.263 — which ideas have a repo
    if (CURRENT_API_REPO) {
      const fresh = API_REPOS.find(r => r.uuid === CURRENT_API_REPO.uuid);
      if (fresh) { CURRENT_API_REPO = fresh; renderApiRepoPanel(fresh); }
    }
  } catch(e){ console.warn('[idearium] loadApiRepos failed:', e.message); }
}

// §NEW 2026-07-15 — chunk retry trail + build artifacts for a spec-engine
// spec, read from speceng.show's `history` block. Kept out of SPECS/loadSpecs
// entirely: it's per-spec detail, not list data, and fetching it for every
// spec on every list refresh would be wasted work for specs nobody has open.
// Fetched lazily by renderSpecHistoryPanel() only while that spec's builder
// panel is actually mounted, and rendered into its own sub-panel so a slow
// or failed history fetch never blocks the chunk list/action row above it
// (already-known synchronous data) from showing immediately.
let SPEC_HISTORY = {};
let _historyFetchInFlight = new Set();

async function renderSpecHistoryPanel(specUuid) {
  if (_historyFetchInFlight.has(specUuid)) return;
  _historyFetchInFlight.add(specUuid);
  try {
    const res = await api(`/api/spec-engine/specs/${specUuid}`);
    SPEC_HISTORY[specUuid] = res.history || { chunkEvents: [], buildArtifacts: [] };
  } catch (e) {
    console.warn('[idearium] history fetch failed:', e.message);
    SPEC_HISTORY[specUuid] = SPEC_HISTORY[specUuid] || { chunkEvents: [], buildArtifacts: [] };
  } finally {
    _historyFetchInFlight.delete(specUuid);
  }
  // The user may have navigated to a different spec (or away entirely)
  // while this was in flight — only touch the DOM if it's still relevant.
  if (SELECTED_SPEC !== specUuid) return;
  const panel = document.getElementById('spec-history-panel');
  if (panel) panel.innerHTML = buildSpecHistoryHtml(specUuid);
  const badge = document.getElementById('spec-compiled-badge');
  if (badge) badge.outerHTML = buildCompiledBadgeHtml(specUuid);
}

function buildCompiledBadgeHtml(specUuid) {
  const hist = SPEC_HISTORY[specUuid];
  if (!hist) return `<span id="spec-compiled-badge" style="font-family:var(--mono);font-size:9px;color:var(--text3)">checking build status…</span>`;
  const latest = (hist.buildArtifacts || [])[0]; // [0] = most recent, per _specHistory's sort
  if (!latest) return `<span id="spec-compiled-badge" style="font-family:var(--mono);font-size:9px;color:var(--text3)">not compiled yet</span>`;
  if (latest.ok) {
    return `<span id="spec-compiled-badge" style="font-family:var(--mono);font-size:9px;color:var(--mint)">✓ compiled · ${escapeHtml(latest.extraction||'')}${latest.agent?` · ${escapeHtml(latest.agent)}`:''}</span>`;
  }
  return `<span id="spec-compiled-badge" style="font-family:var(--mono);font-size:9px;color:var(--coral)" title="${escapeHtml(latest.error||'')}">✗ compile failed — ${escapeHtml((latest.error||'unknown error').slice(0,70))}</span>`;
}

function buildSpecHistoryHtml(specUuid) {
  const hist = SPEC_HISTORY[specUuid];
  if (!hist) return `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:6px 0">loading history…</div>`;
  const { chunkEvents=[], buildArtifacts=[] } = hist;
  if (!chunkEvents.length && !buildArtifacts.length) {
    return `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:6px 0">no build history yet</div>`;
  }
  const fmtTime = ts => ts ? new Date(ts).toLocaleString() : '—';
  const artifactsHtml = buildArtifacts.map(a => `
    <div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;padding:4px 0;border-bottom:1px solid var(--b0)">
      <span style="color:${a.ok?'var(--mint)':'var(--coral)'}">${a.ok?'✓':'✗'}</span>
      <span style="flex:1;color:var(--text2)">${escapeHtml(a.extraction||'—')}${a.agent?` · ${escapeHtml(a.agent)}`:''}${a.error?` · ${escapeHtml(a.error.slice(0,80))}`:''}</span>
      <span style="color:var(--text3);flex-shrink:0">${fmtTime(a.ts)}</span>
    </div>`).join('');
  const eventsHtml = chunkEvents.map(e => `
    <div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:10px;padding:3px 0;border-bottom:1px solid var(--b0)">
      <span style="color:${e.cacheHit?'var(--mint)':'var(--amber)'}" title="${e.cacheHit?'cache/reuse hit':'built'}">${e.cacheHit?'⚡':'●'}</span>
      <span style="flex:1;color:var(--text2)">${escapeHtml(e.sectionId||'')}</span>
      <span style="color:var(--text3)">${escapeHtml(e.source||'')}${e.reusedFrom?' (reused)':''}${e.cost!=null?` · ${e.cost} tok`:''}</span>
      <span style="color:var(--text3);flex-shrink:0">${fmtTime(e.ts)}</span>
    </div>`).join('');
  return `
    <details style="margin-top:4px" ${buildArtifacts.length?'open':''}>
      <summary style="cursor:pointer;font-family:var(--mono);font-size:10px;color:var(--text2)">build artifacts (${buildArtifacts.length})</summary>
      ${artifactsHtml || `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:4px 0">none yet</div>`}
    </details>
    <details style="margin-top:8px">
      <summary style="cursor:pointer;font-family:var(--mono);font-size:10px;color:var(--text2)">chunk history (${chunkEvents.length}${chunkEvents.length===200?'+':''})</summary>
      ${eventsHtml || `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:4px 0">none yet</div>`}
    </details>
  `;
}


// §0.39.263 — James: "it says 15 ideas and 15 repos … ideas, once promoted to spec should
// move to the idea tab in the actual repo." An idea that has a repo (it is a spec) lives in
// that repo's Idea tab: it leaves the Ideas list and the ideas count. Nexus's own system
// repos (each carries a "Repo: nexus/…" idea and a spec per synced version) are not the
// person's ideas or specs, so neither count includes them.
function ideaRepoOf(ideaUuid) {
  return (typeof API_REPOS !== 'undefined' ? API_REPOS : []).find(r => r.ideaUuid === ideaUuid && r.status !== 'archived') || null;
}
function _nexusSelfIds() {
  const specs = new Set(), ideas = new Set();
  for (const r of (typeof API_REPOS !== 'undefined' ? API_REPOS : [])) {
    if (!r.nexusSelf) continue;
    if (r.ideaUuid) ideas.add(r.ideaUuid);
    for (const u of [r.specUuid, r.promotedFromSpec, ...(r.specHistory || []).map(h => h && h.specUuid)]) if (u) specs.add(u);
  }
  return { specs, ideas };
}
function openIdeasCount() { return IDEAS.filter(i => i.phase !== 'archived' && !ideaRepoOf(i.uuid)).length; }
function userSpecsCount() {
  const nx = _nexusSelfIds();
  return SPECS.filter(s => !nx.specs.has(s.uuid) && !(s.ideaUuid && nx.ideas.has(s.ideaUuid))).length;
}

function updateStats() {
  // §UI 2026-09-20 — James: "Remove open gaps, snr, from top." The topbar
  // strip is now ideas + specs only. GAPS/STATS are still loaded and still
  // real — open gaps remain per-idea in renderDetail(), and snr is still
  // the versionium/snapshot metric — only the two global counters are gone.
  document.getElementById('stat-ideas').textContent = openIdeasCount() || 0;
  document.getElementById('stat-specs').textContent = userSpecsCount() || 0;
  document.getElementById('brain-count-badge').textContent = `${BRAINSTORMS.length} entries`;
  document.getElementById('snap-btn').disabled = !CONNECTED;
}

// ════════════════════════════════════════════════════
// VIEW SWITCHING + NAV RAIL
// ════════════════════════════════════════════════════
function setView(v) {
  if (v === 'compartment') v = 'repo';   // 0.39.263 — repos are compartments; there is no separate view
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active', el.id==='view-'+v));
  document.querySelectorAll('.tab-btn, .tab-sub').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
  document.querySelectorAll('.tab-group').forEach(g=>{
    const groupBtn = g.querySelector('.tab-group-btn');
    const views = (groupBtn?.dataset.views || '').split(',');
    if (groupBtn) groupBtn.classList.toggle('active', views.includes(v));
    g.classList.remove('open');
  });
  _dismissTabGroups();
  if (typeof planTabSync === 'function') setTimeout(planTabSync, 0);   // §0.39.353 CT9 — no Plan tab off the repo view
  // Clicking the Repos tab itself always lands on the landing grid, even if
  // a repo was left open last visit — openRepoFor() (idea/spec → repo) is
  // the only path that should skip straight to detail mode.
  if (v === 'repo') { exitRepoDetail(); }
  if (v === 'compartment' && typeof renderCompartmentDetail === 'function') { renderCompartmentTree(); renderCompartmentDetail(); }
  document.querySelectorAll('.tt-leaf').forEach(l => l.classList.remove('active'));
  _syncNestCtx(v);
}

// §0.39.271 N1 — Create/Build open from the repo's own tab row; their views keep the
// repo in view with one bar that leads back, so leaving the repo row never looks like
// a second Idearium. The top bar stays Welcome + Repos.
const NEST_VIEW_LABEL = { brainstorm: 'Create › Brainstorm', ideas: 'Create › Ideas', eravos: 'Build › Eravos — organism canvas', 'architect-build': 'Build › Architect', 'spec-wizard': 'Build › Spec Builder' };
function _syncNestCtx(v) {
  const bar = document.getElementById('nest-ctx');
  if (!bar) return;
  const show = !!NEST_VIEW_LABEL[v] && typeof REPO_DETAIL_OPEN !== 'undefined' && REPO_DETAIL_OPEN && CURRENT_API_REPO;
  bar.classList.toggle('show', !!show);
  if (show) {
    document.getElementById('nest-ctx-text').textContent = `${CURRENT_API_REPO.name} · ${NEST_VIEW_LABEL[v]}`;
    document.querySelectorAll('.tab-btn[data-view="repo"]').forEach(b => b.classList.add('active'));
  }
}
function backToRepo() {
  // setView('repo') would exitRepoDetail() — this returns to the OPEN repo instead.
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-repo'));
  document.querySelectorAll('.tab-btn, .tab-sub').forEach(b => b.classList.toggle('active', b.dataset.view === 'repo'));
  document.querySelectorAll('.tab-group-btn').forEach(b => b.classList.remove('active'));
  _syncNestCtx('repo');
}

// Top-tab subnav dropdowns (Create ▾ / Build ▾) — hover works via CSS,
// this adds click/tap support (touch + keyboard-driven clicks) on top of it.
function toggleTabGroup(e, btn) {
  e.stopPropagation();
  const group = btn.closest('.tab-group');
  document.querySelectorAll('.tab-group').forEach(g => { if (g !== group) g.classList.remove('open'); });
  group.classList.toggle('open');
}
document.addEventListener('click', () => {
  document.querySelectorAll('.tab-group.open').forEach(g => g.classList.remove('open'));
});

// §0.39.284 W4 — James: "this is hard to understand how to actually build the code base" · "get it coding the
// projects". Build ▾ → "Build this repo": the open repo's Home tab (its specs, each with plan + build) with the Plan
// panel open beside it, the work surface under the plan. No repo open → the library, told to pick one.
function _dismissTabGroups() {
  // a menu entry was chosen: close it even while the pointer still rests on it (:hover), until the pointer leaves
  document.querySelectorAll('.tab-group').forEach(g => {
    g.classList.remove('open');
    if (g.matches(':hover')) { g.classList.add('dismissed'); g.addEventListener('mouseleave', () => g.classList.remove('dismissed'), { once: true }); }
  });
}
function openBuildFlow() {
  _dismissTabGroups();
  if (typeof CURRENT_API_REPO === 'undefined' || !CURRENT_API_REPO || !REPO_DETAIL_OPEN) {
    setView('repo');
    toast('pick the repo to build — then Build ▾ → Build this repo (or its Home tab: Start building)', 'ok');
    return;
  }
  backToRepo();
  setRepoSubtab('home');
  if (typeof renderBuildStart === 'function') renderBuildStart(CURRENT_API_REPO);
  if (typeof openPlanPanel === 'function') openPlanPanel();
  setTimeout(() => { const el = document.getElementById('repo-build-start'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('bs-flash'); setTimeout(() => el.classList.remove('bs-flash'), 1400); } }, 120);
}

// §0.39.284 W4 — the sliding ink under the active tab of each bar ("make the navigation more dynamic"). It follows
// whatever marks a tab active (setView, setRepoSubtab, a group's view), so no caller has to know about it.
function _navInk(bar) {
  if (!bar) return;
  let ink = bar.querySelector(':scope > .nav-ink');
  if (!ink) { ink = document.createElement('span'); ink.className = 'nav-ink'; bar.appendChild(ink); }
  const act = bar.querySelector(':scope > .tab-btn.active, :scope > .tab-group > .tab-group-btn.active, :scope > .repo-subtab-btn.active');
  if (!act || !act.offsetParent) { ink.classList.remove('on'); return; }
  const b = bar.getBoundingClientRect(), r = act.getBoundingClientRect();
  ink.style.left = `${r.left - b.left + bar.scrollLeft + 8}px`; ink.style.width = `${Math.max(0, r.width - 16)}px`;
  ink.classList.add('on');
}
function _navInkAll() { _navInk(document.getElementById('tabbar')); _navInk(document.getElementById('repo-subnav')); }
(function _navInkWatch() {
  const start = () => {
    const mo = new MutationObserver(() => requestAnimationFrame(_navInkAll));
    for (const id of ['tabbar', 'repo-subnav']) { const el = document.getElementById(id); if (el) mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['class'] }); }
    addEventListener('resize', () => requestAnimationFrame(_navInkAll));
    document.addEventListener('transitionend', (e) => { if (e.target && e.target.classList && e.target.classList.contains('repo-wrap')) _navInkAll(); });
    _navInkAll();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// ════════════════════════════════════════════════════
// EVENT LOG
// ════════════════════════════════════════════════════
function appendEventLog(ev) {
  const log = document.getElementById('event-log');
  const time = new Date(ev.ts||Date.now()).toLocaleTimeString('en-GB',{hour12:false});
  const typeShort = (ev.type||'event').replace('idearium.','');
  const typeClass = typeShort.includes('gap')?'gap':typeShort.includes('snapshot')||typeShort.includes('push')?'snap':typeShort.includes('spec')?'spec':typeShort.includes('error')?'err':'idea';
  const div = document.createElement('div');
  div.className = 'gap-log-line';
  const payload = ev.payload || {};
  const preview = (payload.text||payload.name||payload.uuid||payload.message||'').toString().slice(0,40);
  div.innerHTML = `<span class="gl-ts">${time}</span><span class="gl-type ${typeClass}">${typeShort}</span><span style="color:var(--text3)">${preview}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 300) log.removeChild(log.firstChild);
}

// ════════════════════════════════════════════════════
// IDEAS — real schema: uuid, slug, text, tags, phase, tension,
// resonanceWith, tensionWith, openGaps, stability{...}, compartment, linkedSpec
// ════════════════════════════════════════════════════
function sortBy(s, btn) {
  CURRENT_SORT = s;
  document.querySelectorAll('#view-ideas .toolbar .mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderIdeaList();
}

function getFilteredIdeas() {
  const q = (document.getElementById('search').value||'').toLowerCase();
  let pool = IDEAS.filter(i => i.phase !== 'archived' && !ideaRepoOf(i.uuid));   // 0.39.263 — a spec's idea lives in its repo
  if (q) pool = pool.filter(i => (i.text||'').toLowerCase().includes(q) || (i.tags||[]).some(t=>t.toLowerCase().includes(q)));
  return pool.sort((a,b) => {
    if (CURRENT_SORT==='tension') return (b.tension||0)-(a.tension||0);
    if (CURRENT_SORT==='updated') return (b.updatedAt||0)-(a.updatedAt||0);
    return (a.text||'').localeCompare(b.text||'');
  });
}

function renderIdeaList() {
  const list = document.getElementById('idea-list');
  const items = getFilteredIdeas();
  list.innerHTML = '';
  // 0.39.263 — ideas that became specs are in their repos' Idea tabs; say how many, and take you there
  const inRepos = IDEAS.filter(i => i.phase !== 'archived' && ideaRepoOf(i.uuid) && !_nexusSelfIds().ideas.has(i.uuid)).length;
  const specNote = inRepos ? `<div class="ideas-in-repos" style="padding:10px 12px;font-family:var(--mono);font-size:10px;color:var(--text3);cursor:pointer" onclick="setView('repo')">${inRepos > 1 ? `${inRepos} ideas are specs — in their repos' Idea tabs →` : `1 idea is a spec — in its repo's Idea tab →`}</div>` : '';
  if (!items.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;font-family:var(--mono);font-size:11px;color:var(--text3)">${CONNECTED ? 'no ideas yet — click + idea' : 'not connected to nexus'}</div>` + specNote;
    return;
  }
  for (const idea of items) {
    const tension = idea.tension || 0;
    const card = document.createElement('div');
    const tClass = tension > 0.7 ? 't-high' : tension > 0.4 ? 't-med' : 'low';
    const openGaps = GAPS.filter(g=>g.status==='open'&&(g.between||[idea.uuid]).includes(idea.uuid));
    card.className = `idea-card ${tClass} ${idea.phase}${idea._local?' local':''}${SELECTED===idea.uuid?' selected':''}`;
    card.onclick = () => selectIdea(idea.uuid);
    const tagsHtml = (idea.tags||[]).map(t=>`<span class="ic-tag">#${t}</span>`).join('');
    const gapsHtml = openGaps.length ? `<span class="ic-gap">◆ ${openGaps.length} gap${openGaps.length>1?'s':''}</span>` : '';
    const tColor = tension>0.7?'var(--coral)':tension>0.4?'var(--amber)':'var(--mint)';
    const stab = idea.stability || {};
    const stabHtml = ['execution','runtime','effectiveness','rigidity','persistence'].map(k=>{
      const v = stab[k]!=null ? stab[k] : 1;
      return `<i style="height:${Math.max(3,v*10)}px;background:${v<0.4?'var(--coral)':v<0.7?'var(--amber)':'var(--mint)'}" title="${k}: ${v}"></i>`;
    }).join('');
    card.innerHTML = `
      <div class="ic-top">
        <div class="ic-name">${escapeHtml(idea.text||idea.slug||'untitled')}</div>
        <span class="ic-status st-${idea.phase}">${idea.phase}${idea._local?' · local':''}</span>
      </div>
      <div class="tension-row">
        <span class="tension-label">tension</span>
        <div class="tension-track"><div class="tension-fill" style="width:${tension*100}%;background:${tColor}"></div></div>
        <span class="tension-pct" style="color:${tColor}">${Math.round(tension*100)}%</span>
        <div class="stab-mini">${stabHtml}</div>
      </div>
      <div class="ic-meta">${gapsHtml}${tagsHtml}<span class="ic-uuid">${(idea.uuid||'').slice(0,8)}</span></div>
    `;
    list.appendChild(card);
  }
  if (specNote) list.insertAdjacentHTML('beforeend', specNote);
}

function selectIdea(uuid) {
  SELECTED = uuid;
  const idea = IDEAS.find(i=>i.uuid===uuid);
  if (!idea) return;
  renderIdeaList();
  renderDetail(idea);
}

function renderDetail(idea) {
  const tension = idea.tension || 0;
  const openGaps = GAPS.filter(g=>g.status==='open'&&(g.between||[idea.uuid]).includes(idea.uuid));
  const resIdeas = (idea.resonanceWith||[]).map(u=>IDEAS.find(i=>i.uuid===u)).filter(Boolean);
  const tenIdeas = (idea.tensionWith||[]).map(u=>IDEAS.find(i=>i.uuid===u)).filter(Boolean);
  const linkedSpec = idea.linkedSpec ? SPECS.find(s=>s.uuid===idea.linkedSpec) : null;

  document.getElementById('detail-title').textContent = (idea.text||idea.slug||'').slice(0,40);
  const area = document.getElementById('detail-area');
  const tColor = tension>0.7?'var(--coral)':tension>0.4?'var(--amber)':'var(--mint)';

  let html = `
    <div class="ds">
      <div class="ds-label">tension score</div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="tension-track" style="flex:1;height:5px;background:var(--bg);border-radius:3px;overflow:hidden">
          <div class="tension-fill" style="width:${tension*100}%;background:${tColor};height:100%;border-radius:3px"></div>
        </div>
        <span style="font-family:var(--mono);font-size:13px;font-weight:600;color:${tColor}">${Math.round(tension*100)}%</span>
      </div>
    </div>
    <div class="ds"><div class="ds-label">text</div><div class="ds-value">${escapeHtml(idea.text||'—')}</div></div>
    <div class="ds">
      <div class="ds-label">phase</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">
        ${IDEA_PHASES.map(p=>`<button class="action-btn${idea.phase===p?' primary':''}" onclick="setPhase('${idea.uuid}','${p}')">${p}</button>`).join('')}
      </div>
    </div>
  `;
  if ((idea.tags||[]).length) html += `<div class="ds"><div class="ds-label">tags</div><div class="tag-row">${idea.tags.map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div></div>`;
  if (idea.compartment) html += `<div class="ds"><div class="ds-label">compartment</div><div class="ds-mono">${escapeHtml(idea.compartment)}</div></div>`;

  html += `
    <div class="ds">
      <div class="ds-label">stability</div>
      <div class="pend-detail" style="background:var(--bg2);border:1px solid var(--b0);border-radius:5px;padding:10px">
        ${Object.entries(idea.stability||{}).map(([k,v])=>`<div class="pend-row" style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--b0)"><span class="pend-k" style="font-family:var(--mono);font-size:9px;color:var(--text3)">${k}</span><span class="pend-v" style="font-family:var(--mono);font-size:10px">${v}</span></div>`).join('') || '<span style="color:var(--text3);font-family:var(--mono);font-size:10px">no stability data</span>'}
      </div>
    </div>
  `;

  if (linkedSpec) {
    html += `<div class="ds"><div class="ds-label">linked spec</div><div class="link-item" style="cursor:pointer" onclick="openSpecRepo('${linkedSpec.uuid}')"><span class="link-type resonance">spec</span><span>${escapeHtml(linkedSpec.name)}</span><span class="ic-uuid" style="margin-left:auto">${linkedSpec.phase}</span></div>
      <div class="action-row"><button class="action-btn" onclick="openWorkshop('idea:${idea.uuid}')" title="work this idea's spec in the spec workshop">✎ spec workshop</button></div></div>`;
  } else {
    html += `<div class="ds"><div class="ds-label">spec</div><div class="action-row"><button class="action-btn primary" onclick="openWorkshop('idea:${idea.uuid}')" title="make this idea's spec in the spec workshop — by hand or with the agent">✎ spec workshop</button><button class="action-btn" onclick="createSpecForIdea('${idea.uuid}')">+ quick spec</button></div></div>`;
  }

  // §0.39.263 — an idea is worked here until it is a spec; then its repo's Idea tab holds the lanes
  const ideaRepo = typeof _repoOfIdea === 'function' ? _repoOfIdea(idea.uuid) : null;
  html += ideaRepo
    ? `<div class="ds"><div class="ds-label">work it</div><button class="action-btn primary" onclick="openIdeaLanes('${idea.uuid}')">it is a spec — its lanes are in its repo's Idea tab →</button></div>`
    : `<div class="ds"><div class="ds-label">work it · brainstorm · problem solving · expand · improve</div><div class="cmp-host cmp-detail"><div class="detail-empty">loading the lanes…</div></div></div>`;
  html += `<div class="ds"><div class="ds-label">repository</div><button class="action-btn" onclick="openRepoFor('${idea.uuid}', null, '${escapeHtml(idea.text||idea.uuid).replace(/'/g,"\\'").slice(0,40)}')">open repository →</button></div>`;

  if (openGaps.length) {
    html += `<div class="ds"><div class="ds-label">open gaps (${openGaps.length})</div>`;
    for (const g of openGaps) {
      html += `
        <div class="gap-item open">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span class="gap-id">${g.uuid.slice(0,8)}</span>
            <span style="font-family:var(--mono);font-size:9px" class="sev-${g.severity}">${g.severity}</span>
            <button class="action-btn" style="font-size:9px;padding:1px 6px" onclick="resolveGap('${g.uuid}')">resolve</button>
          </div>
          <div class="gap-desc">${escapeHtml(g.description)}</div>
        </div>`;
    }
    html += `</div>`;
  }

  if (resIdeas.length || tenIdeas.length) {
    html += `<div class="ds"><div class="ds-label">relationships</div>`;
    for (const r of resIdeas) html += `<div class="link-item"><span class="link-type resonance">resonance</span><span>${escapeHtml((r.text||'').slice(0,30))}</span><span class="ic-uuid" style="margin-left:auto">${r.uuid.slice(0,8)}</span></div>`;
    for (const r of tenIdeas) html += `<div class="link-item"><span class="link-type tension">tension</span><span>${escapeHtml((r.text||'').slice(0,30))}</span><span class="ic-uuid" style="margin-left:auto">${r.uuid.slice(0,8)}</span></div>`;
    html += `</div>`;
  }

  const others = IDEAS.filter(i=>i.uuid!==idea.uuid && i.phase!=='archived');
  if (others.length) {
    html += `<div class="ds"><div class="ds-label">link to another idea</div><div style="display:flex;gap:5px;flex-wrap:wrap">${others.slice(0,6).map(o=>`<button class="action-btn" onclick="linkIdeas('${idea.uuid}','${o.uuid}','resonance')" title="${escapeHtml(o.text)}">~ ${escapeHtml((o.text||'').slice(0,16))}</button>`).join('')}</div></div>`;
  }

  html += `
    <div class="ds">
      <div class="ds-label">actions</div>
      <div class="action-row">
        <button class="action-btn" onclick="openGapPrompt('${idea.uuid}')">open gap</button>
        <button class="action-btn danger" onclick="archiveIdea('${idea.uuid}')">archive</button>
      </div>
    </div>
    <div class="ds"><div class="ds-label">identity</div><div class="ds-mono">${idea.uuid}\n${idea.slug||''}\ncreated ${idea.createdAt?new Date(idea.createdAt).toLocaleString():'—'}\nupdated ${idea.updatedAt?new Date(idea.updatedAt).toLocaleString():'—'}</div></div>
  `;
  area.innerHTML = html;
  if (!ideaRepo && typeof openCompartmentIdea === 'function') openCompartmentIdea(idea.uuid, { quiet: true, keepLane: typeof WBC !== 'undefined' && WBC.ideaUuid === idea.uuid });
}

async function setPhase(uuid, phase) {
  try { await api(`/api/ideas/${uuid}/phase`, { method:'POST', body: JSON.stringify({phase}) }); toast(`phase → ${phase}`,'ok'); await loadIdeas(); }
  catch(e) { toast(e.message,'err'); }
}
async function linkIdeas(fromUuid, toUuid, linkType='resonance') {
  try { await api(`/api/ideas/${fromUuid}/link`, { method:'POST', body: JSON.stringify({toUuid, linkType}) }); toast('linked','ok'); await loadIdeas(); }
  catch(e) { toast(e.message,'err'); }
}
async function archiveIdea(uuid) {
  const reason = await themedPrompt('archive reason (required — §M1, nothing deleted):', 'archive idea');
  if (!reason) return;
  try { await api(`/api/ideas/${uuid}`, { method:'DELETE', body: JSON.stringify({reason}) }); SELECTED=null; document.getElementById('detail-area').innerHTML='<div class="detail-empty">idea archived</div>'; toast('archived','ok'); await loadIdeas(); }
  catch(e) { toast(e.message,'err'); }
}
// §NEW 2026-07-16 — nothing on disk is destroyed (spec-engine/index.js's
// deleteSpec just flips a flag — same §7.4/§M1 pattern as archiveIdea
// above), so this doesn't need a themedPrompt reason like archiveIdea does.
// A plain confirm() is enough since it's reversible via restoreSpec.
// §CHANGED 2026-09-21 — reached from the repo's Spec subtab now, not a
// library card. It is also the one way to STOP a spec being built: idearium's
// build-queue poller (api/index.js _startBuildQueuePoller) skips soft-deleted
// specs and nothing else, so archiving the repo alone does not stop pending
// chunks being dispatched. The repo record stays; loadSpecs() then re-renders
// the Spec subtab, which shows the removed state with a restore button.
async function deleteSpec(uuid, name) {
  // §0.39.266 (D2) — removing a spec deletes it; the one exception is a spec that is a live repo's content.
  if (!confirm(`remove spec "${name}"?\n\nit is deleted from disk. if it is a repo's content, it is only stopped, and goes when the repo is deleted.`)) return;
  try {
    const r = await api(`/api/spec-engine/specs/${uuid}`, { method: 'DELETE' });
    if (SELECTED_SPEC === uuid) SELECTED_SPEC = null;
    toast(r.purged ? 'spec deleted' : (r.note || 'spec stopped'), 'ok');
    await loadSpecs();
  } catch(e) { toast(e.message, 'err'); }
}
async function restoreSpec(uuid) {
  try { await api(`/api/spec-engine/specs/${uuid}/restore`, { method: 'POST' }); toast('restored', 'ok'); await loadSpecs(); }
  catch(e) { toast(e.message, 'err'); }
}
// §NEW 2026-07-16 — legacy specs (no .chunks — the pre-spec-engine
// 9-section format) live in a different store than deleteSpec() above
// covers, and follow the same §M1 "reason required, nothing deleted"
// convention as archiveIdea. Separate function because the requirement
// (reason) and the endpoint (/api/specs, not /api/spec-engine/specs) both
// differ from the spec-engine path.
async function archiveSpec(uuid, name) {
  const reason = await themedPrompt('archive reason (required — §M1, nothing deleted):', `archive "${name}"`);
  if (!reason) return;
  try {
    await api(`/api/specs/${uuid}`, { method: 'DELETE', body: JSON.stringify({reason}) });
    if (SELECTED_SPEC === uuid) SELECTED_SPEC = null;
    toast('archived', 'ok');
    await loadSpecs();
  } catch(e) { toast(e.message, 'err'); }
}
async function openGapPrompt(ideaUuid) {
  const description = await themedPrompt('gap description:', 'open gap');
  if (!description) return;
  openGap({ description, ideaUuid, type:'unresolved', severity:'medium' });
}
async function openGap({description, ideaUuid, type, severity}) {
  try { await api('/api/gaps', { method:'POST', body: JSON.stringify({description, ideaUuid, type, severity, between:ideaUuid?[ideaUuid]:[]}) }); toast('gap opened','ok'); await loadGaps(); if(SELECTED) renderDetail(IDEAS.find(i=>i.uuid===SELECTED)); }
  catch(e) { toast(e.message,'err'); }
}
async function resolveGap(uuid) {
  try { await api(`/api/gaps/${uuid}/resolve`, { method:'POST', body: JSON.stringify({resolution:'resolved via UI'}) }); toast('gap resolved','ok'); await loadGaps(); if(SELECTED) renderDetail(IDEAS.find(i=>i.uuid===SELECTED)); }
  catch(e) { toast(e.message,'err'); }
}

function openModal(){ document.getElementById('modal').classList.add('open'); document.getElementById('f-text').focus(); }
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
function openSpecChoice(){ document.getElementById('spec-choice-modal').classList.add('open'); }
function closeSpecChoice(){ document.getElementById('spec-choice-modal').classList.remove('open'); }

// Themed replacement for window.prompt() — same contract (resolves to the
// entered string, or null on cancel/empty) so call sites just add `await`.
let _promptResolve = null;
function themedPrompt(label, title='input') {
  document.getElementById('prompt-modal-title').textContent = title;
  document.getElementById('prompt-modal-label').textContent = label;
  const input = document.getElementById('prompt-modal-input');
  input.value = '';
  document.getElementById('prompt-modal').classList.add('open');
  setTimeout(() => input.focus(), 50);
  return new Promise(resolve => { _promptResolve = resolve; });
}
function closePromptModal(value) {
  document.getElementById('prompt-modal').classList.remove('open');
  if (_promptResolve) { _promptResolve(value && value.trim() ? value.trim() : null); _promptResolve = null; }
}

async function submitIdea() {
  const text = document.getElementById('f-text').value.trim();
  if (!text || text.length < 3) { toast('text must be ≥3 chars','err'); return; }
  const tags = document.getElementById('f-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  const compartment = document.getElementById('f-compartment').value.trim() || null;
  try {
    const res = await api('/api/ideas', { method:'POST', body: JSON.stringify({text, tags, compartment}) });
    closeModal();
    ['f-text','f-tags','f-compartment'].forEach(id=>document.getElementById(id).value='');
    await loadIdeas();
    setView('ideas');
    if (res.idea) selectIdea(res.idea.uuid);
    toast('idea logged','ok');
  } catch(e) { toast(e.message,'err'); }
}

async function doSnapshot() {
  if (!CONNECTED) { toast('not connected to nexus','err'); return; }
  const msg = document.getElementById('snap-msg').value.trim() || 'snapshot';
  try {
    const res = await api('/api/snapshots', { method:'POST', body: JSON.stringify({message: msg}) });
    document.getElementById('snap-msg').value='';
    document.getElementById('snap-latest').textContent = res.snapshot ? res.snapshot.commitId : '';
    toast(`snapshot pushed`,'ok');
    await loadSnapshots();
  } catch(e) { toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════
// BRAINSTORM — quick-capture (genuinely user-authored, not seeded),
// promotable into a real tracked idea via POST /api/ideas.
// §CHANGED 2026-09-03 — James: "idearium needs to use data folder. no DOM
// storage." Was entirely localStorage; every write now goes through the
// real idearium_brainstorms table (api/index.js's brainstorm.* handlers).
// Same UX, same function names, real backend underneath.
// ════════════════════════════════════════════════════
async function addBrainstorm() {
  const text = document.getElementById('brain-text').value.trim();
  if (!text) { toast('write something first','err'); return; }
  const tags = document.getElementById('brain-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
  try {
    await api('/api/brainstorms', { method: 'POST', body: JSON.stringify({ text, tags }) });
    document.getElementById('brain-text').value=''; document.getElementById('brain-tags').value='';
    await loadBrainstorms();
  } catch(e) { toast(e.message, 'err'); }
}
async function deleteBrainstorm(id) {
  try { await api(`/api/brainstorms/${id}`, { method: 'DELETE' }); await loadBrainstorms(); }
  catch(e) { toast(e.message, 'err'); }
}
async function promoteBrainstorm(id) {
  if (!CONNECTED) { toast('connect to nexus to promote','err'); return; }
  try {
    const r = await api(`/api/brainstorms/${id}/promote`, { method: 'POST' });
    await loadBrainstorms();
    await loadIdeas();
    toast('promoted — work it in Ideas','ok');
    // §0.39.263 — a promoted brainstorm is an idea (not a spec, no repo): its lanes are in its Ideas detail
    if (r.idea?.uuid && typeof openIdeaLanes === 'function') openIdeaLanes(r.idea.uuid);
  } catch(e) { toast(e.message,'err'); }
}
function renderBrainstorms() {
  const grid = document.getElementById('brain-grid');
  if (!BRAINSTORMS.length) { grid.innerHTML = `<div class="detail-empty" style="grid-column:1/-1">no brainstorms yet — capture a raw thought above</div>`; return; }
  grid.innerHTML = BRAINSTORMS.map(b => `
    <div class="brain-card">
      <div class="brain-card-text">${escapeHtml(b.text)}</div>
      <div class="brain-card-meta">
        ${(b.tags||[]).map(t=>`<span class="ic-tag">#${escapeHtml(t)}</span>`).join('')}
        <span class="brain-ts">${new Date(b.ts).toLocaleString()}</span>
      </div>
      <div class="action-row">
        ${b.promoted ? (b.ideaUuid ? `<button class="action-btn" style="color:var(--mint)" onclick="openIdeaLanes('${b.ideaUuid}')">promoted ✓ · open the idea →</button>` : `<span class="ic-tag" style="color:var(--mint)">promoted ✓</span>`) : `<button class="action-btn primary" onclick="promoteBrainstorm('${b.uuid}')">promote → idea</button>`}
        ${b.promoted ? '' : `<button class="action-btn" onclick="assistBrainstormCard('${b.uuid}')">✨ refine</button>`}
        <button class="action-btn" onclick='openNewSpecModal({name:${JSON.stringify(b.text.slice(0,60))}, description:${JSON.stringify(b.text)}})'>+ spec</button>
        <button class="action-btn danger" onclick="deleteBrainstorm('${b.uuid}')">discard</button>
      </div>
      <div class="brain-assist-preview" id="brain-assist-card-${b.uuid}" style="display:none"></div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════
// BRAINSTORM AI ASSISTANCE — James: "brainstorm should have full ai
// assistance." Routes through the real, already-wired copilot-adapter
// gate (POST /api/copilot/suggest — idearium/copilot-adapter/index.js's
// own real backend, copilot's adaptive-fulfillment endpoint at :3750).
// That gate existed with zero UI callers anywhere in this file before
// this — its own comment claimed "the wizard's 'ask copilot' button
// hits this," but no such button existed (checked directly). Preview-
// first everywhere: a suggestion is shown, never silently applied —
// same discipline as autofill's fill preview and screen-qa's
// answer/inject split.
// ════════════════════════════════════════════════════
async function _askCopilotSuggest(goal, currentGate) {
  const r = await api('/api/copilot/suggest', { method: 'POST', body: JSON.stringify({ goal, current_gate: currentGate, context: {} }) });
  if (r.connected === false) return { ok: false, error: r.reason || 'no copilot backend connected' };
  const text = (r.suggestions || [])[0];
  if (!text) return { ok: false, error: r.reason || 'copilot returned no suggestion' };
  return { ok: true, text };
}

function _renderAssistPreview(el, { loading, ok, text, error, onUse }) {
  el.style.display = '';
  if (loading) { el.innerHTML = `<div class="bap-label">✨ copilot</div>thinking…`; return; }
  if (!ok) { el.innerHTML = `<div class="bap-label">✨ copilot</div><span class="bap-err">${escapeHtml(error)}</span><div class="bap-actions"><button class="action-btn" onclick="this.closest('.brain-assist-preview').style.display='none'">dismiss</button></div>`; return; }
  el.innerHTML = `<div class="bap-label">✨ copilot suggests</div>${escapeHtml(text)}<div class="bap-actions"></div>`;
  const btnUse = document.createElement('button');
  btnUse.className = 'action-btn primary'; btnUse.textContent = 'use this';
  btnUse.onclick = () => onUse(text);
  const btnDismiss = document.createElement('button');
  btnDismiss.className = 'action-btn'; btnDismiss.textContent = 'dismiss';
  btnDismiss.onclick = () => { el.style.display = 'none'; };
  el.querySelector('.bap-actions').append(btnUse, btnDismiss);
}

async function assistBrainstormDraft() {
  const draft = document.getElementById('brain-text').value.trim();
  if (!draft) { toast('write a raw thought first', 'err'); return; }
  const el = document.getElementById('brain-assist-preview');
  _renderAssistPreview(el, { loading: true });
  const r = await _askCopilotSuggest(draft, 'brainstorm');
  _renderAssistPreview(el, { ok: r.ok, text: r.text, error: r.error, onUse: (text) => {
    document.getElementById('brain-text').value = text;
    el.style.display = 'none';
  }});
}

async function assistBrainstormCard(uuid) {
  const b = BRAINSTORMS.find(x => x.uuid === uuid);
  if (!b) return;
  const el = document.getElementById(`brain-assist-card-${uuid}`);
  _renderAssistPreview(el, { loading: true });
  const r = await _askCopilotSuggest(b.text, 'brainstorm');
  _renderAssistPreview(el, { ok: r.ok, text: r.text, error: r.error, onUse: async (text) => {
    // The refined text is used to promote directly — see brainstorm.promote's
    // optional body.text (§BUILT 2026-09-21): the stored row is updated to
    // match what was actually promoted, not left silently diverging.
    if (!CONNECTED) { toast('connect to nexus to promote', 'err'); return; }
    try {
      const r = await api(`/api/brainstorms/${uuid}/promote`, { method: 'POST', body: JSON.stringify({ text }) });
      await loadBrainstorms();
      await loadIdeas();
      toast('promoted — work it in Ideas', 'ok');
      if (r.idea?.uuid && typeof openIdeaLanes === 'function') openIdeaLanes(r.idea.uuid);
    } catch (e) { toast(e.message, 'err'); }
  }});
}

// ════════════════════════════════════════════════════
// SPEC LIBRARY / BUILDER / COMPILER
// real schema: {uuid,name,version,ideaUuid,phase,sections[{id,title,complete,required,content}],modules,wired,buildOrder}
// confidence + gap analysis computed client-side from real section completeness
// ════════════════════════════════════════════════════
let BUILDER_ACTIVE_SECTION = SECTION_IDS[0];

function specConfidence(spec) {
  const secs = spec.sections || [];
  if (!secs.length) return 0;
  const filled = secs.filter(s=>s.content && s.content.trim().length>0).length;
  return Math.round((filled/secs.length)*100);
}
function specGaps(spec) {
  return (spec.sections||[]).filter(s=>s.required && (!s.content || !s.content.trim()));
}

// §REMOVED 2026-09-21 — renderSpecList() (the Build > Spec Library card list)
// lived here. Specs are repos in compartments now; the Repos tab is the list.
//
// selectSpec() no longer navigates or drives a list — it points the builder at
// a spec. The builder mount (#spec-builder) is inside the repo Spec subtab, so
// this is only meaningful while that subtab is showing; every existing caller
// (createRepoThenBuild, the legacy save/check/build handlers) is already
// running inside it.
function selectSpec(uuid) {
  SELECTED_SPEC = uuid;
  const spec = SPECS.find(s=>s.uuid===uuid);
  if (!spec) return;
  BUILDER_ACTIVE_SECTION = (spec.sections||[])[0]?.id || SECTION_IDS[0];
  renderSpecBuilder(spec);
}

// Idea detail's "linked spec" row, and anything else that has a spec uuid and
// wants the person looking at it: a spec is a repo, so open that repo on its
// Spec subtab. A spec with no repo (a legacy 9-section spec, or one not yet
// reconciled) has nowhere to open, and says so instead of failing silently.
function openSpecRepo(specUuid) {
  const spec = SPECS.find(s => s.uuid === specUuid);
  const repo = API_REPOS.find(r => r.specUuid === specUuid || r.promotedFromSpec === specUuid);
  if (!repo) { toast(`"${spec?.name || specUuid}" has no repository yet — restart idearium so it is adopted into a compartment`, 'err'); return; }
  openRepoFor(spec?.ideaUuid || null, specUuid, spec?.name || repo.name);
  setRepoSubtab('spec');
}

function renderSpecBuilder(spec) {
  // §BUG FIXED 2026-07-11 — every spec in SPECS renders through this
  // function regardless of origin, but saveSection/checkSpec/buildSpec
  // below all call the LEGACY-only /api/specs/:uuid/* endpoints. A
  // spec-engine spec's uuid was never in os.db.specs, so those calls
  // either 404'd or silently did nothing — the action buttons looked
  // present and did nothing real. `.chunks` only exists on spec-engine
  // manifests (spec.list's merge spreads the raw manifest in) — use it
  // as the discriminator and render a genuinely different, working
  // action row for that case instead of the legacy one.
  if (Array.isArray(spec.chunks)) return renderSpecEngineBuilder(spec);

  const conf = specConfidence(spec);
  const gaps = specGaps(spec);
  const sec = (spec.sections||[]).find(s=>s.id===BUILDER_ACTIVE_SECTION) || {};
  const wrap = document.getElementById('spec-builder');
  wrap.innerHTML = `
    <div class="builder-section-tabs">
      ${(spec.sections||[]).map(s=>`<button class="sec-tab ${s.id===BUILDER_ACTIVE_SECTION?'active':''} ${s.content?'filled':''}" onclick="switchSection('${spec.uuid}','${s.id}')">${s.id.replace(/_/g,' ')}</button>`).join('')}
    </div>
    <div class="builder-body">
      <div class="ds" style="margin-bottom:0">
        <div class="ds-label">compiler — confidence &amp; gap analysis</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="tension-track" style="flex:1;height:6px"><div class="tension-fill" style="width:${conf}%;background:${conf>70?'var(--mint)':conf>35?'var(--amber)':'var(--coral)'}"></div></div>
          <span style="font-family:var(--mono);font-size:12px;font-weight:600">${conf}%</span>
        </div>
        ${gaps.length?`<div style="margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--coral)">missing required: ${gaps.map(g=>g.id).join(', ')}</div>`:'<div style="margin-top:8px;font-family:var(--mono);font-size:10px;color:var(--mint)">all required sections filled</div>'}
      </div>
      <div class="field-group">
        <div class="field-label">${sec.id ? sec.id.replace(/_/g,' ') : 'section'} — ${sec.required?'required':'optional'}</div>
        <textarea class="builder-textarea" id="builder-content" placeholder="write this SEAM section...">${escapeHtml(sec.content||'')}</textarea>
      </div>
      <div class="action-row">
        <button class="action-btn primary" onclick="saveSection('${spec.uuid}')">save section</button>
        <button class="action-btn" onclick="checkSpec('${spec.uuid}')">run spec check</button>
        <button class="action-btn" onclick="buildSpec('${spec.uuid}')">compile / build</button>
        <button class="action-btn" onclick="exportSpec('${spec.uuid}')">export markdown</button>
        <button class="action-btn" onclick="openRepoFor('${spec.ideaUuid||''}', '${spec.uuid}', '${escapeHtml(spec.name).replace(/'/g,"\\'").slice(0,40)}')">open repository →</button>
        <button class="action-btn danger" onclick="archiveSpec('${spec.uuid}', '${escapeHtml(spec.name).replace(/'/g,"\\'").slice(0,40)}')">archive</button>
      </div>
    </div>
  `;
}
// §NEW 2026-07-11 — the working action row for a spec-engine spec: real
// chunk status (not the legacy 9-section grid), a build-all-and-promote
// one-click flow ("have it build the repository — end-state"), and an
// open-repository link once one exists. Read-only chunk list for now —
// spec-engine chunks are agent/template-built, not hand-edited inline
// the way legacy sections are; editing an individual chunk's content is
// a real follow-up, not something this pass claims to do.
function renderSpecEngineBuilder(spec) {
  const wrap = document.getElementById('spec-builder');
  const chunks = spec.chunks || [];
  const done = chunks.filter(c => c.status === 'complete').length;
  const pct = chunks.length ? Math.round(done / chunks.length * 100) : 0;
  // §CHANGED 2026-09-03 — was `r.promotedFromSpec === spec.uuid`, which
  // only matches repos created via the completion-gated /promote path.
  // Repo-first shells (created at spec creation, submitNewSpec above) set
  // specUuid but never promotedFromSpec — specUuid is the real, always-set
  // correlation field either way (RepoLayer.ingest sets it on every path),
  // so it's the correct match regardless of how the repo came to exist.
  const building = !!BUILD_IN_PROGRESS[spec.uuid];

  wrap.innerHTML = `
    <div class="builder-body">
      <div class="ds" style="margin-bottom:0">
        <div class="ds-label" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>spec-engine — ${escapeHtml((spec.templateIds||[]).join(', ') || 'no template')} · build logic: ${escapeHtml(spec.buildEngine||'auto')}</span>
          ${buildCompiledBadgeHtml(spec.uuid)}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="tension-track" style="flex:1;height:6px"><div class="tension-fill" style="width:${pct}%;background:${pct===100?'var(--mint)':'var(--amber)'}"></div></div>
          <span style="font-family:var(--mono);font-size:12px;font-weight:600">${done}/${chunks.length}</span>
        </div>
      </div>
      <div class="field-group">
        <div class="field-label">chunks</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${chunks.map(c => `
            <div style="display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;padding:4px 0;border-bottom:1px solid var(--b0)">
              <span style="color:${c.status==='complete'?'var(--mint)':c.status==='building'?'var(--amber)':'var(--text3)'}">${c.status==='complete'?'✓':c.status==='building'?'…':'○'}</span>
              <span style="flex:1;color:var(--text2)">${escapeHtml(c.sectionId)}</span>
              ${
                // §BUILT 2026-09-03 — James: "send each chunk to the
                // respectable agent... needs to have a drop for the agent
                // to send it to." Was static text (c.agent||''). Only
                // PENDING chunks are editable — matches setChunkAgent()'s
                // own real refusal (spec-engine/index.js) on anything past
                // PENDING, so the UI never offers a change the backend
                // would reject; a chunk that's already building/complete
                // shows its real, already-fixed agent as text instead.
                c.status === 'pending'
                  ? `<select class="agent-select" style="font-family:var(--mono);font-size:11px;background:var(--bg2,#1a1a1a);color:var(--text2);border:1px solid var(--b0);border-radius:3px;padding:1px 4px" onchange="setChunkAgent('${spec.uuid}','${c.uuid}',this.value)">
                      <option value="" ${c.agentPinned?'':'selected'} title="the repo's Agent-tab switch and hat; a spec with no repo uses ${escapeHtml(c.agent||'its own agent')} wearing the_builder">default</option>
                      ${AGENT_OPTIONS.map(a => `<option value="${a}" ${c.agentPinned&&a===c.agent?'selected':''}>${a}</option>`).join('')}
                    </select>`
                  : `<span style="color:var(--text3)">${escapeHtml(c.agent||'')}${c.agentModel&&c.agentModel.startsWith('template')?' (template)':''}</span>`
              }
              ${
                // §BUILT 2026-09-03 — the chunk's own real return address
                // while it's genuinely in flight (jobId/dispatchDir, set
                // by spec-engine's recordDispatchJob the instant a queued
                // job exists on guardian's side). This is the visibility
                // James was asking for: is a 'building' chunk actually
                // moving, or stuck with nothing anyone can see. A chunk
                // still 'building' with no jobId is the local-ollama path
                // (synchronous, no guardian job to track) — shown plainly
                // as 'local', not blank, so the absence reads as real
                // information, not a missed field.
                c.status === 'building'
                  ? `<span title="${c.dispatchDir ? escapeHtml(c.dispatchDir) : ''}" style="color:var(--amber);font-size:10px">${c.jobId ? `job:${escapeHtml(String(c.jobId)).slice(0,10)}` : 'local'}</span>`
                  : ''
              }
            </div>`).join('')}
        </div>
      </div>
      <div class="field-group">
        <div class="field-label">build history</div>
        <div id="spec-history-panel">${buildSpecHistoryHtml(spec.uuid)}</div>
      </div>
      <div class="action-row">
        ${
          // §0.39.265 — James: "now what? no code actually generated." A finished
          // document spec's next step is its code: Generate code plans the files
          // from the spec and builds each one (speceng.codegen → a code spec).
          done === chunks.length && chunks.length && !spec.fileTree && !building
            ? ((spec.codeSpecUuid && SPECS.some(s => s.uuid === spec.codeSpecUuid))   // §0.39.280 BS15 — a code spec that is gone offers a new one
                ? `<button class="action-btn primary" onclick="openCodeSpec('${spec.uuid}')">open the code →</button>`
                : `<button class="action-btn primary" id="codegen-btn" onclick="generateCode('${spec.uuid}')">generate code →</button>`)
            : `<button class="action-btn primary" ${building||done===chunks.length?'disabled':''} onclick="createRepoThenBuild('${spec.uuid}')">${building?'building…':(done===chunks.length?(spec.fileTree?'all files built':'all chunks built'):(spec.fileTree?'build remaining files':'build remaining chunks'))}</button>`
        }
        ${spec.codeFor ? `<button class="action-btn" onclick="selectSpec('${spec.codeFor}')">← the spec it came from</button>` : ''}
        <button class="action-btn" onclick="exportSpec('${spec.uuid}')">export markdown</button>
        <button class="action-btn danger" onclick="deleteSpec('${spec.uuid}', '${escapeHtml(spec.name).replace(/'/g,"\\'").slice(0,40)}')">remove spec (stops building)</button>
      </div>
    </div>
  `;
  renderSpecHistoryPanel(spec.uuid); // async — fills in the badge + panel above once the fetch resolves
}

// §BUILT 2026-09-03 — real, dispatchable agents (agent-suite/index.js's
// REAL_GUARDIAN_PROVIDERS + the two local paths, ollama/mistral — same
// list buildChunkWithAgent() actually checks against). Not a guess: an
// agent offered here that agent-suite doesn't recognize would be a UI
// promising a destination that doesn't exist.
// §0.39.267 — filled from GET /api/agent-providers (lib/agent-providers.js: copilot, ollama, and every guardian agent on
// disk). This literal is only what shows before that answers.
let AGENT_OPTIONS = ['copilot', 'ollama', 'claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];
let _AGENT_OPTIONS_LOADED = false;
async function loadAgentOptions() {
  if (_AGENT_OPTIONS_LOADED) return;
  try { const r = await api('/api/agent-providers'); if (r && Array.isArray(r.providers) && r.providers.length) { AGENT_OPTIONS = r.providers; _AGENT_OPTIONS_LOADED = true; } } catch (_) {}
}

// §BUILT 2026-09-03 — per-chunk agent reassignment, PENDING chunks only
// (the select in renderSpecEngineBuilder only renders for pending chunks
// in the first place, so this mirrors the backend's own real refusal
// rather than introducing a second place that decides it).
async function setChunkAgent(specUuid, chunkUuid, agent) {
  try {
    await api(`/api/spec-engine/specs/${specUuid}/chunk/${chunkUuid}/agent`, {
      method: 'POST', body: JSON.stringify({ agent }),
    });
    await loadSpecs();
    const spec = SPECS.find(s => s.uuid === specUuid);
    if (spec) renderSpecBuilder(spec);
  } catch (e) { toast(e.message, 'err'); }
}

// specUuid -> true while a build loop is running, so the button can't be
// double-clicked into two concurrent loops.
let BUILD_IN_PROGRESS = {};

// §RENAMED 2026-09-03 — was buildAllAndPromote. Repo-first (submitNewSpec
// creates the repo shell the moment the spec exists, RepoLayer._enrich
// reads live off specUuid) means there is no longer a separate "promote"
// step at the end of a successful build — the repo already IS this spec,
// chunks appear in it as they land. This function's only job now is
// driving the build loop (WARP cache / cross-spec reuse / real per-chunk
// agent dispatch, whichever resolves each chunk) to completion, plus one
// self-heal: a spec created before this change (or whose repo-first call
// failed at creation time) has no repo yet — create it here, once, before
// looping, rather than leaving it permanently repo-less.
async function createRepoThenBuild(specUuid) {
  if (BUILD_IN_PROGRESS[specUuid]) return;
  BUILD_IN_PROGRESS[specUuid] = true;
  selectSpec(specUuid);
  try {
    const spec0 = SPECS.find(s => s.uuid === specUuid);
    const hasRepo = API_REPOS.some(r => r.specUuid === specUuid);
    if (!hasRepo && spec0) {
      try {
        await api('/api/repos', {
          method: 'POST',
          body: JSON.stringify({ name: spec0.name, specUuid, source: 'repo-first' }),
        });
        await loadApiRepos();
      } catch (e) { toast(`repo shell failed, building anyway: ${e.message}`, 'err'); }
    }

    const MAX_STEPS = 40; // generous ceiling — a stuck loop must stop, not spin (§1.2)
    for (let i = 0; i < MAX_STEPS; i++) {
      const spec = SPECS.find(s => s.uuid === specUuid);
      const pending = (spec?.chunks || []).filter(c => c.status !== 'complete');
      if (!pending.length) break;

      const res = await api(`/api/spec-engine/specs/${specUuid}/build`, { method: 'POST', body: JSON.stringify({}) });
      if (res.done) break;
      // building/queued chunks resolve async server-side (SSE-driven) —
      // give it a moment before checking again rather than hammering.
      await new Promise(r => setTimeout(r, 1200));
      await loadSpecs();
      const fresh = SPECS.find(s => s.uuid === specUuid);
      if (fresh) renderSpecBuilder(fresh);
    }

    await loadSpecs();
    const spec = SPECS.find(s => s.uuid === specUuid);
    const stillPending = (spec?.chunks || []).filter(c => c.status !== 'complete' && c.status !== 'building');
    if (stillPending.length) {
      toast(`build stopped — ${stillPending.length} chunk(s) still pending (${stillPending.map(c=>c.sectionId).join(', ')})`, 'err');
      renderSpecBuilder(spec);
      return;
    }

    toast(spec && !spec.fileTree && !spec.codeSpecUuid ? 'all chunks built — next: generate code' : 'all chunks built', 'ok');
    await loadApiRepos();
    if (spec?.ideaUuid) await loadIdeas(); // phase just advanced
    openRepoFor(spec?.ideaUuid || null, specUuid, spec?.name || '');
  } catch (e) {
    toast(`build failed: ${e.message}`, 'err');
  } finally {
    BUILD_IN_PROGRESS[specUuid] = false;
    const spec = SPECS.find(s => s.uuid === specUuid);
    if (spec) renderSpecBuilder(spec);
  }
}

// §0.39.265 — Generate code. The spec (purpose, schema, api, build order, tests…)
// is condensed into the project description; the agent plans the file tree
// from it (kernel → engine → runtime → test); each file is then built as real
// code into a new "<name> · code" repo by the same build loop the spec used.
async function generateCode(specUuid) {
  if (!CONNECTED) { toast('connect to nexus first', 'err'); return; }
  const btn = document.getElementById('codegen-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'planning the files…'; }
  toast('planning the files from the spec — this asks the agent, give it a minute', 'ok');
  let r;
  try { r = await api(`/api/spec-engine/specs/${specUuid}/codegen`, { method: 'POST', body: JSON.stringify({}) }, 600000); }
  catch (e) {
    toast(`could not plan the code: ${e.message}`, 'err');
    if (btn) { btn.disabled = false; btn.textContent = 'generate code →'; }
    return;
  }
  const code = r.manifest;
  const n = (code.chunks || []).length, pre = (code.chunks || []).filter(c => c.status === 'complete').length;
  toast(r.existing ? 'opening the code that was already generated' : `${n} file(s) planned${r.plan && r.plan.planSource ? ` (${r.plan.planSource})` : ''}${pre ? ` · ${pre} from templates` : ''} — building them now`, 'ok');
  // §0.39.284 — show the build as it happens: the Plan panel lists each file and its state
  setTimeout(() => { if (typeof openPlanPanel === 'function' && CURRENT_API_REPO) openPlanPanel(); }, 1200);
  await loadSpecs();
  await loadApiRepos();
  selectSpec(code.uuid);
  if (!r.existing || (code.chunks || []).some(c => c.status !== 'complete')) createRepoThenBuild(code.uuid);
}
function openCodeSpec(specUuid) {
  const spec = SPECS.find(s => s.uuid === specUuid);
  if (spec && spec.codeSpecUuid && SPECS.some(s => s.uuid === spec.codeSpecUuid)) return selectSpec(spec.codeSpecUuid);
  generateCode(specUuid);   // the code spec is gone or not loaded — the route returns (or re-plans) it
}

function switchSection(uuid, sectionId) {
  BUILDER_ACTIVE_SECTION = sectionId;
  const spec = SPECS.find(s=>s.uuid===uuid);
  if (spec) renderSpecBuilder(spec);
}
async function saveSection(uuid) {
  const spec = SPECS.find(s=>s.uuid===uuid); if (!spec) return;
  const content = document.getElementById('builder-content').value;
  const sections = (spec.sections||[]).map(s=>s.id===BUILDER_ACTIVE_SECTION ? {...s, content, complete: content.trim().length>0} : s);
  try { await api(`/api/specs/${uuid}`, { method:'PATCH', body: JSON.stringify({sections}) }); toast('section saved','ok'); await loadSpecs(); selectSpec(uuid); }
  catch(e) { toast(e.message,'err'); }
}
async function checkSpec(uuid) {
  try { await api(`/api/specs/${uuid}/check`, { method:'POST' }); toast('spec check run','ok'); await loadSpecs(); selectSpec(uuid); }
  catch(e) { toast(e.message,'err'); }
}
async function buildSpec(uuid) {
  try {
    const res = await api(`/api/specs/${uuid}/build`, { method:'POST' });
    toast(res.message || res.status, res.status==='built'?'ok':'err');
    await loadSpecs(); selectSpec(uuid);
  } catch(e) { toast(e.message,'err'); }
}
async function exportSpec(uuid) {
  try {
    const r = await fetchTimeout(API_BASE + `/api/specs/${uuid}/export`);
    const md = await r.text();
    const blob = new Blob([md], {type:'text/markdown'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const spec = SPECS.find(s=>s.uuid===uuid);
    a.download = (spec?.name||'spec').replace(/[^a-z0-9-]/gi,'_') + '.spec.md';
    a.click();
    toast('exported','ok');
  } catch(e) { toast(e.message,'err'); }
}
function newSpecPrompt() {
  openNewSpecModal();
}

// ════════════════════════════════════════════════════
// NEW SPEC MODAL — template picker (architecture/schemas/checklists/axioms/
// compartments/genesis/...) + WARP build-logic selector, wired to the real
// spec-engine (GET/POST /api/spec-engine/...). "Map to repo now" is not a
// separate backend action — it's create → spec.promote(mode:'manual') in
// one click, which is exactly what the compartments/axioms templates are
// designed for: their seeded chunks (meta/purpose/axioms/integration) are
// enough to promote immediately, everything else lands as a TODO in the
// repo skeleton until a follow-up spec fills it in.
// ════════════════════════════════════════════════════
let NS_TEMPLATES = null;
let NS_IDEA_UUID = null; // set when opened from an idea, so the created repo can be linked later

async function loadNewSpecTemplates() {
  if (NS_TEMPLATES) return NS_TEMPLATES;
  try {
    const r = await api('/api/spec-engine/templates');
    NS_TEMPLATES = r.templates || r.data || r || [];
  } catch (e) { NS_TEMPLATES = []; }
  return NS_TEMPLATES;
}

async function openNewSpecModal({ name = '', description = '', ideaUuid = null } = {}) {
  NS_IDEA_UUID = ideaUuid;
  document.getElementById('ns-name').value = name;
  document.getElementById('ns-description').value = description;
  document.getElementById('ns-build-engine').value = 'auto';

  const templates = await loadNewSpecTemplates();
  const wrap = document.getElementById('ns-templates');
  // §FILE-TREE-FIRST 2026-09-21 — grouped: COS templates (real files, start
  // a file tree), COS blueprints (several roles), spec-document templates.
  const row = t => `
    <label class="ns-tpl-row" data-src="${escapeHtml(t.source || 'spec')}" style="display:flex;align-items:flex-start;gap:8px;padding:4px 2px;cursor:pointer;font-size:11px;color:var(--text2)">
      <input type="checkbox" class="ns-tpl-check" value="${escapeHtml(t.id)}" onchange="onNewSpecTemplateChange()" style="margin-top:2px" ${t.id === 'genesis' ? 'checked' : ''}>
      <span><b style="color:var(--text)">${escapeHtml(t.label||t.id)}</b>${t.id === 'genesis' ? ' <span style="color:var(--nx-ok, var(--mint))">· default</span>' : ''}${t.hasSeed ? ' <span style="color:var(--mint)">· deterministic</span>' : ''}${typeof t.fileCount === 'number' ? ` <span style="color:var(--text3)">· ${t.fileCount} file${t.fileCount === 1 ? '' : 's'}</span>` : ''}<br>
      <span style="color:var(--text3)">${escapeHtml(t.description||'')}</span></span>
    </label>`;
  const groups = [
    ['COS archetypes — one compartment, real starting files', templates.filter(t => t.source === 'cos-archetype')],
    ['COS blueprints — several roles, one directory each', templates.filter(t => t.source === 'cos-blueprint')],
    // §0.39.267 — James: "the eravos options need to be removed from this prompt." The API no longer lists
    // eravos mods here (GET /api/spec-engine/templates?include=eravos still does).
    ['spec-document templates', templates.filter(t => !String(t.source || '').startsWith('cos-') && t.source !== 'eravos-mod')],
  ].filter(([, list]) => list.length);
  wrap.innerHTML = groups.map(([title, list]) =>
    `<div style="font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin:6px 0 2px">${escapeHtml(title)} · ${list.length}</div>` + list.map(row).join('')).join('');
  document.getElementById('ns-file-tree').checked = true;
  onNewSpecTemplateChange();

  document.getElementById('new-spec-modal').classList.add('open');
  document.getElementById('ns-name').focus();
}
function closeNewSpecModal() { document.getElementById('new-spec-modal').classList.remove('open'); }

// ════════════════════════════════════════════════════
// UPLOAD PROJECT — prompt (name/goal, declares the temp compartment's
// end-state) -> spawn temp compartment -> dropzone -> "import repository"
// -> POST /api/project-import/:uuid/finalize (writes manifest.json/
// project.json/.git server-side, resolves the compartment) -> opens the
// repo view. Backed by lib/project-container.js + lib/project-import.config.js
// on the server; nothing about bounds or example goals is hardcoded here —
// UP_INTENT_EXAMPLES is fetched from GET /api/project-import/config.
// ════════════════════════════════════════════════════
let UP_CONTAINER_UUID = null;
let UP_STAGED_FILE = null;

async function openUploadProjectModal() {
  if (!CONNECTED) { toast('not connected to nexus', 'err'); return; }
  document.getElementById('up-name').value = '';
  document.getElementById('up-goal').value = '';
  document.getElementById('up-step-prompt').style.display = '';
  document.getElementById('up-step-drop').style.display = 'none';
  document.getElementById('upload-project-modal').classList.add('open');

  const chips = document.getElementById('up-chips');
  chips.innerHTML = '<span style="font-size:10px;color:var(--text3)">loading…</span>';
  try {
    const cfg = await api('/api/project-import/config');
    chips.innerHTML = '';
    (cfg.intentExamples || []).forEach(text => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'up-chip';
      b.textContent = text;
      b.onclick = () => { document.getElementById('up-goal').value = text; };
      chips.appendChild(b);
    });
  } catch (e) { chips.innerHTML = ''; }
}

function closeUploadProjectModal() {
  document.getElementById('upload-project-modal').classList.remove('open');
}

// §BUILT 2026-09-20 — James: "Create repo" button on the repo page. Real,
// distinct from Import: no source content required, calls repo.ingest's
// new bare:true path (a bare repo is a spec with nothing built yet — same
// honest PENDING-chunks state as any other brand-new spec).
function openCreateRepoModal() {
  if (!CONNECTED) { toast('not connected to nexus', 'err'); return; }
  document.getElementById('cr-name').value = '';
  document.getElementById('create-repo-modal').classList.add('open');
}
function closeCreateRepoModal() {
  document.getElementById('create-repo-modal').classList.remove('open');
}
async function submitCreateRepo() {
  const name = document.getElementById('cr-name').value.trim();
  if (!name) { toast('name required', 'err'); return; }
  const btn = document.getElementById('cr-create-btn');
  btn.disabled = true;
  try {
    const res = await api('/api/repos', { method: 'POST', body: JSON.stringify({ name, bare: true, source: 'create' }) });
    toast(`created repo "${name}"`, 'ok');
    closeCreateRepoModal();
    await loadApiRepos();
    if (res.repo?.uuid) enterRepoDetail(res.repo.uuid);
  } catch (e) { toast(`create failed: ${e.message}`, 'err'); }
  finally { btn.disabled = false; }
}

async function cancelUploadProject() {
  if (UP_CONTAINER_UUID) {
    try { await api(`/api/project-import/${UP_CONTAINER_UUID}/cancel`, { method: 'POST', body: '{}' }); }
    catch (e) { console.warn('[upload-project] cancel failed:', e.message); }
  }
  UP_CONTAINER_UUID = null; UP_STAGED_FILE = null;
  closeUploadProjectModal();
}

async function submitUploadProjectStart() {
  const name = document.getElementById('up-name').value.trim();
  const goal = document.getElementById('up-goal').value.trim();
  if (!name) return toast('project name is required', 'err');
  if (!goal) return toast('a goal is required — it becomes the end-state', 'err');

  try {
    const res = await api('/api/project-import/start', { method: 'POST', body: JSON.stringify({ name, goal }) });
    UP_CONTAINER_UUID = res.containerUuid;
    document.getElementById('up-container-note').textContent =
      `compartment ${res.compartmentId ? res.compartmentId.slice(0, 8) : '—'} open · intent: ${res.intent?.domain || '?'}.${res.intent?.verb || '?'}`;
    document.getElementById('up-step-prompt').style.display = 'none';
    document.getElementById('up-step-drop').style.display = '';
  } catch (e) { toast(`could not start: ${e.message}`, 'err'); }
}

function stageUploadProjectFile(file) {
  if (!file) return;
  if (!/\.zip$/i.test(file.name)) { toast(`not a .zip: ${file.name}`, 'err'); return; }
  UP_STAGED_FILE = file;
  document.getElementById('up-drop-text').textContent = `${file.name} (${formatBytes(file.size)}) — ready`;
  document.getElementById('up-import-btn').disabled = false;
}

async function submitUploadProjectImport() {
  if (!UP_STAGED_FILE || !UP_CONTAINER_UUID) return;
  const btn = document.getElementById('up-import-btn');
  const zone = document.getElementById('up-drop');
  btn.disabled = true;
  document.getElementById('up-drop-text').textContent = 'uploading…';
  if (zone) zone.classList.add('drag');

  let contentBase64;
  try {
    contentBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(UP_STAGED_FILE);
    });
  } catch (e) {
    toast(`file read failed: ${e.message}`, 'err');
    btn.disabled = false; if (zone) zone.classList.remove('drag');
    return;
  }

  document.getElementById('up-drop-text').textContent = 'unzipping into the compartment…';
  let res;
  try {
    // §RESEQUENCED 2026-09-20 — deferChunking:true. finalize now returns as
    // soon as the files are really on disk; chunking happens after you are
    // already standing in the repo (see below). The old behaviour is still
    // the server default — this flag is what opts in.
    res = await api(`/api/project-import/${UP_CONTAINER_UUID}/finalize`, {
      method: 'POST', body: JSON.stringify({ filename: UP_STAGED_FILE.name, contentBase64, deferChunking: true }),
    }, 30000);
  } catch (e) {
    toast(`import did not reach the declared end-state: ${e.message}`, 'err');
    btn.disabled = false; if (zone) zone.classList.remove('drag');
    document.getElementById('up-drop-text').textContent = `${UP_STAGED_FILE.name} — ready`;
    return;
  }

  if (zone) zone.classList.remove('drag');
  toast(res.deduped
    ? 'content already exists as an existing repo — reusing it'
    : `unzipped "${res.repo?.name || ''}" — ${res.fileCount} file(s), ${res.git?.committed ? 'committed' : 'git not committed'}`,
    'ok');

  closeUploadProjectModal();
  const repo = res.repo;
  UP_CONTAINER_UUID = null; UP_STAGED_FILE = null;
  document.getElementById('up-file-input').value = '';

  // The new repo was created after this session's last API_REPOS load —
  // refresh before routing to the repo view, or openRepoFor's match
  // against the in-memory list will miss it.
  await loadApiRepos();
  if (!repo) return;
  openRepoFor(repo.ideaUuid, repo.specUuid, repo.name);

  // §RESEQUENCED 2026-09-20 — you are now IN the repo, with its real files,
  // before a single chunk exists. Chunking runs from here and reports as it
  // goes. Deliberately not awaited before navigation: the whole point of
  // the re-sequencing is that the repo is reachable first.
  chunkRepoWithProgress(repo.uuid, repo.name);
}

// Run the import pipeline over a repo that is already on disk, keeping a
// live toast up while it works. The real progress events
// (idearium.repo.chunk.started/done/fault) also arrive over SSE and are
// handled in refreshOnEvent — this is the foreground half, so the person
// who just clicked import sees something immediately rather than only if
// SSE happens to be connected.
async function chunkRepoWithProgress(repoUuid, repoName) {
  // §FIXED 2026-09-20 — was one static "working…" toast for the whole
  // (up to 180s) call, indistinguishable from a genuine stall. Real,
  // live percentage now, fed by the repo.chunk.progress SSE handler above
  // — updates the SAME toast element in place as each chunk completes.
  toastProgress(repoUuid, `chunking "${repoName || repoUuid.slice(0,8)}" — starting…`, 0);
  try {
    const r = await api(`/api/repos/${repoUuid}/chunk`, { method: 'POST', body: '{}' }, 180000);
    const st = r.pipeline?.state || 'unknown';
    if (st === 'FAULT') {
      toastProgressDone(repoUuid, `chunking fault: ${r.pipeline?.error || 'see verification tiers'}`, 'err');
    } else {
      toastProgressDone(repoUuid, `chunking complete — ${st}`, 'ok');
    }
  } catch (e) {
    // Loud. A repo with files but no index is a real, visible half-state,
    // not something to swallow: the Intelligence tab will say "not scanned"
    // and the Files tab will still work, but nothing that reads by chunk will.
    toastProgressDone(repoUuid, `chunking failed — repo imported but NOT indexed: ${e.message}`, 'err');
    return;
  }
  await loadApiRepos();
  if (CURRENT_API_REPO?.uuid === repoUuid) {
    const fresh = API_REPOS.find(x => x.uuid === repoUuid);
    if (fresh) CURRENT_API_REPO = fresh;
    renderCurrentRepoSubtab();
  }
}


function selectedTemplateIds() {
  return [...document.querySelectorAll('.ns-tpl-check:checked')].map(c => c.value);
}

function onNewSpecTemplateChange() {
  // "map to repo now" only makes sense once the map-first templates
  // (compartments, axioms) are among the selection — showing it for every
  // combination would let someone promote a spec that's really just empty
  // TODOs with a name attached.
  const ids = selectedTemplateIds();
  // A COS template IS a file tree — checking one turns file-tree mode on.
  const tree = document.getElementById('ns-file-tree');
  if (tree && ids.some(id => id.startsWith('cos-'))) tree.checked = true;
  const treeOn = !!(tree && tree.checked);
  // Spec-document templates only apply to a document spec; dim them in tree mode.
  document.querySelectorAll('.ns-tpl-row').forEach(r => {
    const doc = !String(r.dataset.src || '').startsWith('cos-');
    r.style.opacity = treeOn && doc ? '.45' : '';
  });
  const mapWorthy = !treeOn && (ids.includes('compartments') || ids.includes('axioms'));
  document.getElementById('ns-map-btn').style.display = mapWorthy ? '' : 'none';
}

async function submitNewSpec(mapToRepo) {
  const name = document.getElementById('ns-name').value.trim();
  if (!name) { toast('name required', 'err'); return; }
  const description = document.getElementById('ns-description').value.trim();
  const templateIds = selectedTemplateIds();
  const buildEngine = document.getElementById('ns-build-engine').value || 'auto';
  const ideaUuid = NS_IDEA_UUID; // §BUG FIXED 2026-07-11 — was captured on open, never sent

  const fileTree = !!document.getElementById('ns-file-tree')?.checked;
  try {
    if (fileTree) toast('planning the file tree — the agent is listing every file by layer…', 'ok');
    const r = await api('/api/spec-engine/specs', {
      method: 'POST',
      // In tree mode only COS templates are sent: document templates do not
      // apply to a file-tree spec, and sending them would read as if they did.
      body: JSON.stringify({ name, description, templateIds: fileTree ? templateIds.filter(id => id.startsWith('cos-')) : templateIds, buildEngine, ideaUuid: ideaUuid || undefined, fileTree }),
    }, fileTree ? 180000 : undefined);
    const manifest = r.manifest || r;
    if (r.plan) {
      const L = r.plan.layers || {};
      toast(`file tree planned (${r.plan.planSource}): ${r.plan.files} files — kernel ${L.kernel || 0} · engine ${L.engine || 0} · runtime ${L.runtime || 0} · test ${L.test || 0}${r.plan.rejected ? ` · ${r.plan.rejected} rejected` : ''}${r.plan.agentError ? ` · agent: ${r.plan.agentError}` : ''}`, r.plan.agentError ? 'err' : 'ok');
    } else {
      toast(`spec created${templateIds.length ? ` from [${templateIds.join(', ')}]` : ''} · build logic: ${buildEngine}`, 'ok');
    }

    if (mapToRepo) {
      try {
        const promoted = await api(`/api/spec-engine/specs/${manifest.uuid}/promote`, {
          method: 'POST', body: JSON.stringify({ mode: 'manual' }),
        });
        toast('mapped to repository — compartments/axioms in, rest TODO', 'ok');
        closeNewSpecModal();
        await loadSpecs(); await loadApiRepos();
        if (ideaUuid) await loadIdeas(); // picks up the idea's new phase + linkedSpec
        openRepoFor(ideaUuid || null, manifest.uuid, name);
        if (ideaUuid) setRepoSubtab('idea');   // 0.39.263 — the idea moves to its repo's Idea tab
        return;
      } catch (e) { toast(`spec created, map-to-repo failed: ${e.message}`, 'err'); }
    }

    // §CHANGED 2026-09-21 — James: "specs are supposed to use the same repo
    // compartments." speceng.create already makes the repo AND its compartment
    // the moment the spec exists (api/index.js, §FOUND & FIXED 2026-09-06) and
    // returns repoUuid. This block used to POST /api/repos a second time
    // regardless — a second repo for the same spec, with no compartment (the
    // client cannot make one). It now only runs as a fallback when the server
    // reported no repo, and asks the server to make the compartment.
    if (!r.repoUuid) {
      try {
        const repoRes = await api('/api/repos', {
          method: 'POST',
          body: JSON.stringify({ name, specUuid: manifest.uuid, source: 'repo-first', ideaUuid: ideaUuid || undefined, ensureCompartment: true }),
        });
        if (repoRes.error) toast(`spec created, repo shell failed: ${repoRes.error}`, 'err');
      } catch (e) {
        // §1.2 loud, non-fatal — the spec is real regardless; the boot-time
        // reconcile (api/index.js _reconcileSpecRepos) adopts it on restart, and
        // createRepoThenBuild() below self-heals it if the person builds first.
        toast(`spec created, repo shell failed: ${e.message}`, 'err');
      }
    }

    closeNewSpecModal();
    await Promise.all([loadSpecs(), loadApiRepos()]);
    if (ideaUuid) {
      await loadIdeas();
      const idea = IDEAS.find(i => i.uuid === ideaUuid);
      if (idea) renderDetail(idea); // reflect the new phase + linked-spec immediately, not on next reload
    }
    // The Spec Library used to be where a new spec showed up. It is a repo
    // now, so land in it — same as the "map to repo now" branch above.
    openRepoFor(ideaUuid || null, manifest.uuid, name);
    if (ideaUuid) { setRepoSubtab('idea'); toast('the idea is a spec now — it lives in its repo\'s Idea tab', 'ok'); }   // 0.39.263
  } catch (e) { toast(e.message, 'err'); }
}
function createSpecForIdea(ideaUuid) {
  const idea = IDEAS.find(i=>i.uuid===ideaUuid); if (!idea) return;
  // §BUG FIXED 2026-07-11 — this used to POST straight to the legacy
  // /api/ideas/:uuid/spec path: no template picker, no buildEngine choice,
  // and (separately fixed) that path never advanced idea.phase either.
  // Routing through the same modal Brainstorm/Spec Library use means an
  // idea-originated spec gets the same template composition and repo
  // materialization as any other — one spec-creation path, not two.
  openNewSpecModal({ ideaUuid, name: (idea.text||'spec').slice(0,60), description: idea.text||'' });
}

// ════════════════════════════════════════════════════
// ARCHITECT — blueprint tree derived from real compiled specs
// ════════════════════════════════════════════════════
// §MOVED 2026-09-20 — was renderArchitect(), a global view over EVERY
// compiled spec, reached from Build > Architect. James: "Move architect
// from build tab to repo sub tabs per repo." Now scoped to one repo and
// rendered into that repo's own Architect subtab.
//
// Data source unchanged and still real (the §DATA-SOURCE FIX 2026-07-18
// this function already carried): spec-engine manifests via
// GET /api/spec-engine/specs, NOT /api/specs — the legacy lightweight
// spec system whose sections are auto-stubs, which is why every node
// used to read "1 chars". The only new thing here is the repo filter.
async function renderRepoArchitect(repo) {
  // §0.39.299 AR5 — one surface: the registry on the canvas; the spec's blueprint is the drawer's BLUEPRINT view
  if (repo) renderRepoRegistry(repo);
}
/** _archBlueprintHtml(repo) — the repo's own spec-engine spec, chunk by chunk (the §DATA-SOURCE FIX 2026-07-18 source) */
async function _archBlueprintHtml(repo) {
  const specUuid = repo.specUuid || repo.promotedFromSpec || null;
  if (!specUuid) return '<div class="ax-empty">THIS REPO HAS NO SPEC-ENGINE SPEC ATTACHED — NOTHING TO DRAW A BLUEPRINT FROM. A REPO IMPORTED FROM A ZIP OR DROPPED AS FILES HAS NONE UNLESS ONE IS PROMOTED ONTO IT.</div>';
  let spec;
  try { const r = await api(`/api/spec-engine/specs/${specUuid}`); spec = r.manifest || r.spec || r; }
  catch (e) { return `<div class="ax-item bad">COULD NOT LOAD THIS REPO'S SPEC (${escapeHtml(specUuid.slice(0, 8))}): ${escapeHtml(e.message)}</div>`; }
  if (!spec || !spec.uuid) return `<div class="ax-item bad">SPEC ${escapeHtml(specUuid.slice(0, 8))} IS LINKED TO THIS REPO BUT NO LONGER EXISTS IN SPEC-ENGINE.</div>`;
  const chunks = spec.chunks || [];
  if (!chunks.length) return `<div class="ax-empty">"${escapeHtml(spec.name || specUuid)}" HAS NO CHUNKS YET — BUILD IT FROM THE SPEC TAB AND ITS BLUEPRINT APPEARS HERE.</div>`;
  const done = chunks.filter(c => c.status === 'complete').length, bytes = chunks.reduce((n, c) => n + (c.byteSize || 0), 0);
  return `<div class="ax-stats" style="margin-bottom:10px"><span class="ax-stat c"><b>${done}/${chunks.length}</b>CHUNKS</span><span class="ax-stat"><b>${bytes.toLocaleString()}</b>BYTES</span><span class="ax-stat"><b>V${escapeHtml(spec.version || '1.0.0')}</b>${escapeHtml(spec.status || '')}</span></div>
    <div class="ax-k">${escapeHtml(spec.name || specUuid)}</div>`
    + chunks.map(c => { const ok = c.status === 'complete'; return `<div class="ax-item ${ok ? 'ok' : 'warn'}">${escapeHtml((c.sectionTitle || c.sectionId || '').replace(/_/g, ' '))}<span class="m">${ok ? `${(c.byteSize || 0).toLocaleString()} BYTES` : escapeHtml(c.status || '')}${c.realPath && c.realPath !== (c.sectionTitle || c.sectionId) ? ` · ${escapeHtml(c.realPath)}` : ''}</span></div>`; }).join('');
}

// ════════════════════════════════════════════════════
// REPOSITORY / FILE BROWSER / IDE — real local folder via File System Access
// (no fabricated tree; browses whatever folder the user actually opens)
// ════════════════════════════════════════════════════
let REPO_FILES = []; // [{path, handle}]
let ACTIVE_FILE = null;

let CURRENT_REPO_IDEA = null; // idea this repo-view session is scoped to (set by openRepoFor)

// The merge point: ideas/specs don't have their own separate "Repository"
// nav item anymore — clicking "open repository" on an idea or a spec lands
// here, scoped to that idea. If a repo is already linked (RepoLayer match
// by ideaUuid/specUuid), show it. If not, the dropzone already in this view
// becomes "attach files to THIS idea" instead of a generic, unscoped drop.
function openRepoFor(ideaUuid, specUuid, label) {
  CURRENT_REPO_IDEA = ideaUuid || (specUuid && SPECS.find(s=>s.uuid===specUuid)?.ideaUuid) || null;
  setView('repo');
  // Arriving from an idea/spec always lands in detail mode, same as clicking
  // a block — this entry point skips the grid on purpose (already know which
  // repo, or that none exists yet), matching the old pre-grid behavior.
  REPO_DETAIL_OPEN = true;
  _syncNestScope();
  document.getElementById('repo-wrap').classList.add('repo-open');
  document.getElementById('repo-back-btn').style.display = '';
  document.getElementById('repo-view-title').textContent = 'Repository';
  document.getElementById('repo-context').textContent = label ? `← ${label}` : '';
  _setRepoToolbarMode('detail');
  const repo = API_REPOS.find(r =>
    (specUuid && r.promotedFromSpec === specUuid) ||
    (CURRENT_REPO_IDEA && r.ideaUuid === CURRENT_REPO_IDEA) ||
    (specUuid && r.specUuid === specUuid));
  if (repo) selectApiRepo(repo.uuid); else { renderRepoLibrary(); renderApiRepoPanel(null); }
}

// §OVERHAUL 2026-09-17 — the compartment → repo rail. Real grouping on
// repo.compartmentId (idearium/repo/index.js's own real field, §SBP1 —
// see that file's header), not a fabricated hierarchy. Repos with no
// compartmentId (the common case today — most repos are still created
// without one) land in one honestly-labeled "Uncategorized" bucket
// rather than being hidden or given a fake group name.
//
// There is no idearium-side endpoint that resolves a compartmentId to a
// human name (COS's compartment registry — cos/manager.js — is a
// separate subsystem idearium's API never wired a lookup to). Rather
// than invent a name, the group label is the id itself, in the same
// mono/truncated style every other id already appears in across this
// app — an honest identifier, not a guessed label.
let REPO_RAIL_COLLAPSED = new Set(); // compartment keys the user closed (list mode only)
let REPO_RAIL_SEEN_RAID = false;      // §0.39.265 — the RAID contracts group starts closed, once
// §0.39.265 — a repo RAID made for a queued contract (lib/contract-repo-provision.js)
function _isRaidContractRepo(r) { return !!r && (r.source === 'raid-contract' || /^raid-contract-/.test(r.name || '')); }
// §BLOCKS-2026-09-19 — James: "repos tab needs to show all repo compartments
// in blocks... click on a repo to actually enter it. like a github repo."
// Two render modes off one state flag: REPO_DETAIL_OPEN=false is the landing
// grid (every compartment, every repo, as a block — this IS the "all repo
// compartments in blocks" ask); true is the compact list used once inside a
// repo, alongside its file tree + editor, so switching repos mid-session
// doesn't force a trip back to the grid.
let REPO_DETAIL_OPEN = false;
function renderRepoLibrary() {
  const body = document.getElementById('repo-rail-body');
  const badge = document.getElementById('repo-count-badge');
  // 0.39.263 — the systems are inside nexus. §0.39.265 — nexus/core is shown with
  // nexus (the main repo), and RAID's auto-made contract repos don't count as yours.
  const _shown = API_REPOS.filter(r => (!r.nexusSelf || _nxIsMain(r)) && !_isRaidContractRepo(r)).length;
  if (badge) badge.textContent = _shown ? String(_shown) : '';
  body.classList.toggle('block-grid', !REPO_DETAIL_OPEN);
  if (!API_REPOS.length) {
    // §FIXED 2026-09-20 — real actions, not just passive text, matching
    // the toolbar's own Import repo / Create repo buttons above.
    body.innerHTML = `<div class="repo-rail-empty">
      <div>no repos yet</div>
      <div style="display:flex;gap:8px">
        <button class="modal-btn confirm" onclick="openUploadProjectModal()">Import repo</button>
        <button class="modal-btn" onclick="openCreateRepoModal()">Create repo</button>
      </div>
    </div>`;
    return;
  }
  const q = (document.getElementById('repo-rail-filter')?.value || '').toLowerCase().trim();
  const groups = new Map(); // compartmentId (or '') -> repos[]
  // §0.39.261 — the Nexus repos (one parent + one per system, each in its own
  // nested COS compartment) are one group, shown first: Nexus managing itself.
  const NEXUS_KEY = 'nexus';
  const RAID_KEY = 'RAID contracts';
  // §0.39.263 — "nexus is the repo, not 15, just nexus": the system repos are
  // opened from inside it (its atlas Home), so the library lists only the parent —
  // plus, in the compact list, the system you are in, under it. A filter that
  // names a system still finds it.
  const inSystem = CURRENT_API_REPO && CURRENT_API_REPO.nexusSelf && CURRENT_API_REPO.nexusSelf.role === 'system' ? CURRENT_API_REPO.uuid : null;
  for (const r of API_REPOS) {
    if (q && !r.name.toLowerCase().includes(q)) continue;
    // §0.39.265 — James: "nexus and nexus/core should be the main repo": core
    // (everything the systems share) is listed with nexus, not hidden inside it.
    // §0.39.265 — "why not combine nexus and nexus core?": one "nexus" entry (core,
    // whose Home is the atlas); the other systems open from inside it.
    if (r.nexusSelf && !_nxIsMain(r) && (r.nexusSelf.role === 'parent' || (!q && !(REPO_DETAIL_OPEN && r.uuid === inSystem)))) continue;
    // RAID provisions a repo per queued contract (lib/contract-repo-provision.js):
    // plumbing, not your projects — its own group, last, closed in the list.
    const key = r.nexusSelf ? NEXUS_KEY : _isRaidContractRepo(r) ? RAID_KEY : (r.compartmentId || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const _nxRank = (r) => r.nexusSelf.role === 'parent' ? 0 : r.nexusSelf.system === 'core' ? 1 : 2;
  if (groups.has(NEXUS_KEY)) groups.get(NEXUS_KEY).sort((a, b) => _nxRank(a) - _nxRank(b) || a.name.localeCompare(b.name));
  if (groups.has(RAID_KEY) && !REPO_RAIL_SEEN_RAID) { REPO_RAIL_COLLAPSED.add(RAID_KEY); REPO_RAIL_SEEN_RAID = true; }
  if (!groups.size) { body.innerHTML = `<div class="repo-rail-empty">no repos match "${escapeHtml(q)}"</div>`; return; }
  // Nexus first, Uncategorized last, others by first-repo recency (newest activity first)
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === NEXUS_KEY) return -1; if (b === NEXUS_KEY) return 1;
    if (a === RAID_KEY) return 1; if (b === RAID_KEY) return -1;
    if (!a) return 1; if (!b) return -1;
    return Math.max(...groups.get(b).map(r=>r.updatedAt||0)) - Math.max(...groups.get(a).map(r=>r.updatedAt||0));
  });
  if (!REPO_DETAIL_OPEN) {
    // ── Landing grid: every compartment as a labeled section, every repo
    // in it as a block. No collapsing here — the point is to see all of it.
    body.innerHTML = keys.map(key => {
      const repos = key === NEXUS_KEY ? groups.get(key) : groups.get(key).slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
      const label = key === NEXUS_KEY ? 'nexus' : key ? key : 'Uncategorized';
      if (key === RAID_KEY) {
        return `<details class="repo-grid-raid"><summary class="repo-grid-group-label">${escapeHtml(label)} · ${repos.length} — made automatically for RAID's queued contracts</summary>
          ${repos.map(r => `<div class="repo-block raid" onclick="enterRepoDetail('${r.uuid}')"><div class="repo-block-head"><span class="repo-block-icon">⌥</span><span class="repo-block-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name.replace(/^raid-contract-/, 'contract '))}</span></div><div class="repo-block-desc">${r.fileCount} file${r.fileCount === 1 ? '' : 's'}</div></div>`).join('')}</details>`;
      }
      return `
        <div class="repo-grid-group-label">${escapeHtml(label)} · ${repos.length}</div>
        ${repos.map(r => {
          const dotClass = r.phase === 'complete' ? 'done' : (r.phase === 'building' ? 'building' : '');
          return `
          <div class="repo-block${r.nexusSelf && (r.nexusSelf.role === 'parent' || r.nexusSelf.system === 'core') ? ' main' : ''}" onclick="enterRepoDetail('${r.uuid}')">
            <div class="repo-block-head"><span class="repo-block-icon">⌥</span><span class="repo-block-name" title="${escapeHtml(r.name)}">${escapeHtml(_nxIsMain(r) ? 'nexus' : r.name)}</span></div>
            <div class="repo-block-desc">${_nxIsMain(r) && r.nexusSelf.role === 'system' ? `${Object.keys((_nxParent() || { nexusSelf: {} }).nexusSelf.children || {}).length} systems · ${r.nexusSelf.fileCount || r.fileCount} files · ${(r.nexusSelf.versions || []).length} version(s) · immutable` : r.nexusSelf ? (r.nexusSelf.role === 'parent' ? `${Object.keys(r.nexusSelf.children || {}).length} systems · snapshot ${escapeHtml(String(r.nexusSelf.snapshot || '').slice(0, 8))}` : `${r.nexusSelf.fileCount || r.fileCount} files · ${(r.nexusSelf.versions || []).length} version(s) · immutable`) : `${r.fileCount} files${r.promotedFromSpec ? ' · from spec' : ''}`}</div>
            <div class="repo-block-meta"><span class="dot ${r.nexusSelf ? 'done' : dotClass}"></span><span>${r.nexusSelf ? `immutable · synced ${r.nexusSelf.syncedAt ? new Date(r.nexusSelf.syncedAt).toLocaleTimeString() : '—'}` : escapeHtml(r.phase||'idle')}</span></div>
          </div>`;
        }).join('')}`;
    }).join('');
    return;
  }
  // ── Compact list: used once a repo is open, for quick switching ──
  body.innerHTML = keys.map(key => {
    const repos = key === NEXUS_KEY ? groups.get(key) : groups.get(key).slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const label = key ? key : 'Uncategorized';
    const collapsed = REPO_RAIL_COLLAPSED.has(key);
    return `
      <div class="compartment-group${collapsed?' collapsed':''}" data-key="${escapeHtml(key)}">
        <div class="compartment-head" onclick="toggleCompartment('${key.replace(/'/g,"\\'")}')">
          <span class="compartment-caret">▾</span>
          <span class="compartment-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="compartment-count">${repos.length}</span>
        </div>
        <div class="compartment-repos">
          ${repos.map(r => {
            const dotClass = r.phase === 'complete' ? 'done' : (r.phase === 'building' ? 'building' : '');
            return `
            <div class="repo-card${CURRENT_API_REPO && CURRENT_API_REPO.uuid===r.uuid?' active':''}${r.nexusSelf && r.nexusSelf.role === 'system' ? ' nx-child' : ''}" onclick="${r.nexusSelf && r.nexusSelf.role === 'parent' ? 'nexusAtlasHome()' : `selectApiRepo('${r.uuid}')`}">
              ${dotClass ? `<span class="repo-card-dot ${dotClass}"></span>` : ''}
              <div class="repo-card-body">
                <div class="repo-card-name">${escapeHtml(_nxIsMain(r) ? 'nexus' : r.name)}</div>
                <div class="repo-card-meta">${r.nexusSelf ? (r.nexusSelf.role === 'parent' ? `${Object.keys(r.nexusSelf.children || {}).length} systems · immutable` : `nexus/${escapeHtml(r.nexusSelf.system)} · ${r.nexusSelf.fileCount || r.fileCount} files`) : `${r.fileCount} files · ${escapeHtml(r.phase||'—')}`}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}
function toggleCompartment(key) {
  if (REPO_RAIL_COLLAPSED.has(key)) REPO_RAIL_COLLAPSED.delete(key); else REPO_RAIL_COLLAPSED.add(key);
  renderRepoLibrary();
}
// Entering from a grid block: open detail mode (rail collapses to the
// compact list, tree + ide panes reappear), then select the repo as before.
// §0.39.264 — James: "this in idearium needs to only show in nested compartments/repos."
// Create, Build and the ideas/specs counters belong to the repo you are in: they
// show (index.html .nest-only) only while a repo is open, and the navigator nests
// them under that repo instead of listing them at the top level.
function _syncNestScope() {
  document.body.classList.toggle('in-repo', !!REPO_DETAIL_OPEN);
  const nestViews = ['brainstorm', 'ideas', 'eravos', 'spec-wizard'];   // §0.39.300 WS3 — the pipeline's Architect is not a repo's: it opens with no repo open
  if (!REPO_DETAIL_OPEN && nestViews.includes(((document.querySelector('.view.active') || {}).id || '').replace(/^view-/, ''))) setView('repo');
  if (typeof renderTabTree === 'function') renderTabTree();
}
function enterRepoDetail(uuid) {
  REPO_DETAIL_OPEN = true;
  _syncNestScope();
  document.getElementById('repo-wrap').classList.add('repo-open');
  document.getElementById('repo-back-btn').style.display = '';
  document.getElementById('repo-view-title').textContent = 'Repository';
  _setRepoToolbarMode('detail');
  selectApiRepo(uuid);
}
// Back button: return to the landing grid. Closes whatever file was open —
// re-entering a repo always starts from its tree, same as a fresh visit.
function exitRepoDetail() {
  // §0.39.263 — a nexus system is inside the nexus repo: back goes to nexus, then to the library
  if (CURRENT_API_REPO && CURRENT_API_REPO.nexusSelf && CURRENT_API_REPO.nexusSelf.role === 'system' && CURRENT_API_REPO.nexusSelf.system !== 'core' && typeof nexusAtlasHome === 'function' && _nxParent()) return nexusAtlasHome();
  if (typeof NX_DOC_TRAIL !== 'undefined' && NX_DOC_TRAIL.length) return nexusAtlasHome();
  REPO_DETAIL_OPEN = false;
  CURRENT_API_REPO = null; ACTIVE_API_FILE = null; API_FILE_DIRTY = false; CURRENT_REPO_SUBTAB = null;
  _syncNestScope();
  document.getElementById('repo-wrap').classList.remove('repo-open');
  document.getElementById('repo-back-btn').style.display = 'none';
  document.getElementById('repo-view-title').textContent = 'Repository Library';
  document.getElementById('repo-context').textContent = '';
  _setRepoToolbarMode('library');
  renderRepoLibrary();
}
function selectApiRepo(uuid) {
  const repo = API_REPOS.find(r => r.uuid === uuid);
  if (!repo) return;
  const switchingRepo = CURRENT_API_REPO && CURRENT_API_REPO.uuid !== uuid;
  if (switchingRepo) {
    // switching to a genuinely different repo — any open file belongs to
    // the old one and must close, unlike a same-repo background refresh
    ACTIVE_API_FILE = null; API_FILE_DIRTY = false;
    document.getElementById('ide-tabs').textContent = 'no file open';
    document.getElementById('ide-code').textContent = '// click a file in the tree to open it here';
    _showIdeEditor(false);
  }
  document.getElementById('repo-context').textContent = '';
  if (switchingRepo && typeof NX_DOC_TRAIL !== 'undefined') NX_DOC_TRAIL.length = 0;
  const backBtn = document.getElementById('repo-back-btn');
  if (backBtn) backBtn.textContent = repo.nexusSelf && repo.nexusSelf.role === 'system' && repo.nexusSelf.system !== 'core' ? '← nexus' : '← All repos';
  renderApiRepoPanel(repo);   // sets CURRENT_API_REPO …
  renderRepoLibrary();        // … which the active-card highlight (and the open nexus system under nexus) read
  // §REPO SUBTABS — a genuinely different repo always lands back on Home,
  // same "always starts fresh" rule the file-tree above already follows.
  // A same-repo refresh (switchingRepo:false, e.g. after loadApiRepos()
  // polls) leaves whichever subtab is currently open alone and just
  // re-renders it, so an open Phasemap/Settings tab doesn't get yanked
  // back to Home every poll cycle.
  if (switchingRepo || !CURRENT_REPO_SUBTAB) setRepoSubtab('home');
  else renderCurrentRepoSubtab();
}

// ════════════════════════════════════════════════════
// §REPO SUBTABS 2026-09-20 — Home / Files / Architect / Phasemap /
// Intelligence / Settings. Each
// panel loads its own data; switching tabs never re-fetches a panel
// that's already showing the current repo (see the *_LOADED_FOR guards
// below) — CURRENT_API_REPO can change out from under an open tab via
// loadApiRepos()'s poll, so every render function re-checks the repo
// uuid itself rather than trusting a stale "already loaded" flag.
// ════════════════════════════════════════════════════
let CURRENT_REPO_SUBTAB = null;

function setRepoSubtab(name) {
  if (name === 'roadmap' || name === 'phasemap') name = 'phases';   // §0.39.271 P4 — one tab now
  CURRENT_REPO_SUBTAB = name;
  document.querySelectorAll('.repo-subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === name));
  document.querySelectorAll('.repo-subtab-panel').forEach(p => p.classList.toggle('active', p.id === `repo-subtab-${name}`));
  renderCurrentRepoSubtab();
  if (typeof planTabSync === 'function') planTabSync();   // §0.39.353 CT9 — the Plan's pull tab follows the repo view
}

function renderCurrentRepoSubtab() {
  if (!CURRENT_API_REPO) return;
  if (CURRENT_REPO_SUBTAB === 'home') renderRepoHome(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'files') renderApiRepoPanel(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'code') renderRepoCode(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'architect') renderRepoArchitect(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'spec') renderRepoSpec(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'phases') renderRepoPhases(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'phasemap') renderRepoPhasemap(CURRENT_API_REPO);   // no button since 0.39.271 (merged into Phases)
  else if (CURRENT_REPO_SUBTAB === 'roadmap') renderRepoRoadmap(CURRENT_API_REPO);     // no button since 0.39.271 (merged into Phases)
  else if (CURRENT_REPO_SUBTAB === 'intelligence') renderRepoIntelligence(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'agent') renderRepoAgent(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'idea') renderRepoIdea(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'debug') renderRepoDebug(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'versionium') renderRepoVersionium(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'git') renderRepoGit(CURRENT_API_REPO);
  else if (CURRENT_REPO_SUBTAB === 'settings') renderRepoSettings(CURRENT_API_REPO);
}

// ── SPEC — this repo's spec-engine spec as a working surface: chunk status,
// per-chunk agent (pending only), build-remaining, build history, export.
// §MOVED 2026-09-21 — was the right-hand pane of Build > Spec Library. The
// builder itself (renderSpecBuilder / renderSpecEngineBuilder) is unchanged and
// still writes into #spec-builder; that element now lives in this subtab. This
// function only decides WHICH spec to point it at, and toggles the empty-state
// sibling — it must not touch the panel's innerHTML (that would delete the
// mount). Same repo → spec link, in the same precedence renderRepoArchitect uses.
function renderRepoSpec(repo) {
  const empty = document.getElementById('repo-spec-empty');
  const mount = document.getElementById('spec-builder');
  if (!empty || !mount || !repo) return;
  // §0.39.294 SW1 — the Spec field's way into the spec workshop (it reads this repo's spec/*.spec and saves back here)
  const wsBar = document.getElementById('repo-spec-workshop');
  if (wsBar) wsBar.innerHTML = repo.nexusSelf ? '' : `<div class="action-row" style="margin:0 0 10px"><button class="action-btn primary" onclick="openWorkshop('repo:${repo.uuid}')" title="open this repo's spec in the spec workshop — write it by hand or with the agent; saving writes it back here">✎ open in the spec workshop</button></div>`;
  // §0.39.271 S2 — the living spec first (js/living-spec.js); what follows is the build manifest.
  if (typeof renderLivingSpec === 'function') renderLivingSpec(repo);
  const manifest = document.getElementById('repo-build-manifest');
  if (manifest) manifest.style.display = repo.nexusSelf ? 'none' : '';   // a nexus repo is built from its files, not a chunk manifest
  if (repo.nexusSelf && repo.nexusSelf.role === 'system') { mount.style.display = 'none'; empty.style.display = ''; return renderNexusSpec(repo, empty); }
  const say = (html) => { mount.style.display = 'none'; empty.style.display = ''; empty.innerHTML = html; };

  const specUuid = repo.specUuid || repo.promotedFromSpec || null;
  if (!specUuid) {
    say(`this repo has no spec-engine spec attached — there is nothing to build here.<br><br>a spec comes from creating one (Welcome → Start new project, or an idea → create spec) or from Create repo; repos imported from a zip or dropped as files have none.`);
    return;
  }
  const spec = SPECS.find(s => s.uuid === specUuid);
  if (!spec) {
    // Not in the active list: still loading, or soft-removed (deleteSpec keeps
    // everything on disk and drops it from listings). Offer the undo rather
    // than a dead end — restoreSpec() is the existing, real inverse.
    say(`spec ${escapeHtml(specUuid.slice(0, 8))} is linked to this repo but is not in the active spec list — it was removed, or the list has not loaded yet.<br><br><button class="modal-btn confirm" onclick="restoreSpec('${specUuid}')">restore spec</button>`);
    return;
  }
  empty.style.display = 'none';
  mount.style.display = '';
  if (SELECTED_SPEC !== spec.uuid) {
    SELECTED_SPEC = spec.uuid;
    BUILDER_ACTIVE_SECTION = (spec.sections||[])[0]?.id || SECTION_IDS[0];
  }
  renderSpecBuilder(spec);
}

// ── HOME — the repo's own README/.spec if it has one, else basic identity.
// Real content only: no fabricated summary when neither file exists.
async function renderRepoHome(repo) {
  const el = document.getElementById('repo-subtab-home');
  if (!el) return;
  if (repo && repo.nexusSelf) return renderNexusHome(repo, el);
  const homeFile = (repo.files || []).find(f => /(^|\/)readme\.md$/i.test(f.path))
                 || (repo.files || []).find(f => /\.spec$/i.test(f.path));
  const identity = `
    <div class="ds"><div class="ds-label">repository</div><div class="ds-mono">${escapeHtml(repo.name)}\nuuid ${repo.uuid}\nsource ${escapeHtml(repo.source || 'unknown')}${repo.createdAt ? '\n' + new Date(repo.createdAt).toLocaleString() : ''}</div></div>
    <div id="repo-build-start"></div>`;   // §0.39.280 BS11 — the build-start area (plan-panel.js)
  setTimeout(() => { if (typeof renderBuildStart === 'function') renderBuildStart(repo); }, 0);
  if (!homeFile) {
    el.innerHTML = identity + `<div class="detail-empty">no README.md or .spec file in this repo yet</div>`;
    return;
  }
  el.innerHTML = identity + `<div class="ds"><div class="ds-label">${escapeHtml(homeFile.path)}</div><div class="ds-mono" id="repo-home-content">loading…</div></div>`;
  try {
    const r = await api(`/api/repos/${repo.uuid}/file?path=${encodeURIComponent(homeFile.path)}`, {}, 15000);
    const target = document.getElementById('repo-home-content');
    // still looking at the same repo/tab? (a fast repo switch mid-fetch
    // must not paint a stale README over the new repo's Home panel)
    if (target && CURRENT_API_REPO?.uuid === repo.uuid && CURRENT_REPO_SUBTAB === 'home') {
      target.textContent = r.content || '(empty file)';
    }
  } catch (e) {
    const target = document.getElementById('repo-home-content');
    if (target) target.textContent = `// could not read ${homeFile.path}: ${e.message}`;
  }
}

// ── PHASEMAP — MCO2's real verification tiers (L0-L8, sync+lazy merged)
// and MCO1's real dependency graph summary. Both are honest about a repo
// that hasn't been through the import pipeline yet (404, shown as such —
// never faked as "all green").
// §0.39.271 P4 — the Phasemap tab is merged into Phases. What this function showed for an
// ordinary repo (verification tiers + the three graphs) was never phases: it now paints
// into the Intelligence tab (opts.el / opts.subtab). Kept whole, not deleted (§0.3).
async function renderRepoPhasemap(repo, opts = {}) {
  const el = opts.el || document.getElementById('repo-subtab-phasemap');
  const SUB = opts.subtab || 'phasemap';
  if (!el) return;
  if (!opts.el && repo && repo.nexusSelf && repo.nexusSelf.role === 'system') return renderNexusPhasemap(repo, el);
  el.innerHTML = `<div class="detail-empty">loading…</div>`;
  let verification = null, verificationError = null, graph = null, graphError = null;
  try { verification = await api(`/api/repos/${repo.uuid}/verification`, {}, 15000); }
  catch (e) { verificationError = e.message; }
  // §0.39.246 — all three graphs (code · execution · spec), each with its own
  // real state, instead of the code graph alone.
  try { graph = await api(`/api/repos/${repo.uuid}/graphs`, {}, 15000); }
  catch (e) { graphError = e.message; }
  // repo switched away while these were in flight — don't paint stale data
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== SUB) return;

  const tierRow = (t) => `<div class="pend-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--b0)">
    <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${escapeHtml(t.level)} · ${escapeHtml(t.name || '')}</span>
    <span style="font-family:var(--mono);font-size:10px;color:${t.status==='not_applicable'?'var(--text3)':t.passed?'var(--mint)':'var(--coral)'}">${t.status==='not_applicable'?'n/a':t.passed?'passed':'failed'}</span>
  </div>`;

  let verificationHtml;
  if (verificationError) {
    verificationHtml = `<div class="detail-empty">${escapeHtml(verificationError)}</div>`;
  } else {
    const tiers = verification.tiers || [];
    const lazyTiers = verification.lazyVerification?.tiers || [];
    const lazyStatus = verification.lazyVerification?.status || 'not scheduled';
    verificationHtml = `
      <div class="ds"><div class="ds-label">verification — synchronous (L0-L5)</div>${tiers.map(tierRow).join('') || '<span style="color:var(--text3);font-size:10px">—</span>'}</div>
      <div class="ds"><div class="ds-label">verification — lazy (L6-L8) · ${escapeHtml(lazyStatus)}</div>${lazyTiers.map(tierRow).join('') || '<span style="color:var(--text3);font-size:10px">pending or not yet scheduled</span>'}</div>`;
  }

  const g = graph?.graphs || {};
  const st = (x) => `<span style="color:${x?.status==='built'?'var(--mint)':x?.status==='failed'?'var(--coral)':'var(--text3)'}">${escapeHtml(x?.status || 'missing')}</span>`;
  const codeTxt = g.code?.status === 'built' ? `${g.code.nodes ?? '—'} nodes · ${g.code.edges ?? '—'} edges · ${g.code.unresolved ?? 0} unresolved` : 'not built — reindex the repo';
  const ps = g.execution?.summary;
  const execTxt = g.execution?.status === 'built' && ps ? Object.entries(ps).filter(([,v]) => typeof v === 'number').map(([k,v]) => `${k} ${v}`).join(' · ')
    : g.execution?.status === 'failed' ? escapeHtml(g.execution.error || 'failed') : g.execution?.status === 'pending' ? 'running the repo\'s tests under coverage…' : 'not built';
  const specTxt = g.spec?.status === 'built' ? `${g.spec.specs} spec(s) · ${g.spec.entries} entries · ${g.spec.errors} wiring error(s) · ${g.spec.disagreements} disagreement(s) with code`
    : g.spec?.status === 'not_applicable' ? escapeHtml(g.spec.reason || 'no catalog .spec in this repo') : 'not built — reindex the repo';
  const graphHtml = graphError
    ? `<div class="detail-empty">${escapeHtml(graphError)}</div>`
    : `<div class="ds"><div class="ds-label">graphs — code · execution · spec</div><div class="ds-mono">code       ${st(g.code)}  ${codeTxt}\nexecution  ${st(g.execution)}  ${execTxt}\nspec       ${st(g.spec)}  ${specTxt}</div></div>`;

  el.innerHTML = verificationHtml + graphHtml;
}

// ── §0.39.261 IDEA TAB — James: "once a idea is a spec, move the idea section to
// the repo instead … a full idea tab and section for improving/iterating or
// expanding the project." The repo's own idea (editable), and its iterations:
// improve (make what exists better) · iterate (another pass on the same thing)
// · expand (new ground). Each iteration can go to the agent as a task, or onto
// the roadmap as a real phase in the repo's phasemap.
const _IDEA_KIND = { improve: { label: 'improve', color: 'var(--mint)' }, iterate: { label: 'iterate', color: 'var(--accent,#7dd3fc)' }, expand: { label: 'expand', color: 'var(--amber,#fbbf24)' } };
async function renderRepoIdea(repo) {
  const el = document.getElementById('repo-subtab-idea');
  if (!el || !repo) return;
  el.innerHTML = '<div class="detail-empty">loading idea…</div>';
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/idea`); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'idea') return;
  const it = r.iterations;
  const by = (k) => it.filter(x => x.kind === k);
  const row = (x) => `<div class="pend-row" style="padding:6px 0;border-bottom:1px solid var(--b0)">
      <div style="display:flex;gap:8px;align-items:baseline"><span style="font-family:var(--mono);font-size:9px;color:${(_IDEA_KIND[x.kind] || {}).color || 'var(--text3)'}">${escapeHtml(x.kind || '—')}</span>
        <span style="flex:1;white-space:pre-wrap;font-size:11px">${escapeHtml(x.text)}</span>
        <select onchange="repoIdeaStatus('${x.uuid}', this.value)" style="font-size:10px">${r.statuses.map(s => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div style="display:flex;gap:6px;margin-top:4px;font-size:10px">
        <button class="action-btn" onclick="repoIdeaToAgent('${x.uuid}')">send to agent</button>
        ${x.roadmapPhase ? `<span style="opacity:.7;font-family:var(--mono)">on roadmap · ${escapeHtml(x.roadmapPhase)}</span>` : `<button class="action-btn" onclick="repoIdeaToRoadmap('${x.uuid}')">add to roadmap</button>`}
        <span style="opacity:.45;margin-left:auto">${new Date(x.createdAt).toLocaleString()}</span></div></div>`;
  el.innerHTML = `
    <div class="ds"><div class="ds-label">the idea · ${escapeHtml(r.idea.phase)}${r.idea.tension != null ? ` · tension ${Number(r.idea.tension).toFixed(2)}` : ''} · ${r.idea.links} link(s)</div>
      <textarea id="repo-idea-text" class="field-textarea" rows="3" spellcheck="false">${escapeHtml(r.idea.text)}</textarea>
      <div class="action-row"><button class="action-btn" onclick="repoIdeaSave()">save idea</button></div></div>
    <div class="cmp-host cmp-detail cmp-in-repo"><div class="detail-empty">loading the lanes…</div></div>
    <details class="ds repo-iterations"><summary class="ds-label" style="cursor:pointer">iterations for the agent / roadmap · ${it.length}</summary>
      <div style="display:flex;gap:6px;margin:6px 0">${r.kinds.map(k => `<label style="font-size:11px"><input type="radio" name="repo-idea-kind" value="${k}" ${k === 'expand' ? 'checked' : ''}> ${k}</label>`).join('')}</div>
      <textarea id="repo-idea-new" class="field-textarea" rows="3" spellcheck="false" placeholder="improve: what should be better · iterate: another pass on something · expand: where the project goes next"></textarea>
      <div class="action-row"><button class="action-btn" onclick="repoIdeaAdd()">add</button><button class="action-btn" onclick="repoIdeaAdd(true)">add + send to agent</button></div>
      ${r.kinds.map(k => `<div class="ds"><div class="ds-label">${k} · ${by(k).length}</div>${by(k).map(row).join('') || '<div class="ds-mono" style="opacity:.5">none yet</div>'}</div>`).join('')}</details>`;
  // §0.39.263 — a spec's repo is its compartment: the idea's four lanes (brainstorm ·
  // problem solving · expand · improve, js/compartment.js) are this tab's body
  if (r.idea && r.idea.uuid && typeof openCompartmentIdea === 'function') {
    openCompartmentIdea(r.idea.uuid, { quiet: true, keepLane: typeof WBC !== 'undefined' && WBC.ideaUuid === r.idea.uuid });
  }
}
async function repoIdeaSave() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { await api(`/api/repos/${repo.uuid}/idea`, { method: 'PATCH', body: JSON.stringify({ text: document.getElementById('repo-idea-text').value }) }); toast('idea saved'); }
  catch (e) { toast(e.message, 'err'); }
}
async function repoIdeaAdd(send = false) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  const kind = (document.querySelector('input[name="repo-idea-kind"]:checked') || {}).value || 'expand';
  const text = document.getElementById('repo-idea-new').value.trim();
  if (!text) return toast('write the iteration first', 'err');
  let r;
  try { r = await api(`/api/repos/${repo.uuid}/idea/iterations`, { method: 'POST', body: JSON.stringify({ kind, text }) }); }
  catch (e) { return toast(e.message, 'err'); }
  if (send) return repoIdeaToAgent(r.iteration.uuid, r.iteration);
  renderRepoIdea(repo);
}
async function repoIdeaStatus(id, status) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { await api(`/api/repos/${repo.uuid}/idea/iterations/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }); }
  catch (e) { toast(e.message, 'err'); }
}
async function repoIdeaToRoadmap(id) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { const r = await api(`/api/repos/${repo.uuid}/idea/iterations/${id}/roadmap`, { method: 'POST', body: '{}' }); toast(`on the roadmap as ${r.phase} (${r.map})`); renderRepoIdea(repo); }
  catch (e) { toast(e.message, 'err'); }
}
// The agent gets the iteration as a task in its own words, in the Agent tab's
// CLI (so the exchange is logged there like any other), and the iteration moves
// to "doing".
async function repoIdeaToAgent(id, known = null) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  let x = known;
  if (!x) { try { x = (await api(`/api/repos/${repo.uuid}/idea`)).iterations.find(i => i.uuid === id); } catch (_) {} }
  if (!x) return toast('iteration not found', 'err');
  const verb = { improve: 'Improve this project', iterate: 'Iterate on this project', expand: 'Expand this project' }[x.kind] || 'Work on this project';
  await repoIdeaStatus(x.uuid, 'doing');
  setRepoSubtab('agent');
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 40 && !document.getElementById('agent-input'); i++) await wait(100);
  const ta = document.getElementById('agent-input');
  if (!ta) return toast('the Agent tab did not open', 'err');
  ta.value = `${verb}: ${x.text}\n\nStart from the project as it is — look before you change anything.`;
  agentSend();
}

// ── §0.39.261 DEBUG TAB — James: "a tab for debugging." One read of everything
// that is wrong (GET /api/repos/:uuid/debug), each part from where it lives, and
// the actions that act on it: re-run a check, run the tests, hand it to the agent.
async function renderRepoDebug(repo) {
  const el = document.getElementById('repo-subtab-debug');
  if (!el || !repo) return;
  el.innerHTML = '<div class="detail-empty">checking…</div>';
  let d;
  try { d = await api(`/api/repos/${repo.uuid}/debug`, {}, 120000); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'debug') return;
  _debugLast = d;
  const bad = (n) => `<span style="color:${n ? 'var(--coral)' : 'var(--mint)'}">${n}</span>`;
  const deps = d.deps || {};
  const nBroken = (deps.brokenRelative || []).length, nMissing = (deps.packages || []).length;
  const nSyntax = d.syntax && d.syntax.failed ? d.syntax.failed.length : 0;
  const lastRun = d.runs[0];
  el.innerHTML = `
    <div class="ds"><div class="ds-label">at a glance · checked ${new Date(d.checkedAt).toLocaleTimeString()}</div><div class="ds-mono">syntax errors        ${bad(nSyntax)}${d.syntax ? ` of ${d.syntax.checked} JS files` : ''}
broken imports       ${bad(nBroken)}
missing packages     ${bad(nMissing)}
parse failures       ${bad(d.parseFailures.length)}
failed tiers         ${bad(d.failedTiers.length)}${d.verification ? ` (verification ${escapeHtml(d.verification.status || '')} · ${escapeHtml(d.verification.level || '')})` : ' (not through the pipeline yet)'}
last COS run         ${lastRun ? `${escapeHtml(lastRun.label || lastRun.option)} — ${lastRun.allPassed ? '<span style="color:var(--mint)">passed</span>' : `<span style="color:var(--coral)">${lastRun.failed} failed</span>`} · ${new Date(lastRun.ts).toLocaleString()}` : 'none'}
agent errors         ${bad(d.agentErrors.length)}</div>
      <div class="action-row"><button class="action-btn" onclick="renderRepoDebug(CURRENT_API_REPO)">re-check</button><button class="action-btn" onclick="repoRun('test')">run tests…</button><button class="action-btn" onclick="repoDebugToAgent()">hand this to the agent</button></div></div>
    ${nSyntax ? `<div class="ds"><div class="ds-label">syntax errors</div><div class="ds-mono">${d.syntax.failed.map(f => `${escapeHtml(f.file)}${f.line ? `:${f.line}` : ''}  ${escapeHtml(f.error)}`).join('\n')}</div></div>` : ''}
    ${nBroken || nMissing ? `<div class="ds"><div class="ds-label">imports that resolve to nothing</div><div class="ds-mono">${(deps.brokenRelative || []).map(b => `${escapeHtml(b.file)} → ${escapeHtml(b.specifier)}`).join('\n')}${nMissing ? `${nBroken ? '\n\n' : ''}not installed: ${escapeHtml(deps.packages.map(p => p.name).join(', '))}` : ''}</div></div>` : ''}
    ${d.parseFailures.length ? `<div class="ds"><div class="ds-label">files the pipeline could not parse</div><div class="ds-mono">${d.parseFailures.map(f => `${escapeHtml(f.path)}${f.error ? `  ${escapeHtml(String(f.error).slice(0, 160))}` : ''}`).join('\n')}</div></div>` : ''}
    ${d.failedTiers.length ? `<div class="ds"><div class="ds-label">verification tiers that failed</div><div class="ds-mono">${d.failedTiers.map(t => `${escapeHtml(t.level)} ${escapeHtml(t.name || '')}${t.failures.length ? '\n' + t.failures.slice(0, 8).map(f => `  · ${escapeHtml(typeof f === 'string' ? f : (f.file || '') + ' ' + (f.error || f.reason || JSON.stringify(f)).slice(0, 200))}`).join('\n') : ''}`).join('\n')}</div></div>` : ''}
    ${(() => { const lf = d.runs.find(x => !x.allPassed && (x.failures || []).some(f => f.debug)); return lf ? `<div class="ds"><div class="ds-label">failures of the last failing run — ${escapeHtml(lf.label || lf.option)} · ${new Date(lf.ts).toLocaleString()}</div>${lf.failures.filter(f => f.debug).map(f => debugReportHtml(f.debug, f.file)).join('')}</div>` : ''; })()}
    <div class="ds"><div class="ds-label">COS runs · ${d.runs.length}</div>${d.runs.map(r => `<div class="ds-mono" style="border-bottom:1px solid var(--b0);padding:4px 0">${r.allPassed ? '✓' : '✗'} ${escapeHtml(r.label || r.option)} · ${r.passed} passed ${r.failed} failed · ${r.durationMs}ms · ${new Date(r.ts).toLocaleString()}${(r.failures || []).map(f => `\n   ${escapeHtml(f.file)} exit ${f.exitCode ?? '—'} ${escapeHtml(f.error || f.health || '')}${f.stderr ? '\n   ' + escapeHtml(_stderrGist(f.stderr)) : ''}`).join('')}</div>`).join('') || '<div class="ds-mono" style="opacity:.5">no runs yet — Run opens the COS run menu</div>'}</div>
    <div class="ds"><div class="ds-label">agent errors · ${d.agentErrors.length}</div>${d.agentErrors.map(a => `<div class="ds-mono" style="border-bottom:1px solid var(--b0);padding:4px 0">${new Date(a.ts).toLocaleString()} · ${escapeHtml(a.backend || '')}\n  asked: ${escapeHtml(a.message)}\n  <span style="color:var(--coral)">${escapeHtml(a.error || '')}</span></div>`).join('') || '<div class="ds-mono" style="opacity:.5">none</div>'}</div>`;
}
let _debugLast = null;

// ── CODE — §0.39.273 CB4/CB5 search and chunk cards; since 0.39.349 (CT3) the whole tab is the work surface:
// idearium/ui/js/code-surface.js (renderRepoCode, its search, its cards, the agent's diffs, the docked agent).
// §0.39.271 T3 — one failure's debug report (lib/cos-debug-report.js): the error, the frames
// that land in the repo with their source lines, and what the failure usually means
function debugReportHtml(dbg, file) {
  if (!dbg) return '';
  const frames = (dbg.frames || []).map(f => `<div style="margin:4px 0 2px"><span style="color:var(--sky2)">${escapeHtml(f.file)}:${f.line}${f.col ? ':' + f.col : ''}</span>${f.fn ? ` <span style="opacity:.6">${escapeHtml(f.fn)}</span>` : ''}${f.inRepo ? '' : ' <span style="opacity:.5">(outside the run directory)</span>'}</div>` +
    (f.excerpt ? `<pre style="margin:0;font-size:10px;line-height:1.5;background:var(--b0);padding:4px 6px;border-radius:4px;overflow:auto">${f.excerpt.map(x => `<span style="${x.at ? 'color:var(--coral)' : 'opacity:.7'}">${String(x.n).padStart(4)} ${x.at ? '▶' : ' '} ${escapeHtml(x.text)}</span>`).join('\n')}</pre>` : '')).join('');
  return `<div style="border-left:2px solid var(--coral);padding:4px 0 4px 8px;margin:6px 0;font-family:var(--mono);font-size:10.5px">
    <div><b style="color:var(--coral)">✗ ${escapeHtml(file || dbg.file || '')}</b>${dbg.exitCode != null ? ` <span style="opacity:.6">exit ${dbg.exitCode}</span>` : ''}${dbg.timedOut ? ' <span style="color:var(--amber)">timed out</span>' : ''}</div>
    ${dbg.error ? `<div style="color:var(--text);margin:3px 0">${escapeHtml(dbg.error)}</div>` : ''}
    ${(dbg.errorLines || []).slice(1, 4).map(l => `<div style="opacity:.7">${escapeHtml(l)}</div>`).join('')}
    ${frames}${dbg.outside ? `<div style="opacity:.5;margin-top:3px">${dbg.outside} frame(s) outside the repo (runtime, node_modules)</div>` : ''}
    ${dbg.hint ? `<div style="color:var(--amber);margin-top:4px">${escapeHtml(dbg.hint)}</div>` : ''}</div>`;
}
// the line of a failing run's stderr that says what went wrong (an Error line and
// the first stack frame in the project), not whatever happened to be printed last
function _stderrGist(stderr) {
  const lines = String(stderr || '').split('\n').map(l => l.trimEnd()).filter(Boolean);
  const i = lines.findIndex(l => /\b(?:[A-Z][a-z]+)?Error\b|Cannot find|ERR_|failed|✗/.test(l) && !/^\s*at /.test(l));
  if (i === -1) return lines.slice(-3).join('\n');
  const frame = lines.slice(i + 1).find(l => /^\s*at /.test(l) && !/node:internal/.test(l));
  return [lines[i], frame].filter(Boolean).join('\n').slice(0, 400);
}
async function repoDebugToAgent() {
  const d = _debugLast; if (!d) return;
  const lines = [];
  for (const f of (d.syntax && d.syntax.failed) || []) lines.push(`syntax: ${f.file}${f.line ? ':' + f.line : ''} ${f.error}`);
  for (const b of (d.deps && d.deps.brokenRelative) || []) lines.push(`broken import: ${b.file} -> ${b.specifier}`);
  for (const p of (d.deps && d.deps.packages) || []) lines.push(`missing package: ${p.name}`);
  for (const f of d.parseFailures) lines.push(`parse failure: ${f.path}${f.error ? ' ' + f.error : ''}`);
  const r = d.runs.find(x => !x.allPassed);
  if (r) for (const f of r.failures || []) {
    // §0.39.271 T3 — the debug report goes with it: the error, and where in the repo it happened
    const dbg = f.debug;
    const at = dbg && dbg.frames && dbg.frames.find(x => x.inRepo);
    lines.push(`failing run (${r.label || r.option}): ${f.file} exit ${f.exitCode}${dbg && dbg.error ? ` — ${dbg.error}` : f.stderr ? ' — ' + _stderrGist(f.stderr).replace(/\n\s*/g, ' / ') : ''}${at ? ` — at ${at.file}:${at.line}${at.excerpt ? ` \`${(at.excerpt.find(x => x.at) || {}).text || ''}\`` : ''}` : ''}${dbg && dbg.hint ? ` (${dbg.hint})` : ''}`);
  }
  if (!lines.length) return toast('nothing to hand over — the checks are clean');
  setRepoSubtab('agent');
  for (let i = 0; i < 40 && !document.getElementById('agent-input'); i++) await new Promise(res => setTimeout(res, 100));
  const ta = document.getElementById('agent-input'); if (!ta) return;
  ta.value = `Debug this project. These are the real findings from its Debug tab:\n${lines.slice(0, 40).map(l => '- ' + l).join('\n')}\n\nFind the cause of each before changing anything, and say which you could not fix.`;
  agentSend();
}

// ── §0.39.261 NEXUS REPOS — Nexus, managed from inside Nexus ─────────────────
// The parent repo "nexus" and one immutable repo per system (autopilot kernels
// + core), each in its own nested COS compartment. Home = the system's atlas,
// its understanding over time and its edit branches; Phasemap = loom's phases
// for that system; Spec = the system's own .spec files. GET /api/nexus-self/*.
const _nsFmt = (n) => (n === null || n === undefined) ? '—' : (typeof n === 'number' && !Number.isInteger(n) ? n.toFixed(3) : String(n));
const _nsDelta = (cur, prev, k, higherBetter = true) => {
  if (!prev || prev[k] === undefined || cur[k] === undefined || cur[k] === prev[k]) return '';
  const d = cur[k] - prev[k]; const good = higherBetter ? d > 0 : d < 0;
  return ` <span style="color:${good ? 'var(--mint)' : 'var(--coral)'}">${d > 0 ? '+' : ''}${_nsFmt(+d.toFixed(4))}</span>`;
};

async function renderNexusHome(repo, el) {
  el.innerHTML = `<div class="detail-empty">loading Nexus…</div>`;
  const stillHere = () => CURRENT_API_REPO?.uuid === repo.uuid && CURRENT_REPO_SUBTAB === 'home';
  // §0.39.263 — the nexus repo's Home is the Nexus atlas (ui/js/nexus-atlas.js);
  // the operational panels below live in its collapsible "snapshot · …" section.
  if (repo.nexusSelf.role === 'parent' || repo.nexusSelf.system === 'core') return renderNexusAtlasHome(repo, el);   // §0.39.265 — nexus and nexus/core are one repo
  return _nexusSystemHome(repo, el, stillHere);
}

async function _nexusOpsInto(el, repo) {
  if (!el) return;
  const stillHere = () => CURRENT_API_REPO?.uuid === repo.uuid && document.body.contains(el);
  {
    let st, und, ap;
    try { [st, und, ap] = await Promise.all([api('/api/nexus-self'), api('/api/nexus-self/understanding'), api('/api/nexus-self/applies')]); }
    catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
    if (!stillHere()) return;
    const L = und.latest;
    const tree = (n, d = 0) => n ? `${'  '.repeat(d)}${d ? '└ ' : ''}${n.name}  [${n.state}]\n` + (n.children || []).map(c => tree(c, d + 1)).join('') : '';
    el.innerHTML = `
      <div class="ds"><div class="ds-label">nexus · immutable base</div><div class="ds-mono">snapshot ${escapeHtml(String(st.head || '—'))}
${(st.history || []).length} snapshot(s) recorded · ${st.syncing ? 'syncing now…' : st.lastSync ? `last sync ${new Date(st.lastSync.at).toLocaleString()} (${st.lastSync.ms || '—'} ms)${st.lastSync.error ? ' — ' + escapeHtml(st.lastSync.error) : ''}` : 'not synced in this idearium process yet'}
edits: branch a system (its Home tab) → run it (Run menu) → apply through the gate</div>
        <div class="action-row"><button class="action-btn" onclick="nexusSelfSync()">sync now</button></div></div>
      <div class="ds"><div class="ds-label">systems</div><div class="ds-mono">${st.systems.map(x => `${x.system.padEnd(14)} ${String(x.fileCount).padStart(5)} files  ${x.versions} version(s)  ${x.repoUuid ? '' : '(not synced)'}`).join('\n')}</div></div>
      <div class="ds"><div class="ds-label">understanding — what Nexus knows about itself</div><div class="ds-mono">${L ? `symbols ${_nsFmt(L.totals.symbols)} · graph edges ${_nsFmt(L.totals.graphEdges)} · cross-system ${_nsFmt(L.totals.crossSystemEdges)} · nexus-level resolution ${_nsFmt(L.totals.nexusResolution)} (per-system ${_nsFmt(L.totals.resolution)})
genuine gaps: ${_nsFmt(L.totals.brokenImports)} broken import(s) · ${_nsFmt(L.totals.missingPackages)} missing package import(s)
parse failures ${_nsFmt(L.totals.parseFailures)} · specs ${_nsFmt(L.totals.specs)} · spec entries ${_nsFmt(L.totals.specEntries)} · phases done ${_nsFmt(L.totals.phasesDone)}/${_nsFmt(L.totals.phasesTotal)}
${L.improved && L.improved.length ? `improved: ${L.improved.join(', ')}` : 'improved: —'}${L.regressed && L.regressed.length ? `\nregressed: ${L.regressed.join(', ')}` : ''}
${und.history.length} measurement(s) since ${new Date(und.history[0].at).toLocaleDateString()}` : 'no measurement yet — sync once'}</div></div>
      <div class="ds"><div class="ds-label">system graph — who depends on whom (cross-system imports, resolved against the snapshot)</div><div class="ds-mono">${st.systemGraph ? `${st.systemGraph.edges.map(e => `${e.from.padEnd(14)} → ${e.to.padEnd(14)} ${String(e.count).padStart(4)}`).join('\n')}

genuine gaps: ${st.systemGraph.broken.length} broken relative import(s) · ${st.systemGraph.missing.length} package(s) not installed${st.systemGraph.missing.length ? ` (${escapeHtml(st.systemGraph.missing.map(m => m.name).join(', '))})` : ''}
${st.systemGraph.broken.slice(0, 20).map(b => `  ${escapeHtml(b.from)} → ${escapeHtml(b.spec)}`).join('\n')}` : 'built on the next sync'}</div></div>
      <div class="ds"><div class="ds-label">compartments (COS, nested)</div><div class="ds-mono">${escapeHtml(tree(st.compartments) || 'not created yet')}</div></div>
      <div class="ds"><div class="ds-label">applied changes</div>${(ap.applies || []).length ? ap.applies.map(a => `<div class="pend-row" style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--b0)"><span style="font-family:var(--mono);font-size:10px">${escapeHtml(a.id)} · ${escapeHtml(a.system)} · ${a.items.length} file(s) · ${escapeHtml(a.status)} · ${new Date(a.at).toLocaleString()}${a.reason ? ' — ' + escapeHtml(a.reason) : ''}</span>${a.status === 'applied' ? `<button class="action-btn" onclick="nexusSelfRollback('${a.id}')">roll back</button>` : ''}</div>`).join('') : '<div class="ds-mono">none yet</div>'}</div>`;
  }
}

async function _nexusSystemHome(repo, el, stillHere) {
  let v;
  try { v = await api(`/api/nexus-self/${encodeURIComponent(repo.nexusSelf.system)}`); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  let br = { branches: [] };
  try { br = await api(`/api/nexus-self/${encodeURIComponent(v.system)}/branches`); } catch (_) {}
  if (!stillHere()) return;
  const a = v.atlas || {};
  const U = v.understanding.latest, P = v.understanding.previous;
  const kv = (o) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(' · ');
  el.innerHTML = `
    <div class="nx-crumbs"><span class="nx-link" onclick="nexusAtlasHome()">nexus</span> › <b>${escapeHtml(v.system)}</b> <span class="nx-dim">· one of ${escapeHtml(String((v.siblings || []).length || '—'))} systems</span></div>
    <details class="ds nx-sys-atlas" open><summary class="ds-label">${v.atlasDoc ? `atlas — ${escapeHtml(v.atlasDoc)}` : 'atlas'}</summary><div id="nx-sys-atlas-doc"><div class="ds-mono">loading…</div></div></details>
    <div class="ds"><div class="ds-label">nexus/${escapeHtml(v.system)} · immutable</div><div class="ds-mono">${escapeHtml((v.def.dirs || ['everything no kernel owns']).join(', '))}${v.def.entry ? `\nentry ${escapeHtml(v.def.entry)} · port :${v.def.port}` : ''}
snapshot ${escapeHtml(String(v.repo?.snapshot || '—').slice(0, 16))} · ${v.repo?.fileCount ?? '—'} files · ${(v.repo?.versions || []).length} version(s) · synced ${v.repo?.syncedAt ? new Date(v.repo.syncedAt).toLocaleString() : '—'}</div></div>
    <div class="ds"><div class="ds-label">atlas</div>${a.error ? `<div class="ds-mono">${escapeHtml(a.error)}</div>` : `<div class="ds-mono">${a.fileCount} files parsed${a.failedCount ? ` · ${a.failedCount} failed` : ''}
languages  ${escapeHtml(kv(a.byLanguage))}
kinds      ${escapeHtml(kv(a.byKind))}

${(a.dirs || []).slice(0, 24).map(d => `${d.dir.padEnd(34)} ${String(d.files).padStart(4)} files ${String(d.symbols).padStart(5)} symbols  ${escapeHtml(kv(d.kinds))}`).join('\n')}

largest (by symbols)
${(a.topComponents || []).map(c => `  ${escapeHtml(c.path)}  ${c.symbolCount} · ${escapeHtml(c.kind)}`).join('\n')}</div>`}</div>
    <div class="ds"><div class="ds-label">understanding${P ? ' · change since last measurement' : ''}</div><div class="ds-mono">${U ? `symbols ${_nsFmt(U.symbols)}${_nsDelta(U, P, 'symbols')} · graph ${_nsFmt(U.graphNodes)} nodes / ${_nsFmt(U.graphEdges)} edges${_nsDelta(U, P, 'graphEdges')}
unresolved ${_nsFmt(U.unresolved)}${_nsDelta(U, P, 'unresolved', false)} · resolution ${_nsFmt(U.resolution)}${_nsDelta(U, P, 'resolution')} · parse failures ${_nsFmt(U.parseFailures)}${_nsDelta(U, P, 'parseFailures', false)}
specs ${_nsFmt(U.specs)}${_nsDelta(U, P, 'specs')} · spec entries ${_nsFmt(U.specEntries)} · spec↔code disagreements ${_nsFmt(U.specDisagreements)}${_nsDelta(U, P, 'specDisagreements', false)}
phases ${_nsFmt(U.phasesDone)}/${_nsFmt(U.phasesTotal)} done${_nsDelta(U, P, 'phasesDone')} · verification ${escapeHtml(U.verification || '—')}
${v.understanding.history.length} measurement(s)` : 'not measured yet'}</div></div>
    <div class="ds"><div class="ds-label">edit branches (COS, compartment nexus-self-${escapeHtml(v.system)})</div>
      ${(br.branches || []).map(b => `<div class="pend-row" style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--b0)"><span style="font-family:var(--mono);font-size:10px">${escapeHtml(b.label)} · ${escapeHtml(b.id)} · base ${escapeHtml(b.base.slice(0, 8))} · ${(b.runs || []).length} run(s)</span><button class="action-btn" onclick="nexusBranchOpen('${escapeHtml(v.system)}','${b.id}')">open</button></div>`).join('') || '<div class="ds-mono">no branches</div>'}
      <div class="action-row"><button class="action-btn" onclick="nexusBranchNew('${escapeHtml(v.system)}')">new branch</button></div></div>`;
  nxSystemAtlasDoc(document.getElementById('nx-sys-atlas-doc'), v.atlasDoc);
}

async function renderNexusPhasemap(repo, el) {
  el.innerHTML = `<div class="detail-empty">loading loom phases…</div>`;
  let v;
  try { v = await api(`/api/nexus-self/${encodeURIComponent(repo.nexusSelf.system)}`); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'phasemap') return;
  const p = v.phases;
  const col = (st) => st === 'done' ? 'var(--mint)' : st === 'in-progress' ? 'var(--amber,#fbbf24)' : 'var(--text3)';
  el.innerHTML = `<div class="ds"><div class="ds-label">loom phasemap · ${escapeHtml(v.system)} · tags ${escapeHtml((p.tags || []).join(', ') || '—')}</div>
      <div class="ds-mono">${p.total} phases · ${p.done} done · ${p.inProgress} in progress · ${p.pending} pending · across ${Object.keys(p.maps).length} phasemap(s)</div></div>` +
    Object.entries(p.maps).sort((a, b) => b[0].localeCompare(a[0])).map(([map, list]) => `<div class="ds"><div class="ds-label">${escapeHtml(map)} · ${list.filter(x => x.status === 'done').length}/${list.length}</div>` +
      list.map(ph => `<div class="pend-row" style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--b0)"><span style="font-family:var(--mono);font-size:10px">${escapeHtml(ph.id)}${ph.title ? ' — ' + escapeHtml(ph.title) : ''}${(ph.dependsOn || []).length ? ` <span style="color:var(--text3)">← ${escapeHtml(ph.dependsOn.join(', '))}</span>` : ''}</span><span style="font-family:var(--mono);font-size:10px;color:${col(ph.status)}">${escapeHtml(ph.status)}</span></div>`).join('') + `</div>`).join('');
}

async function renderNexusSpec(repo, el) {
  el.innerHTML = `loading ${escapeHtml(repo.nexusSelf.system)}'s specs…`;
  let v;
  try { v = await api(`/api/nexus-self/${encodeURIComponent(repo.nexusSelf.system)}`); }
  catch (e) { el.innerHTML = escapeHtml(e.message); return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'spec') return;
  const sp = v.specs;
  el.innerHTML = `<div style="text-align:left"><div class="ds"><div class="ds-label">${escapeHtml(v.system)} · .spec files in ${escapeHtml((sp.dirs || []).join(', '))} · ${sp.specs.length}</div>
    ${sp.specs.map(x => `<div class="pend-row" style="padding:3px 0;border-bottom:1px solid var(--b0);cursor:pointer" onclick="nexusSpecOpen('${escapeHtml(v.system)}','${escapeHtml(x.path)}')"><span style="font-family:var(--mono);font-size:10px">${escapeHtml(x.path)}${x.title ? ' — ' + escapeHtml(x.title) : ''} <span style="color:var(--text3)">${Math.round(x.bytes / 1024)} KB</span></span></div>`).join('') || '<div class="ds-mono">this system has no .spec files</div>'}</div>
    <div class="ds"><div class="ds-label" id="nexus-spec-title">read-only (immutable) — pick a spec</div><div class="ds-mono" id="nexus-spec-body" style="max-height:520px;overflow:auto"></div></div></div>`;
}
async function nexusSpecOpen(system, p) {
  const body = document.getElementById('nexus-spec-body'); if (!body) return;
  body.textContent = 'loading…';
  try { const r = await api(`/api/nexus-self/${encodeURIComponent(system)}/spec?path=${encodeURIComponent(p)}`); document.getElementById('nexus-spec-title').textContent = `${p} · read-only (immutable)`; body.textContent = r.content; }
  catch (e) { body.textContent = e.message; }
}

async function nexusSelfSync() {
  try { await api('/api/nexus-self/sync', { method: 'POST', body: JSON.stringify({}) }); toast('Nexus repo sync started'); }
  catch (e) { toast(e.message, 'err'); }
}
async function nexusSelfRollback(id) {
  if (!confirm(`Roll back ${id}? The live files it changed return to their state before it.`)) return;
  try { await api(`/api/nexus-self/applies/${encodeURIComponent(id)}/rollback`, { method: 'POST', body: JSON.stringify({ reason: 'rolled back from idearium' }) }); toast(`${id} rolled back`); renderCurrentRepoSubtab(); }
  catch (e) { toast(e.message, 'err'); }
}
async function nexusBranchNew(system) {
  const label = prompt(`New edit branch of nexus/${system} — label:`, `${system} edit`);
  if (label === null) return;
  try { const r = await api(`/api/nexus-self/${encodeURIComponent(system)}/branch`, { method: 'POST', body: JSON.stringify({ label }) }); nexusBranchOpen(system, r.branch.id); }
  catch (e) { toast(e.message, 'err'); }
}

// The branch editor: one system's files at the branch's base, editable. Its
// changes are what the apply gate receives; Run uses the COS run menu with this
// branch preselected.
let _nsBranch = null;
async function nexusBranchOpen(system, id) {
  _nsBranch = { system, id };
  document.getElementById('repo-diagnose-title').textContent = `nexus/${system} · branch ${id}`;
  document.getElementById('repo-diagnose-reindex').style.display = 'none';
  document.getElementById('repo-diagnose-modal').classList.add('open');
  await _nsBranchRender();
}
async function _nsBranchRender(openPath = null, content = null, diff = null) {
  const B = _nsBranch; if (!B) return;
  const body = document.getElementById('repo-diagnose-body');
  let r;
  try { r = await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}`); }
  catch (e) { body.innerHTML = `<div style="color:var(--bad,#f87171)">${escapeHtml(e.message)}</div>`; return; }
  const files = (CURRENT_API_REPO?.files || []).map(f => f.path);
  const lastRun = (r.branch.runs || []).slice(-1)[0];
  body.innerHTML = `
    <div style="font-size:11px;opacity:.8;margin-bottom:6px">base ${escapeHtml(r.branch.base.slice(0, 16))} · ${r.changes.length} change(s) · last run: ${lastRun ? `${escapeHtml(lastRun.option || lastRun.mode || 'run')} ${lastRun.passed ? '✓ passed' : '✗ failed'} ${new Date(lastRun.recordedAt).toLocaleTimeString()}` : 'none'}</div>
    ${r.changes.map(c => `<div style="font-family:var(--mono);font-size:10px;cursor:pointer" onclick="_nsBranchLoad('${escapeHtml(c.path)}', true)">${c.op === 'add' ? '+' : c.op === 'delete' ? '−' : '~'} ${escapeHtml(c.path)}</div>`).join('')}
    <div style="display:flex;gap:6px;margin:8px 0"><input id="ns-br-path" list="ns-br-files" placeholder="${escapeHtml(B.system === 'core' ? 'lib/…' : B.system + '/…')}" value="${escapeHtml(openPath || '')}" style="flex:1"><datalist id="ns-br-files">${files.slice(0, 3000).map(f => `<option value="${escapeHtml(f)}">`).join('')}</datalist>
      <button class="action-btn" onclick="_nsBranchLoad(document.getElementById('ns-br-path').value)">open</button>
      <button class="action-btn" onclick="_nsBranchSave()">save</button>
      <button class="action-btn" onclick="_nsBranchDelete()">delete file</button></div>
    <textarea id="ns-br-text" spellcheck="false" style="width:100%;height:260px;font-family:var(--mono);font-size:11px">${escapeHtml(content || '')}</textarea>
    ${diff ? `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:10px;margin:6px 0">${escapeHtml(diff)}</pre>` : ''}
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="action-btn" onclick="_nsBranchRun()">Run…</button>
      <button class="action-btn" onclick="_nsBranchPlan()">plan (dry run)</button>
      <button class="modal-btn confirm" onclick="_nsBranchApply()">apply to live Nexus</button>
      <button class="action-btn" onclick="_nsBranchDiscard()">discard branch</button></div>
    <div id="ns-br-out" style="margin-top:8px;font-size:11px"></div>`;
}
async function _nsBranchLoad(p, withDiff = false) {
  const B = _nsBranch; if (!B || !p) return;
  try { const r = await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}/file?path=${encodeURIComponent(p)}${withDiff ? '&diff=1' : ''}`); await _nsBranchRender(r.path, r.content, r.diff || null); }
  catch (e) { await _nsBranchRender(p, '', null); document.getElementById('ns-br-out').textContent = `${e.message} — type content and save to add it as a new file`; }
}
async function _nsBranchSave() {
  const B = _nsBranch; const p = document.getElementById('ns-br-path').value; const content = document.getElementById('ns-br-text').value;
  try { await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}/file`, { method: 'PUT', body: JSON.stringify({ path: p, content }) }); await _nsBranchLoad(p, true); toast(`saved ${p} on the branch`); }
  catch (e) { document.getElementById('ns-br-out').textContent = e.message; }
}
async function _nsBranchDelete() {
  const B = _nsBranch; const p = document.getElementById('ns-br-path').value;
  if (!p || !confirm(`Delete ${p} on this branch?`)) return;
  try { await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}/file?path=${encodeURIComponent(p)}`, { method: 'DELETE' }); await _nsBranchRender(); }
  catch (e) { document.getElementById('ns-br-out').textContent = e.message; }
}
async function _nsBranchRun() {
  const B = _nsBranch;
  await repoRun('run');
  if (_runMenu) { _runMenu.presetBranch = B.id; _renderRunMenu(); const sel = document.getElementById('run-menu-branch'); if (sel) sel.value = B.id; }
}
async function _nsBranchPlan() {
  const B = _nsBranch; const out = document.getElementById('ns-br-out');
  try { const r = await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}/plan`, { method: 'POST', body: '{}' });
    out.innerHTML = r.ok ? `<span style="color:var(--mint)">plan ok</span> — ${r.items.map(i => `${i.op} ${escapeHtml(i.path)}`).join(', ')}` : `<span style="color:var(--coral)">refused</span> — ${escapeHtml([...r.errors, ...r.conflicts.map(c => `CONFLICT ${c.path}: ${c.why}`)].join('; '))}`; }
  catch (e) { out.textContent = e.message; }
}
async function _nsBranchApply() {
  const B = _nsBranch; const out = document.getElementById('ns-br-out');
  const reason = prompt('Apply this branch to the live Nexus tree. Reason (kept in the apply record and the ledger):', '');
  if (reason === null) return;
  out.textContent = 'applying…';
  try { const r = await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}/apply`, { method: 'POST', body: JSON.stringify({ reason }) }, 300000);
    out.innerHTML = `<span style="color:var(--mint)">applied ${escapeHtml(r.applyId)}</span> — ${r.applied.length} file(s) · new snapshot ${escapeHtml(r.snapshot.slice(0, 12))}${r.understanding && r.understanding.improved && r.understanding.improved.length ? ` · understanding improved: ${escapeHtml(r.understanding.improved.join(', '))}` : ''}`;
    _nsBranch = null; await loadApiRepos?.(); }
  catch (e) { out.innerHTML = `<span style="color:var(--coral)">${escapeHtml(e.message)}</span>`; }
}
async function _nsBranchDiscard() {
  const B = _nsBranch;
  if (!confirm(`Discard branch ${B.id}? Its edits are deleted; the live tree is untouched.`)) return;
  try { await api(`/api/nexus-self/${encodeURIComponent(B.system)}/branch/${B.id}`, { method: 'DELETE' }); document.getElementById('repo-diagnose-modal').classList.remove('open'); _nsBranch = null; renderCurrentRepoSubtab(); }
  catch (e) { document.getElementById('ns-br-out').textContent = e.message; }
}

// ── INTELLIGENCE — structural scan of THIS repo: dangling hooks, gaps,
// tension. GET /api/repos/:uuid/scan (idearium/repo/scan.js).
//
// A repo that has never been through the import pipeline is a real,
// ordinary state — not an error — so the endpoint returns ok:true with
// scanned:false and a reason. (It must NOT return ok:false: api() above
// throws on that, which would make this empty state unreachable.)
// §0.39.271 P4 — Intelligence = the scan (unchanged, #intel-scan) + the verification
// tiers and graphs that used to be the Phasemap tab (#intel-verify).
async function renderRepoIntelligence(repo) {
  const host = document.getElementById('repo-subtab-intelligence');
  if (!host) return;
  host.innerHTML = `<div id="intel-scan"></div><div id="intel-verify"><div class="detail-empty">loading verification…</div></div>`;
  renderRepoPhasemap(repo, { el: document.getElementById('intel-verify'), subtab: 'intelligence' });
  return _renderRepoIntelligenceScan(repo);
}
async function _renderRepoIntelligenceScan(repo) {
  const el = document.getElementById('intel-scan');
  if (!el) return;
  const forUuid = repo.uuid;
  el.innerHTML = `<div class="detail-empty">scanning…</div>`;

  let scan;
  try { scan = await api(`/api/repos/${forUuid}/scan`, {}, 20000); }
  catch (e) {
    if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'intelligence') return;
    el.innerHTML = `<div class="detail-empty">scan request failed: ${escapeHtml(e.message)}</div>`;
    return;
  }
  if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'intelligence') return;

  if (scan.scanned === false) {
    el.innerHTML = `
      <div class="ds"><div class="ds-label">not scanned</div>
        <div class="ds-mono">${escapeHtml(scan.reason || 'scan unavailable')}</div>
        ${scan.remedy === 'reindex' ? `<div class="action-row"><button class="action-btn" onclick="reindexRepoThenScan('${forUuid}')">run import pipeline now</button></div>` : ''}
      </div>`;
    return;
  }

  const h = scan.headline || {};
  const num = (n, good) => `<span style="color:${n > 0 ? (good ? 'var(--text)' : 'var(--coral)') : 'var(--mint)'}">${n}</span>`;

  // ── headline strip — counts only, never a composite "health score".
  const headline = `
    <div class="ds"><div class="ds-label">scan · ${escapeHtml(String(scan.fileCount ?? '—'))} files · ${escapeHtml(String(scan.edgeCount ?? '—'))} edges</div>
      <div class="ds-mono">broken links      ${num(h.brokenLinks || 0)}
parse failures    ${num(h.parseFailures || 0)}
failed tiers      ${num(h.failedTiers || 0)}
uncovered files   ${num(h.uncoveredFiles || 0)}
stress points     ${num(h.stressPoints || 0, true)}</div>
    </div>`;

  // ── dangling hooks ──────────────────────────────────────────────────
  const d = scan.dangling || {};
  const hookRow = (x) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px solid var(--b0)">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.from || '?')}${x.line != null ? `:${x.line}` : ''}</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--coral);flex-shrink:0">→ ${escapeHtml(x.target || '(none)')}</span>
    </div>`;

  const brokenBlock = d.brokenCount
    ? `<div class="ds"><div class="ds-label">dangling hooks — broken (${d.brokenCount})</div>
         <div style="font-size:10px;color:var(--text3);margin-bottom:6px">a relative path imported from inside this repo that does not resolve to a file here</div>
         ${d.broken.map(hookRow).join('')}
         ${d.brokenTruncated ? `<div style="font-size:10px;color:var(--text3);margin-top:6px">showing first ${d.broken.length} of ${d.brokenCount}</div>` : ''}
       </div>`
    : `<div class="ds"><div class="ds-label">dangling hooks — broken</div><div class="ds-mono" style="color:var(--mint)">none — every intra-repo import resolves</div></div>`;

  const parseBlock = d.parseFailedCount
    ? `<div class="ds"><div class="ds-label">unparseable files (${d.parseFailedCount})</div>
         <div style="font-size:10px;color:var(--text3);margin-bottom:6px">the indexer could not read or parse these at all — everything downstream of them is blind</div>
         ${d.parseFailed.map(hookRow).join('')}</div>`
    : '';

  const chunkBlock = d.chunkGapCount
    ? `<div class="ds"><div class="ds-label">symbols outside every chunk (${d.chunkGapCount})</div>
         <div style="font-size:10px;color:var(--text3);margin-bottom:6px">real symbols the chunker left uncovered — they exist in the file but no chunk owns them</div>
         ${d.chunkGap.map(hookRow).join('')}</div>`
    : '';

  // External refs are NOT a defect — stated as such, and collapsed.
  const externalBlock = d.externalCount
    ? `<div class="ds"><div class="ds-label">external references (${d.externalCount})</div>
         <div class="ds-mono" style="color:var(--text3)">packages and system modules outside this repo. An intra-repo graph cannot resolve these by design — listed for completeness, not as a problem.</div>
         ${Object.entries(d.byReason || {}).map(([k, v]) => `<div style="font-family:var(--mono);font-size:10px;color:var(--text3);padding:2px 0">${escapeHtml(k)} · ${v}</div>`).join('')}
       </div>`
    : '';

  // ── gaps ────────────────────────────────────────────────────────────
  const g = scan.gaps || {};
  const tierRow = (t) => `<div style="padding:4px 0;border-bottom:1px solid var(--b0)">
      <div style="display:flex;justify-content:space-between">
        <span style="font-family:var(--mono);font-size:10px;color:var(--text2)">${escapeHtml(String(t.level))}${t.name ? ` · ${escapeHtml(t.name)}` : ''}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--coral)">${escapeHtml(t.status)}</span>
      </div>
      ${t.detail ? `<div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);padding-left:8px">${escapeHtml(t.detail)}</div>` : ''}
      ${t.failures ? t.failures.map(f => `<div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);padding-left:8px">· ${escapeHtml(typeof f === 'string' ? f : JSON.stringify(f))}</div>`).join('') : ''}
      ${t.failureCount && t.failures && t.failureCount > t.failures.length ? `<div style="font-size:9.5px;color:var(--text3);padding-left:8px">…${t.failureCount - t.failures.length} more</div>` : ''}
    </div>`;

  let gapsBlock;
  if (!g.verificationPresent) {
    gapsBlock = `<div class="ds"><div class="ds-label">gaps — verification</div><div class="ds-mono">no verification.json — this repo was indexed but never verified.</div></div>`;
  } else if (!g.failedTiers.length && !g.pendingTiers.length) {
    gapsBlock = `<div class="ds"><div class="ds-label">gaps — verification</div><div class="ds-mono" style="color:var(--mint)">every tier passed${g.lazyStatus ? ` · lazy L6-L8 ${escapeHtml(g.lazyStatus)}` : ''}</div></div>`;
  } else {
    gapsBlock = `<div class="ds"><div class="ds-label">gaps — verification (${g.failedTiers.length} failed, ${g.pendingTiers.length} pending)</div>
      ${g.failedTiers.map(tierRow).join('')}
      ${g.pendingTiers.map(t => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--b0)"><span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${escapeHtml(String(t.level))}</span><span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${escapeHtml(t.status)}</span></div>`).join('')}
    </div>`;
  }

  const uncoveredBlock = g.uncoveredFileCount
    ? `<div class="ds"><div class="ds-label">gaps — files no chunk covers (${g.uncoveredFileCount})</div>
         <div style="font-size:10px;color:var(--text3);margin-bottom:6px">present in the repo, absent from the chunk index — invisible to anything that reads by chunk</div>
         <div class="ds-mono">${g.uncoveredFiles.map(f => escapeHtml(f)).join('\n')}${g.uncoveredTruncated ? `\n…${g.uncoveredFileCount - g.uncoveredFiles.length} more` : ''}</div></div>`
    : '';

  // ── tension ─────────────────────────────────────────────────────────
  const t = scan.tension || {};
  const degRow = (x, max) => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(x.file)}</span>
      <span style="height:4px;background:var(--sky);border-radius:2px;width:${Math.max(4, Math.round((x.degree / max) * 80))}px;flex-shrink:0"></span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--text3);width:24px;text-align:right;flex-shrink:0">${x.degree}</span>
    </div>`;

  const fanIn = t.highFanIn || [], fanOut = t.highFanOut || [];
  const maxIn = fanIn.length ? fanIn[0].degree : 1, maxOut = fanOut.length ? fanOut[0].degree : 1;
  const tensionBlock = `
    <div class="ds"><div class="ds-label">tension — depended on by many (≥ ${t.fanInThreshold ?? '—'})</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">changing these moves everything downstream</div>
      ${fanIn.length ? fanIn.map(x => degRow(x, maxIn)).join('') : '<div class="ds-mono" style="color:var(--mint)">no outliers — dependency load is evenly spread</div>'}
    </div>
    <div class="ds"><div class="ds-label">tension — depends on many (≥ ${t.fanOutThreshold ?? '—'})</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">these are hard to move, test, or reason about alone</div>
      ${fanOut.length ? fanOut.map(x => degRow(x, maxOut)).join('') : '<div class="ds-mono" style="color:var(--mint)">no outliers</div>'}
    </div>
    <div class="ds"><div class="ds-label">method</div><div class="ds-mono" style="color:var(--text3)">${escapeHtml(t.note || '')}\n${t.dependencyEdgesConsidered ?? 0} resolved depends_on edges considered</div></div>`;

  const actions = `<div class="ds"><div class="ds-label">actions</div>
      <div class="action-row">
        <button class="action-btn" onclick="renderRepoIntelligence(CURRENT_API_REPO)">↻ rescan</button>
        <button class="action-btn" onclick="reindexRepoThenScan('${forUuid}')">⟲ reindex then scan</button>
      </div>
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:6px">rescan re-reads the existing index · reindex re-runs the pipeline over the files on disk first</div>
    </div>`;

  el.innerHTML = headline + brokenBlock + parseBlock + chunkBlock + gapsBlock + uncoveredBlock + tensionBlock + externalBlock + actions;
}

// Re-run the real import pipeline, then scan. Used by both the "never
// indexed" empty state and the actions row — a scan is only ever as
// current as the index it reads, and this is the honest way to refresh it.
async function reindexRepoThenScan(uuid) {
  toast('reindexing — parse, atlas, chunk, verify, index…', 'ok');
  try {
    const r = await api(`/api/repos/${uuid}/reindex`, { method: 'POST', body: '{}' }, 60000);
    const state = r.pipeline?.state || 'unknown';
    if (state === 'FAULT') toast(`pipeline fault: ${r.pipeline?.error || 'see verification tiers'}`, 'err');
    else toast(`reindex complete · ${escapeHtml(state)}`, 'ok');
  } catch (e) {
    toast(`reindex failed: ${e.message}`, 'err');
    return;
  }
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'intelligence') {
    renderRepoIntelligence(CURRENT_API_REPO);
  }
}

// ── ROADMAP (MCO-E) — the phases in this repo's phasemap files, dependency-ordered
// (idearium/repo/roadmap.js, GET /api/repos/:uuid/roadmap). A phase's status
// control edits the phasemap FILE — the row loom's scanner reads — and the server
// refuses an edit loom cannot read back exactly. blocked is shown, not stored: a
// phase is blocked when a dependency is not complete.
let ROADMAP_EDITING = false; // true while an edit is in flight, so an SSE refresh does not repaint under it

async function renderRepoRoadmap(repo) {
  const el = document.getElementById('repo-subtab-roadmap');
  if (!el) return;
  const forUuid = repo.uuid;
  const stale = () => CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'roadmap';
  el.innerHTML = `<div class="detail-empty">reading phasemaps…</div>`;
  let r;
  try { r = await api(`/api/repos/${forUuid}/roadmap`, {}, 20000); }
  catch (e) { if (stale()) return; el.innerHTML = `<div class="ds"><div class="ds-label">roadmap</div><div class="ds-mono">could not read the roadmap: ${escapeHtml(e.message)}</div></div>`; return; }
  if (stale()) return;
  paintRoadmap(el, forUuid, r);
}

function paintRoadmap(el, uuid, r) {
  const rm = r.roadmap || { phases: [], maps: [], layers: [], warnings: [], summary: {} };
  if (!rm.phases.length) {
    const sk = (r.skipped || []).map(x => `${escapeHtml(x.path)} — ${escapeHtml(x.reason)}`).join('\n');
    el.innerHTML = `<div class="ds"><div class="ds-label">roadmap</div>
      <div class="ds-mono">no phases found.\n\nA roadmap is read from the phasemap files in this repo (any file named like *phasemap*.spec, with phases written as ids such as P1_name or MCO-A_name).${sk ? '\n\nSkipped:\n' + sk : ''}</div></div>`;
    return;
  }
  const S = rm.summary;
  const pct = S.total ? Math.round((S.complete / S.total) * 100) : 0;
  const head = `<div class="ds"><div class="ds-label">roadmap · ${escapeHtml(String(S.total))} phases in ${rm.maps.length} phasemap${rm.maps.length === 1 ? '' : 's'}</div>
    <div style="height:6px;background:var(--b0);border-radius:3px;overflow:hidden;margin:6px 0"><div style="height:100%;width:${pct}%;background:var(--mint)"></div></div>
    <div class="ds-mono">${S.complete} complete · ${S.active} active · ${S.planned} planned   |   ${S.ready} ready to start · ${S.blocked} blocked   |   ${pct}%</div>
    <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:6px">changing a status edits the phasemap file itself (the row loom reads). The previous status is kept in the file. Read back and checked before it is reported.</div></div>`;

  const byUuid = new Map(rm.phases.map(p => [p.uuid, p]));
  const shortKey = (u) => (byUuid.get(u)?.phase_key || u.split(':').pop()).split('_')[0];
  const color = { complete: 'var(--mint)', active: 'var(--sky)', planned: 'var(--text3)' };
  const phaseRow = (p) => {
    const chips = p.status === 'complete' ? '' : p.blocked_by.length
      ? `<span style="color:var(--amber);font-size:9.5px">blocked by ${escapeHtml(p.blocked_by.map(shortKey).join(', '))}</span>`
      : `<span style="color:var(--mint);font-size:9.5px">ready</span>`;
    const deps = p.depends_on.length ? `<span style="color:var(--text3);font-size:9.5px">after ${escapeHtml(p.depends_on.map(shortKey).join(', '))}</span>` : '';
    const opt = (v) => `<option value="${v}"${p.status === v ? ' selected' : ''}>${v}</option>`;
    return `<div class="rm-row" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-bottom:1px solid var(--b0);border-left:3px solid ${color[p.status] || 'var(--b1)'}">
      <select class="rm-status" data-uuid="${escapeHtml(uuid)}" data-map="${escapeHtml(p.map)}" data-phase="${escapeHtml(p.phase_key)}" data-prev="${escapeHtml(p.status)}"
        onchange="setRoadmapPhaseStatus(this)" style="background:var(--b0);border:1px solid var(--b1);color:${color[p.status] || 'var(--text)'};font-family:var(--mono);font-size:10px;padding:3px 4px;border-radius:4px">${opt('planned')}${opt('active')}${opt('complete')}</select>
      <span style="font-family:var(--mono);font-size:10.5px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(p.map)}:${p.line}">${escapeHtml(p.title)}</span>
      ${deps} ${chips}</div>`;
  };

  const layers = new Map();
  for (const p of rm.phases) { const k = p.layer == null ? 'cycle' : p.layer; if (!layers.has(k)) layers.set(k, []); layers.get(k).push(p); }
  const layerBlocks = [...layers.entries()].map(([k, ps]) => `<div class="ds"><div class="ds-label">${k === 'cycle' ? 'in a dependency cycle — no layer' : `layer ${k} — ${k === 0 ? 'no dependencies' : 'after layer ' + (k - 1) + ' and earlier'}`}${rm.maps.length > 1 ? '' : ''}</div>${ps.sort((a, b) => a.order - b.order).map(phaseRow).join('')}</div>`).join('');

  const W = rm.warnings || [];
  const label = { dependency_cycle: 'dependency cycle', unresolved_dependency: 'depends on something that is not a phase here', ambiguous_dependency: 'ambiguous dependency', duplicate_phase_id: 'phase id repeated in its file', self_dependency: 'depends on itself' };
  const warnBlock = W.length ? `<div class="ds"><div class="ds-label">notes (${W.length})</div><div class="ds-mono" style="color:var(--text3);white-space:pre-wrap">${W.slice(0, 30).map(w => escapeHtml(`${label[w.type] || w.type}: ${w.phase || (w.phases || []).join(', ')}${w.token ? ' → ' + w.token : ''}${w.map ? '  (' + w.map + ')' : ''}`)).join('\n')}${W.length > 30 ? `\n…${W.length - 30} more` : ''}</div></div>` : '';
  const skipBlock = (r.skipped || []).length ? `<div class="ds"><div class="ds-label">phasemap files not read</div><div class="ds-mono" style="color:var(--text3)">${(r.skipped).map(x => escapeHtml(x.path + ' — ' + x.reason)).join('\n')}</div></div>` : '';
  el.innerHTML = head + layerBlocks + warnBlock + skipBlock;
}

async function setRoadmapPhaseStatus(sel, force = false) {
  const uuid = sel.dataset.uuid, map = sel.dataset.map, phase = sel.dataset.phase, prev = sel.dataset.prev, status = sel.value;
  if (status === prev) return;
  ROADMAP_EDITING = true; sel.disabled = true;
  const el = document.getElementById('repo-subtab-roadmap');
  try {
    const r = await api(`/api/repos/${uuid}/roadmap/phase`, { method: 'POST', body: JSON.stringify({ map, phase, status, force }) }, 30000);
    toast(`${phase.split('_')[0]}: ${prev} → ${status} (written to ${map.split('/').pop()}, read back)`, 'ok');
    if (el && CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'roadmap') paintRoadmap(el, uuid, r);
  } catch (e) {
    sel.value = prev; sel.disabled = false;
    if (e.detail && e.detail.code === 'DEPS_INCOMPLETE') {
      ROADMAP_EDITING = false;
      if (window.confirm(`${e.message}\n\nMark it complete anyway?`)) { sel.value = status; sel.dataset.prev = prev; await setRoadmapPhaseStatus(sel, true); }
      return;
    }
    toast(`not changed: ${e.message}`, 'err');
  } finally { ROADMAP_EDITING = false; sel.disabled = false; }
}

// ── VERSIONIUM — this repo's snapshots (MCO3, §33). GET/POST
// /api/repos/:uuid/snapshot(s). A snapshot records the repo's DERIVED state
// (source hash, git commit, atlas/chunk/graph identity, dependencies,
// environment, tests, verification) and is committed to versionium. It does
// carries the repo's files too (MCO-B), so a snapshot can be restored — with a
// preview first, a pre-restore snapshot, and a check against the disk afterwards.
//
// Unknown is not zero here either: every field a record could not determine
// carries available:false and a reason, and this view shows that reason
// instead of a blank or a 0.
let SNAP_OPEN = null; // { repoUuid, commitId } — which snapshot's detail is showing

const _short = (h, n = 12) => (h ? String(h).slice(0, n) : '—');
const _snapWhen = (ts) => (ts ? new Date(ts).toLocaleString() : '—');

// One line per §33 field. Returns [{key, ok, text, warn}] — warn marks the
// things worth a second look (stale source, dirty tree, failed tests).
function snapFieldRows(rec) {
  const m = (rec && rec.mustRecord) || {};
  const rows = [];
  const gone = (f) => (f && f.available === false);
  const reason = (f) => (f && f.reason ? f.reason : 'not recorded');

  const sh = m.sourceHash;
  if (gone(sh)) rows.push({ key: 'source', ok: false, text: reason(sh) });
  else if (sh) rows.push({ key: 'source', ok: sh.fresh !== false, warn: sh.fresh === false,
    text: `${sh.fresh === false ? `on disk ${_short(sh.diskHash)} · indexed ${_short(sh.value)}` : _short(sh.value)} · ${sh.indexedFileCount ?? '?'} files indexed · ${sh.fresh === false
      ? `STALE — the indexes below describe older source (${(sh.mismatched || []).length} changed, ${(sh.missing || []).length} missing${(sh.mismatched || []).length ? ': ' + sh.mismatched.slice(0, 3).join(', ') : ''})`
      : 'indexes match the files on disk'}` });

  // 0.39.263 — a repo's history is versionium's (versionCommit); records from before carry gitCommit
  const vc = m.versionCommit;
  if (vc && !gone(vc)) rows.push({ key: 'version', ok: true, text: `versionium · ${vc.branch || '?'} · ${vc.parentKnown ? (vc.parent ? `after ${_short(vc.parent, 12)}` : 'first version') : 'parent not asked'}` });
  else if (vc) rows.push({ key: 'version', ok: false, text: reason(vc) });
  const g = m.gitCommit;
  if (g && gone(g)) rows.push({ key: 'git', ok: false, text: reason(g) });
  else if (g) rows.push({ key: 'git', ok: !g.dirty, warn: !!g.dirty, text: `${_short(g.commit, 10)} · ${g.branch || '?'}${g.dirty ? ' · working tree has uncommitted changes' : ' · clean'}` });

  const a = m.atlasVersion;
  rows.push(gone(a) ? { key: 'atlas', ok: false, text: reason(a) }
    : { key: 'atlas', ok: true, text: `sha ${_short(a?.sha256)} · ${a?.fileCount ?? '?'} files · no declared version (identity is the hash)` });

  const c = m.chunkIndexVersion;
  rows.push(gone(c) ? { key: 'chunks', ok: false, text: reason(c) }
    : { key: 'chunks', ok: true, text: `sha ${_short(c?.sha256)} · ${c?.chunkCount ?? '?'} chunks · no declared version (identity is the hash)` });

  const gr = m.graphVersion;
  rows.push(gone(gr) ? { key: 'graph', ok: false, text: reason(gr) }
    : { key: 'graph', ok: true, text: `v${gr?.declaredVersion ?? '?'} · ${gr?.nodeCount ?? '?'} nodes · ${gr?.edgeCount ?? '?'} edges · ${gr?.unresolvedCount ?? '?'} unresolved · sha ${_short(gr?.sha256)}` });

  const d = m.dependencyState;
  if (gone(d)) rows.push({ key: 'deps', ok: false, text: reason(d) });
  else if (d) {
    const dec = d.declared && !d.declared.error
      ? `${d.declared.dependencies} deps, ${d.declared.devDependencies} dev` : 'no root package.json';
    rows.push({ key: 'deps', ok: true,
      text: `${(d.manifests || []).length} manifest(s) · ${dec} · lockfile ${d.lockfilePresent ? 'present' : 'absent'}${d.nodeModulesPresent === null ? '' : ` · node_modules ${d.nodeModulesPresent ? 'present' : 'absent'}`}` });
  }

  const e = m.environment;
  if (e) rows.push({ key: 'env', ok: true,
    text: `${e.compartmentId ? 'compartment ' + e.compartmentId : 'no compartment attached'} · snapshot taken on node ${e.host?.node || '?'} ${e.host?.platform || ''} · repo runtime not resolved (owned by its compartment)` });

  const t = m.testState;
  if (gone(t)) rows.push({ key: 'tests', ok: false, text: `${reason(t)}${t.status ? ` (${t.status})` : ''}` });
  else if (t) rows.push({ key: 'tests', ok: t.status === 'passed', warn: t.status === 'failed',
    text: `${t.status} · ${t.testsRun}/${t.testsFound} run, ${t.testsSkipped} skipped${t.failedCount ? ` · failed: ${(t.failed || []).slice(0, 3).join(', ')}` : ''}` });

  const v = m.verificationState;
  if (gone(v)) rows.push({ key: 'verify', ok: false, text: reason(v) });
  else if (v) {
    const mark = (x) => x.state === 'passed' ? '✓' : x.state === 'failed' ? '✗' : x.state === 'pending' ? '…' : '–';
    rows.push({ key: 'verify', ok: !(v.failedTiers || []).length, warn: (v.failedTiers || []).length > 0,
      text: `${v.status || '?'} · ${(v.tiers || []).map(x => `${x.level}${mark(x)}`).join(' ')}${v.lazy?.status ? ` · lazy ${v.lazy.status}` : ''}` });
  }
  return rows;
}

// What changed between two records — identity comparisons only, each traced to
// a field the record carries. No score, no "significance".
function snapDiffLines(cur, prev) {
  const c = cur?.mustRecord || {}, p = prev?.mustRecord || {};
  const pick = (m) => ({
    // The source as it actually was on disk when the snapshot was taken.
    // sourceHash.value is the hash the INDEXES were built from, which does
    // not move when a file is edited without a reindex — comparing it would
    // report "same" for a repo whose files changed.
    source: m.sourceHash?.available ? (m.sourceHash.diskHash || m.sourceHash.value) : null,
    git: m.gitCommit?.available ? m.gitCommit.commit : null,   // pre-0.39.263 records
    atlas: m.atlasVersion?.available ? m.atlasVersion.sha256 : null,
    chunks: m.chunkIndexVersion?.available ? m.chunkIndexVersion.sha256 : null,
    graph: m.graphVersion?.available ? m.graphVersion.sha256 : null,
    tests: m.testState?.available ? m.testState.status : null,
    verify: m.verificationState?.available ? m.verificationState.status : null,
  });
  const a = pick(c), b = pick(p), out = [];
  for (const k of Object.keys(a)) {
    if (a[k] === b[k]) out.push({ key: k, changed: false });
    else if (a[k] == null || b[k] == null) out.push({ key: k, changed: true, note: a[k] == null ? 'unavailable now' : 'was unavailable' });
    else out.push({ key: k, changed: true, note: (k === 'tests' || k === 'verify') ? `${b[k]} → ${a[k]}` : `${_short(b[k], 8)} → ${_short(a[k], 8)}` });
  }
  return out;
}

async function renderRepoVersionium(repo) {
  const el = document.getElementById('repo-subtab-versionium');
  if (!el) return;
  const forUuid = repo.uuid;
  const stale = () => CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'versionium';
  el.innerHTML = `<div class="detail-empty">loading snapshots…</div>`;

  let list;
  try { list = await api(`/api/repos/${forUuid}/snapshots`, {}, 15000); }
  catch (e) {
    if (stale()) return;
    el.innerHTML = `<div class="ds"><div class="ds-label">versionium</div>
      <div class="ds-mono">could not read snapshots: ${escapeHtml(e.message)}\n\nversionium may not be running — snapshots are stored there.</div></div>`;
    return;
  }
  if (stale()) return;
  const snaps = list.snapshots || [];

  const actions = `<div class="ds"><div class="ds-label">snapshot</div>
      <div class="action-row" style="gap:8px;flex-wrap:wrap">
        <input id="snap-msg" type="text" placeholder="message (optional)" maxlength="200"
          style="flex:1;min-width:160px;background:var(--b0);border:1px solid var(--b1);color:var(--text);font-family:var(--mono);font-size:11px;padding:6px 8px;border-radius:5px">
        <button class="action-btn" id="snap-take" onclick="takeRepoSnapshot('${forUuid}')">◉ take snapshot</button>
      </div>
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:6px">records this repo's derived state and its files (first copy, then diffs) and commits them to versionium · files over the size limit, and binary files, are listed as not kept</div>
    </div>`;

  const row = (s) => {
    const open = SNAP_OPEN && SNAP_OPEN.commitId === s.commitId && SNAP_OPEN.repoUuid === forUuid;
    const badge = (txt, color) => `<span style="font-family:var(--mono);font-size:9.5px;color:${color};margin-left:8px">${escapeHtml(txt)}</span>`;
    return `<div class="snap-row" data-commit="${escapeHtml(s.commitId)}" onclick="openRepoSnapshot('${forUuid}','${escapeHtml(s.commitId)}')"
        style="padding:7px 8px;border-bottom:1px solid var(--b0);cursor:pointer;${open ? 'background:var(--b0);' : ''}">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <span style="font-family:var(--mono);font-size:10.5px;color:var(--text)">${escapeHtml(s.message || '(no message)')}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text3);flex-shrink:0">${escapeHtml(_snapWhen(s.ts))}</span>
      </div>
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:2px">
        ${escapeHtml(s.commitId)} · indexed ${escapeHtml(_short(s.sourceHash, 8))}
        ${s.fresh === false ? badge('stale index', 'var(--amber)') : ''}
        ${s.gitCommit ? badge('git ' + _short(s.gitCommit, 7), 'var(--text3)') : ''}
        ${s.verification ? badge('verify ' + s.verification, s.verification === 'passed' ? 'var(--mint)' : 'var(--coral)') : ''}
        ${s.files ? badge(s.files.count + ' files kept', 'var(--text3)') : ''}
        ${s.tests ? badge('tests ' + s.tests, s.tests === 'passed' ? 'var(--mint)' : s.tests === 'failed' ? 'var(--coral)' : 'var(--text3)') : ''}
      </div></div>`;
  };

  const listBlock = snaps.length
    ? `<div class="ds"><div class="ds-label">snapshots (${snaps.length}) · newest first</div>${snaps.map(row).join('')}</div>`
    : `<div class="ds"><div class="ds-label">snapshots</div><div class="ds-mono">none yet for this repo.\n\nA snapshot needs the repo to have been through the import pipeline (chunked). If it has not been, taking one will say so.</div></div>`;

  // §0.39.271 V2 — the nexus repo's one file is its index (NEXUS.md). NEXUS itself is
  // versioned per system and in the immutable base, so this tab shows all of that first.
  const isNexusParent = repo.nexusSelf && repo.nexusSelf.role === 'parent';
  el.innerHTML = (isNexusParent ? `<div id="nx-versions"><div class="detail-empty">reading every system's versions…</div></div>` : '')
    + actions.replace('>snapshot<', isNexusParent ? '>snapshot the index only (NEXUS.md)<' : '>snapshot<')
    + listBlock + `<div id="snap-detail"></div>`;
  if (isNexusParent) renderNexusVersionium(forUuid, stale);
  if (SNAP_OPEN && SNAP_OPEN.repoUuid === forUuid && snaps.some(s => s.commitId === SNAP_OPEN.commitId)) {
    openRepoSnapshot(forUuid, SNAP_OPEN.commitId, snaps);
  }
}

// §0.39.271 V2 — GET /api/nexus-self/versions: one row per system repo (its versions in
// versionium, latest, files kept), the immutable base's snapshot history, and one button
// that snapshots every system (POST /api/nexus-self/snapshot).
async function renderNexusVersionium(forUuid, stale) {
  const box = document.getElementById('nx-versions');
  if (!box) return;
  let v;
  try { v = await api('/api/nexus-self/versions', {}, 20000); }
  catch (e) {
    if (stale()) return;
    box.innerHTML = `<div class="ds"><div class="ds-label">all of nexus · versionium</div><div class="ds-mono">could not read versions: ${escapeHtml(e.message)}\n\nversionium (:3754) holds them — is it running?</div></div>`;
    return;
  }
  if (stale()) return;
  const t = v.totals || {};
  const row = (x) => {
    const l = x.latest;
    return `<div class="snap-row" style="padding:6px 8px;border-bottom:1px solid var(--b0);cursor:pointer;display:grid;grid-template-columns:130px 70px 90px 1fr 150px;gap:8px;align-items:center;font-family:var(--mono);font-size:10.5px"
        onclick="enterRepoDetail('${escapeHtml(x.repoUuid)}');setTimeout(()=>setRepoSubtab('versionium'),60)" title="open nexus/${escapeHtml(x.system)}'s own Versionium tab">
      <span style="color:var(--text)">${escapeHtml(x.system)}</span>
      <span style="color:${x.versions ? 'var(--mint)' : 'var(--coral)'}">${x.versions} ver.</span>
      <span style="color:var(--text3)">${x.fileCount} files</span>
      <span style="color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l ? escapeHtml(l.commitId) + ' · ' + escapeHtml(l.message || '') + (l.files ? ' · ' + l.files.count + ' kept' : '') : (x.versionError ? '<span style="color:var(--coral)">' + escapeHtml(x.versionError) + '</span>' : 'not versioned yet')}</span>
      <span style="color:var(--text3);text-align:right">${l ? escapeHtml(_snapWhen(l.ts)) : ''}</span>
    </div>`;
  };
  const base = v.base || {};
  box.innerHTML = `<div class="ds"><div class="ds-label">all of nexus · versionium — ${t.systems || 0} systems · ${t.versions || 0} versions · ${t.files || 0} files</div>
      <div class="action-row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <input id="nx-snap-msg" type="text" placeholder="message for every system's snapshot (optional)" maxlength="200"
          style="flex:1;min-width:200px;background:var(--b0);border:1px solid var(--b1);color:var(--text);font-family:var(--mono);font-size:11px;padding:6px 8px;border-radius:5px">
        <button class="action-btn" id="nx-snap-all" onclick="snapshotAllNexus('${forUuid}')">◉ snapshot every system</button>
      </div>
      ${(t.unversioned || []).length ? `<div class="ds-mono" style="color:var(--amber);margin-bottom:6px">not versioned yet: ${escapeHtml(t.unversioned.join(', '))}</div>` : ''}
      ${(v.systems || []).map(row).join('')}
      <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:6px">each system's files are kept in its own versions (first copy, then diffs) · click a system for its history, diffs and restore</div>
    </div>
    <div class="ds"><div class="ds-label">immutable base — ${(base.history || []).length} snapshot(s) of the live tree</div>
      <div class="ds-mono">head ${escapeHtml(String(base.head || '—').slice(0, 16))}
${(base.history || []).slice().reverse().slice(0, 12).map(h => `${escapeHtml(String(h.hash || h.snapshot || h).slice(0, 16))}  ${h.at ? new Date(h.at).toLocaleString() : ''}  ${h.files != null ? h.files + ' files' : ''}`).join('\n')}</div></div>`;
}

async function snapshotAllNexus(parentUuid) {
  const btn = document.getElementById('nx-snap-all');
  const msg = (document.getElementById('nx-snap-msg') || {}).value || '';
  if (btn) { btn.disabled = true; btn.textContent = '◉ snapshotting…'; }
  try {
    const r = await api('/api/nexus-self/snapshot', { method: 'POST', body: JSON.stringify(msg.trim() ? { message: msg.trim() } : {}) }, 300000);
    const bad = (r.results || []).filter(x => !x.ok);
    toast(`${(r.results || []).length - bad.length} system(s) snapshotted${bad.length ? ` · ${bad.length} failed: ${bad.map(b => b.system + ' (' + (b.code || b.error) + ')').join(', ')}` : ''}`, bad.length ? 'err' : 'ok');
  } catch (e) { toast(`snapshot every system failed: ${e.message}`, 'err'); }
  if (btn) { btn.disabled = false; btn.textContent = '◉ snapshot every system'; }
  if (CURRENT_API_REPO?.uuid === parentUuid && CURRENT_REPO_SUBTAB === 'versionium') renderRepoVersionium(CURRENT_API_REPO);
}

async function takeRepoSnapshot(uuid) {
  const msgEl = document.getElementById('snap-msg');
  const btn = document.getElementById('snap-take');
  if (btn) btn.disabled = true;
  try {
    const body = msgEl && msgEl.value.trim() ? { message: msgEl.value.trim() } : {};
    const r = await api(`/api/repos/${uuid}/snapshot`, { method: 'POST', body: JSON.stringify(body) }, 30000);
    const fresh = r.record?.mustRecord?.sourceHash?.fresh;
    toast(`snapshot ${r.commitId}${fresh === false ? ' — recorded as STALE (indexes older than the files)' : ''}`, fresh === false ? 'err' : 'ok');
    SNAP_OPEN = { repoUuid: uuid, commitId: r.commitId };
  } catch (e) {
    // NOT_INDEXED (409) arrives as a plain error message from api().
    toast(`snapshot failed: ${e.message}`, 'err');
  }
  if (btn) btn.disabled = false;
  if (CURRENT_API_REPO?.uuid === uuid && CURRENT_REPO_SUBTAB === 'versionium') renderRepoVersionium(CURRENT_API_REPO);
}

async function openRepoSnapshot(uuid, commitId, snapsHint) {
  SNAP_OPEN = { repoUuid: uuid, commitId };
  document.querySelectorAll('#repo-subtab-versionium .snap-row').forEach(r => {
    r.style.background = r.dataset.commit === commitId ? 'var(--b0)' : '';
  });
  const box = document.getElementById('snap-detail');
  if (!box) return;
  box.innerHTML = `<div class="detail-empty">loading ${escapeHtml(commitId)}…</div>`;
  const stale = () => CURRENT_API_REPO?.uuid !== uuid || CURRENT_REPO_SUBTAB !== 'versionium' || SNAP_OPEN?.commitId !== commitId;

  let cur;
  try { cur = await api(`/api/repos/${uuid}/snapshots/${encodeURIComponent(commitId)}`, {}, 15000); }
  catch (e) {
    if (stale()) return;
    box.innerHTML = `<div class="ds"><div class="ds-label">${escapeHtml(commitId)}</div><div class="ds-mono">could not read this snapshot: ${escapeHtml(e.message)}</div></div>`;
    return;
  }
  if (stale()) return;

  // The next-older snapshot of this repo, if there is one, for a "what changed" strip.
  let prevRec = null, prevId = null;
  try {
    const all = snapsHint || (await api(`/api/repos/${uuid}/snapshots`, {}, 15000)).snapshots || [];
    const i = all.findIndex(s => s.commitId === commitId);
    if (i >= 0 && all[i + 1]) {
      prevId = all[i + 1].commitId;
      prevRec = (await api(`/api/repos/${uuid}/snapshots/${encodeURIComponent(prevId)}`, {}, 15000)).record;
    }
  } catch (_) { /* the strip is optional; the record above is the point */ }
  if (stale()) return;

  const rows = snapFieldRows(cur.record);
  const fieldHtml = rows.map(r => `<div style="display:flex;gap:10px;padding:4px 0;border-bottom:1px solid var(--b0)">
      <span style="font-family:var(--mono);font-size:10px;color:var(--text3);width:52px;flex-shrink:0">${escapeHtml(r.key)}</span>
      <span style="font-family:var(--mono);font-size:10px;color:${r.warn ? 'var(--amber)' : r.ok ? 'var(--text2)' : 'var(--text3)'};word-break:break-word">${escapeHtml(r.text)}</span>
    </div>`).join('');

  let diffHtml = '';
  if (prevRec) {
    const lines = snapDiffLines(cur.record, prevRec);
    diffHtml = `<div class="ds"><div class="ds-label">since ${escapeHtml(prevId)}</div>
      <div class="ds-mono">${lines.map(l => l.changed ? `changed   ${l.key}${l.note ? ' · ' + l.note : ''}` : `same      ${l.key}`).map(escapeHtml).join('\n')}</div></div>`;
  } else {
    diffHtml = `<div class="ds"><div class="ds-label">since previous</div><div class="ds-mono" style="color:var(--text3)">this is the first snapshot of this repo — nothing to compare against</div></div>`;
  }

  box.innerHTML = `<div class="ds"><div class="ds-label">${escapeHtml(commitId)} · ${escapeHtml(_snapWhen(cur.ts))}${cur.message ? ' · ' + escapeHtml(cur.message) : ''}</div>${fieldHtml}</div>${diffHtml}${snapRestoreBox(uuid, commitId, cur.record)}`;
}

// ── RESTORE (MCO-B) — put a repo's files back to a snapshot. Always a preview
// first (the server defaults to dryRun and only changes anything on an explicit
// dryRun:false). The server takes a pre-restore snapshot before writing, so a
// restore can be undone, and re-reads the disk afterwards: what is shown here is
// that check's result, not an assumed success.
function snapRestoreBox(uuid, commitId, rec) {
  const f = rec && rec.files;
  if (!f) {
    return `<div class="ds"><div class="ds-label">restore</div>
      <div class="ds-mono" style="color:var(--text3)">no file layer — this snapshot recorded derived state only, so it cannot restore files.</div></div>`;
  }
  const skipped = (f.skipped || []).length;
  return `<div class="ds"><div class="ds-label">restore</div>
      <div class="ds-mono">${escapeHtml(String(f.fileCount))} files · ${escapeHtml(String(f.totalBytes))} bytes kept${skipped ? ` · ${skipped} not kept (${escapeHtml((f.skipped || []).slice(0, 3).map(x => x.path).join(', '))}${skipped > 3 ? ', …' : ''})` : ''}</div>
      <div class="action-row"><button class="action-btn" onclick="previewRepoRestore('${uuid}','${escapeHtml(commitId)}')">preview restore</button></div>
      <div id="snap-restore-out"></div>
    </div>`;
}

function _pathList(paths, max = 20) {
  if (!paths.length) return '<span style="color:var(--text3)">none</span>';
  return escapeHtml(paths.slice(0, max).join('\n')) + (paths.length > max ? `\n…${paths.length - max} more` : '');
}

let SNAP_PREVIEW = null; // { uuid, commitId, plan } — what the confirm button acts on

async function previewRepoRestore(uuid, commitId) {
  const out = document.getElementById('snap-restore-out'); if (!out) return;
  out.innerHTML = `<div class="detail-empty">reading the file layer…</div>`;
  let r;
  try { r = await api(`/api/repos/${uuid}/snapshots/${encodeURIComponent(commitId)}/restore`, { method: 'POST', body: JSON.stringify({ dryRun: true }) }, 60000); }
  catch (e) { out.innerHTML = `<div class="ds-mono" style="color:var(--coral)">preview failed: ${escapeHtml(e.message)}</div>`; return; }
  const res = r.result || {};
  if (!res.ok) { SNAP_PREVIEW = null; out.innerHTML = `<div class="ds-mono" style="color:var(--coral)">cannot restore: ${escapeHtml(res.error || res.code || 'refused')}</div>`; return; }
  const p = res.plan || {};
  const changes = (p.write || []).length + (p.delete || []).length;
  SNAP_PREVIEW = res.restorable && changes ? { uuid, commitId, plan: p } : null;
  const blocked = (p.blocked || []);
  out.innerHTML = `
    <div style="font-family:var(--mono);font-size:10px;color:var(--text2);margin-top:8px">
      <div>would write (${(p.write || []).length})</div><div style="color:var(--text3);white-space:pre-wrap;margin-bottom:4px">${_pathList(p.write || [])}</div>
      <div>would delete (${(p.delete || []).length})</div><div style="color:var(--text3);white-space:pre-wrap;margin-bottom:4px">${_pathList(p.delete || [])}</div>
      <div>already identical: ${escapeHtml(String(p.unchanged ?? 0))}</div>
      ${(p.leftAlone?.tooLargeNow || []).length ? `<div style="color:var(--text3)">left alone (too large to track now): ${escapeHtml(p.leftAlone.tooLargeNow.join(', '))}</div>` : ''}
      ${(p.leftAlone?.notInSnapshotButProtected || []).length ? `<div style="color:var(--text3)">left alone (the snapshot did not keep these, so they are not treated as extra): ${escapeHtml(p.leftAlone.notInSnapshotButProtected.join(', '))}</div>` : ''}
      ${blocked.length ? `<div style="color:var(--amber);margin-top:6px">BLOCKED — ${blocked.length} file(s) cannot be restored through the repo layer, so the restore is refused whole:\n${blocked.map(b => escapeHtml(b.path)).join('\n')}</div>` : ''}
    </div>
    ${SNAP_PREVIEW
      ? `<div class="action-row" style="margin-top:8px"><button class="action-btn danger" onclick="runRepoRestore()">restore ${changes} file change(s)</button></div>
         <div style="font-family:var(--mono);font-size:9.5px;color:var(--text3);margin-top:4px">a pre-restore snapshot is taken first, so this can be undone</div>`
      : `<div class="ds-mono" style="color:${blocked.length ? 'var(--amber)' : 'var(--mint)'};margin-top:6px">${blocked.length ? 'nothing was changed' : 'the repo already matches this snapshot — nothing to restore'}</div>`}`;
}

async function runRepoRestore() {
  const pv = SNAP_PREVIEW; const out = document.getElementById('snap-restore-out');
  if (!pv || !out) return;
  const w = (pv.plan.write || []).length, d = (pv.plan.delete || []).length;
  if (!window.confirm(`Restore ${w} file(s) and delete ${d} file(s)?\n\nA pre-restore snapshot is taken first, so this can be undone.`)) return;
  out.innerHTML = `<div class="detail-empty">restoring…</div>`;
  let r;
  try { r = await api(`/api/repos/${pv.uuid}/snapshots/${encodeURIComponent(pv.commitId)}/restore`, { method: 'POST', body: JSON.stringify({ dryRun: false }) }, 180000); }
  catch (e) { out.innerHTML = `<div class="ds-mono" style="color:var(--coral)">restore request failed: ${escapeHtml(e.message)}\n\nThe repo may be partly restored — check the snapshot list for a pre-restore snapshot.</div>`; return; }
  SNAP_PREVIEW = null;
  const res = r.result || {};
  const pre = res.preRestoreCommitId;
  const undo = pre ? `<div class="action-row" style="margin-top:6px"><button class="action-btn" onclick="previewRepoRestore('${pv.uuid}','${escapeHtml(pre)}')">undo — preview restoring ${escapeHtml(pre)}</button></div>` : '';
  if (res.ok && res.verified) {
    toast(`restored ${res.written} file(s), deleted ${res.deleted} — verified against disk`, 'ok');
    out.innerHTML = `<div class="ds-mono" style="color:var(--mint)">restored and verified against the files on disk: ${res.written} written, ${res.deleted} deleted.</div>${undo}`;
  } else if (res.code) {
    toast(`restore refused: ${res.error || res.code}`, 'err');
    out.innerHTML = `<div class="ds-mono" style="color:var(--coral)">${escapeHtml(res.error || res.code)}</div>`;
    return;
  } else {
    toast('restore did NOT fully verify — see the panel', 'err');
    out.innerHTML = `<div class="ds-mono" style="color:var(--amber);white-space:pre-wrap">the repo does not match the snapshot after the restore.
${(res.failures || []).map(f => `${escapeHtml(f.op)} ${escapeHtml(f.path)} failed: ${escapeHtml(f.error)}`).join('\n')}
${(res.mismatches || []).map(m => `${escapeHtml(m.path)}: ${escapeHtml(m.why)}`).join('\n')}
${res.note ? '\n' + escapeHtml(res.note) : ''}</div>${undo}`;
  }
  if (CURRENT_API_REPO?.uuid === pv.uuid) loadApiRepos().then(() => { if (CURRENT_REPO_SUBTAB === 'files') renderCurrentRepoSubtab(); });
}


// ── SETTINGS — compartment (real, MCO6), agent/source provenance, and
// the repo-level actions (add file, fork, export, archive) moved here
// from the file-tree toolbar — these are repo settings, not tree controls.
// §MOVED 2026-09-22 — James: "this should all be in a agents section in the
// settings tab for the compartments. per repo." The Agent tab is the CLI; how
// the agent is CONFIGURED (which model wears the hat, its persona, what it has
// learned, where its code lands) belongs with the rest of this repo's settings.
// §CODER-LINK 0.39.276 — the repo the Code button makes wears the ORIGINAL repo's hat and uses its agent settings.
// One line on both agent views says so, and links to where they are edited.
function _sharedAgentNote(st) {
  if (!st || !st.sharedFrom) return '';
  const o = (typeof API_REPOS !== 'undefined' ? API_REPOS : []).find(r => r.uuid === st.sharedFrom);
  const label = o ? escapeHtml(o.name || o.uuid) : escapeHtml(st.sharedFrom);
  return `<div style="margin:6px 0;font-size:10px;border-left:2px solid var(--b1);padding-left:8px">this repo wears the hat of <span style="cursor:pointer;text-decoration:underline" onclick="selectApiRepo('${escapeHtml(st.sharedFrom)}')">${label}</span> — the backend switch, Ollama model, tool scope and prompt blocks are that repo's. Change them there; what this repo's agent learns is kept there too.</div>`;
}

async function renderRepoAgentSettings(repo) {
  const el = document.getElementById('repo-agents-section');
  if (!el) return;
  let st = null, cfg = null, obs = [], inj = null;
  try {
    st = await api(`/api/repos/${repo.uuid}/agent`);
    cfg = await api(`/api/repos/${repo.uuid}/agent/settings`);
    AGENT_SETTINGS.set(repo.uuid, cfg);
    if (st.memory && st.memory.total) obs = (await api(`/api/repos/${repo.uuid}/agent/memory`)).observations || [];
    inj = await api(`/api/repos/${repo.uuid}/injects`);
  } catch (e) { el.innerHTML = `<div class="ds"><div class="ds-label">agents</div><div style="opacity:.6;font-size:10px">unavailable: ${escapeHtml(e.message)}</div></div>`; return; }

  const idx = st.index || {}, mem = st.memory || { total: 0 };
  el.innerHTML = `
    <div class="ds"><div class="ds-label">agents — this compartment's agent</div>
      <div class="ds-mono">${st.exists ? escapeHtml(st.hat.name) : '(no hat forged yet)'}
session    ${escapeHtml(st.sessionId || '—')}
indexed    ${idx.indexed ? `${idx.fileCount ?? '?'} files · ${idx.chunkCount ?? '?'} chunks` : 'NOT indexed — run the pipeline from Diagnose'}
learned    ${mem.total} observation${mem.total === 1 ? '' : 's'}
exchanges  ${st.exchanges || 0}
toolScope  ${st.toolScopeEnforced ? 'enforced' : 'NOT enforced on this path'}</div>
      ${_sharedAgentNote(st)}
      <div style="margin:8px 0;font-size:10px">wearing the hat:
        ${_agentBackendHtml(cfg, _agentBackendOf(cfg) === 'ollama' ? await _ollamaModelList() : null)}
        <div class="ag-note" style="margin-top:4px">ollama — a local model · copilot — copilot picks which one answers (only these settings decide what is sent) · guardian — through that agent's tab; every output lands the same way.</div>
      </div>
      <div class="action-row">
        ${st.exists
          ? `<button class="action-btn" onclick="toggleAgentPersona()">show/hide persona</button>
             <button class="action-btn" onclick="agentTeach()">teach</button>
             <button class="action-btn" onclick="agentExport()">export agent</button>
             <button class="action-btn" onclick="agentImport()">import agent</button>`
          : `<button class="action-btn" onclick="agentForgeHat()">forge this repo's agent</button>`}
      </div>
      <div id="agent-persona" style="display:none;white-space:pre-wrap;font-size:10px;opacity:.8;border:1px solid var(--b1);border-radius:3px;padding:8px;margin-top:8px;max-height:280px;overflow-y:auto">${st.exists ? escapeHtml(st.hat.personaPrompt || '(empty persona)') : ''}</div>
    </div>
    ${obs.length ? `<div class="ds"><div class="ds-label">learned</div><div style="font-size:10px;line-height:1.8">` +
      obs.map(o => `<div>(${escapeHtml(o.kind)}) ${escapeHtml(o.text)}${(o.occurrences || 1) > 1 ? ` <span style="opacity:.6">[${o.occurrences}×]</span>` : ''}${o.evidence ? ` <span style="opacity:.6">[${escapeHtml(o.evidence)}]</span>` : ''} <span style="cursor:pointer;opacity:.5" title="forget" onclick="agentForget('${o.uuid}')">×</span></div>`).join('') + `</div></div>` : ''}
    ${inj ? `<div class="ds"><div class="ds-label">injects · mode <span style="cursor:pointer;border-bottom:1px dotted" onclick="agentSetMode('${inj.mode === 'auto' ? 'review' : 'auto'}')">${escapeHtml(inj.mode)}</span> · <span style="cursor:pointer;border-bottom:1px dotted" onclick="agentNewInject()">+ new</span></div>` +
      ((inj.injects || []).length ? `<div style="font-size:10px;line-height:1.9">` + inj.injects.slice(0, 30).map(n => `<div><span style="opacity:.55">${escapeHtml(n.uuid.slice(0, 8))}</span> <span class="inj-st inj-${escapeHtml(n.status)}">${escapeHtml(n.status)}</span> <span style="cursor:pointer;text-decoration:underline" onclick="openInjectEditor('${n.uuid}')">${escapeHtml(n.path)}</span> <span style="opacity:.55">by ${escapeHtml(n.hatName || 'you')}</span>` +
        (n.status === 'proposed' ? ` <span class="inj-act" onclick="agentInjectAction('${n.uuid}','apply')">apply</span> <span class="inj-act" onclick="agentInjectAction('${n.uuid}','reject')">reject</span>` : n.status === 'applied' ? ` <span class="inj-act" onclick="agentInjectAction('${n.uuid}','revert')">revert</span>` : '') + `</div>`).join('') + `</div>`
        : `<div style="opacity:.5;font-size:10px">no injects yet — code the agent writes for this project lands here</div>`) + `</div>` : ''}
`;
  // §0.39.310 VP7 — the prompt blocks are the Settings tab's own Prompt category (repo-settings.js), not shown twice here
}

// ── §GIT TAB — §0.39.265 ─────────────────────────────────────────────────
// James: "what about push pull, cd ci, ssh, and git support?" Real git on this
// repo's folder (lib/repo-git.js via /api/repos/:uuid/git…) and its CI/CD
// pipeline (cos/ci via /api/repos/:uuid/ci…). Credentials never reach the page:
// an SSH key is picked by its alias (the key stays in ~/.ssh), a token is
// stored in the compartment vault as the `git_token` secret and only ever
// handed to the git process.
let _gitState = { uuid: null, keyAlias: '', log: '' };
function _gitLog(line, bad) {
  const el = document.getElementById('git-log');
  _gitState.log = `${new Date().toLocaleTimeString()}  ${line}\n${_gitState.log}`.slice(0, 20000);
  if (el) { el.textContent = _gitState.log; el.style.color = bad ? 'var(--coral,#f87171)' : ''; }
}
async function renderRepoGit(repo) {
  const el = document.getElementById('repo-subtab-git');
  if (!el) return;
  if (_gitState.uuid !== repo.uuid) _gitState = { uuid: repo.uuid, keyAlias: '', log: '' };
  el.innerHTML = '<div style="opacity:.6">reading git…</div>';
  const forUuid = repo.uuid;
  let st, ci, runs;
  try {
    [st, ci, runs] = await Promise.all([
      api(`/api/repos/${repo.uuid}/git`, {}, 20000),
      api(`/api/repos/${repo.uuid}/ci`, {}, 20000).catch(e => ({ error: e.message })),
      api(`/api/repos/${repo.uuid}/ci/runs?limit=10`, {}, 20000).catch(() => ({ runs: [] })),
    ]);
  } catch (e) { el.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  if (CURRENT_API_REPO?.uuid !== forUuid || CURRENT_REPO_SUBTAB !== 'git') return;
  const origin = (st.remotes || []).find(r => r.name === 'origin') || (st.remotes || [])[0] || null;
  if (!_gitState.keyAlias && st.sshKeys && st.sshKeys.length) _gitState.keyAlias = st.sshKeys[0];
  const box = (title, inner) => `<div class="ds" style="margin-bottom:14px"><div class="ds-label">${title}</div>${inner}</div>`;
  const row = (label, inner) => `<div style="display:flex;gap:10px;align-items:center;margin:6px 0;flex-wrap:wrap"><span style="min-width:110px;font-size:11px;opacity:.7">${label}</span>${inner}</div>`;
  let gitHtml;
  if (!st.git) {
    gitHtml = `<div>Git is not installed on this computer. Install it from <a href="https://git-scm.com/downloads" target="_blank" rel="noopener">git-scm.com</a> (Windows: <code>winget install --id Git.Git -e</code>), then reopen this tab.</div>`;
  } else {
    const summary = !st.initialized ? 'no git history yet — your first commit starts it'
      : `branch <b>${escapeHtml(st.branch || '?')}</b>${st.lastCommit ? ` · last commit <code>${escapeHtml(st.lastCommit.short)}</code> ${escapeHtml(st.lastCommit.subject)}` : ' · no commits yet'}${st.upstream ? ` · tracks ${escapeHtml(st.upstream)}${st.ahead ? ` · <b>${st.ahead} to push</b>` : ''}${st.behind ? ` · <b>${st.behind} to pull</b>` : ''}` : ''} · ${st.changeCount ? `<b>${st.changeCount} changed file(s)</b>` : 'nothing to commit'}`;
    gitHtml = `<div style="margin-bottom:8px">${summary}</div>
      ${row('remote', `<input id="git-remote" style="flex:1;min-width:280px" placeholder="git@github.com:you/${escapeHtml((repo.name || 'repo').replace(/\s+/g, '-'))}.git  or  https://github.com/you/…" value="${escapeHtml(origin ? origin.url : '')}"><button class="action-btn" onclick="gitSetRemote('${repo.uuid}')">save</button>`)}
      ${row('sign in with', `<select id="git-key" onchange="_gitState.keyAlias=this.value"><option value="">no SSH key (https / public)</option>${(st.sshKeys || []).map(k => `<option value="${escapeHtml(k)}" ${k === _gitState.keyAlias ? 'selected' : ''}>SSH key “${escapeHtml(k)}”</option>`).join('')}</select>
        <button class="action-btn" onclick="gitKeygen('${repo.uuid}')">create an SSH key…</button>
        <button class="action-btn" onclick="gitSetToken('${repo.uuid}')">${st.hasToken ? 'replace' : 'set'} https token…</button>
        <span style="font-size:10px;opacity:.6">${st.hasToken ? 'an https token is stored for this repo' : ''}</span>`)}
      ${st.immutable ? '<div style="font-size:11px;opacity:.7;margin:6px 0">This is a Nexus system repo (immutable) — you can push it, but pulls go through a branch.</div>' : ''}
      ${row('commit', `<input id="git-msg" style="flex:1;min-width:280px" placeholder="what changed"><button class="action-btn primary" onclick="gitCommit('${repo.uuid}')">commit</button>`)}
      <div style="display:flex;gap:8px;margin:10px 0">
        <button class="action-btn" onclick="gitPull('${repo.uuid}')" ${st.immutable || !origin ? 'disabled' : ''}>↓ pull</button>
        <button class="action-btn primary" onclick="gitPush('${repo.uuid}')" ${!origin ? 'disabled title="set a remote first"' : ''}>↑ push</button>
        <button class="action-btn" onclick="renderRepoGit(CURRENT_API_REPO)">refresh</button>
      </div>
      ${(st.changes || []).length ? `<details><summary style="cursor:pointer;font-size:11px">changed files (${st.changeCount})</summary><pre style="max-height:200px;overflow:auto;font-size:10px">${escapeHtml(st.changes.slice(0, 200).map(c => `${c.status.padEnd(2)} ${c.path}`).join('\n'))}</pre></details>` : ''}
      <pre id="git-log" style="white-space:pre-wrap;max-height:220px;overflow:auto;font-size:10px;margin-top:8px">${escapeHtml(_gitState.log)}</pre>`;
  }
  const cfgText = ci && ci.config ? JSON.stringify(ci.config, null, 2) : '';
  const ciHtml = ci && ci.error ? `<div style="color:var(--coral)">${escapeHtml(ci.error)}</div>`
    : `<div style="font-size:11px;opacity:.75;margin-bottom:6px">Stages run in order in COS's sandbox with this repo as the working folder. <code>command</code> stages run a command line; <code>ssh</code> stages run on a server with an SSH key alias (deploys). Secrets you store are given to stages as <code>CI_SECRET_*</code> variables.${repo.compartmentId ? '' : ' <b>This repo has no compartment, so the pipeline cannot run here.</b>'}</div>
      <textarea id="ci-config" spellcheck="false" style="width:100%;min-height:200px;font-family:var(--mono);font-size:11px">${escapeHtml(cfgText)}</textarea>
      <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap">
        <button class="action-btn" onclick="ciStarter('${repo.uuid}')">fill in a starter pipeline</button>
        <button class="action-btn" onclick="ciSave('${repo.uuid}')">save pipeline</button>
        <button class="action-btn primary" onclick="ciRun('${repo.uuid}')" ${repo.compartmentId ? '' : 'disabled'}>▶ run pipeline</button>
      </div>
      <div id="ci-result"></div>
      <div style="font-size:10px;opacity:.6;letter-spacing:.08em;margin-top:10px">RECENT RUNS</div>
      ${(runs.runs || []).map(r => `<div style="font-family:var(--mono);font-size:11px;padding:3px 0;border-bottom:1px solid var(--b0);cursor:pointer" onclick="ciShowRun('${repo.uuid}','${r.runId}')"><span style="color:${r.status === 'passed' ? 'var(--mint)' : r.status === 'failed' ? 'var(--coral)' : 'inherit'}">${escapeHtml(r.status)}</span> · ${new Date(r.startedAt).toLocaleString()} · ${r.durationMs}ms · ${r.stages.map(x => `${escapeHtml(x.name)}:${escapeHtml(x.status)}`).join(' ')}</div>`).join('') || '<div style="font-size:11px;opacity:.5">no runs yet</div>'}`;
  const remHtml = repo.compartmentId
    ? `<div style="font-size:11px;opacity:.75;margin-bottom:6px;white-space:normal">Push this repo's whole compartment — its folder, files and history — to a folder (USB drive, network share, OneDrive / Dropbox / Google Drive) or a server over SSH, and pull it on any other machine running Nexus. Secrets and SSH keys stay on each machine.</div><div id="cos-remotes-box">${'<div style="opacity:.6">reading remotes…</div>'}</div>`
    : '<div style="font-size:11px;opacity:.7">This repo has no compartment, so it has nothing to push as one.</div>';
  el.innerHTML = box('COMPARTMENT REMOTES — PUSH / PULL', remHtml) + box('GIT', gitHtml) + box('CI / CD', ciHtml);
  if (repo.compartmentId) renderCosRemotes(repo.compartmentId, 'cos-remotes-box', st.sshKeys || []);
}
async function _gitCall(uuid, what, body, label) {
  _gitLog(`${label}…`);
  try {
    const r = await api(`/api/repos/${uuid}/git/${what}`, { method: 'POST', body: JSON.stringify(body || {}) }, 330000);
    return r;
  } catch (e) { _gitLog(`${label} failed: ${e.message}`, true); toast(`${label} failed: ${e.message}`, 'err'); return null; }
}
async function gitSetRemote(uuid) {
  const url = (document.getElementById('git-remote') || {}).value || '';
  const r = await _gitCall(uuid, 'remote', { url }, 'set remote');
  if (r) { _gitLog(`remote ${r.name} → ${r.url}`); toast('remote saved', 'ok'); renderRepoGit(CURRENT_API_REPO); }
}
async function gitCommit(uuid) {
  const message = (document.getElementById('git-msg') || {}).value || '';
  if (!message.trim()) { toast('write what changed first', 'err'); return; }
  const r = await _gitCall(uuid, 'commit', { message }, 'commit');
  if (!r) return;
  _gitLog(r.nothingToCommit ? 'nothing to commit — the folder matches the last commit' : `committed ${r.commit.slice(0, 8)} · ${r.files} file(s)`);
  renderRepoGit(CURRENT_API_REPO);
}
async function gitPush(uuid) {
  const r = await _gitCall(uuid, 'push', { keyAlias: _gitState.keyAlias || undefined }, 'push');
  if (!r) return;
  _gitLog(`pushed ${r.branch} → ${r.remote}${r.output ? `\n${r.output}` : ''}`); toast('pushed', 'ok');
  renderRepoGit(CURRENT_API_REPO);
}
async function gitPull(uuid) {
  const r = await _gitCall(uuid, 'pull', { keyAlias: _gitState.keyAlias || undefined }, 'pull');
  if (!r) return;
  _gitLog(r.upToDate ? 'already up to date' : `pulled ${r.branch}: ${r.applied.length} file(s) updated, ${r.removed.length} removed${r.binary.length ? `, ${r.binary.length} binary file(s) kept on disk only` : ''}${r.failed.length ? `, ${r.failed.length} could not be applied: ${r.failed.map(f => f.path).join(', ')}` : ''}`, r.failed.length > 0);
  toast(r.upToDate ? 'already up to date' : 'pulled', 'ok');
  if (!r.upToDate) await loadApiRepos();
  renderRepoGit(CURRENT_API_REPO);
}
async function gitKeygen(uuid) {
  const alias = prompt('Name for the new SSH key (snake_case, e.g. github_deploy):', 'github');
  if (!alias) return;
  const r = await _gitCall(uuid, 'keygen', { alias: alias.trim() }, 'create SSH key');
  if (!r) return;
  _gitState.keyAlias = r.alias;
  const body = document.getElementById('repo-diagnose-body');
  document.getElementById('repo-diagnose-title').textContent = `SSH key “${r.alias}”`;
  document.getElementById('repo-diagnose-reindex').style.display = 'none';
  body.innerHTML = `<div style="white-space:normal">${r.existed ? 'This key already existed and is now registered to this repo.' : 'A new key was created and registered to this repo.'} The private key stays at <code>${escapeHtml(r.keyPath)}</code>; only the public key below leaves this computer.</div>
    <ol style="white-space:normal;line-height:1.7">
      <li>Copy the public key: <button class="action-btn" onclick="navigator.clipboard.writeText(${escapeHtml(JSON.stringify(r.publicKey || ''))});toast('copied','ok')">copy</button></li>
      <li>GitHub: <b>Settings → SSH and GPG keys → New SSH key</b> (all your repos), or the repo's <b>Settings → Deploy keys → Add</b> with “Allow write access” (just this one). GitLab: <b>Preferences → SSH Keys</b>.</li>
      <li>Set the remote to the <b>SSH</b> URL (<code>git@github.com:you/repo.git</code>), pick this key under “sign in with”, and push.</li>
    </ol>
    <pre style="white-space:pre-wrap;word-break:break-all;font-size:11px">${escapeHtml(r.publicKey || '(public key file not found)')}</pre>`;
  document.getElementById('repo-diagnose-modal').classList.add('open');
  renderRepoGit(CURRENT_API_REPO);
}
async function gitSetToken(uuid) {
  const value = prompt('Paste an https access token (GitHub: Settings → Developer settings → Personal access tokens, with repo / contents: write). It is stored encrypted in this repo\'s compartment vault and only given to git.');
  if (!value) return;
  try { await api(`/api/repos/${uuid}/ci/secrets`, { method: 'POST', body: JSON.stringify({ name: 'git_token', value: value.trim() }) }, 20000); toast('token stored', 'ok'); _gitLog('https token stored for this repo'); }
  catch (e) { toast(`could not store the token: ${e.message}`, 'err'); }
  renderRepoGit(CURRENT_API_REPO);
}
function ciStarter(uuid) {
  const files = (CURRENT_API_REPO && CURRENT_API_REPO.files || []).map(f => f.path);
  const has = (re) => files.some(p => re.test(p));
  const stages = has(/(^|\/)package\.json$/) ? [{ name: 'install', kind: 'command', run: 'npm install' }, { name: 'test', kind: 'command', run: 'npm test' }]
    : has(/(^|\/)(requirements\.txt|pyproject\.toml)$/) ? [{ name: 'install', kind: 'command', run: 'pip install -r requirements.txt' }, { name: 'test', kind: 'command', run: 'python -m pytest' }]
    : has(/(^|\/)go\.mod$/) ? [{ name: 'test', kind: 'command', run: 'go test ./...' }]
    : has(/(^|\/)Cargo\.toml$/) ? [{ name: 'test', kind: 'command', run: 'cargo test' }]
    : [{ name: 'check', kind: 'command', run: 'echo add your build and test commands here' }];
  stages.push({ name: 'deploy', kind: 'ssh', host: 'user@your-server', keyAlias: _gitState.keyAlias || 'deploy_key', run: 'cd /srv/app && git pull && npm install --omit=dev', continueOnError: false });
  const cfg = { version: 1, stages, triggers: { onChunkDone: false, onCommit: false } };
  const ta = document.getElementById('ci-config');
  if (ta) ta.value = JSON.stringify(cfg, null, 2);
  toast('starter pipeline filled in — edit the deploy stage (or delete it), then save', 'ok');
}
async function ciSave(uuid) {
  let config;
  try { config = JSON.parse((document.getElementById('ci-config') || {}).value || ''); }
  catch (e) { toast(`the pipeline is not valid JSON: ${e.message}`, 'err'); return; }
  try { await api(`/api/repos/${uuid}/ci`, { method: 'PUT', body: JSON.stringify({ config }) }, 20000); toast('pipeline saved', 'ok'); }
  catch (e) { toast(`not saved: ${e.message}`, 'err'); }
}
async function ciRun(uuid) {
  const out = document.getElementById('ci-result');
  if (out) out.innerHTML = '<div style="opacity:.6">running the pipeline…</div>';
  let r;
  try { r = await api(`/api/repos/${uuid}/ci/run`, { method: 'POST', body: JSON.stringify({}) }, 900000); }
  catch (e) { if (out) out.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  if (out) out.innerHTML = _ciRunHtml(r.run);
  toast(`pipeline ${r.run.status}`, r.run.status === 'passed' ? 'ok' : 'err');
}
async function ciShowRun(uuid, runId) {
  const out = document.getElementById('ci-result');
  try { const r = await api(`/api/repos/${uuid}/ci/runs/${runId}`, {}, 20000); if (out) out.innerHTML = _ciRunHtml(r.run); }
  catch (e) { if (out) out.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; }
}
function _ciRunHtml(run) {
  if (!run) return '';
  const col = (s) => s === 'passed' ? 'var(--mint)' : s === 'failed' ? 'var(--coral)' : 'inherit';
  return `<div style="margin:6px 0"><b style="color:${col(run.status)}">${escapeHtml(run.status)}</b> · ${run.durationMs}ms</div>` + (run.stages || []).map(s => `
    <div style="margin:6px 0 2px"><span style="color:${col(s.status)}">${escapeHtml(s.status)}</span> · <b>${escapeHtml(s.name)}</b> (${escapeHtml(s.kind || 'command')}) · exit ${s.exitCode ?? '—'} · ${s.durationMs ?? '—'}ms</div>
    ${s.stdout ? `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:10px;margin:0">${escapeHtml(String(s.stdout).slice(-4000))}</pre>` : ''}
    ${s.stderr ? `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:10px;margin:0;color:var(--coral)">${escapeHtml(String(s.stderr).slice(-4000))}</pre>` : ''}`).join('');
}

// Clone a git URL into a new repo (welcome page → "Clone from git").
function openGitCloneModal() {
  if (!CONNECTED) { toast('connect to nexus first', 'err'); return; }
  document.getElementById('repo-diagnose-title').textContent = 'Clone from git';
  document.getElementById('repo-diagnose-reindex').style.display = 'none';
  document.getElementById('repo-diagnose-body').innerHTML = `
    <div style="white-space:normal;margin-bottom:8px">Brings a git repository in as a new repo — its files, and its history, so pull and push work straight away (Git &amp; CI tab).</div>
    <div style="margin:6px 0"><div style="font-size:10px;opacity:.7">repository URL</div><input id="clone-url" style="width:100%" placeholder="https://github.com/owner/repo.git  or  git@github.com:owner/repo.git"></div>
    <div style="margin:6px 0"><div style="font-size:10px;opacity:.7">name (optional)</div><input id="clone-name" style="width:100%"></div>
    <details style="margin:6px 0"><summary style="cursor:pointer;font-size:11px">private repository?</summary>
      <div style="font-size:10px;opacity:.7;margin-top:6px">SSH: the full path to a private key on this computer (e.g. C:\\Users\\you\\.ssh\\id_ed25519)</div><input id="clone-key" style="width:100%">
      <div style="font-size:10px;opacity:.7;margin-top:6px">https: an access token (used for this clone only, not stored)</div><input id="clone-token" type="password" style="width:100%">
    </details>
    <div style="margin-top:10px"><button class="modal-btn confirm" onclick="gitClone()">Clone</button></div>
    <div id="clone-result" style="margin-top:8px"></div>`;
  document.getElementById('repo-diagnose-modal').classList.add('open');
  setTimeout(() => { const i = document.getElementById('clone-url'); if (i) i.focus(); }, 30);
}
async function gitClone() {
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const out = document.getElementById('clone-result');
  if (!v('clone-url')) { toast('paste the repository URL', 'err'); return; }
  out.innerHTML = '<div style="opacity:.6">cloning…</div>';
  let r;
  try { r = await api('/api/git/clone', { method: 'POST', body: JSON.stringify({ url: v('clone-url'), name: v('clone-name') || undefined, keyPath: v('clone-key') || undefined, token: v('clone-token') || undefined }) }, 330000); }
  catch (e) { out.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  out.innerHTML = `<div style="color:var(--mint)">cloned “${escapeHtml(r.name)}” · ${r.fileCount} file(s)${r.omittedCount ? ` · ${r.omittedCount} skipped` : ''} — indexing it now</div>`;
  toast(`cloned ${r.name}`, 'ok');
  await loadApiRepos();
  api(`/api/repos/${r.repoUuid}/chunk`, { method: 'POST', body: JSON.stringify({}) }, 600000).then(() => loadApiRepos()).catch(e => toast(`indexing: ${e.message}`, 'err'));
  document.getElementById('repo-diagnose-modal').classList.remove('open');
  if (typeof selectApiRepo === 'function') selectApiRepo(r.repoUuid);
}

// ── §COMPARTMENT REMOTES — §0.39.265 ──────────────────────────────────────
// James: "push pull for the compartments remotely." lib/cos-remote.js through
// /api/cos/compartments/:cid/remotes…: a remote is a folder (drive, share,
// synced cloud folder) or user@host:path over ssh. Status is in-sync / ahead /
// behind / diverged; a refused push or pull says why and offers force (a pull
// always backs up what it replaces).
const _REMOTE_STATE = { 'in-sync': ['in sync', 'var(--mint)'], ahead: ['this machine is ahead — push', 'var(--amber)'], behind: ['the remote is ahead — pull', 'var(--amber)'],
  diverged: ['both changed', 'var(--coral)'], 'not-pushed': ['not pushed yet', 'var(--text3)'] };
const _remoteStatus = {};   // `${cid}/${name}` -> last status
async function renderCosRemotes(cid, boxId, sshKeys = []) {
  const el = document.getElementById(boxId);
  if (!el) return;
  let r;
  try { r = await api(`/api/cos/compartments/${cid}/remotes`, {}, 20000); }
  catch (e) { el.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  const when = (t) => t ? new Date(t).toLocaleString() : 'never';
  const rows = r.remotes.map(x => {
    const st = _remoteStatus[`${cid}/${x.name}`];
    const badge = st ? (st.error ? `<span style="color:var(--coral)">${escapeHtml(st.error)}</span>` : `<span style="color:${(_REMOTE_STATE[st.state] || ['', 'inherit'])[1]}">${escapeHtml((_REMOTE_STATE[st.state] || [st.state])[0])}</span>${st.diffCount ? ` · <span title="${escapeHtml((st.diff || []).slice(0, 30).map(d => `${d.path} — ${d.change}`).join('\n'))}">${st.diffCount} file(s) differ</span>` : ''}${st.remoteInfo ? ` · remote from ${escapeHtml(st.remoteInfo.from && st.remoteInfo.from.host || '?')} ${new Date(st.remoteInfo.pushedAt).toLocaleString()}` : ''}`) : '';
    return `<div style="border-bottom:1px solid var(--b0);padding:6px 0">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>${escapeHtml(x.name)}</b><span style="font-size:10px;opacity:.7">${x.kind === 'ssh' ? 'ssh' : 'folder'} · ${escapeHtml(x.location)}${x.keyAlias ? ` · key “${escapeHtml(x.keyAlias)}”` : ''}</span>
        <span style="flex:1"></span>
        <button class="action-btn" onclick="cosRemoteStatus('${cid}','${x.name}','${boxId}')">check</button>
        <button class="action-btn" onclick="cosRemotePull('${cid}','${x.name}','${boxId}')">↓ pull</button>
        <button class="action-btn primary" onclick="cosRemotePush('${cid}','${x.name}','${boxId}')">↑ push</button>
        <button class="action-btn" title="forget this remote (nothing on it is deleted)" onclick="cosRemoteRemove('${cid}','${x.name}','${boxId}')">✕</button></div>
      <div style="font-size:10px;opacity:.75;margin-top:3px">last push ${when(x.lastPush)} · last pull ${when(x.lastPull)} ${badge ? '· ' + badge : ''}</div></div>`;
  }).join('');
  el.innerHTML = `<div style="font-size:10px;opacity:.6;margin-bottom:4px">compartment <b>${escapeHtml(r.name)}</b> · travels: ${r.parts.map(p => p === 'project' ? 'its project folder' : 'its own folder').join(' + ') || 'its own folder'}</div>
    ${rows || '<div style="font-size:11px;opacity:.6">no remotes yet — add one below</div>'}
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">
      <input id="${boxId}-name" style="width:90px" placeholder="name" value="${r.remotes.length ? '' : 'origin'}">
      <input id="${boxId}-loc" style="flex:1;min-width:260px" placeholder="D:\\nexus-remote   or   C:\\Users\\you\\OneDrive\\nexus   or   you@server:nexus">
      <select id="${boxId}-key" title="ssh remotes only"><option value="">no SSH key</option>${sshKeys.map(k => `<option value="${escapeHtml(k)}">SSH key “${escapeHtml(k)}”</option>`).join('')}</select>
      <button class="action-btn" onclick="cosRemoteAdd('${cid}','${boxId}')">add remote</button></div>
    <div style="font-size:10px;opacity:.6;margin-top:4px;white-space:normal">A folder remote works with anything that syncs a folder between computers. An SSH remote needs only a login on the server (keys: create one in the Git section below and add its public key to the server's ~/.ssh/authorized_keys).</div>`;
}
async function cosRemoteAdd(cid, boxId) {
  const v = (s) => ((document.getElementById(`${boxId}-${s}`) || {}).value || '').trim();
  try { await api(`/api/cos/compartments/${cid}/remotes`, { method: 'POST', body: JSON.stringify({ name: v('name') || 'origin', location: v('loc'), keyAlias: v('key') || null }) }, 20000); toast('remote added', 'ok'); }
  catch (e) { toast(`not added: ${e.message}`, 'err'); return; }
  _rerenderRemotes(cid, boxId);
}
async function cosRemoteRemove(cid, name, boxId) {
  if (!confirm(`Forget the remote "${name}"? Nothing stored on it is deleted.`)) return;
  try { await api(`/api/cos/compartments/${cid}/remotes/${encodeURIComponent(name)}`, { method: 'DELETE' }, 20000); } catch (e) { toast(e.message, 'err'); }
  _rerenderRemotes(cid, boxId);
}
function _rerenderRemotes(cid, boxId) {
  const keys = [...document.querySelectorAll(`#${boxId}-key option`)].map(o => o.value).filter(Boolean);
  renderCosRemotes(cid, boxId, keys);
}
async function cosRemoteStatus(cid, name, boxId) {
  toast('comparing with the remote…', 'ok');
  try { _remoteStatus[`${cid}/${name}`] = await api(`/api/cos/compartments/${cid}/remotes/${encodeURIComponent(name)}/status`, {}, 600000); }
  catch (e) { _remoteStatus[`${cid}/${name}`] = { error: e.message }; }
  _rerenderRemotes(cid, boxId);
}
async function _cosRemoteOp(cid, name, boxId, op, force = false) {
  toast(`${op === 'push' ? 'pushing' : 'pulling'}…`, 'ok');
  let r;
  try { r = await api(`/api/cos/compartments/${cid}/remotes/${encodeURIComponent(name)}/${op}`, { method: 'POST', body: JSON.stringify({ force }) }, 1800000); }
  catch (e) {
    const state = e.data && e.data.detail && e.data.detail.state;
    if (!force && (state === 'behind' || state === 'diverged' || state === 'ahead')) {
      const msg = op === 'push'
        ? `${e.message}\n\nPush anyway and REPLACE what is on the remote? (The remote keeps the version before this push as bundle.prev.zip.)`
        : `${e.message}\n\nPull anyway and REPLACE this machine's version? (It is backed up first.)`;
      if (confirm(msg)) return _cosRemoteOp(cid, name, boxId, op, true);
    } else toast(`${op} failed: ${e.message}`, 'err');
    _remoteStatus[`${cid}/${name}`] = { error: e.message };
    _rerenderRemotes(cid, boxId);
    return;
  }
  if (op === 'push') toast(r.nothingToPush ? 'already in sync — nothing to push' : `pushed ${r.files} file(s) · ${Math.round((r.bundleBytes || 0) / 1024)} KB`, 'ok');
  else toast(r.upToDate ? 'already up to date' : `pulled${r.repoSync ? ` · repo: ${r.repoSync.applied.length} updated, ${r.repoSync.removed.length} removed` : ''}${r.backup ? ' · previous version backed up' : ''}`, 'ok');
  _remoteStatus[`${cid}/${name}`] = { state: 'in-sync' };
  if (op === 'pull' && r.repoUuid) await loadApiRepos();
  _rerenderRemotes(cid, boxId);
}
function cosRemotePush(cid, name, boxId) { return _cosRemoteOp(cid, name, boxId, 'push'); }
function cosRemotePull(cid, name, boxId) { return _cosRemoteOp(cid, name, boxId, 'pull'); }

// Welcome → "Compartments": every compartment on this machine with its remotes,
// and pulling one this machine does not have from a remote.
async function openCosRemoteBrowse() {
  if (!CONNECTED) { toast('connect to nexus first', 'err'); return; }
  document.getElementById('repo-diagnose-title').textContent = 'Compartments — push & pull';
  document.getElementById('repo-diagnose-reindex').style.display = 'none';
  const body = document.getElementById('repo-diagnose-body');
  body.innerHTML = '<div style="opacity:.6">reading compartments…</div>';
  document.getElementById('repo-diagnose-modal').classList.add('open');
  let r;
  try { r = await api('/api/cos/compartments', {}, 20000); } catch (e) { body.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  body.innerHTML = `
    <div class="ds-label" style="margin-bottom:4px">PULL A COMPARTMENT FROM A REMOTE</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <input id="cosb-loc" style="flex:1;min-width:260px" placeholder="D:\\nexus-remote   or   you@server:nexus">
      <input id="cosb-key" style="width:260px" placeholder="SSH private key path (ssh only)">
      <button class="action-btn primary" onclick="cosRemoteBrowse()">look</button></div>
    <div id="cosb-list" style="margin:8px 0 16px"></div>
    <div class="ds-label" style="margin-bottom:4px">ON THIS MACHINE (${r.compartments.length})</div>
    ${r.compartments.map(c => `<details style="border-bottom:1px solid var(--b0);padding:4px 0" ontoggle="if(this.open)renderCosRemotes('${c.id}','cosr-${c.id}')">
      <summary style="cursor:pointer"><b>${escapeHtml(c.name)}</b> <span style="font-size:10px;opacity:.7">${c.repo ? `repo “${escapeHtml(c.repo.name)}” · ` : ''}${c.remotes.length ? c.remotes.map(x => escapeHtml(x.name)).join(', ') : 'no remotes'}${c.purpose ? ` · ${escapeHtml(c.purpose.slice(0, 80))}` : ''}</span></summary>
      <div id="cosr-${c.id}" style="padding:6px 0 6px 12px"><div style="opacity:.6">…</div></div></details>`).join('') || '<div style="opacity:.6">no compartments</div>'}`;
}
async function cosRemoteBrowse() {
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  const out = document.getElementById('cosb-list');
  out.innerHTML = '<div style="opacity:.6">looking…</div>';
  let r;
  try { r = await api('/api/cos/remote/browse', { method: 'POST', body: JSON.stringify({ location: v('cosb-loc'), keyPath: v('cosb-key') || undefined }) }, 300000); }
  catch (e) { out.innerHTML = `<div style="color:var(--coral)">${escapeHtml(e.message)}</div>`; return; }
  out.innerHTML = r.compartments.map(c => `<div style="display:flex;gap:10px;align-items:center;padding:4px 0;border-bottom:1px solid var(--b0)">
      <b>${escapeHtml(c.name)}</b><span style="font-size:10px;opacity:.7;flex:1">${c.files} files · ${Math.round(c.bytes / 1024)} KB · pushed ${new Date(c.pushedAt).toLocaleString()} from ${escapeHtml(c.from && c.from.host || '?')}${c.purpose ? ` · ${escapeHtml(c.purpose.slice(0, 60))}` : ''}</span>
      ${c.here ? '<span style="font-size:10px;opacity:.7">already here — pull from its remotes</span>' : `<button class="action-btn primary" onclick="cosRemoteClone(${escapeHtml(JSON.stringify(c.name))})">pull it here</button>`}</div>`).join('')
    || '<div style="opacity:.6">nothing has been pushed there yet</div>';
}
async function cosRemoteClone(name) {
  const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
  toast(`pulling ${name}…`, 'ok');
  let r;
  try { r = await api('/api/cos/remote/clone', { method: 'POST', body: JSON.stringify({ location: v('cosb-loc'), keyPath: v('cosb-key') || undefined, name }) }, 1800000); }
  catch (e) { toast(`pull failed: ${e.message}`, 'err'); return; }
  toast(`pulled ${r.name} · ${r.files} file(s)${r.repo && r.repo.repoUuid ? ' · its project is a repo now' : ''}${r.repo && r.repo.error ? ` · repo import failed: ${r.repo.error}` : ''}`, r.repo && r.repo.error ? 'err' : 'ok');
  if (r.repo && r.repo.repoUuid) {
    await loadApiRepos();
    api(`/api/repos/${r.repo.repoUuid}/chunk`, { method: 'POST', body: JSON.stringify({}) }, 600000).then(() => loadApiRepos()).catch(() => {});
  }
  openCosRemoteBrowse();
}

// §0.39.279 — James: "once its generated, you can open it like a desktop environment". The viewer page boots the VM
// (POST /api/repos/:uuid/desktop) and draws its screen; a Clear Glass window when idearium runs inside it.
function openRepoDesktop(repoUuid) {
  if (!API_BASE) { toast('idearium is offline — the desktop is served by it', 'err'); return; }
  // served by idearium itself (same origin as its /api), wherever this UI was loaded from
  const w = window.open(`${API_BASE}/desktop.html?repo=${encodeURIComponent(repoUuid)}`, `desktop-${repoUuid}`, 'width=1320,height=860');
  if (!w) toast('the desktop window was blocked — allow pop-ups for idearium', 'err');
}

// §0.39.279 — the settings console (ui/settings.html): idearium's config and every repo's agent / prompt / hat /
// compartment / desktop settings in one window, served by idearium itself.
// §0.39.283 N30 — James: "give copilot a command … i want to import my archives of nexus. have it pull up a drop box
// ui and run the command". The drop box (ui/archive-import.html), served by idearium: /import-archives in the CLI,
// or plainly "import my archives", opens it.
function openArchiveImport() {
  if (!API_BASE) { toast('idearium is offline — the archive import is served by it', 'err'); return null; }
  const w = window.open(`${API_BASE}/archive-import.html`, 'idearium-archive-import', 'width=1120,height=880');
  if (!w) toast('the archive import window was blocked — allow pop-ups for idearium', 'err');
  return w;
}
// §0.39.290 IL1 — James: "my goal is to build these, eventually. im, the idea guy" · "need a way to import these and
// convert them." The spec library (ui/spec-library.html): a zip of specs → ideas with their specs.
let _specLibraryWin = null;
function openSpecLibrary() {
  if (!API_BASE) { toast('idearium is offline — the spec library is served by it', 'err'); return null; }
  const w = window.open(`${API_BASE}/spec-library.html`, 'idearium-spec-library', 'width=1180,height=900');
  if (!w) toast('the spec library window was blocked — allow pop-ups for idearium', 'err');
  _specLibraryWin = w || _specLibraryWin;
  return w;
}
// §0.39.294 SW1 — the spec workshop (ui/workshop.html). James: "need the spec workshop, completely destroy the spec
// builder, and build the spec workshop" · "the workshop and maybe it hooks into the spec field". from: 'idea:<uuid>' |
// 'library:<sha>' | 'repo:<uuid>' starts one there; a workshop id opens it; nothing opens the start screen.
let _workshopWin = null, _voidWin = null;
// §0.39.295 — the spatial void (ui/void.html), its own page. James: "The spacial void is its own page."
function openVoid() {
  if (!API_BASE) { toast('idearium is offline — the void is served by it', 'err'); return null; }
  const w = window.open(`${API_BASE}/void.html`, 'idearium-void', 'width=1480,height=940');
  if (!w) toast('the void window was blocked — allow pop-ups for idearium', 'err');
  _voidWin = w || _voidWin;
  return w;
}
// §0.39.300 WS3 — the pipeline's third station as its own page, like the Void and the workshop (the Build tab frames the same page)
let _architectWin = null;
// §0.39.300 UI1 — James: "make idearium full screen". The whole page, browser chrome gone; SHIFT+F toggles it (F alone is the canvas's FIT), Esc leaves it
// (the browser's own). Where the host refuses (an embed without allowfullscreen) it is said, not silent.
function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement) { d.exitFullscreen().catch(() => {}); return; }
  const el = d.documentElement;
  (el.requestFullscreen ? el.requestFullscreen() : Promise.reject(new Error('not supported')))
    .catch(e => { if (typeof toast === 'function') toast(`FULL SCREEN REFUSED — ${e.message}`, 'warn'); });
}
document.addEventListener('fullscreenchange', () => {
  const b = document.getElementById('tab-fullscreen');
  if (b) { b.classList.toggle('active', !!document.fullscreenElement); b.title = document.fullscreenElement ? 'LEAVE FULL SCREEN (SHIFT+F · ESC)' : 'FULL SCREEN (SHIFT+F)'; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'F' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable) toggleFullscreen();
});
document.addEventListener('click', () => document.querySelectorAll('.welcome-more.open').forEach(m => m.classList.remove('open')));

function openArchitect(from = null) {
  if (!API_BASE) { toast('idearium is offline — the architect is served by it', 'err'); return null; }
  const w = window.open(`${API_BASE}/architect.html${from ? `?from=${encodeURIComponent(from)}` : ''}`, 'idearium-architect', 'width=1520,height=960');
  if (!w) toast('the architect window was blocked — allow pop-ups for idearium', 'err');
  _architectWin = w || _architectWin;
  return w;
}
function openWorkshop(from = null, id = null) {
  if (!API_BASE) { toast('idearium is offline — the spec workshop is served by it', 'err'); return null; }
  const q = id ? `?id=${encodeURIComponent(id)}` : from ? `?from=${encodeURIComponent(from)}` : '';
  const w = window.open(`${API_BASE}/workshop.html${q}`, 'idearium-workshop', 'width=1440,height=920');
  if (!w) toast('the spec workshop window was blocked — allow pop-ups for idearium', 'err');
  _workshopWin = w || _workshopWin;
  return w;
}
// §0.39.292 IL2 / §0.39.294 SW1 — a window idearium opened (the spec library, the workshop) asks it to open a repo or the
// workshop; a message from any other window is ignored
window.addEventListener('message', async (ev) => {
  const d = ev.data;
  if (!d || !/^nexus:(repo\.open|workshop\.open)$/.test(String(d.type))) return;
  const archFrame = document.getElementById('architect-frame');   // §0.39.299 AR4 — the Build tab's Architect is idearium's own page
  const mine = [_specLibraryWin, _workshopWin, _voidWin, _architectWin, archFrame && archFrame.contentWindow].filter(Boolean);
  if (!mine.includes(ev.source)) { console.warn(`[idearium] ${d.type} ignored: not from a window idearium opened`); return; }
  if (d.type === 'nexus:workshop.open') {
    if (/^(idea|library|repo):[\w.-]{4,80}$/.test(String(d.from || ''))) openWorkshop(d.from);
    return;
  }
  if (!/^[\w-]{4,80}$/.test(String(d.repoUuid || ''))) return;
  await loadApiRepos();
  const repo = API_REPOS.find(r => r.uuid === d.repoUuid);
  if (!repo) { toast(`the repo is not listed yet: ${d.repoUuid}`, 'err'); return; }
  openRepoFor(repo.ideaUuid, repo.specUuid, repo.name);
  if ((d.subtab === 'spec' || d.subtab === 'architect') && typeof setRepoSubtab === 'function') setRepoSubtab(d.subtab);
  toast(d.subtab === 'spec' ? `${repo.name}: its spec, from the workshop` : d.subtab === 'architect' ? `${repo.name}: its architecture` : `${repo.name}: in the pipeline — Phases, Generate code, Build & prove`, 'ok');
});
/** "import my archives", "load the nexus zips", "restore my archive zips" — the drop box, not a question for the model */
const ARCHIVE_IMPORT_INTENT = /\b(import|bring in|load|restore)\b[^.\n]{0,40}\b(archives?|zips?|nexus history)\b/i;

function openSettingsConsole(repoUuid) {
  if (!API_BASE) { toast('idearium is offline — the settings console is served by it', 'err'); return; }
  const w = window.open(`${API_BASE}/settings.html${repoUuid ? `?repo=${encodeURIComponent(repoUuid)}` : ''}`, 'idearium-settings', 'width=1280,height=900');
  if (!w) toast('the settings window was blocked — allow pop-ups for idearium', 'err');
}

// §0.39.310 VP7 — renderRepoSettings moved to idearium/ui/js/repo-settings.js: categories, one pane at a time.

// Renders the selected repo as a real, nested, expanded-by-default file
// tree (same path-splitting the server's own RepoLayer.checklist() uses
// — see that method's header — replicated client-side since checklist()
// itself isn't exposed over HTTP; re-derives the exact same tree from
// the same files[] this panel already has). §OVERHAUL 2026-09-17 —
// previously a flat, unnested list of every path (unusable at scale —
// the repo this was built against has 502 files); now a real tree.
let REPO_TREE_COLLAPSED = new Set(); // dir paths the user closed (opt OUT, default open)
function renderApiRepoPanel(repo) {
  const tree = document.getElementById('file-tree');
  if (!ACTIVE_API_FILE) {
    document.getElementById('ide-tabs').textContent = 'no file open';
    document.getElementById('ide-code').textContent = '// click a file in the tree to open it here';
    _showIdeEditor(false);
  }
  if (!repo) {
    tree.innerHTML = `<div class="repo-empty">no repo linked yet<br><br>drop files below to attach one to this idea<br><br><button class="modal-btn confirm" onclick="document.getElementById('repo-drop-input').click()">drop repo files…</button></div>`;
    CURRENT_API_REPO = null; ACTIVE_API_FILE = null;
    return;
  }
  CURRENT_API_REPO = repo;
  const statusLine = repo.localPath
    ? `${repo.materializedCount||repo.fileCount} of ${repo.fileCount} files materialized — <span style="color:var(--mint)">${escapeHtml(repo.localPath)}</span>`
    : (repo.promotedFromSpec ? 'promoted from spec — file structure as components' : 'manifest only — file content isn\'t stored yet');

  // dir path -> { __dir:true, children:{} } | { __dir:false, ...file }
  const root = {};
  // §0.39.280 BS8 — files that exist only as a proposal are listed too, greyed (file-manage.js)
  for (const f of [...(repo.files || []), ...(typeof pendingOnlyFiles === 'function' ? pendingOnlyFiles(repo) : [])]) {
    const parts = f.path.split('/');
    let node = root;
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      node[parts[i]] = node[parts[i]] || { __dir: true, __path: acc, children: {} };
      node = node[parts[i]].children;
    }
    node[parts[parts.length - 1]] = { __dir: false, __path: f.path, ...f };
  }
  const canDelete = !!repo.localPath;
  function renderNode(node, depth) {
    const indent = `<span class="tree-indent" style="width:${depth*14}px"></span>`;
    const entries = Object.entries(node).sort(([a,av],[b,bv]) => {
      if (av.__dir !== bv.__dir) return av.__dir ? -1 : 1; // dirs first
      return a.localeCompare(b);
    });
    let html = '';
    for (const [name, entry] of entries) {
      if (entry.__dir) {
        const collapsed = REPO_TREE_COLLAPSED.has(entry.__path);
        html += `<div class="tree-node dir tree-dir${collapsed?' collapsed':''}" onclick="toggleTreeDir('${entry.__path.replace(/'/g,"\\'")}')">${indent}<span class="tree-caret">▾</span>📁 ${escapeHtml(name)}</div>`;
        html += `<div class="tree-children">${renderNode(entry.children, depth+1)}</div>`;
      } else {
        const active = ACTIVE_API_FILE === entry.__path ? ' active' : '';
        const statusDot = entry.status ? `<span class="tree-status-dot ${entry.status}" title="${escapeHtml(entry.status)}"></span>` : '';
        const compTag = entry.comp_id ? ` <span style="color:var(--violet);font-size:9px">▸${escapeHtml(entry.comp_id)}</span>` : '';
        const delBtn = canDelete && !entry.__pendingOnly ? `<span class="tree-file-del" title="delete" onclick="event.stopPropagation();deleteApiRepoFile('${repo.uuid}','${entry.__path.replace(/'/g,"\\'")}')">×</span>` : '';
        const fsm = typeof fileStateMark === 'function' ? fileStateMark(entry.__path) : { cls: '', mark: '' };
        html += `<div class="tree-node file${active}${fsm.cls}" onclick="openApiRepoFile('${repo.uuid}','${entry.__path.replace(/'/g,"\\'")}')">${indent}${statusDot||'📄'}<span class="tree-file-name">${escapeHtml(name)}${compTag}</span>${fsm.mark}<span class="tree-file-bytes">${entry.__pendingOnly ? 'proposed' : `${entry.bytes||0}b`}</span>${delBtn}</div>`;
      }
    }
    return html;
  }
  const treeHtml = Object.keys(root).length ? renderNode(root, 0) : '<div style="padding:14px;color:var(--text3);font-family:var(--mono);font-size:11px">no files</div>';
  // §MOVED 2026-09-20 — the add/fork/export/archive action strip that used
  // to live here moved to the Settings subtab (renderRepoSettings below):
  // those are repo-level actions, not file-tree controls, and the file
  // tree is now specifically the Files subtab's content.
  tree.innerHTML = `
    <div style="padding:8px 10px 4px;font-family:var(--mono);font-size:9px;color:var(--text3);line-height:1.5" id="repo-badge">${escapeHtml(repo.name)} — ${statusLine}${typeof fileStatesSummary === 'function' && fileStatesSummary() ? `<br><span class="fs-summary">${escapeHtml(fileStatesSummary())}</span>` : ''}</div>
    <div class="tree-toolbar"><input type="text" id="tree-file-filter" placeholder="filter files…" oninput="renderApiRepoPanel(CURRENT_API_REPO)"></div>
    <div>${treeHtml}</div>`;
  // client-side file filter (kept simple — text match on path, re-render
  // is cheap even at 500 files since it's one innerHTML write)
  const q = (document.getElementById('tree-file-filter')?.value || '').toLowerCase().trim();
  if (q) {
    const filtered = {};
    for (const f of (repo.files||[])) if (f.path.toLowerCase().includes(q)) filtered[f.path] = true;
    // simplest correct filter: hide tree-node.file rows whose path doesn't match, and any dir with no visible children
    tree.querySelectorAll('.tree-node.file').forEach(el => {
      const onclickAttr = el.getAttribute('onclick') || '';
      const m = onclickAttr.match(/openApiRepoFile\('[^']*','([^']*)'\)/);
      const path = m ? m[1].replace(/\\'/g, "'") : '';
      el.style.display = filtered[path] ? '' : 'none';
    });
    tree.querySelectorAll('.tree-dir').forEach(dirEl => {
      const children = dirEl.nextElementSibling;
      const anyVisible = children && [...children.querySelectorAll('.tree-node.file')].some(f => f.style.display !== 'none');
      dirEl.style.display = anyVisible ? '' : 'none';
      if (children) children.style.display = anyVisible ? '' : 'none';
    });
  }
  if (typeof loadFileStates === 'function') loadFileStates(repo);   // §0.39.280 BS8 — async; repaints when it lands
}
function toggleTreeDir(path) {
  if (REPO_TREE_COLLAPSED.has(path)) REPO_TREE_COLLAPSED.delete(path); else REPO_TREE_COLLAPSED.add(path);
  renderApiRepoPanel(CURRENT_API_REPO);
}
// ════════════════════════════════════════════════════
// §REPO TOOLBAR 2026-09-20 — James: "when you click the repo and enter it,
// i want where the create repo and import repo buttons are to change to
// run, branch, diagnose."
//
// Two <span> groups share the toolbar's right-hand slot; this swaps which
// one is displayed. Called from the three real entry/exit points that
// already exist (enterRepoDetail, openRepoFor, exitRepoDetail) rather than
// tracking repo-open state a second time — REPO_DETAIL_OPEN stays the one
// source of truth for "am I inside a repo".
//
// §HONEST STATE OF THE THREE ACTIONS, checked against the real route table
// in idearium/api/index.js before any of this was wired:
//   Branch   — REAL. POST /api/repos/:uuid/fork -> repo.fork -> RepoLayer
//              .fork(). forkApiRepo() already existed and already works;
//              this button is a second entry point to it, not a new path.
//   Diagnose — REAL. GET /api/repos/:uuid/verification (the import
//              pipeline's own L0-L8 tiers, with verify-lazy's L6-L8 merged
//              server-side) + GET /api/repos/:uuid/scan (repo/scan.js).
//   Run      — NOT REAL, and deliberately not faked. There is no test-env
//              runner anywhere in this codebase: grep for spawn/exec across
//              idearium finds only tar (spec-engine archive/restore) and
//              agent-suite's CLI shell-out. Nothing executes a materialised
//              repo. The button ships in its final position wearing
//              .tb-unwired and says so on click.
// ════════════════════════════════════════════════════
function _setRepoToolbarMode(mode) {
  const lib = document.getElementById('repo-tb-library');
  const det = document.getElementById('repo-tb-detail');
  if (!lib || !det) return; // tolerate the markup not being present
  const detail = mode === 'detail';
  lib.style.display = detail ? 'none' : '';
  det.style.display = detail ? '' : 'none';
}

// Guard shared by all three: every one of them needs a repo uuid, and
// CURRENT_API_REPO is null both before a repo is selected and for the
// openRepoFor() path where no repo exists for that idea/spec yet.
function _requireCurrentRepo(action) {
  if (!CURRENT_API_REPO || !CURRENT_API_REPO.uuid) {
    toast(`${action}: no repo selected`, 'err');
    return null;
  }
  return CURRENT_API_REPO;
}

function repoBranch() {
  const repo = _requireCurrentRepo('branch');
  if (repo) forkApiRepo(repo.uuid);
}

// §RUN 2026-09-21 — through COS: the repo is forked into a branch of its
// compartment and run in COS's sandbox (lib/repo-run.js). Results render in
// the diagnose modal: per target, exit code, time, and the tail of output.
// §0.39.261 — James: "the run button in cos to work fully … ask what id like to
// do. like a bunch of options for cos." Run opens the COS run menu for this repo
// (GET /api/repos/:uuid/run/options, lib/cos-run.js): every option, grouped,
// with the reason beside any that cannot run here. A Nexus system repo also
// picks which edit branch to run (the apply gate reads that run).
let _runMenu = null;
async function repoRun(mode = 'run') {
  const repo = _requireCurrentRepo('run');
  if (!repo) return;
  const body = document.getElementById('repo-diagnose-body');
  document.getElementById('repo-diagnose-title').textContent = `Run — ${repo.name || repo.uuid} (COS)`;
  document.getElementById('repo-diagnose-reindex').style.display = 'none';
  body.innerHTML = '<div style="opacity:.6">reading the run menu…</div>';
  document.getElementById('repo-diagnose-modal').classList.add('open');
  let m;
  try { m = await api(`/api/repos/${repo.uuid}/run/options`, {}, 30000); }
  catch (e) { body.innerHTML = `<div style="color:var(--bad,#f87171)">${escapeHtml(e.message)}</div>`; return; }
  _runMenu = { repo, ...m, selected: mode === 'test' ? 'test.all' : ((m.options.find(o => o.available) || {}).id || null) };
  _installDismissed = false;
  _renderRunMenu();
}

function _renderRunMenu() {
  const M = _runMenu; if (!M) return;
  const body = document.getElementById('repo-diagnose-body');
  const groups = { run: 'Run', test: 'Test', check: 'Check' };
  const sel = M.options.find(o => o.id === M.selected);
  const btn = (o) => `<button class="action-btn" style="text-align:left;display:block;width:100%;margin:3px 0;padding:6px 8px;${o.id === M.selected ? 'outline:1px solid var(--accent,#a78bfa);' : ''}${o.available ? '' : 'opacity:.45;'}" ${o.available ? `onclick="_runMenu.selected='${o.id}';_renderRunMenu()"` : 'disabled'}>
      <b>${escapeHtml(o.label)}</b><div style="font-size:10px;opacity:.75;white-space:normal">${escapeHtml(o.available ? o.description : o.reason)}</div></button>`;
  let html = `<div style="display:flex;gap:14px;align-items:flex-start">`;
  html += `<div style="flex:1;min-width:0">` + Object.entries(groups).map(([g, label]) =>
    `<div style="margin:6px 0 2px;opacity:.6;font-size:10px;letter-spacing:.08em">${label.toUpperCase()}</div>` + M.options.filter(o => o.group === g).map(btn).join('')).join('') + `</div>`;
  html += `<div style="width:42%;min-width:220px">`;
  if (sel) {
    html += `<div style="margin-bottom:6px"><b>${escapeHtml(sel.label)}</b></div>`;
    if (sel.needs && sel.needs.includes('file')) html += `<div style="font-size:10px;opacity:.7">file</div><select id="run-menu-file" style="width:100%">${sel.choices.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select>`;
    if (sel.needs && sel.needs.includes('script')) html += `<div style="font-size:10px;opacity:.7">script</div><select id="run-menu-script" style="width:100%">${sel.choices.map(c => `<option value="${escapeHtml(c.name)}" ${c.runnable ? '' : 'disabled'}>${escapeHtml(c.name)} — ${escapeHtml(c.cmd)}${c.runnable ? '' : ' (needs a shell)'}</option>`).join('')}</select>`;
    if (M.nexusSystem) html += `<div style="font-size:10px;opacity:.7;margin-top:6px">run on</div><select id="run-menu-branch" style="width:100%"><option value="">the immutable base (no edits)</option>${(M.branches || []).map(b => `<option value="${escapeHtml(b.id)}" ${M.presetBranch === b.id ? 'selected' : ''}>${escapeHtml(b.label)} · ${escapeHtml(b.id)}</option>`).join('')}</select>`;
    html += `<div style="font-size:10px;opacity:.7;margin-top:6px">time limit (s)</div><input id="run-menu-timeout" type="number" min="5" max="300" value="${sel.id === 'boot.probe' ? 45 : 30}" style="width:80px">`;
    if (!M.nexusSystem) html += `<label style="display:block;font-size:10px;margin-top:6px"><input type="checkbox" id="run-menu-keep"> keep the COS branch afterwards</label>`;
    html += `<div style="margin-top:10px"><button class="modal-btn confirm" onclick="_runMenuGo()">Run</button></div>`;
  }
  html += `</div></div>`;
  // §0.39.264 — the VM option names what is missing; offer to set it up right here.
  // §0.39.265 — James: "have a prompt telling me to set it up, and have it completely in a step by step
  // process." Run asks first (Set it up / Not now); the setup is a numbered walk-through (_vmWizardHtml).
  const vmOpt = M.options.find(o => o.id === 'test.vm' && !o.available && o.setup);
  const vmBox = vmOpt ? `<div id="vm-setup" style="margin-bottom:10px">${_vmWizardHtml()}</div>` : '';
  body.innerHTML = `<div id="run-menu-install">${_installPromptHtml()}</div>${vmBox}<div id="run-menu-result" style="margin-bottom:10px"></div>` + html;
  if (vmOpt) _vmSetupPoll(true);
  if (Object.values(_installState).some(s => s && s.state === 'running')) _installPoll();
}

// ── §0.39.265 — James: "have the run button menu prompt to install when it's not detected in the path."
// The menu names what this repo's options need and this computer lacks (lib/cos-run.js → installer.js
// needsFor) and asks: Install, or Not now. Nothing installs without the click. Linux without password-less
// sudo gets the exact command to run instead of a background prompt for a password.
let _installState = {};
let _installDismissed = false;
let _installTimer = null;
function _installPromptHtml() {
  const M = _runMenu; if (!M || _installDismissed) return '';
  // QEMU is step 1 of the VM walk-through when the VM is not set up — not offered twice
  const vmWalk = M.options.some(o => o.id === 'test.vm' && !o.available && o.setup);
  const needs = (M.installs || []).filter(n => !(vmWalk && n.tool === 'qemu'));
  if (!needs.length) return '';
  const row = (n) => {
    const st = _installState[n.tool];
    const last = st && st.log && st.log.length ? st.log[st.log.length - 1].msg : '';
    const col = st && st.state === 'failed' ? 'var(--bad,#f87171)' : st && st.state === 'done' ? 'var(--ok,#4ade80)' : 'inherit';
    const action = st && st.state === 'running' ? `<span style="opacity:.8">installing… ${escapeHtml(last).slice(0, 120)}</span>`
      : st && st.state === 'done' ? `<span style="color:${col}">installed ✓</span>`
      : n.plan && !n.plan.unattended ? `<code style="font-size:10px">${escapeHtml(n.plan.command)}</code> <button class="action-btn" onclick="navigator.clipboard.writeText(${escapeHtml(JSON.stringify(n.plan.command))});toast('copied')">copy</button> <button class="action-btn" onclick="repoRun()">check again</button>`
      : `<button class="action-btn" onclick="_installStart('${n.tool}')">Install ${escapeHtml(n.label)}</button>`;
    return `<div style="display:flex;gap:10px;align-items:center;margin:4px 0;flex-wrap:wrap"><b style="min-width:70px">${escapeHtml(n.label)}</b><span style="opacity:.75;font-size:11px;flex:1;min-width:180px">${escapeHtml(n.why)}${n.plan && n.plan.note && !(st && st.state === 'running') ? ` — ${escapeHtml(n.plan.note)}` : ''}</span>${action}${st && st.state === 'failed' ? `<span style="color:${col};font-size:10px">${escapeHtml((st.result && st.result.error) || '')}</span>` : ''}</div>`;
  };
  return `<div style="border:1px solid var(--accent,#a78bfa);border-radius:6px;padding:8px 10px;margin-bottom:10px">
    <div style="font-size:10px;opacity:.7;letter-spacing:.08em;margin-bottom:4px">NOT INSTALLED ON THIS COMPUTER — INSTALL NOW?</div>
    ${needs.map(row).join('')}
    <div style="margin-top:6px"><button class="action-btn" onclick="_installDismissed=true;_renderRunMenu()">Not now</button>
    <span style="font-size:10px;opacity:.6">${navigator.platform && /win/i.test(navigator.platform) ? 'uses winget' : 'uses your package manager'}; Nexus finds the tool afterwards without a restart</span></div></div>`;
}
async function _installStart(tool) {
  try { _installState[tool] = await api('/api/cos/install', { method: 'POST', body: JSON.stringify({ tool }) }, 20000); }
  catch (e) { toast(`install did not start: ${e.message}`, 'err'); return; }
  const el = document.getElementById('run-menu-install'); if (el) el.innerHTML = _installPromptHtml();
  _installPoll();
}
async function _installPoll() {
  clearTimeout(_installTimer);
  let r; try { r = await api('/api/cos/install', {}, 15000); } catch (_) { _installTimer = setTimeout(_installPoll, 3000); return; }
  const before = { ..._installState };
  _installState = { ..._installState, ...(r.jobs || {}) };
  const el = document.getElementById('run-menu-install'); if (el) el.innerHTML = _installPromptHtml();
  if (_installState.qemu) _vmWizPaint();
  const running = Object.values(_installState).some(s => s && s.state === 'running');
  if (running) { _installTimer = setTimeout(_installPoll, 2000); return; }
  const finished = Object.keys(_installState).filter(t => before[t] && before[t].state === 'running' && _installState[t].state !== 'running');
  if (finished.length) {
    const ok = finished.filter(t => _installState[t].state === 'done');
    if (ok.length) { toast(`installed: ${ok.join(', ')} — the run menu is refreshed`, 'ok'); repoRun(); }
    else toast(`install did not finish: ${finished.map(t => (_installState[t].result && _installState[t].result.error) || t).join('; ')}`, 'err');
  }
}

// ── §0.39.264 — set up the COS test VM from the run menu ─────────────────
// James: "i need help setting the vm up." POST /api/cos/testenv/setup starts
// cos/testenv/provision.js in the background (QEMU via winget on Windows if you
// tick it; a Debian cloud image made into the base, verified by booting it);
// GET /api/cos/testenv is polled for its progress. The same thing runs from a
// terminal: cos\testenv\setup-vm.bat (Windows) or cos/testenv/setup-vm.sh.
//
// §0.39.265 — James: "the run button in repos. can you have a prompt telling me
// to set it up, and have it completely in a step by step process for me to set
// up cos qemu for vms". When the VM is not set up, Run first ASKS (Set it up
// step by step / Not now — "not now" is remembered on this computer and leaves a
// small link). The walk-through is five numbered steps, each ticked off from
// what the backend actually finds (setup-job.js status().vm / .host), never from
// what was clicked:
//   1 QEMU            found on PATH or in its install folder; else Install (winget/brew/
//                     apt, the installer job) or the exact command + "check again"
//   2 acceleration    kvm / hvf / whpx found, or how to turn it on (optional — TCG works, slower)
//   3 what goes in    Node version + extra runtimes; where the image lives, the download size
//   4 build           download → disk → first boot (installs packages) → verify offline → ready,
//                     each ticked from provision.js's own progress lines
//   5 done            the run menu reloads with "Run all tests in a VM" available
let _vmSetupTimer = null;
const _vmWiz = { open: false, st: null, node: 'lts', extras: ['desktop'] };   // §0.39.293 DK1 — the repo desktop needs it: on by default
const _VM_DISMISS_KEY = 'idearium.vmSetup.notNow';
function _vmNotNow() { try { return localStorage.getItem(_VM_DISMISS_KEY) === '1'; } catch (_) { return false; } }
function _vmSetNotNow(v) { try { v ? localStorage.setItem(_VM_DISMISS_KEY, '1') : localStorage.removeItem(_VM_DISMISS_KEY); } catch (_) {} }
function _vmWizOpen(v) { _vmWiz.open = v; if (v) _vmSetNotNow(false); _vmWizPaint(); }
function _vmWizPaint() { const el = document.getElementById('vm-setup'); if (el) el.innerHTML = _vmWizardHtml(); }
function _vmCopyBtn(cmd) { return `<button class="action-btn" onclick="navigator.clipboard.writeText(${escapeHtml(JSON.stringify(cmd))});toast('copied')">copy</button>`; }

// which build stage provision.js has reached, read from its own log lines
const _VM_STAGES = [
  ['download', 'Download the Debian cloud image (~350 MB)', /downloading|download \d|using the downloaded image/i],
  ['disk',     'Prepare the VM disk',                        /preparing the disk/i],
  ['boot',     'First boot — install Node, Python, git, build tools (3–15 min)', /first boot|^guest:|guest reported/i],
  ['verify',   'Verify: boot it offline and run node through the guest agent', /verifying|verified:/i],
  ['ready',    'Save it as the base image',                  /^ready:/i],
];
function _vmStageReached(log) {
  let n = -1;
  for (const e of log || []) _VM_STAGES.forEach(([, , re], i) => { if (i > n && re.test(e.msg || '')) n = i; });
  return n;
}

function _vmWizardHtml() {
  const st = _vmWiz.st, vm = st && st.vm, host = (st && st.host) || {};
  const running = st && st.state === 'running';
  const box = (inner) => `<div style="border:1px solid var(--accent,#a78bfa);border-radius:6px;padding:10px 12px">${inner}</div>`;
  if (vm && vm.ok && !running) return box(`<div style="color:var(--ok,#4ade80)">✓ The COS test VM is set up — ${escapeHtml(vm.baseImage || '')}</div>
    <div style="margin-top:6px"><button class="modal-btn confirm" onclick="_vmWiz.open=false;repoRun('test')">Reload the run menu</button></div>`);

  // the prompt — before the walk-through is opened
  if (!_vmWiz.open && !running) {
    if (_vmNotNow()) return `<div style="font-size:11px;opacity:.75">The test VM is not set up. <a href="#" onclick="event.preventDefault();_vmWizOpen(true)">Set up the test VM</a></div>`;
    return box(`<div style="font-size:10px;opacity:.7;letter-spacing:.08em;margin-bottom:4px">SET UP THE COS TEST VM?</div>
      <div style="white-space:normal;margin-bottom:8px">"Run all tests in a VM" runs this repo inside a throw-away QEMU virtual machine — its own OS, no network while tests run, nothing touches this computer. It needs a one-time setup (about 10–40 minutes, mostly waiting). Nexus walks you through it step by step.</div>
      <button class="modal-btn confirm" onclick="_vmWizOpen(true)">Set it up — step by step</button>
      <button class="action-btn" onclick="_vmSetNotNow(true);_vmWizPaint()">Not now</button>
      <span style="font-size:10px;opacity:.6"> everything else in the run menu works without it</span>`);
  }

  if (!st) return box('<div style="opacity:.6">checking this computer…</div>');
  const qemuOk = !!(vm && vm.qemu);
  const accel = host.accel || null;
  const accelOk = accel && accel.accel && accel.accel !== 'tcg';
  const qi = _installState.qemu;
  const reached = _vmStageReached(st.log);
  const done = st.state === 'done' && vm && vm.ok;
  const failed = st.state === 'failed';
  const mark = (state) => state === 'ok' ? '<span style="color:var(--ok,#4ade80)">✓</span>' : state === 'now' ? '<span style="color:var(--accent,#a78bfa)">●</span>' : state === 'bad' ? '<span style="color:var(--bad,#f87171)">✗</span>' : state === 'opt' ? '<span style="opacity:.6">◇</span>' : '<span style="opacity:.4">○</span>';
  const step = (n, state, title, inner) => `<div style="display:flex;gap:10px;margin:8px 0;${state === 'todo' ? 'opacity:.55' : ''}"><div style="width:22px;text-align:center;font-weight:bold">${mark(state)}</div>
    <div style="flex:1;min-width:0;white-space:normal"><div><b>Step ${n} · ${escapeHtml(title)}</b></div>${inner ? `<div style="font-size:11px;margin-top:3px">${inner}</div>` : ''}</div></div>`;
  let h = `<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:10px;opacity:.7;letter-spacing:.08em">SET UP THE COS TEST VM (QEMU) — STEP BY STEP</div>
    ${running ? '' : `<button class="action-btn" onclick="_vmWizOpen(false)">close</button>`}</div>`;

  // 1 — QEMU
  let s1;
  if (qemuOk) s1 = `found: <code>${escapeHtml(vm.qemu.system)}</code>`;
  else if (qi && qi.state === 'running') s1 = `installing QEMU… ${escapeHtml(((qi.log || []).slice(-1)[0] || {}).msg || '').slice(0, 140)}`;
  else {
    const p = host.qemuPlan;
    s1 = `QEMU is the program that runs the virtual machine. It is not on this computer yet.<br>`;
    if (p && p.unattended) s1 += `<button class="action-btn" onclick="_installStart('qemu')">Install QEMU now</button> <span style="opacity:.7">runs <code>${escapeHtml(p.command)}</code></span>`;
    else if (p) s1 += `Run this in a terminal${host.platform === 'win32' ? ' (PowerShell)' : ''}: <code>${escapeHtml(p.command)}</code> ${_vmCopyBtn(p.command)}${p.note ? `<div style="opacity:.7">${escapeHtml(p.note)}</div>` : ''}`;
    else if (host.installHint) s1 += `Install it: <code>${escapeHtml(host.installHint)}</code> ${_vmCopyBtn(host.installHint.split('   ')[0])}`;
    s1 += `<div style="opacity:.7;margin-top:3px">Or download it from <a href="https://www.qemu.org/download/" target="_blank" rel="noopener">qemu.org/download</a>${host.platform === 'win32' ? ' (Windows installer: qemu.weilnetz.de/w64) — install to C:\\Program Files\\qemu, where Nexus looks' : ''}.
      Then <button class="action-btn" onclick="_vmSetupPoll(true)">check again</button></div>`;
    if (qi && qi.state === 'failed') s1 += `<div style="color:var(--bad,#f87171)">the install did not finish: ${escapeHtml((qi.result && qi.result.error) || '')}</div>`;
  }
  h += step(1, qemuOk ? 'ok' : (qi && qi.state === 'failed') ? 'bad' : 'now', 'Install QEMU', s1);

  // 2 — acceleration (optional)
  let s2;
  if (accelOk) s2 = `${escapeHtml(accel.accel.toUpperCase())} — ${escapeHtml(accel.reason)}.${accel.accel === 'whpx' ? ` If the build says WHPX did not start, turn on <b>Windows Hypervisor Platform</b>: <code>dism /online /enable-feature /featurename:HypervisorPlatform /all</code> ${_vmCopyBtn('dism /online /enable-feature /featurename:HypervisorPlatform /all')} in an administrator PowerShell, then restart. Also check virtualisation (VT-x / AMD-V) is on in the BIOS.` : ''}`;
  else if (host.platform === 'linux') s2 = `No hardware acceleration (${escapeHtml((accel && accel.reason) || 'unknown')}). The VM still works with software emulation, just several times slower. To speed it up: <code>sudo modprobe kvm_intel || sudo modprobe kvm_amd; sudo usermod -aG kvm $USER</code> ${_vmCopyBtn('sudo modprobe kvm_intel || sudo modprobe kvm_amd; sudo usermod -aG kvm $USER')} then log out and back in.`;
  else s2 = `Software emulation only — it works, just slower.`;
  h += step(2, accelOk ? 'ok' : 'opt', 'Hardware acceleration (optional — faster VMs)', s2);

  // 3 — what goes into the image
  const s3 = running || done ? `Node ${escapeHtml(_vmWiz.node)}${_vmWiz.extras.length ? ' + ' + escapeHtml(_vmWiz.extras.join(', ')) : ''}, Python 3, git, build tools`
    : `Always included: Python 3, git, build tools, the QEMU guest agent. Node version:
      <select onchange="_vmWiz.node=this.value">${['lts', '22', '20'].map(v => `<option value="${v}" ${_vmWiz.node === v ? 'selected' : ''}>${v === 'lts' ? 'latest LTS' : 'Node ' + v}</option>`).join('')}</select>
      <div style="margin-top:3px"><label><input type="checkbox" class="vm-setup-extra" value="desktop" ${_vmWiz.extras.includes('desktop') ? 'checked' : ''} onchange="_vmWiz.extras=[...document.querySelectorAll('.vm-setup-extra:checked')].map(e=>e.value)"> <b>desktop</b> — xfce, a browser and an editor; the repo's <b>Desktop</b> button needs it (login from Settings → Desktop, default nexus / nexus)</label></div>
      <div style="margin-top:3px">Extra languages for repos that need them: ${['go', 'ruby', 'php', 'rust'].map(x => `<label style="margin-right:8px"><input type="checkbox" class="vm-setup-extra" value="${x}" ${_vmWiz.extras.includes(x) ? 'checked' : ''} onchange="_vmWiz.extras=[...document.querySelectorAll('.vm-setup-extra:checked')].map(e=>e.value)"> ${x}</label>`).join('')}</div>
      <div style="opacity:.7;margin-top:3px">Needs ~350 MB download and ~3 GB of disk${host.home ? ` in <code>${escapeHtml(host.home)}</code>` : ''}. You can run the setup again later to add languages.</div>`;
  h += step(3, running || done ? 'ok' : qemuOk ? 'now' : 'todo', 'Choose what goes in the VM', s3);

  // 4 — build
  let s4 = _VM_STAGES.map(([, label], i) => {
    const stt = done || i < reached ? 'ok' : (running && i === Math.max(reached, 0)) ? 'now' : (failed && i === Math.max(reached, 0)) ? 'bad' : 'todo';
    return `<div style="margin:2px 0;${stt === 'todo' ? 'opacity:.55' : ''}">${mark(stt)} ${escapeHtml(label)}</div>`;
  }).join('');
  if (!running && !done) s4 += qemuOk
    ? `<div style="margin-top:6px"><button class="modal-btn confirm" onclick="_vmSetupStart()">${failed ? 'Try again' : 'Set up the test VM'}</button> <span style="opacity:.7">you can keep using Nexus while it runs</span></div>`
    : `<div style="opacity:.7;margin-top:4px">finish step 1 first</div>`;
  if (failed) s4 += `<div style="color:var(--bad,#f87171);margin-top:4px">${escapeHtml((st.result && st.result.error) || 'the setup failed')} — the log below says where; "Try again" re-uses the downloaded image.</div>`;
  const last = (st.log || []).slice(-12).map(e => escapeHtml(e.msg || '')).join('\n');
  if (last && (running || failed)) s4 += `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;font-size:10px;opacity:.85;margin:6px 0 0">${last}</pre>`;
  if (!running && !done) s4 += `<div style="opacity:.6;margin-top:4px">Same thing from a terminal: <code>${escapeHtml((vm && vm.setup) || 'node cos/testenv/provision.js')}</code></div>`;
  h += step(4, done ? 'ok' : failed ? 'bad' : running ? 'now' : 'todo', 'Build the VM image', s4);

  // 5 — done
  h += step(5, done ? 'ok' : 'todo', 'Run tests in the VM', done
    ? `Ready. <button class="modal-btn confirm" onclick="_vmWiz.open=false;repoRun('test')">Open the run menu</button> — pick "Run all tests in a VM".`
    : `The run menu will offer "Run all tests in a VM".`);
  return box(h);
}
async function _vmSetupPoll(once) {
  clearTimeout(_vmSetupTimer);
  const el = document.getElementById('vm-setup'); if (!el) return;
  let st; try { st = await api('/api/cos/testenv', {}, 20000); } catch (e) { el.innerHTML = `<div style="color:var(--bad,#f87171)">${escapeHtml(e.message)}</div>`; return; }
  const was = _vmWiz.st && _vmWiz.st.state;
  _vmWiz.st = st;
  if (st.state === 'running') _vmWiz.open = true;
  el.innerHTML = _vmWizardHtml();
  const qemuInstalling = _installState.qemu && _installState.qemu.state === 'running';
  if (st.state === 'running' || qemuInstalling) _vmSetupTimer = setTimeout(() => _vmSetupPoll(), 2000);
  else if (was === 'running' && st.state === 'done') toast('the test VM is ready', 'ok');
}
async function _vmSetupStart() {
  if (document.querySelector('.vm-setup-extra')) _vmWiz.extras = [...document.querySelectorAll('.vm-setup-extra:checked')].map(x => x.value);
  try { await api('/api/cos/testenv/setup', { method: 'POST', body: JSON.stringify({ installQemu: false, extras: _vmWiz.extras, node: _vmWiz.node }) }, 20000); }
  catch (e) { toast(`VM setup did not start: ${e.message}`, 'err'); return; }
  _vmWiz.open = true;
  _vmSetupPoll();
}

async function _runMenuGo(from = 0) {
  const M = _runMenu; if (!M) return;
  const out = document.getElementById('run-menu-result');
  const val = (id) => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value) : null; };
  const payload = { option: M.selected, file: val('run-menu-file') || undefined, script: val('run-menu-script') || undefined,
    branch: (M.presetBranch = val('run-menu-branch') || '') || undefined, keepBranch: !!val('run-menu-keep'), timeoutMs: (parseInt(val('run-menu-timeout'), 10) || 30) * 1000,
    from: typeof from === 'number' && from > 0 ? from : undefined };   // §0.39.271 T2 — continue a test.all the time budget cut short
  out.innerHTML = '<div style="opacity:.6">running in COS…</div>';
  out.scrollIntoView({ block: 'nearest' });
  let r;
  try { r = await api(`/api/repos/${M.repo.uuid}/run`, { method: 'POST', body: JSON.stringify(payload) }, 330000); }
  catch (e) { out.innerHTML = `<div style="color:var(--bad,#f87171)">${escapeHtml(e.message)}</div>`; return; }
  const col = (ok) => ok ? 'var(--ok,#4ade80)' : 'var(--bad,#f87171)';
  out.innerHTML = `<div style="margin-bottom:6px;opacity:.8">${escapeHtml(r.label || r.option)} · ${escapeHtml(r.where || '')} · ${r.durationMs}ms · <b style="color:${col(r.allPassed)}">${r.passed} passed, ${r.failed} failed</b></div>` +
    (r.report && r.report.tests ? `<div style="font-size:10px;opacity:.8;margin-bottom:6px">${r.report.tests.ran} of ${r.report.tests.total} test file(s) ran (from #${r.report.tests.from + 1}, ${r.report.tests.concurrency} at a time)${r.report.tests.notRun ? ` · <b style="color:var(--amber,#fbbf24)">${r.report.tests.notRun} not reached in ${Math.round(r.report.tests.budgetMs / 1000)} s</b> <button class="action-btn" onclick="_runMenuGo(${r.report.tests.next})">run the next ${r.report.tests.notRun}</button>` : ''}</div>` : '') +
    (r.report && r.report.suite ? `<div style="font-size:10px;opacity:.8;margin-bottom:6px">suite: ${escapeHtml(r.report.suite.steps.join(' · '))}${r.report.suite.refusals.length ? ` · not run here: ${escapeHtml(r.report.suite.refusals.join('; '))}` : ''}</div>` : '') +
    (r.report && r.report.vm ? `<div style="font-size:10px;opacity:.75;margin-bottom:6px">VM · accelerator ${escapeHtml(String(r.report.vm.accel))} · network ${escapeHtml(String(r.report.vm.network))}${r.report.vm.network === 'install' ? ` (cut after install — offline ${r.report.vm.offlineVerified ? 'verified' : 'NOT verified'})` : ''} · repo in by ${escapeHtml(String(r.report.vm.share))}</div>` : '') +
    (r.report && r.report.packages ? `<pre style="white-space:pre-wrap;max-height:200px;overflow:auto;margin:0 0 8px">${escapeHtml(r.report.packages.map(p => `${p.via.padEnd(8)} ${p.name}  (${p.usedBy} file${p.usedBy === 1 ? '' : 's'})`).join('\n'))}${r.report.brokenRelative.length ? '\n\nbroken relative imports:\n' + escapeHtml(r.report.brokenRelative.map(b => `${b.file} → ${b.specifier}`).join('\n')) : ''}</pre>` : '') +
    r.runs.map(x => `<div style="margin:8px 0 3px"><span style="color:${col(x.passed)}">${x.passed ? '✓' : '✗'}</span> ${escapeHtml(x.file)} <span style="opacity:.6">${x.exitCode === undefined ? '' : `exit ${x.exitCode === null ? '—' : x.exitCode}`}${x.durationMs ? ` · ${x.durationMs}ms` : ''}${x.killedByTimeout ? ' · TIMED OUT' : ''}${x.killedByOutputLimit ? ' · OUTPUT LIMIT' : ''}${x.external ? ` · external ${escapeHtml(x.runtime)}` : ''}</span></div>` +
      (x.health ? `<div style="font-size:10px;opacity:.85">health: ${x.health.ok ? `<span style="color:${col(true)}">${x.health.status} on :${x.health.port.actual} (asked :${x.health.port.requested}) after ${x.health.afterMs}ms</span>` : `<span style="color:${col(false)}">${escapeHtml(x.health.error || String(x.health.status))}</span>`}</div>` : '') +
      ((x.portMap || []).length ? `<div style="font-size:10px;opacity:.6">ports: ${x.portMap.map(p => `:${p.requested}→:${p.actual}`).join(' ')}</div>` : '') +
      ((x.refused || []).length ? `<div style="font-size:10px;opacity:.6">network isolation refused: ${escapeHtml(x.refused.slice(0, 8).join(', '))}${x.refused.length > 8 ? ' …' : ''}</div>` : '') +
      (x.error ? `<div style="color:${col(false)}">${escapeHtml(x.error)}</div>` : '') +
      (x.debug ? debugReportHtml(x.debug, x.file) : '') +
      (x.stdout ? `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;opacity:.8;margin:0">${escapeHtml(x.stdout.slice(-4000))}</pre>` : '') +
      (x.stderr ? `<pre style="white-space:pre-wrap;max-height:160px;overflow:auto;color:${col(false)};margin:0">${escapeHtml(x.stderr.slice(-4000))}</pre>` : '')).join('');
}

// Diagnose — two real reads, rendered exactly as returned. A repo that has
// never been through the import pipeline gets a real 404 from
// /verification with the server's own message naming reindex as the fix;
// that is surfaced verbatim rather than rewritten into something vaguer.
let _diagnoseRepoUuid = null;
async function repoDiagnose() {
  const repo = _requireCurrentRepo('diagnose');
  if (!repo) return;
  _diagnoseRepoUuid = repo.uuid;
  document.getElementById('repo-diagnose-title').textContent = `Diagnose — ${repo.name || repo.uuid}`;
  const body = document.getElementById('repo-diagnose-body');
  document.getElementById('repo-diagnose-reindex').style.display = '';
  body.innerHTML = '<div style="opacity:.6">reading verification + scan…</div>';
  document.getElementById('repo-diagnose-modal').classList.add('open');

  const [ver, scan] = await Promise.all([
    api(`/api/repos/${repo.uuid}/verification`).catch(e => ({ __error: e.message })),
    api(`/api/repos/${repo.uuid}/scan`).catch(e => ({ __error: e.message })),
  ]);

  let html = '';

  html += '<div style="margin-bottom:6px;opacity:.7">VERIFICATION (import pipeline L0–L8)</div>';
  if (ver.__error) {
    html += `<div style="color:var(--bad);margin-bottom:14px">${escapeHtml(ver.__error)}</div>`;
  } else if (Array.isArray(ver.tiers) && ver.tiers.length) {
    html += `<div style="margin-bottom:6px">status: <b>${escapeHtml(String(ver.status || 'unknown'))}</b>`
         +  (ver.level ? ` · first failing tier: <b>${escapeHtml(String(ver.level))}</b>` : '') + '</div>';
    for (const t of ver.tiers) {
      const mark = t.passed ? '✓' : '✗';
      const col  = t.passed ? 'var(--ok, #4ade80)' : 'var(--bad, #f87171)';
      html += `<div><span style="color:${col}">${mark}</span> ${escapeHtml(String(t.level || '?'))} — ${escapeHtml(String(t.name || ''))}`;
      const fails = Array.isArray(t.failures) ? t.failures : [];
      if (fails.length) html += ` <span style="opacity:.7">(${fails.length} failure${fails.length === 1 ? '' : 's'})</span>`;
      html += '</div>';
      for (const f of fails.slice(0, 5)) {
        html += `<div style="padding-left:18px;opacity:.7">· ${escapeHtml(typeof f === 'string' ? f : JSON.stringify(f))}</div>`;
      }
      if (fails.length > 5) html += `<div style="padding-left:18px;opacity:.5">· …${fails.length - 5} more</div>`;
    }
    html += '<div style="height:14px"></div>';
  } else {
    html += '<div style="opacity:.6;margin-bottom:14px">no tiers reported</div>';
  }

  html += '<div style="margin-bottom:6px;opacity:.7">SCAN</div>';
  if (scan.__error) {
    html += `<div style="color:var(--bad)">${escapeHtml(scan.__error)}</div>`;
  } else {
    // scan.js's shape varies by what it finds; render its real keys rather
    // than assuming a fixed set and silently dropping the rest.
    const skip = new Set(['ok', 'repoUuid', 'repoName']);
    const keys = Object.keys(scan).filter(k => !skip.has(k));
    if (!keys.length) html += '<div style="opacity:.6">scan returned nothing</div>';
    for (const k of keys) {
      const v = scan[k];
      const rendered = Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}`
                     : (v && typeof v === 'object') ? JSON.stringify(v).slice(0, 200)
                     : String(v);
      html += `<div>${escapeHtml(k)}: <span style="opacity:.75">${escapeHtml(rendered)}</span></div>`;
      if (Array.isArray(v)) {
        for (const item of v.slice(0, 5)) {
          html += `<div style="padding-left:18px;opacity:.7">· ${escapeHtml(typeof item === 'string' ? item : JSON.stringify(item).slice(0, 160))}</div>`;
        }
        if (v.length > 5) html += `<div style="padding-left:18px;opacity:.5">· …${v.length - 5} more</div>`;
      }
    }
  }

  body.innerHTML = html;
}

function closeRepoDiagnose() {
  document.getElementById('repo-diagnose-modal').classList.remove('open');
}

// POST /api/repos/:uuid/reindex — the real re-run of runImportPipeline().
// This is what produces atlas.json/chunks/indexes/verification.json, so it
// is also the fix for the "not verified yet" 404 above.
async function repoDiagnoseReindex() {
  if (!_diagnoseRepoUuid) return;
  const btn = document.getElementById('repo-diagnose-reindex');
  btn.disabled = true; btn.textContent = 're-running…';
  try {
    await api(`/api/repos/${_diagnoseRepoUuid}/reindex`, { method: 'POST' }, 120000);
    toast('pipeline re-run complete', 'ok');
    await repoDiagnose();
  } catch (e) {
    toast(`reindex failed: ${e.message}`, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 're-run pipeline';
  }
}

// ════════════════════════════════════════════════════
// §REPO-AGENT 2026-09-20 — this compartment's own agent.
// James: "an agent tab for the agent cli for the agent with the repo hat,
// learns as it works, updating the .hat and .agent as models... each repo
// compartment in idearium."
//
// Backed by lib/repo-agent.js through /api/repos/:uuid/agent*. The CLI does
// NOT switch the host's global agent — the hat's persona is composed into
// the prompt server-side. The persona is shown in full here on purpose: a
// persona the person cannot read is one they cannot correct, and correcting
// it is half of how this agent learns.
// ════════════════════════════════════════════════════
const AGENT_TRANSCRIPT = new Map(); // repoUuid -> [{ role, text, meta }]

// ── §FEED 0.39.244 — the Agent tab's live feed ───────────────────────────
// James: "the cli in the agents tab needs to have a live feed of the dom mutation/node
// anchor." Source: the provider tab's userscript (its MutationObserver, the node its
// findResponseEl() reads) → guardian (/events, guardian.job.* with agentId) → idearium
// (lib/guardian-stream.cjs → os.broadcast) → here. Kept per compartment, in memory;
// painted into #agent-feed in place, never by re-rendering the whole tab.
const AGENT_FEED = new Map();   // repoUuid -> { rows: [], anchor, mutations, generating, jobId, provider, text, textLen, updated }
const AGENT_FEED_MAX = 120;
function _agentFeedState(uuid) {
  if (!AGENT_FEED.has(uuid)) AGENT_FEED.set(uuid, { rows: [], anchor: null, mutations: null, generating: null, jobId: null, provider: null, text: '', textLen: 0, updated: 0 });
  return AGENT_FEED.get(uuid);
}
function _agentFeedIn(p) {
  if (!p || !p.repoUuid) return;
  const st = _agentFeedState(p.repoUuid);
  if (p.jobId && p.jobId !== st.jobId) { st.jobId = p.jobId; st.text = ''; st.textLen = 0; st.anchor = null; st.mutations = null; st.gate = null; }
  if (p.provider) st.provider = p.provider;
  if (p.anchor) st.anchor = p.anchor;
  if (p.mutations != null) st.mutations = p.mutations;
  if (p.generating != null) st.generating = p.generating;
  // 0.39.256 — reset: the tab re-read the reply and it is not a continuation of what was shown; replace it
  // 0.39.261 — James saw the reply three times over: a tab can stream one job from two readers (the
  // transcript streamer, then the reply watch, which restarted from 0 and sent the whole reply as a
  // "delta"). A chunk that IS the whole reply (its length is fullLen), or that restates what is shown
  // and continues it, replaces; a chunk the shown text already ends with is a repeat and is dropped.
  if (p.event === 'chunk' && typeof p.text === 'string') {
    const t = p.text;
    if (p.reset || (p.fullLen && t.length === p.fullLen) || (st.text && t.startsWith(st.text))) st.text = t;
    else if (st.text && st.text.endsWith(t)) { /* repeat of the tail — already shown */ }
    else st.text = st.text + t;
    if (p.fullLen && st.text.length > p.fullLen) st.text = st.text.slice(-p.fullLen);   // never show more than the reply is
    st.textLen = p.fullLen || st.text.length;
  }
  st.updated = Date.now();
  // 0.39.256 — guardian.job.gate (guardian/lib/gate-trail.js): the gate this job is at, and why it stopped there.
  if (p.event === 'gate') st.gate = { label: p.label, state: p.state, detail: p.detail, fix: p.fix };
  const ev = p.event === 'gate' ? `gate ${p.label || p.gate} · ${p.state}` : p.stage ? `${p.event}:${p.stage}` : p.event;
  const detail = p.event === 'gate'
    ? [p.detail, p.state !== 'passed' && p.fix ? `→ ${p.fix}` : null].filter(Boolean).join(' ')
    : [p.gate ? `gate ${p.gate}` : null, p.how, p.reason, p.error, p.transport, p.event === 'chunk' ? `+${(p.text || '').length}ch → ${p.fullLen || st.text.length}ch${p.source === 'transcript' ? ' (transcript)' : ''}` : null,
      p.event === 'complete' && p.chars ? `${p.chars}ch` : null].filter(Boolean).join(' · ');
  // A 'dom' pulse updates the live header; it is not worth a log row each second. Streamed chunks every 500 ms
  // show in the live text below, not as a row each.
  if (!(p.event === 'progress' && p.stage === 'dom') && !(p.event === 'chunk' && p.source === 'transcript')) {
    st.rows.push({ ts: p.guardianTs || Date.now(), ev, detail, bad: p.event === 'error' || p.event === 'timeout' || (p.event === 'gate' && p.state === 'failed') });
    if (st.rows.length > AGENT_FEED_MAX) st.rows.splice(0, st.rows.length - AGENT_FEED_MAX);
  }
  if (CURRENT_API_REPO && CURRENT_API_REPO.uuid === p.repoUuid) _agentFeedPaint(p.repoUuid);
}
function _agentFeedHtml(uuid) {
  const st = _agentFeedState(uuid);
  const a = st.anchor;
  const attrs = a && a.attrs ? Object.entries(a.attrs).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  const head = st.jobId
    ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span style="color:${st.generating ? 'var(--accent,#7dd3fc)' : 'inherit'}">${st.generating ? '● generating' : '○ idle'}</span>` +
      `<span>job ${escapeHtml(String(st.jobId).slice(0, 8))}</span>${st.provider ? `<span>${escapeHtml(st.provider)}</span>` : ''}` +
      `<span>mutations ${st.mutations == null ? '—' : st.mutations}</span><span>reply ${st.textLen}ch</span>` +
      (st.gate ? `<span style="color:${st.gate.state === 'failed' ? 'var(--bad,#f87171)' : st.gate.state === 'passed' ? 'var(--ok,#4ade80)' : 'inherit'}">gate ${escapeHtml(st.gate.label || '')} · ${escapeHtml(st.gate.state || '')}</span>` : '') + `</div>` +
      `<div style="margin-top:3px"><span style="opacity:.55">anchor</span> ${a ? `<span title="${escapeHtml(attrs)}">${escapeHtml(a.path || a.tag)}</span> <span style="opacity:.55">${escapeHtml(attrs)} · ${a.children} children · ${a.textLen}ch</span>` : '<span style="opacity:.55">no reply node yet</span>'}</div>`
    : '<div style="opacity:.5">no job for this agent since this page opened — send a message to watch its tab</div>';
  const rows = st.rows.slice(-40).map(r => `<div style="${r.bad ? 'color:var(--bad,#f87171)' : ''}"><span style="opacity:.45">${new Date(r.ts).toLocaleTimeString('en-GB', { hour12: false })}</span> ${escapeHtml(r.ev)}${r.detail ? ` <span style="opacity:.6">${escapeHtml(r.detail)}</span>` : ''}</div>`).join('');
  const live = st.text ? `<div style="margin-top:6px;white-space:pre-wrap;max-height:120px;overflow-y:auto;border-left:2px solid var(--accent,#7dd3fc);padding-left:8px;opacity:.85">${escapeHtml(st.text.slice(-4000))}</div>` : '';
  return head + (rows ? `<div style="margin-top:6px;max-height:140px;overflow-y:auto" data-feed-rows>${rows}</div>` : '') + live;
}
function _agentFeedSummary(uuid) {
  const st = _agentFeedState(uuid);
  if (!st.jobId) return '· idle';
  return `· ${st.generating ? '● generating' : '○ idle'} · job ${String(st.jobId).slice(0, 8)}${st.gate ? ` · gate ${st.gate.label || ''} ${st.gate.state || ''}` : ''}${st.textLen ? ` · ${st.textLen}ch` : ''}`;
}
function _agentFeedPaint(uuid) {
  const el = document.getElementById('agent-feed');
  if (!el || el.dataset.repo !== uuid) return;
  const sum = document.getElementById('agent-feed-summary'); if (sum) sum.textContent = _agentFeedSummary(uuid);
  const panel = document.getElementById('agent-feed-panel');
  if (panel && panel.open === false) return;   // collapsed: the summary line is all that shows — no repaint of the body
  el.innerHTML = _agentFeedHtml(uuid);
  const rows = el.querySelector('[data-feed-rows]'); if (rows) rows.scrollTop = rows.scrollHeight;
}

function _agentTranscript(uuid) {
  if (!AGENT_TRANSCRIPT.has(uuid)) AGENT_TRANSCRIPT.set(uuid, []);
  return AGENT_TRANSCRIPT.get(uuid);
}

async function renderRepoAgent(repo) {
  const el = document.getElementById('repo-subtab-agent');
  if (!el || !repo) return;
  el.innerHTML = '<div class="detail-empty">loading agent…</div>';

  try { AGENT_SETTINGS.set(repo.uuid, await api(`/api/repos/${repo.uuid}/agent/settings`)); }
  catch (_) { AGENT_SETTINGS.delete(repo.uuid); /* the backend control says it did not load — never shows a guessed position */ }
  let st;
  try { st = await api(`/api/repos/${repo.uuid}/agent`); }
  catch (e) { el.innerHTML = `<div class="detail-empty">agent unavailable: ${escapeHtml(e.message)}</div>`; return; }

  // No compartment means no agent, and repo-hat refuses to forge one —
  // surface that reason verbatim rather than an empty tab.
  if (!st.compartmentId) {
    el.innerHTML = `<div class="detail-empty">this repo has no compartment.<br><br>` +
      `a project agent is constrained BY its compartment — one scoped to nothing would be a host-wide agent wearing this project's name.<br><br>` +
      `import through the project-import flow (which creates a real COS compartment) or attach one first.</div>`;
    return;
  }

  const mem = st.memory || { total: 0, byKind: {} };
  const idx = st.index || {};
  const kindCounts = Object.entries(mem.byKind || {}).map(([k, n]) => `${k} ${n}`).join(' · ');

  const head = `
    <div class="ds">
      <div class="ds-label">compartment agent</div>
      <div class="ds-mono">${st.exists ? escapeHtml(st.hat.name) : '(no hat forged yet)'}
compartment ${escapeHtml(st.compartmentId)}
session    ${escapeHtml(st.sessionId)}
indexed    ${idx.indexed ? `${idx.fileCount ?? '?'} files · ${idx.chunkCount ?? '?'} chunks` : 'NOT indexed — run the pipeline from Diagnose'}
learned    ${mem.total} observation${mem.total === 1 ? '' : 's'}${kindCounts ? ` (${kindCounts})` : ''}
exchanges  ${st.exchanges || 0}</div>
    </div>
    ${_sharedAgentNote(st)}
    <div style="margin:6px 0;font-size:10px;opacity:.6">hat, teaching, export/import and inject mode live in <span style="cursor:pointer;text-decoration:underline" onclick="setRepoSubtab('settings')">Settings → Agents</span>${st.exists ? '' : ' — no hat forged yet'}</div>
`;

  const memHtml = '';

  const lines = _agentTranscript(repo.uuid);
  const transcript = lines.length
    ? lines.map(l => `<div style="margin-bottom:10px"><div style="opacity:.55;font-size:9px">${escapeHtml(l.role)}${l.meta ? ` · ${escapeHtml(l.meta)}` : ''}</div><div style="white-space:pre-wrap">${escapeHtml(l.text)}</div>${l.detail || ''}</div>`).join('')
    : `<div style="opacity:.5">no exchanges in this session yet</div>`;

  const injHtml = '';

  // 0.39.261 — James: the job feed "stays out of the cli window, and it's collapsable". The provider
  // tab's live trail (gates, chunks, anchor) is diagnostic; the CLI below is the conversation. The
  // panel is a <details>, collapsed by default, remembered per viewer; its summary line keeps the
  // one thing worth seeing at a glance (generating / idle, last gate).
  let feedOpen = false;
  try { feedOpen = localStorage.getItem('idearium.agentFeedOpen') === '1'; } catch (_) {}
  el.innerHTML = head + memHtml + injHtml + `
    <details class="ds" id="agent-feed-panel" ${feedOpen ? 'open' : ''} ontoggle="try{localStorage.setItem('idearium.agentFeedOpen', this.open ? '1' : '0')}catch(_){} if (this.open) _agentFeedPaint('${escapeHtml(repo.uuid)}')">
      <summary class="ds-label" style="cursor:pointer">live · provider tab <span id="agent-feed-summary" style="opacity:.7;text-transform:none;letter-spacing:0">${escapeHtml(_agentFeedSummary(repo.uuid))}</span></summary>
      <div id="agent-feed" data-repo="${escapeHtml(repo.uuid)}" style="font-size:10px;font-family:var(--mono,monospace);padding:4px 0">${_agentFeedHtml(repo.uuid)}</div>
    </details>
    <div class="ds"><div class="ds-label">cli</div>
      ${AGENT_SETTINGS.get(repo.uuid)
        ? _agentBackendHtml(AGENT_SETTINGS.get(repo.uuid), _agentBackendOf(AGENT_SETTINGS.get(repo.uuid)) === 'ollama' ? await _ollamaModelList() : null)
        : '<span class="ag-note ag-warn">backend unknown — this compartment\'s agent settings did not load</span>'}
      <div id="agent-transcript" style="font-size:10px;max-height:320px;overflow-y:auto;padding:4px 0">${transcript}</div>
      <textarea id="agent-input" class="field-textarea" rows="3" spellcheck="false" placeholder="ask this project's agent…   (/help for commands · ↑↓ history)"></textarea>
      <div style="margin-top:6px">
        <button class="tb-btn" onclick="agentSend()">send</button>
        <span style="margin-left:10px;opacity:.5;font-size:9px">/help for commands · /tools for what it can do · /debug when something is wrong</span>
      </div>
    </div>`;

  const ta = document.getElementById('agent-input');
  if (ta) ta.addEventListener('keydown', e => {
    // Enter sends, Shift+Enter newlines — same convention as the idea composer.
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); return; }
    // ↑/↓ recall this compartment's previous inputs, only when the caret is on
    // the first/last line so multi-line editing still moves normally.
    const hist = _agentInputHistory(repo.uuid);
    if (e.key === 'ArrowUp' && ta.selectionStart === 0 && hist.length) {
      e.preventDefault(); const i = Math.max(0, (AGENT_HIST_POS.get(repo.uuid) ?? hist.length) - 1);
      AGENT_HIST_POS.set(repo.uuid, i); ta.value = hist[i];
    } else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length && AGENT_HIST_POS.has(repo.uuid)) {
      e.preventDefault(); const i = AGENT_HIST_POS.get(repo.uuid) + 1;
      if (i >= hist.length) { AGENT_HIST_POS.delete(repo.uuid); ta.value = ''; } else { AGENT_HIST_POS.set(repo.uuid, i); ta.value = hist[i]; }
    }
  });
  const tr = document.getElementById('agent-transcript');
  if (tr) tr.scrollTop = tr.scrollHeight;
}

function toggleAgentPersona() {
  const p = document.getElementById('agent-persona');
  if (p) p.style.display = p.style.display === 'none' ? '' : 'none';
}

async function agentForgeHat() {
  if (!CURRENT_API_REPO) return;
  try {
    const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/hat`, { method: 'POST', body: JSON.stringify({}) });
    toast(r.created ? `agent forged: ${r.hat.name}` : `agent already existed: ${r.hat.name}`, 'ok');
    renderRepoAgent(CURRENT_API_REPO);
  } catch (e) { toast(`forge failed: ${e.message}`, 'err'); }
}

// 0.39.257 — override { message, shown }: send `message` to the agent while the transcript shows `shown`
// (/debug <question> sends an investigation directive; you see what you typed).
async function agentSend(override = null) {
  if (!CURRENT_API_REPO) return;
  const ta = document.getElementById('agent-input');
  const message = (override && override.message ? override.message : (ta?.value || '')).trim();
  if (!message) return;
  const uuid = CURRENT_API_REPO.uuid;
  const lines = _agentTranscript(uuid);
  if (!override) { _agentInputHistory(uuid).push(message); AGENT_HIST_POS.delete(uuid); }
  if (!override && message.startsWith('/')) { ta.value = ''; return agentCommand(message); }
  if (!override && ARCHIVE_IMPORT_INTENT.test(message)) {   // §0.39.283 N30 — a command in plain words
    ta.value = '';
    lines.push({ role: 'you', text: message });
    _cli(uuid, openArchiveImport() ? 'opened the archive import — drop your NEXUS zips (or a folder) there; it shows the order first, then imports' : 'could not open the archive import window', 'import-archives');
    renderRepoAgent(CURRENT_API_REPO);
    return;
  }

  if (!override) lines.push({ role: 'you', text: message });
  const line = { role: 'agent', text: 'thinking…', meta: null };
  lines.push(line);
  if (!override && ta) ta.value = '';
  renderRepoAgent(CURRENT_API_REPO);

  // §LATE 0.39.241 — the reply can land in Clear Glass's Responses index
  // before (or after) copilot's wait ends. A read-only poll runs alongside the
  // dispatch; whichever answer is real first is shown. See _agentLateWatch.
  const started = Date.now() - 1000;   // 1s of slack: the server stamps its own clock
  const noContext = AGENT_NO_CONTEXT.has(uuid);
  const watch = _agentLateWatch(uuid, message, started, line);

  let r;
  // 120s: a real dispatch through copilot's cascade routinely outlives
  // api()'s 6s default — the same too-short-timeout bug already fixed once
  // in ui/lib/api.js (0.39.118), not repeated here.
  try { r = await api(`/api/repos/${uuid}/agent/prompt`, { method: 'POST', body: JSON.stringify({ message, noContext }) }, 320000); }
  catch (e) {
    // 0.39.244 — a refusal (ok:false) carries the server's body on e.data; before, only the text survived
    // and awaitLate was lost, so a real failure never started the late-reply watch.
    r = (e.data && typeof e.data === 'object') ? { ...e.data, ok: false, error: e.data.error || e.message }
      : { ok: false, error: e.message, clientTimeout: e.name === 'AbortError' || /abort|timed? ?out/i.test(e.message) };
  }

  if (r.ok) { watch.stop(); _agentSettle(line, r); return _agentRerender(uuid); }

  // Failed. If a tab may still answer, keep watching the index and adopt what
  // arrives; otherwise the failure is final.
  if (!r.awaitLate && !r.clientTimeout) { watch.stop(); _agentSettle(line, r); return _agentRerender(uuid); }
  watch.afterFailure(r, noContext);
}

// ── §LATE 0.39.241 — late replies from the Responses index ───────────────
// James: the Agent tab should pick up a reply that arrives after copilot's
// wait has ended, from the Responses index by agent, instead of staying on
// "thinking…". GET …/agent/late is read-only; POST …/agent/late adopts the
// reply (learn, inject, log — once, server-side idempotent), and is only
// called after the dispatch itself has failed, so one reply is never run
// through both paths.
const AGENT_LATE_POLL_MS = 5000;
const AGENT_LATE_MAX_MS = 15 * 60 * 1000;   // a tab that has not answered in 15 min is not going to

function _agentSettle(line, r) {
  const ok = !!r.ok;
  line.role = ok ? 'agent' : 'agent — failed';
  line.text = ok ? r.text : (r.error || 'no response');
  line.meta = ok
    ? [r.hatName, r.providerUsed || r.provider, r.modelUsed, r.elapsedMs ? `${Math.round(r.elapsedMs / 100) / 10}s` : null, r.late ? 'late — from the Responses index' : null, r.viaCopilot ? `copilot → ${r.viaCopilot.backend}${r.viaCopilot.agent ? ' ' + r.viaCopilot.agent : ''}` : null].filter(Boolean).join(' · ')
    : (r.hatName || null);
  line.detail = _agentDetail(r);
  // §0.39.266 — James: "just prompt for approval." Code the agent wrote for a Nexus repo
  // is proposed, never applied; the approval prompt opens on it now, one inject at a time.
  const I = ok && r.injects;
  if (I && I.approval) {
    const ids = (I.injects || []).filter(x => x.status === 'proposed').map(x => x.uuid);
    if (ids.length) { NEXUS_APPROVAL_QUEUE.push(...ids.filter(id => !NEXUS_APPROVAL_QUEUE.includes(id))); setTimeout(_nexusApprovalNext, 0); }
  }
}
// §0.39.266 — pending approvals (inject uuids) for the repo open in the Agent tab
const NEXUS_APPROVAL_QUEUE = [];
function _nexusApprovalNext() {
  if (document.getElementById('inject-editor-modal').classList.contains('open')) return;   // one prompt at a time
  const id = NEXUS_APPROVAL_QUEUE.shift();
  if (id) openInjectEditor(id);
}
function _agentRerender(uuid) { if (CURRENT_API_REPO && CURRENT_API_REPO.uuid === uuid) renderRepoAgent(CURRENT_API_REPO); }

function _agentLateWatch(uuid, message, started, line) {
  let timer = null, stopped = false, found = null, failure = null, noContext = false, adopting = false, jobQ = '';
  const q = () => `/api/repos/${uuid}/agent/late?since=${started}&message=${encodeURIComponent(message.slice(0, 200))}${jobQ}`;
  const stop = () => { stopped = true; if (timer) clearTimeout(timer); timer = null; };
  const adopt = async () => {
    if (adopting) return; adopting = true; stop();
    let a;
    try { a = await api(`/api/repos/${uuid}/agent/late`, { method: 'POST', body: JSON.stringify({ responseId: found.responseId, message, since: started, noContext }) }, 120000); }
    catch (e) { a = { ok: false, error: e.message }; }
    if (a.ok) _agentSettle(line, a);
    else {   // the reply exists and is shown; only its processing failed — say so, keep the text
      line.role = 'agent'; line.text = found.text;
      line.meta = `late — from the Responses index · not processed: ${a.error || 'adopt failed'}`;
    }
    _agentRerender(uuid);
  };
  const tick = async () => {
    timer = null;
    if (stopped) return;
    if (Date.now() - started > AGENT_LATE_MAX_MS) {
      stop();
      if (failure) { _agentSettle(line, { ...failure, error: `${failure.error || 'no response'} — and no late reply reached the Responses index within ${AGENT_LATE_MAX_MS / 60000} min` }); _agentRerender(uuid); }
      return;
    }
    try {
      const f = await api(q(), {}, 8000);
      if (f.found && !stopped) {
        found = f;
        if (failure) return adopt();
        // Dispatch still in flight: show the reply now, finish when copilot does.
        line.text = f.text;
        line.meta = `${f.provider || 'agent'} · arrived in the Responses index — waiting on copilot to finish`;
        _agentRerender(uuid);
        return;   // nothing more to poll for; afterFailure/ok settles it
      }
    } catch (_) { /* index or idearium briefly unreachable — the next tick retries */ }
    if (!stopped) timer = setTimeout(tick, AGENT_LATE_POLL_MS);
  };
  timer = setTimeout(tick, AGENT_LATE_POLL_MS);
  return {
    stop,
    afterFailure(r, nc) {
      failure = r; noContext = nc;
      if (r.awaitLate && r.awaitLate.jobId) jobQ = `&jobId=${encodeURIComponent(r.awaitLate.jobId)}`;
      if (found) return adopt();
      line.role = 'agent';
      line.text = 'thinking… (copilot stopped waiting — watching the Responses index for the reply)';
      line.meta = r.error ? `copilot: ${r.error}` : null;
      _agentRerender(uuid);
      if (!timer && !stopped) timer = setTimeout(tick, 0);
    },
  };
}

// §AGENT-DETAIL 2026-09-21 — what the agent was given, and what it learned.
// v0.39.194 made dispatch hand the agent retrieved chunks, but the tab never
// showed which — so an answer could not be checked against its evidence.
// Both blocks render server data verbatim; nothing is inferred here. Built
// as a string (escaped) and stored on the transcript line, so a re-render
// shows the same evidence the answer arrived with.
function _agentDetail(r) {
  if (!r) return '';
  const parts = [];
  const c = r.context;
  if (c) {
    const files = Array.isArray(c.files) ? c.files : [];
    const ids = Array.isArray(c.chunkIds) ? c.chunkIds : [];
    // 0.39.257 — the graph: connections for matched files, or the project map when nothing matched
    const g = c.graph || null;
    // §0.39.266 — the harness sends a registry card (what the question names), never code; the agent reads the rest
    const head = c.kind === 'card' && Array.isArray(c.cards) && c.cards.length
      ? `context: registry card of ${c.cards.map(x => x.id).join(', ')} · ${c.chars || 0} chars — the agent reads code with loom.read.tool`
      : ids.length
      ? `context: ${ids.length} chunk${ids.length === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'} · ${c.chars || 0} chars${c.dropped ? ` · ${c.dropped} dropped for budget` : ''}${g && g.connections ? ` · graph: ${g.connections} connection${g.connections === 1 ? '' : 's'}` : ''}`
      : g && g.overview ? `context: project map from the graph (${g.files} files) — the question named no code`
      : `context: none${c.reason ? ` — ${c.reason}` : ''}`;
    parts.push(`<details style="margin-top:4px;font-size:9px;opacity:.75"><summary style="cursor:pointer">${escapeHtml(head)}</summary>` +
      (files.length ? files.map(f => `<div style="padding-left:12px">· ${escapeHtml(f)}</div>`).join('') : '') +
      (ids.length ? `<div style="padding-left:12px;opacity:.6">${ids.map(escapeHtml).join(', ')}</div>` : '') +
      `</details>`);
  }
  // 0.39.265 — the question as it was actually sent, when copilot reworded it (Settings → Agents → 'Reword')
  const rw = c && c.reworded;
  if (rw) {
    const head = rw.source === 'original' ? `sent as typed${rw.reason ? ` — reword unavailable: ${rw.reason}` : ''}`
      : `reworded by ${rw.source === 'ollama' ? 'the local model' : 'the built-in rewriter'}${rw.novel ? ' · new wording' : ` · close to an earlier one (${rw.similarity})`}`;
    parts.push(`<details style="margin-top:4px;font-size:9px;opacity:.75"><summary style="cursor:pointer">${escapeHtml(head)}</summary>${c.sentMessage ? `<div style="padding-left:12px;white-space:pre-wrap">${escapeHtml(c.sentMessage)}</div>` : ''}</details>`);
  }
  // 0.39.257 — the tools the agent used this turn (copilot's tool loop), each ✓ or ✗ with its error
  const T = Array.isArray(r.toolCalls) ? r.toolCalls : [];
  if (T.length) {
    const head = `tools used: ${T.length} call${T.length === 1 ? '' : 's'} — ${[...new Set(T.map(t => t.name))].join(', ')}${T.some(t => !t.ok) ? ` · ${T.filter(t => !t.ok).length} failed` : ''}`;
    parts.push(`<details style="margin-top:4px;font-size:9px;opacity:.75"><summary style="cursor:pointer">${escapeHtml(head)}</summary>` +
      T.map(t => `<div style="padding-left:12px;${t.ok ? '' : 'color:var(--bad,#f87171)'}">${t.ok ? '✓' : '✗'} ${escapeHtml(t.name)} <span style="opacity:.6">${escapeHtml(JSON.stringify(t.arguments || {}).slice(0, 160))}</span>${t.error ? ` — ${escapeHtml(t.error)}` : ''}${t.scopeRejected ? ' (outside the tool scope)' : ''}</div>`).join('') + `</details>`);
  }
  const I = r.injects;
  if (I) {
    const rows = [
      ...(I.injects || []).map(x => `<div style="padding-left:12px">${x.status === 'applied' ? '✎ wrote' : '◇ proposed'} <span style="cursor:pointer;text-decoration:underline" onclick="openInjectEditor('${escapeHtml(x.uuid)}')">${escapeHtml(x.path)}</span>${x.creates ? ' (new file)' : ''}` +
        `${x.addressedBy ? ` <span style="opacity:.55" title="${escapeHtml(x.evidence || '')}">— ${x.addressedBy === 'fence' ? 'path stated' : x.addressedBy === 'symbols' ? `matched ${escapeHtml(x.evidence || 'symbols')}` : 'agent placed it'}</span>` : ''}` +
        `${x.applyError ? ` <span style="color:var(--bad,#f87171)">— not applied: ${escapeHtml(x.applyError)}</span>` : ''}</div>`),
      ...(I.refused || []).map(x => `<div style="padding-left:12px;color:var(--bad,#f87171)">refused: ${escapeHtml(x.reason)}</div>`),
      ...(I.unresolved || []).map(x => `<div style="padding-left:12px;opacity:.65">not written: ${escapeHtml(x.reason)}</div>`),
      ...(I.commands ? [`<div style="padding-left:12px;opacity:.6">${I.commands} shell block${I.commands === 1 ? '' : 's'} — commands, not files</div>`] : []),
    ];
    parts.push(`<details open style="margin-top:4px;font-size:9px"><summary style="cursor:pointer">injects${I.mode ? ` (${escapeHtml(I.mode)})` : ''}: ${(I.injects || []).length}</summary>${rows.join('')}</details>`);
  }
  const L = r.learned;
  if (L) {
    const ok = (L.recorded || []).filter(x => x.ok);
    const failed = (L.recorded || []).filter(x => !x.ok);
    const rows = [
      ...ok.map(x => `<div style="padding-left:12px">+ (${escapeHtml(x.kind)}) ${escapeHtml(x.text)}${x.deduped ? ' <span style="opacity:.6">[already known — occurrences +1]</span>' : ''}${x.evidence ? ` <span style="opacity:.6">[${escapeHtml(x.evidence)}${x.grounded ? '' : ' — ungrounded'}]</span>` : ' <span style="opacity:.6">[no evidence]</span>'}</div>`),
      ...failed.map(x => `<div style="padding-left:12px;color:var(--bad,#f87171)">✗ (${escapeHtml(x.kind)}) ${escapeHtml(x.text)} — ${escapeHtml((x.errors || ['failed']).join('; '))}</div>`),
      ...(L.rejected || []).map(x => `<div style="padding-left:12px;opacity:.6">rejected: ${escapeHtml(x.reason)}</div>`),
      ...(L.dropped ? [`<div style="padding-left:12px;opacity:.6">${L.dropped} dropped over the per-reply cap</div>`] : []),
    ];
    parts.push(`<details open style="margin-top:4px;font-size:9px"><summary style="cursor:pointer">learned: ${ok.length} recorded${failed.length ? `, ${failed.length} failed` : ''}${(L.rejected || []).length ? `, ${L.rejected.length} rejected` : ''}</summary>${rows.join('')}</details>`);
  }
  return parts.join('');
}

// ════════════════════════════════════════════════════
// §AGENT-CLI 2026-09-21 — James: "need the full agent cli ui in the
// compartment repo agent tab that interacts with the hat and agent model."
// Anything starting with / is a command against this compartment's hat,
// learned model, injects and settings; everything else is a prompt. Every
// command is a thin client of a real route — nothing here is computed or
// remembered client-side that the server does not also hold.
// ════════════════════════════════════════════════════
const AGENT_SETTINGS = new Map();     // repoUuid -> { provider, providers, useGuardian, guardianAgent, guardianProviders, injectMode } (display; server is truth)
// §THREE-WAY 0.39.253 — James: "i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv
// ui. that way it doesn't use check box. also have ollamas models to choose from in a drop down menu for the agent tab."
// Same shape as ui/tv-shell's #cp-backend-toggle: ollama · copilot · guardian, and a dropdown only where there is a real
// choice — guardian's agents, or Ollama's installed models. copilot is the stored provider 'auto' (copilot's own
// DEFAULT_PROVIDER decides; nothing to pick). Each control sends only what it owns; the server is the truth and every
// change re-renders from it. Replaces the 2026-09-21 guardian on/off checkbox (which could not say "copilot").
const OLLAMA_MODELS_TTL_MS = 30000;
let _ollamaModelsCache = { at: 0, data: null };
async function _ollamaModelList(force = false) {
  if (!force && _ollamaModelsCache.data && Date.now() - _ollamaModelsCache.at < OLLAMA_MODELS_TTL_MS) return _ollamaModelsCache.data;
  let data;
  try { data = await api('/api/ollama/models'); if (!Array.isArray(data.models)) throw new Error('no model list in the answer'); data = { ok: true, models: data.models, active: data.active || null }; }
  catch (e) { data = { ok: false, error: e.message, models: [] }; }
  _ollamaModelsCache = { at: Date.now(), data };
  return data;
}
function _agentBackendOf(cfg) {
  if (cfg && cfg.backend) return cfg.backend;
  const p = cfg && cfg.provider;
  return p === 'ollama' ? 'ollama' : p === 'claude-code' ? 'claude-code' : (!p || p === 'auto') ? 'copilot' : 'guardian';
}
function _agentBackendHtml(cfg, models) {
  const b = _agentBackendOf(cfg || {});
  const btn = (k, tip) => `<button class="ag-toggle-btn${b === k ? ' ag-toggle-active' : ''}" onclick="agentSetBackend('${k}')" title="${tip}">${k}</button>`;
  let drop;
  if (b === 'guardian') {
    const gp = cfg.guardianProviders || [];
    drop = `<select class="ag-select" onchange="agentSetGuardianAgent(this.value)" title="which guardian agent answers, through its own tab">` +
      (cfg.guardianAgent ? '' : `<option value="" selected disabled>pick an agent</option>`) +
      gp.map(p => `<option value="${escapeHtml(p)}"${p === cfg.guardianAgent ? ' selected' : ''}>${escapeHtml(p)}</option>`).join('') + `</select>`;
  } else if (b === 'ollama') {
    if (models && models.ok) {
      const list = models.models.slice();
      const stored = cfg.ollamaModel || '';
      const missing = stored && !list.includes(stored);
      drop = `<select class="ag-select" onchange="agentSetOllamaModel(this.value)" title="which installed Ollama model answers">` +
        `<option value=""${stored ? '' : ' selected'}>default${models.active ? ` (${escapeHtml(models.active)})` : ''}</option>` +
        (missing ? `<option value="${escapeHtml(stored)}" selected>${escapeHtml(stored)} — not installed</option>` : '') +
        list.map(m => `<option value="${escapeHtml(m)}"${m === stored ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('') + `</select>` +
        (list.length ? '' : `<span class="ag-note">no models installed — ollama pull &lt;model&gt;</span>`);
    } else {
      drop = `<span class="ag-note ag-warn" title="${escapeHtml((models && models.error) || '')}">ollama models unavailable — ${escapeHtml((models && models.error) || 'not loaded')}</span>`;
    }
  } else if (b === 'claude-code') {
    // §IN2a — headless Claude Code on this machine; it edits a copy of the repo and its changes come back through the repo layer
    drop = `<span class="ag-note">Claude Code on this machine, under the account its <code>claude</code> is signed into — it works in a copy; what it changes is written back here</span>`;
  } else {
    drop = `<span class="ag-note">copilot picks who answers; what is sent is still only these settings</span>`;
  }
  return `<span class="ag-backend"><span class="ag-toggle" title="which backend wears this repo's hat">` +
    btn('ollama', 'a local Ollama model') + btn('copilot', "copilot's own default provider") + btn('guardian', "a guardian agent, through its own tab") +
    btn('claude-code', 'Claude Code, headless on this machine — reads and edits the repo itself') +
    `</span>${drop}</span>`;
}
function _agentControlsRerender() {   // both places the backend control shows: the Agent tab and Settings → Agents
  if (!CURRENT_API_REPO) return;
  renderRepoAgent(CURRENT_API_REPO);
  if (document.getElementById('repo-agents-section')) renderRepoAgentSettings(CURRENT_API_REPO);
}
async function agentSetBackend(backend) {
  if (!CURRENT_API_REPO) return;
  // guardian keeps this compartment's guardian agent (or the stated default) — the server resolves it, so switching
  // away and back never silently loses the choice.
  const body = backend === 'ollama' ? { provider: 'ollama' } : backend === 'copilot' ? { provider: 'auto' } : backend === 'claude-code' ? { provider: 'claude-code' } : { useGuardian: true };
  try { const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify(body) });
    toast(backend === 'copilot' ? 'copilot wears this repo\'s hat' : backend === 'ollama' ? 'ollama wears this repo\'s hat' : `${r.provider} wears this repo's hat`, 'ok'); }
  catch (e) { toast(`backend failed: ${e.message}`, 'err'); }
  _agentControlsRerender();
}
async function agentSetGuardianAgent(guardianAgent) {
  if (!CURRENT_API_REPO || !guardianAgent) return;
  try { await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ useGuardian: true, guardianAgent }) });
    toast(`${guardianAgent} now wears this repo's hat`, 'ok'); }
  catch (e) { toast(`provider failed: ${e.message}`, 'err'); }
  _agentControlsRerender();
}
async function agentSetOllamaModel(model) {
  if (!CURRENT_API_REPO) return;
  try { await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ ollamaModel: model || null }) });
    toast(model ? `ollama answers with ${model}` : 'ollama answers with its default model', 'ok'); }
  catch (e) { toast(`model failed: ${e.message}`, 'err'); }
  _agentControlsRerender();
}
const AGENT_INJECT_MODE = new Map();   // repoUuid -> 'review' | 'auto' (display only; server is truth)
const AGENT_NO_CONTEXT = new Set();    // repoUuids with retrieval switched off for this session
const AGENT_INPUT_HIST = new Map();    // repoUuid -> [inputs]
const AGENT_HIST_POS = new Map();
function _agentInputHistory(uuid) { if (!AGENT_INPUT_HIST.has(uuid)) AGENT_INPUT_HIST.set(uuid, []); return AGENT_INPUT_HIST.get(uuid); }

// 0.39.257 — James: "need the commands as user friendly as possible", "/help and tool awareness to help".
// Grouped by what you want to do, each with what it does in plain words; aliases and a closest-match suggestion
// for a typo (agentCommand below). Plain text is always a question for the agent.
const AGENT_CLI_HELP = [
  'Type anything to ask this project\'s agent. It reads this project\'s code and graph (context is on) and can use',
  'every NEXUS tool — /tools lists them. Commands start with /.',
  '',
  'ASK & INVESTIGATE',
  '  /debug                        what is wrong? syntax, broken imports, recent failures, and the intelligence system',
  '  /debug <question>             the agent investigates, using the intelligence system and this project\'s files',
  '  /tools [words]                what the agent can do, grouped — e.g. /tools cos   /tools debug',
  '  /scope all|project            which tools it may use: all (default) or this project\'s own set',
  '  /graph [file]                 how the project connects; with a file, what it imports and what imports it',
  '  /context on|off               include this project\'s code and graph with your questions (on by default)',
  '  /recall <words>               search EVERY memory system and graph (chats, fixes, gaps, learned facts, specs, changelogs, this graph)',
  '  /atlas                        where NEXUS keeps memory: every table with its size and the tool that reads it',
  '',
  'RUN & CHECK',
  '  /run   /test                  run this project in a COS branch (same as the Run button)',
  '  /diagnose                     verification + scan (same as the Diagnose button)',
  '',
  'THE AGENT',
  '  /status                       hat, compartment, index, provider, tools, learned, exchanges',
  '  /provider [name]              who answers: ollama, copilot (auto), or a browser agent (chatgpt, claude, …)',
  '  /model [name|default]         which Ollama model answers when ollama does (no name: list them)',
  '  /hat   /forge                 see its persona · create its hat if it has none',
  '  /memory [kind]                what it has learned',
  '  /learn <kind>: <text> [evidence: x]   teach it (kinds: fact, convention, pitfall, correction)',
  '  /forget <id>                  remove one thing it learned',
  '  /history [n]   /export   /import <path>   /clear',
  '',
  'NEXUS ITSELF',
  '  /import-archives               drop your NEXUS release zips (or a folder) — each becomes a dated commit of NEXUS history (also /archives, /archive)',
  '',
  'CODE IT WRITES',
  '  /mode review|auto             its code waits for you (review) or is written on arrival (auto)',
  '  /injects [status]   /inject <path>   /open <id>',
  '  /apply <id> [--force]   /reject <id>   /revert <id> [--force]',
  '',
  '/help shows this · ↑↓ recalls what you typed · short forms: /? /h /st /t /dbg /hist · a mistyped command suggests the closest',
].join('\n');
const AGENT_CLI_ALIASES = { '?': 'help', h: 'help', st: 'status', t: 'tools', tool: 'tools', dbg: 'debug', hist: 'history', ctx: 'context', diag: 'diagnose', find: 'recall', search: 'recall', mem: 'recall' };
const AGENT_CLI_COMMANDS = ['help', 'debug', 'tools', 'scope', 'graph', 'context', 'run', 'test', 'diagnose', 'status', 'provider', 'model', 'hat', 'forge',
  'memory', 'learn', 'forget', 'history', 'export', 'import', 'clear', 'mode', 'injects', 'inject', 'open', 'apply', 'reject', 'revert', 'recall', 'atlas', 'import-archives'];
/** The closest known command to a typo (edit distance ≤ 2), or null. */
function _agentClosest(cmd) {
  const d = (a, b) => { const m = [...Array(b.length + 1).keys()]; for (let i = 1; i <= a.length; i++) { let prev = m[0]; m[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } } return m[b.length]; };
  let best = null, bd = 3;
  for (const c of AGENT_CLI_COMMANDS) { const x = d(cmd, c); if (x < bd) { bd = x; best = c; } }
  return best;
}
const AGENT_DEBUG_DIRECTIVE = (q) => `Debug this: ${q}\n\nInvestigate before answering. Use the intelligence system (intelligence_query, nexus_intelligence, diagnose, fault_log) and this project's own files (read_file, search_files, file_tree). Say what you checked, what you found, the evidence (file:line or the tool result), and the fix.`;
function _agentToolsText(r) {
  const byGroup = new Map();
  for (const t of r.tools || []) { if (!byGroup.has(t.groupTitle)) byGroup.set(t.groupTitle, []); byGroup.get(t.groupTitle).push(t); }
  const out = [];
  for (const [title, list] of byGroup) {
    out.push(title.toUpperCase());
    for (const t of list) out.push(`  ${t.inScope ? ' ' : '✗'} ${t.name.padEnd(30)} ${t.summary}${t.use ? `\n      when: ${t.use}` : ''}`);
    out.push('');
  }
  return out.join('\n').trim();
}

function _cli(uuid, text, meta = null) { _agentTranscript(uuid).push({ role: 'cli', text, meta }); }

async function _injectByPrefix(uuid, prefix) {
  if (!prefix) throw new Error('an inject id prefix is required');
  const all = (await api(`/api/repos/${uuid}/injects`)).injects || [];
  const hits = all.filter(n => n.uuid.startsWith(prefix));
  if (!hits.length) throw new Error(`no inject matches "${prefix}"`);
  if (hits.length > 1) throw new Error(`"${prefix}" is ambiguous (${hits.length} matches)`);
  return hits[0];
}

async function agentCommand(line) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  const uuid = repo.uuid;
  _agentTranscript(uuid).push({ role: 'you', text: line });
  const [cmd0, ...rest] = line.slice(1).split(/\s+/);
  const arg = line.slice(1 + cmd0.length).trim();
  const cmd = AGENT_CLI_ALIASES[(cmd0 || '').toLowerCase()] || cmd0;
  const force = /(^|\s)--force(\s|$)/.test(arg);
  const first = rest.filter(x => x !== '--force')[0];
  try {
    switch ((cmd || '').toLowerCase()) {
      case 'help': case '?': _cli(uuid, AGENT_CLI_HELP); break;
      // §0.39.283 N30 — the archive import drop box
      case 'import-archives': case 'archives': case 'archive': {
        _cli(uuid, openArchiveImport() ? 'opened the archive import — drop your NEXUS zips (or a folder); "Check the order" first, then Import' : 'could not open the archive import window'); break;
      }
      // 0.39.257 — tools, scope, debug, graph, run/test/diagnose
      case 'tools': {
        const r = await api(`/api/repos/${uuid}/agent/tools${arg ? `?q=${encodeURIComponent(arg)}` : ''}`, {}, 15000);
        const head = `${r.count} of ${r.total} tools${arg ? ` matching "${arg}"` : ''} · scope ${r.scope}${r.scope === 'project' ? ' (✗ = outside it)' : ''} · ${r.enforced ? 'enforced' : `not enforced while ${r.provider} (copilot's own routing) answers — pick ollama or a browser agent with /provider`}`;
        _cli(uuid, r.count ? _agentToolsText(r) : `no tool matches "${arg}" — try fewer words, or /tools for all`, head); break;
      }
      case 'scope': {
        if (!['all', 'project'].includes(first)) { const st = await api(`/api/repos/${uuid}/agent/settings`); _cli(uuid, `tool scope: ${st.toolScope} — /scope all (every tool) or /scope project (this project's own set)`); break; }
        await api(`/api/repos/${uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ toolScope: first }) });
        _cli(uuid, first === 'all' ? 'the agent may use every NEXUS tool' : 'the agent may use this project\'s own tool set only (/tools shows which)'); break;
      }
      case 'debug': {
        if (arg) { renderRepoAgent(repo); return agentSend({ message: AGENT_DEBUG_DIRECTIVE(arg), shown: line }); }
        _cli(uuid, 'checking syntax, imports, recent failures and the intelligence system…'); renderRepoAgent(repo);
        const r = await api(`/api/repos/${uuid}/agent/debug`, { method: 'POST', body: '{}' }, 90000);
        _agentTranscript(uuid).pop();
        _cli(uuid, r.sections.map(x => `${x.ok === true ? '✓' : x.ok === false ? '✗' : '·'} ${x.title}  (${x.source})\n${x.lines.map(l => `  ${l}`).join('\n')}`).join('\n\n'),
          'debug report — /debug <question> to have the agent investigate'); break;
      }
      case 'graph': {
        const r = await api(`/api/repos/${uuid}/agent/graph${arg ? `?file=${encodeURIComponent(arg)}` : ''}`);
        _cli(uuid, r.text, arg ? `connections of ${r.file}` : `project map · ${r.files} files`); break;
      }
      // 0.39.272 — the context atlas (lib/context-atlas.js): one search across every memory system and graph
      case 'recall': {
        if (!arg) { _cli(uuid, 'usage: /recall <words> — e.g. /recall tab claim race   /recall sequencer clock'); break; }
        const r = await api(`/api/repos/${uuid}/context?q=${encodeURIComponent(arg)}&limit=15`);
        _cli(uuid, r.hits.length ? r.hits.map(h => `[${h.source}${h.id ? ' ' + String(h.id).slice(0, 40) : ''}] ${h.snippet}`).join('\n\n') : `nothing matched "${arg}" (searched ${r.searched.length} sources)`,
          `${r.total} match(es) across ${Object.keys(r.bySource).length} source(s)`); break;
      }
      case 'atlas': {
        const d = await api('/api/context/directory');
        const rows = d.tables.filter(t => t.rows !== 0).map(t => `${t.table.padEnd(28)} ${String(t.rows ?? '?').padStart(6)}  ${t.what || ''}${t.tool ? `  → ${t.tool}` : ''}${t.searchedByDefault ? '' : '  (opt-in)'}`);
        _cli(uuid, [...d.sources.filter(x => x.source !== 'jaa').map(x => `${x.source.padEnd(28)}        ${x.what}`), '', ...rows].join('\n'), `memory atlas · ${d.tables.length} tables`); break;
      }
      case 'run': case 'test': { renderRepoAgent(repo); return repoRun(cmd); }
      case 'diagnose': { renderRepoAgent(repo); return repoDiagnose(); }
      case 'status': {
        const st = await api(`/api/repos/${uuid}/agent`);
        const mode = (await api(`/api/repos/${uuid}/agent/settings`)).injectMode;
        _cli(uuid, [
          `hat         ${st.exists ? st.hat.name : '(none — /forge)'}`,
          `compartment ${st.compartmentId || '(none)'}`,
          `index       ${st.index?.indexed ? `${st.index.fileCount} files · ${st.index.chunkCount} chunks` : 'not indexed'}`,
          `mode        ${mode}`,
          `provider    ${(await api(`/api/repos/${uuid}/agent/settings`)).provider}`,
          `context     ${AGENT_NO_CONTEXT.has(uuid) ? 'off (this session)' : 'on'}`,
          `learned     ${st.memory?.total ?? 0}`,
          `exchanges   ${st.exchanges ?? 0}`,
          `tools       ${st.toolScope === 'project' ? 'this project\'s own set' : 'every NEXUS tool'} · ${st.toolScopeEnforced ? 'enforced' : 'not enforced while copilot (auto) answers'} · /tools`,
        ].join('\n'));
        break;
      }
      case 'hat': {
        const st = await api(`/api/repos/${uuid}/agent`);
        _cli(uuid, st.exists ? st.hat.personaPrompt || '(empty persona)' : 'no hat — /forge', st.exists ? st.hat.name : null);
        break;
      }
      case 'forge': {
        const r = await api(`/api/repos/${uuid}/hat`, { method: 'POST', body: JSON.stringify({}) });
        _cli(uuid, r.created ? `forged ${r.hat.name}` : `already exists: ${r.hat.name}`); break;
      }
      case 'memory': {
        const r = await api(`/api/repos/${uuid}/agent/memory`);
        const obs = (r.observations || []).filter(o => !first || o.kind === first);
        _cli(uuid, obs.length ? obs.map(o => `${o.uuid.slice(0, 8)}  (${o.kind}) ${o.text}${(o.occurrences || 1) > 1 ? ` [${o.occurrences}×]` : ''}${o.evidence ? ` [${o.evidence}]` : ''}  — ${o.source}`).join('\n') : 'nothing learned yet');
        break;
      }
      case 'learn': {
        const m = arg.match(/^(?:(fact|convention|pitfall|correction)\s*:\s*)?(.+?)(?:\s*\[evidence:\s*([^\]]+)\])?$/i);
        if (!m || !m[2]) throw new Error('usage: /learn <kind>: <text> [evidence: x]');
        const r = await api(`/api/repos/${uuid}/agent/memory`, { method: 'POST', body: JSON.stringify({ kind: (m[1] || 'correction').toLowerCase(), text: m[2], evidence: m[3] || null, source: 'james' }) });
        _cli(uuid, `${r.deduped ? 'already known — occurrences +1' : 'learned'}${r.hatUpdated ? ' · persona updated' : ` · persona NOT updated: ${r.reason || '?'}`}`); break;
      }
      case 'forget': {
        const r = await api(`/api/repos/${uuid}/agent/memory`);
        const hits = (r.observations || []).filter(o => o.uuid.startsWith(first || '\u0000'));
        if (hits.length !== 1) throw new Error(hits.length ? `"${first}" is ambiguous` : `no observation matches "${first || ''}"`);
        await api(`/api/repos/${uuid}/agent/memory/${hits[0].uuid}`, { method: 'DELETE' });
        _cli(uuid, `forgot: ${hits[0].text}`); break;
      }
      case 'provider': {
        if (!first) { const st = await api(`/api/repos/${uuid}/agent/settings`); _cli(uuid, `${st.provider} wears the hat · available: ${st.providers.join(', ')}`); break; }
        await api(`/api/repos/${uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ provider: first }) });
        _cli(uuid, `${first} now wears this repo's hat — same persona, context, learning and injects`); break;
      }
      case 'model': {
        const list = await _ollamaModelList(true);
        if (!first) {
          const st = await api(`/api/repos/${uuid}/agent/settings`);
          if (!list.ok) { _cli(uuid, `ollama models unavailable — ${list.error}`, `this compartment: ${st.ollamaModel || 'default'}`); break; }
          _cli(uuid, list.models.length ? list.models.map(m => `${m === st.ollamaModel ? '*' : ' '} ${m}${m === list.active ? '   (bridge default)' : ''}`).join('\n') : 'no models installed — ollama pull <model>',
            `this compartment: ${st.ollamaModel || `default${list.active ? ` (${list.active})` : ''}`}${st.backend === 'ollama' ? '' : ` · ${st.backend} wears the hat now — the model applies when ollama does`}`);
          break;
        }
        const model = first === 'default' ? null : first;
        const r = await api(`/api/repos/${uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ ollamaModel: model }) });
        _cli(uuid, r.ollamaModel ? `ollama answers with ${r.ollamaModel}` : 'ollama answers with its default model');
        _agentControlsRerender(); return;
      }
      case 'mode': {
        if (!['review', 'auto'].includes(first)) throw new Error('usage: /mode review|auto');
        await api(`/api/repos/${uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ injectMode: first }) });
        _cli(uuid, first === 'auto' ? 'mode auto — the agent\'s addressed code is written on arrival; each write is an .inject you can revert' : 'mode review — the agent\'s code waits as proposed injects'); break;
      }
      case 'injects': {
        const r = await api(`/api/repos/${uuid}/injects${first ? `?status=${encodeURIComponent(first)}` : ''}`);
        _cli(uuid, (r.injects || []).length ? r.injects.map(n => `${n.uuid.slice(0, 8)}  ${n.status.padEnd(8)} ${n.path}${n.creates ? ' (new)' : ''}  — ${n.hatName || 'you'}`).join('\n') : 'no injects', `mode ${r.mode}`); break;
      }
      case 'inject': { if (!first) throw new Error('usage: /inject <path>'); renderRepoAgent(repo); return openInjectEditor(null, first); }
      case 'open': { const n = await _injectByPrefix(uuid, first); renderRepoAgent(repo); return openInjectEditor(n.uuid); }
      case 'apply': case 'reject': case 'revert': {
        const n = await _injectByPrefix(uuid, first);
        const r = await api(`/api/repos/${uuid}/injects/${n.uuid}/${cmd}`, { method: 'POST', body: JSON.stringify({ force }) });
        _cli(uuid, `${r.inject.status}: ${r.inject.path}`); break;
      }
      case 'context': {
        if (first === 'off') AGENT_NO_CONTEXT.add(uuid); else if (first === 'on') AGENT_NO_CONTEXT.delete(uuid); else throw new Error('usage: /context on|off');
        _cli(uuid, `context ${first} for this session`); break;
      }
      case 'history': {
        const r = await api(`/api/repos/${uuid}/agent/history?limit=${parseInt(first, 10) || 10}`);
        _cli(uuid, (r.exchanges || []).map(h => `${new Date(h.ts).toLocaleString()}  ${h.ok ? 'ok ' : 'ERR'}  ${String(h.message).slice(0, 80)}${h.injects?.length ? `  [${h.injects.length} inject]` : ''}`).join('\n') || 'no exchanges logged'); break;
      }
      case 'export': { await agentExport(); return; }
      case 'import': {
        if (!arg) throw new Error('usage: /import <path to .agent file>');
        const r = await api(`/api/repos/${uuid}/agent/import`, { method: 'POST', body: JSON.stringify({ filePath: arg }) }, 30000);
        _cli(uuid, `imported — ${r.restored} new, ${r.merged} merged${r.rejected ? `, ${r.rejected} rejected` : ''}`); break;
      }
      case 'clear': AGENT_TRANSCRIPT.set(uuid, []); break;
      default: { const near = _agentClosest(String(cmd).toLowerCase()); throw new Error(`unknown command /${cmd}${near ? ` — did you mean /${near}?` : ''} · /help lists them all`); }
    }
  } catch (e) { _agentTranscript(uuid).push({ role: 'cli — error', text: e.message }); }
  renderRepoAgent(repo);
}

async function agentSetMode(mode) {
  if (!CURRENT_API_REPO) return;
  try { await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ injectMode: mode }) }); }
  catch (e) { toast(`mode failed: ${e.message}`, 'err'); }
  renderRepoAgent(CURRENT_API_REPO);
}

async function agentInjectAction(id, action, force = false) {
  if (!CURRENT_API_REPO) return;
  try {
    const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/injects/${id}/${action}`, { method: 'POST', body: JSON.stringify({ force }) }, 300000);
    toast(r.gate ? `${r.inject.status}: ${r.inject.path} — live tree, nexus/${r.gate.system}${r.gate.applyId ? ` (${r.gate.applyId})` : ''}` : `${r.inject.status}: ${r.inject.path}`, 'ok');
    // §0.39.266 — an approval decided: on to the next one waiting
    if (r.inject && r.inject.target && r.inject.target.kind === 'nexus-gate' && (action === 'apply' || action === 'reject') && INJECT_EDITOR_ID === id) { closeInjectEditor(); renderRepoAgent(CURRENT_API_REPO); return; }
  } catch (e) {
    // A conflict is a real, specific refusal; offer the override rather than hiding it.
    // Typing the word is deliberate friction: forcing discards a newer edit.
    if (/changed since/.test(e.message) && !force && (await themedPrompt(`${e.message}\n\ntype "force" to ${action} anyway:`, `${action} conflict`)) === 'force') return agentInjectAction(id, action, true);
    toast(`${action} failed: ${e.message}`, 'err');
  }
  renderRepoAgent(CURRENT_API_REPO);
  if (INJECT_EDITOR_ID === id) openInjectEditor(id);
}

function agentNewInject() {
  themedPrompt('repo-relative path for the new write:', 'new inject').then(p => { if (p) openInjectEditor(null, p); });
}

// ── The .inject editor ──────────────────────────────────────────────────────
// One modal: path, the proposed content (editable while proposed), and the
// file as it is now for comparison. Saving a person-authored new inject
// proposes it; saving an agent's proposal edits it in place before apply.
let INJECT_EDITOR_ID = null;       // uuid, or null for a new inject
let INJECT_EDITOR_PATH = null;
async function openInjectEditor(id, newPath = null) {
  if (!CURRENT_API_REPO) return;
  const uuid = CURRENT_API_REPO.uuid;
  const $ = x => document.getElementById(x);
  INJECT_EDITOR_ID = id; INJECT_EDITOR_PATH = newPath;
  let n = null, current = null, gate = null;
  try {
    if (id) { const r = await api(`/api/repos/${uuid}/injects/${id}`, {}, 60000); n = r.inject; current = r.current; gate = r.gate || null; }
    else {
      try { const f = await api(`/api/repos/${uuid}/file?path=${encodeURIComponent(newPath)}`); current = f.content ?? null; } catch (_) { current = null; }
    }
  } catch (e) { toast(`open failed: ${e.message}`, 'err'); return; }
  const editable = !n || n.status === 'proposed';
  $('inj-ed-title').textContent = n ? `${n.status} · ${n.path}` : `new · ${newPath}`;
  $('inj-ed-meta').textContent = n
    ? `${n.hatName ? `by ${n.hatName}` : 'by you'} · ${n.creates ? 'creates the file' : 'overwrites the file'} · ${n.uuid}` + (n.history ? ` · ${n.history.map(h => h.event).join(' → ')}` : '')
    : (current === null ? 'creates the file' : 'overwrites the file');
  $('inj-ed-content').value = n ? n.content : (current ?? '');
  $('inj-ed-content').readOnly = !editable;
  $('inj-ed-current').textContent = current === null ? '(file does not exist)' : current;
  $('inj-ed-current').style.display = 'none';
  $('inj-ed-save').style.display = editable ? '' : 'none';
  $('inj-ed-apply').style.display = editable ? '' : 'none';
  $('inj-ed-reject').style.display = n && n.status === 'proposed' ? '' : 'none';
  $('inj-ed-revert').style.display = n && n.status === 'applied' ? '' : 'none';
  _injectGatePanel(n, gate);
  $('inject-editor-modal').classList.add('open');
}
// §0.39.266 — a nexus-gate inject: the editor becomes the approval prompt. It says which
// system's live files change, shows the diff against the live tree and the gate's plan,
// and "approve → live tree" is the only way the code lands. A plan error blocks approval;
// a conflict goes through the existing type-"force" path.
function _injectGatePanel(n, gate) {
  const el = document.getElementById('inj-ed-gate');
  const btn = document.getElementById('inj-ed-apply');
  const isGate = !!(n && n.target && n.target.kind === 'nexus-gate');
  btn.textContent = isGate ? 'approve → live tree' : 'save + apply';
  btn.disabled = false;
  if (!isGate) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  if (n.status !== 'proposed') {
    el.innerHTML = `<div class="ds-mono" style="font-size:10px">nexus/${escapeHtml(n.target.system)} · ${escapeHtml(n.status)}${n.applyId ? ` · gate apply ${escapeHtml(n.applyId)}` : ''}${n.approvedBy ? ` · approved by ${escapeHtml(n.approvedBy)}` : ''}${n.status === 'applied' ? ' · revert rolls that apply back' : ''}</div>`;
    return;
  }
  const g = gate || {};
  const plan = g.plan || { ok: false, errors: ['no preview'], conflicts: [] };
  const problems = [...(plan.errors || []), ...(plan.conflicts || []).map(c => `CONFLICT ${c.path}: ${c.why}`)];
  if ((plan.errors || []).length) btn.disabled = true;
  const diff = String(g.diff || '').split('\n').map(l => `<div style="color:${l.startsWith('+') ? 'var(--good,#4ade80)' : l.startsWith('-') ? 'var(--bad,#f87171)' : 'inherit'}">${escapeHtml(l)}</div>`).join('');
  el.innerHTML = `<div style="border:1px solid var(--accent,#38bdf8);border-radius:3px;padding:8px;font-size:10px">
      <div style="font-weight:600;margin-bottom:4px">approval needed — ${g.creates ? 'creates' : 'changes'} <span class="ds-mono">${escapeHtml(g.path || n.path)}</span> in the live Nexus tree (system <b>${escapeHtml(g.system || n.target.system)}</b>)</div>
      <div style="opacity:.7;margin-bottom:6px">approve writes it through the apply gate (recorded, revertible), snapshots, and resyncs nexus/${escapeHtml(g.system || n.target.system)}. ${NEXUS_APPROVAL_QUEUE.length ? `${NEXUS_APPROVAL_QUEUE.length} more waiting.` : ''}</div>
      ${problems.length ? `<div style="color:var(--bad,#f87171);margin-bottom:6px">${problems.map(escapeHtml).join('<br>')}</div>` : `<div style="color:var(--good,#4ade80);margin-bottom:6px">gate plan: ok</div>`}
      <div class="ds-mono" style="max-height:24vh;overflow:auto;white-space:pre;font-size:10px">${diff || '<span style="opacity:.6">(no line changes)</span>'}</div>
    </div>`;
}
function closeInjectEditor() { document.getElementById('inject-editor-modal').classList.remove('open'); INJECT_EDITOR_ID = null; setTimeout(_nexusApprovalNext, 0); }
function toggleInjectCurrent() { const c = document.getElementById('inj-ed-current'); c.style.display = c.style.display === 'none' ? '' : 'none'; }

async function saveInjectEditor(andApply = false) {
  if (!CURRENT_API_REPO) return;
  const uuid = CURRENT_API_REPO.uuid;
  const content = document.getElementById('inj-ed-content').value;
  try {
    let id = INJECT_EDITOR_ID;
    if (!id) {
      const r = await api(`/api/repos/${uuid}/injects`, { method: 'POST', body: JSON.stringify({ path: INJECT_EDITOR_PATH, content }) });
      id = r.inject.uuid; INJECT_EDITOR_ID = id;
    } else {
      await api(`/api/repos/${uuid}/injects/${id}`, { method: 'PUT', body: JSON.stringify({ content }) });
    }
    if (andApply) return agentInjectAction(id, 'apply');
    toast('saved', 'ok'); renderRepoAgent(CURRENT_API_REPO); openInjectEditor(id);
  } catch (e) { toast(`save failed: ${e.message}`, 'err'); }
}

function agentClearTranscript() {
  if (!CURRENT_API_REPO) return;
  AGENT_TRANSCRIPT.set(CURRENT_API_REPO.uuid, []);
  renderRepoAgent(CURRENT_API_REPO);
}

// Teaching is a `correction` by default — it came from the person, and the
// persona ranks a correction above anything the agent concluded itself.
async function agentTeach() {
  if (!CURRENT_API_REPO) return;
  const text = await themedPrompt('what should this agent know about this project?', 'teach the agent');
  if (!text) return;
  try {
    const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/memory`, {
      method: 'POST', body: JSON.stringify({ kind: 'correction', text, source: 'james' }),
    });
    toast(r.hatUpdated ? 'learned — persona updated' : `stored, but persona not updated: ${r.reason || 'unknown'}`, r.hatUpdated ? 'ok' : 'err');
    renderRepoAgent(CURRENT_API_REPO);
  } catch (e) { toast(`teach failed: ${e.message}`, 'err'); }
}

// Export writes two real node files: the .hat (hat-forge's own envelope,
// unchanged) and the .agent bundle — hat definition + every learned
// observation + the exchange log. That bundle is what makes this agent
// portable between machines.
async function agentExport() {
  if (!CURRENT_API_REPO) return;
  try {
    const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/export`, { method: 'POST', body: JSON.stringify({}) }, 30000);
    toast(`exported — ${r.observations} observation(s), ${r.exchanges} exchange(s)`, 'ok');
    // The paths are the point of the action, so they go in the transcript
    // rather than a toast that vanishes before it can be copied.
    _agentTranscript(CURRENT_API_REPO.uuid).push({
      role: 'export', text: `${r.agentFile}\n${r.hatFile}`,
      meta: `${r.observations} observations · ${r.exchanges} exchanges`,
    });
    renderRepoAgent(CURRENT_API_REPO);
  } catch (e) { toast(`export failed: ${e.message}`, 'err'); }
}

// Import merges rather than replaces — an observation this repo already
// holds has its occurrences summed, so importing twice does not double a
// project's memory. The persona is re-grounded against THIS machine's
// index, never the exported string, which described a different tree.
async function agentImport() {
  if (!CURRENT_API_REPO) return;
  const filePath = await themedPrompt('path to an .agent file:', 'import agent');
  if (!filePath) return;
  try {
    const r = await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/import`, { method: 'POST', body: JSON.stringify({ filePath }) }, 30000);
    toast(`imported — ${r.restored} new, ${r.merged} merged${r.rejected ? `, ${r.rejected} rejected` : ''}`, 'ok');
    if (!r.personaRegrounded) toast(`persona not re-grounded: ${r.personaReason || 'unknown'}`, 'err');
    renderRepoAgent(CURRENT_API_REPO);
  } catch (e) { toast(`import failed: ${e.message}`, 'err'); }
}

async function agentForget(obsUuid) {
  if (!CURRENT_API_REPO) return;
  try {
    await api(`/api/repos/${CURRENT_API_REPO.uuid}/agent/memory/${obsUuid}`, { method: 'DELETE' });
    renderRepoAgent(CURRENT_API_REPO);
  } catch (e) { toast(`forget failed: ${e.message}`, 'err'); }
}

// §NEW 2026-09-17 — repo.fork existed as a real API endpoint
// (idearium/interaction-contract.json's repo.fork) with no UI ever
// wired to it.
async function forkApiRepo(uuid) {
  const repo = API_REPOS.find(r => r.uuid === uuid);
  const name = await themedPrompt(`name for the fork (forking "${repo?.name||uuid}"):`, 'fork repo');
  if (!name) return;
  try {
    const r = await api(`/api/repos/${uuid}/fork`, { method: 'POST', body: JSON.stringify({ name }) });
    toast(`forked → ${name}`, 'ok');
    await loadApiRepos();
    renderRepoLibrary();
    if (r && r.repo && r.repo.uuid) selectApiRepo(r.repo.uuid);
  } catch (e) { toast(`fork failed: ${e.message}`, 'err'); }
}

// ════════════════════════════════════════════════════
// API REPO FILE EDITOR — real read/write against a materialized repo,
// via GET/POST/DELETE /api/repos/:uuid/file. Separate from openFile()
// above, which is the read-only local-folder (File System Access) browser
// — this is the API-backed path with actual save/add/delete.
// ════════════════════════════════════════════════════
let CURRENT_API_REPO = null;
let ACTIVE_API_FILE = null;
let API_FILE_DIRTY = false;

function _showIdeEditor(show) {
  document.getElementById('ide-code').style.display = show ? 'none' : '';
  document.getElementById('ide-editor').style.display = show ? '' : 'none';
}

async function openApiRepoFile(repoUuid, filePath) {
  if (API_FILE_DIRTY && !confirm(`discard unsaved changes to ${ACTIVE_API_FILE}?`)) return;
  ACTIVE_API_FILE = filePath;
  API_FILE_DIRTY = false;
  renderApiRepoPanel(CURRENT_API_REPO);
  document.getElementById('ide-tabs').innerHTML = `${escapeHtml(filePath)}` +
    `<span class="ide-tab-dirty" id="ide-dirty" style="display:none">● unsaved</span>` +
    `<button class="ide-tab-btn" onclick="saveApiRepoFile()">save</button>` +
    `<button class="ide-tab-btn ide-manage-btn" onclick="openManagePanel()" title="hand this file (or the selected lines) to the repo's agent: expand, iterate, refactor, rebuild, debug, test, document, review, explain">manage ▾</button>`;
  // §0.39.280 BS8 — a file that exists only as a proposal: show the proposal, read-only
  const _fs = typeof fileStateOf === 'function' ? fileStateOf(filePath) : null;
  if (_fs && _fs.state === 'pending' && _fs.pending && _fs.pending.length) {
    try {
      const inj = await api(`/api/repos/${repoUuid}/injects/${encodeURIComponent(_fs.pending[0])}`, {}, 15000);
      const node = inj.inject || inj;
      _showIdeEditor(false);
      document.getElementById('ide-code').textContent = `// PENDING — this file exists only as a proposal (${_fs.pending[0]}); approve it in the Agent tab\n\n${node.content || ''}`;
    } catch (e) { _showIdeEditor(false); document.getElementById('ide-code').textContent = `// pending proposal ${_fs.pending[0]} could not be read: ${e.message}`; }
    return;
  }
  // §TIMEOUT FIX 2026-07-15 — file reads share the repo's own spec-engine
  // manifest with whatever chunk-import is currently running (completeChunk
  // does synchronous readFileSync/writeFileSync per chunk — see
  // spec-engine/index.js), so a read hitting mid-build genuinely can take
  // longer than the API's general 6s default. 15s ceiling, plus one retry
  // specifically on an aborted/timed-out request (not on a real 404 or
  // other server error — those won't succeed on retry and shouldn't wait
  // an extra 15s to say so).
  const attempt = () => api(`/api/repos/${repoUuid}/file?path=${encodeURIComponent(filePath)}`, {}, 15000);
  try {
    let r;
    try {
      r = await attempt();
    } catch (e) {
      const isAbort = /aborted/i.test(e.message);
      if (!isAbort) throw e;
      console.warn(`[idearium] file read aborted (likely contended with an in-progress build), retrying once: ${filePath}`);
      r = await attempt();
    }
    _showIdeEditor(true);
    const ta = document.getElementById('ide-editor');
    ta.value = r.content;
    // 0.39.284 — an empty file a code build has not written yet: say so, with its chunk's state, instead of a blank editor
    if (!r.content) {
      const specUuid = CURRENT_API_REPO && (CURRENT_API_REPO.specUuid || CURRENT_API_REPO.promotedFromSpec);
      if (specUuid) {
        try {
          const s = await api(`/api/spec-engine/specs/${specUuid}`, {}, 15000);
          const m = s.manifest || s.spec || s;
          const ch = (m.chunks || []).find(c => c.file && c.file.path === filePath);
          if (ch && ch.status !== 'complete') {
            _showIdeEditor(false);
            document.getElementById('ide-code').textContent = `// not built yet — its chunk is ${ch.status}${(ch.failureMode || ch.error) ? ` (${ch.failureMode || ch.error})` : ''}.\n// The Plan panel shows the build; "build the rest / retry" runs it again.`;
            if (typeof openPlanPanel === 'function') openPlanPanel();
            return;
          }
        } catch (_) { /* the editor stays empty */ }
      }
    }
    ta.oncancel = null;
    ta.oninput = () => { API_FILE_DIRTY = true; const d = document.getElementById('ide-dirty'); if (d) d.style.display = ''; };
  } catch (e) {
    _showIdeEditor(false);
    document.getElementById('ide-code').textContent = `// could not read file: ${e.message}`;
  }
}

async function saveApiRepoFile() {
  if (!CURRENT_API_REPO || !ACTIVE_API_FILE) return;
  const content = document.getElementById('ide-editor').value;
  try {
    await api(`/api/repos/${CURRENT_API_REPO.uuid}/file`, {
      method: 'POST', body: JSON.stringify({ path: ACTIVE_API_FILE, content }),
    });
    API_FILE_DIRTY = false;
    const d = document.getElementById('ide-dirty'); if (d) d.style.display = 'none';
    toast(`saved ${ACTIVE_API_FILE}`, 'ok');
    await loadApiRepos();
    const fresh = API_REPOS.find(r => r.uuid === CURRENT_API_REPO.uuid);
    if (fresh) { CURRENT_API_REPO = fresh; renderApiRepoPanel(fresh); }
  } catch (e) { toast(`save failed: ${e.message}`, 'err'); }
}

// §EXPORT 2026-07-18 — "the export, needs to be the .spec file compressed
// repo." Real zip (application/zip, not JSON), so this bypasses api()'s
// JSON-parsing wrapper and goes through fetchTimeout directly — same
// pattern the legacy exportSpec() already used for its markdown download.
// 20s ceiling: a 71-spec / 1000+ chunk instance building this archive
// server-side is real work, not just a network round-trip.
async function exportApiRepo() {
  if (!CURRENT_API_REPO) { toast('no repo loaded — open one first', 'err'); return; }
  toast('exporting…', 'ok');
  try {
    const r = await fetchTimeout(API_BASE + `/api/repos/${CURRENT_API_REPO.uuid}/export`, {}, 20000);
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const blob = await r.blob();
    const cd = r.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `${(CURRENT_API_REPO.name || 'repo').replace(/[^a-z0-9-_]+/gi, '_')}.zip`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`exported ${filename}`, 'ok');
  } catch (e) {
    toast(`export failed: ${e.message}`, 'err');
  }
}

async function addApiRepoFile(repoUuid) {
  const filePath = await themedPrompt('new file path (e.g. src/notes.md):', 'add file');
  if (!filePath) return;
  try {
    await api(`/api/repos/${repoUuid}/file`, {
      method: 'POST', body: JSON.stringify({ path: filePath, content: '' }),
    });
    toast(`created ${filePath}`, 'ok');
    await loadApiRepos();
    const fresh = API_REPOS.find(r => r.uuid === repoUuid);
    if (fresh) { CURRENT_API_REPO = fresh; renderApiRepoPanel(fresh); }
    openApiRepoFile(repoUuid, filePath);
  } catch (e) { toast(`create failed: ${e.message}`, 'err'); }
}

async function deleteApiRepoFile(repoUuid, filePath) {
  if (!confirm(`delete ${filePath}? (moved to .trash/, not permanently erased — §7.4)`)) return;
  try {
    await api(`/api/repos/${repoUuid}/file?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
    toast(`deleted ${filePath}`, 'ok');
    if (ACTIVE_API_FILE === filePath) { ACTIVE_API_FILE = null; _showIdeEditor(false); document.getElementById('ide-tabs').textContent = 'no file open'; document.getElementById('ide-code').textContent = '// click a file in the tree to open it here'; }
    await loadApiRepos();
    const fresh = API_REPOS.find(r => r.uuid === repoUuid);
    if (fresh) { CURRENT_API_REPO = fresh; renderApiRepoPanel(fresh); }
  } catch (e) { toast(`delete failed: ${e.message}`, 'err'); }
}

// §BUILT 2026-09-15 — archives a RepoLayer repo via the same DELETE
// /api/repos/:uuid → repo.archive the API has already routed since the v2
// redesign (see idearium/api/index.js's dynRoutes) — soft-delete only,
// status flips to 'archived' and it drops out of the default repo list;
// nothing on disk is touched (§7.4). No prior UI path called this at all.
// §RENAMED 2026-09-20 — "archive" became "delete": a styled type-to-confirm
// modal instead of a browser confirm(), lands back on the repo library
// (exitRepoDetail()) instead of leaving a stale detail panel open on a
// repo that no longer exists. Same real endpoint underneath (DELETE
// /api/repos/:uuid, still route id repo.archive server-side — unchanged,
// this is a UI rename only).
function openDeleteRepoModal() {
  if (!CURRENT_API_REPO) { toast('no repo loaded — open one first', 'err'); return; }
  document.getElementById('delete-repo-name').textContent = CURRENT_API_REPO.name;
  const input = document.getElementById('delete-repo-confirm-input');
  input.value = '';
  document.getElementById('delete-repo-confirm-btn').disabled = true;
  document.getElementById('delete-repo-modal').classList.add('open');
  input.focus();
}
function closeDeleteRepoModal() {
  document.getElementById('delete-repo-modal').classList.remove('open');
}
function _onDeleteRepoInput() {
  const ok = document.getElementById('delete-repo-confirm-input').value.trim().toLowerCase() === 'delete';
  document.getElementById('delete-repo-confirm-btn').disabled = !ok;
}
async function confirmDeleteRepo() {
  if (!CURRENT_API_REPO) return;
  const uuid = CURRENT_API_REPO.uuid;
  const name = CURRENT_API_REPO.name;
  try {
    const r = await api(`/api/repos/${uuid}`, { method: 'DELETE' });
    closeDeleteRepoModal();
    exitRepoDetail(); // lands back on the main repo library, not a dead detail panel
    await loadApiRepos();
    // §0.39.280 BS15 — a code repo's original is told (server: _codeRepoRetired); say so, and re-read the specs so its
    // "generate code" is offered again instead of "open the code" pointing at nothing
    const o = r && r.original;
    if (o) { try { await loadSpecs(); } catch (_) {} }
    toast(`deleted "${name}"${o ? ` — ${o.of ? `"${o.of.name}" knows` : 'its spec knows'}: Code can build a new one${o.worktree && o.worktree.ok ? ` · worktree removed, branch ${o.worktree.branch} kept` : ''}` : ''}`, 'ok');
  } catch (e) {
    toast('delete failed: ' + e.message, 'err');
  }
}

async function pickLocalRepo() {
  try {
    if (!window.showDirectoryPicker) { toast('your browser does not support folder access — try Chrome/Edge','err'); return; }
    const dirHandle = await window.showDirectoryPicker();
    REPO_FILES = [];
    await walkDir(dirHandle, '');
    document.getElementById('repo-badge').textContent = `${REPO_FILES.length} files loaded`;
    renderFileTree();
    toast(`loaded ${REPO_FILES.length} files from ${dirHandle.name}`,'ok');
  } catch(e) { if (e.name !== 'AbortError') toast(e.message,'err'); }
}

// Drag-and-drop ingest → POST /api/repos (RepoLayer: each dropped repo
// becomes its own tracked idea+spec, not folded into the open local folder).
(function wireRepoDropzone(){
  const zone = document.getElementById('file-tree');
  if (!zone) return;
  ['dragover','dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.style.outline = '1px dashed var(--accent, #5af)'; }));
  ['dragleave','drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.style.outline = ''; }));
  zone.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) ingestDroppedFiles(e.dataTransfer.files); });
})();

async function ingestDroppedFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  try {
    const payload = await Promise.all(files.map(f => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve({ path: f.name, bytes: f.size, content: r.result });
      r.onerror = reject;
      r.readAsText(f);
    })));
    const name = files.length === 1 ? files[0].name.replace(/\.[^/.]+$/, '') : `drop-${Date.now()}`;
    const res = await api('/api/repos', { method: 'POST', body: JSON.stringify({ name, files: payload, source: 'drop', ideaUuid: CURRENT_REPO_IDEA }) });
    toast(`ingested "${name}" as repo (${payload.length} file${payload.length>1?'s':''})${CURRENT_REPO_IDEA?' — attached to this idea':''}`, 'ok');
    await loadApiRepos();
    if (CURRENT_REPO_IDEA) { const r = API_REPOS.find(x=>x.ideaUuid===CURRENT_REPO_IDEA); renderApiRepoPanel(r); }
  } catch (e) { toast(`ingest failed: ${e.message}`, 'err'); }
}
async function walkDir(dirHandle, prefix) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = prefix ? prefix + '/' + name : name;
    if (handle.kind === 'file') REPO_FILES.push({ path:p, handle });
    else await walkDir(handle, p);
  }
}
function buildTree(files) {
  const root = {};
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i=0;i<parts.length;i++) {
      const part = parts[i];
      if (i === parts.length-1) { node[part] = { __file: f }; }
      else { node[part] = node[part] || {}; node = node[part]; }
    }
  }
  return root;
}
function renderFileTree() {
  const tree = document.getElementById('file-tree');
  if (!REPO_FILES.length) { tree.innerHTML = `<div class="repo-empty">no repository loaded<br><br><button class="modal-btn confirm" onclick="pickLocalRepo()">open local nexus folder</button></div>`; return; }
  const root = buildTree(REPO_FILES);
  tree.innerHTML = renderTreeNode(root, 0);
}
function renderTreeNode(node, depth) {
  let html = '';
  const keys = Object.keys(node).sort((a,b)=>{
    const aDir = !node[a].__file, bDir = !node[b].__file;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const val = node[key];
    const indent = `<span class="tree-indent" style="width:${depth*14}px"></span>`;
    if (val.__file) {
      const f = val.__file;
      html += `<div class="tree-node file${ACTIVE_FILE===f.path?' active':''}" onclick="openFile('${f.path.replace(/'/g,"\\'")}')">${indent}📄 ${escapeHtml(key)}</div>`;
    } else {
      html += `<div class="tree-node dir">${indent}📁 ${escapeHtml(key)}</div>` + renderTreeNode(val, depth+1);
    }
  }
  return html;
}
async function openFile(path) {
  const entry = REPO_FILES.find(f=>f.path===path);
  if (!entry) return;
  ACTIVE_FILE = path;
  renderFileTree();
  document.getElementById('ide-tabs').textContent = path;
  try {
    const file = await entry.handle.getFile();
    if (file.size > 400000) { document.getElementById('ide-code').textContent = `// file too large to preview inline (${file.size} bytes)`; return; }
    const text = await file.text();
    const lines = text.split('\n');
    document.getElementById('ide-code').innerHTML = lines.map((l,i)=>`<span class="ln">${i+1}</span>${escapeHtml(l)}`).join('\n');
  } catch(e) {
    document.getElementById('ide-code').textContent = `// could not read file: ${e.message}`;
  }
}

// ════════════════════════════════════════════════════
// VERSIONIUM — real snapshot history (commitId, tensionMap, phaseMap, snr)
// ════════════════════════════════════════════════════
function renderVersionium() {
  // §REMOVED 2026-09-20 — the Versionium tab is gone; doSnapshot()/
  // loadSnapshots() still populate SNAPSHOTS for real (a repo's Phasemap
  // subtab and other future consumers can read the array directly), this
  // function just has nothing left to render into. Guarded, not deleted —
  // loadSnapshots() and the bulk-refresh line still call it.
  const list = document.getElementById('commit-list');
  if (!list) return;
  if (!SNAPSHOTS.length) { list.innerHTML = `<div class="detail-empty">${CONNECTED?'no snapshots yet — push one from the Ideas view':'not connected to nexus'}</div>`; return; }
  list.innerHTML = SNAPSHOTS.map(s => `
    <div class="commit-card" onclick="selectSnapshot('${s.uuid}')">
      <div class="commit-id">${s.commitId} <span style="color:var(--text3)">· ${s.branch||'main'}</span></div>
      <div class="commit-msg">${escapeHtml(s.message)}</div>
      <div class="commit-stats">
        <span>${new Date(s.ts).toLocaleString()}</span>
        <span>${s.ideasCount} ideas</span>
        <span>${s.gapCount} open gaps</span>
        <span>${s.specCount} specs</span>
        <span style="color:${s.snrDelta>0?'var(--mint)':s.snrDelta<0?'var(--coral)':'var(--text3)'}">snr ${s.snr!=null?s.snr.toFixed?s.snr.toFixed(2):s.snr:'—'} (${s.snrDelta>0?'+':''}${s.snrDelta||0})</span>
      </div>
    </div>
  `).join('');
}
function selectSnapshot(uuid) {
  SELECTED_SNAP = uuid;
  const s = SNAPSHOTS.find(x=>x.uuid===uuid);
  if (!s) return;
  const area = document.getElementById('versionium-detail');
  if (!area) return; // §REMOVED 2026-09-20 — see renderVersionium()'s own note
  const phaseRows = Object.entries(s.phaseMap||{}).map(([p,n])=>`<div class="pend-row" style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--b0)"><span style="font-family:var(--mono);font-size:9px;color:var(--text3)">${p}</span><span style="font-family:var(--mono);font-size:10px">${n}</span></div>`).join('');
  const tensionRows = Object.entries(s.tensionMap||{}).slice(0,12).map(([uuid,t])=>{
    const idea = IDEAS.find(i=>i.uuid===uuid);
    return `<div class="link-item"><span>${escapeHtml(idea?(idea.text||'').slice(0,28):uuid.slice(0,8))}</span><span style="margin-left:auto;font-family:var(--mono);font-size:10px">${(t*100).toFixed(0)}%</span></div>`;
  }).join('');
  area.innerHTML = `
    <div class="ds"><div class="ds-label">commit</div><div class="ds-mono">${s.commitId}\nbranch ${s.branch||'main'}\nparent ${s.parentId?s.parentId.slice(0,8):'—'}\n${new Date(s.ts).toLocaleString()}</div></div>
    <div class="ds"><div class="ds-label">message</div><div class="ds-value">${escapeHtml(s.message)}</div></div>
    <div class="ds"><div class="ds-label">phase distribution</div>${phaseRows||'<span style="color:var(--text3);font-size:10px">—</span>'}</div>
    <div class="ds"><div class="ds-label">tension at commit</div>${tensionRows||'<span style="color:var(--text3);font-size:10px">—</span>'}</div>
    <div class="ds"><div class="ds-label">actions</div><div class="action-row"><button class="action-btn primary" onclick="diffWithPrevious('${s.uuid}')">diff vs parent</button></div></div>
  `;
}
async function diffWithPrevious(uuid) {
  const s = SNAPSHOTS.find(x=>x.uuid===uuid);
  if (!s || !s.parentId) { toast('no parent snapshot to diff against','err'); return; }
  try {
    const res = await api(`/api/snapshots/${s.parentId}/diff/${uuid}`);
    toast('diff loaded — see console','ok');
    console.log('snapshot diff', res);
  } catch(e) { toast(e.message,'err'); }
}

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg, type='ok') {
  const area = document.getElementById('toast-area');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = msg;
  area.appendChild(div);
  setTimeout(()=>div.remove(), 2800);
}

// §BUILT 2026-09-20 — James: "the ui needs to use a toast to show progress
// like a loading bar." Real chunk-progress events (idearium.repo.chunk.
// progress, spec-engine/index.js's completeChunk — see that file for the
// server side) update ONE toast element in place, keyed by repoUuid, so a
// multi-minute import shows real, live percentage instead of a single
// "working…" message that could be a stall or genuine slow progress —
// indistinguishable before this fix.
const _progressToasts = new Map(); // repoUuid -> {div, fill, label}
function toastProgress(id, label, pct) {
  const area = document.getElementById('toast-area');
  let entry = _progressToasts.get(id);
  if (!entry) {
    const div = document.createElement('div');
    div.className = 'toast progress ok';
    div.innerHTML = `<div class="toast-progress-label"></div><div class="toast-progress-bar"><div class="toast-progress-fill"></div></div>`;
    area.appendChild(div);
    entry = { div, label: div.querySelector('.toast-progress-label'), fill: div.querySelector('.toast-progress-fill') };
    _progressToasts.set(id, entry);
  }
  entry.label.textContent = label;
  entry.fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}
function toastProgressDone(id, msg, type='ok') {
  const entry = _progressToasts.get(id);
  if (entry) { entry.div.remove(); _progressToasts.delete(id); }
  toast(msg, type);
}

// §BUILT 2026-09-20 — the real, run-scoped stages of idearium/repo/
// import-pipeline.js, per pipeline-events.js's own PIPELINE_EVENTS
// catalog (source of truth — kept in the same order, same 6 run-scoped
// stages; per-file parse:file:* deliberately excluded here, same
// flood-control reasoning that file's own header already states).
const _repoPipelineStage = {
  'repository:import:start':  { label: 'starting import…',              pct: 2   },
  'parse:batch:complete':     { label: 'parsed files',                  pct: 20  },
  'atlas:build:start':        { label: 'building atlas…',               pct: 25  },
  'atlas:build:complete':     { label: 'atlas built',                   pct: 40  },
  'chunk:decompose:start':    { label: 'chunking…',                     pct: 45  },
  'chunk:decompose:complete': { label: 'chunked',                       pct: 65  },
  'chunk:glyphs:complete':    { label: 'glyphs written',                pct: 70  },   // 0.39.261
  'chunk:verify:complete':    { label: 'verified',                      pct: 80  },
  'index:build:complete':     { label: 'index built',                   pct: 90  },
  'graph:build:complete':     { label: 'code graph built',              pct: 96  },
  'spec:graph:complete':      { label: 'spec graph built',              pct: 98  },
  'spec:graph:failed':        { label: 'spec graph failed',             pct: 98  },
};
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeModal(); closeNewSpecModal(); closeUploadProjectModal(); }
  if ((e.metaKey||e.ctrlKey) && e.key==='n') { e.preventDefault(); setView('ideas'); openModal(); }
});

// ════════════════════════════════════════════════════
// §REMOVED 2026-09-20 — the flat Projects shelf (GET/POST /api/projects,
// its own tab) is gone from this UI. formatBytes() stays: the Upload
// Project modal (openUploadProjectModal, unrelated feature) still uses
// it. The backend routes themselves are untouched — this is a UI-only
// removal, not a route removal.
// ════════════════════════════════════════════════════

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/(1024*1024)).toFixed(1)} MB`;
}

// ════════════════════════════════════════════════════
// NEXUS URI DEEP LINK — the idearium-side half of lib/nexus-uri.js's
// 'repo' and 'repo-chunk' routes. Electron's main process resolves the
// nexus:// URI and validates the uuid shape (see that file's header);
// this page's job is only the second half — turning a validated
// ?repo=/&chunk= query param into the same real navigation a user
// clicking "open repository →" already produces. Built on the existing
// functions exactly as they are: openRepoFor(ideaUuid, specUuid, label)
// and openApiRepoFile(repoUuid, filePath) — no new UI concept invented.
// §HONEST — if the repo isn't in this session's already-loaded
// API_REPOS (a real repo that was deleted, or a uuid for a repo that
// never existed), this warns and does nothing further; it does not
// fabricate a repo-shaped placeholder to open.
const NEXUS_URI_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handleNexusDeepLink() {
  const p = new URLSearchParams(location.search);
  const repoUuid = p.get('repo');
  if (!repoUuid || !NEXUS_URI_UUID_RE.test(repoUuid)) return;

  await loadApiRepos();
  const repo = API_REPOS.find(r => r.uuid === repoUuid);
  if (!repo) { console.warn(`[idearium] nexus:// deep link: repo not found in this session: ${repoUuid}`); return; }
  openRepoFor(repo.ideaUuid, repo.specUuid, repo.name);

  const chunkUuid = p.get('chunk');
  if (!chunkUuid || !NEXUS_URI_UUID_RE.test(chunkUuid)) return;
  try {
    const r = await api(`/api/repos/${repoUuid}/chunk/${chunkUuid}`);
    if (r.filePath) await openApiRepoFile(repoUuid, r.filePath);
    else console.warn(`[idearium] nexus:// deep link: chunk ${chunkUuid} has no readable file (${r.readError || 'unknown'})`);
  } catch (e) {
    console.warn(`[idearium] nexus:// deep link: chunk lookup failed: ${e.message}`);
  }
}

// ════════════════════════════════════════════════════
// INIT — no seed data. Connect to real nexus, render empty states until then.
// ════════════════════════════════════════════════════
window.addEventListener('load', () => {
  renderIdeaList(); renderVersionium(); renderBrainstorms();
  updateStats();
  nexusConnect();
  handleNexusDeepLink();
  setInterval(() => { if (CONNECTED) loadStats(); else nexusConnect(); }, 15000);
});

// ── 0.39.264 — a new Eravos organism starts here, as an idea or a spec ─────
// James: "instead of download, it should create a idea or spec for a new
// organism." Eravos (Build › Eravos, an iframe) posts { type:
// 'nexus:organism.create', mode:'idea'|'spec', organism, text, tags }; only a
// message from that frame is taken. The idea is made with Idearium's own API;
// for 'spec' the New Spec dialog opens filled in and linked to the idea, so the
// spec, its repo and its compartment are made exactly as any other spec's are.
window.addEventListener('message', async (ev) => {
  const d = ev.data;
  if (!d || d.type !== 'nexus:organism.create') return;
  const frame = document.getElementById('eravos-frame');
  if (!frame || ev.source !== frame.contentWindow) { console.warn('[idearium] organism.create ignored: not from the Eravos frame'); return; }
  const o = d.organism || {};
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(o.id || ''))) { toast('Eravos sent an organism without a valid id', 'err'); return; }
  try {
    const r = await api('/api/ideas', { method: 'POST', body: JSON.stringify({ text: String(d.text || `ERAVOS ${d.kind || 'organism'}: ${o.label} (${o.id})`), tags: Array.isArray(d.tags) ? d.tags.slice(0, 12) : ['eravos', 'organism'] }) });
    const idea = r.idea;
    await loadIdeas();
    if (d.mode === 'spec') {
      await openNewSpecModal({ name: o.label || o.id, description: String(d.text || ''), ideaUuid: idea && idea.uuid });
      toast(`${o.label || o.id}: idea made — finish the spec in the dialog`, 'ok');
    } else {
      setView('ideas');
      if (idea) selectIdea(idea.uuid);
      toast(`${o.label || o.id}: new idea in Create › Ideas`, 'ok');
    }
  } catch (e) { toast(`could not create the ${d.kind || 'organism'} idea: ${e.message}`, 'err'); }
});


// ════════════════════════════════════════════════════
// §0.39.284 W7 — THE REPO'S COMPONENT REGISTRY (Architect tab). James: "the architect tab should be the component
// registry and loom style map for the wiring … ids, types, relation, consumers, orphans, node types, data dir, full
// architecture map". GET /api/repos/:uuid/architecture (idearium/repo/architecture.js over lib/code-intel) — loom's
// shape: components, export/import hooks, wires. The map: one column per layer, bottom-up, a line per wire.
// ════════════════════════════════════════════════════
const ARCHREG = { uuid: null, data: null, q: '', sel: null, group: null, tab: 'inspect', canvas: null, repo: null, bp: null, sysOf: null, sysStats: {} };
const ARCH_BANDS = { foundation: '#00ff88', library: '#00d4ff', api: '#ffcc00', cli: '#ff6b35', automation: '#cc44ff', ui: '#ff66aa', test: '#5f7f9b' };
const ARCH_MAX = 2500;  // §0.39.300 AZ1 — the systems level carries the overview, so the map holds far more; past this the filter narrows it, and the map says so
const ARCH_SYS_COLORS = ['#00d4ff', '#00ff88', '#ffcc00', '#cc44ff', '#ff6b35', '#ff66aa', '#4fc3ff', '#9dff6b', '#ffd86b', '#b98cff'];
/** _archSystemOf(files) → (file) → system: a repo's systems are its top-level folders — one folder deeper when one folder holds most of it */
function _archSystemOf(files) {
  const top = (f) => f.includes('/') ? f.split('/')[0] : '(root)';
  const counts = {}; for (const f of files) counts[top(f)] = (counts[top(f)] || 0) + 1;
  const big = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (big && big[0] !== '(root)' && big[1] / files.length >= 0.8) {
    const deep = (f) => { const p = f.split('/'); return p[0] === big[0] && p.length > 2 ? `${p[0]}/${p[1]}` : top(f); };
    return deep;
  }
  return top;
}
async function renderRepoRegistry(repo) {
  const el = document.getElementById('repo-arch-registry'); if (!el) return;
  if (ARCHREG.uuid !== repo.uuid) { if (ARCHREG.canvas) ARCHREG.canvas.destroy(); Object.assign(ARCHREG, { uuid: repo.uuid, data: null, q: '', sel: null, tab: 'inspect', canvas: null, bp: null }); }
  ARCHREG.repo = repo;
  if (ARCHREG.canvas) { ARCHREG.canvas.destroy(); ARCHREG.canvas = null; }
  el.innerHTML = `<div class="ax">
    <div class="ra-map" id="ra-map" aria-label="the wiring map — drag to pan, wheel to zoom, f to fit"></div>
    <div class="ra-state" id="ra-state"><b>READING THE WIRING</b><p>THE REPO'S COMPONENTS, WIRES, CONSUMERS AND ORPHANS, FROM ITS CODE.</p></div>
    <div class="ra-top hidden" id="ra-top">
      <div class="ax-stats" id="ra-stats"></div>
      <div class="ax-row"><input class="ax-field" id="ra-q" placeholder="FILTER — ID, FILE, LAYER, EXPORT" aria-label="filter" value="${escapeHtml(ARCHREG.q)}"><span class="ax-legend" id="ra-shown"></span></div>
      <div class="ax-legend">CYAN REQUIRES · <span class="p">MAGENTA DASHED EVENTS</span> · <span class="r">RED A BOTTOM-UP BREACH</span> · DASHED EDGE AN ORPHAN · SELECT ONE: <span class="y">WHAT IT NEEDS</span> · <span class="p">WHAT NEEDS IT</span></div>
    </div>
    <aside class="ax-drawer r shut" id="ra-side" aria-label="inspector, lists and blueprint">
      <div class="ax-dhead"><span class="ax-dtitle" id="ra-side-title">INSPECTOR</span><button class="ax-x" onclick="archDrawer(false)" title="CLOSE">✕</button></div>
      <div class="ax-tabs" role="tablist">
        <button class="ax-tab" data-ratab="inspect" role="tab" title="THE SELECTED COMPONENT">INSPECTOR</button>
        <button class="ax-tab" data-ratab="lists" role="tab" title="ORPHANS, BREACHES, PACKAGES, ROUTES AND CLI, EVENTS, DATA">LISTS</button>
        <button class="ax-tab" data-ratab="blueprint" role="tab" title="THE REPO'S SPEC, CHUNK BY CHUNK">BLUEPRINT</button>
      </div>
      <div class="ax-dbody" id="ra-body"></div>
    </aside>
    <nav class="ax-toolbar" aria-label="tools">
      <button class="ax-tool" onclick="archTool('fit')" title="FIT THE WHOLE MAP (F)"><b>⤢</b>FIT</button>
      <button class="ax-tool" onclick="archTool('out')" title="ONE INCREMENT OUT (−)"><b>−</b>OUT</button>
      <button class="ax-tool" onclick="archTool('in')" title="ONE INCREMENT IN (+)"><b>+</b>IN</button>
      <span class="ax-sep"></span>
      <button class="ax-tool" data-ralvl="systems" onclick="archTool('lvl-systems')" title="EACH SYSTEM ONE NODE — THE WIRES BETWEEN SYSTEMS SUMMED (1)"><b>◇</b>SYSTEMS</button>
      <button class="ax-tool" data-ralvl="components" onclick="archTool('lvl-components')" title="EACH SYSTEM A REGION, ITS COMPONENTS INSIDE (2)"><b>◈</b>COMPONENTS</button>
      <button class="ax-tool" data-ralvl="detail" onclick="archTool('lvl-detail')" title="FULL CARDS (3)"><b>▣</b>DETAIL</button>
      <button class="ax-tool" onclick="archTool('arrange')" title="LAY THE MAP OUT AGAIN — BOTTOM-UP, FEWEST CROSSINGS"><b>⊞</b>ARRANGE</button>
      <span class="ax-sep"></span>
      <button class="ax-tool" data-ratool="inspect" onclick="archTool('inspect')" title="THE INSPECTOR — THE SELECTED SYSTEM OR COMPONENT; THE LISTS AND THE BLUEPRINT ARE ITS TABS"><b>◈</b>PANEL</button>
      <span class="ax-sep"></span>
      <button class="ax-tool" onclick="archReindex()" title="READ THE CODE AGAIN (LIB/CODE-INTEL)"><b>↻</b>INDEX</button>
      <button class="ax-tool g" onclick="archWrite()" title="WRITE THIS MAP INTO THE REPO: ARCHITECTURE.JSON AND THE REGISTRY AS NODES (NODES/TYPE/ID.TYPE, GUARDIAN'S LAYOUT) — VERSIONED; NODES NO LONGER PRODUCED MOVE TO NODES/_ARCHIVE/"><b>⇩</b>WRITE</button>
    </nav>
  </div>`;
  el.querySelectorAll('[data-ratab]').forEach(b => b.onclick = () => { ARCHREG.tab = b.dataset.ratab; archDrawer(true); });
  let qt = null;
  document.getElementById('ra-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { ARCHREG.q = e.target.value; _archGraph(true); }, 220); };
  try { ARCHREG.data = await api(`/api/repos/${repo.uuid}/architecture`, {}, 60000); }
  catch (e) {
    if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
    const noIndex = /no chunk cards|NO_INDEX|not been indexed/i.test(e.message);
    document.getElementById('ra-state').innerHTML = noIndex
      ? `<b>NOT INDEXED YET</b><p>INDEX THE CODE, AND ITS COMPONENTS, WIRES, CONSUMERS AND ORPHANS APPEAR HERE ON THE MAP.</p><button class="ax-btn" onclick="archReindex()">↻ INDEX THE CODE</button>`
      : `<b>THE WIRING DID NOT LOAD</b><p>${escapeHtml(String(e.message).toUpperCase())}</p><button class="ax-btn" onclick="renderRepoRegistry(ARCHREG.repo)">TRY AGAIN</button>`;
    return;
  }
  if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
  _archPaint();
}
function _archPaint() {
  const a = ARCHREG.data, el = document.getElementById('repo-arch-registry'); if (!el || !a) return;
  const st = a.stats || {};
  document.getElementById('ra-state').classList.toggle('hidden', !!(a.components || []).length);
  if (!(a.components || []).length) document.getElementById('ra-state').innerHTML = '<b>NO COMPONENTS</b><p>THE INDEX FOUND NO SOURCE FILES IN THIS REPO.</p>';
  document.getElementById('ra-top').classList.remove('hidden');
  document.getElementById('ra-stats').innerHTML = [[st.components, 'COMPONENTS', 'c'], [st.wires, 'WIRES'], [st.hooks, 'HOOKS'], [st.externals, 'PACKAGES'], [st.orphans, 'ORPHANS', st.orphans ? 'r' : ''],
    [st.breaches, 'BREACHES', st.breaches ? 'r' : ''], [st.routes || 0, 'ROUTES'], [st.cli || 0, 'CLI'], [st.events || 0, 'EVENTS'], [st.lines, 'LINES']]
    .map(([n, l, c]) => `<span class="ax-stat ${c || ''}"><b>${(n || 0).toLocaleString()}</b>${l}</span>`).join('');
  if (!ARCHREG.canvas) ARCHREG.canvas = ArchCanvas.mount(document.getElementById('ra-map'), {
    nodeW: 210, layout: { maxPerRow: 9, nodeH: 84, gapY: 26, gapX: 26 },
    inset: () => ({ t: 130, b: 96, l: 24, r: document.getElementById('ra-side').classList.contains('shut') ? 24 : 420 }),
    onSelect: (ids) => { ARCHREG.sel = ids.length === 1 ? ids[0] : null; if (ARCHREG.sel) { ARCHREG.group = null; ARCHREG.tab = 'inspect'; archDrawer(true); } else _archSide(); },
    onSelectGroup: (key) => { ARCHREG.group = key; if (key) { ARCHREG.sel = null; ARCHREG.tab = 'inspect'; archDrawer(true); } else _archSide(); },
    onLevel: (lv) => document.querySelectorAll('[data-ralvl]').forEach(b => b.classList.toggle('on', b.dataset.ralvl === lv)),
    groupHtml: (b, w) => { const st = ARCHREG.sysStats[b.key] || {}; const bad = [st.breaches ? `<b>${st.breaches}</b> BREACH${st.breaches === 1 ? '' : 'ES'}` : '', st.orphans ? `<b>${st.orphans}</b> ORPHAN${st.orphans === 1 ? '' : 'S'}` : ''].filter(Boolean).join(' · ');
      return `<div class="ac-gstat"><b>${b.count}</b> FILES · <b>${(st.lines || 0).toLocaleString()}</b> LINES</div><div class="ac-gstat">NEEDS <b>${w.needs.length}</b> · NEEDED BY <b>${w.usedBy.length}</b></div>${bad ? `<div class="ac-gstat bad">${bad}</div>` : ''}`; },
    onOpen: (id) => ARCHREG.canvas.center(id),
  });
  _archGraph(true);
  _archSide();
}
function _archShown() {
  const a = ARCHREG.data, q = ARCHREG.q.trim().toLowerCase();
  const comps = (a.components || []).filter(c => !q || `${c.id} ${c.file} ${c.layer} ${c.type} ${(c.exports || []).join(' ')}`.toLowerCase().includes(q));
  return { comps: comps.slice(0, ARCH_MAX), total: comps.length };
}
function _archGraph(fit) {
  const a = ARCHREG.data; if (!a || !ARCHREG.canvas) return;
  const { comps, total } = _archShown();
  const shown = new Set(comps.map(c => c.file)), orph = new Set(a.orphans || []);
  const breach = new Set((a.breaches || []).map(b => `${b.consumer}>${b.dependency}`));
  const evOf = (f) => (a.events || []).filter(e => e.emittedBy.includes(f) || e.consumedBy.includes(f)).length;
  const routesOf = (f) => (a.routes || []).filter(r => r.file === f).length + (a.cli || []).filter(c => c.file === f).length;
  const nodes = comps.map(c => ({ id: c.file, band: c.layer, label: c.file, color: ARCH_BANDS[c.layer] || '#00d4ff', cls: orph.has(c.file) ? 'is-orphan' : '',
    html: ArchCanvas.card({ title: c.file.split('/').pop(), badge: (c.type || '').toUpperCase(), sub: c.file.toUpperCase(),
      chips: [{ t: `${c.lines} LINES` }, { t: `${c.consumers.length} USE IT`, cls: c.consumers.length ? 'reuse' : '' }, { t: `${c.deps.length} NEEDS` },
        ...(routesOf(c.file) ? [{ t: `${routesOf(c.file)} DOORS`, cls: 'warn' }] : []), ...(evOf(c.file) ? [{ t: `${evOf(c.file)} EVENTS` }] : []),
        ...(orph.has(c.file) ? [{ t: 'ORPHAN', cls: 'bad' }] : []), ...(c.deps.some(d => breach.has(`${c.file}>${d}`)) ? [{ t: 'BREACH', cls: 'bad' }] : [])] }) }));
  // a wire runs dependency → consumer; on the canvas an edge reads "from NEEDS to"
  const edges = (a.wires || []).filter(w => shown.has(w.from) && shown.has(w.to) && w.from !== w.to)
    .map(w => w.relation === 'event' ? { from: w.to, to: w.from, kind: 'event' } : { from: w.to, to: w.from, kind: breach.has(`${w.to}>${w.from}`) ? 'breach' : 'dep' });
  const seen = new Set(), uniq = edges.filter(e => { const k = `${e.from}>${e.to}>${e.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const bands = (a.layerOrder || []).filter(l => comps.some(c => c.layer === l)).map(l => ({ key: l, label: l.toUpperCase(), color: ARCH_BANDS[l] }));
  // §0.39.300 AZ1 — the systems: each component's system, each system's numbers (for its card at the SYSTEMS level)
  const sysOf = _archSystemOf((a.components || []).map(c => c.file));
  const keys = [...new Set(comps.map(c => sysOf(c.file)))].sort();
  ARCHREG.sysOf = sysOf; ARCHREG.sysStats = {};
  for (const c of comps) { const k = sysOf(c.file), st = ARCHREG.sysStats[k] || (ARCHREG.sysStats[k] = { lines: 0, orphans: 0, breaches: 0, files: [] }); st.lines += c.lines || 0; st.files.push(c.file); if (orph.has(c.file)) st.orphans++; if (c.deps.some(d => breach.has(`${c.file}>${d}`))) st.breaches++; }
  const groups = keys.map((k, i) => ({ key: k, label: k.toUpperCase(), color: ARCH_SYS_COLORS[i % ARCH_SYS_COLORS.length] }));
  nodes.forEach(n => { n.group = sysOf(n.id); });
  ARCHREG.canvas.setGraph({ nodes, edges: uniq, bands, groups }, { keepView: !fit });
  if (ARCHREG.sel && shown.has(ARCHREG.sel)) ARCHREG.canvas.select(ARCHREG.sel);
  document.getElementById('ra-shown').textContent = total > comps.length ? `SHOWING ${comps.length} OF ${total} — FILTER TO NARROW` : ARCHREG.q ? `${total} MATCH` : '';
}
function archDrawer(open) {
  const d = document.getElementById('ra-side'); if (!d) return;
  const was = !d.classList.contains('shut');
  d.classList.toggle('shut', !open);
  document.getElementById('repo-arch-registry').classList.toggle('side-shut', !open);
  _archSide();
  if (ARCHREG.canvas && was !== open) setTimeout(() => ARCHREG.canvas.fit(), 320);
}
function archTool(t) {
  const cv = ARCHREG.canvas;
  if (t === 'fit') return cv && cv.fit();
  if (t === 'in') return cv && cv.step(1);
  if (t === 'out') return cv && cv.step(-1);
  if (t.startsWith('lvl-')) return cv && cv.goLevel(t.slice(4));
  if (t === 'arrange') return cv && cv.layout({ all: true });
  const d = document.getElementById('ra-side');
  if (!d.classList.contains('shut') && (ARCHREG.tab === t || t === 'inspect')) return archDrawer(false);
  ARCHREG.tab = t; archDrawer(true);
}
function _archJump(file) { ARCHREG.sel = file; ARCHREG.tab = 'inspect'; if (ARCHREG.canvas) { if (!_archShown().comps.find(c => c.file === file)) { ARCHREG.q = ''; document.getElementById('ra-q').value = ''; _archGraph(false); } ARCHREG.canvas.select(file); ARCHREG.canvas.center(file); } _archSide(); }
function _archSide() {
  const a = ARCHREG.data, body = document.getElementById('ra-body'); if (!body || !a) return;
  document.querySelectorAll('[data-ratab]').forEach(b => { b.classList.toggle('on', b.dataset.ratab === ARCHREG.tab); b.setAttribute('aria-selected', b.dataset.ratab === ARCHREG.tab); });
  const open = !document.getElementById('ra-side').classList.contains('shut');
  document.querySelectorAll('[data-ratool]').forEach(b => b.classList.toggle('on', open && b.dataset.ratool === ARCHREG.tab));
  const it = (file, extra = '', cls = '') => `<div class="ax-item ${cls}" tabindex="0" data-jump="${escapeHtml(file)}">${escapeHtml(file)}${extra ? `<span class="m">${extra}</span>` : ''}</div>`;
  const title = document.getElementById('ra-side-title');
  if (ARCHREG.tab === 'blueprint') {
    title.textContent = 'BLUEPRINT';
    if (ARCHREG.bp) body.innerHTML = ARCHREG.bp;
    else { body.innerHTML = '<div class="ax-empty">READING THE SPEC…</div>'; const forUuid = ARCHREG.uuid; _archBlueprintHtml(ARCHREG.repo).then(h => { if (ARCHREG.uuid !== forUuid) return; ARCHREG.bp = h; if (ARCHREG.tab === 'blueprint') body.innerHTML = h; }); }
    return;
  }
  if (ARCHREG.tab === 'lists') {
    title.textContent = 'THE LISTS';
    const sec = (name, n, html) => `<div class="ax-k">${name} <span class="n">${n}</span></div>${html}`;
    body.innerHTML = sec('ORPHANS — NOTHING USES THEM, THEY USE NOTHING', (a.orphans || []).length, (a.orphans || []).map(f => it(f, '', 'warn')).join('') || '<div class="ax-item ok">NONE</div>')
      + sec('BOTTOM-UP BREACHES (§3.1)', (a.breaches || []).length, (a.breaches || []).map(b => it(b.consumer, `NEEDS ${escapeHtml(b.dependency)} — A HIGHER LAYER`, 'bad')).join('') || '<div class="ax-item ok">NONE</div>')
      + sec('PACKAGES (EXTERNAL)', (a.externals || []).length, (a.externals || []).slice(0, 60).map(e => `<div class="ax-item">${escapeHtml(e.name)}<span class="m">USED BY ${e.usedBy.length}</span></div>`).join('') || '<div class="ax-empty">NONE</div>')
      + sec('ROUTES · CLI — THE DOORWAYS IN', (a.routes || []).length + (a.cli || []).length, [...(a.routes || []).slice(0, 80).map(r => it(r.file, `${escapeHtml(r.method)} ${escapeHtml(r.path)}`)), ...(a.cli || []).slice(0, 60).map(c => it(c.file, `$ ${escapeHtml(c.verb)}`))].join('') || '<div class="ax-empty">NO ROUTES OR COMMANDS</div>')
      + sec('EVENTS — EMITTED → HANDLED', (a.events || []).length, (a.events || []).slice(0, 80).map(e => `<div class="ax-item ${e.consumedBy.length ? '' : 'warn'}">${escapeHtml(e.name)}<span class="m">${e.emittedBy.length} EMIT → ${e.consumedBy.length} HANDLE${e.consumedBy.length ? '' : ' — UNHANDLED'}</span></div>`).join('') || '<div class="ax-empty">NO EVENTS</div>')
      + sec('DATA DIRS · NODE TYPES', (a.dataDirs || []).length, `${(a.dataDirs || []).map(d => `<div class="ax-item">${escapeHtml(d)}</div>`).join('') || '<div class="ax-empty">NO DATA DIR</div>'}${Object.entries(a.nodeTypes || {}).map(([k, v]) => `<div class="ax-item">.${escapeHtml(k)}<span class="m">× ${v}</span></div>`).join('')}`);
  } else if (ARCHREG.group && !ARCHREG.sel) {
    // §0.39.300 AZ1 — a system: what it holds, what it needs, what needs it (summed wires), its breaches and orphans
    const k = ARCHREG.group, st = ARCHREG.sysStats[k] || { files: [], lines: 0 };
    const w = ARCHREG.canvas ? ARCHREG.canvas.systemWires() : [];
    const needs = w.filter(e => e.from === k).sort((x, y) => y.count - x.count), users = w.filter(e => e.to === k).sort((x, y) => y.count - x.count);
    const box = ARCHREG.canvas ? ARCHREG.canvas.groups().find(b => b.key === k) : null;
    title.textContent = k.toUpperCase();
    const sys = (e, key) => `<div class="ax-item" tabindex="0" data-sys="${escapeHtml(e[key])}">${escapeHtml(e[key].toUpperCase())}<span class="m">${e.count} WIRE${e.count === 1 ? '' : 'S'}</span></div>`;
    body.innerHTML = `<div class="ax-stats"><span class="ax-stat c"><b>${st.files.length}</b>COMPONENTS</span><span class="ax-stat"><b>${(st.lines || 0).toLocaleString()}</b>LINES</span>${box ? `<span class="ax-stat"><b>${box.level}</b>LEVEL</span>` : ''}${st.breaches ? `<span class="ax-stat r"><b>${st.breaches}</b>BREACHES</span>` : ''}${st.orphans ? `<span class="ax-stat r"><b>${st.orphans}</b>ORPHANS</span>` : ''}</div>
      ${box && box.cyclic ? '<div class="ax-item warn">IN A CYCLE — IT NEEDS SYSTEMS THAT NEED IT; THEY SHARE ONE LEVEL</div>' : ''}
      <div class="ax-row" style="margin:12px 0 4px"><button class="ax-btn small" onclick="ARCHREG.canvas.openGroup('${escapeHtml(k).replace(/'/g, "\\'")}')" title="ZOOM INTO THE SYSTEM — ITS COMPONENTS">OPEN THE SYSTEM</button></div>
      <div class="ax-k">NEEDS <span class="n">${needs.length} SYSTEMS</span></div>${needs.map(e => sys(e, 'to')).join('') || '<div class="ax-empty">NOTHING OUTSIDE ITSELF</div>'}
      <div class="ax-k">NEEDED BY <span class="n">${users.length} SYSTEMS</span></div>${users.map(e => sys(e, 'from')).join('') || '<div class="ax-empty">NOTHING</div>'}
      <div class="ax-k">COMPONENTS <span class="n">${st.files.length}</span></div>${st.files.slice(0, 200).map(f => it(f)).join('')}`;
    body.querySelectorAll('[data-sys]').forEach(x => { const go = () => { ARCHREG.group = x.dataset.sys; ARCHREG.canvas.selectGroup(x.dataset.sys); _archSide(); }; x.onclick = go; x.onkeydown = (e) => { if (e.key === 'Enter') go(); }; });
  } else {
    const c = (a.components || []).find(x => x.file === ARCHREG.sel);
    title.textContent = c ? c.file.split('/').pop().toUpperCase() : 'INSPECTOR';
    if (!c) body.innerHTML = '<div class="ax-empty">SELECT A COMPONENT ON THE MAP — WHAT IT NEEDS LIGHTS YELLOW, WHAT NEEDS IT MAGENTA, EVERYTHING ELSE DIMS. THE LISTS AND THE BLUEPRINT ARE THE TABS ABOVE.</div>';
    else {
      const orph = (a.orphans || []).includes(c.file), br = (a.breaches || []).filter(b => b.consumer === c.file);
      const routes = (a.routes || []).filter(r => r.file === c.file), cli = (a.cli || []).filter(x => x.file === c.file);
      const evs = (a.events || []).filter(e => e.emittedBy.includes(c.file) || e.consumedBy.includes(c.file));
      body.innerHTML = `${orph ? '<div class="ax-item warn">AN ORPHAN — NOTHING USES IT, IT USES NOTHING</div>' : ''}${br.map(b => `<div class="ax-item bad">NEEDS ${escapeHtml(b.dependency)}, A HIGHER LAYER — A BOTTOM-UP BREACH</div>`).join('')}
        <div class="ax-stats"><span class="ax-stat c"><b>${escapeHtml(c.layer.toUpperCase())}</b>LAYER</span><span class="ax-stat"><b>${escapeHtml((c.type || '').toUpperCase())}</b>TYPE</span><span class="ax-stat"><b>${c.lines}</b>LINES</span></div>
        <div class="ax-k">ID</div><div class="ax-item">${escapeHtml(c.id)}<span class="m">${escapeHtml(c.file)}${c.language ? ` · ${escapeHtml(c.language)}` : ''}</span></div>
        <div class="ax-k">EXPORTS <span class="n">${(c.exports || []).length}</span></div><div class="ax-chips">${(c.exports || []).map(x => `<span class="ax-chip">${escapeHtml(x)}</span>`).join('') || '<span class="ax-empty">NONE</span>'}</div>
        <div class="ax-k">NEEDS <span class="n">${c.deps.length}</span></div>${c.deps.map(f => it(f)).join('') || '<div class="ax-empty">NOTHING IN THIS REPO</div>'}
        <div class="ax-k">NEEDED BY <span class="n">${c.consumers.length}</span></div>${c.consumers.map(f => it(f)).join('') || '<div class="ax-empty">NOTHING</div>'}
        ${routes.length || cli.length ? `<div class="ax-k">DOORWAYS <span class="n">${routes.length + cli.length}</span></div>${routes.map(r => `<div class="ax-item">${escapeHtml(r.method)} ${escapeHtml(r.path)}</div>`).join('')}${cli.map(x => `<div class="ax-item">$ ${escapeHtml(x.verb)}</div>`).join('')}` : ''}
        ${evs.length ? `<div class="ax-k">EVENTS <span class="n">${evs.length}</span></div>${evs.map(e => `<div class="ax-item ${e.consumedBy.length ? '' : 'warn'}">${escapeHtml(e.name)}<span class="m">${e.emittedBy.includes(c.file) ? 'EMITS' : ''}${e.emittedBy.includes(c.file) && e.consumedBy.includes(c.file) ? ' · ' : ''}${e.consumedBy.includes(c.file) ? 'HANDLES' : ''}${e.consumedBy.length ? '' : ' — NOTHING HANDLES IT'}</span></div>`).join('')}` : ''}
        <div class="ax-row" style="margin-top:14px"><button class="ax-btn small" onclick="openApiRepoFile(ARCHREG.uuid, '${escapeHtml(c.file).replace(/'/g, "\\'")}')" title="OPEN THE FILE IN THE FILES TAB">OPEN THE FILE</button></div>`;
    }
  }
  body.querySelectorAll('[data-jump]').forEach(x => { x.onclick = () => _archJump(x.dataset.jump); x.onkeydown = (e) => { if (e.key === 'Enter') _archJump(x.dataset.jump); }; });
}
async function archReindex() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { await api(`/api/repos/${repo.uuid}/chunk`, { method: 'POST', body: '{}' }, 300000); toast('indexed — reading the wiring', 'ok'); renderRepoRegistry(repo); }
  catch (e) { toast(`index failed: ${e.message}`, 'err'); }
}
async function archWrite() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { const r = await api(`/api/repos/${repo.uuid}/architecture`, { method: 'POST', body: '{}' }, 60000); toast(`registry written — ${r.stats.components} components, ${r.stats.wires} wires · nodes: ${r.nodes ? `${r.nodes.written} written, ${r.nodes.unchanged} unchanged, ${r.nodes.archived} archived` : '—'}`, 'ok'); }
  catch (e) { toast(`not written: ${e.message}`, 'err'); }
}
