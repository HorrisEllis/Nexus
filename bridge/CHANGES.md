# Bridge OS v6.3 — Changes

## bridge-noise-handshake.js — Bug Fix (CRITICAL)

**Bug:** IK pattern msg2 round-trip failed with AEAD authentication error.

**Root cause:** The `'e'` (ephemeral) token in `writeMessage` was calling
`this._ss.mixKey(ePub)` when the cipher state already had a key. This is
a PSK-pattern operation (Noise §9.2) and must NOT run in standard IK/XX.
The spurious `mixKey` call injected a DER-encoded ephemeral public key
(`302a300506032b65…`) into the chaining key, causing the responder's CK
to diverge from the initiator's during msg2 — breaking all subsequent
AEAD operations.

**Fix:** Removed the conditional `mixKey` entirely from the `'e'` token in
`writeMessage`. The Noise spec §5.3 is clear: `'e'` → `mixHash(e.public_key)`.
No `mixKey`. PSK support will be a separate token (`'psk'`).

**Fix 2:** `NoiseSession.decrypt()` now validates the incoming seq number
against `_recvSeq` and throws on replay/out-of-order, enabling the nonce
replay adversarial test to pass.

**Result:** 65/65 adversarial tests passing (was 60/65).

---

## bridge-os-v6_3.html — Phantom VPN Module Wired

**What was broken:**
- `togglePhantom()` was UI-only — never called the bridge backend
- `rotateHops()` used hardcoded fake relay names (`gh-r1`, `cf-r1`, etc.)
- No relay pool management in the Phantom section panel

**What was added:**

### `togglePhantom()`
- Now POSTs to `/phantom/activate` or `/phantom/deactivate`
- Starts/stops a 60s polling interval for relay pool refresh
- Activates the regime cascade chip (`ma-phantom`)

### `_phantomPollRelays()`
- Polls `/phantom/relay` on 60s interval when phantom is active
- Renders live relay pool in the Phantom section panel
- Updates hop chain labels from live relay URLs

### `rotateHops()`
- Now pulls from live `_phantomRelays` pool first
- Falls back to `/phantom/rotate` bridge endpoint if pool is empty
- Hop labels show real hostnames (truncated), with full URL on hover

### New Relay Pool Panel (in Phantom section)
- Live relay list with latency and alive/dead status
- Add relay via URL input → POSTs to `/phantom/relay/add`
- Remove individual relays → POSTs to `/phantom/relay/remove`
- Probe all relays → calls `_phantomPollRelays()`
- Generate magnet link → `/phantom/relay/magnet/:id`
- Auto-refreshes when navigating to the Phantom section

### Bridge endpoints expected (bridge-phantom v1.0):
- `POST /phantom/activate`
- `POST /phantom/deactivate`
- `GET  /phantom/relay`
- `POST /phantom/relay/add    { url }`
- `POST /phantom/relay/remove { url }`
- `POST /phantom/rotate`
- `GET  /phantom/relay/magnet/:id`
