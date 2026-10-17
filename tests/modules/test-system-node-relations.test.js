'use strict';
// SN-R1..R4 (0.60.129 DB18): a system's nodes, Guardian's shape, in relation to the system they are for.
// James, 2026-10-17: "the data nodes should reflect guardians nodes but in relation to the system they are for."
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
require('../../lib/test-sandbox.js').ensure();
const SN = require('../../lib/system-nodes.js');
const NX = require('../../lib/node-export.js');
let passed = 0, failed = 0; const tests = [];
const test = (n, f) => tests.push([n, f]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snr-root-'));
const put = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), txt); };
put('alpha/registry-components.js', "module.exports = [{ id: 'alpha.ping', namespace: 'alpha', name: 'ping', version: '1.0.0', route: { method: 'GET', path: '/ping' } }];\n");
put('alpha/a.js', "require('../beta/b.js'); require('../beta/c.js'); require('../lib/k.js');\n");
put('beta/registry-components.js', "module.exports = [];\n");
put('beta/b.js', "module.exports = 1;\n"); put('beta/c.js', "module.exports = 2;\n");
put('lib/k.js', "module.exports = 0;\n");

test('SN-R1 every node names its system (meta.system), not only the folder it sits in', () => {
  const n = SN.plan('alpha', root);
  assert.ok(n.length >= 3);
  for (const x of n) assert.strictEqual(x.meta.system, 'alpha', `${x.type}/${x.id}`);
});
test('SN-R2 a .wire per system it depends on, with the file edges behind it and the kind', () => {
  const w = SN.plan('alpha', root).filter(x => x.type === 'wire');
  const beta = w.find(x => x.payload.to === 'beta');
  assert.ok(beta && beta.payload.kind === 'system' && beta.payload.edges === 2);
  assert.deepStrictEqual(beta.payload.files.map(f => f.to).sort(), ['beta/b.js', 'beta/c.js']);
  assert.ok(w.find(x => x.payload.to === 'lib' && x.payload.kind === 'kernel'));
});
test('SN-R3 the .system node holds both directions: what it depends on, who consumes it', () => {
  const a = SN.plan('alpha', root).find(x => x.type === 'system').payload;
  const b = SN.plan('beta', root).find(x => x.type === 'system').payload;
  assert.ok(a.depends_on.some(d => d.system === 'beta' && d.edges === 2));
  assert.ok(b.consumed_by.some(d => d.system === 'alpha' && d.edges === 2));
});
test('SN-R4 sync writes them as Guardian-shaped envelopes in <system>/data/nodes/wire, and archives a wire that no longer holds', () => {
  const r = SN.sync({ root, agents: false });
  assert.ok(r.ok, JSON.stringify(r.errors));
  const f = path.join(root, 'alpha/data/nodes/wire/alpha--beta.wire');
  const doc = NX.importFromFile(f);
  assert.deepStrictEqual([doc.envelope, doc.type, doc.id, doc.system], [1, 'wire', 'alpha--beta', 'alpha']);
  put('alpha/a.js', "require('../lib/k.js');\n");
  const r2 = SN.sync({ root, agents: false });
  assert.ok(!fs.existsSync(f) && r2.systems.alpha.archived >= 1, 'the old wire is archived, not deleted');
  assert.ok(fs.readdirSync(path.join(root, 'alpha/data/nodes/_archive/wire')).some(x => x.startsWith('alpha--beta.')));
});

(async () => {
  for (const [n, f] of tests) { try { await f(); passed++; console.log(`  ✓ ${n}`); } catch (e) { failed++; console.log(`  ✗ ${n}\n    ${e.message}`); } }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
