// idearium/ui/js/projects.js — COSA10 (0.60.74): every project of his on one screen, sorted by what moved last.
// James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed."
// Reads GET /api/my-projects (and POST /api/repos/carve for Branch from Nexus, §CV1) (idearium/lib/projects.cjs composes notes, phases and activity); remove this file and nothing
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
    el.innerHTML = _projectsFrame('<div id="projects-carve"></div><div id="projects-folder"></div>' + _projectsHtml(d) + '<div id="projects-raid"></div>');
    _projectsRaid(); _projectsFolder();
  } catch (e) {
    el.innerHTML = _projectsFrame(`<div style="padding:16px;color:var(--coral);font-family:var(--mono);font-size:11px">could not read projects: ${escapeHtml(e.message)}</div>`);
  }
}

function closeProjects() { const el = document.getElementById('projects-overlay'); if (el) el.style.display = 'none'; }

function _projectsFrame(inner) {
  return `<div id="projects-panel" style="width:min(760px,100%);background:var(--bg1,#111);border:1px solid var(--b1,#333);border-radius:8px">
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--b0,#222)">
      <div style="flex:1;font-weight:600">My projects</div>
      <button class="tb-btn" onclick="_carveOpen()" title="copy a part of Nexus into its own repo, with everything it requires">Branch from Nexus</button>
      <button class="tb-btn" onclick="_projectsFolder(true)" title="the folder on this machine that holds your projects — Idearium reads it, never changes it">Projects folder</button>
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


// §CV1 0.60.112 — James, 2026-10-16: "can you branch it into a idearium repo?" A part of Nexus copied into its own repo with
// everything it requires (POST /api/repos/carve, lib/repo-carve.js). Preview first: what comes along and why; then Create.
function _carveOpen() {
  const box = document.getElementById('projects-carve'); if (!box) return;
  if (box.innerHTML) { box.innerHTML = ''; return; }
  box.innerHTML = `<div style="padding:10px 14px;border-bottom:1px solid var(--b0,#222);display:flex;flex-direction:column;gap:6px">
    <div style="font-weight:600">Branch part of Nexus into its own repo</div>
    <div style="font-size:11px;color:var(--text3)">A copy with everything it requires. Nexus is its parent; nothing in Nexus moves.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <select id="carve-preset" onchange="_carvePresetChanged()"><option value="flight_recorder">flight recorder (versionium, rfr2, causal, COS test env)</option><option value="">my own paths…</option></select>
      <input id="carve-name" placeholder="repo name" value="flight-recorder" style="width:160px">
      <input id="carve-seeds" placeholder="paths, e.g. versionium lib/zip.js" style="flex:1;min-width:200px;display:none">
      <select id="carve-cut" title="links the code runs without can be left out; the Preview checks the copy still loads"><option value="optional">leave out optional links</option><option value="none">keep every link</option><option value="optional,lazy">also lazy links (risky)</option></select>
      <button class="tb-btn" onclick="_carveRun(true)">Preview</button>
      <button class="tb-btn" onclick="_carveRun(false)">Create repo</button>
    </div>
    <div id="carve-out" style="font-family:var(--mono);font-size:11px;color:var(--text2)"></div></div>`;
}
function _carvePresetChanged() {
  const own = !document.getElementById('carve-preset').value;
  document.getElementById('carve-seeds').style.display = own ? '' : 'none';
}
// §CV2 0.60.113 — the Preview also says how the copy is tangled (the biggest links, and how each loads), what was left out,
// and whether the copy loads alone (lib/repo-carve.js verify)
async function _carveRun(dryRun) {
  const out = document.getElementById('carve-out'); if (!out) return;
  const preset = document.getElementById('carve-preset').value, name = document.getElementById('carve-name').value.trim();
  const seeds = document.getElementById('carve-seeds').value.trim();
  out.textContent = dryRun ? 'reading what it requires…' : 'creating the repo…';
  try {
    const cutSel = document.getElementById('carve-cut').value, cut = cutSel === 'none' ? [] : cutSel.split(',');
    const d = await api('/api/repos/carve', { method: 'POST', body: JSON.stringify({ ...(preset ? { preset } : { seeds }), name, dryRun, cut, verify: true }) });
    const v = d.verified;
    const sys = Object.entries(d.bySystem || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ');
    out.innerHTML = `<div>${dryRun ? 'would carve' : 'carved'} <b>${escapeHtml(d.name)}</b>: ${d.files} files (${d.seeded} named, ${d.pulledIn} pulled in), ${d.lines} lines${d.parent ? ` · parent ${escapeHtml(d.parent.name)}` : ''}</div>
      <div>by system: ${escapeHtml(sys)}</div>
      <div>npm: ${escapeHtml(Object.keys(d.npm || {}).join(', ') || 'none')}${(d.npmNamedOnly || []).length ? ` · named only: ${escapeHtml(d.npmNamedOnly.join(', '))}` : ''}</div>
      ${(d.missing || []).length ? `<div style="color:var(--amber,#d90)">${d.missing.length} require(s) resolve to nothing: ${escapeHtml(d.missing.slice(0, 3).map(m => `${m.from} → ${m.spec}`).join('; '))}</div>` : ''}
      ${(d.mustMissing || []).length ? `<div style="color:var(--coral)">missing what the product must carry (Create refuses): ${escapeHtml(d.mustMissing.map(m => m.path).join(', '))}</div>` : ''}
      ${(d.tagged || []).length ? `<div style="color:var(--text3)">tagged as part of the product: ${escapeHtml(d.tagged.join(', '))}</div>` : ''}
      ${v ? `<div style="color:${v.ok ? 'var(--mint)' : 'var(--amber,#d90)'}">${v.ok ? 'loads alone' : 'does NOT load alone'}: ${v.loaded}/${v.of} named files load in an empty folder${(v.failed || []).length ? ` · failed: ${escapeHtml(v.failed.map(f => `${f.path} (${f.error})`).join('; '))}` : ''}${(v.skipped || []).length ? ` · skipped ${escapeHtml(v.skipped.map(f => f.path).join(', '))}` : ''}</div>` : ''}
      ${(d.cut || []).length ? `<div>left out: ${(d.leftOut || []).length} ${escapeHtml(d.cut.join('/'))} link(s) the code runs without</div>` : ''}
      ${(d.tangle || []).length ? `<div style="color:var(--text3)">biggest links: ${escapeHtml(d.tangle.slice(0, 4).map(t => `${t.files} via ${t.from} → ${t.to} (${t.kind})`).join(' · '))}</div>` : ''}
      ${(d.outsideSeeds || []).length ? `<div style="color:var(--text3)">came along from outside the seeds: ${escapeHtml(d.outsideSeeds.slice(0, 6).map(f => `${f.path} (by ${f.pulledBy})`).join(', '))}${d.outsideSeeds.length > 6 ? ' …' : ''}</div>` : ''}
      ${!dryRun && d.repo && d.repo.uuid ? `<div><button class="tb-btn" onclick="_openProject('${escapeHtml(d.repo.uuid)}')">Open the repo</button></div>` : ''}`;
  } catch (e) { out.innerHTML = `<span style="color:var(--coral)">could not carve: ${escapeHtml(e.message)}</span>`; }
}

// ── 0.60.139 COSA14 — his projects folder. James, 2026-10-17: "these are all my projects i have so far. way more. in some
// folders. i was hoping to use idearium and cos to manage them". The folder is read, never changed: each project picked is
// zipped from disk and brought in through the same import as an uploaded zip (POST /api/my-projects/folder/import).
async function _projectsFolder(edit) {
  const box = document.getElementById('projects-folder'); if (!box) return;
  const mono = 'font-family:var(--mono);font-size:10px;color:var(--text3)';
  const ask = (root) => { box.innerHTML = `<div style="padding:10px 14px;border-bottom:1px solid var(--b0,#222);display:flex;gap:6px;align-items:center">
      <span style="${mono}">projects folder</span><input id="pf-root" value="${escapeHtml(root || '')}" placeholder="D:\\Projects" style="flex:1">
      <button class="tb-btn" onclick="_projectsFolderSet()">Scan</button></div>`; };
  let d; try { d = await api('/api/my-projects/folder', {}, 120000); } catch (e) { box.innerHTML = `<div style="padding:8px 14px;${mono};color:var(--coral)">projects folder: ${escapeHtml(e.message)}</div>`; return; }
  if (!d.root || edit === true) { ask(d.root); if (!d.root) return; if (edit === true) return; }
  const rows = (d.projects || []).map(p => `<label style="display:flex;gap:8px;align-items:baseline;padding:3px 14px;${p.imported ? 'opacity:.6' : ''}">
      <input type="checkbox" class="pf-pick" value="${escapeHtml(p.path)}" ${p.imported ? 'disabled' : ''}>
      <span style="min-width:44px;${mono};color:${p.imported ? 'var(--mint)' : p.weak ? 'var(--text3)' : 'var(--amber,#d90)'}">${p.imported ? 'in' : p.weak ? 'files' : 'new'}</span>
      <span style="${p.group ? 'padding-left:12px;' : ''}">${escapeHtml(p.name)}</span>
      <span style="${mono}">${escapeHtml(p.group ? p.group + ' · ' : '')}${escapeHtml(p.markers.join(', '))}${p.size ? ` · ${p.size.files}${p.size.capped ? '+' : ''} files` : ''}</span></label>`).join('');
  const nr = (d.notRecognized || []).length ? `<div style="padding:4px 14px;${mono}">not projects: ${(d.notRecognized || []).map(n => escapeHtml(n.rel)).join(', ')}</div>` : '';
  box.innerHTML = `<div style="padding:10px 0;border-bottom:1px solid var(--b0,#222)">
      <div style="display:flex;gap:8px;align-items:center;padding:0 14px 6px"><span style="flex:1;${mono}">${escapeHtml(d.root)} · ${d.counts.projects} projects · ${d.counts.groups} group folders · ${d.imported} in Idearium</span>
        <button class="tb-btn" onclick="_projectsFolder(true)">Change</button><button class="tb-btn" onclick="_projectsFolderImport()">Bring in the ticked</button></div>
      <div style="max-height:260px;overflow:auto">${rows || `<div style="padding:8px 14px;${mono}">no projects found under it</div>`}</div>${nr}
      <div id="pf-out" style="padding:4px 14px;${mono}">${window._pfLast || ''}</div></div>`;
  window._pfLast = '';
}
async function _projectsFolderSet() {
  const root = (document.getElementById('pf-root') || {}).value || '';
  try { await api('/api/my-projects/folder', { method: 'POST', body: JSON.stringify({ root: root.trim() }) }, 120000); } catch (e) { alert(`projects folder: ${e.message}`); return; }
  _projectsFolder();
}
async function _projectsFolderImport() {
  const paths = [...document.querySelectorAll('.pf-pick:checked')].map(x => x.value);
  const out = document.getElementById('pf-out'); if (!paths.length) { if (out) out.textContent = 'tick the projects to bring in'; return; }
  if (out) out.textContent = `bringing in ${paths.length} project(s)… each is zipped from disk, imported, chunked and indexed (a big one takes minutes)`;
  let d; try { d = await api('/api/my-projects/folder/import', { method: 'POST', body: JSON.stringify({ paths }) }, 60 * 60000); } catch (e) { if (out) out.textContent = `not brought in: ${e.message}`; return; }
  window._pfLast = (d.results || []).map(r => r.ok ? `in: ${escapeHtml(r.repo.name)} (${r.files} files${r.skipped ? `, ${r.skipped} skipped` : ''})` : `<span style="color:var(--coral)">not: ${escapeHtml(String(r.path || ''))} — ${escapeHtml(r.error)}</span>`).join('<br>');
  openProjects();   // the new repos are in the list below; the result stays shown above it
}

