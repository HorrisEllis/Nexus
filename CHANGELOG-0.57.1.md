# 0.57.1 — 2026-10-10

James: "okay lets get idearium working." · "huge idea. wait what about dynamic language routing, like with a parser or adapter, use what ever coding language is best fit for the job, or the lest amount of tokens, using the components registry as a bridge?"

## Idearium's loop, run end to end

`tests/sim/loop.js` drives Idearium's main loop through the real stack (versionium, guardian, copilot, Idearium). The fake tab in its new **smart** mode answers with code the way an agent does. The loop:
1. An idea goes into the workshop.
2. Saving it makes a repo.
3. The agent is asked for a plan, which here gives two phases.
4. The first phase is built.
5. The agent's code becomes a proposal.
6. The proposal is applied.
7. The change is a versioned commit.

It runs in about 25 seconds.

- **Fixed:** the plan routes (`GET/POST /api/repos/:uuid/spec/plan`) demanded the spec's path even when the repo has exactly one spec. They now use it, and with several specs the error lists them. Test: `test-idearium-solid` SO-08.
- **Found (SD16):** when the agent answered the plan request with code instead of a phasemap, the plan fell back correctly to deriving phases from the spec, but the stray code was still proposed into the repo. A plan step should land only its phasemap.

## Mapped: LR1, each component in the language that fits

A component's language is chosen per component and recorded in the registry with the reason. Components in different languages meet only at the registry's contract (a route, or a JSON hook over stdin/stdout), so the registry is the bridge and each language is an adapter: install, run, test and parse errors, proven in COS.

The pushback is in the map:
- **Fewest tokens isn't the same as best.** The agents measurably write JS, TypeScript and Python best.
- **Every language costs.** Each one is a toolchain to install and something James can't read.
- **Every cross-language call is a process boundary.**

So: one default language, with a second only when a component's declared need names it.
