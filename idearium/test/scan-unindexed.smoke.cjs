const { JSDOM } = require('jsdom'); const fs = require('fs');
const SCAN = JSON.parse(fs.readFileSync('/tmp/scan-fixture.json','utf8'));
const dom = new JSDOM(fs.readFileSync(require('path').join(__dirname,'../ui/')+'index.html','utf8'),
  { runScripts:'outside-only', url:'http://localhost:4800/' });
const w = dom.window;
w.fetch = async (u) => ({ ok:true, status:200,
  json: async()=> (String(u).includes('/scan') ? SCAN : {}), text: async()=>'{}' });
w.EventSource = function(){ this.close=()=>{}; this.addEventListener=()=>{}; };
w.requestAnimationFrame = ()=>0; w.HTMLCanvasElement.prototype.getContext = ()=>null;
const src = fs.readFileSync(require('path').join(__dirname,'../ui/')+'js/app.js','utf8');
w.eval(src + `
window.__d = async () => {
  CURRENT_API_REPO = { uuid:'r1', name:'probe' }; CONNECTED = true; API_BASE = 'http://localhost:4800';
  setRepoSubtab('intelligence');
  await new Promise(r=>setTimeout(r,200));
  return document.querySelector('#repo-subtab-intelligence').innerHTML;
};`);
w.__d().then(h => {
  console.log('--- rendered text ---');
  console.log(h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
  console.log();
  console.log('says not scanned      :', h.includes('not scanned'));
  console.log('offers the real fix   :', h.includes('run import pipeline now'));
  console.log('no fabricated zeros   :', !h.includes('broken links'));
  process.exit(0);
}).catch(e => { console.log('THREW:', e.message); process.exit(1); });
