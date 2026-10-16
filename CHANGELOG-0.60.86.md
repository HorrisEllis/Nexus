# 0.60.86 - 2026-10-16

_Built on the branch claude/code-tab-run-state-phasemap (PR #91) as 0.60.65; renumbered 0.60.86 at the merge with main (main had already used 0.60.65)._

James: "can you make a bunch of jobs for me for clearglass."

## What I read
Ready-made Automation templates (Settings > Automation > From template), chosen from what went wrong in your own logs, not generic ones. To confirm: if "jobs" meant agent jobs or Guardian jobs, say so.

## The five
- **New Nexus release is out**: every 6 h asks GitHub for the latest release and notifies when the version changes (you were 17 releases behind because nothing told you). First run only remembers.
- **Ollama is up and has its models**: every 30 min; says when `nomic-embed-text` is missing (`ollama pull ...`) or Ollama is down.
- **Guardian jobs are failing**: every 15 min; notifies above a limit with the count and the newest error.
- **Start chat capture when Clear Glass starts**: calls `chat-crawl start` for one account; says why if the account's switch is off.
- **Chat capture: weekly report**: Monday 9:00, notifies the crawler's numbers. Changes nothing.

## Proof and honest limits
- `test-clearglass-jobs` JB-01..06: each validates and RUNS on the real automation engine with the network stubbed; each notifies when it should and stays quiet when it should.
- Not run against the real GitHub, Ollama, Guardian or Clear Glass. The two chat-capture jobs call Clear Glass on :7702 (the bridge port) which I read from the code, not confirmed live. A private GitHub repository needs a token header on the release job.
