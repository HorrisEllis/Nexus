'use strict';
/**
 * lib/tool-forge.js — a SCHEMA for agent tools, so copilot can make its own.
 * comp_id: nexus.lib.tool-forge
 * UUID: nexus-tool-forge-v1-0000-2026-0809-001
 * Version: 0.1.0
 *
 * WHY (James, 2026-08-09): "a schema for agent/co-pilot tools... give co-pilot
 * the ability to make its own tools with a command. Giving the system a system
 * for its own capabilities."
 *
 * Yes. With one steer, and it is the whole design.
 *
 * ── COMPOSITION, NOT CODEGEN ────────────────────────────────────────────────
 * The obvious build is: copilot writes JavaScript, we require() it, it becomes a
 * tool. That is `eval` with extra steps. A self-authored tool that executes
 * arbitrary code can do anything the process can — write files, spawn, reach the
 * network — and no gate downstream can constrain it, because the gate is code
 * running beside it.
 *
 * James's own instinct points at the safe version: "dynamic tool using APIs...
 * api call to with () to make them dynamic". A tool does not need to BE code. It
 * needs to NAME something already callable and say how to pass arguments to it.
 *
 * So a forged tool is DATA:
 *     { name, description, parameters, steps: [ { call, args } ] }
 * where `call` names a thing that already exists and was already verified —
 * a capability (verified served), a lens, or another registered tool. Nothing
 * new executes. A forged tool cannot do anything copilot could not already do;
 * it packages a sequence so it can be done in one turn, by name, repeatably.
 *
 * That is the same move nexus_capability already proves: 239 tools, zero lines
 * of tool code, because they are declarative bindings to verified routes.
 *
 * ── WHAT IS ENFORCED AT FORGE TIME, NOT CALL TIME ───────────────────────────
 * §1.1 — a tool is not created until every step it names is proven to exist.
 * A step pointing at an unserved capability, an unknown lens, or a tool that is
 * not registered is REFUSED with the offending step named. A tool that fails on
 * first use is worse than one that was never made, because the agent has already
 * built a plan around it.
 *
 * ── ARGUMENT FLOW ───────────────────────────────────────────────────────────
 * Steps read from one place: `{$.foo}` takes the caller's argument `foo`,
 * `{$steps.0.bar}` takes a field from an earlier step's result. Substitution is
 * literal lookup — no expressions, no code. If a reference cannot be resolved it
 * is an error naming the reference, never an empty string quietly passed on.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'forged_tools';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

// ── The schema, stated once ─────────────────────────────────────────────────
const TOOL_SCHEMA = Object.freeze({
  name:        'string, required — snake_case, unique, not shadowing a built-in',
  description: 'string, required — what it does AND when to prefer it',
  parameters:  'JSON-schema object, required — { type:"object", properties:{}, required:[] }',
  steps:       'array, required, >=1 — [{ call, args, as? }]',
  step: {
    call: 'string, required — "capability:<id>" | "lens:<name>" | "tool:<name>"',
    args: 'object — values, or {$.param} / {$steps.N.field} references',
    as:   'string — optional label for referencing this step\'s result',
  },
});

const CALL_KINDS = ['capability', 'lens', 'tool'];

// ── Verification ────────────────────────────────────────────────────────────
function _capabilityExists(id) {
  try {
    const { loadAll, verifyRoutes } = require(path.join(ROOT, 'loom/scanners/capability-map.js'));
    const decls = loadAll();
    const { served } = verifyRoutes(decls);
    const c = decls.find(d => d.id === id);
    if (!c) return { ok: false, reason: `no capability "${id}" is declared anywhere` };
    if (!served.get(id)) return { ok: false, reason: `capability "${id}" is DECLARED BUT SERVED BY NOTHING — its route ${c.route.method} ${c.route.path} appears nowhere in ${c._dir}'s source` };
    return { ok: true };
  } catch (e) { return { ok: false, reason: `capability registry unreadable: ${e.message}` }; }
}

function _lensExists(name) {
  try {
    const L = require(path.join(ROOT, 'lib/lenses.js'));
    return L.list().some(l => l.name === name)
      ? { ok: true }
      : { ok: false, reason: `no lens "${name}" — have: ${L.list().map(l => l.name).join(', ')}` };
  } catch (e) { return { ok: false, reason: `lens engine unavailable: ${e.message}` }; }
}

function _toolExists(name) {
  try {
    const T = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    return T.TOOLS.has(name) ? { ok: true } : { ok: false, reason: `no registered tool "${name}"` };
  } catch (e) { return { ok: false, reason: `tool registry unavailable: ${e.message}` }; }
}

/** validate(def) — every rule, with the offending field named. Never throws. */
function validate(def) {
  const errors = [];
  if (!def || typeof def !== 'object') return { ok: false, errors: ['definition must be an object'], schema: TOOL_SCHEMA };

  if (!def.name || typeof def.name !== 'string') errors.push('name: required string');
  else if (!/^[a-z][a-z0-9_]{2,48}$/.test(def.name)) errors.push(`name: "${def.name}" must be snake_case, 3-49 chars, starting with a letter`);
  else {
    // §16.5 — a forged tool must never shadow a built-in. Silent shadowing means
    // a caller gets a different tool than the one they read the guide for.
    try {
      const T = require(path.join(ROOT, 'lib/agent-tools/index.js'));
      const existing = T.TOOLS.get(def.name);
      if (existing && !existing._forged) errors.push(`name: "${def.name}" is already a BUILT-IN tool — forging over it would silently change what callers get`);
    } catch (_) {}
  }

  if (!def.description || String(def.description).length < 20) errors.push('description: required, >=20 chars — say what it does AND when to prefer it');
  if (!def.parameters || def.parameters.type !== 'object' || typeof def.parameters.properties !== 'object') {
    errors.push('parameters: required JSON schema of shape { type:"object", properties:{...} }');
  }
  if (!Array.isArray(def.steps) || !def.steps.length) errors.push('steps: required non-empty array');

  (def.steps || []).forEach((s, i) => {
    if (!s || typeof s.call !== 'string') { errors.push(`steps[${i}].call: required string`); return; }
    const [kind, ...rest] = s.call.split(':');
    const target = rest.join(':');
    if (!CALL_KINDS.includes(kind)) { errors.push(`steps[${i}].call: "${s.call}" — kind must be one of ${CALL_KINDS.join(' | ')}`); return; }
    if (!target) { errors.push(`steps[${i}].call: "${s.call}" names no target`); return; }
    const check = kind === 'capability' ? _capabilityExists(target)
                : kind === 'lens'       ? _lensExists(target)
                :                         _toolExists(target);
    // §1.1 — proven at forge time. A tool that fails on first use is worse than
    // one that was never made: the agent has already planned around it.
    if (!check.ok) errors.push(`steps[${i}].call: ${check.reason}`);
    if (s.args !== undefined && (typeof s.args !== 'object' || Array.isArray(s.args))) errors.push(`steps[${i}].args: must be an object`);
  });

  return errors.length ? { ok: false, errors, schema: TOOL_SCHEMA } : { ok: true };
}

