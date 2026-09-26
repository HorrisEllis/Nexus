# pressure-causality.spec

```
spec_id:      nexus.spec.pressure-causality
uuid:         nexus-spec-pressure-causality-v1-0000-2026-0818-001
version:      0.1.0
status:       Specified            # §17.2 — Draft → Specified → Implemented → Verified
owner:        orchestrator         # §17.1 — one authority
authority:    docs/MAP-2026-08-18-pressure-and-toolkit.md
governs:      lib/resource-monitor.js, autopilot.js, lib/cfr/*, lib/rfr2-bridge.js,
              cortex/intelligence/*, cortex/self-heal/escalation.js
supersedes:   nothing
created:      2026-08-18
```

## §0 Why this exists

At 16:30:57 on 2026-08-18 three supervised services exited `3221226505`
(`0xC0000409`) thirty seconds after free memory reached 0.2%. The system logged
the level and logged the exits, and could not answer **what led to it** — not
because the causal substrate is missing, but because nothing joins it to a
window in the past. §11.1: a cause is only as useful as the field it occurred
in. Both halves exist. This spec is the join.

**It builds no new engine.** §16.5, §16.7, §5.5. RFR2, CFR, sigma, the pattern
crystalliser, the component ledger and the resource monitor are all real and
running — proven in the 2026-08-18 log, not assumed. Everything below is
attribution and query over what is already there.

## §1 Non-goals

- No new sampler, no new bus, no new store. Additions here are fields on an
  existing sample and a read surface over existing tables.
- No auto-remediation. This spec explains; it does not act. Anything that kills
  a process on pressure is a separate spec with its own gate.
- No claim of "faster" or "lighter" anywhere without §17.11 — file, method,
  and the unfavourable case reported alongside the favourable one.

## §2 Phases (§3.1 bottom-up, §3.4 raw → library → API → CLI → UI)

Each phase has a gate. A phase does not begin until the one below it passes.

---

### P0 — Verify the claim before extending it  *(closes PC-GAP-4)*

`lib/resource-monitor.js:31` states that a child answers with its own
`memoryUsage()` and the supervisor collects it. That is a comment, not a proof.
`loom-map.js:74` made the same shape of claim about `JAA_DATA_DIR` and it was
false for weeks.

- **Do:** read `autopilot.js`'s supervision path; determine whether child
  samples are actually collected, and where they land.
- **Gate:** a written yes/no with file and line. If no, P1 must supply the
  transport, and that changes P1's size.
- **Exit criteria:** the answer is in this spec's drift section, dated.

---

### P1 — Pressure is attributed, not just levelled  *(closes PC-GAP-3)*

A scalar "0.2% free" cannot be acted on. The sample must name holders.

- **Do:** extend the sample emitted at `resource-monitor.js:176` with a
  `holders[]` array — `{ pid, name, rss, pctOfTotal, source }` — sorted
  descending, capped at the top N.
- **Sources, in order of preference:** (a) child samples if P0 proved they are
  collected; (b) the supervisor's own knowledge of the pids it spawned; (c) an
  OS query as the last resort. **Non-node processes must be included** — the
  entire point of the 2026-08-18 miss is that the 6.9 GB was Electron, and a
  node-only view would have reproduced the error exactly.
- **§5.5:** no npm process-lister. If an OS query is needed it is built, and it
  is platform-branched with a loud, specific failure on an unsupported platform
  (§1.2) rather than a silent empty array — an empty `holders[]` and "we could
  not look" must never be the same value.
- **§1.2:** when attribution is unavailable, the field is `holders: null` with
  `holdersUnavailable: '<reason>'`. Never `[]`.
- **§5.14:** existing consumers of `nexus.resource.pressure` must be unaffected
  by the added field. The event shape is extended, never changed.
- **Gate:** a real pressure event, on this machine, carrying a `holders[]` whose
  top entry matches an independent Task Manager reading within 10%.

---

### P2 — A supervised exit is a first-class causal event  *(closes PC-GAP-2)*

Today autopilot prints `exited code=3221226505` and restarts. The most
informative event of the session never enters the causal record.

- **Do:** on any non-zero child exit, autopilot emits `nexus.process.exited`
  carrying: pid, service, exit code, signal, decoded meaning where known
  (`0xC0000409` → stack buffer overrun / fail-fast), uptime, crashes-in-window,
  **and the last resource sample with its `holders[]`** (§11.1 — the event and
  the field conditions, both, or the record is incomplete).
- **§13.1:** the event carries conditions (CFR regime, sigma), context (session
  uuid, `causedBy`), and intent (restart decision). All three or it is
  incomplete.
- **§9.2 / §14.5:** ledger write before anything subscribes.
- **§17.7:** `0xC0000409` has now occurred twice (2026-07-24 boot log and
  2026-08-18). Second occurrence promotes it to investigation — this phase is
  that investigation's instrument, and a third occurrence promotes it to
  architecture.
- **Gate:** kill a supervised child deliberately; the event appears in
  `event_log` with a non-null `holders[]` and a decoded exit reason.

---

### P3 — The retrospective window  *(closes PC-GAP-1)*

The question is "what led to this spike," and it is answerable today only by
reading an hour of console output by eye.

- **Do:** `lib/pressure-window.js` — given a pressure or exit event, return the
  field as it stood: every `component_ledger` and `event_log` row in the
  preceding window (default 120s, caller-settable), the CFR regime and friction
  trace across it, the RFR2 depth and supporting-event count, the sigma record,
  the `holders[]` trend, and any `bep_patterns` row whose antecedent appears in
  the window.
