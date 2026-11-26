# docs/2026-11-26-raid-queue-and-signal-field-phasemap.spec — the request held in RAID's queue until its pipeline meets it; one ledger by id;
# the signal-to-noise metrics of every input, through WARP 2 and the constraint field, to the questions that matter, adjustable so it learns.
# author: james-brooks (the ideas and the direction are his; the coder wrote this origin and the phases from his words, 2026-11-26)
meta:
  status: "MAPPED 2026-11-26, from his words in the session that started the pipeline building end to end. Nothing built."
  james: >-
    "work from inside nexus and use what you can to reduce all you usage as much as possible using nexus. give capacity, not hand holding. get
    nexus building from the inside out. get the pipeline working, using the pipeline as much as possible. like the canvas needs to expand. need
    the raid queue to be where the request is stored until its moved through the raid pipeline. needs a ledger that corralates with the
    contracts, nodes, and all the context by id." · "we need metrics for the signal to noise filter for inputs to run through warp 2, and the
    constrain field using axioms and the combined synthesized metrics as multidimential fields to remove the noise, then we can have pre-req
    from those metrics so we know what questions are important, using the intelligence system. it needs to have these adjustable so it can
    learn overtime. as fluid or dynamic as possible, for learning over time."
  reuse: >-
    RAID's queue and contract intake (cortex/core/raid/contract-intake.js: "the one door every build source", one-contract-raid-releases map);
    COS's request kept as files (cos/pipeline/runs.eg: run.run, dag.dag, steps/*.step, gates/*.gate); the DAG from the end state
    (cos/pipeline/backward.eg); RAID's per-edge SNR pre-gate (cortex/core/raid/snr-filter.js, docs/raid-snr-filter.spec); the metric point,
    compartment stats and learning loop (ML1-ML3, docs/2026-10-30-compartment-metrics-and-learning-loop-phasemap.spec); WARP 2 and the
    constraint relational field (EM2, RF1, CF1; sigma measures deviation, delta measures gaps); PC31 (the first node the request, the last the
    end state).
  credit: "WARP 2, the constraint relational field and this framing are James Brooks's. RAID's SNR filter is Nexus's; SISO is his mentor's and is not used here."

decisions:
  RQ_D1_which_metrics:
    status: PENDING — his
    question: "Which measures make an input's signal-to-noise? (the field's dimensions)"
    readings:
      a: "RAID's SNR filter's own resolution (known invariant, cached pattern, novelty) as the first dimensions, then sigma (deviation from the baseline) and delta (the gap to the declared boundary)."
      b: "One dimension per axiom group that constrains the input (Part IV), each scoring how far the input sits inside its boundary; the SNR filter's score is one of them."
    coders_recommendation: "(a) first: it is computable today from what RAID and Intelligence already record; (b) is the constraint field (RQ5) layered on it."
  RQ_D2_who_adjusts:
    status: PENDING — his
    question: "What moves the weights over time?"
    readings:
      a: "Outcomes only: a weight moves when a question it ranked high turned out to change the result (its gate flipped), and back when it did not."
      b: "Outcomes and him: his edits to a weight are kept as rows and outrank the learned value until the outcomes disagree three times (his three-gap rule)."
    coders_recommendation: "(b): his edits stay his (USER_AUTONOMY), the learning is said beside them."

