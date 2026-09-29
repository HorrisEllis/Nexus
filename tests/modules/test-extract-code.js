'use strict';
/**
 * tests/modules/test-extract-code.js — lib/extract-code.js.
 *
 * §WRITTEN DURING THE 2026-09-20 MERGE — this module arrived from a
 * parallel line already wired into a real build path
 * (idearium/spec-engine/warp-build-dispatch.js's generate(), gated by
 * chunk.realPath, plus idearium/api/index.js's CODE_EXTENSIONS) with
 * ZERO test coverage anywhere in the tree. A module that decides
 * whether an agent's reply becomes a real file needs its contract
 * pinned, and it needed it more than ever this pass, because the merge
 * consolidated guardian/lib/code-artifact.js's own second fence parser
 * into it. Every one of its five documented reason codes is asserted
 * here so that consolidation cannot have quietly changed the behaviour
 * its existing callers already depend on.
 *
 * The cases marked §FOLDED are the ones the guardian-side extractor had
 * proven and this one did not: indented fences and info-string
 * attributes.
 */

const assert = require('assert');
const { extractCode, LANG_TO_EXT } = require('../../lib/extract-code.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const F = '```';

console.log('\n── the happy path ─────────────────────────────────────────');

t('EC-001 a single fenced block returns code, lang and ext', () => {
  const r = extractCode(`here:\n${F}js\nconst a = 1;\n${F}\ndone`);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.code, 'const a = 1;');
  assert.strictEqual(r.lang, 'js');
  assert.strictEqual(r.ext, '.js');
});

t('EC-002 the single-block convenience fields are always present when ok', () => {
  const r = extractCode(`${F}python\nx = 1\n${F}`);
  assert.ok('code' in r && 'lang' in r && 'ext' in r);
  assert.strictEqual(r.ext, '.py');
  assert.strictEqual(r.blocks.length, 1);
});

t('EC-003 an untagged fence yields lang null and ext null, not a guess', () => {
  const r = extractCode(`${F}\nsomething\n${F}`);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lang, null);
  assert.strictEqual(r.ext, null);
});

t('EC-004 allowMultiple returns every block, in order, with indices', () => {
  const r = extractCode(`${F}js\na\n${F}\ntext\n${F}py\nb\n${F}`, { allowMultiple: true });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.blocks.map(b => b.lang), ['js', 'python'.slice(0, 2)]);
  assert.deepStrictEqual(r.blocks.map(b => b.index), [0, 1]);
});

console.log('\n── every documented failure, by reason code ───────────────');

t('EC-010 no_text', () => {
  assert.strictEqual(extractCode('').reason, 'no_text');
  assert.strictEqual(extractCode(null).reason, 'no_text');
  assert.strictEqual(extractCode('   ').reason, 'no_text');
});

t('EC-011 unclosed_fence — the guard the guardian-side parser lacked', () => {
  const r = extractCode(`${F}js\nconst a = 1;`);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unclosed_fence');
});

t('EC-012 an unclosed fence is NOT silently paired with the next one', () => {
  // The real hazard: three ``` markers. A naive regex pairs 1-2 and
  // returns the prose between them as if it were code.
  const r = extractCode(`${F}js\nreal code\n${F}\nprose\n${F}js\ntruncated`);
  assert.strictEqual(r.reason, 'unclosed_fence');
});

t('EC-013 zero_blocks', () => {
  assert.strictEqual(extractCode('just prose, no fences').reason, 'zero_blocks');
});

t('EC-014 ambiguous_multiple_blocks when allowMultiple is not set', () => {
  const r = extractCode(`${F}js\na\n${F}\n${F}py\nb\n${F}`);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ambiguous_multiple_blocks');
  assert.ok(r.error.includes('allowMultiple'), 'the error should name the way out');
});

t('EC-015 empty_block — a fence containing nothing is a real failure', () => {
  const r = extractCode(`${F}js\n\n${F}`);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'empty_block');
});

t('EC-016 allowEmpty accepts a fenced-but-empty block', () => {
  const r = extractCode(`${F}js\n\n${F}`, { allowEmpty: true });
  assert.strictEqual(r.ok, true);
});

