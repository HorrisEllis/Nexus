/* idearium/ui/js/repo-drawer-views.js — §0.46.0: the Versions and Machine views (§0.47.0 OS2: inside the Plan panel's
 * activity section; the Phases view was dropped — the plan's tasks are the phases).
 * James: "where is any of this? like i dont see any changes." · "always add backend js first, then the ui. can you do
 * that. make sure you build the ui."
 *
 * Each view is the screen of a command that already exists (idearium/cli/route-commands.js), reading the same route:
 *   Versions — idearium repo versions                            GET /api/repos/:uuid/snapshots (VR1: every change a commit)
 *   Machine  — idearium store · idearium ollama tape [<run>]     GET /api/nexus/store, /api/nexus/tape[/:run]
 * They live in the Tasks drawer (repo-tasks.js) beside Background tasks, Activity log and Control: one drawer. */
const RT_MORE = { uuid: null, file: null, versions: null, store: null, tape: null, run: null, macro: null, busy: null, err: {} };

function _rmReset(uuid) { if (RT_MORE.uuid !== uuid) Object.assign(RT_MORE, { uuid, file: null, versions: null, err: {} }); }
function _rmWhen(ts) { return ts ? new Date(ts).toLocaleString('en-GB', { hour12: false }).replace(',', '') : '—'; }
function _rmMB(b) { return `${((b || 0) / 1048576).toFixed(1)}MB`; }
function _rmErr(k) { return RT_MORE.err[k] ? `<div class="rt-sub-bad rt-pad">${_rtEsc(RT_MORE.err[k])}</div>` : ''; }
function _rmFilters(html) { const f = document.getElementById('rt-filters'); if (f) f.innerHTML = html; }

// ── Versions ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function rtVersionsLoad() {
  const uuid = _rtCurrent(); if (!uuid) return; _rmReset(uuid);
  try { RT_MORE.versions = await api(`/api/repos/${uuid}/snapshots`, {}, 30000); RT_MORE.err.versions = null; }
  catch (e) { RT_MORE.err.versions = e.message; }
  if (RT_VIEW === 'versions' && _rtDrawerOpen()) rtVersionsPaint();
}
function rtVersionsPaint() {
  const body = document.getElementById('rt-list'); if (!body) return;
  const all = (RT_MORE.versions && RT_MORE.versions.snapshots) || [];
  // §0.47.0 OS3 — opened from the Code tab on one file: only the commits that touched it (VR1 provenance), until cleared
  const f = RT_MORE.file, l = f ? all.filter(c => c.provenance && c.provenance.files.some(x => x.path === f)) : all;
  _rmFilters(`<button class="rt-f" onclick="rtVersionsLoad()">↻</button>${f ? `<button class="rt-f on" title="show every commit" onclick="RT_MORE.file=null;rtVersionsPaint()">${_rtEsc(f.split('/').pop())} ✕</button>` : ''}<span class="rt-dim">${l.length} commit(s)</span>`);
  if (!RT_MORE.versions) { body.innerHTML = _rmErr('versions') || '<div class="rt-empty">reading versionium…</div>'; return; }
  body.innerHTML = _rmErr('versions') + (l.length ? l.slice(0, 200).map(c => `<div class="rt-proc"><span class="rt-run" title="${_rtEsc(c.commitId)}">${_rtEsc(String(c.commitId).slice(0, 8))}</span> <span class="rt-dim">${_rmWhen(c.ts)}</span> <span class="rt-vmsg">${_rtEsc(String(c.message || '').slice(0, 110))}</span>${c.provenance && (c.provenance.files || []).length ? `<span class="rt-dim">${c.provenance.files.map(x => _rtEsc(x.path.split('/').pop())).slice(0, 4).join(' · ')}</span>` : ''}</div>`).join('')
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
// §0.47.0 OS2 — no Phases view: the phases ARE the plan's tasks (with ▶ build and why a step stopped) — no copy
const RT_MORE_VIEWS = [['versions', 'versions', rtVersionsLoad, rtVersionsPaint], ['machine', 'machine', rtMachineLoad, rtMachinePaint]];
