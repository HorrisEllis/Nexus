// idearium/ui/js/phase-graph-view.js — DG2 0.60.147: a phase's dependency graph in the Phases tab's detail pane.
// James, 2026-10-18: "each phase, has to have a dependany graph before executing."
// Reads GET /api/repos/:uuid/phases/graph (lib/phase-graph.js) — the graph a build is refused without — and holds no logic of
// its own: ready or not, the lines, the crossings and what it waits on all come from the route.
const PGV = { cache: new Map() };

function _pgKey(p) { return `${p.map}::${p.phase_key}`; }

function pgSlot(p) {
  if (!p || !p.phase_key) return '';
  const key = _pgKey(p);
  setTimeout(() => pgLoad(p), 0);
  const hit = PGV.cache.get(key);
  return `<div class="pg-slot" data-key="${escapeHtml(key)}">${hit ? _pgHtml(hit) : '<div class="pg-dim">reading the dependency graph…</div>'}</div>`;
}

async function pgLoad(p) {
  const repo = typeof CURRENT_API_REPO !== 'undefined' ? CURRENT_API_REPO : null; if (!repo) return;
  const key = _pgKey(p);
  let d;
  try { d = await api(`/api/repos/${repo.uuid}/phases/graph?phase=${encodeURIComponent(p.phase_key)}&map=${encodeURIComponent(p.map)}`, {}, 30000); }
  catch (e) { d = { error: (e.data && e.data.error) || e.message }; }
  PGV.cache.set(key, d);
  for (const el of document.querySelectorAll('.pg-slot')) if (el.getAttribute('data-key') === key) el.innerHTML = _pgHtml(d);
}

function _pgHtml(d) {
  if (!d) return '';
  if (d.error) return `<div class="ph-d-sec">dependency graph</div><div class="pg-bad">${escapeHtml(d.error)}</div>`;
  const g = d.graph || {};
  const head = g.ready
    ? `<div class="ph-d-sec">dependency graph · <span class="pg-ok">ready</span> <span class="pg-dim">${escapeHtml(g.hash || '')}</span></div>`
    : `<div class="ph-d-sec">dependency graph · <span class="pg-bad">none — this phase is not built until it has one</span></div>`;
  const lines = (d.lines || []).slice(1).map(l => {
    const cls = /^(NEW CROSSING|  missing)/.test(l) ? 'pg-bad' : /^crosses /.test(l) ? 'pg-warn' : /^waits on .*(OPEN|not found)/.test(l) ? 'pg-warn' : '';
    return `<div class="pg-line ${cls}">${escapeHtml(l)}</div>`;
  }).join('');
  return head + lines;
}
