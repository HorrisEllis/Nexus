'use strict';
/**
 * tests/modules/test-cos-ui-theme.test.js — COS's look is Idearium's, forked (MG_D11, MOD-MG-UI-THEME). MG18, 0.60.336.
 * James, 2026-10-30: "what about using forking idearium specifically for cos for now … i want it to look beautiful, not cramped, open".
 *   TH-01 every palette, accent and motion rule in cos/ui/core/theme.css's fork equals idearium/ui/css/nexus-theme.css's, token by token
 *   TH-02 the fonts are Idearium's own files, byte for byte, with their licenses
 *   TH-03 changing one token makes TH-01 name it (the check can fail)
 */
const assert = require('assert'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }
const tokens = (raw) => { const css = raw.replace(/\/\*[\s\S]*?\*\//g, ''); const out = new Map(); let sel = '';
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) { sel = m[1].trim().replace(/\s+/g, ' '); for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(`${sel} ${d[1]}`, d[2].trim()); }
  return out; };
const fork = (css) => css.slice(css.indexOf('/* FORK START'), css.indexOf('/* FORK END'));
const diff = (a, b) => { const bad = []; for (const [k, v] of a) if (b.get(k) !== v) bad.push(`${k}: Idearium ${v}, COS ${b.get(k) ?? '(missing)'}`); return bad; };
const ide = fs.readFileSync(path.join(ROOT, 'idearium/ui/css/nexus-theme.css'), 'utf8'), cos = fs.readFileSync(path.join(ROOT, 'cos/ui/core/theme.css'), 'utf8');
console.log('\ntest-cos-ui-theme — COS\'s look is Idearium\'s\n');
test('TH-01', 'every token in the fork equals Idearium\'s', () => { const a = tokens(ide); assert.ok(a.size > 50, `${a.size} tokens read`); const bad = diff(a, tokens(fork(cos))); assert.deepStrictEqual(bad, []); });
test('TH-02', 'the fonts are Idearium\'s files, with their licenses', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'idearium/ui/fonts'))) assert.ok(fs.readFileSync(path.join(ROOT, 'idearium/ui/fonts', f)).equals(fs.readFileSync(path.join(ROOT, 'cos/ui/core/fonts', f))), f);
  assert.ok(fs.readdirSync(path.join(ROOT, 'cos/ui/core/fonts')).filter(f => /^LICENSE-/.test(f)).length === 3);
});
test('TH-03', 'one changed token is named', () => { const bad = diff(tokens(ide), tokens(fork(cos).replace('--nx-ok:     #00ff88', '--nx-ok:     #00ff00'))); assert.ok(bad.length === 1 && /--nx-ok/.test(bad[0]), bad.join('; ')); });
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
