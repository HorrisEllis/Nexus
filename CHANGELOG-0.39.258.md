# NEXUS 0.39.258: the second job completes; the agent is sent only what you can edit

**Date:** 2026-09-26 · guardian 3.14.0 → 3.15.0 · copilot 3.6.0 → 3.7.0 · idearium 4.7.0 → 4.8.0 · userscripts chatgpt/claude 10.9.0, gemini/perplexity/deepseek 10.8.0

James, live on 0.39.257:

> *"progress. didn't work a second time. the paste, shouldn't be injecting. only injecting the persona and the .inject nodes set in the agent tab and settings"*
>
> *"not to inject anything into it that i cant edit in the agent settings"*

## Fixed — the second job waited forever

The first reply was read from the chat transcript, but the job never finished completing:

```
completing job 429f67be… from the transcript failed: ENOENT … mkdir '…\conversations\https:\chatgpt.com\c\6ab74053-800c-83e8'
```

- **Cause:**
  - A transcript completion carries `chatUrl`, not `chatId`.
  - `ncp-handler.js` used the URL itself as the conversation-log folder name, and on Windows the colon makes `mkdir` throw.
  - The throw came after `job.status = 'complete'` was set but before `guardian.job.complete` was emitted.
  - So the one-job-per-tab pool never released the tab. `ping` sat at the "tab takes the job" gate.
- **Fix:**
  - The session id is now the URL's last segment, which is the chat id.
  - `lib/queue.js` and `lib/ico.js` turn any id into one safe folder name, so a colon, a separator or `..` can no longer reach `mkdir`.
  - A conversation-log failure is warned about and never stops a completion.
- **Why the tests missed it:** they stubbed `logConversation` as a no-op, and on Linux a colon is a legal filename character. CP-002 now writes through the real queue with the exact failing id.

## Changed — the prompt is only what Settings → Agents shows

**What the paste contained, and where each part came from**

1. **`[NEXUS CONTEXT]`** — added by the userscript.
   - A repo job's hat has an empty persona on purpose, because the persona is already in the prompt (0.39.255).
   - The userscript read the empty hat header as "no hat" and prepended its generic context blob.
2. **Copilot's tool-loop system prompt** — the identity line, "ALWAYS look for a tool", the tool guide and `USER:` labels.
   - Every tool round also re-pasted the whole history into the same tab.
   - The `tool-guide` inject_rule node existed, but nothing ever read it.
3. **The persona and protocols** — the only intended part.
4. **`[NEXUS] … "hey nexus,"` footer** — added by `NEXUS.decorate`.
   - This is why ChatGPT's whole reply was "hey nexus, 👋".

**What replaces them**

`lib/repo-prompt-blocks.js` holds the repo agent's whole prompt as ordered blocks:

- persona
- @learn protocol
- .inject protocol
- how to call a tool (browser agents)
- tool guide
- code matched from this repo
- project map
- the question
- tool-result frame (follow-up rounds)

Each block can be switched off and has fully editable text. The defaults are the exact text each layer sent before this release.

**Placeholders**

Placeholders are the only text not typed by James. Each one is data, shown in the editor. Deleting a placeholder means that data is not sent.

- `{persona}` — the generated hat persona. It can't be edited in place because a refresh rewrites it, so keep it, write around it, or replace it.
- `{message}` — the question.
- `{code}` and `{map}` — `lib/repo-context.js` retrieval in bare mode, data lines only.
- `{tools}` and `{tool_guide}` — filled by copilot from the agent's scope.
- `{name}` and `{result}` — in the tool-result frame.

**Nothing downstream adds text to a composed job**

- **copilot** (`body.tools.composed`):
  - no system prompt, identity or turn labels;
  - round 1 is the prompt as composed;
  - later rounds carry only the new tool results, in the `tool-result` frame;
  - Ollama gets the raw prompt, with no `SYSTEM CONTEXT / USER / NEXUS CO-PILOT` frame.
