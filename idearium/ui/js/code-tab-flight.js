// idearium/ui/js/code-tab-flight.js — FR6 0.60.144: the Code tab's "flight" panel. Each agent run read whole.
// Product: flight-recorder
// James, 2026-10-17: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension."
// It reads GET /api/repos/:uuid/flight(/:runId) (lib/flight-data.js) and holds no logic of its own: every verdict, number and
// line comes from the route, so the panel can be thrown away and rebuilt (DB7, "ui floats ontop").
const FL = { list: null, totals: null, lines: [], error: null, open: null, one: null };

async function cxFlightLoad(repo) {
  try {
    const r = await api(`/api/repos/${repo.uuid}/flight?limit=40`, {}, 20000);
    FL.list = r.flights || []; FL.totals = r.totals || null; FL.lines = r.lines || []; FL.error = null;
  } catch (e) { FL.list = []; FL.error = (e.data && e.data.error) || e.message; }
  if (typeof CX !== 'undefined' && CX.panel === 'flight') _cxPaintPanel();
}

async function cxFlightOpen(runId) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (FL.open === runId) { FL.open = null; FL.one = null; _cxPaintPanel(); return; }
  FL.open = runId; FL.one = null; _cxPaintPanel();
  try { FL.one = await api(`/api/repos/${repo.uuid}/flight/${encodeURIComponent(runId)}`, {}, 20000); }
  catch (e) { FL.one = { lines: [`could not read this run: ${(e.data && e.data.error) || e.message}`] }; }
  if (FL.open === runId) _cxPaintPanel();
}

function _cxFlightMin(ms) { return ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round((ms || 0) / 1000)} s`; }

function _cxFlight() {
  if (FL.error) return `<div class="cs-empty cs-bad">${escapeHtml(FL.error)}</div>`;
  if (!FL.list) return '<div class="cs-empty">reading the flights…</div>';
  if (!FL.list.length) return '<div class="cs-empty">no phase runs yet: each run shows here with the agents it tried, what it cost, and what was spent on attempts that never landed</div>';
  const head = `<div class="fl-totals">${FL.lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>`;
  const rows = FL.list.map(f => {
    const open = FL.open === f.runId;
    const det = open ? `<div class="fl-detail">${FL.one ? (FL.one.lines || []).map(l => `<div class="${/^(STUCK|CRASHED|TURBULENT)/.test(l) ? 'cs-bad' : ''}">${escapeHtml(l)}</div>`).join('') : '<div class="cs-dim">reading…</div>'}</div>` : '';
    return `<div class="fl-run${open ? ' fl-run-open' : ''}" data-run="${escapeHtml(f.runId)}" onclick="cxFlightOpen('${escapeHtml(f.runId)}')">
      <div><span class="fl-v fl-v-${escapeHtml(f.verdict)}">${escapeHtml(f.verdict)}</span> <b>${escapeHtml(f.phase || '?')}</b>
        <span class="cs-dim">${f.attempts ? `${f.attempts} attempt(s) · ` : ''}${_cxFlightMin(f.wallMs)} · ${f.calls} call(s), ${f.wasted.calls} wasted</span></div>
      <div class="cs-dim">${(f.ladder || []).map(escapeHtml).join(' → ')}${f.calls ? ` · friction ${(+f.friction).toFixed(2)}${f.tension == null ? ' · tension unavailable' : ` · tension ${(+f.tension).toFixed(2)}`}` : ''}</div>
      ${f.why && f.verdict !== 'landed' ? `<div class="fl-why">${escapeHtml(String(f.why))}</div>` : ''}
      ${det}</div>`;
  }).join('');
  return head + rows;
}
