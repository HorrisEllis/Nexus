const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const UI = path.join(__dirname, '../ui');
const html = fs.readFileSync(path.join(UI,'index.html'),'utf8');
const SCAN = JSON.parse(fs.readFileSync('/tmp/scan-fixture.json','utf8'));

const dom = new JSDOM(html, { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost:4800/ui/index.html' });
const { window } = dom;
window.__SCAN = SCAN;
window.fetch = async (url) => {
  const u = String(url);
  const body =
    u.includes('/scan') ? SCAN :
    u.includes('/api/spec-engine/specs/') ? { manifest:{ uuid:'spec-1', name:'probe spec', status:'built', version:'1.0.0',
        chunks:[{sectionTitle:'core',status:'complete',byteSize:1200},{sectionTitle:'api',status:'pending',byteSize:0}] } } :
    u.includes('/verification') ? { tiers:[{level:'L0',name:'existence',passed:true}], lazyVerification:{status:'passed',tiers:[]} } :
    u.includes('/graph') ? { nodeCount:9, edgeCount:36, unresolvedCount:24 } :
    u.includes('/file') ? { content:'# probe readme\n\nreal content' } :
    u.includes('/api/repos') ? { repos:[] } : u.includes('/api/ideas') ? { ideas:[] } :
    u.includes('/api/specs') ? { specs:[] } : u.includes('/api/gaps') ? { gaps:[] } :
    u.includes('/api/snapshots') ? { snapshots:[] } : u.includes('/api/brainstorms') ? { brainstorms:[] } : {};
  return { ok:true, status:200, json: async()=>body, text: async()=>JSON.stringify(body) };
};
window.EventSource = function(){ this.close=()=>{}; this.addEventListener=()=>{}; };
window.requestAnimationFrame = () => 0;
window.HTMLCanvasElement.prototype.getContext = () => null;

// app.js's top-level `let` bindings live in the eval's own lexical scope
// and are NOT reachable from a second window.eval() call. The driver is
// therefore concatenated into the SAME eval so it closes over them.
const appSrc = fs.readFileSync(path.join(UI,'js/app.js'),'utf8');
const driver = `
window.__drive = async function(log){
  CURRENT_API_REPO = { uuid:'r1', name:'probe', specUuid:'spec-1', source:'import-project',
                       compartmentId:'cmp-9', files:[{path:'README.md'}] };
  API_REPOS = [CURRENT_API_REPO]; CONNECTED = true;
  const d = document, q = s => d.querySelector(s);
  const subtabs = [...d.querySelectorAll('.repo-subtab-btn')].map(b=>b.dataset.subtab);
  for (const s of subtabs) {
    try {
      setRepoSubtab(s);
      await new Promise(r=>setTimeout(r,120));
      const p = q('#repo-subtab-'+s);
      log('subtab '+s.padEnd(13)+' active='+p.classList.contains('active')+' html='+p.innerHTML.length+'b');
      if (!p.classList.contains('active')) log('ERR '+s+' not active');
      if (p.innerHTML.length < 120) log('ERR '+s+' rendered nothing real ('+p.innerHTML.length+'b)');
    } catch(e){ log('ERR subtab '+s+' threw: '+e.message); }
  }
  await new Promise(r=>setTimeout(r,300));
  return { intel: q('#repo-subtab-intelligence').innerHTML, arch: q('#repo-subtab-architect').innerHTML };
};`;
try { window.eval(appSrc + '\n' + driver); }
catch(e){ console.log('FATAL eval:', e.message); process.exit(1); }

const errors = [];
const d = window.document, q = s => d.querySelector(s);
const chk = (label, cond) => { console.log((cond?'  ok  ':'  FAIL')+'  '+label); if(!cond) errors.push(label); };

(async () => {
  console.log('── structure ──');
  chk('stat-gaps removed', !q('#stat-gaps'));
  chk('stat-snr removed', !q('#stat-snr'));
  chk('stat-ideas / stat-specs kept', !!q('#stat-ideas') && !!q('#stat-specs'));
  try { window.updateStats(); chk('updateStats() does not throw', true); }
  catch(e){ chk('updateStats() does not throw ('+e.message+')', false); }

  const create = q('.tab-group[data-group="create"] .tab-group-btn').dataset.views;
  const build  = q('.tab-group[data-group="build"] .tab-group-btn').dataset.views;
  console.log('  Create =', create, '| Build =', build);
  chk('Build carries the three canvases (Spec Library moved into repos)',
      build === 'eravos,architect-build,spec-wizard');
  chk('Create is capture only', create === 'brainstorm,ideas');
  for (const v of (create+','+build).split(',')) chk('#view-'+v+' exists', !!q('#view-'+v));
  chk('global #view-architect removed', !q('#view-architect'));

  const dangling = [...new Set([...html.matchAll(/setView\('([a-z-]+)'\)/g)].map(m=>m[1]).filter(v=>!q('#view-'+v)))];
  chk('no dangling setView targets'+(dangling.length?' ('+dangling+')':''), !dangling.length);
  chk('rail hidden when repo open', html.includes('.repo-wrap.repo-open .repo-rail{display:none}'));
  chk('repo-wrap single-column', html.includes('.repo-wrap{flex:1;display:grid;grid-template-columns:1fr'));

  const subtabs = [...d.querySelectorAll('.repo-subtab-btn')].map(b=>b.dataset.subtab);
  console.log('  subtabs:', subtabs.join(' · '));
  for (const s of subtabs) chk('panel #repo-subtab-'+s+' exists', !!q('#repo-subtab-'+s));

  console.log('── clicking through every subtab ──');
  const out = await window.__drive(m => { console.log('  '+m); if(m.startsWith('ERR')) errors.push(m); });

  console.log('── intelligence content ──');
  chk('shows broken-hook count from real scan (4)', /dangling hooks — broken \(4\)/.test(out.intel));
  chk('lists the planted broken import', out.intel.includes('does-not-exist.js'));
  chk('states externals are not a defect', out.intel.includes('not as a problem'));
  chk('shows the tension method/threshold', out.intel.includes('mean + 2'));
  chk('shows failed verification tiers', out.intel.includes('L2') && out.intel.includes('syntax error in db.js'));
  chk('offers rescan + reindex actions', out.intel.includes('rescan') && out.intel.includes('reindex'));

  console.log('── architect content ──');
  chk('scoped to this repo\'s spec', out.arch.includes('probe spec'));
  chk('shows real chunk progress', /1\/2 chunks/.test(out.arch));

  console.log('\n=== FAILURES:', errors.length);
  errors.forEach(e=>console.log('  ✗', e));
  process.exit(errors.length ? 1 : 0);
})();
