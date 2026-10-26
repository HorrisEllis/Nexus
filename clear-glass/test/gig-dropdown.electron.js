'use strict';
// FD1 (0.60.266) — run INSIDE Electron by test/gig-dropdown.test.js. Fiverr-style custom dropdowns (open on mousedown; the
// subcategory's list fills only after a category is chosen), and a page with no matching option.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const PAGE = `<style>.opt{padding:4px}.menu{border:1px solid #ccc}</style>
<div class="row"><h3>Category</h3>
 <div class="dd" id="cat"><div class="ctl">SELECT A CATEGORY</div></div>
 <div class="dd" id="sub"><div class="ctl">SELECT A SUBCATEGORY</div></div></div>
<script>
const LISTS = { cat: ['Graphics & Design', 'Programming & Tech', 'Digital Marketing'], sub: { 'Programming & Tech': ['Website Development', 'AI Development', 'Desktop Applications', 'Web Automation'] } };
let chosenCat = null; window.picked = {};
function wire(id, list) {
  const dd = document.getElementById(id), ctl = dd.querySelector('.ctl');
  ctl.addEventListener('mousedown', () => {
    const items = typeof list === 'function' ? list() : list; if (!items || !items.length) return;
    let m = dd.querySelector('.menu'); if (m) { m.remove(); return; }
    m = document.createElement('div'); m.className = 'menu';
    for (const t of items) { const o = document.createElement('div'); o.className = 'opt'; o.setAttribute('role', 'option'); o.textContent = t;
      o.addEventListener('mousedown', () => { ctl.textContent = t; window.picked[id] = t; if (id === 'cat') chosenCat = t; m.remove(); }); m.appendChild(o); }
    dd.appendChild(m);
  });
}
wire('cat', LISTS.cat); wire('sub', () => LISTS.sub[chosenCat] || []);
</script>`;
app.whenReady().then(async () => {
  const out = {};
  try {
    const G = require(path.join(__dirname, '..', 'src/autofill/gig.js'));
    const win = new BrowserWindow({ show: true, width: 900, height: 700 });
    const dom = { _getWebContents: () => win.webContents };
    await win.loadURL('data:text/html,' + encodeURIComponent(PAGE));
    out.ok = await G.fillGigSelects(dom, { category: 'Programming & Tech', subcategory: 'AI Development' });
    out.picked = await win.webContents.executeJavaScript('JSON.stringify(window.picked)');
    await win.loadURL('data:text/html,' + encodeURIComponent(PAGE));
    out.miss = await G.fillGigSelects(dom, { category: 'Programming & Tech', subcategory: 'Quantum Basket Weaving' });
    // §FD2 — Service type, and Gig metadata: a tab column and radio buttons with their words beside them
    await win.loadURL('data:text/html,' + encodeURIComponent(PAGE + `<div class="dd" id="svc"><div class="ctl">SELECT A SERVICE TYPE</div></div>
      <div class="meta"><ul><li class="tab">PROGRAMMING LANGUAGE *</li><li class="tab">EXPERTISE</li></ul>
      <div class="pane" id="p0"><label><input type="radio" name="lang"> Python</label><label><input type="radio" name="lang"> JavaScript</label></div>
      <div class="pane" id="p1" style="display:none"><label><input type="checkbox"> Automation</label><label><input type="checkbox"> Scraping</label></div></div>
      <script>wire('svc', ['AI Agents', 'Web Scraping']);
      document.querySelectorAll('.tab').forEach((t, i) => t.addEventListener('click', () => { document.querySelectorAll('.pane').forEach((p, j) => p.style.display = j === i ? '' : 'none'); }));</script>`));
    out.meta = await G.fillGigSelects(dom, { category: 'Programming & Tech', subcategory: 'AI Development', serviceType: 'AI Agents', metadata: { 'Programming language': ['JavaScript'], 'Expertise': ['Automation', 'Scraping'], 'Backend framework': ['Express'] } });
    out.metaPicked = await win.webContents.executeJavaScript('JSON.stringify(window.picked) + "|" + [...document.querySelectorAll("input")].filter(i => i.checked).map(i => i.parentElement.innerText.trim()).join(",")');
    await win.loadURL('data:text/html,' + encodeURIComponent('<select name="category"><option>Select a category</option><option>Programming & Tech</option><option>Writing</option></select><script>window.ch=0;document.querySelector("select").addEventListener("change",()=>window.ch++)</script>'));
    out.native = await G.fillGigSelects(dom, { category: 'Programming and tech', subcategory: '' });
    out.nativeValue = await win.webContents.executeJavaScript('document.querySelector("select").value + "|" + window.ch');
  } catch (e) { out.error = e.stack; }
  console.log('FDRESULT ' + JSON.stringify(out)); app.quit();
});
