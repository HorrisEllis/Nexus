# MAP — 2026-08-18 — pressure causality + Clear Glass toolkit

**§3.3.** Current state vs. what was asked, written before anything is built.
**Authority for every line below:** direct read of the tree at `6e9051c`, the
2026-08-18 16:27–20:05 autopilot log, and the Task Manager capture at ~20:07.
Nothing here is from memory (§0.1).

---

## 0. A correction I owe you first (§0.1, §0.0)

Last message I told you the memory pressure that crashed copilot, diagnostic
and orchestrator at 16:30:57 was "nine processes each loading the whole JAA
store." **The Task Manager capture disproves that.**

| group | processes | memory |
|---|---:|---:|
| Electron | 14 | **6,897.1 MB** |
| — largest single Electron process | 1 | 4,951.7 MB |
| — `NEXUS — Clear Glass` | 1 | 1,596.9 MB |
| Node.js JavaScript Runtime | 13 | **509.0 MB** |
| Firefox | 21 | 743.7 MB |

The thirteen node processes — every NEXUS service, each holding its JAA copy —
total **509 MB**, about 39 MB each. That is roughly what `cortex/memory/jaa-db.js`'s
own 2026-07-24 comment measured, and it is **7% of the Electron footprint**.
Electron is 93% of it.

I reached for the explanation already written in your codebase instead of
measuring. Acting on what I said would have had you trimming JAA preloads to
recover tens of MB against a ~6.9 GB problem — §16.1's nearest gap, missed by
looking at the wrong system entirely. `jaa-db.js`'s comment is not wrong about
its own numbers; it is wrong as a diagnosis of *system* pressure, and I
repeated it as one.

**Where the 6.9 GB actually comes from, and what is still unproven.** Proven:
`providers/host.js` pre-warms four provider tabs at boot (claude, chatgpt,
gemini, perplexity — the log shows all four spawning 16:27:39–16:27:49), each a
full Chromium renderer against a heavy SPA, each with a persistent session
partition. Not yet proven: which of the 14 Electron processes is the 4,951.7 MB
one. Task Manager's flat list does not say. That is the first measurement the
spec below has to make, and it is exactly the thing §17.11 says a claim must
name before it is trusted.

---

## 1. Ask: "monitor performance — events, causes leading up to the pressure spike, using RFR2 and the intelligence system"

### What already exists, verified

| component | state | evidence |
|---|---|---|
| `lib/resource-monitor.js` | **real, running** | samples every 10s; classifies ok/pressure/critical; emits `nexus.resource.pressure` (line 176) |
| pressure thresholds | **real** | `freeMemWarnPct 0.20`, halt 0.10 (lines 44–48) |
| per-process sampling | **real but self-only** | `process.memoryUsage()` for *its own* pid (line 84); the header comment at line 31 says the supervisor collects children's — that is the claim to check |
| `nexus.resource.pressure` consumers | **3 real** | `cortex/self-heal/escalation.js`, `orchestrator.js`, `lib/agent-system/contracts.js` |
| RFR2 | **real** | `lib/rfr2-bridge.js`; log shows live depth/support on every crystallised pattern |
| CFR regime + friction | **real** | log shows `regime=ordered, friction=0.2952…` attached to patterns |
| intelligence pattern crystalliser | **real, and already finding this** | log 16:27:41.284 — `cross_system_causal — nexus.resource.pressure::provider.host.starting`; also `ledger.guardian.updated::nexus.resource.pressure`, `ledger.bridge.updated::nexus.resource.pressure`, `ledger.diagnostic.dangling-hook::nexus.resource.pressure` |
| sigma writer | **real** | `warn:0.5 halt:0.7 composite_interval:30000ms` |
| component-ledger | **real** | 1,258 rows by 16:31 |

**The engine you asked for is already running and already answering.** The
16:27:41 lines are the intelligence system stating, unprompted, that
`provider.host.starting` is causally linked to `nexus.resource.pressure` — the
correct answer, found by your own system, an hour before the Task Manager
capture confirmed it.

### The actual gaps

- **PC-GAP-1 — there is no retrospective query.** Patterns crystallise forward
  into `bep_patterns`; nothing answers "what happened in the 120s before *this*
  spike." §11.1 says a fault cannot be understood without the field it occurred
  in. Both halves exist and are never joined at query time.
- **PC-GAP-2 — the crash was never an event.** `copilot`, `diagnostic` and
  `orchestrator` exited `3221226505` (`0xC0000409`, stack buffer overrun) at
  16:30:57. Autopilot printed it and restarted them. It is **not** in the
  causal record with its field conditions — the single most informative event
  of the whole session is the one the causal substrate never saw. §11.1, §17.6.
