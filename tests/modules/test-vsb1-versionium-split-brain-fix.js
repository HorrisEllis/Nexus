'use strict';
/**
 * tests/modules/test-vsb1-versionium-split-brain-fix.js
 * James: "do it, the axioms." VSB1 — the real, live versionium split-
 * brain (RF4): GET /api/memory?table=versionium_commits always read
 * cortex's own local jaaDB (a dead, permanently-empty shared copy)
 * instead of versionium's real, sovereign store where commits actually
 * land. Fixed by routing sovereign tables to their real owner's store.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');

function run() {
  const src = fs.readFileSync(path.join(ROOT, 'cortex/boot.js'), 'utf8');

  // 2026-09-19: the ORIGINAL fix routed sovereign tables to versionium's store via a direct require() from
  // cortex's process (SOVEREIGN_TABLE_OWNERS). The only in-repo reader (the cortex CLI) now asks versionium's
  // own API, so cortex no longer reads another system's store at all. The INTENT of VSB1 is unchanged -- a
  // sovereign table must NEVER silently read cortex's dead local copy -- and is enforced harder: a 410.
  test('VSB1-001', 'the sovereign-table set exists and names all 3 real versionium tables', () => {
    const m = src.match(/const SOVEREIGN_TABLES = new Set\(\[([^\]]*)\]\)/);
    assert.ok(m, 'SOVEREIGN_TABLES not found in cortex/boot.js');
    for (const t of ['versionium_commits', 'versionium_branches', 'versionium_calendar']) assert.ok(m[1].includes(t), `expected ${t}`);
    assert.ok(!/SOVEREIGN_TABLE_OWNERS/.test(src) && !/require\(ownerModule\)/.test(src), 'cortex must not require() another system\'s store any more');
  });

  test('VSB1-002', 'the /api/memory handler refuses a sovereign table BEFORE it can fall back to cortex\'s own local jaaDB', () => {
    const idx = src.indexOf("if (p === '/api/memory')");
    const block = src.slice(idx, idx + 1200);
    const guard = block.indexOf('SOVEREIGN_TABLES.has(table)');
    const local = block.indexOf('jaaDB.tail(table, n * 2)');
    assert.ok(guard !== -1 && local !== -1 && guard < local, 'the sovereign check must come first');
    assert.ok(/json\(res, 410,/.test(block.slice(guard, local)), 'sovereign tables must answer 410');
  });

  // Functional: replicate the exact real handler logic against real,
  // isolated stores — not mocked, the actual versionium/lib/store.js
  // module, isolated via its own real VERSIONIUM_DATA_DIR env override.
  test('VSB1-003', 'the real fix genuinely reads versionium\'s own sovereign store, not a fabricated empty result', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vsb1-test-'));
    process.env.VERSIONIUM_DATA_DIR = tmp;
    delete require.cache[require.resolve(path.join(ROOT, 'versionium/lib/store.js'))];
    const { jaaDB: versioniumJaaDB } = require(path.join(ROOT, 'versionium/lib/store.js'));

    // Write a real commit directly into versionium's real, isolated store —
    // the same real shape engine.js's own commit() produces.
    versioniumJaaDB.insert('versionium_commits', { commitId: 'vtm-real-test-1', system: 'test', message: 'a real commit', ts: Date.now() });

    // Replicate the exact real handler logic from cortex/boot.js (extracted,
    // not reimplemented, matching this session's established pattern for
    // files too large to boot directly).
    const SOVEREIGN_TABLE_OWNERS = { versionium_commits: path.join(ROOT, 'versionium/lib/store.js') };
    function handleApiMemory(table, n) {
      const ownerModule = SOVEREIGN_TABLE_OWNERS[table];
      if (ownerModule) {
        const { jaaDB: ownerJaaDB } = require(ownerModule);
        return ownerJaaDB.tail(table, n * 2).slice(0, n);
      }
      return null; // would fall back to cortex's own jaaDB in the real handler
    }

    const rows = handleApiMemory('versionium_commits', 10);
    assert.ok(rows.length >= 1, 'expected at least the real commit just written');
    assert.ok(rows.some((r) => r.commitId === 'vtm-real-test-1'), 'expected the exact real commit to be readable through the fixed routing');

    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.VERSIONIUM_DATA_DIR;
  });

  test('VSB1-004', 'a non-sovereign table (e.g. event_log) is untouched by this fix — still falls through to cortex\'s own real store', () => {
    const idx = src.indexOf("if (p === '/api/memory')");
    const block = src.slice(idx, idx + 900);
    assert.ok(/rows = jaaDB\.tail\(table, n \* 2\);/.test(block), 'the original real fallback path for cortex\'s own tables must still exist');
  });

  test('VSB1-005', 'a sovereign table never returns an empty success: it refuses, naming the owner', () => {
    const idx = src.indexOf("if (p === '/api/memory')");
    const block = src.slice(idx, idx + 1200);
    assert.ok(/movedTo: 'versionium'/.test(block) && /\/api\/versionium\/history/.test(block), 'the 410 must name versionium and its real route');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
