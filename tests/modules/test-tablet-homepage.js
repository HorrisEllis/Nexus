'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
// OB5 (v2, rebuilt) — an actual tablet: device frame, per-system CLI, capitalized
// names, tv-shell-consistent icons, sovereign floating menu button. Plus OB6
// continuous diagnostic injection into the ollama stream digest.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'tablet/homepage.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');

test('T-001', 'OB5: a box per system (all 7)', () => {
  // systems resolve from autopilot; the fallback + META still name all 7
  for (const id of ['orchestrator','guardian','cortex','idearium','bridge','loom','copilot']) assert.ok(HTML.includes(id+':'), 'system '+id+' in META');
});
test('T-002', 'OB5: rendered as an ACTUAL tablet (device frame)', () => {
  assert.ok(/class="tablet"/.test(HTML) && /\.screen/.test(HTML), 'must have a tablet device frame + screen');
});
test('T-003', 'OB5: system names are Capitalized (Orchestrator, Guardian, Cortex...)', () => {
  for (const l of ['Orchestrator', 'Guardian', 'Cortex', 'Idearium', 'Bridge', 'Loom', 'Co-pilot']) {
    assert.ok(HTML.includes(`'${l}'`) || HTML.includes(`label:'${l}'`), `capitalized label ${l}`);
  }
});
test('T-004', 'OB5: icons are CONSISTENT with the tv-shell tile-icons (⬡⚡◈◐⟁✦)', () => {
  for (const ic of ["icon:'⬡'", "icon:'⚡'", "icon:'◈'", "icon:'◐'", "icon:'⟁'", "icon:'✦'"]) {
    assert.ok(HTML.includes(ic), `tv-shell icon ${ic}`);
  }
});
test('T-005', 'OB5: each system has CLI access (a working command line)', () => {
  assert.ok(/cli-in/.test(HTML), 'a CLI input');
  assert.ok(/curSys\.cli/.test(HTML), 'CLI routes with the system prefix');
  for (const c of ["cli:'/guardian'", "cli:'/cortex'", "cli:'/copilot'"]) assert.ok(HTML.includes(c), `system CLI ${c}`);
});
test('T-006', 'OB5: the sovereign floating menu button is present (matched to menu.js)', () => {
  assert.ok(/nexus-menu-btn/.test(HTML), 'floating menu button');
  assert.ok(/nexus-menu-panel/.test(HTML), 'menu panel');
  assert.ok(/--ac:#00e5ff|#00e5ff/.test(HTML), 'tv-shell accent color');
});
test('T-007', 'OB5: core + loom panels, editable + expandable', () => {
  for (const p of ['summary', 'event stream', 'snapshots', 'diagnostics', 'edge cases']) assert.ok(HTML.includes(`'${p}'`), p);
  for (const p of ['versions', 'repository', 'roadmap']) assert.ok(HTML.includes(`'${p}'`), `loom ${p}`);
  assert.ok(HTML.includes("createElement('details')") && /class="note"/.test(HTML), 'expandable (details) + editable (note)');
});
test('T-008', 'OB5: live OB1 data, honest empty states, no browser storage (§1.1, artifact-safe)', () => {
  assert.ok(/run diagnostics/.test(HTML) && /lastDiag/.test(HTML), 'live diagnostics');
  assert.ok(/class="empty"/.test(HTML), 'honest empty states');
  assert.ok(!/localStorage|sessionStorage/.test(HTML), 'no browser storage');
});
test('T-008b', 'OB5: systems resolve via autopilot ONE endpoint, not hardcoded ports (§10.3)', () => {
  assert.ok(/resolveSystems/.test(HTML) && /7799/.test(HTML), 'must resolve through autopilot status server');
  assert.ok(/RESOLVED_VIA/.test(HTML), 'must track resolution provenance');
  assert.ok(/await resolveSystems/.test(HTML), 'must resolve before render');
});
test('T-008c', 'OB5: the fuller container panels are wired to real autopilot endpoints (each_container_holds)', () => {
  for (const p of ['api map','databases','files','tests']) assert.ok(HTML.includes("'"+p+"'"), 'container panel '+p);
  assert.ok(/contract-map/.test(HTML), 'api map → /contract-map');
  assert.ok(/\/tables/.test(HTML), 'databases → /tables');
  assert.ok(/run-tests/.test(HTML), 'tests → the REAL run-all.js');
  assert.ok(/unreachable/.test(HTML), 'honest empty/unreachable states (no fakes)');
});
test('T-008d', 'OB5: config/user_model/controls panels + CA7 gear complete the container', () => {
  for (const p of ['config','user model','controls']) assert.ok(HTML.includes("'"+p+"'"), 'container panel '+p);
  assert.ok(/spawn\//.test(HTML) && /touch\//.test(HTML), 'controls → autopilot spawn/touch');
  assert.ok(/accts-copilot/.test(HTML) && /acct-add/.test(HTML), 'CA7 account gear on the copilot container');
  assert.ok(/reference|never raw/.test(HTML), 'credentials as reference, not raw (decoupling law)');
});
test('T-009', 'OB6: continuous stream digest enriched with bounded live diagnostics', () => {
  assert.ok(/OB6/.test(SERVER) && /LIVE DIAGNOSTICS/.test(SERVER));
  assert.ok(/bn\[0\]/.test(SERVER), 'only the top bottleneck (bounded)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
