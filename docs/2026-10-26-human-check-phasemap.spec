spec:
  meta:
    name:     human-check
    version:  1.0.0
    date:     2026-10-26
    release:  "0.60.260"
    uuid:     human-check-phasemap-v1-0000-2026-1026-jamesbrooks-001
    owner:    "clear-glass (src/contexts/human-check.js, contexts/manager.js, main/index.js, ipc/bridge.js)"
    voice: "The ideas and the calls are James's. `james:` is his, verbatim. `does:` is the coder's reading, his to correct."
    origin: >-
      James, 2026-10-26, with a screenshot of Fiverr's "Before we continue... Press & Hold to confirm you are a human (and not a bot)" in Clear
      Glass: "i can't get passed this. can you help? do everything you can, find out why and help. each step of the autofill can be gates."
    axioms: "docs/AXIOMS-v3.1.md — §0.1 evidence (traced, then proven in real Electron), §0.0 truth (the tab tells the site what it is), USER_AUTONOMY (a human check is his to pass), §1.2, §8.6 (the fingerprint engine, context manager, site settings and the hostile hook reused)"
    traced_2026_10_26: >-
      Every person tab is a Firefox persona (contexts/manager.js create: a Firefox user agent, Firefox headers, no client hints, the Firefox
      TLS layer) on a Chromium engine whose JavaScript is Chromium's. A human check (HUMAN/PerimeterX on Fiverr) reads the mismatch as a
      bot, so the hold never verifies. When ErosmancerOS saw a challenge, main/index.js /hook/hostile switched the tab to Firefox again. And
      two latent bugs made any switch only half-work: the request hook closed over the first profile (headers stayed the old persona), and
      an open page keeps the user agent it was made with (proven under xvfb: navigator.userAgent stayed Firefox after the session changed).
    boundary: "Nothing here presses, holds, clicks or solves a human check, or hides that the browser is automated. The tab stops pretending to be Firefox; the person passes the check; every automated step stops at it."

  decisions:
    HC_D1_what_a_check_gets:
      status: DECIDED 2026-10-26 by his axioms
      chosen: "On a human check the tab's session takes the engine's own identity (Chromium's UA and headers, Chromium's TLS), the site is remembered (site settings identity: engine) and the page reloads once. A hostile-triggered persona is refused after that. Agents and autofill stop at the check (a gate), never act on it."

  phases:
    HC1_detect:
      status: DONE (0.60.260)
      depends_on: [HC_D1_what_a_check_gets]
      files: [clear-glass/src/contexts/human-check.js]
      does: "detectScript (read only) and isHumanCheck: PerimeterX/HUMAN (Press & Hold, px-captcha), Cloudflare, reCAPTCHA, hCaptcha, DataDome, the words; a vendor script alone on an ordinary page is no check."
    HC2_the_tab_tells_the_truth:
      status: DONE (0.60.260)
      depends_on: [HC1_detect]
      files: [clear-glass/src/contexts/manager.js, clear-glass/src/main/index.js]
      does: "useEngineIdentity (session + every open page + headers from the live profile + Chromium TLS + routing re-registered); the person tab's webview checks after each load, switches, remembers the site, reloads once; a remembered site starts honest; the hostile hook meets a challenge with the engine identity."
    HC3_the_autofill_gate:
      status: DONE (0.60.260)
      depends_on: [HC1_detect]
      files: [clear-glass/src/ipc/bridge.js, clear-glass/src/event-taxonomy.js]
      does: "_humanCheckGate: the first gate of the IPC fill, the /cli fill (agents) and the gig fill (the co-pilot too): a human check stops it, said, nothing typed."
    HC4_every_autofill_step_a_gate:
      status: OPEN
      depends_on: [HC3_the_autofill_gate, GV1_raid_holds_a_gate_for_a_person]
      files: [clear-glass/src/autofill/matcher.js, clear-glass/src/autofill/gig.js, clear-glass/src/ipc/bridge.js]
      does: "His 'each step of the autofill can be gates', in full: each field a gate (found, typed, read back equal, else stop and say), the fill a contract of those gates, a gate nothing can check held for him (GV1). Mapped, not built in 0.60.260."
    HC5_proof:
      status: DONE (0.60.260)
      depends_on: [HC2_the_tab_tells_the_truth, HC3_the_autofill_gate]
      files: [clear-glass/test/human-check.test.js, clear-glass/test/human-check.electron.js, clear-glass/test/google-signin.test.js, clear-glass/package.json]
      does: "Real Electron under xvfb, a real ContextManager and a local site: before, the site sees Firefox; on a Press & Hold page the check is found and the gate stops; after the switch the request and navigator.userAgent are Chromium's; a hostile persona is refused."
