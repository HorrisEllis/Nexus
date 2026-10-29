# 0.60.13 — 2026-10-13

James: "providers, accounts, and agent mesh all need to be using the same cookies. none of them are separate but I'm signed in and the provider when opened is signed out. sync them together. migrate and consolidate them." (Screenshots: a normal tab signed in as him; the provider tab at "Log in"; the mesh tab in a third jar, `mesh-chatgpt-<id>`.)

**What was wrong.** One provider's sign-in lived in up to four cookie stores that only copied into each other at set moments (0.60.12's sync covered the vault → provider tab, nothing else):
- the app's **default session**: every normal tab and agent window's page (the `<webview>` in browser.html) — where he actually signs in;
- `persist:ncp-<provider>`: the provider tab;
- `persist:mesh-<provider>-<account>`: the Accounts sign-in window and the agent mesh tab's window shell (its page still ran in the default session, so cookies restored there never reached it);
- a second source of confusion: "signed in" was `/sess|token|auth|…|__Secure/`, which a signed-OUT chatgpt.com page also satisfies (csrf token, callback-url).

**What changed — one session per provider.**
- NEW `clear-glass/src/cookies/session-hub.js`. The canonical session is `persist:ncp-<provider>`. The Accounts sign-in window, the provider tab and the agent mesh tab (window **and** its webview) all run in it. Normal tabs are kept equal to it, live, both ways, for the provider's own site(s): sign in or out in either, the other follows. One real "signed in" test (session credentials, not csrf/callback cookies) shared by the hub, the portal and account-switch.
- **Migration** (`consolidate`, once per provider, before the provider tab's first load, and at boot): the sign-in a person really has is taken whole into the one session — provider session, else normal tab, else the old `persist:mesh-*` sessions (dispatch account's first). Cookies of two identities are never mixed. Any other sign-in found is saved to the vault as a snapshot first; old partitions are left untouched.
- `account-switch.js` 1.2.0: the account is now only *which identity* the one session holds. `beginSignIn()` (saves what the session holds, puts the account's saved sign-in in or clears it), `settled()` (a token refresh or a sign-in made in a normal tab is kept for the account; a sign-out removes the saved copy too, so the next start cannot undo it), `markCurrent()`, `use({reload:false})`. `sync()` now treats a live sign-in of unknown owner as the truth and keeps the stale saved copy as a snapshot (it used to overwrite it). Account switches `hold()` the hub so guardian's per-job routing does not flip the normal tabs' identity.
- `login-portal.js`: signs in in the one session; opening another account's window closes the first (same session); capture refuses to save another account's session as this one; status shows live cookies only while the session runs as that account; sign-out clears the session (and the normal tabs) only if it is that account's.
- `agent-mesh.js` spawn: always the one session (`webviewPartition` too); the account switch brings it to the requested account.
- `src/main/index.js`: hub, boot consolidation, `GET /accounts/session/:provider`, `POST /accounts/session/consolidate` (`{provider?, force?}`) — CLI-first, no UI needed.

**Proof.** New `clear-glass/test/session-hub.test.js` (consolidation from the normal tab with a csrf-only provider session; dispatch account's mesh partition first; two real sign-ins never mixed, the loser snapshotted; mirror both ways, other sites not mirrored, no echo loop; hold; clearNormal; beginSignIn/settled/sync). `provider-account-sync` 9/9, `login-portal-elsewhere`, `test-cg-accounts-portal-settings` 31/31 (LP-01/LP-07 updated: the partition is now the one session, one portal window per provider).

**Not proven.** Not run inside Electron — the real `cookies.on('changed')` events, `clearStorageData` and the webview partition still need a look in Clear Glass. `persist:agent-acct-*` account windows are separate by design and untouched. Failures unrelated to this change (`js-yaml` missing, tablet/BrainOS UI tests) are identical on the untouched 0.60.12 zip.
