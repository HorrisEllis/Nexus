# 0.60.92 - 2026-10-16

_Built on the branch claude/code-tab-run-state-phasemap (PR #91) as 0.60.71; renumbered 0.60.92 at the merge with main (main had already used 0.60.71)._

James: "do it"
Context: the answer to "next I'd add the autopilot idle signal, so auto-update can switch while Nexus is running, or Clear Glass delivery. Which first?" Read as: the idle signal first (Clear Glass delivery follows as its own release).

## What changed
- **`GET /idle` on the autopilot** (`nexus/autopilot.js`, the status port). `idle: true` only when
  - every kernel has settled (none `starting`, `restarting`, or `online` but not yet stable), and
  - Guardian holds no job that is `queued`, `pending`, `dispatched`, `started` or `responding` (the words Guardian really writes; ID-07 checks them against its source).
  It says why when it is not idle. If Guardian is running but does not answer, it says it cannot tell and reports `idle: false`: never a guess.
- **COS asks it** before an auto switch (`httpIdleProbe` in the controller). A Nexus older than 0.60.92 has no `/idle`, so it waits with that reason: "has no /idle yet (it needs 0.60.92 or newer)". After the first switch to 0.60.92, auto-update works while Nexus runs.

## Proof and honest limits
`test-autopilot-idle` ID-01..07 on the real autopilot state with Guardian's job list faked; AU-06 against a real HTTP server in all four cases (no `/idle`, busy, idle, unreachable). NOT seen by this signal: a `/run-tests` run started through the autopilot, an Idearium build, or a person typing: those are not jobs Guardian holds. Not run against a live Guardian here.
