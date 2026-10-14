'use strict';
/**
 * tests/modules/test-profile-tabs.test.js — PF1 (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec): a tab per
 * account profile. guardian/lib/ncp.js · guardian/lib/profile-lanes.js · guardian/lib/dispatcher.js ·
 * guardian/lib/dispatch-pool-bridge.js · clear-glass/src/providers/profile-tabs.js.
 * James: "dynamic routing to profiles in clearglass, which can hook into hats. each tab can beb a compartment or different
 * profile. that way we can use multiaccount routing." · "yes we need to get it all working."
 *
 * A real NCP server over HTTP, real SSE tabs, the real dispatcher, real account routing (rules in a temp JAA store).
 *   PT-01  a profile tab connecting never takes the provider's jobs: the provider's own tab stays active; it is left out
 *          of getProviders / isConnected and listed by getTabs
 *   PT-02  the lane: hat → account (account routing) → the provider tab (its own account, or none known) or that account's
 *          profile tab; off with GUARDIAN_PROFILE_TABS=0
 *   PT-03  the map's proof: two hats on one provider answer from two accounts in two tabs at once; a job for hat A never
 *          lands in hat B's tab (and with profiles off, the second waits for the first, as before)
 *   PT-04  no profile tab yet → Clear Glass is asked to open it, the job waits, and goes to that tab when it connects
 *   PT-05  a tab's disconnect requeues only its own jobs; a completion frees the lane the job really held
 *   PT-06  Clear Glass: open() puts the account's vault sign-in in its own session (only when it has none), starts the tab
 *          with that session and the profile tabId; refuses an account with no saved sign-in
 *   PT-07  wired: Guardian opens profiles through Clear Glass, serves /api/accounts/profiles; Idearium, the command and the
 *          Accounts card show them
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(20); } return false; }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-pf1-'));
const { createNCPServer } = require(path.join(ROOT, 'guardian/lib/ncp.js'));
const AR = require(path.join(ROOT, 'guardian/lib/account-routing.js'));
const PL = require(path.join(ROOT, 'guardian/lib/profile-lanes.js'));
const { pool } = require(path.join(ROOT, 'guardian/lib/dispatch-pool.js'));

/** a real NCP server on a port, and tabs that connect to it as the userscript does (SSE GET /channel) */
function rig() {
  const bus = new EventEmitter(); bus.setMaxListeners(50);   // one dispatcher + pool bridge per test, on one bus
  const ncp = createNCPServer({ onMessage() {}, onConnect: (d) => bus.emit('connected', d), onDisconnect: (d) => bus.emit('guardian.provider.disconnected', d) });
  const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); if (u.pathname === '/channel') return ncp.handleChannel(req, res, u); res.writeHead(404); res.end(); });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port;
    const tabs = [];
    function tab(provider, tabId) {
      return new Promise((done) => {
        const got = [];
        const rq = http.get({ host: '127.0.0.1', port, path: `/channel?provider=${provider}&tabId=${encodeURIComponent(tabId)}` }, (res) => {
          let buf = '';
          res.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const m = ev.match(/^data: (.*)$/m); if (m) { try { got.push(JSON.parse(m[1])); } catch (_) {} } } });
          const t = { provider, tabId, got, jobs: () => got.filter(x => x.type === 'GUARDIAN_JOB'), close: () => { rq.destroy(); } };
          tabs.push(t);
          until(() => got.some(x => x.type === 'NCP_READY')).then(() => done(t));
        });
      });
    }
    ok({ bus, ncp, port, tab, close: () => { for (const t of tabs) t.close(); srv.close(); } });
  }));
}

function dispatcherFor(r, { accountRouting, openProfile = null } = {}) {
  const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
  const jobs = new Map(); const pendingQueue = new Map();
  const updateJob = (id, p) => { const j = { ...(jobs.get(id) || {}), ...p }; jobs.set(id, j); return j; };
  const d = createDispatcher({ updateJob, bus: r.bus, ncp: r.ncp, pendingQueue, cockpitBroadcast() {}, dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {},
    pingTimeoutMs: 5, completionTimeoutMs: 60000, getJob: (id) => jobs.get(id), accountRouting, useAccount: async () => ({ ok: true, switched: false }), openProfile });
  require(path.join(ROOT, 'guardian/lib/dispatch-pool-bridge.js'))(r.bus, pool);
  const job = (id, hat) => { const j = { id, provider: 'claude', prompt: `p-${id}`, hat, status: 'pending', createdAt: Date.now() }; jobs.set(id, j); return j; };
  return { d, jobs, pendingQueue, job };
}

