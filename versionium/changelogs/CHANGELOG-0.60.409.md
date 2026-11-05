# 0.60.409 — ES1/ES3: ErosmancerOS in plain words, its options and its threats; a bot check hands the page to you

James, 2026-11-05: "can you expand erosmanceros. add as much human ledgible options as possible, inscluding adding typescripts, threats, etc,
all cli first, then into the browser.html." Then "also finish erosmancer", and "1, then 3? can" (Automate first, 0.60.408, then this).

## Built
- **ES1: every option in plain words.** ErosmancerOS declares 26 options in its OSConfig, and all 26 are listed with what each one does:
  - **16 you can set.**
    - Two take effect at once: the pace (precise, cautious, exploratory, turbo) and how each action is sent (direct, parallel, redundant).
    - Fourteen take effect the next time Clear Glass connects it: connection timeouts, how it finds an element and in what order, its queue and retries, its log.
  - **9 are fixed in its code.** They are shown with their values. Changing them means editing its code, which you can do with Edit ErosmancerOS.
  - **3 are set by Clear Glass:** which browser it drives, and where it keeps its data.
  - The defaults are read from its own source, not copied by hand.
  - A bad value is refused, and the message lists the allowed ones.
  - Your choices are kept in `data/erosmancer/options.json`, and each change is recorded in Versionium.
  - CLI: `eros options`, `eros set <option> <value|default>`.
- **ES3: threats in plain words, and the hand-over.**
  - `eros threats` says what ErosmancerOS's hostile/ module sees on its pages.
  - When a macro reaches a page with a check a person answers, it pauses before its next step and tells you which check, on which page. These checks are Cloudflare's "Just a moment", Turnstile, reCAPTCHA, hCaptcha, a site's own CAPTCHA (PerimeterX, DataDome) and "too many requests". Press resume and it goes on.
  - Fingerprinting and automation-detection scripts are only reported.
  - Nothing is done to get past a check (CM_D1). The page check only looks at the page; it never clicks or changes anything.
- **ErosmancerOS's own code (`erosmancer-os/src`) is not changed.** You asked the same day: "can you at least leave them alone". A test checks this.

## Read, to confirm
- **ES2 "adding typescripts":** I read it as answered by your later message, "conditions for detection of elements, scripts and type scripts", which 0.60.408's script steps (PA1) built. If you meant TypeScript actions inside ErosmancerOS, ES2 stays open.

## Open (said)
- **ES4:** the panel in browser.html.
- The hand-over for a workflow's browser steps. Today it covers macros only.

## Proof
- `test-eros-options` 5/5:
  - all 26 options are worded;
  - defaults are read from the source;
  - set, refuse and reset work, and the connect carries whole sections;
  - the page check runs in a real page: Turnstile, reCAPTCHA and "Just a moment" are seen, and a plain gig page is not;
  - the hand-over pauses and names the check;
  - ErosmancerOS's source is untouched.
- Unchanged and green:
  - `test-cg-eros-supervisor` 16/16, `test-eros-edit` 4/4, `test-eros-workbench` 6/6, `test-eros-telemetry-bounded` 4/4;
  - `test-macro-toast` 5/5, `test-macro-toast-glass` 5/5, `test-cg-bookmark-macros` 5/5.
- Failing on the base too, so not from this change: `test-eros-hooks` EH-03 and `test-cli-route-commands` CL-07 (Guardian not running here).
