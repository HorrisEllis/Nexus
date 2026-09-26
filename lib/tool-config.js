'use strict';
/**
 * lib/tool-config.js — per-tool configuration, as data.
 * comp_id: nexus.lib.tool-config
 * UUID: nexus-tool-config-v1-0000-2026-0819-001
 * Version: 1.0.0
 * spec: docs/copilot-tool-system.spec § P1
 *
 * WHY (James, 2026-08-19): "backend first, i want to use co-pilot to change
 * the options in the configs."
 *
 * §8.5 — backend first. This is the foundation: the store, the rules, and the
 * two structural enforcement points. No UI, no API, no CLI in this file.
 *
 * §0.3 / §17.5 — APPEND-ONLY. Every change is a new row carrying who changed
 * it, when, and why. "Why is this tool behaving differently than last week" has
 * to be answerable, and an overwriting store cannot answer it.
 *
 * §CTS-INV-2 — AN UNCONFIGURED TOOL BEHAVES EXACTLY AS IT DOES TODAY. There
 * are ~71 tools in the tree. If landing this file changed the behaviour of any
 * tool nobody had configured, the patch would silently alter all of them at
 * once. Absence of a record means defaults, and defaults mean "as before".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * §THE RATCHET — the rule that makes agent-driven config safe
 *
 * You want co-pilot changing these options. §7.2 says ideas cannot affect
 * runtime and §17.10 says nothing bypasses verification, so the naive version
 * — an agent freely rewriting the config that governs it — is out.
 *
 * The resolution is directional, not a blanket ban:
 *
 *   TIGHTENING is always allowed, from anyone.
 *     disable a tool · require confirmation · narrow allowedAgents
 *   LOOSENING requires the user.
 *     enable a tool · drop confirmation · widen allowedAgents
 *
 * An agent that can only ever restrict itself cannot grant itself capability,
 * which is the whole risk. And it keeps the useful half: co-pilot noticing
 * "run_command has failed four times in this session, I'm disabling it" is
 * exactly the self-improvement worth having, and it needs no permission.
 *
 * The loosening path is not a refusal — it returns a PROPOSAL, and
 * copilot/lib/autonomy-router.js 2.0.0 already implements propose-then-confirm
 * for every state-changing action. Reused, not reinvented (§16.5).
 *
 * §NO LIMITS FIELD YET. perHour/maxConcurrent belong to P3 and are not here,
 * because a stored limit that nothing enforces is a placeholder that looks
 * like a safeguard — §1.3, and worse than its absence since it would be
 * trusted.
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const TABLE     = 'tool_config';
const VERSION   = '1.0.0';
const MODULE_ID = 'nexus.lib.tool-config';

/** Who asked. The agent tool hard-codes 'agent' and cannot pass anything else. */
const ACTOR = Object.freeze({ USER: 'user', AGENT: 'agent', SYSTEM: 'system' });

/**
 * The config shape. Absent fields mean default, and default means
 * "behave exactly as an unconfigured tool always has" (§CTS-INV-2).
 */
const DEFAULTS = Object.freeze({
  enabled:         true,   // offered to the model, and executable
  requiresConfirm: false,  // execution returns a proposal instead of running
  allowedAgents:   null,   // null = every agent; an array narrows it
  defaults:        null,   // argument defaults merged under caller args
  notes:           null,
});

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _rows() {
  const jaa = _jaa();
  if (!jaa) return [];
  try { return jaa.query(TABLE, () => true, 5000) || []; } catch (_) { return []; }
}

/** Latest row per tool. Append-only, so "current" is the newest write. */
function _current() {
  const byTool = new Map();
  for (const r of _rows()) {
    const prev = byTool.get(r.toolName);
    if (!prev || (r.ts || 0) >= (prev.ts || 0)) byTool.set(r.toolName, r);
  }
  return byTool;
}

