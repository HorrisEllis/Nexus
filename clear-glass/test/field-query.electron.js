'use strict';
// FQ1 (0.60.262) — run INSIDE Electron by test/field-query.test.js. A page with no dom mesh: queryFields injects it once and answers the fields.
const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  const out = {};
  try {
    const A = require(path.join(__dirname, '..', 'src/dom/archaeology.js'));
    const Cls = A.DomArchaeology || A.Archaeology || A.default || (typeof A === 'function' ? A : Object.values(A).find(v => typeof v === 'function' && v.prototype && v.prototype.queryFields));
    const win = new BrowserWindow({ show: false });
    await win.loadURL('data:text/html,<form><input name="title" placeholder="Gig title"><textarea name="description"></textarea><input name="tags"></form>');
    const dom = Object.create(Cls.prototype);
    dom._getWebContents = () => win.webContents; dom.sse = { emit() {} }; dom.bus = { emit() {}, on() {} };
    out.before = await win.webContents.executeJavaScript('typeof window.__cgDomMesh');
    const r = await dom.queryFields({ agentId: 't', selector: 'input, textarea' });
    out.isArray = Array.isArray(r); out.count = Array.isArray(r) ? r.length : r; out.after = await win.webContents.executeJavaScript('typeof window.__cgDomMesh');
    const G = require(path.join(__dirname, '..', 'src/autofill/gig.js'));
    const d = await G.detectGig(dom, { title: 'I will build a scraper', description: 'x'.repeat(130), tags: ['a'], packages: {}, faq: [], requirements: [] }, { agentId: 't' });
    out.detect = d.error ? `error: ${d.error}` : `${d.totalFields} fields, ${d.matches.length} matched`;
    // §FQ4 — a Fiverr-shaped editor: the names are headings in the row's other column; the boxes have no label of their own
    await win.loadURL('data:text/html,' + encodeURIComponent(`<div class="row"><div class="l"><h3>Gig title</h3><p>As your Gig storefront, your title is the most important place</p></div><div class="r"><textarea></textarea><span>0 / 80 max</span></div></div>
      <div class="row"><div class="l"><h3>Category</h3></div><div class="r"><div class="sel">SELECT A CATEGORY</div></div></div>
      <div class="row"><div class="l"><h3>Search tags</h3><p>Tag your Gig with buzz words</p></div><div class="r"><h4>Positive keywords</h4><p>Enter search terms</p><input type="text"></div></div>`));
    const f2 = await dom.queryFields({ agentId: 't', selector: 'input, textarea' });
    out.contexts = f2.map(f => f.context);
    const g2 = await G.detectGig(dom, { title: 'I will build an AI agent workflow', description: 'x'.repeat(130), tags: ['ai agent', 'automation'], packages: {}, faq: [], requirements: [] }, { agentId: 't' });
    out.fiverr = g2.error ? 'error: ' + g2.error : g2.matches.map(m => m.key + '=' + m.value).join(' | ');
    dom._getWebContents = () => null;
    out.noTab = (await dom.queryFields({ agentId: 'nope' })).error;
  } catch (e) { out.error = e.stack; }
  console.log('FQRESULT ' + JSON.stringify(out)); app.quit();
});
