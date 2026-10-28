# 0.60.228 — 2026-10-23

James: "agent needs to map dependancies if nexus cant map one."

SL8 of the self-building-loop map.

## Why

After SL3, 233 open phases on Nexus's maps still can't be placed by anything deterministic: they name no files, and nothing in their
words points at one. DG2 refused every one of them (NO_GRAPH, no override). MP4 (0.60.29) could already ask an agent to map phases,
but only as a batch job, never at the moment a build needed it.

## Built

- **At build time, one phase.** When MP1 placed nothing, `_phaseBuild` asks the repo's agent to map that phase before DG2 would refuse
  it. It uses MP4's own brief and answer checker, so nothing new sits beside them (§8.6). The brief now also asks for `depends_on`,
  chosen from the map's phases.
- **Everything checked by code:**
  - a file inside the repo that exists, or a new one in a folder that exists;
  - a `depends_on` that resolves to a phase, is not the phase itself, and is not downstream of it (no cycle).

  An unsafe path, a folder that doesn't exist, a name that is no phase, or an answer about another phase is refused, each with why.
- **Kept.** Per phase and per hash of its text, in `idearium/data/phase-mapping/<repo>.agent-maps.json`. Build the phase again and
  nothing is asked; change its text and it is asked again.
- **The graph** is built from the mapping (source `agent`). The files that exist get their requires and consumers through MP1.
- **Said:**
  - the run's rows carry `mappedBy`, and the Plan panel's run says "mapped by agent:<x>: <files> · depends on …";
  - SL7's "built again on request" shows there too;
  - an answer that passes no check is not used, and the 409 NO_GRAPH names what the agent answered.
- **Decided by the axioms** (TRUTH_OVER_COHERENCE, NC0's evidence rule): the agent's `depends_on` are claims. They go on the graph and
  the run as `agent:<by>`, and they never refuse a build. DG1 still gates what the map declares.
- **Nothing is written into your maps.** SL3's groom writes, when you say so.

## Found, said

- Ingesting a second project with byte-identical files returns the first repo. The test now uses different content. If that isn't
  intended, it belongs to the repo layer's map.
- `test-plan-lands` PL-31 is red on main too: `idearium repo plan --dry --file <spec>` prints its usage. It's listed for SL10.

## Proof

| Suite | Result |
| --- | --- |
| test-agent-maps-phase (new) | 4/4 |
| contract-phase-build | 14/14 |
| chunked-phase-build | 16/16 |
| phase-mapping | 12/12 |
| phase-groom | 6/6 |
| phase-graph | 4/4 |
| phase-deps-gate | 3/3 |
| verify-first | 10/10 |
| plan-code-run-attention | 40/40 |

`test-agent-maps-phase` covers:
- **AM-01:** every check;
- **AM-02:** kept, re-asked, and wrong answers;
- **AM-03:** the real router with a scripted agent: asked once, then nothing; a bad answer gets NO_GRAPH with why;
- **AM-04:** the run and the panel say it.
