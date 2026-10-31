# 0.60.327 — Intelligence, RFR2 and CFR: one causal system (specced and mapped)

James, 2026-10-31:
> "also the intelligence system, rfr2 and cfr need to be interconnected."

## What was measured (main, 0.60.326)

All three already live in `intelligence/`, but they don't connect:

- **Require edges:**

  | From → to | Edges |
  |---|---|
  | Intelligence → CFR | 7 |
  | CFR → Intelligence | 1 |
  | Intelligence → RFR2 | 4 (three of them in routes) |
  | **RFR2 ↔ CFR** | **0** |

- **Three causal graphs, none linked:**
  - CFR's `CausalGraph`, built from ledger entries.
  - RFR2's kernel. It is a 20,000-event ring fed from the bus only after someone calls an RFR2 route, and it starts empty every time.
  - `relational-field`, which is what self-heal and forensics actually use. `failure-mode-forensics` says RFR2's kernel "does NOT exist"
    for it.
- **Three sigmas,** each a different measure:
  - CFR's: one event's deviation, stored when the event is written.
  - RFR2's: a regime over a window.
  - The baseline's: a rolling deviation, used for friction.

## Specced (`intelligence/spec/causal-interconnect.spec`, full depth) and mapped (CI1–CI5)

- **CI1, one feed:** CFR's ledger entries, with their derived edges, go into RFR2's kernel.
  - The kernel starts with Intelligence, not on the first query.
  - A failing kernel never slows or fails a ledger write.
- **CI2, one graph:** CQL, traces, and relational-field's "why did this fail" chains all read the same graph.
- **CI3, the measures chained:**
  - CFR sigma → RFR2's delta stream → regime and bottlenecks → CFR's field and the baseline.
  - Each measure stays named for what it is.
  - A deviation past sigma becomes a `.benchmark` candidate (RULE B).
- **CI4, learning from both:** a recurring bottleneck with one causal root becomes a pattern proposal through the gate, with its chain as
  evidence. It comes after ML3, the batched learning loop.
- **CI5:** routes, command rows (`intelligence causal`, `intelligence regime`) and the view.

The only new files are the bridge and the measures. Everything else exists (§8.6).

## Proof

- `test-substrate-spec` 3/3, with this spec added.
- The phase DAG has no new problems.
- The 16 crossings in the five phase graphs are all already known; none is new.

## His to confirm

CI_D1, the coder's reading of "interconnected": one graph that CFR builds and RFR2 reads, with the sigmas chained but kept apart.
