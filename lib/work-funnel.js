'use strict';
/**
 * lib/work-funnel.js — FN0: everything an agent does is answered in order — its dependencies, its spec, its phase, then its
 * chunks — before it writes. Deterministic: no model.
 * comp_id: nexus.lib.work-funnel
 * Map: docs/2026-10-16-agent-work-funnel-phasemap.spec (FN0_the_funnel_as_data)
 *
 * James, 2026-10-16: "Every thing the agents do. Needs to determine dependancies, spec, phase, then chunk." · "pickest the
 * highest leverage, structural change. axioms in the docs are law" (§3.3 map before build, made what every agent does).
 *
 * Reuse, not a second mapper (§8.6): the request is read the way a phase is (lib/phase-map-auto.js mapPhase over the repo's
 * tree: named paths, defined names, module names → files, one hop of requires and consumers, owning specs); the phase is the
 * open phase whose mapped files overlap most (phase-map-auto forMaps over the repo's maps); the chunks are that phase's plan
 * (lib/phase-plan.js derivePlan, the plan Nexus writes with no model). The unit is the `chunk` (his decision, 2026-10-16).
 *
 * funnel({ request, intent?, root, maps, specsOf?, env? }) → {
 *   intent, enters,                 enters = a request that changes something (change · build · debug · spec); explain does not
 *   dependencies: { files: [{ path, why, exists }], requires, consumers, source }
 *   spec:         { specs: [{ path, from }], source }          from: owning system | the phases that map these files
 *   phase:        { key, map, id, status, overlap: [path], score, others: [...], source }
 *   chunks:       [{ kind: 'build', file, index, exports }], plan
 *   stoppedAt: null | 'dependencies' | 'spec' | 'phase' | 'chunks',  missing: [{ step, why }]
 * }
 * A step with no answer stops the funnel there and says why. The later steps are not guessed (his order is the order).
 */
const path = require('path');

