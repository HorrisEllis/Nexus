'use strict';
/**
 * tutorial/server.js — NEXUS First-Start Wizard (web view)
 * Serves the SAME steps as wizard.js, as a friendly clickable page.
 * Run standalone:  node tutorial/server.js   → http://127.0.0.1:7900
 * Or mount in orchestrator (see mount() export).
 */

const http = require('http');
const { STEPS, probe } = require('./wizard');

const PORT = parseInt(process.env.TUTORIAL_PORT || '7900');

// Steps carry functions; send the browser a safe, serializable description.
function stepMeta() {
  return STEPS.map((s, i) => ({ n: i + 1, id: s.id, title: s.title, explain: s.explain, hasRepair: !!s.repair }));
}

async function runStep(id) {
  const step = STEPS.find(s => s.id === id);
  if (!step) return { error: 'no such step' };
  let result = await step.verify();
  let repair = null;
  if (!result.pass && step.repair) {
    repair = await step.repair();
    if (repair.autoFixed) result = await step.verify();
  }
  return { id, pass: result.pass, detail: result.detail, data: result.data || null, repair };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS — First-Start Wizard</title>
<style>
  :root{--bg:#0d1117;--card:#161b22;--line:#30363d;--ok:#3fb950;--bad:#f85149;--warn:#d29922;--tx:#e6edf3;--dim:#8b949e}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:680px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:var(--dim);margin-bottom:24px}
  .step{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin:14px 0;opacity:.5;transition:.3s}
  .step.active{opacity:1;border-color:#1f6feb} .step.pass{opacity:1;border-color:var(--ok)} .step.fail{opacity:1;border-color:var(--bad)}
  .num{display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:var(--line);font-size:13px;margin-right:8px}
  .pass .num{background:var(--ok)} .fail .num{background:var(--bad)}
  .title{font-weight:600;font-size:17px} .explain{color:var(--dim);white-space:pre-line;margin:12px 0;font-size:14px}
  .result{padding:10px 12px;border-radius:8px;margin-top:10px;font-size:14px;display:none}
  .result.show{display:block} .result.ok{background:rgba(63,185,80,.12);color:var(--ok)} .result.no{background:rgba(248,81,73,.12);color:var(--bad)}
  .repair{background:rgba(210,153,34,.1);color:var(--warn);padding:10px 12px;border-radius:8px;margin-top:8px;font-size:13px;white-space:pre-line;display:none}.repair.show{display:block}
  button{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer;margin-top:12px}
  button:disabled{opacity:.4;cursor:default} .done{text-align:center;color:var(--ok);font-weight:600;padding:20px;display:none}
</style></head><body><div class="wrap">
<h1>NEXUS — First-Start Wizard</h1>
<div class="sub">I'll check each part of your system and fix anything that's broken. Just click through.</div>
<div id="steps"></div>
<div class="done" id="done">✓ All set. Run <code>node orchestrator.js</code> any time to start NEXUS.</div>
</div>
<script>
let steps=[], cur=0;
async function load(){ steps=await (await fetch('/steps')).json(); render(); }
function render(){
  const c=document.getElementById('steps'); c.innerHTML='';
  steps.forEach((s,i)=>{
    const d=document.createElement('div'); d.className='step'+(i===cur?' active':'')+(s._pass===true?' pass':'')+(s._pass===false?' fail':'');
    d.innerHTML='<div><span class="num">'+(s._pass===true?'✓':s.n)+'</span><span class="title">'+s.title+'</span></div>'+
      '<div class="explain">'+s.explain+'</div>'+
      (i===cur?'<button id="go" onclick="run()">Check this part</button>':'')+
      '<div class="result'+(s._detail?' show '+(s._pass?'ok':'no'):'')+'" >'+(s._detail||'')+'</div>'+
      (s._repair?'<div class="repair show">'+s._repair+'</div>':'');
    c.appendChild(d);
  });
  if(cur>=steps.length) document.getElementById('done').style.display='block';
}
async function run(){
  const btn=document.getElementById('go'); btn.disabled=true; btn.textContent='Checking...';
  const s=steps[cur];
  if(s.id==='welcome'||s.id==='done'){ s._pass=true; s._detail=''; cur++; render(); return; }
  const r=await (await fetch('/run/'+s.id)).json();
  s._pass=r.pass; s._detail=(r.pass?'✓ ':'✗ ')+r.detail;
  if(r.repair&&!r.pass) s._repair=r.repair.message;
  render();
  if(r.pass) setTimeout(()=>{cur++;render();},900);
  else { const b=document.getElementById('go'); if(b){b.disabled=false;b.textContent='Try again';} }
}
load();
</script></body></html>`;

function handler(req, res) {
  if (req.url === '/' || req.url === '/tutorial') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(PAGE); }
  if (req.url === '/steps') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(stepMeta())); }
  if (req.url.startsWith('/run/')) {
    const id = req.url.slice(5);
    return runStep(id).then(r => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(r)); });
  }
  res.writeHead(404); res.end('not found');
}

// mountable into orchestrator, or standalone
function mount(server) { /* orchestrator can route /tutorial here */ return handler; }
module.exports = { handler, mount, PAGE, PORT };

if (require.main === module) {
  http.createServer(handler).listen(PORT, '127.0.0.1', () =>
    console.log(`[tutorial] First-start wizard → http://127.0.0.1:${PORT}/`));
}
