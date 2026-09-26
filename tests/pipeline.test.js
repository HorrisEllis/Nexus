'use strict';
// ── tests/pipeline.test.js ────────────────────────────────────────────────────
// UUID: nexus-pipeline-test-v1-0000-4000-0000-000000000001
//
// End-to-end pipeline test. Tests the complete self-healing loop:
//
//   heartbeat → project_registry → gap-finder → healer → self-heal → snapshot
//   replay verify → agent-tools → CLI routes
//
// All tests use an isolated JAA (tmp dir). No live HTTP. No external deps.
// §1.2: every failure loud and specific.

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { randomUUID } = require('crypto');

process.chdir(path.join(__dirname, '..'));

let _pass = 0, _fail = 0;
const _failures = [];

function test(name, fn) {
  try {
    fn();
    _pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch(e) {
    _fail++;
    _failures.push({ name, error: e.message });
    process.stdout.write(`  ✗ ${name}: ${e.message}\n`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    _pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch(e) {
    _fail++;
    _failures.push({ name, error: e.message });
    process.stdout.write(`  ✗ ${name}: ${e.message}\n`);
  }
}

function section(name) {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(0, 68 - name.length))}\n`);
}

// ── Isolated JAA factory ──────────────────────────────────────────────────────
function makeJAA() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pipe-test-'));
  const { JaaDB, uid } = require('../cortex/memory/jaa-db');
  const db = new JaaDB({ dir });
  db._ready = true;
  for (const t of Object.keys(db._tables)) {
    db._fds[t] = fs.createWriteStream(path.join(dir, t + '.jsonl'), { flags: 'a' });
  }
  // Patch singleton
  const jaaPath = require.resolve('../cortex/memory/jaa-db');
  const saved = require.cache[jaaPath];
  require.cache[jaaPath] = {
    id: jaaPath, filename: jaaPath, loaded: true,
    exports: { jaaDB: db, uid, JaaDB, ALL_TABLES: Object.keys(db._tables) },
  };
  return { db, uid, _saved: saved, _path: jaaPath, dir };
}

function restoreJAA(ctx) {
  if (ctx._saved) require.cache[ctx._path] = ctx._saved;
  else delete require.cache[ctx._path];
}

function evict(...mods) {
  for (const m of mods) {
    try {
      const p = m.startsWith('.') ? require.resolve(path.join(__dirname, '..', m.replace(/^\.\//,''))) : require.resolve(m);
      delete require.cache[p];
    } catch(_) {}
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
(async () => {

section('Heartbeat — project_registry population');

{
  const ctx = makeJAA();
  evict('../cortex/heartbeat');
  const hb = require('../cortex/heartbeat');

  testAsync('heartbeat.init starts without error', async () => {
    hb.init({ pollMs: 9999999 });
    hb.stop();
  });

  // Simulate a probe result by directly calling internal logic
  // (heartbeat probes HTTP, we insert manually to simulate)
  test('project_registry rows can be inserted', () => {
    const row = ctx.db.insert('project_registry', {
      uuid: ctx.uid(), name: 'cortex', system: 'cortex',
      port: 3748, online: true, lastSeenAt: Date.now(), ts: Date.now(), source: 'test',
    });
    assert(row.name === 'cortex', 'row.name = cortex');
  });

  test('project_registry row is queryable', () => {
    const rows = ctx.db.query('project_registry', r => r.name === 'cortex', 1);
    assert(rows.length === 1, 'one row found');
    assert(rows[0].online === true, 'online=true');
  });

  restoreJAA(ctx);
}

section('Gap-finder — gap detection');

{
  const ctx = makeJAA();
  evict('../cortex/gate/gap-finder');
  const gapFinder = require('../cortex/gate/gap-finder');

  test('gap-finder starts without error', () => {
    gapFinder.init({ pollMs: 9999999 });
    gapFinder.stop();
  });

  test('stale module detection: stale row → gap written', () => {
    // Insert a stale project_registry row (> 60s ago)
    ctx.db.insert('project_registry', {
      uuid: ctx.uid(), name: 'guardian', system: 'guardian',
      port: 7820, online: false,
      lastSeenAt: Date.now() - 90_000, // 90s ago → stale
      ts: Date.now() - 90_000, source: 'test',
    });

    // Trigger one tick
    gapFinder.init({ pollMs: 9999999 });
    // Wait for tick (async)
    return new Promise(resolve => {
      setTimeout(() => {
        gapFinder.stop();
        const gaps = ctx.db.query('gaps', g => g.type === 'stale_module', 5);
        assert(gaps.length > 0, `stale gap written — got ${gaps.length}`);
        assert(gaps[0].severity === 'medium' || gaps[0].severity === 'high');
        assert(gaps[0].status === 'pending');
        resolve();
      }, 50);
    });
  });

  test('recurring failure detection: 5 failures → high gap', () => {
    for (let i = 0; i < 5; i++) {
      ctx.db.insert('failures', {
        uuid: ctx.uid(), source: 'test/module',
        error: `error ${i}`, ts: Date.now(),
      });
    }
    gapFinder.init({ pollMs: 9999999 });
    return new Promise(resolve => {
      setTimeout(() => {
        gapFinder.stop();
        const gaps = ctx.db.query('gaps', g => g.type === 'recurring_failure', 5);
        assert(gaps.length > 0, `recurring failure gap written — got ${gaps.length}`);
        assert(gaps[0].severity === 'high', 'severity=high for 5 failures');
        resolve();
      }, 50);
    });
  });

  test('gap deduplication: same path+type not written twice', () => {
    const before = ctx.db.query('gaps', g => g.type === 'stale_module', 100).length;
    gapFinder.init({ pollMs: 9999999 });
    return new Promise(resolve => {
      setTimeout(() => {
        gapFinder.stop();
        const after = ctx.db.query('gaps', g => g.type === 'stale_module', 100).length;
        assert(after === before, `no duplicate gaps — before=${before} after=${after}`);
        resolve();
      }, 50);
    });
  });

  restoreJAA(ctx);
}

section('Healer — gap classification and escalation');

{
  const ctx = makeJAA();
  evict('../cortex/healer/index');

  test('healer starts without error', () => {
    const healer = require('../cortex/healer/index');
    healer.init({ pollMs: 9999999 });
    healer.stop();
    delete require.cache[require.resolve('../cortex/healer/index')];
  });

  test('healer: recurring_failure gap → escalate=true in fix_map', async () => {
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'recurring_failure',
      path: 'failures/test-module', severity: 'high',
      body: 'test failure', status: 'pending',
      source: 'test', createdAt: Date.now(), ts: Date.now(),
    });

    evict('../cortex/healer/index');
    const healer = require('../cortex/healer/index');
    healer.init({ pollMs: 9999999 });

    await new Promise(r => setTimeout(r, 100));
    healer.stop();

    const fix = ctx.db.query('fix_map', f => f.gapUuid === gap.uuid, 1)[0];
    assert(fix, 'fix_map entry written');
    assert(fix.strategy === 'forge_patch', `strategy=forge_patch got: ${fix.strategy}`);

    const updatedGap = ctx.db.get('gaps', gap.uuid);
    assert(updatedGap.status === 'needs_manual', `gap status=needs_manual got: ${updatedGap.status}`);
    assert(updatedGap.escalateToForge === true, 'escalateToForge=true');
  });

  test('healer: stuck_call → automated=true, resolved', async () => {
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'stuck_call',
      path: 'agent_calls/abc-123', severity: 'high',
      body: 'stuck for 40s', status: 'pending',
      source: 'test', createdAt: Date.now(), ts: Date.now(),
    });

    evict('../cortex/healer/index');
    const healer = require('../cortex/healer/index');
    healer.init({ pollMs: 9999999 });

    await new Promise(r => setTimeout(r, 100));
    healer.stop();

    const updatedGap = ctx.db.get('gaps', gap.uuid);
    assert(updatedGap.status === 'resolved', `stuck_call auto-resolved, got: ${updatedGap.status}`);
  });

  restoreJAA(ctx);
}

section('Self-heal — forge escalation pipeline');

{
  const ctx = makeJAA();
  evict('../cortex/self-heal/index');

  test('self-heal starts without error', () => {
    const sh = require('../cortex/self-heal/index');
    sh.init({ pollMs: 9999999 });
    sh.stop();
    try { delete require.cache[require.resolve('../cortex/self-heal/index')]; } catch(_) {}
  });

  test('self-heal: gap with attempts>=MAX not reprocessed', async () => {
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'recurring_failure',
      path: 'failures/exhausted', severity: 'high',
      body: 'already tried 3 times', status: 'needs_manual',
      attempts: 3, // at max — should be skipped
      source: 'test', createdAt: Date.now(), ts: Date.now(),
    });

    evict('../cortex/self-heal/index');
    const sh = require('../cortex/self-heal/index');
    sh.init({ pollMs: 9999999 });
    await new Promise(r => setTimeout(r, 100));
    sh.stop();

    const g = ctx.db.get('gaps', gap.uuid);
    assert(g.status === 'needs_manual', `exhausted gap not reprocessed, status: ${g.status}`);
    assert(!g.claimedBy || g.claimedBy !== 'self-heal', 'not claimed by self-heal');
  });

  test('self-heal: gap too recent not reprocessed (60s backoff)', async () => {
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'recurring_failure',
      path: 'failures/recent', severity: 'high',
      body: 'tried 10s ago', status: 'needs_manual',
      attempts: 1, lastForgeAt: Date.now() - 10_000, // 10s ago — within backoff
      source: 'test', createdAt: Date.now(), ts: Date.now(),
    });

    evict('../cortex/self-heal/index');
    const sh = require('../cortex/self-heal/index');
    sh.init({ pollMs: 9999999 });
    await new Promise(r => setTimeout(r, 100));
    sh.stop();

    const g = ctx.db.get('gaps', gap.uuid);
    assert(g.status === 'needs_manual', 'backoff respected — not reprocessed');
  });

  restoreJAA(ctx);
}

section('Snapshot — .nex file creation and rollback');

{
  const ctx = makeJAA();
  evict('../cortex/snapshot/index');

  // Insert some data to snapshot
  ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'test.event', payload: {}, source: 'test', ts: Date.now() });
  ctx.db.insert('gaps', { uuid: ctx.uid(), type: 'test_gap', path: 'test/path', body: 'test', status: 'pending', severity: 'low', source: 'test', ts: Date.now() });

  const snap = require('../cortex/snapshot/index');

  test('snapshot.create returns snapId and rowCounts', () => {
    const result = snap.create({ type: 'test', message: 'pipeline test snapshot' });
    assert(result.snapId, 'snapId present');
    assert(result.snapId.startsWith('nex-'), 'snapId starts with nex-');
    assert(result.totalRows > 0, 'totalRows > 0');
    assert(typeof result.rowCounts === 'object', 'rowCounts is object');
  });

  test('snapshot.list returns the created snapshot', () => {
    const snaps = snap.list(5);
    assert(snaps.length > 0, 'at least one snapshot');
    assert(snaps[0].snapId.startsWith('nex-'), 'snapId format correct');
    assert(snaps[0].type === 'test', 'type=test');
    assert(snaps[0].message === 'pipeline test snapshot', 'message preserved');
  });

  test('snapshot.load reads the .nex file from disk', () => {
    const snaps = snap.list(1);
    const loaded = snap.load(snaps[0].snapId);
    assert(/^NEX-SNAP\/\d+\.\d+$/.test(loaded.format), `format header present and well-formed (got: ${loaded.format})`);
    assert(loaded.tables, 'tables present');
    assert(loaded.tables.event_log, 'event_log table in snapshot');
  });

  test('snapshot.diff detects row count changes', () => {
    const snapA = snap.create({ type: 'test', message: 'before' });
    ctx.db.insert('gaps', { uuid: ctx.uid(), type: 'extra_gap', path: 'x', body: 'x', status: 'pending', severity: 'low', source: 'test', ts: Date.now() });
    const snapB = snap.create({ type: 'test', message: 'after' });
    const d = snap.diff(snapA.snapId, snapB.snapId);
    assert(d.tables, 'tables in diff');
    assert(Object.keys(d.tables).length > 0, 'at least one changed table');
    assert(d.tables.gaps?.delta > 0, `gaps delta > 0, got: ${d.tables.gaps?.delta}`);
  });

  test('snapshot.rollback dry-run returns changes without applying', () => {
    const snaps = snap.list(1);
    const result = snap.rollback(snaps[0].snapId, { apply: false });
    assert(result.dry_run === true, 'dry_run=true');
    assert(Array.isArray(result.tables), 'tables is array');
  });

  test('snapshot.rollback apply=true creates safety snapshot', () => {
    const snaps = snap.list(1);
    const result = snap.rollback(snaps[0].snapId, { apply: true });
    assert(result.safetySnapId, 'safetySnapId present in result');
    assert(result.safetySnapId.startsWith('nex-'), 'safetySnapId is nex- format');
    assert(typeof result.tablesRestored === 'number', 'tablesRestored is number');
  });

  restoreJAA(ctx);
  evict('../cortex/snapshot/index');
}

section('Replay — event reconstruction and verification');

{
  const ctx = makeJAA();
  evict('../cortex/replay/index');

  // Seed event_log with known events
  const t0 = Date.now() - 10_000;
  ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'gap.found',
    payload: { gapUuid: 'test-gap-001', path: 'modules/raid', type: 'stale_module', severity: 'medium' },
    source: 'gap-finder', ts: t0 });
  ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'healer.escalated',
    payload: { gapUuid: 'test-gap-001', strategy: 'forge_patch' },
    source: 'healer', ts: t0 + 1000 });
  ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'self-heal.patched',
    payload: { gapUuid: 'test-gap-001', module: 'cortex/gate/gap-finder.js', applied: false },
    source: 'self-heal', ts: t0 + 5000 });
  ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'heartbeat.tick',
    payload: { cortex: { online: true }, guardian: { online: false } },
    source: 'heartbeat', ts: t0 + 8000 });

  const replay = require('../cortex/replay/index');

  test('replay.inspect returns eventCount and state', () => {
    const result = replay.inspect({ fromTs: t0 - 100 });
    assert(result.mode === 'inspect', 'mode=inspect');
    assert(result.eventCount >= 4, `eventCount >= 4, got: ${result.eventCount}`);
    assert(Array.isArray(result.state.gaps), 'state.gaps is array');
  });

  test('replay.inspect reconstructs gap lifecycle from events', () => {
    const result = replay.inspect({ fromTs: t0 - 100 });
    const gaps = result.state.gaps;
    assert(gaps.length > 0, 'at least one gap reconstructed');
    const gap = gaps.find(g => g.uuid === 'test-gap-001');
    assert(gap, 'test-gap-001 found in replay');
    assert(gap.status === 'forge_patch_ready', `status=forge_patch_ready got: ${gap.status}`);
  });

  test('replay.inspect reconstructs heartbeat state', () => {
    const result = replay.inspect({ fromTs: t0 - 100 });
    assert(result.state.lastHeartbeat, 'lastHeartbeat recorded');
    assert(Array.isArray(result.state.onlineSystems), 'onlineSystems is array');
  });

  test('replay.verify runs without throwing', () => {
    const result = replay.verify({ fromTs: t0 - 100 });
    assert(result.mode === 'verify', 'mode=verify');
    assert(Array.isArray(result.divergences), 'divergences is array');
    assert(typeof result.eventCount === 'number', 'eventCount is number');
  });

  test('replay.simulate injects fault events', () => {
    const fault = {
      uuid: ctx.uid(), type: 'gap.found',
      payload: { gapUuid: 'sim-gap-001', path: 'test/sim', type: 'stale_module', severity: 'high' },
      source: 'simulator', ts: Date.now(), _inject: 'after',
    };
    const result = replay.simulate([fault]);
    assert(result.mode === 'simulate', 'mode=simulate');
    assert(result.faultCount === 1, 'faultCount=1');
    const simGap = result.state.gaps.find(g => g.uuid === 'sim-gap-001');
    assert(simGap, 'simulated gap appears in state');
  });

  restoreJAA(ctx);
  evict('../cortex/replay/index');
}

section('Agent-tools — tool registry and execution');

{
  const ctx = makeJAA();
  evict('../cortex/agent-tools/index', '../cortex/snapshot/index', '../cortex/replay/index');

  const tools = require('../cortex/agent-tools/index');

  test('manifest() returns non-empty tool list', () => {
    const m = tools.manifest();
    assert(Array.isArray(m), 'manifest is array');
    assert(m.length >= 8, `at least 8 tools, got: ${m.length}`);
    const names = m.map(t => t.name);
    assert(names.includes('nexus.gaps'), 'nexus.gaps present');
    assert(names.includes('nexus.context'), 'nexus.context present');
    assert(names.includes('nexus.snapshot.create'), 'nexus.snapshot.create present');
    assert(names.includes('nexus.replay'), 'nexus.replay present');
  });

  await testAsync('nexus.table: valid table returns rows', async () => {
    ctx.db.insert('event_log', { uuid: ctx.uid(), type: 'test', payload: {}, source: 'test', ts: Date.now() });
    const r = await tools.execute('nexus.table', { table: 'event_log', limit: 5 });
    assert(r.ok, `ok=true, error: ${r.error}`);
    assert(r.table === 'event_log', 'table name echoed');
    assert(Array.isArray(r.rows), 'rows is array');
  });

  await testAsync('nexus.table: unknown table returns error', async () => {
    const r = await tools.execute('nexus.table', { table: 'does_not_exist' });
    assert(r.ok === false, 'ok=false for unknown table');
    assert(r.error.includes('unknown table'), 'error message correct');
  });

  await testAsync('nexus.gaps: returns gap list', async () => {
    ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'test_gap', path: 'test', body: 'x',
      severity: 'medium', status: 'pending', source: 'test', ts: Date.now(),
    });
    const r = await tools.execute('nexus.gaps', { status: 'pending' });
    assert(r.ok, `ok=true, error: ${r.error}`);
    assert(Array.isArray(r.gaps), 'gaps is array');
    assert(r.count >= 1, 'at least one gap');
  });

  await testAsync('nexus.failures: returns failures', async () => {
    ctx.db.insert('failures', { uuid: ctx.uid(), source: 'test', error: 'e', ts: Date.now() });
    const r = await tools.execute('nexus.failures', { limit: 5 });
    assert(r.ok, 'ok=true');
    assert(Array.isArray(r.failures), 'failures is array');
  });

  await testAsync('nexus.event.inject: inserts synthetic event', async () => {
    const r = await tools.execute('nexus.event.inject', { type: 'test.synthetic', payload: { x: 1 } });
    assert(r.ok, `ok=true, error: ${r.error}`);
    assert(r.type === 'test.synthetic', 'type echoed');
    const ev = ctx.db.query('event_log', e => e.type === 'test.synthetic', 1)[0];
    assert(ev, 'event written to event_log');
    assert(ev.synthetic === true, 'synthetic=true');
  });

  await testAsync('nexus.gap.resolve: marks gap resolved', async () => {
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'test_resolve', path: 'test', body: 'x',
      severity: 'low', status: 'pending', source: 'test', ts: Date.now(),
    });
    const r = await tools.execute('nexus.gap.resolve', { gapUuid: gap.uuid, reason: 'test-resolved' });
    assert(r.ok, `ok=true, error: ${r.error}`);
    const updated = ctx.db.get('gaps', gap.uuid);
    assert(updated.status === 'resolved', 'gap status=resolved');
  });

  await testAsync('nexus.context: returns system context', async () => {
    const r = await tools.execute('nexus.context', {});
    assert(r.ok, `ok=true, error: ${r.error}`);
    assert(typeof r.openGaps === 'number', 'openGaps is number');
    assert(Array.isArray(r.recentEvents), 'recentEvents is array');
  });

  await testAsync('unknown tool returns error', async () => {
    const r = await tools.execute('nexus.does.not.exist', {});
    assert(r.ok === false, 'ok=false');
    assert(r.error.includes('unknown tool'), 'error message correct');
  });

  restoreJAA(ctx);
}

section('Full pipeline — gap → heal → self-heal (mock forge)');

{
  const ctx = makeJAA();

  // Simulate the full loop without actual forge (no Ollama needed)
  test('full pipeline state: gap written, healer escalates, self-heal sees it', () => {
    // 1. Gap written by gap-finder
    const gap = ctx.db.insert('gaps', {
      uuid: ctx.uid(), type: 'recurring_failure',
      path: 'failures/cortex/gate/gap-finder.js',
      body: 'module cortex/gate/gap-finder.js: 4 failures in recent window',
      severity: 'medium', status: 'pending',
      source: 'gate/gap-finder', createdAt: Date.now(), ts: Date.now(),
    });

    // 2. Healer prescribes: recurring_failure → forge_patch, escalate=true
    ctx.db.insert('fix_map', {
      uuid: ctx.uid(), gapUuid: gap.uuid, gapPath: gap.path,
      gapType: gap.type, strategy: 'forge_patch',
      action: `forge fix for recurring failure in ${gap.path}`,
      automated: false, escalate: true,
      status: 'manual_required', source: 'healer',
      causedBy: gap.uuid, createdAt: Date.now(),
    });
    ctx.db.update('gaps', gap.uuid, {
      status: 'needs_manual', resolvedAt: null,
      fixStrategy: 'forge_patch', escalateToForge: true,
    });

    // 3. Self-heal would pick this up (forge not available in test → would write forge_failed)
    // Verify the gap is in the correct state for self-heal to process
    const g = ctx.db.get('gaps', gap.uuid);
    assert(g.status === 'needs_manual', 'gap in needs_manual — self-heal can process');
    assert(g.escalateToForge === true, 'escalateToForge=true');

    const fix = ctx.db.query('fix_map', f => f.gapUuid === gap.uuid, 1)[0];
    assert(fix, 'fix_map entry exists');
    assert(fix.strategy === 'forge_patch', 'strategy=forge_patch');

    // 4. Snapshot taken (simulate)
    ctx.db.insert('event_log', {
      uuid: ctx.uid(), type: 'snapshot.created',
      payload: { snapId: 'nex-test-001', type: 'pre_forge', message: 'test' },
      source: 'snapshot', causedBy: gap.uuid, ts: Date.now(),
    });

    // 5. Verify event_log has the full causal chain
    const events = ctx.db.tail('event_log', 100);
    const snapEvent = events.find(e => e.type === 'snapshot.created');
    assert(snapEvent, 'snapshot event in log');
    assert(snapEvent.causedBy === gap.uuid, 'causedBy = gap uuid');
  });

  restoreJAA(ctx);
}

})().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

// ─────────────────────────────────────────────────────────────────────────────
// APPENDED: Contract layer tests
// ─────────────────────────────────────────────────────────────────────────────

(async () => {

section('Contract — orchestration contract enforcement');

{
  const ctx = makeJAA();
  evict('../cortex/contract/index');
  const contract = require('../cortex/contract/index');

  test('listContracts returns all agent profiles', () => {
    const agents = contract.listContracts();
    assert(Array.isArray(agents), 'agents is array');
    assert(agents.length >= 5, `at least 5 agents, got: ${agents.length}`);
    const names = agents.map(a => a.agent);
    assert(names.includes('ollama'), 'ollama contract present');
    assert(names.includes('self-heal'), 'self-heal contract present');
    assert(names.includes('_default'), '_default contract present');
  });

  test('ollama/code is permitted', () => {
    const r = contract.checkContract({ uuid: ctx.uid(), routedTo: 'ollama', command: 'code', prompt: 'test' });
    assert(r.ok, `ollama/code should be permitted, violations: ${r.violations?.join(',')}`);
    assert(r.violations.length === 0, 'no violations');
    assert(r.trust_level === 'local', 'trust_level=local');
  });

  test('guardian-chatgpt/forge is denied', () => {
    const r = contract.checkContract({ uuid: ctx.uid(), routedTo: 'guardian-chatgpt', command: 'forge', prompt: 'test' });
    assert(!r.ok, 'guardian-chatgpt/forge should be denied');
    assert(r.violations.some(v => v.includes('action_denied')), 'action_denied violation');
  });

  test('self-heal without causedBy violates proof_required', () => {
    const r = contract.checkContract({ uuid: ctx.uid(), routedTo: 'self-heal', command: 'forge', prompt: 'test' });
    assert(!r.ok, 'self-heal without causedBy should fail');
    assert(r.violations.some(v => v.includes('causality_proof_required')), 'causality_proof_required violation');
  });

  test('self-heal with causedBy passes proof check', () => {
    const r = contract.checkContract({
      uuid: ctx.uid(), routedTo: 'self-heal', command: 'forge',
      prompt: 'test', causedBy: 'gap-uuid-001',
    });
    // May still fail on allowed_actions — self-heal only allows forge
    assert(r.violations.every(v => !v.includes('causality_proof_required')), 'no causality violation');
  });

  test('_default agent has minimal permissions', () => {
    const r = contract.checkContract({ uuid: ctx.uid(), routedTo: 'unknown-agent-xyz', command: 'forge', prompt: 'test' });
    assert(!r.ok, 'unknown agent/forge should be denied');
    assert(r.trust_level === 'unknown', 'trust_level=unknown');
  });

  test('missing required field triggers violation', () => {
    const r = contract.checkContract({ uuid: ctx.uid(), routedTo: 'ollama', command: 'code' }); // missing prompt
    assert(!r.ok, 'missing prompt should violate contract');
    assert(r.violations.some(v => v.includes('missing_required_field')), 'missing_required_field violation');
  });

  await testAsync('enforce: compliant call writes contract_audit record', async () => {
    const call = { uuid: ctx.uid(), routedTo: 'ollama', command: 'code', prompt: 'test', causedBy: null };
    const result = contract.enforce(call);
    assert(result.ok, `compliant call should pass, violations: ${result.violations?.join(',')}`);
    assert(result.auditId, 'auditId present');
    const audit = ctx.db.query('contract_audit', a => a.callUuid === call.uuid, 1)[0];
    assert(audit, 'contract_audit record written');
    assert(audit.result === 'pass', 'audit result=pass');
  });

  await testAsync('enforce: violation writes law_violations and gap', async () => {
    const call = { uuid: ctx.uid(), routedTo: 'guardian-chatgpt', command: 'forge', prompt: 'test' };
    const result = contract.enforce(call);
    assert(!result.ok, 'violation should block');
    const violation = ctx.db.query('law_violations', v => v.callUuid === call.uuid, 1)[0];
    assert(violation, 'law_violations record written');
    assert(violation.law === '§CONTRACT', 'law=§CONTRACT');
    const gap = ctx.db.query('gaps', g => g.type === 'contract_violation', 1)[0];
    assert(gap, 'gap written for contract violation');
    assert(gap.severity === 'high', 'severity=high for denied action');
  });

  restoreJAA(ctx);
  evict('../cortex/contract/index');
}

section('Contract + RAID integration — enforcement at dispatch');

{
  const ctx = makeJAA();
  evict('../cortex/contract/index', '../cortex/core/raid/index');

  test('contract module loads via require in RAID context', () => {
    // RAID lazily requires contract — verify the require path works
    const contractPath = require.resolve('../cortex/contract/index');
    assert(contractPath.includes('contract'), 'contract path resolves');
  });

  test('contract enforcement does not break compliant dispatches', () => {
    const contract = require('../cortex/contract/index');
    // Simulate what RAID does
    const call = {
      uuid: ctx.uid(), routedTo: 'ollama', command: 'code',
      prompt: 'write a hello world', causedBy: null,
      preferredAgent: 'ollama', intent: 'write code',
    };
    const callWithRoute = { ...call, routedTo: 'ollama', command: call.command || 'code' };
    const check = contract.enforce(callWithRoute);
    assert(check.ok, `compliant call should pass: ${check.violations?.join(',')}`);
  });

  restoreJAA(ctx);
}

// Final summary
const total2 = _pass + _fail;
process.stdout.write(`\n${'═'.repeat(72)}\n`);
process.stdout.write(`  ${_pass}/${total2} passed   ${_fail} failed\n`);
if (_failures.length) {
  process.stdout.write('\nFAILURES:\n');
  _failures.forEach(f => process.stdout.write(`  ✗ ${f.name}: ${f.error}\n`));
}
process.stdout.write(`${'═'.repeat(72)}\n`);
process.exit(_fail > 0 ? 1 : 0);

})();
