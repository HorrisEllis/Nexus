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
