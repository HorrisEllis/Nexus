'use strict';
/**
 * tests/modules/test-tool-config.js — can an agent grant itself capability?
 * UUID: nexus-test-tool-config-v1-0000-2026-0819-001
 * spec: docs/copilot-tool-system.spec § P1
 *
 * §12.1 adversarial first. The tests that matter are the ones that try to get
 * round the ratchet, and the one that proves ~71 unconfigured tools still
 * behave exactly as they did before this file existed.
 */
const assert = require('assert');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');

const ROOT = path.join(__dirname, '../..');
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-config-test-'));
const PRIOR = process.env.JAA_DATA_DIR;
process.env.JAA_DATA_DIR = TMP;

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}

const { jaaDB } = require(path.join(ROOT, 'cortex/memory/jaa-db.js'));
jaaDB.insert('tc_isolation_probe', { id: 'probe', ts: Date.now() });
try { jaaDB._store().flushAll(); } catch (_) {}
if (!fs.existsSync(path.join(TMP, 'tc_isolation_probe.json'))) {
  console.log('  ✗ TC-000 ISOLATION — jaa-db ignores JAA_DATA_DIR; refusing to write config into the production store.');
  console.log("    Fix (cortex/memory/jaa-db.js:35): const DATA_DIR = process.env.JAA_DATA_DIR || path.join(__dirname, '../../data/cortex/memory');");
  console.log('  1 failed, 0 passed');
  process.exitCode = 1;
  return;
}

const cfg  = require(path.join(ROOT, 'lib/tool-config.js'));
const tool = require(path.join(ROOT, 'lib/agent-tools/tools/governance/tool-config.js'));

let n = 0;
const uniq = (p) => `${p}_${n++}_${Date.now().toString(36)}`;

