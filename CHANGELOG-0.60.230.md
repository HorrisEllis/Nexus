# 0.60.230 — 2026-10-24 — JA3: the element picker on a field the autofill missed

James, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per
site settings, and as a macro or automation and updates the autofill." · 2026-10-24: "ja3".

## What was missing
JA1 (0.60.225) made `matchFields` consult a per-site learned map; JA2 (0.60.226) saved a field key into it. But the only way to
teach a field was to type its key by hand (`autofill.learn`). Nothing let him **point at the box**, and a fill never said what it
could not place, so a miss went unreported (§1.2).

## Reuse before build (§8.6)
- **The picker** is `renderer/guardian-picker.js` in its field mode (`pickField`): click near the box, walk the page with the
  arrows, USE or Enter, Esc cancels. `src/providers/attention.js` already drives this mode for provider chats, so this is the
  same script run the same way in the application's tab.
- **What was picked** is resolved to the dom mesh's own field record (`src/dom/archaeology.js` `__cgDomMesh.queryOne`), the
  same record `matchFields` reads. The key it is learned by is therefore exactly what the matcher looks for next time.
- **Stability** uses `renderer/selector-check.js` `looksGenerated` (uuids, digit runs, React ids), loaded the way its own Node
  test loads it.
- **The save** stays the JA2 key format (`matcher.js learnKey`) in the existing site-settings store. It is now **one function**
  (`saveLearned`), and JA2's `/cli/autofill/learn` route calls it too, so the two doors cannot drift.
- New file `clear-glass/src/autofill/learn-pick.js` stands on all four. Nothing existing turned a pick into an autofill field key.

## Built (backend → API route → command/agent, his order 2026-10-07)
- **`clear-glass/src/autofill/learn-pick.js`**:
  - `needsPick(domFields, profile, matches)` → `{ unplaced, unmatched }`. `unplaced` is the profile's field types that hold a
    value but that no field took. `unmatched` is the page's fillable boxes nothing matched.
  - `chooseKey(field, domFields)` picks one of `fieldKeysOf(field)` that **no other field on the page shares** (exactly one
    match, selector-assign's evidence rule), stable first. It falls back to a generated key only when nothing stable is unique,
    and says so (`stable:false`, with a warning). If every key is shared, the pick is refused, with why.
  - `saveLearned(siteSettings, url, fieldKey, fieldType)` is the one save path.
  - `pickAndLearn(...)`: an unknown type is refused before the picker opens. Then the picker opens, the pick is resolved and
    checked (a box that takes text), the key is chosen, the pick is saved, and the page is filled again with the new map. A
    cancel or a refused pick saves nothing and says why.
- **`clear-glass/src/autofill/matcher.js`** — `fillFields` returns `needsPick`; `valueFor` exported (the fill's own value lookup).
- **`clear-glass/src/ipc/bridge.js`** — the IPC `autofill:detect` / `autofill:fill` (the panel's door) now load the learned map too; JA2 had wired only the HTTP routes. `POST /cli/autofill/pick` `{ fieldType, agentId?, profileId?, label? }` and IPC
  `autofill:pick`, both through `_autofillPick`. It emits `autofill.learned` with `by: 'picker'`.
- **`idearium/cli/route-commands.js`** — `autofill pick <fieldType>` (waits up to 5 min for him) and `autofill learn <fieldKey>
  <fieldType>`. JA2 had no command row, so that gap is closed here.
- **`clear-glass/src/copilot/tools.js` + `copilot/bridge.js`** — the `autofill.pick` tool. `_ipcPost` takes a wait, and a pick
  gets 5 minutes because a person is picking.
- **Loom** — `learn-pick` in `copilot-capability-map.js` (its requires), plus the non-require edges in `economy-map.js`: the
  co-pilot → bridge, the command rows → bridge, bridge → learn-pick, learn-pick → guardian-picker (source), and matcher →
  learn-pick (lazy).

## Proof
`tests/modules/test-autofill-learn-pick.test.js` — JA3 **5/5**:
- JA3-01: `needsPick` lists github as unplaced and the oddly-named box as unmatched. A button is not a box.
- JA3-02: `chooseKey` takes the label over the generated name `q_8f3a2c91`. A shared label falls back to the unique name, said
  as unstable. A key shared everywhere is refused.
- JA3-03: on a fake tab, the pick is saved for `https://micro1.ai` only, the refill types github into the picked box, and
  nothing is left unplaced.
- JA3-04: a cancel saves nothing; a button pick and a non-field pick are refused; a typo'd fieldType is refused before the
  picker opens.
- JA3-05: the picker script built from the real `guardian-picker.js` parses, and `fillFields` reports `needsPick`.

JA1 4/4 and JA2 3/3 still pass.

**Not proven here:** the page scripts did not run in a live Clear Glass tab. This container has no Electron display, and his
rule bars Playwright. The real pick is his machine's.

## Readings, to confirm
- His 2026-10-19 words also say "as a macro or automation". GA0b decided that third home for the gig picker. JA3 saves to
  per-site settings and the autofill's learned map (one entry is both), but **not yet as a macro**. That home stays open.
- The phasemap said to "reuse selector-check.js + selector-assign". The learned identity is a field key, not a CSS selector,
  so the live check here is selector-assign's *rule* (the key names exactly one field) applied to the dom mesh's records, with
  selector-check's `looksGenerated` for stability. This is the coder's reading.

## Open next
- **JA4** — the panel: after a fill, a "pick it" per unplaced type (IPC `autofill:pick`, built), and the learned fields per site
  with a Forget (§0.3). The UI is deferred to JA4; said, not hidden.
- The macro home (above), and **a real Clear Glass fill** on one live listing (his login, his machine).
