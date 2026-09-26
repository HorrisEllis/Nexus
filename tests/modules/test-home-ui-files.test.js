'use strict';
/**
 * tests/modules/test-home-ui-files.test.js — v0.39.228
 * James: "should have had the ui aspects separate files, including css file per ui file."
 * Enforces it for the NEXUS home UI (ui/home/index.html), same rule as
 * test-cg-settings-ui-files does for Clear Glass Settings:
 *   - index.html holds markup only: no inline <script> body, no <style> block
 *   - one CSS file per area JS file under ui/home/areas/, no orphans either way
 *   - everything index.html links under /ui/home exists, and every areas/ and
 *     core/ file is linked exactly once
 *   - core/logging.js loads first (selectMode() calls _logToData at load when a
 *     mode is stored; before 0.39.228 that threw on _uiLog's TDZ and halted the
 *     rest of the page — no health polling, no SSE)
 *   - ownership: the shared home.css names no channel; an area stylesheet names
 *     no other area's channel
 * Each rule is also run against a mutated copy to prove it catches its violation.
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const { homeLinks, ROOT, INDEX } = require('../helpers/home-page-source');
const HOME = path.join(ROOT, 'ui/home');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }
const list = dir => fs.readdirSync(path.join(HOME, dir)).sort();
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ── rules (pure: input → throws on violation) ────────────────────────────────
function ruleMarkupOnly(html) {
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim());
  assert.strictEqual(inline.length, 0, `index.html has ${inline.length} inline <script> block(s)`);
  assert.ok(!/<style[\s>]/.test(html), 'index.html has a <style> block');
}
function rulePairs(files) {
  const js = files.filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  const css = files.filter(f => f.endsWith('.css')).map(f => f.slice(0, -4));
  assert.deepStrictEqual(css, js, `areas without a CSS pair: [${js.filter(a => !css.includes(a))}]; CSS without JS: [${css.filter(a => !js.includes(a))}]`);
}
function ruleLinked(links, onDisk) {
  for (const u of links) assert.ok(fs.existsSync(path.join(ROOT, u.slice(1))), `linked but missing: ${u}`);
  for (const f of onDisk) {
    const n = links.filter(u => u === `/ui/home/${f}`).length;
    assert.strictEqual(n, 1, `/ui/home/${f} is linked ${n} times (expected exactly 1)`);
  }
}
function ruleLoggingFirst(links) {
  const scripts = links.filter(u => u.endsWith('.js'));
  assert.strictEqual(scripts[0], '/ui/home/core/logging.js', `first /ui/home script is ${scripts[0]}`);
}
function channelIds(css) { return [...stripComments(css).matchAll(/#ch-([a-z][a-z-]*)/g)].map(m => m[1]); }
function ruleSharedNamesNoChannel(sharedCss) {
  const ids = channelIds(sharedCss).filter(id => !['rail', 'rail-wrap', 'name', 'accent'].includes(id));
  assert.deepStrictEqual(ids, [], `home.css names channel(s): ${ids.join(', ')}`);
}
function ruleAreaOwnsOnlyItsChannel(area, css, areaNames) {
  // An area stylesheet may name its own channel; naming another area's channel is a leak.
  const foreign = channelIds(css).filter(id => id !== area && areaNames.includes(id));
  assert.deepStrictEqual(foreign, [], `areas/${area}.css styles another area's channel: #ch-${foreign.join(', #ch-')}`);
}

// ── inputs ────────────────────────────────────────────────────────────────────
const html = fs.readFileSync(INDEX, 'utf8');
const links = homeLinks(html);
const areaFiles = list('areas');
const areaNames = areaFiles.filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
const onDisk = [...areaFiles.map(f => `areas/${f}`), ...list('core').map(f => `core/${f}`)];
const shared = fs.readFileSync(path.join(HOME, 'home.css'), 'utf8');

console.log('\n\u2B21  HOME UI FILES — one JS + one CSS per area\n');
test('HF-01', 'index.html is markup only: no inline script body, no <style>', () => ruleMarkupOnly(html));
test('HF-02', 'one CSS file per area JS file, no orphans', () => { rulePairs(areaFiles); assert.ok(areaNames.length >= 20, `only ${areaNames.length} areas`); });
test('HF-03', 'every linked /ui/home file exists; every areas/ + core/ file linked exactly once', () => ruleLinked(links, onDisk));
test('HF-04', 'core/logging.js is the first /ui/home script (stored-mode boot regression)', () => ruleLoggingFirst(links));
test('HF-05', 'shared home.css names no channel', () => ruleSharedNamesNoChannel(shared));
test('HF-06', 'each area stylesheet styles no other area\u2019s channel', () => {
  for (const a of areaNames) ruleAreaOwnsOnlyItsChannel(a, fs.readFileSync(path.join(HOME, 'areas', `${a}.css`), 'utf8'), areaNames);
});
test('HF-07', 'every area stylesheet is non-empty and balanced', () => {
  for (const a of areaNames) {
    const c = stripComments(fs.readFileSync(path.join(HOME, 'areas', `${a}.css`), 'utf8'));
    assert.ok(/\{/.test(c), `areas/${a}.css has no rules`);
    assert.strictEqual((c.match(/\{/g) || []).length, (c.match(/\}/g) || []).length, `areas/${a}.css braces unbalanced`);
  }
});

// ── mutations: each rule must catch its violation ────────────────────────────
const catches = (fn) => { try { fn(); return false; } catch (_) { return true; } };
test('HF-M1', 'mutation: an inline script added to index.html is caught', () => assert.ok(catches(() => ruleMarkupOnly(html.replace('</body>', '<script>boot()</script></body>')))));
test('HF-M2', 'mutation: an inline <style> added is caught', () => assert.ok(catches(() => ruleMarkupOnly(html.replace('</head>', '<style>.x{}</style></head>')))));
test('HF-M3', 'mutation: an area JS with no CSS pair is caught', () => assert.ok(catches(() => rulePairs([...areaFiles, 'orphan.js']))));
test('HF-M4', 'mutation: an unlinked area file is caught', () => assert.ok(catches(() => ruleLinked(links.filter(u => u !== '/ui/home/areas/causal.js'), onDisk))));
test('HF-M5', 'mutation: logging.js moved after another script is caught', () => {
  const moved = links.filter(u => u !== '/ui/home/core/logging.js'); moved.push('/ui/home/core/logging.js');
  assert.ok(catches(() => ruleLoggingFirst(moved)));
});
test('HF-M6', 'mutation: a channel rule put back in home.css is caught', () => assert.ok(catches(() => ruleSharedNamesNoChannel(shared + '\n#ch-guardian.active{display:flex}'))));
test('HF-M7', 'mutation: guardian.css styling the cortex channel is caught', () => assert.ok(catches(() => ruleAreaOwnsOnlyItsChannel('guardian', '#ch-cortex .x{}', areaNames))));

console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
process.exit(failed ? 1 : 0);
