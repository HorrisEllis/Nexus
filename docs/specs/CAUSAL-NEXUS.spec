# CAUSAL NEXUS
**UUID:** nexus-sys-causal-nexus-0000-2026-0531-005
**Layer:** 7 — versioning/signal
**Port:** none
**Status:** active — expanded v9.0
**Source:** NEXUS-CAUSAL.spec, NEXUS-SPEC-v9.spec, MASTEVOS-v9.spec

---

## What it is

Two deeply coupled systems in one:
1. **SNR Gate** — signal-to-noise quality gate (plugin host). Every signal entering the system passes through here.
2. **Causal Nexus** — sigma/delta/causality computation substrate. Tracks divergence, computes stability scores, triggers snapshots.

The Causal Nexus is also the **system-wide backup engine** (v9.0).

**Backup philosophy:** Everything gets backed up ONCE. After the initial backup, only SIGMAs trigger new revision snapshots. A sigma is a meaningful change: `surpriseScore > 0.7`, regime shift, anomaly, breakthrough, divergence from baseline. Routine operations do NOT generate new backups — they are already backed up.

---

## Axioms

| Axiom | Rule |
|-------|------|
| LOOP_IS_SOVEREIGN | `Co → I → In → O → Co` cannot be broken |
| NOISE_IS_LOGGED | Nothing is silently dropped |
| SIGNAL_WINS | When in doubt, pass signal, log noise |
| §A-5 | Signal before noise. SNR gate is the last thing before output. |
| §K7 | All errors surface as events, never uncaught throws. |
| §M2 | Failures are first-class data. |

**Kernel invariants:**
```
KERNEL_ID:         snr-kernel-emerge-v1.0.0
MAX_COMPARTMENTS:  1024
SNR_FLOOR:         0.0
SNR_CEILING:       1.0
```

---

## What it does

### SNR Gate — plugin host

The quality gate for all signals entering the system. Not just a filter — a plugin host.

**SNR Gate plugins:**
| Plugin | Role | Fires on |
|--------|------|----------|
| RAID | Dynamic API-to-API routing | Passing signals with agent routing intent |
| GapHunter | Gap detection and classification | Any signal with structural anomaly |
| parser | Intent parsing | Raw text signals |
| translator | Intent translation (raw → IR) | Parsed intents |
| load_balancer | Agent load balancing | Routed agent calls |

**Signal score (multi-dimensional composite):**
```
raw_snr:         [0.0, 1.0]  weight: 0.35
fidelity:        [0.0, 1.0]  weight: 0.20  (compartment structural memory)
integrity:       [0.0, 1.0]  weight: 0.15  (kernel integrity at ingest)
polarity_weight: [-1.0, 1.0] weight: 0.10  (POSITIVE=+1, NEGATIVE=-1, NEUTRAL=0)
oscillation:     [0.0, 1.0]  weight: 0.10  (where in cycle signal arrived)
recency:         [0.0, 1.0]  weight: 0.10  (decay-weighted, fresh = higher)
composite:       weighted mean of above
```

**Gate pipeline (8 stages):**
1. Ingest — assign intake timestamp, log to `event_log` (§LAW II)
2. Integrity check — `score < 0.5` → halt + `integrity.failed`
3. Fidelity check — compartment structural memory for source
4. Oscillation check — phase alignment
5. Score — compute composite signal score
6. Threshold — `score ≥ SNR_THRESHOLD` → pass. Below → drop + log noise
7. Trust update — update `Beta(α,β)` for source, write `snr_records`
8. Route — dispatch to downstream plugins

**Oscillation:** Period 1000ms, amplitude [0,1], damping 0.98. Phase-lock threshold 0.05 (compartments within 0.05 phase → lock). The kernel breathes — oscillation is the heartbeat.

**Fidelity:** Structural memory [0,1]. Reinforced on `signal.pass`, eroded on `signal.noise`. High fidelity (>0.8) = stable, trusted, well-calibrated. Low fidelity (<0.2) = drifting.

**NEXUS SNR normalization:**
```
agent_responses:   0.7–1.0  (high signal)
crystal_formed:    0.9–1.0  (very high signal, stable knowledge)
gap_events:        0.4–0.6  (mid — system correcting)
failures:          0.1–0.3  (low signal, noise)
target_pass_rate:  40–60% in a healthy system
```

### Bayesian Trust Model

**Model:** `Beta(α, β)` running inference. Prior: `Beta(1,1)` — uniform, no assumption.
**Update:** all 8 SNR gates pass AND `snrValue ≥ threshold` → `α += 1`. Anything else (even 7 of 8 gates) → `β += 1`.
**Score:** `E[θ] = α / (α + β)`
**Routing weight:** Wilson lower bound (conservative under uncertainty)

**Decay:** half-life 7 days. `effectiveN = confidence_n × exp(-age / halflife)`. Read-time only — never modifies alpha/beta.

**Trust bands:**
| Range | Label | RAID weight |
|-------|-------|-------------|
| [0.00, 0.35) | LOW | 0.2 |
| [0.35, 0.60) | PROVISIONAL | 0.6 |
| [0.60, 0.80) | TRUSTED | 1.0 |
| [0.80, 1.00] | HIGH | 1.2 — crystal fast-path |

**Cold start floor:** `confidence_n < 5` → weight 0.2 regardless of score.

**Invariants:**
- `Beta(α,β)` is the only trust representation — never assigned, always derived
- `α` and `β` are strictly non-decreasing
- Every trust update = exactly one `snr_records` row
- All consumers read `trust_scores`, not `snr_records`
- Decay is read-time only — never writes

### Topo-wire — foundation/topo-wire.js (Phase 10)

