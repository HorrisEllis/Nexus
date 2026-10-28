# 0.60.109 — 2026-10-16

James: "fix it. i don't want the trouble again"

This was about Clear Glass's TLS proxy. The coder had explained that it wrapped the browser's own TLS in a second TLS
connection, so no HTTPS site could load through it, and recommended archiving it. His call was to make it real. The map
is `docs/2026-10-16-tls-layer-phasemap.spec`.

## What it is now

**`clear-glass/tls-helper/`, `cg-tls-helper` (Go and uTLS, loopback only).** For each tunnel it:
1. reads the browser's ClientHello (server name, offered protocols);
2. dials the site with Firefox's ClientHello, which is:
   - uTLS's Firefox 120 profile;
   - plus X25519MLKEM768, Firefox's default since 132;
   - offering the browser's protocols in Firefox's order;
3. **verifies the site's certificate** (the Node proxy never did: `rejectUnauthorized: false`);
4. answers the browser with a certificate from a local CA. Its key is kept at 0600 in `%APPDATA%/.clear-glass/tls-layer`;
5. relays the bytes: h2, http/1.1, WebSockets and streaming all pass.

**Who uses it.** Only Firefox-persona sessions (agent windows). They trust the CA through `setCertificateVerifyProc`:
its certificates are accepted, and everything else goes to Chromium's own check. The OS trust store is never touched.

## "No trouble again", built in

- **A site still loads if Firefox's handshake is refused.** The helper retries with standard TLS. A bad certificate is
  refused, never passed.
- **The PAC falls back.** It routes `PROXY 127.0.0.1:7703; DIRECT`, so a dead helper falls back to direct.
- **A missing binary or a failed start.** The state becomes "unavailable" with the reason, and sessions go direct.
- **A crash restarts it,** up to five times in ten minutes. After that it stays down and says why.
- **It exits with Clear Glass** (a stdin pipe), so it never lingers holding port 7703.
- **Prebuilt binaries.** windows-amd64 and linux-amd64 are committed with SHA256SUMS, so running from the repo zip needs
  no Go. `node clear-glass/tls-helper/build.js --all` builds macOS and arm.
- **The old proxy is kept.** `src/tls/proxy.js` is marked superseded (§0.3).

## Proof

- `go test` passes 5/5:
  - the site sees Firefox's groups (ffdhe and X25519MLKEM768);
  - h2 end to end;
  - http/1.1-only end to end;
  - a bad certificate is refused;
  - the standard-TLS retry carries the site;
  - the CA is kept, and it listens on loopback only.
- `tests/modules/test-tls-layer.test.js` passes 7/7. It runs the real binary end to end through Node, and checks:
  - it never becomes an orphan;
  - a crash restarts it;
  - CA trust;
  - the PAC;
  - the wiring.
- Unchanged and passing: Clear Glass `google-signin` (56), `test-net-routes` (24), Clear Glass `bus` (29).

## Not done (said, not hidden)

- **The HTTP/2 fingerprint stays Chromium's.** The helper relays h2 frames as they are.
- **Client certificates** cannot pass local interception (rare).
- **The Windows binary is cross-compiled and was not run here.** The Linux build of the same source is what the tests
  ran.
- **Not yet tried against a real bot wall from his machine.**
