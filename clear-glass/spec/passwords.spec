spec:

  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  # clear-glass/spec/passwords.spec — websites use the password manager: offer to save a login when you sign in, fill it
  # when you return, every saved login tied to the account whose sign-in the cookie vault keeps. Format: emerge module spec
  # (specDepth 1.0, no BLACK, invariants valid). Phases: docs/2026-10-21-passwords-phasemap.spec.
  # ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

  meta:
    name:        passwords
    version:     1.0.0
    author:      james-brooks
    created_at:  2026-10-21T00:00:00Z
    status:      specced
    uuid:        nexus-cg-passwords-spec-v1-0000-2026-1021-jamesbrooks-001
    origin: >-
      James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."
      The ask is his. The coder's part: the reading (below, to confirm), the design, the code.
    readings: >-
      To confirm. "websites use the password manager" — what Firefox's does: when a site's login form is submitted, offer to save the
      login (Save / Never for this site / Not now; Update when the password changed); when a page with a login form opens and one login is
      saved for that exact origin, fill it; with more, the key in the address bar lists them to choose. "hook it into the cookie vault or
      store what ever it uses" — the password vault already uses the cookie vault's store kind (JAA rows) and its sealed key
      (src/security/vault-key.js, Electron safeStorage); what was missing is the link: a saved login now carries the account it belongs
      to, and "Save sign-in to vault" (the sign-in window in his screenshot) saves the login just typed together with the cookies, as that
      account's. Not the same table: cookies and passwords stay separate records under the same key, so one can be cleared without the
      other.
    purpose: >-
      Sign in once; the browser remembers the password with the account's session, and fills it on the next visit.
    target_runtime: [electron, node]
    language_stack: [javascript]
    paradigm: [main-holds-secrets, page-sees-only-its-own, ask-before-save]
    axioms: ["§8.6 reuse (PasswordVault, vault-key.js, account-switch capture, the plugin host's settings pages)", "USER_AUTONOMY (save is asked; never-for-this-site kept)",
      "§1.2 nothing silent (a refused fill says why in the key panel)", "§0.3 nothing lost (the 0.60.x userscript path kept in the plugin file, no longer contributed)"]
    deps:
      - { name: electron, version: "42.x", required: true, purpose: "session.registerPreloadScript, ipcMain, webContents.send, safeStorage" }

    constraints:
      - id: PW-001
        description: "A password never reaches the window's renderer: capture goes page → main; the shell sees origin, username and what to offer."
        type: hard
        enforced_by: [GATE-PW-MAIN]
      - id: PW-002
        description: "A login is filled only into a top-level page whose origin equals the saved origin exactly (scheme, host, port)."
        type: hard
        enforced_by: [GATE-PW-ORIGIN]
      - id: PW-003
        description: "Nothing is saved without the person's Save (or the vault's Save sign-in); Never for this site is kept."
        type: hard
        enforced_by: [GATE-PW-ASK]
      - id: PW-004
        description: "Snowflake compartments neither capture nor fill (an identity there defeats the compartment)."
        type: hard
        enforced_by: [GATE-PW-COMPARTMENT]
      - id: PW-005
        description: "The Password Manager plugin turned off stops capture and fill."
        type: hard
        enforced_by: [GATE-PW-PLUGIN]

  schemas:

    - id: Login
      name: Login
      description: "One saved login (PasswordVault record)."
      fields:
        id:        "string"
        origin:    "string — normalised origin"
        username:  "string"
        encrypted: "string — vault-key.js blob, never plaintext at rest"
        accountId: "string|null — the Clear Glass account whose sign-in this is (0.60.186)"
        createdAt: "number"
        updatedAt: "number"
      behavioral_contracts: ["one record per origin + username; saving again rotates the password and keeps the account unless a new one is given"]
      error_paths: ["no origin, username or password → refused"]

    - id: Pending
      name: Pending
      description: "A login just submitted, held in main memory until Save, Never, Not now, a vault save, or ten minutes."
      fields:
        key:      "string — <webContentsId>|<origin>"
        origin:   "string"
        username: "string"
        password: "string — memory only"
        at:       "number"
      behavioral_contracts: ["never written to disk", "dropped on save, dismiss or expiry"]
      error_paths: ["expired → the offer is gone, said"]

  interfaces:

    - id: IF-PASSWORD-VAULT
      name: password-vault
      path: clear-glass/src/passwords/vault.js
      description: "Encrypted logins in JAA rows under the sealed vault key."
      exports: ["save(origin, username, password)", "get(origin)", "list()", "delete(id)"]
      behavioral_contracts: ["list() never decrypts"]
      error_paths: ["bad args → throws"]

    - id: IF-ACCOUNT-SWITCH
      name: account-switch
      path: clear-glass/src/providers/account-switch.js
      description: "capture(provider, account) saves a provider tab's sign-in cookies to the cookie vault as that account."
      exports: ["createAccountSwitch({ ... })", "capture(provider, accountId)"]
      behavioral_contracts: ["a signed-out tab is not saved"]
      error_paths: ["unknown account → { ok:false }"]

    - id: IF-PLUGIN-HOST
      name: plugin-host
      path: clear-glass/src/plugins/host.js
      description: "list() says whether the passwords plugin is active; settings contributions give its page."
      exports: ["list()", "settings contribution"]
      behavioral_contracts: ["a disabled plugin's contributions are deregistered"]
      error_paths: ["unknown id → PluginHostError"]

  modules:

    - id: MOD-PW-SERVICE
      name: password-service
      uuid: nexus-cg-pw-service-v1-0000-2026-1021-001
      path: clear-glass/src/passwords/service.js
      phase: PW1_service
      map: docs/2026-10-21-passwords-phasemap.spec
      description: >-
        The one door between pages, the shell and the vault. capture(wcId, { origin, username, password }) holds a Pending and says what to
        offer (save, update, or nothing when the same login is saved or the site is Never). save(wcId, origin, { username, accountId })
        moves it to the vault; dismiss(…, { never }) drops it (never → kept per origin). logins(origin) → id, username, account (no password).
        fill(origin, id) → the credentials only when the entry's origin is exactly origin. linkPending(origins, accountId) saves the pending
        logins of those origins with that account (the vault's "Save sign-in"). Prefs (offer to save, autofill, never-save origins) kept in
        <userData>/passwords-prefs.json. Vault records gain accountId.
      deps: [{ name: password-vault }]
      schema_refs: [Login, Pending]
      exports: ["createPasswordService({ vault, dir, now, ttlMs })", "service(opts)", "capture", "save", "dismiss", "logins", "fill", "linkPending", "prefs()", "setPref(k, v)", "view(origin)"]
      gate_pipeline: ["GATE-PW-ASK: offer, never save by itself", "GATE-PW-ORIGIN: exact origin", "GATE-PW-MAIN: pending in memory"]
      behavioral_contracts: ["pending expires after ten minutes", "a Never origin is offered nothing"]
      error_paths: ["no pending for that tab and origin → { ok:false, error:'nothing to save' }"]
      acceptance: ["capture new → save offer; same login → none; changed password → update; save writes the vault with the account; fill of another origin refused; linkPending saves with the account; Never remembered"]

    - id: MOD-PW-PAGE
      name: password-page
      uuid: nexus-cg-pw-page-v1-0000-2026-1021-001
      path: clear-glass/src/preload/passwords.js
      phase: PW2_page
      map: docs/2026-10-21-passwords-phasemap.spec
      description: >-
        A preload registered on every session Clear Glass makes (session.registerPreloadScript), so ordinary pages, account windows and
        provider tabs (the sign-in window) all have it. It finds a login form (a visible password field and the user field before it:
        autocomplete username/email, type email, or the nearest text input), reports it (pw:form), captures on submit — the form's submit
        event, Enter in the password field, or a click on its submit button — (pw:capture, to main), and fills when main sends pw:fill
        (value set through the native setter, input and change events, so frameworks see it). Main decides everything; the page script
        never sees this world.
      deps: [{ name: password-service }]
      exports: ["findLogin(doc) → { user, pass, form } | null", "ipc: pw:form, pw:capture, pw:fill"]
      gate_pipeline: ["GATE-PW-FIND: visible password field", "GATE-PW-SUBMIT: one capture per submit", "GATE-PW-FILL: only when main sends"]
      behavioral_contracts: ["a sign-up form (two password fields) is captured with the first", "autocomplete=new-password is captured, never filled"]
      error_paths: ["no form → nothing sent"]
      acceptance: ["in Clear Glass: a form submitted sends one pw:capture with origin, username and password; pw:fill sets both fields and fires input"]

    - id: MOD-PW-MAIN
      name: password-wiring
      uuid: nexus-cg-pw-main-v1-0000-2026-1021-001
      path: clear-glass/src/main/passwords-wiring.js
      phase: PW3_wiring
      map: docs/2026-10-21-passwords-phasemap.spec
      description: >-
        attach({ app, ipcMain, service, isActive, isCompartment, preloadPath }): registers the preload on each session; answers pw:capture
        (pending, then 'passwords:offer' to the embedding window), pw:form (logins for the page; one login and autofill on → pw:fill sent
        back; the window told how many through 'passwords:available'), and the window's passwords:save | dismiss | forPage | fillPage.
        account-switch's capture calls linkPending for the provider's site, so "Save sign-in to vault" keeps the password with the cookies.
      deps: [{ name: password-service }, { name: account-switch }, { name: plugin-host }]
      exports: ["attach(o) → { registered }", "IPC passwords:save|dismiss|forPage|fillPage", "events passwords:offer, passwords:available"]
      gate_pipeline: ["GATE-PW-PLUGIN: plugin active", "GATE-PW-COMPARTMENT: not a compartment", "GATE-PW-ORIGIN: the sender's own URL"]
      behavioral_contracts: ["the origin is read from the sender's URL, never trusted from the page's message"]
      error_paths: ["registerPreloadScript missing → setPreloads, said in the log"]
      acceptance: ["a capture from a compartment session is dropped; one from a page with another origin than its URL uses the URL's origin"]

    - id: MOD-PW-SHELL
      name: password-shell
      uuid: nexus-cg-pw-shell-v1-0000-2026-1021-001
      path: clear-glass/renderer/shell/passwords.js
      phase: PW4_surface
      map: docs/2026-10-21-passwords-phasemap.spec
      description: >-
        The key in the address bar (drawn icon; a count when this page has logins). An offer opens its panel like Firefox's: "Save login for
        <site>?" with the username editable, the password shown as dots, the account it belongs to (this window's, or one signed in to the site
        — 0.60.185's forSite), Save / Not now / Never for this site; Update for a changed password. Clicked otherwise it lists this page's
        logins with Fill and "Manage passwords". The Password Manager plugin's page has the switches (offer to save, autofill), the never-save
        sites and the count.
      deps: [{ name: password-service }]
      exports: ["window.CGPasswords.offer(d)", "window.CGPasswords.available(d)", "window.CGPasswords.open()"]
      gate_pipeline: ["GATE-PW-UI-001: offer opens the panel", "GATE-PW-UI-002: Save sends no password (main holds it)"]
      behavioral_contracts: ["the panel never holds a password", "labels are text"]
      error_paths: ["save after expiry → said"]
      acceptance: ["Clear Glass: an offer shows Save login for news.com; Save calls passwords.save with the edited username and the chosen account; Never calls dismiss with never"]

  events:
    passwords:
      - "passwords:offer { wcId, origin, username, kind }"
      - "passwords:available { wcId, origin, count }"

  enforcement:
    gates:
      - { id: GATE-PW-MAIN, name: main-holds-secrets, severity: fatal, check: "no password in any message to the shell", on_failure: "build failure" }
      - { id: GATE-PW-ORIGIN, name: exact-origin, severity: fatal, check: "fill only when entry.origin === sender origin", on_failure: "build failure" }
      - { id: GATE-PW-ASK, name: asked, severity: fatal, check: "vault.save only from save() or linkPending()", on_failure: "build failure" }
      - { id: GATE-PW-COMPARTMENT, name: not-in-snowflake, severity: fatal, check: "compartment sessions dropped", on_failure: "build failure" }
      - { id: GATE-PW-PLUGIN, name: plugin-switch, severity: high, check: "inactive plugin → no capture, no fill", on_failure: "build failure" }
