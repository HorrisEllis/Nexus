'use strict';
/**
 * tests/modules/test-idearium-solid.test.js — §SD0 · SD2 · SD3 0.56.0 (docs/2026-10-10-idearium-solid-phasemap.spec).
 * James: "maybe we get idearium solid then start finally using nexus to build nexus". SD1 (versions and rewind on the
 * repo's box) is proven in Clear Glass: tests/probe/idearium-one-surface-glass.js.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  const snap = await import(pathToFileURL(path.join(ROOT, 'idearium/repo/snapshot.js')).href);

  await test('SO-01', 'SD0 — a dropped versionium connection is tried again while it comes back, and said', async () => {
    let n = 0; const retries = [];
    const r = await snap._againWhileDown('plan', async () => { if (++n < 3) throw new Error('[nexus-client] versionium unreachable at 127.0.0.1:3754 — read ECONNRESET'); return 'planned'; },
      { waits: [1, 1, 1], sleep: async () => {}, onRetry: (x) => retries.push(x.attempt) });
    assert.strictEqual(r, 'planned'); assert.deepStrictEqual(retries, [1, 2]);
  });

  await test('SO-02', 'SD0 — still down after the waits: the refusal says how long it waited and what to start', async () => {
    await assert.rejects(snap._againWhileDown('stage', async () => { throw new Error('versionium unreachable — connect ECONNREFUSED'); }, { waits: [1000, 2000], sleep: async () => {} }),
      (e) => /tried 3 times over 3 s/.test(e.message) && /node versionium\/server\.js/.test(e.message));
  });

  await test('SO-03', 'SD0 — a real refusal (not a dropped connection) is not retried', async () => {
    let n = 0;
    await assert.rejects(snap._againWhileDown('plan', async () => { n++; throw new Error('HTTP 400 — invalid JSON body'); }, { waits: [1, 1], sleep: async () => {} }));
    assert.strictEqual(n, 1);
  });

  await test('SO-04', 'SD0 — versionium answers an oversized upload with 413 on a live connection, not a reset (the ECONNRESET James saw)', async () => {
    const { readRawBody, json } = require(path.join(ROOT, 'versionium/lib/http-utils.js'));
    const srv = http.createServer(async (req, res) => {
      try { await readRawBody(req, 1000); json(res, 200, { ok: true }); }
      catch (e) { json(res, 413, { ok: false, error: e.message }); }
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    try {
      const body = Buffer.alloc(3 * 1024 * 1024, 97);
      const got = await new Promise((resolve) => {
        const rq = http.request({ host: '127.0.0.1', port: srv.address().port, method: 'POST', path: '/', headers: { 'Content-Length': body.length } },
          (rs) => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => resolve({ status: rs.statusCode, d })); });
        rq.on('error', (e) => resolve({ error: e.code || e.message }));
        rq.end(body);
      });
      assert.strictEqual(got.status, 413, JSON.stringify(got));
      assert.ok(/exceeds 1000 byte limit/.test(got.d));
    } finally { srv.close(); }
  });

  await test('SO-05', 'SD2 — both copilot prompt handlers turn an empty answer into ok:false with lifeline\'s reason', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/function _noAnswer\(/.test(src));
    assert.strictEqual((src.match(/if \(!String\(text \|\| ''\)\.trim\(\)\) \{ json\(res, 200, _noAnswer\(/g) || []).length, 2, 'both /api/prompt handlers');
    assert.strictEqual((src.match(/lifeError = (life|lifeResult) && !(life|lifeResult)\.ok \? /g) || []).length, 2, 'both keep lifeline\'s error');
  });

  await test('SO-06', 'SD3 — when the economy holds a job someone waits on, a background job for that agent steps back', async () => {
    const { createDispatcher } = require(path.join(ROOT, 'guardian/lib/dispatcher.js'));
    const jobs = new Map(), listeners = new Map(), sent = [];
    const bus = { emit: (n, p) => { for (const f of listeners.get(n) || []) f({ type: n, data: p }); }, on: (n, f) => { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); }, off: () => {} };
    let gapOpen = false;
    const economy = { check: () => (gapOpen ? { verdict: 'allow' } : { verdict: 'wait', ms: 60000, reason: 'gap' }), begin: () => {} };
    const d = createDispatcher({
      updateJob: (id, p) => { const j = jobs.get(id); if (j) Object.assign(j, p); return j; }, bus, pendingQueue: new Map(), cockpitBroadcast: () => {},
      ncp: { isConnected: () => true, push: () => 1, pushActive: (p, payload) => { sent.push(payload.jobId); return 1; } },
      dispatchToMistral: async () => {}, dispatchToDeepseek: async () => {}, pingTimeoutMs: 5, economy, getJob: (id) => jobs.get(id), pickupMs: 60000,
    });
    jobs.set('person', { id: 'person', provider: 'chatgpt', prompt: 'hi', status: 'pending', priority: 'high' });
    jobs.set('build', { id: 'build', provider: 'chatgpt', prompt: 'chunk', status: 'pending', priority: 'normal' });
    d.dispatchJob(jobs.get('person'));                 // held by the gap
    assert.strictEqual(jobs.get('person').status, 'queued');
    gapOpen = true;
    d.dispatchJob(jobs.get('build'));                  // the gap opens: the background job would go — it steps back
    assert.ok(/someone is waiting on goes first/.test(jobs.get('build').queueReason || ''), jobs.get('build').queueReason);
    d.dispatchJob(jobs.get('person'));                 // the person's job takes the slot
    await new Promise(r => setTimeout(r, 50));
    assert.deepStrictEqual(sent, ['person']);
    d.cancel('build');
  });

  await test('SO-07', 'SD3 — askSync marks its job high unless the caller says it is background', async () => {
    const { askSync } = require(path.join(ROOT, 'guardian/ask.js'));
    const created = [];
    await askSync('hello', { provider: 'chatgpt', timeoutMs: 600 }, {
      createJob: (o) => { const j = { id: 'a', status: 'pending', ...o }; created.push(j); return j; },
      dispatchJob: () => {}, getJob: () => ({ id: 'a', status: 'complete', response: 'ok' }), isProviderConnected: () => true,
    });
    await askSync('hello', { provider: 'chatgpt', timeoutMs: 600, priority: 'normal' }, {
      createJob: (o) => { const j = { id: 'b', status: 'pending', ...o }; created.push(j); return j; },
      dispatchJob: () => {}, getJob: () => ({ id: 'b', status: 'complete', response: 'ok' }), isProviderConnected: () => true,
    });
    assert.deepStrictEqual(created.map(j => j.priority), ['high', 'normal']);
    const loop = fs.readFileSync(path.join(ROOT, 'guardian/routes/autonomous-loop.js'), 'utf8');
    assert.ok(/priority: 'normal'/.test(loop), 'the autonomous loop is background');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
