# 0.60.216 — each feature reads its site value (SP2)

James, 2026-10-23: "I need site specific settings for the autofill, macros, workflows, passwords/accounts, snowflake, resume state.
Cleardriver, agentmesh and guardian setting."

Owned by: clear-glass/spec/site-profile.spec MOD-SP-READERS (dated addendum) · map docs/2026-10-23-site-profile-processes-phasemap.spec SP2.

## What stands on what
- 0.60.215's resolver (`siteProfile(url)` over the per-origin store) is the one thing every feature asks.
  `src/site-settings/readers.js` gives each feature its own question (`driverPolicy`, `passwordPolicy`, …). Main installs it once the
  bridge holds its stores.
- Until then, or if the resolver fails, each feature does what it did before, and the log says so once per feature.
- A site with nothing set behaves exactly as before (decision SP_D2).

## Each feature, at the point it decides
- **ClearDriver.**
  - An agent asked to drive a site whose settings say agents may not is refused, with the site and the setting. This covers navigating
    there, and clicking, typing and the other page-changing actions on it.
  - The site's navigate and wait timeouts are used.
  - His own runs (his macros, userscripts, rewind, the window's buttons) are never refused. The key says "agents may drive". An agent's
    call is one marked by its door (`POST /cli/driver`) or one on an agent's page (mesh-, ncp-, auto-).
- **Passwords and accounts.**
  - "Never offer" for a site.
  - Autofill on or off for a site.
  - The account that signs in there: a new login is saved with it, and when a site has several logins, that account's is the one filled.
- **Autofill.** Off for a site, or the site's own profile when none is picked.
- **Workflows.** "When I open a page" workflows are skipped on a site where they are off.
- **Macros.**
  - A site's macros can run whenever one of its pages loads. They run as his own Run button would (one helper for both), on that exact page,
    once per page per minute.
  - A site with macros off refuses them, his Run included.
- **Co-pilot and the agent mesh.**
  - On a site with its own agent set, Co-pilot answers with that agent.
  - On a site with the mesh off, Co-pilot answers without reading the page, and says why.
- **Guardian.** On a site where it doesn't listen, no listeners fire. On a site with chat capture off, the chat ledger keeps nothing, and
  says so.
- **Resume state.**
  - The page keeps its place as he leaves it. On a revisit, the scroll comes back, and the forms too if he says.
  - A password field is never kept.
  - Built as `src/rewind/resume.js`, on rewind's own form capture and restore. Rewind's snapshots couldn't be reused as the spec said: they
    are taken when an agent's navigation loads, when the scroll is 0. That drift is recorded in the spec's addendum.

## Readings to confirm
- "resume state" is read as where he was on a site's page. If he also means reopening every tab at start-up, that is a separate piece.
- "snowflake" per site is read as the site's network route (0.60.215).

## Proof
- `test-site-readers`: 7/7. Each check runs the feature's own code against the real resolver and store:
  - the driver's refusal and timeouts;
  - passwords;
  - autofill;
  - resume in a real DOM (jsdom), including a password never kept;
  - Guardian's listeners and the chat ledger;
  - the workflow, macro and Co-pilot answers.
- Not driven: the page-load hook in main, which runs only in Electron. It is wired, and its macro run is the same helper his Run button uses.
- `clear-glass-agent-surface` CG-101 now expects the door's `by: 'agent'` mark.
- Three suites fail exactly as they do on the commit before this one, so this release did not cause them: `clear-glass-accounts`,
  `clear-glass-library-ui` and `test-cg-accounts-portal-settings`.