- **PC-GAP-3 — pressure is level-only, never attributed.** The monitor reports
  *that* free memory is 0.2%. It never reports *who holds it*. With no
  per-process attribution, every downstream consumer — escalation, sigma, the
  intelligence layer — is reasoning about a scalar. This is precisely the hole
  I fell into.
- **PC-GAP-4 — `resource-monitor.js:31` states child collection as fact.** The
  supervisor collecting children's `memoryUsage()` is claimed in a comment. To
  be checked, not assumed — the same shape as `loom-map.js:74`'s "already
  supports this via `JAA_DATA_DIR`", which described an intention as a fact and
  went unnoticed for weeks.
- **PC-GAP-5 — a §17.7 promotion is due.** `0xC0000409` appears in the
  2026-07-24 boot log *and* in this one. Second occurrence promotes it to
  investigation.

### What must NOT be built

A new monitoring engine. §16.5, §16.7, §5.5. The substrate is there; what is
missing is a **window query** and an **attribution field**. Anything larger
fails §16.7 — it would add more than it removes.

---

## 2. Ask: "full extended kit of tools for clear-glass — screenshot to upload or inject into agent, give you eyes, test UI, element picker"

### What already exists, verified

`clear-glass/src/copilot/tools.js` declares **71 tools**.
`clear-glass/src/driver/index.js` serves **26** by dispatch case:

```
navigate click type scroll hover wait waitFor screenshot eval getUrl getTitle
back forward reload cookies.get cookies.set cookies.clear storage.get
storage.set network.block network.intercept picker.enable picker.disable
inject record.start record.stop
```

Every headline item in your ask is already there:

| you asked for | status |
|---|---|
| screenshot | **built** — `_screenshot()` line 203, `wc.capturePage(rect)`, returns base64 PNG |
| element picker | **built** — `picker.enable` / `picker.disable`, plus `dom.pick`, `dom.highlight` |
| inject into agent | **built** — `inject`, `eval`, `dom.mutate` |
| test UI | **built** — `record.start` / `record.stop` returns a replayable action sequence |

### The actual gap — one wire, not a kit

`_screenshot()` returns base64 and emits `driver.screenshot` on SSE. **Nothing
in the tree listens for it** — the only file mentioning `driver.screenshot` is
the file that emits it (checked, zero other hits). So:

- **CG-GAP-1 — a screenshot has no destination.** It cannot reach a provider
  composer as an attached image, and it cannot reach me. The eyes exist; the
  optic nerve does not.
- **CG-GAP-2 — the picker has no return path.** `picker.enable` shows the
  overlay; what you click is registered as a hook by `dom.pick`, but nothing
  carries the pick into a conversation as context.
- **CG-GAP-3 — 71 declared vs 26 served.** 45 tools are declared and may or may
  not be served elsewhere. Handing an agent a tool that leads nowhere is the
  exact failure `capability-tools.js` already names for the 16 declared-and-
  unserved capabilities. This needs an audit before any tool is added.

### What must NOT be built

A "full extended kit." §1.1 and §16.5: the kit exists. Building a second one
produces two drifting copies (§10.3) of a capability you already have. The
nearest gap (§16.1) is CG-GAP-1 — one destination for an image that is already
being captured.

---

## 3. Order of work (§3.1 bottom-up, §16.1 nearest gap)

1. **PC-GAP-4** — check whether child `memoryUsage()` is actually collected.
   Cheapest, and it decides the shape of everything after it.
2. **PC-GAP-3** — per-process attribution on the pressure sample.
3. **PC-GAP-2** — supervisor exit becomes a real event with field conditions.
4. **PC-GAP-1** — the window query over what already crystallises.
5. **CG-GAP-3** — audit 71 declared vs served, before adding anything.
6. **CG-GAP-1** — the one wire.

Steps 1–4 are `docs/pressure-causality.spec`. Steps 5–6 are
`docs/clear-glass-toolkit.spec`. Neither has code in this drop, per §8.5:
nothing is built without a spec first.

---

## 4. Open questions (§0.1 — named, not guessed)

- **Q1.** Should the four provider tabs still pre-warm at boot? Dropping to
  on-demand is the single largest available memory win, and it is a behaviour
  change to something you use. Not mine to decide (Leverage Principles —
  invention is proposed, not shipped as a surprise).
- **Q2.** Is `0xC0000409` reproducible on demand, or only under pressure? It
  determines whether PC-GAP-2 needs a crash-time snapshot or a periodic one.
- **Q3.** Screenshot destination for CG-GAP-1 — into the provider composer as
  an attached image, into the intake pipeline as a staged artifact, or both?
