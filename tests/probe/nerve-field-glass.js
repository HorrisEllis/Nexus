// Clear Glass probe of the nerve and the interaction field together — §FN3 0.59.0 (docs/2026-10-10-shape-of-nexus-phasemap.spec).
// James: "Can you make the commands for the interaction field and maybe integrate it with nexus nerve?"
// The REAL nerve fragment and script (ui/tv-shell/nerve/nerve.html, nerve.js), served beside a stub orchestrator that answers
// the routes nerve.js calls (/api/guardian/nerve/snapshot with a window's focus, /api/guardian/hooks/summary). The REAL field
// script (clear-glass/src/page/field.js) is run in the page: it numbers the nerve's nodes by name; a press says a node's
// state; the HUD says where a window's attention is. Driven by Clear Glass's engine (clear-glass/src/driver/glass.js).
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '../..');
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();

(async () => {
  const NERVE = path.join(ROOT, 'ui/tv-shell/nerve');
  const now = () => Date.now();
  const server = http.createServer((req, rs) => {
    const send = (type, body) => { rs.writeHead(200, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }); rs.end(body); };
    if (req.url === '/') return send('text/html', `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/nerve.css"><style>html,body{margin:0;height:100%;background:#08080d}</style></head>
      <body><div style="width:900px;height:560px">${fs.readFileSync(path.join(NERVE, 'nerve.html'), 'utf8').replace('<script src="nerve.js"></script>', '')}</div>
      <script>window.__NEXUS_ORCH__ = location.origin;</script><script src="/nerve.js"></script></body></html>`);
    if (req.url === '/nerve.js' || req.url === '/nerve.css') return send(req.url.endsWith('.js') ? 'application/javascript' : 'text/css', fs.readFileSync(path.join(NERVE, req.url.slice(1))));
    if (req.url === '/api/guardian/nerve/snapshot') return send('application/json', JSON.stringify({ ok: true,
      nodes: [{ id: 'guardian', health: { coherence: 0.8, friction: 0.1, entropy: 0.2, regime: 'stable' }, presence: { status: 'live' } }],
      stresses: [], windows: [{ agentId: 'default', idle: false, mutationCount: 3, focus: { url: 'https://example.com/', field: { targets: 12, at: now() - 900 }, spotlight: null,
        pointer: { do: 'click', n: 3, name: 'Apply now', x: 412, y: 580, at: now() - 400 }, at: now() - 400 } }] }));
    if (req.url === '/api/guardian/hooks/summary') return send('application/json', JSON.stringify({ ok: true, wires: [
      { from: { surface: 'guardian' }, to: { surface: 'cortex' }, seam: true }, { from: { surface: 'idearium' }, to: { surface: 'guardian' } }, { from: { surface: 'copilot' }, to: { surface: 'guardian' } }] }));
    if (req.url === '/api/guardian/cfr/state') return send('application/json', JSON.stringify({ ok: true, sigma: 0.2, regime: 'stable' }));
    rs.writeHead(404); rs.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const F = require(path.join(ROOT, 'clear-glass/src/page/field.js'));
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1000, height: 640 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`${BASE}/`);
    for (let i = 0; i < 40 && !(await pg.evaluate(() => document.querySelectorAll('#nerve-targets button').length >= 5)); i++) await pg.waitForTimeout(250);
    const map = await pg.evaluate(F.fieldScript({ overlay: true }));
    const text = F.describe(map, { limit: 40 });
    check('the field numbers the nerve\'s nodes by name (a canvas alone gave it nothing)', /nerve node guardian/.test(text) && /nerve node cortex/.test(text) && /nerve node idearium/.test(text), text.slice(0, 400));
    const g = F.target(map, (map.targets.find(t => /nerve node guardian/.test(t.name)) || {}).n);
    check('… each target sits on its node, on top (z 0), with what the node carries', g && g.z === 0 && /3 wire\(s\)/.test(g.name), JSON.stringify(g));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'nerve-field.png') });
    await pg.evaluate(F.fieldOffScript());
    await pg.waitForTimeout(600);
    const hud = await pg.evaluate(() => (document.getElementById('nerve-focus') || {}).textContent || '');
    check('the HUD says where a window\'s attention is: the field\'s last act there', /default/.test(hud) && /click #3 Apply now/.test(hud), hud);
    check('NexusNerve.attention() carries the snapshot\'s windows', await pg.evaluate(() => window.NexusNerve.attention()[0].focus.pointer.n === 3));
    await pg.click(`#nerve-targets [data-node="guardian"]`);
    await pg.waitForTimeout(300);
    const said = await pg.evaluate(() => document.getElementById('nerve-focus').textContent);
    check('pressing a node (as `field point` does) says its state', /guardian · 3 wire\(s\)/.test(said), said);
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'nerve-picked.png') });
    check('no page errors', errs.length === 0, errs.slice(0, 3).join('; '));
  } finally { await br.close(); server.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
