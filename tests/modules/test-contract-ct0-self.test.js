'use strict';
/**
 * tests/modules/test-contract-ct0-self.test.js — 0.60.15 — his fourth acceptance condition: "CT0 must run through its own
 * contract pipeline, and its completion must be established by the evaluator rather than declared by the agent
 * implementing it." docs/contracts/ct0-executable-contracts.contract was run gate by gate with `contract check`; this
 * reads its recorded evidence against the files as they are now.
 *   Fails if the evaluator or its tests changed since CT0 passed (re-run: idearium contract check <file> verify …).
 *   Only warns when a shared file it references (route-commands.js, the phasemap) moved on — that is invalidation
 *   working, and is said, not hidden.
 */
require('../../lib/test-sandbox.js').ensure();
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const C = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const L = C.load(path.join(ROOT, 'docs/contracts/ct0-executable-contracts.contract'));
const ev = C.evaluate(JSON.parse(JSON.stringify(L.payload)), { root: ROOT });
console.log('\ntest-contract-ct0-self\n');
const core = ['evaluator', 'tests'];
const coreStale = ev.stale.filter(r => core.includes(r));
const recorded = Object.values(L.payload.state.gates || {}).every(g => g.status === 'PASSED' && (g.evidence || []).length);
let fail = 0;
if (!(L.v === 2 && C.validate(L.payload).length === 0 && recorded)) { fail++; console.log('  ✗ CT0-01 CT0 is a valid v2 contract whose every gate was passed with recorded evidence'); }
else console.log('  ✓ CT0-01 CT0 is a valid v2 contract whose every gate was passed with recorded evidence');
if (ev.complete) console.log('  ✓ CT0-02 complete — by the evaluator, against the current files');
else if (coreStale.length) { fail++; console.log(`  ✗ CT0-02 the evaluator or its tests changed since CT0 passed (${coreStale.join(', ')}): re-run its gates — ${ev.why.join('; ')}`); }
else console.log(`  ✓ CT0-02 the core is unchanged; shared refs moved on (${ev.stale.join(', ')}) — CT0 reads STALE for those, as it should`);
console.log(`\n${2 - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
