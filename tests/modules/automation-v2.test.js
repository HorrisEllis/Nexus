'use strict';
// §SANDBOX — workflows, runs and output under a throwaway root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/automation-v2.test.js — §0.39.265
 *
 * James: "expand the workflow, and macros, as much as you can, including the
 * agent tools. tasker, automate, etc. as much as i can automate on a browser,
 * with scheduling, dom tools, full enterprise grade."
 *
 * The browser here is jsdom behind the same browserFn hook Clear Glass's main
 * process sets — so the DOM steps really run their generated scripts against
 * a page: a job board is read, only new jobs are kept, an agent rates each,
 * the good ones go to a CSV and a notification. Plus templates, cron, every
 * data/logic step, triggers (cron, events, webhooks), concurrency, cancel,
 * retries and on-error rules, run history, import/export and validation.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'node_modules', 'jsdom'));

const ROOT = path.resolve(__dirname, '..', '..');
const T = require(path.join(ROOT, 'clear-glass/src/automation/template.js'));
const CRON = require(path.join(ROOT, 'clear-glass/src/automation/cron.js'));
const STEPS = require(path.join(ROOT, 'clear-glass/src/automation/steps.js'));
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR, nextScheduled } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const clean = () => { for (const d of [WORKFLOWS_DIR, RUNS_DIR, OUTPUT_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };

// ── a fake browser: jsdom pages behind the browserFn hook ──────────────────
function jobsHtml(jobs) {
  return `<html><head><title>Find work</title></head><body><h1>Jobs</h1>
  <form id="search"><label for="q">Search jobs</label><input id="q" name="q"><select id="sort"><option value="new">Newest</option><option value="best">Best match</option></select><button type="submit">Search</button></form>
  <div id="list">${jobs.map(j => `<article class="job" data-id="${j.id}"><h2><a href="/jobs/${j.id}">${j.title}</a></h2><span class="budget">$${j.budget}</span><p class="desc">${j.desc}</p></article>`).join('')}</div>
  <table id="stats"><tr><th>Day</th><th>Posted</th></tr><tr><td>Mon</td><td>3</td></tr><tr><td>Tue</td><td>5</td></tr></table></body></html>`;
}
function fakeBrowser(site) {
  const pages = new Map();
  const calls = [];
  const fn = async ({ page, action, args = {} }) => {
    calls.push({ page, action, args });
    if (action === 'navigate') {
      const html = typeof site[args.url] === 'function' ? site[args.url]() : site[args.url];
      if (html == null) throw new Error(`Navigation failed: ERR_NAME_NOT_RESOLVED (${args.url})`);
      const dom = new JSDOM(html, { url: args.url, runScripts: 'outside-only' });
      dom.window.document.addEventListener('submit', (e) => { e.preventDefault(); dom.window.__submitted = (dom.window.__submitted || 0) + 1; });
      pages.set(page, dom.window);
      return { url: args.url, title: dom.window.document.title };
    }
    const w = pages.get(page);
    if (action === 'close') { pages.delete(page); return { closed: !!w }; }
    if (action === 'show') return { shown: true };
    if (!w) throw new Error(`No webcontents for agent: ${page}`);
    if (action === 'eval') return { result: await w.eval(args.code) };
    if (action === 'type') { const el = w.document.activeElement; el.value = (el.value || '') + args.text; return { typed: args.text.length }; }
    if (action === 'click' || action === 'hover') return { clicked: { x: args.x, y: args.y } };
    if (action === 'screenshot') return { screenshot: Buffer.from('PNGDATA').toString('base64'), format: 'png' };
    if (action === 'back' || action === 'reload') return { ok: true };
    throw new Error(`fake browser: ${action} not supported`);
  };
  return { fn, pages, calls };
}

(async () => {

// ── pure modules ────────────────────────────────────────────────────────────
await test('AV-001', 'templates: paths, labels with spaces, whole values, filters, quoted args, dates', () => {
  const ctx = { vars: { price: '$1,234.50', list: ['b', 'a', 'b'], name: 'jo' }, steps: { 'Read price': { output: '42' }, s1: { output: [{ t: 1 }, { t: 2 }] } }, last: 'x', item: { title: 'Dev' } };
  assert.strictEqual(T.render('{{vars.price | number}}', ctx), 1234.5);
  assert.strictEqual(T.render('{{steps.Read price.output}}!', ctx), '42!');
  assert.deepStrictEqual(T.render('{{vars.list | unique}}', ctx), ['b', 'a']);
  assert.strictEqual(T.render('{{vars.list | join:" | "}}', ctx), 'b | a | b');
  assert.deepStrictEqual(T.render('{{steps.s1.output | pluck:t}}', ctx), [1, 2]);
  assert.strictEqual(T.render('{{vars.missing | default:"none"}} {{vars.name | upper}}', ctx), 'none JO');
  assert.strictEqual(T.render('{{"Budget: $120" | match:"\\$(\\d+)" | int}}', ctx), 120);
  assert.strictEqual(T.render('{{item.title}} at {{0 | date:"YYYY"}}', ctx), 'Dev at 1970'.replace('1970', String(new Date(0).getFullYear())));
  assert.deepStrictEqual(T.render({ a: ['{{vars.list | length}}'] }, ctx), { a: [3] });
  assert.throws(() => T.render('{{last | nope}}', ctx), /unknown filter "nope"/);
  assert.deepStrictEqual(T.placeholders({ x: 'a {{vars.a}} {{last|trim}}' }), ['vars.a', 'last|trim']);
});

await test('AV-002', 'cron: parse, next (steps, ranges, names, dom/dow OR rule), describe; bad input explains itself', () => {
  const f = new Date(2026, 8, 26, 10, 7).getTime();   // Sat 26 Sep 2026 10:07
  assert.strictEqual(new Date(CRON.next('*/15 * * * *', f)).getMinutes(), 15);
  const wk = new Date(CRON.next('0 9 * * MON-FRI', f)); assert.deepStrictEqual([wk.getDay(), wk.getHours(), wk.getDate()], [1, 9, 28]);
  const m = new Date(CRON.next('@monthly', f)); assert.deepStrictEqual([m.getMonth(), m.getDate(), m.getHours()], [9, 1, 0]);
  const either = new Date(CRON.next('0 0 1 * 0', f)); assert.deepStrictEqual([either.getDate(), either.getDay()], [27, 0]);   // Sunday 27th comes before the 1st
  assert.strictEqual(new Date(CRON.next('30 8 * * 7', f)).getDay(), 0);
  assert.throws(() => CRON.parse('61 * * * *'), /outside 0-59/);
  assert.throws(() => CRON.parse('* * *'), /5 fields/);
  assert.strictEqual(CRON.describe('0 9 * * 1-5'), 'at 09:00 on weekdays');
  assert.strictEqual(nextScheduled({ cron: '*/15 * * * *' }, f), CRON.next('*/15 * * * *', f));
  assert.strictEqual(nextScheduled({ cron: 'garbage' }, f), null);
  assert.strictEqual(nextScheduled({ event: 'page.visited' }, f), null);
});

await test('AV-003', 'catalogue: every type has fields and help; validation names what is missing', () => {
  for (const c of STEPS.CATALOGUE) { assert.ok(c.label && c.help && Array.isArray(c.fields), c.type); }
  assert.ok(!STEPS.KNOWN_TYPES.includes('branch'));
  const probs = STEPS.validateWorkflow({ steps: [
    { id: 'a', type: 'browser', config: { action: 'navigate' } },
    { id: 'b', type: 'browser', config: { action: 'click' } },
    { id: 'c', type: 'condition', config: { left: '{{last}}', op: '==', value: 1, onTrue: 'gone' } },
    { id: 'd', type: 'loop', config: { body: 1 } },
    { id: 'e', type: 'trigger', config: { cron: '99 * * * *' } },
    { id: 'f', type: 'http', config: { url: 'ftp://x' } },
    { id: 'g', type: 'extract', config: { mode: 'page' } },
  ] }).map(p => p.problem).join('\n');
  assert.match(probs, /“URL” is empty/); assert.match(probs, /“Element” is empty/); assert.match(probs, /goes to a step that is gone/);
  assert.match(probs, /a list or a number of times/); assert.match(probs, /trigger: cron minute/); assert.match(probs, /http:\/\/ or https:\/\//);
  assert.ok(!/Read from the page/.test(probs), 'page mode needs no selector');
});

await test('AV-004', 'every template validates clean and becomes a workflow', () => {
  clean();
  const { TEMPLATES } = require(path.join(ROOT, 'clear-glass/src/automation/templates.js'));
  const e = new AutomationEngine({});
  for (const t of TEMPLATES) {
    const wf = e.create({ name: t.name, steps: t.steps, vars: t.vars }).workflow;
    assert.deepStrictEqual(e.validate(wf.id).problems, [], t.id);
    for (const s of wf.steps) for (const k of ['onTrue', 'onFalse']) if (s.config[k] && !['next', 'stop', 'continue', 'break'].includes(s.config[k])) assert.ok(wf.steps.some(x => x.id === s.config[k]), `${t.id}: ${k}`);
    for (const s of wf.steps) if (s.onError && !['continue', 'stop', 'fail'].includes(s.onError)) assert.ok(wf.steps.some(x => x.id === s.onError), `${t.id}: onError`);
  }
  clean();
});

await test('AV-005', 'a CSV row built from JSON with quotes in the values stays one valid record', async () => {
  clean();
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Csv', vars: { t: 'He said "hi", then left' }, steps: [
    { type: 'file', config: { path: 'x.csv', format: 'csv', content: '{"title": {{vars.t | json}}, "n": {{"7" | json}}}' } }] }).workflow;
  assert.strictEqual((await e.run(wf.id)).ok, true);
  assert.strictEqual(fs.readFileSync(path.join(e.outputDir(wf.id), 'x.csv'), 'utf8'), 'title,n\n"He said ""hi"", then left",7\n');
  clean();
});

// ── the browser: a real job-board run end to end ────────────────────────────
await test('AV-010', 'job watcher: open → search → wait → read records → only new → agent rates (awaited) → if → CSV + notify', async () => {
  clean();
  let jobs = [{ id: 1, title: 'Node API', budget: 500, desc: 'Express' }, { id: 2, title: 'Logo design', budget: 50, desc: 'Illustrator' }];
  const site = { 'https://work.test/find': () => jobsHtml(jobs) };
  const B = fakeBrowser(site);
  const asked = [], notes = [];
  const e = new AutomationEngine({});
  e.setHooks({ browserFn: B.fn, askAgentFn: async (t) => { asked.push(t); return { text: /Node/.test(t.prompt) ? '9' : '2' }; }, notifyFn: async (n) => notes.push(n) });
  const { workflow } = e.create({ name: 'Job watcher', status: 'active', vars: { minScore: 7 }, steps: [
    { type: 'trigger', config: { cron: '*/30 * * * *' } },
    { type: 'browser', label: 'Open', config: { action: 'navigate', url: 'https://work.test/find' } },
    { type: 'browser', config: { action: 'fill', selector: 'label=Search jobs', value: 'node' } },
    { type: 'browser', config: { action: 'select', selector: '#sort', value: 'Best match' } },
    { type: 'browser', config: { action: 'submit', selector: 'text=Search' } },
    { type: 'wait_until', config: { kind: 'present', selector: 'article.job', timeoutMs: 2000 } },
    { type: 'extract', label: 'Jobs', config: { mode: 'records', selector: 'article.job', fields: 'title = h2\nlink = a@href\nbudget = .budget\nid = @data-id' } },
    { type: 'set', config: { assign: 'count = {{steps.Jobs.output | length}}\nlabel = {{vars.count}} jobs' } },
    { id: 'L', type: 'loop', label: 'Each new job', config: { items: '{{steps.Jobs.output}}', body: 4, onlyNew: '{{item.id}}' } },
    { id: 'A', type: 'agent', label: 'Score', config: { agentKey: 'claude', prompt: 'Rate: {{item.title}} ({{item.budget | number}})', await: true } },
    { id: 'C', type: 'condition', config: { left: '{{steps.Score.output | number}}', op: '>=', value: '{{vars.minScore}}', onTrue: 'next', onFalse: 'continue' } },
    { type: 'file', config: { path: 'good.csv', format: 'csv', content: '{{item}}' } },
    { type: 'notify', config: { title: 'Good job: {{item.title}}', body: 'score {{steps.Score.output}} · {{item.link}}' } },
    { type: 'log', config: { message: 'done: {{vars.label}}' } },
  ] });
  assert.deepStrictEqual(e.validate(workflow.id).problems, []);
  const r = await e.run(workflow.id);
  assert.strictEqual(r.ok, true, r.error);
  const page = B.pages.get(`auto-${workflow.id.slice(0, 8)}`);
  assert.ok(page, 'the workflow got its own automation page');
  assert.strictEqual(page.document.getElementById('q').value, 'node');
  assert.strictEqual(page.document.getElementById('sort').value, 'best');
  assert.strictEqual(page.__submitted, 1);
  assert.strictEqual(r.vars.count, 2); assert.strictEqual(r.vars.label, '2 jobs');
  assert.strictEqual(asked.length, 2); assert.strictEqual(asked[0].prompt, 'Rate: Node API (500)');
  assert.deepStrictEqual(notes.map(n => n.title), ['Good job: Node API']);
  assert.strictEqual(notes[0].body, 'score 9 · https://work.test/jobs/1');
  const csv = fs.readFileSync(path.join(e.outputDir(workflow.id), 'good.csv'), 'utf8');
  assert.strictEqual(csv, 'title,link,budget,id\nNode API,https://work.test/jobs/1,$500,1\n');
  // the second run: one more job — only the new one is looked at
  jobs = [...jobs, { id: 3, title: 'Node, "urgent"', budget: 900, desc: 'Nest' }];
  const r2 = await e.run(workflow.id, 'cron');
  assert.strictEqual(r2.ok, true, r2.error);
  assert.strictEqual(asked.length, 3, 'jobs 1 and 2 were seen before');
  assert.strictEqual(fs.readFileSync(path.join(e.outputDir(workflow.id), 'good.csv'), 'utf8').split('\n')[2], '"Node, ""urgent""",https://work.test/jobs/3,$900,3');
  // the run record: every step with its output, the log, newest first
  const runs = e.listRuns(workflow.id);
  assert.strictEqual(runs.length, 2); assert.strictEqual(runs[0].reason, 'cron'); assert.strictEqual(runs[0].status, 'ok');
  const rec = e.getRun(r.runId);
  assert.ok(rec.steps.some(s => s.label === 'Jobs' && Array.isArray(s.output) && s.output.length === 2));
  assert.ok(rec.log.some(l => /Each new job: 2 rounds/.test(l.msg)));
  assert.ok(e.getRun(r2.runId).log.some(l => /1 round \(2 already seen\)/.test(l.msg)));
  clean();
});

await test('AV-011', 'extract modes: text + transform, list, attr, count, exists, table, links, page; highlight; eval returns', async () => {
  clean();
  const B = fakeBrowser({ 'https://work.test/find': jobsHtml([{ id: 7, title: 'A', budget: 120, desc: 'x' }, { id: 8, title: 'B', budget: 80, desc: 'y' }]) });
  const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn });
  const wf = e.create({ name: 'Reads', steps: [
    { type: 'browser', config: { action: 'navigate', url: 'work.test/find' } },     // no scheme → https://
    { type: 'extract', label: 'first budget', config: { mode: 'text', selector: '.budget', transform: 'number' } },
    { type: 'extract', label: 'titles', config: { mode: 'list', selector: 'article h2' } },
    { type: 'extract', label: 'hrefs', config: { mode: 'attr', attr: 'href', all: true, selector: 'article a' } },
    { type: 'extract', label: 'n', config: { mode: 'count', selector: 'article' } },
    { type: 'extract', label: 'has', config: { mode: 'exists', selector: '#nope' } },
    { type: 'extract', label: 'tbl', config: { mode: 'table', selector: '#stats' } },
    { type: 'extract', label: 'lnk', config: { mode: 'links', match: '/jobs/8' } },
    { type: 'extract', label: 'pg', config: { mode: 'page' } },
    { type: 'browser', label: 'js', config: { action: 'eval', code: 'document.querySelectorAll("article").length * 10' } },
    { type: 'browser', label: 'shot', config: { action: 'screenshot' } },
  ] }).workflow;
  const r = await e.run(wf.id);
  assert.strictEqual(r.ok, true, r.error);
  const out = (l) => e.getRun(r.runId).steps.find(s => s.label === l).output;
  assert.strictEqual(out('first budget'), 120);
  assert.deepStrictEqual(out('titles'), ['A', 'B']);
  assert.deepStrictEqual(out('hrefs'), ['https://work.test/jobs/7', 'https://work.test/jobs/8']);
  assert.strictEqual(out('n'), 2); assert.strictEqual(out('has'), false);
  assert.deepStrictEqual(out('tbl'), [{ Day: 'Mon', Posted: '3' }, { Day: 'Tue', Posted: '5' }]);
  assert.deepStrictEqual(out('lnk'), [{ text: 'B', href: 'https://work.test/jobs/8' }]);
  assert.strictEqual(out('pg').title, 'Find work');
  assert.strictEqual(out('js'), 20);
  assert.ok(fs.readFileSync(out('shot')).toString() === 'PNGDATA' && out('shot').startsWith(e.outputDir(wf.id)));
  assert.strictEqual(B.calls[0].args.url, 'https://work.test/find');
  clean();
});

