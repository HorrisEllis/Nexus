# 0.60.108 — 2026-10-16

James: "for the google login, can you do everything you can to prevent that? like across domains, contexts,
erosmanceros, proxy,"

0.60.106 fixed the cause his screenshot showed (client hints and `userAgentData`). This release goes through every layer
that could still give Clear Glass away on Google's sign-in. The map is the addendum in
`docs/2026-10-16-google-signin-phasemap.spec`.

## What was found, and what changed

- **Domains.**
  - A Google sign-in iframe embedded in another site got Firefox headers while its JS stayed Chrome. It is now left as
    its page is.
  - `gds.google.com`, the security interstitial during sign-in, is now covered.
- **Version.** An outdated browser is one of Google's "may not be secure" reasons.
  - The agent personas claimed Firefox 121/122 (2023). One claimed "Windows NT 11.0", which no Firefox sends.
  - The version is now computed from Mozilla's release calendar (`clear-glass/src/fingerprint/firefox-version.js`), so
    it never goes stale.
- **The page, without a debugger.** 0.60.106 attached DevTools to the sign-in page to hide `userAgentData`, and an
  attached debugger is itself a signal.
  - A session preload (`clear-glass/src/preload/google-signin.js`, `contextBridge.executeInMainWorld`) now does it before
    Google's scripts run.
  - It removes `userAgentData` and `window.chrome`, and gives Firefox's vendor and productSub.
- **Contexts.**
  - Firefox personas sent Chromium's `Sec-CH-UA` on every site; they now send none.
  - Their page script now removes `userAgentData` and `window.chrome`.
  - Stale stored personas are refreshed for the same OS, and the rest of each profile is kept.
  - A persona already presenting a current Firefox keeps it through sign-in.
- **ErosmancerOS.** It refuses to attach to a tab on Google's sign-in, and detaches when an attached tab navigates into
  one (`tab:detached`). Clear Glass's semantic-tree reader reads the page tree there instead of attaching.
- **Proxy.**
  - Every PAC gives Google's sign-in its own line. A person's own proxy is honoured, and an explicit block stays a
    block.
  - Two cases go direct instead, with the reason written in the PAC:
    - Tor/Snowflake, which Google refuses or walls. `policy.signinOverTransport: true` keeps the transport there for
      those who choose it;
    - a rule collision, which would otherwise be a blackhole.
  - The TLS proxy raw-tunnels sign-in hosts.

## Proof

- `clear-glass/test/google-signin.test.js` runs 56 checks across domains, requests, the page, contexts, the proxy and
  readers.
- `erosmancer/erosmancer-os/tests/google-signin.test.ts` runs 8 checks. It was compiled with `tsc` and run, because
  tsx's esbuild binary is missing in the build container.
- Unchanged and passing:
  - `test-net-routes` 24/24;
  - `test-semantic-page-tree` 7/7;
  - `test-semantic-field-map` 5/5;
  - `test-guardian-field-pick` 5/5;
  - Clear Glass `bus` 29/29.

## Not done (said, not hidden)

- **Not proven against Google live.** His next sign-in is the test. A refusal is logged as `[google-signin] Google
  refused the sign-in page anyway`.
- **The TLS proxy (`:7703`) is broken for every other HTTPS host.** It wraps the browser's TLS in a second TLS
  connection. Nothing uses it today. Fixing it or archiving it is his call.
- **Clear Glass keeps `--remote-debugging-port 9333`.** ErosmancerOS needs it. Nothing attaches to a sign-in page now.
