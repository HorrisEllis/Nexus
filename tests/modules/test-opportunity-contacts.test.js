'use strict';
/**
 * tests/modules/test-opportunity-contacts.test.js — the contacts behind job applications (AP2–AP4, 0.60.281)
 * James, 2026-10-29: "also capturing the contact info for job applications."
 *
 *   OC-01  fromPage takes only what the page shows: mailto/tel links, emails and phones in the text; no-reply, dates, prices, image names left
 *   OC-02  add / merge / update / archive: one per person per job, a capture never overwrites his edit, archived not deleted, ledgered
 *   OC-03  capture(): the job page read → the job and its contacts, in one call
 *   OC-04  the door: Copilot's routes, the command rows (through copilot), the agent tool's actions
 *   OC-05  Clear Glass reaches them only through Copilot: the bridge proxies an allowlist, says when Copilot is down
 *   OC-06  Settings › Applications in Clear Glass: contacts and jobs shown; add, archive; Copilot down said
 */
require('../../lib/test-sandbox.js').ensure();
process.env.JAA_DATA_DIR = require('path').join(require('os').tmpdir(), `oc-test-${Date.now()}`);
const assert = require('assert');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const _log = console.log; const quiet = (fn) => async (...a) => { console.log = (...x) => { if (!/^\[jaa/.test(String(x[0]))) _log(...x); }; try { return await fn(...a); } finally { console.log = _log; } };

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await quiet(fn)(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const PAGE = { url: 'https://jobs.acme.io/role/42', title: 'Backend Engineer at Acme', headings: [{ level: 1, text: 'Backend Engineer' }],
  text: 'Backend Engineer at Acme. Questions? Write to Jane Doe, jane.doe@acme.io, or call +1 (503) 555-0142. Posted 2026-10-29. Pay $120,000 – $140,000. '
    + 'Logo logo@2x.png. Do not write to noreply@acme.io. Hiring: talent@acme.io',
  links: [{ text: 'Jane Doe', href: 'mailto:jane.doe@acme.io?subject=Backend' }, { text: 'Call us', href: 'tel:+15035550142' }, { text: 'Apply', href: 'https://jobs.acme.io/apply' }],
  fields: [], buttons: [] };

(async () => {
  console.log('\n⬡  The contacts behind job applications\n');
  const O = require(path.join(ROOT, 'lib/opportunity'));
  const C = O.contacts;

  await test('OC-01', 'fromPage: mailto/tel links, emails and phones in the text; never no-reply, dates, prices or image names', async () => {
    const f = C.fromPage(PAGE, { company: 'Acme' });
    assert.deepStrictEqual(f.map(x => x.email || x.phone), ['jane.doe@acme.io', '+15035550142', 'talent@acme.io']);
    assert.deepStrictEqual([f[0].name, f[0].how, f[1].how, f[2].how, f[0].company], ['Jane Doe', 'mailto link', 'tel link', 'in the page text', 'Acme']);
    assert.deepStrictEqual(C.fromPage({ text: 'nothing to reach here, 2026-10-29, $5,000' }), []);
  });

  await test('OC-02', 'add / merge / update / archive: one per person per job; his edit kept; archived, not deleted; ledgered', async () => {
    const a = C.add({ name: 'Sam Lee', email: 'Sam@Beta.dev', company: 'Beta', oppId: 'job-b' }, { by: 'user', source: 'hand' });
    assert.ok(a.ok && a.created && a.contact.email === 'sam@beta.dev' && a.contact.source === 'hand', JSON.stringify(a));
    const again = C.add({ email: 'sam@beta.dev', role: 'Recruiter', oppId: 'job-b' }, { by: 'agent', source: 'page' });
    assert.deepStrictEqual([again.merged, C.get(a.contact.id).role], [['role'], 'Recruiter'], 'a capture fills only what was empty');
    const noOverwrite = C.add({ email: 'sam@beta.dev', name: 'S. Lee', oppId: 'job-b' }, { by: 'agent', source: 'page' });
    assert.ok(noOverwrite.deduped && C.get(a.contact.id).name === 'Sam Lee', 'his name stays');
    assert.ok(C.add({ email: 'sam@beta.dev', oppId: 'job-c' }).created, 'the same person on another job is another row');
    const u = C.update(a.contact.id, { phone: '503 555 0199', status: 'emailed' });
    assert.deepStrictEqual([u.contact.phone, u.contact.status], ['503 555 0199', 'emailed']);
    assert.match(C.update(a.contact.id, { email: 'nope' }).error, /not an email address/);
    assert.match(C.update(a.contact.id, {}).error, /nothing to change/);
    assert.match(C.add({}).error, /needs an email, a phone, a name, a site or a LinkedIn/);
    C.archive(a.contact.id);
    assert.ok(!C.list({ oppId: 'job-b' }).length && C.list({ oppId: 'job-b', includeArchived: true }).length === 1, 'archived: out of the list, kept');
    C.archive(a.contact.id, { archived: false });
    assert.strictEqual(C.list({ oppId: 'job-b' }).length, 1);
    assert.strictEqual(C.list({ q: 'recruit' }).length, 1, 'search reads every field');
    const types = require(path.join(ROOT, 'lib/opportunity/store.js')).jaa().query('opportunity_ledger', r => r.shape === 'contact').map(r => r.type);
    for (const t of ['contact.added', 'contact.merged', 'contact.edited', 'contact.archived', 'contact.restored']) assert.ok(types.includes(t), `${t} in the ledger: ${types}`);
  });

  await test('OC-03', 'capture(): the page read → the job and its contacts', async () => {
    O.setBrowser(async (a) => (a.action === 'read' ? PAGE : { ok: true }));
    const r = await O.capture({ agentId: 't' });
    assert.ok(r.ok && r.contacts && r.contacts.added === 3, JSON.stringify(r));
    const mine = C.list({ oppId: r.id });
    assert.deepStrictEqual(mine.map(c => c.email || c.phone).sort(), ['+15035550142', 'jane.doe@acme.io', 'talent@acme.io']);
    assert.ok(mine.every(c => c.source === 'page' && c.oppTitle === 'Backend Engineer' && c.pageUrl === PAGE.url));
    assert.strictEqual(C.withStatus(mine[0]).status, r.stage, 'no status of his → the job\'s stage');
    const r2 = await O.capture({ agentId: 't' });
    assert.deepStrictEqual([r2.contacts.added, r2.contacts.held], [0, 3], 'read again: nothing doubled');
    O.setBrowser(null);
  });

  await test('OC-04', 'the door: Copilot\'s routes, the command rows, the agent tool', async () => {
    const R = require(path.join(ROOT, 'copilot/routes/opportunity.js'));
    const hit = async (method, p, body) => {
      let out = null; const url = new URL('http://x' + p);
      await R.handle({}, {}, { method, url, pathname: url.pathname, json: (res, code, d) => { out = { code, d }; }, readBody: async () => body || {} });
      return out;
    };
    const add = await hit('POST', '/api/opportunity/contacts', { name: 'Ana Ruiz', email: 'ana@gamma.co', by: 'agent' });
    assert.ok(add.code === 200 && add.d.contact.by === 'user', 'by is the route\'s, never the body\'s: ' + JSON.stringify(add));
    const id = add.d.contact.id;
    assert.strictEqual((await hit('GET', '/api/opportunity/contacts?q=gamma')).d.contacts.length, 1);
    assert.strictEqual((await hit('PUT', `/api/opportunity/contacts/${id}`, { role: 'CTO' })).d.contact.role, 'CTO');
    assert.strictEqual((await hit('POST', `/api/opportunity/contacts/${id}/archive`, {})).d.contact.archived, true);
    assert.strictEqual((await hit('PUT', '/api/opportunity/contacts/nope', { role: 'x' })).code, 404);
    assert.strictEqual((await hit('GET', '/api/opportunity/contacts?archived=1&q=gamma')).d.contacts.length, 1);
    const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const rows = Object.fromEntries(SPEC.filter(r => r.key.startsWith('opp.')).map(r => [r.key, r]));
    assert.deepStrictEqual(rows['opp.contacts'].req({ args: [], flags: { q: 'acme' } }), { system: 'copilot', method: 'GET', path: '/api/opportunity/contacts?q=acme' });
    assert.deepStrictEqual(rows['opp.contact'].req({ args: ['add'], flags: { email: 'a@b.co', opp: 'j1' } }), { system: 'copilot', method: 'POST', path: '/api/opportunity/contacts', body: { email: 'a@b.co', oppId: 'j1' } });
    assert.deepStrictEqual(rows['opp.contact'].req({ args: ['archive', 'k1'], flags: {} }).path, '/api/opportunity/contacts/k1/archive');
    assert.ok(rows['opp.contact'].need({ args: ['edit'] }), 'edit needs an id');
    const T = require(path.join(ROOT, 'lib/agent-tools/tools/opportunity/opportunity.js'));
    const ta = await T.execute({ action: 'contact_add', contact: { email: 'lee@delta.io' } });
    assert.ok(ta.ok && ta.contact.by === 'agent', JSON.stringify(ta));
    assert.ok((await T.execute({ action: 'contacts', query: 'delta' })).contacts.length === 1);
    assert.ok((await T.execute({ action: 'contact_edit', contactId: ta.contact.id, contact: { name: 'Lee' } })).contact.name === 'Lee');
    assert.ok((await T.execute({ action: 'contact_archive', contactId: ta.contact.id })).contact.archived);
  });

  // a stand-in Copilot for the bridge and the screen
  const seen = [];
  const jobs = [{ id: 'j1', title: 'Backend Engineer', company: 'Acme', stage: 'NEEDS_INPUT', kind: 'job', score: 81, url: 'https://jobs.acme.io/role/42' }];
  let contacts = [{ id: 'c1', name: 'Jane Doe', role: 'Recruiter', company: 'Acme', email: 'jane.doe@acme.io', phone: '+1 503 555 0142', oppId: 'j1', oppTitle: 'Backend Engineer', status: 'NEEDS_INPUT', source: 'page', how: 'mailto link', archived: false, updatedAt: Date.now() }];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      seen.push(`${req.method} ${req.url}${b ? ' ' + b : ''}`);
      res.setHeader('Content-Type', 'application/json');
      if (req.url.startsWith('/api/opportunity/list')) return res.end(JSON.stringify({ ok: true, items: jobs }));
      if (req.method === 'GET' && req.url.startsWith('/api/opportunity/contacts')) return res.end(JSON.stringify({ ok: true, contacts }));
      if (req.method === 'POST' && req.url === '/api/opportunity/contacts') { const c = { id: 'c2', ...JSON.parse(b), source: 'hand', archived: false }; contacts = contacts.concat(c); return res.end(JSON.stringify({ ok: true, contact: c, created: true })); }
      if (/\/archive$/.test(req.url)) { contacts = contacts.map(c => (req.url.includes(c.id) ? { ...c, archived: true } : c)); return res.end(JSON.stringify({ ok: true })); }
      res.statusCode = 404; res.end(JSON.stringify({ ok: false, error: 'no route' }));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const prevPort = process.env.COPILOT_PORT;
  process.env.COPILOT_PORT = String(srv.address().port);

  await test('OC-05', 'Clear Glass reaches them only through Copilot: an allowlisted proxy; Copilot down is said', async () => {
    const Bridge = require(CG('src/ipc/bridge.js'));
    const call = (d) => Bridge.prototype._opportunityCall.call({}, d);
    assert.strictEqual((await call({ method: 'GET', path: '/api/opportunity/contacts?q=acme' })).contacts.length, 1);
    assert.match((await call({ method: 'POST', path: '/api/opportunity/j1/submit' })).error, /not an Applications route: POST \/api\/opportunity\/j1\/submit/);
    assert.match((await call({ method: 'GET', path: '/api/agent/current' })).error, /not an Applications route/);
    assert.match((await call({ method: 'DELETE', path: '/api/opportunity/contacts/c1' })).error, /not an Applications route/);
    process.env.COPILOT_PORT = '1';
    const down = await call({ method: 'GET', path: '/api/opportunity/list' });
    assert.ok(down.down && /Copilot is not running/.test(down.error), JSON.stringify(down));
    process.env.COPILOT_PORT = String(srv.address().port);
    const rd = require('fs').readFileSync(CG('src/preload/index.js'), 'utf8');
    assert.ok(/applications: \{\n    call: \(method, path, body\) => ipcRenderer\.invoke\('applications:call'/.test(rd));
    assert.deepStrictEqual(require(CG('src/driver/cg-stub.js')).names().ns.applications, ['call'], 'one namespace the stub reads as such (a one-line one swallowed the next)');
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - OC-06 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) await test('OC-06', 'Settings › Applications in Clear Glass: contacts and jobs; add; archive; Copilot down said', async () => {
    const Bridge = require(CG('src/ipc/bridge.js'));
    const { initScript } = require(CG('src/driver/cg-stub.js'));
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
    // the page's cg.applications.call goes through the real bridge proxy to the stand-in Copilot
    await page.exposeFunction('__oppCall', (d) => Bridge.prototype._opportunityCall.call({}, d));
    await page.addInitScript(initScript({ answers: { 'options.get': {}, 'accounts.list': [] } }));
    await page.addInitScript('window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) });'
      + 'window.ClearGlass.applications = { call: (method, path, body) => window.__oppCall({ method, path, body }) };');
    await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#applications');
    await page.waitForSelector('[data-contact="c1"]', { timeout: 5000 });
    const text = await page.evaluate(() => document.querySelector('main').textContent);
    for (const t of ['Jane Doe · Recruiter', 'jane.doe@acme.io', 'from the page · mailto link', 'Backend Engineer', '1 contact', 'NEEDS_INPUT']) assert.ok(text.includes(t), `shows "${t}"`);
    // add by hand
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Add a contact').click());
    await page.waitForSelector('.modal');
    await page.fill('.modal input[data-k="name"]', 'Ana Ruiz');
    await page.fill('.modal input[data-k="email"]', 'ana@gamma.co');
    await page.selectOption('.modal select[data-k="oppId"]', 'j1');
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Add').click());
    await page.waitForSelector('[data-contact="c2"]', { timeout: 5000 });
    assert.ok(seen.some(s => s === 'POST /api/opportunity/contacts {"name":"Ana Ruiz","email":"ana@gamma.co","oppId":"j1"}'), seen.join('\n'));
    // archive
    await page.evaluate(() => [...document.querySelectorAll('[data-contact="c1"] button')].find(b => b.textContent === 'Archive').click());
    await page.waitForTimeout(400);
    assert.ok(seen.some(s => /^POST \/api\/opportunity\/contacts\/c1\/archive \{"archived":true\}$/.test(s)), seen.join('\n'));
    // Copilot down
    process.env.COPILOT_PORT = '1';
    await page.evaluate(() => window.CGS.show('applications'));
    await page.waitForFunction(() => /Copilot is not running/.test(document.querySelector('main').textContent), null, { timeout: 5000 });
    process.env.COPILOT_PORT = String(srv.address().port);
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  if (browser) try { await browser.close(); } catch (_) {}
  srv.close(); if (prevPort === undefined) delete process.env.COPILOT_PORT; else process.env.COPILOT_PORT = prevPort;
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
