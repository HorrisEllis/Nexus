'use strict';
/**
 * tests/probe/field-chromium.js — 0.39.279. The interaction field (clear-glass/src/page/field.js) in a real page,
 * Clear Glass's own engine: numbered targets with boxes, centres and z (a modal-covered button reads z > 0), the drawn
 * overlay (badges + grid, pointer-events:none so it never steals a click), at(x,y), the spotlight, and a real click at
 * a target's centre reaching the button.
 * Usage: node tests/probe/field-chromium.js   (exit 0 = all pass, 3 = no page engine)
 */
const path = require('path');
const { start } = require('./_glass-probe.js');
const P = start();
const F = require(path.join(P.ROOT, 'clear-glass/src/page/field.js'));

const PAGE = `<!doctype html><html><head><style>body{margin:0;font:16px sans-serif} #apply{position:absolute;left:100px;top:100px;width:120px;height:40px}
#under{position:absolute;left:400px;top:100px;width:120px;height:40px} #modal{position:absolute;left:380px;top:80px;width:200px;height:100px;background:#eee;z-index:10}
#email{position:absolute;left:100px;top:220px;width:220px} #far{position:absolute;left:100px;top:3000px}</style></head><body>
<button id="apply" onclick="window.__clicked=(window.__clicked||0)+1">Apply now</button>
<button id="under">Hidden action</button><div id="modal">Cookie banner</div>
<label for="email">Email</label><input id="email" type="email" placeholder="you@example.com">
<a id="far" href="#x">Far link</a></body></html>`;

(async () => {
  const b = await P.glass.chromium.launch();
  const pg = await b.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('https://jobs.example.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await pg.goto('https://jobs.example.com/apply');
  const map = await pg.evaluate(F.fieldScript({ overlay: true, grid: 100 }));
  const by = (name) => map.targets.find(t => t.name === name);
  const apply = by('Apply now'), under = by('Hidden action'), email = map.targets.find(t => t.tag === 'input');
  P.case('targets are numbered, with box and centre', apply && apply.n >= 1 && apply.x === 100 && apply.y === 100 && apply.w === 120 && apply.cx === 160 && apply.cy === 120, { apply });
  P.case('a button under the banner reads covered (z > 0); an uncovered one z 0', apply.z === 0 && under && under.z > 0, { apply: apply.z, under: under && under.z });
  P.case('an input is named by its label, with a selector that finds it', email && email.name === 'Email' && email.selector === '#email', { email });
  P.case('an off-screen link is left out unless asked', !by('Far link'));
  const text = F.describe(map);
  P.case('describe: one short line per target a small model can read', /#\d+ button "Apply now" \(160,120\) 120×40 z0/.test(text) && /covered×/.test(text), { text });
  const ov = await pg.evaluate(() => { const o = document.getElementById('__cg_field__'); return o ? { badges: o.querySelectorAll('.b').length, grid: o.querySelectorAll('.gl').length, pe: getComputedStyle(o).pointerEvents } : null; });
  P.case('the overlay draws a badge per target and a labelled grid, and takes no clicks', ov && ov.badges === map.targets.length && ov.grid > 4 && ov.pe === 'none', { ov });
  const at = await pg.evaluate(F.atScript({ x: 460, y: 120 }));
  P.case('at(x,y): the top of the stack is the banner, not the button under it', at.stack[0] && at.stack[0].id === 'modal' && at.stack.some(s => s.id === 'under'), { top: at.stack.slice(0, 3) });
  const spot = await pg.evaluate(F.spotlightScript({ selector: '#apply', label: '#1 click', ttl: 0 }));
  const spotEl = await pg.evaluate(() => { const s = document.getElementById('__cg_spot__'); return s ? { label: s.textContent, pe: getComputedStyle(s).pointerEvents } : null; });
  P.case('spotlight rings the target with its label, and takes no clicks', spot.ok && spotEl && spotEl.label === '#1 click' && spotEl.pe === 'none', { spot, spotEl });
  // what a real click at the centre would hit (elementFromPoint is the browser's own hit test): the overlay and the
  // spotlight are pointer-events:none, so the button — not the drawing — takes it
  const hit = await pg.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); el && el.click(); return el && el.id; }, { x: apply.cx, y: apply.cy });
  P.case('a click at the target centre reaches the button, through the overlay and spotlight', hit === 'apply' && (await pg.evaluate(() => window.__clicked)) === 1, { hit });
  P.case('a label with a visible control is not a second target', map.targets.filter(t => t.name === 'Email').length === 1);
  const off = await pg.evaluate(F.fieldOffScript());
  P.case('fieldOff removes everything it drew', off.removed === 3 && (await pg.evaluate(() => !document.getElementById('__cg_field__') && !document.getElementById('__cg_spot__'))));
  P.case('no page errors', errors.length === 0, { errors });
  await b.close();
  P.done();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
