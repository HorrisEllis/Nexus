# Websites use the password manager; a saved login belongs to the account the cookie vault keeps (2026-10-21)

origin: >-
  James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses." With
  screenshots of a site through Snowflake, the Perplexity sign-in window ("Save sign-in to vault") and the Guardian tools.

Build contract: clear-glass/spec/passwords.spec (emerge module format, specDepth 1.0).

## Ground truth (2026-10-21)

- src/passwords/vault.js (PasswordVault) is real: AES-256-GCM in JAA rows under the sealed key of src/security/vault-key.js — the same key
  machinery and store kind as the cookie vault. It has no account on a record.
- plugins/passwords: a userscript reports a password field; onFormDetected autofills the single saved login without asking; its "save" handler
  is not in the manifest, so nothing ever saved a login from a page. Userscripts reach agent windows only.
- Provider tabs (the sign-in window) load no preload; account-switch capture() saves the tab's cookies as the chosen account.

## Decisions

decisions:
  PW0_where_passwords_live:
    status: DECIDED
    question: Where do website logins live, and how are they tied to the cookie vault?
    chosen: >-
      Decided by his axioms (§8.6 reuse, REVERSIBILITY). In the existing PasswordVault (already the cookie vault's store kind and sealed key);
      each login gains accountId, and the cookie vault's "Save sign-in" saves the pending login with the same account. Separate records, one
      key: a person can clear sign-ins without losing passwords and the other way round. Reading of "hook it into the cookie vault", to confirm.

phases:

  PW1_service:
    layer: library
    status: DONE 0.60.186
    depends_on: [PW0_where_passwords_live]
    files: [clear-glass/src/passwords/service.js, clear-glass/src/passwords/vault.js]
    spec: clear-glass/spec/passwords.spec
    blocks: [MOD-PW-SERVICE]
    does: "Pending in memory, offer save/update/none, save with the account, exact-origin fill, linkPending, Never, prefs."
    proof: test-passwords PWT-01..03

  PW2_page:
    layer: integration
    status: DONE 0.60.186
    depends_on: [PW1_service]
    files: [clear-glass/src/preload/passwords.js]
    spec: clear-glass/spec/passwords.spec
    blocks: [MOD-PW-PAGE]
    does: "Every session's preload: find the login form, capture on submit, fill when main says."
    proof: test-passwords PWT-04 (a form in Clear Glass)

  PW3_wiring:
    layer: integration
    status: DONE 0.60.186
    depends_on: [PW2_page]
    files: [clear-glass/src/main/passwords-wiring.js, clear-glass/src/main/index.js, clear-glass/src/providers/account-switch.js, clear-glass/src/preload/index.js]
    spec: clear-glass/spec/passwords.spec
    blocks: [MOD-PW-MAIN]
    does: "Preload on every session; capture/form/fill IPC with the plugin and compartment checks; the window told; Save sign-in links the login."
    proof: test-passwords PWT-05, PWT-06

  PW4_surface:
    layer: surface
    status: DONE 0.60.186
    depends_on: [PW3_wiring, BS13_plugin_settings]
    files: [clear-glass/renderer/shell/passwords.js, clear-glass/renderer/browser.html, clear-glass/renderer/shell/shell.css, clear-glass/plugins/passwords/index.js, clear-glass/plugins/passwords/manifest.json]
    spec: clear-glass/spec/passwords.spec
    blocks: [MOD-PW-SHELL]
    does: "The key in the address bar, Firefox's save panel with the account, the logins to fill; the plugin's page."
    proof: test-passwords PWT-07 (in Clear Glass)
