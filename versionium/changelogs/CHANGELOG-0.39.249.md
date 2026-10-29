# NEXUS 0.39.249 — one selector map, and the userscripts read it

**Date:** 2026-09-25 · guardian 3.10.0 → 3.11.0 · userscript-chatgpt 10.4.0 → 10.5.0

James: *"i want to have the element picker, aware of the cleardriver and userscripts, usermesh. … could copilot potentially be tasked to fixing it with the element picker?"* — *"lets do it."*

## Mapped first
- **The map already existed.** `guardian/lib/agent-registry.js` holds one selector map per provider (`input`, `send`, `resp`), with a history of every change: when, from, to, source and evidence. The mesh's archaeology / automatic DOM-mapping repair already writes to it.
- **Nothing on the live path used it.** The mesh path is off by default (`GUARDIAN_TRANSPORT=ncp-only`), and the userscripts hard-code their own selectors. So a repair never reached the path every job takes, and ChatGPT's seed (`.markdown.prose`) and the userscript (`[data-message-author-role="assistant"]`) gave two different answers.

## Built (step 1 of the plan)
- **`guardian/lib/selector-map.js`:**
  - `mapFor()` marks each key **verified** only if its last change came from a source that checked it against a live page (the element picker, archaeology). A seed is never verified.
  - `assign()` accepts known keys only. A claimed live check without evidence (`{ url, matched ≥ 1 }`) is refused. It pushes the new map to every open tab of that provider.
- **Guardian:** `GUARDIAN_SELECTORS` is pushed to each tab when it connects, before queued jobs flush. New routes: `GET` / `POST /api/agents/:id/selectors`.
- **`userscript-chatgpt.js` 10.5.0:** a verified map value, then its own built-in lookup, then an unverified seed value. An unchecked seed never overrides something that works, and a malformed selector in the map can't break the reply watch.

## Tests
- **New** `test-selector-map`: 15/15, on the real registry (temp dir) and the real module; the userscript's real `findResponseEl` and helpers run against a stand-in page.
- **Mutation checks:** each of the following was reverted in turn, and each reversion failed its own test:
  - an unverified map value winning
  - the seed never used
  - no evidence required
- **Regression:** job-correlation 120 (its ChatGPT check now supplies the map helpers), one-tab e2e 8, version-sync 30, record-discipline 9.
- **Pre-existing:** `userscript-adapter-consistency` exits 1, as on 0.39.238.

## Not done — next, in this order
1. **The picker UI in Clear Glass.** Pick an element on a ChatGPT page, choose its role (reply / input / send), have it checked against the live page, and `POST` it with that evidence.
2. **Automatic repair on `no-reply-element`.** Archaeology proposes, a mechanical check verifies, and copilot may propose but never counts as verified.
3. **The other userscripts** (claude, gemini, perplexity, deepseek) reading the map.
4. **Guardian registry and contract entries** for the two new routes.

Then, from the same request: ClearDriver under Agent settings; a Copilot settings section; per-compartment agent permissions with toolScope actually enforced; the guardian picker wired to the backend; Clear Glass in a resizable, draggable COS compartment; better-looking elements.
