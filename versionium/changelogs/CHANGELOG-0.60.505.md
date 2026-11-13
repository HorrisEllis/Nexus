# 0.60.505 — Gemini works without signing in; one place for accounts mapped

James, 2026-11-13: "also gemini doewsnt seem like it needs to be signed in. also all of the accounts, cookies, sign in, all of the logins
needs to be in one place. its fragmented."

## Built
- Gemini registered `loginOptional`, like ChatGPT: `clear-glass/src/providers/registry.js` and Guardian's copy,
  `guardian/lib/provider-attention.js` `LOGIN_OPTIONAL`. A Gemini tab on a sign-in page is sent back to its chat before he is asked; he can
  still sign in from the panel.

## Mapped, not built
`docs/2026-11-13-one-place-for-accounts-phasemap.spec`: the census (about 40 files in Clear Glass, COS, Guardian, lib/ and the Orchestrator;
three vaults; at least four account lists; two copies of which agents work signed out) and AC_D1, where the one place is: Clear Glass, COS's
vault (the coder's recommendation), or a system of its own. His to settle.

## Proof
test-cg-attention-focus 9/9, test-plan-code-run-attention 40/40, test-reply-not-found-attention 3/3. test-accounts-picker-cos 38/42: the same
four checks fail without this change (AT-02, AT-03, AT-04, WR-01).

## Not done, said
- Not live until Clear Glass and Guardian restart.
- Guardian's list is still a copy of Clear Glass's (AC_D2 removes it once AC_D1 is his).

## Also live today (0.60.504, after his "Yes, push and restart")
Guardian, Cortex, Idearium and the Orchestrator came up at their first beat with no /health request. Cortex and the Orchestrator beat later
than the 30 s gate on boot (said, then up). Idearium was marked missed once for 4 s while busy at boot.
- In Versionium (§17.12): vtm-f9e694d9.
