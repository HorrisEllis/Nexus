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

read_2026_11_13_the_vault: >-
  cos/vault/ (index 250 lines, store, crypto, audit-log): an encrypted store keyed by entry id holding only { iv, authTag, ciphertext }; the
  names, scopes and grants live apart (SystemMap.vaultKeys), "value is NEVER present in SystemMap or any log"; scopes global, compartment,
  shared (by grant), blueprint. cos/vaultd/ (daemon, server, config): the same vault over local HTTP as its own detached process. Reached
  today by the old `cos vault` CLI; COS's manager (cos/manager/server.js) serves no vault route, so no system can reach it through COS.

decisions:
  AC_D1_where_the_one_place_is:
    status: "DECIDED 2026-11-13 (his): b, COS's vault"
    chosen: '"COS''s vault" — asked with the three readings side by side and the coder''s recommendation (b).'
    by: "his; AXIOMS §5.9 (one owner), §5.15 (Clear Glass down breaks no other's accounts), PC_D12 (COS is the meta-system)"
    status_before: "OPEN — his to settle (do not guess)"
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

phases:
  AC0_what_each_piece_holds:
    layer: foundation
    status: OPEN
    james: '"all of the accounts, cookies, sign in, all of the logins needs to be in one place. its fragmented." · "COS''s vault" (2026-11-13)'
    depends_on: [AC_D1_where_the_one_place_is]
    files: [cos/vault/index.js, cos/spec/vault.spec, docs/atlases/cos-atlas.md]
    does: >-
      Before anything moves: each of the ~40 files read for what it keeps (an account, a site's cookies, a login and password, a provider's
      sign-in state, an API key or token, which agents work signed out), where on disk, its shape, who writes and who reads it. One record
      type per kind in COS's vault with its scope (a provider account: shared, granted to Clear Glass and Guardian; a password: Clear Glass;
      a system secret: that system's compartment). Written as cos/spec/vault.spec; nothing changes on disk.
    proof: "every file of the census named with what it keeps and the vault record it becomes; no kind left without a record type"
  AC1_cos_serves_its_vault:
    layer: backend
    status: OPEN
    depends_on: [AC0_what_each_piece_holds]
    files: [cos/manager/server.js, cos/vault/index.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-vault-routes.test.js]
    does: >-
      COS's manager serves its vault (in its own process, no daemon needed): read, write, list and delete by record type and scope, each
      call naming the system that asks; a system reads only what its scope or a grant allows; every write and read on the audit log, every
      write recorded in Versionium without its value (§17.12, the value never leaves the vault). Command rows `cos vault …`. COS is up
      before any system it starts, so accounts are there when Clear Glass is not.
    proof: "a system reads its own and granted records and is refused another's; a value never appears in the ledger, a log or Versionium; with Clear Glass stopped Guardian still reads a provider account"
  AC2_clear_glass_keeps_through_cos:
    layer: integration
    status: OPEN
    depends_on: [AC1_cos_serves_its_vault]
    files: [clear-glass/src/cookies/vault.js, clear-glass/src/cookies/session-hub.js, clear-glass/src/passwords/vault.js, clear-glass/src/passwords/service.js, clear-glass/src/accounts/login-portal.js, clear-glass/src/security/vault-key.js, clear-glass/src/providers/account-switch.js]
    does: >-
      Clear Glass keeps the sign-in pages and its live browser sessions, but saves and loads accounts, cookies and passwords through COS's
      vault routes. A migration first (§0.3): every record in Clear Glass's two vaults copied into COS's, checked by count and hash, the old
      files kept read-only until he says they can go. Clear Glass's own vault key retires once nothing reads it.
    proof: "after the migration COS's vault holds every account, cookie set and password Clear Glass had (counts equal); a sign-in saved in Clear Glass is read back from COS; the old vault files untouched"
  AC3_one_list_of_accounts:
    layer: integration
    status: OPEN
    depends_on: [AC1_cos_serves_its_vault]
    files: [guardian/lib/agent-registry.js, guardian/lib/account-routing.js, guardian/lib/cg-account-authority.js, guardian/lib/provider-login.js, guardian/lib/provider-attention.js, clear-glass/src/providers/registry.js, lib/account-registry.js, lib/account-identity-index.js, lib/agent-tools/tools/accounts/account-manage.js]
    does: >-
      One list: every account (provider, name, which is the default, which agents work signed out) is a record in COS's vault; Guardian's
      agent registry, account routing and the "Clear Glass account authority" read it from COS; lib/account-registry.js and the identity
      index move or retire (SW_D5, lib is not a system). Which agents work signed out is said once there (AC_D2): Guardian's LOGIN_OPTIONAL
      copy and Clear Glass's flag both read it.
    proof: "adding an account or marking an agent login-optional is one write, seen by Clear Glass and Guardian; no second list left (grep)"
  AC4_system_secrets:
    layer: integration
    status: OPEN
    depends_on: [AC1_cos_serves_its_vault, SW5_orchestrator_into_the_supervisor]
    files: [orchestrator/auth, cos/vaultd/server.js, cos/vaultd/daemon.js]
    does: >-
      The Orchestrator's auth and any API keys or tokens a system keeps move into COS's vault under that system's compartment scope, with
      the Orchestrator's move into the supervisor (SW5). vaultd stays as the second way in for the CLI, the same vault.
    proof: "no secret left in a system's files (a scan for keys and tokens finds none outside the vault); each system still authenticates"
  AC5_the_accounts_page:
    layer: ui
    status: OPEN
    depends_on: [AC2_clear_glass_keeps_through_cos, AC3_one_list_of_accounts]
    files: [cos/ui/accounts/index.html, cos/ui/accounts/page.js, cos/ui/accounts/page.css, cos/manager/contract.json]
    does: >-
      One page in COS: every account and its provider, the default per provider, which agents work signed out, each site's saved sign-in,
      and the audit of who read what. A value is never shown; it can be replaced. Tested in Clear Glass.
    proof: "in Clear Glass, an account added on the page is used by the next job; the audit shows the read"
order: "AC0 → AC1 → AC2 and AC3 side by side → AC5; AC4 with SW5."
