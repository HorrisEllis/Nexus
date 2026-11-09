# 0.60.467 — Clear Glass: the ChatGPT Google sign-in loop

James, 2026-11-09: "clearglass is having a login loop with chatgpt, like when i click log in with google, it loops back to the login page. over and
over, when i use the guardian agents menu in clearglass to open chatgpt."

## What was wrong (reproduced before the fix)
ChatGPT is set to work signed out, so a ChatGPT tab on a sign-in page was sent back to the chat, unless the window was seen as his. Opened from
the Guardian agents menu, the window is shown but focus stays on the menu, so it wasn't seen as his. Then every step of Continue with Google sent
the tab back to the chat:
- `chatgpt.com/auth/login_with`;
- `auth.openai.com/authorize`;
- `accounts.google.com`.

The chat sent it to its login page again, which is the loop.

He pasted a replacement from another assistant that recognized only `chatgpt.com/auth/login_with`. The reproduction showed the tab was also sent
back from the next two steps, so that fix alone would still have looped.

## Fixed: `clear-glass/src/providers/attention.js` 1.5.0
A sign-in in progress is never navigated. That covers:
- Google's, Microsoft's or Apple's own pages;
- the provider's OAuth handoff and callback;
- OpenAI's sign-in service past its landing page.

A login landing (`chatgpt.com/auth/login`, `auth.openai.com/log-in`) is still sent back once and then left for him, as before (0.60.321).

## Proof
- `node tests/modules/test-cg-attention-focus.test.js`: 9/9.
- AF-02e is new, and fails on the old code (4 of 5 sign-in steps sent back).
- AF-02 to AF-02d are unchanged.
- Also unchanged: guardian-field-pick 5/5, ncp-half-open 3/3, plan-code-run-attention 40/40, semantic-field-map 5/5.
- Found, already failing on main before this: test-accounts-picker-cos AT-02, AT-03, AT-04, WR-01.

Not yet run on his machine: the live Google sign-in.