/**
 * get(toolName) — the effective config. Never null: an unconfigured tool
 * returns the defaults, so every caller has one shape to handle (§1.2 — a
 * caller forced to distinguish "no config" from "default config" will
 * eventually get it wrong).
 */
function get(toolName) {
  const row = _current().get(toolName);
  if (!row) return { toolName, ...DEFAULTS, configured: false };
  const { id, ts, changedBy, reason, ...cfg } = row;
  return { ...DEFAULTS, ...cfg, toolName, configured: true, changedBy, changedAt: ts, reason };
}

/** list() — every configured tool. Unconfigured ones are absent by design. */
function list() {
  return [..._current().values()].map(r => get(r.toolName));
}

/** history(toolName) — every change, oldest first. §0.3 — nothing is lost. */
function history(toolName) {
  return _rows()
    .filter(r => r.toolName === toolName)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .map(r => ({ ts: r.ts, changedBy: r.changedBy, reason: r.reason, enabled: r.enabled, requiresConfirm: r.requiresConfirm, allowedAgents: r.allowedAgents }));
}

/**
 * _direction(from, to) — is this change tightening, loosening, or neither?
 *
 * The whole safety model rests on this function, so it is deliberately
 * explicit rather than clever. A change that loosens ANY field counts as
 * loosening even if it tightens another — the mixed case must not sneak a
 * loosening through under cover of a tightening.
 */
function _direction(from, to) {
  const loosens = [], tightens = [];

  if (to.enabled !== undefined && to.enabled !== from.enabled) {
    (to.enabled ? loosens : tightens).push(`enabled ${from.enabled} → ${to.enabled}`);
  }
  if (to.requiresConfirm !== undefined && to.requiresConfirm !== from.requiresConfirm) {
    (to.requiresConfirm ? tightens : loosens).push(`requiresConfirm ${from.requiresConfirm} → ${to.requiresConfirm}`);
  }
  if (to.allowedAgents !== undefined) {
    const a = from.allowedAgents, b = to.allowedAgents;
    if (a === null && Array.isArray(b))       tightens.push('allowedAgents: all → a list');
    else if (Array.isArray(a) && b === null)  loosens.push('allowedAgents: a list → all');
    else if (Array.isArray(a) && Array.isArray(b)) {
      const added = b.filter(x => !a.includes(x));
      const gone  = a.filter(x => !b.includes(x));
      if (added.length) loosens.push(`allowedAgents +${added.join(',')}`);
      if (gone.length)  tightens.push(`allowedAgents -${gone.join(',')}`);
    }
  }
  // `defaults` and `notes` change behaviour but grant no new reach, so they
  // are neutral — an agent tuning a default argument is the ordinary case
  // this feature exists for.
  return { loosens, tightens, isLoosening: loosens.length > 0 };
}

/**
 * set(toolName, changes, opts) — change a tool's config.
 *
 * @param {string} toolName
 * @param {object} changes  any of: enabled, requiresConfirm, allowedAgents, defaults, notes
 * @param {object} opts     { by: 'user'|'agent'|'system', reason: string }
 * @returns {{ok:boolean, config?:object, proposal?:object, reason?:string}}
 */
