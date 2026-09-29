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
 *   parses       subject.content parses as subject.syntax, for the languages the node lists: json, yaml, and js/mjs/cjs
 *                (Node's own --check on a copy: .mjs when the code has import/export, else .cjs — a plain .js with ESM
 *                syntax AND an error passes `node --check` under Node 22's module detection, so it is never checked
 *                as .js). TypeScript is not checked: Node's type stripping both passes broken TS and fails valid enums.
 *
 * A block is also a GAP (lib/gap-field.js report, type step.blocked.<step>.<check>) unless the rule node says
 * report_gap: false — the existing road into self-heal's failure modes, one open gap per step+check, repeats bumped.
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
        out[p.step] = { id: node.id || p.step, step: p.step, checks: p.checks, on_block: p.on_block || 'drop', report_gap: p.report_gap !== false, file: path.join(dir, f) };
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
    let syn = String(subject.syntax || path.extname(subject.path || '').slice(1) || '').toLowerCase();
    if (syn === 'javascript' || syn === 'node') syn = 'js';
    if (!(c.languages || []).map(String).includes(syn)) return null;
    try {
      if (syn === 'json') JSON.parse(_body(subject));
      else if (syn === 'yaml' || syn === 'yml') require('js-yaml').load(_body(subject));
      else if (syn === 'js' || syn === 'mjs' || syn === 'cjs') { const why = _nodeCheck(_body(subject), syn); if (why) return `does not parse as ${syn}: ${why}`; }
      return null;
    } catch (e) { return `does not parse as ${syn}: ${String(e.message).split('\n')[0].slice(0, 160)}`; }
  },
};

// node --check on a temp copy; null = parses, a string = the first line of the syntax error
function _nodeCheck(code, syn) {
  const os = require('os');
  const esm = syn === 'mjs' || (syn === 'js' && /^\s*(import\s*[\w{*'"]|export\s)/m.test(code));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'step-gate-'));
  const file = path.join(dir, `check.${esm ? 'mjs' : 'cjs'}`);
  try {
    fs.writeFileSync(file, code);
    const r = require('child_process').spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    if (r.error) return null;   // could not run the check: not evidence the code is broken
    if (r.status === 0) return null;
    const lines = String(r.stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
    return (lines.find(l => /Error/.test(l)) || lines[0] || `exit ${r.status}`).slice(0, 160);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

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
  if (!r.ok) {
    console.warn(`[step-gate] ${step}${subject.path ? ` ${subject.path}` : ''} BLOCKED — ${r.reasons.map(x => x.reason).join('; ')}`);
    const rule = rules()[step];
    if (rule && rule.report_gap) {
      try {
        const g = require('./gap-field.js').report({
          type: `step.blocked.${step}.${r.reasons[0].check}`, source: MODULE_ID, domain: 'build', severity: 'medium', component: step,
          location: subject.path || null, body: r.reasons.map(x => x.reason).join('; '),
          meta: { eventId, causedBy, gate: r.gate, source, path: subject.path || null },
        });
        r.gapId = g && g.gap ? (g.gap.id || g.gap.uuid || null) : null;
      } catch (_) { /* the gap field unavailable: the block itself still holds and the event still went out */ }
    }
  }
  return { ...r, eventId, event };
}

module.exports = { MODULE_ID, VERSION, RULES_DIR, rules, reload, check, gate, CHECKS };
