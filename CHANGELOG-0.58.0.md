# 0.58.0 — 2026-10-10

James: "okay, lets get something built in idearium. what about a app password style login in idearium from clearglass panel, then we could accounts per hat/repo?"

Mapped first: `docs/2026-10-10-idearium-access-phasemap.spec` (IA0–IA7). IA0–IA4 built here; IA5–IA7 mapped.

## Idearium has a door

- **App passwords** (`idearium/lib/access.cjs`). An app password looks like `nxa_<id>_<secret>`.
  - It is shown once and stored only as a hash.
  - Each one has a label, an optional **hat**, the **repos** it may touch, and its **capabilities**: read, write, admin.
  - Signing in turns a password into a session cookie with the same scope.
- **The capability table is finally enforced.** Idearium has declared a capability for every route (`ROUTE_CAP`) since the start, but nothing checked it. Now every caller using a password is held to it.
  - The wrong capability gets a 403 that names the one it lacks.
  - A repo outside the password's list gets a 403 that names the repos it may touch.
  - This holds in every mode.
- **Who has to sign in** is set by `access.mode`:
  - `open`: nobody (the old behaviour).
  - `origin` (the default): websites and other devices. This machine's own pages and processes don't.
  - `password`: everyone.
- **Websites can no longer drive Idearium.** Before, it answered `Access-Control-Allow-Origin: *`. Now a page on another site is refused with a 403 and gets no CORS answer, and its preflight isn't answered. This is Idearium's part of SD15.
- **Routes:**
  - `GET /api/access/me`
  - `POST /api/access/login`
  - `POST /api/access/logout`
  - `GET`/`POST /api/access/keys`
  - `POST /api/access/keys/:id/revoke`

  Making and revoking passwords needs admin.
- **Command:** `idearium access` / `access keys` / `access new <label> --hat h --repos a,b --caps …` / `access revoke <id>`. An agent can't make or revoke a password; it has to ask the person.
- **Screens:**
  - Settings → **Access**: the mode in words, trusted origins, how long a sign-in lasts, your passwords, making one (shown once, with Copy), and revoking one.
  - `/login.html`: the sign-in page.
  - Every Idearium page goes to the sign-in page when Idearium asks it to, then comes back.
- **Clear Glass signs in for you.** Save the password in Clear Glass's Passwords for `http://127.0.0.1:4800`. At start, Clear Glass signs in and sets the cookie, so every panel showing Idearium is signed in.

## Proof

- `tests/modules/test-idearium-access.test.js` (9/9):
  - the gate's decisions;
  - a live Idearium: a website gets 403 with no CORS, a loopback page gets 200, a scoped password gets 403 on another repo and on writes, and revoking ends its sign-ins;
  - the command rows;
  - Clear Glass's sign-in.
- Clear Glass probe `tests/probe/idearium-access-glass.js` (11/11), covering the whole round trip in Idearium's real pages: make a password in Settings → Access → switch to password mode → sent to sign in → wrong password refused → signed in and back → held to the repo → revoked → sent to sign in again.

## Not yet (mapped)

- A password limited to some repos still sees every repo in the list routes. Only `/api/repos/<uuid>/…` is held to its repos.
- **IA6:** Nexus's own processes don't carry a key yet, so password mode refuses them. The console warns before you switch.
- **IA5:** which ChatGPT or Claude account each repo or hat uses, with fallback to the next account at a limit.
- **IA7:** the hat recorded as the actor in every ledger row.
