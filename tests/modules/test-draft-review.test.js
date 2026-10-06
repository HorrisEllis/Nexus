'use strict';
/**
 * tests/modules/test-draft-review.test.js — 0.39.282 N23 (docs/2026-09-29-nex-node-store-phasemap.spec)
 *
 * James: "What if we have ollama build all of the files first, the best it can. Each chunk, uses a new chat, just to
 * have full context … After that, then hands it off … just tells the agent what's needed and can talk to the agent
 * directly." Ollama drafts each chunk in a FRESH chat; a guardian agent reviews the draft in one plain conversation.
 *   DR-0x  lib/draft-review.js — who drafted, what the draft holds, who reviews, what the reviewer is told
 *   DR-1x  the fresh chat: repo-agent dispatch { session } sends a per-chunk sessionId (checked on the wire)
 *   DR-2x  the wiring in idearium's phase build and the settings
 */
const path = require('path');
const http = require('http');
const PORT = 21000 + Math.floor(Math.random() * 20000);
process.env.COPILOT_URL = `http://127.0.0.1:${PORT}`;   // before repo-agent is required: its copilot is the fake below
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

async function run() {
  console.log('\ntest-draft-review\n');
  const DR = require(path.join(ROOT, 'lib', 'draft-review.js'));

  // ── DR-0x ──
  check('DR-01 a reply from ollama (or staged by the economy) is a local draft; a guardian agent\'s is not; a failure never is',
    DR.wasDraftedLocally({ ok: true, providerUsed: 'ollama' }) && DR.wasDraftedLocally({ ok: true, backend: 'ollama:qwen2.5-coder' })
    && DR.wasDraftedLocally({ ok: true, provider: 'auto', injects: { staged: { branch: 'b' } } })
    && !DR.wasDraftedLocally({ ok: true, providerUsed: 'chatgpt' }) && !DR.wasDraftedLocally({ ok: false, providerUsed: 'ollama' }));
  const RI = { get: (u) => ({ a: { path: 'src/a.js', content: 'export const a = 1;\n', status: 'staged' }, d: { path: 'src/gone.js', content: null } }[u] || null) };
  const files = DR.draftFiles({ ok: true, injects: { injects: [{ uuid: 'a', path: 'src/a.js', status: 'staged' }, { uuid: 'd', path: 'src/gone.js' }, { uuid: 'x', path: 'src/x.js' }] } }, RI);
  check('DR-02 the draft\'s files come with their full content from the inject nodes (a delete or a lost node has nothing to review)', files.length === 1 && files[0].path === 'src/a.js' && files[0].content === 'export const a = 1;\n' && files[0].status === 'staged');
  const RA = { guardianProviders: () => ['chatgpt', 'gemini'] };
  check('DR-03 the reviewer is a guardian agent: the configured one if connected, else the first; never ollama or auto', DR.reviewerFor('gemini', RA) === 'gemini' && DR.reviewerFor('', RA) === 'chatgpt'
    && DR.reviewerFor('ollama', RA) === 'chatgpt' && DR.reviewerFor('auto', RA) === 'chatgpt' && DR.reviewerFor('', { guardianProviders: () => [] }) === null);
  const big = 'x'.repeat(DR.MAX_FILE_CHARS + 50);
  const msg = DR.reviewMessage({ repoName: 'demo', title: 'P1 kernel', need: 'Build the kernel state.', files: [...files, { path: 'src/big.js', content: big }], absent: ['src/kernel/state.js'], note: 'keep it small' });
  check('DR-04 the review says what is needed, carries each drafted file fenced with its path, names what the draft never produced, and passes James\'s note',
    /Build the kernel state\./.test(msg) && msg.includes('```js src/a.js\nexport const a = 1;\n```') && /NEVER PRODUCED \(write these too\): src\/kernel\/state\.js/.test(msg) && /FROM JAMES: keep it small/.test(msg) && /reply with EVERY file/.test(msg));
  check('DR-05 an oversized file is cut and says so (the reviewer can read the rest with its tools)', msg.includes(`cut at ${DR.MAX_FILE_CHARS} chars of ${big.length}`) && !msg.includes(big));
  check('DR-06 the hand-off is honest text: nothing disguises it as a person typing', !/randomi[sz]|typo|human-like|as if (a|you are a) person/i.test(fs.readFileSync(path.join(ROOT, 'lib/draft-review.js'), 'utf8').split('*/')[1] || ''));

  // ── DR-1x the fresh chat, checked on the wire ──
  const bodies = [];
  const srv = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
      try { bodies.push(JSON.parse(d)); } catch (_) { bodies.push({}); }
      r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ text: 'ok', provider_used: 'ollama', model_used: 'stub' })); }); });
    s.on('error', rej); s.listen(PORT, '127.0.0.1', () => res(s));
  });
  const RAr = require(path.join(ROOT, 'lib', 'repo-agent.js'));
  const repo = { uuid: `dr-${Date.now()}`, name: 'draft-review-demo', files: [], compartmentId: 'cos.test.draft-review' };
  await RAr.dispatch({ repo, repoDir: null, message: 'build phase one', provider: 'ollama', noContext: true, session: 'phrun-abc1' });
  await RAr.dispatch({ repo, repoDir: null, message: 'build phase two', provider: 'ollama', noContext: true, session: 'phrun-def2' });
  await RAr.dispatch({ repo, repoDir: null, message: 'a normal chat turn', provider: 'ollama', noContext: true });
  const sids = bodies.filter(b => b.channel === 'idearium-repo-agent').map(b => b.sessionId);
  check('DR-10 each chunk goes out in its own fresh chat (a per-chunk sessionId), the repo\'s normal chat keeps its own',
    sids.length === 3 && sids[0] === `repo-agent-${repo.uuid}-phrun-abc1` && sids[1] === `repo-agent-${repo.uuid}-phrun-def2` && sids[2] === `repo-agent-${repo.uuid}`, JSON.stringify(sids));
  srv.close();

  // ── DR-2x wiring ──
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  const pb = api.slice(api.indexOf('async function _phaseBuild('), api.indexOf('async function _reviewDraft('));
  const rv = api.slice(api.indexOf('async function _reviewDraft('), api.indexOf('// §0.39.271 — one repo snapshot'));
  check('DR-20 a phase build asks in a fresh chat (session = its runId) and hands its result to the review', /const session = ri <= 0 && tryNo === 1 \? `\$\{runId\}\$\{tag\}` : `\$\{runId\}\$\{tag\}-r\$\{ri \+ 1\}t\$\{tryNo\}`/.test(pb)   /* §0.39.361 SB51 — tag is '' for a whole phase, -c<i> for a chunk */ && /RA\.dispatch\(\{[^}]*session,/.test(pb)   /* §CT6 — the first attempt's chat is the runId; each later rung or retry its own fresh chat */ && /_reviewDraft\(\{ r, state, absent,/.test(pb));
  check('DR-21 the review runs only when enabled, only for a local draft that came back, by a guardian agent, in its own chat, with its own shadow',
    /repos\.draft_then_review'\) === false\) return null/.test(rv) && /DR\.wasDraftedLocally\(r\)/.test(rv) && /DR\.reviewerFor\(v\('repos\.review_provider'\)/.test(rv)
    && /session: reviewRunId/.test(rv) && /step: 'phase\.review'/.test(rv) && /draftRunId: base\.runId/.test(rv));
  const core = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
  check('DR-22 draft_then_review (on) and review_provider (empty = guardian\'s first) are settings, not literals',
    core.resolve('repos.draft_then_review').def.default === true && core.resolve('repos.review_provider').def.type === 'string');
  check('DR-23 the plan panel labels reviewing / reviewed / skipped', /reviewing: 'reviewing', reviewed: 'reviewed', skipped: 'skipped'/.test(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8')));

  // manage runs hand a draft to review too (idearium build-surface → deps.reviewDraft, the same _reviewDraft)
  const BS = await import(path.join(ROOT, 'idearium', 'api', 'build-surface.js'));
  const reviews = [];
  const mk = (res) => ({ getRepoLayer: () => ({ get: () => ({ uuid: 'r-dr', name: 'dr' }), readTextFile: () => ({ content: 'x\n' }) }), repoDir: () => '/tmp/none',
    snapshot: async () => ({ ok: true, data: { commitId: 'c1' } }), appendRow: () => {}, emit: () => {},
    require: (p) => p.endsWith('repo-agent.js') ? { dispatch: async () => res } : require(path.join(ROOT, 'idearium', 'api', p)),
    reviewDraft: async (a) => { reviews.push(a); return null; } });
  await BS.manage(mk({ ok: true, providerUsed: 'ollama', injects: { injects: [{ path: 'src/a.js', uuid: 'i1' }], refused: [], unresolved: [] } }), 'r-dr', { path: 'src/a.js', action: 'rebuild', note: 'keep it' });
  await BS.manage(mk({ ok: true, text: 'prose' }), 'r-dr', { path: 'src/a.js', action: 'explain' });
  await new Promise(r => setTimeout(r, 60));
  check('DR-24 a manage run hands its result to the same review (writing actions only), with the file\'s run as base and James\'s note',
    reviews.length === 1 && reviews[0].base.map === 'file:src/a.js' && reviews[0].base.phase === 'REBUILD' && reviews[0].note === 'keep it' && reviews[0].state === 'replied', JSON.stringify(reviews.map(x => x.base)));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
run().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
