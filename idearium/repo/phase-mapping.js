/**
 * idearium/repo/phase-mapping.js — 0.60.29 PM — map every phase of a repo (Nexus, or any project) to its files and
 * dependencies.
 *
 * James (2026-10-13): "All the phases need to be mapped to files and dependencies. With nexus and all projects."
 *
 * The job, over the repo's phasemaps (phases.js mapsFor — the same maps the Phases tab shows):
 *   1. score   the agent the door picks maps phases whose files ARE known, their files: hidden (lib/phase-files.js
 *              _withoutFiles), and is scored: precision, recall. Its answers are written only when its precision reaches
 *              min_precision on at least min_scored phases — otherwise they are kept as proposals, and the report says why.
 *   2. map     open phases with no files:, a few per request; each answer checked by code (parseAnswer)
 *   3. deps    within each map, a phase depends on the nearest earlier phase changing a file it changes (depsFor)
 *   4. apply   files: and depends_on added to the phase block where missing (applyTo), every changed map in one write,
 *              refused for a map that parsed before and would not after
 * Proposals are kept (state, <dataDir>/phase-mapping/<repo>.json), so a run resumes and a re-run sends nothing twice.
 * Injected: ask(prompt) → { ok, text, by }, write(changes, reason) → { ok, error }, exists(p), dirExists(p).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PF = require('../../lib/phase-files.js');

export const DEFAULTS = Object.freeze({ batch: 4, scoreN: 8, minScored: 5, minPrecision: 0.8, includeDone: false, maxFailures: 3, limit: 0 });

function _load(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return { proposals: {}, scored: null }; } }
function _save(file, st) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(st, null, 2)); } catch (_) {} }
const _key = (p) => `${p.map}::${p.id}`;

/** spread a pick over the list, so the scored phases come from many maps, not the first one */
function _spread(list, n) { if (list.length <= n) return list; const step = list.length / n; return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]); }

