# HANDOFF — 0.39.272 → next session

**Base:** `nexus.zip` (0.39.272, built on James's 0.39.271). **Map:** `docs/2026-09-27-clearglass-whole-copilot-learning-phasemap.spec` (phases A1–A5, B1, C1, L1–L5, X1). **What shipped:** `CHANGELOG-0.39.272.md`. Read `docs/CLAUDE.md` first: map first, reuse first, wire the registry, addend the specs, lose nothing.

## Remaining work, in order

**1. Loom map, with wires (rule 3).**
- Create `loom/maps/clearglass-whole-map.js`, mirroring `loom/maps/agent-memory-map.js`.
- Add its FILES to `loom/bootstrap.js` in both places: the scan exclusion and the `map…(driver)` call.
- Components and their real edges:
  - `clear-glass/src/ipc/handler-registry.js` ← required by `clear-glass/src/ipc/bridge.js` (install) and `agent-routes.js`
  - `clear-glass/src/ipc/agent-routes.js` ← `ipc/bridge.js`; it requires nothing, and its deps are injected
  - `clear-glass/src/page/reader.js` ← `driver/index.js` (`_readPage`)
  - `lib/cg-learning.js` → `cortex/memory/jaa-db` (id `nexus.cortex.jaa-db`); ← `lib/agent-tools/tools/clear-glass/browser.js`, `learned.js`, `copilot/lib/copilot-context.js`
  - `lib/context-atlas.js` → `jaa-db`, `lib/agent-memory.js` (`search`), `lib/repo-context.js`, `lib/vector-memory.js`, `clear-glass/src/downloads/artifact-chat-index.js`; ← `lib/repo-agent.js` (`atlasFor`), `idearium/api/index.js`, `copilot/routes/opportunity.js`, `lib/agent-tools/tools/query/context-atlas.js`, `copilot/lib/nexus-awareness.js`
  - `lib/opportunity/*` (8 files) → `jaa-db`, `lib/agent-tools/tools/clear-glass/browser.js`, `clear-glass/src/autofill/proposal.js` (`PLATFORM_GUIDE`); ← `copilot/routes/opportunity.js`, `cli/opportunity.js`, `tools/opportunity/opportunity.js`, `learned.js`, `copilot-context.js` (L8)
  - `copilot/routes/opportunity.js` ← `copilot/server.js`
- HTTP edges the scanner cannot see:
  - `lib/agent-tools/tools/clear-glass/browser.js` → Clear Glass :7702 (`/cli/driver`, `/cli/page/read`, `/cli/state`, `/cli/invoke`)
  - `clear-glass/src/copilot/bridge.js` → copilot :3750 `/api/tools/run`; → :7702 `/cli/*`
  - `clear-glass/renderer/browser.js` → :3750 `/api/opportunity/capture`
  - `lib/opportunity/draft.js` → :3750 `/api/prompt/resolve`, `/api/prompt`
- Verify with a fresh bootstrap: the unresolved-wire count must not rise against 0.39.271.

**2. Spec addenda (rule 4)** — a dated `## ADDENDUM 0.39.272` as a YAML comment in each spec below:
- `clear-glass/spec/clear-glass.spec`: agent-surface, handler-registry, driver actions, pane results loop, capture command
- `copilot` spec: L7/L8 layers, `DEFAULT_CHAT_TOOLS` (+17), `/api/tools/run` `agent`, `/api/opportunity|context/*`, scheduler
- `idearium` spec: `/api/context/*`, `/recall` and `/atlas`, the preview now includes memory and atlas
- `repo-prompt-blocks` 1.1.0
- `agent-memory`: new `search()`

Then:
- **New specs:** port `docs/opportunity.spec` and `docs/context-atlas.spec` from the first pass (in the 0.39.258-based zip; rename `{memory}` → `{atlas}`), and add `docs/cg-learning.spec`.
- **Register** all three in `docs/SPEC-REGISTRY.spec` / `.md`.

**3. Tests.**
- **`tests/modules/test-context-atlas.test.js`:** port it from the first pass. `memoryFor` → `atlasFor`, the `context-memory`/`{memory}` block → `context-atlas`/`{atlas}`, and `excludeAgent` now keeps the repo's own exchanges out.
- **New `tests/modules/test-cg-learning.test.js`:**
  - observe/hints (a worked selector un-fails a failing one)
  - heal: learned label first, then page label/text; a tie is refused; the upload/select type filters apply
  - `recordFlow`: 3+ steps, the password becomes `{{password}}`, the same shape merges and counts
  - `toMacroSteps`: refuses an unmappable step
  - the browser tool heals once and returns `healed` (use a stub :7702)
  - `forget`
- **Opportunity additions:** `learnedWeights`, where 3 or more outcomes move the score with a stated reason; `effectiveProfile`, where the autofill identity fills only empty fields; `editedExamples` feeding `{examples}`.
- **`/cli/invoke`:** list, deny `accounts:portal:credentials` (403), unknown channel (404), timeout, and a handler that needs `e.sender`.
- Register every suite in `run-all.js` and silence `[jaa]` output.

**4. Pane learning gap.**
- Actions the co-pilot pane runs (`clear-glass/src/copilot/bridge.js` `_executeCommand` → driver) are not recorded as site memory.
- Fix: after each driver result, fire-and-forget a POST to copilot's new `/api/learned/observe` (add it to `copilot/routes/opportunity.js`, calling `cg-learning.observe`). Keep copilot the single writer. Optionally heal on "not found" in the pane the same way `browser.js` `act()` does.

**5. Full regression.**
- Run `tests/modules/run-all.js` on 0.39.271 and on this tree, and compare each suite.
- Known pre-existing failures: `test-composed-prompt` CP-101, the two version-sync checks, and `clear-glass-accounts` 1.

**6. Live checks James should run** (nothing here was run live):
- **Clear Glass up:**
  - `curl :7702/cli/state`
  - `curl ":7702/cli/invoke?q=window"`
  - `POST :7702/cli/invoke {"channel":"window:maximize","agentId":"default"}`
  - `POST /cli/page/read` on a job form
  - `upload` into a file input (CDP debugger attach)
- **Copilot:** in chat, ask "what's open in clear glass", "read this page and fill it, don't submit", then "what have you learned about <site>".
- **Pipeline:** `node cli/opportunity.js profile set autofillProfileId=<id>`, then `node cli/opportunity.js cycle`, then `node cli/opportunity.js status`. The job APIs have not been tested live.

## Decisions to keep
- Approval is `by:'user'` only. An agent submits only when the policy is `auto`, plus `acknowledgeTos` on LinkedIn, Indeed, Upwork, Fiverr and Freelancer.
- Fiverr/Upwork replies are typed into the box and never sent by the agent.
- `/cli/invoke` denies only credential saving. No route ever returns a decrypted password.
- Learning is evidence only: every hint names its observations, can be forgotten, and never overrides recipes, macros or James's settings.
- `{memory}` (the agent's own work, 0.39.269) and `{atlas}` (everything else) never send the same line twice.

## Version bookkeeping
- `lib/version.js` system is 0.39.272; clear-glass is 3.18.0.
- The service versions for copilot and idearium were not bumped, because of the same four-sync-point drift noted in 0.39.269. Decide whether to bump them together with the spec addenda.
