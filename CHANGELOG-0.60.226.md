# 0.60.226 — 2026-10-23 — JA2: the picked field is saved per site, and the fill path reads it back

James, 2026-10-23: "then the phases with the per site settings."

## What was missing
JA1 (0.60.225) made `matchFields` **consult** a learned map, but nothing **saved** one and nothing **loaded** one on a real fill —
so the loop was open at both ends. JA2 closes it for the general application matcher: a field taught once is saved under the
application's **origin** and filled on that site every time after, without being asked again.

## Reuse before build (§8.6)
No new store. The existing `clear-glass/src/site-settings/store.js` (`get` / `set` / `getAllForOrigin`, `normalizeOrigin`) is the
per-site home GA3/GA4 already name. Two pure helpers keep the save door and the fill path on **one** format, so there is one truth
(§10.3), not two copies drifting.

## Built (backend → API route → command/agent, his order 2026-10-07)
- **`clear-glass/src/autofill/matcher.js`** — pure helpers, exported:
  - `learnKey(fieldKey)` → `autofill.field.<fieldKey>` (lowercased, trimmed) — the one key format.
  - `learnedFromSettings(allForOrigin)` → the `{ fieldKey → fieldType }` map `matchFields` already consumes, built from only the
    prefixed keys (unrelated site-settings entries are ignored).
- **`clear-glass/src/ipc/bridge.js`**:
  - `POST /cli/autofill/learn` — `{ fieldKey, fieldType, url? }` → `siteSettings.set(origin, learnKey(fieldKey), fieldType)` under
    the tab's normalized origin; returns `{ ok, origin, fieldKey, fieldType, learned }`.
  - `_pageUrl(agentId)` / `_learnedFields(agentId)` — resolve the tab's URL and load `learnedFromSettings(getAllForOrigin(url))`.
  - `/cli/autofill/detect` and `/cli/autofill/fill` now pass that learned map to the matcher, so a taught field fills on the next
    visit with no prompt.
- **`clear-glass/src/copilot/tools.js` + `copilot/bridge.js`** — the `autofill.learn` tool and its dispatch, so an agent teaches a
  field through the same door a person uses (every capability a person has reaches the agents — his rule).

## Proof
`tests/modules/test-autofill-learn-save.test.js` — JA2 **3/3**:
- JA2-01 `learnKey` / `learnedFromSettings` round-trip, prefix-scoped (unrelated keys ignored);
- JA2-02 a saved pick is **per-origin** (real `SiteSettingsStore`, in-memory persist);
- JA2-03 a saved pick drives `matchFields` to fill a pattern-missed field **end-to-end**.

## Files
- `clear-glass/src/autofill/matcher.js`, `clear-glass/src/ipc/bridge.js`, `clear-glass/src/copilot/tools.js`,
  `clear-glass/src/copilot/bridge.js`.
- `tests/modules/test-autofill-learn-save.test.js`, `tests/modules/run-all.js`.
- `docs/2026-10-19-gig-autofill-and-learn-phasemap.spec` (JA2 addendum); `lib/version.js`, `package.json` — 0.60.226.

## Open next
- **JA3** — on a miss, the element picker pops up (reuse `renderer/selector-check.js` + `selector-assign`).
- **JA4** — the UI for the learn-loop (the fill path already loads `learned`).
- **A real Clear Glass fill** on one live listing — his login, his machine.
