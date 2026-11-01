# 0.60.344 — TV3: the EMERGENCE channel

James, 2026-11-01: "the tv ui needs the emergence channel"

## What it shows (lib/ui/tv-shell/channels/emergence/)
- **Crystallised.** What Intelligence has found holding:
  - each pattern in Intelligence's own words (the same sentence its log uses);
  - its kind (together, before failure, bottleneck, cause), its count and its confidence.
  - A switch, on by default, hides what Intelligence sees of itself, and counts it. In his boot log of 2026-11-01, "command invoked" was
    "always alongside" everything.
- **Forming.** The liminal spaces where a pattern forms before it crystallises: forming, crystallised, resolved, velocity, and a runaway
  space marked.
- **Runs.** His emergence runs, from his 2026-08-13 idea ("if it can't innovate the problem, innovate the method"):
  - axioms, end state, attempts, method pivots, outcome;
  - kept in the emergence_sessions table since then, with no reader until now.
- A column whose system does not answer says so in red, naming the system. The others still show.

## Built in his order
- **Backend.** lib/emergence.js sessions(). Intelligence's GET /api/intelligence/patterns now carries `said` and `self`.
- **Route.** The orchestrator's GET /api/emergence/patterns | liminal | sessions. The TV asks only :9000 (TV_D1). A silent system is a 503 that
  names it.
- **Commands.** `emergence patterns`, `emergence liminal [--focal L1/L2]`, `emergence sessions [--limit n]`. Agents have the same.
- **Page.** Its own page (TV_D2), appended to the rail as "✦ Emergence" and loaded on tune.

## Found and fixed on the way
- **A saved rail never showed a channel built after it.** Once he had edited the rail, EMERGENCE would never have appeared. A built-in channel
  missing from a saved list is now added at its end. One he hid stays hidden.
- **0.60.341 (CC1) gave a blank view.** Code that set `CS.view = 'changes'` directly, as code before 0.60.341 does, got a blank view. The full
  test suite caught it (test-agent-live). CS.view now maps the old names on every set.

## Said, not fixed
- The inspect overlay (CH_INSPECT) is read by position and has 14 entries for 22 channels. TV2 ends the positional list.
- The orchestrator's forward is checked in its source, not run: the orchestrator cannot be started on a test port.

## Proof
- test-emergence-channel 7/7. The channel was driven in Clear Glass against a stand-in orchestrator, with one system down.
- test-agent-live 5/5 (it crashed before the fix). The Code-tab suites are still green: 17/17, 9/9, 4/4 and 10/10.
