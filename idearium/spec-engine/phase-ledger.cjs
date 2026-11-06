'use strict';
/**
 * idearium/spec-engine/phase-ledger.cjs — the phase ledger: every phase of every map, and every phase event (SL11, 0.60.419).
 * Map: docs/2026-10-23-self-building-loop-phasemap.spec SL11_the_phase_ledger_and_its_gate (SL_D11: phases expand, never written twice).
 *
 * James, 2026-11-03: "We need a fucking ledger too of phases, and we need, like, so they stop getting written, you know what I mean?" · "Like
 * they stop getting written and start getting, they expand." · 2026-11-06: "we also need to add a phase ledger, to idearium, then add to
 * claude.md to to always log in the ledger".
 *
 * Idearium's (beside phase-specs.cjs, his EAS_D10), reading the maps through lib's parsers as phase-specs does. Two halves:
 *   the table   rows({ root }) → every phase of docs/*-phasemap.spec: { id, map, status, done, files, deps, systems, last } — generated from
 *               the maps, never typed by hand; exactDuplicates(rows) → the same full id in more than one map (the uniqueness rule broken);
 *               duplicates(rows) → each short id (TB1, PF1…) reused across maps, for him to merge into one that expands
 *   the log     log({ root, phase, event, by, why, version }) → one line appended to idearium/phases/LEDGER.jsonl (committed: data/ is not,
 *               and the log has to outlive a session); history({ root, phase }) and recent({ root, limit }) read it back
 *   the gate    covers({ root, files, does, exclude }) → the phases that already cover this work (a shared file, or the same intent), best
 *               first — the phase to expand instead of writing a new one (SL_D11)
 * Events: written · expanded · built · closed · note. A phase that is not in any map cannot be logged (except 'written', which may be logged
 * the moment it is written). Nothing here edits a map.
 *
 * CLI: node idearium/spec-engine/phase-ledger.cjs <ledger [system] | dups | covers <file…> [--does "text"] | log <phase> <event> "<why>"
 *      [--by who] [--version x.y.z] | history <phase> | recent [n]>
 */
const fs = require('fs');
const path = require('path');

const ROOT_DEFAULT = path.resolve(__dirname, '..', '..');
const LEDGER_REL = 'idearium/phases/LEDGER.jsonl';
const EVENTS = Object.freeze(['written', 'expanded', 'built', 'closed', 'note']);
const DAG = (root) => require(path.join(root, 'lib', 'phase-dag.js'));
const PF = (root) => require(path.join(root, 'lib', 'phase-files.js'));

function maps(root) {
  const d = path.join(root, 'docs');
  return fs.readdirSync(d).filter(f => f.endsWith('-phasemap.spec')).sort().map(f => ({ path: `docs/${f}`, text: fs.readFileSync(path.join(d, f), 'utf8') }));
}
const shortId = (id) => String(id).split('_')[0];

function readLog(root) {
  let t = ''; try { t = fs.readFileSync(path.join(root, LEDGER_REL), 'utf8'); } catch (_) { return []; }
  const out = []; for (const l of t.split('\n')) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch (_) { /* a bad line is skipped, never fatal */ } }
  return out;
}

/** every phase of every map, one row each, with its last logged event */
function rows({ root = ROOT_DEFAULT, system = null } = {}) {
  const M = maps(root); const g = DAG(root).build(M);
  const last = new Map(); for (const e of readLog(root)) last.set(`${e.map || ''}::${e.phase}`, e), last.set(`::${e.phase}`, e);
  const all = Object.values(g.nodes).filter(n => !n.decision).map(n => ({
    id: n.id, map: n.map, status: String(n.status || '').slice(0, 160), done: !!n.done, files: n.files || [], deps: n.deps || [], systems: n.systems || [],
    last: last.get(`${n.map}::${n.id}`) || last.get(`::${n.id}`) || null,
  }));
  return system ? all.filter(r => r.map.includes(system) || r.systems.includes(system) || r.files.some(f => f.startsWith(`${system}/`))) : all;
}

