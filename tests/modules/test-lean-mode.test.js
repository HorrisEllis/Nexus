'use strict';
/**
 * tests/modules/test-lean-mode.test.js — 0.60.20 — lean mode, one switch in Idearium.
 * James: "start lean? why not just have that a toggle? i want to test it now" · "idearium for the lean toggle".
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
console.log('\ntest-lean-mode\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-lean-'));
const prev = process.env.NEXUS_DATA_ROOT;
process.env.NEXUS_DATA_ROOT = tmp;
try {
  const LM = require(path.join(ROOT, 'lib/lean-mode.js'));
  check('LM-01 off when nothing is saved; the held list never includes what a build needs',
    LM.read().on === false && !LM.HOLD.some(n => ['idearium', 'copilot', 'guardian', 'ollama-bridge', 'versionium', 'clear-glass', 'cortex', 'orchestrator'].includes(n)));
  LM.write(true, { by: 'test' });
  check('LM-02 on is saved where the supervisor reads it at boot', LM.read().on === true && fs.existsSync(path.join(tmp, 'autopilot-boot.json')));
  LM.write(false);
  check('LM-03 off again', LM.read().on === false);
  const ap = fs.readFileSync(path.join(ROOT, 'nexus/autopilot.js'), 'utf8');
  check('LM-04 npm run start:all honours it: held services are never spawned at boot, and stay startable', /lean-mode\.js'\)\)\.read/.test(ap) && /_phasePlan\(KERNELS\.filter\(k => !held\.has\(k\.name\)\)\)/.test(ap) && /status = 'held'/.test(ap));
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
  const cmd = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
  check('LM-05 one switch: the route stops/starts them through the supervisor, Settings shows it, every agent has the command',
    /\['api','system','lean'\]/.test(api) && /\/control\/\$\{encodeURIComponent\(n\)\}\/\$\{on \? 'stop' : 'start'\}/.test(api) && /id="lean-card"/.test(ui) && /data-lean=/.test(ui) && cmd.includes("key: 'system.lean'"));
  check('LM-06 a phase build is never reworded first', /!\/\^phrun-\/\.test\(String\(session \|\| ''\)\)/.test(fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8')));
  check('LM-07 a rejected agent proposal is said to the agent in its chat (no run left waiting on a tool result)',
    /_tellAgentRejected\(repo, r\.inject/.test(api) && /was REJECTED by James/.test(api) && /body\.tell !== false/.test(api));
} catch (e) { fail++; console.log(`  ✗ threw: ${e.stack}`); }
finally { if (prev === undefined) delete process.env.NEXUS_DATA_ROOT; else process.env.NEXUS_DATA_ROOT = prev; fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
