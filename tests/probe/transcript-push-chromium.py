#!/usr/bin/env python3
"""
tests/probe/transcript-push-chromium.py — v0.39.254
Proves the userscripts' §TRANSCRIPT block in real headless Chromium, on the
ChatGPT-like fixture served at a real chat URL (https://chatgpt.com/c/WEB:…),
using the real code — extracted from guardian/userscript-chatgpt.js, not copied:
chatId(), _nexusGetFullChat() and the whole §TRANSCRIPT block. Only ncpPost is
stubbed (it records what would be sent to guardian). The settle/max-wait times
are shortened in the extracted text; nothing else is changed.

Cases: the chat id keeps the WEB: prefix; one push after the chat settles; none
while a reply streams, then one with the final text; a ticking panel outside
<main> does not stop the chat settling; an unchanged transcript is not re-sent;
guardian down means re-sent on the next settle, and not after it answers; a page
that never goes quiet is still sent by the max wait; a new chat with no id
('home') is never sent.

Usage:  python3 tests/probe/transcript-push-chromium.py   (exit 0 = all pass)
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print(json.dumps({"skip": "python playwright not installed — nothing was proven"}))
    sys.exit(3)

US = (ROOT / "guardian/userscript-chatgpt.js").read_text()
FIXTURE = (ROOT / "tests/fixtures/chatgpt-like.html").read_text()

def extract(src, name):
    m = re.search(r"^([ \t]*)(function " + re.escape(name) + r"\(.*?\n)\1\}\n", src, re.S | re.M)
    if not m:
        raise SystemExit(f"could not extract {name}() — the file changed shape; update this probe")
    return m.group(2) + m.group(1) + "}"

m = re.search(r"// §TRANSCRIPT 0\.39\.254.*?else setTimeout\(_nexusTranscriptStart, 1500\);\n\}\n", US, re.S)
if not m:
    raise SystemExit("could not extract the §TRANSCRIPT block")
BLOCK = m.group(0)
BLOCK = BLOCK.replace("_TX_SETTLE_MS = 5000", "_TX_SETTLE_MS = 400").replace("_TX_MAX_WAIT_MS = 60000", "_TX_MAX_WAIT_MS = 2500")
assert "_TX_SETTLE_MS = 400" in BLOCK and "_TX_MAX_WAIT_MS = 2500" in BLOCK

SCRIPT = f"""(() => {{
  const PROVIDER = 'chatgpt', MY_TAB = 'tab-1', NEXUS_AGENT_ID = 'repo-probe', NCP_RESULT = 'http://127.0.0.1:7820/result';
  window.__posts = []; window.__guardianUp = true;
  async function ncpPost(url, data) {{ window.__posts.push(JSON.parse(JSON.stringify(data))); return window.__guardianUp ? {{ ok: true }} : null; }}
  {extract(US, 'chatId')}
  {extract(US, '_nexusGetFullChat')}
  {extract(US, '_isGenerating')}
  {BLOCK}
  window.__chatId = chatId;
}})()"""

results = []
def case(name, ok, **detail):
    results.append(bool(ok))
    print(json.dumps({"case": name, "pass": bool(ok), **detail}))

URL = "https://chatgpt.com/c/WEB:b4b1d92a-9efa-4f95-b2b9-84996b88ce74"

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route("https://chatgpt.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=FIXTURE))
    pg.goto(URL)
    pg.evaluate(SCRIPT)
    posts = lambda: pg.evaluate("window.__posts")

    case("chat id keeps the WEB: prefix", pg.evaluate("window.__chatId()") == "WEB:b4b1d92a-9efa-4f95-b2b9-84996b88ce74",
         chatId=pg.evaluate("window.__chatId()"))

    pg.wait_for_timeout(1500 + 900)          # the block starts 1500 ms after load, then settles
    ps = posts()
    ok = len(ps) == 1 and ps[0]["type"] == "GUARDIAN_TRANSCRIPT" and ps[0]["agentId"] == "repo-probe" \
        and ps[0]["chat"]["chatId"].startswith("WEB:") and len(ps[0]["chat"]["messages"]) == 4 \
        and ps[0]["chat"]["settled"] is True and ps[0]["chat"]["generating"] is False
    case("one push after the chat settles", ok, n=len(ps), messages=len(ps[0]["chat"]["messages"]) if ps else None)

    # a reply streams: appended, then its text grows every 100 ms for 1.5 s
    pg.evaluate("""() => {
      const t = document.querySelector('main [data-message-author-role]').parentElement.parentElement;
      const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'assistant');
      document.querySelector('main').appendChild(d);
      let n = 0; window.__stream = setInterval(() => { d.textContent = 'streamed reply ' + 'x'.repeat(++n); if (n >= 15) clearInterval(window.__stream); }, 100);
    }""")
    pg.wait_for_timeout(1200)
    during = len(posts())
    pg.wait_for_timeout(1200)
    ps = posts()
    last = ps[-1]["chat"]["messages"][-1]["text"] if ps else ""
    case("no push while a reply streams, one with the final text after", during == 1 and len(ps) == 2 and last.endswith("x" * 15),
         during=during, after=len(ps), last_len=len(last))

    # a panel outside <main> ticking every 100 ms, while main changes once
    pg.evaluate("""() => {
      const pnl = document.createElement('div'); pnl.id = 'panel'; document.body.appendChild(pnl);
      let k = 0; window.__tick = setInterval(() => { pnl.textContent = 'tick ' + (++k); }, 100);
      const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'user'); d.textContent = 'third question';
      document.querySelector('main').appendChild(d);
    }""")
    pg.wait_for_timeout(1200)
    ps = posts()
    case("a ticking panel outside <main> does not stop the chat settling", len(ps) == 3 and ps[-1]["chat"]["messages"][-1]["text"] == "third question", n=len(ps))
    pg.evaluate("clearInterval(window.__tick)")

    # a mutation that changes no text
    pg.evaluate("() => { const s = document.createElement('span'); document.querySelector('main').appendChild(s); s.remove(); }")
    pg.wait_for_timeout(1000)
    case("an unchanged transcript is not re-sent", len(posts()) == 3, n=len(posts()))

    # guardian down: sent, not acknowledged, so the next settle sends it again
    pg.evaluate("""() => { window.__guardianUp = false;
      const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'assistant'); d.textContent = 'reply while guardian is down';
      document.querySelector('main').appendChild(d); }""")
    pg.wait_for_timeout(1000)
    n_down = len(posts())
    pg.evaluate("() => { window.__guardianUp = true; const s = document.createElement('span'); document.querySelector('main').appendChild(s); }")
    pg.wait_for_timeout(1000)
    n_up = len(posts())
    pg.evaluate("() => { const s = document.createElement('span'); document.querySelector('main').appendChild(s); }")
    pg.wait_for_timeout(1000)
    n_after = len(posts())
    case("guardian down: re-sent on the next settle, and not after it answers", n_down == 4 and n_up == 5 and n_after == 5,
         down=n_down, up=n_up, after=n_after)

    # a page that never goes quiet
    pg.evaluate("""() => {
      const d = document.createElement('div'); d.setAttribute('data-message-author-role', 'assistant'); document.querySelector('main').appendChild(d);
      let n = 0; window.__busy = setInterval(() => { d.textContent = 'never quiet ' + (++n); }, 100);
    }""")
    pg.wait_for_timeout(3200)
    n_busy = len(posts())
    pg.evaluate("clearInterval(window.__busy)")
    forced = [x["chat"]["settled"] for x in posts()[5:]]
    case("a page that never goes quiet is still sent by the max wait, marked settled: false (0.39.255)", n_busy >= 6 and forced and forced[0] is False, n=n_busy, settled=forced)

    # 0.39.255 — the page says it is generating: the push says so, and a flip to not-generating is sent again
    pg.wait_for_timeout(900)
    before = len(posts())
    pg.evaluate("() => { const s = document.createElement('span'); s.setAttribute('data-is-streaming', 'true'); s.id = 'gen'; document.querySelector('main').appendChild(s); }")
    pg.wait_for_timeout(1000)
    gen_post = posts()[-1]["chat"] if len(posts()) > before else None
    pg.evaluate("() => document.getElementById('gen').remove()")
    pg.wait_for_timeout(1000)
    after_post = posts()[-1]["chat"] if posts() else None
    case("generating is reported, and the same text is re-sent once it stops (0.39.255)",
         gen_post is not None and gen_post["generating"] is True and after_post["generating"] is False and after_post["settled"] is True and len(posts()) == before + 2,
         before=before, n=len(posts()))

    # a new chat with no id yet
    pg2 = b.new_page()
    pg2.route("https://chatgpt.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=FIXTURE))
    pg2.goto("https://chatgpt.com/")
    pg2.evaluate(SCRIPT)
    pg2.wait_for_timeout(2600)
    case("a new chat with no id ('home') is never sent", pg2.evaluate("window.__posts.length") == 0, n=pg2.evaluate("window.__posts.length"))

    case("no page errors", not errors, errors=errors)
    b.close()

passed = sum(results)
print(json.dumps({"summary": f"{passed}/{len(results)}"}))
sys.exit(0 if passed == len(results) else 1)