await test('AV-012', 'wait_until times out with a plain reason; an element that is missing fails the step (and onError: continue carries on)', async () => {
  clean();
  const B = fakeBrowser({ 'https://s.test/': '<p>hi</p>' });
  const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn });
  const wf = e.create({ name: 'W', steps: [
    { type: 'browser', config: { action: 'navigate', url: 'https://s.test/' } },
    { type: 'wait_until', config: { kind: 'text', text: 'never', timeoutMs: 300, intervalMs: 100 } },
  ] }).workflow;
  const r = await e.run(wf.id);
  assert.strictEqual(r.ok, false); assert.match(r.error, /timed out after 0 s waiting until text “never”/);
  const wf2 = e.create({ name: 'W2', steps: [
    { type: 'browser', config: { action: 'navigate', url: 'https://s.test/' } },
    { type: 'browser', onError: 'continue', config: { action: 'dom_click', selector: 'text=Sign in' } },
    { type: 'set', config: { assign: 'why = {{error.message}}' } },
  ] }).workflow;
  const r2 = await e.run(wf2.id);
  assert.strictEqual(r2.ok, true); assert.strictEqual(r2.vars.why, 'element not found: text=Sign in');
  const nob = new AutomationEngine({});
  const r3 = await nob.run(nob.create({ name: 'x', steps: [{ type: 'browser', config: { action: 'navigate', url: 'https://a.b' } }] }).workflow.id);
  assert.match(r3.error, /browser steps need Clear Glass running/);
  clean();
});

