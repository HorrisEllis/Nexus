# 0.60.235 — 2026-10-24

James: "im saying for web servers, dns, firewall, email smtp, like integrating into deployable. i want to use those engines for test env, web servers, etc all of them" · "this is all the networking backend for anything needed netwroking wise" · "Continue"

## Built (SV0; spec `cos/spec/cos-services.spec`, map `docs/2026-10-24-cos-services-phasemap.spec`)

His anonymousservers.info NEXUS 0.1.0 is now in `cos/services/anonymous/`: the kernel and its 27 engines (web server, DNS, firewall, SMTP,
TLS, proxy, storage, queue, auth, monitor …).

- **As he brought it:** the engines, the SDK, the installer, the package and its README are byte-identical to the upload.
  `UPSTREAM.sha256` holds the upload's hashes, and a test proves they match.
- **Changed, in `nexus.js` only.** Each change is marked `COS:` with why:
  - the root comes from `SERVICES_ROOT`, a stack's own folder. It is not `NEXUS_ROOT`, because Nexus itself uses that name;
  - the control pipe or socket is named by the root, where it was one fixed name;
  - the orphan sweep kills only the processes this root recorded, checked by command line. It killed every matching process on the
    machine. His version is kept, unused;
  - **`db:*` gates are parsed, never run.**

## Found: a code-execution hole, now closed

The engines build database gates from request input. For example, `auth.js` writes `` `r => r.handle === '${handle}'` `` on login, and the
kernel ran that string with `new Function`. A login handle carrying a quote could therefore run code in the kernel.

A strict grammar now reads exactly the 16 gate shapes the engines send, and refuses anything else, including a stray quote. Each of those
gates is checked against real JavaScript on the same rows.

One upstream gate was already broken: `auth.js:135`, an arrow function returning a template string. It is refused now, so that API-key
check fails closed. The engine itself is left as he wrote it.

## Not carried in

The upload's `conf/` held live secrets:
- a DKIM private key;
- a 128-character JWT secret;
- a 64-character billing encryption key;
- a peer identity.

None of it is in the tree, and neither is the upload's `state/` or `logs/`. Each stack writes fresh configuration with the engines' own
`init`. `defaults/` holds only what `init` does not make: the vhost templates and the default site. If that configuration was ever used on
a live server, those keys should be rotated.

## Proof

`tests/modules/test-cos-services.test.js` 4/4:
- **SV-01:** every gate in the engines' source compiles and filters as JavaScript would; six hostile gates are refused; the kernel's code
  (comments aside) builds no function.
- **SV-02:** two kernels in two temp roots both come up and answer status. Stopping one leaves the other running.
- **SV-03:** only `nexus.js` differs from the upload, with its changes marked; his machine-wide sweep is kept.
- **SV-04:** no conf, state, logs, key or identity file anywhere under `cos/services`.

## Next

SV1, the stack per root (`cos/services/stack.js`): fresh configuration, its own free ports, and by default only the engines that touch
nothing outside their root.