function set(toolName, changes = {}, opts = {}) {
  if (!toolName || typeof toolName !== 'string') return { ok: false, reason: 'toolName is required' };
  const by = opts.by || ACTOR.AGENT;
  if (!Object.values(ACTOR).includes(by)) return { ok: false, reason: `by must be one of: ${Object.values(ACTOR).join(', ')}` };

  const known = ['enabled', 'requiresConfirm', 'allowedAgents', 'defaults', 'notes'];
  const unknown = Object.keys(changes).filter(k => !known.includes(k));
  // §1.2 — a silently ignored option is a config that lies about what it does.
  if (unknown.length) return { ok: false, reason: `unknown option(s): ${unknown.join(', ')} — known: ${known.join(', ')}` };

  // §CTS-INV-9 first — config is data, never code. Checked BEFORE the shape
  // rules so the informative reason wins: "must be an object" is true of a
  // function but tells the caller nothing about why it can never be one.
  for (const v of Object.values(changes)) {
    if (typeof v === 'function') return { ok: false, reason: 'config values are data, never functions' };
  }

  if (changes.allowedAgents !== undefined && changes.allowedAgents !== null && !Array.isArray(changes.allowedAgents)) {
    return { ok: false, reason: 'allowedAgents must be null (all agents) or an array of agent names' };
  }
  if (changes.defaults !== undefined && changes.defaults !== null && typeof changes.defaults !== 'object') {
    return { ok: false, reason: 'defaults must be null or an object of argument defaults' };
  }
  const from = get(toolName);
  const dir  = _direction(from, changes);

  if (dir.isLoosening && by !== ACTOR.USER) {
    // Not a refusal — a proposal. The user confirms through the same
    // propose-then-confirm path autonomy-router already implements.
    return {
      ok: false,
      needsUser: true,
      proposal: { toolName, changes, loosens: dir.loosens, tightens: dir.tightens, proposedBy: by, reason: opts.reason || null, ts: Date.now() },
      reason: `this change loosens the config (${dir.loosens.join('; ')}) — loosening needs you, not the agent. Tightening applies immediately.`,
    };
  }

  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable — config not written' };

  const row = {
    id: `${toolName}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    toolName,
    enabled:         changes.enabled         !== undefined ? changes.enabled         : from.enabled,
    requiresConfirm: changes.requiresConfirm !== undefined ? changes.requiresConfirm : from.requiresConfirm,
    allowedAgents:   changes.allowedAgents   !== undefined ? changes.allowedAgents   : from.allowedAgents,
    defaults:        changes.defaults        !== undefined ? changes.defaults        : from.defaults,
    notes:           changes.notes           !== undefined ? changes.notes           : from.notes,
    changedBy: by,
    reason: opts.reason || null,
    direction: dir.isLoosening ? 'loosen' : (dir.tightens.length ? 'tighten' : 'neutral'),
    ts: Date.now(),
  };
  jaa.insert(TABLE, row);
  return { ok: true, config: get(toolName), applied: { loosens: dir.loosens, tightens: dir.tightens } };
}

/**
 * check(toolName, ctx) — may this tool run right now?
 *
 * Called from the structural gate in lib/agent-tools/index.js. Returns a
 * decision, never throws, and an unconfigured tool always passes (§CTS-INV-2).
 */
function check(toolName, ctx = {}) {
  const cfg = get(toolName);
  if (!cfg.configured) return { allow: true, config: cfg };

  if (cfg.enabled === false) {
    return { allow: false, reason: `tool "${toolName}" is disabled in its config${cfg.reason ? ` — ${cfg.reason}` : ''} (changed by ${cfg.changedBy})`, config: cfg };
  }
  if (Array.isArray(cfg.allowedAgents) && ctx.agent && !cfg.allowedAgents.includes(ctx.agent)) {
    return { allow: false, reason: `tool "${toolName}" is restricted to: ${cfg.allowedAgents.join(', ')} — current agent is "${ctx.agent}"`, config: cfg };
  }
  if (cfg.requiresConfirm && !ctx.confirmed) {
    return { allow: false, needsConfirm: true, reason: `tool "${toolName}" requires confirmation before it runs${cfg.reason ? ` — ${cfg.reason}` : ''}`, config: cfg };
  }
  return { allow: true, config: cfg };
}

/** applyDefaults(toolName, args) — merge configured defaults UNDER caller args. */
function applyDefaults(toolName, args = {}) {
  const cfg = get(toolName);
  if (!cfg.configured || !cfg.defaults) return args;
  // Caller args win. A default that overrode an explicit argument would make
  // the tool disobey its own call.
  return { ...cfg.defaults, ...args };
}

module.exports = { get, set, list, history, check, applyDefaults, DEFAULTS, ACTOR, TABLE, MODULE_ID, VERSION, _direction };