// ── data & logic ─────────────────────────────────────────────────────────────
await test('AV-020', 'set (in order, memory kept between runs), condition operators, changed, loop N times with break', async () => {
  clean();
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Logic', vars: { price: '10' }, steps: [
    { type: 'set', config: { assign: 'a = 2\nb = {{vars.a | number}}\nmemory.runs = {{memory.runs | default:0 | number}}' } },
    { type: 'set', config: { assign: 'memory.runs = {{vars.b}}' } },
    { id: 'chg', type: 'condition', label: 'Changed?', config: { left: '{{vars.price}}', op: 'changed', onTrue: 'next', onFalse: 'next' } },
    { type: 'loop', label: 'Rounds', config: { times: 10, body: 2 } },
    { type: 'condition', config: { left: '{{index}}', op: '>=', value: '3', onTrue: 'break', onFalse: 'next' } },
    { type: 'set', config: { assign: 'lastIndex = {{index}}' } },
  ] }).workflow;
  const r = await e.run(wf.id);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.vars.b, 2); assert.strictEqual(r.vars.lastIndex, 2);
  assert.strictEqual(e.getRun(r.runId).steps.find(s => s.label === 'Rounds').output, 4);
  assert.strictEqual(e.getRun(r.runId).steps.find(s => s.label === 'Changed?').output, false, 'the first run has nothing to compare with');
  e.update(wf.id, { vars: { price: '12' } });
  const r2 = await e.run(wf.id);
  assert.strictEqual(e.getRun(r2.runId).steps.find(s => s.label === 'Changed?').output, true);
  assert.strictEqual(e.get(wf.id).memory.vars.runs, 2);
  const x = new AutomationEngine({});
  const cmp = (a, op, b) => x._compare(a, op, b);
  assert.ok(cmp('Hello World', 'contains', 'world') && cmp(['a', 'b'], 'contains', 'b') && !cmp('abc', 'contains', 'z'));
  assert.ok(cmp('abc', 'matches', '^A') && cmp('abc', 'matches', '/^a/') && !cmp('abc', 'matches', '/^A/'));
  assert.ok(cmp('red', 'in', 'green, red') && cmp('', 'empty') && cmp([], 'empty') && cmp({ a: 1 }, 'not_empty') && cmp(0, 'exists') && cmp(undefined, 'missing'));
  assert.ok(cmp('$1,200', '>', '999') && cmp('abc', 'starts', 'AB') && cmp('abc', 'ends', 'bc'));
  assert.throws(() => cmp(1, '~=', 1), /unknown condition operator/);
  clean();
});

