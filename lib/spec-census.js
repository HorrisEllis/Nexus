'use strict';
/**
 * lib/spec-census.js — what every spec and phase claims, checked against the tree (0.59.1).
 * comp_id: nexus.lib.spec-census
 *
 * James, 2026-10-10: "all of the over 1000 specs, map onto whats done, and what isn't or make a tool to check. then
 * consolidate them into full specs if applicable, maybe move complete into its own catagory."
 *
 * loom/scanners/phasemap-map.js already reads every phase and its status (1,232 phases, 101 maps). What nothing checked
 * is whether a status is TRUE. This reads each phase's own block (files:, proof:, the tests and versions it names) and
 * each non-phasemap .spec (the code paths it names) and says how it is known:
 *   phase   done + evidence (a named test exists and is registered, or a proof file exists, and its files exist) → verified
 *           done, files exist, no test or proof found                                                            → claimed
 *           done but a file it names is gone                                                                     → contradicted
 *           open, every file it names exists and a test it names exists                                           → built?  (check it)
 *           otherwise open / shelf / closed as loom read it
 *   spec    the share of code paths it names that exist → built (≥ 80 %) · partial · unbuilt · doc (names no code);
 *           registered in docs/SPEC-REGISTRY.spec or not; dated addenda; the system that owns it (lib/nexus-self/systems.js)
 * Reading only — nothing is moved or edited. "Complete" is a computed category (a view), not a folder: moving 300 files
 * would break every reference to them and their git history (§0.3).
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.spec-census';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const PHASE_RE = /^\s{2,6}([A-Z]{1,3}(?:\d+|-[A-Z0-9]+)_[A-Za-z0-9_]*):(.*)$/;   // loom's own (phasemap-map.js)
const PATH_RE = /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:js|cjs|mjs|json|html|css|yaml|yml|spec|md|sh|py))\b/g;
const TEST_RE = /\b((?:tests\/(?:modules|probe|sim)\/)?test-[a-z0-9-]+(?:\.test)?\.js|tests\/probe\/[a-z0-9-]+\.js)\b/g;
const VER_RE = /\b0\.(\d+)\.(\d+)\b/g;
const SKIP_DIRS = /(^|\/)(node_modules|data|_archive|\.git)(\/|$)/;

// a path counts as present at the root, or as the tail of any tracked file — maps often name a path relative to its
// system (main/index.js = clear-glass/src/main/index.js)
let _tracked = null;
function _trackedFiles() {
  if (_tracked) return _tracked;
  _tracked = new Set();
  try { for (const f of require('child_process').execFileSync('git', ['ls-files'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString().split('\n')) if (f) _tracked.add(f); } catch (_) {}
  return _tracked;
}
const _tails = new Map();
function _exists(rel) {
  try { if (fs.existsSync(path.join(ROOT, rel))) return true; } catch (_) {}
  if (_tails.has(rel)) return _tails.get(rel);
  let hit = false; for (const f of _trackedFiles()) if (f.endsWith('/' + rel)) { hit = true; break; }
  _tails.set(rel, hit); return hit;
}
function _testPath(name) {
  if (name.includes('/')) return _exists(name) ? name : null;
  for (const d of ['tests/modules', 'tests/probe', 'tests/sim']) if (_exists(`${d}/${name}`)) return `${d}/${name}`;
  return null;
}
let _runAll = null;
const _registered = (rel) => { if (_runAll == null) { try { _runAll = fs.readFileSync(path.join(ROOT, 'tests/modules/run-all.js'), 'utf8'); } catch (_) { _runAll = ''; } } return rel.startsWith('tests/probe/') || rel.startsWith('tests/sim/') || _runAll.includes(path.basename(rel)); };
let _versions = null;
function _versionKnown(v) {
  if (!_versions) {
    _versions = new Set();
    try { for (const f of fs.readdirSync(ROOT)) { const m = /^CHANGELOG-(\d+\.\d+\.\d+)/.exec(f); if (m) _versions.add(m[1]); } } catch (_) {}
    try { for (const m of fs.readFileSync(path.join(ROOT, 'lib/version.js'), 'utf8').matchAll(/\b(0\.\d+\.\d+)\b/g)) _versions.add(m[1]); } catch (_) {}
  }
  return _versions.has(v);
}
const _uniq = (a) => [...new Set(a)];

/** the block of text that belongs to each phase id in a map */
function _phaseBlocks(text) {
  const lines = String(text).split('\n'), out = new Map();
  let id = null, buf = [];
  const flush = () => { if (id && !out.has(id)) out.set(id, buf.join('\n')); };
  for (const l of lines) {
    const m = l.match(PHASE_RE);
    if (m) { flush(); id = m[1]; buf = [l]; continue; }
    if (id) buf.push(l);
  }
  flush();
  return out;
}

