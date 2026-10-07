/* idearium/ui/js/repo-drawer-views.js — §0.46.0: the repo drawer's Phases, Versions and Machine views.
 * James: "where is any of this? like i dont see any changes." · "always add backend js first, then the ui. can you do
 * that. make sure you build the ui."
 *
 * Each view is the screen of a command that already exists (idearium/cli/route-commands.js), reading the same route:
 *   Phases   — idearium repo phasemap / repo phase <p> [build]   GET /api/repos/:uuid/phases, …/phases/runs, POST …/phases/build
 *   Versions — idearium repo versions                            GET /api/repos/:uuid/snapshots (VR1: every change a commit)
 *   Machine  — idearium store · idearium ollama tape [<run>]     GET /api/nexus/store, /api/nexus/tape[/:run]
 * They live in the Tasks drawer (repo-tasks.js) beside Background tasks, Activity log and Control: one drawer. */
const RT_MORE = { uuid: null, phases: null, open: new Set(), runs: {}, versions: null, store: null, tape: null, run: null, macro: null, busy: null, err: {} };

function _rmReset(uuid) { if (RT_MORE.uuid !== uuid) Object.assign(RT_MORE, { uuid, phases: null, open: new Set(), runs: {}, versions: null, err: {} }); }
function _rmWhen(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { hour12: false }).replace(',', '') : '—'; }
function _rmMB(b) { return `${((b || 0) / 1048576).toFixed(1)}MB`; }
function _rmErr(k) { return RT_MORE.err[k] ? `<div class="rt-sub-bad rt-pad">${_rtEsc(RT_MORE.err[k])}</div>` : ''; }
function _rmFilters(html) { const f = document.getElementById('rt-filters'); if (f) f.innerHTML = html; }

// ── Phases ──────────────────────────────────────────────────────────────────────────────────────────────────────────
async function rtPhasesLoad() {
  const uuid = _rtCurrent(); if (!uuid) return; _rmReset(uuid);
  try { RT_MORE.phases = await api(`/api/repos/${uuid}/phases`, {}, 30000); RT_MORE.err.phases = null; }
  catch (e) { RT_MORE.err.phases = e.message; }
  if (RT_VIEW === 'phases' && _rtDrawerOpen()) rtPhasesPaint();
}
function rtPhasesPaint() {
  const body = document.getElementById('rt-list'); if (!body) return;
  const d = RT_MORE.phases || {}, s = d.summary || {};
  _rmFilters(`<button class="rt-f" onclick="rtPhasesLoad()">↻ refresh</button><span class="rt-dim">${s.complete ?? '…'} of ${s.total ?? '…'} done · ${s.ready ?? 0} ready</span>${RT_MORE.busy ? `<span class="rt-dim"><span class="rt-spin"></span> ${_rtEsc(RT_MORE.busy)}…</span>` : ''}`);
  if (!RT_MORE.phases) { body.innerHTML = _rmErr('phases') || '<div class="rt-empty">reading the phasemaps…</div>'; return; }
  const ph = d.phases || [];
  if (!ph.length) { body.innerHTML = '<div class="rt-empty">no phasemap in this repo — nothing to build yet (a phasemap is a docs/*-phasemap.spec; expand the spec to make one)</div>'; return; }
  let h = _rmErr('phases'), map = '';
  for (const p of ph) {
    if (p.map !== map) { map = p.map; h += `<div class="rt-sec">${_rtEsc(String(map).split('/').pop())}</div>`; }
    const done = p.status === 'complete', blocked = !done && (p.blocked_by || []).length, lr = p.lastRun;
    const icon = done ? '<span class="rt-ok">✓</span>' : p.ready ? '<span class="rt-run">▸</span>' : blocked ? '<span class="rt-sub-bad">⊘</span>' : '<span class="rt-dim">·</span>';
    const why = lr && ['failed', 'blocked', 'stopped', 'unproven', 'timeout'].includes(lr.state) && lr.error ? `<div class="rt-sub-bad rt-pad">stopped: ${_rtEsc(String(lr.error).slice(0, 220))}</div>` : '';
    const key = `${p.map}::${p.phase_key}`;
    h += `<div class="rt-proc">${icon} <b>${_rtEsc(p.phase_key)}</b> <span>${_rtEsc(String(p.title || p.name || '').replace(/^[^·]*·\s*/, '').slice(0, 70))}</span>
      <span class="rt-dim">${blocked ? ` after ${_rtEsc(p.blocked_by.join(', '))}` : ''}${lr ? ` · last ${_rtEsc(lr.state || '')} ${_rmWhen(lr.ts)}${lr.provider ? ` · ${_rtEsc(lr.provider)}` : ''}` : ''}</span><span class="rt-grow"></span>
      <span class="rt-acts">${p.runs ? `<button class="rt-act" onclick="rtPhaseRuns(${_rtEsc(JSON.stringify(p.map))}, ${_rtEsc(JSON.stringify(p.phase_key))})">${RT_MORE.open.has(key) ? '▾' : '▸'} ${p.runs} run(s)</button>` : ''}${!done ? `<button class="rt-act" ${RT_MORE.busy ? 'disabled' : ''} onclick="rtPhaseBuild(${_rtEsc(JSON.stringify(p.map))}, ${_rtEsc(JSON.stringify(p.phase_key))})">▶ build</button>` : ''}</span></div>${why}`;
    if (RT_MORE.open.has(key)) {
      const rs = RT_MORE.runs[key];
      h += !rs ? '<div class="rt-dim rt-pad">reading its runs…</div>' : rs.map(r => `<div class="rt-pad rt-dim">${_rmWhen(r.ts)} <span class="${['failed', 'blocked', 'unproven'].includes(r.state) ? 'rt-sub-bad' : ''}">${_rtEsc(r.state || '?')}</span>${r.provider ? ` · ${_rtEsc(r.provider)}` : ''}${r.error ? ` — ${_rtEsc(String(r.error).slice(0, 200))}` : ''}</div>`).join('');
    }
  }
  body.innerHTML = h;
}
async function rtPhaseRuns(map, phase) {
  const key = `${map}::${phase}`, uuid = _rtCurrent();
  if (RT_MORE.open.has(key)) { RT_MORE.open.delete(key); return rtPhasesPaint(); }
  RT_MORE.open.add(key); rtPhasesPaint();
  try { const d = await api(`/api/repos/${uuid}/phases/runs?phase=${encodeURIComponent(phase)}`, {}, 20000); RT_MORE.runs[key] = (d.runs || []).filter(r => !r.map || r.map === map).sort((a, b) => (b.ts || 0) - (a.ts || 0)); }
  catch (e) { RT_MORE.runs[key] = [{ state: 'unreadable', error: e.message }]; }
  rtPhasesPaint();
}
async function rtPhaseBuild(map, phase) {
  const uuid = _rtCurrent(); if (!uuid || RT_MORE.busy) return;
  RT_MORE.busy = `starting ${phase}`; rtPhasesPaint();
  try {
    const d = await api(`/api/repos/${uuid}/phases/build`, { method: 'POST', body: JSON.stringify({ map, phase }) }, 120000);
    if (typeof toast === 'function') toast(`building ${phase}${d.ladder ? ` · ${d.ladder.rungs.join(' → ')}` : ''} — watch it in Background tasks`, 'ok');
  } catch (e) { if (typeof toast === 'function') toast(`${phase}: ${e.message}`, 'err'); RT_MORE.err.phases = `${phase}: ${e.message}`; }
  RT_MORE.busy = null; await rtPhasesLoad();
}

