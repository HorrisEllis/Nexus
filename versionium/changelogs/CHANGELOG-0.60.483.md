# 0.60.483 — the desktop driver for agents (PC9 slice a)

James, 2026-11-11: "I don't know if Anthropic would have a fit with this, but would you be able to the Remote Desktop that you have. Can you
replicate that as an option so you can utilize that in COS UI? Do it." · Asked which kind, "I’m saying for you. Like look at clearglass. Nexus
nerve, cleardriver injecting coordinates into the dom."

## Built
COS drives the whole screen the way ClearDriver drives a page (`cos/remote-desktop/desktop-driver.js`):
- **Verbs:** screen (a PNG of the whole screen and its size), move, click at x,y (left, right, double), type, key (`ctrl+s`, `enter`), scroll.
- **Off until he arms it,** each time, in COS: Automation › Desktop, for 1–60 minutes.
  - View-only allows the screen only.
  - Only a person arms; an agent's arm is a 403.
  - Disarm is the kill switch. An arm past its time expires by itself.
- **Every act is logged** (`desktop/log.jsonl` in COS's data) **and streamed** (`cos.desktop.act`): who, what, where, why, and why not when
  refused. Typed text is logged as its length, never its content.
- **Localhost only:** `GET /api/cos/desktop/state|log`, `POST /api/cos/desktop/<verb>`, declared in COS's contract; `cos desktop <verb>`.
- **Backends:**
  - Windows: PowerShell with user32 and System.Drawing, nothing to install, started hidden.
  - Linux: xdotool and ImageMagick's import, when present.
  - Anything else: refused, naming what is missing.
- **Reuse:** click and key go through the remote desktop's injector (its rate limit and view-only lock). A move goes straight to the
  backend, because the injector applies moves later and the driver would not know it happened.
- **The Desktop tab** shows the state with a live countdown, Arm and Disarm, and every act as it happens, heard on COS's event stream, not
  polled.

## Proof
- `tests/modules/test-cos-desktop-driver.test.js` 9/9, with a stand-in backend that records each call:
  - refused unarmed;
  - an agent's arm refused;
  - the screen alone under view-only;
  - every verb under act, with its coordinates;
  - the log, with no typed text in it;
  - the kill switch and the expiry;
  - no backend named;
  - SendKeys escaping and the command row;
  - DD-09, the tab in Clear Glass through the real cockpit.
- Unchanged and passing: test-cos-hub 7/7, test-orchestrator-automation 11/11, test-cos-pipeline 20/20, test-cos-hidden-windows 4/4.
- Failing before and after, said: test-cli-route-commands CL-07 (it needs Guardian running).

## Not yet proved
The real Windows backend has not run: this container has no screen. It is proved on his PC through his Remote Control link: arm it for
5 minutes, then `cos desktop screen`, then a click.

## JavaScript, said
`desktop-driver.js` is new JavaScript. COS's manager is JavaScript, and Emerge cannot start a process until CIE13.