phases:
  RQ1_the_request_waits_in_raid_s_queue:
    status: OPEN
    depends_on: []   # the pure queue; COS taking from it is PC31's
    files: [cortex/core/raid/request-queue.eg, cortex/core/raid/test/request-queue.test.eg]
    does: >-
      A request (his, an agent's, a rule's) is a row in RAID's queue from the moment it is asked until its pipeline's contract is met: its id,
      who asked, the words, the end state, the pipeline that carries it, where it stands (queued, running, held, met, refused). COS takes the
      next row; it never holds a request RAID does not have. Pure: enqueue, take_next, move(id, state, why), view.
    examples:
      - 'move({ id: "r1", state: "queued" }, "running", "taken by COS") == { id: "r1", state: "running", why: "taken by COS" }'
      - 'take_next([{ id: "a", state: "met" }, { id: "b", state: "queued" }]) == { id: "b", state: "queued" }'
      - 'take_next([{ id: "a", state: "met" }]) == null'
      - 'enqueue([], { id: "r1" }) == [{ id: "r1", state: "queued" }]'
      - 'enqueue([{ id: "r1", state: "queued" }], { id: "r2" }) == [{ id: "r1", state: "queued" }, { id: "r2", state: "queued" }]'
    proof: "a request asked through COS is RAID's queue row first; its pipeline run names that row's id; met closes the row"
  RQ2_one_ledger_by_id:
    status: OPEN
    depends_on: [RQ1_the_request_waits_in_raid_s_queue]
    files: [cortex/core/raid/id-ledger.eg, cortex/core/raid/test/id-ledger.test.eg]
    does: >-
      One ledger where every id meets: the request, its contract, its pipeline run, each node (.step), each gate (.gate) and the context each
      holds, each model call. A row is { id, kind, parent, at, what }; any id gives back its whole lineage, up to the request and down to the
      last gate (replayable, reversible, debuggable: PC3, FX1a).
    examples:
      - 'lineage([{ id: "g1", kind: "gate", parent: "s1" }, { id: "s1", kind: "step", parent: "r1" }, { id: "r1", kind: "request", parent: null }], "g1") == ["r1", "s1", "g1"]'
      - 'lineage([], "x") == ["x"]'
    proof: "from one gate's id the ledger names its node, run, contract and request, and the request's id lists every node it grew"
  RQ3_signal_metrics_of_an_input:
    status: OPEN
    depends_on: [RQ_D1_which_metrics, ML1_metric_point]
    files: [intelligence/signal-metrics.eg, intelligence/test/signal-metrics.test.eg]
    does: >-
      Each input to a request gets its metrics, one number per dimension (RQ_D1), each from what Nexus records (RAID's SNR resolution, the
      baseline's sigma, the boundary's delta), kept as a metric point (ML1) with the input's id.
    proof: "an input's metrics are a row in the id ledger (RQ2) and can be recomputed from it"
  RQ4_through_warp_2:
    status: OPEN
    depends_on: [RQ3_signal_metrics_of_an_input]
    files: [intelligence/warp2-pass.eg, intelligence/test/warp2-pass.test.eg]
    does: >-
      The inputs and their metrics run through WARP 2 (his): the combined, synthesized metrics are a field over the inputs, and each input's
      place in it is said (signal, noise, tension between them).
    proof: "two runs on the same inputs and metrics give the same field (pure); a changed weight moves the field and the change is said"
  RQ5_the_constraint_field_removes_the_noise:
    status: OPEN
    depends_on: [RQ4_through_warp_2]
    files: [intelligence/constraint-field.eg, intelligence/test/constraint-field.test.eg]
    does: >-
      His constraint relational field, multidimensional: the axioms (Part IV) are the boundaries, the synthesized metrics the dimensions. An
      input outside the field on any dimension is noise for this request, set aside with the dimension and the axiom that excluded it (never
      deleted: a set-aside input can be brought back).
    proof: "an input set aside names its dimension and axiom; bringing it back is a row in the ledger"
  RQ6_the_questions_that_matter:
    status: OPEN
    depends_on: [RQ5_the_constraint_field_removes_the_noise]
    files: [intelligence/prereq-questions.eg, intelligence/test/prereq-questions.test.eg]
    does: >-
      From the field, the prerequisites: what must be known before the end state can be met (backward.eg's open conditions), ranked by how much
      of the field each would settle. The highest are the questions to ask; a question the axioms settle is answered, not asked; one that is his
      goes to him with its readings side by side.
    proof: "a request's first questions are the open conditions of its DAG ranked by the field, each naming why it ranks where it does"
  RQ7_adjustable_so_it_learns:
    status: OPEN
    depends_on: [RQ_D2_who_adjusts, RQ6_the_questions_that_matter, ML3_learning_loop]
    files: [intelligence/field-weights.eg, intelligence/test/field-weights.test.eg]
    does: >-
      Every weight of the metrics and the field is a row he can edit (Cortex rows, as CA6), and moves with the outcomes (RQ_D2): a question
      ranked high that changed the result raises its dimensions; one that did not lowers them. Each move is said with its evidence.
    proof: "after a run, the weights that moved name the gates that moved them; his edit outranks the learned value as RQ_D2 says"

order: "RQ1 → RQ2 (the request and its ledger: the frame) · RQ3 → RQ4 → RQ5 → RQ6 → RQ7 (the field), after RQ_D1 and RQ_D2 are his."
