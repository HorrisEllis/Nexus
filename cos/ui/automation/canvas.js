/* cos/ui/automation/canvas.js — the pipeline canvas in COS's Automation tab (PC4 slice 1, 0.60.536; docs/2026-11-08-pipeline-canvas-phasemap.spec).
   James, 2026-11-14: "okay. thats more like it. and this lives in the cos ui when you click edit pipeline." · "the pipeline runs in the canvas. the
   workshop only edits one gate or step at a time" · "better but the tabs slide out from the side like ideariums ui." · "Vital. The pipeline."
   The look he approved: cos/ui/pipeline-editor/preview-11 and preview-9. Reads and writes only through COS's door, /api/cos/automation/*
   (the engine, cos/automation/routes.js): GET a pipeline and its layers, PUT it, run, pause, continue, cancel, retry from a step. The pipeline
   stays one agnostic .pipeline (cos/spec/pipeline.spec addendum e): what is edited here is what Clear Glass's settings and the CLI see.
   UI code in JavaScript: COS's pages are JavaScript today (said, §17.13). */
(function () {
  'use strict';
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a)) { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const c of [].concat(kids)) if (c) e.append(c); return e; };
  const api = async (method, p, body) => { const r = await fetch(p, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); const j = await r.json().catch(() => ({ ok: false, error: `not JSON (${r.status})` })); if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  const A = (p) => '/api/cos/automation' + p;
  const W = 176, H = 56, GX = 92, GY = 104, X0 = 300, Y0 = 70;
  const C = { root: null, p: null, layers: [], run: null, sel: null, dirty: false, tab: null, poll: null, hooks: {} };

  function build() {
    if (C.root) return;
    C.root = el('div', { class: 'pc', id: 'pc', role: 'dialog', 'aria-label': 'pipeline canvas' });
    C.top = el('div', { class: 'pc-top' }, [el('b', { text: 'PIPELINE' }), C.name = el('span', { class: 'nm' }),
      el('button', { class: 'pc-btn', 'data-act': 'add', onclick: addStep, text: '＋ Add' }), el('span', { class: 'pc-sp' }),
      C.saveBtn = el('button', { class: 'pc-btn save', 'data-act': 'save', onclick: save, text: 'Save', disabled: '' }),
      el('button', { class: 'pc-btn', 'data-act': 'close', onclick: close, text: '✕ Close' })]);
    C.field = el('div', { class: 'pc-field' });
    C.rail = el('nav', { class: 'pc-rail' }, ['OUTPUTS', 'EDIT', 'RUNS'].map(t => el('span', { class: 'pc-vt', 'data-tab': t, onclick: () => tab(C.tab === t ? null : t), text: t })));
    C.drawer = el('aside', { class: 'pc-drawer' }, [el('div', { class: 'pc-dh' }, [C.dt = el('b'), C.ds = el('small'), el('button', { class: 'x', onclick: () => tab(null), text: '⇥', title: 'slide back' })]), C.db = el('div', { class: 'pc-db' })]);
    C.hint = el('div', { class: 'pc-hint', text: 'double-click a step or gate to edit it · the right tabs slide out' });
    C.root.append(C.top, C.field, C.drawer, C.rail, C.hint);
    document.body.append(C.root);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && C.root.classList.contains('open')) { if (C.tab) tab(null); else close(); } });
  }

  async function open(id, hooks = {}) {
    build(); C.hooks = hooks; C.sel = null; C.dirty = false; C.tab = null;
    const d = await api('GET', A('/pipelines/' + encodeURIComponent(id)));
    C.p = JSON.parse(JSON.stringify(d.pipeline)); C.layers = d.layers || [];
    C.root.classList.add('open'); await refreshRun(); draw(); tab(null);
    clearInterval(C.poll); C.poll = setInterval(async () => { if (!C.root.classList.contains('open')) return; const was = JSON.stringify(C.run && C.run.tasks); await refreshRun(); if (JSON.stringify(C.run && C.run.tasks) !== was) { draw(); if (C.tab === 'OUTPUTS') tab('OUTPUTS'); } }, 1500);
  }
  function close() { if (C.dirty && !confirm('Close without saving the changes?')) return; C.root.classList.remove('open'); clearInterval(C.poll); if (C.hooks.onClose) C.hooks.onClose(); }
  async function refreshRun() { try { const r = await api('GET', A('/pipeline-runs?pipelineId=' + encodeURIComponent(C.p.id) + '&limit=1')); const last = (r.runs || [])[0]; C.run = last ? (await api('GET', A('/pipeline-runs/' + encodeURIComponent(last.id)))).run : null; } catch (_) { C.run = null; } }

  // the layers the engine gives (a task depends only on earlier layers); recomputed locally after an edit
  function layersOf(tasks) {
    const ids = new Set(tasks.map(t => t.id)), level = {}, seen = new Set();
    const lv = (t, stack = new Set()) => { if (level[t.id] != null) return level[t.id]; if (stack.has(t.id)) return 0; stack.add(t.id);
      const deps = (t.depends_on || []).filter(x => ids.has(x)).map(x => lv(tasks.find(y => y.id === x), stack)); return (level[t.id] = deps.length ? Math.max(...deps) + 1 : 0); };
    tasks.forEach(t => lv(t)); const out = []; for (const t of tasks) { (out[level[t.id]] = out[level[t.id]] || []).push(t.id); seen.add(t.id); } return out.filter(Boolean);
  }
  const pos = {};
  function draw() {
    const tasks = C.p.tasks || []; const L = C.dirty ? layersOf(tasks) : (C.layers.length ? C.layers : layersOf(tasks));
    for (const k in pos) delete pos[k];
    L.forEach((ids, col) => ids.forEach((id, row) => { pos[id] = { x: X0 + col * (W + GX), y: Y0 + row * GY + (col % 2 ? 18 : 0) }; }));
    tasks.filter(t => !pos[t.id]).forEach((t, i) => { pos[t.id] = { x: X0 + L.length * (W + GX), y: Y0 + i * GY }; });
    const maxX = Math.max(900, ...Object.values(pos).map(p => p.x + W + 60)), maxY = Math.max(500, ...Object.values(pos).map(p => p.y + H + 80));
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'pc-svg'); svg.setAttribute('width', maxX); svg.setAttribute('height', maxY);
    const st = (id) => (C.run && C.run.tasks && C.run.tasks[id] && C.run.tasks[id].status) || '';
    const kids = [svg];
    for (const t of tasks) {
      const p = pos[t.id];
      for (const dep of t.depends_on || []) { const q = pos[dep]; if (!q) continue;
        const x1 = q.x + W, y1 = q.y + H / 2, x2 = p.x, y2 = p.y + H / 2, mx = (x1 + x2) / 2;
        const path = document.createElementNS(NS, 'path'); path.setAttribute('d', `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`); path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '2');
        const s = st(dep); path.setAttribute('stroke', s === 'done' ? '#00ff88' : s === 'failed' ? '#ff3355' : s === 'running' ? '#00d4ff' : '#2d3f57'); if (!s) path.setAttribute('stroke-dasharray', '5 5'); path.setAttribute('opacity', s === 'done' ? '.7' : '1'); svg.append(path); }
      const r = (C.run && C.run.tasks && C.run.tasks[t.id]) || {};
      kids.push(el('div', { class: 'pc-node' + (C.sel && C.sel.id === t.id && C.sel.kind === 'step' ? ' sel' : ''), 'data-step': t.id, 'data-state': st(t.id), title: r.error || r.note || '',
        onclick: () => select('step', t.id), ondblclick: () => { select('step', t.id); tab('EDIT'); } },
        [el('b', { text: t.label || t.id }), el('small', { text: kindOf(t) })]));
      if (t.gate) { const gx = p.x + W + 12, gy = p.y + H / 2 - 9, g = r.gate || null;
        kids.push(el('div', { class: 'pc-gate' + (C.sel && C.sel.id === t.id && C.sel.kind === 'gate' ? ' sel' : ''), 'data-gate': t.id, 'data-outcome': g ? g.outcome : '', style: `left:${gx}px;top:${gy}px`, title: g && g.why ? g.why : 'gate',
          onclick: () => select('gate', t.id), ondblclick: () => { select('gate', t.id); tab('EDIT'); } }));
        kids.push(el('div', { class: 'pc-gl', style: `left:${gx - 51}px;top:${gy + 24}px`, text: gateText(t.gate) })); }
      kids[kids.length - (t.gate ? 3 : 1)].style.cssText = `left:${p.x}px;top:${p.y}px`;
    }
    kids.push(runWin());
    C.field.replaceChildren(...kids);
    C.name.textContent = C.p.name || C.p.id; C.saveBtn.toggleAttribute('disabled', !C.dirty);
  }
  const kindOf = (t) => { const s = t.step || {}; const c = s.config || {}; if (s.type === 'api') { const u = String(c.url || ''); const m = u.match(/^nexus:\/\/([^/]+)/); return `${(c.method || 'GET')} · ${m ? m[1] : u.replace(/^https?:\/\//, '').split('/')[0]}`; } return s.type || t.kind || 'step'; };
  const gateText = (g) => g.contains ? `has ${String(g.contains).slice(0, 18)}` : g.type ? g.type : Object.keys(g).join(' ') || 'gate';

  function runWin() {
    const run = C.run, tasks = C.p.tasks || [], done = run ? tasks.filter(t => (run.tasks[t.id] || {}).status === 'done').length : 0;
    const on = run && run.tasks ? tasks.find(t => (run.tasks[t.id] || {}).status === 'running') : null;
    const status = run ? run.status : 'not run';
    const b = (act, text, fn, cls = '') => el('button', { class: 'pc-btn ' + cls, 'data-act': act, onclick: fn, text });
    const h = C.hooks;
    const btns = [];
    if (run && run.status === 'running') btns.push(b('pause', '❚❚', () => h.ctl && h.ctl(run.id, 'pause').then(tick)), b('stop', '■', () => h.stop && h.stop(run.id).then(tick)));
    else if (run && run.status === 'paused') btns.push(b('continue', '▶ Continue', () => h.ctl && h.ctl(run.id, 'continue').then(tick), 'go'));
    else { if (run && (run.status === 'failed' || run.status === 'cancelled')) btns.push(b('retry', C.sel && C.sel.kind === 'step' ? '↻ from here' : '↻ Retry', () => h.retry && h.retry(run.id, C.sel && C.sel.kind === 'step' ? C.sel.id : undefined).then(tick)));
      btns.push(b('run', '▶ Run', () => { if (C.dirty) { say('bad', 'Save first: a run runs the saved pipeline.'); tab('EDIT'); return; } h.run && Promise.resolve(h.run(C.p.id)).then(tick); }, 'go')); }
    return el('div', { class: 'pc-run' }, [el('h3', {}, [el('span', { text: C.p.name || C.p.id }), el('small', { class: status, text: '● ' + status })]),
      el('div', { class: 'pc-row' }, [el('span', { text: 'step' }), el('em', { text: run ? `${done} of ${tasks.length}${on ? ' · ' + (on.label || on.id) : ''}` : `${tasks.length} steps` })]),
      run && run.startedAt ? el('div', { class: 'pc-row' }, [el('span', { text: 'started' }), el('em', { text: new Date(run.startedAt).toLocaleTimeString() })]) : null,
      el('div', { class: 'pc-btns' }, btns)]);
  }
  async function tick() { await refreshRun(); draw(); if (C.tab) tab(C.tab); }
  function select(kind, id) { C.sel = { kind, id }; draw(); if (C.tab) tab(C.tab); }

  // ── the right tabs, sliding out ──
  function tab(t) {
    C.tab = t; C.rail.querySelectorAll('.pc-vt').forEach(v => v.classList.toggle('on', v.dataset.tab === t)); C.drawer.classList.toggle('open', !!t);
    if (!t) return; C.dt.textContent = t;
    const task = C.sel ? (C.p.tasks || []).find(x => x.id === C.sel.id) : null;
    C.ds.textContent = task ? (C.sel.kind === 'gate' ? '◇ gate after ' : '') + (task.label || task.id) : 'pick a step';
    if (t === 'OUTPUTS') return outputs(task);
    if (t === 'EDIT') return task ? (C.sel.kind === 'gate' ? editGate(task) : editStep(task)) : C.db.replaceChildren(el('p', { class: 'pc-say', text: 'Click a step or gate on the canvas, then edit it here. ＋ Add makes a new step.' }));
    if (t === 'RUNS') return runsList();
  }
  function outputs(task) {
    const r = task && C.run && C.run.tasks ? C.run.tasks[task.id] || {} : null;
    if (!task) return C.db.replaceChildren(el('p', { class: 'pc-say', text: 'Click a step to see what it gave.' }));
    if (!r || !r.status) return C.db.replaceChildren(el('p', { class: 'pc-say', text: C.run ? 'This step has not run in the last run.' : 'Not run yet.' }));
    const out = r.error ? String(r.error) : r.held ? 'waits for you: ' + r.held.why : typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2);
    C.db.replaceChildren(...[el('div', { class: 'pc-row' }, [el('span', { text: r.status }), el('em', { text: r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : '' })]),
      el('div', { class: 'pc-term' + (r.error ? ' err' : ''), 'data-out': task.id, text: out || '(nothing)' }),
      r.gate ? el('p', { class: 'pc-say ' + (r.gate.outcome === 'open' ? 'ok' : 'bad'), text: `gate ${r.gate.outcome}${r.gate.why ? ': ' + r.gate.why : ''}` }) : null,
      ...(r.decisions || []).map(d => el('p', { class: 'pc-say', text: `${(d.by || 'decision').toUpperCase()} ${d.kind || ''} ${d.chose || ''}${d.why ? ' — ' + d.why : ''}` }))].filter(Boolean));
  }
  async function runsList() { let rs = []; try { rs = (await api('GET', A('/pipeline-runs?pipelineId=' + encodeURIComponent(C.p.id) + '&limit=20'))).runs || []; } catch (e) { return C.db.replaceChildren(el('p', { class: 'pc-say bad', text: e.message })); }
    C.db.replaceChildren(el('div', { class: 'pc-list' }, rs.length ? rs.map(r => el('div', { text: `${String(r.id).slice(0, 8)} · ${r.status} · ${r.startedAt ? new Date(r.startedAt).toLocaleString() : ''}` })) : [el('div', { text: 'No runs yet.' })])); }
  const field = (label, input) => el('div', { class: 'pc-kv' }, [el('label', { text: label }), input]);
  function editStep(t) {
    const s = t.step || (t.step = { type: 'api', config: {} }); const c = s.config || (s.config = {});
    const f = { id: el('input', { value: t.id, 'data-f': 'id' }), label: el('input', { value: t.label || '', 'data-f': 'label' }),
      deps: el('input', { value: (t.depends_on || []).join(', '), 'data-f': 'depends_on', placeholder: 'ids of the steps before it, comma separated' }),
      type: el('select', { 'data-f': 'type' }, [...new Set([s.type, 'api', 'agent', 'command', 'macro', 'workflow', 'pipeline', 'delay', 'set'].filter(Boolean))].map(x => { const o = el('option', { value: x, text: x }); if (x === s.type) o.selected = true; return o; })),
      url: el('input', { value: c.url || '', 'data-f': 'url', placeholder: 'nexus://<system>/api/…' }), method: el('input', { value: c.method || 'GET', 'data-f': 'method' }),
      body: el('textarea', { 'data-f': 'body' }), other: el('textarea', { 'data-f': 'config' }) };
    f.body.value = c.body || ''; const rest = { ...c }; delete rest.url; delete rest.method; delete rest.body; f.other.value = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    const said = el('p', { class: 'pc-say' });
    const apply = () => { try {
      const id = f.id.value.trim(); if (!id) throw new Error('a step needs an id'); if (id !== t.id && (C.p.tasks || []).some(x => x.id === id)) throw new Error(`another step is already ${id}`);
      if (id !== t.id) { for (const x of C.p.tasks) x.depends_on = (x.depends_on || []).map(d => d === t.id ? id : d); t.id = id; C.sel.id = id; }
      t.label = f.label.value.trim() || undefined; t.depends_on = f.deps.value.split(',').map(x => x.trim()).filter(Boolean);
      const extra = f.other.value.trim() ? JSON.parse(f.other.value) : {};
      t.step = { type: f.type.value, config: { ...extra, ...(f.url.value.trim() ? { url: f.url.value.trim(), method: f.method.value.trim() || 'GET' } : {}), ...(f.body.value.trim() ? { body: f.body.value } : {}) } };
      C.dirty = true; draw(); said.className = 'pc-say ok'; said.textContent = 'Applied on the canvas. Save writes it to the pipeline.';
    } catch (e) { said.className = 'pc-say bad'; said.textContent = e.message; } };
    const remove = () => { if (!confirm(`Remove ${t.label || t.id}?`)) return; C.p.tasks = C.p.tasks.filter(x => x !== t); for (const x of C.p.tasks) x.depends_on = (x.depends_on || []).filter(d => d !== t.id); C.sel = null; C.dirty = true; draw(); tab('EDIT'); };
    C.db.replaceChildren(field('id', f.id), field('label', f.label), field('runs after', f.deps), field('kind', f.type), field('address', f.url), field('method', f.method), field('body', f.body), field('other settings (JSON)', f.other),
      el('div', { class: 'pc-btns', style: 'display:flex;gap:8px' }, [el('button', { class: 'pc-btn go', 'data-act': 'apply', onclick: apply, text: 'Apply' }), el('button', { class: 'pc-btn', onclick: () => { t.gate = t.gate || { contains: '"ok":true' }; C.dirty = true; select('gate', t.id); tab('EDIT'); }, text: t.gate ? '◇ its gate' : '＋ gate after it' }), el('button', { class: 'pc-btn', onclick: remove, text: 'Remove' })]), said);
  }
  function editGate(t) {
    const g = t.gate || {}; const f = { contains: el('input', { value: g.contains || '', 'data-f': 'contains', placeholder: 'what the step\'s output must contain' }), other: el('textarea', { 'data-f': 'gate' }) };
    const rest = { ...g }; delete rest.contains; f.other.value = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
    const said = el('p', { class: 'pc-say' });
    const apply = () => { try { const extra = f.other.value.trim() ? JSON.parse(f.other.value) : {}; t.gate = { ...extra, ...(f.contains.value ? { contains: f.contains.value } : {}) }; if (!Object.keys(t.gate).length) throw new Error('an empty gate passes everything: remove it instead'); C.dirty = true; draw(); said.className = 'pc-say ok'; said.textContent = 'Applied. Save writes it.'; } catch (e) { said.className = 'pc-say bad'; said.textContent = e.message; } };
    C.db.replaceChildren(el('p', { class: 'pc-say', text: 'The gate stands after the step: the run goes on only when it holds. Nothing passes by default.' }),
      field('passes when the output contains', f.contains), field('other conditions (JSON)', f.other),
      el('div', { style: 'display:flex;gap:8px' }, [el('button', { class: 'pc-btn go', 'data-act': 'apply', onclick: apply, text: 'Apply' }), el('button', { class: 'pc-btn', onclick: () => { delete t.gate; C.dirty = true; select('step', t.id); tab('EDIT'); }, text: 'Remove gate' })]), said);
  }
  function addStep() {
    const tasks = C.p.tasks || (C.p.tasks = []); let n = tasks.length + 1; while (tasks.some(t => t.id === 'step-' + n)) n++;
    const after = C.sel ? C.sel.id : (tasks.length ? tasks[tasks.length - 1].id : null);
    tasks.push({ id: 'step-' + n, label: 'New step', depends_on: after ? [after] : [], step: { type: 'api', config: { url: '', method: 'GET' } } });
    C.dirty = true; select('step', 'step-' + n); tab('EDIT');
  }
  function say(cls, t) { if (C.tab !== 'EDIT') tab('EDIT'); const p = el('p', { class: 'pc-say ' + cls, text: t }); C.db.prepend(p); }
  async function save() {
    try { const body = { ...C.p, by: 'person' }; const r = await api('PUT', A('/pipelines/' + encodeURIComponent(C.p.id)), body);
      C.p = JSON.parse(JSON.stringify(r.pipeline || C.p)); C.dirty = false; try { C.layers = (await api('GET', A('/pipelines/' + encodeURIComponent(C.p.id)))).layers || []; } catch (_) {}
      draw(); say('ok', 'Saved: the pipeline file is updated; Clear Glass and the CLI see the same.'); if (C.hooks.onSaved) C.hooks.onSaved(C.p);
    } catch (e) { say('bad', 'Not saved: ' + e.message); }
  }
  window.PipelineCanvas = { open, close, _state: C };
})();
