# 0.60.51 - 2026-10-15

James: (a screenshot of Google's sign-in window: "We've detected a problem with your cookie settings.") "can you fix this."

## What the window is

The Accounts sign-in window (`clear-glass/src/accounts/login-portal.js`) on a Google login. It opens at 1100x820, which matches the screenshot's frame. Clear Glass had already fixed this message once (0.60.2, response rewriting in the provider tab); this is a different cause.

## Cause (from reading the code; not reproduced here)

Google's sign-in sets a test cookie on one page and reads it back on the next. Two things wrote into the same cookie jar while the window was open:

1. `account-switch` `beginSignIn` cleared the jar and then reloaded the provider's own tabs to the provider URL. Those tabs are signed out, so each went to Google's sign-in: a second flow in the same jar.
2. The session hub mirrors the normal tabs' cookies into the provider jar live. Google's NID and SIDCC rotate constantly, so a normal tab with any Google page open was copying cookies in mid sign-in.

## Fix

While a sign-in window is open:
- the provider's tabs wait at `about:blank`; closing the window reloads them (`beginSignIn(..., { park })`, `endSignIn`);
- cookies from the normal tabs are not copied into the jar (`SessionHub.quiet`); the other direction still works, so a finished sign-in still reaches the normal tabs;
- the window's session gets the Chrome-not-Electron user agent (it only had it once a provider tab existed);
- the Google cookie changes seen while it was open are logged by name and cause, never a value.

Every other caller of `beginSignIn` is unchanged: parking is opt-in.

## Proof

`clear-glass/test/signin-window-quiet.test.js` (fakes), plus `provider-account-sync`, `login-portal-elsewhere`, `session-hub` still pass.

## Not verified

No Electron and no Google reachable from here. If the message returns, the log line `[login-portal] <provider> - Google cookie changes while the sign-in window was open: ...` shows what touched the jar.
