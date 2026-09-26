'use strict';
/**
 * lib/agent-tools/tools/clear-glass/automation.js — clear_glass_automation:
 * the co-pilot builds, runs and inspects Clear Glass workflows.
 *
 * §0.39.265 — James: "expand the workflow, and macros, as much as you can,
 * including the agent tools." Same architecture as tab-visibility.js and
 * userscripts.js in this folder: this runs in co-pilot's Node process; the
 * engine (clear-glass/src/mesh/automation-engine.js) lives in Clear Glass's
 * main process and is reached over its wire server (:7704, /automation/*).
 * Nothing here re-implements the engine — every action is one HTTP call.
 *
 * Honestly fails, never fabricates: Clear Glass not running is a plain
 * { error } naming that, not an invented success.
 */
const http = require('http');

const WIRE_PORT = parseInt(process.env.WIRE_PORT || '7704', 10);

function _call(method, path, body, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ hostname: '127.0.0.1', port: WIRE_PORT, path, method, timeout: timeoutMs,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      let out = ''; res.setEncoding('utf8'); res.on('data', c => out += c);
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (_) { resolve({ ok: false, error: `Clear Glass answered HTTP ${res.statusCode} with something that is not JSON` }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: `Clear Glass is not reachable on :${WIRE_PORT} (${e.code || e.message}) — is it running?` }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: `Clear Glass did not answer within ${Math.round(timeoutMs / 1000)} s` }); });
    if (data) req.write(data);
    req.end();
  });
}

const enc = encodeURIComponent;
async function _id(a) {
  if (a.workflowId) return a.workflowId;
  if (!a.name) return null;
  const r = await _call('GET', '/automation/workflows');
  const w = (r.workflows || []).find(x => x.id === a.name || String(x.name).toLowerCase() === String(a.name).toLowerCase());
  return w ? w.id : null;
}
const need = async (a) => { const id = await _id(a); if (!id) throw new Error(a.workflowId || a.name ? `no workflow "${a.workflowId || a.name}"` : 'name the workflow (workflowId or name)'); return id; };
const W = (id) => `/automation/workflows/${enc(id)}`;
function _summary(w) {
  return { id: w.id, name: w.name, status: w.status, description: w.description || '', steps: (w.steps || []).map(s => `${s.type}${s.label ? ` “${s.label}”` : ''}${s.enabled === false ? ' (off)' : ''}`), nextRunAt: w.nextRunAt || null, lastRun: w.lastRun || null, lastStatus: w.lastStatus || null, lastError: w.lastError || null, runCount: w.runCount || 0 };
}

