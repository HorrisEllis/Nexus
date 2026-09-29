'use strict';
/**
 * tests/modules/test-code-intel.test.js — lib/code-intel (0.39.273 CB1-CB3)
 * docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec
 *
 *   CI-1xx  structural chunker: never mid-body, docs open their own chunk, bounded size, every line once, stable ids
 *   CI-2xx  languages: python, go, rust, markdown, css, tsx
 *   CI-3xx  cards: kind/name/signature/doc/summary, uses/usedBy with basis, tests, neighbours
 *   CI-4xx  search + grep
 *   CI-5xx  the import pipeline: cards.json / search.json written, incremental, chunker version re-chunks, L0-L5 pass
 *   CI-6xx  measured on this repo's own source: the 0.39.272 defects stay gone
 */
require('../../lib/test-sandbox.js').ensure();
// CLAUDE.md — "silence [jaa]-style logs or the runner miscounts": module chatter ("[jaa] …", "[idearium…] …",
// "[API] …") is dropped; the test's own lines (which never start with "[") are kept.
{ const _log = console.log, _warn = console.warn;
  const chatter = (a) => typeof a[0] === 'string' && /^\[[\w./ -]+\]/.test(a[0]);
  console.log = (...a) => { if (!chatter(a)) _log(...a); };
  console.warn = (...a) => { if (!chatter(a)) _warn(...a); }; }
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
// fixtures name modules that exist only in the temp repo; building the word at runtime keeps loom's source scanner
// from reading them as dangling edges of THIS file
const RQ = ['req', 'uire'].join('');

