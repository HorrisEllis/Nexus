'use strict';
/**
 * tests/modules/test-phasemap-diagnosis-facts.test.js
 *
 * §BUILT 2026-09-22 — two new phasemaps (docs/2026-09-22-clear-glass-
 * tab-per-repo-and-ui-expansion-phasemap.spec, docs/2026-09-22-brainos-
 * agent-suite-phasemap.spec) cite specific, verified facts about the
 * current codebase as their diagnosis — not from memory, from direct
 * reads at the time of writing. This doesn't re-verify the phasemaps'
 * judgment calls (which phases, what order) — it verifies the FACTS
 * their diagnosis rests on stay true. If they stop being true (someone
 * adds a 6th BrainOS tab, or wires agentId into repo-agent.js), this
 * fails loudly instead of the phasemap silently going stale for whoever
 * reads it next.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(desc, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${desc}`); passed++; }
  else { console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ''}`); failed++; }
}

function main() {
  const CG_PHASEMAP = fs.readFileSync(path.join(ROOT, 'docs', '2026-09-22-clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec'), 'utf8');
  const BR_PHASEMAP = fs.readFileSync(path.join(ROOT, 'docs', '2026-09-22-brainos-agent-suite-phasemap.spec'), 'utf8');

  check('both phasemaps are real, substantial files (not stubs)', CG_PHASEMAP.length > 3000 && BR_PHASEMAP.length > 3000);

  // ── clear-glass phasemap's cited facts ───────────────────────────────
  const REPO_AGENT = fs.readFileSync(path.join(ROOT, 'lib', 'repo-agent.js'), 'utf8');
  // §UPDATE 2026-09-22 — TR1 (originally diagnosed as "zero agentId
  // references") shipped for real (commit 838d3c8/c270920, closed in the
  // phasemap's own closed_2026_09_22 section) — this check now verifies
  // the CLOSURE stays real, inverted from its original "still a gap"
  // form rather than deleted, so a regression here is still caught.
  check('lib/repo-agent.js now derives a real, repo-scoped agentId on dispatch — TR1\'s real, closed fix (was: zero agentId references at all)',
    /agentId\s*=\s*`repo-\$\{repo\.uuid\}`|agentId:\s*`repo-\$\{repo\.uuid\}`|repo-\$\{repo\.uuid\}/.test(REPO_AGENT) ||
    // 0.39.241 — moved into agentIdFor(repoUuid), used by dispatch and the late-reply lookup alike
    (/payload\.agentId = agentIdFor\(repo\.uuid\)/.test(REPO_AGENT) && /return `repo-\$\{repoUuid\}`/.test(REPO_AGENT)));
  const CG_MAIN = fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'main', 'index.js'), 'utf8');
  check('clear-glass\'s windows Map is still keyed by agentId — the mechanism TR1 relies on already existing',
    /windows\.set\(agentId, win\)/.test(CG_MAIN));
  check('clear-glass genuinely has no top-level index.html — the literal fact behind "almost none of it is here in the index.html file"',
    !fs.existsSync(path.join(ROOT, 'clear-glass', 'index.html')) && !fs.existsSync(path.join(ROOT, 'clear-glass', 'renderer', 'index.html')));
  check('response-sink.js\'s downloads sink is real and already wired (so UI2 is scoped as a small polish, not a rebuild)',
    /postToDownloads/.test(fs.readFileSync(path.join(ROOT, 'guardian', 'lib', 'response-sink.js'), 'utf8')) &&
    /kind:\s*'chat'/.test(fs.readFileSync(path.join(ROOT, 'clear-glass', 'src', 'downloads', 'artifact-chat-index.js'), 'utf8')));

  // ── brainos phasemap's cited facts ────────────────────────────────────
  const BRAINOS_HTML = fs.readFileSync(path.join(ROOT, 'ui', 'brainos', 'index.html'), 'utf8');
  const tabs = [...BRAINOS_HTML.matchAll(/data-tab="([a-z-]+)"/g)].map(m => m[1]);
  check('BrainOS still has exactly the 5 tabs the phasemap diagnosed (canvas/deploy/bayes/pipeline/automation) — none of the 8 named systems',
    new Set(tabs).size === 5 && ['canvas', 'deploy', 'bayes', 'pipeline', 'automation'].every(t => tabs.includes(t)));
  check('none of the 5 real BrainOS tabs are named for any of the 8 systems James asked for (copilot/ollama/guardian/hats/tools/injection/module-manager/reader)',
    !tabs.some(t => /copilot|ollama|guardian|hat|tool|inject|module|reader/.test(t)));

  check('lib/hat-forge.js still has zero UI callers — HT1\'s whole premise', !fs.existsSync(path.join(ROOT, 'ui')) ||
    (() => {
      const uiFiles = [];
      const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js') || f.name.endsWith('.html')) uiFiles.push(p);
      } };
      walk(path.join(ROOT, 'ui'));
      return uiFiles.every(f => !fs.readFileSync(f, 'utf8').includes('hat-forge'));
    })());

  check('copilot/lib/inject-config.js is real and still has zero UI callers — IJ1\'s whole premise',
    fs.existsSync(path.join(ROOT, 'copilot', 'lib', 'inject-config.js')) &&
    (() => {
      const uiFiles = [];
      const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p); else if (f.name.endsWith('.js') || f.name.endsWith('.html')) uiFiles.push(p);
      } };
      walk(path.join(ROOT, 'ui'));
      return uiFiles.every(f => !fs.readFileSync(f, 'utf8').includes('inject-config') && !fs.readFileSync(f, 'utf8').includes('inject_rule'));
    })());

  check('the real .injection node type still exists and is distinct from inject_rule — both named correctly in the phasemap, not conflated',
    fs.existsSync(path.join(ROOT, 'copilot', 'data', 'nodes', 'inject_rule')) || /inject_rule/.test(fs.readFileSync(path.join(ROOT, 'copilot', 'lib', 'inject-config.js'), 'utf8')));

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
