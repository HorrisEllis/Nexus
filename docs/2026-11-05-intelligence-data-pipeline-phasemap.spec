# docs/2026-11-05-intelligence-data-pipeline-phasemap.spec — run any data through the intelligence fields: baseline → deviation → regime →
# invariants. Owner: intelligence (its input/ and output/, its routes, its screen). The idea and the uses are James's; the readings, cuts and
# order are the coder's, decided by his axioms (cited). MAPPED 2026-11-05, nothing built.

origin: >-
  James, 2026-11-05: "yes then we can add invariants to rfr2. or the sigma deviation detection. we need a pipeline for the intelligence system.
  i want to run data through it. thats what the input folders are for per system. like imagine running data through the fields. thats why
  theyre agnostic. like stock data, blood cells to measure deviation, investment oppertunities, think of how many things deviation detection is
  good for. invariants, crystals, primitives, could establish a baseline." · Said right after: "Models and contracts are the same. Templates and
  schemas. Which means you can use those for expectation." · "with the spec 2 also gives a comparison for Drift. That's the architecture."

found_before_mapping: >-
  (§0.1, read 2026-11-05) The fields are agnostic in intent, not yet in code. intelligence/baseline.js observe() reads only type, latencyMs and
  error; rfr2/sigma classify() reads delta records whose axes are named for system telemetry (latencyImpact, throughputChange, causal depth);
  the crystallizer (_groundedCrystallise in intelligence/index.js) pairs event TYPES. None of them reads a column of numbers. intelligence/ has
  output/ but no input/. So the pipeline is mostly an adapter: any series of numbers → the shapes these already take. Reuse, not rebuild (§8.6).

