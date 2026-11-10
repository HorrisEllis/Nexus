/* cos/ui/automation/engine.js — the automation engine in COS's Automation tab (AE5, 0.60.461; docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec).
   James, 2026-11-08: "just need the automation engine fully built and in the automation tab" · "cos is the orchastrator" · "idearium pipeline. also
   has to be real .pipeline files. it must be exportable and importable."
   Reads and acts only through COS's door, /api/cos/automation/* (the engine, AE6 slice a) and /api/cos/boxes (Emerge's box shape, for ERAVOS).
   A pipeline: run it (live, step by step), export it as its real .pipeline node file, import one, open it on ERAVOS's canvas (.erv). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); return e; };
  const api = async (method, p, body) => { const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); const j = await r.json().catch(() => ({ ok: false, error: `not JSON (${r.status})` })); if (!r.ok || j.ok === false) { const e = new Error(j.error || (j.problems || []).join('; ') || `${method} ${p}: ${r.status}`); e.body = j; throw e; } return j; };
  const A = (p) => '/api/cos/automation' + p;
  const say = (cls, t) => { const m = $('ae-msg'); m.className = 'ae-msg ' + cls; m.textContent = t; };
  const ago = (t) => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
  const took = (r) => r && r.finishedAt && r.startedAt ? r.finishedAt - r.startedAt : null;
  const secs = (ms) => ms == null ? '' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
  const dur = (ms) => ms == null ? '' : ms < 1000 ? (ms < 10 ? ms.toFixed(1) : Math.round(ms)) + ' ms' : secs(ms);   // PC8 slice a: a step's delta and baseline, readable at any size
  const download = (name, text, type) => { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })), download: name }); document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
  const S = { tab: 'pipelines', pipes: [], sel: null, run: null, poll: null };

  // ── tabs ──
  document.querySelectorAll('.ae-tab').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  function show(tab) { S.tab = tab; document.querySelectorAll('.ae-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.ae-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'workflows') flows(); if (tab === 'runs') runs(); if (tab === 'log') log(); }

  // ── pipelines ──
  async function pipes() {
    try { const d = await api('GET', A('/pipelines')); S.pipes = d.pipelines || []; $('n-pipelines').textContent = S.pipes.length;
      $('ae-pipes').replaceChildren(...(S.pipes.length ? S.pipes.map(p => el('div', { class: 'ae-row' + (S.sel === p.id ? ' sel' : ''), 'data-pipeline': p.id, onclick: () => open(p.id) }, [
        el('span', { text: p.name || p.id }), el('span', { class: 'st', text: (p.tasks || []).length + ' steps' }),
        el('small', { text: [p.description ? String(p.description).slice(0, 90) : '', p.site ? 'site ' + p.site : ''].filter(Boolean).join(' · ') || p.id })])) : [el('p', { class: 'muted', text: 'No pipelines yet. Import a .pipeline, or make one in a pipeline editor.' })]));
    } catch (e) { $('ae-pipes').textContent = e.message; }
  }
  async function open(id) {
    S.sel = id; S.run = null; document.querySelectorAll('#ae-pipes .ae-row').forEach(r => r.classList.toggle('sel', r.dataset.pipeline === id));
    const p = S.pipes.find(x => x.id === id); if (!p) return;
    $('ae-p-title').textContent = p.name || p.id; $('ae-p-tag').textContent = (p.tasks || []).length + ' steps';
    let last = null; try { const r = await api('GET', A('/pipeline-runs?pipelineId=' + encodeURIComponent(id) + '&limit=1')); last = (r.runs || [])[0] || null; } catch (_) {}
    // PC8 slice a (2026-11-10, his "each step can be used as a progress status, with an indicator or bar"): each step's baseline over its runs
    try { S.base = await api('GET', '/api/cos/pipeline/baseline?pipeline=' + encodeURIComponent(id)); } catch (_) { S.base = null; }
    S.run = last; draw(p);
    if (last && last.status === 'running') follow(last.id);
  }
  function draw(p) {
    const run = S.run, t = run ? run.tasks || {} : {};
    const btns = el('div', { class: 'ae-btns' }, [
      el('button', { class: 'btn primary', 'data-act': 'run', onclick: () => runIt(p.id), text: '▶ Run' }),
      run && run.status === 'running' ? el('button', { class: 'btn', 'data-act': 'stop', onclick: () => stopIt(run.id), text: '■ Stop' }) : null,
      el('button', { class: 'btn', 'data-act': 'export', onclick: () => exportIt(p), text: '⇩ Export .pipeline' }),
      el('button', { class: 'btn', 'data-act': 'erv', onclick: () => ervIt(p), text: '⧉ Open on canvas (.erv)' })]);
    const base = (S.base && S.base.steps) || {};
    const steps = el('div', { class: 'ae-steps' }, (p.tasks || []).map(k => { const r = t[k.id] || {}; const st = r.status || (run ? 'waiting' : ''); const b = base[k.id];
      // the bar: this step's delta against its baseline (a running step grows toward its usual time); no baseline yet → no bar, said by its absence
      const ms = typeof r.ms === 'number' ? r.ms : (st === 'running' && r.startedAt ? Date.now() - r.startedAt : null);
      const pct = b && b.mean_ms > 0 && ms != null ? Math.min(100, Math.round(ms / b.mean_ms * 100)) : null;
      const off = b && typeof b.z === 'number' && Math.abs(b.z) > 2;
      const bar = pct != null ? el('span', { class: 'ae-bar' + (off ? ' off' : ''), title: `${pct}% of its baseline`, 'data-pct': String(pct) }, [el('span', { class: 'ae-bar-fill', style: `width:${pct}%` })]) : null;
      const baseTxt = b ? `baseline ${dur(b.mean_ms)}${b.sigma_ms != null ? ' ± ' + dur(b.sigma_ms) : ''} over ${b.n} run${b.n === 1 ? '' : 's'}${b.sigma_ms == null ? ' (a sigma from 3)' : ''}${b.wait_mean_ms != null && (k.depends_on || []).length ? ' · waits ' + dur(b.wait_mean_ms) : ''}${off ? ` · ${b.z > 0 ? 'slower' : 'faster'} than usual (z ${b.z.toFixed(1)})` : ''}` : '';
      const decisions = (r.decisions || []).map(d => el('div', { class: 'ae-decision', 'data-by': d.by || '' }, [el('span', { class: 'mono', text: (d.by || 'decision').toUpperCase() }),
        el('span', { text: d.kind === 'agent.provider' ? `chose ${d.chose}${d.asked && d.asked !== d.chose ? ' (asked for ' + d.asked + ')' : ''}` : `${d.kind || ''} ${d.chose || ''}` }), d.why ? el('span', { class: 'why', text: d.why }) : null]));
      return el('div', { class: 'ae-step', 'data-step': k.id, 'data-state': st }, [el('span', { text: k.label || k.id }), el('span', { class: 'mono', text: dur(r.ms) }), bar, el('span', { class: 'st ' + st, text: st || '—' }),
        r.error ? el('span', { class: 'why', text: r.error }) : (k.depends_on || []).length ? el('span', { class: 'why', text: 'after ' + k.depends_on.join(', ') }) : null,
        baseTxt ? el('span', { class: 'ae-base muted', text: baseTxt }) : null, ...decisions]); }));
    const head = run ? el('p', { class: 'muted', text: `run ${String(run.id).slice(0, 8)} · ${run.status} · started ${ago(run.startedAt)}${took(run) != null ? ' · ' + secs(took(run)) : ''}` }) : el('p', { class: 'muted', text: 'Not run yet.' });
    $('ae-p-body').replaceChildren(btns, head, steps);
  }
  // 2026-11-10: a value a step's address needs, left empty, is asked for before the run starts (the engine answers { needs }), never a broken
  // address three steps in ("GET /api/repos//phases/map")
  async function runIt(id, vars = {}) {
    try { const r = await api('POST', A('/pipelines/' + encodeURIComponent(id) + '/run'), { by: 'person', vars }); const runId = r.runId || (r.run && r.run.id); say('ok', 'Running ' + (S.pipes.find(x => x.id === id) || {}).name);
      if (runId) { try { S.run = (await api('GET', A('/pipeline-runs/' + encodeURIComponent(runId)))).run; } catch (_) {} draw(S.pipes.find(x => x.id === id)); follow(runId); } }
    catch (e) {
      const needs = (e.body && e.body.needs) || [];
      if (needs.length) { const v = { ...vars }; for (const n of needs) { const a = window.prompt(`This run needs ${n} (it is part of a step's address):`, ''); if (a == null || !a.trim()) return say('bad', `Not run: ${n} was not given`); v[n] = a.trim(); } return runIt(id, v); }
      say('bad', e.message);
    }
  }
  async function stopIt(runId) { try { await api('POST', A('/pipeline-runs/' + encodeURIComponent(runId) + '/cancel'), { by: 'person' }); say('ok', 'Stopped'); } catch (e) { say('bad', e.message); } }
  function follow(runId) {
    clearInterval(S.poll); S.poll = setInterval(async () => {
      try { const r = await api('GET', A('/pipeline-runs/' + encodeURIComponent(runId))); S.run = r.run; const p = S.pipes.find(x => x.id === S.sel); if (p) draw(p);
        if (r.run.status !== 'running') { clearInterval(S.poll); S.poll = null; say(r.run.status === 'done' ? 'ok' : 'bad', `${p ? p.name : 'The pipeline'}: ${r.run.status}`); } }
      catch (_) {} }, 1000);
  }
  async function exportIt(p) { try { const r = await api('GET', A('/pipelines/' + encodeURIComponent(p.id) + '/node')); download(r.filename || (p.name || p.id) + '.pipeline', r.text, 'text/yaml');
    say('ok', 'Exported ' + (r.filename || p.id) + (r.missing && r.missing.length ? ' — not bundled: ' + r.missing.join(', ') : '')); } catch (e) { say('bad', e.message); } }
  async function ervIt(p) { try { const r = await api('GET', '/api/cos/boxes?as=erv&pipeline=' + encodeURIComponent(p.id)); download((p.name || p.id) + '.erv', JSON.stringify(r.erv, null, 1), 'text/yaml');
    say('ok', 'Saved ' + (p.name || p.id) + '.erv — open it in ERAVOS (Start › Open, or drop it on the canvas)'); } catch (e) { say('bad', e.message); } }
  $('ae-import').addEventListener('change', async (ev) => { const f = ev.target.files && ev.target.files[0]; if (!f) return; ev.target.value = '';
    // 2026-11-10: a pipeline drawn on ERAVOS's canvas (.erv) is made into a .pipeline by COS (box.eg from_erv), then shown like any other
    try { const text = await f.text(); const r = /\.erv$/i.test(f.name) ? await api('POST', '/api/cos/pipeline/from-erv', { text, by: 'person' }) : await api('POST', A('/import'), { text, by: 'person' }); say('ok', 'Imported ' + f.name + (r.pipeline ? ' as ' + (r.pipeline.name || r.pipeline.id) : '')); await pipes(); if (r.pipeline && r.pipeline.id) open(r.pipeline.id); }
    catch (e) { say('bad', f.name + ': ' + e.message); } });

  // ── workflows, runs, log ──
  async function flows() { try { const d = await api('GET', A('/workflows')); const ws = d.workflows || []; $('n-workflows').textContent = ws.length;
    $('ae-flows').replaceChildren(...(ws.length ? ws.map(w => el('div', { class: 'ae-row', 'data-workflow': w.id }, [el('span', { text: w.name || w.id }),
      el('button', { class: 'btn', onclick: async (ev) => { ev.stopPropagation(); try { await api('POST', A('/workflows/' + encodeURIComponent(w.id) + '/run'), { by: 'person' }); say('ok', 'Ran ' + (w.name || w.id)); } catch (e) { say('bad', e.message); } }, text: '▶ Run' }),
      el('small', { text: [(w.steps || []).length + ' steps', w.trigger && w.trigger.type ? 'trigger ' + w.trigger.type : '', w.enabled === false ? 'off' : ''].filter(Boolean).join(' · ') })])) : [el('p', { class: 'muted', text: 'No workflows yet.' })]));
  } catch (e) { $('ae-flows').textContent = e.message; } }
  async function runs() { try { const d = await api('GET', A('/pipeline-runs?limit=30')); const rs = d.runs || []; $('n-runs').textContent = rs.filter(r => r.status === 'running').length ? rs.filter(r => r.status === 'running').length + ' live' : '';
    $('ae-runs').replaceChildren(...(rs.length ? rs.map(r => el('div', { class: 'ae-row', 'data-run': r.id }, [el('span', { text: r.pipelineName || r.pipelineId }), el('span', { class: 'st ' + r.status, text: r.status }),
      el('small', { text: `started ${ago(r.startedAt)}${took(r) != null ? ' · ' + secs(took(r)) : ''} · ${Object.values(r.tasks || {}).filter(t => t.status === 'done').length}/${Object.keys(r.tasks || {}).length} steps done` })])) : [el('p', { class: 'muted', text: 'No runs yet.' })]));
  } catch (e) { $('ae-runs').textContent = e.message; } }
  async function log() { try { const d = await api('GET', A('/log?limit=200')); const ls = (d.log || d.entries || d.lines || []).slice().reverse();
    $('ae-log').replaceChildren(el('div', { class: 'ae-log', text: ls.length ? ls.map(x => typeof x === 'string' ? x : `${x.ts ? new Date(x.ts).toLocaleTimeString() : ''} ${x.level || ''} ${x.message || x.text || JSON.stringify(x)}`).join('\n') : 'Nothing logged yet.' }));
  } catch (e) { $('ae-log').textContent = e.message; } }

  pipes(); flows();
  window.AUTOMATION = { show, open, pipes, state: S };
})();
