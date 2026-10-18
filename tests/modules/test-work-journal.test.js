'use strict';
/**
 * tests/modules/test-work-journal.test.js — TL1b (0.60.143): an agent's reply kept on disk as it streams.
 * Map: docs/2026-10-16-durable-work-timeline-phasemap.spec addendum (d).
 * James, 2026-10-18: "We need persistent data look at the last commit."
 *
 *   WJ-01  lib/work-journal.js: thinking before the reply, the reply as it grows (a restated reply replaces, a repeated tail
 *          is dropped, Ollama's deltas append), a dom pulse writes nothing new; on disk as a .response node and a timeline;
 *          after a restart (cache dropped) the reply and thinking come back byte-identical; a late chunk never reopens an
 *          ended job; a job with no frame for 15 min reads stale
 *   WJ-02  through idearium's real router: Ollama frames (POST agent/stream) land in the journal; GET agent/feed lists the
 *          newest, ?job= gives one with its timeline, an unknown job 404s; guardian's feed door journals too; the command
 *   WJ-03  Clear Glass: a page opened after the reply was written shows it again ("restored from disk"), its thinking too;
 *          a live frame after that wins
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '../..');
const UI = path.join(ROOT, 'idearium/ui');
process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, er = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = er; } };
function done() { console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`); process.exit(failed ? 1 : 0); }

(async () => {
  process.env.WORK_JOURNAL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-'));
  const WJ = require(path.join(ROOT, 'lib/work-journal.js'));

  await test('WJ-01', 'thinking, then the reply as it grows; on disk; back after a restart; ended stays ended; stale said', () => {
    const f = { repoUuid: 'r1', jobId: 'g-1', provider: 'gemini', source: 'transcript' };
    WJ.record({ ...f, event: 'dispatched' });
    WJ.record({ ...f, event: 'chunk', text: '', thinking: 'Reading the phase.', thinkingLen: 18, generating: true });
    let v = WJ.record({ ...f, event: 'chunk', text: 'Here it is', fullLen: 10, thinking: 'Reading the phase. Done.', generating: true });
    assert.deepStrictEqual([v.status, v.text, v.thinking], ['responding', 'Here it is', 'Reading the phase. Done.']);
    v = WJ.record({ ...f, event: 'chunk', text: 'Here it is:\nconst a = 1;' });   // restates and continues
    assert.strictEqual(v.text, 'Here it is:\nconst a = 1;');
    v = WJ.record({ ...f, event: 'chunk', text: 'const a = 1;' });                // a repeat of the tail
    assert.strictEqual(v.text, 'Here it is:\nconst a = 1;');
    const d = path.join(WJ.dir(), 'r1', 'g-1');
    const mtime = fs.statSync(path.join(d, 'reply.response')).mtimeMs;
    WJ.record({ ...f, event: 'progress', stage: 'dom', mutations: 40 });
    assert.strictEqual(fs.statSync(path.join(d, 'reply.response')).mtimeMs, mtime, 'a dom pulse writes nothing new');
    WJ.record({ ...f, event: 'gate', label: 'reply read', state: 'passed' });
    WJ.record({ ...f, event: 'complete', chars: 24 });
    WJ.record({ ...f, event: 'chunk', text: 'late' });
    const nx = require(path.join(ROOT, 'lib/node-export.js'));
    const env = nx.importFromFile(path.join(d, 'reply.response'));
    assert.strictEqual(env.type, 'response'); assert.ok(env.tags.includes('job:g-1'));
    const lines = fs.readFileSync(path.join(d, 'timeline.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(lines.map(l => l.event), ['dispatched', 'chunk', 'chunk', 'chunk', 'chunk', 'gate', 'complete', 'chunk'], 'one line per event, no dom pulse');
    assert.ok(!lines.some(l => 'text' in l), 'no text in the timeline (it is in the node)');
    WJ._reset();   // a restart: nothing in memory
    const back = WJ.get('r1', 'g-1', { timeline: true });
    assert.strictEqual(back.status, 'complete', 'a late chunk never reopens an ended job');
    assert.strictEqual(back.text, 'Here it is:\nconst a = 1;', 'byte-identical, and a late frame is kept off the reply');
    assert.strictEqual(back.thinking, 'Reading the phase. Done.');
    assert.strictEqual(back.timeline.length, 8);
    // Ollama: exact deltas, appended
    WJ.record({ repoUuid: 'r1', jobId: 'o-1', source: 'ollama', event: 'chunk', text: 'mv docs/', fullLen: 8 });
    assert.strictEqual(WJ.record({ repoUuid: 'r1', jobId: 'o-1', source: 'ollama', event: 'chunk', text: '/', fullLen: 9 }).text, 'mv docs//');
    // stale: open, nothing for 15 minutes
    const o = WJ.get('r1', 'o-1');
    assert.strictEqual(WJ.view({ ...o }, o.updatedAt + 16 * 60 * 1000).status, 'stale');
    assert.deepStrictEqual(WJ.list('r1').jobs.map(j => j.jobId), ['o-1', 'g-1'], 'newest first');
    assert.strictEqual(WJ.record({ event: 'chunk', text: 'x' }), null, 'no repo or job: nothing');
  });

  let listed = null, one = null;
  await test('WJ-02', 'the real router: Ollama frames journaled; GET agent/feed lists and reads one; guardian\'s door; the command', async () => {
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `wj-${Date.now()}`, source: 'test', compartmentId: 'c-wj', files: [{ path: 'lib/a.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    assert.ok(made && made.repo, JSON.stringify(made).slice(0, 200));
    const u = made.repo.uuid;
    for (const b of [{ event: 'dispatched', jobId: 'oj-1', model: 'q:7b' }, { event: 'chunk', jobId: 'oj-1', model: 'q:7b', text: 'function census', fullLen: 15, generating: true }, { event: 'chunk', jobId: 'oj-1', model: 'q:7b', text: '() {}', fullLen: 20 }]) {
      const r = await quiet(() => api._route('POST', `/api/repos/${u}/agent/stream`, b));
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    }
    const l = await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?limit=5`));
    assert.strictEqual(l.status, 200, JSON.stringify(l.json).slice(0, 200));
    assert.deepStrictEqual(l.json.jobs.map(j => [j.jobId, j.text, j.provider]), [['oj-1', 'function census() {}', 'ollama · q:7b']]);
    const g = await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?job=oj-1`));
    assert.strictEqual(g.status, 200); assert.strictEqual(g.json.job.timeline.length, 3);
    assert.strictEqual((await quiet(() => api._route('GET', `/api/repos/${u}/agent/feed?job=nope`))).status, 404);
    listed = l.json; one = g.json;
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/_repoActivity\(\)\.feed\(fp\);[^\n]*\n\s*_journal\(fp\);/.test(src), 'guardian\'s feed door (lib/guardian-stream.cjs onFeed) journals each frame');
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = RC.SPEC.find(r => r.key === 'repo.feed');
    assert.strictEqual(row.req({ repo: { uuid: 'u' }, args: ['oj-1'], flags: {} }).path, '/api/repos/u/agent/feed?job=oj-1');
    assert.strictEqual(RC.SPEC.filter(r => r.key === 'repo.feed').length, 1, 'one row');
  });

  // ── WJ-03 the page, in Clear Glass ──
  const APP = fs.readFileSync(path.join(UI, 'js', 'app.js'), 'utf8');
  const fa = APP.indexOf('const AGENT_FEED = new Map();'), fb = APP.indexOf('function _agentTranscript(uuid) {');
  const css = fs.readFileSync(path.join(UI, 'css', 'code-surface.css'), 'utf8');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wj-ui-'));
  const job = { ...(one && one.job), thinking: 'The census needs a command row.', thinkingLen: 31 };
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="cs-live" data-al="r1"></div>
<script>
  let CURRENT_API_REPO = { uuid: 'r1' };
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  const LISTED = ${JSON.stringify(listed || { jobs: [] })}, ONE = ${JSON.stringify({ job })};
  async function api(p) { return p.includes('job=') ? ONE : LISTED; }
  ${APP.slice(fa, fb)}
</script></body></html>`);
  const glass = require('../../clear-glass/src/driver/glass.js');
  const eng = glass.engine();
  if (!eng) { console.log('  - WJ-03 SKIPPED: Clear Glass has no engine here (no Electron binary, no Chromium) — the browser check did not run'); skipped++; return done(); }
  let browser;
  try { browser = await glass.chromium.launch(); }
  catch (e) { console.log(`  - WJ-03 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; return done(); }
  console.log(`  · driven by Clear Glass (clear-glass/src/driver/glass.js), engine: ${eng.kind}`);
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
    await test('WJ-03', 'Clear Glass: a page opened after the reply shows it again, restored from disk; a live frame then wins', async () => {
      await page.evaluate(() => agentLivePaint('r1'));
      await page.waitForSelector('.cs-live [data-restored]');
      const t = await page.textContent('.cs-live');
      assert.match(t, /restored from disk · responding/);
      assert.match(t, /function census\(\) \{\}/, 'the reply so far');
      assert.match(t, /its thinking · 31ch/, 'its thinking, folded');
      await page.evaluate(() => _agentFeedIn({ repoUuid: 'r1', event: 'chunk', jobId: 'oj-2', source: 'ollama', provider: 'ollama', text: 'NEW', fullLen: 3, generating: true }));
      const t2 = await page.textContent('.cs-live');
      assert.ok(/NEW/.test(t2) && !/restored from disk/.test(t2), 'the live job replaces the restored one');
      assert.deepStrictEqual(errors, []);
    });
  } finally { await browser.close(); }
  done();
})();
