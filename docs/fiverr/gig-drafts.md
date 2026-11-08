# Fiverr gig drafts: James Brooks

James, 2026-11-07: "Need this code soon. Like so I can stop relying on you. And make some money." · "Do it. Draft them."

Three drafts, ready to paste. Every claim points at something in `docs/PROOF-OF-COMPETENCY.md` or the repository. Nothing here claims years of
experience, clients or credentials that the record doesn't show.

Fiverr's limits are respected: a title of at most 80 characters starting "I will", a description of at most 1,200 characters, 5 tags, and 3
packages.

**Prices lowered 2026-11-08, his call:** "I need to be paid, at all. Reviews and integrity, over profit until I gain confidence and self respect."
The first prices (Gig 1 $45/$120/$280, Gig 2 $60/$180/$400, Gig 3 $70/$220/$450) are kept here (§0.3), as where to go once the reviews come in.

**Yours to decide before posting:**
- **Prices:** they are the coder's suggestions for a new seller account. Lower prices win the first reviews; raise them after 3–5 reviews.
- **Portfolio link:** only if `github.com/HorrisEllis/Nexus` is public. If it is private, use the portfolio page instead, or leave the link out.
- **"AI-assisted":** it is said openly in each draft. Directing an AI coder to production quality is the skill your record shows, and saying it
  up front protects you from a dispute later.

---

## Gig 1: a codebase audit (the fastest to deliver)

**Title (71):** I will audit your codebase and give you a clear, prioritized fix report

**Category:** Programming & Tech › Software Development › QA & Review (or Code Review)

**Description:**
> Inherited a messy project? Not sure what's broken, duplicated or risky? I'll map it and tell you, in plain language.
>
> You get a report that lists, file by file:
> • broken imports and references that point nowhere
> • packages used but never declared
> • duplicate and dead files
> • credentials or secrets committed by accident
> • a dependency map: what uses what, and what a change can break
> • a prioritized fix list: what to fix first, and why
>
> Every finding names the file and line, so you or your developer can check it yourself. Nothing is vague.
>
> How I work: I build and direct AI-assisted analysis tools, and every result is checked against the code itself before it goes in your report.
> I never change your code unless you ask.
>
> Send me the repo (GitHub link or zip) and one sentence on what worries you most.

**Tags:** code review · codebase audit · technical debt · refactoring plan · security check

**Packages (suggested):**

| | Basic | Standard | Premium |
|---|---|---|---|
| Name | Quick scan | Full audit | Audit + plan |
| What | Up to 50 files: the findings list | Up to 300 files: findings and the dependency map | Up to 1,000 files: findings, map, and a phased fix plan with tests for each step |
| Delivery | 2 days | 3 days | 5 days |
| Revisions | 1 | 2 | 3 |
| Price | $15 | $40 | $90 |

**Backed by:** `lib/import-checks.js` (broken imports, undeclared packages, duplicate files and credentials, written into a project's notes on
import), the credential scan in `lib/repo-history.js`, and the dependency graphs in `lib/phase-graph.js`.

---

## Gig 2: a build plan an AI coder can follow

**Title (80):** I will turn your app idea into a phased build plan and spec AI coders can follow

**Category:** Programming & Tech › Software Development (or Business › Product Management)

**Description:**
> AI coding tools build fast, and drift faster. They forget decisions, rebuild what exists, and skip tests. The fix is the plan they're given.
>
> I write that plan:
> • the end state first: what "done" means, as checks that pass or fail
> • every component specified: inputs, outputs, errors, acceptance tests
> • the work cut into small phases, each with the files it touches, what it depends on, and the test that proves it
> • a dependency graph, so nothing is built before what it needs
> • the decisions written down with the options you chose between, so they don't get lost or re-argued
>
> You can hand it to Claude, Cursor, Copilot or a human developer, and they build in order, one checked phase at a time.
>
> This is how I build my own multi-system platform: over 200 phase maps, each phase graphed and tested before it was built.
>
> Send me your idea, however rough. Voice notes are fine.

