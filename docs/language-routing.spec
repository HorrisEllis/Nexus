# Language routing — made in the spec workshop (idearium)
# Written 2026-10-10 from docs/2026-10-10-shape-of-nexus-phasemap.spec LR0 + LR1, to be opened in the workshop (nexus/core →
# docs) and built through Idearium. Every decision is offered as choices [A] [B] [C] [custom], the coder's recommendation
# marked; "chosen:" stays "open" until James picks. Nothing here is built yet.
spec:
  name: Language routing
  ambition: 4 — novel
  source: "maps: docs/2026-10-10-shape-of-nexus-phasemap.spec LR0_the_shared_primitives_are_the_glyph, LR1_each_component_in_the_language_that_fits"
  owner: core (lib/chunk-glyph.js, lib/languages.js, lib/build-context.js, the registry contract) · cos (each language's adapter, proven in a compartment) · loom (the component registry as the bridge)
  status: specced 2026-10-10, not built
  james: >-
    "wait what about dynamic language routing, like with a parser or adapter, use what ever coding language is best fit
    for the job, or the lest amount of tokens, using the components registry as a bridge?" · "what about using the most
    common primitives between the code langauges, to synthesize the cheapest code tokens. like at lib folder" · "Build a
    spec for the full language routing"
sections:
  - id: purpose
    title: Purpose
    body: |
      Let each component be written in the language that fits its job, cheaply for the models, without the system
      splintering into languages nobody can run or read.

      Two halves, in this order:
        READ  (LR0) — the primitives every language shares already have a grammar: lib/chunk-glyph.js (defines, imports,
              calls, events, routes, env, side effects, throws, purpose). It reads JavaScript only. Give it a reader per
              language family so a glyph means the same thing in any language; agents then read glyphs of the code around
              a task instead of the code itself. The tokens are on the input side: an agent reads far more than it writes.
        ROUTE (LR1) — a component's language is chosen per component, recorded on its registry node with the reason, and
              components in different languages meet only at the registry's contract (an HTTP route or a stdio JSON hook),
              never by calling into each other. Each language is an adapter (install, run, test, parse errors), admitted
              only when that adapter passes in a COS compartment.

      Evidence today: lib/languages.js is the one language table (names, extensions); cos/testenv/detect.js already
      installs and tests node, python, go, rust, ruby, php and make; idearium/repo/graph.js reads several languages'
      references; scripts/bench-file-prompt.js measures prompt size; lib/build-context.js packs JS glyphs into prompts.

  - id: primitives
    title: Primitives
    body: |
      language     (thing)    a row of lib/languages.js {id, ext[], fences[]} + its family (c-like, python-like, lisp-like, shell, data)
                              invariant: one table; every other list derives from it
      glyph        (thing)    one chunk's meaning in one line: defs · ← imports · → calls · ⚑ events · ⇄ routes · $ env · io · ✗ throws · ¶ purpose
                              invariant: the same meaning gives the same glyph in any language (fields, not syntax)
      reader       (action)   source text of one family → glyph fields; deterministic, no model
                              invariant: a reader that cannot read a construct leaves the field out and says so, never guesses
      skeleton     (action)   glyph (signatures, imports, contract) → a file in the target language with empty bodies
                              invariant: deterministic; the model writes only the bodies
      adapter      (thing)    {language, install, run, test, parseErrors} — how Nexus drives one language
                              invariant: admitted only after it passes its proof in a COS compartment
      choice       (rule)     a component's language + the reason: {language, why[], evidence{tokens, passRate, agentScore}, by}
                              invariant: never chosen silently; the default (JS) needs no reason, anything else does
      contract     (boundary) where two components meet: a route (HTTP, JSON) or a hook (stdio, one JSON line in, one out)
                              invariant: no cross-language call inside a component; process boundaries only between components
      measurement  (thing)    {component, language, tokensIn, tokensOut, passRate, retries, agent, at} — what the choice learns from

  - id: axioms
    title: Axioms
    body: |
      AX1  One default: JavaScript (Nexus's own). A second language needs a stated reason on the component's node.
      AX2  Reading is where tokens go; glyphs cut input first. Output stays in a real language the models write well.
      AX3  No invented language. A "cheapest common syntax" saves tokens on output and loses them on errors.
      AX4  The registry is the bridge: components meet at declared contracts, so every language is replaceable.
      AX5  A language is real only when its adapter passes in COS (install, run, test, parse its errors) — §1.1.
      AX6  Evidence over taste: a choice records measured tokens, pass rate and agent scores, not just a preference.
      AX7  He can read it. A language he cannot follow is a cost, named on the node.
      AX8  Every reader states what it could not read; nothing silently drops a field (§1.2).

  - id: schema
    title: Schema
    body: |
      lib/languages.js                     + family, + reader (path or null), + adapter (path or null) per row
      lib/chunk-glyph.js                   readers split out: lib/glyph/readers/<family>.js, each exporting read(text) → fields + unread[]
      registry node (loom / component)     + language: { id, why[], evidence, chosenBy, at }
      registry contract                    + kind: route | hook; for hook: { command, args, in: schema, out: schema }
      cos adapter manifest                 cos/adapters/<language>.json { install, run, test, errors: regex[] } + its proof run id
      measurements                         core jaa table nexus_language_measurements (one row per build of a component)

      choices — how a glyph reader is built for a new language family:
        [A] small hand-written readers per family (regexes + a bracket/indent walker), like today's JS reader  ← recommended (no dependency, deterministic, good enough for the nine glyph fields)
        [B] tree-sitter grammars — exact parses for 40+ languages, but a native dependency to build and ship on his machine
        [C] the language's own tooling (python -m ast, go/parser) run in COS — exact, but a process per read
        [custom] ____
      chosen: open

  - id: api
    title: API
    body: |
      Library (backend first)
        glyph(text, { path })                 → { language, fields, unread[] } — any language with a reader
        skeleton(glyph, { language })         → file text with empty bodies, or { error: 'no skeleton writer for <language>' }
        chooseLanguage(component, { need })   → { language, why[], evidence, alternatives[] } — a proposal, never applied
      Routes (core's host, through Idearium's proxy like options)
        GET  /api/languages                   → the table, each with reader / adapter / admitted (and its proof run)
        POST /api/languages/:id/admit         → runs the adapter's proof in a COS compartment; admitted only on pass
        POST /api/components/:id/language     { language, why } → recorded on the node (person or approved proposal)
        GET  /api/glyph?path=…                → the file's glyph
      Commands
        idearium languages · languages admit <id> · component language <id> <language> --why "…" · glyph <path>
      Agent tools
        code.glyph (read any file as its glyph) · code.skeleton (from a node's glyph, in its language)

      choices — how components in different languages talk:
        [A] stdio JSON hooks for small pure components, HTTP routes for services  ← recommended (both already exist in Nexus; no new transport)
        [B] HTTP only — one shape, but a server per small component
        [C] a message on the bus (siso) — fits the event-driven core, but every language needs a bus client
        [custom] ____
      chosen: open

  - id: events
    title: Events
    body: |
      core.language.admitted     { language, proofRun, ok }
      core.language.chosen       { component, language, why, by }
      core.glyph.unread          { path, language, fields[] } — a reader that could not read something says so
      core.language.measured     { component, language, tokensIn, tokensOut, passRate }

  - id: integration
    title: Integration
    body: |
      - lib/build-context.js packs glyphs of the surrounding code for every language with a reader (today: JS only)
      - lib/chunker / SD14: a chunk's context is its node + related nodes, as glyphs
      - Idearium's spec graph (idearium/spec/idea-to-spec.spec): a module node may name its language; build_order runs the
        skeleton before the agent writes bodies
      - COS: adapters live with COS (cos/adapters/), proven by cos/testenv; the torture chamber (cos/spec/torture-chamber.spec)
        runs a component's contract tests against each language's build
      - pipeline routing / RAID: which agent writes which language well is a learned score (SN4, SD10 verdicts), read by chooseLanguage
      - the economy ledger: tokens per build per language, so "cheapest" is measured

      choices — what decides a component's language:
        [A] a declared need (a library only that language has, a runtime limit) — otherwise JS  ← recommended (AX1; the fewest moving parts)
        [B] a score: tokens × pass rate × agent skill × readability, with a threshold to leave JS
        [C] he decides per component; the system only shows the evidence
        [custom] ____
      chosen: open

  - id: failure_modes
    title: Failure modes
    body: |
      F1  Splintering — five languages, five toolchains on his machine. → AX1, AX5; a language unused for 90 days is said, not removed.
      F2  A reader misses a construct and the glyph lies. → unread[] on every glyph; T2 compares readers on the same module.
      F3  Cross-language latency inside a hot path. → contracts only between components; a hook's cost is measured.
      F4  Agents worse in the chosen language. → measurement per agent per language; chooseLanguage reads it.
      F5  He cannot read what was built. → AX7, named on the node; Explain-this (SH2) explains it.
      F6  An adapter passes once and drifts (a new Python). → the proof re-runs on each COS image change.

  - id: build_order
    title: Build order
    body: |
      1  LR0a  readers split out of chunk-glyph; the JS reader unchanged (glyphs byte-identical before/after)
      2  LR0b  python reader; same module in JS and Python → same fields
      3  LR0c  build-context packs glyphs for any language with a reader; measured smaller with bench-file-prompt, same phase passing
      4  LR0d  skeleton writer (JS, Python) from a glyph
      5  LR1a  contracts: stdio JSON hook kind in the registry, a runner, its test
      6  LR1b  adapters + admit in COS (python first: detect.js already installs it)
      7  LR1c  language on the registry node, chooseLanguage as a proposal, the commands and the screen
      8  LR1d  measurement table and the learned agent-by-language score
      Reading (1–4) is valuable on its own and needs no second runtime; routing (5–8) waits until the loop builds with a real agent.

      choices — the second language:
        [A] Python — COS already installs and tests it; strongest library reach (data, ML, parsing); agents write it well  ← recommended
        [B] Go — single binaries, fast, strict types; fewer libraries for Nexus's kind of work
        [C] Rust — fastest and safest; the slowest for agents to get right
        [custom] ____
      chosen: open

  - id: tests
    title: Tests
    body: |
      T1  JS glyphs are byte-identical before and after the readers are split out (every file in lib/)
      T2  the same small module in JS and Python → the same defs, imports, calls, events, routes, env, io, throws
      T3  a phase build's prompt with glyph context is smaller (bench-file-prompt) and the phase still passes
      T4  a Python skeleton generated from a JS component's glyph runs its contract test in COS
      T5  a Python component is called from a JS component through a stdio hook declared in the registry; its node says why Python
      T6  admitting a language whose adapter fails its proof → refused, with the failing step
      T7  a reader given a construct it cannot read lists it in unread[], never invents a field

  - id: registry
    title: Registry
    body: |
      core.glyph (lib/chunk-glyph.js + lib/glyph/readers/*) · core.skeleton (lib/glyph/skeleton.js) · core.language-choice
      (lib/language-choice.js) · core.hook-runner (lib/hook-runner.js) · cos.adapters (cos/adapters/*)
      Each wired into loom with its consumers; the measurement table declared in docs/nexstore-writers.yaml.