(async () => {
  console.log('\nlib/tool-config.js — the ratchet\n');

  // ── §CTS-INV-2, the one that protects ~71 existing tools ─────────────────
  await test('TC-001', 'an UNCONFIGURED tool is unchanged — defaults, and allowed', () => {
    const t = uniq('never_configured');
    const c = cfg.get(t);
    assert.strictEqual(c.configured, false);
    assert.strictEqual(c.enabled, true);
    assert.strictEqual(c.requiresConfirm, false);
    assert.strictEqual(cfg.check(t, { agent: 'chatgpt' }).allow, true, '71 tools depend on this being true');
  });

  await test('TC-002', 'get() never returns null — one shape for every caller', () => {
    for (const t of [uniq('a'), uniq('b'), 'read_file']) {
      const c = cfg.get(t);
      assert.ok(c && typeof c === 'object' && c.toolName === t);
    }
  });

  // ── the ratchet ──────────────────────────────────────────────────────────
  await test('TC-003', 'an AGENT may tighten — disable applies immediately', () => {
    const t = uniq('tighten');
    const r = cfg.set(t, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'failed 4× this session' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(cfg.check(t).allow, false);
    assert.match(cfg.check(t).reason, /disabled|failed 4/);
  });

  await test('TC-004', 'an AGENT may NOT loosen — enable returns a proposal, not a change', () => {
    const t = uniq('loosen');
    cfg.set(t, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'off' });
    const r = cfg.set(t, { enabled: true }, { by: cfg.ACTOR.AGENT, reason: 'I want it back' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.needsUser, true);
    assert.ok(r.proposal);
    assert.strictEqual(cfg.get(t).enabled, false, 'the config must NOT have changed');
  });

  await test('TC-005', 'the USER may loosen', () => {
    const t = uniq('userloosen');
    cfg.set(t, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'off' });
    const r = cfg.set(t, { enabled: true }, { by: cfg.ACTOR.USER, reason: 'back on' });
    assert.ok(r.ok, JSON.stringify(r));
    assert.strictEqual(cfg.get(t).enabled, true);
  });

  await test('TC-006', 'a MIXED change containing any loosening is treated as loosening', () => {
    // The sneaky case: tighten one field to smuggle a loosening past the gate.
    const t = uniq('mixed');
    cfg.set(t, { enabled: false, requiresConfirm: false }, { by: cfg.ACTOR.USER, reason: 'setup' });
    const r = cfg.set(t, { enabled: true, requiresConfirm: true }, { by: cfg.ACTOR.AGENT, reason: 'net safer, honest' });
    assert.strictEqual(r.ok, false, 'a tightening must never carry a loosening through with it');
    assert.strictEqual(r.needsUser, true);
    assert.strictEqual(cfg.get(t).enabled, false);
  });

  await test('TC-007', 'dropping requiresConfirm is loosening', () => {
    const t = uniq('confirm');
    cfg.set(t, { requiresConfirm: true }, { by: cfg.ACTOR.AGENT, reason: 'careful' });
    const r = cfg.set(t, { requiresConfirm: false }, { by: cfg.ACTOR.AGENT, reason: 'faster' });
    assert.strictEqual(r.needsUser, true);
    assert.strictEqual(cfg.get(t).requiresConfirm, true);
  });

  await test('TC-008', 'narrowing allowedAgents tightens; widening proposes', () => {
    const t = uniq('scope');
    assert.ok(cfg.set(t, { allowedAgents: ['ollama'] }, { by: cfg.ACTOR.AGENT, reason: 'local only' }).ok);
    const wider = cfg.set(t, { allowedAgents: ['ollama', 'chatgpt'] }, { by: cfg.ACTOR.AGENT, reason: 'more' });
    assert.strictEqual(wider.needsUser, true);
    const toAll = cfg.set(t, { allowedAgents: null }, { by: cfg.ACTOR.AGENT, reason: 'all' });
    assert.strictEqual(toAll.needsUser, true, 'a list → all is the widest possible loosening');
    assert.deepStrictEqual(cfg.get(t).allowedAgents, ['ollama']);
  });

  // ── the agent tool cannot claim to be the user ───────────────────────────
  await test('TC-009', 'the tool_config TOOL has no "by" parameter at all', () => {
    assert.ok(!('by' in tool.parameters.properties), 'a by parameter would make the whole ratchet decorative');
  });

  await test('TC-010', 'passing by:"user" to the tool is ignored — it is not a parameter', async () => {
    const t = uniq('spoof');
    await tool.execute({ action: 'disable', tool: t, reason: 'off' });
    const r = await tool.execute({ action: 'enable', tool: t, by: 'user', reason: 'let me in' });
    assert.strictEqual(r.needsUser, true, 'the model must not be able to promote itself by argument');
    assert.strictEqual(cfg.get(t).enabled, false);
  });

  await test('TC-011', 'a tightening change without a reason is refused (§17.3)', async () => {
    const r = await tool.execute({ action: 'disable', tool: uniq('noreason') });
    assert.ok(r.error);
    assert.match(r.error, /reason/);
  });

  // ── structural enforcement, both gates ───────────────────────────────────
  await test('TC-012', 'GATE 2 — executeTool refuses a disabled tool', async () => {
    const at = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const name = uniq('probe_tool');
    at.registerTool({ name, description: 'probe', parameters: { type: 'object', properties: {} }, execute: async () => ({ ok: true, ran: true }) });
    assert.strictEqual((await at.executeTool(name, {})).ran, true, 'unconfigured: must run');
    cfg.set(name, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'probe disable' });
    const blocked = await at.executeTool(name, {});
    assert.strictEqual(blocked.blockedByConfig, true, 'the gate must be structural, not per-tool');
    assert.ok(!blocked.ran);
  });

  await test('TC-013', 'GATE 1 — a disabled tool is not even OFFERED to the model', async () => {
    const at = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const name = uniq('offer_tool');
    at.registerTool({ name, description: 'probe', parameters: { type: 'object', properties: {} }, execute: async () => ({ ok: true }) });
    assert.ok(at.getToolSchemas().some(s => s.function.name === name), 'offered before');
    cfg.set(name, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'hide it' });
    assert.ok(!at.getToolSchemas().some(s => s.function.name === name), 'a tool the model can see but cannot use gets planned around, then fails');
  });

  await test('TC-014', 'allowedAgents is enforced against the calling agent', async () => {
    const at = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const name = uniq('scoped_tool');
    at.registerTool({ name, description: 'probe', parameters: { type: 'object', properties: {} }, execute: async () => ({ ok: true, ran: true }) });
    cfg.set(name, { allowedAgents: ['ollama'] }, { by: cfg.ACTOR.AGENT, reason: 'local only' });
    assert.strictEqual((await at.executeTool(name, {}, { agent: 'chatgpt' })).blockedByConfig, true);
    assert.strictEqual((await at.executeTool(name, {}, { agent: 'ollama' })).ran, true);
  });

  await test('TC-015', 'requiresConfirm blocks until confirmed, and says so', async () => {
    const at = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const name = uniq('confirm_tool');
    at.registerTool({ name, description: 'probe', parameters: { type: 'object', properties: {} }, execute: async () => ({ ok: true, ran: true }) });
    cfg.set(name, { requiresConfirm: true }, { by: cfg.ACTOR.AGENT, reason: 'expensive' });
    const held = await at.executeTool(name, {});
    assert.strictEqual(held.needsConfirm, true);
    assert.strictEqual((await at.executeTool(name, {}, { confirmed: true })).ran, true);
  });

  await test('TC-016', 'configured defaults merge UNDER caller args, never over them', async () => {
    const at = require(path.join(ROOT, 'lib/agent-tools/index.js'));
    const name = uniq('defaults_tool');
    at.registerTool({ name, description: 'probe', parameters: { type: 'object', properties: {} }, execute: async (a) => ({ ok: true, got: a }) });
    cfg.set(name, { defaults: { depth: 3, mode: 'safe' } }, { by: cfg.ACTOR.AGENT, reason: 'sane defaults' });
    const r = await at.executeTool(name, { depth: 9 });
    assert.strictEqual(r.got.depth, 9, 'a default that overrode an explicit argument would make the tool disobey its own call');
    assert.strictEqual(r.got.mode, 'safe');
  });

  // ── provenance and history ───────────────────────────────────────────────
  await test('TC-017', 'every change records who and why, append-only (§0.3)', () => {
    const t = uniq('hist');
    cfg.set(t, { enabled: false }, { by: cfg.ACTOR.AGENT, reason: 'first' });
    cfg.set(t, { enabled: true },  { by: cfg.ACTOR.USER,  reason: 'second' });
    cfg.set(t, { notes: 'third' }, { by: cfg.ACTOR.AGENT, reason: 'third' });
    const h = cfg.history(t);
    assert.strictEqual(h.length, 3, 'nothing overwrites');
    assert.deepStrictEqual(h.map(x => x.reason), ['first', 'second', 'third']);
    assert.deepStrictEqual(h.map(x => x.changedBy), ['agent', 'user', 'agent']);
  });

  await test('TC-018', 'an unknown option is refused, never silently ignored (§1.2)', () => {
    const r = cfg.set(uniq('unknown'), { enbaled: false }, { by: cfg.ACTOR.USER, reason: 'typo' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /unknown option/);
  });

  await test('TC-019', 'config values are data — a function is refused', () => {
    const r = cfg.set(uniq('fn'), { defaults: () => 'pwned' }, { by: cfg.ACTOR.USER, reason: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /data, never functions/);
  });

  await test('TC-020', 'a malformed allowedAgents is refused with the shape named', () => {
    const r = cfg.set(uniq('bad'), { allowedAgents: 'ollama' }, { by: cfg.ACTOR.USER, reason: 'x' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /null.*or an array/);
  });

  await test('TC-021', 'list() shows configured tools ONLY, and says why', async () => {
    const configured   = uniq('listed');
    const unconfigured = uniq('unlisted');
    cfg.set(configured, { notes: 'in the list' }, { by: cfg.ACTOR.AGENT, reason: 'so it appears' });
    const r = await tool.execute({ action: 'list' });
    assert.ok(r.ok);
    const names = r.tools.map(t => t.tool);
    assert.ok(names.includes(configured), 'a configured tool must appear');
    assert.ok(!names.includes(unconfigured), 'an unconfigured tool must NOT appear — listing all 71 would bury the ones actually changed');
    assert.match(r.note, /unconfigured/, 'and the absence must be explained, not left to be inferred');
    assert.strictEqual(r.configured, r.tools.length);
  });

  await test('TC-022', 'history for a never-configured tool says so instead of returning nothing', async () => {
    const r = await tool.execute({ action: 'history', tool: uniq('virgin') });
    assert.ok(r.ok);
    assert.deepStrictEqual(r.changes, []);
    assert.match(r.note, /never configured/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.env.JAA_DATA_DIR = PRIOR;
  if (PRIOR === undefined) delete process.env.JAA_DATA_DIR;
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  process.exitCode = failed ? 1 : 0;
})();
