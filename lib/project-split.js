'use strict';
/**
 * lib/project-split.js — one component, one file: a file that holds several components is broken up, each component into its own
 * file, the old path kept as the door, and every new file wired into the spine.
 * comp_id: nexus.lib.project-split
 * UUID: nexus-lib-project-split-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-SPLIT · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA4 (decision FA_D3)
 *
 * James, 2026-10-29: "decomposition tool for breaking up each component into it's own file and wire it into the spine."
 *
 * A component is a banner section (// ── name ──) when the file has two or more, else a top-level declaration. Read through the JS
 * adapter (lib/adapters/javascript.js: units, identifiers, dependencies), never a scanner directly (NC0). Kept together, and said
 * why: units sharing a top-level let/var that is reassigned; units in a require cycle; anything that needs the door's own module
 * (__filename, require.main, module.*, exports.*), and what uses it; a value computed after a top-level
 * statement it shares a name with. The door (the old path) requires the pieces and keeps its side effects and its exports as
 * written, so nothing that required it changes. Nothing is written here: plan() is a proposal; verify() loads the old and the new
 * file apart, in child processes, and compares every export's name and type.
 *
 *   plan(path, text, { by: 'auto'|'section'|'declaration' })  → SplitPlan { ok, file, by, pieces, door, writes, merged, refused? }
 *   verify(plan, { files, testCmd })                          → { ok, before, after, diff, test? }
 *   candidates(files, { minUnits })                           → [{ path, lines, units, sections }]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('./adapters/contract.js');

const MODULE_ID = 'nexus.lib.project-split';
const VERSION = '1.0.0';
const DOOR_ONLY = /(^|[^.\w$])(__filename|require\.main|module\.(?!exports\b)|exports\.)/;   // this and arguments inside a declaration are its own
const MOVABLE = new Set(['function', 'class', 'const', 'let', 'var']);

const slug = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'part';
const relSpec = (fromFile, toFile) => { let r = path.posix.relative(path.posix.dirname(fromFile), toFile); if (!r.startsWith('.')) r = `./${r}`; return r; };

/** rewrite every relative require/import literal in a piece of code so it still reaches the same file from another folder */
function _rebase(code, fromFile, toFile) {
  return code.replace(/(\brequire\(\s*|\bimport\(\s*|\bfrom\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (all, pre, q, spec) => {
    const abs = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
    return `${pre}${q}${relSpec(toFile, abs)}${q}`;
  });
}

function _reassigned(name, texts) {
  const esc = name.replace(/\$/g, '\\$');
  const re = new RegExp(`(^|[^.\\w$])${esc}\\s*(?:[+\\-*/%&|^]|\\*\\*|<<|>>>?|&&|\\|\\||\\?\\?)?=(?!=|>)|(\\+\\+|--)\\s*${esc}\\b|(^|[^.\\w$])${esc}\\s*(\\+\\+|--)`, 'm');
  return texts.some(t => re.test(t));
}

function plan(file, text, { by = 'auto', minUnits = 2 } = {}) {
  const p = String(file).replace(/\\/g, '/');
  const J = A.forFile(p);
  const refuse = (why) => ({ ok: false, file: p, refused: why, pieces: [], writes: [] });
  if (!J || J.id !== 'javascript' || typeof J.identifiers !== 'function') return refuse('only CommonJS JavaScript is split today (the JS adapter); other languages are listed, not split');
  if (/\.(ts|tsx|mjs)$/i.test(p) || J.isModuleSyntax(text)) return refuse('an ES module or TypeScript file — the split keeps CommonJS semantics only; said, not guessed');
  const src = String(text || '');
  const shebang = /^#!.*/.exec(src);   // a script's #! line stays the door's first line; blanked for the scan (line numbers kept)
  const scanned = shebang ? src.replace(/^#!.*/, '') : src;
  const lines = scanned.split('\n');
  const units = J.units(scanned, p);
  if (!units.length) return refuse('no top-level units');
  if (units.some(u => u.unsure)) return refuse(`the structure is not certain: ${units[0].unsure}`);
  const textOf = (u) => lines.slice(u.start - 1, u.end).join('\n');
  const T = units.map(textOf);
  const used = units.map((u, i) => J.identifiers(lines.slice(u.stmtStart - 1, u.end).join('\n')));

  // classify
  const role = units.map(u => (u.kind === 'directive' ? 'header' : u.kind === 'require' && u.require ? 'import' : MOVABLE.has(u.kind) || (u.kind === 'require' && !u.require) ? 'decl' : 'door'));
  const why = units.map(() => null);
  units.forEach((u, i) => { if (u.kind === 'require' && !u.require) { role[i] = 'door'; why[i] = 'a require of a computed path stays where the path is computed'; } });
  units.forEach((u, i) => { if (role[i] === 'decl' && DOOR_ONLY.test(J.code(T[i]))) { role[i] = 'door'; why[i] = 'needs the door\'s own module (__filename, require.main, module, exports)'; } });
  // who defines each top-level name
  const defOf = new Map();
  units.forEach((u, i) => { for (const n of u.names || []) defOf.set(n, i); });
  // a value computed after a top-level statement it shares a name with stays after it, in the door
  const firstDoorStmt = units.findIndex((u, i) => role[i] === 'door' && u.kind === 'statement');
  units.forEach((u, i) => {
    if (role[i] !== 'decl' || u.kind === 'function' || u.kind === 'class' || firstDoorStmt < 0 || i < firstDoorStmt) return;
    if (/^\s*(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[\w$]+\s*=>)/.test(lines[u.stmtStart - 1])) return;   // a function value: nothing runs
    for (let k = firstDoorStmt; k < i; k++) if (role[k] === 'door' && units[k].kind === 'statement' && [...used[k]].some(n => used[i].has(n) && defOf.has(n))) { role[i] = 'door'; why[i] = `computed after the top-level statement at line ${units[k].start}, which it shares a name with`; break; }
  });
  // mutable top-level bindings: every unit that touches one stays with it
  const mutable = new Set();
  units.forEach((u, i) => { if ((u.kind === 'let' || u.kind === 'var') && role[i] !== 'import') for (const n of u.names) if (_reassigned(n, T.map(t => J.code(t)))) mutable.add(n); });

  // groups
  const decls = units.map((u, i) => i).filter(i => role[i] === 'decl');
  const sections = new Set(decls.map(i => units[i].section).filter(Boolean));
  const mode = by === 'auto' ? (sections.size >= 2 ? 'section' : 'declaration') : by;
  const groupOf = new Map();
  for (const i of decls) groupOf.set(i, mode === 'section' ? `s:${units[i].section || '(top)'}` : `d:${units[i].names[0] || units[i].start}`);
  const merged = [];
  const union = (a, b, reason) => { if (a === b) return; for (const [k, g] of groupOf) if (g === b) groupOf.set(k, a); merged.push({ groups: [a, b], why: reason }); };
  // fixpoint: a decl that uses a door name goes to the door; units sharing a mutable binding share a group
  for (let changed = true, guard = 0; changed && guard < 50; guard++) {
    changed = false;
    for (const i of [...groupOf.keys()]) {
      for (const n of used[i]) {
        const d = defOf.get(n); if (d == null || d === i) continue;
        if (role[d] === 'door') { role[i] = 'door'; why[i] = `uses ${n}, which stays in the door`; groupOf.delete(i); changed = true; break; }
        if (mutable.has(n) && groupOf.has(d) && groupOf.get(d) !== groupOf.get(i)) { union(groupOf.get(d), groupOf.get(i), `share ${n}, a top-level binding that is reassigned`); changed = true; }
      }
    }
  }
  // the door may not reach a mutable binding that moved (it would read a copy): such a binding and its group stay in the door
  for (const i of units.keys()) if (role[i] === 'door') for (const n of used[i]) { const d = defOf.get(n); if (d != null && mutable.has(n) && groupOf.has(d)) { const g = groupOf.get(d); for (const [k, gg] of [...groupOf]) if (gg === g) { groupOf.delete(k); role[k] = 'door'; why[k] = `${n} is reassigned and the door reads it`; } } }
  // group graph, cycles merged
  const groupUses = () => { const e = new Map(); for (const [i, g] of groupOf) { if (!e.has(g)) e.set(g, new Set()); for (const n of used[i]) { const d = defOf.get(n); if (d != null && groupOf.has(d) && groupOf.get(d) !== g) e.get(g).add(groupOf.get(d)); } } return e; };
  for (let guard = 0; guard < 50; guard++) {
    const e = groupUses(); const cyc = _cycle(e); if (!cyc) break;
    for (let k = 1; k < cyc.length; k++) union(cyc[0], cyc[k], `a require cycle (${cyc.join(' → ')})`);
  }
  const groups = [...new Set(groupOf.values())];
  if (groups.length < Math.max(2, minUnits)) return { ...refuse(groups.length < 2 ? `fewer than two components can leave the door (${groups.length}) — nothing to split` : `fewer than ${minUnits} components`), why: units.map((u, i) => why[i] && { line: u.start, names: u.names, why: why[i] }).filter(Boolean), mode };

  // pieces
  const dir = path.posix.dirname(p); const base = path.posix.basename(p).replace(/\.(c?js)$/, '');
  const folder = dir === '.' ? base : `${dir}/${base}`;
  const strict = units.some(u => u.kind === 'directive' && /['"]use strict['"]/.test(T[units.indexOf(u)]));
  const nameOfGroup = new Map(); const taken = new Set();
  for (const g of groups) { let n = slug(g.slice(2)); let k = 2; while (taken.has(n)) n = `${slug(g.slice(2))}-${k++}`; taken.add(n); nameOfGroup.set(g, n); }
  const pieceFile = (g) => `${folder}/${nameOfGroup.get(g)}.js`;
  const membersOf = (g) => [...groupOf].filter(([, gg]) => gg === g).map(([i]) => i).sort((a, b) => a - b);
  const importsFor = (idxs, toFile) => units.map((u, i) => i).filter(i => role[i] === 'import' && idxs.some(k => units[i].names.some(n => used[k].has(n))))
    .map(i => _rebase(lines.slice(units[i].stmtStart - 1, units[i].end).join('\n'), p, toFile));
  const pieces = [];
  for (const g of groups) {
    const idxs = membersOf(g); const file = pieceFile(g);
    const names = [...new Set(idxs.flatMap(i => units[i].names))];
    const needs = new Map();
    for (const i of idxs) for (const n of used[i]) { const d = defOf.get(n); if (d != null && groupOf.has(d) && groupOf.get(d) !== g) { const og = groupOf.get(d); if (!needs.has(og)) needs.set(og, new Set()); needs.get(og).add(n); } }
    let body = idxs.map(i => _rebase(T[i], p, file)).join('\n\n');
    const usesDirname = /(^|[^.\w$])__dirname\b/.test(body);
    if (usesDirname) body = body.replace(/(^|[^.\w$])__dirname\b/g, '$1__doorDir');
    const out = [
      ...(strict ? ["'use strict';"] : []),
      `// ${nameOfGroup.get(g)} — split from ${path.posix.basename(p)} (one component, one file; the old path is the door). Names: ${names.join(', ')}.`,
      ...(usesDirname ? ["const __doorDir = require('path').dirname(__dirname);   // the folder of the file this was split from"] : []),
      ...importsFor(idxs, file),
      ...[...needs].map(([og, ns]) => `const { ${[...ns].sort().join(', ')} } = require('${relSpec(file, pieceFile(og))}');`),
      '',
      body,
      '',
      `module.exports = { ${names.join(', ')} };`,
      '',
    ];
    pieces.push({ group: g, path: file, names, lines: idxs.map(i => [units[i].start, units[i].end]), uses: [...needs.keys()].map(pieceFile), section: mode === 'section' ? g.slice(2) : null, text: out.join('\n') });
  }
  // the door: the header, its imports, the pieces it needs, then its own units in their order
  const doorIdx = units.map((u, i) => i).filter(i => role[i] === 'door' || role[i] === 'header');
  const doorNeeds = new Map();
  for (const i of doorIdx) for (const n of used[i]) { const d = defOf.get(n); if (d != null && groupOf.has(d)) { const g = groupOf.get(d); if (!doorNeeds.has(g)) doorNeeds.set(g, new Set()); doorNeeds.get(g).add(n); } }
  const header = doorIdx.filter(i => role[i] === 'header').map(i => T[i]);
  const own = doorIdx.filter(i => role[i] === 'door');
  const door = [
    ...(shebang ? [shebang[0]] : []),
    ...header.map((h, k) => (k === 0 && shebang ? h.replace(/^\n/, '') : h)),
    ...units.map((u, i) => i).filter(i => role[i] === 'import' && own.some(k => units[i].names.some(n => used[k].has(n)))).map(i => T[i]),
    `// ── split into ${groups.length} files under ${base}/ (0.60.286 FA4: one component, one file — this path is the door) ──`,
    ...groups.map(g => doorNeeds.has(g) ? `const { ${[...doorNeeds.get(g)].sort().join(', ')} } = require('${relSpec(p, pieceFile(g))}');` : `require('${relSpec(p, pieceFile(g))}');`),
    '',
    own.map(i => T[i]).join('\n\n'),
    '',
  ].join('\n');
  const writes = [{ path: p, before: src, after: door }, ...pieces.map(x => ({ path: x.path, before: null, after: x.text }))];
  return { ok: true, file: p, by: mode, folder, pieces: pieces.map(({ text: _t, ...x }) => x), door, writes, merged,
    kept: units.map((u, i) => why[i] && { line: u.start, names: u.names, why: why[i] }).filter(Boolean),
    stats: { units: units.length, pieces: pieces.length, doorUnits: own.length, linesBefore: lines.length } };
}

function _cycle(edges) {
  const state = new Map(); const stack = [];
  const visit = (n) => {
    state.set(n, 1); stack.push(n);
    for (const m of edges.get(n) || []) {
      if (state.get(m) === 1) return stack.slice(stack.indexOf(m));
      if (!state.has(m)) { const c = visit(m); if (c) return c; }
    }
    state.set(n, 2); stack.pop(); return null;
  };
  for (const n of edges.keys()) if (!state.has(n)) { const c = visit(n); if (c) return c; }
  return null;
}

/** load one module in a child process (cwd = root) and describe its exports; exits as soon as it has, so a server it starts never holds */
function _describe(root, rel, timeoutMs) {
  const code = `try { const m = require(${JSON.stringify(path.join(root, rel))}); const o = { __type: typeof m, __name: (m && m.name) || null };
    if (m && (typeof m === 'object' || typeof m === 'function')) for (const k of Object.keys(m)) o[k] = typeof m[k] === 'function' ? 'function:' + m[k].length : typeof m[k];
    process.stdout.write('\\u0001' + JSON.stringify(o) + '\\u0001'); } catch (e) { process.stdout.write('\\u0001' + JSON.stringify({ __error: e.message }) + '\\u0001'); } process.exit(0);`;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: root, encoding: 'utf8', timeout: timeoutMs, env: { ...process.env, NODE_ENV: 'test' } });
  const m = /\u0001([\s\S]*?)\u0001/.exec(r.stdout || '');
  if (!m) return { __error: r.error ? r.error.message : `no answer (exit ${r.status}): ${String(r.stderr || '').split('\n').filter(Boolean).slice(-1)[0] || ''}` };
  try { return JSON.parse(m[1]); } catch (e) { return { __error: e.message }; }
}

/**
 * verify(plan, { files, testCmd, timeoutMs }) — the project copied to a temp folder twice, before and after; the old file and the door
 * loaded apart and their exports compared; testCmd (the project's own test, e.g. "node test/run.js") run in both when given.
 */
function verify(plan, { files = [], testCmd = null, timeoutMs = 20000 } = {}) {
  if (!plan || !plan.ok) return { ok: false, why: plan && plan.refused || 'no plan' };
  const mk = (list) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-split-'));
    for (const f of list) { if (typeof f.content !== 'string' && !Buffer.isBuffer(f.content)) continue; const t = path.join(d, f.path); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.content); }
    return d;
  };
  const after = new Map(files.map(f => [String(f.path).replace(/\\/g, '/'), f]));
  for (const w of plan.writes) after.set(w.path, { path: w.path, content: w.after });
  const dB = mk(files); const dA = mk([...after.values()]);
  try {
    const parse = plan.writes.map(w => ({ path: w.path, ...A.forFile(w.path).parse(w.after, w.path) })).filter(x => x.verdict === 'fail');
    const before = _describe(dB, plan.file, timeoutMs); const afterD = _describe(dA, plan.file, timeoutMs);
    const diff = [];
    for (const k of new Set([...Object.keys(before), ...Object.keys(afterD)])) if (before[k] !== afterD[k]) diff.push({ name: k, before: before[k] ?? null, after: afterD[k] ?? null });
    let test = null;
    if (testCmd) {
      const run = (d) => { const r = spawnSync(testCmd, { cwd: d, shell: true, encoding: 'utf8', timeout: 10 * 60 * 1000 }); return { exit: r.status, tail: String(`${r.stdout || ''}${r.stderr || ''}`).split('\n').filter(Boolean).slice(-6) }; };
      const tb = run(dB), ta = run(dA); test = { cmd: testCmd, before: tb, after: ta, same: tb.exit === ta.exit };
    }
    const ok = !parse.length && !diff.length && !before.__error === !afterD.__error && (!test || test.same);
    return { ok, parse, before, after: afterD, diff, test, ...(before.__error ? { note: `the old file does not load on its own here either: ${before.__error}` } : {}) };
  } finally { for (const d of [dB, dA]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp folder left is said by nothing — the OS clears it */ } }
}

/** candidates(files) — CommonJS files holding several components: two or more banner sections, or many top-level declarations */
function candidates(files, { minUnits = 6 } = {}) {
  const out = [];
  for (const f of files) {
    const p = String(f.path).replace(/\\/g, '/');
    if (typeof f.content !== 'string' || !/\.(c?js)$/.test(p) || /(^|\/)(node_modules|test|tests|_archive)\//.test(p)) continue;
    const J = A.forFile(p); if (!J || J.id !== 'javascript' || J.isModuleSyntax(f.content)) continue;
    const u = J.units(f.content, p); if (u.some(x => x.unsure)) continue;
    const decl = u.filter(x => MOVABLE.has(x.kind));
    const sections = new Set(decl.map(x => x.section).filter(Boolean));
    const lines = f.content.split('\n').length;
    if (sections.size >= 2 || (decl.length >= minUnits && lines >= 250)) out.push({ path: p, lines, units: decl.length, sections: [...sections] });
  }
  return out.sort((a, b) => b.lines - a.lines);
}

module.exports = { MODULE_ID, VERSION, plan, verify, candidates };
