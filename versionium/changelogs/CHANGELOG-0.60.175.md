# 0.60.175 — 2026-10-19 — the page map in the co-pilot's hands, felt by Ollama through Nerve, live, with a panel

James, 2026-10-19: "interaction field, nexus nerve, hooking ollama in to feel with "nexus nerve", see with the interaction field
and scrips injected into each page." · "then it can be a map tool, chunk tool for understanding/analysing/ reverse engineering,,
web scraper."

His idea and direction; the coder's part is the code and one reading, marked to confirm: "feel" read as Ollama's standing context
carrying WHAT changed on the page. Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (PM5–PM8, addendum).

## What it stands on (§8.6)
The driver's action table and `/cli/driver` (the `field` commands' door) · the co-pilot's tool list and DRIVER_ACTIONS · attention.js
(per-window focus, already read by Nerve) · lib/nerve-ollama-bridge.js (Ollama's standing context, no generation) · the DOM observer
dom/archaeology.js already injects into every page · the panel pattern of gig-panel.js.

## Built
- **PM5 — one tool, every door.** `clear-glass/src/page/page-session.js` holds the logic so it runs without Electron. The driver's
  actions: `pageMap`, `pageFind`, `pageChunks`, `pageScrape` and `pageOutcome`. The co-pilot has all five as tools. Commands:
  `idearium page` · `page find <intent…>` · `page chunks [query]` · `page scrape [--json] [--out f]` · `page outcome <intent> <id> ok|fail`.
- **PM6 — Ollama feels it.** Each map read says what changed since the last visit to this kind of page, in words
  (`+1 (textbox "Postcode"), 2 gone`). attention keeps that as the window's `focus.page`, Nerve carries it unchanged, and the
  bridge pushes it to Ollama's standing context once per change.
- **PM7 — live.** A mapped window is mapped again when its DOM settles (1.5 s quiet, at most every 5 s). This reuses the observer
  every page already has, so no second script is injected. A window that can no longer be read stops being live and says so.
- **PM8 — the panel (▦) beside the page.** Map · Find (targets with why) · Show (spotlight) · ✓/✗ (it learns) · Chunks · Scrape
  (markdown, copied).

## Proof
`tests/modules/clear-glass-page-session.test.js` 6/6: a real DOM (jsdom) mapped twice, the change in words; find, outcome, chunks,
scrape; the five doors; attention → focus.page; the bridge's push against a stub Ollama, once and not again; the live re-map with
controlled timers; the panel in Clear Glass's engine. Unchanged: page-map 6/6, field-nerve 5/5, cg-field 13/13, agent-surface
16/16, copilot no-api 6/6, verbs 9/9, claude-code 5/5. library-ui's Ctrl+J and cli-route-commands CL-07 fail as on the base.

## Not proven
Not run on Windows, against a live site, or with a real Ollama. The reading of "feel" is the coder's; to confirm.
