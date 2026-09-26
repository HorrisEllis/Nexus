#!/usr/bin/env python3
"""
tests/probe/selector-assign-ui-chromium.py — v0.39.251
Drives Clear Glass's selector-assign area (renderer/selector-assign/) through
its whole flow in real headless Chromium, served over HTTP from the repo:

  host page   = a minimal Clear Glass window: browser.css + the area's own CSS
                and JS, exactly as browser.html loads them.
  the webview = an <iframe> holding tests/fixtures/chatgpt-like.html;
                wv.executeJavaScript(code) evaluates in that frame, as
                Electron's <webview>.executeJavaScript does in the guest.
  ClearGlass.selectors.providerFor / assign = the page calls back into this
                probe (expose_function), which answers providerFor from
                clear-glass/src/providers/registry.js and assign through
                clear-glass/src/providers/selector-assign.js against a Node
                process running guardian's REAL selector map
                (tests/probe/selector-assign-guardian.js).

Flow checked: pick on the latest answer → offer names ChatGPT → "reply" →
the live check result is shown (selector, matches) → Assign → guardian's
answer is shown (recorded, verified, tabs pushed). Then an older answer →
the refusal and the candidates tried are shown, and there is no Assign button.

Usage:  python3 tests/probe/selector-assign-ui-chromium.py
Needs:  pip install playwright && playwright install chromium; node
"""
import json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({"skip": "python playwright not installed — nothing was proven"})); sys.exit(3)

# Everything is served under https://chatgpt.com/ by request routing: the
# fixture at the chat URL (so the check's evidence URL is a real provider page,
# which Clear Glass requires), the repo under /__cg/. Same origin, so the host
# can evaluate in the frame the way Electron evaluates in its webview guest.
BASE = "https://chatgpt.com/__cg"
CHAT = "https://chatgpt.com/c/WEB:probe"
TYPES = {".html": "text/html", ".js": "application/javascript", ".css": "text/css"}
def serve(route):
    url = route.request.url
    if url.startswith(CHAT):
        f = ROOT / "tests/fixtures/chatgpt-like.html"
    elif url.startswith(BASE + "/"):
        f = ROOT / url[len(BASE) + 1:].split("?")[0]
    else:
        return route.abort()
    if f.name == ".probe-host.html":
        return route.fulfill(status=200, content_type="text/html", body=HOST)
    if not f.is_file():
        return route.fulfill(status=404, body="")
    route.fulfill(status=200, content_type=TYPES.get(f.suffix, "application/octet-stream"), body=f.read_bytes())

