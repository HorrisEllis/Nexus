'use strict';
/**
 * lib/step-gate.js — every build step passes a gate before it hands its output on (0.39.282, N21 of
 * docs/2026-09-29-nex-node-store-phasemap.spec).
 *
 * James, 2026-09-29, after Idearium showed src/kernel/state.js at 0 bytes with its plan job marked "replied": "Shouldn't
 * generate empty. Why not gate each step with events." The reply was a refusal ("I can't safely rebuild …") plus an empty
 * fence, and every stage passed it on.
 *
 * gate(step, subject, { causedBy }) runs the checks of the step's rule node (lib/step-gates/<step>.step_gate, YAML, schema
 * lib/node-schemas/schema.step_gate) and EMITS the outcome on nexus-bus: step.passed or step.blocked, with the reasons and
 * the causal id of the step before, so the next step starts only on a pass and a block is an event the system can trace.
 * The rules are nodes, not literals here (I9): a new refusal phrase or a newly checkable language is a line in a node.
 *
 * Check kinds:
 *   non_empty    subject.text / subject.content has at least min_chars non-whitespace characters
 *   not_refusal  the reply says it cannot do the work (a phrase) AND carries no non-empty code block
 *   parses       subject.content parses as subject.syntax, for the languages the node lists (json, yaml)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'nexus.lib.step-gate';
const VERSION = '1.0.0';
const RULES_DIR = path.join(__dirname, 'step-gates');

let _cache = null;
function _dirs() { return [RULES_DIR, process.env.STEP_GATES_DIR].filter(Boolean); }

/** rules() -> { [step]: { id, step, checks, on_block, file } } — read from the rule nodes, cached; reload() drops the cache */
function rules() {
  if (_cache) return _cache;
  const yaml = require('js-yaml');
  const out = {};
  for (const dir of _dirs()) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.step_gate')); } catch (_) { continue; }
    for (const f of files) {
      try {
        const node = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
        const p = node && node.payload;
        if (!p || !p.step || !Array.isArray(p.checks)) continue;
        out[p.step] = { id: node.id || p.step, step: p.step, checks: p.checks, on_block: p.on_block || 'drop', file: path.join(dir, f) };
      } catch (e) { console.warn(`[step-gate] ${f} unreadable (${e.message}) — that gate is not enforced`); }
    }
  }
  return (_cache = out);
}
function reload() { _cache = null; return rules(); }

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
function _hasCode(text) { for (const m of String(text || '').matchAll(FENCE)) if (m[1].trim()) return true; return false; }
function _body(subject) { return String(subject.content != null ? subject.content : subject.text != null ? subject.text : ''); }

const CHECKS = {
  non_empty(c, subject) {
    const n = _body(subject).trim().length;
    return n >= (c.min_chars || 1) ? null : `empty — ${n} non-blank character(s), at least ${c.min_chars || 1} required`;
  },
  not_refusal(c, subject) {
    const text = String(subject.text || '');
    if (_hasCode(text)) return null;
    const low = text.toLowerCase();
    const hit = (c.phrases || []).find(p => low.includes(String(p).toLowerCase()));
    return hit ? `refusal — the reply says "${hit}" and carries no code` : null;
  },
  parses(c, subject) {
    const syn = String(subject.syntax || path.extname(subject.path || '').slice(1) || '').toLowerCase();
    if (!(c.languages || []).map(String).includes(syn)) return null;
    try {
      if (syn === 'json') JSON.parse(_body(subject));
      else if (syn === 'yaml' || syn === 'yml') require('js-yaml').load(_body(subject));
      return null;
    } catch (e) { return `does not parse as ${syn}: ${String(e.message).split('\n')[0].slice(0, 160)}`; }
  },
};

/** check(step, subject) -> { ok, step, gate, reasons:[{check, reason}] } — no events; a step with no rule node passes, and says so */
function check(step, subject = {}) {
  const r = rules()[step];
  if (!r) return { ok: true, step, gate: null, reasons: [], ungated: true };
  const reasons = [];
  for (const c of r.checks) {
    const fn = CHECKS[c.kind];
    if (!fn) { reasons.push({ check: c.id || c.kind, reason: `unknown check kind '${c.kind}' in ${path.basename(r.file)}` }); continue; }
    const why = fn(c, subject);
    if (why) reasons.push({ check: c.id || c.kind, reason: why });
  }
  return { ok: reasons.length === 0, step, gate: r.id, onBlock: r.on_block, reasons };
}

function _bus() { try { return require('../nexus/nexus-bus.js'); } catch (_) { return null; } }

/**
 * gate(step, subject, { causedBy, source }) -> check() result + { eventId, event }
 * Emits step.passed / step.blocked on nexus-bus with the step, the subject's path, the reasons and causedBy.
 */
function gate(step, subject = {}, { causedBy = null, source = null } = {}) {
  const r = check(step, subject);
  const eventId = crypto.randomUUID();
  const event = r.ok ? 'step.passed' : 'step.blocked';
  const payload = { eventId, step, gate: r.gate, path: subject.path || null, reasons: r.reasons, causedBy, source, ts: Date.now() };
  const bus = _bus();
  try { if (bus && typeof bus.emit === 'function') bus.emit(event, payload, { source: source || MODULE_ID, causedBy }); } catch (_) { /* a bus hiccup never unblocks or blocks a step */ }
  if (!r.ok) console.warn(`[step-gate] ${step}${subject.path ? ` ${subject.path}` : ''} BLOCKED — ${r.reasons.map(x => x.reason).join('; ')}`);
  return { ...r, eventId, event };
}

module.exports = { MODULE_ID, VERSION, RULES_DIR, rules, reload, check, gate, CHECKS };