Bridge between `event_log` and 8-gate SNR pipeline. Polls every 1500ms. Reads `event_log`, writes `snr_records` + `shape_samples`. Stub mode: if topo-kernel unavailable → single-gate Bayesian accumulator.

### IME-wire — foundation/ime-wire.js (Phase 10)

Behavioral profile builder per source UUID. Polls every 2500ms. Builds `event_type_counts` + `baseline_hash` per source. Anomaly → `gap.found` (type `ime_anomaly`). After ~1 week: every agent/module has a behavioral baseline.

### Delta Engine — core/delta/index.js (Phase 10)

Divergence between consecutive agent responses.
```
surpriseScore = 1 - max(similarity_to_prev)
surpriseScore > 0.7 → sigma spike → versionium auto-commits (breakthrough)
surpriseScore < 0.1 → flag potential stuck loop → gap.found
```

### Orion Pipeline (4-stage quality gate)

```
sensor  — reads bridge_messages, writes orion_sessions (status: buffering → measured)
record  — reads orion_sessions (measured), writes (recorded)
policy  — reads (recorded) + trust_scores, min_trust 0.55, min_confidence_n 20, writes (policy_applied)
verify  — reads (policy_applied), agreement_threshold 0.60, writes (verified|rejected) + seam_records
```
**Crystal rule:** crystals only crystallize beliefs from verified seams.

### Causal Graph — foundation/kernel.js

In-memory causal graph. Every event links to parent (`causedBy`) and semantic associations (`relatedTo[]`). LatticeIndex persists to JAA every 500 events.

**API:** `kernel.descendants(eventId, maxDepth=10)`, `kernel.ancestors(eventId, maxDepth=20)`, `kernel.related(eventId)`

### Shape Sampler — foundation/shape-sampler.js

Computes every 100 ticks:
```
sigma:         [0.0, 1.0]  friction coefficient (event latency variance + retry + gap density)
delta:         [0.0, 1.0]  deviation from expected behavior
slope:         [-1.0, 1.0] drift direction (positive=improving)
oscillation:   { frequency, amplitude, stable }  (stable=false = thrashing)
snr:           [0.0, 1.0]  signal-to-noise ratio (below 0.3 = noise-dominated)
compatibility: { fingerprint[], minCompatScore, incompatibleWith[] }
```
Noise types excluded from computation: `nexus.cli.pulse`, `admin.sse.connected`, `admin.sse.disconnected`, `bus.log.written`

### Backup Engine (v9.0)

**Algorithm:**
1. First run → full snapshot of all JAA tables → `.nex` (type=compartment-snapshot)
2. On sigma spike (`sigma > 0.7`): compute delta from last backup → if `delta > threshold`: new revision `.nex`, else: log as minor change
3. File history: deduped against last snapshot, only changed content written to new revision
4. Every backup `.nex` linked to a Versionium commit. Causal chain preserved.
Toast: `toast.snapshot` GREY on every commit.

### Sigma Detector — causal-nexus/sigma/index.js

Regime classifier from `shape_samples`.
Regimes: `stable | degrading | anomaly | diverging | recovering`
Triggers: `sigma > 0.7` → versionium auto-commit, `surprise_score > 0.7` → breakthrough, regime change → backup trigger.

**CLI:**
```
nexus sigma status
nexus sigma history [n]
nexus sigma threshold set <value>
nexus snr status / source <uuid> / trust / drops
nexus ime profile <uuid> / trust <uuid> / anomalies / profiles
nexus delta status / agent <uuid> / breakthroughs / creativity
nexus causal trace <uuid> / regime / sigma / compatibility <a> <b>
nexus backup status / now [--full] / list / restore <id> / diff <a> <b>
nexus ledger tail / query <pattern> / trace <uuid> / chain <uuid>
nexus trace <uuid> / chain <uuid> / descendants <uuid>
```

---

## JAA Tables

```
snr_records      — SNR gate evaluations, one per event
trust_scores     — Beta trust model, one per sourceId (upserted)
shape_samples    — sigma/delta/slope/snr per module per 100 ticks
delta_records    — surprise scores between consecutive responses
ime_profiles     — behavioral profiles per source UUID
orion_sessions   — 4-stage quality gate sessions
seam_records     — multi-AI structural diffs, verified by Orion
sigma_records    — regime classifier output (NEW v9.0)
backup_records   — backup metadata (NEW v9.0)
file_change_log  — file system change events (NEW v9.0)
causality_nodes  — per-event causal graph nodes
```

---

## What it does NOT do

- Does not store agent memory — Cortex does
- Does not build specs — Idearium does
- Does not manage idea lifecycle — Idearium does
- Does not allow hard-deletion of backup `.nex` files — only forks
- Does not modify the original `.nex` — ever
- Does not generate new backups on routine operations — only sigma spikes
- Does not allow modules to bypass the SNR gate — every signal passes through
- Does not use external ML — everything is Bayesian inference on JAA rows
- Does not block on trust score being low — it adjusts routing weight instead
- Does not expose trust scores from `snr_records` directly — consumers read `trust_scores` only

---

## Open gaps

| ID | Description | Severity |
|----|-------------|----------|
| G-CAUSAL-01 | SNR Gate plugin host architecture not yet implemented — plugins hard-coded | HIGH |
| G-CAUSAL-02 | snr-kernel.emerge not yet ported to JS | HIGH |
| G-CAUSAL-03 | topo-wire.js not yet connected to topo-kernel in production | HIGH |
| G-CAUSAL-04 | Orion pipeline boot wiring incomplete | MEDIUM |
| G-CAUSAL-05 | IME-wire anomaly detection not yet generating `ime_anomaly` gaps | MEDIUM |
| G-CAUSAL-06 | Seam module not yet verifying multi-AI seams through Orion | MEDIUM |
