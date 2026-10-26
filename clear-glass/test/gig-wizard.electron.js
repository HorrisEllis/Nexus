'use strict';
// FW1 (0.60.268) — run INSIDE Electron by test/gig-wizard.test.js: a local Fiverr-shaped wizard. Each page has its fields and a
// "Save & Continue" that loads the next tab after a delay; Gallery is where it must stop; a page with a missing title stays put.
const { app, BrowserWindow } = require('electron');
const http = require('http'), path = require('path');
const row = (h, field) => `<div class="row"><div class="l"><h3>${h}</h3></div><div class="r">${field}</div></div>`;
const PAGES = {
  general: row('Gig title', '<textarea></textarea>') + row('Search tags', '<h4>Positive keywords</h4><input type="text">'),
  pricing: row('Name your package', '<input type="text" name="basic_name">') + row('Describe the details of your offering', '<textarea name="basic_desc"></textarea>'),
  description: row('Description', '<textarea name="gig_description"></textarea>'),
  gallery: '<h2>Gallery</h2><button>Publish Gig</button>',
};
const NEXT = { general: 'pricing', pricing: 'description', description: 'gallery' };
const html = (tab, strict) => `<!doctype html><title>${tab}</title><div id="err"></div>${PAGES[tab]}
  <button id="go">Save &amp; Continue</button>
  <script>document.getElementById('go').addEventListener('click', () => {
    ${strict ? "if (document.querySelector('textarea').value !== 'never') { const e = document.getElementById('err'); e.setAttribute('role','alert'); e.textContent = 'Please enter a gig title'; return; }" : ''}
    setTimeout(() => { location.href = '/manage_gigs/new?wizard=0&tab=${NEXT[tab] || tab}'; }, 600); });</script>`;
app.whenReady().then(async () => {
  const out = {};
  try {
    const srv = http.createServer((q, res) => { const u = new URL(q.url, 'http://x'); res.setHeader('content-type', 'text/html'); res.end(html(u.searchParams.get('tab') || 'general', u.searchParams.get('strict') === '1')); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}/manage_gigs/new?wizard=0`;
    const Dom = require(path.join(__dirname, '..', 'src/dom/archaeology.js'));
    const G = require(path.join(__dirname, '..', 'src/autofill/gig.js'));
    const win = new BrowserWindow({ show: true, width: 900, height: 700 });
    const dom = Object.create(Dom.prototype); dom._getWebContents = () => win.webContents; dom.sse = { emit() {} };
    const gig = { title: 'I will build an AI agent workflow', tags: ['ai agent', 'automation'], description: 'D'.repeat(130),
      packages: { basic: { name: 'One Agent Task', description: 'One automated task', deliveryDays: 3, revisions: 1, price: 60 } }, faq: [], requirements: [] };
    await win.loadURL(`${base}&tab=general`);
    const r = await G.fillGigWizard(dom, gig, { agentId: 't', waitMs: 8000, settleMs: 400 });
    out.pages = r.pages.map(p => `${p.tab}:${p.filled.join('+')}${p.next ? '>' + p.next : ''}`);
    out.stop = r.stop; out.url = win.webContents.getURL().replace(/^.*tab=/, '');
    out.published = await win.webContents.executeJavaScript('document.title');
    // a page that will not move on (its form refuses): the stop says where and Fiverr's own message
    await win.loadURL(`${base}&tab=general&strict=1`);
    const r2 = await G.fillGigWizard(dom, { ...gig, title: 'I will ' + 'x'.repeat(90) }, { agentId: 't', waitMs: 3000, settleMs: 200 });
    out.stay = r2.stop;
    srv.close();
  } catch (e) { out.error = e.stack; }
  console.log('FWRESULT ' + JSON.stringify(out)); app.quit();
});
