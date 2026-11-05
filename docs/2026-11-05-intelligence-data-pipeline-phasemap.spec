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
    status: "SUPERSEDED 2026-11-05 by his correction (kept, §0.3) — no new formula; the primitives' own confidence scoring is used. A weight
      becomes his question again only if a run shows the primitives cannot tell two routes apart."
    was: "risk = impact × irreversibility × (1 + uncertainty + ambiguity), thresholds 0.3 and 0.7 (the coder's proposal)"
    note: "Cross-domain (the coder's, for him to judge): economics splits these three — Knight's risk (known odds) vs uncertainty (unknown
      odds), and Ellsberg's ambiguity (several models fit). In Nexus they are one primitive read three ways."

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
    depends_on: [IP9_the_open_loop, IP11_risk_ambiguity_uncertainty_one_primitive]
    files: [intelligence/pipeline/growth.js, intelligence/friction.js, intelligence/intuition.js, intelligence/synthesis/engine.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      The same run repeated over time, tracked as growth along his five axes, each from a part that exists: structure (the invariants that
      hold, and how many), integration (gaps that closed, hypotheses that became invariants), friction (intelligence/friction.js tensionOf over
      the open gaps; uncertainty shrinking and ambiguity reconciled, from IP11, count as integration), intuition (intelligence/intuition.js, the fast pattern-first reading, scored afterwards by whether the run proved it) and
      decomposition (synthesis/engine.js breaking a problem into its chained gaps). A growth line per axis, per period.

  IP11_risk_ambiguity_uncertainty_one_primitive:
    status: OPEN
    origin: >-
      James, 2026-11-05: "Risk assessment. Ambiguity. Uncertainty. They need to be wired together." Then, correcting the coder's first map of
      it: "No I meant it’s also risk assessment. Ambiguity in a conversation. And uncertainty. Confidence scoring and crystallization. Nexus is
      build on reusable primitives"
    reading: >-
      The coder's reading, to confirm: the end of the pipeline (negative and shadow space, IP8) IS also risk assessment, ambiguity in a
      conversation and uncertainty. Not three new measures: the same primitives, reused. A gap (problem or deviation) gets a confidence score,
      and crystallization decides its state — anomaly (one), coincidence (two), invariant past the floor and above chance, else a hypothesis.
      Uncertainty is low confidence; ambiguity is two readings with close confidence (in data, or in a conversation through the liminal text
      detectors); risk is what a low-confidence or ambiguous gap would cost if acted on.
    depends_on: [IP8_negative_and_shadow_space, IP9_the_open_loop]
    files: [intelligence/pipeline/assess.js, intelligence/index.js, intelligence/rfr2/sigma/index.js, intelligence/liminal/index.js, intelligence/gap/hunter.js, tests/modules/test-intelligence-pipeline.test.js]
    found: >-
      (read 2026-11-05) The primitives exist inside intelligence and already carry confidence: the crystallizer (count, confidence, the
      maturity gate in intelligence/index.js), sigma's regime with its confidence (rfr2/sigma), the gap hunter and predicates (gap/), the
      adversarial check, and the liminal detectors' signals (conversation: contrastive, reversal, assumption, shadow, negative space).
    does: >-
      One assessment per gap from those primitives, nothing new beside them: { kind: problem | deviation, confidence, state: anomaly |
      coincidence | hypothesis | invariant, readings: [...] }. Uncertainty, ambiguity and risk are read off it, never stored apart: uncertainty
      = 1 − confidence; ambiguity = more than one reading within a close confidence of the best; risk = the gap's reach (what depends on it)
      when it is uncertain or ambiguous. The route follows: uncertain → the open loop (IP9); ambiguous → asked with the readings side by side;
      crystallized → reported as an invariant. The same assessment runs on data and on a conversation.
      His framework already states the risk side (Part 3): "More invariants = higher reward. More variables = higher risk." · "Bridge the gap to
      reduce risk". Read as the coder's, to confirm: risk grows with the variables still open (uncertain or ambiguous gaps), reward with the
      invariants that crystallized; closing a gap moves one from the first count to the second.
    superseded_first_map: >-
      (kept, §0.3) The coder's first version, 2026-11-05 (fc5099560), made the three separate measures with a new risk formula
      (impact × irreversibility × (1 + uncertainty + ambiguity)) and reached into lib/ for gap-field-engine, open-loop-taxonomy,
      intent-classifier and ambiguity-pull. He corrected it the same hour: they are the reusable primitives, confidence scoring and
      crystallization.
  IP12_gaps_between_the_pieces:
    status: OPEN
    origin: >-
      James, 2026-11-05: "The analysis tool can find gaps also. Inbetween the pieces, chunks, parts or components" — said with his framework
      pasted whole; its Section 3: "Using analysis to break problems down into pieces, and into more pieces, and into more, factually and
      recursively." · "Gaps in between bricks are where the tension lies." · "A missing dependancy in a codebase or plan."
    depends_on: [IP11_risk_ambiguity_uncertainty_one_primitive]
    files: [intelligence/pipeline/seams.js, intelligence/synthesis/engine.js, intelligence/gap/hunter.js, tests/modules/test-intelligence-pipeline.test.js]
    does: >-
      Analysis (decomposition) does two jobs, not one: it breaks a thing into pieces, and then it reads the seams between them. For each pair of
      neighbouring pieces (chunks of a text, windows of a series, components of a system, steps of a plan): what one expects that the other
      does not give (a missing dependency, an interface mismatch), a jump between them (a delta across the seam much larger than within
      either), and a piece that should be there and is not. Each seam finding is a gap like any other, assessed by IP11. Recursive, and only as
      deep as the problem is complex (his "proportional to the complexity of the problem, at most").
    reuse_note: >-
      Code already does this for two kinds of piece, outside intelligence: the spec compiler's gap field (lib/emerge/compiler/gap-field-engine.js:
      omitted and propagation gaps between spec modules) and the registry's declared-but-not-served check (lib/drawbridge-registry.js). Their
      method is carried here; their files are not required (his 2026-11-03 rule on lib/).

proof_planned: >-
  test-intelligence-pipeline on planted data, so the right answer is known before the run: one series with a step change (one deviation run,
  regime degraded), one oscillating (oscillatory), two series that deviate together five times (an invariant), two loud series that co-deviate
  only at chance (a hypothesis, never an invariant: F2's case on numbers), and a file with bad rows (counted and said). Then a second run of the
  same kind against the saved baseline and invariants (IP5): the break is named. IP8–IP10: a planted series with a missing stretch and a
  topic that stops being mentioned (negative space found), a run whose open questions are the next run's input (the loop stays open), and a
  dated journal sample whose friction and integration are tracked across weeks. IP11: planted gaps whose confidence and readings put one each on every route (open
  loop, asked, invariant), the same assessment on a planted conversation with a contradiction in it, and no gap routed unassessed. IP12: a text in chunks where one
  chunk names something no other gives, and a series whose windows are smooth inside and jump at one seam.
