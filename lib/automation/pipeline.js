'use strict';
/**
 * lib/automation/pipeline.js — pipelines: tasks in a dependency graph, each one engine step, gated, run as a checklist (PL1, 0.60.284).
 * comp_id: nexus.lib.automation.pipeline
 * Spec: docs/automation-pipelines.spec MOD-PIPELINE · Map: docs/2026-10-29-pipelines-phasemap.spec PL1
 *
 * James, 2026-10-29: "making a pipeline and workflow feature and include the macros and automation" · earlier: "For automation of macros,
 * Tasks in a dependency graph as a checklist?"
 *
 * A task is ONE step of the engine's catalogue (a macro, a workflow, an agent, a Nexus command, a browser action, a web request …), run by
 * engine.runStep with the instance's own hooks — nothing here runs a step itself (PL_D1). What this adds: the dependencies, a gate on
 * what a task gave, retries, blocking the tasks that depended on a failure, and the run kept as a checklist.
 *
 *   validate(pipeline, { stepTypes })  → { ok, problems }   ids, dependencies, cycles, step types, gates, settings
 *   layers(pipeline)                   → [[ids], …]        tasks in a layer depend only on earlier layers
 *   gateOpen(gate, output)             → { open, why }   (gate.element is read after the task by the engine's gate step, PL7)
 *   siteMatches(site, url)             → a site pipeline's site (origin or pattern) holds this page (PL10)
 *   new Pipelines(engine, { dir })     → list, get, create, update, archive, validate, run, cancel, runs, getRun
 *
 * A task reads {{vars.x}} (the pipeline's vars and the run's) and {{tasks.<id>.output}} of the tasks it depends on.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ID_RE = /^[A-Za-z][\w-]{0,40}$/;
const TASK_STATUS = ['waiting', 'running', 'done', 'failed', 'blocked'];

function _text(v) { if (v == null) return ''; if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch (_) { return String(v); } }
function _preview(v, max = 2000) { const s = _text(v); return s.length > max ? `${s.slice(0, max)}… (${s.length} characters)` : (typeof v === 'string' || v == null ? v : (() => { try { return JSON.parse(s); } catch (_) { return s; } })()); }

/** gateOpen(gate, output) — every key given must hold; no gate → open */
function gateOpen(gate, output) {
  if (gate && gate.element !== undefined) { gate = { ...gate }; delete gate.element; }   // the element gate is read by the gate step (PL7)
  if (!gate || typeof gate !== 'object' || !Object.keys(gate).length) return { open: true, why: null };
  const t = _text(output);
  if (gate.notEmpty && !t.trim()) return { open: false, why: 'the output is empty' };
  if (gate.contains != null && !t.includes(String(gate.contains))) return { open: false, why: `the output does not contain "${gate.contains}"` };
  if (gate.equals != null && t.trim() !== String(gate.equals).trim()) return { open: false, why: `the output is "${t.slice(0, 80)}", not "${gate.equals}"` };
  if (gate.matches != null) { let re; try { re = new RegExp(gate.matches); } catch (e) { return { open: false, why: `the gate's pattern is invalid: ${e.message}` }; }
    if (!re.test(t)) return { open: false, why: `the output does not match /${gate.matches}/` }; }
  return { open: true, why: null };
}