await test('AV-021', 'http step (JSON in and out, headers, failOnHttpError) and file formats (json list, jsonl, text; no escaping the folder)', async () => {
  clean();
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], body: b });
    if (req.url === '/bad') { res.writeHead(500); return res.end('boom'); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ got: b ? JSON.parse(b) : null, n: 3 }));
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Data out', vars: { token: 's3cret' }, steps: [
    { type: 'http', label: 'Post', config: { method: 'POST', url: `${base}/hook`, headers: 'Authorization = Bearer {{vars.token}}', body: '{"text": "hi {{workflow}}"}' } },
    { type: 'file', config: { path: 'out/list.json', format: 'json', mode: 'append', content: '{{steps.Post.output.body}}' } },
    { type: 'file', config: { path: 'out/list.json', format: 'json', mode: 'append', content: '{"second": true}' } },
    { type: 'file', config: { path: 'rows.jsonl', format: 'jsonl', content: '[{"a":1},{"a":2}]' } },
    { type: 'file', config: { path: 'note.txt', format: 'text', mode: 'write', content: 'n={{steps.Post.output.body.n}}' } },
    { type: 'http', onError: 'continue', config: { url: `${base}/bad` } },
    { type: 'http', config: { url: `${base}/bad`, failOnHttpError: false }, saveAs: 'soft' },
  ] }).workflow;
  const r = await e.run(wf.id);
  srv.close();
  assert.strictEqual(r.ok, true, r.error);
  assert.deepStrictEqual(seen[0], { method: 'POST', url: '/hook', auth: 'Bearer s3cret', type: 'application/json', body: '{"text": "hi Data out"}' });
  const dir = e.outputDir(wf.id);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'out/list.json'), 'utf8')), [{ got: { text: 'hi Data out' }, n: 3 }, { second: true }]);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'rows.jsonl'), 'utf8'), '{"a":1}\n{"a":2}\n');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'note.txt'), 'utf8'), 'n=3');
  assert.deepStrictEqual({ status: r.vars.soft.status, ok: r.vars.soft.ok }, { status: 500, ok: false });
  const esc = e.create({ name: 'Esc', steps: [{ type: 'file', config: { path: '../../evil.txt', content: 'x' } }] }).workflow;
  assert.match((await e.run(esc.id)).error, /must stay inside the output folder/);
  clean();
});

