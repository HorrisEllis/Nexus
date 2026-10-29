# NEXUS 0.39.251 — the element picker assigns provider selectors

**Date:** 2026-09-25 · clear-glass 3.13.2 → 3.14.0 · Versionium `vtm-f0839dcd` (parent `vtm-b30aa1a6`, 0.39.250) · git `26c2180`

Handoff 2026-09-25, step 1: *"when a pick is made on a provider page, offer 'This is <provider>'s reply / input / send' … check it on the same page … POST with that evidence."*

## Mapped first
- **The Element Picker never told the window a pick happened.** ◎ injects `guardian-picker.js`, whose click opens its own callto popup; only the fallback picker sent `dom:pick-result`.
- **Clear Glass already owns provider hosts** (`src/providers/registry.js`), so the offer uses it rather than a second list.
- **The consumer decides the check.** `userscript-chatgpt.js` `findResponseEl()` takes the **last** `querySelectorAll` match of `resp` and reads its `innerText`.

## Built
- **`renderer/selector-check.js`** (injected into the page, like `mesh-picker.js`):
  - Generates a stable selector, preferring data-* > hand-written id > role/aria/name/placeholder > classes.
  - Never uses uuids, digit runs, React ids, hashed classes or per-turn counters, and never `#id` for `resp`.
  - Checks it as the consumer reads it:
    - **resp:** the last match is the pick, matches don't nest, and it holds text. A selector matching every reply beats a one-off. An older answer is refused.
    - **input / send:** exactly one match, and it is editable / a button.
  - With one reply on the page, the result is `single` plus every passing candidate, and the person chooses. No check can tell a per-reply selector from an every-reply one with one reply.
- **`renderer/selector-assign/`** (one JS + one CSS, every rule under `#cg-selector-assign`):
  - Offers on provider pages only.
  - Shows the selector, its matches and what it reads, and outlines it on the page, before anything is recorded.
  - A failure shows why and every candidate tried, and cannot be assigned.
  - After Assign it shows guardian's own answer.
- **`src/providers/selector-assign.js`:**
  - Refuses anything without evidence, with `matched < 1`, or with evidence taken on another provider's page.
  - POSTs guardian `/api/agents/:id/selectors` with `source: 'picker'` and returns guardian's answer verbatim.
  - Unreachable guardian = failure, said so.
- **Plumbing:**
  - IPC `selectors:provider-for-url` and `selectors:assign`; `ClearGlass.selectors` in preload.
  - SSE `selectors.assigned` / `selectors.assign.failed`.
  - `browser.html` loads the area; `browser.js` mounts it and offers on `guardian.picker.picked` and on the fallback's `dom:pick-result`, which now carries xpath + url.
- **`guardian-picker.js`:** one line added (the pick report). Nothing else changed; its look is untouched (SA-06 diffs it against HEAD).

## Fixed on the way
- **Send-icon picks never resolved.** guardian-picker's positional xpaths through an `<svg>` (clicking a send button's icon) never resolve through `document.evaluate` in an HTML document. They are now walked by `localName`.
- **Unnamed picks overwrote each other.** `src/dom/archaeology.js` `handlePick` named every unnamed pick `pick-1` (`Object.keys` on a `Map`).

## Tests
- **Real Chromium 141:**
  - `tests/probe/selector-check-chromium.py` 10/10 on `tests/fixtures/chatgpt-like.html`, with guardian-picker's own `getXPath` and the userscript's own `_lastMatch` extracted from their files. A reply appended after assignment is read by the same selector.
  - `tests/probe/selector-assign-ui-chromium.py` 9/9: the area's whole flow against guardian's real selector map.
- **New** `test-cg-selector-assign` 10/10: guardian's real map in a temp dir, and both probes. Chromium parts report SKIPPED, never passed, without python playwright. Registered in `run-all.js`.
- **Mutation checks:** each of these was removed in turn, and each removal failed its test:
  - the older-answer refusal
  - the every-reply preference
  - the svg xpath resolver
  - the cross-provider evidence check
- **Regression:** version-sync 30, record-discipline 9, selector-map 15, agent-registry 11, dispatch-ladder 18, and the Clear Glass suites.
- **Pre-existing, identical at HEAD:**
  - `clear-glass-accounts` (1)
  - `test-cg-settings-ui-files` UF-01
  - `test-clear-glass-idle-vs-open` CGI-005
  - `test-intelligence-bridge` (missing module)
- **`data/`:** no test wrote to it. The only writes are this release's Versionium record and its `event_log` line.

## Records
- **Clear Glass version:** 3.14.0 in all five sync points (package.json, spec, `CG_VERSION`, registry `V` + header, `lib/version.js`), plus the pinning test.
- **Spec:** module `selector-assign`, events, handshake 104, and a version_history entry with the Versionium id.
- **Registry:** 2 IPC components + 2 SSE events. `interaction-contract.json` routes regenerated from the registry, after checking the existing ones matched it exactly.
- **Atlas:** a new section. Its version table gets a 3.14.0 row and says plainly that 3.10.0–3.13.2 were never rowed there.

## Not done
- **Live proof on James's machine:** pick the reply on a real ChatGPT chat, assign it, run a job, then see the reply detected → `.response` → Library → Responses.
- **Handoff steps 2–8** (next: automatic repair on `no-reply-element`).
- **Loom's stored registry** predates 0.39.248. The new files aren't in it until loom's bootstrap re-scans.