// 2026-10-30 PL7 — the shape of an element gate (the condition itself is read by Clear Glass's driver: src/page/element-gate.js validates it
// there; this side only checks it names something to read and something that must hold, so a bad gate is refused when the pipeline is saved)
const ELEMENT_WHAT = ['value', 'equals', 'matches', 'shows', 'checked', 'text', 'visible', 'gone', 'url'];
function elementGateProblems(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return ['the element gate is { gateId } or { selector | xpath, and what must hold }'];
  if (e.gateId) return /^[\w-]{1,60}$/.test(String(e.gateId)) ? [] : ['gateId names one of your gates'];
  const what = ELEMENT_WHAT.filter(k => e[k] !== undefined && e[k] !== null && e[k] !== '');
  if (!what.length) return [`the element gate says nothing that must hold (one of ${ELEMENT_WHAT.join(', ')})`];
  if (!e.selector && !e.xpath && what.some(k => !['text', 'url'].includes(k))) return ['the element gate names no element (a selector or XPath; only text and url are read on the whole page)'];
  return [];
}
function siteOk(site) { return /^https?:\/\/[^\s/]+/.test(String(site)); }
/** siteMatches(site, url) — an origin matches every page of it; a pattern (with *) matches as a glob */
function siteMatches(site, url) {
  const s = String(site || ''), u = String(url || ''); if (!s || !u) return false;
  if (!s.includes('*')) { try { return new URL(s).origin === new URL(u).origin && u.startsWith(s.replace(/\/$/, '')); } catch (_) { return false; } }
  const esc = s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^?#]*').replace(/\u0000/g, '.*');
  try { return new RegExp('^' + esc + '$').test(u); } catch (_) { return false; }
}

/** validate(pipeline, { stepTypes, validateStep }) → { ok, problems } — every problem named, nothing run (PL-002) */
function validate(p, { stepTypes = null, validateStep = null } = {}) {
  const problems = [];
  if (!p || typeof p !== 'object') return { ok: false, problems: ['a pipeline is an object'] };
  if (!String(p.name || '').trim()) problems.push('the pipeline needs a name');
  if (String(p.name || '').length > 80) problems.push('the name is longer than 80 characters');
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  if (!tasks.length) problems.push('the pipeline has no tasks');
  const ids = new Set();
  for (const [i, t] of tasks.entries()) {
    const at = `task ${i + 1}${t && t.id ? ` (${t.id})` : ''}`;
    if (!t || typeof t !== 'object') { problems.push(`${at} is not an object`); continue; }
    if (!ID_RE.test(String(t.id || ''))) problems.push(`${at}: an id is a letter, then letters, digits, _ or - (at most 41)`);
    else if (ids.has(t.id)) problems.push(`${at}: the id "${t.id}" is used twice`);
    else ids.add(t.id);
    if (!t.step || !t.step.type) problems.push(`${at}: it runs no step (step.type)`);
    else if (stepTypes && !stepTypes.has(t.step.type)) problems.push(`${at}: unknown step type "${t.step.type}"`);
    else if (validateStep) for (const x of validateStep(t.step)) problems.push(`${at}: ${x}`);
    if (t.depends_on != null && !Array.isArray(t.depends_on)) problems.push(`${at}: depends_on is a list of task ids`);
    if (t.retries != null && !(Number.isInteger(t.retries) && t.retries >= 0 && t.retries <= 5)) problems.push(`${at}: retries is 0 to 5`);
    if (t.onFail != null && !['stop', 'continue'].includes(t.onFail)) problems.push(`${at}: onFail is stop or continue`);
    if (t.gate != null) {
      if (typeof t.gate !== 'object') problems.push(`${at}: the gate is { notEmpty, contains, equals, matches, element }`);
      else { for (const k of Object.keys(t.gate)) if (!['notEmpty', 'contains', 'equals', 'matches', 'element'].includes(k)) problems.push(`${at}: unknown gate key "${k}"`);
        if (t.gate.matches != null) { try { new RegExp(t.gate.matches); } catch (e) { problems.push(`${at}: the gate's pattern is invalid (${e.message})`); } }
        // 2026-10-30 PL7 — an element gate: one of his gates (gateId) or a condition on an element, read after the task by the gate step
        if (t.gate.element != null) for (const x of elementGateProblems(t.gate.element)) problems.push(`${at}: ${x}`); }
    }
  }
  for (const t of tasks) for (const d of (t && Array.isArray(t.depends_on) ? t.depends_on : [])) {
    if (d === t.id) problems.push(`task ${t.id} depends on itself`);
    else if (!ids.has(d)) problems.push(`task ${t.id} depends on "${d}", which is not a task here`);
  }
  if (!problems.length) { const c = _cycle(tasks); if (c) problems.push(`a cycle: ${c.join(' → ')}`); }
  // 2026-10-30 PL10 — James: "with the option for per site pipelines". site: an origin (https://www.fiverr.com) or a URL pattern; onLoad: run
  // when a page of it opens. No site: the pipeline works on any page, as before.
  if (p.site != null && p.site !== '' && !siteOk(p.site)) problems.push(`the site "${p.site}" is not a site: give its address (https://…) or a pattern (https://www.fiverr.com/users/*)`);
  if (p.onLoad && !p.site) problems.push('a pipeline that runs when a page opens needs its site');
  const par = p.settings && p.settings.parallel;
  if (par != null && !(Number.isInteger(par) && par >= 1 && par <= 4)) problems.push('settings.parallel is 1 to 4');
  return { ok: !problems.length, problems };
}

