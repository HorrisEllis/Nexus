# 0.60.260 — A human check meets the browser Clear Glass really is

James, 2026-10-26, with a screenshot of Fiverr's "Before we continue... Press & Hold to confirm you are a human (and not a bot)" that never
let him through: "i can't get passed this. can you help? do everything you can, find out why and help. each step of the autofill can be
gates."

Map: `docs/2026-10-26-human-check-phasemap.spec`.

## Why it never let him through
- **Every person tab pretended to be Firefox.** It sent a Firefox user agent, Firefox headers, no client hints, and a Firefox TLS
  handshake. Underneath it is Chromium, and the page's JavaScript behaves like Chromium. A human check (HUMAN/PerimeterX on Fiverr) reads
  that mismatch as a bot, so holding the button never verifies.
- **The challenge made it worse.** When ErosmancerOS saw a challenge, the hostile hook switched the tab to Firefox again.
- **Switching identity only half-worked.** Two latent bugs, both proven under xvfb:
  1. The request hook kept the first profile, so headers stayed the old persona after a switch.
  2. A page already open keeps the user agent it was made with, so `navigator.userAgent` never changed.

## What changed
- **HC1, detection** (`clear-glass/src/contexts/human-check.js`). It recognises HUMAN/PerimeterX (Press & Hold, `px-captcha`),
  Cloudflare, reCAPTCHA, hCaptcha, DataDome, and the words themselves. A vendor's script alone on an ordinary page does not count.
- **HC2, the tab tells the truth.** When a person's tab lands on a human check:
  - Its session, and every open page on it, takes Chromium's own identity: user agent, headers and TLS.
  - The site is remembered, so the next visit starts that way.
  - The page reloads once.

  After that, a persona the hostile hook asks for is refused. Both latent switch bugs are fixed.
- **HC3, the first autofill gate.** Every fill stops at a human check and says so, with nothing typed. That covers Settings' fill,
  agents' `/cli/autofill/fill`, and the gig fill, which the co-pilot uses too.
- **The boundary.** Nothing presses, holds, clicks or solves a check, and nothing hides that the browser is automated. The check is his
  to pass.

## Proof
`clear-glass/test/human-check.test.js` runs a real ContextManager in real Electron (xvfb), against a local site:
- Before: the site sees `Firefox/156.0`.
- A Press & Hold page is found, and the gate stops on it.
- After the switch, the request and `navigator.userAgent` are both `Chrome/148`.
- A hostile persona is refused.

These still pass: google-signin 56/56 (one source check updated for the live profile), glass-frame, gig-file, and the autofill suites.

## Open
- **HC4, each autofill step a gate.** This is his "each step of the autofill can be gates" in full: each field found, typed, read back,
  and a gate nothing can check held for him (GV1). It is mapped, not built.
- **Not checked here:** Fiverr itself on his machine. If the hold still fails after the reload, HUMAN may be reading something else, such
  as the network or the Electron runtime. Opening the page in his everyday browser is then the plain way through.
