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
    superseded_2026_11_13: >-
      James, straight after: "that adds dependancy." Right -- AC_D1 as first written had every system call COS's manager over HTTP for every
      account read, which makes COS a new runtime dependency for things that used to need nothing (exactly what AC_D1's own reading (b) had
      flagged as its "against"). Kept whole (par 0.3), corrected here: "COS's vault" stays the answer, but as a LIBRARY, not a service. Every
      system requires cos/vault/*.js directly, in its own process -- no HTTP call, no COS process has to be running. What COS's manager
      gains instead (AC1, revised) is a thin route onto the SAME files, for its own Accounts page and audit -- showing, never gating.
      This is PIL_D2's own precedent applied here ("a library with a CLI... no server.js, no door", docs/2026-11-06-pillar-phasemap.spec):
      the vault is the kind of system that is not a process.
  AC_D2_one_list_of_agents_signed_out:
    status: "DECIDED by the axioms (§8.6 one source): whichever place AC_D1 picks, which agents work signed out is said once there; Guardian's LOGIN_OPTIONAL copy is read from it, not kept."
  AC_D3_an_encrypted_compartment_not_a_service:
    status: "DECIDED 2026-11-13 (his), by the superseded_2026_11_13 note above"
    chosen: "what about a encrypted compartment as a database like snowflake uses."
    chosen_full: >-
      Read and agreed as: records are never changed once written (each write is a new encrypted file; a small manifest points at the
      current ones -- history for free, no separate snapshot step); sharing a record means wrapping ITS key with the other system's key,
      never copying the value; one key per system, a key tree under one root. Built this slice: the root-key half only (AC6, the key
      slots a root key is wrapped under). NOT built: the per-record key tree, the append-only manifest, or sharing by key-wrap -- cos/
      vault/store.js still rewrites its one store.json file in place. Said, not silently dropped: real further work, mapped as AC1's
      remaining proof, not finished with AC6.
  AC_D4_sign_in_unlocks_it:
    status: "DECIDED 2026-11-13 (his)"
    chosen: "what about a sign in like an account? then cos' vault keeps a backup of the key?"
    chosen_full: >-
      Yes -- built as AC6. "what about an encrypted file that can use github as a backup? or windows authentication? backup codes? like
      rsa2048? or a keypair?" read as key SLOTS (BitLocker/LUKS's own idea, named to him and agreed): any one slot's secret opens the same
      root key, so losing one costs nothing while another still works. Built (AC6): a password slot and a recovery-code slot (the backup
      codes he asked about), generic -- openSlots tries a secret against every slot, not by a slot's name, so a slot added later needs no
      new unlock code. NOT built, said: a Windows Hello/DPAPI slot (needs a native hook outside plain Node -- cos/vault/crypto.js's own
      header already flags the same gap for TPM/DPAPI binding of today's single key file); a recovery-keypair slot (X25519, the coder's
      reading -- smaller, faster than RSA, the modern default; RSA-3072 the floor if it must be RSA; to confirm); GitHub as a backup
      TARGET for the encrypted files (AC_D5).
  AC_D5_backups_the_rewind_system_and_a_finding:
    status: "DECIDED 2026-11-13 (his), with a real finding along the way"
    chosen: "okay, so use the rewind system to take backups"
    reading_to_confirm: >-
      Clear Glass already has a system called rewind (clear-glass/src/rewind/engine.js): a browser session's time machine -- it snapshots
      a tab's URL, cookies and storage every few seconds so a tab can step back. It is NOT the whole-system VM-style rewind he described
      elsewhere (RW1, docs/2026-10-02-workshop-codex-rewind-phasemap.spec, LATER -- that code does not exist). The coder's reading of "use
      the rewind system" here: not literally clear-glass/src/rewind/engine.js (wrong tool, see the finding below), but its IDEA -- never
      overwrite, keep points you can go back to -- applied as AC_D3's append-only compartment (history for free from never overwriting a
      record) and as real off-machine backups: the encrypted compartment's files (never an unwrapped key) copied to a private GitHub repo
      and to a second local copy. NOT built this slice.
    found: >-
      clear-glass/src/rewind/engine.js's own header says it now persists full localStorage/sessionStorage to its snapshot file -- "auth
      tokens/app state in storage are now persisted to disk in the snapshot file" -- in PLAIN JSON, no encryption. That is itself a leak
      of the exact sessions AC2 is meant to protect, independent of anything else in this map. Not fixed in this slice: tracked as AC9.

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
  AC1_the_vault_as_a_library:
    layer: backend
    status: "OPEN -- AC6 (its key-slot half) BUILT 0.60.507; the record read/write/scope/audit layer below it still to build"
    depends_on: [AC0_what_each_piece_holds, AC6_key_slots]
    files: [cos/vault/index.js, cos/manager/server.js, cos/manager/contract.json, idearium/cli/route-commands.js, tests/modules/test-cos-vault-routes.test.js]
    does: >-
      AC_D3/AC_D1 superseded: every system requires cos/vault/*.js directly (no HTTP, no COS process needed to read or write an account)
      -- read, write, list and delete by record type and scope, the system asking named every time; a system reads only its own and what
      a grant allows; every write and read on the audit log, every write recorded in Versionium without its value. COS's manager gains a
      route onto the SAME files for its own Accounts page (AC5) and the audit view -- showing, never the only way in. Command rows
      `cos vault ...` for a person, reading the same library.
    proof: "a system reads its own and granted records and is refused another's with no COS process running; a value never appears in the ledger, a log or Versionium; COS's Accounts page shows the same records a direct read does"
  AC6_key_slots:
    layer: backend
    status: "BUILT 0.60.507 -- cos/vault/key-slots.js, cos/vault/keyring.js; crypto.js gained encryptWithKey/decryptWithKey/primeMasterKey (additive, its existing encrypt/decrypt unchanged)"
    depends_on: []
    files: [cos/vault/key-slots.js, cos/vault/keyring.js, cos/vault/crypto.js, cos/foundation/constants.js, tests/modules/test-cos-vault-key-slots.test.js]
    does: >-
      AC_D4: the vault's real root key is never a plain file (cos/vault/crypto.js's own header already named this as the vault's one
      honest weakness). It is wrapped under key slots -- a password slot and a recovery-code slot built now, a future slot (Windows
      Hello, a recovery keypair) the same shape. unlock({password}) migrates an existing plain master.key with no re-encryption (the AES
      key's bytes are unchanged, only how it is stored changes) or creates a fresh vault; openSlots tries one secret against every slot,
      never by a slot's name, so a slot added later needs no new unlock code (a real bug, found and fixed before it shipped: an earlier
      version matched a secret to a slot by name, so a third slot could never open at all).
    proof: "test-cos-vault-key-slots.test.js KS-01..06, KR-01..07, 13/13: wrong secret fails closed with one generic reason; a tampered slot never decrypts; the recovery code opens the same key as the password, independently; migrating a plain master.key keeps every entry already encrypted under it readable; a corrupted keyring file is refused, never silently overwritten; a slot added after the fact opens with its own new secret"

  AC2_clear_glass_keeps_through_cos:
    layer: integration
    status: OPEN
    depends_on: [AC1_the_vault_as_a_library]
    files: [clear-glass/src/cookies/vault.js, clear-glass/src/cookies/session-hub.js, clear-glass/src/passwords/vault.js, clear-glass/src/passwords/service.js, clear-glass/src/accounts/login-portal.js, clear-glass/src/security/vault-key.js, clear-glass/src/providers/account-switch.js]
    does: >-
      Clear Glass keeps the sign-in pages and its live browser sessions, but saves and loads accounts, cookies and passwords through cos/vault's
      library (AC1), in its own process -- no COS route required. A migration first (§0.3): every record in Clear Glass's two vaults copied into COS's, checked by count and hash, the old
      files kept read-only until he says they can go. Clear Glass's own vault key retires once nothing reads it.
    proof: "after the migration COS's vault holds every account, cookie set and password Clear Glass had (counts equal); a sign-in saved in Clear Glass is read back from COS; the old vault files untouched"
  AC3_one_list_of_accounts:
    layer: integration
    status: OPEN
    depends_on: [AC1_the_vault_as_a_library]
    files: [guardian/lib/agent-registry.js, guardian/lib/account-routing.js, guardian/lib/cg-account-authority.js, guardian/lib/provider-login.js, guardian/lib/provider-attention.js, clear-glass/src/providers/registry.js, lib/account-registry.js, lib/account-identity-index.js, lib/agent-tools/tools/accounts/account-manage.js]
    does: >-
      One list: every account (provider, name, which is the default, which agents work signed out) is a record in cos/vault; Guardian's
      agent registry, account routing and the "Clear Glass account authority" read it from COS; lib/account-registry.js and the identity
      index move or retire (SW_D5, lib is not a system). Which agents work signed out is said once there (AC_D2): Guardian's LOGIN_OPTIONAL
      copy and Clear Glass's flag both read it.
    proof: "adding an account or marking an agent login-optional is one write, seen by Clear Glass and Guardian; no second list left (grep)"
  AC4_system_secrets:
    layer: integration
    status: OPEN
    depends_on: [AC1_the_vault_as_a_library, SW5_orchestrator_into_the_supervisor]
    files: [orchestrator/auth, cos/vaultd/server.js, cos/vaultd/daemon.js]
    does: >-
      The Orchestrator's auth and any API keys or tokens a system keeps move into cos/vault under that system's compartment scope, with
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
  AC7_fallback_routing_and_one_popup:
    layer: integration
    status: OPEN
    james: 'his 2026-11-13 "fallback routing, popup for the login missing, im sick of logins being seperated. can this be optional?"'
    depends_on: [AC1_the_vault_as_a_library, AC3_one_list_of_accounts]
    files: [guardian/lib/dispatch-ladder.js, clear-glass/src/providers/attention.js, guardian/lib/provider-attention.js, cos/vault/index.js]
    does: >-
      A job asking for an agent reads the vault for which accounts are actually signed in right now and falls back to the next ready one
      instead of surfacing a popup first; the popup (already real, clear-glass/src/providers/attention.js) becomes the last resort, one
      flow fired from the vault's own missing-credential event, not a different popup per system. Optional per provider (his question,
      answered yes): a flag on the account record, default auto-fallback, settable to always-ask.
    proof: "ChatGPT signed out, Claude and Gemini ready: a job completes on one of them with no popup; a provider flagged always-ask still asks; the popup fires once for a given missing credential, from whichever system noticed first"
  AC8_credential_types:
    layer: integration
    status: OPEN
    james: 'his 2026-11-13 "i meant like login with google, apple, github,etc. though i do want support for api keys."'
    depends_on: [AC1_the_vault_as_a_library]
    files: [cos/vault/index.js, clear-glass/src/contexts/google-signin.js, guardian/lib/provider-login.js]
    does: >-
      Each account record is typed: a browser session (cookies -- the result of a normal sign-in, OR of "Continue with Google/Apple/
      GitHub" at the provider's OWN page, which Clear Glass already drives, src/contexts/google-signin.js exists), or an app password/
      API key (his ask, preferred over scraping a session where the provider supports one -- fewer session failures, revocable without
      touching the real password). Nexus does not become an OAuth CLIENT of Google/Apple/GitHub itself -- reading to confirm: "login with
      google/apple/github" is the provider's own federated sign-in button, already reachable by the browser automation that exists; the
      vault's job is to hold the resulting session the same as any other, not to run a second sign-in flow of its own.
    proof: "a provider account signed in through its own Google button is one vault record, read back like a password-based one; an API-key record is used for a job with no browser tab at all"
  AC9_rewinds_plaintext_tokens:
    layer: library
    status: "BUILT 0.60.508 -- rewind encrypts through cos/vault when COS_VAULT_PASSWORD is set (his: 'just enough to get it integrated'); plain JSON unchanged when it is not; an old plain snapshot still loads"
    james: "found answering his 2026-11-13 'use the rewind system to take backups' -- AC_D5"
    depends_on: []
    files: [clear-glass/src/rewind/engine.js]
    does: >-
      clear-glass/src/rewind/engine.js writes full localStorage/sessionStorage, which can hold auth tokens, to a plain JSON file per
      agent under its rewind folder. Once cos/vault is reachable as a library (AC1) with no COS process required, rewind's writer
      encrypts through it instead of fs.writeFileSync -- a real, independent fix, not blocked on the rest of this map.
    proof: "a rewind snapshot file on disk holds no readable token or cookie value; restoring a tab from it still works"
order: "AC0 → AC6 (built) → AC1 → AC2, AC3, AC9 side by side → AC7, AC8 → AC5; AC4 with SW5."

# ── ADDENDUM 2026-11-15 — AC2 expanded: the live session is the one truth; the login loop in ChatGPT ──
# James, 2026-11-15: "the cookies supposed to be one source of truth for all of clearglass" · "can you have guardian and the agents use the
# primary accounts and cookies. also a single source of truth. im sick of the login loop in chatgpt"
# Read on his machine (Clear Glass :7702 /providers/chatgpt/account and CDP :9333, cookie names, expiry and hashes only, never values):
#   - persist:ncp-chatgpt and the default session hold the identical session token (same hash): the hub mirrors, one jar per provider holds.
#   - chatgpt.com sends that token to /auth/login: dead at OpenAI. "ChatGPT 1" is current and dispatch (the primary: its only account).
#   - the loop, in clear-glass/src/providers/account-switch.js: providerHost.beforeLoad runs sync() before EVERY load of the provider tab;
#     with the tab "not signed in" (auth 0, as every page of a sign-in in progress is) it restores the account's saved copy, replace:true,
#     over the sign-in being made, and the page lands on "Log in" again. And settled() counts a present cookie as signed in, so the dead
#     token is saved back as "ChatGPT 1" (seen: saved 18:54 while the tab sat on /auth/login).
# Built, by his rule (one source of truth) and the axioms (§8.6 one source; REVERSIBILITY a snapshot before anything is cleared; §1.2 said):
#   - sync(): when the tab already runs as the dispatch account, its live session IS that account's sign-in: never restored over, signed in
#     or not; a signed-out one says "sign in once in the tab". The saved copy is used only to switch to a different account.
#   - _tabAuth(): a provider window on its own sign-in page is signed out, whatever cookies it holds (the site's word over the cookie's).
#     So settled() stops saving a dead token; it snapshots the account's saved copy and removes it, as it already does on a sign-out.
# Guardian and the agents: they already dispatch as resolveAccountForDispatch's account (explicit, else the default, else the earliest
# linked); for chatgpt that is "ChatGPT 1". Unchanged. AC2 (storage through COS's vault) and AC3 (one list of accounts) stay open.

# ── 2026-11-17 — his: Clear Glass works like a normal browser: one cookie jar, a different one only for a different profile ──
# James, 2026-11-17: "im saying it should switch accounts in clearglass. like cookies, accounts, logins, stop being seperate, and work like a
# normal browser. it should not have different cookies unless its a different profile." · "this is meant to be a system to replace claude."
# What is there today (read 2026-11-15/17): a jar per provider (persist:ncp-<provider>) mirrored live into the default session for that
# provider's sites; account windows in their own jars (persist:agent-acct-<id>); a vault that swaps an account's cookies into the provider jar.
# His model, as the coder reads it (to confirm when mapped): ONE jar for every tab and agent (like Chrome's one profile); a second jar only for
# a second profile; switching account = switching profile, not swapping cookies inside one jar. Fits AC_D1 (one place: COS's vault) and AC2/AC3.
# Not built. Recorded with today's live picture: ChatGPT and DeepSeek signed out, so the build's ladder left them off.

# ── ADDENDUM 2026-11-18 — his: profiles the source of truth; bookmarks route chats; hats per page and per site (recorded only; after Ollama and gates) ──
# James, 2026-11-18: "what if we use clearglass to use agent chats as a cli interface. like a iframe or api? Like the way idearium has a hat per repo.
# cos ui has one per page in cos iu? that way copilot is aware of the page it's on. like hats could become location based models. like i want to be
# able to set urls for chats. like claude code. what if we interconnect bookmarks that hook into the account for the website and the urls for chats.
# we could bookmarks as a chat routing system. like bookmarks have a bookmark id or uuid that the system can use to id the bookmark which hooks into
# an account or profile id. account or cookie id or login id in clearglass. like need one source of truth for all cookies, logins, accounts, etc per
# profile also like firefox. the profiles are the source of truth. multiprofile setup is already in clearglass. each profile has a id, each account
# or login has an id. how ever firefox profiles work but with ids or uuids for the backend for nexus and guardian to route to for intent and
# fallback. the ui shouldn't use a different profile. profiles can be compartments, which can link to hats, which can also have per site models to
# make the agents aware per site. this should drastically improve the agents. then the ui needs consolidating. bookmarks and login detection need
# updating. accounts can be used across profiles. need bookmark folders and manager like firefoxs'" · "first ollama, intelligent gates that compound."
# The coder's reading, to confirm before any phase is written (do not guess):
#   - a profile (its uuid) is the one source of truth for its cookies, logins and accounts; an account (its uuid) can be used by several profiles;
#   - a bookmark (its uuid, in folders, a manager like Firefox's) names a URL, the account and profile it opens with, and can be a chat route:
#     Guardian and Nexus route an intent to a bookmark, with fallbacks;
#   - an agent chat in Clear Glass reachable as a command line (iframe or API: which is his to say);
#   - a hat per COS page and per site ("location based models"), so Copilot knows where it is; a profile can be a compartment linked to hats;
#   - the UI uses the same profile as the agents; UI consolidation, bookmark and login detection updated after.
# Order (his): after Ollama and intelligent gates that compound.

# ── ADDENDUM 2026-11-22 (map, before code) — AC_D1 changed by him: Clear Glass owns cookies and accounts; a profile is their source of truth (AC10) ──
# James, 2026-11-22: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles". Asked Clear Glass or COS's vault
# (his 2026-11-13 AC_D1), with what each costs: "yes clearglass." AC_D1 is kept (§0.3) and superseded: AC1 to AC3's "through COS's vault" no longer apply to
# accounts and cookies. Stands on his 2026-11-17 ("it should not have different cookies unless its a different profile") and 2026-11-18 ("the profiles are
# the source of truth ... each profile has a id, each account or login has an id ... accounts can be used across profiles"). Found: Clear Glass has no
# browser profile today ("profiles" in its code are autofill profiles and per-account provider tabs).
decisions_addendum_2026_11_22:
  AC_D6_clear_glass_owns_it:
    status: "DECIDED 2026-11-22 (his): Clear Glass, superseding AC_D1 for cookies and accounts"
    cost_said: "other systems cannot read accounts while Clear Glass is down, unless an encrypted backup to COS's vault is added later"
phases_addendum_2026_11_22:
  AC10_profiles_the_source_of_truth:
    status: OPEN
    depends_on: [AC_D6_clear_glass_owns_it]
    james: '"i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles" · "yes clearglass." (2026-11-22)'
    files: [clear-glass/src/profiles/profiles.eg, clear-glass/src/profiles/built, clear-glass/src/profiles/test/profiles.test.eg, clear-glass/src/options/store.js, clear-glass/src/main/index.js, idearium/cli/route-commands.js]
    does: >-
      Slice a: a profile is a record with an id, one jar and its accounts. The rules are Emerge's (profiles.eg); Clear Glass's account store keeps the
      answer; routes /profiles. On first read every account is placed: in Default (the normal session), or in its own profile when Default already holds
      that provider, since one jar holds one sign-in per site. No cookie moves. Slice b (after his yes on a preview): the Profiles screen. Slice c: every
      tab, provider tab and agent runs in its profile's jar, each sign-in copied in first, old jars kept until he confirms. Slice d: Guardian routes to a
      profile id, and the other account lists read Clear Glass's.
    proof: "a: eg test; the store and routes on a throwaway store; c: on his machine, every signed-in provider still signed in after the move"
    axioms: "§10.3 one truth per kind of data, §5.15 one owner, §0.3 old jars kept, §8.6 his account store and per-account tabs reused"
# ADDENDUM 2026-11-22 (0.60.636) — AC10: James: "okay profiles are in clearglass. no coupline". The first slice started Emerge's toolchain from Emerge's folder at run time.
# Now the rules are compiled once (eg build --standalone) into clear-glass/src/profiles/built and run in Clear Glass's own process: no other system's folder is read,
# Emerge may be absent. Rebuild after changing profiles.eg. Other systems reach profiles only through Clear Glass's /profiles routes.
# Found the same day, read from its store (counts only): on 2026-11-20 at 13:17 a Clear Glass process wrote its defaults over the store: accounts 8→0, listeners 1→0, shortcuts 2→0.
# The last good copy (2026-11-18, 8 accounts) is still in the store's journal. Not restored yet: his yes first.
# ADDENDUM 2026-11-22 (0.60.637) — AC10 slice b. James, 2026-11-22: "i just clearglass to have one source of truth for cookies and accounts, hooked into the profiles" · "okay profiles are in clearglass. no coupline" · "Yes, build it".
# Built: the Profiles screen in Clear Glass Settings (renderer/settings/sections/profiles.js, .css; IPC profiles:*; preload cg.profiles). No Open button until slice c moves tabs and agents onto profile jars.
# The 2026-11-20 wipe, cause found: tests/modules/test-guardian-agent-registry.js moved only HOME, but on Windows the store path comes from APPDATA, so the test opened his real store. Its unread store saved its defaults over everything (the agent it saved, persist-check @ d.com, is that test's).
# The coder repeated the fault on 2026-11-22: running tests/modules/clear-glass-accounts.test.js twice added 11 test accounts to his real store. Found within minutes; the restore removed them.
# Fixed: a test process cannot open the real Clear Glass store or import its legacy file (src/storage/jaa.js), and a store that was never read cannot save over what is on disk (src/options/store.js).
# Restored from the last record before the wipe: accounts 8, listeners 1, shortcuts 2. Backup: %APPDATA%/.clear-glass/backups/options-before-restore-2026-11-22. Not restored: other settings that test removed (url bar sizes, pinned and disabled plugins, chatCapture, floatCli, netPolicy); his call.
# ADDENDUM 2026-11-22 (0.60.638) — AC10, Logins. James, 2026-11-22: "Now all of the rest of them. You know... like an actual browser." · "I didn’t say account providers. I said logins."
# Each profile lists every site with a sign-in cookie in its jar or a saved password, with a sign-out per site. The rule is logins()/signs_in() in src/profiles/profiles.eg (names only, compiled into src/profiles/built).
# Door: IPC profiles:logins, profiles:signOut; routes GET /profiles/:id/logins, DELETE /profiles/:id/logins/:site (a person's only); command clear-glass.profile-logins.
# Limits: sign-in is judged from cookie names, so a listed site may be expired and an unusual one may be missed. Passwords are not created: only what the vault holds is shown. Sign-out on a provider's site also reaches its provider tab through the session hub.
# ADDENDUM 2026-11-22 (map, before code) — AC10 slice c, one jar per profile. James, 2026-11-22: "Once source of truth." · earlier, 2026-11-17: "it should not have different cookies unless its a different profile."
# What exists today: normal tabs in the default session; persist:agent-<id> per tab; persist:ncp-<provider> per provider, with the session hub mirroring sign-ins; persist:ncp-<provider>~<account>; old persist:mesh-*; and the vault's encrypted copies. 412 jars, 9 holding data.
# Hazards read from the code, each a condition of the build:
#  H1. account-switch restores with replace:true, which clears the whole session. On a profile's jar that would erase every login in it. In a profile jar an account is never swapped: a job for another account goes to the profile holding that account (profile-tabs and Guardian's profile-lanes already run a tab per account).
#  H2. ProviderHost sets the session's one onHeadersReceived listener. On a shared jar it would replace the listener of whatever else uses that session, so the hooks must be composed first (as requestHook already does for sent headers).
#  H3. ctxMgr sets a persona user agent per partition. One jar must present one browser identity, or sites see one sign-in from two browsers.
#  H4. The session hub's mirror has no job once there is one jar; it is retired only after the move is confirmed.
# Order: c1 the jar resolver (Emerge rule, one door) and compose the hooks; c2 tabs, provider tabs, mesh and login portal ask the resolver; c3 copy each sign-in into its profile jar, old jars untouched; c4 he confirms, then the hub and old jars retire. Proof on a real Electron session with a throwaway userData before any deploy.
# AC_D7 (OPEN, his): do agents share the Default profile with his personal logins (email, Facebook, GitHub), or run in their own Agents profile holding only the AI logins? Both are one source of truth per profile. Coder's recommendation: an Agents profile, so a page an agent reads cannot act with his personal sign-ins (§5.9 sovereignty).