- **guardian userscripts** (hat `personaInPrompt`): no context blob, no tools header, no wake hint.
- **guardian mesh** (`wake-hint.js`): no hint.
- **inject-resolve side question:** it now goes to the repo's own tab with its hat, so it is treated as composed too.

**UI**

- Settings → Agents → **what the agent is sent** is a new area with its own JS and CSS files (`idearium/ui/js/agent-blocks.js`, `idearium/ui/css/agent-blocks.css`).
  - Each block has a toggle, its full text and a reset.
  - **preview what is sent** shows the exact first message for a question, built by the same `compose()` the dispatch uses.
- The new routes are `GET/POST /api/repos/:uuid/agent/blocks` and `POST /api/repos/:uuid/agent/blocks/preview`.

## Changed — the two gaps left in the first cut, closed

**The "copilot" switch position.** Before, it sent the prompt through copilot's plain `/api/prompt` path. That path adds user model, session history, recall, mastermind and intent routing, and none of it is editable in the agent settings.
- Now idearium asks copilot which backend its default resolves to, via the new `GET /api/prompt/resolve`.
- The composed prompt is then sent straight to that backend: `auto` goes to ollama, `guardian` lets guardian's RAID pick, and a named agent goes to that agent.
- So copilot still decides **who** answers. Only the repo's blocks decide **what** is sent.
- If copilot can't answer the resolve call, nothing is sent and the Agent tab says why. There is no fallback to the injecting path.
- The Agent tab reply line shows `copilot → <backend>`.
- **Trade-off:** lifeline's low-confidence escalation (from ollama to guardian) does not apply to a composed prompt.

**"Where does this code go?"** This is the side question asked when the agent writes a code block without a path.
- It is now the repo's editable `inject-resolve` block, with placeholders `{question} {symbols} {candidates} {syntax} {code}`.
- A line whose placeholders all come out empty is dropped, so the template needs no conditionals.
- It is sent on its own, not wrapped in the persona and all the other blocks again.
- If you switch it off, the agent is never asked and the code waits unresolved for you to place.
- `repo-inject.js resolvePrompt` now renders this block, so there is one definition.

## Tests

- **test-composed-prompt:** 20/20.
  - **CP-0xx — the second-job bug:** a real `mkdir` using the failing id, and completion surviving a log throw.
  - **CP-1xx — blocks and compose:** every output line is block text or placeholder data; disabled blocks are not sent; edits are sent as typed; edits persist and reset.
  - **CP-2xx — copilot composed mode:** round 1 is the prompt as-is and round 2 is only the templated result; the non-composed path is unchanged.
  - **CP-3xx — guardian adds nothing:** mesh hint and all five userscripts.
  - **CP-4xx — copilot position and side question:** resolves to a named backend and sends composed; sends nothing when copilot can't say; the side question is the editable block, sent alone.
- **Real Chromium:** `tests/probe/agent-blocks-chromium.js`, 13/13.
  - It loads the real `agent-blocks.js` and CSS, backed by the real `repo-prompt-blocks` and `compose()`.
  - It checks: every block listed, open/edit/untick, save stores, "edited" mark, the preview shows exactly the blocks, reset, no page errors.
  - It is the area on its own, not the whole idearium page.
- **Mutations:** 15 applied, each caught.
- **Regression:** 21 related suites are identical to the 0.39.257 baseline.
  - Updated for the intended change:
    - `test-agent-tools-and-graph` AT-08, AT-09 and AT-13: no identity line; composed dispatch; auto resolves through copilot and is enforced.
    - `test-repo-agent-provider`: auto asks copilot; new switch wording.
- **Failing before this change and still failing identically:**
  - copilot-provider-toggle T-012, which is the boot vitals failure;
  - nexus-wake NW-020/033/034;
  - repo-context "names a function".

## Not done

- **Not proven live end to end:** the new area has been proven in Chromium, but not a real ChatGPT turn through the whole stack.
- **The learning work planned for this release moves to 0.39.259.**
