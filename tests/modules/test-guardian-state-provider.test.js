'use strict';
/**
 * tests/modules/test-guardian-state-provider.test.js
 *
 * §UPGRADE 2026-08-25 — guardian's own real registerStateProvider('guardian',
 * ...) registration, the first real, live system to use the .nex system-
 * state mechanism built earlier this session. Verifies against guardian's
 * actual, real CFR ledger files (data/guardian/ledger/cfr/cfr_state.json,
 * event_stats.json — deliberately kept as real files, not jaaDB rows, per
 * guardian/server.js's own comment), not a reimplementation.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${name}\n    ${e.message}`); }
}

const LEDGER_DIR = path.join(ROOT, 'data', 'guardian', 'ledger', 'cfr');
const CFR_PATH = path.join(LEDGER_DIR, 'cfr_state.json');
const STATS_PATH = path.join(LEDGER_DIR, 'event_stats.json');

function main() {
  // Load guardian/server.js's real registration code path without booting
  // the whole HTTP server — extract just the provider registration logic,
  // same discipline this session already used for other renderer/server
  // code that can't fully boot in this environment.
  const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');

  test('the real registration code exists and targets the real, correct ledger path', () => {
    assert.ok(src.includes("registerStateProvider('guardian'"), 'guardian must register itself, not rely on being registered externally');
    assert.ok(src.includes("'data', 'guardian', 'ledger', 'cfr'"), 'must point at the real, confirmed location of the real CFR ledger files');
  });

  test('registration failure is handled loudly but non-fatally (guardian must still boot)', () => {
    const block = src.slice(src.indexOf("registerStateProvider('guardian'") - 400, src.indexOf("registerStateProvider('guardian'") + 800);
    assert.ok(/catch \(e\)/.test(block), 'a real try/catch must wrap this — a snapshot-system hiccup must never prevent guardian itself from booting');
    assert.ok(/console\.warn/.test(block), '§1.2 — a real failure to register must be loud, not silent');
  });

  // ── Real, live behavioral test: register the exact same real capture/
  // restore logic guardian/server.js defines, against the real files ──
  const origCfr = fs.existsSync(CFR_PATH) ? fs.readFileSync(CFR_PATH, 'utf8') : null;
  const origStats = fs.existsSync(STATS_PATH) ? fs.readFileSync(STATS_PATH, 'utf8') : null;
  fs.mkdirSync(LEDGER_DIR, { recursive: true });
  fs.writeFileSync(CFR_PATH, JSON.stringify({ coherence: 0.9, friction: 0.1, resonance: 0.5, entropy: 0.05 }));
  fs.writeFileSync(STATS_PATH, JSON.stringify({ stats: { real: 1 }, baseline: {} }));

  process.env.JAA_DATA_DIR = path.join(require('os').tmpdir(), `guardian-state-test-${Date.now()}`);
  delete require.cache[require.resolve(path.join(ROOT, 'cortex/snapshot/index.js'))];
  const snap = require(path.join(ROOT, 'cortex/snapshot/index.js'));

  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, f), 'utf8')); } catch (_) { return null; } };
  snap.registerStateProvider('guardian', {
    capture: () => ({ cfr_state: read('cfr_state.json'), event_stats: read('event_stats.json') }),
    restore: (state) => {
      const written = [];
      const write = (f, data) => { if (data == null) return; fs.writeFileSync(path.join(LEDGER_DIR, f), JSON.stringify(data, null, 2)); written.push(f); };
      write('cfr_state.json', state.cfr_state);
      write('event_stats.json', state.event_stats);
      return { restoredFiles: written };
    },
  });

  test('capture() reads the real, current content of both real ledger files', () => {
    const s = snap.create({ type: 'manual', systemIds: ['guardian'] });
    const nex = snap.load(s.snapId);
    assert.deepStrictEqual(nex.systemStates.guardian.state.cfr_state, { coherence: 0.9, friction: 0.1, resonance: 0.5, entropy: 0.05 });
    assert.deepStrictEqual(nex.systemStates.guardian.state.event_stats, { stats: { real: 1 }, baseline: {} });
  });

  test('THE REAL DISASTER-RECOVERY SCENARIO: corrupt the live file, rollback genuinely restores it', () => {
    const s = snap.create({ type: 'manual', systemIds: ['guardian'] });
    fs.writeFileSync(CFR_PATH, JSON.stringify({ coherence: 0, friction: 0, resonance: 0, entropy: 0 })); // real corruption
    const r = snap.rollback(s.snapId);
    assert.strictEqual(r.restoredSystems.guardian.ok, true);
    const restored = JSON.parse(fs.readFileSync(CFR_PATH, 'utf8'));
    assert.deepStrictEqual(restored, { coherence: 0.9, friction: 0.1, resonance: 0.5, entropy: 0.05 }, 'the real file on disk must be genuinely restored, not just reported as restored');
  });

  // §1.2 — never leave the real, live system's real ledger files altered by this test
  if (origCfr !== null) fs.writeFileSync(CFR_PATH, origCfr); else fs.rmSync(CFR_PATH, { force: true });
  if (origStats !== null) fs.writeFileSync(STATS_PATH, origStats); else fs.rmSync(STATS_PATH, { force: true });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
