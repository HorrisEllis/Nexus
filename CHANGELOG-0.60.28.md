# 0.60.28 — 2026-10-13

James: "can we work on inventing anything that will get this pipeline going. like why doesn't this work yet?"

## Why it didn't work

This is the coder's reading of every run he pasted this session.

The agents answer. In those logs ChatGPT finished 38 jobs and Gemini 16. The problem was how the pipeline used them. It
gambled twice:

1. **A run started without knowing its parts were ready.**
   - SB9: the ladder climbed into Claude, whose page was waiting on his ◎ pick, so it gave an empty reply. Then it
     climbed into DeepSeek, which had no tab and was behind a sign-in wall. Ladder exhausted. Guardian knew both before
     the run began.
2. **When the planner failed, the build fell back to its hardest mode.** One chat agent explored the whole phase alone,
   one tool call every 15 seconds. BL30 ended there: a placeholder file in the wrong place, `incomplete`.

Both go against his rule: deterministic first, an agent only where it is needed.

The coder offered two fixes and recommended the order. He chose **"A then B (Recommended)"**.

## A: ready before run (PF1)

Before the first agent call, the build asks Guardian which agents can take a job now
(`GET /api/providers/ready`, `guardian/lib/provider-ready.js`).

| Guardian sees | The build does |
|---|---|
| a sign-in wall | leaves that agent off, and says so |
| every account in its chain resting | leaves it off, with when the first account is back |
| a usage limit with no other account | leaves it off |
| its last job waiting on your ◎ pick | **tries it last.** It is never left off: once you pick, it works again, and Guardian cannot see the pick. |
| no tab yet | keeps it; the tab is opened when the job comes (0.60.25) |

What follows from that:
- A planner that isn't ready is replaced by the first ready agent.
- If no agent can plan, the plan is written without a model (B).
- If no agent on the ladder can answer, **the run does not start.** It is refused (`NOT_READY`), and the Plan says what
  to fix.
- If Guardian doesn't answer, nothing is changed, and the run says readiness was not checked.
- Critical memory is said on the run but not acted on. Dropping the local models would send every file to a paid agent.

Where to see it:
- **The Plan:** each run has a `ready:` line, for example "left off: deepseek (deepseek needs a sign-in …) · tried
  last: claude (claude's last job waits on you …)".
- **The command:** `providers ready` shows every agent: ready, last, or not, with the reason.
- **The route:** `GET /api/providers/ready` in Idearium (Guardian owns it).

## B: a plan without a model (PF2)

When no planner is ready, or the planner fails, Nexus now writes the plan itself (`lib/phase-plan.js` `derivePlan`):
- the files the phase names (`files:`), or else the file paths its text writes;
- each file's registry component, or "new" with a layer read from its path;
- an existing file keeps every export it already has;
- the steps are the phase's `does:` and its bullet points;
- the conditions are that each file is there, with the phase's `proof:` attached.

That plan goes through the same `parsePlan` check a model's plan does. The build then goes one file per request
through the contract, as before. It never hands the whole phase to one agent. The Plan shows "◇ planned without a
model" and why.

**A phase that names no file is not guessed at.** Building the wrong file is worse than not building. Its reason says
what to add: `files:` in its block. BL30 is exactly this case. It still takes the old path, and says so.

## To confirm

These are the coder's calls; he can override any of them:
- **A ◎ wait goes last, not off.** The reason: Guardian cannot see the pick, so a drop could last forever.
- **A phase that names no files still falls back to one agent exploring the whole phase.** It is said on the run, but
  it is not stopped. Stopping it is the other option.

## Proof

- `test-contract-phase-build` runs on the real build route, with only the model stubbed:
  - **CP-07:** Claude, the planner, is behind a sign-in wall. No planner is asked. Nexus plans the phase itself, only
    coder requests go out, and the phase ends `contract-complete` through its proof run. The Plan shows the readiness
    line and the derived plan.
  - **CP-08:** every ladder agent is not ready. The build answers 409 with each reason, no agent is asked, and the
    refused row carries what was left off.
  - CP-01 to CP-06 are unchanged and pass (8/8 in total).
- `test-run-ready` 10/10:
  - Guardian's reasons;
  - a ◎ wait goes last, clears on a later completed job, and expires after 2 h;
  - the ladder: dropped, moved, order kept;
  - the planner swap, and no planner;
  - Guardian down changes nothing;
  - derivePlan: named files, kept exports, import order, BL30 not guessed at, and paths taken from the text.
- **Unchanged and green:**
  - the phase build: chunked-phase-build 15, escalation-ladder 9, plan-code-run-attention 40, draft-review 12, shadow 16,
    contract-adapters 11;
  - the Plan and build surface: build-surface 13 + 3, run-watch 5, phase-cost 5;
  - Guardian and routing: guardian-stack-sim 11, economy-guardian 5, dispatcher-ping-gate 4, dispatcher-deepseek 4,
    account-fallback 7;
  - cg-command-index 2, loom-map 19.

  guardian-mesh-client MC-011 fails, the same as before this change.

## Also

`scripts/precommit-check.js` blocked any commit that touched `guardian/server.js`, calling it "crashes on require()". The
check's own 8 s timeout stops Guardian, which comes back as exit status 143 (128 + SIGTERM) rather than as a signal. That
is now read as the stop it is. The real crash check is unchanged.

Not yet: a run on his machine. The new Plan line has not been looked at in Clear Glass.
