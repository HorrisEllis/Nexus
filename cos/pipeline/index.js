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
    const base = { base: dataDir, shipped, mine, q, at: Date.now(), dry, ...(context ? { context } : {}) };
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
  const decideGate = (q) => inOrder(() => gate(q));

  // ── a request, kept as files ──
  const onEvent = (type, data) => inOrder(async () => {
    const needsPipeline = type === 'automation.pipeline.start' && !(data.meta && data.meta.request);
    const pipeline = needsPipeline ? await getPipeline(data.pipelineId) : null;
    await eg('event', { base: dataDir, kind: type, data, pipeline, at: Date.now() });
  });
  const runs = {
    // reads wait their turn too, so they see every event that came before them
    list: ({ state = 'active' } = {}) => inOrder(async () => (await eg('list', { base: dataDir, which: state })).requests || []),
    read: (id) => inOrder(async () => { const r = await eg('read', { base: dataDir, id }); return r.ok ? r.request : null; }),
  };
  async function request({ pipeline, vars = {}, by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const p = await getPipeline(pipeline); if (!p) return { ok: false, code: 404, error: `no pipeline "${pipeline}"` };
    const made = await inOrder(() => eg('request', { base: dataDir, pipeline: p, vars, by, at: Date.now() })); if (!made.ok) return made;
    const r = await (await engineP()).run(p.id, { vars, wait: false, meta: { request: made.request } });
    return r.ok ? { ok: true, request: made.request, engineRun: r.runId } : { ok: false, code: 400, error: r.error, request: made.request };
  }
  async function resume(id, { by } = {}) {
    if (!by) return { ok: false, code: 400, error: 'say who asks: { "by": "person" }' };
    const q = await inOrder(() => eg('resume-of', { base: dataDir, id })); if (!q.ok) return q;
    const r = await (await engineP()).run(q.pipeline, { vars: q.vars, wait: false, done: q.done, meta: { request: id } });
    return r.ok ? { ok: true, request: id, engineRun: r.runId, alreadyMet: Object.keys(q.done) } : { ok: false, code: 400, error: r.error };
  }
  return { boxes, gates, runs, decideGate, onEvent, request, resume };
}

module.exports = { createPipeline, MODULE_ID: 'cos.pipeline', VERSION: '1.0.0' };
