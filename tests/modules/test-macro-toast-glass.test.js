'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-macro-toast-glass.test.js — MT1 (0.60.335), driven in Clear Glass (glass.js).
 * James, 2026-10-31: "a toast with playback controls … the classic red dot breathing when recording." · "step by step macro recorder, with a hotkey"
 *   MT-01  recording() shows the toast with a breathing red dot and Stop
 *   MT-02  playing() shows the name, step N/M, a progress bar and controls; step() updates it
 *   MT-03  hide() clears it
 *   MT-06  0.60.404 MT6: fromProgress draws a playing macro from the bridge's progress (step N/M, its label); its buttons reach the macro
 *   MT-07  0.60.404 MT6: the end says done, or where it stopped and why; a state that is not a playback is ignored
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
    const prog = await pg.evaluate(() => {
      const ops = []; const T = window.CGMacroToast; T.hide();
      T.fromProgress({ kind: 'recording', steps: 3 }, (o) => ops.push(o)); const ignored = document.getElementById('cg-macro-toast').className === '';
      T.fromProgress({ kind: 'playback', name: 'fiverr gig fill', i: 1, n: 4, label: 'click #category', paused: false, done: false }, (o) => ops.push(o));
      const el = document.getElementById('cg-macro-toast');
      const drew = /fiverr gig fill/.test(el.textContent) && /step 2 \/ 4 — click #category/.test(el.textContent);
      el.querySelector('[data-mt="pause"]').click();
      T.fromProgress({ kind: 'playback', name: 'fiverr gig fill', i: 1, n: 4, label: 'click #category', paused: true, done: false }, (o) => ops.push(o));
      const resumeShown = !!el.querySelector('[data-mt="resume"]'); el.querySelector('[data-mt="resume"]').click(); el.querySelector('[data-mt="step"]').click(); el.querySelector('[data-mt="stop"]').click();
      return { ignored, drew, resumeShown, ops };
    });
    t('MT-06', 'fromProgress draws the playing macro; its buttons reach it', prog.ignored && prog.drew && prog.resumeShown && JSON.stringify(prog.ops) === JSON.stringify(['pause', 'resume', 'skip', 'stop']));
    if (!(prog.ignored && prog.drew && prog.resumeShown)) console.error('    ' + JSON.stringify(prog));
    const end = await pg.evaluate(() => {
      const T = window.CGMacroToast, el = document.getElementById('cg-macro-toast');
      T.fromProgress({ kind: 'playback', name: 'fiverr gig fill', i: 3, n: 4, done: true, ok: true });
      const ok = /✓ fiverr gig fill/.test(el.textContent) && /done · 4 steps/.test(el.textContent);
      T.fromProgress({ kind: 'playback', name: 'fiverr gig fill', i: 2, n: 4, done: true, ok: false, error: 'no element #category' });
      const bad = /✗ fiverr gig fill/.test(el.textContent) && /stopped at step 3 — no element #category/.test(el.textContent);
      return { ok, bad, text: el.textContent };
    });
    t('MT-07', 'the end says done, or where it stopped and why', end.ok && end.bad);
    if (!(end.ok && end.bad)) console.error('    ' + end.text);
    await pg.close();
  } catch (e) { console.error('  ✗ harness:', e.message); f++; }
  finally { try { await b.close(); } catch (_) {} }
  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