(async () => {
  console.log('\ntest-profile-tabs — a tab per account profile (PF1)');
  const routing = AR.createAccountRouting({ dir: path.join(tmp, 'acct') });
  routing.setRule({ provider: 'claude', account: 'acct-a', hat: 'builder', priority: 5 });
  routing.setRule({ provider: 'claude', account: 'acct-b', hat: 'critic', priority: 5 });
  routing.setRule({ provider: 'claude', account: 'acct-c', hat: 'scout', priority: 5 });
  routing.noteSwitched('claude', 'acct-a');   // the provider's own tab runs acct-a

  const r = await rig();
  try {
    const own = await r.tab('claude', 'tab-main');
    const prof = await r.tab('claude', 'profile~acct-b');

    await test('PT-01', 'a profile tab never takes the provider\'s jobs; it is listed apart', async () => {
      assert.ok(r.ncp.isConnected('claude'));
      assert.strictEqual(r.ncp.getProviders().claude.tabId, 'tab-main', 'the provider\'s own tab, not the newest');
      const t = r.ncp.getTabs();
      assert.deepStrictEqual(t.map(x => [x.tabId, x.profile, x.active]).sort(), [['profile~acct-b', 'acct-b', false], ['tab-main', null, true]]);
      assert.ok(r.ncp.isTabConnected('claude', 'profile~acct-b') && !r.ncp.isTabConnected('claude', 'profile~acct-z'));
    });

    await test('PT-02', 'hat → account → tab and lane', async () => {
      const a = PL.laneFor({ provider: 'claude', hat: 'builder' }, { accountRouting: routing, enabled: true });
      const b = PL.laneFor({ provider: 'claude', hat: 'critic' }, { accountRouting: routing, enabled: true });
      const none = PL.laneFor({ provider: 'claude' }, { accountRouting: routing, enabled: true });
      assert.deepStrictEqual([a.lane, a.profile, a.accountId], ['claude', false, 'acct-a'], 'the provider tab\'s own account');
      assert.deepStrictEqual([b.lane, b.profile, b.tabId], ['claude~acct-b', true, 'profile~acct-b']); assert.match(b.why, /hat critic.*acct-b's own tab/);
      assert.deepStrictEqual([none.lane, none.profile], ['claude', false]);
      assert.strictEqual(PL.laneFor({ provider: 'claude', hat: 'critic' }, { accountRouting: routing, enabled: false }).lane, 'claude', 'off');
      assert.strictEqual(PL.laneFor({ provider: 'ollama', hat: 'critic' }, { accountRouting: routing, enabled: true }).lane, 'ollama');
    });

    await test('PT-03', 'two hats, two accounts, two tabs, at once; hat A never in hat B\'s tab', () => quiet(async () => {
      const { d, jobs, job } = dispatcherFor(r, { accountRouting: routing });
      d.dispatchJob(job('A1', 'builder')); d.dispatchJob(job('B1', 'critic'));
      assert.ok(await until(() => own.jobs().length === 1 && prof.jobs().length === 1), JSON.stringify({ own: own.jobs().map(j => j.jobId), prof: prof.jobs().map(j => j.jobId) }));
      assert.deepStrictEqual([own.jobs()[0].jobId, prof.jobs()[0].jobId], ['A1', 'B1']);
      assert.strictEqual(jobs.get('A1').status, 'delivered'); assert.strictEqual(jobs.get('B1').status, 'delivered', 'both in flight at once — neither waits for the other');
      assert.strictEqual(jobs.get('B1').tabId, 'profile~acct-b'); assert.strictEqual(jobs.get('B1').accountId, 'acct-b');
      // more of each: still never crossed
      d.dispatchJob(job('B2', 'critic'));
      await wait(150);
      assert.strictEqual(prof.jobs().length, 1, 'B2 waits for B1 (one job at a time per account)');
      r.bus.emit('guardian.job.complete', { jobId: 'B1', provider: 'claude' });
      assert.ok(await until(() => prof.jobs().length === 2), 'B1 done → B2 goes to acct-b\'s tab');
      r.bus.emit('guardian.job.complete', { jobId: 'A1', provider: 'claude' });
      r.bus.emit('guardian.job.complete', { jobId: 'B2', provider: 'claude' });
      assert.ok(own.jobs().every(j => j.jobId.startsWith('A')) && prof.jobs().every(j => j.jobId.startsWith('B')), 'no job crossed tabs');
      // profiles off: one tab, the second job waits for the first, as before PF1
      process.env.GUARDIAN_PROFILE_TABS = '0';
      try {
        const before = own.jobs().length;
        d.dispatchJob(job('A3', 'builder')); d.dispatchJob(job('B3', 'critic'));
        await wait(200);
        assert.strictEqual(own.jobs().length, before + 1, 'one job at a time on the one tab'); assert.strictEqual(prof.jobs().length, 2, 'nothing to the profile tab');
        r.bus.emit('guardian.job.complete', { jobId: 'A3', provider: 'claude' });
        assert.ok(await until(() => own.jobs().length === before + 2), 'then the second, on the same tab');
        r.bus.emit('guardian.job.complete', { jobId: 'B3', provider: 'claude' });
      } finally { delete process.env.GUARDIAN_PROFILE_TABS; }
    }));

    await test('PT-04', 'no profile tab yet → Clear Glass opens it, the job waits, then goes to it', () => quiet(async () => {
      const opened = [];
      const { d, jobs, pendingQueue, job } = dispatcherFor(r, { accountRouting: routing, openProfile: async (p, a) => { opened.push([p, a]); return { ok: true }; } });
      d.dispatchJob(job('C1', 'scout'));
      assert.ok(await until(() => opened.length === 1));
      assert.deepStrictEqual(opened[0], ['claude', 'acct-c']);
      assert.strictEqual(jobs.get('C1').status, 'queued'); assert.match(jobs.get('C1').queueReason, /acct-c's claude tab/);
      assert.ok((pendingQueue.get('claude') || []).some(j => j.id === 'C1'));
      const tc = await r.tab('claude', 'profile~acct-c');
      pendingQueue.delete('claude'); d.dispatchJob(jobs.get('C1'));   // what flushQueuedJobs does on the tab's connect
      assert.ok(await until(() => tc.jobs().length === 1)); assert.strictEqual(tc.jobs()[0].jobId, 'C1');
      assert.strictEqual(own.jobs().filter(j => j.jobId === 'C1').length, 0);
      r.bus.emit('guardian.job.complete', { jobId: 'C1', provider: 'claude' });
      // a failed open fails the job with why
      const { d: d2, jobs: j2, job: job2 } = dispatcherFor(r, { accountRouting: routing, openProfile: async () => ({ ok: false, error: 'no saved sign-in for account acct-d on claude' }) });
      routing.setRule({ provider: 'claude', account: 'acct-d', hat: 'ghost', priority: 5 });
      d2.dispatchJob(job2('D1', 'ghost'));
      assert.ok(await until(() => j2.get('D1').status === 'error')); assert.match(j2.get('D1').error, /could not open account acct-d's claude tab: no saved sign-in/);
    }));

    await test('PT-05', 'a disconnect requeues only that tab\'s jobs; a completion frees the lane it held', () => quiet(async () => {
      routing.noteSwitched('claude', 'acct-a');   // PT-03's profiles-off run switched the provider tab; back to acct-a
      const { d, jobs, job } = dispatcherFor(r, { accountRouting: routing });
      d.dispatchJob(job('A9', 'builder')); d.dispatchJob(job('B9', 'critic'));
      assert.ok(await until(() => jobs.get('A9').status === 'delivered' && jobs.get('B9').status === 'delivered'));
      const timeouts = []; r.bus.on('guardian.job.timeout', (x) => timeouts.push(x.jobId));
      r.bus.emit('guardian.provider.disconnected', { provider: 'claude', tabId: 'profile~acct-b' });
      assert.deepStrictEqual(timeouts, ['B9'], 'only the profile tab\'s job');
      r.bus.emit('guardian.provider.disconnected', { provider: 'claude', tabId: 'tab-main' });
      assert.deepStrictEqual(timeouts, ['B9', 'A9'], 'and the provider tab\'s only its own');
      assert.strictEqual(pool.providerOf('B9'), null, 'B9 gave its lane back');
      d.dispatchJob(job('B10', 'critic'));
      assert.ok(await until(() => pool.providerOf('B10') === 'claude~acct-b' || jobs.get('B10').status === 'delivered'));
      r.bus.emit('guardian.job.complete', { jobId: 'B10', provider: 'claude' });   // the payload names the provider; the lane is freed
      assert.strictEqual(pool.available('claude~acct-b'), 1, 'the lane B10 held is free');
    }));
  } finally { r.close(); }

  await test('PT-06', 'Clear Glass: the account\'s sign-in in its own session, the tab started with it; refused without one', async () => {
    const PT = require(path.join(ROOT, 'clear-glass/src/providers/profile-tabs.js'));
    const jars = new Map(); const started = []; const restores = [];
    const ses = (part) => { if (!jars.has(part)) jars.set(part, []); const jar = jars.get(part); return { cookies: { get: async () => jar } }; };
    const vault = { accounts: (p) => (p === 'claude' ? [{ accountId: 'acct-b', count: 4 }] : []),
      restore: async ({ accountId, ses: s2 }) => { restores.push(accountId); const jar = [...jars.entries()].find(([, v]) => s2.cookies && v); jar[1].push({ name: 'sessionKey', domain: '.claude.ai' }); return { restored: 4, total: 4 }; } };
    const host = { start: async (p, o) => { started.push([p, o.agentId, o.partition]); return { ok: true, status: 'started' }; }, listAgentTabs: () => started.map(([p, a]) => ({ providerId: p, agentId: a, idleMs: 0, visible: false })) };
    const options = { resolveAccountForDispatch: (p, a) => (a === 'acct-x' ? { error: `unknown account ${a} for ${p}` } : { id: a }) };
    const T = PT.createProfileTabs({ providerHost: host, vault, options, sessionFor: ses, getProvider: () => ({ url: 'https://claude.ai', hosts: ['claude.ai'] }) });
    const o = await T.open('claude', 'acct-b');
    assert.ok(o.ok, JSON.stringify(o)); assert.strictEqual(o.restored, 4);
    assert.deepStrictEqual(started[0], ['claude', 'profile~acct-b', 'persist:ncp-claude~acct-b'], 'its own session, its own tabId');
    const again = await T.open('claude', 'acct-b');
    assert.ok(again.ok && again.restored === null, 'signed in already: its own sign-in is kept, not overwritten'); assert.strictEqual(restores.length, 1);
    const none = await T.open('claude', 'acct-c');
    assert.ok(!none.ok && /no saved sign-in for account acct-c/.test(none.error));
    assert.match((await T.open('claude', 'acct-x')).error, /unknown account/);
    assert.deepStrictEqual(T.list('claude').map(x => x.accountId), ['acct-b', 'acct-b']);
    assert.notStrictEqual(PT.partitionFor('claude', 'acct-b'), 'persist:ncp-claude', 'never the provider\'s own session');
  });

  await test('PT-07', 'wired end to end', async () => {
    const srv = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8');
    assert.ok(/openProfile: \(provider, accountId, job\) => require\('\.\/lib\/account-routing\.js'\)\.cgOpenProfile/.test(srv) && srv.includes("'/api/accounts/profiles'"), 'guardian');
    assert.ok(/openProfile \}\) \{/.test(fs.readFileSync(path.join(ROOT, 'guardian/lib/index.js'), 'utf8')), 'wireGuardianCore passes it');
    const cg = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
    assert.ok(cg.includes("'/providers/:id/profile'") && cg.includes("'/providers/:id/profiles'"), 'Clear Glass routes');
    assert.ok(/opts\.partition \|\| `persist:ncp-\$\{providerId\}`/.test(fs.readFileSync(path.join(ROOT, 'clear-glass/src/providers/host.js'), 'utf8')), 'ProviderHost takes the profile session');
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(api.includes("['api','accounts','profiles']"));
    const CMD = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(CMD.includes("key: 'accounts.profiles'"));
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.ok(ui.includes('id="acct-tabs"') && ui.includes("api('/api/accounts/profiles')"));
  });

  try { routing.flush(); } catch (_) {}
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
