# NEXUS 0.39.239 — the download manager files every response under its agent, and shows it

**Date:** 2026-09-25 · clear-glass 3.11.3 → 3.12.0 · guardian 3.9.1 → 3.9.2

James: *"the download manager in clearglass needs a ui so i can actually see this visually"* and *"the download manager should be routing the response to the agent or compartment id."*

## What already existed (mapped first)
- **The writer:** since 2026-09-20, guardian writes every completed agent reply into Clear Glass's downloads index (`clear-glass/src/downloads/artifact-chat-index.js`, a `.response` file per item in the COS compartment `clearglass-downloads-index`). The agent id sits inside `raw`.
- **No reader:** nothing read the index back.
- **The manager window:** the Library (tray → ⬡ Library) was the existing download manager window. Its Downloads tab lists browser downloads only.

## Built
- **Agent and job are fields** (`agent_id`, `job_id`). Records written before this release are read from `raw.agentId` / `raw.jobId`. `queryItems` filters on them. `readItem(root, id)` returns one full record and refuses ids that could leave `responses/`.
- **One root resolver.** `defaultRoot()` now decides where the index lives. Guardian's writer (`code-artifact.js`), guardian's reply recovery (`response-sink.js`), the new routes and download capture all use it; before, each of the four resolved it on its own.
- **Read routes on Clear Glass:** `GET /cli/downloads/responses` (filters `agentId`, `jobId`, `provider`, `kind`, plus a count per agent) and `GET /cli/downloads/responses/:id`. They're read-only. The registry grows from 97 to 99 entries, and the contract's routes are regenerated from the registry.
- **Library → Responses tab** (`ui/library/areas/responses.js` + `.css`, in the one-JS-one-CSS-per-area layout):
  - Every reply and every provider-tab download, by agent, with an agent filter.
  - VIEW shows the prompt, the reply, and each code block.
  - `library-app.js` exposes its existing helpers once (`window.LIB`) so the tab reuses them rather than copying them.
  - The Downloads tab now shows the agent a download belongs to.

## Fixed on the way
- **Downloads announced twice.** Every window of a provider (the shared one and each repo tab) uses one session, and `ProviderHost.start()` added a `will-download` listener per window, so each download was announced once per open window. `attach()` is now once per session.
- **Downloads had no agent.** A provider-tab download now carries the agent id of the tab it came from. ProviderHost resolves it from its agent-tab map, and the download is recorded in the index under that agent. Files up to 10 MB are copied in; larger ones are recorded by path.
- **Wrong agent in the ledger.** The ledger recorded the provider name ("chatgpt") as the agent.
- **A test rewrote real data.** Starting the bridge wrote `data/clear-glass/command-index.json` to the real tree, ignoring the test sandbox. It now honours `NEXUS_DATA_ROOT`, the same fix 0.39.236 applied to other stores.

## Tests
- **New** `test-downloads-responses`: 15/15.
  - Guardian's real writer puts a reply in; Clear Glass's real bridge (started on a free port, only `electron` faked) serves it back over HTTP.
  - Records from before this release are still attributed to their agent.
  - The real download capture runs with two windows on one session.
  - **Mutation checks:** each of the following was reverted in turn, and each reversion failed its own test:
    - a listener per window
    - the provider named as the agent
    - old records losing their agent
    - no id guard
  - Against the 0.39.238 code it fails at the first step (`defaultRoot` doesn't exist).
- **Headless Chromium:** the Library's Responses tab against the real bridge on :7702 with seeded replies. Both replies are listed by agent, the filter narrows to one, VIEW shows the reply and its code block, and there are no console errors.
- **Regression:**
  - clear-glass-library-ui 24
  - screen-qa-ui 27
  - code-artifact 46
  - response-sink-passthrough 9
  - phasemap-diagnosis-facts 10
  - provider-host-one-tab 7
  - job-correlation 120
  - version-sync 30
  - record-discipline 9
- **Pre-existing:** `architect-spec-builder-theme` fails identically on 0.39.238, because `jsdom` isn't installed here.

## Records
- **Versions:** Clear Glass 3.12.0 in nine places:
  - package.json
  - spec meta and version history
  - the spec's `components_count` (97 → 99)
  - `CG_VERSION`
  - registry `V` and its header comment
  - interaction-contract
  - `lib/version.js`
  - package-lock
- **guardian 3.9.2** with a spec note.
- **Clear Glass atlas** has a new section.
- **Handoff** updated.

## Next
The idearium Agent tab should pick up a reply that arrives after copilot's wait has timed out, from this index by agent and job, instead of staying on "thinking…".