/** the same full id written in more than one map: the rule "every phase id is unique across all maps" broken outright */
function exactDuplicates(rs) {
  const by = new Map(); for (const r of rs) { if (!by.has(r.id)) by.set(r.id, []); by.get(r.id).push(r); }
  return [...by.entries()].filter(([, v]) => new Set(v.map(r => r.map)).size > 1).map(([id, v]) => ({ id, maps: [...new Set(v.map(r => r.map))] })).sort((a, b) => a.id.localeCompare(b.id));
}
/** short ids written in more than one map (TB1 in two maps for two things): each group for him to merge into one that expands */
function duplicates(rs) {
  const by = new Map(); for (const r of rs) { const k = shortId(r.id); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  return [...by.entries()].filter(([, v]) => new Set(v.map(r => r.map)).size > 1).map(([id, v]) => ({ id, phases: v.map(r => ({ id: r.id, map: r.map, status: r.status })) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// the intent of a phase: its does:, as words (four letters or more, no stop words), the phase's own name removed
const STOP = new Set('that this with from what when then each into they them their there have will only also every which where while than were been being does done more most some such your over just like make made'.split(' '));
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)));
function _does(body) {
  const m = /^\s{4}does:\s*(>-?\s*)?([\s\S]*?)(?=^\s{4}[a-z_]+:|$(?![\s\S]))/m.exec(body || '');
  return m ? m[2].replace(/\s+/g, ' ').trim() : '';
}

/**
 * covers({ files, does, exclude }) → [{ id, map, status, sharedFiles, intent, why }] best first — the phases that already cover this work.
 * A shared declared file counts most; the same intent (Jaccard of does: words ≥ 0.35) counts too. exclude: an id not to report (the phase itself).
 */
function covers({ root = ROOT_DEFAULT, files = [], does = '', exclude = null, minIntent = 0.35, limit = 10 } = {}) {
  const want = new Set((files || []).map(f => String(f).replace(/\s*\(new\)\s*$/, '').trim()).filter(Boolean)); const w = words(does);
  const out = [];
  for (const m of maps(root)) for (const p of PF(root).phasesOf(m.text, m.path)) {
    if (exclude && (p.id === exclude || shortId(p.id) === shortId(exclude) && m.path === exclude.map)) continue;
    if (/^\s+chosen:/m.test(p.body)) continue;   // a decision, not a phase
    const pf = (p.files || []).map(f => String(f).replace(/\s*\(new\)\s*$/, '').trim());
    const shared = pf.filter(f => want.has(f));
    let intent = 0; if (w.size) { const d = words(_does(p.body)); let i = 0; for (const x of w) if (d.has(x)) i++; const u = new Set([...w, ...d]).size; intent = u ? i / u : 0; }
    if (!shared.length && intent < minIntent) continue;
    out.push({ id: p.id, map: m.path, status: String(p.status || '').slice(0, 120), sharedFiles: shared, intent: Math.round(intent * 100) / 100,
      why: [shared.length ? `shares ${shared.length} file(s): ${shared.slice(0, 3).join(', ')}` : null, intent >= minIntent ? `the same intent (${Math.round(intent * 100)}% of its words)` : null].filter(Boolean).join('; ') });
  }
  return out.sort((a, b) => (b.sharedFiles.length - a.sharedFiles.length) || (b.intent - a.intent)).slice(0, limit);
}

/** log({ phase, event, by, why, version, map }) → the entry appended, or { ok:false, error } */
function log({ root = ROOT_DEFAULT, phase, event, by = 'coder', why = '', version = null, map = null, at = new Date().toISOString() } = {}) {
  const ev = String(event || '');
  if (!EVENTS.includes(ev)) return { ok: false, error: `event is one of ${EVENTS.join(', ')} (not "${ev}")` };
  if (!phase || !/^[A-Za-z][\w-]*$/.test(String(phase))) return { ok: false, error: 'a phase id is needed (e.g. SL11_the_phase_ledger_and_its_gate)' };
  if (!String(why).trim()) return { ok: false, error: 'say why: a ledger line without a reason is noise' };
  const found = rows({ root }).filter(r => r.id === phase && (!map || r.map === map));
  if (!found.length && ev !== 'written') return { ok: false, error: `no phase ${phase}${map ? ` in ${map}` : ''} in any map: write it first (then log it as written)` };
  if (found.length > 1 && !map) return { ok: false, error: `${phase} is in ${found.length} maps (${found.map(r => r.map).join(', ')}): say which with map` };
  const entry = { at, phase: String(phase), map: map || (found[0] && found[0].map) || null, event: ev, by: String(by), why: String(why).trim(), ...(version ? { version: String(version) } : {}) };
  const f = path.join(root, LEDGER_REL); fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(entry) + '\n');
  return { ok: true, entry };
}

const history = ({ root = ROOT_DEFAULT, phase } = {}) => readLog(root).filter(e => e.phase === phase || shortId(e.phase) === phase);
const recent = ({ root = ROOT_DEFAULT, limit = 50 } = {}) => readLog(root).slice(-Math.max(1, Math.min(Number(limit) || 50, 5000))).reverse();

/** the whole ledger, as one answer: counts, the duplicates, the recent events */
function ledger({ root = ROOT_DEFAULT, system = null, limit = 50 } = {}) {
  const rs = rows({ root, system });
  const logged = new Set(readLog(root).map(e => `${e.map || ''}::${e.phase}`));   // by map and id: the same id in two maps is two phases
  return { ok: true, total: rs.length, done: rs.filter(r => r.done).length, open: rs.filter(r => !r.done).length, logged: rs.filter(r => logged.has(`${r.map}::${r.id}`) || logged.has(`::${r.id}`)).length,
    maps: new Set(rs.map(r => r.map)).size, exactDuplicates: exactDuplicates(rs), duplicates: duplicates(rs), recent: recent({ root, limit }), file: LEDGER_REL };
}

module.exports = { MODULE_ID: 'idearium.spec-engine.phase-ledger', VERSION: '1.0.0', EVENTS, LEDGER_REL, rows, exactDuplicates, duplicates, covers, log, history, recent, ledger, readLog };

if (require.main === module) {
  const [cmd = 'ledger', ...rest] = process.argv.slice(2);
  const flag = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null; };
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
  let r;
  if (cmd === 'ledger') { r = ledger({ system: pos[0] || null }); console.log(`${r.total} phases in ${r.maps} maps · ${r.done} done · ${r.open} open · ${r.logged} with a ledger line · ${r.exactDuplicates.length} ids written in more than one map · ${r.duplicates.length} short ids reused across maps`); for (const e of r.recent.slice(0, 15)) console.log(`  ${e.at.slice(0, 16)} ${e.event.padEnd(8)} ${e.phase} — ${e.why.slice(0, 110)}`); process.exit(0); }
  if (cmd === 'dups') { for (const d of duplicates(rows({}))) console.log(`${d.id}: ${d.phases.map(p => `${p.id} (${p.map.replace(/^docs\//, '')})`).join(' · ')}`); process.exit(0); }
  if (cmd === 'covers') { for (const c of covers({ files: pos, does: flag('does') || '' })) console.log(`${c.id} (${c.map}) — ${c.why}`); process.exit(0); }
  if (cmd === 'log') { r = log({ phase: pos[0], event: pos[1], why: pos.slice(2).join(' '), by: flag('by') || 'coder', version: flag('version'), map: flag('map') }); console.log(r.ok ? `logged: ${r.entry.event} ${r.entry.phase}` : r.error); process.exit(r.ok ? 0 : 1); }
  if (cmd === 'history') { for (const e of history({ phase: pos[0] })) console.log(`${e.at.slice(0, 16)} ${e.event.padEnd(8)} ${e.by} — ${e.why}${e.version ? ` (${e.version})` : ''}`); process.exit(0); }
  if (cmd === 'recent') { for (const e of recent({ limit: pos[0] || 20 })) console.log(`${e.at.slice(0, 16)} ${e.event.padEnd(8)} ${e.phase} — ${e.why.slice(0, 110)}`); process.exit(0); }
  console.log('usage: node idearium/spec-engine/phase-ledger.cjs <ledger [system] | dups | covers <file…> [--does "text"] | log <phase> <event> "<why>" [--by who] [--version x.y.z] [--map docs/…] | history <phase> | recent [n]>');
  process.exit(2);
}
