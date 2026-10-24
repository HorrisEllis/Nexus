# 0.60.231 — 2026-10-24 — JA4: the learn-loop on screen

James, 2026-10-24: "continue". He said it after the JA3 report, which named JA4 next: "a "pick it" button per missed field in the
Autofill panel, and the list of learned fields per site with a Forget button".

Earlier, 2026-10-19: "if he doesn't understand, have the element picker popup for me to select the element for him. saves to per
site settings ... and updates the autofill."

## What was missing
JA3 (0.60.230) built the pick, but only an agent or a command could start it. No screen showed what a fill could not place, and
nothing showed what had been learned. A taught field could not be undone except by editing site settings by hand.

## On screen (Settings › Autofill)
- **Fill a tab**: after a **Fill** or a **Preview**, each profile field the page did not place gets a **Pick <field>** button. It
  opens the element picker in that tab. The dialog then says one of three things:
  - what was learned, for which site, and how many fields were filled again;
  - that the key looks generated and may be asked again;
  - that a cancel or a refused pick saved nothing, and why.

  The button goes away once its field is placed.
- **Fields it learned**, a new pane: every taught field, grouped by site (`"your code profile" is GitHub URL`). Each has a
  **Forget**, after a confirm. The next fill on that site asks for it again (§0.3 reversible).

## Built (backend → API route → command/agent → UI, his order 2026-10-07)
- **`clear-glass/src/autofill/learn-pick.js`** — `listLearned(siteSettings, url?)` and `forgetLearned(siteSettings, url,
  fieldKey)`, over the store's own `listOrigins` / `getAllForOrigin` / `deleteKey` (no new store, §8.6). Forget removes that one
  entry and leaves the site's other settings alone.
- **`matcher.js`** — `detectFields` reports `needsPick` too, so the preview can offer a Pick before anything is typed.
- **`ipc/bridge.js`**:
  - `GET /cli/autofill/learned[?url]` lists what was learned;
  - `DELETE /cli/autofill/learned?url&fieldKey` and `POST /cli/autofill/forget` share one handler, and emit
    `autofill.forgotten`;
  - IPC `autofill:learned` and `autofill:forget`.
- **`preload/index.js`** — `cg.autofill.pick / learned / forget`.
- **`idearium/cli/route-commands.js`** — `autofill learned [<url>]`, `autofill forget <url> <fieldKey>`.
- **Co-pilot** — `autofill.learned`, `autofill.forget`, so agents have what he has.
- **Loom** — `economy-map.js` edges for the panel → preload → IPC path and the co-pilot → routes.

## Found by the screen test (§0.1)
The panel's `call()` turns any `{ ok:false }` into a toast. So a cancelled or refused pick left "In the tab: click the box…" on
screen and showed only a toast. The Pick now reads its answer directly and says it in place. Only driving the real page showed
this.

## Proof
`tests/modules/test-autofill-learn-ui.test.js` — JA4 **3/3**. The screen is driven in Clear Glass (`clear-glass/src/driver/glass.js`)
over the real `learn-pick.js` and a real per-origin store:
- JA4-01: `listLearned` works across sites (only `autofill.field.*` keys). `forgetLearned` removes one entry, keeps the site's other
  settings, and says when there is nothing to forget.
- JA4-02: Fill leaves GitHub unplaced, and "Pick GitHub URL" appears. The Pick saves `https://micro1.ai` → "your code profile" =
  github in the store, the dialog says so, the button goes, and the "Fields it learned" pane lists it.
- JA4-03: Forget removes the entry from the store and from the list. A cancelled pick says "Cancelled — nothing saved for GitHub
  URL", and the store stays empty. No page errors.

JA3 5/5, JA2 3/3 and JA1 4/4 still pass.

**Not proven here:** the pick's tab in the screen test is a fake. The picker in a live tab is his machine's, as in JA3.

## Open
- The macro home of his "as a macro or automation". Still to confirm with him.
- A real fill on a live listing (his login).
