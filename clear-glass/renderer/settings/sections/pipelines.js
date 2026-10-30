'use strict';
/**
 * renderer/settings/sections/pipelines.js — Pipelines  (styles: pipelines.css)
 *
 * 0.60.284 PL4 — James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation" · earlier: "For
 * automation of macros, Tasks in a dependency graph as a checklist?"
 * Spec: docs/automation-pipelines.spec MOD-PIPELINE-UI · Map: docs/2026-10-29-pipelines-phasemap.spec PL4
 *
 * A pipeline is tasks with dependencies; each task runs one of what he already has — a macro, a workflow, a question to an agent (any
 * agent, each task its own), a Nexus command, another pipeline, a wait at a gate — and may carry a gate (what its output must contain, and
 * 2026-10-30 PL7/PL11 an element gate: one of his gates or a condition on an element) and retries; and may belong to a site (PL10). Run shows the checklist:
 * ✓ done, ▸ running, · waiting, ✗ failed, ⊘ blocked (by the task that failed). Everything goes through the automation engine's door
 * (wire('/automation/pipelines…')); nothing is kept here.
 */
(function () {
  const { h, wire, toast, fail, busy, modal, field, pane, btn, chip, empty, ago, section, confirmDo } = window.CGS;
  const MARK = { done: '✓', running: '▸', waiting: '·', failed: '✗', blocked: '⊘' };
  const KINDS = [
    { value: 'macro', label: 'Run a macro', what: 'Macro name', hint: 'as in Settings › Macros' },
    { value: 'workflow', label: 'Run a workflow', what: 'Workflow name', hint: 'as in Settings › Automation' },
    { value: 'agent', label: 'Ask an agent', what: 'Agent', hint: 'claude, chatgpt, deepseek, ollama …' },
    { value: 'command', label: 'Call a Nexus system', what: 'System', hint: 'copilot, idearium, cortex …' },
    // 2026-10-30 PL9/PL11 — James: "make sure macros, automations, and pipelines are interconnected" · "gates are for the pipelines for macro atuomation"
    { value: 'pipeline', label: 'Run a pipeline', what: 'Pipeline name', hint: 'another pipeline (never this one)' },
    { value: 'gate', label: 'Wait at a gate', what: 'Your gate (id)', hint: 'from Settings › ClearDriver › Gates on sites' },
  ];
  // a task's element gate: what must hold on the page after the task (one of his gates, or a condition on an element)
  const MUSTS = [['', 'no element gate'], ['value', 'holds…'], ['equals', 'holds exactly…'], ['matches', 'matches the pattern…'], ['shows', 'shows the choice…'],
    ['checked', 'is ticked'], ['unchecked', 'is clear'], ['text', 'contains the text…'], ['visible', 'is visible'], ['gone', 'is gone'], ['page_text', 'the page shows…'], ['url', 'the address matches…']];
  function elementOf(gid, sel, must, val) {
    if (gid) return { gateId: gid };
    if (!must) return null;
    const w = sel ? (/^(\(|\/)/.test(sel) ? { xpath: sel } : { selector: sel }) : {};
    if (must === 'checked') return { ...w, checked: true };
    if (must === 'unchecked') return { ...w, checked: false };
    if (must === 'visible') return { ...w, visible: true };
    if (must === 'gone') return { ...w, gone: true };
    if (must === 'page_text') return { text: val };
    if (must === 'url') return { url: val };
    return { ...w, [must]: val };
  }
  function mustOf(e) {
    if (!e || e.gateId) return { must: '', sel: '', val: '' };
    const sel = e.selector || e.xpath || '';
    if (e.checked === true) return { must: 'checked', sel, val: '' };
    if (e.checked === false) return { must: 'unchecked', sel, val: '' };
    if (e.visible) return { must: 'visible', sel, val: '' };
    if (e.gone) return { must: 'gone', sel, val: '' };
    if (!sel && e.text != null) return { must: 'page_text', sel, val: e.text };
    if (e.url != null) return { must: 'url', sel, val: e.url };
    const k = ['value', 'equals', 'matches', 'shows', 'text'].find(x => e[x] != null) || '';
    return { must: k, sel, val: k ? e[k] : '' };
  }
  const polls = new Map();   // pipelineId → timer, while a run is going

  // a task row of the editor ⇄ an engine step
  function toStep(kind, what, more) {
    if (kind === 'macro') return { type: 'macro', config: { name: what } };
    if (kind === 'workflow') return { type: 'workflow', config: { workflow: what } };
    if (kind === 'pipeline') return { type: 'pipeline', config: { pipeline: what } };
    if (kind === 'gate') return { type: 'gate', config: { gateId: what } };
    if (kind === 'agent') return { type: 'agent', config: { agentKey: what, prompt: more, await: true } };
    const m = String(more || '').trim().match(/^(GET|POST|PUT|DELETE)\s+(\S+)/i);
    return { type: 'command', config: { system: what, method: m ? m[1].toUpperCase() : 'GET', endpoint: m ? m[2] : (more || '/health') } };
  }
  function fromStep(step) {
    const c = (step && step.config) || {};
    if (!step) return { kind: 'macro', what: '', more: '' };
    if (step.type === 'macro') return { kind: 'macro', what: c.name || '', more: '' };
    if (step.type === 'workflow') return { kind: 'workflow', what: c.workflow || '', more: '' };
    if (step.type === 'pipeline') return { kind: 'pipeline', what: c.pipeline || '', more: '' };
    if (step.type === 'gate' && c.gateId) return { kind: 'gate', what: c.gateId, more: '' };
    if (step.type === 'agent') return { kind: 'agent', what: c.agentKey || '', more: c.prompt || '' };
    if (step.type === 'command') return { kind: 'command', what: c.system || '', more: `${c.method || 'GET'} ${c.endpoint || ''}`.trim() };
    return { kind: step.type, what: '', more: JSON.stringify(c), raw: step };
  }

  // 2026-10-30 PN3 — James: "that way the pipeline feature can choose macros and automation nodes from clearglass and node files." What a task can
  // run, listed from where it lives: Clear Glass's macros, the engine's workflows and pipelines, and the node files in the library (.macro,
  // .workflow, .pipeline). A node file picked is imported first (the engine's own importer), then the task names what came in.
  const NODE = '📄 ';
  async function sources() {
    const cgx = window.cg || {};
    const [m, w, p, n] = await Promise.all([
      cgx.macros && cgx.macros.list ? cgx.macros.list().then(r => (r && r.macros) || (Array.isArray(r) ? r : [])).catch(() => []) : Promise.resolve([]),
      wire('/automation/workflows').then(r => r.workflows || []).catch(() => []),
      wire('/automation/pipelines').then(r => r.pipelines || []).catch(() => []),
      wire('/automation/nodes').then(r => r.nodes || []).catch(() => [])]);
    return { macro: m.map(x => x.name).filter(Boolean), workflow: w.map(x => x.name).filter(Boolean), pipeline: p.map(x => x.name).filter(Boolean), nodes: n };
  }
  function datalists(src) {
    const make = (id, items) => { const dl = h('datalist', { id }); for (const [v, l] of items) { const o = document.createElement('option'); o.value = v; o.label = l; dl.append(o); } return dl; };
    const files = (type) => src.nodes.filter(x => x.type === type).map(x => [`${NODE}${x.file}`, `node file · ${x.summary || x.name}`]);
    return [make('pl-src-macro', [...src.macro.map(x => [x, 'Clear Glass macro']), ...files('macro')]),
      make('pl-src-workflow', [...src.workflow.map(x => [x, 'workflow']), ...files('workflow')]),
      make('pl-src-pipeline', [...src.pipeline.map(x => [x, 'pipeline']), ...files('pipeline')])];
  }
  async function fromNodeFile(input) {
    const v = input.value.trim(); if (!v.startsWith(NODE)) return;
    const file = v.slice(NODE.length);
    try {
      const r = await wire(`/automation/nodes/${encodeURIComponent(file)}/import`, { method: 'POST', body: {}, allowNotOk: true });
      if (!r || r.ok === false) throw new Error((r && r.error) || 'not imported');
      input.value = (r.macro && r.macro.name) || (r.workflow && r.workflow.name) || (r.pipeline && r.pipeline.name) || input.value;
      toast(`${file} imported — the task runs “${input.value}”`);
    } catch (e) { toast(`${file} could not be imported: ${e.message}`, 'bad'); }
  }

  function taskRow(t, i, rows) {
    const s = fromStep(t.step);
    const kind = h('select', { 'data-k': 'type', 'aria-label': 'What it runs' }, KINDS.map(k => h('option', { value: k.value, text: k.label, selected: k.value === s.kind ? 'selected' : null })));
    if (s.raw) kind.append(h('option', { value: s.kind, text: s.kind, selected: 'selected' }));
    const what = h('input', { type: 'text', 'data-k': 'what', value: s.what });
    const more = h('textarea', { 'data-k': 'prompt', rows: '2' }); more.value = s.more;
    const moreField = field('', more);
    const whatField = field('', what);
    what.addEventListener('change', () => fromNodeFile(what));
    const sync = () => { const k = KINDS.find(x => x.value === kind.value);
      if (['macro', 'workflow', 'pipeline'].includes(kind.value)) what.setAttribute('list', `pl-src-${kind.value}`); else what.removeAttribute('list');
      whatField.firstChild.textContent = k ? k.what : 'Step'; what.placeholder = k ? k.hint : '';
      moreField.firstChild.textContent = kind.value === 'agent' ? 'Prompt — {{tasks.<id>.output}} reads an earlier task' : kind.value === 'command' ? 'Method and path (GET /api/…)' : '';
      moreField.style.display = ['agent', 'command'].includes(kind.value) || s.raw ? '' : 'none'; };
    kind.addEventListener('change', sync); sync();
    const row = h('div', { class: 'pl-task', 'data-i': String(i) },
      h('div', { class: 'pl-task-head' }, h('b', { text: `Task ${i + 1}` }),
        h('button', { class: 'btn sm ghost', type: 'button', text: 'Remove', onclick: () => { row.remove(); rows.renumber(); } })),
      h('div', { class: 'pl-grid' },
        field('Id', h('input', { type: 'text', 'data-k': 'id', value: t.id || '', placeholder: 'fill' })),
        field('Label', h('input', { type: 'text', 'data-k': 'label', value: t.label && t.label !== t.id ? t.label : '', placeholder: 'what the checklist shows' })),
        field('Runs', kind), whatField,
        field('After', h('input', { type: 'text', 'data-k': 'deps', value: (t.depends_on || []).join(', '), placeholder: 'task ids, comma separated' })),
        field('Gate: output contains', h('input', { type: 'text', 'data-k': 'contains', value: (t.gate && t.gate.contains) || '', placeholder: 'empty: the step succeeded' })),
        field('Gate: your gate', h('input', { type: 'text', 'data-k': 'gateId', value: (t.gate && t.gate.element && t.gate.element.gateId) || '', placeholder: 'a gate id (or the element below)' })),
        field('Gate: element', h('input', { type: 'text', 'data-k': 'gateSel', value: mustOf(t.gate && t.gate.element).sel, placeholder: '#email · //input[@name="email"]' })),
        field('…must', h('select', { 'data-k': 'gateMust' }, MUSTS.map(([v, l]) => h('option', { value: v, text: l, selected: mustOf(t.gate && t.gate.element).must === v ? 'selected' : null })))),
        field('…value', h('input', { type: 'text', 'data-k': 'gateVal', value: mustOf(t.gate && t.gate.element).val, placeholder: '{{vars.email}} · /^\\S+@\\S+$/' })),
        field('Retries', h('input', { type: 'number', min: '0', max: '5', 'data-k': 'retries', value: String(t.retries || 0) })),
        field('If it fails', h('select', { 'data-k': 'onFail' }, [['stop', 'stop the pipeline'], ['continue', 'go on with the rest']].map(([v, l]) => h('option', { value: v, text: l, selected: (t.onFail || 'stop') === v ? 'selected' : null }))))),
      moreField);
    row._raw = s.raw || null;
    return row;
  }

  function readTask(row) {
    const g = (k) => { const el = row.querySelector(`[data-k="${k}"]`); return el ? el.value.trim() : ''; };
    const id = g('id'), kind = g('type');
    const step = row._raw && kind === row._raw.type ? row._raw : toStep(kind, g('what'), row.querySelector('[data-k="prompt"]').value);
    const t = { id, label: g('label') || id, depends_on: g('deps') ? g('deps').split(',').map(x => x.trim()).filter(Boolean) : [], step, retries: Number(g('retries')) || 0, onFail: g('onFail') || 'stop' };
    if (g('contains')) t.gate = { contains: g('contains') };
    const el = elementOf(g('gateId'), g('gateSel'), g('gateMust'), g('gateVal'));   // 2026-10-30 PL7
    if (el) t.gate = { ...(t.gate || {}), element: el };
    return t;
  }

  async function edit(p, rerender) {
    const src = await sources();
    const name = h('input', { type: 'text', 'data-k': 'name', value: (p && p.name) || '' });
    const desc = h('input', { type: 'text', 'data-k': 'description', value: (p && p.description) || '' });
    // 2026-10-30 PL10 — James: "with the option for per site pipelines": a site (its address or a pattern), and run when a page of it opens
    const site = h('input', { type: 'text', 'data-k': 'site', value: (p && p.site) || '', placeholder: 'empty: any page · https://www.fiverr.com · https://www.upwork.com/jobs/*' });
    const onLoad = h('input', { type: 'checkbox', 'data-k': 'onLoad' }); onLoad.checked = !!(p && p.onLoad);
        const par = h('select', { 'data-k': 'parallel' }, [1, 2, 3, 4].map(n => h('option', { value: String(n), text: n === 1 ? 'one at a time' : `${n} at once`, selected: ((p && p.settings && p.settings.parallel) || 1) === n ? 'selected' : null })));
    const list = h('div', { class: 'pl-tasks' });
    const rows = { renumber: () => [...list.children].forEach((r, i) => { r.dataset.i = String(i); r.querySelector('b').textContent = `Task ${i + 1}`; }) };
    ((p && p.tasks && p.tasks.length) ? p.tasks : [{ id: 'first' }]).forEach((t, i) => list.append(taskRow(t, i, rows)));
    const add = h('button', { class: 'btn sm', type: 'button', text: '+ Task', onclick: () => { list.append(taskRow({}, list.children.length, rows)); } });
    const saved = await modal({ title: p ? `Edit — ${p.name}` : 'New pipeline', wide: true,
      body: [h('div', { class: 'pl-form' }, field('Name', name), field('What it is for', desc), field('Tasks at once', par), field('Site', site),
        field('Run when a page of the site opens', onLoad)), list, add, ...datalists(src)],
      actions: [{ label: 'Save', primary: true, run: async () => {
        for (const w of list.querySelectorAll('[data-k="what"]')) if (w.value.trim().startsWith(NODE)) await fromNodeFile(w);   // a node file picked and not yet imported
        const body = { name: name.value.trim(), description: desc.value.trim(), settings: { parallel: Number(par.value) || 1 }, tasks: [...list.children].map(readTask),
          site: site.value.trim() || null, onLoad: !!(site.value.trim() && onLoad.checked) };
        const r = p ? await wire(`/automation/pipelines/${encodeURIComponent(p.id)}`, { method: 'PUT', body, allowNotOk: true }) : await wire('/automation/pipelines', { method: 'POST', body, allowNotOk: true });
        if (!r || r.ok === false) throw new Error(r && r.problems ? r.problems.join(' · ') : (r && r.error) || 'not saved');
        return 'saved';
      } }] });
    if (saved) { toast(p ? 'Pipeline saved' : 'Pipeline made'); rerender(); }
  }

  // PN2/PN3 — a .pipeline node file into the Pipelines: one from the node files (Settings › Automation's library, which also holds the bundled
  // "Fiverr gig"), or pasted; what it bundles (macros, workflows, pipelines) comes in with it
  async function importNode(rerender) {
    const nodes = await wire('/automation/nodes').then(r => (r.nodes || []).filter(n => n.type === 'pipeline')).catch(() => []);
    const paste = h('textarea', { rows: '6', 'data-k': 'paste', placeholder: 'or paste a .pipeline file here' });
    const say = (r) => { if (!r || r.ok === false) throw new Error((r && (r.problems ? r.problems.join(' · ') : r.error)) || 'not imported');
      toast(`“${r.pipeline.name}” imported${r.macros && r.macros.length ? ` with ${r.macros.length} macro(s)` : ''}${r.workflows && r.workflows.length ? `, ${r.workflows.length} workflow(s)` : ''}${(r.warnings || []).length ? ` — ${r.warnings.join('; ')}` : ''}`); };
    const done = await modal({ title: 'Import a pipeline', wide: true,
      body: [h('div', { class: 'pl-nodes' }, nodes.length ? nodes.map(n => h('div', { class: 'pl-node', 'data-file': n.file },
        h('div', { class: 'grow' }, h('b', { text: n.name }), h('div', { class: 'd', text: `${n.file} · ${n.summary || ''}` })),
        btn('Import', async (e) => busy(e.currentTarget, async () => { say(await wire(`/automation/nodes/${encodeURIComponent(n.file)}/import`, { method: 'POST', body: {}, allowNotOk: true })); rerender(); }), 'sm'))) : [empty('No .pipeline files in the node files yet.')]), paste],
      actions: [{ label: 'Import pasted', primary: true, run: async () => { if (!paste.value.trim()) throw new Error('paste a .pipeline file first'); say(await wire('/automation/import', { method: 'POST', body: { text: paste.value }, allowNotOk: true })); return 'imported'; } }] });
    if (done) rerender();
  }

  function checklist(run, p) {
    if (!run) return h('div', { class: 'pl-check pl-none', text: 'Not run yet.' });
    const by = Object.fromEntries((p.tasks || []).map(t => [t.id, t]));
    const ids = (run.order || []).flat();
    return h('div', { class: `pl-check pl-run-${run.status}` },
      h('div', { class: 'pl-check-head' }, chip(run.status, run.status === 'ok' ? 'ok' : run.status === 'running' ? '' : 'bad'), h('span', { class: 'pl-when', text: ago(run.startedAt) })),
      ids.map(id => { const t = run.tasks[id] || {}; const why = t.status === 'blocked' ? `blocked by ${t.blockedBy}` : t.error || (t.ms != null ? `${t.ms} ms${t.attempts > 1 ? ` · ${t.attempts} attempts` : ''}` : '');
        return h('div', { class: `pl-item pl-${t.status}`, 'data-task': id }, h('span', { class: 'pl-mark', text: `${MARK[t.status] || '?'} ${id}` }),
          h('span', { class: 'pl-label', text: (by[id] && by[id].label !== id) ? by[id].label : '' }), h('span', { class: 'pl-why', text: why })); }));
  }

  function card(p, last, rerender) {
    const box = h('div', { class: 'pl-card', 'data-pipeline': p.id });
    const slot = h('div', { class: 'pl-slot' }, checklist(last, p));
    const watch = (runId) => {
      clearInterval(polls.get(p.id));
      polls.set(p.id, setInterval(async () => {
        try { const r = await wire(`/automation/pipeline-runs/${encodeURIComponent(runId)}`); slot.replaceChildren(checklist(r.run, p)); if (r.run.status !== 'running') { clearInterval(polls.get(p.id)); polls.delete(p.id); toast(`${p.name}: ${r.run.status}`, r.run.status === 'ok' ? 'ok' : 'bad'); } }
        catch (e) { clearInterval(polls.get(p.id)); polls.delete(p.id); fail(e); }
      }, 700));
    };
    if (last && last.status === 'running') watch(last.id);
    box.append(
      h('div', { class: 'pl-card-head' },
        h('div', { class: 'grow' }, h('div', { class: 't', text: p.name }), h('div', { class: 'd', text: [p.site ? `${p.site.replace(/^https?:\/\//, '')}${p.onLoad ? ' · runs when a page opens' : ''}` : null, p.description, `${p.tasks.length} task${p.tasks.length === 1 ? '' : 's'}`, p.settings && p.settings.parallel > 1 ? `${p.settings.parallel} at once` : null].filter(Boolean).join(' · ') })),
        btn('Run', (e) => busy(e.currentTarget, async () => { const r = await wire(`/automation/pipelines/${encodeURIComponent(p.id)}/run`, { method: 'POST', body: {} }); slot.replaceChildren(checklist({ status: 'running', startedAt: Date.now(), order: [], tasks: {} }, p)); watch(r.runId); }), 'sm primary'),
        btn('Edit', () => edit(p, rerender).catch(fail), 'sm'),
        // PN2 — the pipeline as a .pipeline node file in the library, with the macros, workflows and pipelines it runs bundled
        btn('Export', (e) => busy(e.currentTarget, async () => { const r = await wire(`/automation/pipelines/${encodeURIComponent(p.id)}/node/save`, { method: 'POST', body: {} }); toast(`${r.file} saved in the node files${r.missing && r.missing.length ? ` — not found to bundle: ${r.missing.join(', ')}` : ''}`); }), 'sm'),
        btn('Archive', async () => { if (!(await confirmDo('Archive this pipeline?', 'It is kept (Show archived) and its runs stay; it leaves the list.', 'Archive', false))) return; await wire(`/automation/pipelines/${encodeURIComponent(p.id)}/archive`, { method: 'POST', body: {} }); toast('Archived'); rerender(); }, 'sm ghost')),
      h('div', { class: 'pl-steps' }, p.tasks.map(t => h('span', { class: 'pl-step', text: `${t.id}${(t.depends_on || []).length ? ` ← ${t.depends_on.join(', ')}` : ''}` }))),
      slot);
    return box;
  }

  section({
    id: 'pipelines', group: 'Agents', icon: '⇶', label: 'Pipelines',
    keywords: 'pipeline pipelines dependency graph checklist tasks macros workflows agents automation chain',
    blurb: 'Tasks in a dependency graph, each one a macro, a workflow, a question to any agent, or a Nexus command — gated, retried, and run as a checklist.',
    async render({ rerender } = {}) {
      for (const t of polls.values()) clearInterval(t); polls.clear();
      let list;
      try { list = await wire('/automation/pipelines'); }
      catch (e) { return [pane({ title: 'Pipelines', body: [empty(`The automation engine did not answer: ${e.message}`, btn('Try again', () => rerender(), 'sm'))] })]; }
      const ps = list.pipelines || [];
      const lasts = await Promise.all(ps.map(p => wire(`/automation/pipeline-runs?pipelineId=${encodeURIComponent(p.id)}&limit=1`).then(r => (r.runs || [])[0] || null).catch(() => null)));
      return [pane({ title: 'Pipelines', sub: `${ps.length}`, tools: [btn('Import', () => importNode(rerender).catch(fail), 'sm'), btn('New pipeline', () => edit(null, rerender).catch(fail), 'sm primary')], flush: true,
        body: ps.length ? ps.map((p, i) => card(p, lasts[i], rerender)) : [empty('No pipelines yet. A pipeline runs your macros, workflows and agents in order, each after the ones it needs.', btn('New pipeline', () => edit(null, rerender).catch(fail), 'sm primary'))] })];
    },
  });
})();