const VERSION = '1.0.0';
const ENTERS = new Set(['change', 'build', 'debug', 'spec']);
const CLOSED = /^\s*["']?(done|built|complete|completed|decided|superseded|folded)\b/i;
const LIMITS = Object.freeze({ others: 4 });
// words that name a file somewhere but are not what a request is about
const STOP = new Set(['about','after','agent','agents','build','change','check','could','every','files','first','index','make','needs','other','phase','phases','should','spec','specs','their','there','these','thing','things','where','which','while','would','write','tests','config','server','utils','helper','helpers','value','values','state','index','types','model','models','start','update','create','delete','error','errors','fix']);

let _env = null;   // { root, at, env } — the tree scan is reused for a minute, as phase-map-auto does
function envFor(root, specsOf, now = Date.now()) {
  if (_env && _env.root === root && now - _env.at < 60000) return _env.env;
  const env = require('./phase-map-auto.js').envFromTree(root, { specsOf });
  _env = { root, at: now, env };
  return env;
}

function isOpen(status) { return !CLOSED.test(String(status || '')); }

function funnel({ request = '', intent = null, root, maps = [], specsOf = null, env = null } = {}) {
  const text = String(request || '').trim();
  const it = intent || require('./context-prereqs.js').intentOf(text);
  const out = { version: VERSION, intent: it, enters: ENTERS.has(it), dependencies: null, spec: null, phase: null, chunks: [], plan: null, stoppedAt: null, missing: [] };
  if (!out.enters) return out;
  if (!text) return stop(out, 'dependencies', 'the request is empty');
  const AM = require('./phase-map-auto.js'), PF = require('./phase-files.js');
  const e = env || envFor(root, specsOf);

  // 1 — dependencies: what the request touches, read like a phase's body. A request is short, so a plain word that is a
  // module's name counts too ("the officiator"), only when one or two files carry it (phase bodies skip these: MP1 noise)
  const plain = [];
  if (e.filesNamed) for (const w of new Set((text.match(/\b[a-z][a-z0-9_]{4,}\b/gi) || []).map(x => x.toLowerCase()))) {
    if (STOP.has(w)) continue;
    const where = e.filesNamed(w) || [];
    if (where.length && where.length <= 2) for (const f of where) plain.push({ f, w });
  }
  const body = plain.length ? `${text}\n${plain.map(x => x.f).join('\n')}` : text;
  const m = AM.mapPhase({ id: 'request', map: null, body, files: [] }, e);
  for (const f of m.files) { const hit = plain.find(x => x.f === f.path); if (hit && /named in the phase/.test(f.why)) f.why = `names the module ${hit.w}`; }
  out.dependencies = { files: m.files, requires: m.requires, consumers: m.consumers, source: m.source };
  const real = m.files.filter(f => f.exists).map(f => f.path);
  if (!m.files.length) return stop(out, 'dependencies', 'the request names no file, defined name or module that exists in this tree — name what it is about');

  // the repo's phases, mapped (the spec and phase steps read them)
  const phases = []; for (const mp of maps) for (const p of PF.phasesOf(mp.text, mp.path)) phases.push(p);
  const mapped = phases.length ? AM.mapPhases(phases, e) : [];
  const byKey = new Map(phases.map((p, i) => [`${p.map}::${p.id}`, { p, m: mapped[i] }]));
  const touching = [...byKey.values()].filter(x => x.m && x.m.files.some(f => real.includes(f.path)));

  // 2 — spec: the specs that own these files (their system), then the specs of the phases that map them
  const specs = [];
  const addSpec = (s, from) => { if (s && !specs.some(x => x.path === s)) specs.push({ path: s, from }); };
  for (const s of m.specs) addSpec(s, 'owning system');
  for (const x of touching) for (const s of x.m.specs || []) addSpec(s, `phase ${x.p.id} (${path.basename(x.p.map)})`);
  out.spec = { specs, source: specs.length ? (m.specs.length ? 'owning system' : 'phases that map these files') : 'none' };
  if (!specs.length) return stop(out, 'spec', `no spec owns ${real.slice(0, 3).join(', ') || 'these files'} — the spec comes first (FN2: the spec framework drafts it)`);

  // 3 — phase: the open phase whose mapped files overlap the request's most (its specs break ties)
  const specSet = new Set(specs.map(s => s.path));
  const scored = touching.filter(x => isOpen(x.p.status)).map(x => {
    const overlap = x.m.files.map(f => f.path).filter(p => real.includes(p));
    const specHits = (x.m.specs || []).filter(s => specSet.has(s)).length;
    return { x, overlap, score: overlap.length * 10 + specHits };
  }).sort((a, b) => b.score - a.score || String(a.x.p.map).localeCompare(String(b.x.p.map)));
  if (!scored.length) {
    const closed = touching.filter(x => !isOpen(x.p.status)).map(x => x.p.id);
    return stop(out, 'phase', `no open phase maps ${real.slice(0, 3).join(', ')}${closed.length ? ` (only finished ones: ${closed.slice(0, 4).join(', ')})` : ''} — a phase is mapped first (FN2, on his yes)`);
  }
  const best = scored[0];
  out.phase = { key: `${best.x.p.map}::${best.x.p.id}`, map: best.x.p.map, id: best.x.p.id, status: best.x.p.status || null, overlap: best.overlap, score: best.score,
    others: scored.slice(1, 1 + LIMITS.others).map(s => ({ key: `${s.x.p.map}::${s.x.p.id}`, overlap: s.overlap })), source: 'mapped' };

  // 4 — chunks: the phase's plan, written by Nexus with no model; one build chunk per planned file
  const PP = require('./phase-plan.js');
  const planFiles = best.x.m.files.filter(f => f.why === 'declared' || f.exists).map(f => f.path);
  const fs = require('fs');
  const dv = PP.derivePlan({ phaseKey: best.x.p.id, body: best.x.p.body, files: planFiles, registry: [],
    codeOf: (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return null; } } });
  if (!dv.ok || !dv.plan) return stop(out, 'chunks', `the phase could not be planned without a model: ${(dv.problems || []).slice(0, 2).join('; ')}`);
  out.plan = { files: dv.plan.files.length, order: dv.plan.order, warnings: dv.warnings || [] };
  out.chunks = dv.plan.order.map((f, i) => { const pf = dv.plan.files.find(x => x.path === f) || {}; return { kind: 'build', file: f, index: i + 1, exports: (pf.exports || []).map(x => x.name) }; });
  return out;
}

function stop(out, step, why) { out.stoppedAt = step; out.missing.push({ step, why }); return out; }

/** lines(f) — the four answers as plain lines (the command, an agent, the Agent tab) */
function lines(f) {
  if (!f.enters) return [`intent ${f.intent}: answered directly, not funnelled`];
  const L = [`intent ${f.intent}`];
  if (f.dependencies) L.push(`1 dependencies (${f.dependencies.source}): ${f.dependencies.files.map(x => `${x.path}${x.exists ? '' : ' (new)'}`).join(', ') || 'none'}${f.dependencies.requires.length ? ` · requires ${f.dependencies.requires.map(r => r.path).join(', ')}` : ''}${f.dependencies.consumers.length ? ` · used by ${f.dependencies.consumers.map(c => c.path).join(', ')}` : ''}`);
  if (f.spec) L.push(`2 spec (${f.spec.source}): ${f.spec.specs.map(s => s.path).join(', ') || 'none'}`);
  if (f.phase) L.push(`3 phase: ${f.phase.key} (${f.phase.status || 'no status'}) — overlaps ${f.phase.overlap.join(', ')}${f.phase.others.length ? ` · also ${f.phase.others.map(o => o.key).join(', ')}` : ''}`);
  if (f.chunks.length) L.push(`4 chunks: ${f.chunks.map(c => `${c.index}. ${c.file}`).join(' · ')}`);
  for (const x of f.missing) L.push(`stopped at ${x.step}: ${x.why}`);
  return L;
}

module.exports = { VERSION, ENTERS, funnel, lines, isOpen };
