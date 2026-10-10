'use strict';
/**
 * tests/modules/test-provider-lists.test.js — 0.59.1. James: "deepseek is absent."
 * The browser agents are the guardian userscripts (lib/agent-providers.js guardianProviders — one source). DeepSeek was
 * absent because ten places kept their own hard-coded list without it (the copilot picker, menu.js, lifeline, RAID's
 * routing IR, agent-chat, the tool-node generator, guardian's /providers fallback, cockpit). This finds every list
 * literal in the tree that names three or more browser agents and fails when it misses one — the next agent added
 * cannot go missing the same way. A deliberate subset (a hat's allowed agents, a build chain) is marked on its line with
 * `provider-list: chosen`; comments are history and are skipped.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { guardianProviders } = require(path.join(ROOT, 'lib/agent-providers.js'));

const SKIP = /(^|\/)(node_modules|data|_archive|tests|\.git|loom\/data)(\/|$)|\.deprecated$|\.pre-[a-z-]+\.js$/;
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(js|cjs|mjs|html)$/.test(e.name)) yield rel;
  }
}

const agents = guardianProviders();
let failed = 0;
try {
  assert.ok(agents.includes('deepseek') && agents.includes('gemini'), `guardianProviders() is ${agents}`);
  const misses = [];
  for (const rel of walk(ROOT)) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/\[\s*((?:['"][a-z-]+['"]\s*,\s*)+['"][a-z-]+['"])\s*,?\s*\]/g)) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1, lineEnd = src.indexOf('\n', m.index);
      const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;            // a comment (history), not a list in use
      if (/provider-list: chosen/.test(line)) continue;           // a deliberate subset, marked where it is chosen
      const names = [...m[1].matchAll(/['"]([a-z-]+)['"]/g)].map(x => x[1]);
      const named = names.filter(n => agents.includes(n));
      if (named.length < 3) continue;   // two or fewer is a choice (a hat's allowed agents), not "the list of agents"
      const missing = agents.filter(a => !names.includes(a));
      if (missing.length) misses.push(`${rel}:${src.slice(0, m.index).split('\n').length} names ${named.join(', ')} but not ${missing.join(', ')}`);
    }
  }
  assert.deepStrictEqual(misses, [], `a hard-coded list of browser agents misses one — use lib/agent-providers.js guardianProviders() (or name them all):\n  ${misses.join('\n  ')}`);
  console.log(`  ✓ PL-01 every list of browser agents in the tree names all ${agents.length} (${agents.join(', ')})`);
} catch (e) { failed++; console.error(`  ✗ PL-01 every list of browser agents names them all\n    ${e.message}`); }
console.log(`\n${1 - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
