# 0.39.188 — per-compartment repo agent in idearium

Commit `7df4cab` · 15 files · +1895 / −5 · tree clean

---

## What shipped

### The agent (`lib/repo-agent.js`)

Each repo compartment in idearium now has its own agent, reachable from an
**Agent** subtab between Intelligence and Versionium.

The design turns on one correction. The obvious way to dispatch "as a hat"
is copilot's own mechanism — `POST /api/agent/switch` to `setCurrentAgent`,
prompt, switch back. That mutates copilot's **one global current agent**, so
every other surface talking to `:3750` at that moment (the tv-shell floating
CLI, the guardian ask box, `intent-hat-router`'s own temporary switches)
lands under this repo's hat mid-flight. A per-compartment agent that hijacks
the host's identity is not compartmentalised; it is the opposite.

A hat's `personaPrompt` is a **string** by `lib/hat-forge.js`'s own schema.
So idearium composes it and sends one ordinary prompt — the same convention
guardian's userscripts already use (`buildContextHeader(intel) + text`) and
`copilot/tool-runtime.js`'s `makeNcpCallModel` builds `fullPrompt` with. No
new dispatch path, no global state touched.

`sessionId` derives from the repo uuid, so each compartment gets its own
continuous conversation in copilot's `_getSession` map — two repos never
share history, the same repo picks up where it left off. The exchange log is
per-compartment too, not merged into cortex's global `chat_log`, and failures
log with the same weight as successes.

### The learning (`lib/repo-hat-memory.js`)

Four closed kinds: `fact`, `convention`, `pitfall`, `correction`. Dedup on
normalised text bumps `occurrences` instead of writing a second row, and
recurrence reaches the prompt (`[seen 5×]`). Corrections rank above anything
the agent concluded itself, and the persona says so in words the model reads.
Capped at 24 in-prompt, with the real total reported honestly rather than the
shown count. Unevidenced observations are marked as weaker.

**Why it is not a hat field.** `personaPrompt` is in `MUTABLE_FIELDS`, so
accreting learning into it works on the first write. It breaks on the second:
`refreshRepoHatPersona()` rewrites that string wholesale, by design, because a
persona still claiming "not indexed yet" after indexing is a lie told to the
agent on every dispatch. Learning stored there dies on the next refresh,
silently, with no error. `buildPersona()` now **composes** grounded atlas
facts + learned observations instead — the only arrangement where both stay
true. There is a test asserting exactly that.

`RH.learn()` records **and** re-composes the live hat, so an observation is
active on the very next dispatch rather than banked in a table nothing reads.

### Toolbar and cleanup

Repo detail swaps Import/Create for **Run · Branch · Diagnose**, driven by the
same `enterRepoDetail` / `openRepoFor` / `exitRepoDetail` trio that already
owns every other detail-vs-library transition. Branch delegates to the
pre-existing `forkApiRepo`; Diagnose reads `repo.verification`'s real L0–L8
tiers plus `repo.scan`, and offers `repo.reindex` — which is also what writes
the first real `atlas.json`.

`cli/clear-idearium.js` clears idearium's ideas / spec library / repos,
dry-run by default.

---

## The bug this session found

`guardian/jaa-store.js:148` derives every row's primary store id as
`row.id || row.key || uuid()`. A field literally named `key` is therefore
silently promoted to the row's identity. Two observations sharing normalised
text but differing in kind collided on one store id and the second overwrote
the first — a real observation lost, no error anywhere.

Found by running the test, not by reading it. Renamed to `dedupKey`, and
documented in the header: **`id` and `key` are reserved field names in that
store, for any table.** That applies well beyond this file.

---

## Honest limits — in the code, not only here

- **`toolScope` is not enforced on this path.** Composing the persona gives
  behavioural constraint — the agent is told what project it is, what has
  actually been indexed, what it has learned, and to stay inside the
  compartment. It does not give capability constraint: the backend resolves
  its own tools and has no idea a hat is involved. An agent that calls a tool
  outside its scope will succeed. `status()` reports
  `toolScopeEnforced: false`; the tab says so too. Closing this needs a
  per-request hat parameter on the backend — an enforcement upgrade to a
  working agent, not a prerequisite.

- **Run is not wired.** There is no test-env runner anywhere in this
  codebase — grep for `spawn`/`exec` across idearium finds only `tar` in
  spec-engine's archive/restore and agent-suite's CLI shell-out. The button
  ships in its final position wearing `.tb-unwired` and says so on click.
  Wiring it is a decision about isolation, not a missing function: temp-copy
  spawn with a timeout, restricted cwd with scrubbed env, or a container.

- **`.hat` / `.agent` node files still do not exist.** Hats live only as rows
  in `forged_hats`. Nothing materialises them as nodes — which is what would
  make a compartment agent portable between machines. The model to serialise
  is now well-defined: the hat row + its observation set + its exchange log.

---

## Verification

| suite | result |
|---|---|
| `test-repo-toolbar-mode` | 23 / 23 |
| `test-repo-hat-memory` | 35 / 35 |
| `test-repo-agent` | 34 / 34 |
| `lib/repo-hat.smoke.cjs` | clean |
| `test-node-index` | 5 / 5 |
| `test-new-plugins` | 18 / 18 |

All three new suites registered in `run-all.js` (lines 59–61). Every test was
reverted first to confirm it catches its own regression.

`test-repo-agent` stands up a **real** http server on copilot's port and
captures what actually goes over the wire, because the central claim — the
persona reaching the model without the global agent being switched — is not
observable from `dispatch()`'s return value. It asserts the positive (persona
+ compartment id + message in the outgoing prompt) **and** the negative
(`/api/agent/switch` registered on the stub, zero calls). That second one is
what silently regresses the first time someone "fixes" hat application by
reaching for `setCurrentAgent`.

`precommit-check`: 3 no-spec warnings (`divergence-watcher`, `macro-compiler`,
`gap-loop`) reconfirmed pre-existing and non-blocking — not introduced here.

**Version drift, named not reconstructed.** `lib/version.js`'s `system` field
had drifted to `0.39.179` against `package.json`'s `0.39.187`.
`bump-version.py` synced both to `0.39.188` and confirmed exactly one
`system:` key. What shipped in that gap is not reconstructed — guessing would
be worse than leaving it visible.

---

## On arrival

```bash
npm install
node cli/clear-idearium.js            # dry-run first
node cli/clear-idearium.js --apply    # 18 fixture ideas + 34 fixture repo nodes
node run-all.js
```

Then open a repo → **Agent** → *forge this repo's agent*. ERAVOS v3-17
catalog (77 files) is the real target. Diagnose → *re-run pipeline* writes
its first `atlas.json`, which is what the persona grounds itself on — worth
doing before the first prompt, or the agent will correctly tell you it is
working without an index.