await test('AV-022', 'retry with backoff, step time limit, onError jumping to a step, fail step, run step limit', async () => {
  clean();
  let tries = 0;
  const e = new AutomationEngine({});
  e.setHooks({ runMacroFn: async () => (++tries < 3 ? { error: 'flaky' } : { ok: true }) });
  const wf = e.create({ name: 'R', steps: [
    { type: 'macro', retry: { count: 3, delayMs: 20, backoff: true }, config: { name: 'm' } },
    { id: 'slow', type: 'delay', timeoutMs: 50, onError: 'handler', config: { ms: 5000 } },
    { type: 'set', config: { assign: 'skipped = yes' } },
    { id: 'handler', type: 'set', config: { assign: 'handled = {{error.message}}' } },
  ] }).workflow;
  const r = await e.run(wf.id);
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(tries, 3); assert.strictEqual(r.vars.skipped, undefined); assert.match(r.vars.handled, /took longer than 0 s/);
  assert.ok(e.getRun(r.runId).log.some(l => /retry 2 of 3/.test(l.msg)));
  const f = e.create({ name: 'F', steps: [{ type: 'fail', config: { message: 'no login for {{workflow}}' } }] }).workflow;
  assert.strictEqual((await e.run(f.id)).error, 'no login for F');
  const inf = e.create({ name: 'Inf', settings: { maxSteps: 25 }, steps: [{ id: 'a', type: 'condition', config: { left: '1', op: '==', value: '1', onTrue: 'a' } }] }).workflow;
  assert.match((await e.run(inf.id)).error, /went over 25 steps/);
  clean();
});

await test('AV-023', 'sub-workflows hand values in and get variables back; stop finishes early; depth is limited', async () => {
  clean();
  const e = new AutomationEngine({});
  const child = e.create({ name: 'Double', steps: [{ type: 'set', config: { assign: 'out = {{vars.n | number}}{{vars.n | number}}' } }, { type: 'stop', config: {} }, { type: 'fail', config: { message: 'never' } }] }).workflow;
  const parent = e.create({ name: 'Parent', steps: [{ type: 'workflow', label: 'Call', config: { workflow: 'double', vars: 'n = 4' } }, { type: 'set', config: { assign: 'got = {{steps.Call.output.out}}' } }] }).workflow;
  const r = await e.run(parent.id);
  assert.strictEqual(r.ok, true, r.error); assert.strictEqual(r.vars.got, '44');
  assert.strictEqual(e.get(child.id).runCount, 0, 'a sub-run does not count as the child’s own run');
  const loopy = e.create({ name: 'Loopy', steps: [] }).workflow;
  e.update(loopy.id, { steps: [{ id: 's', type: 'workflow', config: { workflow: loopy.id } }] });
  assert.match((await e.run(loopy.id)).error, /at most 5 deep/);
  clean();
});

