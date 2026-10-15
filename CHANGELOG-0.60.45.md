# 0.60.45 — 2026-10-15

James: "still says signed out. also escape does nothing. also i can't sign in on the popup. i click login and it closes the login. like i cant click anywhere without closing any popup or not letting me navigate. also popup windows in clearglass should look nice like the browser, borderless windowed."

## The provider tab stops fighting the person

Each fix below was traced from James's screenshots back to the source code.

**1. "I click login and it closes the login." The tab was stealing focus.**
- Every attention request ran `show()` and `focus()` on the tab, even when the Nexus panel was already open.
- Guardian's 2-minute cooldown resets every time a provider reconnects, and ChatGPT was dropping and reconnecting every few seconds (the Plan log shows "disconnected mid-flight"). So the request kept coming back, and each time it pulled focus off the sign-in popup or any open menu.
- Now:
  - A panel that's already open is updated in place. The tab is never shown or focused again.
  - While James is using the tab (any input in the last 2 minutes), Nexus doesn't take focus.
  - A sign-in page is no longer sent back to the chat while he's on it. ChatGPT counts as "works signed out", which used to trigger that bounce.

**2. "Still says signed out." The saved sign-in was a signed-out one.**
- "Save sign-in to vault" saved 72 cookies from a tab that wasn't signed in, so switching to that account restored "signed out".
- It now refuses to save when the provider's own site has no sign-in cookie, and it says why. This uses the same sign-in-cookie rule as account sync.

**3. "Escape does nothing."**
- The picker listened for Escape on `document` in the bubble phase, so Idearium's own Escape handlers caught it first. And while picking, every click counts as a pick, so there was no way out.
- Now Escape is caught on `window` before anything else sees it. A right-click also cancels, and the PICKING banner is now a cancel button.

**4. The window.**
- The provider tab no longer shows Windows' File/Edit/View/Window menu, and it's dark before the first paint.
- Fully frameless needs a Nexus title bar above the provider's page. That's CW1: mapped, but not built here, because Electron doesn't run in this container and it has to be checked in Clear Glass.

## Proof

- test-cg-attention-focus: 5/5. AF-01, AF-02 and AF-03 fail on the old code.
- No change in the neighbouring suites:
  - test-profile-tabs: 7/7
  - test-plan-code-run-attention: 40/40
  - provider-account-sync: 9 checks pass
  - test-accounts-picker-cos: 39/40. WR-01 fails the same way on main.
  - clear-glass-accounts: 11/12. Its send() check fails the same way on main.

## Still open

- **Why ChatGPT keeps disconnecting mid-flight (NCP).** That's the flapping that made the focus theft so bad. Fixing the focus removes the symptom, not the cause.
- **CW1:** the frameless provider window.
