'use strict';
/**
 * cos/pipeline/index.js — COS's pipeline module: its one door (PC1, PC5; cos/spec/pipeline-canvas.spec, cos/pipeline/registry.json).
 * James, 2026-11-09: "No. Terrible folder structure. This needs to be a module." · "follow claude.md i thought we chose to move on and use .eg,
 * emerge for code?"
 *
 * The module is Emerge: box.eg (the box shape, the DAG), gate.eg (a gate decides; its types), runs.eg (a request kept as files until its contract
 * is met), cli.eg (their one command line), types/*.gatetype, test/*.test.eg. This door holds no logic. It does only what Emerge cannot yet:
 *   - start Emerge (cli.eg) and read its one line of JSON (until COS's manager is Emerge, CIE13);
 *   - make the HTTP calls a gate asks for or acts with, on each owner's declared address (no sockets in Emerge until CIE10, §5.15);
 *   - take the engine's events and gates in order, one at a time, so a request's files change in the order the run did.
 *
 *   createPipeline({ automation, idearium, call, dataDir }) → { boxes, gates, runs, decideGate(q), onEvent(type, data), request(q), resume(id, q) }
 */
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');

function createPipeline({ automation, idearium = null, call = null, dataDir } = {}) {
  const root = path.join(__dirname, '..', '..');   // Emerge and this module are where Nexus is, whatever data root COS was given
  const EG = path.join(root, 'emerge/emerge/lang/eg.js'), CLI = path.join(__dirname, 'cli.eg');
  const shipped = path.join(__dirname, 'types'), mine = path.join(dataDir, 'pipeline', 'gate-types');
  // the node types Nexus defines and the fields each requires (lib/node-schemas, YAML): read here because Emerge has no YAML reader yet (CIE14)
  let _schemas = null;
  const schemas = () => {
    if (_schemas) return _schemas;
    const dir = path.join(root, 'lib', 'node-schemas'), out = {};
    try { const y = require('js-yaml'); for (const f of fs.readdirSync(dir)) if (f.startsWith('schema.')) { try { const d = y.load(fs.readFileSync(path.join(dir, f), 'utf8')); const fl = (d && d.payload && d.payload.fields) || {}; out[f.slice(7)] = Object.keys(fl).filter(k => fl[k] && fl[k].required); } catch (_) {} } } catch (_) {}
    return (_schemas = out);
  };
  const eg = (cmd, obj) => new Promise((resolve) => {
    const f = path.join(os.tmpdir(), `cos-pipeline-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(f, JSON.stringify(obj));
    execFile(process.execPath, [EG, 'run', CLI, cmd, f], { cwd: root, timeout: 60000, maxBuffer: 16 << 20 }, (err, out, errOut) => {
      try { fs.unlinkSync(f); } catch (_) {}
      try { resolve(JSON.parse(String(out).trim().split('\n').pop())); }
      catch (_) { resolve({ ok: false, code: 500, error: `Emerge did not answer (${cmd}): ${String(errOut || (err && err.message) || out).trim().split('\n').pop()}` }); }
    });
  });
  let line = Promise.resolve();   // one at a time: the request's files change in the order the run did
  const inOrder = (fn) => { const p = line.then(fn, fn); line = p.catch(() => {}); return p; };
  const ask = async (owner, route, body) => {
    if (!call) return { error: 'this COS was given no way to call a system' };
    const [method, p] = String(route).split(' ');
    try { return await call(owner, method, p, method === 'GET' ? undefined : body); } catch (e) { return { error: e.message }; }
  };
  // RAID's contract, by Cortex's route (Cortex keeps the books); Cortex down breaks nothing: what it did not take is said in the request's files
  const raid = async (method, p, body) => { const a = await ask('cortex', `${method} /api/raid/contracts/v2${p}`, body); if (a.error) return { ok: false, why: `Cortex did not answer: ${a.error}` }; let j = {}; try { j = JSON.parse(a.body || '{}'); } catch (_) {} return a.status < 400 ? { ok: true, ...j } : { ok: false, why: `Cortex answered ${a.status}${j.error ? `: ${j.error}` : ''}` }; };
  const book = async (id, payload) => { const b = await raid('POST', '', { id, payload, by: 'system:cos' }); await eg('booked', { base: dataDir, id, ok: !!b.ok, why: b.ok ? 'booked with Cortex (RAID)' : b.why }); return b; };
  const answer = async (asks) => { const a = {}; for (const x of asks) a[x.id] = await ask(x.owner, x.route, x.body); return a; };
  const getPipeline = async (id) => {
    const r = await automation.handle({ method: 'GET', url: `/automation/pipelines/${encodeURIComponent(id)}`, body: {}, headers: {} });
    const p = r && r.body && (r.body.pipeline || r.body); return r && r.status < 400 && p && Array.isArray(p.tasks) ? p : null;
  };
  const engineP = async () => { const E = automation.engine(); if (!E.pipelines) await automation.handle({ method: 'GET', url: '/automation/pipelines', body: {}, headers: {} }); return E.pipelines; };

  // ── the box shape: a pipeline or a procedure as boxes, or as an ERAVOS project ──
  const boxes = {
    async of({ pipeline = null, procedure = null, as = 'boxes' } = {}) {
      const cmd = as === 'erv' ? 'erv' : 'boxes';
      let p = null, source;
      if (pipeline) { p = await getPipeline(pipeline); if (!p) return { ok: false, code: 404, error: `no pipeline "${pipeline}"` }; source = { pipeline, name: p.name || pipeline }; }
      else if (procedure) {
        try { const r = await idearium(`/api/procedures/${encodeURIComponent(procedure)}`); p = r && (r.procedure || r); } catch (e) { return { ok: false, code: 502, error: `Idearium did not answer for procedure "${procedure}": ${e.message}` }; }
        if (!p || !Array.isArray(p.steps)) return { ok: false, code: 404, error: `no procedure "${procedure}"` }; source = { procedure, name: p.name || procedure };
      } else return { ok: false, code: 400, error: 'name one: ?pipeline=<id> or ?procedure=<id>' };
      const f = path.join(os.tmpdir(), `cos-pipeline-src-${process.pid}-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify(p));
      const out = await new Promise((resolve) => execFile(process.execPath, [EG, 'run', CLI, cmd, f], { cwd: root, timeout: 30000, maxBuffer: 16 << 20 }, (err, o, e) => {
        try { fs.unlinkSync(f); } catch (_) {}
        try { resolve(JSON.parse(String(o).trim().split('\n').pop())); } catch (_) { resolve({ ok: false, code: 500, error: `Emerge's box shape did not answer: ${String(e || (err && err.message)).trim().split('\n').pop()}` }); }
      }));
      return cmd === 'erv' ? { ok: true, erv: out, name: source.name } : { ok: true, ...out, source };
    },
    async procedures() {
      try { const r = await idearium('/api/procedures'); return { ok: true, procedures: (r && r.procedures) || [] }; }
      catch (e) { return { ok: false, code: 502, error: `Idearium did not answer: ${e.message}` }; }
    },
  };

  // ── the gates ──
  async function gate(q, { dry = false, context = null } = {}) {
    const base = { base: dataDir, shipped, mine, q, at: Date.now(), dry, schemas: schemas(), ...(context ? { context } : {}) };
    let r = await eg('gate', base);
    if (r.ok && r.asks) r = await eg('gate', { ...base, answers: await answer(r.asks), at: Date.now() });
    if (!r.ok) return { outcome: 'closed', open: false, why: r.error, saw: [], actions: [] };
    const v = r.verdict; v.actions = (v.actions || []).map(a => ({ ...a, ...(a.do === 'route' ? {} : { ok: true }) }));
    if (dry) { v.actions = v.actions.map(a => ({ do: a.do, said: 'not done: a try' })); return v; }
    for (const c of v.calls || []) { const a = await ask(c.owner, c.ref, c.body); const said = { do: 'route', to: `${c.owner} ${c.ref}`, ok: !a.error && a.status < 400, said: a.error || `answered ${a.status}` }; v.actions = v.actions.map(x => (x === c || (x.do === 'route' && x.ref === c.ref && x.owner === c.owner && !x.to) ? said : x)); }
    for (const u of v.unbuilt || []) v.actions.push({ do: 'said', ok: false, said: u });
    if ((v.calls || []).length || (v.unbuilt || []).length) await eg('gate-actions', { base: dataDir, runId: q.runId, task: q.task, actions: v.actions });
    return v;
  }
  const gates = {
    async types() { const r = await eg('types', { shipped, mine }); return r.types || []; },
    async get(id) { return (await gates.types()).find(t => t.id === id) || null; },
    save: (type, { by } = {}) => eg('save-type', { shipped, mine, type, by }),
    decide: ({ pipelineId = 'try', task = 'try', gate: g = {}, output = '', context = {} } = {}) => gate({ pipelineId, task, runId: null, gate: g, output }, { dry: true, context }),
  };
  // 2026-11-09 — James: "Also conditions, triggers, events, etc. migrate BrainOS' features to the engine." What the module sees is an event the
  // engine's triggers hear (a workflow "When something happens"): a gate that closed or found a gap, a request met, held or not met.
  const fire = (name, payload) => { try { const E = automation.engine(); if (E && typeof E.emitEvent === 'function') E.emitEvent(name, payload); } catch (_) {} };
  const decideGate = (q) => inOrder(async () => {
    const v = await gate(q);
    if (v && (v.outcome === 'gap' || v.outcome === 'closed')) fire(`pipeline.gate.${v.outcome}`, { name: `${q.pipelineId}/${q.task}`, pipelineId: q.pipelineId, task: q.task, type: v.type, why: v.why });
    return v;
  });

  // ── a request, kept as files ──
  const onEvent = (type, data) => inOrder(async () => {
    const needsPipeline = type === 'automation.pipeline.start' && !(data.meta && data.meta.request);
    const pipeline = needsPipeline ? await getPipeline(data.pipelineId) : null;
    // the run's end: RAID's verdict first (its evidence went in with each step met), then the files
    let raidView = null;
    if (type === 'automation.pipeline.done') { const id = (await eg('read-id', { base: dataDir, engineRun: data.runId })).request; if (id) { const v = await raid('GET', `/${id}`); if (v.ok) raidView = { complete: !!v.complete, why: v.why || [] }; } }
    const r = await eg('event', { base: dataDir, kind: type, data: raidView ? { ...data, raid: raidView } : data, pipeline, at: Date.now() });
    if (type === 'automation.pipeline.start' && r && r.ok && r.contract) await book(r.request, r.contract);
    if (type === 'automation.pipeline.task' && r && r.ok && r.met) await raid('POST', `/${r.request}/evidence`, { key: `step:${r.task}`, value: 'met', by: 'system:cos' });
    // a request's end is an event the engine's triggers hear: pipeline.request.met | held | not_met | cancelled (subject: the pipeline's name)
    if (type === 'automation.pipeline.done' && r && r.ok && r.phase) fire(`pipeline.request.${String(r.phase).replace(/ /g, '_')}`, { name: r.name, pipelineId: r.pipeline, request: r.request, why: r.why || null });
  });
  const runs = {
    // reads wait their turn too, so they see every event that came before them
    list: ({ state = 'active' } = {}) => inOrder(async () => (await eg('list', { base: dataDir, which: state })).requests || []),
    read: (id) => inOrder(async () => { const r = await eg('read', { base: dataDir, id }); if (!r.ok) return null; const v = await raid('GET', `/${id}`); return { ...r.request, raid: v.ok ? { complete: v.complete, why: v.why, gates: v.gates } : { reached: false, why: v.why } }; }),
  };
  async function request({ pipeline, vars = {}, by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const p = await getPipeline(pipeline); if (!p) return { ok: false, code: 404, error: `no pipeline "${pipeline}"` };
    const made = await inOrder(async () => { const m = await eg('request', { base: dataDir, pipeline: p, vars, by, at: Date.now() }); if (m.ok) await book(m.request, m.contract); return m; }); if (!made.ok) return made;
    const r = await (await engineP()).run(p.id, { vars, wait: false, meta: { request: made.request } });
    return r.ok ? { ok: true, request: made.request, engineRun: r.runId } : { ok: false, code: 400, error: r.error, request: made.request };
  }
  async function resume(id, { by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const q = await inOrder(() => eg('resume-of', { base: dataDir, id })); if (!q.ok) return q;
    const r = await (await engineP()).run(q.pipeline, { vars: q.vars, wait: false, done: q.done, meta: { request: id } });
    return r.ok ? { ok: true, request: id, engineRun: r.runId, alreadyMet: Object.keys(q.done) } : { ok: false, code: 400, error: r.error };
  }
  // ── frameworks: a .framework that declares its steps compiles to a .pipeline (framework.eg), which runs as a step of any other (PC2 slice b) ──
  const fwDir = process.env.COS_FRAMEWORKS_DIR || path.join(root, 'docs');   // where .framework files are (docs/ in Nexus); a test points it at its own
  const frameworks = {
    list: async () => (await eg('frameworks', { dir: fwDir })).frameworks || [],
    // a framework, and every framework its steps run (any depth, children first), kept in the engine as pipelines — made, or brought up to
    // date by name; a loop, a missing one, or one that only describes is refused, named. → { ok, framework, pipeline: { id, name, steps }, tree }
    async tree(id) {
      const t = await eg('framework-tree', { dir: fwDir, id });
      if (!t.ok) return { ok: false, code: t.problems ? 409 : 500, error: t.problems ? `${id} cannot run as a step: ${t.problems.join('; ')}` : t.error, problems: t.problems };
      const P = await engineP(); let last = null; const tree = [];
      for (const n of t.order) {
        const have = P.list().find(x => x.name === n.pipeline.name || x.name === n.pipeline.name.replace(/ \(draft\)$/, '') || x.name === `${n.pipeline.name} (draft)`);
        const r = have ? P.update(have.id, n.pipeline) : P.create(n.pipeline);
        if (!r || r.ok === false) return { ok: false, code: 400, error: `${n.file}: ${(r && r.error) || 'the engine refused its pipeline'}`, problems: r && r.problems };
        last = { id: (r.pipeline || r).id || (have && have.id), name: n.pipeline.name, steps: n.pipeline.tasks.length }; tree.push({ framework: n.id, file: n.file, status: n.status, pipeline: last.name, made: !have });
      }
      return { ok: true, framework: { id, status: tree[tree.length - 1].status }, pipeline: last, tree };
    },
    async compile(file, { by } = {}) {
      if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
      if (!/^[\w.-]+\.framework$/.test(String(file))) return { ok: false, code: 400, error: 'name a .framework file' };
      const c = await eg('framework', { dir: fwDir, file });
      if (!c.ok) return { ok: false, code: c.problems ? 409 : 500, error: c.problems ? `${file} cannot run as a step: ${c.problems.join('; ')}` : c.error, problems: c.problems };
      return frameworks.tree(c.framework.id);
    },
  };
  // ── a request planned into its own .pipeline, end state first (plan.eg) — his "They build upon request, dynamically" ──
  const ideariumRoute = async (method, p, body) => { const a = await ask('idearium', `${method} ${p}`, body); if (a.error) return { ok: false, why: `Idearium did not answer: ${a.error}` }; let j = {}; try { j = JSON.parse(a.body || '{}'); } catch (_) {} return a.status < 400 ? { ok: true, ...j } : { ok: false, why: `Idearium answered ${a.status}${j.error ? `: ${j.error}` : ''}` }; };
  async function planPhase({ key, repo = '', chunks = false, framework = null, run = false, by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const ph = await ideariumRoute('GET', `/api/phases/one?key=${encodeURIComponent(String(key || ''))}`);
    if (!ph.ok) return { ok: false, code: 404, error: ph.why };
    const out = await eg('plan-phase', { phase: ph, opts: { repo, chunks: !!chunks, ...(framework ? { framework } : {}) } });
    if (!out.ok) return { ok: false, code: 500, error: out.error || 'Emerge did not plan it' };
    const P = await engineP(); const have = P.list().find(x => x.name === out.pipeline.name);
    const made = have ? P.update(have.id, out.pipeline) : P.create(out.pipeline);
    if (!made || made.ok === false) return { ok: false, code: 400, error: (made && made.error) || 'the engine refused the planned pipeline', problems: made && made.problems };
    const pipeline = { id: (made.pipeline || made).id || (have && have.id), name: out.pipeline.name, endState: out.pipeline.endState, steps: out.pipeline.tasks.map(t => t.id) };
    if (!run) return { ok: true, phase: ph.key, pipeline };
    const r = await request({ pipeline: pipeline.id, vars: { repo }, by });
    return r.ok ? { ok: true, phase: ph.key, pipeline, request: r.request, engineRun: r.engineRun } : { ...r, phase: ph.key, pipeline };
  }
  // the next phase Nexus can build (Idearium's queue), planned and run: the pipeline building Nexus, one request at a time
  async function buildNext({ repo = '', chunks = false, framework = null, by } = {}) {
    const q = await ideariumRoute('GET', '/api/phases/next?limit=1');
    if (!q.ok) return { ok: false, code: 502, error: q.why };
    const next = (q.queue || [])[0]; if (!next) return { ok: false, code: 409, error: 'nothing can be built now', blocked: (q.counts || {}).byGroup || null };
    return planPhase({ key: next.key, repo, chunks, framework, run: true, by });
  }
  // the engine's framework step: compile the tree, name the pipeline to run
  const frameworkStep = async ({ id }) => { const r = await frameworks.tree(id); return r.ok ? { ok: true, pipeline: r.pipeline.name } : { ok: false, error: r.error }; };
  return { boxes, gates, runs, frameworks, frameworkStep, decideGate, onEvent, request, resume, planPhase, buildNext };
}

module.exports = { createPipeline, MODULE_ID: 'cos.pipeline', VERSION: '1.0.0' };
