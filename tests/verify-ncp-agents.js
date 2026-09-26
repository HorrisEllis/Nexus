'use strict';
/**
 * tests/verify-ncp-agents.js — one script, every real NCP/agent fix from
 * this session, run together.
 *
 * James: "all of this worked before it keeps getting brooken." Real,
 * identified cause: a merge (c730bbd) silently reverted an entire prior
 * session's real fixes — files replaced wholesale with older versions,
 * no real conflict resolution. This won't stop that from happening
 * again, but it means it gets CAUGHT in seconds instead of discovered
 * live, mid-conversation, when an agent won't respond.
 *
 * Run this any time — especially right after pulling in a merge, a
 * handoff, or someone else's work — before trusting that NCP/agent
 * dispatch still actually works.
 *
 * Run: node tests/verify-ncp-agents.js
 */
const { execSync } = require('child_process');
const path = require('path');

const SUITES = [
  { file: 'tests/stale-sweep-socket-close.test.js',
    bug: 'guardian forgot stale NCP clients without closing their socket — a disconnected tab never recovered' },
  { file: 'tests/dispatcher-stale-socket.test.js',
    bug: 'guardian silently marked a job "delivered" when the real write reached zero clients — "routes to it, does nothing beyond that"' },
  { file: 'tests/spawn-provider-tab.test.js',
    bug: 'guardian could not tell Clear Glass to spawn/wake a provider tab' },
  { file: 'tests/spec-engine-yaml-import.test.js',
    bug: 'idearium spec-engine crashed on load with the real js-yaml dependency (silent on the wrong version)' },
  { file: 'tests/modules/test-agent-mesh-guardian-coverage.js',
    bug: 'agent-mesh\'s Guardian-first dispatch only ever covered claude/chatgpt, hardcoded — gemini/perplexity silently never got it' },
  { file: 'tests/modules/test-provider-host-respawn.js',
    bug: 'a provider window that closed unexpectedly (crash, memory pressure) never came back — "routes to it, does nothing beyond that"' },
  { file: 'tests/copilot-bridge-direct-dispatch.test.js',
    bug: 'Clear Glass copilot dispatch (prompts, guardian commands, ollama) was still fully routed through bridge\'s dead handshake — every operation silently threw' },
  { file: 'tests/modules/autopilot-status-server-eaddrinuse.test.js',
    bug: 'a port collision on autopilot\'s status server crashed the entire boot (guardian, cortex, everything) over a status-dashboard endpoint' },
  { file: 'tests/modules/copilot-provider-toggle.test.js',
    bug: 'the ollama/guardian provider toggle silently had no effect — copilot\'s /api/prompt never passed the caller\'s chosen provider through to lifeline.route()' },
];

console.log(`Verifying ${SUITES.length} real NCP/agent fixes...`);
console.log('(if the first run after a fresh checkout fails on "Cannot find package",');
console.log(' run npm install first — that\'s a missing dependency, not a regression)\n');

let allPass = true;
const results = [];

for (const { file, bug } of SUITES) {
  process.stdout.write(`  ${file} ... `);
  try {
    execSync(`node ${file}`, { cwd: path.join(__dirname, '..'), stdio: 'pipe', timeout: 30000 });
    console.log('PASS');
    results.push({ file, ok: true });
  } catch (e) {
    console.log('FAIL');
    console.log(`    -> real bug this test catches: ${bug}`);
    const out = (e.stdout || '').toString().trim().split('\n').slice(-5).join('\n    ');
    if (out) console.log(`    -> last output:\n    ${out}`);
    allPass = false;
    results.push({ file, ok: false, bug });
  }
}

console.log('');
if (allPass) {
  console.log(`ALL ${SUITES.length} REAL FIXES VERIFIED INTACT.`);
  console.log('NCP/agent dispatch is in the state it was last confirmed working.');
} else {
  const failed = results.filter(r => !r.ok);
  console.log(`${failed.length} of ${SUITES.length} fixes have REGRESSED:`);
  for (const f of failed) console.log(`  - ${f.file}: ${f.bug}`);
  console.log('\nSomething (a merge, a manual edit, an old checkout) reintroduced a real, already-fixed bug.');
  console.log('Check git log/git blame on the failing file(s) before doing anything else.');
}

process.exit(allPass ? 0 : 1);
