'use strict';
/**
 * tests/modules/test-spec-blanks.test.js — §0.47.0 SP2: a repo's spec says what is blank, and drafts it as proposals.
 * James: "also the spec engine needs to have autocomplete for the areas that are blank."
 * The real Idearium API (api._route), the real workshop (idearium/lib/workshop.js) with its model stood in (setAsk),
 * versionium's own routes served on its configured port.
 */
process.env.NEXUS_VERSION_SETTLE_MS = '150';
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack.split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  console.log('\n⬡  SP2 — complete the blanks\n');
  const routes = [require(path.join(ROOT, 'versionium/routes/versionium.js')), require(path.join(ROOT, 'versionium/routes/files.js'))];
  const port = require(path.join(ROOT, 'lib/nexus-config.js')).getPath('ports', {}).versionium;
  const sv = http.createServer(async (req, rs) => { const url = new URL(req.url, 'http://x'); const ctx = { method: req.method, url, pathname: url.pathname };
    for (const r of routes) { try { if (await r.handle(req, rs, ctx)) return; } catch (e) { rs.writeHead(500); rs.end('{}'); return; } } rs.writeHead(404); rs.end('{}'); });
  await new Promise((res, rej) => { sv.once('error', rej); sv.listen(port, '127.0.0.1', res); }).catch(e => { console.error(`  ✗ versionium's port ${port} is taken (${e.code})`); process.exit(1); });

  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const w0 = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Orchard Ledger' })).json.workshop;
  await R('POST', `/api/workshop/${w0.uuid}`, { sections: [{ id: 'purpose', body: 'Track every tree in an orchard.' }, { add: true, title: 'Data schema', body: 'A tree has a species, a row and a planted date.' }, { add: true, title: 'Integration', body: '' }] });
  const repoUuid = (await R('POST', `/api/workshop/${w0.uuid}/save`, {})).json.repoUuid;
  assert.ok(repoUuid, 'the workshop saved a repo');
  const WS = await import(pathToFileURL(path.join(ROOT, 'idearium/lib/workshop.js')).href);
  const asked = [];
  WS.setAsk(async (prompt) => { asked.push(prompt); return { ok: true, by: 'stand-in', text: '- The ledger reads its trees from the nursery feed over HTTP.\n- It posts a harvest event to the bus each season.' }; });

  let specPath;
  await test('SP2-01', 'GET …/spec/blanks: the spec\'s blank sections, by id and title (a filled one is not)', async () => {
    const r = await R('GET', `/api/repos/${repoUuid}/spec/blanks`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    specPath = r.json.specPath;
    const ids = r.json.blank.map(b => b.id);
    assert.ok(ids.includes('integration'), JSON.stringify(r.json.blank));
    assert.ok(!ids.includes('purpose') && !ids.includes('data-schema'), JSON.stringify(r.json.blank));
  });

  await test('SP2-02', 'POST …/spec/complete drafts each blank part as workshop PROPOSALS — the spec itself is not changed', async () => {
    const before = (await R('GET', `/api/repos/${repoUuid}/file?path=${encodeURIComponent(specPath)}`)).json.content;
    const r = await R('POST', `/api/repos/${repoUuid}/spec/complete`, {});
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const it = r.json.results.find(x => x.section === 'integration');
    assert.ok(it && it.ok && it.proposals >= 1, JSON.stringify(r.json.results));
    assert.ok(asked.some(p => /Integration/i.test(p)), 'the model was asked about that section');
    const w = (await R('GET', `/api/workshop/${r.json.workshopId}`)).json.workshop;
    assert.ok(w.proposals.some(p => p.status === 'open' && p.sectionId === 'integration'), 'open proposals for the section');
    assert.strictEqual((await R('GET', `/api/repos/${repoUuid}/file?path=${encodeURIComponent(specPath)}`)).json.content, before, 'a draft wrote the spec');
    const again = await R('POST', `/api/repos/${repoUuid}/spec/complete`, { section: 'integration' });
    assert.strictEqual(again.json.workshopId, r.json.workshopId, 'the open workshop on this spec is reused');
  });

  await test('SP2-03', 'the command: idearium repo blanks <repo> [complete] (copilot has it through nexus.command)', async () => {
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = SPEC.find(x => x.key === 'repo.blanks');
    assert.ok(row);
    assert.strictEqual(row.req({ repo: { uuid: 'u' }, args: ['complete'], flags: { section: 'api' } }).body.section, 'api');
    assert.strictEqual(row.req({ repo: { uuid: 'u' }, args: [], flags: {} }).path, '/api/repos/u/spec/blanks');
  });

  WS.setAsk(null);
  sv.close();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