t('EC-017 one real block alongside an empty one is not ambiguous', () => {
  const r = extractCode(`${F}js\nconst a=1;\n${F}\n${F}\n\n${F}`);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.code, 'const a=1;');
});

console.log('\n── §FOLDED from the guardian-side parser ──────────────────');

t('EC-020 an indented fence is still a real fence', () => {
  // Agents emit these constantly — a fenced block nested in a markdown
  // list. The original regex here required column 0 and matched none.
  const r = extractCode(`- step one:\n  ${F}js\n  const a = 1;\n  ${F}`);
  assert.strictEqual(r.ok, true, r.error);
  assert.ok(r.code.includes('const a = 1;'));
});

t('EC-021 an info string with attributes still resolves its language', () => {
  const r = extractCode(`${F}js title="thing.js"\nconst a = 1;\n${F}`);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.lang, 'js');
  assert.strictEqual(r.ext, '.js');
  assert.strictEqual(r.blocks[0].info, 'js title="thing.js"');
});

console.log('\n── the map its callers depend on ─────────────────────────');

t('EC-030 LANG_TO_EXT covers the languages idearium gates code on', () => {
  for (const lang of ['javascript', 'typescript', 'python', 'go', 'rust', 'java']) {
    assert.ok(LANG_TO_EXT[lang], `${lang} missing from LANG_TO_EXT`);
  }
});

t('EC-031 the data/doc entries idearium deliberately excludes are present', () => {
  // idearium/api/index.js builds CODE_EXTENSIONS by FILTERING these out
  // of LANG_TO_EXT. If they ever stop existing here, that filter
  // silently becomes a no-op rather than an exclusion.
  for (const lang of ['json', 'yaml', 'markdown']) {
    assert.ok(LANG_TO_EXT[lang], `${lang} missing — idearium's CODE_EXTENSIONS filter depends on it`);
  }
});

t('EC-032 an unknown language gives ext null rather than a wrong extension', () => {
  const r = extractCode(`${F}brainfuck\n+++\n${F}`);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lang, 'brainfuck');
  assert.strictEqual(r.ext, null);
});

console.log('\n── one extractor, two callers ────────────────────────────');

t('EC-040 guardian/lib/code-artifact.js parses through THIS module', () => {
  // The whole point of the merge. If a second fence regex ever
  // reappears over there, this fails.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../../guardian/lib/code-artifact.js'), 'utf8');
  assert.ok(src.includes("require('../../lib/extract-code.js')"),
    'code-artifact.js no longer delegates to the shared extractor');
  assert.ok(!/const re = \/\^\[ \\t\]\*```/.test(src),
    'a second fence regex has reappeared in code-artifact.js');
});

t('EC-041 both callers agree on the same reply', () => {
  const CA = require('../../guardian/lib/code-artifact.js');
  const reply = `sure:\n${F}js\nmodule.exports = 1;\n${F}`;
  const mine = CA.extractCodeBlocks(reply);
  const theirs = extractCode(reply, { allowMultiple: true });
  assert.strictEqual(mine.length, theirs.blocks.length);
  assert.strictEqual(mine[0].code, theirs.blocks[0].code);
});

t('§0.39.282 split fences (James\'s live ChatGPT reply): every fence empty, the file between them → recovered, both extractors', () => {
  const reply = '```javascript\n```\nmodule.exports = Object.freeze({});\n```\n```';
  const r = extractCode(reply);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.recovered, 'split_fences');
  assert.deepStrictEqual([r.code, r.lang, r.ext], ['module.exports = Object.freeze({});', 'javascript', '.js']);
  const CA = require('../../guardian/lib/code-artifact.js');
  const picked = CA.pickBlock(CA.extractCodeBlocks(reply), { fileName: 'src/kernel/state.js' });
  assert.strictEqual(picked.block && picked.block.code, 'module.exports = Object.freeze({});');
  // two separate runs between empty fences stay ambiguous — never guessed
  assert.strictEqual(extractCode('```js\n```\nA\n```\n```\nB\n```\n```').ok, false);
});

console.log(`\n${fail === 0 ? '✓' : '✗'} extract-code: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
