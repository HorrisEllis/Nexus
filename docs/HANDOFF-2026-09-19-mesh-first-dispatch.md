# Handoff: mesh-first dispatch for coding whole code bases (v0.39.156)

Rule from James: **this is for coding entire code bases.** That drove every default below.
Full design + evidence: `docs/2026-09-19-guardian-mesh-first-dispatch-phasemap.spec` (`code_base_scale`, `live_smoke_required`, `known_limits`).
Flow: guardian (source of truth for agents) -> agent mesh (queue, deterministic tab, inject) -> archaeology + DOM-mapping repair -> userscript (NCP) -> user (picker).
Default `GUARDIAN_TRANSPORT=ncp-only` = unchanged behaviour. `mesh-first` enables the ladder.

## Built
Guardian: `lib/agent-registry.js` (+seed), `lib/dispatch-ladder.js`, `lib/mesh-client.js` (async job protocol, UTF-8 safe), `lib/raid-feedback.js`,
dispatcher hook + activity-aware completion watch, `ncp-handler` response cap (env, flagged).
Clear Glass: `src/mesh/page/agent-page.js` (in-page lib), `src/mesh/dom-transport.js`, `src/driver/page-resolver.js`, `agent-mesh.js`
(`sendViaDom` etc., deterministic `contextId`), `main/index.js` endpoints (`/agent-mesh/send|job|diagnose|read`, utf8 body fix).
Tests (all pass): ladder 18, raid-feedback 5, mesh-client+watch 14, agent-page 21, dom-transport 16 (jsdom needed: it is a devDependency).

## NOT VERIFIED (cannot be, without Electron and real sites)
Everything Electron/site-specific: real selectors, `<webview>` resolution, `input[type=file]` availability, provider "Continue" labels, login/captcha
heuristics, provider size limits. **Run the smoke checklist in the spec (`live_smoke_required`) before setting GUARDIAN_TRANSPORT=mesh-first.**
Safety net if it misbehaves: any pre-send failure falls back to the userscript; anything after the prompt is (or may be) sent goes to the user and is never resent.

## Env knobs
`GUARDIAN_TRANSPORT` (ncp-only|mesh-first), `GUARDIAN_MESH_TIMEOUT_MS` (1h), `GUARDIAN_COMPLETION_TIMEOUT_MS` (15 min idle, userscript path),
`GUARDIAN_MAX_RESPONSE_CHARS` (5,000,000), `CLEARGL_IPC_PORT` (7702).

## Open
- Picker UI (renderer/guardian-picker.js) must listen for `GUARDIAN_PICKER_NEEDED` / bus `guardian.picker.needed` and let the user pick the response element or paste it.
- `escalateToUser` is not yet called when the userscript path itself exhausts its retries; hook it into the completion-watch failure branch.
- `mesh._dispatchViaGuardian` must mark its jobs `source:'mesh'` (loop guard) and `/api/copilot/prompt` must pass it through: verify.
- Accounts: `registry.addAccount` exists but nothing calls it yet; wire the account manager to guardian's registry so `job.accountId` resolves.
- Consider a per-provider `inlineMax`/`maxContinues` in the registry once real limits are known from the smoke test.
- Earlier open items (sigma, V7, event_log multi-writer, cortex-side RAID instance) are in HANDOFF-2026-09-19-cortex-intelligence-move.md.


## v0.39.156 addendum: wake relay wired into the mesh path

James: copilot talks to guardian's server.js directly (CLI -> /command); "wake relay needs to be wired in also, and injected into job contents."
What the wake system actually is (read from the code, not assumed): the wake userscript has a LISTENER (originally described as a person typing it; NOT the design: only the AGENT ever says "hey nexus") -> straight to
copilot :3750/api/prompt/tools, model never sees it) and an AGENT HINT (a line injected into what the MODEL reads, telling it NEXUS is reachable and
that it can emit a line starting "hey nexus,"), plus detection of that line in the model's output. All three live in the userscript, so a mesh-delivered
job (no userscript) had none of them.

Built (guardian side, Node-tested; not run against real sites):
- `guardian/lib/wake-hint.js`: the hint, byte-identical to the userscript (test re-extracts it), same per-provider modes (claude off, others once, env override
  `GUARDIAN_WAKE_HINT_<PROVIDER>`). Applied in the ladder to the SENT prompt only, mesh transport only (the userscript path injects its own), once per
  agent tab and only spent when the prompt was sent (a mesh pre-flight failure does not consume it). Never touches the stored job.
- `guardian/lib/wake-loop.js`: for MESH completions only, a line starting "hey nexus," (not prose, not fenced code, not a quote) is sent to copilot
  (`/api/prompt/tools`, same target as the userscript, not lifeline) and answered with a `wake-reply` job for the same agent/account. Depth cap
  `GUARDIAN_WAKE_MAX_DEPTH` (3), idempotent per job, and copilot failing never resends the original prompt. Events: guardian.wake.{detected,replied,refused,failed}.
- Jobs now carry `accountId`, `agentId`, `transport` (only 'ncp' can be pinned by a caller) and `wakeDepth`; `/command` passes them through.
- `clear-glass/src/copilot/wake-relay.js` (agent wake seen in a userscript tab): the reply job is PINNED to the userscript (`transport:'ncp'`) with the wake's account, so it lands in the tab the
  human typed in, instead of opening a different mesh tab under mesh-first.
Tests: test-guardian-wake 14. Existing wake-relay test updated to pin intent (dispatchToGuardian is primary, overlay is fallback); test-nexus-wake has the same 4 failures as before (NW-020/023/027/033/034 area), not touched.

Not done / decisions:
- ONLY THE AGENT says "hey nexus": there is deliberately no human wake path. Scanning user-side text would make the reply (delivered as a user message) retrigger itself. The wake loop reads the assistant's answer only, never the injected reply prompt. Known: the pre-existing Clear Glass wake-relay path has no depth cap of its own (the mesh path has one, GUARDIAN_WAKE_MAX_DEPTH); not touched.
- Confirm live that `job.responseText` is set before `guardian.job.complete` fires for a mesh completion (true in the code path read; tested with fakes only).
- The hint goes in the typed prompt, not the attached file: if a provider truncates a very long typed prompt, the hint could be lost.
- Corrects an earlier statement: `/command` already puts every chat job through a fail-closed RAID approval (in-process); it is not "no gate for chat".
- Lifeline: the log shows `copilot.lifeline` in the ledger right after the job was created, so lifeline is in that copilot path, but James says the CLI goes straight to
  guardian/server.js. Both may be true (different entry points); the 45s lifeline / 90s askSync / (now idle-window) watch stack still applies to the lifeline route.
