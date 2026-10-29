# NEXUS 0.39.223 — Clear Glass owns accounts; login portals; sealed vaults; Settings rebuilt

**Date:** 2026-09-23 · **Author:** James Brooks · clear-glass 3.9.0 → 3.10.0

James: *"login portals like apppassword login to each provider, with a plus to add multiple, which hook into the cookie vault, and create a accountid per account. agent mesh and suite, macros, erosmanceros, all of it"* — then *"yes clearglass"*, deciding which system owns accounts.

## Decided
- **D3 (mesh-first phasemap): Clear Glass is the one account authority.** Guardian no longer keeps its own account list for dispatch; it asks Clear Glass.

## Built
| Piece | Where |
|---|---|
| Per-provider default account, dispatch resolution (never auto-creates), per-account session records | `clear-glass/src/options/store.js` |
| `GET :7702/accounts/resolve`, `GET :7702/accounts` | `clear-glass/src/main/index.js` |
| Guardian asks Clear Glass; ladder falls back to NCP with `account_authority_unreachable` if it's down | `guardian/lib/cg-account-authority.js`, `agent-registry.js`, `dispatch-ladder.js`, `server.js` |
| Login portal: sign-in in `persist:mesh-<provider>-<accountId>` (the mesh's own partition), capture → CookieVault `{provider, accountId}`, identity link, saved sign-in pre-fill (never submits), sign-out | `clear-glass/src/accounts/login-portal.js` |
| OS-sealed vault keys (Electron safeStorage) with legacy read fallback | `clear-glass/src/security/vault-key.js` |
| 15 new IPC channels (accounts default/resolve, 8 portal, vault status, macro create/delete/schema) | `ipc/bridge.js`, `preload/index.js`, `registry-components.js` (79 → 94) |
| Settings rebuilt: shell + one file per area, CSP `script-src 'self'` | `renderer/settings.html`, `renderer/settings/` |

Settings sections: Accounts & sign-in · Provider tabs · Browser fingerprint · Agent mesh · Automation · Macros (step builder) · ErosmancerOS · Agent suite · General · Autofill & answers · Privacy & data · Connections · Co-pilot · Diagnostics.

## Fixed (found while wiring)
- **Saved sessions never restored.** CookieVault's file-store branch (the real one — `better-sqlite3` isn't a dependency) wrote named-account cookies and never read them back. Every mesh `vault.restore()` returned `[]`.
- **Snapshots:** same unread-file bug; `_nextVersion` also reset to 1 after restart and overwrote `<agent>-1.json`.
- **Preload `macros` declared twice** — last key wins, so BrainOS's `macros.run(name, {})` sent `{}` as the agentId.
- **Fingerprint "Apply" was a no-op** — wrote `fingerprintOverride`, read by nothing. Now calls `context:switchFingerprint`.

## Tests
- `tests/modules/test-cg-accounts-portal-settings.test.js` — **38/38** (new, registered). Mutation-checked: file-store read removed → 3 fail; ladder ignoring the authority → 2; portal partition changed → 1; identity pre-check removed → 1.
- Regression green: version-sync-and-registry 30/30 · clear-glass-screen-qa-ui 27/27 (3 checks re-pointed at the new section file) · dispatch-ladder 18/18 · account-registry 13/13 · job-correlation 60/60 · library-ui 24/24 · agent-mesh drainer/hostile/coverage · brainos app/panel · clear-glass bus/watchdog/phase2/downloads/userscripts.
- Pre-existing, identical on 0.39.222: clear-glass `network-install` 4 fail, `test-registration-shape` 3 fail.

## Not verified / open
- A real sign-in → save session → mesh dispatch against live provider sites (needs Electron on James's machine). Google sign-in (Gemini) is the most likely friction point.
- `lib/account-registry.js` (copilot / agent-router, credentialRef keychain) is a **third** account list — not folded into the Clear Glass authority this pass.
- Guardian's local `addAccount` list remains for authority-less callers (tests); unused when Clear Glass is wired.
