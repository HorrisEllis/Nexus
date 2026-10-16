# docs/2026-10-16-tls-layer-phasemap.spec
# Clear Glass's TLS layer, made real: a Firefox persona is Firefox in its TLS handshake too, not only in its headers.
# MAPPED 2026-10-16, before building (docs/CLAUDE.md rule 1). Registered in docs/SPEC-REGISTRY.spec.

origin:
  date: 2026-10-16
  james: "fix it. i don't want the trouble again"
  asked: >-
    About clear-glass/src/tls/proxy.js. The coder explained it: it wraps the browser's own TLS in a second TLS
    connection, so no HTTPS site could load through it, and nothing used it. Node cannot make a Firefox ClientHello, and
    a real fix needs local interception plus a uTLS helper. The coder recommended archiving it ("my recommendation:
    archive it now"), with the uTLS helper as its own phase if the personas got walled.
  decided: '"fix it. i don''t want the trouble again" (James, 2026-10-16) — the real layer, not the archive. The coder''s recommendation was the other option; this is his call.'
  reading: >-
    "I don't want the trouble again" is read as two requirements, to confirm. First, the layer must work. Second, it must
    never be the reason a site fails: when it cannot do its job it steps aside, and says so.

evidence:
  # read 2026-10-16, not from memory
  - "src/tls/proxy.js: on CONNECT it tls.connect()s to the site and pipes the browser's encrypted bytes into that TLS socket — TLS inside TLS; the server reads a ClientHello as application data. rejectUnauthorized: false: the site's certificate is never checked."
  - "Nothing routes a session to it: contexts/manager.js takes tlsProxyPort and never uses it; main/index.js only starts it and reports its port."
  - "The Firefox personas (contexts/manager.js, persist:agent-<id>) present a Firefox UA and Firefox headers over Chromium's TLS ClientHello: a mismatch that strict bot walls (Cloudflare, Akamai, PerimeterX) read."
  - "Every session's proxy is set by one door, src/net/service.js (setProxy with a generated PAC, src/net/policy.js). A second writer would fight it."
  - "Go 1.24 is in the build container; github.com/refraction-networking/utls is reachable through the module proxy."

design:
  - "A Go helper (clear-glass/tls-helper/, binary cg-tls-helper), loopback only. It is an HTTP CONNECT proxy that intercepts locally. For each tunnel: (1) read the browser's ClientHello: its server name and the ALPN protocols it offers; (2) dial the site with uTLS's Firefox ClientHello, offering only those protocols in Firefox's order, and VERIFY the site's certificate against the system roots; (3) finish the browser's handshake with a certificate for that host, minted by a local CA, offering exactly the protocol the site chose; (4) relay the decrypted bytes both ways. h2, http/1.1, WebSockets and streaming (SSE) all pass, because nothing is parsed."
  - "The local CA lives in Clear Glass's data dir. The key is 0600 and never leaves the machine. Only the Firefox-persona sessions trust it: Electron session.setCertificateVerifyProc accepts a certificate issued by this CA and leaves every other one to Chromium's own check. The OS trust store is never touched."
  - "Never the reason a site fails: if the uTLS handshake fails, the helper retries the site with Go's standard TLS (still a verified connection, a different fingerprint) and logs it. If the helper is not running or the binary is missing, sessions are not routed to it. The PAC says 'PROXY 127.0.0.1:7703; DIRECT', so a dead helper falls back to direct."
  - "One door: the routing PAC (src/net/policy.js) gains the layer. In a Firefox-persona session, a request whose route is direct goes through the helper; a request routed elsewhere (a person's proxy, the transport) keeps that route."

phases:
  TLS1_helper:
    status: BUILT 0.60.109
    systems: [clear-glass]
    files: [clear-glass/tls-helper/main.go, clear-glass/tls-helper/main_test.go, clear-glass/tls-helper/go.mod, clear-glass/tls-helper/build.js, clear-glass/tls-helper/bin/]
    does: "the Go helper as designed: Firefox ClientHello upstream with verification, a local CA, ALPN carried through, a byte relay, a standard-TLS retry, a /health line on stdout. Prebuilt for windows-amd64 and linux-amd64 (James runs Windows from the repo zip: no Go needed); build.js builds the rest."
    proof: "go test: the site sees Firefox's ClientHello (ffdhe groups Chrome does not send); h2 and http/1.1 through it; a site with a bad certificate is refused; the standard-TLS retry."
  TLS2_clear_glass_runs_it:
    status: BUILT 0.60.109
    systems: [clear-glass]
    files: [clear-glass/src/tls/helper.js, clear-glass/src/main/index.js]
    does: "Start it on :7703 in place of the Node proxy, restart it on a crash (bounded), stop it at shutdown. status() gives its state, port, CA fingerprint, and the reason when it is unavailable. src/tls/proxy.js is superseded and kept (§0.3)."
    proof: "tests/modules/test-tls-layer.test.js: the real binary, end to end through Node."
  TLS3_personas_use_it:
    status: BUILT 0.60.109
    systems: [clear-glass]
    files: [clear-glass/src/net/policy.js, clear-glass/src/net/service.js, clear-glass/src/contexts/manager.js]
    does: "the PAC layer (direct → helper; DIRECT after it); service.setTlsLayer(); persona sessions registered with firefox:true, and their certificate check trusts only this CA's leaf certificates."
    proof: "PAC and verify-proc checks in the same test."

open:
  - "The HTTP/2 fingerprint (SETTINGS values, pseudo-header order) stays Chromium's: the helper relays h2 frames as they are. Matching it means rewriting h2, which is not built and is said."
  - "Client certificates (rare) cannot pass through local interception."
  - "Not proven against a real bot wall from James's machine yet."

## ADDENDUM 2026-10-16 — ids renamed at the merge with main
- The phases were TL1–TL3 when built. Main's durable-work timeline map already uses TL0–TL3 (TL1 = GW27 = FN3, fa0260b). Renamed TLS1–TLS3 so one id names one thing. Nothing else changed.
