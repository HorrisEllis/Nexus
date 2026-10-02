'use strict';
/**
 * tests/modules/test-proof-run.test.js — 0.39.302 PR1, the delivery checker (idearium/repo/proof-run.js).
 * James: "Yes, then I can use idearium to build anything needed." · "what about shadow space reasoning for the debugging?"
 *
 *   PR-01  conditions: made whole or named invalid (kept, reported, never dropped); ids unique; limits
 *   PR-02  a real fixture project: file / contains / command / output / tests, met and unmet, each with its mode,
 *          its cause in plain words and its evidence; a path outside the project refused
 *   PR-03  the app: started from its start command, its pages checked (status, content), and ALWAYS stopped —
 *          the port is free afterwards; a start that never answers → every page condition says app_did_not_start
 *   PR-04  the shadow: the whole end state declared before running; unmet conditions come back absent (with gaps
 *          when the gap field is reachable) — the debugging is "what was expected and is not there"
 *   PR-05  the report: READY / NOT READY in plain words, a row per promise, "what is missing, and why", written to
 *          proof/PROOF-REPORT.md, the run kept in .nexus/proof-runs and read back as the last proof
 *   PR-06  the agent only proposes: its reply parsed into conditions, nothing run; garbage refused
 *   PR-07  wired: routes in idearium's table with CAPS, the CLI verbs, loom, events in idearium's taxonomy
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
function freePort() { return new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); }
function portFree(port) { return new Promise(r => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); }); }

function fixture(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-run-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# Orbit Garden\nPlans beds by sunlight.\n');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'orbit', scripts: { test: 'node test.js' } }));
  fs.writeFileSync(path.join(dir, 'test.js'), "const a=require('assert');a.strictEqual(1+1,2);console.log('all good');\n");
  fs.writeFileSync(path.join(dir, 'server.js'), `require('http').createServer((q,s)=>{ if(q.url==='/') { s.writeHead(200,{'content-type':'text/html'}); s.end('<h1>Orbit Garden</h1><a href=/contact>Contact</a>'); } else if(q.url==='/about') { s.writeHead(200); s.end('About us'); } else { s.writeHead(404); s.end('nope'); } }).listen(${port},'127.0.0.1');\n`);
  return dir;
}

(async () => {
  console.log('\ntest-proof-run — the delivery checker (0.39.302 PR1)');
  const P = await import(path.join(ROOT, 'idearium/repo/proof-run.js'));

  await test('PR-01', 'conditions are made whole or named invalid — never dropped', async () => {
    assert.strictEqual(P.normalizeConditions([]).ok, false);
    assert.strictEqual(P.normalizeConditions(new Array(61).fill({ says: 'x', check: { kind: 'tests' } })).ok, false);
    const n = P.normalizeConditions([{ says: 'The readme exists', check: { kind: 'file', path: 'README.md' } }, { says: 'The readme exists', check: { kind: 'file', path: 'x' } }, { says: 'Weird', check: { kind: 'vibes' } }, { check: { kind: 'tests' } }, { says: 'No path', check: { kind: 'page' } }]);
    assert.ok(n.ok); assert.strictEqual(n.conditions.length, 5);
    assert.notStrictEqual(n.conditions[0].id, n.conditions[1].id, 'ids unique');
    assert.strictEqual(n.errors.length, 3, JSON.stringify(n.errors));
    assert.match(n.errors.join(' '), /"vibes" is not one of file, command, tests, page/);
  });

  const port = await freePort();
  const dir = fixture(port);
  let run;
  await test('PR-02', 'a real project: met and unmet conditions, each with its mode, cause and evidence', async () => {
    const r = await P.runProof({ repoDir: dir, subject: 'Orbit Garden', write: true, conditions: [
      { says: 'The project has a readme', check: { kind: 'file', path: 'README.md' } },
      { says: 'The readme explains sunlight planning', check: { kind: 'file', path: 'README.md', contains: 'sunlight' } },
      { says: 'There is a licence', check: { kind: 'file', path: 'LICENSE' } },
      { says: 'The readme mentions pricing', check: { kind: 'file', path: 'README.md', contains: 'Pricing' } },
      { says: 'Node is available', check: { kind: 'command', run: 'node -e "console.log(42)"', contains: '42' } },
      { says: 'The build script works', check: { kind: 'command', run: 'node -e "process.exit(3)"' } },
      { says: 'All tests pass', check: { kind: 'tests' } },
      { says: 'Nothing outside the project is read', check: { kind: 'file', path: '../../etc/passwd' } },
    ] });
    assert.ok(r.ok, r.error); run = r.run;
    const by = Object.fromEntries(run.results.map(x => [x.says, x]));
    assert.ok(by['The project has a readme'].met && by['The readme explains sunlight planning'].met && by['Node is available'].met && by['All tests pass'].met);
    assert.strictEqual(by['There is a licence'].mode, 'file_missing');
    assert.strictEqual(by['The readme mentions pricing'].mode, 'content_missing');
    assert.strictEqual(by['The build script works'].mode, 'command_failed'); assert.match(by['The build script works'].evidence, /exit 3/);
    assert.strictEqual(by['Nothing outside the project is read'].mode, 'invalid'); assert.match(by['Nothing outside the project is read'].evidence, /outside the project/);
    for (const x of run.results.filter(x => !x.met)) assert.ok(x.cause && x.cause.length > 20, `${x.says} has a plain cause`);
    assert.strictEqual(run.verdict, 'not-ready'); assert.strictEqual(run.met, 4); assert.strictEqual(run.total, 8);
    assert.deepStrictEqual(run.modes, { file_missing: 1, content_missing: 1, command_failed: 1, invalid: 1 });
  });

  await test('PR-03', 'the app is started, its pages checked, and always stopped', async () => {
    const r = await P.runProof({ repoDir: dir, write: false, start: { command: 'node server.js', url: `http://127.0.0.1:${port}/`, readyMs: 15000 }, conditions: [
      { says: 'The home page shows the name', check: { kind: 'page', path: '/', contains: 'Orbit Garden' } },
      { says: 'The about page loads', check: { kind: 'page', path: '/about' } },
      { says: 'The contact page loads', check: { kind: 'page', path: '/contact' } },
      { says: 'The home page shows prices', check: { kind: 'page', path: '/', contains: '$40' } },
    ] });
    assert.ok(r.ok, r.error);
    const by = Object.fromEntries(r.run.results.map(x => [x.says, x]));
    assert.ok(r.run.app.started);
    assert.ok(by['The home page shows the name'].met && by['The about page loads'].met);
    assert.strictEqual(by['The contact page loads'].mode, 'page_status'); assert.match(by['The contact page loads'].evidence, /answered 404, expected 200/);
    assert.strictEqual(by['The home page shows prices'].mode, 'page_content_missing');
    await new Promise(res => setTimeout(res, 2500));
    assert.ok(await portFree(port), 'the app was stopped — its port is free again');
    const dead = await P.runProof({ repoDir: dir, write: false, start: { command: 'node -e "setTimeout(()=>{},60000)"', url: `http://127.0.0.1:${port}/`, readyMs: 1500 }, conditions: [{ says: 'Home loads', check: { kind: 'page', path: '/' } }] });
    assert.strictEqual(dead.run.results[0].mode, 'app_did_not_start'); assert.match(dead.run.app.why, /nothing answered/);
    const none = await P.runProof({ repoDir: dir, write: false, conditions: [{ says: 'Home loads', check: { kind: 'page', path: '/' } }] });
    assert.strictEqual(none.run.results[0].mode, 'app_did_not_start'); assert.match(none.run.app.why, /no start command/);
  });

  await test('PR-04', 'the shadow: the end state declared first, the unmet conditions come back absent', async () => {
    assert.ok(run.shadow, 'the shadow was declared and settled');
    const absentFields = run.shadow.absent.fields;
    for (const x of run.results.filter(x => !x.met)) assert.ok(absentFields.includes(x.id), `${x.id} is absent in the shadow`);
    for (const x of run.results.filter(x => x.met)) assert.ok(!absentFields.includes(x.id), `${x.id} is not absent`);
    assert.deepStrictEqual(run.shadow.absent.files, ['LICENSE'], 'the missing file is an absent file');
  });

  await test('PR-05', 'the report reads in plain words and is kept', async () => {
    const text = fs.readFileSync(path.join(dir, 'proof/PROOF-REPORT.md'), 'utf8');
    assert.match(text, /^# Proof report — Orbit Garden/);
    assert.match(text, /\*\*NOT READY\.\*\* 4 of 8 conditions met\./);
    assert.match(text, /\| ❌ \| There is a licence \| The file the condition names is not in the project\. \|/);
    assert.match(text, /## What is missing, and why/);
    assert.match(text, /### ❌ The build script works[\s\S]*Likely cause:\*\* The command ran and reported an error/);
    assert.match(text, /Every line above was checked by running it, not by reading it/);
    const last = await P.readLastProof(dir);
    assert.ok(last && last.met === 4 && last.results.length === 8);
    assert.ok(run.files && run.files.report === 'proof/PROOF-REPORT.md' && /\.nexus\/proof-runs\//.test(run.files.run));
    const writes = []; const viaLayer = await P.runProof({ repoDir: dir, write: true, writer: (rel, text) => { writes.push(rel); }, conditions: [{ says: 'readme', check: { kind: 'file', path: 'README.md' } }] });
    assert.deepStrictEqual(writes.map(w => w.replace(/proof-runs\/\d[^/]*\.json$/, 'proof-runs/<time>.json')), ['proof/PROOF-REPORT.md', '.nexus/proof-runs/<time>.json', '.nexus/proof-runs/latest.json'], 'a writer gets the report, the run and latest');
    const failingWriter = await P.runProof({ repoDir: dir, write: true, writer: () => ({ error: 'read-only' }), conditions: [{ says: 'readme', check: { kind: 'file', path: 'README.md' } }] });
    assert.match(failingWriter.run.writeError, /read-only/); assert.ok(!failingWriter.run.files, 'no claim of files that were not written');
    const ready = P.reportText({ subject: 'X', finishedAt: Date.now(), verdict: 'ready', met: 1, total: 1, results: [{ says: 'a', met: true, evidence: 'ok' }] });
    assert.match(ready, /\*\*READY\.\*\* All 1 condition met\./);
  });

  await test('PR-06', 'the agent only proposes conditions; nothing runs', async () => {
    const prompt = P.proposeConditionsPrompt('A landing page with a contact form; tests must pass.', { files: ['index.html'] });
    assert.match(prompt, /Output ONLY a JSON array/); assert.match(prompt, /skip taste/); assert.match(prompt, /index\.html/);
    const r = P.parseProposedConditions('Here:\n```json\n[{"says":"The home page loads","check":{"kind":"page","path":"/"}},{"says":"Tests pass","check":{"kind":"tests"}}]\n```');
    assert.ok(r.ok); assert.strictEqual(r.conditions.length, 2); assert.strictEqual(r.conditions[0].check.kind, 'page');
    assert.strictEqual(P.parseProposedConditions('sorry, no').ok, false);
    assert.strictEqual(P.parseProposedConditions('[not json').ok, false);
  });

  await test('PR-07', 'wired into idearium: routes with CAPS, the CLI, loom and the event contract', async () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const s of ["'repo.deliver.check'", "'repo.deliver.last'", "'repo.deliver.conditions'", "['api','repos',    ':uuid','deliver','check']", "case 'repo.deliver.check':", "'idearium.proof-run.settled'"]) assert.ok(api.includes(s), s);
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    assert.ok(cli.includes("'deliver.check'") && cli.includes("'deliver.conditions'"));
    const tax = require(path.join(ROOT, 'idearium/event-taxonomy.cjs'));
    assert.ok(tax.IDEARIUM_PROOF_RUN_SETTLED && require(path.join(ROOT, 'lib/event-taxonomy-pattern.js')).validateTaxonomy(tax).ok);
    const map = fs.readFileSync(path.join(ROOT, 'loom/maps/one-idearium-map.js'), 'utf8');
    assert.ok(map.includes("I('idearium/repo/proof-run.js')"));
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
