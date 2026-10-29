# 0.60.47 — 2026-10-15

James: "Claude's reply not found … it should have poped up with the claude window but didint."

## A reply that can't be found now opens the agent's window

His log showed `job 119a854e — needs-you (claude's page changed: the reply could not be found on it — pick the reply …)`, followed by no `[attention] claude` line. The Claude window never opened.

**Why it didn't open.** There are two ways a job ends up at "pick the reply":
- **The dispatch ladder.** It opened the agent's window with the Nexus picker panel.
- **Job retry.** A job's watch can end with "no reply element". This path only wrote a message on the job, so the window never appeared. This is the path James's Claude job took.

**What changed.** Job retry now opens the window too, using the same request as the dispatch ladder: the provider, reason `map`, the job, the agent, and stage `reply_not_found`. Before asking James, it first checks the chat transcript and the saved response. If the answer is already there, it uses that and asks nobody.

## Proof

- test-reply-not-found-attention: 3/3. RA-01 and RA-03 fail on the old code.
- Unchanged:
  - guardian-retry-novelty-installs: 52 passed, 1 skipped
  - raid-retry-escalation: 9/9
  - plan-code-run-attention: 40/40
- guardian-job-correlation: 2 failures, the same ones that fail on main.
