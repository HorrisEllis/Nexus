# 0.60.161 — 2026-10-19

James, 2026-10-18: "need help with the autofill for fiverr." (His screenshot: he asked co-pilot "fill this in for me" on the
Fiverr gig editor and it answered with chat — "I need more context" — instead of filling.) · 2026-10-19: "yes."

## The cause

The fill engine (`src/autofill/gig.js` — `fillGig` / `matchGigFields`) was built and correct, reachable from the Settings button
and `/cli/autofill/gig/fill`. But **co-pilot had no gig-fill tool**. Its tool list had `opportunity.prepare` (which fills job
*applications*), nothing for the gig *editor*. So "fill this in for me" had nothing to call, and the model just talked.

## GA1: one deterministic door for the co-pilot

- **New tool `autofill.gig`** (`src/copilot/tools.js`): fills the Fiverr gig editor open in the current tab, through the engine
  that already exists. "Either, its choice" (his "yes"):
  - a gig already written is used;
  - else, given a one-line `offer`, one is written from the active Fiverr profile and filled;
  - else a one-line **ask** comes back (`needsGig`), never a chat.
- **The hat** (`src/copilot/hat.js`) now tells the model: on a Fiverr gig page, "fill this in" means this tool — run it, don't ask
  for context in prose.
- **Backend `_gigAutofill`** (`src/ipc/bridge.js`): resolves the gig (held → draft → ask), then fills. Served at
  `POST /cli/autofill/gig/autofill` and IPC `autofill:gig:autofill`; the co-pilot bridge dispatches `autofill.gig` to it.

## GA1a: the panel and the co-pilot fill the same gig

The last gig written — in Settings ("Write the gig") or by the tool — is kept as one JAA row
(`src/autofill/store.js` `getLastGig`/`setLastGig`). So "Write the gig" in Settings and "fill this in for me" to co-pilot now
act on the same gig.

Still never saves or publishes: the fill only types into fields; you read the page and press Save/Publish yourself.

## Mapped, not yet built

`docs/2026-10-19-gig-autofill-and-learn-phasemap.spec` holds the rest of what he asked for (GA2–GA5): when a gig part can't be
matched to a field, pop the element picker for him to click it, and save that pick three ways — per-site settings, a
macro/automation, and the autofill's learned map — so the matcher learns the field and never asks again. Every phase has a
dependency graph; no new system crossings. Built next.

Noted, separate: his screenshot's "Saved page state could not be restored (Snapshot not found)" is a page-snapshot bug, not the
fill — tracked on its own, not touched here.

## Proof

`tests/modules/test-cg-gig-autofill.test.js` 4/4, against the real engine with a fake page and a fake co-pilot:
- a written gig is filled, no draft;
- no gig and no offer returns the one-line ask and touches nothing;
- an offer drafts from the profile, keeps it, then fills;
- the tool, the hat line, the dispatch and the REST + IPC doors are all present.

Registered in `run-all`; wired in `loom/maps/economy-map.js`.
