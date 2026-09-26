# remote-desktop

Bottom-up build against `remote-desktop.spec`. The spec is tracked in this
project and updated alongside the code — see its `implementation_log` at
the bottom for a dated, verified/not-verified trail of everything below.

## What's real right now

```
bridge-os-core/          vendored, untouched
contracts.js             the interaction contract — core boundary + this
                          project's own internal module-boundary shapes
session-token.js         phase 2: session_token_issuance — event-driven
signal.js                phase 0/2: signaling + token gate. start()/stop() exported
input-auth.js            phase 4: per-message HMAC auth + replay guard, browser+Node
input-injector.js        phase 4: per-OS injection, rate limiter, mousemove
                          coalescer, view-only lock — zero knowledge of tokens/crypto
host.html                 wired: real token display, waits for viewer:joined,
                          relays input frames to Electron (or logs, if no Electron)
viewer.html                wired: real signal/session/token fields, signs every
                          input frame before sending
bridge-electron/          phase 7 (built early, see spec's out_of_order_note):
                          tray, close-to-tray, background hosting toggle,
                          view-only-lock toggle, in-process signaling server,
                          the ONLY place input frames get verified (main process)
scripts/                  headless background-service option (no Electron),
                          Windows batch + PID file
tests/                    5 test files, all passing — see below
```

## Run it

**Browser, same machine:**
```
npm install && node signal.js
```
Open `host.html` and `viewer.html` in two tabs, pass the session ID +
token from host to viewer, connect. Input won't actually move anything
(no Electron = no native backend), but you'll see it logged.

**Cross-device (LAN):** same, but the viewer sets "Signal server" to
`ws://<host's LAN IP>:8080`. `signal.js` binds all interfaces already.

**Electron host shell (real input injection):**
```
cd bridge-electron && npm install && npm start
```
This is the only path where input actually lands on the OS — everything
else is protocol-correct but inert by design (a browser tab can't move
your mouse). Tray menu has Show/Hide, background-hosting toggle, a
view-only lock toggle, and Quit.

**Headless background service:**
```
scripts\start-signal-background.bat
scripts\stop-signal-background.bat
```

## Tests — all passing, rerun any time

```
node tests/test-session-token.js       # 13 assertions
node tests/test-input-auth.js          # 10 assertions
node tests/test-input-injector.js      # 12 assertions
node tests/test-input-pipeline.js      #  5 assertions — the exact sign→verify→
                                        #  replay-check→inject chain main.js's
                                        #  IPC handler runs
node tests/test-signal-integration.js  #  6 assertions — real WS host+viewer
```
One of these caught a real bug during development (rate limiter running
before mousemove coalescing, which could starve out a real click after a
mouse burst) — full story in the spec's `implementation_log`.

## What's NOT verified

The Electron API surface itself (Tray, BrowserWindow,
setDisplayMediaRequestHandler, the actual IPC hop renderer→main) has no
runtime test — this sandbox has no display and doesn't install Electron.
Every piece of *logic* those surfaces call into (config persistence, LAN
address discovery, the auth/replay/injection pipeline) is unit-tested
directly and passes; the wiring around it is written correctly against
documented APIs but needs a real run on a real machine to confirm. Same
goes for the two `.bat` scripts — no Windows here.

## Known gap, said plainly

`bridge-electron/` (phase 7) and the input pipeline it enables both sit
ahead of phase 6 (security_hardening_layer) in spec order, built early at
explicit request. Per-message input auth (this pass) and session tokens
(previous pass) cover real ground, but there's still no DTLS-SRTP
enforcement, no signaling-layer replay protection, no fingerprint trust
store. Fine for LAN testing between devices you already trust; not fine
to expose further than that yet.

## Next up

- phase 3 (media_pipeline) — right now video is whatever WebRTC's default
  VP8 gives you, no tile-diff/bitrate control
- phase 5 (file_and_data_transfer)
- phase 6 (security_hardening_layer) — actually unblocks phase 7 being
  "done" rather than "built early"
- mobile virtual trackpad/keyboard (phase 4's remaining two deliverables)
- `crash_reporter_and_auto_restart_supervisor` (phase 7's remaining deliverable)
