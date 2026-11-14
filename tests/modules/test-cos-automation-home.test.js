'use strict';
// 0.60.534 SW5i slice a — the automation engine lives in cos/automation/; each old lib/ path forwards there and names it.
// James, 2026-11-14: "migrating brainos backed not the ui its bad the ui and scrapping it"
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function t(id, name, fn) { try { fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}: ${e.message}`); } }
const home = fs.readdirSync(path.join(ROOT, 'cos/automation')).filter(f => f.endsWith('.js'));
const oldOf = f => f === 'nodes.js' ? 'lib/automation-nodes.js' : f === 'registry.js' ? 'lib/automation-registry.js' : 'lib/automation/' + f;
t('AH-01', 'the engine, nodes and registry are in cos/automation/', () => {
  for (const f of ['engine.js', 'pipeline.js', 'routes.js', 'steps.js', 'nodes.js', 'registry.js']) if (!home.includes(f)) throw new Error('missing ' + f);
});
t('AH-02', 'each old path is only a forwarder that names its new home, and gives the same module', () => {
  for (const f of home) {
    const old = oldOf(f), text = fs.readFileSync(path.join(ROOT, old), 'utf8');
    if (!text.includes('cos/automation/' + f)) throw new Error(old + ' does not name cos/automation/' + f);
    if (text.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.includes('use strict')).length !== 1) throw new Error(old + ' holds more than a forward');
    if (require(path.join(ROOT, old)) !== require(path.join(ROOT, 'cos/automation', f))) throw new Error(old + ' gives another module');
  }
});
t('AH-03', "COS's door and pipeline load the engine from cos/automation/, not lib/", () => {
  for (const f of ['cos/manager/automation-door.js', 'cos/pipeline/index.js']) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter(l => /require\(/.test(l)).join('\n');
    if (/lib\/automation/.test(code)) throw new Error(f + ' still requires lib/automation');
  }
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
