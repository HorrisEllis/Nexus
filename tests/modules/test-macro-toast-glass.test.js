'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-macro-toast-glass.test.js — MT1 (0.60.335), driven in Clear Glass (glass.js).
 * James, 2026-10-31: "a toast with playback controls … the classic red dot breathing when recording." · "step by step macro recorder, with a hotkey"
 *   MT-01  recording() shows the toast with a breathing red dot and Stop
 *   MT-02  playing() shows the name, step N/M, a progress bar and controls; step() updates it
 *   MT-03  hide() clears it
 */
const fs = require('fs'); const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'clear-glass/src/driver/glass.js'));
const JS = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass/renderer/macro-toast.js'), 'utf8');
let p = 0, f = 0;
const t = (id, d, ok) => { if (ok) { console.log(`  ✓ ${id} ${d}`); p++; } else { console.error(`  ✗ ${id} ${d}`); f++; } };

(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 900, height: 600 } });
    await pg.goto('data:text/html,<body></body>'); await pg.evaluate(JS);
    const rec = await pg.evaluate(() => { window.CGMacroToast.recording(true, { onStop: () => {} }); const el = document.getElementById('cg-macro-toast'); return el.classList.contains('show') && el.classList.contains('recording') && !!el.querySelector('.mt-dot') && !!el.querySelector('[data-mt=stop]'); });
    t('MT-01', 'recording shows the breathing dot + Stop', rec);
    const play = await pg.evaluate(() => { window.CGMacroToast.playing({ name: 'fiverr overview', index: 2, total: 5 }, { onPause: () => {}, onStep: () => {}, onStop: () => {} }); window.CGMacroToast.step(3, 5, 'click'); const el = document.getElementById('cg-macro-toast'); return el.classList.contains('playing') && el.querySelector('#mt-prog').textContent.indexOf('3 / 5') >= 0 && el.querySelector('.mt-bar > i').style.width === '60%' && !!el.querySelector('[data-mt=pause]') && !!el.querySelector('[data-mt=step]'); });
    t('MT-02', 'playing shows name + N/M + bar + controls; step updates', play);
    const hid = await pg.evaluate(() => { window.CGMacroToast.hide(); return document.getElementById('cg-macro-toast').className === ''; });
    t('MT-03', 'hide clears it', hid);
    await pg.close();
  } catch (e) { console.error('  ✗ harness:', e.message); f++; }
  finally { try { await b.close(); } catch (_) {} }
  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
