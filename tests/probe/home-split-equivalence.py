#!/usr/bin/env python3
"""
tests/probe/home-split-equivalence.py — v0.39.228
Proves the ui/home split (one JS + one CSS per area) changed nothing but the
stored-mode boot bug. Real headless Chromium (Playwright), repo served over
HTTP, every non-local request aborted identically on both sides.

  REFERENCE = ui/home/index.html + home.css at REF_COMMIT (the pre-split
  monolith), with ONE change: its failure/event-logging block moved to the
  top of the inline script. Without that change the monolith throws on
  _uiLog's temporal dead zone whenever localStorage holds a mode, and the
  rest of the page (health polling, SSE) never starts — the bug 0.39.228 fixes.

Compares, with and without a stored mode: page errors, typeof of every
top-level name the monolith declared, and 40 computed style properties of
every element across every channel (tune(0..n)) and overlay state. CSS
animation time is frozen (CDP Animation.setPlaybackRate 0).

Usage:  python3 tests/probe/home-split-equivalence.py [REF_COMMIT]
Needs:  pip install playwright && playwright install chromium
Exit 0 = EQUIVALENT.
"""
import json,re,sys,threading,http.server,os,subprocess,shutil
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); PORT=int(os.environ.get('PROBE_PORT','8765'))
REF_COMMIT=sys.argv[1] if len(sys.argv)>1 else '30a0c24'
git=lambda p: subprocess.run(['git','-C',ROOT,'show',f'{REF_COMMIT}:{p}'],capture_output=True,text=True,check=True).stdout
_src=git('ui/home/index.html').split('\n')
_a=next(i for i,l in enumerate(_src) if l.startswith('// ── Failure / event logging'))
_b=next(i for i in range(_a+1,len(_src)) if _src[i].startswith('// ── Forge Shell tile'))
_top=_src.index("'use strict';")+1
orig='\n'.join(_src[:_top]+_src[_a:_b]+_src[_top:_a]+_src[_b:])
ORIG_CSS=git('ui/home/home.css')
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def log_message(self,*a):pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',PORT),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
body=orig[orig.index('<script>\n\'use strict\';'):]
names=sorted(set(re.findall(r'^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))',body,re.M)))
names=sorted({n for t in names for n in t if n})
STATES=['boot','menu','inspect','rewind','mode','wizard']
SNAP='''()=>{const out={};const props=['display','visibility','opacity','position','z-index','color','background-color','font-size','font-family','width','height','top','left','right','bottom','transform','pointer-events','border-top-color','border-radius','padding-top','margin-top','overflow','flex-direction','grid-template-columns','animation-name','filter','box-shadow','transition-property','transition-duration','animation-duration','cursor','user-select','text-decoration-line','border-left-color','letter-spacing','line-height','font-weight','gap','justify-content','align-items'];
 const path=e=>{const a=[];while(e&&e!==document.body){if(e.id){a.unshift('#'+e.id);break}const i=[...e.parentNode.children].indexOf(e);a.unshift(e.tagName+':'+i);e=e.parentNode}return a.join('>')};const els=document.querySelectorAll('body *');for(const e of els){if(e.closest('svg'))continue;if(e.tagName==='SCRIPT')continue;const cs=getComputedStyle(e);const k=path(e);out[k]=props.map(p=>cs.getPropertyValue(p)).join('|')}return out}'''
def run(url,stored,actions):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900})
        ctx.route('**/*',lambda r: r.continue_() if r.request.url.startswith(f'http://127.0.0.1:{PORT}/') else r.abort())
        if stored: ctx.add_init_script(f"localStorage.setItem('nexus_mode',{json.dumps(stored)})")
        pg=ctx.new_page(); errs=[]
        cdp=ctx.new_cdp_session(pg); cdp.send('Animation.enable'); cdp.send('Animation.setPlaybackRate',{'playbackRate':0})
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console.'+m.type+': '+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto(url,wait_until='load'); pg.wait_for_timeout(600)
        types=pg.evaluate('(ns)=>Object.fromEntries(ns.map(n=>{try{return [n,eval("typeof "+n)]}catch(e){return [n,"THROWS "+e.name]}}))',names)
        snaps={}
        n=pg.evaluate('CH_META.length')
        for i in range(n):
            pg.evaluate(f'tune({i})'); pg.wait_for_timeout(120); snaps[f'ch{i}']=pg.evaluate(SNAP)
        pg.evaluate('tune(0)')
        for a,js,close in actions:
            try: pg.evaluate(js)
            except Exception as e: errs.append(f'action {a}: {e}')
            pg.wait_for_timeout(200); snaps[a]=pg.evaluate(SNAP)
            try: pg.evaluate(close)
            except Exception as e: errs.append(f'close {a}: {e}')
            pg.wait_for_timeout(150)
        b.close(); return errs,types,snaps
ACTIONS=[('menu','toggleMenu()','toggleMenu()'),('inspect','openInspect()','closeInspect()'),('rewind','openRewind()','closeRewind()'),
 ('mode','openModeSelector()','closeModeSelector()'),('wizard','openSpecWizard()','closeSpecWizard()'),('console','toggleConsoleFullscreen()','toggleConsoleFullscreen()'),('rail-add','toggleRailAddMenu()','toggleRailAddMenu()')]
open(ROOT+'/ui/home/__orig.html','w').write(orig.replace('/ui/home/home.css','/ui/home/__orig-home.css')); open(ROOT+'/ui/home/__orig-home.css','w').write(ORIG_CSS)
mode=re.search(r"const MODE_CONFIG = \{\s*\n\s*'?([\w-]+)'?\s*:",orig).group(1)
bad=0
for stored in [None,mode]:
    o=run(f'http://127.0.0.1:{PORT}/ui/home/__orig.html',stored,ACTIONS)
    n=run(f'http://127.0.0.1:{PORT}/ui/home/index.html',stored,ACTIONS)
    tag=f'stored_mode={stored}'
    print(f'== {tag}: names checked {len(names)}; states {len(n[2])}')
    print('  orig errors:',o[0] or 'none'); print('  split errors:',n[0] or 'none')
    if o[0]!=n[0]: bad+=1; print('  !! ERROR SETS DIFFER')
    td={k:(o[1][k],n[1][k]) for k in names if o[1][k]!=n[1][k]}
    if td: bad+=1; print('  !! typeof differs:',td)
    for s in o[2]:
        a,b=o[2][s],n[2].get(s,{})
        if set(a)!=set(b): bad+=1; print(f'  !! {tag} {s}: element set differs', len(a),len(b),'only-orig:',sorted(set(a)-set(b))[:4],'only-split:',sorted(set(b)-set(a))[:4]); continue
        d=[k for k in a if a[k]!=b[k]]
        if d: bad+=1; print(f'  !! {tag} {s}: {len(d)} elements differ, e.g.',d[:3]); [print('     ',k,'\n       O',a[k],'\n       N',b[k]) for k in d[:4]]
os.remove(ROOT+'/ui/home/__orig.html'); os.remove(ROOT+'/ui/home/__orig-home.css')
print('RESULT:', 'EQUIVALENT' if not bad else f'{bad} DIFFERENCES'); sys.exit(1 if bad else 0)
