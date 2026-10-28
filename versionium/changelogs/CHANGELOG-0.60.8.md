# 0.60.8 — 2026-10-13

James:
- "can you have the chaturl logged an reused for agents, unless it is blocked. like i want it to reload using the chat url before it escalates. we need intent routing for the reasoning, for the complex tasks, i feel that is priority, do you?"
- "only if its a good idea. i just want it to be able to use clearglass."
- He agreed to the order: the chat-URL reload first, then intent routing ("88% so please get us there").

## The chat URL reload, before anything escalates

One cause of "keeps losing connection to chatgpt" was found in the source. ChatGPT moves a new chat from `/c/WEB:…` to `/c/<id>` while it is answering. The page script that held the job went with the old page, so the job ended as `page_navigated`, and a person was asked for an answer that was already in the chat.

**What changed:**
- **The chat's URL is kept.** Every poll records the URL the chat is at.
- **Clear Glass reopens the chat.**
  - When the page navigates under a job whose send was pressed, Clear Glass reopens that URL once and reads the answer there. The page script's new `adopt` only reads; it never types.
  - A job that never reached the chat is never reloaded, so an older answer can't be taken for this job's answer.
- **A blocked chat goes to a person.** A sign-in or captcha wall is reported as `no_login` or `captcha`, so you're asked with the real reason, and nothing reloads again.
- **Guardian's ladder reloads before asking you.** Before it escalates a sent job that has no answer, it asks Clear Glass for that reload once, at the job's chat URL (`/agent-mesh/read` with `reload`). A blocked chat still goes to a person, as you said.

**Proof:**
- `tests/modules/test-mesh-chat-reload.test.js` 5/5:
  - a ChatGPT page that navigates mid-answer is read after the reload, typed once;
  - a sign-in wall is reported;
  - the ladder reloads before escalating;
  - "blocked" gives the real reason;
  - a captcha before sending is not reloaded.
- `test-mesh-dom-transport` 16/16 and `test-guardian-dispatch-ladder` 18/18 are unchanged.

## Intent routing for reasoning (`lib/reasoning-route.js`)

This joins pieces that already existed. It doesn't add a fourth router.

**How a request is rated:**
- `lib/intent-classifier.js` (RAID's entry gate) plus deterministic signals rate a chat request as simple, moderate or complex.
- The signals: reasoning words (plan, design, debug, compare, trade-offs, refactor…), length, several asks, code or a stack trace, and many files.
- Each signal is named in the result, so you can see why.

**Where it goes:**
- A complex request goes to the model door as kind `agent:reason`, with the reasoning agent preferred: `routing.reasoner`, else `routing.planner`, and never Ollama.
- The door learns per kind which provider reasons best, and outcomes are reported under that kind.
- Simple requests keep the usual route.
- Builds are unchanged: they already plan with a reasoning agent first.
- `routing.reason_route: off` turns it off.

**What you see:**
- `route assess <words>` (`POST /api/route/assess`) shows the level, the signals, the kind and the agent.
- The reply line says "reasoning: complex" when a reasoning agent was chosen.

**Proof:** `tests/modules/test-reasoning-route.test.js` 9/9. A live call to the door shows `agent:reason` going to claude first, learning (0 of 4 outcomes so far).

**Next.** You said "i just want it to be able to use clearglass". The reasoning agent working through Clear Glass tabs is NV1/NV2 in `docs/2026-10-13-identities-tabs-and-automation-phasemap.spec`.