const ACTIONS = {
  async list() { const r = await _call('GET', '/automation/workflows'); return r.ok === false ? r : { ok: true, workflows: (r.workflows || []).map(_summary) }; },
  async get(a) { const id = await need(a); const r = await _call('GET', '/automation/workflows'); const w = (r.workflows || []).find(x => x.id === id); return w ? { ok: true, workflow: w } : { ok: false, error: 'not found' }; },
  async catalogue() { const r = await _call('GET', '/automation/catalogue'); if (r.ok === false) return r;
    return { ok: true, steps: r.catalogue.map(c => ({ type: c.type, label: c.label, help: c.help, output: c.output, fields: c.fields.map(f => `${f.key}${f.required ? '*' : ''}: ${f.type}${f.options ? ` (${f.options.map(o => o.value || o).join('|')})` : ''}${f.when ? ` when ${JSON.stringify(f.when)}` : ''}`) })),
      stepOptions: r.common.map(f => `${f.key}: ${f.type}`), triggers: r.trigger, operators: r.ops.map(o => o.value),
      templating: '{{vars.x}} {{steps.<label>.output}} {{last}} {{item}} {{index}} {{trigger.x}} {{memory.x}} {{now:YYYY-MM-DD}} with filters: | number | trim | json | length | join:", " | match:"re" | default:"x" …' }; },
  async templates() { const r = await _call('GET', '/automation/templates'); return r.ok === false ? r : { ok: true, templates: r.templates.map(t => ({ id: t.id, name: t.name, help: t.help, vars: t.vars || {} })) }; },
  async create(a) {
    if (!a.workflowName && !a.template) return { ok: false, error: 'create needs workflowName (and steps, or a template id)' };
    let steps = a.steps, vars = a.vars, description = a.description || '';
    if (a.template) {
      const t = ((await _call('GET', '/automation/templates')).templates || []).find(x => x.id === a.template);
      if (!t) return { ok: false, error: `no template "${a.template}"` };
      steps = t.steps; vars = { ...(t.vars || {}), ...(a.vars || {}) }; description = description || t.help;
    }
    if (!Array.isArray(steps)) return { ok: false, error: 'steps must be a list of {type, config, label?, saveAs?, retry?, onError?}' };
    const r = await _call('POST', '/automation/workflows', { name: a.workflowName || a.template, description, status: a.enable ? 'active' : 'paused', steps, vars, settings: a.settings });
    if (!r.ok) return r;
    const v = await _call('GET', `${W(r.workflow.id)}/validate`);
    return { ok: true, workflow: _summary(r.workflow), problems: v.problems || [] };
  },
  async update(a) {
    const id = await need(a);
    const patch = {};
    for (const k of ['description', 'steps', 'vars', 'settings']) if (a[k] !== undefined) patch[k] = a[k];
    if (a.workflowName) patch.name = a.workflowName;
    const r = await _call('PATCH', W(id), patch);
    if (!r.ok) return r;
    const v = await _call('GET', `${W(id)}/validate`);
    return { ok: true, workflow: _summary(r.workflow), problems: v.problems || [] };
  },
  async add_step(a) { const id = await need(a); if (!a.step || !a.step.type) return { ok: false, error: 'add_step needs step: {type, config}' }; return _call('POST', `${W(id)}/steps`, a.step); },
  async enable(a) { const id = await need(a); return _call('PATCH', W(id), { status: 'active' }); },
  async disable(a) { const id = await need(a); return _call('PATCH', W(id), { status: 'paused' }); },
  async delete(a) { const id = await need(a); return _call('DELETE', W(id)); },
  async validate(a) { const id = await need(a); return _call('GET', `${W(id)}/validate`); },
  async run(a) {
    const id = await need(a);
    if (a.wait === false) return _call('POST', `${W(id)}/start`, { vars: a.vars || {} });
    const r = await _call('POST', `${W(id)}/run`, { vars: a.vars || {} }, Math.max(10000, Math.min(parseInt(a.timeoutMs, 10) || 600000, 3600000)));
    if (r.runId) { const d = await _call('GET', `/automation/runs/${enc(r.runId)}`); if (d.ok) r.steps = d.run.steps.map(s => ({ step: s.label || s.type, status: s.status, ms: s.ms, output: s.output, error: s.error })); }
    return r;
  },
  async runs(a) { const id = await need(a); return _call('GET', `${W(id)}/runs?limit=${parseInt(a.limit, 10) || 10}`); },
  async run_detail(a) { if (!a.runId) return { ok: false, error: 'run_detail needs runId' }; return _call('GET', `/automation/runs/${enc(a.runId)}`); },
  async active() { return _call('GET', '/automation/active'); },
  async cancel(a) { if (a.runId) return _call('POST', `/automation/runs/${enc(a.runId)}/cancel`); const id = await need(a); return _call('POST', `${W(id)}/cancel`); },
  async export(a) { const id = await need(a); return _call('GET', `${W(id)}/export`); },
  async import(a) { if (!a.workflow) return { ok: false, error: 'import needs workflow (an exported workflow object)' }; return _call('POST', '/automation/import', a.workflow); },
  async from_macro(a) { if (!a.macro) return { ok: false, error: 'from_macro needs macro (the macro’s name)' }; return _call('POST', '/automation/from-macro', { name: a.macro, workflowName: a.workflowName }); },
  // §0.39.266 — .workflow / .macro node files
  async export_node(a) {
    if (a.macro) return _call(a.save ? 'POST' : 'GET', `/automation/macros/${enc(a.macro)}/node${a.save ? '/save' : ''}`, a.save ? { tags: a.tags || [] } : undefined);
    const id = await need(a);
    return _call(a.save ? 'POST' : 'GET', `${W(id)}/node${a.save ? '/save' : ''}`, a.save ? { tags: a.tags || [] } : undefined);
  },
  async import_node(a) {
    if (a.file) return _call('POST', `/automation/nodes/${enc(a.file)}/import`, { allowDuplicate: !!a.allowDuplicate });
    if (!a.text) return { ok: false, error: 'import_node needs text (a .workflow/.macro file’s contents) or file (a name from list_nodes)' };
    return _call('POST', '/automation/import', { text: a.text, allowDuplicate: !!a.allowDuplicate, name: a.workflowName });
  },
  async list_nodes() { return _call('GET', '/automation/nodes'); },
  async emit(a) { if (!a.event) return { ok: false, error: 'emit needs event' }; return _call('POST', `/automation/events/${enc(a.event)}`, a.payload || {}); },
};

