# 0.60.186 — 2026-10-21 — Websites use the password manager; a login belongs to the account the cookie vault keeps

James, 2026-10-21: "can you have websites use the passowrd manager and hook it into the cookie vault or store what ever it uses."

The ask is his. The coder's part: what was found, the reading marked below, the code.

## Found
- **The vault was real.** The password vault already uses the cookie vault's kind of store (JAA rows) and the same sealed key
  (`src/security/vault-key.js`, Electron safeStorage).
- **No site could save a login.** The plugin's save handler was in no manifest, so nothing ever called it.
- **The fill didn't ask.** The plugin's userscript filled the one saved login for a site without asking, and only in agent windows.
- **No link between the two vaults.** A saved login had no account, and "Save sign-in to vault" saved cookies only.

## Reading (to confirm)
"hook it into the cookie vault or store what ever it uses":
- the same key and store as the cookie vault;
- each login tied to the account whose sign-in cookies the vault keeps;
- "Save sign-in to vault" saves the login you just typed, together with the cookies.

They stay separate records under one key, so you can clear sign-ins without losing passwords, and the other way round.

## Built
- **The service (PW1).**
  - **When you sign in on a site,** the login is held in Clear Glass's main process (memory only, 10 minutes) and you're asked: Save, Not
    now, or Never for this site. If the password changed, it offers Update.
  - **Nothing is saved without your Save,** or the vault's Save sign-in.
  - **Filling only happens for the exact site** the login was saved on: same scheme, host and port.
- **The page script (PW2).** It is added to every session, so ordinary pages, account windows and provider tabs (the sign-in window in your
  screenshot) all have it.
  - It finds the sign-in form, ignoring a search box.
  - It catches the login once per submit, whether by Enter, by click, or by the form's own submit.
  - It fills the way frameworks notice (input and change events).
  - It never autofills a sign-up or change-password form.
  - It runs in its own world, which the page's scripts can't reach.
- **The wiring (PW3).**
  - The site is read from the page's real address, never from what the page says.
  - The browser window is told what to offer and how many logins there are, but never a password.
  - Turning off the Password Manager plugin stops it.
  - In a Snowflake window it does nothing: filling an identity there would defeat the compartment.
  - **"Save sign-in to vault"** now also saves the login you typed on that provider's site, as the same account. The panel says so: "…and
    the login you typed (password vault, same account)".
- **The surface (PW4).**
  - **The key in the address bar:**
    - when a site asks, it opens Firefox's panel: "Save login for news.com?", the username editable, the password as dots (the window
      never has it), the account (the one signed in to that site is picked; 0.60.185's site accounts), and Never for this site / Not now /
      Save;
    - otherwise it lists the site's logins with Fill, and Manage passwords.
  - **The Password Manager plugin's page:** Offer to save logins, Fill logins automatically, and the sites you said never for.
  - **The old userscript** that filled without asking is no longer used. Its code is kept in the plugin file.

## Measured
- `test-passwords` 7/7:
  - **the service:** save / update / nothing; the account kept; no password in any answer; exact-origin fill (http vs https counts as a
    different site); Never kept across a restart; Not now; expiry; Save sign-in linking the provider site's login with the account;
  - **the wiring:** the sender's own origin is used, not the page's word; the window gets no password; one login means autofill; nothing
    happens when the plugin is off or in Snowflake; another site's login is refused;
  - **in Clear Glass (PWT-04):** a real form, one capture for click + submit, the fill fires input events, a sign-up form left alone;
  - **in Clear Glass (PWT-07):** the panel shows Save login for news.com with the signed-in account chosen; Save sends tab, site, username
    and account but no password; Never; the list's Fill.
- `test-browser-shell` 24/24. The cookie vault's IPC round trip 8/8, attention focus 6/6, page session 6/6. Accounts picker 36/40 and
  accounts portal 38/40 fail exactly as they do without this change.

## Not done, said
- Not run in a real Electron window here. To confirm in yours:
  - `registerPreloadScript` on your Electron build;
  - capture on a real sign-in;
  - the key showing after a sign-in redirect.
- A login form inside a cross-site frame (some single sign-on pages) is not reached: the page script runs in the top frame.
