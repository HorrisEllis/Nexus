'use strict';
// tests/modules/test-raid-input.test.js — RD9 slice a: an input to RAID is a .input node before it is routed; the decision is written back.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const RI = require('../../cortex/core/raid/input.js'); const NE = require('../../lib/node-export.js');
(async () => {
  let p = 0, f = 0; const t = async (id, d, fn) => { try { await fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-in-'));
  await t('RI-01', 'kept as a .input node before RAID decides; the decision and its why written back', async () => {
    let seenBefore = null;
    const r = await RI.take({ text: 'build the next phase', from: 'cli', by: 'person' }, { dir, decide: async (intent, env) => { seenBefore = NE.fromYaml(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8')).payload; return { provider: 'idearium', why: 'a build request' }; } });
    assert.ok(r.ok); assert.strictEqual(seenBefore.text, 'build the next phase'); assert.strictEqual(seenBefore.decision, null, 'on disk before the decision');
    const n = NE.fromYaml(fs.readFileSync(r.file, 'utf8')); assert.strictEqual(n.type, 'input');
    assert.strictEqual(n.payload.decision.provider, 'idearium'); assert.strictEqual(n.payload.decision.why, 'a build request'); assert.strictEqual(n.payload.from, 'cli'); assert.ok(n.payload.envelopeId);
  });
  await t('RI-02', 'RAID failing to decide keeps the input, said; no words or no asker is refused; listed newest first', async () => {
    const r = await RI.take({ text: 'x', by: 'agent:a' }, { dir, decide: async () => { throw new Error('down'); } });
    assert.ok(r.ok); assert.match(r.decision.error, /could not decide: down/);
    assert.strictEqual((await RI.take({ text: ' ', by: 'person' }, { dir })).code, 400); assert.strictEqual((await RI.take({ text: 'y' }, { dir })).code, 400);
    const l = RI.list({ dir }); assert.strictEqual(l.length, 2); assert.strictEqual(l[0].text, 'x');
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