function _cycle(tasks) {
  const deps = new Map(tasks.map(t => [t.id, t.depends_on || []]));
  const state = new Map(), stack = [];
  const visit = (id) => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return stack.slice(stack.indexOf(id)).concat(id);
    state.set(id, 1); stack.push(id);
    for (const d of deps.get(id) || []) { const c = visit(d); if (c) return c; }
    stack.pop(); state.set(id, 2); return null;
  };
  for (const id of deps.keys()) { const c = visit(id); if (c) return c; }
  return null;
}

/** layers(pipeline) → [[ids]] — the order a checklist reads in; assumes validate() passed */
function layers(p) {
  const tasks = p.tasks || [], done = new Set(), out = [];
  while (done.size < tasks.length) {
    const layer = tasks.filter(t => !done.has(t.id) && (t.depends_on || []).every(d => done.has(d))).map(t => t.id);
    if (!layer.length) break;
    layer.forEach(id => done.add(id)); out.push(layer);
  }
  return out;
}

class Pipelines {
  constructor(engine, { dir = null, stepTypes = null, validateStep = null } = {}) {
    this.engine = engine;
    const E = require('./engine.js');
    this.dir = dir || path.join(path.dirname(E.WORKFLOWS_DIR), 'pipelines');
    this.runsDir = path.join(this.dir, 'runs');
    const S = require('./steps.js');
    this.stepTypes = stepTypes || S.byType;
    this.validateStep = validateStep || ((st) => S.validateStep(st));
    this._active = new Map();
  }
  _ensure() { fs.mkdirSync(this.runsDir, { recursive: true }); }
  // 2026-10-30 PN2 — James: "these are meant to be actual persistent files in the backend. all nodes are supposed to be physcial files for each
  // system." Each pipeline is its own .pipeline node file (the NEXUS envelope, readable and editable); a JSON pipeline from before is rewritten as
  // .pipeline on first read and the JSON moved to <dir>/_archive (§0.3). Runs stay JSON in runs/ (records, not nodes).
  _file(id) { return path.join(this.dir, `${String(id).replace(/[^\w-]/g, '_')}.pipeline`); }
  _legacy(id) { return path.join(this.dir, `${String(id).replace(/[^\w-]/g, '_')}.json`); }
  _writePipe(p) {
    const NX = require('../node-export.js');
    const env = NX.wrap('pipeline', p.id, p, { context: 'Clear Glass → Settings → Pipelines', intent: p.description || null,
      summary: `${(p.tasks || []).length} task(s)${p.site ? ` for ${p.site}${p.onLoad ? ' (runs when a page opens)' : ''}` : ''}`, system: 'clear-glass',
      tags: ['pipeline', ...(p.site ? [`site:${p.site}`] : []), ...(p.archived ? ['archived'] : [])], source: 'lib/automation/pipeline.js' });
    this._write(this._file(p.id), null, NX.toYaml(env));
    // §17.12 — a pipeline made or changed is a change: its whole node text to Versionium (buffered while it is down)
    try { require('../versionium-record.js').record({ kind: 'automation.pipeline.save', system: 'clear-glass', message: `pipeline ${p.name} saved`, change: { file: path.basename(this._file(p.id)), dir: this.dir, text: NX.toYaml(env) } }); } catch (_) {}
  }
  _readPipe(file) { const NX = require('../node-export.js'); const doc = NX.fromYaml(fs.readFileSync(file, 'utf8')); return doc && doc.payload ? doc.payload : null; }
  _migrate(id) {
    const old = this._legacy(id); let p = null; try { p = JSON.parse(fs.readFileSync(old, 'utf8')); } catch (_) { return null; }
    if (!p || !p.id) return null;
    this._writePipe(p);
    try { const arc = path.join(this.dir, '_archive'); fs.mkdirSync(arc, { recursive: true }); fs.renameSync(old, path.join(arc, path.basename(old))); } catch (_) {}
    return p;
  }
  _write(file, obj, text = null) { this._ensure(); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, text != null ? text : JSON.stringify(obj, null, 2)); fs.renameSync(tmp, file); }
  _emit(type, data) { try { this.engine && this.engine._busEmit && this.engine._busEmit(type, { ...data, ts: Date.now() }); } catch (_) {} }

  validate(p) { return validate(p, { stepTypes: this.stepTypes, validateStep: this.validateStep }); }

  list({ includeArchived = false } = {}) {
    let names = []; try { names = fs.readdirSync(this.dir); } catch (_) { return []; }
    for (const f of names.filter(x => x.endsWith('.json'))) this._migrate(f.slice(0, -5));   // PN2: an old JSON pipeline becomes a .pipeline file
    try { names = fs.readdirSync(this.dir).filter(f => f.endsWith('.pipeline')); } catch (_) { return []; }
    this.unreadable = [];
    return names.map(f => { try { return this._readPipe(path.join(this.dir, f)); } catch (e) { this.unreadable.push({ file: f, why: e.message }); return null; } })
      .filter(p => p && (includeArchived || !p.archived)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
  get(id) { try { return this._readPipe(this._file(id)); } catch (_) { return this._migrate(id); } }
  /** forSite(url, { onLoad }) — the pipelines of this page's site (PL10); onLoad: only those that run when a page of it opens */
  forSite(url, { onLoad = false } = {}) { return this.list().filter(p => p.site && siteMatches(p.site, url) && (!onLoad || p.onLoad)); }

  _clean(p) {
    return { name: String(p.name || '').trim(), description: String(p.description || ''), vars: p.vars && typeof p.vars === 'object' ? p.vars : {},
      settings: { parallel: 1, ...(p.settings || {}) },
      ...(p.site ? { site: String(p.site).trim() } : {}), ...(p.site && p.onLoad ? { onLoad: true } : {}),   // 2026-10-30 PL10
      tasks: (p.tasks || []).map(t => ({ id: t.id, label: t.label || t.id, depends_on: t.depends_on || [], step: t.step, ...(t.gate ? { gate: t.gate } : {}),
        retries: t.retries || 0, onFail: t.onFail || 'stop' })) };
  }
  create(p = {}) {
    const v = this.validate(p); if (!v.ok) return { ok: false, error: `the pipeline is not valid: ${v.problems.join('; ')}`, problems: v.problems };
    const now = Date.now(); const pipe = { id: randomUUID(), ...this._clean(p), archived: false, createdAt: now, updatedAt: now };
    this._writePipe(pipe); this._emit('automation.pipeline.created', { pipelineId: pipe.id, name: pipe.name });
    return { ok: true, pipeline: pipe };
  }
  update(id, patch = {}) {
    const cur = this.get(id); if (!cur) return { ok: false, status: 404, error: `no pipeline ${id}` };
    const next = { ...cur, ...this._clean({ ...cur, ...patch }) };
    const v = this.validate(next); if (!v.ok) return { ok: false, error: `the pipeline is not valid: ${v.problems.join('; ')}`, problems: v.problems };
    next.updatedAt = Date.now(); this._writePipe(next); return { ok: true, pipeline: next };
  }
  /** archive(id, { archived }) — kept, out of the list (§0.3, PL-004) */
  archive(id, { archived = true } = {}) {
    const cur = this.get(id); if (!cur) return { ok: false, status: 404, error: `no pipeline ${id}` };
    cur.archived = !!archived; cur.updatedAt = Date.now(); this._writePipe(cur); return { ok: true, pipeline: cur };
  }

  _saveRun(run) { try { this._write(path.join(this.runsDir, `${run.id}.json`), run); } catch (e) { run.saveError = e.message; } }
  runs(pipelineId, limit = 20) {
    let names = []; try { names = fs.readdirSync(this.runsDir).filter(f => f.endsWith('.json')); } catch (_) { return []; }
    return names.map(f => { try { return JSON.parse(fs.readFileSync(path.join(this.runsDir, f), 'utf8')); } catch (_) { return null; } })
      .filter(r => r && (!pipelineId || r.pipelineId === pipelineId)).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }
  getRun(runId) { return this._active.get(runId) || (() => { try { return JSON.parse(fs.readFileSync(path.join(this.runsDir, `${runId}.json`), 'utf8')); } catch (_) { return null; } })(); }
  cancel(runId) { const r = this._active.get(runId); if (!r) return { ok: false, status: 404, error: 'that run is not running' }; r.cancelled = 'cancelled by request'; return { ok: true }; }

  /**
   * run(id, { vars, wait }) — the ready tasks (all their dependencies done) run through engine.runStep, up to settings.parallel at once.
   * Returns { ok, runId, run } when it finishes (wait) — or { ok, runId } at once and the run goes on (the checklist is saved as it changes).
   */
  async run(id, { vars = {}, wait = true } = {}) {
    const p = this.get(id); if (!p) return { ok: false, status: 404, error: `no pipeline ${id}` };
    if (p.archived) return { ok: false, error: 'that pipeline is archived; restore it to run it' };
    const v = this.validate(p); if (!v.ok) return { ok: false, error: `the pipeline is not valid: ${v.problems.join('; ')}`, problems: v.problems };
    if (!this.engine || typeof this.engine.runStep !== 'function') return { ok: false, error: 'no automation engine here to run the tasks' };
    const run = { id: randomUUID(), pipelineId: p.id, pipelineName: p.name, status: 'running', order: layers(p), startedAt: Date.now(), finishedAt: null,
      tasks: Object.fromEntries(p.tasks.map(t => [t.id, { label: t.label, status: 'waiting', attempts: 0, ms: null, output: null, error: null, blockedBy: null }])) };
    this._active.set(run.id, run); this._saveRun(run);
    this._emit('automation.pipeline.start', { pipelineId: p.id, runId: run.id });
    const go = this._drive(p, run, vars).finally(() => this._active.delete(run.id));
    if (!wait) { go.catch(() => {}); return { ok: true, runId: run.id, status: 'running' }; }
    await go;
    return { ok: run.status === 'ok', runId: run.id, status: run.status, run, ...(run.status === 'ok' ? {} : { error: run.error || 'a task failed' }) };
  }

  async _drive(p, run, vars) {
    const byId = new Map(p.tasks.map(t => [t.id, t]));
    const outputs = {};
    const parallel = Math.max(1, Math.min(4, (p.settings && p.settings.parallel) || 1));
    const running = new Map();
    let stop = false;
    const set = (id, patch) => { Object.assign(run.tasks[id], patch); this._saveRun(run); this._emit('automation.pipeline.task', { pipelineId: p.id, runId: run.id, task: id, status: run.tasks[id].status, attempts: run.tasks[id].attempts }); };
    const block = (failedId) => {
      // every task downstream of a failure is blocked, said with the task that blocked it (PL-003)
      let changed = true;
      while (changed) { changed = false;
        for (const t of p.tasks) { const st = run.tasks[t.id]; if (st.status !== 'waiting') continue;
          const bad = (t.depends_on || []).find(d => ['failed', 'blocked'].includes(run.tasks[d].status));
          if (bad) { set(t.id, { status: 'blocked', blockedBy: run.tasks[bad].status === 'failed' ? bad : run.tasks[bad].blockedBy || bad }); changed = true; } } }
    };
    const runTask = async (t) => {
      const scope = { tasks: Object.fromEntries((t.depends_on || []).map(d => [d, { output: outputs[d] }])) };
      const tries = 1 + (t.retries || 0); const t0 = Date.now(); let last = null;
      for (let a = 1; a <= tries; a++) {
        if (run.cancelled) { last = { error: run.cancelled }; break; }
        set(t.id, { status: 'running', attempts: a });
        // __pipelineChain: the pipelines this run sits inside (PL9) — a task that runs a pipeline already in it is refused (a loop)
        const tv = { ...(p.vars || {}), ...vars, __pipelineChain: [...(Array.isArray(vars.__pipelineChain) ? vars.__pipelineChain : []), p.id] };
        let r; try { r = await this.engine.runStep(t.step, { vars: tv, scope }); } catch (e) { r = { ok: false, error: e.message }; }
        // 2026-10-30 PL7 — then its element gate, read by the gate step (the same block a workflow uses): closed is a closed gate
        if (r && r.ok && t.gate && t.gate.element && gateOpen({ ...t.gate, element: undefined }, r.output).open) {
          // read on the page the task acted on: a macro's window (its agentId, else his own), else the engine's automation page
          const onPage = t.gate.element.page || (t.step.type === 'macro' ? ((t.step.config && t.step.config.agentId) || 'default') : undefined);
          let eg; try { eg = await this.engine.runStep({ type: 'gate', config: { ...t.gate.element, ...(onPage ? { page: onPage } : {}) } }, { vars: tv, scope }); } catch (e) { eg = { ok: false, error: e.message }; }
          if (!eg || !eg.ok) { last = { error: `gate: ${(eg && eg.error) || 'not read'}`, output: r.output }; continue; }
        }
        if (r && r.ok) { const g = gateOpen({ ...(t.gate || {}), element: undefined }, r.output); if (g.open) { outputs[t.id] = r.output; set(t.id, { status: 'done', ms: Date.now() - t0, output: _preview(r.output), error: null }); return true; } last = { error: `gate: ${g.why}`, output: r.output }; }
        else last = { error: (r && r.error) || 'the step gave no answer' };
      }
      set(t.id, { status: 'failed', ms: Date.now() - t0, error: last.error + (tries > 1 ? ` (after ${tries} attempts)` : ''), output: last.output !== undefined ? _preview(last.output) : null });
      if (t.onFail !== 'continue') stop = true;
      block(t.id);
      return false;
    };
    for (;;) {
      if (run.cancelled) stop = true;
      const ready = stop ? [] : p.tasks.filter(t => run.tasks[t.id].status === 'waiting' && !running.has(t.id) && (t.depends_on || []).every(d => run.tasks[d].status === 'done'));
      while (ready.length && running.size < parallel) { const t = ready.shift(); running.set(t.id, runTask(t).finally(() => running.delete(t.id))); }
      if (!running.size) break;
      await Promise.race(running.values());
    }
    const states = Object.values(run.tasks).map(x => x.status);
    run.status = run.cancelled ? 'cancelled' : states.every(s => s === 'done') ? 'ok' : 'failed';
    if (run.status !== 'ok') { const f = p.tasks.find(t => run.tasks[t.id].status === 'failed'); run.error = run.cancelled || (f ? `${f.id}: ${run.tasks[f.id].error}` : 'not every task ran'); }
    // a task never reached (the run stopped) stays waiting; said as not run
    for (const t of p.tasks) if (run.tasks[t.id].status === 'waiting') run.tasks[t.id].error = stop ? 'not run: the pipeline stopped' : 'not run';
    run.finishedAt = Date.now(); this._saveRun(run);
    this._emit('automation.pipeline.done', { pipelineId: p.id, runId: run.id, status: run.status });
  }
}

module.exports = { validate, layers, gateOpen, siteMatches, elementGateProblems, Pipelines, TASK_STATUS, MODULE_ID: 'nexus.lib.automation.pipeline' };
