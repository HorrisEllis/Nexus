# 0.60.12 — 2026-10-13

James: "the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired into the provider tabs in clearglass. fix that please."

**What was wrong.** One login lived in three cookie jars. Accounts & sign-in signs in to `persist:mesh-<provider>-<id>` and saves to the vault; the provider tabs run in `persist:ncp-<provider>`; only guardian's per-job routing copied one into the other. A tab could open signed out beside an account that said "Signed in".

**What changed.** A provider tab runs as the provider's default account (starred, else oldest).
- `clear-glass/src/providers/account-switch.js` 1.1.0: `sync(provider)` puts the account's saved sign-in in the tab; a sign-in the tab holds that the account has not saved is saved to it, never overwritten. `signedOut()` signs the tab out when its account is signed out.
- `clear-glass/src/providers/host.js`: `beforeLoad` hook, awaited before the first load, bounded to 8 s, fail-soft. `src/main/index.js` sets it and serves `POST /providers/:id/account/sync` and `POST /providers/account/sync`.
- `src/ipc/bridge.js`: save session, star and sign out follow through to the tab and return `tab` (what was done). `providers:account` and `providers:syncAccount` for the Provider tabs page.
- Accounts page: says what happened to the tab. Provider tabs page: shows the account the tab really runs as, with a "Use … sign-in" button.
- `idearium/cli/route-commands.js`: `glass signin [provider]` so agents have the same action.

**Proof.** `clear-glass/test/provider-account-sync.test.js` 9/9 (restore into a signed-out tab, no-op when aligned, adopt rather than overwrite, switch on star, sign-out propagation, wiring present). Broken on purpose once to confirm it fails. `test-accounts-picker-cos` 40/40.

**Not proven.** Not run inside Electron. The real cookie restore and the two pages still need a look in Clear Glass. Four older tests (`copilot-cli`, `userscripts-manifest`, `userscripts-dedupe`, `gig-file`) fail the same way on the untouched 0.60.11 zip.