readings_to_confirm:
  - "\"the input folders … per system\": genesis's handoff states (input/ processing/ done/ failed/, genesis 1.4.0 lib/handoff.js). A file
     dropped in intelligence/input/ is picked up, moved to processing/, and lands in done/ or failed/ with its result in output/."
  - "\"add invariants to rfr2. or the sigma deviation detection\": invariants found by the pipeline (or written by him) become constraints
     sigma checks a new run against: a breach of a known invariant is flagged, not just a deviation from the mean."
  - "\"invariants, crystals, primitives, could establish a baseline\": the baseline of a dataset is its invariants (each series' mean, sigma,
     slope, and the co-deviations that held), saved, so the next run of the same kind of data is compared to it instead of learning again."

  - "(2026-11-05, his addendum) \"gaps are problems, or deviations\": a gap has two kinds — a deviation (a point or a series away from its
     baseline, IP3) and a problem (something missing, broken or avoided, the negative and shadow space, IP8). Both are kept as gaps, each
     marked with its kind."
  - "(2026-11-05, his addendum) \"like a open loop system. like the way the human mind works\": a run never closes on an answer. What it
     could not settle (hypotheses, gaps, what was missing) becomes the next run's questions (IP9). His framework, Section 3: \"leave the loop
     open to think dialectically\"."
  - "(2026-11-05, TO CONFIRM — two readings) \"growth tracking for the self. its for structure. integration and friction tracking. intution,
     and deomposition\": (a) his own growth: his notes, quotes, decisions or a journal run through the pipeline, tracking how his structure,
     integration and friction change over time (his framework: \"Inner work is in scope\"); (b) the system's self: Nexus tracking its own
     growth the same way; (c) both, the same pipeline pointed at either."

decisions:
  IP_D1_formats_and_rows:
    status: "OPEN — his"
    question: >-
      What a dataset is. The coder's proposal: CSV, NDJSON or JSON rows; an optional time column (ts, time, date); every numeric column is a
      series; a text column can name an entity (ticker, sample id) so one file holds many series. Is that enough for the data he has in mind?
  IP_D2_where_the_baseline_comes_from:
    status: "OPEN — his"
    question: >-
      (a) the first N rows of the file (the system's way today, baseline.js baselineN) · (b) a window he marks as normal · (c) a saved baseline
      from an earlier run of the same kind of data. The coder's recommendation: (c) when one exists, else (a), and the report says which.
  IP_D3_how_far_is_a_deviation:
    status: "OPEN — his (a threshold is his, like f(slope)'s)"
    question: "|z| ≥ 3 sigma by default (baseline.js today), per series overridable. A different default, or per domain?"
  IP_D4_measurement_not_diagnosis:
    status: "DECIDED by his axioms"
    chosen: >-
      The pipeline reports deviations, regimes and invariants with their numbers; it never says what they mean for a person's health or money.
      Blood counts and investments are named by him as uses; the report says "deviation", never "diagnosis" or "buy".
    by_the_axioms: "TRUTH_OVER_COHERENCE (say what the run showed), §1.2 (nothing silent: an unproven pattern is a hypothesis, said as one)"

  IP_D5_risk_weights:
    status: "OPEN — his (weights and thresholds are his, like f(slope)'s)"
    question: >-
      How risk is made from the three. The coder's proposal: risk = impact × irreversibility × (1 + uncertainty + ambiguity), each 0..1 except
      the factor, with the route thresholds at 0.3 (report) and 0.7 (hold or ask). His call: the formula, the weights, and whether ambiguity
      weighs more than uncertainty (the coder's reading of his rule says it should: uncertainty waits for data, ambiguity waits for him).
    note: "Cross-domain (the coder's, for him to judge): economics already splits these three — Knight's risk (known odds) vs uncertainty
      (unknown odds), and Ellsberg's ambiguity (several models fit). His wiring carries that split into an AI pipeline's routing."

phases:
  IP1_input_folder_and_reader:
    status: OPEN
    depends_on: [IP_D1_formats_and_rows]
    files: [intelligence/pipeline/reader.js, intelligence/pipeline/handoff.js, intelligence/schemas/dataset.schema.json, intelligence/input/README.md, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      intelligence/input/ (with processing/ done/ failed/ beside it, genesis's handoff states). A dropped file is read into series: { name,
      entity?, points: [{ t, v }] }; a row it cannot read is counted and said, never dropped silently. The dataset schema is the expectation the
      file is checked against before anything runs (his "templates and schemas … use those for expectation").
  IP2_baseline_per_series:
    status: OPEN
    depends_on: [IP1_input_folder_and_reader, IP_D2_where_the_baseline_comes_from]
    files: [intelligence/pipeline/baseline.js, intelligence/baseline.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      Each series' baseline (mean, sigma, slope, p95) from the chosen window, with baseline.js's own math (its exported mean, sigma, slope),
      not a second copy. Saved as the dataset kind's baseline in intelligence/data/baselines/<kind>.json for the next run.
  IP3_deviation_and_regime:
    status: OPEN
    depends_on: [IP2_baseline_per_series, IP_D3_how_far_is_a_deviation]
    files: [intelligence/pipeline/deviation.js, intelligence/rfr2/sigma/index.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      Every point scored against its baseline (z). A point past the threshold is a deviation event <series>.high | <series>.low. The z stream
      is mapped onto the delta shape rfr2's sigma reads (z → latencyImpact, Δz → throughputChange) and classified per series: stable, degraded
      (drifting), collapsing (accelerating), oscillatory (flipping). The mapping is the adapter; sigma's code is unchanged.
  IP4_invariants_across_series:
    status: OPEN
    depends_on: [IP3_deviation_and_regime]
    files: [intelligence/pipeline/invariants.js, intelligence/index.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      The deviation events go through the crystallizer he already has: a pair of series that deviate together is an invariant only past the
      floor of three AND above the base rate AND not known noise; otherwise a hypothesis, said as one ("three = an invariant (not a fact)").
  IP5_invariants_into_rfr2:
    status: OPEN
    depends_on: [IP4_invariants_across_series]
    files: [intelligence/pipeline/invariants.js, intelligence/rfr2/sigma/index.js, intelligence/data/baselines/README.md, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      His "add invariants to rfr2": the invariants of a dataset kind (found, or written by him) are saved with its baseline and passed to sigma as
      constraints on the next run; a run that breaks one says which, with the points that broke it. Drift against a known shape, not only
      against the mean (his "the spec … gives a comparison for drift").
  IP6_route_command_screen:
    status: OPEN
    depends_on: [IP5_invariants_into_rfr2]
    files: [intelligence/routes.js, intelligence/pipeline/report.js, idearium/cli/route-commands.js, intelligence/registry-components.js, intelligence/event-taxonomy.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      POST /api/intelligence/pipeline/run (a file or rows), GET /api/intelligence/pipeline/runs[/:id]; the command `intelligence run <file>`;
      events intelligence.pipeline.run.* declared in its taxonomy; in its own registry. Each run's report in intelligence/output/<run>.json:
      baselines, deviations, regimes, invariants, hypotheses, rows refused. The screen (deferred to IP7, said) charts each series against its
      baseline band with the deviations marked.
  IP7_the_screen:
    status: OPEN
    depends_on: [IP6_route_command_screen]
    files: [intelligence/ui/pipeline.html, intelligence/ui/pipeline.js]
    does: "Drop a file, see each series against its baseline, the regimes, the invariants and hypotheses. Tested in Clear Glass (AXIOMS §4.1)."

  IP8_negative_and_shadow_space:
    status: OPEN
    origin: "James, 2026-11-05: \"oh yeah, lets add that also. maybe thats the end of the pipeline, negative and shadow space\" · \"gaps are problems, or deviations\""
    depends_on: [IP4_invariants_across_series]
    files: [intelligence/pipeline/liminal-stage.js, intelligence/liminal/index.js, intelligence/liminal-space/index.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      The end of the pipeline reads what is not there. On numbers: the liminal field detector (detectField: edges, plateaus, convergence,
      oscillation) and the absences themselves — a series that should have deviated with its partner and did not, a gap in time, a value that
      never appears. On text (notes, journals, reviews): the detectors he named — negative space (topic orbit, avoidance, a vocabulary that is
      missing), shadow (displacement, intensity mismatch), contrastive (belief against behaviour). Every finding is a gap, marked as a problem
      or a deviation. Reused as they are: intelligence/liminal (12 detectors, signals not diagnoses) and liminal-space.
  IP9_the_open_loop:
    status: OPEN
    origin: "James, 2026-11-05: \"like a open loop system. like the way the human mind works.\""
    depends_on: [IP8_negative_and_shadow_space, IP5_invariants_into_rfr2]
    files: [intelligence/pipeline/open-loop.js, intelligence/pipeline/report.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      A run ends with its open questions, not a verdict: the hypotheses that did not crystallise, the gaps (problems and deviations) and what
      was missing. They are saved with the dataset kind's baseline and become what the next run checks first: did the hypothesis cross the
      floor, did the gap close, did the missing thing appear. A question closes only when a later run answers it, and the answer says which run.
  IP10_growth_tracking:
    status: "OPEN — waits on his reading of \"growth tracking for the self\" (above)"
    origin: "James, 2026-11-05: \"like growth tracking for the self. its for structure. integration and friction tracking. intution, and deomposition.\""
    depends_on: [IP9_the_open_loop, IP11_risk_ambiguity_uncertainty_wired]
    files: [intelligence/pipeline/growth.js, intelligence/friction.js, intelligence/intuition.js, intelligence/synthesis/engine.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      The same run repeated over time, tracked as growth along his five axes, each from a part that exists: structure (the invariants that
      hold, and how many), integration (gaps that closed, hypotheses that became invariants), friction (intelligence/friction.js tensionOf over
      the open gaps; uncertainty shrinking and ambiguity reconciled, from IP11, count as integration), intuition (intelligence/intuition.js, the fast pattern-first reading, scored afterwards by whether the run proved it) and
      decomposition (synthesis/engine.js breaking a problem into its chained gaps). A growth line per axis, per period.

  IP11_risk_ambiguity_uncertainty_wired:
    status: OPEN
    origin: "James, 2026-11-05: \"Risk assessment. Ambiguity. Uncertainty. They need to be wired together.\""
    depends_on: [IP8_negative_and_shadow_space, IP9_the_open_loop, IP_D5_risk_weights]
    files: [intelligence/pipeline/assess.js, intelligence/schemas/assessment.schema.json, tests/modules/test-intelligence-pipeline.test.js]
    sovereignty: >-
      The pieces it learns from live in lib/ (gap-field-engine, open-loop-taxonomy, intent-classifier, ambiguity-pull). His rule (2026-11-03):
      "lib is not a directory for anything that a system uses". So assess.js does not require them: the three measures are written once in
      intelligence's own assessment schema, and the lib pieces move to their systems (or are reached by route) in the per-system drawbridge
      phases, not here.
    found: >-
      (read 2026-11-05) The three exist apart and never meet: risk as action levels (lib/intent-classifier.js READ … IRREVERSIBLE) and as the
      gap field's forecast risk factors; uncertainty as the gap field's UNCERTAINTY axis and lib/open-loop-taxonomy.js ("A gap is an open loop
      … uncertainty that has been acknowledged and preserved with context"); ambiguity as the ambiguity_pull tool and the liminal detectors.
      No gap carries all three, and none of them decides what happens next.
    does: >-
      Every gap (problem or deviation) carries three measures, each from what exists, and the three decide its route:
        uncertainty — what is not known yet and more data can settle: a short window, a baseline with few points, a hypothesis below the floor
                      of three. Route: the open loop (IP9), the next run checks it.
        ambiguity   — more than one reading fits the same data: two invariants explain one deviation, a liminal signal with two meanings.
                      More data of the same kind does not settle it. Route: asked, with the readings side by side (his rule: "Ambiguity must
                      be reconciled by me").
        risk        — what it costs if the reading is wrong: the impact (the gap field's blast radius), how reversible acting on it is (the
                      intent classifier's levels) and how likely it is, given the other two. Risk rises with uncertainty and ambiguity, never
                      falls with them.
      Together: low risk → reported; high risk with high uncertainty → hold and gather; high risk with high ambiguity → ask before anything;
      high risk with both low → act or recommend, said with the numbers. Nothing is acted on that it has not assessed.

proof_planned: >-
  test-intelligence-pipeline on planted data, so the right answer is known before the run: one series with a step change (one deviation run,
  regime degraded), one oscillating (oscillatory), two series that deviate together five times (an invariant), two loud series that co-deviate
  only at chance (a hypothesis, never an invariant: F2's case on numbers), and a file with bad rows (counted and said). Then a second run of the
  same kind against the saved baseline and invariants (IP5): the break is named. IP8–IP10: a planted series with a missing stretch and a
  topic that stops being mentioned (negative space found), a run whose open questions are the next run's input (the loop stays open), and a
  dated journal sample whose friction and integration are tracked across weeks. IP11: four planted gaps, one per route (reported, held for
  data, asked, acted on), each routed by its measures; and the check that no gap is acted on unassessed.
