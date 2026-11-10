/* cos/ui/automation/engine.js — the automation engine in COS's Automation tab (AE5, 0.60.461; docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec).
   James, 2026-11-08: "just need the automation engine fully built and in the automation tab" · "cos is the orchastrator" · "idearium pipeline. also
   has to be real .pipeline files. it must be exportable and importable."
   Reads and acts only through COS's door, /api/cos/automation/* (the engine, AE6 slice a) and /api/cos/boxes (Emerge's box shape, for ERAVOS).
   A pipeline: run it (live, step by step), export it as its real .pipeline node file, import one, open it on ERAVOS's canvas (.erv). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); return e; };
  const api = async (method, p, body) => { const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); const j = await r.json().catch(() => ({ ok: false, error: `not JSON (${r.status})` })); if (!r.ok || j.ok === false) throw new Error(j.error || (j.problems || []).join('; ') || `${method} ${p}: ${r.status}`); return j; };
  const A = (p) => '/api/cos/automation' + p;
  const say = (cls, t) => { const m = $('ae-msg'); m.className = 'ae-msg ' + cls; m.textContent = t; };
  const ago = (t) => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
  const took = (r) => r && r.finishedAt && r.startedAt ? r.finishedAt - r.startedAt : null;
  const secs = (ms) => ms == null ? '' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
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
    const steps = el('div', { class: 'ae-steps' }, (p.tasks || []).map(k => { const r = t[k.id] || {}; const st = r.status || (run ? 'waiting' : '');
      return el('div', { class: 'ae-step', 'data-step': k.id, 'data-state': st }, [el('span', { text: k.label || k.id }), el('span', { class: 'mono', text: secs(r.ms) }), el('span', { class: 'st ' + st, text: st || '—' }),
        r.error ? el('span', { class: 'why', text: r.error }) : (k.depends_on || []).length ? el('span', { class: 'why', text: 'after ' + k.depends_on.join(', ') }) : null]); }));
    const head = run ? el('p', { class: 'muted', text: `run ${String(run.id).slice(0, 8)} · ${run.status} · started ${ago(run.startedAt)}${took(run) != null ? ' · ' + secs(took(run)) : ''}` }) : el('p', { class: 'muted', text: 'Not run yet.' });
    $('ae-p-body').replaceChildren(btns, head, steps);
  }
  async function runIt(id) {
    try { const r = await api('POST', A('/pipelines/' + encodeURIComponent(id) + '/run'), { by: 'person' }); const runId = r.runId || (r.run && r.run.id); say('ok', 'Running ' + (S.pipes.find(x => x.id === id) || {}).name);
      if (runId) { try { S.run = (await api('GET', A('/pipeline-runs/' + encodeURIComponent(runId)))).run; } catch (_) {} draw(S.pipes.find(x => x.id === id)); follow(runId); } }
    catch (e) { say('bad', e.message); }
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
