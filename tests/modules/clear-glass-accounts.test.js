'use strict';
/**
 * tests/modules/clear-glass-accounts.test.js
 *
 * Real tests for CLEAR-GLASS-EXPANSION-PLAN-2026-08-23.md Phase 3: the
 * account/uuid data model.
 *
 *   1. src/options/store.js — the real account CRUD surface
 *      (createAccount/getAccount/listAccounts/updateAccount/deleteAccount/
 *      linkAgent/unlinkAgent/resolveDefaultAccountForAgent), including the
 *      real reason these bypass the generic set() path: set()'s one-level
 *      merge can only add/overwrite keys, never remove one — a real
 *      account delete needs a key to actually disappear.
 *
 *   2. src/mesh/agent-mesh.js — every real call site that used to
 *      hardcode accountId:'default' now resolves through the accounts
 *      store when one is wired in, stays stable across repeated spawns
 *      for the same agentKey, respects an explicit accountId when given,
 *      and falls back to the exact old literal when no accounts store is
 *      wired in at all (backward compat for callers that don't opt in).
 *
 * agent-mesh.js needs a real Electron BrowserWindow-adjacent context for
 * driver/ctxMgr; both are mocked here at their real call sites (same
 * honest limit already stated by test-macro.js and rewind_replay.js for
 * the same reason — no display/GPU environment to run live Electron).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function atest(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

function freshOptions() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-accounts-'));
  process.env.HOME = tmpHome;
  delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
  const NexusOptions = require('../../clear-glass/src/options/store.js');
  return { NexusOptions, cleanup: () => fs.rmSync(tmpHome, { recursive: true, force: true }) };
}

async function main() {
  const origHome = process.env.HOME;

  // ── NexusOptions account CRUD ────────────────────────────────────────
  await atest('createAccount gives a real, stable uuid and real defaults', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const a = opts.createAccount({ label: 'Test account', agentKeys: ['claude'] });
    assert.ok(a.id && a.id.length >= 32, 'id should be a real uuid-shaped string');
    assert.strictEqual(a.label, 'Test account');
    assert.deepStrictEqual(a.agentKeys, ['claude']);
    assert.strictEqual(opts.getAccount(a.id).id, a.id);
    cleanup();
  });

  await atest('resolveDefaultAccountForAgent auto-creates on first call, is stable after', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const id1 = opts.resolveDefaultAccountForAgent('claude');
    const id2 = opts.resolveDefaultAccountForAgent('claude');
    assert.strictEqual(id1, id2, 'repeated resolution for the same agentKey must return the same uuid');
    assert.strictEqual(opts.listAccounts().length, 1, 'must not create a second account on the second call');
    cleanup();
  });

  await atest('resolveDefaultAccountForAgent gives different agents different accounts', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const claudeId = opts.resolveDefaultAccountForAgent('claude');
    const chatgptId = opts.resolveDefaultAccountForAgent('chatgpt');
    assert.notStrictEqual(claudeId, chatgptId);
    cleanup();
  });

  await atest('linkAgent/unlinkAgent real add/remove, one account can span multiple agentKeys', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const a = opts.createAccount({ label: 'Shared', agentKeys: ['gemini'] });
    opts.linkAgent(a.id, 'perplexity');
    assert.deepStrictEqual(opts.getAccount(a.id).agentKeys.sort(), ['gemini', 'perplexity']);
    opts.unlinkAgent(a.id, 'gemini');
    assert.deepStrictEqual(opts.getAccount(a.id).agentKeys, ['perplexity']);
    cleanup();
  });

  await atest('linkAgent is idempotent — linking an already-linked agentKey does not duplicate it', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const a = opts.createAccount({ label: 'X', agentKeys: ['claude'] });
    opts.linkAgent(a.id, 'claude');
    assert.deepStrictEqual(opts.getAccount(a.id).agentKeys, ['claude']);
    cleanup();
  });

  await atest('BUGFIX-CLASS: deleteAccount removes exactly one account, sibling accounts survive', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    const a = opts.createAccount({ label: 'A', agentKeys: ['claude'] });
    const b = opts.createAccount({ label: 'B', agentKeys: ['chatgpt'] });
    opts.deleteAccount(a.id);
    assert.strictEqual(opts.getAccount(a.id), null, 'deleted account must actually be gone');
    assert.ok(opts.getAccount(b.id), 'sibling account must survive the delete');
    assert.strictEqual(opts.listAccounts().length, 1);
    cleanup();
  });

  await atest('a real, persisted account (create + delete) survives a fresh load() round-trip', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts1 = new NexusOptions();
    await opts1.load();
    const keep = opts1.createAccount({ label: 'Keep', agentKeys: ['gemini'] });
    const drop = opts1.createAccount({ label: 'Drop', agentKeys: ['perplexity'] });
    opts1.deleteAccount(drop.id);

    const opts2 = new NexusOptions();
    await opts2.load();
    assert.ok(opts2.getAccount(keep.id), 'kept account must persist to disk');
    assert.strictEqual(opts2.getAccount(drop.id), null, 'deleted account must stay deleted after reload');
    cleanup();
  });

  await atest('deleteAccount and updateAccount on an unknown id fail loud, not silently', async () => {
    const { NexusOptions, cleanup } = freshOptions();
    const opts = new NexusOptions();
    await opts.load();
    assert.ok(opts.deleteAccount('nope').error);
    assert.ok(opts.updateAccount('nope', { label: 'x' }).error);
    cleanup();
  });

  process.env.HOME = origHome;

  // ── AgentMesh account resolution ─────────────────────────────────────
  delete require.cache[require.resolve('../../clear-glass/src/mesh/agent-mesh.js')];
  const AgentMesh = require('../../clear-glass/src/mesh/agent-mesh.js');

  function mocks() {
    const vaultCalls = [];
    const vault = {
      restore: async ({ agentId, accountId }) => { vaultCalls.push({ op: 'restore', agentId, accountId }); return { restored: 0 }; },
      save: async ({ agentId, accountId }) => { vaultCalls.push({ op: 'save', agentId, accountId }); },
    };
    const ctxMgr = {
      create: async () => ({ session: { cookies: { get: async () => [] } } }),
      getSession: () => null,
    };
    const driver = { exec: async () => ({}) };
    const sse = { emit: () => {} };
    return { vault, ctxMgr, driver, sse, vaultCalls };
  }

  await atest('spawn() resolves a real accountId through the wired accounts store', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-accounts-mesh-'));
    process.env.HOME = tmpHome;
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NO = require('../../clear-glass/src/options/store.js');
    const opts = new NO();
    await opts.load();

    const { vault, ctxMgr, driver, sse, vaultCalls } = mocks();
    const mesh = new AgentMesh({ ctxMgr, driver, vault, accounts: opts, sse });
    await mesh.init();

    const state = await mesh.spawn('claude');
    assert.ok(state.accountId && state.accountId !== 'default', 'accountId must be a real uuid, not the old literal');
    assert.strictEqual(vaultCalls[0].accountId, state.accountId, 'restore() must use the resolved accountId');

    const state2 = await mesh.spawn('claude');
    assert.strictEqual(state2.accountId, state.accountId, 'repeated spawn for the same agentKey must reuse the same account');

    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  await atest('spawn() respects an explicit accountId over resolution', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-accounts-mesh-'));
    process.env.HOME = tmpHome;
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NO = require('../../clear-glass/src/options/store.js');
    const opts = new NO();
    await opts.load();

    const { vault, ctxMgr, driver, sse } = mocks();
    const mesh = new AgentMesh({ ctxMgr, driver, vault, accounts: opts, sse });
    await mesh.init();

    const state = await mesh.spawn('claude', { accountId: 'explicit-caller-supplied-id' });
    assert.strictEqual(state.accountId, 'explicit-caller-supplied-id');

    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  await atest('BACKWARD-COMPAT: no accounts store wired in preserves the exact old literal', async () => {
    const { vault, ctxMgr, driver, sse } = mocks();
    const mesh = new AgentMesh({ ctxMgr, driver, vault, sse }); // no `accounts`
    await mesh.init();
    const state = await mesh.spawn('chatgpt');
    assert.strictEqual(state.accountId, 'default');
  });

  await atest('send() persists cookies under the same resolved accountId spawn used, not a fresh one', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-accounts-mesh-'));
    process.env.HOME = tmpHome;
    delete require.cache[require.resolve('../../clear-glass/src/options/store.js')];
    const NO = require('../../clear-glass/src/options/store.js');
    const opts = new NO();
    await opts.load();

    const vaultCalls = [];
    const vault = {
      restore: async ({ accountId }) => { vaultCalls.push({ op: 'restore', accountId }); return { restored: 0 }; },
      save: async ({ accountId }) => { vaultCalls.push({ op: 'save', accountId }); },
    };
    const ctxMgr = {
      create: async () => ({ session: { cookies: { get: async () => [] } } }),
      getSession: () => ({ cookies: { get: async () => [] } }),
    };
    // driver.exec always resolves — send() drives navigate/click/type/wait
    // through it, then polls _waitForResponse's own eval action for a
    // fake response so send() completes instead of timing out.
    let evalCalls = 0;
    const driver = {
      exec: async ({ action }) => {
        if (action === 'getUrl') return { url: 'https://claude.ai/' };
        if (action === 'eval') {
          evalCalls++;
          return evalCalls < 2 ? { result: 0 } : { result: 'a real, long-enough fake response text' };
        }
        return {};
      },
    };
    const sse = { emit: () => {} };
    const mesh = new AgentMesh({ ctxMgr, driver, vault, accounts: opts, sse });
    await mesh.init();

    const spawned = await mesh.spawn('claude');
    await mesh.send({ agentKey: 'claude', prompt: 'hi', contextId: spawned.contextId, timeout: 5000 });
    // save() is fire-and-forget (.then chained, not awaited) — give it a tick
    await new Promise(r => setTimeout(r, 20));

    const saveCall = vaultCalls.find(c => c.op === 'save');
    assert.ok(saveCall, 'save() should have been called');
    assert.strictEqual(saveCall.accountId, spawned.accountId, 'save() must use the same accountId spawn resolved, not a new one');

    process.env.HOME = origHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main();
