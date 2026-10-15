# Proof of competency: James Brooks

James (2026-10-13): "focus on what establishes credibility, and skills, portfolio, and proof of compentancy. money is
needed, badly." · "log anything that helps establish credibility, value and proof of compentancy with quotes and
explicit context."

This is the portfolio record for NEXUS. Every entry gives his words, the context, what was decided, and evidence a
stranger can check in this repository. **Nothing here is claimed without a pointer to evidence.** The code was written
with an AI coder. The ideas, the architecture, the direction, and the calls about what is right are his; each entry
says which part is which (docs/CLAUDE.md, "His decisions, quoted with their context").

## The work, in numbers you can check

| What | Number | How to check |
|---|---|---|
| Commits since the first, on 2026-09-25 | 424 | `git log --oneline \| wc -l` |
| Releases, each with a changelog that quotes him | 0.39.144 → 0.60.7 | `ls CHANGELOG-*.md`, `lib/version.js` |
| Phasemaps (the work mapped before it was built) | 104 | `ls docs/*-phasemap.spec` |
| Test suites | 317 | `ls tests/modules/*.test.js`, run with `node tests/modules/run-all.js` |
| Systems with their own atlas | 18 | `ls docs/atlases/*-atlas.md` |
| Checks and gates catalogued across domains | 96 | `cos/spec/check-catalogue.spec` |

## Skills shown, each with an instance

### Systems architecture

