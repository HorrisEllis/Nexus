# MAP — 2026-08-19 — idearium → chunks → agent → nexus loop

**§3.3.** Current state vs. what was asked, written before anything is built.
**Authority:** direct read of `nexus-2026-08-19-hey-nexus-merged`, plus
`MERGE-NOTES-2026-08-19.md`. Nothing from memory (§0.1).

---

## 0. The headline

**Every component you described already exists.** This is a wiring job across
six systems, not a build. §1.1 says nothing exists until proven, so each row
below names the file that proves it.

| what you asked for | exists as | proof |
|---|---|---|
| idea → spec | `idearium/api` `idea.spec`, `spec.create` | api/index.js:714, :790 |
| uploaded `.spec` | `spec-engine.ingestFilesAsSpec()` | repo/index.js:34 |
| co-pilot's speccing tool | `spec-wizard.js` | agent-tools/tools/governance/ |
| the compiler | `idearium/spec-engine/index.js`, `compiler-bridge.js` | present |
| repository compartment, spec as metadata | `idearium/repo/index.js` | redesigned 2026-07-11 **to your exact words** — see §1 |
| chunking | `lib/chunker/`, `lib/chunk-service.js`, `lib/chunk-build-orchestrator.js`, `spec-engine/chunk-dispatch.js` | present |
| build through the pipeline | `spec.build` | api/index.js:817 |
| dispatch to ChatGPT | `buildChunkWithAgent()` → guardian NCP | agent-suite/index.js:209-211 |
| injected into the agent chat | ProviderHost + guardian NCP | wired |
| "hey nexus" from inside the agent | `userscript-nexus-wake.js` → `POST :3750` | wake:175 |
| agent talks to co-pilot the whole way | `copilot/lib/autonomy-router.js` 2.0.0 | present |
| agent proposes improvements | `propose-idea.js` | agent-tools/tools/governance/ |
| full nexus at its disposal | 24+ agent tools across 8 categories | agent-tools/tools/*/ |

**The loop is already closed end to end.** `MERGE-NOTES-2026-08-19.md` records
the wake word being armed in all four provider tabs, `lib/agent-chat.js` built
with a hop cap, and 135 tests passing across the five new suites.

---

## 1. The one that matters most — already built to your words

`idearium/repo/index.js:6-8` carries this, from 2026-07-11:

> "the repo is an archive using the spec, when you access it. the spec is
> supposed to be the metadata. like a compartment with the spec as the
> metadata."

That is the sentence you asked for again today, and the redesign that followed
it is in the tree. The repo has **no content store**: a record is an index entry
(`{repoUuid, specUuid, seam_id, status}`), "access" means resolving `specUuid`
through spec-engine, and integrity is `rootHash` — SHA-256 over canonical JSON.
Two intake paths already exist: **promote** (a manifest exists → index it) and
**drop** (raw files → `ingestFilesAsSpec()` → verify → index).

Nothing needs building here. It needs *calling*.

---

## 2. The actual gaps

### IAP-GAP-1 — ChatGPT is the fallback, not the default
`idearium/agent-suite/index.js:193`:

```js
export async function buildChunkWithAgent(chunkPrompt, { preferAgent = 'ollama' } = {}) {
```

Ollama runs first; ChatGPT is reached only at line 209 as fallback (`command:
'spec', provider: 'chatgpt'` through guardian NCP). You asked for ChatGPT by
default. The path is real and one default away — but changing a default that
silently reroutes every build to a browser tab is a behaviour change with a cost
attached, so it is a decision, not a patch (Q1).

### IAP-GAP-2 — nothing sequences the arc
Every hop exists; **no single addressable job runs idea → spec → compartment →
chunks → dispatch → build → verify → land.** `spec.build` covers the middle.
`repo` covers storage. `chunk-dispatch` covers one chunk's retry. A person (you)
is currently the orchestrator between them, which by §17.8 means it belongs in
the system.

### IAP-GAP-3 — the improvement loop has no gate, and this is the important one
"I want the agent to optimize and improve anything it finds."

Taken literally that is an agent with `safe-apply`, `delete-file`,
`run-command`, `forge-tool` and `nexus-heal` rewriting NEXUS unsupervised.
Three of your own laws refuse it:

- **§7.2** — Idea Ledger entries have no enforcement. Ideas cannot affect runtime.
- **§7.3** — an idea becomes an upgrade only through an explicit validation step.
- **§17.10** — a cheap path may bypass generation. It never bypasses verification.

So the shape is not "can it improve things" but **"where do its improvements
land."** The answer your system already implies: the agent proposes *freely and
without limit* into the Idea Ledger via `propose-idea.js` — no gate on
proposing, because ideas are input (§7.1) — and a real gate decides what
becomes an upgrade. That is not a restriction on the agent's ambition. It is the
difference between an agent that improves NEXUS and one that damages it at 3am
with nobody watching.

`lib/intake.js` (2026-08-18 drop) is the same gate for arriving files:
`stage → verdict → promote(by:'user') → rollback`. It is **not in this merged
tree** — see §4.

### IAP-GAP-4 — the wake loop has no budget
`agent-chat.js` has a hop cap (a provider cannot reappear in its own chain).
There is no cap on *cost*: an agent in a build loop can say "hey nexus" on every
chunk, and each one is a real dispatch. §15.1 requires an iteration budget that
is logged when exhausted. Chunk builds and wake calls are two separate budgets
and neither is bounded across the whole arc.

### IAP-GAP-5 — `resetHint()` is unwired
`MERGE-NOTES` flags it: no provider script has a new-conversation hook, so
`once` means once per tab session, not once per conversation. Harmless now;
it becomes a correctness problem when a long-lived tab runs many builds.

---

## 3. Order of work (§3.1, §16.1 nearest gap)

1. **IAP-GAP-3 first.** The gate must exist before the loop runs, not after.
   Building the orchestrator first means the first thing it orchestrates is
   ungoverned self-modification.
2. **IAP-GAP-4** — budgets, for the same reason.
3. **IAP-GAP-2** — the orchestrator, once there is something safe to orchestrate.
4. **IAP-GAP-1** — the default flip, once budgets make its cost visible.
5. **IAP-GAP-5** — the loose end.

---

## 4. Drift found while mapping (§13.4)

- `lib/hat-forge.js` in the merged tree has `seedKey` (25 occurrences) — the
  2026-08-18 identity patch **landed**.
- `lib/intake.js` and `lib/pressure-window.js` are **absent**. The merge started
  from `nexus-2026-08-18-freeze-thaw.zip`, which predates them. Not a problem —
  but IAP-GAP-3's gate depends on `intake.js`, so it needs to be in the tree
  before the pipeline spec's P1 can be built.

---

## 5. Open questions (§0.1 — named, not guessed)

- **Q1.** Flip `preferAgent` to `'chatgpt'` globally, or per-job with ollama
  staying the default for cheap chunks? A global flip routes every build through
  a browser tab — slower, rate-limited, and it consumes the same tab you use.
- **Q2.** When the agent proposes an improvement to NEXUS itself, does it land
  as an Idea Ledger entry only, or as a staged intake drop with a real diff?
  The second is more useful and much more dangerous.
- **Q3.** What is the iteration budget per build — chunks, wake calls, total
  dispatches — and what happens at exhaustion: stop, or ask you?
