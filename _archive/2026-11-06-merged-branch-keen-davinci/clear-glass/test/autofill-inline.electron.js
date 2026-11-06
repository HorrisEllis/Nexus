'use strict';
// AF3 (0.60.263) — run INSIDE Electron by test/autofill-inline.test.js: a real form, a real profile, the chip, a real click.
const os = require('os'), fs = require('fs'), path = require('path');
process.env.CG_JAA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-afi-')); process.env.APPDATA = process.env.CG_JAA_DIR;
const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
app.whenReady().then(async () => {
  const out = {};
  try {
    const { AutofillStore } = require(path.join(ROOT, 'src/autofill/store.js'));
    const store = new AutofillStore(); store.load();
    store.createProfile({ label: 'Freelance', fields: { 'given-name': 'James', 'family-name': 'Brooks', email: 'j@example.com' } });
    const Dom = require(path.join(ROOT, 'src/dom/archaeology.js'));
    const dom = Object.create(Dom.prototype); dom.sse = { emit() {} };
    const win = new BrowserWindow({ show: true, width: 900, height: 700 });
    // a React-style field too: its own value tracking, which only a native setter + input event reaches
    await win.loadURL('http://127.0.0.1:' + (await new Promise(r => { const s = require('http').createServer((q, res) => { res.setHeader('content-type', 'text/html'); res.end(`<form style="margin:40px">
      <label>First name <input id="fn" name="first_name" autocomplete="given-name"></label><br>
      <label>Last name <input id="ln" name="last_name" autocomplete="family-name"></label><br>
      <label>Email <input id="em" type="email" name="email" autocomplete="email"></label><br>
      <label>Password <input id="pw" type="password" name="password" autocomplete="current-password"></label></form>
      <script>window.seen=[];document.getElementById('fn').addEventListener('input',e=>seen.push(e.target.value));</script>`); }); s.listen(0, '127.0.0.1', () => r(s.address().port)); })) + '/apply');
    const I = require(path.join(ROOT, 'src/autofill/inline.js'));
    const r = await I.attach(win.webContents, { dom, store });
    out.attach = r.ok ? r.fields : r.why;
    out.tagged = await win.webContents.executeJavaScript("[...document.querySelectorAll('[data-cg-af]')].map(e => e.id).join(',')");
    out.pageSeesData = await win.webContents.executeJavaScript("typeof window.__cgAfInline + ' ' + String(document.querySelector('[data-cg-af-chip]') && document.querySelector('[data-cg-af-chip]').shadowRoot)");
    await win.webContents.executeJavaScript("document.getElementById('fn').focus(); 1"); await sleep(300);
    const st = await win.webContents.executeJavaScriptInIsolatedWorld(I.WORLD, [{ code: 'window.__cgAfInline.state()' }]);
    out.shown = st.shown; out.rows = st.rows;
    const pos = await win.webContents.executeJavaScript("(h => ({ x: parseFloat(h.style.left) + 30, y: parseFloat(h.style.top) + 18 }))(document.querySelector('[data-cg-af-chip]'))");
    win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(pos.x), y: Math.round(pos.y), button: 'left', clickCount: 1 });
    await sleep(300);
    out.values = await win.webContents.executeJavaScript("['fn','ln','em','pw'].map(i => document.getElementById(i).value).join('|')");
    out.inputEvent = await win.webContents.executeJavaScript('window.seen.join(",")');
    out.hidden = !(await win.webContents.executeJavaScriptInIsolatedWorld(I.WORLD, [{ code: 'window.__cgAfInline.state()' }])).shown;
    // "Fill all": focus the next empty field, click the chip's second row
    await win.webContents.executeJavaScript("document.getElementById('ln').focus(); 1"); await sleep(300);
    const p2 = await win.webContents.executeJavaScript("(h => { const r = h.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height - 32 }; })(document.querySelector('[data-cg-af-chip]'))");
    win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(p2.x), y: Math.round(p2.y), button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(p2.x), y: Math.round(p2.y), button: 'left', clickCount: 1 });
    await sleep(300);
    out.allValues = await win.webContents.executeJavaScript("['fn','ln','em','pw'].map(i => document.getElementById(i).value).join('|')");
    out.plan = I.plan([{ id: 'a', type: 'password', name: 'password', autocomplete: 'current-password' }], store.activeProfile().profile).length;
  } catch (e) { out.error = e.stack; }
  console.log('AFIRESULT ' + JSON.stringify(out)); app.quit();
});
