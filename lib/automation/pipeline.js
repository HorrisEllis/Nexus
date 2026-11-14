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
const T = require('./template.js');   // 2026-11-09: a step's condition (when) is rendered as the engine renders a step
const TASK_STATUS = ['waiting', 'running', 'done', 'failed', 'blocked', 'skipped'];   // skipped: 2026-11-09, its condition (when) was false

function _text(v) { if (v == null) return ''; if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch (_) { return String(v); } }
function _preview(v, max = 2000) { const s = _text(v); return s.length > max ? `${s.slice(0, max)}… (${s.length} characters)` : (typeof v === 'string' || v == null ? v : (() => { try { return JSON.parse(s); } catch (_) { return s; } })()); }

/** gateOpen(gate, output) — every key given must hold; no gate → open */
function gateOpen(gate, output) {
  if (gate && gate.element !== undefined) { gate = { ...gate }; delete gate.element; }   // the element gate is read by the gate step (PL7)
  // PC12a (0.60.522) — a closed gate says the owner's own words when it names where they are in the output (reasonAt: "body.check.reasons"):
  // a RAID gate that did not pass holds the run saying RAID's reason, not the pattern that did not match (§1.2)
  if (gate && gate.reasonAt !== undefined) { const at = gate.reasonAt; gate = { ...gate }; delete gate.reasonAt;
    const g = gateOpen(gate, output); if (g.open) return g;
    let v = output; for (const k of String(at).split('.')) v = v == null ? undefined : (typeof v === 'string' ? (() => { try { return JSON.parse(v)[k]; } catch (_) { return undefined; } })() : v[k]);
    const one = (x) => (x && typeof x === 'object' ? (x.question ? `${x.id ? x.id + ': ' : ''}${x.question}` : (x.why || x.reason || x.error || _text(x))) : String(x));   // PC13: a gap says its id and question
    const said = Array.isArray(v) ? v.filter(x => x && !(typeof x === 'object' && x.answer != null)).map(one).join('; ') : (v == null ? '' : one(v));   // an answered gap is not asked again
    return said ? { open: false, why: said.slice(0, 500) } : g; }
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
    if (t.onFail != null && !['stop', 'continue', 'hold'].includes(t.onFail)) problems.push(`${at}: onFail is stop, continue or hold`);
    // 2026-11-09 — when: { left (a value or template: {{tasks.<id>.output}}, {{vars.x}}), op (steps.js OPS), value } — the step runs only when it holds
    if (t.when != null) { const ops = require('./steps.js').OPS.map(o => o.value);
      if (typeof t.when !== 'object' || Array.isArray(t.when)) problems.push(`${at}: when is { left, op, value }`);
      else if (!ops.includes(t.when.op || '==')) problems.push(`${at}: when's op "${t.when.op}" is not one of ${ops.join(', ')}`); }
    // 2026-11-09 — takes / gives: node types (lib/node-schemas/schema.<type>), a list of names
    for (const k of ['takes', 'gives']) if (t[k] != null && (!Array.isArray(t[k]) || t[k].some(x => typeof x !== 'string' || !/^[a-z][a-z0-9_]{0,40}$/.test(x)))) problems.push(`${at}: ${k} is a list of node types (chunk, contract, context …)`);
    if (t.gate != null) {
      if (typeof t.gate !== 'object') problems.push(`${at}: the gate is { notEmpty, contains, equals, matches, element }`);
      else { for (const k of Object.keys(t.gate)) if (!['notEmpty', 'contains', 'equals', 'matches', 'element', 'type', 'with', 'reasonAt'].includes(k)) problems.push(`${at}: unknown gate key "${k}"`);   // PC5: type + with, a typed gate
        if (t.gate.type != null && (typeof t.gate.type !== 'string' || !/^[\w-]{1,60}$/.test(t.gate.type))) problems.push(`${at}: the gate's type names a gate type`);
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
      ...(p.endState && typeof p.endState === 'object' && p.endState.says ? { endState: { says: String(p.endState.says), ...(p.endState.from ? { from: String(p.endState.from) } : {}) } } : {}),   // 2026-11-09 end state first: what done is, kept with the pipeline (his "It's end state first reasoning")
      settings: { parallel: 1, ...(p.settings || {}) },
      ...(p.site ? { site: String(p.site).trim() } : {}), ...(p.site && p.onLoad ? { onLoad: true } : {}),   // 2026-10-30 PL10
      tasks: (p.tasks || []).map(t => ({ id: t.id, label: t.label || t.id, depends_on: t.depends_on || [], step: t.step, ...(t.gate ? { gate: t.gate } : {}),
        // 2026-11-09 — the node types a step takes from the steps it waits on, and gives (.chunk, .contract, .context …, lib/node-schemas): the wires carry them
        ...(t.when && typeof t.when === 'object' ? { when: t.when } : {}),   // 2026-11-09 — BrainOS's conditions, on a pipeline step: it runs only when this holds
        ...(Array.isArray(t.takes) && t.takes.length ? { takes: t.takes.map(String) } : {}), ...(Array.isArray(t.gives) && t.gives.length ? { gives: t.gives.map(String) } : {}),
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
  cancel(runId) { const r = this._active.get(runId); if (!r) return { ok: false, status: 404, error: 'that run is not running' }; r.cancelled = 'cancelled by request'; this._wake(runId); return { ok: true }; }
  // PC8 slice b (2026-11-11), his 2026-11-10 "execute, or manage the pipeline": paused, no new step starts (a running step finishes); continued,
  // the run goes on where it was. Each is an event, so the tab and the request's files see it.
  pause(runId, { by } = {}) { const r = this._active.get(runId); if (!r) return { ok: false, status: 404, error: 'that run is not running' }; if (r.paused) return { ok: true, status: 'paused' };
    r.paused = { by: by || null, at: Date.now() }; r.status = 'paused'; this._saveRun(r); this._emit('automation.pipeline.paused', { pipelineId: r.pipelineId, runId, by: by || null }); return { ok: true, status: 'paused' }; }
  // PC13 (0.60.526): continuing a held run may give it values (his answers to a gap): merged into the run's own vars, so the step asked again sees them
  unpause(runId, { by, vars: give = null } = {}) { const r = this._active.get(runId); if (!r) return { ok: false, status: 404, error: 'that run is not running' };
    if (give && typeof give === 'object') { const v = this._runVars && this._runVars.get(runId); if (v) for (const [k, x] of Object.entries(give)) { if (/^__/.test(k)) continue;
      // a JSON object given where one is held (his answers) is merged into it, so a second answer keeps the first
      const asObj = (t) => { if (t && typeof t === 'object' && !Array.isArray(t)) return t; try { const o = JSON.parse(t); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (_) { return null; } };
      const was = asObj(v[k]), now = asObj(x); v[k] = was && now ? JSON.stringify({ ...was, ...now }) : x; } }
    if (!r.paused) return { ok: true, status: r.status };
    r.pausedMs = (r.pausedMs || 0) + (Date.now() - r.paused.at); r.paused = null; r.status = 'running'; this._saveRun(r); this._emit('automation.pipeline.continued', { pipelineId: r.pipelineId, runId, by: by || null }); this._wake(runId); return { ok: true, status: 'running' }; }
  _wake(runId) { const w = this._wakers && this._wakers.get(runId); if (w) { this._wakers.delete(runId); w(); } }

  /**
   * run(id, { vars, wait }) — the ready tasks (all their dependencies done) run through engine.runStep, up to settings.parallel at once.
   * Returns { ok, runId, run } when it finishes (wait) — or { ok, runId } at once and the run goes on (the checklist is saved as it changes).
   */
  // 2026-11-09 PC5 — done: { <task>: output } — tasks already met in an earlier run of the same request (COS's run folder): they start done with
  // that output, and only the rest run (a resumed request). meta rides on the start event, so the host can tie this run to its request's files.
  /** needs(p, vars) — the vars a step's address (url) uses that are empty for this run (the pipeline's own value, else the run's) */
  needs(p, vars = {}) {
    const all = { ...(p.vars || {}), ...vars }, out = new Set();
    for (const t of p.tasks || []) { const u = t.step && t.step.config && t.step.config.url; if (typeof u !== 'string') continue;
      for (const m of u.matchAll(/\{\{\s*vars\.([A-Za-z_][\w]*)[^}]*\}\}/g)) if (all[m[1]] === undefined || all[m[1]] === null || String(all[m[1]]).trim() === '') out.add(m[1]); }
    return [...out];
  }
  async run(id, { vars = {}, wait = true, done = null, meta = null } = {}) {
    const p = this.get(id); if (!p) return { ok: false, status: 404, error: `no pipeline ${id}` };
    if (p.archived) return { ok: false, error: 'that pipeline is archived; restore it to run it' };
    const v = this.validate(p); if (!v.ok) return { ok: false, error: `the pipeline is not valid: ${v.problems.join('; ')}`, problems: v.problems };
    if (!this.engine || typeof this.engine.runStep !== 'function') return { ok: false, error: 'no automation engine here to run the tasks' };
    // 2026-11-10 — James: "it is stuck" (GET /api/repos//phases/map → 404). A value the pipeline puts in an address, left empty, makes a broken
    // address several steps in; it is asked for before anything runs instead: { needs: [names] }, and a run can give them (vars)
    const needs = this.needs(p, vars); if (!done && needs.length) return { ok: false, status: 400, needs, error: `give ${needs.map(n => `vars.${n}`).join(', ')} first: ${needs.length > 1 ? 'they are' : 'it is'} part of a step's address, and empty` };
    const run = { id: randomUUID(), pipelineId: p.id, pipelineName: p.name, status: 'running', order: layers(p), startedAt: Date.now(), finishedAt: null,
      tasks: Object.fromEntries(p.tasks.map(t => [t.id, done && Object.prototype.hasOwnProperty.call(done, t.id) ? { label: t.label, status: 'done', attempts: 0, ms: 0, output: _preview(done[t.id]), error: null, blockedBy: null, met: 'earlier' } : { label: t.label, status: 'waiting', attempts: 0, ms: null, output: null, error: null, blockedBy: null }])) };
    this._active.set(run.id, run); this._saveRun(run);
    // vars ride on the start event so a run started anywhere (a trigger, a workflow's pipeline step) is a request the host can keep and resume;
    // the host keeps them off any live stream (COS strips vars and value)
    this._emit('automation.pipeline.start', { pipelineId: p.id, runId: run.id, vars, ...(meta ? { meta } : {}) });
    (this._runVars || (this._runVars = new Map())).set(run.id, vars);   // PC13: the run's own vars, so Continue can add to them
    const go = this._drive(p, run, vars, done || {}).finally(() => { this._active.delete(run.id); this._runVars.delete(run.id); });
    if (!wait) { go.catch(() => {}); return { ok: true, runId: run.id, status: 'running' }; }
    await go;
    return { ok: run.status === 'ok', runId: run.id, status: run.status, run, ...(run.status === 'ok' ? {} : { error: run.error || 'a task failed' }) };
  }

  async _drive(p, run, vars, done = {}) {
    const byId = new Map(p.tasks.map(t => [t.id, t]));
    const outputs = { ...done };
    const full = new Map();   // 2026-11-09 — a task's whole output, on its done / failed event only (the run record keeps the preview)
    const parallel = Math.max(1, Math.min(4, (p.settings && p.settings.parallel) || 1));
    const running = new Map();
    let stop = false;
    const set = (id, patch) => { Object.assign(run.tasks[id], patch); this._saveRun(run); this._emit('automation.pipeline.task', { pipelineId: p.id, pipeline: p.name, runId: run.id, task: id, label: (p.tasks.find(t => t.id === id) || {}).label || null, status: run.tasks[id].status, attempts: run.tasks[id].attempts, ...(run.tasks[id].status === 'failed' ? { error: run.tasks[id].error } : {}), ...(run.tasks[id].gate ? { gate: run.tasks[id].gate } : {}), ...(run.tasks[id].note ? { note: run.tasks[id].note } : {}), ...(run.tasks[id].output != null ? { output: run.tasks[id].output } : {}), ...(full.has(id) ? { value: full.get(id) } : {}) }); };   // PC4/PC5 2026-11-09: what passed (a preview; value: the whole of it, for the host's files) and what its gate decided   // GF6: a failed task's label and error, for the toast
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
        // PC8 slice a (2026-11-10, his "each step measured by a delta"): when the step started, and its wait after the steps it waits on finished
        if (a === 1) { const after = Math.max(run.startedAt, ...(t.depends_on || []).map(d => run.tasks[d] && run.tasks[d].finishedAt || 0)); const now = Date.now();
          set(t.id, { status: 'running', attempts: a, startedAt: now, waitMs: now - after }); } else set(t.id, { status: 'running', attempts: a });
        // __pipelineChain: the pipelines this run sits inside (PL9) — a task that runs a pipeline already in it is refused (a loop)
        const tv = { ...(p.vars || {}), ...vars, __pipelineChain: [...(Array.isArray(vars.__pipelineChain) ? vars.__pipelineChain : []), p.id], __parent: { engineRun: run.id, task: t.id } };   // 2026-11-09: a step that runs a pipeline names itself as the child's parent (recursive requests)
        let r; try { r = await this.engine.runStep(t.step, { vars: tv, scope }); } catch (e) { r = { ok: false, error: e.message }; }
        // PC8 slice a: a decision taken during the step (RAID choosing the agent) becomes a step of the run, as it happens
        if (r && r.decision) { const d = { ...r.decision, task: t.id, attempt: a }; run.decisions = [...(run.decisions || []), d];
          set(t.id, { decisions: [...(run.tasks[t.id].decisions || []), d] }); this._emit('automation.pipeline.decision', { pipelineId: p.id, pipeline: p.name, runId: run.id, task: t.id, decision: d }); }
        // 2026-10-30 PL7 — then its element gate, read by the gate step (the same block a workflow uses): closed is a closed gate
        if (r && r.ok && t.gate && t.gate.element && gateOpen({ ...t.gate, element: undefined }, r.output).open) {
          // read on the page the task acted on: a macro's window (its agentId, else his own), else the engine's automation page
          const onPage = t.gate.element.page || (t.step.type === 'macro' ? ((t.step.config && t.step.config.agentId) || 'default') : undefined);
          let eg; try { eg = await this.engine.runStep({ type: 'gate', config: { ...t.gate.element, ...(onPage ? { page: onPage } : {}) } }, { vars: tv, scope }); } catch (e) { eg = { ok: false, error: e.message }; }
          if (!eg || !eg.ok) { last = { error: `gate: ${(eg && eg.error) || 'not read'}`, output: r.output }; continue; }
        }
        // PC5 (2026-11-09) — a typed gate ({ type, with }) is the host's to decide (COS's gate types, decided in Emerge): it holds what it saw across
        // runs, tests and verifies by its owners' routes, and turns a reason that keeps closing it into a gap. Its verdict rides on the task (and
        // its event) for the canvas. A gate of keys (notEmpty, contains …) is decided here, as before, and recorded the same way.
        if (r && r.ok && t.gate && t.gate.type) {
          let g; if (!this.engine._gate) g = { outcome: 'closed', open: false, why: `this engine has no gate types: "${t.gate.type}" is decided by COS's gates`, saw: [], actions: [] };
          else { try { g = await this.engine._gate({ pipelineId: p.id, task: t.id, runId: run.id, attempt: a, gate: t.gate, output: r.output }); } catch (e) { g = { outcome: 'closed', open: false, why: `the gate could not decide: ${e.message}`, saw: [], actions: [] }; } }
          run.tasks[t.id].gate = { type: t.gate.type, outcome: g.outcome, why: g.why || null, saw: g.saw || [], held: !!g.held, actions: g.actions || [], ...(g.options && g.options.length ? { options: g.options.map(o => o.label) } : {}) };
          if (g.open) { outputs[t.id] = r.output; full.set(t.id, r.output); set(t.id, { status: 'done', ms: Date.now() - t0, finishedAt: Date.now(), output: _preview(r.output), error: null }); return true; }
          last = { error: `gate ${g.outcome}: ${g.why}`, output: r.output };
          if (!g.retry) break;   // a gate that says hold, stop or gap is not retried: it has decided
          continue;
        }
        if (r && r.ok) { const g = gateOpen({ ...(t.gate || {}), element: undefined }, r.output); if (t.gate) run.tasks[t.id].gate = { type: 'keys', outcome: g.open ? 'open' : 'closed', why: g.why || null }; if (g.open) { outputs[t.id] = r.output; full.set(t.id, r.output); set(t.id, { status: 'done', ms: Date.now() - t0, finishedAt: Date.now(), output: _preview(r.output), error: null }); return true; } last = { error: `gate: ${g.why}`, output: r.output }; }
        else last = { error: (r && r.error) || 'the step gave no answer' };
      }
      // 0.60.496 PC8 — James, 2026-10-26: "the gate doesn't wait for me to accept it or not before it fails." · 2026-11-11: "Do it". A step with
      // onFail hold does not fail the run: the run is paused by the pipeline, naming the step and why; the step stays waiting, and continue
      // (the same door as a pause by him) asks it again. Cancelled, it fails as any step does.
      if (t.onFail === 'hold' && !run.cancelled) {
        if (last.output !== undefined) full.set(t.id, last.output);
        const why = last.error + (tries > 1 ? ` (after ${tries} attempts)` : '');
        run.paused = { by: 'the pipeline', at: Date.now(), task: t.id, why }; run.status = 'paused';
        set(t.id, { status: 'waiting', ms: Date.now() - t0, held: { why, at: Date.now(), times: ((run.tasks[t.id].held && run.tasks[t.id].held.times) || 0) + 1 }, note: `waits for you: ${why}`, error: null, output: last.output !== undefined ? _preview(last.output) : null });
        this._emit('automation.pipeline.paused', { pipelineId: p.id, runId: run.id, by: 'the pipeline', task: t.id, why });
        return false;
      }
      if (last.output !== undefined) full.set(t.id, last.output);
      set(t.id, { status: 'failed', ms: Date.now() - t0, finishedAt: Date.now(), error: last.error + (tries > 1 ? ` (after ${tries} attempts)` : ''), output: last.output !== undefined ? _preview(last.output) : null });
      if (t.onFail !== 'continue') stop = true;
      block(t.id);
      return false;
    };
    for (;;) {
      if (run.cancelled) stop = true;
      // PC8 slice b: paused — what runs finishes; nothing new starts until it is continued (or cancelled)
      if (run.paused && !run.cancelled) { if (running.size) { await Promise.race(running.values()); continue; } if (!this._wakers) this._wakers = new Map(); await new Promise(res => this._wakers.set(run.id, res)); continue; }
      // 2026-11-09 — James: "Also conditions, triggers, events, etc. migrate BrainOS' features to the engine." A step waits on steps done or skipped; a
      // step whose every step it waits on was skipped is skipped too (that branch was not taken); a step with a condition (when) that does not hold
      // is skipped, said with what it saw. A join (some done, some skipped) runs.
      const settled = (d) => ['done', 'skipped'].includes(run.tasks[d].status);
      let ready = stop ? [] : p.tasks.filter(t => run.tasks[t.id].status === 'waiting' && !running.has(t.id) && (t.depends_on || []).every(settled));
      let skippedNow = false;
      for (const t of ready) {
        const deps = t.depends_on || [];
        if (deps.length && deps.every(d => run.tasks[d].status === 'skipped')) { set(t.id, { status: 'skipped', error: null, note: 'every step it waits on was skipped' }); skippedNow = true; continue; }
        if (t.when) {
          const ctx = { vars: { ...(p.vars || {}), ...vars }, tasks: Object.fromEntries(deps.map(d => [d, { output: outputs[d] }])) };
          const left = T.render(t.when.left === undefined ? '' : t.when.left, ctx);
          const holds = this.engine && typeof this.engine._compare === 'function' ? this.engine._compare(left, t.when.op || '==', t.when.value) : String(left) === String(t.when.value);
          if (!holds) { set(t.id, { status: 'skipped', error: null, note: `its condition is false: ${_preview(left, 80)} ${t.when.op || '=='} ${t.when.value === undefined ? '' : t.when.value}` }); skippedNow = true; continue; }
        }
      }
      ready = ready.filter(t => run.tasks[t.id].status === 'waiting');
      if (skippedNow && !ready.length && !running.size) continue;
      while (ready.length && running.size < parallel) { const t = ready.shift(); running.set(t.id, runTask(t).finally(() => running.delete(t.id))); }
      if (!running.size) break;
      await Promise.race(running.values());
    }
    const states = Object.values(run.tasks).map(x => x.status);
    run.status = run.cancelled ? 'cancelled' : states.every(s => s === 'done' || s === 'skipped') ? 'ok' : 'failed';
    if (run.status !== 'ok') { const f = p.tasks.find(t => run.tasks[t.id].status === 'failed'); run.error = run.cancelled || (f ? `${f.id}: ${run.tasks[f.id].error}` : 'not every task ran'); }
    // a task never reached (the run stopped) stays waiting; said as not run
    for (const t of p.tasks) if (run.tasks[t.id].status === 'waiting') run.tasks[t.id].error = stop ? 'not run: the pipeline stopped' : 'not run';
    run.finishedAt = Date.now(); this._saveRun(run);
    this._emit('automation.pipeline.done', { pipelineId: p.id, runId: run.id, status: run.status });
  }
}

module.exports = { validate, layers, gateOpen, siteMatches, elementGateProblems, Pipelines, TASK_STATUS, MODULE_ID: 'nexus.lib.automation.pipeline' };
