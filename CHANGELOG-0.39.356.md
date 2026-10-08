# 0.39.356 — 2026-10-05

James: "you're building the capability, not the spec right? need to be able to build phases. i need to be able to add features, capabilites, expand, etc, by mapping to specs."
James: "also the dom mutator/node anchor, or ollama or cpilot stream live into the worksurface panel and code tab."

## The capability, not the spec
Yes. 0.39.355 (PB1–PB5) was the capability: the build ladder, a reply that changed nothing counts as incomplete, a round fails only on what that run broke, and the import check. I didn't build BL8 or any other backlog phase by hand. The pipeline builds each phase from its map.

The limit is the map itself. A phase with no `files:` gives the agent nothing to aim at, and BL8 is one of those. Mapping a feature into a spec with its files is what makes it buildable.

## The agent writing, live (LS1–LS4, in `docs/2026-10-05-cli-data-code-phasemap.spec` 1.6.0)
**What was already there:**
- The guardian feed from 0.39.244: DOM mutations, the node anchor the reply is read from, and the reply text. It reached idearium as `idearium.repo.agent.feed`, but only the Agent tab drew it.
- The Ollama bridge already received tokens as a stream (0.39.289), but held them until the reply was done.
- Copilot polled the job and saw nothing until the end. So a phase built by Ollama showed nothing while it was being written.

**Now:**
- **LS1, the bridge.** A running job keeps what has been written so far, in `job.partial` (and `partialThinking`), token by token, in every round, including the retry and the continuations. Each is capped at 200k characters.
- **LS2, copilot.** When the caller gives a `streamUrl`, the tool loop reads the job every 500 ms and sends the new part. It also sends each model turn's start and end. The sink is loopback only, fire and forget, like the CT8 tool-call sink. The repo agent sends `streamUrl`.
- **LS3, idearium.** `POST /api/repos/:uuid/agent/stream` puts it on `idearium.repo.agent.feed`, with the same shape as the guardian feed and SSE only. So the Agent tab, the Code tab and the Plan all read one feed, whichever model is writing.
- **LS4, the page.** A live strip in the **Code tab** (above activity) and in the **Plan panel** (above the work surface) shows:
  - writing or idle, with a blinking dot
  - the provider and model
  - the job
  - for a browser agent, the **DOM mutation count and the node anchor** (the hover shows its attributes) and the last stage
  - the text as it's written

  It follows the newest line, and stays put when you scroll up. It's one state, the Agent tab's, painted in place.

## Proof
- **`tests/modules/test-agent-live.test.js`, 4/4.**
  - **LS-01:** a stub Ollama streams three tokens and each reaches `onDelta`; `job.partial` grows; the cap is counted.
  - **LS-02:** copilot's poll, verbatim, sends `dispatched` → three chunks whose text joins to the reply with nothing repeated → `complete`; a non-loopback sink is refused.
  - **LS-03:** idearium's real router broadcasts it SSE-only in the guardian shape; 400 and 404 behave.
  - **LS-04, in Clear Glass** (the real `code-surface.js` and `plan-panel.js` with the feed code from `app.js`, verbatim):
    - the Ollama text streams into both places, and a repeated character is kept
    - a complete turn goes idle
    - a guardian frame shows `mutations 42` and its anchor
    - a new job starts clean
    - the strip follows the newest line, and stays put when scrolled up
    - another repo's frame isn't shown
    - nothing threw
- **`test-agent-feed` 19/19.** Its stub `document` gained `querySelectorAll`, for the live slots.
- **Also green:**
  - test-code-tab 16
  - test-live-stream-and-gates 13
  - test-route-contracts 4
  - test-repo-agent-provider 67
  - test-repo-agent-late 17
  - test-reply-continuation 7
  - test-escalation-ladder 9
  - test-plan-lands 17
  - nexus-seam 13

## Needs a restart
The bridge, copilot and idearium all changed. Restart `start:all`.

## Versions
- idearium 4.32.0 (MINOR)
- copilot 3.9.0 (MINOR)
- ollama-bridge 1.1.0 (MINOR)