**Tags:** software specification · project plan · ai development · technical architecture · product requirements

**Packages (suggested):**

| | Basic | Standard | Premium |
|---|---|---|---|
| Name | One feature | Full app plan | Plan + architecture |
| What | One feature: end state, spec, phases | An MVP: every component specced, phased and graphed | The full plan plus the system architecture: components, boundaries, data, and how they talk |
| Delivery | 2 days | 4 days | 7 days |
| Revisions | 1 | 2 | 3 |
| Price | $20 | $60 | $130 |

**Backed by:** the phasemaps in `docs/*-phasemap.spec`, the specs that must compile at full depth (`tests/modules/test-substrate-spec.test.js`),
the DAG every phase needs (`lib/phase-dag.js`), and the decisions recorded with options (`docs/CLAUDE.md`).

---

## Gig 3: system architecture and design review

**Title (71):** I will design or review your software architecture for clean boundaries

**Category:** Programming & Tech › Software Development › Software Architecture (or Consulting)

**Description:**
> When one part of your system breaks, does everything break? That's a boundary problem, and it gets more expensive every month it stays.
>
> I design systems, and review existing ones, around a few hard rules:
> • each part owns its own data and logic, and talks to the others only through a defined interface, so any part can be swapped
> • one door per part: the same commands for the UI, the API and automation
> • every failure is visible, never silent
> • the finished state is defined first, and the design is checked against it
>
> For a review you get: a map of your current parts and how they're wired, every place one part reaches into another's internals, the
> failure modes (what breaks when X goes down), and a step-by-step plan to fix them, highest leverage first.
>
> For a new design you get the architecture document, the boundaries, the interfaces, and a phased plan to build it.
>
> AI-assisted, human-directed. Every claim in my reports points at your code.

**Tags:** software architecture · system design · microservices · design review · scalability

**Packages (suggested):**

| | Basic | Standard | Premium |
|---|---|---|---|
| Name | Quick review | Full review | Design |
| What | One service or module: boundaries and failure modes | The whole system: map, boundary violations, failure modes, fix plan | A new architecture, or a redesign: document, interfaces, phased build plan |
| Delivery | 2 days | 5 days | 7 days |
| Revisions | 1 | 2 | 3 |
| Price | $25 | $75 | $150 |

**Backed by:** sovereignty (AXIOMS §5.9–§5.16), the boundary census and its ratchet (`lib/system-boundary.js`), and the one command table
(`idearium/cli/route-commands.js`).

---

## FAQ, for all three

- **Do you use AI?** Yes, as a tool I direct. Every finding is checked against your code before it reaches you, and each one names the file
  and line.
- **Will you change my code?** Only if you ask. The deliverable is a report or a plan.
- **What languages?** JavaScript and TypeScript, Node, Python and web front ends are best. For anything else, ask first.
- **Is my code safe?** It's used only for your order, never shared, and deleted after delivery on request.

---

## The posting card: one gig, in about ten minutes, nothing to decide

Start with Gig 1 only. Fiverr › Selling › Gigs › Create a new gig. Each step is a paste; the choices are already made.

1. **Overview:** paste the title. Pick the category written under it. Paste the 5 tags. Save & continue.
2. **Pricing:** switch on 3 packages. Paste each column: name, what's included (as the description), delivery days, revisions, price.
   Save & continue.
3. **Description & FAQ:** paste the description, then the four FAQ entries. Save & continue.
4. **Requirements:** add one question: "Send the repo (GitHub link or zip) and one sentence on what worries you most." Mark it required.
5. **Gallery:** one image is required. A screenshot of a finished report, or a plain card with the gig title on it, is enough for now.
6. **Publish.**

If a step stalls, stop there. Saving keeps it as a draft, and next time starts from that step, not from the top. One gig live is the whole
goal; the other two can wait for the first review.
