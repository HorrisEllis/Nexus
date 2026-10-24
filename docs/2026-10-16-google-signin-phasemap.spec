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

## ADDENDUM 2026-10-16 (0.60.108) — every layer, as he asked

james: "for the google login, can you do everything you can to prevent that? like across domains, contexts, erosmanceros, proxy,"
reading: >-
  The coder's reading: harden every layer that could still give Clear Glass away on Google's sign-in, not just the one
  0.60.106 fixed. He named the layers; each is mapped and built below. Mapped from a read of each layer, before the
  code of this addendum.

found:
  - "domains: a Google sign-in iframe on another site (gsi) had its headers rewritten to Firefox while its JS stayed Chrome — an inconsistency. gds.google.com (the security interstitial during sign-in) was not covered."
  - "an outdated browser is one of the reasons Google says 'may not be secure': the agent contexts claimed Firefox 121/122 (2023), and one pool entry said 'Windows NT 11.0', which no Firefox sends."
  - "contexts: Firefox-persona sessions (contexts/manager.js) sent Chromium's Sec-CH-UA beside their Firefox UA on every site, and their page script left navigator.userAgentData and window.chrome."
  - "0.60.106's page side attached the DevTools debugger to the sign-in page to hide userAgentData; an attached debugger is itself a signal."
  - "ErosmancerOS (a CDP client on Clear Glass's port 9333) attaches to any tab it is asked to and enables DOM on it — the sign-in page included."
  - "clear-glass/src/page/semantic-tree.js attached the debugger to read the accessibility tree on whatever page an agent asked — the sign-in page included."
  - "proxy: a policy that sends everything through the Tor/Snowflake transport sent Google's sign-in there too (Google refuses or walls a sign-in from a Tor exit); a stored rule collision compiled to a blackhole."
  - "the TLS proxy (src/tls/proxy.js, :7703) wraps the browser's own TLS in a second TLS connection — it cannot work for any HTTPS site. Nothing points a session at it today (checked: manager.js receives tlsProxyPort and never uses it)."

phases:
  GS3_domains_and_version:
    status: BUILT 0.60.108
    files: [clear-glass/src/fingerprint/firefox-version.js, clear-glass/src/contexts/google-signin.js]
    does: >-
      The Firefox version is computed from Mozilla's four-week calendar (140 on 2025-06-24), one release behind, so it is
      never outdated. CG_FIREFOX_VERSION overrides it. gds.google.com is a sign-in host. Headers are rewritten for the
      main-frame navigation to a sign-in host and for every request of a page in sign-in mode. A sign-in iframe on
      another site is left as its page is. A page whose UA is already a current Firefox keeps it.
  GS4_page_without_a_debugger:
    status: BUILT 0.60.108
    files: [clear-glass/src/preload/google-signin.js, clear-glass/src/contexts/google-signin.js]
    does: >-
      A session preload, registered on every session (registerPreloadScript, setPreloads on an older Electron). On a
      sign-in host whose UA is Firefox, it runs contextBridge.executeInMainWorld before Google's scripts: no
      userAgentData, no window.chrome, Firefox's vendor and productSub, webdriver false. No debugger is attached
      (0.60.106's CDP path removed).
  GS5_contexts_one_firefox:
    status: BUILT 0.60.108
    files: [clear-glass/src/fingerprint/engine.js, clear-glass/src/contexts/manager.js]
    does: >-
      The persona pool is the current Firefox and the one before, on Windows, macOS and Linux. The 2023 pool is kept as
      FF_UA_POOL_2023. A stored persona with a stale UA is refreshed for the same OS, and the rest of it is kept. A
      Firefox persona sends no Sec-CH-UA on any site, and its page script removes userAgentData and window.chrome.
  GS6_proxy:
    status: BUILT 0.60.108
    files: [clear-glass/src/net/policy.js, clear-glass/src/tls/proxy.js]
    does: >-
      Every generated PAC gives Google's sign-in hosts their own line. That line is what the policy resolves for
      accounts.google.com (a person's own http/socks proxy is honoured), except two cases, which go DIRECT with the
      reason in the PAC:
      - the transport. policy.signinOverTransport: true keeps it there;
      - a collision.
      An explicit block stays a block. The TLS proxy raw-tunnels sign-in hosts. Its general double-TLS defect is said,
      not fixed: it is unused.
  GS7_no_debugger_on_signin:
    status: BUILT 0.60.108
    files: [clear-glass/erosmancer/erosmancer-os/src/bridge/index.ts, clear-glass/src/page/semantic-tree.js]
    does: >-
      ErosmancerOS refuses to attach to a tab on Google's sign-in (Target.getTargetInfo first). When an attached tab
      navigates into sign-in (Target.targetInfoChanged), it detaches and emits tab:detached. The semantic-tree reader
      reads the page tree there instead of attaching, and says so.
proof:
  - clear-glass/test/google-signin.test.js — 56 checks across domains, request, page, contexts, proxy, readers (fakes)
  - erosmancer/erosmancer-os/tests/google-signin.test.ts — 8 checks (compiled with tsc and run; tsx's esbuild binary is missing in the build container)
open:
  - "Still not proven against Google live. His next sign-in is the test; a refusal is logged by name."
  - "The TLS proxy's double-TLS defect for every other host: unused today; fix or archive it is his call."
  - "Clear Glass keeps --remote-debugging-port 9333 (ErosmancerOS needs it); no session attaches to sign-in pages now."
