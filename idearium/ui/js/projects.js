// idearium/ui/js/projects.js — COSA10 (0.60.74): every project of his on one screen, sorted by what moved last.
// James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed."
// Reads GET /api/my-projects only (idearium/lib/projects.cjs composes notes, phases and activity); remove this file and nothing
// else changes (§5.12). Opened from the repo rail's "My projects" button; a row opens its repo.

async function openProjects() {
  let el = document.getElementById('projects-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'projects-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:48px 16px;overflow:auto';
    el.addEventListener('click', (e) => { if (e.target === el) closeProjects(); });
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  el.innerHTML = _projectsFrame('<div style="padding:16px;color:var(--text3);font-family:var(--mono);font-size:11px">reading your projects…</div>');
  try {
    const d = await api('/api/my-projects');
    el.innerHTML = _projectsFrame(_projectsHtml(d) + '<div id="projects-raid"></div>');
    _projectsRaid();
  } catch (e) {
    el.innerHTML = _projectsFrame(`<div style="padding:16px;color:var(--coral);font-family:var(--mono);font-size:11px">could not read projects: ${escapeHtml(e.message)}</div>`);
  }
}

function closeProjects() { const el = document.getElementById('projects-overlay'); if (el) el.style.display = 'none'; }

function _projectsFrame(inner) {
  return `<div id="projects-panel" style="width:min(760px,100%);background:var(--bg1,#111);border:1px solid var(--b1,#333);border-radius:8px">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--b0,#222)">
      <div style="flex:1;font-weight:600">My projects</div>
      <button class="tb-btn" onclick="openProjects()" title="read again">Refresh</button>
      <button class="tb-btn" onclick="closeProjects()">Close</button>
    </div>${inner}</div>`;
}

function _projectsHtml(d) {
  const c = d.counts || {};
  const head = `<div style="padding:8px 14px;font-family:var(--mono);font-size:10px;color:var(--text3)">${c.projects || 0} projects · ${c.questions || 0} questions waiting · ${c.todos || 0} todos · ${c.inProgress || 0} in progress</div>`;
  const rows = (d.projects || []).map(p => {
    const when = p.lastActivity && p.lastActivity.ts ? new Date(p.lastActivity.ts).toLocaleDateString() : 'no activity yet';
    const ph = p.phases ? `${p.phases.complete}/${p.phases.total} phases done` : 'no phasemap';
    const att = (p.attention || []).map(x => `<div style="font-size:11px;color:var(--text2)">• ${escapeHtml(x)}</div>`).join('');
    const errs = (p.errors || []).map(x => `<div style="font-size:10px;color:var(--amber,#d90)">! ${escapeHtml(x)}</div>`).join('');
    return `<div class="project-row" data-uuid="${escapeHtml(p.uuid)}" onclick="_openProject('${escapeHtml(p.uuid)}')" style="padding:10px 14px;border-top:1px solid var(--b0,#222);cursor:pointer">
      <div style="display:flex;gap:8px;align-items:baseline"><span style="font-weight:600;color:var(--mint)">${escapeHtml(p.name)}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${escapeHtml(when)} · ${escapeHtml(ph)}</span></div>
      ${p.lastActivity && p.lastActivity.title ? `<div style="font-size:10px;color:var(--text3)">last: ${escapeHtml(p.lastActivity.title)}</div>` : ''}${att}${errs}</div>`;
  }).join('');
  return head + (rows || '<div style="padding:16px;color:var(--text3)">no projects yet</div>');
}

function _openProject(uuid) {
  closeProjects();
  if (typeof enterRepoDetail === 'function' && !REPO_DETAIL_OPEN) enterRepoDetail(uuid);
  else if (typeof selectApiRepo === 'function') selectApiRepo(uuid);
}

// §RT1 0.60.78 — what RAID's officiator holds back (cortex): the agents' wait and parked drops, with a way to clear it.
// Said when cortex does not answer; shows nothing when nothing is held.
async function _projectsRaid() {
  const box = document.getElementById('projects-raid'); if (!box) return;
  let d; try { d = await api('/api/raid/held'); } catch (e) { box.innerHTML = `<div style="padding:8px 14px;font-size:10px;color:var(--text3)">RAID: ${escapeHtml(e.message)}</div>`; return; }
  const parked = (d.drops || []).filter(x => x.parked), waiting = (d.drops || []).filter(x => !x.parked);
  if (!d.agents && !(d.drops || []).length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div style="padding:10px 14px;border-top:1px solid var(--b0,#222)">
    <div style="display:flex;gap:8px;align-items:baseline"><span style="font-weight:600">RAID intake</span>
      <span style="font-family:var(--mono);font-size:10px;color:var(--text3)">${parked.length} parked · ${waiting.length} waiting${d.agents ? ` · agents wait until ${escapeHtml(new Date(d.agents.until).toLocaleTimeString())}` : ''}</span>
      <span style="flex:1"></span><button class="tb-btn" onclick="_projectsUnpark()">Try all again</button></div>
    ${d.agents ? `<div style="font-size:11px;color:var(--text2)">• no agent answered${(d.agents.tried || []).length ? ` (${escapeHtml(d.agents.tried.join(', '))})` : ''}</div>` : ''}
    ${parked.slice(0, 6).map(x => `<div style="font-size:11px;color:var(--text2)">• parked ${escapeHtml(x.id.slice(0, 8))}: ${escapeHtml(String(x.reason || '').slice(0, 120))}</div>`).join('')}</div>`;
}
async function _projectsUnpark() {
  try { await api('/api/raid/held/unpark', { method: 'POST', body: JSON.stringify({}) }); } catch (_) {}
  _projectsRaid();
}

