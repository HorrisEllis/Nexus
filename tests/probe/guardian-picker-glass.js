// Clear Glass probe of the Guardian picker's popup — §0.59.2.
// James: "can you make it so i can use guardian element picker for claude code. also the popup when picking an element
// needs buttons that wre usefull. not add to index. also cant close it. the popup."
// The REAL clear-glass/renderer/guardian-picker.js injected into a page twice (what toggling the picker does), an element
// picked the way a person picks it, then: one popup (not two), ✕ closes it, ESC closes it, → CLAUDE CODE sends the
// element (selector, text, html) to Clear Glass, COPY copies. Driven by Clear Glass's engine (driver/glass.js).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '../..');
const SHOT = process.env.PROBE_SHOT_DIR || os.tmpdir();

(async () => {
  const server = http.createServer((req, rs) => { rs.writeHead(200, { 'Content-Type': 'text/html' });
    rs.end(`<!doctype html><html><head><title>Apply</title></head><body style="font:16px sans-serif;padding:40px;background:#fff">
      <h1>Jobs</h1><button id="apply" style="padding:12px 24px">Apply now</button><p>Other text</p></body></html>`); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const SRC = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/guardian-picker.js'), 'utf8');

  let pass = 0, fail = 0; const check = (n, c, x = '') => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + ' ' + x); } };
  const { chromium } = require(ROOT + '/clear-glass/src/driver/glass.js');
  const br = await chromium.launch();
  try {
    const pg = await br.newPage({ viewport: { width: 1100, height: 760 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`${BASE}/`);
    await pg.evaluate(() => { window.__sent = []; window.__cg = { send: (ch, d) => window.__sent.push({ ch, d }) }; });
    const pick = async () => {
      await pg.evaluate(SRC);                   // what toggling the picker on does
      const r = await pg.evaluate(() => { const b = document.getElementById('apply').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; });
      const M = (type, extra = {}) => pg._send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: type === 'mouseMoved' ? 'none' : 'left', ...extra });
      await M('mouseMoved'); await pg.waitForTimeout(80);
      await M('mousePressed', { buttons: 1, clickCount: 1 }); await M('mouseReleased', { clickCount: 1 }); await pg.waitForTimeout(300);
    };
    await pick();
    await pg.evaluate(() => window.__gPickerActive && window.__gPickerActive.destroy());   // toggled off
    await pick();                                                                           // and on again — the bug's trigger
    const st = await pg.evaluate(() => ({ popups: document.querySelectorAll('#__g-popup').length, shown: !!document.querySelector('#__g-popup.show'),
      buttons: [...document.querySelectorAll('#__g-popup .gf-btn')].map(b => b.textContent.trim()) }));
    check('after the picker is toggled off and on: one popup, not two', st.popups === 1, JSON.stringify(st));
    check('picking an element opens it', st.shown);
    check('the popup leads with → CLAUDE CODE and COPY; SAVE CALLTO kept, CLOSE present', st.buttons[0] === '→ CLAUDE CODE' && st.buttons[1] === '⧉ COPY' && st.buttons.includes('SAVE CALLTO') && st.buttons.includes('CLOSE'), JSON.stringify(st.buttons));
    if (process.env.PROBE_SHOT !== '0') await pg.screenshot({ path: path.join(SHOT, 'guardian-picker-popup.png') });
    await pg.click('#__g-popup-close'); await pg.waitForTimeout(150);
    check('✕ closes it', !(await pg.evaluate(() => !!document.querySelector('#__g-popup.show'))));
    await pick();
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
    check('ESC closes it', !(await pg.evaluate(() => !!document.querySelector('#__g-popup.show'))));
    await pick();
    await pg.fill('#__g-ct-label', 'apply button');
    await pg.click('#__g-btn-agent'); await pg.waitForTimeout(150);
    const sent = await pg.evaluate(() => window.__sent.filter(s => s.d && s.d.type === 'dom.pick.sent').map(s => s.d));
    check('→ CLAUDE CODE sends the element to Clear Glass: selector, label, text, html, page', sent.length === 1 && /apply/.test(sent[0].selector) && sent[0].label === 'apply button' && sent[0].text === 'Apply now' && /<button/.test(sent[0].html) && sent[0].title === 'Apply', JSON.stringify(sent[0] || {}).slice(0, 300));
    check('… and closes the popup', !(await pg.evaluate(() => !!document.querySelector('#__g-popup.show'))));
    // the attention record keeps it for `idearium picks`
    const A = require(path.join(ROOT, 'clear-glass/src/page/attention.js')).createAttention();
    A.note('dom.pick.sent', sent[0]);
    check('Clear Glass keeps the pick for the agents (/cli/picks → idearium picks)', A.picks()[0].selector === sent[0].selector && A.picks()[0].text === 'Apply now');
    check('no page errors', errs.length === 0, errs.slice(0, 3).join('; '));
  } finally { await br.close(); server.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
