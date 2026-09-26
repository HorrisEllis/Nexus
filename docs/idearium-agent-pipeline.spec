# idearium-agent-pipeline.spec

```
spec_id:      nexus.spec.idearium-agent-pipeline
uuid:         nexus-spec-idearium-agent-pipeline-v1-0000-2026-0819-001
version:      0.1.0
status:       Specified                     # §17.2
owner:        idearium                      # §17.1 — one authority for the arc
authority:    docs/MAP-2026-08-19-idearium-agent-pipeline.md
governs:      idearium/spec-engine/*, idearium/repo/*, idearium/agent-suite/*,
              lib/chunk-build-orchestrator.js, lib/chunk-service.js,
              copilot/lib/autonomy-router.js, guardian/userscript-nexus-wake.js,
              lib/agent-chat.js, lib/intake.js
created:      2026-08-19
```

## §0 What this is, and what it refuses to build

**The ask.** Tell co-pilot to have ChatGPT build something: from an idea, an
uploaded `.spec`, or one wizarded on the spot; compiled; stored as an idearium
repository compartment with the spec as its metadata; chunked; dispatched to
ChatGPT by default; injected into the agent chat; and from there the agent uses
"hey nexus" to reach back into NEXUS, talks to co-pilot the whole way, and
improves whatever it finds — full NEXUS at its disposal.

**Every piece of that exists.** The map names the file for each one. So this
spec builds no compiler, no chunker, no repo, no wake word, no tool surface —
§1.1 (they exist), §16.5 (delete before add), §10.3 (a second copy of any of
them is a competing truth layer). It specifies **four seams** and the
**governance the loop needs before it is allowed to run**.

## §1 The one non-negotiable

An agent holding `safe-apply`, `delete-file`, `run-command`, `forge-tool` and
`nexus-heal`, told to "improve anything it finds," is unsupervised
self-modification of the system that governs it.

**The agent's ambition is not restricted. Its write authority is.**

| the agent may | without limit | because |
|---|---|---|
| read anything | yes | §16.2 — systems must explain themselves |
| analyse, criticise, find gaps | yes | this is the point of the loop |
| propose improvements | yes, unbounded | §7.1 — ideas are input, not output |
| write to the Idea Ledger | yes | `propose-idea.js` |
| **change the running system** | **no** | §7.2, §7.3, §17.10 |

A proposal becomes a change only through `lib/intake.js`'s existing path:
`stage → recordVerdict(by: <real gate>) → promote(by:'user') → rollback`.
Nothing new is invented for this; the same gate that governs a downloaded file
governs an agent-authored patch. **`intake.js` is not in the merged tree and
must land before P1.**

## §2 Phases (§3.1 bottom-up, §3.4 raw → library → API → CLI → UI)

---

### P0 — Land the gate, then prove an agent cannot get round it

- **Do:** install `lib/intake.js` + `tests/modules/test-intake.js` into the tree.
  Add an `agent` branch: a proposal authored by an agent stages exactly like a
  download — with `provenance.author = <agent>` and the session that produced it.
- **§12.1 adversarial:** the tests that matter are the ones that try to break it.
  An agent calling `promote` must fail. An agent calling `recordVerdict` must
  fail (IN-007 already proves `chatgpt`/`claude`/`copilot` bounce). An agent
  editing its own contract's `verdict` field on disk must not be honoured.
- **Gate:** an agent-authored proposal is visible, diffable, and **unlandable**
  without you. Verified by an adversarial suite, not by reading the code.
- **This gate blocks every phase below it.** Not negotiable (§16.3).

---

### P1 — Budgets, before the loop can spend

§15.1: a request fails when its iteration budget is exhausted, and exhaustion is
a loud, specific event (§1.2).

- **Do:** one budget object carried through the whole arc — `{ chunks, wakeCalls,
  dispatches, wallClockMs }` — decremented at every hop, attached to every event.
- **§15.2:** each attempt emits its own event: attempt number, agent, fault class
  (`open-loop-taxonomy.classify()`), reflection score.
- **On exhaustion:** stop and **ask** (`ask-james.js` exists), never silently
  continue and never silently stop. Q3 decides which.
- **Gate:** a deliberately looping build halts at its budget, with an event
  naming which budget ran out and what it had spent.

---

### P2 — One job that runs the arc  *(closes IAP-GAP-2)*

`lib/pipeline-run.js` — a single addressable job, because you are currently the
orchestrator between hops and §17.8 says a repeated human decision belongs in
the system.

```
  intent (idea | uploaded .spec | wizard)
    → spec-engine compile          idearium/spec-engine/index.js
    → repo compartment             idearium/repo/index.js   (spec IS the metadata)
    → chunk                        lib/chunk-service.js
    → dispatch per chunk           agent-suite.buildChunkWithAgent()
    → verify per chunk             spec-engine/chunk-dispatch.js
    → assemble
    → stage                        lib/intake.js            ← never applies
```

- **§14.1:** the arc is a SISO pipeline — event → gate → event, one gate per
  transformation. Not one monolithic handler (that is a build warning).
