'use strict';
/**
 * lib/phase-census.js — every phase judged against its evidence, deterministically (CNS1, 0.60.188).
 * Spec: docs/brainos-in-idearium.spec MOD-BX-PHASE-CENSUS. Map: docs/2026-10-21-brainos-into-idearium-phasemap.spec (CNS1).
 *
 * James, 2026-10-21: "Follow the axioms in docs. Use them as law, and for every decision. It built 5 phases in a row. I think I see what
 * you mean but there are way more idearium phases than that." · "go ahead with the census"
 * By his axioms: §3.3 (the map names what exists, what's missing, what's drifted), §12.5 (drift documented), §6.1 (documentation generated
 * from proof), §0.1 (evidence over memory). No model is asked.
 *
 * Evidence for a phase (its id e.g. CE11_contract_panel; its short id CE11):
 *   commits   a commit whose message names the FULL id, or the short id together with its map's name or one of its declared files —
 *             a short id alone is never evidence (CT1, TB1, DG4… repeat across maps). Strong when that commit also touched one of the
 *             phase's declared non-doc files.
 *   releases  a CHANGELOG file or a lib/version.js line naming it the same way.
 *   files     its declared files, and how many are on disk (presence alone is not evidence: many phases edit files that already existed).
 *   proof     the test files its proof names, whether they exist, and which of the test ids it names (e.g. BST-13) are in them.
 * Verdicts: done · superseded · deferred (as declared) · built-undeclared (a naming record, its files all present, its proof test present with its
 * ids) · partly (the map says so, or a naming commit touched its code) · mentioned (named in a release or test, no build shown) · not-built (nothing names it) · no-files (the map names no files, so it cannot be judged — DG3).
 */
const fs = require('fs');
const path = require('path');
const DAG = require('./phase-dag');