export async function runMapping({ repoName = 'the repo', maps = [], stateFile, ask, write, exists, dirExists, folders = [], opts = {}, onProgress = () => {} } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const st = _load(stateFile);
  const report = { at: Date.now(), maps: maps.length, phases: 0, open: 0, named: 0, targets: 0, mapped: 0, empty: 0, failed: 0, scored: null, trusted: false,
    applied: { maps: 0, files: 0, deps: 0 }, skipped: [], refused: [], problems: [], by: new Set() };
  const all = [];
  for (const m of maps) for (const p of PF.phasesOf(m.text, m.path)) all.push(p);
  report.phases = all.length;
  report.open = all.filter(p => p.status !== 'done').length;
  report.named = all.filter(p => p.hasFiles).length;
  const opener = (b) => ({ ...b, candidates: PF.candidates(b.body, { exists, dirExists }) });
  const asked = async (batch) => {
    const r = await ask(PF.brief(batch.map(opener), { repoName, folders }));
    if (!r || !r.ok) return { error: (r && r.error) || 'no answer' };
    if (r.by) report.by.add(r.by);
    return { answer: PF.parseAnswer(r.text, batch, { exists, dirExists }), by: r.by || null };
  };

  // 1. score the agent on phases whose files are known
  const known = _spread(all.filter(p => p.files.length && p.files.every(f => exists(f) || dirExists(f.split('/').slice(0, -1).join('/')))), o.scoreN);
  const scores = [];
  for (let i = 0; i < known.length; i += o.batch) {
    const batch = known.slice(i, i + o.batch);
    onProgress({ step: 'score', done: i, of: known.length });
    const r = await asked(batch);
    if (r.error) { report.problems.push(`scoring: ${r.error}`); break; }
    for (const p of batch) scores.push({ id: p.id, ...PF.score(r.answer[p.id].files.map(f => f.path), p.files) });
  }
  const ev = PF.evaluate(scores);
  report.scored = { ...ev, precision: Math.round(ev.precision * 100) / 100, recall: Math.round(ev.recall * 100) / 100, phases: scores };
  report.trusted = ev.n >= o.minScored && ev.precision >= o.minPrecision;
  st.scored = { ...report.scored, at: Date.now(), by: [...report.by] };

  // 2. map the phases that name no files
  const open = all.filter(p => !p.hasFiles && (o.includeDone || p.status !== 'done'));
  // a phase written on one line ({ … }) cannot take a key in place: not sent, counted, said
  const targets = open.filter(p => !p.inline);
  report.targets = targets.length;
  report.oneLine = open.length - targets.length;
  if (report.oneLine) report.skipped.push(`${report.oneLine} phase${report.oneLine === 1 ? '' : 's'} written on one line ({ … }) — not mapped in place: ${open.filter(p => p.inline).slice(0, 8).map(p => p.id).join(', ')}`);
  const todo = targets.filter(p => !st.proposals[_key(p)]).slice(0, o.limit > 0 ? o.limit : undefined);
  let failures = 0;
  for (let i = 0; i < todo.length; i += o.batch) {
    const batch = todo.slice(i, i + o.batch);
    onProgress({ step: 'map', done: i, of: todo.length });
    const r = await asked(batch);
    if (r.error) { report.failed += batch.length; report.problems.push(`mapping: ${r.error}`); if (++failures >= o.maxFailures) { report.problems.push(`stopped after ${failures} requests in a row with no answer — run it again to resume`); break; } continue; }
    failures = 0;
    for (const p of batch) {
      const a = r.answer[p.id];
      st.proposals[_key(p)] = { files: a.files, problems: a.problems, by: r.by, at: Date.now() };
    }
    _save(stateFile, st);
  }
  for (const p of targets) { const pr = st.proposals[_key(p)]; if (!pr) continue; if (pr.files.length) report.mapped++; else report.empty++; }

  // 3 + 4. dependencies from the files, then the edits
  const byMap = new Map();
  for (const p of all) { if (!byMap.has(p.map)) byMap.set(p.map, []); byMap.get(p.map).push(p); }
  // the hub files across the repo (named + trusted proposals): sharing one is not a dependency
  const filesNow = (p) => { const pr = st.proposals[_key(p)]; return p.files.length ? p.files : pr && (report.trusted || o.applyUntrusted === true) ? pr.files.map(f => f.path) : []; };
  const hubs = PF.hubsOf(all.map(p => ({ files: filesNow(p) })));
  report.hubs = [...hubs];
  const changes = [];
  const proposalsTrusted = report.trusted || o.applyUntrusted === true;
  // §0.60.227 SL3 — two of the three cycles in Nexus's maps were written here (0.60.29): an edge inferred from a shared file pointed back
  // at a phase whose authored depends_on already named this one. An inferred edge that would close a cycle is now skipped and said.
  let dag = null; try { dag = require('../../lib/phase-dag.js').build(maps); } catch (_) { dag = null; }
  const PDg = require('../../lib/phase-dag.js');
  const cycleFree = (map, id, ds) => (ds || []).filter(x => {
    const ok = !(dag && PDg.reaches(dag, `${map}::${id}`, `${map}::${x.on}`));
    if (!ok) report.skipped.push(`${id} → ${x.on} not written: ${id} is already upstream of ${x.on} (it would close a cycle)`);
    return ok;
  });
  for (const m of maps) {
    const ps = byMap.get(m.path) || [];
    const withFiles = ps.map(p => { const pr = st.proposals[_key(p)]; return { ...p, files: p.files.length ? p.files : pr && proposalsTrusted ? pr.files.map(f => f.path) : [] }; });
    const deps = PF.depsFor(withFiles, { hubs });
    let text = m.text, nf = 0, nd = 0;
    for (const p of [...withFiles].sort((a, b) => b.line - a.line)) {
      const pr = st.proposals[_key(p)];
      const files = !p.hasFiles && pr && proposalsTrusted && pr.files.length ? pr.files.map(f => f.path) : null;
      const d0 = !p.hasDeps && (o.includeDone || p.status !== 'done') ? cycleFree(m.path, p.id, deps[p.id]) : null;
      const d = d0 && d0.length ? d0 : null;
      if (!files && !d) continue;
      const r = PF.applyTo(text, p, { files, deps: d, note: files ? `mapped by ${pr.by || 'an agent'}, ${report.scored.precision} precision on ${report.scored.n} known phases` : '' });
      if (r.error) { report.skipped.push(r.error); continue; }
      text = r.text; if (files) nf++; if (d) nd++;
    }
    if (text === m.text) continue;
    const before = PF.phasesOf(m.text, m.path).length, after = PF.phasesOf(text, m.path).length;
    let yamlBefore = true, yamlAfter = true;
    try { const y = require('js-yaml'); try { y.load(m.text); } catch (_) { yamlBefore = false; } try { y.load(text); } catch (_) { yamlAfter = false; } } catch (_) {}
    if (before !== after || (yamlBefore && !yamlAfter)) { report.refused.push(`${m.path}: the edit would ${before !== after ? `change its phase count (${before} → ${after})` : 'stop it parsing'} — not written`); continue; }
    changes.push({ path: m.path, content: text, files: nf, deps: nd });
  }
  if (o.apply && changes.length) {
    const w = await write(changes.map(c => ({ path: c.path, content: c.content })), `phases mapped to files and dependencies (${changes.length} map${changes.length === 1 ? '' : 's'})`);
    if (!w || !w.ok) report.problems.push(`not written: ${(w && w.error) || 'the write failed'}`);
    else report.applied = { maps: changes.length, files: changes.reduce((a, c) => a + c.files, 0), deps: changes.reduce((a, c) => a + c.deps, 0), via: w.via || null };
  }
  report.pending = { maps: changes.length, files: changes.reduce((a, c) => a + c.files, 0), deps: changes.reduce((a, c) => a + c.deps, 0) };
  report.untrustedProposals = report.trusted ? 0 : report.mapped;
  report.by = [...report.by];
  report.line = line(report, o);
  st.report = { ...report, scored: { ...report.scored, phases: undefined } };
  _save(stateFile, st);
  return report;
}