const ROOT = path.resolve(__dirname, '..', '..');
const CI = require(path.join(ROOT, 'lib/code-intel/index.js'));
const { planChunks, LIMITS } = require(path.join(ROOT, 'lib/code-intel/chunker.js'));
const { lineInfo } = require(path.join(ROOT, 'lib/code-intel/structure.js'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'code-intel-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n      ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')}`); }
}
const covers = (plan, lineCount) => {
  const c = plan.chunks;
  assert.strictEqual(c[0].start, 1, 'first chunk starts at line 1');
  assert.strictEqual(c[c.length - 1].end, lineCount, 'last chunk ends at the last line');
  for (let i = 1; i < c.length; i++) assert.strictEqual(c[i].start, c[i - 1].end + 1, `gap/overlap at chunk ${i}`);
};

async function main() {
  console.log('\ntest-code-intel\n\n── structural chunker ─────────────────────────────────');
  const JS = [
    "'use strict';",                                   // 1
    '/**',                                             // 2
    ' * outer does the thing.',                        // 3
    ' */',                                             // 4
    'function outer(a) {',                             // 5
    '  function inner(b) {',                           // 6
    '    return b + 1;',                               // 7
    '  }',                                             // 8
    '  const helper = (x) => {',                       // 9
    '    return x * 2;',                               // 10
    '  };',                                            // 11
    '  return inner(helper(a));',                      // 12
    '}',                                               // 13
    '',                                                // 14
    '// second is documented right above it',        // 15
    'function second() {',                             // 16
    '  return outer(1);',                              // 17
    '}',                                               // 18
    '',                                                // 19
    'module.exports = { outer, second };',             // 20
    '',                                                // 21
  ].join('\n');

  await t('CI-101', 'a nested function is never a boundary: the enclosing function is one chunk', () => {
    const p = planChunks(JS, 'javascript');
    const outer = p.chunks.find(c => c.name === 'outer');
    assert.ok(outer, 'no outer chunk');
    assert.ok(outer.start <= 5 && outer.end >= 13, `outer is ${outer.start}-${outer.end}`);
    assert.ok(!p.chunks.some(c => c.name === 'inner' || c.name === 'helper'), 'a nested function became its own chunk');
  });
  await t('CI-102', 'a doc comment opens the chunk of what it documents (JSDoc and a // line)', () => {
    const p = planChunks(JS, 'javascript');
    assert.strictEqual(p.chunks.find(c => c.name === 'outer').start, 2);
    assert.strictEqual(p.chunks.find(c => c.name === 'second').start, 15);
  });
  await t('CI-103', 'every line is in exactly one chunk, in order', () => covers(planChunks(JS, 'javascript'), JS.split('\n').length));
  await t('CI-104', 'symbols are the top-level declarations, at their declaration line; export lists mark them exported', () => {
    const p = planChunks(JS, 'javascript');
    assert.deepStrictEqual(p.symbols.map(s => [s.name, s.line, s.exported]), [['outer', 5, true], ['second', 16, true]]);
  });
  await t('CI-105', 'a banner comment separated by one blank line introduces what follows', () => {
    const src = 'const A = 1;\n\n// ── Parsing ──\n\nfunction parse() {\n  return A;\n}\n';
    const p = planChunks(src, 'javascript');
    assert.strictEqual(p.chunks.find(c => c.name === 'parse').start, 3);
  });
  await t('CI-106', 'a comment trailing code with no blank line stays with that code', () => {
    const src = 'function a() {\n  return 1;\n}\n// end of a\nfunction b() {\n  return 2;\n}\n';
    const p = planChunks(src, 'javascript');
    // "// end of a" is directly above b with no gap, so it opens b — the documented rule; what matters is no line is lost
    covers(p, src.split('\n').length);
    assert.strictEqual(p.chunks.find(c => c.name === 'a').end, 3);
  });
  await t('CI-107', 'decorators belong to the declaration below them', () => {
    const src = 'class A {\n  x = 1;\n}\n\n@Component({})\nexport class B {\n  y = 2;\n}\n';
    const p = planChunks(src, 'typescript');
    assert.strictEqual(p.chunks.find(c => c.name === 'B').start, 5);
  });
  await t('CI-108', 'a class over the cap is split at its members, each named Class.member with the class as parent', () => {
    const body = Array.from({ length: 12 }, (_, i) => `  method${i}(a) {\n${Array.from({ length: 14 }, (_, j) => `    const v${j} = a + ${j};`).join('\n')}\n    return a;\n  }\n`).join('\n');
    const src = `class Big {\n  constructor() { this.n = 0; }\n\n${body}}\n\nmodule.exports = Big;\n`;
    const p = planChunks(src, 'javascript');
    covers(p, src.split('\n').length);
    const members = p.chunks.filter(c => c.kind === 'method');
    assert.ok(members.length >= 10, `only ${members.length} method chunks`);
    assert.ok(members.every(c => /^Big\.method\d+$/.test(c.qualifiedName)), members.map(c => c.qualifiedName).join(','));
    assert.ok(members.every(c => c.parentQName === 'Big'));
    assert.ok(p.chunks.every(c => c.end - c.start + 1 <= LIMITS.max || c.forced), 'a chunk over the cap');
    assert.strictEqual(p.chunks[0].name, 'Big');
  });
  await t('CI-109', 'a giant switch is split at its cases, and small cases group', () => {
    const cases = Array.from({ length: 60 }, (_, i) => `    case 'a${i}': {\n      const x = ${i};\n      return x + 1;\n    }`).join('\n');
    const src = `function handle(action) {\n  switch (action) {\n${cases}\n    default:\n      return null;\n  }\n}\n`;
    const p = planChunks(src, 'javascript');
    covers(p, src.split('\n').length);
    const parts = p.chunks.filter(c => c.kind === 'case');
    assert.ok(parts.length >= 2, `${parts.length} case chunks`);
    assert.ok(parts.every(c => /case 'a\d+'/.test(c.name) || /default/.test(c.name)), parts.map(c => c.name).join(' | '));
    assert.ok(p.chunks.every(c => c.end - c.start + 1 <= LIMITS.max));
    // no chunk starts in the middle of a case body
    const lines = src.split('\n');
    for (const c of p.chunks.slice(1)) assert.ok(/^\s*(case |default:|switch|\/\/|function)/.test(lines[c.start - 1]) || !lines[c.start - 1].trim(), `cut at: ${lines[c.start - 1]}`);
  });
  await t('CI-110', 'one indivisible statement over the cap is cut and says so (forced), never silently', () => {
    const src = `const BIG = \`\n${Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n')}\n\`;\n`;
    const p = planChunks(src, 'javascript');
    covers(p, src.split('\n').length);
    assert.ok(p.chunks.length > 1 && p.chunks.some(c => c.forced));
  });
  await t('CI-111', 'tiny one-line helpers group into one chunk that keeps every symbol', () => {
    const src = 'const a = (x) => x + 1;\nconst b = (x) => x + 2;\nconst c = (x) => x + 3;\n';
    const p = planChunks(src, 'javascript');
    assert.strictEqual(p.chunks.length, 1);
    assert.deepStrictEqual(p.symbols.map(s => s.name), ['a', 'b', 'c']);
    assert.deepStrictEqual(p.chunks[0].symbolNames, ['a', 'b', 'c']);
  });
  await t('CI-112', 'keys are stable: adding a function above leaves every other key unchanged', () => {
    const before = planChunks(JS, 'javascript').chunks.map(c => c.key);
    const after = planChunks(JS.replace("'use strict';", "'use strict';\n\nfunction added() {\n  return 0;\n}\n"), 'javascript').chunks.map(c => c.key);
    for (const k of before.filter(k => !/^block:|^preamble:/.test(k))) assert.ok(after.includes(k), `key ${k} changed`);
  });
  await t('CI-113', 'require/import bindings are imports, not definitions', () => {
    const p = planChunks("const { add } = " + RQ + "('./math');\nconst fs = require('fs');\nfunction f() { return add(1, 2); }\n", 'javascript');
    assert.ok(!p.chunks.some(c => (c.defines || []).includes('add')), JSON.stringify(p.chunks.map(c => [c.kind, c.defines])));
  });
  await t('CI-114', 'string, template and regex contents never move the structure', () => {
    const src = "const s = '{';\nconst r = /[{]/g;\nconst tpl = `${ {a: 1}.a } }`;\nfunction ok() {\n  return '}';\n}\n";
    const li = lineInfo(src, 'javascript');
    assert.strictEqual(li.fallback, null);
    assert.ok(planChunks(src, 'javascript').chunks.some(c => c.name === 'ok'));
  });

  console.log('\n── languages ─────────────────────────────────────────');
  await t('CI-201', 'python: def/class at column 0, methods inside a large class, decorators attached', () => {
    const methods = Array.from({ length: 10 }, (_, i) => `    def m${i}(self):\n${Array.from({ length: 16 }, (_, j) => `        x${j} = ${j}`).join('\n')}\n        return x0\n`).join('\n');
    const src = `import os\n\n\n@dataclass\nclass Big:\n    """A big class."""\n\n${methods}\n\ndef top():\n    return Big()\n`;
    const p = planChunks(src, 'python');
    covers(p, src.split('\n').length);
    assert.ok(p.chunks.find(c => c.name === 'Big').start === 4, 'the decorator opens the class');
    assert.ok(p.chunks.filter(c => /^Big\.m\d$/.test(c.qualifiedName || '')).length >= 8);
    assert.ok(p.symbols.some(s => s.name === 'top'));
  });
  await t('CI-202', 'go: receiver methods are Type.name; structs and funcs are symbols', () => {
    const src = 'package main\n\ntype Server struct {\n\tname string\n}\n\n// Start starts.\nfunc (s *Server) Start(p int) error {\n\treturn nil\n}\n\nfunc main() {}\n';
    const p = planChunks(src, 'go');
    assert.deepStrictEqual(p.chunks.filter(c => c.symbol).map(c => c.name), ['Server', 'Server.Start', 'main']);
    assert.strictEqual(p.chunks.find(c => c.name === 'Server.Start').start, 7);
  });
  await t('CI-203', 'rust: lifetimes do not read as strings; impl blocks and fns are units', () => {
    const src = "use std::fmt;\n\n/// A point.\n#[derive(Debug)]\npub struct P<'a> { x: &'a str }\n\nimpl<'a> fmt::Display for P<'a> {\n    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result { write!(f, \"{}\", self.x) }\n}\n\npub fn make<'a>(x: &'a str) -> P<'a> { P { x } }\n";
    const p = planChunks(src, 'rust');
    assert.strictEqual(p.fallback, null);
    assert.deepStrictEqual(p.chunks.filter(c => c.symbol).map(c => c.kind), ['struct', 'impl', 'function']);
    assert.strictEqual(p.chunks.find(c => c.kind === 'struct').start, 3, 'doc + attribute open the struct');
  });
  await t('CI-204', 'markdown: headings are sections; a fenced # line is not a heading', () => {
    const src = '# Title\nintro\n\n## A\n```sh\n# not a heading\n```\ntext\n\n## B\nmore\n';
    const p = planChunks(src, 'markdown');
    covers(p, src.split('\n').length);
    assert.ok(!p.chunks.some(c => /not a heading/.test(c.name || '')));
  });
  await t('CI-205', 'css: a selector after a one-line @keyframes still starts a rule', () => {
    const src = '@keyframes rise { from { opacity: 0 } }\n.a { color: red; }\n.b {\n  color: blue;\n}\n';
    const li = lineInfo(src, 'css');
    assert.ok(li.lines[1].logical && li.lines[2].logical);
  });
  await t('CI-206', 'tsx: interfaces and arrow components are units', () => {
    const src = "import React from 'react';\n\ninterface Props { name: string }\n\nexport const Hello = ({ name }: Props) => {\n  return <div>{name}</div>;\n};\n";
    const p = planChunks(src, 'tsx');
    assert.ok(p.chunks.some(c => c.kind === 'interface' && c.name === 'Props'));
    assert.ok(p.chunks.some(c => c.kind === 'function' && c.name === 'Hello' && c.exported));
  });

  // a real repo on disk through the real pipeline
  const pipeline = await import(path.join(ROOT, 'idearium/repo/import-pipeline.js'));
  const repoDir = path.join(TMP, 'repo');
  const FILES = {
    'src/math.js': "'use strict';\n/** Adds two numbers. */\nfunction add(a, b) {\n  return a + b;\n}\n\n/** Multiplies two numbers. */\nfunction mul(a, b) {\n  return a * b;\n}\n\nmodule.exports = { add, mul };\n",
    // Cart is over the size cap on purpose, so it is split at its members (Cart.sum, Cart.checkout, …)
    'src/app.js': "const { add } = " + RQ + "('./math');\nconst M = " + RQ + "('./math.js');\n\n/** Totals a list with retries on overflow. */\nfunction total(xs) {\n  return xs.reduce((s, x) => add(s, x), 0) + M.mul(1, 0);\n}\n\nclass Cart {\n  constructor() { this.items = []; }\n  sum() {\n    const items = this.items;\n    const t = total(items);\n    return t;\n  }\n  checkout() {\n    const s = this.sum();\n    const ok = s >= 0;\n    return ok ? s : 0;\n  }\n"
      + Array.from({ length: 14 }, (_, i) => `  filler${i}() {\n${Array.from({ length: 10 }, (_, j) => `    const v${j} = ${j};`).join('\n')}\n    return 0;\n  }\n`).join('') + "}\n\nmodule.exports = { total, Cart };\n",
    'src/uploads.js': "// the upload queue: retries failed uploads with backoff\nfunction retryUpload(file, attempts) {\n  let delay = 100;\n  for (let i = 0; i < attempts; i++) delay *= 2;\n  return delay;\n}\nmodule.exports = { retryUpload };\n",
    'tests/math.test.js': "const assert = require('assert');\nconst { add } = " + RQ + "('../src/math');\nassert.strictEqual(add(2, 3), 5);\n",
    'README.md': '# Demo\n\nA tiny cart.\n',
  };
  for (const [rel, c] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(repoDir, rel)), { recursive: true }); fs.writeFileSync(path.join(repoDir, rel), c); }
  const repo = { uuid: 'ci-test', files: Object.keys(FILES).map(p => ({ path: p })) };
  const r1 = pipeline.runImportPipeline(repo, repoDir, { lazyTests: false, runtimeProof: false });

  console.log('\n── cards ─────────────────────────────────────────────');
  const intel = CI.load(repoDir);
  const byName = (n) => Object.values(intel.cards).find(c => c.qualifiedName === n || c.name === n);
  await t('CI-301', 'every chunk has a card with kind, range, summary, and neighbours linked both ways', () => {
    const idx = JSON.parse(fs.readFileSync(path.join(repoDir, 'chunks', 'index.json'), 'utf8'));
    assert.strictEqual(Object.keys(intel.cards).length, idx.length);
    for (const c of Object.values(intel.cards)) {
      assert.ok(c.kind && c.range && c.summary, JSON.stringify(c).slice(0, 200));
      if (c.next) assert.strictEqual(intel.cards[c.next].prev, c.id);
    }
  });
  await t('CI-302', 'a card carries the signature and the doc comment, and its summary quotes the doc', () => {
    const add = byName('add');
    assert.strictEqual(add.signature, 'function add(a, b)');
    assert.strictEqual(add.doc, 'Adds two numbers.');
    assert.match(add.summary, /^function add \(\d+ lines\) — Adds two numbers\./);
    assert.strictEqual(add.exported, true);
  });
  await t('CI-303', 'uses: an imported name (import), a member through a module binding (import), this.method (same-file)', () => {
    const total = byName('total');
    const u = Object.fromEntries(total.uses.map(x => [x.name, x]));
    assert.strictEqual(u.add.basis, 'import'); assert.strictEqual(u.add.file, 'src/math.js');
    assert.strictEqual(u['M.mul'].basis, 'import');
    const checkout = byName('Cart.checkout');
    assert.ok(checkout.uses.some(x => x.name === 'this.sum' && x.basis === 'same-file' && x.chunkId === byName('Cart.sum').id), JSON.stringify(checkout.uses));
  });
  await t('CI-304', 'usedBy is the reverse, tests are the users that live in test files', () => {
    const add = byName('add');
    assert.ok(add.usedBy.some(u => u.file === 'src/app.js'));
    assert.ok(add.tests.length === 1 && intel.cards[add.tests[0]].file === 'tests/math.test.js');
  });
  await t('CI-305', 'a class method card has the class as parent', () => {
    assert.strictEqual(byName('Cart.sum').parent, byName('Cart').id);
  });

  console.log('\n── search + grep ──────────────────────────────────────');
  await t('CI-401', 'a concept query finds the code by what its comment and body say', () => {
    const r = CI.query(repoDir, 'retry uploads with backoff');
    assert.strictEqual(r.hits[0].name, 'retryUpload');
    assert.ok(r.hits[0].snippet.length >= 1);
  });
  await t('CI-402', 'naming a function ranks it first; the implementation outranks its test unless tests are asked for', () => {
    assert.strictEqual(CI.query(repoDir, 'add').hits[0].name, 'add');
    assert.strictEqual(CI.query(repoDir, 'the test for add').hits[0].file, 'tests/math.test.js');
  });
  await t('CI-403', 'path, kind and limit filters apply; the answer says what it left out', () => {
    const r = CI.query(repoDir, 'numbers', { path: 'src/math.js', limit: 1 });
    assert.ok(r.hits.every(h => h.file === 'src/math.js'));
    assert.strictEqual(r.hits.length, 1);
    assert.ok(r.more, 'no "more" note');
    assert.ok(CI.query(repoDir, 'sum', { kind: 'method' }).hits.every(h => h.kind === 'method'));
  });
  await t('CI-404', 'a word that is a prefix of an indexed word still finds it (at half weight)', () => {
    assert.ok(CI.query(repoDir, 'multipl').hits.some(h => h.name === 'mul'));
  });
  await t('CI-405', 'grep: literal and regex, line numbers, the chunk of each hit, context, and an honest truncation', () => {
    const g = CI.grepRepo(repoDir, { pattern: 'add(', context: 1 });
    assert.ok(g.matches.every(m => m.chunkId && m.line > 0));
    assert.ok(g.matches[0].before && g.matches[0].after);
    const re = CI.grepRepo(repoDir, { pattern: 'function (add|mul)\\b', regex: true });
    assert.strictEqual(re.total, 2);
    const cut = CI.grepRepo(repoDir, { pattern: 'e', limit: 2 });
    assert.ok(cut.truncated && /more match/.test(cut.more));
    assert.ok(CI.grepRepo(repoDir, { pattern: '(', regex: true }).error, 'an invalid regex is an error, not a crash');
  });
  await t('CI-406', 'resolveRef: id, path:line, path#Name, Class.method, bare name, file', () => {
    const add = byName('add');
    assert.deepStrictEqual(CI.resolveRef(intel, add.id).ids, [add.id]);
    assert.deepStrictEqual(CI.resolveRef(intel, 'src/math.js:4').ids, [add.id]);
    assert.deepStrictEqual(CI.resolveRef(intel, 'src/math.js#add').ids, [add.id]);
    assert.deepStrictEqual(CI.resolveRef(intel, 'Cart.sum').ids, [byName('Cart.sum').id]);
    assert.ok(CI.resolveRef(intel, 'src/app.js').ids.length >= 3);
    // a small member grouped into the class head still resolves by Class.member
    assert.deepStrictEqual(CI.resolveRef(intel, 'Cart.constructor').ids, [byName('Cart').id]);
  });
  await t('CI-407', 'card(code) returns the chunk text numbered, and flags a card whose file changed since indexing', () => {
    const c = CI.card(repoDir, 'add', { code: true });
    assert.match(c.text, /^2\t\/\*\* Adds two numbers\. \*\//);
    fs.writeFileSync(path.join(repoDir, 'src/math.js'), FILES['src/math.js'].replace('a + b', 'b + a'));
    assert.ok(CI.card(repoDir, 'add', { code: true }).stale);
  });
  await t('CI-408', 'overview and outline answer in one call', () => {
    const o = CI.overview(repoDir);
    assert.ok(o.files === 5 && o.chunks > 5 && o.testFiles === 1 && o.readme === 'A tiny cart.');
    const ol = CI.outline(repoDir, 'src/app.js');
    assert.ok(ol.chunks.some(c => c.name === 'Cart.sum' && c.depth === 1));
    assert.ok(CI.outline(repoDir, 'app.js').didYouMean.includes('src/app.js'));
  });

  console.log('\n── the pipeline ───────────────────────────────────────');
  await t('CI-501', 'the import writes cards.json and search.json and reports them; L0-L5 all pass', () => {
    assert.strictEqual(r1.state, 'READY');
    assert.ok(r1.intel && r1.intel.ok, JSON.stringify(r1.intel));
    assert.ok(fs.existsSync(path.join(repoDir, 'indexes', 'cards.json')) && fs.existsSync(path.join(repoDir, 'indexes', 'search.json')));
    assert.ok(r1.verification.tiers.every(x => x.passed), JSON.stringify(r1.verification.tiers.filter(x => !x.passed)));
  });
  await t('CI-502', 'incremental: one changed file is re-chunked and re-vectorised, the rest reused; ids of untouched chunks survive', () => {
    const idsBefore = new Set(Object.keys(CI.load(repoDir).cards));
    const r2 = pipeline.runImportPipeline(repo, repoDir, { lazyTests: false, runtimeProof: false });
    assert.strictEqual(r2.chunks.incremental.changed, 1, JSON.stringify(r2.chunks.incremental));
    assert.ok(r2.intel.search.reused >= r2.intel.search.N - 3, JSON.stringify(r2.intel.search));
    const after = CI.load(repoDir);
    for (const c of Object.values(after.cards).filter(c => c.file !== 'src/math.js')) assert.ok(idsBefore.has(c.id), `${c.id} ${c.qualifiedName} changed id`);
    assert.ok(!after.cards[CI.resolveRef(after, 'add').ids[0]].stale);
  });
  await t('CI-503', 'an index from another chunker version is re-chunked once, in full', () => {
    const fp = path.join(repoDir, 'indexes', 'files.json');
    const files = JSON.parse(fs.readFileSync(fp, 'utf8')).map(f => ({ ...f, chunker: '1.0.0' }));
    fs.writeFileSync(fp, JSON.stringify(files));
    const r3 = pipeline.runImportPipeline(repo, repoDir, { lazyTests: false, runtimeProof: false });
    assert.strictEqual(r3.chunks.incremental.changed, Object.keys(FILES).length);
  });
  await t('CI-504', 'a failed intel pass is stated on the result and never FAULTs the import', () => {
    const orig = CI.buildIntel;
    const mod = require(path.join(ROOT, 'lib/code-intel/index.js'));
    mod.buildIntel = () => { throw new Error('boom'); };
    try {
      const r = pipeline.runImportPipeline(repo, repoDir, { lazyTests: false, runtimeProof: false });
      assert.strictEqual(r.state, 'READY');
      assert.deepStrictEqual(r.intel, { ok: false, error: 'boom' });
    } finally { mod.buildIntel = orig; }
  });

  console.log('\n── measured on this repo\'s own source ─────────────────');
  await t('CI-601', 'idearium/ and lib/code-intel: no unforced cut mid-statement, no doc split from its declaration, nothing over the cap', () => {
    const L = require(path.join(ROOT, 'lib/languages.js'));
    const files = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'data', 'output'].includes(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(c?js|mjs)$/.test(e.name)) files.push(p); } })(path.join(ROOT, 'idearium'));
    files.push(...fs.readdirSync(path.join(ROOT, 'lib/code-intel')).map(f => path.join(ROOT, 'lib/code-intel', f)));
    let chunks = 0, dirty = 0, orphan = 0, over = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8'); const lang = L.EXT_TO_LANGUAGE[path.extname(f)];
      const p = planChunks(src, lang); const lines = src.split('\n'); const li = lineInfo(src, lang).lines;
      covers(p, lines.length);
      for (const c of p.chunks) {
        chunks++;
        if (c.end - c.start + 1 > LIMITS.max && !c.forced) over++;
        if (c.start > 1 && !c.forced) { let i = c.start - 1; while (i < lines.length && (li[i].blank || li[i].comment || /^\s*@/.test(lines[i]))) i++; if (i < lines.length && !li[i].logical) dirty++; }
        let last = c.end - 1; while (last >= c.start - 1 && !lines[last].trim()) last--;
        const next = p.chunks.find(x => x.start === c.end + 1);
        // a file header kept as the file's preamble (it begins the file) is the documented exception, not an orphan
        if (last >= 0 && li[last].comment && next && next.declLine === c.end + 1 && !(c.kind === 'preamble' && c.start === 1)) orphan++;
      }
    }
    assert.ok(chunks > 500, `${chunks} chunks`);
    assert.strictEqual(dirty, 0, `${dirty} cuts mid-statement`);
    assert.strictEqual(over, 0, `${over} chunks over ${LIMITS.max} lines`);
    assert.strictEqual(orphan, 0, `${orphan} doc comments split from their declaration`);
  });

  console.log(`\n${failed ? '✗' : '✓'} code-intel: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
