# cos/services/anonymous — his engines, as COS's networking backend

James, 2026-10-24: "im saying for web servers, dns, firewall, email smtp, like integrating into deployable. i want to use those engines for
test env, web servers, etc all of them" · "this is all the networking backend for anything needed netwroking wise"

This is his anonymousservers.info NEXUS 0.1.0 (anonymousservers-nexus-4-12.zip): a kernel, `nexus.js`, supervising 27 engines (web server,
DNS, firewall, SMTP, TLS, proxy, storage, queue, auth, monitor …) as separate Node processes talking newline-JSON. Spec:
`cos/spec/cos-services.spec`. Phases: `docs/2026-10-24-cos-services-phasemap.spec`. Its own documentation: `README-upstream.md`.

- **As he brought it:** `engines/` (every engine, the SDK `engines/_engine.js`, components, the panel), `install.js`, `package.json`,
  `README-upstream.md`. `UPSTREAM.sha256` holds the upload's hashes; `tests/modules/test-cos-services.test.js` SV-03 proves they match.
- **Changed, only in `nexus.js`, each change marked `COS:` with why:** the root comes from `SERVICES_ROOT` (a stack's own folder); the
  control pipe or socket is named by the root; the orphan sweep kills only the processes its root recorded (it killed every matching
  process on the machine); `db:*` gates are parsed by a strict grammar, never run (engines built them from request input, so a login's
  handle could run code in the kernel).
- **Not carried in:** the upload's `conf/` (it held a DKIM private key, a JWT secret, a billing encryption key and a peer identity), `state/`
  and `logs/`. Each stack writes its own with the engines' `init`. `defaults/` holds what `init` does not make: the vhost templates and
  the default site.
- **Run one by hand:** `SERVICES_ROOT=/some/folder node cos/services/anonymous/nexus.js init`, then `… up webserver dns`, `… status`,
  `… stop`. The stack per root (fresh conf, its own ports, the safe set by default) is SV1, `cos/services/stack.js`.
