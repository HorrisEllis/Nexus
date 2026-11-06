# 0.60.259 — "Autofill this page" in the right-click menu

James, 2026-10-26, looking at a Fiverr gig page's right-click menu: **"no autofill? renderer.html"**.

Now there is. A **"Autofill this page"** item sits in Clear Glass's page context-menu group — which always shows, so it's there whether you right-click a form field or blank space, in the exact menu you screenshotted.

## What it does
- Runs `cg.autofill.fill(null, agentId)` — **no profileId**, so (via AF2) it fills from your **active profile**. Never the old "no autofill profile 'null'".
- No profile yet → a clean message: "add one in Library › Autofill, then right-click → Autofill this page." Not an error dump.
- Tells you how many fields filled, and how many still need a Pick (so you know what's left on an odd form).

## Reused, not rebuilt
The fill path, the matcher, and the active-profile resolution are all AF1/AF2. This change is only the menu item (`clear-glass/renderer/browser.html`) and its handler (`clear-glass/renderer/browser.js` `_ctxAutofill`).

## Honesty: verify live
This cloud container has no Electron, so I confirmed the wiring by syntax (`node --check` on browser.js, the HTML item, the icon name) and by AF2's headless tests — **not** by driving the real menu. The live right-click is yours to confirm when you pull. If the item doesn't appear or the fill misbehaves, tell me what you see and I'll fix it.

## Next
The inline Firefox-style chip under a focused field (AF3) and the settings toggle (AF4).
