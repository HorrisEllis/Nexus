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
const VERSION = '1.1.0';

const _list = (v) => Array.isArray(v) ? v.map(String) : v == null ? [] : require('./phase-dag.js').items(String(v));
const _decided = (d) => !!(d && (d.chosen || d.decided || /^(DECIDED|DONE|CLOSED|ANSWERED|CHOSEN)\b/i.test(String(d.status || ''))));
const _done = (s) => /^(complete|done)\b/i.test(String(s || ''));

// §0.60.227 SL3 — measured on Nexus's maps: this gate read a phase only under a top-level `phases:` key of a map that parses as strict
// YAML, so 1073 of 1176 open phases were never checked (797 sit under spec:/phases_added_…/other sections, 276 are in maps loom reads but
// js-yaml does not) and were built with their depends_on still open. The YAML read is kept where it finds the phase (it carries a
// decision's `asked:`); everywhere else the phase is read the way the DAG reads it (loom's parser), so every phase is checked.
function _yamlView(mapText, phase) {
  let doc = null;
  try { doc = require('js-yaml').load(mapText); } catch (e) { return { why: `the map did not read as YAML: ${e.message.split('\n')[0]}` }; }
  const sections = doc && typeof doc === 'object' ? [doc, doc.spec].filter(x => x && typeof x === 'object') : [];
  let own = null; for (const sec of sections) if (sec.phases && sec.phases[phase]) { own = sec.phases[phase]; break; }
  if (!own) return { why: `${phase} is not under phases: in its map` };
  const decisions = Object.assign({}, ...sections.map(x => x.decisions || {}), ...sections.map(x => x.open_decisions || {}));
  const local = Object.assign({}, ...sections.map(x => x.phases || {}));
  return { depends: _list(own.depends_on), decisions, local };
}
function _loomView(mapText, phase) {
  const PD = require('./phase-dag.js');
  const parsed = PD.parsePhasemap(mapText, 'map');   // loom's reader through the DAG: no lib → loom crossing of its own
  const own = parsed.find(p => p.id === phase && p.kind !== 'decision');
  if (!own) return null;
  const lines = String(mapText).split('\n');
  const decisions = {};
  for (const d of PD.decisionsOf(mapText)) {
    const body = lines.slice(d.line - 1, d.line + 12).join('\n');
    const asked = (body.match(/^\s+asked:\s*["']?(.+?)["']?\s*$/m) || [])[1] || null;
    decisions[d.id] = { status: d.decided ? 'DECIDED' : ((body.match(/^\s+status:\s*["']?([^"'\n]+)/m) || [])[1] || 'OPEN').trim(), asked };
  }
  for (const p of parsed) if (p.kind === 'decision' && !decisions[p.id]) decisions[p.id] = { status: p.status === 'done' ? 'DECIDED' : 'OPEN', asked: null };
  const local = {}; for (const p of parsed) if (p.kind !== 'decision') local[p.id] = { status: p.status === 'done' ? 'DONE' : p.status, title: p.title };
  return { depends: _list(own.dependsOn), decisions, local };
}

function openDeps({ phase, mapText = '', phases = [] } = {}) {
  const PD = require('./phase-dag.js');
  const y = _yamlView(mapText, phase);
  const v = y.depends ? y : _loomView(mapText, phase);
  if (!v) return { open: [], unknown: [], checked: false, why: y.why };
  const { decisions, local } = v;
  const byKey = new Map((phases || []).map(p => [p.phase_key, p]));
  const open = [], unknown = [], prose = [];
  for (const raw of v.depends.filter(Boolean)) {
    const key = PD.refKey(raw, (t) => !!(decisions[t] || local[t] || byKey.has(t)));
    if (!key) { prose.push(String(raw)); continue; }
    if (decisions[key]) {
      if (!_decided(decisions[key])) open.push({ key, kind: 'decision', status: String(decisions[key].status || 'OPEN'), asked: decisions[key].asked || null });
      continue;
    }
    const p = byKey.get(key);
    const yp = local[key];
    if (p || yp) {
      const st = p ? p.status : yp.status;
      if (!_done(st) && !_done(yp && yp.status)) open.push({ key, kind: 'phase', status: String(st || 'open'), title: (p && p.title) || (yp && (yp.title || yp.name)) || null });
      continue;
    }
    unknown.push(key);
  }
  return { open, unknown, ...(prose.length ? { prose } : {}), checked: true, via: y.depends ? 'yaml' : 'loom' };
}

/** line(gate) — the sentence a refusal says */
function line(g, phase) {
  if (!g.open.length) return `${phase}: everything it depends on is done`;
  return `${phase} waits on ${g.open.map(o => o.kind === 'decision' ? `${o.key} (a decision still ${o.status}${o.asked ? `: "${o.asked}"` : ''})` : `${o.key} (${o.status})`).join('; ')}`;
}

module.exports = { VERSION, openDeps, line };
