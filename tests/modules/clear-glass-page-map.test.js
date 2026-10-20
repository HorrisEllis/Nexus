'use strict';
/**
 * tests/modules/clear-glass-page-map.test.js — PM1–PM4 (0.60.174): the page as blocks → index + chunks → a map that learns →
 * intent → targets.
 * Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec
 * James, 2026-10-19: "parse the dom, index each element as blocks, then download into a index to chunk, then synthesize a fucking
 * map in relation to the weboage to use as a map or reference point for inputs from the cli or the intent. learns over time."
 *
 *   PM-01  blocks (jsdom): landmarks, headings, paragraphs, lists, tables, fields and buttons are blocks with the semantic tree's
 *          addresses; ids are stable across two reads and when a paragraph is inserted above another; hidden things are not
 *          blocks; siteKey generalizes ids in the path; the semantic tree's own (non-content) output is unchanged
 *   PM-02  chunks cover every block exactly once, split at landmarks and section headings; search finds a field by its label
 *   PM-03  synthesize: the form with its fields (required marked) and its submit, the regions, the actions — as short lines;
 *          toMarkdown is the page's text by section (the scraper)
 *   PM-04  memory: the second visit says what is new, changed and gone; a block seen on both is stable; a file that will not
 *          parse is set aside as .bad, said
 *   PM-05  find: "type my email" → the Email field; "click apply" → the Apply button; a covered button sinks; a recorded success
 *          moves the chosen block to the top next time, a failure moves it down
 *   PM-06  the real page in Clear Glass's engine: boxes, centres and z (a modal covers a button: z > 0, find says so); no engine →
 *          SKIPPED, said
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '../..');
const BL = require(path.join(ROOT, 'clear-glass/src/page/blocks.js'));
const PM = require(path.join(ROOT, 'clear-glass/src/page/page-map.js'));
const MEM = require(path.join(ROOT, 'clear-glass/src/page/page-memory.js'));
const ST = require(path.join(ROOT, 'clear-glass/src/page/semantic-tree.js'));

let passed = 0, failed = 0, skipped = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}

const JOB = (extra = '') => `<html><head><title>Apply — Acme</title></head><body>
  <header><nav aria-label="Main"><a href="/jobs">Jobs</a><a href="/about">About</a></nav></header>
  <main>
    <h1>Senior Engineer</h1>
    ${extra}
    <p>We build tools that help people find work. This paragraph is long enough to be a block of its own.</p>
    <ul><li>Remote</li><li>Full time</li></ul>
    <table><tr><th>Salary</th><td>100k</td></tr></table>
    <h2>Apply</h2>
    <form aria-label="Apply">
      <label for="em">Email</label><input id="em" type="email" required>
      <label for="nm">Full name</label><input id="nm" name="fullname">
      <textarea aria-label="Cover letter"></textarea>
      <button type="submit">Apply now</button>
    </form>
    <div style="display:none"><p>secret hidden paragraph that must not be read as a block at all</p></div>
  </main>
  <footer><p>© Acme — all rights reserved, this is footer text long enough.</p></footer>
</body></html>`;
const read = (html, url = 'https://jobs.acme.com/jobs/123/apply') => {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  return BL.normalize(JSON.parse(JSON.stringify(dom.window.eval(BL.pageScript()))));
};

(async () => {
  console.log('\nclear-glass-page-map — blocks → index + chunks → a map that learns → intent → targets (PM1–PM4)');

  await test('PM-01', 'blocks: every element of substance, the tree\'s addresses, stable ids; hidden not read; siteKey', async () => {
    const p = read(JOB());
    const roles = p.blocks.map(b => b.role);
    for (const r of ['banner', 'navigation', 'link', 'main', 'heading', 'paragraph', 'list', 'table', 'form', 'textbox', 'button', 'contentinfo']) assert.ok(roles.includes(r), `${r} missing: ${roles.join(',')}`);
    const email = p.blocks.find(b => b.role === 'textbox' && b.name === 'Email');
    assert.strictEqual(email.address, 'main › form "Apply" › textbox "Email"');
    assert.strictEqual(email.kind, 'field'); assert.ok(email.selector && (email.states || []).includes('required'));
    assert.ok(!p.blocks.some(b => /secret hidden/.test(b.text)), 'hidden is not a block');
    assert.strictEqual(p.site, 'https://jobs.acme.com/jobs/:id/apply');
    assert.strictEqual(BL.siteKey('https://x.com/u/5f3a9c0e1b2d/edit?q=1'), 'https://x.com/u/:id/edit');
    const ids = (q) => Object.fromEntries(q.blocks.map(b => [`${b.role}|${b.name}|${b.text}`, b.id]));
    assert.deepStrictEqual(ids(read(JOB())), ids(p), 'the same page, the same ids');
    const p2 = read(JOB('<p>A new paragraph inserted above the others, long enough to be its own block.</p>'));
    const para = (q) => q.blocks.find(b => b.role === 'paragraph' && /help people find work/.test(b.text)).id;
    assert.strictEqual(para(p2), para(p), 'a paragraph inserted above does not rename the one below');
    assert.strictEqual(new Set(p.blocks.map(b => b.id)).size, p.blocks.length, 'ids are unique');
    // the semantic tree without content mode is what it was
    const dom = new JSDOM(JOB(), { url: 'https://x/', runScripts: 'outside-only' });
    const plain = ST.normalize(JSON.parse(JSON.stringify(dom.window.eval(ST.pageScript()))));
    assert.ok(!plain.nodes.some(n => n.role === 'paragraph' || n.text || n.box), 'content mode is opt-in');
  });

  const page = read(JOB());
  await test('PM-02', 'chunks cover every block once, split at landmarks and sections; search finds a field by its label', async () => {
    const cs = PM.chunk(page);
    const all = cs.flatMap(c => c.blocks);
    assert.strictEqual(all.length, page.blocks.length); assert.strictEqual(new Set(all).size, page.blocks.length);
    assert.ok(cs.some(c => c.title === 'Apply' && /Apply now/.test(c.text)), cs.map(c => c.title).join(' | '));
    assert.ok(PM.chunk(page, { maxChars: 40 }).length > cs.length, 'a small budget splits more');
    const idx = PM.index(page);
    const hit = PM.search(page, idx, 'email')[0];
    assert.strictEqual(hit.block.name, 'Email');
  });

  await test('PM-03', 'synthesize: the form, its fields and submit, the regions and actions as lines; markdown by section', async () => {
    const m = PM.synthesize(page, { chunks: PM.chunk(page) });
    const f = m.forms.find(x => x.name === 'Apply');
    assert.deepStrictEqual(f.fields.map(x => [x.name, x.required]), [['Email', true], ['Full name', false], ['Cover letter', false]]);
    assert.deepStrictEqual(f.submit.map(s => s.name), ['Apply now']);
    assert.ok(m.lines.some(l => l === 'form "Apply" — 3 field(s) (Email*, Full name, Cover letter) → button "Apply now"'), m.lines.join('\n'));
    assert.ok(m.lines.some(l => /^navigation "Main" — \d+ blocks, 2 links$/.test(l)), m.lines.join('\n'));
    const md = PM.toMarkdown(page);
    assert.ok(md.startsWith('# Apply — Acme') && /\n## Apply\n/.test(md) && /Apply now/.test(md) && /help people find work/.test(md), md);
    const j = PM.toJSON(page); assert.ok(j.blocks.length && j.chunks.length && j.map.forms.length);
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-mem-'));
  const warns = [];
  const mem = MEM.createMemory({ dir, warn: (m) => warns.push(m) });
  await test('PM-04', 'memory: new, changed, gone on the second visit; stable blocks; a bad file kept as .bad', async () => {
    const v1 = mem.visit(page);
    assert.ok(v1.first && v1.visits === 1);
    const changed = read(JOB().replace('Senior Engineer', 'Staff Engineer').replace('<ul><li>Remote</li><li>Full time</li></ul>', '<ol><li>Hybrid</li></ol>').replace('<table><tr><th>Salary</th><td>100k</td></tr></table>', ''));
    const v2 = mem.visit(changed);
    assert.ok(!v2.first && v2.visits === 2);
    assert.ok(v2.gone.length >= 1, 'the table is gone');
    assert.ok(v2.new.length >= 1, 'the new list is new');
    assert.ok(v2.stable >= 5, `stable ${v2.stable}`);
    const f = mem.forPage(changed);
    const email = changed.blocks.find(b => b.name === 'Email');
    assert.strictEqual(f.stability(email.id), 1);
    const m2 = MEM.createMemory({ dir, warn: (m) => warns.push(m) });
    const file = fs.readdirSync(dir).find(x => x.endsWith('.json'));
    fs.writeFileSync(path.join(dir, file), '{nope');
    assert.strictEqual(m2.read(page.site).visits, 0);
    assert.ok(fs.existsSync(path.join(dir, `${file}.bad`)) && /did not parse/.test(warns[0]), warns.join(' | '));
  });

  await test('PM-05', 'find: the field to type into, the button to press, covered sinks, outcomes learned', async () => {
    const mem2 = MEM.createMemory({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'pm-mem2-')) });
    mem2.visit(page); mem2.visit(page);
    const t = PM.find(page, 'type my email', { memory: mem2.forPage(page) });
    assert.strictEqual(t.targets[0].name, 'Email'); assert.ok(t.targets[0].selector);
    assert.ok(t.targets[0].why.some(w => /a field/.test(w)) && t.targets[0].why.some(w => /stable/.test(w)), JSON.stringify(t.targets[0]));
    const c = PM.find(page, 'click apply', { memory: mem2.forPage(page) });
    assert.strictEqual(c.targets[0].name, 'Apply now', JSON.stringify(c.targets.slice(0, 3)));
    // a covered button sinks below an uncovered one
    const cov = { ...page, blocks: page.blocks.map(b => (b.name === 'Apply now' ? { ...b, z: 2 } : b)) };
    const open_ = PM.find(page, 'click apply').targets.find(x => x.name === 'Apply now'), covered = PM.find(cov, 'click apply').targets.find(x => x.name === 'Apply now');
    assert.ok(covered.score < open_.score && covered.why.some(w => /covered \(2 layer/.test(w)), JSON.stringify(covered));
    // learned: the form heading "Apply" chosen and it worked twice → it leads for "click apply"; then failures demote it
    const heading = page.blocks.find(b => b.role === 'heading' && b.name === 'Apply');
    mem2.outcome(page.site, 'click apply', heading.id, true); mem2.outcome(page.site, 'apply', heading.id, true);
    assert.strictEqual(PM.find(page, 'click apply', { memory: mem2.forPage(page) }).targets[0].id, heading.id, 'what worked here before leads');
    for (let i = 0; i < 5; i++) mem2.outcome(page.site, 'apply', heading.id, false);
    assert.notStrictEqual(PM.find(page, 'click apply', { memory: mem2.forPage(page) }).targets[0].id, heading.id, 'what failed sinks');
  });

  // PM-06 — the real page in Clear Glass's engine (AXIOMS §4.1): layout, centres and z
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  const eng = glass.engine(); let browser = null;
  if (!eng) { console.log('  - PM-06 SKIPPED: Clear Glass has no engine here — the layout check did not run'); skipped++; }
  else { try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PM-06 SKIPPED: Clear Glass's engine (${eng.kind}) could not start (${e.message.split('\n')[0]})`); skipped++; } }
  if (browser) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-ui-'));
    fs.writeFileSync(path.join(d, 'index.html'), JOB().replace('</body>', '<div id="modal" style="position:fixed;inset:0;background:rgba(0,0,0,.5)"><button>Accept cookies</button></div></body>'));
    try {
      const pg = await browser.newPage();
      await pg.goto(require('url').pathToFileURL(path.join(d, 'index.html')).href);
      await test('PM-06', 'in Clear Glass\'s engine: boxes, centres, z; a modal covers the Apply button and find says so', async () => {
        const raw = await pg.evaluate(BL.pageScript());
        const p = BL.normalize(raw);
        const apply = p.blocks.find(b => b.name === 'Apply now'), cookies = p.blocks.find(b => b.name === 'Accept cookies');
        assert.ok(apply.box && apply.box.w > 0 && apply.box.h > 0, JSON.stringify(apply));
        assert.ok(apply.z > 0 || apply.z === -1, `apply z ${apply.z} (the modal covers it)`);
        assert.strictEqual(cookies.z, 0);
        const f = PM.find(p, 'click apply');
        const a = f.targets.find(x => x.name === 'Apply now');
        assert.ok(a && Number.isFinite(a.cx) && Number.isFinite(a.cy) && a.why.some(w => /covered|off-screen/.test(w)), JSON.stringify(a));
      });
    } finally { await browser.close(); fs.rmSync(d, { recursive: true, force: true }); }
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
})();
