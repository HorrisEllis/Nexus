# 0.60.193 — 2026-10-21 — The Home tab shows the atlas again

James, 2026-10-21, with a screenshot of NEXUS/CORE Home: "whats next"

Your screenshot showed "docs/atlases/nexus-atlas.md is binary" under the system cards, where the atlas should render.

## Cause
- **A size limit used for the wrong job.** When Idearium reads a file from the Nexus snapshot (`idearium/repo/nexus-self.js` `fileText()`),
  it used the 200 KB limit meant for chunking files into a system repo. Anything over that size was reported as "binary".
- **It wasn't new.** The atlas has been around 490–550 KB for weeks, so it has been hidden for a while. This was not caused by today's
  regeneration.

## Fix
- **Reading allows larger files.** A read-only read now allows up to 8 MB, and anything bigger says "too large to show", never "binary".
- **Chunking is unchanged.** Big files still live only in the source layer.

## Measured
- **`test-nexus-atlas-and-glass` AT-003** now reads a 330 KB atlas whole. Before the fix it failed with exactly the message in your
  screenshot. The file passes 10/10.
- **The other `nexus-self` tests are unchanged.** `test-cos-compartment-template` (1) failed the same way before this change.

## To check
Sync, then open NEXUS/CORE Home. The atlas should render under the system cards.