// ── triggers & runs ──────────────────────────────────────────────────────────
await test('AV-030', 'several triggers: cron + interval arm separately; events match with globs, cool down, never self-trigger', async () => {
  clean();
  const e = new AutomationEngine({});
  const ran = [];
  e.run = async (id, reason, opts) => { ran.push({ id, reason, trigger: opts && opts.trigger }); return { ok: true }; };
  const a = e.create({ name: 'A', status: 'active', steps: [{ type: 'trigger', config: { cron: '0 9 * * *' } }, { type: 'trigger', config: { intervalMs: 60000 } }] }).workflow;
  const next = e.nextRunAt(e.get(a.id));
  assert.ok(next <= Date.now() + 60000 + 50, 'the sooner of the two');
  e.get(a.id)._nextRuns = { [a.steps[0].id]: Date.now() - 1, [a.steps[1].id]: Date.now() + 99999 };
  e.tick();
  assert.deepStrictEqual(ran.map(r => r.reason), ['cron']);
  const v = e.create({ name: 'Visit', status: 'active', steps: [{ type: 'trigger', config: { event: 'page.visited', match: '*upwork.com/jobs/*' } }] }).workflow;
  const w = e.create({ name: 'After', status: 'active', steps: [{ type: 'trigger', config: { event: 'workflow.finished', match: 'Visit' } }] }).workflow;
  ran.length = 0;
  assert.strictEqual(e.emitEvent('page.visited', { url: 'https://www.upwork.com/jobs/~01' }), 1);
  assert.strictEqual(e.emitEvent('page.visited', { url: 'https://www.upwork.com/jobs/~02' }), 0, 'cooled down (30 s for page visits)');
  assert.strictEqual(e.emitEvent('page.visited', { url: 'https://example.com/' }), 0);
  assert.strictEqual(ran[0].id, v.id); assert.strictEqual(ran[0].trigger.url, 'https://www.upwork.com/jobs/~01');
  assert.strictEqual(e.emitEvent('workflow.finished', { workflowId: v.id, workflowName: 'Visit' }), 1);
  assert.strictEqual(e.emitEvent('workflow.finished', { workflowId: w.id, workflowName: 'Visit' }), 0, 'never re-triggers itself');
  assert.strictEqual(e.emitEvent('page.visited', { url: 'x' }, { chain: 9 }), 0, 'chains are limited');
  clean();
});

await test('AV-031', 'webhooks: token made on create, checked in constant time, not copied by duplicate/export; payload reaches {{trigger}}', async () => {
  clean();
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Hook', status: 'active', steps: [{ type: 'trigger', config: { webhook: true } }, { type: 'set', config: { assign: 'who = {{trigger.user}}' } }] }).workflow;
  const token = wf.steps[0].config.token;
  assert.ok(token && token.length >= 20);
  assert.strictEqual((await e.fireWebhook(wf.id, 'wrong', {})).status, 403);
  const r = await e.fireWebhook(wf.id, token, { user: 'ann' }, { wait: true });
  assert.strictEqual(r.ok, true); assert.strictEqual(r.vars.who, 'ann');
  assert.deepStrictEqual(await e.fireWebhook(wf.id, token, {}), { ok: true, accepted: true });
  const dup = e.create({ name: 'Dup', steps: wf.steps }).workflow;
  assert.notStrictEqual(dup.steps[0].config.token, token);
  assert.ok(!('token' in e.exportWorkflow(wf.id).workflow.steps[0].config));
  e.updateStep(wf.id, wf.steps[0].id, { config: { webhook: true } });
  assert.strictEqual(e.get(wf.id).steps[0].config.token, token, 'saving the trigger keeps its token');
  e.updateStep(wf.id, wf.steps[0].id, { regenerateToken: true });
  assert.notStrictEqual(e.get(wf.id).steps[0].config.token, token);
  e.update(wf.id, { status: 'paused' });
  assert.strictEqual((await e.fireWebhook(wf.id, e.get(wf.id).steps[0].config.token, {})).status, 409);
  clean();
});

await test('AV-032', 'concurrency: skip (scheduled runs while one is going), queue (one after another); cancel stops a waiting run', async () => {
  clean();
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Slow', steps: [{ type: 'delay', config: { ms: 400 } }] }).workflow;
  const p1 = e.run(wf.id, 'manual');
  const skipped = await e.run(wf.id, 'interval');
  assert.strictEqual(skipped.skipped, true);
  const live = e.activeRuns(wf.id);
  assert.strictEqual(live.length, 1); assert.strictEqual(live[0].status, 'running');
  assert.deepStrictEqual(e.cancel(live[0].id), { ok: true });
  const r1 = await p1;
  assert.strictEqual(r1.status, 'cancelled'); assert.match(r1.error, /cancelled by you/);
  e.update(wf.id, { settings: { concurrency: 'queue' }, steps: [{ id: 'd', type: 'delay', config: { ms: 60 } }, { id: 's', type: 'set', config: { assign: 't = {{now:X}}' } }] });
  const order = [];
  await Promise.all([e.run(wf.id, 'interval').then(r => order.push(r.runId)), e.run(wf.id, 'interval').then(r => order.push(r.runId))]);
  const runs = e.listRuns(wf.id, 10);
  assert.strictEqual(runs.length, 3);
  const [b, a] = runs; assert.ok(b.startedAt >= a.finishedAt, 'queued runs do not overlap');
  const tl = e.create({ name: 'TL', settings: { timeoutMs: 100 }, steps: [{ type: 'delay', config: { ms: 3000 } }] }).workflow;
  assert.match((await e.run(tl.id)).error, /over its time limit/);
  clean();
});

