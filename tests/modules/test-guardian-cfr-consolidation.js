'use strict';
/**
 * tests/modules/test-guardian-cfr-consolidation.js — pins the 2026-07-24
 * consolidation (James: data is "stored in cortex", reconfirming his
 * 2026-07-18 directive over the mind map's P0.1 out-migration).
 *
 * The straggler: guardian's CFR ledger wrote to guardian/memory_store/ —
 * the legacy SOURCE-TREE folder, 8.7MB live event_log.jsonl entirely
 * outside the data/ root. The 2026-07-18 migration comment claimed the
 * writer "wasn't found in this file" — it was in the same file, ~60 lines
 * above that comment (guardian/server.js:1606). Moved to
 * data/guardian/ledger/cfr, the exact pattern bridge already uses.
 *
 * Migration was by COPY with byte-exact verification; originals left in
 * place (§7.4 archived, not discarded).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const NEW_DIR = path.join(ROOT, 'data/guardian/ledger/cfr');
const SRC = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');

test('GCC-001', "guardian/server.js's CFR ledgerDir points INSIDE the data root, not the source tree", () => {
  assert.ok(/ledgerDir:\s*require\('path'\)\.join\(__dirname,\s*'\.\.',\s*'data',\s*'guardian',\s*'ledger',\s*'cfr'\)/.test(SRC),
    'ledgerDir must be data/guardian/ledger/cfr');
  assert.ok(!/ledgerDir:\s*require\('path'\)\.join\(__dirname,\s*'memory_store'\)/.test(SRC),
    'the old source-tree ledgerDir must be gone');
});

test('GCC-002', 'the migrated CFR files exist at the new home', () => {
  for (const f of ['cfr_state.json', 'event_stats.json', 'event_log.jsonl']) {
    assert.ok(fs.existsSync(path.join(NEW_DIR, f)), `${f} missing from data/guardian/ledger/cfr`);
  }
});

test('GCC-003', 'originals are ARCHIVED, not deleted (§7.4) — memory_store copies still on disk', () => {
  for (const f of ['cfr_state.json', 'event_stats.json', 'event_log.jsonl']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'guardian/memory_store', f)), `${f} original must remain in guardian/memory_store`);
  }
});

test('GCC-004', 'FUNCTIONAL: the CFR ledger opens against the migrated dir and RESUMES real state, not a fresh start', () => {
  const { createCFRLedger } = require('../../intelligence/cfr/ledger.js');
  const l = createCFRLedger({ ledgerDir: NEW_DIR, systemId: 'guardian' });
  l.open();
  try {
    const types = Object.keys(l.getAllStats() || {}).length;
    assert.ok(types > 0, `stats must resume from the migrated event_stats.json — got ${types} event types`);
    const cfr = l.getCFR();
    // A fresh field is {coherence:1, friction:0, resonance:0, ...}. The
    // migrated state has non-zero friction/resonance — proof it loaded.
    assert.ok(cfr.friction > 0 || cfr.resonance > 0,
      `CFR field must resume from migrated cfr_state.json, not defaults — got ${JSON.stringify(cfr)}`);
  } finally {
    try { l.close(); } catch (_) {}
  }
});

test('GCC-005', 'no LIVE code writes to guardian/memory_store anymore — only comments, archive-skip lists, and jaa-store doc references remain', () => {
  const offenders = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'docs', 'data', '_archive'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { scan(full); continue; }
      if (!e.name.endsWith('.js') || e.name.endsWith('.test.js')) continue;
      if (full === __filename) continue; // this test documents the old path by necessity
      const src = fs.readFileSync(full, 'utf8');
      for (const [i, line] of src.split('\n').entries()) {
        if (!line.includes('memory_store')) continue;
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*')) continue;            // comments
        if (/['"]memory_store['"]\s*\]?\s*\.includes|\[.*'memory_store'.*\]/.test(line)) continue; // skip-lists
        if (/moved from guardian\/memory_store/.test(line)) continue;     // informational strings documenting the move itself
        if (full.endsWith('guardian/jaa-store.js')) continue;             // generic docstring param naming
        offenders.push(`${path.relative(ROOT, full)}:${i + 1}`);
      }
    }
  };
  scan(ROOT);
  assert.deepStrictEqual(offenders, [], `live memory_store references remain: ${offenders.join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
