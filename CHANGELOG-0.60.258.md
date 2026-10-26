# 0.60.258 — AF2: autofill fills from the active profile everywhere (the "no profile 'null'" bug, dead)

James, 2026-10-26, drowning: **"the autofill needs to be working. job applications. i need clearglass to do the repititve work. I have adhd and im drownign."**

AF1 gave us the active profile. AF2 wires it into the **one resolution point every fill passes through** — `clear-glass/src/autofill/matcher.js` `_siteChoice(...)`. That's the single change that makes filling actually work for copilot, agents, the context menu, the gig filler and every `/cli/autofill/*` route at once.

## The bug, and the fix
- **Before:** a fill with no `profileId` (copilot, an agent, the context menu) and no site-profile set returned `{ profileId: null }`, and the caller did `getProfile(null)` → **"Did not fill: no autofill profile 'null'"**. The thing just didn't fire.
- **After:** resolution ends at the active profile — explicit `profileId` wins → the site's chosen profile → `store.activeProfile()` (default, else sole, else first). If **zero** profiles exist it's a clean, actionable error (`{ noProfile: true }`, "add one in Library → Autofill") — never a null lookup (§1.2).

One change, every door: `fillFields`, `detectFields`, and therefore copilot's fill, the Fiverr gig fill, the routes and the context menu.

## Backward compatible
A caller that passes a minimal store without `activeProfile` keeps the old pass-through, so nothing that worked before changed (regression guard: `test-autofill-learn-pick`'s fixture store stays green).

## Proof (headless, no Electron)
`tests/modules/test-autofill-fill-active.test.js` 4/4 — no-profileId fills from the active profile; zero profiles → clean error, not `'null'`; detect previews from active; an explicit profile still wins. All 10 autofill suites green (active 6, fill-active 4, learned 4, learn-pick 5, clear-glass-autofill 16, autofill-jobs 9, gig 4, learn-save 3, learn-macro 5, learn-ui 3).

## What this means for you, James
Once you pull this: open a job application, and **copilot "fill this in" (or any fill) will use your profile** instead of erroring — as long as you have one profile saved (Library → Autofill). Next up, landing on your branch: the right-click **"Autofill"** menu item you asked for (`renderer.html`) and the Firefox-style inline chip, so you can fire a fill without typing a command.

## Remaining (Clear Glass UI, your machine)
The context-menu Autofill item, the inline chip (AF3), the settings toggle (AF4).