export function line(r, o = DEFAULTS) {
  const s = r.scored && r.scored.n ? `scored on ${r.scored.n} phases with known files: precision ${r.scored.precision}, recall ${r.scored.recall}${r.trusted ? '' : ` — below ${o.minPrecision} (or under ${o.minScored} scored), so its files are kept as proposals, not written`}` : 'not scored (no phases with known files, or no answer)';
  return `${r.targets} open phase${r.targets === 1 ? '' : 's'} named no files: ${r.mapped} mapped, ${r.empty} with none it could name${r.failed ? `, ${r.failed} unanswered` : ''} · ${s} · ${r.applied.maps ? `written: ${r.applied.files} files: and ${r.applied.deps} depends_on in ${r.applied.maps} map(s)` : `ready to write: ${r.pending ? `${r.pending.files} files: and ${r.pending.deps} depends_on in ${r.pending.maps} map(s)` : 'nothing'}`}`;
}

// ── §0.60.228 SL8 — James, 2026-10-23: "agent needs to map dependancies if nexus cant map one." ─────────────────────────────────────
// mapOne: ONE phase that MP1 could not place (no declared files, nothing in its words), asked of the repo's agent at build time with this
// module's own brief and answer checker. Everything the agent says is checked by code before it is used: a file inside the repo that
// exists, or a new one in a folder that exists (PF.parseAnswer); a depends_on that resolves to a phase (resolveDep) and closes no cycle
// (wouldCycle). Kept per phase and per hash of its text, so a second build asks nothing and a changed phase is asked again. Nothing is
// written into the map (a proposal; SL3's groom writes on his say). Every file and edge names agent:<by> (NC0).
import crypto from 'crypto';
const _h = (s) => crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);

