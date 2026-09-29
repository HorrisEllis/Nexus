'use strict';
/**
 * tests/probe/menu-overlay-hit-chromium.js — 0.39.280. James: "when importing a repo the system rewind menu pops up when
 * clicking continue". The real tv-shell and home stylesheets over a page with a button where the closed menu's
 * REWIND sits: the browser's own hit test (elementFromPoint) must reach the page, not the invisible REWIND; an
 * open menu's REWIND is still hit.
 * Usage: node tests/probe/menu-overlay-hit-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const { start } = require('./_glass-probe.js');
const P = start();

const page = (css) => `<!doctype html><html><head><style>${css}</style><style>body{margin:0;background:#000}
#page{position:fixed;inset:0;z-index:1}</style></head><body>
<div id="page"><button id="continue" style="position:fixed;left:0;right:0;bottom:0;height:400px;width:100%">continue →</button></div>
<div id="hud"><div id="menu-overlay"><div id="sys-bar"><button id="inspect-btn">⊕ INSPECT</button><button id="rewind-btn" onclick="window.__rewind=1">⟲ REWIND</button><button id="settings-btn">⚙</button></div></div></div>
</body></html>`;

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  for (const css of ['ui/tv-shell/tv-shell.css', 'ui/home/areas/shell.css']) {
    const src = P.read(css) + (css.includes('home') ? P.read('ui/home/areas/rewind.css') : '');
    await pg.route('https://shell.local/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: page(src) }));
    await pg.goto(`https://shell.local/${css.replace(/\W/g, '-')}`);
    const r = await pg.evaluate(() => {
      const box = document.getElementById('rewind-btn').getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const closed = document.elementFromPoint(x, y);
      document.getElementById('menu-overlay').classList.add('open');
      const open = document.elementFromPoint(x, y);
      return { closed: closed && closed.id, open: open && open.id, w: box.width };
    });
    P.case(`${css}: a closed menu's invisible REWIND no longer takes the click — the page's button does`, r.w > 0 && r.closed === 'continue', r);
    P.case(`${css}: an open menu's REWIND is still clickable`, r.open === 'rewind-btn', r);
    await pg.unroute('https://shell.local/**');
  }
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
