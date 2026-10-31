# 0.60.321 — the ChatGPT agent tab stops bouncing between sign-in and the chat

James, 2026-10-31, with two pictures of the ChatGPT agent tab (its sign-in page, then a spinner):
> "chatgpt does the second and third images over and over. please fix."

## The cause

ChatGPT is registered as `loginOptional`, from his 0.60.2 call, "chatgpt doesn't need a login currently". So
`clear-glass/src/providers/attention.js` sent a tab on a sign-in page back to `chatgpt.com`, which is the spinner.

chatgpt.com now sends a signed-out visitor straight to its sign-in page. The tab came back, and the next attention request, a minute later,
sent it back again. That happened under him while he was signing in.

## Fixed

Decided by the run's evidence (§0.1): once a send-back lands on a sign-in page again, the provider does not work signed out on this
machine now.
- It is remembered, its sign-in page is left alone, and he is asked through the panel.
- It is forgotten when he answers "signed in" or "go on signed out", and the next sign-in page is judged afresh.

The registry's `loginOptional` stays as it is. It is a fact about the site that the run can overrule; it is not rewritten here.

## Proof

- `tests/modules/test-cg-attention-focus.test.js` **8/8**. The new AF-02d uses a ChatGPT that bounces a signed-out visitor to sign-in: the
  tab is sent back once, then never again.
- Against the old attention.js, AF-02d fails.
  - The old code's 60 s throttle is fixed in its source, so the test can only show the missing "does not work signed out" step. It cannot
    replay the minute-later repeat.
- `test-plan-code-run-attention` 40/40.

## Open

- **`test-accounts-picker-cos`:** AT-02, AT-03, AT-04 and WR-01 fail on main without this change. Said here, not yet traced.
- **Not checked on his machine yet.** If the tab still loops, the attention log line names which path moved it.