module.exports = {
  name: 'clear_glass_automation',
  description:
    'Build, run and inspect Clear Glass workflows (Settings → Automation): Tasker/Automate-style chains that run on a ' +
    'schedule (every N, daily at, cron), on events (a page visited, a download, another workflow finishing, custom events) ' +
    'or a webhook. Steps drive a real browser (browser: navigate/click/fill/select/press/scroll/screenshot/eval; extract: ' +
    'text/lists/attributes/records/tables/links; wait_until), move data (set, http, file as text/JSON/CSV), branch and loop ' +
    '(condition, loop with only-new items, workflow, stop, fail), ask agents and wait for the reply (agent await:true), ' +
    'notify, log and emit events. Every text field takes {{templates}}. Each step can carry saveAs, retry {count, delayMs, ' +
    'backoff}, timeoutMs and onError (fail|continue|stop|<step id>). Call "catalogue" first to see every step type and its ' +
    'fields; "templates" for ready-made workflows. Actions: list, get, catalogue, templates, create (workflowName + steps, ' +
    'or template), update, add_step, enable, disable, delete, validate, run (vars; waits for the result unless wait:false), ' +
    'runs, run_detail, active, cancel, export, import, emit, from_macro (turn a saved macro into a workflow), export_node (a workflow — or macro — as a .workflow/.macro node file; save:true keeps it in the library; a .workflow bundles the macros and workflows it uses), import_node (text or a library file), list_nodes.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      workflowId: { type: 'string', description: 'the workflow (or give name)' },
      name: { type: 'string', description: 'the workflow by name (instead of workflowId)' },
      workflowName: { type: 'string', description: 'for create/update — the name to give it' },
      description: { type: 'string' },
      template: { type: 'string', description: 'for create — a template id from "templates"' },
      steps: { type: 'array', description: 'for create/update — [{type, config, label?, id?, saveAs?, retry?, timeoutMs?, onError?, enabled?}]; the first is usually {type:"trigger", config:{cron|intervalMs|at+days|event+match|webhook:true}}', items: { type: 'object' } },
      step: { type: 'object', description: 'for add_step' },
      vars: { type: 'object', description: 'for create/update: the workflow’s default variables; for run: values for this run' },
      settings: { type: 'object', description: '{concurrency: skip|queue|parallel, maxSteps, timeoutMs, partition: "persist:…", showPage}' },
      enable: { type: 'boolean', description: 'for create — switch it on straight away' },
      wait: { type: 'boolean', description: 'for run — false: start it and return at once' },
      timeoutMs: { type: 'number', description: 'for run — how long to wait for the result' },
      runId: { type: 'string', description: 'for run_detail/cancel' },
      limit: { type: 'number' },
      workflow: { type: 'object', description: 'for import' },
      event: { type: 'string', description: 'for emit' },
      save: { type: 'boolean', description: 'for export_node — also save the file in the automation node library' },
      text: { type: 'string', description: 'for import_node — a .workflow or .macro file’s contents (YAML)' },
      file: { type: 'string', description: 'for import_node — a file name from list_nodes' },
      allowDuplicate: { type: 'boolean', description: 'for import_node — import even when an identical workflow is already here' },
      tags: { type: 'array', items: { type: 'string' }, description: 'for export_node — extra tags on the node' },
      macro: { type: 'string', description: 'for from_macro — a saved macro to turn into a workflow (its {{slots}} become {{vars.*}})' },
      payload: { type: 'object', description: 'for emit — the values the triggered workflows see as {{trigger.*}}' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { const r = await fn(args); return r && r.ok === false && r.error ? { error: r.error, ...r } : r; }
    catch (e) { return { error: `clear_glass_automation ${args.action} failed: ${e.message}` }; }
  },
  _call, ACTIONS,
};