// ── Versions ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function rtVersionsLoad() {
  const uuid = _rtCurrent(); if (!uuid) return; _rmReset(uuid);
  try { RT_MORE.versions = await api(`/api/repos/${uuid}/snapshots`, {}, 30000); RT_MORE.err.versions = null; }
  catch (e) { RT_MORE.err.versions = e.message; }
  if (RT_VIEW === 'versions' && _rtDrawerOpen()) rtVersionsPaint();
}
function rtVersionsPaint() {
  const body = document.getElementById('rt-list'); if (!body) return;
  const l = (RT_MORE.versions && RT_MORE.versions.snapshots) || [];
  _rmFilters(`<button class="rt-f" onclick="rtVersionsLoad()">↻ refresh</button><span class="rt-dim">${l.length} commit(s) · every change is one (written, accepted, reverted, restored)</span>`);
  if (!RT_MORE.versions) { body.innerHTML = _rmErr('versions') || '<div class="rt-empty">reading versionium…</div>'; return; }
  body.innerHTML = _rmErr('versions') + (l.length ? l.slice(0, 200).map(c => `<div class="rt-proc"><span class="rt-run" title="${_rtEsc(c.commitId)}">${_rtEsc(String(c.commitId).slice(0, 10))}</span> <span class="rt-dim">${_rmWhen(c.ts)}</span> <span>${_rtEsc(String(c.message || '').slice(0, 110))}</span><span class="rt-grow"></span><span class="rt-dim">${c.files ? `${c.files.count} files` : ''}${c.tests ? ` · tests ${_rtEsc(c.tests)}` : ''}</span></div>`).join('')
    : '<div class="rt-empty">no commits yet — the next file change makes the first</div>');
}

