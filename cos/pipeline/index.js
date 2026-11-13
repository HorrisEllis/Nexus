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
 *   createPipeline({ automation, idearium, call, dataDir }) → { boxes, gates, runs, decideGate(q), onEvent(type, data), request(q), resume(id, q), retry(engineRun, q) }
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
    execFile(process.execPath, [EG, 'run', CLI, cmd, f], { cwd: root, timeout: 60000, maxBuffer: 16 << 20, windowsHide: true }, (err, out, errOut) => {
      try { fs.unlinkSync(f); } catch (_) {}
      try { resolve(JSON.parse(String(out).trim().split('\n').pop())); }
      catch (_) { resolve({ ok: false, code: 500, error: `Emerge did not answer (${cmd}): ${String(errOut || (err && err.message) || out).trim().split('\n').pop()}` }); }
    });
  });
  let line = Promise.resolve();   // one at a time: the request's files change in the order the run did
  const inOrder = (fn) => { const p = line.then(fn, fn); line = p.catch(() => {}); return p; };
  const ask = async (owner, route, body, max) => {
    if (!call) return { error: 'this COS was given no way to call a system' };
    const [method, p] = String(route).split(' ');
    try { return await call(owner, method, p, method === 'GET' ? undefined : body, max); } catch (e) { return { error: e.message }; }
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
      const out = await new Promise((resolve) => execFile(process.execPath, [EG, 'run', CLI, cmd, f], { cwd: root, timeout: 30000, maxBuffer: 16 << 20, windowsHide: true }, (err, o, e) => {
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
  // SW0 (2026-11-13), his: "We need each system sovereign." The scorecard (cos/sovereign/card.eg): what each system holds in its own folder,
  // against the last reading kept (cos/sovereign/baseline.json) — each part may only improve. write: keep this reading (refused while worse).
  const SOV_SYSTEMS = ['architect', 'clear-glass', 'copilot', 'cortex', 'cos', 'diagnostic', 'emerge/emerge', 'guardian', 'idearium', 'intelligence', 'loom', 'ollama', 'orchestrator', 'versionium'];
  async function sovereign({ write = false, treeRoot = root, baselineFile = path.join(root, 'cos', 'sovereign', 'baseline.json'), systems = SOV_SYSTEMS } = {}) {
    let baseline = null; try { baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8')); } catch (_) {}
    const r = await eg('sovereign-card', { root: treeRoot, systems, baseline }); if (!r.ok) return r;
    if (write) { if (r.worse.length) return { ...r, ok: false, code: 409, error: `not kept: ${r.worse.length} part(s) got worse: ${r.worse.join('; ')}` };
      fs.writeFileSync(baselineFile, JSON.stringify({ systems: r.systems, totals: r.totals }, null, 1) + '\n'); return { ...r, kept: true }; }
    return r;
  }
  // PC8 slice b (2026-11-11): a failed engine run retried — its request resumed (runs.eg retry_of); from: that step and every step after it again
  async function retry(engineRun, { from = null, by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const q = await inOrder(() => eg('retry-of', { base: dataDir, run: engineRun, from })); if (!q.ok) return q;
    const r = await (await engineP()).run(q.pipeline, { vars: q.vars, wait: false, done: q.done, meta: { request: q.request } });
    return r.ok ? { ok: true, request: q.request, engineRun: r.runId, retryOf: engineRun, alreadyMet: Object.keys(q.done), again: q.again } : { ok: false, code: 400, error: r.error };
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
        const v = P.validate(n.pipeline); if (!v.ok) return { ok: false, code: 400, error: `${n.file}: ${v.problems.join('; ')}`, problems: v.problems };
        const file = writeNode(n.pipeline, { from: 'cos (framework)' });   // the node file first; the engine's copy is imported from it
        const sy = await syncFile(file, { from: 'cos (framework)' }); if (!sy.ok) return { ok: false, code: 400, error: `${n.file}: ${sy.why}` };
        last = { id: sy.pipelineId, name: n.pipeline.name, steps: n.pipeline.tasks.length, file: sy.file }; tree.push({ framework: n.id, file: n.file, status: n.status, pipeline: last.name, node: sy.file, made: sy.action === 'imported' });
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
  // ── every pipeline a physical .pipeline node file, imported into the engine (his, 2026-11-09: "Every pipeline should be in the automation tab
  // imported by a physical node fil"). Sources: COS's shipped folder, COS's own nodes folder (what it writes: planned phases, compiled frameworks, and
  // a copy of each system's own, fetched by its route — registry.json pipelineSources). A file new or changed is imported (made, or updated by name,
  // keeping its id); one unchanged is left. JavaScript here because the files are YAML and Emerge has no YAML reader yet (CIE14).
  const NE = require(path.join(root, 'lib/node-export.js')), AN = require(path.join(root, 'lib/automation-nodes.js'));
  const shippedDir = path.join(__dirname, 'pipelines'), nodesDir = path.join(dataDir, 'pipeline', 'nodes'), syncedFile = path.join(nodesDir, '.synced.json');
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'pipeline';
  const sha = (t) => require('crypto').createHash('sha256').update(t).digest('hex');
  // a pipeline COS made, written as its node file first (the file is the pipeline; the engine's copy is imported from it)
  function writeNode(p, { from = 'cos' } = {}) {
    const id = slug(p.name); fs.mkdirSync(nodesDir, { recursive: true });
    const file = path.join(nodesDir, `${id}.pipeline`);
    fs.writeFileSync(file, NE.toYaml(NE.wrap('pipeline', id, { id, format: 'nexus-pipeline', version: 1, ...p }, { context: `written by COS's pipeline module (${from})`, intent: p.description || p.name, tags: ['pipeline', from] })));
    return file;
  }
  async function syncFile(file, { from = 'cos', state = null } = {}) {
    const st = state || (() => { try { return JSON.parse(fs.readFileSync(syncedFile, 'utf8')); } catch (_) { return {}; } })();
    const text = fs.readFileSync(file, 'utf8'); const key = path.relative(root, file);
    let doc; try { doc = AN.parse(text); } catch (e) { return { file: key, ok: false, why: `not a node file: ${e.message}` }; }
    const h = sha(JSON.stringify(doc.payload));   // the pipeline itself, not the envelope's export time: a file fetched again is unchanged unless it is
    if (doc.type !== 'pipeline') return { file: key, ok: false, why: `a .${doc.type}, not a .pipeline` };
    const P = await engineP(); const name = doc.payload.name;
    const have = P.list({ includeArchived: true }).find(x => x.name === name);
    let out;
    if (have && st[key] && st[key].sha === h) out = { file: key, ok: true, name, pipelineId: have.id, action: 'unchanged' };
    else if (have) { const r = P.update(have.id, doc.payload); out = r && r.ok === false ? { file: key, ok: false, name, why: r.error } : { file: key, ok: true, name, pipelineId: have.id, action: 'updated' }; }
    else { const r = await AN.importNode(automation.engine(), text, {}); const id = r && (r.pipeline ? (r.pipeline.id || r.pipeline) : r.id); out = r && r.ok !== false ? { file: key, ok: true, name, pipelineId: id || (P.list().find(x => x.name === name) || {}).id, action: 'imported' } : { file: key, ok: false, name, why: (r && r.error) || 'the engine refused it' }; }
    if (out.ok) { st[key] = { sha: h, name, pipelineId: out.pipelineId, from, at: Date.now() }; if (!state) { fs.mkdirSync(nodesDir, { recursive: true }); fs.writeFileSync(syncedFile, JSON.stringify(st, null, 2) + '\n'); } }
    return { ...out, from };
  }
  async function sync() {
    const st = (() => { try { return JSON.parse(fs.readFileSync(syncedFile, 'utf8')); } catch (_) { return {}; } })();
    const results = [], fetched = [];
    // each system's own pipelines, by its route, kept as a file first (a system down is said, its files kept from last time)
    let reg = {}; try { reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'registry.json'), 'utf8')).pipelineSources || {}; } catch (_) {}
    for (const src of reg.systems || []) {
      // 0.60.517: read whole (4 MB). The call cut every answer at 4,096 bytes, so a pipeline larger than that (Idearium's is 5,704) failed
      // to parse and was skipped without a word: the Automation tab showed 0. A pipeline that cannot be fetched or read is now named.
      const [lm, lp] = src.list.split(' '); const l = await ask(src.system, `${lm} ${lp}`, undefined, 4 * 1024 * 1024);
      if (l.error || l.status >= 400) { fetched.push({ system: src.system, ok: false, why: l.error || `answered ${l.status}` }); continue; }
      let list = []; try { list = (JSON.parse(l.body || '{}')[src.listKey || 'pipelines']) || []; } catch (_) {}
      let n = 0; const skipped = [];
      for (const it of list) {
        const id = it.id || it.name; if (!id) continue;
        const [nm, np] = src.node.split(' '); const g = await ask(src.system, `${nm} ${np.replace(':id', encodeURIComponent(id))}`, undefined, 4 * 1024 * 1024);
        if (g.error || g.status >= 400) { skipped.push({ id, why: g.error || `answered ${g.status}` }); continue; }
        let j = {}; try { j = JSON.parse(g.body || '{}'); } catch (e) { skipped.push({ id, why: `not JSON${g.cut ? ' (cut at ' + (g.body || '').length + ' of ' + g.length + ' bytes)' : ''}: ${e.message}` }); continue; }
        const text = String(src.textAt).split('.').reduce((o, k) => (o ? o[k] : undefined), j);
        if (typeof text !== 'string') { skipped.push({ id, why: `no text at ${src.textAt}` }); continue; }
        const dir = path.join(nodesDir, `from-${slug(src.system)}`); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${slug(id)}.pipeline`), text); n++;
      }
      fetched.push({ system: src.system, ok: true, files: n, listed: list.length, ...(skipped.length ? { skipped } : {}) });
    }
    const files = [];
    const walk = (d, from) => { let names = []; try { names = fs.readdirSync(d, { withFileTypes: true }); } catch (_) {} for (const e of names) { if (e.isDirectory()) walk(path.join(d, e.name), e.name.replace(/^from-/, '')); else if (e.name.endsWith('.pipeline')) files.push({ file: path.join(d, e.name), from }); } };
    walk(shippedDir, 'cos (shipped)'); walk(nodesDir, 'cos');
    for (const f of files) results.push(await syncFile(f.file, { from: f.from, state: st }));
    fs.mkdirSync(nodesDir, { recursive: true }); fs.writeFileSync(syncedFile, JSON.stringify(st, null, 2) + '\n');
    return { ok: true, files: results, systems: fetched, imported: results.filter(r => r.action === 'imported').length, updated: results.filter(r => r.action === 'updated').length, failed: results.filter(r => !r.ok) };
  }
  const sources = () => { try { return Object.entries(JSON.parse(fs.readFileSync(syncedFile, 'utf8'))).map(([file, v]) => ({ file, ...v })); } catch (_) { return []; } };

  // ── a request planned into its own .pipeline, end state first (plan.eg) — his "They build upon request, dynamically" ──
  const ideariumRoute = async (method, p, body) => { const a = await ask('idearium', `${method} ${p}`, body, 4 * 1024 * 1024); if (a.error) return { ok: false, why: `Idearium did not answer: ${a.error}` }; let j = {}, unread = null; try { j = JSON.parse(a.body || '{}'); } catch (e) { unread = e.message; }
    // 0.60.489 — his "the pipeline says no phase selected": Idearium's list of phases (about 38,000 characters) was cut to 4,096, did not parse, and was
    // passed on as an empty answer. An answer that cannot be read is said (§1.2), never taken as empty.
    if (unread && a.status < 400) return { ok: false, why: `Idearium's answer could not be read (${a.length || (a.body || '').length} characters${a.cut ? ', cut short' : ''}): ${unread}` };
    return a.status < 400 ? { ok: true, ...j } : { ok: false, why: `Idearium answered ${a.status}${j.error ? `: ${j.error}` : ''}` }; };
  async function planPhase({ key, repo = '', chunks = false, framework = null, run = false, by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const ph = await ideariumRoute('GET', `/api/phases/one?key=${encodeURIComponent(String(key || ''))}`);
    if (!ph.ok) return { ok: false, code: 404, error: ph.why };
    const out = await eg('plan-phase', { phase: ph, opts: { repo, chunks: !!chunks, ...(framework ? { framework } : {}) } });
    if (!out.ok) return { ok: false, code: 500, error: out.error || 'Emerge did not plan it' };
    const v = (await engineP()).validate(out.pipeline); if (!v.ok) return { ok: false, code: 400, error: `the planned pipeline is not valid: ${v.problems.join('; ')}`, problems: v.problems };
    const file = writeNode(out.pipeline, { from: 'cos (planned)' });   // the node file first; the engine's copy is imported from it
    const sy = await syncFile(file, { from: 'cos (planned)' }); if (!sy.ok) return { ok: false, code: 400, error: sy.why };
    const pipeline = { id: sy.pipelineId, name: out.pipeline.name, endState: out.pipeline.endState, steps: out.pipeline.tasks.map(t => t.id), file: sy.file };
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
  // 2026-11-12 — James: "the pipeline says no phase selected". The phases Nexus can build now (Idearium's queue, by its route), for the tab to offer
  async function ready({ limit = 20 } = {}) {
    const q = await ideariumRoute('GET', `/api/phases/next?limit=${Math.max(1, Math.min(50, Number(limit) || 20))}`);
    if (!q.ok) return { ok: false, code: 502, error: q.why };
    return { ok: true, phases: (q.queue || []).map(x => ({ id: x.id, key: x.key, map: x.map, does: x.does || null })), counts: q.counts || null };
  }
  // the engine's framework step: compile the tree, name the pipeline to run
  const frameworkStep = async ({ id }) => { const r = await frameworks.tree(id); return r.ok ? { ok: true, pipeline: r.pipeline.name } : { ok: false, error: r.error }; };
  // 2026-11-10 — James: "Also needs to be able to create pipelines. That's what the canvas is for." · "I want to program it myself using the pipeline
  // instead of needing you." A pipeline drawn on ERAVOS's canvas (its .erv: Step tools and wires) comes back as a .pipeline: Emerge reads it
  // (box.eg from_erv), the node file is written first and imported from it (the same as every pipeline). The .erv is YAML; it is read here
  // because Emerge has no YAML reader yet (CIE14). A name already used updates that pipeline (keeping its id).
  async function fromErv({ text = null, erv = null, name = null, by = 'person' } = {}) {
    let e = erv;
    if (!e) { try { e = require('js-yaml').load(String(text || '')); } catch (err) { return { ok: false, code: 400, error: `not an .erv (YAML): ${err.message}` }; } }
    if (!e || typeof e !== 'object' || !Array.isArray(e.layers)) return { ok: false, code: 400, error: 'not an .erv: it has no layers (save it from ERAVOS: Start › Save as .erv)' };
    if (name) e = { ...e, name };
    const r = await eg('from-erv', e);
    if (!r || r.ok !== true) return { ok: false, code: 422, error: (r && r.problems && r.problems.length) ? r.problems.join('; ') : (r && r.error) || 'Emerge could not read the canvas', problems: (r && r.problems) || [], skipped: (r && r.skipped) || [] };
    const file = writeNode(r.pipeline, { from: 'canvas' });
    const s = await syncFile(file, { from: 'canvas' });
    if (!s.ok) return { ok: false, code: 422, error: s.why || 'the engine refused it', file: path.relative(root, file) };
    return { ok: true, pipeline: { id: s.pipelineId, name: s.name }, action: s.action, file: path.relative(root, file), steps: r.pipeline.tasks.length, skipped: r.skipped, by };
  }

  // PC8 slice a (2026-11-10) — James: "each step measured by a delta, which could be used for the timing in between each step agnostically, to
  // establish a baseline." The engine keeps each run (lib/automation/pipeline.js: a step's ms, startedAt, finishedAt, waitMs, and the decisions
  // taken during it); Emerge (baseline.eg) gives each step its baseline: mean, sigma (from three runs), the latest delta and its z.
  async function baseline({ pipeline: id, limit = 200 } = {}) {
    if (!id) return { ok: false, code: 400, error: 'name the pipeline: ?pipeline=<id>' };
    const P = await engineP(); const runs = P && typeof P.runs === 'function' ? P.runs(id, Math.min(Number(limit) || 200, 1000)) : [];
    const out = await eg('baseline', { runs: runs.map(r => ({ startedAt: r.startedAt, status: r.status, tasks: r.tasks || {} })) });
    if (!out || out.ok === false) return out || { ok: false, code: 500, error: 'Emerge gave no baseline' };
    const latest = runs[0] || null;   // newest first from the engine
    return { ...out, pipeline: id, latestRun: latest ? { id: latest.id, status: latest.status, decisions: latest.decisions || [] } : null };
  }

  return { boxes, gates, runs, frameworks, frameworkStep, decideGate, onEvent, request, resume, retry, ready, sovereign, planPhase, buildNext, sync, sources, fromErv, baseline };
}

module.exports = { createPipeline, MODULE_ID: 'cos.pipeline', VERSION: '1.0.0' };
