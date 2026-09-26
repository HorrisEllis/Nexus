# NEXUS 0.39.237 — one tab per repo job; no stray ChatGPT windows

**Date:** 2026-09-25 · guardian 3.8.0 → 3.9.0 · clear-glass 3.11.2 → 3.11.3

James, with the 2026-09-25 boot log of a repo-agent job for "ERAVOS v3-17 catalog": *"it shouldn't be opening two instances. this needs to work end to end."* Then: *"next."*

## What the log showed
At 17:33:17.436 guardian dispatched the job to ChatGPT's *active client*. 400 ms later Clear Glass spawned a new ChatGPT window, which connected as `tab=repo-nexus-id-repo-eb5a5d56` and sent `GUARDIAN_REPLAY ack … undefined`. So one job produced two windows.

## Four causes, all fixed
1. **The job went to two places.** `guardian/lib/dispatcher.js` sent a job with an `agentId` to the **shared** tab whenever the repo's own tab hadn't registered yet. In the same call it opened the repo tab "for next time" (the 2026-09-23 trigger). The job ran in the shared window and the new one sat idle, so both stayed open.
   - **Now:** the job goes to its own tab or waits for it. It is queued once, with the reason "waiting for `<agentId>`'s own `<provider>` tab", and delivered by the existing `flushQueuedJobs()` when that tab connects.
   - **Fallback:** the shared tab is used only when Clear Glass can't open the repo tab, or the tab hasn't connected within `GUARDIAN_AGENT_TAB_WAIT_MS` (60 s). That fallback is logged, emitted as `guardian.job.agent_tab_fallback`, and written to the `.job` as `transportFallbackReason`.
2. **Cold start opened the shared window.** With no ChatGPT tab at all, a repo job asked for the shared window, which then caused #1. It now opens the repo tab.
3. **Crashed or closed agent tabs came back as the shared window.** `clear-glass/src/providers/host.js` restarted them with `start(providerId)` and no agentId. They now restart as the same agent tab, hidden.
4. **Idle and evicted agent tabs came back as the shared window.** `closeAgentTab()` (used by the 15-minute idle sweep and the 6-tab cap) didn't mark the close intentional. Five seconds later the close handler started the shared window, so every idle repo tab left a ChatGPT instance behind. The close is now marked `_nexusIntentionalStop`, as `stop()` already does.

**Rejected:** keep sending the first job to the shared tab and just stop opening the repo tab. That removes tab-per-repo, which exists so two repos' jobs don't contend in one chat (the 2026-09-23 timeout).

## Replay retired
- **What it was:** all six userscripts replayed "pending" IndexedDB records on connect.
- **Why it was wrong:**
  - That store is shared by every window on the origin, so a new window re-sent other windows' requests.
  - The records carry `uuid`, not `jobId`, so guardian never matched one. That's the `undefined` in the log.
  - Guardian's handler would have marked the named job **complete with no response** if the fields had ever matched.
- **Now:** the replay is removed from all six userscripts. Guardian logs and ignores a replay from an older installed copy. Restart recovery is guardian's own `.job` files (0.39.225).

## Tests
- `tests/dispatcher-agent-tab-trigger.test.js`: 10/10, up from 5.
  - AT-002 and AT-005 pinned the shared-tab delivery and were reversed.
  - New cases cover: Clear Glass refusing, the deadline, the tab arriving in time, cold start, and no duplicate queue entries.
  - Now registered in `run-all`.
- **New** `test-provider-host-one-tab`: 7/7 against the real `ProviderHost` class (only `electron` is faked). Covers crash, unexpected close, idle sweep and LRU eviction, and that shared-window behaviour is unchanged.
- **New** `test-guardian-replay-retired`: 3/3 against guardian's real handler. The pre-0.39.237 handler fails RR-01.
- **Mutation checks:** each fix was reverted in turn, and each reversion failed the test named for it.
- **Regression:**
  - provider-host-respawn 4/4 (its source pin moved to the fixed line)
  - ncp-handler-sr3 7
  - job-correlation 102
  - chat-sync-agent-routing 8
  - ncp-hostile-payload 5
  - job-persistence 15
  - cg-job-intake 12
  - clear-glass-pressure 12
  - agent-mesh coverage 7
  - version-sync 30
  - record-discipline 9
  - spawn-provider-tab exit 0

## Records
- **Versions:** guardian 3.9.0 in spec, registry and `lib/version.js`. Clear Glass 3.11.3 in all eight places: package.json, spec meta and version history, `CG_VERSION`, registry `V` and header comment, interaction-contract, `lib/version.js`, and package-lock.
- **guardian.spec:** new block `built_2026_09_25_one_tab_per_repo_job`, and the new event added to `events.emits`.
- **Atlases:** guardian and Clear Glass each gained a section.
- **Handoff:** updated.

## Correction to 0.39.228
The home-split equivalence probe compares **40** computed properties, not 45. Corrected in the probe's docstring. `CHANGELOG-0.39.228.md` has an appended correction rather than an edit.

## Not done
- The ping gate pings the provider's active client, not the repo tab the job is aimed at. That's the "ping gate did not clear … dispatching anyway" line in the log.
- A waiting job holds a dispatch-pool slot, as every existing queued path already does.
- `guardian/interaction-contract.json` says 3.5.0 while guardian is 3.9.0. This drift predates this release.
- `test-ncp-handler-sr3` still writes guardian artifacts and ledgers into the real tree. 0.39.236 lists these stores as not yet sandboxed. They were restored by hand here and are not in this commit.
- Live verification on James's machine with Clear Glass running.
