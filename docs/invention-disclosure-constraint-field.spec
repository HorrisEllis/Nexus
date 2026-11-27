spec:
  name: Invention disclosure: the constraint field (agnostic constraint-relational measurement and repair of generated work)
  inventor: James Brooks
  status: DRAFT for an attorney or the USPTO Patent Pro Bono Program; not legal advice; nothing here is filed
  written: 2026-11-26, at his request: "can i get the right to ip on this?" · "yes, agnostic code. so emerge then? nexus? we just need this coding."
  credit: >-
    The ideas, the framework and every call below are James Brooks's, in his words and dated. The software that implements parts of it was
    written with an AI coding assistant under his direction (named as the coder's part in docs/PROOF-OF-COMPETENCY.md). SISO (Event -> Gate ->
    Stream) is his mentor's, not his, and is not claimed here.

sections:
  - id: problem
    title: The problem it solves
    body: |
      Generated work (code written by small language models, documents, plans) is checked today in one of two ways: rigid form checks
      (grammars, compilers, schemas: they accept anything well formed, including work that means the wrong thing) or a person reading it.
      Neither says why a piece is wrong, so automated retry loops repeat the same failure. Observed in his system on 2026-11-26: a module's
      function compiled and passed its form checks while its body returned nothing; 44 automated retries never reached that cause.

  - id: invention
    title: What the invention is
    body: |
      A constraint field: every unit of work (a code function, a phase of a plan, a paragraph, a decision) is placed among the constraints that
      relate to it, along several dimensions at once: its stated purpose (the specification's sentence), its examples (inputs and the results they
      must give), its inputs and outputs, its neighbouring units, the names it uses, and an associative lattice of what resembles, follows and is
      missing. Before the unit is produced, each dimension DECLARES what it expects (WARP 2: an expectation is declared first; a broken one is a
      gap). After the unit is produced, its position is MEASURED against every declared expectation: sigma (how far it deviates) and delta (the
      gap between what was declared and what is shown). The largest delta NAMES the cause, and the repair loop returns to the original request
      with that named cause, not with a fixed retry. The same field, unchanged, applies to every system: a reasoning and decision system (RAID),
      a build pipeline, a code builder, a document; it is agnostic of domain, system, agent and language.

  - id: distinct
    title: What is distinct (to test against prior art)
    body: |
      1. Meaning is judged as a position among declared constraints, measured by deviation and gap, not by form alone (fluid, not rigid: his
         words, "the other solution. is rigid. the constrain field, makes it fluid and dynamic").
      2. Expectations are declared before the work exists, so a gap is defined independently of the work that fills it.
      3. The measured largest gap is the routing signal: it decides what the next step repairs, and every step is a new node of a replayable
         timeline (his: "A new node for any next step. Then we can have a timeline to replay and reuse the pipeline").
      4. One unit shape at every level: idea -> specification -> phases -> phase nodes -> pieces, each an end state with a checklist (a DAG) at
         its gate, broken down the same way (his, 2026-11-26).
      5. Agnostic: the same field and measurements serve code (in his language Emerge), plans, documents and decisions.

  - id: evidence
    title: Dated evidence (in the repository's history)
    body: |
      - docs/cfr.spec (the constraint relational field): in the repository since 2026-09-26.
      - emerge/emerge/field/causal.eg and warp.eg (WARP 2: typed causes, declared expectations, sigma, delta), 2026-11-26, tests 4/4 each.
      - docs/2026-11-25-break-anything-down-phasemap.spec UD1, UD24, UD29 (2026-11-25/26), his words quoted with dates.
      - docs/PROOF-OF-COMPETENCY.md entry 2026-11-26 (the loop that returns to the request; predictions registered before results).
      - cos/data/build: the build records that show the failure the field addresses (2026-11-26).

  - id: built
    title: What is built and what is not
    body: |
      Built: WARP 2's causal layer and expectations in Emerge; the pipeline that returns to the request; the end-state-first plan.
      Not built: placing every unit in the field and routing repair by its largest delta (UD29). A provisional application can describe the
      method before it is fully built, but the more concretely it is described and shown working, the stronger it is.

  - id: next
    title: Next steps (his to take)
    body: |
      1. Check whether the repository or the idea was made public, and when: the US allows filing within one year of public disclosure;
         most other countries require filing before any disclosure.
      2. Take this disclosure to a patent attorney, the USPTO Patent Pro Bono Program, or a law school IP clinic.
      3. Consider a provisional application (holds the date for 12 months) once UD29 runs on one real case.
