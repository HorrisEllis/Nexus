#!/usr/bin/env python3
"""
tests/probe/selector-check-chromium.py — v0.39.251
Proves clear-glass/renderer/selector-check.js in real headless Chromium on a
saved ChatGPT-like page (tests/fixtures/chatgpt-like.html), against the real
producer and the real consumer — not copies of them:

  producer: the pick's xpath comes from guardian-picker.js's own getXPath(),
            extracted from that file and run in the page.
  consumer: the assigned `resp` selector is read back through
            userscript-chatgpt.js's own _lastMatch(), extracted from that file.

Cases: reply picked deep inside the latest answer; an OLDER answer (refused);
the input box (picked on its inner <p>); the send button (picked on its svg
path); a wrong role (refused); a stale pick (refused); and a new reply appended
after assignment — the same selector must read the NEW reply, which is the
whole point of refusing per-message ids.

Prints one JSON line per case and a summary; exit 0 only if every case passes.
Usage:  python3 tests/probe/selector-check-chromium.py
Needs:  pip install playwright && playwright install chromium
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({"skip": "python playwright not installed — nothing was proven"}))
    sys.exit(3)

CHECK_SRC = (ROOT / "clear-glass/renderer/selector-check.js").read_text()
PICKER = (ROOT / "clear-glass/renderer/guardian-picker.js").read_text()
USERSCRIPT = (ROOT / "guardian/userscript-chatgpt.js").read_text()

def extract(src, name):
    # closing brace at the function's own indentation — inner blocks close deeper
    m = re.search(r"^([ \t]*)(function " + re.escape(name) + r"\(.*?\n)\1\}\n", src, re.S | re.M)
    if not m:
        raise SystemExit(f"could not extract {name}() — the file changed shape; update this probe")
    return m.group(2) + m.group(1) + "}"

GET_XPATH = extract(PICKER, "getXPath")
LAST_MATCH = extract(USERSCRIPT, "_lastMatch")

results = []
def case(name, ok, **detail):
    results.append(ok)
    print(json.dumps({"case": name, "pass": bool(ok), **detail}))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto((ROOT / "tests/fixtures/chatgpt-like.html").as_uri())
    pg.evaluate(CHECK_SRC)                                   # as the renderer injects it
    pg.evaluate(f"(() => {{ window.__getXPath = {GET_XPATH.strip()}; }})()")  # guardian-picker's own
    pg.evaluate(f"(() => {{ window.__lastMatch = {LAST_MATCH.strip()}; }})()")  # the userscript's own

    def pick(css, key):
        return pg.evaluate("([css, key]) => window.__cgSelectorCheck.check({ xpath: window.__getXPath(document.querySelector(css)), key })", [css, key])

    # xpaths without ids too: strip the fixture's convenience ids first so
    # getXPath produces the positional form it produces on real pages.
    pg.evaluate("for (const id of ['old-p','new-p','new-strong','input-p','send-path']) { const e = document.getElementById(id); e.dataset.probe = id; e.removeAttribute('id'); }")
    q = lambda probe: f'[data-probe="{probe}"]'

    r = pick(q("new-strong"), "resp")
    read = pg.evaluate("s => (window.__lastMatch(s) || {}).innerText || ''", r.get("selector")) if r.get("ok") else ""
    case("resp: picked <strong> inside the latest answer", r.get("ok")
         and "message-id" not in (r.get("selector") or "") and not (r.get("selector") or "").startswith("#")
         and "Latest answer, paragraph one." in read and "paragraph two" in read and "Older" not in read,
         selector=r.get("selector"), matched=r.get("matched"), depth=r.get("depth"), consumerRead=read[:80], why=r.get("why"))
    resp_sel = r.get("selector")

    r = pick(q("old-p"), "resp")
    case("resp: an older answer is refused", not r["ok"] and "latest answer" in (r.get("why") or ""), why=(r.get("why") or ""), tried=len(r.get("tried") or []))

    r = pick(q("input-p"), "input")
    case("input: picked the <p> inside the composer", r.get("ok") and (r.get("selector") or "") == "#prompt-textarea" and (r.get("matched") or "") == 1,
         selector=r.get("selector"), why=r.get("why"))

    r = pick(q("send-path"), "send")
    case("send: picked the svg path inside the button", r.get("ok") and "send-button" in (r.get("selector") or "") and (r.get("matched") or "") == 1,
         selector=r.get("selector"), why=r.get("why"))

    r = pick(q("send-path"), "input")
    case("wrong role: a button is not an input", not r["ok"] and "editable" in (r.get("why") or ""), why=(r.get("why") or ""))

    r = pg.evaluate("() => window.__cgSelectorCheck.check({ xpath: '/html/body/nope[9]', key: 'resp' })")
    case("stale pick is refused", not r["ok"] and "pick it again" in (r.get("why") or ""), why=(r.get("why") or ""))

    gen = pg.evaluate("() => ['css-9x8k2m','css-4kd92z','0c7d1f2a-4444-4a4b-9c9d-dddddddddddd',':r1:','conversation-turn-12345','conversation-turn-6'].map(v => window.__cgSelectorCheck.looksGenerated(v))")
    case("generated values are never selector material", all(gen), flags=gen)

    # A new reply arrives after assignment — the assigned selector must read it.
    pg.evaluate("""() => {
      const t = document.createElement('article'); t.setAttribute('data-testid','conversation-turn-6'); t.className='_a1b2c3';
      t.innerHTML = '<div data-message-author-role="assistant" data-message-id="0c7d1f2a-6666-4a4b-9c9d-ffffffffffff"><div class="markdown prose w-full"><p>Brand new reply.</p></div></div>';
      document.getElementById('thread').appendChild(t);
    }""")
    read2 = pg.evaluate("s => (window.__lastMatch(s) || {}).innerText || ''", resp_sel) if resp_sel else ""
    case("after a new reply, the same selector reads the NEW reply", read2.strip() == "Brand new reply.", consumerRead=read2)

    # A chat with one reply only: nothing can match twice, so the pick is
    # accepted but flagged single — the UI must say it was checked against one reply.
    pg.evaluate("""() => { document.querySelectorAll('article').forEach((a, i, all) => { if (i < all.length - 1) a.remove(); }); }""")
    pg.evaluate("() => { const p = document.querySelector('[data-testid=\"conversation-turn-6\"] p'); p.dataset.probe = 'only-p'; }")
    r = pick(q("only-p"), "resp")
    alts = [a["selector"] for a in (r.get("alternatives") or [])]
    case("one reply on the page: flagged single, every passing candidate offered to choose from",
         r.get("ok") and r.get("single") is True and (r.get("matched") or "") == 1
         and '[data-message-author-role="assistant"]' in alts and "div.markdown.prose.w-full" in alts
         and not any("conversation-turn" in a for a in alts),
         alternatives=alts)

    case("no page errors", not errors, errors=errors)
    print(json.dumps({"browser": b.version, "passed": sum(results), "failed": len(results) - sum(results)}))
    b.close()

sys.exit(0 if all(results) else 1)