// ── Reference resolution — lookup only, never expression evaluation ─────────
function _resolve(value, ctx, trail) {
  if (typeof value === 'string') {
    const m = /^\{\$(.*)\}$/.exec(value.trim());
    if (!m) return value;
    const ref = m[1];
    if (ref.startsWith('.')) {
      const key = ref.slice(1);
      if (!(key in ctx.args)) throw new Error(`{$${ref}} — no caller argument "${key}"`);
      return ctx.args[key];
    }
    if (ref.startsWith('steps.')) {
      const [, idxRaw, ...fieldParts] = ref.split('.');
      const idx = parseInt(idxRaw, 10);
      if (!Number.isInteger(idx) || !ctx.steps[idx]) throw new Error(`{$${ref}} — no result from step ${idxRaw}`);
      let cur = ctx.steps[idx];
      for (const f of fieldParts) {
        if (cur === null || cur === undefined || !(f in cur)) throw new Error(`{$${ref}} — step ${idx} result has no field "${f}"`);
        cur = cur[f];
      }
      return cur;
    }
    throw new Error(`{$${ref}} — unknown reference form; use {$.param} or {$steps.N.field}`);
  }
  if (Array.isArray(value)) return value.map(v => _resolve(v, ctx, trail));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = _resolve(v, ctx, trail);
    return out;
  }
  return value;
}

