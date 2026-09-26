'use strict';
/**
 * tests/modules/test-ack-injection-fix.js — real, isolated test for the
 * 2026-09-02 fix. James, live: "ack is injecting way to much into chatgpt,
 * the tools are for that exact reason. need the intent map and hats."
 *
 * §ISOLATION — same convention as test-hat-forge.js: writes real rows to
 * an isolated JAA_DATA_DIR, never production data.
 *
 * What this pins:
 *   1. guardian/server.js's createJob() computes a real hat suggestion via
 *      lib/intent-hat-router.js + lib/hat-forge.js when a prompt's verb
 *      confidently maps to a seeded hat.
 *   2. No hat (unclassified prompt) is a real, honest null — not a crash,
 *      not a fabricated default persona.
 *   3. Each userscript's own _buildHatHeader()/_scopedTools() produce the
 *      real short persona + narrowed tool list when a hat is present, and
 *      fall through cleanly (empty string / unfiltered tools) when it's
 *      not — checked by loading the userscript source as text and eval'ing
 *      just those two functions in isolation (the userscripts are browser
 *      code, not requireable Node modules — same constraint every prior
 *      userscript test in this tree works around).
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const vm     = require('vm');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'ack-injection-test-'));
const PRIOR_DIR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

// ── Part 1: real hat suggestion, end to end ─────────────────────────────────
const seed = require(path.join(ROOT, 'lib/hat-seed.js'));
seed.seedHats();
const intentHatRouter = require(path.join(ROOT, 'lib/intent-hat-router.js'));
const hatForge = require(path.join(ROOT, 'lib/hat-forge.js'));

function suggestJobHat(prompt) {
  // Mirrors guardian/server.js's own _suggestJobHat() exactly — that
  // function isn't exported (guardian/server.js is a long-running server
  // module, not designed to be require()'d for its internals), so this
  // pins the same real behavior via the same two real, exported modules
  // it calls.
  const suggestion = intentHatRouter.suggestHat(prompt || '');
  if (!suggestion.suggested) return null;
  const hat = hatForge.get(suggestion.hatName);
  if (!hat) return null;
  return {
    name: hat.name, personaPrompt: hat.personaPrompt || '',
    toolScope: Array.isArray(hat.toolScope) ? hat.toolScope : [],
  };
}

test('ACK-001', 'a build-verb prompt resolves to the_builder with a real persona', () => {
  const hat = suggestJobHat('build a new module for the versionium system');
  assert.ok(hat, 'expected a hat suggestion');
  assert.strictEqual(hat.name, 'the_builder');
  assert.ok(hat.personaPrompt.length > 0);
  assert.ok(hat.toolScope.includes('safe_apply'));
});

test('ACK-002', 'an unclassifiable prompt returns null, not a crash or fabricated default', () => {
  const hat = suggestJobHat('hey');
  assert.strictEqual(hat, null);
});

test('ACK-003', 'a diagnose-verb prompt resolves to the_diagnostician', () => {
  const hat = suggestJobHat('diagnose why the boot is failing');
  assert.ok(hat);
  assert.strictEqual(hat.name, 'the_diagnostician');
});

// ── Part 2: the userscript-side header/scoping functions, in isolation ─────
function loadHatHelpers(userscriptPath) {
  const src = fs.readFileSync(userscriptPath, 'utf8');
  const buildHatHeaderSrc = src.match(/function _buildHatHeader[\s\S]*?\n}\n/);
  const scopedToolsSrc = src.match(/function _scopedTools[\s\S]*?\n}\n/);
  assert.ok(buildHatHeaderSrc, `_buildHatHeader not found in ${userscriptPath}`);
  assert.ok(scopedToolsSrc, `_scopedTools not found in ${userscriptPath}`);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(buildHatHeaderSrc[0] + '\n' + scopedToolsSrc[0] +
    '\nthis._buildHatHeader = _buildHatHeader; this._scopedTools = _scopedTools;', ctx);
  return { buildHatHeader: ctx._buildHatHeader, scopedTools: ctx._scopedTools };
}

for (const provider of ['chatgpt', 'claude', 'gemini', 'perplexity']) {
  const helpers = loadHatHelpers(path.join(ROOT, `guardian/userscript-${provider}.js`));

  test(`ACK-${provider}-01`, `${provider}: _buildHatHeader is empty with no hat`, () => {
    assert.strictEqual(helpers.buildHatHeader(null), '');
  });

  test(`ACK-${provider}-02`, `${provider}: _buildHatHeader produces a short real persona line with a hat`, () => {
    const hdr = helpers.buildHatHeader({ name: 'the_builder', personaPrompt: 'You build, bottom-up.' });
    assert.ok(hdr.includes('the_builder'));
    assert.ok(hdr.includes('You build, bottom-up.'));
    // Real fix: this is dramatically shorter than the old multi-section
    // "[KNOWN FAILURE MODES]...[REUSABLE ARTIFACTS]...[PATTERNS]" blob —
    // pinned as a real upper bound, not just "shorter than before".
    assert.ok(hdr.length < 200, `expected a short persona header, got ${hdr.length} chars`);
  });

  test(`ACK-${provider}-03`, `${provider}: _scopedTools narrows to the hat's real toolScope`, () => {
    const tools = [{ name: 'safe_apply' }, { name: 'unrelated_tool' }, { name: 'read_file' }];
    const hat = { toolScope: ['safe_apply', 'read_file'] };
    const scoped = helpers.scopedTools(tools, hat);
    assert.strictEqual(scoped.length, 2);
    assert.ok(scoped.every(t => hat.toolScope.includes(t.name)));
  });

  test(`ACK-${provider}-04`, `${provider}: _scopedTools falls back to the full list on a real naming mismatch`, () => {
    const tools = [{ name: 'totally_unrelated' }];
    const hat = { toolScope: ['safe_apply'] };
    const scoped = helpers.scopedTools(tools, hat);
    // Honest fallback: zero overlap means "don't silently hand the agent
    // zero tools", not "trust the mismatch and give it nothing".
    assert.strictEqual(scoped.length, 1);
  });

  test(`ACK-${provider}-05`, `${provider}: _scopedTools passes an unscoped tools list through unchanged when there's no hat`, () => {
    const tools = [{ name: 'a' }, { name: 'b' }];
    const scoped = helpers.scopedTools(tools, null);
    assert.strictEqual(scoped, tools);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (PRIOR_DIR === undefined) delete process.env.JAA_DATA_DIR; else process.env.JAA_DATA_DIR = PRIOR_DIR;
process.exitCode = failed ? 1 : 0;