await test('AV-033', 'run history is capped on disk and survives a restart; export → import round-trips as a paused copy', async () => {
  clean();
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'Hist', vars: { a: 1 }, settings: { concurrency: 'parallel' }, steps: [{ id: 't', type: 'trigger', config: { at: '07:00' } }, { id: 'c', type: 'condition', config: { left: '1', op: '==', value: '1', onTrue: 'n', onFalse: 'stop' } }, { id: 'n', type: 'log', saveAs: 'msg', config: { message: 'x' } }] }).workflow;
  for (let i = 0; i < 260; i++) await e.run(wf.id);
  const lines = fs.readFileSync(path.join(RUNS_DIR, `${wf.id}.jsonl`), 'utf8').trim().split('\n');
  assert.ok(lines.length <= 250 && lines.length >= 200, String(lines.length));
  const e2 = new AutomationEngine({});
  assert.strictEqual(e2.listRuns(wf.id, 5).length, 5);
  assert.strictEqual(e2.get(wf.id).runCount, 260);
  assert.strictEqual(e2.get(wf.id).lastStatus, 'ok');
  const ex = e2.exportWorkflow(wf.id).workflow;
  assert.strictEqual(ex.format, 'nexus-workflow');
  const im = e2.importWorkflow(JSON.parse(JSON.stringify(ex))).workflow;
  assert.strictEqual(im.status, 'paused'); assert.deepStrictEqual(im.vars, { a: 1 }); assert.deepStrictEqual(im.settings, { concurrency: 'parallel' });
  assert.strictEqual(im.steps[1].config.onTrue, im.steps[2].id, 'branches re-pointed to the copy’s own steps');
  assert.strictEqual(im.steps[2].saveAs, 'msg');
  assert.match(e2.importWorkflow({ steps: [{ type: 'teleport' }] }).error, /unknown step type: teleport/);
  assert.strictEqual(e2.importWorkflow({ nope: 1 }).ok, false);
  e2.remove(wf.id);
  assert.ok(!fs.existsSync(path.join(RUNS_DIR, `${wf.id}.jsonl`)), 'deleting a workflow deletes its history');
  clean();
});

await test('AV-034', 'runStep: one step on its own (the agent tool’s path); emit starts listening workflows', async () => {
  clean();
  const B = fakeBrowser({ 'https://s.test/': '<h1>Title here</h1>' });
  const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn });
  assert.strictEqual((await e.runStep({ type: 'browser', config: { action: 'navigate', url: 'https://s.test/', page: 'auto-agent' } })).ok, true);
  const r = await e.runStep({ type: 'extract', config: { page: 'auto-agent', mode: 'text', selector: 'h1', transform: 'upper' } });
  assert.deepStrictEqual([r.ok, r.output], [true, 'TITLE HERE']);
  assert.match((await e.runStep({ type: 'branch' })).error, /unknown step type/);
  assert.strictEqual((await e.runStep({ type: 'browser', config: { page: 'auto-agent', action: 'eval', code: 'throw new Error("boom here")' } })).error, 'boom here', 'a page error keeps its message');
  assert.strictEqual((await e.runStep({ type: 'browser', config: { page: 'auto-agent', action: 'eval', code: 'document.title.length + 1' } })).output, 1);
  const lis = e.create({ name: 'Listener', status: 'active', steps: [{ type: 'trigger', config: { event: 'jobs.found' } }, { type: 'set', config: { assign: 'n = {{trigger.count}}' } }] }).workflow;
  const em = e.create({ name: 'Emitter', steps: [{ type: 'emit', config: { event: 'jobs.found', payload: 'count = 5' } }] }).workflow;
  const er = await e.run(em.id);
  assert.strictEqual(er.output, 1);
  await new Promise(r => setTimeout(r, 50));
  const lr = e.listRuns(lis.id, 1)[0];
  assert.strictEqual(lr.status, 'ok'); assert.strictEqual(e.getRun(lr.id).vars.n, '5');
  clean();
});

