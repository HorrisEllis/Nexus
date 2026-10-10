spec:
  meta:
    name:     idearium-access
    version:  1.0.0
    date:     2026-10-10
    release:  0.57.1 (base)
    uuid:     nexus-idearium-access-phasemap-v1-0000-2026-1010-jamesbrooks-001
    owner:    idearium (the door, its keys) · clear-glass (signs in, holds the password and the provider accounts)
    status:   "MAPPED 2026-10-10, then IA0–IA4 built (0.58.0); IA5–IA7 open"
    voice: >
      The ideas, the direction and the calls are James's. Each phase's `james:` is his, verbatim. `does:` is the coder's
      reading, his to correct. `pushback:` is where the coder thinks the plan as said has a hole — his to decide.
    axioms:   docs/AXIOMS-v3.1.md — §1.1 nothing pretends, §1.2 nothing silently fails, §0.3 nothing lost, §3.3 map before build
    origin: >
      James, 2026-10-10: "okay, lets get something built in idearium. what about a app password style login in idearium
      from clearglass panel, then we could accounts per hat/repo?"
    read_first: >
      docs/2026-10-10-idearium-solid-phasemap.spec SD15 (any website can drive Nexus — found and proven live);
      idearium/api/index.js CAPS + ROUTE_CAP (a capability declared for every route since the start, never checked —
      a claim with nothing behind it until IA0); lib/account-registry.js (provider account slots, CA7);
      clear-glass/src/accounts/login-portal.js (Clear Glass owns provider sign-in — James 2026-09-23 "yes clearglass");
      clear-glass/src/passwords/vault.js (OS-sealed passwords); auth/ (the RSA remote-CLI layer — heavier, for a remote
      client; not reused here because a person typing an app password into a page is a different door).
  found_by_reading:
    - "ROUTE_CAP maps ~400 routes to read_ideas / write_ideas / search_ideas / admin and its comment says 'a key must have that capability to call it' — nothing ever read it. IA0 makes it true for every keyed request instead of writing a second permission table."
    - "Idearium answered Access-Control-Allow-Origin: * (api.cors_origin) on every reply: any page could read it and post to it."
    - "Clear Glass shows Idearium as a page from http://127.0.0.1:4800 — the same origin as the API. A cookie for 127.0.0.1 reaches it from any Nexus page (cookies ignore the port), so one sign-in covers every panel."
  pushback: >
    "Accounts per hat/repo" is two different things, and keeping them apart is the design. (1) WHO may act on Idearium:
    an app password, scoped to some repos, some capabilities and a hat — that is IA0–IA4. (2) WHICH ChatGPT/Claude account
    an agent uses for a repo or hat — Clear Glass owns those sign-ins (his 2026-09-23 call), so Idearium never holds a
    provider password; it holds only the binding (repo → account id) — that is IA5. Also: on one person's machine a
    password on every local call is friction for little gain; the real threats are websites (SD15) and other devices
    (the tablet, remote desktop). So the default asks for a password only from those, and "password" mode — everything
    signs in — is an option, not the default.
  phases:
    IA0_the_door_checks_who_is_asking:
      layer: backend
      systems: [idearium]
      status: "DONE 0.58.0"
      james: '"what about a app password style login in idearium"'
      depends_on: []
      files: [idearium/lib/access.cjs, idearium/api/index.js, idearium/lib/config-core.cjs]
      does: >-
        One gate before every API route. An app password is `nxa_<id>_<secret>`, shown once, stored only as a hash
        (idearium/data/access/keys.json). Each carries a label, an optional hat, the repos it may touch ('*' or a list)
        and its capabilities (the existing CAPS). A keyed request must hold the route's ROUTE_CAP (admin holds all) and,
        on /api/repos/<uuid>/…, that repo — else 403 naming what is missing. Sign-in turns a password into an HttpOnly,
        SameSite=Strict cookie (nx_idearium) with the same scope. Who needs one, by access.mode: open (nobody — as
        before) · origin, the default (a request from a website — an Origin that is not loopback or listed in
        access.trusted_origins — or from another device) · password (every request but health and sign-in). CORS answers
        only a trusted origin or a signed-in caller, never '*'. Every refusal says why and how to get in.
      proof: "tests/modules/test-idearium-access.test.js IA-01…IA-06 (the gate's decisions) and IA-07 (a live Idearium: evil origin 403, loopback page 200, scoped key 403 on another repo)"
    IA1_the_routes:
      layer: api
      systems: [idearium]
      status: "DONE 0.58.0"
      james: '"app password style login"'
      depends_on: [IA0_the_door_checks_who_is_asking]
      files: [idearium/api/index.js, idearium/interaction-contract.json]
      does: >-
        GET /api/access/me (who this caller is, the mode) · POST /api/access/login {password} · POST /api/access/logout ·
        GET /api/access/keys (no secrets) · POST /api/access/keys {label, hat?, repos?, caps?} → the password once ·
        POST /api/access/keys/:id/revoke. Keys are made and revoked only by an admin caller (this machine, or a signed-in
        admin). Every key made, used to sign in, or revoked is a row in idearium/data/access/ledger.jsonl.
      proof: "IA-07"
    IA2_the_command:
      layer: command
      systems: [idearium, copilot]
      status: "DONE 0.58.0"
      james: '"then we could accounts per hat/repo"'
      depends_on: [IA1_the_routes]
      files: [idearium/cli/route-commands.js]
      does: "`idearium access` (who am I), `access keys`, `access new <label> [--hat h] [--repos a,b] [--caps read_ideas,write_ideas]`, `access revoke <id>` — the routes as commands, so copilot and every agent have them through nexus.command."
      proof: "IA-08"
    IA3_the_screens:
      layer: ui
      systems: [idearium]
      status: "DONE 0.58.0"
      james: '"from clearglass panel"'
      depends_on: [IA1_the_routes]
      files: [idearium/ui/settings.html, idearium/ui/login.html]
      does: >-
        Settings → Access: the mode, the app passwords (label, hat, repos, capabilities, last used), make one (shown once,
        with copy), revoke one. /login.html: paste a password, signed in, back to where you were. In password mode a page
        that is refused is sent to the login page.
      proof: "tests/probe/idearium-access-glass.js in Clear Glass"
    IA4_clear_glass_signs_in_for_you:
      layer: ui
      systems: [clear-glass]
      status: "DONE 0.58.0"
      james: '"app password style login in idearium from clearglass panel"'
      depends_on: [IA1_the_routes]
      files: [clear-glass/src/accounts/idearium-login.js, clear-glass/src/main/index.js]
      does: >-
        The app password lives in Clear Glass's PasswordVault (OS-sealed) under http://127.0.0.1:4800. At start, Clear
        Glass signs in with it and puts the session cookie into its own browser session, so every panel that shows
        Idearium is signed in and nobody types it. No password saved → nothing happens (origin mode needs none).
      proof: "IA-09 (the module, with Idearium live and a stub cookie jar)"
    IA5_provider_accounts_per_hat_and_repo:
      layer: backend
      systems: [idearium, guardian, clear-glass, copilot]
      status: "OPEN"
      james: '"then we could accounts per hat/repo" · earlier, 2026-10-10: "need account fallback for fallback routing and token limits"'
      depends_on: [IA0_the_door_checks_who_is_asking]
      files: [lib/account-registry.js, lib/agent-router.js, lib/pipeline-routing.js, idearium/repo/settings]
      does: >-
        A repo or a hat names the provider accounts its agents use, in order ("chatgpt:work, then chatgpt:personal").
        Routing takes the first that is signed in and not at its limit (the economy ledger already learns limits per
        provider; this makes it per account), and moves to the next on a limit — the account fallback he asked for.
        Idearium holds the binding only; the sign-in stays in Clear Glass (login-portal accountId).
      pushback: "Needs Clear Glass's per-account tabs (agent-mesh partitions) live on his machine; until then it can be built and proven with two fake tabs (tests/sim/fake-tab.js TAB=…) but not felt."
      proof: "a repo bound to two accounts: the first reports a limit, the job lands on the second, the repo's card says which"
    IA6_every_local_caller_carries_the_key:
      layer: backend
      systems: [copilot, guardian, idearium, core]
      status: "OPEN"
      james: '"app password style login"'
      depends_on: [IA0_the_door_checks_who_is_asking]
      files: [idearium/data/access/local.key, copilot/server.js, guardian/server.js, idearium/cli/index.js, nexus MCP server]
      does: "Idearium writes a machine key (0600) at start; every Nexus process on this machine sends it. Then password mode can be on with the whole stack working, and a process that is not Nexus's cannot drive Idearium."
      proof: "password mode on: the loop sim (tests/sim/loop.js) runs end to end; a curl with no key is 401"
    IA7_the_hat_is_the_actor:
      layer: backend
      systems: [idearium]
      status: "OPEN"
      james: '"accounts per hat/repo"'
      depends_on: [IA0_the_door_checks_who_is_asking]
      does: "A keyed request's hat (or label) is the actor in every ledger row it causes — specs, phases, applies, versions — so the history says which hat did it."
      proof: "an apply made with a hat's key shows that hat in the repo's activity and version"
