# 0.60.119 — 2026-10-17

James: "Tests need to be first." · "Nothing is wasted from failure or fault." · after his mentor's review: "Need nexus to hold
as much of the complexity as possible, and let the right agent for the job, be in charge." · "Let's just continue where we
were, integrate anything new into the work we were doing and start the next phase"

TF1 and RA1 of `docs/2026-10-17-pieces-not-order-phasemap.spec` (addenda a and d).

## TF1 — a file's expectation, written first (`lib/expectation-tests.js`, new)

- **What was wrong.** A contract brick passed when a regex found its planned export names in the text. A file that did not
  load, required a file that does not exist, or exported a string under a function's name, passed.
- **Now, before any code is written**, Nexus writes each planned JS file's expectation test from the held plan. No model
  writes it. It checks three things:
  - the module loads;
  - every planned export exists;
  - a planned function is a function, and takes no more required arguments than its signature names.
- **A brick passes only when its expectation passes.** The test runs in a shadow copy of the repo with the phase's files
  so far overlaid. Nothing is written to the repo.
- **Seen failing first:** an existing file is checked as it is before the build, and the result goes on the evidence.
- **Nothing wasted:** what the check said goes with the brick's next try ("YOUR LAST ATTEMPT AT THIS FILE FAILED ITS
  CHECK …"). The contract's own persisted feedback seeds it, so the words survive a restart. Before, retries sent the same
  message again.
- **Limits, said:** these tests are shallow (load, exports, arity), not behaviour. A plan export with no signature is only
  checked to exist. Behaviour tests by a different hat are TF2, not built.

## RA1 — the right agent for each kind of job (`lib/agent-record.js` 1.1.0)

- **What was wrong.** The ladder was ordered once per phase, by request size. Every brick then climbed the same order:
  a test file and an engine file got the same agent first.
- **Now:**
  - each attempt row names its kind of job (`code.js`, `test.js`, `code.mjs`, …);
  - the agent record scores every agent per kind;
  - each brick's ladder is ordered by that kind's record, else by size, else as configured;
  - the order and its reason are kept on the brick's evidence (`<brick>.chosen`);
  - a person's pick is never reordered.
- **One record, nothing new stored.** It is read from the run log (`idearium_phase_runs`). Older rows count too: their kind
  is read from their file.

## On "crystallization memory" (his question)

Nexus has two, and neither picks an agent:
- **WARP's crystallizer** keeps verified outputs by digest. Builds run it in gate mode (kept, never served back), because a
  build's work is the files it writes.
- **Intelligence's pattern crystallisation** finds patterns in events. Nothing reads it for routing.

The run log is the record that knows who built what and how it ended, so RA1 reads that. To confirm whether he meant one of
the two crystal stores.

## Proof

- `tests/modules/test-expectation-tests.test.js` 7/7. EX-05 is a file that does not load: the old name check passes it,
  the expectation fails it.
- `tests/modules/test-contract-phase-build.test.js` 14/14. CP-12: a brick fails its expectation and is retried with the
  failing lines, then passes; each attempt row carries its kind.
- `tests/modules/test-agent-record.test.js` RA-01..05: a test brick goes to the agent that lands tests, a code brick to the
  one that lands code. AR-41/42 fail on `main` too; they are regex checks on source text.
- `test-chunked-phase-build` 16/16, `test-reject-learn-retry` 7/7.

## Not done, said

- Not run on his machine.
- RA1 only orders agents that are already on the ladder; ME5 (one chooser for all of Nexus) is still open.
- Behaviour tests (TF2) and his bad outputs, read and classified, are next.