// ── over the wire: the router, and the co-pilot's two tools ────────────────
await test('AV-040', 'the wire router + clear_glass_automation + clear_glass_browser end to end over HTTP; origins and webhooks', async () => {
  clean();
  const ROUTES = require(path.join(ROOT, 'clear-glass/src/automation/routes.js'));
  const B = fakeBrowser({ 'https://work.test/find': jobsHtml([{ id: 1, title: 'Node API', budget: 500, desc: 'x' }]) });
  const e = new AutomationEngine({}); e.setHooks({ browserFn: B.fn, askAgentFn: async () => ({ text: '8' }) });
  const macros = { apply: { name: 'apply', params: ['email'], steps: [{ action: 'navigate', data: { url: 'https://work.test/find' } }, { action: 'type', data: { selector: '#q', text: '{{email}}' } }, { action: 'toast', data: { text: 'hi' } }] } };
  const srv = http.createServer((req, res) => { let b = ''; req.setEncoding('utf8'); req.on('data', c => b += c); req.on('end', async () => {
    let parsed = {}; try { parsed = b ? JSON.parse(b) : {}; } catch (_) {}
    const r = await ROUTES.handle(e, { method: req.method, url: req.url, body: parsed, headers: req.headers, rawBody: b }, { getMacro: async (n) => (macros[n] ? { ok: true, macro: macros[n] } : { error: 'no macro' }) });
    res.writeHead(r ? r.status : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r ? r.body : { error: 'nope' }));
  }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  process.env.WIRE_PORT = String(srv.address().port);
  for (const m of ['automation.js', 'browser-automation.js']) delete require.cache[require.resolve(path.join(ROOT, 'lib/agent-tools/tools/clear-glass', m))];
  const AUTO = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/automation.js'));
  const BR = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/browser-automation.js'));
  try {
    const cat = await AUTO.execute({ action: 'catalogue' });
    assert.ok(cat.steps.some(s => s.type === 'extract' && s.fields.some(f => f.startsWith('fields'))));
    // the agent's own page
    assert.strictEqual((await BR.execute({ action: 'open', url: 'https://work.test/find' })).ok, true);
    assert.strictEqual((await BR.execute({ action: 'fill', selector: 'label=Search jobs', value: 'rust' })).ok, true);
    assert.deepStrictEqual((await BR.execute({ action: 'read', mode: 'records', selector: 'article.job', fields: { title: 'h2', link: 'a@href' } })).result, [{ title: 'Node API', link: 'https://work.test/jobs/1' }]);
    assert.strictEqual((await BR.execute({ action: 'read', mode: 'value', selector: '#q' })).result, 'rust');
    assert.strictEqual((await BR.execute({ action: 'wait', kind: 'text', text: 'node api', timeoutMs: 500 })).ok, true);
    assert.match((await BR.execute({ action: 'dom_click', selector: '#missing' })).error, /element not found: #missing/);
    assert.ok(B.pages.has('auto-agent'));
    // a workflow built and run by the agent
    const made = await AUTO.execute({ action: 'create', workflowName: 'Agent made', steps: [
      { type: 'browser', config: { action: 'navigate', url: 'https://work.test/find' } },
      { type: 'extract', label: 'n', config: { mode: 'count', selector: 'article' } },
      { type: 'agent', label: 'Rate', config: { agentKey: 'claude', prompt: 'rate {{steps.n.output}}', await: true } }] });
    assert.strictEqual(made.ok, true); assert.deepStrictEqual(made.problems, []);
    const run = await AUTO.execute({ action: 'run', name: 'agent made' });
    assert.strictEqual(run.ok, true, run.error); assert.strictEqual(run.output, '8');
    assert.deepStrictEqual(run.steps.map(s => [s.step, s.status]), [['browser', 'ok'], ['n', 'ok'], ['Rate', 'ok']]);
    assert.strictEqual((await AUTO.execute({ action: 'runs', name: 'Agent made' })).runs.length, 1);
    const tpl = await AUTO.execute({ action: 'create', template: 'price', workflowName: 'Watch', vars: { url: 'https://work.test/find' } });
    assert.strictEqual(tpl.ok, true);
    assert.strictEqual(e.find('Watch').vars.selector, '.price'); assert.strictEqual(e.find('Watch').vars.url, 'https://work.test/find');
    const fm = await AUTO.execute({ action: 'from_macro', macro: 'apply' });
    assert.strictEqual(fm.ok, true); assert.deepStrictEqual(fm.warnings, [3]);
    const fw = e.get(fm.workflow.id);
    assert.deepStrictEqual(fw.vars, { email: '' });
    assert.deepStrictEqual(fw.steps.map(s => s.type), ['trigger', 'browser', 'browser', 'log']);
    assert.deepStrictEqual(fw.steps[2].config, { page: 'auto', action: 'fill', selector: '#q', value: '{{vars.email}}' });
    assert.match((await AUTO.execute({ action: 'run', name: 'nope' })).error, /no workflow "nope"/);
    // another site cannot call automation routes; a webhook with its token can
    const port = srv.address().port;
    const post = (p, body, headers = {}) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    assert.strictEqual((await post('/automation/step', { step: { type: 'browser', config: { action: 'eval', code: '1' } } }, { Origin: 'https://evil.example' })).status, 403);
    const hooked = e.create({ name: 'Hooked', status: 'active', steps: [{ type: 'trigger', config: { webhook: true } }, { type: 'set', config: { assign: 'x = {{trigger.x}}' } }] }).workflow;
    const tok = hooked.steps[0].config.token;
    assert.strictEqual((await post(`/automation/hook/${hooked.id}?token=bad`, { x: 1 }, { Origin: 'https://zapier.example' })).status, 403);
    const hr = await (await post(`/automation/hook/${hooked.id}?wait=1`, { x: 'hi' }, { 'X-Nexus-Token': tok, Origin: 'https://zapier.example' })).json();
    assert.strictEqual(hr.ok, true); assert.strictEqual(hr.vars.x, 'hi');
    const list = await (await fetch(`http://127.0.0.1:${port}/automation/workflows`)).json();
    assert.ok(list.workflows.every(x => !('memory' in x)), 'the list leaves out the engine memory');
  } finally { srv.close(); delete process.env.WIRE_PORT; }
  clean();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
