spec:

  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # cos/spec/remote-control.spec — Nexus's own remote control: the screen seen as an interaction field, shown with an injected overlay,
  # acted on by number, felt by Nerve, watched from anywhere. Map: docs/2026-11-08-pipeline-canvas-phasemap.spec PC10 (after PC9).
  # ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        remote-control
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-11-11T00:00:00Z
    status:      specced
    uuid:        cos-remote-control-spec-v1-0000-2026-1111-jamesbrooks-001
    origin: >-
      James, 2026-11-11: "Can you spec our own remote-control. From nexus nerve, interaction field, cleardriver and injecting code into the dom
      to see it. Like look at clearglass" · "Just map it. Maybe spec it. Then back to the high leverage. Can't get distracted" · earlier the same
      day: "I'm saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom." The parts and the
      direction are his. The shape (one field over two surfaces, act by number, the overlay window on the desktop) is the coder's, from what is
      already built; reading RC_R1 is his to confirm.
    purpose: >-
      An agent (the coder through his Remote Control link, or Nexus's own) drives his computer the way Clear Glass already drives a page.
      It sees the screen as numbered targets with x, y and z, not pixels. It shows him what it sees and what it is about to do, drawn over the
      screen. It acts by number and checks that the act did something. Nerve tells it where his attention is and what just changed. He watches
      and stops it from anywhere.
    target_runtime: [node, browser, windows]
    language_stack: [javascript, powershell, html, css, emerge]
    paradigm: [reuse-before-build, see-show-act-verify, consent-armed, every-act-logged]
    axioms: ["§8.6: Clear Glass's field (page/field.js), ClearDriver's pointer, page/state-diff.js, Nerve (lib/nerve), COS's remote-desktop host and viewer, and PC9's driver are reused, not rebuilt",
      "§10.3: one field shape for a page and for the desktop, so an agent learns one thing",
      "USER_AUTONOMY: nothing touches the desktop until he arms it (PC9); a page act follows the site's agent rules (ClearDriver's DRIVING)",
      "§1.1/§1.2: an act that changed nothing is said, never reported as done",
      "§5.15: Clear Glass serves the page field by its route; COS serves the desktop field; neither reaches into the other",
      "§17.13: JavaScript and PowerShell because COS's manager is JavaScript and Emerge cannot start a process until CIE13; the field's text form (describe) is the part to port to .eg first"]
    deps:
      - { name: node, version: ">=18", required: true, purpose: "COS's manager" }
      - { name: powershell, version: ">=5.1", required: true, purpose: "Windows: UI Automation (the desktop's tree), the overlay window, input (PC9)" }

    # What exists, read 2026-11-11 (grounding, not proposed):
    #   clear-glass/src/page/field.js   the interaction field in a page: field() numbered targets {n, name, role, selector, x, y, w, h, cx, cy, z}
    #                                   (z = layers over its centre; -1 off-screen); at({x,y}) the stack under a point; spotlight(); describe()
    #                                   as short text lines ("#3 button "Apply now" (412,580) 120×32 z0"); the overlay injected as CSS in a
    #                                   pointer-events:none layer.
    #   clear-glass/src/driver/index.js ClearDriver: click, type, pointer (native sendInputEvent), inject; DRIVING refused where a site says so.
    #   clear-glass/src/page/state-diff.js  what changed on a page between two reads.
    #   lib/nerve/index.js, docs/nexus-nerve.spec  Nerve, the attention layer: what is locally knowable now, around where he is looking.
    #   cos/remote-desktop/             WebRTC host and viewer, session tokens, HMAC-signed input, the injector (rate limit, view-only lock).
    #   cos/remote-desktop/desktop-driver.js  PC9 (0.60.483): screen, move, click, type, key, scroll; armed by him; every act logged.

    constraints:
      - id: RCS-001
        description: "One field shape for both surfaces: a target is {n, name, role, x, y, w, h, cx, cy, z, surface: page|desktop, ref}. On a page ref is a selector; on the desktop it is a UI Automation path."
      - id: RCS-002
        description: "Nothing on the desktop is read or touched unless PC9 is armed: the field and the overlay need 'view'; an act needs 'act'."
      - id: RCS-003
        description: "An act names its target by number from a field read in the last few seconds; a stale number is refused and the field read again."
      - id: RCS-004
        description: "Every act is verified: the field (or the page's state-diff) is read again, and an act that changed nothing is said."
      - id: RCS-005
        description: "The overlay never takes input: on a page a pointer-events:none layer, on the desktop a click-through, topmost, transparent window."
      - id: RCS-006
        description: "Every see, show and act is logged with who, why and the target; typed text by its length only (as PC9)."

  modules:
    - id: MOD-RC-FIELD
      name: desktop-field
      uuid: cos-remote-control-field-v1-0000-2026-1111-001
      path: cos/remote-desktop/desktop-field.js
      phase: PC10_our_own_remote_control
      description: >-
        The interaction field for the whole desktop. On Windows, UI Automation (the desktop's own tree of windows, buttons and fields, its "DOM")
        is read through PowerShell: every enabled, on-screen, clickable element, numbered, with its box, centre and z (covered by a window above
        it or not). The same shape as Clear Glass's field (RCS-001), and the same describe() text, so an agent reads lines instead of an image.
        Where UI Automation names nothing (a game, a canvas), the screen alone is returned and said.
      exports: ["field({ window?, max? }) → { targets, at, screen: {width, height} }", "at({x, y}) → the stack under a point, top first", "describe(field) → text lines"]
      behavioral_contracts: ["the same target shape as clear-glass/src/page/field.js", "the foreground window first; off-screen targets z -1"]
      error_paths: ["not armed → refused (RCS-002)", "no UI Automation (Linux, now) → refused, named; AT-SPI later"]

    - id: MOD-RC-OVERLAY
      name: show-what-it-sees
      uuid: cos-remote-control-overlay-v1-0000-2026-1111-001
      path: cos/remote-desktop/overlay.ps1
      phase: PC10_our_own_remote_control
      description: >-
        What Clear Glass injects into a page, drawn over the desktop: a numbered badge per target, a coordinate grid on request, and a spotlight
        ring on the target about to be acted on, with its label ("clicking #3 Apply now, because …"). A transparent, topmost, click-through
        window (RCS-005), started hidden by COS, fed by the field. Inside Clear Glass the page's own overlay is used, unchanged.
      exports: ["show(field, { grid? })", "spotlight({ n | x,y,w,h, label, ttl })", "clear()"]
      error_paths: ["the overlay could not start → the act still runs, the missing overlay said in the log"]

    - id: MOD-RC-ACT
      name: act-by-number
      uuid: cos-remote-control-act-v1-0000-2026-1111-001
      path: cos/remote-desktop/remote-control.js
      phase: PC10_our_own_remote_control
      description: >-
        One verb set over both surfaces: see (field + describe), show (overlay), act ({ n, do: click|type|key|scroll, text?, why }), verify. A
        target on a page goes to Clear Glass by its route (ClearDriver's pointer); a target on the desktop goes to PC9's driver at its centre.
        Before acting, the spotlight shows it; after, the field is read again and compared (RCS-004).
      exports: ["see({ surface })", "act({ n, do, text?, keys?, why, by })", "verify(before, after) → { changed, what }"]
      behavioral_contracts: ["a stale number refused (RCS-003)", "an act that changed nothing returned as changed:false, said"]
      error_paths: ["not armed to act → refused (PC9)", "a page target and Clear Glass not answering → refused, named; the desktop path is not tried in its place"]

    - id: MOD-RC-NERVE
      name: attention
      uuid: cos-remote-control-nerve-v1-0000-2026-1111-001
      path: lib/nerve/index.js
      phase: PC10_our_own_remote_control
      description: >-
        Nerve's window of focus, fed by the field: where his cursor and the foreground window are, and what changed since the last read (a
        window opened, a dialog over the target, a field filled). Streamed as cos.remote.attention, so an agent looks where something happened
        instead of reading the whole screen again (fewer tokens).
      exports: ["focus() → { window, cursor, changed }"]
      behavioral_contracts: ["Nerve observes; it never acts (docs/nexus-nerve.spec)", "only what changed is streamed, not the whole field again"]
      error_paths: ["not armed → no focus is read, said"]

    - id: MOD-RC-VIEW
      name: watch-and-stop
      uuid: cos-remote-control-view-v1-0000-2026-1111-001
      path: cos/ui/automation/engine.js
      phase: PC10_our_own_remote_control
      description: >-
        The Desktop tab grows into the remote control's console: the last screen with the field drawn on it, the act log, the spotlight's
        label, Arm and Disarm. From his phone, through COS's existing remote-desktop viewer (cos/remote-desktop/host/viewer.html), he watches
        live and can disarm.
      error_paths: ["the viewer not connected → the tab still works on the computer itself"]

  routes:
    - "GET  /api/cos/remote/field?surface=desktop|page  → MOD-RC-FIELD (localhost; armed view or act)"
    - "POST /api/cos/remote/show   { grid?, spotlight? }  → MOD-RC-OVERLAY"
    - "POST /api/cos/remote/act    { n, do, text?, keys?, why, by }  → MOD-RC-ACT"
    - "GET  /api/cos/remote/focus  → MOD-RC-NERVE"
    - "event cos.remote.attention · cos.remote.act (with verify)"
    - "command: cos remote field | show | act <n> <do> | focus"

  readings_to_confirm:
    - id: RC_R1
      question: "\"injecting code into the dom\" on the desktop, outside Clear Glass"
      reading_a: "The coder's default: the desktop has no DOM, so its UI Automation tree stands in for one, and the overlay is a window drawn over the screen. Inside Clear Glass, the real DOM injection already exists and is reused."
      reading_b: "Only inside Clear Glass pages: the remote control drives Clear Glass, and the desktop stays with PC9's raw coordinates."

  gate_pipeline:
    - "GATE-RC-001: a stand-in UI Automation tree gives the same target shape as page/field.js (RCS-001)"
    - "GATE-RC-002: unarmed, field/show/act refused; view allows field and show only"
    - "GATE-RC-003: act by a stale number refused; a click that changed nothing said (changed:false)"
    - "GATE-RC-004: the Desktop tab in Clear Glass shows the field over the last screen; the real Windows path proved on his PC"