// ── Machine: the store (cortex) and the Ollama tape ─────────────────────────────────────────────────────────────────
async function rtMachineLoad() {
  const [st, tp] = await Promise.all([
    api('/api/nexus/store', {}, 12000).catch(e => ({ error: e.message })),
    api('/api/nexus/tape', {}, 12000).catch(e => ({ error: e.message })),
  ]);
  RT_MORE.store = st; RT_MORE.tape = tp;
  if (RT_VIEW === 'machine' && _rtDrawerOpen()) rtMachinePaint();
}
async function rtTapeRun(run) {
  if (RT_MORE.run === run) { RT_MORE.run = null; RT_MORE.macro = null; return rtMachinePaint(); }
  RT_MORE.run = run; RT_MORE.macro = null; rtMachinePaint();
  try { RT_MORE.macro = await api(`/api/nexus/tape/${encodeURIComponent(run)}?chars=1500`, {}, 15000); }
  catch (e) { RT_MORE.macro = { error: e.message }; }
  rtMachinePaint();
}
function rtMachinePaint() {
  const body = document.getElementById('rt-list'); if (!body) return;
  _rmFilters('<button class="rt-f" onclick="rtMachineLoad()">↻ refresh</button><span class="rt-dim">all of Nexus — not only this repo</span>');
  const st = RT_MORE.store, tp = RT_MORE.tape;
  if (!st && !tp) { body.innerHTML = '<div class="rt-empty">reading cortex and ollama…</div>'; return; }
  let h = `<div class="rt-sec">Memory store <span class="rt-dim">cortex · ${st && st.totals ? `${_rmMB(st.totals.bytes)} live · ${_rmMB(st.totals.archiveBytes)} archived` : ''}</span></div>`;
  if (st && st.error) h += `<div class="rt-sub-bad rt-pad">${_rtEsc(st.error)}</div>`;
  for (const t of ((st && st.tables) || []).slice(0, 14)) h += `<div class="rt-proc"><b>${_rtEsc(t.table)}</b><span class="rt-grow"></span><span class="rt-dim">${_rmMB(t.baseBytes + t.segmentBytes)}${t.segments ? ` · ${t.segments} segment(s)` : ''}${t.cap ? ` · cap ${t.cap.toLocaleString()}` : ''}${t.archiveDays ? ` · archive ${t.archiveDays}d ${_rmMB(t.archiveBytes)}` : ''}</span></div>`;
  h += `<div class="rt-sec">Ollama tape <span class="rt-dim">every model call, recorded${tp && tp.replaying ? ` · <span class="rt-sub-bad">replaying ${_rtEsc(tp.replaying)}</span>` : ''}</span></div>`;
  if (tp && tp.error) h += `<div class="rt-sub-bad rt-pad">${_rtEsc(tp.error)}</div>`;
  const runs = (tp && tp.runs) || [];
  if (tp && !tp.error && !runs.length) h += '<div class="rt-dim rt-pad">nothing recorded yet — the next Ollama call is the first frame</div>';
  for (const r of runs) {
    h += `<div class="rt-proc"><button class="rt-act" onclick="rtTapeRun(${_rtEsc(JSON.stringify(r.run))})">${RT_MORE.run === r.run ? '▾' : '▸'}</button> <b title="${_rtEsc(r.run)}">${_rtEsc(String(r.hat || r.run).slice(0, 26))}</b> <span class="rt-dim">${_rmWhen(r.last)}</span><span class="rt-grow"></span><span class="rt-dim">${r.calls} call(s)${r.failed ? ` · <span class="rt-sub-bad">${r.failed} failed</span>` : ''} · ${(r.ms / 1000).toFixed(1)}s · ${_rtEsc(r.models.join(', '))}</span></div>`;
    if (RT_MORE.run === r.run) {
      const m = RT_MORE.macro;
      h += !m ? '<div class="rt-dim rt-pad">reading its calls…</div>' : m.error ? `<div class="rt-sub-bad rt-pad">${_rtEsc(m.error)}</div>`
        : (m.steps || []).map((s, i) => `<div class="rt-pad"><div class="rt-dim">${i + 1}. ${_rmWhen(s.at)} · ${_rtEsc(s.op)} · ${_rtEsc(s.model)} · seed ${_rtEsc(String(s.seed))}${s.timings && s.timings.tokensPerSec ? ` · ${s.timings.tokensPerSec} tok/s` : ''}${s.timings && s.timings.loadMs ? ` · load ${s.timings.loadMs}ms` : ''}${s.ok ? '' : ` · <span class="rt-sub-bad">${_rtEsc(s.error || 'failed')}</span>`}</div>
          ${s.prompt ? `<details><summary class="rt-dim">asked (${s.prompt.length} chars)</summary><pre class="rt-pre">${_rtEsc(s.prompt)}</pre></details>` : ''}
          ${s.answer ? `<details><summary class="rt-dim">answered (${s.answer.length} chars)</summary><pre class="rt-pre">${_rtEsc(s.answer)}</pre></details>` : ''}
          ${s.toolCalls ? `<div class="rt-dim">tools: ${_rtEsc(s.toolCalls.map(t => t.name).join(', '))}</div>` : ''}</div>`).join('')
          + `<div class="rt-dim rt-pad">replay this run without Ollama: set NEXUS_OLLAMA_REPLAY=${_rtEsc(r.run)}</div>`;
    }
  }
  body.innerHTML = h;
}

// the drawer's views beyond its first three — repo-tasks.js asks here (one list, no second drawer)
const RT_MORE_VIEWS = [['phases', 'Phases', rtPhasesLoad, rtPhasesPaint], ['versions', 'Versions', rtVersionsLoad, rtVersionsPaint], ['machine', 'Machine', rtMachineLoad, rtMachinePaint]];
