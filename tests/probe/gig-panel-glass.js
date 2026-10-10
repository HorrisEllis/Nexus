// Clear Glass probe of the Fiverr panel in the browser — §0.59.3.
// James: "fiverr tutorial for helping me speed up gigs as much as possible … i was thinking to have the questions for the
// end state conditions in the gigs, so i can just send them to idearium and have them built … its built somewhere but not
// in the browser.html".
// The REAL browser.html markup for #gig-panel, the REAL browser.css and gig-panel.js, with window.cg standing in for
// Electron's preload (the same calls: autofill.listProfiles / gig / gigFill / gigToIdearium). The gig the stub returns is
// parsed by the REAL src/autofill/gig.js parseGig; the order is turned into a spec by the REAL briefToSpec.
// Driven by Clear Glass's engine (clear-glass/src/driver/glass.js), never Playwright.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '../..');
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();
const G = require(path.join(ROOT, 'clear-glass/src/autofill/gig.js'));

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.html'), 'utf8');
  const panel = html.slice(html.indexOf('<div id="gig-panel"'), html.indexOf('<!-- Picks panel -->'));
  const gigReply = JSON.stringify({ title: 'I will build a simple booking website for your small business', category: 'Programming & Tech', subcategory: 'Website Development',
    tags: ['booking website', 'small business', 'website'], description: 'A clean booking site your customers can use on their phones.',
    packages: { basic: { name: 'One page', description: 'One booking page', deliveryDays: 3, revisions: 1, price: 40 }, standard: { name: 'Three pages', description: 'Booking plus two pages', deliveryDays: 5, revisions: 2, price: 90 }, premium: { name: 'Full site', description: 'Up to six pages with booking', deliveryDays: 7, revisions: 3, price: 180 } },
    faq: [{ question: 'Do I need hosting?', answer: 'I can set it up for you.' }],
    requirements: ['What must the finished site do?', 'Who will use it, and on what devices?', 'What must it always do, and never do?', 'How will you check it is done?', 'What logos, photos or logins do I need?'] });
  const parsed = G.parseGig(gigReply);
  const server = http.createServer((req, rs) => {
    if (req.url === '/browser.css') { rs.writeHead(200, { 'Content-Type': 'text/css' }); return rs.end(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.css'))); }
    if (req.url === '/gig-panel.js') { rs.writeHead(200, { 'Content-Type': 'application/javascript' }); return rs.end(fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/gig-panel.js'))); }
    rs.writeHead(200, { 'Content-Type': 'text/html' });
    rs.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/browser.css"></head><body style="margin:0;height:100vh;background:#0b0b10">
      <button id="btn-gig">✦</button>${panel}
      <script>
        window.__calls = [];
        window.cg = { window: { openSettings() { window.__calls.push(['openSettings']); } }, autofill: {
          listProfiles: async () => [{ id: 'p1', name: 'James — web' }],
          gig: async (p) => { window.__calls.push(['gig', p]); return ${JSON.stringify({ ok: true, gig: parsed.gig, warnings: parsed.warnings })}; },
          gigFill: async (g, a) => { window.__calls.push(['gigFill', a]); return { ok: true, filled: 6, skipped: ['category'] }; },
          gigToIdearium: async (p) => { window.__calls.push(['gigToIdearium', p]); return { ok: true, title: 'maria — A booking site', workshop: 'ws-1', repoUuid: 'r-1', open: 'http://127.0.0.1:4800/workshop.html?id=ws-1' }; } } };
      </script><script src="/gig-panel.js"></script></body></html>`);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${server.address().port}/?agentId=default`);
    check('the ✦ button opens the Fiverr panel in the browser page', (await pg.evaluate(() => { document.getElementById('btn-gig').click(); return document.getElementById('gig-panel').classList.contains('visible'); })));
    await pg.waitForTimeout(200);
    check('… with the profile loaded', await pg.evaluate(() => document.getElementById('gig-profile').value === 'p1' && document.getElementById('gig-no-profile').hidden));
    await pg.fill('#gig-offer', 'simple booking websites for small businesses');
    await pg.click('#gig-write'); await pg.waitForTimeout(300);
    const parts = await pg.evaluate(() => [...document.querySelectorAll('#gig-parts .gig-part b')].map(b => b.textContent));
    check('one line → the whole gig, each part with its own Copy', parts.includes('Title') && parts.includes('Description') && parts.includes('Basic package') && parts.filter(p => /Buyer question/.test(p)).length === 5, JSON.stringify(parts));
    check('… asked of the co-pilot with that line and the profile', await pg.evaluate(() => { const c = window.__calls.find(x => x[0] === 'gig'); return c && c[1].offer === 'simple booking websites for small businesses' && c[1].profileId === 'p1'; }));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'gig-panel-write.png') });
    await pg.click('#gig-fill'); await pg.waitForTimeout(200);
    check('Fill this Fiverr page fills the tab and says what is left to paste', /Filled 6 field/.test(await pg.evaluate(() => document.getElementById('gig-write-status').textContent)));
    await pg.click('.gig-tab[data-step="build"]'); await pg.waitForTimeout(150);
    const qs = await pg.evaluate(() => [...document.querySelectorAll('#gig-questions .gig-q span')].map(s => s.textContent));
    check('step 2 shows the gig\'s own five end-state questions', qs.length === 5 && /finished site do/.test(qs[0]), JSON.stringify(qs));
    await pg.fill('#gig-reply', '1. Take bookings and email me each one.\n2. Salon customers, on phones.\n3. Never double-book.\n4. I book a test slot and get the email.\n5. Logo attached.');
    await pg.click('#gig-split'); await pg.fill('#gig-buyer', 'maria');
    const ans = await pg.evaluate(() => [...document.querySelectorAll('#gig-questions textarea')].map(t => t.value));
    check('the buyer\'s whole reply splits into the five answers', ans[0] === 'Take bookings and email me each one.' && ans[3] === 'I book a test slot and get the email.', JSON.stringify(ans));
    await pg.click('#gig-send'); await pg.waitForTimeout(200);
    const sent = await pg.evaluate(() => (window.__calls.find(x => x[0] === 'gigToIdearium') || [])[1]);
    check('Send to Idearium carries the gig, the answers and the buyer', sent && sent.answers.length === 5 && sent.buyer === 'maria' && sent.gig.title === parsed.gig.title);
    const spec = G.briefToSpec(sent);
    check('… and becomes a spec: end state, users, must/never, how we know it is done, materials', ['order', 'purpose', 'context', 'axioms', 'tests', 'materials'].every(id => spec.sections.some(s => s.id === id)) && /email me/.test(spec.sections.find(s => s.id === 'purpose').body) && /test slot/.test(spec.sections.find(s => s.id === 'tests').body));
    check('the result says where it landed, with Open in Idearium', /In Idearium/.test(await pg.evaluate(() => document.getElementById('gig-build-status').textContent)) && await pg.evaluate(() => !document.getElementById('gig-open-idearium').hidden));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'gig-panel-build.png') });
    await pg.click('#gig-close'); await pg.waitForTimeout(100);
    check('✕ closes the panel', !(await pg.evaluate(() => document.getElementById('gig-panel').classList.contains('visible'))));
    check('no page errors', errs.length === 0, errs.slice(0, 3).join('; '));
  } finally { await br.close(); server.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
