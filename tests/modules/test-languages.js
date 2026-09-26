'use strict';
/**
 * tests/modules/test-languages.js — lib/languages.js, the one language
 * table, and the three tables now derived from it.
 *
 * §WHY — four independently-maintained language tables existed
 * (lib/extract-code.js, guardian/lib/code-artifact.js,
 * idearium/repo/import-pipeline.js, and idearium/repo/graph.js's per-
 * family regexes). Measured drift before consolidating: code-artifact.js
 * knew 14 extensions extract-code.js did not, so the SAME agent reply
 * resolved to a real extension on guardian's path and `ext: null` on
 * idearium's. The consolidation is only worth anything if it stays
 * consolidated, so the tests that matter most here are the DERIVATION
 * tests at the bottom — they fail the moment a second table reappears.
 */

const assert = require('assert');
const L = require('../../lib/languages.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\n── resolution ─────────────────────────────────────────────');

t('LG-001 a canonical name resolves to itself', () => {
  assert.strictEqual(L.normalize('python'), 'python');
  assert.strictEqual(L.normalize('rust'), 'rust');
});

t('LG-002 every alias resolves to its canonical language', () => {
  const cases = { js: 'javascript', node: 'javascript', ts: 'typescript', py: 'python',
    rb: 'ruby', golang: 'go', rs: 'rust', 'c++': 'cpp', 'c#': 'csharp', kt: 'kotlin',
    sh: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown', ps1: 'powershell' };
  for (const [alias, want] of Object.entries(cases)) {
    assert.strictEqual(L.normalize(alias), want, `${alias} -> ${L.normalize(alias)}, wanted ${want}`);
  }
});

t('LG-003 case and whitespace do not matter', () => {
  assert.strictEqual(L.normalize('  JS  '), 'javascript');
  assert.strictEqual(L.normalize('Python'), 'python');
});

t('LG-004 an unknown language is KEPT lowercased, not discarded', () => {
  // "said brainfuck" must not become "said nothing" (§1.2).
  assert.strictEqual(L.normalize('Brainfuck'), 'brainfuck');
  assert.strictEqual(L.normalize(''), null);
  assert.strictEqual(L.normalize(null), null);
});

t('LG-005 extensions resolve, with or without the dot', () => {
  assert.strictEqual(L.forExtension('.rs'), 'rust');
  assert.strictEqual(L.forExtension('rs'), 'rust');
  assert.strictEqual(L.forExtension('.CC'), 'cpp');
  assert.strictEqual(L.forExtension('.nope'), null);
});

t('LG-006 a file name resolves through its extension', () => {
  assert.strictEqual(L.forFileName('src/lib/a.swift'), 'swift');
  assert.strictEqual(L.forFileName('Makefile'), null);
});

t('LG-007 extFor returns the PRIMARY extension, never a guess', () => {
  assert.strictEqual(L.extFor('js'), '.js');
  assert.strictEqual(L.extFor('javascript'), '.js');
  assert.strictEqual(L.extFor('cpp'), '.cpp');
  assert.strictEqual(L.extFor('brainfuck'), null);
});

console.log('\n── the 14 extensions that were drifting ──────────────────');

t('LG-010 every extension the two tables disagreed on now resolves', () => {
  // The measured drift, pinned so it cannot silently reopen.
  const drifted = ['.mjs', '.cjs', '.h', '.cc', '.php', '.swift', '.kt',
    '.bash', '.ps1', '.scss', '.yml', '.toml', '.xml', '.spec'];
  for (const ext of drifted) {
    assert.ok(L.forExtension(ext), `${ext} resolves to nothing`);
  }
});

console.log('\n── code vs data vs doc ───────────────────────────────────');

t('LG-020 source languages are code', () => {
  for (const l of ['javascript', 'python', 'rust', 'go', 'swift', 'php', 'bash']) {
    assert.strictEqual(L.isCode(l), true, `${l} not code`);
  }
});

t('LG-021 data and docs are NOT code', () => {
  // idearium's dispatch path assumes "one clean fenced block" only for
  // code. A data file or a doc is far more likely to arrive unfenced or
  // wrapped in prose — that is a property of the language, not a list.
  for (const l of ['json', 'yaml', 'toml', 'xml', 'csv', 'markdown', 'text']) {
    assert.strictEqual(L.isCode(l), false, `${l} was treated as code`);
  }
});

t('LG-022 codeExtensions() excludes every data/doc extension', () => {
  const code = L.codeExtensions();
  for (const ext of ['.json', '.yaml', '.yml', '.md', '.markdown', '.toml', '.xml', '.csv', '.txt', '.spec']) {
    assert.ok(!code.has(ext), `${ext} leaked into codeExtensions()`);
  }
  for (const ext of ['.js', '.py', '.rs', '.swift']) {
    assert.ok(code.has(ext), `${ext} missing from codeExtensions()`);
  }
});

t('LG-023 familyOf is honest about languages with no extractor', () => {
  assert.strictEqual(L.familyOf('javascript'), 'javascript');
  assert.strictEqual(L.familyOf('kotlin'), 'jvm');
  assert.strictEqual(L.familyOf('c'), 'c');
  // No reference extractor claims these. null is the honest answer —
  // claiming a family would imply extraction that does not happen.
  assert.strictEqual(L.familyOf('swift'), null);
  assert.strictEqual(L.familyOf('lua'), null);
});

console.log('\n── DERIVATION: the consolidation must stay consolidated ───');

t('LG-030 lib/extract-code.js derives LANG_TO_EXT from this table', () => {
  const { LANG_TO_EXT } = require('../../lib/extract-code.js');
  for (const alias of Object.keys(L.ALIAS_TO_LANGUAGE)) {
    const want = L.extFor(alias);
    if (want) assert.strictEqual(LANG_TO_EXT[alias], want, `${alias} disagrees`);
  }
});

t('LG-031 guardian/lib/code-artifact.js derives its two tables from it', () => {
  const CA = require('../../guardian/lib/code-artifact.js');
  assert.strictEqual(CA.SYNTAX_BY_EXT, L.EXT_TO_LANGUAGE, 'SYNTAX_BY_EXT is a separate object again');
  assert.strictEqual(CA.SYNTAX_ALIASES, L.ALIAS_TO_LANGUAGE, 'SYNTAX_ALIASES is a separate object again');
});

t('LG-032 no consumer holds a hand-written language map any more', () => {
  const fs = require('fs'), path = require('path');
  const R = path.join(__dirname, '../..');
  // A literal `'.xx': 'lang'` map is the shape every one of the four
  // drifting tables had. If one reappears in a consumer, this fails.
  for (const rel of ['lib/extract-code.js', 'guardian/lib/code-artifact.js', 'idearium/repo/import-pipeline.js']) {
    const src = fs.readFileSync(path.join(R, rel), 'utf8');
    assert.ok(src.includes('languages.js'), `${rel} no longer references the shared table`);
    const literalMap = /'\.(js|py|rs|go)':\s*'[a-z]+'/.test(src);
    assert.ok(!literalMap, `${rel} has grown its own extension map again`);
  }
});

t('LG-033 the three consumers agree on the same file, end to end', () => {
  const { LANG_TO_EXT } = require('../../lib/extract-code.js');
  const CA = require('../../guardian/lib/code-artifact.js');
  // The exact failure that motivated all of this: one reply, two paths.
  for (const [tag, ext] of [['swift', '.swift'], ['kt', '.kt'], ['php', '.php'], ['c++', '.cpp']]) {
    assert.strictEqual(LANG_TO_EXT[tag], ext, `extract-code disagrees on ${tag}`);
    assert.strictEqual(CA.normalizeSyntax(tag), L.normalize(tag), `code-artifact disagrees on ${tag}`);
    assert.strictEqual(CA.syntaxForFileName(`a${ext}`), L.forExtension(ext), `round trip broken for ${ext}`);
  }
});

t('LG-034 the table actually grew — this was meant to expand coverage', () => {
  assert.ok(Object.keys(L.LANGUAGES).length >= 40, 'fewer languages than expected');
  assert.ok(L.allExtensions().size >= 60, 'fewer extensions than expected');
});

console.log(`\n${fail === 0 ? '✓' : '✗'} languages: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
