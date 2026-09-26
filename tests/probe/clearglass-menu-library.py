#!/usr/bin/env python3
"""
tests/probe/clearglass-menu-library.py — v0.39.240, updated 0.39.241
James: "also needs to be clearglass library... added to the 3 lines menu."
Loads Clear Glass's REAL renderer/browser.html + browser.js in headless Chromium,
with window.ClearGlass stood in by an object built from the real preload's
namespaces (every method records its call) and the real toolbar command registry.
Clicks the ☰ menu (#bookmark-mgr-btn), then "📚 Library", and prints what reached
cg.window.openLibrary. Pass = one call (0.39.241: the Library is its own Clear Glass
window, renderer/library.html, not ui/library/ in an agent window), then "⬇ Downloads"
gives openLibrary('downloads'), the menu closed, no page errors.
Usage: python3 tests/probe/clearglass-menu-library.py   (needs: pip install playwright)
"""
import threading, http.server, subprocess, os
from playwright.sync_api import sync_playwright
ROOT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','clear-glass')
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=ROOT,**k)
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',9922),Q); threading.Thread(target=srv.serve_forever,daemon=True).start()
CMDS = subprocess.check_output(['node','-e',"const c=require(process.argv[1]);console.log(JSON.stringify(c.TOOLBAR_COMMANDS))", os.path.join(ROOT,'src','toolbar','commands.js')]).decode().strip()
def _preload_shape():
    import re
    shape, cur = {}, None
    for line in open(os.path.join(ROOT, 'src', 'preload', 'index.js'), encoding='utf8').read().split('\n'):
        m = re.match(r'^  (\w+):\s*\{\s*$', line)
        if m: cur = m.group(1); shape[cur] = []; continue
        if cur:
            if re.match(r'^  \},?\s*$', line): cur = None; continue
            m = re.match(r'^    (\w+)\s*:', line)
            if m: shape[cur].append(m.group(1))
    return shape
import json as _json
FAKE = ("window.__calls=[];const __shape=" + _json.dumps(_preload_shape()) + ";window.ClearGlass={};"
        "for (const ns of Object.keys(__shape)) { window.ClearGlass[ns]={}; for (const m of __shape[ns]) "
        "window.ClearGlass[ns][m]=(...args)=>{ window.__calls.push({path:'cg.'+ns+'.'+m,args}); return Promise.resolve(/list$/i.test(m)?[]:{}); }; }")
with sync_playwright() as p:
    b=p.chromium.launch(**({'executable_path': os.environ['PLAYWRIGHT_CHROMIUM']} if os.environ.get('PLAYWRIGHT_CHROMIUM') else {})); pg=b.new_page(viewport={'width':1400,'height':850}); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script(FAKE + "\nwindow.ClearGlass.toolbar.commands = () => Promise.resolve(" + CMDS + ");")
    pg.goto('http://127.0.0.1:9922/renderer/browser.html'); pg.wait_for_timeout(1500)
    pg.click('#bookmark-mgr-btn'); pg.wait_for_timeout(500)
    rows=pg.eval_on_selector_all('#bookmark-mgr-panel .menu-item','els=>els.map(e=>e.textContent.trim())')
    print('menu rows:', rows); print('errors so far:', errs[:4])
    if not rows: b.close(); srv.shutdown(); raise SystemExit(0)
    pg.screenshot(path='/tmp/clearglass-menu-library.png')
    pg.click('#bookmark-mgr-panel [data-action="library"]'); pg.wait_for_timeout(400)
    opens=pg.evaluate("window.__calls.filter(c=>c.path==='cg.window.openLibrary').map(c=>c.args)")
    print('cg.window.openLibrary calls (Library row):', opens)
    pg.click('#bookmark-mgr-btn'); pg.wait_for_timeout(400)
    pg.click('#bookmark-mgr-panel [data-action="downloads"]'); pg.wait_for_timeout(400)
    opens=pg.evaluate("window.__calls.filter(c=>c.path==='cg.window.openLibrary').map(c=>c.args)")
    print('cg.window.openLibrary calls (+ Downloads row):', opens)
    assert opens == [[None], ['downloads']] or opens == [[], ['downloads']], opens
    print('menu closed after click:', pg.eval_on_selector('#bookmark-mgr-panel','e=>getComputedStyle(e).display'))
    print('page errors:', errs[:5] or 'none')
    b.close()
srv.shutdown()
