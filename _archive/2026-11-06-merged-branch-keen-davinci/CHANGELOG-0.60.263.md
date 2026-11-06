# 0.60.263 — Click a field, and autofill shows under it

James, 2026-10-26: "And that's in the ui? When you click on name it will show autofill? Copilot will fill it in?" When told it was mapped
but not built, he chose it first: "1".

Map: `docs/2026-10-26-inline-autofill-ui-phasemap.spec` (AF3).

## What it does
- **The chip:** click or tab into a field your active profile fills (name, email, phone…). A small Clear Glass chip opens under it,
  showing the value and what it is.
- **Fill all:** if the page has more empty fields it can fill, the chip also offers **Fill all N fields**.
- **Filling:** a click fills through the native value setter and the input and change events that React and Vue forms listen to.
- **Hiding:** Esc, leaving the field, or scrolling it away hides the chip.
- **When it appears:** after every page load and in-page navigation. A form built late, like Fiverr's, gets one retry.
- **When it never appears:** it never submits, never touches a password field, and never shows on a human-check page.
- **Turning it off:** in Settings (`autofillInline: false`), or per site (`autofill.inline = off`).
- **The co-pilot:** it still fills through "fill this in for me" (0.60.262).

## Your data stays yours
The chip and your values run in an isolated script world, inside a closed shadow root. The site's own scripts cannot read either one: in
the test, the page sees neither. The fields carry only a bare number (`data-cg-af="1"`).

## Proof
`clear-glass/test/autofill-inline.test.js` runs in real Electron, on a real form, with real mouse clicks:
- 3 fields are tagged (first name, last name, email); the password is left out.
- The chip shows "James · First name" and "Fill all 3 fields".
- A click fills "James", the input event fires, and the chip hides.
- "Fill all" fills James, Brooks and j@example.com; the password stays empty.

The autofill (16/16), autofill-active, transfer and agent-doors suites are unchanged.

## Open
AF4: the switch and a default-profile picker on the Settings screen.
