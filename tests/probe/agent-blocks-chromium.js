// Real Chromium (Clear Glass's engine) probe of Settings → Agents → "what the agent is sent" (idearium/ui/js/agent-blocks.js + css).
// The page loads the REAL agent-blocks.js/css; the three routes are served by the REAL lib/repo-prompt-blocks.js and
// lib/repo-agent.js compose() — same calls as idearium/api/index.js's route cases. Not the full idearium page.
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
process.env.JAA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-probe-'));
const ROOT = path.join(__dirname, '../..');
const PB = require(ROOT + '/lib/repo-prompt-blocks.js');
const RA = require(ROOT + '/lib/repo-agent.js');
const U = 'probe-repo-1';
const posts = [];
const page = `<!doctype html><html><head><link rel="stylesheet" href="/ui/css/agent-blocks.css"></head><body>
<div id="agent-blocks-section"></div>
<script>
const API_BASE='';
async function api(p,opts={},t=6000){const r=await fetch(API_BASE+p,{headers:{'Content-Type':'application/json'},...opts});let d={};try{d=await r.json()}catch(_){}if(!r.ok||d.ok===false){throw new Error(d.error||'failed')}return d}
${fs.readFileSync(ROOT + '/idearium/ui/js/app.js', 'utf8').match(/function escapeHtml\(s\)\{[^\n]*\}/)[0]}
window.confirm=()=>true;
</script>
<script src="/ui/js/agent-blocks.js"></script></body></html>`;
const srv = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
  const b = d ? JSON.parse(d) : {};
  const j = (o, s = 200) => { r.writeHead(s, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
  if (q.url === '/') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(page); }
  if (q.url.startsWith('/ui/')) { const f = path.join(ROOT, 'idearium', q.url); r.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'application/javascript' }); return r.end(fs.readFileSync(f)); }
  if (q.url === `/api/repos/${U}/agent/blocks` && q.method === 'GET') return j({ ok: true, blocks: PB.getBlocks(U), placeholders: PB.PLACEHOLDERS });
  if (q.url === `/api/repos/${U}/agent/blocks` && q.method === 'POST') { posts.push(b); const x = b.reset ? PB.resetBlocks(U, Array.isArray(b.reset) ? b.reset : null) : PB.setBlocks(U, b.blocks); return j(x.ok ? { ok: true, blocks: x.blocks } : { ok: false, error: x.errors.join('; ') }, x.ok ? 200 : 400); }
  if (q.url === `/api/repos/${U}/agent/blocks/preview`) { const text = RA.compose({ hat: { personaPrompt: 'PERSONA-GEN' }, message: b.message || 'hello', context: { kind: null, block: '' }, repoUuid: U, backend: 'guardian' }); return j({ ok: true, text, chars: text.length, backend: 'guardian', context: 'none', toolsFilled: false }); }
  j({ ok: false, error: 'no route ' + q.url }, 404);
}); });
let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
srv.listen(0, '127.0.0.1', async () => {
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');   // 0.39.262 — Clear Glass's engine, not Playwright
  const br = await chromium.launch();
  const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
  await pg.evaluate(() => renderAgentBlocks({ uuid: 'probe-repo-1' }));
  const n = await pg.locator('.ab-block').count();
  check(`every block is listed (${n})`, n === PB.DEFAULT_BLOCKS.length);
  check('css applied (body hidden until opened)', await pg.locator('#ab-question .ab-body').isHidden());
  await pg.click('#ab-question .ab-head .ab-label');
  check('clicking a block opens its editor', await pg.locator('#ab-text-question').isVisible());
  await pg.fill('#ab-text-question', 'ASK: {message}');
  await pg.click('#ab-learn .ab-head input[type=checkbox]');
  check('unticking dims the block', await pg.locator('#ab-learn.ab-off').count() === 1);
  await pg.click('text=save'); await pg.waitForTimeout(300);
  check('save posts every block', posts.length === 1 && posts[0].blocks.length === PB.DEFAULT_BLOCKS.length);
  check('the edit and the switch are stored', PB.getBlocks(U).find(b => b.id === 'question').text === 'ASK: {message}' && PB.getBlocks(U).find(b => b.id === 'learn').enabled === false);
  check('after save the block is marked edited', await pg.locator('#ab-question .ab-edited').count() === 1);
  await pg.fill('#ab-preview-q', 'what boots it?');
  await pg.click('text=preview what is sent'); await pg.waitForTimeout(300);
  const pv = await pg.locator('#ab-preview').textContent();
  check('preview shows the edited question with the message', pv.includes('ASK: what boots it?'), pv.slice(-80));
  check('preview has no disabled @learn block', !pv.includes('@learn'));
  check('preview starts with the persona', pv.startsWith('PERSONA-GEN'));
  check('preview contains nothing outside the blocks', !/NEXUS CONTEXT|hey nexus|USER:/.test(pv));
  await pg.click('text=reset all to defaults'); await pg.waitForTimeout(300);
  check('reset restores defaults', PB.getBlocks(U).every(b => b.enabled && !b.edited));
  await pg.screenshot({ path: path.join(os.tmpdir(), 'agent-blocks-probe.png'), fullPage: true });
  check('no page errors', errs.length === 0, errs.join(' | '));
  await br.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
});
