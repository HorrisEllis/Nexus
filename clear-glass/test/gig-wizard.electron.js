'use strict';
// FW1 (0.60.268) — run INSIDE Electron by test/gig-wizard.test.js: a local Fiverr-shaped wizard. Each page has its fields and a
// "Save & Continue" that loads the next tab after a delay; Gallery is where it must stop; a page with a missing title stays put.
const { app, BrowserWindow } = require('electron');
const http = require('http'), path = require('path');
const row = (h, field) => `<div class="row"><div class="l"><h3>${h}</h3></div><div class="r">${field}</div></div>`;
const PAGES = {
  general: row('Gig title', '<textarea></textarea>') + row('Search tags', '<h4>Positive keywords</h4><input type="text">'),
  pricing: row('Name your package', '<input type="text" name="basic_name">') + row('Describe the details of your offering', '<textarea name="basic_desc"></textarea>')
    + '<table><tr><td>Delivery Time</td>' + [0, 1, 2].map(i => '<td><select id="d' + i + '"><option>DELIVERY TIME</option><option>1 Day Delivery</option><option>3 Days Delivery</option><option>5 Days Delivery</option><option>7 Days Delivery</option></select></td>').join('') + '</tr>'
    + '<tr><td>Revisions</td>' + [0, 1, 2].map(i => '<td><div class="rv" id="r' + i + '"><div class="ctl">SELECT</div></div></td>').join('') + '</tr></table>'
    + '<script>document.querySelectorAll(".rv").forEach(dd => { const ctl = dd.querySelector(".ctl"); ctl.addEventListener("mousedown", () => { let m = dd.querySelector(".menu"); if (m) { m.remove(); return; } m = document.createElement("div"); m.className = "menu"; for (const t of ["1", "2", "3", "Unlimited"]) { const o = document.createElement("div"); o.setAttribute("role", "option"); o.textContent = t; o.addEventListener("mousedown", () => { ctl.textContent = t; m.remove(); }); m.appendChild(o); } dd.appendChild(m); }); });</script>',
  description: row('Description', '<textarea name="gig_description"></textarea>')
    + '<h3>Frequently Asked Questions</h3><div id="faqs"></div><div id="faqform" style="display:none"><input type="text" placeholder="Add a Question: i.e. Do you translate to English as well?"><textarea placeholder="Add an Answer: i.e. Yes, I also translate from English to Hebrew."></textarea><button id="faqadd">Add</button></div><button id="faqopen">+ Add FAQ</button>'
    + '<script>const ff = document.getElementById("faqform"); document.getElementById("faqopen").addEventListener("click", () => { ff.style.display = ""; });'
    + 'document.getElementById("faqadd").addEventListener("click", () => { const q = ff.querySelector("input"), a = ff.querySelector("textarea"); const d = document.createElement("div"); d.className = "faq"; d.textContent = q.value + " — " + a.value; document.getElementById("faqs").appendChild(d); q.value = ""; a.value = ""; ff.style.display = "none"; });</script>',
  requirements: '<h3>Get all the information you need from buyers</h3><div id="reqs"></div><div id="rf" style="display:none"><textarea placeholder="Request necessary details such as dimensions, brand guidelines, and more."></textarea><button id="radd">Add</button></div><button id="ropen">Add New Question</button>'
    + '<script>const rf = document.getElementById("rf"); document.getElementById("ropen").addEventListener("click", () => { rf.style.display = ""; }); document.getElementById("radd").addEventListener("click", () => { const t = rf.querySelector("textarea"); const d = document.createElement("div"); d.className = "req"; d.textContent = t.value; document.getElementById("reqs").appendChild(d); t.value = ""; rf.style.display = "none"; });</script>',
  gallery: '<h2>Gallery</h2><button>Publish Gig</button>',
};
const NEXT = { general: 'pricing', pricing: 'description', description: 'requirements', requirements: 'gallery' };
const html = (tab, strict) => `<!doctype html><title>${tab}</title><div id="err"></div>${PAGES[tab]}
  <button id="go">Save &amp; Continue</button>
  <script>document.getElementById('go').addEventListener('click', () => {
    const snap = JSON.parse(sessionStorage.snap || '{}'); snap['${tab}'] = { faqs: [...document.querySelectorAll('.faq')].map(e => e.textContent), reqs: [...document.querySelectorAll('.req')].map(e => e.textContent), delivery: [...document.querySelectorAll('select')].map(e => e.value), revisions: [...document.querySelectorAll('.rv .ctl')].map(e => e.textContent) }; sessionStorage.snap = JSON.stringify(snap);
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
      packages: { basic: { name: 'One Agent Task', description: 'One automated task', deliveryDays: 3, revisions: 1, price: 60 },
        standard: { name: 'Workflow', description: 'Four steps', deliveryDays: 5, revisions: 2, price: 180 }, premium: { name: 'System', description: 'Agents', deliveryDays: 7, revisions: -1, price: 450 } },
      faq: [{ question: 'Which AI providers?', answer: 'Claude, ChatGPT, Gemini.' }, { question: 'How do I know it works?', answer: 'A check we agree first.' }],
      requirements: ['What should the workflow do?', 'Who will use it?'] };
    await win.loadURL(`${base}&tab=general`);
    const r = await G.fillGigWizard(dom, gig, { agentId: 't', waitMs: 8000, settleMs: 400 });
    out.pages = r.pages.map(p => `${p.tab}:${p.filled.join('+')}${p.next ? '>' + p.next : ''}`);
    out.stop = r.stop; out.url = win.webContents.getURL().replace(/^.*tab=/, '');
    out.published = await win.webContents.executeJavaScript('document.title');
    out.snap = await win.webContents.executeJavaScript('sessionStorage.snap');
    out.left = r.leftToCopy;
    // a page that will not move on (its form refuses): the stop says where and Fiverr's own message
    await win.loadURL(`${base}&tab=general&strict=1`);
    const r2 = await G.fillGigWizard(dom, { ...gig, title: 'I will ' + 'x'.repeat(90) }, { agentId: 't', waitMs: 3000, settleMs: 200 });
    out.stay = r2.stop;
    srv.close();
  } catch (e) { out.error = e.stack; }
  console.log('FWRESULT ' + JSON.stringify(out)); app.quit();
});
