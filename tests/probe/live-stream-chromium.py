#!/usr/bin/env python3
"""
tests/probe/live-stream-chromium.py — v0.39.256
James: "supposed to stream it live as it happens."
Proves the userscripts' §STREAM block in real headless Chromium on the ChatGPT-like
fixture at a real chat URL, with the real code extracted from guardian/userscript-chatgpt.js
(_nexusGetFullChat, _isGenerating and the whole §STREAM block). Only `send` is stubbed —
it records the GUARDIAN_CHUNKs that would go to guardian — and `currentJobId` is the
page's own variable, as in the userscript.

Cases: an earlier answer on the page is never streamed as this job's; a turn James types
himself (without the job's prompt) is not this job's; the reply streams at the 500 ms
cadence (not per mutation) and the deltas add up to the reply exactly; a rewrite that is
not a continuation is sent whole with reset; the watch streaming for this job silences
the streamer; a finished job stops the timer.
Usage:  python3 tests/probe/live-stream-chromium.py   (exit 0 = all pass)
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

m = re.search(r"// §STREAM 0\.39\.256.*?\nfunction _txStreamTick\(\) \{.*?\n\}\n", US, re.S)
if not m:
    raise SystemExit("could not extract the §STREAM block")
STREAM = m.group(0)
assert "const _TX_STREAM_MS = 500;" in STREAM

SCRIPT = f"""(() => {{
  const PROVIDER = 'chatgpt';
  window.__sent = [];
  function send(o) {{ window.__sent.push(JSON.parse(JSON.stringify(o))); }}
  let currentJobId = null;
  {extract(US, 'chatId')}
  {extract(US, '_nexusGetFullChat')}
  {extract(US, '_isGenerating')}
  {STREAM}
  window.__startJob = (msg) => {{ currentJobId = msg.jobId; _txJobStart(msg); }};
  window.__endJob = () => {{ currentJobId = null; }};
  window.__watchStreams = (id) => {{ _txWatchStreamed = id; }};
  window.__timerLive = () => _txStreamTimer !== null;
}})()"""

PROMPT = "You are the project agent for ERAVOS v3-17 catalog. You exist for this one project.\\n\\n───\\n\\nexplain the kernel"
ADD = """(args) => { const d = document.createElement('div'); d.setAttribute('data-message-author-role', args[0]); d.textContent = args[1];
  if (args[2]) d.id = args[2]; document.querySelector('main').appendChild(d); return true; }"""

results = []
def case(name, ok, **detail):
    results.append(bool(ok))
    print(json.dumps({"case": name, "pass": bool(ok), **detail}))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route("https://chatgpt.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=FIXTURE))
    pg.goto("https://chatgpt.com/c/WEB:b4b1d92a-9efa")
    pg.evaluate(SCRIPT)
    sent = lambda: pg.evaluate("window.__sent")

    pg.evaluate("(p) => window.__startJob({ jobId: 'job-1', prompt: p })", PROMPT.replace("\\n", "\n"))
    pg.wait_for_timeout(1300)
    case("an earlier answer on the page is never streamed as this job's", len(sent()) == 0, n=len(sent()))

    pg.evaluate(ADD, ["user", "a question James typed himself"])
    pg.evaluate(ADD, ["assistant", "an answer to James, not to the job"])
    pg.wait_for_timeout(1100)
    case("a turn without the job's prompt is not this job's", len(sent()) == 0, n=len(sent()))

    typed = "You have real tools available. [[TOOL: …]]\n\n" + PROMPT.replace("\\n", "\n") + "\n\n(agent hint)"
    pg.evaluate(ADD, ["user", typed])
    pg.evaluate(ADD, ["assistant", "", "reply"])
    pg.evaluate("""() => { const d = document.getElementById('reply'); let n = 0;
      window.__grow = setInterval(() => { d.textContent += 'word' + (++n) + ' '; if (n >= 16) clearInterval(window.__grow); }, 100); }""")
    pg.wait_for_timeout(2600)
    s = sent()
    final = pg.evaluate("document.getElementById('reply').innerText.trim()")
    joined = "".join(x["text"] for x in s)
    ok = 2 <= len(s) <= 6 and joined == final and all(x["type"] == "GUARDIAN_CHUNK" and x["jobId"] == "job-1" and x["source"] == "transcript" and x["reset"] is False for x in s) and s[-1]["full"] == final
    case("streams at the 500 ms cadence (16 changes → a handful of chunks) and the deltas add up to the reply", ok, chunks=len(s), joined_len=len(joined), final_len=len(final))

    pg.evaluate("() => { document.getElementById('reply').textContent = 'Rewritten: the kernel owns the bus.'; }")
    pg.wait_for_timeout(800)
    last = sent()[-1]
    case("a rewrite that is not a continuation is sent whole, with reset", last["reset"] is True and last["text"] == "Rewritten: the kernel owns the bus." and last["full"] == last["text"], last=last)

    n0 = len(sent())
    pg.evaluate("() => window.__watchStreams('job-1')")
    pg.evaluate("() => { document.getElementById('reply').textContent += ' More text.'; }")
    pg.wait_for_timeout(900)
    case("when the reply watch streams this job itself, the streamer yields (one stream per job)", len(sent()) == n0, n=len(sent()) - n0)

    pg.evaluate("() => window.__endJob()")
    pg.wait_for_timeout(700)
    case("a finished job stops the timer", pg.evaluate("window.__timerLive()") is False)

    pg.evaluate("(p) => window.__startJob({ jobId: 'job-2', prompt: p })", "second prompt about the organism factory")
    pg.evaluate(ADD, ["user", "second prompt about the organism factory"])
    pg.evaluate(ADD, ["assistant", "The factory spawns organisms."])
    pg.wait_for_timeout(900)
    s2 = [x for x in sent() if x["jobId"] == "job-2"]
    case("the next job streams its own reply, not the previous one's", len(s2) == 1 and s2[0]["text"] == "The factory spawns organisms.", got=s2)

    case("no page errors", not errors, errors=errors)
    b.close()

passed = sum(results)
print(json.dumps({"summary": f"{passed}/{len(results)}"}))
sys.exit(0 if passed == len(results) else 1)
