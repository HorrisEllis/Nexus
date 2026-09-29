'use strict';
/**
 * tests/modules/test-config-governance.js — pins TABLET T3 change
 * governance (docs/nexus-tablet.spec phase T3).
 *
 * T3 gate, verbatim: "a config change is written to the ledger with CFR
 * conditions stamped, projected to the registry, scored by sigma, and an
 * anomalous one raises friction."
 *
 * Every step is proven against the REAL modules — the real CFR ledger, the
 * real component-ledger, the real cortex/self-heal/escalation.js. Nothing
 * here mocks the pipeline it claims to verify (§1.3): the friction step in
 * particular wires the actual escalation module to a real bus and asserts a
 * real escalation.friction.increased event with its real payload shape
 * ({faultClass, newFric, band, count, cause, anomalyUuid} — read off a
 * live emit, not guessed).
 *
 * Anomaly forcing note: anomalousness is triggered by lowering the
 * threshold per-call, NOT by injecting a fake sigma score. A fabricated
 * score would test the branch while proving nothing about whether real
 * sigma output can ever reach it.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const { recordConfigChange, ANOMALY_SIGMA } = require('../../lib/config-governance.js');
const { createCFRLedger } = require('../../intelligence/cfr/ledger.js');

// Collision-proof system name so the canonical tree write can never touch
// a real system's ledger, and is removable at the end.
const SYS = `cfggov-${Date.now()}`;
const CANON_DIR = path.join(process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data'), 'ledger', SYS);   // §0.39.282 lib/component-ledger.js follows the data root

function freshCfrLedger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfggov-'));
  const l = createCFRLedger({ ledgerDir: dir, systemId: SYS });
  l.open();
  return l;
}
function busWith(sink) {
  const em = new EventEmitter();
  if (sink) em.on('anomaly.detected', e => sink.push(e));
  return { emit: (t, p, m) => em.emit(t, { payload: p, meta: m }), on: (t, h) => em.on(t, h), _em: em };
}
function canonRows() {
  const day = new Date().toISOString().slice(0, 10);
  const p = path.join(CANON_DIR, `${SYS}.config`, `${day}.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

(async () => {
  try {
    await test('T3-001', 'GATE 1+3: a config change lands in the canonical ledger tree and is projected (component-ledger: day file + JAA mirror + breadcrumb)', async () => {
      const r = recordConfigChange({ system: SYS, key: 'port', from: 3748, to: 3749, cfrLedger: freshCfrLedger(), bus: busWith() });
      assert.strictEqual(r.projected, true);
      const rows = canonRows();
      assert.ok(rows.length >= 1, 'a real day file row must exist');
      const row = rows[rows.length - 1];
      assert.strictEqual(row.system, SYS);
      assert.strictEqual(row.component, `${SYS}.config`);
      assert.strictEqual(row.action, 'config.changed');
      assert.strictEqual(row.detail.key, 'port');
      assert.strictEqual(row.detail.to, 3749);
    });

    await test('T3-002', 'GATE 2+4: CFR conditions stamped AND sigma scored — by the real CFR ledger, present in the returned result and in the ledger row', async () => {
      const r = recordConfigChange({ system: SYS, key: 'threshold', from: 1, to: 2, cfrLedger: freshCfrLedger(), bus: busWith() });
      assert.strictEqual(r.stamped, true, 'must report a real CFR/sigma stamp');
      assert.strictEqual(typeof r.sigma, 'number', 'sigma must be a real number, not an object or null');
      assert.ok(r.cfr && typeof r.cfr.regime === 'string', 'CFR field snapshot with a regime must be stamped');
      assert.ok(['coherence', 'friction', 'resonance', 'entropy'].every(k => typeof r.cfr[k] === 'number'), 'the real CFR axes must all be present');
      const row = canonRows().pop();
      assert.ok(row.detail.sigma !== undefined && row.detail.cfr, 'sigma + CFR must ride in the persisted row, not just the return value');
    });

    await test('T3-003', 'GATE 5: an anomalous change raises friction in the REAL escalation module — full pipeline, nothing mocked', async () => {
      const escalation = require('../../cortex/self-heal/escalation.js');
      const frictionEvents = [];
      const bus = busWith();
      bus._em.on('escalation.friction.increased', e => frictionEvents.push(e));
      escalation.init({ bus });

      const r = recordConfigChange({
        system: SYS, key: 'maxConnections', from: 10, to: 100000, actor: 'system',
        cfrLedger: freshCfrLedger(), bus,
        anomalyThreshold: -1, // force the anomalous branch WITHOUT faking sigma
      });
      assert.strictEqual(r.anomalous, true);
      assert.strictEqual(r.escalated, true, 'governance must report it escalated');

      await new Promise(res => setTimeout(res, 300));
      assert.ok(frictionEvents.length > 0, 'the REAL escalation module must have raised friction');
      const p = frictionEvents[0].payload;
      assert.strictEqual(p.faultClass, `config.anomalous.${SYS}`, 'friction must be attributed to this system');
      assert.strictEqual(typeof p.newFric, 'number', 'a real friction value must be recorded');
      assert.ok(typeof p.band === 'string' && p.count >= 1);
      assert.strictEqual(p.cause, 'anomaly.detected');
    });

    await test('T3-004', 'an anomalous change is marked anomalous IN THE LEDGER, so the fact survives even if nothing escalates it', async () => {
      const r = recordConfigChange({
        system: SYS, key: 'unescalated', from: 1, to: 2,
        cfrLedger: freshCfrLedger(), anomalyThreshold: -1, // NO bus supplied
      });
      assert.strictEqual(r.anomalous, true);
      assert.strictEqual(r.escalated, false, 'honestly reports it did NOT escalate');
      const row = canonRows().pop();
      assert.strictEqual(row.status, 'anomalous', 'the ledger row itself must carry the anomalous status (§1.2 — the fact is not lost with the escalation)');
    });

    await test('T3-005', 'a normal change is NOT anomalous and does not raise friction — the detector discriminates', async () => {
      const anomalies = [];
      const r = recordConfigChange({ system: SYS, key: 'quiet', from: 'a', to: 'b', cfrLedger: freshCfrLedger(), bus: busWith(anomalies) });
      assert.strictEqual(r.anomalous, false, `real sigma ${r.sigma} must sit under the ${ANOMALY_SIGMA} threshold for an ordinary change`);
      assert.strictEqual(anomalies.length, 0, 'no anomaly may be emitted for a normal change');
      assert.strictEqual(canonRows().pop().status, 'ok');
    });

    await test('T3-006', '§1.1 REFUSALS: a change with no owning system, no key, or no value is refused loudly — never written anonymously', async () => {
      assert.throws(() => recordConfigChange({ key: 'x', to: 1 }), /system.*required/i, 'no system must be refused');
      assert.throws(() => recordConfigChange({ system: SYS, to: 1 }), /key.*required/i, 'no key must be refused');
      assert.throws(() => recordConfigChange({ system: SYS, key: 'x' }), /'to' is required/i, 'no value must be refused');
    });

    await test('T3-007', 'a delete is governed too, and needs no value', async () => {
      const r = recordConfigChange({ system: SYS, key: 'gone', from: 'x', deleted: true, cfrLedger: freshCfrLedger(), bus: busWith() });
      assert.strictEqual(r.projected, true);
      const row = canonRows().pop();
      assert.strictEqual(row.action, 'config.deleted');
      assert.strictEqual(row.detail.deleted, true);
    });

    await test('T3-008', 'actor provenance rides on every row — the spec\'s user-live vs system-initiated distinction is recorded, not inferred later', async () => {
      recordConfigChange({ system: SYS, key: 'byUser', to: 1, actor: 'user', cfrLedger: freshCfrLedger(), bus: busWith() });
      const userRow = canonRows().pop();
      assert.ok(userRow.tags.includes('user-initiated'));
      recordConfigChange({ system: SYS, key: 'bySystem', to: 1, actor: 'system', cfrLedger: freshCfrLedger(), bus: busWith() });
      const sysRow = canonRows().pop();
      assert.ok(sysRow.tags.includes('system-initiated'));
      assert.ok(sysRow.tags.includes('config') && sysRow.tags.includes('governance'));
    });

    await test('T3-009', 'without a CFR ledger the change is STILL governed, and honestly reports it carries no stamp — degraded, not silently unscored', async () => {
      const r = recordConfigChange({ system: SYS, key: 'nostamp', to: 5, bus: busWith() });
      assert.strictEqual(r.projected, true, 'must still reach the canonical ledger');
      assert.strictEqual(r.stamped, false, 'must admit there is no CFR/sigma stamp');
      assert.strictEqual(r.sigma, null, 'must not fabricate a score of 0 — that would read as "verified nominal"');
      assert.strictEqual(r.anomalous, false);
    });

    await test('T3-010', 'objects/arrays are compared structurally — a re-read of the same value is not reported as a change', async () => {
      const r = recordConfigChange({ system: SYS, key: 'obj', from: { a: [1, 2] }, to: { a: [1, 2] }, cfrLedger: freshCfrLedger(), bus: busWith() });
      assert.strictEqual(canonRows().pop().detail.changed, false, 'identical structures must report changed:false, or every poll floods the ledger');
      const r2 = recordConfigChange({ system: SYS, key: 'obj', from: { a: [1, 2] }, to: { a: [1, 3] }, cfrLedger: freshCfrLedger(), bus: busWith() });
      assert.strictEqual(canonRows().pop().detail.changed, true, 'a real structural difference must report changed:true');
      assert.ok(r.uuid !== r2.uuid, 'every governance record carries its own uuid (§5.1)');
    });
  } finally {
    fs.rmSync(CANON_DIR, { recursive: true, force: true });
    // §2026-07-24 — the day file was cleaned but component-ledger's JAA mirror
    // (component_ledger + event_log) was not, so rows leaked into the live
    // store and surfaced as phantom systems in the brain view.
    require('./_purge-test-rows').purgeTestRows(SYS);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
