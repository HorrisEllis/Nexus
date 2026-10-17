'use strict';
/**
 * lib/phase-deps-gate.js — 0.60.125 DG1 — a phase is not built while what it depends on is still open.
 *
 * James (2026-10-17), asked "Should a phase build be refused while its depends_on are still open (an open decision or an
 * unfinished phase)?", chose "Refuse, say why (Recommended)".
 *
 * Why: PC1_the_point_first (docs/2026-10-17-pieces-not-order-phasemap.spec) depends on PC0a/PC0b/PC0c, three decisions
 * that are his and still OPEN. ▶ build did not look: five agents spent twelve attempts on it and left a file that
 * requires a module that is not there (lib/phase-manifest.js, contract-incomplete).
 *
 *   openDeps({ phase, mapText, phases }) → { open: [{ key, kind, status, asked?, title? }], unknown: [key], checked }
 *     phase    the phase key
 *     mapText  its phasemap's text (YAML)
 *     phases   the manager view's phases ({ phase_key, status }) — a phase's own status there is the truth
 *   open      a decision in the map's decisions: not yet decided; a phase not complete
 *   unknown   a key found nowhere: said, not blocking (the gate refuses on evidence, never on a name it cannot place)
 *   checked   false when the map could not be read: then nothing is refused, and the reason is given
 * Pure.
 */
const VERSION = '1.0.0';

const _list = (v) => Array.isArray(v) ? v.map(String) : v == null ? [] : String(v).split(/[\s,]+/);
const _keyOf = (d) => String(d).trim().split(/\s+/).pop();
const _decided = (d) => !!(d && (d.chosen || d.decided || /^(DECIDED|DONE|CLOSED|ANSWERED|CHOSEN)\b/i.test(String(d.status || ''))));
const _done = (s) => /^(complete|done)\b/i.test(String(s || ''));

function openDeps({ phase, mapText = '', phases = [] } = {}) {
  let doc = null;
  try { doc = require('js-yaml').load(mapText); } catch (e) { return { open: [], unknown: [], checked: false, why: `the map did not read as YAML: ${e.message.split('\n')[0]}` }; }
  const own = doc && doc.phases && doc.phases[phase];
  if (!own) return { open: [], unknown: [], checked: false, why: `${phase} is not under phases: in its map` };
  const decisions = (doc && doc.decisions) || {};
  const byKey = new Map((phases || []).map(p => [p.phase_key, p]));
  const open = [], unknown = [];
  for (const raw of _list(own.depends_on).filter(Boolean)) {
    const key = _keyOf(raw);
    if (decisions[key]) {
      if (!_decided(decisions[key])) open.push({ key, kind: 'decision', status: String(decisions[key].status || 'OPEN'), asked: decisions[key].asked || null });
      continue;
    }
    const p = byKey.get(key);
    const y = doc.phases[key];
    if (p || y) {
      const st = p ? p.status : y.status;
      if (!_done(st) && !_done(y && y.status)) open.push({ key, kind: 'phase', status: String(st || 'open'), title: (p && p.title) || (y && (y.title || y.name)) || null });
      continue;
    }
    unknown.push(key);
  }
  return { open, unknown, checked: true };
}

/** line(gate) — the sentence a refusal says */
function line(g, phase) {
  if (!g.open.length) return `${phase}: everything it depends on is done`;
  return `${phase} waits on ${g.open.map(o => o.kind === 'decision' ? `${o.key} (a decision still ${o.status}${o.asked ? `: "${o.asked}"` : ''})` : `${o.key} (${o.status})`).join('; ')}`;
}

module.exports = { VERSION, openDeps, line };
