'use strict';
// tests/modules/test-economy.more.js — loaded by test-economy.test.js: EC5 (staging by economy) with the REAL
// lib/repo-inject.js, lib/code-edit.js and a Map-backed layer; the economy store in the test's temp data root.
const path = require('path');
module.exports = async function ({ t, ROOT, assert }) {
  process.env.NEXUS_INJECT_DIR = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'econ-inj-'));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const S = require(path.join(ROOT, 'lib/economy/store.js'));
  const files = new Map([['src/a.js', 'old\n']]);
  const layer = { readTextFile: (u, p) => (files.has(p) ? { content: files.get(p) } : { error: 'nf' }), readFile: (u, p) => (files.has(p) ? { content: files.get(p) } : { error: 'nf' }),
    writeTextFile: (u, p, c) => { files.set(p, c); return { ok: true }; }, deleteTextFile: (u, p) => { files.delete(p); return { ok: true }; }, refresh: () => ({ ok: true }) };
  const repo = { uuid: `econ-${Date.now()}`, name: 'econ' };
  RI.setMode(repo.uuid, 'auto');
  const reply = 'Here:\n```js src/a.js\nnew\n```\n';

  await t('EC5-01', 'the policy store: defaults when nothing is stored; a save keeps the previous policy and says who changed it', () => {
    const d = S.load(['ollama', 'chatgpt']);
    assert.deepStrictEqual(d.stageTiers, ['local']);
    const r = S.save({ providers: { chatgpt: { limits: { jobsPerHour: 5 } } } }, ['ollama', 'chatgpt'], { by: 'test' });
    assert.deepStrictEqual([r.policy.providers.chatgpt.limits.jobsPerHour, r.policy.updatedBy], [5, 'test']);
    S.save({ providers: { chatgpt: { limits: { jobsPerHour: 6 } } } }, ['ollama', 'chatgpt'], { by: 'test' });
    assert.strictEqual(JSON.parse(require('fs').readFileSync(path.join(path.dirname(S.file()), 'policy.prev.json'), 'utf8')).providers.chatgpt.limits.jobsPerHour, 5, 'nothing lost');
    assert.strictEqual(S.load(['ollama', 'chatgpt']).providers.chatgpt.limits.jobsPerHour, 6);
  });

  await t('EC5-02', 'a local-tier answer (ollama) is staged, not applied: one versionium commit, the repo untouched; a subscription answer applies as before', async () => {
    const st = RA._economyStage('ollama');
    assert.ok(st && st.causedBy === 'economy:local:ollama' && st.tier === 'local');
    assert.strictEqual(RA._economyStage('chatgpt'), null, 'subscription is not a stage tier by default');
    const commits = [];
    const r = await RI.fromReply({ layer, repo, text: reply, stage: { causedBy: st.causedBy, record: async (p) => { commits.push(p); return { commitId: 'vtm-econ-1' }; } } });
    assert.deepStrictEqual([r.staged.branch, r.staged.commitId, r.injects[0].status], [`repo-${repo.uuid}@staging`, 'vtm-econ-1', 'staged']);
    assert.strictEqual(files.get('src/a.js'), 'old\n', 'untouched until promoted');
    assert.deepStrictEqual([commits.length, commits[0].causedBy, commits[0].system], [1, 'economy:local:ollama', 'staging']);
    const direct = await RI.fromReply({ layer, repo, text: reply, stage: null });
    assert.strictEqual(direct.injects[0].status, 'applied'); assert.strictEqual(files.get('src/a.js'), 'new\n');
  });

  await t('EC5-03', 'versionium failing → nothing written, the reason said; review mode is unchanged (proposals wait, nothing staged)', async () => {
    files.set('src/a.js', 'old\n');
    const r = await RI.fromReply({ layer, repo, text: reply, stage: { causedBy: 'economy:local:ollama', record: async () => ({ error: 'versionium unreachable' }) } });
    assert.ok(r.refused.some(x => /economy staging failed — nothing written: versionium did not record/.test(x.reason)));
    assert.strictEqual(files.get('src/a.js'), 'old\n');
    RI.setMode(repo.uuid, 'review');
    const rv = await RI.fromReply({ layer, repo, text: reply, stage: { causedBy: 'x', record: async () => ({ commitId: 'nope' }) } });
    assert.deepStrictEqual([rv.staged, rv.injects[0].status], [undefined, 'proposed']);
  });

  await t('EC7-01', 'builds with no chosen provider: below minRecords the fixed chain; with enough build outcomes the learned order (what worked first), said in routedBy; a chosen provider still wins', () => {
    const { providersFor } = require(path.join(ROOT, 'lib/seam/adapters/warp-cascade.js'));
    const L = require(path.join(ROOT, 'lib/economy/ledger.js'));
    const rec0 = { seam_id: 'x' };
    assert.deepStrictEqual(providersFor(rec0, null), ['ollama', 'chatgpt', 'claude']);
    assert.strictEqual(rec0.routedBy, undefined);
    const now = Date.now();
    for (let i = 0; i < 15; i++) { L.record({ provider: 'chatgpt', jobType: 'build', outcome: 'failed', at: now - i * 1000 }); L.record({ provider: 'claude', jobType: 'build', outcome: 'ok', at: now - i * 1000 }); }
    S.save({ providers: { chatgpt: { limits: { minGapMs: 0, jobsPerHour: 0, jobsPerDay: 0, tokensPerDay: 0 } }, claude: { limits: { minGapMs: 0, jobsPerHour: 0, jobsPerDay: 0, tokensPerDay: 0 } } } }, ['ollama', 'chatgpt', 'claude'], { by: 'test' });
    const rec = { seam_id: 'x' };
    const order = providersFor(rec, null);
    // providers with no build records yet are explored (their posterior is flat), so the head may be one of them; the
    // learned part is that the provider that failed every build ranks below the one that succeeded every time
    let before = 0; for (let k = 0; k < 20; k++) { const o = providersFor({ seam_id: 'x' }, null); if (o.indexOf('claude') < o.indexOf('chatgpt')) before++; }
    assert.ok(before >= 19, `claude before chatgpt in ${before}/20`);
    assert.match(rec.routedBy, /^economy router: build: \w+ drew .* \(\d+ build records\)$/);
    assert.deepStrictEqual(providersFor({ preferredProvider: 'chatgpt', seam_id: 'x' }, null), ['chatgpt'], 'a choice is never overridden (I1)');
  });

  await t('EC9-01', 'browser steps with input "erosmancer": click/hover/type go to the driver as pointer via eros at the element centre; "page" is unchanged; a refusal fails the step, never sent in the page instead', async () => {
    const { AutomationEngine } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));
    const calls = [];
    let refuse = false;
    const fn = async ({ action, args }) => {
      calls.push({ action, args });
      if (action === 'eval') return { result: { x: 10, y: 20, width: 40, height: 10 } };
      if (action === 'pointer' && refuse) return { ok: false, error: 'eros not attached' };
      return { ok: true };
    };
    const e = new AutomationEngine({}); e.setHooks({ browserFn: fn });
    const last = () => calls.filter(c => c.action !== 'eval').pop();
    let r = await e.runStep({ type: 'browser', config: { action: 'click', selector: '#go', input: 'erosmancer' } });
    assert.strictEqual(r.ok, true, r.error);
    assert.deepStrictEqual(last(), { action: 'pointer', args: { x: 30, y: 25, do: 'click', via: 'eros' } });
    assert.strictEqual(r.output.inputPath, 'erosmancer', 'the result says which path ran');
    r = await e.runStep({ type: 'browser', config: { action: 'hover', selector: '#go', input: 'erosmancer' } });
    assert.strictEqual(last().args.do, 'move');
    r = await e.runStep({ type: 'browser', config: { action: 'type', selector: '#q', value: 'hello', input: 'erosmancer' } });
    assert.deepStrictEqual([last().action, last().args.do, last().args.text], ['pointer', 'type', 'hello']);
    r = await e.runStep({ type: 'browser', config: { action: 'click', selector: '#go' } });
    assert.deepStrictEqual([r.ok, last().action], [true, 'click'], 'page input is unchanged');
    r = await e.runStep({ type: 'browser', config: { action: 'type', value: 'x', input: 'erosmancer' } });
    assert.ok(!r.ok && /needs the element/.test(r.error));
    refuse = true; const n = calls.length;
    r = await e.runStep({ type: 'browser', config: { action: 'click', selector: '#go', input: 'erosmancer' } });
    assert.ok(!r.ok && /ErosmancerOS input failed: eros not attached/.test(r.error));
    assert.ok(!calls.slice(n).some(c => c.action === 'click'), 'no silent fall back to page input');
    const STEPS = require(path.join(ROOT, 'clear-glass/src/automation/steps.js'));
    const f = JSON.stringify(STEPS).includes('erosmancer');
    assert.ok(f, 'the Input field is offered in the step editor');
  });
};