- **§3.2:** ordering is `eventTs` only. Wall clock is display metadata. The log
  interleaves five processes' output; wall-clock ordering across them is a
  category error.
- **§10.2:** this is a **projection**. It writes nothing. Every row is read
  from its existing write authority (§10.1).
- **§11.3:** the expensive correlation runs only on a genuine anomaly — sigma
  ≥ 0.70, or any `nexus.process.exited`. The write path is never blocked.
- **§16.2:** the return value must read as a story — ordered, named, with each
  step attributable — not a bag of rows. That is the acceptance test, not a
  nice-to-have.
- **Gate:** run it against the real 16:30:57 crash already in `event_log`. It
  must surface `provider.host.starting`, the pressure ramp
  (16:28:55 → 16:29:05 → 16:29:25), and the three exits, in `eventTs` order.
  **If it cannot explain a crash that already happened, it will not explain the
  next one** — and that result is worth more than a pass.

---

### P4 — Surfaces (§3.4, in order)

Not before P3's gate passes. Each layer proves the one below already works.

- **API:** `GET /api/pressure/window?eventId=…` on orchestrator (owner, §17.1).
- **CLI:** `nexus pressure explain <eventId>` — the CLI in the floating menu is
  where you asked from, and §3.4 says it comes before the UI.
- **UI:** last. A panel is a projection of P3's output (§5.12) and adds nothing
  to the answer.

## §3 Invariants

- **PC-INV-1** Attribution unavailable ≠ attribution empty. (§1.2)
- **PC-INV-2** Every pressure and exit event carries its field conditions, or it
  is incomplete and says so. (§11.1, §13.1)
- **PC-INV-3** The window is a projection. It never writes. (§10.2)
- **PC-INV-4** Ordering is `eventTs`. (§3.2)
- **PC-INV-5** Compound correlation is gated on anomaly and never blocks a
  write. (§11.3)
- **PC-INV-6** No performance claim without a named benchmark and its
  unfavourable case. (§17.11)

## §4 Tests (§12.1, §12.2 — each must be able to fail informatively)

- `PC-001` a sample with attribution unavailable emits `holders: null` + reason,
  never `[]`
- `PC-002` an existing `nexus.resource.pressure` consumer is byte-identically
  satisfied by the extended shape (§5.14)
- `PC-003` a deliberately killed child produces `nexus.process.exited` with a
  decoded reason and a non-null last sample
- `PC-004` the window orders by `eventTs` across five interleaved process
  sources, and a wall-clock-ordered input does not change the output (§3.2)
- `PC-005` the window writes nothing — store hash identical before and after
- `PC-006` correlation does not run below the sigma threshold (§11.3)
- `PC-007` **the 16:30:57 replay** — against the real rows, the window names
  `provider.host.starting`, the pressure ramp, and the three exits
- `PC-008` a window over a period with no anomaly returns an explicit empty
  result with a stated reason, never a plausible-looking narrative

## §5 Drift (§12.5 — living)

| date | checked | finding |
|---|---|---|
| 2026-08-18 | written | P0–P4 unimplemented. Substrate verified real and running against the 16:27–20:05 log. P0's question is open. |
| 2026-08-18 | P0 ANSWERED | **The claim is TRUE and larger than stated.** `autopilot.js:659` `_getPerPidMemoryMB()` is real, batched, cross-platform (wmic/ps), and its output is written to `autopilot.instance_snapshot` as `perSystemMemMB` + `topConsumer`. So PC-GAP-3 was half wrong: attribution EXISTS, it just never reaches `nexus.resource.pressure`. Two limits found: (a) it covers only autopilot-tracked pids, so Electron's 13 renderer children — including the 4,951 MB one — are invisible to it; (b) an empty OS result becomes `{}`, indistinguishable from a machine holding no memory (PC-INV-1 violation, live). **Unverified suspicion:** `wmic` is deprecated/absent on recent Windows 11, which would make (b) permanent on your box. Check before trusting any attribution. |
| 2026-08-18 | P3 IMPLEMENTED | `lib/pressure-window.js` 1.0.0, 16 tests. Joins event_log + instance_snapshot holders + CFR/RFR2 field + bep_patterns, orders by eventTs, writes nothing, and states its own gaps. Status → Implemented for P3; P0/P1/P2 still open. |
| 2026-08-18 | P4 PARTIAL | CLI `cli/pressure.js` and UI `ui/pressure/index.html` built over cortex's existing `/api/memory` contract — no new API route added (§16.5, §10.3). PC-007 (replay against the real 16:30:57 rows) NOT yet run: those rows are on James's machine, not in the uploaded snapshot. |

## §6 Rejected alternatives (§17.3)

- **A new performance monitoring service.** Rejected: §16.7 — it would add more
  than it removes, and §10.3 — a second measurer of the same thing is a
  competing truth layer. The existing monitor is real and correct; it is
  under-reported, not wrong.
- **Watching only node processes.** Rejected on evidence: node is 509 MB of a
  6.9 GB problem. A node-only view reproduces the exact mistake this spec was
  written because of.
- **Auto-killing the largest holder under critical pressure.** Rejected for
  now: it acts on an attribution that has never once been proven correct. P1's
  gate must pass first, and it belongs to a separate spec with its own gate.
- **Trimming JAA preloads as the pressure fix.** Rejected on evidence — it was
  my own recommendation on 2026-08-18 and the Task Manager capture disproved it.
  Recorded here rather than quietly dropped (§0.3, §7.4 — dead branches are
  data).