function _evidence(block) {
  const files = _uniq([...block.matchAll(PATH_RE)].map(m => m[1]).filter(p => !/^docs\/\d{4}-/.test(p) || /phasemap/.test(p) === false));
  const named = files.filter(f => !/^(https?|www)\b/.test(f));
  const present = named.filter(_exists), missing = named.filter(f => !_exists(f));
  const tests = _uniq([...block.matchAll(TEST_RE)].map(m => m[1])).map(t => ({ name: t, path: _testPath(t) }));
  const testsFound = tests.filter(t => t.path);
  const versions = _uniq([...block.matchAll(VER_RE)].map(m => m[0])).filter(_versionKnown);
  return { files: named.length, present: present.length, missing, tests: tests.length, testsFound: testsFound.map(t => t.path), testsRegistered: testsFound.filter(t => _registered(t.path)).length, versions };
}

function _phaseVerdict(p, ev) {
  if (p.closedAs) return 'closed';
  if (p.shelf) return 'shelf';
  if (p.status === 'done') {
    if (ev.missing.length && ev.missing.length >= ev.present) return 'contradicted';
    if (ev.testsFound.length || ev.versions.length) return 'verified';
    return 'claimed';
  }
  if (ev.files && !ev.missing.length && ev.testsFound.length) return 'built?';
  return p.status === 'in-progress' ? 'in-progress' : 'open';
}

/** phases() → [{ id, map, title, status, systems, verdict, evidence }] — every phase loom reads, with its evidence */
function phases({ loom = require('../loom/scanners/phasemap-map.js') } = {}) {
  const all = loom.loadAll();
  const blocks = new Map();
  const docs = process.env.NEXUS_PHASEMAP_DIR || path.join(ROOT, 'docs');
  const out = [];
  for (const p of all.phases) {
    if (!blocks.has(p.map)) { let t = ''; try { t = fs.readFileSync(path.join(docs, `${p.map}.spec`), 'utf8'); } catch (_) {} blocks.set(p.map, _phaseBlocks(t)); }
    const ev = _evidence(blocks.get(p.map).get(p.id) || '');
    out.push({ id: p.id, map: p.map, title: p.title, status: p.status, systems: p.systems || [], verdict: _phaseVerdict(p, ev), evidence: ev });
  }
  return out;
}

function _specFiles(dir = ROOT, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
    if (SKIP_DIRS.test(rel)) continue;
    if (e.isDirectory()) _specFiles(p, acc);
    else if (e.name.endsWith('.spec') && !/phase-?map/.test(e.name)) acc.push(rel);
  }
  return acc;
}