const MODULE_ID = 'nexus.lib.phase-census';
const VERSION = '1.0.0';
const DOC_RX = /^(docs\/|.*\.(md|spec)$)/;
const TEST_RX = /\btest-[\w-]+/g;
const TID_RX = /\b[A-Z][A-Z0-9]{1,6}-\d+[a-z]?\b/g;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** gitLog(root) → [{ sha, msg, files[] }] — '' history (shallow or no git) gives [] and says so in shallow */
function gitLog(root) {
  const cp = require('child_process');
  let shallow = false;
  try { shallow = cp.execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true'; } catch (_) { return { commits: [], shallow: null, error: 'no git history' }; }
  const raw = cp.execFileSync('git', ['log', '--format=%x1e%H%x1f%s%n%b%x1f', '--name-only'], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const commits = raw.split('\x1e').filter(Boolean).map(chunk => { const [sha, msg, files] = chunk.split('\x1f'); return { sha: sha.trim(), msg: msg || '', files: (files || '').split('\n').map(x => x.trim()).filter(Boolean) }; });
  return { commits, shallow };
}

/** releases(root) → [{ ref, text }] — each CHANGELOG file and each version line */
function releases(root) {
  const out = [];
  for (const c of require('./changelogs.js').list(root).filter(c => /^CHANGELOG-.*\.md$/.test(c.name))) out.push({ ref: c.name, text: fs.readFileSync(c.abs, 'utf8') });   // 0.60.274 — versionium/changelogs
  try {
    const v = fs.readFileSync(path.join(root, 'lib/version.js'), 'utf8');
    for (const line of v.split('\n')) { const m = line.match(/'(\d+\.\d+\.\d+)'/); if (m && line.length > 80) out.push({ ref: `version ${m[1]}`, text: line }); }
  } catch (_) {}
  return out;
}

// The phase's own block: from its id line to the next sibling key. phase-dag's `line` is not one convention (a phase's is a 0-based index,
// a decision's 1-based), so the id line is found near it by name, never trusted blind — reading one line early takes the previous
// phase's status (the bug PCN-01 caught).
function _phaseText(lines, line, id) {
  const rx = new RegExp(`^\\s*(- id:\\s*)?${esc(id)}:?\\s*$`);
  let start = [line, line - 1, line + 1].find(i => i != null && i >= 0 && rx.test(lines[i] || ''));
  if (start == null) start = lines.findIndex(l => rx.test(l));
  if (start < 0) return '';
  const ind = lines[start].match(/^(\s*)/)[1].length; const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) { const l = lines[i]; if (l.trim() && l.match(/^(\s*)/)[1].length <= ind) break; out.push(l); }
  return out.join('\n');
}
const _field = (block, key) => { const m = block.match(new RegExp(`^\\s+${key}:\\s*(.*)$`, 'm')); return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''; };

const _has = (text, id) => text.includes(id) && new RegExp(`(^|[^\\w])${esc(id)}(?![\\w])`).test(text);   // "UI1" never names I1
// An id that more than one map declares (A3, R1, CT1 …) is ambiguous: a record must also name this phase's map to count (§0.1).
function _names(text, id, short, mapStem, files, ambiguous) {
  if (ambiguous && !text.includes(mapStem)) return false;
  if (_has(text, id)) return true;
  if (!_has(text, short)) return false;
  return text.includes(mapStem) || files.some(f => text.includes(f));
}
// A release line is build evidence only when it names the full id, or the short id beside one of the phase's own code files. A line naming
// the short id beside the map is the map being cited (CHANGELOG-0.60.130 lists P33… as "what the map already holds"), not a build.
function _relNames(text, id, short, code, mapStem, ambiguous) {
  if (!text.includes(short) || (ambiguous && !text.includes(mapStem))) return false;
  return text.split('\n').some(l => _has(l, id) || (_has(l, short) && code.some(f => l.includes(f))));
}
// A commit that maps or plans names every phase it maps (35a44a9951 "Map the whole build pipeline (SB8–SB14)") — that is not a build.
const MAPPING_RX = /^(map|plan|spec|re-?map|census)\b/i;
const _mapping = (c) => MAPPING_RX.test(c.msg.trim()) || c.files.every(f => DOC_RX.test(f) || /(^|\/)(version\.js|VERSION|package\.json)$/.test(f));

/** judge(phase, ctx) → PhaseVerdict */
function judge(n, { root, lines, commits, rels, ambiguous = false }) {
  const block = _phaseText(lines, n.line, n.id);
  const declared = _field(block, 'status');
  const proof = _field(block, 'proof');
  const short = n.id.split('_')[0];
  const mapStem = path.basename(n.map).replace(/-phasemap\.spec$|\.spec$|\.md$/, '');
  const files = (n.files || []).filter(f => /[./]/.test(f) && !/[*{}]/.test(f));
  const code = files.filter(f => !DOC_RX.test(f));
  const present = files.filter(f => fs.existsSync(path.join(root, f)));
  // a message line that maps ("Mapped next: … SD0–SD9") names the phases it maps, not ones it built (69bcf9e1ed)
  const naming = commits.filter(c => !c.mapping && c.msg.includes(short) && _names(c.built, n.id, short, mapStem, files, ambiguous));
  const strong = naming.filter(c => c.files.some(f => code.includes(f)));
  const relHits = rels.filter(r => !/^#[^\n]*\b(map|plan)/i.test(r.text) && _relNames(r.text, n.id, short, code, mapStem, ambiguous)).map(r => r.ref);
  const tests = [...new Set(proof.match(TEST_RX) || [])];
  const ids = [...new Set(proof.match(TID_RX) || [])];
  const testFiles = tests.map(t => ['.test.js', '.js'].map(e => path.join('tests/modules', t + e)).find(p => fs.existsSync(path.join(root, p)))).filter(Boolean);
  const testText = testFiles.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
  const idsFound = ids.filter(i => testText.includes(i));
  const evidence = { commits: strong.slice(0, 3).map(c => c.sha.slice(0, 10)), namingCommits: naming.length, releases: relHits.slice(0, 3),
    files: { declared: files.length, present: present.length }, proof: { tests, present: testFiles, ids, idsFound } };
  let verdict;
  if (n.done || /^(DONE|BUILT|COMPLETE|SHIPPED)\b/i.test(declared)) verdict = 'done';
  else if (/SUPERSEDED|RETIRED|DROPPED|FOLDED INTO|MERGED INTO/i.test(declared)) verdict = 'superseded';
  else if (/^PARTL/i.test(declared)) verdict = 'partly';                      // the map already says so
  else if (/^(LATER|DEFERRED|PARKED)\b/i.test(declared)) verdict = 'deferred';  // deferred by a decision: not open work, not judged
  else if (!files.length) verdict = relHits.length ? 'mentioned' : 'no-files';
  else {
    const named = strong.length > 0 || relHits.length > 0;
    const filesOk = present.length === files.length;
    const proofOk = !tests.length || (testFiles.length === tests.length && (!ids.length || idsFound.length >= Math.ceil(ids.length / 2)));
    const bare = !declared || /^(OPEN|TODO|PLANNED|NEXT|READY)\W*$/i.test(declared);  // the map says nothing more than "open"
    if (bare && named && filesOk && proofOk && (strong.length > 0 || (tests.length && testFiles.length))) verdict = 'built-undeclared';
    else if (strong.length) verdict = 'partly';                                // a commit that names it touched its code
    else if (named || (tests.length && testFiles.length && idsFound.length)) verdict = 'mentioned';  // a release table or a question names it; no build shown
    else verdict = 'not-built';
  }
  return { id: n.id, map: n.map, line: n.line, layer: n.layer == null ? null : n.layer, declared, verdict, evidence, deps: n.deps || [] };
}

/** census({ root, system, maps?, git?, rels? }) → { phases, counts, order, shallow } */
function census({ root, system = 'idearium', maps = null, git = null, rels = null } = {}) {
  maps = maps || fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('-phasemap.spec')).map(f => ({ path: 'docs/' + f, text: fs.readFileSync(path.join(root, 'docs', f), 'utf8') }));
  const g = DAG.build(maps);
  const lines = {}; for (const m of maps) lines[m.path] = m.text.split('\n');
  const mine = (n) => !system || new RegExp(system, 'i').test(n.map) || (n.files || []).some(f => f.startsWith(system + '/')) || (n.systems || []).includes(system);
  const gl = git || gitLog(root); const R = rels || releases(root);
  // once per commit: is it a mapping commit, and its message without the lines that map ("Mapped next: … SD0–SD9", 69bcf9e1ed)
  const commits = (gl.commits || []).map(c => ({ ...c, mapping: _mapping(c), built: c.msg.split('\n').filter(l => !/\bmap(ped|s)?\b/i.test(l)).join('\n') }));
  const all = Object.values(g.nodes).filter(n => !n.decision);
  const maps4 = {}; for (const n of all) { const k = n.id.split('_')[0]; (maps4[k] = maps4[k] || new Set()).add(n.map); }
  const phases = all.filter(mine).map(n => judge(n, { root, lines: lines[n.map] || [], commits, rels: R, ambiguous: maps4[n.id.split('_')[0]].size > 1 }));
  const counts = {}; for (const p of phases) counts[p.verdict] = (counts[p.verdict] || 0) + 1;
  const open = phases.filter(p => ['not-built', 'partly', 'mentioned', 'no-files'].includes(p.verdict));
  const order = open.sort((a, b) => ((a.layer == null ? 1e9 : a.layer) - (b.layer == null ? 1e9 : b.layer)) || a.map.localeCompare(b.map) || a.id.localeCompare(b.id)).map(p => `${p.map}::${p.id}`);
  return { system, total: phases.length, counts, phases, order, shallow: gl.shallow, gitError: gl.error || null, maps: maps.length };
}

/** markdown(c) → the generated census document (§6.1) */
function markdown(c, { quote = null, date = new Date().toISOString().slice(0, 10) } = {}) {
  const row = (p) => {
    const e = p.evidence; const bits = [];
    if (e.commits.length) bits.push(`commits ${e.commits.join(', ')}`); else if (e.namingCommits) bits.push(`${e.namingCommits} commit(s) name it, none touched its files`);
    if (e.releases.length) bits.push(`releases ${e.releases.join(', ')}`);
    bits.push(`files ${e.files.present}/${e.files.declared}`);
    if (e.proof.tests.length) bits.push(`proof ${e.proof.present.length}/${e.proof.tests.length} test file(s)${e.proof.ids.length ? `, ids ${e.proof.idsFound.length}/${e.proof.ids.length}` : ''}`);
    return `| ${p.id} | ${p.map.replace(/^docs\//, '')}:${p.line} | ${p.layer == null ? '—' : p.layer} | ${String(p.declared || '—').replace(/\|/g, '/').slice(0, 40)} | ${bits.join(' · ')} |`;
  };
  const sec = (title, list) => list.length ? `\n## ${title} (${list.length})\n\n| phase | map:line | layer | declared | evidence |\n|---|---|---|---|---|\n${list.map(row).join('\n')}\n` : '';
  const by = (v) => c.phases.filter(p => p.verdict === v).sort((a, b) => ((a.layer ?? 1e9) - (b.layer ?? 1e9)) || a.map.localeCompare(b.map));
  return `# ${c.system ? c.system[0].toUpperCase() + c.system.slice(1) : 'Nexus'} phase census — ${date}

${quote ? `${quote}\n\n` : ''}Generated by \`lib/phase-census.js\` (CNS1) from ${c.maps} phasemaps, the git history${c.shallow ? ' (SHALLOW — commit evidence incomplete)' : ''} and the release records. Deterministic; no model was asked.
A verdict names its evidence. A short id alone (CT1, TB1 …) is never evidence: a commit must name the full id, or the short id with the
phase's map or one of its files; a release line must name the full id, or the short id beside one of the phase's code files. Commits and
releases that map or plan are not build evidence. Files on disk alone are not evidence (phases often edit files that already existed).
"Built, not marked done" is only said of a phase whose map says no more than "open".

**${c.total} phases.** ${Object.entries(c.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}.
${by('built-undeclared').length ? sec('Built, not marked done (status drift — corrected by addendum)', by('built-undeclared')) : '\n## Built, not marked done (0)\n\nNone found: no open phase has a commit that names it and touched its code, with its files present and its proof test holding its ids, while its map says no more than "open". Status drift, where there is any, is in the other direction: phases marked open with nothing that names them as built.\n'}${sec('Partly built (the map says so, or a commit naming it touched its code)', by('partly'))}${sec('Mentioned, no build shown (a release table, a question, a test id)', by('mentioned'))}${sec('Not built (nothing names it)', by('not-built'))}${sec('No files named (cannot be judged until the map names them — DG3)', by('no-files'))}${sec('Deferred by a decision (not open work)', by('deferred'))}
## Open, bottom-up (§3.1)

The not-built, partly-built, mentioned and unjudgeable phases in DAG-layer order (layer 0 first; a phase in a cycle last):

${c.order.map((k, i) => `${i + 1}. ${k.replace(/^docs\//, '')}`).join('\n')}
`;
}

module.exports = { MODULE_ID, VERSION, census, judge, markdown, gitLog, releases };