- **§5.9:** the job calls each system through its declared contract. It never
  reaches inside idearium's or guardian's internals.
- **§2.1:** the run is persisted at every hop. A run that cannot survive a
  restart does not exist (§2.2) — and these runs are long.
- **§0.3:** a failed or abandoned run is classified (§7.5: unresolved / rejected
  / abandoned), never deleted.
- **Gate:** one real end-to-end run producing a staged, diffable, unlanded drop.

---

### P3 — The wake loop is part of the arc, not a side channel

`userscript-nexus-wake.js:175` already POSTs to co-pilot; `autonomy-router` 2.0.0
already proposes-then-confirms for state-changing actions.

- **Do:** carry the pipeline run's id through the wake call, so the agent's
  "hey nexus" during chunk 7 is attributable to chunk 7 of that run (§9.6 — the
  session chain; a broken chain is a `CONTEXT_LOSS` fault).
- **Do:** the agent's improvement proposals during a build route to
  `propose-idea.js`, tagged with the run — so "what did this build teach us"
  is answerable afterwards (§7.4, and §15.3: learning is cumulative).
- **Gate:** a wake call mid-build appears in the run's own history with its
  chunk, and an idea proposed mid-build is retrievable by run id.

---

### P4 — The ChatGPT default  *(closes IAP-GAP-1)*

`agent-suite/index.js:193` defaults `preferAgent = 'ollama'`; ChatGPT is the
fallback at :209.

- **Blocked on Q1.** A global flip routes every chunk through a browser tab you
  are also using — slower, rate-limited, and it competes with you for the tab.
- **§17.11:** whichever is chosen, any "better" claim names its benchmark and
  reports the unfavourable case. "ChatGPT builds better chunks" needs a
  measurement, not a preference.
- **Gate:** a per-job `preferAgent` that is honoured end to end, and a recorded
  comparison on the same spec before any default changes.

---

### P5 — Surfaces (§3.4, in order, not before P2's gate)

- **API:** `POST /api/pipeline/run`, `GET /api/pipeline/run/:id` on idearium.
- **CLI:** `nexus pipeline run --spec <uuid> --agent chatgpt`.
- **UI:** last. A run view is a projection (§5.12) — the arc, the chunks, the
  wake calls, the staged drop, and the gate that has not passed yet.

## §3 Invariants

- **IAP-INV-1** An agent may propose without limit and change nothing. (§7.2, §7.3)
- **IAP-INV-2** Every artifact the pipeline produces is staged, never applied. (§17.10)
- **IAP-INV-3** Only `by:'user'` promotes. (§IP-5)
- **IAP-INV-4** Every hop is budgeted; exhaustion is loud. (§15.1, §1.2)
- **IAP-INV-5** The run id threads every hop, including wake calls. (§9.6)
- **IAP-INV-6** The pipeline calls contracts, never internals. (§5.9, §5.10)
- **IAP-INV-7** The spec is the compartment's metadata — the repo stores no
  content of its own. (already true; must stay true)

## §4 Tests (§12.1 — adversarial first, they are the ones that matter)

- `IAP-001` an agent calling `promote` is refused
- `IAP-002` an agent calling `recordVerdict` is refused
- `IAP-003` an agent editing a staged contract's `verdict` on disk is not honoured
- `IAP-004` an agent-authored proposal carries author + session provenance (§17.5)
- `IAP-005` a build loop halts at its budget with a specific exhaustion event
- `IAP-006` a run survives a process restart and resumes (§2.2)
- `IAP-007` an abandoned run is classified, never deleted (§7.5, §0.3)
- `IAP-008` a wake call mid-build is attributable to its chunk and run (§9.6)
- `IAP-009` the repo record holds no content — only an index entry (IAP-INV-7)
- `IAP-010` a chunk dispatch failure is classified through `open-loop-taxonomy`,
  not a fresh error string (§13.3)
- `IAP-011` end-to-end: a spec becomes a staged, diffable, unlanded drop
- `IAP-012` the same spec run twice produces the same `rootHash` (§17.4)

## §5 Drift (§12.5)

| date | checked | finding |
|---|---|---|
| 2026-08-19 | written | Every component verified present in the merged tree. P0–P5 unimplemented. `lib/intake.js` absent from the tree and required by P0. Q1–Q3 open. |

## §6 Rejected alternatives (§17.3)

- **Letting the agent apply its own improvements directly.** Rejected: §7.2,
  §7.3, §17.10. Not a capability limit — a write-authority limit. The agent
  proposes without restriction; the gate decides.
- **A new orchestration engine.** Rejected: §16.7. The hops exist; sequencing
  them is the work. Anything larger adds more than it removes.
- **Flipping `preferAgent` to ChatGPT now.** Rejected for now: it silently
  reroutes every build through a tab you are using, with no benchmark behind the
  claim that it is better (§17.11). It is Q1, not a patch.
- **A second content store in the repo.** Rejected: `repo/index.js:11-25`
  deliberately removed it on 2026-07-11 so the spec is the single metadata
  authority. Re-adding one would recreate the §10.3 divergence that redesign fixed.