He designs a system as kernel-out propagation: a fixed core (SISO's Event → Gate → Stream) with components that hold
typed channels, a CLI, and an API (`skills/james-brooks/SKILL.md`, "The Cobalt Core").

- **Evidence:** the order of delivery he set on 2026-10-07 is backend → API → command → UI, in the same phase
  (docs/CLAUDE.md). Every capability lands in one command table (`idearium/cli/route-commands.js`), so a person, the
  copilot, and every agent get the same powers through one door.
- **Instance, 0.60.7:** "Versionium for every repo" is five commands in that table, each served by the same route the UI
  calls.

### Specification and mapping before building

- **Rule he set:** "map before build". It is AXIOMS §3.3, made a standing rule in docs/CLAUDE.md.
- **Evidence:** 104 phasemaps. Each phase names its files, what it depends on, and the proof it must pass. Decisions
  record their options with the chosen one quoted. Example: `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`,
  section `decisions:`.

### Failure-mode thinking

His skill file says: "Failure modes, mistakes, and errors are first-priority data."

- **Instance, 2026-09-25.** He saw the Repos tab filling with test repos: "the tests need to stop in idearium. they keep
  generating."
  - The root cause was a class of bug, not one test. Opt-in isolation fails because a test has to remember it.
  - `lib/test-sandbox.js` flipped the default, so a test process cannot write real data.
  - On 2026-10-13 the same mechanism caught a new leak (project imports under test), and it was closed by adding one
    line to its store list (0.60.7).
- **Instance, 2026-10-13: "maybe have integrity checks when importing?"**
  - Imported projects now arrive with what is broken written in their Notes: parse errors, imports that resolve to
    nothing, undeclared packages, duplicate files, and credentials (`lib/import-checks.js`).
  - History imports are scanned for credentials before anything is stored, and stop if one is found
    (`lib/repo-history.js`).

### Directing AI engineering to production standards

- **Rules he set for the coder:**
  - Evidence over memory.
  - Nothing fails silently.
  - Quote him verbatim in every release.
  - Never commit runtime data.
  - Test the UI in his own browser engine, not a third-party tool ("No playwright. That's literally what clearglass was
    born from.", 2026-10-05).
- **Evidence:** every `CHANGELOG-*.md` opens with his words, then what was built, then the test that proves it.
- **Instance, 2026-10-13: "can you use playwright or clearglass to test idearium yourself, as eyes."**
  - An Electron pass (the engine Clear Glass runs on) over a sandboxed Idearium found that the Files tab told every
    imported project "file content isn't stored yet" while 544 files sat on disk.
  - It also found that the repo library headed each project with a raw UUID.
  - Both were fixed in 0.60.7.

### Product judgement under real constraints

- **His leverage rule (2026-10-07):** "remember to use as little tokens for as much leverage and power as possible.
  invent around contraints if it fits nexus better and i prefer novel if it's stable."
- **Instance: the conversation carried across providers (0.60.3).**
  - His observation: a chat that switched from ChatGPT to Gemini lost its context.
  - His proposal: "if the url of the chat is different, can we inject the previous response".
  - Built as one prompt block (`lib/repo-prompt-blocks.js`, `conversation`), not a new subsystem.

## Projects he brought in (2026-10-13), and what a real run showed

These are his own earlier projects, run through NEXUS's real import routes in a sandbox
(`docs/2026-10-13-projects-raid-and-gates-phasemap.spec`, `proof_run`):

- **MASTERMIND:**
  - 1,355 files chunked.
  - 1,026 components in the component store.
  - 143 imports that resolve to nothing, found and listed.
  - Three copies of one package (spatial-v2) found.
- **ERAVOS 3.31-alpha:** 544 files, including 129 `.spec` files. It is a browser app linked through window globals,
  which is why it shows 0 require edges. Recorded as check CK-126.
- **Bridge-OS:** its full git history came in with it. As of 0.60.7, those commits become real versions in its
  Versionium tab.

## Log

New entries go at the top: date, his words, context, what it shows, evidence.

- **2026-10-14: "and we have intent routing? that way the complex reasoning can be done by the bigger models or agents. like claude or deepseek? also multiaccount routing in clearglass, each tab can be a different profile?"** · then: "yes we need to get it all working."
  - **Context:** he was checking that two pieces he had asked for earlier actually worked end to end. They half did:
    - Intent routing existed (0.60.8), but it only ordered agents by preference, so a high-scoring agent could still be sent work it can't do.
    - Account routing existed (0.60.25), but on one tab per provider, so accounts took turns.
  - **What it shows:** systems thinking. His question tied routing ("who should answer") to capacity ("who can answer at once"), and both had to be finished for the pipeline to scale. Earlier he wrote PF1's design himself ("each tab can beb a compartment or different profile"). Grounding that design found three defects that would have broken any second tab:
    - a new tab took over every job of its provider;
    - the provider's status showed whichever tab connected last;
    - one tab's disconnect requeued every tab's jobs.
  - **Evidence:**
    - `tests/modules/test-route-eligibility.test.js` 8/8 (RT1). An agent without the browser tool is never routed browser work, even with 12 successes and even when preferred.
    - `tests/modules/test-profile-tabs.test.js` 7/7 (PF1), a real NCP server with live tabs. Two hats answer from two accounts in two tabs at the same time, and a job for hat A never lands in hat B's tab.
    - `CHANGELOG-0.60.31.md`, `CHANGELOG-0.60.32.md`.
    - Not yet run on his machine.

- **2026-10-14: "Build GT1 here (Recommended)"** (his choice of the map's first priority)
  - **Context:** the map he directed ranks GT1 first: "0.60.18 showed that learning from unclassified failures poisons routing."
  - **What it shows:** prioritising the foundation every later build runs through over the next visible feature.
  - **Evidence:** `tests/modules/test-contract-adapters.test.js` GT-01..07. A planted failure of each type takes its own path, and only capability and context failures change routing or size limits. `CHANGELOG-0.60.30.md`.

- **2026-10-13: "can we work on inventing anything that will get this pipeline going. like why doesn't this work yet?"**
  - **Context:** after a day of fixes, he stopped asking for features and asked why the pipeline still failed. The
    coder read every run he had pasted: the agents answered (38 ChatGPT and 16 Gemini jobs completed), but each run
    started without knowing its parts were ready, and fell back to its hardest mode when the planner failed. The coder
    proposed two fixes, "ready before run" and "a plan without a model", and recommended doing them in that order. He
    chose "A then B (Recommended)".
  - **What it shows:** asking the root-cause question instead of adding features is the judgment. Both fixes come from
    his own rule, written down the same day: "deterministic first … a reasoning agent only plans". The pipeline had been
    breaking that rule. The diagnosis and the design are the coder's; the question and the rule are his.
  - **Evidence:** `tests/modules/test-contract-phase-build.test.js` runs on the real build route with only the model
    stubbed:
    - CP-07: with the planner behind a sign-in wall, the phase is planned without a model, built one file per request,
      and passes its proof;
    - CP-08: with no agent ready, nothing is sent, and the run says what to fix.

    Also `tests/modules/test-run-ready.test.js` 10/10 and `CHANGELOG-0.60.28.md`. Not yet run on his machine.

- **2026-10-13: "the scheduler must distinguish a failed task from a task that has no available executor. The latter should be reported as blocked or unsupported, not repeatedly retried or incorrectly marked complete."**
  - **Context:** he approved the agent and phase adapters and set the order: build and test them on their own first, then connect the Build action. He named one failure mode before any code existed.
  - **What it shows:** failure-mode thinking and specification. The distinction he named is the one a naive scheduler gets wrong: it loops on work nothing can run, or reports it done. His order (adapters alone, then integration) is why the end-to-end test could find the next defect, a learned size limit poisoned by one provider error, and point at the right module.
  - **Evidence:** `tests/modules/test-contract-adapters.test.js` (EA-03: blocked, not retried, not FAILED, not complete), `tests/modules/test-contract-phase-build.test.js` (CP-01 to CP-05 on the real route), `CHANGELOG-0.60.18.md`.

- **2026-10-13: "the logins for the agent providers needs to be all the same. the accounts and sign in, isn't wired into the provider tabs in clearglass."**
  - **Context:** he looked at two Clear Glass screens that each said something different about the same login, and named the cause: one screen was not wired to the other.
  - **What it shows:** he reads a system from its screens and finds the integration gap, not just the symptom. The screenshots pointed at the right seam.
  - **Evidence:** `clear-glass/src/providers/account-switch.js` (`sync`), `clear-glass/test/provider-account-sync.test.js`, `CHANGELOG-0.60.12.md`. Not yet confirmed live.

- **2026-10-13: "can you add history import tool to the repos. like maybe with versionium. i want real versions…"**
  - **Context:** imported projects kept only their latest files. Their `.git` was dropped at import, and there was no
    way to see or compare their past.
  - **What it shows:** he identified the most valuable thing an import was throwing away, the project's history.
  - **Evidence:** `lib/repo-history.js`, `tests/modules/test-repo-history.test.js`, `CHANGELOG-0.60.7.md`.
- **2026-10-13: "remember not just the components. importing them as repositories, so i can continue, expand, fix,
  manage, and test them."**
  - **Context:** the decompose tool (0.60.5) turned projects into components, and he named the larger goal.
  - **What it shows:** he keeps the end state in view: a project you can keep working on, not a parts bin.
  - **Evidence:** phases PL0–PL6 in `docs/2026-10-13-projects-raid-and-gates-phasemap.spec`.
- **2026-10-15: "i want idearium to have releases and a changelog for each version. it was added to the wrong place."**
  - **Context:** releases existed only in Nexus's own `lib/version.js` and as GitHub tags. Versionium is the system
    built to hold versions, yet it had no idea what a release was, and Idearium repos had none.
  - **What it shows:** he spotted an ownership error, a capability living in the wrong system. That is systems-design
    judgment: put each thing where the data it describes already lives.
  - **Evidence:**
    - `versionium/lib/releases.js` and `lib/nexus-releases.js`;
    - `tests/modules/test-releases.test.js` (5/5);
    - `CHANGELOG-0.60.41.md`;
    - 250 Nexus releases are now recorded in Versionium, 210 of them with his words.

- **2026-10-15: "i feel lime also needs to use the gates to maintain persistence using the memory. so we can use nexus for
  the workload, instead of relying on the agents to remember."**
  - **Context:** a build agent lost its task mid-run and asked the person what to do. The usual fix would be a better
    prompt; he asked for the opposite, that the workload be held by the system.
  - **What it shows:** he moved state out of the part that forgets (the model) into the part that persists. That is
    systems-design judgment about where state belongs.
  - **Evidence:** `lib/run-state.js`, `lib/step-gates/reply.on_task.step_gate`,
    `tests/modules/test-run-state.test.js` (27/27), `CHANGELOG-0.60.50.md`. Not yet confirmed live.

- **2026-10-15: "can you create a ledger for anything you can log thats useful for fiverr, that you can verify for a fact?"**
  - **Context:** he wanted a record of his work that builds up over time and slots into a gig. The easy version
    logs what agents say about themselves. He asked for the version a stranger can check.
  - **What it shows:** he put the standard where it belongs, on verification, not volume. A claim that cannot point at
    evidence never reaches a buyer. That is the same rule he set for this very document ("nothing here is claimed
    without a pointer to evidence"), applied to a machine.
  - **Evidence:** `lib/gig-ledger.js` (a claim holds only while its commit, file, test or count checks out),
    `tests/modules/test-gig-ledger.test.js` (10/10, including an overstated count that fails and a made-up commit that
    fails), `CHANGELOG-0.60.53.md`.

- **2026-10-15: "see? why the repitition?" (three Settings sections listing the same providers)**
  - **Context:** he sent screenshots of Accounts & sign-in, Provider tabs and Agent mesh. Each listed the same
    providers with the same account counts and links to each other.
  - **What it shows:** he reads a system from its screens and sees duplicated state as a design fault. The screens
    also disagreed ("dispatch uses the oldest account" against "no default"), which is the real cost of repetition.
  - **Evidence:** the three are now one section, `clear-glass/renderer/settings/sections/accounts.js`;
    `clear-glass/test/settings-merge.test.js` and `settings-merge-render.test.js` (jsdom); `CHANGELOG-0.60.54.md`. Not yet
    seen in Electron.

- **2026-10-15: "i dont [want] anything missed. then it only logs the chaturl once unless it has new data, maybe check the previous chat url once, but use it as an edge for a stopping point for catching up."**
  - **Context:** he was specifying a background reader for his own chats. The coder proposed a timer; he described the
    completeness and stopping rules instead.
  - **What it shows:** specification by invariant: complete (nothing missed), idempotent (a chat is logged once unless it
    has new data), and a defined stopping edge. The stopping edge is what makes catching up cheap.
  - **Evidence:** `lib/chat-crawl-plan.js`, `tests/modules/test-chat-crawl-plan.test.js` (18/18: backfill is done only when
    the list is fully loaded and no chat is pending or failed; an unchanged chat is never revisited; the walk stops at the
    edge and re-checks it once; a restart resumes), `lib/chat-crawl-settings.js` (39 settings), `CHANGELOG-0.60.55.md`.
    The part that drives a real tab is not built.
- **2026-10-15: "bricks keep failing."**
  - **Context:** he pasted his full run log instead of a guess at the cause. In it, every RAID officiator drop failed
    with `forAgent=ollama` while Guardian was completing jobs for three other agents in the same minutes.
  - **What it shows:** reporting a failure with its raw evidence is what made a one-file root cause findable: the log
    itself showed Guardian was up, so "guardian unreachable" was the wrong lead.
  - **Evidence:** `tests/modules/test-lifeline-ollama-dispatch.test.js` (3/3, 3 fail on the old code); `CHANGELOG-0.60.62.md`.
- **2026-10-15: "make sure all of the files and dependancies are mapped. and i want the specs to tagged per phase"**
  - **Context:** a new phasemap (WARP for every build, the spec framework) showed up in Idearium with its systems
    guessed from prose and no files. He asked for the files, the dependencies and the owning specs on every phase
    before anything is built.
  - **What it shows:** traceability as a requirement: every phase answers "what does it touch, what does it wait on,
    which contract owns it" before code is written. That is the discipline of specification-led engineering.
  - **Evidence:** `tests/modules/test-phase-specs-tag.test.js` (4/4, all fail on the old reader); `CHANGELOG-0.60.63.md`.
