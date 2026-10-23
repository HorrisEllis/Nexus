# 0.60.215 — one site's settings for every feature (SP1)

James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
Cleardriver, agentmesh and guardian setting. Also need a processes screen for background tabs and activity."

Owned by: clear-glass/spec/site-profile.spec (MOD-SP-KEYS, MOD-SP-RESOLVER) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP1.
The features are his; the census, the one-store design and the phase cut are the coder's.

## What stands on what
- Clear Glass already kept per-origin settings (`src/site-settings/store.js`: zoom, content filtering, permissions, the password
  never-list) and per-origin network rules (`src/net/policy.js`). Nothing new was built beside them (§8.6): the new keys live in the same
  store, and the per-site route is a rule in the same policy.

## Built
- **`src/site-settings/keys.js`.** One table of the keys every feature reads: autofill, macros, workflows, passwords/accounts, resume,
  ClearDriver, the agent mesh, Guardian. Each key has a type, its allowed values and a default that is today's behaviour (decision SP_D2),
  so nothing changes until he sets something. A bad value is refused with the reason.
- **`src/site-settings/profile.js`.** `siteProfile(url)` gives every feature's value for a site: the site's own, else the global option
  (the driver's timeouts, Guardian), else the default, each marked with where it came from. `setSite` / `clearSite` write through the key
  table.
- **Snowflake per site** is the site's network route (default / direct / transport / block), kept as one netPolicy rule `site.<host>`.
  A change is checked on a copy of the policy first, so a refused route leaves the one the site had.
- **Doors:** IPC `site-profile:get/set/clear/keys`, `/cli/site-profile` (GET / PUT / DELETE), `ClearGlass.siteProfile` in the preload.

## Not yet
- No feature reads its site value yet (SP2), and there is no screen yet (SP3). ClearDriver / mesh / Guardian settings sections are SP4;
  the Processes screen is SP5–SP6.

## Readings to confirm
- "resume state" is read as putting back where he was on a site when he revisits it (scroll, and forms if he says). If he also means
  restoring all tabs at start-up, that is a separate piece.
- "snowflake" per site is read as the site's network route.

## Proof
- `test-site-profile` 3/3, on the real store and a real net service:
  - SP-01: the key table;
  - SP-02: site / global / default resolution and clear;
  - SP-03: the route as one rule that the real policy decides by, replaced and not duplicated, removed on default, and a colliding rule
    refused with the old route kept.