/** specs() → [{ path, system, bytes, codePaths, present, verdict, registered, addenda }] — every non-phasemap .spec */
function specs() {
  let registry = ''; try { registry = fs.readFileSync(path.join(ROOT, 'docs/SPEC-REGISTRY.spec'), 'utf8'); } catch (_) {}
  let systemOf = () => 'core'; try { systemOf = require('./nexus-self/systems.js').ownerOf || systemOf; } catch (_) {}
  return _specFiles().sort().map(rel => {
    let text = ''; try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (_) {}
    const code = _uniq([...text.matchAll(PATH_RE)].map(m => m[1])).filter(p => /\.(js|cjs|mjs|html|css|py|sh)$/.test(p) && !p.startsWith('tests/'));
    const present = code.filter(_exists).length;
    const share = code.length ? present / code.length : null;
    const verdict = share == null ? 'doc' : share >= 0.8 ? 'built' : share > 0 ? 'partial' : 'unbuilt';
    let system = 'core'; try { system = systemOf(rel) || 'core'; } catch (_) {}
    return { path: rel, system, bytes: Buffer.byteLength(text), codePaths: code.length, present, missing: code.filter(p => !_exists(p)).slice(0, 8), verdict,
      registered: registry.includes(rel) || registry.includes(path.basename(rel)), addenda: (text.match(/ADDENDUM|addendum_\d{4}/g) || []).length };
  });
}

const _count = (rows, key) => rows.reduce((o, r) => { o[r[key]] = (o[r[key]] || 0) + 1; return o; }, {});

/** census() → { phases: { total, byVerdict, rows }, specs: { total, byVerdict, unregistered, rows }, text } */
function census(opts = {}) {
  const ph = phases(opts), sp = specs();
  const pv = _count(ph, 'verdict'), sv = _count(sp, 'verdict');
  const unregistered = sp.filter(s => !s.registered).length;
  return {
    phases: { total: ph.length, byVerdict: pv, rows: ph },
    specs: { total: sp.length, byVerdict: sv, unregistered, rows: sp },
    text: `${ph.length} phases: ${Object.entries(pv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}. ` +
      `${sp.length} specs: ${Object.entries(sv).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}; ${unregistered} not in SPEC-REGISTRY.`,
  };
}

/** report(c) → markdown: the counts, then the lists that need a person's eye (contradicted, claimed, built?, unbuilt specs) */
function report(c = census()) {
  const L = [`# Spec and phase census`, '', `Generated by \`lib/spec-census.js\` (\`idearium census\`). ${c.text}`, '',
    'How each is known: **verified** = done, and a test it names exists or the version it names was released · **claimed** = done, files present, no test or release found · **contradicted** = done, but most files it names are gone · **built?** = open, yet its files and a named test exist (check it, then mark it) · specs: **built** ≥ 80 % of the code it names exists, **partial**, **unbuilt**, **doc** = names no code.', ''];
  const sect = (title, rows, fmt) => { if (!rows.length) return; L.push(`## ${title} (${rows.length})`, ''); for (const r of rows) L.push(`- ${fmt(r)}`); L.push(''); };
  const ph = c.phases.rows;
  sect('Phases marked done whose files are gone', ph.filter(p => p.verdict === 'contradicted'), p => `\`${p.map}\` ${p.id} — missing: ${p.evidence.missing.slice(0, 4).join(', ')}`);
  sect('Open phases that look built', ph.filter(p => p.verdict === 'built?'), p => `\`${p.map}\` ${p.id} — tests: ${p.evidence.testsFound.join(', ')}`);
  sect('Phases marked done with no test or release found', ph.filter(p => p.verdict === 'claimed'), p => `\`${p.map}\` ${p.id}`);
  sect('Specs whose code does not exist', c.specs.rows.filter(s => s.verdict === 'unbuilt'), s => `\`${s.path}\` (${s.system}) — names ${s.codePaths} file(s), none present`);
  sect('Specs not in SPEC-REGISTRY', c.specs.rows.filter(s => !s.registered), s => `\`${s.path}\` (${s.system}, ${s.verdict})`);
  return L.join('\n') + '\n';
}

module.exports = { MODULE_ID, VERSION, phases, specs, census, report, _phaseBlocks, _evidence };
