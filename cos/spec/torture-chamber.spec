# Torture chamber — made in the spec workshop (idearium)
# Written 2026-10-10 from cos/spec/qa-catalog.spec (about 90 methods, eight families) and
# docs/2026-10-10-snapshot-compartments-phasemap.spec (SN0–SN4), to be opened in the workshop (nexus/cos → cos/spec) and
# built through Idearium. Every decision is offered as choices [A] [B] [C] [custom], the coder's recommendation marked;
# "chosen:" stays "open" until James picks. Nothing here is built yet.
spec:
  name: Torture chamber
  ambition: 4 — novel
  source: "cos/spec/qa-catalog.spec · maps: docs/2026-10-10-snapshot-compartments-phasemap.spec SN0–SN4"
  owner: cos (the template, the compartments, branching, the runner) · intelligence (rfr2 measures each run) · core (the learned order reads the results)
  status: specced 2026-10-10, not built
  james: >-
    "all the tests, and verification methods you could find for the intelligence, debug or cos for the code generation.
    like maybe a cos template called torture chamber, or something. like with the branching and parralel."
sections:
  - id: purpose
    title: Purpose
    body: |
      A COS template that takes one piece of generated work — a phase's code, a spec block, an agent's answer, a whole
      repo at a snapshot — and puts it through a chosen set of methods from the catalog, each in its own branched
      compartment, in parallel, and says what survived: per method, a verdict with its evidence.

      Why it matters (evidence): Idearium's loop ends at "no-proof" because generated code proves nothing on its own. A
      phase is done only when its claims are tested; the chamber is where that happens, the same way for every agent,
      so agents and models are compared on the same ground (SN4) instead of by reputation.

      What already exists: COS compartments and worktree/qcow2 branching (SN0 consolidates three mechanisms), the test
      runner in cos/testenv (node, python, go, rust, ruby, php, make), the fake provider tab (tests/sim/fake-tab.js) and
      the loop simulation (tests/sim/loop.js), the Ollama tape (seeded replay), rfr2 delta/sigma.

  - id: primitives
    title: Primitives
    body: |
      subject      (thing)    what is tortured: { kind: code | block | answer | repo, ref, snapshot }
                              invariant: always a versionium snapshot — the chamber never touches the working tree
      station      (thing)    one method from the catalog: { id, family, needs[], run, verdict(rule) }
                              invariant: a station states what it needs (a test suite, a grammar, a second agent) and is skipped with the reason when it is missing
      cell         (thing)    one station × one subject variant in its own compartment: { station, variant, compartment, seed }
                              invariant: branched from the subject's snapshot; closed after; leaves nothing behind
      variant      (thing)    a way the subject is bent: { kind: as-is | mutated | hostile-input | slow-agent | failing-agent | other-agent, params }
      session      (action)   N cells run with bounded concurrency, interleaved and repeated (SN2), each stamped with its own logical clock (SN3)
      verdict      (thing)    { cell, survived: yes | no | unknown, evidence[], measured{duration, delta, sigma} }
                              invariant: "unknown" is said, never counted as survived
      report       (thing)    per station: survived n/m, the failures with their reproductions (a clip, FM2), the spread across repeats

  - id: axioms
    title: Axioms
    body: |
      AX1  The subject is a snapshot; the working repo is never touched (SN1).
      AX2  Every failure ships with its reproduction — the cell's seed, variant and compartment snapshot — so it can be re-run.
      AX3  Deterministic where it can be: seeded variants, the Ollama tape, logical time. A flaky verdict is reported as flaky.
      AX4  A station that cannot run says why (missing needs); it is never silently skipped.
      AX5  The chamber judges; it does not fix. Fixes go back through the normal loop as proposals.
      AX6  Results teach: verdicts become evidence in the learned order (which agent writes which kind of work well, SN4).
      AX7  Cost is visible: cells × repeats × agent calls are estimated before a session starts, and the economy can refuse.

  - id: stations
    title: Stations (from the catalog)
    body: |
      Eight families, the catalog's names. Status from the catalog: have · partial · none.

      1 correctness   property-based · model-based/state-machine · differential · metamorphic · fuzzing · mutation ·
                      golden/approval · static analysis · architecture fitness · dependency cycles
      2 runtime       deterministic simulation (fake tab + seeded scheduler + replay) · chaos (kill a service mid-job) ·
                      fault injection (latency, ECONNRESET, full disk, 413) · crash consistency · idempotency ·
                      load/soak/leak · clock jumps · backpressure
      3 models        eval suites per job kind · model-size sweep · provider canaries · hallucination checks (cited file
                      or symbol exists) · tool-use correctness · calibration (Brier) · inter-rater agreement · prompt
                      regression · replay determinism · token budgets
      4 security      cross-origin/CSRF · indirect prompt injection · tool-scope escalation · path traversal · SSRF ·
                      command injection · secrets in logs · supply chain · ReDoS / YAML bombs · VM boundary · userscript trust
      5 interface     Clear Glass page probes · visual regression · accessibility · cognitive-load budget · Nielsen review
      6 data          schema validation · referential integrity · migrations · restore drills · provenance completeness
      7 thinking      pre-mortem · FMEA · STPA · HAZOP guidewords · feedback-loop audit · Goodhart checks · ambiguity check
      8 process       (run over the chamber itself) mutation score trend · flake rate · time to verdict

      choices — which stations a phase build gets by default:
        [A] a "phase" preset: property-based + mutation + hallucination check + the phase's own tests, as-is and mutated  ← recommended (cheap, catches filler code)
        [B] everything that can run — thorough, slow, expensive in agent calls
        [C] none by default; he picks per run
        [custom] ____
      chosen: open

  - id: schema
    title: Schema
    body: |
      cos/templates/torture-chamber/           the template (a COS archetype: manifest, stations/, presets/)
        manifest.json                          { name, version, stations[], presets{} }
        stations/<id>.js                       { id, family, needs, run(cell) → evidence, verdict(evidence) }
        presets/<name>.json                    { stations[], variants[], repeats, concurrency }
      cos jaa table cos_torture_sessions       { session, subject, preset, cells, startedAt, endedAt, cost }
      cos jaa table cos_torture_verdicts       { session, cell, station, variant, survived, evidence, measured, repro }

      choices — where the stations' code lives:
        [A] in COS, as a template other repos can use (stations are mods, DS7)  ← recommended (his "cos can be a reusable system for anything")
        [B] in tests/ — simplest, but only Nexus can use it
        [C] each station in the system it tests (guardian's chaos in guardian) — closest to the code, scattered
        [custom] ____
      chosen: open

  - id: api
    title: API
    body: |
      cos torture <subject> [--preset phase] [--stations a,b] [--variants as-is,mutated] [--repeats 3] [--concurrency 2]
      cos torture plan <subject> --preset …        → the cells and the estimated cost, nothing run
      cos torture report <session>                 → survived per station, failures with repro commands
      cos torture replay <session> <cell>          → re-runs one cell from its repro
      Routes (COS is hosted by Idearium today, lib/cos-bridge): POST /api/cos/torture · GET /api/cos/torture/:session
      Idearium: a phase's "prove" can name a preset; its verdict is the phase's proof

  - id: events
    title: Events
    body: |
      cos.torture.started { session, subject, cells, estimate } · cos.torture.cell { session, cell, survived } ·
      cos.torture.done { session, survived, failed, unknown } — declared in cos/event-taxonomy.js before emitting

  - id: integration
    title: Integration
    body: |
      - SN0 one branch interface; SN1 a snapshot as a compartment; SN2 parallel cells; SN3 rfr2 measures each; SN4 results teach
      - Idearium's phase proof: a phase passes when its preset survives; the Plan shows the chamber's report
      - the adversarial gate (SD10): "other-agent" variant = an adversary attacking an answer; calibration station checks the gate itself
      - the fake tab + loop sim become the deterministic-simulation station's engine
      - language routing: the contract tests run against each language's build of a component

      choices — how parallel it runs on his machine:
        [A] bounded by the machine: concurrency = free cores / 2, VMs only when a station needs one  ← recommended
        [B] always one at a time — slow, no contention noise
        [C] as wide as possible, with repeats to cancel contention noise (SN2's interleaving)
        [custom] ____
      chosen: open

  - id: failure_modes
    title: Failure modes
    body: |
      F1  Cost runaway (stations × variants × repeats × agent calls). → plan first; the economy can refuse (AX7).
      F2  Flaky verdicts read as failures. → repeats + spread; flaky is its own verdict (AX3).
      F3  A cell leaks state into the next. → each cell branched and closed; a leftover check after closing.
      F4  The chamber becomes a gate nobody passes. → presets sized to the job; "unknown" is said, not failed.
      F5  Goodhart: agents learn to pass the stations, not to be right. → stations rotate; held-out evals (catalog family 7).

  - id: build_order
    title: Build order
    body: |
      1  SN0  one branch interface (worktree, qcow2) — the chamber stands on it
      2  TC1  the template skeleton: manifest, a station contract, `cos torture plan`
      3  TC2  three stations that need no model: property-based, mutation, the phase's own tests; as-is + mutated variants
      4  TC3  sessions in parallel (SN2), verdicts + repro, `cos torture report|replay`
      5  TC4  Idearium phase proof reads a preset's verdict
      6  TC5  model stations: hallucination check, other-agent adversary, calibration
      7  TC6  runtime stations: deterministic simulation (fake tab + seeded scheduler), chaos, fault injection
      8  TC7  results teach the learned order (SN4)
      Security and interface stations reuse what exists (the access tests, the Clear Glass probes) as stations after TC3.

  - id: tests
    title: Tests
    body: |
      T1  plan on a subject with the phase preset lists the cells and a cost, runs nothing
      T2  a deliberately broken function: mutation and property stations fail it; the repro re-runs and fails the same way
      T3  a correct function survives as-is and is killed by most mutants (the tests are worth something)
      T4  two snapshots × 3 repeats: per-variant pass rates with spread; the working tree is unchanged after
      T5  a station missing its needs reports "skipped: needs <x>", never "survived"
      T6  a phase in Idearium becomes proven when its preset survives, and its Plan shows the report

  - id: registry
    title: Registry
    body: |
      cos.torture-chamber (cos/templates/torture-chamber/) · cos.torture-runner (cos/torture/runner.js) ·
      cos.torture-stations (cos/templates/torture-chamber/stations/*) — wired into loom with consumers; both tables in
      docs/nexstore-writers.yaml.
