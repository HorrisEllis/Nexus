# 0.60.178 — 2026-10-21 — Snowflake working end to end: the page inside the compartment

James, 2026-10-21, with a screenshot of Settings → Network (tor found, snowflake found, "Not detected on PATH", toast "set a
Snowflake bridge line first"): "can you get snowflake working. connected to the compartment? optional encryption. Can you look in
domains of cyber security and all technololgy. find any way to improve snowflake plugin, and make it look as nromal as it can."

The asks and the direction are his. The coder's part: the root causes, the readings (marked "to confirm"), the design, the code.

## Root causes (read in the source before anything was built)
1. **The screenshot.** Settings → Network read `det.torPath`, `det.snowflakePath` and `s.bridgeLine`. The backend sends
   `detect.tor`, `detect.snowflake` and `detect.bridgeLine`. So programs that were found showed "Not detected on PATH", and Start
   refused with "set a Snowflake bridge line first" even when a line was stored.
2. **Not connected to the compartment.** Every agent window shows its page in a `<webview>` with no `partition`, and in Electron
   that means the app's default session. "Open link with Snowflake" routed the window shell's session (`persist:agent-snow-<id>`),
   so the page itself went direct.
3. **No bridge line when tor was already installed.** Lines came only from the installer's own downloaded bundle.
4. **Every Snowflake window got a random Firefox persona**, saved to disk and never removed. Over Tor, a Firefox UA on a Chromium
   TLS handshake is a mismatch that stands out.
5. **WebRTC was not restricted** in routed windows (NP4 was open), so STUN over UDP could go around the proxy.

## Readings (to confirm)
- **"connected to the compartment"**: his 2026-10-15 "compartment" is the isolated transport. Read as: what Snowflake opens really
  goes through it, page and all.
- **"optional encryption"**: an HTTPS-only switch for Snowflake windows. It is on by default and his to turn off. It encrypts end
  to end past the Tor exit relay, the one place on this path where traffic can be read in the clear. No home-made cipher (the
  2026-10-15 pushback stands). The encrypted at-rest container is NP19, still open.
- **"make it look as normal as it can"**: the window looks like an ordinary Chromium on the wire, with one consistent identity,
  and the Settings page tells the plain truth.

## Specced (his rule: spec, then phases, then each phase specced again)
- `clear-glass/spec/snowflake.spec`: 6 modules at specDepth 1.0, compiled by emerge, no BLACK nodes.
- `docs/2026-10-21-snowflake-compartment-phasemap.spec`: SF1–SF6, DAG-clean, 0 crossings.
- `clear-glass/phases/2026-10-21-snowflake-compartment/` holds the `.phase` and `.graph` of each phase.

## Built
- **SF1, detection that says where things came from.** Programs are looked for in a saved path, then PATH (`snowflake-client`,
  `snowflake` or `lyrebird`), then a Tor Browser install. On Linux, tor gets its own folder as `LD_LIBRARY_PATH`, because bundled
  tor needs its libraries; nothing else enters its environment. `status()` reports `bridgeLine: 'set'` and never the line itself.
- **SF2, `src/net/bridge-sources.js`.** Real lines come from:
  - Tor Browser's `pt_config.json`;
  - the installed bundle;
  - the snowflake-client package's example torrc.

  The Tor Project's builtin list is fetched only when he presses "Ask the Tor Project", and the button says it contacts
  bridges.torproject.org directly. No line is invented or carried in code.
- **SF3, `src/net/compartment.js`.** A routed window is one in-memory session, `cg-snow-<id>`, for the shell and the page:
  - the partition is forced in the main process at `will-attach-webview`, not trusted to the renderer;
  - it sends Chromium's own UA without the Electron or app tokens, with no persona;
  - WebRTC is set to `disable_non_proxied_udp`;
  - no cookie-vault snapshot is taken, and everything is cleared when the window closes.

  Windows without a route are untouched.
- **SF4, `src/net/https-only.js`.** Plain http pages are opened over https, and plain http parts of a page are refused. Local tools
  are left alone. It composes with the content-filter listener: Electron allows one listener per session, and the adapter now
  runs this gate first instead of replacing it.
- **SF5, the circuit check.** It asks check.torproject.org/api/ip through the transport, and the answer is kept in `status()`. It
  is not the leak test, so nothing is marked Verified.
- **SF6, the surface.**
  - Routes under `/cli/net/bridge/*`, plus `/cli/net/https-only` and `/cli/net/check`.
  - New command verbs: `net bridges | builtin | use <n> | https-only on|off | check`. Changes are person-only.
  - Agents can read the found bridges and run the circuit check.
  - Settings → Network shows the real program paths and where each came from, the bridge finder with "Use" per line, a "Snowflake
    windows" pane with the HTTPS-only switch, and "Check the circuit".
- **His uploaded plugin** ("Open link with Snowflake", the installer, context items) was merged three-way onto the current tree,
  without losing the page-map panel.

## Measured
- `test-snowflake` 8/8 (new). SFW-08 drives the real Settings → Network page in Clear Glass's own engine (glass.js, never
  Playwright) against a stub bridge: real paths with their sources, Find → Use, the HTTPS-only switch, and no automatic Tor Project ask.
- `test-net-routes` 24/24. NR-11's empty-environment rule now allows Linux tor's own folder as its library path.
- `test-substrate-spec` 3/3, now including the snowflake spec. `test-loom-map` 19/19.
- 17 related suites run before and after: the same pass and fail set, the same failure counts. The failures were already there on
  the base (SB-06 boundary census, CL route-commands and others).

## Not done, and said
- Electron, tor and the network are not in this sandbox, so the live path is unverified until it runs on his machine with the Clear
  Glass driver. The Tor Project's Moat endpoint could not be reached from here either (the proxy refused it).
- **A problem for him.** Ordinary agent windows also load their page in the default session, so route rules and personas there
  reach the shell, not the page. Fixing that moves their cookies and sign-ins to a new session, so it is his call. Only routed
  windows are fixed here.
- Downloads from Snowflake windows still go to the normal Downloads folder (NP16 quarantine is open). The driver's own
  `onBeforeRequest` blocking, when used, still replaces the session's listener.
