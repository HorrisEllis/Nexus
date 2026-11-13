# docs/2026-11-13-one-place-for-accounts-phasemap.spec — every account, cookie, sign-in and login in one place.
# Mapped only; nothing built by this map. The ask is James's; the census and the readings are the coder's.

origin:
  date: 2026-11-13
  james: '"also gemini doewsnt seem like it needs to be signed in. also all of the accounts, cookies, sign in, all of the logins needs to be in one place. its fragmented." (2026-11-13, with two screenshots: Clear Glass''s Claude and ChatGPT tabs, ChatGPT signed out, the Guardian picker asking for the input box on both)'
  done_the_same_day: "Gemini registered loginOptional (clear-glass/src/providers/registry.js and guardian/lib/provider-attention.js LOGIN_OPTIONAL), 0.60.505"

census_2026_11_13: >-
  Read from the tree (git ls-files; code only), about 40 files in five systems:
  Clear Glass — sign-in: src/accounts/login-portal.js, for-site.js, idearium-login.js, src/contexts/google-signin.js, src/preload/google-signin.js;
  cookies: src/cookies/vault.js, src/cookies/session-hub.js, src/providers/account-switch.js; passwords: src/passwords/service.js,
  src/passwords/vault.js, src/main/passwords-wiring.js, src/preload/passwords.js, plugins/passwords; the key: src/security/vault-key.js; pages:
  renderer/library/sections/accounts.js, passwords.js, renderer/settings/sections/accounts.js, renderer/shell/passwords.js.
  COS — a secrets vault: cos/vault/ (index, store, crypto, audit-log), cos/vaultd/ (daemon, server, config), cos/nodes/vault.js, vaultd.js,
  cos/host/gates/vault.js, cos/cli/commands/vault.js, vaultd.js.
  Guardian — guardian/lib/account-routing.js, cg-account-authority.js, provider-login.js, and accounts inside guardian/lib/agent-registry.js.
  lib/ — lib/account-registry.js, lib/account-identity-index.js, lib/agent-tools/tools/accounts/account-manage.js.
  Orchestrator — orchestrator/auth (3 files).
  So: three vaults (cookies, passwords, COS's secrets), at least four lists of accounts (Clear Glass's portal, Guardian's agent registry,
  lib/account-registry.js, the identity index), and two copies of which agents work signed out (Clear Glass's registry and Guardian's
  LOGIN_OPTIONAL, which says it "mirrors" the first).
  An earlier phase (FM economy, docs/2026-10-02-emerge-field-memory-build-phasemap.spec, the coder's wording): "Clear Glass keeps owning
  sign-in and the vaults; Guardian publishes each account as a node (E13)." COS's vault came after and was not joined.

decisions:
  AC_D1_where_the_one_place_is:
    status: "OPEN — his to settle (do not guess)"
    readings:
      a_clear_glass: >-
        The browser owns every account, cookie, password and sign-in (one vault, its key); Guardian, lib/ and the Orchestrator read through
        Clear Glass's routes; COS's vault keeps only system secrets or folds in. For: sign-in and cookies already live there, nothing moves far.
        Against: Clear Glass down (it is the heaviest system, often held back for memory) means no account for anything.
      b_cos_vault: >-
        COS's vault (encrypted, with an audit log, already a daemon) holds every account, cookie, password and secret; Clear Glass keeps the
        sign-in pages and its live cookie jar but saves and loads through COS's vault routes; Guardian routes by accounts read from COS.
        For: COS is up before any system it starts, so accounts are there when nothing else is; one key, one audit log; matches his
        "cos is the meta system" (PC_D12). Against: cookies change often, so Clear Glass writes through a route, and the move is larger.
      c_its_own_system: "An Accounts system (sovereign, its own server.js and data). Against: a fifteenth system, and his \"COS must not become a blob\" read the other way."
    coder_recommendation: "b, COS's vault: accounts must be there when Clear Glass is not, and one key and one audit log is the 'one place' he describes. Said, not chosen."
  AC_D2_one_list_of_agents_signed_out:
    status: "DECIDED by the axioms (§8.6 one source): whichever place AC_D1 picks, which agents work signed out is said once there; Guardian's LOGIN_OPTIONAL copy is read from it, not kept."

phases: {}
order: "Phases are written after AC_D1 is his."