/** a JSON file of kept mappings: { get(key), set(key, mapping), all() } */
export function fileStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; } };
  return {
    get: (k) => read()[k] || null,
    set: (k, v) => { const all = read(); all[k] = v; try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all, null, 2)); } catch (_) {} },
    all: () => read(),
  };
}

export async function mapOne({ phase, ask, exists = () => false, dirExists = () => false, resolveDep = () => null, wouldCycle = () => false, store = null, repoName = 'the repo', folders = [], depChoices = [] } = {}) {
  if (!phase || !phase.id) return { ok: false, asked: false, why: 'no phase' };
  const key = `${phase.map}::${phase.id}`, bodyHash = _h(phase.body);
  const kept = store ? store.get(key) : null;
  if (kept && kept.bodyHash === bodyHash && (kept.files || []).length) return { ok: true, mapping: kept, asked: false, why: `kept from ${kept.by}'s earlier answer (the phase's text is unchanged)` };
  if (typeof ask !== 'function') return { ok: false, asked: false, why: 'no agent to ask' };
  const b = { ...phase, candidates: PF.candidates(phase.body, { exists, dirExists }) };
  let r;
  try { r = await ask(PF.brief([b], { repoName, folders, deps: depChoices })); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok) return { ok: false, asked: true, why: `the agent did not answer: ${(r && r.error) || 'no answer'}` };
  const by = `agent:${r.by || 'unknown'}`;
  const a = PF.parseAnswer(r.text, [b], { exists, dirExists })[phase.id];
  const refused = a.problems.map(why => ({ what: 'answer', why }));
  const dependsOn = [];
  for (const d of a.dependsOn || []) {
    const k = resolveDep(d);
    if (!k) { refused.push({ what: d, why: 'names no phase in any map' }); continue; }
    if (k === key) { refused.push({ what: d, why: 'the phase itself' }); continue; }
    if (wouldCycle(k)) { refused.push({ what: d, why: `${phase.id} is already upstream of it (a cycle)` }); continue; }
    if (!dependsOn.includes(k)) dependsOn.push(k);
  }
  const mapping = { key, files: a.files.map(f => ({ path: f.path, exists: !f.new, why: `${by}${f.new ? ' (a new file)' : ''}` })), dependsOn, refused, by, bodyHash, at: Date.now(),
    answer: String(r.text || '').slice(0, 600) };
  if (!mapping.files.length) return { ok: false, asked: true, mapping, why: `${by} named no file that passed the checks${refused.length ? `: ${refused.map(x => `${x.what} — ${x.why}`).slice(0, 4).join('; ')}` : ''}` };
  if (store) store.set(key, mapping);
  return { ok: true, mapping, asked: true, why: `mapped by ${by}: ${mapping.files.map(f => f.path).join(', ')}` };
}

/** mapped(mapping, { phase, env }) — the mapping as DG2 reads one (lib/phase-graph.js graphFor), source 'agent'; with an env, MP1 adds what
 *  the existing files require and who requires them (the same one hop as a declared phase) */
export function mapped(m, { phase = null, env = null } = {}) {
  let base = { files: m.files, requires: [], consumers: [], specs: [] };
  if (phase && env) {
    try {
      const AM = require('../../lib/phase-map-auto.js');
      const r = AM.mapPhase({ ...phase, files: m.files.map(f => f.path), body: `${phase.body || ''}\n    files: [${m.files.map(f => f.path).join(', ')}]` }, env);
      base = { ...r, files: m.files };
    } catch (_) {}
  }
  return { ...base, source: 'agent', by: m.by, dependsOnInferred: (m.dependsOn || []).map(k => ({ on: String(k).split('::').pop(), key: k, by: m.by })) };
}
