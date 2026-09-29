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
};