# guardian's real selector map behind the real Clear Glass assign module (Node).
node = subprocess.Popen(["node", str(ROOT / "tests/probe/selector-assign-guardian.js")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
def node_call(op, arg):
    node.stdin.write(json.dumps({"op": op, "arg": arg}) + "\n"); node.stdin.flush()
    return json.loads(node.stdout.readline())

HOST = f"""<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="{BASE}/clear-glass/renderer/browser.css">
<link rel="stylesheet" href="{BASE}/clear-glass/renderer/selector-assign/selector-assign.css">
</head><body style="position:relative;width:1200px;height:800px">
<iframe id="wv" src="{CHAT}" style="width:800px;height:700px"></iframe>
<script src="{BASE}/clear-glass/renderer/selector-assign/selector-assign.js"></script>
</body></html>"""

results = []
def case(name, ok, **d):
    results.append(bool(ok)); print(json.dumps({"case": name, "pass": bool(ok), **d}))

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1200, "height": 800})
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.expose_function("__probeProviderFor", lambda url: node_call("providerFor", url))
    pg.expose_function("__probeAssign", lambda payload: node_call("assign", payload))
    notes = []; pg.expose_function("__probeNotify", lambda m: notes.append(m))
    pg.route("**/*", serve)
    # Host page sits in the renderer folder so fetch('./selector-check.js') resolves as in Clear Glass.
    try:
        pg.goto(f"{BASE}/clear-glass/renderer/.probe-host.html"); pg.wait_for_load_state("load")
        pg.evaluate("""() => {
          const f = document.getElementById('wv');
          const wv = { executeJavaScript: (code) => Promise.resolve(f.contentWindow.eval(code)), getURL: () => f.contentWindow.location.href };
          const cg = { selectors: { providerFor: (u) => window.__probeProviderFor(u), assign: (x) => window.__probeAssign(x) } };
          window.CGSelectorAssign.mount({ cg, wv, notify: (m) => window.__probeNotify(m) });
          // guardian-picker's own xpath, from the picker file
          window.__xp = (n) => { if (n.id) return '//*[@id="' + n.id + '"]'; const parts = []; while (n && n.nodeType === 1) { let i = 1, s = n.previousSibling; while (s) { if (s.nodeType === 1 && s.tagName === n.tagName) i++; s = s.previousSibling; } parts.unshift(n.tagName.toLowerCase() + (i > 1 ? '[' + i + ']' : '')); n = n.parentNode; } return '/' + parts.join('/'); };
        }""")
        bar = "#cg-selector-assign"
        def pick(elid):
            pg.evaluate("(id) => { const d = document.getElementById('wv').contentDocument; const e = d.getElementById(id); e.removeAttribute('id'); window.CGSelectorAssign.offer({ xpath: window.__xp(e), url: 'https://chatgpt.com/c/WEB:probe' }); }", elid)
            pg.wait_for_selector(f"{bar} .sa-key")

        pick("new-strong")
        case("offer names the provider and the three roles", pg.inner_text(f"{bar} .sa-title").strip() == "◎ ChatGPT" and pg.locator(f"{bar} .sa-key").count() == 3,
             title=pg.inner_text(f"{bar} .sa-title"))
        pg.click(f"{bar} .sa-key >> text=reply"); pg.wait_for_selector(f"{bar} .sa-ok")
        shown = pg.inner_text(bar)
        case("the live check result is shown before anything is recorded", "div.markdown.prose.w-full" in shown and "last of 2 match" in shown and pg.locator(f"{bar} .sa-primary").count() == 1,
             shown=shown.replace("\n", " | ")[:200])
        import os
        if os.environ.get("PROBE_SHOT"): pg.screenshot(path=os.environ["PROBE_SHOT"])   # optional: see the bar
        outlined = pg.evaluate("() => document.getElementById('wv').contentDocument.querySelectorAll('div.markdown.prose.w-full')[1].style.outline")
        case("what it reads is outlined on the page", "solid" in outlined and "2px" in outlined, outline=outlined)
        pg.click(f"{bar} .sa-primary"); pg.wait_for_selector(f"{bar} .sa-ok >> text=guardian")
        done = pg.inner_text(bar)
        case("guardian's own answer is shown: recorded, verified, pushed", "guardian recorded" in done and "verified" in done and "pushed to 2" in done,
             shown=done.replace("\n", " | ")[:200])
        case("the copilot panel gets a line", any("recorded" in n for n in notes), notes=notes)
        m = node_call("map", "chatgpt")
        case("guardian's map now holds it, verified, sourced picker", m["selectors"]["resp"] == "div.markdown.prose.w-full" and m["verified"]["resp"] and m["source"]["resp"] == "picker", map=m)

        pick("old-p")
        pg.click(f"{bar} .sa-key >> text=reply"); pg.wait_for_selector(f"{bar} .sa-bad")
        case("an older answer: refusal and tried candidates shown, no Assign", "latest" in pg.inner_text(f"{bar} .sa-bad") and pg.locator(f"{bar} .sa-tried").count() == 1 and pg.locator(f"{bar} .sa-primary").count() == 0,
             why=pg.inner_text(f"{bar} .sa-bad"))

        pg.evaluate("() => window.CGSelectorAssign.offer({ xpath: '/html/body', url: 'https://example.com/' })")
        pg.wait_for_timeout(300)
        case("a non-provider page gets no offer", "example" not in (pg.inner_text(bar) if pg.locator(bar).count() else ""))
        case("no page errors", not errors, errors=errors)
    finally:
        print(json.dumps({"browser": b.version, "passed": sum(results), "failed": len(results) - sum(results)}))
        b.close(); node.kill()
sys.exit(0 if all(results) else 1)
