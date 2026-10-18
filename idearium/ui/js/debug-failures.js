// idearium/ui/js/debug-failures.js — FMR3 0.60.146: the Debug tab's "failure modes" section.
// James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env. nexus nerve, spotlight and interaction
// field for debugging." · "do it."
// Reads GET /api/repos/:uuid/failure-modes(/:id) (Idearium, which asks cortex by its route) and holds no logic of its own: every
// section, hole and line comes from the report (cortex/self-heal/failure-report.js), so the page can be thrown away (DB7).
const DF = { repo: null, list: null, scope: null, error: null, open: null, one: null };

async function dfLoad(repo) {
  DF.repo = repo.uuid;
  try { const r = await api(`/api/repos/${repo.uuid}/failure-modes?limit=40`, {}, 20000); DF.list = r.failureModes || []; DF.scope = r.scope || null; DF.error = null; }
  catch (e) { DF.list = []; DF.error = (e.data && e.data.error) || e.message; }
  dfPaint();
}

async function dfOpen(id) {
  if (DF.open === id) { DF.open = null; DF.one = null; dfPaint(); return; }
  DF.open = id; DF.one = null; dfPaint();
  try { DF.one = await api(`/api/repos/${DF.repo}/failure-modes/${encodeURIComponent(id)}`, {}, 20000); }
  catch (e) { DF.one = { lines: [], error: (e.data && e.data.error) || e.message }; }
  if (DF.open === id) dfPaint();
}

function _dfWhen(t) { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; }

function _dfReport() {
  const o = DF.one;
  if (!o) return '<div class="cs-dim">reading the report…</div>';
  if (o.error) return `<div class="cs-bad">${escapeHtml(o.error)}</div>`;
  const secs = (o.report && o.report.sections) || [];
  return secs.map(s => `<div class="df-sec${s.hole ? ' df-hole' : ''}${s.id === 'on_screen' ? ' df-view' : ''}" data-sec="${escapeHtml(s.id)}">
      <div class="df-sec-t">${escapeHtml(s.title)} <span class="df-from">${escapeHtml(s.from || '')}</span></div>
      ${s.hole ? `<div class="df-hole-t">— ${escapeHtml(s.hole)}</div>` : `<pre class="df-val">${escapeHtml(_dfVal(s))}</pre>`}</div>`).join('');
}
function _dfVal(s) {
  const v = s.value;
  if (s.id === 'hypotheses' && Array.isArray(v)) return v.map(h => `• ${h.cause}\n  experiment: ${h.experiment}`).join('\n');
  if (s.id === 'what_failed') return `${v.summary || ''}${v.evidence ? `\n${JSON.stringify(v.evidence, null, 1).slice(0, 1500)}` : ''}`;
  return JSON.stringify(v, null, 1).slice(0, 1500);
}

function dfHtml() {
  if (DF.error) return `<div class="ds"><div class="ds-label">failure modes</div><div class="cs-bad">${escapeHtml(DF.error)}</div></div>`;
  if (!DF.list) return '<div class="ds"><div class="ds-label">failure modes</div><div class="cs-dim">reading…</div></div>';
  if (!DF.list.length) return `<div class="ds"><div class="ds-label">failure modes · ${escapeHtml(DF.scope || '')}</div><div class="cs-dim">none recorded: a failed test, a phase that does not land, or a stuck run shows here with its report</div></div>`;
  const rows = DF.list.map(f => {
    const open = DF.open === f.uuid;
    return `<div class="df-row${open ? ' df-open' : ''}" data-id="${escapeHtml(f.uuid)}" onclick="dfOpen('${escapeHtml(f.uuid)}')">
      <div><span class="df-class">${escapeHtml(f.faultClass)}</span> <code>${escapeHtml(f.where || '')}</code>${f.occurrences >= 2 ? ` <span class="df-recur">recurring ×${f.occurrences}</span>` : ''}</div>
      <div class="cs-dim">${escapeHtml(f.summary || '')}${f.lastSeenAt ? ` · ${_dfWhen(f.lastSeenAt)}` : ''} · ${f.hasChain ? 'cause chain' : 'no cause chain yet'} · ${f.hasMacro ? 'macro' : 'no macro yet'}</div>
      ${open ? `<div class="df-report" onclick="event.stopPropagation()">${_dfReport()}</div>` : ''}</div>`;
  }).join('');
  return `<div class="ds"><div class="ds-label">failure modes · ${escapeHtml(DF.scope || '')} · ${DF.list.length}</div>${rows}</div>`;
}

function dfPaint() { const el = document.getElementById('debug-failures'); if (el) el.innerHTML = dfHtml(); }

// called by renderRepoDebug (app.js) after it paints: a slot of its own, filled from the routes
function dfMount(container, repo) {
  if (!container || !repo) return;
  let el = document.getElementById('debug-failures');
  if (!el) { el = document.createElement('div'); el.id = 'debug-failures'; container.appendChild(el); }
  if (DF.repo !== repo.uuid) { DF.list = null; DF.open = null; DF.one = null; }
  dfPaint(); dfLoad(repo);
}