/** Build the executable closure for a validated definition. */
function _compile(def) {
  return async function execute(args = {}) {
    const ctx = { args, steps: [] };
    const trail = [];
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i];
      const [kind, ...rest] = step.call.split(':');
      const target = rest.join(':');
      let resolved;
      try { resolved = _resolve(step.args || {}, ctx, trail); }
      catch (e) { return { error: `step ${i} (${step.call}): ${e.message}`, trail }; }

      let result;
      try {
        if (kind === 'capability') {
          const CAP = require(path.join(ROOT, 'lib/agent-tools/tools/coordination/capability-tools.js'));
          result = await CAP.execute({ action: 'call', id: target, ...resolved, intent: `forged:${def.name}` });
        } else if (kind === 'lens') {
          const L = require(path.join(ROOT, 'lib/lenses.js'));
          const parsed = L.parse(resolved.input, { lenses: [target], system: resolved.system });
          result = parsed.ok ? { ok: true, ...parsed.readings[target] } : parsed;
        } else {
          const T = require(path.join(ROOT, 'lib/agent-tools/index.js'));
          result = await T.executeTool(target, resolved);
        }
      } catch (e) { return { error: `step ${i} (${step.call}) threw: ${e.message}`, trail }; }

      ctx.steps.push(result);
      trail.push({ step: i, call: step.call, as: step.as, ok: !(result && result.error) });

      // §1.2 — a failing step STOPS the tool and returns the trail. Continuing
      // would let later steps read a missing result and produce a plausible
      // answer built on nothing.
      if (result && result.error) return { ok: false, failedStep: i, call: step.call, error: result.error, trail, results: ctx.steps };
    }
    return { ok: true, tool: def.name, trail, result: ctx.steps[ctx.steps.length - 1], steps: ctx.steps };
  };
}

// ── Persistence + registration ──────────────────────────────────────────────
function list() {
  const jaa = _jaa();
  if (!jaa) return [];
  try { return (jaa.query(TABLE, () => true, 1000) || []).filter(r => r.status !== 'revoked'); }
  catch (_) { return []; }
}

/** forge(def, opts) — validate, persist, register. Refuses rather than warns. */
function forge(def, opts = {}) {
  const v = validate(def);
  if (!v.ok) return { ok: false, reason: 'definition rejected', errors: v.errors, schema: TOOL_SCHEMA };

  const record = {
    name: def.name, description: def.description, parameters: def.parameters,
    steps: def.steps, forgedBy: opts.forgedBy || 'copilot', intent: opts.intent || null,
    status: 'active', ts: Date.now(),
  };
  const jaa = _jaa();
  if (jaa) { try { jaa.insert(TABLE, record); } catch (e) { return { ok: false, reason: `could not persist: ${e.message}` }; } }

  const registered = register(record);
  return { ok: true, forged: def.name, steps: def.steps.length, registered: registered.ok,
           persisted: !!jaa,
           note: jaa ? undefined : 'JAA unavailable — this tool is registered for THIS PROCESS ONLY and will not survive a restart' };
}

/** register(record) — attach a forged definition to the live tool registry. */
function register(record) {
  try {
    const T = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    T.registerTool({
      name: record.name,
      description: `[forged] ${record.description}`,
      parameters: record.parameters,
      execute: _compile(record),
      _forged: true,
      // Carried so tool-guide can self-document this tool (CA2 coverage).
      _steps: record.steps,
    });
    return { ok: true };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/** loadAll() — re-register every persisted forged tool. Call at boot. */
function loadAll() {
  const rows = list();
  const out = { loaded: [], failed: [] };
  for (const r of rows) {
    // Re-validate on load: a forged tool whose target capability has since been
    // removed must NOT come back. §0.1 — proven now, not when it was written.
    const v = validate({ ...r, name: r.name });
    if (!v.ok) { out.failed.push({ name: r.name, errors: v.errors }); continue; }
    (register(r).ok ? out.loaded : out.failed).push(r.name);
  }
  return out;
}

function revoke(name) {
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'JAA unavailable' };
  const rows = list().filter(r => r.name === name);
  if (!rows.length) return { ok: false, reason: `no forged tool "${name}"` };
  try {
    // §0.3 — archived, never deleted. What was forged and why stays readable.
    for (const r of rows) jaa.update(TABLE, r.uuid || r.id, { status: 'revoked', revokedAt: Date.now() });
    const T = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    T.TOOLS.delete(name);
    return { ok: true, revoked: name };
  } catch (e) { return { ok: false, reason: e.message }; }
}

module.exports = { TOOL_SCHEMA, CALL_KINDS, validate, forge, register, loadAll, list, revoke, _resolve, _compile, TABLE, VERSION: '0.1.0' };
