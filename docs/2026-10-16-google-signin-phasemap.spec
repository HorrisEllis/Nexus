# docs/2026-10-16-google-signin-phasemap.spec
# Google's sign-in works inside Clear Glass: "Couldn't sign you in — This browser or app may not be secure" fixed.
# Written 2026-10-16, AFTER the code, said plainly (docs/CLAUDE.md rule 1 asks for before). James asked for it urgently,
# mid-task ("need this fixed. completely"); the coder read the code and the cause first, and built the one module.
# Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: "need this fixed. completely"
  looking_at: >-
    A Clear Glass popup window titled "Couldn't sign you in". It shows Google's page: "This browser or app may not be
    secure. Try using a different browser."

evidence:
  # read 2026-10-16, not from memory
  - "The user agent was already scrubbed of Electron, Node and Clear Glass tokens (main/index.js for the default session; providers/host.js for the provider partitions). Google refused anyway."
  - "What the UA scrub left: every request still sent Chromium's client hints (Sec-CH-UA: \"Chromium\", without a \"Google Chrome\" brand), and pages could read the same from navigator.userAgentData. That is how Google's sign-in tells an embedded Chromium from Chrome."
  - "Electron keeps one onBeforeSendHeaders listener per session; a second registration replaces the first silently. contexts/manager.js registered its Firefox-profile headers after session-headers.js's localhost (Private Network Access) one, so the agent sessions lost the localhost header without a word."
  - "Not touched: Clear Glass runs with --remote-debugging-port (ErosmancerOS needs it). It is not the cause the code shows, and it cannot be switched per page."

phases:
  GS1_present_as_firefox_on_google_signin:
    status: BUILT 0.60.106
    systems: [clear-glass]
    files: [clear-glass/src/contexts/google-signin.js, clear-glass/src/main/index.js]
    does: >-
      While a page is on a Google sign-in host (accounts.google.<tld>, accounts.youtube.com), Clear Glass presents as
      Firefox ESR, consistently. The request has a Firefox User-Agent and no Sec-CH-UA* headers. The page has a Firefox
      UA, and navigator.userAgentData is removed through the DevTools protocol where its debugger is free. Its
      sub-requests (gstatic …) say the same. When the page leaves the sign-in hosts, its own UA comes back. This is the
      approach Electron apps that host Google sign-in use (Ferdium, Rambox). It covers every session (app
      'session-created', plus the default session) and every page, webviews and popups included (app
      'web-contents-created'). A page that loaded before the UA applied is loaded once more, never in a loop. Google's
      refusal page, if it still appears, is logged.
    proof: clear-glass/test/google-signin.test.js (32 checks, fakes)

  GS2_request_hooks_compose:
    status: BUILT 0.60.106
    systems: [clear-glass]
    files: [clear-glass/src/contexts/session-headers.js, clear-glass/src/contexts/manager.js]
    does: >-
      requestHook(ses, name, fn, { order }) gives one listener per session, with hooks run in order. A hook returns new
      headers or null. A hook that throws is skipped and said. The localhost header, the fingerprint profile and the
      sign-in hook (order 100, so its UA wins) now all apply.
    proof: the same test (requestHook checks)

open:
  - "Not proven against Google live: Electron and Google cannot run in the build container. James's next sign-in is the proof. If Google still refuses, the log line '[google-signin] Google refused the sign-in page anyway' says so, and the next step is the CDP userAgentMetadata route (present as Google Chrome with brands), mapped here and not built."
  - "A page whose debugger is held by the Clear Glass driver during sign-in keeps navigator.userAgentData (said in the log). Headers and UA are still Firefox."
